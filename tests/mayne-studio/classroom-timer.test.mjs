import test from 'node:test';
import assert from 'node:assert/strict';
import { makeProject, makeScene, makeSource, makeLayer, normalizeProject } from '../../src/mayne-studio/model.js';
import { liveTimerLayout, liveTimerFallback } from '../../src/mayne-studio/render.js';
import {
  timerParts, timerText, parseTimerFields, newTimer, tickTimer, pauseTimer, startTimer,
  resetTimer, adjustTimer, MAX_TIMER_SECONDS,
} from '../../src/mayne-studio/timer.js';

test('countdown time can be typed as hours, minutes and seconds',()=>{
  assert.deepEqual(timerParts(3661),{h:'01',m:'01',s:'01'});
  assert.deepEqual(timerParts(90),{h:'00',m:'01',s:'30'});
  assert.equal(timerText(3661,true),'01:01:01');
  assert.equal(timerText(90),'01:30');
  assert.equal(parseTimerFields('01','23','45'),5025);
  assert.equal(parseTimerFields('23','59','59'),MAX_TIMER_SECONDS);
  for(const fields of [['24','0','0'],['00','60','0'],['00','00','60'],['0','0','0'],['','02','00'],['-1','1','0']])
    assert.equal(parseTimerFields(...fields),null,'Invalid duration: '+fields);
});

test('the same monotonic clock continues through scene switching, pause, adjustments and reset',()=>{
  const timer=newTimer(300);
  assert.equal(startTimer(timer,1000,300),true);
  assert.equal(timer.deadline,301000);
  assert.equal(timer.visible,true);
  assert.equal(tickTimer(timer,31000),false);
  assert.equal(Math.round(timer.remaining),270);
  assert.equal(adjustTimer(timer,60,31000),330);
  assert.equal(timer.deadline,361000);
  assert.equal(pauseTimer(timer,61000),true);
  assert.equal(timer.deadline,0);
  assert.equal(timer.remaining,300);
  assert.equal(startTimer(timer,97000,300),true);
  assert.equal(timer.deadline,397000);
  assert.equal(tickTimer(timer,397500,'stop'),true);
  assert.equal(timer.remaining,0);
  assert.equal(timer.deadline,0);
  assert.equal(timer.finished,true);
  assert.equal(tickTimer(timer,397600,'stop'),false,'Do not repeat finish chime');
  resetTimer(timer,180);
  assert.equal(timer.remaining,180);
  assert.equal(timer.finished,false);
  assert.equal(startTimer(timer,400000,180),true);
  assert.equal(timer.deadline,580000);
});

test('counting overtime reports completion once and stays live when switching scenes',()=>{
  const timer=newTimer(10);
  startTimer(timer,1000,10);
  assert.equal(tickTimer(timer,11001,'overtime'),true);
  assert.equal(tickTimer(timer,13001,'overtime'),false);
  assert.ok(timer.remaining < -2);
  assert.ok(timer.deadline > 0);
  pauseTimer(timer,12001);
  assert.ok(timer.remaining < 0);
  // Instructor can add time while in overtime and resume countdown.
  adjustTimer(timer,30,12001);
  assert.ok(timer.remaining>0);
  assert.equal(timer.finished,false);
});

test('timer style/appearance and per-scene source assignments survive saved project normalization',()=>{
  const project=makeProject();
  const full=makeScene('blank','Break');
  const studio=makeScene('blank','Studio');
  const noTimer=makeScene('blank','Camera only');
  const timerSource=makeSource('timer','Class timer');
  project.sources.push(timerSource);
  project.scenes.push(full,studio,noTimer);
  const fullLayer=makeLayer(timerSource.id);
  Object.assign(fullLayer,{x:0,y:0,w:100,h:100,timerStyle:'fullscreen'});
  const inset=makeLayer(timerSource.id);
  Object.assign(inset,{x:74,y:7,w:22,h:19,timerStyle:'ring'});
  full.layers.push(fullLayer);studio.layers.push(inset);
  project.timerSeconds=3661;project.timerStyle='ring';project.timerColor='#123abc';
  project.timerBackground='glass';project.timerOpacity=65;
  project.timerEnd='overtime';project.timerChime=true;project.timerFlash=true;
  project.timerPresets=[{name:'Discussion',seconds:420}];
  const restored=normalizeProject(project);
  assert.equal(restored.timerSeconds,3661);
  assert.equal(restored.timerEnd,'overtime');
  assert.equal(restored.timerChime,true);
  assert.equal(restored.timerFlash,true);
  assert.equal(restored.timerColor,'#123abc');
  assert.equal(restored.timerOpacity,65);
  assert.deepEqual(restored.timerPresets,[{name:'Discussion',seconds:420}]);
  assert.deepEqual(restored.scenes.map(s=>s.layers.map(l=>l.timerStyle)),
    [['fullscreen'],['ring'],[]],
    'Studio style is independent and camera-only scene is never auto-assigned a timer');
  assert.equal(project.sources.filter(s=>s.type==='timer').length,1);
});

test('only the current live Program determines optional placement; global fallback requires no scene input',()=>{
  const project=makeProject();
  const studio=makeScene('blank','Studio');
  const breakScene=makeScene('blank','Break');
  project.scenes.push(studio,breakScene);
  const noLayout={scene:studio,sources:new Map(),scenes:new Map([[studio.id,studio],[breakScene.id,breakScene]])};
  assert.equal(liveTimerLayout(noLayout),null);
  assert.deepEqual(liveTimerFallback({timerStyle:'digital'}),
    {x:75,y:7,w:22,h:19,timerStyle:'digital'});
  assert.deepEqual(liveTimerFallback({timerStyle:'fullscreen'}),
    {x:0,y:0,w:100,h:100,timerStyle:'fullscreen'});
  const timer=makeSource('timer','Countdown');
  project.sources.push(timer);
  const layer=makeLayer(timer.id);
  Object.assign(layer,{x:60,y:9,w:24,h:17,timerStyle:'ring'});
  studio.layers.push(layer);
  const shot={
    scene:studio,
    sources:new Map(project.sources.map(source=>[source.id,source])),
    scenes:new Map(project.scenes.map(scene=>[scene.id,scene]))
  };
  assert.deepEqual(
    Object.fromEntries(['x','y','w','h','timerStyle'].map(key=>[key,liveTimerLayout(shot)[key]])),
    {x:60,y:9,w:24,h:17,timerStyle:'ring'});
  assert.equal(liveTimerLayout({...shot,scene:breakScene}),null,
    'Live timer placement never leaks to an unrelated scene');
});

test('nested reusable scene timer placement is projected into on-air coordinates only',()=>{
  const project=makeProject();
  const child=makeScene('blank','Child');
  const parent=makeScene('blank','Parent');
  project.scenes.push(child,parent);
  const timer=makeSource('timer','Countdown');
  const nested=makeSource('scene','Child',{sceneId:child.id});
  project.sources.push(timer,nested);
  const timerLayer=makeLayer(timer.id);
  Object.assign(timerLayer,{x:20,y:10,w:40,h:20,timerStyle:'bar'});
  child.layers.push(timerLayer);
  const nestedLayer=makeLayer(nested.id);
  Object.assign(nestedLayer,{x:10,y:20,w:50,h:50,fit:'stretch'});
  parent.layers.push(nestedLayer);
  const shot={scene:parent,
    scenes:new Map(project.scenes.map(s=>[s.id,s])),
    sources:new Map(project.sources.map(s=>[s.id,s]))};
  const position=liveTimerLayout(shot);
  assert.equal(position.timerStyle,'bar');
  assert.ok(Math.abs(position.x-20)<.001);
  assert.ok(Math.abs(position.y-25)<.001);
  assert.ok(Math.abs(position.w-20)<.001);
  assert.ok(Math.abs(position.h-10)<.001);
});
