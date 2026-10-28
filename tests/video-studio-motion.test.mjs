import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeMotionOptions,entranceState,visibleText,transitionState,easeOutCubic} from '../assets/video-studio-motion.js';
import {makeScene,normalizeScene,safeProjectExport,parseProjectImport,normalizeProject,localRenderManifest} from '../assets/video-studio-core.js';

test('scene effects reject invalid presets and constrain motion duration',()=>{
 assert.deepEqual(normalizeMotionOptions({titleMotion:'<script>',presenterMotion:'fake',transition:'bogus',motionDuration:99}),
 {titleMotion:'none',presenterMotion:'none',transition:'cut',motionDuration:2});
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
