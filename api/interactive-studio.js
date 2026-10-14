import {authorized} from './lesson-studio.js';
import {validateProject} from '../assets/interactive-model.js';
const URL='https://vteamreihsunsllwcphw.supabase.co';
const KEY='sb_publishable_dFlcGsz0Fu1TifebqIu4fQ_6aLjG7ud';
export const config={maxDuration:30};
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store, private');res.setHeader('X-Content-Type-Options','nosniff');
  const send=(status,data)=>res.status(status).json(data);
  if(!authorized(req.headers.cookie,process.env.LEADERSHIP_ACCESS_SECRET,process.env.LEADERSHIP_ACCESS_PIN_VERIFIER))return send(401,{error:'Enter the site PIN to open the authoring studio.'});
  if(req.method!=='POST'){res.setHeader('Allow','POST');return send(405,{error:'Use POST.'});}
  let same=false;try{same=new globalThis.URL(req.headers.origin).host===(req.headers['x-forwarded-host']||req.headers.host);}catch{}
  if(!same)return send(403,{error:'Request origin rejected.'});
  if(!/application\/json/i.test(req.headers['content-type']||''))return send(415,{error:'JSON required.'});
  const {action,payload={}}=req.body||{};
  if(!['list','get','create','save','history'].includes(action))return send(400,{error:'Unknown action.'});
  if(JSON.stringify(payload).length>3000000)return send(413,{error:'This release supports projects up to 3 MB. Reduce image sizes or download a device backup.'});
  if(['create','save'].includes(action)){
    let issues;try{issues=validateProject(payload.data);}catch{issues=['Invalid project structure.'];}
    if(issues.length)return send(400,{error:issues[0]});
    if(payload.id!==payload.data.id)return send(400,{error:'Project ID mismatch.'});
  }
  if(!process.env.LESSON_STUDIO_GATEWAY_KEY)return send(503,{error:'Website saving is temporarily unavailable. Download your project backup.'});
  try{
    const response=await fetch(URL+'/rest/v1/rpc/ml_interactive_rpc',{method:'POST',
      headers:{apikey:KEY,'Content-Type':'application/json'},
      body:JSON.stringify({p_key:process.env.LESSON_STUDIO_GATEWAY_KEY,p_action:action,p_payload:payload}),
      signal:AbortSignal.timeout(20000)});
    const data=await response.json();
    if(!response.ok&&data.code==='PGRST202')return send(503,{error:'Website project storage is awaiting activation. Your edits are retained on this device; use Download project for an independent backup.'});
    if(!response.ok)return send(data.code==='40001'?409:data.code==='P0002'?404:data.code==='42501'?403:400,
      {error:data.code==='40001'?'This project was saved elsewhere. Your draft remains on this device.':data.code==='P0002'?'Project not found.':'Website saving could not complete. Your device draft is retained.'});
    return send(200,data);
  }catch{return send(503,{error:'Website saving is unavailable. Your draft remains on this device.'});}
}
