import test from 'node:test';
import assert from 'node:assert/strict';
import {demoProject,makeScene,normalizeScene,normalizeProject,newProject,totalSeconds,clock,
  MAX_SCENES,safeProjectExport,parseProjectImport,PALETTES} from '../assets/video-studio-core.js';

test('demo launches with Task vs. Relationship and four playable scenes',()=>{
 const p=demoProject();assert.match(p.name,/Task vs\. Relationship/);
 assert.equal(p.scenes.length,4);assert.ok(p.scenes.every(s=>s.script && s.duration>=3));
 assert.equal(totalSeconds(p),39);assert.equal(clock(totalSeconds(p)),'0:39');
});
test('scene validation bounds timing, text length and layouts',()=>{
 const a=normalizeScene({duration:999,layout:'<iframe>',theme:'unsafe',title:'x'.repeat(300),presenter:'stranger'});
 assert.equal(a.duration,120);assert.equal(a.layout,'presenter-right');assert.equal(a.theme,'navy');
 assert.equal(a.title.length,115);assert.equal(a.presenter,'Alex');
 const b=normalizeScene({duration:-200,script:42});assert.equal(b.duration,3);assert.equal(b.script,'');
 assert.ok(PALETTES.navy.bg.startsWith('#'));
});
test('projects always have a scene and reject oversized scene counts',()=>{
 const empty=normalizeProject({scenes:[]});assert.equal(empty.scenes.length,1);
 const over=normalizeProject({scenes:Array.from({length:70},()=>makeScene())});
 assert.equal(over.scenes.length,MAX_SCENES);
 const fresh=newProject('Test');assert.equal(fresh.name,'Test');
});
test('duplicate scene IDs are regenerated on imported input',()=>{
 const item=makeScene({id:'duplicate'});
 const p=normalizeProject({scenes:[item,{...item}]});
 assert.notEqual(p.scenes[0].id,p.scenes[1].id);
});
test('JSON export has no local audio references and imported copy gets new IDs',()=>{
 const p=demoProject();p.scenes[0].audioAssetId='local-audio-id';
 const payload=safeProjectExport(p);
 assert.equal(payload.format,'mayne-video-project');assert.equal(payload.version,1);
 assert.ok(payload.project.scenes.every(s=>!s.audioAssetId));
 const imported=parseProjectImport(payload);
 assert.notEqual(imported.id,p.id);assert.equal(imported.scenes.length,p.scenes.length);
 assert.throws(()=>parseProjectImport({format:'bad'}),/supported/);
});
