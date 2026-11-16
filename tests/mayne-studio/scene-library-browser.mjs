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
      assert.ok(source.includes(marker),'Studio test hook is available');
      bytes=Buffer.from(source.replace(marker,
        "else { window.__qaStudio = new Studio($('studio')); window.__qaStudio.start(); }"));
    }
    res.writeHead(200,{'Content-Type':types[extname(file)]??'application/octet-stream'}).end(bytes);
  } catch{res.writeHead(404).end('Not found');}
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

  const initial=await page.evaluate(async()=>{
    const studio=window.__qaStudio;
    studio.project.scenes=Array.from({length:100},(_,i)=>({
      id:crypto.randomUUID(),name:'Topic '+String(i+1).padStart(3,'0'),
      group:i%2?'Workshops':'Leadership 101',template:'blank',
      background:'black',title:'',caption:'',backdrop:'',layers:[],
    }));
    studio.program=studio.shot(studio.project.scenes[0]);
    studio.previewId=studio.project.scenes[1].id;
    studio.render();
    await studio.save();
    // 100 cards should not result in 100 canvas redraws every second.
    const original=studio.renderer.thumbnail.bind(studio.renderer);
    let painted=0;
    studio.renderer.thumbnail=(...args)=>{painted++;return original(...args);};
    studio.thumbnails(performance.now());
    studio.renderer.thumbnail=original;
    return {first:studio.project.scenes[0].id,last:studio.project.scenes[99].id,painted};
  });
  assert.ok(initial.painted<20,'Thumbnail painting is restricted to visible and active scenes');

  assert.equal(await page.locator('.scene-tile').count(),100,'All 100 scenes have cards');
  assert.equal(await page.locator('#scene-library-search').count(),1);
  assert.equal(await page.locator('#scene-library-group option').count(),3);
  assert.ok((await page.locator('#scene-library-count').textContent()).includes('100 / 100 saved'));
  await page.locator('#scene-library-search').fill('Topic 100');
  assert.equal(await page.locator('.scene-tile:visible').count(),1,
    'Searching shows matching scene names without changing the project');
  assert.equal(await page.locator('#program-name').textContent(),'Topic 001',
    'Searching never changes the scene on live Program');
  assert.equal(await page.locator('#scene-library-hint').isVisible(),true);
  assert.equal(await page.locator('.scene-tile:visible .scene-drag-handle').getAttribute('draggable'),'false',
    'Scene reordering is held while the strip is filtered');
  await page.locator('#scene-library-group').selectOption('Leadership 101');
  assert.equal(await page.locator('.scene-tile:visible').count(),0,
    'A group filter can be combined with scene-name search');
  assert.equal(await page.locator('#scene-library-empty').isVisible(),true);
  await page.locator('#scene-library-group').selectOption('Workshops');
  assert.equal(await page.locator('.scene-tile:visible').count(),1);
  await page.locator('.scene-tile:visible .scene').click();
  assert.equal(await page.locator('#preview-name').textContent(),'Topic 100',
    'A filtered scene can still be cued privately in Preview');
  assert.equal(await page.locator('#program-name').textContent(),'Topic 001',
    'Selecting a filtered scene does not take it live');

  await page.locator('#scene-library-search').fill('');
  await page.locator('#scene-library-group').selectOption('all');
  assert.equal(await page.locator('.scene-tile:visible').count(),100);
  assert.equal(await page.locator('.scene-tile .scene-drag-handle[draggable="true"]').count(),100);
  assert.equal(await page.locator('.scene-order-step:disabled').count(),2);

  // The last scene gets a custom user-created category, not just built-in groups.
  await page.locator('.scene-tile').last().locator('[data-act="scene-tools"]').click();
  await page.locator('#studio-tools [data-act="scene-edit"]').click();
  const editor=page.getByRole('dialog',{name:'Scene settings'});
  assert.equal(await editor.locator('[name="group"]').inputValue(),'Workshops');
  await editor.locator('[name="group"]').fill('Advanced Leadership');
  await editor.getByRole('button',{name:'Apply to Preview'}).click();
  assert.equal(await page.locator('#scene-library-group option').count(),4,
    'Custom category becomes immediately selectable in the search group control');
  await page.locator('#scene-library-group').selectOption('Advanced Leadership');
  assert.equal(await page.locator('.scene-tile:visible').count(),1);
  assert.equal(await page.locator('.scene-tile:visible .scene strong').textContent(),'Topic 100');
  await page.locator('#scene-library-group').selectOption('all');

  // Existing user-configured keys can target scene #100 by its stable ID.
  const shortcutAdded=await page.evaluate(async id=>{
    const studio=window.__qaStudio;
    studio.project.extraShortcuts.push({
      id:'extra-hundred-scene',action:'scene:'+id,key:'Ctrl+Shift+KeyJ',
    });
    studio.setPreview(studio.project.scenes[0].id);
    await studio.save();
    return studio.runShortcut('Ctrl+Shift+KeyJ');
  },initial.last);
  assert.equal(shortcutAdded,true);
  assert.equal(await page.locator('#preview-name').textContent(),'Topic 100',
    'Custom hotkey can cue scene 100');
  assert.equal(await page.locator('#program-name').textContent(),'Topic 001');

  // Boundary: 101st new scene must be blocked; no project data may be lost.
  await page.locator('#workspace-add').click();
  const add=page.getByRole('dialog',{name:'Add scene'});
  await add.locator('[name="name"]').fill('Scene 101');
  await add.getByRole('button',{name:'Add scene'}).click();
  await page.locator('#toast').getByText('This project already has 100 scenes.').waitFor();
  assert.equal(await page.locator('.scene-tile').count(),100);
  await add.locator('[data-act="close-dialog"]').click();

  await page.locator('[data-act="save"]').click();
  await page.locator('#save-state').getByText('Saved on this device').waitFor({timeout:12000});
  await page.reload();
  await page.waitForFunction(()=>!!window.__qaStudio?.project);
  assert.equal(await page.locator('.scene-tile').count(),100,
    'All 100 scenes are retained through browser project reload');
  assert.equal(await page.locator('#scene-library-group option').count(),4,
    'Custom scene categories survive browser project reload');
  assert.equal(await page.evaluate(()=>window.__qaStudio.runShortcut('Ctrl+Shift+KeyJ')),true,
    'Custom scene 100 shortcut survives project reload');
  assert.equal(await page.locator('#preview-name').textContent(),'Topic 100');
  await page.setViewportSize({width:375,height:850});
  await page.locator('#scene-library-search').fill('Topic 099');
  assert.equal(await page.locator('.scene-tile:visible').count(),1,
    'Scene filters also work on mobile');
  assert.deepEqual(errors,[],'No page errors during scene grouping or save/reload');
  console.log('100-scene library: saved count, custom groups, search, live isolation, custom hotkeys, performance and reload passed.');
  await context.close();
} finally{
  await browser?.close();
  await new Promise(done=>server.close(done));
}
