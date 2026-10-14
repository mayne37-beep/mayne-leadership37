import {randomBytes,randomUUID} from 'node:crypto';
import {authorized} from './lesson-studio.js';
import {assetIds,validId,validToken,validateDraft,validatePublished,learnerProject,validateProgress} from '../src/escape/model.js';
const SUPABASE_URL='https://vteamreihsunsllwcphw.supabase.co';
const PUBLIC_KEY='sb_publishable_dFlcGsz0Fu1TifebqIu4fQ_6aLjG7ud';
const READ_ACTIONS=new Set(['list','get','published','asset','reports']);
const ACTIONS=new Set([...READ_ACTIONS,'save','publish','unpublish','asset-init','asset-part','start','progress']);
export const config={maxDuration:30};
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store, private');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
 const send=(status,data)=>res.status(status).json(data);
 if(!['GET','POST'].includes(req.method)){res.setHeader('Allow','GET, POST');return send(405,{error:'Method not allowed.'});}
 const action=req.method==='GET'?String(req.query?.action||''):req.body?.action;
 const payload=req.method==='GET'?{id:req.query?.id,room:req.query?.room}:req.body?.payload;
 if(!ACTIONS.has(action)||!payload||typeof payload!=='object'||Array.isArray(payload)||req.method==='GET'&&!READ_ACTIONS.has(action))return send(400,{error:'Unknown action.'});
 const publicAction=action==='published'||action==='asset'&&!!payload.room||['start','progress'].includes(action);
 if(publicAction){if(!validToken(payload.room))return send(400,{error:'A valid learner room link is required.'});}
 else if(!authorized(req.headers.cookie,process.env.LEADERSHIP_ACCESS_SECRET,process.env.LEADERSHIP_ACCESS_PIN_VERIFIER))return send(401,{error:'Enter the website PIN to open the authoring studio.'});
 if(req.method==='POST'){
  let sameOrigin=false;try{sameOrigin=new URL(req.headers.origin).host===(req.headers['x-forwarded-host']||req.headers.host);}catch{}
  if(!sameOrigin)return send(403,{error:'Request origin rejected.'});
  if(!/application\/json/i.test(req.headers['content-type']||''))return send(415,{error:'JSON required.'});
 }
 if(JSON.stringify(payload).length>1200000)return send(413,{error:'The request is too large. Upload images through the studio controls.'});
 if(action==='save'){
  let issues;try{issues=validateDraft(payload.data);}catch{issues=['Invalid room data.'];}
  if(issues.length)return send(400,{error:issues[0]});
  if(payload.id!==payload.data.id||!Number.isInteger(payload.version)||payload.version<0)return send(400,{error:'Invalid room ID or version.'});
  payload.assets=assetIds(payload.data);
 }
 if(['get','publish','unpublish','reports'].includes(action)&&!validId(payload.id))return send(400,{error:'Invalid room ID.'});
 if(['asset-init','asset-part','asset'].includes(action)&&!/^asset-[a-f0-9]{64}$/.test(payload.id||''))return send(400,{error:'Invalid image ID.'});
 if(action==='asset-init'&&(!['image/png','image/jpeg','image/webp','image/gif'].includes(payload.mime)||!Number.isInteger(payload.parts)||payload.parts<1||payload.parts>8))return send(400,{error:'Invalid image upload.'});
 if(action==='asset-part'&&(!Number.isInteger(payload.part)||typeof payload.data!=='string'||payload.data.length>524288||!/^[A-Za-z0-9+/]*={0,2}$/.test(payload.data)))return send(400,{error:'Invalid image part.'});
 if(action==='start'){payload.session=randomUUID();payload.proof=randomBytes(24).toString('hex');payload.learner=String(payload.learner||'').slice(0,100);}
 if(action==='progress'&&(!validToken(payload.proof)||!validateProgress(payload.progress)))return send(400,{error:'Invalid learning session report.'});
 const gateway=process.env.LESSON_STUDIO_GATEWAY_KEY;
 if(!gateway)return send(503,{error:'Website saving is temporarily unavailable. Export an editable project backup.'});
 async function call(act,data){
  const response=await fetch(SUPABASE_URL+'/rest/v1/rpc/ml_escape_rpc',{method:'POST',headers:{apikey:PUBLIC_KEY,'Content-Type':'application/json'},body:JSON.stringify({p_key:gateway,p_action:act,p_payload:data}),signal:AbortSignal.timeout(24000)});
  const result=await response.json();if(!response.ok){const error=new Error(result.code||'REQUEST_FAILED');error.code=result.code;throw error;}return result;
 }
 try{
  if(action==='publish'){
   const source=await call('get',{id:payload.id});const issues=validatePublished(source.data);if(issues.length)return send(400,{error:issues[0]});
   if(source.version!==payload.version)return send(409,{error:'This room changed on another device. Reload its current version before publishing.'});
   payload.token=randomBytes(24).toString('hex');
  }
  const result=await call(action,payload);
  if(action==='published')return send(200,{data:learnerProject(result.data,payload.room,result.version),version:result.version});
  if(action==='asset'){
   const bytes=Buffer.from(result.data,'base64');if(bytes.length>3000000)return send(413,{error:'Image is too large.'});
   res.setHeader('Content-Type',result.mime);res.setHeader('Content-Length',bytes.length);res.setHeader('Content-Disposition','inline');return res.status(200).send(bytes);
  }
  return send(200,result);
 }catch(error){
  const status=error.code==='40001'?409:error.code==='P0002'?404:error.code==='42501'?403:503;
  return send(status,{error:status===409?'This room changed on another device. Your local draft is kept; export it, then open the current website version.':status===404?'This room, image, or learner link is unavailable.':status===403?'Access denied.': 'Website saving is unavailable. Your device draft is retained.'});
 }
}
