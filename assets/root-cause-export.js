import {fishboneSVG,reportHTML} from './root-cause-render.js';
import {paretoAnalysis,depth} from './root-cause-model.js';
export const safeName=c=>(c.title||'root-cause').toLowerCase().replace(/[^a-z0-9-]+/g,'-').replace(/^-|-$/g,'').slice(0,55)||'root-cause';
export function saveDownload(content,name,type){
 const b=content instanceof Blob?content:new Blob([content],{type});
 const url=URL.createObjectURL(b),link=document.createElement('a');
 link.href=url;link.download=name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1600);
}
export function exportJSON(c){saveDownload(JSON.stringify({kind:'mayne-root-cause',version:1,investigation:c},null,2),safeName(c)+'.root-cause.json','application/json');}
export function exportSVG(c){saveDownload('<?xml version="1.0" encoding="UTF-8"?>\n'+fishboneSVG(c),safeName(c)+'-fishbone.svg','image/svg+xml');}
export async function exportPNG(c){
 const markup=fishboneSVG(c),blob=new Blob([markup],{type:'image/svg+xml;charset=utf-8'}),url=URL.createObjectURL(blob);
 try{
  const image=new Image();
  await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(Error('Diagram could not be rendered.'));image.src=url});
  const dimension=/viewBox="0 0 (\d+) (\d+)"/.exec(markup),w=Number(dimension?.[1]||1170),h=Number(dimension?.[2]||610);
  const canvas=document.createElement('canvas');canvas.width=w*2;canvas.height=h*2;
  const ctx=canvas.getContext('2d');if(!ctx)throw Error('Canvas unavailable.');
  ctx.fillStyle='#f7fbff';ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.drawImage(image,0,0,canvas.width,canvas.height);
  const png=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
  if(!png)throw Error('PNG could not be created.');
  saveDownload(png,safeName(c)+'-fishbone.png','image/png');
 }finally{URL.revokeObjectURL(url)}
}
function csv(rows){return '\ufeff'+rows.map(r=>r.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(',')).join('\r\n')}
export function exportPareto(c){
 const p=paretoAnalysis(c.pareto);
 saveDownload(csv([['Observed issue','Frequency','Percent','Cumulative percent','Illustrative?'],
 ...p.rows.map(r=>[r.label,r.count,(r.share*100).toFixed(2),(r.cumulative*100).toFixed(2),r.sample?'Yes':'No'])]),safeName(c)+'-pareto.csv','text/csv;charset=utf-8');
}
export function exportSolutions(c){
 saveDownload(csv([['Intervention','Related causes','Owner','Due','Status','Impact','Effort','Confidence','Metric','Baseline','Target','Observed result'],
 ...c.solutions.map(s=>[s.title,s.causeIds.map(id=>c.causes.find(x=>x.id===id)?.text||'').join('; '),s.owner,s.due,s.status,s.impact,s.effort,s.confidence,s.measure,s.baseline,s.target,s.result])]),safeName(c)+'-interventions.csv','text/csv;charset=utf-8');
}
export function printReport(c){document.querySelector('#print-document').innerHTML=reportHTML(c);window.print();}

/** Structured 5 Whys export preserves each parent relationship for analysis. */
export function exportWhysCSV(c){
 const columns=['Why level','Potential cause','Contributes to','Category','Assessment','Root candidate','Evidence records','Reasoning / notes'];
 const rows=c.causes.map(x=>[
 depth(c,x.id)+1,x.text,c.causes.find(p=>p.id===x.parentId)?.text||c.problem||'Original problem',
 c.categories.find(cat=>cat.id===x.category)?.name||'Uncategorized',x.status,x.root?'Yes':'No',
 c.evidence.filter(ev=>ev.causeId===x.id).length,x.notes
 ]);
 saveDownload(csv([columns,...rows]),safeName(c)+'-5-whys.csv','text/csv;charset=utf-8');
}
