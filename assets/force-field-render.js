import {COLORS,escapeHTML as e,calculateBalance,effectiveStrength,teamRanking,today} from './force-field-model.js';
export const colorFor=id=>COLORS.find(x=>x.id===id)||COLORS[0];
export const truncate=(value,length=35)=>String(value??'').length>length?String(value).slice(0,length-1)+'…':String(value??'');
const text=(x,y,value,attrs='')=>'<text x="'+x+'" y="'+y+'" '+attrs+'>'+e(value)+'</text>';
function wrapped(str,max=29,limit=2){
 const words=String(str||'New force').split(/\s+/),out=[];let line='';
 for(const word of words){if((line+' '+word).trim().length>max&&line){out.push(line);line=word}else line=(line+' '+word).trim()}
 if(line)out.push(line);
 if(out.length>limit){const head=out.slice(0,limit);head[limit-1]=truncate(out.slice(limit-1).join(' '),max);return head}
 return out;
}
export function forcePoint(force){
 const driving=force.side==='driving';
 return {x:driving?246:954,y:112+force.y*4.8,side:force.side};
}
function forceSVG(force,selected='',scenario=null){
 const strength=effectiveStrength(force,scenario),isDriving=force.side==='driving',p=forcePoint(force);
 const color=colorFor(force.color),active=force.id===selected;
 const rectX=p.x-179,rectY=p.y-37,rectW=358,rectH=74;
 const arrowStart=isDriving?rectX+rectW+4:rectX-4,arrowEnd=isDriving?430+strength*27:770-strength*27;
 const arrowY=p.y,thickness=3+strength*2.45,changed=strength!==force.strength;
 const path=isDriving?'M'+arrowStart+','+arrowY+' H'+arrowEnd:'M'+arrowStart+','+arrowY+' H'+arrowEnd;
 const endTriangle=isDriving?(arrowEnd+','+(arrowY-thickness*.87)+' '+(arrowEnd+thickness*1.4)+','+arrowY+' '+arrowEnd+','+(arrowY+thickness*.87)):
 (arrowEnd+','+(arrowY-thickness*.87)+' '+(arrowEnd-thickness*1.4)+','+arrowY+' '+arrowEnd+','+(arrowY+thickness*.87));
 const lines=wrapped(force.label,38,2),textY=p.y-(lines.length-1)*9-4;
 return '<g class="force-glyph '+(active?'selected':'')+(changed?' changed':'')+'" data-force="'+e(force.id)+'" role="button" tabindex="0" aria-label="'+e((isDriving?'Driving: ':'Restraining: ')+force.label+', '+strength+' out of 5. Drag to move and adjust intensity.')+'">'+
  '<title>'+e(force.label+' · '+strength+'/5'+(force.stakeholder?' · '+force.stakeholder:''))+'</title>'+
  '<path d="'+path+'" stroke="'+color.border+'" stroke-width="'+thickness+'" class="force-arrow '+(isDriving?'arrow-drive':'arrow-resist')+'" fill="none" stroke-linecap="round" stroke-dasharray="18 8"/>'+
  '<polygon points="'+endTriangle+'" fill="'+color.border+'"/>'+
  (active?'<rect x="'+(rectX-6)+'" y="'+(rectY-6)+'" width="'+(rectW+12)+'" height="'+(rectH+12)+'" rx="17" fill="none" stroke="#c79a46" stroke-width="2.8" stroke-dasharray="7 5"/>':'')+
  '<rect x="'+rectX+'" y="'+rectY+'" width="'+rectW+'" height="'+rectH+'" rx="13" fill="'+color.fill+'" stroke="'+color.border+'" stroke-width="2.2" class="force-card-shape"/>'+
  '<circle cx="'+(isDriving?rectX+23:rectX+rectW-23)+'" cy="'+p.y+'" r="15" fill="'+color.border+'"/>'+
  text(isDriving?rectX+23:rectX+rectW-23,p.y+5,isDriving?'+':'−','text-anchor="middle" font-size="19" font-weight="900" fill="#fff" pointer-events="none"')+
  lines.map((line,i)=>text(p.x+(isDriving?13:-13),textY+i*17,line,'text-anchor="middle" font-size="13.5" font-weight="800" fill="'+color.text+'" pointer-events="none"')).join('')+
  (force.group?text(p.x,p.y+29,truncate(force.group,42),'text-anchor="middle" font-size="10" fill="'+color.text+'" opacity=".73" pointer-events="none"'):'')+
  '<rect x="'+(isDriving?rectX+rectW-53:rectX+6)+'" y="'+(rectY+5)+'" width="47" height="19" rx="10" fill="#fff" opacity=".9" pointer-events="none"/>'+
  text(isDriving?rectX+rectW-30:rectX+29,rectY+18,strength+'/5','text-anchor="middle" font-size="10" font-weight="850" fill="'+color.text+'" pointer-events="none"')+
  '<circle cx="'+arrowEnd+'" cy="'+p.y+'" r="'+(9+strength/2)+'" fill="white" stroke="'+color.border+'" stroke-width="3" class="force-strength-grip" data-strength-handle="'+e(force.id)+'"/>'+
  '</g>';
}
function backgroundSVG(change){
 let svg='<defs><pattern id="ff-dot-grid" width="25" height="25" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.15" fill="#9ebbd2" opacity=".27"/></pattern>'+
 '<linearGradient id="ff-left" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#f1f9ff"/><stop offset="100%" stop-color="#e5f2ff"/></linearGradient>'+
 '<linearGradient id="ff-right" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#fff9f0"/><stop offset="100%" stop-color="#fff0e4"/></linearGradient></defs>';
 svg+='<rect x="0" y="0" width="600" height="680" fill="url(#ff-left)"/><rect x="600" y="0" width="600" height="680" fill="url(#ff-right)"/>';
 svg+='<rect x="0" y="0" width="1200" height="680" fill="url(#ff-dot-grid)"/>';
 for(let i=1;i<=4;i++)svg+='<path d="M0 '+(i*136)+' H1200" stroke="#aecada" stroke-dasharray="4 11" stroke-width=".8" opacity=".52"/>';
 svg+='<rect x="561" y="0" width="78" height="680" fill="#fff" opacity=".93"/>';
 svg+='<path d="M600 0 V680" stroke="#c1d0dc" stroke-width="3" stroke-dasharray="9 9"/>';
 svg+='<rect x="555" y="259" width="90" height="165" rx="17" fill="#fff" stroke="#c7d9e8" stroke-width="3"/>';
 svg+='<circle cx="600" cy="287" r="17" fill="#dceefa"/>'+text(600,294,'⇄','text-anchor="middle" font-size="22" font-weight="800" fill="#3b77a4"')+
  text(600,325,'THE','text-anchor="middle" font-size="11" font-weight="800" letter-spacing="1" fill="#537b98"')+
  text(600,344,'CHANGE','text-anchor="middle" font-size="12" font-weight="900" letter-spacing=".65" fill="#255d87"');
 const changeLabel=wrapped(change||'State your desired change',14,3);
 svg+=changeLabel.map((line,i)=>text(600,369+i*16,line,'text-anchor="middle" font-size="10.5" font-weight="720" fill="#637f94"')).join('');
 return svg;
}
export function renderDiagram(project,selected='',scenario=null,{exportMode=false}={}){
 const balance=calculateBalance(project,scenario);
 return '<svg xmlns="http://www.w3.org/2000/svg" id="'+(exportMode?'force-export-svg':'force-svg')+'" viewBox="0 0 1200 680"'+(exportMode?' width="1200" height="680"':'')+' role="img" aria-label="'+e('Force field diagram for '+(project.title||'change')+'; driving '+balance.driving+', restraining '+balance.restraining)+'" tabindex="0">'+
 backgroundSVG(project.change)+project.forces.map(f=>forceSVG(f,exportMode?'':selected,scenario)).join('')+
 '</svg>';
}
export function sidebarHTML(project,selected='',query=''){
 const q=query.trim().toLowerCase();
 return project.forces.filter(f=>(f.label+' '+f.group+' '+f.stakeholder).toLowerCase().includes(q)).map(f=>{
  const c=colorFor(f.color);return '<div class="force-list-row'+(f.id===selected?' selected':'')+'" draggable="true" data-force-row="'+e(f.id)+'">'+
   '<span class="force-bubble '+f.side+'" style="background:'+c.fill+';border-color:'+c.border+'">'+(f.side==='driving'?'+':'−')+'</span>'+
   '<button type="button" data-select-force="'+e(f.id)+'"><strong>'+e(truncate(f.label,38))+'</strong><small>'+e(f.stakeholder||f.group||f.side)+' · '+f.strength+'/5</small></button><span class="grab-bars">⠿</span></div>';
 }).join('')||'<p class="muted">No forces match. Create a driving or restraining force above.</p>';
}
export const optionHTML=(value,label,selected='')=>'<option value="'+e(value)+'"'+(String(selected)===String(value)?' selected':'')+'>'+e(label)+'</option>';
export function scenarioControlsHTML(project,scenario){
 if(!scenario)return '';
 return '<div class="force-shift-columns">'+['driving','restraining'].map(side=>'<section><h4 class="'+side+'">'+(side==='driving'?'＋ Driving forces':'− Restraining forces')+'</h4>'+
  (project.forces.filter(f=>f.side===side).map(f=>{
   const current=effectiveStrength(f,scenario),difference=current-f.strength;
   return '<div class="scenario-force"><div><strong>'+e(f.label)+'</strong><small>Baseline '+f.strength+'/5</small></div>'+
    '<input type="range" data-scenario-force="'+e(f.id)+'" min="0" max="5" step="1" value="'+current+'" aria-label="'+e('What-if intensity for '+f.label)+'">'+
    '<output data-shift-value="'+e(f.id)+'">'+current+'/5'+(difference?' ('+(difference>0?'+':'')+difference+')':'')+'</output></div>';
  }).join('')||'<p class="muted">Add forces to compare this side.</p>')+'</section>').join('')+'</div>';
}
export function actionsHTML(project){
 if(!project.actions.length)return '<div class="empty"><strong>No interventions yet.</strong>Identify a force you can influence, choose a practical intervention and define evidence you will collect.<div><button data-create-action type="button" class="primary">＋ Add first intervention</button></div></div>';
 return project.actions.map(a=>{
  const force=project.forces.find(f=>f.id===a.forceId),late=a.due&&a.due<today()&&a.status!=='Completed';
  return '<article class="action-card'+(late?' overdue':'')+'"><div class="action-heading"><div><span class="eyebrow">'+e(a.method)+'</span><h3>'+e(a.title)+'</h3></div><div><button type="button" data-edit-action="'+e(a.id)+'">✎ Edit</button><button type="button" class="danger" data-delete-action="'+e(a.id)+'" aria-label="Delete action">×</button></div></div>'+
   '<p><strong>Target force:</strong> '+e(force?.label||'General intervention')+'</p>'+
   '<div class="action-badges"><span>Owner: '+e(a.owner||'Unassigned')+'</span><span>Due: '+e(a.due||'Not scheduled')+(late?' · Past target':'')+'</span><span>'+e(a.status)+'</span></div>'+
   (a.metric?'<p><strong>Measure:</strong> '+e(a.metric)+' · Baseline '+e(a.baseline||'—')+' → Target '+e(a.target||'—')+'</p>':'')+
   (a.evidence?'<p><strong>Evidence:</strong> '+e(a.evidence)+'</p>':'')+
   (a.risk?'<p><strong>Risks / trade-offs:</strong> '+e(a.risk)+'</p>':'')+
   (a.result?'<p><strong>Observed outcome:</strong> '+e(a.result)+'</p>':'')+
   '<label>Status <select data-action-status="'+e(a.id)+'">'+['Planned','In progress','Completed','Paused'].map(t=>optionHTML(t,t,a.status)).join('')+'</select></label></article>';
 }).join('');
}
export function teamsHTML(project){
 if(!project.teams.length)return '<div class="empty"><strong>No teams added.</strong>Add a team and record its intervention proposal, supporting evidence and trade-offs. The facilitator assigns rubric points.</div>';
 return teamRanking(project).map((t,i)=>{
  return '<article class="team-card"><div class="team-heading"><span class="rank-tag">#'+(i+1)+'</span><div><strong>'+e(t.name)+'</strong><small>'+e(truncate(t.proposal||'Proposal not recorded',155))+'</small></div><span class="team-points">'+t.rating.total+'/20</span><button type="button" data-edit-team="'+e(t.id)+'">Edit</button><button type="button" data-delete-team="'+e(t.id)+'" class="danger">×</button></div>'+
   '<div class="team-score-row">'+[['impact','Impact'],['feasibility','Feasibility'],['evidence','Evidence'],['stakeholder','Stakeholders']].map(([key,name])=>
    '<label>'+name+'<select data-team-score="'+e(t.id)+'" data-score-key="'+key+'">'+[0,1,2,3,4,5].map(x=>optionHTML(String(x),String(x),String(t.scores[key]))).join('')+'</select></label>').join('')+'</div>'+
   (t.evidence?'<p class="muted"><strong>Evidence:</strong> '+e(t.evidence)+'</p>':'')+
   (t.tradeoffs?'<p class="muted"><strong>Trade-offs:</strong> '+e(t.tradeoffs)+'</p>':'')+'</article>';
 }).join('');
}
const reportTable=(heads,rows)=>rows.length?'<table><thead><tr>'+heads.map(x=>'<th>'+e(x)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map(x=>'<td>'+e(x??'—')+'</td>').join('')+'</tr>').join('')+'</tbody></table>':'<p>No records.</p>';
export function reportHTML(project){
 const baseline=calculateBalance(project),scenarios=project.scenarios.map(s=>({scenario:s,result:calculateBalance(project,s)}));
 return '<header><small>MAYNE LEADERSHIP · FORCE FIELD ANALYSIS STUDIO</small><h1>'+e(project.title)+'</h1><p>'+e(project.change||'Change not stated')+' · '+e(new Date().toLocaleDateString())+'</p></header>'+
  '<section><h2>Visual force field</h2>'+renderDiagram(project,'',null,{exportMode:true})+'</section>'+
  '<section><h2>Force balance</h2><p>Driving '+baseline.driving+' · Restraining '+baseline.restraining+' · Net '+baseline.net+'. These are subjective force ratings; not outcome probabilities.</p>'+
   reportTable(['Type','Force','Strength','Stakeholder','Interest or concern','Confidence','Evidence'],project.forces.map(f=>[f.side,f.label,f.strength,f.stakeholder,f.stakeholderInterest,f.confidence,f.evidence]))+'</section>'+
  '<section><h2>What-if scenarios</h2>'+reportTable(['Scenario','Assumptions','Driving','Restraining','Net'],scenarios.map(x=>[x.scenario.title,x.scenario.description,x.result.driving,x.result.restraining,x.result.net]))+'</section>'+
  '<section><h2>Change actions</h2>'+reportTable(['Intervention','Method','Force','Owner','Target date','Metric','Target','Status','Result'],project.actions.map(a=>[a.title,a.method,project.forces.find(x=>x.id===a.forceId)?.label||'',a.owner,a.due,a.metric,a.target,a.status,a.result]))+'</section>'+
  '<section><h2>Classroom challenge</h2>'+reportTable(['Team','Proposal','Impact','Feasibility','Evidence','Stakeholder awareness','Total'],teamRanking(project).map(x=>[x.name,x.proposal,x.scores.impact,x.scores.feasibility,x.scores.evidence,x.scores.stakeholder,x.rating.total]))+'</section>'+
  '<section><h2>Investigation notes</h2><p><strong>Objective:</strong> '+e(project.goal)+'</p><p><strong>Context:</strong> '+e(project.context)+'</p><p><strong>Owner:</strong> '+e(project.owner)+'</p><p><strong>Review date:</strong> '+e(project.reviewDate)+'</p></section>';
}
