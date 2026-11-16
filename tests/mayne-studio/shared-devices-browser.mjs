import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const repo = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const root = resolve(repo, 'public');
const mime = { '.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png',
  '.webp':'image/webp','.jpg':'image/jpeg','.wasm':'application/wasm' };
const server = createServer(async (req, res) => {
  try {
    const relative = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const base = relative.startsWith('/src/mayne-studio/') ? repo : root;
    const file = resolve(base, '.' + (relative === '/' ? '/index.html' : relative));
    if (file !== base && !file.startsWith(base + sep)) { res.writeHead(403).end(); return; }
    let bytes = await readFile(file);
    if (relative === '/src/mayne-studio/app.js') {
      const source = bytes.toString('utf8');
      const old = "else new Studio($('studio')).start();";
      assert.ok(source.includes(old), 'Studio test hook exists');
      bytes = Buffer.from(source.replace(old,
        "else { window.__qaStudio = new Studio($('studio')); window.__qaStudio.start(); }"));
    }
    res.writeHead(200, {'Content-Type':mime[extname(file)] ?? 'application/octet-stream'}).end(bytes);
  } catch (error) { res.writeHead(404).end('Not found'); }
});
await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
const url = 'http://127.0.0.1:' + server.address().port + '/mayne-studio.html';
let browser;
try {
  browser = await chromium.launch({ headless:true, args:[
    '--no-sandbox', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream',
  ] });
  const context = await browser.newContext({viewport:{width:1440,height:950},
    permissions:['camera','microphone']});
  await context.route('**/assets/mayne-studio-app.js',route=>route.fulfill({
    status:200, contentType:'text/javascript',body:'import "/src/mayne-studio/app.js";',
  }));
  const page=await context.newPage();
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(url);
  await page.waitForFunction(()=>!!window.__qaStudio?.project);
  await page.evaluate(async()=>{
    const layer=(id,source,x,y,w,h)=>({id,source,x,y,w,h,visible:true,opacity:100,
      fit:'cover',page:0,matte:'off',key:'#00a040',coverage:'balanced',mirror:false});
    const project={
      id:'shared-devices-test',name:'Shared Device Test',version:1,updated:Date.now(),
      sources:[
        {id:'shared-camera',type:'camera',name:'Main instructor camera',device:'',gain:0},
        {id:'shared-mic',type:'mic',name:'Main instructor microphone',device:'',route:'scene',gain:0},
      ],
      scenes:[
        {id:'standby',name:'Standby',template:'standby',background:'black',
          title:'Standby',caption:'',backdrop:'',layers:[]},
        {id:'presenter',name:'Presenter',template:'presenter',background:'studio',
          title:'Instructor',caption:'',backdrop:'',layers:[
            layer('original-camera','shared-camera',61,17,32,62),
            layer('original-mic','shared-mic',0,0,100,100)]},
        {id:'slides',name:'Slides',template:'slides',background:'navy',
          title:'',caption:'',backdrop:'',layers:[]},
      ],
      overlays:[],transition:'cut',duration:450,master:0,masterMute:false,timerSeconds:300,
    };
    const db=await new Promise((resolve,reject)=>{
      const req=indexedDB.open('mayne-production-studio',1);
      req.onupgradeneeded=()=>{
        req.result.createObjectStore('projects',{keyPath:'id'});
        req.result.createObjectStore('files');
      };
      req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
    });
    await new Promise((resolve,reject)=>{
      const tx=db.transaction('projects','readwrite');
      tx.objectStore('projects').put(project);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
    });
    db.close();
    localStorage.setItem('mayne-studio-project',project.id);
  });
  await page.reload();
  await page.waitForFunction(()=>window.__qaStudio?.project?.id==='shared-devices-test');

  await page.evaluate(()=>{
    window.__captureRequests=0;
    const original=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia=(...args)=>{
      window.__captureRequests++;
      return original(...args);
    };
  });
  assert.equal(await page.evaluate(()=>window.__qaStudio.project.scenes[0].layers.length),0,
    'Older projects initially retain their prior scene-specific device placement');

  // Connect from the actual Scene Settings UI; the connection must become global.
  await page.locator('[data-act="scene-tools"][data-id="presenter"]').click();
  const settings=page.locator('#studio-tools');
  await settings.waitFor({state:'visible'});
  await settings.locator('[data-act="select-layer"][data-id="original-camera"]').click();
  await settings.locator('[data-act="connect"][data-id="shared-camera"]').click();
  await page.waitForFunction(()=>window.__qaStudio.media.get('shared-camera')?.state==='ready');
  assert.deepEqual(await page.evaluate(()=>{
    const studio=window.__qaStudio, scenes=studio.project.scenes;
    return {
      links:scenes.map(scene=>scene.layers.filter(layer=>layer.source==='shared-camera').length),
      presenter:scenes[1].layers.find(layer=>layer.source==='shared-camera').x,
      defaultInset:scenes[0].layers.find(layer=>layer.source==='shared-camera').x,
      programLayer:studio.program.scene.layers.some(layer=>layer.source==='shared-camera'),
      programSource:studio.program.sources.has('shared-camera'),
      tracks:studio.media.get('shared-camera').stream.getVideoTracks().length,
    };
  }),{links:[1,1,1],presenter:61,defaultInset:74,programLayer:true,programSource:true,tracks:1},
    'One connected camera is linked across all scenes, with original presenter framing preserved');

  await settings.locator('[data-act="select-layer"][data-id="original-mic"]').click();
  await settings.locator('[data-act="connect"][data-id="shared-mic"]').click();
  await page.waitForFunction(()=>window.__qaStudio.media.get('shared-mic')?.state==='ready');
  const devices=await page.evaluate(()=>{
    const studio=window.__qaStudio;
    return {
      microphoneRoute:studio.project.sources.find(s=>s.id==='shared-mic').route,
      micLayers:studio.project.scenes.map(s=>s.layers.filter(l=>l.source==='shared-mic').length),
      cameraReady:studio.media.get('shared-camera').state==='ready',
      micReady:studio.media.get('shared-mic').state==='ready',
      captureRequests:window.__captureRequests,
      audioTracks:studio.media.get('shared-mic').stream.getAudioTracks().length,
    };
  });
  assert.equal(devices.microphoneRoute,'always','Microphone audio no longer follows a specific scene');
  assert.deepEqual(devices.micLayers,[1,1,1]);
  assert.equal(devices.cameraReady,true);
  assert.equal(devices.micReady,true);
  assert.equal(devices.captureRequests,2,'One getUserMedia request for each shared input');
  assert.equal(devices.audioTracks,1);

  // Switching Program and Preview never opens additional device streams.
  await settings.locator('[data-act="close-tools"]').click();
  for(const next of ['slides','presenter','standby','slides']) {
    await page.evaluate(id=>{window.__qaStudio.setPreview(id);window.__qaStudio.take('cut');},next);
    const status=await page.evaluate(()=>{
      const studio=window.__qaStudio;
      return {
        camera:studio.program.scene.layers.filter(l=>l.source==='shared-camera').length,
        mic:studio.program.scene.layers.filter(l=>l.source==='shared-mic').length,
        cameraLive:studio.media.get('shared-camera')?.stream.active,
        microphoneLive:studio.media.get('shared-mic')?.stream.active,
        requests:window.__captureRequests,
      };
    });
    assert.equal(status.camera,1,'Camera appears on Program scene '+next);
    assert.equal(status.mic,1,'Microphone is linked to Program scene '+next);
    assert.equal(status.cameraLive,true,'Same camera stream stays active on '+next);
    assert.equal(status.microphoneLive,true,'Same microphone stream stays active on '+next);
    assert.equal(status.requests,2,'Switching scenes must not reopen a device');
  }

  // Existing and newly created scenes retain their own camera placement.
  await page.evaluate(()=>{
    const studio=window.__qaStudio;
    studio.project.scenes[0].layers.find(l=>l.source==='shared-camera').x=28;
    studio.shareLiveDevice();
  });
  assert.equal(await page.evaluate(()=>window.__qaStudio.project.scenes[1]
    .layers.find(l=>l.source==='shared-camera').x),61,
    'Editing camera position in Standby does not change Presenter position');
  await page.evaluate(()=>window.__qaStudio.sceneDialog(true));
  const newScene=page.getByRole('dialog',{name:'Add scene'});
  await newScene.locator('[name="template"]').selectOption('blank');
  await newScene.locator('[name="name"]').fill('Live Q&A');
  await newScene.getByRole('button',{name:'Add scene'}).click();
  assert.deepEqual(await page.evaluate(()=>{
    const studio=window.__qaStudio;
    const scene=studio.project.scenes.find(s=>s.name==='Live Q&A');
    return [scene.layers.filter(l=>l.source==='shared-camera').length,
      scene.layers.filter(l=>l.source==='shared-mic').length,
      window.__captureRequests];
  }),[1,1,2],'New scenes instantly include already-connected camera and microphone');

  // Reconnection never adds duplicate layers or opens another stream if already ready.
  await page.evaluate(async()=>{
    const studio=window.__qaStudio;
    await studio.connectInput(studio.source('shared-camera'));
    await studio.connectInput(studio.source('shared-mic'));
  });
  assert.equal(await page.evaluate(()=>window.__captureRequests),2);
  await page.locator('[data-act="save"]').click();
  await page.locator('#save-state').getByText('Saved on this device').waitFor({timeout:12000});
  await page.reload();
  await page.waitForFunction(()=>window.__qaStudio?.project?.id==='shared-devices-test');
  assert.equal(await page.evaluate(()=>{
    const studio=window.__qaStudio;
    return studio.project.scenes.every(scene=>
      scene.layers.filter(l=>l.source==='shared-camera').length===1 &&
      scene.layers.filter(l=>l.source==='shared-mic').length===1);
  }),true,'Global device links and per-scene positions persist after saving and reloading');
  assert.equal(await page.evaluate(()=>window.__qaStudio.media.get('shared-camera')),undefined,
    'Browser camera permissions are reconnected explicitly after a page reload');

  assert.deepEqual(errors,[],'No uncaught errors during camera/mic sharing and scene switching');
  console.log('Global camera/mic: one capture each, all scenes, immediate Program, independent placement, new scenes, persistence passed.');
  await context.close();
} finally {
  if (browser) await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
