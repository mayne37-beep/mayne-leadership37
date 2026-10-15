import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {build} from 'esbuild';import {JSDOM,VirtualConsole} from 'jsdom';import {template} from '../../assets/systems/templates.js';
const code=(await build({entryPoints:['assets/systems-mapping-studio.js'],bundle:true,write:false,format:'iife',globalName:'SystemsStudio',external:['/assets/systems-pdf.js'],platform:'browser',target:'es2022'})).outputFiles[0].text;
const html=await readFile('systems-mapping-join.html','utf8'),vc=new VirtualConsole(),errors=[];vc.on('jsdomError',e=>errors.push(e.message));
const dom=new JSDOM(html,{url:'https://www.mayneleadership.com/systems-mapping-join.html#room='+'a'.repeat(48),pretendToBeVisual:true,runScripts:'outside-only',virtualConsole:vc}),w=dom.window,d=w.document;
w.confirm=()=>true;w.AbortSignal=AbortSignal;w.HTMLElement.prototype.getBoundingClientRect=()=>({left:0,top:0,width:900,height:600});
const ticks=[];w.setInterval=(fn,ms)=>{ticks.push({fn,ms});return ticks.length;};w.clearInterval=()=>{};
let source=template('engagement'),version=1,session={id:crypto.randomUUID(),locked:false,active:true,mode:'edit'},reflection='';
w.fetch=async(url,opt)=>{const {action,payload}=JSON.parse(opt.body);let data;
 if(action==='session-join')data={data:structuredClone(source),version,member:crypto.randomUUID(),proof:'b'.repeat(48),session};
 else if(action==='session-get')data={data:structuredClone(source),version,session};
 else if(action==='session-save'){assert(payload.proof);assert.equal(payload.version,version);source=structuredClone(payload.data);data={version:++version};}
 else if(action==='session-reflect'){reflection=payload.reflection;data={ok:true};}
 else throw Error('Unexpected participant action '+action);return {ok:true,json:async()=>data};
};
w.eval(code);const state=()=>w.SystemsStudio.editorForTesting();const click=s=>{const e=d.querySelector(s);assert(e,s);e.click();};
async function wait(fn){for(let i=0;i<200;i++){if(fn())return;await new Promise(r=>setTimeout(r,10));}throw Error('Participant UI timeout.');}
assert(d.querySelector('#student-name'));d.querySelector('#student-name').value='Student QA';d.querySelector('#student-team').value='Team A';click('[data-action=join-session]');await wait(()=>state().member);assert.equal(state().project.title,source.title);
let label=d.querySelector('.node-label');assert.equal(label.contentEditable,undefined); // jsdom exposes the actual attribute below.
assert.equal(label.getAttribute('contenteditable'),'true');label.focus();label.textContent='Trust in the team';label.dispatchEvent(new w.Event('input',{bubbles:true}));label.blur();click('#save-map');await wait(()=>state().version===2&&!state().dirty);assert.equal(source.nodes[0].label,'Trust in the team');
session={...session,locked:true};await ticks.find(x=>x.ms===3500).fn();assert.equal(d.querySelector('.node-label').getAttribute('contenteditable'),'false');const before=state().project.nodes.length;click('[data-add=variable]');assert.equal(state().project.nodes.length,before,'Lock must disable edits');
click('[data-action=student-reflect]');d.querySelector('#student-reflection').value='Trust and coaching form a reinforcing loop.';click('[data-action=submit-reflection]');await wait(()=>reflection.length>0);assert.equal(reflection,'Trust and coaching form a reinforcing loop.');
session={...session,locked:false,mode:'view'};await ticks.find(x=>x.ms===3500).fn();assert.equal(d.querySelector('.node-label').getAttribute('contenteditable'),'false');
assert.deepEqual(errors,[]);w.close();console.log('PASS: student join without PIN, source loading, direct editing, proof-bearing save, live lock/view mode enforcement and reflection submission.');
