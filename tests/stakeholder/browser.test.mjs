import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';

test('Stakeholder Studio adds, moves, resizes, restyles, saves and plans engagement',async()=>{
 const markup=await readFile(new URL('../../stakeholder-mapping-studio.html',import.meta.url),'utf8');
 const dom=new JSDOM(markup,{url:'https://www.mayneleadership.com/stakeholder-mapping-studio.html',pretendToBeVisual:true});
 const old={window:globalThis.window,document:globalThis.document,localStorage:globalThis.localStorage,confirm:globalThis.confirm,Image:globalThis.Image};
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,localStorage:dom.window.localStorage,confirm:()=>true,Image:dom.window.Image});
 const proto=dom.window.HTMLDialogElement.prototype;
 proto.showModal=function(){this.open=true};proto.close=function(){this.open=false};
 dom.window.SVGElement.prototype.getBoundingClientRect=function(){return {left:0,top:0,right:1200,bottom:760,width:1200,height:760}};
 const $=q=>dom.window.document.querySelector(q);
 const state=()=>JSON.parse(dom.window.localStorage.getItem('mayne.stakeholder-mapping.v1'));
 const change=el=>el.dispatchEvent(new dom.window.Event('change',{bubbles:true}));
 const input=el=>el.dispatchEvent(new dom.window.Event('input',{bubbles:true}));
 function pointer(type,target,x,y){
  const ev=new dom.window.Event(type,{bubbles:true,cancelable:true});
  Object.defineProperties(ev,{clientX:{value:x},clientY:{value:y},pointerId:{value:1},button:{value:0}});
  target.dispatchEvent(ev);return ev;
 }
 try{
  await import('../../assets/stakeholder-studio.js?test=editing');
  assert.equal(state().maps.length,1);
  assert.equal(state().maps[0].nodes.length,0);
  assert.equal($('#empty-board').hidden,false);
  $('#quick-name').value='Program Sponsor';
  $('#quick-role').value='Program approval';
  $('#quick-add').click();
  let m=state().maps[0],n=m.nodes[0],id=n.id;
  assert.equal(m.nodes.length,1);assert.equal(n.label,'Program Sponsor');
  assert.equal($('#empty-board').hidden,true);
  assert.match($('#map-host').innerHTML,/Program Sponsor/);

  $('[data-shape=diamond]').click();
  $('[data-color=gold]').click();
  m=state().maps[0];n=m.nodes[0];
  assert.equal(n.shape,'diamond');assert.equal(n.color,'gold');
  assert.match($('#map-host').innerHTML,/<polygon/);

  $('#edit-label').value='Executive Sponsor';
  input($('#edit-label'));change($('#edit-label'));
  assert.equal(state().maps[0].nodes[0].label,'Executive Sponsor');

  // Move by direct pointer dragging on the SVG stakeholder.
  n=state().maps[0].nodes[0];
  pointer('pointerdown',$('[data-node="'+id+'"]'),n.x,n.y);
  pointer('pointermove',$('#map-host'),n.x+100,n.y+65);
  pointer('pointerup',$('#map-host'),n.x+100,n.y+65);
  m=state().maps[0];n=m.nodes[0];
  assert.ok(n.x>530,'X changed after direct drag');
  assert.ok(n.y>280,'Y changed after direct drag');

  // Resize by the selected node's handle.
  const currentW=n.w,currentH=n.h;
  const handle=$('[data-resize="'+id+'"]');
  assert.ok(handle,'resize handle visible after selecting the node');
  const originX=n.x+n.w/2,originY=n.y+n.h/2;
  pointer('pointerdown',handle,originX,originY);
  pointer('pointermove',$('#map-host'),originX+25,originY+18);
  pointer('pointerup',$('#map-host'),originX+25,originY+18);
  n=state().maps[0].nodes[0];
  assert.ok(n.w>currentW&&n.h>currentH);

  // Add a second stakeholder and link them.
  $('[data-starter="Team members"]').click();
  m=state().maps[0];assert.equal(m.nodes.length,2);
  const id2=m.nodes[1].id;
  $('#link-target').value=id;
  $('#link-label').value='Needs approval';
  $('#add-link').click();
  m=state().maps[0];assert.equal(m.links.length,1);
  assert.equal(m.links[0].from,id2);assert.equal(m.links[0].to,id);
  assert.match($('#map-host').innerHTML,/Needs approval/);

  // Update the board matrix and engagement plan.
  $('#matrix-select').value='influence-impact';change($('#matrix-select'));
  assert.equal(state().maps[0].matrix,'influence-impact');
  $('#edit-stance').value='Concerned';change($('#edit-stance'));
  assert.equal(state().maps[0].nodes[1].stance,'Concerned');
  $('#edit-approach').value='Schedule a listening session';
  input($('#edit-approach'));change($('#edit-approach'));
  $('[data-pane=engagement]').click();
  assert.ok($('#engagement-grid').innerHTML.includes('Schedule a listening session'));
  $('[data-pane=map]').click();

  // Undo/redo can restore the last committed change.
  $('#undo').click();
  assert.ok($('#undo'));
  $('#redo').click();

  // Map library duplication creates independent references.
  $('#toggle-library').click();
  assert.equal($('#library-dialog').open,true);
  $('#close-library').click();
  $('#duplicate-stake').click();
  assert.equal(state().maps[0].nodes.length,3);
  $('#example').click();
  assert.equal(state().maps.length,2);
  assert.equal(state().maps[0].nodes.length,7);
  assert.equal(state().maps[1].nodes.length,3);
  assert.equal(state().maps[0].links.length,3);
  assert.ok($('#stake-count').textContent==='7');
 }finally{
  Object.assign(globalThis,old);dom.window.close();
 }
});

test('Stakeholder SVG uses native shape attributes and exports without the editor viewport',async()=>{
 const {createMap,createNode,placeNode}=await import('../../assets/stakeholder-model.js');
 const {renderMapSVG,exportSVGMarkup}=await import('../../assets/stakeholder-svg.js');
 const m=createMap('Preview');placeNode(m,createNode('Decision makers',350,250,{shape:'hexagon',color:'violet'}));
 assert.match(renderMapSVG(m,m.nodes[0].id,{x:100,y:120,w:450,h:290}),/viewBox="100 120 450 290"/);
 assert.match(exportSVGMarkup(m),/viewBox="0 0 1200 760"/);
 assert.match(renderMapSVG(m),/role="img"/);
});
