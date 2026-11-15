import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const repo = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const publicRoot = resolve(repo, 'public');
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp' };
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    const relative = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    const root = relative.startsWith('/src/mayne-studio/') ? repo : publicRoot;
    const path = resolve(root, '.' + relative);
    if (path !== root && !path.startsWith(root + sep)) { response.writeHead(403).end(); return; }
    const bytes = await readFile(path);
    response.writeHead(200, { 'Content-Type': mime[extname(path)] ?? 'application/octet-stream' }).end(bytes);
  } catch { response.writeHead(404).end('Not found'); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const base = 'http://127.0.0.1:' + server.address().port;
let browser;

try {
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base + '/mayne-studio.html');
  await page.locator('#studio:not([hidden])').waitFor();

  assert.equal(await page.locator('#transition option').count(), 18,
    'The control room exposes every transition option');
  assert.equal(await page.locator('#transition optgroup').count(), 5,
    'Transitions are grouped into readable categories');
  await page.locator('#transition').selectOption('push-left');
  await page.locator('#transition-ms').selectOption('1000');
  await page.locator('[data-act="save"]').click();
  await page.locator('#save-state').getByText('Saved on this device').waitFor({ timeout: 10000 });
  await page.reload();
  await page.locator('#studio:not([hidden])').waitFor();
  assert.equal(await page.locator('#transition').inputValue(), 'push-left',
    'New transition selections survive project save and reload');
  assert.equal(await page.locator('#transition-ms').inputValue(), '1000',
    'Transition duration survives project save and reload');

  // Paint real canvas frames for every available effect, using distinctive flat colors.
  // Verify exact endpoints and that intermediate frames change in the expected direction.
  const results = await page.evaluate(async () => {
    const { TRANSITIONS, paintTransition } = await import('/src/mayne-studio/transitions.js');
    const w = 200, h = 120;
    const make = color => {
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const context = canvas.getContext('2d');
      context.fillStyle = color;
      context.fillRect(0, 0, w, h);
      return canvas;
    };
    const old = make('#db3344'), next = make('#287dcc'), output = make('#000000');
    const context = output.getContext('2d');
    const sample = (x, y) => {
      const data = context.getImageData(x, y, 1, 1).data;
      return [data[0], data[1], data[2]];
    };
    const classify = value => value[0] > 170 && value[2] < 140 ? 'old'
      : value[2] > 170 && value[0] < 100 ? 'new'
        : value.every(item => item < 5) ? 'black' : 'mixed';
    const all = {};
    for (const type of Object.keys(TRANSITIONS)) {
      paintTransition(context, type, 0, old, next);
      const beginning = classify(sample(100, 60));
      paintTransition(context, type, .5, old, next);
      const middle = {
        left: classify(sample(25, 60)),
        right: classify(sample(175, 60)),
        top: classify(sample(100, 20)),
        bottom: classify(sample(100, 100)),
        center: classify(sample(100, 60)),
        corner: classify(sample(5, 5)),
      };
      paintTransition(context, type, 1, old, next);
      const end = classify(sample(100, 60));
      all[type] = { beginning, middle, end };
    }
    return all;
  });

  assert.equal(Object.keys(results).length, 18);
  for (const [type, values] of Object.entries(results)) {
    assert.equal(values.beginning, type === 'cut' ? 'new' : 'old',
      type + ' begins with the correct outgoing picture');
    assert.equal(values.end, 'new', type + ' finishes with the exact incoming picture');
  }
  assert.equal(results.dip.middle.center, 'black', 'Dip to black actually reaches black');
  assert.equal(results['wipe'].middle.left, 'new');
  assert.equal(results['wipe'].middle.right, 'old');
  assert.equal(results['wipe-left'].middle.left, 'old');
  assert.equal(results['wipe-left'].middle.right, 'new');
  assert.equal(results['wipe-up'].middle.top, 'old');
  assert.equal(results['wipe-up'].middle.bottom, 'new');
  assert.equal(results['wipe-down'].middle.top, 'new');
  assert.equal(results['wipe-down'].middle.bottom, 'old');
  for (const type of ['slide-left', 'push-left']) {
    assert.equal(results[type].middle.left, 'old', type);
    assert.equal(results[type].middle.right, 'new', type);
  }
  for (const type of ['slide-right', 'push-right']) {
    assert.equal(results[type].middle.left, 'new', type);
    assert.equal(results[type].middle.right, 'old', type);
  }
  for (const type of ['slide-up', 'push-up']) {
    assert.equal(results[type].middle.top, 'old', type);
    assert.equal(results[type].middle.bottom, 'new', type);
  }
  for (const type of ['slide-down', 'push-down']) {
    assert.equal(results[type].middle.top, 'new', type);
    assert.equal(results[type].middle.bottom, 'old', type);
  }
  assert.equal(results.iris.middle.center, 'new', 'Iris opens from the center');
  assert.equal(results.iris.middle.corner, 'old', 'Iris leaves outside pixels on the old scene');
  assert.equal(results.fade.middle.center, 'mixed', 'Crossfade mixes frames');
  assert.equal(results['zoom-in'].middle.center, 'mixed', 'Zoom in animates the incoming frame');
  assert.equal(results['zoom-out'].middle.center, 'mixed', 'Zoom out animates the incoming frame');

  assert.deepEqual(errors, []);
  console.log('18 animated transitions passed pixel rendering checks; transition choice and duration persist.');
  await context.close();
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}
