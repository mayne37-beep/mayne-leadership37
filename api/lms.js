import {AUTH_URL,AUTH_KEY,LIVE_URL,LIVE_KEY,cleanCourse,completionRows,csv} from '../src/lms/model.js';
export const config={maxDuration:30};
const allowed=new Set(['list','create','get','save','enroll','enrollment','grade','archive','view','post','draft','submit','quiz-start','quiz-save','quiz-submit','file-add','file-get','completion-csv','completion-json','gradebook-csv']);
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store, private');res.setHeader('X-Content-Type-Options','nosniff');
 const send=(status,data)=>res.status(status).json(data);
 if(req.method!=='POST')return send(405,{error:'Use POST.'});
 let same=false;try{same=new URL(req.headers.origin).host===(req.headers['x-forwarded-host']||req.headers.host);}catch{}
 if(!same)return send(403,{error:'Request origin rejected.'});
 if(!/application\/json/i.test(req.headers['content-type']||''))return send(415,{error:'JSON required.'});
 const {action,payload={}}=req.body||{};if(!allowed.has(action))return send(400,{error:'Unknown action.'});
 if(JSON.stringify(payload).length>3200000)return send(413,{error:'Upload files no larger than 2 MB.'});
 const auth=req.headers.authorization;if(!/^Bearer [A-Za-z0-9._-]+$/.test(auth||''))return send(401,{error:'Sign in with your learning account.'});
 if(!process.env.LMS_GATEWAY_KEY)return send(503,{error:'The learning service is being configured. You can explore the pilot preview.'});
 try{
  const identity=await fetch(AUTH_URL+'/auth/v1/user',{headers:{apikey:AUTH_KEY,Authorization:auth},signal:AbortSignal.timeout(8000)});
  if(identity.status===401||identity.status===403)return send(401,{error:'Your login expired. Sign in again.'});
  if(!identity.ok)throw Error('Identity service unavailable');
  const user=await identity.json();if(!user.id||!user.email||!user.email_confirmed_at)return send(403,{error:'Confirm your email before entering a class.'});
  const adminResponse=await fetch(AUTH_URL+'/rest/v1/ml360_admins?select=user_id&user_id=eq.'+encodeURIComponent(user.id),{headers:{apikey:AUTH_KEY,Authorization:auth},signal:AbortSignal.timeout(8000)});
  if(!adminResponse.ok)throw Error('Instructor registry unavailable');
  const admin=(await adminResponse.json()).some(a=>a.user_id===user.id);
  const isExport=action.endsWith('-csv')||action==='completion-json';
  if(isExport&&(!admin||payload.preview))return send(403,{error:'Only the class instructor can export records.'});
  if(['create','save'].includes(action))payload.data=cleanCourse(payload.data);
  if(['create','save'].includes(action)&&(!payload.name?.trim()||payload.name.length>200))return send(400,{error:'Enter a class name of 1–200 characters.'});
  const r=await fetch(LIVE_URL+'/rest/v1/rpc/ml_lms_rpc',{method:'POST',headers:{apikey:LIVE_KEY,'Content-Type':'application/json'},body:JSON.stringify({p_key:process.env.LMS_GATEWAY_KEY,p_actor:user.id,p_email:user.email,p_admin:admin,p_action:isExport?'get':action,p_payload:payload}),signal:AbortSignal.timeout(18000)});
  const data=await r.json();if(!r.ok){const status={'42501':403,'P0002':404,'40001':409,'23505':409}[data.code]||400;return send(status,{error:data.code==='23505'?'That student email is already enrolled in this class.':data.message||'Unable to complete this action.'});}
  if(isExport){if(!data.instructor)return send(403,{error:'Only the class instructor can export records.'});const rows=completionRows(data);for(const row of rows){const e=data.enrollments.find(e=>(e.user_id||e.id)===row.student_id);if(e?.summary){row.completion_status=e.summary.status;row.completion_percent=e.summary.progress;row.current_score_percent=e.summary.current??'';row.final_score_percent=e.summary.final??'';row.required_items=e.summary.required;row.completed_items=e.summary.done;row.completed_at=e.summary.status==='completed'?(e.completed_at||''):'';}}
   if(action==='completion-json'){res.setHeader('Content-Disposition','attachment; filename="completion-statuses.json"');return send(200,{schema_version:'1.0',records:rows});}
   res.setHeader('Content-Type','text/csv; charset=utf-8');res.setHeader('Content-Disposition','attachment; filename="'+(action==='gradebook-csv'?'gradebook':'completion-statuses')+'.csv"');
   if(action==='gradebook-csv'){const items=data.course.data.items.filter(i=>i.published&&i.type!=='lecture');const cols=['student_id','external_student_id','student_name','email',...items.map(i=>i.title+' ['+i.id+']'),'current_score_percent','final_score_percent','completion_status'];for(const row of rows){const e=data.enrollments.find(e=>(e.user_id||e.id)===row.student_id);for(const i of items){const s=data.submissions.find(s=>s.enrollment_id===e.id&&s.item_id===i.id);row[i.title+' ['+i.id+']']=s?.status==='excused'?'EX':s?.score??'';}}return res.status(200).send(csv(rows,cols));}
   return res.status(200).send(csv(rows));
  }
  return send(200,data);
 }catch(error){console.error(JSON.stringify({component:'lms',action,name:error.name}));return send(error.name==='TimeoutError'||error.name==='TypeError'||/unavailable/.test(error.message)?503:400,{error:error.name==='TimeoutError'||error.name==='TypeError'||/unavailable/.test(error.message)?'Connection interrupted. Your work can be retried safely.':error.message});}
}
