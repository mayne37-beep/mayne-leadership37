import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {resolve,sep,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import JSZip from 'jszip';
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
  assert.equal(await page.locator('#video-timeline button').count(),4,'interactive scene timeline is present');
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
  await page.locator('#video-timeline button').nth(1).click();
  assert.match(await page.locator('#scene-title').inputValue(),/Task-oriented behaviors/);
  await page.locator('#scene-list [role="listitem"]').first().locator('button').first().click();
  await page.locator('#scene-title').fill('Updated Task Leadership');
  await page.reload();
  assert.equal(await page.locator('#scene-title').inputValue(),'Updated Task Leadership','edits persist on reload');
  // Exercise real JPEG/PNG photo presenter persistence and compositing.
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLytQAAAABJRU5ErkJggg==','base64');
  await page.locator('#scene-photo').setInputFiles({name:'presenter.png',mimeType:'image/png',buffer:png});
  await page.waitForFunction(()=>document.querySelector('#photo-info')?.textContent?.includes('Photo attached'));
  await page.reload();
  await page.waitForFunction(()=>document.querySelector('#photo-info')?.textContent?.includes('Photo attached'));
  assert.equal(await page.locator('#remove-photo').isEnabled(),true,'photo persists between sessions');

  if(width===1280){
    await page.locator('#asset-tab-backgrounds').click();
    assert.equal(await page.locator('#asset-gallery .asset-card').count(),12,'Leadership 101 backdrop library contains twelve existing assets');
    await page.locator('#asset-gallery .asset-card').first().click();
    assert.match(await page.locator('#status').innerText(),/background applied/i);
    await page.reload();
    await page.locator('#project-choice option').first().waitFor({state:'attached'});
    await page.locator('#asset-tab-backgrounds').click();
    assert.equal(await page.locator('#asset-gallery .asset-card.active').count(),1,'selected background survives reload');
    await page.locator('#asset-remove-background').click();
    await page.locator('#asset-tab-characters').click();
    const zip=new JSZip();
    zip.file('manifest.json',JSON.stringify({format:'mayne-video-character-pack',version:1,characters:[
      {id:'test-presenter',name:'Studio Test Presenter',description:'Studio demo',outfits:{
       professional:'characters/test-presenter-professional.png',casual:'characters/test-presenter-casual.png'}}
    ]}));
    zip.file('characters/test-presenter-professional.png',png);
    zip.file('characters/test-presenter-casual.png',png);
    const archive=await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'});
    await page.locator('#asset-pack-file').setInputFiles({name:'mayne-presenters.zip',mimeType:'application/zip',buffer:archive});
    await page.waitForFunction(()=>document.querySelector('#asset-count')?.textContent?.includes('2 outfits'),{timeout:16000});
    assert.equal(await page.locator('#asset-gallery .asset-card').count(),2,'both professional and casual outfits appear');
    await page.locator('#asset-gallery .asset-card').first().click();
    await page.waitForFunction(()=>document.querySelector('#photo-info')?.textContent?.includes('Photo attached'),{timeout:16000});
    await page.reload();
    await page.locator('#project-choice option').first().waitFor({state:'attached'});
    assert.equal(await page.locator('#asset-gallery .asset-card').count(),2,'character library is reusable after reload');
    assert.equal(await page.locator('#asset-gallery .asset-card.active').count(),1,'selected character outfit persists');
  }

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

 // Phase 3: import an actual browser-encoded video clip, confirm device persistence and re-export.
 const videoBytes=await page.evaluate(async()=>{
   const c=document.createElement('canvas');c.width=160;c.height=90;const ctx=c.getContext('2d');
   const stream=c.captureStream(16);
   const recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp8'});
   const chunks=[];
   recorder.ondataavailable=e=>{if(e.data?.size)chunks.push(e.data);};
   const done=new Promise(resolve=>recorder.onstop=resolve);
   recorder.start(100);
   let n=0;
   const timer=setInterval(()=>{
     ctx.fillStyle=n%2?'#a5162d':'#12bb77';ctx.fillRect(0,0,160,90);
     ctx.fillStyle='white';ctx.fillRect(n%140,14,18,18);n+=7;
   },45);
   await new Promise(r=>setTimeout(r,1250));
   clearInterval(timer);recorder.stop();await done;
   stream.getTracks().forEach(track=>track.stop());
   return [...new Uint8Array(await new Blob(chunks,{type:'video/webm'}).arrayBuffer())];
 });
 assert.ok(videoBytes.length>1000,'test clip contains video bytes');
 await page.locator('#scene-video').setInputFiles({name:'talking-presenter.webm',mimeType:'video/webm',buffer:Buffer.from(videoBytes)});
 await page.waitForFunction(()=>document.querySelector('#video-info')?.textContent?.includes('talking-presenter.webm'),{timeout:20000});
 await page.locator('#video-mode').selectOption('full');
 await page.reload();
 await page.waitForFunction(()=>document.querySelector('#video-info')?.textContent?.includes('talking-presenter.webm'),{timeout:20000});
 assert.equal(await page.locator('#video-mode').inputValue(),'full','video layout persisted');
 assert.equal(await page.locator('#remove-video').isEnabled(),true,'video clip persisted');
 // Remove this clip so the standard narration-audio export case remains independent.
 await page.locator('#remove-video').click();

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
  // Real video clip compositor export test: a single imported moving-video scene.
  await page.locator('#scene-video').setInputFiles({name:'clip-for-render.webm',mimeType:'video/webm',buffer:Buffer.from(videoBytes)});
  await page.waitForFunction(()=>document.querySelector('#video-info')?.textContent?.includes('clip-for-render.webm'),{timeout:20000});
  await page.locator('#video-mode').selectOption('presenter');
  const compositedDownload=page.waitForEvent('download',{timeout:30000});
  await page.locator('#render-video').click();
  const movie=await compositedDownload;
  assert.match(movie.suggestedFilename(),/\.(webm|mp4)$/);
  assert.ok((await stat(await movie.path())).size>1200,'composited video export has data');

 }else console.warn('Browser does not support MediaRecorder; skipped export render');
 assert.deepEqual(errors,[],'no browser errors during render');
 await ctx.close();
 // Offline generation integration test: mock the model output, never download a giant model in CI.
 const freeCtx=await browser.newContext({viewport:{width:1200,height:880},acceptDownloads:true});
 const freePage=await freeCtx.newPage(),freeErrors=[];
 freePage.on('pageerror',err=>freeErrors.push(err.message));
 await freePage.addInitScript(()=>{
   window.Worker=class MockKokoroWorker {
     postMessage(input){
       const rate=24000,size=rate,bytes=44+size*2;
       const buffer=new ArrayBuffer(bytes),d=new DataView(buffer);
       const str=(o,s)=>{for(let i=0;i<s.length;i++)d.setUint8(o+i,s.charCodeAt(i));};
       str(0,'RIFF');d.setUint32(4,bytes-8,true);str(8,'WAVE');str(12,'fmt ');
       d.setUint32(16,16,true);d.setUint16(20,1,true);d.setUint16(22,1,true);
       d.setUint32(24,rate,true);d.setUint32(28,rate*2,true);d.setUint16(32,2,true);
       d.setUint16(34,16,true);str(36,'data');d.setUint32(40,size*2,true);
       for(let i=0;i<size;i++)d.setInt16(44+i*2,Math.round(Math.sin(i*2*Math.PI*320/rate)*5000),true);
       setTimeout(()=>this.onmessage?.({data:{type:'result',buffer,duration:5,voice:input.voice}}),150);
     }
     terminate(){}
   };
 });
 await freePage.goto(base+'/video-studio.html');
 await freePage.locator('#project-choice option').first().waitFor({state:'attached'});
 assert.equal(await freePage.locator('#free-voice option').count()>5,true,'free voice catalog has choices');
 await freePage.locator('#free-voice').selectOption('bm_george');
 await freePage.locator('#free-generate').click();
 await freePage.waitForFunction(()=>document.querySelector('#audio-info')?.textContent?.includes('Attached: free-kokoro-'),{timeout:15000});
 assert.equal(await freePage.locator('#free-download').isEnabled(),true,'downloaded WAV is retained on page');
 assert.equal(await freePage.locator('#scene-duration').inputValue(),'5','scene timing follows generated narration');
 const renderManifest=freePage.waitForEvent('download');
 await freePage.locator('#save-render-job').click();
 assert.match((await renderManifest).suggestedFilename(),/-gpu-render-job\.json$/);
 await freePage.reload();
 await freePage.waitForFunction(()=>document.querySelector('#audio-info')?.textContent?.includes('Attached: free-kokoro-'));
 assert.equal(await freePage.locator('#free-voice').inputValue(),'bm_george','scene voice persists');
 assert.deepEqual(freeErrors,[],'no errors in local free narration integration');
 await freeCtx.close();

 console.log('Video Studio Chromium smoke tests passed: scene edits, browser storage, audio, export and responsive UI.');
}finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
