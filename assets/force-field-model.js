/* Force Field Analysis Studio — pure model, no DOM/dependencies. */
export const VERSION=1,MAX={projects:40,forces:100,scenarios:35,actions:180,teams:25};
export const SIDES={driving:'Driving',restraining:'Restraining'};
export const COLORS=[
 {id:'blue',fill:'#e5f2fe',border:'#4d8dbb',text:'#204f77'},
 {id:'gold',fill:'#fff1d5',border:'#c79a49',text:'#76511e'},
 {id:'mint',fill:'#e0f5e9',border:'#52a185',text:'#205b4b'},
 {id:'coral',fill:'#ffebe6',border:'#cc806f',text:'#753d35'},
 {id:'violet',fill:'#eee9ff',border:'#9075bf',text:'#554072'},
 {id:'teal',fill:'#def4f5',border:'#61a3ad',text:'#225f69'},
 {id:'rose',fill:'#ffe7f0',border:'#c57c9c',text:'#743f5b'},
 {id:'slate',fill:'#eaf0f5',border:'#8399af',text:'#40576b'}
];
export const uid=()=>globalThis.crypto?.randomUUID?.()||'ff-'+Date.now().toString(36)+Math.random().toString(36).slice(2,10);
export const copy=v=>JSON.parse(JSON.stringify(v));
export const escapeHTML=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[ch]));
export const bound=(value,min,max,fallback=min)=>{const n=Number(value);return Number.isFinite(n)?Math.max(min,Math.min(max,n)):fallback};
export const whole=(value,min,max,fallback=min)=>Math.round(bound(value,min,max,fallback));
const str=(x,max=2000)=>String(x??'').slice(0,max);
const iso=()=>new Date().toISOString();
export const today=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')};
export function createProject(title='Untitled change initiative'){
 return {version:VERSION,id:uid(),title,change:'',context:'',goal:'',owner:'',reviewDate:'',forces:[],scenarios:[],actions:[],teams:[],
 activeScenario:'',exercise:{title:'Change Strategy Challenge',instructions:'Recommend changes to forces, justify your choices with evidence, and explain trade-offs.',duration:900},
 created:iso(),updated:iso()};
}
export function makeForce(label,side='driving',options={}){
 if(!SIDES[side])throw Error('Choose a driving or restraining force.');
 return {id:uid(),label:str(label||'New force',160),side,strength:whole(options.strength,1,5,3),
 color:COLORS.some(c=>c.id===options.color)?options.color:(side==='driving'?'blue':'coral'),
 y:bound(options.y,10,90,45),group:str(options.group,85),stakeholder:str(options.stakeholder,120),
 stakeholderInterest:str(options.stakeholderInterest,500),evidence:str(options.evidence,1800),
 confidence:whole(options.confidence,1,5,3),notes:str(options.notes,1800)};
}
export function addForce(project,side,label,options={}){
 if(project.forces.length>=MAX.forces)throw Error('Maximum of '+MAX.forces+' forces per project.');
 const f=makeForce(label,side,options);project.forces.push(f);return f;
}
export function updateForce(project,id,changes){
 const f=project.forces.find(f=>f.id===id);if(!f)return false;
 if(changes.side&&SIDES[changes.side])f.side=changes.side;
 if(changes.label!==undefined)f.label=str(changes.label,160);
 if(changes.strength!==undefined)f.strength=whole(changes.strength,1,5,f.strength);
 if(changes.y!==undefined)f.y=bound(changes.y,10,90,f.y);
 if(changes.color!==undefined&&COLORS.some(c=>c.id===changes.color))f.color=changes.color;
 if(changes.group!==undefined)f.group=str(changes.group,85);
 if(changes.stakeholder!==undefined)f.stakeholder=str(changes.stakeholder,120);
 if(changes.stakeholderInterest!==undefined)f.stakeholderInterest=str(changes.stakeholderInterest,500);
 if(changes.evidence!==undefined)f.evidence=str(changes.evidence,1800);
 if(changes.notes!==undefined)f.notes=str(changes.notes,1800);
 if(changes.confidence!==undefined)f.confidence=whole(changes.confidence,1,5,f.confidence);
 return true;
}
export function removeForce(project,id){
 if(!project.forces.some(f=>f.id===id))return false;
 project.forces=project.forces.filter(f=>f.id!==id);
 project.actions.forEach(a=>{if(a.forceId===id)a.forceId=''});
 project.scenarios.forEach(s=>delete s.shifts[id]);
 return true;
}
export function addScenario(project,title='New what-if scenario'){
 if(project.scenarios.length>=MAX.scenarios)throw Error('Scenario limit reached.');
 const scenario={id:uid(),title:str(title,130),description:'',shifts:{},created:iso()};
 project.scenarios.push(scenario);return scenario;
}
export function scenarioFor(project,id=project.activeScenario){return project.scenarios.find(s=>s.id===id)||null;}
export function setScenarioShift(project,scenarioId,forceId,strength){
 const s=scenarioFor(project,scenarioId),f=project.forces.find(f=>f.id===forceId);
 if(!s||!f)return false;
 // Store the *target strength* 0..5, never overwrite the baseline force.
 const next=whole(strength,0,5,f.strength);
 if(next===f.strength)delete s.shifts[forceId];else s.shifts[forceId]=next;
 return true;
}
export function effectiveStrength(f,scenario){return scenario&&Object.prototype.hasOwnProperty.call(scenario.shifts||{},f.id)?whole(scenario.shifts[f.id],0,5,f.strength):f.strength;}
export function calculateBalance(project,scenario=null){
 let driving=0,restraining=0;
 const forces=project.forces.map(f=>{
  const effective=effectiveStrength(f,scenario),changed=effective!==f.strength;
  if(f.side==='driving')driving+=effective;else restraining+=effective;
  return {...f,effective,changed};
 });
 const net=driving-restraining,scale=Math.max(1,driving+restraining);
 return {driving,restraining,net,total:driving+restraining,position:bound(50+net/scale*40,10,90,50),
  verdict:net>0?'Driving forces stronger':net<0?'Restraining forces stronger':'Forces balanced',
  forces,drivingCount:forces.filter(f=>f.side==='driving').length,restrainingCount:forces.filter(f=>f.side==='restraining').length};
}
export function addAction(project,record={}){
 if(project.actions.length>=MAX.actions)throw Error('Action plan limit reached.');
 const f=project.forces.find(x=>x.id===record.forceId);
 const action={id:uid(),title:str(record.title||'New intervention',200),forceId:f?.id||'',
  method:['Reduce resistance','Strengthen support','Investigate','Communicate','Other'].includes(record.method)?record.method:'Investigate',
  owner:str(record.owner,110),due:str(record.due,10),metric:str(record.metric,210),baseline:str(record.baseline,100),
  target:str(record.target,100),evidence:str(record.evidence,800),risk:str(record.risk,800),result:str(record.result,800),
  status:['Planned','In progress','Completed','Paused'].includes(record.status)?record.status:'Planned',created:iso()};
 project.actions.push(action);return action;
}
export function addTeam(project,data={}){
 if(project.teams.length>=MAX.teams)throw Error('Challenge team limit reached.');
 const item={id:uid(),name:str(data.name||'Team '+(project.teams.length+1),85),proposal:str(data.proposal,1600),
  evidence:str(data.evidence,1000),tradeoffs:str(data.tradeoffs,1000),scores:{impact:0,feasibility:0,evidence:0,stakeholder:0},
  submitted:iso()};
 project.teams.push(item);return item;
}
export function scoreTeam(team){
 const rubric=Object.fromEntries(['impact','feasibility','evidence','stakeholder'].map(k=>[k,whole(team.scores?.[k],0,5,0)]));
 return {...rubric,total:Object.values(rubric).reduce((a,b)=>a+b,0)};
}
export function teamRanking(project){
 return [...project.teams].map(t=>({...t,rating:scoreTeam(t)})).sort((a,b)=>b.rating.total-a.rating.total||a.name.localeCompare(b.name));
}
export function counts(project){
 const balance=calculateBalance(project),actions=project.actions.length,done=project.actions.filter(x=>x.status==='Completed').length;
 return {...balance,actions,done,scenarios:project.scenarios.length,teams:project.teams.length};
}
export function normalizeProject(raw,{regenerate=false}={}){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Invalid force field project.');
 if(raw.version!=null&&raw.version!==VERSION)throw Error('Unsupported project version.');
 if(!Array.isArray(raw.forces)||raw.forces.length>MAX.forces)throw Error('Invalid or oversized force list.');
 if((raw.scenarios||[]).length>MAX.scenarios||(raw.actions||[]).length>MAX.actions||(raw.teams||[]).length>MAX.teams)throw Error('Project exceeds supported limits.');
 const p=createProject(str(raw.title,130)||'Imported initiative');
 if(!regenerate&&typeof raw.id==='string'&&raw.id.length<130)p.id=raw.id;
 for(const key of ['change','context','goal','owner','reviewDate'])p[key]=str(raw[key],key==='context'?2400:1300);
 const forceIds=new Map();
 p.forces=raw.forces.map(f=>{
  const v=makeForce(f.label,SIDES[f.side]?f.side:'driving',f);
  if(!regenerate&&typeof f.id==='string'&&f.id.length<130)v.id=f.id;
  if(typeof f.id==='string'&&!forceIds.has(f.id))forceIds.set(f.id,v.id);
  return v;
 });
 const scenIds=new Map();
 p.scenarios=(Array.isArray(raw.scenarios)?raw.scenarios:[]).map(s=>{
  const n={id:regenerate?uid():str(s.id,130)||uid(),title:str(s.title,130),description:str(s.description,1200),shifts:{},created:str(s.created,55)};
  if(typeof s.id==='string')scenIds.set(s.id,n.id);
  for(const [old,target] of Object.entries(s.shifts||{})){
   const id=forceIds.get(old);if(id&&p.forces.some(f=>f.id===id))n.shifts[id]=whole(target,0,5,3);
  }
  return n;
 });
 p.actions=(Array.isArray(raw.actions)?raw.actions:[]).map(a=>({
  id:regenerate?uid():str(a.id,130)||uid(),title:str(a.title,200),forceId:forceIds.get(a.forceId)||'',
  method:['Reduce resistance','Strengthen support','Investigate','Communicate','Other'].includes(a.method)?a.method:'Investigate',
  owner:str(a.owner,110),due:str(a.due,10),metric:str(a.metric,210),baseline:str(a.baseline,100),
  target:str(a.target,100),evidence:str(a.evidence,800),risk:str(a.risk,800),result:str(a.result,800),
  status:['Planned','In progress','Completed','Paused'].includes(a.status)?a.status:'Planned',created:str(a.created,55)
 }));
 p.teams=(Array.isArray(raw.teams)?raw.teams:[]).map(t=>({
  id:regenerate?uid():str(t.id,130)||uid(),name:str(t.name,85),proposal:str(t.proposal,1600),
  evidence:str(t.evidence,1000),tradeoffs:str(t.tradeoffs,1000),
  scores:Object.fromEntries(['impact','feasibility','evidence','stakeholder'].map(k=>[k,whole(t.scores?.[k],0,5,0)])),
  submitted:str(t.submitted,55)
 }));
 p.activeScenario=scenIds.get(raw.activeScenario)||'';
 if(raw.exercise&&typeof raw.exercise==='object')p.exercise={
  title:str(raw.exercise.title,110),instructions:str(raw.exercise.instructions,1200),duration:whole(raw.exercise.duration,60,7200,900)};
 if(!regenerate&&typeof raw.created==='string')p.created=str(raw.created,55);
 return p;
}
export function exampleProject(id){
 const data={
  'leadership':{title:'Leadership development · Change readiness',change:'Expand virtual leadership development while protecting learning quality.',
    context:'Illustrative classroom scenario; all ratings and forces are invented for discussion.',
    driving:[['Experienced instructors',5,'Instructors','High quality and consistent delivery'],['Leadership sponsorship',4,'Senior leaders','Successful implementation'],['Demand for flexible training',5,'Learners','More accessible options'],['Reusable course materials',3,'Instructional designers','Adaptable resources']],
    restraining:[['Instructor workload',5,'Instructors','Sustainable workloads'],['Limited production time',4,'Instructional designers','Reasonable deadlines'],['Technology adoption concerns',3,'Learners','Reliable access'],['Competing program priorities',3,'Managers','Operational continuity']]},
  'technology':{title:'AI adoption · Organizational change',change:'Introduce an AI-supported workflow responsibly and transparently.',
    context:'Hypothetical organizational change scenario; forces are not verified facts.',
    driving:[['Potential time savings',5,'Frontline employees','Useful tools'],['Executive sponsorship',4,'Executives','Measurable returns'],['Existing digital skills',3,'IT team','Maintainable systems'],['Interest in process improvement',4,'Team leads','Less rework']],
    restraining:[['Trust and transparency concerns',5,'Employees','Clear explanations'],['Unclear governance rules',4,'Compliance','Accountability'],['Training capacity limits',3,'Training team','Proper preparation'],['Data quality issues',4,'IT team','Reliable outputs']]},
  'service':{title:'Service improvement · Response times',change:'Reduce response times without sacrificing service quality.',
    context:'Illustrative service operations scenario. Strength estimates require evidence.',
    driving:[['Experienced service staff',5,'Employees','Manageable workload'],['Improved intake tools',4,'IT support','Usable integration'],['Strong customer demand',4,'Customers','Timely answers'],['Leadership attention',3,'Managers','Reliable metrics']],
    restraining:[['Variable request volume',5,'Service staff','Predictable capacity'],['Manual handoffs',4,'Employees','Clear routing'],['Outdated procedures',4,'Supervisors','Documented process'],['Limited staffing flexibility',3,'HR team','Staffing clarity']]}
 };
 const x=data[id];if(!x)throw Error('Unknown example scenario.');
 const p=createProject(x.title);p.change=x.change;p.context=x.context;p.goal='Investigate which forces matter most, identify two testable interventions and measure results.';
 x.driving.forEach(([label,strength,stakeholder,stakeholderInterest],i)=>addForce(p,'driving',label,{strength,stakeholder,stakeholderInterest,y:16+i*21,color:i%2?'teal':'blue'}));
 x.restraining.forEach(([label,strength,stakeholder,stakeholderInterest],i)=>addForce(p,'restraining',label,{strength,stakeholder,stakeholderInterest,y:16+i*21,color:i%2?'gold':'coral'}));
 const whatif=addScenario(p,'Reduce the two largest barriers');
 whatif.description='Illustrative intervention assumptions; changes are not predictions.';
 p.forces.filter(f=>f.side==='restraining').sort((a,b)=>b.strength-a.strength).slice(0,2).forEach(f=>whatif.shifts[f.id]=Math.max(0,f.strength-2));
 addAction(p,{title:'Investigate the strongest barrier and pilot one intervention',forceId:p.forces.find(f=>f.side==='restraining')?.id,
  method:'Reduce resistance',owner:'Change lead',metric:'Observed barrier frequency or intensity',target:'Measurable reduction after pilot'});
 return p;
}
