// Pure project model shared by the browser editor and Node tests.
import {validatedBackground,builtinPhoto} from './video-studio-library-core.js';
import {DEFAULT_SPEECH,normalizeSpeechOptions} from './video-studio-free-core.js';
export const STORAGE_KEY = 'mayne-video-studio-projects-v1';
export const MAX_SCENES = 40;
export const LAYOUTS = ['presenter-right','presenter-left','title','split','text-only'];
export const THEMES = ['navy','blue','sunset','forest','slate'];
export const PALETTES = Object.freeze({
  navy: { bg:'#09182f', bg2:'#183a62', ink:'#ffffff', soft:'#d5e6f6', accent:'#e6ae4b' },
  blue: { bg:'#08365a', bg2:'#17739a', ink:'#ffffff', soft:'#e5f9ff', accent:'#ffcf70' },
  sunset: { bg:'#492e57', bg2:'#9a5367', ink:'#ffffff', soft:'#ffe9dd', accent:'#ffd08c' },
  forest: { bg:'#113c3b', bg2:'#24796c', ink:'#ffffff', soft:'#def6ec', accent:'#f7c879' },
  slate: { bg:'#242d42', bg2:'#59677c', ink:'#ffffff', soft:'#eef2fa', accent:'#90d5e5' }
});
export function makeId(){
  if(globalThis.crypto && typeof globalThis.crypto.randomUUID==='function') return globalThis.crypto.randomUUID();
  return 'id-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
}
function txt(v,max=500){ return String(typeof v==='string'?v:'').slice(0,max).trim(); }
export function makeScene(overrides={}){
  const s={
    id:makeId(),title:'New Scene',subtitle:'Add the idea learners should remember.',
    script:'Write the narration for this scene.',duration:10,layout:'presenter-right',
    theme:'navy',presenter:'Alex',audioAssetId:'',photoAssetId:'',backgroundImage:'',videoAssetId:'',videoMode:'presenter',videoFit:'cover',videoMuted:false,videoTrimStart:0,localVoice:'af_heart',...DEFAULT_SPEECH,...overrides
  };
  return normalizeScene(s);
}
export function normalizeScene(raw={}){
  const s=raw&&typeof raw==='object'?raw:{};
  return {
    id:txt(s.id,100)||makeId(),
    title:txt(s.title,115)||'Untitled Scene',
    subtitle:txt(s.subtitle,320),
    script:txt(s.script,6000),
    duration:Math.max(3,Math.min(120,Math.round(Number(s.duration)||10))),
    layout:LAYOUTS.includes(s.layout)?s.layout:'presenter-right',
    theme:THEMES.includes(s.theme)?s.theme:'navy',
    presenter:['Alex','Jordan','None'].includes(s.presenter)?s.presenter:'Alex',
    audioAssetId:txt(s.audioAssetId,100),
    photoAssetId:txt(s.photoAssetId,100),
    backgroundImage:validatedBackground(s.backgroundImage),
    videoAssetId:txt(s.videoAssetId,100),
    videoMode:s.videoMode==='full'?'full':'presenter',
    videoFit:s.videoFit==='contain'?'contain':'cover',
    videoMuted:s.videoMuted===true,
    localVoice:/^(?:af|am|bf|bm)_[a-z]+$/.test(s.localVoice||'')?s.localVoice:'af_heart',
    videoTrimStart:Math.max(0,Math.min(120,Number(s.videoTrimStart)||0)),
    ...normalizeSpeechOptions(s)
  };
}
export function normalizeProject(raw={}){
  const p=raw&&typeof raw==='object'?raw:{};
  const scenes=Array.isArray(p.scenes)?p.scenes.slice(0,MAX_SCENES).map(normalizeScene):[];
  // Imported data cannot cause scene ID collisions.
  const ids=new Set();
  scenes.forEach(s=>{if(ids.has(s.id))s.id=makeId();ids.add(s.id);});
  return {
    id:txt(p.id,100)||makeId(),
    name:txt(p.name,120)||'Untitled Video',
    updatedAt:txt(p.updatedAt,48)||new Date().toISOString(),
    scenes:scenes.length?scenes:[makeScene()]
  };
}
export function newProject(name='Untitled Video'){
  return normalizeProject({id:makeId(),name,scenes:[makeScene()]});
}
export function demoProject(){
  return normalizeProject({
    id:makeId(),name:'Leadership 101 — Task vs. Relationship',
    scenes:[
      { id:makeId(),title:'Task vs. Relationship',subtitle:'Effective leaders balance results with people.',
        script:'Leadership requires attention to both the work that must be done and the people doing it. The most effective approach depends on the situation.',duration:9,layout:'presenter-right',theme:'navy',presenter:'Alex' },
      { id:makeId(),title:'Task-oriented behaviors',subtitle:'Clarify goals, define roles, and monitor progress.',
        script:'Task-oriented leadership focuses on setting expectations, establishing priorities, coordinating activities, and ensuring work is accomplished.',duration:10,layout:'split',theme:'blue',presenter:'Jordan' },
      { id:makeId(),title:'Relationship-oriented behaviors',subtitle:'Build trust, listen, coach, and support.',
        script:'Relationship-oriented leadership emphasizes trust, employee development, open communication, and a supportive working environment.',duration:10,layout:'presenter-left',theme:'forest',presenter:'Alex' },
      { id:makeId(),title:'Balance both approaches',subtitle:'Ask: What does this team need from me right now?',
        script:'Strong leaders adapt their emphasis. A new team may need clear direction, while an experienced team may benefit most from coaching and autonomy.',duration:10,layout:'title',theme:'sunset',presenter:'None' }
    ]
  });
}
export function totalSeconds(project){ return project.scenes.reduce((sum,s)=>sum+s.duration,0); }
export function clock(secs){ const n=Math.max(0,Math.floor(secs));return Math.floor(n/60)+':'+String(n%60).padStart(2,'0'); }
export function safeProjectExport(project){
  const clean=normalizeProject(project);
  // Included character IDs are portable; device-only media must be reattached after import.
  clean.scenes.forEach(s=>{s.audioAssetId='';if(!builtinPhoto(s.photoAssetId))s.photoAssetId='';s.videoAssetId='';});
  return { format:'mayne-video-project',version:1,project:clean };
}
export function parseProjectImport(obj){
  if(!obj||obj.format!=='mayne-video-project'||obj.version!==1||!obj.project) throw Error('Not a supported Mayne Video Studio project file.');
  const project=normalizeProject(obj.project);
  project.id=makeId();
  project.scenes.forEach(s=>{s.audioAssetId='';if(!builtinPhoto(s.photoAssetId))s.photoAssetId='';});
  return project;
}


// Portable job format for the later GPU workstation; no browser-only blob IDs or secrets.
export function localRenderManifest(raw){
 const p=normalizeProject(raw);
 return {
  format:'mayne-local-video-job',version:1,generatedAt:new Date().toISOString(),
  project:{name:p.name,id:p.id,scenes:p.scenes.map(s=>({
   id:s.id,title:s.title,subtitle:s.subtitle,script:s.script,
   duration:s.duration,layout:s.layout,theme:s.theme,presenter:s.presenter,backgroundImage:s.backgroundImage,
   voice:s.localVoice,voiceSpeed:s.voiceSpeed,voicePauseMs:s.voicePauseMs,voiceTailMs:s.voiceTailMs,voiceNormalize:s.voiceNormalize,videoMode:s.videoMode,videoFit:s.videoFit,
   videoTrimStart:s.videoTrimStart,videoMuted:s.videoMuted,
   presenterImage:builtinPhoto(s.photoAssetId)?.url||'',
   needsMedia:{audio:Boolean(s.audioAssetId),photo:Boolean(s.photoAssetId)&&!builtinPhoto(s.photoAssetId),video:Boolean(s.videoAssetId)}
  }))}
 };
}
