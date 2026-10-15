(function(root){
'use strict';
const library=p=>Array.isArray(p.assetLibrary)?p.assetLibrary:[];
const image=value=>typeof value==='string'&&(/^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(value)||/^\/api\/escape-studio\?action=asset&id=asset-[a-f0-9]{64}$/.test(value));
function originalHTML(project,preview=false){
 const template=project.originalGame?.htmlTemplate;if(typeof template!=='string'||template.length>300000)throw new Error('The original game is unavailable.');
 const sources=new Map(library(project).map(a=>[a.id,a.image]));
 let html=template.replace(/__ESCAPE_ASSET_([a-f0-9]{64})__/g,(_,hash)=>{const source=sources.get('asset-'+hash);if(!image(source)||!source.startsWith('data:'))throw new Error('The original game is missing an image.');return source;});
 if(preview){
  const policy='<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data: blob:; style-src \'unsafe-inline\'; script-src \'unsafe-inline\'; connect-src \'none\'; base-uri \'none\'; form-action \'none\'">';
  const storage='<script>try{localStorage.getItem("preview");}catch{const data=new Map();Object.defineProperty(window,"localStorage",{value:{getItem:k=>data.get(String(k))??null,setItem:(k,v)=>data.set(String(k),String(v)),removeItem:k=>data.delete(String(k)),clear:()=>data.clear()}});}<\/script>';
  html=html.replace(/<head(?:\s[^>]*)?>/i,match=>match+policy+storage);
 }
 return html;
}
const crcTable=Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
function crc32(bytes){let crc=0xffffffff;for(const b of bytes)crc=crcTable[(crc^b)&255]^(crc>>>8);return (crc^0xffffffff)>>>0;}
function zipFiles(files){
 const local=[],central=[];let offset=0;const encoder=new TextEncoder();
 for(const file of files){
  if(!/^[A-Za-z0-9_. /-]+$/.test(file.path)||file.path.startsWith('/')||file.path.split('/').includes('..'))throw new Error('An asset has an invalid filename.');
  const name=encoder.encode(file.path),bytes=typeof file.data==='string'?encoder.encode(file.data):file.data,crc=crc32(bytes);
  const header=new Uint8Array(30+name.length),h=new DataView(header.buffer);h.setUint32(0,0x04034b50,true);h.setUint16(4,20,true);h.setUint16(6,0x800,true);h.setUint16(12,0x21,true);h.setUint32(14,crc,true);h.setUint32(18,bytes.length,true);h.setUint32(22,bytes.length,true);h.setUint16(26,name.length,true);header.set(name,30);local.push(header,bytes);
  const directory=new Uint8Array(46+name.length),d=new DataView(directory.buffer);d.setUint32(0,0x02014b50,true);d.setUint16(4,20,true);d.setUint16(6,20,true);d.setUint16(8,0x800,true);d.setUint16(14,0x21,true);d.setUint32(16,crc,true);d.setUint32(20,bytes.length,true);d.setUint32(24,bytes.length,true);d.setUint16(28,name.length,true);d.setUint32(42,offset,true);directory.set(name,46);central.push(directory);offset+=header.length+bytes.length;
 }
 const size=central.reduce((n,b)=>n+b.length,0),end=new Uint8Array(22),e=new DataView(end.buffer);e.setUint32(0,0x06054b50,true);e.setUint16(8,files.length,true);e.setUint16(10,files.length,true);e.setUint32(12,size,true);e.setUint32(16,offset,true);return new Blob([...local,...central,end],{type:'application/zip'});
}
function assetZip(project){
 const files=[];
 for(const a of library(project)){if(!image(a.image)||!a.image.startsWith('data:'))throw new Error('Download the project images before exporting its assets.');const data=atob(a.image.split(',',2)[1]);files.push({path:a.path,data:Uint8Array.from(data,c=>c.charCodeAt(0))});if(a.svg&&a.vectorPath)files.push({path:a.vectorPath,data:a.svg});}
 for(const doc of project.assetDocuments||[])files.push({path:doc.path,data:doc.text});
 return zipFiles(files);
}
root.EscapeProjectAssets={library,image,originalHTML,assetZip,zipFiles};
})(typeof window!=='undefined'?window:globalThis);
