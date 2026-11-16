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
    const path=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    const base=path.startsWith('/src/mayne-studio/')?repo:root;
    const file=resolve(base,'.'+(path==='/'?'/index.html':path));
    if(file!==base&&!file.startsWith(base+sep)){res.writeHead(403).end();return;}
    let body=await readFile(file);
    if(path==='/src/mayne-studio/app.js'){
      const source=body.toString('utf8'),marker="else new Studio($('studio')).start();";
      assert.ok(source.includes(marker),'Studio test hook is available');
      body=Buffer.from(source.replace(marker,
        "else { window.__qaStudio = new Studio($('studio')); window.__qaStudio.start(); }"));
    }
    res.writeHead(200,{'Content-Type':types[extname(file)]??'application/octet-stream'}).end(body);
  }catch{res.writeHead(404).end('Not found');}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
let browser;
try {
  browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const context=await browser.newContext({viewport:{width:1450,height:950}});
  await context.route('**/assets/mayne-studio-app.js',route=>route.fulfill({
    status:200,contentType:'text/javascript',body:'import "/src/mayne-studio/app.js";',
  }));
  const page=await context.newPage();
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://127.0.0.1:'+server.address().port+'/mayne-studio.html');
  await page.waitForFunction(()=>!!window.__qaStudio?.project);
  assert.equal(await page.locator('.scene-tile').count(),0,'New project does not create studio templates');
  for(const name of ['Break screen','Instructor studio','No timer']){
    const button=await page.locator('.scene-tile').count()?
      page.locator('#workspace-add'):page.getByRole('button',{name:'Create first scene'});
    await button.click();
    const dialog=page.getByRole('dialog',{name:'Add scene'});
    await dialog.locator('[name="name"]').fill(name);
    await dialog.getByRole('button',{name:'Add scene'}).click();
  }
  assert.equal(await page.locator('.scene-tile').count(),3);
  assert.equal(await page.evaluate(()=>window.__qaStudio.project.sources.length),0,
    'Scenes begin without automatically assigned timer or camera sources');

  await page.locator('#workspace-classroom').click();
  const panel=page.locator('#classroom-panel');
  assert.equal(await panel.locator('[data-timer-time]').count(),3);
  await panel.locator('[data-timer-time=h]').fill('01');
  await panel.locator('[data-timer-time=h]').press('Tab');
  await panel.locator('[data-timer-time=m]').fill('02');
  await panel.locator('[data-timer-time=m]').press('Tab');
  await panel.locator('[data-timer-time=s]').fill('03');
  await panel.locator('[data-timer-time=s]').press('Tab');
  assert.equal(await page.evaluate(()=>window.__qaStudio.project.timerSeconds),3723,
    'Typed hours/minutes/seconds set the duration');
  assert.equal(await panel.locator('#timer-read').textContent(),'01:02:03');

  await panel.locator('[data-act=timer-save-preset]').click();
  const presetDialog=page.getByRole('dialog',{name:'Save a timer preset'});
  await presetDialog.locator('[name=name]').fill('Long group task');
  await presetDialog.getByRole('button',{name:'Save preset'}).click();
  assert.deepEqual(await page.evaluate(()=>window.__qaStudio.project.timerPresets),
    [{name:'Long group task',seconds:3723}]);
  await panel.locator('[data-act=timer-preset][data-id="300"]').click();
  assert.equal(await panel.locator('#timer-read').textContent(),'05:00');
  await panel.getByRole('button',{name:'Long group task',exact:true}).click();
  assert.equal(await panel.locator('#timer-read').textContent(),'01:02:03');
  await panel.locator('[data-act=timer-preset][data-id="300"]').click();

  // The active Preview scene is No timer; explicitly add timer only to it.
  await panel.locator('[data-act=timer-assign]').click();
  assert.deepEqual(await page.evaluate(()=>{
    const s=window.__qaStudio;
    return s.project.scenes.map(scene=>scene.layers
      .filter(layer=>s.source(layer.source)?.type==='timer').length);
  }),[0,0,1],'Assigning timer never adds it automatically to other studios');
  await panel.locator('[data-act=timer-style][data-id=ring]').click();
  assert.equal(await page.evaluate(()=>window.__qaStudio.project.scenes[2].layers[0].timerStyle),'ring');
  await panel.locator('[data-act=timer-assign]').click();
  assert.equal(await page.evaluate(()=>window.__qaStudio.project.scenes[2].layers.length),0,
    'Removing timer from a scene leaves other scenes untouched');

  await page.evaluate(()=>window.__qaStudio.setPreview(window.__qaStudio.project.scenes[1].id));
  await panel.locator('[data-act=timer-assign]').click();
  await panel.locator('[data-act=timer-style][data-id=ring]').click();
  const studioLayer=await page.evaluate(()=>window.__qaStudio.project.scenes[1].layers[0]);
  assert.deepEqual([studioLayer.x,studioLayer.y,studioLayer.w,studioLayer.h],
    [75,7,22,19],'Small ring timer is placed as an independent studio layer');
  await page.evaluate(()=>window.__qaStudio.setPreview(window.__qaStudio.project.scenes[0].id));
  await panel.locator('[data-act=timer-assign]').click();
  await panel.locator('[data-act=timer-style][data-id=fullscreen]').click();
  assert.deepEqual(await page.evaluate(()=>{
    const s=window.__qaStudio;
    return s.project.scenes.map(scene=>scene.layers.map(l=>[l.timerStyle,l.x,l.y,l.w,l.h]));
  }),[[['fullscreen',0,0,100,100]],[['ring',75,7,22,19]],[]],
    'Full-screen break scene and small studio ring have independent styles');

  await panel.locator('[data-project=timerBackground]').selectOption('glass');
  await panel.locator('[data-project=timerColor]').evaluate(node => {
    node.value='#123abc';node.dispatchEvent(new Event('change',{bubbles:true}));
  });
  await panel.locator('[data-project=timerOpacity]').evaluate(node => {
    node.value='65';node.dispatchEvent(new Event('change',{bubbles:true}));
  });
  await panel.locator('[data-project=timerEnd]').selectOption('overtime');
  await panel.locator('[data-project=timerFlash]').check();
  assert.deepEqual(await page.evaluate(()=>{
    const p=window.__qaStudio.project;
    return [p.timerBackground,p.timerColor,p.timerOpacity,p.timerEnd,p.timerFlash];
  }),['glass','#123abc',65,'overtime',true]);
  await panel.locator('[data-act=timer-toggle]').click();
  assert.equal(await page.evaluate(()=>window.__qaStudio.timer.visible),true);
  assert.ok(await page.evaluate(()=>window.__qaStudio.timer.deadline>performance.now()));

  // Existing Program scene is the break scene; timer was added to its live
  // snapshot in place. The client should not require a Cut to show it.
  await page.waitForFunction(()=>{
    const s=window.__qaStudio;
    return s.program.scene.layers.some(l=>s.program.sources.get(l.source)?.type==='timer');
  });
  assert.equal(await page.evaluate(()=>window.__qaStudio.project.scenes[2].layers.length),0);
  await page.locator('#workspace-scenes').click();
  await page.evaluate(()=>{const s=window.__qaStudio;s.setPreview(s.project.scenes[1].id);s.take('cut');});
  assert.equal(await page.evaluate(()=>{
    const s=window.__qaStudio;
    return s.program.scene.layers.find(l=>s.program.sources.get(l.source)?.type==='timer').timerStyle;
  }),'ring','Studio Program displays its own compact timer style');
  const before=await page.evaluate(()=>window.__qaStudio.timer.deadline);
  await page.locator('#workspace-classroom').click();
  await panel.locator('[data-act=timer-adjust][data-id="30"]').click();
  const after=await page.evaluate(()=>window.__qaStudio.timer.deadline);
  assert.ok(after>=before+29000,'Adding time adjusts the shared live timer without restarting');
  await panel.locator('[data-act=timer-adjust][data-id="-10"]').click();
  assert.equal(await page.evaluate(()=>window.__qaStudio.timer.deadline<0),false);
  await page.locator('#workspace-scenes').click();
  await page.evaluate(()=>{const s=window.__qaStudio;s.setPreview(s.project.scenes[0].id);s.take('cut');});
  assert.equal(await page.evaluate(()=>{
    const s=window.__qaStudio;
    return s.program.scene.layers.find(l=>s.program.sources.get(l.source)?.type==='timer').timerStyle;
  }),'fullscreen','Switching scenes does not replace the full-screen timer style');
  assert.ok(Math.abs(await page.evaluate(()=>window.__qaStudio.timer.deadline)-after+10000)<3000,
    'The clock continues rather than restarting on Take');

  await page.evaluate(()=>{
    const s=window.__qaStudio;
    s.timer.deadline=performance.now()-2300;
    s.lastFrame=0;
    s.frame();
  });
  assert.ok(await page.evaluate(()=>window.__qaStudio.timer.finished));
  assert.ok(await page.evaluate(()=>window.__qaStudio.timer.remaining<0),
    'Overtime behavior counts up after reaching zero');
  assert.equal(await panel.locator('#timer-status').count(),1);
  await page.locator('#workspace-classroom').click();
  await panel.locator('[data-act=timer-reset]').click();
  assert.equal(await page.evaluate(()=>window.__qaStudio.timer.remaining),300);
  assert.equal(await page.evaluate(()=>window.__qaStudio.timer.deadline),0);
  await panel.locator('[data-act=timer-show]').click();
  assert.equal(await page.evaluate(()=>window.__qaStudio.timer.visible),false);

  await page.locator('[data-act=save]').click();
  await page.locator('#save-state').getByText('Saved on this device').waitFor({timeout:12000});
  await page.reload();
  await page.waitForFunction(()=>window.__qaStudio?.project?.scenes?.length===3);
  const restored=await page.evaluate(()=>{
    const p=window.__qaStudio.project;
    return {
      duration:p.timerSeconds,presets:p.timerPresets,end:p.timerEnd,style:p.timerStyle,
      background:p.timerBackground,color:p.timerColor,opacity:p.timerOpacity,flash:p.timerFlash,
      layers:p.scenes.map(s=>s.layers.map(l=>({style:l.timerStyle,x:l.x,w:l.w}))),
      timerSources:p.sources.filter(s=>s.type==='timer').length,
    };
  });
  assert.deepEqual(restored.layers,[
    [{style:'fullscreen',x:0,w:100}],[{style:'ring',x:75,w:22}],[],
  ]);
  assert.equal(restored.timerSources,1);
  assert.deepEqual(restored.presets,[{name:'Long group task',seconds:3723}]);
  assert.equal(restored.duration,300);
  assert.equal(restored.end,'overtime');
  assert.equal(restored.color,'#123abc');
  assert.equal(restored.background,'glass');
  assert.equal(restored.opacity,65);
  assert.equal(restored.flash,true);
  assert.deepEqual(errors,[],'No uncaught browser errors');
  console.log('Classroom timer passed: direct HH:MM:SS entry, presets, scene-specific styles, shared live clock, overtime, adjustments and persistence.');
  await context.close();
}finally{
  if(browser)await browser.close();
  await new Promise(done=>server.close(done));
}
