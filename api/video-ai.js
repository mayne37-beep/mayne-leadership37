import { authorized } from './lesson-studio.js';

const ENVOY='https://api.elevenlabs.io';
const AVATAR_API='https://api.heygen.com';
const MAX_TEXT=3500;
const cleanId=v=>typeof v==='string'&&/^[\w-]{5,100}$/.test(v)?v:null;
const errorMessage=(code)=>code===429?'Provider rate or credit limit reached.':code===401||code===403?'Provider credentials or permissions were rejected.':'Video AI provider request failed.';

async function upstream(url, options={},timeout=26000) {
  const controller=new AbortController();
  const abort=setTimeout(()=>controller.abort(),timeout);
  try{return await fetch(url,{...options,signal:controller.signal,redirect:'error'});}
  finally{clearTimeout(abort);}
}
async function asJson(response) {
  try{return await response.json();}catch{return null;}
}
function hostOrigin(req) {
  try{
    const origin=new URL(String(req.headers.origin||''));
    const host=String(req.headers['x-forwarded-host']||req.headers.host||'');
    return origin.protocol==='https:'&&origin.host===host ||
      origin.hostname==='127.0.0.1'&&origin.host===host;
  }catch{return false;}
}
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store, private');
  res.setHeader('X-Content-Type-Options','nosniff');
  const send=(s,obj)=>res.status(s).json(obj);
  if(!authorized(req.headers.cookie,process.env.LEADERSHIP_ACCESS_SECRET,process.env.LEADERSHIP_ACCESS_PIN_VERIFIER))
    return send(401,{error:'Enter the Mayne Leadership site PIN.'});
  if(!['GET','POST'].includes(req.method))return send(405,{error:'Method not allowed.'});
  if(req.method==='POST'&&(!hostOrigin(req)||!String(req.headers['content-type']||'').includes('application/json')))
    return send(403,{error:'Valid same-site JSON request required.'});
  const action=String(req.method==='POST'?req.body?.action:req.query?.action||'status');
  const voiceKey=process.env.ELEVENLABS_API_KEY;
  const avatarKey=process.env.HEYGEN_API_KEY;
  if(action==='status'&&req.method==='GET')return send(200,{speech:!!voiceKey,avatars:!!avatarKey});
  try{
    if(action==='voices'&&req.method==='GET'){
      if(!voiceKey)return send(503,{error:'ElevenLabs is not connected. Configure ELEVENLABS_API_KEY in Vercel.'});
      const response=await upstream(ENVOY+'/v1/voices',{headers:{'xi-api-key':voiceKey}});
      if(!response.ok)return send(502,{error:errorMessage(response.status)});
      const data=await asJson(response);
      const voices=(Array.isArray(data?.voices)?data.voices:[]).slice(0,100).map(v=>({
        id:cleanId(v.voice_id),name:String(v.name||'Voice').slice(0,80),
        category:String(v.category||'').slice(0,35)
      })).filter(v=>v.id);
      return send(200,{voices});
    }
    if(action==='speech'&&req.method==='POST'){
      if(!voiceKey)return send(503,{error:'ElevenLabs is not connected. Configure ELEVENLABS_API_KEY in Vercel.'});
      const text=typeof req.body?.text==='string'?req.body.text.trim():'';
      const voiceId=cleanId(req.body?.voiceId);
      if(!voiceId||!text||text.length>MAX_TEXT)return send(400,{error:'Select a voice and enter 1–3500 characters of narration.'});
      const response=await upstream(ENVOY+'/v1/text-to-speech/'+encodeURIComponent(voiceId)+'?output_format=mp3_44100_128',{
        method:'POST',headers:{'xi-api-key':voiceKey,'content-type':'application/json','accept':'audio/mpeg'},
        body:JSON.stringify({text,model_id:'eleven_multilingual_v2'})
      });
      if(!response.ok)return send(502,{error:errorMessage(response.status)});
      const bytes=Buffer.from(await response.arrayBuffer());
      if(!bytes.length||bytes.length>9*1024*1024)return send(502,{error:'Provider returned an invalid or oversized audio file.'});
      res.setHeader('Content-Type','audio/mpeg');res.setHeader('Content-Length',bytes.length);
      return res.status(200).send(bytes);
    }
    if(action==='avatar-options'&&req.method==='GET'){
      if(!avatarKey)return send(503,{error:'HeyGen is not connected. Configure HEYGEN_API_KEY in Vercel.'});
      const headers={'x-api-key':avatarKey};
      const [avatarRes,voiceRes]=await Promise.all([
        upstream(AVATAR_API+'/v2/avatars',{headers}),
        upstream(AVATAR_API+'/v2/voices',{headers})
      ]);
      if(!avatarRes.ok||!voiceRes.ok)return send(502,{error:'HeyGen did not return its avatar and voice catalog.'});
      const [ad,vd]=await Promise.all([asJson(avatarRes),asJson(voiceRes)]);
      const avatars=(Array.isArray(ad?.data?.avatars)?ad.data.avatars:[]).slice(0,120).map(a=>({
        id:cleanId(a.avatar_id),name:String(a.avatar_name||a.name||'Avatar').slice(0,80)
      })).filter(a=>a.id);
      const voices=(Array.isArray(vd?.data?.voices)?vd.data.voices:[]).slice(0,160).map(v=>({
        id:cleanId(v.voice_id),name:String(v.name||v.display_name||'Voice').slice(0,80)
      })).filter(v=>v.id);
      return send(200,{avatars,voices});
    }
    if(action==='avatar-generate'&&req.method==='POST'){
      if(!avatarKey)return send(503,{error:'HeyGen is not connected. Configure HEYGEN_API_KEY in Vercel.'});
      const avatarId=cleanId(req.body?.avatarId),voiceId=cleanId(req.body?.voiceId);
      const script=typeof req.body?.text==='string'?req.body.text.trim():'';
      if(!avatarId||!voiceId||!script||script.length>2200)return send(400,{error:'Choose a HeyGen avatar and voice and keep narration under 2200 characters.'});
      // User initiates this paid provider operation with a dedicated confirmation.
      const response=await upstream(AVATAR_API+'/v2/video/generate',{
        method:'POST',headers:{'x-api-key':avatarKey,'content-type':'application/json'},
        body:JSON.stringify({video_inputs:[{character:{type:'avatar',avatar_id:avatarId,avatar_style:'normal'},
          voice:{type:'text',input_text:script,voice_id:voiceId}}],dimension:{width:1280,height:720},test:false})
      });
      const data=await asJson(response);
      if(!response.ok||data?.error)return send(502,{error:errorMessage(response.status)});
      const videoId=cleanId(data?.data?.video_id);
      if(!videoId)return send(502,{error:'HeyGen returned no video job ID.'});
      return send(200,{videoId});
    }
    if(action==='avatar-status'&&req.method==='GET'){
      if(!avatarKey)return send(503,{error:'HeyGen is not connected.'});
      const videoId=cleanId(req.query?.videoId);if(!videoId)return send(400,{error:'A valid video job ID is required.'});
      const response=await upstream(AVATAR_API+'/v1/video_status.get?video_id='+encodeURIComponent(videoId),{headers:{'x-api-key':avatarKey}});
      const data=await asJson(response);
      if(!response.ok)return send(502,{error:errorMessage(response.status)});
      const d=data?.data||{};
      const videoUrl=typeof d.video_url==='string'&&/^https:\/\//.test(d.video_url)?d.video_url:'';
      return send(200,{state:String(d.status||'unknown').slice(0,32),videoUrl});
    }
    return send(400,{error:'Unknown AI studio action.'});
  }catch(e){
    return send(502,{error:e?.name==='AbortError'?'Provider timed out. Try again later.':'AI provider unavailable right now.'});
  }
}
