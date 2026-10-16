import {VERSION,MAX,QUADRANTS,COLORS,TOWS_TYPES,DEFAULT_WEIGHTS,uid,copy,escapeHTML as esc,clamp,createProject,addFactor,createFactor,repositionFactor,resizeFactor,removeFactor,strategyTypeForFactors,suggestedStrategy,addStrategy,removeStrategy,rankStrategies,scoreStrategy,addAction,addScenario,projectStats,normalizeProject,sampleProject,templateProject,dateToday} from './swot-model.js';
import {colorFor,typeFor,factorHTML,factorListHTML,typePickerHTML,optionHTML,strategyCardsHTML,rankingHTML,scenarioComparisonHTML,actionsHTML,guidanceForProject,diagramSVG,reportHTML} from './swot-render.js';

const $=selector=>document.querySelector(selector),$$=selector=>Array.from(document.querySelectorAll(selector));
const STORAGE='mayne.swot-tows-studio.v1';
const VIEW_META={board:['STEP 01 / VISUAL ANALYSIS','Interactive SWOT Board','Drag, color, resize and organize factors in the four SWOT quadrants.'],tows:['STEP 02 / BUILD STRATEGY','Interactive TOWS Strategy Builder','Connect two factors to generate, evaluate and edit strategic recommendations.'],priorities:['STEP 03 / CHOOSE PRIORITIES','Weighted Strategy Prioritization','Adjust scoring weights to compare strategy options.'],scenarios:['STEP 04 / CHALLENGE ASSUMPTIONS','Scenario Testing Lab','Explore how hypothetical changes affect strategy rankings without changing the baseline.'],actions:['STEP 05 / IMPLEMENT & REVIEW','Strategy Action Planner','Convert decisions into practical steps, owners, deadlines, success measures and check-ins.']};
const QUESTIONS=['What evidence supports this SWOT factor?','Which strength could help overcome a threat?','What weakness would prevent us from capitalizing on an opportunity?','What environmental assumptions could change?','Which stakeholder must support this strategy?','How could your approach fail?','What metric would show the strategy is working?','What low-effort action could test the idea?'];
const state={projects:[],activeId:'',selectedFactor:'',selectedStrategy:'',view:'board',towsType:'SO',towsA:'',towsB:'',draftDirty:false,history:[],future:[],inspectorBefore:null,drag:null,ignoreClick:false};
let toastTimer=null,questionIndex=0;
function project(){return state.projects.find(p=>p.id===state.activeId)||state.projects[0];}
function factor(){return project().factors.find(f=>f.id===state.selectedFactor);}
function currentScenario(){return project().scenarios.find(x=>x.id===project().activeScenario)||null}
function toast(message){const el=$('#toast');el.textContent=message;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),3200);}
function load(){
 try{
  const raw=JSON.parse(localStorage.getItem(STORAGE)||'null');
  if(raw&&Array.isArray(raw.projects)&&raw.projects.length){
   const projects=raw.projects.slice(0,MAX.projects).map(x=>normalizeProject(x));
   state.projects=projects;state.activeId=projects.find(p=>p.id===raw.activeId)?.id||projects[0].id;
   return;
  }
 }catch(error){console.warn('Strategy Studio was unable to load saved projects:',error);}
 const first=createProject();state.projects=[first];state.activeId=first.id;
}
function persist(){
 project().updated=new Date().toISOString();
 try{
  localStorage.setItem(STORAGE,JSON.stringify({version:VERSION,projects:state.projects,activeId:state.activeId}));
  $('#save-status').textContent='✓ Autosaved on this device';$('#save-status').classList.remove('error');
  return true;
 }catch(error){$('#save-status').textContent='⚠ Save failed — export project';$('#save-status').classList.add('error');toast('Local storage may be full. Export a JSON backup.');return false}
}
function refreshHistory(){$('#undo').disabled=!state.history.length;$('#redo').disabled=!state.future.length}
function commitHistory(snapshot){state.history.push(snapshot);if(state.history.length>65)state.history.shift();state.future=[];refreshHistory()}
function flushInspector(){
 if(!state.inspectorBefore)return;
 const snapshot=state.inspectorBefore;state.inspectorBefore=null;
 if(JSON.stringify(snapshot)!==JSON.stringify(project())){commitHistory(snapshot);persist();}
}
function change(fn,{preserveSelection=true}={}){
 flushInspector();const before=copy(project());
 try{fn(project())}catch(error){state.projects[state.projects.findIndex(p=>p.id===state.activeId)]=before;toast(error.message);render();return false}
 commitHistory(before);persist();render();return true;
}
function undo(){
 flushInspector();if(!state.history.length)return;
 const current=project(),i=state.projects.indexOf(current),old=state.history.pop();
 state.future.push(copy(current));state.projects[i]=old;
 if(!old.factors.some(f=>f.id===state.selectedFactor))state.selectedFactor='';
 if(!old.strategies.some(s=>s.id===state.selectedStrategy))state.selectedStrategy='';
 persist();render();
}
function redo(){
 flushInspector();if(!state.future.length)return;
 const current=project(),i=state.projects.indexOf(current),next=state.future.pop();
 state.history.push(copy(current));state.projects[i]=next;
 if(!next.factors.some(f=>f.id===state.selectedFactor))state.selectedFactor='';
 if(!next.strategies.some(s=>s.id===state.selectedStrategy))state.selectedStrategy='';
 persist();render();
}
function newProject(p=createProject()){
 if(state.projects.length>=MAX.projects){toast('The library is full. Export or delete a project first.');return}
 flushInspector();state.projects.unshift(p);state.activeId=p.id;state.selectedFactor='';state.selectedStrategy='';state.history=[];state.future=[];state.view='board';
 persist();render();closeDialog('#library-dialog');toast('Strategy project created.');
}
function switchProject(id){
 if(!state.projects.some(p=>p.id===id))return;flushInspector();
 state.activeId=id;state.selectedFactor='';state.selectedStrategy='';state.history=[];state.future=[];state.view='board';state.towsType='SO';state.towsA='';state.towsB='';state.draftDirty=false;
 persist();render();closeDialog('#library-dialog');
}
function removeProject(id){
 const p=state.projects.find(p=>p.id===id);if(!p||!confirm('Delete “‘'+p.name+'” and all its analysis? This cannot be undone.'))return;
 state.projects=state.projects.filter(p=>p.id!==id);
 if(!state.projects.length)state.projects=[createProject()];
 if(state.activeId===id)state.activeId=state.projects[0].id;
 state.history=[];state.future=[];state.selectedFactor='';state.selectedStrategy='';state.view='board';persist();render();renderLibrary();
}
function setView(view){
 if(!VIEW_META[view])return;flushInspector();state.view=view;render();
}
function renderHeader(){
 const p=project(),stats=projectStats(p);
 $('#project-name').value=p.name;
 $('#hero-metrics').innerHTML=[['SWOT factors',stats.totalFactors],['TOWS options',stats.strategies],['Action items',stats.actions]].map(([label,value])=>'<div class="stat"><strong>'+value+'</strong><small>'+label+'</small></div>').join('');
 $('#factor-count').textContent=stats.totalFactors;
}
function renderSidebar(){
 const p=project();for(const [id,key] of [['project-objective','objective'],['project-description','description'],['project-owner','owner'],['project-review','reviewDate']])$('#'+id).value=p[key]||'';
 $('#factor-list').innerHTML=factorListHTML(p,state.selectedFactor,$('#factor-search').value);
}
function renderBoard(){
 const p=project(),linked=new Set();
 const strategy=p.strategies.find(s=>s.id===state.selectedStrategy);
 if(strategy?.factorIds.length===2)strategy.factorIds.forEach(id=>linked.add(id));
 for(const q of QUADRANTS){
  const container=$('[data-space="'+q.id+'"]');container.innerHTML=p.factors.filter(f=>f.quadrant===q.id).map(f=>factorHTML(f,state.selectedFactor,linked)).join('');
  $('[data-count="'+q.id+'"]').textContent=p.factors.filter(f=>f.quadrant===q.id).length;
 }
 $('#show-connections').checked=p.showConnections;
 drawConnections();
}
function drawConnections(){
 const svg=$('#board-links'),board=$('#swot-board');if(!svg||!board)return;
 svg.replaceChildren();if(!project().showConnections||state.view!=='board')return;
 const frame=board.getBoundingClientRect();if(!frame.width||!frame.height)return;
 svg.setAttribute('viewBox','0 0 '+frame.width+' '+frame.height);
 const ns='http://www.w3.org/2000/svg';
 for(const s of project().strategies){
  if(s.factorIds.length!==2)continue;
  const a=$('[data-factor="'+s.factorIds[0]+'"]'),b=$('[data-factor="'+s.factorIds[1]+'"]');if(!a||!b)continue;
  const ra=a.getBoundingClientRect(),rb=b.getBoundingClientRect();
  const ax=ra.left+ra.width/2-frame.left,ay=ra.top+ra.height/2-frame.top,bx=rb.left+rb.width/2-frame.left,by=rb.top+rb.height/2-frame.top;
  const dx=bx-ax,dy=by-ay,midX=(ax+bx)/2,midY=(ay+by)/2;
  const path=document.createElementNS(ns,'path');
  path.setAttribute('d','M'+ax+' '+ay+' Q'+(midX-dy*.12)+' '+(midY+dx*.12)+' '+bx+' '+by);
  const selected=s.id===state.selectedStrategy;
  path.setAttribute('stroke',typeFor(s.type)?.color||'#7b9fb4');path.setAttribute('stroke-width',selected?'5':'2.5');
  path.setAttribute('opacity',selected?'.92':'.32');path.setAttribute('stroke-dasharray',selected?'':'7 6');
  path.setAttribute('stroke-linecap','round');path.setAttribute('fill','none');svg.append(path);
 }
}
function renderInspector(){
 const n=factor();$('#inspector-empty').hidden=!!n;$('#inspector-fields').hidden=!n;
 if(!n)return;
 for(const [id,key] of [['edit-text','text'],['edit-quadrant','quadrant'],['edit-group','group'],['edit-notes','notes']])$('#'+id).value=n[key]||'';
 $('#card-width').value=n.w;$('#card-height').value=n.h;$('#card-size').textContent=n.w+' × '+n.h;
 $('#factor-importance').value=n.importance;$('#factor-importance-value').textContent=n.importance;
 $('#factor-confidence').value=n.confidence;$('#factor-confidence-value').textContent=n.confidence;
 $('#factor-colors').innerHTML=COLORS.map(c=>'<button type="button" data-factor-color="'+c.id+'" title="'+c.id+'" style="--swatch:'+c.border+'" aria-label="'+c.id+' factor color" aria-pressed="'+(c.id===n.color)+'" class="'+(c.id===n.color?'active':'')+'"></button>').join('');
}
function renderTows(){
 const p=project(),type=typeFor(state.towsType)||TOWS_TYPES[0];$('#tows-type-picker').innerHTML=typePickerHTML(state.towsType);
 const first=p.factors.filter(f=>f.quadrant===type.quadrants[0]),second=p.factors.filter(f=>f.quadrant===type.quadrants[1]);
 if(!first.some(f=>f.id===state.towsA))state.towsA=first[0]?.id||'';
 if(!second.some(f=>f.id===state.towsB))state.towsB=second[0]?.id||'';
 $('#tows-first').innerHTML='<option value="">Select a '+type.quadrants[0]+' factor</option>'+first.map(f=>optionHTML(f.id,f.text.slice(0,90),state.towsA)).join('');
 $('#tows-second').innerHTML='<option value="">Select a '+type.quadrants[1]+' factor</option>'+second.map(f=>optionHTML(f.id,f.text.slice(0,90),state.towsB)).join('');
 updatePairPreview();
 $('#strategy-count').textContent=p.strategies.length;
 $('#strategy-grid').innerHTML=strategyCardsHTML(p,state.selectedStrategy);
}
function updatePairPreview(){
 const p=project(),a=p.factors.find(f=>f.id===state.towsA),b=p.factors.find(f=>f.id===state.towsB);
 if(a&&b){
  let proposal;try{proposal=suggestedStrategy(p,a.id,b.id)}catch{proposal=null}
  $('#pair-preview').innerHTML=proposal?'<strong>'+esc(proposal.type)+' strategy:</strong> '+esc(a.text)+' <span aria-hidden="true">↗</span> '+esc(b.text):
    '<strong>Choose compatible factors from two quadrants.</strong>';
  if(proposal&&!state.draftDirty)$('#strategy-draft').value=proposal.text;
 }else{
  $('#pair-preview').innerHTML='<strong>Add factors to the '+esc(typeFor(state.towsType)?.label||'selected')+' quadrants to build this strategy.</strong>';
  if(!state.draftDirty)$('#strategy-draft').value='';
 }
}
function renderPriorities(){
 const p=project(),weightSum=Object.values(p.weights).reduce((a,b)=>a+Number(b),0);
 $('#weight-controls').innerHTML=[['impact','Expected impact'],['feasibility','Feasibility'],['urgency','Urgency'],['resources','Low resource demand']].map(([key,label])=>
 '<div class="weight-row"><label for="weight-'+key+'">'+label+' <output id="weight-output-'+key+'">'+p.weights[key]+'</output></label><input id="weight-'+key+'" data-weight="'+key+'" type="range" min="0" max="100" step="5" value="'+p.weights[key]+'"></div>').join('');
 $('#weight-sum').textContent=weightSum+' total weight'+(weightSum===0?' — set at least one above 0':'');
 $('#rank-count').textContent=p.strategies.length+' strategies';
 $('#ranking-view').innerHTML=rankingHTML(p);
}
function renderScenarios(){
 const p=project(),selected=currentScenario();
 $('#scenario-select').innerHTML='<option value="">Baseline — no changes</option>'+p.scenarios.map(s=>optionHTML(s.id,s.name,p.activeScenario)).join('');
 $('#scenario-select').value=selected?.id||'';
 $('#scenario-delete').disabled=!selected;
 $('#scenario-editor').hidden=!selected;
 if(selected){
  $('#scenario-name').value=selected.name;$('#scenario-description').value=selected.description;
  $('#factor-shifts').innerHTML=QUADRANTS.map(q=>shiftInput(q.name,q.id,selected.factorShifts[q.id],'factor')).join('');
  $('#score-shifts').innerHTML=[['impact','Impact'],['feasibility','Feasibility'],['urgency','Urgency'],['resources','Resource demand']].map(([key,name])=>shiftInput(name,key,selected.deltas[key],'rating')).join('');
 }
 $('#scenario-headline').textContent=selected?selected.name:'Baseline comparison';
 $('#scenario-comparison').innerHTML=scenarioComparisonHTML(p,selected);
}
function shiftInput(label,key,value,kind){
 return '<div class="scenario-shift"><label for="shift-'+kind+'-'+key+'">'+esc(label)+'</label><output id="output-'+kind+'-'+key+'">'+(value>0?'+':'')+value+'</output><input data-shift-kind="'+kind+'" data-shift-key="'+key+'" id="shift-'+kind+'-'+key+'" type="range" min="-2" max="2" step="1" value="'+value+'"></div>';
}
function renderActions(){
 const p=project(),stats=projectStats(p);
 $('#action-progress').textContent=stats.done+' / '+stats.actions+' completed';
 $('#actions-list').innerHTML=actionsHTML(p);
}
function render(){
 renderHeader();renderSidebar();
 $$('[data-view]').forEach(btn=>{const on=btn.dataset.view===state.view;btn.classList.toggle('active',on);btn.setAttribute('aria-current',on?'page':'false')});
 for(const [key] of Object.entries(VIEW_META))$('#'+key+'-view').hidden=key!==state.view;
 const metadata=VIEW_META[state.view];$('#view-kicker').textContent=metadata[0];$('#view-heading').textContent=metadata[1];$('#view-explainer').textContent=metadata[2];
 $('#view-buttons').innerHTML=state.view==='board'?'<button type="button" data-shortcut="tows">TOWS next →</button>':state.view==='tows'?'<button type="button" data-shortcut="priorities">Evaluate priorities →</button>':state.view==='priorities'?'<button type="button" data-shortcut="scenarios">Stress test →</button>':state.view==='scenarios'?'<button type="button" data-shortcut="actions">Create action plan →</button>':'';
 renderBoard();renderInspector();renderTows();renderPriorities();renderScenarios();renderActions();refreshHistory();
}
function selectFactor(id){
 flushInspector();if(!project().factors.some(f=>f.id===id))return;
 state.selectedFactor=id;renderBoard();renderInspector();renderSidebar();
}
function addNewFactor(quadrant,text,x=null,y=null){
 if(!text.trim())text='New '+(QUADRANTS.find(q=>q.id===quadrant)?.name.slice(0,-1).toLowerCase()||'factor');
 const count=project().factors.filter(f=>f.quadrant===quadrant).length;
 let node=null;
 const ok=change(p=>node=addFactor(p,quadrant,text,{x:x??(28+(count%3)*20),y:y??(22+(Math.floor(count/3)%3)*25)}));
 if(ok){state.selectedFactor=node.id;render();toast('Factor added. Drag to position or customize it.')}
}
function organizeCards(){
 const mapping={S:[],W:[],O:[],T:[]};project().factors.forEach(f=>mapping[f.quadrant].push(f));
 change(p=>{for(const quad of Object.keys(mapping))mapping[quad].forEach((f,i)=>{
  const cols=3;f.x=18+(i%cols)*32;f.y=20+(Math.floor(i/cols)%4)*22;
  if(i>=cols*4){f.x=20+(i%3)*29;f.y=80}
 })});
 toast('Cards organized. You can drag them into any position.');
}
function saveInspectorDraft(){
 if(!state.inspectorBefore)return;
 const before=state.inspectorBefore;state.inspectorBefore=null;
 if(JSON.stringify(before)!==JSON.stringify(project())){commitHistory(before);persist();render();}
}
function directFactorUpdate(key,value){
 const n=factor();if(!n)return;
 if(!state.inspectorBefore)state.inspectorBefore=copy(project());
 if(key==='text')n.text=String(value).slice(0,220);
 if(key==='group')n.group=String(value).slice(0,60);
 if(key==='notes')n.notes=String(value).slice(0,1800);
 if(key==='importance'||key==='confidence')n[key]=clamp(value,1,5,n[key]);
 if(key==='w'||key==='h')resizeFactor(project(),n.id,key==='w'?value:n.w,key==='h'?value:n.h);
 const card=$('[data-factor="'+n.id+'"]');
 if(card){
  card.style.width=n.w+'px';card.style.height=n.h+'px';
  const label=card.querySelector('.card-text');if(label)label.textContent=n.text||'Untitled factor';
  const group=card.querySelector('.card-group');if(group)group.textContent=n.group;
  const rating=card.querySelector('.card-priority');if(rating)rating.textContent='Importance '+n.importance+'/5';
 }
 $('#card-size').textContent=n.w+' × '+n.h;
 $('#factor-importance-value').textContent=n.importance;$('#factor-confidence-value').textContent=n.confidence;
}
function pointerCoordinates(space,event){
 const rect=space.getBoundingClientRect();
 return {x:clamp(100*(event.clientX-rect.left)/Math.max(1,rect.width),9,91,50),
  y:clamp(100*(event.clientY-rect.top)/Math.max(1,rect.height),10,90,50)};
}
function quadrantAt(event){
 for(const quad of $$('[data-space]')){
  const r=quad.getBoundingClientRect();if(event.clientX>=r.left&&event.clientX<=r.right&&event.clientY>=r.top&&event.clientY<=r.bottom)return quad;
 }
 return null;
}
function beginPointer(event){
 const resize=event.target.closest('[data-resize]'),card=event.target.closest('[data-factor]');
 if(!card||event.button!==0)return;
 const id=resize?.dataset.resize||card.dataset.factor;
 const n=project().factors.find(f=>f.id===id);if(!n)return;
 if(state.selectedFactor!==id)selectFactor(id);
 const actual=$('[data-factor="'+id+'"]');
 state.drag={type:resize?'resize':'move',id,startX:event.clientX,startY:event.clientY,original:{...n},before:copy(project()),moved:false,
  previewQuad:n.quadrant,previewX:n.x,previewY:n.y};
 try{$('#swot-board').setPointerCapture(event.pointerId)}catch{}
 event.preventDefault();
}
function movingPointer(event){
 const drag=state.drag;if(!drag)return;
 const dx=event.clientX-drag.startX,dy=event.clientY-drag.startY;
 if(Math.abs(dx)+Math.abs(dy)<3&&!drag.moved)return;
 drag.moved=true;
 const n=project().factors.find(f=>f.id===drag.id),el=$('[data-factor="'+drag.id+'"]');if(!n||!el)return;
 if(drag.type==='resize'){
  const w=clamp(drag.original.w+dx*2,142,310,n.w),h=clamp(drag.original.h+dy*2,78,180,n.h);
  drag.previewW=w;drag.previewH=h;el.style.width=w+'px';el.style.height=h+'px';
  $('#card-width').value=w;$('#card-height').value=h;$('#card-size').textContent=w+' × '+h;
 }else{
  const hover=quadrantAt(event)||$('[data-space="'+drag.original.quadrant+'"]');
  if(!hover)return;
  const point=pointerCoordinates(hover,event);
  drag.previewQuad=hover.dataset.space;drag.previewX=point.x;drag.previewY=point.y;
  if(el.parentElement!==hover)hover.append(el);
  el.style.left=point.x+'%';el.style.top=point.y+'%';
  $$('[data-quadrant]').forEach(q=>q.classList.toggle('drag-over',q.dataset.quadrant===drag.previewQuad));
 }
}
function endPointer(event,cancelled=false){
 const drag=state.drag;if(!drag)return;state.drag=null;
 try{if($('#swot-board').hasPointerCapture?.(event.pointerId))$('#swot-board').releasePointerCapture(event.pointerId)}catch{}
 $$('[data-quadrant]').forEach(q=>q.classList.remove('drag-over'));
 if(!drag.moved||cancelled){renderBoard();renderInspector();return}
 let changed=false;
 if(drag.type==='resize')changed=change(p=>resizeFactor(p,drag.id,drag.previewW,drag.previewH));
 else changed=change(p=>repositionFactor(p,drag.id,drag.previewQuad,drag.previewX,drag.previewY));
 state.ignoreClick=true;setTimeout(()=>state.ignoreClick=false,0);
 if(changed)toast(drag.type==='resize'?'Factor resized.':'Factor repositioned.');
}
function nativeDrop(event){
 event.preventDefault();const space=event.target.closest('[data-space]')||quadrantAt(event);if(!space)return;
 const raw=event.dataTransfer?.getData('application/x-swot-factor');if(!raw)return;
 let data;try{data=JSON.parse(raw)}catch{return}
 const position=pointerCoordinates(space,event),quad=space.dataset.space;
 if(data.type==='factor'&&project().factors.some(f=>f.id===data.id)){
  state.selectedFactor=data.id;change(p=>repositionFactor(p,data.id,quad,position.x,position.y));toast('Factor moved to '+QUADRANTS.find(q=>q.id===quad).name);
 }else if(data.type==='new'){
  addNewFactor(quad,data.label||'New factor',position.x,position.y);
 }
}
function startNativeDrag(event){
 const factorItem=event.target.closest('[data-factor-row]'),starter=event.target.closest('[data-starter]');
 if(!factorItem&&!starter||!event.dataTransfer)return;
 const data=factorItem?{type:'factor',id:factorItem.dataset.factorRow}:{type:'new',label:$('#quick-factor').value.trim()||'New '+QUADRANTS.find(q=>q.id===starter.dataset.starter).name.slice(0,-1).toLowerCase()};
 event.dataTransfer.effectAllowed='copyMove';
 event.dataTransfer.setData('application/x-swot-factor',JSON.stringify(data));
 event.dataTransfer.setData('text/plain',data.label||'SWOT factor');
}
function showDialog(id){const dialog=$(id);if(dialog&&!dialog.open)dialog.showModal()}
function closeDialog(id){const dialog=$(id);if(dialog?.open)dialog.close()}
function renderLibrary(){
 $('#library-items').innerHTML=state.projects.map(p=>'<div class="library-item"><div class="name"><strong>'+esc(p.name)+'</strong><small>'+p.factors.length+' factors · '+p.strategies.length+' strategies · Updated '+esc(p.updated.slice(0,10))+'</small></div>'+
  '<button type="button" data-open-project="'+esc(p.id)+'">'+(p.id===state.activeId?'Current':'Open')+'</button>'+
  '<button type="button" data-clone-project="'+esc(p.id)+'">Copy</button>'+
  '<button type="button" data-remove-project="'+esc(p.id)+'" class="danger" aria-label="Delete project">×</button></div>').join('');
}
const formField=(label,key,val,type='text',opts=null,limit=650)=>'<label>'+esc(label)+(type==='textarea'?'<textarea name="'+key+'" maxlength="'+limit+'" rows="3">'+esc(val??'')+'</textarea>':
 type==='select'?'<select name="'+key+'">'+opts.map(([id,name])=>optionHTML(id,name,String(val||''))).join('')+'</select>':
 '<input name="'+key+'" type="'+type+'" '+(type==='number'?'min="1" max="5" step="1"':'maxlength="'+limit+'"')+' value="'+esc(val??'')+'">')+'</label>';
let editing=null;
function editStrategy(id=''){
 const s=project().strategies.find(x=>x.id===id);if(!s)return;
 editing={kind:'strategy',id};
 $('#editor-title').textContent='Edit strategic recommendation';
 const factors=project().factors;
 const choices=[['','Select a factor'],...factors.map(f=>[f.id,f.quadrant+' · '+f.text.slice(0,100)])];
 $('#editor-content').innerHTML=formField('Strategic recommendation','title',s.title,'textarea',null,360)+
  '<div class="editor-row">'+formField('Factor 1','first',s.factorIds[0]||'','select',choices)+formField('Factor 2','second',s.factorIds[1]||'','select',choices)+'</div>'+
  formField('Rationale / assumptions','rationale',s.rationale,'textarea',null,1600)+
  '<div class="editor-row">'+formField('Owner','owner',s.owner)+
  formField('Status','status',s.status,'select',['Proposed','Under review','Approved','In progress','Completed','Paused'].map(x=>[x,x]))+'</div>'+
  '<p class="editor-note">Rate each criterion from 1 (low) to 5 (high). For resources, 5 means most resource-intensive.</p>'+
  '<div class="rating-row">'+['impact','feasibility','urgency','resources'].map(k=>formField(k[0].toUpperCase()+k.slice(1),k,s[k],'select',[1,2,3,4,5].map(x=>[String(x),String(x)]))).join('')+'</div>';
 showDialog('#editor-dialog');
}
function editAction(id='',strategyId=''){
 const a=project().actions.find(x=>x.id===id);editing={kind:'action',id};
 $('#editor-title').textContent=id?'Edit action item':'Create action item';
 const options=[['','No linked strategy'],...project().strategies.map(s=>[s.id,(s.type||'TOWS')+' · '+s.title.slice(0,80)])];
 $('#editor-content').innerHTML=
 formField('Action step','title',a?.title||'','textarea',null,220)+
 formField('Linked strategy','strategyId',a?.strategyId||strategyId,'select',options)+
 '<div class="editor-row">'+formField('Owner','owner',a?.owner||'')+formField('Due date','due',a?.due||'','date')+'</div>'+
 '<div class="editor-row">'+formField('Milestone / checkpoint','milestone',a?.milestone||'')+formField('Status','status',a?.status||'Not started','select',['Not started','In progress','Blocked','Done'].map(s=>[s,s]))+'</div>'+
 formField('Success measure','metric',a?.metric||'')+
 '<div class="editor-row">'+formField('Baseline','baseline',a?.baseline||'')+formField('Target','target',a?.target||'')+'</div>'+
 formField('Risks and unintended consequences','risks',a?.risks||'','textarea',null,700)+formField('Observed results / follow-up','results',a?.results||'','textarea',null,800);
 showDialog('#editor-dialog');
}
function saveEditor(){
 if(!editing)return;
 const fd=new FormData($('#editor-form')),get=(k,n=650)=>String(fd.get(k)||'').slice(0,n),{kind,id}=editing;
 if(kind==='strategy'){
  const refs=[get('first',100),get('second',100)];
  const type=strategyTypeForFactors(project(),refs);
  if(!type){toast('Choose two distinct SWOT factors forming an SO, ST, WO or WT pair.');return}
  if(!get('title',360).trim()){toast('Write a strategy statement.');return}
  const done=change(p=>{
   const s=p.strategies.find(x=>x.id===id);
   Object.assign(s,{type,factorIds:refs,title:get('title',360),rationale:get('rationale',1600),owner:get('owner',110),status:get('status',30),
    impact:clamp(get('impact'),1,5,3),feasibility:clamp(get('feasibility'),1,5,3),urgency:clamp(get('urgency'),1,5,3),resources:clamp(get('resources'),1,5,3)});
  });
  if(done){editing=null;closeDialog('#editor-dialog');toast('Strategy updated.')}
 }else if(kind==='action'){
  if(!get('title',220).trim()){toast('Describe the action to take.');return}
  const record={strategyId:get('strategyId',120),title:get('title',220),owner:get('owner',110),due:get('due',10),milestone:get('milestone',150),
   status:get('status',30),metric:get('metric',220),baseline:get('baseline',80),target:get('target',80),risks:get('risks',700),results:get('results',800)};
  const done=change(p=>{
   if(id){const a=p.actions.find(x=>x.id===id);Object.assign(a,record)}
   else addAction(p,record);
  });
  if(done){editing=null;closeDialog('#editor-dialog');toast('Action plan updated.')}
 }
}
function download(content,name,mime){
 const blob=content instanceof Blob?content:new Blob([content],{type:mime}),url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1600);
}
const stem=()=>project().name.toLowerCase().replace(/[^a-z0-9-]+/g,'-').replace(/^-|-$/g,'').slice(0,58)||'swot-tows';
const csv=rows=>'\ufeff'+rows.map(r=>r.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(',')).join('\r\n');
function exportStrategies(){
 const p=project(),ranked=rankStrategies(p);
 const rows=[['Type','Strategic recommendation','Factor 1','Factor 2','Owner','Status','Impact','Feasibility','Urgency','Resource demand','Weighted score','Rationale'],
 ...ranked.map(s=>[s.type,s.title,...s.factorIds.map(id=>p.factors.find(f=>f.id===id)?.text||'').concat(Array(Math.max(0,2-s.factorIds.length)).fill('')),s.owner,s.status,s.impact,s.feasibility,s.urgency,s.resources,s.baseline,s.rationale])];
 download(csv(rows),stem()+'-strategies.csv','text/csv;charset=utf-8');
}
function exportActions(){
 const p=project(),rows=[['Action','Strategy','Owner','Due','Milestone','Measure','Baseline','Target','Status','Risks','Results'],
 ...p.actions.map(a=>[a.title,p.strategies.find(s=>s.id===a.strategyId)?.title||'',a.owner,a.due,a.milestone,a.metric,a.baseline,a.target,a.status,a.risks,a.results])];
 download(csv(rows),stem()+'-actions.csv','text/csv;charset=utf-8');
}
function exportJSON(){download(JSON.stringify({kind:'mayne-swot-tows',version:VERSION,project:project()},null,2),stem()+'.swot.json','application/json')}
function exportSVG(){download('<?xml version="1.0" encoding="UTF-8"?>\n'+diagramSVG(project(),{selectedStrategy:state.selectedStrategy}),stem()+'-diagram.svg','image/svg+xml;charset=utf-8')}
async function exportPNG(){
 const markup=diagramSVG(project(),{selectedStrategy:state.selectedStrategy}),url=URL.createObjectURL(new Blob([markup],{type:'image/svg+xml;charset=utf-8'}));
 try{
  const image=new Image();
  await new Promise((res,rej)=>{image.onload=res;image.onerror=()=>rej(Error('Could not render SWOT SVG.'));image.src=url});
  const canvas=document.createElement('canvas');canvas.width=2400;canvas.height=1800;
  const ctx=canvas.getContext('2d');if(!ctx)throw Error('Canvas is not supported.');
  ctx.fillStyle='#f9fcff';ctx.fillRect(0,0,2400,1800);ctx.drawImage(image,0,0,2400,1800);
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
  if(!blob)throw Error('PNG conversion failed.');
  download(blob,stem()+'-diagram.png','image/png');toast('High-resolution SWOT diagram exported.');
 }catch(err){toast('PNG export failed: '+err.message)}finally{URL.revokeObjectURL(url)}
}
function printReport(){$('#print-report').innerHTML=reportHTML(project());window.print()}
function handleExport(kind){
 closeDialog('#export-dialog');
 if(kind==='svg')exportSVG();
 if(kind==='png')exportPNG();
 if(kind==='json')exportJSON();
 if(kind==='strategies')exportStrategies();
 if(kind==='actions')exportActions();
 if(kind==='report')printReport();
}
async function importFile(file){
 if(!file)return;if(file.size>3e6){toast('Backup is larger than the 3 MB limit.');return}
 try{
  const raw=JSON.parse(await file.text()),p=normalizeProject(raw.kind==='mayne-swot-tows'?raw.project:raw,{regenerate:true});
  if(!confirm('Import "'+p.name+'" as an editable new project?'))return;
  newProject(p);toast('Project restored as a separate editable copy.');
 }catch(err){toast('Import failed: '+err.message)}
}
function handleClick(event){
 const target=event.target;
 if(target.closest('[data-close]')){closeDialog('#'+target.closest('[data-close]').dataset.close);return}
 const view=target.closest('[data-view]'),shortcut=target.closest('[data-shortcut]');
 if(view||shortcut){setView(view?.dataset.view||shortcut.dataset.shortcut);return}
 const add=target.closest('[data-add-quadrant]');if(add){$('#quick-quadrant').value=add.dataset.addQuadrant;$('#quick-factor').focus();return}
 const starter=target.closest('[data-starter]');if(starter){$('#quick-quadrant').value=starter.dataset.starter;$('#quick-factor').focus();return}
 const templateButton=target.closest('[data-template]');if(templateButton){try{newProject(templateProject(templateButton.dataset.template))}catch(error){toast(error.message)}return}
 const pick=target.closest('[data-select-factor]');if(pick){selectFactor(pick.dataset.selectFactor);setView('board');return}
 const factorCard=target.closest('[data-factor]');if(factorCard&&!state.ignoreClick){selectFactor(factorCard.dataset.factor);return}
 const color=target.closest('[data-factor-color]');if(color&&factor()){change(p=>p.factors.find(f=>f.id===state.selectedFactor).color=color.dataset.factorColor);return}
 const type=target.closest('[data-tows-type]');if(type){state.towsType=type.dataset.towsType;state.towsA='';state.towsB='';state.draftDirty=false;renderTows();return}
 const show=target.closest('[data-show-link]');if(show){state.selectedStrategy=show.dataset.showLink;setView('board');toast('Linked factors are highlighted on your SWOT board.');return}
 const editStrat=target.closest('[data-edit-strategy]');if(editStrat){editStrategy(editStrat.dataset.editStrategy);return}
 const delStrat=target.closest('[data-delete-strategy]');if(delStrat){
  const s=project().strategies.find(x=>x.id===delStrat.dataset.deleteStrategy);
  if(s&&confirm('Delete strategy "'+s.title+'"? Linked actions become unassigned.'))change(p=>removeStrategy(p,s.id));return;
 }
 const actStrat=target.closest('[data-action-strategy]');if(actStrat){editAction('',actStrat.dataset.actionStrategy);return}
 const actEdit=target.closest('[data-edit-action]');if(actEdit){editAction(actEdit.dataset.editAction);return}
 const actDelete=target.closest('[data-delete-action]');if(actDelete){
  const a=project().actions.find(x=>x.id===actDelete.dataset.deleteAction);
  if(a&&confirm('Delete action "'+a.title+'"?'))change(p=>p.actions=p.actions.filter(x=>x.id!==a.id));return;
 }
 const actNew=target.closest('[data-new-action]');if(actNew){editAction();return}
 const pOpen=target.closest('[data-open-project]');if(pOpen){switchProject(pOpen.dataset.openProject);return}
 const pClone=target.closest('[data-clone-project]');if(pClone){
  const original=state.projects.find(p=>p.id===pClone.dataset.cloneProject);
  if(original){const duplicated=normalizeProject(original,{regenerate:true});duplicated.name+=' (copy)';newProject(duplicated)}return;
 }
 const pDelete=target.closest('[data-remove-project]');if(pDelete){removeProject(pDelete.dataset.removeProject);return}
 const exp=target.closest('[data-export]');if(exp){handleExport(exp.dataset.export);return}
}
function bind(){
 $('#new-project').onclick=()=>newProject();$('#projects-button').onclick=()=>{renderLibrary();showDialog('#library-dialog')};
 $('#library-new').onclick=()=>newProject();$('#library-import').onclick=()=>$('#import-file').click();
 $('#import-file').onchange=event=>{importFile(event.target.files?.[0]);event.target.value=''};
 // Classroom templates are delegated through data-template so every choice opens a separate project.
 $('#undo').onclick=undo;$('#redo').onclick=redo;$('#export-button').onclick=()=>showDialog('#export-dialog');
 $('#quick-add').onclick=()=>{const q=$('#quick-quadrant').value,text=$('#quick-factor').value.trim();if(!text){toast('Write a factor before adding it.');$('#quick-factor').focus();return}
  addNewFactor(q,text);$('#quick-factor').value='';
 };
 $('#quick-factor').addEventListener('keydown',event=>{if((event.metaKey||event.ctrlKey)&&event.key==='Enter'){event.preventDefault();$('#quick-add').click()}});
 $('#factor-search').oninput=()=>{$('#factor-list').innerHTML=factorListHTML(project(),state.selectedFactor,$('#factor-search').value)};
 $('#project-name').onchange=event=>change(p=>p.name=event.target.value.trim().slice(0,130)||'Untitled strategy analysis');
 for(const [id,key] of [['project-objective','objective'],['project-description','description'],['project-owner','owner'],['project-review','reviewDate']])$('#'+id).onchange=event=>change(p=>p[key]=event.target.value.slice(0,key==='description'||key==='objective'?1800:120));
 $('#show-connections').onchange=event=>change(p=>p.showConnections=event.target.checked);
 $('#board-reset').onclick=organizeCards;$('#view-tows').onclick=()=>setView('tows');
 for(const [id,key] of [['edit-text','text'],['edit-group','group'],['edit-notes','notes'],['card-width','w'],['card-height','h'],['factor-importance','importance'],['factor-confidence','confidence']]){
  const input=$('#'+id);
  input.addEventListener('focus',()=>{if(factor()&&!state.inspectorBefore)state.inspectorBefore=copy(project())});
  input.addEventListener('input',event=>directFactorUpdate(key,event.target.value));
  input.addEventListener('change',saveInspectorDraft);
 }
 $('#edit-quadrant').onchange=event=>{const id=state.selectedFactor,category=event.target.value;
  change(p=>repositionFactor(p,id,category,factor()?.x||35,factor()?.y||35));
 };
 $('#duplicate-factor').onclick=()=>{const f=factor();if(!f)return;let copyId='';
  const ok=change(p=>{const item=addFactor(p,f.quadrant,f.text+' (copy)',{...f,x:clamp(f.x+12,8,92),y:clamp(f.y+12,9,91)});copyId=item.id});
  if(ok){state.selectedFactor=copyId;render()}
 };
 $('#delete-factor').onclick=()=>{const f=factor();if(!f||!confirm('Delete factor "'+f.text+'" and unlink affected strategies?'))return;
  change(p=>removeFactor(p,f.id));state.selectedFactor='';render()
 };
 $('#tows-first').onchange=event=>{state.towsA=event.target.value;state.draftDirty=false;updatePairPreview()};
 $('#tows-second').onchange=event=>{state.towsB=event.target.value;state.draftDirty=false;updatePairPreview()};
 $('#strategy-draft').oninput=()=>state.draftDirty=true;
 $('#strategy-generate').onclick=()=>{const a=state.towsA,b=state.towsB;
  try{$('#strategy-draft').value=suggestedStrategy(project(),a,b).text;state.draftDirty=true}catch(err){toast(err.message)}
 };
 $('#strategy-add').onclick=()=>{
  const ids=[state.towsA,state.towsB],title=$('#strategy-draft').value.trim();
  if(!title){toast('Write or generate a strategy recommendation first.');return}
  let created=null;const done=change(p=>created=addStrategy(p,ids,{title}));
  if(done){state.selectedStrategy=created.id;state.draftDirty=false;render();toast('Linked strategy created — review its priority ratings.')}
 };
 $('#reset-weights').onclick=()=>change(p=>p.weights={...DEFAULT_WEIGHTS});
 $('#scenario-select').onchange=event=>change(p=>p.activeScenario=event.target.value);
 $('#scenario-new').onclick=()=>{let newId='';const ok=change(p=>{newId=addScenario(p,{name:'New planning scenario'}).id;p.activeScenario=newId});if(ok)toast('Scenario ready. Adjust its assumptions.')};
 $('#scenario-delete').onclick=()=>{const sc=currentScenario();if(!sc||!confirm('Remove scenario "'+sc.name+'"?'))return;
  change(p=>{p.scenarios=p.scenarios.filter(s=>s.id!==sc.id);p.activeScenario=''});
 };
 $('#scenario-name').onchange=event=>{const name=event.target.value;change(p=>{const s=p.scenarios.find(s=>s.id===p.activeScenario);if(s)s.name=name.slice(0,130)||'Unnamed scenario'})};
 $('#scenario-description').onchange=event=>{const description=event.target.value;change(p=>{const s=p.scenarios.find(s=>s.id===p.activeScenario);if(s)s.description=description.slice(0,900)})};
 $('#action-new').onclick=()=>editAction();$('#export-actions').onclick=exportActions;
 $('#editor-form').onsubmit=event=>{event.preventDefault();saveEditor()};
 document.addEventListener('click',handleClick);
 document.addEventListener('change',event=>{
  const target=event.target;
  if(target.dataset.weight){const key=target.dataset.weight;change(p=>p.weights[key]=clamp(target.value,0,100,p.weights[key]));return}
  if(target.dataset.shiftKind){
   const kind=target.dataset.shiftKind,key=target.dataset.shiftKey,val=clamp(target.value,-2,2,0);
   change(p=>{const s=p.scenarios.find(s=>s.id===p.activeScenario);if(s){if(kind==='factor')s.factorShifts[key]=val;else s.deltas[key]=val}});
   return;
  }
  if(target.dataset.actionStatus){const id=target.dataset.actionStatus,val=target.value;change(p=>{const a=p.actions.find(x=>x.id===id);if(a)a.status=val});return}
 });
 document.addEventListener('input',event=>{
  const target=event.target;
  if(target.dataset.weight){const output=$('#weight-output-'+target.dataset.weight);if(output)output.textContent=target.value;
   $('#weight-sum').textContent=$$('[data-weight]').reduce((sum,el)=>sum+Number(el.value),0)+' total weight';return}
  if(target.dataset.shiftKind){const out=$('#output-'+target.dataset.shiftKind+'-'+target.dataset.shiftKey);if(out)out.textContent=(target.value>0?'+':'')+target.value;return}
 });
 document.addEventListener('dragstart',startNativeDrag);
 $('#swot-board').addEventListener('pointerdown',beginPointer);
 $('#swot-board').addEventListener('pointermove',movingPointer);
 $('#swot-board').addEventListener('pointerup',endPointer);
 $('#swot-board').addEventListener('pointercancel',event=>endPointer(event,true));
 $('#swot-board').addEventListener('dragover',event=>{event.preventDefault();const el=event.target.closest('[data-quadrant]');$$('[data-quadrant]').forEach(q=>q.classList.toggle('drag-over',el===q))});
 $('#swot-board').addEventListener('dragleave',event=>{if(!$('#swot-board').contains(event.relatedTarget))$$('[data-quadrant]').forEach(q=>q.classList.remove('drag-over'))});
 $('#swot-board').addEventListener('drop',event=>{nativeDrop(event);$$('[data-quadrant]').forEach(q=>q.classList.remove('drag-over'))});
 $('#swot-board').addEventListener('dblclick',event=>{const c=event.target.closest('[data-factor]');if(c){selectFactor(c.dataset.factor);$('#edit-text').focus();$('#edit-text').select()}});
 document.addEventListener('keydown',event=>{
  const typing=event.target.closest?.('input,textarea,select,[contenteditable="true"]');
  if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s'){event.preventDefault();flushInspector();persist();toast('Project saved on this device.')}
  if(!typing&&(event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'){event.preventDefault();event.shiftKey?redo():undo()}
  if(!typing&&(event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='y'){event.preventDefault();redo()}
  const card=event.target.closest?.('[data-factor]');
  if(card&&!typing&&(event.key==='Enter'||event.key===' ')){event.preventDefault();selectFactor(card.dataset.factor);$('#edit-text').focus();}
  if(!typing&&card&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)){
   event.preventDefault();const n=project().factors.find(f=>f.id===card.dataset.factor),step=event.shiftKey?1:5;
   change(p=>repositionFactor(p,n.id,n.quadrant,n.x+(event.key==='ArrowLeft'?-step:event.key==='ArrowRight'?step:0),n.y+(event.key==='ArrowUp'?-step:event.key==='ArrowDown'?step:0)));
  }
  if(!typing&&event.key==='Escape'&&state.selectedFactor){state.selectedFactor='';renderBoard();renderInspector();}
 });
 window.addEventListener('resize',()=>{if(state.view==='board')drawConnections()});
}
load();bind();persist();render();
