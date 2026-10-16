import {esc,analysis,paretoAnalysis,STAGES} from './root-cause-model.js';
export const VIEWS={problem:['FRAME THE PROBLEM','Problem definition'],whys:['QUESTION ASSUMPTIONS','The 5 Whys'],fishbone:['ORGANIZE CONTRIBUTING FACTORS','Fishbone diagram'],tree:['MAP CAUSAL HYPOTHESES','Cause-and-effect tree'],pareto:['PRIORITIZE RECORDED ISSUES','Pareto analysis'],evidence:['CHALLENGE EXPLANATIONS','Evidence evaluator'],actions:['DESIGN INTERVENTIONS','Solutions and monitoring']};
const pill=(x,k='')=>'<span class="pill '+k+'">'+esc(x)+'</span>';
export const button=(label,action,attrs='',cls='')=>'<button type="button" data-action="'+action+'" '+attrs+' class="'+cls+'">'+label+'</button>';
const panel=(h,sub,body,actions='')=>'<section class="panel"><div class="panel-header"><div><h3>'+h+'</h3><p class="subheading">'+sub+'</p></div><div class="panel-actions">'+actions+'</div></div>'+body+'</section>';
const empty=(glyph,title,description,action,text)=>'<div class="empty"><div class="empty-icon">'+glyph+'</div><h3>'+title+'</h3><p>'+description+'</p>'+button(text,action,'','primary')+'</div>';
const field=(label,key,val,type='text',extra='',options=null)=>'<div class="field '+(type==='textarea'?'full':'')+'"><label>'+esc(label)+'</label>'+(
type==='textarea'?'<textarea data-case-field="'+key+'" maxlength="7000">'+esc(val)+'</textarea>':
type==='select'?'<select data-case-field="'+key+'">'+options.map(o=>'<option '+(o===val?'selected':'')+' value="'+esc(o)+'">'+esc(o)+'</option>').join('')+'</select>':
'<input type="'+type+'" data-case-field="'+key+'" value="'+esc(val)+'" maxlength="2200">'
)+(extra?'<small>'+esc(extra)+'</small>':'')+'</div>';
const category=(c,id)=>c.categories.find(cat=>cat.id===id)?.name||'Uncategorized';
const causeBadge=(c,item)=>pill(category(c,item.category))+pill(item.status,item.status==='Supported'?'green':item.status==='Refuted'?'red':'')+(item.root?pill('Root candidate','gold'):'')+(c.evidence.some(e=>e.causeId===item.id)?pill('Evidence linked'):'');
function nested(c,parent='',level=0,visited=new Set(),mode='whys'){
 if(level>25)return '';
 const nodes=c.causes.filter(item=>(item.parentId||'')===parent&&!visited.has(item.id));
 if(!nodes.length)return '';
 return '<ul class="branch-list">'+nodes.map(item=>{
  const trail=new Set(visited);trail.add(item.id);
  return '<li><div class="branch-card '+(item.root?'root':'')+'"><div class="branch-title"><span class="branch-indent">'+(mode==='whys'?'WHY '+(level+1):'LEVEL '+(level+1))+'</span>'+
  '<input type="text" maxlength="220" data-cause-text="'+esc(item.id)+'" aria-label="Edit possible cause" value="'+esc(item.text)+'" placeholder="Possible explanation"></div>'+
  '<div class="branch-status">'+causeBadge(c,item)+'</div><div class="branch-tools">'+
  button('＋ Why?','add-child','data-id="'+esc(item.id)+'"')+
  button('✎ Edit','edit-cause','data-id="'+esc(item.id)+'"')+
  button(item.root?'★ Unmark root':'☆ Root candidate','toggle-root','data-id="'+esc(item.id)+'"')+
  button('Evidence','add-evidence','data-cause-id="'+esc(item.id)+'"')+
  button('×','delete-cause','data-id="'+esc(item.id)+'" aria-label="Delete cause"','danger')+'</div></div>'+
  nested(c,item.id,level+1,trail,mode)+'</li>';
 }).join('')+'</ul>';
}
function problem(c){
 const content='<div class="field-grid">'+
 field('What is actually happening?','problem',c.problem,'textarea','State what can be observed, not a presumed cause.')+
 field('Where?','where',c.where)+field('When or during what period?','when',c.when)+
 field('How frequently?','frequency',c.frequency)+field('Who or what is affected?','impact',c.impact)+
 field('Investigation boundaries','boundary',c.boundary,'textarea')+
 field('What measurable improvement do you want?','goal',c.goal,'textarea')+'</div>';
 const details='<div class="field-grid">'+
 field('Investigation leader','owner',c.owner)+field('Next review date','nextReview',c.nextReview,'date')+
 field('Status','status',c.status,'select','',['Investigating','Action planned','Monitoring','Closed'])+
 field('Current findings','summary',c.summary,'textarea')+
 field('What remains uncertain?','assumptions',c.assumptions,'textarea')+'</div>';
 const logs=c.observations.map(x=>'<div class="record"><div class="record-main"><strong class="record-title">'+esc(x.date)+'</strong><p class="record-sub">'+esc(x.note)+'</p></div><div class="record-actions">'+button('Edit','edit-note','data-id="'+esc(x.id)+'"','mini')+button('×','delete-note','data-id="'+esc(x.id)+'"','icon-button')+'</div></div>').join('');
 return panel('01 · Define the problem','A precise problem statement is the starting point for causal investigation.',content)+
 panel('02 · Establish purpose','Specify what you want to improve, who owns the investigation, and when to reassess.',details)+
 panel('03 · Observation log','Keep a record of facts, interviews, and review notes.',logs?'<div class="records">'+logs+'</div>':empty('◷','No observations yet','Document an observation without interpreting it as proof.','add-note','Record an observation'),button('＋ Add observation','add-note','','primary'))+
 '<div class="note">Next: try the 5 Whys to explore several explanations. The same cause records are shared across 5 Whys, fishbone, and cause tree.</div>';
}
function whys(c){
 const a=analysis(c);
 return panel('Ask Why — explore multiple paths','Branching is encouraged. Five is a prompt, not a limit, and deeper chains do not prove a cause.',
 '<div class="note"><strong>Investigated problem:</strong> '+esc(c.problem||'Not yet defined. Open the Problem tab to add it.')+'</div>'+
 (c.causes.length?nested(c):empty('↳','Begin the first Why','What condition could explain the observed problem?','add-cause','Add first possible cause'))+
 '<div class="panel-actions" style="justify-content:flex-start;margin-top:18px">'+button('＋ Another explanation','add-cause','','primary')+button('View cause tree','go-tree')+'</div>')+
 panel('Depth check','Follow the evidence rather than chasing an arbitrary number of questions.','<div class="note gold">Longest current chain: <strong>'+a.deepestChain+' level(s)</strong>. Use evidence records to determine whether suspected factors are supported or contradicted.</div>');
}
function tree(c){
 return panel('Connected cause tree','Each branch represents a suspected explanation. Child causes describe possible reasons for their parent.',
 '<div class="note"><strong>Effect:</strong> '+esc(c.problem||'Problem not yet defined')+'</div>'+
 (c.causes.length?nested(c,'',0,new Set(),'tree'):empty('⑂','Nothing mapped yet','Add a suspected cause to begin a visual cause tree.','add-cause','Add cause'))+
 '<div class="panel-actions" style="justify-content:flex-start;margin-top:18px">'+button('＋ Add a main cause','add-cause','','primary')+button('Open 5 Whys','go-whys')+'</div>');
}
export function fishboneSVG(c){
 const cats=c.categories,half=Math.ceil(cats.length/2),width=Math.max(1170,half*260+350),height=610;
 let output='<svg id="fishbone-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+width+' '+height+'" role="img" aria-label="Fishbone diagram for '+esc(c.problem||'the current investigation')+'"><defs><marker id="bone-tip" markerWidth="9" markerHeight="9" refX="8" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8 Z" fill="#3777a1"/></marker></defs>';
 output+='<path d="M65 305 H'+(width-241)+'" stroke="#3777a1" stroke-width="6" fill="none" marker-end="url(#bone-tip)"/>';
 cats.forEach((cat,index)=>{
  const top=index<half,n=top?index:index-half,bx=221+n*260,ax=bx-100,ay=top?120:476,cy=top?55:495;
  output+='<path d="M'+ax+' '+ay+' L'+bx+' 305" fill="none" stroke="#80a9c4" stroke-width="4" stroke-linecap="round"/>';
  output+='<rect x="'+(ax-88)+'" y="'+cy+'" width="178" height="40" rx="12" fill="#e4f1fb" stroke="#bfd7e8"/><text x="'+ax+'" y="'+(cy+26)+'" font-size="15" font-weight="750" fill="#1a5b87" text-anchor="middle">'+esc(cat.name.slice(0,25))+'</text>';
  const items=c.causes.filter(x=>x.category===cat.id&&x.status!=='Refuted');
  items.slice(0,4).forEach((item,i)=>{
   const x=ax-16+i*14,y=top?135+i*34:466-i*34;
   const text=item.text.trim()||'Unspecified cause';
   output+='<g tabindex="0" role="button" data-visual-cause="'+esc(item.id)+'" aria-label="Edit cause '+esc(text)+'"><rect x="'+x+'" y="'+(y-17)+'" width="222" height="29" rx="8" fill="'+(item.root?'#fff3d8':'#fff')+'" stroke="'+(item.root?'#d8aa52':'#c6ddeb')+'"/><text x="'+(x+10)+'" y="'+(y+2)+'" font-size="12" fill="#2f5870">'+esc(text.length>29?text.slice(0,28)+'…':text)+'</text></g>';
  });
  if(items.length>4)output+='<text x="'+ax+'" y="'+(top?285:333)+'" font-size="11" fill="#647f95">+'+(items.length-4)+' more causes below</text>';
 });
 output+='<rect x="'+(width-235)+'" y="250" width="223" height="112" rx="16" fill="#225e8b" stroke="#17466a" stroke-width="2"/>';
 const str=(c.problem||'Define the problem').trim();
 output+='<text x="'+(width-124)+'" y="277" text-anchor="middle" fill="#b9e0f1" font-size="12" font-weight="700">PROBLEM / EFFECT</text>';
 [str.slice(0,29),str.slice(29,58),str.slice(58,84)].filter(Boolean).forEach((line,i)=>output+='<text x="'+(width-124)+'" y="'+(299+i*20)+'" text-anchor="middle" font-size="12" fill="#fff" font-weight="650">'+esc(line)+'</text>');
 return output+'</svg>';
}
function fishbone(c){
 const groups=c.categories.map(cat=>{
 const causes=c.causes.filter(x=>x.category===cat.id);
 return '<div class="bone-group" data-bone-category="'+esc(cat.id)+'"><div class="bone-head"><input aria-label="Category name" maxlength="70" value="'+esc(cat.name)+'" data-category-name="'+esc(cat.id)+'">'+button('＋','add-category-cause','data-category="'+esc(cat.id)+'" aria-label="Add cause"')+'</div><div class="bone-items">'+
 (causes.map(x=>'<div class="bone-chip '+(x.root?'root':'')+'" draggable="true" data-drag-cause="'+esc(x.id)+'"><span>'+esc(x.text||'Unnamed cause')+'</span>'+button('✎','edit-cause','data-id="'+esc(x.id)+'" aria-label="Edit cause"')+'</div>').join('')||'<span class="bone-empty">Drag a cause here or add one.</span>')+'</div></div>';
 }).join('');
 return panel('Interactive fishbone','Click a cause on the diagram to edit it. Drag a cause chip into another category to reorganize it.',
 '<div class="diagram-scroll">'+fishboneSVG(c)+'</div><div class="panel-actions" style="justify-content:flex-start;margin-top:14px">'+button('＋ New cause','add-cause','','primary')+button('↓ Export SVG','download-svg')+button('↓ Export PNG','download-png')+'</div>'+
 '<p class="subheading">Up to four causes per category are labeled on the chart for legibility. Every cause remains editable below.</p>')+
 panel('Editable causal categories','You can rename categories and drag and drop causes between them. All views stay connected.',
 '<div class="fish-grid">'+groups+'</div><div class="panel-actions" style="justify-content:flex-start;margin-top:16px">'+button('＋ New category','add-category')+'</div>');
}
export function paretoSVG(c){
 const a=paretoAnalysis(c.pareto),items=a.rows.filter(x=>x.count>0),width=Math.max(820,items.length*100+180),height=470,left=70,bottom=370,plotH=270,plotW=width-168,max=Math.max(1,...items.map(x=>x.count));
 let svg='<svg id="pareto-svg" class="pareto-chart" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+width+' '+height+'" role="img" aria-label="Pareto chart: frequency bars and cumulative percentage">';
 for(let i=0;i<=4;i++){const y=bottom-(i/4)*plotH;svg+='<path d="M'+left+' '+y+' H'+(left+plotW)+'" stroke="#d6e5ef"/><text x="'+(left-9)+'" y="'+(y+4)+'" font-size="12" text-anchor="end" fill="#587a92">'+Math.round(max*i/4)+'</text><text x="'+(left+plotW+8)+'" y="'+(y+4)+'" font-size="12" fill="#587a92">'+(i*25)+'%</text>'}
 const step=plotW/Math.max(1,items.length),points=[];
 items.forEach((item,i)=>{
  const w=step*.57,x=left+i*step+step*.18,h=plotH*item.count/max,y=bottom-h,px=left+(i+.47)*step,py=bottom-item.cumulative*plotH;points.push(px+','+py);
  svg+='<rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" rx="4" fill="'+(i<=a.threshold?'#2d719e':'#a3cade')+'"/><text x="'+(x+w/2)+'" y="'+(y-7)+'" font-size="12" text-anchor="middle" fill="#205073">'+item.count+'</text><text x="'+(x+w/2)+'" y="'+(bottom+21)+'" font-size="11" text-anchor="middle" fill="#335a74">'+esc(item.label.slice(0,12))+'</text>';
 });
 const y80=bottom-.8*plotH;
 svg+='<path d="M'+left+' '+y80+' H'+(left+plotW)+'" stroke="#cf9e43" stroke-width="2" stroke-dasharray="7 6"/>';
 if(points.length)svg+='<polyline points="'+points.join(' ')+'" fill="none" stroke="#b78226" stroke-width="3"/>'+points.map(pt=>{const [x,y]=pt.split(',');return '<circle cx="'+x+'" cy="'+y+'" r="4" fill="#d6a449" stroke="#fff" stroke-width="2"/>'}).join('');
 svg+='<text x="70" y="51" font-size="14" font-weight="700" fill="#285d82">Observed frequency</text><text x="'+(width-210)+'" y="51" font-size="13" fill="#ac7a29">Cumulative %</text>';
 return svg+'</svg>';
}
function pareto(c){
 const a=paretoAnalysis(c.pareto);
 const entries='<div class="table-scroll"><table><thead><tr><th>Observed issue</th><th>Occurrences</th><th>Share</th><th>Cumulative</th><th></th></tr></thead><tbody>'+a.rows.map(x=>
 '<tr><td><input type="text" maxlength="160" data-pareto-label="'+esc(x.id)+'" aria-label="Issue name" value="'+esc(x.label)+'">'+(x.sample?pill('Illustrative','gold'):'')+'</td>'+
 '<td><input type="number" min="0" max="100000000" step="1" aria-label="Occurrence count" data-pareto-count="'+esc(x.id)+'" value="'+x.count+'"></td>'+
 '<td>'+(x.share*100).toFixed(1)+'%</td><td>'+(x.cumulative*100).toFixed(1)+'%</td><td>'+button('×','delete-pareto','data-id="'+esc(x.id)+'"')+'</td></tr>').join('')+'</tbody></table></div>';
 return panel('Understand frequency, not assumed causation','Counts should represent observed occurrences, not subjective severity. The cumulative line helps identify common contributors.',
 a.total?'<div class="pareto-wrap">'+paretoSVG(c)+'</div><div class="note gold" style="margin-top:14px">The first '+a.topCount+' issue categories cover at least 80% of counted incidents. Pareto concentration does not establish causation.</div>':
 empty('▥','Add observed frequencies','Enter issue categories and valid occurrence counts to draw a real Pareto chart.','add-pareto','Add first issue')+
 '<div class="panel-actions" style="justify-content:flex-start;margin-top:14px">'+button('＋ Add issue','add-pareto','','primary')+button('↓ Export CSV','download-csv')+'</div>')+
 panel('Editable observations','Change issue names or frequencies below. All percentages recalculate from their counts.',entries);
}
function evidence(c){
 const records=c.evidence.map(x=>'<article class="record"><div class="record-main"><div class="record-title">'+esc(x.finding||'Untitled finding')+'</div><div class="record-tags">'+pill(x.type)+pill(x.stance,x.stance==='Supports'?'green':x.stance==='Contradicts'?'red':'')+pill(c.causes.find(a=>a.id===x.causeId)?.text||'General evidence')+'</div><p class="record-sub">'+esc(x.source||'No reference supplied')+' · '+esc(x.date)+'</p></div><div class="record-actions">'+button('Edit','edit-evidence','data-id="'+esc(x.id)+'"','mini')+button('×','delete-evidence','data-id="'+esc(x.id)+'"','icon-button')+'</div></article>').join('');
 const pending=c.causes.filter(x=>x.status==='Hypothesis').map(x=>'<div class="record"><div class="record-main"><div class="record-title">'+esc(x.text)+'</div><div class="record-sub">'+c.evidence.filter(y=>y.causeId===x.id).length+' evidence record(s)</div></div><div class="record-actions">'+button('Add evidence','add-evidence','data-cause-id="'+esc(x.id)+'"','mini')+button('Assess','edit-cause','data-id="'+esc(x.id)+'"','mini')+'</div></div>').join('');
 return panel('Evidence register','Connect observations, records, data, and interviews to suspected causes; explicitly note contradicting evidence.',
 records?'<div class="records">'+records+'</div>':empty('◉','No evidence yet','Link evidence to each hypothesis, including evidence that might contradict it.','add-evidence','Add evidence record'),
 button('＋ Record evidence','add-evidence','','primary'))+
 panel('Unresolved hypotheses','Labeling a cause as Supported or Refuted requires human judgment; the studio never automatically treats evidence as proof.',
 pending?'<div class="records">'+pending+'</div>':'<div class="note">No hypotheses are awaiting manual assessment. Continue considering alternatives as new evidence emerges.</div>');
}
function solutions(c){
 const a=analysis(c);
 const records=c.solutions.map(x=>'<article class="record"><div class="record-main"><div class="record-title">'+esc(x.title)+'</div><div class="record-tags">'+pill(x.status,x.status==='Completed'?'green':x.status==='Cancelled'?'red':'')+pill('Impact '+x.impact+'/5')+pill('Effort '+x.effort+'/5')+pill('Confidence '+x.confidence+'/5')+'</div><p class="record-sub">'+(x.owner?'Owner: '+esc(x.owner)+' · ':'')+(x.due?'Due: '+esc(x.due)+' · ':'')+'Addresses: '+esc(x.causeIds.map(id=>c.causes.find(k=>k.id===id)?.text).filter(Boolean).join(' / ')||'Not linked')+'</p>'+(x.measure?'<p class="record-sub">Measure: '+esc(x.measure)+' · Baseline: '+esc(x.baseline||'?')+' · Target: '+esc(x.target||'?')+'</p>':'')+(x.result?'<p class="record-sub">Result: '+esc(x.result)+'</p>':'')+'</div><div class="record-actions">'+button('Edit','edit-solution','data-id="'+esc(x.id)+'"','mini')+button('×','delete-solution','data-id="'+esc(x.id)+'"','icon-button')+'</div></article>').join('');
 const ranked=a.ranking.slice(0,10).map(x=>'<tr><td>'+esc(x.title)+'</td><td>'+x.impact+'</td><td>'+x.effort+'</td><td>'+x.confidence+'</td><td>'+x.score+'</td></tr>').join('');
 return panel('Turn insight into a testable response','Assign an owner, target date, affected suspected cause, and a measure of effectiveness.',
 records?'<div class="records">'+records+'</div>':empty('◎','No interventions yet','Describe a testable change and how success will be evaluated.','add-solution','Design a solution'),
 button('＋ Add intervention','add-solution','','primary'))+
 panel('Compare interventions','Relative score = impact × confidence ÷ effort. A discussion aid, not a prediction.',
 ranked?'<div class="table-scroll"><table><thead><tr><th>Proposed intervention</th><th>Impact</th><th>Effort</th><th>Confidence</th><th>Score</th></tr></thead><tbody>'+ranked+'</tbody></table></div>':'<div class="note">Add a proposed response to compare possible options.</div>')+
 '<div class="note gold">After implementation, record the observed result and any unintended consequences. Do not equate activity completion with solving the problem.</div>';
}
export function renderView(c,view){
 return ({problem,whys,fishbone,tree,pareto,evidence,actions:solutions})[view]?.(c)||problem(c);
}
export function reportHTML(c){
 const a=analysis(c),table=(columns,rows)=>rows.length?'<table><thead><tr>'+columns.map(x=>'<th>'+esc(x)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map(x=>'<td>'+esc(x??'—')+'</td>').join('')+'</tr>').join('')+'</tbody></table>':'<p>No entries recorded.</p>';
 const p=a.pareto;
 return '<h1>'+esc(c.title)+'</h1><p>Mayne Leadership Root Cause Investigation · '+esc(new Date().toLocaleDateString())+'</p>'+
 '<section><h2>Problem and scope</h2><p><b>Problem:</b> '+esc(c.problem||'Not defined')+'</p><p><b>Where and when:</b> '+esc(c.where+' · '+c.when)+'</p><p><b>Frequency and impact:</b> '+esc(c.frequency+' · '+c.impact)+'</p><p><b>Boundaries:</b> '+esc(c.boundary)+'</p><p><b>Desired outcome:</b> '+esc(c.goal)+'</p></section>'+
 '<section><h2>Fishbone diagram</h2>'+fishboneSVG(c)+'</section>'+
 '<section><h2>Possible causes</h2>'+table(['Cause','Category','Contributing to','Assessment','Root candidate'],c.causes.map(x=>[x.text,category(c,x.category),c.causes.find(p=>p.id===x.parentId)?.text||'Problem',x.status,x.root?'Yes':'No']))+'</section>'+
 '<section><h2>Supporting and contrary evidence</h2>'+table(['Evidence','Hypothesis','Direction','Source','Date'],c.evidence.map(x=>[x.finding,c.causes.find(t=>t.id===x.causeId)?.text||'General',x.stance,x.source,x.date]))+'</section>'+
 '<section><h2>Pareto observations</h2><p>Total recorded occurrences: '+p.total+'. Illustrative scenario counts are invented.</p>'+table(['Issue','Count','Share','Cumulative','Sample'],p.rows.map(x=>[x.label,x.count,(x.share*100).toFixed(1)+'%',(x.cumulative*100).toFixed(1)+'%',x.sample?'Yes':'No']))+'</section>'+
 '<section><h2>Interventions</h2>'+table(['Action','Status','Owner','Target date','Measure','Target result','Observed result'],c.solutions.map(x=>[x.title,x.status,x.owner,x.due,x.measure,x.target,x.result]))+'</section>'+
 '<section><h2>Findings and further investigation</h2><p>'+esc(c.summary)+'</p><p><b>Outstanding assumptions:</b> '+esc(c.assumptions)+'</p><p><b>Next review:</b> '+esc(c.nextReview)+'</p>'+table(['Date','Observation'],c.observations.map(x=>[x.date,x.note]))+'</section>';
}
