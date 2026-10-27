import JSZip from 'jszip';
import {CHARACTER_LOOKS} from '../assets/video-studio-library-core.js';

// Untrusted local ZIP: bounded file count, paths, size and image signatures.
// Pack v1 remains supported; pack v2 adds categorized expressions and poses.
const BASE=/^characters\/[a-z0-9_-]+-(professional|casual)\.(png|jpe?g|webp)$/i;
const VARIANT=/^variations\/([a-z0-9_-]+)\/(professional|casual)\/([a-z0-9_-]+)\.(png|jpe?g|webp)$/i;
const LOOKS=new Set(CHARACTER_LOOKS.map(v=>v.id));
const MAX_ZIP=35*1024*1024,MAX_IMAGE=8*1024*1024,MAX_TOTAL=125*1024*1024;
async function loadImage(zip,path,images,meta,total){
 const entry=zip.file(path);
 if(!entry||entry.dir)throw Error('Missing image '+path);
 if((entry._data?.uncompressedSize||0)>MAX_IMAGE)throw Error('An image exceeds 8 MB.');
 const bytes=await entry.async('uint8array');
 total.value+=bytes.byteLength;
 if(!bytes.byteLength||bytes.byteLength>MAX_IMAGE||total.value>MAX_TOTAL)
   throw Error('Character pack is too large.');
 const mime=/\.png$/i.test(path)?'image/png':/\.webp$/i.test(path)?'image/webp':'image/jpeg';
 const signature=(mime==='image/png'&&bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71)||
 (mime==='image/jpeg'&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255)||
 (mime==='image/webp'&&String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP');
 if(!signature)throw Error('An image does not match its file type: '+path);
 images.push({...meta,file:new File([bytes],path.split('/').pop(),{type:mime})});
}
export async function readPresenterPack(file){
 if(!file||file.size<=0||file.size>MAX_ZIP)throw Error('Choose a character ZIP under 35 MB.');
 const zip=await JSZip.loadAsync(file,{checkCRC32:true});
 const entries=Object.values(zip.files);
 if(entries.length>150)throw Error('Too many files in character pack.');
 const item=zip.file('manifest.json');if(!item)throw Error('Character pack has no manifest.json.');
 const manifest=JSON.parse(await item.async('string'));
 if(manifest?.format!=='mayne-video-character-pack'||![1,2].includes(manifest.version)||!Array.isArray(manifest.characters))
   throw Error('This is not a supported Mayne character library pack.');
 if(manifest.characters.length<1||manifest.characters.length>20)
   throw Error('Character pack must include 1–20 identities.');
 const images=[],characters=[],total={value:0},seen=new Set();
 for(const row of manifest.characters){
   const id=String(row?.id||'');
   if(!/^[a-z0-9_-]{2,70}$/i.test(id)||seen.has(id))throw Error('Invalid or duplicate character ID.');
   seen.add(id);
   const variants={},looks={};
   for(const style of ['professional','casual']){
     const base=row.outfits?.[style];
     if(base){
       if(!BASE.test(base)||!base.startsWith('characters/'+id+'-'))throw Error('Unexpected base image name.');
       await loadImage(zip,base,images,{characterId:id,style,look:'base',quality:'standard'},total);
       variants[style]=true;
     }
     if(manifest.version>=2){
       const candidate=row.looks?.[style]||{},accepted={};
       for(const [lookId,record] of Object.entries(candidate)){
         if(!LOOKS.has(lookId))throw Error('Unknown expression or pose: '+lookId);
         const path=typeof record==='string'?record:record?.path;
         const match=typeof path==='string'?path.match(VARIANT):null;
         if(!match||match[1]!==id||match[2]!==style||match[3]!==lookId)
           throw Error('Invalid variant image path.');
         const quality=record?.quality==='concept'?'concept':'standard';
         await loadImage(zip,path,images,{characterId:id,style,look:lookId,quality},total);
         accepted[lookId]={quality};
       }
       if(Object.keys(accepted).length)looks[style]=accepted;
     }
   }
   if(!Object.keys(variants).length&&!Object.keys(looks).length)
     throw Error('Character '+id+' has no images.');
   characters.push({id,name:String(row.name||id).slice(0,60),
     description:String(row.description||'').slice(0,90),variants,looks});
 }
 return {characters,images,version:manifest.version};
}
