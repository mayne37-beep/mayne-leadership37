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
  assert.equal(await page.locator('.catalog-card:visible').count(),5);
  await page.locator('#catalog-search').fill('360');
  assert.equal(await page.locator('.catalog-card:visible').count(),1);
  await page.locator('#catalog-clear').click();
  assert.equal(await page.locator('.catalog-card:visible').count(),5);
  await context.close();
 }
 console.log('Site responsive browser checks passed at 375, 768 and 1280 px.');
}finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
