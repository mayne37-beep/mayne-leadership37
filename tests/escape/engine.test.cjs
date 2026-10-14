const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
function load(name){const m={exports:{}};new Function('module','exports',fs.readFileSync(path.join(__dirname,'../../assets/escape-room/'+name),'utf8'))(m,m.exports);return m.exports;}
const E=load('engine.js');
const P=load('panorama.js');
const sandbox={window:{}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../../assets/escape-room/template.js'),'utf8'),sandbox);
const template=()=>JSON.parse(JSON.stringify(sandbox.window.EscapeTemplate.template()));
test('example learning mission: prerequisites, clues, key, lid, final decision',()=>{
  const p=template(),r=E.newRun(p);
  assert.deepEqual(E.validate(p),[]);
  assert.equal(E.collect(p,r,'verification-key').ok,false,'hidden item is unavailable');
  assert.equal(E.answer(p,r,'review-panel','EVALUATE').ok,false,'cannot skip the assembly puzzle');
  assert.equal(E.activate(p,r,'command-door').ok,false,'cannot bypass review');
  assert.equal(E.answer(p,r,'evidence-case','111').ok,false);
  assert.equal(E.answer(p,r,'evidence-case','431').ok,true);
  assert.equal(E.visible(r,E.find(p,'verification-key')),true);
  assert.equal(E.collect(p,r,'verification-key').ok,true);
  assert.equal(E.drop(p,r,'verification-key','lab-door').ok,true);
  assert.equal(r.sceneId,'lab');assert.deepEqual(r.inventory,[]);
  assert.equal(E.answer(p,r,'review-panel','evaluate').ok,false);
  assert.equal(E.drop(p,r,'container-lid','containment-unit').ok,true,'can drag uncollected item directly from the room');
  assert.equal(r.placed['containment-unit'],'container-lid');
  assert.equal(E.visible(r,E.find(p,'container-lid')),false);
  assert.equal(E.visible(r,E.find(p,'evaluation-note')),true);
  assert.equal(E.drop(p,r,'container-lid','containment-unit').ok,false,'cannot duplicate attached items');
  assert.equal(E.answer(p,r,'review-panel','  EvALuATE  ').ok,true);
  assert.equal(E.activate(p,r,'command-door').ok,true);
  assert.equal(r.sceneId,'command');
  assert.equal(E.answer(p,r,'release-panel','ACT').ok,false);
  assert.equal(E.answer(p,r,'release-panel','verify').ok,true);
  assert.equal(r.finished,true);assert.ok(r.ended);
  assert.equal(r.solved.filter(id=>id!=='command-door').length,5);
  assert.ok(r.log.some(x=>x.event==='completed'));
  assert.equal(E.activate(p,r,'command-back').ok,false,'finished sessions are stable');
});
test('wrong item never consumes inventory, and reusable items remain available',()=>{
  const p=template(),r=E.newRun(p);
  E.answer(p,r,'evidence-case','431');E.collect(p,r,'verification-key');
  assert.equal(E.drop(p,r,'verification-key','containment-unit').ok,false);
  assert.deepEqual(r.inventory,['verification-key']);
  E.find(p,'lab-door').placement='keep';
  E.drop(p,r,'verification-key','lab-door');
  assert.deepEqual(r.inventory,['verification-key']);
});
test('alternative answers and prerequisite-loop detection',()=>{
  const p=template(),r=E.newRun(p);
  E.find(p,'evidence-case').alternatives=['four three one'];
  assert.equal(E.answer(p,r,'evidence-case','Four   Three ONE').ok,true);
  E.find(p,'evidence-case').requires=['review-panel'];
  E.find(p,'review-panel').requires=['evidence-case'];
  assert.ok(E.validate(p).some(x=>x.includes('prerequisite loop')));
  E.find(p,'review-panel').requires=['evidence-note'];
  assert.ok(E.validate(p).some(x=>x.includes('prerequisites must')));
});
test('panorama hotspot projection is invertible across viewing angles',()=>{
  for(const yaw of [-160,-40,0,70,170])for(const pitch of [-40,0,40])for(const px of [200,400,600])for(const py of [125,250,375]){
    const view={yaw,pitch,fov:75},d=P.directionAt(px,py,800,500,view),screen=P.project(d.yaw,d.pitch,800,500,view);
    assert.ok(screen);assert.ok(Math.abs(screen.x-px/8)<1e-8);assert.ok(Math.abs(screen.y-py/5)<1e-8);
  }
  assert.equal(P.project(180,0,800,500,{yaw:0,pitch:0,fov:75}),null);
});
