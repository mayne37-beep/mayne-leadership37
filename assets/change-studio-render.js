import {ADKAR,KOTTER,STATUSES,STANCES,RISK_STATUSES,COMM_STATUSES,escapeHTML as e,clamp,metrics,readiness,earliestADKARBarrier,signals,latestPulse,pulseSeries,riskScore,dateToday} from './change-studio-model.js';

export const option=(value,label,selected)=>'<option value="'+e(value)+'"'+(String(value)===String(selected)?' selected':'')+'>'+e(label)+'</option>';
export const selectOptions=(list,selected)=>list.map(x=>option(x,x,selected)).join('');
export const short=(text,max=95)=>String(text??'').length>max?String(text).slice(0,max-1)+'…':String(text??'');
export const groupName=(p,id)=>p.groups.find(g=>g.id===id)?.name||'All affected groups';
export const stageName=id=>KOTTER.find(k=>k.id===Number(id))?.title||'Change initiative';
export const stageColor=status=>status==='Completed'?'#328a70':status==='In progress'?'#357fb1':status==='Blocked'?'#c47a62':'#9bb1c2';
const makeEmpty=(heading,description,actionLabel='',action='')=>'<div class="empty"><span class="empty-symbol">◈</span><strong>'+e(heading)+'</strong><p>'+e(description)+'</p>'+(action?'<button type="button" class="primary" data-'+action+'>'+e(actionLabel)+'</button>':'')+'</div>';
const strip=(value,max=5)=>'<span class="level-track"><span style="width:'+(clamp(value,0,max,0)/max*100)+'%"></span></span>';
const percent=(value)=>value===null||value===undefined?'—':value+'%';
const bar=(value,max=5)=>'<div class="bar-track"><span style="width:'+Math.round(clamp(value,0,max,0)/max*100)+'%"></span></div>';
export function statsHTML(p){
 const m=metrics(p),ad=m.readiness.overall===null?'—':m.readiness.overall.toFixed(1)+'/5';
 return [['8-step progress',m.stageProgress+'%'],['ADKAR readiness',ad],['Stakeholders',m.stakeholders],['Open risks',m.openRisks]].map(([name,value])=>
  '<div class="stat"><strong>'+value+'</strong><span>'+name+'</span></div>').join('');
}
export function signalsHTML(p){
 const list=signals(p);return list.length?list.map(s=>'<div class="signal"><span>◉</span><p>'+e(s.message)+'</p></div>').join(''):'<div class="signal positive"><span>✓</span><p>No automated gaps detected. Verify this with stakeholder feedback and observed outcomes.</p></div>';
}
export function miniReadinessHTML(p){
 const r=readiness(p);
 if(r.overall===null)return '<p class="muted">Assess stakeholder groups to reveal barriers across Awareness, Desire, Knowledge, Ability and Reinforcement.</p>';
 return '<div class="mini-ratings">'+ADKAR.map(a=>'<div><span>'+a.short+'</span>'+bar(r.dimensions[a.key])+'<b>'+r.dimensions[a.key].toFixed(1)+'</b></div>').join('')+'</div>'+
 '<p class="muted">'+r.assessed+' group(s) assessed; '+r.barriers.length+' with an early rating below 3/5. Ratings are working estimates.</p>';
}
export function pathwayHTML(p){
 return '<div class="pathway">'+KOTTER.map((k,i)=>{
  const d=p.stageData[k.id],color=stageColor(d.status);
  return '<button type="button" data-open-stage="'+k.id+'" class="path-node" style="--path:'+color+'" title="'+e(k.title)+'">'+
   '<span class="path-num">'+(d.status==='Completed'?'✓':k.id)+'</span><span class="path-title">'+e(k.title)+'</span><small>'+e(d.status)+'</small></button>';
 }).join('')+'</div>';
}
function aggregatePulseInfo(p){
 const pulse=latestPulse(p);
 return pulse?'<div class="outcome-tiles"><div><small>Recorded adoption</small><strong>'+pulse.adoption+'%</strong></div><div><small>People trained</small><strong>'+pulse.trained+'%</strong></div><div><small>Confidence</small><strong>'+pulse.confidence+'%</strong></div></div><p class="muted">Latest recorded pulse: '+e(pulse.date)+'. Numbers reflect entries in this project.</p>':
 '<p class="muted">No adoption measurements recorded yet. Enter real data once the change begins.</p>';
}
export function dashboardHTML(p){
 const m=metrics(p),r=m.readiness;
 return '<div class="welcome-panel"><div><span class="eyebrow">MISSION & FUTURE STATE</span><h3>'+e(p.change||'What meaningful change are we trying to achieve?')+'</h3><p>'+e(p.vision||'Write your future vision on the left to create a clear direction for the initiative.')+'</p></div>'+
  '<button type="button" class="white-button" data-go="kotter">Open 8-step roadmap →</button></div>'+
  '<div class="panel-label"><strong>YOUR CHANGE JOURNEY</strong><span>Kotter’s eight steps — an iterative organizational framework</span></div>'+pathwayHTML(p)+
  '<div class="dashboard-grid"><article class="surface"><div class="panel-label"><strong>IMPLEMENTATION PULSE</strong><span>Actual records</span></div>'+
  aggregatePulseInfo(p)+'<button type="button" class="text-button" data-go="outcomes">Track real outcomes →</button></article>'+
  '<article class="surface"><div class="panel-label"><strong>PEOPLE READINESS</strong><span>ADKAR diagnostic</span></div>'+
  (r.overall===null?'<p class="muted">No group assessments yet. Start with the people who must change their daily work.</p>':
  '<div class="readiness-hero"><strong>'+r.overall.toFixed(1)+'</strong><span>out of 5 across groups</span></div><div class="dimension-bars">'+ADKAR.map(a=>'<div><label>'+a.short+'</label>'+bar(r.dimensions[a.key])+'<b>'+r.dimensions[a.key].toFixed(1)+'</b></div>').join('')+'</div>')+
  '<button type="button" class="text-button" data-go="adkar">Assess adoption barriers →</button></article>'+
  '<article class="surface"><div class="panel-label"><strong>EXECUTION SIGNALS</strong><span>Planning status</span></div>'+
  '<div class="execution-metrics"><div><b>'+m.completedStages+'/8</b><span>Stages complete</span></div><div><b>'+m.milestonesDone+'/'+m.milestoneCount+'</b><span>Milestones complete</span></div><div><b>'+m.overdue+'</b><span>Past target date</span></div><div><b>'+m.highRisks+'</b><span>High risks open</span></div></div>'+
  '<button type="button" class="text-button" data-go="roadmap">Manage milestones →</button></article>'+
  '<article class="surface"><div class="panel-label"><strong>ACTIVE RESISTANCE</strong><span>High ratings need review</span></div>'+
  (p.risks.length?'<div class="compact-list">'+[...p.risks].filter(x=>x.status!=='Closed').sort((a,b)=>riskScore(b)-riskScore(a)).slice(0,3).map(x=>
  '<div><strong>'+e(short(x.title,68))+'</strong><span>'+riskScore(x)+'/25 · '+e(x.status)+'</span></div>').join('')+'</div>':
  '<p class="muted">No resistance or risk entries. Use the register to document concerns, their likelihood and possible impact.</p>')+
  '<button type="button" class="text-button" data-go="risks">Address resistance →</button></article></div>'+
  '<div class="learning-note"><strong>Leadership reminder:</strong> Completing Kotter steps does not automatically establish employee adoption. Use observations, feedback and actual outcome data to evaluate whether the new behaviors are taking hold.</div>';
}
export function kotterHTML(p){
 return '<div class="intro-band"><span class="eyebrow">ORGANIZATIONAL CHANGE</span><h3>Eight connected moves—not eight boxes to tick.</h3><p>Use Kotter’s steps to guide organizational momentum. Stages often overlap, repeat, and require ongoing sponsorship.</p></div>'+
 '<div class="kotter-grid">'+KOTTER.map(k=>{
  const s=p.stageData[k.id],count=p.milestones.filter(m=>m.stage===k.id).length;
  return '<article class="kotter-card" style="--stage:'+stageColor(s.status)+'">'+
  '<div class="kotter-head"><span class="stage-num">'+k.id.toString().padStart(2,'0')+'</span><span class="stage-status">'+e(s.status)+'</span></div>'+
  '<h3>'+e(k.title)+'</h3><p class="small-muted">'+e(k.subtitle)+'</p>'+
  '<p class="guide-question">'+e(k.question)+'</p>'+
  '<p class="stage-practice">'+e(s.notes||k.task)+'</p>'+
  '<div class="stage-inline"><label>Progress<select data-stage-status="'+k.id+'">'+selectOptions(STATUSES,s.status)+'</select></label></div>'+
  (s.evidence?'<p class="stage-evidence">Evidence: '+e(short(s.evidence,115))+'</p>':'')+
  '<div class="kotter-foot"><span>'+count+' milestone(s)</span><button type="button" data-edit-stage="'+k.id+'">Edit details ↗</button></div></article>';
 }).join('')+'</div>';
}
const adkarLabel=key=>ADKAR.find(a=>a.key===key)?.short||'Ready';
export function adkarHTML(p){
 const ready=readiness(p);
 return '<div class="intro-band"><span class="eyebrow">INDIVIDUAL ADOPTION</span><h3>What is holding people back?</h3><p>Rate each stakeholder group across the five ADKAR elements (1–5). The earliest element below 3 is highlighted as a potential barrier. These are qualitative ratings, not a validated instrument.</p></div>'+
 '<div class="readiness-dimensions">'+ADKAR.map(a=>{
  const score=ready.dimensions[a.key];return '<div class="dimension-tile"><strong>'+a.short+'</strong><small>'+e(a.prompt)+'</small>'+
  (score===null?'<b>—</b>':bar(score)+'<b>'+score.toFixed(1)+'/5</b>')+'</div>';
 }).join('')+'</div>'+
 '<div class="panel-label"><strong>READINESS BY GROUP</strong><button type="button" data-create="groups" class="primary">＋ Add group</button></div>'+
 (p.groups.length?'<div class="adkar-cards">'+p.groups.map(g=>{
  const barrier=earliestADKARBarrier(g);
  return '<article class="adkar-card"><div class="entry-head"><div><h3>'+e(g.name)+'</h3><p>'+e(g.role||g.stance)+'</p></div><button type="button" data-edit="groups" data-id="'+e(g.id)+'">Edit group ↗</button></div>'+
  '<div class="adkar-grid">'+ADKAR.map(a=>'<label>'+a.short+' <span>'+g.adkar[a.key]+'/5</span><input data-adkar-group="'+e(g.id)+'" data-dimension="'+a.key+'" type="range" min="1" max="5" step="1" value="'+g.adkar[a.key]+'" aria-label="'+e(a.short+' rating for '+g.name)+'"></label>').join('')+'</div>'+
  '<div class="barrier-note '+(barrier?'warn':'ready')+'">'+(barrier?'First potential barrier: '+e(adkarLabel(barrier))+' · Plan support and validate with the group.':'No ADKAR rating below 3 — confirm with observation and feedback.')+'</div></article>';
 }).join('')+'</div>':makeEmpty('No stakeholder assessments yet','Add a group or import names from the Stakeholder Mapping Studio.','Add your first group','create="groups"'))+
 '<div class="learning-note"><strong>ADKAR reflects individual change outcomes:</strong> Awareness → Desire → Knowledge → Ability → Reinforcement. Groups are an approximation; members may differ considerably.</div>';
}
function quadrant(g){
 const hiI=g.influence>=3,hiP=g.impact>=3;
 return hiI?(hiP?'high-high':'high-low'):(hiP?'low-high':'low-low');
}
export function stakeholdersHTML(p){
 const tiles=[
  {id:'high-low',title:'Keep satisfied',description:'High influence · Lower impact'},
  {id:'high-high',title:'Partner closely',description:'High influence · High impact'},
  {id:'low-low',title:'Monitor and listen',description:'Lower influence · Lower impact'},
  {id:'low-high',title:'Keep informed',description:'Lower influence · High impact'}
 ];
 return '<div class="intro-band"><span class="eyebrow">INFLUENCE & IMPACT</span><h3>Map the people affected by change.</h3><p>Drag a stakeholder card into a quadrant to reclassify its influence and impact. Open its details to record stance, concerns and an engagement approach.</p></div>'+
 '<div class="panel-label"><strong>STAKEHOLDER MAP</strong><button type="button" data-create="groups" class="primary">＋ Add stakeholder</button></div>'+
 '<div class="matrix"><div class="matrix-label horizontal">INFLUENCE →</div><div class="matrix-cells">'+tiles.map(t=>
  '<section class="map-quadrant '+t.id+'" data-group-quadrant="'+t.id+'"><header><strong>'+t.title+'</strong><span>'+t.description+'</span></header><div class="group-dropzone">'+p.groups.filter(g=>quadrant(g)===t.id).map(g=>
   '<button draggable="true" type="button" data-map-group="'+e(g.id)+'" title="'+e(g.name+' · '+g.stance)+'"><span class="stake-dot '+g.stance.toLowerCase()+'"></span>'+e(g.name)+'</button>').join('')+'</div></section>').join('')+'</div><div class="matrix-label vertical">↑ IMPACT</div></div>'+
 (p.groups.length?'<div class="panel-label"><strong>ENGAGEMENT REGISTER</strong><span>'+p.groups.length+' affected groups</span></div><div class="entry-stack">'+p.groups.map(g=>
  '<article class="entry-line"><span class="stake-dot '+g.stance.toLowerCase()+'"></span><div><strong>'+e(g.name)+'</strong><small>'+e(g.role||'Role not recorded')+' · Impact '+g.impact+'/5 · Influence '+g.influence+'/5</small><p>'+e(short(g.engagement||g.concerns||'Add an engagement approach and the concerns to address.',145))+'</p></div>'+
  '<select data-stance="'+e(g.id)+'" aria-label="'+e('Change stance for '+g.name)+'">'+selectOptions(STANCES,g.stance)+'</select>'+
  '<button type="button" data-edit="groups" data-id="'+e(g.id)+'">Edit</button></article>').join('')+'</div>':'')+
 '<div class="learning-note">A map is a planning aid, not a label for people. Revisit positions through ongoing consultation and feedback.</div>';
}
export function communicationsHTML(p){
 return '<div class="intro-band"><span class="eyebrow">AUDIENCE · MESSAGE · CHANNEL · FEEDBACK</span><h3>Communicate with purpose.</h3><p>Record who needs which information, when and through what channel. Use follow-up observations to learn whether the message was understood.</p></div>'+
 '<div class="panel-label"><strong>COMMUNICATION SCHEDULE</strong><button type="button" data-create="communications" class="primary">＋ New communication</button></div>'+
 (p.communications.length?'<div class="entry-stack">'+[...p.communications].sort((a,b)=>(a.due||'9999').localeCompare(b.due||'9999')).map(c=>
  '<article class="comm-card"><div class="entry-head"><div><span class="pill">'+e(c.status)+'</span><span class="pill light">'+e(c.channel)+'</span><h3>'+e(groupName(p,c.audienceId))+'</h3></div><div><button data-edit="communications" data-id="'+e(c.id)+'" type="button">Edit</button><button data-delete="communications" data-id="'+e(c.id)+'" class="danger" type="button">×</button></div></div>'+
  '<p>'+e(c.message||'No core message entered.')+'</p><div class="entry-meta"><span>Owner: '+e(c.owner||'Unassigned')+'</span><span>When: '+e(c.due||'Unscheduled')+'</span><span>Cadence: '+e(c.frequency||'One time')+'</span></div>'+
  (c.result?'<p class="feedback"><strong>Feedback:</strong> '+e(c.result)+'</p>':'')+
  '<label class="inline-select">Status<select data-communication-status="'+e(c.id)+'">'+selectOptions(COMM_STATUSES,c.status)+'</select></label></article>').join('')+'</div>':
  makeEmpty('No communications planned','Add an audience, a meaningful message, channel, cadence and feedback plan.','Add communication','create="communications"'))+
 '<div class="learning-note"><strong>Communication is two-way:</strong> Include opportunities to listen and modify the implementation based on what you learn.</div>';
}
export function roadmapHTML(p){
 return '<div class="intro-band"><span class="eyebrow">PHASES · MILESTONES · OWNERSHIP</span><h3>Make the change journey tangible.</h3><p>Move milestone cards between Kotter stages by dragging them. Change their dates and status, and record the outcomes that prove a stage has advanced.</p></div>'+
 '<div class="panel-label"><strong>DRAGGABLE CHANGE ROADMAP</strong><button type="button" data-create="milestones" class="primary">＋ Add milestone</button></div>'+
 '<div class="roadmap-scroll"><div class="roadmap-lanes">'+KOTTER.map(k=>{
  const items=p.milestones.filter(m=>m.stage===k.id),stage=p.stageData[k.id];
  return '<section class="roadmap-lane" data-lane="'+k.id+'"><header><span class="lane-number">'+k.id+'</span><strong>'+e(k.title)+'</strong><small>'+e(stage.status)+'</small></header><div class="roadmap-drop">'+items.map(m=>
   '<article class="milestone-card" draggable="true" data-drag-milestone="'+e(m.id)+'"><span class="card-grip" aria-hidden="true">⠿</span><h4>'+e(m.title)+'</h4><p>'+e(m.owner||'Unassigned')+'</p>'+
   '<div class="milestone-meta"><span>'+e(m.due||'No date')+'</span><span class="pill '+(m.status==='Completed'?'positive':'')+'">'+e(m.status)+'</span></div>'+
   '<div class="milestone-tools"><button type="button" data-edit="milestones" data-id="'+e(m.id)+'">Edit</button><button type="button" data-delete="milestones" data-id="'+e(m.id)+'" class="danger">×</button></div></article>').join('')+
  '<button class="lane-add" type="button" data-add-stage-milestone="'+k.id+'">＋ Add to stage '+k.id+'</button></div></section>';
 }).join('')+'</div></div>'+
 '<div class="panel-label"><strong>DELIVERY ACTIONS</strong><button type="button" data-create="actions">＋ Add action</button></div>'+
 (p.actions.length?'<div class="entry-stack">'+p.actions.map(a=>
 '<article class="entry-line"><div class="action-icon">✓</div><div><strong>'+e(a.title)+'</strong><small>'+e(stageName(a.stage))+' · '+e(a.owner||'Unassigned')+' · '+e(a.due||'No date')+'</small><p>'+e(short(a.successMeasure||a.result||'Add a measurable outcome',140))+'</p></div>'+
 '<select data-action-status="'+e(a.id)+'">'+selectOptions(STATUSES,a.status)+'</select><button type="button" data-edit="actions" data-id="'+e(a.id)+'">Edit</button></article>').join('')+'</div>':
 '<p class="muted">No actions recorded. Create a specific, assigned action for each high-priority change activity.</p>');
}
export function risksHTML(p){
 const ranked=[...p.risks].sort((a,b)=>riskScore(b)-riskScore(a));
 let matrix='<div class="risk-grid"><div class="risk-caption">LIKELIHOOD ↑</div>';
 for(let likelihood=5;likelihood>=1;likelihood--){
  for(let impact=1;impact<=5;impact++){
   const level=likelihood*impact,n=p.risks.filter(r=>r.likelihood===likelihood&&r.impact===impact&&r.status!=='Closed').length;
   matrix+='<div class="risk-cell '+(level>=15?'high':level>=8?'medium':'low')+'" title="Likelihood '+likelihood+' × Impact '+impact+' = '+level+'"><b>'+level+'</b><span>'+n+' open</span></div>';
  }
 }
 matrix+='</div><div class="risk-axis">IMPACT → (1–5)</div>';
 return '<div class="intro-band"><span class="eyebrow">RESISTANCE · BARRIERS · TRADE-OFFS</span><h3>Understand resistance before responding to it.</h3><p>Identify sources of concern, evaluate likelihood and impact, and create respectful responses rather than treating resistance as a defect.</p></div>'+
 '<div class="panel-label"><strong>RISK HEAT MAP</strong><button type="button" class="primary" data-create="risks">＋ Add risk / resistance</button></div>'+
 matrix+'<div class="panel-label"><strong>RISK & RESISTANCE REGISTER</strong><span>'+ranked.length+' entries</span></div>'+
 (ranked.length?'<div class="entry-stack">'+ranked.map(r=>
  '<article class="risk-card"><div class="entry-head"><div><span class="risk-score '+(riskScore(r)>=15?'high':riskScore(r)>=8?'medium':'low')+'">'+riskScore(r)+'/25</span><h3>'+e(r.title)+'</h3><small>'+e(groupName(p,r.groupId))+' · Likelihood '+r.likelihood+'/5 · Impact '+r.impact+'/5</small></div>'+
  '<div><button type="button" data-edit="risks" data-id="'+e(r.id)+'">Edit</button><button type="button" data-delete="risks" data-id="'+e(r.id)+'" class="danger">×</button></div></div>'+
  '<p><strong>Response:</strong> '+e(r.response||'Response not planned.')+'</p><div class="entry-meta"><span>Owner: '+e(r.owner||'Unassigned')+'</span><span>Due: '+e(r.due||'Not scheduled')+'</span></div>'+
  '<label class="inline-select">Status<select data-risk-status="'+e(r.id)+'">'+selectOptions(RISK_STATUSES,r.status)+'</select></label></article>').join('')+'</div>':
  makeEmpty('No risks or resistance logged','Record barriers, concerns and possible unintended consequences, then plan how to test and address them.','Add resistance','create="risks"'))+
 '<div class="learning-note">Risk score = likelihood × impact, based on your estimates. Ask whether concerns reveal legitimate gaps in communication, design, workload or trust.</div>';
}
function pointChart(p){
 const data=pulseSeries(p),w=900,h=310,L=52,R=20,T=18,B=45,plotW=w-L-R,plotH=h-T-B;
 let s='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+w+' '+h+'" role="img" aria-label="Recorded change adoption, training and confidence across '+data.length+' dates">';
 for(let val=0;val<=100;val+=25){
  const y=T+plotH*(1-val/100);s+='<line x1="'+L+'" y1="'+y+'" x2="'+(w-R)+'" y2="'+y+'" stroke="#dde8f0" stroke-dasharray="4 5"/><text x="'+(L-9)+'" y="'+(y+4)+'" text-anchor="end" fill="#6c8497" font-size="12">'+val+'%</text>';
 }
 if(!data.length){s+='<text x="'+w/2+'" y="'+h/2+'" text-anchor="middle" fill="#8ea3b3" font-size="15">Add a pulse to visualize actual adoption measurements</text>'}
 else{
  const X=i=>L+(data.length===1?plotW/2:i*plotW/(data.length-1)),Y=v=>T+plotH*(1-v/100);
  [['adoption','#2e7faf'],['trained','#49a58b'],['confidence','#d2a458']].forEach(([key,color])=>{
   const coords=data.map((p,i)=>X(i)+','+Y(p[key])).join(' ');
   if(data.length>1)s+='<polyline points="'+coords+'" fill="none" stroke="'+color+'" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>';
   data.forEach((p,i)=>{s+='<circle cx="'+X(i)+'" cy="'+Y(p[key])+'" r="5.7" fill="white" stroke="'+color+'" stroke-width="3"/>'});
  });
  data.forEach((p,i)=>s+='<text x="'+X(i)+'" y="'+(h-17)+'" text-anchor="middle" font-size="11" fill="#6c879e">'+e(short(p.date,10))+'</text>');
 }
 s+='</svg>';return s;
}
export function outcomesHTML(p){
 const latest=latestPulse(p),done=p.actions.filter(a=>a.status==='Completed').length;
 return '<div class="intro-band"><span class="eyebrow">MONITOR · LEARN · REINFORCE</span><h3>Measure whether the change is taking hold.</h3><p>Record dated adoption, training coverage, and employee confidence. Track results—not just task completion—and revisit the change strategy with real feedback.</p></div>'+
 '<div class="panel-label"><strong>CHANGE ADOPTION TREND</strong><button type="button" data-create="pulses" class="primary">＋ Record measurement</button></div>'+
 '<div class="chart-card"><div class="chart-legend"><span><i style="--dot:#2e7faf"></i>Adoption</span><span><i style="--dot:#49a58b"></i>Training</span><span><i style="--dot:#d2a458"></i>Confidence</span></div>'+
 pointChart(p)+'</div>'+
 '<div class="outcome-tiles spread"><div><small>Latest adoption</small><strong>'+percent(latest?.adoption)+'</strong></div><div><small>Training reach</small><strong>'+percent(latest?.trained)+'</strong></div><div><small>Confidence</small><strong>'+percent(latest?.confidence)+'</strong></div><div><small>Actions complete</small><strong>'+done+'/'+p.actions.length+'</strong></div></div>'+
 '<div class="panel-label"><strong>RECORDED MEASUREMENTS</strong><span>'+p.pulses.length+' data points</span></div>'+
 (p.pulses.length?'<div class="entry-stack">'+pulseSeries(p).reverse().map(t=>
 '<article class="entry-line"><div class="pulse-date">'+e(t.date)+'</div><div><strong>Adoption '+t.adoption+'% · Trained '+t.trained+'% · Confidence '+t.confidence+'%</strong><p>'+e(t.notes||'No notes entered.')+'</p></div>'+
 '<button type="button" data-edit="pulses" data-id="'+e(t.id)+'">Edit</button><button type="button" data-delete="pulses" data-id="'+e(t.id)+'" class="danger">×</button></article>').join('')+'</div>':
 makeEmpty('No pulse data yet','Start with an observed baseline. Enter new measures over time to see whether behavior and confidence improve.','Record first pulse','create="pulses"'))+
 '<div class="learning-note">The chart displays values entered into this project. It does not collect employee responses automatically or calculate a statistically validated readiness score.</div>';
}
const table=(head,rows)=>rows.length?'<table><thead><tr>'+head.map(t=>'<th>'+e(t)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(r=>'<tr>'+r.map(x=>'<td>'+e(x??'')+'</td>').join('')+'</tr>').join('')+'</tbody></table>':'<p>No entries yet.</p>';
export function reportHTML(p){
 const metric=metrics(p),r=readiness(p);
 return '<header><small>MAYNE LEADERSHIP · CHANGE MANAGEMENT STUDIO</small><h1>'+e(p.title)+'</h1><p>'+e(p.change||'Change not yet described')+'</p><p>Updated '+e(new Date().toLocaleDateString())+' · Owner '+e(p.owner||'Unassigned')+'</p></header>'+
 '<section><h2>Purpose and vision</h2><p><strong>Why now:</strong> '+e(p.why)+'</p><p><strong>Vision:</strong> '+e(p.vision)+'</p><p><strong>Success measure:</strong> '+e(p.successDefinition)+'</p><p><strong>Scope:</strong> '+e(p.scope)+'</p></section>'+
 '<section><h2>Kotter implementation roadmap</h2>'+pathwayHTML(p)+table(['Step','Status','Owner','Due','Evidence','Notes'],KOTTER.map(k=>[k.id+' '+k.title,p.stageData[k.id].status,p.stageData[k.id].owner,p.stageData[k.id].due,p.stageData[k.id].evidence,p.stageData[k.id].notes]))+'</section>'+
 '<section><h2>Stakeholder and ADKAR assessment</h2><p>Group averages are self-reported/planning judgments, not validated measures. Average: '+(r.overall??'—')+'</p>'+
 table(['Group','Stance','Impact','Influence',...ADKAR.map(a=>a.short),'First barrier','Concerns','Engagement'],p.groups.map(g=>[g.name,g.stance,g.impact,g.influence,...ADKAR.map(a=>g.adkar[a.key]),earliestADKARBarrier(g)||'None below 3',g.concerns,g.engagement]))+'</section>'+
 '<section><h2>Communication plan</h2>'+table(['Audience','Message','Channel','Owner','Date','Cadence','Status','Feedback'],p.communications.map(c=>[groupName(p,c.audienceId),c.message,c.channel,c.owner,c.due,c.frequency,c.status,c.result]))+'</section>'+
 '<section><h2>Milestones and assigned actions</h2>'+table(['Milestone','Stage','Owner','Target date','Status','Measure','Result'],p.milestones.map(m=>[m.title,stageName(m.stage),m.owner,m.due,m.status,m.measure,m.result]))+
 table(['Action','Stage','Owner','Date','Status','Success measure','Result'],p.actions.map(a=>[a.title,stageName(a.stage),a.owner,a.due,a.status,a.successMeasure,a.result]))+'</section>'+
 '<section><h2>Resistance and risks</h2>'+table(['Risk','Affected group','Likelihood','Impact','Score','Response','Owner','Status'],p.risks.map(q=>[q.title,groupName(p,q.groupId),q.likelihood,q.impact,riskScore(q),q.response,q.owner,q.status]))+'</section>'+
 '<section><h2>Real adoption outcomes</h2><div class="chart-card">'+pointChart(p)+'</div>'+table(['Date','Adoption %','Trained %','Confidence %','Notes'],pulseSeries(p).map(x=>[x.date,x.adoption,x.trained,x.confidence,x.notes]))+
 '<p>Completed stages: '+metric.completedStages+'/8. High-scoring open risks: '+metric.highRisks+'. Readiness estimates should be validated independently.</p></section>';
}
