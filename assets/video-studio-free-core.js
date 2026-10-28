// Browser-only speech utilities. No paid API or server runtime.
export const LOCAL_VOICES=Object.freeze([
 {id:'af_heart',label:'Heart · US feminine'},
 {id:'af_bella',label:'Bella · US feminine'},
 {id:'af_nova',label:'Nova · US feminine'},
 {id:'af_kore',label:'Kore · US feminine'},
 {id:'am_michael',label:'Michael · US masculine'},
 {id:'am_fenrir',label:'Fenrir · US masculine'},
 {id:'am_puck',label:'Puck · US masculine'},
 {id:'bf_emma',label:'Emma · UK feminine'},
 {id:'bm_george',label:'George · UK masculine'}
]);
export const LOCAL_MODEL='onnx-community/Kokoro-82M-v1.0-ONNX';
export const MAX_LOCAL_SCRIPT=1200;
// We split long passages into manageable pieces to avoid Kokoro phoneme limits.
export function splitNarration(text,maxLength=240){
 const source=String(text||'').replace(/\s+/g,' ').trim();
 if(source.length>MAX_LOCAL_SCRIPT)throw Error('Limit free AI narration to 1,200 characters per scene.');
 if(!source)return [];
 const result=[];
 for(const paragraph of source.split(/(?<=[.!?;:])\s+/)){
  if(paragraph.length<=maxLength){result.push(paragraph);continue;}
  let chunk='';
  for(const word of paragraph.split(/\s+/)){
   if(word.length>maxLength)throw Error('One word exceeds the narration chunk limit.');
   if(chunk && (chunk+' '+word).length>maxLength){result.push(chunk);chunk=word;}
   else chunk=chunk?chunk+' '+word:word;
  }
  if(chunk)result.push(chunk);
 }
 return result.filter(Boolean);
}
export function pcmToWav(chunks,sampleRate=24000){
 if(!Array.isArray(chunks)||!chunks.length)throw Error('No voice data generated.');
 if(!Number.isFinite(sampleRate)||sampleRate<8000||sampleRate>96000)throw Error('Invalid audio sample rate.');
 const count=chunks.reduce((n,a)=>n+a.length,0);
 if(count<=0||count>sampleRate*240)throw Error('Generated audio exceeds the limit for one scene.');
 const bytes=44+2*count,buffer=new ArrayBuffer(bytes),view=new DataView(buffer);
 const write=(at,value)=>{for(let i=0;i<value.length;i++)view.setUint8(at+i,value.charCodeAt(i));};
 write(0,'RIFF');view.setUint32(4,bytes-8,true);write(8,'WAVE');
 write(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);
 view.setUint16(22,1,true);view.setUint32(24,sampleRate,true);
 view.setUint32(28,sampleRate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);
 write(36,'data');view.setUint32(40,count*2,true);
 let cursor=44;
 for(const chunk of chunks){
  for(const raw of chunk){
   const n=Math.max(-1,Math.min(1,Number.isFinite(raw)?raw:0));
   view.setInt16(cursor,n<0?Math.round(n*32768):Math.round(n*32767),true);
   cursor+=2;
  }
 }
 return buffer;
}
export function validLocalVoice(value){
 return LOCAL_VOICES.some(x=>x.id===value);
}


// Speech settings stored on each scene. No cloud generation required.
export const DEFAULT_SPEECH=Object.freeze({
 voiceSpeed:0.96,voicePauseMs:380,voiceTailMs:450,voiceNormalize:true
});
export function normalizeSpeechOptions(raw={}){
 const v=raw&&typeof raw==='object'?raw:{};
 const number=(value,fallback,min,max)=>Number.isFinite(Number(value))
  ?Math.min(max,Math.max(min,Number(value))):fallback;
 return {
  voiceSpeed:Math.round(number(v.voiceSpeed,DEFAULT_SPEECH.voiceSpeed,.80,1.20)*100)/100,
  voicePauseMs:Math.round(number(v.voicePauseMs,DEFAULT_SPEECH.voicePauseMs,0,1000)/50)*50,
  voiceTailMs:Math.round(number(v.voiceTailMs,DEFAULT_SPEECH.voiceTailMs,0,1500)/50)*50,
  voiceNormalize:v.voiceNormalize===false?false:true
 };
}
// Add deliberate phrase/tail pauses, control signal peaks and soften beginning/end clicks.
// Speech dynamics are unchanged in the underlying Kokoro model; this is post-processing.
export function finishNarration(chunks,sampleRate=24000,options={}){
 const opts=normalizeSpeechOptions(options);
 if(!Array.isArray(chunks)||!chunks.length||!chunks.every(x=>x&&x.length))
  throw Error('No speech samples were generated.');
 const pauseSamples=Math.round(sampleRate*opts.voicePauseMs/1000);
 const tailSamples=Math.round(sampleRate*opts.voiceTailMs/1000);
 const total=chunks.reduce((n,x)=>n+x.length,tailSamples)+pauseSamples*(chunks.length-1);
 if(total<=0||total>sampleRate*240)throw Error('Narration duration is too long.');
 const output=new Float32Array(total);
 let offset=0;
 for(let i=0;i<chunks.length;i++){
  output.set(chunks[i],offset);offset+=chunks[i].length;
  if(i<chunks.length-1)offset+=pauseSamples;
 }
 if(opts.voiceNormalize){
  let sum=0,peak=0;
  // Compute level only on actual voice; gaps are excluded.
  let count=0;
  for(const chunk of chunks)for(const x of chunk){
   const v=Number.isFinite(x)?x:0;
   sum+=v*v;peak=Math.max(peak,Math.abs(v));count++;
  }
  const rms=Math.sqrt(sum/Math.max(1,count));
  // Avoid wild amplification on nearly silent files.
  const gain=rms>.005?Math.min(2.5,.16/rms,.87/Math.max(peak,.0001)):1;
  for(let i=0;i<output.length;i++)output[i]=Math.max(-.9,Math.min(.9,output[i]*gain));
 }
 // 55 ms anti-click fade; no fades across intentional inter-sentence gaps.
 const fade=Math.min(Math.round(sampleRate*.055),Math.floor(offset/3));
 for(let i=0;i<fade;i++){
  const gain=(i+1)/fade;
  output[i]*=gain;
  output[offset-1-i]*=gain;
 }
 return {samples:output,duration:output.length/sampleRate,settings:opts};
}
