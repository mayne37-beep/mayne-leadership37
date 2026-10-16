import test from 'node:test';
import assert from 'node:assert/strict';
import {
 VERSION,MAX,createProject,addForce,updateForce,removeForce,calculateBalance,addScenario,setScenarioShift,
 effectiveStrength,addAction,addTeam,scoreTeam,teamRanking,normalizeProject,exampleProject,whole
} from '../../assets/force-field-model.js';
import {renderDiagram,sidebarHTML,scenarioControlsHTML,actionsHTML,teamsHTML,reportHTML} from '../../assets/force-field-render.js';

test('Force field totals and balance respond immediately to 1–5 strength changes',()=>{
 const p=createProject('New process');
 const d=addForce(p,'driving','Leadership commitment',{strength:5,y:20});
 const r=addForce(p,'restraining','Change resistance',{strength:3,y:65});
 let b=calculateBalance(p);
 assert.deepEqual([b.driving,b.restraining,b.net],[5,3,2]);
 assert.match(b.verdict,/Driving forces stronger/);
 assert.equal(updateForce(p,r.id,{strength:5}),true);
 b=calculateBalance(p);
 assert.deepEqual([b.driving,b.restraining,b.net],[5,5,0]);
 assert.equal(updateForce(p,d.id,{strength:1}),true);
 assert.equal(calculateBalance(p).net,-4);
 assert.equal(updateForce(p,r.id,{y:-100}),true);
 assert.equal(p.forces[1].y,10);
 assert.throws(()=>addForce(p,'invalid','Anything'),/driving or restraining/);
});

test('What-if scenario shifts use zero to five without changing original force strengths',()=>{
 const p=createProject(),d=addForce(p,'driving','Faster work',{strength:4}),r=addForce(p,'restraining','Workload',{strength:5});
 const base=calculateBalance(p);
 const sc=addScenario(p,'Capacity improves');
 assert.equal(setScenarioShift(p,sc.id,r.id,1),true);
 assert.equal(setScenarioShift(p,sc.id,d.id,5),true);
 assert.equal(r.strength,5);
 assert.equal(d.strength,4);
 const alt=calculateBalance(p,sc);
 assert.equal(alt.restraining,1);assert.equal(alt.driving,5);assert.equal(alt.net,4);
 assert.equal(base.net,-1);
 assert.equal(effectiveStrength(r,sc),1);
 assert.equal(setScenarioShift(p,sc.id,r.id,5),true);
 assert.ok(!Object.hasOwn(sc.shifts,r.id),'Restoring baseline removes shift record');
 assert.equal(setScenarioShift(p,sc.id,r.id,0),true);
 assert.equal(calculateBalance(p,sc).restraining,0);
});

test('Project persistence preserves stakeholder context, links, actions and active what-if scenario',()=>{
 const p=createProject('Change plan');
 const a=addForce(p,'driving','Support',{stakeholder:'Program sponsor',stakeholderInterest:'Quality',confidence:4,evidence:'Survey'});
 addForce(p,'restraining','Capacity',{strength:5});
 const sc=addScenario(p,'Better resourcing');sc.shifts[p.forces[1].id]=2;p.activeScenario=sc.id;
 const action=addAction(p,{forceId:a.id,title:'Brief managers',owner:'Change lead',method:'Communicate',metric:'Awareness',target:'90%'});
 const team=addTeam(p,{name:'Team Alpha',proposal:'Pilot reduced handoff friction',evidence:'Audit log'});
 team.scores.impact=5;
 const restored=normalizeProject(JSON.parse(JSON.stringify(p)));
 assert.equal(restored.forces[0].stakeholder,'Program sponsor');
 assert.equal(restored.actions[0].forceId,a.id);
 assert.equal(restored.activeScenario,sc.id);
 assert.equal(restored.scenarios[0].shifts[p.forces[1].id],2);
 const clone=normalizeProject(p,{regenerate:true});
 assert.notEqual(clone.id,p.id);
 assert.notEqual(clone.forces[0].id,p.forces[0].id);
 assert.equal(clone.actions[0].forceId,clone.forces[0].id);
 assert.equal(clone.scenarios[0].shifts[clone.forces[1].id],2);
 assert.equal(clone.activeScenario,clone.scenarios[0].id);
 assert.notEqual(clone.teams[0].id,team.id);
 assert.equal(action.metric,'Awareness');
});

test('Remove force cleans scenario references and safely unlinks actions',()=>{
 const p=createProject(),a=addForce(p,'driving','Important'),sc=addScenario(p,'Test');
 sc.shifts[a.id]=1;addAction(p,{forceId:a.id,title:'Improve adoption'});
 assert.equal(removeForce(p,a.id),true);
 assert.equal(p.actions[0].forceId,'');
 assert.equal(Object.keys(sc.shifts).length,0);
 assert.equal(removeForce(p,'unknown'),false);
});

test('Classroom challenge scores exactly 20 possible points and ranks teams deterministically',()=>{
 const p=createProject();
 const a=addTeam(p,{name:'A',proposal:'Use evidence to plan'});
 const b=addTeam(p,{name:'B',proposal:'Reduce two barriers'});
 a.scores={impact:5,feasibility:5,evidence:3,stakeholder:5};
 b.scores={impact:4,feasibility:3,evidence:3,stakeholder:4};
 assert.equal(scoreTeam(a).total,18);assert.equal(scoreTeam(b).total,14);
 assert.equal(teamRanking(p)[0].name,'A');
 a.scores.impact=100;
 assert.equal(scoreTeam(a).total,18,'Scoring clamps extreme input to 5');
 assert.match(teamsHTML(p),/18\/20/);
});

test('Printable and visual exports sanitize content and show strength arrows and stakeholders',()=>{
 const p=createProject('<script>alert(1)</script>');
 const f=addForce(p,'driving','<img src=x onerror=alert(1)>',{stakeholder:'Leadership',strength:4});
 addForce(p,'restraining','Insufficient capacity',{strength:2});
 const chart=renderDiagram(p,f.id),print=reportHTML(p);
 assert.match(chart,/viewBox="0 0 1200 680"/);
 assert.match(chart,/data-force=/);
 assert.match(chart,/stroke-dasharray="18 8"/);
 assert.ok(!chart.includes('<img src=x'));
 assert.match(chart,/&lt;img/);
 assert.ok(!print.includes('<script>'));
 assert.match(print,/Stakeholder/);
 assert.match(sidebarHTML(p),/Leadership/);
 assert.match(actionsHTML(p),/No interventions yet/);
 const sc=addScenario(p,'Uncertainty');
 assert.match(scenarioControlsHTML(p,sc),/Baseline/);
});

test('Scenario starter projects include varied forces, a hypothesis, and an action',()=>{
 for(const id of ['leadership','technology','service']){
  const p=exampleProject(id);
  assert.equal(p.forces.length,8);
  assert.equal(p.forces.filter(f=>f.side==='driving').length,4);
  assert.equal(p.forces.filter(f=>f.side==='restraining').length,4);
  assert.equal(p.scenarios.length,1);
  assert.equal(p.actions.length,1);
  assert.equal(p.scenarios[0].title,'Reduce the two largest barriers');
  assert.match(p.context,/Illustrative|Hypothetical/);
  assert.ok(calculateBalance(p,p.scenarios[0]).net>=calculateBalance(p).net);
 }
 assert.throws(()=>exampleProject('unknown'),/Unknown/);
});

test('Import limits and unsupported versions are rejected',()=>{
 const p=createProject();
 assert.throws(()=>normalizeProject({...p,version:VERSION+1}),/Unsupported/);
 assert.throws(()=>normalizeProject({...p,forces:Array(MAX.forces+1).fill({})}),/oversized/);
 assert.equal(whole(16,0,5,2),5);
});
