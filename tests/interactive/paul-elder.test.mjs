import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {validateProject,learnerProject} from '../../assets/interactive-model.js';
import {createEngine} from '../../assets/interactive-engine.js';
import {exportHTML} from '../../assets/interactive-export.js';
const require=createRequire(import.meta.url),{JSDOM,VirtualConsole}=require('jsdom');
const p=JSON.parse(await readFile(new URL('../../assets/interactive-courses/critical-thinking-paul-elder.mayne-course.json',import.meta.url),'utf8'));
const metadata=p.courseMetadata,questions=metadata.assessmentSlides;
const variable=(e,name)=>e.snapshot().variables[p.variables.find(v=>v.name===name).id];
function confirmCapstone(e){e.goto(metadata.capstoneSlideId);e.click(metadata.capstoneObjectId);}
function respond(e,q,correct=true){e.goto(q.slide);e.click(correct?q.correct:q.buttons.find(id=>id!==q.correct));}
function results(e){e.goto(metadata.resultsSlideId);return e.snapshot();}
test('native course is complete, bounded, and structurally valid',()=>{
  assert.deepEqual(validateProject(p),[]);assert.equal(p.scenes.length,8);
  assert.equal(p.scenes.flatMap(s=>s.slides).length,64);assert.equal(p.scenes.reduce((n,s)=>n+s.suggestedMinutes,0),120);
  assert.equal(questions.length,12);assert(Buffer.byteLength(JSON.stringify(p))<3000000);
  for(const s of p.scenes.flatMap(s=>s.slides))for(const l of s.layers)for(const o of l.objects){assert(o.x>=0&&o.y>=0);assert(o.x+o.w<=p.width&&o.y+o.h<=p.height,`${s.title}: ${o.name}`);}
});
test('repeat clicks, question revisits, and result revisits never inflate score',()=>{
  const e=createEngine(p),q=questions[0];e.goto(q.slide);for(let i=0;i<8;i++)e.click(q.correct);
  results(e);assert.equal(variable(e,'quiz_score'),1);assert.equal(variable(e,'quiz_answered'),1);
  results(e);assert.equal(variable(e,'quiz_score'),1);
  respond(e,q,false);results(e);assert.equal(variable(e,'quiz_score'),0);assert.equal(variable(e,'quiz_answered'),1);
  respond(e,q,true);results(e);assert.equal(variable(e,'quiz_score'),1);
});
test('ten correct with two skipped does not enable completion',()=>{
  const e=createEngine(p);confirmCapstone(e);questions.slice(0,10).forEach(q=>respond(e,q));results(e);
  assert.equal(variable(e,'quiz_score'),10);assert.equal(variable(e,'quiz_answered'),10);assert.equal(variable(e,'course_ready'),false);
  e.click(metadata.finishObjectId);assert.equal(e.snapshot().completed,false);
});
test('all questions answered below threshold cannot complete',()=>{
  const e=createEngine(p);confirmCapstone(e);questions.forEach((q,i)=>respond(e,q,i<9));results(e);
  assert.equal(variable(e,'quiz_score'),9);assert.equal(variable(e,'quiz_answered'),12);assert.equal(variable(e,'quiz_percent'),75);
  assert.equal(variable(e,'course_ready'),false);e.click(metadata.finishObjectId);assert.equal(e.snapshot().completed,false);
});
test('a passing quiz still requires the learner capstone confirmation',()=>{
  const e=createEngine(p);questions.forEach(q=>respond(e,q));results(e);
  assert.equal(variable(e,'quiz_score'),12);assert.equal(variable(e,'course_ready'),false);
  e.click(metadata.finishObjectId);assert.equal(e.snapshot().completed,false);
  confirmCapstone(e);results(e);assert.equal(variable(e,'course_ready'),true);
  e.click(metadata.finishObjectId);assert.equal(e.snapshot().completed,true);
});
test('10/12 qualifies with every question answered and a capstone confirmation',()=>{
  let completions=0;const e=createEngine(p,{onComplete:()=>completions++});confirmCapstone(e);questions.forEach((q,i)=>respond(e,q,i<10));results(e);
  assert.equal(variable(e,'quiz_score'),10);assert.equal(variable(e,'quiz_percent'),83);assert.equal(variable(e,'course_ready'),true);
  e.click(metadata.finishObjectId);e.click(metadata.finishObjectId);assert.equal(completions,1);
});
test('response, state, capstone, and completion survive a resume',()=>{
  const e=createEngine(p);confirmCapstone(e);questions.forEach(q=>respond(e,q));results(e);e.click(metadata.finishObjectId);
  const restored=createEngine(p,{saved:e.snapshot()});assert.equal(restored.snapshot().completed,true);results(restored);
  assert.equal(variable(restored,'quiz_score'),12);assert.equal(variable(restored,'capstone_done'),true);
});
test('both export paths remove private instructor notes and remain standalone',async()=>{
  const native=exportHTML(p),html=await readFile(new URL('../../critical-thinking-paul-elder.html',import.meta.url),'utf8');
  for(const output of [native,html]){assert(!output.includes('FACILITATOR:'));assert(!output.includes('src="/assets/'));assert(output.includes('mayne-interactive-course'));}
  assert(p.scenes.flatMap(s=>s.slides).some(s=>s.notes.startsWith('FACILITATOR:')));
  assert(learnerProject(p).scenes.flatMap(s=>s.slides).every(s=>!Object.hasOwn(s,'notes')));
});
for(const mobile of [false,true])test(`learner DOM journey: ${mobile?'reading view on a phone':'slide and reading views'}`,async(t)=>{
  const html=await readFile(new URL('../../critical-thinking-paul-elder.html',import.meta.url),'utf8'),errors=[];
  const vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
  const dom=new JSDOM(html,{url:'https://www.mayneleadership.com/critical-thinking-paul-elder.html',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc,
    beforeParse(win){win.innerWidth=mobile?390:1360;win.HTMLDialogElement.prototype.showModal=function(){this.open=true;};win.HTMLDialogElement.prototype.close=function(){this.open=false;};}});
  const {window:w}=dom,doc=w.document,app=w.courseForVerification;t.after(()=>{app?.destroy();dom.window.close();});
  assert(app,errors.join('\n'));assert.equal(doc.querySelectorAll('.map details').length,8);assert.equal(doc.querySelectorAll('.slide-link').length,64);
  assert.equal(doc.querySelectorAll('[data-note]').length,38);assert.equal(doc.querySelectorAll('#reference-list a').length,6);
  if(!mobile)doc.getElementById('mode').click();assert.equal(doc.getElementById('reading').hidden,false);
  app.engine.goto(questions[0].slide);const answer=doc.querySelector('#reader [data-id="'+questions[0].correct+'"]');assert(answer);answer.click();
  assert.equal(doc.getElementById('reader-dialog').open,true);assert(doc.getElementById('reader-dialog').textContent.includes('Sound reasoning'));
  doc.querySelector('#reader-dialog button:not(.dismiss)').click();assert.equal(doc.getElementById('reader-dialog').open,false);
  doc.querySelector('[data-panel="workbook"]').click();const note=doc.getElementById('note-brief');note.value='A careful recommendation has evidence and a review trigger.';note.dispatchEvent(new w.Event('input',{bubbles:true}));
  assert(doc.getElementById('word-count').textContent.startsWith('9 words'));assert(w.localStorage.getItem('mayne-critical-thinking-workbook:'+p.id).includes('careful recommendation'));
  doc.querySelector('[data-panel="learn"]').click();confirmCapstone(app.engine);questions.forEach(q=>respond(app.engine,q));results(app.engine);
  assert.equal(doc.querySelector('#reader [data-id="'+metadata.finishObjectId+'"]').disabled,false);
  doc.querySelector('#reader [data-id="'+metadata.finishObjectId+'"]').click();assert.equal(doc.getElementById('reader-complete').hidden,false);
  w.dispatchEvent(new w.Event('pagehide'));assert(JSON.parse(w.localStorage.getItem('mayne-course-progress:'+p.id)).completed);
  assert.deepEqual(errors,[]);app.destroy();dom.window.close();
});
