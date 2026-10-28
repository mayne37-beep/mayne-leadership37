import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeMotionOptions,entranceState,visibleText,transitionState,easeOutCubic} from '../assets/video-studio-motion.js';
import {makeScene,normalizeScene,safeProjectExport,parseProjectImport,normalizeProject,localRenderManifest} from '../assets/video-studio-core.js';

test('scene effects reject invalid presets and constrain motion duration',()=>{
 assert.deepEqual(normalizeMotionOptions({titleMotion:'<script>',presenterMotion:'fake',transition:'bogus',motionDuration:99}),
 {titleMotion:'none',presenterMotion:'none',transition:'cut',motionDuration:2,motionDelay:0,subtitleDelay:.3});
 assert.equal(normalizeMotionOptions({motionDuration:-1}).motionDuration,.3);
 assert.equal(normalizeMotionOptions({motionDuration:'bad'}).motionDuration,.8);
 const fresh=makeScene();
 assert.equal(fresh.titleMotion,'rise');
 assert.equal(fresh.presenterMotion,'slide-right');
 assert.equal(fresh.transition,'dissolve');
 const legacy=normalizeScene({title:'Older static scene'});
 assert.equal(legacy.titleMotion,'none');
 assert.equal(legacy.presenterMotion,'none');
 assert.equal(legacy.transition,'cut');
});
test('motion is deterministic, clamped and visually different at timeline positions',()=>{
 assert.equal(entranceState('fade',0,1).opacity,0);
 assert.equal(entranceState('fade',1,1).opacity,1);
 assert.equal(entranceState('rise',0,1).y,52);
 assert.equal(entranceState('rise',1,1).y,0);
 assert.equal(entranceState('slide-right',0,1).x,-85);
 assert.ok(entranceState('zoom',.5,1).scale>.89);
 assert.equal(visibleText('Leadership','typewriter',0,1),'');
 assert.equal(visibleText('Leadership','typewriter',1,1),'Leadership');
 assert.equal(visibleText('Leadership','fade',0,1),'Leadership');
 assert.equal(transitionState({transition:'wipe',motionDuration:.8},0).progress,0);
 assert.equal(transitionState({transition:'wipe',motionDuration:.8},.8).progress,1);
 assert.equal(transitionState({transition:'cut',motionDuration:.8},0).progress,1);
 assert.ok(easeOutCubic(.5)>.5);
});
test('motion metadata survives save import/export and future render jobs',()=>{
 const scene=makeScene({title:'Motion test',titleMotion:'typewriter',presenterMotion:'zoom',transition:'wipe',motionDuration:1.2});
 const project=normalizeProject({name:'Animation',scenes:[scene]});
 const exported=safeProjectExport(project);
 const imported=parseProjectImport(exported);
 assert.equal(imported.scenes[0].titleMotion,'typewriter');
 assert.equal(imported.scenes[0].presenterMotion,'zoom');
 assert.equal(imported.scenes[0].transition,'wipe');
 assert.equal(imported.scenes[0].motionDuration,1.2);
 const job=localRenderManifest(project);
 assert.equal(job.project.scenes[0].transition,'wipe');
 assert.equal(job.project.scenes[0].titleMotion,'typewriter');
});

test('word and bullet reveals are deterministic and timing survives project backup',()=>{
 assert.equal(visibleText('One two three','word-by-word',0,1),'');
 assert.equal(visibleText('One two three','word-by-word',1,1),'One two three');
 assert.equal(visibleText('First\nSecond','bullet-build',1,1),'• First\n• Second');
 const project=normalizeProject({scenes:[makeScene({titleMotion:'word-by-word',motionDelay:2.5,subtitleDelay:1.4})]});
 const restored=parseProjectImport(safeProjectExport(project));
 assert.equal(restored.scenes[0].motionDelay,2.5);
 assert.equal(restored.scenes[0].subtitleDelay,1.4);
});

test('light scenes preserve framing and reaction sequences across JSON roundtrips',()=>{
 const scene=makeScene({visualStyle:'light',characterFraming:'torso',photoAssetId:'mayne-character-sofia-professional',
  characterReactionSequence:['concerned','explaining','friendly']});
 const restored=parseProjectImport(safeProjectExport(normalizeProject({scenes:[scene]}))).scenes[0];
 assert.equal(restored.visualStyle,'light');
 assert.equal(restored.characterFraming,'torso');
 assert.deepEqual(restored.characterReactionSequence,['concerned','explaining','friendly']);
 const legacy=normalizeScene({photoAssetId:'custom-portrait'});
 assert.equal(legacy.visualStyle,'standard');
 assert.equal(legacy.characterFraming,'full');
 assert.deepEqual(legacy.characterReactionSequence,[]);
 const hostile=normalizeScene({visualStyle:'<script>',characterFraming:'teleport',
  characterReactionSequence:['javascript:alert(1)','friendly','unknown','explaining']});
 assert.equal(hostile.visualStyle,'standard');
 assert.equal(hostile.characterFraming,'full');
 assert.deepEqual(hostile.characterReactionSequence,['','friendly','']);
});
