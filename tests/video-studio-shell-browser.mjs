import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,sep,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
const root=resolve(fileURLToPath(new URL('../public/',import.meta.url)));
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml'};
const server=createServer(async(req,res)=>{
 try{
  const file=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname));
  if(!file.startsWith(root+sep)){res.writeHead(403).end('Forbidden');return;}
  const bytes=await readFile(file);
  res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream'});res.end(bytes);
 }catch{res.writeHead(404).end('Not found');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const url='http://127.0.0.1:'+server.address().port+'/video-studio.html';
let browser;
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});
 for(const width of [390,1440]){
  const context=await browser.newContext({viewport:{width,height:900},acceptDownloads:true});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',err=>errors.push(err.message));
  await page.goto(url);
  await page.locator('#home-title').waitFor({state:'visible'});
  assert.equal(await page.locator('#workspace').isVisible(),false,'editor starts hidden');
  assert.equal(await page.locator('.home-template').count(),5,'five functional starter choices');
  assert.equal(await page.locator('#home-recent-list .home-recent-card').count(),1,'previous starter project visible as recent');
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  assert.ok(overflow<=3,'home fits '+width+'px, overflow '+overflow);
  await page.locator('[data-template="conflict"]').click();
  assert.equal(await page.locator('#scene-list [role="listitem"]').count(),20,'enhanced conflict starter loads its complete lesson');
  assert.match(await page.locator('#project-name').inputValue(),/Managing Conflict/);
  await page.locator('#editor-back-home').click();
  // Blank projects start without a prompt, from the primary create action.
  await page.locator('#home-new-button').click();
  assert.equal(await page.locator('#workspace').isVisible(),true,'new video opens the editor');
  // The editor, not just its home screen, uses the modern light workspace.
  const editorStyle=await page.evaluate(()=>{
   const stage=getComputedStyle(document.querySelector('.stage'));
   const projects=getComputedStyle(document.querySelector('.projects'));
   const inspector=getComputedStyle(document.querySelector('.inspector'));
   const frame=getComputedStyle(document.querySelector('.canvas-shell'));
   return {stage:stage.backgroundColor,projects:projects.backgroundColor,inspector:inspector.backgroundColor,
      frame:frame.borderTopColor,overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth};
  });
  assert.equal(editorStyle.stage,'rgb(241, 243, 248)','scene preview is on a light canvas workspace');
  assert.equal(editorStyle.projects,'rgb(251, 252, 255)','scenes use a light side panel');
  assert.equal(editorStyle.inspector,'rgb(255, 255, 255)','editor inspector matches home styling');
  assert.ok(editorStyle.overflow<=3,'redesigned editor fits '+width+'px, overflow '+editorStyle.overflow);
  assert.equal(await page.locator('.scene-thumb').count(),1,'filmstrip-style scene thumbnail is displayed');
  assert.equal(await page.locator('#stage-choose-character').isVisible(),true);
  await page.locator('#stage-choose-character').click();
  assert.equal(await page.locator('#asset-gallery').isVisible(),true,'preview shortcut opens real presenter assets');
  await page.locator('#stage-edit-script').click();
  assert.equal(await page.locator('#scene-script').isVisible(),true,'preview shortcut opens editable script');
  await page.locator('#stage-add-narration').click();
  assert.equal(await page.locator('#free-generate').isVisible(),true,'preview shortcut opens free AI narration');
  await page.locator('#stage-add-video').click();
  assert.equal(await page.locator('#scene-video').isVisible(),true,'preview shortcut opens clip upload');
  await page.locator('[data-tool-tab="scene"]').click();

  assert.equal(await page.locator('#scene-list [role="listitem"]').count(),1,'blank template contains one editable scene');
  assert.equal(await page.locator('[data-tool-tab="scene"]').getAttribute('aria-selected'),'true');
  assert.equal(await page.locator('[data-tool-tab="voice"]').isVisible(),true);
  await page.locator('[data-tool-tab="characters"]').click();
  assert.equal(await page.locator('#asset-gallery').isVisible(),true,'asset library is opened with a single tab click');
  await page.locator('[data-tool-tab="voice"]').click();
  assert.equal(await page.locator('#free-generate').isVisible(),true,'free narration available within focused voice tab');
  await page.locator('[data-tool-tab="media"]').click();
  assert.equal(await page.locator('#scene-video').isVisible(),true,'video import available');
  await page.locator('#editor-show-all').check();
  assert.equal(await page.locator('#scene-title').isVisible(),true,'all tools reveals text editing');
  assert.equal(await page.locator('#scene-video').isVisible(),true,'all tools reveals video');
  await page.locator('#editor-back-home').click();
  assert.equal(await page.locator('#studio-home').isVisible(),true);
  assert.ok(await page.locator('#home-recent-list .home-recent-card').count()>=3,'conflict and new projects appear in Recents');
  // Real scene script-to-storyboard flow. No paid AI dependency.
  await page.locator('[data-mode="lesson"]').click();
  await page.locator('#home-script').fill('Leaders set direction clearly. Supervisors listen to team concerns. Employees build trust by following through. Practice the approach with one decision.');
  await page.locator('.home-make').click();
  await page.waitForFunction(()=>document.querySelector('#project-name').value.startsWith('Leadership lesson'));
  assert.equal(await page.locator('#scene-list [role="listitem"]').count(),4,'script becomes four editable scenes');
  assert.equal(await page.locator('.scene-thumb').count(),4,'all four scenes have thumbnails');
  assert.equal(await page.locator('.timeline-segment').count(),4,'all scenes are visible in the timeline');
  const colors=await page.locator('.timeline-segment').evaluateAll(nodes=>nodes.map(n=>n.style.getPropertyValue('--scene-bg')));
  assert.equal(new Set(colors).size>=2,true,'timeline is visually distinguished by scene theme');

  assert.match(await page.locator('#scene-script').inputValue(),/Leaders set direction clearly/);
  await page.locator('#editor-back-home').click();
  await page.locator('[data-template="coaching"]').click();
  assert.match(await page.locator('#project-name').inputValue(),/Coaching conversation/);
  assert.equal(await page.locator('#scene-list [role="listitem"]').count(),4,'coaching starter contains real scenes');
  await page.locator('#editor-back-home').click();
  // Recents reopen a project without resetting its data.
  await page.locator('#home-search').fill('Leadership lesson');
  assert.equal(await page.locator('#home-recent-list .home-recent-card').count(),1,'project search filters recent videos');
  await page.locator('#home-recent-list .home-recent-card').first().click();
  assert.match(await page.locator('#project-name').inputValue(),/Leadership lesson/);
  await page.reload();
  await page.locator('#workspace').waitFor({state:'visible'});
  assert.equal(await page.locator('#scene-list [role="listitem"]').count(),4,'editor link reload preserves project');
  await page.locator('#top-home').click();
  assert.equal(await page.locator('#studio-home').isVisible(),true);
  assert.deepEqual(errors,[],'no UI script errors in responsive view '+width);
  await context.close();
 }
 console.log('Video Studio redesign passed: responsive dashboard, template creation, script scenes, recents/search, tabs, all-tools, persistence and navigation.');
}finally{
 if(browser)await browser.close();
 await new Promise(resolve=>server.close(resolve));
}
