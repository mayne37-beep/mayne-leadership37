import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';

test('Dedicated 5 Whys Studio supports guided questions, competing paths, inline edits and linked workspaces',async()=>{
 const html=await readFile(new URL('../../five-whys-studio.html',import.meta.url),'utf8');
 const dom=new JSDOM(html,{url:'https://www.mayneleadership.com/five-whys-studio.html'});
 const previous={window:globalThis.window,document:globalThis.document,localStorage:globalThis.localStorage,FormData:globalThis.FormData,confirm:globalThis.confirm};
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,localStorage:dom.window.localStorage,FormData:dom.window.FormData,confirm:()=>true});
 const proto=dom.window.HTMLDialogElement.prototype;
 proto.showModal=function(){this.open=true};
 proto.close=function(){this.open=false;this.dispatchEvent(new dom.window.Event('close'))};
 const $=query=>dom.window.document.querySelector(query);
 const state=()=>JSON.parse(dom.window.localStorage.getItem('ml.root-cause.studio.v1'));
 const commitWhy=(text,parentId='')=>{
  $('#why-answer').value=text;
  $('#why-parent').value=parentId;
  $('#why-add-form').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));
 };
 const fireChange=el=>el.dispatchEvent(new dom.window.Event('change',{bubbles:true}));
 try{
  await import('../../assets/root-cause-studio.js?test=five-whys-browser');
  assert.equal($('[data-view=whys]').getAttribute('aria-current'),'page');
  assert.ok($('#why-add-form'));
  assert.equal(state().cases.length,1);
  assert.equal(state().cases[0].causes.length,0);

  $('#why-problem').value='Our training materials are consistently late';
  fireChange($('#why-problem'));
  assert.equal(state().cases[0].problem,'Our training materials are consistently late');

  commitWhy('Final approvals take too long');
  let c=state().cases[0];
  assert.equal(c.causes.length,1);
  assert.equal(c.causes[0].parentId,'');
  const a=c.causes[0].id;
  assert.equal($('#why-parent').value,a);

  commitWhy('Reviews begin after the planned review window',a);
  c=state().cases[0];const b=c.causes[1].id;
  assert.equal(c.causes[1].parentId,a);
  assert.match($('#view-root').innerHTML,/WHY 2/);
  assert.ok($('#why-connections'), 'SVG connector overlay exists for linked cause cards');

  $('[data-action=why-clear]').click();
  commitWhy('Changes arrive late from stakeholders');
  c=state().cases[0];const alt=c.causes[2].id;
  assert.equal(c.causes[2].parentId,'');
  assert.equal($('#view-root').querySelectorAll('[data-why-card]').length,3);

  $('[data-action=why-select][data-id="'+a+'"]').click();
  assert.equal($('#why-parent').value,a);
  const input=$('[data-cause-text="'+a+'"]');
  input.value='Final approval workload exceeds capacity';
  fireChange(input);
  assert.equal(state().cases[0].causes.find(x=>x.id===a).text,'Final approval workload exceeds capacity');

  $('[data-action=why-present]').click();
  assert.ok(dom.window.document.body.classList.contains('why-presenting'));
  $('[data-action=why-present]').click();
  assert.ok(!dom.window.document.body.classList.contains('why-presenting'));

  $('[data-action=why-to-evidence]').click();
  assert.equal($('[data-view=evidence]').getAttribute('aria-current'),'page');
  assert.ok($('#view-root').textContent.includes('Final approval workload exceeds capacity'));
  $('[data-view=fishbone]').click();
  assert.ok($('#fishbone-svg').outerHTML.includes('Changes arrive late'));
  $('[data-view=tree]').click();
  assert.ok($('#view-root').innerHTML.includes('Reviews begin after'));
  const final=state().cases[0];
  assert.equal(final.causes.length,3);
  assert.equal(final.causes.find(x=>x.id===b).parentId,a);
  assert.ok(final.causes.some(x=>x.id===alt));
  assert.equal(state().view,'tree');

  $('[data-view=whys]').click();
  $('[data-action=why-sample]').click();
  assert.equal(state().cases.length,2);
  assert.equal(state().cases[0].causes.length,7);
  assert.equal($('[data-view=whys]').getAttribute('aria-current'),'page');
  assert.equal(state().cases[1].causes.length,3,'Sample should not overwrite existing work');
 }finally{
  Object.assign(globalThis,previous);
  dom.window.close();
 }
});
