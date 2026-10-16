import {VERSION,MAX,ADKAR,KOTTER,STATUSES,STANCES,RISK_STATUSES,COMM_STATUSES,copy,escapeHTML as e,createProject,normalizeProject,exampleProject,setStage,addGroup,changeGroup,moveGroupQuadrant,addMilestone,makeMilestone,updateMilestone,addCommunication,makeCommunication,addRisk,makeRisk,addAction,makeAction,addPulse,makePulse,removeRecord,importStakeholders,importResistingForces,metrics,dateToday} from './change-studio-model.js';
import {statsHTML,signalsHTML,miniReadinessHTML,dashboardHTML,kotterHTML,adkarHTML,stakeholdersHTML,communicationsHTML,roadmapHTML,risksHTML,outcomesHTML,reportHTML,option} from './change-studio-render.js';

const $=q=>document.querySelector(q),$$=q=>[...document.querySelectorAll(q)];
const KEY='mayne.change-studio.v1',STAKE_KEY='mayne.stakeholder-mapping.v1',FORCE_KEY='mayne.force-field-studio.v1';
const META={dashboard:['CHANGE COMMAND CENTER','Make change visible.','Understand progress, individual readiness, resistance and the next step.'],kotter:['KOTTER’S 8 STEPS','Lead organizational change.','Track eight connected accelerators with owners, evidence and outcomes.'],adkar:['INDIVIDUAL ADOPTION','Diagnose readiness with ADKAR.','Discover gaps in Awareness, Desire, Knowledge, Ability and Reinforcement.'],stakeholders:['STAKEHOLDER ENGAGEMENT','Bring the people with you.','Map influence and impact, listen to concerns and plan respectful engagement.'],communications:['COMMUNICATION STRATEGY','Make the message meaningful.','Connect audiences, channels, timing and feedback loops.'],roadmap:['CHANGE IMPLEMENTATION','Turn your vision into milestones.','Organize delivery actions along a flexible eight-stage roadmap.'],risks:['RESISTANCE & BARRIERS','Address what could derail change.','Score risks, explore concerns and plan responses.'],outcomes:['OUTCOME MEASUREMENT','Observe adoption over time.','Distinguish activity completion from measurable behavior change.']};
const PROMPTS=['What would people need to believe, know and do differently for this change to work?','Who is most affected by this change but has had the least opportunity to shape it?','Are we measuring behavior adoption, or only whether tasks have been completed?','What assumptions about employee readiness have not yet been tested?','Could one person’s legitimate concern reveal a flaw in our change plan?','Which short-term win would establish credibility without creating unintended costs?','How will supervisors reinforce the new behavior three months after launch?','Where is the earliest ADKAR barrier, and what support could address it?'];
const S={projects:[],id:'',view:'dashboard',history:[],future:[],editor:null,question:0};
let toastHandle;
function p(){return S.projects.find(x=>x.id===S.id)||S.projects[0]}
function toast(message){const t=$('#toast');t.textContent=message;t.classList.add('show');clearTimeout(toastHandle);toastHandle=setTimeout(()=>t.classList.remove('show'),3200)}
function load(){try{const raw=JSON.parse(localStorage.getItem(KEY)||'null');if(raw&&Array.isArray(raw.projects)&&raw.projects.length){const items=raw.projects.slice(0,MAX.projects).map(x=>normalizeProject(x));S.projects=items;S.id=items.find(x=>x.id===raw.id)?.id||items[0].id;return}}catch(error){console.warn('Change Management Studio could not load saved projects',error)}const first=createProject();S.projects=[first];S.id=first.id}
function persist(){p().updated=new Date().toISOString();try{localStorage.setItem(KEY,JSON.stringify({version:VERSION,id:S.id,projects:S.projects}));$('#save-status').textContent='✓ Saved on this device';$('#save-status').classList.remove('error');return true}catch(error){$('#save-status').textContent='⚠ Save failed — export a backup';$('#save-status').classList.add('error');toast('Local storage could not save this project. Export a JSON backup.');return false}}
function mutate(fn){const before=copy(p());let result;try{result=fn(p())}catch(error){S.projects[S.projects.findIndex(x=>x.id===S.id)]=before;toast(error.message);render();return false}if(JSON.stringify(before)!==JSON.stringify(p())){S.history.push(before);if(S.history.length>70)S.history.shift();S.future=[];persist()}render();return result===undefined?true:result}
function undo(){if(!S.history.length)return;const current=p(),i=S.projects.indexOf(current),prev=S.history.pop();S.future.push(copy(current));S.projects[i]=prev;persist();render()}
function redo(){if(!S.future.length)return;const current=p(),i=S.projects.indexOf(current),next=S.future.pop();S.history.push(copy(current));S.projects[i]=next;persist();render()}
function startProject(project=createProject()){if(S.projects.length>=MAX.projects){toast('Project library is full. Export or delete another project.');return false}S.projects.unshift(project);S.id=project.id;S.history=[];S.future=[];S.view='dashboard';persist();render();close('#library-dialog');toast('New change project ready.');return true}
function switchProject(id){if(!S.projects.some(x=>x.id===id))return;S.id=id;S.history=[];S.future=[];S.view='dashboard';persist();render();close('#library-dialog')}
function removeProject(id){const item=S.projects.find(x=>x.id===id);if(!item||!confirm('Permanently delete "'+item.title+'" and all its change plans?'))return;S.projects=S.projects.filter(x=>x.id!==id);if(!S.projects.length)S.projects=[createProject()];if(S.id===id)S.id=S.projects[0].id;S.history=[];S.future=[];S.view='dashboard';persist();render();renderLibrary()}
function setView(view){if(!META[view])return;S.view=view;render()}
const renders={dashboard:dashboardHTML,kotter:kotterHTML,adkar:adkarHTML,stakeholders:stakeholdersHTML,communications:communicationsHTML,roadmap:roadmapHTML,risks:risksHTML,outcomes:outcomesHTML};
const profile=[['change-statement','change',1300],['why-change','why',1300],['future-vision','vision',1300],['success-definition','successDefinition',1250],['change-scope','scope',1300],['change-owner','owner',110],['change-sponsor','sponsor',110],['change-start','startDate',10],['change-target','targetDate',10]];
function render(){const pr=p();$('#project-title').value=pr.title;$('#hero-stats').innerHTML=statsHTML(pr);for(const [id,key] of profile)$('#'+id).value=pr[key]||'';$('#signals').innerHTML=signalsHTML(pr);$('#mini-readiness').innerHTML=miniReadinessHTML(pr);$$('[data-view]').forEach(b=>{const current=b.dataset.view===S.view;b.classList.toggle('active',current);b.setAttribute('aria-current',current?'page':'false')});const m=META[S.view];$('#view-kicker').textContent=m[0];$('#view-title').textContent=m[1];$('#view-description').textContent=m[2];const seq=['dashboard','kotter','adkar','stakeholders','communications','roadmap','risks','outcomes'],idx=seq.indexOf(S.view),next=seq[(idx+1)%seq.length];$('#view-actions').innerHTML='<button type="button" data-go="'+next+'">'+(idx===seq.length-1?'Review overview':'Next: '+META[next][0].toLowerCase())+' →</button>';$('#workspace').innerHTML=renders[S.view](pr);$('#undo').disabled=!S.history.length;$('#redo').disabled=!S.future.length}
function renderLibrary(){$('#library-list').innerHTML=S.projects.map(item=>'<div class="library-item"><div><strong>'+e(item.title)+'</strong><small>'+item.groups.length+' groups · '+metrics(item).stageProgress+'% stage progress · '+e((item.updated||'').slice(0,10))+'</small></div><button data-open-project="'+e(item.id)+'" type="button">'+(item.id===S.id?'Current':'Open')+'</button><button data-copy-project="'+e(item.id)+'" type="button">Copy</button><button data-remove-project="'+e(item.id)+'" type="button" class="danger">×</button></div>').join('')}
function show(q){const d=$(q);if(d&&!d.open)d.showModal()}
function close(q){const d=$(q);if(d?.open)d.close()}
const F={
 text:(label,key,val='',max=200)=>'<label>'+e(label)+'<input name="'+key+'" type="text" maxlength="'+max+'" value="'+e(val)+'"></label>',
 textarea:(label,key,val='',max=1000)=>'<label>'+e(label)+'<textarea name="'+key+'" maxlength="'+max+'" rows="3">'+e(val)+'</textarea></label>',
 date:(label,key,val='')=>'<label>'+e(label)+'<input type="date" name="'+key+'" value="'+e(val)+'"></label>',
 select:(label,key,val='',options=[])=>'<label>'+e(label)+'<select name="'+key+'">'+options.map(x=>option(x[0],x[1],val)).join('')+'</select></label>',
 number:(label,key,val=3,min=1,max=5)=>'<label>'+e(label)+'<input name="'+key+'" type="number" min="'+min+'" max="'+max+'" step="1" value="'+e(val)+'"></label>'
};
const rows=(...x)=>'<div class="editor-row">'+x.join('')+'</div>';
const enumItems=a=>a.map(x=>[x,x]);
const groupChoices=()=>[['','All groups'],...p().groups.map(g=>[g.id,g.name])];
const stageChoices=()=>KOTTER.map(s=>[String(s.id),s.id+' · '+s.title]);
function openEditor(kind,id='',stage=''){
 const pr=p(),stageId=kind==='stage'?Number(stage):0;
 const current=(kind==='stage'?pr.stageData[stageId]:pr[kind]?.find(x=>x.id===id))||{};
 S.editor={kind,id,stage:stageId};let body='',title='';
 switch(kind){
  case 'stage':title=KOTTER.find(k=>k.id===stageId)?.title||'Edit Kotter stage';body=
   '<p class="editor-description">'+e(KOTTER.find(k=>k.id===stageId)?.task||'')+'</p>'+
   F.select('Stage progress','status',current.status||'Not started',enumItems(STATUSES))+
   rows(F.text('Accountable owner','owner',current.owner,100),F.date('Target date','due',current.due))+
   F.textarea('Evidence of progress','evidence',current.evidence,1300)+F.textarea('Activities, blockers, next steps','notes',current.notes,1600);break;
  case 'groups':title=id?'Edit stakeholder group':'Add stakeholder group';body=F.text('Stakeholder name','name',current.name,110)+F.text('Role or impact description','role',current.role,120)+
   rows(F.select('Current stance','stance',current.stance||'Neutral',enumItems(STANCES)),F.text('Engagement lead','owner',current.owner,110))+
   rows(F.number('Impact of change (1–5)','impact',current.impact||3),F.number('Influence on change (1–5)','influence',current.influence||3))+
   '<p class="editor-description">Rate ADKAR readiness from 1 (major gap) to 5 (strong readiness), then validate through consultation.</p>'+
   rows(...ADKAR.map(a=>F.number(a.short,'adkar_'+a.key,current.adkar?.[a.key]||3)))+
   F.textarea('Concerns and resistance','concerns',current.concerns,1000)+F.textarea('Engagement plan','engagement',current.engagement,1100)+F.textarea('Evidence and feedback','evidence',current.evidence,1000);break;
  case 'milestones':title=id?'Edit milestone':'Create milestone';body=F.text('Milestone','title',current.title,170)+rows(F.select('Kotter stage','stage',String(current.stage||stage||1),stageChoices()),F.select('Status','status',current.status||'Not started',enumItems(STATUSES)))+
   rows(F.text('Owner','owner',current.owner,110),F.date('Due date','due',current.due))+
   F.textarea('Success measure','measure',current.measure,250)+F.textarea('Observed result','result',current.result,1100)+F.textarea('Notes and blockers','notes',current.notes,1100);break;
  case 'communications':title=id?'Edit communication':'Plan communication';body=F.select('Audience','audienceId',current.audienceId||'',groupChoices())+
   rows(F.text('Channel','channel',current.channel||'Team briefing',90),F.text('Cadence / frequency','frequency',current.frequency,80))+
   F.textarea('Key message and ask','message',current.message,1200)+rows(F.text('Sender / owner','owner',current.owner,110),F.date('Scheduled date','due',current.due))+
   F.select('Delivery status','status',current.status||'Planned',enumItems(COMM_STATUSES))+F.textarea('Feedback and follow-up','result',current.result,750);break;
  case 'risks':title=id?'Edit resistance and risk':'Record resistance or risk';body=F.textarea('Concern or barrier','title',current.title,210)+
   F.select('Affected group','groupId',current.groupId||'',groupChoices())+rows(F.number('Likelihood (1–5)','likelihood',current.likelihood||3),F.number('Impact (1–5)','impact',current.impact||3))+
   F.textarea('Response or mitigation','response',current.response,1250)+rows(F.text('Owner','owner',current.owner,110),F.date('Review date','due',current.due))+
   F.select('Status','status',current.status||'Open',enumItems(RISK_STATUSES))+F.textarea('Evidence','evidence',current.evidence,950);break;
  case 'actions':title=id?'Edit action':'Add delivery action';body=F.textarea('Action to take','title',current.title,210)+
   rows(F.select('Kotter stage','stage',String(current.stage||1),stageChoices()),F.select('Status','status',current.status||'Not started',enumItems(STATUSES)))+
   F.select('Related stakeholder','relatedGroupId',current.relatedGroupId||'',groupChoices())+
   rows(F.text('Owner','owner',current.owner,110),F.date('Due date','due',current.due))+
   F.textarea('Measurable success indicator','successMeasure',current.successMeasure,250)+F.textarea('Results and learning','result',current.result,1000);break;
  case 'pulses':title=id?'Edit measurement':'Record adoption measurement';body=F.date('Measurement date','date',current.date||dateToday())+
   rows(F.number('Adoption (%)','adoption',current.adoption??0,0,100),F.number('Trained (%)','trained',current.trained??0,0,100))+
   F.number('Confidence (%)','confidence',current.confidence??0,0,100)+
   '<p class="editor-description">Record observed percentages and identify data sources. These measures are not automatically collected.</p>'+
   F.textarea('Evidence source and interpretation','notes',current.notes,850);break;
  default:toast('Editor not available.');return;
 }
 $('#editor-heading').textContent=title;$('#editor-kicker').textContent=kind==='stage'?'KOTTER ACCELERATOR':'CHANGE PLANNING';
 $('#editor-body').innerHTML=body;show('#editor-dialog');
}
function saveEditor(){
 const ed=S.editor;if(!ed)return;
 const data=new FormData($('#editor-form')),get=(key,max=1300)=>String(data.get(key)||'').slice(0,max);
 let record;
 if(ed.kind==='stage')record={status:get('status',35),owner:get('owner',100),due:get('due',10),evidence:get('evidence',1300),notes:get('notes',1600)};
 if(ed.kind==='groups')record={name:get('name',110),role:get('role',120),stance:get('stance',30),owner:get('owner',110),impact:get('impact',2),influence:get('influence',2),
  concerns:get('concerns',1000),engagement:get('engagement',1100),evidence:get('evidence',1000),adkar:Object.fromEntries(ADKAR.map(a=>[a.key,get('adkar_'+a.key,2)]))};
 if(ed.kind==='milestones')record={title:get('title',170),stage:get('stage',2),status:get('status',35),owner:get('owner',110),due:get('due',10),measure:get('measure',250),result:get('result',1100),notes:get('notes',1100)};
 if(ed.kind==='communications')record={audienceId:get('audienceId',120),channel:get('channel',90),frequency:get('frequency',80),message:get('message',1200),owner:get('owner',110),due:get('due',10),status:get('status',30),result:get('result',750)};
 if(ed.kind==='risks')record={title:get('title',210),groupId:get('groupId',120),likelihood:get('likelihood',2),impact:get('impact',2),response:get('response',1250),owner:get('owner',110),due:get('due',10),status:get('status',30),evidence:get('evidence',950)};
 if(ed.kind==='actions')record={title:get('title',210),stage:get('stage',2),relatedGroupId:get('relatedGroupId',120),status:get('status',35),owner:get('owner',110),due:get('due',10),successMeasure:get('successMeasure',250),result:get('result',1000)};
 if(ed.kind==='pulses')record={date:get('date',10),adoption:get('adoption',3),trained:get('trained',3),confidence:get('confidence',3),notes:get('notes',850)};
 const required={groups:'name',milestones:'title',communications:'message',risks:'title',actions:'title',pulses:'date'};
 if(ed.kind!=='stage'&&!record[required[ed.kind]]?.trim()){toast('Provide a description or measurement date to continue.');return;}
 const success=mutate(pr=>{
  if(ed.kind==='stage'){setStage(pr,ed.stage,record);return;}
  if(!ed.id){({groups:addGroup,milestones:addMilestone,communications:addCommunication,risks:addRisk,actions:addAction,pulses:addPulse})[ed.kind](pr,record);return;}
  if(ed.kind==='groups'){changeGroup(pr,ed.id,record);return;}
  const old=pr[ed.kind].find(x=>x.id===ed.id);if(!old)throw Error('This record was deleted.');
  const factory=({milestones:makeMilestone,communications:makeCommunication,risks:makeRisk,actions:makeAction,pulses:makePulse})[ed.kind];
  Object.assign(old,factory(record),{id:old.id});
  if(ed.kind==='communications'&&!pr.groups.some(g=>g.id===old.audienceId))old.audienceId='';
  if(ed.kind==='risks'&&!pr.groups.some(g=>g.id===old.groupId))old.groupId='';
  if(ed.kind==='actions'&&!pr.groups.some(g=>g.id===old.relatedGroupId))old.relatedGroupId='';
 });
 if(success!==false){S.editor=null;close('#editor-dialog');toast('Change planning details saved.');}
}
const stem=()=>p().title.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,54)||'change-management';
function download(text,name,type='text/plain;charset=utf-8'){const blob=new Blob([text],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1800);}
const csv=rows=>'\ufeff'+rows.map(row=>row.map(x=>'"'+String(x??'').replace(/"/g,'""')+'"').join(',')).join('\r\n');
function exportFile(kind){
 const pr=p(),group=id=>pr.groups.find(g=>g.id===id)?.name||'',stage=id=>KOTTER.find(k=>k.id===Number(id))?.title||'';
 if(kind==='json'){download(JSON.stringify({kind:'mayne-change-management',version:VERSION,project:pr},null,2),stem()+'.change.json','application/json');return;}
 if(kind==='report'){$('#print-report').innerHTML=reportHTML(pr);window.print();return;}
 let rows=[];
 if(kind==='milestones')rows=[['Kind','Description','Kotter stage','Owner','Due','Status','Measure','Result'],
  ...pr.milestones.map(x=>['Milestone',x.title,stage(x.stage),x.owner,x.due,x.status,x.measure,x.result]),...pr.actions.map(x=>['Action',x.title,stage(x.stage),x.owner,x.due,x.status,x.successMeasure,x.result])];
 if(kind==='stakeholders')rows=[['Stakeholder','Role','Stance','Impact','Influence',...ADKAR.map(a=>a.short),'Concerns','Engagement','Evidence'],
  ...pr.groups.map(g=>[g.name,g.role,g.stance,g.impact,g.influence,...ADKAR.map(a=>g.adkar[a.key]),g.concerns,g.engagement,g.evidence])];
 if(kind==='communications')rows=[['Audience','Channel','Message','Owner','Due','Frequency','Status','Feedback'],
  ...pr.communications.map(x=>[group(x.audienceId),x.channel,x.message,x.owner,x.due,x.frequency,x.status,x.result])];
 if(kind==='risks')rows=[['Risk','Group','Likelihood','Impact','Score','Owner','Due','Response','Status','Evidence'],
  ...pr.risks.map(x=>[x.title,group(x.groupId),x.likelihood,x.impact,x.likelihood*x.impact,x.owner,x.due,x.response,x.status,x.evidence])];
 if(kind==='outcomes')rows=[['Date','Adoption (%)','Training (%)','Confidence (%)','Notes'],...pr.pulses.map(x=>[x.date,x.adoption,x.trained,x.confidence,x.notes])];
 if(rows.length)download(csv(rows),stem()+'-'+kind+'.csv','text/csv;charset=utf-8');
}
async function importFile(file){
 if(!file)return;if(file.size>3000000){toast('Import exceeds the 3 MB limit.');return;}
 try{const raw=JSON.parse(await file.text()),pr=normalizeProject(raw.kind==='mayne-change-management'?raw.project:raw,{regenerate:true});
  if(!confirm('Import "'+pr.title+'" as an editable new project?'))return;startProject(pr);toast('Change project imported.');
 }catch(error){toast('Import failed: '+error.message);}
}
function importExternal(which){
 let raw;try{raw=JSON.parse(localStorage.getItem(which==='stakeholders'?STAKE_KEY:FORCE_KEY)||'null')}catch{raw=null}
 const src=which==='stakeholders'?(raw?.maps?.find(x=>x.id===raw.id)||raw?.maps?.[0]):(raw?.projects?.find(x=>x.id===raw.projectId)||raw?.projects?.[0]);
 const amount=which==='stakeholders'?src?.nodes?.length||0:src?.forces?.filter(x=>x.side==='restraining').length||0;
 if(!amount){const msg=which==='stakeholders'?'No compatible stakeholder project on this device.':'No saved restraining forces found on this device.';$('#import-status').textContent=msg;toast(msg);return;}
 if(!confirm('Import '+amount+' items from "'+(src.name||src.title||'saved project')+'"? Existing items stay and duplicates are skipped.'))return;
 let result;mutate(pr=>{result=which==='stakeholders'?importStakeholders(pr,src):importResistingForces(pr,src)});
 const msg='Added '+result.added+' '+(which==='stakeholders'?'stakeholder(s)':'resistance risk(s)')+', skipped '+result.skipped+'. Review imported assumptions.';
 $('#import-status').textContent=msg;toast(msg);
}
function clickAction(event){
 const t=event.target,closeBtn=t.closest('[data-close]');if(closeBtn){close('#'+closeBtn.dataset.close);return;}
 const tab=t.closest('[data-view]'),go=t.closest('[data-go]');if(tab||go){setView(tab?.dataset.view||go.dataset.go);return;}
 const stage=t.closest('[data-open-stage]');if(stage){S.view='kotter';render();openEditor('stage','',stage.dataset.openStage);return;}
 const editStage=t.closest('[data-edit-stage]');if(editStage){openEditor('stage','',editStage.dataset.editStage);return;}
 const add=t.closest('[data-create]');if(add){openEditor(add.dataset.create);return;}
 const edit=t.closest('[data-edit]');if(edit){openEditor(edit.dataset.edit,edit.dataset.id);return;}
 const del=t.closest('[data-delete]');if(del){const type=del.dataset.delete,id=del.dataset.id;if(!p()[type]?.find(x=>x.id===id)||!confirm('Delete this item?'))return;mutate(pr=>removeRecord(pr,type,id));return;}
 const plus=t.closest('[data-add-stage-milestone]');if(plus){openEditor('milestones','',plus.dataset.addStageMilestone);return;}
 const example=t.closest('[data-example]');if(example){try{startProject(exampleProject(example.dataset.example))}catch(error){toast(error.message)}return;}
 const map=t.closest('[data-map-group]');if(map){openEditor('groups',map.dataset.mapGroup);return;}
 const open=t.closest('[data-open-project]');if(open){switchProject(open.dataset.openProject);return;}
 const dupe=t.closest('[data-copy-project]');if(dupe){const src=S.projects.find(x=>x.id===dupe.dataset.copyProject);if(src){const duplicate=normalizeProject(src,{regenerate:true});duplicate.title+=' (copy)';startProject(duplicate)}return;}
 const remove=t.closest('[data-remove-project]');if(remove){removeProject(remove.dataset.removeProject);return;}
 const exp=t.closest('[data-export]');if(exp){close('#export-dialog');exportFile(exp.dataset.export);}
}
function changeAction(event){
 const t=event.target;
 if(t.dataset.stageStatus){mutate(pr=>setStage(pr,t.dataset.stageStatus,{status:t.value}));return;}
 if(t.dataset.adkarGroup){if(!ADKAR.some(a=>a.key===t.dataset.dimension))return;mutate(pr=>changeGroup(pr,t.dataset.adkarGroup,{adkar:{[t.dataset.dimension]:t.value}}));return;}
 if(t.dataset.stance){mutate(pr=>changeGroup(pr,t.dataset.stance,{stance:t.value}));return;}
 if(t.dataset.communicationStatus){mutate(pr=>{const x=pr.communications.find(x=>x.id===t.dataset.communicationStatus);if(x&&COMM_STATUSES.includes(t.value))x.status=t.value});return;}
 if(t.dataset.riskStatus){mutate(pr=>{const x=pr.risks.find(x=>x.id===t.dataset.riskStatus);if(x&&RISK_STATUSES.includes(t.value))x.status=t.value});return;}
 if(t.dataset.actionStatus){mutate(pr=>{const x=pr.actions.find(x=>x.id===t.dataset.actionStatus);if(x&&STATUSES.includes(t.value))x.status=t.value});}
}
function dragStart(event){
 const g=event.target.closest('[data-map-group]'),m=event.target.closest('[data-drag-milestone]');
 if(!event.dataTransfer||(!g&&!m))return;
 const data=g?{kind:'group',id:g.dataset.mapGroup}:{kind:'milestone',id:m.dataset.dragMilestone};
 event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('application/x-mayne-change',JSON.stringify(data));event.dataTransfer.setData('text/plain',data.kind);
}
function dragOver(event){
 const zone=event.target.closest('[data-group-quadrant],[data-lane]');
 if(!zone)return;event.preventDefault();event.dataTransfer.dropEffect='move';
 $$('.map-quadrant').forEach(x=>x.classList.toggle('over',x===zone));
 $$('.roadmap-lane').forEach(x=>x.classList.toggle('drag-over',x===zone));
}
function drop(event){
 const zone=event.target.closest('[data-group-quadrant],[data-lane]');
 $$('.map-quadrant').forEach(x=>x.classList.remove('over'));$$('.roadmap-lane').forEach(x=>x.classList.remove('drag-over'));
 if(!zone)return;event.preventDefault();
 let payload;try{payload=JSON.parse(event.dataTransfer?.getData('application/x-mayne-change')||'null')}catch{return;}
 if(!payload)return;
 if(zone.dataset.groupQuadrant&&payload.kind==='group'){
  const [hiInfluence,hiImpact]=zone.dataset.groupQuadrant.split('-');
  mutate(pr=>moveGroupQuadrant(pr,payload.id,hiImpact==='high'?4:2,hiInfluence==='high'?4:2));
  toast('Stakeholder map updated. Confirm the classification with evidence.');
 }else if(zone.dataset.lane&&payload.kind==='milestone'){
  mutate(pr=>updateMilestone(pr,payload.id,{stage:Number(zone.dataset.lane)}));toast('Milestone moved to another Kotter stage.');
 }
}
function bind(){
 $('#new-project').onclick=()=>startProject();$('#library-button').onclick=()=>{renderLibrary();show('#library-dialog')};
 $('#library-new').onclick=()=>startProject();$('#import-json').onclick=()=>$('#import-file').click();
 $('#import-file').onchange=event=>{importFile(event.target.files?.[0]);event.target.value=''};
 $('#undo').onclick=undo;$('#redo').onclick=redo;$('#export-button').onclick=()=>show('#export-dialog');
 $('#import-stakeholders').onclick=()=>importExternal('stakeholders');$('#import-force-field').onclick=()=>importExternal('forces');
 $('#coach-next').onclick=()=>$('#coach-question').textContent=PROMPTS[++S.question%PROMPTS.length];
 $('#project-title').onchange=event=>mutate(pr=>pr.title=event.target.value.trim().slice(0,130)||'Untitled change initiative');
 for(const [id,key,n] of profile)$('#'+id).onchange=event=>mutate(pr=>pr[key]=event.target.value.slice(0,n));
 $('#editor-form').onsubmit=event=>{event.preventDefault();saveEditor()};
 document.addEventListener('click',clickAction);document.addEventListener('change',changeAction);
 document.addEventListener('dragstart',dragStart);$('#workspace').addEventListener('dragover',dragOver);$('#workspace').addEventListener('drop',drop);
 document.addEventListener('keydown',event=>{
  const typing=event.target.closest?.('input,textarea,select,[contenteditable="true"]');
  if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s'){event.preventDefault();persist();toast('Project saved.');return;}
  if(!typing&&(event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'){event.preventDefault();event.shiftKey?redo():undo();return;}
  if(!typing&&(event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='y'){event.preventDefault();redo();}
 });
}
load();bind();persist();render();
