import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {templateProject,startSession,choose} from '../../assets/leadership-conversation-model.js';
import {sidebarHTML,pulseHTML,practiceHTML,reviewHTML} from '../../assets/leadership-conversation-render.js';
const css=await readFile(new URL('../../assets/leadership-conversation.css',import.meta.url),'utf8');

const parse=(str)=>new JSDOM('<!doctype html><html><body>'+str+'</body></html>').window.document;
const luminance=hex=>{
 const v=hex.replace('#','').match(/../g).map(x=>parseInt(x,16)/255).map(c=>c<=0.04045?c/12.92:Math.pow((c+.055)/1.055,2.4));
 return v[0]*.2126+v[1]*.7152+v[2]*.0722;
};
const contrast=(a,b)=>{
 const x=luminance(a),y=luminance(b);
 return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);
};

test('Core visual emphasis follows the actual teaching workflow',()=>{
 const p=templateProject('defensive');
 let dom=parse(sidebarHTML([p],p.id));
 assert.ok(dom.querySelector('.scenario-button.active.category-performance'),'Active practice scenario has clear category color');
 assert.match(css,/\.scenario-button\.active/);
 assert.match(css,/border-left:5px solid var\(--scenario\)/);
 assert.match(css,/\.selected-card button\.primary/);
 assert.match(css,/\.tabs button\.active/);
 assert.match(css,/\.intro-case>.start-button/);

 startSession(p);
 dom=parse(practiceHTML(p));
 assert.ok(dom.querySelector('.conversation-stage.emotion-frustrated'));
 assert.ok(dom.querySelector('.dialogue-area blockquote'));
 assert.ok(dom.querySelector('.dialogue-kicker .listening-cue'));
 assert.ok(dom.querySelector('.response-heading .decision-badge'));
 assert.equal(dom.querySelectorAll('.response-choice').length,3);
 assert.ok(dom.querySelector('.response-choice.tactic-explore'));
 assert.ok(dom.querySelector('.response-choice.tactic-challenge'));
 assert.ok(dom.querySelector('.response-choice.tactic-avoid'));
 assert.ok(dom.querySelector('.typed-response #submit-typed'));
 for(const selector of ['.conversation-stage:before','.dialogue-area blockquote','.response-heading','.response-choice','.typed-response','.coaching-feedback','.completion']){
  assert.ok(css.includes(selector),'Missing high-priority styling '+selector);
 }
});
test('Simulation signals are readable, explicitly scripted, and accessible',()=>{
 const p=templateProject('defensive');
 let dom=parse(pulseHTML(p));
 assert.equal(dom.querySelectorAll('[role=progressbar]').length,4);
 for(const element of dom.querySelectorAll('[role=progressbar]')){
  assert.equal(element.getAttribute('aria-valuenow'),'50');
  assert.ok(element.getAttribute('aria-label').includes('scripted indicator'));
  assert.equal(element.getAttribute('aria-valuemax'),'100');
 }
 startSession(p);
 choose(p,p.nodes[0].choices[1].id);
 dom=parse(pulseHTML(p));
 assert.ok(dom.querySelector('.pulse-metric.metric-down'));
 assert.ok(dom.querySelector('.pulse-metric.metric-up'));
 assert.match(dom.body.textContent,/vs\. start/);
 assert.match(css,/\.pulse-metric\.metric-down \.pulse-change/);
 assert.match(css,/\.pulse-metric\.metric-up \.pulse-change/);
 const review=parse(reviewHTML(p));
 assert.equal(review.querySelectorAll('.review-metric').length,4);
 assert.ok(review.querySelector('.review-metric.metric-safety'));
});
test('High-contrast action and guidance colors remain readable on light backgrounds',()=>{
 const pairs=[
  ['#493207','#f4d188','gold primary action'],
  ['#153f5c','#eaf6fd','employee dialogue'],
  ['#735024','#fff2d8','decision prompt'],
  ['#1c4d70','#ffffff','response text'],
  ['#7a521f','#fff4d9','coaching feedback'],
  ['#17684f','#dff4ec','positive movement'],
  ['#996238','#fff0e2','negative movement'],
  ['#ffffff','#135984','blue primary action'],
  ['#183c58','#ffffff','primary body text']
 ];
 for(const [foreground,background,label] of pairs){
  assert.ok(contrast(foreground,background)>=4.5,label+' must meet WCAG AA normal-text contrast; got '+contrast(foreground,background).toFixed(2));
 }
});
test('Mobile and reduced-motion presentation protections stay in place',()=>{
 for(const part of ['@media(max-width:525px)','@media(max-width:790px)','body.presentation-mode','.portrait-svg','@media(prefers-reduced-motion:reduce)','@media print']){
  assert.ok(css.includes(part),'Missing responsive or accessibility feature '+part);
 }
 assert.equal((css.match(/{/g)||[]).length,(css.match(/}/g)||[]).length,'No unbalanced CSS braces');
});
