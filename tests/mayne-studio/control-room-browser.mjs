import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = resolve(fileURLToPath(new URL('../../public/', import.meta.url)));
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpeg': 'image/jpeg', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.wasm': 'application/wasm' };
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const path = resolve(root, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
    if (path !== root && !path.startsWith(root + sep)) { res.writeHead(403).end(); return; }
    res.writeHead(200, { 'Content-Type': mime[extname(path)] ?? 'application/octet-stream' }).end(await readFile(path));
  } catch { res.writeHead(404).end('Not found'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = 'http://127.0.0.1:' + server.address().port;

async function seed(page) {
  await page.evaluate(async () => {
    const layer = (id, source, x, y, w, h) =>
      ({ id, source, x, y, w, h, opacity: 100, visible: true, fit: 'contain',
        page: 0, matte: 'off', key: '#00a040', coverage: 'balanced', mirror: false });
    const project = {
      id: 'studio-compact-e2e', name: 'Compact Control Room E2E',
      version: 1, updated: Date.now(),
      sources: [
        { id: 'deck-src', type: 'powerpoint', name: 'Training PowerPoint' },
        { id: 'cam-src', type: 'camera', name: 'Classroom camera' },
        { id: 'text-src', type: 'title', name: 'Class title', text: 'On the air', sub: 'Leadership' },
      ],
      scenes: [
        { id: 'standby', name: 'Standby', template: 'standby', background: 'black',
          title: 'Ready', caption: '', backdrop: '', layers: [] },
        { id: 'classroom', name: 'Slides + Presenter', template: 'slides', background: 'navy',
          title: 'Training', caption: '', backdrop: '',
          layers: [layer('deck', 'deck-src', 5, 6, 62, 75),
            layer('camera', 'cam-src', 70, 26, 25, 55),
            layer('title', 'text-src', 6, 86, 42, 11)] },
      ],
      overlays: [
        { id: 'lower', type: 'lower', name: 'Instructor name', text: 'Instructor',
          sub: 'Leadership Class', seconds: 0, animation: 'slide', x: 5, y: 79, w: 50, h: 16 },
      ],
      transition: 'cut', duration: 450, master: 0, masterMute: false, timerSeconds: 300,
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

let browser;
try {
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base + '/mayne-studio.html');
  await page.locator('#studio:not([hidden])').waitFor();
  await seed(page);
  await page.reload();
  await page.locator('#studio:not([hidden])').waitFor();
  await page.locator('#project-name').getByText('Compact Control Room E2E').waitFor();

  // Scenes are horizontally arranged below the two monitors.
  const monitor = await page.locator('.monitors').boundingBox();
  const strip = await page.locator('.scene-pane').boundingBox();
  assert.ok(strip.y >= monitor.y + monitor.height - 1, 'Scene strip is below both output monitors');
  assert.equal(await page.locator('.scene-tile').count(), 2);
  const buttons = page.locator('.scene-tile .scene-gear');
  assert.equal(await buttons.count(), 2, 'Every scene has its own settings button');
  assert.equal(await page.locator('#studio-tools').isVisible(), false,
    'Layers, Overlays and Classroom are hidden by default');

  await buttons.nth(1).click();
  const tools = page.locator('#studio-tools');
  assert.equal(await tools.isVisible(), true);
  assert.equal(await page.locator('#preview-name').textContent(), 'Slides + Presenter',
    'Opening a scene’s controls cues that scene privately');
  assert.equal(await tools.locator('[role="tab"]').count(), 3);
  await tools.locator('#tab-overlays').click();
  assert.ok(await tools.locator('.overlay-card').count() === 1);
  await tools.locator('#tab-classroom').click();
  assert.ok(await tools.getByRole('heading', { name: 'PowerPoint & speaker notes' }).isVisible());
  await tools.getByRole('button', { name: 'Close', exact: true }).click();
  assert.equal(await tools.isVisible(), false);

  // Adjust camera placement visually on the actual private Preview canvas.
  await page.locator('[data-act="arrange-preview"]').click();
  const targets = page.locator('#preview-layer-controls');
  assert.equal(await targets.locator('.inline-preview-target').count(), 3);
  let cam = targets.locator('[data-preview-layer="camera"]');
  const beforeX = Number(await cam.evaluate(el => parseFloat(el.style.left)));
  const monitorFrame = await page.locator('.preview-monitor .monitor-screen').boundingBox();
  let box = await cam.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + monitorFrame.width * .04,
    box.y + box.height / 2 - monitorFrame.height * .03, { steps: 6 });
  await page.mouse.up();
  cam = targets.locator('[data-preview-layer="camera"]');
  const afterX = Number(await cam.evaluate(el => parseFloat(el.style.left)));
  assert.ok(afterX >= beforeX + 3, 'Camera moved by dragging its preview outline');
  const beforeW = Number(await cam.evaluate(el => parseFloat(el.style.width)));
  const se = await cam.locator('[data-preview-handle="se"]').boundingBox();
  assert.ok(se?.width, 'Selected camera exposes corner handles');
  await page.mouse.move(se.x + se.width / 2, se.y + se.height / 2);
  await page.mouse.down();
  await page.mouse.move(se.x + se.width / 2 + monitorFrame.width * .04,
    se.y + se.height / 2 + monitorFrame.height * .03, { steps: 6 });
  await page.mouse.up();
  assert.ok(Number(await cam.evaluate(el => parseFloat(el.style.width))) >= beforeW + 3,
    'Camera resizes by dragging the visible corner');

  // The Program slide controls should only appear after the PowerPoint scene is taken live.
  const live = page.locator('#live-deck-controls');
  assert.equal(await live.isVisible(), false);
  await page.locator('[data-act="cut"]').click();
  await live.waitFor({ state: 'visible' });
  assert.equal(await live.locator('.live-deck-row').count(), 1);
  assert.equal(await live.locator('[data-act="slide-next"]').count(), 1);
  assert.equal(await live.locator('[data-act="slide-prev"]').count(), 1);
  assert.equal(await page.locator('#program-name').textContent(), 'Slides + Presenter');

  // Keyboard assignments survive saving and reload, and default live overlay hotkeys work.
  await page.locator('[data-act="shortcuts"]').click();
  const dialog = page.locator('#dialog');
  const binding = dialog.locator('[data-shortcut="scenePrevious"]');
  await binding.focus();
  await page.keyboard.press('Shift+KeyZ');
  assert.equal(await binding.inputValue(), 'Shift + Z');
  await dialog.locator('[data-act="close-dialog"]').click();
  await page.locator('#save-state').getByText('Saved on this device').waitFor({ timeout: 10000 });
  await page.reload();
  await page.locator('#studio:not([hidden])').waitFor();
  await page.locator('[data-act="shortcuts"]').click();
  assert.equal(await dialog.locator('[data-shortcut="scenePrevious"]').inputValue(), 'Shift + Z');
  await dialog.locator('[data-act="close-dialog"]').click();
  assert.equal(await page.locator('#preview-name').textContent(), 'Standby',
    'Project loads its default private Preview scene');
  await page.keyboard.press('Shift+KeyZ');
  assert.equal(await page.locator('#preview-name').textContent(), 'Slides + Presenter',
    'Custom keyboard shortcuts cue the previous scene in Preview');
  await page.keyboard.press('KeyQ');
  await page.locator('#toast').getByText('Instructor name live.').waitFor();

  // Scene deletion: explicit per-card action, confirmation, live safety, local persistence.
  assert.equal(await page.locator('.scene-delete').count(), 2);
  await page.getByRole('button', { name: 'Delete scene Standby' }).click();
  await page.getByRole('dialog', { name: 'Scene is on air' }).waitFor();
  assert.equal(await page.locator('.scene-tile').count(), 2,
    'The current Program scene cannot be removed');
  await page.locator('#dialog [data-act="close-dialog"]').click();

  await page.getByRole('button', { name: 'Delete scene Slides + Presenter' }).click();
  await page.getByRole('dialog', { name: 'Delete scene' }).waitFor();
  await page.locator('#dialog [data-act="close-dialog"]').last().click();
  assert.equal(await page.locator('.scene-tile').count(), 2, 'Cancel preserves a scene');

  await page.getByRole('button', { name: 'Delete scene Slides + Presenter' }).click();
  await page.getByRole('dialog', { name: 'Delete scene' }).getByRole('button', { name: 'Delete scene' }).click();
  assert.equal(await page.locator('.scene-tile').count(), 1, 'Confirmed deletion removes the selected scene');
  assert.equal(await page.locator('#preview-name').textContent(), 'Standby',
    'Deleting the Preview scene selects a safe remaining scene');
  assert.equal(await page.locator('#program-name').textContent(), 'Standby',
    'Deleting a non-live scene does not change Program');
  assert.equal(await page.locator('.scene-delete:disabled').count(), 1,
    'The last scene cannot be deleted');
  await page.locator('#save-state').getByText('Saved on this device').waitFor({ timeout: 10000 });
  await page.reload();
  await page.locator('#studio:not([hidden])').waitFor();
  assert.equal(await page.locator('.scene-tile').count(), 1, 'Scene deletion survives reloading the saved project');

  await mkdir('test-results', { recursive: true });
  await page.screenshot({ path: 'test-results/mayne-compact-control-room.png', fullPage: true });
  assert.deepEqual(errors, [], 'No uncaught JavaScript errors during control room operation');
  console.log('Compact control room browser checks passed: horizontal scenes, popup tools, direct drag and resize, live deck controls and keyboard mapping.');
  await context.close();
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}
