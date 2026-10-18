import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';

const file=new URL('../../leadership-conversation-simulator.html',import.meta.url);
const cssFile=new URL('../../assets/leadership-conversation.css',import.meta.url);
const key='mayne.leadership-conversation.v1';
const setup=async(url,tag)=>{
 const html=await readFile(file,'utf8');
 const dom=new JSDOM(html,{url,pretendToBeVisual:true});
 const prev={window:globalThis.window,document:globalThis.document,localStorage:globalThis.localStorage,FormData:globalThis.FormData,confirm:globalThis.confirm};
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,localStorage:dom.window.localStorage,FormData:dom.window.FormData,confirm:()=>true});
 dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
 dom.window.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new dom.window.Event('close'));};
 const $=q=>dom.window.document.querySelector(q);
 const click=q=>{const el=$(q);assert.ok(el,'Missing button '+q);el.click();};
 const data=()=>JSON.parse(dom.window.localStorage.getItem(key));
 const active=()=>data().projects.find(p=>p.id===data().activeId);
 await import('../../assets/leadership-conversation.js?test='+tag);
 return {dom,$,click,data,active,cleanup:()=>{Object.assign(globalThis,prev);dom.window.close();}};
};

test('Default classroom practice has a regular assigned character and no visible character builder',async()=>{
 const ui=await setup('https://www.mayneleadership.com/leadership-conversation-simulator.html','character-drawer-default');
 const {$,click,active,cleanup}=ui;
 try{
  assert.equal($('#character-drawer').open,false,'Character settings must be closed by default');
  assert.equal($('#practice-view').hidden,false,'Practice stays visible');
  assert.equal($('#builder-view').hidden,true);
  assert.equal($('#character-drawer').contains($('#character-workbench')),true);
  assert.equal($('#character-workbench').children.length,0,'Do not build full editor while closed');
  assert.equal($('[data-view="characters"]').getAttribute('aria-expanded'),'false');
  assert.match($('#practice-workspace').textContent,/Marcus Reed/,'Default normal portrait should appear');
  assert.equal(active().persona.name,'Marcus Reed');
  assert.match($('#selected-card').textContent,/Customize character/);
  assert.ok($('#practice-workspace [data-go="characters"]'),'Intro provides an optional character shortcut');

  click('[data-view="characters"]');
  assert.equal($('#character-drawer').open,true);
  assert.equal($('#practice-view').hidden,false,'Drawer must overlay, not replace practice');
  assert.equal($('[data-view="characters"]').getAttribute('aria-expanded'),'true');
  assert.ok($('.character-quick-view'),'Compact selected character preview visible');
  assert.equal($('.character-quick-view').hidden,false);
  assert.equal($('#character-detail-editor').hidden,true,'Detailed appearance form starts collapsed');
  assert.equal($('#character-detail-editor [data-character-field="identity.name"]').value,'Marcus Reed');
  assert.match($('.character-current-label').textContent,/Current scenario character/);

  click('[data-character-edit-toggle]');
  assert.equal($('#character-detail-editor').hidden,false,'Editor expands only on request');
  assert.equal($('.character-quick-view').hidden,true);
  assert.equal($('.character-editor-toggle').getAttribute('aria-expanded'),'true');
  click('[data-character-edit-toggle]');
  assert.equal($('#character-detail-editor').hidden,true,'Editor can collapse again');
  assert.equal($('.character-quick-view').hidden,false);

  click('[data-character-done]');
  assert.equal($('#character-drawer').open,false);
  assert.equal($('[data-view="characters"]').getAttribute('aria-expanded'),'false');
  assert.equal($('#practice-view').hidden,false);
  assert.equal($('#character-workbench').querySelector('#character-detail-editor')?.hidden,true);

  click('[data-view="characters"]');
  assert.equal($('#character-detail-editor').hidden,true,'Reopened character settings should start compact');
  click('[data-view="characters"]');
  assert.equal($('#character-drawer').open,false,'Character tab toggles open and closed');
 }finally{cleanup();}
});

test('Changing a character inside the drawer preserves an in-progress conversation and supports multiple entry/exit paths',async()=>{
 const ui=await setup('https://www.mayneleadership.com/leadership-conversation-simulator.html','character-drawer-progress');
 const {$,click,active,data,cleanup}=ui;
 try{
  click('[data-start-session]');
  const choice=active().nodes[0].choices[0].id;
  click('[data-choose="'+choice+'"]');
  const oldProgress=active().sessions[0].turns[0].learner,oldTurns=active().sessions[0].turns.length;
  const nextMoment=active().sessions[0].currentNodeId;
  click('.portrait-edit-chip');
  assert.equal($('#character-drawer').open,true);
  assert.equal($('#practice-view').hidden,false);
  const originalTitle=active().title;
  // Select a different saved profile and assign it, without touching session state.
  const newId=data().characters[1].id;
  click('[data-character-select="'+newId+'"]');
  assert.equal($('#character-detail-editor').hidden,true);
  click('[data-character-assign="'+newId+'"]');
  assert.equal(active().characterId,newId);
  assert.equal(active().title,originalTitle);
  assert.equal(active().sessions[0].turns.length,oldTurns);
  assert.equal(active().sessions[0].turns[0].learner,oldProgress);
  assert.equal(active().sessions[0].currentNodeId,nextMoment);
  click('[data-close="character-drawer"]');
  assert.equal($('#character-drawer').open,false);
  assert.equal($('#practice-view').hidden,false);
  assert.equal($('#practice-workspace').textContent.includes(data().characters[1].name),true);
  assert.equal(active().sessions[0].turns.length,1);
  click('[data-choose="'+active().nodes.find(n=>n.id===nextMoment).choices[0].id+'"]');
  assert.equal(active().sessions[0].turns.length,2,'Learner can continue same branching practice');
 }finally{cleanup();}
});

test('Direct Character Creator link opens the drawer over practice, then closes to normal simulator',async()=>{
 const ui=await setup('https://www.mayneleadership.com/leadership-conversation-simulator.html?view=characters','character-drawer-deeplink');
 const {$,click,cleanup}=ui;
 try{
  assert.equal($('#character-drawer').open,true);
  assert.equal($('#practice-view').hidden,false);
  assert.equal($('#builder-view').hidden,true);
  assert.equal($('#character-detail-editor').hidden,true);
  click('[data-character-done]');
  assert.equal($('#character-drawer').open,false);
  assert.equal($('#practice-view').hidden,false);
  assert.ok($('#practice-workspace').textContent.includes('Marcus'));
 }finally{cleanup();}
});

test('Character drawer stays responsive and does not become permanent page real estate',async()=>{
 const css=await readFile(cssFile,'utf8');
 for(const selector of ['dialog.character-drawer','dialog.character-drawer::backdrop','.character-drawer-top',
  '.character-creator-body[hidden]','.character-quick-view[hidden]','@media(max-width:760px)',
  '@media(max-width:540px)','@media(prefers-reduced-motion:reduce)']){
  assert.ok(css.includes(selector),'Missing character drawer style: '+selector);
 }
 assert.ok(css.includes('width:100vw'),'Phone drawer should use full available width');
 assert.equal((css.match(/{/g)||[]).length,(css.match(/}/g)||[]).length);
});
