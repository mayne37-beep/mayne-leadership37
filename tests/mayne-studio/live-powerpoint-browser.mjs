import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const repo = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const publicRoot = resolve(repo, 'public');
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.webp': 'image/webp', '.wasm': 'application/wasm' };

// Load the actual Studio source (instead of injecting a second mock controller).
// Its test-only window reference is added by this local test server, never the production build.
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    const relative = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    const root = relative.startsWith('/src/mayne-studio/') ? repo : publicRoot;
    const file = resolve(root, '.' + relative);
    if (file !== root && !file.startsWith(root + sep)) { response.writeHead(403).end(); return; }
    let bytes = await readFile(file);
    if (relative === '/src/mayne-studio/app.js') {
      let source = bytes.toString('utf8');
      const original = "else new Studio($('studio')).start();";
      assert.ok(source.includes(original), 'Test controller injection point remains available');
      source = source.replace(original, "else { window.__qaStudio = new Studio($('studio')); window.__qaStudio.start(); }");
      bytes = Buffer.from(source);
    }
    response.writeHead(200, { 'Content-Type': mime[extname(file)] ?? 'application/octet-stream' });
    response.end(bytes);
  } catch (error) { response.writeHead(404).end('Not found'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = 'http://127.0.0.1:' + server.address().port;
let browser;
try {
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 1400, height: 920 } });
  await context.route('**/assets/mayne-studio-app.js', route => route.fulfill({
    status: 200, contentType: 'text/javascript', body: 'import "/src/mayne-studio/app.js";',
  }));
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base + '/mayne-studio.html');
  await page.waitForFunction(() => !!window.__qaStudio?.project);
  await page.evaluate(async () => {
    const makeLayer = (id, source) => ({
      id, source, x: 0, y: 0, w: 100, h: 100, visible: true, opacity: 100,
      fit: 'contain', page: 0, matte: 'off', key: '#00a040', coverage: 'balanced', mirror: false,
    });
    const project = {
      id: 'live-deck-regression', name: 'Live PowerPoint Regression', version: 1, updated: Date.now(),
      sources: [{ id: 'deck-source', type: 'powerpoint', name: 'Class Slides', asset: '', device: '' }],
      scenes: [
        { id: 'standby', template: 'standby', name: 'Standby', background: 'black',
          title: 'Standby', caption: '', backdrop: '', layers: [] },
        { id: 'slides', template: 'presenter', name: 'Slides + presenter', background: 'black',
          title: '', caption: '', backdrop: '', layers: [makeLayer('deck-layer', 'deck-source')] },
      ],
      overlays: [], transition: 'cut', duration: 450, master: 0,
      masterMute: false, timerSeconds: 300,
    };
    window.__qaStudio.load(project);
    const fakeDeck = {
      count: 4, slides: [0, 1, 2, 3].map(n => ({ notes: 'Notes for slide ' + (n + 1) })),
      async render(index, canvas) {
        const colors = ['#da2c41', '#2176ae', '#249f6b', '#bb7c24'];
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = colors[index];
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        return { hints: [] };
      },
    };
    window.__qaStudio.media.entries.set('deck-source', {
      type: 'powerpoint', state: 'ready', deck: fakeDeck, frames: new Map(),
    });
    window.__qaStudio.setPreview('slides');
  });

  // Take a PowerPoint live. Both buses display the same source but use separate scene snapshots.
  await page.locator('[data-act="cut"]').click();
  await page.waitForFunction(() => window.__qaStudio.program.scene.id === 'slides');
  await page.evaluate(() => window.__qaStudio.setPreview('slides'));
  const pages = () => page.evaluate(() => ({
    program: window.__qaStudio.program.scene.layers[0].page,
    preview: window.__qaStudio.scene.layers[0].page,
  }));
  assert.deepEqual(await pages(), { program: 0, preview: 0 });

  // The on-air Program controls must affect Program, even with Preview on the same scene.
  const live = page.locator('#live-deck-controls');
  await live.waitFor({ state: 'visible' });
  await live.locator('[data-act="slide-next"]').click();
  assert.deepEqual(await pages(), { program: 1, preview: 0 });
  await live.locator('[data-act="slide-prev"]').click();
  assert.deepEqual(await pages(), { program: 0, preview: 0 });

  // PageDown/PageUp are live shortcuts; period/comma are Preview shortcuts.
  await page.locator('.control-heading').click();
  await page.keyboard.press('PageDown');
  assert.deepEqual(await pages(), { program: 1, preview: 0 },
    'The live Next shortcut moves Program and never Preview');
  await page.keyboard.press('Period');
  assert.deepEqual(await pages(), { program: 1, preview: 1 },
    'The Preview Next shortcut moves only Preview');

  // Check the independently rendered canvases, not merely slide counter labels.
  await page.waitForFunction(() => {
    const studio = window.__qaStudio;
    return studio.media.get('deck-source')?.frames.get(1)?.ready === true;
  });
  const pixels = await page.evaluate(() => {
    const sample = id => {
      const canvas = document.querySelector(id);
      const ctx = canvas.getContext('2d');
      return Array.from(ctx.getImageData(canvas.width / 2, canvas.height / 2, 1, 1).data).slice(0, 3);
    };
    return { preview: sample('#preview-canvas'), program: sample('#program-canvas') };
  });
  assert.ok(pixels.program[2] > pixels.program[0], 'Program shows the blue second slide');

  // A separate Program Output window must forward its keyboard shortcuts to the controller.
  const popupPromise = context.waitForEvent('page');
  await page.locator('[data-act="output"]').click();
  const output = await popupPromise;
  await output.waitForLoadState();
  await output.keyboard.press('PageDown');
  await page.waitForFunction(() => window.__qaStudio.program.scene.layers[0].page === 2);
  assert.deepEqual(await pages(), { program: 2, preview: 1 },
    'Keyboard input in the live output window advances only the Program PowerPoint');
  await output.keyboard.press('PageUp');
  await page.waitForFunction(() => window.__qaStudio.program.scene.layers[0].page === 1);
  assert.deepEqual(await pages(), { program: 1, preview: 1 });

  // Custom shortcuts continue to work in the separate Program Output window.
  await page.evaluate(() => {
    window.__qaStudio.project.shortcuts.programNext = 'Shift+KeyN';
  });
  await output.keyboard.press('Shift+N');
  await page.waitForFunction(() => window.__qaStudio.program.scene.layers[0].page === 2);
  assert.deepEqual(await pages(), { program: 2, preview: 1 });
  await output.close();
  assert.deepEqual(errors, []);
  console.log('Live PowerPoint keyboard regression passed: dedicated Program/Preview slides and popup shortcuts.');
  await context.close();
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}
