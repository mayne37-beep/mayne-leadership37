import test from 'node:test';
import assert from 'node:assert/strict';
import {scriptChunks,storyboardFromText,starterProject,STARTER_MODES,STARTER_TEMPLATES} from '../assets/video-studio-starters.js';

test('script-to-scenes keeps authored content and creates individually editable scenes',()=>{
 const input='Leaders explain expectations clearly. Team members ask questions. Supervisors provide feedback. Everyone follows through.';
 const project=storyboardFromText(input,{mode:'lesson'});
 assert.equal(project.scenes.length,4);
 assert.equal(project.name.startsWith('Leadership lesson'),true);
 assert.equal(project.scenes.map(s=>s.script).join(' '),input);
 assert.ok(project.scenes.every(s=>s.duration>=5&&s.duration<=120));
 assert.equal(project.scenes[0].layout,'presenter-right');
 assert.equal(project.scenes[1].layout,'split');
});
test('paragraph split respects the original authored material',()=>{
 const parts=scriptChunks('Welcome to the program.\n\nWe will discuss coaching.\n\nPlease try the exercise.');
 assert.deepEqual(parts,['Welcome to the program.','We will discuss coaching.','Please try the exercise.']);
 assert.throws(()=>scriptChunks(''),/Add a script/);
 assert.throws(()=>scriptChunks('A'.repeat(10001)),/10,000/);
});
test('long scripts remain bounded and do not discard final sentences',()=>{
 const content=Array.from({length:35},(_,i)=>'Sentence '+(i+1)+' describes a leadership behavior.').join(' ');
 const p=storyboardFromText(content,{mode:'video'});
 assert.ok(p.scenes.length<=8);
 assert.match(p.scenes[p.scenes.length-1].script,/Sentence 35/);
});
test('quick starts all include real editable projects without subscriptions',()=>{
 assert.equal(STARTER_MODES.length,4);
 for(const template of STARTER_TEMPLATES){
  const project=starterProject(template.id);
  assert.equal(typeof project.name,'string');
  assert.ok(project.scenes.length>=1);
  assert.ok(project.scenes.every(s=>s.title&&s.duration>=3));
 }
 assert.equal(starterProject('coaching').scenes.length,4);
 assert.equal(starterProject('training').scenes.length,4);
 assert.equal(starterProject('conflict').scenes.length,20);
 assert.ok(starterProject('conflict').scenes.some(s=>s.script.includes('Thomas Kilmann')));
 const conflict=starterProject('conflict');
 assert.equal(conflict.scenes.filter(s=>s.title.startsWith('Sofia |')).length,3);
 assert.equal(conflict.scenes.filter(s=>s.title.startsWith('Daniel |')).length,3);
 assert.ok(conflict.scenes.filter(s=>s.title.startsWith('Sofia |')).every(s=>s.localVoice==='af_bella'));
 assert.ok(conflict.scenes.filter(s=>s.title.startsWith('Daniel |')).every(s=>s.localVoice==='am_michael'));
 assert.ok(conflict.scenes.find(s=>s.title.includes('workable agreement')));
 assert.equal(starterProject('leadership').scenes.length,4);
 assert.equal(starterProject('blank').scenes[0].script,'');
 assert.throws(()=>starterProject('unknown'),/Unknown/);
});

test('Managing Conflict starter applies editable motion to all twenty scenes without altering scripts',()=>{
 const c=starterProject('conflict');
 assert.equal(c.scenes.length,20);
 assert.match(c.name,/Animated Motion Edition/);
 assert.ok(c.scenes.some(s=>s.titleMotion==='word-by-word'));
 assert.ok(c.scenes.some(s=>s.titleMotion==='bullet-build'));
 assert.ok(c.scenes.every(s=>s.motionDuration>=.3&&s.motionDuration<=2));
 assert.ok(c.scenes.every(s=>s.subtitleDelay>=0&&s.motionDelay>=0));
 assert.equal(new Set(c.scenes.map(s=>s.transition)).size,4);
 assert.equal(c.scenes[3].duration,11);
 assert.equal(c.scenes[9].duration,32);
 assert.match(c.scenes[9].subtitle,/Collaborate/);
 assert.match(c.scenes[9].script,/Thomas Kilmann/);
 assert.ok(c.scenes.filter(s=>s.title.startsWith('Sofia |')).every(s=>s.localVoice==='af_bella'));
});
