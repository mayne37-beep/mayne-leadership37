import { cp, mkdir, readdir, rm, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { buildWordConverter } from './build-word-converter.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.join(root,'public');
await rm(out,{recursive:true,force:true});await mkdir(out,{recursive:true});
// Retain every existing page, route, asset, and student response surface.
for(const entry of await readdir(root,{withFileTypes:true})) {
  if(entry.isFile() && /\.(html|css|svg|xml|txt)$/.test(entry.name)) await copyFile(path.join(root,entry.name),path.join(out,entry.name));
}
await cp(path.join(root,'assets'),path.join(out,'assets'),{recursive:true});
const require=createRequire(import.meta.url);
const pdfiumDist=path.dirname(require.resolve('@embedpdf/pdfium'));
await copyFile(path.join(pdfiumDist,'pdfium.wasm'),path.join(out,'assets','pdfium.wasm'));
await build({entryPoints:[path.join(root,'src','pdf-studio-app.js')],outfile:path.join(out,'assets','pdf-studio.js'),bundle:true,minify:true,format:'esm',platform:'browser',target:['es2022'],legalComments:'eof',external:['/assets/pdf-ocr.js']});
await build({entryPoints:[path.join(root,'src','pdf-studio-ocr.js')],outfile:path.join(out,'assets','pdf-ocr.js'),bundle:true,minify:true,format:'esm',platform:'browser',target:['es2022'],legalComments:'eof'});
const ocrDir=path.join(out,'assets','pdf-ocr');await mkdir(ocrDir,{recursive:true});
await copyFile(require.resolve('tesseract.js/dist/worker.min.js'),path.join(ocrDir,'worker.min.js'));
const coreDir=path.dirname(require.resolve('tesseract.js-core'));
for(const entry of await readdir(coreDir)) if(/\.wasm(?:\.js)?$/.test(entry)||/^tesseract-core.*\.js$/.test(entry)) await copyFile(path.join(coreDir,entry),path.join(ocrDir,entry));
await copyFile(require.resolve('tesseract.js/dist/worker.min.js.LICENSE.txt'),path.join(ocrDir,'worker.min.js.LICENSE.txt'));
const licenseDir=path.join(out,'assets','pdf-licenses');await mkdir(licenseDir,{recursive:true});
await copyFile(path.resolve(pdfiumDist,'..','LICENSE'),path.join(licenseDir,'embedpdf-MIT.txt'));
await copyFile(path.resolve(pdfiumDist,'..','LICENSE.pdfium'),path.join(licenseDir,'pdfium-BSD.txt'));
await copyFile(require.resolve('tesseract.js/LICENSE.md'),path.join(licenseDir,'tesseract-Apache-2.0.txt'));
await copyFile(path.join(coreDir,'LICENSE'),path.join(licenseDir,'tesseract-core-Apache-2.0.txt'));
await copyFile(require.resolve('pdf-lib/LICENSE.md'),path.join(licenseDir,'pdf-lib-MIT.txt'));
console.log('PDF Studio built; existing pages preserved; PDF and OCR engines served from this site.');
await buildWordConverter(root,out);

await build({entryPoints:[path.join(root,'src','lesson-export.js')],outfile:path.join(out,'assets','lesson-export.js'),bundle:true,minify:true,format:'esm',platform:'browser',target:['es2022'],legalComments:'eof'});
console.log('Lesson Studio export runtime built.');

await build({entryPoints:[path.join(root,'src','challenge','App.jsx')],outfile:path.join(out,'assets','challenge-app.js'),bundle:true,minify:true,format:'esm',platform:'browser',target:['es2022'],legalComments:'eof'});
console.log('Leadership Challenge Studio built.');
