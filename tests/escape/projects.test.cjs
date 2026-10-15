const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM,VirtualConsole}=require('jsdom');
const root=process.env.ESCAPE_PROJECT_ROOT||(fs.existsSync(path.resolve(__dirname,'../dist/app.js'))?path.resolve(__dirname,'..'):path.resolve(__dirname,'../..'));
const standalone=fs.existsSync(path.join(root,'dist/app.js'));
const assets=path.join(root,standalone?'dist':'assets/escape-room');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function wait(check){for(let i=0;i<200;i++){if(check())return;await delay(10);}throw new Error('UI condition timed out.');}
function indexedStore(records,fail){
 return {open(){const request={};queueMicrotask(()=>{request.result={createObjectStore(){},transaction(){const tx={objectStore(){return Object.fromEntries(['getAll','get','put','delete'].map(op=>[op,value=>{const req={};setTimeout(()=>{if(fail.value&&['put','delete'].includes(op)){tx.error=new Error('Device is full');tx.onerror?.();return;}if(op==='put')records.set(value.id,structuredClone(value));if(op==='delete')records.delete(value);req.result=op==='getAll'?[...records.values()].map(x=>structuredClone(x)):op==='get'?structuredClone(records.get(value)):undefined;req.onsuccess?.();tx.oncomplete?.();},0);return req;}]))}};return tx;}};request.onupgradeneeded?.();request.onsuccess?.();});return request;}};
}
async function setup({device=new Map(),remote=new Map(),hosted=!standalone,offline={value:false},fail={value:false},fallback=false,player=false,seed=false,saveDelay=0}={}){
 const errors=[],calls=[];const vc=new VirtualConsole();vc.on('jsdomError',error=>errors.push(error.message));
 const dom=new JSDOM('<!doctype html><div id="app"></div><dialog id="modal"></dialog><div id="toast"></div><input id="fileInput" type="file">',{url:'https://studio.test/',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc});
 const w=dom.window,d=w.document;
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
 if(!fallback)w.indexedDB=indexedStore(device,fail);
 else w.localStorage.setItem('escape-projects',JSON.stringify([...device.values()]));
 w.localStorage.setItem('escape-last-project','room-legacy');
 for(const file of ['engine.js','panorama.js','template.js'])w.eval(fs.readFileSync(path.join(assets,file),'utf8'));
 const example=w.EscapeTemplate.template();example.id='room-legacy';example.title='Existing room';
 if(seed){device.set(example.id,structuredClone(example));if(hosted)remote.set(example.id,structuredClone(example));if(fallback)w.localStorage.setItem('escape-projects',JSON.stringify([...device.values()]));}
 if(hosted){w.ESCAPE_HOSTED=true;w.EscapeCloud={
  async list(){calls.push('list');if(offline.value)throw new Error('Offline');return [...remote.values()].map(p=>({id:p.id,title:p.title,scenes:p.scenes.length,updated_at:new Date(p.updatedAt).toISOString(),published:!!p._cloud?.published}));},
  async get(id){calls.push('get:'+id);if(offline.value)throw new Error('Offline');if(!remote.has(id))throw new Error('Missing project');return structuredClone(remote.get(id));},
  async save(p){calls.push('save:'+p.id);if(saveDelay)await delay(saveDelay);if(offline.value)throw new Error('Offline');const copy=structuredClone(p);copy._cloud={version:(remote.get(p.id)?._cloud?.version||0)+1,unsynced:false};remote.set(p.id,copy);return copy._cloud;}
 };}
 if(player)w.ESCAPE_PACKAGE=structuredClone(example);
 w.eval(fs.readFileSync(path.join(assets,'app.js'),'utf8'));
 await wait(()=>d.querySelector('.header'));
 const click=selector=>{const el=d.querySelector(selector);assert.ok(el,'Missing '+selector);el.click();};
 const input=(selector,value)=>{const el=d.querySelector(selector);assert.ok(el,'Missing '+selector);el.dispatchEvent(new w.FocusEvent('focusin',{bubbles:true}));el.value=value;el.dispatchEvent(new w.Event('input',{bubbles:true}));el.dispatchEvent(new w.Event('change',{bubbles:true}));el.dispatchEvent(new w.FocusEvent('focusout',{bubbles:true}));};
 const submit=selector=>d.querySelector(selector).dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
 return {w,d,dom,calls,errors,device,remote,offline,fail,click,input,submit,close:()=>{dom.window.close();assert.deepEqual(errors,[]);}};
}

test('startup ignores the previous project, opens an empty canvas and preserves saved work',async()=>{
 const ui=await setup({seed:true});
 assert.equal(ui.d.querySelector('.top-title strong').textContent,'Untitled escape room');
 assert.equal(ui.d.querySelectorAll('.scene-card').length,1);
 assert.equal(ui.d.querySelectorAll('[data-object]').length,0);
 assert.ok(ui.d.querySelector('.blank-scene'));
 assert.equal(ui.device.size,1);assert.deepEqual(ui.calls,[]);
 ui.click('[data-action="library"]');await wait(()=>ui.d.querySelector('[data-open-project="room-legacy"]'));
 assert.equal(ui.d.querySelector('#modalTitle').textContent,'My Projects');assert.equal(ui.device.size,1);
 ui.click('[data-open-project="room-legacy"]');await wait(()=>ui.d.querySelector('.top-title strong').textContent==='Existing room');
 assert.equal(ui.d.querySelectorAll('.scene-card').length,3);ui.close();
});

test('named saves and autosaves reopen after a fresh blank startup without duplicate empty rooms',async()=>{
 const device=new Map(),remote=new Map();let ui=await setup({device,remote});
 ui.click('[data-action="library"]');await wait(()=>ui.d.querySelector('.projects-empty'));
 ui.click('[data-action="new-blank"]');await wait(()=>!ui.d.querySelector('#modal').open);
 assert.equal(device.size,0);assert.equal(remote.size,0);
 ui.click('[data-action="save-project"]');ui.input('#projectName','Innovation Workshop');ui.submit('#saveProjectForm');
 await wait(()=>device.size===1&&!ui.d.querySelector('#modal').open);
 const id=[...device.keys()][0];ui.click('[data-add="clue"]');ui.input('[data-field="object.body"]','Keep this clue while the project is in progress.');
 await wait(()=>device.get(id).scenes[0].objects[0]?.body==='Keep this clue while the project is in progress.');
 await wait(()=>!ui.d.querySelector('.save-indicator').textContent.includes('Saving'));
 const saved=structuredClone(device.get(id));ui.close();
 ui=await setup({device,remote});assert.equal(ui.d.querySelectorAll('[data-object]').length,0);assert.equal(device.size,1);
 ui.click('[data-action="library"]');await wait(()=>ui.d.querySelector('[data-open-project]'));
 assert.match(ui.d.querySelector('.project-details small').textContent,/Last edited/);
 ui.input('#projectSearch','no match');assert.ok(ui.d.querySelector('.project-row').hidden);assert.ok(!ui.d.querySelector('#projectSearchEmpty').hidden);
 ui.input('#projectSearch','INNOVATION');assert.ok(!ui.d.querySelector('.project-row').hidden);
 ui.click('[data-open-project="'+id+'"]');await wait(()=>ui.d.querySelector('.top-title strong').textContent==='Innovation Workshop');
 assert.equal(ui.d.querySelectorAll('[data-object]').length,1);
 ui.click('[data-object="'+saved.scenes[0].objects[0].id+'"]');assert.equal(ui.d.querySelector('[data-field="object.body"]').value,saved.scenes[0].objects[0].body);
 ui.click('[data-action="new-blank"]');await wait(()=>ui.d.querySelector('.blank-scene'));assert.equal(device.size,1);ui.close();
});

test('project changes are flushed before starting a new blank and the example is opt-in',async()=>{
 const ui=await setup();ui.click('[data-add="clue"]');ui.input('[data-field="object.body"]','Save this immediately.');
 ui.click('[data-action="new-blank"]');await wait(()=>ui.d.querySelector('.blank-scene'));
 assert.equal(ui.device.size,1);assert.equal([...ui.device.values()][0].scenes[0].objects[0].body,'Save this immediately.');
 ui.click('[data-action="library"]');await wait(()=>ui.d.querySelector('[data-action="new-template"]'));
 ui.click('[data-action="new-template"]');await wait(()=>ui.d.querySelectorAll('.scene-card').length===3);await wait(()=>ui.device.size===2);ui.close();
});

test('storage failure keeps the current project open when switching would lose work',async()=>{
 const fail={value:true},offline={value:true};const ui=await setup({fail,offline});ui.click('[data-add="clue"]');
 const object=ui.d.querySelector('[data-object]').dataset.object;
 ui.click('[data-action="new-blank"]');await wait(()=>ui.d.querySelector('#toast').textContent.includes('before starting'));
 assert.ok(ui.d.querySelector('[data-object="'+object+'"]'));assert.equal(ui.device.size,0);ui.close();
});

test('localStorage fallback also preserves saved projects and opens blank on reload',async()=>{
 const ui=await setup({fallback:true,hosted:false,seed:true});assert.equal(ui.d.querySelectorAll('[data-object]').length,0);
 ui.click('[data-action="save-project"]');ui.input('#projectName','Fallback project');ui.submit('#saveProjectForm');
 await wait(()=>!ui.d.querySelector('#modal').open);
 assert.equal(JSON.parse(ui.w.localStorage.getItem('escape-projects')).length,2);
 ui.click('[data-action="library"]');await wait(()=>ui.d.querySelectorAll('[data-open-project]').length===2);ui.close();
});

test('standalone learners still open their authored room with no editor project controls',async()=>{
 const ui=await setup({player:true,hosted:false});assert.equal(ui.d.querySelector('#modalTitle').textContent,'Existing room');
 assert.ok(ui.d.querySelector('[data-action="begin"]'));assert.equal(ui.d.querySelector('[data-action="library"]'),null);assert.equal(ui.device.size,0);ui.close();
});

if(!standalone)test('undo during a pending website save is flushed before switching projects',async()=>{
 const ui=await setup({saveDelay:100});ui.click('[data-add="clue"]');
 await wait(()=>ui.calls.some(call=>call.startsWith('save:')));
 const id=[...ui.device.keys()][0];ui.click('[data-action="undo"]');ui.click('[data-action="new-blank"]');
 await wait(()=>ui.d.querySelector('.blank-scene')&&ui.device.get(id)?.scenes[0].objects.length===0&&ui.remote.get(id)?.scenes[0].objects.length===0);
 assert.equal(ui.device.size,1);ui.close();
});

if(!standalone)test('offline device drafts remain visible alongside website projects and reopen without overwriting them',async()=>{
 const device=new Map(),remote=new Map(),offline={value:true};let ui=await setup({device,remote,offline,seed:true});
 const local=device.get('room-legacy');local.title='Offline work in progress';local._cloud={version:1,unsynced:true};
 ui.click('[data-action="library"]');await wait(()=>ui.d.querySelector('[data-open-project="room-legacy"]'));
 assert.match(ui.d.querySelector('.project-details').textContent,/Offline work in progress/);assert.match(ui.d.querySelector('.project-badge').textContent,/sync pending/);
 ui.click('[data-open-project="room-legacy"]');await wait(()=>ui.d.querySelector('.top-title strong').textContent==='Offline work in progress');
 assert.ok(!ui.calls.includes('get:room-legacy'));assert.equal(remote.get('room-legacy').title,'Existing room');
 offline.value=false;ui.click('[data-action="mission-tab"]');ui.input('[data-field="project.title"]','Recovered project');
 await wait(()=>remote.get('room-legacy').title==='Recovered project');assert.equal(device.size,1);ui.close();
});
