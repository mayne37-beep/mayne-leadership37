import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import {readNarrationPack,NARRATION_PACK_FORMAT} from '../src/video-studio-narration-import.js';
import {CONFLICT_VIDEO_SCENES} from '../assets/video-studio-conflict.js';
import {pcmToWav} from '../assets/video-studio-free-core.js';

const scenes=CONFLICT_VIDEO_SCENES.map((s,i)=>({...s,id:'scenario-'+(i+1)}));
const audio=Buffer.from(pcmToWav([new Float32Array(12000).fill(.04)]));
async function makeZip({wrongTitle=false,omitOne=false}={}){
 const zip=new JSZip();
 const entries=scenes.map((s,i)=>({
   index:i+1,title:wrongTitle&&i===1?'Incorrect title':s.title,script:s.script,
   voice:s.localVoice||'af_heart',filename:String(i+1).padStart(2,'0')+'-scene.wav',
   durationSeconds:1.35,voiceSpeed:.94,voicePauseMs:450,voiceTailMs:550,voiceNormalize:true
 }));
 zip.file('manifest.json',JSON.stringify({format:NARRATION_PACK_FORMAT,version:1,scenes:omitOne?entries.slice(0,-1):entries}));
 for(const row of entries)zip.file(row.filename,audio);
 return new File([await zip.generateAsync({type:'uint8array'})],'complete-narration.zip',{type:'application/zip'});
}
test('accepts real complete 20-scene narration with voice settings and safe WAVs',async()=>{
 const imported=await readNarrationPack(await makeZip(),scenes);
 assert.equal(imported.length,20);
 assert.equal(imported[0].title,scenes[0].title);
 assert.equal(imported[0].file.type,'audio/wav');
 assert.equal(imported[0].settings.voicePauseMs,450);
 assert.equal(imported[0].settings.voiceTailMs,550);
 assert.ok(imported.some(x=>x.voice==='af_bella'));
 assert.ok(imported.some(x=>x.voice==='am_michael'));
});
test('refuses any mismatch or partial narration pack',async()=>{
 await assert.rejects(async()=>readNarrationPack(await makeZip({wrongTitle:true}),scenes),/has been edited/);
 await assert.rejects(async()=>readNarrationPack(await makeZip({omitOne:true}),scenes),/Pack has 19 scenes/);
 await assert.rejects(async()=>readNarrationPack(await makeZip(),scenes.slice(0,2)),/Pack has 20 scenes/);
});
