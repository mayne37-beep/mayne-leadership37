import {STORAGE_KEY,MAX_SCENES,PALETTES,makeId,makeScene,newProject,demoProject,normalizeProject,clock,totalSeconds,safeProjectExport,parseProjectImport} from './video-studio-core.js';

const $ = id => document.getElementById(id);
const canvas=$('video-canvas'),ctx=canvas.getContext('2d');
let projects=[],projectId='',sceneId='',playback=null,recording=false,audioPlaying=null,storageOK=true;
const selectedProject=()=>projects.find(p=>p.id===projectId);
const selectedScene=()=>selectedProject()?.scenes.find(s=>s.id===sceneId);
const sceneFields={ 'scene-title':'title','scene-subtitle':'subtitle','scene-script':'script','scene-duration':'duration',
  'scene-layout':'layout','scene-theme':'theme','scene-presenter':'presenter' };

function status(message,kind=''){
  $('status').textContent=message;
  $('status').className='status'+(kind?' '+kind:'');
}
function persist(){
  try {localStorage.setItem(STORAGE_KEY,JSON.stringify(projects));localStorage.setItem(STORAGE_KEY+'-selected',projectId);}
  catch {storageOK=false;status('Browser storage is full or unavailable. Export a JSON backup before closing this tab.','error');}
}
function load(){
  try {
    const data=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null');
    if(Array.isArray(data)) projects=data.slice(0,40).map(normalizeProject);
  }catch {status('Previous project data could not be loaded. A starter project has been created.','error');}
  if(!projects.length)projects=[demoProject()];
  try {projectId=localStorage.getItem(STORAGE_KEY+'-selected')||projects[0].id;}catch {}
  if(!projects.some(p=>p.id===projectId))projectId=projects[0].id;
  sceneId=selectedProject().scenes[0].id;
}
function touch(){
  const p=selectedProject();if(p)p.updatedAt=new Date().toISOString();
  persist();
}
function renderProjectChoice(){
  const node=$('project-choice');node.replaceChildren();
  for(const p of projects){const o=new Option(p.name,p.id);node.add(o);}
  node.value=projectId;
}
function renderScenes(){
  const p=selectedProject();const out=$('scene-list');out.replaceChildren();
  p.scenes.forEach((s,i)=>{
    const row=document.createElement('div');row.className='scene-card'+(s.id===sceneId?' active':'');row.setAttribute('role','listitem');
    const select=document.createElement('button');select.type='button';select.className='scene-card';select.style.cssText='background:transparent;border:0;padding:0;min-width:0;flex:1';
    select.setAttribute('aria-label','Select scene '+(i+1)+': '+s.title);
    const number=document.createElement('span');number.className='scene-number';number.textContent=String(i+1).padStart(2,'0');
    const data=document.createElement('span');data.className='scene-data';
    const title=document.createElement('strong');title.textContent=s.title;
    const detail=document.createElement('small');detail.textContent=clock(s.duration)+' · '+s.layout.replaceAll('-',' ');
    data.append(title,detail);select.append(number,data);
    select.addEventListener('click',()=>selectScene(s.id));
    const reorder=document.createElement('span');reorder.className='reorder';
    for(const [delta,label,symbol] of [[-1,'Move scene up','▲'],[1,'Move scene down','▼']]){
      const b=document.createElement('button');b.type='button';b.textContent=symbol;b.title=label;b.setAttribute('aria-label',label+' '+(i+1));
      b.disabled=(delta===-1&&i===0)||(delta===1&&i===p.scenes.length-1);
      b.addEventListener('click',()=>{const newIndex=i+delta;[p.scenes[i],p.scenes[newIndex]]=[p.scenes[newIndex],p.scenes[i]];touch();renderScenes();drawCurrent();});
      reorder.append(b);
    }
    row.append(select,reorder);out.append(row);
  });
  $('scene-total').textContent=p.scenes.length+' scene'+(p.scenes.length===1?'':'s')+' · '+clock(totalSeconds(p))+' total';
  $('editor-scene-index').textContent=String(p.scenes.findIndex(s=>s.id===sceneId)+1).padStart(2,'0')+' / '+String(p.scenes.length).padStart(2,'0');
  $('stage-label').textContent='Scene '+(p.scenes.findIndex(s=>s.id===sceneId)+1);
  $('play-time').textContent='0:00 / '+clock(totalSeconds(p));
}
function populateEditor(){
  const p=selectedProject(),s=selectedScene();
  $('project-name').value=p.name;
  for(const [id,key] of Object.entries(sceneFields))$(id).value=s[key];
  $('scene-audio').value='';
  refreshAudioInfo();
}
function selectScene(id){
  stopPreview();stopAudio();sceneId=id;renderScenes();populateEditor();drawCurrent();
}
function selectProject(id){
  if(!projects.some(p=>p.id===id))return;
  stopPreview();stopAudio();projectId=id;sceneId=selectedProject().scenes[0].id;
  persist();renderProjectChoice();renderScenes();populateEditor();drawCurrent();
}
function refreshAll(){renderProjectChoice();renderScenes();populateEditor();drawCurrent();}
function rounded(x,y,w,h,r,fill){
  ctx.fillStyle=fill;ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill();
}
function circle(x,y,r,color){ctx.fillStyle=color;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();}
function wrapText(text,maxWidth,maxLines,font){
  ctx.font=font;
  const words=String(text).replace(/\s+/g,' ').split(' ');
  const lines=[];let line='';
  for(const word of words){
    const next=line?line+' '+word:word;
    if(ctx.measureText(next).width<=maxWidth){line=next;continue;}
    if(line)lines.push(line);
    // Handle unbroken words to avoid off-canvas text.
    if(ctx.measureText(word).width>maxWidth){let chunk='';for(const c of word){if(ctx.measureText(chunk+c).width>maxWidth){lines.push(chunk);chunk=c;}else chunk+=c;}line=chunk;}
    else line=word;
    if(lines.length>=maxLines)break;
  }
  if(lines.length<maxLines && line)lines.push(line);
  if(lines.length>maxLines)lines.length=maxLines;
  if(lines.length===maxLines && lines.join(' ').length<text.length){
    let s=lines[maxLines-1];while(s.length&&ctx.measureText(s+'…').width>maxWidth)s=s.slice(0,-1);
    lines[maxLines-1]=s+'…';
  }
  return lines;
}
function paintParagraph(text,x,y,width,font,color,lineHeight,maxLines=5){
  const lines=wrapText(text,width,maxLines,font);ctx.font=font;ctx.fillStyle=color;ctx.textBaseline='top';
  lines.forEach((line,i)=>ctx.fillText(line,x,y+i*lineHeight));
  return lines.length*lineHeight;
}
function presenter(x,y,scale=1,variant='Alex'){
  ctx.save();ctx.translate(x,y);ctx.scale(scale,scale);
  circle(165,265,205,'#ffffff12');
  rounded(8,205,315,345,75,variant==='Alex'?'#152d4d':'#432a45');
  rounded(102,193,130,190,52,variant==='Alex'?'#eff4f9':'#f0e4dc');
  // arms and jacket
  rounded(20,250,97,268,45,variant==='Alex'?'#213f68':'#624365');
  rounded(226,250,97,268,45,variant==='Alex'?'#213f68':'#624365');
  rounded(113,165,113,103,36,variant==='Alex'?'#bc8061':'#91654c');
  circle(170,127,108,variant==='Alex'?'#d6a17f':'#b78265');
  ctx.fillStyle=variant==='Alex'?'#342932':'#241d25';
  ctx.beginPath();ctx.ellipse(170,57,100,53,0,Math.PI,0);ctx.fill();
  ctx.fillStyle='#281d26';circle(126,129,7,'#29222a');circle(210,129,7,'#29222a');
  ctx.strokeStyle='#6c3e37';ctx.lineWidth=5;ctx.beginPath();ctx.arc(168,150,26,0.19*Math.PI,.81*Math.PI);ctx.stroke();
  ctx.restore();
}
function drawScene(s,secs=0,index=0){
  if(!ctx||!s)return;
  const p=PALETTES[s.theme]||PALETTES.navy;
  ctx.clearRect(0,0,1280,720);
  const gradient=ctx.createLinearGradient(0,0,1280,720);gradient.addColorStop(0,p.bg);gradient.addColorStop(1,p.bg2);
  ctx.fillStyle=gradient;ctx.fillRect(0,0,1280,720);
  // Deliberate decorative shapes; no external media licensing needed.
  ctx.strokeStyle='#ffffff13';ctx.lineWidth=2;
  for(let j=0;j<6;j++){ctx.beginPath();ctx.arc(1160,140,110+j*52,0,Math.PI*2);ctx.stroke();}
  rounded(70,51,270,39,19,'#ffffff17');
  paintParagraph('MAYNE LEADERSHIP  /  VIDEO STUDIO',89,61,445,'bold 18px system-ui',p.soft,25,1);
  ctx.fillStyle=p.accent;ctx.fillRect(70,117,68,7);
  if(s.layout==='title'){
    paintParagraph(s.title,104,241,1060,'bold 73px system-ui',p.ink,86,3);
    paintParagraph(s.subtitle,107,501,980,'32px system-ui',p.soft,46,3);
  }else if(s.layout==='text-only'){
    paintParagraph(s.title,95,203,1090,'bold 65px system-ui',p.ink,79,3);
    paintParagraph(s.subtitle,99,436,1050,'32px system-ui',p.soft,48,4);
  }else{
    const left=s.layout==='presenter-left',split=s.layout==='split';
    const presenterX=left?80:split?827:860;
    const textX=left?525:95;
    const maxWidth=split?700:670;
    if(s.presenter!=='None')presenter(presenterX,185,split?.92:1.03,s.presenter);
    if(s.presenter==='None'){rounded(820,175,310,330,42,'#ffffff16');paintParagraph('LEADERSHIP',861,313,245,'bold 36px system-ui',p.soft,46,1);}
    paintParagraph(s.title,textX,230,maxWidth,'bold 66px system-ui',p.ink,81,3);
    paintParagraph(s.subtitle,textX+4,456,maxWidth-10,'31px system-ui',p.soft,46,4);
  }
  ctx.fillStyle='#ffffff20';ctx.fillRect(70,645,1140,3);
  ctx.fillStyle=p.accent;ctx.fillRect(70,645,Math.min(1140,1140*secs/Math.max(1,s.duration)),3);
  paintParagraph('LEADERSHIP 101  •  '+String(index+1).padStart(2,'0'),74,668,520,'bold 17px system-ui',p.soft,22,1);
  paintParagraph(clock(secs)+' / '+clock(s.duration),1081,668,160,'17px system-ui',p.soft,22,1);
}
function drawCurrent(){const p=selectedProject();const i=p.scenes.findIndex(s=>s.id===sceneId);drawScene(selectedScene(),0,i);}
function download(blob,name){
  const url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=name;a.style.display='none';document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),30000);
}
function safeFilename(v){return (v||'leadership-video').toLowerCase().replace(/[^a-z0-9 -]/g,'').trim().replace(/\s+/g,'-').slice(0,80)||'leadership-video';}
function stopAudio(){
  if(audioPlaying){audioPlaying.pause();audioPlaying.src='';audioPlaying=null;}
  if('speechSynthesis' in window)window.speechSynthesis.cancel();
}
function stopPreview(){
  if(playback){cancelAnimationFrame(playback.frame);playback=null;}
  stopAudio();
  $('play-preview').disabled=false;$('stop-preview').disabled=true;
  drawCurrent();
  if(selectedProject())$('play-time').textContent='0:00 / '+clock(totalSeconds(selectedProject()));
}
function openDb(){
  return new Promise((resolve,reject)=>{
    if(!('indexedDB' in window)){reject(Error('Browser storage not supported'));return;}
    const r=indexedDB.open('mayne-video-studio-media-v1',1);
    r.onupgradeneeded=()=>r.result.createObjectStore('audio');
    r.onerror=()=>reject(r.error||Error('Database unavailable'));
    r.onsuccess=()=>resolve(r.result);
  });
}
async function putAudio(key,file){
  const db=await openDb();
  try{await new Promise((resolve,reject)=>{
    const tx=db.transaction('audio','readwrite');tx.objectStore('audio').put({blob:file,name:file.name,type:file.type},key);
    tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
  });}finally{db.close();}
}
async function getAudio(key){
  if(!key)return null;
  const db=await openDb();
  try{return await new Promise((resolve,reject)=>{
    const tx=db.transaction('audio','readonly');const req=tx.objectStore('audio').get(key);
    req.onsuccess=()=>resolve(req.result||null);req.onerror=()=>reject(req.error);
  });}finally{db.close();}
}
async function refreshAudioInfo(){
  const s=selectedScene();if(!s)return;
  $('audio-info').textContent='Checking narration…';$('play-audio').disabled=true;$('remove-audio').disabled=!s.audioAssetId;
  if(!s.audioAssetId){$('audio-info').textContent='No narration attached. Voice preview is not included in video export.';return;}
  try{
    const a=await getAudio(s.audioAssetId);
    if(selectedScene()?.id!==s.id)return;
    $('audio-info').textContent=a?'Attached: '+a.name:'Audio was not found on this device; please reattach.';
    $('play-audio').disabled=!a;
  }catch{if(selectedScene()?.id===s.id)$('audio-info').textContent='Audio storage unavailable on this device.';}
}
async function playAttached(scene,quiet=false){
  try{
    const clip=await getAudio(scene.audioAssetId);if(!clip)return null;
    const url=URL.createObjectURL(clip.blob);const audio=new Audio(url);
    audio.onended=()=>{if(audioPlaying===audio)audioPlaying=null;URL.revokeObjectURL(url);};
    await audio.play();audioPlaying=audio;
    return audio;
  }catch(err){if(!quiet)status('Could not play attached narration: '+err.message,'error');return null;}
}
function previewSceneAudio(scene){
  // Calls after a scene transition may be blocked by mobile autoplay rules.
  if(scene.audioAssetId)void playAttached(scene,true);
}
function beginPreview(){
  if(recording)return;stopPreview();
  const p=selectedProject(),scenes=p.scenes;
  const state={index:0,start:performance.now(),frame:0,total:0};playback=state;
  $('play-preview').disabled=true;$('stop-preview').disabled=false;
  previewSceneAudio(scenes[0]);
  function tick(now){
    if(playback!==state)return;
    let elapsed=(now-state.start)/1000;
    while(elapsed>=scenes[state.index].duration){
      state.total+=scenes[state.index].duration;state.start+=scenes[state.index].duration*1000;
      state.index++;
      if(state.index>=scenes.length){stopPreview();status('Storyboard preview finished.');return;}
      stopAudio();previewSceneAudio(scenes[state.index]);elapsed=(now-state.start)/1000;
    }
    drawScene(scenes[state.index],elapsed,state.index);
    $('stage-label').textContent='Playing scene '+(state.index+1);
    $('play-time').textContent=clock(state.total+elapsed)+' / '+clock(totalSeconds(p));
    state.frame=requestAnimationFrame(tick);
  }
  state.frame=requestAnimationFrame(tick);
  status('Playing storyboard. Recorded narration will play when your browser allows it.');
}
function previewVoice(){
  if(!('speechSynthesis' in window)){status('This browser does not support spoken script previews.','error');return;}
  if(recording)return;
  stopAudio();const script=selectedScene().script;
  if(!script){status('Write a scene narration script first.','error');return;}
  const utterance=new SpeechSynthesisUtterance(script);utterance.rate=.93;utterance.pitch=1;
  window.speechSynthesis.speak(utterance);
  status('Playing a browser voice preview. This voice is not embedded in exported videos.');
}
async function exportVideo(){
  if(recording)return;
  if(!ctx||!HTMLCanvasElement.prototype.captureStream||!window.MediaRecorder){
    status('Video export is unsupported in this browser. Try an up-to-date Chrome or Edge browser.','error');return;
  }
  const mimeTypes=['video/mp4;codecs=avc1.42E01E,mp4a.40.2','video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'];
  const mime=mimeTypes.find(x=>MediaRecorder.isTypeSupported(x));
  if(!mime){status('No compatible video recording format is available in this browser.','error');return;}
  const p=structuredClone(selectedProject()),seconds=totalSeconds(p);
  if(seconds>600&&!confirm('This project is over 10 minutes. Browser rendering uses substantial memory. Continue?'))return;
  stopPreview();stopAudio();
  recording=true;$('render-video').disabled=true;$('play-preview').disabled=true;
  $('render-video').textContent='Rendering…';
  let media=null,recorder=null,stream=null,dest=null,ac=null,frame=0,currentAudio=null,currentUrl='',finished=false;
  const blobs=new Map();
  try{
    for(const s of p.scenes){
      if(s.audioAssetId && !blobs.has(s.audioAssetId)){const a=await getAudio(s.audioAssetId);if(a)blobs.set(s.audioAssetId,a);}
    }
    const AudioContextType=window.AudioContext||window.webkitAudioContext;
    if(AudioContextType){ac=new AudioContextType();await ac.resume();dest=ac.createMediaStreamDestination();}
    stream=canvas.captureStream(30);
    const tracks=[...stream.getVideoTracks(),...(dest?dest.stream.getAudioTracks():[])];
    media=new MediaStream(tracks);
    recorder=new MediaRecorder(media,{mimeType:mime,videoBitsPerSecond:3600000});
    const chunks=[];
    recorder.ondataavailable=e=>{if(e.data&&e.data.size)chunks.push(e.data);};
    let index=0,total=0,start=performance.now();
    function stopClip(){
      if(currentAudio){currentAudio.pause();currentAudio.removeAttribute('src');currentAudio.load();currentAudio=null;}
      if(currentUrl){URL.revokeObjectURL(currentUrl);currentUrl='';}
    }
    function startClip(scene){
      stopClip();const clip=blobs.get(scene.audioAssetId);
      if(!clip||!dest||!ac)return;
      currentUrl=URL.createObjectURL(clip.blob);currentAudio=new Audio(currentUrl);
      const source=ac.createMediaElementSource(currentAudio);source.connect(dest);
      currentAudio.play().catch(()=>{status('Could not include one narration clip. Video rendering continues.','error');});
    }
    function cleanup(){
      if(finished)return;finished=true;cancelAnimationFrame(frame);stopClip();
      for(const track of media?.getTracks()||[])track.stop();
      for(const track of stream?.getTracks()||[])track.stop();
      if(ac)void ac.close().catch(()=>{});
      recording=false;$('render-video').disabled=false;$('render-video').textContent='Export video';
      $('play-preview').disabled=false;drawCurrent();
    }
    recorder.onerror=()=>{cleanup();status('The video recorder encountered an error. Please try again.','error');};
    recorder.onstop=()=>{
      const output=new Blob(chunks,{type:recorder.mimeType||mime});
      cleanup();
      if(!output.size){status('No video data was recorded. Please retry in Chrome or Edge.','error');return;}
      const ext=(recorder.mimeType||mime).startsWith('video/mp4')?'mp4':'webm';
      download(output,safeFilename(p.name)+'.'+ext);
      status('Video exported: '+clock(seconds)+' · '+(output.size/1048576).toFixed(1)+' MB.','success');
    };
    drawScene(p.scenes[0],0,0);
    recorder.start(500);
    start=performance.now();
    startClip(p.scenes[0]);
    status('Rendering in your browser. Keep this tab visible until export finishes.');
    function tick(now){
      if(finished)return;
      let elapsed=(now-start)/1000;
      while(elapsed>=p.scenes[index].duration){
        total+=p.scenes[index].duration;start+=p.scenes[index].duration*1000;index++;
        if(index>=p.scenes.length){
          drawScene(p.scenes[p.scenes.length-1],p.scenes[p.scenes.length-1].duration,p.scenes.length-1);
          recorder.stop();return;
        }
        startClip(p.scenes[index]);elapsed=(now-start)/1000;
      }
      drawScene(p.scenes[index],elapsed,index);
      $('play-time').textContent=clock(total+elapsed)+' / '+clock(seconds);
      status('Rendering scene '+(index+1)+' of '+p.scenes.length+' · '+Math.floor((total+elapsed)/seconds*100)+'%. Keep tab visible.');
      frame=requestAnimationFrame(tick);
    }
    frame=requestAnimationFrame(tick);
  }catch(err){
    try{if(recorder?.state==='recording')recorder.stop();}catch{}
    if(frame)cancelAnimationFrame(frame);
    if(currentAudio)currentAudio.pause();
    if(currentUrl)URL.revokeObjectURL(currentUrl);
    for(const track of media?.getTracks()||[])track.stop();
    for(const track of stream?.getTracks()||[])track.stop();
    if(ac)void ac.close().catch(()=>{});
    recording=false;$('render-video').disabled=false;$('render-video').textContent='Export video';$('play-preview').disabled=false;
    drawCurrent();status('Video export failed: '+err.message,'error');
  }
}
function wire(){
  $('project-choice').addEventListener('change',e=>selectProject(e.target.value));
  $('new-project').addEventListener('click',()=>{
    if(recording)return;
    const name=prompt('Project name','New Leadership Video');if(name===null)return;
    if(projects.length>=40){status('Maximum 40 local projects. Back up and remove older projects.','error');return;}
    const p=newProject(name.trim().slice(0,120));projects.push(p);selectProject(p.id);status('New video project created.','success');
  });
  $('duplicate-project').addEventListener('click',()=>{
    if(recording)return;if(projects.length>=40)return status('Maximum 40 projects.','error');
    const original=selectedProject(),p=normalizeProject({...structuredClone(original),id:makeId(),name:original.name+' (copy)',
      scenes:original.scenes.map(s=>({...s,id:makeId()}))});
    projects.push(p);selectProject(p.id);status('Project duplicated. Narration files remain on this device.','success');
  });
  $('delete-project').addEventListener('click',()=>{
    if(recording)return;if(!confirm('Delete this video project from this browser? Export JSON first if you need a backup.'))return;
    projects=projects.filter(p=>p.id!==projectId);
    if(!projects.length)projects=[newProject()];
    selectProject(projects[0].id);status('Project deleted.','success');
  });
  $('project-name').addEventListener('input',e=>{selectedProject().name=e.target.value.slice(0,120)||'Untitled Video';touch();renderProjectChoice();});
  for(const [id,key] of Object.entries(sceneFields)){
    $(id).addEventListener('input',e=>{
      if(recording)return;
      let value=e.target.value;
      if(key==='duration')value=Math.min(120,Math.max(3,Number(value)||3));
      selectedScene()[key]=value;touch();renderScenes();drawCurrent();
    });
  }
  $('add-scene').addEventListener('click',()=>{
    if(recording)return;const p=selectedProject();if(p.scenes.length>=MAX_SCENES)return status('Maximum 40 scenes per video.','error');
    const scene=makeScene({title:'Scene '+(p.scenes.length+1),theme:'blue'});
    p.scenes.push(scene);touch();selectScene(scene.id);
  });
  $('clone-scene').addEventListener('click',()=>{
    if(recording)return;const p=selectedProject();if(p.scenes.length>=MAX_SCENES)return status('Maximum 40 scenes per video.','error');
    const i=p.scenes.findIndex(s=>s.id===sceneId);
    const clone={...p.scenes[i],id:makeId(),title:p.scenes[i].title+' (copy)'};
    p.scenes.splice(i+1,0,clone);touch();selectScene(clone.id);status('Scene duplicated.','success');
  });
  $('remove-scene').addEventListener('click',()=>{
    if(recording)return;const p=selectedProject();if(p.scenes.length===1)return status('Keep at least one scene in the video.','error');
    if(!confirm('Remove this scene?'))return;
    const i=p.scenes.findIndex(s=>s.id===sceneId);p.scenes.splice(i,1);touch();selectScene(p.scenes[Math.min(i,p.scenes.length-1)].id);
  });
  $('scene-duration').addEventListener('change',e=>{
    const s=selectedScene();s.duration=Math.min(120,Math.max(3,Math.round(Number(e.target.value)||10)));
    e.target.value=s.duration;touch();renderScenes();
  });
  $('play-preview').addEventListener('click',beginPreview);
  $('stop-preview').addEventListener('click',stopPreview);
  $('speak-scene').addEventListener('click',previewVoice);
  $('render-video').addEventListener('click',exportVideo);
  $('scene-audio').addEventListener('change',async e=>{
    const file=e.target.files?.[0],id=sceneId;
    if(!file)return;
    if(!file.type.startsWith('audio/'))return status('Choose an audio file supported by your browser.','error');
    if(file.size>25*1024*1024)return status('Audio files are limited to 25 MB per scene.','error');
    const key=makeId();
    try{
      await putAudio(key,file);
      const s=selectedProject().scenes.find(s=>s.id===id);
      if(!s)return;
      s.audioAssetId=key;touch();if(sceneId===id)refreshAudioInfo();
      status('Narration saved on this device for '+s.title+'.','success');
    }catch(err){status('Could not save the narration file: '+err.message,'error');}
  });
  $('play-audio').addEventListener('click',async()=>{stopAudio();await playAttached(selectedScene());});
  $('remove-audio').addEventListener('click',()=>{
    const s=selectedScene();s.audioAssetId='';touch();refreshAudioInfo();status('Audio detached from this scene.','success');
  });
  $('save-json').addEventListener('click',()=>{
    const data=JSON.stringify(safeProjectExport(selectedProject()),null,2);
    download(new Blob([data],{type:'application/json'}),safeFilename(selectedProject().name)+'.mayne-video.json');
    status('Project JSON exported. Uploaded audio is device-local and not included.','success');
  });
  $('import-json').addEventListener('click',()=>$('json-file').click());
  $('json-file').addEventListener('change',async e=>{
    const file=e.target.files?.[0];if(!file)return;
    try{
      if(file.size>2*1024*1024)throw Error('Maximum JSON size is 2 MB.');
      if(projects.length>=40)throw Error('Maximum 40 projects.');
      const p=parseProjectImport(JSON.parse(await file.text()));
      projects.push(p);selectProject(p.id);
      status('Project imported. Reattach audio recordings on this device.','success');
    }catch(err){status('Import failed: '+err.message,'error');}
    e.target.value='';
  });
  $('help-button').addEventListener('click',()=>$('help-dialog').showModal());
  $('close-help').addEventListener('click',()=>$('help-dialog').close());
  window.addEventListener('beforeunload',e=>{if(recording){e.preventDefault();e.returnValue='';}});
}
load();wire();refreshAll();
if(!storageOK)status('Storage unavailable; export JSON backups to keep your projects.','error');
