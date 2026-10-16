import test from 'node:test';
import assert from 'node:assert/strict';
import {
 VERSION,MAX,QUADRANTS,COLORS,TOWS_TYPES,createProject,addFactor,repositionFactor,resizeFactor,removeFactor,
 addStrategy,removeStrategy,strategyTypeForFactors,suggestedStrategy,scoreStrategy,rankStrategies,
 addAction,addScenario,projectStats,normalizeProject,sampleProject,DEFAULT_WEIGHTS
} from '../../assets/swot-model.js';
import {factorHTML,strategyCardsHTML,rankingHTML,scenarioComparisonHTML,actionsHTML,diagramSVG,reportHTML} from '../../assets/swot-render.js';

test('Factor workspace adds, positions, resizes, recolors, and classifies all four SWOT categories',()=>{
 const p=createProject('Business strategy');
 const f=QUADRANTS.map((q,i)=>addFactor(p,q.id,q.name,{x:20+i*10,y:25+i*8,color:COLORS[i].id,group:'Operations',w:210}));
 assert.equal(p.factors.length,4);
 assert.deepEqual(f.map(x=>x.quadrant),['S','W','O','T']);
 assert.equal(repositionFactor(p,f[0].id,'O',78,82),true);
 assert.equal(f[0].x,78);assert.equal(f[0].y,82);assert.equal(f[0].quadrant,'O');
 assert.equal(resizeFactor(p,f[0].id,245,120),true);
 assert.equal(f[0].w,245);assert.equal(f[0].h,120);
 assert.ok(factorHTML(f[0],f[0].id).includes('resize-handle'));
 assert.ok(!factorHTML(f[0]).includes('resize-handle'));
 assert.equal(removeFactor(p,f[0].id),true);
 assert.equal(p.factors.length,3);
});

test('SWOT factor pairing yields all four TOWS strategy types and rejects invalid pairs',()=>{
 const p=createProject(),nodes=QUADRANTS.map(q=>addFactor(p,q.id,q.name));
 const id=Object.fromEntries(nodes.map(n=>[n.quadrant,n.id]));
 for(const t of TOWS_TYPES){
  const s=addStrategy(p,t.quadrants.map(q=>id[q]));
  assert.equal(s.type,t.id);
  assert.ok(s.title.length>15);
 }
 assert.equal(p.strategies.length,4);
 assert.throws(()=>addStrategy(p,[id.S,id.W]),/compatible|valid|pair/i);
 assert.throws(()=>addStrategy(p,[id.S,id.S]),/different/);
 assert.match(suggestedStrategy(p,id.S,id.O).text,/capitalize on/);
 const orphan=p.strategies.find(s=>s.type==='SO');
 repositionFactor(p,id.O,'W',48,55);
 assert.equal(orphan.factorIds.length,1,'An incompatible move unlinks dependent strategy rather than claiming false pair');
 assert.equal(orphan.type,'');
});

test('Weighted priority ratings stay bounded and rank independently of scenario simulations',()=>{
 const p=sampleProject(),s=p.strategies[0],baseline=scoreStrategy(s,p.weights).score;
 assert.ok(baseline>=1&&baseline<=5);
 const scenario=p.scenarios[0];
 const adjusted=scoreStrategy(s,p.weights,scenario,p);
 assert.notEqual(adjusted.score,baseline,'Environment shifts change scoring');
 const before=JSON.stringify(p.strategies);
 const rankings=rankStrategies(p,scenario);
 assert.equal(rankings.length,p.strategies.length);
 assert.ok(rankings.every(x=>typeof x.scenarioScore==='number'&&typeof x.change==='number'));
 assert.equal(JSON.stringify(p.strategies),before,'Hypothetical ratings do not change original data');
 p.weights={impact:100,feasibility:0,urgency:0,resources:0};
 assert.equal(scoreStrategy(s,p.weights).score,s.impact);
 assert.ok(/Scenario rating/.test(scenarioComparisonHTML(p,scenario)));
});

test('Strategic actions link to TOWS recommendations and record owner, milestones and outcomes',()=>{
 const p=sampleProject(),s=p.strategies[0],a=addAction(p,{title:'Launch pilot',strategyId:s.id,owner:'Project manager',metric:'Completion rate',baseline:'0%',target:'90%',milestone:'Pilot',status:'In progress'});
 assert.equal(a.strategyId,s.id);assert.equal(a.owner,'Project manager');
 assert.equal(projectStats(p).actions,2);
 assert.match(actionsHTML(p),/Launch pilot/);
 assert.match(reportHTML(p),/Completion rate/);
 assert.equal(removeStrategy(p,s.id),true);
 assert.equal(p.actions.find(x=>x.id===a.id).strategyId,'');
});

test('Editable JSON backups and duplicates preserve links with independent IDs',()=>{
 const p=sampleProject();
 const saved=normalizeProject(JSON.parse(JSON.stringify(p)));
 assert.equal(saved.factors[0].id,p.factors[0].id);
 assert.equal(saved.strategies[0].factorIds[0],p.strategies[0].factorIds[0]);
 const clone=normalizeProject(p,{regenerate:true});
 assert.notEqual(clone.id,p.id);
 assert.notEqual(clone.factors[0].id,p.factors[0].id);
 assert.equal(clone.strategies[0].factorIds[0],clone.factors[0].id);
 assert.equal(clone.actions[0].strategyId,clone.strategies[0].id);
 assert.ok(!clone.activeScenario);
 assert.throws(()=>normalizeProject({...p,version:VERSION+1}),/Unsupported/);
 assert.throws(()=>normalizeProject({...p,factors:Array(MAX.factors+1).fill({})}),/limits/);
});

test('SWOT report and export SVG contain safe text, factor colors, connections and outcomes',()=>{
 const p=sampleProject();
 addFactor(p,'S','<script>alert(1)</script>',{group:'<img src=x>'});
 const svg=diagramSVG(p);
 assert.match(svg,/viewBox="0 0 1200 900"/);
 assert.match(svg,/Experienced facilitators/);
 assert.ok(svg.includes('&lt;script&gt;')&&!svg.includes('<script>'));
 assert.ok(svg.includes('&lt;img')&&!svg.includes('<img src=x>'));
 assert.match(svg,/path d="M/);
 assert.match(strategyCardsHTML(p),/strategy-card/);
 assert.match(rankingHTML(p),/Weighted score/);
 assert.match(reportHTML(p),/Leadership development/);
 const alt=diagramSVG({...p,showConnections:false});
 assert.ok(!alt.includes('stroke-dasharray="8 6"'));
});

test('Scenario delta limits and resource-demand direction are consistent',()=>{
 const p=createProject();const a=addFactor(p,'S','Efficient facilitators'),b=addFactor(p,'O','New market');
 const strategy=addStrategy(p,[a.id,b.id],{impact:3,feasibility:3,urgency:3,resources:3});
 const sc=addScenario(p,{name:'Resource shortage'});
 sc.deltas.resources=2;
 assert.ok(scoreStrategy(strategy,p.weights,sc,p).score<scoreStrategy(strategy,p.weights).score,'More resource demand should lower priority');
 sc.deltas.resources=-2;
 assert.ok(scoreStrategy(strategy,p.weights,sc,p).score>scoreStrategy(strategy,p.weights).score);
 sc.deltas.resources=99;
 const clone=normalizeProject(p);
 assert.equal(clone.scenarios[0].deltas.resources,2);
});
