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
