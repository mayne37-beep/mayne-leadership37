import {VERSION,KEY,CAPS,DIMENSIONS,TACTICS,STAGES,EMOTIONS,round,text,escapeHTML as e,deepCopy,makeProject,starterLibrary,startSession,activeSession,nodeById,choose,rewindTurn,addObservation,removeNode,addNode,addChoice,updateChoice,deleteChoice,validateScenario,normalizeProject} from './leadership-conversation-model.js';
import {opt,sidebarHTML,selectedCardHTML,pulseHTML,practiceHTML,recentFeedbackHTML,momentsHTML,nodeEditorHTML,choiceEditorFieldsHTML,observeHTML,reviewHTML,reportHTML} from './leadership-conversation-render.js';
import {createLibrary} from './leadership-characters.js';
import {connectCharacterCreator} from './leadership-character-controller.js';
const $=q=>document.querySelector(q),$$=q=>[...document.querySelectorAll(q)];
const PROMPTS=['What might this person need to feel heard while still understanding expectations?','What question could uncover an important missing fact?','How could you be both empathetic and clear?','What assumption have you made about motives?','When is direct feedback more useful than another question?','What would a respectful accountability statement sound like?','What action would demonstrate an agreement actually worked?'];
const VIEWS={practice:['LEADERSHIP ROLEPLAY','Practice the moment.','Explore realistic responses and reflect on employee reactions.'],builder:['SCENARIO AUTHORING','Design the conversation.','Edit character, employee lines, response paths and their consequences.'],observe:['PEER & INSTRUCTOR FEEDBACK','Observe the behavior.','Record what the learner actually says and does.'],review:['AFTER-ACTION LEARNING','Learn from the conversation.','Examine choices, feedback, and your next leadership commitment.']};
const S={projects:[],id:'',view:'practice',builderNode:'',search:'',present:false,editor:null,undo:[],redo:[],prompt:0,characters:[]};let toastHandle;
const p=()=>S.projects.find(x=>x.id===S.id)||S.projects[0];
function toast(message){const el=$('#toast');el.textContent=message;el.classList.add('show');clearTimeout(toastHandle);toastHandle=setTimeout(()=>el.classList.remove('show'),3200)}
function load(){try{const raw=JSON.parse(localStorage.getItem(KEY)||'null');if(raw?.projects?.length){S.projects=raw.projects.slice(0,CAPS.projects).map(x=>normalizeProject(x));S.id=S.projects.find(x=>x.id===raw.activeId)?.id||S.projects[0].id;S.characters=createLibrary(S.projects,raw.characters||[]);return}}catch(err){console.warn('Could not load conversation projects',err)}S.projects=starterLibrary();S.id=S.projects[0].id;S.characters=createLibrary(S.projects)}
function persist(){p().updated=new Date().toISOString();try{localStorage.setItem(KEY,JSON.stringify({version:VERSION,activeId:S.id,projects:S.projects,characters:S.characters}));$('#save-status').textContent='✓ Saved on this device';$('#save-status').classList.remove('error');return true}catch(err){$('#save-status').textContent='⚠ Save failed · Export backup';$('#save-status').classList.add('error');toast('Local storage failed. Export a JSON backup.');return false}}
function mutate(fn){const current=p(),before=deepCopy(current);let result;try{result=fn(current)}catch(err){S.projects[S.projects.indexOf(current)]=before;toast(err.message);render();return false}if(JSON.stringify(before)!==JSON.stringify(p())){S.undo.push(before);if(S.undo.length>55)S.undo.shift();S.redo=[];persist()}render();return result===undefined?true:result}
function switchProject(id){if(!S.projects.some(x=>x.id===id))return;S.id=id;S.builderNode=p().firstNodeId;S.view='practice';S.present=false;S.undo=[];S.redo=[];persist();render();close('#projects-dialog')}
function createProject(project=makeProject()){if(S.projects.length>=CAPS.projects){toast('Scenario limit reached. Export or delete one first.');return false}S.projects.unshift(project);S.id=project.id;S.characters=createLibrary(S.projects,S.characters);S.builderNode=project.firstNodeId;S.view='builder';S.present=false;S.undo=[];S.redo=[];persist();render();close('#projects-dialog');toast('Editable scenario created.');return true}
function duplicate(src=p()){const next=normalizeProject(src,{regenerate:true});next.title+=' (copy)';next.sessions=[];next.activeSessionId='';return createProject(next)}
function deleteProject(id){const target=S.projects.find(x=>x.id===id);if(!target||!confirm('Delete "'+target.title+'" and its practice history?'))return;S.projects=S.projects.filter(x=>x.id!==id);if(!S.projects.length)S.projects=starterLibrary();if(S.id===id)S.id=S.projects[0].id;S.builderNode=p().firstNodeId;S.view='practice';S.undo=[];S.redo=[];persist();render();renderLibrary()}
function start(){const validity=validateScenario(p());if(validity.errors.length){toast(validity.errors[0]);S.view='builder';render();return}mutate(pr=>startSession(pr));S.view='practice';S.present=false;render()}
function openCharacterDrawer(){
 const d=$('#character-drawer');if(!d)return;
 if(d.open){closeCharacterDrawer(true);return;}
 characterController.resetEditor();
 characterController.render();
 d.showModal();
 const trigger=$('[data-view="characters"]');
 if(trigger){trigger.setAttribute('aria-expanded','true');trigger.classList.add('active');}
 const done=$('[data-character-done]');done?.focus();
}
function closeCharacterDrawer(restoreFocus=false){
 const drawer=$('#character-drawer');if(drawer?.open)drawer.close();
 const trigger=$('[data-view="characters"]');
 if(trigger){trigger.setAttribute('aria-expanded','false');trigger.classList.remove('active');if(restoreFocus)trigger.focus();}
 characterController.resetEditor();
}
function setView(view){
 if(view==='characters'){openCharacterDrawer();return;}
 if(!VIEWS[view])return;
 closeCharacterDrawer();
 S.view=view;if(view!=='practice')S.present=false;render();
}
function show(q){const d=$(q);if(d&&!d.open)d.showModal()}
function close(q){const d=$(q);if(d?.open)d.close()}
function render(){
 const pr=p(),session=activeSession(pr);
 $('#project-top-title').textContent=pr.title;$('#scenario-list').innerHTML=sidebarHTML(S.projects,S.id,S.search);
 $('#selected-card').innerHTML=selectedCardHTML(pr);$('#pulse-panel').innerHTML=pulseHTML(pr);$('#recent-feedback').innerHTML=recentFeedbackHTML(pr);
 $$('[data-view]').forEach(b=>{
  if(b.dataset.view==='characters'){
   const open=!!$('#character-drawer')?.open;
   b.classList.toggle('active',open);
   b.setAttribute('aria-expanded',String(open));
   b.removeAttribute('aria-current');
   return;
  }
  const on=b.dataset.view===S.view;b.classList.toggle('active',on);b.setAttribute('aria-current',on?'page':'false');
 });
 Object.keys(VIEWS).forEach(k=>$('#'+k+'-view').hidden=k!==S.view);
 const info=VIEWS[S.view];$('#view-eyebrow').textContent=info[0];$('#view-title').textContent=info[1];$('#view-summary').textContent=info[2];
 $('#view-actions').innerHTML=S.view==='practice'?'<button data-start-session="1">'+(session?'↻ Restart':'▶ Begin')+'</button>'+(session?'<button data-go="review">Review →</button>':''):S.view==='builder'?'<button data-go="practice" class="primary">Preview & practice →</button>':S.view==='observe'?'<button data-go="review">Open debrief →</button>':'<button data-go="practice">Return to practice →</button>';
 $('#practice-workspace').innerHTML=practiceHTML(pr);renderBuilder();if($('#character-drawer')?.open)characterController.render();
 $('#observation-content').innerHTML=observeHTML(pr);$('#review-content').innerHTML=reviewHTML(pr);
 document.body.classList.toggle('presentation-mode',S.present&&S.view==='practice');
 $('#present-btn').textContent=S.present?'▣ Exit presentation':'▣ Presentation';
}
function renderBuilder(){
 const pr=p();for(const [id,v] of [['edit-title',pr.title],['edit-category',pr.category],['edit-objective',pr.objective],['edit-context',pr.context],['edit-summary',pr.summary],['edit-minutes',pr.timeMinutes],['edit-avatar',pr.persona.avatar],['edit-persona',pr.persona.name],['edit-role',pr.persona.role],['edit-temperament',pr.persona.temperament]])$('#'+id).value=v;
 $('#builder-assigned-character').textContent=pr.persona.name+' · '+pr.persona.role;
 if(!pr.nodes.some(n=>n.id===S.builderNode))S.builderNode=pr.firstNodeId;
 $('#moment-list').innerHTML=momentsHTML(pr,S.builderNode);$('#builder-node-editor').innerHTML=nodeEditorHTML(pr,S.builderNode);
 const validity=validateScenario(pr);
 $('#builder-validation').innerHTML='<strong>'+(validity.errors.length?'⚠ Review required':'✓ Ready to practice')+'</strong><p>'+validity.nodes+' moments · '+validity.reachable.size+' reachable · '+validity.disconnected.length+' disconnected</p>'+
 (validity.errors.length?'<ul>'+validity.errors.map(x=>'<li>'+e(x)+'</li>').join('')+'</ul>':'')+
 (validity.disconnected.length?'<p>Unreachable: '+e(validity.disconnected.slice(0,4).join(', '))+'</p>':'');
}
function renderLibrary(){$('#projects-library').innerHTML=S.projects.map(item=>'<article class="library-entry"><div><strong>'+e(item.title)+'</strong><small>'+e(item.persona.name)+' · '+item.nodes.length+' moments · '+item.sessions.length+' runs</small></div><button data-open-scenario="'+e(item.id)+'">'+(S.id===item.id?'Current':'Open')+'</button><button data-duplicate-id="'+e(item.id)+'">Copy</button><button class="danger" data-delete-project="'+e(item.id)+'">×</button></article>').join('')}
function editChoice(nodeId,choiceId){const n=nodeById(p(),nodeId),c=n?.choices.find(x=>x.id===choiceId);if(!c)return;S.editor={nodeId,choiceId};$('#choice-fields').innerHTML=choiceEditorFieldsHTML(p(),n,c);show('#choice-dialog')}
function saveChoice(){if(!S.editor)return;const f=new FormData($('#choice-form')),get=(k,n)=>text(f.get(k)||'',n),{nodeId,choiceId}=S.editor;
 const payload={label:get('label',500),tactic:get('tactic',60),reply:get('reply',900),emotion:get('emotion',30),feedback:get('feedback',950),nextId:get('nextId',90),
 effects:Object.fromEntries(DIMENSIONS.map(d=>[d.key,round(f.get('effect_'+d.key),-25,25,0)]))};
 if(!payload.label.trim()){toast('Enter a scripted response.');return}
 const success=mutate(pr=>{if(!updateChoice(pr,nodeId,choiceId,payload))throw Error('Response not found.');});if(success){S.editor=null;close('#choice-dialog');toast('Response path saved.')}
}
function updateBuilder(el){
 if(el.dataset.nodeField){const id=el.dataset.nodeId,key=el.dataset.nodeField;mutate(pr=>{
  const n=nodeById(pr,id);if(!n)throw Error('Moment no longer exists.');
  if(['title','line','context'].includes(key))n[key]=text(el.value,{title:140,line:1100,context:950}[key]);
  if(key==='stage'&&STAGES.includes(el.value))n.stage=el.value;
  if(key==='emotion'&&EMOTIONS.includes(el.value))n.emotion=el.value;
 });return;}
 const mapping={'edit-title':['title',145],'edit-category':['category',80],'edit-objective':['objective',1100],'edit-context':['context',1300],'edit-summary':['summary',1000],'edit-minutes':['timeMinutes',3],'edit-avatar':['avatar',20],'edit-persona':['name',100],'edit-role':['role',120],'edit-temperament':['temperament',300]};
 const [key,len]=mapping[el.id]||[];if(!key)return;
 mutate(pr=>{if(key==='timeMinutes')pr.timeMinutes=round(el.value,5,60,12);else if(['avatar','name','role','temperament'].includes(key))pr.persona[key]=text(el.value,len);else pr[key]=text(el.value,len)});
}
function respond(id,typed='',classification=null){const session=activeSession(p());if(!session||session.complete){toast('Begin a conversation before responding.');return}const ok=mutate(pr=>choose(pr,id,{written:typed,classification}));if(ok&&activeSession(p())?.complete)toast('Conversation complete. Open After-Action Review.')}
function saveReflection(){const s=activeSession(p());if(!s){toast('No session yet.');return}const record={keep:text($('#reflection-keep').value,1200),change:text($('#reflection-change').value,1200),action:text($('#reflection-action').value,1200)};mutate(pr=>{activeSession(pr).reflection=record});toast('Reflection saved.')}
function saveObservation(form){const data=new FormData(form),item={observer:text(data.get('observer')||'Observer',100),notes:text(data.get('notes'),1600),strengths:text(data.get('strengths'),950),opportunities:text(data.get('opportunities'),950),rubric:Object.fromEntries(['listening','inquiry','accountability','adaptability'].map(k=>[k,round(data.get(k),1,5,3)]))};if(mutate(pr=>addObservation(pr,item)))toast('Observer feedback saved.')}
function stem(){return p().title.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,54)||'leadership-conversation'}
function download(data,name,type='text/plain;charset=utf-8'){const url=URL.createObjectURL(new Blob([data],{type})),link=document.createElement('a');link.href=url;link.download=name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1500)}
const csv=rows=>'\ufeff'+rows.map(row=>row.map(x=>'"'+String(x??'').replace(/"/g,'""')+'"').join(',')).join('\r\n');
function exportFile(kind){
 close('#export-dialog');const pr=p(),s=activeSession(pr),name=stem();
 if(kind==='project'){download(JSON.stringify({kind:'mayne-leadership-conversation',version:VERSION,project:pr},null,2),name+'.conversation.json','application/json');return}
 if(kind==='transcript'){download(csv([['Turn','Stage','Employee','Leader','Response approach','Reaction','Feedback',...DIMENSIONS.map(d=>d.label+' delta')],...(s?.turns||[]).map((t,i)=>[i+1,t.stage,t.employee,t.learner,t.classification,t.reply,t.feedback,...DIMENSIONS.map(d=>t.effects[d.key])])]),name+'-transcript.csv','text/csv;charset=utf-8');return}
 if(kind==='observations'){download(csv([['Observer','Date','Observed behaviors','Strengths','Opportunities','Listening','Inquiry','Accountability','Adaptability'],...(s?.observations||[]).map(o=>[o.observer,o.timestamp,o.notes,o.strengths,o.opportunities,o.rubric.listening,o.rubric.inquiry,o.rubric.accountability,o.rubric.adaptability])]),name+'-observations.csv','text/csv;charset=utf-8');return}
 if(kind==='report'){$('#print-report').innerHTML=reportHTML(pr);window.print();}
}
async function importFile(file){if(!file)return;if(file.size>CAPS.importBytes){toast('JSON backup exceeds 3 MB limit.');return}try{const json=JSON.parse(await file.text()),pr=normalizeProject(json.kind==='mayne-leadership-conversation'?json.project:json,{regenerate:true});if(confirm('Import "'+pr.title+'" as a new scenario?'))createProject(pr)}catch(err){toast('Import failed: '+err.message)}}
function handleClick(ev){
 const t=ev.target;
 if(t.closest('[data-character-done]')){closeCharacterDrawer(true);return;}
 const closer=t.closest('[data-close]');
 if(closer){if(closer.dataset.close==='character-drawer')closeCharacterDrawer(true);else close('#'+closer.dataset.close);return}
 const tab=t.closest('[data-view]'),go=t.closest('[data-go]');if(tab||go){setView(tab?.dataset.view||go.dataset.go);return}
 if(t.closest('[data-start-session]')){start();return}
 const opened=t.closest('[data-open-scenario]');if(opened){switchProject(opened.dataset.openScenario);return}
 const selected=t.closest('[data-select-moment]');if(selected){S.builderNode=selected.dataset.selectMoment;renderBuilder();return}
 const choice=t.closest('[data-choose]');if(choice){respond(choice.dataset.choose);return}
 if(t.closest('[data-undo-response]')){mutate(pr=>rewindTurn(pr));return}
 const addResponse=t.closest('[data-add-choice]');if(addResponse){const id=addResponse.dataset.addChoice;let result;
  const ok=mutate(pr=>result=addChoice(pr,id,{label:'New response',reply:'Tell me more.',feedback:'Explore what this response encourages.',nextId:'END'}));
  if(ok)editChoice(id,result.id);return}
 const edit=t.closest('[data-edit-choice]');if(edit){editChoice(edit.dataset.choiceNode,edit.dataset.editChoice);return}
 const rem=t.closest('[data-remove-choice]');if(rem){if(confirm('Remove this response?'))mutate(pr=>{if(!deleteChoice(pr,rem.dataset.choiceNode,rem.dataset.removeChoice))throw Error('Keep one response per moment.');});return}
 const first=t.closest('[data-set-start]');if(first){mutate(pr=>{pr.firstNodeId=first.dataset.setStart});return}
 const delMoment=t.closest('[data-delete-moment]');if(delMoment){if(confirm('Delete moment? Branches that point here will end the conversation.')){mutate(pr=>removeNode(pr,delMoment.dataset.deleteMoment));S.builderNode=p().firstNodeId;renderBuilder()}return}
 const copyBtn=t.closest('[data-duplicate-id]');if(copyBtn){const project=S.projects.find(x=>x.id===copyBtn.dataset.duplicateId);if(project)duplicate(project);return}
 const del=t.closest('[data-delete-project]');if(del){deleteProject(del.dataset.deleteProject);return}
 const out=t.closest('[data-export]');if(out){exportFile(out.dataset.export);return}
 if(t.closest('[data-open-export]'))show('#export-dialog');
}
function handleChange(ev){
 const t=ev.target;
 if(t.dataset.nodeField||t.id.startsWith('edit-')){updateBuilder(t);return}
 if(t.id==='review-session-select'){mutate(pr=>{pr.activeSessionId=t.value});return}
 if(t.dataset.observationRange){const out=t.nextElementSibling;if(out)out.textContent=t.value+' / 5';}
}
function bind(){
 $('#scenario-search').oninput=ev=>{S.search=ev.target.value;$('#scenario-list').innerHTML=sidebarHTML(S.projects,S.id,S.search)};
 $('#new-scenario').onclick=()=>createProject();$('#projects-btn').onclick=()=>{renderLibrary();show('#projects-dialog')};
 $('#projects-new').onclick=()=>createProject();$('#projects-import').onclick=()=>$('#import-input').click();
 $('#import-input').onchange=ev=>{importFile(ev.target.files?.[0]);ev.target.value=''};
 $('#export-btn').onclick=()=>show('#export-dialog');
 $('#present-btn').onclick=()=>{closeCharacterDrawer();S.present=!S.present;S.view='practice';render()};
 $('#coach-next').onclick=()=>$('#coach-prompt').textContent=PROMPTS[++S.prompt%PROMPTS.length];
 $('#builder-copy').onclick=()=>duplicate();
 $('#builder-add-moment').onclick=()=>{let item;const ok=mutate(pr=>{item=addNode(pr,{title:'New conversation moment',stage:'Explore',line:'What would you say next?',choices:[{label:'Explore this further',reply:'I will think about that.',feedback:'What was this response meant to accomplish?',nextId:'END'}]})});if(ok){S.builderNode=item.id;renderBuilder();}};
 $('#choice-form').onsubmit=ev=>{ev.preventDefault();saveChoice()};
 document.addEventListener('click',handleClick);document.addEventListener('change',handleChange);characterController.bind();
 $('#character-drawer').addEventListener('close',()=>{
  const trigger=$('[data-view="characters"]');
  if(trigger){trigger.setAttribute('aria-expanded','false');trigger.classList.remove('active');}
  characterController.resetEditor();
 });
 $('#studio-main').addEventListener('click',ev=>{
  if(ev.target.closest('#submit-typed')){
   const message=String($('#typed-reply')?.value||'').trim(),id=$('#typed-path')?.value||'';
   if(!message){toast('Write your response before sending.');return}
   if(!id){toast('Select the closest scripted approach.');return}
   const n=nodeById(p(),activeSession(p())?.currentNodeId),chosen=n?.choices.find(c=>c.id===id);
   if(!chosen){toast('Selected approach is no longer available.');return}
   respond(id,message,chosen.tactic);
  }else if(ev.target.closest('#save-reflection'))saveReflection();
 });
 $('#observation-content').addEventListener('submit',ev=>{if(ev.target.id==='observation-form'){ev.preventDefault();saveObservation(ev.target)}});
 $('#observation-content').addEventListener('input',ev=>{const t=ev.target;if(t.dataset.observationRange){const output=t.nextElementSibling;if(output)output.textContent=t.value+' / 5'}});
 document.addEventListener('keydown',ev=>{
  const typing=ev.target.closest?.('textarea,input,select,[contenteditable="true"]');
  if(!typing&&ev.key==='Escape'&&S.present){S.present=false;render()}
  if((ev.ctrlKey||ev.metaKey)&&ev.key.toLowerCase()==='s'){ev.preventDefault();persist();toast('Saved on this device.')}
 });
}
const characterController=connectCharacterCreator({state:S,getProject:p,persist,render,toast,download});
load();
const initialView=new URLSearchParams(window.location.search).get('view');
if(initialView&&VIEWS[initialView])S.view=initialView;
S.builderNode=p().firstNodeId;bind();persist();render();
if(initialView==='characters')openCharacterDrawer();
