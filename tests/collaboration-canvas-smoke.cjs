// Collaboration Canvas Studio — zero-dependency source regression checks.
// Run: node tests/collaboration-canvas-smoke.cjs
// This is NOT a substitute for real multi-browser classroom testing.
const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const js=read('assets/collaboration-canvas.js');
const css=read('assets/collaboration-canvas.css');
const host=read('collaboration-canvas.html');
const guest=read('collaboration-join.html');
new vm.Script(js,{filename:'collaboration-canvas.js'});
assert.match(host, /data-entry="owner"/);
assert.match(guest, /data-entry="guest"/);
assert.match(host, /vendor\/qrcode\.min\.js/);
assert.match(host,/id="pro-toolbar"/);
assert.match(guest,/id="pro-toolbar"/);
const staticIds=new Set([...host.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]));
const ids=[...js.matchAll(/\$\('#([^']+)'\)/g)].map(x=>x[1]);
for(const id of ids){
 const dynamicallyCreated=js.includes("id='"+id+"'");
 assert.ok(staticIds.has(id)||dynamicallyCreated,'Undefined element '+id);
}
for(const feature of ['function resizeGeometry(','function groupSelection(','function openDecisionMatrix(','function startPresence(','function submitPrivateIdea(','function createBreakoutRoom(','function mergeBreakoutRoom(','function clusterByColor('])
 assert.ok(js.includes(feature),'Missing feature '+feature);
assert.ok(css.includes('.canvas-resize-handle'),'Resize handle styles missing');
assert.ok(css.includes('.pro-matrix-table'),'Matrix styles missing');
const start=js.indexOf('function resizeGeometry('),end=js.indexOf('function beginResize(',start);
const calculate=new Function(js.slice(start,end)+';return resizeGeometry')();
const base={x:100,y:100,w:200,h:100};
const expected=[['se',40,25,240,125],['nw',20,10,180,90],['e',80,0,280,100],['s',0,100,200,200]];
for(const [side,dx,dy,w,h] of expected){
 const result=calculate(base,side,dx,dy);
 assert.equal(result.w,w,side+' width');assert.equal(result.h,h,side+' height');
}
assert.ok(read('assets/vendor/QRCode-LICENSE.txt').includes('MIT License'),'QRCode MIT license missing');
console.log('Canvas smoke tests passed: JS syntax, HTML controls, asset references, feature presence, resize geometry.');

// Regression: querySelector (single node) must never be used as a collection.
assert.doesNotMatch(js,/(?<!\$)\$\('[^']+'\)\.(?:forEach|map|filter|find|some|every)\(/,'A single DOM element cannot be looped like an array');

// Execute the actual selection, resize, and grouped drag handlers against a tiny DOM.
const part=(a,b)=>{const i=js.indexOf(a),j=js.indexOf(b,i+a.length);assert.ok(i>=0&&j>i,a+' bounds');return js.slice(i,j)};
const handlers=part('function select(id,','function updateSelectionStatus()')+part('function resizeGeometry(','function beginResize(e,')+part('function beginResize(e,id,handle)','function resizeControls(')+part('function onObjectDown(e,id)','function startPan(e,')+part('function onPointerMove(e)','function onPointerUp(e)');
const runtime=new Function('objects','nodes','viewport','inspector',`
  'use strict';
  let selected=null,selectedIds=new Set(),editingInput=null,tool='select',room=null,spaceDown=false,connectFrom=null,dragging=null,zoom=1,pan={x:0,y:0},penWidth=4,laserEl=null;
  const board={items:objects,settings:{}};
  const $=sel=>sel==='#canvas-viewport'?viewport:inspector[sel]||{};
  const $$=()=>nodes;
  const document={querySelectorAll:s=>s==='.item'?nodes:[]};
  const editable=o=>!!o&&!o.locked,canChangeSelected=()=>true,getObj=id=>objects.find(x=>x.id===id),isMulti=e=>!!(e.shiftKey||e.ctrlKey||e.metaKey),selectedObjects=()=>[...selectedIds].map(getObj).filter(Boolean);
  const before=()=>{},renderWires=()=>{},renderInspector=()=>{},updateSelectionStatus=()=>{},finishInlineEdit=()=>{},announce=()=>{},worldPoint=e=>({x:e.clientX,y:e.clientY});
  const startPan=()=>{},startInlineEdit=()=>{},add=()=>{},setTool=()=>{},toast=()=>{},save=()=>{},enqueue=()=>{},render=()=>{},voteChoices=new Set(),COLORS=['#fff'];
  ${handlers}
  return {select,beginResize,onObjectDown,onPointerMove,state:()=>({selected,selectedIds:[...selectedIds],dragging})};
`);
const testWorkspace=()=>{
  const objects=[{id:'note0001',type:'note',group:'grpa',x:100,y:100,w:200,h:100,locked:false},{id:'note0002',type:'note',group:'grpa',x:370,y:100,w:200,h:100,locked:false},{id:'shape0003',type:'shape',group:'',x:640,y:100,w:200,h:100,locked:false}];
  const nodes=objects.map(o=>({dataset:{id:o.id},style:{},classList:{toggle(name,on){this[name]=on}}}));
  const viewport={setPointerCapture(){},classList:{add(){},remove(){}}};
  const inspector={'#object-width':{value:0},'#object-height':{value:0}};
  return {objects,nodes,app:runtime(objects,nodes,viewport,inspector)};
};
const workspace1=testWorkspace();
workspace1.app.select('shape0003');
assert.equal(workspace1.nodes[2].classList.selected,true,'Shape must be selectable');
workspace1.app.beginResize({button:0,clientX:0,clientY:0,pointerId:7,preventDefault(){},stopPropagation(){}},'shape0003','se');
workspace1.app.onPointerMove({clientX:60,clientY:40,shiftKey:false});
assert.equal(workspace1.objects[2].w,260,'Dragging the resize handle must change model width');
assert.equal(workspace1.objects[2].h,140,'Dragging the resize handle must change model height');
assert.equal(workspace1.nodes[2].style.width,'260px','Dragging resize must update element width');
const workspace2=testWorkspace();
workspace2.app.onObjectDown({button:0,pointerId:9,clientX:200,clientY:200,shiftKey:false,stopPropagation(){}},'note0001');
assert.equal(workspace2.app.state().selectedIds.length,2,'Dragging a grouped note must select its group');
workspace2.app.onPointerMove({clientX:230,clientY:220});
assert.equal(workspace2.objects[0].x,130,'First grouped note must move');
assert.equal(workspace2.objects[1].x,400,'Second grouped note must move');
assert.equal(workspace2.nodes[0].style.left,'130px','Grouped movement must update DOM coordinates');
console.log('Canvas interactive regression tests passed: selection, resize, grouped movement.');
