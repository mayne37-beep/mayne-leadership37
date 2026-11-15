import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const repo = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const root = resolve(repo, 'public');
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.webp': 'image/webp', '.jpg': 'image/jpeg', '.wasm': 'application/wasm' };
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const relative = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    const base = relative.startsWith('/src/mayne-studio/') ? repo : root;
    const file = resolve(base, '.' + relative);
    if (file !== base && !file.startsWith(base + sep)) { res.writeHead(403).end(); return; }
    let bytes = await readFile(file);
    if (relative === '/src/mayne-studio/app.js') {
      const source = bytes.toString('utf8');
      const old = "else new Studio($('studio')).start();";
      assert.ok(source.includes(old), 'Test controller hook exists');
      bytes = Buffer.from(source.replace(old,
        "else { window.__qaStudio = new Studio($('studio')); window.__qaStudio.start(); }"));
    }
    res.writeHead(200, { 'Content-Type': mime[extname(file)] ?? 'application/octet-stream' }).end(bytes);
  } catch { res.writeHead(404).end('Not found'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = 'http://127.0.0.1:' + server.address().port + '/mayne-studio.html';
let browser;
try {
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  await context.route('**/assets/mayne-studio-app.js', route => route.fulfill({
    status: 200, contentType: 'text/javascript', body: 'import "/src/mayne-studio/app.js";',
  }));
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(url);
  await page.waitForFunction(() => !!window.__qaStudio?.project);

  const buttons = page.locator('.monitors .favorite-transition');
  assert.equal(await buttons.count(), 5, 'Five transition favorite buttons appear between monitors');
  assert.equal(await page.locator('.favorite-config').count(), 1);
  assert.deepEqual(await buttons.evaluateAll(nodes => nodes.map(node => node.dataset.id)),
    ['0', '1', '2', '3', '4']);
  assert.ok((await buttons.nth(0).getAttribute('aria-label')).includes('Crossfade'));

  await page.locator('[data-act="favorite-config"]').click();
  const dialog = page.getByRole('dialog', { name: 'Configure favorite transitions' });
  await dialog.waitFor();
  assert.equal(await dialog.locator('select').count(), 5);
  const selected = ['wipe-up', 'iris', 'push-right', 'slide-left', 'cut'];
  for (let i = 0; i < 5; i++) await dialog.locator('select[name="favorite' + i + '"]').selectOption(selected[i]);
  await dialog.getByRole('button', { name: 'Save favorites' }).click();
  assert.equal(await dialog.isVisible(), false);
  assert.deepEqual(await page.evaluate(() => window.__qaStudio.project.favoriteTransitions), selected);
  assert.equal(await buttons.count(), 5);
  assert.ok((await buttons.nth(1).getAttribute('aria-label')).includes('Iris open'));

  // Duplicated effects must be rejected rather than silently creating identical favorites.
  await page.locator('[data-act="favorite-config"]').click();
  await dialog.locator('select[name="favorite0"]').selectOption('iris');
  await dialog.getByRole('button', { name: 'Save favorites' }).click();
  await page.locator('#toast').getByText('Each of the five favorites must use a different transition.').waitFor();
  assert.equal(await dialog.isVisible(), true, 'Invalid duplicate keeps the editor open');
  await dialog.locator('[data-act="close-dialog"]').click();
  assert.deepEqual(await page.evaluate(() => window.__qaStudio.project.favoriteTransitions), selected,
    'Invalid attempt leaves all favorite assignments untouched');

  // All five buttons must perform one-click Take with their own effect,
  // independently of the normal Take dropdown and without editing its value.
  await page.evaluate(() => {
    const studio = window.__qaStudio;
    studio.project.transition = 'fade';
    studio.project.duration = 950;
    studio.render();
  });
  for (let i = 0; i < 5; i++) {
    const target = await page.evaluate(index => {
      const studio = window.__qaStudio;
      const next = studio.project.scenes[(index + 1) % studio.project.scenes.length];
      studio.setPreview(next.id);
      return next.id;
    }, i);
    await buttons.nth(i).click();
    const current = await page.evaluate(() => {
      const studio = window.__qaStudio;
      return {
        programId: studio.program.scene.id, transition: studio.transition?.type || 'cut',
        currentDefault: studio.project.transition,
      };
    });
    assert.equal(current.programId, target, 'Favorite ' + (i + 1) + ' takes the cued scene live');
    assert.equal(current.transition, selected[i], 'Favorite ' + (i + 1) + ' uses the assigned effect');
    assert.equal(current.currentDefault, 'fade', 'Favorite Take never changes the normal transition selector');
    await page.waitForFunction(() => window.__qaStudio.transition === null);
    assert.equal(await buttons.nth(i).isDisabled(), false,
      'Favorite ' + (i + 1) + ' is available after transition finishes');
  }

  await page.locator('[data-act="save"]').click();
  await page.locator('#save-state').getByText('Saved on this device').waitFor({ timeout: 10000 });
  await page.reload();
  await page.waitForFunction(() => !!window.__qaStudio?.project);
  assert.deepEqual(await page.evaluate(() => window.__qaStudio.project.favoriteTransitions), selected,
    'All five custom favorites persist in IndexedDB after reloading');
  assert.equal(await buttons.count(), 5);
  assert.ok((await buttons.nth(4).getAttribute('aria-label')).includes('Cut (instant)'));

  // Resetting preferences restores initial defaults and is saved to the project.
  await page.locator('[data-act="favorite-config"]').click();
  await dialog.locator('[data-act="favorite-reset"]').click();
  assert.deepEqual(await page.evaluate(() => window.__qaStudio.project.favoriteTransitions),
    ['fade', 'wipe', 'push-left', 'zoom-in', 'dip']);
  assert.equal(await dialog.locator('select[name="favorite0"]').inputValue(), 'fade');
  await dialog.locator('[data-act="close-dialog"]').click();

  // Mobile keeps the five favorites accessible inside the switcher between the monitors.
  await page.setViewportSize({ width: 375, height: 850 });
  const boxes = await Promise.all([
    page.locator('.preview-monitor').boundingBox(),
    page.locator('.switch-controls').boundingBox(),
    page.locator('.program-monitor').boundingBox(),
  ]);
  assert.ok(boxes[0].y + boxes[0].height <= boxes[1].y + 1);
  assert.ok(boxes[1].y + boxes[1].height <= boxes[2].y + 1);
  assert.equal(await buttons.count(), 5);
  for (let i = 0; i < 5; i++) {
    const box = await buttons.nth(i).boundingBox();
    assert.ok(box.width >= 70 && box.height >= 24, 'Favorite ' + (i + 1) + ' is mobile-tappable');
    assert.ok(box.x >= 0 && box.x + box.width <= 376, 'Favorite ' + (i + 1) + ' fits mobile screen');
  }

  assert.deepEqual(errors, [], 'No uncaught errors while using favorites');
  console.log('Five favorites: defaults, edit, distinct-only, instant Take, configured transitions, persistence and responsive controls passed.');
  await context.close();
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}
