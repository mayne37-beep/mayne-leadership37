import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';

test('Practice screen, branching, guided typing, observation, reflection, scenario editing and reports work in the browser DOM',async()=>{
 const html=await readFile(new URL('../../leadership-conversation-simulator.html',import.meta.url),'utf8');
 const dom=new JSDOM(html,{url:'https://www.mayneleadership.com/leadership-conversation-simulator.html',pretendToBeVisual:true});
 const previous={window:globalThis.window,document:globalThis.document,localStorage:globalThis.localStorage,FormData:globalThis.FormData,confirm:globalThis.confirm,Image:globalThis.Image};
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,localStorage:dom.window.localStorage,FormData:dom.window.FormData,confirm:()=>true,Image:dom.window.Image});
 const dialog=dom.window.HTMLDialogElement.prototype;dialog.showModal=function(){this.open=true};dialog.close=function(){this.open=false};
 const $=q=>dom.window.document.querySelector(q);
 const $all=q=>[...dom.window.document.querySelectorAll(q)];
 const click=q=>{const n=$(q);assert.ok(n,'Missing '+q);n.click()};
 const event=(node,type='change')=>node.dispatchEvent(new dom.window.Event(type,{bubbles:true,cancelable:true}));
 const store=()=>JSON.parse(dom.window.localStorage.getItem('mayne.leadership-conversation.v1'));
 const p=()=>store().projects.find(x=>x.id===store().activeId);
 const session=()=>p().sessions.find(s=>s.id===p().activeSessionId);
 const go=name=>click('[data-view="'+name+'"]');
 let printed=false;dom.window.print=()=>{printed=true};
 const downloads=[];const originalCreate=dom.window.URL.createObjectURL;const originalRevoke=dom.window.URL.revokeObjectURL;
 // In jsdom, URL.createObjectURL may not exist; this spy verifies real export handlers.
 dom.window.URL.createObjectURL=blob=>{downloads.push(blob);return 'blob:fake'};
 dom.window.URL.revokeObjectURL=()=>{};
 const originalClick=dom.window.HTMLAnchorElement.prototype.click;
 dom.window.HTMLAnchorElement.prototype.click=function(){if(this.download)downloads.push(this.download)};
 try{
  await import('../../assets/leadership-conversation.js?test=conversation-interaction');
  assert.equal(store().projects.length,6);
  assert.match($('#project-top-title').textContent,/Defensive/);
  assert.match($('#practice-workspace').textContent,/Marcus Reed/);
  assert.match($('#practice-workspace').textContent,/The situation/);
  assert.equal($('#practice-workspace').textContent.includes('You keep saying'),false,'Not started yet');

  click('[data-start-session]');
  assert.ok(session());
  assert.match($('#practice-workspace').textContent,/You keep saying/);
  assert.equal($all('[data-choose]').length,3);
  const choices=p().nodes[0].choices;
  click('[data-choose="'+choices[1].id+'"]');
  assert.equal(session().currentNodeId,'defensive-defensive');
  assert.ok(session().metrics.safety<50);
  assert.match($('#practice-workspace').textContent,/already made up your mind/);
  assert.match($('#recent-feedback').textContent,/accountability/i);

  // Undo a scripted turn and submit verbatim free text under an explicit authored route.
  click('[data-undo-response]');
  assert.equal(session().turns.length,0);
  $('#typed-reply').value='I noticed the deadline was missed. Help me understand what changed.';
  $('#typed-path').value=choices[0].id;
  click('#submit-typed');
  assert.equal(session().turns.length,1);
  assert.equal(session().turns[0].typed,true);
  assert.match(session().turns[0].learner,/Help me understand/);
  assert.equal(session().turns[0].classification,'Listen and explore');
  assert.equal(session().currentNodeId,'defensive-open');

  // Observe while the session is in progress.
  go('observe');
  assert.ok(!$('#observe-view').hidden);
  $('#observation-form [name="observer"]').value='Peer A';
  $('#observation-form [name="notes"]').value='The leader asked an open question before correcting.';
  $('#observation-form [name="listening"]').value='5';
  event($('#observation-form'),'submit');
  assert.equal(session().observations.length,1);
  assert.equal(session().observations[0].rubric.listening,5);
  assert.match($('#observation-content').textContent,/Peer A/);

  // Replay through other moments and end the conversation.
  go('practice');let count=0;
  while(!session().complete&&count++<12){
   assert.ok($('[data-choose]'),'A response is available on each reachable turn');
   $('[data-choose]').click();
  }
  assert.equal(session().complete,true);
  assert.match($('#practice-workspace').textContent,/CONVERSATION COMPLETE/);
  click('[data-go="review"]');
  assert.match($('#review-content').textContent,/Conversation replay/);
  assert.ok(!$('#review-content').textContent.includes('Peer A')); // Review displays rating averages, not observer identities.
  $('#reflection-keep').value='Ask open questions';$('#reflection-change').value='Explain standards sooner';
  $('#reflection-action').value='Schedule a follow-up';
  click('#save-reflection');
  assert.equal(session().reflection.action,'Schedule a follow-up');

  // Print report and editable project library.
  click('#export-btn');click('[data-export="report"]');
  assert.equal(printed,true);
  assert.match($('#print-report').textContent,/Schedule a follow-up/);
  click('#export-btn');click('[data-export="project"]');
  assert.ok(downloads.some(x=>String(x).endsWith('.conversation.json')));
  click('#projects-btn');
  assert.equal($('#projects-dialog').open,true);
  assert.equal($all('#projects-library .library-entry').length,6);
  click('[data-close="projects-dialog"]');

  // Scenario builder: copy and modify without altering original.
  go('builder');click('#builder-copy');
  assert.equal(store().projects.length,7);
  assert.match(p().title,/copy/);
  $('#edit-title').value='Practice case: conflict escalation';event($('#edit-title'));
  assert.equal(p().title,'Practice case: conflict escalation');
  click('#builder-add-moment');
  const last=p().nodes.at(-1);
  assert.equal(p().nodes.length,7);
  assert.equal(last.choices.length,1);
  $('#builder-node-editor [data-node-field="line"]').value='How will you follow up?';
  event($('#builder-node-editor [data-node-field="line"]'));
  assert.equal(p().nodes.at(-1).line,'How will you follow up?');
  click('[data-edit-choice="'+last.choices[0].id+'"]');
  assert.equal($('#choice-dialog').open,true);
  $('#choice-form [name="label"]').value='Let us plan the follow-up together';
  $('#choice-form [name="reply"]').value='That might work.';
  $('#choice-form [name="nextId"]').value='END';
  event($('#choice-form'),'submit');
  assert.equal($('#choice-dialog').open,false);
  assert.equal(p().nodes.at(-1).choices[0].label,'Let us plan the follow-up together');
  click('[data-set-start="'+last.id+'"]');
  assert.equal(p().firstNodeId,last.id);
  assert.match($('#builder-validation').textContent,/Ready to practice/);
  go('practice');click('[data-start-session]');
  assert.match($('#practice-workspace').textContent,/How will you follow up/);
  assert.equal(session().turns.length,0);
  click('[data-choose="'+last.choices[0].id+'"]');
  assert.equal(session().complete,true);

  // Presentation hides instructor sidebars while retaining a usable conversation.
  click('#present-btn');
  assert.equal(dom.window.document.body.classList.contains('presentation-mode'),true);
  click('#present-btn');
  assert.equal(dom.window.document.body.classList.contains('presentation-mode'),false);
 }finally{
  dom.window.HTMLAnchorElement.prototype.click=originalClick;
  dom.window.URL.createObjectURL=originalCreate;
  dom.window.URL.revokeObjectURL=originalRevoke;
  Object.assign(globalThis,previous);dom.window.close();
 }
});

test('Simulated character expressions and renderer escaping do not inject scripts',async()=>{
 const {templateProject,startSession}=await import('../../assets/leadership-conversation-model.js');
 const {practiceHTML,avatarSVG,reviewHTML}=await import('../../assets/leadership-conversation-render.js');
 const p=templateProject('defensive');
 p.persona.name='<img src=x onerror=hack()>';
 p.nodes[0].line='<script>bad()</script>';
 startSession(p);
 const html=practiceHTML(p);
 assert.ok(!html.includes('<script>'));
 assert.ok(!html.includes('<img src=x onerror=hack()>'));
 assert.match(avatarSVG(p.persona,'frustrated'),/&lt;img/);
 assert.match(reviewHTML(p),/Your conversation path/i);
});
