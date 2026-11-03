/* Dashboard presentation uses the existing forms and summaryData as its source of truth. */
(() => {
  'use strict';
  const assessments = [
    { id:'mbti', title:'Personality preferences', name:'MBTI', color:'#6b5fa6', soft:'#f1eef9', copy:'Explore how you take in information, make decisions, and organize your world.', icon:'<path d="M12 3v18M3 12h18M8 4H5a1 1 0 0 0-1 1v3m12-4h3a1 1 0 0 1 1 1v3M4 16v3a1 1 0 0 0 1 1h3m8 0h3a1 1 0 0 0 1-1v-3"/>', chart:'preferences' },
    { id:'ennea', title:'Core motivators', name:'Enneagram', color:'#9e526e', soft:'#faeef2', copy:'Reflect on the motivations and patterns that influence your everyday choices.', icon:'<circle cx="12" cy="12" r="8.5"/><path d="m12 7 4 8H8z"/>', chart:'motivators' },
    { id:'genius', title:'Working genius', name:'Working Genius', color:'#9b651e', soft:'#fbf3e7', copy:'Discover the kinds of work that give you energy and help you contribute.', icon:'<path d="M9 18h6m-5 3h4M8 14a6 6 0 1 1 8 0c-1 1-1 2-1 2H9s0-1-1-2Z"/>', chart:'genius' },
    { id:'strength', title:'Leadership strengths', name:'StrengthsFinder', color:'#486aa4', soft:'#edf2fa', copy:'See how you tend to execute, influence, build relationships, and think strategically.', icon:'<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z"/>', chart:'strengths' },
    { id:'disc', title:'Communication style', name:'DiSC', color:'#28776c', soft:'#eaf5f1', copy:'Understand your behavioral preferences and how you connect with other people.', icon:'<path d="M20 11a8 8 0 0 1-8 8H5l-3 2v-9a8 8 0 1 1 18-1Z"/><path d="M7 10h9M7 14h5"/>', chart:'disc' },
    { id:'kolb', title:'Learning approach', name:'Kolb', color:'#a15c47', soft:'#fbf0ec', copy:'Explore how experience, reflection, ideas, and practice support your learning.', icon:'<path d="m2 9 10-5 10 5-10 5Zm4 2v6c4 3 8 3 12 0v-6m4-2v7"/>', chart:'learning' },
    { id:'tki', title:'Conflict approach', name:'TKI', color:'#506481', soft:'#edf1f7', copy:'Recognize how you respond to disagreement and consider other approaches.', icon:'<path d="M4 5h12v9H9l-5 4Zm5 12h7l4 3V9h-1"/>', chart:'conflict' },
    { id:'eq', title:'Emotional intelligence', name:'EQ', color:'#30748f', soft:'#eaf4f8', copy:'Reflect on emotional awareness, self-management, and your relationships.', icon:'<path d="M20 5a5 5 0 0 0-8 1 5 5 0 0 0-8-1c-4 4 0 8 8 15 8-7 12-11 8-15Z"/><path d="m5 12 3-1 2 3 3-6 2 4h4"/>', chart:'eq' }
  ];
  const resultKeys = {mbti:'type',ennea:'primary',genius:'top',strength:'domain',disc:'style',kolb:'style',tki:'style',eq:'highest'};
  const byId = new Map(assessments.map(item => [item.id, item]));
  const getForm = id => document.getElementById(id + 'Form');
  const getCard = id => document.querySelector(`.summary-card[data-assessment="${id}"]`);

  function bars(labels, values, horizontal = false) {
    if (horizontal) return labels.map((label, i) => `<text x="0" y="${15+i*21}" fill="currentColor" font-size="9">${label}</text><rect x="77" y="${5+i*21}" width="151" height="12" rx="4" fill="currentColor" opacity=".08"/><rect x="77" y="${5+i*21}" width="${values[i]*1.51}" height="12" rx="4" fill="currentColor" opacity="${.4+i*.12}"/>`).join('');
    const step = 230 / labels.length;
    return labels.map((label,i)=>`<rect x="${i*step+5}" y="${79-values[i]*.72}" width="${step-11}" height="${values[i]*.72}" rx="4" fill="currentColor" opacity="${.35+(i%3)*.22}"/><text x="${i*step+step/2}" y="94" text-anchor="middle" fill="currentColor" font-size="9">${label}</text>`).join('');
  }

  function preview(item) {
    let shapes = '';
    if(item.chart==='preferences') shapes = bars(['E / I','S / N','T / F','J / P'],[64,42,80,56],true);
    if(item.chart==='motivators') shapes = bars(['1','2','3','4','5','6','7','8','9'],[50,67,42,82,54,73,38,61,46]);
    if(item.chart==='genius') shapes = bars(['W','I','D','G','E','T'],[44,76,60,41,82,56]);
    if(item.chart==='strengths') shapes = bars(['Execute','Influence','Relate','Think'],[74,46,86,60]);
    if(item.chart==='conflict') shapes = bars(['Compete','Collaborate','Compromise','Avoid','Accommodate'],[47,77,60,35,58],true).replaceAll('width="151"','width="139"');
    if(item.chart==='disc'||item.chart==='learning') {
      const labels=item.chart==='disc'?['D','i','C','S']:['Experience','Reflect','Practice','Concepts'];
      shapes=`<rect x="51" y="3" width="128" height="84" rx="7" fill="currentColor" opacity=".06"/><path d="M115 3v84M51 45h128" stroke="currentColor" stroke-opacity=".25"/><circle cx="143" cy="62" r="17" fill="currentColor" opacity=".12"/><circle cx="143" cy="62" r="5" fill="currentColor"/><text x="43" y="22" text-anchor="end" font-size="9" fill="currentColor">${labels[0]}</text><text x="187" y="22" font-size="9" fill="currentColor">${labels[1]}</text><text x="43" y="78" text-anchor="end" font-size="9" fill="currentColor">${labels[2]}</text><text x="187" y="78" font-size="9" fill="currentColor">${labels[3]}</text>`;
    }
    if(item.chart==='eq') shapes='<g transform="translate(115 47)"><path d="M0-40 52 0 0 40-52 0Z M0-27 35 0 0 27-35 0Z M0-13 17 0 0 13-17 0Z" fill="none" stroke="currentColor" stroke-opacity=".2"/><path d="M0-33 39 0 0 24-43 0Z" fill="currentColor" fill-opacity=".18" stroke="currentColor" stroke-width="2"/><path d="M0-40V40M-52 0H52" stroke="currentColor" stroke-opacity=".15"/></g><text x="115" y="6" text-anchor="middle" font-size="8" fill="currentColor">Self-awareness</text><text x="172" y="50" font-size="8" fill="currentColor">Manage self</text><text x="115" y="96" text-anchor="middle" font-size="8" fill="currentColor">Social awareness</text><text x="57" y="50" text-anchor="end" font-size="8" fill="currentColor">Relationships</text>';
    const height=item.chart==='conflict'?112:100;
    return `<svg viewBox="0 0 230 ${height}" role="img" aria-label="Illustrative ${item.name} chart; example only, not your results">${shapes}</svg><figcaption>Example chart · not your results</figcaption>`;
  }

  function stateFor(item) {
    const form=getForm(item.id);
    const total=form.querySelectorAll('.question-group').length;
    const answered=form.querySelectorAll('input[type="radio"]:checked').length;
    const complete=typeof summaryData!=='undefined' && !!summaryData[item.id][resultKeys[item.id]];
    return {item,total,answered,complete,state:complete?'complete':answered?'progress':'not-started'};
  }

  function launch(id) {
    const item=byId.get(id);
    if(!item)return;
    const tabButton=document.querySelector(`.tab-btn[data-assessment-tab="${id}"]`);
    window.openTab(id+'-tab',tabButton);
    const state=stateFor(item);
    if(state.complete){
      const results=document.getElementById(id+'Results');
      results.setAttribute('tabindex','-1');
      results.focus({preventScroll:true});
      results.scrollIntoView({behavior:motion(),block:'start'});
    }else{
      const start=getForm(id).querySelector('.assessment-start-button');
      if(start && !start.closest('[hidden]'))start.click();
      else {
        const current=getForm(id).querySelector('.question-group:not([hidden])');
        const radio=current?.querySelector('input:checked')||current?.querySelector('input');
        current?.scrollIntoView({behavior:motion(),block:'center'});
        radio?.focus({preventScroll:true});
      }
    }
  }
  const motion=()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth';
  let chartFrame;

  function resizeVisibleCharts() {
    if(typeof Chart==='undefined'||typeof Chart.getChart!=='function')return;
    document.querySelectorAll('.tab-content.active canvas').forEach(canvas=>{
      const chart=Chart.getChart(canvas);
      const width=canvas.parentElement.clientWidth;
      if(!chart||!canvas.getClientRects().length||!width)return;
      // Charts are initially created inside hidden results or inactive tabs.
      // Explicit dimensions avoid a zero-height parent preventing their first resize.
      chart.resize(width,Math.round(width/(Number(chart.options.aspectRatio)||2)));
      chart.update('none');
    });
  }

  function refresh() {
    const states=assessments.map(stateFor);
    const completed=states.filter(s=>s.complete).length;
    const underway=states.filter(s=>s.state==='progress').length;
    document.getElementById('profileCompleted').textContent=completed;
    document.getElementById('profilePercentage').textContent=Math.round(completed/8*100)+'%';
    const progress=document.getElementById('profileSegments');
    progress.setAttribute('aria-valuenow',completed);
    progress.setAttribute('aria-valuetext',`${completed} of 8 assessments completed`);
    document.getElementById('profileProgressNote').textContent=completed===8
      ? 'All eight perspectives are ready. Explore your results and choose one insight to put into practice.'
      : underway ? `${underway} assessment${underway===1?'':'s'} in progress. Resume below, or explore another perspective.`
      : completed ? 'Your profile is taking shape. Choose another perspective to keep exploring.'
      : 'Start with any assessment. Each one adds a different perspective to your profile.';
    states.forEach(s=>{
      const card=getCard(s.item.id);
      card.dataset.state=s.state;
      card.querySelector('.assessment-status').textContent=s.complete?'✓ Completed':s.answered?'In progress':'Not started';
      card.querySelector('.assessment-preview').hidden=s.complete;
      card.querySelector('.card-question-count').textContent=s.answered?`${s.answered} / ${s.total} answered`:`${s.total} questions`;
      const action=card.querySelector('.card-action');
      action.querySelector('span').textContent=s.complete?'View results':s.answered?'Resume assessment':'Begin assessment';
      action.setAttribute('aria-label',`${s.complete?'View':s.answered?'Resume':'Begin'} ${s.item.name}${s.complete?' results':' assessment'}`);
      document.querySelector(`.profile-segment[data-assessment="${s.item.id}"]`).dataset.state=s.state;
    });
    const next=states.find(s=>s.state==='progress')||states.find(s=>s.item.id==='disc'&&!s.complete)||states.find(s=>!s.complete);
    const featureButton=document.getElementById('featuredAction');
    if(!next){
      document.getElementById('featuredEyebrow').textContent='EIGHT PERSPECTIVES, ONE PROFILE';
      document.getElementById('featuredTitle').textContent='Make your insights count.';
      document.getElementById('featuredCopy').textContent='Review your results, share a useful insight with someone you trust, and choose one behavior to practice this week.';
      document.getElementById('featuredMeta').textContent='Your completed profile is ready to print or save.';
      featureButton.textContent='Print your profile ↗';
      featureButton.onclick=()=>window.print();
    }else{
      document.getElementById('featuredEyebrow').textContent=next.answered?'CONTINUE YOUR EXPLORATION':'A GOOD PLACE TO START';
      document.getElementById('featuredTitle').textContent=next.answered?'Pick up where you left off.':next.item.id==='disc'?'Start with how you communicate.':`Explore your ${next.item.title.toLowerCase()}.`;
      document.getElementById('featuredCopy').textContent=next.answered?`Your ${next.item.name} assessment has ${next.answered} of ${next.total} questions answered. Continue at your own pace.`:next.item.copy;
      const minutes=Math.max(3,Math.ceil(next.total*.16));
      document.getElementById('featuredMeta').textContent=`${next.item.name} · ${next.total} questions · Est. ${minutes}–${Math.ceil(minutes*1.5)} min`;
      featureButton.textContent=`${next.answered?'Resume':'Begin'} ${next.item.name} →`;
      featureButton.onclick=()=>launch(next.item.id);
    }
    window.cancelAnimationFrame(chartFrame);
    chartFrame=window.requestAnimationFrame(resizeVisibleCharts);
  }

  function initialize() {
    assessments.forEach(item=>{
      const card=getCard(item.id);
      card.querySelector('.assessment-icon').innerHTML=`<svg viewBox="0 0 24 24" aria-hidden="true">${item.icon}</svg>`;
      card.querySelector('.assessment-preview').innerHTML=preview(item);
      const s=stateFor(item), minutes=Math.max(3,Math.ceil(s.total*.16));
      card.querySelector('.card-duration').textContent=`Est. ${minutes}–${Math.ceil(minutes*1.5)} min`;
      card.querySelector('.card-action').addEventListener('click',()=>launch(item.id));
      getForm(item.id).addEventListener('change',refresh);
      getForm(item.id).addEventListener('reset',()=>window.requestAnimationFrame(refresh));
    });
    document.addEventListener('assessment:summary-updated',refresh);
    const originalOpenTab=window.openTab;
    window.openTab=function(id,button){
      originalOpenTab(id,button);
      document.querySelectorAll('.tab-btn').forEach(tab=>{
        tab.setAttribute('aria-selected',String(tab===button));
        tab.tabIndex=tab===button?0:-1;
      });
      refresh();
    };
    const tabs=Array.from(document.querySelectorAll('.tab-btn'));
    tabs.forEach((tab,index)=>tab.addEventListener('keydown',e=>{
      let next;
      if(e.key==='ArrowRight')next=(index+1)%tabs.length;
      if(e.key==='ArrowLeft')next=(index+tabs.length-1)%tabs.length;
      if(e.key==='Home')next=0;
      if(e.key==='End')next=tabs.length-1;
      if(next===undefined)return;
      e.preventDefault();tabs[next].click();tabs[next].focus();
    }));

    document.querySelectorAll('.deep-dive-section').forEach(section=>{
      const heading=section.querySelector('h3');
      if(!heading)return;
      const details=document.createElement('details');
      details.className=section.className+' studio-deep-dive';
      if(section.id)details.id=section.id;
      const summary=document.createElement('summary');
      summary.textContent=heading.textContent;
      const body=document.createElement('div');
      body.className='studio-deep-dive-body';
      heading.remove();
      while(section.firstChild)body.appendChild(section.firstChild);
      details.append(summary,body);section.replaceWith(details);
    });
    const originalDeepDive=window.scrollToDeepDive;
    window.scrollToDeepDive=function(e){
      const details=document.querySelector('.tab-content.active details.studio-deep-dive');
      if(details)details.open=true;
      originalDeepDive(e);
    };
    const menu=document.getElementById('reportMenu');
    document.addEventListener('click',e=>{if(!menu.contains(e.target))menu.open=false;});
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&menu.open){menu.open=false;menu.querySelector('summary').focus();}});
    const originalTheme=window.toggleTheme;
    const theme=document.getElementById('themeToggle');
    window.toggleTheme=function(){
      originalTheme();
      const dark=document.documentElement.getAttribute('data-theme')==='dark';
      theme.textContent=dark?'Light mode':'Dark mode';
      theme.setAttribute('aria-pressed',String(dark));
    };
    refresh();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initialize,{once:true});
  else initialize();
})();
