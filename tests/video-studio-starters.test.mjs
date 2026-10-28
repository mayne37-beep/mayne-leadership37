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
test('paragraph split respects author's original material',()=>{
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
 assert.equal(starterProject('leadership').scenes.length,4);
 assert.equal(starterProject('blank').scenes[0].script,'');
 assert.throws(()=>starterProject('unknown'),/Unknown/);
});
