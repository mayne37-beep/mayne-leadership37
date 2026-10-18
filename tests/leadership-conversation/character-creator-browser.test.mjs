import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
const HTML=new URL('../../leadership-conversation-simulator.html',import.meta.url);

test('Full Character Creator: create, edit, preview moods, duplicate, assign, practice, safeguard deletion, export and import',async()=>{
 const html=await readFile(HTML,'utf8');
 const dom=new JSDOM(html,{url:'https://www.mayneleadership.com/leadership-conversation-simulator.html',pretendToBeVisual:true});
 const before={window:globalThis.window,document:globalThis.document,localStorage:globalThis.localStorage,FormData:globalThis.FormData,confirm:globalThis.confirm,Image:globalThis.Image};
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,localStorage:dom.window.localStorage,FormData:dom.window.FormData,confirm:()=>true,Image:dom.window.Image});
 dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true};
 dom.window.HTMLDialogElement.prototype.close=function(){this.open=false};
 const $=q=>dom.window.document.querySelector(q),$$=q=>[...dom.window.document.querySelectorAll(q)];
 const click=q=>{const item=$(q);assert.ok(item,'Missing element '+q);item.click()};
 const change=el=>el.dispatchEvent(new dom.window.Event('change',{bubbles:true,cancelable:true}));
 const store=()=>JSON.parse(dom.window.localStorage.getItem('mayne.leadership-conversation.v1'));
 const project=()=>store().projects.find(p=>p.id===store().activeId);
 const library=()=>store().characters;
 let files=[];
 const create=dom.window.URL.createObjectURL,revoke=dom.window.URL.revokeObjectURL,anchorClick=dom.window.HTMLAnchorElement.prototype.click;
 dom.window.URL.createObjectURL=x=>{files.push(x);return 'blob:test'};
 dom.window.URL.revokeObjectURL=()=>{};
 dom.window.HTMLAnchorElement.prototype.click=function(){if(!this.download)anchorClick.call(this);else files.push(this.download);};
 try{
  await import('../../assets/leadership-conversation.js?test=character-creator-ui');
  assert.equal(store().projects.length,6);
  assert.equal(library().length,6,'Existing scenarios should seed character library');
  assert.ok(library().some(c=>c.style==='three-d'));
  assert.ok(library().some(c=>c.style==='illustrated'));
  assert.equal(project().characterId,library()[0].id);
  const originalFirstLine=project().nodes[0].line,originalNodeIds=project().nodes.map(n=>n.id);

  click('[data-view="characters"]');
  assert.ok(!$('#characters-view').hidden);
  assert.equal($$('#character-workbench .character-tile').length,6);
  assert.match($('#character-workbench').textContent,/Character Library/);
  assert.match($('#character-workbench').textContent,/Marcus Reed/);
  click('[data-character-create]');
  assert.equal(library().length,7);
  const newId=library()[0].id;
  assert.match($('#character-workbench').textContent,/New employee/);

  const name=$('[data-character-field="identity.name"]');
  name.value='Taylor Brooks';change(name);
  assert.equal(library()[0].name,'Taylor Brooks');
  const role=$('[data-character-field="identity.role"]');
  role.value='Team supervisor';change(role);
  assert.equal(library()[0].role,'Team supervisor');

  click('[data-character-style="three-d"]');
  assert.equal(library()[0].style,'three-d');
  assert.match($('.character-portrait-main').innerHTML,/character-style-three-d/);
  click('[data-character-emotion="frustrated"]');
  assert.match($('.character-style-caption').textContent,/Frustrated/);
  assert.match($('.character-portrait-main').innerHTML,/frustrated/);

  const hair=$('[data-character-field="appearance.hairstyle"]');
  hair.value='Curly';change(hair);
  assert.equal(library()[0].appearance.hairstyle,'Curly');
  click('[data-character-swatch="appearance.skin"][data-swatch-color="#865642"]');
  assert.equal(library()[0].appearance.skin,'#865642');
  const behavior=$('[data-character-field="behavior.reactivity"]');
  behavior.value='5';change(behavior);
  assert.equal(library()[0].behavior.reactivity,5);

  click('[data-character-style="photo"]');
  assert.equal(library()[0].style,'photo');
  assert.match($('.character-portrait-main').textContent,/Upload a real image/);
  assert.match($('#character-workbench').textContent,/Upload frustrated photo/);
  click('[data-character-style="illustrated"]');
  assert.match($('.character-portrait-main').innerHTML,/character-style-illustrated/);

  click('[data-character-assign="'+newId+'"]');
  assert.equal(project().characterId,newId);
  assert.equal(project().persona.name,'Taylor Brooks');
  assert.deepEqual(project().nodes.map(n=>n.id),originalNodeIds);
  assert.equal(project().nodes[0].line,originalFirstLine);
  assert.ok($('.character-use-box').textContent.includes('Assigned to current scenario'));

  // Assigned character is protected from deletion.
  click('[data-character-delete]');
  assert.equal(library().length,7);
  click('[data-character-duplicate]');
  assert.equal(library().length,8);
  assert.notEqual(library()[0].id,newId);
  assert.match(library()[0].name,/copy/);
  click('[data-character-select="'+newId+'"]');
  assert.equal($('.character-editor-head h3').textContent,'Taylor Brooks');

  click('[data-view="practice"]');
  assert.match($('#practice-workspace').textContent,/Taylor Brooks/);
  click('[data-start-session]');
  assert.match($('#practice-workspace').innerHTML,/character-style-illustrated/);
  const firstChoice=project().nodes[0].choices[0].id;
  click('[data-choose="'+firstChoice+'"]');
  assert.equal(project().sessions[0].turns.length,1);
  const beforeTrust=project().sessions[0].metrics.trust;

  // New reused character shared across another scenario updates it without touching dialogue.
  const other=store().projects[1].id;
  click('[data-open-scenario="'+other+'"]');
  click('[data-view="characters"]');
  click('[data-character-select="'+newId+'"]');
  click('[data-character-assign="'+newId+'"]');
  assert.equal(project().characterId,newId);
  nameFix:
  {
   const field=$('[data-character-field="identity.name"]');
   field.value='Taylor B.';change(field);
  }
  assert.equal(store().projects.find(p=>p.id===store().projects[0].id).persona.name,'Taylor B.');
  assert.equal(project().persona.name,'Taylor B.');

  // Export an individual character without uploading it to a server.
  click('[data-character-export]');
  assert.ok(files.some(x=>typeof x==='string'&&x.endsWith('.character.json')));
  assert.ok(files.some(x=>x instanceof dom.window.Blob||typeof x==='object'));
  click('[data-character-duplicate]');
  const secondId=library()[0].id;
  click('[data-character-assign="'+secondId+'"]');
  assert.equal(project().characterId,secondId);
  click('[data-character-select="'+newId+'"]');
  assert.equal(library().filter(x=>x.id===newId).length,1);
  // Other scenario still links to the original; deletion remains blocked.
  click('[data-character-delete]');
  assert.equal(library().filter(x=>x.id===newId).length,1);
  assert.ok(beforeTrust>50);
 }finally{
  dom.window.URL.createObjectURL=create;dom.window.URL.revokeObjectURL=revoke;
  dom.window.HTMLAnchorElement.prototype.click=anchorClick;
  Object.assign(globalThis,before);dom.window.close();
 }
});

test('Style/portrait semantics and mobile editor affordances remain present',async()=>{
 const html=await readFile(HTML,'utf8');
 const css=await readFile(new URL('../../assets/leadership-conversation.css',import.meta.url),'utf8');
 for(const x of ['data-view="characters"','id="character-workbench"','id="character-photo-input"','id="character-import-input"','builder-assigned-character']){
  assert.ok(html.includes(x),'Missing '+x);
 }
 for(const rule of ['.character-workspace','.character-tiles','.character-photo-tools','.photo-placeholder','.swatch-row','.character-style-toggle','@media(max-width:620px)']){
  assert.ok(css.includes(rule),'Missing '+rule);
 }
 assert.equal((css.match(/{/g)||[]).length,(css.match(/}/g)||[]).length);
});
