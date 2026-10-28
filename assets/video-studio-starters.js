// Deterministic, offline storyboard starters for a no-subscription video editor.
// This module does not call any generative AI; it preserves the author's words.
import {makeScene,normalizeProject,demoProject,makeId} from './video-studio-core.js';
import {conflictLeadershipProject} from './video-studio-conflict.js';

export const STARTER_MODES=Object.freeze([
 {id:'video',name:'Video',subtitle:'Build a video from your script'},
 {id:'lesson',name:'Leadership lesson',subtitle:'Teach a concept'},
 {id:'scenario',name:'Scenario',subtitle:'Present a decision'},
 {id:'voiceover',name:'Voiceover',subtitle:'Narration-first story'}
]);
export const STARTER_TEMPLATES=Object.freeze([
 {id:'leadership',title:'Leadership 101',subtitle:'A four-scene task and relationship lesson',art:'amara-professional.png'},
 {id:'conflict',title:'Managing Conflict',subtitle:'A twelve-scene Leadership 101 teaching video',art:'priya-professional.png'},
 {id:'coaching',title:'Coaching conversation',subtitle:'Four steps to a better coaching discussion',art:'sofia-professional.png'},
 {id:'training',title:'Process walkthrough',subtitle:'Introduce, demonstrate, practice and recap',art:'daniel-professional.png'},
 {id:'blank',title:'Blank canvas',subtitle:'Design your video from scratch',art:'kenji-professional.png'}
]);
const text=v=>String(v||'').replace(/\s+/g,' ').trim();
function shortHeading(value,index){
 const plain=value.replace(/^(?:scene\s*\d+[:.\s-]*|step\s*\d+[:.\s-]*)/i,'');
 const first=plain.split(/[.!?]/)[0].trim();
 const words=first.split(/\s+/).slice(0,7).join(' ');
 return (words.length>64?words.slice(0,61)+'…':words)||'Scene '+(index+1);
}
export function scriptChunks(raw,maxScenes=8){
 const input=String(raw||'').replace(/\r\n/g,'\n').trim();
 if(input.length>10000)throw Error('Please enter no more than 10,000 characters.');
 if(!input)throw Error('Add a script or an outline to start your video.');
 let parts=input.split(/\n\s*\n/).map(text).filter(Boolean);
 if(parts.length<=1){
   const sentences=input.match(/[^.!?]+[.!?]+(?:["']?)(?=\s|$)|[^.!?]+$/g)||[input];
   parts=sentences.map(text).filter(Boolean);
 }
 // Preserve input order and all words, even if there are more sentences than scene slots.
 const capacity=Math.max(1,Math.min(12,maxScenes));
 const groupSize=Math.max(1,Math.ceil(parts.length/capacity));
 const groups=[];
 for(let i=0;i<parts.length;i+=groupSize)groups.push(parts.slice(i,i+groupSize).join(' '));
 return groups;
}
export function storyboardFromText(raw,{mode='video',name=''}={}){
 const chunks=scriptChunks(raw);
 const modeName=STARTER_MODES.find(x=>x.id===mode)?.name||'Video';
 const preferred={
  video:['presenter-right','split','presenter-left','title'],
  lesson:['presenter-right','split','presenter-left','title'],
  scenario:['title','presenter-left','split','presenter-right'],
  voiceover:['title','text-only','split','presenter-left']
 }[mode]||['presenter-right'];
 const themes=['navy','blue','forest','slate','sunset'];
 const scenes=chunks.map((chunk,index)=>makeScene({
   title:shortHeading(chunk,index),subtitle:chunk.slice(0,185),script:chunk,
   duration:Math.min(120,Math.max(5,Math.ceil(chunk.split(/\s+/).length/2.3))),
   layout:preferred[index%preferred.length],theme:themes[index%themes.length],
   presenter:index%2?'Jordan':'Alex'
 }));
 return normalizeProject({id:makeId(),name:text(name).slice(0,120)||modeName+' — '+shortHeading(chunks[0],0),
  scenes});
}
export function starterProject(template){
 if(template==='conflict')return conflictLeadershipProject();
 if(template==='leadership'){
   const p=demoProject();p.id=makeId();p.name='Leadership 101 — Task vs. Relationship';
   p.scenes=p.scenes.map(s=>({...s,id:makeId()}));return p;
 }
 if(template==='coaching'){
   return normalizeProject({id:makeId(),name:'Coaching conversation — GROW in action',scenes:[
    makeScene({title:'Start with the goal',subtitle:'What would you like to accomplish?',
      script:'A productive coaching conversation starts by inviting the employee to describe the outcome they want to achieve.',duration:10,theme:'navy'}),
    makeScene({title:'Explore reality',subtitle:'Understand the current situation.',
      script:'Ask questions that help the employee describe what is happening now, what they have tried, and what obstacles they face.',duration:11,theme:'blue',layout:'split'}),
    makeScene({title:'Generate options',subtitle:'Find more than one possible way forward.',
      script:'Invite the employee to identify several options before jumping to advice. Explore the benefits and limitations of each.',duration:11,theme:'forest',layout:'presenter-left'}),
    makeScene({title:'Commit to next steps',subtitle:'What will you do, and when?',
      script:'Agree on a specific action, support needed, and a date to review progress. Coaching ends with ownership and accountability.',duration:11,theme:'sunset',layout:'title'})
   ]});
 }
 if(template==='training'){
   return normalizeProject({id:makeId(),name:'Process training walkthrough',scenes:[
    makeScene({title:'Why this process matters',subtitle:'Describe the objective and intended outcome.',
      script:'Introduce the process, explain why it matters, and define what success looks like.',duration:8}),
    makeScene({title:'Demonstrate the steps',subtitle:'Show each step and identify the owner.',
      script:'Explain the actions in sequence. Show who is responsible, what tools to use, and when to escalate.',duration:10,layout:'split',theme:'blue'}),
    makeScene({title:'Practice a decision',subtitle:'Ask learners to choose their next action.',
      script:'Present a realistic situation and invite the learner to determine the next step.',duration:9,layout:'presenter-left',theme:'forest'}),
    makeScene({title:'Recap and follow up',subtitle:'Review the checklist and where to find help.',
      script:'Summarize the critical steps, available job aids, and the best way to get support.',duration:9,layout:'title',theme:'sunset'})
   ]});
 }
 if(template==='blank')return normalizeProject({id:makeId(),name:'Untitled video',scenes:[
   makeScene({title:'Start here',subtitle:'Add the idea you want the audience to remember.',script:'',duration:8})
 ]});
 throw Error('Unknown video template.');
}
