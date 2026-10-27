import test from 'node:test';
import assert from 'node:assert/strict';
import {demoProject,makeScene,normalizeScene,normalizeProject,newProject,totalSeconds,clock,
  MAX_SCENES,safeProjectExport,parseProjectImport,localRenderManifest,PALETTES} from '../assets/video-studio-core.js';

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

test('moving-video scene attributes are bounded and survive model normalization',()=>{
 const p=normalizeProject({scenes:[{title:'Video scene',duration:6,videoAssetId:'local-video-id',
   videoMode:'full',videoFit:'contain',videoMuted:true,videoTrimStart:4.5}]});
 assert.equal(p.scenes[0].videoMode,'full');
 assert.equal(p.scenes[0].videoFit,'contain');
 assert.equal(p.scenes[0].videoMuted,true);
 assert.equal(p.scenes[0].videoTrimStart,4.5);
 assert.equal(p.scenes[0].videoAssetId,'local-video-id');
 const exported=safeProjectExport(p);
 assert.equal(exported.project.scenes[0].videoAssetId,'','export contains no missing browser blob IDs');
 assert.equal(parseProjectImport(exported).scenes[0].videoAssetId,'');
 const bad=normalizeScene({videoMode:'strange',videoFit:'broken',videoMuted:'true',videoTrimStart:-8});
 assert.equal(bad.videoMode,'presenter');assert.equal(bad.videoFit,'cover');
 assert.equal(bad.videoMuted,false);assert.equal(bad.videoTrimStart,0);
});


test('local GPU manifest retains scripts, design and voice while omitting device-only IDs',()=>{
 const p=demoProject();p.scenes[0].localVoice='bm_george';
 p.scenes[0].audioAssetId='device-audio-123';p.scenes[0].photoAssetId='device-photo-456';
 const job=localRenderManifest(p);
 assert.equal(job.version,1);assert.equal(job.format,'mayne-local-video-job');
 assert.equal(job.project.scenes[0].voice,'bm_george');
 assert.equal(job.project.scenes[0].needsMedia.audio,true);
 assert.equal(job.project.scenes[0].needsMedia.photo,true);
 assert.ok(!JSON.stringify(job).includes('device-audio-123'));
 assert.ok(!JSON.stringify(job).includes('device-photo-456'));
});


test('Leadership 101 background assets are known and imported project URLs are validated',async()=>{
 const {LEADERSHIP_BACKGROUNDS,validatedBackground,normalizeCharacters,mergeCharacters}=await import('../assets/video-studio-library-core.js');
 assert.equal(LEADERSHIP_BACKGROUNDS.length,12);
 assert.equal(validatedBackground('https://evil.example.com/fake.png'),'');
 const bg=LEADERSHIP_BACKGROUNDS[0].url;
 const selected=normalizeScene({backgroundImage:bg});
 assert.equal(selected.backgroundImage,bg);
 assert.equal(normalizeScene({backgroundImage:'javascript:alert(1)'}).backgroundImage,'');
 assert.equal(safeProjectExport(normalizeProject({scenes:[selected]})).project.scenes[0].backgroundImage,bg);
 const people=normalizeCharacters([{id:'amara',name:'Amara',variants:{professional:{assetId:'abcdefghij1234',name:'asset'}}}]);
 const additions=normalizeCharacters([{id:'amara',name:'Amara',variants:{casual:{assetId:'abcdefghij5678',name:'asset2'}}}]);
 const merged=mergeCharacters(people,additions);
 assert.equal(merged.length,1);
 assert.equal(Object.keys(merged[0].variants).length,2);
});
