import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { chromium } from 'playwright';

test('Lesson Authoring Studio rich-text controls accept typing', async () => {
  const root = resolve(process.cwd());
  let version = 1;
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/api/lesson-studio') {
      res.setHeader('Content-Type', 'application/json');
      if (req.method === 'GET') {
        res.end(JSON.stringify(url.searchParams.get('action') === 'list' || url.searchParams.get('action') === 'templates' ? [] : {}));
      } else {
        let body = '';
        for await (const part of req) body += part;
        const action = JSON.parse(body).action;
        res.end(JSON.stringify({ version: action === 'create' ? 1 : ++version }));
      }
      return;
    }
    const file = resolve(root, '.' + decodeURIComponent(url.pathname === '/' ? '/lesson-studio.html' : url.pathname));
    if (!file.startsWith(root + sep)) { res.writeHead(403).end(); return; }
    try {
      const bytes = await readFile(file);
      res.setHeader('Content-Type', ({'.js':'text/javascript','.css':'text/css','.html':'text/html','.svg':'image/svg+xml','.jpg':'image/jpeg','.png':'image/png'})[extname(file)] || 'application/octet-stream');
      res.end(bytes);
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  let browser;
  try {
    browser = await chromium.launch({ headless: true, executablePath: process.env.LCS_TEST_BROWSER || undefined, args: ['--no-sandbox'] });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('http://127.0.0.1:' + server.address().port + '/lesson-studio.html');
    await page.getByRole('button', { name: 'Use sample lesson' }).click();

    const title = page.locator('#content-panel [data-field="title"]').first();
    await title.fill('Editable test course');
    await page.waitForFunction(() => document.querySelector('#toolbar-title')?.textContent === 'Editable test course');

    await page.locator('[data-block-op="edit"]').first().click();
    const contentField = page.locator('#content-panel [contenteditable="true"][data-rich="body"]');
    await contentField.click();
    assert.equal(await contentField.evaluate(el => document.activeElement === el), true, 'Click must focus the rich-text editor, not the Bold toolbar button');
    await page.keyboard.type('Editable paragraph text');
    assert.match(await contentField.innerText(), /Editable paragraph text/);
    await page.waitForFunction(() => document.querySelector('#editor-canvas')?.textContent.includes('Editable paragraph text'));

    await page.locator('[data-block-op="edit"]').nth(1).click();
    const card = page.locator('#content-panel [contenteditable="true"][data-rich="items.0.front"]');
    await card.click();
    assert.equal(await card.evaluate(el => document.activeElement === el), true, 'Flip-card editor must accept focus');
    await page.keyboard.type('Editable card');
    assert.match(await card.innerText(), /Editable card/);
    assert.deepEqual(errors, [], 'No browser JavaScript errors');
  } finally {
    await browser?.close();
    await new Promise(done => server.close(done));
  }
});
