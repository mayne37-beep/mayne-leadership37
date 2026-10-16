import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';

test('Change Studio supports an editable organizational and individual adoption workflow',async()=>{
 const markup=await readFile(new URL('../../change-management-studio.html',import.meta.url),'utf8');
 const dom=new JSDOM(markup,{url:'https://www.mayneleadership.com/change-management-studio.html',pretendToBeVisual:true});
 const prior={window:globalThis.window,document:globalThis.document,localStorage:globalThis.localStorage,FormData:globalThis.FormData,confirm:globalThis.confirm,Image:globalThis.Image};
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,localStorage:dom.window.localStorage,FormData:dom.window.FormData,confirm:()=>true,Image:dom.window.Image});
 dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true};
 dom.window.HTMLDialogElement.prototype.close=function(){this.open=false};
 const $=q=>dom.window.document.querySelector(q);
 const all=q=>[...dom.window.document.querySelectorAll(q)];
 const data=()=>JSON.parse(dom.window.localStorage.getItem('mayne.change-studio.v1'));
 const p=()=>data().projects.find(x=>x.id===data().id);
 const click=q=>{const node=$(q);assert.ok(node,'Missing '+q);node.click()};
 const event=(node,type='change')=>node.dispatchEvent(new dom.window.Event(type,{bubbles:true,cancelable:true}));
 const go=view=>click('[data-view="'+view+'"]');
 const submit=()=>event($('#editor-form'),'submit');
 let didPrint=false;dom.window.print=()=>{didPrint=true};
 function drag(source,target,kind,id){
  let value='';
  const transfer={setData(k,v){if(k==='application/x-mayne-change')value=v},getData(k){return k==='application/x-mayne-change'?value:''},effectAllowed:'move',dropEffect:'move'};
  const fire=(el,type)=>{
   const ev=new dom.window.Event(type,{bubbles:true,cancelable:true});
   Object.defineProperty(ev,'dataTransfer',{value:transfer});el.dispatchEvent(ev);
  };
  fire(source,'dragstart');assert.ok(value.includes(id),'drag data payload should encode id');
  fire(target,'dragover');fire(target,'drop');
 }
 try{
  await import('../../assets/change-studio.js?test=change-browser');
  assert.equal(data().projects.length,1);
  assert.equal(p().groups.length,0);
  assert.match($('#view-title').textContent,/Make change visible/);

  $('#change-statement').value='Develop confident supervisors using virtual learning';
  event($('#change-statement'));
  assert.match(p().change,/confident supervisors/);

  click('[data-example="ai"]');
  assert.equal(data().projects.length,2);
  assert.equal(p().groups.length,4);
  assert.match($('#workspace').textContent,/Responsible AI/);

  // Stage editor: record evidence and progress.
  go('kotter');
  click('[data-edit-stage="3"]');
  assert.equal($('#editor-dialog').open,true);
  $('[name="status"]').value='In progress';
  $('[name="owner"]').value='Transformation office';
  $('[name="evidence"]').value='Vision draft reviewed with sponsors';
  submit();
  assert.equal(p().stageData[3].status,'In progress');
  assert.equal(p().stageData[3].owner,'Transformation office');
  assert.match(p().stageData[3].evidence,/reviewed with sponsors/);
  assert.equal($('#editor-dialog').open,false);

  // ADKAR readiness: update first weak-link group in place.
  go('adkar');
  const first=p().groups[0];
  const awareness=$('[data-adkar-group="'+first.id+'"][data-dimension="awareness"]');
  awareness.value='2';event(awareness);
  assert.equal(p().groups[0].adkar.awareness,2);
  assert.match($('#workspace').textContent,/First potential barrier: Awareness/);

  // Stakeholder map drag-drop from lower impact to high-influence high-impact quadrant.
  go('stakeholders');
  const id=p().groups[0].id;
  const target=$('[data-group-quadrant="high-high"]');
  drag($('[data-map-group="'+id+'"]'),target,'group',id);
  assert.equal(p().groups[0].impact,4);
  assert.equal(p().groups[0].influence,4);

  // Group editing: modify engagement concerns and preserve ADKAR scores.
  click('[data-edit="groups"][data-id="'+id+'"]');
  $('[name="concerns"]').value='Explain human review and quality controls';
  $('[name="engagement"]').value='Invite volunteers to test safe practices';
  submit();
  assert.match(p().groups[0].concerns,/human review/);
  assert.equal(p().groups[0].adkar.awareness,2);

  // Communications create a targeted, editable message.
  go('communications');click('[data-create="communications"]');
  $('[name="audienceId"]').value=id;
  $('[name="channel"]').value='Manager briefing';
  $('[name="message"]').value='Explain scope and oversight';
  $('[name="owner"]').value='Change sponsor';submit();
  const communication=p().communications.at(-1);
  assert.equal(communication.audienceId,id);
  assert.equal(communication.channel,'Manager briefing');

  // Milestone drag changes Kotter stage while retaining owner and measure.
  go('roadmap');click('[data-create="milestones"]');
  $('[name="title"]').value='Pilot manager workshops';
  $('[name="stage"]').value='3';
  $('[name="owner"]').value='Course lead';
  $('[name="measure"]').value='80 percent completion';submit();
  const milestone=p().milestones.at(-1);
  assert.equal(milestone.stage,3);
  drag($('[data-drag-milestone="'+milestone.id+'"]'),$('[data-lane="6"]'),'milestone',milestone.id);
  assert.equal(p().milestones.find(m=>m.id===milestone.id).stage,6);
  assert.equal(p().milestones.find(m=>m.id===milestone.id).owner,'Course lead');

  // Update open risk and measure its severity.
  go('risks');
  assert.match($('#workspace').textContent,/RISK HEAT MAP/);
  const riskId=p().risks[0].id;
  const status=$('[data-risk-status="'+riskId+'"]');status.value='Mitigating';event(status);
  assert.equal(p().risks[0].status,'Mitigating');

  // Record a real adoption pulse and confirm chart includes it.
  go('outcomes');click('[data-create="pulses"]');
  $('[name="date"]').value='2026-12-15';
  $('[name="adoption"]').value='64';$('[name="trained"]').value='78';$('[name="confidence"]').value='58';
  $('[name="notes"]').value='Observed pilot survey';
  submit();
  assert.equal(p().pulses.at(-1).adoption,64);
  assert.match($('#workspace').innerHTML,/polyline/);

  // Two cross-studio local imports: stakeholder and resisting-force data.
  dom.window.localStorage.setItem('mayne.stakeholder-mapping.v1',JSON.stringify({id:'m1',maps:[{id:'m1',name:'Stakeholder exercise',nodes:[{label:'Laboratory Team',role:'Pilot',stance:'Concerned',x:250,y:250}]}]}));
  click('#import-stakeholders');
  assert.ok(p().groups.some(g=>g.name==='Laboratory Team'));
  dom.window.localStorage.setItem('mayne.force-field-studio.v1',JSON.stringify({projectId:'f1',projects:[{id:'f1',title:'Force assessment',forces:[{side:'restraining',label:'Limited trainer coverage',strength:4,stakeholder:'Laboratory Team'}]}]}));
  click('#import-force-field');
  assert.ok(p().risks.some(r=>r.title==='Limited trainer coverage'));
  assert.equal(p().risks.at(-1).likelihood,4);

  // Full report and independent projects.
  click('#export-button');click('[data-export="report"]');
  assert.equal(didPrint,true);
  assert.match($('#print-report').innerHTML,/Kotter implementation roadmap/);
  assert.match($('#print-report').innerHTML,/Limited trainer coverage/);
  click('#new-project');
  assert.equal(data().projects.length,3);
  assert.equal(p().groups.length,0);
  click('#library-button');assert.equal($('#library-dialog').open,true);
  assert.match($('#library-list').textContent,/Responsible AI adoption/);
 }finally{Object.assign(globalThis,prior);dom.window.close()}
});

test('Planning model and dashboard avoid unsafe HTML from imported data',async()=>{
 const {createProject,addGroup}=await import('../../assets/change-studio-model.js');
 const {dashboardHTML,stakeholdersHTML,reportHTML}=await import('../../assets/change-studio-render.js');
 const p=createProject('<script>alert(1)</script>');
 p.change='<img src=x onerror=hack()>';
 addGroup(p,{name:'<svg onload=hack()>',role:'Stakeholder'});
 for(const html of [dashboardHTML(p),stakeholdersHTML(p),reportHTML(p)]){
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('<img src=x'));
  assert.match(html,/&lt;/);
 }
});
