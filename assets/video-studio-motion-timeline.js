// Pointer + keyboard editor for deterministic in-scene animation cues.
// The stage canvas and exported video both consume the saved timings.
import {MOTION_TRACKS,cueTiming,moveCue} from './video-studio-motion.js';

const $=id=>document.getElementById(id);
const fmt=n=>Number(n).toFixed(2).replace(/0$/,'').replace(/\.0$/,'')+'s';
export function wireMotionTimeline({getScene,onChange,onScrub,canEdit}){
 const tracks=$('motion-timing-tracks'),scrub=$('motion-scrub'),output=$('motion-scrub-time');
 function updatePlayhead(seconds=0){
  const scene=getScene();if(!scene)return;
  scrub.max=String(scene.duration);
  const value=Math.min(scene.duration,Math.max(0,Number(seconds)||0));
  scrub.value=String(value);output.value=value.toFixed(1)+' s';
 }
 function render(){
  const scene=getScene();if(!scene)return;
  tracks.replaceChildren();$('motion-timing-total').textContent='0–'+scene.duration+' seconds';
  updatePlayhead(0);
  for(const {key,label} of MOTION_TRACKS){
   const row=document.createElement('div');row.className='motion-lane';
   const name=document.createElement('span');name.className='motion-lane-label';name.textContent=label;
   const rail=document.createElement('div');rail.className='motion-lane-rail';
   rail.setAttribute('aria-label',label+' timing from zero to '+scene.duration+' seconds');
   const bar=document.createElement('div');bar.className='motion-cue motion-cue-'+key;
   bar.tabIndex=0;bar.setAttribute('role','slider');
   const title=document.createElement('span');title.className='motion-cue-title';title.textContent=label;
   const grip=document.createElement('span');grip.className='motion-cue-end';grip.tabIndex=0;grip.setAttribute('role','slider');
   grip.textContent='⋮';grip.title='Resize '+label+' reveal';
   bar.append(title,grip);
   const readout=document.createElement('output');readout.className='motion-cue-readout';
   row.append(name,rail,readout);rail.append(bar);tracks.append(row);
   const description=()=>{const {start,duration}=cueTiming(scene,key);return label+': '+fmt(start)+' to '+fmt(start+duration)};
   function sync(){
     if(getScene()?.id!==scene.id)return;
     const {start,duration}=cueTiming(scene,key);
     bar.style.left=(100*start/scene.duration)+'%';
     bar.style.width=(100*duration/scene.duration)+'%';
     readout.value=fmt(start)+' – '+fmt(start+duration);
     bar.setAttribute('aria-label','Move '+description());
     bar.setAttribute('aria-valuemin','0');
     bar.setAttribute('aria-valuemax',String(Math.max(0,scene.duration-duration)));
     bar.setAttribute('aria-valuenow',String(start));
     bar.setAttribute('aria-valuetext',description());
     grip.setAttribute('aria-label','Resize '+description());
     grip.setAttribute('aria-valuemin','.15');
     grip.setAttribute('aria-valuemax',String(Math.max(.15,scene.duration-start)));
     grip.setAttribute('aria-valuenow',String(duration));
     grip.setAttribute('aria-valuetext',description());
   }
   function update(start,duration){
     if(!canEdit()||getScene()?.id!==scene.id)return;
     Object.assign(scene,moveCue(scene,key,start,duration));
     sync();onChange();
   }
   let pointer=null;
   bar.addEventListener('pointerdown',e=>{
     if(!canEdit()||e.button!==0)return;
     e.preventDefault();
     const start=cueTiming(scene,key);
     pointer={id:e.pointerId,x:e.clientX,start:start.start,duration:start.duration,
       mode:e.target===grip?'resize':'move'};
     bar.setPointerCapture(e.pointerId);
   });
   bar.addEventListener('pointermove',e=>{
     if(!pointer||pointer.id!==e.pointerId)return;
     const pixels=rail.getBoundingClientRect().width;
     if(!pixels)return;
     const delta=(e.clientX-pointer.x)*scene.duration/pixels;
     if(pointer.mode==='resize')update(pointer.start,pointer.duration+delta);
     else update(pointer.start+delta,pointer.duration);
   });
   const endPointer=e=>{
     if(pointer?.id===e.pointerId){pointer=null;try{bar.releasePointerCapture(e.pointerId);}catch{}}
   };
   bar.addEventListener('pointerup',endPointer);
   bar.addEventListener('pointercancel',endPointer);
   for(const [element,mode] of [[bar,'move'],[grip,'resize']]){
     element.addEventListener('keydown',e=>{
       if(e.key!=='ArrowLeft'&&e.key!=='ArrowRight'&&e.key!=='Home'&&e.key!=='End')return;
       e.preventDefault();e.stopPropagation();
       const t=cueTiming(scene,key),increment=e.shiftKey?1:.25;
       const delta=e.key==='ArrowRight'?increment:e.key==='ArrowLeft'?-increment:0;
       if(mode==='resize')update(t.start,e.key==='Home'?.15:e.key==='End'?scene.duration-t.start:t.duration+delta);
       else update(e.key==='Home'?0:e.key==='End'?scene.duration-t.duration:t.start+delta,t.duration);
     });
   }
   sync();
  }
 }
 scrub.addEventListener('input',()=>{
   const seconds=Number(scrub.value)||0;
   updatePlayhead(seconds);onScrub(seconds);
 });
 return {render,updatePlayhead};
}
