import assert from 'node:assert/strict';
import test from 'node:test';
import { SCENE_LIMIT, DEFAULT_SCENE_GROUP, sceneGroup, makeProject, makeScene,
  makeSource, makeLayer, normalizeProject } from '../../src/mayne-studio/model.js';
import { shortcutAction } from '../../src/mayne-studio/shortcuts.js';

test('scene normalization preserves 100 custom-group scenes in saved project backups',()=>{
  assert.equal(SCENE_LIMIT,100);
  const project=makeProject('Large classroom');
  const powerPoint=makeSource('powerpoint','Lesson slides',{asset:'slides-abc'});
  const camera=makeSource('camera','Instructor camera',{device:'demo'});
  project.sources.push(powerPoint,camera);
  project.scenes=Array.from({length:102},(_,i)=>{
    const scene=makeScene('blank','Session '+(i+1));
    scene.id='session-'+i;
    scene.group=i%2?'Leadership 101':'Workshop';
    scene.background=i%2?'navy':'black';
    if(i===99)scene.layers.push({...makeLayer(powerPoint.id),page:42,x:17,w:62});
    return scene;
  });
  const copy=normalizeProject(JSON.parse(JSON.stringify(project)));
  assert.equal(copy.scenes.length,100);
  assert.equal(copy.scenes[99].name,'Session 100');
  assert.equal(copy.scenes[99].group,'Leadership 101');
  assert.equal(copy.scenes[99].layers[0].source,powerPoint.id);
  assert.equal(copy.scenes[99].layers[0].page,42);
  assert.deepEqual(copy.scenes.map(x=>x.id),project.scenes.slice(0,100).map(x=>x.id));
  const again=normalizeProject(JSON.parse(JSON.stringify(copy)));
  assert.equal(again.scenes.length,100);
  assert.deepEqual(again.scenes,copy.scenes);
});

test('scene group names are customizable, sanitized and legacy compatible',()=>{
  assert.equal(DEFAULT_SCENE_GROUP,'General');
  assert.equal(makeScene('blank','Old classroom').group,'General');
  assert.equal(sceneGroup(null),'General');
  assert.equal(sceneGroup('  '),'General');
  assert.equal(sceneGroup('  Leadership 101  '),'Leadership 101');
  assert.equal(sceneGroup('L'.repeat(80)).length,40);
  const project=makeProject();
  const scene=makeScene('blank','Legacy room');
  delete scene.group;
  project.scenes.push(scene);
  assert.equal(normalizeProject(project).scenes[0].group,'General');
  scene.group='<img src=x onerror=alert(1)>';
  assert.equal(normalizeProject(project).scenes[0].group,scene.group);
});

test('user shortcuts can cue named scenes beyond the previous 40-scene limit',()=>{
  const project=makeProject();
  project.scenes=Array.from({length:100},(_,i)=>{
    const scene=makeScene('blank','Scene '+i);
    scene.id='scene-'+i;
    return scene;
  });
  project.extraShortcuts=[{id:'extra-100',action:'scene:scene-99',key:'Ctrl+Shift+KeyY'}];
  const saved=normalizeProject(project);
  assert.equal(shortcutAction(saved.shortcuts,'Ctrl+Shift+KeyY',saved.extraShortcuts),
    'scene:scene-99');
  assert.equal(saved.extraShortcuts.length,1);
});
