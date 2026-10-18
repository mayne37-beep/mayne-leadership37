import test from 'node:test';
import assert from 'node:assert/strict';
import {VERSION,CAPS,DIMENSIONS,TACTICS,initialMetrics,makeProject,makeChoice,makeNode,starterLibrary,listTemplates,templateProject,startSession,activeSession,choose,rewindTurn,addObservation,observationAverage,metricsDelta,summarize,normalizeProject,validateScenario,addNode,addChoice,updateChoice,deleteChoice,removeNode,escapeHTML} from '../../assets/leadership-conversation-model.js';
import {practiceHTML,sidebarHTML,selectedCardHTML,pulseHTML,momentsHTML,nodeEditorHTML,observeHTML,reviewHTML,reportHTML,avatarSVG,choiceEditorFieldsHTML} from '../../assets/leadership-conversation-render.js';

test('Six individually scripted starter scenarios have distinct personas and meaningful branching paths',()=>{
 const library=starterLibrary();assert.equal(library.length,6);assert.equal(listTemplates().length,6);
 assert.equal(new Set(library.map(p=>p.persona.name)).size,6);
 for(const p of library){
  assert.equal(p.nodes.length,6);
  assert.equal(p.nodes[0].choices.length,3);
  assert.equal(p.nodes.filter(n=>n.choices.some(c=>c.nextId==='END')).length>=2,true);
  const state=validateScenario(p);
  assert.deepEqual(state.errors,[]);
  assert.equal(state.disconnected.length,0,'No unreachable teaching moments');
  assert.equal(state.reachable.size,6);
  assert.equal(p.sessions.length,0);
  assert.ok(p.objective.length>30);
  assert.match(avatarSVG(p.persona,'frustrated'),/aria-label/);
  assert.match(sidebarHTML(library,p.id),/scenario-button/);
  assert.match(momentsHTML(p,p.firstNodeId),/data-select-moment/);
 }
 assert.equal(templateProject('ethics').category,'Ethical leadership');
 assert.throws(()=>templateProject('missing'),/Unknown/);
});

test('One response path opens reflection while a confrontational alternative creates a recovery branch',()=>{
 const p=templateProject('defensive'),s=startSession(p);
 const opening=p.nodes[0];
 const listening=choose(p,opening.choices[0].id);
 assert.equal(listening.classification,'Listen and explore');
 assert.equal(s.currentNodeId,'defensive-open');
 assert.equal(s.metrics.trust,60);assert.equal(s.metrics.safety,60);
 assert.match(practiceHTML(p),/Explore what is underneath/);
 const continued=choose(p,p.nodes.find(n=>n.id===s.currentNodeId).choices[0].id);
 assert.equal(s.currentNodeId,'defensive-facts');
 assert.equal(s.turns.length,2);
 assert.equal(rewindTurn(p),true);
 assert.equal(s.currentNodeId,'defensive-open');
 assert.equal(s.turns.length,1);
 assert.equal(s.metrics.trust,60);
 assert.equal(rewindTurn(p),true);
 assert.equal(s.metrics.trust,50);
 assert.equal(s.currentNodeId,p.firstNodeId);
 const confrontation=choose(p,opening.choices[1].id);
 assert.equal(s.currentNodeId,'defensive-defensive');
 assert.ok(s.metrics.safety<50);
 assert.match(confrontation.reply,/extra work/);
 const dismissal=choose(p,p.nodes.find(n=>n.id===s.currentNodeId).choices[2].id);
 assert.equal(s.complete,true);
 assert.equal(s.currentNodeId,'');
 assert.equal(s.turns.length,2);
 assert.match(practiceHTML(p),/CONVERSATION COMPLETE/);
 assert.throws(()=>choose(p,opening.choices[0].id),/Begin/);
});

test('Typed responses must identify closest scripted path and are recorded verbatim without AI classification',()=>{
 const p=templateProject('coaching');startSession(p);
 const choice=p.nodes[0].choices[0];
 assert.throws(()=>choose(p,choice.id,{written:'What options did you consider?'}),/Select the leadership approach/);
 assert.equal(activeSession(p).turns.length,0);
 const message='What have you tried, and what options feel workable for you?';
 const result=choose(p,choice.id,{written:message,classification:choice.tactic});
 assert.equal(result.learner,message);
 assert.equal(result.typed,true);
 assert.equal(result.selectedChoice,choice.label);
 assert.equal(result.classification,choice.tactic);
 assert.equal(activeSession(p).turns.length,1);
 assert.ok(!result.feedback.toLowerCase().includes('ai generated'));
 assert.throws(()=>choose(p,p.nodes[0].choices[1].id),/Choose a valid response/);
});

test('Four indicators are clamped between zero and 100 and historical values enable undo',()=>{
 const p=makeProject();const n=p.nodes[0],s=startSession(p);
 n.choices=[makeChoice({id:'first',label:'Test effect',effects:{trust:25,safety:-25,clarity:25,commitment:-25},nextId:n.id})];
 for(let i=0;i<3;i++)choose(p,'first');
 assert.deepEqual(s.metrics,{trust:100,safety:0,clarity:100,commitment:0});
 assert.deepEqual(metricsDelta(s),{trust:50,safety:-50,clarity:50,commitment:-50});
 assert.equal(summarize(s).counts['Listen and explore'],3);
 assert.equal(rewindTurn(p),true);
 assert.deepEqual(s.metrics,{trust:100,safety:0,clarity:100,commitment:0});
 assert.equal(s.turns.length,2);
});

test('Human observer ratings are separate from scripted indicators and require a session',()=>{
 const p=templateProject('conflict');assert.throws(()=>addObservation(p,{notes:'Good listening'}),/Begin/);
 const s=startSession(p);
 choose(p,p.nodes[0].choices[0].id);
 const metrics={...s.metrics};
 const o=addObservation(p,{observer:'Classmate',notes:'Asked a fact-finding question without judging Riley.',strengths:'Useful specificity',opportunities:'Summarize shared goal',rubric:{listening:5,inquiry:4,accountability:3,adaptability:4}});
 assert.equal(o.rubric.listening,5);
 assert.equal(observationAverage(s).listening,5);
 assert.deepEqual(s.metrics,metrics,'Recording an observer does not change auto-generated indicators');
 assert.match(observeHTML(p),/Classmate/);
 assert.match(reviewHTML(p),/Observer-rated behaviors/);
});

test('Author can add a moment, script two distinct paths, rebranch, then remove the moment safely',()=>{
 const p=makeProject();
 const newN=addNode(p,{title:'Resolve concern',line:'What might be possible?',choices:[{label:'We can try',nextId:'END'}]});
 const extra=addChoice(p,p.firstNodeId,{label:'Let us solve this together',reply:'Okay.',nextId:newN.id});
 assert.equal(validateScenario(p).reachable.size,2);
 assert.equal(choose===undefined,false);
 assert.equal(updateChoice(p,p.firstNodeId,extra.id,{effects:{trust:15},nextId:newN.id}),true);
 assert.equal(p.nodes[0].choices.find(c=>c.id===extra.id).effects.trust,15);
 assert.match(nodeEditorHTML(p,p.firstNodeId),/Edit selected moment/);
 assert.match(choiceEditorFieldsHTML(p,p.nodes[0],extra),/Next conversational moment/);
 assert.equal(deleteChoice(p,p.firstNodeId,extra.id),true);
 assert.equal(removeNode(p,newN.id),true);
 assert.equal(validateScenario(p).errors.length,0);
 assert.equal(removeNode(p,p.firstNodeId),false);
});

test('Scenario clones retain branches but remap project, node and choice IDs; sessions and reflections survive backup',()=>{
 const original=templateProject('ethics');
 const run=startSession(original,{learner:'Practice student'});
 choose(original,original.nodes[0].choices[0].id);
 run.reflection={keep:'Listen without accusation',change:'Ask a neutral follow-up',action:'Document facts'};
 addObservation(original,{notes:'Avoided speculation',rubric:{listening:5}});
 const save=normalizeProject(JSON.parse(JSON.stringify(original)));
 assert.equal(save.sessions.length,1);assert.equal(save.sessions[0].reflection.action,'Document facts');
 assert.equal(save.sessions[0].turns[0].nodeId,save.nodes[0].id);
 assert.equal(save.sessions[0].currentNodeId,save.nodes[1].id);
 assert.match(reportHTML(save),/Avoided speculation/);
 const clone=normalizeProject(JSON.parse(JSON.stringify(original)),{regenerate:true});
 assert.notEqual(clone.id,original.id);assert.notEqual(clone.nodes[0].id,original.nodes[0].id);
 assert.equal(clone.nodes[0].choices[0].nextId,clone.nodes[1].id);
 assert.equal(clone.sessions[0].turns[0].nodeId,clone.nodes[0].id);
 assert.equal(clone.sessions[0].reflection.keep,'Listen without accusation');
 assert.notEqual(clone.sessions[0].id,original.sessions[0].id);
 assert.throws(()=>normalizeProject({...original,version:VERSION+1}),/Unsupported/);
 assert.throws(()=>normalizeProject({...original,nodes:Array(CAPS.nodes+1).fill({})}),/Invalid scenario/);
});

test('User-supplied content is escaped across practice, builder, reports and avatar labels',()=>{
 const p=makeProject({title:'<script>alert(1)</script>',persona:{name:'<img onerror="alert(1)">',role:'<svg onload=hack()>'}});
 p.context='<img src=x onerror=hack()>';
 p.nodes[0].line='<script>bad()</script>';
 const views=[practiceHTML(p),selectedCardHTML(p),nodeEditorHTML(p,p.firstNodeId),reportHTML(p),avatarSVG(p.persona)];
 for(const v of views){
  assert.ok(!v.includes('<script>'));
  assert.ok(!v.includes('<img onerror="alert(1)">'));
  assert.ok(!v.includes('<svg onload=hack()>'));
 }
 assert.match(practiceHTML(p),/&lt;script&gt;/);
 assert.match(escapeHTML('<unsafe>'),/&lt;unsafe&gt;/);
});

test('Complete session can be replayed independently while prior transcript remains available',()=>{
 const p=templateProject('motivation');const first=startSession(p,{learner:'Leader A'});
 let count=0;while(!first.complete&&count++<10){const n=nodeById(p,first.currentNodeId);choose(p,n.choices[0].id)}
 assert.equal(first.complete,true);
 const second=startSession(p,{learner:'Leader B'});
 assert.notEqual(second.id,first.id);
 assert.equal(second.turns.length,0);
 assert.equal(p.sessions.length,2);
 assert.equal(first.ended.length>0,true);
 assert.match(reviewHTML(p),/Select practice session/);
 assert.equal(initialMetrics().safety,50);
});
