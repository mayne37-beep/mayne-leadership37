import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {build} from 'esbuild';import {JSDOM,VirtualConsole} from 'jsdom';
const code=(await build({entryPoints:['assets/systems-mapping-studio.js'],bundle:true,write:false,format:'iife',globalName:'SystemsStudio',external:['/assets/systems-pdf.js'],platform:'browser',target:'es2022'})).outputFiles[0].text;
const html=await readFile('systems-mapping-studio.html','utf8');
const errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
const dom=new JSDOM(html,{url:'https://www.mayneleadership.com/systems-mapping-studio.html',pretendToBeVisual:true,runScripts:'outside-only',virtualConsole:vc}),w=dom.window,d=w.document;
w.HTMLElement.prototype.getBoundingClientRect=function(){return {left:0,top:0,width:1000,height:700,right:1000,bottom:700};};
w.confirm=()=>true;w.structuredClone=structuredClone;w.AbortSignal=AbortSignal;w.URL.createObjectURL=blob=>{downloads.push(blob);return 'blob:test';};w.URL.revokeObjectURL=()=>{};w.HTMLAnchorElement.prototype.click=function(){filenames.push(this.download);};
const downloads=[],filenames=[],records=new Map(),calls=[];let offline=false,conflict=false;
w.fetch=async(url,options)=>{const {action,payload}=JSON.parse(options.body);calls.push(action);if(offline)throw Error('offline');const ok=data=>({ok:true,json:async()=>data});
 if(action==='list')return ok([...records.values()].map(x=>({id:x.data.id,title:x.data.title,version:x.version,folder:x.data.folder,tags:x.data.tags,updated_at:new Date().toISOString()})));
 if(action==='get')return ok(structuredClone(records.get(payload.id)));
 if(action==='save'){const old=records.get(payload.id);if(conflict||(old?.version||0)!==payload.version)return {ok:false,status:409,json:async()=>({error:'Version conflict'})};const version=payload.version+1;records.set(payload.id,{data:structuredClone(payload.data),version});return ok({id:payload.id,version});}
 if(action==='session-create')return ok({id:crypto.randomUUID(),room:'a'.repeat(48),active:true,locked:false,mode:'edit'});
 if(action==='session-roster'||action==='history')return ok([]);
 return ok({});
};
w.eval(await readFile('assets/vendor/qrcode.min.js','utf8'));w.eval(code);const state=()=>w.SystemsStudio.editorForTesting();
const click=s=>{const e=d.querySelector(s);assert(e,'Missing '+s);e.click();};
const event=(target,name,options={})=>target.dispatchEvent(new w.MouseEvent(name,{bubbles:true,button:0,...options}));
const input=(s,value)=>{const el=d.querySelector(s);assert(el,s);el.focus();el.value=value;el.dispatchEvent(new w.Event('input',{bubbles:true}));el.dispatchEvent(new w.Event('change',{bubbles:true}));el.blur();};
async function wait(fn){for(let i=0;i<200;i++){if(fn())return;await new Promise(r=>setTimeout(r,10));}throw Error('UI condition timed out.');}
assert.equal(state().project.nodes.length,0);
click('[data-add=variable]');let first=state().project.nodes[0];const firstId=first.id;
let label=d.querySelector('.node-label');label.focus();label.textContent='Employee trust';label.dispatchEvent(new w.Event('input',{bubbles:true}));label.blur();assert.equal(state().project.nodes[0].label,'Employee trust');
let header=d.querySelector('.node-header'),x=first.x,y=first.y,z=state().view.z;
event(header,'pointerdown',{clientX:100,clientY:100});event(w,'pointermove',{clientX:180,clientY:150});event(w,'pointerup',{clientX:180,clientY:150});assert(first.x>x&&first.y>y,'Moving must update source positions');
const width=first.w,height=first.h;event(d.querySelector('.resize-handle'),'pointerdown',{clientX:100,clientY:100});event(w,'pointermove',{clientX:190,clientY:155});event(w,'pointerup',{clientX:190,clientY:155});assert(first.w>width&&first.h>height,'Resizing must update source dimensions');
click('#undo');assert.equal(state().project.nodes[0].w,width);click('#redo');assert(state().project.nodes[0].w>width);
click('[data-add=variable]');const second=state().project.nodes.at(-1);input('[data-field=label]','Engagement');
click('[data-tool=connect]');event(d.querySelector(`[data-id="${firstId}"] .node-header`),'pointerdown');event(d.querySelector(`[data-id="${second.id}"] .node-header`),'pointerdown');assert.equal(state().project.edges.length,1);
event(d.querySelector(`[data-id="${second.id}"] .node-header`),'pointerdown');event(d.querySelector(`[data-id="${firstId}"] .node-header`),'pointerdown');assert.equal(state().project.edges.length,2);
click('[data-tab=loops]');assert(d.querySelector('.loop-card').textContent.includes('reinforcing'));click('[data-loop="0"]');assert.equal(d.querySelectorAll('.map-node.highlight').length,2);
click('[data-tool=select]');event(d.querySelector('[data-edge] text'),'pointerdown');click('[data-tab=inspect]');input('[data-field=polarity]','-');click('[data-tab=loops]');assert(d.querySelector('.loop-card').textContent.includes('balancing'));
click('#save-map');await wait(()=>state().version===1&&!state().dirty);assert.equal(records.get(state().project.id).data.nodes[0].label,'Employee trust');
input('#project-title','Team map'); // Title handler is a change listener.
click('#save-map');await wait(()=>!state().dirty);const savedId=state().project.id;assert.equal(records.get(savedId).data.title,'Team map');
click('[data-action=iceberg]');input('[data-field="iceberg.patterns"]','Recurring delays');click('#close-modal');
click('[data-action=behavior]');input('[data-field="behavior.points"]','1,2,4,3');assert(d.querySelector('#behavior-chart polyline'));click('#close-modal');
click('[data-action=actions]');click('[data-action=add-action]');input('[data-field="action.text"]','Test a coaching intervention');click('#close-modal');
click('#export-menu');for(const kind of ['json','svg','report','csv','collaboration'])click('[data-export="'+kind+'"]');await wait(()=>filenames.length===5);assert.equal(downloads.length,5);assert(filenames.some(x=>x.endsWith('.svg')));click('#close-modal');
click('#save-map');await wait(()=>!state().dirty);click('#new-map');assert.equal(state().project.nodes.length,0);click('#open-library');await wait(()=>d.querySelector(`[data-open-map="${savedId}"]`));click(`[data-open-map="${savedId}"]`);await wait(()=>state().project.id===savedId);assert.equal(state().project.iceberg.patterns,'Recurring delays');assert.equal(state().project.actions[0].text,'Test a coaching intervention');
offline=true;input('#project-title','Offline source');click('#save-map');await wait(()=>!state().saving);await new Promise(r=>setTimeout(r,160));assert(state().dirty);assert(w.localStorage.getItem('ml.systems.library.v1').includes('Offline source'));offline=false;
conflict=true;click('#save-map');await wait(()=>state().conflict);assert(state().dirty);assert(state().project.title==='Offline source');assert(d.querySelector('#save-status').textContent.includes('conflict'));conflict=false;
// Restore source through the actual reload action and check conflict backup retention.
await handlersReload();assert(!state().conflict);assert(Object.values(JSON.parse(w.localStorage.getItem('ml.systems.library.v1'))).some(x=>x.data.title.includes('conflict draft')));
async function handlersReload(){click('[data-action=reload-cloud]');await wait(()=>!state().dirty&&!state().conflict);}
click('#classroom');click('[data-action=host-session]');await wait(()=>state().session);await wait(()=>d.querySelector('#join-link'));assert(d.querySelector('#join-link').value.includes('systems-mapping-join.html#room='));assert(d.querySelector('#undo').disabled);click('[data-action=qr]');await wait(()=>d.querySelector('#session-qr table,#session-qr canvas,#session-qr svg'));assert.equal(d.querySelector('#session-qr').title,d.querySelector('#join-link').value);
assert.deepEqual(errors,[]);w.close();
console.log('PASS: real DOM text editing, move, resize, directed connections, loop updates, undo/redo, website save/reopen, device recovery, conflict backup, worksheets, downloads and classroom creation.');
