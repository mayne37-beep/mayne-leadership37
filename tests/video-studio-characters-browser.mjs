import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {resolve,sep,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {BUILTIN_CHARACTERS,CHARACTER_LOOKS} from '../assets/video-studio-library-core.js';
import {makeScene,safeProjectExport,normalizeProject} from '../assets/video-studio-core.js';

const root=resolve(fileURLToPath(new URL('../public/',import.meta.url)));
const mime={'.html':'text/html','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp'};
const server=createServer(async(req,res)=>{
 try{
  const file=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname));
  if(!file.startsWith(root+sep)){res.writeHead(403).end();return;}
  const content=await readFile(file);
  res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream'});
  res.end(content);
 }catch{if(!res.headersSent)res.writeHead(404);res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=process.env.VIDEO_STUDIO_BASE_URL||'http://127.0.0.1:'+server.address().port;
const outfits=BUILTIN_CHARACTERS.flatMap(c=>Object.values(c.variants));
const sampleCanvas=()=>{
 const sample=document.createElement('canvas');sample.width=20;sample.height=24;
 const ctx=sample.getContext('2d');ctx.drawImage(document.querySelector('#video-canvas'),875,190,310,390,0,0,20,24);
 return [...ctx.getImageData(0,0,20,24).data];
};
const distance=(a,b)=>a.reduce((sum,v,i)=>sum+Math.abs(v-b[i]),0)/a.length;
async function ready(page){
 await page.goto(base+'/video-studio.html?edit=1&all=1');
 await page.locator('#project-choice option').first().waitFor({state:'attached'});
}
async function importProject(page,payload){
 await page.locator('#json-file').setInputFiles({name:'included-characters.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(payload))});
 await page.waitForFunction(name=>document.querySelector('#project-name').value===name&&document.querySelector('#status').textContent.startsWith('Project imported.'),payload.project.name);
}
async function verifyMovieFrames(page,expected,entries,errors=[]){
 const download=page.waitForEvent('download',{timeout:60000}).catch(async error=>{
  console.error('Character export diagnostics:',await page.locator('#status').innerText(),errors);
  throw error;
 });
 await page.locator('#render-video').click();
 const movie=await download;
 assert.match(movie.suggestedFilename(),/\.(mp4|webm)$/);
 assert.ok((await stat(await movie.path())).size>10000,'real video export contains media data');
 const bytes=[...await readFile(await movie.path())];
 const decoded=await page.evaluate(async({bytes,count})=>{
  const url=URL.createObjectURL(new Blob([new Uint8Array(bytes)]));
  const video=document.createElement('video');video.muted=true;video.preload='auto';
  const loaded=new Promise((resolve,reject)=>{video.onloadeddata=resolve;video.onerror=()=>reject(Error('Exported movie could not be decoded'));});
  video.src=url;await loaded;
  const sample=document.createElement('canvas');sample.width=20;sample.height=24;
  const ctx=sample.getContext('2d'),frames=[];
  try{
   for(let i=0;i<count;i++){
    const sought=new Promise(r=>video.addEventListener('seeked',r,{once:true}));
    video.currentTime=i*3+1;await sought;
    ctx.drawImage(video,875,190,310,390,0,0,20,24);
    frames.push([...ctx.getImageData(0,0,20,24).data]);
   }
   return {width:video.videoWidth,height:video.videoHeight,frames};
  }finally{video.removeAttribute('src');video.load();URL.revokeObjectURL(url);}
 },{bytes,count:entries.length});
 assert.equal(decoded.width,1280);assert.equal(decoded.height,720);
 const differences=decoded.frames.map((frame,i)=>distance(frame,expected[i]));
 differences.forEach((difference,i)=>assert.ok(difference<15,entries[i].name+' is present in the decoded video frame (mean pixel difference '+difference.toFixed(2)+')'));
}
let browser;
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});
 let portable;
 const expected=[];
 for(const width of [390,1280]){
  const context=await browser.newContext({viewport:{width,height:900},acceptDownloads:true});
  const page=await context.newPage(),errors=[],failedImages=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('response',r=>{if(r.url().includes('/assets/video-studio/characters/')&&!r.ok())failedImages.push(r.status()+' '+r.url());});
  await ready(page);
  assert.equal(await page.locator('#asset-gallery .asset-card').count(),90,'fresh device has ten original cutouts and eighty expression/pose previews without a ZIP');
  await page.locator('#asset-variant-filter').selectOption('base');
  assert.equal(await page.locator('#asset-gallery .asset-card').count(),10,'original full-resolution outfits remain available');
  assert.match(await page.locator('#asset-count').innerText(),/5 characters/);
  assert.equal(await page.evaluate(()=>localStorage.getItem('mayne-video-character-library-v1')),null,'included library needs no imported catalog');
  const baseline=await page.evaluate(sampleCanvas);
  for(const outfit of outfits){
   const card=page.getByRole('button',{name:'Use '+outfit.name.replace(/ \((.*)\)/,' $1'),exact:true});
   await card.scrollIntoViewIfNeeded();
   await card.locator('img').evaluate(img=>img.decode());
   assert.equal(await card.locator('img').evaluate(img=>img.naturalWidth),1086,'original PNG preview is decoded');
   await card.click();
   await page.waitForFunction(name=>document.querySelector('#photo-info').textContent==='Photo attached: '+name,outfit.name);
   // Canvas redraw happens after the image decode, following the attachment message.
   await page.waitForFunction(id=>performance.getEntriesByType('resource').some(r=>r.name.includes(id+'.png')),outfit.url.split('/').pop().replace('.png',''));
   await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
   const pixels=await page.evaluate(sampleCanvas);
   assert.ok(distance(baseline,pixels)>8,'selected '+outfit.name+' is drawn into the scene');
   if(width===1280)expected.push(pixels);
   assert.equal(await page.locator('#asset-gallery .asset-card.active').count(),1);
  }
  await page.locator('#asset-search').fill('Amara');
  assert.equal(await page.locator('#asset-gallery .asset-card').count(),2,'search finds both outfits');
  await page.locator('#asset-search').fill('Professional');
  assert.equal(await page.locator('#asset-gallery .asset-card').count(),5,'outfit search finds all five people');
  await page.locator('#asset-search').fill('');
  await page.reload();
  await page.waitForFunction(()=>document.querySelector('#photo-info').textContent==='Photo attached: Priya (Casual)');
  assert.equal(await page.locator('#asset-gallery .asset-card.active').count(),1,'outfit selection survives reload');
  await page.locator('#video-timeline button').nth(1).click();
  await page.getByRole('button',{name:'Use Amara Casual',exact:true}).click();
  await page.locator('#video-timeline button').first().click();
  await page.waitForFunction(()=>document.querySelector('#photo-info').textContent==='Photo attached: Priya (Casual)');
  assert.ok(await page.getByRole('button',{name:'Use Priya Casual',exact:true}).evaluate(b=>b.classList.contains('active')),'each scene keeps its own outfit');
  const download=page.waitForEvent('download');await page.locator('#save-json').click();
  const saved=JSON.parse(await readFile(await (await download).path(),'utf8'));
  assert.equal(saved.project.scenes[0].photoAssetId,'mayne-character-priya-casual');
  assert.equal(saved.project.scenes[1].photoAssetId,'mayne-character-amara-casual');
  portable=saved;
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth<=2),'no horizontal overflow');
  assert.deepEqual(errors,[]);assert.deepEqual(failedImages,[]);
  console.log('Included previews, selection, search, reload and JSON export passed at '+width+'px.');
  await context.close();
 }

 // A separate context has no IndexedDB photos or local catalog from the original device.
 const context=await browser.newContext({viewport:{width:1280,height:900},acceptDownloads:true});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await ready(page);await importProject(page,portable);
 await page.waitForFunction(()=>document.querySelector('#photo-info').textContent==='Photo attached: Priya (Casual)');
 assert.ok(await page.getByRole('button',{name:'Use Priya Casual',exact:true}).evaluate(b=>b.classList.contains('active')),'JSON restores the same outfit on a different device');

 const project=safeProjectExport(normalizeProject({name:'All ten included outfits',scenes:outfits.map(v=>makeScene({title:v.name,subtitle:'Permanent website presenter',duration:3,photoAssetId:v.assetId,titleMotion:'none',presenterMotion:'none',transition:'cut'}))}));
 await importProject(page,project);
 // Start from a freshly imported storyboard so later scenes have never been selected.
 await page.locator('#play-preview').click();
 await page.waitForFunction(()=>document.querySelector('#stage-label').textContent==='Playing scene 2');
 const secondScene=await page.evaluate(sampleCanvas);
 assert.ok(distance(secondScene,expected[1])<1,'storyboard preloads an unselected scene outfit before playback');
 await page.locator('#stop-preview').click();

 await verifyMovieFrames(page,expected,outfits,errors);
 assert.deepEqual(errors,[]);
 await context.close();
 console.log('Original cutout export and decoded 1280×720 frames passed.');

 const expansionContext=await browser.newContext({viewport:{width:1280,height:900},acceptDownloads:true});
 const expansionPage=await expansionContext.newPage(),expansionErrors=[];
 expansionPage.on('pageerror',e=>expansionErrors.push(e.message));
 await ready(expansionPage);
 const representative=CHARACTER_LOOKS.map((look,i)=>{
  const person=BUILTIN_CHARACTERS[i%5],style=i%2?'casual':'professional';
  return person.looks[style][look.id];
 });
 const poseFrames=new Map();
 let previews=0;
 for(const look of CHARACTER_LOOKS){
  await expansionPage.locator('#asset-variant-filter').selectOption(look.id);
  assert.equal(await expansionPage.locator('#asset-gallery .asset-card').count(),10,look.id+' appears for all five people and both outfits');
  for(const person of BUILTIN_CHARACTERS){
   for(const style of ['professional','casual']){
    const variant=person.looks[style][look.id];
    const card=expansionPage.getByRole('button',{name:'Use '+person.name+' '+(style==='professional'?'Professional':'Casual')+' · '+look.label,exact:true});
    await card.scrollIntoViewIfNeeded();
    await card.locator('img').evaluate(img=>img.decode());
    assert.deepEqual(await card.locator('img').evaluate(img=>[img.naturalWidth,img.naturalHeight]),[420,320],'original JPEG preview is decoded');
    assert.match(await card.innerText(),/Concept preview/,'preview quality remains explicit');
    await card.click();
    await expansionPage.waitForFunction(name=>document.querySelector('#photo-info').textContent==='Photo attached: '+name,variant.name);
    await expansionPage.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
    if(representative.some(v=>v.assetId===variant.assetId))poseFrames.set(variant.assetId,await expansionPage.evaluate(sampleCanvas));
    assert.equal(await expansionPage.locator('#asset-gallery .asset-card.active').count(),1,'each expression can be selected');
    previews++;
   }
  }
 }
 assert.equal(previews,80);
 assert.equal(poseFrames.size,8);
 assert.equal(await expansionPage.evaluate(()=>localStorage.getItem('mayne-video-character-library-v1')),null,'all eighty expressions need no ZIP or local catalog');
 console.log('All eighty permanent expression/pose JPEG previews and selections passed.');
 const expandedProject=safeProjectExport(normalizeProject({name:'Eight included expressions and poses',scenes:representative.map(v=>makeScene({title:v.name,subtitle:'Included expression and pose',duration:3,photoAssetId:v.assetId,titleMotion:'none',presenterMotion:'none',transition:'cut'}))}));
 await importProject(expansionPage,expandedProject);
 const expandedDownload=expansionPage.waitForEvent('download');await expansionPage.locator('#save-json').click();
 const expandedBackup=JSON.parse(await readFile(await (await expandedDownload).path(),'utf8'));
 assert.deepEqual(expandedBackup.project.scenes.map(s=>s.photoAssetId),representative.map(v=>v.assetId),'JSON retains all included pose IDs');
 assert.deepEqual(expansionErrors,[]);
 await expansionContext.close();

 const mobileContext=await browser.newContext({viewport:{width:390,height:900},acceptDownloads:true});
 const mobilePage=await mobileContext.newPage(),mobileErrors=[];mobilePage.on('pageerror',e=>mobileErrors.push(e.message));
 await ready(mobilePage);await importProject(mobilePage,expandedBackup);
 await mobilePage.waitForFunction(name=>document.querySelector('#photo-info').textContent==='Photo attached: '+name,representative[0].name);
 assert.equal(await mobilePage.locator('#asset-gallery .concept-asset.active').count(),1,'pose restores on a fresh mobile device');
 await mobilePage.locator('#asset-character-filter').selectOption('amara');
 await mobilePage.locator('#asset-outfit-filter').selectOption('professional');
 await mobilePage.locator('#asset-variant-filter').selectOption('neutral');
 assert.equal(await mobilePage.locator('#asset-gallery .asset-card').count(),1,'person, outfit and pose filters work on mobile');
 assert.ok(await mobilePage.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth<=2),'no mobile overflow with expression filters');
 await mobilePage.locator('#scene-list [role="listitem"]').nth(1).locator('button').first().click();
 await mobilePage.waitForFunction(name=>document.querySelector('#photo-info').textContent==='Photo attached: '+name,representative[1].name);
 await mobilePage.locator('#play-preview').click();
 await mobilePage.waitForFunction(()=>document.querySelector('#stage-label').textContent==='Playing scene 3');
 const posePreview=await mobilePage.evaluate(sampleCanvas);
 assert.ok(distance(posePreview,poseFrames.get(representative[2].assetId))<1,'storyboard preloads the next included pose');
 await mobilePage.locator('#stop-preview').click();
 await verifyMovieFrames(mobilePage,representative.map(v=>poseFrames.get(v.assetId)),representative,mobileErrors);
 assert.deepEqual(mobileErrors,[]);
 await mobileContext.close();
 console.log('Included character browser checks passed: 10 originals, all 80 expression/pose previews, filters, fresh-device JSON, per-scene selection, storyboard and decoded 1280×720 original/pose video exports.');
}finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
