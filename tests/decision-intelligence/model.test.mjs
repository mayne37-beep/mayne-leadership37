import test from 'node:test';
import assert from 'node:assert/strict';
import {VERSION,LIMIT,RUBRIC,TYPES,createProject,addCriterion,addOption,setRating,scoreMatrix,
 addNode,updateNode,deleteNode,reparentNode,isDescendant,organizeTree,probabilityStatus,evaluateTree,
 addScenario,activeScenario,setScenarioOverride,sensitivity,addRisk,addTeam,teamScore,rankedTeams,
 addInject,addDecision,normalizeProject,sampleProject,deleteOption,deleteCriterion} from '../../assets/decision-intelligence-model.js';
import {treeNodesHTML,treeLinksHTML,treeResultsHTML,diagramSVG,matrixHTML,rankingHTML,
 scenarioControlsHTML,scenarioResultsHTML,risksHTML,teamsHTML,injectsHTML,briefPreviewHTML,reportHTML} from '../../assets/decision-intelligence-render.js';

test('matrix uses normalized weights and cost criteria reverse their preference scores',()=>{
 const p=createProject();
 const effectiveness=addCriterion(p,'Effectiveness',{weight:70,direction:'Benefit'});
 const resources=addCriterion(p,'Resource demand',{weight:30,direction:'Cost'});
 const alpha=addOption(p,'Alpha'),beta=addOption(p,'Beta');
 setRating(p,alpha.id,effectiveness.id,{score:5,tag:'Fact',note:'Observed pilot'});
 setRating(p,alpha.id,resources.id,{score:5});
 setRating(p,beta.id,effectiveness.id,{score:3});setRating(p,beta.id,resources.id,{score:1});
 let ranks=scoreMatrix(p);
 assert.equal(ranks.weightTotal,100);
 assert.equal(ranks.ranking[0].name,'Alpha');
 assert.equal(ranks.ranking.find(x=>x.id===alpha.id).score,3.8);
 assert.equal(ranks.ranking.find(x=>x.id===beta.id).score,3.6);
 resources.weight=100;effectiveness.weight=0;ranks=scoreMatrix(p);
 assert.equal(ranks.ranking[0].name,'Beta');
 assert.equal(ranks.ranking[0].score,5);
 resources.weight=0;assert.equal(scoreMatrix(p).valid,false);
 assert.equal(scoreMatrix(p).ranking[0].score,null);
});

test('tree evaluator uses decision maximization and correctly normalized chance expected value',()=>{
 const p=createProject(),root=p.nodes[0];
 const first=addNode(p,root.id,'chance',{title:'Path A'});
 const second=addNode(p,root.id,'outcome',{title:'Path B',utility:48});
 const good=addNode(p,first.id,'outcome',{title:'A works',probability:70,utility:100});
 const bad=addNode(p,first.id,'outcome',{title:'A fails',probability:30,utility:-20});
 const result=evaluateTree(p);
 assert.equal(probabilityStatus(p,first.id).total,100);
 assert.equal(result.values.get(first.id),64);
 assert.equal(result.rootValue,64);
 assert.equal(result.complete,true);
 updateNode(p,bad.id,{probability:40});
 const invalid=evaluateTree(p);
 assert.equal(probabilityStatus(p,first.id).valid,false);
 assert.equal(invalid.rootValue,null);
 assert.match(invalid.warnings.join(' '),/110%/);
 updateNode(p,bad.id,{probability:30});
 assert.throws(()=>addNode(p,good.id,'decision'),/terminal/i);
 assert.ok(isDescendant(p,first.id,bad.id));
 assert.equal(reparentNode(p,first.id,bad.id),false,'cycles are prohibited');
 assert.equal(deleteNode(p,root.id),false,'root deletion prohibited');
 assert.equal(deleteNode(p,first.id),true);
 assert.ok(!p.nodes.find(x=>x.id===good.id));
 assert.equal(p.nodes.length,2);
});

test('scenario overrides change calculated scores but preserve original rating, utility, and probability',()=>{
 const p=createProject(),criterion=addCriterion(p,'Trust',{weight:100}),a=addOption(p,'Pilot'),b=addOption(p,'Launch');
 setRating(p,a.id,criterion.id,{score:4});setRating(p,b.id,criterion.id,{score:2});
 const choice=addNode(p,p.nodes[0].id,'chance',{title:'New path'});
 const good=addNode(p,choice.id,'outcome',{probability:60,utility:80});
 const setback=addNode(p,choice.id,'outcome',{probability:40,utility:0});
 const base=scoreMatrix(p),tree=evaluateTree(p).rootValue;
 const sc=addScenario(p,'Stricter budget');assert.equal(activeScenario(p).id,sc.id);
 setScenarioOverride(p,sc.id,'score',b.id,criterion.id,5);
 setScenarioOverride(p,sc.id,'weight',criterion.id,null,40);
 setScenarioOverride(p,sc.id,'utility',good.id,null,100);
 setScenarioOverride(p,sc.id,'probability',good.id,null,50);
 setScenarioOverride(p,sc.id,'probability',setback.id,null,50);
 assert.equal(scoreMatrix(p,sc).ranking[0].id,b.id);
 assert.equal(base.ranking[0].id,a.id);
 assert.equal(p.options[1].ratings[criterion.id].score,2);
 assert.equal(p.nodes.find(x=>x.id===good.id).utility,80);
 assert.equal(p.nodes.find(x=>x.id===good.id).probability,60);
 assert.notEqual(evaluateTree(p,sc).rootValue,tree);
 assert.equal(evaluateTree(p,sc).rootValue,50);
 assert.match(scenarioResultsHTML(p,sc),/Matrix: baseline/);
 assert.match(scenarioControlsHTML(p,sc).tree,/data-scenario-probability/);
});

test('scenario library is non-destructive and deleting option or criterion cleans scenario references',()=>{
 const p=sampleProject('leadership');
 const sc=p.scenarios[0],option=p.options[0],crit=p.criteria[0];
 setScenarioOverride(p,sc.id,'score',option.id,crit.id,1);
 setScenarioOverride(p,sc.id,'weight',crit.id,null,10);
 assert.equal(deleteOption(p,option.id),true);
 assert.equal(sc.scoreShifts[option.id],undefined);
 assert.equal(deleteCriterion(p,crit.id),true);
 assert.equal(sc.weightShifts[crit.id],undefined);
});

test('sensitivity identifies possible rank reversals with changed weighting',()=>{
 const p=createProject(),a=addCriterion(p,'Quality',{weight:50}),b=addCriterion(p,'Speed',{weight:50});
 const x=addOption(p,'Option X'),y=addOption(p,'Option Y');
 setRating(p,x.id,a.id,{score:5});setRating(p,x.id,b.id,{score:2});
 setRating(p,y.id,a.id,{score:2});setRating(p,y.id,b.id,{score:5});
 const response=sensitivity(p,10);
 assert.ok(response.base);
 assert.ok(Array.isArray(response.flips));
 assert.ok(response.flips.length>0,'Changing one weight tips tied scores');
});

test('premortems, classroom scoring, surprise injects, and decision logs behave predictably',()=>{
 const p=createProject();
 addRisk(p,{failure:'People stop participating',likelihood:4,impact:5,warning:'Attendance drops',safeguard:'Meet with learners'});
 const team=addTeam(p,{name:'Team Alpha',recommendation:'Start with pilot'});
 team.scores={reasoning:5,evidence:4,tradeoffs:3,adaptation:4};
 assert.equal(teamScore(team),16);
 assert.equal(rankedTeams(p)[0].name,'Team Alpha');
 const inject=addInject(p,{title:'New constraint',message:'Funding cut by 25%'});
 assert.equal(inject.revealed,false);
 const decision=addDecision(p,{decision:'Pilot first',owner:'Leadership lead'});
 assert.match(risksHTML(p),/People stop participating/);
 assert.match(teamsHTML(p),/16\/20/);
 assert.match(injectsHTML(p),/Surprise inject hidden/);
 assert.match(reportHTML(p),/Pilot first/);
 assert.equal(decision.owner,'Leadership lead');
});

test('tree graph auto-arrangement is editable, and renderer keeps data safe from HTML injection',()=>{
 const p=createProject('<script>alert("x")</script>');
 p.question='<img src=x onerror=attack()>';
 addNode(p,p.nodes[0].id,'outcome',{title:'<svg onload=bad()>',utility:95});
 organizeTree(p);
 assert.ok(p.nodes[1].x>p.nodes[0].x);
 const html=treeNodesHTML(p),svg=diagramSVG(p),report=reportHTML(p);
 for(const source of [html,svg,report]){
  assert.ok(!source.includes('<script>'));
  assert.ok(!source.includes('<img src=x'));
  assert.ok(!source.includes('<svg onload=bad()>'));
 }
 assert.match(svg,/&lt;svg/);
 assert.match(report,/&lt;script&gt;/);
 assert.match(treeLinksHTML(p),/marker-end/);
 assert.match(treeResultsHTML(p),/Tree evaluation/);
});

test('editable import and clone remap all criterion, option, scenario, and tree relations',()=>{
 const original=sampleProject('ai');
 const prior={node:original.nodes[0].id,criterion:original.criteria[0].id,option:original.options[0].id};
 const restored=normalizeProject(JSON.parse(JSON.stringify(original)));
 assert.equal(restored.nodes[0].id,prior.node);
 assert.equal(restored.options[0].ratings[prior.criterion].score,original.options[0].ratings[prior.criterion].score);
 const clone=normalizeProject(JSON.parse(JSON.stringify(original)),{regenerate:true});
 assert.notEqual(clone.id,original.id);
 assert.notEqual(clone.nodes[0].id,prior.node);
 assert.notEqual(clone.criteria[0].id,prior.criterion);
 assert.notEqual(clone.options[0].id,prior.option);
 assert.equal(clone.options[0].ratings[clone.criteria[0].id].score,original.options[0].ratings[prior.criterion].score);
 assert.equal(clone.nodes[1].parentId,clone.nodes[0].id);
 assert.equal(clone.activeScenario,clone.scenarios[0].id);
 assert.equal(clone.brief.recommendationId,'');
 assert.throws(()=>normalizeProject({...original,version:VERSION+1}),/Unsupported/);
 assert.throws(()=>normalizeProject({...original,options:Array(LIMIT.options+1).fill({})}),/exceeds limit/);
});

test('three classroom templates have alternatives, branches, premortem, scenario and inject',()=>{
 for(const key of ['leadership','crisis','ai']){
  const p=sampleProject(key);
  assert.equal(p.options.length,3);assert.equal(p.criteria.length,4);
  assert.equal(p.nodes.length,10);assert.equal(p.risks.length,2);
  assert.equal(p.injects.length,1);assert.equal(p.scenarios.length,1);
  assert.equal(evaluateTree(p).complete,true);
  assert.match(p.context,/hypothetical/);
  assert.match(matrixHTML(p),/data-rating/);
  assert.match(rankingHTML(p),/Weighted ranking/);
  assert.match(briefPreviewHTML(p),/EXECUTIVE/);
 }
 assert.throws(()=>sampleProject('wrong'),/Unknown/);
});
