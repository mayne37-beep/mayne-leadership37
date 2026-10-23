import {createClient} from '@supabase/supabase-js';
const db=createClient('https://vteamreihsunsllwcphw.supabase.co','sb_publishable_dFlcGsz0Fu1TifebqIu4fQ_6aLjG7ud',{auth:{persistSession:true,autoRefreshToken:true}});
const el=document.getElementById('studio'),library=document.getElementById('library');
let user=null,published=[],drafts=[],current=null,panel='overview',selectedNode='',preview=null,dirty=false;
const scenes=['meeting','office','hallway','corridor','planning','conflict','crisis','executive'];
const emotions=['neutral','tense','worried','uncertain','defensive','firm','urgent','exhausted','hopeful','focused','reflective','guarded'];
const nameOf=x=>String(x==null?'':x);
const h=x=>nameOf(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid=()=>Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,6);
const clone=x=>JSON.parse(JSON.stringify(x));
const toast=(msg,bad=false)=>{const t=document.getElementById('toast');t.textContent=msg;t.style.background=bad?'#9d3348':'#143f67';t.style.display='block';clearTimeout(toast.t);toast.t=setTimeout(()=>t.style.display='none',4700)};
const field=(title,name,value,opts={})=>'<label class="'+(opts.full?'full':'')+'">'+h(title)+(opts.help?'<small>'+h(opts.help)+'</small>':'')+(opts.values?'<select data-root="'+h(name)+'">'+opts.values.map(x=>'<option value="'+h(x)+'"'+(nameOf(value)===x?' selected':'')+'>'+h(x)+'</option>').join('')+'</select>':opts.long?'<textarea data-root="'+h(name)+'" rows="3">'+h(value||'')+'</textarea>':'<input data-root="'+h(name)+'" value="'+h(value||'')+'">')+'</label>';
const sceneField=(title,name,value,opts={})=>'<label class="'+(opts.full?'full':'')+'">'+h(title)+(opts.values?'<select data-scene-field="'+h(name)+'">'+opts.values.map(x=>'<option value="'+h(x)+'"'+(nameOf(value)===x?' selected':'')+'>'+h(x)+'</option>').join('')+'</select>':opts.long?'<textarea data-scene-field="'+h(name)+'" rows="3">'+h(value||'')+'</textarea>':'<input data-scene-field="'+h(name)+'" value="'+h(value==null?'':value)+'" '+(opts.number?'type="number"':'')+'>')+'</label>';
const list=(title,description,html)=>'<div class="card"><div class="spread"><div><h3>'+h(title)+'</h3><p class="muted">'+h(description)+'</p></div></div>'+html+'</div>';
const choicesOf=story=>story&&story.nodes?Object.keys(story.nodes):[];
function defaultStory(){
 return {version:1,title:'A Leadership Decision Journey',synopsis:'Respond to realistic situations and see how the story changes.',start:'opening-scene',nodes:{
 'opening-scene':{title:'The Leadership Situation',act:1,setting:'Team meeting',scene:'meeting',speaker:'Team member',tone:'tense',text:'A team member challenges a decision while others are watching.',prompt:'How will you respond?',choices:[
 {text:'Listen and clarify the issue.',next:'strong-ending',trust:2,pressure:-1,reaction:'The team member engages constructively.',coaching:'Listening and clear accountability can work together.'},
 {text:'Dismiss the concern.',next:'repair-ending',trust:-2,pressure:2,reaction:'The team becomes less willing to speak up.',coaching:'An overly defensive response weakens trust.'}
 ]},
 'strong-ending':{title:'An Accountable Team',act:4,setting:'Team debrief',scene:'meeting',speaker:'Narrator',tone:'hopeful',text:'The team sees that concerns can be heard while decisions remain clear.',ending:true,reflection:'Which behavior will you repeat in real leadership situations?'},
 'repair-ending':{title:'A Recovery Opportunity',act:4,setting:'Quiet office',scene:'office',speaker:'Narrator',tone:'reflective',text:'The team needs clearer dialogue and follow-through before trust is restored.',ending:true,reflection:'What should you repair first?'}
 },injectChoices:[
 {text:'Gather the facts and communicate priorities.',trust:2,pressure:-1,reaction:'The team aligns to an accountable update.'},
 {text:'React without confirming the information.',trust:-1,pressure:2,reaction:'The problem becomes harder to contain.'}
 ]};
}
function defaultScenario(id,title){
 return {id,title,subtitle:'A practical leadership simulation',description:'A branching leadership practice case.',briefing:'Review the situation and make your leadership choices.',mission:'Use sound judgment, communication and accountability.',characters:[],injects:[],moments:[{title:'Leadership Checkpoint',trainee:'Team member',behavior:'A team member challenges a decision.',context:'Others are watching for the leader’s response.',question:'What leadership action will you take?',options:[{action:'Listen and clarify expectations.',outcome:'effective'},{action:'Avoid the conversation.',outcome:'high-risk'}]}],story:defaultStory()};
}
function ensure(){if(!current)throw Error('Open a draft first');return current.draft}
function ensureStory(){const d=ensure();if(!d.story){d.story=defaultStory();dirty=true}return d.story}
function statusHTML(){if(!current)return '';let exists=published.some(s=>s.id===current.scenario_id);return '<span class="badge '+(dirty?'gold':'success')+'">'+(dirty?'Unsaved changes':'Saved draft')+'</span><span class="badge">'+(exists?'Live scenario exists':'Not yet published')+'</span><span class="badge">Published versions: '+Number(current.version||0)+'</span>'}
function validateStory(story){
 const errors=[],warnings=[],keys=choicesOf(story);
 if(!keys.length){errors.push('Create at least one story scene.');return {errors,warnings}}
 if(!story.start||!story.nodes[story.start])errors.push('Choose a valid opening scene.');
 if(keys.length>100)errors.push('Limit stories to 100 scenes.');
 const visited=new Set(),walk=k=>{if(!story.nodes[k]||visited.has(k))return;visited.add(k);(story.nodes[k].choices||[]).forEach(c=>{if(c.next!=='__ending__')walk(c.next)})};
 if(story.start&&story.nodes[story.start])walk(story.start);
 let endings=0;
 keys.forEach(k=>{const n=story.nodes[k];if(n.ending){endings++;return}
  if(!Array.isArray(n.choices)||!n.choices.length)errors.push('Scene "'+k+'" needs a choice.');
  (n.choices||[]).forEach((c,i)=>{if(!nameOf(c.text).trim())errors.push('Scene "'+k+'" choice '+(i+1)+' needs text.');
   if(!c.next||c.next!=='__ending__'&&!story.nodes[c.next])errors.push('Scene "'+k+'" choice '+(i+1)+' has an invalid destination.');
  });
 });
 if(!endings)errors.push('Create at least one ending scene.');
 if(keys.some(k=>k!=='ending-strong'&&k!=='ending-fragile'&&k!=='ending-damaged'&&(story.nodes[k].choices||[]).some(c=>c.next==='__ending__'))&&!['ending-strong','ending-fragile','ending-damaged'].every(k=>story.nodes[k]?.ending)) errors.push('Dynamic endings require ending-strong, ending-fragile and ending-damaged scenes.');
 const stranded=keys.filter(k=>!visited.has(k));if(stranded.length)warnings.push('Unreachable scenes: '+stranded.join(', '));
 if(!keys.some(k=>visited.has(k)&&story.nodes[k]?.ending)&&!keys.some(k=>visited.has(k)&&(story.nodes[k].choices||[]).some(c=>c.next==='__ending__')))warnings.push('No ending is reachable from the start. Check your links.');
 return {errors,warnings};
}
async function init(){
 document.getElementById('new-scenario').onclick=createScenario;
 document.getElementById('import-button').onclick=()=>document.getElementById('import-file').click();
 document.getElementById('import-file').onchange=importScenario;
 try{
  const r=await db.auth.getUser();if(r.error||!r.data.user){el.innerHTML='<div class="card"><h2>Instructor sign-in required</h2><p>Use the Instructor Command Center to sign in before opening the visual builder.</p><a class="btn primary" href="/leadership101-live.html">Open Instructor Command Center</a></div>';return}
  const userCheck=await db.from('l101_live_instructors').select('user_id').eq('user_id',r.data.user.id).maybeSingle();
  if(userCheck.error||!userCheck.data){el.innerHTML='<div class="error">This account is not assigned the Leadership 101 instructor role.</div>';return}
  user=r.data.user;document.getElementById('user-label').textContent='Instructor access confirmed';
  await reload();
 }catch(e){el.innerHTML='<div class="error">'+h(e.message)+'</div>'}
}
async function reload(){
 const [p,d]=await Promise.all([
 db.from('l101_live_scenarios').select('id,title,payload').order('title'),
 db.from('l101_live_scenario_drafts').select('id,owner_id,scenario_id,title,draft,version,updated_at,last_published_at').order('updated_at',{ascending:false})]);
 if(p.error)throw p.error;if(d.error)throw d.error;
 published=p.data||[];drafts=d.data||[];renderLibrary();if(current){current=drafts.find(x=>x.id===current.id)||current;render()}else{el.innerHTML='<div class="card soft"><span class="eyebrow">Instructor authoring</span><h2>Build leadership situations visually.</h2><p>Open an existing scenario on the left, or create a new one. Edit scenes, add response branches, choose character reactions, test alternate endings, and save drafts before publishing.</p><div class="tiles"><button class="tile" data-start="new"><strong>＋ Create a scenario</strong><small>Start with a two-ending story template</small></button><button class="tile" data-start="existing"><strong>✎ Edit an existing case</strong><small>Preserve original scenarios until you publish</small></button></div></div>';el.querySelectorAll('[data-start]').forEach(b=>b.onclick=()=>b.dataset.start==='new'?createScenario():openPublished(published[0]?.id))}}
function renderLibrary(){
 library.innerHTML='<div class="eyebrow" style="margin-top:15px">Your drafts ('+drafts.length+')</div>'+ (drafts.length?drafts.map(d=>'<button class="library-item '+(current?.id===d.id?'selected':'')+'" data-draft="'+h(d.id)+'"><b>'+h(d.title)+'</b><small>Draft · '+(d.last_published_at?'Published version '+d.version:'Unpublished')+'</small></button>').join(''):'<p class="muted small">No drafts yet.</p>')
 +'<div class="eyebrow" style="margin-top:17px">Published library ('+published.length+')</div>'+published.map(s=>'<button class="library-item" data-live="'+h(s.id)+'"><b>'+h(s.title)+'</b><small>Open as an editable draft</small></button>').join('');
 library.querySelectorAll('[data-draft]').forEach(b=>b.onclick=()=>openDraft(b.dataset.draft));
 library.querySelectorAll('[data-live]').forEach(b=>b.onclick=()=>openPublished(b.dataset.live));
}
async function openPublished(id){
 if(!id)return;if(dirty&&!confirm('Discard unsaved local changes and open another scenario?'))return;
 const d=drafts.find(x=>x.scenario_id===id);if(d){current=d;dirty=false;panel='overview';selectedNode=current.draft.story?.start||'';preview=null;renderLibrary();render();return}
 const master=published.find(x=>x.id===id);if(!master)return;
 let payload=clone(master.payload);if(!payload.id)payload.id=id;
 const r=await db.from('l101_live_scenario_drafts').upsert({owner_id:user.id,scenario_id:id,title:master.title,draft:payload,updated_at:new Date().toISOString()},{onConflict:'owner_id,scenario_id'}).select('*').single();
 if(r.error){toast(r.error.message,true);return}current=r.data;dirty=false;panel='overview';selectedNode=payload.story?.start||'';preview=null;await reload();renderLibrary();
}
function openDraft(id){
 if(dirty&&!confirm('Discard unsaved local changes and open another draft?'))return;
 current=drafts.find(d=>d.id===id);if(!current)return;dirty=false;panel='overview';selectedNode=current.draft.story?.start||'';preview=null;renderLibrary();render();
}
async function createScenario(){
 if(!user){toast('Sign in as an instructor first.',true);return}
 if(dirty&&!confirm('Discard unsaved changes and create a new scenario?'))return;
 const id='scenario-'+uid(),name='New Leadership Scenario',payload=defaultScenario(id,name);
 const r=await db.from('l101_live_scenario_drafts').insert({owner_id:user.id,scenario_id:id,title:name,draft:payload}).select('*').single();
 if(r.error){toast(r.error.message,true);return}
 current=r.data;dirty=false;panel='overview';selectedNode=payload.story.start;preview=null;await reload();renderLibrary();
}
function render(){
 if(!current)return;
 const d=current.draft,nav=['overview','scenes','map','characters','injects','checkpoints','preview','advanced'],names=['Overview','Scenes & Choices','Branch Map','Characters','Injects','Checkpoints','Try the Story','JSON'];
 let content='';
 try{content=({overview:overviewHTML,scenes:scenesHTML,map:mapHTML,characters:charactersHTML,injects:injectsHTML,checkpoints:checkpointsHTML,preview:previewHTML,advanced:advancedHTML})[panel]()}catch(e){content='<div class="error">'+h(e.message)+'</div>'}
 el.innerHTML='<div class="toolbar"><div class="spread"><div><span class="eyebrow">Visual scenario builder</span><h1>'+h(d.title||current.title)+'</h1><div class="row">'+statusHTML()+'</div></div><div class="row"><button class="btn" id="save">Save Draft</button><button class="btn gold" id="publish">Publish to Classroom Library</button><button class="btn" id="export">Export JSON</button></div></div></div><div class="tabs">'+nav.map((n,i)=>'<button class="'+(panel===n?'active':'')+'" data-tab="'+n+'">'+names[i]+'</button>').join('')+'</div><section id="builder-panel">'+content+'</section>';
 el.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{panel=b.dataset.tab;if(panel==='preview')resetPreview();render()});
 document.getElementById('save').onclick=saveDraft;
 document.getElementById('publish').onclick=publish;
 document.getElementById('export').onclick=exportJson;
 el.querySelectorAll('[data-root]').forEach(input=>input.onchange=()=>{let k=input.dataset.root;d[k]=input.value;if(k==='title')current.title=input.value;dirty=true;updateBadges()});
 el.querySelectorAll('[data-scene-field]').forEach(input=>input.onchange=()=>{let node=ensureStory().nodes[selectedNode];node[input.dataset.sceneField]=input.type==='number'?Number(input.value):input.value;dirty=true;updateBadges()});
 el.querySelectorAll('[data-choice-field]').forEach(input=>input.onchange=()=>{let c=ensureStory().nodes[selectedNode].choices[Number(input.dataset.choiceIndex)];c[input.dataset.choiceField]=input.type==='number'?Number(input.value):input.value;dirty=true;updateBadges()});
 el.querySelectorAll('[data-action]').forEach(b=>b.onclick=()=>action(b.dataset.action,b.dataset.id,b.dataset.idx));
 el.querySelectorAll('[data-actor-field]').forEach(input=>input.onchange=()=>{d.characters[Number(input.dataset.idx)][input.dataset.actorField]=input.value;dirty=true;updateBadges()});
 el.querySelectorAll('[data-inject-field]').forEach(input=>input.onchange=()=>{d.injects[Number(input.dataset.idx)][input.dataset.injectField]=input.value;dirty=true;updateBadges()});
 el.querySelectorAll('[data-moment-field]').forEach(input=>input.onchange=()=>{d.moments[Number(input.dataset.idx)][input.dataset.momentField]=input.value;dirty=true;updateBadges()});
 el.querySelectorAll('[data-preview-choice]').forEach(b=>b.onclick=()=>previewChoose(Number(b.dataset.previewChoice)));
}
function updateBadges(){let labels=el.querySelector('.toolbar .row');if(labels)labels.innerHTML=statusHTML()}
function overviewHTML(){const d=ensure(),story=d.story,checks=story?validateStory(story):null;
 return '<div class="card soft"><h3>Story foundation</h3><div class="fields">'+field('Scenario title','title',d.title,{full:true})+field('Subtitle','subtitle',d.subtitle)+field('Description','description',d.description,{full:true,long:true})+field('Student briefing','briefing',d.briefing,{full:true,long:true})+field('Leadership mission','mission',d.mission,{full:true,long:true})+'</div></div>'
 +'<div class="tiles"><div class="card soft"><h3>Scenario contents</h3><p>'+(story?choicesOf(story).length+' branching scenes':'No story enabled')+' · '+(d.characters||[]).length+' characters · '+(d.injects||[]).length+' injects · '+(d.moments||[]).length+' original checkpoints</p><button class="btn primary" data-action="go-scenes">Edit the scenes →</button></div><div class="card soft"><h3>Readiness</h3>'+(checks?checks.errors.length?'<p class="error">'+checks.errors.length+' validation errors</p>':'<p class="success">✓ Branch links validated</p>':'<p class="warning">This scenario has no branching story.</p>')+'<button class="btn" data-action="go-map">Inspect the path map →</button></div></div>'
 +'<div class="notice">Publishing updates the master scenario for <b>future</b> classrooms. Students already enrolled in existing classrooms continue using their locked scenario snapshot.</div>';
}
function sceneListHTML(story){return '<div class="node-grid">'+choicesOf(story).map(k=>{let n=story.nodes[k];return '<button class="node-card '+(selectedNode===k?'selected':'')+'" data-action="select-scene" data-id="'+h(k)+'"><span class="dot '+(n.ending?'end':'')+'">'+(n.ending?'Ending':'Act '+(n.act||1))+'</span><strong>'+h(n.title||k)+'</strong><small>'+h(k)+'</small></button>'}).join('')+'</div>'}
function scenesHTML(){const d=ensure();if(!d.story)return '<div class="card"><h3>Enable branching for this case</h3><p>Add a story graph without removing the original checkpoints.</p><button class="btn primary" data-action="enable-story">Create branching story</button></div>';
 const story=d.story,ids=choicesOf(story);if(!selectedNode||!story.nodes[selectedNode])selectedNode=story.start||ids[0];
 const n=story.nodes[selectedNode];let html='<div class="spread"><h3 style="margin:0">Scene Map & Decisions</h3><button class="btn gold" data-action="add-scene">+ Add scene</button></div><p class="muted">Select a scene to edit what the learner sees and which branches follow.</p>'+sceneListHTML(story)+'<hr style="border:0;border-top:1px solid #e0edf5;margin:18px 0">';
 html+='<div class="card soft"><div class="spread"><div><span class="eyebrow">Editing: '+h(selectedNode)+'</span><h3>'+h(n.title||'Untitled scene')+'</h3></div><div class="row"><button class="btn compact" data-action="set-start">Make opening scene</button><button class="btn danger compact" data-action="delete-scene">Remove scene</button></div></div><div class="fields">'+sceneField('Title','title',n.title,{full:true})+sceneField('Act','act',n.act||1,{number:true})+sceneField('Background','scene',n.scene||'meeting',{values:scenes})+sceneField('Place','setting',n.setting||'')+sceneField('Speaking character','speaker',n.speaker||'')+sceneField('Character expression','tone',n.tone||'neutral',{values:emotions})+sceneField('Situation / dialogue','text',n.text||'',{full:true,long:true})+'</div></div>';
 html+='<div class="card"><div class="spread"><h3>Branching decisions</h3><label style="display:flex;align-items:center;gap:8px"><input type="checkbox" style="width:auto" id="ending-toggle" '+(n.ending?'checked':'')+'> This scene is an ending</label></div>';
 if(n.ending){html+='<div class="fields">'+sceneField('Ending reflection prompt','reflection',n.reflection||'',{full:true,long:true})+'</div>'}
 else{html+='<div class="fields">'+sceneField('Decision question','prompt',n.prompt||'',{full:true,long:true})+'</div><p class="muted small">Each choice routes to a destination scene and adjusts leadership confidence and pressure.</p>'+(n.choices||[]).map((c,i)=>'<div class="choice-editor"><div class="spread"><b>Choice '+(i+1)+'</b><button class="btn danger compact" data-action="delete-choice" data-idx="'+i+'">Remove</button></div><div class="fields">'+
 choiceField('Learner choice','text',c.text,i,{full:true,long:true})+choiceField('Next scene','next',c.next,i,{targets:ids})+choiceField('Trust impact','trust',c.trust||0,i,{number:true})+choiceField('Pressure impact','pressure',c.pressure||0,i,{number:true})+choiceField('Character reaction','reaction',c.reaction||'',i,{full:true,long:true})+choiceField('Coaching insight','coaching',c.coaching||'',i,{full:true,long:true})+'</div></div>').join('')+'<button class="btn primary" data-action="add-choice">+ Add response branch</button>'}
 html+='</div>';setTimeout(()=>{const toggle=document.getElementById('ending-toggle');if(toggle)toggle.onchange=()=>{n.ending=toggle.checked;if(n.ending)delete n.choices;else n.choices=[{text:'Respond constructively',next:story.start,trust:1,pressure:-1,reaction:'The team member listens.',coaching:'Stay specific.'}];dirty=true;render()}},0);
 return html;
}
function choiceField(title,key,value,index,opts={}){return '<label class="'+(opts.full?'full':'')+'">'+h(title)+(opts.targets?'<select data-choice-index="'+index+'" data-choice-field="'+h(key)+'">'+opts.targets.map(t=>'<option value="'+h(t)+'"'+(value===t?' selected':'')+'>'+h(storyTitle(t))+'</option>').join('')+'</select>':opts.long?'<textarea data-choice-index="'+index+'" data-choice-field="'+h(key)+'">'+h(value)+'</textarea>':'<input '+(opts.number?'type="number"':'')+' data-choice-index="'+index+'" data-choice-field="'+h(key)+'" value="'+h(value)+'">')+'</label>'}
function storyTitle(id){let n=ensureStory().nodes[id];return n?(n.title||id)+' ('+id+')':id}
function mapHTML(){const d=ensure();if(!d.story)return '<div class="notice">Create a branching story on the Scenes tab first.</div>';
 const s=d.story,groups={};choicesOf(s).forEach(k=>{let n=s.nodes[k],stage=n.act||1;(groups[stage]||(groups[stage]=[])).push([k,n])});
 let html='<div class="spread"><h3>Story route map</h3><button class="btn" data-action="go-scenes">Open scene editor</button></div><p class="muted">Each box represents a scene. Click a box to edit it. Arrows are shown as next-scene labels.</p><div class="graph-stage">';
 Object.keys(groups).sort((a,b)=>a-b).forEach(act=>{html+='<div class="graph-band"><div class="stage-label">Act '+h(act)+'</div><div class="graph-row">'+groups[act].map(([id,n])=>'<button class="graph-node '+(n.ending?'ending':'')+'" data-action="select-scene" data-id="'+h(id)+'"><b>'+h(n.title||id)+'</b><small>'+(n.ending?'◆ Story ending':(n.choices||[]).map(c=>'→ '+h(c.next||'(missing)')).join(' · '))+'</small></button>').join('')+'</div></div>'});html+='</div>';
 const checks=validateStory(s);html+='<div class="card" style="margin-top:15px"><h3>Story validation</h3>'+(!checks.errors.length?'<div class="validation good">✓ All decision destinations exist.</div>':checks.errors.map(e=>'<div class="validation bad">'+h(e)+'</div>').join(''))+checks.warnings.map(e=>'<div class="validation">'+h(e)+'</div>').join('')+'</div>';return html;
}
function charactersHTML(){
 const d=ensure();
 return '<div class="spread"><h3>Character conversations</h3><button class="btn gold" data-action="add-character">+ Character</button></div>'
 +'<p class="muted">Build each character’s identity and scripted conversation. The student’s choice determines the character’s reply and the next turn.</p>'
 +(d.characters||[]).map((c,i)=>'<div class="card"><div class="spread"><b>'+h(c.name||'Character '+(i+1))+'</b><button class="btn danger compact" data-action="delete-character" data-idx="'+i+'">Remove character</button></div>'
 +'<div class="fields">'+actorField('Name','name',c.name,i)+actorField('Role','role',c.role,i)+actorField('Public information','publicInfo',c.publicInfo,i,true)+actorField('Temperament','temperament',c.temperament,i,true)+'</div>'
 +'<details><summary>Scripted conversation turns ('+(c.turns||[]).length+')</summary>'
 +(c.turns||[]).map((turn,t)=>'<div class="choice-editor"><div class="spread"><b>Turn '+(t+1)+'</b><button class="btn danger compact" data-action="delete-turn" data-idx="'+i+'" data-id="'+t+'">Remove turn</button></div>'
 +'<label>Character dialogue / prompt<textarea data-character-index="'+i+'" data-turn-index="'+t+'" data-turn-field="prompt">'+h(turn.prompt||'')+'</textarea></label>'
 +'<p class="small muted">Each student response controls the next turn. Use -1 to finish the conversation.</p>'
 +(turn.options||[]).map((o,oIdx)=>'<div class="choice-editor"><div class="spread"><b>Student reply '+(oIdx+1)+'</b><button class="btn danger compact" data-action="delete-turn-option" data-idx="'+i+'" data-id="'+t+'|'+oIdx+'">Remove reply</button></div>'
 +'<div class="fields">'+turnOptionField('Student says','text',o.text,i,t,oIdx,true)+turnOptionField('Character responds','response',o.response,i,t,oIdx,true)+turnOptionField('Coaching tip','tip',o.tip,i,t,oIdx,true)+turnOptionField('Relationship impact','delta',o.delta||0,i,t,oIdx,false,true)+turnOptionField('Next turn (-1 = end)','next',o.next==null?-1:o.next,i,t,oIdx,false,true)+'</div></div>').join('')
 +'<button class="btn compact" data-action="add-turn-option" data-idx="'+i+'" data-id="'+t+'">+ Reply option</button></div>').join('')
 +'<button class="btn" data-action="add-turn" data-idx="'+i+'">+ Conversation turn</button></details></div>').join('')
 +(!d.characters.length?'<div class="notice">Add a character to start authoring conversations.</div>':'');
}
function turnOptionField(label,key,value,ci,ti,oi,long,number){
 let props='data-character-index="'+ci+'" data-turn-index="'+ti+'" data-option-index="'+oi+'" data-turn-option-field="'+h(key)+'"';
 return '<label class="'+(long?'full':'')+'">'+h(label)+(long?'<textarea '+props+'>'+h(value||'')+'</textarea>':'<input '+(number?'type="number"':'')+' '+props+' value="'+h(value)+'">')+'</label>';
}
function actorField(title,key,value,index,long){return '<label class="'+(long?'full':'')+'">'+h(title)+(long?'<textarea data-idx="'+index+'" data-actor-field="'+h(key)+'">'+h(value||'')+'</textarea>':'<input data-idx="'+index+'" data-actor-field="'+h(key)+'" value="'+h(value||'')+'">')+'</label>'}
function injectsHTML(){const d=ensure();return '<div class="spread"><h3>Instructor inject library</h3><button class="btn gold" data-action="add-inject">+ New inject</button></div><p class="muted">Injects are complications the instructor can release into the story. Existing classroom inject delivery remains under instructor control.</p>'+(d.injects||[]).map((x,i)=>'<div class="card"><div class="spread"><b>Inject '+(i+1)+'</b><button class="btn danger compact" data-action="delete-inject" data-idx="'+i+'">Remove</button></div><div class="fields">'+injectField('Title','title',x.title,i)+injectField('Leadership focus','focus',x.focus,i)+injectField('Unexpected development','text',x.text,i,true)+'</div></div>').join('')||'<div class="notice">No instructor injects added yet.</div>'}
function injectField(title,key,value,index,long){return '<label class="'+(long?'full':'')+'">'+h(title)+(long?'<textarea data-idx="'+index+'" data-inject-field="'+h(key)+'">'+h(value||'')+'</textarea>':'<input data-idx="'+index+'" data-inject-field="'+h(key)+'" value="'+h(value||'')+'">')+'</label>'}
function checkpointsHTML(){
 const d=ensure();
 return '<div class="spread"><h3>Original decision checkpoints</h3><button class="btn gold" data-action="add-moment">+ Checkpoint</button></div>'
 +'<div class="notice">These decisions are a separate structured practice track. The immersive story remains available in parallel.</div>'
 +(d.moments||[]).map((m,i)=>'<div class="card"><div class="spread"><b>Checkpoint '+(i+1)+': '+h(m.title)+'</b><button class="btn danger compact" data-action="delete-moment" data-idx="'+i+'">Remove checkpoint</button></div>'
 +'<div class="fields">'+momentField('Title','title',m.title,i)+momentField('Team member','trainee',m.trainee,i)+momentField('Observed behavior','behavior',m.behavior,i,true)+momentField('Decision question','question',m.question,i,true)+momentField('Background','context',m.context,i,true)+'</div>'
 +'<details><summary>Prepared response choices ('+(m.options||[]).length+')</summary>'
 +(m.options||[]).map((o,oi)=>'<div class="choice-editor"><div class="spread"><b>Prepared choice '+(oi+1)+'</b><button class="btn danger compact" data-action="delete-moment-option" data-idx="'+i+'" data-id="'+oi+'">Remove choice</button></div>'
 +'<div class="fields">'+momentOptionField('Leadership action','action',o.action,i,oi,true)+momentOptionField('Expected rating','outcome',o.outcome||'neutral',i,oi,false,true)+'</div></div>').join('')
 +'<button class="btn" data-action="add-moment-option" data-idx="'+i+'">+ Prepared response</button></details></div>').join('')
 +(!d.moments.length?'<div class="notice">No fixed-sequence checkpoints have been authored.</div>':'');
}
function momentOptionField(label,key,value,mi,oi,long,pick){
 const attrs='data-moment-index="'+mi+'" data-moment-option-index="'+oi+'" data-moment-option-field="'+h(key)+'"';
 return '<label class="'+(long?'full':'')+'">'+h(label)+(pick?'<select '+attrs+'>'+['effective','neutral','high-risk'].map(x=>'<option value="'+x+'"'+(value===x?' selected':'')+'>'+x+'</option>').join('')+'</select>':long?'<textarea '+attrs+'>'+h(value||'')+'</textarea>':'<input '+attrs+' value="'+h(value||'')+'">')+'</label>';
}
function momentField(title,key,value,index,long){return '<label class="'+(long?'full':'')+'">'+h(title)+(long?'<textarea data-idx="'+index+'" data-moment-field="'+h(key)+'">'+h(value||'')+'</textarea>':'<input data-idx="'+index+'" data-moment-field="'+h(key)+'" value="'+h(value||'')+'">')+'</label>'}
function resetPreview(){let s=ensure().story;if(!s){preview=null;return}preview={node:s.start,trust:0,pressure:0,trail:[]}}
function previewHTML(){const d=ensure(),s=d.story;if(!s)return '<div class="notice">No story yet; create it from Scenes & Choices.</div>';
 if(!preview)resetPreview();const n=s.nodes[preview.node];if(!n)return '<div class="error">Opening scene is missing. Repair story connections.</div>';
 const destinations=choicesOf(s);
 return '<div class="spread"><h3>Playtest your scenario</h3><button class="btn" data-action="reset-preview">↻ Restart story</button></div><p class="muted">This is a local authoring preview. It does not create a student record or send notifications.</p>'
 +'<div class="row" style="margin:12px 0"><span class="badge">Trust '+preview.trust+'</span><span class="badge">Pressure '+preview.pressure+'</span><span class="badge gold">'+preview.trail.length+' decisions</span></div>'
 +'<div class="preview-scene"><span class="eyebrow">Act '+h(n.act||1)+' · '+h(n.setting||'Leadership scene')+'</span><h2>'+h(n.title||preview.node)+'</h2><span>'+h(n.speaker||'Narrator')+'</span><p>'+h(n.text||'')+'</p></div>'
 +'<div class="card soft" style="margin-top:13px"><h3>'+(n.ending?'Story ending':h(n.prompt||'What will you do next?'))+'</h3>'+(n.ending?'<p>'+h(n.reflection||'Reflect on your choices.')+'</p>':(n.choices||[]).map((choice,i)=>'<button class="preview-choice" data-preview-choice="'+i+'"><b>'+String.fromCharCode(65+i)+'</b>'+h(choice.text||'Untitled choice')+'</button>').join(''))+'</div>'
 +(preview.trail.length?'<details open><summary>Your preview path ('+preview.trail.length+')</summary>'+preview.trail.map((step,i)=>'<div class="validation">'+(i+1)+'. '+h(step.text)+' → '+h(step.next)+'<br><small>'+h(step.reaction||'')+'</small></div>').join('')+'</details>':'');
}
function previewChoose(i){let s=ensure().story,n=s.nodes[preview.node],c=n?.choices?.[i];if(!c)return;
 preview.trust+=Number(c.trust||0);preview.pressure+=Number(c.pressure||0);let next=c.next;
 if(next==='__ending__')next=preview.trust>=6&&preview.pressure<=4?'ending-strong':preview.trust>=0&&preview.pressure<=9?'ending-fragile':'ending-damaged';
 preview.trail.push({text:c.text,next,reaction:c.reaction});preview.node=next;render();
}
function advancedHTML(){return '<div class="card"><h3>Advanced scenario JSON</h3><p class="muted">All data, including original prepared-choice outcomes and character conversation scripts, is included in your JSON. Use the visual tabs for typical authoring and export the source for backup.</p><pre>'+h(JSON.stringify(ensure(),null,2))+'</pre></div>'}
function action(key,id,idx){
 let d=ensure(),s=d.story,node=s&&s.nodes[selectedNode],i=Number(idx);
 switch(key){
 case 'go-scenes':panel='scenes';break;case 'go-map':panel='map';break;
 case 'enable-story':ensureStory();selectedNode=d.story.start;panel='scenes';break;
 case 'select-scene':selectedNode=id;panel='scenes';break;
 case 'add-scene':{let story=ensureStory(),key='scene-'+uid();story.nodes[key]={title:'New Leadership Scene',act:2,setting:'Workplace',scene:'office',speaker:'Team member',tone:'neutral',text:'Describe what happens next.',prompt:'What will you do?',choices:[{text:'Take an accountable action.',next:story.start,trust:1,pressure:-1,reaction:'The character responds.',coaching:'Explain the consequence.'}]};selectedNode=key;break}
 case 'set-start':s.start=selectedNode;break;
 case 'delete-scene':if(choicesOf(s).length<=2){toast('Keep at least two scenes.',true);return}if(Object.keys(s.nodes).some(k=>k!==selectedNode&&(s.nodes[k].choices||[]).some(c=>c.next===selectedNode))){toast('Another scene links here. Change its destination first.',true);return}if(!confirm('Remove this scene?'))return;delete s.nodes[selectedNode];if(s.start===selectedNode)s.start=choicesOf(s)[0];selectedNode=s.start;break;
 case 'add-choice':node.choices=node.choices||[];node.choices.push({text:'New leadership response',next:s.start,trust:0,pressure:0,reaction:'Describe the consequence.',coaching:'Describe what the learner should notice.'});break;
 case 'delete-choice':if(!node.choices||node.choices.length<=1){toast('Each decision scene needs a response.',true);return}node.choices.splice(i,1);break;
 case 'add-character':d.characters.push({id:'actor-'+uid(),name:'New team member',role:'Team member',publicInfo:'',temperament:'',turns:[]});break;
 case 'delete-character':if(!confirm('Remove this character?'))return;d.characters.splice(i,1);break;
 case 'add-inject':d.injects.push({id:'inj-'+uid(),title:'Unexpected development',text:'Describe a new situation.',focus:'Accountability'});break;
 case 'delete-inject':d.injects.splice(i,1);break;
 case 'add-moment':d.moments.push({title:'New checkpoint',trainee:'Team member',behavior:'Describe observed behavior.',context:'',question:'How should the leader respond?',options:[{action:'Take an accountable action.',outcome:'effective'},{action:'Avoid the issue.',outcome:'high-risk'}]});break;
 case 'delete-moment':d.moments.splice(i,1);break;
 case 'reset-preview':resetPreview();break;
 default:return;
 }
 dirty=true;render();
}
async function saveDraft(){
 if(!current)return;
 const d=ensure();if(!nameOf(d.title).trim()){toast('Enter a title before saving.',true);return}
 d.id=current.scenario_id;
 const payload={id:current.id,owner_id:user.id,scenario_id:current.scenario_id,title:d.title,draft:d,updated_at:new Date().toISOString()};
 const r=await db.from('l101_live_scenario_drafts').upsert(payload,{onConflict:'owner_id,scenario_id'}).select('*').single();
 if(r.error){toast('Could not save: '+r.error.message,true);return}
 current=r.data;dirty=false;toast('Draft saved. No students have been affected.');await reload();
}
async function publish(){
 if(!current)return;
 const d=ensure(),check=d.story?validateStory(d.story):{errors:[],warnings:[]};
 if(check.errors.length){panel='map';render();toast('Fix '+check.errors.length+' branching validation error(s) before publishing.',true);return}
 if(!confirm('Publish "'+d.title+'" to the instructor library? New classrooms will use this version. Existing classrooms keep their current content.'))return;
 await saveDraft();if(dirty)return;
 const r=await db.rpc('l101_publish_draft',{p_draft_id:current.id});
 if(r.error){toast('Publishing failed: '+r.error.message,true);return}
 toast('Published version '+r.data.version+' to the classroom library.');await reload();
}
function exportJson(){
 const d=ensure(),blob=new Blob([JSON.stringify(d,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download=(d.id||'leadership-scenario')+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),2000)
}
async function importScenario(ev){
 const file=ev.target.files?.[0];if(!file||!user)return;
 try{let raw=JSON.parse(await file.text());if(Array.isArray(raw.scenarios))raw=raw.scenarios[0];if(!raw.title||!Array.isArray(raw.moments))throw Error('File must include a scenario title and moments array.');
 let id='import-'+uid();raw=clone(raw);raw.id=id;
 const result=await db.from('l101_live_scenario_drafts').insert({owner_id:user.id,scenario_id:id,title:raw.title,draft:raw}).select('*').single();
 if(result.error)throw result.error;current=result.data;dirty=false;panel='overview';selectedNode=raw.story?.start||'';preview=null;await reload();toast('Imported as a private draft. Review and publish when ready.');
 }catch(e){toast('Import failed: '+e.message,true)}finally{ev.target.value=''}
}
init();