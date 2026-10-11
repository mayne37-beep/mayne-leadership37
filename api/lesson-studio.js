import { createHmac, timingSafeEqual } from 'node:crypto';
const MAX_AGE=7*86400;
const SUPABASE_URL='https://vteamreihsunsllwcphw.supabase.co';
const PUBLIC_KEY='sb_publishable_dFlcGsz0Fu1TifebqIu4fQ_6aLjG7ud';
export function authorized(cookie,secret,verifier,now=Math.floor(Date.now()/1000)) {
  if(!secret||!verifier)return false;
  const value=(cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('__Host-mayne-access='))?.slice(20)||'';
  const [v,expires,sig,...extra]=value.split('.');
  if(extra.length||v!=='v1'||!/^\d{10}$/.test(expires||'')||! /^[a-f0-9]{64}$/i.test(sig||''))return false;
  const n=Number(expires);if(n<=now||n>now+MAX_AGE)return false;
  const calculated=createHmac('sha256',secret).update('v1:'+expires+':'+verifier).digest();
  return timingSafeEqual(Buffer.from(sig,'hex'),calculated);
}
const allowed=new Set(['list','templates','get','create','save','publish','unpublish','archive','published','history','asset-init','asset-part','asset']);
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store, private');res.setHeader('X-Content-Type-Options','nosniff');
  const send=(s,o)=>res.status(s).json(o);
  if(!authorized(req.headers.cookie,process.env.LEADERSHIP_ACCESS_SECRET,process.env.LEADERSHIP_ACCESS_PIN_VERIFIER))return send(401,{error:'Enter the site PIN to continue.'});
  if(!['GET','POST'].includes(req.method)){res.setHeader('Allow','GET, POST');return send(405,{error:'Method not allowed'});}
  if(req.method==='POST'){
    const origin=req.headers.origin;
    const host=req.headers['x-forwarded-host']||req.headers.host;
    let validOrigin=false;try{validOrigin=!!origin&&new URL(origin).host===host;}catch{}
    if(!validOrigin)return send(403,{error:'Request origin rejected.'});
    if(!/application\/json/i.test(req.headers['content-type']||''))return send(415,{error:'JSON required'});
  }
  const action=req.method==='GET'?String(req.query.action||'list'):req.body?.action;
  let payload=req.method==='GET'?{id:req.query.id}:req.body?.payload||{};
  if(!allowed.has(action)|| (req.method==='GET'&&!['list','templates','get','published','history','asset'].includes(action)))return send(400,{error:'Unknown action'});
  if(JSON.stringify(payload).length>3600000)return send(413,{error:'Course content is too large. Upload media with the file controls.'});
  if(!process.env.LESSON_STUDIO_GATEWAY_KEY)return send(503,{error:'Shared saving is temporarily unavailable.'});
  try{
    const upstream=await fetch(SUPABASE_URL+'/rest/v1/rpc/ml_lesson_rpc',{
      method:'POST',headers:{apikey:PUBLIC_KEY,'Content-Type':'application/json'},
      body:JSON.stringify({p_key:process.env.LESSON_STUDIO_GATEWAY_KEY,p_action:action,p_payload:payload}),signal:AbortSignal.timeout(25000)
    });
    const data=await upstream.json();
    if(!upstream.ok){
      if(data.code==='40001')return send(409,{error:'This course changed in another tab or device. Export your draft, then reload the latest version.'});
      if(data.code==='P0002')return send(404,{error:'The course or file is unavailable.'});
      return send(400,{error:['23505','22P02'].includes(data.code)?'Invalid or duplicate record.':'Unable to complete this action.'});
    }
    if(action==='asset'){
      const bytes=Buffer.from(data.data,'base64');
      res.setHeader('Content-Type',data.mime);res.setHeader('Accept-Ranges','bytes');
      res.setHeader('Content-Disposition',(data.mime.startsWith('image/')||data.mime.startsWith('audio/')||data.mime.startsWith('video/')?'inline':'attachment')+'; filename="'+String(data.name).replace(/[\x00-\x1f"\\]/g,'_')+'"');
      const range=req.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
      if(range){const start=Number(range[1]),end=Math.min(Number(range[2]||bytes.length-1),bytes.length-1);
        if(start> end||start>=bytes.length){res.setHeader('Content-Range','bytes */'+bytes.length);return res.status(416).end();}
        res.setHeader('Content-Range',`bytes ${start}-${end}/${bytes.length}`);res.setHeader('Content-Length',end-start+1);return res.status(206).send(bytes.subarray(start,end+1));}
      res.setHeader('Content-Length',bytes.length);return res.status(200).send(bytes);
    }
    if(action==='published'){const removeNotes=obj=>{if(!obj||typeof obj!=='object')return;for(const k of Object.keys(obj)){if(k==='notes')delete obj[k];else if(obj[k]&&typeof obj[k]==='object')removeNotes(obj[k]);}};removeNotes(data.data);}
    return send(200,data);
  }catch{return send(503,{error:'Shared saving is unavailable. Your draft remains on this device.'});}
}
