// Generate the full Managing Conflict audio from the same authored scenes and Voice Director
// mastering code used by Mayne Video Studio. This script runs locally or on a GitHub runner.
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {KokoroTTS} from 'kokoro-js';
import {CONFLICT_VIDEO_SCENES} from '../assets/video-studio-conflict.js';
import {LOCAL_MODEL,splitNarration,finishNarration,pcmToWav,normalizeSpeechOptions} from '../assets/video-studio-free-core.js';

const directory=resolve(process.argv[2]||'output/conflict-kokoro');
const sceneCount=CONFLICT_VIDEO_SCENES.length;
const desired=['af_bella','am_michael','af_heart','af_nova','am_fenrir'];
console.log('Loading '+LOCAL_MODEL+' on CPU; target '+sceneCount+' scenes.');
const tts=await KokoroTTS.from_pretrained(LOCAL_MODEL,{
  dtype:'q8',device:'cpu',
  progress_callback:p=>{
    if(p?.status==='progress'&&Number.isFinite(p.progress)&&Math.round(p.progress)%25===0)
      console.log('Model download '+Math.round(p.progress)+'%');
  }
});
const available=new Set(tts.list_voices?.()||[]);
console.log('Available voices:',[...available].slice(0,30));
await mkdir(directory,{recursive:true});
const manifest={format:'mayne-conflict-kokoro-narration',version:1,model:LOCAL_MODEL,modelDtype:'q8',
  generation:'GitHub-hosted CPU using same open Kokoro model and Voice Director mastering as browser',
  createdAt:new Date().toISOString(),scenes:[]};
for(let index=0;index<sceneCount;index++){
 const scene=CONFLICT_VIDEO_SCENES[index];
 const requested=scene.localVoice||'af_heart';
 const voice=available.size===0||available.has(requested)?requested:'af_heart';
 const options=normalizeSpeechOptions({
  voiceSpeed:/^Sofia \|/.test(scene.title)?1.03:/^Daniel \|/.test(scene.title)?.96:
    /^(Supervisor \||A workable agreement)/.test(scene.title)?.91:.96,
  voicePauseMs:/^(Sofia \||Daniel \|)/.test(scene.title)?300:400,
  voiceTailMs:500,voiceNormalize:true
 });
 const parts=splitNarration(scene.script);
 if(!parts.length)throw Error('No script at scene '+(index+1));
 const chunks=[];let rate=0;
 console.log('Rendering '+(index+1)+'/'+sceneCount+': '+scene.title+' ('+voice+', '+parts.length+' chunks)');
 for(const segment of parts){
  const audio=await tts.generate(segment,{voice,speed:options.voiceSpeed});
  const d=audio?.data||audio?.audio;
  const sr=audio?.sampling_rate||24000;
  if(!d||!d.length)throw Error('Empty Kokoro speech: '+scene.title);
  if(rate&&rate!==sr)throw Error('Inconsistent sample rates');
  rate=sr;
  chunks.push(d instanceof Float32Array?d:new Float32Array(d));
 }
 const processed=finishNarration(chunks,rate,options);
 const wav=Buffer.from(pcmToWav([processed.samples],rate));
 const filename=String(index+1).padStart(2,'0')+'-'+scene.title
   .toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,57)+'.wav';
 await writeFile(resolve(directory,filename),wav);
 manifest.scenes.push({index:index+1,title:scene.title,filename,voice,script:scene.script,
   durationSeconds:Number(processed.duration.toFixed(2)),bytes:wav.byteLength,...options});
 console.log('Completed '+filename+': '+processed.duration.toFixed(1)+' sec, '+(wav.byteLength/1048576).toFixed(2)+' MiB');
}
await writeFile(resolve(directory,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
await writeFile(resolve(directory,'README.txt'),
  'Mayne Leadership 101 — Managing Conflict\n'+
  '20 scenes narrated using the free Kokoro v1.0 ONNX speech model.\n'+
  'Each WAV matches the Studio conflict lesson scene order (01 through 20).\n'+
  'Voices: Sofia af_bella, Daniel am_michael, supervisor af_heart, and supporting narrators.\n'+
  'Output includes voice pacing, gentle gain matching, pauses and fades via Voice Director.\n'+
  'These are synthetic voices, not authentic recordings of people.\n'+
  'To use in the online Studio, upload the WAV matching each selected scene via Voice > Recorded narration.\n');
console.log('Successfully generated '+manifest.scenes.length+' scene WAVs to '+directory);
