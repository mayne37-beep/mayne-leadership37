(function(root){
'use strict';
const endpoint='/api/escape-studio';
const metadata=new Map(),uploaded=new Map();let queue=Promise.resolve(),progressTimer,session=null,startPromise=null,lastProgress=null,lastRunStart=null;
async function request(action,payload={},method='POST'){
 const url=method==='GET'?endpoint+'?'+new URLSearchParams({action,...payload}):endpoint;
 const response=await fetch(url,method==='GET'?{credentials:'same-origin',cache:'no-store'}:{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,payload})});
 let data;try{data=await response.json();}catch{throw new Error('Website saving is unavailable. Your device draft is kept.');}
 if(!response.ok){const e=new Error(data.error||'Website request failed.');e.status=response.status;throw e;}return data;
}
const asData=blob=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(reader.error);reader.readAsDataURL(blob);});
async function smallImage(source){
 if(source.length<=3800000)return source;
 const img=await new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error('The image could not be opened.'));image.src=source;});
 const canvas=document.createElement('canvas');let scale=Math.min(1,4096/img.width,4096/img.height),result;
 for(let i=0;i<8;i++){canvas.width=Math.max(1,Math.round(img.width*scale));canvas.height=Math.max(1,Math.round(img.height*scale));canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);result=canvas.toDataURL('image/webp',Math.max(.55,.9-i*.05));if(result.length<=3800000)return result;scale*=.82;}
 throw new Error('This image is too large. Use a smaller JPG or WebP photo.');
}
async function upload(source){
 if(!source)return '';
 if(/^\/api\/escape-studio\?action=asset&id=asset-[a-f0-9]{64}$/.test(source))return source;
 if(uploaded.has(source))return uploaded.get(source);
 const compact=await smallImage(source),match=compact.match(/^data:(image\/(?:png|jpeg|webp|gif));base64,([\s\S]+)$/);
 if(!match)throw new Error('Choose a PNG, JPG, WebP, or GIF image.');
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(compact));const id='asset-'+Array.from(new Uint8Array(digest)).map(v=>v.toString(16).padStart(2,'0')).join('');
 const data=match[2],size=524288,parts=Math.ceil(data.length/size),info=await request('asset-init',{id,mime:match[1],parts});
 if(!info.ready)for(let part=0;part<parts;part++)await request('asset-part',{id,part,data:data.slice(part*size,(part+1)*size)});
 const value=endpoint+'?action=asset&id='+id;uploaded.set(source,value);return value;
}
async function cloudCopy(original){const copy=JSON.parse(JSON.stringify(original));delete copy._cloud;for(const s of copy.scenes){if(s.background.data)s.background.data=await upload(s.background.data);for(const o of s.objects)for(const key of ['image','clueImage'])if(o[key])o[key]=await upload(o[key]);}for(const a of copy.assetLibrary||[])if(a.image)a.image=await upload(a.image);return copy;}
function save(snapshot){const task=queue.catch(()=>{}).then(async()=>{let meta=metadata.get(snapshot.id)||snapshot._cloud||{version:0};const data=await cloudCopy(snapshot);const result=await request('save',{id:data.id,version:meta.version||0,data});meta={...result,unsynced:false};metadata.set(data.id,meta);return meta;});queue=task;return task;}
async function list(){const rows=await request('list',{},'GET');for(const row of rows)if(!metadata.has(row.id))metadata.set(row.id,row);return rows;}
async function get(id){const result=await request('get',{id},'GET');metadata.set(id,result);const p=result.data;p._cloud={version:result.version,published:result.published,token:result.token,publishedVersion:result.publishedVersion,unsynced:false};return p;}
async function publish(p){const meta=metadata.get(p.id)||p._cloud;const result=await request('publish',{id:p.id,version:meta.version});metadata.set(p.id,result);return result;}
async function unpublish(p){const meta=metadata.get(p.id)||p._cloud;const result=await request('unpublish',{id:p.id,version:meta.version});metadata.set(p.id,result);return result;}
async function embed(p){const copy=JSON.parse(JSON.stringify(p));delete copy._cloud;const holders=[];for(const scene of copy.scenes){holders.push([scene.background,'data']);for(const object of scene.objects)for(const key of ['image','clueImage'])holders.push([object,key]);}for(const a of copy.assetLibrary||[])holders.push([a,'image']);const sources=[...new Set(holders.map(([o,k])=>o[k]).filter(s=>s&&!s.startsWith('data:')))],embedded=new Map();let next=0;await Promise.all(Array.from({length:Math.min(6,sources.length)},async()=>{while(next<sources.length){const source=sources[next++],response=await fetch(source,{credentials:'same-origin'});if(!response.ok)throw new Error('A project image could not be read.');embedded.set(source,await asData(await response.blob()));}}));for(const [object,key] of holders)if(embedded.has(object[key]))object[key]=embedded.get(object[key]);return copy;}

function progress(run,learner,notes){if(!root.ESCAPE_REMOTE_ROOM)return;const room=root.ESCAPE_REMOTE_ROOM;const elapsed=Math.max(0,Math.round(((run.ended||Date.now())-run.started-run.pausedMs)/1000));lastProgress={solved:run.solved,log:run.log.slice(-2000),attempts:run.attempts,hints:Object.values(run.hints).reduce((a,b)=>a+b,0),elapsed,finished:run.finished,learner:String(learner||'').slice(0,100),notes:String(notes||'').slice(0,12000)};
 if(lastRunStart!==run.started){session=null;startPromise=null;lastRunStart=run.started;try{const stored=JSON.parse(sessionStorage.getItem('escape-cloud:'+room)||'null');if(stored?.started===run.started)session=stored;}catch{}}
 clearTimeout(progressTimer);progressTimer=setTimeout(()=>flush().catch(()=>{}),run.finished?0:1200);
}
async function flush(){if(!lastProgress||!root.ESCAPE_REMOTE_ROOM)return;const room=root.ESCAPE_REMOTE_ROOM,started=lastRunStart;
 if(!session){if(!startPromise)startPromise=request('start',{room,learner:lastProgress.learner}).then(info=>{if(started!==lastRunStart)return;session={...info,started};sessionStorage.setItem('escape-cloud:'+room,JSON.stringify(session));});await startPromise;if(!session)return;}
 return request('progress',{room,session:session.session,proof:session.proof,progress:lastProgress});
}
function beacon(){if(session&&lastProgress&&navigator.sendBeacon)navigator.sendBeacon(endpoint,new Blob([JSON.stringify({action:'progress',payload:{room:root.ESCAPE_REMOTE_ROOM,session:session.session,proof:session.proof,progress:lastProgress}})],{type:'application/json'}));}
root.EscapeCloud={request,save,list,get,publish,unpublish,embed,progress,flush,beacon,reports:id=>request('reports',{id},'GET'),published:room=>request('published',{room},'GET')};
})(window);
