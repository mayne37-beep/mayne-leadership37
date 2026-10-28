// Video Studio UI shell: homepage, quick starts, recents and focused editor panels.
// Reuses the existing, browser-local project and video-rendering engine.
const $=id=>document.getElementById(id);
function createEditorTabs(){
 const inspector=document.querySelector('.inspector');
 const names=['scene','media','characters','voice','extras'];
 const labels={scene:'Edit',characters:'Assets',voice:'Voice',media:'Video',extras:'More'};
 const starts=[
  inspector.querySelector('label[for="project-name"]'),
  $('scene-video').closest('details'),
  $('asset-gallery').closest('details'),
  $('free-voice').closest('details'),
  $('ai-avatar').closest('details')
 ];
 const nodes=[...inspector.children],positions=starts.map(x=>nodes.indexOf(x));
 if(positions.some((x,i)=>x<0||(i>0&&x<=positions[i-1])))throw Error('Editor panels could not be organized.');
 const panels={};
 names.forEach(n=>{panels[n]=document.createElement('section');panels[n].className='inspector-section';panels[n].dataset.editorPanel=n;panels[n].setAttribute('aria-label',labels[n]+' tools');});
 nodes.slice(positions[0]).forEach((child,i)=>{
  const n=i+positions[0];
  let index=positions.length-1;
  while(index>0&&n<positions[index])index--;
  panels[names[index]].append(child);
 });
 const bar=document.createElement('div');bar.className='inspector-tabs';bar.setAttribute('role','tablist');bar.setAttribute('aria-label','Scene editing categories');
 const allLabel=document.createElement('label');allLabel.className='editor-all-tools';
 const checkbox=document.createElement('input');checkbox.id='editor-show-all';checkbox.type='checkbox';
 allLabel.append(checkbox,document.createTextNode(' Show all tools'));
 inspector.append(allLabel,bar,...names.map(n=>panels[n]));
 function activate(name){
  if(!panels[name])name='scene';
  checkbox.checked=false;
  names.forEach(n=>{panels[n].hidden=n!==name;});
  [...bar.children].forEach(b=>{
   const active=b.dataset.toolTab===name;
   b.classList.toggle('active',active);b.setAttribute('aria-selected',String(active));
  });
  inspector.scrollTop=0;
 }
 for(const name of ['scene','characters','voice','media','extras']){
  const button=document.createElement('button');
  button.type='button';button.className='inspector-tab';button.dataset.toolTab=name;
  button.setAttribute('role','tab');button.textContent=labels[name];
  button.addEventListener('click',()=>activate(name));bar.append(button);
 }
 checkbox.addEventListener('change',()=>{
  if(checkbox.checked)names.forEach(n=>panels[n].hidden=false);
  else activate(bar.querySelector('.active')?.dataset.toolTab||'scene');
 });
 activate('scene');
 return {activate,showAll(value){checkbox.checked=value;checkbox.dispatchEvent(new Event('change'));}};
}
export function initStudioShell(api){
 const workspace=$('workspace'),home=$('studio-home');
 const tabs=createEditorTabs();
 const toolbar=document.createElement('div');
 toolbar.className='studio-editor-toolbar';
 toolbar.innerHTML='<div class="editor-location"><button id="editor-back-home" type="button">← Home</button><span>/</span><strong id="editor-current-title">Untitled video</strong><small>● Saved in this browser</small></div><div class="editor-actionbar"><button id="editor-preview" type="button" class="ghost">▶ Preview</button><button id="editor-export" type="button" class="primary gold">Export video</button></div>';
 workspace.prepend(toolbar);
 const topHome=document.createElement('button');topHome.type='button';topHome.id='top-home';topHome.textContent='Home';topHome.className='ghost';
 document.querySelector('.topbar nav')?.prepend(topHome);
 let mode='video',view='home';
 const search=$('home-search'),recent=$('home-recent-list');
 function recentCards(){
  recent.replaceChildren();
  const term=search.value.trim().toLowerCase();
  const list=api.projects().slice().sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt)));
  let count=0;
  for(const project of list){
   if(term&&!project.name.toLowerCase().includes(term))continue;
   count++;
   const b=document.createElement('button');b.type='button';b.className='home-recent-card';
   const imageBox=document.createElement('span');imageBox.className='recent-thumb';
   const image=document.createElement('img');image.src='/assets/video-studio/characters/priya-professional.png';image.alt='';image.loading='lazy';imageBox.append(image);
   const details=document.createElement('span');details.className='recent-body';
   const heading=document.createElement('strong');heading.textContent=project.name;
   const info=document.createElement('small');info.textContent=project.scenes.length+' scenes · '+api.clock(api.duration(project))+' · Saved locally';
   const action=document.createElement('span');action.className='recent-go';action.textContent='Open editor ↗';
   details.append(heading,info,action);b.append(imageBox,details);
   b.addEventListener('click',()=>{api.openProject(project.id);showEditor();});
   recent.append(b);
  }
  $('home-recent-count').textContent=count+' video'+(count===1?'':'s');
  if(!count){const empty=document.createElement('p');empty.className='recent-empty';empty.textContent=term?'No videos match your search.':'Your videos will appear here when you create one.';recent.append(empty);}
 }
 function showHome(){
  if(api.busy())return api.message('Finish your recording or export before leaving the editor.','error');
  view='home';workspace.hidden=true;home.hidden=false;
  document.body.classList.add('home-active');document.body.classList.remove('editor-active');
  const u=new URL(location.href);u.searchParams.delete('edit');u.searchParams.delete('all');
  history.replaceState(null,'',u);recentCards();window.scrollTo(0,0);
 }
 function showEditor(tool='scene'){
  view='editor';home.hidden=true;workspace.hidden=false;
  document.body.classList.remove('home-active');document.body.classList.add('editor-active');
  $('editor-current-title').textContent=api.current()?.name||'Untitled video';
  const u=new URL(location.href);u.searchParams.set('edit','1');history.replaceState(null,'',u);
  tabs.activate(tool);window.scrollTo(0,0);
 }
 function createTemplate(id){
  if(api.busy())return;
  try{api.createFromTemplate(id);showEditor();}
  catch(e){$('home-prompt-note').textContent=e.message;}
 }
 $('home-new-button').addEventListener('click',()=>createTemplate('blank'));
 home.querySelectorAll('[data-template]').forEach(b=>b.addEventListener('click',()=>createTemplate(b.dataset.template)));
 home.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>{
  mode=b.dataset.mode;
  home.querySelectorAll('[data-mode]').forEach(x=>{const on=x===b;x.classList.toggle('active',on);x.setAttribute('aria-pressed',String(on));});
 }));
 $('home-prompt-form').addEventListener('submit',e=>{
  e.preventDefault();
  const content=$('home-script').value.trim();
  try{
   api.createFromText(content,mode);$('home-script').value='';
   $('home-prompt-note').textContent='Storyboard created. You can now edit, add presenters, and export.';
   showEditor();
  }catch(error){$('home-prompt-note').textContent=error.message;$('home-script').focus();}
 });
 $('editor-back-home').addEventListener('click',showHome);
 topHome.addEventListener('click',showHome);
 $('editor-preview').addEventListener('click',()=>$('play-preview').click());
 $('editor-export').addEventListener('click',()=>$('render-video').click());
 const sceneShortcuts={
  'stage-choose-character':'characters',
  'stage-edit-script':'scene',
  'stage-add-narration':'voice',
  'stage-add-video':'media'
 };
 for(const [id,panel] of Object.entries(sceneShortcuts)){
  $(id).addEventListener('click',()=>{
   tabs.activate(panel);
   const focusId=panel==='scene'?'scene-script':panel==='voice'?'free-voice':panel==='media'?'scene-video':'asset-search';
   const focusNode=$(focusId);
   if(focusNode){
    focusNode.scrollIntoView({block:'nearest',behavior:'instant'});
    focusNode.focus({preventScroll:true});
   }
  });
 }
 search.addEventListener('input',recentCards);
 home.querySelectorAll('[data-home-target]').forEach(b=>b.addEventListener('click',()=>{
  const item=b.dataset.homeTarget;
  if(item==='characters'||item==='voice'){showEditor(item==='characters'?'characters':'voice');return;}
  if(item==='recent'||item==='templates')$('home-'+item+'-section').scrollIntoView({block:'start',behavior:'smooth'});
  else window.scrollTo({top:0,behavior:'smooth'});
 }));
 const query=new URL(location.href).searchParams;
 if(query.get('edit')==='1'){showEditor();if(query.get('all')==='1')tabs.showAll(true);}
 else showHome();
 return {showHome,showEditor,refresh(){
  if(view==='home')recentCards();
  else $('editor-current-title').textContent=api.current()?.name||'Untitled video';
 },tabs};
}
