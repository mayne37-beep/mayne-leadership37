import {loadProject,copy} from './model.js';
const KEY='ml.systems.library.v1';
// Independent device copies survive failed website saves. A single record holds
// source, website revision, and dirty state; it never holds an instructor secret.
export function readLocal(){try{const value=JSON.parse(localStorage.getItem(KEY)||'{}');return value&&typeof value==='object'&&!Array.isArray(value)?value:{};}catch{return {};}}
export function saveLocal(p,version=0,dirty=true){try{const all=readLocal();all[p.id]={data:copy(p),version,dirty,updated_at:new Date().toISOString()};localStorage.setItem(KEY,JSON.stringify(all));return true;}catch{return false;}}
export function deleteLocal(id){const all=readLocal();delete all[id];localStorage.setItem(KEY,JSON.stringify(all));}
export function getLocal(id){const item=readLocal()[id];if(item)item.data=loadProject(item.data);return item;}
export async function rpc(action,payload={}){const response=await fetch('/api/systems-studio',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,payload}),signal:AbortSignal.timeout(25000)});const data=await response.json().catch(()=>({}));if(!response.ok){const error=new Error(data.error||'Unable to contact website storage.');error.status=response.status;throw error;}return data;}
