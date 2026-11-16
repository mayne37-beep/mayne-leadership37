import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const repo = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const root = resolve(repo,'public');
const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png',
  '.webp':'image/webp','.jpg':'image/jpeg','.wasm':'application/wasm'};
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url,'http://localhost');
    const relative = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    const base = relative.startsWith('/src/mayne-studio/') ? repo : root;
    const filepath = resolve(base,'.'+relative);
    if (filepath !== base && !filepath.startsWith(base + sep)) {
      response.writeHead(403).end(); return;
    }
    let bytes = await readFile(filepath);
    if(relative === '/src/mayne-studio/app.js') {
      const original = bytes.toString('utf8');
      const marker = "else new Studio($('studio')).start();";
      assert.ok(original.includes(marker),'Studio test hook marker present');
      bytes = Buffer.from(original.replace(marker,
        "else { window.__qaStudio = new Studio($('studio')); window.__qaStudio.start(); }"));
    }
    response.writeHead(200,{'Content-Type':mime[extname(filepath)]??'application/octet-stream'}).end(bytes);
  } catch { response.writeHead(404).end('Not found'); }
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
let browser;
try{
  browser = await chromium.launch({headless:true,args:['--no-sandbox']});
  const context = await browser.newContext({viewport:{width:1440,height:950}});
  await context.route('**/assets/mayne-studio-app.js',route=>route.fulfill({
    status:200,contentType:'text/javascript',body:'import "/src/mayne-studio/app.js";',
  }));
  const page = await context.newPage();
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://127.0.0.1:'+server.address().port+'/mayne-studio.html');
  await page.waitForFunction(()=>!!window.__qaStudio?.project);
  const order=()=>page.locator('.scene-tile .scene strong').allTextContents();

  // User-owned blank projects: no starter scenes or cameras.
  assert.deepEqual(await order(),[]);
  for (const name of ['Studio 1','Studio 2','Studio 3','Studio 4']) {
    const action = (await page.locator('.scene-tile').count()) ?
      page.locator('#workspace-add') : page.getByRole('button',{name:'Create first scene'});
    await action.click();
    const dialog = page.getByRole('dialog',{name:'Add scene'});
    await dialog.locator('[name="name"]').fill(name);
    await dialog.getByRole('button',{name:'Add scene'}).click();
  }
  assert.deepEqual(await order(),['Studio 1','Studio 2','Studio 3','Studio 4']);
  assert.equal(await page.locator('.scene-drag-handle[draggable=true]').count(),4);
  assert.equal(await page.locator('.scene-order-step').count(),8);
  assert.equal(await page.locator('.scene-order-step:disabled').count(),2,
    'First and last scenes cannot move past list boundaries');
  const baseline = await page.evaluate(()=>{
    const s=window.__qaStudio;
    const [first,second,third,fourth]=s.project.scenes;
    s.project.sources.push({id:'camera-A',name:'Camera A',type:'camera',
      device:'',gain:0,mute:false,route:'scene'});
    first.layers.push({id:'camera-one',source:'camera-A',x:8,y:18,w:57,h:60,
      visible:true,opacity:100,fit:'cover',page:0,matte:'off',key:'#00a040',
      coverage:'balanced',mirror:false});
    third.layers.push({id:'camera-three',source:'camera-A',x:59,y:11,w:33,h:74,
      visible:true,opacity:100,fit:'cover',page:0,matte:'off',key:'#00a040',
      coverage:'balanced',mirror:false});
    s.render();
    return { program:s.program.scene.id,preview:s.previewId,
      ids:s.project.scenes.map(x=>x.id),
      layers:s.project.scenes.map(x=>x.layers.map(y=>({id:y.id,x:y.x,w:y.w})))};
  });

  // HTML drag/drop: move first scene to the end by dragging its visible grip
  // onto the right side of Studio 4. Never cue Preview or interrupt Program.
  const from = page.locator('.scene-tile').filter({hasText:'Studio 1'}).locator('.scene-drag-handle');
  const dest = page.locator('.scene-tile').filter({hasText:'Studio 4'});
  const box = await dest.boundingBox();
  await from.dragTo(dest,{targetPosition:{x:box.width-7,y:14}});
  assert.deepEqual(await order(),['Studio 2','Studio 3','Studio 4','Studio 1'],
    'Direct drag and drop reorders scene cards');
  let runtime=await page.evaluate(()=>{
    const s=window.__qaStudio;
    return { program:s.program.scene.id,preview:s.previewId,
      ids:s.project.scenes.map(x=>x.id),
      layers:s.project.scenes.map(x=>x.layers.map(y=>({id:y.id,x:y.x,w:y.w})))};
  });
  assert.equal(runtime.program,baseline.program,'Drag never switches the on-air Program');
  assert.equal(runtime.preview,baseline.preview,'Drag never changes selected Preview');
  assert.deepEqual(runtime.ids,[baseline.ids[1],baseline.ids[2],baseline.ids[3],baseline.ids[0]]);
  assert.deepEqual(runtime.layers,
    [baseline.layers[1],baseline.layers[2],baseline.layers[3],baseline.layers[0]],
    'Drag reorders entire scene objects without touching camera layers');
  assert.equal(await page.locator('.scene-dragging,.scene-drop-before,.scene-drop-after').count(),0,
    'Drag feedback resets after drop');
  assert.equal(await page.locator('.scene-tile').first().locator('.scene-order-index').textContent(),'1 / 4');
  assert.equal(await page.locator('.scene-tile').first().locator('.scene-meta kbd').textContent(),'1',
    'Numeric scene shortcuts continue following scene strip positions');

  // Accessible controls move one slot without dragging and preserve scene IDs.
  await page.getByRole('button',{name:'Move Studio 1 left'}).click();
  assert.deepEqual(await order(),['Studio 2','Studio 3','Studio 1','Studio 4'],
    'Move Left swaps with previous neighbor');
  await page.getByRole('button',{name:'Move Studio 2 right'}).click();
  assert.deepEqual(await order(),['Studio 3','Studio 2','Studio 1','Studio 4'],
    'Move Right swaps with next neighbor');
  assert.equal(await page.getByRole('button',{name:'Move Studio 3 left'}).isDisabled(),true);
  assert.equal(await page.getByRole('button',{name:'Move Studio 4 right'}).isDisabled(),true);

  await page.locator('[data-act="save"]').click();
  await page.locator('#save-state').getByText('Saved on this device').waitFor({timeout:12000});
  await page.reload();
  await page.waitForFunction(()=>!!window.__qaStudio?.project);
  assert.deepEqual(await order(),['Studio 3','Studio 2','Studio 1','Studio 4'],
    'Manual scene order persists on reload');
  const afterReload=await page.evaluate(()=>{
    const s=window.__qaStudio;
    return {
      assignments:s.project.scenes.map(x=>x.layers.map(y=>({id:y.id,x:y.x,w:y.w}))),
      program:s.program.scene.id,preview:s.previewId,
    };
  });
  assert.deepEqual(afterReload.assignments,
    [baseline.layers[2],baseline.layers[1],baseline.layers[0],baseline.layers[3]],
    'The reloaded project preserves per-scene camera layout');

  // On a phone, reordering remains possible using the arrow buttons.
  await page.setViewportSize({width:375,height:850});
  await page.getByRole('button',{name:'Move Studio 1 left'}).click();
  assert.deepEqual(await order(),['Studio 3','Studio 1','Studio 2','Studio 4']);
  assert.ok(await page.locator('.scene-reorder-bar').first().isVisible(),
    'Scene reordering controls stay available at phone widths');
  await page.locator('[data-act="save"]').click();
  await page.locator('#save-state').getByText('Saved on this device').waitFor({timeout:12000});
  await page.reload();
  await page.waitForFunction(()=>!!window.__qaStudio?.project);
  assert.deepEqual(await order(),['Studio 3','Studio 1','Studio 2','Studio 4'],
    'Mobile arrow reordering persists too');
  assert.deepEqual(errors,[],'No uncaught Studio errors during drag, reorder or save');
  console.log('Scene reordering passed: blank project, drag-and-drop, arrow buttons, no live changes, camera layouts, reload and mobile.');
  await context.close();
} finally {
  if(browser)await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
