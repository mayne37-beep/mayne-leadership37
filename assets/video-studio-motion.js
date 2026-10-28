// Pure, deterministic motion engine used by the preview and MediaRecorder export.
// All frame calculations depend on scene time rather than wall clock.
export const TITLE_MOTIONS=Object.freeze(['none','fade','rise','slide-left','typewriter','word-by-word']);
export const SUBTITLE_MOTIONS=Object.freeze(['inherit','none','fade','rise','typewriter','word-by-word','bullets']);
export const MOTION_TRACKS=Object.freeze([{key:'title',label:'Heading'},{key:'subtitle',label:'Message / bullets'},{key:'presenter',label:'Presenter'}]);
export const PRESENTER_MOTIONS=Object.freeze(['none','fade','slide-left','slide-right','zoom']);
export const SCENE_TRANSITIONS=Object.freeze(['cut','dissolve','slide-left','wipe','zoom']);
const limit=(v,lo,hi)=>Math.min(hi,Math.max(lo,v));
const cue=(v,fallback,hi)=>Number.isFinite(Number(v))&&v!==null&&v!==''?Math.round(limit(Number(v),0,hi)*20)/20:fallback;
export function normalizeMotionOptions(raw={}){
 const s=raw&&typeof raw==='object'?raw:{};
 const seconds=Number(s.motionDuration);
 return {
   titleMotion:TITLE_MOTIONS.includes(s.titleMotion)?s.titleMotion:'none',
   presenterMotion:PRESENTER_MOTIONS.includes(s.presenterMotion)?s.presenterMotion:'none',
   transition:SCENE_TRANSITIONS.includes(s.transition)?s.transition:'cut',
   motionDuration:Number.isFinite(seconds)?Math.round(limit(seconds,.3,2)*10)/10:.8,
   subtitleMotion:SUBTITLE_MOTIONS.includes(s.subtitleMotion)?s.subtitleMotion:'inherit',
   titleStart:cue(s.titleStart,0,119),titleDuration:cue(s.titleDuration,Number.isFinite(seconds)?limit(seconds,.3,2):.8,120),
   subtitleStart:cue(s.subtitleStart,.28,119),subtitleDuration:cue(s.subtitleDuration,Number.isFinite(seconds)?limit(seconds,.3,2):.8,120),
   presenterStart:cue(s.presenterStart,.12,119),presenterDuration:cue(s.presenterDuration,Number.isFinite(seconds)?limit(seconds,.3,2):.8,120)
 };
}
export const easeOutCubic=t=>1-Math.pow(1-limit(t,0,1),3);
export function entranceState(motion,time,duration=.8,delay=0){
 const t=limit((Math.max(0,time)-delay)/Math.max(.1,duration),0,1);
 const ease=easeOutCubic(t);
 switch(motion){
 case 'fade':return {opacity:t,x:0,y:0,scale:1,visible:1};
 case 'rise':return {opacity:t,x:0,y:(1-ease)*52,scale:1,visible:1};
 case 'slide-left':return {opacity:t,x:(1-ease)*85,y:0,scale:1,visible:1};
 case 'slide-right':return {opacity:t,x:(ease-1)*85,y:0,scale:1,visible:1};
 case 'zoom':return {opacity:t,x:0,y:0,scale:.89+.11*ease,visible:1};
 case 'typewriter':case 'word-by-word':return {opacity:1,x:0,y:0,scale:1,visible:t};
 default:return {opacity:1,x:0,y:0,scale:1,visible:1};
 }
}
export function visibleText(text,motion,time,duration=.8,delay=0){
 const value=String(text||'');
 if(motion!=='typewriter'&&motion!=='word-by-word')return value;
 if(motion==='word-by-word'){
  const words=value.match(/\S+\s*/g)||[];
  const p=entranceState('word-by-word',time,duration,delay).visible;
  return words.slice(0,Math.floor(p*words.length+1e-8)).join('').trimEnd();
 }
 const ratio=entranceState('typewriter',time,duration,delay).visible;
 return value.slice(0,Math.max(0,Math.min(value.length,Math.ceil(value.length*ratio))));
}
export function transitionState(scene,time){
 const cfg=normalizeMotionOptions(scene);
 if(cfg.transition==='cut')return {kind:'cut',progress:1};
 const t=limit(Math.max(0,time)/cfg.motionDuration,0,1);
 return {kind:cfg.transition,progress:easeOutCubic(t)};
}
export function motionTime(scene,time){
 return limit(Number(time)||0,0,Math.max(0,Number(scene?.duration)||0));
}


// Timings in seconds, based on the scene's playback clock (same during preview and export).
// Users can reposition and resize every lane; this is authored timing rather than forced audio transcription.
export function cueTiming(scene,key){
 const raw=normalizeMotionOptions(scene);
 const start=raw[key+'Start'],duration=Math.max(.15,raw[key+'Duration']);
 const sceneDuration=limit(Number(scene?.duration)||10,3,120);
 return {start:limit(start,0,Math.max(0,sceneDuration-.15)),
   duration:Math.min(duration,sceneDuration-limit(start,0,sceneDuration-.15)),sceneDuration};
}
export function moveCue(scene,key,start,duration){
 if(!MOTION_TRACKS.some(x=>x.key===key))throw Error('Unknown animation lane');
 const max=limit(Number(scene?.duration)||10,3,120);
 const safeStart=Math.round(limit(Number(start)||0,0,max-.15)*20)/20;
 const safeDuration=Math.round(limit(Number(duration)||.15,.15,max-safeStart)*20)/20;
 return {[key+'Start']:safeStart,[key+'Duration']:safeDuration};
}
export function splitBullets(text){
 const source=String(text||'').trim();
 return source.split(/\r?\n|(?:\s+•\s+)|(?:\s+\|\s+)/)
   .map(x=>x.replace(/^\s*(?:[•\-*]|\d+[.)])\s*/,'').trim()).filter(Boolean).slice(0,4);
}
export function bulletRevealState(scene,time){
 const {start,duration}=cueTiming(scene,'subtitle');
 const bullets=splitBullets(scene?.subtitle);
 const relative=(Number(time)||0)-start;
 // First point appears immediately after its cue begins; stagger points evenly.
 const interval=Math.max(.2,duration/Math.max(1,bullets.length));
 return bullets.map((text,i)=>{
   const phase=relative-i*interval;
   return {text,opacity:limit(phase/.25,0,1),offset:(1-easeOutCubic(phase/.4))*22};
 });
}
