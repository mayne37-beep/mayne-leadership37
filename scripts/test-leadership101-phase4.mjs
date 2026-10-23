/**
 * Leadership 101 source-contract smoke tests.
 * Run: node --test scripts/test-leadership101-phase4.mjs
 * These checks do not replace cross-device browser or screen-reader testing.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>readFileSync(path.join(root,p),'utf8');
const source=read('src/leadership101-live.js'),builder=read('src/leadership101-builder.js'),html=read('leadership101-live.html');
const story=JSON.parse(read('data/leadership101-first-time-leader-story.json'));
test('both client scripts parse',()=>{
 assert.doesNotThrow(()=>new Function(source.replace(/^import[^\n]*\n/gm,'')));
 assert.doesNotThrow(()=>new Function(builder.replace(/^import[^\n]*\n/gm,'')));
});
test('live page exposes accessible navigation and connection recovery',()=>{
 for(const marker of ['<main id="app"','href="#app"','role="tablist"','aria-selected="true"','l101-connection','aria-live="polite"','l101-refresh-now','prefers-reduced-motion'])assert.ok(html.includes(marker),marker);
 assert.match(source,/aria-pressed/);
 assert.match(source,/function setStudioConnection/);
});
test('authored branching story has valid destinations and distinct endings',()=>{
 for(const id of ['ending-strong','ending-fragile','ending-damaged'])assert.equal(story.nodes[id].ending,true);
 assert.ok(Object.keys(story.nodes).length>=15);
 assert.ok(story.nodes[story.start]);
 for(const [id,node] of Object.entries(story.nodes)){
  if(node.ending)continue;
  assert.ok(node.choices?.length,id);
  for(const choice of node.choices)assert.ok(choice.next==='__ending__'||story.nodes[choice.next],id+' destination '+choice.next);
 }
});
test('duplicate actions and unsaved text are protected',()=>{
 for(const marker of ["if(joinBusy)return","if(submissionBusy)return","if(injectBusy)return","pendingStudentRender=true","sessionStorage.setItem(studentDraftKey()","clearStudentDraft('student-written')","clearStudentDraft('student-reflection')"])assert.ok(source.includes(marker),marker);
 assert.match(source,/\.is\('rating',null\)\.select\('id'\)/);
});
test('notification panel retains keyboard focus and escape behavior',()=>{
 for(const marker of ["event.key==='Escape'","event.key!=='Tab'","drawer.contains(document.activeElement)","if(close)close.focus()","if(restored)restored.focus"])assert.ok(source.includes(marker),marker);
});
