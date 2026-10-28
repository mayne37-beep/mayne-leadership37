// Pure, deterministic motion engine used by the preview and MediaRecorder export.
// All frame calculations depend on scene time rather than wall clock.
export const TITLE_MOTIONS=Object.freeze(['none','fade','rise','slide-left','typewriter','word-by-word','bullet-build']);
export const PRESENTER_MOTIONS=Object.freeze(['none','fade','slide-left','slide-right','zoom']);
export const SCENE_TRANSITIONS=Object.freeze(['cut','dissolve','slide-left','wipe','zoom']);
const limit=(v,lo,hi)=>Math.min(hi,Math.max(lo,v));
export function normalizeMotionOptions(raw={}){
 const s=raw&&typeof raw==='object'?raw:{};
 const seconds=Number(s.motionDuration);
 return {
   titleMotion:TITLE_MOTIONS.includes(s.titleMotion)?s.titleMotion:'none',
   presenterMotion:PRESENTER_MOTIONS.includes(s.presenterMotion)?s.presenterMotion:'none',
   transition:SCENE_TRANSITIONS.includes(s.transition)?s.transition:'cut',
   motionDuration:Number.isFinite(seconds)?Math.round(limit(seconds,.3,2)*10)/10:.8,
   motionDelay:Number.isFinite(Number(s.motionDelay))?Math.round(limit(Number(s.motionDelay),0,30)*10)/10:0,
   subtitleDelay:Number.isFinite(Number(s.subtitleDelay))?Math.round(limit(Number(s.subtitleDelay),0,30)*10)/10:.3
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
 case 'typewriter':return {opacity:1,x:0,y:0,scale:1,visible:t};
 default:return {opacity:1,x:0,y:0,scale:1,visible:1};
 }
}
export function visibleText(text,motion,time,duration=.8,delay=0){
 const value=String(text||'');
 if(motion==='word-by-word'){
   const words=value.match(/\S+\s*/g)||[];
   const t=entranceState('typewriter',time,duration,delay).visible;
   return words.slice(0,Math.floor(words.length*t+0.00001)).join('');
 }
 if(motion==='bullet-build'){
   const lines=value.split(/\n|\s*[•▪]\s*/).filter(Boolean);
   const t=entranceState('typewriter',time,duration,delay).visible;
   return lines.slice(0,Math.floor(lines.length*t+0.00001)).map(x=>'• '+x.trim()).join('\n');
 }
 if(motion!=='typewriter')return value;
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
