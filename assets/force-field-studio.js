import {VERSION,MAX,SIDES,COLORS,uid,copy,escapeHTML as esc,bound,whole,createProject,addForce,updateForce,removeForce,addScenario,scenarioFor,setScenarioShift,calculateBalance,addAction,addTeam,scoreTeam,teamRanking,counts,normalizeProject,exampleProject,today} from './force-field-model.js';
import {colorFor,renderDiagram,sidebarHTML,scenarioControlsHTML,actionsHTML,teamsHTML,optionHTML,reportHTML} from './force-field-render.js';
const $=q=>document.querySelector(q),$$=q=>Array.from(document.querySelectorAll(q));
const KEY='mayne.force-field-studio.v1',STAKES='mayne.stakeholder-mapping.v1';
const META={board:['STEP 01 / FORCE ANALYSIS','Visual Force Field Board','Pull in driving and restraining forces, then adjust their relative intensity.'],
 scenarios:['STEP 02 / TEST ASSUMPTIONS','What-If Scenario Lab','Experiment with force strength changes without overwriting the baseline.'],
 actions:['STEP 03 / DESIGN INTERVENTIONS','Change Action Planner','Build testable actions with owners, deadlines, evidence and measures.'],
 challenge:['STEP 04 / FACILITATE','Change Strategy Challenge','Compare team recommendations with a transparent instructor-rated rubric.']};
const PROMPTS=['Which restraining force could you reduce instead of only adding more pressure?','What evidence would contradict your strongest assumption?','Which stakeholder is most affected but least consulted?','Could strengthening a driving force increase resistance elsewhere?','What is within your team’s influence, and what is outside it?','Which intervention could be tested on a small scale first?','What unintended consequences could follow your proposed action?','How would you know the change is working after 30 days?'];
const state={projects:[],projectId:'',selected:'',view:'board',history:[],future:[],editBefore:null,drag:null,editing:null,stakeholderNames:[],timer:{seconds:900,running:false,until:0,interval:0}};
let toastTimer,questionIndex=0,dropHint=false;
function project(){return state.projects.find(x=>x.id===state.projectId)||state.projects[0];}
function force(){return project().forces.find(x=>x.id===state.selected);}
function activeScenario(){return scenarioFor(project());}
function notify(message){const el=$('#toast');el.textContent=message;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),3200);}
function load(){
 try{
  const raw=JSON.parse(localStorage.getItem(KEY)||'null');
  if(raw&&Array.isArray(raw.projects)&&raw.projects.length){
   const list=raw.projects.slice(0,MAX.projects).map(p=>normalizeProject(p));
   state.projects=list;state.projectId=list.find(p=>p.id===raw.projectId)?.id||list[0].id;return;
  }
 }catch(error){console.warn('Force Field Studio could not restore saved projects:',error);}
 const initial=createProject();state.projects=[initial];state.projectId=initial.id;
}
function persist(){
 project().updated=new Date().toISOString();
 try{localStorage.setItem(KEY,JSON.stringify({version:VERSION,projects:state.projects,projectId:state.projectId}));
  $('#save-status').textContent='✓ Saved on this device';$('#save-status').classList.remove('error');return true;
 }catch(error){$('#save-status').textContent='⚠ Save failed — export a backup';$('#save-status').classList.add('error');notify('Your browser cannot save this project. Export a backup.');return false;}
}
function updateHistoryButtons(){$('#undo').disabled=!state.history.length;$('#redo').disabled=!state.future.length;}
function remember(before){state.history.push(before);if(state.history.length>65)state.history.shift();state.future=[];updateHistoryButtons();}
function flushEdit(){
 if(!state.editBefore)return;
 const before=state.editBefore;state.editBefore=null;
 if(JSON.stringify(before)!==JSON.stringify(project())){remember(before);persist();}
}
function change(fn){
 flushEdit();const current=project(),before=copy(current);
 try{fn(current)}catch(error){state.projects[state.projects.indexOf(current)]=before;notify(error.message);render();return false;}
 remember(before);persist();render();return true;
}
function undo(){
 flushEdit();if(!state.history.length)return;
 const c=project(),index=state.projects.indexOf(c),before=state.history.pop();state.future.push(copy(c));
 state.projects[index]=before;if(!before.forces.some(f=>f.id===state.selected))state.selected='';
 persist();render();
}
function redo(){
 flushEdit();if(!state.future.length)return;
 const c=project(),index=state.projects.indexOf(c),next=state.future.pop();state.history.push(copy(c));
 state.projects[index]=next;if(!next.forces.some(f=>f.id===state.selected))state.selected='';
 persist();render();
}
function newProject(p=createProject()){
 if(state.projects.length>=MAX.projects){notify('Project library limit reached. Export or delete another project.');return;}
 flushEdit();state.projects.unshift(p);state.projectId=p.id;state.selected='';state.history=[];state.future=[];state.view='board';
 stopTimer();state.timer.seconds=p.exercise.duration;persist();render();closeDialog('#library-dialog');notify('New force field project created.');
}
function selectProject(id){
 if(!state.projects.some(p=>p.id===id))return;
 flushEdit();state.projectId=id;state.selected='';state.history=[];state.future=[];state.view='board';
 stopTimer();state.timer.seconds=project().exercise.duration;persist();render();closeDialog('#library-dialog');
}
function deleteProject(id){
 const target=state.projects.find(x=>x.id===id);
 if(!target||!confirm('Permanently delete "'+target.title+'" and all analysis?'))return;
 state.projects=state.projects.filter(x=>x.id!==id);if(!state.projects.length)state.projects=[createProject()];
 if(state.projectId===id)state.projectId=state.projects[0].id;
 state.selected='';state.history=[];state.future=[];state.view='board';persist();render();renderLibrary();
}
function renderHeader(){
 const p=project(),a=counts(p);$('#project-title').value=p.title;
 $('#hero-stats').innerHTML=[['Driving',a.driving],['Restraining',a.restraining],['Interventions',a.actions]].map(([name,value])=>'<div><strong>'+value+'</strong><small>'+name+'</small></div>').join('');
 $('#force-count').textContent=p.forces.length;
}
function renderSidebar(){
 const p=project();
 for(const [id,key] of [['change-name','change'],['change-goal','goal'],['change-context','context'],['change-owner','owner'],['review-date','reviewDate']])$('#'+id).value=p[key]||'';
 $('#force-list').innerHTML=sidebarHTML(p,state.selected,$('#force-search').value);
}
function setSVG(){
 const host=$('#board-svg-host');
 host.innerHTML=renderDiagram(project(),state.selected,activeScenario());
}
function updateBalance(){
 const b=calculateBalance(project(),activeScenario());
 $('#driving-total').textContent=b.driving;$('#restraining-total').textContent=b.restraining;
 $('#balance-verdict').textContent=project().forces.length?b.verdict:'Add forces to begin';
 $('#balance-explain').textContent='Net change pressure: '+(b.net>0?'+':'')+b.net+' points · '+b.drivingCount+' driving / '+b.restrainingCount+' restraining';
 // Positive net shifts toward the left half, where the driving strength is indicated.
 $('#gauge-pointer').style.left=(100-b.position)+'%';
}
function renderSignals(){
 const p=project(),missing=p.forces.filter(f=>!f.evidence.trim()).length,notes=[];
 if(!p.change.trim())notes.push('Describe the change before interpreting the balance.');
 if(missing)notes.push(missing+' force rating(s) have no supporting evidence recorded.');
 if(p.forces.length&&!p.actions.length)notes.push('Consider an intervention that reduces a significant barrier.');
 if(p.forces.some(f=>!f.stakeholder))notes.push('Link forces to stakeholders to uncover affected interests.');
 $('#signal-list').innerHTML=notes.slice(0,4).map(x=>'<div class="signal">'+esc(x)+'</div>').join('');
}
function renderInspector(){
 const f=force();$('#inspector').hidden=!f;$('#inspector-empty').hidden=!!f;
 if(!f)return;
 for(const [id,key] of [['edit-force-label','label'],['edit-side','side'],['edit-group','group'],['edit-strength','strength'],
 ['edit-confidence','confidence'],['edit-stakeholder','stakeholder'],['edit-interest','stakeholderInterest'],['edit-evidence','evidence'],['edit-notes','notes']])$('#'+id).value=f[key]??'';
 $('#strength-value').textContent=f.strength+' / 5';
 $('#color-palette').innerHTML=COLORS.map(c=>'<button type="button" data-color="'+c.id+'" style="--color:'+c.border+'" title="'+c.id+'" aria-label="'+c.id+' force color" aria-pressed="'+(c.id===f.color)+'" class="'+(c.id===f.color?'active':'')+'"></button>').join('');
}
function renderLibrary(){
 $('#library-items').innerHTML=state.projects.map(p=>'<div class="library-item"><div><strong>'+esc(p.title)+'</strong><small>'+p.forces.length+' forces · '+p.actions.length+' actions · Updated '+esc((p.updated||'').slice(0,10))+'</small></div>'+
  '<button type="button" data-open-project="'+esc(p.id)+'">'+(p.id===state.projectId?'Current':'Open')+'</button>'+
  '<button type="button" data-copy-project="'+esc(p.id)+'">Copy</button>'+
  '<button type="button" data-delete-project="'+esc(p.id)+'" class="danger" aria-label="Delete project">×</button></div>').join('');
}
function renderScenarios(){
 const p=project(),sc=activeScenario(),baseline=calculateBalance(p),current=calculateBalance(p,sc);
 $('#scenario-picker').innerHTML='<option value="">Baseline — original assessment</option>'+p.scenarios.map(s=>optionHTML(s.id,s.title,p.activeScenario)).join('');
 $('#scenario-picker').value=sc?.id||'';
 $('#delete-scenario').disabled=!sc;
 $('#scenario-editor').hidden=!sc;
 if(sc){
  $('#scenario-title').value=sc.title;$('#scenario-description').value=sc.description;
  $('#scenario-force-controls').innerHTML=scenarioControlsHTML(p,sc);
 }
 $('#baseline-net').textContent=(baseline.net>0?'+':'')+baseline.net;$('#baseline-label').textContent=baseline.verdict;
 $('#scenario-net').textContent=(current.net>0?'+':'')+current.net;$('#scenario-label').textContent=current.verdict;
 const delta=current.net-baseline.net;
 $('#scenario-interpretation').textContent=sc?'Compared with baseline, the net force rating '+(delta===0?'is unchanged.':delta>0?'increases by '+delta+' points.':'decreases by '+Math.abs(delta)+' points.'):'Select or create a what-if scenario to experiment with the force strengths.';
}
function renderActions(){
 const p=project();$('#action-count').textContent=p.actions.filter(a=>a.status==='Completed').length+' / '+p.actions.length+' completed';
 $('#action-list').innerHTML=actionsHTML(p);
}
function showTime(){
 const n=Math.max(0,Math.floor(state.timer.seconds));$('#timer-display').textContent=String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');
 $('#timer-status').textContent=state.timer.running?'Challenge in progress':n===0?'Time expired':'Paused / ready';
 $('#timer-start').disabled=state.timer.running;
}
function stopTimer(){
 if(state.timer.interval){clearInterval(state.timer.interval);state.timer.interval=0;}
 if(state.timer.running)state.timer.seconds=Math.max(0,Math.ceil((state.timer.until-Date.now())/1000));
 state.timer.running=false;
}
function resetTimer(){stopTimer();state.timer.seconds=project().exercise.duration;showTime();}
function startTimer(){
 if(state.timer.running)return;
 if(state.timer.seconds<=0)state.timer.seconds=project().exercise.duration;
 state.timer.until=Date.now()+state.timer.seconds*1000;state.timer.running=true;
 state.timer.interval=setInterval(()=>{
  state.timer.seconds=Math.max(0,Math.ceil((state.timer.until-Date.now())/1000));
  if(state.timer.seconds===0){stopTimer();notify('Challenge round complete. Review team responses.');}
  showTime();
 },250);showTime();
}
function renderChallenge(){
 const p=project();$('#challenge-title').value=p.exercise.title;
 $('#challenge-instructions').value=p.exercise.instructions;$('#challenge-duration').value=p.exercise.duration/60;
 $('#team-list').innerHTML=teamsHTML(p);showTime();
}
function render(){
 renderHeader();renderSidebar();
 $$('[data-view]').forEach(b=>{const current=b.dataset.view===state.view;b.classList.toggle('active',current);b.setAttribute('aria-current',current?'page':'false');});
 for(const k of Object.keys(META))$('#view-'+k).hidden=k!==state.view;
 const d=META[state.view];$('#view-eyebrow').textContent=d[0];$('#view-title').textContent=d[1];$('#view-subtitle').textContent=d[2];
 $('#view-nav').innerHTML=state.view==='board'?'<button type="button" data-go="scenarios">What-if lab →</button>':
 state.view==='scenarios'?'<button type="button" data-go="actions">Plan interventions →</button>':
 state.view==='actions'?'<button type="button" data-go="challenge">Classroom exercise →</button>':'';
 setSVG();updateBalance();renderSignals();renderInspector();renderScenarios();renderActions();renderChallenge();updateHistoryButtons();
}
function setView(view){if(!META[view])return;flushEdit();state.view=view;render();}
function selectForce(id){
 if(!project().forces.some(f=>f.id===id))return;
 flushEdit();state.selected=id;setSVG();renderInspector();$('#force-list').innerHTML=sidebarHTML(project(),id,$('#force-search').value);
}
function addNewForce(side,label,strength=3,y=null){
 const existing=project().forces.filter(f=>f.side===side).length;let entry=null;
 const success=change(p=>{entry=addForce(p,side,label,{strength,y:y??(17+(existing%4)*21)})});
 if(success){state.selected=entry.id;render();notify('Force added. Drag its arrow grip to adjust intensity.');}
}
function updateInPlace(key,value){
 const f=force();if(!f)return;
 if(!state.editBefore)state.editBefore=copy(project());
 updateForce(project(),f.id,{[key]:value});
 if(key==='label'||key==='strength'||key==='group'){setSVG();updateBalance();}
 if(key==='strength')$('#strength-value').textContent=f.strength+' / 5';
 if(key==='label'||key==='group')$('#force-list').innerHTML=sidebarHTML(project(),state.selected,$('#force-search').value);
}
function svgCoord(svg,event){
 const transform=svg.getScreenCTM?.();
 if(transform?.inverse&&svg.createSVGPoint){
  const p=svg.createSVGPoint();p.x=event.clientX;p.y=event.clientY;
  const next=p.matrixTransform(transform.inverse());return {x:next.x,y:next.y};
 }
 const r=svg.getBoundingClientRect();if(!r.width||!r.height)return {x:600,y:340};
 const scale=Math.min(r.width/1200,r.height/680);const xOffset=(r.width-1200*scale)/2,yOffset=(r.height-680*scale)/2;
 return {x:(event.clientX-r.left-xOffset)/scale,y:(event.clientY-r.top-yOffset)/scale};
}
function onPointerDown(event){
 if(event.button!==0)return;
 const handle=event.target.closest('[data-strength-handle]'),node=event.target.closest('[data-force]');
 if(!node)return;
 const id=handle?.dataset.strengthHandle||node.dataset.force;
 const current=project().forces.find(f=>f.id===id);if(!current)return;
 if(state.selected!==id)selectForce(id);
 const svg=$('#force-svg');
 state.drag={id,type:handle?'strength':'move',before:copy(project()),initial:{...current},start:svgCoord(svg,event),moved:false};
 try{$('#board-svg-host').setPointerCapture?.(event.pointerId)}catch{}
 event.preventDefault();
}
function onPointerMove(event){
 const drag=state.drag;if(!drag)return;
 const current=project().forces.find(f=>f.id===drag.id),svg=$('#force-svg');if(!current||!svg)return;
 const now=svgCoord(svg,event),dx=now.x-drag.start.x,dy=now.y-drag.start.y;
 if(!drag.moved&&Math.abs(dx)+Math.abs(dy)<5)return;
 drag.moved=true;
 const side=drag.type==='move'&&Math.abs(dx)>300?(now.x<600?'driving':'restraining'):drag.initial.side;
 const sign=side==='driving'?1:-1;
 const newStrength=whole(drag.initial.strength+sign*dx/26,1,5,drag.initial.strength);
 const newY=drag.type==='move'?bound(drag.initial.y+dy/4.8,10,90,drag.initial.y):drag.initial.y;
 updateForce(project(),current.id,{side,strength:newStrength,y:newY});
 setSVG();updateBalance();$('#edit-strength').value=current.strength;$('#strength-value').textContent=current.strength+' / 5';
}
function onPointerEnd(event,cancel=false){
 if(!state.drag)return;const drag=state.drag;state.drag=null;
 try{if($('#board-svg-host').hasPointerCapture?.(event.pointerId))$('#board-svg-host').releasePointerCapture(event.pointerId)}catch{}
 if(cancel){state.projects[state.projects.indexOf(project())]=drag.before;render();return;}
 if(drag.moved&&JSON.stringify(drag.before)!==JSON.stringify(project())){
  remember(drag.before);persist();render();notify('Force position and intensity updated.');
 }else{setSVG();renderInspector();}
}
function drop(event){
 event.preventDefault();$('#force-board').classList.remove('drag-over');
 const raw=event.dataTransfer?.getData('application/x-mayne-force');if(!raw)return;
 let payload;try{payload=JSON.parse(raw)}catch{return;}
 const svg=$('#force-svg'),coord=svgCoord(svg,event),side=coord.x<600?'driving':'restraining',y=bound((coord.y-112)/4.8,10,90,50);
 if(payload.kind==='existing'){
  const id=payload.id,f=project().forces.find(f=>f.id===id);if(!f)return;
  state.selected=id;change(p=>updateForce(p,id,{side,y}));notify('Force moved to '+SIDES[side]+' side.');
 }else if(payload.kind==='new'){addNewForce(side,String(payload.label||'New force').slice(0,160),3,y);}
}
function addDragged(event){
 if(!event.dataTransfer)return;
 const s=event.target.closest('[data-starter-side]'),f=event.target.closest('[data-force-row]');
 if(!s&&!f)return;
 const data=f?{kind:'existing',id:f.dataset.forceRow}:{kind:'new',label:s.dataset.starterLabel,side:s.dataset.starterSide};
 event.dataTransfer.effectAllowed='copyMove';
 event.dataTransfer.setData('application/x-mayne-force',JSON.stringify(data));event.dataTransfer.setData('text/plain',data.label||'Force');
}
const field=(label,key,value,type='text',options=[],max=800)=>{
 const control=type==='textarea'?'<textarea name="'+key+'" maxlength="'+max+'" rows="3">'+esc(value??'')+'</textarea>':
 type==='select'?'<select name="'+key+'">'+options.map(x=>optionHTML(x,x,value)).join('')+'</select>':
 '<input name="'+key+'" type="'+type+'" '+(type==='date'?'':'maxlength="'+max+'"')+' value="'+esc(value??'')+'">';
 return '<label>'+esc(label)+control+'</label>';
};
function editAction(id=''){
 const a=project().actions.find(x=>x.id===id);state.editing={kind:'action',id};
 $('#editor-heading').textContent=id?'Edit intervention':'Design an intervention';
 $('#editor-kicker').textContent='CHANGE ACTION';
 $('#editor-fields').innerHTML=field('Action or intervention','title',a?.title||'','textarea',[],200)+
 '<label>Force this addresses<select name="forceId"><option value="">General change action</option>'+project().forces.map(f=>optionHTML(f.id,(f.side==='driving'?'＋ ':'− ')+f.label,a?.forceId||state.selected)).join('')+'</select></label>'+
 field('Intervention method','method',a?.method||'Investigate','select',['Reduce resistance','Strengthen support','Investigate','Communicate','Other'])+
 '<div class="editor-row">'+field('Responsible owner','owner',a?.owner||'')+field('Target date','due',a?.due||'','date')+'</div>'+
 field('Success measure','metric',a?.metric||'')+
 '<div class="editor-row">'+field('Current baseline','baseline',a?.baseline||'')+field('Desired target','target',a?.target||'')+'</div>'+
 field('Supporting evidence / rationale','evidence',a?.evidence||'','textarea',[],800)+
 field('Possible trade-offs or risks','risk',a?.risk||'','textarea',[],800)+
 field('Observed results and follow-up','result',a?.result||'','textarea',[],800)+
 field('Current status','status',a?.status||'Planned','select',['Planned','In progress','Completed','Paused']);
 showDialog('#editor-dialog');
}
function editTeam(id=''){
 const team=project().teams.find(x=>x.id===id);state.editing={kind:'team',id};
 $('#editor-kicker').textContent='CLASSROOM CHALLENGE';$('#editor-heading').textContent=id?'Edit team proposal':'Add a classroom team';
 $('#editor-fields').innerHTML=field('Team name','name',team?.name||'')+
 field('Proposed changes to the forces','proposal',team?.proposal||'','textarea',[],1600)+
 field('Evidence and reasoning','evidence',team?.evidence||'','textarea',[],1000)+
 field('Trade-offs and stakeholder impacts','tradeoffs',team?.tradeoffs||'','textarea',[],1000);
 showDialog('#editor-dialog');
}
function saveEditor(){
 if(!state.editing)return;
 const {kind,id}=state.editing,form=new FormData($('#editor-form'));
 const get=(key,max=1500)=>String(form.get(key)||'').slice(0,max);
 if(kind==='action'){
  if(!get('title',200).trim()){notify('Describe the intervention before saving.');return}
  const row={title:get('title',200),forceId:get('forceId',120),method:get('method',40),owner:get('owner',110),due:get('due',10),metric:get('metric',210),
   baseline:get('baseline',100),target:get('target',100),evidence:get('evidence',800),risk:get('risk',800),result:get('result',800),status:get('status',30)};
  const success=change(p=>{
   if(id){Object.assign(p.actions.find(a=>a.id===id),row)}else addAction(p,row);
  });
  if(success){state.editing=null;closeDialog('#editor-dialog');notify('Intervention saved.');}
 }else if(kind==='team'){
  if(!get('name',85).trim()){notify('Enter a team name.');return}
  const data={name:get('name',85),proposal:get('proposal',1600),evidence:get('evidence',1000),tradeoffs:get('tradeoffs',1000)};
  const success=change(p=>{
   if(id){Object.assign(p.teams.find(t=>t.id===id),data)}else addTeam(p,data);
  });
  if(success){state.editing=null;closeDialog('#editor-dialog');notify('Classroom proposal saved.');}
 }
}
function showDialog(selector){const dialog=$(selector);if(dialog&&!dialog.open)dialog.showModal()}
function closeDialog(selector){const dialog=$(selector);if(dialog?.open)dialog.close()}
function csv(rows){return '\ufeff'+rows.map(r=>r.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(',')).join('\r\n')}
function download(blobOrText,name,type){
 const blob=blobOrText instanceof Blob?blobOrText:new Blob([blobOrText],{type}),url=URL.createObjectURL(blob),link=document.createElement('a');
 link.href=url;link.download=name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1600);
}
const stem=()=>project().title.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,58)||'force-field';
function exportForces(){
 const rows=[['Side','Force','Base strength','Stakeholder','Stakeholder interest','Group','Confidence','Evidence','Assumptions','Color'],
 ...project().forces.map(f=>[f.side,f.label,f.strength,f.stakeholder,f.stakeholderInterest,f.group,f.confidence,f.evidence,f.notes,f.color])];
 download(csv(rows),stem()+'-forces.csv','text/csv;charset=utf-8');
}
function exportActions(){
 const p=project(),rows=[['Intervention','Method','Force','Owner','Due','Measure','Baseline','Target','Evidence','Risks','Result','Status'],
 ...p.actions.map(a=>[a.title,a.method,p.forces.find(f=>f.id===a.forceId)?.label||'',a.owner,a.due,a.metric,a.baseline,a.target,a.evidence,a.risk,a.result,a.status])];
 download(csv(rows),stem()+'-actions.csv','text/csv;charset=utf-8');
}
function exportTeams(){
 const rows=[['Team','Proposal','Evidence','Trade-offs','Impact /5','Feasibility /5','Evidence /5','Stakeholder awareness /5','Total /20'],
 ...teamRanking(project()).map(t=>[t.name,t.proposal,t.evidence,t.tradeoffs,t.scores.impact,t.scores.feasibility,t.scores.evidence,t.scores.stakeholder,t.rating.total])];
 download(csv(rows),stem()+'-teams.csv','text/csv;charset=utf-8');
}
function exportJSON(){download(JSON.stringify({kind:'mayne-force-field',version:VERSION,project:project()},null,2),stem()+'.force-field.json','application/json')}
function exportSVG(){
 download('<?xml version="1.0" encoding="UTF-8"?>\n'+renderDiagram(project(),'',activeScenario(),{exportMode:true}),stem()+'-diagram.svg','image/svg+xml;charset=utf-8');
}
async function exportPNG(){
 const xml=renderDiagram(project(),'',activeScenario(),{exportMode:true}),url=URL.createObjectURL(new Blob([xml],{type:'image/svg+xml;charset=utf-8'}));
 try{
  const image=new Image();await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(Error('Cannot render vector diagram.'));image.src=url;});
  const canvas=document.createElement('canvas');canvas.width=2400;canvas.height=1360;
  const context=canvas.getContext('2d');if(!context)throw Error('Canvas export is unavailable.');
  context.fillStyle='#fff';context.fillRect(0,0,2400,1360);context.drawImage(image,0,0,2400,1360);
  const blob=await new Promise(res=>canvas.toBlob(res,'image/png'));if(!blob)throw Error('PNG could not be encoded.');
  download(blob,stem()+'-diagram.png','image/png');notify('High-resolution PNG saved.');
 }catch(error){notify('PNG export failed: '+error.message)}finally{URL.revokeObjectURL(url)}
}
function printReport(){$('#print-area').innerHTML=reportHTML(project());window.print();}
function doExport(kind){closeDialog('#export-dialog');
 if(kind==='forces')exportForces();if(kind==='actions')exportActions();if(kind==='teams')exportTeams();
 if(kind==='json')exportJSON();if(kind==='svg')exportSVG();if(kind==='png')exportPNG();if(kind==='report')printReport();
}
async function importProject(file){
 if(!file)return;if(file.size>3000000){notify('Import is larger than 3 MB.');return;}
 try{
  const raw=JSON.parse(await file.text()),p=normalizeProject(raw.kind==='mayne-force-field'?raw.project:raw,{regenerate:true});
  if(!confirm('Import "'+p.title+'" as a new editable project?'))return;
  newProject(p);notify('Force field backup restored.');
 }catch(error){notify('Import failed: '+error.message);}
}
function importStakeholders(){
 try{
  const raw=JSON.parse(localStorage.getItem(STAKES)||'null');
  const p=raw?.maps?.find(m=>m.id===raw.id)||raw?.maps?.[0];
  const names=[...new Set((p?.nodes||[]).slice(0,130).map(x=>String(x.label||'').slice(0,120)).filter(Boolean))];
  state.stakeholderNames=names;
  $('#stakeholder-suggestions').innerHTML=names.map(n=>'<option value="'+esc(n)+'"></option>').join('');
  $('#stakeholder-import-status').textContent=names.length?names.length+' stakeholder names available from Mapping Studio.':'No stakeholder map was found on this device. You can still enter names manually.';
  return names.length;
 }catch(error){$('#stakeholder-import-status').textContent='No compatible stakeholder map could be read.';return 0}
}
function handleClick(event){
 const target=event.target;
 const close=target.closest('[data-close]');if(close){closeDialog('#'+close.dataset.close);return;}
 const tab=target.closest('[data-view]'),nav=target.closest('[data-go]');if(tab||nav){setView(tab?.dataset.view||nav.dataset.go);return;}
 const starter=target.closest('[data-starter-side]');if(starter){addNewForce(starter.dataset.starterSide,starter.dataset.starterLabel);return;}
 const select=target.closest('[data-select-force]');if(select){selectForce(select.dataset.selectForce);setView('board');return;}
 const glyph=target.closest('[data-force]');if(glyph&&!state.drag){selectForce(glyph.dataset.force);return;}
 const color=target.closest('[data-color]');if(color&&force()){change(p=>updateForce(p,state.selected,{color:color.dataset.color}));return;}
 const example=target.closest('[data-example]');if(example){try{newProject(exampleProject(example.dataset.example))}catch(error){notify(error.message)}return;}
 const actCreate=target.closest('[data-create-action]');if(actCreate){editAction();return;}
 const actEdit=target.closest('[data-edit-action]');if(actEdit){editAction(actEdit.dataset.editAction);return;}
 const actDelete=target.closest('[data-delete-action]');if(actDelete){const a=project().actions.find(x=>x.id===actDelete.dataset.deleteAction);
  if(a&&confirm('Delete intervention "'+a.title+'"?'))change(p=>p.actions=p.actions.filter(x=>x.id!==a.id));return;}
 const teamEdit=target.closest('[data-edit-team]');if(teamEdit){editTeam(teamEdit.dataset.editTeam);return;}
 const teamDelete=target.closest('[data-delete-team]');if(teamDelete){const t=project().teams.find(x=>x.id===teamDelete.dataset.deleteTeam);
  if(t&&confirm('Delete proposal from "'+t.name+'"?'))change(p=>p.teams=p.teams.filter(x=>x.id!==t.id));return;}
 const open=target.closest('[data-open-project]');if(open){selectProject(open.dataset.openProject);return;}
 const clone=target.closest('[data-copy-project]');if(clone){const p=state.projects.find(x=>x.id===clone.dataset.copyProject);
  if(p){const copyProject=normalizeProject(p,{regenerate:true});copyProject.title+=' (copy)';newProject(copyProject)}return;}
 const deleteButton=target.closest('[data-delete-project]');if(deleteButton){deleteProject(deleteButton.dataset.deleteProject);return;}
 const exportButton=target.closest('[data-export]');if(exportButton){doExport(exportButton.dataset.export);return;}
}
function bind(){
 $('#new-project').onclick=()=>newProject();$('#open-library').onclick=()=>{renderLibrary();showDialog('#library-dialog')};
 $('#library-new').onclick=()=>newProject();$('#import-project').onclick=()=>$('#project-file').click();
 $('#project-file').onchange=event=>{importProject(event.target.files?.[0]);event.target.value=''};
 $('#export-menu').onclick=()=>showDialog('#export-dialog');
 $('#undo').onclick=undo;$('#redo').onclick=redo;
 $('#project-title').onchange=event=>change(p=>p.title=event.target.value.slice(0,130).trim()||'Untitled change initiative');
 for(const [id,key] of [['change-name','change'],['change-goal','goal'],['change-context','context'],['change-owner','owner'],['review-date','reviewDate']]){
  $('#'+id).onchange=event=>change(p=>p[key]=event.target.value.slice(0,key==='context'?2400:1300));
 }
 $('#quick-add-button').onclick=()=>{
  const label=$('#quick-label').value.trim();if(!label){notify('Describe the force before adding it.');$('#quick-label').focus();return;}
  addNewForce($('#quick-side').value,label,Number($('#quick-strength').value));$('#quick-label').value='';
 };
 $('#quick-label').onkeydown=event=>{if(event.key==='Enter'&&(event.ctrlKey||event.metaKey)){event.preventDefault();$('#quick-add-button').click()}};
 $('#force-search').oninput=()=>{$('#force-list').innerHTML=sidebarHTML(project(),state.selected,$('#force-search').value)};
 $('#auto-layout').onclick=()=>{
  change(p=>{for(const side of Object.keys(SIDES)){
   const values=p.forces.filter(f=>f.side===side);
   values.forEach((f,i)=>f.y=bound(12+(i+.5)*76/Math.max(1,values.length),10,90,45));
  }});notify('Force labels organized into lanes.');
 };
 $('#board-to-scenarios').onclick=()=>setView('scenarios');
 for(const [id,key] of [['edit-force-label','label'],['edit-group','group'],['edit-strength','strength'],['edit-stakeholder','stakeholder'],
 ['edit-interest','stakeholderInterest'],['edit-evidence','evidence'],['edit-notes','notes']]){
  const el=$('#'+id);
  el.addEventListener('focus',()=>{if(force()&&!state.editBefore)state.editBefore=copy(project())});
  el.addEventListener('input',event=>updateInPlace(key,event.target.value));
  el.addEventListener('change',flushEdit);
 }
 $('#edit-side').onchange=event=>change(p=>updateForce(p,state.selected,{side:event.target.value}));
 $('#edit-confidence').onchange=event=>change(p=>updateForce(p,state.selected,{confidence:Number(event.target.value)}));
 $('#duplicate-force').onclick=()=>{
  const f=force();if(!f)return;let newId='';
  const success=change(p=>{const n=addForce(p,f.side,f.label+' (copy)',{...f,y:bound(f.y+9,10,90,f.y)});newId=n.id});
  if(success){state.selected=newId;render();}
 };
 $('#delete-force').onclick=()=>{const f=force();if(!f||!confirm('Delete "'+f.label+'"? Any linked actions become unassigned.'))return;
  change(p=>removeForce(p,f.id));state.selected='';render();
 };
 $('#import-stakeholders').onclick=()=>{const amount=importStakeholders();notify(amount?amount+' stakeholder names loaded.':'No compatible stakeholder map found.');};
 $('#next-prompt').onclick=()=>$('#coach-prompt').textContent=PROMPTS[++questionIndex%PROMPTS.length];
 $('#scenario-picker').onchange=event=>change(p=>p.activeScenario=event.target.value);
 $('#new-scenario').onclick=()=>{
  let id='';const success=change(p=>{const s=addScenario(p,'New planning scenario');p.activeScenario=s.id;id=s.id});
  if(success)notify('What-if scenario created. Adjust its forces below.');
 };
 $('#delete-scenario').onclick=()=>{const s=activeScenario();if(!s||!confirm('Delete what-if scenario "'+s.title+'"?'))return;
  change(p=>{p.scenarios=p.scenarios.filter(x=>x.id!==s.id);p.activeScenario=''});
 };
 $('#scenario-title').onchange=event=>change(p=>{const s=scenarioFor(p);if(s)s.title=event.target.value.trim().slice(0,130)||'Unnamed scenario'});
 $('#scenario-description').onchange=event=>change(p=>{const s=scenarioFor(p);if(s)s.description=event.target.value.slice(0,1200)});
 $('#new-action').onclick=()=>editAction();$('#export-actions').onclick=exportActions;
 $('#editor-form').onsubmit=event=>{event.preventDefault();saveEditor();};
 $('#challenge-title').onchange=event=>change(p=>p.exercise.title=event.target.value.slice(0,110));
 $('#challenge-instructions').onchange=event=>change(p=>p.exercise.instructions=event.target.value.slice(0,1200));
 $('#challenge-duration').onchange=event=>{
  const minutes=whole(event.target.value,1,120,15);
  change(p=>p.exercise.duration=minutes*60);resetTimer();
 };
 $('#timer-start').onclick=startTimer;$('#timer-pause').onclick=()=>{stopTimer();showTime();};$('#timer-reset').onclick=resetTimer;
 $('#add-team').onclick=()=>editTeam();
 document.addEventListener('click',handleClick);
 document.addEventListener('change',event=>{
  const target=event.target;
  if(target.dataset.scenarioForce){
   const id=target.dataset.scenarioForce,sc=activeScenario();
   if(sc)change(p=>setScenarioShift(p,sc.id,id,target.value));return;
  }
  if(target.dataset.actionStatus){change(p=>{const a=p.actions.find(x=>x.id===target.dataset.actionStatus);if(a)a.status=target.value});return;}
  if(target.dataset.teamScore){change(p=>{const t=p.teams.find(x=>x.id===target.dataset.teamScore);if(t)t.scores[target.dataset.scoreKey]=whole(target.value,0,5,0)});return;}
 });
 document.addEventListener('input',event=>{
  const target=event.target;if(target.dataset.scenarioForce){
   const sc=activeScenario(),f=project().forces.find(f=>f.id===target.dataset.scenarioForce);if(!sc||!f)return;
   const value=Number(target.value),out=$('[data-shift-value="'+f.id+'"]');if(out)out.textContent=value+'/5'+(value-f.strength?' ('+(value-f.strength>0?'+':'')+(value-f.strength)+')':'');
   // Preview the scenario's balance in real time, but persist only on change.
   const preview={...sc,shifts:{...sc.shifts,[f.id]:value}},result=calculateBalance(project(),preview);
   $('#scenario-net').textContent=(result.net>0?'+':'')+result.net;
   $('#scenario-label').textContent=result.verdict;
  }
 });
 document.addEventListener('dragstart',addDragged);
 $('#force-board').addEventListener('dragover',event=>{event.preventDefault();$('#force-board').classList.add('drag-over')});
 $('#force-board').addEventListener('dragleave',event=>{if(!$('#force-board').contains(event.relatedTarget))$('#force-board').classList.remove('drag-over')});
 $('#force-board').addEventListener('drop',drop);
 $('#board-svg-host').addEventListener('pointerdown',onPointerDown);
 $('#board-svg-host').addEventListener('pointermove',onPointerMove);
 $('#board-svg-host').addEventListener('pointerup',onPointerEnd);
 $('#board-svg-host').addEventListener('pointercancel',event=>onPointerEnd(event,true));
 $('#board-svg-host').addEventListener('lostpointercapture',event=>{if(state.drag)onPointerEnd(event)});
 $('#board-svg-host').addEventListener('dblclick',event=>{const g=event.target.closest?.('[data-force]');if(g){selectForce(g.dataset.force);$('#edit-force-label').focus();$('#edit-force-label').select()}});
 document.addEventListener('keydown',event=>{
  const editable=event.target.closest?.('input,textarea,select,[contenteditable="true"]');
  if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s'){event.preventDefault();flushEdit();persist();notify('Project saved.');return;}
  if(!editable&&(event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'){event.preventDefault();event.shiftKey?redo():undo();return;}
  if(!editable&&(event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='y'){event.preventDefault();redo();return;}
  const g=event.target.closest?.('[data-force]');
  if(g&&!editable&&(event.key==='Enter'||event.key===' ')){event.preventDefault();selectForce(g.dataset.force);$('#edit-force-label').focus();return;}
  if(g&&!editable&&['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.key)){
   event.preventDefault();const f=project().forces.find(x=>x.id===g.dataset.force),step=event.shiftKey?1:4;
   if(f)change(p=>updateForce(p,f.id,{y:f.y+(event.key==='ArrowUp'?-step:event.key==='ArrowDown'?step:0),
     strength:f.strength+(event.key==='ArrowLeft'?(f.side==='driving'?-1:1):event.key==='ArrowRight'?(f.side==='driving'?1:-1):0)}));
  }
 });
 window.addEventListener('blur',()=>{if(state.drag)onPointerEnd({pointerId:-1},true);});
}
load();bind();persist();render();importStakeholders();
