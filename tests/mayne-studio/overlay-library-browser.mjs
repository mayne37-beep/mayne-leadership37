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
      assert.ok(source.includes(marker),'Studio test hook remains available');
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
  const context=await browser.newContext({viewport:{width:1440,height:950}});
  await context.route('**/assets/mayne-studio-app.js',route=>route.fulfill({
    status:200,contentType:'text/javascript',body:'import "/src/mayne-studio/app.js";',
  }));
  const page=await context.newPage();
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://127.0.0.1:'+server.address().port+'/mayne-studio.html');
  await page.waitForFunction(()=>!!window.__qaStudio?.project);

  // Populate a legal, realistic 100-item project to exercise the last slot,
  // not just the first eight original keyboard-activated overlay cards.
  const lastId=await page.evaluate(async()=>{
    const studio=window.__qaStudio;
    const original=studio.project.overlays[0];
    studio.project.overlays=Array.from({length:100},(_,i)=>({
      ...structuredClone(original),id:crypto.randomUUID(),
      name:'Item '+String(i+1).padStart(2,'0'),
      text:'Example message '+(i+1),
      group:i%2?'announcements':'messages',
    }));
    await studio.save();
    studio.renderWorkspacePanel();
    return studio.project.overlays[99].id;
  });

  await page.locator('#workspace-overlays').click();
  const panel=page.locator('#overlays-panel');
  assert.equal(await panel.locator('.overlay-card').count(),100,
    'All 100 saved overlays appear in the Overlays workspace');
  assert.equal(await panel.locator('.overlay-library-list').isVisible(),true);
  assert.equal(await panel.locator('[data-overlay-search]').count(),1);
  assert.equal(await panel.locator('[data-overlay-filter]').count(),1);
  await panel.locator('[data-overlay-search]').fill('Item 97');
  assert.equal(await panel.locator('.overlay-card:visible').count(),1,
    'Search narrows the library without deleting or changing saved overlays');
  await panel.locator('[data-overlay-filter]').selectOption('messages');
  assert.equal(await panel.locator('.overlay-card:visible').count(),0,
    'Filtering an incompatible group hides all matching names');
  assert.equal(await panel.locator('#overlay-library-empty').isVisible(),true);
  await panel.locator('[data-overlay-filter]').selectOption('announcements');
  assert.equal(await panel.locator('.overlay-card:visible').count(),1);
  await panel.locator('[data-overlay-search]').fill('');
  assert.equal(await panel.locator('.overlay-card:visible').count(),50,
    'Category filter shows only items in the selected group');
  await panel.locator('[data-overlay-filter]').selectOption('all');
  assert.equal(await panel.locator('.overlay-card:visible').count(),100);
  await page.locator('#workspace-add').click();
  assert.equal(await page.getByRole('dialog',{name:'Add overlay'}).count(),0,
    'The operator cannot exceed the documented 100-item project limit');

  // Adding a binding is a separate first-class action, not an expanded fixed list.
  await page.locator('[data-act="shortcuts"]').click();
  const dialog=page.getByRole('dialog',{name:'Keyboard shortcuts'});
  await dialog.locator('[data-act="shortcut-extra-add"]').click();
  assert.equal(await dialog.locator('[data-extra-action]').count(),1);
  await dialog.locator('[data-extra-action]').selectOption('overlay:'+lastId);
  await dialog.locator('[data-extra-shortcut]').press('Control+Shift+j');
  assert.equal(await dialog.locator('[data-extra-shortcut]').inputValue(),'Ctrl + Shift + J');
  assert.equal(await page.evaluate(id=>window.__qaStudio.project.extraShortcuts[0].action,
    lastId),'overlay:'+lastId);

  await dialog.locator('[data-act="close-dialog"]').click();
  await page.locator('#save-state').getByText('Saved on this device').waitFor({timeout:12000});
  assert.equal(await page.evaluate(()=>window.__qaStudio.runShortcut('Ctrl+Shift+KeyJ')),
    true,'Newly created hotkey executes the bound command');
  assert.equal(await page.evaluate(id=>window.__qaStudio.liveOverlays.has(id),lastId),true,
    'Overlay 100 is actually live on Program using its custom shortcut');
  await page.evaluate(id=>window.__qaStudio.toggleOverlay(id,true),lastId);
  await page.reload();
  await page.waitForFunction(()=>!!window.__qaStudio?.project);
  await page.locator('#workspace-overlays').click();
  assert.equal(await page.locator('#overlays-panel .overlay-card').count(),100,
    '100 overlay entries survive the saved-project reload');
  assert.equal(await page.locator('#overlays-panel .overlay-card').last().locator('kbd').textContent(),
    'Ctrl + Shift + J','Additional hotkey displays on overlay 100 after reload');
  assert.equal(await page.evaluate(()=>window.__qaStudio.runShortcut('Ctrl+Shift+KeyJ')),true,
    'Custom shortcut survives reload and remains executable');

  await page.locator('[data-act="shortcuts"]').click();
  await dialog.locator('[data-act="shortcut-extra-add"]').click();
  assert.equal(await dialog.locator('[data-extra-action]').count(),2);
  await dialog.locator('[data-extra-action]').last().selectOption('take');
  await dialog.locator('[data-extra-shortcut]').last().press('Control+Shift+j');
  assert.equal(await dialog.locator('[data-extra-shortcut]').last().inputValue(),'Not assigned',
    'Duplicate key combinations are rejected across all user-added rows');
  await dialog.locator('[data-act="shortcut-extra-remove"]').last().click();
  assert.equal(await dialog.locator('[data-extra-action]').count(),1,
    'A user-created shortcut can be removed independently');
  await dialog.locator('[data-act="close-dialog"]').click();

  assert.deepEqual(errors,[],'No browser errors during library filtering, saving, or hotkeys');
  console.log('100-overlay searchable library and expandable stable-ID hotkey editor passed.');
  await context.close();
} finally {
  await browser?.close();
  await new Promise(done=>server.close(done));
}
