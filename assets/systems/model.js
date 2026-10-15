// Systems Mapping Studio: serializable source format and bounded graph analysis.
export const FORMAT='mayne-systems-map';
export const LIMITS={nodes:250,edges:600,groups:40,cycles:200,steps:60000,cycleLength:30,bytes:1500000};
export const TYPES={variable:['◎','Variable','#dceeff'],stock:['▤','Stock','#e1f3ed'],flow:['⇢','Flow / rate','#e1f3ed'],actor:['♙','Stakeholder','#ece6fb'],resource:['◇','Resource','#dceeff'],event:['⚡','Event','#ffe8d6'],decision:['◆','Decision','#fff1cc'],outcome:['◉','Outcome','#e1f3ed'],leverage:['✦','Leverage point','#fff1cc'],assumption:['?','Assumption','#fce6ec'],note:['▤','Observation / note','#fff6cf']};
export const STEPS=[
 ['Define the issue','Describe the recurring challenge, desired outcome, scope, and time horizon. What is inside and outside this system?','issue'],
 ['Identify the elements','Add variables that can increase or decrease, plus stakeholders, resources, stocks, flows, and observations.','nodes'],
 ['Connect influences','Connect a cause to its effect. Set + for same-direction influence, − for opposite-direction influence, or ? when unknown. Explain your evidence.','edges'],
 ['Explore feedback','Open Feedback. Examine reinforcing and balancing loops, check every sign, and highlight each loop on the canvas.','loops'],
 ['Find delays','Which effects take time? Select an arrow and record the delay and its time unit. Delays do not change a loop’s polarity.','delays'],
 ['Identify leverage','Review connectivity as a discussion prompt. Mark intervention points, record a hypothesis, and assign practical actions.','leverage'],
 ['Challenge the map','Trace second- and third-order effects, test assumptions, review missing evidence, and complete the iceberg and behavior-over-time tools.','review'],
 ['Brief and reflect','Record your recommendation and learning. Save a named project, export the map and report, or invite your class.','export']
];
export const copy=x=>JSON.parse(JSON.stringify(x));
export const uid=()=>crypto.randomUUID();
export const validId=x=>typeof x==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(x);
export const validToken=x=>typeof x==='string'&&/^[a-f0-9]{48}$/.test(x);
export const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export function blank(){return {format:FORMAT,schemaVersion:1,id:uid(),title:'Untitled System Map',folder:'',tags:'',description:'',issue:'',purpose:'',boundary:'',timeHorizon:'',mode:'free',stage:0,nodes:[],edges:[],groups:[],iceberg:{events:'',patterns:'',structures:'',mentalModels:''},behavior:{label:'',unit:'',points:'',interpretation:''},reflection:'',recommendation:'',actions:[],createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};}
export function node(type='variable',x=220,y=180){const t=TYPES[type]||TYPES.variable;return {id:uid(),type:TYPES[type]?type:'variable',label:t[1],x,y,w:200,h:112,color:t[2],notes:'',evidence:'',confidence:'hypothesis',unit:'',initial:100,rate:5,leverage:false,locked:false,group:''};}
export function edge(from,to){return {id:uid(),from,to,kind:'causal',polarity:'+',label:'',evidence:'',confidence:'hypothesis',strength:'medium',delayed:false,delay:'',bend:0};}
export function group(x=100,y=100){return {id:uid(),label:'System boundary',x,y,w:650,h:430,color:'#dceeff',notes:'',locked:false};}
export function validate(p){
 const errors=[];
 if(!p||p.format!==FORMAT||p.schemaVersion!==1||!validId(p.id))return ['This is not a supported Systems Mapping Studio project.'];
 if(typeof p.title!=='string'||!p.title.trim()||p.title.length>100)errors.push('Use a project name between 1 and 100 characters.');
 const textFields=['folder','tags','description','issue','purpose','boundary','timeHorizon','reflection','recommendation'];
 if(textFields.some(k=>p[k]!==undefined&&(typeof p[k]!=='string'||p[k].length>8000)))errors.push('Project text is too long or invalid.');
 if(!['free','guided'].includes(p.mode)||!Number.isInteger(p.stage)||p.stage<0||p.stage>7)errors.push('Invalid workflow state.');
 for(const [key,max] of [['nodes',LIMITS.nodes],['edges',LIMITS.edges],['groups',LIMITS.groups],['actions',100]])if(!Array.isArray(p[key])||p[key].length>max)errors.push('Invalid or oversized '+key+'.');
 if(errors.length)return errors;
 const ids=new Set();const numeric=(o,k,a,b)=>typeof o[k]==='number'&&Number.isFinite(o[k])&&o[k]>=a&&o[k]<=b;
 for(const n of [...p.nodes,...p.groups]){
  if(!validId(n.id)||ids.has(n.id))errors.push('Element IDs must be unique UUIDs.');ids.add(n.id);
  if(typeof n.label!=='string'||n.label.length>200||typeof n.notes!=='string'||n.notes.length>8000||!/^#[a-f0-9]{6}$/i.test(n.color||''))errors.push('Invalid element content.');
  if(!numeric(n,'x',-20000,20000)||!numeric(n,'y',-20000,20000)||!numeric(n,'w',90,3000)||!numeric(n,'h',60,3000))errors.push('Element position or size is out of range.');
 }
 const nodeIds=new Set(p.nodes.map(n=>n.id));
 for(const n of p.nodes)if(!TYPES[n.type]||!['hypothesis','observed','supported'].includes(n.confidence)||typeof n.evidence!=='string'||n.evidence.length>8000||!Number.isFinite(n.initial)||!Number.isFinite(n.rate))errors.push('Invalid node properties.');
 for(const e of p.edges){
  if(!validId(e.id)||ids.has(e.id)||!nodeIds.has(e.from)||!nodeIds.has(e.to))errors.push('A relationship has an invalid ID or endpoint.');ids.add(e.id);
  if(!['causal','flow','information'].includes(e.kind)||!['+','-','?'].includes(e.polarity)||!['hypothesis','observed','supported'].includes(e.confidence)||!['weak','medium','strong'].includes(e.strength)||!Number.isFinite(e.bend)||Math.abs(e.bend)>800)errors.push('Invalid relationship properties.');
  for(const k of ['label','evidence','delay'])if(typeof e[k]!=='string'||e[k].length>8000)errors.push('Invalid relationship text.');
 }
 for(const a of p.actions)if(!a||!validId(a.id)||['text','owner','due','measure','status'].some(k=>typeof a[k]!=='string'||a[k].length>1000))errors.push('Invalid action plan.');
 for(const [key,fields] of [['iceberg',['events','patterns','structures','mentalModels']],['behavior',['label','unit','points','interpretation']]])if(!p[key]||fields.some(k=>typeof p[key][k]!=='string'||p[key][k].length>8000))errors.push('Invalid '+key+' worksheet.');
 if(JSON.stringify(p).length>LIMITS.bytes)errors.push('Project exceeds the 1.5 MB limit.');
 return [...new Set(errors)];
}
export function loadProject(raw){const issues=validate(raw);if(issues.length)throw Error(issues[0]);return copy(raw);}
export function removeItems(p,ids){const set=new Set(ids);p.nodes=p.nodes.filter(n=>!set.has(n.id));p.edges=p.edges.filter(e=>!set.has(e.id)&&!set.has(e.from)&&!set.has(e.to));p.groups=p.groups.filter(g=>!set.has(g.id));for(const n of p.nodes)if(set.has(n.group))n.group='';}
// Enumerate elementary directed cycles. A cycle starts at its lowest indexed node,
// so rotations appear once; reverse-direction cycles remain distinct.
export function analyze(p,limits={}){
 const lim={...LIMITS,...limits},nodes=p.nodes.filter(n=>!['note','assumption'].includes(n.type));
 const index=new Map(nodes.map((n,i)=>[n.id,i])),out=new Map(nodes.map(n=>[n.id,[]]));
 const edges=p.edges.filter(e=>e.kind==='causal'&&index.has(e.from)&&index.has(e.to));
 for(const e of edges)out.get(e.from).push(e);
 const loops=[];let steps=0,truncated=false,depthLimited=false;
 for(let start=0;start<nodes.length&&!truncated;start++){
  const first=nodes[start].id,visited=new Set([first]);
  function walk(current,path,links){
   for(const e of out.get(current)||[]){
    if(++steps>lim.steps){truncated=true;return;}
    if(e.to===first){
     const ee=[...links,e],negative=ee.filter(l=>l.polarity==='-').length,uncertain=ee.some(l=>l.polarity==='?');
     loops.push({id:ee.map(x=>x.id).join(':'),nodes:[...path],edges:ee.map(x=>x.id),negative,type:uncertain?'uncertain':negative%2?'balancing':'reinforcing',delays:ee.filter(x=>x.delayed).length});
     if(loops.length>=lim.cycles){truncated=true;return;}
    }else if(index.get(e.to)>start&&!visited.has(e.to)){
     if(path.length>=lim.cycleLength){depthLimited=true;continue;}
     visited.add(e.to);walk(e.to,[...path,e.to],[...links,e]);visited.delete(e.to);if(truncated)return;
    }
   }
  }
  walk(first,[first],[]);
 }
 const counts={reinforcing:0,balancing:0,uncertain:0};for(const l of loops)counts[l.type]++;
 const ranking=nodes.map(n=>({id:n.id,label:n.label,incoming:edges.filter(e=>e.to===n.id).length,outgoing:edges.filter(e=>e.from===n.id).length,loops:loops.filter(l=>l.nodes.includes(n.id)).length})).sort((a,b)=>b.outgoing-a.outgoing||b.loops-a.loops);
 const review=[];
 if(!p.issue.trim())review.push('Define a focal issue before interpreting the map.');
 for(const n of nodes){if(!p.edges.some(e=>e.from===n.id||e.to===n.id))review.push('Isolated element: '+n.label);if(!n.label.trim())review.push('An element needs a meaningful name.');}
 const pairs=new Set();for(const e of p.edges){const pair=e.from+e.to+e.kind;if(pairs.has(pair))review.push('Parallel relationships may duplicate a causal claim.');pairs.add(pair);if(e.kind==='causal'&&!e.evidence.trim())review.push('Missing relationship evidence: '+(p.nodes.find(n=>n.id===e.from)?.label||'?')+' → '+(p.nodes.find(n=>n.id===e.to)?.label||'?'));if(e.delayed&&!e.delay.trim())review.push('A delay needs an estimated duration or explanation.');}
 if(counts.uncertain)review.push('Unknown polarity prevents classification of '+counts.uncertain+' loop(s).');
 if(truncated||depthLimited)review.push('Analysis is bounded: up to '+lim.cycles+' cycles, '+lim.steps+' traversal steps and '+lim.cycleLength+' variables per loop. Results may be incomplete.');
 return {loops,counts,ranking,review:[...new Set(review)],truncated,depthLimited,steps};
}
export function trace(p,start,maxDepth=3,direction=1){
 const paths=[];let frontier=[{nodes:[start],edges:[],sign:direction,delays:0}];
 for(let depth=1;depth<=maxDepth;depth++){
  const next=[];
  for(const path of frontier)for(const e of p.edges.filter(e=>e.kind==='causal'&&e.from===path.nodes.at(-1))){
   if(path.nodes.includes(e.to))continue;
   const sign=path.sign===0||e.polarity==='?'?0:path.sign*(e.polarity==='-'?-1:1);
   const item={nodes:[...path.nodes,e.to],edges:[...path.edges,e.id],sign,depth,delays:path.delays+(e.delayed?1:0)};paths.push(item);next.push(item);if(paths.length>=200)return {paths,truncated:true};
  }frontier=next;
 }return {paths,truncated:false};
}
export function bounds(p){const all=[...p.nodes,...p.groups];if(!all.length)return {x:0,y:0,w:1000,h:650};const x=Math.min(...all.map(n=>n.x))-60,y=Math.min(...all.map(n=>n.y))-60;return {x,y,w:Math.max(...all.map(n=>n.x+n.w))-x+60,h:Math.max(...all.map(n=>n.y+n.h))-y+60};}
export function geometry(p,e){
 const a=p.nodes.find(n=>n.id===e.from),b=p.nodes.find(n=>n.id===e.to);if(!a||!b)return null;
 const ax=a.x+a.w/2,ay=a.y+a.h/2,bx=b.x+b.w/2,by=b.y+b.h/2;
 if(a===b)return {d:`M ${ax} ${a.y} C ${ax+180} ${a.y-170} ${ax-180} ${a.y-170} ${ax-15} ${a.y}`,x:ax,y:a.y-125};
 let dx=bx-ax,dy=by-ay;const length=Math.hypot(dx,dy)||1,cutA=Math.min((a.w/2+8)/Math.abs(dx||.001),(a.h/2+8)/Math.abs(dy||.001)),cutB=Math.min((b.w/2+8)/Math.abs(dx||.001),(b.h/2+8)/Math.abs(dy||.001));
 const sx=ax+dx*Math.min(.45,cutA),sy=ay+dy*Math.min(.45,cutA),ex=bx-dx*Math.min(.45,cutB),ey=by-dy*Math.min(.45,cutB);
 const reverse=p.edges.some(x=>x.from===e.to&&x.to===e.from),bend=e.bend||(reverse?60:0),cx=(sx+ex)/2-dy/length*bend,cy=(sy+ey)/2+dx/length*bend;
 return {d:`M ${sx} ${sy} Q ${cx} ${cy} ${ex} ${ey}`,x:(sx+2*cx+ex)/4,y:(sy+2*cy+ey)/4};
}
// Deliberately a constant-rate stock/flow illustration, not inference from CLDs.
export function simulate(p,steps=20,dt=1){
 const stocks=p.nodes.filter(n=>n.type==='stock'),flows=p.nodes.filter(n=>n.type==='flow'),values=Object.fromEntries(stocks.map(n=>[n.id,n.initial]));
 const rows=[{time:0,...values}];
 for(let i=1;i<=clamp(steps,1,100);i++){
  const delta=Object.fromEntries(stocks.map(n=>[n.id,0]));
  for(const f of flows){const ins=p.edges.filter(e=>e.kind==='flow'&&e.to===f.id&&values[e.from]!==undefined),outs=p.edges.filter(e=>e.kind==='flow'&&e.from===f.id&&values[e.to]!==undefined);for(const e of ins)delta[e.from]-=f.rate*dt;for(const e of outs)delta[e.to]+=f.rate*dt;}
  for(const s of stocks)values[s.id]+=delta[s.id];rows.push({time:i*dt,...values});
 }return {stocks,rows};
}
export function duplicate(p,ids){const idMap=new Map(),added=[];for(const n of p.nodes.filter(n=>ids.includes(n.id))){const c={...copy(n),id:uid(),x:n.x+35,y:n.y+35};idMap.set(n.id,c.id);p.nodes.push(c);added.push(c.id);}for(const e of [...p.edges])if(idMap.has(e.from)&&idMap.has(e.to))p.edges.push({...copy(e),id:uid(),from:idMap.get(e.from),to:idMap.get(e.to)});return added;}
export function fromCollaboration(raw){
 if(raw?.format!=='mayne-canvas-v1'||!Array.isArray(raw.state?.items))throw Error('Choose a Collaboration Canvas JSON export.');
 const p=blank();p.title=String(raw.title||'Imported collaboration').slice(0,100);const ids=new Map();
 for(const item of raw.state.items.slice(0,250))if(['note','text','shape','ellipse','frame'].includes(item.type)){
  if(item.type==='frame'){const g=group(Number(item.x)||0,Number(item.y)||0);g.label=String(item.text||'Boundary').slice(0,200);p.groups.push(g);continue;}
  const n=node(item.type==='note'?'note':'variable',clamp(Number(item.x)||0,-19000,19000),clamp(Number(item.y)||0,-19000,19000));n.label=String(item.text||'Imported element').slice(0,200);ids.set(item.id,n.id);p.nodes.push(n);
 }for(const item of raw.state.items)if(item.type==='connector'&&ids.has(item.from)&&ids.has(item.to)){const e=edge(ids.get(item.from),ids.get(item.to));e.polarity='?';e.label='Review imported influence';p.edges.push(e);}return p;
}
