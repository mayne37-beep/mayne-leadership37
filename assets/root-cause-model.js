/* Root Cause Analysis Studio: shareable data model and analytical calculations. */
export const VERSION=1;
export const LIMITS={cases:45,causes:220,evidence:260,pareto:120,solutions:120};
export const DEFAULT_CATEGORIES=[
 {id:'people',name:'People'}, {id:'process',name:'Process'},
 {id:'policy',name:'Policies'}, {id:'technology',name:'Technology'},
 {id:'environment',name:'Environment'}, {id:'resources',name:'Resources'}
];
export const STAGES=[
 {id:'define',title:'Define the problem',prompt:'What is happening, how often, and who is affected? Distinguish a measurable problem from a proposed fix.'},
 {id:'explore',title:'Explore possible causes',prompt:'Which conditions could contribute? Ask why, investigate multiple pathways, and resist premature conclusions.'},
 {id:'structure',title:'Map the system',prompt:'How do the contributing factors connect? Group them in a fishbone or cause tree.'},
 {id:'validate',title:'Test assumptions',prompt:'What evidence supports or contradicts each suspected cause? What remains uncertain?'},
 {id:'prioritize',title:'Prioritize with data',prompt:'Which recurring problems account for the greatest observed frequency? Remember that frequency alone does not prove a cause.'},
 {id:'respond',title:'Design interventions',prompt:'Which causes could an intervention address? How will you monitor impact and unintended consequences?'},
 {id:'review',title:'Evaluate results',prompt:'When will you review whether the solution worked? What would make you change course?'}
];
export const uid=()=>globalThis.crypto?.randomUUID?.()||'id-'+Math.random().toString(36).slice(2)+Date.now().toString(36);
export const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const copy=value=>JSON.parse(JSON.stringify(value));
export function today(){const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')}
const txt=(v,n=1200)=>String(v??'').slice(0,n);
const opt=(v,values,fallback)=>values.includes(v)?v:fallback;
const clamp=(n,lo,hi)=>Math.max(lo,Math.min(hi,Number.isFinite(Number(n))?Number(n):lo));
export const dollars=n=>Number(n).toLocaleString();
export function blankCase(title='Untitled investigation'){
 return {schemaVersion:VERSION,id:uid(),title,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),stage:'define',status:'Investigating',
 problem:'',where:'',when:'',frequency:'',impact:'',boundary:'',goal:'',owner:'',nextReview:'',summary:'',assumptions:'',
 categories:copy(DEFAULT_CATEGORIES),causes:[],evidence:[],pareto:[],solutions:[],observations:[]};
}
export function addCause(c,{text='',parentId='',category='process',notes='',status='Hypothesis',root=false}={}){
 if(c.causes.length>=LIMITS.causes)throw Error('Cause limit reached. Export or simplify the investigation.');
 if(parentId&&!c.causes.some(x=>x.id===parentId))throw Error('The parent cause no longer exists.');
 const item={id:uid(),text:txt(text,220),parentId,category:c.categories.some(x=>x.id===category)?category:c.categories[0].id,notes:txt(notes,2200),status:opt(status,['Hypothesis','Supported','Refuted'],'Hypothesis'),root:!!root};
 c.causes.push(item);return item;
}
export function removeCause(c,id){
 const gone=new Set([id]);let change=true;
 while(change){change=false;for(const x of c.causes){if(x.parentId&&gone.has(x.parentId)&&!gone.has(x.id)){gone.add(x.id);change=true;}}}
 c.causes=c.causes.filter(x=>!gone.has(x.id));c.evidence=c.evidence.filter(x=>!gone.has(x.causeId));c.solutions.forEach(x=>x.causeIds=x.causeIds.filter(y=>!gone.has(y)));return gone.size;
}
export function depth(c,id){
 const byId=new Map(c.causes.map(x=>[x.id,x]));const visited=new Set();let d=0,cur=byId.get(id);
 while(cur?.parentId&&byId.has(cur.parentId)&&!visited.has(cur.parentId)){visited.add(cur.parentId);d++;cur=byId.get(cur.parentId);if(d>LIMITS.causes)break;}return d;
}
export function isDescendant(c,parentId,possibleChildId){
 if(!parentId||!possibleChildId)return false;
 let id=possibleChildId;const visited=new Set();
 while(id&&!visited.has(id)){if(id===parentId)return true;visited.add(id);id=c.causes.find(x=>x.id===id)?.parentId||'';}
 return false;
}
export function paretoAnalysis(items){
 const sorted=(items||[]).map(x=>({...x,count:Math.max(0,Math.min(1e8,Math.floor(Number(x.count)||0)))}))
 .sort((a,b)=>b.count-a.count||String(a.label).localeCompare(String(b.label)));
 const total=sorted.reduce((s,x)=>s+x.count,0);let running=0;
 const rows=sorted.map(x=>{running+=x.count;return {...x,share:total?x.count/total:0,cumulative:total?running/total:0}});
 const threshold=total?rows.findIndex(x=>x.cumulative>=.8):-1;
 return {rows,total,threshold,topCount:threshold<0?0:threshold+1,leadingShare:total?rows[0]?.share||0:0};
}
export function analysis(c){
 const causes=c.causes||[],evidence=c.evidence||[],sol=c.solutions||[];
 const viable=causes.filter(x=>x.status!=='Refuted');
 const roots=viable.filter(x=>x.root);
 const supported=viable.filter(x=>x.status==='Supported');
 const evidenced=new Set(evidence.map(x=>x.causeId).filter(Boolean));
 const maxDepth=causes.reduce((n,x)=>Math.max(n,depth(c,x.id)),0);
 const overdue=sol.filter(x=>x.status!=='Completed'&&x.due&&x.due<today());
 const accepted=sol.filter(x=>x.status==='Completed');
 const confidence=sol.filter(x=>x.status!=='Completed'&&x.status!=='Cancelled').map(x=>({...x,score:+((x.impact*x.confidence)/Math.max(1,x.effort)).toFixed(2)})).sort((a,b)=>b.score-a.score);
 const p=paretoAnalysis(c.pareto);
 const warnings=[];
 if(!c.problem.trim())warnings.push('Define an observable problem before drawing conclusions.');
 if(!causes.length)warnings.push('List multiple possible causes instead of selecting a solution first.');
 if(roots.length&&!evidence.length)warnings.push('Root-cause candidates are unverified; collect evidence.');
 if(causes.length&&supported.length===0)warnings.push('No causes have yet been marked supported by evidence.');
 if(p.total===0)warnings.push('Pareto analysis has no observed frequency data.');
 if(overdue.length)warnings.push(overdue.length+' action(s) are past their target dates.');
 return {causeCount:causes.length,rootCount:roots.length,supportedCount:supported.length,evidenceCount:evidence.length,evidencedCount:evidenced.size,deepestChain:maxDepth+1,actions:sol.length,done:accepted.length,overdue:overdue.length,ranking:confidence,pareto:p,warnings};
}
export function normalizeCase(raw,{regenerate=false}={}){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Invalid investigation file.');
 if(raw.schemaVersion!==undefined&&Number(raw.schemaVersion)!==VERSION)throw Error('Unsupported investigation version.');
 const fresh=blankCase(txt(raw.title,120)||'Imported investigation');
 if(!regenerate&&typeof raw.id==='string'&&raw.id.length<120)fresh.id=raw.id;
 for(const key of ['problem','where','when','frequency','impact','boundary','goal','owner','nextReview','summary','assumptions','status','stage']){
   fresh[key]=txt(raw[key],key==='summary'||key==='assumptions'?7000:2200);
 }
 fresh.stage=opt(fresh.stage,STAGES.map(x=>x.id),'define');
 fresh.status=opt(fresh.status,['Investigating','Action planned','Monitoring','Closed'],'Investigating');
 if(!regenerate&&typeof raw.createdAt==='string')fresh.createdAt=txt(raw.createdAt,50);
 const categories=Array.isArray(raw.categories)?raw.categories:DEFAULT_CATEGORIES;
 fresh.categories=categories.slice(0,12).map((x,i)=>({id:txt(x.id,70)||'cat'+i,name:txt(x.name,70)||'Category '+(i+1)}));
 if(!fresh.categories.length)fresh.categories=copy(DEFAULT_CATEGORIES);
 const ids=new Map(),used=new Set(),incoming=Array.isArray(raw.causes)?raw.causes:[];
 if(incoming.length>LIMITS.causes)throw Error('The investigation has too many causes.');
 fresh.causes=incoming.map(x=>{const old=txt(x.id,120),id=!regenerate&&old&&!used.has(old)?old:uid();used.add(id);if(old)ids.set(old,id);return {id,text:txt(x.text,220),parentId:txt(x.parentId,120),category:fresh.categories.some(c=>c.id===x.category)?x.category:fresh.categories[0].id,notes:txt(x.notes,2200),status:opt(x.status,['Hypothesis','Supported','Refuted'],'Hypothesis'),root:!!x.root}});
 fresh.causes.forEach(x=>x.parentId=ids.get(x.parentId)||'');
 for(const cause of fresh.causes){if(isDescendant(fresh.causes.length?fresh:{causes:[]},cause.id,cause.parentId))cause.parentId='';}
 const evidence=Array.isArray(raw.evidence)?raw.evidence:[];
 if(evidence.length>LIMITS.evidence)throw Error('The investigation has too many evidence records.');
 fresh.evidence=evidence.map(x=>({id:regenerate?uid():txt(x.id,100)||uid(),causeId:ids.get(txt(x.causeId,120))||'',type:opt(x.type,['Observation','Record','Interview','Data','Other'],'Observation'),stance:opt(x.stance,['Supports','Contradicts','Unclear'],'Unclear'),finding:txt(x.finding,2400),source:txt(x.source,800),date:txt(x.date,10)||today()}));
 const pareto=Array.isArray(raw.pareto)?raw.pareto:[];
 if(pareto.length>LIMITS.pareto)throw Error('The investigation has too many Pareto entries.');
 fresh.pareto=pareto.map(x=>({id:regenerate?uid():txt(x.id,100)||uid(),label:txt(x.label,160),count:clamp(x.count,0,1e8),sample:!!x.sample}));
 const solutions=Array.isArray(raw.solutions)?raw.solutions:[];
 if(solutions.length>LIMITS.solutions)throw Error('The investigation has too many interventions.');
 fresh.solutions=solutions.map(x=>({id:regenerate?uid():txt(x.id,100)||uid(),title:txt(x.title,200),causeIds:(Array.isArray(x.causeIds)?x.causeIds:[]).slice(0,20).map(id=>ids.get(txt(id,120))).filter(Boolean),owner:txt(x.owner,120),due:txt(x.due,10),impact:clamp(x.impact,1,5),effort:clamp(x.effort,1,5),confidence:clamp(x.confidence,1,5),status:opt(x.status,['Proposed','In progress','Completed','Cancelled'],'Proposed'),measure:txt(x.measure,400),baseline:txt(x.baseline,200),target:txt(x.target,200),result:txt(x.result,2000)}));
 fresh.observations=(Array.isArray(raw.observations)?raw.observations:[]).slice(0,50).map(x=>({id:regenerate?uid():txt(x.id,100)||uid(),date:txt(x.date,10)||today(),note:txt(x.note,2500)}));
 return fresh;
}
function templateCase(title,problem,categoryItems,paretoItems){
 const c=blankCase(title);c.problem=problem;c.where='Illustrative organizational scenario';c.stage='explore';c.status='Investigating';
 const roots=[];
 for(const [category,claims] of categoryItems){const parent=addCause(c,{category,text:claims[0]});roots.push(parent);for(const s of claims.slice(1))addCause(c,{category,text:s,parentId:parent.id});}
 c.pareto=paretoItems.map(([label,count])=>({id:uid(),label,count,sample:true}));c.summary='Training example. Counts are invented for demonstration and must not be presented as observed organizational data.';return c;
}
export function template(id){
 if(id==='training')return templateCase('Training backlog investigation','Course delivery is taking longer than planned, creating a growing training backlog.',[
 ['people',['Instructor capacity may be insufficient','Instructor availability fluctuates']],
 ['process',['Review and approval steps may take too long','Scheduling decisions may be delayed']],
 ['policy',['Approval policy may create bottlenecks']],
 ['technology',['Registration data may be fragmented']],
 ['environment',['Student demand may fluctuate seasonally']],
 ['resources',['Classroom availability may constrain delivery']]], [['Scheduling conflicts',34],['Delayed approvals',25],['Instructor shortages',18],['Room conflicts',10],['Other',6]]);
 if(id==='engagement')return templateCase('Employee engagement investigation','Participation in voluntary team initiatives has declined over the last quarter.',[
 ['people',['Employees may have competing priorities','Staff may feel their feedback is not heard']],
 ['process',['Follow-up after meetings may be inconsistent']],
 ['policy',['Decision rights may be unclear']],
 ['technology',['Communication channels may be fragmented']],
 ['environment',['Workload changes may reduce participation']],
 ['resources',['Time for collaboration may be limited']]], [['Schedule pressure',27],['Unclear priorities',19],['Communication gaps',15],['Other',8]]);
 if(id==='service')return templateCase('Service delay investigation','A service team is missing its target response time more often than expected.',[
 ['people',['Team coverage may be uneven']],
 ['process',['Requests may be reworked multiple times','Handoffs may lack necessary details']],
 ['policy',['Escalation thresholds may be unclear']],
 ['technology',['Tracking tools may not show bottlenecks']],
 ['environment',['Unexpected surges may increase demand']],
 ['resources',['Available capacity may not match demand']]], [['Rework',38],['Handoff problems',23],['Demand spikes',16],['Technology issues',9],['Other',5]]);
 throw Error('Unknown scenario template.');
}
