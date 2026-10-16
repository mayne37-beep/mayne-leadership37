import test from 'node:test';
import assert from 'node:assert/strict';
import {blankCase,addCause,removeCause,depth,isDescendant,analysis,paretoAnalysis,normalizeCase,template,LIMITS} from '../../assets/root-cause-model.js';
import {renderView,fishboneSVG,paretoSVG,reportHTML} from '../../assets/root-cause-render.js';

test('5 Whys branching and recursive deletion preserve causal references',()=>{
 const c=blankCase('Training backlog');
 const a=addCause(c,{text:'Late schedule updates'});
 const b=addCause(c,{text:'Slow approvals',parentId:a.id,category:'policy',root:true});
 const sibling=addCause(c,{text:'Insufficient rooms',category:'resources'});
 assert.equal(depth(c,b.id),1);
 assert.equal(isDescendant(c,a.id,b.id),true);
 assert.equal(isDescendant(c,b.id,a.id),false);
 c.evidence.push({id:'e1',causeId:b.id,stance:'Supports',type:'Record',finding:'Approval log',source:'Records',date:'2026-10-15'});
 c.solutions.push({id:'i1',title:'Clarify approval roles',causeIds:[b.id],impact:4,effort:2,confidence:3,status:'Proposed',due:''});
 assert.equal(removeCause(c,a.id),2);
 assert.deepEqual(c.causes.map(x=>x.id),[sibling.id]);
 assert.equal(c.evidence.length,0);
 assert.deepEqual(c.solutions[0].causeIds,[]);
});

test('Pareto computation sorts counts, handles zero and 80% threshold',()=>{
 const r=paretoAnalysis([{label:'C',count:5},{label:'A',count:30},{label:'B',count:20}]);
 assert.deepEqual(r.rows.map(x=>x.label),['A','B','C']);
 assert.equal(r.total,55);
 assert.equal(r.topCount,2);
 assert.ok(Math.abs(r.rows[1].cumulative-50/55)<1e-10);
 const zero=paretoAnalysis([{label:'No incidents',count:0}]);
 assert.equal(zero.total,0);assert.equal(zero.topCount,0);assert.equal(zero.rows[0].share,0);
});

test('project backups and duplicate projects retain or regenerate references correctly',()=>{
 const c=blankCase('Case backup');
 const parent=addCause(c,{text:'Process gap'}),child=addCause(c,{text:'Missing review',parentId:parent.id});
 c.evidence.push({id:'e',causeId:child.id,stance:'Contradicts',type:'Record',finding:'No gap observed',source:'Records',date:'2026-10-15'});
 c.solutions.push({id:'s',title:'Improve review',causeIds:[child.id],impact:3,effort:2,confidence:2,status:'Proposed',due:''});
 const saved=normalizeCase(JSON.parse(JSON.stringify(c)));
 assert.equal(saved.causes[1].parentId,parent.id);
 assert.equal(saved.evidence[0].causeId,child.id);
 const dup=normalizeCase(c,{regenerate:true});
 assert.notEqual(dup.id,c.id);
 assert.notEqual(dup.causes[1].id,child.id);
 assert.equal(dup.causes[1].parentId,dup.causes[0].id);
 assert.equal(dup.evidence[0].causeId,dup.causes[1].id);
 assert.equal(dup.solutions[0].causeIds[0],dup.causes[1].id);
});

test('scenario templates use explicitly illustrative data',()=>{
 for(const scenario of ['training','engagement','service']){
  const c=template(scenario);
  assert.ok(c.causes.length>=6);
  assert.ok(c.pareto.length>=3);
  assert.ok(c.pareto.every(item=>item.sample));
  assert.match(c.summary,/invented/i);
 }
});

test('shared views contain editable references to the same causes',()=>{
 const c=blankCase('Testing views');
 const cause=addCause(c,{text:'Handoff delays',category:'process',root:true});
 c.problem='Service response times are delayed';
 c.pareto=[{id:'one',label:'Late handoffs',count:21,sample:false},{id:'two',label:'Missing data',count:9,sample:false}];
 assert.match(renderView(c,'whys'),new RegExp('data-cause-text="'+cause.id+'"'));
 assert.match(renderView(c,'tree'),new RegExp('data-cause-text="'+cause.id+'"'));
 assert.match(fishboneSVG(c),new RegExp('data-visual-cause="'+cause.id+'"'));
 assert.match(renderView(c,'fishbone'),/data-drag-cause=/);
 assert.match(paretoSVG(c),/Cumulative/);
 assert.match(renderView(c,'pareto'),/70\.0%/);
 assert.match(renderView(c,'actions'),/No interventions yet/);
 assert.match(reportHTML(c),/Handoff delays/);
});

test('project input limits and invalid version checks reject bad data',()=>{
 const c=blankCase();
 assert.throws(()=>normalizeCase({...c,schemaVersion:99}),/Unsupported investigation version/);
 const oversized=blankCase();
 oversized.causes=Array.from({length:LIMITS.causes+1},(_,i)=>({id:String(i),text:'x'}));
 assert.throws(()=>normalizeCase(oversized),/too many causes/);
});
