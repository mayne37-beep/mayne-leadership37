// Local AI speech runs here, in the author's browser; no third-party inference API.
// The Kokoro JS library and open-weight model download only after a user clicks Generate.
import {splitNarration,pcmToWav,validLocalVoice,LOCAL_MODEL} from './video-studio-free-core.js';

let engine=null;
let loading=null;
const send=(type,detail={},transfer=[])=>postMessage({type,...detail},transfer);
async function loadEngine(){
 if(engine)return engine;
 if(!loading){
   loading=(async()=>{
     send('progress',{message:'Downloading free Kokoro model on this device for the first time…'});
     const {KokoroTTS}=await import('https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/dist/kokoro.web.js');
     // WASM q8 is chosen for broad browser compatibility. It may be slow on phones.
     const result=await KokoroTTS.from_pretrained(LOCAL_MODEL,{
       dtype:'q8',device:'wasm',
       progress_callback:(e)=>{
         if(e?.status==='progress'&&Number.isFinite(e.progress)){
           send('progress',{message:'Downloading model: '+Math.round(e.progress)+'%'});
         }else if(e?.status==='ready'){
           send('progress',{message:'Model loaded. Preparing voice…'});
         }
       }
     });
     engine=result;
     send('ready',{message:'Free AI speech model is loaded on this device.'});
     return engine;
   })().catch(e=>{loading=null;throw e;});
 }
 return loading;
}
async function generate(message){
 const voice=String(message.voice||''),text=String(message.text||'');
 if(!validLocalVoice(voice))throw Error('Choose a supported local AI voice.');
 const parts=splitNarration(text);
 if(!parts.length)throw Error('Write a narration script before generating.');
 const tts=await loadEngine();
 const samples=[];
 let sampleRate=24000;
 for(let i=0;i<parts.length;i++){
   send('progress',{message:'Generating speech '+(i+1)+' of '+parts.length+'…'});
   const audio=await tts.generate(parts[i],{voice,speed:1});
   const data=audio?.data||audio?.audio;
   const rate=audio?.sampling_rate||24000;
   if(!data||!data.length)throw Error('Voice model returned empty audio.');
   if(samples.length&&rate!==sampleRate)throw Error('Audio sample rate changed between passages.');
   sampleRate=rate;
   samples.push(data instanceof Float32Array?data:new Float32Array(data));
   if(i<parts.length-1)samples.push(new Float32Array(Math.round(sampleRate*.14)));
 }
 const wav=pcmToWav(samples,sampleRate);
 send('result',{buffer:wav,sampleRate,duration:samples.reduce((n,v)=>n+v.length,0)/sampleRate,voice},[wav]);
}
self.onmessage=async event=>{
 const {id,action}=event.data||{};
 try{
   if(action==='load')await loadEngine();
   else if(action==='generate')await generate(event.data);
   else throw Error('Unrecognized local speech request.');
 }catch(e){send('failure',{message:e?.message||'The free speech model could not run. Try a desktop Chrome or Edge browser.',id});}
};
