/* Operations Crisis Response — a complete, fictional leadership decision exercise.
   This example contains no real agency incident data or empirically validated forecast. */
import {createProject,addCriterion,addOption,setRating,addNode,addScenario,setScenarioOverride,addRisk,addTeam,addInject,normalizeExercise,escapeHTML as e,scoreMatrix,evaluateTree,RUBRIC,teamScore} from './decision-intelligence-model.js';

export const OPERATIONS_CASE_ID='operations-crisis-response';

export function buildOperationsCrisisProject(){
 const p=createProject('OPERATION CONTINUITY · Service Outage Crisis');
 p.question='How should Harbor County Public Services sustain critical resident services during an extended digital outage?';
 p.objective='Protect time-sensitive residents, sustain defensible service continuity, control information integrity, and communicate honestly while systems are restored.';
 p.context='FICTIONAL CLASSROOM EXERCISE. Harbor County Public Services operates three service centers and a phone intake team. Its CivicBridge scheduling and case-status portal has become unavailable during a weekday service peak. Staff can still answer phones, but service histories and appointments are not consistently retrievable. The cause, restoration time, and full customer impact are unknown. Do not infer a cyberattack or publish a recovery promise from unverified information. Figures are invented for discussion.';
 p.owner='Incident decision lead / assigned team';
 p.status='Exploring';
 p.deadline='';
 p.nodes[0].title='How will we sustain priority services during an uncertain outage?';
 p.nodes[0].x=165;p.nodes[0].y=735;p.nodes[0].w=270;p.nodes[0].h=147;
 p.nodes[0].evidenceTag='Fact';
 p.nodes[0].evidence='Fictional incident briefing: a central case and scheduling system is unavailable. Exact restoration time is unknown.';
 p.nodes[0].notes='You may combine approaches or propose a different solution. Explain trade-offs and thresholds for changing course.';

 const criteria=[
  {name:'Priority service continuity',weight:30,direction:'Benefit',explanation:'How reliably are urgent and time-sensitive requests protected?'},
  {name:'Accuracy & accountability',weight:20,direction:'Benefit',explanation:'Identity checking, traceability, data integrity and reliable reconciliation.'},
  {name:'Speed to stabilize',weight:20,direction:'Benefit',explanation:'How quickly does the approach produce safe, useful continuity?'},
  {name:'Accessibility & trust',weight:15,direction:'Benefit',explanation:'Clear communications, equitable access and attention to affected residents.'},
  {name:'Workforce load',weight:15,direction:'Cost',explanation:'Resource strain: 1 means low burden, 5 means high burden. Cost scoring reverses preference.'}
 ];
 criteria.forEach(c=>addCriterion(p,c.name,c));
 const alternatives=[
  {name:'A · Central restoration first',description:'Concentrate technical and operations resources on recovering CivicBridge; provide restricted urgent escalation while normal requests queue.',
   rationale:'Strong consistency after restoration, but unknown outage duration may create service gaps.',
   scores:[2,5,3,2,2],evidence:[
    'Assumes restoration work advances fastest when specialists are uninterrupted; no verified ETA.',
    'A single controlled system could reduce reconciliation errors once available.',
    'No credible restoration estimate is currently available.',
    'Residents may receive incomplete or delayed help if no alternative process is activated.',
    'Lower immediate manual burden, but backlog may grow.']},
  {name:'B · Prioritized manual triage',description:'Activate approved paper intake for urgent cases; verify identity, record each decision, and hold nonurgent work for system restoration.',
   rationale:'Protects time-sensitive needs but requires disciplined triage and reconciliation.',
   scores:[5,4,4,4,4],evidence:[
    'The existing approved paper workflow is available at one center, but not all staff are trained.',
    'Approval and audit safeguards can protect record integrity when applied consistently.',
    'An urgent triage queue can begin using currently staffed phone and service channels.',
    'A clear urgent-case process can preserve access, but capacity will be limited.',
    'Manual triage and reconciliation create significant staff effort.']},
  {name:'C · Distributed continuity network',description:'Have all three centers independently handle appointments and new requests using temporary logs and local coordination.',
   rationale:'Broadens access but increases training demands, duplication risk and inconsistent controls.',
   scores:[4,2,4,4,5],evidence:[
    'Broad coverage could help many residents, but urgent prioritization may be inconsistent.',
    'Only one center currently has an approved offline process; controls at others are unverified.',
    'Delegation can start promptly but quality depends on training and coordination.',
    'More locations may preserve access for residents without reliable phone or online service.',
    'Training, duplicate checks, and manual handoffs generate high workload.']},
  {name:'D · Two-track continuity command',description:'Keep a dedicated restoration team while central triage uses a controlled offline urgent-case process; issue a transparent public status update and set pivot triggers.',
   rationale:'Balances restoration and protected urgent access, at the cost of coordination complexity.',
   scores:[5,4,4,5,4],evidence:[
    'Separating critical triage from restoration can protect time-sensitive residents.',
    'A controlled intake log and designated reconciliation owner support traceability.',
    'Triage and restoration can begin in parallel if roles and staffing are assigned.',
    'Specific, honest status communication can improve accessibility without promising an ETA.',
    'Two-track operations stretch supervisors and require decision cadence and escalation.']}
 ];
 alternatives.forEach(a=>{
  const o=addOption(p,a.name,{description:a.description,rationale:a.rationale});
  p.criteria.forEach((c,i)=>setRating(p,o.id,c.id,{score:a.scores[i],tag:'Estimate',note:'Scenario-based facilitator estimate, NOT verified performance. '+a.evidence[i]}));
 });
 const possible=[
  {name:'A · Central restoration first',y:180,probability:55,goodUtility:78,badUtility:22,
    good:'Restoration in manageable window',bad:'Long outage and growing queue',
    goodEvidence:'Estimated probability and utility; technical recovery is not yet confirmed.',badEvidence:'Potential extended outage leaves many residents waiting.'},
  {name:'B · Prioritized manual triage',y:485,probability:70,goodUtility:79,badUtility:30,
    good:'Urgent needs handled with controlled logs',bad:'Triage congestion and reconciliation backlog',
    goodEvidence:'Hypothetical controlled triage with trained staff and identity checks.',badEvidence:'Manual processing and handoffs may exceed actual capacity.'},
  {name:'C · Distributed continuity network',y:790,probability:55,goodUtility:84,badUtility:22,
    good:'Multiple centers sustain access',bad:'Duplicate or inconsistent case records',
    goodEvidence:'Assumes other centers can adopt approved workflows quickly.',badEvidence:'Unverified workarounds create accountability and record risks.'},
  {name:'D · Two-track continuity command',y:1095,probability:65,goodUtility:83,badUtility:29,
    good:'Priority service and restoration both progress',bad:'Coordination overload reduces controls',
    goodEvidence:'Assumes clear incident roles and a single log for exceptional cases.',badEvidence:'Competing demands can produce gaps in escalation and documentation.'}
 ];
 const branchNodes=[];
 for(const spec of possible){
  const branch=addNode(p,p.nodes[0].id,'chance',{title:spec.name,x:600,y:spec.y,w:260,h:145,
   evidenceTag:'Estimate',evidence:'A hypothetical planning path, not a measured probability distribution.',
   notes:'Teams must explain how this strategy could succeed or fail.'});
  branchNodes.push(branch);
  addNode(p,branch.id,'outcome',{title:spec.good,x:1180,y:spec.y-81,w:270,h:130,probability:spec.probability,utility:spec.goodUtility,
   evidenceTag:'Estimate',evidence:spec.goodEvidence,notes:'Utility is an illustrative preference score from 0–100.'});
  addNode(p,branch.id,'outcome',{title:spec.bad,x:1180,y:spec.y+81,w:270,h:130,probability:100-spec.probability,utility:spec.badUtility,
   evidenceTag:'Assumption',evidence:spec.badEvidence,notes:'A plausible setback. Explore a mitigation or alternative.'});
 }
 const risks=[
  ['Unreliable recovery estimate leads to false promises',4,4,'Technical lead cannot verify an estimated restoration time.',
   'Communicate current service status, accessible alternatives and the next update time, not a guessed ETA.','Communications lead'],
  ['Manual intake creates duplicate or incomplete records',4,5,'Different centers maintain incompatible lists or incomplete identity checks.',
   'Use one approved continuity log, trained record owners, unique case references and a reconciliation checkpoint.','Operations lead'],
  ['Urgent needs get buried in a general queue',4,5,'Backlog rises while the number of time-sensitive escalations is not visible.',
   'Create documented triage categories, track wait time, prioritize validated urgent cases and establish escalation criteria.','Service supervisor'],
  ['Employees are overloaded and make avoidable errors',4,4,'Overtime increases; accuracy checks are skipped.',
   'Rotate trained staff, define decision rights and set a sustainable escalation cadence.','Field supervisor'],
  ['Public rumor undermines trust',3,4,'Unconfirmed claims spread and staff offer conflicting explanations.',
   'Separate verified facts from unknowns, coordinate spokesperson updates and avoid speculating about cause.','Communications lead'],
  ['Workarounds unintentionally exclude some residents',3,4,'In-person and telephone queues rise; language and accessibility support falls.',
   'Preserve accessible channels, offer clear instructions and explicitly account for hard-to-reach residents.','Customer advocate']
 ];
 risks.forEach(([failure,likelihood,impact,warning,safeguard,owner])=>addRisk(p,{failure,likelihood,impact,warning,safeguard,owner}));

 const i1=addInject(p,{title:'UPDATE 1 · Restoration uncertainty',
  message:'10:05 — The technology team confirms the portal remains unavailable. A third-party service dependency cannot be restored immediately. A reliable ETA is still unavailable; a 4–6 hour restoration window is an estimate, not a guarantee. New incoming requests have increased by approximately 40%. What will you change in your plan?'});
 const i2=addInject(p,{title:'UPDATE 2 · Priority services under strain',
  message:'10:35 — Callers requesting time-sensitive service have increased sharply. A supervisor reports that a subset of residents cannot complete the usual identity-verification process online. Meanwhile, phone waits have more than doubled. Which requests receive priority, what are your safeguards, and how will you prevent inequitable access?'});
 const i3=addInject(p,{title:'UPDATE 3 · Public trust and an unverified rumor',
  message:'11:05 — A reporter asks whether private case information has been exposed. The rumor is circulating online, but the technical team has not established a data-security incident. Senior leadership requests a public update within 15 minutes. Draft what you can say responsibly, what remains unknown, and your next update commitment.'});
 const i4=addInject(p,{title:'UPDATE 4 · Manual record control failure',
  message:'11:25 — A preliminary review discovers two offline records that may refer to the same request. Staff at another center have started an unapproved shared worksheet. There is no confirmed harm, but record accuracy cannot be guaranteed. Decide whether to pause, centralize, modify, or continue the workaround with immediate controls.'});

 const delayed=addScenario(p,'Scenario · Outage extends beyond the service window');
 delayed.description='Hypothetical: restoration will likely take more than one shift. Test whether your preferred strategy still makes sense.';
 setScenarioOverride(p,delayed.id,'weight',p.criteria[0].id,null,40);
 setScenarioOverride(p,delayed.id,'weight',p.criteria[4].id,null,10);
 setScenarioOverride(p,delayed.id,'score',p.options[0].id,p.criteria[2].id,1);
 setScenarioOverride(p,delayed.id,'score',p.options[0].id,p.criteria[0].id,1);
 const surge=addScenario(p,'Scenario · Time-sensitive demand surges');
 surge.description='Hypothetical: priority-call demand increases and staff capacity is fixed. Examine continuity, access and workload trade-offs.';
 setScenarioOverride(p,surge.id,'weight',p.criteria[0].id,null,45);
 setScenarioOverride(p,surge.id,'score',p.options[2].id,p.criteria[1].id,1);
 setScenarioOverride(p,surge.id,'score',p.options[1].id,p.criteria[4].id,5);
 const trust=addScenario(p,'Scenario · Unverified data rumor affects confidence');
 trust.description='Hypothetical: information remains unconfirmed. Increase the relative importance of trustworthy communications and record integrity, without treating the rumor as fact.';
 setScenarioOverride(p,trust.id,'weight',p.criteria[3].id,null,30);
 setScenarioOverride(p,trust.id,'weight',p.criteria[1].id,null,30);
 p.activeScenario='';

 addTeam(p,{name:'Team Blue',recommendation:'',evidence:'',tradeoffs:''});
 addTeam(p,{name:'Team Gold',recommendation:'',evidence:'',tradeoffs:''});
 p.brief.assumptions='Planning scores, probabilities and utilities are invented for classroom analysis. Recovery duration, request volumes and offline capacity must be independently verified. A rumor is not proof of a security incident.';
 p.brief.reviewTrigger='Revisit the strategy if the recovery estimate shifts materially, urgent-case wait times rise, data integrity is at risk, or resources become unavailable.';
 p.brief.accountable='Incident decision lead';
 p.brief.dissent='Invite a dissenting perspective from the customer advocate and technology lead before finalizing a recommendation.';
 p.brief.recommendation='';

 p.exercise=normalizeExercise({
  id:OPERATIONS_CASE_ID,
  title:'OPERATION CONTINUITY',
  subtitle:'The CivicBridge Outage · Leadership Decision Challenge',
  agency:'Harbor County Public Services (fictional)',
  incidentTime:'Tuesday · 09:12',
  durationMinutes:75,
  opening:'It is 09:12 on a busy Tuesday. The CivicBridge public appointments and case-status portal is unavailable. Three service centers and a telephone intake team serve residents who depend on scheduled appointments and time-sensitive requests. Staff are being asked for answers they do not have. The technology team is investigating, but has provided no confirmed cause or reliable restoration time. You are the incident leadership team. In the next 75 minutes you must maintain essential services, protect records and communicate responsibly as the situation evolves.',
  participant:'You are not being asked to choose one predetermined correct answer. Select a defensible response, justify it using facts and assumptions, identify the consequences you are willing to accept, and explain when you would change course. You may combine alternatives or create a different option. You will receive staged updates; your team should adapt when evidence changes.',
  facilitator:'Opening script: "Harbor County Public Services has lost its case and scheduling portal during the morning service peak. You are the response team. It is your decision to make, and you will not be handed a perfect set of facts. Your responsibility is to protect residents, support employees, preserve accurate records, and explain the trade-offs in your choice." Do not imply one strategy is objectively superior. Use the matrix and tree to prompt questions, not produce the answer. Numbers are fictional; reinforce this at the outset.',
  objectives:[
   'Frame an ambiguous operations crisis as a decision with explicit objectives and constraints.',
   'Compare response options while distinguishing verified scenario facts from estimates and unknowns.',
   'Reassess a decision when circumstances and stakeholder needs change.',
   'Use pre-mortem thinking to anticipate unintended consequences and set safeguards.',
   'Deliver a short accountable leadership recommendation with review triggers.'
  ],
  constraints:[
   'A digital case-and-appointment system is unavailable; cause and restoration timing are unknown.',
   'Three service centers and the telephone team remain staffed, but access to full case histories is restricted.',
   'Only one center has a previously approved paper continuity procedure; not all employees are trained.',
   'Supervisors may temporarily reassign up to six staff, but doing so reduces normal counter coverage.',
   'Additional staffing or significant emergency spending needs senior authorization.',
   'All temporary handling must maintain identity verification, records control and accessibility.'
  ],
  facts:[
   {status:'Verified',text:'CivicBridge appointment and case-status functions are unavailable to frontline users.',source:'09:12 operations check'},
   {status:'Verified',text:'Telephone intake is working, but wait times are increasing.',source:'Call-center supervisor'},
   {status:'Verified',text:'Three centers are open; one has an approved offline continuity form.',source:'Service-center reports'},
   {status:'Reported',text:'About 420 appointments fall within the next four hours; counts may contain duplicates.',source:'Last available daily roster'},
   {status:'Reported',text:'A regional manager estimates approximately 4,800 daily requests across channels.',source:'Prior workload report'},
   {status:'Unknown',text:'Cause of the outage and dependable restoration time.',source:'Technology investigation'},
   {status:'Unknown',text:'How many residents have a truly time-sensitive deadline today.',source:'Needs validated triage'},
   {status:'Assumption',text:'All sites could use temporary manual processing safely with brief instruction.',source:'Not yet tested'}
  ],
  roles:[
   {name:'Incident Decision Lead',goal:'Set priorities, assign authority and defend the decision.',concern:'Avoid fragmented decisions and unmanaged risk.',question:'Which outcome will you sacrifice if everything cannot be protected?'},
   {name:'Technology & Recovery Lead',goal:'Restore service while protecting system integrity.',concern:'False restoration promises and disruptive workarounds.',question:'What operational support can you provide without assuming an ETA?'},
   {name:'Public Communications Lead',goal:'Give accurate, accessible and timely updates.',concern:'Conflicting statements, rumors and loss of trust.',question:'What can you say with confidence right now?'},
   {name:'Service Center Supervisor',goal:'Keep urgent work moving with current staff.',concern:'Workload, inconsistent manual procedures and errors.',question:'Who can handle which cases, and how will you supervise quality?'},
   {name:'Resident Advocate',goal:'Protect equitable access and time-sensitive needs.',concern:'People with limited mobility, language support needs or complex cases.',question:'Which residents would your preferred plan leave behind?'}
  ],
  rounds:[
   {id:'stabilize',title:'Stabilize the situation',time:'09:12',duration:12,
    mission:'Build a shared understanding. Select an initial response approach, describe which services continue, and identify the first action owners.',
    decisionPrompt:'What will you prioritize in the first 30 minutes, and why?',
    deliverables:['Primary approach and one rejected alternative','Top three immediate actions and an accountable owner for each','Two major assumptions and a trigger for changing course'],
    facilitator:'Provide the opening brief and roles; invite teams to use the decision matrix and initial tree. Ask each team to explain who is most exposed to harm from delay. Do not reveal future updates.',
    injectIndexes:[]},
   {id:'reassess',title:'Reassess with limited capacity',time:'10:05',duration:18,
    mission:'The restoration picture has changed. Reweight or revise the initial approach. Establish a sustainable incident cadence and time-sensitive triage.',
    decisionPrompt:'Do you maintain, modify or replace your first strategy?',
    deliverables:['Updated option ranking and reason for the change','Priority triage definition, owner and an observable measure','One explicit resource trade-off'],
    facilitator:'Reveal Update 1. Require teams to label estimates and explain why a possible 4–6 hour window is not a reliable ETA. Ask who owns reconciliation if offline processing begins.',
    injectIndexes:[0]},
   {id:'protect',title:'Protect residents and credibility',time:'10:35',duration:18,
    mission:'Service demand is rising. Assess accessibility, integrity, public confidence and the cost of acting on unconfirmed information.',
    decisionPrompt:'How will you protect priority access and explain the situation without speculation?',
    deliverables:['Revised triage and accessibility safeguards','A 45-second public status message with one thing still unknown','At least two pre-mortem failure modes and warning signs'],
    facilitator:'Reveal Update 2. Later reveal Update 3 when the teams have outlined initial triage. Pause to ask: “What part of the rumor is confirmed?” Avoid awarding credit for confidently stating unsupported causes.',
    injectIndexes:[1,2]},
   {id:'decide',title:'Make and defend the decision',time:'11:25',duration:17,
    mission:'Information integrity is under pressure. Decide whether to halt, modify or control the workaround; deliver a final defensible recommendation.',
    decisionPrompt:'What should leadership authorize now, and what would make you reverse it?',
    deliverables:['90-second executive decision brief per team','Accountable decision owner and next review milestone','Safeguards for manual record integrity and a response to peer challenge'],
    facilitator:'Reveal Update 4. Ask teams to distinguish operational urgency from permission to bypass critical controls. Invite one other team to challenge the recommendation and the presenting team to revise if needed.',
    injectIndexes:[3]}
  ],
  debrief:[
   'What evidence most strongly shaped your first response—and what later challenged it?',
   'Which alternative scored best in the weighted matrix? Did that make it the right choice for your team?',
   'How did you address urgent needs without creating unacceptable record-integrity risks?',
   'What did your team treat as a fact that was actually an assumption or an estimate?',
   'What feedback from the Resident Advocate changed your approach?',
   'At what point would you halt a workaround even if service delays increased?',
   'How did the public-status message balance transparency with uncertainty?',
   'What outcome would you monitor during the next shift to know whether your decision worked?',
   'Did your team change course because the data changed, or because someone persuaded the group?',
   'What would you do differently as the accountable leader on a similar incident?'
  ],
  currentRound:0
 });
 return p;
}

const tagStatus=status=>({Verified:'verified',Reported:'reported',Unknown:'unknown',Assumption:'assumption'})[status]||'unknown';
const card=(text)=>'<li>'+e(text)+'</li>';
const items=(array)=>'<ul>'+array.map(card).join('')+'</ul>';
export function operationsBriefHTML(p,{projector=false,timer='12:00',timerRunning=false}={}){
 const ex=p.exercise;
 if(!ex||ex.id!==OPERATIONS_CASE_ID)return '';
 const round=ex.rounds[ex.currentRound]||ex.rounds[0],index=ex.currentRound;
 const shown=p.injects.filter(n=>n.revealed);
 const pending=round.injectIndexes.filter(i=>p.injects[i]&&!p.injects[i].revealed);
 const currentTotal=ex.rounds.reduce((sum,r)=>sum+r.duration,0);
 const pct=Math.round(100*(index+1)/ex.rounds.length);
 return '<section class="case-shell" aria-label="Operation Continuity case briefing">'+
  '<div class="case-banner"><div><span class="case-overline">SIMULATED INCIDENT COMMAND · '+e(ex.incidentTime)+'</span>'+
   '<h2>'+e(ex.title)+'</h2><p>'+e(ex.subtitle)+' · '+e(ex.agency)+'</p></div>'+
   '<div class="case-banner-tools"><span class="case-duration">'+e(ex.durationMinutes)+' MIN EXERCISE</span>'+
   '<button type="button" data-case-projector="1">'+(projector?'Exit projector mode':'▣ Projector mode')+'</button>'+
   (!projector?'<button type="button" data-case-guide="1">☰ Facilitator guide</button>':'')+'</div></div>'+
  '<div class="case-situation"><span class="eyebrow">INITIAL INCIDENT BRIEF</span><p>'+e(ex.opening)+'</p></div>'+
  '<div class="case-status-bar"><div><small>CURRENT ROUND</small><strong>'+('0'+(index+1)).slice(-2)+' / '+('0'+ex.rounds.length).slice(-2)+'</strong></div>'+
   '<div><small>INCIDENT CLOCK</small><strong>'+e(round.time)+'</strong></div>'+
   '<div><small>FACILITATOR COUNTDOWN</small><strong id="case-timer-label" aria-label="Time remaining">'+e(timer)+'</strong></div>'+
   '<div class="case-timer-tools"><button data-case-timer-toggle="1" type="button">'+(timerRunning?'Pause':'Start timer')+'</button>'+
    '<button data-case-timer-reset="1" type="button">Reset</button></div></div>'+
  '<div class="case-progress" role="group" aria-label="Scenario rounds">'+ex.rounds.map((r,i)=>'<button type="button" class="case-round-btn'+(i===index?' active':'')+(i<index?' completed':'')+'" data-case-round="'+i+'" aria-current="'+(i===index?'step':'false')+'"><span>'+('0'+(i+1)).slice(-2)+'</span><strong>'+e(r.title)+'</strong><small>'+r.duration+' min</small></button>').join('')+'</div>'+
  '<div class="case-round-focus"><div class="case-round-header"><div><span class="eyebrow">ROUND '+(index+1)+' / '+ex.rounds.length+' · '+e(round.time)+'</span>'+
   '<h3>'+e(round.title)+'</h3><p>'+e(round.mission)+'</p></div><span class="case-round-duration">'+round.duration+' MIN</span></div>'+
   '<div class="case-round-columns"><div><h4>Decision prompt</h4><p>'+e(round.decisionPrompt)+'</p><h4>Required team outputs</h4>'+items(round.deliverables)+'</div>'+
   '<div><h4>Situation updates</h4>'+
    (shown.length?shown.map(n=>'<div class="case-update"><span>RELEASED · '+e(n.title)+'</span><p>'+e(n.message)+'</p></div>').join(''):
      '<p class="muted">No additional information has been released. Work with the initial briefing and known constraints.</p>')+
    (!projector&&pending.length?'<button type="button" class="primary" data-case-reveal="1">Reveal next round update ('+pending.length+' remaining)</button>':'')+
    '</div></div>'+
  '</div>'+
  '<div class="case-controls"><button type="button" data-case-back="1"'+(index===0?' disabled':'')+'>← Previous round</button>'+
   '<div class="case-controls-center"><span>'+Math.max(1,currentTotal)+' min of planned rounds + '+Math.max(0,ex.durationMinutes-currentTotal)+' min debrief</span></div>'+
   '<button type="button" class="primary" data-case-next="1"'+(index===ex.rounds.length-1?' disabled':'')+'>Next round →</button></div>'+
  '<div class="case-fact-heading"><div><span class="eyebrow">INCIDENT INTELLIGENCE</span><h3>What we know — and what we do not</h3></div>'+
   '<span class="case-fact-caption">Figures are fictional classroom inputs</span></div>'+
  '<div class="case-facts">'+ex.facts.map(f=>'<article class="case-fact"><span class="case-tag '+tagStatus(f.status)+'">'+e(f.status)+'</span>'+
   '<p>'+e(f.text)+'</p><small>'+e(f.source)+'</small></article>').join('')+'</div>'+
  '<div class="case-grid-pair"><article class="case-detail"><span class="eyebrow">OPERATIONAL CONSTRAINTS</span>'+items(ex.constraints)+'</article>'+
   '<article class="case-detail"><span class="eyebrow">YOUR TASK</span><p>'+e(ex.participant)+'</p>'+
   '<strong>Learning outcomes</strong>'+items(ex.objectives)+'</article></div>'+
  '<div class="case-roles"><div class="case-fact-heading"><div><span class="eyebrow">PEOPLE & CONSEQUENCES</span><h3>Assign the five leadership perspectives</h3></div></div>'+
  '<div class="case-role-grid">'+ex.roles.map((role,i)=>'<article class="case-role"><span class="case-role-number">'+String(i+1).padStart(2,'0')+'</span>'+
   '<h4>'+e(role.name)+'</h4><p>'+e(role.goal)+'</p><small>Watch for: '+e(role.concern)+'</small>'+
   '<blockquote>'+e(role.question)+'</blockquote></article>').join('')+'</div></div>'+
  (!projector?'<div class="case-team-notes"><div class="case-fact-heading"><div><span class="eyebrow">LEARNING IN ACTION</span><h3>Team response journal · '+e(round.title)+'</h3></div></div>'+
   '<p class="muted">Each team records its working decision at every round. Edits save on this device and remain available for the debrief.</p>'+
   p.teams.map(t=>'<label class="case-team-response"><strong>'+e(t.name)+'</strong>'+
    '<textarea data-case-team="'+e(t.id)+'" data-case-response="'+e(round.id)+'" rows="3" maxlength="1800" placeholder="What are you choosing, why, and what would make you pivot?">'+
    e(t.roundNotes?.[round.id]||'')+'</textarea></label>').join('')+'</div>':'')+
 '</section>';
}
export function operationsGuideHTML(p){
 const ex=p.exercise;if(!ex||ex.id!==OPERATIONS_CASE_ID)return '';
 return '<section class="case-guide"><p class="case-guide-intro">FACILITATOR ONLY · '+e(ex.durationMinutes)+'-minute exercise · '+e(ex.agency)+'</p>'+
  '<h3>Opening script</h3><p>'+e(ex.facilitator)+'</p>'+
  '<h3>Suggested flow and round scripts</h3>'+
  ex.rounds.map((r,i)=>'<article class="case-guide-round"><h4>Round '+(i+1)+': '+e(r.title)+' · '+r.duration+' min · '+e(r.time)+'</h4>'+
   '<p>'+e(r.facilitator)+'</p><p><strong>Decision challenge:</strong> '+e(r.decisionPrompt)+'</p>'+
   '<p><strong>Release when ready:</strong></p>'+
   (r.injectIndexes.length?'<ul>'+r.injectIndexes.map(index=>{
    const n=p.injects[index];return '<li><strong>'+e(n?.title||'')+'</strong> — '+e(n?.message||'Not available')+'</li>';
   }).join('')+'</ul>':'<p>No inject in this round.</p>')+'</article>').join('')+
  '<h3>Debrief · '+Math.max(0,ex.durationMinutes-ex.rounds.reduce((a,b)=>a+b.duration,0))+' min</h3>'+items(ex.debrief)+
  '<h3>Transparent facilitator scoring</h3><p>Score each team 0–5 on Reasoning, Evidence, Trade-offs and Adaptation. No choice is scored as automatically correct. A score of 5 requires a well-defended approach, with appropriate attention to facts, uncertainty, people, safeguards and new information.</p>'+
  '<h3>Privacy and delivery limits</h3><p>Fictional scenario: do not use it as operating guidance for any real agency. The studio saves locally and does not send student responses to a live shared workspace. Projector mode hides the unreleased updates, facilitator guide and team journal from the visible presentation surface.</p></section>';
}
export function operationsReportHTML(p){
 const ex=p.exercise;if(!ex||ex.id!==OPERATIONS_CASE_ID)return '';
 const tableRows=ex.rounds.map((r,i)=>'<tr><td>'+(i+1)+'</td><td>'+e(r.title)+'</td><td>'+e(r.decisionPrompt)+'</td><td>'+
  p.teams.map(t=>e(t.name+': '+(t.roundNotes?.[r.id]||'No response logged'))).join('<p>')+'</td></tr>').join('');
 return '<section class="case-print"><h2>Operations Crisis Response · Facilitator exercise</h2>'+
  '<p>'+e(ex.opening)+'</p><h3>Round-by-round team response log</h3><table><thead><tr><th>Round</th><th>Focus</th><th>Decision prompt</th><th>Responses</th></tr></thead><tbody>'+tableRows+'</tbody></table>'+
  '<h3>Released incident updates</h3>'+
  p.injects.filter(n=>n.revealed).map(n=>'<p><strong>'+e(n.title)+'</strong>: '+e(n.message)+'</p>').join('')+
  '<h3>Debrief questions</h3>'+items(ex.debrief)+'</section>';
}
