import {randomBytes,createHash} from 'node:crypto';
import sanitizeHtml from 'sanitize-html';
import {GoTrueClient} from '@supabase/auth-js';
import {AUTH_URL,AUTH_KEY,LIVE_URL,LIVE_KEY,DEFAULTS,validateGame,safeMedia} from '../src/challenge/model.js';
export const config={maxDuration:30};
const studentActions=new Set(['lookup','join','student-snapshot','submit','student-next','retry']);
const instructorActions=new Set(['games','game-create','game-get','game-save','game-publish','game-archive','game-delete','bank','bank-add','bank-delete','settings','settings-save','host','host-snapshot','control','report','sessions','review','session-delete']);
const TOKEN_COOKIE='__Host-lcs-player';
const verifiedInstructors=new Map();
const verifyingInstructors=new Map();
const identity=new GoTrueClient({url:AUTH_URL+'/auth/v1',headers:{apikey:AUTH_KEY},persistSession:false,autoRefreshToken:false,detectSessionInUrl:false,fetch:(url,options)=>fetch(url,{...options,signal:AbortSignal.timeout(12000)})});

async function verifyInstructor(auth){
 const hash=createHash('sha256').update(auth).digest('hex');
 const cached=verifiedInstructors.get(hash);
 if(cached&&cached.until>Date.now())return cached.owner;
 if(verifyingInstructors.has(hash))return verifyingInstructors.get(hash);
 const work=(async()=>{
  const {data:verified,error}=await identity.getClaims(auth.slice(7));
  const claims=verified?.claims;
  if(error?.status>=500||error?.name==='AuthRetryableFetchError')throw Object.assign(Error('Identity service unavailable'),{name:'TimeoutError'});
  if(error||!claims||claims.iss!==AUTH_URL+'/auth/v1'||claims.aud!=='authenticated'||claims.role!=='authenticated'||!claims.sub||!Number.isFinite(claims.exp))throw Object.assign(Error('Your login expired. Sign in again.'),{status:401});
  const check=await fetch(AUTH_URL+'/rest/v1/ml360_admins?select=user_id&user_id=eq.'+encodeURIComponent(claims.sub),{headers:{apikey:AUTH_KEY,Authorization:auth},signal:AbortSignal.timeout(8000)});
  if(!check.ok||!(await check.json()).some(x=>x.user_id===claims.sub))throw Object.assign(Error('This account is not an authorized instructor.'),{status:403});
  if(verifiedInstructors.size>500)verifiedInstructors.clear();
  // Signature-verified identity and registry membership are cached for at most 30 seconds.
  // Database instructor membership and content ownership are checked on every operation.
  verifiedInstructors.set(hash,{owner:claims.sub,until:Math.min(Date.now()+30000,claims.exp*1000)});
  return claims.sub;
 })();
 verifyingInstructors.set(hash,work);
 try{return await work;}finally{verifyingInstructors.delete(hash);}
}

export function settings(value={}){
 const s={...DEFAULTS};for(const key of Object.keys(s))if(value[key]!==undefined)s[key]=value[key];
 for(const k of Object.keys(DEFAULTS).filter(k=>typeof DEFAULTS[k]==='boolean'))s[k]=Boolean(s[k]);
 if(!['classic','team','accuracy','challenge','practice','discussion'].includes(s.mode))throw Error('Choose a supported mode.');
 if(!['shared','speed','joined'].includes(s.tieRule))throw Error('Choose a supported tie rule.');
 if(!['auto','manual'].includes(s.teamAssignment)||!['average','sum'].includes(s.teamScoring))throw Error('Invalid team settings.');
 for(const [key,min,max] of [['teams',2,20],['retentionDays',1,3650],['questionTime',0,86400]]){s[key]=Number(s[key]);if(!Number.isFinite(s[key])||s[key]<min||s[key]>max)throw Error('Invalid '+key+'.');}
 if(['accuracy','challenge','practice'].includes(s.mode))s.speed=false;
 if(s.mode==='discussion'){s.leaderboard=false;s.speed=false;}
 return s;
}
export function cleanGame(data,publish){
 const errors=validateGame(data,publish);if(errors.length)throw Error(errors.join('\n'));
 const g=structuredClone(data);g.settings=settings(g.settings);
 for(const q of g.questions){q.body=sanitizeHtml(q.body||'',{allowedTags:['p','br','h2','h3','strong','em','u','ul','ol','li','blockquote','a'],allowedAttributes:{a:['href','target','rel']},allowedSchemes:['https']});
 q.choices?.forEach(c=>{if(c.image&&!safeMedia(c.image))throw Error('Answer images must use HTTPS or this site’s assets.');});
 for(const k of ['media','video'])if(q[k]&&!safeMedia(q[k]))throw Error('Media links must use HTTPS.');
 for(const k of ['timer','points','number','tolerance','min','max','step'])q[k]=Number(q[k]);
 }
 if(g.cover&&!safeMedia(g.cover))throw Error('Cover images must use HTTPS or this site’s assets.');return g;
}
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store, private');res.setHeader('X-Content-Type-Options','nosniff');
 const send=(status,data)=>res.status(status).json(data);
 if(req.method!=='POST'){res.setHeader('Allow','POST');return send(405,{error:'Use POST.'});}
 const origin=req.headers.origin,host=req.headers['x-forwarded-host']||req.headers.host;
 let same=false;try{same=Boolean(origin)&&new URL(origin).host===host;}catch{}
 if(!same)return send(403,{error:'Request origin rejected.'});
 if(!/application\/json/i.test(req.headers['content-type']||''))return send(415,{error:'JSON required.'});
 const {action,payload:input={}}=req.body||{};
 if(!studentActions.has(action)&&!instructorActions.has(action))return send(400,{error:'Unknown action.'});
 if(JSON.stringify(input).length>3500000)return send(413,{error:'This game is too large. Upload media with the file controls.'});
 if(!process.env.CHALLENGE_STUDIO_GATEWAY_KEY)return send(503,{error:'Challenge Studio is temporarily unavailable.'});
 let owner=null,payload={...input};
 const cookie=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(TOKEN_COOKIE+'='))?.slice(TOKEN_COOKIE.length+1);
 try{
  if(instructorActions.has(action)){
   const auth=req.headers.authorization;
   if(!auth?.startsWith('Bearer '))return send(401,{error:'Sign in with your instructor account.'});
   try{owner=await verifyInstructor(auth);}catch(e){if(e.status)return send(e.status,{error:e.message});throw e;}
  }else{
   payload.token=/^[a-f0-9]{64}$/.test(cookie||'')?cookie:randomBytes(32).toString('hex');
   if(action==='join')res.setHeader('Set-Cookie',TOKEN_COOKIE+'='+payload.token+'; Path=/; Max-Age=15552000; HttpOnly; Secure; SameSite=Lax');
  }
  payload.ip=createHash('sha256').update((req.headers['x-forwarded-for']?.split(',')[0]||req.socket?.remoteAddress||'unknown')+process.env.CHALLENGE_STUDIO_GATEWAY_KEY).digest('hex');
  if(['game-create','game-save','game-publish'].includes(action)){payload.data=cleanGame(payload.data,action==='game-publish');if(payload.id!==payload.data.id)throw Error('Game identifier does not match.');}
  if(action==='bank-add'){const fake={title:'Question bank',questions:[payload.question]};const errors=validateGame(fake,true);if(errors.length)throw Error(errors.join('\n'));payload.question=cleanGame(fake,true).questions[0];}
  if(action==='host'||action==='settings-save')payload.settings=settings(payload.settings);
  if(action==='host'&&payload.deadline){const deadline=Date.parse(payload.deadline);if(!Number.isFinite(deadline)||deadline<=Date.now()||deadline>Date.now()+180*86400000)throw Error('Choose a future deadline within 180 days.');}
  const upstream=await fetch(LIVE_URL+'/rest/v1/rpc/ml_challenge_rpc',{method:'POST',headers:{apikey:LIVE_KEY,'Content-Type':'application/json'},body:JSON.stringify({p_key:process.env.CHALLENGE_STUDIO_GATEWAY_KEY,p_owner:owner,p_action:action,p_payload:payload}),signal:AbortSignal.timeout(22000)});
  const data=await upstream.json();
  if(!upstream.ok){const status=/changed.*(?:another tab|Refresh)/i.test(data.message||'')?409:({'42501':403,'P0002':404,'40001':409,'23505':409}[data.code]||400);console.error(JSON.stringify({component:'challenge',action,status,code:data.code}));return send(status,{error:data.message||'Unable to complete this action.'});}
  if(data?.error)return send(data.status||400,{error:data.error});
  return send(200,data);
 }catch(e){const unavailable=e.name==='TimeoutError'||e.name==='TypeError';console.error(JSON.stringify({component:'challenge',action,status:unavailable?503:400,error:unavailable?'upstream unavailable':'validation',cause:e.cause?.code,name:e.name,detail:e.message}));return send(unavailable?503:400,{error:unavailable?'Connection interrupted. Your answer or draft can be retried safely.':e.message});}
}
