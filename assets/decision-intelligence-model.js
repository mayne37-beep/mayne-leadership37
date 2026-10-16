/* Decision Intelligence Studio — transparent calculations; no forecasts implied. */
export const VERSION=1;
export const LIMIT={projects:35,options:20,criteria:24,nodes:120,scenarios:35,risks:100,teams:24,injects:40,decisions:80};
export const TYPES=['decision','chance','outcome'];
export const TAGS=['Fact','Estimate','Assumption','Unknown'];
export const PHASES=['Exploring','Recommended','Decided','Implementing','Reviewed'];
export const RISK_STATUSES=['Open','Mitigating','Closed'];
export const RUBRIC=['reasoning','evidence','tradeoffs','adaptation'];
export const uid=()=>globalThis.crypto?.randomUUID?.()||'di-'+Date.now().toString(36)+Math.random().toString(36).slice(2,8);
export const copy=v=>JSON.parse(JSON.stringify(v));
export const clean=(v,n=1800)=>String(v??'').slice(0,n);
export const clamp=(v,min,max,fallback=min)=>{const x=Number(v);return Number.isFinite(x)?Math.max(min,Math.min(max,x)):fallback};
export const integer=(v,min,max,fallback=min)=>Math.round(clamp(v,min,max,fallback));
export const escapeHTML=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
export const today=()=>new Date().toISOString().slice(0,10);
const stamp=()=>new Date().toISOString();
export function makeCriterion(name='New criterion',value={}){
 return {id:uid(),name:clean(name,100),weight:integer(value.weight,0,100,20),
  explanation:clean(value.explanation,600),direction:['Benefit','Cost'].includes(value.direction)?value.direction:'Benefit'};
}
export function makeOption(name='New option',data={}){
 return {id:uid(),name:clean(name,150),description:clean(data.description,900),ratings:{...data.ratings||{}},
  rationale:clean(data.rationale,1100)};
}
export function makeNode(type='decision',data={}){
 if(!TYPES.includes(type))throw Error('Choose a valid decision tree node type.');
 return {id:uid(),parentId:clean(data.parentId,100),type,title:clean(data.title||({decision:'Decision',chance:'Uncertain event',outcome:'Possible outcome'}[type]),180),
  x:clamp(data.x,90,1750,110),y:clamp(data.y,75,1400,175),w:integer(data.w,180,330,224),h:integer(data.h,110,240,125),
  probability:integer(data.probability,0,100,50),utility:clamp(data.utility,-1000000,1000000,0),
  evidenceTag:TAGS.includes(data.evidenceTag)?data.evidenceTag:'Assumption',
  evidence:clean(data.evidence,1200),notes:clean(data.notes,1200)};
}
export function createProject(title='Untitled decision analysis'){
 const root=makeNode('decision',{title:'Decision to make',x:120,y:330});
 return {version:VERSION,id:uid(),title,question:'',objective:'',context:'',owner:'',deadline:'',status:'Exploring',
  criteria:[],options:[],nodes:[root],scenarios:[],activeScenario:'',risks:[],teams:[],injects:[],
  brief:{recommendationId:'',recommendation:'',dissent:'',assumptions:'',reviewDate:'',reviewTrigger:'',accountable:'',result:''},
  decisions:[],created:stamp(),updated:stamp()};
}
const guard=(arr,max,name)=>{if(arr.length>=max)throw Error(name+' limit reached. Export or remove another item.')};
export function addCriterion(p,name,opts={}){
 guard(p.criteria,LIMIT.criteria,'Criteria');const c=makeCriterion(name,opts);p.criteria.push(c);
 for(const o of p.options)o.ratings[c.id]={score:3,tag:'Assumption',note:''};return c;
}
export function addOption(p,name,opts={}){
 guard(p.options,LIMIT.options,'Options');const o=makeOption(name,opts);o.ratings={};
 for(const c of p.criteria)o.ratings[c.id]={score:3,tag:'Assumption',note:''};p.options.push(o);return o;
}
export function setRating(p,optionId,criterionId,update={}){
 const option=p.options.find(o=>o.id===optionId),criterion=p.criteria.find(c=>c.id===criterionId);
 if(!option||!criterion)return false;
 const orig=option.ratings[criterionId]||{score:3,tag:'Assumption',note:''};
 const item={score:integer(update.score??orig.score,1,5,orig.score),
  tag:TAGS.includes(update.tag)?update.tag:orig.tag,
  note:clean(update.note??orig.note,900)};
 option.ratings[criterionId]=item;return true;
}
export function deleteOption(p,id){
 if(!p.options.some(o=>o.id===id))return false;p.options=p.options.filter(o=>o.id!==id);
 p.scenarios.forEach(s=>{delete s.scoreShifts[id]});
 if(p.brief.recommendationId===id)p.brief.recommendationId='';return true;
}
export function deleteCriterion(p,id){
 if(!p.criteria.some(c=>c.id===id))return false;p.criteria=p.criteria.filter(c=>c.id!==id);
 p.options.forEach(o=>delete o.ratings[id]);
 p.scenarios.forEach(s=>{delete s.weightShifts[id];for(const v of Object.values(s.scoreShifts))delete v[id]});
 return true;
}
export function addNode(p,parentId,type,opts={}){
 guard(p.nodes,LIMIT.nodes,'Tree node');const parent=p.nodes.find(n=>n.id===parentId);
 if(!parent)throw Error('Select a valid parent node.');
 if(parent.type==='outcome')throw Error('Outcomes are terminal. Select a decision or uncertain event.');
 const siblings=p.nodes.filter(n=>n.parentId===parentId).length;
 const n=makeNode(type,{...opts,parentId,x:opts.x??parent.x+330,y:opts.y??parent.y+(siblings%2===0?-(siblings+1)*80:(siblings+1)*80)});
 p.nodes.push(n);return n;
}
export function isDescendant(p,ancestorId,nodeId){
 let cursor=p.nodes.find(n=>n.id===nodeId),depth=0;
 while(cursor?.parentId&&depth++<LIMIT.nodes){if(cursor.parentId===ancestorId)return true;cursor=p.nodes.find(n=>n.id===cursor.parentId)}
 return false;
}
export function reparentNode(p,id,newParentId){
 const n=p.nodes.find(x=>x.id===id),parent=p.nodes.find(x=>x.id===newParentId);
 if(!n||!parent||!n.parentId||id===newParentId||parent.type==='outcome'||isDescendant(p,id,newParentId))return false;
 n.parentId=newParentId;return true;
}
export function updateNode(p,id,updates={}){
 const n=p.nodes.find(n=>n.id===id);if(!n)return false;
 if(updates.type&&TYPES.includes(updates.type)&&updates.type!==n.type){
  if(updates.type==='outcome'&&p.nodes.some(x=>x.parentId===n.id))throw Error('Delete or reconnect its branches before turning this into an outcome.');
  n.type=updates.type;
 }
 if(updates.title!==undefined)n.title=clean(updates.title,180);
 if(updates.x!==undefined)n.x=clamp(updates.x,90,1750,n.x);
 if(updates.y!==undefined)n.y=clamp(updates.y,75,1400,n.y);
 if(updates.w!==undefined)n.w=integer(updates.w,180,330,n.w);
 if(updates.h!==undefined)n.h=integer(updates.h,110,240,n.h);
 if(updates.probability!==undefined)n.probability=integer(updates.probability,0,100,n.probability);
 if(updates.utility!==undefined)n.utility=clamp(updates.utility,-1000000,1000000,n.utility);
 if(updates.evidenceTag!==undefined&&TAGS.includes(updates.evidenceTag))n.evidenceTag=updates.evidenceTag;
 if(updates.evidence!==undefined)n.evidence=clean(updates.evidence,1200);
 if(updates.notes!==undefined)n.notes=clean(updates.notes,1200);
 return true;
}
export function deleteNode(p,id){
 const target=p.nodes.find(n=>n.id===id);if(!target||!target.parentId)return false;
 const ids=new Set([id]);let found=true;
 while(found){found=false;for(const n of p.nodes)if(!ids.has(n.id)&&ids.has(n.parentId)){ids.add(n.id);found=true}}
 p.nodes=p.nodes.filter(n=>!ids.has(n.id));
 for(const s of p.scenarios)for(const key of ids) {delete s.probabilityOverrides[key];delete s.utilityOverrides[key]}
 return true;
}
export function organizeTree(p){
 const root=p.nodes.find(n=>!n.parentId);if(!root)return;
 const groups=new Map([[root.id,0]]),depths=[[root]];
 for(let i=0;i<16;i++){
  const level=depths[i]||[];
  const next=p.nodes.filter(n=>level.some(k=>k.id===n.parentId)&&!groups.has(n.id));
  if(!next.length)break;
  next.forEach(n=>groups.set(n.id,i+1));depths.push(next);
 }
 depths.forEach((level,depth)=>level.forEach((n,i)=>{
  n.x=clamp(145+depth*305,90,1750);n.y=clamp(130+(i+1)*111,75,1400);
 }));
}
export function probabilityStatus(p,parentId,scenario=null){
 const n=p.nodes.find(n=>n.id===parentId),children=p.nodes.filter(c=>c.parentId===parentId);
 if(!n||n.type!=='chance'||!children.length)return {valid:false,total:0,missing:true};
 const total=children.reduce((s,c)=>s+(scenario&&Object.hasOwn(scenario.probabilityOverrides,c.id)?integer(scenario.probabilityOverrides[c.id],0,100):c.probability),0);
 return {valid:total===100,total,missing:false};
}
export function evaluateTree(p,scenario=null){
 const byId=new Map(p.nodes.map(n=>[n.id,n])),memo=new Map(),warnings=[],seen=new Set();
 function walk(id){
  if(memo.has(id))return memo.get(id);
  const n=byId.get(id);if(!n)return null;
  if(seen.has(id)){warnings.push('Cycle detected at '+n.title);return null}
  seen.add(id);const children=p.nodes.filter(c=>c.parentId===id);let value=null;
  if(n.type==='outcome'){
   value=scenario&&Object.hasOwn(scenario.utilityOverrides,n.id)?clamp(scenario.utilityOverrides[n.id],-1000000,1000000,n.utility):n.utility;
  }else if(!children.length){warnings.push(n.title+' has no branches');}
  else if(n.type==='decision'){
   const values=children.map(c=>walk(c.id));if(values.every(v=>v!==null))value=Math.max(...values);
   else warnings.push(n.title+' has incomplete branches');
  }else if(n.type==='chance'){
   const status=probabilityStatus(p,n.id,scenario);if(!status.valid)warnings.push(n.title+' probabilities total '+status.total+'%, not 100%');
   const values=children.map(c=>walk(c.id));if(status.valid&&values.every(v=>v!==null)){
    value=children.reduce((sum,c,i)=>sum+values[i]*(scenario&&Object.hasOwn(scenario.probabilityOverrides,c.id)?scenario.probabilityOverrides[c.id]:c.probability)/100,0);
   }
  }
  seen.delete(id);memo.set(id,value);return value;
 }
 const root=p.nodes.find(n=>!n.parentId);const total=root?walk(root.id):null;
 for(const n of p.nodes)if(!memo.has(n.id))walk(n.id);
 return {rootValue:total,values:memo,warnings:[...new Set(warnings)],complete:total!==null};
}
export function makeScenario(title='New what-if scenario'){
 return {id:uid(),title:clean(title,130),description:'',weightShifts:{},scoreShifts:{},probabilityOverrides:{},utilityOverrides:{},created:stamp()};
}
export function addScenario(p,title){
 guard(p.scenarios,LIMIT.scenarios,'Scenario');const s=makeScenario(title);p.scenarios.push(s);p.activeScenario=s.id;return s;
}
export const activeScenario=p=>p.scenarios.find(s=>s.id===p.activeScenario)||null;
export function setScenarioOverride(p,scenarioId,kind,a,b,value){
 const s=p.scenarios.find(x=>x.id===scenarioId);if(!s)return false;
 if(kind==='weight'&&p.criteria.some(c=>c.id===a)){
  const base=p.criteria.find(c=>c.id===a).weight,v=integer(value,0,100,base);
  if(v===base)delete s.weightShifts[a];else s.weightShifts[a]=v;return true;
 }
 if(kind==='score'&&p.options.some(o=>o.id===a)&&p.criteria.some(c=>c.id===b)){
  const base=p.options.find(o=>o.id===a).ratings[b]?.score??3,v=integer(value,1,5,base);
  if(!s.scoreShifts[a])s.scoreShifts[a]={};
  if(v===base)delete s.scoreShifts[a][b];else s.scoreShifts[a][b]=v;
  return true;
 }
 if(kind==='probability'&&p.nodes.some(n=>n.id===a)){
  const base=p.nodes.find(n=>n.id===a).probability,v=integer(value,0,100,base);
  if(v===base)delete s.probabilityOverrides[a];else s.probabilityOverrides[a]=v;return true;
 }
 if(kind==='utility'&&p.nodes.some(n=>n.id===a)){
  const base=p.nodes.find(n=>n.id===a).utility,v=clamp(value,-1000000,1000000,base);
  if(v===base)delete s.utilityOverrides[a];else s.utilityOverrides[a]=v;return true;
 }
 return false;
}
export function scoreMatrix(p,scenario=null){
 const weights=p.criteria.map(c=>scenario&&Object.hasOwn(scenario.weightShifts,c.id)?integer(scenario.weightShifts[c.id],0,100,c.weight):c.weight);
 const weightTotal=weights.reduce((a,b)=>a+b,0);
 const ranking=p.options.map(o=>{
  let sum=0,missing=[];
  p.criteria.forEach((c,i)=>{
   const r=o.ratings[c.id];
   if(!r){missing.push(c.name);return;}
   const score=scenario&&Object.hasOwn(scenario.scoreShifts[o.id]||{},c.id)?integer(scenario.scoreShifts[o.id][c.id],1,5,r.score):integer(r.score,1,5,3);
   sum+=(c.direction==='Cost'?6-score:score)*weights[i];
  });
  return {...o,score:weightTotal&&!missing.length?Math.round(1000*sum/weightTotal)/1000:null,missing};
 }).sort((a,b)=>(b.score??-Infinity)-(a.score??-Infinity)||a.name.localeCompare(b.name));
 return {ranking,weightTotal,valid:weightTotal>0&&p.criteria.length>0&&p.options.length>0};
}
export function sensitivity(p,shift=10){
 const baseline=scoreMatrix(p);if(!baseline.valid||baseline.ranking[0]?.score===null)return {base:'',flips:[],stable:false};
 const base=baseline.ranking[0].id,flips=[];
 for(const c of p.criteria)for(const sign of [-1,1]){
  const test={weightShifts:{[c.id]:integer(c.weight+sign*shift,0,100,c.weight)},scoreShifts:{}};
  const outcome=scoreMatrix(p,test);
  if(outcome.ranking[0]?.id!==base)flips.push({criterion:c.name,direction:sign>0?'increase':'decrease',winner:outcome.ranking[0]?.name||''});
 }
 return {base,flips,stable:!flips.length};
}
export function makeRisk(data={}){
 return {id:uid(),failure:clean(data.failure||'Potential failure',250),likelihood:integer(data.likelihood,1,5,3),
 impact:integer(data.impact,1,5,3),warning:clean(data.warning,900),safeguard:clean(data.safeguard,1000),
 owner:clean(data.owner,100),status:RISK_STATUSES.includes(data.status)?data.status:'Open'};
}
export function addRisk(p,data={}){guard(p.risks,LIMIT.risks,'Premortem');const r=makeRisk(data);p.risks.push(r);return r;}
export function makeTeam(data={}){
 return {id:uid(),name:clean(data.name||'New team',110),recommendation:clean(data.recommendation,1800),evidence:clean(data.evidence,1200),
 tradeoffs:clean(data.tradeoffs,1100),scores:Object.fromEntries(RUBRIC.map(key=>[key,integer(data.scores?.[key],0,5,0)])),created:stamp()};
}
export function addTeam(p,data={}){guard(p.teams,LIMIT.teams,'Teams');const t=makeTeam(data);p.teams.push(t);return t;}
export const teamScore=t=>RUBRIC.reduce((sum,k)=>sum+integer(t.scores?.[k],0,5,0),0);
export const rankedTeams=p=>[...p.teams].sort((a,b)=>teamScore(b)-teamScore(a)||a.name.localeCompare(b.name));
export function addInject(p,data={}){
 guard(p.injects,LIMIT.injects,'Challenge inject');
 const a={id:uid(),title:clean(data.title||'New inject',110),message:clean(data.message,1100),revealed:!!data.revealed,created:stamp()};
 p.injects.push(a);return a;
}
export function addDecision(p,data={}){
 guard(p.decisions,LIMIT.decisions,'Decision log');
 const d={id:uid(),date:clean(data.date||today(),10),decision:clean(data.decision,1300),owner:clean(data.owner,110),
 hypothesis:clean(data.hypothesis,1000),reviewOn:clean(data.reviewOn,10),outcome:clean(data.outcome,1500)};
 p.decisions.push(d);return d;
}
export function removeRecord(p,kind,id){
 if(!['risks','teams','injects','decisions'].includes(kind))return false;
 const length=p[kind].length;p[kind]=p[kind].filter(x=>x.id!==id);return p[kind].length!==length;
}
export function normalizeProject(raw,{regenerate=false}={}){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Invalid decision project.');
 if(raw.version!=null&&raw.version!==VERSION)throw Error('Unsupported project version.');
 for(const [k,max] of Object.entries(LIMIT))if(k!=='projects'&&Array.isArray(raw[k])&&raw[k].length>max)throw Error(k+' exceeds limit.');
 const p=createProject(clean(raw.title,140)||'Imported decision');
 if(!regenerate&&typeof raw.id==='string'&&raw.id.length<120)p.id=raw.id;
 for(const [k,max] of [['question',1400],['objective',1300],['context',1800],['owner',110],['deadline',10]])p[k]=clean(raw[k],max);
 p.status=PHASES.includes(raw.status)?raw.status:'Exploring';
 const criteriaIds=new Map();p.criteria=(Array.isArray(raw.criteria)?raw.criteria:[]).map(c=>{const v=makeCriterion(c.name,c);
  v.id=regenerate?uid():clean(c.id,120)||uid();if(typeof c.id==='string')criteriaIds.set(c.id,v.id);return v;});
 const optionIds=new Map();p.options=(Array.isArray(raw.options)?raw.options:[]).map(o=>{
  const v=makeOption(o.name,o);v.id=regenerate?uid():clean(o.id,120)||uid();if(typeof o.id==='string')optionIds.set(o.id,v.id);
  v.ratings={};for(const c of p.criteria){
   const original=Object.entries(o.ratings||{}).find(([old])=>criteriaIds.get(old)===c.id)?.[1]||{};
   v.ratings[c.id]={score:integer(original.score,1,5,3),tag:TAGS.includes(original.tag)?original.tag:'Assumption',note:clean(original.note,900)};
  }return v;
 });
 const nodeIds=new Map(),rawNodes=Array.isArray(raw.nodes)&&raw.nodes.length?raw.nodes:p.nodes;
 p.nodes=rawNodes.map(n=>{const v=makeNode(TYPES.includes(n.type)?n.type:'outcome',n);v.id=regenerate?uid():clean(n.id,120)||uid();
  if(typeof n.id==='string')nodeIds.set(n.id,v.id);return v;});
 const roots=[];
 p.nodes.forEach((n,i)=>{const src=rawNodes[i];n.parentId=nodeIds.get(src.parentId)||'';if(!n.parentId)roots.push(n)});
 // Malformed/cyclic graph recovery: make a single decision root and attach disconnected nodes as children.
 if(!roots.length){p.nodes[0].parentId='';p.nodes[0].type='decision';roots.push(p.nodes[0]);}
 const root=roots[0];root.type='decision';
 for(const node of p.nodes){
  if(node.id===root.id)continue;
  if(!node.parentId||node.parentId===node.id||isDescendant(p,node.id,node.parentId))node.parentId=root.id;
 }
 for(const node of p.nodes)if(node.type==='outcome'&&p.nodes.some(n=>n.parentId===node.id))node.type='decision';
 p.scenarios=(Array.isArray(raw.scenarios)?raw.scenarios:[]).map(s=>{
  const n=makeScenario(s.title);n.id=regenerate?uid():clean(s.id,120)||uid();n.description=clean(s.description,1000);
  for(const [old,v] of Object.entries(s.weightShifts||{}))if(criteriaIds.has(old))n.weightShifts[criteriaIds.get(old)]=integer(v,0,100);
  for(const [old,table] of Object.entries(s.scoreShifts||{}))if(optionIds.has(old))for(const [oldCriterion,v] of Object.entries(table||{}))if(criteriaIds.has(oldCriterion)){
   const oid=optionIds.get(old);if(!n.scoreShifts[oid])n.scoreShifts[oid]={};n.scoreShifts[oid][criteriaIds.get(oldCriterion)]=integer(v,1,5);
  }
  for(const [old,v] of Object.entries(s.probabilityOverrides||{}))if(nodeIds.has(old))n.probabilityOverrides[nodeIds.get(old)]=integer(v,0,100);
  for(const [old,v] of Object.entries(s.utilityOverrides||{}))if(nodeIds.has(old))n.utilityOverrides[nodeIds.get(old)]=clamp(v,-1000000,1000000);
  return n;
 });
 p.activeScenario=p.scenarios.find(s=>s.id===raw.activeScenario)?.id||'';
 if(regenerate&&raw.activeScenario){const idx=(raw.scenarios||[]).findIndex(s=>s.id===raw.activeScenario);p.activeScenario=p.scenarios[idx]?.id||'';}
 p.risks=(Array.isArray(raw.risks)?raw.risks:[]).map(r=>{const v=makeRisk(r);v.id=regenerate?uid():clean(r.id,120)||uid();return v});
 p.teams=(Array.isArray(raw.teams)?raw.teams:[]).map(r=>{const v=makeTeam(r);v.id=regenerate?uid():clean(r.id,120)||uid();return v});
 p.injects=(Array.isArray(raw.injects)?raw.injects:[]).map(r=>{const v={id:regenerate?uid():clean(r.id,120)||uid(),title:clean(r.title,110),message:clean(r.message,1100),revealed:!!r.revealed,created:clean(r.created,60)};return v});
 p.decisions=(Array.isArray(raw.decisions)?raw.decisions:[]).map(r=>{const v=addDecisionInternal(r);v.id=regenerate?uid():clean(r.id,120)||uid();return v});
 const b=raw.brief||{};
 p.brief={recommendationId:optionIds.get(b.recommendationId)||'',recommendation:clean(b.recommendation,1700),
  dissent:clean(b.dissent,1500),assumptions:clean(b.assumptions,1500),reviewDate:clean(b.reviewDate,10),
  reviewTrigger:clean(b.reviewTrigger,1000),accountable:clean(b.accountable,110),result:clean(b.result,1500)};
 if(!regenerate&&typeof raw.created==='string')p.created=clean(raw.created,60);
 return p;
}
function addDecisionInternal(data){return {id:uid(),date:clean(data.date||today(),10),decision:clean(data.decision,1300),owner:clean(data.owner,110),hypothesis:clean(data.hypothesis,1000),reviewOn:clean(data.reviewOn,10),outcome:clean(data.outcome,1500)}}
export function sampleProject(kind='leadership'){
 const samples={
 leadership:{title:'Virtual leadership training decision',question:'How should we expand live leadership development with limited instructor capacity?',
  objective:'Select a delivery approach balancing quality, reach, capacity, and sustainable support.',
  options:['Scale live virtual cohorts','Build asynchronous modules','Hybrid instructor-supported learning'],
  risks:['Instructor workload exceeds capacity','Learner engagement drops without facilitated practice'],
  inject:'New funding allows temporary instructional support, but the launch date is moved forward.'},
 crisis:{title:'Operations outage response',question:'Which response restores essential services while protecting trust and continuity?',
  objective:'Choose a timely, accountable response with practical contingencies.',
  options:['Restore central service first','Prioritize vulnerable users','Activate distributed manual procedures'],
  risks:['Recovery estimate proves overly optimistic','Communication overload slows coordination'],
  inject:'A critical service dependency fails; recovery estimates double.'},
 ai:{title:'AI workflow implementation choice',question:'How should leaders introduce an AI-assisted process while preserving trust and oversight?',
  objective:'Balance employee trust, adoption, security and measurable value.',
  options:['Pilot with volunteers','Launch organization-wide','Phase implementation by function'],
  risks:['Employees distrust the tool','Incorrect outputs undermine confidence'],
  inject:'A demonstration produces a confident but inaccurate response in front of staff.'}
 };
 const spec=samples[kind];if(!spec)throw Error('Unknown classroom scenario.');
 const p=createProject(spec.title);p.question=spec.question;p.objective=spec.objective;
 p.context='Illustrative teaching scenario. All ratings, probabilities and utilities are hypothetical, not established outcomes.';
 p.owner='Decision facilitator';
 const criteria=[['Effectiveness',35,'Benefit'],['Feasibility',25,'Benefit'],['Stakeholder confidence',20,'Benefit'],['Resource demand',20,'Cost']];
 criteria.forEach(([name,weight,direction])=>addCriterion(p,name,{weight,direction}));
 const grid=[[4,4,4,2],[3,5,2,2],[5,3,5,4]];
 spec.options.forEach((name,i)=>{const o=addOption(p,name);p.criteria.forEach((c,j)=>setRating(p,o.id,c.id,{score:grid[i][j],tag:'Estimate',note:'Illustrative rating for discussion.'}));});
 const root=p.nodes[0];root.title=spec.question.slice(0,180);
 const children=p.options.map((o,i)=>addNode(p,root.id,'chance',{title:o.name,x:465,y:185+i*260}));
 for(const [i,node] of children.entries()){
  addNode(p,node.id,'outcome',{title:'Expected result · '+spec.options[i],x:850,y:node.y-62,probability:65,utility:75-i*8,evidenceTag:'Estimate'});
  addNode(p,node.id,'outcome',{title:'Setback or constraint',x:850,y:node.y+76,probability:35,utility:15-i*3,evidenceTag:'Assumption'});
 }
 spec.risks.forEach(failure=>addRisk(p,{failure,likelihood:4,impact:4,warning:'Monitor early warning signals.',safeguard:'Pilot safeguards and a recovery plan.'}));
 const scenario=addScenario(p,'Unexpected operational pressure');scenario.description=spec.inject;
 p.injects.push({id:uid(),title:'Situation update',message:spec.inject,revealed:false,created:stamp()});
 p.brief.assumptions='Ratings and branch probabilities are examples; seek evidence before making a real decision.';
 p.brief.reviewTrigger='Revisit if a key assumption changes or a pilot produces contradictory evidence.';
 addTeam(p,{name:'Example team',recommendation:'We recommend a pilot with explicit review checkpoints.',evidence:'Compare rating evidence and risk controls.',tradeoffs:'We may accept more work in exchange for higher confidence.'});
 return p;
}
