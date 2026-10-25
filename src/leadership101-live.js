import { createClient } from '@supabase/supabase-js';
import QRCode from 'qrcode';
import {portraitHTML} from '../assets/leadership-characters.js';
window.lead101QR=QRCode;
window.supabase={createClient};

(function(){
'use strict';
var API_URL="https://vteamreihsunsllwcphw.supabase.co",PUB_KEY="sb_publishable_dFlcGsz0Fu1TifebqIu4fQ_6aLjG7ud",db=null;
var lastInstructorHash='';var page='student',studentToken=localStorage.getItem('l101_live_token')||'',studentData=null,scenarioIndex=0,dialogueCharacter=-1,studentReportOpen=false,submissionBusy=false,joinBusy=false,injectBusy=false,storyMode='story',storySubmitting=false,instructorUser=null,classes=[],scenarios=[],participants=[],responses=[],injects=[],histories=[],dialogueLogs=[],recoveryRows=[],storyRuns=[],storyEvents=[],selectedClass='',timer=null,editingScenario='';
var notificationDraftGrades={},notificationDraftNotes={},notificationDraftRubrics={},notificationMessageRows={},notificationMessageDrafts={};
var notificationRows=[],notificationResponseRows={},notificationsReady=false,notificationsOpen=false,notificationsFilter='attention',notificationBusy=false,notificationPolling=false;
var notificationsChannel=null,notificationsChannelOwner='';
var notifiedIds=new Set(),soundEnabled=localStorage.getItem('l101_notify_sound')==='yes',desktopEnabled=localStorage.getItem('l101_notify_desktop')==='yes';
var app=document.getElementById('app');
var pendingStudentRender=false,studentDraftInputs={},previousConnectionState='';
function studentDraftKey(){return 'l101_unsent_'+(studentToken||'not-joined')}
function loadStudentDrafts(){try{studentDraftInputs=JSON.parse(sessionStorage.getItem(studentDraftKey())||'{}')||{}}catch(e){studentDraftInputs={}}}
function persistStudentDrafts(){try{sessionStorage.setItem(studentDraftKey(),JSON.stringify(studentDraftInputs))}catch(e){}}
function clearAllStudentDrafts(){try{sessionStorage.removeItem(studentDraftKey())}catch(e){}studentDraftInputs={}}
loadStudentDrafts();
function setStudioConnection(state,message){
 var box=document.getElementById('l101-connection'),label=document.getElementById('l101-connection-text'),button=document.getElementById('l101-refresh-now');
 if(!box||!label)return;
 previousConnectionState=state;box.hidden=state==='online';box.dataset.state=state;
 label.textContent=message||(state==='updates'?'Instructor updates are ready. Finish writing, then apply them.':'The online connection was interrupted. Your previously submitted work remains saved.');
 if(button)button.textContent=state==='updates'?'Apply updates':'Retry connection';
}
function restoreStudentDrafts(){
 Object.keys(studentDraftInputs).forEach(function(id){var input=document.getElementById(id);if(input)input.value=studentDraftInputs[id]});
}
function clearStudentDraft(id){delete studentDraftInputs[id];persistStudentDrafts()}

function h(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function val(id){var x=document.getElementById(id);return x?x.value:''}
function flash(msg,err){var x=document.getElementById('feedback');x.textContent=msg;x.style.background=err?'#993346':'#123f69';x.style.display='block';clearTimeout(flash.t);flash.t=setTimeout(function(){x.style.display='none'},4500)}
function busy(msg){app.innerHTML='<div class="panel"><h2>'+h(msg||'Loading…')+'</h2></div>'}
function error(e){flash(e&&e.message?e.message:String(e),true)}
function qs(s){return new URLSearchParams(location.search).get(s)||''}
function progress(data){return (data.responses||[]).filter(function(x){return !!x.rating}).length}
function scenarioMoment(data,n){return data.scenario.moments[n]||null}
function sessionReport(data){
 var moments=data.scenario.moments||[],rows=(data.responses||[]).slice().sort(function(a,b){return a.observation_index-b.observation_index}).map(function(r){
  var m=moments[r.observation_index]||{},con=r.consequence||{},rec=(data.recovery_plans||[]).find(function(x){return x.observation_index===r.observation_index}),rubric=r.rubric||{};
  return '<section class="l101-report-item"><h2>'+h((r.observation_index+1)+'. '+(m.title||'Leadership decision'))+'</h2>'
  +'<p><b>Situation:</b> '+h(m.behavior||'')+'</p><p><b>Decision:</b> '+h(m.question||'')+'</p>'
  +'<p><b>Student response:</b> '+h(r.submitted_text)+'</p><p><b>Observer evaluation:</b> '+h(r.rating||'Awaiting review')+'</p>'
  +'<p><b>Instructor comments:</b> '+h(r.observer_comment||'—')+'</p>'
  +(Object.keys(rubric).length?'<p><b>Competencies:</b> '+Object.entries(rubric).map(function(e){return h(e[0])+': '+h(e[1])}).join(' · ')+'</p>':'')
  +(con.reaction?'<p><b>Character reaction:</b> '+h(con.reaction)+'</p>':'')
  +(con.lesson?'<p><b>Coaching insight:</b> '+h(con.lesson)+'</p>':'')
  +(rec?'<p><b>Recovery plan:</b> '+h(rec.plan)+'</p>':'')
  +'</section>';
 }).join('');
 var conversations=data.dialogue||[],characters=data.scenario.characters||[];
 var dialogueHtml=conversations.length?'<section><h2>Character conversations</h2>'+conversations.map(function(turn){
  var ch=characters[turn.character_index]||{};return '<p><b>'+h(ch.name||'Character')+':</b> '+h(turn.chosen_text)+'<br><b>Reaction:</b> '+h(turn.reply_text)+'<br><b>Coaching:</b> '+h(turn.coaching_tip||'—')+'</p>';
 }).join('')+'</section>':'';
 var history=data.response_history||[],story=data.story||{},storyHistory=story.history||[],storyRun=story.run||story;
 var storyHtml=storyHistory.length?'<section><h2>Branching leadership journey</h2><p><b>Story outcome:</b> '+h(story.node&&story.finished?story.node.title:storyRun.current_node||'In progress')+'</p>'+storyHistory.map(function(ev,i){return '<p><b>'+(i+1)+'. '+(ev.is_inject?'Instructor inject':'Leadership decision')+':</b> '+h(ev.choice||'')+'<br><b>Consequence:</b> '+h(ev.reaction||'')+(ev.coaching?'<br><b>Coaching insight:</b> '+h(ev.coaching):'')+'</p>'}).join('')+'</section>':'';
 return '<div><h1>Leadership 101 — Student Leadership Report</h1><p><b>Participant:</b> '+h(data.participant.name)+'</p>'
 +'<p><b>Class:</b> '+h(data.class.title)+'</p><p><b>Scenario:</b> '+h(data.scenario.title)+'</p>'
 +'<p><b>Evaluated checkpoints:</b> '+progress(data)+' / '+moments.length+'</p>'
 +'<p><b>Recorded decision events:</b> '+history.length+'</p><hr>'+storyHtml+rows+dialogueHtml
 +'<section><h2>Personal Reflection</h2><p>'+h(data.participant.reflection||'No reflection recorded')+'</p></section>'
 +(history.length?'<section><h2>Attempt history</h2>'+history.map(function(ev){
   return '<p><b>Observation '+(ev.observation_index+1)+' · '+h(ev.event)+':</b> '+h(ev.submitted_text||'—')+' ('+h(ev.rating||'Pending')+')</p>';
 }).join('')+'</section>':'')
 +'<p class="small">Mayne Leadership · Leadership role-play learning record. Indicators are educational, not clinical or employment assessments.</p></div>';
}
function setPrint(data){document.getElementById('print-report').innerHTML=sessionReport(data)}
function stat(n,label){return '<div class="stat"><b>'+h(n)+'</b><span class="small">'+h(label)+'</span></div>'}
function download(filename,data){var blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),a=document.createElement('a'),u=URL.createObjectURL(blob);a.href=u;a.download=filename;a.click();setTimeout(function(){URL.revokeObjectURL(u)},1500)}
function setMode(mode){page=mode;setStudioConnection('online');if(mode!=='instructor'){closeNotificationPanel();stopNotificationSubscription()}updateNotificationBell();document.getElementById('tab-student').classList.toggle('selected',mode==='student');document.getElementById('tab-student').setAttribute('aria-selected',String(mode==='student'));document.getElementById('tab-instructor').classList.toggle('selected',mode==='instructor');document.getElementById('tab-instructor').setAttribute('aria-selected',String(mode==='instructor'));document.getElementById('hero-title').textContent=mode==='student'?'Lead through the moment.':'Instructor Command Center';document.getElementById('hero-subtitle').textContent=mode==='student'?'Join a classroom, observe behavior, and practice leadership.':'Create sessions, evaluate student responses, and introduce live challenges.';if(mode==='student'){studentRender()}else{instructorLoad()}}
async function init(){if(!window.supabase||!window.supabase.createClient){app.innerHTML='<div class="error">The online connection library did not load. Please check internet access or try again.</div>';return}db=window.supabase.createClient(API_URL,PUB_KEY,{auth:{persistSession:true,autoRefreshToken:true}});setupNotificationUI();app.addEventListener('input',function(ev){var target=ev.target;if(page==='student'&&target&&['student-written','student-help-note','student-recovery-plan','student-reflection'].includes(target.id)){studentDraftInputs[target.id]=target.value;persistStudentDrafts()}});document.getElementById('tab-student').onclick=function(){setMode('student')};document.getElementById('tab-instructor').onclick=function(){setMode('instructor')};
document.querySelector('.tabs[role="tablist"]').addEventListener('keydown',function(ev){if(!['ArrowRight','ArrowLeft','Home','End'].includes(ev.key))return;ev.preventDefault();var next=ev.key==='Home'?'student':ev.key==='End'?'instructor':page==='student'?'instructor':'student';setMode(next);document.getElementById('tab-'+next).focus()});if(qs('code')){setMode('student');joinScreen()}else if(studentToken){await studentRefresh()}else joinScreen();var retryButton=document.getElementById('l101-refresh-now');if(retryButton)retryButton.onclick=async function(){if(page==='student'&&studentToken){await studentRefresh(false)}else if(page==='instructor'&&instructorUser){await loadInstructorNotifications(false);await instructorRefresh(false)}};
setInterval(async function(){if(notificationPolling||(document.hidden&&page==='student'))return;notificationPolling=true;try{if(page==='student'&&studentToken)await studentRefresh(true);if(page==='instructor'&&instructorUser){await loadInstructorNotifications(true);if(selectedClass)await instructorRefresh(true)}}finally{notificationPolling=false}},4500)}
function joinScreen(){app.innerHTML='<div class="grid"><div class="panel stack"><h2>Join your Leadership 101 role-play</h2><p class="muted">Enter the classroom code from your instructor and your name. No student account or password is required for this classroom pilot.</p><label>Class code<input id="join-code" placeholder="Example: 1A2B3C4" value="'+h(qs('code'))+'" autocomplete="off"></label><label>Your name<input id="join-name" placeholder="First and last name" autocomplete="name"></label><div class="row"><button class="btn gold" id="join-go">Enter Classroom →</button></div><p class="info">This browser saves your private session token so you can resume. Use “Leave this device” when finished on a shared computer.</p></div><div class="panel"><h3>What happens next?</h3><p>1. Read your assigned leadership case.</p><p>2. Observe the team member and respond.</p><p>3. Your instructor evaluates original written responses.</p><p>4. Download your reflection report.</p><p class="notice">Prepared choices receive built-in practice feedback. Original responses are not automatically scored; your instructor reviews them.</p></div></div>';document.getElementById('join-go').onclick=join}
async function join(){if(joinBusy)return;var code=val('join-code').trim(),name=val('join-name').trim();if(!code||name.length<2){flash('Enter your class code and name.',true);return}joinBusy=true;try{busy('Joining classroom…');var result=await db.rpc('l101_join',{p_code:code,p_name:name});if(result.error)throw result.error;clearAllStudentDrafts();studentToken=result.data.token;localStorage.setItem('l101_live_token',studentToken);loadStudentDrafts();scenarioIndex=0;dialogueCharacter=-1;studentReportOpen=false;storyMode='story';studentData=null;pendingStudentRender=false;await studentRefresh()}catch(e){joinScreen();var codeInput=document.getElementById('join-code'),nameInput=document.getElementById('join-name');if(codeInput)codeInput.value=code;if(nameInput)nameInput.value=name;error(e)}finally{joinBusy=false}}
async function studentRefresh(quiet){try{if(!studentToken){joinScreen();return}var pair=await Promise.all([db.rpc('l101_state',{p_token:studentToken}),db.rpc('l101_student_messages',{p_token:studentToken}),db.rpc('l101_story_state',{p_token:studentToken})]);var r=pair[0],msg=pair[1],storyResult=pair[2];if(r.error)throw r.error;if(msg.error)throw msg.error;if(storyResult.error)throw storyResult.error;var firstLoad=!studentData,oldMessages=studentData&&studentData.messages||[],oldIds=new Set(oldMessages.map(function(m){return m.id}));var before=JSON.stringify(studentData&&studentData.responses)+'|'+JSON.stringify(studentData&&studentData.injects)+'|'+JSON.stringify(studentData&&studentData.messages)+'|'+JSON.stringify(studentData&&studentData.dialogue)+'|'+JSON.stringify(studentData&&studentData.recovery_plans)+'|'+JSON.stringify(studentData&&studentData.story)+'|'+JSON.stringify(studentData&&studentData.class&&studentData.class.scenario_id)+'|'+JSON.stringify(studentData&&studentData.class&&studentData.class.assignment_pending);studentData=r.data;studentData.messages=msg.data||[];studentData.story=storyResult.data||{available:false};var moments=studentData.scenario.moments||[],firstIncomplete=moments.findIndex(function(m,i){return !(studentData.responses||[]).some(function(x){return x.observation_index===i&&x.rating})});if(firstIncomplete<0)firstIncomplete=moments.length;if(firstLoad||scenarioIndex>firstIncomplete)scenarioIndex=firstIncomplete;var after=JSON.stringify(studentData.responses)+'|'+JSON.stringify(studentData.injects)+'|'+JSON.stringify(studentData.messages)+'|'+JSON.stringify(studentData.dialogue)+'|'+JSON.stringify(studentData.recovery_plans)+'|'+JSON.stringify(studentData.story)+'|'+JSON.stringify(studentData.class&&studentData.class.scenario_id)+'|'+JSON.stringify(studentData.class&&studentData.class.assignment_pending);if(!quiet||before!==after||pendingStudentRender){if(quiet&&isTyping()){pendingStudentRender=true;setStudioConnection('updates')}else{pendingStudentRender=false;if(studentReportOpen)studentReport();else studentRender();setStudioConnection('online')}}else{setStudioConnection('online')}if(quiet&&oldMessages.length&&studentData.messages.some(function(m){return m.sender_kind==='instructor'&&!oldIds.has(m.id)}))flash('💬 Your instructor replied. Open Instructor Messages to read it.')}catch(e){setStudioConnection('offline');if(!quiet)error(e);if(/Invalid participant/.test(String(e.message))){clearAllStudentDrafts();studentToken='';studentData=null;localStorage.removeItem('l101_live_token');setStudioConnection('online');joinScreen()}}}

function characterDialogueMarkup(d){
 var characters=d.scenario.characters||[];if(!characters.length)return '';
 var active=dialogueCharacter,rows=d.dialogue||[];
 var buttons=characters.map(function(ch,i){var complete=rows.some(function(a){return a.character_index===i&&a.next_turn===-1});return '<button type="button" class="l101-actor-btn '+(active===i?'on':'')+'" data-l101-character="'+i+'">'+h(ch.name)+(complete?' ✓':'')+'</button>'}).join('');
 var content='<p class="small muted">Practice a branching conversation. Your decisions influence the character’s reaction and coaching feedback.</p><div class="l101-actors">'+buttons+'</div>';
 if(active>=0&&characters[active]){
  var ch=characters[active],steps=rows.filter(function(x){return x.character_index===active}),last=steps.length?steps[steps.length-1]:null,turn=last?last.next_turn:0;
  content+='<div class="l101-dialogue-scene"><div class="eyebrow">Conversation with '+h(ch.name)+' · '+h(ch.role||'Team member')+'</div>';
  if(steps.length)content+=steps.map(function(step){return '<div class="l101-dialogue-exchange"><b>You:</b> '+h(step.chosen_text)+'<p><b>'+h(ch.name)+':</b> '+h(step.reply_text)+'</p>'+(step.coaching_tip?'<p class="small"><b>Coaching insight:</b> '+h(step.coaching_tip)+'</p>':'')+'</div>'}).join('');
  if(turn===-1){var trust=steps.reduce(function(n,t){return n+Number(t.delta||0)},0);content+='<p class="l101-ended"><b>Conversation completed.</b> Relationship indicator: '+(trust>0?'Improved':trust<0?'Under strain':'Unchanged')+'.</p>'}
  else if(ch.turns&&ch.turns[turn]){var t=ch.turns[turn];content+='<p class="l101-speech"><b>'+h(ch.name)+':</b> '+h(t.prompt)+'</p>'+(t.options||[]).map(function(o,i){return '<button type="button" class="choice" data-l101-talkchoice="'+i+'"><span>'+String.fromCharCode(65+i)+'</span>'+h(o.text)+'</button>'}).join('')}
  content+='</div>';
 }
 return '<section class="l101-dialogue-panel"><h3>Interactive character conversations</h3>'+content+'</section>';
}
async function dialogueChoose(optionIndex){
 try{
  var d=studentData,ch=d.scenario.characters[dialogueCharacter],steps=(d.dialogue||[]).filter(function(r){return r.character_index===dialogueCharacter}),turn=steps.length?steps[steps.length-1].next_turn:0;
  if(turn<0||!ch||!ch.turns[turn])return;
  var r=await db.rpc('l101_choose_dialogue',{p_token:studentToken,p_character_index:dialogueCharacter,p_turn_index:turn,p_option_index:optionIndex});
  if(r.error)throw r.error;
  await studentRefresh(false);
 }catch(e){error(e)}
}
function recoveryForm(d,index){
 var saved=(d.recovery_plans||[]).find(function(r){return r.observation_index===index}),moment=d.scenario.moments[index]||{};
 return '<div class="l101-recovery"><h3>Recovery opportunity</h3><p>'+h(moment.recoveryPrompt||'How would you repair this situation, and what will you do to verify progress?')+'</p><label>Your follow-up plan<textarea id="student-recovery-plan" maxlength="4000" placeholder="Describe a specific change, who you would speak to, and how you will verify improvement.">'+h(saved&&saved.plan||'')+'</textarea></label><div class="row" style="margin-top:10px"><button type="button" class="btn ghost" id="student-save-recovery">Save recovery plan</button>'+(saved?'<span class="small ok">Saved</span>':'')+'</div></div>';
}
async function saveRecoveryPlan(){
 try{
  var text=val('student-recovery-plan').trim();if(text.length<3){flash('Write a specific recovery plan.',true);return}
  var r=await db.rpc('l101_save_recovery',{p_token:studentToken,p_index:scenarioIndex,p_plan:text});if(r.error)throw r.error;
  clearStudentDraft('student-recovery-plan');flash('Recovery plan saved online.');await studentRefresh(false);
 }catch(e){error(e)}
}


// Photo-cast asset manifest: characters keep consistent identities across the journey.
// URLs are activated only after an image successfully loads. Broken/missing images
// leave the existing illustrated portraits and workplace backgrounds intact.
var L101_DEADLINE_ASSETS='/assets/leadership-101/deadline-team/';
var L101_DEADLINE_SCENES={
 opening:'standup', 'private-discussion':'coaching','unresolved-delay':'standup',
 'public-shutdown':'standup','repair-conversation':'coaching','shared-plan':'planning',
 'ambiguous-ownership':'planning','strained-trust':'coaching','critical-decision':'briefing',
 'coordinated-response':'planning','difficult-escalation':'briefing','fallout-recovery':'standup',
 'ending-strong':'planning','ending-fragile':'coaching','ending-damaged':'briefing'
};
var L101_DEADLINE_CAST={
 malik:{name:'Malik Thompson',skin:'#865642',hair:'#252a34',outfit:'#a6c9e7',hairstyle:'Short',presentation:'Masculine',clothing:'Business casual',beard:'Short beard'},
 hannah:{name:'Hannah Lee',skin:'#f3d5b8',hair:'#302923',outfit:'#ad8dc5',hairstyle:'Bun',presentation:'Feminine',clothing:'Blouse',beard:'None'},
 nora:{name:'Nora Patel',skin:'#ac7557',hair:'#252a34',outfit:'#6b705e',hairstyle:'Long',presentation:'Feminine',clothing:'Blazer',beard:'None'},
 cameron:{name:'Cameron Brooks',skin:'#e9b991',hair:'#8d9296',outfit:'#3e4857',hairstyle:'Short',presentation:'Masculine',clothing:'Blazer',beard:'None'}
};
var L101_CONFLICT_ASSETS='/assets/leadership-101/conflict-crossroads/';
var L101_CONFLICT_SCENES={
 opening:'conflict','private-discussion':'coaching','unresolved-delay':'conflict',
 'public-shutdown':'conflict','repair-conversation':'coaching','shared-plan':'planning',
 'ambiguous-ownership':'planning','strained-trust':'conflict','critical-decision':'briefing',
 'coordinated-response':'planning','difficult-escalation':'briefing','fallout-recovery':'conflict',
 'ending-strong':'planning','ending-fragile':'coaching','ending-damaged':'conflict'
};
var L101_CONFLICT_CAST={
 sofia:{name:'Sofia Martinez',skin:'#d5a079',hair:'#302923',outfit:'#4d6a96',hairstyle:'Bob',presentation:'Feminine',clothing:'Blazer',beard:'None'},
 daniel:{name:'Daniel Park',skin:'#e9b991',hair:'#252a34',outfit:'#3e4857',hairstyle:'Short',presentation:'Masculine',clothing:'Blazer',beard:'None'},
 rae:{name:'Rae Johnson',skin:'#865642',hair:'#302923',outfit:'#427c89',hairstyle:'Curly',presentation:'Feminine',clothing:'Blazer',beard:'None'},
 morgan:{name:'Morgan Ellis',skin:'#f3d5b8',hair:'#b18a66',outfit:'#3e4857',hairstyle:'Bob',presentation:'Feminine',clothing:'Blazer',beard:'None'}
};
var L101_PHOTO_CONFIGS={
 'l101-02':{root:L101_DEADLINE_ASSETS,scenes:L101_DEADLINE_SCENES,cast:L101_DEADLINE_CAST},
 'l101-03':{root:L101_CONFLICT_ASSETS,scenes:L101_CONFLICT_SCENES,cast:L101_CONFLICT_CAST}
};

function l101PhotoEmotion(tone){
 return ({tense:'frustrated',worried:'concerned',uncertain:'concerned',defensive:'defensive',
 firm:'defensive',urgent:'frustrated',exhausted:'disappointed',hopeful:'hopeful',
 focused:'thoughtful',reflective:'thoughtful',guarded:'defensive'})[tone]||'neutral';
}
function hydrateL101StoryPhotos(){
 app.querySelectorAll('img[data-l101-photo]').forEach(function(photo){
  var ready=function(){photo.classList.add('l101-photo-ready')};
  if(photo.complete&&photo.naturalWidth){ready();return}
  photo.addEventListener('load',ready,{once:true});
  photo.addEventListener('error',function(){photo.remove()},{once:true});
 });
 var stage=app.querySelector('[data-l101-photo-scene]');
 if(!stage)return;
 var url=stage.getAttribute('data-l101-photo-scene');
 if(!Object.values(L101_PHOTO_CONFIGS).some(function(cfg){return url.startsWith(cfg.root+'scenes/')})||!/\.webp$/.test(url))return;
 var picture=new Image();
 picture.onload=function(){
  if(!stage.isConnected)return;
  stage.style.backgroundImage='linear-gradient(90deg,rgba(4,28,51,.45),rgba(8,40,70,.79) 42%,rgba(8,40,70,.91)),url("'+url+'")';
  stage.classList.add('l101-stage-photo-loaded');
 };
 picture.src=url;
}

function storyPortrait(speaker,tone,scenarioId){
 if(!speaker||speaker==='Narrator'||speaker==='Live classroom update')return '<div class="l101-story-avatar l101-narrator" aria-hidden="true">✦</div>';
 var key=speaker.split(' ')[0].toLowerCase(),looks={
 jordan:{skin:'#ac7557',hair:'#302923',outfit:'#345f81',hairstyle:'Short'},
 taylor:{skin:'#d5a079',hair:'#554136',outfit:'#427c89',hairstyle:'Curly'},
 morgan:{skin:'#865642',hair:'#252a34',outfit:'#9b6576',hairstyle:'Locs'},
 supervisor:{skin:'#e9b991',hair:'#554136',outfit:'#3e4857',hairstyle:'Short'}
 };
 var cfg=L101_PHOTO_CONFIGS[scenarioId],look=(cfg&&cfg.cast[key])||(looks[key]||looks.jordan);
 var mood=l101PhotoEmotion(tone);
 // This cast's eighth emotion is skeptical rather than disappointed.
 if(scenarioId==='l101-03'&&mood==='disappointed')mood='skeptical';
 var vectorMood=({concerned:'guarded',defensive:'skeptical',relieved:'open'})[mood]||mood;
 try{
  var fallback=portraitHTML({
   id:'l101-story-'+key,name:speaker,role:'Team member',style:'illustrated',
   appearance:{age:'Adult',presentation:look.presentation||'Androgynous',hairstyle:look.hairstyle,hair:look.hair,skin:look.skin,
    clothing:look.clothing||'Blazer',outfit:look.outfit,beard:look.beard||'None',accessories:'None'}
  },vectorMood);
  var photo=(cfg&&cfg.cast[key])?
   '<img class="l101-photo-expression" data-l101-photo src="'+cfg.root+'portraits/'+key+'-'+mood+'.webp" alt="'+h(speaker)+' — '+h(mood)+' expression" decoding="async" loading="lazy">':'';
  return '<div class="l101-story-avatar'+(photo?' l101-avatar-photoreal':'')+'">'+fallback+photo+'</div>';
 }catch(e){return '<div class="l101-story-avatar l101-narrator">'+h(speaker[0])+'</div>'}
}
function storyExperienceMarkup(d){
 var st=d.story||{},n=st.node||{},history=st.history||[],ended=!!st.finished,choices=n.choices||[];
 var scene=String(n.scene||'meeting').replace(/[^a-z0-9-]/g,''),backgrounds={
 meeting:'/assets/leadership-101/ethics/executive-review.jpg',
 office:'/assets/leadership-101/ethics/people-trust-suite.jpg',
 hallway:'/assets/leadership-escape/fractured-team.webp',
 corridor:'/assets/leadership-escape/fractured-team.webp',
 planning:'/assets/leadership-escape/style-switch.webp',
 conflict:'/assets/leadership-escape/managing-conflict.webp',
 crisis:'/assets/leadership-escape/fractured-team.webp',
 executive:'/assets/leadership-101/ethics/executive-review.jpg'
 };
 // Phase 5: reuse topic-specific site artwork across opening/conflict, conversation and planning scenes.
 var scenarioArtwork={
 "l101-02": [
  "/assets/leadership-101/obstacles/bottleneck-office.avif",
  "/assets/leadership-101/ethics/people-trust-suite.jpg",
  "/assets/leadership-escape/style-switch.webp"
 ],
 "l101-03": [
  "/assets/leadership-escape/managing-conflict.webp",
  "/assets/leadership-escape/four-styles.webp",
  "/assets/leadership-escape/style-switch.webp"
 ],
 "l101-04": [
  "/assets/leadership-escape/fractured-team.webp",
  "/assets/leadership-101/ethics/people-trust-suite.jpg",
  "/assets/leadership-escape/style-switch.webp"
 ],
 "l101-05": [
  "/assets/leadership-101/ethics/executive-review.jpg",
  "/assets/leadership-101/ethics/people-trust-suite.jpg",
  "/assets/leadership-escape/style-switch.webp"
 ],
 "l101-06": [
  "/assets/leadership-101/ethics/records-office.jpg",
  "/assets/leadership-101/ethics/people-trust-suite.jpg",
  "/assets/leadership-101/ethics/executive-review.jpg"
 ],
 "l101-07": [
  "/assets/leadership-escape/style-switch.webp",
  "/assets/leadership-101/ethics/people-trust-suite.jpg",
  "/assets/leadership-escape/four-styles.webp"
 ],
 "l101-08": [
  "/assets/leadership-101/destructive/pressure-office.avif",
  "/assets/leadership-101/destructive/silence-suite.avif",
  "/assets/leadership-101/destructive/accountability-review.avif"
 ],
 "l101-09": [
  "/assets/leadership-101/obstacles/friction-zone.avif",
  "/assets/leadership-101/obstacles/bottleneck-office.avif",
  "/assets/leadership-101/obstacles/breakthrough-chamber.avif"
 ]
};
 var scenarioId=String(d.scenario&&d.scenario.id||''),sceneId=String(st.node_id||'').replace(/[^a-z0-9-]/g,''),photoConfig=L101_PHOTO_CONFIGS[scenarioId],photoScene=photoConfig?photoConfig.scenes[sceneId]:null;
 var themedImages=scenarioArtwork[scenarioId],sceneImageIndex=/^(office|hallway|corridor)$/.test(scene)?1:/^(planning|executive|meeting)$/.test(scene)?2:0;
 var bg=themedImages?themedImages[sceneImageIndex]:backgrounds[scene]||backgrounds.meeting,trust=Number(st.trust||0),pressure=Number(st.pressure||0);
 var trustLabel=trust>=6?'Growing confidence':trust>=0?'Cautious confidence':'Trust under strain';
 var pressureLabel=pressure>=7?'High operational pressure':pressure>=2?'Pressure increasing':'Pressure manageable';
 var stage='<div class="l101-stage l101-stage-'+scene+'"'+(photoScene?' data-l101-photo-scene="'+photoConfig.root+'scenes/'+photoScene+'.webp"':'')+' style="background-image:linear-gradient(90deg,rgba(7,33,60,.94),rgba(14,54,88,.76),rgba(9,46,72,.38)),url('+bg+')">'
  +'<div class="l101-stage-top"><span>ACT '+h(n.act||1)+'</span><span>'+h(n.setting||'Leadership situation')+'</span></div>'
  +'<div class="l101-stage-subject">'+storyPortrait(n.speaker,n.tone,scenarioId)+'<div class="l101-stage-copy">'
  +'<span class="l101-stage-kicker">'+(st.is_inject?'⚡ LIVE INSTRUCTOR CHALLENGE':ended?'YOUR STORY ENDING':'LEADERSHIP IN ACTION')+'</span>'
  +'<h2>'+h(n.title||st.title)+'</h2><div class="l101-stage-speaker">'+h(n.speaker||'Narrator')+'</div>'
  +'<p>'+h(n.text||'')+'</p></div></div></div>';
 var lastEvent=history.length?history[history.length-1]:null;
 var out='<div class="l101-story-shell"><div class="l101-story-head"><div><div class="eyebrow">Immersive story · '+h(st.title||d.scenario.title)+'</div><p class="muted">'+h(st.synopsis||'Your decisions change the story.')+'</p></div>'
  +'<div class="l101-meters"><span>◈ '+h(trustLabel)+'</span><span>⌁ '+h(pressureLabel)+'</span></div></div>'+stage;
 if(lastEvent){out+='<div class="l101-story-consequence"><span class="eyebrow">What happened because of your choice</span><p>'+h(lastEvent.reaction||'')+'</p>'+(lastEvent.coaching?'<p class="small"><b>Leadership insight:</b> '+h(lastEvent.coaching)+'</p>':'')+'</div>'}
 if(ended){out+='<div class="l101-story-prompt"><h3>Reflect on your leadership journey</h3><p>'+h(n.reflection||'Which decision would you revisit, and why?')+'</p>'
  +'<p class="muted">Your path and consequences are saved in My Leadership Report.</p><button class="btn gold" id="story-report-button">Open your leadership report →</button></div>'}
 else{out+='<div class="l101-story-prompt"><div class="eyebrow">'+(st.is_inject?'A new complication changes your priorities':'Decision point')+'</div><h3>'+h(n.prompt||'What will you do next?')+'</h3>'
  +'<div class="l101-story-choices">'+choices.map(function(o,i){return '<button type="button" class="l101-story-choice" data-story-choice="'+i+'"><span class="l101-choice-letter">'+String.fromCharCode(65+i)+'</span><span>'+h(o.text)+'</span><span class="l101-choice-arrow">→</span></button>'}).join('')+'</div></div>'}
 if(history.length){out+='<details class="l101-story-history"><summary>Review your journey ('+history.length+' decisions)</summary><div class="l101-story-history-items">'
  +history.map(function(ev,i){return '<div class="l101-story-event"><div class="small muted">'+(i+1)+'. '+(ev.is_inject?'Instructor challenge':'Story decision')+'</div><b>'+h(ev.choice)+'</b><p><b>Consequence:</b> '+h(ev.reaction)+'</p>'+(ev.coaching?'<p class="small"><b>Leadership insight:</b> '+h(ev.coaching)+'</p>':'')+'</div>'}).join('')
  +'</div></details>'}
 out+='</div>';return out;
}
async function storyChoose(index){
 if(storySubmitting||!studentData||!studentData.story||!studentData.story.available)return;
 storySubmitting=true;
 try{
  app.querySelectorAll('[data-story-choice]').forEach(function(b){b.disabled=true});
  var st=studentData.story,result=await db.rpc('l101_story_choose',{
   p_token:studentToken,p_node:st.node_id,p_choice:index,p_inject:st.is_inject?st.inject_id:null
  });
  if(result.error)throw result.error;
  await studentRefresh(false);
  if(result.data&&result.data.finished)flash('Story complete — your leadership ending is ready.');
 }catch(e){error(e);await studentRefresh(false)}finally{storySubmitting=false}
}

function studentRender(){if(!studentToken){joinScreen();return}if(!studentData){busy('Loading class…');return}var waiting=studentData.class&&studentData.class.assignment_pending;
if(waiting){
 var person=studentData.participant||{},messages=studentData.messages||[];
 app.innerHTML='<div class="grid"><div class="panel"><span class="eyebrow">You are connected</span><h2>Welcome, '+h(person.name||'leader')+'</h2>'
 +'<div class="l101-waiting-scene"><strong>Your instructor is preparing your scenario.</strong><p>Keep this screen open. Your leadership activity will appear automatically after assignment.</p><div class="l101-waiting-pulse">✦</div></div>'
 +'<p class="muted small">Class: '+h(studentData.class.title)+'</p><label>Ask the instructor a question<textarea id="student-help-note" rows="3" maxlength="1500" placeholder="Optional message…"></textarea></label>'
 +'<div class="row" style="margin-top:12px"><button class="btn primary" id="student-help-request">Send message</button><button class="btn ghost" id="student-leave">Leave this device</button></div></div>'
 +'<aside class="panel"><h3>Instructor messages</h3><div class="l101-chat-history">'+(messages.length?messages.map(function(m){return '<div class="l101-chat-message '+(m.sender_kind==='student'?'student':'instructor')+'"><b>'+(m.sender_kind==='student'?'You':'Instructor')+'</b><p>'+h(m.content)+'</p></div>'}).join(''):'<p class="muted">No messages yet.</p>')+'</div></aside></div>';
 document.getElementById('student-help-request').onclick=sendStudentHelpRequest;
 document.getElementById('student-leave').onclick=function(){clearAllStudentDrafts();studentToken='';studentData=null;localStorage.removeItem('l101_live_token');joinScreen()};
 restoreStudentDrafts();return;
}
var d=studentData,observations=d.scenario.moments||[],graded=progress(d),storyActive=d.story&&d.story.available&&storyMode==='story',storyNode=storyActive?d.story.node||{}:{},storyPct=storyActive?(d.story.finished?100:Math.max(7,Math.min(88,Math.round(((Number(storyNode.act||1)-1)/3)*100+8)))):Math.round(100*graded/Math.max(1,observations.length));if(scenarioIndex>=observations.length)scenarioIndex=observations.length;var m=scenarioMoment(d,scenarioIndex),r=(d.responses||[]).find(function(x){return x.observation_index===scenarioIndex});var injectList=(d.injects||[]).map(function(i){return '<div class="notice"><b>⚡ '+h(i.title)+'</b><p>'+h(i.description)+'</p></div>'}).join('');var main='<div class="spread"><h2 style="margin:0">'+h(d.scenario.title)+'</h2><div class="row"><button class="btn ghost" id="student-ask-top">💬 Message Instructor</button><button class="btn ghost" id="student-report">My Leadership Report</button></div></div><p class="muted">'+h(d.scenario.subtitle||d.scenario.description)+'</p><details class="l101-brief"><summary>Scenario briefing & leadership mission</summary><p>'+h(d.scenario.briefing||d.scenario.description||'')+'</p><p><b>Your mission:</b> '+h(d.scenario.mission||'Practice leadership behaviors through the situation.')+'</p></details><div class="track"><i style="width:'+storyPct+'%"></i></div>';
if(d.story&&d.story.available){main+='<div class="l101-mode-switch"><button type="button" data-l101-mode="story" class="'+(storyMode==='story'?'active':'')+'">Interactive Story Journey</button><button type="button" data-l101-mode="checkpoints" class="'+(storyMode==='checkpoints'?'active':'')+'">Original Decision Checkpoints</button></div>'}
if(d.story&&d.story.available&&storyMode==='story'){main+=storyExperienceMarkup(d)}
else if(!m){main+='<div class="scene"><div class="speaker">Scenario complete</div><div class="quote">You have completed the leadership decisions in this scenario. Review what you learned and save your report.</div></div><div class="row" style="margin-top:15px"><button class="btn gold" id="student-report-finish">View my report →</button></div>'}
else{main+='<div class="scene"><div class="speaker">Observation '+(scenarioIndex+1)+' of '+observations.length+' · '+h(m.trainee||'Team member')+'</div><div class="quote">'+h(m.behavior)+'</div></div><div style="padding-top:17px"><span class="eyebrow">Leadership challenge</span><h3 style="font-size:21px;margin:5px 0 9px">'+h(m.question)+'</h3><p class="muted">'+h(m.context)+'</p></div>';
if(!r){main+='<div class="stack"><div>'+((m.options||[]).map(function(o,i){return '<button class="choice" data-choice="'+i+'"><span>'+String.fromCharCode(65+i)+'</span>'+h(o.action)+'</button>'}).join(''))+'</div><label>Or write your own leadership response<textarea id="student-written" placeholder="What would you actually say or do? Your observer will evaluate this response."></textarea></label><div class="row"><button class="btn gold" id="student-submit-written">Submit original response</button></div></div>'}
else if(!r.rating){main+='<div class="pending"><b>Awaiting observer feedback</b><p>You submitted your own response. Your instructor will rate it Positive, Neutral, or Negative. This screen updates automatically once reviewed.</p><p><b>Your response:</b> '+h(r.submitted_text)+'</p></div>'}
else{var consequence=r.consequence||{},follow=consequence.reaction|| (r.rating==='positive'?'The team member is becoming more receptive.':r.rating==='neutral'?'The team member is still uncertain.':'The problem remains unresolved and requires follow-up.');main+='<div class="response"><b>Your response</b><p>'+h(r.submitted_text)+'</p></div><div class="response"><b>Observer evaluation: '+h(r.rating.toUpperCase())+'</b><p>'+h(r.observer_comment||'Practice feedback from prepared choice')+'</p></div><div class="notice"><b>Character reaction</b><p>'+h(follow)+'</p>'+(consequence.signal?'<p><b>What changed:</b> '+h(consequence.signal)+'</p>':'')+(consequence.lesson?'<p><b>Leadership insight:</b> '+h(consequence.lesson)+'</p>':'')+'</div>'+(r.rubric&&Object.keys(r.rubric).length?'<div class="l101-rubric-results"><b>Leadership competencies</b><p>'+Object.entries(r.rubric).map(function(e){return h(e[0])+': '+h(e[1])}).join(' · ')+'</p></div>':'')+(r.rating!=='positive'?recoveryForm(d,scenarioIndex):'')+'<div class="row" style="margin-top:14px"><button class="btn gold" id="student-next">'+(scenarioIndex===observations.length-1?'Finish Scenario':'Next Observation →')+'</button></div>'}
}
if(!d.story||!d.story.available||storyMode==='checkpoints')main+=characterDialogueMarkup(d);
var side='<div class="panel"><h3>Participant</h3><strong>'+h(d.participant.name)+'</strong><p class="muted">Class: '+h(d.class.title)+'</p>'+stat(graded+' / '+observations.length,'Decisions evaluated')+'<p class="info">Your written responses go to your instructor, not other students.</p><button class="btn" id="student-leave">Leave this device</button></div><div class="panel"><h3>Characters</h3>'+(d.scenario.characters||[]).map(function(c){return '<div class="card" style="margin-bottom:8px"><b>'+h(c.name)+'</b><div class="small muted">'+h(c.role)+'</div><p class="small">'+h(c.publicInfo||'')+'</p></div>'}).join('')+'</div><div class="panel"><div class="spread"><h3>💬 Instructor Messages</h3><span class="chip">Two-way conversation</span></div><p class="small muted">Ask questions and receive replies right here. Only you and your instructor can view this thread.</p><div class="l101-chat-history" id="student-chat-history" aria-label="Messages with instructor">'+((d.messages||[]).length?(d.messages||[]).map(function(msg){return '<div class="l101-chat-message '+(msg.sender_kind==='student'?'student':'instructor')+'"><div class="l101-chat-by">'+(msg.sender_kind==='student'?'You':'Instructor')+(Number.isInteger(msg.observation_index)?' · Observation '+(msg.observation_index+1):'')+'</div><p>'+h(msg.content)+'</p><div class="small muted">'+h(notificationTime(msg.created_at))+'</div></div>'}).join(''):'<p class="small muted">No messages yet. Ask the instructor about the situation or an upcoming decision.</p>')+'</div><label style="margin-top:13px">Ask a question or reply<textarea id="student-help-note" rows="3" maxlength="1500" placeholder="Write your question or reply to your instructor…"></textarea></label><button class="btn ghost" id="student-help-request" style="margin-top:10px">📨 Send message to instructor</button></div><div class="panel"><h3>Live scenario updates</h3>'+(injectList||'<p class="small muted">No new challenges have been released yet.</p>')+'</div>';
app.innerHTML='<div class="grid"><div class="panel">'+main+'</div><aside>'+side+'</aside></div>';
if(storyActive)hydrateL101StoryPhotos();
app.querySelectorAll('[data-story-choice]').forEach(function(b){b.onclick=function(){storyChoose(Number(b.dataset.storyChoice))}});
app.querySelectorAll('[data-l101-mode]').forEach(function(b){b.onclick=function(){storyMode=b.dataset.l101Mode;studentRender()}});
var storyReportButton=document.getElementById('story-report-button');if(storyReportButton)storyReportButton.onclick=studentReport;
app.querySelectorAll('[data-choice]').forEach(function(b){b.onclick=function(){submit(scenarioIndex,null,Number(b.dataset.choice))}});
var submitBtn=document.getElementById('student-submit-written');if(submitBtn)submitBtn.onclick=function(){submit(scenarioIndex,val('student-written'),null)};
var next=document.getElementById('student-next');if(next)next.onclick=function(){scenarioIndex++;studentRender()};
var reportBtns=['student-report','student-report-finish'];reportBtns.forEach(function(id){var e=document.getElementById(id);if(e)e.onclick=studentReport});
var helpButton=document.getElementById('student-help-request');if(helpButton)helpButton.onclick=sendStudentHelpRequest;
app.querySelectorAll('[data-l101-character]').forEach(function(b){b.onclick=function(){dialogueCharacter=Number(b.dataset.l101Character);studentRender()}});
app.querySelectorAll('[data-l101-talkchoice]').forEach(function(b){b.onclick=function(){dialogueChoose(Number(b.dataset.l101Talkchoice))}});
var rec=document.getElementById('student-save-recovery');if(rec)rec.onclick=saveRecoveryPlan;
var askTop=document.getElementById('student-ask-top');if(askTop)askTop.onclick=function(){var t=document.getElementById('student-help-note');if(t){t.scrollIntoView({behavior:'smooth',block:'center'});t.focus()}};
document.getElementById('student-leave').onclick=function(){clearAllStudentDrafts();studentToken='';studentData=null;studentReportOpen=false;dialogueCharacter=-1;storyMode='story';localStorage.removeItem('l101_live_token');joinScreen()};
restoreStudentDrafts();}
async function submit(index,text,choice){if(submissionBusy)return;if(choice==null&&(!text||!text.trim())){flash('Write your leadership response before submitting.',true);var entry=document.getElementById('student-written');if(entry)entry.focus();return}submissionBusy=true;try{app.querySelectorAll('[data-choice],#student-submit-written').forEach(function(b){b.disabled=true});var r=await db.rpc('l101_submit',{p_token:studentToken,p_index:index,p_text:text||'',p_option:choice});if(r.error)throw r.error;clearStudentDraft('student-written');await studentRefresh(false)}catch(e){error(e);studentRender()}finally{submissionBusy=false}}
async function sendStudentHelpRequest(){var btn=document.getElementById('student-help-request');try{var message=val('student-help-note').trim();if(!message){flash('Type a message before sending.',true);return}if(btn)btn.disabled=true;var step=studentData&&!studentData.class.assignment_pending&&scenarioIndex<(studentData.scenario.moments||[]).length?scenarioIndex:null;var r=await db.rpc('l101_send_message',{p_token:studentToken,p_message:message,p_index:step});if(r.error)throw r.error;clearStudentDraft('student-help-note');flash('Message sent. Your instructor can reply in this thread.');await studentRefresh(false)}catch(e){error(e)}finally{if(btn)btn.disabled=false}}
function studentReport(){var d=studentData;if(!d)return;studentReportOpen=true;app.innerHTML='<div class="panel no-print"><div class="spread"><h2>My Leadership Report</h2><div class="row"><button class="btn gold" id="print-student">Print / Save PDF</button><button class="btn" id="json-student">Export JSON</button><button class="btn ghost" id="back-student">Back to scenario</button></div></div><p>Participant: <b>'+h(d.participant.name)+'</b></p><label>Final reflection<textarea id="student-reflection" placeholder="What did you learn? What would you do differently next time?">'+h(d.participant.reflection||'')+'</textarea></label><div class="row" style="margin-top:12px"><button class="btn primary" id="save-reflection">Save Reflection</button></div></div><div class="panel">'+sessionReport(d)+'</div>';
document.getElementById('print-student').onclick=function(){setPrint(d);window.print()};
document.getElementById('json-student').onclick=function(){download('Leadership101-'+d.participant.name.trim().replace(/\W+/g,'-')+'.json',d)};
document.getElementById('back-student').onclick=function(){studentReportOpen=false;studentRender()};
document.getElementById('save-reflection').onclick=async function(){try{var t=val('student-reflection');var r=await db.rpc('l101_reflect',{p_token:studentToken,p_text:t});if(r.error)throw r.error;studentData.participant.reflection=t;clearStudentDraft('student-reflection');flash('Reflection saved online');studentReport()}catch(e){error(e)}};
restoreStudentDrafts();}
async function instructorLoad(){busy('Checking instructor access…');try{var a=await db.auth.getUser();if(a.error||!a.data.user){instructorLogin();return}var r=await db.from('l101_live_instructors').select('user_id').eq('user_id',a.data.user.id).maybeSingle();if(r.error)throw r.error;if(!r.data){instructorLogin('This account is not authorized as an instructor.');return}instructorUser=a.data.user;startNotificationSubscription();await instructorRefresh();await loadInstructorNotifications(false)}catch(e){error(e);instructorLogin()}}
function instructorLogin(msg){instructorUser=null;app.innerHTML='<div class="grid"><div class="panel stack"><h2>Instructor sign in</h2><p class="muted">'+h(msg||'Sign in with your authorized Mayne Leadership instructor account.')+'</p><label>Email<input type="email" id="login-email" autocomplete="username" placeholder="Instructor email"></label><label>Password<input type="password" id="login-password" autocomplete="current-password" placeholder="Password"></label><button class="btn gold" id="login-go">Sign in →</button><p class="info">Instructor permissions are checked by the database. Switching tabs does not grant instructor access.</p></div><div class="panel"><h3>What you can manage</h3><p>✓ Create classrooms and share join codes</p><p>✓ View live student progress and responses</p><p>✓ Rate original answers and provide feedback</p><p>✓ Release unexpected leadership challenges</p><p>✓ Export student reports</p></div></div>';document.getElementById('login-go').onclick=async function(){try{var r=await db.auth.signInWithPassword({email:val('login-email'),password:val('login-password')});if(r.error)throw r.error;await instructorLoad()}catch(e){error(e)}}}


function startNotificationSubscription(){
 if(!db||!instructorUser||page!=='instructor')return;
 var uid=instructorUser.id;
 if(notificationsChannel&&notificationsChannelOwner===uid)return;
 stopNotificationSubscription();
 try{
  notificationsChannelOwner=uid;
  notificationsChannel=db.channel('l101-instructor-alerts-'+uid).on('postgres_changes',{
    event:'*',schema:'public',table:'l101_live_notifications',filter:'instructor_id=eq.'+uid
  },function(){loadInstructorNotifications(true)}).subscribe();
 }catch(e){notificationsChannel=null;notificationsChannelOwner=''}
}
function stopNotificationSubscription(){
 if(notificationsChannel&&db)db.removeChannel(notificationsChannel);
 notificationsChannel=null;notificationsChannelOwner='';
}

function isTyping(){var el=document.activeElement;return !!(el&&/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))}
function setupNotificationUI(){
 var bell=document.getElementById('nc-bell'),shade=document.getElementById('nc-shade');
 if(bell)bell.onclick=function(){if(notificationsOpen)closeNotificationPanel();else openNotificationPanel()};
 if(shade)shade.onclick=closeNotificationPanel;
 document.addEventListener('keydown',function(event){
 if(!notificationsOpen)return;
 if(event.key==='Escape'){event.preventDefault();closeNotificationPanel();return}
 if(event.key!=='Tab')return;
 var drawer=document.getElementById('nc-drawer');
 if(!drawer)return;
 var focusable=Array.from(drawer.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href]')).filter(function(x){return x.getClientRects().length});
 if(!focusable.length)return;
 var first=focusable[0],last=focusable[focusable.length-1];
 if(event.shiftKey&&(document.activeElement===first||!drawer.contains(document.activeElement))){event.preventDefault();last.focus()}
 else if(!event.shiftKey&&(document.activeElement===last||!drawer.contains(document.activeElement))){event.preventDefault();first.focus()}
});
 updateNotificationBell();
}
function attentionCount(){var active=notificationRows.filter(function(n){return !n.resolved_at&&(n.kind==='needs_review'||n.kind==='help_request')});return active.filter(function(n){return n.kind==='needs_review'}).length+new Set(active.filter(function(n){return n.kind==='help_request'}).map(function(n){return n.participant_id})).size}
function unreadActivityCount(){return notificationRows.filter(function(n){return !n.read_at&&(n.kind==='scenario_complete'||n.kind==='story_complete')}).length}
function updateNotificationBell(){
 var visible=page==='instructor'&&!!instructorUser,bar=document.getElementById('nc-toolbar'),bell=document.getElementById('nc-bell'),count=document.getElementById('nc-count');
 if(bar)bar.classList.toggle('hidden',!visible);
 var waiting=attentionCount(),unread=unreadActivityCount();
 if(count)count.textContent=waiting+unread?String(Math.min(99,waiting+unread))+(waiting+unread>99?'+':''):'';
 if(bell){bell.setAttribute('aria-label','Instructor alerts: '+waiting+' require attention, '+unread+' new completion updates');bell.setAttribute('aria-expanded',String(notificationsOpen))}
}
function notificationPeople(n){return {student:n.participant&&n.participant.display_name||'Student',className:n.class&&n.class.title||'Classroom',scenario:scenarioTitleById(n.participant&&n.participant.assigned_scenario_id||n.class&&n.class.scenario_id)}}
function scenarioTitleById(id){var entry=scenarios.find(function(s){return s.id===id});return entry?entry.title:''}
function notificationSummary(n){var meta=notificationPeople(n);return meta.student+' · '+meta.className+(meta.scenario?' · '+meta.scenario:'')}
function notificationTime(value){return value?new Date(value).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):''}
async function loadInstructorNotifications(quiet){
 if(!db||!instructorUser||page!=='instructor'||notificationBusy)return;
 notificationBusy=true;
 try{
  var r=await db.from('l101_live_notifications').select('id,instructor_id,kind,title,detail,created_at,read_at,resolved_at,class_id,participant_id,response_id,class:l101_live_classes(title,code,scenario_id,scenario_snapshot,scenario_version),participant:l101_live_participants(display_name,assigned_scenario_id,assigned_scenario_snapshot)').eq('instructor_id',instructorUser.id).order('created_at',{ascending:false}).limit(200);
  if(r.error)throw r.error;
  var next=r.data||[],ids=next.filter(function(n){return n.kind==='needs_review'&&!n.resolved_at&&n.response_id}).map(function(n){return n.response_id}),lookup={},messagesByParticipant={};
  if(ids.length){
   var rr=await db.from('l101_live_responses').select('id,submitted_text,observation_index,rating,observer_comment').in('id',ids.slice(0,200));
   if(rr.error)throw rr.error;
   (rr.data||[]).forEach(function(x){lookup[x.id]=x});
  }
  var conversationParticipants=Array.from(new Set(next.filter(function(n){return n.kind==='help_request'}).map(function(n){return n.participant_id}))).slice(0,200);
  if(conversationParticipants.length){
   var mr=await db.from('l101_live_messages').select('id,participant_id,observation_index,sender_kind,content,created_at').in('participant_id',conversationParticipants).order('created_at',{ascending:true}).limit(1000);
   if(mr.error)throw mr.error;
   (mr.data||[]).forEach(function(m){(messagesByParticipant[m.participant_id]||(messagesByParticipant[m.participant_id]=[])).push(m)});
  }

  var fresh=next.filter(function(n){return !n.read_at&&!n.resolved_at||n.kind==='scenario_complete'&&!n.read_at}).filter(function(n){return !notifiedIds.has(n.id)});
  var shouldNotify=notificationsReady;
  next.forEach(function(n){notifiedIds.add(n.id)});
  var previous=JSON.stringify(notificationRows.map(function(n){return [n.id,n.read_at,n.resolved_at]})),now=JSON.stringify(next.map(function(n){return [n.id,n.read_at,n.resolved_at]}));
  notificationRows=next;notificationResponseRows=lookup;notificationMessageRows=messagesByParticipant;notificationsReady=true;
  if(shouldNotify&&fresh.length&&page==='instructor')fresh.slice().reverse().slice(-3).forEach(showIncomingNotification);
  updateNotificationBell();
  if(notificationsOpen&&!isTyping())renderNotificationPanel();
  if(previous!==now&&!isTyping()&&app.querySelector('#open-inbox-dashboard'))instructorRender();
 }catch(e){if(!quiet)error(e)}finally{notificationBusy=false}
}
function notificationChime(){
 if(!soundEnabled)return;
 try{var Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return;var ctx=new Audio(),o=ctx.createOscillator(),g=ctx.createGain();o.type='sine';o.frequency.setValueAtTime(740,ctx.currentTime);o.frequency.setValueAtTime(910,ctx.currentTime+.12);g.gain.setValueAtTime(.055,ctx.currentTime);g.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+.3);o.connect(g);g.connect(ctx.destination);o.start();o.stop(ctx.currentTime+.32);o.onended=function(){ctx.close()}}catch(e){}
}
function showIncomingNotification(n){
 var meta=notificationPeople(n);
 notificationChime();
 if(desktopEnabled&&'Notification' in window&&Notification.permission==='granted'&&document.visibilityState!=='visible'){
   try{var msg=new Notification(n.title,{body:notificationSummary(n),tag:n.id});msg.onclick=function(){window.focus();openNotificationPanel()}}catch(e){}
 }
 var area=document.getElementById('nc-toaststack');if(!area)return;
 var div=document.createElement('div');div.className='nc-toast';var title=document.createElement('strong');title.textContent=n.kind==='needs_review'?'Written response needs your rating':n.title;var detail=document.createElement('small');var pending=notificationResponseRows[n.response_id];var moment=pending?notificationMoment(n,pending.observation_index):null;detail.textContent=meta.student+' · '+meta.className+(moment?' · '+(moment.title||'Observation '+(pending.observation_index+1)):'');var buttons=document.createElement('div');buttons.className='nc-actions';var review=document.createElement('button');review.textContent=n.kind==='needs_review'?'Review & rate':'Open alert';review.onclick=function(){div.remove();openNotificationPanel('attention',n.id)};var close=document.createElement('button');close.className='nc-dismiss';close.textContent='Dismiss pop-up';close.onclick=function(){div.remove()};buttons.append(review,close);div.append(title,detail,buttons);area.prepend(div);
 while(area.children.length>3)area.lastElementChild.remove();
 setTimeout(function(){if(div.isConnected)div.remove()},14000);
}
function openNotificationPanel(filter,id){
 if(typeof filter==='string')notificationsFilter=filter;
 notificationsOpen=true;
 document.getElementById('nc-shade').classList.add('open');
 document.getElementById('nc-drawer').classList.add('open');
 updateNotificationBell();renderNotificationPanel();
 var close=document.getElementById('nc-close');if(close)close.focus();
 if(id){var el=document.querySelector('[data-nc-entry="'+id+'"]');if(el)el.scrollIntoView({block:'center',behavior:'smooth'})}
}
function closeNotificationPanel(){
 notificationsOpen=false;
 var shade=document.getElementById('nc-shade'),drawer=document.getElementById('nc-drawer'),restoreFocus=drawer&&drawer.contains(document.activeElement);
 if(shade)shade.classList.remove('open');if(drawer)drawer.classList.remove('open');
 updateNotificationBell();if(restoreFocus&&page==='instructor'){var bell=document.getElementById('nc-bell');if(bell)bell.focus()}
}
function notificationVisible(n){
 if(notificationsFilter==='attention')return (n.kind==='needs_review'||n.kind==='help_request')&&!n.resolved_at;
 if(notificationsFilter==='activity')return n.kind==='scenario_complete'||n.kind==='story_complete'||!!n.resolved_at;
 if(notificationsFilter==='messages')return n.kind==='help_request';
 return true;
}

function notificationScenario(n){var id=n.participant&&n.participant.assigned_scenario_id||n.class&&n.class.scenario_id,sc=scenarios.find(function(s){return s.id===id});return sc?Object.assign({},sc,{payload:n.participant&&n.participant.assigned_scenario_snapshot||n.class&&n.class.scenario_snapshot||sc.payload}):null}
function notificationMoment(n,idx){
 var s=notificationScenario(n),items=s&&s.payload&&Array.isArray(s.payload.moments)?s.payload.moments:[];return items[idx]||null
}
function notificationContextMarkup(n,index){
 if(!Number.isInteger(index))return '';
 var sc=notificationScenario(n),moments=sc&&sc.payload&&sc.payload.moments||[],m=moments[index];
 if(!m)return '<div class="l101-context"><b>Observation '+(index+1)+'</b><p>The scenario prompt is not available for this saved response.</p></div>';
 return '<div class="l101-context"><div class="eyebrow">What the student was responding to</div>'
 +'<h4>'+h(m.title||'Observation '+(index+1))+' <span class="small muted">· '+(index+1)+' of '+moments.length+'</span></h4>'
 +(m.trainee?'<p><b>Team member:</b> '+h(m.trainee)+'</p>':'')
 +(m.behavior?'<p><b>Situation / observed behavior:</b> '+h(m.behavior)+'</p>':'')
 +(m.context?'<p><b>Background:</b> '+h(m.context)+'</p>':'')
 +(m.question?'<p><b>Decision prompt:</b> '+h(m.question)+'</p>':'')
 +(m.cues?'<details><summary>Facilitator observation cues</summary><p>'+h(m.cues)+'</p></details>':'')
 +(Array.isArray(m.options)&&m.options.length?'<details><summary>Prepared response examples (instructor reference)</summary>'+m.options.map(function(o,i){return '<p><b>'+(i+1)+'.</b> '+h(o.action||'')+(o.outcome?' <em class="small muted">('+h(o.outcome)+')</em>':'')+'</p>'}).join('')+'</details>':'')
 +'</div>';
}
function instructorThreadMarkup(n){
 var messages=notificationMessageRows[n.participant_id]||[];
 return '<div class="l101-thread"><div class="spread"><b>Conversation with '+h(notificationPeople(n).student)+'</b><span class="small muted">'+messages.length+' messages</span></div>'
 +'<div class="l101-thread-history" aria-label="Conversation history">'
 +(messages.length?messages.map(function(m){
 return '<div class="l101-chat-message '+(m.sender_kind==='instructor'?'instructor':'student')+'"><div class="l101-chat-by">'+(m.sender_kind==='student'?'Student':'You')+(Number.isInteger(m.observation_index)?' · Observation '+(m.observation_index+1):'')+'</div>'
 +'<p>'+h(m.content)+'</p><div class="small muted">'+h(notificationTime(m.created_at))+'</div></div>'
 }).join(''):'<p class="small muted">No previous messages recorded for this student.</p>')+'</div>'
 +'<label style="margin-top:12px">Reply to student<textarea rows="3" maxlength="1500" id="l101-reply-'+h(n.id)+'" placeholder="Type your response; the student will see it in their message thread.">'+h(notificationMessageDrafts[n.participant_id]||'')+'</textarea></label>'
 +'<div class="nc-footer"><button class="btn ghost" data-nc-openclass="'+h(n.class_id)+'">Open classroom</button><button class="btn primary" data-l101-send-reply="'+h(n.id)+'">Send reply →</button></div>'
 +'</div>';
}
async function instructorSendMessage(notificationId){
 var n=notificationRows.find(function(x){return x.id===notificationId});if(!n||!instructorUser)return;
 var content=val('l101-reply-'+n.id).trim();if(!content){flash('Write a reply before sending.',true);return}
 try{
  var messages=notificationMessageRows[n.participant_id]||[],lastStudent=messages.slice().reverse().find(function(x){return x.sender_kind==='student'});
  var payload={class_id:n.class_id,participant_id:n.participant_id,sender_kind:'instructor',sender_user_id:instructorUser.id,observation_index:lastStudent&&Number.isInteger(lastStudent.observation_index)?lastStudent.observation_index:null,content:content};
  var r=await db.from('l101_live_messages').insert(payload).select('id').single();
  if(r.error)throw r.error;
  delete notificationMessageDrafts[n.participant_id];
  flash('Reply sent to '+notificationPeople(n).student+'.');
  await loadInstructorNotifications(false);
 }catch(e){error(e)}
}

function renderNotificationPanel(){
 if(!notificationsOpen)return;var el=document.getElementById('nc-body');if(!el)return;
 var active=el.contains(document.activeElement)?document.activeElement:null,focusToken=null;
 if(active){focusToken=active.id?'#'+active.id:null;if(!focusToken){var key=Array.from(active.attributes).find(function(x){return x.name.indexOf('data-nc-')===0||x.name==='data-l101-send-reply'});if(key)focusToken='['+key.name+'="'+key.value+'"]'}}
 var total=notificationRows.length,waiting=attentionCount(),completed=notificationRows.filter(function(n){return n.kind==='scenario_complete'||n.kind==='story_complete'}).length;
 var html='<div class="nc-head"><div><div class="eyebrow">Across all classrooms</div><h2>Instructor Notification Center</h2><p>'+waiting+' need attention · '+completed+' completion updates · Live connection with automatic refresh</p></div><button id="nc-close" aria-label="Close notifications">✕ Close</button></div>';
 html+='<div class="nc-pref"><button id="nc-sound">🔊 Sound: '+(soundEnabled?'On':'Off')+'</button><button id="nc-desktop">▣ Desktop alerts: '+(desktopEnabled?'On':'Off')+'</button></div>';
 html+='<div class="nc-filters">'+[['attention','Needs attention ('+waiting+')'],['messages','Student messages'],['all','All activity ('+total+')'],['activity','Completed / resolved']].map(function(a){return '<button class="'+(notificationsFilter===a[0]?'sel':'')+'" data-nc-filter="'+a[0]+'">'+h(a[1])+'</button>'}).join('')+'</div>';
 var list=notificationRows.filter(notificationVisible);if(notificationsFilter==='attention'||notificationsFilter==='messages'){var seenThreads=new Set();list=list.filter(function(n){if(n.kind!=='help_request')return true;if(seenThreads.has(n.participant_id))return false;seenThreads.add(n.participant_id);return true})}
 if(!list.length)html+='<div class="nc-empty">✓ Nothing needs your attention in this view.<br><small>Incoming student responses from all classes will appear here.</small></div>';
 else list.forEach(function(n){
   var meta=notificationPeople(n),response=notificationResponseRows[n.response_id],note=n.kind==='needs_review'?(response&&response.submitted_text||n.detail):n.detail,
   actionable=!n.resolved_at&&(n.kind==='needs_review'||n.kind==='help_request');
   html+='<section class="nc-item '+(actionable?'attention ':'done ')+(n.kind==='help_request'?'help ':'')+(!n.read_at?'unread':'')+'" data-nc-entry="'+h(n.id)+'">';
   html+='<div class="spread"><div class="nc-class">'+h(meta.className)+(meta.scenario?' · '+h(meta.scenario):'')+'</div><span class="small muted">'+h(notificationTime(n.created_at))+'</span></div>';
   html+='<h3>'+h(meta.student)+' — '+h(n.title)+'</h3><div class="nc-meta"><span>Scenario: '+h(meta.scenario||'Leadership 101')+'</span>'+(response?'<span>· Observation '+(response.observation_index+1)+'</span>':'')+'<span class="nc-priority">'+(actionable?'ACTION NEEDED':'Recorded')+'</span></div>';
   if(n.kind==='needs_review'&&response)html+=notificationContextMarkup(n,response.observation_index);
   else if(n.kind==='help_request'){var thread=notificationMessageRows[n.participant_id]||[],last=thread.slice().reverse().find(function(m){return m.sender_kind==='student'});if(last&&Number.isInteger(last.observation_index))html+=notificationContextMarkup(n,last.observation_index)}
   html+='<div class="nc-text"><b>'+(n.kind==='needs_review'?'Student’s original leadership response':n.kind==='help_request'?'Student’s question / message':'Update')+'</b><p>'+h(note)+'</p></div>';
   if(n.kind==='needs_review'&&!n.resolved_at){
     html+='<div class="nc-rating" role="group" aria-label="Observer evaluation" data-nc-rating="'+h(n.id)+'" data-grade="'+h(notificationDraftGrades[n.id]||'')+'"><button type="button" data-nc-grade="positive" aria-pressed="'+(notificationDraftGrades[n.id]==='positive'?'true':'false')+'" class="'+(notificationDraftGrades[n.id]==='positive'?'chosen':'')+'">Positive</button><button type="button" data-nc-grade="neutral" aria-pressed="'+(notificationDraftGrades[n.id]==='neutral'?'true':'false')+'" class="'+(notificationDraftGrades[n.id]==='neutral'?'chosen':'')+'">Neutral</button><button type="button" data-nc-grade="negative" aria-pressed="'+(notificationDraftGrades[n.id]==='negative'?'true':'false')+'" class="'+(notificationDraftGrades[n.id]==='negative'?'chosen':'')+'">Negative</button></div>';
     html+=rubricControls('nc-rubric-'+n.id,notificationDraftRubrics[n.id]||{});
     html+='<label>Observer comments (optional)<textarea id="nc-comment-'+h(n.id)+'" placeholder="What did the student demonstrate?">'+h(notificationDraftNotes[n.id]||'')+'</textarea></label>';
     html+='<div class="nc-footer"><button class="btn ghost" data-nc-openclass="'+h(n.class_id)+'">Open classroom</button><button class="btn primary" data-nc-submit="'+h(n.id)+'">Save evaluation</button></div>';
   }else if(n.kind==='help_request'){
     html+=instructorThreadMarkup(n);
     if(!n.resolved_at)html+='<div class="nc-footer"><button class="btn ghost" data-nc-resolve="'+h(n.id)+'">Mark resolved without replying</button></div>';
   }else if(!n.read_at){
     html+='<div class="nc-footer"><button class="btn ghost" data-nc-markread="'+h(n.id)+'">Mark as read</button></div>';
   }
   html+='</section>';
 });
 el.innerHTML=html;
 if(focusToken){var restored=el.querySelector(focusToken);if(restored)restored.focus({preventScroll:true})}
 document.getElementById('nc-close').onclick=closeNotificationPanel;
 document.getElementById('nc-sound').onclick=function(){soundEnabled=!soundEnabled;localStorage.setItem('l101_notify_sound',soundEnabled?'yes':'no');if(soundEnabled)notificationChime();renderNotificationPanel()};
 document.getElementById('nc-desktop').onclick=async function(){if(!('Notification' in window)){flash('Desktop notifications are not supported in this browser.',true);return}if(!desktopEnabled){var perm=await Notification.requestPermission();if(perm!=='granted'){flash('Desktop notification permission was not granted.',true);return}}desktopEnabled=!desktopEnabled;localStorage.setItem('l101_notify_desktop',desktopEnabled?'yes':'no');renderNotificationPanel()};
 el.querySelectorAll('[data-nc-filter]').forEach(function(b){b.onclick=function(){notificationsFilter=b.dataset.ncFilter;renderNotificationPanel()}});
 el.querySelectorAll('[data-nc-rating]').forEach(function(box){box.querySelectorAll('[data-nc-grade]').forEach(function(b){b.onclick=function(){box.querySelectorAll('button').forEach(function(x){x.classList.remove('chosen')});b.classList.add('chosen');box.querySelectorAll('button').forEach(function(x){x.setAttribute('aria-pressed',String(x===b))});box.dataset.grade=b.dataset.ncGrade;notificationDraftGrades[box.dataset.ncRating]=b.dataset.ncGrade}})});
 el.querySelectorAll('textarea[id^="nc-comment-"]').forEach(function(input){input.oninput=function(){notificationDraftNotes[input.id.slice('nc-comment-'.length)]=input.value}});
 el.querySelectorAll('[data-l101-rubric]').forEach(function(control){control.onchange=function(){var section=control.closest('.nc-item'),n=section&&notificationRows.find(function(x){return x.id===section.dataset.ncEntry});if(n)notificationDraftRubrics[n.id]=rubricFromForm('nc-rubric-'+n.id)}});
 el.querySelectorAll('[data-nc-submit]').forEach(function(b){b.onclick=function(){gradeNotification(b.dataset.ncSubmit)}});
 el.querySelectorAll('textarea[id^="l101-reply-"]').forEach(function(input){input.oninput=function(){var n=notificationRows.find(function(x){return x.id===input.id.slice('l101-reply-'.length)});if(n)notificationMessageDrafts[n.participant_id]=input.value}});
 el.querySelectorAll('[data-l101-send-reply]').forEach(function(b){b.onclick=function(){instructorSendMessage(b.dataset.l101SendReply)}});
 el.querySelectorAll('[data-nc-resolve]').forEach(function(b){b.onclick=function(){resolveNotification(b.dataset.ncResolve)}});
 el.querySelectorAll('[data-nc-markread]').forEach(function(b){b.onclick=function(){markNotificationRead(b.dataset.ncMarkread)}});
 el.querySelectorAll('[data-nc-openclass]').forEach(function(b){b.onclick=async function(){selectedClass=b.dataset.ncOpenclass;closeNotificationPanel();await instructorRefresh()}});
}
async function gradeNotification(id){
 var n=notificationRows.find(function(x){return x.id===id});if(!n||n.resolved_at||!n.response_id)return;
 var box=document.querySelector('[data-nc-rating="'+id+'"]'),grade=box&&box.dataset.grade;
 if(!grade){flash('Choose Positive, Neutral or Negative.',true);return}
 var note=val('nc-comment-'+id),rubric=rubricFromForm('nc-rubric-'+id);
 try{var rr=await db.from('l101_live_responses').update({rating:grade,observer_comment:note,rubric:rubric,updated_at:new Date().toISOString()}).eq('id',n.response_id).is('rating',null).select('id');
 if(rr.error)throw rr.error;if(!(rr.data||[]).length){flash('This response was already reviewed by another instructor or tab.',true);await loadInstructorNotifications(false);return}
 delete notificationDraftGrades[id];delete notificationDraftNotes[id];delete notificationDraftRubrics[id];flash('Rating sent to '+notificationPeople(n).student);
 await loadInstructorNotifications(false);
 await instructorRefresh(true);
 }catch(e){error(e)}
}
async function markNotificationRead(id){try{var r=await db.from('l101_live_notifications').update({read_at:new Date().toISOString()}).eq('id',id);if(r.error)throw r.error;await loadInstructorNotifications(false)}catch(e){error(e)}}
async function resolveNotification(id){try{var at=new Date().toISOString(),r=await db.from('l101_live_notifications').update({resolved_at:at,read_at:at}).eq('id',id);if(r.error)throw r.error;flash('Help request marked as handled');await loadInstructorNotifications(false)}catch(e){error(e)}}

async function instructorRefresh(quiet){try{var s=await db.from('l101_live_scenarios').select('id,title,payload').order('id');if(s.error)throw s.error;scenarios=s.data||[];var c=await db.from('l101_live_classes').select('id,title,code,scenario_id,scenario_snapshot,scenario_version,is_open,created_at,assignment_mode').order('created_at',{ascending:false});if(c.error)throw c.error;classes=c.data||[];if(!selectedClass&&classes.length)selectedClass=classes[0].id;
participants=[];responses=[];injects=[];histories=[];dialogueLogs=[];recoveryRows=[];storyRuns=[];storyEvents=[];if(selectedClass){var p=await db.from('l101_live_participants').select('id,class_id,display_name,reflection,joined_at,assigned_scenario_id,assigned_scenario_snapshot,team_name').eq('class_id',selectedClass);if(p.error)throw p.error;participants=p.data||[];if(participants.length){var rr=await db.from('l101_live_responses').select('id,participant_id,observation_index,submitted_text,option_index,rating,observer_comment,rubric').in('participant_id',participants.map(function(x){return x.id})).order('observation_index');if(rr.error)throw rr.error;responses=rr.data||[];var sr=await db.from('l101_live_story_runs').select('participant_id,current_node,trust_score,pressure_score,finished_at,updated_at').in('participant_id',participants.map(function(x){return x.id}));if(sr.error)throw sr.error;storyRuns=sr.data||[]}var ir=await db.from('l101_live_injects').select('id,title,description,created_at,target_scenario_id').eq('class_id',selectedClass);if(ir.error)throw ir.error;injects=ir.data||[]}var digest=JSON.stringify({classes:classes,participants:participants,responses:responses,injects:injects,histories:histories,dialogue:dialogueLogs,recovery:recoveryRows,story:storyRuns});if(!quiet||digest!==lastInstructorHash){if(!quiet||!document.activeElement||!/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)){instructorRender();lastInstructorHash=digest}}setStudioConnection('online')}catch(e){setStudioConnection('offline');if(!quiet)error(e)}}
function currentClass(){return classes.find(function(x){return x.id===selectedClass})}
function currentScenario(){var c=currentClass(),sc=c&&scenarios.find(function(s){return s.id===c.scenario_id});return sc&&c?Object.assign({},sc,{payload:c.scenario_snapshot||sc.payload}):sc}
function scenarioForParticipant(p){var c=currentClass(),id=p&&p.assigned_scenario_id||c&&c.scenario_id,sc=scenarios.find(function(x){return x.id===id});if(!sc)return currentScenario();return Object.assign({},sc,{payload:p&&p.assigned_scenario_snapshot||c&&c.scenario_snapshot||sc.payload})}

var l101RubricDimensions=['Communication','Empathy','Accountability','Judgment','Integrity'];
function rubricFromForm(prefix){
 var out={};l101RubricDimensions.forEach(function(key){var v=val(prefix+'-'+key.toLowerCase());if(v)out[key]=v});return out;
}
function rubricControls(prefix,values){
 values=values||{};
 return '<div class="l101-rubric-input"><b>Behavior-based feedback</b><p class="small muted">Optional: assess the competencies demonstrated by this response.</p><div class="l101-rubric-grid">'+l101RubricDimensions.map(function(key){
 var id=prefix+'-'+key.toLowerCase(),current=values[key]||'';
 return '<label>'+h(key)+'<select id="'+h(id)+'" data-l101-rubric="'+h(key)+'"><option value="">Not observed</option>'+[['Developing','Developing'],['Effective','Effective'],['Strong','Strong']].map(function(option){return '<option value="'+option[0]+'" '+(current===option[0]?'selected':'')+'>'+option[1]+'</option>'}).join('')+'</select></label>';
 }).join('')+'</div></div>';
}


function l101ScenarioAnalytics(){
 var groups={};participants.forEach(function(p){
  var sc=scenarioForParticipant(p),id=sc&&sc.id||'unassigned',g=groups[id]||(groups[id]={title:sc&&sc.title||'Unassigned',members:0,completed:0,inprogress:0,waiting:0});
  g.members++;var rs=responses.filter(function(r){return r.participant_id===p.id}),story=storyRuns.find(function(x){return x.participant_id===p.id}),steps=(sc&&sc.payload&&sc.payload.moments||[]).length;
  if(story&&story.finished_at||(steps>0&&rs.filter(function(r){return !!r.rating}).length>=steps))g.completed++;
  if(rs.length||story)g.inprogress++;
  g.waiting+=rs.filter(function(r){return !r.rating}).length;
 });
 var metrics='<div class="l101-skill-summary"><h3>Observed leadership competencies</h3><p class="small muted">Counts reflect instructor rubric feedback in this class, excluding unobserved criteria.</p><div class="l101-skill-grid">'
 +['Communication','Empathy','Accountability','Judgment','Integrity'].map(function(dim){
  var grades=responses.map(function(r){return r.rubric&&r.rubric[dim]}).filter(Boolean),
  strong=grades.filter(function(x){return x==='Strong'}).length,effective=grades.filter(function(x){return x==='Effective'}).length,developing=grades.filter(function(x){return x==='Developing'}).length;
  return '<div class="l101-skill-row"><b>'+h(dim)+'</b><span class="small muted">'+grades.length+' observations</span>'
   +'<div class="l101-skill-track">'+(grades.length?'<i style="width:'+(strong/grades.length*100)+'%"></i><em style="width:'+(effective/grades.length*100)+'%"></em><small style="width:'+(developing/grades.length*100)+'%"></small>':'')+'</div>'
   +'<span class="small muted">'+strong+' Strong · '+effective+' Effective · '+developing+' Developing</span></div>';
 }).join('')+'</div><p class="small muted">Bar segments: blue = Strong, teal = Effective, gold = Developing.</p></div>';
 return '<div class="panel"><div class="spread"><h2>Classroom Progress & Analytics</h2><span class="chip">'+participants.length+' learners · '+Object.keys(groups).length+' scenarios</span></div>'
  +'<p class="muted small">Follow several scenarios at once while students use one joining code.</p><div class="l101-analytics-grid">'
  +Object.keys(groups).map(function(id){var g=groups[id],pct=g.members?Math.round(100*g.completed/g.members):0;
    return '<div class="l101-analytics-card"><div class="eyebrow">'+h(g.title)+'</div><strong>'+g.completed+' / '+g.members+'</strong><span class="small">Completed</span><div class="track"><i style="width:'+pct+'%"></i></div><p class="small">'+g.inprogress+' started · '+g.waiting+' awaiting reviews</p></div>';
   }).join('')+'</div>'+metrics+'</div>';
}
function l101TeamsPanel(c){
 var names=Array.from(new Set(participants.map(function(p){return p.team_name}).filter(Boolean))).sort();
 return '<div class="panel"><h2>Team Scenario Assignments</h2><p class="muted small">Enter a team name on each student card below. Then assign all members of the same team to one scenario at once. Active attempts remain protected.</p>'
 +(names.length?'<div class="l101-team-grid">'+names.map(function(name){var members=participants.filter(function(p){return p.team_name===name});
    return '<div class="l101-team-card"><b>'+h(name)+'</b><p class="small">'+members.length+' learners</p><label>Scenario for this team<select data-team-scenario="'+h(name)+'">'+scenarios.map(function(sc){return '<option value="'+h(sc.id)+'">'+h(sc.title)+'</option>'}).join('')+'</select></label><button class="btn gold compact" data-team-assign="'+h(name)+'">Assign team scenario</button></div>';
  }).join('')+'</div>':'<div class="notice">No teams have been created. Type a team name on any student card to start.</div>')+'</div>';
}
function l101AssignmentsPanel(c){
 return l101TeamsPanel(c)+'<div class="panel"><div class="spread"><h2>Student Scenario Assignments</h2><button class="btn" id="export-class">Export Reports (JSON)</button></div>'
  +'<p class="muted small">Everyone joins using the same classroom code. Assign students or teams before they start.</p><div class="list">'
  +(participants.length?participants.map(function(p){
    var mine=responses.filter(function(r){return r.participant_id===p.id}),st=storyRuns.find(function(x){return x.participant_id===p.id}),sc=scenarioForParticipant(p),
    active=mine.length>0||!!st,chosen=p.assigned_scenario_id||c.scenario_id,graded=mine.filter(function(r){return !!r.rating}).length;
    return '<div class="l101-student-card"><div class="spread"><strong>'+h(p.display_name)+'</strong><span class="badge">'+(active?'Working · Assignment locked':'Ready for assignment')+'</span></div>'
      +'<div class="l101-roster-control"><label>Assigned scenario<select data-assign-scenario="'+h(p.id)+'" '+(active?'disabled':'')+'>'
      +scenarios.map(function(s){return '<option value="'+h(s.id)+'" '+(s.id===chosen?'selected':'')+'>'+h(s.title)+'</option>'}).join('')
      +'</select></label><button class="btn ghost" data-print-participant="'+h(p.id)+'">Print report</button></div>'
      +'<div class="l101-team-editor"><label>Team <input data-team-name="'+h(p.id)+'" maxlength="60" placeholder="e.g. Team Blue" value="'+h(p.team_name||'')+'"></label><button class="btn compact" data-save-team="'+h(p.id)+'">Save team</button></div>'
      +'<p class="small muted">'+graded+' / '+((sc&&sc.payload&&sc.payload.moments)||[]).length+' checkpoints rated · '+mine.filter(function(r){return !r.rating}).length+' awaiting feedback'
      +(st?' · Story '+(st.finished_at?'completed':' in progress'):'')+'</p><div class="l101-retry-list">'
      +mine.filter(function(r){return !!r.rating}).map(function(r){return '<button class="btn ghost l101-retry" data-reopen="'+h(r.id)+'">Reopen checkpoint '+(r.observation_index+1)+'</button>'}).join('')
      +'</div></div>';
   }).join(''):'<p class="muted">No students yet. Use the joining code or QR link above.</p>')+'</div></div>';
}
function l101InjectPanel(){
 var prepared=scenarios.filter(function(s){return s.payload&&Array.isArray(s.payload.injects)&&s.payload.injects.length});
 return '<div class="panel"><h2>Release scenario-specific injects</h2><p class="muted small">A complication goes only to students assigned the selected scenario.</p>'
  +'<label>Prepared scenario complication<select id="inject-selector">'+prepared.map(function(s){
   return '<optgroup label="'+h(s.title)+'">'+s.payload.injects.map(function(i,n){return '<option value="'+h(s.id)+'::'+n+'">'+h(i.title)+'</option>'}).join('')+'</optgroup>';
  }).join('')+'</select></label><div class="row" style="margin-top:12px"><button class="btn gold" id="release-inject">Release inject</button></div>'
  +'<div class="list" style="margin-top:14px">'+injects.map(function(i){var t=scenarios.find(function(s){return s.id===i.target_scenario_id});
    return '<div class="notice"><b>'+h(i.title)+'</b><p>'+h(i.description)+'</p><p class="small muted">Audience: '+h(t?t.title:'Entire classroom')+'</p></div>'
   }).join('')+'</div></div>';
}
async function l101SetTeam(participantId){
 var student=participants.find(function(p){return p.id===participantId}),input=app.querySelector('[data-team-name="'+participantId+'"]');
 if(!student||!input)return;
 try{
  var r=await db.rpc('l101_set_student_team',{p_participant_id:participantId,p_team:input.value.trim()});
  if(r.error)throw r.error;flash('Team updated for '+student.display_name+'.');await instructorRefresh();
 }catch(e){error(e)}
}
async function l101AssignTeam(team){
 var c=currentClass(),select=app.querySelector('[data-team-scenario="'+team+'"]'),members=participants.filter(function(p){return p.team_name===team});
 if(!c||!select||!members.length)return;
 var scenario=scenarios.find(function(s){return s.id===select.value});
 if(!scenario||!window.confirm('Assign '+members.length+' members of '+team+' to '+scenario.title+'? Already-started team assignments cannot be changed.'))return;
 try{
  var r=await db.rpc('l101_assign_team_scenario',{p_class_id:c.id,p_team:team,p_scenario_id:select.value});
  if(r.error)throw r.error;flash('Assigned '+r.data.assigned_count+' learners in '+team+'.');await instructorRefresh();
 }catch(e){error(e)}
}
async function l101AssignScenario(participantId,newId){
 var person=participants.find(function(p){return p.id===participantId}),item=scenarios.find(function(s){return s.id===newId});
 if(!person||!item)return;
 if(!window.confirm('Assign '+person.display_name+' to '+item.title+'? This is allowed only before the student begins.')){instructorRender();return}
 try{
  var r=await db.rpc('l101_assign_scenario',{p_participant_id:participantId,p_scenario_id:newId});
  if(r.error)throw r.error;flash('Assigned '+person.display_name+' to '+item.title+'.');await instructorRefresh();
 }catch(e){error(e);await instructorRefresh()}
}

function instructorRender(){var c=currentClass(),sc=currentScenario();var pending=responses.filter(function(x){return !x.rating});var rated=responses.filter(function(x){return !!x.rating});var cards=classes.map(function(x){return '<button class="choice" style="margin:0 0 8px" data-class="'+h(x.id)+'"><span>◈</span><span><b>'+h(x.title)+'</b><br><small>'+h(x.code)+(x.is_open?' · Open':' · Closed')+'</small></span></button>'}).join('');
var ui='<div class="grid"><div><div class="panel"><div class="spread"><h2>Live Classrooms</h2><button class="btn" id="instructor-logout">Sign out</button></div><div class="grid3">'+stat(classes.length,'Classes')+stat(participants.length,'Participants in current class')+stat(notificationRows.filter(function(n){return n.kind==='needs_review'&&!n.resolved_at}).length,'Written responses across all classes')+'</div><div class="notice" style="margin-top:15px"><div class="spread"><div><b>🔔 Instructor Notification Center</b><p class="small muted">Monitor all active scenarios without switching classrooms.</p></div><button class="btn gold" id="open-inbox-dashboard">Open all alerts ('+attentionCount()+')</button></div></div><div class="stack" style="margin-top:18px"><label>New class title<input id="new-class-title" placeholder="Leadership 101 — Cohort A"></label><label>Choose scenario<select id="new-class-scenario">'+scenarios.map(function(s){return '<option value="'+h(s.id)+'">'+h(s.title)+'</option>'}).join('')+'</select></label><label class="l101-hold-setting"><input id="new-class-hold" type="checkbox"> <span><b>Wait for instructor assignment</b><small>Students stay on the waiting screen until assigned.</small></span></label><button class="btn gold" id="create-class">Create Classroom</button></div></div>';
if(c){ui+=l101ScenarioAnalytics();ui+='<div class="panel"><div class="spread"><div><span class="eyebrow">Active classroom</span><h2>'+h(c.title)+'</h2></div><button class="btn" id="toggle-class">'+(c.is_open?'Close joining':'Reopen class')+'</button></div><p>Join code: <strong style="font-size:24px">'+h(c.code)+'</strong></p><p><a id="share-class" target="_blank" rel="noopener" href="/leadership101-live.html?code='+encodeURIComponent(c.code)+'">Student joining link</a></p><button class="btn ghost" id="copy-class">Copy student link</button><div style="display:flex;gap:14px;align-items:center;margin:14px 0"><canvas id="join-qrcode" width="160" height="160" aria-label="QR code for the student joining link"></canvas><p class="small muted">Students can scan this QR code to join the current class. The link includes only the classroom code.</p></div><div class="notice"><b>Assigned:</b> '+h(sc?sc.title:'Unknown scenario')+'<br>'+(c.assignment_mode==='hold'?'Students wait until their scenario is assigned.':'Students can begin the default scenario or receive individual assignments.')+'</div></div>';
ui+='<div class="panel"><h2>Review student responses</h2>'+ (pending.length?pending.map(function(r){var p=participants.find(function(x){return x.id===r.participant_id}),participantScenario=scenarioForParticipant(p),moment=participantScenario&&participantScenario.payload&&participantScenario.payload.moments[r.observation_index];return '<div class="card" style="margin-bottom:13px"><div class="spread"><b>'+h(p&&p.display_name)+' · Observation '+(r.observation_index+1)+'</b><span class="tag">Awaiting review</span></div><p class="small muted">'+h(moment&&moment.title)+'</p>'+(moment?'<div class="l101-context"><p><b>Observed behavior:</b> '+h(moment.behavior||'')+'</p><p><b>Background:</b> '+h(moment.context||'')+'</p><p><b>Decision question:</b> '+h(moment.question||'')+'</p></div>':'')+'<div class="response"><b>Original student response:</b><p>'+h(r.submitted_text)+'</p></div>'+rubricControls('response-rubric-'+r.id,{})+'<div class="rating" role="group" aria-label="Choose observer evaluation" data-rating="'+h(r.id)+'"><button type="button" aria-pressed="false" data-grade="positive">Positive</button><button type="button" aria-pressed="false" data-grade="neutral">Neutral</button><button type="button" aria-pressed="false" data-grade="negative">Negative</button></div><label style="margin-top:9px">Observer comments<textarea id="comment-'+h(r.id)+'" placeholder="What did the leader demonstrate? What should improve?"></textarea></label><div class="row" style="margin-top:10px"><button class="btn primary" data-save-rating="'+h(r.id)+'">Save Rating</button></div></div>'}).join(''):'<p class="muted">No responses currently awaiting observer review.</p>')+'</div>';
ui+=l101AssignmentsPanel(c);
ui+=l101InjectPanel();
}
ui+='</div><aside><div class="panel"><h3>Your classes</h3>'+(cards||'<p class="muted">Create your first classroom.</p>')+'</div>'
+'<div class="panel"><span class="eyebrow">Phase 3 Instructor Tools</span><h3>Visual Scenario Builder</h3>'
+'<p class="small muted">Edit scenes, branching choices, reactions, characters and injects with a visual preview. Keep work in a private draft until publishing.</p>'
+'<a class="btn gold l101-authoring-link" href="/leadership101-builder.html">Open Visual Scenario Builder ↗</a>'
+'<div class="notice small" style="margin-top:14px"><b>'+scenarios.length+' published scenarios</b><p>Publishing updates future classrooms; current cohorts keep their locked versions.</p></div></div></aside></div>';
app.innerHTML=ui;
var inboxButton=document.getElementById('open-inbox-dashboard');if(inboxButton)inboxButton.onclick=openNotificationPanel;
if(c&&window.lead101QR){window.lead101QR.toCanvas(document.getElementById('join-qrcode'),new URL('/leadership101-live.html?code='+c.code,location.origin).href,{width:160,margin:1,errorCorrectionLevel:'M'}).catch(function(){})}
app.querySelectorAll('[data-class]').forEach(function(x){x.onclick=function(){selectedClass=x.dataset.class;instructorRefresh()}});
app.querySelectorAll('[data-assign-scenario]').forEach(function(x){x.onchange=function(){l101AssignScenario(x.dataset.assignScenario,x.value)}});
app.querySelectorAll('[data-save-team]').forEach(function(b){b.onclick=function(){l101SetTeam(b.dataset.saveTeam)}});
app.querySelectorAll('[data-team-assign]').forEach(function(b){b.onclick=function(){l101AssignTeam(b.dataset.teamAssign)}});

app.querySelectorAll('[data-rating]').forEach(function(div){div.querySelectorAll('[data-grade]').forEach(function(b){b.onclick=function(){div.querySelectorAll('button').forEach(function(z){z.classList.remove('selected')});b.classList.add('selected');div.querySelectorAll('button').forEach(function(x){x.setAttribute('aria-pressed',String(x===b))});div.dataset.grade=b.dataset.grade}})});
app.querySelectorAll('[data-save-rating]').forEach(function(b){b.onclick=function(){saveRating(b.dataset.saveRating)}});
app.querySelectorAll('[data-reopen]').forEach(function(b){b.onclick=function(){reopenStudentDecision(b.dataset.reopen)}});
app.querySelectorAll('[data-print-participant]').forEach(function(b){b.onclick=function(){printParticipant(b.dataset.printParticipant)}});

document.getElementById('instructor-logout').onclick=async function(){stopNotificationSubscription();await db.auth.signOut();instructorUser=null;notificationRows=[];notificationResponseRows={};notificationsReady=false;notifiedIds.clear();closeNotificationPanel();updateNotificationBell();instructorLogin()};
document.getElementById('create-class').onclick=createClass;


if(c){document.getElementById('toggle-class').onclick=toggleClass;document.getElementById('release-inject').onclick=releaseInject;document.getElementById('copy-class').onclick=async function(){try{await navigator.clipboard.writeText(new URL('/leadership101-live.html?code='+c.code,location.origin).href);flash('Student link copied')}catch(e){error(e)}};document.getElementById('export-class').onclick=async function(){try{await loadClassReportExtras();download('Leadership101-Class-'+c.code+'.json',{classroom:c,participants:participants,responses:responses,injects:injects,dialogue:dialogueLogs,recovery_plans:recoveryRows,response_history:histories,story_runs:storyRuns,story_events:storyEvents})}catch(e){error(e)}}}
}
async function createClass(){try{var title=val('new-class-title').trim(),scenario=val('new-class-scenario');if(title.length<3||!scenario){flash('Enter a class title and select a scenario.',true);return}var r=await db.from('l101_live_classes').insert({title:title,scenario_id:scenario,instructor_id:instructorUser.id,assignment_mode:document.getElementById('new-class-hold')&&document.getElementById('new-class-hold').checked?'hold':'default'}).select('id').single();if(r.error)throw r.error;selectedClass=r.data.id;await instructorRefresh();flash('Classroom created')}catch(e){error(e)}}
async function toggleClass(){try{var c=currentClass(),r=await db.from('l101_live_classes').update({is_open:!c.is_open}).eq('id',c.id);if(r.error)throw r.error;await instructorRefresh()}catch(e){error(e)}}
async function reopenStudentDecision(responseId){
 var r=responses.find(function(x){return x.id===responseId}),who=participants.find(function(p){return p.id===(r&&r.participant_id)});
 if(!r)return;
 if(!window.confirm('Reopen checkpoint '+(r.observation_index+1)+' for '+(who&&who.display_name||'this learner')+'? Later decisions will also reopen, and prior submissions stay in the history.'))return;
 try{var result=await db.rpc('l101_reopen_response',{p_response_id:responseId});if(result.error)throw result.error;flash('Checkpoint reopened. The learner can try again.');await loadInstructorNotifications(false);await instructorRefresh()}catch(e){error(e)}
}
async function saveRating(id){try{var div=app.querySelector('[data-rating="'+id+'"]'),grade=div&&div.dataset.grade;if(!grade){flash('Choose Positive, Neutral, or Negative.',true);return}var saveButton=app.querySelector('[data-save-rating="'+id+'"]');if(saveButton)saveButton.disabled=true;var r=await db.from('l101_live_responses').update({rating:grade,observer_comment:val('comment-'+id),rubric:rubricFromForm('response-rubric-'+id),updated_at:new Date().toISOString()}).eq('id',id).is('rating',null).select('id');if(r.error)throw r.error;if(!(r.data||[]).length){flash('This response was already evaluated. Refreshing the classroom.',true);await instructorRefresh(false);return}flash('Observer evaluation saved');await instructorRefresh()}catch(e){error(e)}}
async function releaseInject(){if(injectBusy)return;injectBusy=true;var button=document.getElementById('release-inject');if(button)button.disabled=true;try{var split=val('inject-selector').split('::'),id=split[0],index=Number(split[1]),selected=scenarios.find(function(x){return x.id===id}),inj=selected&&selected.payload&&selected.payload.injects[index],c=currentClass();if(!inj){flash('Choose an available inject.',true);return}var r=await db.from('l101_live_injects').insert({class_id:c.id,title:inj.title,description:inj.text,target_scenario_id:id});if(r.error)throw r.error;flash('Scenario-specific inject released.');await instructorRefresh()}catch(e){error(e)}finally{injectBusy=false;if(button&&button.isConnected)button.disabled=false}}

async function loadClassReportExtras(){
 var ids=participants.map(function(p){return p.id});
 if(!ids.length){histories=[];dialogueLogs=[];recoveryRows=[];storyEvents=[];storyRuns=[];return}
 var extra=await Promise.all([
  db.from('l101_live_response_history').select('participant_id,observation_index,event_kind,submitted_text,option_index,rating,observer_comment,changed_at').in('participant_id',ids),
  db.from('l101_live_dialogue_steps').select('participant_id,character_index,turn_index,chosen_text,reply_text,coaching_tip,delta,next_turn').in('participant_id',ids),
  db.from('l101_live_recovery_plans').select('participant_id,observation_index,plan').in('participant_id',ids),
  db.from('l101_live_story_runs').select('participant_id,current_node,trust_score,pressure_score,finished_at').in('participant_id',ids),
  db.from('l101_live_story_events').select('participant_id,node_id,choice_text,reaction,coaching,trust_delta,pressure_delta,inject_id,created_at').in('participant_id',ids).order('created_at',{ascending:true})
 ]);
 for(var k=0;k<extra.length;k++)if(extra[k].error)throw extra[k].error;
 histories=extra[0].data||[];dialogueLogs=extra[1].data||[];recoveryRows=extra[2].data||[];storyRuns=extra[3].data||[];storyEvents=extra[4].data||[];
}

async function printParticipant(id){try{await loadClassReportExtras()}catch(e){error(e);return}var p=participants.find(function(x){return x.id===id}),sc=scenarioForParticipant(p),c=currentClass();if(!p||!sc)return;var rs=responses.filter(function(r){return r.participant_id===p.id}),data={participant:{name:p.display_name,reflection:p.reflection},class:{title:c.title},scenario:{title:sc.title,moments:sc.payload.moments,characters:sc.payload.characters||[]},responses:rs,dialogue:dialogueLogs.filter(function(d){return d.participant_id===p.id}),recovery_plans:recoveryRows.filter(function(d){return d.participant_id===p.id}),story:{run:storyRuns.find(function(x){return x.participant_id===p.id}),history:storyEvents.filter(function(x){return x.participant_id===p.id}).map(function(e){return {node_id:e.node_id,choice:e.choice_text,reaction:e.reaction,coaching:e.coaching,is_inject:!!e.inject_id}})},response_history:histories.filter(function(d){return d.participant_id===p.id}).map(function(e){return {observation_index:e.observation_index,event:e.event_kind,rating:e.rating,submitted_text:e.submitted_text,changed_at:e.changed_at}})};setPrint(data);window.print()}
function normalizeScenario(raw){var o=JSON.parse(JSON.stringify(raw));if(!o.id)o.id='custom-'+Date.now()+'-'+Math.floor(Math.random()*10000);if(!o.title||!Array.isArray(o.moments))throw Error('Scenario requires a title and an observations/moments array.');o.characters=Array.isArray(o.characters)?o.characters:[];o.injects=Array.isArray(o.injects)?o.injects:[];return o}
async function saveScenarios(list){for(var i=0;i<list.length;i++){var o=normalizeScenario(list[i]);var r=await db.from('l101_live_scenarios').upsert({id:o.id,title:o.title,payload:o,owner_id:instructorUser.id});if(r.error)throw r.error}flash(list.length+' scenarios saved to the online library');await instructorRefresh()}
function importScenarios(event){var file=event.target.files&&event.target.files[0];if(!file)return;file.text().then(function(txt){var obj=JSON.parse(txt),list=Array.isArray(obj)?obj:Array.isArray(obj.scenarios)?obj.scenarios:[obj];return saveScenarios(list)}).catch(error)}
function editScenario(id){var sc=scenarios.find(function(s){return s.id===id}),obj=sc?sc.payload:{id:'custom-'+Date.now(),title:'New Leadership Scenario',subtitle:'',description:'',briefing:'',mission:'',characters:[],injects:[],moments:[{title:'First observation',trainee:'Team member',behavior:'Describe an observable behavior.',context:'Background context.',cues:'What should the leader notice?',question:'How should the leader respond?',verify:'How will the leader check improvement?',options:[{action:'Respond with supportive accountability.',reaction:'The team member listens.',outcome:'effective'}]}]};editingScenario=id||'';
app.innerHTML='<div class="panel"><div class="spread"><h2>Scenario Builder</h2><button class="btn" id="back-library">Back to Instructor Dashboard</button></div><p class="muted">Advanced authoring: edit the complete scenario JSON, including its observations, choices, characters, and injects. You can also author scenarios in the offline Studio and import them here.</p><label>Editable scenario JSON<textarea id="scenario-json" style="min-height:530px;font:12px/1.55 ui-monospace,SFMono-Regular,Consolas,monospace">'+h(JSON.stringify(obj,null,2))+'</textarea></label><div class="row" style="margin-top:13px"><button class="btn gold" id="save-scenario">Save Scenario</button><button class="btn ghost" id="export-scenario">Download JSON</button></div></div>';
document.getElementById('back-library').onclick=function(){instructorRefresh()};
document.getElementById('save-scenario').onclick=async function(){try{var current=normalizeScenario(JSON.parse(val('scenario-json')));if(editingScenario&&current.id!==editingScenario)throw Error('Do not change the ID of an existing scenario; duplicate it as a new scenario instead.');await saveScenarios([current])}catch(e){error(e)}};
document.getElementById('export-scenario').onclick=function(){try{download('Leadership101-Scenario.json',JSON.parse(val('scenario-json')))}catch(e){error(e)}};
}
init();
})();
