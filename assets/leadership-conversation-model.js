/* Leadership Conversation Simulator — deterministic, inspectable classroom practice.
   Indicators and character reactions are scripted simulations, NOT assessments of real people. */
export const VERSION=1;
export const KEY='mayne.leadership-conversation.v1';
export const CAPS={projects:30,nodes:32,choices:6,turns:30,observations:35,importBytes:3_000_000};
export const DIMENSIONS=[
 {key:'trust',label:'Trust',description:'Perceived willingness to engage'},
 {key:'safety',label:'Psychological safety',description:'Room to speak candidly'},
 {key:'clarity',label:'Clarity',description:'Shared understanding of expectations'},
 {key:'commitment',label:'Commitment',description:'Likelihood of agreed follow-through'}
];
export const EMOTIONS=['guarded','frustrated','skeptical','thoughtful','open','hopeful','disappointed','neutral'];
export const TACTICS=['Listen and explore','Clarify expectations','Collaborate on options','Challenge respectfully','Avoid or dismiss'];
export const STAGES=['Opening','Explore','Understand','Coach','Agree','Close','Recovery'];
export const uid=()=>globalThis.crypto?.randomUUID?.()||'lc-'+Date.now().toString(36)+Math.random().toString(36).slice(2,9);
export const clamp=(v,min,max,fallback=min)=>{const n=Number(v);return Number.isFinite(n)?Math.max(min,Math.min(max,n)):fallback};
export const round=(v,min,max,fallback=min)=>Math.round(clamp(v,min,max,fallback));
export const text=(v,n=1200)=>String(v??'').slice(0,n);
export const escapeHTML=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
export const deepCopy=v=>JSON.parse(JSON.stringify(v));
const now=()=>new Date().toISOString();
const effect=(data={})=>Object.fromEntries(DIMENSIONS.map(d=>[d.key,round(data[d.key],-25,25,0)]));
export function makeChoice(data={}){
 return {id:text(data.id,90)||uid(),label:text(data.label||'New response',500),
  tactic:TACTICS.includes(data.tactic)?data.tactic:'Listen and explore',
  reply:text(data.reply||'I hear what you are saying.',900),
  emotion:EMOTIONS.includes(data.emotion)?data.emotion:'thoughtful',
  feedback:text(data.feedback||'What did this response encourage or discourage?',950),
  effects:effect(data.effects),nextId:text(data.nextId||'END',90)};
}
export function makeNode(data={}){
 return {id:text(data.id,90)||uid(),title:text(data.title||'Conversation moment',140),
  stage:STAGES.includes(data.stage)?data.stage:'Explore',
  line:text(data.line||'Can we talk?',1100),context:text(data.context,950),
  emotion:EMOTIONS.includes(data.emotion)?data.emotion:'guarded',
  choices:(Array.isArray(data.choices)?data.choices:[]).slice(0,CAPS.choices).map(makeChoice)};
}
export function makeProject(data={}){
 const first=makeNode({title:'Opening conversation',stage:'Opening',line:'I am not sure what you want to discuss.',emotion:'guarded'});
 first.choices=[makeChoice({label:'Can you help me understand your perspective?',tactic:'Listen and explore',reply:'I can try.',effects:{trust:7,safety:6,clarity:2},nextId:'END'})];
 return {version:VERSION,id:uid(),title:text(data.title||'New leadership conversation',145),
  category:text(data.category||'Coaching conversation',80),
  summary:text(data.summary||'A coaching conversation you can customize.',1000),
  objective:text(data.objective||'Practice curiosity, expectations and joint problem-solving.',1100),
  timeMinutes:round(data.timeMinutes,5,60,12),
  persona:{name:text(data.persona?.name||'Jordan Taylor',100),role:text(data.persona?.role||'Team member',120),
   temperament:text(data.persona?.temperament||'Thoughtful but uncertain',300),
   avatar:['olive','blue','sand','rose','slate'].includes(data.persona?.avatar)?data.persona.avatar:'blue'},
  context:text(data.context||'A private one-on-one conversation.',1300),
  firstNodeId:first.id,nodes:[first],
  sessions:[],activeSessionId:'',created:now(),updated:now()};
}
export function initialMetrics(){return {trust:50,safety:50,clarity:50,commitment:50};}
export function startSession(project,{learner='Participant'}={}){
 const s={id:uid(),learner:text(learner,100),started:now(),ended:'',currentNodeId:project.firstNodeId,
  complete:false,turns:[],metrics:initialMetrics(),observations:[]};
 project.sessions.unshift(s);if(project.sessions.length>18)project.sessions.length=18;project.activeSessionId=s.id;return s;
}
export const activeSession=p=>p.sessions.find(s=>s.id===p.activeSessionId)||null;
export const nodeById=(p,id)=>p.nodes.find(n=>n.id===id)||null;
export function choose(p,choiceId,{written='',classification=null}={}){
 const s=activeSession(p);if(!s||s.complete)throw Error('Begin a conversation to respond.');
 const n=nodeById(p,s.currentNodeId);if(!n)throw Error('Conversation moment not found.');
 const option=n.choices.find(c=>c.id===choiceId);if(!option)throw Error('Choose a valid response.');
 const typed=text(written.trim(),900);
 if(typed&&!TACTICS.includes(classification))throw Error('Select the leadership approach used in your typed response.');
 if(!typed&&classification)classification=null;
 const before={...s.metrics};
 const after=Object.fromEntries(DIMENSIONS.map(d=>[d.key,round(before[d.key]+option.effects[d.key],0,100,50)]));
 const turns=[...s.turns,{id:uid(),nodeId:n.id,stage:n.stage,employee:n.line,
  learner:typed||option.label,selectedChoice:option.label,typed:!!typed,
  classification:typed?classification:option.tactic,reply:option.reply,emotion:option.emotion,
  feedback:option.feedback,effects:{...option.effects},before,after,at:now()}];
 const next=option.nextId;
 if(next!=='END'&&!nodeById(p,next))throw Error('The next conversation moment does not exist. Edit this response first.');
 s.turns=turns.slice(-CAPS.turns);s.metrics=after;
 if(next==='END'||s.turns.length>=CAPS.turns){s.complete=true;s.currentNodeId='';s.ended=now();}
 else s.currentNodeId=next;
 return s.turns.at(-1);
}
export function rewindTurn(p){
 const s=activeSession(p);if(!s||!s.turns.length)return false;
 const removed=s.turns.pop();s.metrics=removed.before;s.complete=false;s.ended='';
 s.currentNodeId=removed.nodeId;return true;
}
export function addObservation(p,data={}){
 const s=activeSession(p);if(!s)throw Error('Begin a conversation before observing.');
 if(s.observations.length>=CAPS.observations)throw Error('Observation limit reached.');
 const record={id:uid(),observer:text(data.observer||'Observer',100),notes:text(data.notes,1600),
  strengths:text(data.strengths,950),opportunities:text(data.opportunities,950),
  timestamp:now(),rubric:{
   listening:round(data.rubric?.listening,1,5,3),
   inquiry:round(data.rubric?.inquiry,1,5,3),
   accountability:round(data.rubric?.accountability,1,5,3),
   adaptability:round(data.rubric?.adaptability,1,5,3)}
 };
 s.observations.push(record);return record;
}
export function metricsDelta(s){return Object.fromEntries(DIMENSIONS.map(d=>[d.key,s.metrics[d.key]-50]));}
export const observationAverage=s=>{
 if(!s?.observations?.length)return null;
 return Object.fromEntries(['listening','inquiry','accountability','adaptability'].map(k=>[k,Number((s.observations.reduce((sum,o)=>sum+o.rubric[k],0)/s.observations.length).toFixed(1))]));
};
export function endSession(p){
 const s=activeSession(p);if(!s)return false;s.complete=true;s.currentNodeId='';s.ended=now();return true;
}
export function removeNode(p,id){
 if(p.nodes.length<=1)return false;
 if(!p.nodes.some(n=>n.id===id))return false;
 p.nodes=p.nodes.filter(n=>n.id!==id);
 if(p.firstNodeId===id)p.firstNodeId=p.nodes[0].id;
 for(const n of p.nodes)for(const c of n.choices)if(c.nextId===id)c.nextId='END';
 return true;
}
export function addNode(p,data={}){
 if(p.nodes.length>=CAPS.nodes)throw Error('Scenario moment limit reached.');
 const n=makeNode(data);p.nodes.push(n);return n;
}
export function addChoice(p,nodeId,data={}){
 const n=nodeById(p,nodeId);if(!n)throw Error('Moment not found.');
 if(n.choices.length>=CAPS.choices)throw Error('Response limit reached.');
 const c=makeChoice(data);n.choices.push(c);return c;
}
export function updateChoice(p,nodeId,choiceId,updates={}){
 const n=nodeById(p,nodeId),c=n?.choices.find(c=>c.id===choiceId);if(!c)return false;
 Object.assign(c,makeChoice({...c,...updates}),{id:c.id});
 if(c.nextId!=='END'&&!nodeById(p,c.nextId))c.nextId='END';
 return true;
}
export function deleteChoice(p,nodeId,choiceId){
 const n=nodeById(p,nodeId);if(!n||n.choices.length<=1)return false;
 n.choices=n.choices.filter(c=>c.id!==choiceId);return true;
}
export function validateScenario(p){
 const errors=[];
 if(!p.nodes.length)errors.push('No conversation moments.');
 if(!nodeById(p,p.firstNodeId))errors.push('Starting moment not found.');
 const ids=new Set(p.nodes.map(n=>n.id));
 for(const n of p.nodes){
  if(!n.choices.length)errors.push(n.title+' has no responses.');
  for(const c of n.choices)if(c.nextId!=='END'&&!ids.has(c.nextId))errors.push(n.title+' contains an invalid branch.');
 }
 const reachable=new Set(),stack=[p.firstNodeId];
 while(stack.length){const id=stack.pop();if(reachable.has(id)||!ids.has(id))continue;reachable.add(id);
  for(const c of nodeById(p,id).choices)if(c.nextId!=='END')stack.push(c.nextId);
 }
 return {errors,reachable,disconnected:p.nodes.filter(n=>!reachable.has(n.id)).map(n=>n.title),nodes:p.nodes.length};
}
export function summarize(s){
 const counts=Object.fromEntries(TACTICS.map(t=>[t,0]));
 for(const turn of s?.turns||[])counts[turn.classification]=(counts[turn.classification]||0)+1;
 const changes=metricsDelta(s);
 return {turns:s?.turns.length||0,counts,changes,strongest:Object.entries(changes).sort((a,b)=>b[1]-a[1])[0]?.[0]||'trust',
  lowest:Object.entries(changes).sort((a,b)=>a[1]-b[1])[0]?.[0]||'trust'};
}
export function normalizeProject(raw,{regenerate=false}={}){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Invalid conversation project.');
 if(raw.version!=null&&raw.version!==VERSION)throw Error('Unsupported project version.');
 if(!Array.isArray(raw.nodes)||!raw.nodes.length||raw.nodes.length>CAPS.nodes)throw Error('Invalid scenario moments.');
 const p=makeProject(raw);p.id=regenerate?uid():text(raw.id,90)||uid();
 p.title=text(raw.title,145)||p.title;p.category=text(raw.category,80);
 p.summary=text(raw.summary,1000);p.objective=text(raw.objective,1100);p.context=text(raw.context,1300);
 p.timeMinutes=round(raw.timeMinutes,5,60,12);
 p.nodes=raw.nodes.map(makeNode);
 const map=new Map();p.nodes.forEach((n,i)=>{const prev=raw.nodes[i];n.id=regenerate?uid():text(prev.id,90)||uid();map.set(prev.id,n.id);});
 p.nodes.forEach((n,i)=>n.choices.forEach((c,j)=>{
  c.id=regenerate?uid():text(raw.nodes[i].choices?.[j]?.id,90)||uid();
  const old=raw.nodes[i].choices?.[j]?.nextId;
  c.nextId=old==='END'?'END':map.get(old)||'END';
 }));
 p.firstNodeId=map.get(raw.firstNodeId)||p.nodes[0].id;
 p.sessions=Array.isArray(raw.sessions)?raw.sessions.slice(0,18).map(rawS=>{
  const s={id:regenerate?uid():text(rawS.id,90)||uid(),learner:text(rawS.learner,100),started:text(rawS.started,60),
   ended:text(rawS.ended,60),currentNodeId:rawS.complete?'':map.get(rawS.currentNodeId)||'',
   complete:!!rawS.complete,turns:[],metrics:initialMetrics(),observations:[]};
  const turns=Array.isArray(rawS.turns)?rawS.turns.slice(0,CAPS.turns):[];
  s.turns=turns.map(t=>({id:regenerate?uid():text(t.id,90)||uid(),nodeId:map.get(t.nodeId)||'',
   stage:STAGES.includes(t.stage)?t.stage:'Explore',employee:text(t.employee,1100),learner:text(t.learner,900),
   selectedChoice:text(t.selectedChoice,500),typed:!!t.typed,classification:TACTICS.includes(t.classification)?t.classification:'Listen and explore',
   reply:text(t.reply,900),emotion:EMOTIONS.includes(t.emotion)?t.emotion:'neutral',feedback:text(t.feedback,950),effects:effect(t.effects),
   before:Object.fromEntries(DIMENSIONS.map(d=>[d.key,round(t.before?.[d.key],0,100,50)])),
   after:Object.fromEntries(DIMENSIONS.map(d=>[d.key,round(t.after?.[d.key],0,100,50)])),at:text(t.at,60)}));
  s.metrics=s.turns.length?{...s.turns.at(-1).after}:initialMetrics();
  if(!s.complete&&!s.currentNodeId){s.complete=true;s.ended=s.ended||now();}
  s.reflection={keep:text(rawS.reflection?.keep,1200),change:text(rawS.reflection?.change,1200),action:text(rawS.reflection?.action,1200)};
  s.observations=Array.isArray(rawS.observations)?rawS.observations.slice(0,CAPS.observations).map(o=>({
   id:regenerate?uid():text(o.id,90)||uid(),observer:text(o.observer,100),notes:text(o.notes,1600),
   strengths:text(o.strengths,950),opportunities:text(o.opportunities,950),timestamp:text(o.timestamp,60),
   rubric:Object.fromEntries(['listening','inquiry','accountability','adaptability'].map(k=>[k,round(o.rubric?.[k],1,5,3)]))
  })):[];
  return s;
 }):[];
 p.activeSessionId=regenerate?(p.sessions[0]?.id||''):p.sessions.find(s=>s.id===raw.activeSessionId)?.id||p.sessions[0]?.id||'';
 p.created=text(raw.created,60)||now();p.updated=text(raw.updated,60)||now();return p;
}
const C=(label,tactic,reply,emotion,feedback,effects,nextId)=>makeChoice({label,tactic,reply,emotion,feedback,effects,nextId});
function authored(spec){
 const p=makeProject({title:spec.title,category:spec.category,summary:spec.summary,objective:spec.objective,
  context:spec.context,timeMinutes:spec.timeMinutes,persona:spec.persona});
 p.nodes=[];const id=name=>spec.id+'-'+name;
 const row=(name,title,stage,line,emotion,context,choices)=>{
  p.nodes.push(makeNode({id:id(name),title,stage,line,emotion,context,
   choices:choices.map(([label,tactic,reply,emotion,feedback,values,next])=>C(label,tactic,reply,emotion,feedback,values,next==='END'?'END':id(next)))}));
 };
 const d={high:{trust:10,safety:10,clarity:3,commitment:2},curious:{trust:7,safety:6,clarity:6,commitment:2},
  clear:{trust:2,safety:0,clarity:12,commitment:8},collab:{trust:8,safety:8,clarity:6,commitment:10},
  confront:{trust:-10,safety:-12,clarity:8,commitment:-5},dismiss:{trust:-15,safety:-15,clarity:-4,commitment:-9},
  repair:{trust:9,safety:8,clarity:5,commitment:3},account:{trust:3,safety:1,clarity:11,commitment:9},
  weak:{trust:-6,safety:-7,clarity:-5,commitment:-9}};
 row('start','Open the conversation','Opening',spec.lines.start,'frustrated','Your first response sets the tone.',[
  [spec.options.start[0],'Listen and explore',spec.reactions.start[0],'thoughtful','You acknowledge the concern before defining a solution.',d.high,'open'],
  [spec.options.start[1],'Challenge respectfully',spec.reactions.start[1],'frustrated','Accountability matters, but the opening may escalate defensiveness.',d.confront,'defensive'],
  [spec.options.start[2],'Avoid or dismiss',spec.reactions.start[2],'disappointed','Minimizing the issue may weaken trust and reduce useful information.',d.dismiss,'defensive']
 ]);
 row('open','Explore what is underneath','Explore',spec.lines.open,'thoughtful','The employee is willing to explain more.',[
  [spec.options.open[0],'Listen and explore',spec.reactions.open[0],'open','The question invites facts that could change your understanding.',d.curious,'facts'],
  [spec.options.open[1],'Clarify expectations',spec.reactions.open[1],'guarded','Expectations become clearer; make room for the employee’s input.',d.clear,'facts'],
  [spec.options.open[2],'Avoid or dismiss',spec.reactions.open[2],'skeptical','A quick fix may overlook why the problem is recurring.',d.weak,'resistance']
 ]);
 row('defensive','Respond to defensiveness','Recovery',spec.lines.defensive,'guarded','The employee feels unheard or threatened.',[
  [spec.options.defensive[0],'Listen and explore',spec.reactions.defensive[0],'thoughtful','You repair some trust and invite a fuller explanation.',d.repair,'facts'],
  [spec.options.defensive[1],'Challenge respectfully',spec.reactions.defensive[1],'frustrated','Reasserting consequences may increase resistance before facts are clear.',d.confront,'resistance'],
  [spec.options.defensive[2],'Avoid or dismiss',spec.reactions.defensive[2],'disappointed','Ending prematurely leaves the underlying concern unresolved.',d.dismiss,'END']
 ]);
 row('facts','Turn information into clarity','Understand',spec.lines.facts,'skeptical','Explore both their perspective and your expectations.',[
  [spec.options.facts[0],'Collaborate on options',spec.reactions.facts[0],'open','You link the issue to a shared problem-solving process.',d.collab,'commit'],
  [spec.options.facts[1],'Clarify expectations',spec.reactions.facts[1],'thoughtful','You make standards explicit and leave space for a workable plan.',d.account,'commit'],
  [spec.options.facts[2],'Challenge respectfully',spec.reactions.facts[2],'frustrated','A one-sided instruction may produce short-term compliance without buy-in.',d.confront,'resistance']
 ]);
 row('resistance','Choose whether to repair or push','Coach',spec.lines.resistance,'frustrated','A second opportunity for curiosity and accountability.',[
  [spec.options.resistance[0],'Listen and explore',spec.reactions.resistance[0],'thoughtful','You invite specifics and show willingness to understand.',d.repair,'commit'],
  [spec.options.resistance[1],'Collaborate on options',spec.reactions.resistance[1],'open','Shared ownership can help resolve the impasse.',d.collab,'commit'],
  [spec.options.resistance[2],'Avoid or dismiss',spec.reactions.resistance[2],'disappointed','Without a next step, confidence in the conversation may decline.',d.dismiss,'END']
 ]);
 row('commit','Agree on next steps','Agree',spec.lines.commit,'thoughtful','A useful conversation needs observable commitments.',[
  [spec.options.commit[0],'Collaborate on options',spec.reactions.commit[0],'hopeful','A specific joint action and follow-up support implementation.',d.collab,'END'],
  [spec.options.commit[1],'Clarify expectations',spec.reactions.commit[1],'neutral','A clear agreement is useful; check practical feasibility and support.',d.account,'END'],
  [spec.options.commit[2],'Avoid or dismiss',spec.reactions.commit[2],'skeptical','Closing without a concrete follow-up may leave the issue unresolved.',d.weak,'END']
 ]);
 p.firstNodeId=id('start');return p;
}
const SCENARIOS=[
 {id:'defensive',title:'The Defensive Employee',category:'Performance conversations',timeMinutes:12,
 persona:{name:'Marcus Reed',role:'Experienced operations specialist',temperament:'Proud of his work; worried his efforts are invisible',avatar:'olive'},
 summary:'Address performance concerns while acknowledging a frustrated employee who feels unrecognized.',
 objective:'Practice listening, specific accountability, fair inquiry and a sustainable follow-up commitment.',
 context:'Marcus has missed two internal deadlines. The overall workload has increased, but deadlines and priorities were communicated at the team level.',
 lines:{start:'You keep saying my performance is slipping, but nobody acknowledges how much work I’ve been doing.',
 open:'I’ve been covering tasks for two people. Then I get a message asking why my report is late. It feels like no one is paying attention.',
 defensive:'Here we go again. You already made up your mind, so why ask me anything?',
 facts:'The handoffs are changing every day. I can meet the deadline if I know what takes priority—but right now everything is urgent.',
 resistance:'If you just want another promise, I can give you one. I’m not sure anything will actually change.',
 commit:'I can prioritize the report if you help me resolve the competing requests. What exactly do you want me to do first?'},
 options:{start:['You sound frustrated. Help me understand what has been happening.','Two deadlines were missed. That is what we need to discuss.','Everyone is busy. We need to move forward.'],
 open:['Which specific demands caused the conflict, and when did they arise?','The deadlines still matter. Let’s define them and the support needed.','Just organize your schedule better.'],
 defensive:['I came across as if the decision were made. I’d like to understand your side.','I expect accountability, regardless of how you feel.','We will talk when your attitude improves.'],
 facts:['Let’s prioritize your work together and decide what can shift.','The report needs to be submitted Thursday. What obstacles must we address?','I have already explained the deadline.'],
 resistance:['What would need to change for an agreement to be realistic?','Let’s name one action each of us can take this week.','Just send the report and we are done.'],
 commit:['Let’s agree on priorities, a check-in, and what I will do to help.','Submit the report Thursday and confirm you understand.','That is fine; we will see how it goes.']},
 reactions:{start:['I appreciate you asking. It has been rough.','And I told you I’ve been carrying extra work.','So nothing I say matters, apparently.'],
 open:['The sudden reassignment on Tuesday and a late request on Wednesday.','Okay, I can talk about what I need to meet it.','That is exactly what I have been trying to tell you.'],
 defensive:['All right. I guess I can explain.','Then there is not much point in having this conversation.','Fine. I will keep my thoughts to myself.'],
 facts:['If we agree on the top three priorities, I think that can work.','I can do that if someone helps resolve the other deadlines.','That does not answer the workload problem.'],
 resistance:['Someone has to help clarify which request I can defer.','If you can do that, I can own the deadline.','I suppose I will figure it out.'],
 commit:['That feels reasonable. I will send an update Wednesday afternoon.','Understood. I will send it by Thursday.','I guess we will see.']}
 },
 {id:'resistance',title:'Resistance to a New Process',category:'Change leadership',timeMinutes:14,
 persona:{name:'Dana Ellis',role:'Senior team coordinator',temperament:'Skeptical of change initiatives; deeply committed to colleagues',avatar:'rose'},
 summary:'Navigate employee resistance to a new workflow without mistaking legitimate concerns for disloyalty.',
 objective:'Separate the impact of change from attitude, validate constraints and create shared ownership.',
 context:'A new case routing workflow will launch next month. Dana has extensive institutional knowledge, and the pilot has not yet included her team.',
 lines:{start:'Another new process? The last one made everything worse. People are already exhausted.',
 open:'Nobody asked us whether this would actually work. Some tasks cannot be handled the way the design team assumes.',
 defensive:'So we are just supposed to smile and implement another decision made above us?',
 facts:'The proposed workflow has no clear exception path for the complicated cases my team sees every week.',
 resistance:'We keep bringing up edge cases and leadership keeps saying we will figure it out later.',
 commit:'If there is a real way to test it and report defects, I could help—but I need to know people will listen.'},
 options:{start:['What was most difficult last time, and what are you worried about now?','Leadership has approved the process, so it needs to happen.','Let’s not revisit the past.'],
 open:['Which examples should we use to test the exception process?','The implementation date is fixed; let’s identify what we can still influence.','The design team has probably already covered those.'],
 defensive:['I hear that the rollout feels disconnected. Let’s identify what we can still shape.','Whether you like it or not, you will have to comply.','I will note your objection and move on.'],
 facts:['Will you help us define a pilot with those difficult cases?','Let’s document exception criteria and an escalation owner.','The new workflow will be used exactly as written.'],
 resistance:['Which unresolved scenario creates the greatest operational risk?','Let’s set a specific checkpoint with the project sponsor.','We have spent too much time discussing complaints.'],
 commit:['Let’s run a short pilot and publish what we learned to your team.','Please provide the examples by Friday so we can evaluate them.','Thanks. We will circle back eventually.']},
 reactions:{start:['There is one issue I keep seeing, yes.','That is why people are shutting down.','Then there is no reason to involve us.'],
 open:['We have five types of exceptions the designers have not addressed.','All right. We need clarity on what is negotiable.','That sounds like another guess from someone who has not done the work.'],
 defensive:['I could give you specific examples.','I can follow directions, but do not call this buy-in.','That is what happened last time.'],
 facts:['Yes, if someone actually uses the results.','I can help create that list.','Then we will keep losing time on rework.'],
 resistance:['Urgent cases routed to the wrong team.','If that meeting is real, I can bring the cases.','Okay. We will see what happens.'],
 commit:['A pilot with feedback would make a difference.','I can send the examples and propose a test.','We have heard that before.']}
 },
 {id:'coaching',title:'Coaching Without Giving the Answer',category:'Coaching skills',timeMinutes:11,
 persona:{name:'Alex Chen',role:'New supervisor',temperament:'Capable and motivated, but uncertain about judgment calls',avatar:'sand'},
 summary:'Help a developing supervisor make their own informed decision instead of taking over.',
 objective:'Practice open questions, autonomy support and accountability for a practical experiment.',
 context:'Alex asks for direction after a difficult team scheduling disagreement. You have authority to decide, but want to develop Alex’s judgment.',
 lines:{start:'Can you just tell me what you would do? I do not want to make the wrong call with this team.',
 open:'One person wants the schedule to stay the same, another thinks it is unfair, and I do not know how to weigh it.',
 defensive:'I thought you were supposed to support me. It feels like I am being tested.',
 facts:'I need a fair process, but I am worried that whatever I decide, someone will be unhappy.',
 resistance:'I do not think I can make the decision without someone signing off on every part of it.',
 commit:'I think I can propose a schedule trial if I know when to escalate a problem.'},
 options:{start:['What options have you considered, and what matters most?','I would split the shifts evenly. Here is exactly what to do.','You are the supervisor. Figure it out.'],
 open:['How might each option affect fairness and coverage?','The staffing requirement is non-negotiable. What options meet it?','Just avoid making anyone unhappy.'],
 defensive:['I want to support your judgment, not leave you alone. Let’s think it through.','You need to be independent; I cannot do it for you.','Forget it. I will make the call.'],
 facts:['What small test could help you learn without locking in a bad choice?','What objective standard will you use and communicate?','Just pick the option that causes the least noise.'],
 resistance:['Which part of the decision actually needs my approval?','Let’s set a decision boundary and a check-in point.','You need more confidence, that is all.'],
 commit:['What trial will you run, and how will you evaluate fairness?','Please draft the schedule and include your escalation criteria.','Fine. Handle it however you want.']},
 reactions:{start:['I thought about two options. Maybe we can compare them.','Okay, I will do exactly that.','I was hoping to get some support.'],
 open:['It might help to compare actual coverage and employee constraints.','That gives me a boundary I can work within.','That seems impossible.'],
 defensive:['That makes more sense. I can try to reason it through.','It feels like I am on my own.','All right, if you insist.'],
 facts:['I could try it for two weeks and ask for feedback.','I can write down the criteria before deciding.','I do not think avoiding conflict is realistic.'],
 resistance:['Maybe just the overtime impact.','That would give me a safety net without removing ownership.','I guess.'],
 commit:['I will try a two-week schedule and track coverage and fairness feedback.','I can do that.','I hope it works.']}
 },
 {id:'conflict',title:'Two Employees in Conflict',category:'Conflict resolution',timeMinutes:15,
 persona:{name:'Priya Shah',role:'Project analyst',temperament:'Direct, frustrated, and concerned about being blamed',avatar:'blue'},
 summary:'Address a team conflict without assigning blame before gathering facts.',
 objective:'Use neutral inquiry, identify shared goals, restore practical working agreements.',
 context:'Priya says a colleague changed a shared deliverable without warning. The colleague is not present, so you have only one perspective.',
 lines:{start:'I cannot keep working with Riley. They changed my work again and now I look incompetent.',
 open:'It happened twice, and I only found out when the team saw a different version.',
 defensive:'Are you saying this is my fault? Because I am not going to accept that.',
 facts:'We do not even have a clear approval process for changes, so everyone is editing the same document.',
 resistance:'If you want me to just be nicer, that is not going to fix the problem.',
 commit:'I could use a shared review step, but I also need Riley to follow it.'},
 options:{start:['What happened, and what do you need me to understand?','You both need to act professionally; this has gone on too long.','Avoid Riley until the project is finished.'],
 open:['What evidence or version history can help us establish what changed?','Changes should be reviewed; what process would be workable?','Riley probably meant well, so let us move on.'],
 defensive:['I am not assigning blame. I want to understand the handoff and both perspectives.','I expect everyone to accept some responsibility.','Then I cannot help you.'],
 facts:['What shared rule could prevent surprise edits for both people?','Let us set a clear document owner and review threshold.','Work it out privately and do not bring it back to me.'],
 resistance:['What would a fair conversation with Riley need to include?','I will facilitate a meeting focused on a workable agreement.','You should try to be less sensitive.'],
 commit:['Let us trial the change-control rule and review how it works.','I will document the agreed process and check in next week.','Great, problem solved.']},
 reactions:{start:['The problem is that no one tells me before they change things.','I know how to be professional.','That is not really possible.'],
 open:['The version history should show exactly what happened.','I would support an approval step.','It keeps happening even if they mean well.'],
 defensive:['Okay, that feels fair.','That is not what I am asking for.','Understood.'],
 facts:['A quick review before major edits.','That would make responsibilities clearer.','Then it will probably happen again.'],
 resistance:['I would want both of us to get equal time.','If the meeting stays focused on process, I will participate.','This is not about being sensitive.'],
 commit:['I can try that and report back.','Thank you. I will follow it.','I will believe it when I see it.']}
 },
 {id:'ethics',title:'Speaking Up About an Ethical Concern',category:'Ethical leadership',timeMinutes:13,
 persona:{name:'Samira Brooks',role:'Quality assurance coordinator',temperament:'Thoughtful, nervous about consequences',avatar:'slate'},
 summary:'Respond when a team member raises a potential reporting or compliance concern.',
 objective:'Protect speaking up, avoid promising outcomes, and establish appropriate documented escalation.',
 context:'Samira believes a colleague may have omitted information from a quality report. The facts have not been verified and the appropriate reporting process should be followed.',
 lines:{start:'I noticed something in a report that does not seem right. I am worried I will get someone in trouble if I say anything.',
 open:'A section appears different from the earlier review copy. I cannot tell whether it was an error or intentional.',
 defensive:'I knew I should not have brought this up. I do not want to be the person who gets blamed.',
 facts:'I can identify the version history and the supporting documents. I have not accused anyone.',
 resistance:'If this gets passed around as office gossip, I will regret saying anything.',
 commit:'I can document what I found and bring it through the proper reporting channel if you help me understand the steps.'},
 options:{start:['Thank you for speaking up. What did you observe, without drawing conclusions yet?','That is a serious allegation. You need to prove it.','It is probably just an error. Leave it alone.'],
 open:['Can you preserve the relevant records and identify what you directly observed?','Let us identify the appropriate confidential reporting or review channel.','You should confront the colleague directly.'],
 defensive:['I am not asking you to accuse anyone. Let us separate facts from assumptions.','This is your responsibility now because you raised it.','Then we can forget the whole thing.'],
 facts:['Let us document what we know and route it appropriately.','We can protect the record and use the established review process.','I would rather handle this quietly myself.'],
 resistance:['What confidentiality concerns should we discuss before taking the next step?','We will follow the appropriate protocol and avoid unnecessary disclosure.','Do not worry. Nobody will ever find out.'],
 commit:['Let us confirm the reporting steps and what follow-up I can share appropriately.','Please organize the facts and follow the formal channel.','I am glad we solved that.']},
 reactions:{start:['I noticed a different version and wanted to make sure someone knew.','That is exactly why I am nervous.','I do not feel comfortable ignoring it.'],
 open:['Yes, I can identify the files and dates.','That would help me understand what to do next.','That does not sound appropriate to me.'],
 defensive:['Okay. I can describe exactly what I saw.','I wish I had stayed quiet.','I do not think ignoring it is right.'],
 facts:['I can write down the differences without speculating.','I can help with that.','I am not comfortable with that.'],
 resistance:['I worry about unnecessary disclosure and retaliation.','That sounds more responsible.','You cannot really guarantee that.'],
 commit:['I can do that. Thank you for taking it seriously.','Understood. I will organize what I observed.','I hope this is handled fairly.']}
 },
 {id:'motivation',title:'The Disengaged High Performer',category:'Team motivation',timeMinutes:12,
 persona:{name:'Elena Morales',role:'Senior training specialist',temperament:'Formerly enthusiastic, now withdrawn',avatar:'rose'},
 summary:'Explore declining engagement without making assumptions about an employee’s personal life.',
 objective:'Notice changes, support autonomy, identify organizational obstacles and agree on meaningful next steps.',
 context:'Elena consistently delivered high-quality work but has stopped volunteering for new projects. Her work still meets expectations.',
 lines:{start:'I am doing my job. I do not really see why we need to have a conversation about my attitude.',
 open:'I used to take on the interesting projects, but the assignments always seem to go to the same people now.',
 defensive:'So because I am not volunteering for everything, that is a problem?',
 facts:'I still care about the work. I just do not see a path to use my strengths anymore.',
 resistance:'People say they want feedback, but nothing changes. Why should this be different?',
 commit:'If we could clarify where I can contribute, I would be interested in trying something new.'},
 options:{start:['Your work is strong; I have noticed a change in engagement and wanted to check in.','I expect senior people to set an energetic example.','Then there is nothing to talk about.'],
 open:['What opportunities would make the work more meaningful to you?','Let us discuss how assignments are selected and how to make that transparent.','You should not take assignment decisions personally.'],
 defensive:['Volunteering is not required. I want to understand whether the role still supports you.','You are setting the wrong example.','Forget it. Just keep doing your job.'],
 facts:['What strengths would you most like to use on upcoming work?','We can define development goals and a fair opportunity process.','The work is what it is; try to be positive.'],
 resistance:['What change would demonstrate that your feedback mattered?','Let us agree on one opportunity and a date to review it.','You have to trust leadership.'],
 commit:['Let us match your strengths to a specific project and check back together.','Please identify two development goals we can review.','Maybe something will open up eventually.']},
 reactions:{start:['I appreciate you recognizing the work.','I did not realize enthusiasm was being graded.','Okay.'],
 open:['I would like to mentor others and do more course design.','That would help.','I am not taking it personally.'],
 defensive:['That is fair. I can explain what has changed for me.','Understood.','All right.'],
 facts:['I miss working on challenging design problems.','I would be interested in that.','I guess there is no point discussing it.'],
 resistance:['A real chance to lead a design sprint would matter.','I can work with that.','I have heard that before.'],
 commit:['That sounds worthwhile. Let us define success together.','I will prepare the goals.','I suppose I can wait.']}
 }
];
export const listTemplates=()=>SCENARIOS.map(s=>({id:s.id,title:s.title,category:s.category,summary:s.summary,persona:s.persona.name,timeMinutes:s.timeMinutes}));
export function templateProject(id){const spec=SCENARIOS.find(s=>s.id===id);if(!spec)throw Error('Unknown leadership conversation.');return authored(spec);}
export function starterLibrary(){return SCENARIOS.map(s=>templateProject(s.id));}
