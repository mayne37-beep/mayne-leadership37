(()=>{'use strict';
const input=document.getElementById('catalog-search');
if(!input)return;
const cards=[...document.querySelectorAll('[data-catalog-card]')],filters=[...document.querySelectorAll('[data-catalog-filter]')],count=document.getElementById('catalog-count'),empty=document.getElementById('catalog-empty'),clear=document.getElementById('catalog-clear'),reset=document.getElementById('catalog-reset');
const categories=new Set(filters.map(f=>f.dataset.catalogFilter));const params=new URLSearchParams(window.location.search);
let category=categories.has(params.get('category'))?params.get('category'):'all';
input.value=params.get('q')||'';
const normalize=s=>s.toLocaleLowerCase().replace(/\s+/g,' ').trim();
const render=()=>{
 const query=normalize(input.value);let visible=0;
 for(const card of cards){
  const matchCategory=category==='all'||card.dataset.category===category;
  const matchText=!query||normalize(card.textContent).includes(query);
  card.hidden=!(matchCategory&&matchText);if(!card.hidden)visible++;
 }
 count.textContent=visible+' resource'+(visible===1?'':'s')+' found';
 empty.hidden=visible!==0;
 for(const button of filters){const active=button.dataset.catalogFilter===category;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));}
 clear.disabled=!input.value;
 const url=new URL(window.location.href);
 if(query)url.searchParams.set('q',input.value.trim());else url.searchParams.delete('q');
 if(category!=='all')url.searchParams.set('category',category);else url.searchParams.delete('category');
 if(window.history&&window.history.replaceState)window.history.replaceState(null,'',url.pathname+url.search+url.hash);
};
filters.forEach(button=>button.addEventListener('click',()=>{category=button.dataset.catalogFilter;render();}));
input.addEventListener('input',render);
clear.addEventListener('click',()=>{input.value='';render();input.focus();});
reset.addEventListener('click',()=>{category='all';input.value='';render();input.focus();});
render();
})();