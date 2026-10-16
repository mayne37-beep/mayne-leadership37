/* Mayne Leadership SWOT & TOWS Studio — pure, dependency-free business logic. */
export const VERSION=1;
export const MAX={projects:35,factors:160,strategies:120,actions:300,scenarios:25};
export const QUADRANTS=[
 {id:'S',name:'Strengths',subtitle:'Internal advantages',label:'What helps us succeed?',className:'strength'},
 {id:'W',name:'Weaknesses',subtitle:'Internal constraints',label:'What holds us back?',className:'weakness'},
 {id:'O',name:'Opportunities',subtitle:'External possibilities',label:'What could we capitalize on?',className:'opportunity'},
 {id:'T',name:'Threats',subtitle:'External risks',label:'What might undermine success?',className:'threat'}
];
export const COLORS=[
 {id:'blue',fill:'#e4f1ff',border:'#5b91c4',ink:'#1e4e78'},
 {id:'gold',fill:'#fff2d6',border:'#d0a45a',ink:'#79551f'},
 {id:'mint',fill:'#e0f6ed',border:'#60a88c',ink:'#245d4a'},
 {id:'coral',fill:'#ffebe5',border:'#d58d7f',ink:'#884a3e'},
 {id:'violet',fill:'#ede9ff',border:'#9481c5',ink:'#58457e'},
 {id:'teal',fill:'#dff5f7',border:'#70aab2',ink:'#2d626c'},
 {id:'rose',fill:'#ffe7f0',border:'#c982a0',ink:'#7f445e'},
 {id:'slate',fill:'#ebf0f5',border:'#8ba0b4',ink:'#475c71'}
];
export const TOWS_TYPES=[
 {id:'SO',title:'Leverage & Grow',label:'Strength + Opportunity',description:'Use a strength to capitalize on an opportunity.',quadrants:['S','O'],color:'#3b86a5'},
 {id:'ST',title:'Protect & Defend',label:'Strength + Threat',description:'Use a strength to reduce exposure to a threat.',quadrants:['S','T'],color:'#b77f57'},
 {id:'WO',title:'Improve & Capture',label:'Weakness + Opportunity',description:'Overcome a weakness to seize an opportunity.',quadrants:['W','O'],color:'#9c80c1'},
 {id:'WT',title:'Reduce & Prepare',label:'Weakness + Threat',description:'Reduce weaknesses and protect against threats.',quadrants:['W','T'],color:'#a36a73'}
];
export const DEFAULT_WEIGHTS={impact:35,feasibility:25,urgency:25,resources:15};
export const uid=()=>globalThis.crypto?.randomUUID?.()||'sw-'+Math.random().toString(36).slice(2)+Date.now().toString(36);
export const escapeHTML=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
export const copy=v=>JSON.parse(JSON.stringify(v));
export const clamp=(v,min,max,fallback=min)=>{const n=Number(v);return Number.isFinite(n)?Math.max(min,Math.min(max,n)):fallback};
const text=(v,n=1200)=>String(v??'').slice(0,n);
export const dateToday=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')};
export function createProject(name='Untitled strategy analysis'){
 return {version:VERSION,id:uid(),name,description:'',objective:'',owner:'',reviewDate:'',created:new Date().toISOString(),updated:new Date().toISOString(),
 factors:[],strategies:[],actions:[],scenarios:[],weights:{...DEFAULT_WEIGHTS},activeScenario:'',showConnections:true};
}
export function createFactor(quadrant,label,options={}){
 if(!QUADRANTS.some(q=>q.id===quadrant))throw Error('Choose a valid SWOT quadrant.');
 return {id:uid(),quadrant,text:text(label||'New factor',220),notes:text(options.notes,1800),group:text(options.group,60),
  color:COLORS.some(c=>c.id===options.color)?options.color:({S:'blue',W:'coral',O:'mint',T:'gold'}[quadrant]),
  x:clamp(options.x,10,90,30),y:clamp(options.y,12,88,30),
  w:clamp(options.w,142,310,208),h:clamp(options.h,78,180,106),
  importance:clamp(options.importance,1,5,3),
  confidence:clamp(options.confidence,1,5,3)};
}
export function addFactor(project,quadrant,label,options={}){
 if(project.factors.length>=MAX.factors)throw Error('This map has reached its factor limit.');
 const node=createFactor(quadrant,label,options);project.factors.push(node);return node;
}
export function repositionFactor(project,id,quadrant,x,y){
 const n=project.factors.find(f=>f.id===id);if(!n)return false;
 if(!QUADRANTS.some(q=>q.id===quadrant))throw Error('Invalid SWOT quadrant.');
 const changedQuadrant=n.quadrant!==quadrant;
 n.quadrant=quadrant;n.x=clamp(x,8,92,n.x);n.y=clamp(y,9,91,n.y);
 // A category change should never silently preserve an outdated TOWS recommendation.
 if(changedQuadrant)for(const s of project.strategies.filter(s=>s.factorIds.includes(id))){
  const nextType=strategyTypeForFactors(project,s.factorIds);
  if(nextType)s.type=nextType;
  else {s.factorIds=s.factorIds.filter(fid=>fid!==id);s.type='';}
  s.status='Under review';
 }
 return true;
}
export function resizeFactor(project,id,w,h){const f=project.factors.find(x=>x.id===id);if(!f)return false;f.w=clamp(w,142,310,f.w);f.h=clamp(h,78,180,f.h);return true}
export function removeFactor(project,id){
 if(!project.factors.some(f=>f.id===id))return false;
 project.factors=project.factors.filter(f=>f.id!==id);
 project.strategies.forEach(s=>{if(s.factorIds.includes(id)){s.factorIds=s.factorIds.filter(fid=>fid!==id);s.type=''}});
 return true;
}
export function strategyTypeForFactors(project,ids){
 if(!Array.isArray(ids)||ids.length!==2||ids[0]===ids[1])return '';
 const a=project.factors.find(f=>f.id===ids[0]),b=project.factors.find(f=>f.id===ids[1]);if(!a||!b)return '';
 const pair=[a.quadrant,b.quadrant].sort().join('');
 // Direct, explicit test instead of alphabetical mapping.
 const match=TOWS_TYPES.find(t=>t.quadrants.every(q=>[a.quadrant,b.quadrant].includes(q)));
 return match?.id||'';
}
export function suggestedStrategy(project,factorA,factorB){
 const type=strategyTypeForFactors(project,[factorA,factorB]);
 if(!type)throw Error('Select compatible factors from a valid TOWS pair.');
 const get=id=>project.factors.find(f=>f.id===id);
 const [a,b]=TOWS_TYPES.find(t=>t.id===type).quadrants.map(q=>[get(factorA),get(factorB)].find(f=>f.quadrant===q));
 const left=a.text.trim().replace(/[.!]+$/,''),right=b.text.trim().replace(/[.!]+$/,'');
 const templates={
  SO:'Use '+left+' to capitalize on '+right+'.',
  ST:'Leverage '+left+' to reduce exposure to '+right+'.',
  WO:'Improve or address '+left+' in order to pursue '+right+'.',
  WT:'Reduce '+left+' and prepare safeguards against '+right+'.'
 };
 return {type,text:templates[type]};
}
export function addStrategy(project,factorIds,options={}){
 if(project.strategies.length>=MAX.strategies)throw Error('Strategy limit reached.');
 const ids=[...new Set(factorIds||[])];
 if(ids.length!==2)throw Error('Select two different factors.');
 const proposed=suggestedStrategy(project,ids[0],ids[1]);
 const strategy={id:uid(),type:proposed.type,factorIds:ids,title:text(options.title||proposed.text,360),
  rationale:text(options.rationale,1600),owner:text(options.owner,110),status:['Proposed','Under review','Approved','In progress','Completed','Paused'].includes(options.status)?options.status:'Proposed',
  impact:clamp(options.impact,1,5,3),feasibility:clamp(options.feasibility,1,5,3),urgency:clamp(options.urgency,1,5,3),resources:clamp(options.resources,1,5,3),
  created:new Date().toISOString()};
 project.strategies.push(strategy);return strategy;
}
export function removeStrategy(project,id){
 if(!project.strategies.some(s=>s.id===id))return false;
 project.strategies=project.strategies.filter(s=>s.id!==id);
 project.actions.forEach(a=>{if(a.strategyId===id)a.strategyId=''});
 return true;
}
export function scoreStrategy(strategy,weights=DEFAULT_WEIGHTS,scenario=null,project=null){
 // Transparent rating-based planning comparison, not a predicted outcome.
 const factors=project&&scenario?strategy.factorIds.map(id=>project.factors.find(f=>f.id===id)).filter(Boolean):[];
 const relevance=factors.length?factors.reduce((sum,f)=>sum+Number(scenario.factorShifts?.[f.quadrant]||0),0)/factors.length:0;
 const delta=scenario?.deltas||{};
 const adjusted={
  impact:clamp(strategy.impact+Number(delta.impact||0)+relevance*.5,1,5),
  feasibility:clamp(strategy.feasibility+Number(delta.feasibility||0),1,5),
  urgency:clamp(strategy.urgency+Number(delta.urgency||0)+relevance*.5,1,5),
  resources:clamp(strategy.resources+Number(delta.resources||0),1,5)
 };
 const norm=['impact','feasibility','urgency','resources'].reduce((sum,k)=>sum+Math.max(0,Number(weights[k])||0),0)||1;
 const total=['impact','feasibility','urgency','resources'].reduce((sum,k)=>{
  const value=k==='resources'?6-adjusted[k]:adjusted[k];return sum+value*Math.max(0,Number(weights[k])||0);
 },0);
 return {score:Math.round(100*total/norm)/100,adjusted,relevance:Number(relevance.toFixed(2))};
}
export function rankStrategies(project,scenario=null){
 return project.strategies.map(s=>{
  const baseline=scoreStrategy(s,project.weights,null,project).score;
  const alternate=scenario?scoreStrategy(s,project.weights,scenario,project).score:baseline;
  return {...s,baseline,scenarioScore:alternate,change:+(alternate-baseline).toFixed(2)};
 }).sort((a,b)=>b.scenarioScore-a.scenarioScore||b.baseline-a.baseline||a.title.localeCompare(b.title));
}
export function addAction(project,data){
 if(project.actions.length>=MAX.actions)throw Error('Action plan limit reached.');
 const action={id:uid(),strategyId:project.strategies.some(s=>s.id===data.strategyId)?data.strategyId:'',
  title:text(data.title||'Next action',220),owner:text(data.owner,110),due:text(data.due,10),
  metric:text(data.metric,220),baseline:text(data.baseline,80),target:text(data.target,80),
  milestone:text(data.milestone,150),risks:text(data.risks,700),
  status:['Not started','In progress','Blocked','Done'].includes(data.status)?data.status:'Not started',
  results:text(data.results,800),created:new Date().toISOString()};
 project.actions.push(action);return action;
}
export function addScenario(project,data={}){
 if(project.scenarios.length>=MAX.scenarios)throw Error('Scenario limit reached.');
 const scenario={id:uid(),name:text(data.name||'New scenario',130),description:text(data.description,900),
  factorShifts:{S:0,W:0,O:0,T:0},deltas:{impact:0,feasibility:0,urgency:0,resources:0},created:new Date().toISOString()};
 project.scenarios.push(scenario);return scenario;
}
export function projectStats(project){
 const counts={S:0,W:0,O:0,T:0};
 project.factors.forEach(f=>counts[f.quadrant]++);
 return {counts,totalFactors:project.factors.length,strategies:project.strategies.length,
  actions:project.actions.length,done:project.actions.filter(a=>a.status==='Done').length,
  overdue:project.actions.filter(a=>a.due&&a.due<dateToday()&&a.status!=='Done').length,
  linkedStrategies:project.strategies.filter(s=>s.factorIds.length===2&&strategyTypeForFactors(project,s.factorIds)).length};
}
export function normalizeProject(raw,{regenerate=false}={}){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Invalid strategy project.');
 if(raw.version!==undefined&&raw.version!==VERSION)throw Error('Unsupported SWOT project version.');
 if(!Array.isArray(raw.factors)||raw.factors.length>MAX.factors|| (raw.strategies||[]).length>MAX.strategies||(raw.actions||[]).length>MAX.actions||(raw.scenarios||[]).length>MAX.scenarios)throw Error('Imported project exceeds supported limits.');
 const p=createProject(text(raw.name,130)||'Imported strategy project');
 if(!regenerate&&typeof raw.id==='string'&&raw.id.length<130)p.id=raw.id;
 for(const key of ['description','objective','owner','reviewDate'])p[key]=text(raw[key],key==='description'||key==='objective'?1800:120);
 p.showConnections=raw.showConnections!==false;
 const ids=new Map(),factorSeen=new Set();
 p.factors=raw.factors.map(f=>{
  const factor=createFactor(QUADRANTS.some(q=>q.id===f.quadrant)?f.quadrant:'S',f.text,f);
  factor.id=!regenerate&&typeof f.id==='string'&&!factorSeen.has(f.id)?f.id:uid();
  if(typeof f.id==='string'&&!ids.has(f.id))ids.set(f.id,factor.id);factorSeen.add(factor.id);return factor;
 });
 const stratIds=new Map();
 p.strategies=(Array.isArray(raw.strategies)?raw.strategies:[]).map(s=>{
  const refs=[...new Set((Array.isArray(s.factorIds)?s.factorIds:[]).map(x=>ids.get(x)).filter(Boolean))].slice(0,2);
  const safe=suggestedIfValid(p,refs);
  const id=!regenerate&&typeof s.id==='string'?s.id:uid();
  if(typeof s.id==='string'&&!stratIds.has(s.id))stratIds.set(s.id,id);
  return {id,type:safe||'',factorIds:safe?refs:[],title:text(s.title,360),rationale:text(s.rationale,1600),owner:text(s.owner,110),
   status:['Proposed','Under review','Approved','In progress','Completed','Paused'].includes(s.status)?s.status:'Proposed',
   impact:clamp(s.impact,1,5,3),feasibility:clamp(s.feasibility,1,5,3),
   urgency:clamp(s.urgency,1,5,3),resources:clamp(s.resources,1,5,3),created:text(s.created,55)};
 });
 p.actions=(Array.isArray(raw.actions)?raw.actions:[]).map(a=>({id:regenerate?uid():text(a.id,130)||uid(),
  strategyId:stratIds.get(a.strategyId)||'',title:text(a.title,220),owner:text(a.owner,110),due:text(a.due,10),metric:text(a.metric,220),
  baseline:text(a.baseline,80),target:text(a.target,80),milestone:text(a.milestone,150),risks:text(a.risks,700),
  status:['Not started','In progress','Blocked','Done'].includes(a.status)?a.status:'Not started',results:text(a.results,800),created:text(a.created,55)}));
 p.scenarios=(Array.isArray(raw.scenarios)?raw.scenarios:[]).map(s=>({
  id:regenerate?uid():text(s.id,130)||uid(),name:text(s.name,130),description:text(s.description,900),
  factorShifts:Object.fromEntries(['S','W','O','T'].map(k=>[k,clamp(s.factorShifts?.[k],-2,2,0)])),
  deltas:Object.fromEntries(['impact','feasibility','urgency','resources'].map(k=>[k,clamp(s.deltas?.[k],-2,2,0)])),
  created:text(s.created,55)
 }));
 if(raw.weights&&typeof raw.weights==='object')for(const k of Object.keys(DEFAULT_WEIGHTS))p.weights[k]=clamp(raw.weights[k],0,100,DEFAULT_WEIGHTS[k]);
 p.activeScenario=p.scenarios.some(s=>s.id===raw.activeScenario)&&!regenerate?raw.activeScenario:'';
 if(!regenerate&&typeof raw.created==='string')p.created=text(raw.created,55);
 return p;
}
function suggestedIfValid(p,refs){return strategyTypeForFactors(p,refs)}
export function sampleProject(){
 const p=createProject('Leadership development · Strategy example');
 p.description='Illustrative strategy exercise. Factors and ratings are examples, not empirical organizational findings.';
 p.objective='Expand effective, accessible leadership development while maintaining instructional quality.';
 const list=[
 ['S','Experienced facilitators',20,28,'Instruction','blue'],['S','Reusable course content',69,64,'Curriculum','teal'],
 ['W','Limited production capacity',24,30,'Capacity','coral'],['W','Inconsistent feedback collection',69,65,'Measurement','rose'],
 ['O','Rising demand for virtual learning',22,25,'Delivery','mint'],['O','Potential partner organizations',72,65,'Partnerships','violet'],
 ['T','Competing learning providers',25,30,'Market','gold'],['T','Technology and platform changes',70,65,'Technology','slate']
 ];
 const nodes=list.map(([q,label,x,y,group,color])=>addFactor(p,q,label,{x,y,group,color}));
 const pair=(a,b,options)=>addStrategy(p,[nodes[a].id,nodes[b].id],options);
 const s1=pair(0,4,{title:'Use experienced facilitators to launch engaging, scalable virtual leadership programs.',impact:5,feasibility:4,urgency:4,resources:3,owner:'Learning team'});
 pair(0,6,{title:'Differentiate through practical instructor-led coaching and applied exercises.',impact:4,feasibility:4,urgency:3,resources:3});
 pair(2,5,{title:'Build a partner production pipeline to overcome internal capacity constraints.',impact:4,feasibility:3,urgency:4,resources:4});
 pair(3,7,{title:'Standardize evaluation tools and develop a platform migration contingency plan.',impact:4,feasibility:4,urgency:3,resources:2});
 addAction(p,{strategyId:s1.id,title:'Pilot two virtual leadership modules',owner:'Course lead',due:'',metric:'Learner completion rate',baseline:'Baseline not yet measured',target:'90%',milestone:'Pilot and review',risks:'Pilot demand could exceed facilitator availability.'});
 const sc=addScenario(p,{name:'Virtual demand accelerates',description:'Higher demand creates a stronger opportunity, but greater pressure on resources.'});
 sc.factorShifts.O=2;sc.deltas.feasibility=-1;sc.deltas.resources=1;
 return p;
}


/** Editable, explicitly hypothetical classroom starter projects. */
export function templateProject(id){
 if(id==='leadership')return sampleProject();
 if(!['change','service'].includes(id))throw Error('Unknown SWOT template.');
 const spec=id==='change'?{
  title:'Organizational change · Classroom SWOT',objective:'Implement a new work process while maintaining employee engagement.',
  description:'Hypothetical organization-wide change exercise. Factor assessments are examples, not factual findings.',
  factors:[
   ['S','Trusted frontline supervisors','People',22,28,'blue'],
   ['S','Established communication channels','Communications',70,69,'teal'],
   ['W','Limited time for training','Capacity',24,25,'coral'],
   ['W','Uneven understanding of the change','Readiness',69,65,'rose'],
   ['O','New collaboration technology','Technology',24,27,'mint'],
   ['O','Opportunity to simplify handoffs','Process',70,68,'violet'],
   ['T','Employee change fatigue','People',24,27,'gold'],
   ['T','Unexpected operational disruptions','Operations',71,66,'slate']
  ],
  actions:['Pilot a shorter onboarding session','Supervisors','Percentage of staff confident in new process','80%']
 }:{
  title:'Customer response delays · Classroom SWOT',objective:'Improve service response time without reducing service quality.',
  description:'Hypothetical service team exercise. All SWOT factors and performance assumptions should be validated.',
  factors:[
   ['S','Strong service-oriented team','People',20,28,'blue'],
   ['S','Historical request logs','Evidence',68,65,'teal'],
   ['W','Inconsistent intake triage','Process',24,26,'coral'],
   ['W','Limited peak-hour coverage','Resources',68,68,'rose'],
   ['O','Automated request routing','Technology',24,27,'mint'],
   ['O','New partner service agreements','Partnerships',70,67,'violet'],
   ['T','Rising request volumes','Demand',24,28,'gold'],
   ['T','Budget pressures','Resources',71,66,'slate']
  ],
  actions:['Pilot a standardized intake checklist','Service team lead','Average time to first response','Within service target']
 };
 const p=createProject(spec.title);p.objective=spec.objective;p.description=spec.description;
 const nodes=spec.factors.map(([q,label,group,x,y,color])=>addFactor(p,q,label,{group,x,y,color}));
 const strategySO=addStrategy(p,[nodes[0].id,nodes[4].id]);
 addStrategy(p,[nodes[1].id,nodes[6].id]);
 addStrategy(p,[nodes[2].id,nodes[5].id]);
 addStrategy(p,[nodes[3].id,nodes[7].id]);
 addAction(p,{strategyId:strategySO.id,title:spec.actions[0],owner:spec.actions[1],metric:spec.actions[2],target:spec.actions[3],milestone:'Pilot and review'});
 const scenario=addScenario(p,{name:id==='change'?'Implementation readiness declines':'Demand rises unexpectedly',description:'Illustrative disruption for discussion.'});
 scenario.factorShifts.T=2;scenario.deltas.feasibility=-1;
 return p;
}
