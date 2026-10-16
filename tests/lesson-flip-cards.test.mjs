import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {newCourse,newBlock} from '../assets/lesson-model.js';
import {mountCourse,blockHTML} from '../assets/lesson-player.js';

test('flip cards mount with distinct front and back faces',()=>{
 const b=newBlock('flashcards');
 const html=blockHTML(b);
 assert.match(html,/flashcard-inner/);
 assert.match(html,/flashcard-front/);
 assert.match(html,/flashcard-back/);
 assert.match(html,/aria-hidden="true"/);
 assert.ok(!html.includes('class="flashcard-face"'), 'both faces must be explicit');
});

test('flip cards actually toggle 3D state instead of replacing text',()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'https://example.test/lesson-player.html'});
 const original={window:globalThis.window,document:globalThis.document,DOMParser:globalThis.DOMParser,location:globalThis.location,localStorage:globalThis.localStorage};
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,DOMParser:dom.window.DOMParser,location:dom.window.location,localStorage:dom.window.localStorage});
 try{
  const c=newCourse('Flip test');
  c.lessons[0].blocks=[newBlock('flashcards')];
  const root=document.querySelector('#root');
  const instance=mountCourse(root,c,{preview:true});
  const card=root.querySelector('.flashcard');
  assert.ok(card,'learner card renders');
  const front=card.querySelector('.flashcard-front'),back=card.querySelector('.flashcard-back');
  assert.ok(front&&back,'both faces are present');
  const frontHTML=front.innerHTML,backHTML=back.innerHTML;
  card.click();
  assert.equal(card.classList.contains('flipped'),true);
  assert.equal(card.getAttribute('aria-pressed'),'true');
  assert.equal(front.getAttribute('aria-hidden'),'true');
  assert.equal(back.getAttribute('aria-hidden'),'false');
  assert.equal(front.innerHTML,frontHTML,'front remains mounted for the transition');
  assert.equal(back.innerHTML,backHTML,'back remains mounted for the transition');
  card.click();
  assert.equal(card.classList.contains('flipped'),false);
  assert.equal(card.getAttribute('aria-pressed'),'false');
  assert.equal(front.getAttribute('aria-hidden'),'false');
  assert.equal(back.getAttribute('aria-hidden'),'true');
  instance.destroy();
 }finally{
  Object.assign(globalThis,original);
  dom.window.close();
 }
});

test('3D face styling and authoring canvas flip controls are present',async()=>{
 const css=await readFile(new URL('../assets/lesson-studio.css',import.meta.url),'utf8');
 const author=await readFile(new URL('../assets/lesson-author.js',import.meta.url),'utf8');
 const exporter=await readFile(new URL('../src/lesson-export.js',import.meta.url),'utf8');
 assert.match(css,/\.flashcard\.flipped \.flashcard-inner\s*\{[^}]*rotateY\(180deg\)/);
 assert.match(css,/\.flashcard-inner\s*\{[^}]*preserve-3d/);
 assert.match(css,/\.flashcard \.flashcard-face\s*\{[^}]*backface-visibility:hidden/);
 assert.match(css,/\.editor-canvas \.block-snapshot \.flashcard\s*\{pointer-events:auto\}/);
 assert.match(author,/querySelectorAll\('\.block-snapshot \.flashcard\[data-card\]'\)/);
 assert.match(author,/btn\.classList\.toggle\('flipped'\)/);
 assert.match(exporter,/fetch\('\/assets\/lesson-studio\.css'\)/);
 assert.match(exporter,/fetch\('\/assets\/lesson-player\.js'\)/);
});
