import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, copyFile, stat, rename, readFile, writeFile } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { createBrotliCompress, constants } from 'node:zlib';
import path from 'node:path';
import { createRequire } from 'node:module';
import { build } from 'esbuild';

export async function buildWordConverter(root, out) {
  const require = createRequire(import.meta.url);
  const packageFile = require.resolve('@matbee/libreoffice-converter/package.json');
  const pkg = JSON.parse(await readFile(packageFile, 'utf8'));
  const runtime = path.dirname(packageFile), engine = path.join(out, 'assets', 'word-engine');
  const cache = path.join(root, 'tmp', 'word-engine', pkg.version);
  await mkdir(engine, { recursive: true });
  await mkdir(cache, { recursive: true });
  for (const name of ['soffice.js', 'soffice.worker.js']) await copyFile(path.join(runtime, 'wasm', name), path.join(engine, name));
  await copyFile(path.join(runtime, 'dist', 'browser.worker.global.js'), path.join(engine, 'runtime.worker.js'));
  await copyFile(path.join(root, 'src', 'word-converter-worker.js'), path.join(engine, 'client-worker.js'));
  const assets = [];
  for (const name of ['soffice.wasm', 'soffice.data']) {
    const source = path.join(runtime, 'wasm', name), compressed = path.join(cache, `${name}.br`);
    try { await stat(compressed); } catch {
      const partial = `${compressed}.tmp`;
      await pipeline(createReadStream(source), createBrotliCompress({ params: { [constants.BROTLI_PARAM_QUALITY]: 6 } }), createWriteStream(partial));
      await rename(partial, compressed);
    }
    await copyFile(compressed, path.join(engine, `${name}.br`));
    assets.push({ name: `${name}.br`, bytes: (await stat(compressed)).size, decodedBytes: (await stat(source)).size });
  }
  await writeFile(path.join(engine, 'manifest.json'), JSON.stringify({ version: pkg.version, assets }, null, 2) + '\n');
  await copyFile(path.join(path.dirname(require.resolve('jszip/package.json')), 'LICENSE.markdown'), path.join(engine, 'JSZip-LICENSE.txt'));
  await build({ entryPoints: [path.join(root, 'src', 'word-to-pdf-app.js')], outfile: path.join(out, 'assets', 'word-to-pdf.js'), bundle: true, minify: true, format: 'esm', platform: 'browser', target: ['es2022'], legalComments: 'eof', external: ['/assets/word-preview.js'] });
  await build({ entryPoints: [path.join(root, 'src', 'word-converter-preview.js')], outfile: path.join(out, 'assets', 'word-preview.js'), bundle: true, minify: true, format: 'esm', platform: 'browser', target: ['es2022'], legalComments: 'eof' });
  console.log(`Word-to-PDF built; document engine ${pkg.version}; ${(assets.reduce((sum, item) => sum + item.bytes, 0) / 1048576).toFixed(1)} MB initial engine download; documents remain on the user's device.`);
}
