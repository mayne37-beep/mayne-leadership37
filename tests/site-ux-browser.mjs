import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join,sep,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
const root=resolve(fileURLToPath(new URL('../public/',import.meta.url)));
const mimetypes={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.json':'application/json'};
const server=createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://localhost');
  const file=resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
  if(file!==root&&!file.startsWith(root+sep)){res.writeHead(403).end();return;}
  const bytes=await readFile(file);
  res.writeHead(200,{'Content-Type':mimetypes[extname(file)]||'application/octet-stream'});res.end(bytes);
 }catch(e){res.writeHead(404).end('Not found');}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base='http://127.0.0.1:'+server.address().port;
let browser;
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 await mkdir('test-results',{recursive:true});
 const pages=['index.html','learning.html','assessments.html','tools.html','facilitation.html','create.html','about.html','services.html','contact.html','testimonials.html','demo-center.html','simulations.html','catalog.html'];
 for(const width of [375,768,1280]){
  const context=await browser.newContext({viewport:{width,height:850},deviceScaleFactor:1});
  const page=await context.newPage();
  for(const file of pages){
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(base+'/'+file,{waitUntil:'load'});
   await page.locator('main#main').waitFor();
   const scroll=await page.evaluate(()=>({scrollWidth:document.documentElement.scrollWidth,clientWidth:document.documentElement.clientWidth}));
   assert.ok(scroll.scrollWidth<=scroll.clientWidth+2,`${file} at ${width}px overflows horizontally: ${JSON.stringify(scroll)}`);
   assert.deepEqual(errors,[],`${file} at ${width}px JS errors`);
   if(width===375&&['index.html','catalog.html'].includes(file)) await page.screenshot({path:`test-results/${file}-mobile.png`,fullPage:true});
   if(width===1280&&['index.html','catalog.html'].includes(file))await page.screenshot({path:`test-results/${file}-desktop.png`,fullPage:true});
  }
  await page.goto(base+'/catalog.html');
  const menu=page.locator('#menu-btn');
  if(width<1180){
   assert.equal(await menu.isVisible(),true);
   await menu.click();assert.equal(await page.locator('#nav').isVisible(),true);
   assert.equal(await menu.getAttribute('aria-expanded'),'true');
   await page.keyboard.press('Escape');
   assert.equal(await menu.getAttribute('aria-expanded'),'false');
  }else assert.equal(await menu.isVisible(),false);
  await page.locator('[data-catalog-filter="assessments"]').click();
  assert.equal(await page.locator('.catalog-card:visible').count(),6);
  await page.locator('#catalog-search').fill('360');
  assert.equal(await page.locator('.catalog-card:visible').count(),1);
  await page.locator('#catalog-clear').click();
  assert.equal(await page.locator('.catalog-card:visible').count(),6);

  await page.goto(base+'/word-cloud-studio.html');
  const slides=page.getByRole('complementary',{name:'Slides',exact:true});
  const list=slides.getByRole('list',{name:'Presentation slides'});
  const stage=page.locator('#editorStage');
  const sidebarBounds=await slides.boundingBox(),stageBounds=await stage.boundingBox();
  assert.ok(sidebarBounds.x===0&&sidebarBounds.x+sidebarBounds.width<=stageBounds.x,
    `Slide sidebar is to the left of the canvas at ${width}px`);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),
    `Classroom Response Studio fits at ${width}px`);
  await slides.getByRole('button',{name:'Add slide',exact:true}).click();
  assert.ok(await page.locator('#drawer').isVisible());
  await page.getByLabel('Your question').fill('How will you use this?');
  await slides.getByRole('button',{name:'Duplicate selected slide'}).click();
  assert.equal(await list.getByRole('listitem').count(),3);
  assert.match(await list.locator('[aria-current="true"]').getAttribute('aria-label'),/^Slide 3, How will you use this\?$/);
  await list.getByRole('button',{name:'Move slide 3 up'}).focus();
  await page.keyboard.press('Enter');
  assert.match(await list.locator('[aria-current="true"]').getAttribute('aria-label'),/^Slide 2, How will you use this\?$/);
  await slides.getByRole('button',{name:'Remove selected slide'}).click();
  await page.getByRole('dialog',{name:'Remove this slide?'}).getByRole('button',{name:'Remove slide',exact:true}).click();
  assert.equal(await list.getByRole('listitem').count(),2);
  assert.equal(await page.getByLabel('Your question').inputValue(),'How will you use this?');
  await page.reload();
  assert.equal(await list.getByRole('listitem').count(),2);
  assert.equal(await stage.getByRole('heading').textContent(),'How will you use this?');
  if(width===1280){
   const previews=list.locator('.slide-select');
   await previews.first().dragTo(previews.last());
   assert.match(await previews.first().getAttribute('aria-label'),/^Slide 1, How will you use this\?$/);
   assert.equal(await previews.first().getAttribute('aria-current'),'true');
   await page.getByRole('button',{name:'Start presentation',exact:true}).click();
   assert.equal(await slides.isVisible(),false);
   await page.keyboard.press('Escape');
   assert.equal(await slides.isVisible(),true);
  }
  await context.close();
 }
 console.log('Site responsive browser checks passed at 375, 768 and 1280 px.');
}finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
