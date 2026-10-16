import {esc,addCause,blankCase,depth} from './root-cause-model.js';
/* Branch-aware, method-focused 5 Whys. Causes are shared with all Root Cause Studio views. */
const e=v=>esc(v??'');
const action=(label,name,attrs='',cls='')=>'<button type="button" class="'+cls+'" data-action="'+name+'" '+attrs+'>'+label+'</button>';
export function tracePath(c,id){
 const byId=new Map(c.causes.map(x=>[x.id,x])),seen=new Set(),path=[];
 let node=byId.get(id);while(node&&!seen.has(node.id)){path.unshift(node);seen.add(node.id);node=byId.get(node.parentId);}
 return path;
}
export function whyLevels(c){
 const groups=new Map();for(const cause of c.causes){const level=Math.min(30,depth(c,cause.id));if(!groups.has(level))groups.set(level,[]);groups.get(level).push(cause)}
 return [...groups].sort((a,b)=>a[0]-b[0]).map(([level,nodes])=>({level,nodes}));
}
export function whyStats(c){
 const children=new Map(),link=new Set(c.evidence.map(x=>x.causeId));
 c.causes.forEach(x=>children.set(x.parentId,(children.get(x.parentId)||0)+1));
 return {branches:[...children.values()].filter(x=>x>1).length,depth:c.causes.reduce((n,x)=>Math.max(n,depth(c,x.id)+1),0),leaves:c.causes.filter(x=>!children.has(x.id)).length,withEvidence:c.causes.filter(x=>link.has(x.id)).length,root:c.causes.filter(x=>x.root).length};
}
function card(c,x,level,focusId,activePath){
 const selected=x.id===focusId,parent=c.causes.find(n=>n.id===x.parentId);
 const note=(parent?.text||c.problem||'The original problem').slice(0,88);
 const evidence=c.evidence.filter(n=>n.causeId===x.id).length;
 return '<article class="why-card'+(selected?' selected':'')+(activePath.has(x.id)?' active-path':'')+'" data-why-card="'+e(x.id)+'">'+
 '<div class="why-card-head"><span>WHY '+(level+1)+'</span><span class="why-status '+e(x.status.toLowerCase())+'">'+e(x.status)+'</span></div>'+
 '<label for="why-text-'+e(x.id)+'">Possible explanation</label>'+
 '<textarea id="why-text-'+e(x.id)+'" data-cause-text="'+e(x.id)+'" aria-label="Edit possible cause" maxlength="220" rows="2">'+e(x.text)+'</textarea>'+
 '<p class="why-trace">May explain: '+e(note)+'</p>'+
 '<div class="why-card-tags"><span>'+e(c.categories.find(k=>k.id===x.category)?.name||'Other')+'</span><span>'+evidence+' evidence</span>'+(x.root?'<span class="gold">★ Root candidate</span>':'')+'</div>'+
 '<div class="why-card-actions">'+action('Ask Why ↗','why-select','data-id="'+e(x.id)+'" aria-pressed="'+selected+'"','why-main-action')+
 action('＋ Branch','why-add-child','data-id="'+e(x.id)+'"')+
 action('Edit','edit-cause','data-id="'+e(x.id)+'"')+'</div></article>';
}
export function renderFiveWhys(c,focusId=''){
 const focused=c.causes.find(x=>x.id===focusId)||null,path=tracePath(c,focusId),pathSet=new Set(path.map(x=>x.id)),levels=whyLevels(c),stats=whyStats(c);
 const chosen=focused?.id||'';
 const options='<option value="">The original problem (Why 1)</option>'+c.causes.map(x=>'<option value="'+e(x.id)+'"'+(x.id===chosen?' selected':'')+'>Why '+(depth(c,x.id)+1)+': '+e((x.text||'Unspecified').slice(0,75))+'</option>').join('');
 const categories=c.categories.map(x=>'<option value="'+e(x.id)+'"'+(x.id===(focused?.category||'process')?' selected':'')+'>'+e(x.name)+'</option>').join('');
 const summary='<div class="why-metrics">'+[['Explanations',c.causes.length],['Deepest chain',stats.depth],['Branches',stats.branches],['With evidence',stats.withEvidence]].map(x=>'<div><small>'+e(x[0])+'</small><strong>'+e(x[1])+'</strong></div>').join('')+'</div>';
 const problem='<section class="panel why-intro"><div class="panel-header"><div><span class="eyebrow">GUIDED ROOT CAUSE EXPLORATION</span><h3>Interactive 5 Whys</h3><p class="subheading">Follow one explanation, explore alternatives, and question the evidence. Five questions are a guide—not an arbitrary finish line.</p></div><div class="panel-actions">'+action('Try a sample','why-sample')+action('Present','why-present')+action('↓ Export Why tree','why-export')+'</div></div>'+
 '<div class="why-problem"><span class="why-symbol">!</span><div><label for="why-problem">Observed problem or symptom</label><textarea id="why-problem" data-case-field="problem" maxlength="2200" placeholder="What is happening, how often, and where?">'+e(c.problem)+'</textarea><small>Start with something observable, not a presumed explanation.</small></div></div>'+summary+'</section>';
 const breadcrumb='<div class="why-breadcrumb"><strong>Current reasoning path</strong><div>'+action('Observed problem','why-clear','','why-crumb'+(!focused?' chosen':''))+path.map((x,i)=>'<span aria-hidden="true">›</span>'+action('Why '+(i+1)+': '+e((x.text||'Unspecified').slice(0,48)),'why-select','data-id="'+e(x.id)+'"','why-crumb'+(focused?.id===x.id?' chosen':''))).join('')+'</div></div>';
 const question=focused?'Why might “‘'+e(focused.text.slice(0,150))+'” happen?':'Why might this problem be happening?';
 const composer='<section class="panel why-composer"><div class="panel-header"><div><h3>Ask the next Why</h3><p class="subheading">'+question+'</p></div><span class="pill gold">'+(focused?'Continue this branch':'Start a new explanation')+'</span></div>'+
 '<form id="why-add-form"><label for="why-answer">Enter one possible cause</label><textarea id="why-answer" name="why-answer" maxlength="220" rows="2" required placeholder="Write a specific, testable explanation…"></textarea>'+
 '<div class="why-composer-row"><label>Contributes to<select name="why-parent" id="why-parent">'+options+'</select></label><label>Category<select name="why-category" id="why-category">'+categories+'</select></label><button class="primary" type="submit">＋ Add explanation</button></div>'+
 '<p class="subheading">A new branch can explain the original problem or any existing cause. Add competing explanations when needed.</p></form></section>';
 const columns=levels.map(group=>'<section class="why-lane"><header class="why-lane-head"><span class="why-lane-number">'+String(group.level+1).padStart(2,'0')+'</span><div><strong>Why '+(group.level+1)+'</strong><small>'+group.nodes.length+' possible cause'+(group.nodes.length===1?'':'s')+'</small></div></header>'+group.nodes.map(x=>card(c,x,group.level,focusId,pathSet)).join('')+'</section>').join('');
 const next=levels.length?'<section class="why-lane why-future"><header class="why-lane-head"><span class="why-lane-number">＋</span><div><strong>Continue</strong><small>Investigate further</small></div></header><div class="why-next"><strong>What explains the explanation?</strong><p>Select any cause and follow its next Why, or return to the problem for another branch.</p>'+action('Add the next Why','why-focus-input','','primary')+'</div></section>':'';
 const board='<section class="panel why-board"><div class="panel-header"><div><h3>Visual reasoning map</h3><p class="subheading">Read left to right. Cards are editable and show the hypothesis, its parent, and its evidence status.</p></div><div class="panel-actions">'+action('＋ Alternative explanation','why-clear')+action('Cause tree ↗','go-tree')+'</div></div>'+
 (c.causes.length?'<div class="why-scroll" role="region" tabindex="0" aria-label="Scroll through Why levels"><div class="why-canvas"><svg id="why-connections" class="why-connections" aria-hidden="true" focusable="false"></svg><div class="why-lanes">'+columns+next+'</div></div></div>':
 '<div class="why-empty"><strong>Begin with a better question.</strong><p>Describe the problem above, then enter a first explanation to reveal your interactive chain.</p>'+action('Start with Why 1','why-focus-input','','primary')+'</div>')+'</section>';
 const selected=focused?'<div class="why-selected"><div class="eyebrow">SELECTED HYPOTHESIS</div><h4>'+e(focused.text||'Unspecified cause')+'</h4>'+
 '<p>'+e(focused.notes||'Add notes to record why this explanation may or may not be true.')+'</p>'+
 '<div class="why-selected-actions">'+action('Ask why again','why-add-child','data-id="'+e(focused.id)+'"','primary')+
 action('⊕ Add evidence','add-evidence','data-cause-id="'+e(focused.id)+'"')+
 action(focused.root?'★ Unmark root':'☆ Root candidate','toggle-root','data-id="'+e(focused.id)+'"')+
 action('Details','edit-cause','data-id="'+e(focused.id)+'"')+
 action('Remove branch','delete-cause','data-id="'+e(focused.id)+'"','danger')+'</div></div>':
 '<div class="why-selected"><div class="eyebrow">INVESTIGATION TIP</div><h4>Follow, then challenge, the reasoning.</h4><p>Select “Ask Why” on any card to continue from it. Every potential cause remains a hypothesis until the evidence supports it.</p></div>';
 const checks='<section class="panel why-review"><h3>Before you name a root cause</h3><div class="why-review-list">'+
 '<div><span class="why-check">'+(stats.branches?'✓':'?')+'</span><p><strong>Alternative explanations</strong> '+(stats.branches?'Branches have been considered.':'Explore other plausible pathways.')+'</p></div>'+
 '<div><span class="why-check">'+(stats.withEvidence?'✓':'?')+'</span><p><strong>Evidence</strong> '+stats.withEvidence+' of '+c.causes.length+' causes have evidence linked; this does not automatically prove them.</p></div>'+
 '<div><span class="why-check">'+(stats.root?'✓':'?')+'</span><p><strong>Root candidates</strong> '+stats.root+' marked. Verify assumptions before recommending action.</p></div></div>'+
 selected+'<div class="why-footer-actions">'+action('Review evidence','why-to-evidence')+action('Open fishbone','why-to-fishbone')+action('Design solutions','why-to-actions')+'</div></section>';
 return '<div class="why-workspace">'+problem+breadcrumb+composer+board+checks+'</div>';
}
export function fiveWhysExample(){
 const c=blankCase('5 Whys classroom example · Training materials');
 c.problem='New training materials are repeatedly published after the agreed deadline.';
 c.stage='explore';c.where='Hypothetical training development team';
 c.summary='Illustrative scenario; all contributing causes are hypotheses, not real findings.';
 const a=addCause(c,{text:'Final approval takes longer than expected',category:'process'});
 const b=addCause(c,{text:'Reviewers receive materials late',parentId:a.id,category:'people'});
 const d=addCause(c,{text:'The work plan lacks a review milestone',parentId:b.id,category:'process'});
 const f=addCause(c,{text:'No shared checklist for handoffs',parentId:d.id,category:'process'});
 addCause(c,{text:'Teams use inconsistent planning routines',parentId:f.id,category:'policy'});
 const alternate=addCause(c,{text:'Last-minute changes are requested',category:'environment'});
 addCause(c,{text:'Stakeholders join the process after drafting',parentId:alternate.id,category:'process'});
 return c;
}
