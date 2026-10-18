import {DIMENSIONS,EMOTIONS,TACTICS,STAGES,initialMetrics,activeSession,nodeById,metricsDelta,observationAverage,summarize,validateScenario,escapeHTML as e,clamp} from './leadership-conversation-model.js';

const short=(v,n=105)=>String(v??'').length>n?String(v).slice(0,n-1)+'…':String(v??'');
export const opt=(v,label,current)=>'<option value="'+e(v)+'"'+(String(current)===String(v)?' selected':'')+'>'+e(label)+'</option>';
const pct=(n)=>Math.round(clamp(n,0,100,50));
export const status=key=>DIMENSIONS.find(d=>d.key===key)?.label||key;
function emotionCaption(emotion){return ({guarded:'Guarded',frustrated:'Frustrated',skeptical:'Skeptical',thoughtful:'Reflective',open:'Open',hopeful:'Optimistic',disappointed:'Disappointed',neutral:'Neutral'})[emotion]||'Reflective';}
export function avatarSVG(persona,emotion='neutral'){
 const skin={blue:'#e3ae8f',olive:'#bf8c6c',sand:'#c48d6d',rose:'#b57d60',slate:'#d7a78a'}[persona.avatar]||'#cf9576';
 const coat={blue:'#47789f',olive:'#617461',sand:'#bc946a',rose:'#a87784',slate:'#65717e'}[persona.avatar]||'#47789f';
 const hair={blue:'#403830',olive:'#2e302d',sand:'#36312a',rose:'#312d31',slate:'#54453b'}[persona.avatar]||'#403830';
 const browY=emotion==='frustrated'?104:emotion==='skeptical'?102:emotion==='disappointed'?109:108;
 const mouth=emotion==='hopeful'||emotion==='open'?'M119 163 Q136 176 153 163':
   emotion==='frustrated'?'M119 168 Q136 157 153 168':
   emotion==='disappointed'?'M120 168 Q136 159 151 168':
   emotion==='skeptical'?'M121 166 Q138 162 151 164':'M122 164 Q136 167 152 164';
 const browL=emotion==='frustrated'?'M109 107 L123 101':emotion==='skeptical'?'M110 102 L123 108':'M110 '+browY+' L125 '+(browY-2);
 const browR=emotion==='frustrated'?'M145 101 L159 107':emotion==='skeptical'?'M145 108 L159 100':'M145 '+(browY-2)+' L159 '+browY;
 const aria=e('Illustration of '+(persona.name||'an employee')+' with a '+emotionCaption(emotion).toLowerCase()+' expression');
 return '<svg class="portrait-svg" role="img" aria-label="'+aria+'" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 260 285">'+
 '<defs><linearGradient id="portrait-halo" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fff" stop-opacity=".9"/><stop offset="1" stop-color="#dcecf3"/></linearGradient><linearGradient id="coat-shade" x1="0" y1="0" x2="1" y2="1"><stop stop-color="'+coat+'"/><stop offset="1" stop-color="#354f67"/></linearGradient></defs>'+
 '<ellipse cx="131" cy="146" rx="117" ry="123" fill="url(#portrait-halo)" stroke="#d6e6f0"/>'+
 '<ellipse cx="130" cy="273" rx="102" ry="18" fill="#7ca3b7" opacity=".12"/>'+
 '<path d="M28 283 C29 230 56 215 95 208 L119 195 L143 195 L162 207 C207 219 229 243 230 283Z" fill="url(#coat-shade)"/>'+
 '<path d="M109 205 L132 234 L156 204 L144 200 L117 199Z" fill="#f7f8f5"/>'+
 '<path d="M116 176 L114 205 C125 216 143 216 155 205 L149 173Z" fill="'+skin+'"/>'+
 '<ellipse cx="90" cy="139" rx="8" ry="13" fill="'+skin+'"/><ellipse cx="167" cy="139" rx="8" ry="13" fill="'+skin+'"/>'+
 '<path d="M89 97 C89 63 106 50 131 50 C157 50 174 64 173 99 L168 152 C161 183 145 198 131 198 C111 198 95 182 92 153Z" fill="'+skin+'"/>'+
 '<path d="M88 132 C81 111 83 79 95 61 C109 43 135 38 154 48 C173 43 182 67 176 91 C176 106 172 117 167 124 L164 94 Q158 73 143 82 Q125 89 104 84 Q100 102 92 109Z" fill="'+hair+'"/>'+
 '<path d="'+browL+'" fill="none" stroke="'+hair+'" stroke-width="4" stroke-linecap="round"/>'+
 '<path d="'+browR+'" fill="none" stroke="'+hair+'" stroke-width="4" stroke-linecap="round"/>'+
 '<ellipse cx="118" cy="125" rx="4" ry="4.5" fill="#30353b"/><ellipse cx="152" cy="125" rx="4" ry="4.5" fill="#30353b"/>'+
 '<path d="M134 129 Q130 149 135 152 L139 151" fill="none" stroke="#956b5c" stroke-width="2.4" stroke-linecap="round"/>'+
 '<path d="'+mouth+'" fill="none" stroke="#874f4c" stroke-width="3.2" stroke-linecap="round"/>'+
 '<path d="M118 200 L132 228 L142 202" fill="none" stroke="#d5e1e8" stroke-width="3"/>'+
 '<path d="M92 211 L116 230 L132 255 L96 236Z" fill="#ffffff20"/>'+
 '<path d="M166 212 L146 229 L133 255 L170 238Z" fill="#071b2b19"/>'+
 '</svg>';
}
export function sidebarHTML(projects,activeId,filter=''){
 const q=filter.toLowerCase().trim();
 const matching=projects.filter(p=>[p.title,p.category,p.summary,p.persona.name].join(' ').toLowerCase().includes(q));
 return matching.length?matching.map(p=>{
  const s=activeSession(p),progress=s?.complete?'Completed':s?.turns.length?'In progress':'Ready';
  return '<button type="button" class="scenario-button'+(p.id===activeId?' active':'')+'" data-open-scenario="'+e(p.id)+'"><span class="scenario-icon">'+
  (p.category.toLowerCase().includes('ethic')?'⚖':p.category.toLowerCase().includes('conflict')?'◎':p.category.toLowerCase().includes('coaching')?'✦':'◈')+'</span>'+
  '<span class="scenario-detail"><strong>'+e(p.title)+'</strong><small>'+e(p.category)+' · '+p.timeMinutes+' min</small></span>'+
  '<span class="scenario-state">'+(p.id===activeId?'●':progress==='Completed'?'✓':'')+'</span></button>';
 }).join(''):'<div class="empty inline"><strong>No matching scenarios</strong><p>Try another keyword or build a new scenario.</p></div>';
}
export function selectedCardHTML(p){
 const s=activeSession(p);return '<span class="eyebrow">SELECTED SCENARIO</span><h3>'+e(p.title)+'</h3>'+
 '<p>'+e(p.summary)+'</p><div class="selected-meta"><span>◷ '+p.timeMinutes+' min</span><span>'+p.nodes.length+' moments</span></div>'+
 '<p class="selected-persona">Character: <strong>'+e(p.persona.name)+'</strong></p>'+
 '<button type="button" data-start-session="1" class="primary wide">'+(s?'↻ Practice again':'▶ Begin conversation')+'</button>';
}
export function pulseHTML(p){
 const s=activeSession(p),data=s?.metrics||initialMetrics();
 return '<div class="pulse-metrics">'+DIMENSIONS.map(d=>'<div class="pulse-metric"><div class="pulse-label"><strong>'+e(d.label)+'</strong><b>'+pct(data[d.key])+'<small>/100</small></b></div>'+
 '<div class="pulse-track"><span style="width:'+pct(data[d.key])+'%"></span></div>'+
 '<p>'+e(d.description)+'</p></div>').join('')+'</div>'+
 (s?'<p class="pulse-foot">'+s.turns.length+' response'+(s.turns.length===1?'':'s')+' recorded'+(s.complete?' · Conversation complete':'')+'</p>':'<p class="pulse-foot">All indicators start at 50 in a new practice session.</p>');
}
function introHTML(p){
 return '<article class="intro-case"><div class="intro-case-top"><div><span class="eyebrow">YOUR NEXT LEADERSHIP CONVERSATION</span><h3>'+e(p.title)+'</h3><p>'+e(p.summary)+'</p></div><div class="intro-minutes">'+p.timeMinutes+'<small>MIN</small></div></div>'+
 '<div class="intro-case-content"><div class="intro-face">'+avatarSVG(p.persona,'neutral')+'</div><div class="intro-copy"><span class="eyebrow">MEET YOUR EMPLOYEE</span><h3>'+e(p.persona.name)+'</h3>'+
 '<p class="role-text">'+e(p.persona.role)+'</p><p>'+e(p.persona.temperament)+'</p></div></div>'+
 '<div class="intro-brief"><strong>The situation</strong><p>'+e(p.context)+'</p><strong>Practice objective</strong><p>'+e(p.objective)+'</p></div>'+
 '<button type="button" class="primary start-button" data-start-session="1">Begin this conversation →</button></article>';
}
const tip=(t)=>'<p class="mini-tip">'+e(t)+'</p>';
function choicesHTML(node,s){
 return '<div class="response-section"><div class="response-heading"><span class="eyebrow">HOW WILL YOU RESPOND?</span><p>Select a response or draft your own words using a scripted approach.</p></div>'+
 '<div class="response-list">'+node.choices.map((c,i)=>
 '<button type="button" data-choose="'+e(c.id)+'" class="response-choice"><span class="choice-number">'+String.fromCharCode(65+i)+'</span>'+
 '<span><strong>'+e(c.label)+'</strong><small>'+e(c.tactic)+'</small></span><span class="choice-arrow">↗</span></button>').join('')+'</div>'+
 '<div class="typed-response"><div class="typed-heading"><span>✎ SAY IT IN YOUR OWN WORDS</span><span class="typed-explain">Guided path, not AI chat</span></div>'+
 '<label for="typed-reply">What would you actually say?</label><textarea id="typed-reply" rows="3" maxlength="900" placeholder="Write your response as you would say it to this employee…"></textarea>'+
 '<label for="typed-path">Choose the closest scripted approach to simulate the reaction</label>'+
 '<select id="typed-path"><option value="">Select a response approach…</option>'+node.choices.map(c=>opt(c.id,c.tactic+' — '+short(c.label,80),'')).join('')+'</select>'+
 '<p>We keep your exact words in the transcript. The employee’s reaction follows the scripted approach you choose; the app does not evaluate your free text with AI.</p>'+
 '<button type="button" id="submit-typed" class="primary">Send my response →</button></div></div>';
}
function historyHTML(s,limit=6){
 if(!s.turns.length)return '';
 return '<div class="transcript-history"><div class="section-heading"><span class="eyebrow">THE CONVERSATION SO FAR</span><button type="button" data-undo-response="1">↶ Undo last turn</button></div>'+
 s.turns.slice(-limit).map(t=>'<div class="exchange"><div class="message employee"><strong>Employee</strong><p>'+e(t.employee)+'</p></div>'+
 '<div class="message learner"><strong>'+e(s.learner||'You')+'</strong><p>'+e(t.learner)+'</p></div>'+
 '<div class="message reaction"><strong>Employee reacted · '+e(emotionCaption(t.emotion))+'</strong><p>'+e(t.reply)+'</p></div></div>').join('')+'</div>';
}
export function practiceHTML(p){
 const s=activeSession(p);if(!s)return introHTML(p);
 const n=nodeById(p,s.currentNodeId),last=s.turns.at(-1);
 if(s.complete)return '<div class="completion"><span class="completion-icon">✓</span><span class="eyebrow">CONVERSATION COMPLETE</span><h2>You finished the conversation.</h2>'+
 '<p>Now examine where you built trust, clarified expectations, or missed an opportunity. The numbers are scripted signals—not a pass/fail grade.</p>'+
 '<div class="completion-actions"><button type="button" data-go="review" class="primary">Open After-Action Review →</button>'+
 '<button type="button" data-start-session="1">↻ Try a different approach</button></div></div>'+historyHTML(s,30);
 if(!n)return '<div class="empty"><strong>Conversation cannot continue</strong><p>The selected moment was deleted. Restart the practice to use the latest scenario.</p><button data-start-session="1">Restart</button></div>';
 return '<div class="practice-topline"><div><span class="eyebrow">LIVE ROLEPLAY · '+e(n.stage)+'</span><strong>'+e(p.persona.name)+' · '+e(p.persona.role)+'</strong></div>'+
 '<div><span class="turn-count">TURN '+(s.turns.length+1)+'</span><button type="button" data-start-session="1">↻ Restart</button></div></div>'+
 '<div class="conversation-stage"><div class="character-scene"><div class="character-halo">'+avatarSVG(p.persona,n.emotion)+'</div>'+
 '<span class="expression-chip"><span class="expression-dot"></span>'+e(emotionCaption(n.emotion))+'</span><h3>'+e(p.persona.name)+'</h3>'+
 '<p>'+e(p.persona.role)+'</p></div>'+
 '<div class="dialogue-area"><span class="eyebrow">EMPLOYEE · '+e(n.stage.toUpperCase())+'</span><blockquote>'+e(n.line)+'</blockquote>'+
 (n.context?'<p class="context-note">'+e(n.context)+'</p>':'')+
 '<div class="stage-footer"><span>What you say next shapes the direction.</span><span>'+e(p.objective)+'</span></div></div></div>'+
 (last?'<div class="coaching-feedback"><span class="eyebrow">REFLECTION ON YOUR PREVIOUS RESPONSE</span><p>'+e(last.feedback)+'</p>'+
 '<button type="button" data-undo-response="1">↶ Retry that moment</button></div>':'')+
 choicesHTML(n,s)+historyHTML(s);
}
export function recentFeedbackHTML(p){
 const s=activeSession(p),t=s?.turns.at(-1);
 return '<span class="eyebrow">COACHING REFLECTION</span>'+
 (t?'<p class="sidebar-feedback">'+e(t.feedback)+'</p>'+
 '<div class="impact-mini">'+DIMENSIONS.map(d=>'<span>'+e(d.label)+' <b>'+(t.effects[d.key]>0?'+':'')+t.effects[d.key]+'</b></span>').join('')+'</div>':
 '<p class="muted">A reflection will appear after you choose a response. Ask what effect the choice had on the conversation.</p>');
}
export function momentsHTML(p,selected){
 return p.nodes.map((n,i)=>'<button class="moment-tile'+(n.id===selected?' active':'')+'" type="button" data-select-moment="'+e(n.id)+'"><span class="moment-index">'+String(i+1).padStart(2,'0')+'</span>'+
 '<span><strong>'+e(n.title)+'</strong><small>'+e(n.stage)+' · '+n.choices.length+' response'+(n.choices.length===1?'':'s')+'</small></span><span>→</span></button>').join('');
}
export function nodeEditorHTML(p,id){
 const n=nodeById(p,id);if(!n)return '<div class="empty"><strong>Select a moment</strong><p>Choose a conversation moment on the left to edit the prompts and outcomes.</p></div>';
 return '<div class="node-editor"><div class="panel-title"><h3>Edit selected moment</h3><div><button type="button" data-set-start="'+e(n.id)+'"'+(p.firstNodeId===n.id?' disabled':'')+'>Set as start</button>'+
 '<button type="button" class="danger" data-delete-moment="'+e(n.id)+'"'+(p.nodes.length===1?' disabled':'')+'>Delete</button></div></div>'+
 '<label>Moment title<input data-node-field="title" data-node-id="'+e(n.id)+'" maxlength="140" value="'+e(n.title)+'"></label>'+
 '<div class="two-fields"><label>Stage<select data-node-field="stage" data-node-id="'+e(n.id)+'">'+STAGES.map(v=>opt(v,v,n.stage)).join('')+'</select></label>'+
 '<label>Employee expression<select data-node-field="emotion" data-node-id="'+e(n.id)+'">'+EMOTIONS.map(v=>opt(v,v,n.emotion)).join('')+'</select></label></div>'+
 '<label>Employee’s next line<textarea data-node-field="line" data-node-id="'+e(n.id)+'" maxlength="1100" rows="4">'+e(n.line)+'</textarea></label>'+
 '<label>Moment context / guidance<textarea data-node-field="context" data-node-id="'+e(n.id)+'" maxlength="950" rows="2">'+e(n.context)+'</textarea></label>'+
 '<div class="panel-title"><h3>Scripted responses & branches</h3><button type="button" class="primary" data-add-choice="'+e(n.id)+'"'+(n.choices.length>=6?' disabled':'')+'>＋ Response</button></div>'+
 '<div class="choice-edit-list">'+n.choices.map((c,i)=>'<article class="builder-choice"><div class="choice-edit-top"><span class="choice-number">'+String.fromCharCode(65+i)+'</span>'+
 '<strong>'+e(c.tactic)+'</strong><button type="button" data-edit-choice="'+e(c.id)+'" data-choice-node="'+e(n.id)+'">Edit</button>'+
 '<button type="button" class="danger" data-remove-choice="'+e(c.id)+'" data-choice-node="'+e(n.id)+'"'+(n.choices.length===1?' disabled':'')+'>×</button></div>'+
 '<p>'+e(c.label)+'</p><small>Next: '+e(c.nextId==='END'?'Finish conversation':nodeById(p,c.nextId)?.title||'Missing branch')+'</small></article>').join('')+'</div>'+
 '<p class="muted">Response edits include the employee’s immediate reaction, facilitator feedback, four simulated effects, and the next conversation moment. Set Next to "Finish" to end the practice.</p></div>';
}
export function choiceEditorFieldsHTML(p,n,c){
 return '<p class="muted">Write realistic responses and transparent feedback. The learner’s simulated outcomes follow this response exactly.</p>'+
 '<label>Response to say<textarea name="label" maxlength="500" rows="3">'+e(c.label)+'</textarea></label>'+
 '<label>Leadership approach<select name="tactic">'+TACTICS.map(v=>opt(v,v,c.tactic)).join('')+'</select></label>'+
 '<label>Employee’s immediate reaction<textarea name="reply" maxlength="900" rows="3">'+e(c.reply)+'</textarea></label>'+
 '<label>Employee expression<select name="emotion">'+EMOTIONS.map(v=>opt(v,v,c.emotion)).join('')+'</select></label>'+
 '<label>Coaching feedback<textarea name="feedback" maxlength="950" rows="3">'+e(c.feedback)+'</textarea></label>'+
 '<label>Next conversational moment<select name="nextId">'+opt('END','Finish the conversation',c.nextId)+
 p.nodes.filter(x=>x.id!==n.id).map(v=>opt(v.id,v.title,c.nextId)).join('')+'</select></label>'+
 '<div class="editor-metrics"><strong>Illustrative indicator changes (−25 to +25)</strong><div class="two-fields">'+
 DIMENSIONS.map(d=>'<label>'+e(d.label)+'<input type="number" name="effect_'+d.key+'" min="-25" max="25" value="'+(c.effects[d.key]||0)+'"></label>').join('')+'</div></div>';
}
export function observeHTML(p){
 const s=activeSession(p);if(!s)return '<div class="empty"><strong>No conversation to observe</strong><p>Begin a practice conversation before recording peer or instructor observations.</p><button type="button" data-go="practice">Open practice →</button></div>';
 const obs=s.observations;
 return '<div class="observation-layout"><div class="observation-form-panel"><span class="eyebrow">FORMATIVE OBSERVATION</span>'+
 '<h3>What did the leader actually do?</h3><p class="muted">Rate only behaviors you observed. These scores are human judgments, not automatically calculated from the scenario.</p>'+
 '<form id="observation-form"><label>Observer name or identifier<input name="observer" maxlength="100" placeholder="Observer or team"></label>'+
 '<div class="observation-rubric">'+[['listening','Active listening'],['inquiry','Useful questions'],['accountability','Clear expectations'],['adaptability','Flexibility & repair']].map(([k,label])=>
 '<label>'+label+'<span><input type="range" min="1" max="5" value="3" name="'+k+'" data-observation-range="'+k+'"><output>3 / 5</output></span></label>').join('')+'</div>'+
 '<label>Specific observed behaviors<textarea name="notes" maxlength="1600" rows="4" placeholder="Record exact words or behaviors rather than general impressions…"></textarea></label>'+
 '<label>What worked?<textarea name="strengths" maxlength="950" rows="2"></textarea></label>'+
 '<label>What might improve?<textarea name="opportunities" maxlength="950" rows="2"></textarea></label>'+
 '<button type="submit" class="primary">Save observation</button></form></div>'+
 '<div class="observation-list"><div class="panel-title"><h3>Observation journal</h3><span>'+obs.length+' recorded</span></div>'+
 (obs.length?obs.slice().reverse().map(o=>'<article class="observation-card"><div class="observation-top"><strong>'+e(o.observer)+'</strong><span>'+e(o.timestamp.slice(0,10))+'</span></div>'+
 '<div class="observation-badges">'+Object.entries(o.rubric).map(([k,v])=>'<span>'+e(k)+' '+v+'/5</span>').join('')+'</div>'+
 '<p>'+e(o.notes||'No specific notes')+'</p><p><b>Strength:</b> '+e(o.strengths||'Not recorded')+'</p>'+
 '<p><b>Opportunity:</b> '+e(o.opportunities||'Not recorded')+'</p></article>').join(''):
 '<div class="empty"><strong>No observations yet</strong><p>Save a specific, behavior-focused observation to see it here.</p></div>')+'</div></div>';
}
function transcriptHTML(s){
 return '<div class="review-transcript">'+s.turns.map((t,i)=>
 '<article class="review-turn"><div class="review-turn-index">TURN '+String(i+1).padStart(2,'0')+' · '+e(t.stage)+'</div>'+
 '<div class="review-lines"><p><b>Employee:</b> '+e(t.employee)+'</p><p><b>You:</b> '+e(t.learner)+'</p>'+
 '<p><b>Response:</b> '+e(t.reply)+'</p></div><div class="review-feedback"><strong>Reflection:</strong> '+e(t.feedback)+'</div>'+
 '<div class="review-effects">'+DIMENSIONS.map(d=>'<span>'+e(d.label)+': <b>'+(t.effects[d.key]>0?'+':'')+t.effects[d.key]+'</b></span>').join('')+'</div></article>').join('')+'</div>';
}
export function reviewHTML(p){
 const s=activeSession(p);
 if(!s)return '<div class="empty"><strong>No completed practice yet</strong><p>Run a conversation to see the exchange and your after-action reflection.</p><button type="button" data-go="practice">Start practicing</button></div>';
 const result=summarize(s),average=observationAverage(s),all=p.sessions.slice(0,10);
 const previous=p.sessions.find(x=>x.id!==s.id&&x.complete);
 return '<div class="review-header"><div><span class="eyebrow">YOUR CONVERSATION PATH</span><h3>'+e(p.title)+'</h3><p>'+s.turns.length+' responses · '+(s.complete?'Finished':'In progress')+' · '+e(s.learner||'Participant')+'</p></div>'+
 '<div class="review-actions"><button type="button" data-start-session="1">↻ Replay scenario</button><button type="button" data-open-export="1">Export debrief ↗</button></div></div>'+
 '<div class="review-metrics">'+DIMENSIONS.map(d=>'<div class="review-metric"><small>'+e(d.label)+'</small><strong>'+s.metrics[d.key]+'<span>/100</span></strong>'+
 '<div class="score-track"><span style="width:'+s.metrics[d.key]+'%"></span></div>'+
 '<p class="'+(result.changes[d.key]>0?'gain':result.changes[d.key]<0?'loss':'')+'">'+(result.changes[d.key]>0?'+':'')+result.changes[d.key]+' from baseline</p></div>').join('')+'</div>'+
 '<div class="review-two"><article class="review-panel"><div class="panel-title"><h3>Decision patterns</h3><span>Scripted pathway</span></div>'+
 '<div class="tactic-summary">'+TACTICS.filter(t=>result.counts[t]>0).map(t=>'<div><b>'+e(t)+'</b><span>'+result.counts[t]+' turn(s)</span></div>').join('')+'</div>'+
 '<p class="muted">These signals represent author-assigned classroom effects. A high value does not imply an objectively effective real conversation.</p>'+
 (previous?'<div class="comparison-note"><strong>Previous completed run</strong><p>'+previous.turns.length+' turns. Compare transcript and choices to see what changed when you took a different path.</p></div>':'')+'</article>'+
 '<article class="review-panel"><h3>Personal reflection</h3><p class="muted">Choose one behavior to practice in a real leadership conversation.</p>'+
 '<label>What would you repeat? <textarea id="reflection-keep" maxlength="1200" rows="3">'+e(s.reflection?.keep||'')+'</textarea></label>'+
 '<label>What would you change? <textarea id="reflection-change" maxlength="1200" rows="3">'+e(s.reflection?.change||'')+'</textarea></label>'+
 '<label>Next conversation commitment <textarea id="reflection-action" maxlength="1200" rows="3">'+e(s.reflection?.action||'')+'</textarea></label>'+
 '<button type="button" id="save-reflection" class="primary">Save reflection</button></article></div>'+
 (average?'<div class="review-panel"><h3>Observer-rated behaviors</h3><div class="review-observer">'+Object.entries(average).map(([k,v])=>'<span><strong>'+e(k)+'</strong> '+v+'/5</span>').join('')+'</div><p class="muted">Means of manually entered observer ratings; not a validated assessment.</p></div>':'')+
 '<div class="panel-title"><h3>Conversation replay</h3><label class="review-switcher">Select practice session <select id="review-session-select">'+all.map(x=>opt(x.id,x.learner+' · '+x.turns.length+' turns · '+x.started.slice(0,10),s.id)).join('')+'</select></label></div>'+
 (s.turns.length?transcriptHTML(s):'<div class="empty">No turns recorded yet.</div>');
}
export function reportHTML(p){
 const s=activeSession(p),r=s?summarize(s):null;
 const row=(cells)=>'<tr>'+cells.map(x=>'<td>'+e(x)+'</td>').join('')+'</tr>';
 return '<header><small>MAYNE LEADERSHIP · LEADERSHIP CONVERSATION SIMULATOR</small><h1>'+e(p.title)+'</h1>'+
 '<p>'+e(p.context)+'</p><p>Character: '+e(p.persona.name)+' · '+e(p.persona.role)+'</p></header>'+
 '<section><h2>Learning objective</h2><p>'+e(p.objective)+'</p></section>'+
 '<section><h2>Scenario and conversation</h2>'+
 (s?'<p><strong>Participant:</strong> '+e(s.learner)+' · <strong>Complete:</strong> '+(s.complete?'Yes':'No')+'</p>'+
 '<table><thead><tr><th>Turn</th><th>Employee</th><th>Leader response</th><th>Reaction</th><th>Reflection</th></tr></thead><tbody>'+
 s.turns.map((t,i)=>row([i+1,t.employee,t.learner,t.reply,t.feedback])).join('')+'</tbody></table>':'<p>No practice session.</p>')+'</section>'+
 '<section><h2>Simulated indicators</h2><p>'+DIMENSIONS.map(d=>e(d.label)+': '+(s?.metrics[d.key]??50)+'/100').join(' · ')+'</p>'+
 '<p>Indicators represent predetermined scripted effects and do not measure actual employee feelings or performance.</p></section>'+
 '<section><h2>Observer feedback</h2>'+
 (s?.observations.length?'<table><thead><tr><th>Observer</th><th>Listening</th><th>Inquiry</th><th>Accountability</th><th>Adaptability</th><th>Notes</th></tr></thead><tbody>'+
 s.observations.map(o=>row([o.observer,o.rubric.listening,o.rubric.inquiry,o.rubric.accountability,o.rubric.adaptability,o.notes])).join('')+'</tbody></table>':'<p>No observer ratings recorded.</p>')+'</section>'+
 '<section><h2>Personal action plan</h2><p><strong>Repeat:</strong> '+e(s?.reflection?.keep||'')+'</p><p><strong>Improve:</strong> '+e(s?.reflection?.change||'')+'</p><p><strong>Act on:</strong> '+e(s?.reflection?.action||'')+'</p></section>';
}
