import {randomBytes,randomUUID} from 'node:crypto';
import {authorized} from './lesson-studio.js';
import {validate,validId,validToken,LIMITS} from '../assets/systems/model.js';
const URL='https://vteamreihsunsllwcphw.supabase.co';
const KEY='sb_publishable_dFlcGsz0Fu1TifebqIu4fQ_6aLjG7ud';
const PUBLIC=new Set(['session-get','session-join','session-save','session-reflect']);
const ALLOWED=new Set(['list','get','save','history','archive','session-create','session-settings','session-roster',...PUBLIC]);
export const config={maxDuration:30};
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store, private');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
 const send=(status,data)=>res.status(status).json(data);
 if(req.method!=='POST'){res.setHeader('Allow','POST');return send(405,{error:'Use POST.'});}
 let same=false;try{same=new globalThis.URL(req.headers.origin).host===(req.headers['x-forwarded-host']||req.headers.host);}catch{}
 if(!same)return send(403,{error:'Request origin rejected.'});
 if(!/application\/json/i.test(req.headers['content-type']||''))return send(415,{error:'JSON required.'});
 const {action}=req.body||{};const payload=req.body?.payload;
 if(!ALLOWED.has(action)||!payload||typeof payload!=='object'||Array.isArray(payload))return send(400,{error:'Unknown action or invalid payload.'});
 if(JSON.stringify(payload).length>LIMITS.bytes+5000)return send(413,{error:'Map source exceeds 1.5 MB.'});
 if(PUBLIC.has(action)){
  if(!validToken(payload.room))return send(400,{error:'A valid classroom invitation is required.'});
 }else if(!authorized(req.headers.cookie,process.env.LEADERSHIP_ACCESS_SECRET,process.env.LEADERSHIP_ACCESS_PIN_VERIFIER))return send(401,{error:'Enter the website PIN to open the instructor studio.'});
 if(['save','session-save'].includes(action)){
  let issues;try{issues=validate(payload.data);}catch{issues=['Invalid map data.'];}
  if(issues.length||payload.id!==payload.data?.id||!Number.isInteger(payload.version)||payload.version<0)return send(400,{error:issues[0]||'Invalid map ID or version.'});
 }
 if(!PUBLIC.has(action)&&action!=='list'&&!validId(payload.id))return send(400,{error:'Invalid project ID.'});
 if(['session-settings','session-roster'].includes(action)&&!validId(payload.session))return send(400,{error:'Invalid session ID.'});
 if(['session-save','session-reflect'].includes(action)||action==='session-get'&&payload.member){if(!validId(payload.member)||!validToken(payload.proof))return send(400,{error:'Invalid participant access.'});}
 if(action==='session-create'){payload.session=randomUUID();payload.room=randomBytes(24).toString('hex');}
 if(action==='session-join'){
  if(typeof payload.name!=='string'||!payload.name.trim()||payload.name.length>80||payload.team!==undefined&&(typeof payload.team!=='string'||payload.team.length>80))return send(400,{error:'Enter a name and team of up to 80 characters.'});
  payload.member=randomUUID();payload.proof=randomBytes(24).toString('hex');
 }
 if(action==='session-reflect'&&(typeof payload.reflection!=='string'||payload.reflection.length>4000))return send(400,{error:'Reflection limit is 4000 characters.'});
 if(action==='session-settings'&&(payload.mode!==undefined&&!['edit','view'].includes(payload.mode)||payload.locked!==undefined&&typeof payload.locked!=='boolean'||payload.active!==undefined&&typeof payload.active!=='boolean'||payload.minutes!==undefined&&(!Number.isInteger(payload.minutes)||payload.minutes<0||payload.minutes>180)))return send(400,{error:'Invalid classroom settings.'});
 if(!process.env.LESSON_STUDIO_GATEWAY_KEY)return send(503,{error:'Website saving is temporarily unavailable. Your device draft is retained; export JSON for a backup.'});
 try{
  const upstream=await fetch(URL+'/rest/v1/rpc/ml_systems_safe_rpc',{method:'POST',headers:{apikey:KEY,'Content-Type':'application/json'},body:JSON.stringify({p_key:process.env.LESSON_STUDIO_GATEWAY_KEY,p_action:action,p_payload:payload}),signal:AbortSignal.timeout(24000)});
  const data=await upstream.json();
  // PostgREST may retry SQLSTATE 40001. An explicit result keeps stale saves
  // prompt and deterministic instead of exhausting the serverless timeout.
  if(data?.conflict)return send(409,{error:'Another person saved first. Your device draft is kept. Export it, then reload the website version.'});
  if(!upstream.ok){const code=data.code,status=code==='40001'?409:code==='P0002'?404:code==='42501'?403:code==='54000'?429:503;return send(status,{error:status===409?'Another person saved first. Your device draft is kept. Export it, then reload the website version.':status===404?'This map or classroom session is unavailable or has expired.':status===403?'Classroom access denied or editing is locked.':status===429?'This classroom session is full (60 participants).':'Website storage is unavailable. Your device draft is retained.'});}
  return send(200,data);
 }catch{return send(503,{error:'Website storage could not be reached. Your device draft is retained.'});}
}
