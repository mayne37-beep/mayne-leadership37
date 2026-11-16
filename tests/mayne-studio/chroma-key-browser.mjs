import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const repo=resolve(fileURLToPath(new URL('../../',import.meta.url)));
const root=resolve(repo,'public');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png',
  '.webp':'image/webp','.jpg':'image/jpeg','.wasm':'application/wasm'};
const server=createServer(async(req,res)=>{
  try {
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    const base=pathname.startsWith('/src/mayne-studio/')?repo:root;
    const file=resolve(base,'.'+(pathname==='/'?'/index.html':pathname));
    if(file!==base&&!file.startsWith(base+sep)){res.writeHead(403).end();return;}
    let bytes=await readFile(file);
    if(pathname==='/src/mayne-studio/app.js'){
      const source=bytes.toString('utf8'),marker="else new Studio($('studio')).start();";
      assert.ok(source.includes(marker),'Studio test hook marker must exist');
      bytes=Buffer.from(source.replace(marker,
        "else { window.__qaStudio = new Studio($('studio')); window.__qaStudio.start(); }"));
    }
    res.writeHead(200,{'Content-Type':types[extname(file)]??'application/octet-stream'}).end(bytes);
  }catch{res.writeHead(404).end('Not found');}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
let browser;
try{
  browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const context=await browser.newContext({viewport:{width:1440,height:950}});
  await context.route('**/assets/mayne-studio-app.js',route=>route.fulfill({
    status:200,contentType:'text/javascript',body:'import "/src/mayne-studio/app.js";',
  }));
  const page=await context.newPage();
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://127.0.0.1:'+server.address().port+'/mayne-studio.html');
  await page.waitForFunction(()=>!!window.__qaStudio?.project);

  // A synthetic camera stream exercises the real preview, pixel sampler and
  // production chroma worker without requesting hardware or camera permission.
  await page.evaluate(async()=>{
    const studio=window.__qaStudio;
    const canvas=document.createElement('canvas');
    canvas.width=640;canvas.height=360;
    const ctx=canvas.getContext('2d');
    ctx.fillStyle='#00a040';ctx.fillRect(0,0,640,360);
    ctx.fillStyle='#f43222';ctx.fillRect(220,65,200,250);
    const video=document.createElement('video');
    video.muted=true;video.playsInline=true;
    video.srcObject=canvas.captureStream(15);
    await video.play();
    if(!video.videoWidth)await new Promise(resolve=>video.addEventListener('loadeddata',resolve,{once:true}));
    const source={id:'test-camera',type:'camera',name:'Green-screen camera',
      asset:'',device:'',route:'scene',gain:0,mute:false};
    const layer={id:'test-camera-layer',source:source.id,x:24,y:7,w:52,h:70,
      opacity:100,visible:true,fit:'cover',matte:'chroma',key:'#ff0000',
      keyStrength:50,keySoftness:50,keyDespill:0,coverage:'balanced',mirror:false};
    const scene={id:'test-keyed-scene',name:'Teaching studio',group:'General',
      template:'blank',background:'black',title:'',caption:'',backdrop:'',layers:[layer]};
    studio.project.sources.push(source);
    studio.project.scenes.push(scene);
    studio.media.entries.set(source.id,{type:'camera',state:'ready',element:video,
      stream:video.srcObject});
    studio.previewId=scene.id;
    studio.layerId=layer.id;
    studio.program=studio.shot(scene);
    studio.render();
    window.__cameraCanvas=canvas;
    window.__cameraVideo=video;
  });
  await page.locator('.scene-tile [data-act="scene-tools"]').click();
  const original=page.locator('#chroma-raw-preview');
  const keyed=page.locator('#chroma-keyed-preview');
  await original.waitFor({state:'visible'});
  assert.equal(await keyed.isVisible(),true,
    'Original and processed camera images are visible beside settings');
  assert.equal(await page.locator('.chroma-range input[type="range"]').count(),3);
  await page.waitForFunction(()=>document.querySelector('#chroma-raw-preview')?.dataset.chromaReady==='true',
    {timeout:12000});
  const before=await original.evaluate(canvas=>{
    const [r,g,b]=canvas.getContext('2d').getImageData(15,15,1,1).data;
    return {r,g,b};
  });
  assert.ok(before.g>110 && before.g>before.r+80,
    'The raw camera preview displays the real green backdrop');

  // Sample the visible backdrop without opening a modal native color picker.
  await original.click({position:{x:24,y:20}});
  let sampled=await page.evaluate(()=>window.__qaStudio.layer.key);
  assert.ok(/^#[0-9a-f]{6}$/i.test(sampled));
  assert.notEqual(sampled,'#ff0000','Clicking raw preview updates the key color');
  assert.equal(await page.evaluate(()=>window.__qaStudio.program.scene.layers[0].key),
    '#ff0000','Adjusting a private Preview layer never mutates the Program snapshot');
  assert.equal(await page.locator('#chroma-key-code').textContent(),sampled.toUpperCase());

  // Check the real worker processes the newly sampled key, not a fake UI image.
  await page.waitForFunction(()=>{
    const studio=window.__qaStudio;
    return studio.media.matteStatus('test-camera',studio.layer)==='Background removed';
  },null,{timeout:22000});
  await page.waitForTimeout(300);
  const after=await keyed.evaluate(canvas=>{
    const [r,g,b]=canvas.getContext('2d').getImageData(15,15,1,1).data;
    return {r,g,b};
  });
  assert.ok(Math.abs(after.g-after.r)<70,
    'The keyed preview displays transparency checkerboard instead of the green backdrop');

  // Tuning is editable, updates a numeric readout, and persists with the project.
  const setRange=async(field,value)=>page.locator('[data-layer="'+field+'"]').evaluate((node,value)=>{
    node.value=String(value);
    node.dispatchEvent(new Event('input',{bubbles:true}));
    node.dispatchEvent(new Event('change',{bubbles:true}));
  },value);
  await setRange('keyStrength',79);
  await setRange('keySoftness',33);
  await setRange('keyDespill',45);
  assert.equal(await page.locator('[data-chroma-output="keyStrength"]').textContent(),'79%');
  assert.equal(await page.evaluate(()=>{
    const layer=window.__qaStudio.layer;
    return layer.keyStrength+':'+layer.keySoftness+':'+layer.keyDespill;
  }),'79:33:45');

  // A reset is confined to this layer and should not interrupt Program.
  await page.locator('[data-act="chroma-reset"]').click();
  assert.deepEqual(await page.evaluate(()=>{
    const l=window.__qaStudio.layer;
    return [l.key,l.keyStrength,l.keySoftness,l.keyDespill];
  }),['#00a040',50,50,0]);
  assert.equal(await page.evaluate(()=>window.__qaStudio.program.scene.layers[0].key),'#ff0000');
  await setRange('keyStrength',82);
  await setRange('keySoftness',28);
  await setRange('keyDespill',40);
  await page.locator('[data-act="save"]').click();
  await page.locator('#save-state').getByText('Saved on this device').waitFor({timeout:12000});

  // Reload disconnects browser media but must keep the sampled color and tuning.
  await page.reload();
  await page.waitForFunction(()=>!!window.__qaStudio?.project);
  assert.deepEqual(await page.evaluate(()=>{
    const layer=window.__qaStudio.project.scenes[0].layers[0];
    return [layer.key,layer.keyStrength,layer.keySoftness,layer.keyDespill];
  }),['#00a040',82,28,40],'Chroma key calibration survives project reload');
  assert.deepEqual(errors,[],'No page errors during key selection or matte processing');
  console.log('Chroma lab: live raw camera sampling, real keyed preview, strength/softness/despill, private Program isolation and persistence passed.');
  await context.close();
}finally{
  await browser?.close();
  await new Promise(done=>server.close(done));
}
