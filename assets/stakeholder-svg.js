import {WIDTH,HEIGHT,MATRICES,COLORS,escapeHTML as e} from './stakeholder-model.js';
const color=id=>COLORS.find(c=>c.id===id)||COLORS[0];
function makeLabel(value,limit=23,maxLines=2){
 const words=String(value||'Unnamed stakeholder').split(/\s+/),lines=[];
 let line='';
 for(const word of words){
  if((line+' '+word).trim().length>limit&&line){lines.push(line);line=word;}else line=(line+' '+word).trim();
 }
 if(line)lines.push(line);
 if(lines.length>maxLines){const keep=lines.slice(0,maxLines),rest=lines.slice(maxLines-1).join(' ');keep[maxLines-1]=rest.length>limit?rest.slice(0,limit-1)+'…':rest;return keep}
 return lines;
}
function shapeMarkup(n,colors){
 const w=n.w,h=n.h,common='fill="'+colors.fill+'" stroke="'+colors.line+'" stroke-width="3"';
 if(n.shape==='circle')return '<ellipse cx="0" cy="0" rx="'+w/2+'" ry="'+h/2+'" '+common+'/>';
 if(n.shape==='diamond')return '<polygon points="0,'+(-h/2)+' '+w/2+',0 0,'+h/2+' '+(-w/2)+',0" '+common+'/>';
 if(n.shape==='hexagon')return '<polygon points="'+(-w*.31)+','+(-h/2)+' '+(w*.31)+','+(-h/2)+' '+w/2+',0 '+(w*.31)+','+h/2+' '+(-w*.31)+','+h/2+' '+(-w/2)+',0" '+common+'/>';
 const r=n.shape==='rectangle'?7:n.shape==='pill'?h/2:20;
 return '<rect x="'+(-w/2)+'" y="'+(-h/2)+'" width="'+w+'" height="'+h+'" rx="'+r+'" '+common+'/>';
}
function nodeMarkup(n,selected){
 const c=color(n.color),isSelected=n.id===selected;
 const max=n.shape==='diamond'?Math.max(8,Math.floor(n.w/13)):n.shape==='circle'?Math.max(10,Math.floor(n.w/11)):Math.max(12,Math.floor(n.w/9));
 const lines=makeLabel(n.label,max,2);const font=lines.some(l=>l.length>21)?13:14.5;
 const y0=lines.length===2?-10:-3;
 const label=lines.map((line,i)=>'<text x="0" y="'+(y0+i*18)+'" text-anchor="middle" font-size="'+font+'" font-weight="800" fill="'+c.text+'" pointer-events="none">'+e(line)+'</text>').join('');
 const role=n.role?'<text x="0" y="'+(lines.length===2?30:18)+'" text-anchor="middle" font-size="10.5" fill="'+c.text+'" opacity=".75" pointer-events="none">'+e(n.role.length>29?n.role.slice(0,28)+'…':n.role)+'</text>':'';
 const selectedRing=isSelected?'<rect x="'+(-n.w/2-8)+'" y="'+(-n.h/2-8)+'" width="'+(n.w+16)+'" height="'+(n.h+16)+'" rx="22" fill="none" stroke="#c9983e" stroke-width="2.5" stroke-dasharray="6 5" pointer-events="none"/>':'';
 const handle=isSelected?'<g class="stake-resize" data-resize="'+e(n.id)+'" transform="translate('+(n.w/2)+','+(n.h/2)+')" role="button" aria-label="Resize stakeholder"><circle r="14" fill="white" stroke="#255e9b" stroke-width="3"/><path d="M-5 5 L5 -5 M0 6 L6 0" fill="none" stroke="#255e9b" stroke-width="2" stroke-linecap="round"/></g>':'';
 return '<g class="stakeholder '+(isSelected?'selected':'')+'" data-node="'+e(n.id)+'" tabindex="0" role="button" aria-label="'+e(n.label+'; '+n.shape+'; drag to reposition')+'" transform="translate('+n.x+' '+n.y+')">'+
 selectedRing+'<g class="stake-shape" filter="url(#node-shadow)">'+shapeMarkup(n,c)+'</g>'+label+role+handle+'</g>';
}
function svgDefs(){
 return '<defs><pattern id="dotpattern" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.05" fill="#a0bbd1" opacity=".46"/></pattern><filter id="node-shadow" x="-30%" y="-45%" width="170%" height="200%"><feDropShadow dx="0" dy="6" stdDeviation="6" flood-color="#163e62" flood-opacity=".16"/></filter><marker id="link-arrow" markerWidth="10" markerHeight="10" refX="9" refY="5" orient="auto"><path d="M0 0 L9 5 L0 10 Z" fill="#6993b1"/></marker></defs>';
}
function canvasBackground(map){
 const m=MATRICES.find(x=>x.id===map.matrix)||MATRICES[0];
 let parts='<rect x="0" y="0" width="'+WIDTH+'" height="'+HEIGHT+'" fill="#f8fbff"/>';
 if(m.id!=='blank'){
  const quadrants=[{x:0,y:0,fill:'#f0f6fc'},{x:600,y:0,fill:'#f8f7ff'},{x:0,y:380,fill:'#fffaf0'},{x:600,y:380,fill:'#f3fbf9'}];
  quadrants.forEach((q,i)=>{parts+='<rect x="'+q.x+'" y="'+q.y+'" width="600" height="380" fill="'+q.fill+'"/><text x="'+(q.x+30)+'" y="'+(q.y+36)+'" font-size="18" font-weight="800" fill="#406783" opacity=".79">'+e(m.quadrants[i])+'</text><text x="'+(q.x+30)+'" y="'+(q.y+57)+'" font-size="11.5" fill="#7894a8">'+e(m.descriptions[i])+'</text>'});
 }
 parts+='<rect x="0" y="0" width="'+WIDTH+'" height="'+HEIGHT+'" fill="url(#dotpattern)"/>';
 if(m.id!=='blank'){
 parts+='<path d="M600 0 V760 M0 380 H1200" fill="none" stroke="#b5cbdf" stroke-width="2" stroke-dasharray="9 8"/>';
 parts+='<g fill="#456c8a" font-size="13" font-weight="800"><text x="25" y="742">LOW '+e(m.x.toUpperCase())+'</text><text x="1176" y="742" text-anchor="end">HIGH '+e(m.x.toUpperCase())+'</text>'+
 '<text x="25" y="88">HIGH '+e(m.y.toUpperCase())+'</text><text x="25" y="708">LOW '+e(m.y.toUpperCase())+'</text></g>';
 }
 return parts;
}
function connectors(map){
 const byId=new Map(map.nodes.map(n=>[n.id,n]));
 return map.links.map(l=>{
  const a=byId.get(l.from),b=byId.get(l.to);if(!a||!b)return '';
  const midX=(a.x+b.x)/2,midY=(a.y+b.y)/2;
  const label=l.label?'<g><rect x="'+(midX-42)+'" y="'+(midY-21)+'" width="84" height="24" rx="11" fill="#fff" stroke="#b3cedf"/><text x="'+midX+'" y="'+(midY-5)+'" text-anchor="middle" font-size="10.5" font-weight="700" fill="#386585">'+e(l.label.slice(0,16))+'</text></g>':'';
  return '<g class="relationship" data-link="'+e(l.id)+'" aria-label="'+e('Relationship '+a.label+' to '+b.label)+'"><path d="M'+a.x+' '+a.y+' L'+b.x+' '+b.y+'" fill="none" stroke="#8ea9bd" stroke-width="3" stroke-linecap="round" stroke-dasharray="7 5" marker-end="url(#link-arrow)"/>'+label+'</g>';
 }).join('');
}
export function renderMapSVG(map,selected='',view={x:0,y:0,w:WIDTH,h:HEIGHT}){
 const vb=[view.x,view.y,view.w,view.h].map(v=>Number(v.toFixed(3))).join(' ');
 const accessible='Stakeholder map: '+map.name+', '+map.nodes.length+' stakeholders; '+(MATRICES.find(x=>x.id===map.matrix)?.name||'Freeform');
 return '<svg xmlns="http://www.w3.org/2000/svg" id="stakeholder-svg" viewBox="'+vb+'" preserveAspectRatio="xMidYMid meet" role="img" aria-label="'+e(accessible)+'" tabindex="0">'+
 svgDefs()+'<g id="board-background">'+canvasBackground(map)+'</g>'+
 '<g id="link-layer">'+connectors(map)+'</g>'+
 '<g id="node-layer">'+map.nodes.map(n=>nodeMarkup(n,selected)).join('')+'</g></svg>';
}
export function exportSVGMarkup(map){
 // Export the full board, not the editor's zoomed viewport or resize handles.
 const source=renderMapSVG(map,'',{x:0,y:0,w:WIDTH,h:HEIGHT});
 return source.replace('id="stakeholder-svg"','id="stakeholder-export" width="1200" height="760"');
}
export function svgPointFromClient(svg,clientX,clientY){
 // SVGPoint/createSVGPoint correctly accounts for preserveAspectRatio on responsive screens.
 const matrix=svg.getScreenCTM?.();
 if(matrix?.inverse && svg.createSVGPoint){
  const pt=svg.createSVGPoint();pt.x=clientX;pt.y=clientY;
  const out=pt.matrixTransform(matrix.inverse());return {x:out.x,y:out.y};
 }
 const box=svg.getBoundingClientRect();const vb=svg.viewBox?.baseVal||{x:0,y:0,width:WIDTH,height:HEIGHT};
 // Fallback for jsdom where SVG layout APIs are incomplete.
 if(!box.width||!box.height)return {x:vb.x+vb.width/2,y:vb.y+vb.height/2};
 const scale=Math.min(box.width/vb.width,box.height/vb.height);
 const offsetX=(box.width-vb.width*scale)/2,offsetY=(box.height-vb.height*scale)/2;
 return {x:vb.x+(clientX-box.left-offsetX)/scale,y:vb.y+(clientY-box.top-offsetY)/scale};
}
