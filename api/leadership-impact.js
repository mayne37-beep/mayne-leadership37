import {randomBytes,randomUUID} from 'node:crypto';
import {authorized} from './lesson-studio.js';
const SUPABASE='https://vteamreihsunsllwcphw.supabase.co';
const PUBLISHABLE='sb_publishable_dFlcGsz0Fu1TifebqIu4fQ_6aLjG7ud';
const PUBLIC=new Set(['join','state','vote','ask']);
const HOST=new Set(['create','host-view','host-update']);
const ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROOM=/^[a-f0-9]{20}$/;
const TOKEN=/^[a-f0-9]{48}$/;
const goodInt=(x,min,max)=>Number.isInteger(x)&&x>=min&&x<=max;
export const config={maxDuration:30};
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store, private');res.setHeader('X-Content-Type-Options','nosniff');
 res.setHeader('Referrer-Policy','no-referrer');
 const fail=(status,error)=>res.status(status).json({error});
 if(req.method!=='POST'){res.setHeader('Allow','POST');return fail(405,'Use POST.');}
 let originOK=false;
 try {const origin=new URL(req.headers.origin);originOK=origin.host===(req.headers['x-forwarded-host']||req.headers.host)&&origin.protocol==='https:';}catch{}
 if(!originOK)return fail(403,'Request origin rejected.');
 if(!/application\/json/i.test(req.headers['content-type']||''))return fail(415,'JSON required.');
 const {action}=req.body||{};
 let payload=req.body?.payload;
 if(!HOST.has(action)&&!PUBLIC.has(action))return fail(400,'Unknown action.');
 if(!payload||typeof payload!=='object'||Array.isArray(payload)||JSON.stringify(payload).length>6000)return fail(413,'Invalid or oversized request.');
 if(HOST.has(action)&&!authorized(req.headers.cookie,process.env.LEADERSHIP_ACCESS_SECRET,process.env.LEADERSHIP_ACCESS_PIN_VERIFIER))
  return fail(401,'Instructor site PIN required.');
 payload={...payload};
 if(action==='create'){
  if(!goodInt(payload.teams,2,6))return fail(400,'Choose 2–6 teams.');
  payload.id=randomUUID();payload.room=randomBytes(10).toString('hex');
  payload.title=String(payload.title||'Leadership Impact Lab').slice(0,100);
 }else if(action==='join'){
  if(!ROOM.test(payload.room||'')||!goodInt(payload.team,1,6))return fail(400,'Invalid invitation or team.');
  payload.member=randomUUID();payload.proof=randomBytes(24).toString('hex');
 }else if(action==='state'){
  if(!ROOM.test(payload.room||'')||!ID.test(payload.member||'')||!TOKEN.test(payload.proof||''))
   return fail(400,'Rejoin this session.');
 }else{
  if(!ID.test(payload.id||''))return fail(400,'Invalid session.');
  if(PUBLIC.has(action)&&(!ID.test(payload.member||'')||!TOKEN.test(payload.proof||'')))return fail(400,'Rejoin this session.');
 }
 if(action==='vote'){
  if(!['trust','support','effective'].every(k=>goodInt(payload[k],0,100)))return fail(400,'Ratings must be between 0 and 100.');
  if(typeof payload.comment!=='string'||payload.comment.length>750||!['feedback','question'].includes(payload.kind))return fail(400,'Invalid feedback.');
 }
 if(action==='ask'&&(typeof payload.body!=='string'||!payload.body.trim()||payload.body.length>400))return fail(400,'Enter a question of up to 400 characters.');
 if(action==='host-update'){
  if(payload.new_round===true){
   if(!goodInt(payload.active_team,1,6)||!payload.scenario||typeof payload.scenario!=='object'||typeof payload.scenario.id!=='string'||String(payload.scenario.brief||'').length>1600||JSON.stringify(payload.scenario).length>3000||!Array.isArray(payload.used_ids)||payload.used_ids.length>40)
    return fail(400,'Invalid round details.');
  }else if(!['lobby','discuss','vote','reveal','closed'].includes(payload.phase))return fail(400,'Invalid round phase.');
 }
 if(!process.env.LESSON_STUDIO_GATEWAY_KEY)return fail(503,'The classroom service is not configured.');
 try{
  const response=await fetch(SUPABASE+'/rest/v1/rpc/ml_impact_rpc',{
   method:'POST',headers:{apikey:PUBLISHABLE,'Content-Type':'application/json'},
   body:JSON.stringify({p_key:process.env.LESSON_STUDIO_GATEWAY_KEY,p_action:action,p_payload:payload}),
   signal:AbortSignal.timeout(24000)
  });
  const data=await response.json();
  if(!response.ok){
   const code=data?.code;
   return fail(code==='P0002'?404:code==='42501'?403:code==='P0003'?409:code==='P0004'?429:400,
    code==='P0002'?'Session not found.':code==='42501'?'Participant access denied.':code==='P0003'?'This phase is no longer accepting responses.':code==='P0004'?'Session or question limit reached.':'Unable to process this action.');
  }
  return res.status(200).json(data);
 }catch(error){console.error('Leadership Impact Lab service failure:',error?.message);return fail(503,'Classroom service temporarily unavailable.');}
}
