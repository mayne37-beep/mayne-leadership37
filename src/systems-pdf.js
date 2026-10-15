import {PDFDocument,StandardFonts,rgb} from 'pdf-lib';
import {analyze,bounds,geometry} from '../assets/systems/model.js';
const ascii=s=>String(s??'').replace(/→/g,' -> ').replace(/[−–—·]/g,'-').replace(/[’‘]/g,"'").replace(/[“”]/g,'"').replace(/[^\x20-\x7e\n]/g,'?');
const color=hex=>rgb(parseInt(hex.slice(1,3),16)/255,parseInt(hex.slice(3,5),16)/255,parseInt(hex.slice(5,7),16)/255);
function wrap(text,font,size,width){const lines=[];for(const paragraph of ascii(text).split('\n')){let line='';for(const word of paragraph.split(/\s+/)){if(font.widthOfTextAtSize(line+' '+word,size)>width&&line){lines.push(line);line=word;}else line+=(line?' ':'')+word;}lines.push(line);}return lines;}
export async function pdfReport(project){
 const doc=await PDFDocument.create(),font=await doc.embedFont(StandardFonts.Helvetica),bold=await doc.embedFont(StandardFonts.HelveticaBold);doc.setTitle(ascii(project.title));doc.setAuthor('Mayne Leadership');
 const page=doc.addPage([792,612]),b=bounds(project),scale=Math.min(720/b.w,485/b.h),left=(792-b.w*scale)/2,top=545;
 const point=(x,y)=>({x:left+(x-b.x)*scale,y:top-(y-b.y)*scale});
 page.drawText(ascii(project.title).slice(0,85),{x:36,y:575,size:19,font:bold,color:color('#174f7b')});page.drawText('Systems Mapping Studio | causal map',{x:36,y:555,size:10,font,color:color('#527e9f')});
 for(const g of project.groups){const pos=point(g.x,g.y+g.h);page.drawRectangle({...pos,width:g.w*scale,height:g.h*scale,color:color(g.color),opacity:.2,borderColor:color('#9ebbd0'),borderWidth:.7});const label=point(g.x+10,g.y+22);page.drawText(ascii(g.label).slice(0,70),{...label,size:Math.max(3,11*scale),font:bold,color:color('#41647f')});}
 for(const e of project.edges){const a=project.nodes.find(n=>n.id===e.from),c=project.nodes.find(n=>n.id===e.to);if(!a||!c)continue;
  const q=geometry(project,e),nums=q.d.match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi)?.map(Number);if(!nums)continue;const pts=[];
  if(q.d.includes('Q')){const [sx,sy,cx,cy,ex,ey]=nums;for(let i=0;i<=20;i++){const t=i/20;pts.push(point((1-t)**2*sx+2*(1-t)*t*cx+t*t*ex,(1-t)**2*sy+2*(1-t)*t*cy+t*t*ey));}}
  else{const [sx,sy,c1x,c1y,c2x,c2y,ex,ey]=nums;for(let i=0;i<=25;i++){const t=i/25;pts.push(point((1-t)**3*sx+3*(1-t)**2*t*c1x+3*(1-t)*t*t*c2x+t**3*ex,(1-t)**3*sy+3*(1-t)**2*t*c1y+3*(1-t)*t*t*c2y+t**3*ey));}}
  const stroke=color(e.kind==='flow'?'#25856e':'#547e9b');for(let i=1;i<pts.length;i++)if(!e.delayed||i%3!==0)page.drawLine({start:pts[i-1],end:pts[i],thickness:Math.max(.6,2*scale),color:stroke});
  const end=pts.at(-1),prev=pts.at(-2),angle=Math.atan2(end.y-prev.y,end.x-prev.x),len=Math.max(3,9*scale);for(const delta of [-.5,.5])page.drawLine({start:end,end:{x:end.x-Math.cos(angle+delta)*len,y:end.y-Math.sin(angle+delta)*len},thickness:1,color:stroke});
  const lp=point(q.x,q.y);page.drawText(e.kind==='causal'?e.polarity:e.kind==='flow'?'flow':'info',{x:lp.x,y:lp.y,size:Math.max(4,16*scale),font:bold,color:stroke});if(e.delayed)page.drawText('||',{x:lp.x+12*scale,y:lp.y,size:Math.max(4,13*scale),font,color:color('#926818')});
 }
 for(const n of project.nodes){const pos=point(n.x,n.y+n.h);page.drawRectangle({...pos,width:n.w*scale,height:n.h*scale,color:color(n.color),borderColor:color(n.leverage?'#bc841b':'#91b3cc'),borderWidth:Math.max(.5,scale)});const start=point(n.x+10,n.y+20);page.drawText(n.type.toUpperCase(),{...start,size:Math.max(3,9*scale),font,color:color('#45677c')});const rows=wrap(n.label,bold,14,n.w-20);for(let i=0;i<Math.min(rows.length,Math.floor((n.h-30)/18));i++){const pos=point(n.x+10,n.y+42+i*18);page.drawText(rows[i],{...pos,size:Math.max(3,14*scale),font:bold,color:color('#153951')});}}
 page.drawText('Structural map: signs are hypotheses, not quantitative predictions.',{x:36,y:25,size:9,font,color:color('#527e9f')});
 let reportPage=doc.addPage([612,792]),y=750;
 const section=(title,text)=>{const all=[...wrap(title,bold,13,520).map(t=>({t,font:bold,size:13})),...wrap(text,font,10,520).map(t=>({t,font,size:10}))];for(const row of all){if(y<45){reportPage=doc.addPage([612,792]);y=750;}reportPage.drawText(row.t,{x:45,y,size:row.size,font:row.font,color:color('#153951')});y-=row.size+5;}y-=12;};
 const a=analyze(project),name=id=>project.nodes.find(n=>n.id===id)?.label||'?';
 section(project.title,'Systems analysis report | Mayne Leadership');section('Issue and scope',`Issue: ${project.issue}\nPurpose: ${project.purpose}\nScope: ${project.boundary}\nTime horizon: ${project.timeHorizon}`);
 section('Feedback analysis',`${a.counts.reinforcing} reinforcing; ${a.counts.balancing} balancing; ${a.counts.uncertain} uncertain. ${a.truncated||a.depthLimited?'Search limit reached; results may be incomplete.':''}\nLoop structure does not prove causal validity, magnitude, or dominant behavior.`);
 for(const [i,l] of a.loops.entries())section(`${l.type} loop ${i+1}`,`${l.nodes.map(name).concat(name(l.nodes[0])).join(' -> ')}\n${l.negative} negative links; ${l.delays} delays`);
 section('Review prompts',a.review.join('\n')||'No structural warnings. Validate causal claims with stakeholders.');
 for(const n of project.nodes)section(n.label,`Type: ${n.type}; confidence: ${n.confidence}${n.leverage?'; potential leverage point':''}\nEvidence: ${n.evidence}\nNotes: ${n.notes}`);
 for(const e of project.edges)section(name(e.from)+' -> '+name(e.to),`${e.kind}; polarity ${e.polarity}; ${e.confidence}\nDelay: ${e.delayed?e.delay:'None recorded'}\nEvidence: ${e.evidence}`);
 section('Iceberg exploration',Object.entries(project.iceberg).map(([k,v])=>k+': '+v).join('\n'));section('Behavior over time',`${project.behavior.label} (${project.behavior.unit})\n${project.behavior.points}\n${project.behavior.interpretation}`);section('Recommendation',project.recommendation);
 for(const action of project.actions)section('Action: '+action.text,`Owner: ${action.owner}; due: ${action.due}; status: ${action.status}\nSuccess measure: ${action.measure}`);section('Reflection',project.reflection);
 return doc.save();
}
