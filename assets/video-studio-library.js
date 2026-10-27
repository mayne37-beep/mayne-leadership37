import {CHARACTER_CATALOG_KEY,builtinPhoto,characterLibrary,LEADERSHIP_BACKGROUNDS,validatedBackground,normalizeCharacters,mergeCharacters,CHARACTER_LOOKS} from './video-studio-library-core.js';

const cachedBackgrounds=new Map(),backgroundLoads=new Map();
export async function preloadBackground(scene){
 const url=validatedBackground(scene?.backgroundImage);
 if(!url)return;
 if(cachedBackgrounds.has(url))return cachedBackgrounds.get(url);
 if(backgroundLoads.has(url))return backgroundLoads.get(url);
 const task=new Promise((resolve,reject)=>{
  const img=new Image();
  img.onload=()=>{cachedBackgrounds.set(url,img);resolve(img);};
  img.onerror=()=>reject(Error('Leadership 101 artwork is unavailable.'));
  img.src=url;
 });
 backgroundLoads.set(url,task);
 try{return await task;}finally{backgroundLoads.delete(url);}
}
export function drawBackground(ctx,scene){
 const image=cachedBackgrounds.get(scene?.backgroundImage);
 if(!image?.naturalWidth)return false;
 const scale=Math.max(1280/image.naturalWidth,720/image.naturalHeight);
 const w=image.naturalWidth*scale,h=image.naturalHeight*scale;
 ctx.drawImage(image,(1280-w)/2,(720-h)/2,w,h);
 ctx.fillStyle='#07172eb7';ctx.fillRect(0,0,1280,720);
 return true;
}
export function hasBackgroundLoaded(scene){
 return !!cachedBackgrounds.get(scene?.backgroundImage);
}
export function initAssetLibrary(config){
 const $=id=>document.getElementById(id);
 let tab='characters',characters=[];
 try{characters=normalizeCharacters(JSON.parse(localStorage.getItem(CHARACTER_CATALOG_KEY)||'[]'));}catch{}
 let galleryUrls=[];
 function persist(){
  try{localStorage.setItem(CHARACTER_CATALOG_KEY,JSON.stringify(characters));}
  catch{config.message('Browser storage is full; could not save character catalog.','error');}
 }
 function clearThumbs(){galleryUrls.forEach(url=>URL.revokeObjectURL(url));galleryUrls=[];}
 function card({title,detail,url,assetId,active,isBackground,quality},action){
  const btn=document.createElement('button');btn.type='button';
  btn.className='asset-card'+(active?' active':'')+(isBackground?' background-card':'');
  btn.setAttribute('aria-label','Use '+title+' '+detail);
  const figure=document.createElement('span');figure.className='asset-thumb';
  const img=document.createElement('img');img.alt='';img.loading='lazy';
  if(url)img.src=url;
  if(assetId&&!url){
   void config.readPhoto(assetId).then(photo=>{
    if(!photo?.blob||!figure.isConnected)return;
    const objectUrl=URL.createObjectURL(photo.blob);
    galleryUrls.push(objectUrl);img.src=objectUrl;
   }).catch(()=>{});
  }
  figure.append(img);
  const name=document.createElement('strong');name.textContent=title;
  const hint=document.createElement('small');hint.textContent=detail+(quality==='concept'?' · Concept preview':'');
  if(quality==='concept')btn.classList.add('concept-asset');
  btn.append(figure,name,hint);btn.addEventListener('click',action);return btn;
 }
 function render(){
  const out=$('asset-gallery');if(!out)return;
  clearThumbs();out.replaceChildren();
  const term=($('asset-search').value||'').toLowerCase().trim();
  const isPeople=tab==='characters',scene=config.getScene();
  $('asset-tab-characters').className=isPeople?'small-primary':'ghost';
  $('asset-tab-backgrounds').className=isPeople?'ghost':'small-primary';
  $('asset-tab-characters').setAttribute('aria-pressed',String(isPeople));
  $('asset-tab-backgrounds').setAttribute('aria-pressed',String(!isPeople));
  $('asset-import-actions').hidden=!isPeople;
  $('asset-backdrop-actions').hidden=isPeople;
  $('asset-selection-note').textContent=isPeople
   ?'Choose an original full-resolution cutout or an imported expression/pose. Concept previews are low resolution; keep originals for finished full-screen videos.'
   :'Reused from existing Leadership 101 course artwork. Pick a background to apply it to the active scene.';
  let count=0;
  if(isPeople){
   const people=characterLibrary(characters);
   const personFilter=$('asset-character-filter').value,
     outfitFilter=$('asset-outfit-filter').value,
     lookFilter=$('asset-variant-filter').value;
   for(const person of people){
    if(personFilter!=='all'&&person.id!==personFilter)continue;
    for(const style of ['professional','casual']){
     if(outfitFilter!=='all'&&style!==outfitFilter)continue;
     const variant=person.variants?.[style];
     if(variant&&(lookFilter==='all'||lookFilter==='base')&&
        (!term||(person.name+' '+person.description+' '+style+' original full-body').toLowerCase().includes(term))){
       count++;
       out.append(card({title:person.name,detail:style==='professional'?'Professional · Original':'Casual · Original',
        assetId:variant.assetId,url:builtinPhoto(variant.assetId)?.url,
        active:scene?.photoAssetId===variant.assetId},()=>{
         if(!config.editable()||!config.getScene())return;
         config.getScene().photoAssetId=variant.assetId;
         config.commit();config.photoChanged();config.redraw();render();
         config.message(person.name+' ('+style+') original selected.','success');
       }));
     }
     for(const look of CHARACTER_LOOKS){
      if(lookFilter!=='all'&&look.id!==lookFilter)continue;
      const v=person.looks?.[style]?.[look.id];if(!v)continue;
      if(term&&!(person.name+' '+person.description+' '+style+' '+look.label).toLowerCase().includes(term))continue;
      count++;
      out.append(card({title:person.name,detail:(style==='professional'?'Professional':'Casual')+' · '+look.label,
        assetId:v.assetId,active:scene?.photoAssetId===v.assetId,quality:v.quality},()=>{
         if(!config.editable()||!config.getScene())return;
         config.getScene().photoAssetId=v.assetId;
         config.commit();config.photoChanged();config.redraw();render();
         config.message(person.name+' · '+style+' · '+look.label+
           (v.quality==='concept'?' (low-resolution preview)':''),'success');
      }));
     }
    }
   }
   $('asset-count').textContent=count+' looks shown · '+people.length+' characters available'+
     (people.some(p=>p.looks&&Object.keys(p.looks).length)?' · Expanded variation pack installed':'');
  }else{
   for(const bg of LEADERSHIP_BACKGROUNDS){
    if(term&&!bg.name.toLowerCase().includes(term))continue;
    count++;
    out.append(card({title:bg.name,detail:'Leadership 101 · Background',
      url:bg.url,isBackground:true,active:scene?.backgroundImage===bg.url},()=>{
      if(!config.editable()||!config.getScene())return;
      config.getScene().backgroundImage=bg.url;
      config.commit();config.redraw();render();
      config.message(bg.name+' background applied to this scene.','success');
     }));
   }
   $('asset-count').textContent=count+' reusable Leadership 101 backgrounds';
  }
  if(count===0){
   const note=document.createElement('p');note.className='asset-library-empty';
   note.textContent='No assets match that search.';
   out.append(note);
  }
 }
 $('asset-tab-characters').addEventListener('click',()=>{tab='characters';render();});
 $('asset-tab-backgrounds').addEventListener('click',()=>{tab='backgrounds';render();});
 $('asset-search').addEventListener('input',render);
 for(const id of ['asset-character-filter','asset-outfit-filter','asset-variant-filter'])
   $(id).addEventListener('change',render);
 $('asset-remove-background').addEventListener('click',()=>{
  if(!config.editable()||!config.getScene())return;
  config.getScene().backgroundImage='';
  config.commit();config.redraw();render();config.message('Scene background removed.','success');
 });
 $('asset-import-button').addEventListener('click',()=>$('asset-pack-file').click());
 $('asset-pack-file').addEventListener('change',async event=>{
  const file=event.target.files?.[0];event.target.value='';if(!file)return;
  if(!config.editable())return config.message('Finish editing or exporting before importing characters.','error');
  const button=$('asset-import-button');button.disabled=true;
  try{
   config.message('Validating and importing character ZIP…');
   const {readPresenterPack}=await import('/assets/video-studio-character-import.js');
   const pack=await readPresenterPack(file);
   const additions=pack.characters.map(c=>({id:c.id,name:c.name,description:c.description,variants:{},looks:{}}));
   for(const img of pack.images){
    const key=config.makeId();
    await config.savePhoto(key,img.file);
    const character=additions.find(c=>c.id===img.characterId);
    if(character){
     if(img.look==='base')character.variants[img.style]={assetId:key,name:img.file.name};
     else{
      if(!character.looks[img.style])character.looks[img.style]={};
      character.looks[img.style][img.look]={assetId:key,name:img.file.name,quality:img.quality};
     }
    }
   }
   characters=mergeCharacters(characters,additions);
   persist();tab='characters';render();
   config.message('Character pack imported: '+pack.characters.length+' characters, '+pack.images.length+' images (including expression/pose variants).','success');
  }catch(error){config.message('Could not import character pack: '+error.message,'error');}
  finally{button.disabled=false;}
 });
 render();
 return {refresh:render};
}
