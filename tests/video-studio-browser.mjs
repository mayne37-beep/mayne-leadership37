import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {resolve,sep,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
const root=resolve(fileURLToPath(new URL('../public/',import.meta.url)));
const mime={'.html':'text/html','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml'};
const server=createServer(async(req,res)=>{
 try{
  const u=new URL(req.url,'http://127.0.0.1');
  const file=resolve(root,'.'+decodeURIComponent(u.pathname));
  if(!file.startsWith(root+sep)){res.writeHead(403).end();return;}
  const content=await readFile(file);
  res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream'});res.end(content);
 }catch{res.writeHead(404).end('Not found');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port;
let browser;
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});
 for(const width of [390,1280]){
  const ctx=await browser.newContext({viewport:{width,height:900},acceptDownloads:true});
  const page=await ctx.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('dialog',d=>d.accept('Browser smoke video'));
  await page.goto(base+'/video-studio.html');
  await page.locator('#scene-title').waitFor();
  await page.locator('#project-choice option').first().waitFor({state:'attached',timeout:10000});
  assert.equal(await page.locator('#scene-list [role="listitem"]').count(),4,'starter storyboard has four scenes');
  assert.match(await page.locator('#project-name').inputValue(),/Task vs\. Relationship/);
  const canvasInfo=await page.evaluate(()=>{const c=document.querySelector('canvas'),ctx=c.getContext('2d');
    return {pixel:[...ctx.getImageData(40,40,1,1).data],center:[...ctx.getImageData(640,360,1,1).data],
      width:c.width,height:c.height,sceneCount:document.querySelectorAll('#scene-list [role=listitem]').length,
      stage:document.querySelector('#stage-label').textContent,sceneTitle:document.querySelector('#scene-title').value,
      canvasDataSize:c.toDataURL().length};});
  const painted=canvasInfo.pixel[3]>0;
  if(!painted)console.error('CANVAS DIAGNOSTICS',JSON.stringify({errors,canvasInfo,status:await page.locator('#status').innerText(),options:await page.locator('#project-choice option').count()}));
  assert.ok(painted,'canvas drew its scene');
  const horizontal=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  assert.ok(horizontal<=2,'no horizontal overflow at '+width+': '+horizontal);
  await page.locator('#scene-title').fill('Updated Task Leadership');
  await page.reload();
  assert.equal(await page.locator('#scene-title').inputValue(),'Updated Task Leadership','edits persist on reload');
  await page.locator('#add-scene').click();
  assert.equal(await page.locator('#scene-list [role="listitem"]').count(),5,'scene can be added');
  await page.locator('#clone-scene').click();
  assert.equal(await page.locator('#scene-list [role="listitem"]').count(),6,'scene can be duplicated');
  await page.locator('#remove-scene').click();
  assert.equal(await page.locator('#scene-list [role="listitem"]').count(),5,'scene can be removed');
  const jsonDownload=page.waitForEvent('download');
  await page.locator('#save-json').click();
  assert.match((await jsonDownload).suggestedFilename(),/\.json$/);
  assert.deepEqual(errors,[],'no browser script failures at '+width);
  await ctx.close();
 }
 const ctx=await browser.newContext({viewport:{width:1280,height:900},acceptDownloads:true});
 const page=await ctx.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('dialog',d=>d.accept('Smoke Video'));
 await page.goto(base+'/video-studio.html');
 await page.locator('#new-project').click();
 await page.locator('#scene-duration').fill('3');
 await page.locator('#scene-duration').blur();
 // Generate a short, valid PCM WAV for testing narration persistence and audio mux.
 const sampleRate=22050,samples=sampleRate;
 const wav=Buffer.alloc(44+samples*2);
 wav.write('RIFF',0);wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);
 wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);
 wav.writeUInt32LE(sampleRate,24);wav.writeUInt32LE(sampleRate*2,28);
 wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(samples*2,40);
 for(let i=0;i<samples;i++)wav.writeInt16LE(Math.round(4000*Math.sin(i*2*Math.PI*440/sampleRate)),44+i*2);
 await page.locator('#scene-audio').setInputFiles({name:'narration.wav',mimeType:'audio/wav',buffer:wav});
 await page.waitForFunction(()=>document.querySelector('#audio-info')?.textContent?.startsWith('Attached:'));
 await page.reload();
 await page.waitForFunction(()=>document.querySelector('#audio-info')?.textContent?.startsWith('Attached:'));
 if(await page.evaluate(()=>!!window.MediaRecorder && !!HTMLCanvasElement.prototype.captureStream)){
  const filePromise=page.waitForEvent('download',{timeout:30000});
  await page.locator('#render-video').click();
  const video=await filePromise;
  assert.match(video.suggestedFilename(),/\.(webm|mp4)$/);
  const path=await video.path();assert.ok((await stat(path)).size>1200,'video render produced bytes');
  assert.match(await page.locator('#status').innerText(),/exported/i);
 }else console.warn('Browser does not support MediaRecorder; skipped export render');
 assert.deepEqual(errors,[],'no browser errors during render');
 await ctx.close();
 console.log('Video Studio Chromium smoke tests passed: scene edits, browser storage, audio, export and responsive UI.');
}finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
