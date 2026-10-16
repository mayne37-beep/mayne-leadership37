import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';

test('Decision Intelligence Studio supports direct tree editing, drag, scoring, scenarios, premortem, executive brief and challenge',async()=>{
 const html=await readFile(new URL('../../decision-intelligence-studio.html',import.meta.url),'utf8');
 const dom=new JSDOM(html,{url:'https://www.mayneleadership.com/decision-intelligence-studio.html',pretendToBeVisual:true});
 const old={window:globalThis.window,document:globalThis.document,localStorage:globalThis.localStorage,FormData:globalThis.FormData,confirm:globalThis.confirm,Image:globalThis.Image};
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,localStorage:dom.window.localStorage,FormData:dom.window.FormData,confirm:()=>true,Image:dom.window.Image});
 const proto=dom.window.HTMLDialogElement.prototype;proto.showModal=function(){this.open=true};proto.close=function(){this.open=false};
 const $=q=>dom.window.document.querySelector(q);
 const click=q=>{const el=$(q);assert.ok(el,'Missing '+q);el.click()};
 const trigger=(el,type='change')=>el.dispatchEvent(new dom.window.Event(type,{bubbles:true,cancelable:true}));
 const state=()=>JSON.parse(dom.window.localStorage.getItem('mayne.decision-intelligence.v1'));
 const project=()=>state().projects.find(x=>x.id===state().activeId);
 const go=q=>click('[data-view="'+q+'"]');
 let printed=false;dom.window.print=()=>printed=true;
 const orig=dom.window.Element.prototype.getBoundingClientRect;
 dom.window.Element.prototype.getBoundingClientRect=function(){
  if(this.id==='tree-frame')return {left:0,top:0,width:800,height:590,right:800,bottom:590};
  return orig.call(this);
 };
 dom.window.HTMLElement.prototype.scrollTo=function(){};
 const pointer=(name,target,x,y)=>{const ev=new dom.window.Event(name,{bubbles:true,cancelable:true});
  for(const [k,v] of Object.entries({button:0,pointerId:1,clientX:x,clientY:y}))Object.defineProperty(ev,k,{value:v});
  target.dispatchEvent(ev);
 };
 try{
  await import('../../assets/decision-intelligence.js?test=di-browser');
  assert.equal(project().nodes.length,1,'Blank project opens with a root decision');
  $('#decision-question').value='What should we do?';trigger($('#decision-question'));
  assert.equal(project().question,'What should we do?');

  click('#tree-add-chance');
  assert.equal(project().nodes.length,2);
  const chance=project().nodes[1];
  assert.equal(chance.parentId,project().nodes[0].id);
  const title=$('[data-inline-title="'+chance.id+'"]');
  title.value='Pilot availability';trigger(title);
  assert.equal(project().nodes[1].title,'Pilot availability');
  click('[data-add-branch="'+chance.id+'"]');
  assert.equal(project().nodes.length,3);
  const first=project().nodes[2];
  assert.equal(first.type,'outcome');
  $('#node-utility').value='80';trigger($('#node-utility'));
  assert.equal(project().nodes[2].utility,80);

  // Drag a node on its grip, maintaining links.
  const beforeY=project().nodes[2].y;
  pointer('pointerdown',$('[data-move-node="'+first.id+'"]'),250,190);
  pointer('pointermove',$('#tree-frame'),290,230);
  pointer('pointerup',$('#tree-frame'),290,230);
  assert.ok(project().nodes[2].y>beforeY);
  assert.match($('#tree-links').innerHTML,/path/);

  click('#tree-organize');
  assert.ok(project().nodes[2].x>project().nodes[1].x);
  // A visual corner handle resizes cards and preserves dimensions in the project.
  const resizeBefore=project().nodes.find(n=>n.id===chance.id).w;
  pointer('pointerdown',$('[data-resize-node="'+chance.id+'"]'),200,150);
  pointer('pointermove',$('#tree-frame'),252,188);
  pointer('pointerup',$('#tree-frame'),252,188);
  assert.ok(project().nodes.find(n=>n.id===chance.id).w>resizeBefore);
  assert.match($('[data-node="'+chance.id+'"]').getAttribute('style'),/width:/);

  // Drag the direct connector of a second chance node onto an existing outcome.
  click('[data-node="'+project().nodes[0].id+'"]');
  click('#tree-add-chance');
  const newParent=project().nodes.at(-1);
  const existingOutcome=project().nodes.find(n=>n.id===first.id);
  pointer('pointerdown',$('[data-connect-node="'+newParent.id+'"]'),190,140);
  pointer('pointermove',$('#tree-frame'),existingOutcome.x,existingOutcome.y);
  pointer('pointerup',$('#tree-frame'),existingOutcome.x,existingOutcome.y);
  assert.equal(project().nodes.find(n=>n.id===first.id).parentId,newParent.id);


  // Matrix comparisons and evidence metadata.
  go('matrix');click('#new-criterion');
  $('[name="name"]').value='Effectiveness';$('[name="weight"]').value='80';
  trigger($('#editor-form'),'submit');
  assert.equal(project().criteria.length,1);
  click('#new-criterion');$('[name="name"]').value='Resource demand';
  $('[name="direction"]').value='Cost';$('[name="weight"]').value='20';trigger($('#editor-form'),'submit');
  click('#new-option');$('[name="name"]').value='Pilot first';trigger($('#editor-form'),'submit');
  click('#new-option');$('[name="name"]').value='Launch broadly';trigger($('#editor-form'),'submit');
  assert.equal(project().options.length,2);
  const c=project().criteria[0],o=project().options[0];
  const score=$('[data-rating="'+o.id+'"][data-criterion="'+c.id+'"]');
  score.value='5';trigger(score);
  assert.equal(project().options[0].ratings[c.id].score,5);
  click('[data-evidence-option="'+o.id+'"][data-evidence-criterion="'+c.id+'"]');
  $('[name="tag"]').value='Fact';$('[name="note"]').value='Validated pilot findings';
  trigger($('#editor-form'),'submit');
  assert.equal(project().options[0].ratings[c.id].tag,'Fact');
  assert.match($('#matrix-grid').textContent,/Fact/);

  // Scenario overrides must not mutate baseline.
  go('scenarios');click('#scenario-new');
  assert.equal(project().scenarios.length,1);
  const slider=$('[data-scenario-score="'+o.id+'"][data-scenario-criterion="'+c.id+'"]');
  slider.value='1';trigger(slider);
  assert.equal(project().scenarios[0].scoreShifts[o.id][c.id],1);
  assert.equal(project().options[0].ratings[c.id].score,5);
  assert.match($('#scenario-results').textContent,/Matrix: baseline/);

  // Premortem risk and audit status.
  go('premortem');click('#new-risk');
  $('[name="failure"]').value='Budget unavailable';
  $('[name="warning"]').value='Spending freezes';
  $('[name="safeguard"]').value='Scale in phases';
  trigger($('#editor-form'),'submit');
  assert.equal(project().risks.length,1);
  assert.match($('#risk-list').textContent,/Budget unavailable/);

  // Executive recommendation and signed decision record.
  go('brief');
  $('#recommend-option').value=o.id;trigger($('#recommend-option'));
  $('#brief-recommendation').value='Pilot based on feasibility and evidence';
  trigger($('#brief-recommendation'));
  assert.equal(project().brief.recommendationId,o.id);
  click('#new-decision');$('[name="decision"]').value='Authorize a limited pilot';
  $('[name="owner"]').value='Program director';trigger($('#editor-form'),'submit');
  assert.equal(project().decisions.length,1);
  assert.match($('#decision-log').textContent,/Authorize a limited pilot/);

  // Facilitated team and scenario inject management.
  go('challenge');click('#new-team');
  $('[name="name"]').value='Team Blue';$('[name="recommendation"]').value='Pilot first';
  trigger($('#editor-form'),'submit');
  assert.equal(project().teams.length,1);
  const rating=$('[data-team-score="'+project().teams[0].id+'"][data-rubric="reasoning"]');
  rating.value='5';trigger(rating);
  assert.equal(project().teams[0].scores.reasoning,5);
  click('#new-inject');$('[name="title"]').value='New evidence';
  $('[name="message"]').value='A key supplier withdraws';trigger($('#editor-form'),'submit');
  assert.equal(project().injects.length,1);
  click('[data-reveal-inject="'+project().injects[0].id+'"]');
  assert.equal(project().injects[0].revealed,true);
  assert.match($('#inject-list').textContent,/supplier withdraws/);

  // Project isolation, import interoperability, and print report.
  dom.window.localStorage.setItem('mayne.swot-tows-studio.v1',JSON.stringify({activeId:'s1',projects:[{id:'s1',name:'Strategy',strategies:[{title:'Train regional ambassadors',rationale:'Scalable design'}]}]}));
  click('#import-swot');
  assert.ok(project().options.some(o=>o.name==='Train regional ambassadors'));
  click('#export-button');click('[data-export="report"]');
  assert.equal(printed,true);
  assert.match($('#print-report').innerHTML,/Authorize a limited pilot/);
  click('#new-project');
  assert.equal(state().projects.length,2);
  assert.equal(project().options.length,0);
  click('#projects-button');
  assert.match($('#library-items').textContent,/Untitled decision analysis/);
 }finally{
  dom.window.Element.prototype.getBoundingClientRect=orig;
  Object.assign(globalThis,old);dom.window.close();
 }
});
