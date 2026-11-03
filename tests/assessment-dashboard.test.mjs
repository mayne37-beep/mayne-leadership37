import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM,VirtualConsole} from 'jsdom';

const html=await readFile(new URL('../leadership-assessments.html',import.meta.url),'utf8');
const pager=await readFile(new URL('../assets/assessment-pagination.js',import.meta.url),'utf8');
const dashboard=await readFile(new URL('../assets/assessment-dashboard.js',import.meta.url),'utf8');
const types=['mbti','ennea','genius','strength','disc','kolb','tki','eq'];
const counts=[50,27,18,24,50,24,15,20];

async function workspace(){
  const errors=[];
  const console=new VirtualConsole();
  console.on('jsdomError',e=>errors.push(e));
  const dom=new JSDOM(html.replace(/<script[^>]+src="[^"]+"[^>]*><\/script>/g,''),{
    runScripts:'dangerously',url:'https://www.mayneleadership.com/leadership-assessments.html',pretendToBeVisual:true,virtualConsole:console,
    beforeParse(window){
      window.Chart=class{static defaults={};constructor(){}destroy(){}update(){}};
      window.HTMLCanvasElement.prototype.getContext=()=>({});
      window.CSS={supports:()=>true};
      window.scrollTo=()=>{};
      window.HTMLElement.prototype.scrollIntoView=()=>{};
      window.matchMedia=()=>({matches:true});
      window.alert=()=>{};
    }
  });
  await new Promise(resolve=>dom.window.document.addEventListener('DOMContentLoaded',resolve,{once:true}));
  dom.window.eval(pager);dom.window.eval(dashboard);
  return {dom,w:dom.window,d:dom.window.document,errors};
}

test('initial dashboard offers eight illustrated assessments and accurate question counts',async()=>{
  const {w,d,errors}=await workspace();
  assert.equal(d.querySelectorAll('.summary-card').length,8);
  assert.equal(d.querySelectorAll('.assessment-preview svg').length,8);
  assert.equal(d.querySelectorAll('details.studio-deep-dive').length,8);
  assert.equal(d.querySelector('#profileCompleted').textContent,'0');
  assert.equal(d.querySelector('#featuredAction').textContent,'Begin DiSC →');
  types.forEach((type,i)=>{
    assert.equal(d.querySelectorAll(`#${type}QuestionsContainer .question-group`).length,counts[i]);
    assert.equal(d.querySelector(`[data-assessment="${type}"] .card-question-count`).textContent,`${counts[i]} questions`);
    assert.equal(d.querySelectorAll(`#${type}Form .question-group:not([hidden])`).length,0);
  });
  assert.deepEqual(errors,[]);
  w.close();
});

test('Begin and Resume retain answers, block early results, and reset dashboard status',async()=>{
  const {w,d,errors}=await workspace();
  d.querySelector('#featuredAction').click();
  assert.equal(d.querySelector('.tab-content.active').id,'disc-tab');
  const form=d.querySelector('#discForm');
  assert.equal(form.querySelectorAll('.question-group:not([hidden])').length,1);
  form.requestSubmit();
  assert.equal(d.querySelector('#profileCompleted').textContent,'0');
  const first=form.querySelector('.question-group:not([hidden]) input');
  first.checked=true;first.dispatchEvent(new w.Event('change',{bubbles:true}));
  form.querySelector('.assessment-next').click();
  const second=form.querySelector('.question-group:not([hidden])');
  d.querySelector('#tab-summary').click();
  const card=d.querySelector('.summary-card[data-assessment="disc"]');
  assert.equal(card.dataset.state,'progress');
  assert.equal(card.querySelector('.card-question-count').textContent,'1 / 50 answered');
  assert.equal(d.querySelector('#featuredAction').textContent,'Resume DiSC →');
  card.querySelector('.card-action').click();
  assert.equal(form.querySelector('.question-group:not([hidden])'),second);
  assert.equal(first.checked,true);
  w.resetAssessment('disc',true);
  assert.equal(card.dataset.state,'not-started');
  assert.equal(card.querySelector('.assessment-preview').hidden,false);
  assert.equal(form.querySelectorAll('.question-group:not([hidden])').length,0);
  assert.deepEqual(errors,[]);
  w.close();
});

test('all eight completed assessments replace examples with results and advance profile progress',async()=>{
  const {w,d,errors}=await workspace();
  for(const type of types){
    d.querySelector(`.summary-card[data-assessment="${type}"] .card-action`).click();
    const form=d.querySelector(`#${type}Form`);
    form.querySelectorAll('.question-group').forEach(q=>q.querySelector('input').checked=true);
    form.dispatchEvent(new w.Event('change',{bubbles:true}));
    form.requestSubmit();
  }
  await new Promise(resolve=>w.setTimeout(resolve,950));
  assert.equal(d.querySelector('#profileCompleted').textContent,'8');
  assert.equal(d.querySelector('#profilePercentage').textContent,'100%');
  types.forEach(type=>{
    const card=d.querySelector(`.summary-card[data-assessment="${type}"]`);
    assert.equal(card.dataset.state,'complete',type);
    assert.equal(card.querySelector('.assessment-preview').hidden,true,type);
    assert.equal(card.querySelector('.card-action span').textContent,'View results');
    assert.equal(d.querySelector(`#sum-${type}-chart-wrap`).style.display,'block');
  });
  assert.equal(d.querySelector('#featuredAction').textContent,'Print your profile ↗');
  d.querySelector('.summary-card[data-assessment="eq"] .card-action').click();
  assert.equal(d.querySelector('.tab-content.active').id,'eq-tab');
  assert.equal(d.activeElement.id,'eqResults');
  assert.deepEqual(errors,[]);
  w.close();
});

test('keyboard tabs, expandable explanations, report controls, and display mode remain usable',async()=>{
  const {w,d,errors}=await workspace();
  d.querySelector('#tab-summary').dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));
  assert.equal(d.querySelector('#tab-mbti').getAttribute('aria-selected'),'true');
  assert.equal(d.activeElement.id,'tab-mbti');
  const details=d.querySelector('#mbti-tab details');
  assert.equal(details.open,false);
  w.scrollToDeepDive();
  assert.equal(details.open,true);
  const menu=d.querySelector('#reportMenu');menu.open=true;
  d.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
  assert.equal(menu.open,false);
  assert.equal(d.querySelectorAll('.summary-actions button').length,4);
  d.querySelector('#themeToggle').click();
  assert.equal(d.documentElement.getAttribute('data-theme'),'dark');
  assert.equal(d.querySelector('#themeToggle').getAttribute('aria-pressed'),'true');
  d.querySelector('#themeToggle').click();
  assert.equal(d.documentElement.getAttribute('data-theme'),'light');
  assert.deepEqual(errors,[]);
  w.close();
});

test('saved progress follows the original question after a new randomized visit; legacy files still load',async()=>{
  const first=await workspace();
  const q=first.d.querySelector('#discQuestionsContainer .question-group');
  const questionText=q.querySelector('.question-text').textContent.replace(/^\s*\d+\.\s*/,'').trim();
  const radio=q.querySelector('input');radio.checked=true;
  let saved;
  first.d.addEventListener('click',event=>{
    const anchor=event.target.closest('a[download]');
    if(!anchor)return;
    event.preventDefault();
    saved=JSON.parse(decodeURIComponent(anchor.href.split(',').slice(1).join(',')));
  });
  first.w.exportDataToJSON();
  assert.equal(saved.version,2);
  assert.equal(saved.questionAnswers[0].question,questionText);
  first.w.close();

  const second=await workspace();
  const target=Array.from(second.d.querySelectorAll('#discQuestionsContainer .question-group')).find(group=>group.querySelector('.question-text').textContent.replace(/^\s*\d+\.\s*/,'').trim()===questionText);
  const importFile=async data=>{
    const file=new second.w.File([JSON.stringify(data)],'progress.json',{type:'application/json'});
    second.w.importDataFromJSON({target:{files:[file],value:'progress.json'}});
    await new Promise(resolve=>second.w.setTimeout(resolve,40));
  };
  await importFile(saved);
  assert.equal(target.querySelector('input:checked').value,radio.value);
  assert.equal(second.d.querySelectorAll('#discForm input:checked').length,1);
  assert.equal(second.d.querySelector('.summary-card[data-assessment="disc"]').dataset.state,'progress');
  await importFile({version:1,answers:{eq_q0:'5'}});
  assert.equal(second.d.querySelector('input[name="eq_q0"][value="5"]').checked,true);
  assert.equal(second.d.querySelector('.summary-card[data-assessment="eq"]').dataset.state,'progress');
  assert.deepEqual(second.errors,[]);
  second.w.close();
});

test('imported completed results remain visible after the reset animation finishes',async()=>{
  const {w,d,errors}=await workspace();
  const answers={};
  d.querySelectorAll('#tkiQuestionsContainer .question-group').forEach(q=>{
    const radio=q.querySelector('input');answers[radio.name]=radio.value;
  });
  const file=new w.File([JSON.stringify({version:1,answers})],'progress.json',{type:'application/json'});
  w.importDataFromJSON({target:{files:[file],value:'progress.json'}});
  await new Promise(resolve=>w.setTimeout(resolve,700));
  assert.equal(d.querySelector('#profileCompleted').textContent,'1');
  assert.equal(d.querySelector('#tkiResults').style.display,'block');
  assert.equal(d.querySelector('.summary-card[data-assessment="tki"] .assessment-preview').hidden,true);
  assert.deepEqual(errors,[]);
  w.close();
});

test('a rating stays attached to its displayed question and produces the expected conflict result',async()=>{
  const {w,d,errors}=await workspace();
  const competing=new Set([
    'I argue my case firmly to show the merits of my position and ensure I win the point.',
    'I use my authority, influence, or expertise to ensure my solution is adopted.',
    'I am willing to risk causing hard feelings if it means getting the necessary results.'
  ]);
  d.querySelector('.summary-card[data-assessment="tki"] .card-action').click();
  const form=d.querySelector('#tkiForm');
  form.querySelectorAll('.question-group').forEach(q=>{
    const text=q.querySelector('.question-text').textContent.replace(/^\s*\d+\.\s*/,'').trim();
    q.querySelector(`input[value="${competing.has(text)?5:1}"]`).checked=true;
  });
  form.dispatchEvent(new w.Event('change',{bubbles:true}));
  form.requestSubmit();
  await new Promise(resolve=>w.setTimeout(resolve,900));
  assert.equal(d.querySelector('#tkiDominantStyle').innerText,'Competing');
  assert.deepEqual(JSON.parse(w.eval('JSON.stringify(summaryData.tki.scores)')),
    {Competing:15,Collaborating:3,Compromising:3,Avoiding:3,Accommodating:3});
  assert.deepEqual(errors,[]);
  w.close();
});
