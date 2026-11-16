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
        {id:'camera-A',type:'camera',name:'Camera A',device:'',gain:0},
        {id:'camera-B',type:'camera',name:'Camera B',device:'',gain:0},
        {id:'camera-C',type:'camera',name:'Camera C',device:'',gain:0},
        {id:'shared-mic',type:'mic',name:'Instructor microphone',device:'',route:'scene',gain:0},
      ],
      scenes:[
        {id:'studio1',name:'Studio 1',template:'presenter',background:'studio',
          title:'',caption:'',backdrop:'',layers:[
            layer('a-in-studio1','camera-A',21,18,58,70),
            layer('mic-in-studio1','shared-mic',0,0,100,100)]},
        {id:'studio2',name:'Studio 2',template:'presenter',background:'studio',
          title:'',caption:'',backdrop:'',layers:[layer('b-in-studio2','camera-B',54,16,37,70)]},
        {id:'studio3',name:'Studio 3',template:'presenter',background:'studio',
          title:'',caption:'',backdrop:'',layers:[layer('c-in-studio3','camera-C',13,22,61,54)]},
        {id:'studio4',name:'Studio 4',template:'blank',background:'black',
          title:'',caption:'',backdrop:'',layers:[
            layer('old-auto-inset','camera-A',74,53,22,36)]},
        {id:'studio5',name:'Studio 5',template:'presenter',background:'studio',
          title:'',caption:'',backdrop:'',layers:[layer('a-in-studio5','camera-A',43,22,43,58)]},
        {id:'studio6',name:'Studio 6',template:'presenter',background:'studio',
          title:'',caption:'',backdrop:'',layers:[layer('a-in-studio6','camera-A',36,12,51,76)]},
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
  // Reconnect source A from the scene where it is actually assigned.
  // Connecting must NEVER insert A into scenes belonging to other cameras.
  await page.locator('[data-act="scene-tools"][data-id="studio1"]').click();
  const settings=page.locator('#studio-tools');
  await settings.waitFor({state:'visible'});
  await settings.locator('[data-act="select-layer"][data-id="a-in-studio1"]').click();
  await settings.locator('[data-act="connect"][data-id="camera-A"]').click();
  await page.waitForFunction(()=>window.__qaStudio.media.get('camera-A')?.state==='ready');
  const membership=await page.evaluate(()=>{
    const s=window.__qaStudio;
    return s.project.scenes.map(scene=>scene.layers
      .filter(layer=>s.source(layer.source)?.type==='camera')
      .map(layer=>s.source(layer.source).name));
  });
  assert.deepEqual(membership,[
    ['Camera A'],['Camera B'],['Camera C'],['Camera A'],['Camera A'],['Camera A'],
  ],'Connecting Camera A does not create it in scenes belonging to B or C');
  assert.equal(await page.evaluate(()=>window.__qaStudio.project.scenes[0]
    .layers.find(l=>l.source==='camera-A').x),21,
    'Studio 1 keeps its independently edited camera framing');
  assert.equal(await page.evaluate(()=>window.__captureRequests),1);
  await settings.locator('[data-act="select-layer"][data-id="mic-in-studio1"]').click();
  await settings.locator('[data-act="connect"][data-id="shared-mic"]').click();
  await page.waitForFunction(()=>window.__qaStudio.media.get('shared-mic')?.state==='ready');
  assert.equal(await page.evaluate(()=>window.__qaStudio.source('shared-mic').route),'always');
  assert.deepEqual(await page.evaluate(()=>window.__qaStudio.project.scenes
    .map(scene=>scene.layers.filter(l=>l.source==='shared-mic').length)),
    [1,0,0,0,0,0],
    'A globally audible microphone does not need unwanted layers in every scene');
  await settings.locator('[data-act="close-tools"]').click();

  // Camera B and C are independent sources; connecting each on its own scene
  // does not change which scenes contain A, B or C.
  for(const [sceneId,layerId,sourceId] of [
    ['studio2','b-in-studio2','camera-B'],
    ['studio3','c-in-studio3','camera-C'],
  ]){
    await page.locator('[data-act="scene-tools"][data-id="'+sceneId+'"]').click();
    await settings.locator('[data-act="select-layer"][data-id="'+layerId+'"]').click();
    await settings.locator('[data-act="connect"][data-id="'+sourceId+'"]').click();
    await page.waitForFunction(id=>window.__qaStudio.media.get(id)?.state==='ready',sourceId);
    await settings.locator('[data-act="close-tools"]').click();
  }
  assert.equal(await page.evaluate(()=>window.__captureRequests),4,
    'One camera capture request per distinct input plus one microphone request');

  // The previous update could have persisted default inset layers everywhere.
  // A supervised Camera assignments matrix must remove suspected extras
  // without changing intentional or edited camera geometry.
  await page.locator('#manage-cameras').click();
  const matrix=page.getByRole('dialog',{name:'Camera assignments'});
  await matrix.waitFor();
  assert.equal(await matrix.locator('.camera-matrix-head strong').count(),3);
  assert.equal(await matrix.locator('input[name="cam-3-0"]').isChecked(),true,
    'Previous automatic inset is visible for explicit review');
  await matrix.getByRole('button',{name:'Clear default insets'}).click();
  assert.equal(await matrix.locator('input[name="cam-3-0"]').isChecked(),false,
    'Default auto-inset can be unchecked without deleting other cameras');
  assert.equal(await matrix.locator('input[name="cam-0-0"]').isChecked(),true,
    'Custom Studio 1 camera framing stays checked');
  await matrix.getByRole('button',{name:'Apply camera assignments'}).click();
  assert.equal(await page.evaluate(()=>window.__qaStudio.project.scenes[3].layers
    .some(l=>l.source==='camera-A')),false,
    'Confirmed cleanup removes A from Studio 4 only');

  // Actual on-air scenes must display only their own camera sources, while all
  // four already connected device streams remain active across all Takes.
  const expected=new Map([
    ['studio1',['camera-A']],['studio2',['camera-B']],['studio3',['camera-C']],
    ['studio4',[]],['studio5',['camera-A']],['studio6',['camera-A']],
  ]);
  for(const [sceneId,cameraIds] of expected){
    await page.evaluate(id=>{window.__qaStudio.setPreview(id);window.__qaStudio.take('cut');},sceneId);
    const result=await page.evaluate(()=>{
      const studio=window.__qaStudio;
      return {
        cameras:studio.program.scene.layers.filter(l=>l.visible &&
          studio.program.sources.get(l.source)?.type==='camera').map(l=>l.source),
        live:['camera-A','camera-B','camera-C','shared-mic'].every(id=>
          studio.media.get(id)?.stream?.active===true),
        micRoute:studio.source('shared-mic').route,
        requests:window.__captureRequests,
      };
    });
    assert.deepEqual(result.cameras,cameraIds,
      sceneId+' renders ONLY explicitly assigned camera layers');
    assert.equal(result.live,true,'All connected sources stay available across '+sceneId);
    assert.equal(result.micRoute,'always','Microphone stays in Program across Takes');
    assert.equal(result.requests,4,'Switching to '+sceneId+' never reconnects a camera');
  }

  // Switch Studio 6 from A to B using checkbox assignments. Do not change
  // Studio 1 or 5, which deliberately share the original A source.
  await page.locator('#manage-cameras').click();
  await matrix.locator('input[name="cam-5-0"]').uncheck();
  await matrix.locator('input[name="cam-5-1"]').check();
  await matrix.getByRole('button',{name:'Apply camera assignments'}).click();
  assert.deepEqual(await page.evaluate(()=>window.__qaStudio.project.scenes.map(scene=>
    scene.layers.filter(l=>['camera-A','camera-B','camera-C'].includes(l.source))
      .map(l=>l.source))),[
        ['camera-A'],['camera-B'],['camera-C'],[],['camera-A'],['camera-B'],
      ],'Changing one scene to Camera B leaves Studio 1 and Studio 5 using A');
  await page.evaluate(()=>{window.__qaStudio.setPreview('studio6');window.__qaStudio.take('cut');});
  assert.deepEqual(await page.evaluate(()=>window.__qaStudio.program.scene.layers
    .filter(l=>['camera-A','camera-B','camera-C'].includes(l.source)).map(l=>l.source)),
    ['camera-B'],'The Program uses the newly assigned camera after Take');

  // New scenes must start with NO camera unless the operator explicitly
  // chooses an existing source in that scene.
  await page.locator('[data-act="new-scene"]').click();
  const create=page.getByRole('dialog',{name:'Add scene'});
  await create.locator('[name="template"]').selectOption('blank');
  await create.locator('[name="name"]').fill('Studio 7');
  await create.getByRole('button',{name:'Add scene'}).click();
  assert.deepEqual(await page.evaluate(()=>{
    const s=window.__qaStudio, scene=s.project.scenes.find(scene=>scene.name==='Studio 7');
    return [scene.layers.length,window.__captureRequests];
  }),[0,4],'New scenes start empty and do not connect cameras');

  await page.locator('[data-act="scene-tools"]').filter({hasText:'Settings'}).last().click();
  await settings.waitFor({state:'visible'});
  await settings.locator('[data-act="add-context"]').click();
  const add=page.getByRole('dialog',{name:'Add an input'});
  await add.locator('#reuse-input').selectOption('camera-A');
  await add.getByRole('button',{name:'Assign to this scene'}).click();
  await page.waitForFunction(()=>window.__qaStudio.project.scenes.at(-1).layers
    .some(layer=>layer.source==='camera-A'));
  assert.equal(await page.evaluate(()=>window.__captureRequests),4,
    'Reusing Camera A in Studio 7 needs no additional camera connection');
  assert.equal(await page.evaluate(()=>window.__qaStudio.project.scenes.at(-1).layers
    .filter(l=>l.source==='camera-A').length),1);
  await settings.locator('[data-act="select-layer"]').filter({hasText:'Camera A'}).click();
  const removeButton=settings.locator('[data-act="remove-layer"]');
  assert.equal(await removeButton.count(),1,
    'A camera in scene settings can be removed from this scene, not globally');
  await removeButton.click();
  assert.equal(await page.evaluate(()=>window.__qaStudio.project.scenes.at(-1).layers
    .some(layer=>layer.source==='camera-A')),false,
    'Removing the Studio 7 camera layer never disconnects Camera A from Studios 1 and 5');
  assert.equal(await page.evaluate(()=>window.__qaStudio.media.get('camera-A')?.state),'ready');
  await settings.locator('[data-act="close-tools"]').click();

  await page.locator('[data-act="save"]').click();
  await page.locator('#save-state').getByText('Saved on this device').waitFor({timeout:12000});
  await page.reload();
  await page.waitForFunction(()=>window.__qaStudio?.project?.id==='shared-devices-test');
  assert.deepEqual(await page.evaluate(()=>window.__qaStudio.project.scenes.map(scene=>
    scene.layers.filter(l=>['camera-A','camera-B','camera-C'].includes(l.source))
      .map(l=>l.source))),[
        ['camera-A'],['camera-B'],['camera-C'],[],['camera-A'],['camera-B'],[],
      ],'Only intentional camera assignments persist after browser reload');
  assert.equal(await page.evaluate(()=>window.__qaStudio.media.get('camera-A')),undefined,
    'Device permissions are not reopened automatically across browser reloads');

  assert.deepEqual(errors,[],'No uncaught errors during camera/mic sharing and scene switching');
  console.log('Camera assignments: explicit A/B/C scene routing, no auto inserts, review cleanup, one stream per source, per-scene removal and persistence passed.');
  await context.close();
} finally {
  if (browser) await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
