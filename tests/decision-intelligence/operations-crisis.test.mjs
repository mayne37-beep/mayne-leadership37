import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeProject,scoreMatrix,evaluateTree,probabilityStatus,teamScore,setRating,setScenarioOverride,activeScenario} from '../../assets/decision-intelligence-model.js';
import {buildOperationsCrisisProject,OPERATIONS_CASE_ID,operationsBriefHTML,operationsGuideHTML,operationsReportHTML} from '../../assets/operations-crisis-scenario.js';

test('Operations Crisis Response is a complete, plausible fictional briefing rather than a stub',()=>{
 const p=buildOperationsCrisisProject(),ex=p.exercise;
 assert.equal(ex.id,OPERATIONS_CASE_ID);
 assert.match(p.title,/OPERATION CONTINUITY/);
 assert.match(p.question,/Harbor County Public Services/);
 assert.match(p.context,/FICTIONAL CLASSROOM EXERCISE/);
 assert.equal(ex.durationMinutes,75);
 assert.equal(ex.rounds.length,4);
 assert.equal(ex.rounds.reduce((sum,r)=>sum+r.duration,0),65,'10 additional minutes reserved for debrief');
 assert.deepEqual(ex.rounds.map(r=>r.id),['stabilize','reassess','protect','decide']);
 assert.equal(ex.roles.length,5);
 assert.ok(ex.facts.some(x=>x.status==='Verified'));
 assert.ok(ex.facts.some(x=>x.status==='Reported'));
 assert.ok(ex.facts.some(x=>x.status==='Unknown'));
 assert.ok(ex.facts.some(x=>x.status==='Assumption'));
 assert.equal(ex.debrief.length,10);
 assert.equal(ex.currentRound,0);
 assert.match(ex.facilitator,/Opening script/);
 assert.equal(ex.rounds[1].injectIndexes[0],0);
 assert.deepEqual(ex.rounds[2].injectIndexes,[1,2]);
 assert.deepEqual(ex.rounds[3].injectIndexes,[3]);
});
test('Scenario provides four distinct response strategies and evidence-tagged weighted criteria',()=>{
 const p=buildOperationsCrisisProject();
 assert.equal(p.options.length,4);
 assert.equal(p.criteria.length,5);
 assert.equal(p.criteria.reduce((sum,c)=>sum+c.weight,0),100);
 assert.equal(p.criteria.find(c=>c.direction==='Cost').name,'Workforce load');
 for(const o of p.options){
  for(const criterion of p.criteria){
   const r=o.ratings[criterion.id];
   assert.ok(r.score>=1&&r.score<=5);
   assert.equal(r.tag,'Estimate');
   assert.match(r.note,/NOT verified performance/);
  }
 }
 const scores=scoreMatrix(p);
 assert.equal(scores.valid,true);
 assert.equal(scores.ranking.length,4);
 assert.ok(scores.ranking.every(o=>o.score!==null));
 assert.ok(scores.ranking[0].score<=5&&scores.ranking[0].score>=1);
});
test('Complete branching tree has valid chance probabilities and evaluable results',()=>{
 const p=buildOperationsCrisisProject(),root=p.nodes.find(n=>!n.parentId);
 assert.equal(p.nodes.length,13);
 const children=p.nodes.filter(n=>n.parentId===root.id);
 assert.equal(children.length,4);
 for(const n of children){
  assert.equal(n.type,'chance');
  assert.equal(probabilityStatus(p,n.id).total,100);
  assert.equal(probabilityStatus(p,n.id).valid,true);
  assert.equal(p.nodes.filter(x=>x.parentId===n.id).length,2);
 }
 const ev=evaluateTree(p);
 assert.equal(ev.complete,true);
 assert.ok(ev.rootValue>0);
 assert.deepEqual(ev.warnings,[]);
});
test('Three what-if situations change assumptions but do not modify baseline facts',()=>{
 const p=buildOperationsCrisisProject(),baseline=scoreMatrix(p);
 assert.equal(p.scenarios.length,3);
 assert.equal(p.activeScenario,'','Opening scenario should use baseline rather than revealing later conditions.');
 for(const s of p.scenarios){
  assert.ok(s.title.includes('Scenario'));
  assert.ok(Object.keys(s.weightShifts).length>0);
  assert.equal(scoreMatrix(p,s).valid,true);
  assert.equal(evaluateTree(p,s).complete,true);
 }
 const originals=p.options.map(o=>o.ratings[p.criteria[0].id].score);
 const change=p.scenarios[1];
 setScenarioOverride(p,change.id,'score',p.options[0].id,p.criteria[0].id,1);
 assert.equal(scoreMatrix(p).ranking[0].id,baseline.ranking[0].id);
 assert.deepEqual(p.options.map(o=>o.ratings[p.criteria[0].id].score),originals);
});
test('Instructor-managed injects are unrevealed and release only on instruction',()=>{
 const p=buildOperationsCrisisProject();
 assert.equal(p.injects.length,4);
 assert.ok(p.injects.every(i=>i.revealed===false));
 const before=operationsBriefHTML(p);
 assert.match(before,/CURRENT ROUND/);
 assert.match(before,/INITIAL INCIDENT BRIEF/);
 assert.match(before,/Role|leadership perspectives/i);
 assert.ok(!before.includes('A third-party service dependency'),'Unreleased inject must not be rendered in the visible brief');
 assert.ok(!before.includes('A reporter asks'),'Future inject must not be rendered to participants');
 p.exercise.currentRound=1;
 let brief=operationsBriefHTML(p);
 assert.match(brief,/Reveal next round update/);
 assert.ok(!brief.includes('restoration window is an estimate'));
 p.injects[0].revealed=true;
 brief=operationsBriefHTML(p);
 assert.match(brief,/4–6 hour restoration window/);
 const projector=operationsBriefHTML(p,{projector:true,timer:'14:30',timerRunning:true});
 assert.match(projector,/Exit projector mode/);
 assert.match(projector,/14:30/);
 assert.ok(!projector.includes('data-case-reveal'));
 assert.ok(!projector.includes('case-team-response'));
 assert.ok(!projector.includes('data-case-guide'));
 const guide=operationsGuideHTML(p);
 assert.match(guide,/Opening script/);
 assert.match(guide,/UPDATE 4/);
 assert.match(guide,/No choice is scored as automatically correct/);
});
test('Round journals and exercise metadata persist through JSON roundtrip and independent copy',()=>{
 const p=buildOperationsCrisisProject();
 p.exercise.currentRound=3;
 p.teams[0].roundNotes={stabilize:'Initial focus: urgent triage',reassess:'Reassigned trained staff',decide:'Pause unapproved logs and audit'};
 p.teams[0].scores.reasoning=5;
 p.injects[1].revealed=true;
 const serialized=JSON.parse(JSON.stringify(p));
 const restored=normalizeProject(serialized),clone=normalizeProject(serialized,{regenerate:true});
 for(const project of [restored,clone]){
  assert.equal(project.exercise.id,OPERATIONS_CASE_ID);
  assert.equal(project.exercise.currentRound,3);
  assert.equal(project.teams[0].roundNotes.reassess,'Reassigned trained staff');
  assert.equal(project.teams[0].scores.reasoning,5);
  assert.equal(project.injects[1].revealed,true);
  assert.match(operationsReportHTML(project),/Pause unapproved logs and audit/);
  assert.equal(project.options.length,4);
  assert.equal(project.nodes.length,13);
 }
 assert.notEqual(clone.id,p.id);
 assert.notEqual(clone.teams[0].id,p.teams[0].id);
 assert.notEqual(clone.criteria[0].id,p.criteria[0].id);
 assert.equal(restored.teams[0].id,p.teams[0].id);
 assert.match(operationsReportHTML(p),/Initial focus: urgent triage/);
});
test('Classroom teams start without prescribed decisions or scores and can be expanded',()=>{
 const p=buildOperationsCrisisProject();
 assert.equal(p.teams.length,2);
 assert.deepEqual(p.teams.map(t=>t.name),['Team Blue','Team Gold']);
 assert.ok(p.teams.every(t=>t.recommendation===''&&teamScore(t)===0));
 assert.equal(p.brief.recommendationId,'');
 assert.equal(p.brief.recommendation,'');
 assert.match(p.brief.assumptions,/invented for classroom analysis/);
 assert.equal(p.risks.length,6);
});
test('Scenario content is HTML-escaped in participant and facilitator views',()=>{
 const p=buildOperationsCrisisProject();
 p.exercise.opening='<script>attack()</script>';
 p.exercise.roles[0].question='<img onerror=attack() src=x>';
 p.injects[0].message='<svg onload=attack()> ';
 p.injects[0].revealed=true;
 const views=[operationsBriefHTML(p),operationsGuideHTML(p),operationsReportHTML(p)];
 for(const html of views){
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('<img onerror=attack()'));
  assert.ok(!html.includes('<svg onload=attack()>'));
 }
 assert.ok(views[0].includes('&lt;script&gt;'));
});
