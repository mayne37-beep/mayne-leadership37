import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
const fileUrl=new URL('../../decision-intelligence-studio.html',import.meta.url);

function initDOM(html,url){
 const dom=new JSDOM(html,{url,pretendToBeVisual:true});
 const prior={window:globalThis.window,document:globalThis.document,localStorage:globalThis.localStorage,FormData:globalThis.FormData,confirm:globalThis.confirm,Image:globalThis.Image};
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,localStorage:dom.window.localStorage,FormData:dom.window.FormData,confirm:()=>true,Image:dom.window.Image});
 dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true};
 dom.window.HTMLDialogElement.prototype.close=function(){this.open=false};
 dom.window.HTMLElement.prototype.scrollTo=function(){};
 const $=q=>dom.window.document.querySelector(q);
 const saved=()=>JSON.parse(dom.window.localStorage.getItem('mayne.decision-intelligence.v1'));
 const project=()=>saved().projects.find(p=>p.id===saved().activeId);
 const click=q=>{const n=$(q);assert.ok(n,'Missing element: '+q);n.click()};
 const change=n=>n.dispatchEvent(new dom.window.Event('change',{bubbles:true,cancelable:true}));
 const cleanup=()=>{Object.assign(globalThis,prior);dom.window.close()};
 return {dom,$,saved,project,click,change,cleanup};
}
test('Operations Crisis starter launches a full classroom case and supports incident updates, teams, timer, projector and report',async()=>{
 const html=await readFile(fileUrl,'utf8');
 const ui=initDOM(html,'https://www.mayneleadership.com/decision-intelligence-studio.html');
 const {$,click,change,project,saved,dom,cleanup}=ui;
 let printed=false;dom.window.print=()=>printed=true;
 try{
  await import('../../assets/decision-intelligence.js?test=operations-full-workflow');
  assert.equal(project().exercise,null);
  click('[data-example="crisis"]');
  assert.equal(saved().projects.length,2);
  assert.equal(project().exercise.id,'operations-crisis-response');
  assert.equal(project().exercise.currentRound,0);
  assert.ok(!$('#challenge-view').hidden);
  assert.match($('#case-briefing').textContent,/OPERATION CONTINUITY/);
  assert.match($('#case-briefing').textContent,/CivicBridge/);
  assert.match($('#case-briefing').textContent,/Decision prompt/);
  assert.match($('#case-briefing').textContent,/Verified/);
  assert.ok(!$('#case-briefing').textContent.includes('A third-party service dependency'));

  click('[data-case-guide]');
  assert.equal($('#operations-guide-dialog').open,true);
  assert.match($('#operations-guide-body').textContent,/Opening script/);
  assert.match($('#operations-guide-body').textContent,/UPDATE 4/);
  click('[data-close="operations-guide-dialog"]');
  assert.equal($('#operations-guide-dialog').open,false);

  click('[data-case-next]');
  assert.equal(project().exercise.currentRound,1);
  assert.match($('#case-timer-label').textContent,/18:00/);
  assert.equal(project().injects[0].revealed,false);
  click('[data-case-reveal]');
  assert.equal(project().injects[0].revealed,true);
  assert.match($('#case-briefing').textContent,/third-party service dependency/);
  const team=project().teams[0];
  const response=$('[data-case-team="'+team.id+'"][data-case-response="reassess"]');
  assert.ok(response);
  response.value='Our team shifts to verified urgent triage and uses controlled manual records.';
  change(response);
  assert.match(project().teams[0].roundNotes.reassess,/controlled manual records/);

  click('[data-case-timer-toggle]');
  assert.equal($('[data-case-timer-toggle]').textContent,'Pause');
  click('[data-case-timer-toggle]');
  assert.equal($('[data-case-timer-toggle]').textContent,'Start timer');
  click('[data-case-timer-reset]');
  assert.equal($('#case-timer-label').textContent,'18:00');

  click('[data-case-next]');
  assert.equal(project().exercise.currentRound,2);
  assert.ok(!$('#case-briefing').textContent.includes('A reporter asks'));
  click('[data-case-reveal]');
  assert.equal(project().injects[1].revealed,true);
  click('[data-case-reveal]');
  assert.equal(project().injects[2].revealed,true);
  assert.match($('#case-briefing').textContent,/reporter asks/);
  assert.equal(project().injects[3].revealed,false);

  click('[data-case-projector]');
  assert.equal(dom.window.document.body.classList.contains('di-projector'),true);
  assert.match($('#case-briefing').textContent,/Exit projector mode/);
  assert.ok(!$('#case-briefing').innerHTML.includes('case-team-response'));
  assert.ok(!$('#case-briefing').innerHTML.includes('data-case-guide'));
  assert.ok(!$('#case-briefing').textContent.includes('two offline records'),'Round 4 inject should remain hidden');
  click('[data-case-projector]');
  assert.equal(dom.window.document.body.classList.contains('di-projector'),false);

  click('[data-case-next]');
  assert.equal(project().exercise.currentRound,3);
  click('[data-case-reveal]');
  assert.equal(project().injects[3].revealed,true);
  assert.match($('#case-briefing').textContent,/two offline records/);
  click('[data-case-back]');
  assert.equal(project().exercise.currentRound,2);

  click('#export-button');click('[data-export="report"]');
  assert.equal(printed,true);
  assert.match($('#print-report').textContent,/Our team shifts to verified urgent triage/);
  assert.match($('#print-report').textContent,/Operations Crisis Response/);

  click('#projects-button');
  assert.match($('#library-items').textContent,/OPERATION CONTINUITY/);
  const id=project().id;
  click('[data-copy-project="'+id+'"]');
  assert.equal(saved().projects.length,3);
  assert.equal(project().exercise.id,'operations-crisis-response');
  assert.notEqual(project().id,id);
  assert.equal(project().exercise.currentRound,2);
  assert.match(project().teams[0].roundNotes.reassess,/controlled manual records/);
 }finally{cleanup()}
});

test('Direct scenario URL creates or resumes saved crisis exercise without replacing unrelated work',async()=>{
 const html=await readFile(fileUrl,'utf8');
 const ui=initDOM(html,'https://www.mayneleadership.com/decision-intelligence-studio.html?scenario=operations-crisis-response');
 const {$,project,saved,click,cleanup}=ui;
 try{
  await import('../../assets/decision-intelligence.js?test=operations-deep-link');
  assert.equal(saved().projects.length,2,'One blank user project and one new classroom exercise');
  assert.equal(project().exercise.id,'operations-crisis-response');
  assert.equal(project().options.length,4);
  assert.ok(!$('#challenge-view').hidden);
  assert.match($('#case-briefing').textContent,/OPERATION CONTINUITY/);
  click('[data-case-next]');
  assert.equal(project().exercise.currentRound,1);
  click('#projects-button');
  click('[data-open-project="'+saved().projects[1].id+'"]');
  assert.equal(project().exercise,null);
  assert.equal(project().nodes.length,1);
 }finally{cleanup()}
});
