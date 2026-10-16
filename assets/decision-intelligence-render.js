import {TYPES,TAGS,RISK_STATUSES,RUBRIC,escapeHTML as e,clamp,scoreMatrix,evaluateTree,probabilityStatus,activeScenario,sensitivity,rankedTeams,teamScore,today} from './decision-intelligence-model.js';
export const trim=(text,max=100)=>String(text??'').length>max?String(text).slice(0,max-1)+'…':String(text??'');
export const option=(value,label,selected)=>'<option value="'+e(value)+'"'+(String(value)===String(selected)?' selected':'')+'>'+e(label)+'</option>';
export const empty=(title,description,button='',selector='')=>'<div class="empty"><strong>'+e(title)+'</strong><p>'+e(description)+'</p>'+(button?'<button type="button" class="primary" data-'+selector+'>'+e(button)+'</button>':'')+'</div>';
const bar=(v,max=5)=>'<div class="score-bar"><span style="width:'+Math.max(0,Math.min(100,100*(v||0)/max))+'%"></span></div>';
const stat=(name,val)=>'<div><strong>'+val+'</strong><small>'+e(name)+'</small></div>';
export function statsHTML(p){const tree=evaluateTree(p),matrix=scoreMatrix(p);return stat('Alternatives',p.options.length)+stat('Tree nodes',p.nodes.length)+stat('Pre-mortem risks',p.risks.length)+stat('Matrix leader',matrix.ranking[0]?.score?.toFixed(2)??'—')}
function chosen(n,selected){return n.id===selected?' selected':''}
export function treeNodesHTML(p,selected='',scenario=null){
 const evaluated=evaluateTree(p,scenario);
 return p.nodes.map(n=>{
  const value=evaluated.values.get(n.id),prob=scenario&&Object.hasOwn(scenario.probabilityOverrides,n.id)?scenario.probabilityOverrides[n.id]:n.probability;
  const utility=scenario&&Object.hasOwn(scenario.utilityOverrides,n.id)?scenario.utilityOverrides[n.id]:n.utility;
  const parent=p.nodes.find(x=>x.id===n.parentId);
  return '<article tabindex="0" class="tree-node '+n.type+chosen(n,selected)+'" data-node="'+e(n.id)+'" style="left:'+n.x+'px;top:'+n.y+'px;width:'+n.w+'px;min-height:'+n.h+'px" aria-label="'+e(n.type+' node: '+n.title)+'">'+
   '<div class="node-top"><span class="node-kind">'+(n.type==='decision'?'◆ Decision':n.type==='chance'?'◇ Chance':'● Outcome')+'</span><span class="node-grip" data-move-node="'+e(n.id)+'" role="button" tabindex="0" aria-label="'+e('Drag '+n.title)+'">⠿</span>'+(n.type!=='outcome'?'<span data-connect-node="'+e(n.id)+'" role="button" tabindex="0" class="node-connect" aria-label="Drag to connect another node as a child" title="Drag to connect a branch">↗</span>':'')+'</div>'+
   '<textarea rows="2" data-inline-title="'+e(n.id)+'" aria-label="'+e('Edit node title '+n.title)+'" class="node-input" maxlength="180">'+e(n.title)+'</textarea>'+
   '<div class="node-footer"><span class="node-badge '+e(n.evidenceTag)+'">'+e(n.evidenceTag)+'</span>'+
   '<strong>'+(n.type==='outcome'?'Value '+utility:n.type==='chance'?(value===null?'Unresolved':'EV '+Number(value.toFixed(2))):value===null?'Unresolved':'Best '+Number(value.toFixed(2)))+'</strong>'+
   (n.type==='outcome'?'':'<button type="button" data-add-branch="'+e(n.id)+'" aria-label="Add branch">＋</button>')+'</div>'+
   (parent?.type==='chance'?'<div class="node-footer"><span class="node-badge">P = '+prob+'%</span></div>':'')+'<span class="node-resize" data-resize-node="'+e(n.id)+'" role="button" tabindex="0" title="Drag to resize card" aria-label="Resize decision card">◢</span></article>';
 }).join('');
}
function pathFor(a,b){const ax=a.x+(a.w||224)/2,bx=b.x-(b.w||224)/2;return 'M'+ax+' '+a.y+' C'+(ax+Math.max(40,(bx-ax)*.44))+' '+a.y+', '+(bx-Math.max(40,(bx-ax)*.44))+' '+b.y+', '+bx+' '+b.y;}
export function treeLinksHTML(p,scenario=null){
 return '<defs><marker id="di-arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 Z" fill="#87a8be"/></marker></defs>'+
 p.nodes.filter(n=>n.parentId).map(n=>{
  const parent=p.nodes.find(x=>x.id===n.parentId);if(!parent)return '';
  const status=parent.type==='chance'?probabilityStatus(p,parent.id,scenario):null;
  return '<path d="'+pathFor(parent,n)+'" fill="none" stroke="'+(status&&!status.valid?'#cc8a6b':'#86a8c0')+'" stroke-width="3" marker-end="url(#di-arrow)" stroke-linecap="round"/>';
 }).join('');
}
const wrap=(str,max=23,limit=3)=>{
 const words=String(str||'').split(/\s+/),lines=[];let line='';
 for(const word of words){if((line+' '+word).trim().length>max&&line){lines.push(line);line=word}else line=(line+' '+word).trim()}
 if(line)lines.push(line);if(lines.length>limit){const v=lines.slice(0,limit);v[limit-1]=trim(lines.slice(limit-1).join(' '),max);return v}
 return lines;
};
export function diagramSVG(p,scenario=null){
 const fills={decision:'#e3f2ff',chance:'#fff0d4',outcome:'#e3f5ec'},stroke={decision:'#6fa0c5',chance:'#d7ab61',outcome:'#73b39a'};
 let svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1900 1520" width="1900" height="1520" role="img" aria-label="Decision tree for '+e(p.title)+'"><rect width="1900" height="1520" fill="#f8fcff"/>';
 for(let x=20;x<=1880;x+=30)for(let y=20;y<=1500;y+=30)svg+='<circle cx="'+x+'" cy="'+y+'" r="1" fill="#d5e4f0"/>';
 svg+=treeLinksHTML(p,scenario);
 const results=evaluateTree(p,scenario);
 for(const n of p.nodes){
  const c=fills[n.type],s=stroke[n.type],lines=wrap(n.title,28,3);
  svg+='<rect x="'+(n.x-(n.w||224)/2)+'" y="'+(n.y-(n.h||125)/2)+'" width="'+(n.w||224)+'" height="'+(n.h||125)+'" rx="12" fill="'+c+'" stroke="'+s+'" stroke-width="2"/>'+
   '<text x="'+(n.x-(n.w||224)/2+14)+'" y="'+(n.y-(n.h||125)/2+24)+'" fill="#4d6d84" font-size="11" font-weight="800">'+e(n.type.toUpperCase())+'</text>';
  lines.forEach((line,i)=>{svg+='<text x="'+n.x+'" y="'+(n.y-13+i*17)+'" fill="#244f6c" font-size="13" font-weight="740" text-anchor="middle">'+e(line)+'</text>'});
  const value=results.values.get(n.id);
  svg+='<text x="'+n.x+'" y="'+(n.y+(n.h||125)/2-12)+'" fill="#436b82" font-size="10" text-anchor="middle">'+e(n.type==='outcome'?'Utility '+n.utility:value===null?'Incomplete':'Expected '+Number(value.toFixed(2)))+'</text>';
 }
 return svg+'</svg>';
}
export function treeResultsHTML(p,scenario=null){
 const v=evaluateTree(p,scenario);
 return '<div><strong>Tree evaluation</strong><div class="node-metric">'+(v.rootValue===null?'Incomplete':Number(v.rootValue.toFixed(2)))+'</div>'+
 '<p>The root uses a maximum-value rule at decision nodes and an expected-value rule at chance nodes. Higher utility means more preferred.</p></div>'+
 '<div><strong>Calculation checks</strong>'+(v.warnings.length?'<ul class="warning-list">'+v.warnings.slice(0,12).map(w=>'<li>'+e(w)+'</li>').join('')+'</ul>':'<p>All evaluated branches are complete. Double-check probabilities, assumptions, scale, and evidence before relying on these values.</p>')+'</div>';
}
export function criteriaHTML(p){
 return p.criteria.length?'<div class="criteria-panel">'+p.criteria.map(c=>
 '<div class="criterion"><div class="criterion-top"><strong>'+e(c.name)+'</strong><span>'+e(c.direction)+'</span>'+
 '<div class="criterion-actions"><button type="button" data-edit-criterion="'+e(c.id)+'">Edit</button><button class="danger" type="button" data-remove-criterion="'+e(c.id)+'">×</button></div></div>'+
 '<div class="criterion-slider"><input data-weight="'+e(c.id)+'" type="range" min="0" max="100" step="5" value="'+c.weight+'" aria-label="'+e('Weight for '+c.name)+'"><output>'+c.weight+'</output></div></div>').join('')+'</div>':
 empty('Add comparison criteria','Start with effectiveness, feasibility, risk or any criterion relevant to your decision.','＋ First criterion','new-criterion');
}
export function rankingHTML(p,scenario=null){
 const r=scoreMatrix(p,scenario);
 if(!r.valid)return empty('No comparable scores yet','Add at least one criterion and one option, and give a positive weight to at least one criterion.');
 return '<div class="rank-panel"><div class="section-head"><h3>Weighted ranking</h3><span class="tag">Weight total '+r.weightTotal+'</span></div>'+
 '<div class="rank-list">'+r.ranking.map((o,i)=>
 '<div class="rank-item'+(i===0?' first':'')+'"><b>#'+(i+1)+'</b><strong>'+e(o.name)+'</strong>'+bar(o.score)+'<b>'+(o.score===null?'—':o.score.toFixed(2))+'</b></div>').join('')+'</div>'+
 '<p class="muted">The score is a normalized weighted average of 1–5 ratings, with cost criteria reversed. Rankings are based on the estimates entered.</p></div>';
}
export function matrixHTML(p){
 if(!p.options.length||!p.criteria.length)return empty('Build a comparison matrix','Create alternative courses of action and criteria, then rate each combination.');
 const cols=p.criteria.map(c=>'<th>'+e(trim(c.name,35))+'<small> · '+e(c.direction)+'</small></th>').join('');
 const scores=new Map(scoreMatrix(p).ranking.map(x=>[x.id,x.score]));
 return '<div class="matrix-table-wrap"><table class="data-table"><thead><tr><th>Alternative</th>'+cols+'<th>Score</th><th>Edit</th></tr></thead><tbody>'+
 p.options.map(o=>'<tr><td class="option-name">'+e(o.name)+'</td>'+
 p.criteria.map(c=>{
  const r=o.ratings[c.id]||{score:3,tag:'Assumption'};
  return '<td><div class="score-cell"><select data-rating="'+e(o.id)+'" data-criterion="'+e(c.id)+'" aria-label="'+e(o.name+' · '+c.name)+'">'+[1,2,3,4,5].map(v=>option(v,v,r.score)).join('')+'</select>'+
   '<button type="button" data-evidence-option="'+e(o.id)+'" data-evidence-criterion="'+e(c.id)+'" title="Edit evidence">'+e(r.tag)+' ✎</button></div></td>';
 }).join('')+
 '<td><b>'+(scores.get(o.id)?.toFixed(2)||'—')+'</b></td><td><button data-edit-option="'+e(o.id)+'" type="button">Edit</button> <button data-remove-option="'+e(o.id)+'" class="danger" type="button">×</button></td></tr>').join('')+
 '</tbody></table></div>';
}
const scenarioSlider=(label,value,dataAttrs,max=100,min=0,step=1)=>'<div class="scenario-control"><label>'+e(label)+'</label><input '+dataAttrs+' type="range" min="'+min+'" max="'+max+'" step="'+step+'" value="'+value+'"><output>'+value+'</output></div>';
export function scenarioControlsHTML(p,s){
 if(!s)return '';
 const weight='<div class="slider-grid">'+p.criteria.map(c=>scenarioSlider(c.name,s.weightShifts[c.id]??c.weight,'data-scenario-weight="'+e(c.id)+'"',100,0,5)).join('')+'</div>';
 const score='<div class="slider-grid">'+p.options.flatMap(o=>p.criteria.map(c=>{
  const v=s.scoreShifts[o.id]?.[c.id]??o.ratings[c.id]?.score??3;
  return scenarioSlider(o.name+' · '+c.name,v,'data-scenario-score="'+e(o.id)+'" data-scenario-criterion="'+e(c.id)+'"',5,1,1);
 })).join('')+'</div>';
 const tree='<div class="slider-grid">'+p.nodes.flatMap(n=>{
  const controls=[];
  if(p.nodes.some(x=>x.parentId===n.id)&&n.type==='chance'){
   for(const child of p.nodes.filter(c=>c.parentId===n.id))controls.push(scenarioSlider('P('+child.title+')',s.probabilityOverrides[child.id]??child.probability,'data-scenario-probability="'+e(child.id)+'"',100,0,5));
  }
  if(n.type==='outcome')controls.push('<div class="scenario-control"><label>'+e(n.title)+' · Utility</label><input type="number" min="-1000000" max="1000000" data-scenario-utility="'+e(n.id)+'" value="'+(s.utilityOverrides[n.id]??n.utility)+'"></div>');
  return controls;
 }).join('')+'</div>';
 return {weight,score,tree};
}
export function scenarioResultsHTML(p,s){
 const base=scoreMatrix(p),changed=scoreMatrix(p,s),treeBase=evaluateTree(p),treeChanged=evaluateTree(p,s),sensitivityResult=sensitivity(p,10);
 const first=arr=>arr.ranking[0]?.name||'Not evaluated';
 const cv=v=>v===null?'Incomplete':Number(v.toFixed(2));
 return '<div class="scenario-result-grid"><div><h4>Matrix: baseline vs. what-if</h4><p><strong>'+e(first(base))+'</strong> → <strong>'+e(first(changed))+'</strong></p><p class="muted">Compare rankings below. Scenario ratings never replace the baseline.</p></div>'+
 '<div><h4>Decision tree: baseline vs. what-if</h4><p><strong>'+cv(treeBase.rootValue)+'</strong> → <strong>'+cv(treeChanged.rootValue)+'</strong></p>'+
 (treeChanged.warnings.length?'<p class="muted">Check scenario chance probabilities; invalid branches are not evaluated.</p>':'')+'</div></div>'+
 rankingHTML(p,s)+'<div class="data-card"><strong>Sensitivity check · ±10 weight points per criterion</strong>'+
 (sensitivityResult.base?(sensitivityResult.stable?'<p class="muted">Top-ranked baseline option stays first under tested single-weight adjustments. This does not prove robustness to all scenarios.</p>':
 '<p class="muted">Ranking can change when '+e([...new Set(sensitivityResult.flips.map(f=>f.criterion))].join(', '))+' weights shift.</p>'):'<p class="muted">Add comparison criteria and options to test sensitivity.</p>')+'</div>';
}
export function risksHTML(p){
 return p.risks.length?[...p.risks].sort((a,b)=>b.likelihood*b.impact-a.likelihood*a.impact).map(r=>{
  const score=r.likelihood*r.impact;
  return '<article class="risk-card'+(score>=15?' high':'')+'"><header><div><span class="tag">'+score+'/25 risk score</span><h3>'+e(r.failure)+'</h3></div>'+
  '<div class="card-actions"><button data-edit-risk="'+e(r.id)+'" type="button">Edit</button><button data-remove-risk="'+e(r.id)+'" class="danger" type="button">×</button></div></header>'+
  '<div class="meta"><span>Likelihood '+r.likelihood+'/5</span><span>Impact '+r.impact+'/5</span><span>Owner '+e(r.owner||'Unassigned')+'</span></div>'+
  '<p><strong>Warning:</strong> '+e(r.warning||'Not defined')+'</p><p><strong>Safeguard:</strong> '+e(r.safeguard||'Not defined')+'</p>'+
  '<label class="muted">Status <select data-risk-status="'+e(r.id)+'">'+RISK_STATUSES.map(v=>option(v,v,r.status)).join('')+'</select></label></article>';
 }).join(''):empty('No potential failures recorded','Imagine the decision failed. What evidence would reveal the problem early?','＋ Add possible failure','new-risk');
}
export function briefPreviewHTML(p){
 const winner=scoreMatrix(p).ranking[0],recommend=p.options.find(o=>o.id===p.brief.recommendationId);
 const warnings=evaluateTree(p).warnings.length;
 return '<div class="brief-preview"><span class="eyebrow">EXECUTIVE DECISION OVERVIEW</span><h3>'+e(p.question||p.title)+'</h3>'+
 '<p>'+e(p.objective||'Define the outcome you want to achieve.')+'</p>'+
 '<div class="brief-rows"><div><strong>Recommended course</strong><p>'+e(recommend?.name||'Not selected')+'</p></div>'+
 '<div><strong>Matrix front-runner</strong><p>'+e(winner?.name||'Not rated')+'</p></div>'+
 '<div><strong>Accountable owner</strong><p>'+e(p.brief.accountable||p.owner||'Not assigned')+'</p></div>'+
 '<div><strong>Decision stage</strong><p>'+e(p.status)+'</p></div></div>'+
 '<p><strong>Reasoning:</strong> '+e(p.brief.recommendation||'Recommendation not written.')+'</p>'+
 '<p><strong>Counterargument:</strong> '+e(p.brief.dissent||'Dissenting views not recorded.')+'</p>'+
 '<p><strong>Revisit if:</strong> '+e(p.brief.reviewTrigger||'Review trigger not set.')+'</p>'+
 '<p class="muted">Evidence limitations: '+warnings+' tree warning(s) · '+p.risks.filter(x=>x.status!=='Closed').length+' open pre-mortem risk(s). The top-ranked option is not automatically the decision.</p></div>';
}
export function decisionLogHTML(p){
 return p.decisions.length?p.decisions.map(d=>
 '<article class="decision-card"><header><div><span class="tag">'+e(d.date)+'</span><h3>'+e(d.decision)+'</h3></div><div class="card-actions"><button data-edit-decision="'+e(d.id)+'" type="button">Edit</button><button data-remove-decision="'+e(d.id)+'" class="danger" type="button">×</button></div></header>'+
 '<p><strong>Owner:</strong> '+e(d.owner||'Unassigned')+' · <strong>Review:</strong> '+e(d.reviewOn||'Unscheduled')+'</p>'+
 '<p><strong>Rationale:</strong> '+e(d.hypothesis||'Not recorded')+'</p><p><strong>Observed outcome:</strong> '+e(d.outcome||'Awaiting review')+'</p></article>').join(''):
 empty('No decisions logged yet','Record a decision with an owner, expected benefit, and a scheduled check-in.','＋ Record decision','new-decision');
}
export function teamsHTML(p){
 return p.teams.length?rankedTeams(p).map((t,i)=>
 '<article class="team-card"><header><div><span class="tag">#'+(i+1)+'</span><h3>'+e(t.name)+'</h3></div><span class="team-points">'+teamScore(t)+'/20</span><div class="card-actions"><button data-edit-team="'+e(t.id)+'" type="button">Edit</button><button data-remove-team="'+e(t.id)+'" class="danger" type="button">×</button></div></header>'+
 '<p>'+e(t.recommendation||'Recommendation not yet submitted.')+'</p>'+
 '<div class="team-score-row">'+RUBRIC.map(k=>
 '<label>'+e(k[0].toUpperCase()+k.slice(1))+'<select data-team-score="'+e(t.id)+'" data-rubric="'+k+'">'+[0,1,2,3,4,5].map(v=>option(v,v,t.scores[k])).join('')+'</select></label>').join('')+'</div>'+
 '<p class="muted"><strong>Evidence:</strong> '+e(t.evidence||'Not recorded')+'</p>'+
 '<p class="muted"><strong>Trade-offs:</strong> '+e(t.tradeoffs||'Not recorded')+'</p></article>').join(''):
 empty('Add competing team recommendations','Teams defend their chosen course of action; the facilitator scores evidence, trade-offs, adaptability and reasoning.','＋ First team','new-team');
}
export function injectsHTML(p){
 return p.injects.length?p.injects.map(n=>
 '<article class="inject-card'+(n.revealed?' revealed':'')+'"><header><div><span class="tag">'+(n.revealed?'Released':'Hidden')+'</span><h3>'+e(n.title)+'</h3></div>'+
 '<div class="card-actions"><button data-reveal-inject="'+e(n.id)+'" type="button">'+(n.revealed?'Hide':'Reveal')+'</button><button data-edit-inject="'+e(n.id)+'" type="button">Edit</button><button data-remove-inject="'+e(n.id)+'" class="danger" type="button">×</button></div></header>'+
 (n.revealed?'<p class="inject-message">'+e(n.message)+'</p>':'<p class="muted">Surprise inject hidden until the facilitator reveals it.</p>')+'</article>').join(''):
 empty('No surprise injects yet','Introduce new facts, failed assumptions, budget changes or time pressure during the challenge.','＋ Create first inject','new-inject');
}
const reportTable=(heads,rows)=>rows.length?'<table><thead><tr>'+heads.map(x=>'<th>'+e(x)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map(x=>'<td>'+e(x??'')+'</td>').join('')+'</tr>').join('')+'</tbody></table>':'<p>No entries recorded.</p>';
export function reportHTML(p){
 const ranked=scoreMatrix(p).ranking;
 return '<header><small>MAYNE LEADERSHIP · DECISION INTELLIGENCE STUDIO</small><h1>'+e(p.title)+'</h1><p>'+e(p.question)+'</p><p>Owner: '+e(p.owner)+' · '+e(p.status)+' · '+e(new Date().toLocaleDateString())+'</p></header>'+
 '<section><h2>Decision context and recommendation</h2><p><strong>Objective:</strong> '+e(p.objective)+'</p><p>'+e(p.context)+'</p>'+
 '<p><strong>Recommendation:</strong> '+e(p.options.find(o=>o.id===p.brief.recommendationId)?.name||'Unselected')+'</p>'+
 '<p>'+e(p.brief.recommendation)+'</p><p><strong>Counterarguments:</strong> '+e(p.brief.dissent)+'</p><p><strong>Assumptions:</strong> '+e(p.brief.assumptions)+'</p>'+
 '<p><strong>Triggers:</strong> '+e(p.brief.reviewTrigger)+'</p><p><strong>Observed result:</strong> '+e(p.brief.result)+'</p></section>'+
 '<section><h2>Branching decision analysis</h2>'+diagramSVG(p)+'<p>Tree values are utilities/preferences with higher values preferred; chance probabilities must sum to 100%. Invalid or missing branches cannot be evaluated.</p></section>'+
 '<section><h2>Weighted decision comparison</h2>'+reportTable(['Criterion','Weight','Direction'],p.criteria.map(c=>[c.name,c.weight,c.direction]))+
 reportTable(['Option','Weighted score','Evidence tags'],ranked.map(o=>[o.name,o.score===null?'Incomplete':o.score.toFixed(2),p.criteria.map(c=>c.name+': '+(o.ratings[c.id]?.tag||'Unknown')).join('; ')]))+'</section>'+
 '<section><h2>What-if scenarios</h2>'+reportTable(['Scenario','Description','Top option','Tree root value'],p.scenarios.map(s=>[s.title,s.description,scoreMatrix(p,s).ranking[0]?.name||'—',evaluateTree(p,s).rootValue??'Incomplete']))+'</section>'+
 '<section><h2>Pre-mortem</h2>'+reportTable(['Potential failure','Likelihood','Impact','Warning','Safeguard','Owner'],p.risks.map(r=>[r.failure,r.likelihood,r.impact,r.warning,r.safeguard,r.owner]))+'</section>'+
 '<section><h2>Decision log</h2>'+reportTable(['Date','Decision','Owner','Review','Outcome'],p.decisions.map(d=>[d.date,d.decision,d.owner,d.reviewOn,d.outcome]))+'</section>'+
 '<section><h2>Classroom challenge</h2>'+reportTable(['Team','Recommendation','Score /20','Evidence','Trade-offs'],rankedTeams(p).map(t=>[t.name,t.recommendation,teamScore(t),t.evidence,t.tradeoffs]))+'</section>';
}
