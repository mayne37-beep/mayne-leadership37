// Shared curated asset catalog used by the Video Studio.
// Background images are reused from the existing Leadership 101 authoring assets.
// Presenter cutouts are user-installed ZIP media, stored in the browser.
export const CHARACTER_CATALOG_KEY='mayne-video-character-library-v1';
export const LEADERSHIP_BACKGROUNDS=Object.freeze([
 ['foundations','Leadership Foundations','01-foundations.webp'],
 ['traits','Leadership Traits','02-traits.webp'],
 ['styles','Leadership Styles','03-styles.webp'],
 ['task-relationships','Task and Relationships','04-task-relationships.webp'],
 ['skills','Leadership Skills','05-skills.webp'],
 ['strengths','Strengths','06-strengths.webp'],
 ['vision','Vision and Purpose','07-vision.webp'],
 ['teams','Building Teams','08-teams.webp'],
 ['conflict','Managing Conflict','09-conflict.webp'],
 ['ethics','Ethics and Trust','10-ethics.webp'],
 ['destructive','Destructive Leadership','11-destructive.webp'],
 ['obstacles','Overcoming Obstacles','12-obstacles.webp']
].map(([id,name,file])=>({id,name,kind:'background',url:'/assets/leadership-101/rise-style-banners/batch-3/'+file})));
export const BACKGROUND_URLS=new Set(LEADERSHIP_BACKGROUNDS.map(x=>x.url));
export function validatedBackground(url){
 return BACKGROUND_URLS.has(url)?url:'';
}
export function normalizeCharacters(items){
 if(!Array.isArray(items))return [];
 const seen=new Set(),out=[];
 for(const raw of items.slice(0,80)){
  if(!raw||typeof raw!=='object')continue;
  const id=String(raw.id||'').replace(/[^a-z0-9-_]/gi,'').slice(0,70);
  if(!id||seen.has(id))continue;
  const variants={};
  for(const style of ['professional','casual']){
    const v=raw.variants?.[style];
    if(v&&typeof v.assetId==='string'&&/^[a-z0-9-]{10,100}$/i.test(v.assetId))
      variants[style]={assetId:v.assetId,name:String(v.name||style).slice(0,100)};
  }
  if(!Object.keys(variants).length)continue;
  seen.add(id);
  out.push({id,name:String(raw.name||id).slice(0,60),description:String(raw.description||'').slice(0,90),variants});
 }
 return out;
}
export function mergeCharacters(existing,incoming){
 const merged=new Map(normalizeCharacters(existing).map(c=>[c.id,c]));
 for(const c of normalizeCharacters(incoming)){
  const old=merged.get(c.id);
  merged.set(c.id,old?{...old,...c,variants:{...old.variants,...c.variants}}:c);
 }
 return [...merged.values()].slice(0,80);
}
