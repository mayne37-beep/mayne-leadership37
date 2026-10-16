import {WIDTH,HEIGHT,MAX_MAPS,SHAPES,COLORS,MATRICES,createMap,createNode,placeNode,moveNode,resizeNode,removeNode,linkNodes,mapStats,normalizeMap,sampleMap,quadrantSummary,copy,escapeHTML as esc,uid} from './stakeholder-model.js';
import {renderMapSVG,exportSVGMarkup,svgPointFromClient} from './stakeholder-svg.js';

const $=q=>document.querySelector(q),$$=q=>[...document.querySelectorAll(q)];
const KEY='mayne.stakeholder-mapping.v1',ZMIN=.42,ZMAX=3;
const S={maps:[],id:'',selected:'',pane:'map',tool:'select',view:{x:0,y:0,w:WIDTH,h:HEIGHT},history:[],future:[],drag:null,space:false,inspectorDraft:null};
let toastTimer=null;
function map(){return S.maps.find(m=>m.id===S.id)||S.maps[0]}
function selected(){return map().nodes.find(n=>n.id===S.selected)}
function notify(message){const t=$('#toast');t.textContent=message;t.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('show'),3000)}
function load(){
 try{const raw=JSON.parse(localStorage.getItem(KEY)||'null');
  if(raw&&Array.isArray(raw.maps)&&raw.maps.length){
   const maps=raw.maps.slice(0,MAX_MAPS).map(m=>normalizeMap(m));
   S.maps=maps;S.id=maps.find(m=>m.id===raw.id)?.id||maps[0].id;return;
  }
 }catch(e){console.warn('Stakeholder project library could not be read:',e)}
 const first=createMap();S.maps=[first];S.id=first.id;
}
function persist(){
 map().updated=new Date().toISOString();
 try{localStorage.setItem(KEY,JSON.stringify({version:1,maps:S.maps,id:S.id}));$('#save-status').textContent='✓ Saved on this device';$('#save-status').classList.remove('save-fail');return true}
 catch(e){$('#save-status').textContent='⚠ Save failed — export a backup';$('#save-status').classList.add('save-fail');notify('Could not save locally. Export your map to protect it.');return false}
}
function remember(snapshot){S.history.push(snapshot);if(S.history.length>75)S.history.shift();S.future=[];refreshHistory()}
function refreshHistory(){$('#undo').disabled=!S.history.length;$('#redo').disabled=!S.future.length}
function mutate(fn){
 const snapshot=copy(map());
 try{fn(map())}catch(err){S.maps[S.maps.indexOf(map())]=snapshot;notify(err.message);return false}
 remember(snapshot);persist();render();return true;
}
function undo(){
 if(!S.history.length)return;
 const current=map(),idx=S.maps.indexOf(current),before=S.history.pop();
 S.future.push(copy(current));S.maps[idx]=before;if(!before.nodes.some(n=>n.id===S.selected))S.selected='';persist();render();
}
function redo(){
 if(!S.future.length)return;
 const current=map(),idx=S.maps.indexOf(current),next=S.future.pop();
 S.history.push(copy(current));S.maps[idx]=next;if(!next.nodes.some(n=>n.id===S.selected))S.selected='';persist();render();
}
function resetView(){S.view={x:0,y:0,w:WIDTH,h:HEIGHT};updateView();renderZoom()}
function switchMap(id){if(!S.maps.some(x=>x.id===id))return;S.id=id;S.selected='';S.history=[];S.future=[];S.pane='map';resetView();persist();render();close('#library-dialog')}
function createProject(project=createMap()){
 if(S.maps.length>=MAX_MAPS){notify('Map library limit reached. Export or delete a map.');return}
 S.maps.unshift(project);S.id=project.id;S.selected='';S.history=[];S.future=[];S.pane='map';resetView();persist();render();close('#library-dialog');notify('New map created.');
}
function duplicateProject(){const next=normalizeMap(map(),{regenerate:true});next.name=map().name+' (copy)';createProject(next)}
function deleteProject(id){const p=S.maps.find(x=>x.id===id);if(!p||!confirm('Permanently delete “‘'+p.name+'” and its stakeholders?'))return;
 S.maps=S.maps.filter(x=>x.id!==id);if(!S.maps.length)S.maps=[createMap()];
 if(S.id===id)S.id=S.maps[0].id;S.selected='';S.history=[];S.future=[];resetView();persist();render();renderLibrary();notify('Map deleted.');
}
function addNew(label,role='',color='',where=null){
 const m=map(),i=m.nodes.length;
 const x=where?.x??(445+(i%5)*72),y=where?.y??(235+Math.floor(i/5)*88);
 const c=color||COLORS[i%COLORS.length].id;
 let newNode=null;
 const done=mutate(mm=>{newNode=placeNode(mm,createNode(label,x,y,{role,color:c,shape:i%6===0?'rounded':'rounded'}))});
 if(done){S.selected=newNode.id;render();notify('Stakeholder added. Drag it to position it.')}
}
function renderSummary(){const s=mapStats(map());
 $('#legend-colors').innerHTML=COLORS.map(c=>'<span title="'+esc(c.id)+'" style="background:'+c.line+'" aria-label="'+esc(c.id)+'"></span>').join('');
 $('#summary').innerHTML='<div><strong>'+s.total+'</strong><small>Stakeholders</small></div><div><strong>'+s.links+'</strong><small>Connections</small></div><div><strong>'+s.groups.length+'</strong><small>Groups</small></div>';
 $('#stake-count').textContent=s.total;
}
function renderList(){
 const q=$('#stake-search').value.trim().toLowerCase(),cmap=new Map(COLORS.map(c=>[c.id,c]));
 $('#stake-list').innerHTML=map().nodes.filter(n=>(n.label+' '+n.role+' '+n.group).toLowerCase().includes(q)).map(n=>{
  const c=cmap.get(n.color)||COLORS[0];
  return '<div class="stake-row '+(n.id===S.selected?'selected':'')+'" data-stake-item="'+esc(n.id)+'" draggable="true">'+
   '<span class="small-shape '+esc(n.shape)+'" style="--shape-line:'+c.line+';--shape-fill:'+c.fill+'" aria-hidden="true"></span>'+
   '<button type="button" data-select="'+esc(n.id)+'"><strong>'+esc(n.label)+'</strong><small>'+esc(n.role||n.group||'No role entered')+'</small></button><span class="row-grab" title="Drag onto the board">⠿</span></div>';
 }).join('')||'<p class="hint">No stakeholders found. Add your first one above.</p>';
}
function renderQuadrants(){
 const q=quadrantSummary(map());
 $('#quadrant-list').innerHTML=q.length?q.map(x=>'<div class="quad-card"><strong>'+esc(x.name)+'</strong><span>'+x.count+'</span></div>').join(''):
 '<div class="quad-card"><strong>Freeform board · organize stakeholders however you like</strong><span>'+map().nodes.length+'</span></div>';
}
function renderBoard(){
 const host=$('#map-host');host.innerHTML=renderMapSVG(map(),S.selected,S.view);
 $('#empty-board').hidden=map().nodes.length>0;
 const mode=MATRICES.find(m=>m.id===map().matrix)||MATRICES[0];
 $('#board-mode').textContent=mode.name;
 $('#matrix-select').value=map().matrix;
 renderQuadrants();renderZoom();
}
function updateLayers(){
 const svg=$('#stakeholder-svg');if(!svg)return;
 const container=document.createElement('div');container.innerHTML=renderMapSVG(map(),S.selected,S.view);
 const next=container.querySelector('svg');
 for(const id of ['node-layer','link-layer']){
  const oldLayer=svg.querySelector('#'+id),newLayer=next?.querySelector('#'+id);if(oldLayer&&newLayer)oldLayer.innerHTML=newLayer.innerHTML;
 }
}
function updateView(){const svg=$('#stakeholder-svg');if(svg){svg.setAttribute('viewBox',[S.view.x,S.view.y,S.view.w,S.view.h].join(' '));}}
function renderZoom(){
 const pct=Math.round(100*WIDTH/S.view.w);$('#zoom-value').textContent=pct+'%';
 $('#pan-tool').setAttribute('aria-pressed',String(S.tool==='pan'));
 $('#stakeholder-svg')?.classList.toggle('panning',S.tool==='pan');
}
function renderInspector(){
 const n=selected();
 $('#inspector-empty').hidden=!!n;
 $('#inspector-fields').hidden=!n;
 if(!n)return;
 for(const [id,key] of [['edit-label','label'],['edit-role','role'],['edit-group','group'],['edit-stance','stance'],['edit-approach','approach'],['edit-notes','notes']])$('#'+id).value=n[key]||'';
 $('#size-width').value=n.w;$('#size-height').value=n.h;$('#size-label').textContent=Math.round(n.w)+' × '+Math.round(n.h);
 $$('[data-shape]').forEach(b=>{const active=b.dataset.shape===n.shape;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active))});
 $('#color-picker').innerHTML=COLORS.map(c=>'<button type="button" data-color="'+c.id+'" style="--swatch:'+c.line+'" title="'+c.id+' color" aria-label="'+c.id+' color" aria-pressed="'+(c.id===n.color)+'" class="'+(c.id===n.color?'active':'')+'"></button>').join('');
 $('#link-target').innerHTML='<option value="">Select a stakeholder…</option>'+map().nodes.filter(x=>x.id!==n.id).map(x=>'<option value="'+esc(x.id)+'">'+esc(x.label)+'</option>').join('');
 $('#link-label').value='';
 $('#linked-list').innerHTML=map().links.filter(x=>x.from===n.id||x.to===n.id).map(l=>{
  const other=map().nodes.find(x=>x.id===(l.from===n.id?l.to:l.from));
  return '<div class="link-item"><span>'+esc(other?.label||'Stakeholder')+(l.label?' · '+esc(l.label):'')+'</span><button data-remove-link="'+esc(l.id)+'" title="Remove link" aria-label="Remove relationship" type="button">×</button></div>';
 }).join('')||'<p class="hint">No relationships yet.</p>';
}
function renderEngagement(){
 const cmap=new Map(COLORS.map(c=>[c.id,c]));
 $('#engagement-grid').innerHTML=map().nodes.length?map().nodes.map(n=>{
  const c=cmap.get(n.color)||COLORS[0];
  return '<article class="engagement-card"><span class="engagement-symbol" style="--engage-fill:'+c.fill+';--engage-line:'+c.line+'"></span><div><h3>'+esc(n.label)+'</h3>'+
  '<p>'+esc(n.role||n.group||'Stakeholder')+'</p><span class="e-pill">'+esc(n.stance)+'</span><p><strong>Engagement:</strong> '+esc(n.approach||'Not planned yet')+'</p>'+
  '<p><strong>Notes:</strong> '+esc(n.notes||'No notes entered')+'</p></div><button type="button" data-edit-engagement="'+esc(n.id)+'">Edit stakeholder ↗</button></article>';
 }).join(''):'<div class="inspector-empty"><strong>No stakeholders yet</strong><p>Start by adding people or groups on the mapping board.</p></div>';
}
function renderPane(){
 const mapOn=S.pane==='map';
 $('#map-panel').hidden=!mapOn;$('#engagement-panel').hidden=mapOn;
 $$('[data-pane]').forEach(b=>{const active=b.dataset.pane===S.pane;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active))});
 if(!mapOn)renderEngagement();
}
function renderLibrary(){
 $('#library-list').innerHTML=S.maps.map(p=>'<div class="library-item"><div><strong>'+esc(p.name)+'</strong><small>'+p.nodes.length+' stakeholders · Last saved '+esc(p.updated?.slice(0,10)||'')+'</small></div>'+
 '<button type="button" data-open-map="'+esc(p.id)+'" class="'+(p.id===S.id?'btn-primary':'')+'">'+(p.id===S.id?'Current':'Open')+'</button>'+
 '<button type="button" data-remove-map="'+esc(p.id)+'" class="danger" aria-label="Delete map">×</button></div>').join('');
}
function render(){
 const m=map();$('#map-title').value=m.name;
 renderSummary();renderList();renderBoard();renderInspector();renderPane();refreshHistory();
}
function setSelected(id){
 if(!map().nodes.some(n=>n.id===id))return;
 S.selected=id;updateLayers();renderInspector();renderList();
}
function fieldChanged(key,value){
 const n=selected();if(!n)return;
 if(!S.inspectorDraft)S.inspectorDraft=copy(map());
 if(key==='label'){n.label=String(value).slice(0,92)||'Unnamed stakeholder'}
 else if(key==='role'){n.role=String(value).slice(0,110)}
 else if(key==='group'){n.group=String(value).slice(0,90)}
 else if(key==='approach'){n.approach=String(value).slice(0,1300)}
 else if(key==='notes'){n.notes=String(value).slice(0,2300)}
 else if(key==='stance'){n.stance=String(value)}
 else return;
 updateLayers();if(['label','role','group'].includes(key))renderList();if(S.pane==='engagement')renderEngagement();
}
function saveFieldChange(){
 if(!S.inspectorDraft){persist();return;}
 const before=S.inspectorDraft;S.inspectorDraft=null;
 if(JSON.stringify(before)!==JSON.stringify(map())){remember(before);persist();renderSummary()}
}
function zoom(factor){
 const current=WIDTH/S.view.w,level=Math.max(ZMIN,Math.min(ZMAX,current*factor)),w=WIDTH/level,h=HEIGHT/level;
 const cx=S.view.x+S.view.w/2,cy=S.view.y+S.view.h/2;
 S.view={x:cx-w/2,y:cy-h/2,w,h};updateView();renderZoom();
}
function boardPointerDown(event){
 const svg=$('#stakeholder-svg');if(!svg)return;
 const resizing=event.target.closest('[data-resize]');
 const node=event.target.closest('[data-node]');
 if(event.button===2||S.tool==='pan'||S.space){
  event.preventDefault();S.drag={type:'pan',startX:event.clientX,startY:event.clientY,view:{...S.view}};svg.classList.add('pan-active');
 }else if(node||resizing){
  const id=resizing?.dataset.resize||node?.dataset.node;
  setSelected(id);const n=selected();if(!n)return;
  const p=svgPointFromClient(svg,event.clientX,event.clientY);
  S.drag={type:resizing?'resize':'move',id,start:p,node:{x:n.x,y:n.y,w:n.w,h:n.h},before:copy(map()),changed:false};event.preventDefault();
 }else{if(S.selected){S.selected='';updateLayers();renderInspector();renderList()}return}
 try{svg.setPointerCapture(event.pointerId)}catch{}
}
function boardPointerMove(event){
 if(!S.drag)return;
 const drag=S.drag,svg=$('#stakeholder-svg');if(!svg)return;
 if(drag.type==='pan'){
  const box=svg.getBoundingClientRect();const scale=Math.min(box.width/drag.view.w,box.height/drag.view.h)||1;
  S.view.x=drag.view.x-(event.clientX-drag.startX)/scale;
  S.view.y=drag.view.y-(event.clientY-drag.startY)/scale;
  updateView();return;
 }
 const p=svgPointFromClient(svg,event.clientX,event.clientY);
 const dx=p.x-drag.start.x,dy=p.y-drag.start.y;
 if(Math.abs(dx)<.2&&Math.abs(dy)<.2&&!drag.changed)return;
 if(drag.type==='move')moveNode(map(),drag.id,drag.node.x+dx,drag.node.y+dy);
 else resizeNode(map(),drag.id,drag.node.w+2*dx,drag.node.h+2*dy);
 drag.changed=true;updateLayers();
 $('#size-label').textContent=Math.round(selected()?.w||0)+' × '+Math.round(selected()?.h||0);
 if(selected()){ $('#size-width').value=selected().w;$('#size-height').value=selected().h; }
}
function finishPointer(event,cancel=false){
 if(!S.drag)return;
 const drag=S.drag;S.drag=null;const svg=$('#stakeholder-svg');
 try{if(svg?.hasPointerCapture?.(event.pointerId))svg.releasePointerCapture(event.pointerId)}catch{}
 svg?.classList.remove('pan-active');
 if(drag.type==='pan')return;
 if(cancel){S.maps[S.maps.findIndex(x=>x.id===S.id)]=drag.before;render();return}
 const actual=map().nodes.find(n=>n.id===drag.id);
 if(!actual)return;
 const moved=['x','y','w','h'].some(k=>Math.abs(actual[k]-drag.node[k])>.05);
 if(moved){remember(drag.before);persist();render();$('#board-message').textContent=drag.type==='resize'?'Shape resized':'Stakeholder moved'}
 else{updateLayers();renderInspector();renderList()}
}
function stageDrop(event){
 event.preventDefault();const raw=event.dataTransfer?.getData('application/x-mayne-stakeholder');if(!raw)return;
 let payload;try{payload=JSON.parse(raw)}catch{return}
 const svg=$('#stakeholder-svg');if(!svg)return;
 const point=svgPointFromClient(svg,event.clientX,event.clientY);
 if(payload.kind==='existing'){
  const found=map().nodes.find(n=>n.id===payload.id);if(!found)return;
  mutate(m=>moveNode(m,found.id,point.x,point.y));S.selected=found.id;render();notify('Stakeholder repositioned.');
 }else if(payload.kind==='new'){addNew(String(payload.label||'New stakeholder').slice(0,92),String(payload.role||'').slice(0,110),payload.color,point)}
}
function startDrag(event,payload){
 if(!event.dataTransfer)return;
 event.dataTransfer.effectAllowed='copyMove';
 event.dataTransfer.setData('application/x-mayne-stakeholder',JSON.stringify(payload));
 event.dataTransfer.setData('text/plain',payload.label||'Stakeholder');
}
function csv(rows){return '\ufeff'+rows.map(row=>row.map(cell=>'"'+String(cell??'').replace(/"/g,'""')+'"').join(',')).join('\r\n')}
function download(content,name,type){
 const blob=content instanceof Blob?content:new Blob([content],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
}
function fileStem(){return (map().name||'stakeholder-map').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,55)||'stakeholder-map'}
function exportCSV(){
 const rows=[['Name','Role','Group','Shape','Color','Stance','Quadrant','X','Y','Approach','Notes']];
 const matrix=MATRICES.find(x=>x.id===map().matrix)||MATRICES[0];
 for(const n of map().nodes){const quadrant=(n.y<HEIGHT/2?(n.x<WIDTH/2?0:1):(n.x<WIDTH/2?2:3));rows.push([n.label,n.role,n.group,n.shape,n.color,n.stance,matrix.quadrants[quadrant]||'',Math.round(n.x),Math.round(n.y),n.approach,n.notes])}
 download(csv(rows),fileStem()+'-stakeholders.csv','text/csv;charset=utf-8');
}
function exportJSON(){download(JSON.stringify({type:'mayne-stakeholder-map',map:map(),version:1},null,2),fileStem()+'.json','application/json')}
function exportSVG(){download('<?xml version="1.0" encoding="UTF-8"?>\n'+exportSVGMarkup(map()),fileStem()+'.svg','image/svg+xml;charset=utf-8')}
async function exportPNG(){
 const markup=exportSVGMarkup(map()),url=URL.createObjectURL(new Blob([markup],{type:'image/svg+xml;charset=utf-8'}));
 try{const img=new Image();
  await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(Error('Could not render the vector diagram.'));img.src=url});
  const canvas=document.createElement('canvas');canvas.width=WIDTH*2;canvas.height=HEIGHT*2;
  const context=canvas.getContext('2d');if(!context)throw Error('Canvas export is unavailable.');
  context.fillStyle='#f8fbff';context.fillRect(0,0,canvas.width,canvas.height);
  context.drawImage(img,0,0,canvas.width,canvas.height);
  const result=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
  if(!result)throw Error('PNG creation failed.');
  download(result,fileStem()+'.png','image/png');notify('High-resolution map downloaded.');
 }catch(error){notify(error.message)}finally{URL.revokeObjectURL(url)}
}
function exportReport(){
 const m=map(),s=mapStats(m),rows=m.nodes.map(n=>{
  const quad=n.y<HEIGHT/2?(n.x<WIDTH/2?0:1):(n.x<WIDTH/2?2:3);
  const matrix=MATRICES.find(x=>x.id===m.matrix)||MATRICES[0];
  return '<tr><td>'+esc(n.label)+'</td><td>'+esc(n.role)+'</td><td>'+esc(n.group)+'</td><td>'+esc(matrix.quadrants[quad]||'Freeform')+'</td><td>'+esc(n.stance)+'</td><td>'+esc(n.approach)+'</td><td>'+esc(n.notes)+'</td></tr>';
 }).join('');
 $('#print-report').innerHTML='<header><small>MAYNE LEADERSHIP · STAKEHOLDER MAPPING STUDIO</small><h1>'+esc(m.name)+'</h1><p>'+esc(m.description||'Visual stakeholder analysis')+' · '+s.total+' stakeholders · '+s.links+' relationships · '+esc(new Date().toLocaleDateString())+'</p></header>'+
 '<section><h2>Stakeholder map</h2>'+exportSVGMarkup(m)+'</section>'+
 '<section><h2>Engagement roster</h2><table><thead><tr><th>Stakeholder</th><th>Role</th><th>Group</th><th>Placement</th><th>Stance</th><th>Approach</th><th>Notes</th></tr></thead><tbody>'+rows+'</tbody></table></section>';
 window.print();
}
async function importJSON(file){
 if(!file)return;
 if(file.size>2e6){notify('Import exceeds the 2 MB limit.');return}
 try{const obj=JSON.parse(await file.text()),p=normalizeMap(obj.type==='mayne-stakeholder-map'?obj.map:obj,{regenerate:true});
  if(!confirm('Import “‘'+p.name+'” as a new map?'))return;createProject(p);notify('Editable map imported.');
 }catch(error){notify('Import failed: '+error.message)}
}
function show(selector){const d=$(selector);if(d&&!d.open)d.showModal()}
function close(selector){const d=$(selector);if(d?.open)d.close()}
function handleAction(target){
 const starter=target.closest('[data-starter]');
 if(starter){addNew(starter.dataset.starter,starter.dataset.role,starter.dataset.color);return true}
 const select=target.closest('[data-select]');if(select){setSelected(select.dataset.select);S.pane='map';renderPane();return true}
 const shape=target.closest('[data-shape]');if(shape){const key=shape.dataset.shape;if(selected()&&SHAPES.includes(key))mutate(()=>{selected().shape=key});return true}
 const color=target.closest('[data-color]');if(color){if(selected()&&COLORS.some(c=>c.id===color.dataset.color))mutate(()=>{selected().color=color.dataset.color});return true}
 const open=target.closest('[data-open-map]');if(open){switchMap(open.dataset.openMap);return true}
 const rem=target.closest('[data-remove-map]');if(rem){deleteProject(rem.dataset.removeMap);return true}
 const rmLink=target.closest('[data-remove-link]');if(rmLink){mutate(m=>m.links=m.links.filter(x=>x.id!==rmLink.dataset.removeLink));return true}
 const edit=target.closest('[data-edit-engagement]');if(edit){S.selected=edit.dataset.editEngagement;renderInspector();$('#edit-approach').focus();return true}
 const panel=target.closest('[data-pane]');if(panel){S.pane=panel.dataset.pane;renderPane();return true}
 const exp=target.closest('[data-export]');if(exp){
  const mode=exp.dataset.export;close('#export-dialog');
  if(mode==='json')exportJSON();if(mode==='csv')exportCSV();if(mode==='svg')exportSVG();if(mode==='png')exportPNG();if(mode==='pdf')exportReport();return true;
 }
 return false;
}
function bind(){
 $('#new-project').onclick=()=>createProject();
 $('#save').onclick=()=>{persist();notify('Stakeholder map saved on this device.')};
 $('#toggle-library').onclick=()=>{renderLibrary();show('#library-dialog')};
 $('#close-library').onclick=()=>close('#library-dialog');
 $('#library-new').onclick=()=>createProject();
 $('#library-import').onclick=()=>$('#import-file').click();
 $('#import-file').onchange=e=>{importJSON(e.target.files[0]);e.target.value=''};
 $('#export').onclick=()=>show('#export-dialog');
 $('#close-export').onclick=()=>close('#export-dialog');
 $('#undo').onclick=undo;$('#redo').onclick=redo;
 $('#example').onclick=()=>createProject(sampleMap());
 $('#map-title').onchange=e=>mutate(m=>m.name=e.target.value.slice(0,130).trim()||'Untitled stakeholder map');
 $('#quick-add').onclick=()=>{const name=$('#quick-name').value.trim(),role=$('#quick-role').value.trim();if(!name){notify('Enter a stakeholder name first.');$('#quick-name').focus();return}
  addNew(name,role);$('#quick-name').value='';$('#quick-role').value=''};
 $('#quick-name').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();$('#quick-add').click()}};
 $('#empty-add').onclick=()=>$('#quick-name').focus();
 $('#stake-search').oninput=renderList;
 $('#matrix-select').onchange=e=>mutate(m=>m.matrix=e.target.value);
 $('#pan-tool').onclick=()=>{S.tool=S.tool==='pan'?'select':'pan';renderZoom()};
 $('#fit-view').onclick=resetView;$('#zoom-in').onclick=()=>zoom(1.25);$('#zoom-out').onclick=()=>zoom(.8);
 $('#size-width').oninput=e=>{const n=selected();if(n){if(!S.inspectorDraft)S.inspectorDraft=copy(map());resizeNode(map(),n.id,Number(e.target.value),n.h);updateLayers();$('#size-label').textContent=Math.round(n.w)+' × '+Math.round(n.h)}};
 $('#size-height').oninput=e=>{const n=selected();if(n){if(!S.inspectorDraft)S.inspectorDraft=copy(map());resizeNode(map(),n.id,n.w,Number(e.target.value));updateLayers();$('#size-label').textContent=Math.round(n.w)+' × '+Math.round(n.h)}};
 $('#size-width').onchange=saveFieldChange;$('#size-height').onchange=saveFieldChange;
 for(const [id,key] of [['edit-label','label'],['edit-role','role'],['edit-group','group'],['edit-approach','approach'],['edit-notes','notes']]){
  $('#'+id).addEventListener('focus',()=>{if(!S.inspectorDraft)S.inspectorDraft=copy(map())});
  $('#'+id).addEventListener('input',e=>fieldChanged(key,e.target.value));
  $('#'+id).addEventListener('change',saveFieldChange);
 }
 $('#edit-stance').onchange=e=>mutate(()=>selected().stance=e.target.value);
 $('#add-link').onclick=()=>{
  const from=S.selected,to=$('#link-target').value,label=$('#link-label').value.trim();
  if(!to){notify('Choose another stakeholder first.');return}
  mutate(m=>linkNodes(m,from,to,label));
 };
 $('#duplicate-stake').onclick=()=>{const n=selected();if(!n)return;let cloneId='';
  const done=mutate(m=>{const item=createNode(n.label+' copy',n.x+32,n.y+32,n);item.group=n.group;placeNode(m,item);cloneId=item.id});
  if(done){S.selected=cloneId;render()}
 };
 $('#delete-stake').onclick=()=>{const n=selected();if(!n||!confirm('Delete stakeholder “‘'+n.label+'” and any relationships?'))return;
  mutate(m=>removeNode(m,n.id));S.selected='';render()
 };
 $('#export-plan').onclick=exportCSV;
 const svgHost=$('#map-host');
 svgHost.addEventListener('pointerdown',event=>{if(event.target.closest('#stakeholder-svg'))boardPointerDown(event)});
 svgHost.addEventListener('pointermove',boardPointerMove);
 svgHost.addEventListener('pointerup',finishPointer);
 svgHost.addEventListener('pointercancel',event=>finishPointer(event,true));
 svgHost.addEventListener('lostpointercapture',event=>{if(S.drag)finishPointer(event)});
 svgHost.addEventListener('click',event=>{const node=event.target.closest('[data-node]');if(node&&!S.drag)setSelected(node.dataset.node)});
 svgHost.addEventListener('dblclick',event=>{const node=event.target.closest('[data-node]');if(node){setSelected(node.dataset.node);$('#edit-label').focus();$('#edit-label').select()}});
 svgHost.addEventListener('contextmenu',event=>event.preventDefault());
 $('#canvas-frame').addEventListener('dragover',event=>{event.preventDefault();event.dataTransfer.dropEffect='copy'});
 $('#canvas-frame').addEventListener('drop',stageDrop);
 document.addEventListener('dragstart',event=>{
  const starter=event.target.closest('[data-starter]');if(starter){startDrag(event,{kind:'new',label:starter.dataset.starter,role:starter.dataset.role,color:starter.dataset.color});return}
  const item=event.target.closest('[data-stake-item]');if(item){startDrag(event,{kind:'existing',id:item.dataset.stakeItem})}
 });
 document.addEventListener('click',event=>handleAction(event.target));
 document.addEventListener('keydown',event=>{
  const tag=event.target?.tagName?.toLowerCase()||'',typing=['input','textarea','select'].includes(tag)||event.target.isContentEditable;
  const focusedNode=event.target.closest?.('[data-node]');
  if(focusedNode&&!typing&&['Enter',' '].includes(event.key)){event.preventDefault();setSelected(focusedNode.dataset.node);$('#edit-label').focus();return}
  if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s'){event.preventDefault();persist();notify('Map saved.');return}
  if(!typing&&(event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'){event.preventDefault();event.shiftKey?redo():undo();return}
  if(!typing&&(event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='y'){event.preventDefault();redo();return}
  if(!typing&&event.code==='Space'){S.space=true;$('#stakeholder-svg')?.classList.add('panning');event.preventDefault()}
  if(!typing&&S.selected&&event.target.closest?.('#map-host')&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)){
   event.preventDefault();const n=selected(),amount=event.shiftKey?1:12;
   const dx=event.key==='ArrowLeft'?-amount:event.key==='ArrowRight'?amount:0;
   const dy=event.key==='ArrowUp'?-amount:event.key==='ArrowDown'?amount:0;
   mutate(m=>moveNode(m,n.id,n.x+dx,n.y+dy));return;
  }
  if(!typing&&S.selected&&['Delete','Backspace'].includes(event.key)){event.preventDefault();$('#delete-stake').click();}
  if(!typing&&event.key==='Escape'){S.selected='';S.tool='select';render()}
 });
 document.addEventListener('keyup',event=>{if(event.code==='Space'){S.space=false;if(S.tool!=='pan')$('#stakeholder-svg')?.classList.remove('panning')}});
 window.addEventListener('blur',()=>{S.space=false;if(S.drag)finishPointer({pointerId:-1},true)});
}
load();bind();persist();render();
