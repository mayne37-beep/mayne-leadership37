import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const repo = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const root = resolve(repo,'public');
const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png',
  '.jpg':'image/jpeg','.webp':'image/webp','.wasm':'application/wasm'};
const server = createServer(async (request, response) => {
  try {
    const url=new URL(request.url,'http://localhost');
    const relative=decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    const base=relative.startsWith('/src/mayne-studio/') ? repo : root;
    const file=resolve(base,'.'+relative);
    if(file !== base && !file.startsWith(base+sep)) {
      response.writeHead(403).end(); return;
    }
    let content=await readFile(file);
    if(relative === '/src/mayne-studio/app.js') {
      const input=content.toString('utf8');
      const marker="else new Studio($('studio')).start();";
      assert.ok(input.includes(marker),'Studio test entry point exists');
      content=Buffer.from(input.replace(marker,
        "else { window.__qaStudio = new Studio($('studio')); window.__qaStudio.start(); }"));
    }
    response.writeHead(200,{'Content-Type':mime[extname(file)]??'application/octet-stream'}).end(content);
  } catch { response.writeHead(404).end('Not found'); }
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
let browser;
try {
  browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const context=await browser.newContext({viewport:{width:1440,height:950}});
  await context.route('**/assets/mayne-studio-app.js',route=>route.fulfill({
    status:200,contentType:'text/javascript',body:'import "/src/mayne-studio/app.js";',
  }));
  const page=await context.newPage();
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://127.0.0.1:'+server.address().port+'/mayne-studio.html');
  await page.waitForFunction(()=>!!window.__qaStudio?.project);
  await page.evaluate(()=>{
    const layer=(id,source,box={x:0,y:0,w:100,h:100})=>({
      id,source,...box,opacity:100,visible:true,fit:'contain',page:0,
      matte:'off',key:'#00a040',coverage:'balanced',mirror:false,
    });
    const project={
      id:'nested-studio-e2e',name:'Nested Studio Test',version:1,updated:Date.now(),
      sources:[{
        id:'course-deck',type:'powerpoint',name:'Course slides',asset:'',
        device:'',route:'scene',gain:0,mute:false,loop:false,autoplay:true,
      }],
      scenes:[
        {id:'slides-only',name:'Full slides',template:'blank',background:'black',
          title:'',caption:'',backdrop:'',layers:[layer('source-slides','course-deck')]},
        {id:'studio',name:'Instruction studio',template:'blank',background:'black',
          title:'',caption:'',backdrop:'',layers:[]},
        {id:'break',name:'Empty scene',template:'blank',background:'black',
          title:'',caption:'',backdrop:'',layers:[]},
      ],
      overlays:[],transition:'cut',duration:450,master:0,masterMute:false,timerSeconds:300,
    };
    const studio=window.__qaStudio;
    project.shortcuts={...studio.project.shortcuts};
    studio.load(project);
    const colors=['#e12d3f','#2176ae','#249f6b','#bb7c24'];
    const deck={
      count:4,slides:colors.map((color,n)=>({notes:'Instructor notes for '+(n+1)})),
      async render(index,canvas){
        const ctx=canvas.getContext('2d');
        ctx.fillStyle=colors[index];
        ctx.fillRect(0,0,canvas.width,canvas.height);
        return {hints:[]};
      },
    };
    studio.media.entries.set('course-deck',{
      type:'powerpoint',state:'ready',deck,frames:new Map(),
    });
    studio.setPreview('studio');
  });
  assert.equal(await page.locator('.scene-tile').count(),3);
  assert.equal(await page.evaluate(()=>window.__qaStudio.project.scenes[1].layers.length),0,
    'Studios remain user-configured, with zero automatic cameras or slideshow layers');

  // Exercise the actual UI for reusing an existing scene as a layer.
  await page.locator('[data-act="scene-tools"][data-id="studio"]').click();
  const editor=page.locator('#studio-tools');
  await editor.waitFor({state:'visible'});
  await editor.locator('[data-act="add-context"]').click();
  const add=page.getByRole('dialog',{name:'Add an input'});
  await add.waitFor();
  await add.locator('[data-act="input-scene"]').click();
  const compose=page.getByRole('dialog',{name:'Embed another scene'});
  await compose.waitFor();
  const choices=await compose.locator('[name="child"] option').evaluateAll(nodes=>
    nodes.map(node=>node.textContent));
  assert.ok(choices.includes('Full slides'),'The existing full-slide scene is available');
  assert.ok(!choices.includes('Instruction studio'),'Self-embedding is prevented');
  await compose.locator('[name="child"]').selectOption('slides-only');
  await compose.getByRole('button',{name:'Add scene layer'}).click();
  await compose.waitFor({state:'hidden'});
  const after=await page.evaluate(()=>{
    const studio=window.__qaStudio;
    return {
      source:studio.project.sources.find(s=>s.type==='scene'),
      linked:studio.source('course-deck').sync,
      studioLayers:studio.project.scenes.find(s=>s.id==='studio').layers,
      originalLayers:studio.project.scenes.find(s=>s.id==='slides-only').layers,
      unusedLayers:studio.project.scenes.find(s=>s.id==='break').layers,
    };
  });
  assert.equal(after.source.sceneId,'slides-only');
  assert.equal(after.linked,true,'Embedding the slideshow enables one shared playhead');
  assert.equal(after.studioLayers.length,1,'Studio receives one resizable scene layer');
  assert.deepEqual([after.studioLayers[0].x,after.studioLayers[0].y,
    after.studioLayers[0].w,after.studioLayers[0].h],[7,4,48,43],
  'Embedded composition defaults to a useful whiteboard-sized location');
  assert.equal(after.originalLayers.length,1,'Original slide scene stays intact');
  assert.deepEqual(after.unusedLayers,[],'Other scenes receive no inserted PowerPoint or camera');

  // The embedded layer can be positioned and resized using the same numeric
  // and drag-based controls as a camera or another image.
  await editor.locator('[data-act="select-layer"]').click();
  assert.ok(await editor.locator('.inspector').getByText('Embedded scene:').isVisible());
  await editor.locator('[data-layer="x"]').fill('19');
  await editor.locator('[data-layer="x"]').press('Tab');
  await editor.locator('[data-layer="w"]').fill('40');
  await editor.locator('[data-layer="w"]').press('Tab');
  assert.deepEqual(await page.evaluate(()=>{
    const l=window.__qaStudio.project.scenes[1].layers[0];
    return [l.x,l.w];
  }),[19,40],'Embedded scene is editable like any other canvas layer');
  await editor.locator('[data-act="close-tools"]').click();
  await page.locator('[data-act="cut"]').click();
  await page.waitForFunction(()=>window.__qaStudio.program.scene.id==='studio');
  assert.equal(await page.locator('#program-name').textContent(),'Instruction studio');
  assert.equal(await page.locator('#preview-name').textContent(),'Full slides');

  // A Program button on a nested PowerPoint advances the full slideshow.
  const live=page.locator('#live-deck-controls');
  await live.waitFor({state:'visible'});
  assert.ok((await live.textContent()).includes('Slide 1 / 4'));
  await live.locator('[data-act="slide-next"]').click();
  assert.deepEqual(await page.evaluate(()=>{
    const s=window.__qaStudio;
    return {
      source:s.source('course-deck').page,
      preview:s.project.scenes[0].layers[0].page,
      nested:s.program.scenes.get('slides-only').layers[0].page,
    };
  }),{source:1,preview:1,nested:1},
  'Advancing Program in studio advances the embedded and full-slide views together');

  // Verify rendered pixels, not just counter labels. Both studio TV and
  // standalone Preview should show the same second (blue) slide.
  await page.waitForFunction(()=>window.__qaStudio.media.get('course-deck')?.frames.get(1)?.ready===true);
  await page.waitForFunction(()=>{
    const canvas=document.getElementById('program-canvas');
    const pixel=canvas.getContext('2d').getImageData(
      Math.floor(canvas.width*.39),Math.floor(canvas.height*.25),1,1).data;
    return pixel[2]>pixel[0]&&pixel[2]>pixel[1];
  },null,{timeout:8000});
  const colors=await page.evaluate(()=>{
    const sample=(id,x,y)=>{
      const canvas=document.getElementById(id);
      return Array.from(canvas.getContext('2d').getImageData(
        Math.floor(canvas.width*x),Math.floor(canvas.height*y),1,1).data).slice(0,3);
    };
    return {program:sample('program-canvas',.39,.25),
      preview:sample('preview-canvas',.5,.5)};
  });
  assert.ok(colors.program[2]>colors.program[0]&&colors.preview[2]>colors.preview[0],
    'Whiteboard and fullscreen view show the same actual blue slide');

  // Preview controls/shortcuts must ALSO advance Program for linked decks.
  await page.locator('.control-heading').click();
  await page.keyboard.press('Period');
  assert.deepEqual(await page.evaluate(()=>{
    const s=window.__qaStudio;
    return [s.source('course-deck').page,s.program.scenes.get('slides-only').layers[0].page,
      s.project.scenes[0].layers[0].page];
  }),[2,2,2],'Advancing fullscreen Preview also updates studio Program');

  // Bounce live from studio TV to full slides, and back to studio, without
  // re-cueing or resetting any slide.
  await page.locator('[data-act="cut"]').click();
  assert.equal(await page.locator('#program-name').textContent(),'Full slides');
  assert.equal(await page.locator('#preview-name').textContent(),'Instruction studio');
  assert.equal(await page.evaluate(()=>window.__qaStudio.program.scene.layers[0].page),2);
  await page.locator('[data-act="cut"]').click();
  assert.equal(await page.locator('#program-name').textContent(),'Instruction studio');
  assert.equal(await page.evaluate(()=>
    window.__qaStudio.program.scenes.get('slides-only').layers[0].page),2);

  // Existing independent deck controls must remain unchanged in projects
  // without embedded scenes (covered by live-powerpoint-browser.mjs).
  await page.locator('#workspace-classroom').click();
  const classroom=page.locator('#classroom-panel');
  assert.ok((await classroom.textContent()).includes('Instructor notes for 3'),
    'Nested PowerPoint notes remain available to presenter');
  await page.locator('#workspace-scenes').click();

  // Scene graph cycle prevention is respected by the input chooser.
  await page.locator('[data-act="scene-tools"][data-id="slides-only"]').click();
  await editor.locator('[data-act="add-context"]').click();
  await add.locator('[data-act="input-scene"]').click();
  const reverse=page.getByRole('dialog',{name:'Embed another scene'});
  await reverse.waitFor();
  const reverseIds=await reverse.locator('option').evaluateAll(nodes=>nodes.map(x=>x.value));
  assert.ok(!reverseIds.includes('studio'),'Embedding Studio in Slides would create a cycle');
  await reverse.getByRole('button',{name:'Cancel'}).click();
  await editor.locator('[data-act="close-tools"]').click();

  // Media and source references round-trip through the normal saved project.
  await page.locator('[data-act="save"]').click();
  await page.locator('#save-state').getByText('Saved on this device').waitFor({timeout:12000});
  await page.reload();
  await page.waitForFunction(()=>window.__qaStudio?.project?.id==='nested-studio-e2e');
  const reloaded=await page.evaluate(()=>{
    const p=window.__qaStudio.project;
    return {
      linked:p.sources.find(s=>s.id==='course-deck').sync,
      slide:p.sources.find(s=>s.id==='course-deck').page,
      sceneId:p.sources.find(s=>s.type==='scene').sceneId,
      frame:p.scenes.find(s=>s.id==='studio').layers[0],
      originalPage:p.scenes.find(s=>s.id==='slides-only').layers[0].page,
      empty:p.scenes.find(s=>s.id==='break').layers.length,
    };
  });
  assert.equal(reloaded.linked,true);
  assert.equal(reloaded.slide,2);
  assert.equal(reloaded.originalPage,2);
  assert.equal(reloaded.sceneId,'slides-only');
  assert.deepEqual([reloaded.frame.x,reloaded.frame.w],[19,40],
    'Embedded scene geometry persists with the project');
  assert.equal(reloaded.empty,0);
  assert.deepEqual(errors,[]);
  console.log('Nested scenes passed: user-added composition, TV resizing, exact rendered slides, Program/Preview sync, scene switching, cycle guard, notes, persistence.');
  await context.close();
} finally {
  if(browser) await browser.close();
  await new Promise(done=>server.close(done));
}
