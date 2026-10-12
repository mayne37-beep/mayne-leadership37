(()=>{'use strict';
const $=s=>document.querySelector(s), $$=s=>Array.from(document.querySelectorAll(s));
const API='https://vteamreihsunsllwcphw.supabase.co/rest/v1/rpc/ml_canvas_board_rpc';
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
const blank=()=>({stage:0,items:[],prompts:STEPS.map(s=>s[2])});
const entry=document.body.dataset.entry||'owner';
let board=blank(), title='Untitled collaboration', selected=null, tool='select', zoom=.8, pan={x:0,y:0}, dragging=null, connectFrom=null, room=null, version=0, pending=0, queue=Promise.resolve(), timerLeft=300, timerInterval=null, toastTimeout, imagePoint=null, revision=0;
let history=[],future=[],saveTimer=null,refreshing=false,spaceDown=false,inlineEditing=null;
const canEditText=o=>!!o&&['note','text','shape','ellipse','frame'].includes(o.type);
const svgNS='http://www.w3.org/2000/svg';
const localStore=(key,data)=>{try{localStorage.setItem(key,JSON.stringify(data));return true}catch{return false}};
const localRead=key=>{try{return JSON.parse(localStorage.getItem(key)||'null')}catch{return null}};
const getObj=id=>board.items.find(o=>o.id===id);
const cleanItem=o=>{if(!o||typeof o!=='object'||!['note','text','shape','ellipse','frame','image','connector','stroke'].includes(o.type))return null;
const n=(v,def,min,max)=>Number.isFinite(Number(v))?Math.max(min,Math.min(max,Math.round(Number(v)))):def;
return {id:typeof o.id==='string'&&/^[a-zA-Z0-9_-]{8,80}$/.test(o.id)?o.id:makeId(),type:o.type,x:n(o.x,1500,-200,4500),y:n(o.y,1100,-200,3100),w:n(o.w,210,60,1200),h:n(o.h,145,35,1000),text:String(o.text||'').slice(0,5000),color:safeColor(o.color),votes:n(o.votes,0,0,999),src:typeof o.src==='string'&&/^data:image\/(png|jpeg|webp);base64,[a-zA-Z0-9+/=]+$/.test(o.src)&&o.src.length<110000?o.src:'',from:typeof o.from==='string'?o.from:'',to:typeof o.to==='string'?o.to:'',points:Array.isArray(o.points)?o.points.slice(0,1000).filter(p=>Array.isArray(p)&&p.length===2).map(p=>[n(p[0],0,-200,4600),n(p[1],0,-200,3300)]):[]}};
const cleanState=s=>({stage:Math.max(0,Math.min(5,Number(s?.stage)||0)),items:(Array.isArray(s?.items)?s.items:[]).slice(0,MAX_ITEMS).map(cleanItem).filter(Boolean),prompts:STEPS.map((x,i)=>String((Array.isArray(s?.prompts)?s.prompts[i]:null)||x[2]).slice(0,800))});
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
catch(e){setStatus('⚠ Could not sync changes');toast('Changes could not sync: '+e.message+'. Export your board as a backup.')}
finally{pending--;}
});}
async function refresh(){if(!room||refreshing||pending||dragging||inlineEditing||document.hidden)return;refreshing=true;try{const d=await rpc('get');if(Number(d.version)!==version){version=Number(d.version);board=cleanState(d.state);title=String(d.name||title);$('#board-title').value=title;if(selected&&!getObj(selected))selected=null;render();setStatus('● Live · synchronized')}}catch{setStatus('⚠ Connection interrupted')}finally{refreshing=false}}
function roomUI(){const live=!!room;$('#board-mode').textContent=live?'● Live shared canvas':'◌ Personal workspace';$('#board-mode').classList.toggle('connected',live);$('#room-info').textContent=live?(room.role==='owner'?'Instructor is hosting · invitation enabled':'Joined as a participant · edits sync automatically'):'Private draft · autosaved locally';$('#host-room').hidden=live||entry==='guest';$('#share-board').hidden=!live||room?.role!=='owner';$('#board-title').readOnly=room?.role==='guest'||entry==='guest';$('#stage-prompt').readOnly=room?.role==='guest'||entry==='guest';updateUndo()}
function saveRoom(){if(room?.role==='owner')localStore(ROOM_KEY,{id:room.id,secret:room.secret,guest:room.guest})}
async function hostRoom(){if(room)return;try{setStatus('Creating live board…');const d=await rpc('create',{name:title,state:board});room={id:d.id,secret:d.owner,guest:d.guest,role:'owner'};version=Number(d.version);saveRoom();roomUI();setStatus('● Live board created');toast('Live session ready! Copy the student join link.')}catch(e){setStatus('● Personal draft · saved locally');toast('Unable to start live session: '+e.message)}}
async function joinRoom(id,secret){room={id,secret,role:'guest'};roomUI();setStatus('Connecting to class…');try{const d=await rpc('get');version=Number(d.version);board=cleanState(d.state);title=String(d.name||title);$('#board-title').value=title;render();roomUI();setStatus('● Connected to classroom')}catch(e){room=null;roomUI();setStatus('⚠ Join link unavailable');toast('Unable to join: '+e.message)}}
async function restoreRoom(){const saved=localRead(ROOM_KEY);if(!saved?.id||!saved?.secret)return;room={id:saved.id,secret:saved.secret,guest:saved.guest,role:'owner'};roomUI();try{const d=await rpc('get');version=Number(d.version);board=cleanState(d.state);title=String(d.name||title);$('#board-title').value=title;render();setStatus('● Live · synchronized')}catch(e){room=null;roomUI();setStatus('● Saved on this device');toast('Could not reopen live board: '+e.message)}}
function inviteLink(){const p=new URLSearchParams({id:room.id,token:room.guest});return location.origin+'/collaboration-join.html#'+p.toString()}
async function copyText(text){try{await navigator.clipboard.writeText(text);toast('Copied to clipboard')}catch{window.prompt('Copy this text:',text)}}
function worldPoint(e){const rect=$('#canvas-viewport').getBoundingClientRect();return {x:Math.round((e.clientX-rect.left-pan.x)/zoom),y:Math.round((e.clientY-rect.top-pan.y)/zoom)}}
function viewportCenter(){const r=$('#canvas-viewport').getBoundingClientRect();return{x:(r.width/2-pan.x)/zoom,y:(r.height/2-pan.y)/zoom}}
function clampZoom(value){return Math.min(2.5,Math.max(.25,Math.round(value*100)/100))}
function applyView(){$('#canvas-world').style.transform='translate('+pan.x+'px,'+pan.y+'px) scale('+zoom+')';$('#zoom-level').textContent=Math.round(zoom*100)+'%'}
function zoomTo(z,cx,cy){const v=$('#canvas-viewport').getBoundingClientRect(),x=cx??v.width/2,y=cy??v.height/2, wx=(x-pan.x)/zoom,wy=(y-pan.y)/zoom;zoom=clampZoom(z);pan={x:x-wx*zoom,y:y-wy*zoom};applyView()}
function fitView(){if(!board.items.length){zoom=.76;const rect=$('#canvas-viewport').getBoundingClientRect();pan={x:rect.width/2-1800*zoom,y:rect.height/2-1200*zoom};applyView();return}const shapes=board.items.filter(o=>!['connector','stroke'].includes(o.type));if(!shapes.length)return;const minX=Math.min(...shapes.map(o=>o.x))-110,maxX=Math.max(...shapes.map(o=>o.x+o.w))+110,minY=Math.min(...shapes.map(o=>o.y))-110,maxY=Math.max(...shapes.map(o=>o.y+o.h))+110;const r=$('#canvas-viewport').getBoundingClientRect();zoom=clampZoom(Math.min(r.width/(maxX-minX),r.height/(maxY-minY),1.4));pan={x:(r.width-(maxX-minX)*zoom)/2-minX*zoom,y:(r.height-(maxY-minY)*zoom)/2-minY*zoom};applyView()}
function setTool(next){finishInlineEdit(true);tool=next;connectFrom=null;$$('[data-tool]').forEach(b=>b.classList.toggle('active',b.dataset.tool===next));$('#canvas-viewport').classList.toggle('pan',next==='pan');$('#canvas-viewport').classList.toggle('draw',['stroke','connector'].includes(next));announce(next==='connector'?'Click two objects to connect them':next==='vote'?'Click an idea to add a vote':next==='image'?'Click the board to position an image':'Tool: '+next)}
function add(item){if(board.items.length>=MAX_ITEMS){toast('Canvas limit reached. Export or remove some objects.');return}before();board.items.push(cleanItem(item));selected=item.id;render();save();enqueue('put',{item:getObj(selected)})}
function addType(type,p=viewportCenter()){const id=makeId();const defaults={note:[215,150,'New idea',COLORS[0]],text:[235,80,'Double-click to edit',COLORS[5]],shape:[230,135,'Editable shape',COLORS[1]],ellipse:[180,160,'Idea',COLORS[2]],frame:[430,300,'Group or theme',COLORS[5]]};const [w,h,text,color]=defaults[type]||defaults.note;add({id,type,x:Math.round(p.x-w/2),y:Math.round(p.y-h/2),w,h,text,color,votes:0});setTool('select');startInlineEdit(id,{selectAll:true})}
function elementNode(tag,cls){const node=document.createElement(tag);if(cls)node.className=cls;return node}
function pathNode(tag,attrs={}){const n=document.createElementNS(svgNS,tag);Object.entries(attrs).forEach(([key,value])=>n.setAttribute(key,String(value)));return n}
function xyOf(o){return{x:o.x+o.w/2,y:o.y+o.h/2}}
function renderWires(){const svg=$('#connections');svg.replaceChildren();const defs=pathNode('defs'),marker=pathNode('marker',{id:'arrow',viewBox:'0 0 10 10',refX:9,refY:5,markerWidth:7,markerHeight:7,orient:'auto-start-reverse'});marker.appendChild(pathNode('path',{d:'M 0 0 L 10 5 L 0 10 z',fill:'#608dac'}));defs.appendChild(marker);svg.appendChild(defs);
for(const o of board.items){if(o.type==='connector'){const a=getObj(o.from),b=getObj(o.to);if(!a||!b)continue;const p=xyOf(a),q=xyOf(b),bend=Math.max(45,Math.abs(q.x-p.x)*.38);const d='M '+p.x+' '+p.y+' C '+(p.x+bend)+' '+p.y+' '+(q.x-bend)+' '+q.y+' '+q.x+' '+q.y;const path=pathNode('path',{d,stroke:selected===o.id?'#2268a0':'#608dac','stroke-width':selected===o.id?5:3,fill:'none','marker-end':'url(#arrow)'});path.style.pointerEvents='stroke';path.style.cursor='pointer';path.addEventListener('pointerdown',e=>{e.stopPropagation();select(o.id)});svg.appendChild(path);}
if(o.type==='stroke'&&o.points?.length){const path=pathNode('polyline',{points:o.points.map(p=>p.join(',')).join(' '),stroke:'#205f97','stroke-width':selected===o.id?7:4,fill:'none','stroke-linejoin':'round','stroke-linecap':'round'});path.style.pointerEvents='stroke';path.addEventListener('pointerdown',e=>{e.stopPropagation();select(o.id)});svg.appendChild(path);}}
}

// Directly edit any text-bearing canvas object. The object itself is the editor.
function startInlineEdit(id,{selectAll=false}={}){
 const obj=getObj(id);
 if(!canEditText(obj))return;
 if(inlineEditing?.id===id){inlineEditing.editor.focus();return}
 finishInlineEdit(true);
 select(id);
 const el=Array.from($('.item')).find(node=>node.dataset.id===id);
 if(!el)return;
 const editor=elementNode('textarea','inline-text-editor');
 editor.value=obj.text;
 editor.maxLength=5000;
 editor.spellcheck=true;
 editor.setAttribute('aria-label','Edit '+(obj.type==='note'?'sticky note':obj.type==='text'?'text box':obj.type==='frame'?'group heading':'shape label')+' directly on the canvas');
 editor.setAttribute('aria-multiline','true');
 const actions=elementNode('div','inline-editor-actions');
 const hint=elementNode('span','inline-editor-tip');hint.textContent='Enter: new line · Ctrl+Enter: done · Esc: cancel';
 const done=elementNode('button','inline-editor-done');done.type='button';done.textContent='✓ Done';
 const cancel=elementNode('button','inline-editor-cancel');cancel.type='button';cancel.textContent='Cancel';
 actions.append(hint,done,cancel);
 // Keep focus in the editor when the save/cancel controls are clicked.
 actions.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation()});
 done.addEventListener('click',e=>{e.stopPropagation();finishInlineEdit(true)});
 cancel.addEventListener('click',e=>{e.stopPropagation();finishInlineEdit(false)});
 editor.addEventListener('pointerdown',e=>e.stopPropagation());
 editor.addEventListener('click',e=>e.stopPropagation());
 editor.addEventListener('keydown',e=>{
  e.stopPropagation();
  if(e.key==='Escape'){e.preventDefault();finishInlineEdit(false)}
  else if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){e.preventDefault();finishInlineEdit(true)}
 });
 editor.addEventListener('blur',()=>{if(inlineEditing?.id===id)finishInlineEdit(true)});
 el.classList.add('editing');
 el.append(editor,actions);
 inlineEditing={id,editor,el,original:obj.text};
 announce('Editing directly on the canvas · Ctrl+Enter to save · Esc to cancel');
 editor.focus();
 if(selectAll)editor.select();
 else editor.setSelectionRange(editor.value.length,editor.value.length);
}
function finishInlineEdit(commit=true){
 const active=inlineEditing;
 if(!active)return;
 // Clear first: removing an editor triggers blur, which must never commit twice.
 inlineEditing=null;
 const obj=getObj(active.id);
 const newText=active.editor.value.slice(0,5000);
 active.editor.remove();
 active.el.querySelector('.inline-editor-actions')?.remove();
 active.el.classList.remove('editing');
 if(commit&&obj&&newText!==active.original){
  before();
  obj.text=newText;
  active.el.querySelector('.item-content').textContent=obj.text;
  save();
  enqueue('put',{item:obj});
  announce('Text saved on the canvas');
 }else if(!commit){announce('Editing canceled')}
 renderInspector();
}

function render(){finishInlineEdit(true);const parent=$('#canvas-items');parent.replaceChildren();board.items.forEach((o,i)=>{if(o.type==='connector'||o.type==='stroke')return;const el=elementNode('div','item '+o.type+(selected===o.id?' selected':''));el.dataset.id=o.id;el.style.cssText='left:'+o.x+'px;top:'+o.y+'px;width:'+o.w+'px;height:'+o.h+'px;z-index:'+(o.type==='frame'?0:i+1)+';';
if(o.type==='image'){if(o.src){const img=elementNode('img');img.src=o.src;img.alt=o.text||'Uploaded image';img.draggable=false;el.appendChild(img)}}
else{if(['note','shape','ellipse'].includes(o.type))el.style.backgroundColor=o.color;const content=elementNode('div','item-content');content.textContent=o.text;el.appendChild(content)}
if(o.votes&&o.type!=='frame'){const badge=elementNode('span','vote-count');badge.textContent=String(o.votes);el.appendChild(badge)}
el.title=canEditText(o)?'Click to edit text · drag to move':'Drag to move';el.addEventListener('pointerdown',event=>onObjectDown(event,o.id));el.addEventListener('dblclick',event=>{event.stopPropagation();if(canEditText(o))startInlineEdit(o.id)});parent.appendChild(el)});
renderWires();statusCount();renderInspector();renderStages();updateUndo()}
function select(id){selected=id;$$('.item').forEach(el=>el.classList.toggle('selected',el.dataset.id===id));renderWires();renderInspector()}
function renderInspector(){const item=getObj(selected);$('#inspector').hidden=!item;$('#inspector-empty').hidden=!!item;if(!item)return;$('#selected-type').textContent={note:'Sticky note',text:'Text',shape:'Rectangle',ellipse:'Circle',frame:'Group frame',image:'Image',connector:'Connector',stroke:'Freehand line'}[item.type]||'Object';
if(document.activeElement!==$('#object-text'))$('#object-text').value=item.text;$('#object-width').value=item.w;$('#object-height').value=item.h;$('#object-help').textContent=item.type==='connector'?'Connectors automatically follow their linked objects.':item.type==='stroke'?'Pen lines can be removed or moved through their settings.':'Click this object to edit its text directly, or drag it to move. The side panel is optional.';$('#edit-inline').hidden=!canEditText(item);
$('#object-text').disabled=['connector','stroke','image'].includes(item.type);$('#object-width').disabled=['connector','stroke'].includes(item.type);$('#object-height').disabled=['connector','stroke'].includes(item.type);
const sw=$('#color-swatches');sw.replaceChildren();COLORS.forEach(color=>{const b=elementNode('button');b.type='button';b.title=color;b.style.backgroundColor=color;b.className=color===item.color?'active':'';b.addEventListener('click',()=>patchSelected({color}));sw.appendChild(b)})}
function onObjectDown(e,id){if(e.button!==0&&e.button!==1)return;e.stopPropagation();if(inlineEditing?.id===id){inlineEditing.editor.focus();return}finishInlineEdit(true);const obj=getObj(id);if(!obj)return;if(tool==='text'&&canEditText(obj)){startInlineEdit(id);return}if(tool==='vote'){before();obj.votes=(obj.votes||0)+1;render();save();enqueue('put',{item:obj});announce('Vote added');return}
if(tool==='connector'){if(!connectFrom){connectFrom=id;select(id);announce('Now click the second object to connect')}else if(connectFrom!==id){add({id:makeId(),type:'connector',from:connectFrom,to:id,text:'',color:COLORS[5],x:0,y:0,w:60,h:35});connectFrom=null;setTool('select')}return}
if(tool==='pan'||spaceDown){startPan(e);return}
select(id);if(tool!=='select')return;before();const p=worldPoint(e);dragging={type:'item',id,dx:p.x-obj.x,dy:p.y-obj.y,moved:false};$('#canvas-viewport').setPointerCapture(e.pointerId)}
function startPan(e){dragging={type:'pan',sx:e.clientX,sy:e.clientY,x:pan.x,y:pan.y};$('#canvas-viewport').setPointerCapture(e.pointerId);$('#canvas-viewport').classList.add('dragging')}
function onCanvasDown(e){if(e.target.closest('.zoom-control,.empty-guide'))return;if(e.button!==0&&e.button!==1)return;finishInlineEdit(true);
if(e.button===1||tool==='pan'||spaceDown){startPan(e);return}
const point=worldPoint(e);
if(tool==='stroke'){before();const id=makeId();board.items.push(cleanItem({id,type:'stroke',x:point.x,y:point.y,w:60,h:35,points:[[point.x,point.y]],color:COLORS[1]}));dragging={type:'stroke',id};$('#canvas-viewport').setPointerCapture(e.pointerId);renderWires();return}
if(tool==='image'){imagePoint=point;$('#image-input').click();return}
if(['note','text','shape','ellipse','frame'].includes(tool)){addType(tool,point);return}
select(null)}
function onPointerMove(e){if(!dragging)return;
if(dragging.type==='pan'){pan.x=dragging.x+e.clientX-dragging.sx;pan.y=dragging.y+e.clientY-dragging.sy;applyView();return}
if(dragging.type==='item'){const o=getObj(dragging.id);if(!o)return;const p=worldPoint(e);const x=Math.max(-100,Math.min(4500,Math.round((p.x-dragging.dx)/10)*10)),y=Math.max(-100,Math.min(3150,Math.round((p.y-dragging.dy)/10)*10));if(x!==o.x||y!==o.y)dragging.moved=true;o.x=x;o.y=y;const node=$('.item[data-id="'+o.id+'"]');if(node){node.style.left=x+'px';node.style.top=y+'px'}renderWires();return}
if(dragging.type==='stroke'){const o=getObj(dragging.id);if(o&&o.points.length<1000){const p=worldPoint(e),last=o.points[o.points.length-1];if(Math.hypot(p.x-last[0],p.y-last[1])>5){o.points.push([p.x,p.y]);renderWires()}}}}
function onPointerUp(e){if(!dragging)return;const was=dragging;dragging=null;$('#canvas-viewport').classList.remove('dragging');try{$('#canvas-viewport').releasePointerCapture(e.pointerId)}catch{}
if(was.type==='item'){if(was.moved){const o=getObj(was.id);save();enqueue('put',{item:o});announce('Object moved')}else{if(!room&&history.length){history.pop();updateUndo()}if(canEditText(getObj(was.id)))startInlineEdit(was.id)}}
if(was.type==='stroke'){const o=getObj(was.id);if(o){if(o.points.length<2)o.points.push([o.x+1,o.y+1]);selected=o.id;render();save();enqueue('put',{item:o})}}
}
function patchSelected(changes){const o=getObj(selected);if(!o)return;before();Object.assign(o,changes);const cleaned=cleanItem(o);Object.assign(o,cleaned);render();save();enqueue('put',{item:o})}
function deleteSelected(){if(!selected)return;const id=selected;const dependent=board.items.filter(o=>o.type==='connector'&&(o.from===id||o.to===id)).map(o=>o.id);before();board.items=board.items.filter(o=>o.id!==id&&!dependent.includes(o.id));selected=null;render();save();enqueue('remove',{id});dependent.forEach(linkId=>enqueue('remove',{id:linkId}))}
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
for(const o of board.items){if(o.type==='connector'){const a=getObj(o.from),b=getObj(o.to);if(!a||!b)continue;const p=xyOf(a),q=xyOf(b);ctx.strokeStyle='#5886a5';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(q.x,q.y);ctx.stroke();const angle=Math.atan2(q.y-p.y,q.x-p.x);ctx.beginPath();ctx.moveTo(q.x,q.y);ctx.lineTo(q.x-14*Math.cos(angle-.5),q.y-14*Math.sin(angle-.5));ctx.lineTo(q.x-14*Math.cos(angle+.5),q.y-14*Math.sin(angle+.5));ctx.closePath();ctx.fillStyle='#5886a5';ctx.fill()}else if(o.type==='stroke'&&o.points.length){ctx.beginPath();ctx.strokeStyle='#205f97';ctx.lineWidth=4;o.points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.stroke()}}
for(const o of objs){ctx.save();if(o.type==='frame'){ctx.strokeStyle='#79a6c4';ctx.setLineDash([8,6]);ctx.lineWidth=2;ctx.strokeRect(o.x,o.y,o.w,o.h);ctx.setLineDash([])}else if(o.type!=='text'&&o.type!=='image'){ctx.fillStyle=o.color;ctx.strokeStyle='#a9c2d4';ctx.lineWidth=1.6;if(o.type==='ellipse'){ctx.beginPath();ctx.ellipse(o.x+o.w/2,o.y+o.h/2,o.w/2,o.h/2,0,0,Math.PI*2);ctx.fill();ctx.stroke()}else{ctx.fillRect(o.x,o.y,o.w,o.h);ctx.strokeRect(o.x,o.y,o.w,o.h)}}if(o.type==='image'){if(o.src){try{const img=await loadImage(o.src);ctx.drawImage(img,o.x,o.y,o.w,o.h)}catch{}}}else{ctx.fillStyle='#27455d';ctx.font=(o.type==='text'?'bold 21px':o.type==='frame'?'bold 17px':'600 16px')+' Segoe UI, sans-serif';wrap(ctx,o.text,o.x+15,o.y+27,o.w-28,o.type==='text'?27:21,Math.floor(o.h/21)-1)}if(o.votes){ctx.fillStyle='#296b9f';ctx.beginPath();ctx.arc(o.x+o.w,o.y,18,0,Math.PI*2);ctx.fill();ctx.fillStyle='#fff';ctx.font='bold 14px Segoe UI';ctx.fillText(String(o.votes),o.x+o.w-6,o.y+5)}ctx.restore()}
c.toBlob(b=>b?download('collaboration-canvas.png',b):toast('Unable to export PNG'),'image/png')}
function summary(){const lines=[title,'Stage: '+STEPS[board.stage][0],'Question: '+board.prompts[board.stage],''];for(const o of board.items.filter(o=>['note','text','shape','ellipse'].includes(o.type))){lines.push('- '+(o.text||'(blank)')+(o.votes?' ('+o.votes+' votes)':''))}return lines.join('\n')}
function timerRender(){$('#timer-display').textContent=String(Math.floor(timerLeft/60)).padStart(2,'0')+':'+String(timerLeft%60).padStart(2,'0')}
function timerStart(){if(timerInterval){clearInterval(timerInterval);timerInterval=null;$('#timer-start').textContent='Resume';return}if(timerLeft<=0)timerLeft=Math.max(1,Math.min(180,Number($('#timer-minutes').value)||5))*60;$('#timer-start').textContent='Pause';timerInterval=setInterval(()=>{timerLeft--;timerRender();if(timerLeft<=0){clearInterval(timerInterval);timerInterval=null;$('#timer-start').textContent='Start';$('.timer').classList.add('finished');toast('Facilitation time is up!')}},1000)}
function bind(){
$('#canvas-viewport').addEventListener('pointerdown',onCanvasDown);$('#canvas-viewport').addEventListener('pointermove',onPointerMove);$('#canvas-viewport').addEventListener('pointerup',onPointerUp);$('#canvas-viewport').addEventListener('pointercancel',onPointerUp);
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
$('#new-board').addEventListener('click',()=>{if(!confirm('Start a fresh board? The current draft is preserved only if you exported it.'))return;room=null;localStorage.removeItem(ROOM_KEY);board=blank();title='Untitled collaboration';history=[];future=[];selected=null;$('#board-title').value=title;render();fitView();roomUI();save();toast('New personal board ready')});
$('#clear-board').addEventListener('click',()=>{if(room?.role==='guest')return;if(!confirm('Delete every object on this board? This cannot be undone in a live session.'))return;before();board.items=[];selected=null;render();save();enqueue('replace',{state:board})});
$('#copy-summary').addEventListener('click',()=>copyText(summary()));$('#timer-start').addEventListener('click',timerStart);$('#timer-reset').addEventListener('click',()=>{clearInterval(timerInterval);timerInterval=null;timerLeft=Math.max(1,Math.min(180,Number($('#timer-minutes').value)||5))*60;$('#timer-start').textContent='Start';$('.timer').classList.remove('finished');timerRender()});$('#timer-minutes').addEventListener('change',()=>{if(!timerInterval)$('#timer-reset').click()});
window.addEventListener('keydown',e=>{const editing=e.target.closest('input,textarea,select,[contenteditable]');if(e.code==='Space'&&!editing){spaceDown=true;e.preventDefault()}if(editing)return;const key=e.key.toLowerCase();if((e.ctrlKey||e.metaKey)&&key==='z'){e.preventDefault();undo()}else if((e.ctrlKey||e.metaKey)&&key==='y'){e.preventDefault();redo()}else if(key==='delete'||key==='backspace'){e.preventDefault();deleteSelected()}else if(!e.ctrlKey&&!e.metaKey){const shortcuts={v:'select',h:'pan',n:'note',t:'text',r:'shape',e:'ellipse',f:'frame',c:'connector',p:'stroke'};if(shortcuts[key])setTool(shortcuts[key])}});
window.addEventListener('keyup',e=>{if(e.code==='Space')spaceDown=false});window.addEventListener('blur',()=>{spaceDown=false});window.addEventListener('beforeunload',()=>{finishInlineEdit(true);saveLocal()});
}
async function init(){bind();const saved=localRead(DRAFT_KEY);if(saved&&saved.board){board=cleanState(saved.board);title=String(saved.title||title).slice(0,110);$('#board-title').value=title}
render();requestAnimationFrame(fitView);timerRender();roomUI();if(entry==='guest'){const p=new URLSearchParams(location.hash.slice(1));const id=p.get('id'),token=p.get('token');if(/^[0-9a-f-]{36}$/i.test(id||'')&&/^[0-9a-f-]{36}$/i.test(token||''))await joinRoom(id,token);else{setStatus('Invitation required');toast('Open the invitation link provided by your instructor.')}}else await restoreRoom();setInterval(refresh,1900);
}
init().catch(e=>{setStatus('⚠ Canvas startup error');toast(e.message)});
})();