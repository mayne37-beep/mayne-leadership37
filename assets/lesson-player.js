export function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
export function safeURL(value,media=false){
 const s=String(value||'').trim();if(!s)return '';
 if(media&&/^data:(?:image\/(?:png|jpeg|webp|gif)|audio\/(?:mpeg|ogg|wav|webm)|video\/(?:mp4|webm)|application\/(?:pdf|octet-stream)|text\/plain);base64,[a-zA-Z0-9+/=]+$/.test(s))return s;
 if(/^blob:/.test(s)&&media)return s;
 try{const u=new URL(s,location.href);return ['http:','https:'].includes(u.protocol)?u.href:'';}catch{return '';}
}
export function safeHTML(v){
 const str=String(v||'');if(!/[<>]/.test(str))return esc(str).replace(/\n/g,'<br>');
 const doc=new DOMParser().parseFromString(str,'text/html');
 const tags=new Set(['P','BR','STRONG','B','EM','I','U','S','UL','OL','LI','H2','H3','H4','BLOCKQUOTE','A','CODE','PRE','SPAN','SUB','SUP','TABLE','THEAD','TBODY','TR','TH','TD']);
 function clean(parent){for(const el of [...parent.children]){if(!tags.has(el.tagName)){if(['SCRIPT','STYLE','IFRAME','OBJECT','SVG','MATH','FORM','INPUT'].includes(el.tagName)){el.remove();continue;}clean(el);el.replaceWith(...el.childNodes);continue;}for(const attr of [...el.attributes]){if(el.tagName==='A'&&attr.name==='href'){const u=safeURL(attr.value);if(u)el.setAttribute('href',u);else el.removeAttribute('href');}else el.removeAttribute(attr.name);}if(el.tagName==='A'){el.target='_blank';el.rel='noopener noreferrer';}clean(el);}}
 clean(doc.body);return doc.body.innerHTML;
}
function videoSource(url){const s=safeURL(url,true);try{const u=new URL(s);if(u.hostname==='youtu.be')return {embed:'https://www.youtube-nocookie.com/embed/'+encodeURIComponent(u.pathname.slice(1))};if(['www.youtube.com','youtube.com','www.youtube-nocookie.com'].includes(u.hostname)){const id=u.searchParams.get('v')||u.pathname.split('/').pop();if(/^[\w-]{11}$/.test(id))return {embed:'https://www.youtube-nocookie.com/embed/'+id};}if(['vimeo.com','www.vimeo.com','player.vimeo.com'].includes(u.hostname)){const id=u.pathname.split('/').pop();if(/^\d+$/.test(id))return {embed:'https://player.vimeo.com/video/'+id};}}catch{}return {file:s};}
function color(v,fallback='#176599'){return /^#[a-f\d]{6}$/i.test(v||'')?v:fallback;}

/* Shared color themes; kept in the player so standalone HTML and SCORM exports work. */
export const THEME_PRESETS = [
 {id:'executive-blue',name:'Executive Blue',palette:{accent:'#173B63',secondary:'#3377A7',highlight:'#D6AD60',background:'#DCEBF6',surface:'#FFFFFF',ink:'#17344B',muted:'#52697B'}},
 {id:'modern-professional',name:'Modern Professional',palette:{accent:'#283F55',secondary:'#6D91A9',highlight:'#83ACA1',background:'#E7EDF1',surface:'#FFFFFF',ink:'#283F55',muted:'#617481'}},
 {id:'warm-leadership',name:'Warm Leadership',palette:{accent:'#72523C',secondary:'#C9A77F',highlight:'#A6A86E',background:'#F4EBDC',surface:'#FFFFFF',ink:'#43372E',muted:'#75675A'}},
 {id:'slate-gold',name:'Slate & Gold',palette:{accent:'#313F51',secondary:'#667788',highlight:'#C8A052',background:'#E9EEF2',surface:'#FFFFFF',ink:'#263544',muted:'#657384'}},
 {id:'coastal-teal',name:'Coastal Teal',palette:{accent:'#145C65',secondary:'#4C9CA0',highlight:'#E0B56D',background:'#DDF1F0',surface:'#FFFFFF',ink:'#183F44',muted:'#5A7679'}},
 {id:'minimal-light',name:'Minimal Light',palette:{accent:'#527EB1',secondary:'#9DA9B4',highlight:'#9CAFC1',background:'#F3F5F7',surface:'#FFFFFF',ink:'#303944',muted:'#677582'}}
];
export const THEME_COLOR_FIELDS = [
 ['accent','Primary / buttons'],['secondary','Secondary'],['highlight','Highlights'],['background','Page background'],
 ['surface','Content cards'],['ink','Heading & body text'],['muted','Supporting text']
];
const DEFAULT_THEME_COLORS = {accent:'#176599',secondary:'#3377A7',highlight:'#C59A43',background:'#FFFFFF',surface:'#FFFFFF',ink:'#20364A',muted:'#52697B'};
export function resolveTheme(base={},override=null){
 const combined={...DEFAULT_THEME_COLORS,...(base||{}),...(override||{})};
 const result={};for(const key of Object.keys(DEFAULT_THEME_COLORS))result[key]=color(combined[key],DEFAULT_THEME_COLORS[key]);
 result.font=(override?.font||base?.font)==='serif'?'serif':'sans';
 return result;
}
function onAccent(hex){
 const channels=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4));
 return .2126*channels[0]+.7152*channels[1]+.0722*channels[2]>.18?'#172C3B':'#FFFFFF';
}
export function themeVars(theme){
 const t=resolveTheme(theme);
 return '--accent:'+t.accent+';--secondary:'+t.secondary+';--highlight:'+t.highlight+';--course-bg:'+t.background+';--surface:'+t.surface+';--ink:'+t.ink+';--muted-ink:'+t.muted+';--on-accent:'+onAccent(t.accent)+';';
}

function shuffled(items){return [...items].map(v=>[Math.random(),v]).sort((a,b)=>a[0]-b[0]).map(x=>x[1]);}
export function blockHTML(b,inheritedTheme=null){
 const rich=v=>'<div class="rich">'+safeHTML(v)+'</div>';
 const img=(u,a='',cl='lesson-image')=>safeURL(u,true)?'<img class="'+cl+'" src="'+esc(safeURL(u,true))+'" alt="'+esc(a)+'" loading="lazy">':'<div class="missing-media">Add an image in the content panel</div>';
 const heading=b.title&& !['heading','mcq','msq','fill','quiz','continue','divider','spacer','quote'].includes(b.type)?'<h2>'+esc(b.title)+'</h2>':'';
 const items=b.items||[];let content='';
 switch(b.type){
 case 'heading':content='<h2>'+esc(b.title)+'</h2>'+rich(b.body);break;
 case 'text':content=rich(b.body);break;
 case 'columns':content='<div class="block-columns">'+rich(b.left)+rich(b.right)+'</div>';break;
 case 'table':{const rows=String(b.rows||'').split('\n').map(r=>r.split('|'));content='<div style="overflow:auto"><table class="lesson-table"><thead><tr>'+rows[0].map(x=>'<th>'+esc(x.trim())+'</th>').join('')+'</tr></thead><tbody>'+rows.slice(1).map(r=>'<tr>'+r.map(x=>'<td>'+esc(x.trim())+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';break;}
 case 'statement':content='<div class="statement-block">'+safeHTML(b.body)+'</div>';break;
 case 'note':content='<div class="note-block">'+rich(b.body)+'</div>';break;
 case 'quote':content='<blockquote class="quote-block">'+safeHTML(b.body)+'<cite>'+esc(b.attribution)+'</cite></blockquote>';break;
 case 'list':{const t=b.variant==='numbered'?'ol':'ul';content='<'+t+' class="lesson-list '+(b.variant==='checklist'?'lesson-checklist':'')+'">'+items.map(i=>'<li>'+(b.variant==='checklist'?'<label><input type="checkbox">':'')+esc(i.title)+(i.text?rich(i.text):'')+(b.variant==='checklist'?'</label>':'')+'</li>').join('')+'</'+t+'>';break;}
 case 'image':content=img(b.image,b.alt)+(b.caption?'<p class="image-caption">'+esc(b.caption)+'</p>':'');break;
 case 'imageText':content='<div class="block-columns"><div>'+img(b.image,b.alt)+(b.caption?'<p class="image-caption">'+esc(b.caption)+'</p>':'')+'</div>'+rich(b.body)+'</div>';break;
 case 'gallery':content=b.variant==='carousel'?'<div class="gallery-carousel" data-gallery></div>':'<div class="gallery-grid">'+items.map(i=>'<figure>'+img(i.image,i.alt)+'<figcaption class="image-caption">'+esc(i.caption)+'</figcaption></figure>').join('')+'</div>';break;
 case 'video':{const src=videoSource(b.url);content=src.embed?'<iframe class="media-frame" src="'+esc(src.embed)+'" title="'+esc(b.title||'Video')+'" allow="fullscreen; picture-in-picture" allowfullscreen></iframe>':src.file?'<video class="lesson-video" controls preload="metadata" src="'+esc(src.file)+'"></video>':'<div class="missing-media">Upload a video or add a video link</div>';content+='<p class="image-caption">'+esc(b.caption)+'</p>';break;}
 case 'audio':content=safeURL(b.url,true)?'<audio class="lesson-audio" controls preload="metadata" src="'+esc(safeURL(b.url,true))+'"></audio>':'<div class="missing-media">Upload audio or record your narration</div>';content+='<p class="image-caption">'+esc(b.caption)+'</p>';break;
 case 'attachment':content='<a class="attachment-link" href="'+esc(safeURL(b.url,true))+'" download="'+esc(b.fileName||'resource')+'" target="_blank" rel="noopener"><span>↓</span><div><strong>'+esc(b.fileName||b.title||'Download resource')+'</strong><div>'+esc(b.caption)+'</div></div></a>';break;
 case 'embed':content=safeURL(b.url)?'<iframe class="embed-frame" style="height:'+Math.max(160,Math.min(1400,Number(b.height)||420))+'px" src="'+esc(safeURL(b.url))+'" title="'+esc(b.title||'Embedded tool')+'" sandbox="allow-scripts allow-forms allow-same-origin allow-popups allow-downloads" loading="lazy"></iframe><p class="image-caption">'+esc(b.caption)+' <a href="'+esc(safeURL(b.url))+'" target="_blank" rel="noopener">Open separately ↗</a></p>':'<div class="missing-media">Add the website or tool link</div>';break;
 case 'code':content='<pre class="lesson-code"><code>'+esc(b.code)+'</code></pre>';break;
 case 'custom':{const code='<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+String(b.css||'').replace(/<\/style/gi,'')+'</style>'+String(b.html||'')+'<script>'+String(b.js||'').replace(/<\/script/gi,'')+'</script>';content='<iframe class="embed-frame" style="height:'+Math.max(120,Math.min(2000,Number(b.height)||320))+'px" sandbox="allow-scripts allow-forms allow-popups allow-downloads" title="'+esc(b.title||'Custom interaction')+'" srcdoc="'+esc(code)+'"></iframe>';break;}
 case 'accordion':content=items.map((i,n)=>'<details class="interactive-details" data-item="'+n+'"><summary>'+esc(i.title)+'</summary><div>'+(i.image?img(i.image,i.title):'')+rich(i.text)+'</div></details>').join('');break;
 case 'tabs':content='<div class="interaction-tabs" role="tablist">'+items.map((i,n)=>'<button type="button" role="tab" data-tab="'+n+'" aria-selected="'+(n===0)+'" class="'+(n===0?'active':'')+'">'+esc(i.title)+'</button>').join('')+'</div><div class="tab-content" role="tabpanel"></div>';break;
 case 'flashcards':content='<div class="flashcard-grid">'+items.map((i,n)=>'<button class="flashcard" data-card="'+n+'" aria-pressed="false" aria-label="Flip card: '+esc(i.front)+'"><div class="flashcard-face">'+(i.image?img(i.image,i.front):'')+'<div>'+safeHTML(i.front)+'</div><small>Click to flip ↻</small></div></button>').join('')+'</div>';break;
 case 'process':content='<div class="process-card" data-process></div>';break;
 case 'timeline':content='<div class="timeline-items">'+items.map(i=>'<div class="timeline-event"><h3>'+esc(i.title)+'</h3>'+(i.image?img(i.image,i.title):'')+rich(i.text)+'</div>').join('')+'</div>';break;
 case 'labeled':content='<div class="labeled-image">'+img(b.image,b.alt)+(b.markers||[]).map((m,n)=>'<button class="marker-button" data-marker="'+n+'" style="left:'+Math.min(100,Math.max(0,Number(m.x)))+'%;top:'+Math.min(100,Math.max(0,Number(m.y)))+'%" aria-label="'+esc(m.title)+'">'+(n+1)+'</button>').join('')+'</div><div class="marker-content" hidden></div>';break;
 case 'scenario':content='<div class="scenario-wrap" data-scenario></div>';break;
 case 'sorting':content='<p class="sorting-hint">Drag each card into a category, or select a card and then select a category. Click a sorted card to return it.</p><div class="sort-pool"></div><div class="sort-categories"></div><div class="sort-feedback" aria-live="polite"></div><div class="question-actions"><button class="primary" data-check-sort>Check sorting</button><button data-reset-sort>Start again</button></div>';break;
 case 'buttons':content='<div class="button-row">'+items.map(i=>'<a class="learner-button" href="'+esc(safeURL(i.url))+'" target="_blank" rel="noopener">'+esc(i.title)+' ↗</a>').join('')+'</div>';break;
 case 'mcq':case 'msq':case 'fill':case 'matching':content='<div class="question-block" data-question></div>';break;
 case 'quiz':content='<div data-quiz></div>';break;
 case 'reflection':content=rich(b.body)+'<label class="field"><span>Your response</span><textarea class="reflection-input" aria-label="'+esc(b.title||'Reflection')+'" placeholder="Write your response here…"></textarea></label><button class="primary" data-save-reflection>Save reflection</button><p class="local-note">Your response is saved in this browser. Use Download notes to keep a copy.</p>';break;
 case 'survey':content=rich(b.body)+'<div class="rating-options">'+Array.from({length:Math.min(10,Math.max(2,Number(b.scale)||5))},(_,n)=>'<button data-rating="'+(n+1)+'" aria-pressed="false">'+(n+1)+'</button>').join('')+'</div><div class="rating-labels"><span>'+esc(b.minLabel)+'</span><span>'+esc(b.maxLabel)+'</span></div><p class="local-note">This personal rating is saved in this browser and included in your notes.</p>';break;
 case 'chart':content='<div data-chart></div>';break;
 case 'divider':content=b.variant==='number'?'<div class="number-divider">'+esc(b.title)+'</div>':'<div class="divider-line"></div>';break;
 case 'spacer':content='<div style="height:'+Math.min(300,Math.max(10,Number(b.height)||60))+'px"></div>';break;
 case 'continue':content='<div class="continue-wrap"><button data-continue>'+esc(b.title||'Continue')+'</button><small class="gate-message"></small></div>';break;
 default:content=rich(b.body);
 }
 const bt=resolveTheme(inheritedTheme||{},b.design?.theme);
 return '<section class="lesson-block '+esc(b.design?.width||'standard')+'" data-block="'+esc(b.id)+'" style="'+themeVars(bt)+'--block-bg:'+(b.design?.useThemeSurface===true?bt.surface:color(b.design?.background,bt.surface))+';--block-pad:'+Math.min(100,Math.max(0,Number(b.design?.padding)||0))+'px;--block-align:'+(['left','center','right'].includes(b.design?.align)?b.design.align:'left')+'"><div class="block-inner">'+heading+content+'</div></section>';
}
export function mountCourse(root,course,options={}){
 const c=course;const preview=!!options.preview;const storageKey='ml-learner-'+c.id+'-'+(c.updatedAt||'1')+'-'+(options.storageSuffix||'');
 let state={lesson:0,done:[],completed:[],notes:{},ratings:{},gates:[],scores:{},quizAttempts:{}};
 if(!preview&&c.settings?.resume!==false)try{const cached=JSON.parse(localStorage.getItem(storageKey));if(cached&&Array.isArray(cached.done))state={...state,...cached};}catch{}
 if(options.initialState)state={...state,...options.initialState};
 state.lesson=Math.min(Math.max(0,Number(state.lesson)||0),c.lessons.length-1);
 let dead=false;let scrollHandler;let destroy=()=>{dead=true;if(scrollHandler)window.removeEventListener('scroll',scrollHandler);};
 const allRequired=()=>c.lessons.flatMap(l=>l.blocks.filter(b=>b.required));
 function save(){if(dead)return;if(!preview)try{localStorage.setItem(storageKey,JSON.stringify(state));}catch{}options.onProgress?.(state);update();}
 function mark(id){if(!state.done.includes(id)){state.done.push(id);save();}}
 function feedback(el,text,ok){el.innerHTML='<div class="feedback '+(ok?'':'incorrect')+'">'+safeHTML(text)+'</div>';}
 function update(){
  const l=c.lessons[state.lesson];if(!l)return;
  let hidden=false;
  for(const b of l.blocks){const el=root.querySelector('[data-block="'+b.id+'"]');if(!el)continue;el.classList.toggle('gated-hidden',hidden);
   if(b.type==='continue'){const prior=l.blocks.slice(0,l.blocks.indexOf(b)).filter(x=>x.required);const remaining=b.gate?prior.filter(x=>!state.done.includes(x.id)):[];
    const btn=el.querySelector('[data-continue]');btn.disabled=remaining.length>0;el.querySelector('.gate-message').textContent=remaining.length?'Complete '+remaining.length+' required interaction'+(remaining.length===1?'':'s')+' above to continue.':state.gates.includes(b.id)?'Section unlocked.':'Ready when you are.';
    if(!state.gates.includes(b.id))hidden=true;
   }
  }
  const remaining=l.blocks.filter(b=>b.required&&!state.done.includes(b.id));const closed=l.blocks.filter(b=>b.type==='continue'&&!state.gates.includes(b.id));
  const next=root.querySelector('.next-lesson');if(next)next.disabled=remaining.length>0||closed.length>0;
  const info=root.querySelector('.lesson-status');if(info)info.textContent=remaining.length?'Complete '+remaining.length+' required interaction'+(remaining.length===1?'':'s')+'.':closed.length?'Use Continue to unlock the rest of this lesson.':'Ready to complete this lesson.';
  const progress=Math.round(state.completed.length/c.lessons.length*100);const fill=root.querySelector('.progress-fill');if(fill)fill.style.width=progress+'%';
  const sum=root.querySelector('.course-summary');if(sum)sum.textContent=state.completed.length+' of '+c.lessons.length+' lessons complete';
  root.querySelectorAll('[data-lesson]').forEach(btn=>{const n=Number(btn.dataset.lesson);btn.querySelector('.check').textContent=state.completed.includes(c.lessons[n].id)?'✓':'';});
 }
 function bindQuestion(host,q,onAnswer,mode='practice'){
  let form='';const options=q.options||[];
  if(q.type==='mcq'||q.type==='msq'){form='<div class="question-options">'+options.map((o,n)=>'<label class="question-option"><input type="'+(q.type==='mcq'?'radio':'checkbox')+'" name="answer-'+esc(q.id)+'" value="'+n+'"><span>'+esc(o.text)+'</span></label>').join('')+'</div>';}
  if(q.type==='fill')form='<label class="field"><span>Your answer</span><input class="fill-answer" autocomplete="off"></label>';
  if(q.type==='matching'){const answers=shuffled((q.pairs||[]).map(p=>p.right));form=(q.pairs||[]).map((p,n)=>'<label class="matching-row"><span>'+esc(p.left)+'</span><select data-match="'+n+'"><option value="">Choose a match</option>'+answers.map(a=>'<option>'+esc(a)+'</option>').join('')+'</select></label>').join('');}
  host.innerHTML='<div class="question-label">'+(mode==='quiz'?'Quiz question':'Knowledge check')+'</div><h3>'+esc(q.title||'Match each item')+'</h3><div class="rich">'+safeHTML(q.body)+'</div>'+form+'<div class="question-feedback" aria-live="polite"></div><div class="question-actions"><button class="primary" data-answer>Submit answer</button><button data-retry hidden>Try again</button></div>';
  host.querySelector('[data-answer]').onclick=()=>{
   let correct=false;let valid=true;let detail='';
   if(q.type==='mcq'||q.type==='msq'){const selected=[...host.querySelectorAll('input:checked')].map(i=>Number(i.value));valid=selected.length>0;correct=options.every((o,n)=>!!o.correct===selected.includes(n));detail=selected.map(n=>options[n].feedback).filter(Boolean).join(' ');}
   if(q.type==='fill'){const value=host.querySelector('.fill-answer').value.trim();valid=!!value;correct=String(q.answers||'').split('|').map(x=>x.trim().toLowerCase().replace(/\s+/g,' ')).includes(value.toLowerCase().replace(/\s+/g,' '));}
   if(q.type==='matching'){const sels=[...host.querySelectorAll('select')];valid=sels.every(s=>s.value);correct=sels.every((s,n)=>s.value===q.pairs[n].right);}
   if(!valid){feedback(host.querySelector('.question-feedback'),'Enter or choose an answer first.',false);return;}
   feedback(host.querySelector('.question-feedback'),(correct?q.feedbackCorrect||'Correct.':q.feedbackIncorrect||'Review your answer and try again.')+(detail?' '+detail:''),correct);
   host.querySelectorAll('input,select').forEach(i=>i.disabled=true);host.querySelector('[data-answer]').hidden=true;host.querySelector('[data-retry]').hidden=mode==='quiz'||correct;
   onAnswer(correct);
  };
  host.querySelector('[data-retry]').onclick=()=>bindQuestion(host,q,onAnswer,mode);
 }
 function bindBlock(el,b){
  const allSeen=(seen,total)=>{if(seen.size>=total)mark(b.id);};
  if(b.type==='accordion'){const seen=new Set();el.querySelectorAll('details').forEach((d,n)=>d.ontoggle=()=>{if(d.open){seen.add(n);allSeen(seen,b.items.length);}});}
  if(b.type==='tabs'){const seen=new Set([0]);const show=n=>{const i=b.items[n];el.querySelector('.tab-content').innerHTML=(i.image?'<img class="lesson-image" src="'+esc(safeURL(i.image,true))+'" alt="'+esc(i.title)+'">':'')+'<h3>'+esc(i.title)+'</h3><div class="rich">'+safeHTML(i.text)+'</div>';el.querySelectorAll('[data-tab]').forEach(x=>{x.classList.toggle('active',Number(x.dataset.tab)===n);x.setAttribute('aria-selected',Number(x.dataset.tab)===n);});seen.add(n);allSeen(seen,b.items.length);};el.querySelectorAll('[data-tab]').forEach(x=>x.onclick=()=>show(Number(x.dataset.tab)));if(b.items.length)show(0);}
  if(b.type==='flashcards'){const seen=new Set();el.querySelectorAll('[data-card]').forEach(btn=>btn.onclick=()=>{const n=Number(btn.dataset.card),i=b.items[n],flipped=btn.classList.toggle('flipped');btn.setAttribute('aria-pressed',String(flipped));btn.querySelector('.flashcard-face').innerHTML=(!flipped&&i.image?'<img src="'+esc(safeURL(i.image,true))+'" alt="">':'')+'<div>'+safeHTML(flipped?i.back:i.front)+'</div><small>'+(flipped?'Click for front ↻':'Click to flip ↻')+'</small>';seen.add(n);allSeen(seen,b.items.length);});}
  if(b.type==='process'){let index=0;const seen=new Set();const host=el.querySelector('[data-process]');const show=()=>{const i=b.items[index];if(!i){host.textContent='Add a process step.';return;}host.innerHTML='<div class="step-label">STEP '+(index+1)+' OF '+b.items.length+'</div><h3>'+esc(i.title)+'</h3>'+(i.image?'<img class="lesson-image" src="'+esc(safeURL(i.image,true))+'" alt="'+esc(i.title)+'">':'')+'<div class="rich">'+safeHTML(i.text)+'</div><div class="process-nav"><button data-prev '+(index===0?'disabled':'')+'>← Previous</button><span>'+(index+1)+' / '+b.items.length+'</span><button data-next '+(index===b.items.length-1?'disabled':'')+'>Next →</button></div>';host.querySelector('[data-prev]').onclick=()=>{index--;show();};host.querySelector('[data-next]').onclick=()=>{index++;show();};seen.add(index);allSeen(seen,b.items.length);};show();}
  if(b.type==='labeled'){const seen=new Set();el.querySelectorAll('[data-marker]').forEach(btn=>btn.onclick=()=>{const n=Number(btn.dataset.marker),m=b.markers[n],host=el.querySelector('.marker-content');host.hidden=false;host.innerHTML='<h3>'+esc(m.title)+'</h3><div class="rich">'+safeHTML(m.text)+'</div>';btn.classList.add('visited');seen.add(n);allSeen(seen,b.markers.length);});}
  if(b.type==='scenario'){const host=el.querySelector('[data-scenario]');let current=b.nodes[0]?.id;let moves=0;const show=()=>{const scene=b.nodes.find(n=>n.id===current);if(!scene){host.textContent='The scenario has no opening scene.';return;}host.innerHTML=(scene.image?'<img class="scenario-image" src="'+esc(safeURL(scene.image,true))+'" alt="'+esc(scene.title)+'">':'')+'<div class="scenario-content"><div class="step-label">'+esc(scene.title)+'</div><div class="scenario-text">'+safeHTML(scene.text)+'</div><div class="scenario-choices">'+(scene.choices||[]).map((ch,n)=>'<button class="scenario-choice" data-choice="'+n+'">'+esc(ch.label)+'</button>').join('')+'</div><div class="scene-feedback" aria-live="polite"></div><button data-restart class="small">Restart scenario</button></div>';
    host.querySelector('[data-restart]').onclick=()=>{current=b.nodes[0].id;moves=0;show();};
    if(!scene.choices?.length){mark(b.id);host.querySelector('.scene-feedback').innerHTML='<div class="feedback">Scenario complete.</div>';}
    host.querySelectorAll('[data-choice]').forEach(btn=>btn.onclick=()=>{const ch=scene.choices[Number(btn.dataset.choice)];host.querySelectorAll('[data-choice]').forEach(x=>x.disabled=true);const fb=host.querySelector('.scene-feedback');feedback(fb,ch.feedback||'Consider the consequences of your choice.',true);const next=document.createElement('button');next.className='primary';next.textContent=ch.next==='end'?'Finish scenario':'Continue →';fb.append(next);next.onclick=()=>{moves++;if(ch.next==='end'){mark(b.id);feedback(fb,'Scenario complete. You can restart to explore another path.',true);}else if(moves>100){feedback(fb,'This path loops. Restart to try a different choice.',false);}else{current=ch.next;show();}};});};show();}
  if(b.type==='sorting'){let selections={};let picked=null;const redraw=()=>{const card=(i,n)=>'<button class="sort-card '+(picked===n?'selected':'')+'" draggable="true" data-sort-item="'+n+'">'+esc(i.title)+'</button>';el.querySelector('.sort-pool').innerHTML=b.items.map((i,n)=>selections[n]===undefined?card(i,n):'').join('');el.querySelector('.sort-categories').innerHTML=b.categories.map((cat,n)=>'<div class="sort-target" tabindex="0" role="button" aria-label="Place selected card in '+esc(cat)+'" data-category="'+n+'"><h4>'+esc(cat)+'</h4>'+b.items.map((i,j)=>selections[j]===cat?card(i,j):'').join('')+'</div>').join('');
    el.querySelectorAll('[data-sort-item]').forEach(btn=>{btn.onclick=e=>{e.stopPropagation();const n=Number(btn.dataset.sortItem);if(selections[n]!==undefined){delete selections[n];picked=n;}else picked=n;redraw();};btn.ondragstart=e=>{picked=Number(btn.dataset.sortItem);e.dataTransfer.setData('text/plain',String(picked));};});
    el.querySelectorAll('[data-category]').forEach(target=>{const place=()=>{if(picked===null)return;selections[picked]=b.categories[Number(target.dataset.category)];picked=null;redraw();};target.onclick=place;target.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();place();}};target.ondragover=e=>e.preventDefault();target.ondrop=e=>{e.preventDefault();const n=Number(e.dataTransfer.getData('text/plain'));if(Number.isInteger(n)&&n>=0&&n<b.items.length)picked=n;place();};});};redraw();
   el.querySelector('[data-check-sort]').onclick=()=>{const count=b.items.filter((i,n)=>selections[n]===i.category).length;feedback(el.querySelector('.sort-feedback'),count===b.items.length?'All items are in the correct categories.':count+' of '+b.items.length+' items are correct. Move items and try again.',count===b.items.length);if(count===b.items.length)mark(b.id);};el.querySelector('[data-reset-sort]').onclick=()=>{selections={};picked=null;redraw();el.querySelector('.sort-feedback').innerHTML='';};}
  if(['mcq','msq','fill','matching'].includes(b.type))bindQuestion(el.querySelector('[data-question]'),b,ok=>{if(ok)mark(b.id);});
  if(b.type==='quiz'){const host=el.querySelector('[data-quiz]');const render=()=>{const max=Number(b.maxAttempts)||0;const attempts=state.quizAttempts[b.id]||0;const questions=b.randomize?shuffled(b.questions):b.questions;let answers={};
    const summary=()=>{const score=Math.round(Object.values(answers).filter(Boolean).length/questions.length*100);const pass=score>=(Number(b.passScore??80));state.scores[b.id]=b.scorePolicy==='last'?score:Math.max(state.scores[b.id]??0,score);state.quizAttempts[b.id]=attempts+1;const recordedPass=state.scores[b.id]>=Number(b.passScore??80);if(recordedPass||c.settings?.requirePass===false)mark(b.id);else state.done=state.done.filter(id=>id!==b.id);save();host.innerHTML='<div class="quiz-summary"><div class="step-label">'+(pass?'QUIZ PASSED':'KEEP LEARNING')+'</div><div class="quiz-score">'+score+'%</div><p>Recorded score: '+state.scores[b.id]+'% ('+(b.scorePolicy==='last'?'latest attempt':'best attempt')+'). Passing score: '+Number(b.passScore)+'%. Attempt '+(attempts+1)+(max?' of '+max:'')+'.</p>'+(max&&attempts+1>=max?'<p>No attempts remaining in this browser for this course version.</p>':'<button data-retake>Retake quiz</button>')+'</div>';host.querySelector('[data-retake]')?.addEventListener('click',render);};
    if(max&&attempts>=max){host.innerHTML='<div class="quiz-summary"><p>Attempts used: '+attempts+'. Last score: '+(state.scores[b.id]??0)+'%.</p></div>';return;}
    host.innerHTML='<p class="local-note">Passing score: '+(Number(b.passScore??80))+'%. '+(max?'Up to '+max+' attempts.':'Unlimited attempts.')+'</p>'+questions.map(q=>'<div class="question-block" data-quiz-q="'+esc(q.id)+'" style="margin-bottom:18px"></div>').join('')+'<button class="primary" data-grade disabled>View quiz result</button>';
    for(const q of questions)bindQuestion(host.querySelector('[data-quiz-q="'+q.id+'"]'),q,ok=>{answers[q.id]=ok;host.querySelector('[data-grade]').disabled=Object.keys(answers).length!==questions.length;},'quiz');host.querySelector('[data-grade]').onclick=summary;
   };render();}
  if(b.type==='reflection'){const input=el.querySelector('textarea');input.value=state.notes[b.id]?.text||'';el.querySelector('[data-save-reflection]').onclick=()=>{if(!input.value.trim())return;state.notes[b.id]={title:b.title,text:input.value};mark(b.id);save();el.querySelector('.local-note').textContent='Saved in this browser. Download notes to keep a copy.';};}
  if(b.type==='survey'){el.querySelectorAll('[data-rating]').forEach(btn=>{if(Number(btn.dataset.rating)===state.ratings[b.id]?.value)btn.classList.add('active');btn.onclick=()=>{state.ratings[b.id]={title:b.title,value:Number(btn.dataset.rating),scale:b.scale};el.querySelectorAll('[data-rating]').forEach(x=>{x.classList.toggle('active',x===btn);x.setAttribute('aria-pressed',String(x===btn));});mark(b.id);save();};});}
  if(b.type==='continue')el.querySelector('[data-continue]').onclick=()=>{if(!state.gates.includes(b.id))state.gates.push(b.id);save();const blocks=[...root.querySelectorAll('[data-block]')];blocks[blocks.indexOf(el)+1]?.scrollIntoView({behavior:'smooth',block:'start'});};
  if(b.type==='gallery'&&b.variant==='carousel'){let n=0;const seen=new Set();const host=el.querySelector('[data-gallery]');const show=()=>{const i=b.items[n];if(!i)return;host.innerHTML='<img src="'+esc(safeURL(i.image,true))+'" alt="'+esc(i.alt)+'"><p class="image-caption">'+esc(i.caption)+'</p><div class="gallery-controls"><button data-prev '+(!n?'disabled':'')+'>←</button><span>'+(n+1)+' / '+b.items.length+'</span><button data-next '+(n===b.items.length-1?'disabled':'')+'>→</button></div>';host.querySelector('[data-prev]').onclick=()=>{n--;show();};host.querySelector('[data-next]').onclick=()=>{n++;show();};seen.add(n);allSeen(seen,b.items.length);};show();}
  if(b.type==='chart'){const host=el.querySelector('[data-chart]'),items=b.items||[],max=Math.max(1,...items.map(x=>Math.max(0,Number(x.value)||0)));const colors=['#176599','#c59a43','#58a097','#7b89aa','#b67b76','#7f9f65','#8daec4'];
   if(b.variant==='bar')host.innerHTML='<div class="chart-bars">'+items.map(i=>'<div class="chart-row"><span>'+esc(i.title)+'</span><div class="chart-bar"><div class="chart-value" style="width:'+Math.max(0,Number(i.value)||0)/max*100+'%" title="'+esc(i.title)+': '+esc(i.value)+'"></div></div><span>'+esc(i.value)+'</span></div>').join('')+'</div>';
   else if(b.variant==='line'){const points=items.map((i,n)=>(40+n*520/Math.max(1,items.length-1))+','+(260-Math.max(0,Number(i.value)||0)/max*220)).join(' ');host.innerHTML='<svg class="chart-svg" viewBox="0 0 600 320" role="img" aria-label="'+esc(b.title)+'"><line x1="40" y1="260" x2="560" y2="260" stroke="#d9e5ee"/><polyline fill="none" stroke="'+color(c.theme?.accent)+'" stroke-width="3" points="'+points+'"/>'+items.map((i,n)=>{const x=40+n*520/Math.max(1,items.length-1),y=260-Math.max(0,Number(i.value)||0)/max*220;return '<circle cx="'+x+'" cy="'+y+'" r="5" fill="'+color(c.theme?.accent)+'"><title>'+esc(i.title)+': '+esc(i.value)+'</title></circle><text x="'+x+'" y="290" text-anchor="middle" font-size="10" fill="#647e91">'+esc(i.title)+'</text><text x="'+x+'" y="'+(y-12)+'" text-anchor="middle" font-size="11">'+esc(i.value)+'</text>';}).join('')+'</svg>';}
   else{let a=-Math.PI/2;const total=items.reduce((s,i)=>s+Math.max(0,Number(i.value)||0),0)||1;const slices=items.map((i,n)=>{const fraction=Math.max(0,Number(i.value)||0)/total;if(!fraction)return '';const end=a+fraction*Math.PI*2,x1=150+120*Math.cos(a),y1=150+120*Math.sin(a),x2=150+120*Math.cos(end),y2=150+120*Math.sin(end);a=end;if(fraction>=.99999)return '<circle cx="150" cy="150" r="120" fill="'+colors[n%colors.length]+'"><title>'+esc(i.title)+': '+esc(i.value)+'</title></circle>';return '<path d="M150,150 L'+x1+','+y1+' A120,120 0 '+(fraction>.5?1:0)+' 1 '+x2+','+y2+' Z" fill="'+colors[n%colors.length]+'"><title>'+esc(i.title)+': '+esc(i.value)+'</title></path>';});host.innerHTML='<svg class="chart-svg" viewBox="0 0 300 300" role="img" aria-label="'+esc(b.title)+'">'+slices.join('')+'</svg>';}
   host.innerHTML+='<div class="chart-legend">'+items.map((i,n)=>'<span><i style="background:'+colors[n%colors.length]+'"></i>'+esc(i.title)+': '+esc(i.value)+'</span>').join('')+'</div>';}
  if(['audio','video'].includes(b.type)){el.querySelector('audio,video')?.addEventListener('ended',()=>mark(b.id));}
  if(b.required&&((b.type==='video'&&!el.querySelector('video'))||['text','heading','image','imageText','columns','table','statement','note','quote','list','gallery','timeline','chart','attachment','buttons','embed','code','custom'].includes(b.type))){
   const btn=document.createElement('button');btn.textContent='Mark reviewed';btn.className='small';btn.style.marginTop='20px';btn.onclick=()=>{mark(b.id);btn.textContent='Reviewed ✓';};el.querySelector('.block-inner').append(btn);
  }
 }
 function notes(){let text=c.title+'\n'+(c.author||'')+'\n\n';for(const n of Object.values(state.notes))text+=n.title+'\n'+n.text+'\n\n';for(const n of Object.values(state.ratings))text+=n.title+'\nRating: '+n.value+' / '+n.scale+'\n\n';const url=URL.createObjectURL(new Blob([text],{type:'text/plain'}));const a=document.createElement('a');a.href=url;a.download='Leadership_course_notes.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 function draw(){
  const l=c.lessons[state.lesson],activeTheme=resolveTheme(c.theme,l.theme);root.innerHTML='<div class="course-player '+(activeTheme.font==='serif'?'serif':'')+'" style="'+themeVars(activeTheme)+'"><header class="player-header"><button data-menu aria-label="Toggle lesson navigation">☰</button><span class="player-title">'+esc(c.title)+'</span><button data-notes>Download notes ↓</button><button data-print>Print</button></header>'+(c.settings?.showProgress===false?'':'<div class="progress-track"><div class="progress-fill"></div></div>')+'<div class="player-layout"><nav class="player-nav" aria-label="Course lessons"><h3>Course outline</h3>'+c.lessons.map((lesson,n)=>'<button data-lesson="'+n+'" class="'+(n===state.lesson?'current':'')+'" '+(c.settings?.navigation==='restricted'&&n>0&&!state.completed.includes(c.lessons[n-1].id)?'disabled':'')+'><span>'+String(n+1).padStart(2,'0')+'</span><span>'+esc(lesson.title)+'</span><span class="check"></span></button>').join('')+'<p class="course-summary"></p></nav><div class="player-main">'+(state.lesson===0?'<section class="course-hero '+(!c.cover?'no-cover':'')+'"><div><span class="eyebrow">MAYNE LEADERSHIP · LEARNING</span><h1>'+esc(c.title)+'</h1><p>'+esc(c.description)+'</p><span class="author">'+esc(c.author)+'</span></div>'+(c.cover?'<img src="'+esc(safeURL(c.cover,true))+'" alt="Course cover">':'')+'</section>':'')+'<div class="learner-lesson-header"><span class="eyebrow">LESSON '+(state.lesson+1)+' OF '+c.lessons.length+'</span><h2>'+esc(l.title)+'</h2><p>'+esc(l.description)+'</p></div><div class="lesson-blocks">'+l.blocks.map(b=>blockHTML(b,activeTheme)).join('')+'</div><footer class="lesson-footer"><button data-previous '+(!state.lesson?'disabled':'')+'>← Previous lesson</button><small class="lesson-status"></small><button class="primary next-lesson">'+(state.lesson===c.lessons.length-1?'Complete course ✓':'Complete & next lesson →')+'</button></footer><div data-completion></div></div></div></div>';
  root.querySelector('[data-menu]').onclick=()=>{root.querySelector('.player-nav').classList.toggle('show');if(window.innerWidth>960)root.querySelector('.course-player').classList.toggle('player-nav-hidden');};
  root.querySelector('[data-notes]').onclick=notes;root.querySelector('[data-print]').onclick=()=>window.print();
  root.querySelectorAll('[data-lesson]').forEach(btn=>btn.onclick=()=>go(Number(btn.dataset.lesson)));
  root.querySelector('[data-previous]').onclick=()=>go(state.lesson-1);
  root.querySelector('.next-lesson').onclick=()=>{if(!state.completed.includes(l.id))state.completed.push(l.id);save();
   if(state.lesson<c.lessons.length-1){go(state.lesson+1);return;}
   const complete=state.completed.length===c.lessons.length;
   const scores=Object.values(state.scores);const score=scores.length?Math.round(scores.reduce((s,n)=>s+n,0)/scores.length):null;
   root.querySelector('[data-completion]').innerHTML='<section class="course-complete"><span class="eyebrow">'+(complete?'COURSE COMPLETE':'LESSON COMPLETE')+'</span><h2>'+(complete?'Keep putting it into practice.':'Continue your learning.')+'</h2><p>'+(complete?'You have completed every lesson. Download your reflections and choose one action to use at work.':'Complete the remaining lessons in the outline to finish this course.')+'</p>'+(score!==null?'<p>Average quiz score: '+score+'%</p>':'')+'<button data-download>Download notes ↓</button></section>';root.querySelector('[data-download]').onclick=notes;if(complete)options.onComplete?.({score,state});root.querySelector('[data-completion]').scrollIntoView({behavior:'smooth'});
  };
  for(const b of l.blocks)bindBlock(root.querySelector('[data-block="'+b.id+'"]'),b);
  update();
 }
 function go(n){state.lesson=Math.max(0,Math.min(c.lessons.length-1,n));draw();save();root.scrollIntoView({behavior:'smooth',block:'start'});}
 draw();return {destroy,getState:()=>state,go};
}
