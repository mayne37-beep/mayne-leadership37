import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = resolve(fileURLToPath(new URL('../../public/', import.meta.url)));
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.webp': 'image/webp', '.wasm': 'application/wasm' };
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const path = resolve(root, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
    if (path !== root && !path.startsWith(root + sep)) { res.writeHead(403).end(); return; }
    res.writeHead(200, { 'Content-Type': mime[extname(path)] ?? 'application/octet-stream' }).end(await readFile(path));
  } catch { res.writeHead(404).end('Not found'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = 'http://127.0.0.1:' + server.address().port + '/mayne-studio.html';
let browser;
try {
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(url);
  await page.locator('#studio:not([hidden])').waitFor();
  await page.locator('#workspace-overlays').click();
  await page.locator('#workspace-add').click();
  const create = page.getByRole('dialog', { name: 'Add overlay' });
  await create.waitFor();
  const types = await create.locator('[data-act="overlay-type"]').evaluateAll(items => items.map(node => node.dataset.id));
  assert.deepEqual(types, ['image','video','message'],
    'Only Image, Video, Message are available; old arrow/hand controls are removed');

  // A new message opens the visual canvas editor directly, independently of any scene.
  await create.locator('[data-id="message"]').click();
  const editor = page.locator('#overlay-editor');
  await editor.waitFor({ state: 'visible' });
  assert.equal(await editor.locator('#oe-canvas').count(), 1);
  assert.equal(await editor.locator('.oe-handle').count(), 8);
  const name = editor.locator('[data-oe-field="name"]');
  await name.fill('Welcome to class');
  await editor.locator('[data-oe-field="text"]').fill('Welcome!');
  await editor.locator('[data-oe-field="sub"]').fill('Leadership 101');
  const target = editor.locator('#oe-target');
  const stage = await editor.locator('#oe-stage').boundingBox();
  const initialX = Number(await editor.locator('[data-oe-field="x"]').inputValue());
  let box = await target.boundingBox();
  await page.mouse.move(box.x + box.width * .44, box.y + box.height * .50);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * .44 + stage.width * .12,
    box.y + box.height * .50 + stage.height * .10,{steps:6});
  await page.mouse.up();
  const movedX = Number(await editor.locator('[data-oe-field="x"]').inputValue());
  assert.ok(movedX >= initialX + 10,'Dragging an overlay changes its precise X coordinate');
  const originalWidth = Number(await editor.locator('[data-oe-field="w"]').inputValue());
  const corner = await editor.locator('[data-oe-handle="se"]').boundingBox();
  await page.mouse.move(corner.x + corner.width / 2, corner.y + corner.height / 2);
  await page.mouse.down();
  await page.mouse.move(corner.x + corner.width / 2 + stage.width * .08,
    corner.y + corner.height / 2 + stage.height * .07,{steps:6});
  await page.mouse.up();
  assert.ok(Number(await editor.locator('[data-oe-field="w"]').inputValue()) >= originalWidth + 6,
    'Dragging a corner resizes the overlay');
  await editor.locator('[data-oe-field="animation"]').selectOption('pop');
  await editor.locator('[data-oe-field="exitAnimation"]').selectOption('slide-left');
  await editor.locator('[data-oe-field="seconds"]').fill('7');
  await editor.locator('[data-oe-field="seconds"]').press('Tab');
  await editor.locator('[data-oe-field="opacity"]').evaluate(el => { el.value = '76'; el.dispatchEvent(new Event('input',{ bubbles:true })); });
  await editor.locator('[data-oe-action="preview"]').click();
  assert.ok(await editor.locator('#oe-canvas').isVisible());
  assert.equal(await page.locator('#program-name').textContent(), 'Standby',
    'Previewing an overlay does not replace the live scene');
  await editor.locator('[data-oe-action="save"]').click();
  await editor.waitFor({state:'hidden'});
  assert.ok(await page.locator('#overlays-panel').getByText('Welcome to class').isVisible());

  // The standalone Overlay workspace can cue and hide content on Program.
  const welcome = page.locator('#overlays-panel .overlay-card').filter({hasText:'Welcome to class'});
  await welcome.locator('[data-act="overlay-live"]').click();
  await welcome.locator('[data-act="overlay-live"]').getByText('Hide live').waitFor();
  assert.equal(await page.locator('#program-name').textContent(),'Standby',
    'Overlay activation does not take a different scene live');
  await welcome.locator('[data-act="overlay-live"]').click();
  await page.locator('#save-state').getByText('Saved on this device').waitFor({timeout:12000});
  await page.reload();
  await page.locator('#studio:not([hidden])').waitFor();
  await page.locator('#workspace-overlays').click();
  await page.locator('.overlay-card').filter({hasText:'Welcome to class'}).locator('[data-act="overlay-edit"]').click();
  await editor.waitFor({state:'visible'});
  assert.equal(await editor.locator('[data-oe-field="animation"]').inputValue(),'pop');
  assert.equal(await editor.locator('[data-oe-field="exitAnimation"]').inputValue(),'slide-left');
  assert.equal(await editor.locator('[data-oe-field="seconds"]').inputValue(),'7');
  assert.equal(await editor.locator('[data-oe-field="opacity"]').inputValue(),'76');
  assert.ok(Number(await editor.locator('[data-oe-field="x"]').inputValue()) >= initialX + 10,
    'Layout position persisted in browser storage');
  await editor.locator('[data-oe-action="cancel"]').click();

  // Add a real image and edit its placement independently from text overlays.
  await page.locator('#workspace-add').click();
  await create.locator('[data-id="image"]').click();
  assert.ok((await page.locator('#media-picker').getAttribute('accept')).includes('.png'));
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO9XhZ0AAAAASUVORK5CYII=','base64');
  await page.locator('#media-picker').setInputFiles({ name:'logo.png',mimeType:'image/png',buffer:png });
  await editor.waitFor({state:'visible'});
  // Canceling a fresh upload must discard both its project entry and media.
  await editor.locator('[data-oe-action="cancel"]').click();
  await editor.waitFor({state:'hidden'});
  assert.equal(await page.locator('.overlay-card').filter({hasText:'logo'}).count(),0,
    'Cancel discards the just-imported overlay instead of leaving a stray entry');
  await page.locator('#workspace-add').click();
  await create.locator('[data-id="image"]').click();
  await page.locator('#media-picker').setInputFiles({ name:'logo.png',mimeType:'image/png',buffer:png });
  await editor.waitFor({state:'visible'});
  assert.equal(await editor.locator('#oe-target-label').textContent(),'logo');
  assert.ok(await editor.locator('[data-oe-field="fit"]').count() === 1);
  await editor.locator('[data-oe-field="fit"]').selectOption('cover');
  await editor.locator('[data-oe-action="save"]').click();
  await editor.waitFor({state:'hidden'});
  assert.ok(await page.locator('.overlay-card').filter({hasText:'logo'}).count() === 1);
  await page.locator('.overlay-card').filter({hasText:'logo'}).locator('[data-act="overlay-edit"]').click();
  assert.equal(await editor.locator('[data-oe-field="fit"]').inputValue(),'cover');
  await editor.locator('[data-oe-action="cancel"]').click();

  // Video uses the same canvas/size/motion editor, not a separate special overlay.
  await page.locator('#workspace-add').click();
  await create.locator('[data-id="video"]').click();
  assert.ok((await page.locator('#media-picker').getAttribute('accept')).includes('.webm'));
  // A browser-created WebM lets media decoding and actual playback be exercised.
  const base64 = await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 64; canvas.height = 36;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#11aa77'; ctx.fillRect(0,0,64,36);
    const stream = canvas.captureStream(10);
    const parts = [];
    const recorder = new MediaRecorder(stream,{mimeType:'video/webm'});
    recorder.ondataavailable = event => { if (event.data.size) parts.push(event.data); };
    const done = new Promise(resolve => { recorder.onstop = async () => {
      stream.getTracks().forEach(track => track.stop());
      const blob = new Blob(parts,{type:'video/webm'});
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.readAsDataURL(blob);
    }; });
    recorder.start();
    await new Promise(resolve => setTimeout(resolve,380));
    recorder.stop();
    return done;
  });
  await page.locator('#media-picker').setInputFiles({
    name:'announcement.webm',mimeType:'video/webm',buffer:Buffer.from(base64,'base64'),
  });
  await editor.waitFor({state:'visible'});
  assert.ok(await editor.locator('[data-oe-field="loop"]').count() === 1);
  await editor.locator('[data-oe-field="animation"]').selectOption('fade');
  await editor.locator('[data-oe-field="exitAnimation"]').selectOption('pop');
  await editor.locator('[data-oe-action="save"]').click();
  await editor.waitFor({state:'hidden'});
  assert.equal(await page.locator('.overlay-card').filter({hasText:'announcement'}).count(),1,
    'Video overlay is a first-class option in the Overlays workspace');
  await page.locator('.overlay-card').filter({hasText:'announcement'}).locator('[data-act="overlay-live"]').click();
  await page.locator('.overlay-card').filter({hasText:'announcement'}).getByText('Hide live').waitFor();
  await page.locator('.overlay-card').filter({hasText:'announcement'}).locator('[data-act="overlay-live"]').click();

  // Removing an overlay requires confirmation and keeps other independent overlays.
  await page.locator('.overlay-card').filter({hasText:'logo'}).locator('[data-act="overlay-remove"]').click();
  const remove = page.getByRole('dialog',{name:'Delete overlay'});
  await remove.waitFor();
  await remove.getByRole('button',{name:'Delete overlay'}).click();
  assert.equal(await page.locator('.overlay-card').filter({hasText:'logo'}).count(),0);
  assert.ok(await page.locator('.overlay-card').filter({hasText:'Welcome to class'}).count() === 1);
  assert.deepEqual(errors,[]);
  console.log('Overlay Designer: three types, drag/resize, motion, save/reload, image+video uploads, Go Live and delete passed.');
  await context.close();
} finally {
  if(browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}
