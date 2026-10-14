import '../../assets/escape-room/engine.js';
const E=globalThis.EscapeEngine;
export const validId=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(value);
export const validToken=value=>typeof value==='string'&&/^[a-f0-9]{48}$/.test(value);
export function assetIds(project){
 const result=new Set();
 for(const scene of project.scenes||[]){for(const source of [scene.background?.data,...(scene.objects||[]).flatMap(o=>[o.image,o.clueImage])]){
  if(!source)continue;
  const match=String(source).match(/^\/api\/escape-studio\?action=asset&id=(asset-[a-f0-9]{64})$/);
  if(match)result.add(match[1]);
 }}return [...result];
}
export function validateDraft(p){
 if(!p||p.schemaVersion!==1||!validId(p.id)||!Array.isArray(p.scenes)||!p.scenes.length||p.scenes.length>100)return ['Invalid room structure.'];
 if(typeof p.title!=='string'||!p.title.trim()||p.title.length>200)return ['Enter a room title of 1–200 characters.'];
 if(!Number.isFinite(p.duration)||p.duration<0||p.duration>1440)return ['Invalid time limit.'];
 const ids=new Set(),scenes=new Set(),kinds=new Set(['clue','item','code','target','portal','finish','decoration']);
 const imageOK=value=>!value||typeof value==='string'&&/^\/api\/escape-studio\?action=asset&id=asset-[a-f0-9]{64}$/.test(value);
 for(const s of p.scenes){
  if(!validId(s.id)||scenes.has(s.id)||!Array.isArray(s.objects)||s.objects.length>300||!['illustration','photo','panorama'].includes(s.background?.type))return ['Invalid scene structure.'];scenes.add(s.id);
  if(!imageOK(s.background.data))return ['Upload scene photos using the studio controls.'];
  for(const o of s.objects){
   if(!validId(o.id)||ids.has(o.id)||!kinds.has(o.type))return ['Invalid or duplicate room object.'];ids.add(o.id);
   for(const key of ['x','y','w','h','yaw','pitch','rotation'])if(o[key]!==undefined&&(!Number.isFinite(o[key])||Math.abs(o[key])>1000))return ['Invalid object position or size.'];
   for(const key of ['requires','reveal','hints','alternatives'])if(!Array.isArray(o[key])||o[key].length>300||o[key].some(x=>typeof x!=='string'||x.length>12000))return ['Invalid puzzle rules.'];
   if(!imageOK(o.image)||!imageOK(o.clueImage))return ['Upload object images using the studio controls.'];
  }
 }
 if(!scenes.has(p.startSceneId))return ['Select an existing starting scene.'];
 return [];
}
export function validatePublished(p){const issues=validateDraft(p);return issues.length?issues:E.validate(p);}
export function learnerProject(source,token,version){const data=structuredClone(source);for(const s of data.scenes){if(s.background.data)s.background.data+='&room='+token;for(const o of s.objects)for(const key of ['image','clueImage'])if(o[key])o[key]+='&room='+token;}data.id+='-v'+version;data.publicationVersion=version;delete data._cloud;return data;}
export function validateProgress(p){
 if(!p||typeof p!=='object'||!Array.isArray(p.solved)||p.solved.length>1000||!Array.isArray(p.log)||p.log.length>2000)return false;
 return Number.isFinite(p.attempts)&&p.attempts>=0&&p.attempts<=100000&&Number.isFinite(p.elapsed)&&p.elapsed>=0&&p.elapsed<=604800&&typeof p.finished==='boolean'&&typeof p.learner==='string'&&p.learner.length<=100&&typeof p.notes==='string'&&p.notes.length<=12000;
}
