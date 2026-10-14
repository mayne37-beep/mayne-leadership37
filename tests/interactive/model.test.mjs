import test from 'node:test';
import assert from 'node:assert/strict';
import {newProject,newSlide,newObject,demoProject,clone,uid,validateProject,duplicateSlide,learnerProject} from '../../assets/interactive-model.js';
import {createEngine} from '../../assets/interactive-engine.js';
import {exportHTML} from '../../assets/interactive-export.js';
test('editable example demonstrates a complete decision path',()=>{
  const p=demoProject();assert.deepEqual(validateProject(p),[]);let completions=0;
  const e=createEngine(p,{onComplete:()=>completions++}),s=e.slide(),good=s.layers[0].objects.find(o=>o.name==='Investigate causes');
  e.click(good.id);assert.equal(e.snapshot().variables[p.variables[0].id],1);assert.equal(e.snapshot().memory[s.id].layers.length,1);
  e.advance(5);assert.equal(e.snapshot().time,0,'Modal feedback must pause the base timeline');
  e.click(s.layers[1].objects.find(o=>o.name==='Continue after feedback').id);assert.equal(e.slide().title,'Reflect on your decision');
  e.click(e.slide().layers[0].objects.find(o=>o.name==='Finish course').id);e.click(e.slide().layers[0].objects.find(o=>o.name==='Finish course').id);
  assert(e.snapshot().completed);assert.equal(completions,1);
});
test('trigger order and a typed variable condition control a branch',()=>{
  const p=demoProject(),s=p.scenes[0].slides[0],v=p.variables[0],good=s.layers[0].objects.find(o=>o.name==='Investigate causes');
  s.triggers[1]={id:uid(),event:'click',source:good.id,enabled:true,action:'navigate',target:p.scenes[0].slides[1].id,condition:{variable:v.id,op:'gte',value:'1'}};
  const e=createEngine(p);e.click(good.id);assert.equal(e.slide().id,p.scenes[0].slides[1].id);
});
test('time triggers fire once; seek does not award duplicate points',()=>{
  const p=demoProject(),s=p.scenes[0].slides[0],v=p.variables[0];s.triggers=[{id:uid(),event:'time',at:2,action:'variable',target:v.id,value:5,operation:'add'}];
  const e=createEngine(p);e.advance(3);e.seek(0);e.advance(4);assert.equal(e.snapshot().variables[v.id],5);
});
test('resume restores state; reset revisit restarts it',()=>{
  const p=demoProject(),s=p.scenes[0].slides[0],good=s.layers[0].objects.find(o=>o.name==='Investigate causes'),e=createEngine(p);
  e.click(good.id);const saved=e.snapshot(),restored=createEngine(p);assert(restored.restore(saved));assert.equal(restored.snapshot().variables[p.variables[0].id],1);
  e.goto(p.scenes[0].slides[1].id);e.goto(s.id);assert.equal(e.snapshot().memory[s.id].states[good.id],'visited');
  s.revisit='reset';e.goto(p.scenes[0].slides[1].id);e.goto(s.id);assert.equal(e.snapshot().memory[s.id].states[good.id],'normal');
});
test('slide duplication remaps internal references without collisions',()=>{
  const p=demoProject(),s=p.scenes[0].slides[0],copy=duplicateSlide(s);p.scenes[0].slides.push(copy);assert.deepEqual(validateProject(p),[]);
  assert.notEqual(copy.layers[0].objects[0].id,s.layers[0].objects[0].id);assert(copy.triggers.some(t=>t.target===copy.layers[1].id));
});
test('validation catches dangling references and unsupported image sources',()=>{
  const p=demoProject();p.scenes[0].slides[0].triggers[0].target=uid();assert(validateProject(p).some(x=>x.includes('missing variable')));
  const q=newProject();q.scenes[0].slides[0].layers[0].objects.push(newObject('image',{src:'javascript:alert(1)'}));assert(validateProject(q).some(x=>x.includes('image')));
});
test('export removes instructor notes and escapes script-closing text',()=>{
  const p=demoProject();p.scenes[0].slides[0].notes='PRIVATE INSTRUCTOR NOTES';p.scenes[0].slides[0].layers[0].objects[0].text='</script><script>alert(1)</script>';
  const html=exportHTML(p);assert(!html.includes('PRIVATE INSTRUCTOR NOTES'));assert(!html.includes('<script>alert(1)'));assert(html.includes('\\u003c/script>'));assert(!html.includes('src="/assets/'));
});
test('variable trigger loops stop with a useful error',()=>{
  const p=demoProject(),s=p.scenes[0].slides[0],v=p.variables[0];s.triggers.push({id:uid(),event:'variable-change',source:v.id,action:'variable',target:v.id,value:1,operation:'add'});
  const e=createEngine(p);assert.throws(()=>e.click(s.layers[0].objects.find(o=>o.name==='Investigate causes').id),/loop detected/);assert.equal(e.snapshot().playing,false);
});
