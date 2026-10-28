// Secure offline import for completed Kokoro narration packs.
// All media remains on the user's device in the existing IndexedDB store.
import JSZip from 'jszip';
import {validLocalVoice,normalizeSpeechOptions} from '../assets/video-studio-free-core.js';
export const NARRATION_PACK_FORMAT='mayne-conflict-kokoro-narration';
export async function readNarrationPack(file,scenes){
 if(!file||file.size===0||file.size>115*1024*1024)throw Error('Narration ZIP must be smaller than 115 MB.');
 if(!Array.isArray(scenes)||scenes.length<1||scenes.length>40)throw Error('Open a valid video project first.');
 const zip=await JSZip.loadAsync(file,{checkCRC32:true});
 const files=Object.values(zip.files);
 if(files.length>55)throw Error('Narration ZIP has too many files.');
 const item=zip.file('manifest.json');if(!item)throw Error('Narration ZIP is missing manifest.json.');
 const manifest=JSON.parse(await item.async('string'));
 if(manifest?.format!==NARRATION_PACK_FORMAT||manifest.version!==1||!Array.isArray(manifest.scenes))
   throw Error('This is not a compatible Kokoro narration pack.');
 if(manifest.scenes.length!==scenes.length)
   throw Error('Pack has '+manifest.scenes.length+' scenes, but this project has '+scenes.length+'. Open the matching Managing Conflict project.');
 const imports=[],seen=new Set();
 let total=0;
 for(const row of manifest.scenes){
  if(!Number.isInteger(row.index)||row.index<1||row.index>scenes.length||seen.has(row.index))
   throw Error('Invalid scene number in narration pack.');
  seen.add(row.index);
  const scene=scenes[row.index-1];
  if(scene.title!==row.title||scene.script.replace(/\s+/g,' ').trim()!==String(row.script||'').replace(/\s+/g,' ').trim())
   throw Error('Scene '+row.index+' has been edited. Import narration into the original matching conflict starter.');
  if(!validLocalVoice(row.voice))throw Error('Unsupported voice for scene '+row.index);
  if(typeof row.filename!=='string'||!/^([0-9]{2}-)?[a-z0-9-]{1,65}\.wav$/.test(row.filename))
   throw Error('Unexpected file name at scene '+row.index);
  const entry=zip.file(row.filename);
  if(!entry||entry.dir)throw Error('Missing narration for scene '+row.index);
  const expected=entry._data?.uncompressedSize||0;
  if(expected>25*1024*1024)throw Error('One narration exceeds 25 MB.');
  const bytes=await entry.async('uint8array');
  total+=bytes.length;
  if(bytes.length<46||bytes.length>25*1024*1024||total>110*1024*1024)
   throw Error('Narration tracks exceed the safe size limit.');
  const tag=(at)=>String.fromCharCode(...bytes.slice(at,at+4));
  if(tag(0)!=='RIFF'||tag(8)!=='WAVE')throw Error('Scene '+row.index+' is not a valid WAV file.');
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  const sampleRate=view.getUint32(24,true);
  if(sampleRate<8000||sampleRate>96000)throw Error('Invalid WAV sample rate.');
  const seconds=Number(row.durationSeconds);
  if(!Number.isFinite(seconds)||seconds<=0||seconds>120)throw Error('Invalid scene narration length.');
  const speakerSettings=normalizeSpeechOptions(row);
  imports.push({index:row.index-1,sceneId:scene.id,title:scene.title,
    file:new File([bytes],row.filename,{type:'audio/wav'}),voice:row.voice,
    durationSeconds:seconds,settings:speakerSettings});
 }
 return imports.sort((a,b)=>a.index-b.index);
}
