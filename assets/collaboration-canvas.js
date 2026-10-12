(()=>{'use strict';
const $=s=>document.querySelector(s), $$=s=>Array.from(document.querySelectorAll(s));
const API='https://vteamreihsunsllwcphw.supabase.co/rest/v1/rpc/ml_canvas_board_rpc';
const PRESENCE_API='https://vteamreihsunsllwcphw.supabase.co/rest/v1/rpc/ml_canvas_participants_rpc';
const BRAINSTORM_API='https://vteamreihsunsllwcphw.supabase.co/rest/v1/rpc/ml_canvas_brainstorm_rpc';
const PUBLIC_KEY='sb_publishable_dFlcGsz0Fu1TifebqIu4fQ_6aLjG7ud';
const DRAFT_KEY='ml.collab.canvas.draft.v1', ROOM_KEY='ml.collab.canvas.owner.v1';
const COLORS=['#fff2ab','#d8edff','#dcf6e7','#fbe1ea','#eee5fc','#ffffff','#f4d5bc'];
const STEPS=[
 ['Discover','Frame the challenge','What problem are we solving, and what do we know?'],
 ['Diverge','Generate possibilities','What ideas could work, even if they feel unconventional?'],
 ['Organize','Find patterns','Which ideas connect, overlap, or reveal a theme?'],
 ['Evaluate','Compare the options','What evidence, impacts, and trade-offs matter?'],
 ['Decide','Build agreement','Which direction will we commit to, and why?'],
 ['Act','Turn insight into action','Who will do what, by when, and how will we know?']
];
const MAX_ITEMS=600, LOCAL_MAX=1450000;
const safeColor=c=>COLORS.includes(c)?c:COLORS[0];
const serial=obj=>JSON.parse(JSON.stringify(obj));
const makeId=()=>'i'+crypto.randomUUID().replace(/-/g,'').slice(0,21);
const blank=()=>({stage:0,items:[],settings:{locked:false,votingOpen:true,votesPerPerson:3,follow:false,focus:null,brainstormOpen:false},prompts:STEPS.map(s=>s[2])});
const entry=document.body.dataset.entry||'owner';
let board=blank(), title='Untitled collaboration', selected=null, tool='select', zoom=.8, pan={x:0,y:0}, dragging=null, connectFrom=null, room=null, version=0, pending=0, queue=Promise.resolve(), timerLeft=300, timerInterval=null, toastTimeout, imagePoint=null, revision=0;
let history=[],future=[],saveTimer=null,refreshing=false,spaceDown=false,editingInput=null,textSyncTimer=null,lastNonPanTool='select';
let selectedIds=new Set(),copiedItems=[],library=[],voterId=null,clientId=null,displayName='Participant',presenceInterval=null,facilitatorSettings={locked:false,votingOpen:true,votesPerPerson:3,follow:false},voteChoices=new Set(),presentIndex=0,laserEl=null,penColor='#205f97',penWidth=4;
const activeIds=()=>selectedIds.size?[...selectedIds]:selected?[selected]:[];
const canEditText=o=>!!o&&['note','text','shape','ellipse','frame'].includes(o.type);
const svgNS='http://www.w3.org/2000/svg';
const localStore=(key,data)=>{try{localStorage.setItem(key,JSON.stringify(data));return true}catch{return false}};
const localRead=key=>{try{return JSON.parse(localStorage.getItem(key)||'null')}catch{return null}};
const getObj=id=>board.items.find(o=>o.id===id);
const cleanSettings=v=>({locked:v?.locked===true,votingOpen:v?.votingOpen!==false,votesPerPerson:Math.max(1,Math.min(10,Number(v?.votesPerPerson)||3)),follow:v?.follow===true,focus:v?.focus||null,brainstormOpen:v?.brainstormOpen===true});
const editable=o=>!o?.locked&&!(room?.role==='guest'&&board.settings?.locked);
const cleanItem=o=>{if(!o||typeof o!=='object'||!['note','text','shape','ellipse','frame','image','connector','stroke'].includes(o.type))return null;
const n=(v,def,min,max)=>Number.isFinite(Number(v))?Math.max(min,Math.min(max,Math.round(Number(v)))):def;
return {id:typeof o.id==='string'&&/^[a-zA-Z0-9_-]{8,80}$/.test(o.id)?o.id:makeId(),type:o.type,x:n(o.x,1500,-200,4500),y:n(o.y,1100,-200,3100),w:n(o.w,210,60,1200),h:n(o.h,145,35,1000),text:String(o.text||'').slice(0,5000),color:safeColor(o.color),votes:n(o.votes,0,0,999),src:typeof o.src==='string'&&/^data:image\/(png|jpeg|webp);base64,[a-zA-Z0-9+/=]+$/.test(o.src)&&o.src.length<110000?o.src:'',from:typeof o.from==='string'?o.from:'',to:typeof o.to==='string'?o.to:'',group:typeof o.group==='string'?o.group.slice(0,80):'',locked:o.locked===true,rotation:n(o.rotation,0,-180,180),penColor:typeof o.penColor==='string'&&/^#[0-9a-f]{6}$/i.test(o.penColor)?o.penColor:'#205f97',penWidth:n(o.penWidth,4,2,22),points:Array.isArray(o.points)?o.points.slice(0,1000).filter(p=>Array.isArray(p)&&p.length===2).map(p=>[n(p[0],0,-200,4600),n(p[1],0,-200,3300)]):[]}};
const cleanState=s=>({stage:Math.max(0,Math.min(5,Number(s?.stage)||0)),settings:cleanSettings(s?.settings),items:(Array.isArray(s?.items)?s.items:[]).slice(0,MAX_ITEMS).map(cleanItem).filter(Boolean),prompts:STEPS.map((x,i)=>String((Array.isArray(s?.prompts)?s.prompts[i]:null)||x[2]).slice(0,800))});
function toast(msg){const el=$('#toast');el.textContent=msg;el.classList.add('visible');clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>el.classList.remove('visible'),3400)}
function saveLocal(){if(entry==='guest')return;const state={title,board,revision};if(JSON.stringify(state).length>LOCAL_MAX){setStatus('⚠ Board too large for local autosave');return}if(localStore(DRAFT_KEY,state)&&!room)setStatus('● Saved on this device')}
function setStatus(msg){$('#sync-status').textContent=msg}
function save(){revision++;clearTimeout(saveTimer);saveTimer=setTimeout(saveLocal,250)}
function before(){if(room)return;history.push(serial(board));if(history.length>45)history.shift();future=[];updateUndo()}
function updateUndo(){$('#undo').disabled=!!room||history.length===0;$('#redo').disabled=!!room||future.length===0}
function statusCount(){$('#object-count').textContent=board.items.length+' objects';$('#empty-guide').hidden=board.items.length>0}
function announce(msg){$('#activity-message').textContent=msg;setTimeout(()=>{if($('#activity-message').textContent===msg)$('#activity-message').textContent='Ready to collaborate'},4500)}
async function rpc(action,payload={},specific=room){
if(!specific&&action!=='create')throw Error('Start a live session first.');
const response=await fetch(API,{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json','apikey':PUBLIC_KEY},body:JSON.stringify({p_action:action,p_id:specific?.id||null,p_secret:specific?.secret||null,p_payload:payload}),signal:AbortSignal.timeout(15000)});
const data=await response.json().catch(()=>({}));
if(!response.ok)throw Error(data.message||data.error||'Could not connect to the shared board.');
return data;
}
function enqueue(action,payload){if(!room)return;pending++;setStatus('↗ Syncing changes…');queue=queue.catch(()=>{}).then(async()=>{
try{const d=await rpc(action,payload);version=Number(d.version)||version;setStatus('● Live · synchronized')}
catch(e){version=-1;setStatus('⚠ Could not sync changes');toast('Changes could not sync: '+e.message+'. Export your board as a backup.')}
finally{pending--;}
});}
async function refresh(){if(!room||refreshing||pending||dragging||editingInput||document.hidden)return;refreshing=true;try{const d=await rpc('get');if(Number(d.version)!==version){version=Number(d.version);board=cleanState(d.state);if(room?.role==='guest'&&board.settings?.follow&&board.settings.focus){const focus=board.settings.focus;zoom=clampZoom(focus.zoom);pan={x:Number(focus.x)||0,y:Number(focus.y)||0};applyView();}title=String(d.name||title);$('#board-title').value=title;if(selected&&!getObj(selected))selected=null;render();setStatus('● Live · synchronized')}}catch{setStatus('⚠ Connection interrupted')}finally{refreshing=false}}
function roomUI(){const live=!!room;$('#board-mode').textContent=live?'● Live shared canvas':'◌ Personal workspace';$('#board-mode').classList.toggle('connected',live);$('#room-info').textContent=live?(room.role==='owner'?'Instructor is hosting · invitation enabled':'Joined as a participant · edits sync automatically'):'Private draft · autosaved locally';$('#host-room').hidden=live||entry==='guest';$('#share-board').hidden=!live||room?.role!=='owner';$('#board-title').readOnly=room?.role==='guest'||entry==='guest';$('#stage-prompt').readOnly=room?.role==='guest'||entry==='guest';updateUndo()}
function saveRoom(){if(room?.role==='owner')localStore(ROOM_KEY,{id:room.id,secret:room.secret,guest:room.guest})}
async function hostRoom(){if(room)return;try{setStatus('Creating live board…');const d=await rpc('create',{name:title,state:board});room={id:d.id,secret:d.owner,guest:d.guest,role:'owner'};version=Number(d.version);saveRoom();roomUI();setStatus('● Live board created');startPresence();toast('Live session ready! Copy the student join link.')}catch(e){setStatus('● Personal draft · saved locally');toast('Unable to start live session: '+e.message)}}
async function joinRoom(id,secret){room={id,secret,role:'guest'};roomUI();setStatus('Connecting to class…');try{const d=await rpc('get');version=Number(d.version);board=cleanState(d.state);title=String(d.name||title);$('#board-title').value=title;render();roomUI();setStatus('● Connected to classroom');startPresence()}catch(e){room=null;roomUI();setStatus('⚠ Join link unavailable');toast('Unable to join: '+e.message)}}
async function restoreRoom(){const saved=localRead(ROOM_KEY);if(!saved?.id||!saved?.secret)return;room={id:saved.id,secret:saved.secret,guest:saved.guest,role:'owner'};roomUI();try{const d=await rpc('get');version=Number(d.version);board=cleanState(d.state);title=String(d.name||title);$('#board-title').value=title;render();setStatus('● Live · synchronized');startPresence()}catch(e){room=null;roomUI();setStatus('● Saved on this device');toast('Could not reopen live board: '+e.message)}}
function inviteLink(){const p=new URLSearchParams({id:room.id,token:room.guest});return location.origin+'/collaboration-join.html#'+p.toString()}
async function copyText(text){try{await navigator.clipboard.writeText(text);toast('Copied to clipboard')}catch{window.prompt('Copy this text:',text)}}
function worldPoint(e){const rect=$('#canvas-viewport').getBoundingClientRect();return {x:Math.round((e.clientX-rect.left-pan.x)/zoom),y:Math.round((e.clientY-rect.top-pan.y)/zoom)}}
function viewportCenter(){const r=$('#canvas-viewport').getBoundingClientRect();return{x:(r.width/2-pan.x)/zoom,y:(r.height/2-pan.y)/zoom}}
function clampZoom(value){return Math.min(2.5,Math.max(.25,Math.round(value*100)/100))}
function applyView(){$('#canvas-world').style.transform='translate('+pan.x+'px,'+pan.y+'px) scale('+zoom+')';$('#zoom-level').textContent=Math.round(zoom*100)+'%'}
function zoomTo(z,cx,cy){const v=$('#canvas-viewport').getBoundingClientRect(),x=cx??v.width/2,y=cy??v.height/2, wx=(x-pan.x)/zoom,wy=(y-pan.y)/zoom;zoom=clampZoom(z);pan={x:x-wx*zoom,y:y-wy*zoom};applyView()}
function fitView(){if(!board.items.length){zoom=.76;const rect=$('#canvas-viewport').getBoundingClientRect();pan={x:rect.width/2-1800*zoom,y:rect.height/2-1200*zoom};applyView();return}const shapes=board.items.filter(o=>!['connector','stroke'].includes(o.type));if(!shapes.length)return;const minX=Math.min(...shapes.map(o=>o.x))-110,maxX=Math.max(...shapes.map(o=>o.x+o.w))+110,minY=Math.min(...shapes.map(o=>o.y))-110,maxY=Math.max(...shapes.map(o=>o.y+o.h))+110;const r=$('#canvas-viewport').getBoundingClientRect();zoom=clampZoom(Math.min(r.width/(maxX-minX),r.height/(maxY-minY),1.4));pan={x:(r.width-(maxX-minX)*zoom)/2-minX*zoom,y:(r.height-(maxY-minY)*zoom)/2-minY*zoom};applyView()}
function setTool(next){finishInlineEdit();if(next!=='pan')lastNonPanTool=next;tool=next;connectFrom=null;$$('[data-tool]').forEach(b=>b.classList.toggle('active',b.dataset.tool===next));$('#canvas-viewport').classList.toggle('pan',next==='pan');$('#canvas-viewport').classList.toggle('draw',['stroke','connector'].includes(next));announce(next==='connector'?'Click two objects to connect them':next==='vote'?'Click an idea to add a vote':next==='image'?'Click the board to position an image':'Tool: '+next)}
function add(item){if(board.items.length>=MAX_ITEMS){toast('Canvas limit reached. Export or remove some objects.');return}before();board.items.push(cleanItem(item));selected=item.id;render();save();enqueue('put',{item:getObj(selected)})}
function addType(type,p=viewportCenter()){const id=makeId();const defaults={note:[215,150,'New idea',COLORS[0]],text:[235,80,'Double-click to edit',COLORS[5]],shape:[230,135,'Editable shape',COLORS[1]],ellipse:[180,160,'Idea',COLORS[2]],frame:[430,300,'Group or theme',COLORS[5]]};const [w,h,text,color]=defaults[type]||defaults.note;add({id,type,x:Math.round(p.x-w/2),y:Math.round(p.y-h/2),w,h,text,color,votes:0});setTool('select');startInlineEdit(id,{selectAll:true})}
function elementNode(tag,cls){const node=document.createElement(tag);if(cls)node.className=cls;return node}
function pathNode(tag,attrs={}){const n=document.createElementNS(svgNS,tag);Object.entries(attrs).forEach(([key,value])=>n.setAttribute(key,String(value)));return n}
function xyOf(o){return{x:o.x+o.w/2,y:o.y+o.h/2}}
function renderWires(){const svg=$('#connections');svg.replaceChildren();const defs=pathNode('defs'),marker=pathNode('marker',{id:'arrow',viewBox:'0 0 10 10',refX:9,refY:5,markerWidth:7,markerHeight:7,orient:'auto-start-reverse'});marker.appendChild(pathNode('path',{d:'M 0 0 L 10 5 L 0 10 z',fill:'#608dac'}));defs.appendChild(marker);svg.appendChild(defs);
for(const o of board.items){if(o.type==='connector'){const a=getObj(o.from),b=getObj(o.to);if(!a||!b)continue;const p=xyOf(a),q=xyOf(b),bend=Math.max(45,Math.abs(q.x-p.x)*.38);const d='M '+p.x+' '+p.y+' C '+(p.x+bend)+' '+p.y+' '+(q.x-bend)+' '+q.y+' '+q.x+' '+q.y;const path=pathNode('path',{d,stroke:selected===o.id?'#2268a0':'#608dac','stroke-width':selected===o.id?5:3,fill:'none','marker-end':'url(#arrow)'});path.style.pointerEvents='stroke';path.style.cursor='pointer';path.addEventListener('pointerdown',e=>{e.stopPropagation();select(o.id)});svg.appendChild(path);}
if(o.type==='stroke'&&o.points?.length){const path=pathNode('polyline',{points:o.points.map(p=>p.join(',')).join(' '),stroke:o.penColor||'#205f97','stroke-width':selected===o.id?(o.penWidth||4)+2:o.penWidth||4,opacity:o.penWidth>=16?.45:1,fill:'none','stroke-linejoin':'round','stroke-linecap':'round'});path.style.pointerEvents='stroke';path.addEventListener('pointerdown',e=>{e.stopPropagation();
 if(tool==='eraser'&&canChangeSelected()){before();board.items=board.items.filter(x=>x.id!==o.id);render();save();enqueue('remove',{id:o.id});announce('Pen stroke erased')}
 else select(o.id);
 });svg.appendChild(path);}}
}

// Each canvas object owns a native textarea: text is editable on the FIRST click.
function startInlineEdit(id,{selectAll=false}={}){
 const obj=getObj(id);if(!canEditText(obj)||!editable(obj))return;
 const input=Array.from($$('.canvas-text-input')).find(el=>el.dataset.id===id);
 if(!input)return;
 input.focus({preventScroll:true});select(id);if(selectAll)input.select();
}
function finishInlineEdit(){
 if(!editingInput)return;
 const edit=editingInput;editingInput=null;clearTimeout(textSyncTimer);textSyncTimer=null;
 const obj=getObj(edit.id);if(edit.dirty&&obj){save();enqueue('put',{item:serial(obj)});}
}
function activateCanvasInput(id){
 if(editingInput?.id===id)return;
 finishInlineEdit();editingInput={id,dirty:false};select(id);
}
function writeCanvasInput(e,id){
 const item=getObj(id);if(!item)return;
 if(!editingInput||editingInput.id!==id)activateCanvasInput(id);
 if(!editingInput.dirty){before();editingInput.dirty=true;}
 item.text=e.target.value.slice(0,5000);
 if(selected===id&&document.activeElement!==$('#object-text'))$('#object-text').value=item.text;
 save();
 if(room){
  clearTimeout(textSyncTimer);
  textSyncTimer=setTimeout(()=>{
   const obj=getObj(id);
   if(obj){enqueue('put',{item:serial(obj)});if(editingInput?.id===id)editingInput.dirty=false;}
  },650);
 }
}
function canvasInput(id,item){
 const input=elementNode('textarea','canvas-text-input');
 input.readOnly=!editable(item);input.dataset.id=id;input.value=item.text;input.maxLength=5000;input.rows=1;input.spellcheck=true;
 input.placeholder=item.type==='note'?'Type your idea…':item.type==='frame'?'Group title…':'Click and type…';
 input.setAttribute('aria-label','Edit '+({note:'sticky note',text:'text box',shape:'rectangle',ellipse:'circle',frame:'group title'}[item.type]||'object')+' directly');
 input.addEventListener('pointerdown',e=>{e.stopPropagation();if(isMulti(e)){e.preventDefault();select(id,{append:true});}});
 input.addEventListener('click',e=>e.stopPropagation());
 input.addEventListener('focus',()=>activateCanvasInput(id));
 input.addEventListener('input',e=>writeCanvasInput(e,id));
 input.addEventListener('blur',()=>{if(editingInput?.id===id)finishInlineEdit();});
 input.addEventListener('keydown',e=>{
  e.stopPropagation();
  if(e.key==='Escape'||(e.key==='Enter'&&(e.ctrlKey||e.metaKey))){e.preventDefault();input.blur();}
 });
 return input;
}


// Eight direct-manipulation handles resize notes, shapes, text, frames and images.
// Geometry is stored in canvas coordinates, so zoom does not change the result.
const RESIZE_DIRECTIONS={nw:'top left',n:'top',ne:'top right',e:'right',se:'bottom right',s:'bottom',sw:'bottom left',w:'left'};
function resizeGeometry(start,handle,dx,dy,keepRatio=false){
 const minW=60,minH=35,maxW=1200,maxH=1000;
 let left=start.x,top=start.y,right=start.x+start.w,bottom=start.y+start.h;
 const hasL=handle.includes('w'),hasR=handle.includes('e'),hasT=handle.includes('n'),hasB=handle.includes('s');
 if(hasL)left+=dx;if(hasR)right+=dx;
 if(hasT)top+=dy;if(hasB)bottom+=dy;
 // Limit the dragged side, anchoring the opposite side in place.
 if(hasL)left=Math.max(right-maxW,Math.min(right-minW,left));
 if(hasR)right=Math.min(left+maxW,Math.max(left+minW,right));
 if(hasT)top=Math.max(bottom-maxH,Math.min(bottom-minH,top));
 if(hasB)bottom=Math.min(top+maxH,Math.max(top+minH,bottom));
 if(keepRatio&&(hasL||hasR)&&(hasT||hasB)){
   const ratio=start.w/start.h;
   const width=right-left,height=bottom-top;
   if(Math.abs(dx/start.w)>Math.abs(dy/start.h)){
     const corrected=Math.max(minH,Math.min(maxH,width/ratio));
     if(hasT)top=bottom-corrected;else bottom=top+corrected;
   }else{
     const corrected=Math.max(minW,Math.min(maxW,height*ratio));
     if(hasL)left=right-corrected;else right=left+corrected;
   }
 }
 return {x:Math.round(left),y:Math.round(top),w:Math.round(right-left),h:Math.round(bottom-top)};
}
function beginResize(e,id,handle){
 if(e.button!==0||!canChangeSelected()||!editable(getObj(id)))return;
 e.preventDefault();e.stopPropagation();
 if(dragging)return;
 const item=getObj(id);if(!item||['connector','stroke'].includes(item.type))return;
 finishInlineEdit();
 select(id);
 dragging={type:'resize',id,handle,start:{x:item.x,y:item.y,w:item.w,h:item.h},sx:e.clientX,sy:e.clientY,moved:false,snapshot:false};
 const viewport=$('#canvas-viewport');
 viewport.setPointerCapture(e.pointerId);
 viewport.classList.add('resizing');
 announce('Drag to resize · hold Shift to keep proportions');
}
function resizeControls(el,o){
 if(['connector','stroke'].includes(o.type))return;
 for(const [direction,name] of Object.entries(RESIZE_DIRECTIONS)){
  const handle=elementNode('button','canvas-resize-handle resize-'+direction);
  handle.type='button';handle.dataset.direction=direction;
  handle.title='Resize '+name+' · Shift keeps proportions';
  handle.setAttribute('aria-label','Resize '+(o.text||o.type).slice(0,40)+' from '+name);
  handle.addEventListener('pointerdown',e=>beginResize(e,o.id,direction));
  handle.addEventListener('click',e=>{e.preventDefault();e.stopPropagation()});
  el.appendChild(handle);
 }
}

function render(){finishInlineEdit(true);selectedIds=new Set([...selectedIds].filter(id=>getObj(id)));if(!selectedIds.size&&selected)getObj(selected)&&selectedIds.add(selected);const parent=$('#canvas-items');parent.replaceChildren();board.items.forEach((o,i)=>{if(o.type==='connector'||o.type==='stroke')return;const el=elementNode('div','item '+o.type+(selectedIds.has(o.id)?' selected':''));el.dataset.id=o.id;el.style.cssText='left:'+o.x+'px;top:'+o.y+'px;width:'+o.w+'px;height:'+o.h+'px;z-index:'+(o.type==='frame'?0:i+1)+';transform:rotate('+o.rotation+'deg);';if(o.locked)el.classList.add('locked');
if(o.type==='image'){if(o.src){const img=elementNode('img');img.src=o.src;img.alt=o.text||'Uploaded image';img.draggable=false;el.appendChild(img)}}
else{if(['note','shape','ellipse'].includes(o.type))el.style.backgroundColor=o.color;if(canEditText(o))el.appendChild(canvasInput(o.id,o));else{const content=elementNode('div','item-content');content.textContent=o.text;el.appendChild(content)}}
if(o.votes&&o.type!=='frame'){const badge=elementNode('span','vote-count');badge.textContent=String(o.votes);el.appendChild(badge)}
el.title=canEditText(o)?'Click inside to type. Use the move handle to drag.':'Use the move handle to drag.';
const move=elementNode('button','canvas-move-handle');move.type='button';move.textContent=o.locked?'🔒':'⠿';
move.setAttribute('aria-label','Move '+(o.text||o.type).slice(0,55));move.title='Drag this handle to move the object';
move.addEventListener('pointerdown',e=>{e.preventDefault();onObjectDown(e,o.id)});
el.appendChild(move);
resizeControls(el,o);
el.addEventListener('pointerdown',event=>{if(event.target===el)onObjectDown(event,o.id)});
parent.appendChild(el)});
renderWires();statusCount();renderInspector();renderStages();updateUndo()}
function select(id,{append=false}={}){
 if(!append){selectedIds=new Set(id?[id]:[]);}
 else if(id){if(selectedIds.has(id))selectedIds.delete(id);else selectedIds.add(id);}
 selected=selectedIds.size?[...selectedIds].at(-1):null;
 $('.item').forEach(el=>el.classList.toggle('selected',selectedIds.has(el.dataset.id)));
 renderWires();renderInspector();updateSelectionStatus();
}
function updateSelectionStatus(){const v=$('#multi-status');if(v)v.textContent=selectedIds.size>1?selectedIds.size+' selected · Shift-click to add':'Shift-click to multi-select · Shift-drag empty canvas for area select'}
function isMulti(e){return !!(e.shiftKey||e.ctrlKey||e.metaKey)}
function canChangeSelected(){return !(room?.role==='guest'&&board.settings?.locked)}
function persistItems(items){save();for(const o of items)if(room)enqueue('put',{item:serial(o)});}
function selectedObjects(){return activeIds().map(getObj).filter(Boolean)}
function bulkChange(fn){if(!canChangeSelected()){toast('Board is locked by the instructor');return}const target=selectedObjects().filter(editable);if(!target.length)return;before();target.forEach(fn);render();persistItems(target)}
function groupSelection(){const items=selectedObjects().filter(editable);if(items.length<2)return toast('Select at least two objects (Shift-click)');const id='g'+crypto.randomUUID().replace(/-/g,'').slice(0,21);bulkChange(o=>{o.group=id});toast('Grouped '+items.length+' objects')}
function ungroupSelection(){bulkChange(o=>{o.group=''})}
function alignSelection(where){
 const objs=selectedObjects().filter(editable);if(objs.length<2)return toast('Select at least two objects');
 const x0=Math.min(...objs.map(o=>o.x)),y0=Math.min(...objs.map(o=>o.y)),x1=Math.max(...objs.map(o=>o.x+o.w)),y1=Math.max(...objs.map(o=>o.y+o.h));
 bulkChange(o=>{if(where==='left')o.x=x0;if(where==='center')o.x=Math.round((x0+x1-o.w)/2);if(where==='right')o.x=x1-o.w;if(where==='top')o.y=y0;if(where==='middle')o.y=Math.round((y0+y1-o.h)/2);if(where==='bottom')o.y=y1-o.h;});
}
function distributeSelection(axis){
 const os=selectedObjects().filter(editable).sort((a,b)=>a[axis]-b[axis]);if(os.length<3)return toast('Select at least three objects');
 const ends=os.at(-1)[axis]-os[0][axis];before();os.slice(1,-1).forEach((o,i)=>o[axis]=Math.round(os[0][axis]+(ends*(i+1))/(os.length-1)));render();persistItems(os);
}
function copySelection(){copiedItems=selectedObjects().filter(o=>!['connector','stroke'].includes(o.type)).map(serial);toast(copiedItems.length+' objects copied')}
function pasteSelection(){
 if(!copiedItems.length)return toast('Copy some objects first');
 if(!canChangeSelected())return toast('Board is locked');
 const copies=copiedItems.map(o=>cleanItem({...o,id:makeId(),x:o.x+38,y:o.y+38,group:'',votes:0,locked:false})).filter(Boolean);
 if(board.items.length+copies.length>MAX_ITEMS)return toast('Board size limit reached');
 before();board.items.push(...copies);selectedIds=new Set(copies.map(o=>o.id));selected=copies.at(-1).id;render();persistItems(copies);copiedItems=serial(copies);
}

function renderInspector(){const item=getObj(selected);$('#inspector').hidden=!item;$('#inspector-empty').hidden=!!item;if(!item)return;$('#selected-type').textContent={note:'Sticky note',text:'Text',shape:'Rectangle',ellipse:'Circle',frame:'Group frame',image:'Image',connector:'Connector',stroke:'Freehand line'}[item.type]||'Object';
if(document.activeElement!==$('#object-text'))$('#object-text').value=item.text;$('#object-width').value=item.w;$('#object-height').value=item.h;$('#object-help').textContent=item.type==='connector'?'Connectors automatically follow their linked objects.':item.type==='stroke'?'Pen lines can be removed or moved through their settings.':'Type directly in the object. Drag ⠿ to move. Drag a corner or edge handle to resize; hold Shift to maintain proportions.';$('#edit-inline').hidden=!canEditText(item);
$('#object-text').disabled=['connector','stroke','image'].includes(item.type);$('#object-width').disabled=['connector','stroke'].includes(item.type);$('#object-height').disabled=['connector','stroke'].includes(item.type);
const sw=$('#color-swatches');sw.replaceChildren();COLORS.forEach(color=>{const b=elementNode('button');b.type='button';b.title=color;b.style.backgroundColor=color;b.className=color===item.color?'active':'';b.addEventListener('click',()=>patchSelected({color}));sw.appendChild(b)})}
function onObjectDown(e,id){if(e.button!==0&&e.button!==1)return;e.stopPropagation();if(isMulti(e)){select(id,{append:true});return}if(!canChangeSelected()||(!editable(getObj(id))&&tool!=='vote')){select(id);return}const grouped=getObj(id)?.group;const peers=grouped?board.items.filter(o=>o.group===grouped):[];if(peers.length>1&&tool==='select'){selectedIds=new Set(peers.map(o=>o.id));selected=id;}if(editingInput?.id===id)finishInlineEdit();finishInlineEdit(true);const obj=getObj(id);if(!obj)return;if(tool==='text'&&canEditText(obj)){startInlineEdit(id);return}if(tool==='vote'){
 if(board.settings?.votingOpen===false)return toast('Voting is closed');
 if(voteChoices.has(id))return toast('You have already voted for that idea');
 if(room&&voteChoices.size>=(board.settings?.votesPerPerson||3))return toast('All votes used');
 before();obj.votes=Math.min(999,(obj.votes||0)+1);voteChoices.add(id);render();save();
 if(room)enqueue('vote',{id,voter:voterId});
 announce('Vote recorded');return;
}
if(tool==='connector'){if(!connectFrom){connectFrom=id;select(id);announce('Now click the second object to connect')}else if(connectFrom!==id){add({id:makeId(),type:'connector',from:connectFrom,to:id,text:'',color:COLORS[5],x:0,y:0,w:60,h:35});connectFrom=null;setTool('select')}return}
if(tool==='pan'||spaceDown){startPan(e);return}
if(!peers.length&&!(selectedIds.size>1&&selectedIds.has(id)))select(id);if(tool!=='select')return;before();const p=worldPoint(e);dragging={type:'item',id,dx:p.x-obj.x,dy:p.y-obj.y,moved:false,starts:selectedObjects().map(o=>({id:o.id,x:o.x,y:o.y})),sx:p.x,sy:p.y};$('#canvas-viewport').setPointerCapture(e.pointerId)}
function startPan(e,{rightButton=false}={}){
 dragging={type:'pan',sx:e.clientX,sy:e.clientY,x:pan.x,y:pan.y,rightButton,moved:false};
 const viewport=$('#canvas-viewport');
 viewport.setPointerCapture(e.pointerId);
 viewport.classList.add('dragging');
 viewport.classList.toggle('right-panning',rightButton);
}
function rightPanStart(e){
 // Right-click on the board, including shape borders and move handles,
 // is a shortcut for panning. Never hijack an actual text editor or UI button.
 if(e.pointerType!=='mouse'||e.button!==2)return;
 if(e.target.closest('.zoom-control,.empty-guide,.canvas-text-input,input,textarea,select,[contenteditable],.inline-editor-actions'))return;
 if(dragging)return;
 e.preventDefault();e.stopPropagation();
 finishInlineEdit();
 startPan(e,{rightButton:true});
}
function rightPanToggle(){
 setTool(tool==='pan'?lastNonPanTool:'pan');
 announce(tool==='pan'?'Pan mode: drag to navigate · right-click again to restore your last tool':'Restored '+tool+' tool');
}
function onCanvasDown(e){if(e.target.closest('.zoom-control,.empty-guide'))return;if(e.button!==0&&e.button!==1)return;finishInlineEdit(true);
if(e.button===1||tool==='pan'||spaceDown){startPan(e);return}
const point=worldPoint(e);
if(['stroke','line','highlighter'].includes(tool)){
 if(!canChangeSelected())return toast('Board is locked');
 before();const id=makeId(),straight=tool==='line';
 board.items.push(cleanItem({id,type:'stroke',x:point.x,y:point.y,w:60,h:35,
 points:straight?[[point.x,point.y],[point.x,point.y]]:[[point.x,point.y]],
 penColor:tool==='highlighter'?'#e9b957':penColor,penWidth:tool==='highlighter'?18:penWidth,color:COLORS[1]}));
 dragging={type:straight?'line':'stroke',id};$('#canvas-viewport').setPointerCapture(e.pointerId);renderWires();return;
}
if(tool==='eraser'||tool==='laser')return;
if(tool==='image'){imagePoint=point;$('#image-input').click();return}
if(['note','text','shape','ellipse','frame'].includes(tool)){if(!canChangeSelected())return toast('Board is locked');addType(tool,point);return}
if(tool==='select'&&e.shiftKey){const a=worldPoint(e);dragging={type:'marquee',x:a.x,y:a.y,sx:e.clientX,sy:e.clientY};const mark=elementNode('div','canvas-selection-rect');mark.id='canvas-selection-rect';$('#canvas-viewport').appendChild(mark);$('#canvas-viewport').setPointerCapture(e.pointerId);return}
select(null)}
function onPointerMove(e){
 if(tool==='laser'&&laserEl){const box=$('#canvas-viewport').getBoundingClientRect();laserEl.style.left=(e.clientX-box.left)+'px';laserEl.style.top=(e.clientY-box.top)+'px';laserEl.hidden=false;}
 if(!dragging)return;
if(dragging.type==='marquee'){const r=$('#canvas-viewport').getBoundingClientRect(),el=$('#canvas-selection-rect');if(el){const x0=Math.min(dragging.sx,e.clientX)-r.left,y0=Math.min(dragging.sy,e.clientY)-r.top;el.style.cssText='left:'+x0+'px;top:'+y0+'px;width:'+Math.abs(e.clientX-dragging.sx)+'px;height:'+Math.abs(e.clientY-dragging.sy)+'px';}return}
if(dragging.type==='pan'){const dx=e.clientX-dragging.sx,dy=e.clientY-dragging.sy;if(Math.hypot(dx,dy)>5)dragging.moved=true;pan.x=dragging.x+dx;pan.y=dragging.y+dy;applyView();return}
if(dragging.type==='resize'){
 const o=getObj(dragging.id);if(!o)return;
 const dims=resizeGeometry(dragging.start,dragging.handle,(e.clientX-dragging.sx)/zoom,(e.clientY-dragging.sy)/zoom,e.shiftKey);
 if(['x','y','w','h'].every(k=>dims[k]===o[k]))return;
 if(!dragging.snapshot){before();dragging.snapshot=true;}
 Object.assign(o,dims);dragging.moved=true;
 const el=Array.from(document.querySelectorAll('.item')).find(node=>node.dataset.id===o.id);
 if(el){el.style.left=o.x+'px';el.style.top=o.y+'px';el.style.width=o.w+'px';el.style.height=o.h+'px';}
 const wi=$('#object-width'),hi=$('#object-height');if(selected===o.id){wi.value=o.w;hi.value=o.h;}
 renderWires();
 return;
}
if(dragging.type==='item'){const p=worldPoint(e),dx=p.x-dragging.sx,dy=p.y-dragging.sy;if(!dx&&!dy)return;dragging.moved=true;for(const initial of dragging.starts){const o=getObj(initial.id);if(!o||!editable(o))continue;o.x=Math.max(-100,Math.min(4500,Math.round((initial.x+dx)/10)*10));o.y=Math.max(-100,Math.min(3150,Math.round((initial.y+dy)/10)*10));const node=Array.from(document.querySelectorAll('.item')).find(el=>el.dataset.id===o.id);if(node){node.style.left=o.x+'px';node.style.top=o.y+'px'}}renderWires();return}
if(dragging.type==='line'){const o=getObj(dragging.id);if(o){const p=worldPoint(e);o.points[1]=[p.x,p.y];renderWires();}return}
if(dragging.type==='stroke'){const o=getObj(dragging.id);if(o&&o.points.length<1000){const p=worldPoint(e),last=o.points[o.points.length-1];if(Math.hypot(p.x-last[0],p.y-last[1])>5){o.points.push([p.x,p.y]);renderWires()}}}}
function onPointerUp(e){if(!dragging)return;const was=dragging;dragging=null;$('#canvas-viewport').classList.remove('dragging','right-panning','resizing');try{$('#canvas-viewport').releasePointerCapture(e.pointerId)}catch{}
if(was.type==='marquee'){const rect=$('#canvas-selection-rect');rect?.remove();const p=worldPoint(e),x0=Math.min(was.x,p.x),y0=Math.min(was.y,p.y),x1=Math.max(was.x,p.x),y1=Math.max(was.y,p.y);selectedIds=new Set(board.items.filter(o=>o.type!=='connector'&&o.type!=='stroke'&&o.x<x1&&o.x+o.w>x0&&o.y<y1&&o.y+o.h>y0).map(o=>o.id));selected=selectedIds.size?[...selectedIds].at(-1):null;render();updateSelectionStatus();}
if(was.type==='pan'&&was.rightButton&&!was.moved&&e.type==='pointerup')rightPanToggle();
if(was.type==='resize'&&was.moved){
 const o=getObj(was.id);
 if(o){save();enqueue('put',{item:serial(o)});announce('Resized · '+o.w+' × '+o.h);}
}
if(was.type==='item'){if(was.moved){const moved=was.starts.map(x=>getObj(x.id)).filter(Boolean);persistItems(moved);announce(moved.length+' object(s) moved')}else{if(!room&&history.length){history.pop();updateUndo()}}}
if(was.type==='stroke'||was.type==='line'){const o=getObj(was.id);if(o){if(o.points.length<2)o.points.push([o.x+1,o.y+1]);selected=o.id;render();save();enqueue('put',{item:o})}}
}
function patchSelected(changes){const o=getObj(selected);if(!o)return;before();Object.assign(o,changes);const cleaned=cleanItem(o);Object.assign(o,cleaned);render();save();enqueue('put',{item:o})}
function deleteSelected(){
 const ids=new Set(activeIds().filter(id=>editable(getObj(id))));if(!ids.size)return;
 if(!canChangeSelected())return toast('The instructor locked this board');
 for(const o of board.items)if(o.type==='connector'&&(ids.has(o.from)||ids.has(o.to)))ids.add(o.id);
 before();board.items=board.items.filter(o=>!ids.has(o.id));selected=null;selectedIds.clear();render();save();ids.forEach(id=>enqueue('remove',{id}));
}
function duplicateSelected(){const o=getObj(selected);if(!o||['connector','stroke'].includes(o.type))return;add({...serial(o),id:makeId(),x:o.x+34,y:o.y+34,votes:0})}
function undo(){if(room){toast('Undo is unavailable in live mode to protect other participants’ work.');return}if(!history.length)return;future.push(serial(board));board=cleanState(history.pop());selected=null;render();save()}
function redo(){if(room)return;if(!future.length)return;history.push(serial(board));board=cleanState(future.pop());selected=null;render();save()}
function renderStages(){const list=$('#stage-list');list.replaceChildren();STEPS.forEach((s,i)=>{const li=elementNode('li');const b=elementNode('button',i===board.stage?'current':'');b.type='button';const count=elementNode('span','stage-bubble');count.textContent=String(i+1).padStart(2,'0');const desc=elementNode('span','stage-text'),strong=elementNode('b');strong.textContent=s[0];const small=elementNode('small');small.textContent=s[1];desc.append(strong,small);b.append(count,desc);b.disabled=entry==='guest';b.addEventListener('click',()=>setStage(i));li.appendChild(b);list.appendChild(li)});
$('#step-name').textContent=STEPS[board.stage][0];$('#step-index').textContent=String(board.stage+1).padStart(2,'0')+' / 06';$('#step-description').textContent=STEPS[board.stage][1];if(document.activeElement!==$('#stage-prompt'))$('#stage-prompt').value=board.prompts[board.stage];}
function setStage(index){if(entry==='guest'||room?.role==='guest')return;before();board.stage=Math.max(0,Math.min(5,index));renderStages();save();enqueue('stage',{stage:board.stage})}
function templateItems(kind){const x=1230,y=850;const item=(type,dx,dy,w,h,text,color)=>cleanItem({id:makeId(),type,x:x+dx,y:y+dy,w,h,text,color,votes:0});if(kind==='brainstorm')return [item('frame',0,0,1020,650,'01 · Explore all ideas',COLORS[5]),item('note',60,95,240,145,'What is working?',COLORS[1]),item('note',350,95,240,145,'What could improve?',COLORS[0]),item('note',640,95,240,145,'A bold new idea…',COLORS[2])];
if(kind==='affinity')return [item('frame',0,0,340,630,'THEME A',COLORS[5]),item('frame',365,0,340,630,'THEME B',COLORS[5]),item('frame',730,0,340,630,'OTHER / PARKING LOT',COLORS[5])];
if(kind==='swot')return [item('shape',0,0,465,325,'STRENGTHS\nInternal advantages',COLORS[2]),item('shape',485,0,465,325,'WEAKNESSES\nInternal limitations',COLORS[3]),item('shape',0,345,465,325,'OPPORTUNITIES\nExternal possibilities',COLORS[1]),item('shape',485,345,465,325,'THREATS\nExternal risks',COLORS[0])];
if(kind==='priority')return [item('frame',0,0,500,330,'HIGH IMPACT · LOW EFFORT\nQuick wins',COLORS[5]),item('frame',520,0,500,330,'HIGH IMPACT · HIGH EFFORT\nMajor initiatives',COLORS[5]),item('frame',0,350,500,330,'LOW IMPACT · LOW EFFORT\nOptional tasks',COLORS[5]),item('frame',520,350,500,330,'LOW IMPACT · HIGH EFFORT\nReconsider',COLORS[5])];
if(kind==='retrospective')return [item('frame',0,0,330,670,'START\nWhat should we begin?',COLORS[5]),item('frame',350,0,330,670,'STOP\nWhat should we avoid?',COLORS[5]),item('frame',700,0,330,670,'CONTINUE\nWhat should we preserve?',COLORS[5])];
if(kind==='action')return [item('frame',0,0,1010,700,'ACTION PLAN · FROM INSIGHT TO EXECUTION',COLORS[5]),item('shape',45,100,280,145,'WHAT WILL WE DO?',COLORS[1]),item('shape',360,100,280,145,'WHO OWNS IT?',COLORS[2]),item('shape',675,100,280,145,'BY WHEN?',COLORS[0]),item('note',45,290,280,145,'First action…',COLORS[0]),item('note',360,290,280,145,'Accountable person…',COLORS[2]),item('note',675,290,280,145,'Target date…',COLORS[1])];return []}
function applyTemplate(){const kind=$('#templates').value;if(!kind){toast('Choose a template first.');return}const add=templateItems(kind);if(board.items.length+add.length>MAX_ITEMS)return toast('Board item limit reached');if(room&&!confirm('This adds a template to the live board. Continue?'))return;before();board.items.push(...add);selected=null;render();fitView();save();if(room&&room.role==='owner')enqueue('replace',{state:board});toast('Template applied — all sections are editable')}
function download(name,blob){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),3000)}
function exportJSON(){download('collaboration-canvas-'+new Date().toISOString().slice(0,10)+'.json',new Blob([JSON.stringify({format:'mayne-canvas-v1',title,state:board},null,2)],{type:'application/json'}))}
async function importJSON(file){if(!file)return;try{if(file.size>1600000)throw Error('File is too large.');const d=JSON.parse(await file.text());if(!d.state||!Array.isArray(d.state.items))throw Error('Not a Canvas Studio board file');if(room&&!confirm('Replace all content in the live session with the imported file?'))return;before();board=cleanState(d.state);title=String(d.title||title).slice(0,110);$('#board-title').value=title;selected=null;render();fitView();save();if(room)enqueue('replace',{state:board});toast('Board imported successfully')}catch(e){toast('Import failed: '+e.message)}finally{$('#file-input').value=''}}
async function insertImage(file){if(!file||!['image/png','image/jpeg','image/webp'].includes(file.type)){toast('Choose a PNG, JPEG or WebP image.');return}if(file.size>12000000){toast('Images must be smaller than 12 MB.');return}try{const image=await createImageBitmap(file);const scale=Math.min(1,750/image.width,550/image.height),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0,canvas.width,canvas.height);image.close();let url=canvas.toDataURL('image/jpeg',.7);if(url.length>100000){canvas.width=Math.min(canvas.width,360);canvas.height=Math.max(1,Math.round(canvas.width*image.height/image.width));ctx.drawImage(await loadImage(url),0,0,canvas.width,canvas.height);url=canvas.toDataURL('image/jpeg',.55)}if(url.length>110000){throw Error('Image still too large for live sharing. Use a smaller image.')}const p=imagePoint||viewportCenter();add({id:makeId(),type:'image',x:Math.round(p.x-180),y:Math.round(p.y-120),w:360,h:240,text:file.name,color:COLORS[5],src:url,votes:0});setTool('select')}catch(e){toast('Image could not be inserted: '+e.message)}finally{$('#image-input').value='';imagePoint=null}}
function loadImage(src){return new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=reject;img.src=src})}
function wrap(ctx,text,x,y,maxW,lineH,maxLines=20){const lines=String(text).split('\n');let count=0;for(const line of lines){let current='';for(const word of (line.split(' '))){const t=(current?current+' ':'')+word;if(ctx.measureText(t).width>maxW&&current){ctx.fillText(current,x,y+count*lineH);count++;current=word;if(count>=maxLines)return}else current=t}ctx.fillText(current,x,y+count*lineH);count++;if(count>=maxLines)return}}
async function exportPNG(){const objs=board.items.filter(o=>!['stroke','connector'].includes(o.type));if(!objs.length){toast('Add a few ideas before exporting an image.');return}const minX=Math.min(...objs.map(o=>o.x))-60,minY=Math.min(...objs.map(o=>o.y))-60,maxX=Math.max(...objs.map(o=>o.x+o.w))+60,maxY=Math.max(...objs.map(o=>o.y+o.h))+60;const scale=Math.min(2,2500/(maxX-minX),1600/(maxY-minY));const c=document.createElement('canvas');c.width=Math.max(320,Math.ceil((maxX-minX)*scale));c.height=Math.max(230,Math.ceil((maxY-minY)*scale));const ctx=c.getContext('2d');ctx.fillStyle='#fbfdff';ctx.fillRect(0,0,c.width,c.height);ctx.scale(scale,scale);ctx.translate(-minX,-minY);
for(const o of board.items){if(o.type==='connector'){const a=getObj(o.from),b=getObj(o.to);if(!a||!b)continue;const p=xyOf(a),q=xyOf(b);ctx.strokeStyle='#5886a5';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(q.x,q.y);ctx.stroke();const angle=Math.atan2(q.y-p.y,q.x-p.x);ctx.beginPath();ctx.moveTo(q.x,q.y);ctx.lineTo(q.x-14*Math.cos(angle-.5),q.y-14*Math.sin(angle-.5));ctx.lineTo(q.x-14*Math.cos(angle+.5),q.y-14*Math.sin(angle+.5));ctx.closePath();ctx.fillStyle='#5886a5';ctx.fill()}else if(o.type==='stroke'&&o.points.length){ctx.save();ctx.beginPath();ctx.strokeStyle=o.penColor||'#205f97';ctx.lineWidth=o.penWidth||4;ctx.globalAlpha=o.penWidth>=16?.45:1;o.points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.stroke();ctx.restore()}}
for(const o of objs){ctx.save();if(o.type==='frame'){ctx.strokeStyle='#79a6c4';ctx.setLineDash([8,6]);ctx.lineWidth=2;ctx.strokeRect(o.x,o.y,o.w,o.h);ctx.setLineDash([])}else if(o.type!=='text'&&o.type!=='image'){ctx.fillStyle=o.color;ctx.strokeStyle='#a9c2d4';ctx.lineWidth=1.6;if(o.type==='ellipse'){ctx.beginPath();ctx.ellipse(o.x+o.w/2,o.y+o.h/2,o.w/2,o.h/2,0,0,Math.PI*2);ctx.fill();ctx.stroke()}else{ctx.fillRect(o.x,o.y,o.w,o.h);ctx.strokeRect(o.x,o.y,o.w,o.h)}}if(o.type==='image'){if(o.src){try{const img=await loadImage(o.src);ctx.drawImage(img,o.x,o.y,o.w,o.h)}catch{}}}else{ctx.fillStyle='#27455d';ctx.font=(o.type==='text'?'bold 21px':o.type==='frame'?'bold 17px':'600 16px')+' Segoe UI, sans-serif';wrap(ctx,o.text,o.x+15,o.y+27,o.w-28,o.type==='text'?27:21,Math.floor(o.h/21)-1)}if(o.votes){ctx.fillStyle='#296b9f';ctx.beginPath();ctx.arc(o.x+o.w,o.y,18,0,Math.PI*2);ctx.fill();ctx.fillStyle='#fff';ctx.font='bold 14px Segoe UI';ctx.fillText(String(o.votes),o.x+o.w-6,o.y+5)}ctx.restore()}
c.toBlob(b=>b?download('collaboration-canvas.png',b):toast('Unable to export PNG'),'image/png')}
function summary(){const lines=[title,'Stage: '+STEPS[board.stage][0],'Question: '+board.prompts[board.stage],''];for(const o of board.items.filter(o=>['note','text','shape','ellipse'].includes(o.type))){lines.push('- '+(o.text||'(blank)')+(o.votes?' ('+o.votes+' votes)':''))}return lines.join('\n')}
function timerRender(){$('#timer-display').textContent=String(Math.floor(timerLeft/60)).padStart(2,'0')+':'+String(timerLeft%60).padStart(2,'0')}
function timerStart(){if(timerInterval){clearInterval(timerInterval);timerInterval=null;$('#timer-start').textContent='Resume';return}if(timerLeft<=0)timerLeft=Math.max(1,Math.min(180,Number($('#timer-minutes').value)||5))*60;$('#timer-start').textContent='Pause';timerInterval=setInterval(()=>{timerLeft--;timerRender();if(timerLeft<=0){clearInterval(timerInterval);timerInterval=null;$('#timer-start').textContent='Start';$('.timer').classList.add('finished');toast('Facilitation time is up!')}},1000)}


/* Classroom identity, presence and privacy-aware brainstorming. */
async function classRPC(endpoint,action,extra={}){
 if(!room)throw Error('Live session required');
 const response=await fetch(endpoint,{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json',apikey:PUBLIC_KEY},body:JSON.stringify(endpoint===PRESENCE_API?{p_action:action,p_board:room.id,p_secret:room.secret,p_client:clientId,p_name:displayName}:{p_action:action,p_board:room.id,p_secret:room.secret,p_client:clientId,p_idea:extra.idea||null}),signal:AbortSignal.timeout(15000)});
 const data=await response.json().catch(()=>({}));
 if(!response.ok)throw Error(data.message||'Classroom request failed');
 return data;
}
function startPresence(){
 if(!room)return;
 if(!clientId){clientId=localRead('ml.canvas.client.v1')||crypto.randomUUID();localStore('ml.canvas.client.v1',clientId)}
 const existing=localRead('ml.canvas.display-name.v1');
 if(room.role==='owner')displayName='Instructor';
 else if(existing)displayName=String(existing).slice(0,60);
 else{displayName=String(prompt('Display name for this whiteboard:','Participant')||'Participant').trim().slice(0,60)||'Participant';localStore('ml.canvas.display-name.v1',displayName)}
 classRPC(PRESENCE_API,'pulse').catch(e=>toast('Attendance unavailable: '+e.message));
 if(!presenceInterval)presenceInterval=setInterval(()=>{if(room)classRPC(PRESENCE_API,'pulse').catch(()=>{});},25000);
}
async function getParticipants(){if(room?.role!=='owner')throw Error('Instructor access required');return (await classRPC(PRESENCE_API,'list')).participants||[];}
async function viewParticipants(){
 try{
 const data=await getParticipants(),root=$('#pro-panel-content'),box=elementNode('div','pro-results'),heading=elementNode('strong');
 heading.textContent='Connected participants: '+data.length;box.appendChild(heading);
 for(const p of data){const line=elementNode('p','pro-explain');line.textContent=p.name+' · '+new Date(p.last_seen).toLocaleTimeString();box.appendChild(line)}
 root.appendChild(box);
 }catch(e){toast(e.message)}
}
async function exportAttendance(){
 try{const people=await getParticipants();const esc=v=>'"'+String(v||'').replaceAll('"','""')+'"';saveReport('canvas-attendance.csv','text/csv;charset=utf-8',['Name,Last seen',...people.map(p=>esc(p.name)+','+esc(p.last_seen))].join('\r\n'))}
 catch(e){toast(e.message)}
}
async function submitPrivateIdea(){
 const input=$('#private-idea-text'),idea=input?.value.trim();if(!idea)return toast('Write an idea first');
 if(!board.settings?.brainstormOpen)return toast('Private brainstorming is not open');
 try{const d=await classRPC(BRAINSTORM_API,'submit',{idea});input.value='';toast('Privately submitted ('+d.my_ideas+' ideas sent)')}
 catch(e){toast(e.message)}
}
async function listPrivateIdeas(){
 if(room?.role!=='owner')return toast('Instructor access required');
 try{const data=await classRPC(BRAINSTORM_API,'list'),root=$('#pro-panel-content'),box=elementNode('div','pro-results'),h=elementNode('strong');
 h.textContent='Private submissions: '+data.count;box.appendChild(h);
 for(const idea of data.ideas){const p=elementNode('p','pro-private-idea');p.textContent=idea.text;const by=elementNode('small');by.textContent='From: '+idea.name;box.append(p,by)}
 root.appendChild(box);
 }catch(e){toast(e.message)}
}
async function revealPrivateIdeas(){
 if(room?.role!=='owner')return toast('Instructor access required');
 if(!confirm('Publish all submitted private ideas to the shared board?'))return;
 try{const data=await classRPC(BRAINSTORM_API,'reveal');version=-1;await refresh();toast(data.published+' ideas published')}
 catch(e){toast(e.message)}
}
async function clearPrivateIdeas(){
 if(room?.role!=='owner'||!confirm('Delete unrevealed brainstorm ideas?'))return;
 try{await classRPC(BRAINSTORM_API,'clear');toast('Private submissions cleared')}catch(e){toast(e.message)}
}

/* Collaboration Canvas Pro: a compact command center atop the existing canvas. */
function notifySelection(){updateSelectionStatus();$('#pro-selection-count').textContent=selectedIds.size+' selected';}
function setBoardMode(name){$('#pro-panel').hidden=false;$('#pro-panel-title').textContent=name;$('#pro-panel-content').replaceChildren();return $('#pro-panel-content')}
function closeBoardMode(){$('#pro-panel').hidden=true}
function proButton(label,action,extra={}){const b=elementNode('button','pro-action');b.type='button';b.dataset.pro=action;b.textContent=label;if(extra.title)b.title=extra.title;return b}
function proHeader(el,title,info){const h=elementNode('strong');h.textContent=title;el.appendChild(h);if(info){const p=elementNode('p','pro-explain');p.textContent=info;el.appendChild(p)}}
function proActions(el,rows){for(const group of rows){const line=elementNode('div','pro-buttons');for(const [label,action] of group)line.appendChild(proButton(label,action));el.appendChild(line)}}
function openProPanel(name){
 const container=setBoardMode(name==='library'?'My Boards':name==='facilitator'?'Facilitator Command Center':name==='tools'?'Thinking Tool Library':name==='present'?'Presentation Mode':name==='reports'?'Reports & Exports':'Editing & Arrangement');
 if(name==='library'){
  proHeader(container,'Your saved boards','Local library stored in this browser. Export JSON to keep a portable backup.');
  proActions(container,[[['Save current board','save-board'],['Save as a new copy','save-copy']],[['Open current saved board','load-board'],['Delete saved board','delete-board']]]);
  const pick=elementNode('select');pick.id='saved-board-picker';pick.setAttribute('aria-label','Saved boards');
  for(const b of library){const opt=elementNode('option');opt.value=b.id;opt.textContent=b.title+' · '+new Date(b.updated).toLocaleDateString();pick.appendChild(opt)}container.appendChild(pick);
  const hint=elementNode('p','pro-explain');hint.textContent=library.length+' saved boards on this device';container.appendChild(hint);
 }else if(name==='edit'){
  proHeader(container,'Select and arrange','Shift-click objects or Shift-drag the canvas for multi-selection. Drag ⠿ to move; drag corners to resize.');
 const penBar=elementNode('div','pro-buttons');const color=elementNode('input');color.type='color';color.value=penColor;color.id='pro-pen-color';color.title='Pen and line color';const width=elementNode('input');width.type='range';width.min=2;width.max=20;width.value=penWidth;width.id='pro-pen-width';width.title='Pen thickness';const label=elementNode('span');label.textContent='Pen color / thickness';penBar.append(label,color,width);container.appendChild(penBar);
  proActions(container,[[['Copy','copy'],['Paste','paste'],['Duplicate','duplicate-all'],['Delete','delete-all']],[['Group','group'],['Ungroup','ungroup'],['Lock','lock-selection'],['Unlock','unlock-selection']],[['Align left','align-left'],['Align center','align-center'],['Align right','align-right']],[['Align top','align-top'],['Align middle','align-middle'],['Align bottom','align-bottom']],[['Distribute horizontally','distribute-x'],['Distribute vertically','distribute-y']],[['Rotate left','rotate-left'],['Rotate right','rotate-right'],['Bring to front','front-all']],[['Select all','select-all'],['Clear selection','clear-selection']]]);  
 }else if(name==='facilitator'){
  proHeader(container,'Manage this session','Classroom switches are saved with live boards. Participant access is controlled by the board settings.');
  const settings=board.settings||cleanSettings();
  for(const [key,label] of [['locked','Lock participant editing'],['votingOpen','Voting open'],['follow','Follow instructor view'],['brainstormOpen','Accept private brainstorm ideas']]){
   const lab=elementNode('label','pro-check');const input=elementNode('input');input.type='checkbox';input.checked=!!settings[key];input.dataset.setting=key;lab.append(input,document.createTextNode(label));container.appendChild(lab);
  }
  const cap=elementNode('label','pro-check');cap.textContent='Votes per browser identity (server-enforced): ';
  const num=elementNode('input');num.type='number';num.min=1;num.max=10;num.value=settings.votesPerPerson||3;num.dataset.setting='votesPerPerson';num.style.width='64px';cap.appendChild(num);container.appendChild(cap);
  proActions(container,[[['Copy student join link','invite'],['Focus on this view','focus'],['Clear presenter focus','unfocus']],[['List participants','participants'],['Export attendance','attendance']],[['Create breakout workspace','breakout'],['View private idea inbox','list-private'],['Reveal private ideas','reveal-private']],[['Reset voting counters','reset-votes'],['Export results','action-report']]]);
  const note=elementNode('p','pro-explain');note.textContent='Classroom names are self-reported and votes are capped per browser identity. Private ideas stay hidden from students until revealed.';container.appendChild(note);
  if(room?.role==='owner'&&room.guest&&typeof QRCode==='function'){
    const box=elementNode('div','canvas-qr');const h=elementNode('strong');h.textContent='Scan to join the classroom';const target=elementNode('div');box.append(h,target);container.appendChild(box);
    try{new QRCode(target,{text:inviteLink(),width:186,height:186,correctLevel:QRCode.CorrectLevel.M})}
    catch{box.append(document.createTextNode('Use Copy Join Link if QR creation fails.'))}
  }

 }else if(name==='brainstorm'){
 proHeader(container,'Private brainstorming','Submit privately now; the instructor decides when to reveal ideas.');
 if(!room){const note=elementNode('p','pro-explain');note.textContent='Join or host a live session first.';container.appendChild(note);}
 else{
  const input=elementNode('textarea');input.id='private-idea-text';input.rows=4;input.maxLength=500;input.style.width='100%';input.placeholder='Write a private idea (max 500 characters)…';input.disabled=!board.settings?.brainstormOpen;container.appendChild(input);
  proActions(container,[[['Submit private idea','submit-private']]]);
  if(room.role==='owner')proActions(container,[[['View pending ideas','list-private'],['Reveal on board','reveal-private'],['Clear inbox','clear-private']]]);
  if(!board.settings?.brainstormOpen){const note=elementNode('p','pro-explain');note.textContent='The instructor has not opened private brainstorming.';container.appendChild(note);}
 }
 }else if(name==='tools'){
  proHeader(container,'Templates that move thinking forward','Insert these as editable objects anywhere on your current board.');
  proActions(container,[[['5 Whys','tpl-whys'],['Stakeholders','tpl-stakeholders'],['Force Field','tpl-force']],[['Six Thinking Hats','tpl-hats'],['Decision Matrix','tpl-decision'],['Systems Map','tpl-system']],[['Gradients of Agreement','tpl-gradients'],['Action Plan','tpl-action'],['Retrospective','tpl-retrospective']],[['PESTLE','tpl-pestle'],['Fishbone','tpl-fishbone'],['Team Breakout','tpl-breakout']]]);
 }else if(name==='present'){
  proHeader(container,'Frame-by-frame presentation','Navigate through your group frames in their order on the canvas.');
  proActions(container,[[['◀ Previous frame','prev-frame'],['Next frame ▶','next-frame']],[['Focus participants here','focus'],['Fit entire board','fit'],['Fullscreen','fullscreen']]]);
  const label=elementNode('p','pro-explain');label.id='present-progress';container.appendChild(label);updatePresentationLabel();
 }else if(name==='reports'){
  proHeader(container,'Turn ideas into useful outputs','Export decisions, priority notes, and actions as a Markdown report or printable board.');
  proActions(container,[[['Download facilitation report','action-report'],['Download actions CSV','actions-csv']],[['Print / save as PDF','print-pdf'],['Export board PNG','export-png']],[['Export editable JSON','export-json'],['Copy summary','copy-summary']]]);
 }
}
function boardStore(){
 if(entry==='guest')return toast('Only the facilitator can store a board in this browser');
 if(room?.role==='guest')return toast('Guest boards are not saved in the instructor library');
 const id=localRead('ml.canvas.current.saved-id.v2')||crypto.randomUUID();
 const record={id,title,board:serial(board),updated:new Date().toISOString()};
 const updated=[record,...library.filter(b=>b.id!==id)].slice(0,24);
 if(localStore('ml.canvas.library.v2',updated)){library=updated;localStore('ml.canvas.current.saved-id.v2',id);toast('Board saved in My Boards');openProPanel('library')}
 else toast('Local storage is full. Export JSON instead.');
}
function boardCopy(){localStorage.removeItem('ml.canvas.current.saved-id.v2');boardStore()}
function loadLibraryBoard(){
 const id=$('#saved-board-picker')?.value;const saved=library.find(b=>b.id===id);if(!saved)return toast('Choose a saved board');
 if(!confirm('Open '+saved.title+'? Any unsaved changes in the current workspace may be lost.'))return;
 room=null;localStorage.removeItem(ROOM_KEY);localStore('ml.canvas.current.saved-id.v2',saved.id);
 title=saved.title;board=cleanState(saved.board);history=[];future=[];selected=null;selectedIds.clear();$('#board-title').value=title;
 roomUI();render();fitView();saveLocal();toast('Opened '+title);closeBoardMode();
}
function deleteLibraryBoard(){
 const id=$('#saved-board-picker')?.value;const saved=library.find(b=>b.id===id);if(!saved||!confirm('Delete saved copy '+saved.title+'?'))return;
 library=library.filter(b=>b.id!==id);localStore('ml.canvas.library.v2',library);openProPanel('library');
}
function presentationFrames(){return board.items.filter(o=>o.type==='frame').sort((a,b)=>a.y-b.y||a.x-b.x)}
function focusFrame(o){
 if(!o)return;
 const viewport=$('#canvas-viewport').getBoundingClientRect();zoom=clampZoom(Math.min((viewport.width-100)/o.w,(viewport.height-100)/o.h,1.65));pan={x:(viewport.width-o.w*zoom)/2-o.x*zoom,y:(viewport.height-o.h*zoom)/2-o.y*zoom};applyView();select(o.id);
}
function updatePresentationLabel(){const x=$('#present-progress');if(x)x.textContent=presentationFrames().length?('Frame '+(Math.min(presentIndex,presentationFrames().length-1)+1)+' of '+presentationFrames().length):'Add a group frame to present section by section.'}
function presentNext(step){const frames=presentationFrames();if(!frames.length)return toast('Add a frame first');presentIndex=(presentIndex+step+frames.length)%frames.length;focusFrame(frames[presentIndex]);updatePresentationLabel();}
function focusEveryone(){if(room?.role!=='owner')return toast('Start a live session to focus participants');applyBoardSettings({...board.settings,focus:{x:pan.x,y:pan.y,zoom},follow:true});toast('Presenter view shared with participants')}
function settingsChanged(e){
 const key=e.target.dataset.setting;if(!key)return;
 if(entry==='guest'||room?.role==='guest'){toast('Facilitator controls are restricted');return}
 const value=e.target.type==='checkbox'?e.target.checked:Number(e.target.value);
 applyBoardSettings({...board.settings,[key]:value});
}
function applyBoardSettings(newSettings){
 if(entry==='guest'||room?.role==='guest')return;
 before();board.settings=cleanSettings(newSettings);save();enqueue('settings',{settings:board.settings});
 announce(board.settings.locked?'Participants are in view-only mode':'Classroom settings updated');
}
function breakoutTemplate(){
 const name=prompt('Team name or breakout group number:','Team 1');if(!name)return;
 const x=viewportCenter().x,y=viewportCenter().y;
 add({id:makeId(),type:'frame',text:'TEAM WORKSPACE · '+name.slice(0,60),x:Math.round(x-430),y:Math.round(y-300),w:850,h:600,color:COLORS[5]});
 toast('Team workspace added. This is a shared area, not an isolated or private breakout room.');
}
function extraTemplate(kind){
 if(!canChangeSelected())return toast('The instructor locked editing');
 const center=viewportCenter(),x=Math.max(100,Math.round(center.x-450)),y=Math.max(100,Math.round(center.y-310));
 const data={
 whys:{title:'5 WHYS · ROOT CAUSE',labels:['Problem statement','Why #1?','Why #2?','Why #3?','Why #4?','Why #5?','Root cause / evidence']},
 stakeholders:{title:'STAKEHOLDER MAP',labels:['High power · high interest','High power · low interest','Low power · high interest','Low power · low interest']},
 force:{title:'FORCE FIELD ANALYSIS',labels:['Driving forces','Restraining forces','Actions to strengthen','Actions to reduce resistance']},
 hats:{title:'SIX THINKING HATS',labels:['White · evidence','Red · emotions','Black · risks','Yellow · benefits','Green · alternatives','Blue · next steps']},
 decision:{title:'DECISION MATRIX',labels:['Option A · scores','Option B · scores','Option C · scores','Criteria & weights']},
 system:{title:'SYSTEMS MAP',labels:['Drivers','Connections','Feedback loops','Leverage points']},
 gradients:{title:'GRADIENTS OF AGREEMENT',labels:['1 · Wholehearted support','2 · Support with reservations','3 · Agree with concerns','4 · Abstain','5 · Serious disagreement','6 · Block / revisit']},
 action:{title:'ACTION PLAN',labels:['ACTION: What will we do?','OWNER: Responsible person','DUE: Target date','SUCCESS: Measure of progress']},
 retrospective:{title:'START · STOP · CONTINUE',labels:['START','STOP','CONTINUE']},
 pestle:{title:'PESTLE',labels:['Political','Economic','Social','Technology','Legal','Environmental']},
 fishbone:{title:'CAUSE & EFFECT',labels:['People','Process','Technology','Policies','Environment','Root causes']},
 breakout:{title:'TEAM COLLABORATION',labels:['Our challenge','Evidence','Ideas','Decision','Owner & next step']}
 }[kind];if(!data)return;
 const items=[cleanItem({id:makeId(),type:'frame',text:data.title,x,y,w:980,h:680,color:COLORS[5]})];
 for(let i=0;i<data.labels.length;i++){const cols=data.labels.length>4?3:2, col=i%cols,row=Math.floor(i/cols);items.push(cleanItem({id:makeId(),type:'note',text:data.labels[i],x:x+35+col*(cols===3?310:465),y:y+90+row*172,w:cols===3?280:435,h:142,color:COLORS[(i%5)]}));}
 if(board.items.length+items.length>MAX_ITEMS)return toast('Board object limit reached');
 before();board.items.push(...items);selectedIds=new Set(items.map(o=>o.id));selected=items[0].id;render();persistItems(items);toast('Interactive '+data.title+' added');
}
function reportText(){
 const rows=['# '+title,'','Generated: '+new Date().toLocaleString(),'Stage: '+STEPS[board.stage][0],'Prompt: '+board.prompts[board.stage],'',
 '## Decisions and votes',''];
 for(const o of board.items.filter(o=>['note','shape','text','ellipse'].includes(o.type)).sort((a,b)=>(b.votes||0)-(a.votes||0)))
 rows.push('- '+(o.text||'(blank)').replace(/\n/g,'; ')+(o.votes?' ('+o.votes+' votes)':''));
 rows.push('','## Actions and commitments','');
 for(const o of board.items.filter(o=>/^(ACTION:|OWNER:|DUE:|SUCCESS:)/i.test(o.text)))rows.push('- '+o.text.replace(/\n/g,'; '));
 rows.push('','## Follow-up','- Confirm owners, timing, and the definition of success.');return rows.join('\n');
}
function saveReport(name,type,content){const blob=new Blob([content],{type});download(name,blob)}
function actionsCSV(){
 const escapeCSV=s=>'"'+String(s||'').replaceAll('"','""').replace(/\n/g,'; ')+'"';
 const lines=[['Item','Votes','Group'].map(escapeCSV).join(',')];
 board.items.filter(o=>['note','shape','text','ellipse'].includes(o.type)).forEach(o=>lines.push([o.text,o.votes,o.group].map(escapeCSV).join(',')));
 saveReport('canvas-actions.csv','text/csv;charset=utf-8',lines.join('\r\n'));
}
function printReport(){
 const pop=window.open('','_blank');
 if(!pop)return toast('Allow pop-ups to print a report');
 pop.document.open();
 pop.document.write('<!doctype html><title>Collaboration Report</title><style>body{font-family:Arial,sans-serif;max-width:900px;margin:45px auto;color:#1b3a55;line-height:1.6}pre{white-space:pre-wrap;overflow-wrap:break-word}button{margin-bottom:24px;padding:10px 18px}</style><button onclick="window.print()">Print / Save as PDF</button><pre id="content"></pre>');
 pop.document.close();pop.document.getElementById('content').textContent=reportText();
}
function handlePro(action){
 if(action==='submit-private')return submitPrivateIdea();
 if(action==='participants')return viewParticipants();
 if(action==='attendance')return exportAttendance();
 if(action==='list-private')return listPrivateIdeas();
 if(action==='reveal-private')return revealPrivateIdeas();
 if(action==='clear-private')return clearPrivateIdeas();
 if(action==='save-board')return boardStore();
 if(action==='save-copy')return boardCopy();
 if(action==='load-board')return loadLibraryBoard();
 if(action==='delete-board')return deleteLibraryBoard();
 if(action==='copy')return copySelection();if(action==='paste')return pasteSelection();
 if(action==='delete-all')return deleteSelected();
 if(action==='duplicate-all'){copySelection();return pasteSelection();}
 if(action==='group')return groupSelection();if(action==='ungroup')return ungroupSelection();
 if(action==='lock-selection')return bulkChange(o=>{o.locked=true});
 if(action==='unlock-selection'){const items=selectedObjects();if(!items.length)return;before();items.forEach(o=>o.locked=false);render();persistItems(items);return;}
 if(action.startsWith('align-'))return alignSelection(action.slice(6));
 if(action==='distribute-x'||action==='distribute-y')return distributeSelection(action.at(-1));
 if(action==='rotate-left')return bulkChange(o=>{o.rotation=Math.max(-180,o.rotation-15)});
 if(action==='rotate-right')return bulkChange(o=>{o.rotation=Math.min(180,o.rotation+15)});
 if(action==='front-all')return bulkChange(o=>{board.items=board.items.filter(x=>x!==o).concat(o)});
 if(action==='select-all'){selectedIds=new Set(board.items.filter(o=>!['connector','stroke'].includes(o.type)).map(o=>o.id));selected=[...selectedIds].at(-1);return render()}
 if(action==='clear-selection')return select(null);
 if(action==='invite')return room?.guest?copyText(inviteLink()):toast('Start live session first');
 if(action==='focus')return focusEveryone();
 if(action==='unfocus')return applyBoardSettings({...board.settings,follow:false,focus:null});
 if(action==='breakout')return breakoutTemplate();
 if(action==='reset-votes'){if(room?.role==='guest')return;return bulkResetVotes()}
 if(action==='prev-frame')return presentNext(-1);
 if(action==='next-frame')return presentNext(1);
 if(action==='fit')return fitView();
 if(action==='fullscreen'){const el=$('#canvas-viewport');if(!document.fullscreenElement)return el.requestFullscreen?.();return document.exitFullscreen?.()}
 if(action.startsWith('tpl-'))return extraTemplate(action.slice(4));
 if(action==='action-report')return saveReport('canvas-facilitation-report.md','text/markdown;charset=utf-8',reportText());
 if(action==='actions-csv')return actionsCSV();
 if(action==='print-pdf')return printReport();
 if(action==='export-png')return exportPNG();
 if(action==='export-json')return exportJSON();
 if(action==='copy-summary')return copyText(summary());
}
function bulkResetVotes(){const items=board.items.filter(o=>o.votes>0);if(!items.length)return;before();items.forEach(o=>o.votes=0);voteChoices.clear();render();save();if(room)enqueue('reset_votes',{});toast('Voting totals reset')}
function initPro(){
 const bar=$('#pro-toolbar');if(!bar)return;laserEl=elementNode('div','canvas-laser');laserEl.hidden=true;$('#canvas-viewport').appendChild(laserEl);$('#canvas-viewport').addEventListener('pointerleave',()=>{laserEl.hidden=true});
 bar.addEventListener('click',e=>{const btn=e.target.closest('[data-open]');if(btn)openProPanel(btn.dataset.open)});
 $('#pro-close').addEventListener('click',closeBoardMode);
 $('#pro-panel').addEventListener('click',e=>{const b=e.target.closest('[data-pro]');if(b)handlePro(b.dataset.pro)});
 $('#pro-panel').addEventListener('change',settingsChanged);$('#pro-panel').addEventListener('input',e=>{if(e.target.id==='pro-pen-color')penColor=e.target.value;if(e.target.id==='pro-pen-width')penWidth=Number(e.target.value)});
 $('#canvas-viewport').addEventListener('pointerdown',e=>{if(e.target.closest('.canvas-text-input')&&isMulti(e)){e.preventDefault();e.stopPropagation();select(e.target.dataset.id,{append:true})}},{capture:true});
 window.addEventListener('keydown',e=>{if(e.target.closest('input,textarea,select,[contenteditable]'))return;if(e.ctrlKey||e.metaKey){
 const key=e.key.toLowerCase();
 if(['c','v','g'].includes(key)){e.preventDefault();if(key==='c')copySelection();if(key==='v')pasteSelection();if(key==='g')e.shiftKey?ungroupSelection():groupSelection();}
 }});
 updateSelectionStatus();
}

function bind(){
const viewport=$('#canvas-viewport');
viewport.addEventListener('pointerdown',rightPanStart,{capture:true});
viewport.addEventListener('pointerdown',onCanvasDown);
viewport.addEventListener('pointermove',onPointerMove);
viewport.addEventListener('pointerup',onPointerUp);
viewport.addEventListener('pointercancel',onPointerUp);
viewport.addEventListener('contextmenu',e=>{
 if(e.target.closest('.zoom-control,.empty-guide,.canvas-text-input,input,textarea,select,[contenteditable],.inline-editor-actions'))return;
 e.preventDefault();
});
viewport.addEventListener('auxclick',e=>{if(e.button===2&&!e.target.closest('input,textarea,select,[contenteditable]'))e.preventDefault()});
$('#canvas-viewport').addEventListener('wheel',e=>{e.preventDefault();const r=$('#canvas-viewport').getBoundingClientRect();zoomTo(zoom*(e.deltaY>0?.9:1.1),e.clientX-r.left,e.clientY-r.top)},{passive:false});
$$('[data-tool]').forEach(b=>b.addEventListener('click',()=>setTool(b.dataset.tool)));
$('#empty-start').addEventListener('click',()=>addType('note'));$('#zoom-in').addEventListener('click',()=>zoomTo(zoom*1.2));$('#zoom-out').addEventListener('click',()=>zoomTo(zoom/1.2));$('#zoom-fit').addEventListener('click',fitView);
$('#edit-inline').addEventListener('click',()=>{if(selected)startInlineEdit(selected)});$('#object-text').addEventListener('change',e=>patchSelected({text:e.target.value}));$('#object-width').addEventListener('change',e=>patchSelected({w:Number(e.target.value)}));$('#object-height').addEventListener('change',e=>patchSelected({h:Number(e.target.value)}));
$('#delete-item').addEventListener('click',deleteSelected);$('#duplicate-item').addEventListener('click',duplicateSelected);$('#bring-front').addEventListener('click',()=>{const o=getObj(selected);if(!o)return;before();board.items=board.items.filter(x=>x.id!==o.id).concat(o);render();save();if(room)enqueue('put',{item:o})});
$('#undo').addEventListener('click',undo);$('#redo').addEventListener('click',redo);
$('#stage-prompt').addEventListener('change',e=>{if(entry==='guest')return;before();board.prompts[board.stage]=e.target.value.slice(0,800);save();enqueue('prompts',{prompts:board.prompts})});$('#next-stage').addEventListener('click',()=>setStage((board.stage+1)%6));
$('#apply-template').addEventListener('click',applyTemplate);$('#import-json').addEventListener('click',()=>$('#file-input').click());$('#file-input').addEventListener('change',e=>importJSON(e.target.files[0]));$('#image-input').addEventListener('change',e=>insertImage(e.target.files[0]));
$('#export-json').addEventListener('click',exportJSON);$('#export-png').addEventListener('click',exportPNG);
$('#host-room').addEventListener('click',hostRoom);$('#share-board').addEventListener('click',()=>room?.guest?copyText(inviteLink()):toast('Invitation link is unavailable'));
$('#board-title').addEventListener('change',e=>{if(entry==='guest'||room?.role==='guest')return;title=e.target.value.trim().slice(0,110)||'Untitled collaboration';e.target.value=title;save();enqueue('rename',{name:title})});
$('#new-board').addEventListener('click',()=>{if(!confirm('Start a fresh board? Save a copy first to preserve it in My Boards.'))return;room=null;localStorage.removeItem('ml.canvas.current.saved-id.v2');localStorage.removeItem(ROOM_KEY);board=blank();title='Untitled collaboration';history=[];future=[];selected=null;$('#board-title').value=title;selectedIds.clear();render();fitView();roomUI();save();toast('New personal board ready')});
$('#clear-board').addEventListener('click',()=>{if(room?.role==='guest')return;if(!confirm('Delete every object on this board? This cannot be undone in a live session.'))return;before();board.items=[];selected=null;render();save();enqueue('replace',{state:board})});
$('#copy-summary').addEventListener('click',()=>copyText(summary()));$('#timer-start').addEventListener('click',timerStart);$('#timer-reset').addEventListener('click',()=>{clearInterval(timerInterval);timerInterval=null;timerLeft=Math.max(1,Math.min(180,Number($('#timer-minutes').value)||5))*60;$('#timer-start').textContent='Start';$('.timer').classList.remove('finished');timerRender()});$('#timer-minutes').addEventListener('change',()=>{if(!timerInterval)$('#timer-reset').click()});
window.addEventListener('keydown',e=>{const editing=e.target.closest('input,textarea,select,[contenteditable]');if(e.code==='Space'&&!editing){spaceDown=true;e.preventDefault()}if(editing)return;const key=e.key.toLowerCase();if((e.ctrlKey||e.metaKey)&&key==='z'){e.preventDefault();undo()}else if((e.ctrlKey||e.metaKey)&&key==='y'){e.preventDefault();redo()}else if(key==='delete'||key==='backspace'){e.preventDefault();deleteSelected()}else if(!e.ctrlKey&&!e.metaKey){const shortcuts={v:'select',h:'pan',n:'note',t:'text',r:'shape',e:'ellipse',f:'frame',c:'connector',p:'stroke'};if(shortcuts[key])setTool(shortcuts[key])}});
window.addEventListener('keyup',e=>{if(e.code==='Space')spaceDown=false});window.addEventListener('blur',()=>{spaceDown=false});window.addEventListener('beforeunload',()=>{finishInlineEdit(true);saveLocal()});
}
async function init(){library=localRead('ml.canvas.library.v2')||[];voterId=localRead('ml.canvas.voter.v2')||crypto.randomUUID();localStore('ml.canvas.voter.v2',voterId);bind();initPro();const saved=localRead(DRAFT_KEY);if(saved&&saved.board){board=cleanState(saved.board);title=String(saved.title||title).slice(0,110);$('#board-title').value=title}
render();requestAnimationFrame(fitView);timerRender();roomUI();if(entry==='guest'){const p=new URLSearchParams(location.hash.slice(1));const id=p.get('id'),token=p.get('token');if(/^[0-9a-f-]{36}$/i.test(id||'')&&/^[0-9a-f-]{36}$/i.test(token||''))await joinRoom(id,token);else{setStatus('Invitation required');toast('Open the invitation link provided by your instructor.')}}else await restoreRoom();setInterval(refresh,1900);
}
init().catch(e=>{setStatus('⚠ Canvas startup error');toast(e.message)});
})();