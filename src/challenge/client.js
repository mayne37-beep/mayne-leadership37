import {createClient} from '@supabase/supabase-js';
import {AUTH_URL,AUTH_KEY,LIVE_URL,LIVE_KEY} from './model.js';
export const auth=createClient(AUTH_URL,AUTH_KEY);
export const live=createClient(LIVE_URL,LIVE_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
export function message(text){window.dispatchEvent(new CustomEvent('lcs-message',{detail:String(text)}));}
export async function api(action,payload={},instructor=true){
 const headers={'Content-Type':'application/json'};
 if(instructor){const {data}=await auth.auth.getSession();if(!data.session)throw Error('Sign in with your instructor account.');headers.Authorization='Bearer '+data.session.access_token;}
 const response=await fetch('/api/challenge',{method:'POST',credentials:'same-origin',headers,body:JSON.stringify({action,payload})});
 const result=await response.json();if(!response.ok)throw Error(result.error||'Request failed ('+response.status+').');return result;
}
export async function uploadMedia(file){
 if(!file)return '';if(file.size>50*1024*1024)throw Error('Upload a file smaller than 50 MB.');
 if(!/^(image\/(jpeg|png|webp|gif)|audio\/(mpeg|wav|ogg|webm)|video\/(mp4|webm))$/.test(file.type))throw Error('Use PNG, JPG, WebP, GIF, MP3, WAV, OGG, MP4, or WebM.');
 const {data:{user}}=await auth.auth.getUser();if(!user)throw Error('Sign in to upload media.');
 const path=user.id+'/'+crypto.randomUUID()+'/'+file.name.replace(/[^a-z0-9._-]/gi,'_');
 const {error}=await auth.storage.from('leadership-challenge').upload(path,file,{contentType:file.type,upsert:false});if(error)throw Error(error.message);
 return auth.storage.from('leadership-challenge').getPublicUrl(path).data.publicUrl;
}
export function download(name,data,type='application/json'){const blob=new Blob([data],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);}
export function exportGame(g){download(g.title.replace(/[^a-z0-9_-]/gi,'_')+'.json',JSON.stringify({schema:'mayne-challenge',version:1,game:g,media:[g.cover,...g.questions.flatMap(q=>[q.media,q.video,...(q.choices||[]).map(c=>c.image)])].filter(Boolean)},null,2));}
export async function fullscreen(){try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{message('Full-screen mode is unavailable in this browser.');}}
let audioContext,musicTimer;
export function tone(kind='correct',enabled=true){if(!enabled)return;try{audioContext||=new (window.AudioContext||window.webkitAudioContext)();audioContext.resume();for(let i=0;i<(kind==='celebrate'?12:2);i++){const o=audioContext.createOscillator(),g=audioContext.createGain();o.connect(g);g.connect(audioContext.destination);o.frequency.value=kind==='wrong'?170:440*Math.pow(2,(i%5)/5);const t=audioContext.currentTime+i*.1;g.gain.setValueAtTime(.025,t);g.gain.exponentialRampToValueAtTime(.001,t+.18);o.start(t);o.stop(t+.2);}}catch{}}
export function music(on){clearInterval(musicTimer);if(on){tone('correct');musicTimer=setInterval(()=>tone('correct'),2800);}}
