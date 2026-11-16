import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const repo=resolve(fileURLToPath(new URL('../../',import.meta.url)));
const root=resolve(repo,'public');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png',
  '.webp':'image/webp','.jpg':'image/jpeg','.wasm':'application/wasm'};
const server=createServer(async(req,res)=>{
  try{
    const path=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    const base=path.startsWith('/src/mayne-studio/')?repo:root;
    const file=resolve(base,'.'+(path==='/'?'/index.html':path));
    if(file!==base&&!file.startsWith(base+sep)){res.writeHead(403).end();return;}
    let bytes=await readFile(file);
    if(path==='/src/mayne-studio/app.js'){
      const script=bytes.toString('utf8');
      const marker="else new Studio($('studio')).start();";
      assert.ok(script.includes(marker),'Studio entry point is available');
      bytes=Buffer.from(script.replace(marker,
        "else { window.__qaStudio = new Studio($('studio')); window.__qaStudio.start(); }"));
    }
    res.writeHead(200,{'Content-Type':mime[extname(file)]??'application/octet-stream'}).end(bytes);
  }catch{res.writeHead(404).end('Not found');}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
let browser;
try{
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

  // Import an older project with 3 studio views already embedding one slide
  // scene, but with NO explicit "sync" flag on the PowerPoint source.
  await page.evaluate(()=>{
    const studio=window.__qaStudio;
    const layer=(id,source,box={x:0,y:0,w:100,h:100})=>({
      id,source,...box,opacity:100,visible:true,fit:'contain',page:0,
      matte:'off',key:'#00a040',coverage:'balanced',mirror:false,
    });
    const slides=layer('deck-layer','presentation');
    slides.page=1;
    const embed=(id)=>layer('embed-'+id,'shared-slide-scene',{
      x:10,y:10,w:70,h:70,
    });
    const project={
      id:'three-studios-shared-slides',name:'Cross-studio PowerPoint',
      version:1,updated:Date.now(),sources:[
        {id:'presentation',type:'powerpoint',name:'Leadership course deck',asset:'',page:0,sync:false},
        {id:'shared-slide-scene',type:'scene',name:'Shared PowerPoint scene',sceneId:'slide-source'},
      ],scenes:[
        {id:'slide-source',name:'PowerPoint-only scene',template:'blank',background:'black',
          title:'',caption:'',backdrop:'',layers:[slides]},
        ...['studio-one','studio-two','studio-three'].map((id,i)=>({
          id,name:'Studio '+(i+1),template:i===0?'presenter':'blank',background:'black',
          title:'',caption:'',backdrop:'',layers:[embed(id)],
        })),
      ],overlays:[],transition:'cut',duration:450,master:0,masterMute:false,timerSeconds:300,
      shortcuts:{...studio.project.shortcuts},
    };
    studio.load(project);
    const colors=['#c7373f','#2385cf','#38a36f','#d4a03b'];
    const deck={
      count:4,slides:colors.map((_,i)=>({notes:'Speaking notes for slide '+(i+1)})),
      async render(index,canvas){
        const ctx=canvas.getContext('2d');
        ctx.fillStyle=colors[index];ctx.fillRect(0,0,canvas.width,canvas.height);
        return {hints:[]};
      },
    };
    studio.media.entries.set('presentation',{
      type:'powerpoint',state:'ready',deck,frames:new Map(),
    });
    studio.setPreview('studio-one');
  });

  const pages=()=>page.evaluate(()=>{
    const s=window.__qaStudio;
    const ppt=s.project.sources.find(x=>x.id==='presentation');
    return {
      linked:ppt.sync,
      page:ppt.page,
      master:s.project.scenes[0].layers[0].page,
      program:s.program.scenes.get('slide-source').layers[0].page,
      scene1:s.project.scenes[1].layers.length,
      scene2:s.project.scenes[2].layers.length,
      scene3:s.project.scenes[3].layers.length,
    };
  });
  assert.deepEqual(await pages(),{
    linked:true,page:1,master:1,program:1,scene1:1,scene2:1,scene3:1,
  },'An existing multi-studio composition automatically enables a shared slide playhead');

  await page.locator('[data-act="cut"]').click();
  await page.waitForFunction(()=>window.__qaStudio.program.scene.id==='studio-one');
  const live=page.locator('#live-deck-controls');
  assert.ok((await live.textContent()).includes('Shared across studio views'));
  assert.ok((await live.textContent()).includes('Slide 2 / 4'));
  await live.locator('[data-act="slide-next"]').click();
  assert.deepEqual(await pages(),{
    linked:true,page:2,master:2,program:2,scene1:1,scene2:1,scene3:1,
  },'Advancing in Studio 1 updates the single source for all studios');

  // Leave Studio 1 on Program while previewing Studio 2.
  await page.locator('.scene-tile [data-act="scene"][data-id="studio-two"]').click();
  assert.equal(await page.locator('#preview-name').textContent(),'Studio 2');
  await page.locator('.control-heading').click();
  await page.keyboard.press('Period');
  assert.equal((await pages()).page,3,'Preview control also advances the on-air shared deck');
  assert.equal((await pages()).program,3);

  // Repeated studio changes must not reset the deck to slide 1.
  for(const studioId of ['studio-two','studio-three','slide-source','studio-one']){
    await page.locator('[data-act="scene"][data-id="'+studioId+'"]').click();
    await page.locator('[data-act="cut"]').click();
    await page.waitForFunction(id=>window.__qaStudio.program.scene.id===id,studioId);
    const state=await pages();
    assert.equal(state.page,3,'Canonical slide remains at page 4');
    assert.equal(state.program,3,'Each new studio snapshot uses page 4');
    assert.ok((await live.textContent()).includes('Slide 4 / 4'),
      'Program slide controls reflect the shared slide on '+studioId);
  }

  // Verify actual pixels in a studio's embedded PowerPoint, not just counters.
  await page.waitForFunction(()=>window.__qaStudio.media.get('presentation')?.frames.get(3)?.ready===true);
  await page.waitForFunction(()=>{
    const canvas=document.querySelector('#program-canvas');
    const [red,green,blue]=canvas.getContext('2d')
      .getImageData(Math.floor(canvas.width*.43),Math.floor(canvas.height*.38),1,1).data;
    return red>100&&green>85&&blue<100;
  },null,{timeout:12000});
  await page.locator('[data-act="slide-prev"][data-bus="program"]').click();
  assert.equal((await pages()).page,2,'Previous also uses shared playhead across studio views');

  // Saving and reopening should preserve the shared position and linkage.
  await page.locator('[data-act="save"]').click();
  await page.locator('#save-state').getByText('Saved on this device').waitFor({timeout:12000});
  await page.reload();
  await page.waitForFunction(()=>window.__qaStudio?.project?.id==='three-studios-shared-slides');
  const saved=await page.evaluate(()=>{
    const p=window.__qaStudio.project;
    return {
      page:p.sources.find(x=>x.id==='presentation').page,
      linked:p.sources.find(x=>x.id==='presentation').sync,
      deckPage:p.scenes[0].layers[0].page,
      embeds:p.scenes.slice(1).map(scene=>p.sources.find(s=>s.id===scene.layers[0].source)?.sceneId),
    };
  });
  assert.deepEqual(saved,{
    page:2,linked:true,deckPage:2,embeds:['slide-source','slide-source','slide-source'],
  });
  assert.deepEqual(errors,[],'No errors during multiple studio changes or shared deck cueing');
  console.log('Shared PowerPoint across 3 studios: legacy linking, Program/Preview navigation, pixel rendering, studio cuts and backup round-trip passed.');
  await context.close();
}finally{
  await browser?.close();
  await new Promise(done=>server.close(done));
}
