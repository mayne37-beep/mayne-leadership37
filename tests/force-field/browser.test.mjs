import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';

test('Force Field Studio supports working force dragging, slider edits, what-if, linked actions and challenge scoring',async()=>{
 const markup=await readFile(new URL('../../force-field-studio.html',import.meta.url),'utf8');
 const dom=new JSDOM(markup,{url:'https://www.mayneleadership.com/force-field-studio.html',pretendToBeVisual:true});
 const before={window:globalThis.window,document:globalThis.document,localStorage:globalThis.localStorage,FormData:globalThis.FormData,confirm:globalThis.confirm,Image:globalThis.Image};
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,localStorage:dom.window.localStorage,FormData:dom.window.FormData,confirm:()=>true,Image:dom.window.Image});
 const proto=dom.window.HTMLDialogElement.prototype;
 proto.showModal=function(){this.open=true};proto.close=function(){this.open=false};
 const $=q=>dom.window.document.querySelector(q),all=q=>[...dom.window.document.querySelectorAll(q)];
 const state=()=>JSON.parse(dom.window.localStorage.getItem('mayne.force-field-studio.v1'));
 const p=()=>state().projects.find(x=>x.id===state().projectId);
 const input=(node,kind='change')=>node.dispatchEvent(new dom.window.Event(kind,{bubbles:true,cancelable:true}));
 const click=q=>{const el=$(q);assert.ok(el,'Missing '+q);if(typeof el.click==='function')el.click();else el.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true,cancelable:true}));};
 const go=v=>click('[data-view="'+v+'"]');
 const pointer=(type,target,x,y)=>{const ev=new dom.window.Event(type,{bubbles:true,cancelable:true});
  for(const [key,val] of Object.entries({pointerId:1,button:0,clientX:x,clientY:y}))Object.defineProperty(ev,key,{value:val});
  target.dispatchEvent(ev);
 };
 const origRect=dom.window.Element.prototype.getBoundingClientRect;
 dom.window.Element.prototype.getBoundingClientRect=function(){
  if(this.id==='force-svg')return {left:0,top:0,right:1200,bottom:680,width:1200,height:680};
  return {left:0,top:0,right:1200,bottom:680,width:1200,height:680};
 };
 let printed=false;dom.window.print=()=>printed=true;
 try{
  await import('../../assets/force-field-studio.js?test=force-field-browser');
  assert.equal(p().forces.length,0);
  assert.match($('#force-svg').outerHTML,/viewBox="0 0 1200 680"/);

  $('#change-name').value='Improve leadership learning accessibility';
  input($('#change-name'));
  assert.equal(p().change,'Improve leadership learning accessibility');

  $('#quick-label').value='Experienced facilitators';$('#quick-side').value='driving';$('#quick-strength').value='4';
  click('#quick-add-button');
  assert.equal(p().forces.length,1);
  const driveId=p().forces[0].id;
  assert.equal(p().forces[0].strength,4);
  assert.match($('#force-svg').outerHTML,/Experienced facilitators/);

  click('[data-starter-label="Competing priorities"]');
  assert.equal(p().forces.length,2);
  assert.equal(p().forces[1].side,'restraining');
  const initial=p().forces[0].y;
  const glyph=$('[data-force="'+driveId+'"]');
  pointer('pointerdown',glyph,270,208);
  pointer('pointermove',$('#board-svg-host'),310,260);
  pointer('pointerup',$('#board-svg-host'),310,260);
  assert.ok(p().forces[0].y>initial,'Force moved vertically on board');
  assert.equal(p().forces[0].strength,5,'Dragging toward center increases intensity');

  // Select and edit stakeholder metadata plus rating from the inspector.
  click('[data-force="'+driveId+'"]');
  $('#edit-stakeholder').value='Program sponsor';
  input($('#edit-stakeholder'),'input');input($('#edit-stakeholder'),'change');
  assert.equal(p().forces[0].stakeholder,'Program sponsor');
  $('#edit-strength').value='2';
  input($('#edit-strength'),'input');input($('#edit-strength'),'change');
  assert.equal(p().forces[0].strength,2);
  click('[data-color="gold"]');
  assert.equal(p().forces[0].color,'gold');

  // What-if shifts only hypothetical ratings, not the baseline force.
  go('scenarios');click('#new-scenario');
  assert.equal(p().scenarios.length,1);
  const restrain=p().forces.find(f=>f.side==='restraining');
  const slider=$('[data-scenario-force="'+restrain.id+'"]');
  slider.value='0';input(slider,'input');
  assert.ok($('#scenario-net').textContent.length>0);
  input(slider,'change');
  assert.equal(p().scenarios[0].shifts[restrain.id],0);
  assert.equal(p().forces.find(f=>f.id===restrain.id).strength,3);
  assert.match($('#scenario-label').textContent,/Driving/);

  // Add a linked intervention, change status, and check persistence.
  go('actions');click('#new-action');
  assert.equal($('#editor-dialog').open,true);
  $('[name="title"]').value='Pilot a new schedule';
  $('[name="forceId"]').value=restrain.id;
  $('[name="method"]').value='Reduce resistance';
  $('[name="owner"]').value='Training team';
  $('[name="metric"]').value='Delayed courses';
  $('[name="target"]').value='Below five per month';
  $('#editor-form').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));
  assert.equal(p().actions.length,1);
  assert.equal(p().actions[0].forceId,restrain.id);
  assert.equal(p().actions[0].owner,'Training team');
  const st=$('[data-action-status]');st.value='Completed';input(st);
  assert.equal(p().actions[0].status,'Completed');

  // Classroom team proposals are scored with a transparent 20-point rubric.
  go('challenge');click('#add-team');
  $('[name="name"]').value='Team Blue';
  $('[name="proposal"]').value='Trial a shared review calendar';
  $('[name="evidence"]').value='Previous course planning delays';
  $('[name="tradeoffs"]').value='Facilitators need protected planning time';
  $('#editor-form').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));
  assert.equal(p().teams.length,1);
  const score=$('[data-score-key="impact"]');score.value='5';input(score);
  assert.equal(p().teams[0].scores.impact,5);
  assert.match($('#team-list').textContent,/Team Blue/);

  // Open sample without overwriting current saved work.
  click('[data-example="technology"]');
  assert.equal(state().projects.length,2);
  assert.equal(p().forces.length,8);
  assert.equal(state().projects[1].teams.length,1);
  assert.equal(state().projects[1].actions[0].status,'Completed');
  assert.equal(state().projects[1].forces[0].stakeholder,'Program sponsor');
  assert.ok(p().actions.length===1);
  $('#open-library').click();
  assert.ok($('#library-items').textContent.includes('Improve leadership'));
  assert.equal($('#library-dialog').open,true);
  closeAndPrint();
  function closeAndPrint(){
   $('[data-close="library-dialog"]').click();
   go('board');
   $('#export-menu').click();
   click('[data-export="report"]');
   assert.equal(printed,true);
   assert.match($('#print-area').innerHTML,/Visual force field/);
  }
 }finally{
  dom.window.Element.prototype.getBoundingClientRect=origRect;
  Object.assign(globalThis,before);dom.window.close();
 }
});

test('Standalone Force Field SVG respects accessible labels, class separation, and escapes project data',async()=>{
 const {createProject,addForce}=await import('../../assets/force-field-model.js');
 const {renderDiagram}=await import('../../assets/force-field-render.js');
 const p=createProject('<script>alert("x")</script>');
 const f=addForce(p,'driving','<img src=x onerror=bad()>',{strength:5});
 const svg=renderDiagram(p,f.id,null,{exportMode:true});
 assert.match(svg,/viewBox="0 0 1200 680"/);
 assert.match(svg,/data-strength-handle=/);
 assert.match(svg,/role="img"/);
 assert.match(svg,/width="1200" height="680"/);
 assert.ok(!svg.includes('<script>'));
 assert.ok(!svg.includes('<img src=x'));
});
