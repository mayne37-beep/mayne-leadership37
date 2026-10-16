import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';

test('SWOT & TOWS Studio supports real editing, pointer dragging, resizing, strategy building, scenarios and actions',async()=>{
 const html=await readFile(new URL('../../swot-tows-studio.html',import.meta.url),'utf8');
 const dom=new JSDOM(html,{url:'https://www.mayneleadership.com/swot-tows-studio.html',pretendToBeVisual:true});
 const before={window:globalThis.window,document:globalThis.document,localStorage:globalThis.localStorage,
  FormData:globalThis.FormData,confirm:globalThis.confirm,Image:globalThis.Image};
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,localStorage:dom.window.localStorage,
  FormData:dom.window.FormData,confirm:()=>true,Image:dom.window.Image});
 const proto=dom.window.HTMLDialogElement.prototype;proto.showModal=function(){this.open=true};proto.close=function(){this.open=false};
 dom.window.print=()=>{};
 const $=q=>dom.window.document.querySelector(q);
 const state=()=>JSON.parse(dom.window.localStorage.getItem('mayne.swot-tows-studio.v1'));
 const active=()=>state().projects.find(x=>x.id===state().activeId);
 const input=(el,type='change')=>el.dispatchEvent(new dom.window.Event(type,{bubbles:true,cancelable:true}));
 const go=view=>$('[data-view="'+view+'"]').click();
 const click=(selector)=>{const target=$(selector);assert.ok(target,'Missing '+selector);target.click()};
 const point=(type,target,x,y)=>{const ev=new dom.window.Event(type,{bubbles:true,cancelable:true});
  for(const [k,v] of Object.entries({clientX:x,clientY:y,button:0,pointerId:1}))Object.defineProperty(ev,k,{value:v});
  target.dispatchEvent(ev);
 };
 // JSDOM doesn't lay out elements. Define sensible board rectangles for realistic pointer coordinates.
 const originalRect=dom.window.Element.prototype.getBoundingClientRect;
 dom.window.Element.prototype.getBoundingClientRect=function(){
  if(this.id==='swot-board')return {left:0,top:0,right:1200,bottom:960,width:1200,height:960};
  const q=this.dataset?.space;
  if(q){const left=q==='S'||q==='O'?0:600,top=q==='S'||q==='W'?75:550;return {left,top,right:left+600,bottom:top+320,width:600,height:320}};
  if(this.classList?.contains('factor-card')){
   const parent=this.closest('[data-space]'),r=parent?.getBoundingClientRect()||{left:0,top:0,width:600,height:320};
   const x=parseFloat(this.style.left)||30,y=parseFloat(this.style.top)||30;
   const left=r.left+r.width*x/100-this.offsetWidth/2,top=r.top+r.height*y/100-this.offsetHeight/2;
   return {left,top,right:left+200,bottom:top+106,width:200,height:106};
  }
  return {left:0,top:0,right:1200,bottom:960,width:1200,height:960};
 };
 try{
  await import('../../assets/swot-studio.js?test=interactive');
  assert.equal(active().factors.length,0,'A blank map opens initially');

  $('#quick-factor').value='Skilled instructors';
  $('#quick-quadrant').value='S';
  click('#quick-add');
  assert.equal(active().factors.length,1);
  let f=active().factors[0],id=f.id;
  assert.equal(f.quadrant,'S');
  assert.match($('[data-factor="'+id+'"]').textContent,/Skilled instructors/);

  // Direct factor size editor and color swatch.
  click('[data-factor="'+id+'"]');
  click('[data-factor-color="gold"]');
  assert.equal(active().factors[0].color,'gold');
  $('#edit-group').value='Faculty';input($('#edit-group'),'input');input($('#edit-group'),'change');
  assert.equal(active().factors[0].group,'Faculty');
  $('#card-width').value='250';input($('#card-width'),'input');input($('#card-width'),'change');
  assert.equal(active().factors[0].w,250);

  // Drag from upper left S to upper right W using pointer events.
  const card=$('[data-factor="'+id+'"]');
  point('pointerdown',card,200,200);
  point('pointermove',$('#swot-board'),830,250);
  point('pointerup',$('#swot-board'),830,250);
  assert.equal(active().factors[0].quadrant,'W');
  assert.ok(active().factors[0].x>10);
  assert.equal($('[data-space="W"] [data-factor="'+id+'"]').dataset.factor,id);

  // Return to S using inspector classification.
  $('#edit-quadrant').value='S';input($('#edit-quadrant'));
  assert.equal(active().factors[0].quadrant,'S');

  // Add an opportunity to enable SO pairing.
  $('#quick-factor').value='Growing online training demand';$('#quick-quadrant').value='O';click('#quick-add');
  assert.equal(active().factors.length,2);
  go('tows');
  assert.equal($('[data-tows-type="SO"]').classList.contains('active'),true);
  assert.ok($('#tows-first').value&&$('#tows-second').value);
  assert.match($('#pair-preview').textContent,/Skilled instructors/);
  assert.match($('#strategy-draft').value,/capitalize on/);
  click('#strategy-add');
  assert.equal(active().strategies.length,1);
  assert.equal(active().strategies[0].type,'SO');
  const strategyId=active().strategies[0].id;

  // Ranking and adjustable weights.
  go('priorities');
  assert.match($('#ranking-view').textContent,/Skilled instructors/);
  $('#weight-impact').value='60';input($('#weight-impact'));
  assert.equal(active().weights.impact,60);

  // Hypothetical scenario compares but does not modify baseline.
  go('scenarios');click('#scenario-new');
  assert.equal(active().scenarios.length,1);
  const baseline=active().strategies[0].impact;
  const shift=$('[data-shift-kind="factor"][data-shift-key="O"]');
  shift.value='2';input(shift);
  assert.equal(active().scenarios[0].factorShifts.O,2);
  assert.equal(active().strategies[0].impact,baseline);
  assert.match($('#scenario-comparison').textContent,/Skilled instructors/);

  // Action linked to TOWS; status changes and export report remains printable.
  go('actions');click('#action-new');
  assert.equal($('#editor-dialog').open,true);
  $('[name="title"]').value='Pilot virtual instruction';
  $('[name="strategyId"]').value=strategyId;
  $('[name="owner"]').value='Curriculum lead';
  $('[name="metric"]').value='Learner completion rate';
  $('[name="target"]').value='90%';
  $('#editor-form').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));
  assert.equal(active().actions.length,1);
  assert.equal(active().actions[0].strategyId,strategyId);
  const status=$('[data-action-status]');status.value='Done';input(status);
  assert.equal(active().actions[0].status,'Done');

  // New example creates an independent project; persisted current project remains intact.
  click('#sample-project');
  assert.equal(state().projects.length,2);
  assert.equal(active().factors.length,8);
  assert.equal(active().strategies.length,4);
  assert.equal(state().projects[1].actions[0].status,'Done');
  click('#undo');assert.ok($('#redo'));click('#redo');
 }finally{
  dom.window.Element.prototype.getBoundingClientRect=originalRect;
  Object.assign(globalThis,before);dom.window.close();
 }
});

test('SWOT visual export and print report escape user-provided text',async()=>{
 const {sampleProject,addFactor}=await import('../../assets/swot-model.js');
 const {diagramSVG,reportHTML}=await import('../../assets/swot-render.js');
 const p=sampleProject();addFactor(p,'T','<script>alert("bad")</script>');
 assert.ok(!diagramSVG(p).includes('<script>'));
 assert.ok(reportHTML(p).includes('Action plan'));
});
