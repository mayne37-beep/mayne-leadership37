(()=>{'use strict';
const $=s=>document.querySelector(s);
const year=$('#year');if(year)year.textContent=new Date().getFullYear();
const menu=$('#menu-btn'),nav=$('#nav');
if(menu&&nav){
 const close=()=>{nav.classList.remove('open');menu.setAttribute('aria-expanded','false');menu.textContent='☰';menu.setAttribute('aria-label','Open navigation')};
 menu.addEventListener('click',()=>{const open=nav.classList.toggle('open');menu.setAttribute('aria-expanded',String(open));menu.textContent=open?'×':'☰';menu.setAttribute('aria-label',open?'Close navigation':'Open navigation')});
 nav.querySelectorAll('a').forEach(a=>a.addEventListener('click',close));
 document.addEventListener('keydown',e=>{if(e.key==='Escape')close()});
 document.addEventListener('click',e=>{if(!nav.contains(e.target)&&!menu.contains(e.target))close()});
}
const search=$('#library-search'),cards=[...document.querySelectorAll('[data-library-card]')],groups=[...document.querySelectorAll('[data-library-group]')],filters=[...document.querySelectorAll('[data-library-filter]')],count=$('#library-count'),empty=$('#library-empty');
if(search&&cards.length){
 let topic='all';
 const render=()=>{
  const term=search.value.toLocaleLowerCase().trim().replace(/\s+/g,' ');
  let visible=0;
  cards.forEach(card=>{const match=(topic==='all'||card.dataset.topic===topic)&&(!term||card.textContent.toLocaleLowerCase().includes(term));card.hidden=!match;if(match)visible++});
  groups.forEach(group=>{group.hidden=![...group.querySelectorAll('[data-library-card]')].some(card=>!card.hidden)});
  if(count)count.textContent=visible+' resource'+(visible===1?'':'s')+' found';
  if(empty)empty.hidden=visible!==0;
  filters.forEach(btn=>{const active=btn.dataset.libraryFilter===topic;btn.classList.toggle('active',active);btn.setAttribute('aria-pressed',String(active))});
 };
 search.addEventListener('input',render);
 filters.forEach(btn=>btn.addEventListener('click',()=>{topic=btn.dataset.libraryFilter;render()}));
 render();
}
})();