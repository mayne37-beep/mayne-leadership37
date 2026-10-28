// User-triggered, browser-only Kokoro narration for the *entire* storyboard.
// Sequential worker requests avoid running multiple speech models simultaneously.
import {splitNarration,validLocalVoice} from './video-studio-free-core.js';
const $=id=>document.getElementById(id);
export function wireProjectNarration({getProject,getSelectedScene,putAudio,makeId,persist,renderScenes,refreshAudioInfo,status,busy,setBusy}){
 let worker=null,queue=[],done=0,total=0,stopped=false;
 const note=message=>{$('free-model-progress').textContent=message;};
 const controls=active=>{
  $('free-generate-project').disabled=active;
  $('free-cancel').hidden=!active;
  $('free-cancel').disabled=!active;
  $('free-generate').disabled=active;
 };
 function finish(){
  queue=[];stopped=false;
  worker?.terminate();worker=null;
  controls(false);setBusy(false);
 }
 const next=()=>{
  if(stopped)return;
  if(!queue.length){
   const n=done;finish();
   const text='Free Kokoro narration saved for '+n+' scene'+(n===1?'':'s')+'. Preview, then export the video.';
   note(text);status(text,'success');return;
  }
  const job=queue.shift();
  const label='Scene '+(done+1)+' of '+total+' — '+job.title;
  note(label+' · Generating voice '+job.voice+' on this device…');
  status(label+' · Kokoro generation in progress');
  worker.postMessage({action:'generate',voice:job.voice,text:job.script});
  worker.currentJob=job;
 };
 $('free-generate-project').addEventListener('click',()=>{
  if(busy())return status('Finish narration, recording, or video export first.','error');
  const project=getProject();if(!project)return;
  try{
   const jobs=project.scenes.map(s=>({
    sceneId:s.id,title:s.title,voice:s.localVoice,script:s.script
   }));
   for(const job of jobs){
    if(!validLocalVoice(job.voice))throw Error('Unsupported voice on '+job.title);
    if(!splitNarration(job.script).length)throw Error('Missing narration on '+job.title);
   }
   worker=new Worker('/assets/video-studio-free-worker.js',{type:'module'});
   queue=jobs;done=0;total=jobs.length;stopped=false;setBusy(true);controls(true);
   worker.onmessage=async event=>{
    const data=event.data||{};
    if(data.type==='progress'||data.type==='ready'){
     note('Scene '+(done+1)+'/'+total+': '+(data.message||'Working…'));return;
    }
    if(data.type==='failure'){
     const n=done;finish();
     note('Kokoro stopped after '+n+' scenes: '+(data.message||'Model error'));
     status('AI narration could not complete. Saved scenes remain available.','error');
     return;
    }
    if(data.type!=='result'||!worker?.currentJob||stopped)return;
    const job=worker.currentJob;
    try{
     const blob=new Blob([data.buffer],{type:'audio/wav'});
     if(blob.size===0||blob.size>25*1024*1024)throw Error('Generated voice exceeds local narration size limits.');
     const title=job.title.replace(/[^a-z0-9]+/gi,'-').slice(0,40);
     const mediaId=makeId();
     await putAudio(mediaId,new File([blob],'kokoro-'+title+'-'+job.voice+'.wav',{type:'audio/wav'}));
     const scene=project.scenes.find(s=>s.id===job.sceneId);
     if(!scene)throw Error('A scene was deleted during narration.');
     scene.audioAssetId=mediaId;
     const seconds=Math.ceil(Number(data.duration)||0);
     if(seconds>=3&&seconds<=120&&!scene.videoAssetId)scene.duration=seconds;
     project.updatedAt=new Date().toISOString();
     persist();renderScenes();
     if(getSelectedScene()?.id===job.sceneId){
       $('scene-duration').value=scene.duration;
       void refreshAudioInfo();
     }
     done++;next();
    }catch(err){
     const n=done;finish();
     note('Could not store scene audio after '+n+' completed scenes: '+err.message);
     status('Narration storage failed. Previously completed scenes are preserved.','error');
    }
   };
   worker.onerror=error=>{
    finish();
    note('Kokoro model unavailable: '+(error?.message||'Worker error'));
    status('Use a supported browser and ensure the Kokoro model can download.','error');
   };
   next();
  }catch(err){finish();note(err.message);status('Cannot generate full lesson: '+err.message,'error');}
 });
 $('free-cancel').addEventListener('click',()=>{
  if(!worker)return;
  stopped=true;const n=done;finish();
  note('Stopped. Narration for '+n+' completed scene'+(n===1?'':'s')+' remains saved.');
  status('Narration generation stopped.','success');
 });
}
