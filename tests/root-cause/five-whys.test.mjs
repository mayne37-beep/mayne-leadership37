import test from 'node:test';
import assert from 'node:assert/strict';
import {blankCase,addCause,normalizeCase,depth} from '../../assets/root-cause-model.js';
import {renderFiveWhys,tracePath,whyLevels,whyStats,fiveWhysExample} from '../../assets/five-whys.js';

test('5 Whys lays out depth columns and preserves alternative branches',()=>{
 const c=blankCase('Delays');
 const first=addCause(c,{text:'Approvals are late',category:'process'});
 const second=addCause(c,{text:'No review calendar',parentId:first.id,category:'process'});
 const alternative=addCause(c,{text:'Resources are unavailable',category:'resources'});
 const third=addCause(c,{text:'Responsibilities are unclear',parentId:first.id,category:'people'});
 assert.deepEqual(whyLevels(c).map(l=>l.nodes.length),[2,2]);
 assert.deepEqual(tracePath(c,second.id).map(x=>x.id),[first.id,second.id]);
 assert.deepEqual(tracePath(c,alternative.id).map(x=>x.id),[alternative.id]);
 const stats=whyStats(c);
 assert.equal(stats.depth,2);
 assert.equal(stats.branches,2);
 const html=renderFiveWhys(c,first.id);
 assert.match(html,/id="why-add-form"/);
 assert.match(html,/data-cause-text=/);
 assert.match(html,/data-why-card=/);
 assert.match(html,/Contributes to/);
 assert.match(html,/No review calendar/);
 assert.match(html,/Resources are unavailable/);
 assert.match(html,new RegExp('value="'+first.id+'" selected'));
 assert.ok(depth(c,second.id)>depth(c,first.id));
});

test('Why cards are editable and explicitly treat causes as hypotheses',()=>{
 const c=blankCase('Hypothesis check');
 c.problem='An observable delay';
 const cause=addCause(c,{text:'A provisional explanation',status:'Hypothesis'});
 const html=renderFiveWhys(c,cause.id);
 assert.match(html,/Why might/);
 assert.match(html,/Hypothesis/);
 assert.match(html,/A provisional explanation/);
 assert.match(html,/data-action="why-add-child"/);
 assert.match(html,/data-action="add-evidence"/);
 assert.match(html,/data-action="toggle-root"/);
 assert.match(html,/data-action="why-to-evidence"/);
 assert.match(html,/before you name a root cause/i);
});

test('5 Whys escapes entered cause content and survives local project round-trip',()=>{
 const c=blankCase();
 const parent=addCause(c,{text:'<script>alert(1)</script>'});
 const child=addCause(c,{text:'Needs investigation',parentId:parent.id});
 const markup=renderFiveWhys(c,parent.id);
 assert.ok(!markup.includes('<script>'));
 assert.match(markup,/&lt;script&gt;/);
 const restored=normalizeCase(JSON.parse(JSON.stringify(c)));
 assert.equal(restored.causes[1].parentId,restored.causes[0].id);
 assert.equal(tracePath(restored,child.id).length,2);
});

test('classroom demo has multiple competing branches and at least five Whys',()=>{
 const c=fiveWhysExample();
 const stats=whyStats(c);
 assert.equal(stats.depth,5);
 assert.ok(stats.branches>=1);
 assert.ok(stats.leaves>=2);
 assert.ok(c.causes.every(x=>x.status==='Hypothesis'));
 assert.match(c.summary,/Illustrative/);
 assert.equal(c.evidence.length,0);
 assert.match(renderFiveWhys(c),/Training materials/);
});
