import {COLORS,QUADRANTS,TOWS_TYPES,DEFAULT_WEIGHTS,escapeHTML as esc,rankStrategies,projectStats,clamp,dateToday} from './swot-model.js';

export const colorFor=id=>COLORS.find(c=>c.id===id)||COLORS[0];
export const typeFor=id=>TOWS_TYPES.find(t=>t.id===id);
export function factorHTML(f,selected='',highlighted=new Set()){
 const color=colorFor(f.color);
 return '<div tabindex="0" role="button" aria-label="Select or drag '+esc(f.text)+'" class="factor-card'+(selected===f.id?' selected':'')+(highlighted.has(f.id)?' highlight':'')+'" data-factor="'+esc(f.id)+'" style="left:'+f.x+'%;top:'+f.y+'%;width:'+f.w+'px;height:'+f.h+'px;--factor-fill:'+color.fill+';--factor-stroke:'+color.border+';--factor-ink:'+color.ink+'">'+
  (f.group?'<span class="card-group">'+esc(f.group)+'</span>':'')+
  '<span class="card-text">'+esc(f.text)+'</span><span class="card-priority">Importance '+f.importance+'/5</span>'+
  (selected===f.id?'<span class="resize-handle" data-resize="'+esc(f.id)+'" role="button" aria-label="Resize '+esc(f.text)+'" tabindex="0">↘</span>':'')+'</div>';
}
export function factorListHTML(project,selected='',search=''){
 const q=search.trim().toLowerCase();
 return project.factors.filter(f=>(f.text+' '+f.group+' '+f.notes).toLowerCase().includes(q)).map(f=>{
  const c=colorFor(f.color);
  return '<div class="factor-list-row'+(selected===f.id?' selected':'')+'" draggable="true" data-factor-row="'+esc(f.id)+'" style="--factor-stroke:'+c.border+';--factor-fill:'+c.fill+'"><span class="mini-dot">'+esc(f.quadrant)+'</span>'+
  '<button data-select-factor="'+esc(f.id)+'" type="button" title="'+esc(f.text)+'">'+esc(f.text)+'</button><span aria-hidden="true">⠿</span></div>';
 }).join('')||'<p class="muted">No matching factors. Use the form above to add one.</p>';
}
export function typePickerHTML(selected='SO'){
 return TOWS_TYPES.map(t=>'<button type="button" data-tows-type="'+t.id+'" class="tows-type'+(t.id===selected?' active':'')+'" style="--type-color:'+t.color+'" aria-pressed="'+(selected===t.id)+'"><strong>'+t.id+'</strong><small>'+esc(t.title)+'</small><small>'+esc(t.label)+'</small></button>').join('');
}
export const optionHTML=(value,label,chosen)=>'<option value="'+esc(value)+'"'+(value===chosen?' selected':'')+'>'+esc(label)+'</option>';
export function strategyCardsHTML(project,selectedStrategy=''){
 if(!project.strategies.length)return '<div class="empty"><strong>No strategies created yet.</strong>Choose a TOWS type, select two compatible factors and write an actionable strategic recommendation.</div>';
 const ratings=new Map(rankStrategies(project).map(x=>[x.id,x.baseline]));
 const card=(s,t)=>{
  const factors=s.factorIds.map(id=>project.factors.find(f=>f.id===id)).filter(Boolean);
  const needsReview=!t||factors.length!==2;
  const header=needsReview?'NEEDS REVIEW · Reconnect factors':t.id+' · '+t.title;
  return '<article class="strategy-card'+(selectedStrategy===s.id?' selected':'')+'" style="--type-color:'+(t?.color||'#b47463')+'" data-strategy-card="'+esc(s.id)+'">'+
   '<div class="strategy-card-head"><span class="strategy-type-label">'+esc(header)+'</span><span class="pill">'+esc(s.status)+'</span></div>'+
   '<h3>'+esc(s.title||'Untitled strategy')+'</h3>'+
   (needsReview?'<p class="muted">The SWOT factors changed categories or were deleted. Edit this strategy and select a new valid pair.</p>':'')+
   '<div class="strategy-sources">'+factors.map(f=>'<span class="source-pill">'+esc(f.quadrant)+' · '+esc(f.text.slice(0,80))+'</span>').join('')+'</div>'+
   '<div class="strategy-footer">'+(needsReview?'':'<button data-show-link="'+esc(s.id)+'" type="button">◎ Show connection</button>')+
   '<button data-edit-strategy="'+esc(s.id)+'" type="button">'+(needsReview?'↻ Reconnect':'✎ Edit')+'</button>'+
   '<button data-action-strategy="'+esc(s.id)+'" type="button">＋ Action</button><button data-delete-strategy="'+esc(s.id)+'" type="button" class="danger">×</button>'+
   '<span class="strategy-score">'+ratings.get(s.id).toFixed(2)+' / 5</span></div></article>';
 };
 const linked=TOWS_TYPES.map(t=>project.strategies.filter(s=>s.type===t.id&&s.factorIds.length===2).map(s=>card(s,t)).join('')).join('');
 const unlinked=project.strategies.filter(s=>!typeFor(s.type)||s.factorIds.length!==2).map(s=>card(s,null)).join('');
 return linked+unlinked;
}
const bar=n=>'<div class="rank-bar"><span><b style="width:'+(Number(n)/5*100).toFixed(1)+'%"></b></span><strong>'+Number(n).toFixed(2)+'</strong></div>';
export function rankingHTML(project){
 const rows=rankStrategies(project);
 if(!rows.length)return '<div class="empty"><strong>No strategies to compare.</strong>Create strategies in the TOWS tab, then rate their impact, feasibility, urgency and resources.</div>';
 return '<div class="rank-table"><table><thead><tr><th>Rank</th><th>Strategy</th><th>TOWS</th><th>Impact</th><th>Feasible</th><th>Urgency</th><th>Resources</th><th>Weighted score</th><th>Assess</th></tr></thead><tbody>'+
 rows.map((s,i)=>'<tr><td>#'+(i+1)+'</td><td>'+esc(s.title)+'</td><td>'+esc(s.type||'Unlinked')+'</td><td>'+s.impact+'/5</td><td>'+s.feasibility+'/5</td><td>'+s.urgency+'/5</td><td>'+s.resources+'/5</td><td>'+bar(s.baseline)+'</td><td><button type="button" data-edit-strategy="'+esc(s.id)+'">Edit ratings</button></td></tr>').join('')+
 '</tbody></table></div>';
}
export function scenarioComparisonHTML(project,scenario){
 if(!project.strategies.length)return '<div class="empty"><strong>Build strategies first.</strong>Scenarios compare your existing strategic options under different assumptions.</div>';
 const rows=rankStrategies(project,scenario||null);
 return '<div class="rank-table"><table><thead><tr><th>Strategy</th><th>TOWS</th><th>Baseline</th><th>'+(scenario?'Scenario rating':'Current rating')+'</th><th>Change</th></tr></thead><tbody>'+
 rows.map(s=>'<tr><td>'+esc(s.title)+'</td><td>'+esc(s.type||'Unlinked')+'</td><td>'+bar(s.baseline)+'</td><td>'+bar(s.scenarioScore)+'</td>'+
 '<td><strong class="'+(s.change>0?'direction-up':s.change<0?'direction-down':'')+'">'+(s.change>0?'+':'')+s.change.toFixed(2)+'</strong></td></tr>').join('')+'</tbody></table></div>';
}
export function actionsHTML(project){
 if(!project.actions.length)return '<div class="empty"><strong>Your action plan is blank.</strong>Convert a TOWS recommendation into a measurable action, assign an owner, and set a review date.<div><button type="button" data-new-action class="button-primary">＋ Create first action</button></div></div>';
 return '<div class="actions-cards">'+project.actions.map(a=>{
  const s=project.strategies.find(x=>x.id===a.strategyId),overdue=a.due&&a.due<dateToday()&&a.status!=='Done';
  return '<article class="action-card'+(overdue?' overdue':'')+'"><div class="action-card-top"><div><h3>'+esc(a.title)+'</h3><p>Linked strategy: '+esc(s?.title||'General action')+'</p></div><div><button type="button" data-edit-action="'+esc(a.id)+'">✎ Edit</button><button type="button" class="danger" data-delete-action="'+esc(a.id)+'">×</button></div></div>'+
   '<div class="action-meta"><span>Owner: '+esc(a.owner||'Unassigned')+'</span><span>Due: '+esc(a.due||'Unscheduled')+(overdue?' (past target date)':'')+'</span>'+
   (a.milestone?'<span>Milestone: '+esc(a.milestone)+'</span>':'')+'</div>'+
   (a.metric?'<p><strong>Measure:</strong> '+esc(a.metric)+' · Baseline '+esc(a.baseline||'—')+' → Target '+esc(a.target||'—')+'</p>':'')+
   (a.risks?'<p><strong>Risks:</strong> '+esc(a.risks)+'</p>':'')+
   (a.results?'<p><strong>Results:</strong> '+esc(a.results)+'</p>':'')+
   '<div class="action-meta"><label>Status <select data-action-status="'+esc(a.id)+'">'+['Not started','In progress','Blocked','Done'].map(v=>optionHTML(v,v,a.status)).join('')+'</select></label></div></article>';
 }).join('')+'</div>';
}
export function guidanceForProject(project){
 const stats=projectStats(project),notes=[];
 if(!project.objective.trim())notes.push('Describe the strategic objective before prioritizing.');
 if(stats.totalFactors<4)notes.push('Include internal and external factors and explore alternative explanations.');
 if(!stats.strategies)notes.push('Combine factor pairs in TOWS to create strategic options.');
 if(stats.strategies&&!stats.actions)notes.push('Turn a high-priority strategy into a measurable action.');
 if(stats.overdue)notes.push(stats.overdue+' action(s) are past their target date.');
 return notes;
}
function wrapLines(str,max=29,maxLines=4){
 const words=String(str||'Untitled').split(/\s+/),lines=[];let line='';
 for(const word of words){if((line+' '+word).trim().length>max&&line){lines.push(line);line=word}else line=(line+' '+word).trim()}
 if(line)lines.push(line);
 if(lines.length>maxLines){const short=lines.slice(0,maxLines);short[maxLines-1]=short[maxLines-1].slice(0,max-1)+'…';return short}
 return lines;
}
export function diagramSVG(project,{selectedStrategy='',width=1200,height=900}={}){
 const halfX=width/2,halfY=height/2,pad=14,zoneW=halfX-pad*2,zoneH=halfY-pad*2;
 const positions=new Map();
 for(const f of project.factors){
  const ix=f.quadrant==='S'||f.quadrant==='O'?0:1,iy=f.quadrant==='S'||f.quadrant==='W'?0:1;
  // Board SWOT layout S/W top, O/T bottom. Factor coordinates relative to factor space, not header.
  const left=ix*halfX+pad,top=iy*halfY+pad;
  const x=left+zoneW*f.x/100,y=top+65+(zoneH-82)*f.y/100;
  positions.set(f.id,{x,y});
 }
 let svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+width+' '+height+'" width="'+width+'" height="'+height+'" role="img" aria-label="SWOT strategy diagram '+esc(project.name)+'">';
 svg+='<defs><filter id="swotShadow"><feDropShadow dx="0" dy="4" stdDeviation="5" flood-color="#183b55" flood-opacity=".13"/></filter></defs>';
 svg+='<rect width="'+width+'" height="'+height+'" fill="#f9fcff"/>';
 const fills={S:'#f2f8ff',W:'#fff5f3',O:'#f0fbf4',T:'#fff9ed'},borders={S:'#b8d9ed',W:'#eed4cf',O:'#cce9d9',T:'#eedfbe'};
 QUADRANTS.forEach(q=>{
  const ix=q.id==='S'||q.id==='O'?0:1,iy=q.id==='S'||q.id==='W'?0:1,x=ix*halfX+pad,y=iy*halfY+pad;
  svg+='<rect x="'+x+'" y="'+y+'" width="'+zoneW+'" height="'+zoneH+'" rx="18" fill="'+fills[q.id]+'" stroke="'+borders[q.id]+'" stroke-width="2"/>';
  svg+='<text x="'+(x+20)+'" y="'+(y+34)+'" font-size="23" font-weight="800" fill="#244e69">'+esc(q.name)+'</text>';
  svg+='<text x="'+(x+20)+'" y="'+(y+55)+'" font-size="12" fill="#7590a4">'+esc(q.subtitle)+'</text>';
 });
 if(project.showConnections){
  project.strategies.filter(s=>s.factorIds.length===2).forEach(s=>{
   const a=positions.get(s.factorIds[0]),b=positions.get(s.factorIds[1]);if(!a||!b)return;
   const selected=s.id===selectedStrategy,t=typeFor(s.type);
   svg+='<path d="M'+a.x+','+a.y+' Q'+(width/2)+','+(height/2)+' '+b.x+','+b.y+'" fill="none" stroke="'+(t?.color||'#779aae')+'" stroke-width="'+(selected?8:3)+'" opacity="'+(selected?.9:.45)+'" stroke-linecap="round" stroke-dasharray="'+(selected?'':'8 6')+'"/>';
  });
 }
 project.factors.forEach(f=>{
  const pos=positions.get(f.id);if(!pos)return;
  const c=colorFor(f.color),w=Math.min(f.w,zoneW*.6),h=Math.min(f.h,zoneH*.42),x=pos.x-w/2,y=pos.y-h/2;
  const labels=wrapLines(f.text,Math.max(12,Math.floor(w/8.5)),3),lineY=pos.y-(labels.length-1)*9;
  svg+='<rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" rx="13" fill="'+c.fill+'" stroke="'+c.border+'" stroke-width="2.5" filter="url(#swotShadow)"/>';
  if(f.group)svg+='<text x="'+pos.x+'" y="'+(y+18)+'" text-anchor="middle" font-size="10" font-weight="750" fill="'+c.ink+'" opacity=".74">'+esc(f.group.slice(0,28))+'</text>';
  labels.forEach((line,i)=>{svg+='<text x="'+pos.x+'" y="'+(lineY+i*18)+'" text-anchor="middle" font-size="13" font-weight="750" fill="'+c.ink+'">'+esc(line)+'</text>'});
 });
 return svg+'</svg>';
}
const reportTable=(headers,rows)=>rows.length?'<table><thead><tr>'+headers.map(s=>'<th>'+esc(s)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map(v=>'<td>'+esc(v??'—')+'</td>').join('')+'</tr>').join('')+'</tbody></table>':'<p>No entries recorded yet.</p>';
export function reportHTML(project){
 const stats=projectStats(project),ranked=rankStrategies(project),active=project.scenarios.find(s=>s.id===project.activeScenario);
 const comparison=active?rankStrategies(project,active):[];
 return '<header><small>MAYNE LEADERSHIP · STRATEGIC THINKING STUDIO</small><h1>'+esc(project.name)+'</h1><p>'+esc(project.objective||'Objective not recorded')+' · '+stats.totalFactors+' SWOT factors · '+stats.strategies+' strategic options · '+esc(new Date().toLocaleDateString())+'</p></header>'+
 '<section><h2>SWOT analysis</h2>'+diagramSVG(project)+'</section>'+
 '<section><h2>Factors and assumptions</h2>'+reportTable(['Type','Factor','Group','Importance','Confidence','Reasoning'],project.factors.map(f=>[f.quadrant,f.text,f.group,f.importance,f.confidence,f.notes]))+'</section>'+
 '<section><h2>TOWS recommendations</h2>'+reportTable(['TOWS','Recommendation','Related factors','Owner','Status','Weighted score'],ranked.map(s=>[s.type,s.title,s.factorIds.map(id=>project.factors.find(f=>f.id===id)?.text||'').join(' / '),s.owner,s.status,s.baseline.toFixed(2)]))+'</section>'+
 '<section><h2>Scenario testing</h2><p>Scenarios are hypothetical rating adjustments, not predicted outcomes.</p>'+reportTable(['Scenario','Assumptions'],project.scenarios.map(s=>[s.name,s.description]))+
 (active?'<h3>Selected comparison: '+esc(active.name)+'</h3>'+reportTable(['Strategy','Baseline','Scenario','Change'],comparison.map(s=>[s.title,s.baseline,s.scenarioScore,s.change])):'')+'</section>'+
 '<section><h2>Implementation action plan</h2>'+reportTable(['Action','Linked strategy','Owner','Due','Milestone','Measure','Baseline','Target','Status','Risk','Result'],project.actions.map(a=>[a.title,project.strategies.find(s=>s.id===a.strategyId)?.title||'General',a.owner,a.due,a.milestone,a.metric,a.baseline,a.target,a.status,a.risks,a.results]))+'</section>'+
 '<section><h2>Review notes</h2><p><strong>Project lead:</strong> '+esc(project.owner||'Not assigned')+' · <strong>Review date:</strong> '+esc(project.reviewDate||'Not scheduled')+'</p><p>'+esc(project.description||'No additional context recorded')+'</p></section>';
}
