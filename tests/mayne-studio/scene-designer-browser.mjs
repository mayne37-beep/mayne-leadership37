import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = resolve(fileURLToPath(new URL('../../public/', import.meta.url)));
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.json': 'application/json', '.wasm': 'application/wasm',
};
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://127.0.0.1');
    const file = resolve(root, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
    if (file !== root && !file.startsWith(root + sep)) { res.writeHead(403).end(); return; }
    const bytes = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream' });
    res.end(bytes);
  } catch { res.writeHead(404).end('Not found'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = 'http://127.0.0.1:' + server.address().port;
let browser;

const programImage = page => page.locator('#program-canvas').evaluate(canvas => {
  const thumb = document.createElement('canvas');
  thumb.width = 160; thumb.height = 90;
  thumb.getContext('2d').drawImage(canvas, 0, 0, 160, 90);
  return thumb.toDataURL();
});

async function seedProject(page) {
  await page.evaluate(async () => {
    const makeLayer = (id, source, x, y, w, h, options = {}) =>
      ({ id, source, x, y, w, h, visible: true, opacity: 100, ...options });
    const project = {
      id: 'studio-designer-e2e', name: 'Scene Designer E2E', version: 1, updated: Date.now(),
      sources: [
        { id: 'slide-source', type: 'powerpoint', name: 'PowerPoint board' },
        { id: 'camera-source', type: 'camera', name: 'Presenter camera' },
        { id: 'title-source', type: 'title', name: 'Instructor nameplate', text: 'Instructor', sub: 'Live classroom' },
        { id: 'graphic-source', type: 'image', name: 'Classroom graphic' },
      ],
      scenes: [
        { id: 'standby-scene', template: 'standby', name: 'Standby',
          background: 'black', title: 'Class begins shortly', caption: '', backdrop: '', layers: [] },
        { id: 'classroom-scene', template: 'presenter', name: 'Virtual Classroom',
          background: 'studio', title: '', caption: '', backdrop: '',
          layers: [
            makeLayer('slides-layer', 'slide-source', 7, 8, 52, 64, { fit: 'contain' }),
            makeLayer('camera-layer', 'camera-source', 65, 22, 29, 55, { matte: 'chroma', key: '#00a040' }),
            makeLayer('title-layer', 'title-source', 4, 82, 46, 14),
            makeLayer('graphic-layer', 'graphic-source', 77, 5, 18, 13),
          ] },
      ],
      overlays: [], transition: 'cut', duration: 450, master: 0, masterMute: false, timerSeconds: 300,
    };
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open('mayne-production-studio', 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore('projects', { keyPath: 'id' });
        req.result.createObjectStore('files');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    await new Promise((resolve, reject) => {
      const tx = db.transaction('projects', 'readwrite');
      tx.objectStore('projects').put(project);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    localStorage.setItem('mayne-studio-project', project.id);
  });
}

try {
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base + '/mayne-studio.html');
  await page.locator('#studio:not([hidden])').waitFor();
  await seedProject(page);
  await page.reload();
  await page.locator('#studio:not([hidden])').waitFor();
  await page.locator('#project-name').getByText('Scene Designer E2E').waitFor();
  assert.equal(await page.locator('#preview-name').textContent(), 'Virtual Classroom');
  assert.equal(await page.locator('#program-name').textContent(), 'Standby');

  const before = await programImage(page);
  await page.locator('.preview-monitor [data-act="scene-designer"]').click();
  const editor = page.locator('#scene-designer');
  await editor.waitFor({ state: 'visible' });
  assert.equal(await editor.locator('.designer-target').count(), 4);
  assert.ok(await editor.getByRole('button', { name: 'Add input' }).isVisible());
  assert.ok(await editor.getByRole('button', { name: 'Background settings' }).isVisible());
  await editor.locator('[data-designer-action="pick"][data-id="camera-layer"]').click();
  let camera = editor.locator('[data-target="camera-layer"]');
  assert.ok(await camera.evaluate(el => el.classList.contains('selected')));

  const initialX = Number(await editor.locator('[data-designer-field="x"]').inputValue());
  const bounds = await camera.boundingBox();
  const stage = await editor.locator('#designer-stage').boundingBox();
  assert.ok(bounds?.width && stage?.width);
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width / 2 + stage.width * .05,
    bounds.y + bounds.height / 2 - stage.height * .04, { steps: 8 });
  await page.mouse.up();
  const movedX = Number(await editor.locator('[data-designer-field="x"]').inputValue());
  assert.ok(movedX > initialX + 2, 'Camera moves when dragged across the studio canvas');

  camera = editor.locator('[data-target="camera-layer"]');
  const initialW = Number(await editor.locator('[data-designer-field="w"]').inputValue());
  const corner = await camera.locator('[data-handle="se"]').boundingBox();
  assert.ok(corner?.width, 'The selected camera shows a southeast resize handle');
  await page.mouse.move(corner.x + corner.width / 2, corner.y + corner.height / 2);
  await page.mouse.down();
  await page.mouse.move(corner.x + corner.width / 2 + stage.width * .06,
    corner.y + corner.height / 2 + stage.height * .04, { steps: 8 });
  await page.mouse.up();
  assert.ok(Number(await editor.locator('[data-designer-field="w"]').inputValue()) > initialW + 3,
    'Dragging the corner resizes the camera layer');

  await editor.locator('#designer-snap').uncheck();
  await editor.locator('[data-designer-field="x"]').fill('51.5');
  await editor.locator('[data-designer-field="x"]').press('Tab');
  assert.equal(Number(await editor.locator('[data-designer-field="x"]').inputValue()), 51.5,
    'Precise fractional coordinates work when snapping is off');
  await editor.locator('#designer-stage').focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(Number(await editor.locator('[data-designer-field="x"]').inputValue()), 52.5,
    'Arrow keys move the selected layer by one percent');

  const order = () => editor.locator('.designer-layer-pick').allTextContents();
  const previousOrder = await order();
  await editor.locator('[data-designer-action="front"]').click();
  assert.notDeepEqual(await order(), previousOrder, 'Selected layer moves forward in the stack');
  await editor.locator('[data-designer-action="duplicate"]').click();
  assert.equal(await editor.locator('.designer-target').count(), 5, 'Duplication creates a new layer');
  assert.equal(await programImage(page), before, 'Preview edits never alter the live Program canvas');
  await mkdir('test-results', { recursive: true });
  await page.screenshot({ path: 'test-results/mayne-scene-designer.png' });
  await editor.locator('[data-designer-action="close"]').click();
  await page.locator('#save-state').getByText('Saved on this device').waitFor({ timeout: 10000 });
  await page.reload();
  await page.locator('#studio:not([hidden])').waitFor();
  await page.locator('.preview-monitor [data-act="scene-designer"]').click();
  await editor.waitFor({ state: 'visible' });
  await editor.locator('[data-designer-action="pick"][data-id="camera-layer"]').click();
  assert.equal(Number(await editor.locator('[data-designer-field="x"]').inputValue()), 52.5,
    'Edited geometry survives reload from local project storage');
  await editor.locator('[data-designer-action="close"]').click();

  assert.equal(await programImage(page), before, 'Saved Preview composition still does not change Program');
  await page.locator('[data-act="cut"]').click();
  await page.waitForTimeout(200);
  assert.equal(await page.locator('#program-name').textContent(), 'Virtual Classroom');
  assert.notEqual(await programImage(page), before, 'Program changes after Cut');

  assert.deepEqual(errors, [], 'No uncaught JavaScript errors occur during scene editing');
  console.log('Mayne Studio Scene Designer browser checks passed: move, resize, snapping, geometry, layer order, duplicate, autosave, and Program isolation.');
  await context.close();
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}
