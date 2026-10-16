/* Change Management Studio: framework-aware, independent pure data model. */
export const VERSION=1;
export const MAX={projects:40,groups:80,milestones:130,communications:160,risks:140,actions:180,pulses:180};
export const ADKAR=[
 {key:'awareness',short:'Awareness',prompt:'Why is the change needed?'},
 {key:'desire',short:'Desire',prompt:'Do people want to take part?'},
 {key:'knowledge',short:'Knowledge',prompt:'Do people know how to change?'},
 {key:'ability',short:'Ability',prompt:'Can they apply the new behavior?'},
 {key:'reinforcement',short:'Reinforcement',prompt:'Will the new approach stick?'}
];
export const KOTTER=[
 {id:1,title:'Create urgency',subtitle:'Build a shared case for action',question:'Why act now?',task:'Explain a compelling need and a worthwhile opportunity.'},
 {id:2,title:'Build a guiding coalition',subtitle:'Connect credible change advocates',question:'Who leads with us?',task:'Recruit trusted sponsors and cross-functional champions.'},
 {id:3,title:'Form a strategic vision',subtitle:'Describe the future and initiatives',question:'Where are we going?',task:'Write a clear, achievable change vision and initiatives.'},
 {id:4,title:'Enlist a volunteer army',subtitle:'Invite broad participation',question:'Who will participate?',task:'Engage supporters who want to contribute.'},
 {id:5,title:'Enable action',subtitle:'Remove barriers to progress',question:'What blocks us?',task:'Remove constraints that prevent people from acting.'},
 {id:6,title:'Generate short-term wins',subtitle:'Prove progress early',question:'What early win matters?',task:'Set, measure and communicate visible early wins.'},
 {id:7,title:'Sustain acceleration',subtitle:'Build on initial progress',question:'How will momentum grow?',task:'Use evidence from wins to scale improvements.'},
 {id:8,title:'Institute change',subtitle:'Embed new practices',question:'How will the change last?',task:'Align systems, measures and reinforcement with new behaviors.'}
];
export const STATUSES=['Not started','In progress','Blocked','Completed'];
export const STANCES=['Champion','Supportive','Neutral','Concerned','Resistant'];
export const RISK_STATUSES=['Open','Mitigating','Closed'];
export const COMM_STATUSES=['Planned','Sent','Completed'];
export const COLORS={good:'#38896e',medium:'#c89d52',risk:'#bf706a'};
export const uid=()=>globalThis.crypto?.randomUUID?.()||'ch-'+Math.random().toString(36).slice(2)+Date.now().toString(36);
export const copy=value=>JSON.parse(JSON.stringify(value));
export const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const string=(v,max=1500)=>String(v??'').slice(0,max);
export const clamp=(v,min,max,fallback=min)=>{const x=Number(v);return Number.isFinite(x)?Math.max(min,Math.min(max,x)):fallback};
export const rating=(v,fall=3)=>Math.round(clamp(v,1,5,fall));
export const dateToday=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')};
export const dateStamp=()=>new Date().toISOString();
export const stageStatus=()=>({status:'Not started',owner:'',due:'',evidence:'',notes:''});
export function createProject(title='Untitled change initiative'){
 return {version:VERSION,id:uid(),title,change:'',why:'',vision:'',scope:'',sponsor:'',owner:'',startDate:'',targetDate:'',
 successDefinition:'',stageData:Object.fromEntries(KOTTER.map(k=>[k.id,stageStatus()])),
 groups:[],milestones:[],communications:[],risks:[],actions:[],pulses:[],created:dateStamp(),updated:dateStamp()};
}
const checkLimit=(array,limit,label)=>{if(array.length>=limit)throw Error(label+' limit reached. Export or archive another item.')};
export function setStage(project,id,updates={}){
 if(!KOTTER.some(s=>s.id===Number(id)))throw Error('Unknown Kotter stage.');
 const s=project.stageData[id]||(project.stageData[id]=stageStatus());
 if(updates.status!==undefined&&STATUSES.includes(updates.status))s.status=updates.status;
 for(const [k,n] of [['owner',100],['due',10],['evidence',1300],['notes',1600]])if(updates[k]!==undefined)s[k]=string(updates[k],n);
 return s;
}
export function makeGroup(name,data={}){
 const adkar=Object.fromEntries(ADKAR.map(a=>[a.key,rating(data.adkar?.[a.key],3)]));
 return {id:uid(),name:string(name||'New stakeholder group',110),role:string(data.role,120),
 stance:STANCES.includes(data.stance)?data.stance:'Neutral',impact:rating(data.impact,3),influence:rating(data.influence,3),
 owner:string(data.owner,110),concerns:string(data.concerns,1000),engagement:string(data.engagement,1100),evidence:string(data.evidence,1000),adkar};
}
export function addGroup(project,data={}){
 checkLimit(project.groups,MAX.groups,'Stakeholder');
 const g=makeGroup(data.name,data);project.groups.push(g);return g;
}
export function changeGroup(project,id,updates){
 const g=project.groups.find(g=>g.id===id);if(!g)return false;
 for(const [key,n] of [['name',110],['role',120],['owner',110],['concerns',1000],['engagement',1100],['evidence',1000]]){
  if(updates[key]!==undefined)g[key]=string(updates[key],n);
 }
 if(updates.stance!==undefined&&STANCES.includes(updates.stance))g.stance=updates.stance;
 for(const k of ['impact','influence'])if(updates[k]!==undefined)g[k]=rating(updates[k],g[k]);
 if(updates.adkar)for(const a of ADKAR)if(updates.adkar[a.key]!==undefined)g.adkar[a.key]=rating(updates.adkar[a.key],g.adkar[a.key]);
 return true;
}
export function earliestADKARBarrier(group,threshold=3){
 const found=ADKAR.find(a=>Number(group.adkar?.[a.key]||0)<threshold);
 return found?.key||null;
}
export function readiness(project){
 if(!project.groups.length)return {overall:null,dimensions:Object.fromEntries(ADKAR.map(a=>[a.key,null])),barriers:[],assessed:0};
 const dimensions=Object.fromEntries(ADKAR.map(a=>[a.key,Math.round(100*project.groups.reduce((s,g)=>s+g.adkar[a.key],0)/project.groups.length)/100]));
 const overall=Math.round(100*Object.values(dimensions).reduce((a,b)=>a+b,0)/ADKAR.length)/100;
 const barriers=project.groups.map(g=>({id:g.id,name:g.name,barrier:earliestADKARBarrier(g),readiness:Math.round(100*ADKAR.reduce((s,a)=>s+g.adkar[a.key],0)/5)/100}))
  .filter(x=>x.barrier);
 return {overall,dimensions,barriers,assessed:project.groups.length};
}
export function moveGroupQuadrant(project,id,impact,influence){
 return changeGroup(project,id,{impact:rating(impact),influence:rating(influence)});
}
export function makeMilestone(data={}){
 return {id:uid(),title:string(data.title||'New milestone',170),stage:Math.round(clamp(data.stage,1,8,1)),owner:string(data.owner,110),
 due:string(data.due,10),status:STATUSES.includes(data.status)?data.status:'Not started',
 result:string(data.result,1100),measure:string(data.measure,250),notes:string(data.notes,1100)};
}
export function addMilestone(project,data={}){
 checkLimit(project.milestones,MAX.milestones,'Milestone');const m=makeMilestone(data);project.milestones.push(m);return m;
}
export function updateMilestone(project,id,data={}){
 const old=project.milestones.find(m=>m.id===id);if(!old)return false;
 const next=makeMilestone({...old,...data});Object.assign(old,{...next,id:old.id});return true;
}
export function makeCommunication(data={}){
 return {id:uid(),audienceId:projectSafeId(data.audienceId),channel:string(data.channel||'Team briefing',90),message:string(data.message||'',1200),
 owner:string(data.owner,110),due:string(data.due,10),frequency:string(data.frequency,80),
 status:COMM_STATUSES.includes(data.status)?data.status:'Planned',
 result:string(data.result,750)};
}
const projectSafeId=v=>string(v,120);
export function addCommunication(project,data={}){
 checkLimit(project.communications,MAX.communications,'Communication');const c=makeCommunication(data);
 if(!project.groups.some(g=>g.id===c.audienceId))c.audienceId='';project.communications.push(c);return c;
}
export function makeRisk(data={}){
 return {id:uid(),title:string(data.title||'New change risk or resistance',210),groupId:projectSafeId(data.groupId),
 likelihood:rating(data.likelihood),impact:rating(data.impact),response:string(data.response,1250),
 owner:string(data.owner,110),due:string(data.due,10),status:RISK_STATUSES.includes(data.status)?data.status:'Open',
 evidence:string(data.evidence,950)};
}
export function addRisk(project,data={}){
 checkLimit(project.risks,MAX.risks,'Risk');const r=makeRisk(data);
 if(!project.groups.some(g=>g.id===r.groupId))r.groupId='';project.risks.push(r);return r;
}
export const riskScore=r=>rating(r.likelihood)*rating(r.impact);
export function makeAction(data={}){
 return {id:uid(),title:string(data.title||'New action',210),stage:Math.round(clamp(data.stage,1,8,1)),
 owner:string(data.owner,110),due:string(data.due,10),status:STATUSES.includes(data.status)?data.status:'Not started',
 successMeasure:string(data.successMeasure,250),result:string(data.result,1000),relatedGroupId:projectSafeId(data.relatedGroupId)};
}
export function addAction(project,data={}){
 checkLimit(project.actions,MAX.actions,'Action');const a=makeAction(data);
 if(!project.groups.some(g=>g.id===a.relatedGroupId))a.relatedGroupId='';project.actions.push(a);return a;
}
export function makePulse(data={}){
 return {id:uid(),date:string(data.date||dateToday(),10),adoption:Math.round(clamp(data.adoption,0,100,0)),
 trained:Math.round(clamp(data.trained,0,100,0)),confidence:Math.round(clamp(data.confidence,0,100,0)),
 notes:string(data.notes,850)};
}
export function addPulse(project,data={}){
 checkLimit(project.pulses,MAX.pulses,'Pulse');const p=makePulse(data);project.pulses.push(p);return p;
}
export function removeRecord(project,kind,id){
 const fields=['groups','milestones','communications','risks','actions','pulses'];
 if(!fields.includes(kind))throw Error('Invalid record type.');
 const initial=project[kind].length;
 project[kind]=project[kind].filter(x=>x.id!==id);
 if(initial===project[kind].length)return false;
 if(kind==='groups'){
  project.communications.forEach(x=>{if(x.audienceId===id)x.audienceId=''});
  project.risks.forEach(x=>{if(x.groupId===id)x.groupId=''});
  project.actions.forEach(x=>{if(x.relatedGroupId===id)x.relatedGroupId=''});
 }
 return true;
}
export function latestPulse(project){
 if(!project.pulses.length)return null;
 return [...project.pulses].sort((a,b)=>b.date.localeCompare(a.date)||b.id.localeCompare(a.id))[0];
}
export function metrics(project){
 const counts=Object.fromEntries(STATUSES.map(s=>[s,0]));
 KOTTER.forEach(k=>{counts[project.stageData[k.id]?.status||'Not started']++});
 const stageProgress=Math.round(100*(counts.Completed+counts['In progress']*.5)/KOTTER.length);
 const latest=latestPulse(project),r=readiness(project);
 const riskOpen=project.risks.filter(x=>x.status!=='Closed');
 const critical=riskOpen.filter(x=>riskScore(x)>=15);
 const today=dateToday();
 return {stageProgress,completedStages:counts.Completed,blockedStages:counts.Blocked,stageCount:KOTTER.length,
  milestonesDone:project.milestones.filter(m=>m.status==='Completed').length,milestoneCount:project.milestones.length,
  overdue:project.milestones.filter(m=>m.status!=='Completed'&&m.due&&m.due<today).length+
    project.actions.filter(a=>a.status!=='Completed'&&a.due&&a.due<today).length,
  stakeholders:project.groups.length,readiness:r,latest,
  highRisks:critical.length,openRisks:riskOpen.length,actions:project.actions.length,comms:project.communications.length};
}
export function signals(project){
 const m=metrics(project),out=[];
 if(!project.change.trim()||!project.vision.trim())out.push({kind:'planning',message:'Define the change and a compelling future vision.'});
 if(project.groups.length===0)out.push({kind:'people',message:'Identify the people affected and assess their readiness.'});
 if(m.readiness.barriers.length)out.push({kind:'adkar',message:m.readiness.barriers.length+' stakeholder group(s) have an early ADKAR barrier to address.'});
 if(m.highRisks)out.push({kind:'risk',message:m.highRisks+' high-scoring open change risk(s) need attention.'});
 if(m.overdue)out.push({kind:'delivery',message:m.overdue+' milestones or action items are past their target date.'});
 if(project.pulses.length===0)out.push({kind:'outcomes',message:'Record an adoption measurement to compare planned work with real change.'});
 return out;
}
export function pulseSeries(project){
 return [...project.pulses].sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
}
const schemaFns={groups:makeGroup,milestones:makeMilestone,communications:makeCommunication,risks:makeRisk,actions:makeAction,pulses:makePulse};
export function normalizeProject(raw,{regenerate=false}={}){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Invalid change management project.');
 if(raw.version!=null&&raw.version!==VERSION)throw Error('Unsupported project version.');
 for(const [k,max] of Object.entries(MAX))if(k!=='projects'&&(raw[k]||[]).length>max)throw Error('Imported '+k+' exceed supported limits.');
 const p=createProject(string(raw.title,130)||'Imported change initiative');
 if(!regenerate&&typeof raw.id==='string'&&raw.id.length<130)p.id=raw.id;
 for(const [k,max] of [['change',1300],['why',1300],['vision',1300],['scope',1300],['sponsor',110],['owner',110],['startDate',10],['targetDate',10],['successDefinition',1250]])
  p[k]=string(raw[k],max);
 for(const k of KOTTER) {
  const source=raw.stageData?.[k.id]||{};
  setStage(p,k.id,source);
 }
 const groups=new Map();
 p.groups=(Array.isArray(raw.groups)?raw.groups:[]).map(g=>{
  const n=makeGroup(g.name,g);n.id=regenerate?uid():string(g.id,120)||uid();
  if(typeof g.id==='string'&&!groups.has(g.id))groups.set(g.id,n.id);
  return n;
 });
 const rel=key=>groups.get(key)||'';
 p.milestones=(Array.isArray(raw.milestones)?raw.milestones:[]).map(v=>{
  const n=makeMilestone(v);n.id=regenerate?uid():string(v.id,120)||uid();return n;
 });
 p.communications=(Array.isArray(raw.communications)?raw.communications:[]).map(v=>{
  const n=makeCommunication(v);n.id=regenerate?uid():string(v.id,120)||uid();n.audienceId=rel(v.audienceId);return n;
 });
 p.risks=(Array.isArray(raw.risks)?raw.risks:[]).map(v=>{
  const n=makeRisk(v);n.id=regenerate?uid():string(v.id,120)||uid();n.groupId=rel(v.groupId);return n;
 });
 p.actions=(Array.isArray(raw.actions)?raw.actions:[]).map(v=>{
  const n=makeAction(v);n.id=regenerate?uid():string(v.id,120)||uid();n.relatedGroupId=rel(v.relatedGroupId);return n;
 });
 p.pulses=(Array.isArray(raw.pulses)?raw.pulses:[]).map(v=>{
  const n=makePulse(v);n.id=regenerate?uid():string(v.id,120)||uid();return n;
 });
 if(!regenerate&&typeof raw.created==='string')p.created=string(raw.created,60);
 return p;
}
export function importStakeholders(project,source){
 const nodes=Array.isArray(source?.nodes)?source.nodes:[];
 let added=0,skipped=0;
 for(const node of nodes){
  const name=string(node.label,110).trim();
  if(!name||project.groups.some(g=>g.name.toLowerCase()===name.toLowerCase())){skipped++;continue;}
  if(project.groups.length>=MAX.groups)break;
  const approach=string(node.approach,1100);
  addGroup(project,{name,role:node.role||node.group,stance:STANCES.includes(node.stance)?node.stance:'Neutral',
   concerns:node.notes||'',engagement:approach,impact:node.y<380?5:2,influence:node.x>600?5:2});
  added++;
 }
 return {added,skipped};
}
export function importResistingForces(project,source){
 const forces=Array.isArray(source?.forces)?source.forces.filter(f=>f.side==='restraining'):[];
 let added=0,skipped=0;
 for(const f of forces){
  const title=string(f.label,210).trim();
  if(!title||project.risks.some(r=>r.title.toLowerCase()===title.toLowerCase())){skipped++;continue;}
  if(project.risks.length>=MAX.risks)break;
  const group=project.groups.find(g=>g.name.toLowerCase()===(f.stakeholder||'').toLowerCase());
  addRisk(project,{title,groupId:group?.id,likelihood:rating(f.strength),impact:rating(f.strength),
   response:'Investigate this restraining force and test an intervention.',evidence:f.evidence||'',owner:''});
  added++;
 }
 return {added,skipped};
}
export function exampleProject(kind){
 const map={
  virtual:{title:'Virtual leadership learning transformation',change:'Transition leadership training to flexible, facilitated virtual learning.',
   why:'Reach distributed learners without sacrificing live discussion or practical application.',
   vision:'Accessible, high-quality leadership learning that builds capability through practice.',
   successDefinition:'At least 85% adoption and 90% completion in the pilot.',
   groups:[['Instructors','Deliver live instruction','Supportive',[5,4,4,3,2]],['Learners','Participate in courses','Neutral',[4,3,3,3,2]],['Training managers','Sponsor and resource delivery','Champion',[5,5,4,4,3]],['Technology support','Support virtual platforms','Concerned',[4,3,4,3,3]]],
   milestone:'Pilot three virtual leadership modules',risk:'Instructor preparation time may be insufficient',message:'What will change, why, and how to access virtual classes.'},
  ai:{title:'Responsible AI adoption',change:'Introduce an AI-assisted workflow with appropriate human oversight.',
   why:'Reduce repetitive effort while preserving accountability, accuracy and employee confidence.',
   vision:'Employees use AI thoughtfully and confidently while retaining ownership of decisions.',
   successDefinition:'80% of pilot users demonstrate the new process with documented oversight.',
   groups:[['Frontline employees','Use the new workflow','Concerned',[4,2,2,2,1]],['Supervisors','Coach adoption and review output','Neutral',[4,3,3,2,2]],['IT and security','Protect information and provide support','Supportive',[5,4,4,3,2]],['Senior sponsors','Set expectations and resources','Champion',[5,5,4,4,3]]],
   milestone:'Launch supervised AI pilot',risk:'Employees may distrust opaque or inconsistent AI outputs',message:'Where AI helps, how oversight works, and what will not change.'},
  operations:{title:'Service delivery improvement',change:'Streamline requests and reduce first-response delays.',
   why:'Current handoffs make service slower and less predictable.',
   vision:'A clear, responsive service process supported by a confident team.',
   successDefinition:'Reduce response time by 25% over the pilot.',
   groups:[['Service team','Handle requests','Concerned',[4,3,3,3,2]],['Supervisors','Coordinate workflows','Supportive',[5,4,4,3,3]],['Customers','Receive consistent service','Neutral',[3,4,2,2,1]],['Systems team','Improve intake and routing','Supportive',[5,4,4,3,2]]],
   milestone:'Pilot an improved intake workflow',risk:'Peak demand could overwhelm the pilot',message:'What is changing in the service process and who is responsible.'}
 };
 const x=map[kind];if(!x)throw Error('Unknown change management example.');
 const p=createProject(x.title);p.change=x.change;p.why=x.why;p.vision=x.vision;
 p.scope='Illustrative classroom scenario. Ratings and outcomes are fictional and require validation.';
 p.successDefinition=x.successDefinition;p.owner='Change lead';
 x.groups.forEach(([name,role,stance,levels],i)=>addGroup(p,{name,role,stance,impact:4,influence:i%2?3:5,
  adkar:Object.fromEntries(ADKAR.map((v,j)=>[v.key,levels[j]])),engagement:'Ask for feedback and address their adoption barriers.'}));
 setStage(p,1,{status:'Completed',evidence:'Example: case for change drafted.'});
 setStage(p,2,{status:'In progress',notes:'Identify credible advocates representing impacted groups.'});
 const ms=addMilestone(p,{title:x.milestone,stage:6,status:'Not started',owner:'Pilot lead',measure:x.successDefinition});
 addCommunication(p,{audienceId:p.groups[0].id,channel:'Live briefing',message:x.message,owner:'Change sponsor',frequency:'Weekly'});
 addRisk(p,{title:x.risk,groupId:p.groups[0].id,likelihood:4,impact:4,owner:'Program manager',response:'Test a small pilot and gather feedback before scaling.'});
 addAction(p,{title:'Conduct discovery conversations with impacted groups',stage:2,owner:'Change lead',relatedGroupId:p.groups[0].id,successMeasure:'Document top adoption concerns'});
 addAction(p,{title:'Design and evaluate a small-scale pilot',stage:6,owner:'Pilot lead',successMeasure:ms.measure});
 addPulse(p,{date:dateToday(),adoption:25,trained:40,confidence:35,notes:'Illustrative baseline only; replace with observed data.'});
 return p;
}
