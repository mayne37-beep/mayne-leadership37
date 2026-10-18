import {
 CHARACTER_LIMIT,createCharacter,makeLegacyCharacter,createLibrary,duplicateCharacter,
 updateCharacter,assignCharacter,syncCharacter,setPhoto,hasPhoto
} from './leadership-characters.js';
import {characterStudioHTML} from './leadership-character-view.js';

/* Character Creator is a local, facilitator-owned component; no external
   photos, camera feeds, image generation, or hosted user-image storage. */
export function connectCharacterCreator({state,getProject,persist,render,toast,download}){
 let selection='',expression='neutral';
 const $=q=>document.querySelector(q);
 const selected=()=>state.characters.find(c=>c.id===selection)||
  state.characters.find(c=>c.id===getProject().characterId)||state.characters[0]||null;
 const refresh=()=>{if(!state.characters.some(c=>c.id===selection))selection=getProject().characterId||state.characters[0]?.id||'';
  const el=$('#character-workbench');if(el)el.innerHTML=characterStudioHTML(state.characters,selection,getProject(),expression);
 };
 function transaction(fn){
  const snapshots=JSON.stringify({characters:state.characters,projects:state.projects});
  try{fn();}catch(err){
   const prior=JSON.parse(snapshots);state.characters=prior.characters;state.projects=prior.projects;
   toast(err.message);render();return false;
  }
  if(JSON.stringify({characters:state.characters,projects:state.projects})!==snapshots){
   if(!persist())toast('Export a character backup: browser storage could not save this change.');
  }
  render();return true;
 }
 function editField(path,value){
  const character=selected();if(!character)return;
  transaction(()=>{updateCharacter(character,path,value);syncCharacter(state.projects,character);});
 }
 function addCharacter(copy=false){
  if(state.characters.length>=CHARACTER_LIMIT){toast('The character library is full. Export an unused character before removing it.');return;}
  const current=selected();
  transaction(()=>{
   const next=copy&&current?duplicateCharacter(current):
    makeLegacyCharacter({name:'New employee',role:'Team member',temperament:'Describe how this person communicates and what they care about.'},state.characters.length);
   state.characters.unshift(next);selection=next.id;expression='neutral';
  });
 }
 function eraseCharacter(){
  const c=selected();if(!c)return;
  const used=state.projects.filter(p=>p.characterId===c.id);
  if(used.length){toast('This character is assigned to '+used.length+' scenario(s). Assign a replacement before deleting.');return;}
  if(!confirm('Delete "'+c.name+'" and any locally stored photos for this character?'))return;
  transaction(()=>{state.characters=state.characters.filter(x=>x.id!==c.id);selection=state.characters[0]?.id||'';});
 }
 function useCharacter(id){
  const c=state.characters.find(x=>x.id===id);if(!c)return;
  const okay=transaction(()=>assignCharacter(getProject(),c));
  if(okay)toast(c.name+' is now assigned. The conversation script and branches remain unchanged.');
 }
 const filename=name=>(String(name||'character').toLowerCase().replace(/[^a-z0-9]+/g,'-').slice(0,55)||'character');
 function exportCurrent(){
  const c=selected();if(!c)return;
  download(JSON.stringify({kind:'mayne-leadership-character',version:1,character:c},null,2),filename(c.name)+'.character.json','application/json');
 }
 async function importJson(file){
  if(!file)return;
  if(file.size>3_000_000){toast('Character JSON must be under 3 MB.');return;}
  try{
   const data=JSON.parse(await file.text());
   if(data.kind!=='mayne-leadership-character'||data.version!==1)throw Error('Not a Character Creator export.');
   const p=createCharacter({...data.character,id:''});
   if(state.characters.length>=CHARACTER_LIMIT)throw Error('Character Library is full.');
   if(!confirm('Add "'+p.name+'" to the Character Library?'))return;
   transaction(()=>{state.characters.unshift(p);selection=p.id;expression='neutral';});
   toast('Character imported. Assign them to the desired scenario.');
  }catch(err){toast('Import failed: '+err.message);}
 }
 async function encodeFile(file){
  if(!file||!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('Upload a JPEG, PNG, or WebP image.');
  if(file.size>4_000_000)throw Error('Choose a photo under 4 MB.');
  const original=await new Promise((resolve,reject)=>{
   const reader=new FileReader();reader.onload=()=>resolve(reader.result);
   reader.onerror=()=>reject(new Error('Unable to read this photo.'));
   reader.readAsDataURL(file);
  });
  const picture=await new Promise((resolve,reject)=>{
   const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('Invalid or unsupported image.'));
   img.src=original;
  });
  if(!picture.naturalWidth||!picture.naturalHeight)throw Error('The photo has no readable dimensions.');
  const canvas=document.createElement('canvas');
  const factor=Math.min(1,380/picture.naturalWidth,460/picture.naturalHeight);
  canvas.width=Math.max(1,Math.round(picture.naturalWidth*factor));
  canvas.height=Math.max(1,Math.round(picture.naturalHeight*factor));
  const ctx=canvas.getContext('2d');if(!ctx)throw Error('Image resizing is not supported on this device.');
  ctx.drawImage(picture,0,0,canvas.width,canvas.height);
  for(const q of [.78,.63,.50,.38]){
   const data=canvas.toDataURL('image/webp',q);
   if(data.startsWith('data:image/webp;base64,')&&data.length<205000)return data;
  }
  throw Error('Could not compress photo enough for browser storage. Use a smaller image.');
 }
 async function uploadImage(file,emotion,id){
  if(!file)return;
  try{
   const encoded=await encodeFile(file);
   const result=transaction(()=>{
    const c=state.characters.find(x=>x.id===id);if(!c)throw Error('The character was removed before the upload completed.');
    setPhoto(c,emotion,encoded);syncCharacter(state.projects,c);
   });
   if(result)toast('Saved photo for '+emotion+'. Portraits stay in this browser.');
  }catch(err){toast('Photo upload failed: '+err.message);}
 }
 function click(event){
  const t=event.target;
  const select=t.closest('[data-character-select]');if(select){selection=select.dataset.characterSelect;expression='neutral';refresh();return;}
  if(t.closest('[data-character-create]')){addCharacter();return;}
  if(t.closest('[data-character-duplicate]')){addCharacter(true);return;}
  if(t.closest('[data-character-delete]')){eraseCharacter();return;}
  if(t.closest('[data-character-import]')){$('#character-import-input').click();return;}
  if(t.closest('[data-character-export]')){exportCurrent();return;}
  const style=t.closest('[data-character-style]');if(style){editField('style.style',style.dataset.characterStyle);return;}
  const swatch=t.closest('[data-character-swatch]');if(swatch){editField(swatch.dataset.characterSwatch,swatch.dataset.swatchColor);return;}
  const emotionButton=t.closest('[data-character-emotion]');if(emotionButton){expression=emotionButton.dataset.characterEmotion;refresh();return;}
  const use=t.closest('[data-character-assign]');if(use){useCharacter(use.dataset.characterAssign);return;}
  const upload=t.closest('[data-photo-upload]');if(upload){
   const el=$('#character-photo-input');el.dataset.characterId=selected()?.id||'';
   el.dataset.emotion=upload.dataset.photoUpload;el.click();return;
  }
  const remove=t.closest('[data-photo-remove]');if(remove){
   const c=selected();if(c)transaction(()=>{setPhoto(c,remove.dataset.photoRemove,'');syncCharacter(state.projects,c);});
  }
 }
 function change(event){
  const t=event.target;
  if(t.dataset.characterField){editField(t.dataset.characterField,t.value);return;}
  if(t.id==='character-import-input'){importJson(t.files?.[0]);t.value='';return;}
  if(t.id==='character-photo-input'){
   uploadImage(t.files?.[0],t.dataset.emotion,t.dataset.characterId);t.value='';return;
  }
 }
 function input(event){
  const el=event.target;
  if(el.dataset.characterField&&el.type==='range'){
   const output=el.nextElementSibling;if(output?.tagName==='OUTPUT')output.textContent=el.value+' / 5';
  }
 }
 return {
  render:refresh,
  bind(){document.addEventListener('click',click);document.addEventListener('change',change);document.addEventListener('input',input);}
 };
}
