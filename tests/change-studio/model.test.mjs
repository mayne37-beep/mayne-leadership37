import test from 'node:test';
import assert from 'node:assert/strict';
import {VERSION,MAX,ADKAR,KOTTER,createProject,exampleProject,setStage,addGroup,changeGroup,moveGroupQuadrant,earliestADKARBarrier,readiness,
 addMilestone,updateMilestone,addCommunication,addRisk,addAction,addPulse,riskScore,metrics,signals,latestPulse,pulseSeries,removeRecord,
 normalizeProject,importStakeholders,importResistingForces} from '../../assets/change-studio-model.js';
import {dashboardHTML,kotterHTML,adkarHTML,stakeholdersHTML,communicationsHTML,roadmapHTML,risksHTML,outcomesHTML,reportHTML} from '../../assets/change-studio-render.js';

test('Eight Kotter stages remain editable and stage progress derives from explicit statuses',()=>{
 const p=createProject('Transformation');assert.equal(KOTTER.length,8);assert.equal(Object.keys(p.stageData).length,8);
 assert.equal(metrics(p).stageProgress,0);
 setStage(p,1,{status:'Completed',owner:'Director',evidence:'Validated urgency message'});
 setStage(p,2,{status:'In progress',due:'2027-06-01'});
 setStage(p,3,{status:'Blocked'});
 assert.equal(metrics(p).completedStages,1);
 assert.equal(metrics(p).blockedStages,1);
 assert.equal(metrics(p).stageProgress,19);
 assert.equal(p.stageData[1].evidence,'Validated urgency message');
 assert.throws(()=>setStage(p,9,{status:'Completed'}),/Unknown/);
});

test('ADKAR readiness detects first weak link per group and reflects direct rating updates',()=>{
 const p=createProject();
 const a=addGroup(p,{name:'Field team',adkar:{awareness:5,desire:2,knowledge:1,ability:4,reinforcement:3}});
 const b=addGroup(p,{name:'Management',adkar:{awareness:5,desire:5,knowledge:5,ability:5,reinforcement:5}});
 assert.equal(earliestADKARBarrier(a),'desire');
 assert.equal(earliestADKARBarrier(b),null);
 assert.equal(readiness(p).assessed,2);assert.equal(readiness(p).dimensions.awareness,5);
 assert.equal(readiness(p).barriers.length,1);
 changeGroup(p,a.id,{adkar:{desire:4,knowledge:4}});
 assert.equal(earliestADKARBarrier(a),null);
 assert.equal(readiness(p).barriers.length,0);
 assert.equal(readiness(createProject()).overall,null);
});

test('Drag-to-quadrant stakeholder map updates influence and impact, not name or ADKAR',()=>{
 const p=createProject(),a=addGroup(p,{name:'Operations',impact:2,influence:2,stance:'Concerned'});
 const before={...a.adkar};
 moveGroupQuadrant(p,a.id,5,4);
 assert.equal(a.impact,5);assert.equal(a.influence,4);
 assert.deepEqual(a.adkar,before);assert.equal(a.stance,'Concerned');
 const html=stakeholdersHTML(p);
 assert.match(html,/data-group-quadrant="high-high"/);
 assert.match(html,/draggable="true"/);assert.match(html,/data-map-group=/);
 assert.match(html,/Operations/);
});

test('Milestones are movable between Kotter stages and measurable actions can be linked',()=>{
 const p=createProject(),g=addGroup(p,{name:'Supervisor cohort'});
 const m=addMilestone(p,{title:'Pilot live training',stage:4,measure:'Completion >= 90%',status:'In progress'});
 updateMilestone(p,m.id,{stage:6,status:'Completed'});
 assert.equal(p.milestones[0].stage,6);
 assert.equal(p.milestones[0].status,'Completed');
 const a=addAction(p,{title:'Run pilot',stage:6,relatedGroupId:g.id,successMeasure:'Learners demonstrate new skills'});
 assert.equal(a.relatedGroupId,g.id);assert.equal(metrics(p).milestonesDone,1);
 const html=roadmapHTML(p);
 assert.match(html,/data-lane="6"/);assert.match(html,/data-drag-milestone/);
 assert.match(html,/Run pilot/);
});

test('Communications, resistance and deletion preserve valid references',()=>{
 const p=createProject(),g=addGroup(p,{name:'Frontline'});
 const c=addCommunication(p,{audienceId:g.id,message:'Explain why',channel:'Briefing',status:'Sent'});
 const r=addRisk(p,{title:'Workload anxiety',groupId:g.id,likelihood:5,impact:4,response:'Listen before redesigning'});
 const action=addAction(p,{title:'Solicit feedback',relatedGroupId:g.id});
 assert.equal(riskScore(r),20);assert.equal(metrics(p).highRisks,1);
 assert.match(communicationsHTML(p),/Explain why/);
 assert.match(risksHTML(p),/Workload anxiety/);
 removeRecord(p,'groups',g.id);
 assert.equal(c.audienceId,'');assert.equal(r.groupId,'');assert.equal(action.relatedGroupId,'');
 assert.throws(()=>removeRecord(p,'external','irrelevant'),/Invalid/);
});

test('Recorded adoption pulse trend is chronological, and latest measurement is date-based',()=>{
 const p=createProject();
 addPulse(p,{date:'2026-12-03',adoption:60,trained:75,confidence:70});
 addPulse(p,{date:'2026-11-03',adoption:15,trained:30,confidence:26});
 assert.equal(latestPulse(p).date,'2026-12-03');
 assert.deepEqual(pulseSeries(p).map(x=>x.adoption),[15,60]);
 assert.equal(metrics(p).latest.adoption,60);
 assert.match(outcomesHTML(p),/polyline/);
 assert.match(outcomesHTML(p),/60%/);
 assert.match(reportHTML(p),/60/);
});

test('Import and duplicate remap stakeholder links and preserve Kotter + ADKAR data',()=>{
 const p=exampleProject('ai');
 const origGroup=p.groups[0].id;
 const cloned=normalizeProject(JSON.parse(JSON.stringify(p)),{regenerate:true});
 assert.notEqual(cloned.id,p.id);assert.notEqual(cloned.groups[0].id,origGroup);
 assert.equal(cloned.communications[0].audienceId,cloned.groups[0].id);
 assert.equal(cloned.risks[0].groupId,cloned.groups[0].id);
 assert.equal(cloned.actions[0].relatedGroupId,cloned.groups[0].id);
 assert.equal(cloned.groups[0].adkar.desire,p.groups[0].adkar.desire);
 assert.equal(cloned.stageData[1].status,'Completed');
 const restored=normalizeProject(JSON.parse(JSON.stringify(p)));
 assert.equal(restored.groups[0].id,origGroup);
 assert.equal(restored.risks[0].groupId,origGroup);
});

test('Toolkit imports safely skip duplicate stakeholder names and restraining forces',()=>{
 const p=createProject();
 const source={nodes:[{label:'Change Sponsor',role:'Sponsor',stance:'Champion',x:840,y:120,notes:'Needs transparency'},
  {label:'Operations',stance:'Concerned',x:200,y:550},{label:'Operations',stance:'Neutral'}]};
 let result=importStakeholders(p,source);
 assert.equal(result.added,2);assert.equal(result.skipped,1);
 assert.equal(p.groups[0].name,'Change Sponsor');assert.equal(p.groups[0].stance,'Champion');
 assert.equal(p.groups[0].impact,5);assert.equal(p.groups[0].influence,5);
 const ff={forces:[{side:'driving',label:'Strong sponsorship',strength:5},
  {side:'restraining',label:'Capacity limits',strength:4,stakeholder:'Operations',evidence:'Reports'},
  {side:'restraining',label:'Capacity limits',strength:4}]};
 result=importResistingForces(p,ff);
 assert.equal(result.added,1);assert.equal(result.skipped,1);
 assert.equal(p.risks[0].groupId,p.groups[1].id);
 assert.equal(p.risks[0].likelihood,4);
});

test('Three editable classroom cases contain model-driven content without claiming empirical findings',()=>{
 for(const name of ['virtual','ai','operations']){
  const p=exampleProject(name);
  assert.equal(p.groups.length,4);
  assert.ok(p.milestones.length>0&&p.communications.length>0&&p.risks.length>0&&p.pulses.length>0);
  assert.match(p.scope,/Illustrative/);
  assert.match(dashboardHTML(p),/change journey/i);
  assert.match(kotterHTML(p),/Create urgency/);
  assert.match(adkarHTML(p),/range/);
 }
});

test('Rendered content escapes user input and rejects unsupported or oversized imported data',()=>{
 const p=createProject('<script>alert("hi")</script>');
 p.change='<img onerror="hack" src="x">';
 addGroup(p,{name:'<svg onload=hack()>'});
 const page=dashboardHTML(p),report=reportHTML(p);
 assert.ok(!page.includes('<img onerror'));
 assert.ok(!report.includes('<script>'));
 assert.match(report,/&lt;script&gt;/);
 assert.throws(()=>normalizeProject({...p,version:VERSION+1}),/Unsupported/);
 assert.throws(()=>normalizeProject({...p,groups:Array(MAX.groups+1).fill({})}),/supported limits/);
 assert.ok(signals(p).some(s=>s.kind==='planning'));
});
