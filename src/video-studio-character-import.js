import JSZip from 'jszip';
// Imported ZIP content is untrusted: bound compressed/uncompressed sizes and accept only
// explicit manifest-listed character image paths. Never interpret ZIP paths as filesystem paths.
const safeName=p=>typeof p==='string'&&/^characters\/[a-z0-9_-]+-(professional|casual)\.(png|jpe?g|webp)$/i.test(p);
const FORMAT='mayne-video-character-pack';
const MAX_ZIP=20*1024*1024;
const MAX_IMAGE=8*1024*1024;
const MAX_TOTAL=75*1024*1024;
export async function readPresenterPack(file){
 if(!file||file.size<=0||file.size>MAX_ZIP)throw Error('Choose a character ZIP smaller than 20 MB.');
 const zip=await JSZip.loadAsync(file,{checkCRC32:true});
 const entries=Object.values(zip.files);
 if(entries.length>40)throw Error('Character ZIP has too many files.');
 const record=zip.file('manifest.json');
 if(!record)throw Error('The ZIP is missing manifest.json.');
 const manifest=JSON.parse(await record.async('string'));
 if(manifest?.format!==FORMAT||manifest.version!==1||!Array.isArray(manifest.characters))
   throw Error('This is not a Mayne Video Studio character pack.');
 if(manifest.characters.length<1||manifest.characters.length>20)
   throw Error('Character collection must have 1–20 characters.');
 const images=[],characters=[];
 let size=0;
 const ids=new Set();
 for(const ch of manifest.characters){
  const id=String(ch?.id||'');
  if(!/^[a-z0-9_-]{2,70}$/i.test(id)||ids.has(id))throw Error('Character IDs must be unique and safe.');
  ids.add(id);
  const variants={};
  for(const style of ['professional','casual']){
   const path=ch?.outfits?.[style];
   if(!path)continue;
   if(!safeName(path)||!path.startsWith('characters/'+id+'-'))
     throw Error('A character image has an unexpected name.');
   const entry=zip.file(path);
   if(!entry||entry.dir)throw Error('Character image missing: '+path);
   if(entry._data?.uncompressedSize>MAX_IMAGE)throw Error('Character image exceeds 8 MB.');
   const data=await entry.async('uint8array');
   size+=data.byteLength;
   if(size>MAX_TOTAL||data.byteLength>MAX_IMAGE||data.byteLength===0)
     throw Error('Character ZIP images exceed the safe size limit.');
   const mime=/\.png$/i.test(path)?'image/png':/\.webp$/i.test(path)?'image/webp':'image/jpeg';
   if(mime==='image/png'&&!(data[0]===137&&data[1]===80&&data[2]===78&&data[3]===71))
     throw Error('One PNG image has an invalid signature.');
   const file=new File([data],path.split('/').pop(),{type:mime});
   images.push({characterId:id,style,file});
   variants[style]=true;
  }
  if(!Object.keys(variants).length)throw Error('Character '+id+' has no images.');
  characters.push({id,name:String(ch.name||id).slice(0,60),
    description:String(ch.description||'').slice(0,90),variants});
 }
 return {characters,images};
}
