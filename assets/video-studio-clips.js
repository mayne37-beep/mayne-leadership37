// Phase 3: user-supplied local MP4/WebM talking-presenter clips.
// Object URLs and decoded frames stay on the author's device, not a remote server.
export const CLIP_DB='mayne-video-studio-clips-v1';
export const CLIP_MAX_BYTES=120*1024*1024;
export const CLIP_FORMATS=['video/mp4','video/webm'];
const handles=new Map();
function database(){
  return new Promise((resolve,reject)=>{
    if(!globalThis.indexedDB)return reject(Error('IndexedDB is unavailable.'));
    const q=indexedDB.open(CLIP_DB,1);
    q.onupgradeneeded=()=>q.result.createObjectStore('clips');
    q.onsuccess=()=>resolve(q.result);
    q.onerror=()=>reject(q.error||Error('Cannot open video storage.'));
  });
}
function transaction(kind,key,value){
  return database().then(db=>new Promise((resolve,reject)=>{
    const tx=db.transaction('clips',kind==='read'?'readonly':'readwrite');
    const q=kind==='read'?tx.objectStore('clips').get(key):tx.objectStore('clips').put(value,key);
    q.onsuccess=()=>{if(kind==='read')resolve(q.result||null);};
    tx.oncomplete=()=>{db.close();if(kind!=='read')resolve();};
    tx.onerror=()=>{db.close();reject(tx.error||Error('Video storage error.'));};
    tx.onabort=()=>{db.close();reject(tx.error||Error('Video storage was interrupted.'));};
  }));
}
export function validateClip(file){
  if(!file||!CLIP_FORMATS.includes(file.type))throw Error('Use a compatible MP4 or WebM clip.');
  if(!file.size||file.size>CLIP_MAX_BYTES)throw Error('Clip must be between 1 byte and 120 MB.');
  return file;
}
export async function saveClip(key,file,info){
  validateClip(file);
  if(!key||typeof key!=='string')throw Error('Video clip ID is required.');
  await transaction('write',key,{blob:file,name:String(file.name||'video').slice(0,130),
    type:file.type,duration:Number(info?.duration)||0,width:Number(info?.width)||0,height:Number(info?.height)||0});
}
export function readClip(key){return key?transaction('read',key):Promise.resolve(null);}
export function inspectVideoFile(blob){
  return new Promise((resolve,reject)=>{
    const url=URL.createObjectURL(blob),video=document.createElement('video');
    video.preload='metadata';video.playsInline=true;video.muted=true;
    const timer=setTimeout(()=>finish(Error('Video decoding timed out. Try another MP4 or WebM.')),12000);
    function finish(err){
      clearTimeout(timer);video.removeAttribute('src');video.load();URL.revokeObjectURL(url);
      if(err)reject(err);else resolve({duration:Math.round(video.duration*100)/100,
        width:video.videoWidth,height:video.videoHeight});
    }
    video.addEventListener('loadedmetadata',()=>{
      if(!Number.isFinite(video.duration)||video.duration<=0||!video.videoWidth)return finish(Error('Could not read video duration or dimensions.'));
      const duration=video.duration,width=video.videoWidth,height=video.videoHeight;
      clearTimeout(timer);video.removeAttribute('src');video.load();URL.revokeObjectURL(url);
      resolve({duration,width,height});
    },{once:true});
    video.addEventListener('error',()=>finish(Error('This browser cannot decode the selected video clip.')),{once:true});
    video.src=url;
  });
}
export async function ensureClip(key){
  if(!key)return null;
  if(handles.has(key))return handles.get(key);
  const record=await readClip(key);
  if(!record)return null;
  const url=URL.createObjectURL(record.blob),video=document.createElement('video');
  video.src=url;video.preload='auto';video.playsInline=true;video.crossOrigin='anonymous';
  video.disablePictureInPicture=true;video.controls=false;
  const result={video,url,record};
  handles.set(key,result);
  try{
    await new Promise((resolve,reject)=>{
      if(video.readyState>=1)return resolve();
      const timeout=setTimeout(()=>{cleanup();reject(Error('Video preview timed out.'));},12000);
      const done=()=>{cleanup();resolve();},fail=()=>{cleanup();reject(Error('Video could not load.'));};
      function cleanup(){clearTimeout(timeout);video.removeEventListener('loadedmetadata',done);video.removeEventListener('error',fail);}
      video.addEventListener('loadedmetadata',done);video.addEventListener('error',fail);
    });
  }catch(e){handles.delete(key);video.removeAttribute('src');video.load();URL.revokeObjectURL(url);throw e;}
  return result;
}
export function currentClip(key){return handles.get(key)||null;}
export function stopClips(){
  for(const item of handles.values()){item.video.pause();item.video.muted=true;}
}
export function setClipPosition(key,seconds){
  const item=currentClip(key);if(!item)return;
  const video=item.video;
  if(!Number.isFinite(video.duration)||video.duration<=0)return;
  const next=Math.max(0,Math.min(video.duration-.05,seconds));
  if(Math.abs(video.currentTime-next)>.15){try{video.currentTime=next;}catch{}}
}
export function drawVideo(ctx,video,x,y,w,h,fit='cover'){
  if(!video||video.readyState<2||!video.videoWidth||!video.videoHeight)return false;
  ctx.save();ctx.beginPath();ctx.rect(x,y,w,h);ctx.clip();
  ctx.fillStyle='#101826';ctx.fillRect(x,y,w,h);
  let rw,rh;
  const scale=fit==='contain'?Math.min(w/video.videoWidth,h/video.videoHeight):Math.max(w/video.videoWidth,h/video.videoHeight);
  rw=video.videoWidth*scale;rh=video.videoHeight*scale;
  try{ctx.drawImage(video,x+(w-rw)/2,y+(h-rh)/2,rw,rh);}
  catch{ctx.restore();return false;}
  ctx.restore();return true;
}
export function releaseClips(){
  for(const entry of handles.values()){entry.video.pause();entry.video.removeAttribute('src');entry.video.load();URL.revokeObjectURL(entry.url);}
  handles.clear();
}
