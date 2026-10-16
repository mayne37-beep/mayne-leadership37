import {VERSION,LIMITS,STAGES,uid,esc,copy,blankCase,addCause,removeCause,isDescendant,analysis,normalizeCase,template,today} from './root-cause-model.js';
import {VIEWS,renderView,button} from './root-cause-render.js';
import {exportJSON,exportSVG,exportPNG,exportPareto,exportSolutions,printReport} from './root-cause-export.js';

const $=s=>document.querySelector(s),$$=s=>Array.from(document.querySelectorAll(s));
const STORE='ml.root-cause.studio.v1';
const PROMPTS=['What evidence would convince a skeptical colleague?','What other explanations have you not yet explored?','Are you treating a symptom as if it were a cause?','What changed before this problem appeared?','How could you measure your suspected causal relationship?','Who closest to the work has another perspective?','What unintended consequences could a solution produce?','Which assumption is most likely to be wrong?'];
let library={cases:[],activeId:''},view='problem',modal=null,promptIndex=0,past=[],future=[],toastTimer=null,dragId='';
function current(){return library.cases.find(x=>x.id===library.activeId)||library.cases[0];}
function announce(message){const t=$('#toast');t.textContent=message;t.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('show'),3100);}
function loadLibrary(){
 try{
  const saved=JSON.parse(localStorage.getItem(STORE)||'null');
  if(saved&&Array.isArray(saved.cases)&&saved.cases.length){
   const cases=saved.cases.slice(0,LIMITS.cases).map(x=>normalizeCase(x));
   library={cases,activeId:cases.find(x=>x.id===saved.activeId)?.id||cases[0].id};
   view=VIEWS[saved.view]?saved.view:'problem';return;
  }
 }catch(e){console.warn('Root Cause Studio could not restore the local case library:',e)}
 const c=blankCase();library={cases:[c],activeId:c.id};
}
function persist(){
 current().updatedAt=new Date().toISOString();
 try{localStorage.setItem(STORE,JSON.stringify({...library,view}));$('#save-indicator').textContent='✓ Saved on this device';return true}
 catch(e){$('#save-indicator').textContent='⚠ Device save failed';announce('Browser storage is full. Export a backup to avoid losing work.');return false}
}
function change(fn){
 const original=copy(current());
 fn(current());
 past.push(original);if(past.length>50)past.shift();future=[];
 persist();render();
}
function undo(){
 if(!past.length)return;
 const here=current(),previous=past.pop();future.push(copy(here));
 library.cases.splice(library.cases.indexOf(here),1,previous);persist();render();
}
function redo(){
 if(!future.length)return;
 const here=current(),next=future.pop();past.push(copy(here));
 library.cases.splice(library.cases.indexOf(here),1,next);persist();render();
}
function chooseCase(id){
 if(!library.cases.some(c=>c.id===id))return;
 library.activeId=id;view='problem';past=[];future=[];persist();render();
}
function createCase(c=blankCase()){
 if(library.cases.length>=LIMITS.cases){announce('Project library limit reached. Export or remove a project.');return}
 library.cases.unshift(c);library.activeId=c.id;view='problem';past=[];future=[];persist();render();announce('Investigation ready.');
}
function renderLibrary(){
 const q=$('#case-search').value.trim().toLowerCase();
 $('#case-count').textContent=library.cases.length;
 $('#case-list').innerHTML=library.cases.filter(c=>(c.title+' '+c.problem).toLowerCase().includes(q)).map(c=>
 '<div class="case-item '+(c.id===library.activeId?'active':'')+'"><button class="case-choice" data-select-case="'+esc(c.id)+'" aria-current="'+(c.id===library.activeId?'page':'false')+'"><strong>'+esc(c.title||'Untitled investigation')+'</strong><small>'+esc(c.status)+' · '+c.causes.length+' causes</small></button>'+
 button('×','delete-case','data-id="'+esc(c.id)+'" aria-label="Delete investigation"','case-remove')+'</div>').join('')||'<p class="save-disclosure">No matching investigations.</p>';
}
function renderStages(){
 const c=current(),index=STAGES.findIndex(s=>s.id===c.stage),n=Math.max(0,index),stage=STAGES[n];
 $('#stage-list').innerHTML=STAGES.map((s,i)=>'<li><button type="button" data-stage="'+esc(s.id)+'" class="'+(c.stage===s.id?'current':'')+'"><span>'+String(i+1).padStart(2,'0')+'</span>'+esc(s.title)+'</button></li>').join('');
 $('#stage-name').textContent=stage.title;$('#stage-prompt').textContent=stage.prompt;
 $('#next-stage').disabled=n===STAGES.length-1;
}
function renderMetrics(){
 const c=current(),a=analysis(c);
 $('#metrics').innerHTML=[
 ['Potential causes',a.causeCount,a.rootCount+' marked root candidates'],
 ['Evidence records',a.evidenceCount,a.evidencedCount+' causes with evidence'],
 ['Recorded incidents',a.pareto.total,'Frequency observations'],
 ['Interventions',a.actions,a.done+' completed']
 ].map(x=>'<div class="metric"><small>'+esc(x[0])+'</small><strong>'+x[1]+'</strong><em>'+esc(x[2])+'</em></div>').join('');
 const covered=c.causes.length?Math.round(100*a.evidencedCount/c.causes.length):0;
 $('#evidence-meter').style.width=covered+'%';
 $('#evidence-amount').textContent=a.evidencedCount+' / '+c.causes.length+' causes';
 $('#insights').innerHTML='<h3 class="insight-head">Investigation signals</h3>'+
 a.warnings.slice(0,6).map(x=>'<div class="insight-item warn">'+esc(x)+'</div>').join('')+
 (!a.warnings.length?'<div class="insight-item"><strong>Continue investigating</strong>No completeness warnings are currently flagged. Consider alternative explanations and new evidence.</div>':'');
}
function render(){
 const c=current();$('#case-title').value=c.title;
 renderLibrary();renderStages();renderMetrics();
 $('#view-title').textContent=VIEWS[view][1];$('#view-eyebrow').textContent=VIEWS[view][0];
 $$('[data-view]').forEach(b=>{b.classList.toggle('active',b.dataset.view===view);b.setAttribute('aria-current',b.dataset.view===view?'page':'false')});
 $('#view-root').innerHTML=renderView(c,view);
 $('#undo-case').disabled=!past.length;$('#redo-case').disabled=!future.length;
}
function formField(label,key,val,type='text',options=[],help=''){
 let input='';
 if(type==='textarea')input='<textarea name="'+key+'" maxlength="2500">'+esc(val||'')+'</textarea>';
 else if(type==='select')input='<select name="'+key+'">'+options.map(entry=>{
  const value=typeof entry==='object'?entry.value:entry,text=typeof entry==='object'?entry.label:entry;
  return '<option value="'+esc(value)+'" '+(String(value)===String(val)?'selected':'')+'>'+esc(text)+'</option>';
 }).join('')+'</select>';
 else input='<input name="'+key+'" type="'+type+'" '+(['text','title','label','finding','note'].includes(key)?'required':'')+' '+(type==='number'?'step="1" min="0" max="100000000"':'maxlength="800"')+' value="'+esc(val??'')+'">';
 return '<div class="field"><label>'+esc(label)+'</label>'+input+(help?'<small>'+esc(help)+'</small>':'')+'</div>';
}
function showEditor(kind,id='',context={}){
 const c=current();modal={kind,id,context};
 $('#dialog-title').textContent=(id?'Edit ':'Add ')+({cause:'a possible cause',evidence:'evidence',pareto:'frequency data',solution:'intervention',note:'observation',export:'exports'}[kind]||kind);
 $('#dialog-eyebrow').textContent=kind==='export'?'DOWNLOAD OPTIONS':'INVESTIGATION EDITOR';
 let html='',item;
 if(kind==='cause'){
  item=c.causes.find(x=>x.id===id)||{};
  const parents=[{value:'',label:'Directly contributes to the problem'},...c.causes.filter(x=>x.id!==id&&!isDescendant(c,id,x.id)).map(x=>({value:x.id,label:x.text.slice(0,92)||'(unnamed cause)'}))];
  html=formField('Suspected cause','text',item.text||'','textarea')+
   formField('Which problem or cause does this explain?','parentId',item.parentId||context.parentId||'','select',parents)+
   formField('Fishbone category','category',item.category||context.category||c.categories[0].id,'select',c.categories.map(x=>({value:x.id,label:x.name})))+
   formField('Assessment','status',item.status||'Hypothesis','select',['Hypothesis','Supported','Refuted'])+
   formField('Root-cause candidate?','root',item.root?'Yes':'No','select',['No','Yes'],'Mark a suspected root cause, not a claim of proof.')+
   formField('Rationale, assumptions, questions','notes',item.notes||'','textarea');
 }
 if(kind==='evidence'){
  item=c.evidence.find(x=>x.id===id)||{};
  html=formField('Linked suspected cause','causeId',item.causeId||context.causeId||'','select',[{value:'',label:'General / not linked'},...c.causes.map(x=>({value:x.id,label:x.text.slice(0,90)}))])+
   formField('Evidence type','type',item.type||'Observation','select',['Observation','Record','Interview','Data','Other'])+
   formField('Relationship to hypothesis','stance',item.stance||'Unclear','select',['Supports','Contradicts','Unclear'])+
   formField('Observation or finding','finding',item.finding||'','textarea')+
   formField('Source or reference','source',item.source||'')+
   formField('Date recorded','date',item.date||today(),'date');
 }
 if(kind==='pareto'){
  item=c.pareto.find(x=>x.id===id)||{};
  html=formField('Observed issue label','label',item.label||'')+
   formField('Number of recorded occurrences','count',item.count??0,'number')+
   formField('Origin of counts','sample',item.sample?'Invented example':'Recorded observation','select',['Recorded observation','Invented example']);
 }
 if(kind==='solution'){
  item=c.solutions.find(x=>x.id===id)||{};
  html=formField('Proposed intervention','title',item.title||'')+
   formField('Cause this aims to address','causeId',item.causeIds?.[0]||'','select',[{value:'',label:'No cause selected'},...c.causes.map(x=>({value:x.id,label:x.text.slice(0,88)}))])+
   formField('Owner','owner',item.owner||'')+formField('Target date','due',item.due||'','date')+
   formField('Status','status',item.status||'Proposed','select',['Proposed','In progress','Completed','Cancelled'])+
   formField('Expected impact (1–5)','impact',String(item.impact||3),'select',['1','2','3','4','5'])+
   formField('Effort (1–5)','effort',String(item.effort||3),'select',['1','2','3','4','5'])+
   formField('Confidence (1–5)','confidence',String(item.confidence||3),'select',['1','2','3','4','5'])+
   formField('Success measure','measure',item.measure||'')+
   formField('Baseline','baseline',item.baseline||'')+formField('Target','target',item.target||'')+
   formField('Observed result and unintended consequences','result',item.result||'','textarea');
 }
 if(kind==='note'){
  item=c.observations.find(x=>x.id===id)||{};
  html=formField('Observation date','date',item.date||today(),'date')+
   formField('Observation','note',item.note||'','textarea');
 }
 if(kind==='export'){
  html='<div class="note">Download an editable project, a fishbone diagram, calculated Pareto data, an intervention plan, or a complete printable investigation report.</div>'+
   '<div class="records" style="margin-top:15px">'+
   button('↓ Editable JSON project','download-json')+
   button('↓ Fishbone diagram — SVG','download-svg')+
   button('↓ Fishbone diagram — PNG','download-png')+
   button('↓ Pareto frequency — CSV','download-csv')+
   button('↓ Intervention plan — CSV','download-solutions')+
   button('Print or save report as PDF ↗','print','','primary')+'</div>';
 }
 $('#dialog-fields').innerHTML=html;
 $('#editor-form').querySelector('[type=submit]').hidden=kind==='export';
 $('#editor-dialog').showModal();
}
function saveEditor(){
 if(!modal||modal.kind==='export')return;
 const fd=new FormData($('#editor-form')),get=(name,len=2500)=>String(fd.get(name)??'').slice(0,len);
 const {kind,id}=modal;
 const c=current(),target=kind==='cause'?'causes':kind==='evidence'?'evidence':kind==='pareto'?'pareto':kind==='solution'?'solutions':'observations';
 if(kind==='cause'){
  const value=get('text',220).trim(),parentId=get('parentId',100);
  if(!value){announce('Describe the suspected cause.');return}
  if(parentId&&(parentId===id||isDescendant(c,id,parentId))){announce('That would create a cycle in the cause tree.');return}
  change(x=>{const rec={text:value,parentId,category:get('category',100),status:get('status',30),root:get('root')==='Yes',notes:get('notes')};
   if(id)Object.assign(x.causes.find(y=>y.id===id),rec);else addCause(x,rec);});
 }
 if(kind==='evidence'){
  if(!get('finding').trim()){announce('Describe what was observed.');return}
  change(x=>{const rec={id:id||uid(),causeId:get('causeId',100),type:get('type',30),stance:get('stance',30),finding:get('finding'),source:get('source',800),date:get('date',10)||today()};
   if(id)Object.assign(x.evidence.find(y=>y.id===id),rec);else{if(x.evidence.length>=LIMITS.evidence)throw Error('Evidence limit reached');x.evidence.push(rec)}});
 }
 if(kind==='pareto'){
  const value=Number(get('count'));if(!get('label',160).trim()){announce('Name the observed issue.');return}
  if(!Number.isInteger(value)||value<0||value>1e8){announce('Enter an integer count from 0 to 100,000,000.');return}
  change(x=>{const rec={id:id||uid(),label:get('label',160),count:value,sample:get('sample')==='Invented example'};
   if(id)Object.assign(x.pareto.find(y=>y.id===id),rec);else{if(x.pareto.length>=LIMITS.pareto)throw Error('Pareto limit reached');x.pareto.push(rec)}});
 }
 if(kind==='solution'){
  if(!get('title',200).trim()){announce('Name the proposed intervention.');return}
  change(x=>{const rec={id:id||uid(),title:get('title',200),causeIds:get('causeId',100)?[get('causeId',100)]:[],owner:get('owner',120),due:get('due',10),status:get('status',30),impact:Math.max(1,Math.min(5,Number(get('impact'))||3)),effort:Math.max(1,Math.min(5,Number(get('effort'))||3)),confidence:Math.max(1,Math.min(5,Number(get('confidence'))||3)),measure:get('measure',400),baseline:get('baseline',200),target:get('target',200),result:get('result',2000)};
   if(id)Object.assign(x.solutions.find(y=>y.id===id),rec);else{if(x.solutions.length>=LIMITS.solutions)throw Error('Intervention limit reached');x.solutions.push(rec)}});
 }
 if(kind==='note'){
  if(!get('note').trim()){announce('Write an observation.');return}
  change(x=>{const rec={id:id||uid(),date:get('date',10)||today(),note:get('note')};
   if(id)Object.assign(x.observations.find(y=>y.id===id),rec);else x.observations.push(rec)});
 }
 $('#editor-dialog').close();modal=null;announce('Investigation updated.');
}
function deleteRecord(kind,id){
 const field={cause:'causes',evidence:'evidence',pareto:'pareto',solution:'solutions',note:'observations'}[kind],record=current()[field].find(x=>x.id===id);
 if(!record)return;
 const name=(record.text||record.finding||record.label||record.title||record.note||'this record').slice(0,90);
 if(!confirm('Delete "'+name+'"?'+(kind==='cause'?' This will also remove child causes and their evidence.':'')))return;
 change(c=>{if(kind==='cause')removeCause(c,id);else c[field]=c[field].filter(x=>x.id!==id)});
 announce('Entry deleted.');
}
function act(action,node){
 const id=node.dataset.id||'',causeId=node.dataset.causeId||'';
 if(action==='add-cause')return showEditor('cause');
 if(action==='add-child')return showEditor('cause','',{parentId:id});
 if(action==='edit-cause')return showEditor('cause',id);
 if(action==='toggle-root')return change(c=>{const item=c.causes.find(x=>x.id===id);if(item)item.root=!item.root});
 if(action==='delete-cause')return deleteRecord('cause',id);
 if(action==='add-category-cause')return showEditor('cause','',{category:node.dataset.category});
 if(action==='add-evidence')return showEditor('evidence','',{causeId});
 if(action==='edit-evidence')return showEditor('evidence',id);
 if(action==='delete-evidence')return deleteRecord('evidence',id);
 if(action==='add-pareto')return showEditor('pareto');
 if(action==='edit-pareto')return showEditor('pareto',id);
 if(action==='delete-pareto')return deleteRecord('pareto',id);
 if(action==='add-solution')return showEditor('solution');
 if(action==='edit-solution')return showEditor('solution',id);
 if(action==='delete-solution')return deleteRecord('solution',id);
 if(action==='add-note')return showEditor('note');
 if(action==='edit-note')return showEditor('note',id);
 if(action==='delete-note')return deleteRecord('note',id);
 if(action==='go-tree'||action==='go-whys'){view=action==='go-tree'?'tree':'whys';persist();render();return}
 if(action==='add-category'){
  if(current().categories.length>=12){announce('Maximum of 12 categories. Rename an existing category.');return}
  return change(c=>c.categories.push({id:uid(),name:'New category'}));
 }
 if(action==='download-json')return exportJSON(current());
 if(action==='download-svg')return exportSVG(current());
 if(action==='download-png')return exportPNG(current()).catch(error=>announce('PNG export failed: '+error.message));
 if(action==='download-csv')return exportPareto(current());
 if(action==='download-solutions')return exportSolutions(current());
 if(action==='print')return printReport(current());
 if(action==='delete-case'){
  const c=library.cases.find(x=>x.id===id);
  if(!c||!confirm('Delete investigation "'+c.title+'"? This cannot be undone.'))return;
  library.cases=library.cases.filter(x=>x.id!==id);
  if(!library.cases.length)library.cases=[blankCase()];
  if(library.activeId===id)library.activeId=library.cases[0].id;
  view='problem';past=[];future=[];persist();render();announce('Investigation deleted.');
 }
}
async function importCase(file){
 if(!file)return;
 if(file.size>3000000){announce('The backup exceeds the 3 MB import limit.');return}
 try{
  const parsed=JSON.parse(await file.text());
  const raw=parsed.kind==='mayne-root-cause'?parsed.investigation:parsed;
  const c=normalizeCase(raw,{regenerate:true});
  if(!confirm('Import "'+c.title+'" as a separate investigation?'))return;
  createCase(c);announce('Editable investigation imported.');
 }catch(error){announce('Unable to import: '+error.message)}
}
function bind(){
 $('#new-case').onclick=()=>createCase();
 $('#duplicate-case').onclick=()=>createCase(normalizeCase({...current(),title:current().title+' (copy)'},{regenerate:true}));
 $('#undo-case').onclick=undo;$('#redo-case').onclick=redo;
 $('#export-menu').onclick=()=>showEditor('export');
 $('#print-report').onclick=()=>printReport(current());
 $('#case-search').oninput=renderLibrary;
 $('#case-title').onchange=e=>change(c=>c.title=e.target.value.trim().slice(0,120)||'Untitled investigation');
 $('#next-stage').onclick=()=>{const index=STAGES.findIndex(x=>x.id===current().stage);if(index>=0&&index<STAGES.length-1)change(c=>c.stage=STAGES[index+1].id)};
 $('#cycle-prompt').onclick=()=>$('#thinking-prompt').textContent=PROMPTS[++promptIndex%PROMPTS.length];
 $('#import-case').onclick=()=>$('#import-file').click();
 $('#import-file').onchange=e=>{importCase(e.target.files[0]);e.target.value=''};
 $('#dialog-close').onclick=()=>$('#editor-dialog').close();
 $('#dialog-cancel').onclick=()=>$('#editor-dialog').close();
 $('#editor-dialog').addEventListener('close',()=>modal=null);
 $('#editor-form').onsubmit=e=>{e.preventDefault();try{saveEditor()}catch(err){announce('Update failed: '+err.message)}};
 document.addEventListener('click',e=>{
  const visual=e.target.closest('[data-visual-cause]');if(visual){showEditor('cause',visual.dataset.visualCause);return}
  const select=e.target.closest('[data-select-case]');if(select){chooseCase(select.dataset.selectCase);return}
  const step=e.target.closest('[data-stage]');if(step){change(c=>c.stage=step.dataset.stage);return}
  const method=e.target.closest('[data-view]');if(method){view=method.dataset.view;persist();render();return}
  const tmpl=e.target.closest('[data-template]');if(tmpl){try{createCase(template(tmpl.dataset.template))}catch(err){announce(err.message)}return}
  const b=e.target.closest('[data-action]');if(b){try{act(b.dataset.action,b)}catch(err){announce(err.message)}}
 });
 document.addEventListener('change',e=>{
  const el=e.target,c=current(),key=el.dataset.caseField;
  if(key&&Object.hasOwn(c,key)&&typeof c[key]==='string'){change(x=>x[key]=String(el.value).slice(0,7000));return}
  if(el.dataset.causeText){change(x=>{const item=x.causes.find(y=>y.id===el.dataset.causeText);if(item)item.text=el.value.slice(0,220)});return}
  if(el.dataset.categoryName){change(x=>{const cat=x.categories.find(y=>y.id===el.dataset.categoryName);if(cat)cat.name=el.value.trim().slice(0,70)||'Unnamed category'});return}
  if(el.dataset.paretoLabel){change(x=>{const row=x.pareto.find(y=>y.id===el.dataset.paretoLabel);if(row)row.label=el.value.slice(0,160)});return}
  if(el.dataset.paretoCount){const n=Number(el.value);if(!Number.isInteger(n)||n<0||n>1e8){announce('Enter a count between 0 and 100,000,000.');render();return}
   change(x=>{const row=x.pareto.find(y=>y.id===el.dataset.paretoCount);if(row){row.count=n;row.sample=false}});}
 });
 document.addEventListener('keydown',e=>{
  const graphic=e.target.closest?.('[data-visual-cause]');
  if(graphic&&(e.key==='Enter'||e.key===' ')){e.preventDefault();showEditor('cause',graphic.dataset.visualCause);return}
  const editable=e.target.closest?.('input,textarea,select,[contenteditable="true"]');
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();persist();announce('Investigation saved on this device.')}
  if(!editable&&(e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();e.shiftKey?redo():undo()}
  if(!editable&&(e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'){e.preventDefault();redo()}
 });
 document.addEventListener('dragstart',e=>{
  const chip=e.target.closest?.('[data-drag-cause]');
  if(chip){dragId=chip.dataset.dragCause;e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',dragId)}
 });
 document.addEventListener('dragover',e=>{
  const zone=e.target.closest?.('[data-bone-category]');
  if(zone){e.preventDefault();e.dataTransfer.dropEffect='move';zone.classList.add('over')}
 });
 document.addEventListener('dragleave',e=>{
  const zone=e.target.closest?.('[data-bone-category]');
  if(zone&&!zone.contains(e.relatedTarget))zone.classList.remove('over');
 });
 document.addEventListener('drop',e=>{
  const zone=e.target.closest?.('[data-bone-category]');if(!zone)return;
  e.preventDefault();const id=e.dataTransfer.getData('text/plain')||dragId;
  if(current().causes.some(x=>x.id===id))change(c=>{const item=c.causes.find(x=>x.id===id);item.category=zone.dataset.boneCategory});
  dragId='';
 });
 document.addEventListener('dragend',()=>{$$('.bone-group.over').forEach(x=>x.classList.remove('over'));dragId=''});
}
loadLibrary();bind();persist();render();
