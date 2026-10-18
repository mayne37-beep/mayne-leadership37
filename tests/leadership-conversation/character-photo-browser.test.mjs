import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';

test('Photo upload from Character Creator is resized, stored locally and reused for each expression',async()=>{
 const html=await readFile(new URL('../../leadership-conversation-simulator.html',import.meta.url),'utf8');
 const dom=new JSDOM(html,{url:'https://www.mayneleadership.com/leadership-conversation-simulator.html',pretendToBeVisual:true});
 const names=['window','document','localStorage','FormData','Image','FileReader'];
 const originals=Object.fromEntries(names.map(k=>[k,globalThis[k]]));
 const $=q=>dom.window.document.querySelector(q);
 const click=q=>{const el=$(q);assert.ok(el,'Missing '+q);el.click()};
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,localStorage:dom.window.localStorage,FormData:dom.window.FormData});
 dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true};
 dom.window.HTMLDialogElement.prototype.close=function(){this.open=false};
 const originalDraw=dom.window.HTMLCanvasElement.prototype.getContext;
 const originalData=dom.window.HTMLCanvasElement.prototype.toDataURL;
 let drewImage=false;
 dom.window.HTMLCanvasElement.prototype.getContext=function(){return{drawImage(){drewImage=true}}};
 dom.window.HTMLCanvasElement.prototype.toDataURL=function(){return 'data:image/webp;base64,AAAA'};
 globalThis.FileReader=class{
  readAsDataURL(file){this.result='data:image/png;base64,AAAA';queueMicrotask(()=>this.onload?.({target:this}));}
 };
 globalThis.Image=class{
  constructor(){this.naturalWidth=600;this.naturalHeight=800;}
  set src(value){this._src=value;queueMicrotask(()=>this.onload?.());}
 };
 try{
  await import('../../assets/leadership-conversation.js?test=character-photo-upload');
  const saved=()=>JSON.parse(dom.window.localStorage.getItem('mayne.leadership-conversation.v1'));
  click('[data-view="characters"]');
  click('[data-character-style="photo"]');
  click('[data-character-emotion="frustrated"]');
  assert.ok($('.photo-placeholder'),'Empty photo should not be represented as a fake realistic portrait');
  click('[data-photo-upload="frustrated"]');
  const control=$('#character-photo-input');
  assert.equal(control.dataset.emotion,'frustrated');
  const expectedId=control.dataset.characterId;
  const photo={name:'portrait.png',type:'image/png',size:1200};
  Object.defineProperty(control,'files',{configurable:true,value:[photo]});
  control.dispatchEvent(new dom.window.Event('change',{bubbles:true}));
  await new Promise(resolve=>setTimeout(resolve,5));
  assert.equal(drewImage,true,'Photo upload did not reach image resizing: '+$('#toast').textContent);
  const character=saved().characters.find(c=>c.id===expectedId);
  assert.equal(character.photos.frustrated,'data:image/webp;base64,AAAA');
  assert.ok($('.character-photo'),'Photo portrait should render');
  assert.equal($('.character-portrait-main .character-photo').alt.includes('frustrated'),true);
  click('[data-photo-remove="frustrated"]');
  assert.equal(saved().characters.find(c=>c.id===expectedId).photos.frustrated,undefined);
  assert.ok($('.photo-placeholder'));
  assert.match($('#toast').textContent,/photo|saved/i);
 }finally{
  dom.window.HTMLCanvasElement.prototype.getContext=originalDraw;
  dom.window.HTMLCanvasElement.prototype.toDataURL=originalData;
  for(const key of names)if(originals[key]===undefined)delete globalThis[key];else globalThis[key]=originals[key];
  dom.window.close();
 }
});
