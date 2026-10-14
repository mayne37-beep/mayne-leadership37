import {uid,clone,clamp,newProject,newSlide,newObject,demoProject,slidesOf,slideById,duplicateSlide,validateProject,EVENTS,ACTIONS} from './interactive-model.js';
import {mountPlayer,PLAYER_CSS} from './interactive-player.js';
import {exportHTML} from './interactive-export.js';
const $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const LOCAL='mayne-interactive-draft-v1',API='/api/interactive-studio';
let project,slideId,layerId,objectId=null,tab='object',editState='normal',version=0,remote=false,dirty=false,serial=0;
let undo=[],redo=[],saving=null,saveTimer=null,saveBlocked=false,cloudUnavailable=false,preview=null,scale=1,time=0,timing=false,timingFrame=null,lastTick;
const currentSlide=()=>slideById(project,slideId)||slidesOf(project)[0];
const currentLayer=()=>currentSlide().layers.find(l=>l.id===layerId)||currentSlide().layers[0];
const currentObject=()=>currentLayer().objects.find(o=>o.id===objectId);
function notify(message){$('toast').textContent=message;$('toast').style.display='block';clearTimeout(notify.timer);notify.timer=setTimeout(()=>$('toast').style.display='none',6500);}
function status(message,warn=false){$('save-status').textContent=message;$('save-status').style.color=warn?'#865817':'#537283';}
function checkpoint(){undo.push(clone(project));if(undo.length>60)undo.shift();redo=[];}
function localSave(){try{localStorage.setItem(LOCAL,JSON.stringify({data:project,version,remote,dirty,at:Date.now()}));}catch{status('Device backup is full · download your project',true);}}
function change(render=true){project.updatedAt=new Date().toISOString();dirty=true;serial++;localSave();clearTimeout(saveTimer);if(!saveBlocked&&!cloudUnavailable)saveTimer=setTimeout(()=>save().catch(e=>notify(e.message)),1400);status(saveBlocked?'Conflict · device draft kept':cloudUnavailable?'Saved on device · website storage awaiting connection':remote?'Saving…':'Device draft · preparing website save',saveBlocked||cloudUnavailable);if(render)draw();else{$('undo').disabled=!undo.length;$('redo').disabled=!redo.length;}}
function mutate(fn,render=true){checkpoint();fn();change(render);}
async function request(action,payload={}){const r=await fetch(API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,payload})});let data;try{data=await r.json();}catch{throw Error('Re-enter the website PIN, then reload. Your device draft is retained.');}if(!r.ok){const e=Error(data.error||'Unable to complete this action.');e.status=r.status;throw e;}return data;}
async function save(){
  clearTimeout(saveTimer);if(saveBlocked)throw Error('Resolve the version conflict before saving.');
  if(saving){await saving;if(dirty)return save();return;}if(!dirty&&remote)return;if(!remote)dirty=true;
  const issues=validateProject(project);if(issues.length){status('Project needs attention · device draft kept',true);throw Error(issues[0]);}
  const data=clone(project),atSerial=serial,wasRemote=remote,expected=version;status('Saving to website…');
  saving=(async()=>{try{const result=await request(wasRemote?'save':'create',{id:data.id,data,version:expected});if(project.id!==data.id)return;version=result.version;remote=true;cloudUnavailable=false;if(serial===atSerial)dirty=false;localSave();status(dirty?'Saving latest edits…':'Saved to website ✓');}
    catch(e){status(e.status===409?'Version conflict · device draft kept':'Saved on device · website save unavailable',true);cloudUnavailable=e.status!==409;localSave();if(e.status===409){saveBlocked=true;showConflict();}throw e;}})();
  try{await saving;}finally{saving=null;}if(dirty)return save();
}
function resetSelection(){slideId=project.startSlideId;layerId=currentSlide().layers[0].id;objectId=null;editState='normal';time=0;undo=[];redo=[];saveBlocked=false;}
function show(title,body){$('modal-title').textContent=title;$('modal-body').innerHTML=body;if(!$('modal').open)$('modal').showModal();}
function close(){$('modal').close();}
function download(text,name,mime='application/json'){const url=URL.createObjectURL(new Blob([text],{type:mime})),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
const filename=()=>project.title.replace(/[^a-z0-9_-]+/gi,'_').slice(0,80)||'course';
const backup=()=>download(JSON.stringify(project,null,2),filename()+'.mayne-course.json');
function showConflict(){show('A newer website version exists','<p>Your edits are kept on this device. Download your draft before choosing which version to continue.</p><div class="actions"><button data-action="backup">Download my draft</button><button data-action="load-latest">Load website version</button><button data-action="copy-project" class="primary">Save my draft as a new project</button></div>');}
function field(label,key,value,type='text',extra=''){return '<label class="field"><span>'+esc(label)+'</span><'+(type==='textarea'?'textarea':type==='select'?'select':'input')+' data-field="'+esc(key)+'" '+(type==='textarea'||type==='select'?'':'type="'+type+'" value="'+esc(value)+'" ')+' '+extra+'>'+(type==='textarea'?esc(value):type==='select'?value:'')+(type==='textarea'?'</textarea>':type==='select'?'</select>':'')+'</label>';}
const choices=(values,value)=>values.map(v=>{const id=typeof v==='string'?v:v.id,label=typeof v==='string'?v:v.name||v.title;return '<option value="'+esc(id)+'" '+(id===value?'selected':'')+'>'+esc(label)+'</option>';}).join('');
const btn=(label,action,extra='')=>'<button type="button" data-action="'+action+'" '+extra+'>'+label+'</button>';
function outline(){let n=0;$('outline').innerHTML=project.scenes.map(scene=>'<div class="scene"><div class="scene-title"><strong>'+esc(scene.title)+'</strong>'+btn('+','slide-add','data-scene="'+scene.id+'" aria-label="Add slide to '+esc(scene.title)+'"')+btn('✎','scene-rename','data-scene="'+scene.id+'" aria-label="Rename scene"')+'</div>'+scene.slides.map(s=>'<button class="slide-link '+(s.id===slideId?'active':'')+'" data-action="slide-select" data-slide="'+s.id+'">'+(++n)+'. '+esc(s.title)+'<small>'+s.layers.length+' layer'+(s.layers.length===1?'':'s')+' · '+s.duration+' seconds'+(project.startSlideId===s.id?' · Start':'')+'</small></button>').join('')+'</div>').join('');}
function size(){const well=$('canvas-well'),width=Math.min(project.width,Math.max(200,(well.clientWidth||860)-48));scale=width/project.width;$('canvas-viewport').style.width=width+'px';$('canvas-viewport').style.height=(project.height*scale)+'px';$('canvas').style.width=project.width+'px';$('canvas').style.height=project.height+'px';$('canvas').style.transform='scale('+scale+')';}
function canvas(){
  const s=currentSlide(),l=currentLayer(),root=$('canvas');root.replaceChildren();root.style.background=s.background;
  function add(o,ghost=false){
    if($('timing-visible').checked&&(time<o.start||time>o.start+o.duration))return;
    const state=o.id===objectId?editState:o.initialState,v={...o,...o.states[state]},e=document.createElement('div');e.className='author-object'+(o.id===objectId&&!ghost?' selected':'')+(o.locked?' locked':'');e.dataset.object=o.id;e.tabIndex=ghost?-1:0;e.setAttribute('role','group');e.setAttribute('aria-label',o.name);
    Object.assign(e.style,{left:v.x+'px',top:v.y+'px',width:v.w+'px',height:v.h+'px',transform:'rotate('+v.rotation+'deg)',background:v.fill,color:v.color,
      fontSize:v.fontSize+'px',fontWeight:v.bold?'700':'400',borderRadius:v.radius+'px',textAlign:v.align});
    if(ghost){e.style.opacity='.3';e.style.pointerEvents='none';}
    if(o.hidden||state==='hidden')e.style.opacity='.25';
    if(o.type==='image'){e.style.padding='0';const img=document.createElement('img');img.src=v.src;img.alt=o.alt;e.append(img);}
    else if(o.type!=='shape'){const text=document.createElement('div');text.className='obj-text';text.textContent=v.text;e.append(text);}
    if(o.id===objectId&&!o.locked&&!ghost)for(const corner of ['nw','ne','sw','se']){const h=document.createElement('span');h.className='resize-handle';h.dataset.corner=corner;h.setAttribute('aria-hidden','true');e.append(h);}
    root.append(e);
  }
  if(l.id!==s.layers[0].id)for(const o of s.layers[0].objects)add(o,true);
  for(const o of l.objects)add(o);size();
}
function timeline(){const s=currentSlide();$('time-slider').max=s.duration;$('time-slider').value=time;$('time-output').textContent=time.toFixed(1)+'s';$('timeline-play').textContent=timing?'Pause timing':'Play timing';$('timeline').innerHTML=currentLayer().objects.map(o=>'<div class="timeline-row">'+btn(esc(o.name),'object-select','data-object="'+o.id+'"')+'<div class="time-track"><div class="time-bar '+(o.id===objectId?'selected':'')+'" style="left:'+Math.min(100,o.start/s.duration*100)+'%;width:'+Math.min(100-o.start/s.duration*100,o.duration/s.duration*100)+'%"></div></div></div>').join('');}
function objectFields(o){
  const v={...o,...o.states[editState]};
  return '<h3>'+esc(o.name)+'</h3>'+field('Object name','name',o.name)+
    (o.type==='text'||o.type==='button'?field('Text · or double-click on the slide','text',v.text,'textarea'):'')+
    '<div class="field-grid">'+field('X','x',v.x,'number')+field('Y','y',v.y,'number')+field('Width','w',v.w,'number','min="12"')+field('Height','h',v.h,'number','min="12"')+field('Rotation','rotation',v.rotation,'number')+field('Corner radius','radius',v.radius,'number','min="0"')+'</div>'+
    '<div class="field-grid">'+field('Fill','fill',v.fill==='transparent'?'#ffffff':v.fill,'color')+field('Text color','color',v.color,'color')+'</div>'+
    (o.type==='text'||o.type==='button'?'<div class="field-grid">'+field('Font size','fontSize',v.fontSize,'number','min="8" max="180"')+field('Alignment','align',choices(['left','center','right'],v.align),'select')+'</div><label class="check"><input data-field="bold" type="checkbox" '+(v.bold?'checked':'')+'> Bold text</label>':'')+
    '<div class="field-grid">'+field('Starts at (seconds)','start',o.start,'number','min="0" step=".1"')+field('Visible for (seconds)','duration',o.duration,'number','min=".1" step=".1"')+'</div>'+
    field('Accessible description','alt',o.alt)+
    '<label class="check"><input data-field="decorative" type="checkbox" '+(o.decorative?'checked':'')+'> Decorative object</label>'+
    '<label class="check"><input data-field="locked" type="checkbox" '+(o.locked?'checked':'')+'> Lock position</label>'+
    '<label class="check"><input data-field="hidden" type="checkbox" '+(o.hidden?'checked':'')+'> Hide in learner output</label>'+
    '<div class="mini-actions">'+btn('Align left','align','data-align="left"')+btn('Center','align','data-align="center"')+btn('Align right','align','data-align="right"')+'</div>';
}
function inspector(){
  document.querySelectorAll('.inspector-tabs button').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));
  const o=currentObject(),s=currentSlide(),l=currentLayer();
  if(tab==='object')$('inspector').innerHTML=o?objectFields(o):'<div class="empty-inspector"><strong>Select an object</strong><p>Add text, shapes, buttons, or images. Double-click text to type directly on the slide.</p><p>Arrow keys move the selected object. Shift + arrow moves by 10.</p></div>';
  if(tab==='states')$('inspector').innerHTML=o?'<h3>Object states</h3>'+field('Edit state appearance','editState',choices(Object.keys(o.states),editState),'select')+field('Initial state','initialState',choices(Object.keys(o.states),o.initialState),'select')+'<p class="hint">Choose a state, then use Object properties or direct text editing to change its appearance. A trigger can apply any state.</p>'+btn('+ Custom state','state-add'):'<div class="empty-inspector">Select an object to edit its states.</div>';
  if(tab==='triggers')$('inspector').innerHTML='<h3>Triggers</h3><p class="hint">Triggers run from top to bottom. Conditions can use project variables.</p>'+btn('+ Add trigger','trigger-add')+s.triggers.map(t=>'<div class="trigger-card"><strong>'+esc(t.event)+' → '+esc(t.action)+'</strong><p>'+esc(s.layers.flatMap(l=>l.objects).find(o=>o.id===t.source)?.name||project.variables.find(v=>v.id===t.source)?.name||s.title)+(t.condition?' · Conditional':'')+(t.enabled===false?' · Disabled':'')+'</p><div class="mini-actions">'+btn('Edit','trigger-edit','data-trigger="'+t.id+'"')+btn('↑','trigger-up','data-trigger="'+t.id+'" aria-label="Move trigger up"')+btn('↓','trigger-down','data-trigger="'+t.id+'" aria-label="Move trigger down"')+btn('Delete','trigger-delete','data-trigger="'+t.id+'"')+'</div></div>').join('');
  if(tab==='slide')$('inspector').innerHTML='<h3>Slide settings</h3>'+field('Slide title','slide.title',s.title)+field('Duration (seconds)','slide.duration',s.duration,'number','min=".1" max="3600" step=".1"')+field('Background','slide.background',s.background,'color')+field('When revisiting','slide.revisit',choices([{id:'resume',name:'Resume saved state'},{id:'reset',name:'Reset to initial state'}],s.revisit),'select')+field('Instructor notes · excluded from HTML export','slide.notes',s.notes,'textarea')+
    '<label class="check"><input data-field="startSlide" type="checkbox" '+(project.startSlideId===s.id?'checked':'')+'> Starting slide</label><div class="mini-actions">'+btn('Duplicate slide','slide-copy')+btn('Move up','slide-up')+btn('Move down','slide-down')+btn('Delete slide','slide-delete')+'</div>'+field('Selected layer name','layer.name',l.name)+(l!==s.layers[0]?'<label class="check"><input data-field="layer.modal" type="checkbox" '+(l.modal?'checked':'')+'> Modal feedback · pauses base timeline</label>'+btn('Delete layer','layer-delete'):'');
}
function draw(){if(!slideById(project,slideId)){slideId=project.startSlideId;objectId=null;}if(!currentSlide().layers.some(l=>l.id===layerId)){layerId=currentSlide().layers[0].id;objectId=null;}
  $('project-title').value=project.title;$('slide-label').textContent=currentSlide().title;
  $('layer-tabs').innerHTML=currentSlide().layers.map(l=>'<button data-action="layer-select" data-layer="'+l.id+'" class="'+(l.id===layerId?'active':'')+'">'+esc(l.name)+'</button>').join('');
  $('undo').disabled=!undo.length;$('redo').disabled=!redo.length;outline();canvas();timeline();inspector();
}
function select(id){objectId=id;editState='normal';canvas();timeline();inspector();}
function editText(e){const o=currentObject();if(!o||o.locked||!['text','button'].includes(o.type))return;const text=e.querySelector('.obj-text');if(!text)return;checkpoint();text.setAttribute('contenteditable','plaintext-only');text.setAttribute('tabindex','0');text.setAttribute('role','textbox');text.setAttribute('aria-label','Edit '+o.name);text.focus();
  const range=document.createRange();range.selectNodeContents(text);const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);
  text.oninput=()=>{const value=text.innerText??text.textContent;if(editState==='normal')o.text=value;else o.states[editState].text=value;change(false);};
  text.onblur=()=>{text.setAttribute('contenteditable','false');text.oninput=null;canvas();inspector();};
}
$('canvas').addEventListener('dblclick',ev=>{const e=ev.target.closest('.author-object');if(!e)return;if(objectId!==e.dataset.object)select(e.dataset.object);editText($('canvas').querySelector('[data-object="'+objectId+'"]'));});
$('canvas').addEventListener('pointerdown',ev=>{
  if(ev.button!==0||ev.target.closest('[contenteditable=true],[contenteditable=plaintext-only]'))return;
  const e=ev.target.closest('.author-object');if(!e){select(null);return;}
  const corner=ev.target.closest('[data-corner]')?.dataset.corner,id=e.dataset.object;
  if(id!==objectId)select(id);const o=currentObject();if(!o||o.locked)return;ev.preventDefault();
  const start={x:ev.clientX,y:ev.clientY,ox:o.x,oy:o.y,w:o.w,h:o.h},element=$('canvas').querySelector('[data-object="'+id+'"]');let moved=false;
  const move=event=>{const dx=(event.clientX-start.x)/scale,dy=(event.clientY-start.y)/scale;if(!moved&&Math.abs(dx)+Math.abs(dy)<2)return;if(!moved){checkpoint();moved=true;}
    if(corner){const west=corner.includes('w'),north=corner.includes('n');o.w=Math.max(12,start.w+(west?-dx:dx));o.h=Math.max(12,start.h+(north?-dy:dy));o.x=west?start.ox+start.w-o.w:start.ox;o.y=north?start.oy+start.h-o.h:start.oy;}
    else{o.x=start.ox+dx;o.y=start.oy+dy;}
    Object.assign(element.style,{left:o.x+'px',top:o.y+'px',width:o.w+'px',height:o.h+'px'});
  };
  const finish=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',finish);window.removeEventListener('pointercancel',finish);if(moved)change();};
  window.addEventListener('pointermove',move);window.addEventListener('pointerup',finish);window.addEventListener('pointercancel',finish);
});
$('inspector').addEventListener('change',ev=>{
  const input=ev.target,key=input.dataset.field;if(!key)return;
  if(key==='editState'){editState=input.value;canvas();return;}
  const value=input.type==='checkbox'?input.checked:input.type==='number'?Number(input.value):input.value;
  const target=key.startsWith('slide.')?currentSlide():key.startsWith('layer.')?currentLayer():currentObject(),property=key.replace(/^(slide|layer)\./,'');
  if(key==='startSlide'){if(value)mutate(()=>project.startSlideId=currentSlide().id);return;}
  if(!target)return;
  mutate(()=>{if(target===currentObject()&&editState!=='normal'&&['text','fill','color','fontSize','bold','align','radius'].includes(property))target.states[editState][property]=value;
    else target[property]=['w','h'].includes(property)?clamp(value,12,7680):property==='fontSize'?clamp(value,8,180):property==='duration'?clamp(value,.1,3600):property==='start'?clamp(value,0,3600):value;});
});
$('project-title').onchange=ev=>{const title=ev.target.value.trim();if(title)mutate(()=>project.title=title);else ev.target.value=project.title;};
$('time-slider').oninput=ev=>{time=Number(ev.target.value);$('time-output').textContent=time.toFixed(1)+'s';canvas();};
$('timing-visible').onchange=()=>canvas();
function stopTiming(){timing=false;cancelAnimationFrame(timingFrame);lastTick=undefined;$('timeline-play').textContent='Play timing';}
function playTiming(){if(timing){stopTiming();return;}if(time>=currentSlide().duration)time=0;timing=true;$('timing-visible').checked=true;
  const tick=now=>{if(!timing)return;if(lastTick!==undefined)time=Math.min(currentSlide().duration,time+(now-lastTick)/1000);lastTick=now;canvas();$('time-slider').value=time;$('time-output').textContent=time.toFixed(1)+'s';if(time>=currentSlide().duration)stopTiming();else timingFrame=requestAnimationFrame(tick);};timingFrame=requestAnimationFrame(tick);$('timeline-play').textContent='Pause timing';
}
function nameDialog(title,value,fn){show(title,'<form id="name-form"><label class="field"><span>Name</span><input name="name" required maxlength="100" value="'+esc(value)+'"></label><button type="submit" class="primary">Save</button></form>');$('name-form').onsubmit=ev=>{ev.preventDefault();const name=String(new FormData(ev.target).get('name')).trim();if(!name)return;fn(name);close();};}
function variables(){
  show('Project variables','<p>Reference a value in slide text with <code>{{variable_name}}</code>. Use variables in triggers and conditions.</p>'+project.variables.map(v=>'<div class="project-item"><strong>'+esc(v.name)+'</strong><small>'+esc(v.type)+' · '+esc(v.initial)+'</small>'+btn('Edit','variable-edit','data-variable="'+v.id+'"')+btn('Delete','variable-delete','data-variable="'+v.id+'"')+'</div>').join('')+'<p>'+btn('+ Add variable','variable-add')+'</p>');
}
function variableForm(id){
  const v=project.variables.find(v=>v.id===id)||{id:uid(),name:'',type:'number',initial:0};
  show(id?'Edit variable':'Add variable','<form id="variable-form"><label class="field"><span>Name</span><input name="name" required pattern="[A-Za-z][A-Za-z0-9_]*" value="'+esc(v.name)+'"></label><label class="field"><span>Type</span><select name="type">'+choices(['number','text','boolean'],v.type)+'</select></label><label class="field"><span>Initial value · use true or false for a boolean</span><input name="initial" value="'+esc(v.initial)+'"></label><button class="primary" type="submit">Save variable</button></form>');
  $('variable-form').onsubmit=ev=>{ev.preventDefault();const f=new FormData(ev.target),name=String(f.get('name')).trim(),type=f.get('type'),raw=f.get('initial');if(project.variables.some(x=>x.id!==id&&x.name===name)){notify('Choose a unique variable name.');return;}if(type==='number'&&!Number.isFinite(Number(raw))||type==='boolean'&&!['true','false'].includes(raw)){notify('Enter a valid initial value.');return;}
    mutate(()=>{const value={id:v.id,name,type,initial:type==='number'?Number(raw):type==='boolean'?raw==='true':raw};if(id)Object.assign(v,value);else project.variables.push(value);});variables();
  };
}
function triggerForm(id){
  const s=currentSlide(),old=s.triggers.find(t=>t.id===id),t=clone(old||{id:uid(),event:objectId?'click':'enter',source:objectId||'',action:'show-layer',target:s.layers[1]?.id||'',operation:'set',value:'',at:0,enabled:true});
  show(id?'Edit trigger':'Add trigger','<form id="trigger-form"><label class="field"><span>When</span><select name="event">'+choices(EVENTS,t.event)+'</select></label><div id="trigger-source"></div><label class="field"><span>Action</span><select name="action">'+choices(ACTIONS,t.action)+'</select></label><div id="trigger-target"></div><label class="check"><input name="enabled" type="checkbox" '+(t.enabled!==false?'checked':'')+'> Enabled</label><label class="check"><input name="conditional" type="checkbox" '+(t.condition?'checked':'')+'> Only if a variable condition is true</label><div id="trigger-condition"></div><button class="primary" type="submit">Save trigger</button></form>');
  const form=$('trigger-form');
  function controls(){const event=form.elements.event.value,action=form.elements.action.value;
    $('trigger-source').innerHTML=event==='click'?'<label class="field"><span>Object</span><select name="source">'+choices(s.layers.flatMap(l=>l.objects),t.source)+'</select></label>':event==='variable-change'?'<label class="field"><span>Variable</span><select name="source">'+choices(project.variables,t.source)+'</select></label>':event==='time'?'<label class="field"><span>At seconds</span><input name="at" type="number" min="0" max="'+s.duration+'" step=".1" value="'+t.at+'"></label>':'';
    const targets=action==='navigate'?slidesOf(project):['show-layer','hide-layer'].includes(action)?s.layers.slice(1):action==='state'?s.layers.flatMap(l=>l.objects):action==='variable'?project.variables:[];
    $('trigger-target').innerHTML=targets.length?'<label class="field"><span>Target</span><select name="target">'+choices(targets,t.target)+'</select></label>': ['navigate','show-layer','hide-layer','state','variable'].includes(action)?'<p class="hint">Add the required slide, overlay layer, object, or variable first.</p>':'';
    if(action==='state'){const target=targets.find(o=>o.id===form.elements.target?.value);$('trigger-target').insertAdjacentHTML('beforeend','<label class="field"><span>State</span><select name="value">'+choices(Object.keys(target?.states||{}),t.value)+'</select></label>');}
    if(action==='variable')$('trigger-target').insertAdjacentHTML('beforeend','<label class="field"><span>Operation</span><select name="operation">'+choices(['set','add'],t.operation)+'</select></label><label class="field"><span>Value</span><input name="value" value="'+esc(t.value)+'"></label>');
    $('trigger-condition').innerHTML=form.elements.conditional.checked?'<div class="field-grid"><label class="field"><span>Variable</span><select name="conditionVariable">'+choices(project.variables,t.condition?.variable)+'</select></label><label class="field"><span>Comparison</span><select name="conditionOp">'+choices([{id:'eq',name:'Equals'},{id:'ne',name:'Not equal'},{id:'gt',name:'Greater than'},{id:'gte',name:'At least'},{id:'lt',name:'Less than'},{id:'lte',name:'At most'}],t.condition?.op||'eq')+'</select></label></div><label class="field"><span>Compare with</span><input name="conditionValue" value="'+esc(t.condition?.value||'')+'"></label>':'';
  }
  controls();form.onchange=ev=>{
    if(['event','action','conditional','target'].includes(ev.target.name)){
      if(form.elements.source)t.source=form.elements.source.value;
      if(form.elements.target)t.target=form.elements.target.value;
      if(form.elements.value)t.value=form.elements.value.value;
      if(form.elements.operation)t.operation=form.elements.operation.value;
      if(form.elements.at)t.at=Number(form.elements.at.value);
      if(form.elements.conditionVariable)t.condition={variable:form.elements.conditionVariable.value,op:form.elements.conditionOp.value,value:form.elements.conditionValue.value};
      if(ev.target.name!=='target'||form.elements.action.value==='state')controls();
    }
  };
  form.onsubmit=ev=>{ev.preventDefault();const f=new FormData(form),next={id:t.id,event:f.get('event'),source:f.get('source')||'',action:f.get('action'),target:f.get('target')||'',operation:f.get('operation')||'set',value:f.get('value')??'',at:Number(f.get('at')||0),enabled:f.has('enabled')};
    if(f.has('conditional'))next.condition={variable:f.get('conditionVariable'),op:f.get('conditionOp'),value:f.get('conditionValue')};
    const copy=clone(project),slide=slideById(copy,s.id);if(old)Object.assign(slide.triggers.find(x=>x.id===id),next);else slide.triggers.push(next);
    if(old&&!next.condition)delete slide.triggers.find(x=>x.id===id).condition;
    const issues=validateProject(copy);if(issues.length){notify(issues[0]);return;}
    mutate(()=>{if(old){Object.assign(old,next);if(!next.condition)delete old.condition;}else s.triggers.push(next);});close();
  };
}
async function projects(){
  show('Your projects','<p>Loading saved projects…</p>');
  try{const list=await request('list');$('modal-body').innerHTML='<p>Website projects are shared with instructors who have the site PIN.</p>'+list.map(p=>'<div class="project-item"><strong>'+esc(p.title)+'</strong><small>Version '+p.version+'<br>'+new Date(p.updated_at).toLocaleDateString()+'</small>'+btn('Open','project-open','data-project="'+p.id+'"')+btn('History','project-history','data-project="'+p.id+'"')+'</div>').join('')+(list.length?'':'<p>No website projects yet. Save your course to create one.</p>');}
  catch(e){$('modal-body').textContent=e.message;}
}
async function openProject(id){if(dirty&&!saveBlocked)await save();if(saveBlocked){notify('Download your device draft or save it as a new project before opening another course.');return;}const r=await request('get',{id});const issues=validateProject(r.data);if(issues.length)throw Error(issues[0]);project=r.data;version=r.version;remote=true;dirty=false;resetSelection();localSave();close();draw();status('Saved to website ✓');}
function referencedObject(id){return currentSlide().triggers.some(t=>t.source===id||t.target===id);}
function removeObject(){const o=currentObject();if(!o)return;mutate(()=>{currentLayer().objects=currentLayer().objects.filter(x=>x.id!==o.id);currentSlide().triggers=currentSlide().triggers.filter(t=>t.source!==o.id&&t.target!==o.id);objectId=null;});}
async function action(name,b){
  const s=currentSlide(),l=currentLayer(),o=currentObject();
  if(name==='close-modal')return close();if(name==='save')return save();if(name==='backup')return backup();if(name==='projects')return projects();
  if(name==='project-open')return openProject(b.dataset.project);
  if(name==='project-history'){const history=await request('history',{id:b.dataset.project});show('Saved versions',history.length?history.map(h=>'<div class="project-item"><strong>Version '+h.version+'</strong><small>'+new Date(h.created_at).toLocaleString()+'</small>'+btn('Download source','history-download','data-history="'+h.version+'"')+'</div>').join(''):'<p>A previous version appears after the project is edited and saved.</p>');$('modal-body')._history=history;return;}
  if(name==='history-download'){const h=$('modal-body')._history.find(h=>h.version===Number(b.dataset.history));download(JSON.stringify(h.data,null,2),'course-version-'+h.version+'.json');return;}
  if(name==='load-latest'){const id=project.id;saveBlocked=false;dirty=false;return openProject(id);}
  if(name==='copy-project'){mutate(()=>project.id=uid());remote=false;version=0;saveBlocked=false;close();return save();}
  if(name==='new'){if(dirty){try{await save();}catch{backup();notify('Downloaded the current draft before starting a new course.');}}project=newProject();version=0;remote=false;dirty=true;resetSelection();localSave();draw();if(!cloudUnavailable)return save();status('New course · saved on device',true);return;}
  if(name==='import')return $('project-file').click();
  if(name==='export'){download(exportHTML(project),filename()+'.html','text/html');notify('HTML course exported. Learner progress is saved on the device; LMS reporting comes in the publishing release.');return;}
  if(name==='preview'){const issues=validateProject(project);if(issues.length)throw Error(issues[0]);preview?.destroy();$('preview-modal').showModal();preview=mountPlayer($('preview-host'),project,{debug:true,onError:e=>notify(e.message)});return;}
  if(name==='check'){const issues=validateProject(project);show('Project check',issues.length?'<ul class="error-list">'+issues.map(i=>'<li>'+esc(i)+'</li>').join('')+'</ul>':'<p>Your project passed the structural checks for this release. Preview the complete learning path before distributing it.</p>');return;}
  if(name==='help'){show('Build your first interactive course','<p><strong>1. Edit the example.</strong> The starter course demonstrates a decision, feedback layer, variable, and completion action.</p><p><strong>2. Create slides.</strong> Use + on a scene. Double-click text or buttons to type directly on the slide. Drag objects to move them, or drag the corner handles to resize.</p><p><strong>3. Add behavior.</strong> Select an object and open Triggers. Choose an event, an action, and an optional variable condition. Use Layers for feedback and States for appearances.</p><p><strong>4. Test and export.</strong> Preview uses the same player as HTML export. Check the live variables and trigger log below preview.</p><p><strong>Saving.</strong> Website saves include version checks and the previous 20 revisions. A device draft is also kept. Download a project JSON for an independent editable backup.</p><p><strong>Shortcuts.</strong> Ctrl/Cmd + S saves, Ctrl/Cmd + Z undoes a completed edit, Ctrl/Cmd + D duplicates an object. Arrow keys move selected objects; Shift increases the step.</p><p>This is the foundation release. Advanced media tools, question banks, LMS packages, review collaboration, and the Windows recorder are scheduled in the full build specification.</p>');return;}
  if(name==='variables')return variables();if(name==='variable-add')return variableForm();if(name==='variable-edit')return variableForm(b.dataset.variable);
  if(name==='variable-delete'){const id=b.dataset.variable;if(slidesOf(project).some(s=>s.triggers.some(t=>t.source===id||t.target===id||t.condition?.variable===id))){notify('Remove triggers using this variable before deleting it.');return;}mutate(()=>project.variables=project.variables.filter(v=>v.id!==id));return variables();}
  if(name==='scene-add')return nameDialog('Add scene','New scene',title=>mutate(()=>{const slide=newSlide();project.scenes.push({id:uid(),title,slides:[slide]});slideId=slide.id;layerId=slide.layers[0].id;objectId=null;}));
  if(name==='scene-rename'){const scene=project.scenes.find(x=>x.id===b.dataset.scene);return nameDialog('Rename scene',scene.title,title=>mutate(()=>scene.title=title));}
  if(name==='slide-add')return mutate(()=>{const scene=project.scenes.find(x=>x.id===b.dataset.scene),slide=newSlide();scene.slides.push(slide);slideId=slide.id;layerId=slide.layers[0].id;objectId=null;time=0;});
  if(name==='slide-select'){stopTiming();slideId=b.dataset.slide;layerId=currentSlide().layers[0].id;objectId=null;editState='normal';time=0;draw();return;}
  if(name==='slide-copy')return mutate(()=>{const scene=project.scenes.find(sc=>sc.slides.some(sl=>sl.id===s.id)),copy=duplicateSlide(s);scene.slides.splice(scene.slides.indexOf(s)+1,0,copy);slideId=copy.id;layerId=copy.layers[0].id;objectId=null;});
  if(name==='slide-delete'){const scene=project.scenes.find(sc=>sc.slides.some(sl=>sl.id===s.id));if(scene.slides.length===1){notify('Keep at least one slide in each scene.');return;}return mutate(()=>{scene.slides=scene.slides.filter(sl=>sl.id!==s.id);for(const slide of slidesOf(project))slide.triggers=slide.triggers.filter(t=>t.action!=='navigate'||t.target!==s.id);if(project.startSlideId===s.id)project.startSlideId=slidesOf(project)[0].id;slideId=scene.slides[0].id;layerId=currentSlide().layers[0].id;objectId=null;});}
  if(name==='slide-up'||name==='slide-down'){const scene=project.scenes.find(sc=>sc.slides.includes(s)),i=scene.slides.indexOf(s),next=i+(name==='slide-up'?-1:1);if(next>=0&&next<scene.slides.length)mutate(()=>{[scene.slides[i],scene.slides[next]]=[scene.slides[next],scene.slides[i]];});return;}
  if(name==='layer-select'){layerId=b.dataset.layer;objectId=null;editState='normal';canvas();inspector();draw();return;}
  if(name==='layer-add')return nameDialog('Add feedback layer','Feedback',name=>mutate(()=>{const layer={id:uid(),name,modal:true,objects:[]};s.layers.push(layer);layerId=layer.id;objectId=null;}));
  if(name==='layer-delete'){if(l===s.layers[0])return;const ids=new Set(l.objects.map(o=>o.id));return mutate(()=>{s.layers=s.layers.filter(x=>x.id!==l.id);s.triggers=s.triggers.filter(t=>t.target!==l.id&&!ids.has(t.source)&&!ids.has(t.target));layerId=s.layers[0].id;objectId=null;});}
  if(name==='object-add')return mutate(()=>{const object=newObject(b.dataset.type,{duration:s.duration,x:110+l.objects.length*18,y:110+l.objects.length*18});l.objects.push(object);objectId=object.id;editState='normal';tab='object';});
  if(name==='image-add')return $('image-file').click();
  if(name==='object-select')return select(b.dataset.object);
  if(name==='object-delete')return removeObject();
  if(name==='object-copy'&&o)return mutate(()=>{const copy=clone(o);copy.id=uid();copy.name+=' (copy)';copy.x+=25;copy.y+=25;l.objects.push(copy);for(const t of s.triggers.filter(t=>t.source===o.id)){const ct=clone(t);ct.id=uid();ct.source=copy.id;if(ct.target===o.id)ct.target=copy.id;s.triggers.push(ct);}objectId=copy.id;});
  if((name==='forward'||name==='backward')&&o){const i=l.objects.indexOf(o),next=clamp(i+(name==='forward'?1:-1),0,l.objects.length-1);return mutate(()=>{[l.objects[i],l.objects[next]]=[l.objects[next],l.objects[i]];});}
  if(name==='align'&&o)return mutate(()=>o.x=b.dataset.align==='left'?0:b.dataset.align==='right'?project.width-o.w:(project.width-o.w)/2);
  if(name==='tab'){tab=b.dataset.tab;inspector();return;}
  if(name==='state-add'&&o)return nameDialog('Add custom state','completed',name=>{if(Object.hasOwn(o.states,name)||['__proto__','constructor','prototype'].includes(name)){notify('Choose a different state name.');return;}mutate(()=>{o.states[name]={};editState=name;});});
  if(name==='trigger-add')return triggerForm();if(name==='trigger-edit')return triggerForm(b.dataset.trigger);
  if(name==='trigger-delete')return mutate(()=>s.triggers=s.triggers.filter(t=>t.id!==b.dataset.trigger));
  if(name==='trigger-up'||name==='trigger-down'){const i=s.triggers.findIndex(t=>t.id===b.dataset.trigger),next=i+(name==='trigger-up'?-1:1);if(next>=0&&next<s.triggers.length)mutate(()=>{[s.triggers[i],s.triggers[next]]=[s.triggers[next],s.triggers[i]];});return;}
  if(name==='undo'&&undo.length){redo.push(clone(project));project=undo.pop();change();return;}
  if(name==='redo'&&redo.length){undo.push(clone(project));project=redo.pop();change();return;}
  if(name==='timeline-play')return playTiming();
}
document.addEventListener('click',ev=>{const b=ev.target.closest('[data-action]');if(b)Promise.resolve(action(b.dataset.action,b)).catch(e=>notify(e.message));});
document.addEventListener('keydown',ev=>{
  if($('modal').open||$('preview-modal').open)return;
  const editing=ev.target.closest('input,textarea,select,[contenteditable=true],[contenteditable=plaintext-only]'),mod=ev.ctrlKey||ev.metaKey;
  if(mod&&ev.key.toLowerCase()==='s'){ev.preventDefault();save().catch(e=>notify(e.message));return;}if(editing)return;
  if(mod&&ev.key.toLowerCase()==='z'){ev.preventDefault();action(ev.shiftKey?'redo':'undo');}
  else if(mod&&ev.key.toLowerCase()==='d'){ev.preventDefault();action('object-copy');}
  else if(ev.key==='Delete'||ev.key==='Backspace'){if(currentObject()){ev.preventDefault();removeObject();}}
  else if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(ev.key)&&currentObject()&&!currentObject().locked){ev.preventDefault();const step=ev.shiftKey?10:1;mutate(()=>{const o=currentObject();if(ev.key==='ArrowUp')o.y-=step;if(ev.key==='ArrowDown')o.y+=step;if(ev.key==='ArrowLeft')o.x-=step;if(ev.key==='ArrowRight')o.x+=step;});}
  else if(ev.key==='Enter'&&ev.target.closest('.author-object')){const e=ev.target.closest('.author-object');select(e.dataset.object);editText($('canvas').querySelector('[data-object="'+objectId+'"]'));}
});
$('project-file').onchange=async ev=>{const file=ev.target.files[0];if(!file)return;try{if(file.size>3000000)throw Error('Project files must be no larger than 3 MB in this release.');const data=JSON.parse(await file.text()),issues=validateProject(data);if(issues.length)throw Error(issues[0]);if(dirty){try{await save();}catch{backup();}}project=data;project.id=uid();remote=false;version=0;dirty=true;resetSelection();localSave();draw();if(!cloudUnavailable)await save();notify(cloudUnavailable?'Project imported and saved on this device.':'Project imported as a new course.');}catch(e){notify(e.message);}finally{ev.target.value='';}};
$('image-file').onchange=async ev=>{const file=ev.target.files[0];if(!file)return;try{if(file.size>1500000||!['image/png','image/jpeg','image/webp','image/gif'].includes(file.type))throw Error('Upload a PNG, JPG, WebP, or GIF no larger than 1.5 MB.');const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file);});mutate(()=>{const o=newObject('image',{name:file.name,alt:'',src:data,duration:currentSlide().duration});currentLayer().objects.push(o);objectId=o.id;editState='normal';tab='object';});}catch(e){notify(e.message);}finally{ev.target.value='';}};
$('close-preview').onclick=()=>{preview?.destroy();preview=null;$('preview-modal').close();};
$('preview-modal').addEventListener('cancel',()=>{preview?.destroy();preview=null;});
const style=document.createElement('style');style.textContent=PLAYER_CSS;document.head.append(style);
window.addEventListener('resize',size);if(window.ResizeObserver)new ResizeObserver(size).observe($('canvas-well'));
window.addEventListener('beforeunload',ev=>{if(dirty){localSave();ev.preventDefault();ev.returnValue='';}});
let recovered;try{recovered=JSON.parse(localStorage.getItem(LOCAL)||'null');}catch{}
if(recovered?.data&&!validateProject(recovered.data).length){project=recovered.data;remote=!!recovered.remote;version=Number(recovered.version)||0;dirty=!!recovered.dirty;}else{project=demoProject();dirty=false;}
resetSelection();draw();status(dirty?'Recovered device draft · save to website':remote?'Website project · device copy':'Editable example · save to create your website project',dirty);
// A clean website copy is refreshed before editing; an unsynced device draft is always retained.
if(remote&&!dirty){const openingId=project.id;request('get',{id:openingId}).then(r=>{if(project.id===openingId&&!dirty&&r.version!==version){project=r.data;version=r.version;resetSelection();localSave();draw();status('Latest website version loaded ✓');}}).catch(()=>status('Offline copy · website save can be retried',true));}
export const editorForTesting=()=>({project,slideId,layerId,objectId,version,remote,dirty});
