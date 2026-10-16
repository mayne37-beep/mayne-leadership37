import {VERSION,LIMIT,TYPES,TAGS,PHASES,RISK_STATUSES,RUBRIC,copy,clean,clamp,integer,escapeHTML as e,today,createProject,addCriterion,addOption,setRating,deleteOption,deleteCriterion,addNode,updateNode,deleteNode,organizeTree,scoreMatrix,evaluateTree,makeScenario,addScenario,activeScenario,setScenarioOverride,makeRisk,addRisk,makeTeam,addTeam,teamScore,rankedTeams,addInject,addDecision,removeRecord,normalizeProject,sampleProject} from './decision-intelligence-model.js';
import {trim,option,empty,statsHTML,treeNodesHTML,treeLinksHTML,treeResultsHTML,diagramSVG,criteriaHTML,rankingHTML,matrixHTML,scenarioControlsHTML,scenarioResultsHTML,risksHTML,briefPreviewHTML,decisionLogHTML,teamsHTML,injectsHTML,reportHTML} from './decision-intelligence-render.js';
const $=q=>document.querySelector(q),$$=q=>[...document.querySelectorAll(q)];
const KEY='mayne.decision-intelligence.v1',SWOT='mayne.swot-tows-studio.v1';
const VIEWS={tree:['VISUAL REASONING','Explore the possible paths.','Connect decisions, uncertainty, and consequences.'],matrix:['EVIDENCE-AWARE COMPARISON','Rate the alternatives.','Weigh trade-offs and document evidence for each estimate.'],scenarios:['SENSITIVITY ANALYSIS','Challenge the assumptions.','Explore hypothetical changes without overwriting your baseline.'],premortem:['FAILURE ANTICIPATION','Imagine the decision failed.','List likely failure causes, early signs, and safeguards.'],brief:['DECISION GOVERNANCE','Present an accountable recommendation.','Record the decision, challenges, and review triggers.'],challenge:['CLASSROOM DECISION CHALLENGE','Defend the recommendation.','Compare team responses to surprise developments.']};
const PROMPTS=['Which assumption could reverse the preferred option?','Who could bear the greatest unintended cost?','What evidence would change your mind?','Which alternative have we neglected?','Are the probabilities justified by evidence?','What warning sign should trigger a review?','How would your decision change with a smaller budget?'];
const S={projects:[],id:'',view:'tree',selected:'',history:[],future:[],editor:null,drag:null};let toastHandle,qIndex=0;
function p(){return S.projects.find(x=>x.id===S.id)||S.projects[0]}
function node(){return p().nodes.find(n=>n.id===S.selected)}
function toast(message){const t=$('#toast');t.textContent=message;t.classList.add('show');clearTimeout(toastHandle);toastHandle=setTimeout(()=>t.classList.remove('show'),3300)}
function load(){try{const value=JSON.parse(localStorage.getItem(KEY)||'null');if(value?.projects?.length){S.projects=value.projects.slice(0,LIMIT.projects).map(x=>normalizeProject(x));S.id=S.projects.find(x=>x.id===value.activeId)?.id||S.projects[0].id;return}}catch(err){console.warn('Saved projects unavailable',err)}const v=createProject();S.projects=[v];S.id=v.id}
function persist(){p().updated=new Date().toISOString();try{localStorage.setItem(KEY,JSON.stringify({version:VERSION,activeId:S.id,projects:S.projects}));$('#save-status').textContent='✓ Saved on this device';$('#save-status').classList.remove('error');return true}catch(err){$('#save-status').textContent='⚠ Save failed · Export backup';$('#save-status').classList.add('error');toast('Local save failed. Export a backup.');return false}}
function change(fn){const current=p(),before=copy(current);let result;try{result=fn(current)}catch(err){S.projects[S.projects.indexOf(current)]=before;toast(err.message);render();return false}if(JSON.stringify(before)!==JSON.stringify(p())){S.history.push(before);if(S.history.length>65)S.history.shift();S.future=[];persist()}render();return result===undefined?true:result}
function undo(){if(!S.history.length)return;const current=p(),i=S.projects.indexOf(current),previous=S.history.pop();S.future.push(copy(current));S.projects[i]=previous;if(!previous.nodes.some(n=>n.id===S.selected))S.selected='';persist();render()}
function redo(){if(!S.future.length)return;const current=p(),i=S.projects.indexOf(current),next=S.future.pop();S.history.push(copy(current));S.projects[i]=next;if(!next.nodes.some(n=>n.id===S.selected))S.selected='';persist();render()}
function newProject(value=createProject()){if(S.projects.length>=LIMIT.projects){toast('Project library is full. Export or remove a project.');return false}S.projects.unshift(value);S.id=value.id;S.selected=value.nodes[0]?.id||'';S.view='tree';S.history=[];S.future=[];persist();render();close('#library-dialog');toast('Decision project ready.');return true}
function switchProject(id){if(!S.projects.some(x=>x.id===id))return;S.id=id;S.view='tree';S.selected=p().nodes[0]?.id||'';S.history=[];S.future=[];persist();render();close('#library-dialog')}
function deleteProject(id){const x=S.projects.find(x=>x.id===id);if(!x||!confirm('Delete "'+x.title+'" and all its decision work?'))return;S.projects=S.projects.filter(x=>x.id!==id);if(!S.projects.length)S.projects=[createProject()];if(S.id===id)S.id=S.projects[0].id;S.history=[];S.future=[];S.selected='';S.view='tree';persist();render();library()}
function setView(v){if(!VIEWS[v])return;S.view=v;render()}
function render(){
 const project=p();$('#project-name').value=project.title;$('#hero-stats').innerHTML=statsHTML(project);
 for(const [id,key] of [['decision-question','question'],['decision-objective','objective'],['decision-context','context'],['decision-owner','owner'],['decision-deadline','deadline'],['decision-status','status']])$('#'+id).value=project[key]||'';
 $$('[data-view]').forEach(b=>{const active=b.dataset.view===S.view;b.classList.toggle('active',active);b.setAttribute('aria-current',active?'page':'false')});
 for(const k of Object.keys(VIEWS))$('#'+k+'-view').hidden=S.view!==k;
 const meta=VIEWS[S.view];$('#view-kicker').textContent=meta[0];$('#view-title').textContent=meta[1];$('#view-description').textContent=meta[2];
 const order=Object.keys(VIEWS),idx=order.indexOf(S.view);
 $('#view-actions').innerHTML='<button type="button" data-go="'+order[(idx+1)%order.length]+'">'+(idx===order.length-1?'Back to tree':'Next step')+' →</button>';
 renderTree();renderMatrix();renderScenarios();renderPremortem();renderBrief();renderChallenge();renderInspector();
 $('#undo-button').disabled=!S.history.length;$('#redo-button').disabled=!S.future.length;
 const check=evaluateTree(project),rank=scoreMatrix(project);
 const notes=[];if(!project.question)notes.push('Clarify the decision question.');if(!rank.valid)notes.push('Add criteria, options and a positive weight.');
 if(check.warnings.length)notes.push(check.warnings.length+' tree calculations need review.');
 if(!project.risks.length)notes.push('Run a pre-mortem.');if(!project.brief.reviewTrigger)notes.push('Set a review trigger.');
 $('#insight-panel').innerHTML='<h3>Decision checks</h3>'+notes.map(n=>'<p>◉ '+e(n)+'</p>').join('')+(!notes.length?'<p>✓ Core sections addressed; validate estimates and evidence.</p>':'');
}
function renderTree(){$('#tree-nodes').innerHTML=treeNodesHTML(p(),S.selected);$('#tree-links').innerHTML=treeLinksHTML(p());$('#tree-results').innerHTML=treeResultsHTML(p())}
function renderInspector(){const n=node(),parent=n?p().nodes.find(x=>x.id===n.parentId):null;$('#inspector-empty').hidden=!!n;$('#node-inspector').hidden=!n;if(!n)return;
 for(const [id,key] of [['node-title','title'],['node-type','type'],['node-prob','probability'],['node-utility','utility'],['node-evidence-tag','evidenceTag'],['node-evidence','evidence'],['node-notes','notes']])$('#'+id).value=n[key]??'';
 $('#chance-inspector').hidden=parent?.type!=='chance';$('#outcome-inspector').hidden=n.type!=='outcome';
 $('#node-add-child').disabled=n.type==='outcome';$('#node-delete').disabled=!n.parentId;
}
function renderMatrix(){$('#criteria-panel').innerHTML=criteriaHTML(p());$('#matrix-results').innerHTML=rankingHTML(p());$('#matrix-grid').innerHTML=matrixHTML(p())}
function renderScenarios(){
 const pr=p(),s=activeScenario(pr);
 $('#scenario-choice').innerHTML='<option value="">Baseline — original assessment</option>'+pr.scenarios.map(x=>option(x.id,x.title,pr.activeScenario)).join('');
 $('#scenario-choice').value=s?.id||'';$('#scenario-delete').disabled=!s;$('#scenario-editor').hidden=!s;
 if(s){$('#scenario-title').value=s.title;$('#scenario-description').value=s.description;
  const controls=scenarioControlsHTML(pr,s);$('#scenario-weights').innerHTML=controls.weight;$('#scenario-scores').innerHTML=controls.score;$('#scenario-tree').innerHTML=controls.tree;}
 $('#scenario-results').innerHTML=scenarioResultsHTML(pr,s);
}
function renderPremortem(){$('#risk-list').innerHTML=risksHTML(p())}
function renderBrief(){const pr=p(),b=pr.brief;$('#brief-preview').innerHTML=briefPreviewHTML(pr);
 $('#recommend-option').innerHTML='<option value="">Select alternative</option>'+pr.options.map(o=>option(o.id,o.name,b.recommendationId)).join('');
 for(const [id,key] of [['brief-recommendation','recommendation'],['brief-dissent','dissent'],['brief-assumptions','assumptions'],['brief-trigger','reviewTrigger'],['brief-accountable','accountable'],['brief-review-date','reviewDate'],['brief-result','result']])$('#'+id).value=b[key]||'';
 $('#decision-log').innerHTML=decisionLogHTML(pr);
}
function renderChallenge(){$('#team-list').innerHTML=teamsHTML(p());$('#inject-list').innerHTML=injectsHTML(p())}
function selectNode(id){if(!p().nodes.some(n=>n.id===id))return;S.selected=id;$$('[data-node]').forEach(card=>card.classList.toggle('selected',card.dataset.node===id));renderInspector()}
function addBranch(type,parentId=S.selected){
 const parent=p().nodes.find(n=>n.id===parentId)||p().nodes[0];
 if(!parent||parent.type==='outcome'){toast('Select a non-terminal decision or chance node.');return;}
 const siblings=p().nodes.filter(n=>n.parentId===parent.id).length;
 let fresh;const done=change(pr=>fresh=addNode(pr,parent.id,type,{title:type==='decision'?'Decision point':type==='chance'?'Uncertain event':'Possible outcome',x:parent.x+305,y:parent.y+(siblings%2?1:-1)*(115+siblings*48)}));
 if(done){S.selected=fresh.id;render();focus(fresh.id);}
}
function focus(id){const n=p().nodes.find(n=>n.id===id),box=$('#tree-frame');if(!n)return;box.scrollTo?.({left:Math.max(0,n.x-box.clientWidth/2),top:Math.max(0,n.y-box.clientHeight/2),behavior:'smooth'})}
function position(ev){const box=$('#tree-frame'),r=box.getBoundingClientRect();return {x:ev.clientX-r.left+box.scrollLeft,y:ev.clientY-r.top+box.scrollTop}}
function pointerDown(ev){
 if(ev.button!==0)return;const grip=ev.target.closest?.('[data-move-node]');if(!grip)return;const n=p().nodes.find(x=>x.id===grip.dataset.moveNode);if(!n)return;
 const pos=position(ev);S.drag={id:n.id,x:pos.x,y:pos.y,originalX:n.x,originalY:n.y,moved:false,before:copy(p())};selectNode(n.id);
 try{$('#tree-frame').setPointerCapture(ev.pointerId)}catch{}ev.preventDefault();
}
function pointerMove(ev){
 const drag=S.drag;if(!drag)return;const pos=position(ev),dx=pos.x-drag.x,dy=pos.y-drag.y;
 if(!drag.moved&&Math.abs(dx)+Math.abs(dy)<4)return;drag.moved=true;
 const x=clamp(drag.originalX+dx,112,1786),y=clamp(drag.originalY+dy,67,1465),n=p().nodes.find(n=>n.id===drag.id);
 if(!n)return;n.x=x;n.y=y;
 const card=$('[data-node="'+drag.id+'"]');if(card){card.style.left=x+'px';card.style.top=y+'px'}
 $('#tree-links').innerHTML=treeLinksHTML(p());
}
function pointerUp(ev,cancel=false){
 const drag=S.drag;if(!drag)return;S.drag=null;try{$('#tree-frame').releasePointerCapture(ev.pointerId)}catch{}
 if(cancel){S.projects[S.projects.findIndex(x=>x.id===S.id)]=drag.before;render();return;}
 if(drag.moved&&JSON.stringify(drag.before)!==JSON.stringify(p())){S.history.push(drag.before);S.future=[];persist();render()}else renderTree();
}
function show(q){const d=$(q);if(d&&!d.open)d.showModal()}
function close(q){const d=$(q);if(d?.open)d.close()}
function library(){$('#library-items').innerHTML=S.projects.map(x=>'<div class="library-item"><div><strong>'+e(x.title)+'</strong><small>'+x.options.length+' options · '+x.criteria.length+' criteria · '+x.nodes.length+' tree nodes</small></div><button data-open-project="'+e(x.id)+'">'+(S.id===x.id?'Current':'Open')+'</button><button data-copy-project="'+e(x.id)+'">Copy</button><button data-delete-project="'+e(x.id)+'" class="danger">×</button></div>').join('')}
const F={text:(label,k,v='',max=200)=>'<label>'+e(label)+'<input type="text" name="'+k+'" maxlength="'+max+'" value="'+e(v)+'"></label>',textarea:(label,k,v='',max=1000)=>'<label>'+e(label)+'<textarea name="'+k+'" rows="3" maxlength="'+max+'">'+e(v)+'</textarea></label>',number:(label,k,v=3,min=0,max=100)=>'<label>'+e(label)+'<input type="number" name="'+k+'" min="'+min+'" max="'+max+'" value="'+v+'"></label>',date:(label,k,v='')=>'<label>'+e(label)+'<input type="date" name="'+k+'" value="'+e(v)+'"></label>',select:(label,k,v='',values=[])=>'<label>'+e(label)+'<select name="'+k+'">'+values.map(x=>option(x[0],x[1],v)).join('')+'</select></label>'};
const en=a=>a.map(x=>[x,x]);
function edit(kind,id='',other=''){
 const pr=p(),v=(kind==='criterion'?pr.criteria.find(x=>x.id===id):kind==='option'?pr.options.find(x=>x.id===id):kind==='evidence'?pr.options.find(x=>x.id===id)?.ratings[other]:pr[kind+'s']?.find(x=>x.id===id))||{};
 S.editor={kind,id,other};let body='';
 if(kind==='criterion')body=F.text('Criterion name','name',v.name,100)+F.select('Direction','direction',v.direction||'Benefit',[['Benefit','Benefit · larger is preferred'],['Cost','Cost · smaller is preferred']])+F.number('Weight','weight',v.weight??20,0,100)+F.textarea('Description','explanation',v.explanation,600);
 if(kind==='option')body=F.text('Alternative','name',v.name,150)+F.textarea('Description','description',v.description,900)+F.textarea('Rationale','rationale',v.rationale,1100);
 if(kind==='evidence')body=F.select('Source quality','tag',v.tag||'Assumption',en(TAGS))+F.number('Rating 1–5','score',v.score??3,1,5)+F.textarea('Evidence and reasoning','note',v.note,900);
 if(kind==='risk')body=F.textarea('Imagined failure','failure',v.failure,250)+F.number('Likelihood','likelihood',v.likelihood??3,1,5)+F.number('Impact','impact',v.impact??3,1,5)+F.textarea('Early warning','warning',v.warning,900)+F.textarea('Safeguard','safeguard',v.safeguard,1000)+F.text('Owner','owner',v.owner,100)+F.select('Status','status',v.status||'Open',en(RISK_STATUSES));
 if(kind==='team')body=F.text('Team name','name',v.name,110)+F.textarea('Recommendation','recommendation',v.recommendation,1800)+F.textarea('Evidence','evidence',v.evidence,1200)+F.textarea('Trade-offs','tradeoffs',v.tradeoffs,1100);
 if(kind==='inject')body=F.text('Inject title','title',v.title,110)+F.textarea('New information or surprise','message',v.message,1100);
 if(kind==='decision')body=F.date('Decision date','date',v.date||today())+F.textarea('Decision','decision',v.decision,1300)+F.text('Decision owner','owner',v.owner,110)+F.textarea('Rationale / hypothesis','hypothesis',v.hypothesis,1000)+F.date('Review on','reviewOn',v.reviewOn)+F.textarea('Observed outcome','outcome',v.outcome,1500);
 $('#editor-title').textContent=(id?'Edit ':'Add ')+kind;$('#editor-fields').innerHTML=body;show('#editor-dialog');
}
function saveEditor(){
 const ed=S.editor;if(!ed)return;const f=new FormData($('#editor-form')),v=Object.fromEntries(f.entries());
 for(const k of Object.keys(v))v[k]=clean(v[k],1800);
 const required={criterion:'name',option:'name',risk:'failure',team:'name',inject:'title',decision:'decision'};
 if(required[ed.kind]&&!String(v[required[ed.kind]]||'').trim()){toast('Enter the required title or description.');return;}
 const done=change(pr=>{
  if(ed.kind==='evidence'){if(!setRating(pr,ed.id,ed.other,v))throw Error('Rating not found.');return;}
  if(ed.kind==='criterion'){if(ed.id){const c=pr.criteria.find(x=>x.id===ed.id);Object.assign(c,v,{weight:integer(v.weight,0,100,c.weight)});}else addCriterion(pr,v.name,v);return;}
  if(ed.kind==='option'){if(ed.id){const o=pr.options.find(x=>x.id===ed.id);Object.assign(o,v);}else addOption(pr,v.name,v);return;}
  if(ed.id){const x=pr[ed.kind+'s'].find(x=>x.id===ed.id);if(!x)throw Error('Entry missing.');Object.assign(x,v);
   if(ed.kind==='risk'){x.likelihood=integer(v.likelihood,1,5,3);x.impact=integer(v.impact,1,5,3);}
  }else({risk:addRisk,team:addTeam,inject:addInject,decision:addDecision})[ed.kind](pr,v);
 });
 if(done){S.editor=null;close('#editor-dialog');toast('Saved.');}
}
const stem=()=>p().title.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,50)||'decision-intelligence';
function download(data,name,type='text/plain;charset=utf-8'){const blob=data instanceof Blob?data:new Blob([data],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1900)}
const csv=rows=>'\ufeff'+rows.map(row=>row.map(x=>'"'+String(x??'').replace(/"/g,'""')+'"').join(',')).join('\r\n');
function exportFile(kind){
 close('#export-dialog');const pr=p();
 if(kind==='json'){download(JSON.stringify({kind:'mayne-decision-intelligence',version:VERSION,project:pr},null,2),stem()+'.decision.json','application/json');return;}
 if(kind==='report'){$('#print-report').innerHTML=reportHTML(pr);window.print();return;}
 if(kind==='svg'){download('<?xml version="1.0" encoding="UTF-8"?>\n'+diagramSVG(pr,activeScenario(pr)),stem()+'-tree.svg','image/svg+xml;charset=utf-8');return;}
 if(kind==='png'){exportPNG();return;}
 if(kind==='matrix'){
  const scores=new Map(scoreMatrix(pr).ranking.map(o=>[o.id,o.score]));
  const rows=[['Alternative','Weighted score',...pr.criteria.flatMap(c=>[c.name+' rating',c.name+' tag',c.name+' evidence'])],
   ...pr.options.map(o=>[o.name,scores.get(o.id),...pr.criteria.flatMap(c=>[o.ratings[c.id]?.score,o.ratings[c.id]?.tag,o.ratings[c.id]?.note])])];
  download(csv(rows),stem()+'-matrix.csv','text/csv;charset=utf-8');return;
 }
 if(kind==='risks'){download(csv([['Failure','Likelihood','Impact','Warning','Safeguard','Owner','Status'],
  ...pr.risks.map(x=>[x.failure,x.likelihood,x.impact,x.warning,x.safeguard,x.owner,x.status])]),stem()+'-premortem.csv','text/csv;charset=utf-8');return;}
 if(kind==='teams'){download(csv([['Team','Recommendation','Evidence','Trade-offs',...RUBRIC,'Total /20'],
  ...rankedTeams(pr).map(t=>[t.name,t.recommendation,t.evidence,t.tradeoffs,...RUBRIC.map(k=>t.scores[k]),teamScore(t)])]),stem()+'-teams.csv','text/csv;charset=utf-8');}
}
async function exportPNG(){
 const markup=diagramSVG(p(),activeScenario(p())),url=URL.createObjectURL(new Blob([markup],{type:'image/svg+xml;charset=utf-8'}));
 try{const img=new Image();await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(Error('SVG render failed.'));img.src=url});
  const canvas=document.createElement('canvas');canvas.width=2850;canvas.height=2280;const ctx=canvas.getContext('2d');
  if(!ctx)throw Error('Canvas unavailable');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw Error('PNG encoding failed.');
  download(blob,stem()+'-tree.png','image/png');toast('Diagram exported.');
 }catch(err){toast('PNG export failed: '+err.message)}finally{URL.revokeObjectURL(url)}
}
async function importFile(file){
 if(!file)return;if(file.size>4e6){toast('Backup exceeds 4 MB.');return;}
 try{const raw=JSON.parse(await file.text()),result=normalizeProject(raw.kind==='mayne-decision-intelligence'?raw.project:raw,{regenerate:true});
  if(confirm('Import "'+result.title+'" as a new editable project?'))newProject(result);
 }catch(err){toast('Import failed: '+err.message);}
}
function importSwot(){
 let source;try{source=JSON.parse(localStorage.getItem(SWOT)||'null')}catch{}
 const swot=source?.projects?.find(x=>x.id===source.activeId)||source?.projects?.[0];
 if(!swot?.strategies?.length){toast('No locally saved SWOT/TOWS strategies found.');return;}
 const list=swot.strategies.filter(s=>s.title).slice(0,Math.max(0,LIMIT.options-p().options.length));
 if(!list.length){toast('No importable alternatives or no room.');return;}
 if(!confirm('Import up to '+list.length+' TOWS recommendations into your decision alternatives?'))return;
 let added=0;change(pr=>{for(const item of list)if(!pr.options.some(o=>o.name.toLowerCase()===item.title.toLowerCase())){addOption(pr,item.title,{description:item.rationale});added++;}});
 $('#import-feedback').textContent='Imported '+added+' editable option(s). Validate their ratings and assumptions.';
 toast('Imported '+added+' alternative(s).');
}
function clickHandler(ev){
 const t=ev.target,closer=t.closest('[data-close]');if(closer){close('#'+closer.dataset.close);return;}
 const view=t.closest('[data-view]'),go=t.closest('[data-go]');if(view||go){setView(view?.dataset.view||go.dataset.go);return;}
 const branch=t.closest('[data-add-branch]');if(branch){const parent=p().nodes.find(n=>n.id===branch.dataset.addBranch);if(parent)addBranch(parent.type==='chance'?'outcome':'chance',parent.id);return;}
 const card=t.closest('[data-node]');if(card&&!t.closest('textarea')){selectNode(card.dataset.node);return;}
 for(const [attr,action] of [['openProject','open'],['copyProject','copy'],['deleteProject','delete']]){
  const el=t.closest('[data-'+attr.replace(/[A-Z]/g,c=>'-'+c.toLowerCase())+']');if(!el)continue;
  const id=el.dataset[attr];if(action==='open')switchProject(id);
  if(action==='copy'){const src=S.projects.find(p=>p.id===id);if(src){const duplicate=normalizeProject(src,{regenerate:true});duplicate.title+=' (copy)';newProject(duplicate);}}
  if(action==='delete')deleteProject(id);return;
 }
 const add=t.closest('[data-new-criterion],[data-new-option],[data-new-risk],[data-new-team],[data-new-inject],[data-new-decision]');
 if(add){const map={newCriterion:'criterion',newOption:'option',newRisk:'risk',newTeam:'team',newInject:'inject',newDecision:'decision'};edit(map[Object.keys(add.dataset).find(k=>map[k])]);return;}
 for(const [kind,attr] of [['criterion','Criterion'],['option','Option'],['risk','Risk'],['team','Team'],['inject','Inject'],['decision','Decision']]){
  const editButton=t.closest('[data-edit-'+kind+']');if(editButton){edit(kind,editButton.dataset['edit'+attr]);return;}
  const removeButton=t.closest('[data-remove-'+kind+']');if(removeButton){if(confirm('Delete this '+kind+'?')){
   const id=removeButton.dataset['remove'+attr];change(pr=>{
    if(kind==='criterion')deleteCriterion(pr,id);else if(kind==='option')deleteOption(pr,id);else removeRecord(pr,kind+'s',id);
   });}return;}
 }
 const evidence=t.closest('[data-evidence-option]');if(evidence){edit('evidence',evidence.dataset.evidenceOption,evidence.dataset.evidenceCriterion);return;}
 const reveal=t.closest('[data-reveal-inject]');if(reveal){change(pr=>{const record=pr.injects.find(n=>n.id===reveal.dataset.revealInject);if(record)record.revealed=!record.revealed;});return;}
 const exportBtn=t.closest('[data-export]');if(exportBtn)exportFile(exportBtn.dataset.export);
}
function updateScenario(kind,a,b,v){const sc=activeScenario(p());if(!sc)return;change(pr=>setScenarioOverride(pr,sc.id,kind,a,b,v))}
function changed(ev){
 const t=ev.target;
 if(t.dataset.inlineTitle){change(pr=>updateNode(pr,t.dataset.inlineTitle,{title:t.value}));return;}
 if(t.dataset.weight){change(pr=>{const c=pr.criteria.find(c=>c.id===t.dataset.weight);if(c)c.weight=integer(t.value,0,100,c.weight);});return;}
 if(t.dataset.rating){change(pr=>setRating(pr,t.dataset.rating,t.dataset.criterion,{score:t.value}));return;}
 if(t.dataset.riskStatus){change(pr=>{const r=pr.risks.find(r=>r.id===t.dataset.riskStatus);if(r&&RISK_STATUSES.includes(t.value))r.status=t.value;});return;}
 if(t.dataset.teamScore){change(pr=>{const team=pr.teams.find(x=>x.id===t.dataset.teamScore);if(team&&RUBRIC.includes(t.dataset.rubric))team.scores[t.dataset.rubric]=integer(t.value,0,5,0);});return;}
 if(t.dataset.scenarioWeight){updateScenario('weight',t.dataset.scenarioWeight,null,t.value);return;}
 if(t.dataset.scenarioScore){updateScenario('score',t.dataset.scenarioScore,t.dataset.scenarioCriterion,t.value);return;}
 if(t.dataset.scenarioProbability){updateScenario('probability',t.dataset.scenarioProbability,null,t.value);return;}
 if(t.dataset.scenarioUtility){updateScenario('utility',t.dataset.scenarioUtility,null,t.value);}
}
function bind(){
 $('#new-project').onclick=()=>newProject();$('#projects-button').onclick=()=>{library();show('#library-dialog')};
 $('#library-new').onclick=()=>newProject();$('#library-import').onclick=()=>$('#import-file').click();
 $('#import-file').onchange=ev=>{importFile(ev.target.files?.[0]);ev.target.value='';};
 $('#undo-button').onclick=undo;$('#redo-button').onclick=redo;$('#export-button').onclick=()=>show('#export-dialog');
 $('#coach-next').onclick=()=>$('#coach-question').textContent=PROMPTS[++qIndex%PROMPTS.length];
 $('#import-swot').onclick=importSwot;$('#project-name').onchange=ev=>change(pr=>pr.title=clean(ev.target.value.trim(),140)||'Untitled decision analysis');
 for(const [id,key,len] of [['decision-question','question',1400],['decision-objective','objective',1300],['decision-context','context',1800],['decision-owner','owner',110],['decision-deadline','deadline',10],['decision-status','status',40]])$('#'+id).onchange=ev=>change(pr=>pr[key]=clean(ev.target.value,len));
 $('#tree-add-decision').onclick=()=>addBranch('decision');$('#tree-add-chance').onclick=()=>addBranch('chance');
 $('#tree-add-outcome').onclick=()=>addBranch('outcome');$('#node-add-child').onclick=()=>addBranch(node()?.type==='chance'?'outcome':'chance');
 $('#tree-organize').onclick=()=>change(pr=>organizeTree(pr));$('#tree-fit').onclick=()=>focus(S.selected||p().nodes[0]?.id);
 $('#node-delete').onclick=()=>{const current=node();if(!current?.parentId||!confirm('Delete this node and all branches below it?'))return;change(pr=>deleteNode(pr,current.id));S.selected=p().nodes[0]?.id||'';render()};
 for(const [id,key] of [['node-title','title'],['node-type','type'],['node-prob','probability'],['node-utility','utility'],['node-evidence-tag','evidenceTag'],['node-evidence','evidence'],['node-notes','notes']])$('#'+id).onchange=ev=>change(pr=>updateNode(pr,S.selected,{[key]:ev.target.value}));
 $('#new-option').onclick=()=>edit('option');$('#new-criterion').onclick=()=>edit('criterion');
 $('#reset-criteria').onclick=()=>change(pr=>pr.criteria.forEach(c=>c.weight=Math.round(100/Math.max(1,pr.criteria.length))));
 $('#scenario-choice').onchange=ev=>change(pr=>pr.activeScenario=ev.target.value);
 $('#scenario-new').onclick=()=>change(pr=>addScenario(pr,'New planning scenario'));
 $('#scenario-delete').onclick=()=>{const sc=activeScenario(p());if(!sc||!confirm('Delete this scenario?'))return;change(pr=>{pr.scenarios=pr.scenarios.filter(x=>x.id!==sc.id);pr.activeScenario='';});};
 $('#scenario-title').onchange=ev=>change(pr=>{const sc=activeScenario(pr);if(sc)sc.title=clean(ev.target.value,130)||'New scenario';});
 $('#scenario-description').onchange=ev=>change(pr=>{const sc=activeScenario(pr);if(sc)sc.description=clean(ev.target.value,1000);});
 $('#new-risk').onclick=()=>edit('risk');$('#new-team').onclick=()=>edit('team');$('#new-inject').onclick=()=>edit('inject');$('#new-decision').onclick=()=>edit('decision');
 for(const [id,key] of [['recommend-option','recommendationId'],['brief-recommendation','recommendation'],['brief-dissent','dissent'],['brief-assumptions','assumptions'],['brief-trigger','reviewTrigger'],['brief-accountable','accountable'],['brief-review-date','reviewDate'],['brief-result','result']])$('#'+id).onchange=ev=>change(pr=>pr.brief[key]=clean(ev.target.value,1800));
 $('#editor-form').onsubmit=ev=>{ev.preventDefault();saveEditor()};
 document.addEventListener('click',clickHandler);document.addEventListener('change',changed);
 document.addEventListener('input',ev=>{const t=ev.target;if(t.dataset.weight||t.dataset.scenarioWeight||t.dataset.scenarioScore||t.dataset.scenarioProbability){const el=t.nextElementSibling;if(el?.tagName==='OUTPUT')el.textContent=t.value;}});
 $('#tree-frame').addEventListener('pointerdown',pointerDown);$('#tree-frame').addEventListener('pointermove',pointerMove);
 $('#tree-frame').addEventListener('pointerup',pointerUp);$('#tree-frame').addEventListener('pointercancel',ev=>pointerUp(ev,true));
 $('#tree-frame').addEventListener('lostpointercapture',ev=>{if(S.drag)pointerUp(ev)});
 $('#tree-nodes').addEventListener('dblclick',ev=>{const card=ev.target.closest('[data-node]');if(card){selectNode(card.dataset.node);card.querySelector('textarea')?.focus();}});
 document.addEventListener('keydown',ev=>{
  const typing=ev.target.closest?.('input,textarea,select,[contenteditable="true"]');
  if((ev.ctrlKey||ev.metaKey)&&ev.key.toLowerCase()==='s'){ev.preventDefault();persist();toast('Project saved.');return;}
  if(!typing&&(ev.ctrlKey||ev.metaKey)&&ev.key.toLowerCase()==='z'){ev.preventDefault();ev.shiftKey?redo():undo();return;}
  if(!typing&&(ev.ctrlKey||ev.metaKey)&&ev.key.toLowerCase()==='y'){ev.preventDefault();redo();return;}
  const card=ev.target.closest?.('[data-node]');
  if(card&&!typing&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(ev.key)){
   ev.preventDefault();const n=p().nodes.find(x=>x.id===card.dataset.node),step=ev.shiftKey?5:20;
   if(n)change(pr=>updateNode(pr,n.id,{x:n.x+(ev.key==='ArrowLeft'?-step:ev.key==='ArrowRight'?step:0),y:n.y+(ev.key==='ArrowUp'?-step:ev.key==='ArrowDown'?step:0)}));
  }
 });
}
load();S.selected=p().nodes[0]?.id||'';bind();persist();render();
