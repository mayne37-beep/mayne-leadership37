const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {webcrypto}=require('node:crypto');
const {JSDOM,VirtualConsole}=require('jsdom');
const root=path.resolve(__dirname,'../..');
const template=JSON.parse(fs.readFileSync(path.join(root,'assets/escape-room/example.project.json'),'utf8'));
const records=new Map([[template.id,{data:template,version:1,published:structuredClone(template),token:'d'.repeat(48),publishedVersion:1}]]),assets=new Map(),reports=[];
const pixel='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/Zi0AAAAASUVORK5CYII=';
const errors=[],downloads=[],blobs=[];const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function wait(condition){for(let i=0;i<150;i++){if(condition())return;await sleep(20);}throw new Error('UI condition was not reached.');}
async function setup(player=false){
 const vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
 const dom=new JSDOM(fs.readFileSync(path.join(root,player?'escape-room-play.html':'escape-room-studio.html'),'utf8'),{url:'https://www.mayneleadership.com/'+(player?'escape-room-play.html?room='+'d'.repeat(48):'escape-room-studio.html'),runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc});
 const w=dom.window,d=w.document;w.TextEncoder=TextEncoder;Object.defineProperty(w,'crypto',{value:webcrypto});
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
 w.URL.createObjectURL=blob=>{blobs.push(blob);return 'blob:qa-'+blobs.length;};w.URL.revokeObjectURL=()=>{};w.HTMLAnchorElement.prototype.click=function(){downloads.push(this.download);};
 w.HTMLElement.prototype.getBoundingClientRect=function(){return {left:0,top:0,width:800,height:500,right:800,bottom:500};};d.elementFromPoint=()=>d.querySelector('[data-object="containment-unit"]');
 w.fetch=async(url,options={})=>{
  const parsed=new URL(url,w.location.origin);if(parsed.pathname==='/api/escape-studio'){
   let action,payload;if(options.method==='POST')({action,payload}=JSON.parse(options.body));else {action=parsed.searchParams.get('action');payload=Object.fromEntries(parsed.searchParams);}
   let value;const room=records.get(payload.id);
   if(action==='list')value=[...records.values()].map(r=>({id:r.data.id,title:r.data.title,scenes:r.data.scenes.length,version:r.version,published:!!r.published,updated_at:new Date().toISOString()}));
   if(action==='get')value={...room,data:structuredClone(room.data)};
   if(action==='save'){if((room?.version||0)!==payload.version)return {ok:false,status:409,json:async()=>({error:'Version conflict'})};const item={...(room||{}),data:structuredClone(payload.data),version:(room?.version||0)+1};records.set(payload.id,item);value={id:payload.id,version:item.version,published:!!item.published,token:item.token,publishedVersion:item.publishedVersion};}
   if(action==='publish'){room.published=structuredClone(room.data);room.token=room.token||'d'.repeat(48);room.publishedVersion=room.version;value={id:payload.id,version:room.version,published:true,token:room.token,publishedVersion:room.publishedVersion};}
   if(action==='asset-init'){const old=assets.get(payload.id);if(!old)assets.set(payload.id,{mime:payload.mime,parts:payload.parts,data:[]});value={id:payload.id,ready:old?.ready||false};}
   if(action==='asset-part'){const item=assets.get(payload.id);item.data[payload.part]=payload.data;item.ready=item.data.filter(Boolean).length===item.parts;value={ok:true,ready:item.ready};}
   if(action==='asset'){const item=assets.get(payload.id);return {ok:true,blob:async()=>new w.Blob([Buffer.from(item.data.join(''),'base64')],{type:item.mime})};}
   if(action==='start')value={session:'test-session',proof:'e'.repeat(48)};
   if(action==='progress'){reports.push(structuredClone(payload.progress));value={ok:true};}
   if(action==='reports')value=reports.slice(-1).map(r=>({...r,publication_version:room.publishedVersion,started_at:new Date().toISOString(),completed_at:new Date().toISOString()}));
   return {ok:true,json:async()=>value};
  }
  const file=path.join(root,parsed.pathname);return {ok:true,text:async()=>fs.readFileSync(file,'utf8'),blob:async()=>new w.Blob([fs.readFileSync(file)],{type:'image/svg+xml'})};
 };
 w.ESCAPE_ASSET_BASE='/assets/escape-room/';if(!player)w.ESCAPE_HOSTED=true;
 for(const file of ['engine.js','panorama.js','template.js','cloud.js'])w.eval(fs.readFileSync(path.join(root,'assets/escape-room',file),'utf8'));
 if(player){const {learnerProject}=await import('../../src/escape/model.js');const r=records.get(template.id);w.ESCAPE_PACKAGE=learnerProject(r.published,r.token,r.publishedVersion);w.ESCAPE_REMOTE_ROOM=r.token;}
 w.eval(fs.readFileSync(path.join(root,'assets/escape-room/app.js'),'utf8'));
 if(!player)await wait(()=>d.querySelector('[data-action="library"]'));
 else await wait(()=>d.querySelector('[data-action="begin"]'));
 return {dom,w,d};
}
(async()=>{
 const teacher=await setup();let {w,d}=teacher;
 const q=selector=>{const el=d.querySelector(selector);assert.ok(el,'Missing '+selector);return el;};const click=selector=>q(selector).click();
 const input=(selector,value)=>{const el=q(selector);el.dispatchEvent(new w.FocusEvent('focusin',{bubbles:true}));el.value=value;el.dispatchEvent(new w.Event('input',{bubbles:true}));el.dispatchEvent(new w.Event('change',{bubbles:true}));el.dispatchEvent(new w.FocusEvent('focusout',{bubbles:true}));};
 assert.equal(d.querySelectorAll('.scene-card').length,1);assert.equal(d.querySelectorAll('[data-object]').length,0);
 assert.equal(records.size,1,'opening a blank project must not save an unused empty room');
 click('[data-action="library"]');await wait(()=>d.querySelector('[data-open-project="'+template.id+'"]'));
 click('[data-open-project="'+template.id+'"]');await wait(()=>d.querySelectorAll('.scene-card').length===3);
 assert.ok(q('.header .brand').href.endsWith('/facilitation.html'));
 click('[data-object="evidence-note"]');input('[data-field="object.name"]','Cloud-saved evidence summary');
 await wait(()=>records.get(template.id).data.scenes[0].objects[0].name==='Cloud-saved evidence summary');
 assert.equal(records.get(template.id).published.scenes[0].objects[0].name,'Evidence summary','draft edits must not mutate a published room');
 // Upload and externalize an inline image, then restore an independent backup.
 const imageProject=structuredClone(records.get(template.id).data);imageProject._cloud={version:records.get(template.id).version};imageProject.scenes[0].objects[0].clueImage='data:image/png;base64,'+pixel;
 const info=await w.EscapeCloud.save(imageProject);const source=records.get(template.id).data.scenes[0].objects[0].clueImage;assert.match(source,/^\/api\/escape-studio\?action=asset/);assert.equal(info.version,records.get(template.id).version);
 // Exercise the actual image upload control and its automatic website save.
 w.Image=class{constructor(){this.width=1;this.height=1;}set src(value){queueMicrotask(()=>this.onload());}};
 click('[data-action="clue-upload"]');const fileInput=q('#fileInput');
 Object.defineProperty(fileInput,'files',{configurable:true,value:[new w.File([Buffer.from(pixel,'base64')],'clue.png',{type:'image/png'})]});
 await fileInput.onchange();await wait(()=>records.get(template.id).data.scenes[0].objects[0].clueImage&&q('.save-indicator').textContent==='Saved on your website');
 const reopened=await w.EscapeCloud.get(template.id),backup=await w.EscapeCloud.embed(reopened);assert.match(backup.scenes[0].objects[0].clueImage,/^data:image\/png;base64,/);assert.equal(backup._cloud,undefined);
 click('[data-action="publish-room"]');await wait(()=>d.querySelector('#roomShareLink'));
 assert.match(q('#roomShareLink').value,/escape-room-play\.html\?room=[a-f0-9]{48}$/);assert.equal(records.get(template.id).published.scenes[0].objects[0].name,'Cloud-saved evidence summary');
 click('[data-action="close-modal"]');click('[data-action="export"]');click('[data-action="export-player"]');await wait(()=>downloads.some(x=>x.endsWith('-play.html')));
 const exported=await new Promise(resolve=>{const reader=new w.FileReader();reader.onload=()=>resolve(reader.result);reader.readAsText(blobs.at(-1));});assert.ok(exported.includes('data:image/svg+xml;base64,'));assert.ok(!exported.includes('<script src='));
 const pupil=await setup(true);({w,d}=pupil);click('[data-action="begin"]');
 const answer=(id,value)=>{click('[data-object="'+id+'"]');q('#puzzleAnswer').value=value;q('#answerForm').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));};
 answer('evidence-case','431');click('[data-object="verification-key"]');click('[data-collect="verification-key"]');click('[data-item="verification-key"]');click('[data-object="lab-door"]');
 assert.equal(q('.player-heading h1').textContent,'The evidence lab');
 const item=q('[data-object="container-lid"]');item.dispatchEvent(new w.MouseEvent('pointerdown',{bubbles:true,button:0,clientX:100,clientY:100}));w.dispatchEvent(new w.MouseEvent('pointermove',{clientX:500,clientY:300}));w.dispatchEvent(new w.MouseEvent('pointerup',{clientX:500,clientY:300}));assert.ok(q('[data-object="containment-unit"] .attached'));await sleep(360);
 answer('review-panel','EVALUATE');click('[data-object="command-door"]');answer('release-panel','VERIFY');assert.equal(q('#modalTitle').textContent,'Mission accomplished');await w.EscapeCloud.flush();assert.ok(reports.at(-1).finished,'completion stored through the cloud adapter');
 ({w,d}=teacher);click('[data-action="export"]');click('[data-action="cloud-reports"]');await wait(()=>d.querySelector('[data-action="cloud-reports-csv"]'));click('[data-action="cloud-reports-csv"]');
 const csv=await new Promise(resolve=>{const reader=new w.FileReader();reader.onload=()=>resolve(reader.result);reader.readAsText(blobs.at(-1));});assert.ok(csv.includes('\r\n'));assert.ok(csv.includes('Complete'));
 teacher.dom.window.close();pupil.dom.window.close();assert.deepEqual(errors,[]);
 console.log('PASS: website draft saving, immutable publication, chunked clue image, portable backup, learner link, standalone export, independent player flow, direct item drop, and saved completion.');
})().catch(error=>{console.error(error);process.exit(1);});
