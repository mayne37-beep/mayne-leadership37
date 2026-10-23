import { createClient } from '@supabase/supabase-js';
import QRCode from 'qrcode';
window.lead101QR=QRCode;
window.supabase={createClient};

(function(){
'use strict';
var API_URL="https://vteamreihsunsllwcphw.supabase.co",PUB_KEY="sb_publishable_dFlcGsz0Fu1TifebqIu4fQ_6aLjG7ud",db=null;
var lastInstructorHash='';var page='student',studentToken=localStorage.getItem('l101_live_token')||'',studentData=null,scenarioIndex=0,instructorUser=null,classes=[],scenarios=[],participants=[],responses=[],injects=[],selectedClass='',timer=null,editingScenario='';
var notificationRows=[],notificationResponseRows={},notificationsReady=false,notificationsOpen=false,notificationsFilter='attention',notificationBusy=false,notificationPolling=false;
var notificationsChannel=null,notificationsChannelOwner='';
var notifiedIds=new Set(),soundEnabled=localStorage.getItem('l101_notify_sound')==='yes',desktopEnabled=localStorage.getItem('l101_notify_desktop')==='yes';
var app=document.getElementById('app');
function h(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function val(id){var x=document.getElementById(id);return x?x.value:''}
function flash(msg,err){var x=document.getElementById('feedback');x.textContent=msg;x.style.background=err?'#993346':'#123f69';x.style.display='block';clearTimeout(flash.t);flash.t=setTimeout(function(){x.style.display='none'},4500)}
function busy(msg){app.innerHTML='<div class="panel"><h2>'+h(msg||'Loading…')+'</h2></div>'}
function error(e){flash(e&&e.message?e.message:String(e),true)}
function qs(s){return new URLSearchParams(location.search).get(s)||''}
function progress(data){return (data.responses||[]).filter(function(x){return !!x.rating}).length}
function scenarioMoment(data,n){return data.scenario.moments[n]||null}
function sessionReport(data){var rows=(data.responses||[]).slice().sort(function(a,b){return a.observation_index-b.observation_index}).map(function(r){var m=data.scenario.moments[r.observation_index]||{};return '<section><h2>'+h((r.observation_index+1)+'. '+(m.title||'Leadership decision'))+'</h2><p>'+h(m.behavior||'')+'</p><p><b>Student response:</b> '+h(r.submitted_text)+'</p><p><b>Observer rating:</b> '+h(r.rating||'Awaiting review')+'</p><p><b>Observer feedback:</b> '+h(r.observer_comment||'—')+'</p></section>'}).join('');return '<div><h1>Leadership 101 — Student Leadership Report</h1><p><b>Participant:</b> '+h(data.participant.name)+'</p><p><b>Class:</b> '+h(data.class.title)+'</p><p><b>Scenario:</b> '+h(data.scenario.title)+'</p><p><b>Completed decisions:</b> '+progress(data)+' / '+data.scenario.moments.length+'</p><hr>'+rows+'<section><h2>Personal Reflection</h2><p>'+h(data.participant.reflection||'No reflection recorded')+'</p></section><p class="small">Mayne Leadership · Role-play practice record. Ratings represent instructional feedback.</p></div>'}
function setPrint(data){document.getElementById('print-report').innerHTML=sessionReport(data)}
function stat(n,label){return '<div class="stat"><b>'+h(n)+'</b><span class="small">'+h(label)+'</span></div>'}
function download(filename,data){var blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),a=document.createElement('a'),u=URL.createObjectURL(blob);a.href=u;a.download=filename;a.click();setTimeout(function(){URL.revokeObjectURL(u)},1500)}
function setMode(mode){page=mode;if(mode!=='instructor'){closeNotificationPanel();stopNotificationSubscription()}updateNotificationBell();document.getElementById('tab-student').classList.toggle('selected',mode==='student');document.getElementById('tab-instructor').classList.toggle('selected',mode==='instructor');document.getElementById('hero-title').textContent=mode==='student'?'Lead through the moment.':'Instructor Command Center';document.getElementById('hero-subtitle').textContent=mode==='student'?'Join a classroom, observe behavior, and practice leadership.':'Create sessions, evaluate student responses, and introduce live challenges.';if(mode==='student'){studentRender()}else{instructorLoad()}}
async function init(){if(!window.supabase||!window.supabase.createClient){app.innerHTML='<div class="error">The online connection library did not load. Please check internet access or try again.</div>';return}db=window.supabase.createClient(API_URL,PUB_KEY,{auth:{persistSession:true,autoRefreshToken:true}});setupNotificationUI();document.getElementById('tab-student').onclick=function(){setMode('student')};document.getElementById('tab-instructor').onclick=function(){setMode('instructor')};if(qs('code')){setMode('student');joinScreen()}else if(studentToken){await studentRefresh()}else joinScreen();setInterval(async function(){if(notificationPolling)return;notificationPolling=true;try{if(page==='student'&&studentToken){if(!isTyping())await studentRefresh(true)}if(page==='instructor'&&instructorUser){await loadInstructorNotifications(true);if(selectedClass)await instructorRefresh(true)}}finally{notificationPolling=false}},4500)}
function joinScreen(){app.innerHTML='<div class="grid"><div class="panel stack"><h2>Join your Leadership 101 role-play</h2><p class="muted">Enter the classroom code from your instructor and your name. No student account or password is required for this classroom pilot.</p><label>Class code<input id="join-code" placeholder="Example: 1A2B3C4" value="'+h(qs('code'))+'" autocomplete="off"></label><label>Your name<input id="join-name" placeholder="First and last name" autocomplete="name"></label><div class="row"><button class="btn gold" id="join-go">Enter Classroom →</button></div><p class="info">This browser saves your private session token so you can resume. Use “Leave this device” when finished on a shared computer.</p></div><div class="panel"><h3>What happens next?</h3><p>1. Read your assigned leadership case.</p><p>2. Observe the team member and respond.</p><p>3. Your instructor evaluates original written responses.</p><p>4. Download your reflection report.</p><p class="notice">Prepared choices receive built-in practice feedback. Original responses are not automatically scored; your instructor reviews them.</p></div></div>';document.getElementById('join-go').onclick=join}
async function join(){try{var code=val('join-code').trim(),name=val('join-name').trim();if(!code||name.length<2){flash('Enter your class code and name.',true);return}busy('Joining classroom…');var result=await db.rpc('l101_join',{p_code:code,p_name:name});if(result.error)throw result.error;studentToken=result.data.token;localStorage.setItem('l101_live_token',studentToken);scenarioIndex=0;await studentRefresh()}catch(e){error(e);joinScreen()}}
async function studentRefresh(quiet){try{if(!studentToken){joinScreen();return}var r=await db.rpc('l101_state',{p_token:studentToken});if(r.error)throw r.error;var before=JSON.stringify(studentData&&studentData.responses)+'|'+JSON.stringify(studentData&&studentData.injects);studentData=r.data;var after=JSON.stringify(studentData.responses)+'|'+JSON.stringify(studentData.injects);if(!quiet||before!==after)studentRender()}catch(e){if(!quiet)error(e);if(/Invalid participant/.test(String(e.message))){studentToken='';localStorage.removeItem('l101_live_token');joinScreen()}}}
function studentRender(){if(!studentToken){joinScreen();return}if(!studentData){busy('Loading class…');return}var d=studentData,observations=d.scenario.moments||[],graded=progress(d);if(scenarioIndex>=observations.length)scenarioIndex=observations.length;var m=scenarioMoment(d,scenarioIndex),r=(d.responses||[]).find(function(x){return x.observation_index===scenarioIndex});var injectList=(d.injects||[]).map(function(i){return '<div class="notice"><b>⚡ '+h(i.title)+'</b><p>'+h(i.description)+'</p></div>'}).join('');var main='<div class="spread"><h2 style="margin:0">'+h(d.scenario.title)+'</h2><button class="btn ghost" id="student-report">My Leadership Report</button></div><p class="muted">'+h(d.scenario.subtitle||d.scenario.description)+'</p><div class="track"><i style="width:'+Math.round(100*graded/Math.max(1,observations.length))+'%"></i></div>';
if(!m){main+='<div class="scene"><div class="speaker">Scenario complete</div><div class="quote">You have completed the leadership decisions in this scenario. Review what you learned and save your report.</div></div><div class="row" style="margin-top:15px"><button class="btn gold" id="student-report-finish">View my report →</button></div>'}
else{main+='<div class="scene"><div class="speaker">Observation '+(scenarioIndex+1)+' of '+observations.length+' · '+h(m.trainee||'Team member')+'</div><div class="quote">'+h(m.behavior)+'</div></div><div style="padding-top:17px"><span class="eyebrow">Leadership challenge</span><h3 style="font-size:21px;margin:5px 0 9px">'+h(m.question)+'</h3><p class="muted">'+h(m.context)+'</p></div>';
if(!r){main+='<div class="stack"><div>'+((m.options||[]).map(function(o,i){return '<button class="choice" data-choice="'+i+'"><span>'+String.fromCharCode(65+i)+'</span>'+h(o.action)+'</button>'}).join(''))+'</div><label>Or write your own leadership response<textarea id="student-written" placeholder="What would you actually say or do? Your observer will evaluate this response."></textarea></label><div class="row"><button class="btn gold" id="student-submit-written">Submit original response</button></div></div>'}
else if(!r.rating){main+='<div class="pending"><b>Awaiting observer feedback</b><p>You submitted your own response. Your instructor will rate it Positive, Neutral, or Negative. This screen updates automatically once reviewed.</p><p><b>Your response:</b> '+h(r.submitted_text)+'</p></div>'}
else{var follow=r.rating==='positive'?'The team member is becoming more receptive and willing to take responsibility.':r.rating==='neutral'?'The team member is still uncertain; clearer expectations and follow-through may help.':'The team member remains defensive or the immediate problem is unresolved; plan a corrective follow-up.';main+='<div class="response"><b>Your response</b><p>'+h(r.submitted_text)+'</p></div><div class="response"><b>Observer evaluation: '+h(r.rating.toUpperCase())+'</b><p>'+h(r.observer_comment||'Practice feedback from prepared choice')+'</p></div><div class="notice"><b>Illustrative team member reaction</b><p>'+h(follow)+'</p></div><div class="row" style="margin-top:14px"><button class="btn gold" id="student-next">'+(scenarioIndex===observations.length-1?'Finish Scenario':'Next Observation →')+'</button></div>'}
}
var side='<div class="panel"><h3>Participant</h3><strong>'+h(d.participant.name)+'</strong><p class="muted">Class: '+h(d.class.title)+'</p>'+stat(graded+' / '+observations.length,'Decisions evaluated')+'<p class="info">Your written responses go to your instructor, not other students.</p><button class="btn" id="student-leave">Leave this device</button></div><div class="panel"><h3>Characters</h3>'+(d.scenario.characters||[]).map(function(c){return '<div class="card" style="margin-bottom:8px"><b>'+h(c.name)+'</b><div class="small muted">'+h(c.role)+'</div><p class="small">'+h(c.publicInfo||'')+'</p></div>'}).join('')+'</div><div class="panel"><h3>Need help from your instructor?</h3><label>Optional short note<textarea id="student-help-note" rows="2" maxlength="700" placeholder="Tell your instructor what you need help with…"></textarea></label><button class="btn ghost" id="student-help-request" style="margin-top:10px">🔔 Request instructor assistance</button></div><div class="panel"><h3>Live scenario updates</h3>'+(injectList||'<p class="small muted">No new challenges have been released yet.</p>')+'</div>';
app.innerHTML='<div class="grid"><div class="panel">'+main+'</div><aside>'+side+'</aside></div>';
app.querySelectorAll('[data-choice]').forEach(function(b){b.onclick=function(){submit(scenarioIndex,null,Number(b.dataset.choice))}});
var submitBtn=document.getElementById('student-submit-written');if(submitBtn)submitBtn.onclick=function(){submit(scenarioIndex,val('student-written'),null)};
var next=document.getElementById('student-next');if(next)next.onclick=function(){scenarioIndex++;studentRender()};
var reportBtns=['student-report','student-report-finish'];reportBtns.forEach(function(id){var e=document.getElementById(id);if(e)e.onclick=studentReport});
var helpButton=document.getElementById('student-help-request');if(helpButton)helpButton.onclick=sendStudentHelpRequest;
document.getElementById('student-leave').onclick=function(){studentToken='';studentData=null;localStorage.removeItem('l101_live_token');joinScreen()};
}
async function submit(index,text,choice){try{var r=await db.rpc('l101_submit',{p_token:studentToken,p_index:index,p_text:text||'',p_option:choice});if(r.error)throw r.error;await studentRefresh()}catch(e){error(e)}}
async function sendStudentHelpRequest(){var btn=document.getElementById('student-help-request');try{if(btn)btn.disabled=true;var r=await db.rpc('l101_request_help',{p_token:studentToken,p_message:val('student-help-note')});if(r.error)throw r.error;flash('Your instructor has been notified.');var e=document.getElementById('student-help-note');if(e)e.value=''}catch(e){error(e)}finally{if(btn)btn.disabled=false}}
function studentReport(){var d=studentData;if(!d)return;app.innerHTML='<div class="panel no-print"><div class="spread"><h2>My Leadership Report</h2><div class="row"><button class="btn gold" id="print-student">Print / Save PDF</button><button class="btn" id="json-student">Export JSON</button><button class="btn ghost" id="back-student">Back to scenario</button></div></div><p>Participant: <b>'+h(d.participant.name)+'</b></p><label>Final reflection<textarea id="student-reflection" placeholder="What did you learn? What would you do differently next time?">'+h(d.participant.reflection||'')+'</textarea></label><div class="row" style="margin-top:12px"><button class="btn primary" id="save-reflection">Save Reflection</button></div></div><div class="panel">'+sessionReport(d)+'</div>';
document.getElementById('print-student').onclick=function(){setPrint(d);window.print()};
document.getElementById('json-student').onclick=function(){download('Leadership101-'+d.participant.name.trim().replace(/\W+/g,'-')+'.json',d)};
document.getElementById('back-student').onclick=studentRender;
document.getElementById('save-reflection').onclick=async function(){try{var t=val('student-reflection');var r=await db.rpc('l101_reflect',{p_token:studentToken,p_text:t});if(r.error)throw r.error;studentData.participant.reflection=t;flash('Reflection saved online');studentReport()}catch(e){error(e)}};
}
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
 document.addEventListener('keydown',function(event){if(event.key==='Escape'&&notificationsOpen)closeNotificationPanel()});
 updateNotificationBell();
}
function attentionCount(){return notificationRows.filter(function(n){return !n.resolved_at&&(n.kind==='needs_review'||n.kind==='help_request')}).length}
function unreadActivityCount(){return notificationRows.filter(function(n){return !n.read_at&&n.kind==='scenario_complete'}).length}
function updateNotificationBell(){
 var visible=page==='instructor'&&!!instructorUser,bar=document.getElementById('nc-toolbar'),bell=document.getElementById('nc-bell'),count=document.getElementById('nc-count');
 if(bar)bar.classList.toggle('hidden',!visible);
 var waiting=attentionCount(),unread=unreadActivityCount();
 if(count)count.textContent=waiting+unread?String(Math.min(99,waiting+unread))+(waiting+unread>99?'+':''):'';
 if(bell){bell.setAttribute('aria-label','Instructor alerts: '+waiting+' require attention, '+unread+' new completion updates');bell.setAttribute('aria-expanded',String(notificationsOpen))}
}
function notificationPeople(n){return {student:n.participant&&n.participant.display_name||'Student',className:n.class&&n.class.title||'Classroom',scenario:scenarioTitleById(n.class&&n.class.scenario_id)}}
function scenarioTitleById(id){var entry=scenarios.find(function(s){return s.id===id});return entry?entry.title:''}
function notificationSummary(n){var meta=notificationPeople(n);return meta.student+' · '+meta.className+(meta.scenario?' · '+meta.scenario:'')}
function notificationTime(value){return value?new Date(value).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):''}
async function loadInstructorNotifications(quiet){
 if(!db||!instructorUser||page!=='instructor'||notificationBusy)return;
 notificationBusy=true;
 try{
  var r=await db.from('l101_live_notifications').select('id,instructor_id,kind,title,detail,created_at,read_at,resolved_at,class_id,participant_id,response_id,class:l101_live_classes(title,code,scenario_id),participant:l101_live_participants(display_name)').eq('instructor_id',instructorUser.id).order('created_at',{ascending:false}).limit(200);
  if(r.error)throw r.error;
  var next=r.data||[],ids=next.filter(function(n){return n.kind==='needs_review'&&!n.resolved_at&&n.response_id}).map(function(n){return n.response_id}),lookup={};
  if(ids.length){
   var rr=await db.from('l101_live_responses').select('id,submitted_text,observation_index,rating,observer_comment').in('id',ids.slice(0,200));
   if(rr.error)throw rr.error;
   (rr.data||[]).forEach(function(x){lookup[x.id]=x});
  }
  var fresh=next.filter(function(n){return !n.read_at&&!n.resolved_at||n.kind==='scenario_complete'&&!n.read_at}).filter(function(n){return !notifiedIds.has(n.id)});
  if(notificationsReady&&fresh.length&&page==='instructor')fresh.slice().reverse().slice(-3).forEach(showIncomingNotification);
  next.forEach(function(n){notifiedIds.add(n.id)});
  var previous=JSON.stringify(notificationRows.map(function(n){return [n.id,n.read_at,n.resolved_at]})),now=JSON.stringify(next.map(function(n){return [n.id,n.read_at,n.resolved_at]}));
  notificationRows=next;notificationResponseRows=lookup;notificationsReady=true;
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
 var div=document.createElement('div');div.className='nc-toast';var title=document.createElement('strong');title.textContent=n.kind==='needs_review'?'Written response needs your rating':n.title;var detail=document.createElement('small');detail.textContent=meta.student+' · '+meta.className;var buttons=document.createElement('div');buttons.className='nc-actions';var review=document.createElement('button');review.textContent=n.kind==='needs_review'?'Review & rate':'Open alert';review.onclick=function(){div.remove();openNotificationPanel('attention',n.id)};var close=document.createElement('button');close.className='nc-dismiss';close.textContent='Dismiss pop-up';close.onclick=function(){div.remove()};buttons.append(review,close);div.append(title,detail,buttons);area.prepend(div);
 while(area.children.length>3)area.lastElementChild.remove();
 setTimeout(function(){if(div.isConnected)div.remove()},14000);
}
function openNotificationPanel(filter,id){
 if(typeof filter==='string')notificationsFilter=filter;
 notificationsOpen=true;
 document.getElementById('nc-shade').classList.add('open');
 document.getElementById('nc-drawer').classList.add('open');
 updateNotificationBell();renderNotificationPanel();
 if(id){var el=document.querySelector('[data-nc-entry="'+id+'"]');if(el)el.scrollIntoView({block:'center',behavior:'smooth'})}
}
function closeNotificationPanel(){
 notificationsOpen=false;
 var shade=document.getElementById('nc-shade'),drawer=document.getElementById('nc-drawer');
 if(shade)shade.classList.remove('open');if(drawer)drawer.classList.remove('open');
 updateNotificationBell();
}
function notificationVisible(n){
 if(notificationsFilter==='attention')return (n.kind==='needs_review'||n.kind==='help_request')&&!n.resolved_at;
 if(notificationsFilter==='activity')return n.kind==='scenario_complete'||!!n.resolved_at;
 return true;
}
function renderNotificationPanel(){
 if(!notificationsOpen)return;var el=document.getElementById('nc-body');if(!el)return;
 var total=notificationRows.length,waiting=attentionCount(),completed=notificationRows.filter(function(n){return n.kind==='scenario_complete'}).length;
 var html='<div class="nc-head"><div><div class="eyebrow">Across all classrooms</div><h2>Instructor Notification Center</h2><p>'+waiting+' need attention · '+completed+' completion updates · Live connection with automatic refresh</p></div><button id="nc-close" aria-label="Close notifications">✕ Close</button></div>';
 html+='<div class="nc-pref"><button id="nc-sound">🔊 Sound: '+(soundEnabled?'On':'Off')+'</button><button id="nc-desktop">▣ Desktop alerts: '+(desktopEnabled?'On':'Off')+'</button></div>';
 html+='<div class="nc-filters">'+[['attention','Needs attention ('+waiting+')'],['all','All activity ('+total+')'],['activity','Completed / resolved']].map(function(a){return '<button class="'+(notificationsFilter===a[0]?'sel':'')+'" data-nc-filter="'+a[0]+'">'+h(a[1])+'</button>'}).join('')+'</div>';
 var list=notificationRows.filter(notificationVisible);
 if(!list.length)html+='<div class="nc-empty">✓ Nothing needs your attention in this view.<br><small>Incoming student responses from all classes will appear here.</small></div>';
 else list.forEach(function(n){
   var meta=notificationPeople(n),response=notificationResponseRows[n.response_id],note=n.kind==='needs_review'?(response&&response.submitted_text||n.detail):n.detail,
   actionable=!n.resolved_at&&(n.kind==='needs_review'||n.kind==='help_request');
   html+='<section class="nc-item '+(actionable?'attention ':'done ')+(n.kind==='help_request'?'help ':'')+(!n.read_at?'unread':'')+'" data-nc-entry="'+h(n.id)+'">';
   html+='<div class="spread"><div class="nc-class">'+h(meta.className)+(meta.scenario?' · '+h(meta.scenario):'')+'</div><span class="small muted">'+h(notificationTime(n.created_at))+'</span></div>';
   html+='<h3>'+h(meta.student)+' — '+h(n.title)+'</h3><div class="nc-meta"><span>Scenario: '+h(meta.scenario||'Leadership 101')+'</span>'+(response?'<span>· Observation '+(response.observation_index+1)+'</span>':'')+'<span class="nc-priority">'+(actionable?'ACTION NEEDED':'Recorded')+'</span></div>';
   html+='<div class="nc-text">'+h(note)+'</div>';
   if(n.kind==='needs_review'&&!n.resolved_at){
     html+='<div class="nc-rating" data-nc-rating="'+h(n.id)+'"><button type="button" data-nc-grade="positive">Positive</button><button type="button" data-nc-grade="neutral">Neutral</button><button type="button" data-nc-grade="negative">Negative</button></div>';
     html+='<label>Observer comments (optional)<textarea id="nc-comment-'+h(n.id)+'" placeholder="What did the student demonstrate?"></textarea></label>';
     html+='<div class="nc-footer"><button class="btn ghost" data-nc-openclass="'+h(n.class_id)+'">Open classroom</button><button class="btn primary" data-nc-submit="'+h(n.id)+'">Save evaluation</button></div>';
   }else if(n.kind==='help_request'&&!n.resolved_at){
     html+='<div class="nc-footer"><button class="btn ghost" data-nc-openclass="'+h(n.class_id)+'">View classroom</button><button class="btn primary" data-nc-resolve="'+h(n.id)+'">Mark as handled</button></div>';
   }else if(!n.read_at){
     html+='<div class="nc-footer"><button class="btn ghost" data-nc-markread="'+h(n.id)+'">Mark as read</button></div>';
   }
   html+='</section>';
 });
 el.innerHTML=html;
 document.getElementById('nc-close').onclick=closeNotificationPanel;
 document.getElementById('nc-sound').onclick=function(){soundEnabled=!soundEnabled;localStorage.setItem('l101_notify_sound',soundEnabled?'yes':'no');if(soundEnabled)notificationChime();renderNotificationPanel()};
 document.getElementById('nc-desktop').onclick=async function(){if(!('Notification' in window)){flash('Desktop notifications are not supported in this browser.',true);return}if(!desktopEnabled){var perm=await Notification.requestPermission();if(perm!=='granted'){flash('Desktop notification permission was not granted.',true);return}}desktopEnabled=!desktopEnabled;localStorage.setItem('l101_notify_desktop',desktopEnabled?'yes':'no');renderNotificationPanel()};
 el.querySelectorAll('[data-nc-filter]').forEach(function(b){b.onclick=function(){notificationsFilter=b.dataset.ncFilter;renderNotificationPanel()}});
 el.querySelectorAll('[data-nc-rating]').forEach(function(box){box.querySelectorAll('[data-nc-grade]').forEach(function(b){b.onclick=function(){box.querySelectorAll('button').forEach(function(x){x.classList.remove('chosen')});b.classList.add('chosen');box.dataset.grade=b.dataset.ncGrade}})});
 el.querySelectorAll('[data-nc-submit]').forEach(function(b){b.onclick=function(){gradeNotification(b.dataset.ncSubmit)}});
 el.querySelectorAll('[data-nc-resolve]').forEach(function(b){b.onclick=function(){resolveNotification(b.dataset.ncResolve)}});
 el.querySelectorAll('[data-nc-markread]').forEach(function(b){b.onclick=function(){markNotificationRead(b.dataset.ncMarkread)}});
 el.querySelectorAll('[data-nc-openclass]').forEach(function(b){b.onclick=async function(){selectedClass=b.dataset.ncOpenclass;closeNotificationPanel();await instructorRefresh()}});
}
async function gradeNotification(id){
 var n=notificationRows.find(function(x){return x.id===id});if(!n||n.resolved_at||!n.response_id)return;
 var box=document.querySelector('[data-nc-rating="'+id+'"]'),grade=box&&box.dataset.grade;
 if(!grade){flash('Choose Positive, Neutral or Negative.',true);return}
 var note=val('nc-comment-'+id);
 try{var rr=await db.from('l101_live_responses').update({rating:grade,observer_comment:note,updated_at:new Date().toISOString()}).eq('id',n.response_id).is('rating',null).select('id');
 if(rr.error)throw rr.error;if(!(rr.data||[]).length){flash('This response was already reviewed by another instructor or tab.',true);await loadInstructorNotifications(false);return}
 flash('Rating sent to '+notificationPeople(n).student);
 await loadInstructorNotifications(false);
 await instructorRefresh(true);
 }catch(e){error(e)}
}
async function markNotificationRead(id){try{var r=await db.from('l101_live_notifications').update({read_at:new Date().toISOString()}).eq('id',id);if(r.error)throw r.error;await loadInstructorNotifications(false)}catch(e){error(e)}}
async function resolveNotification(id){try{var at=new Date().toISOString(),r=await db.from('l101_live_notifications').update({resolved_at:at,read_at:at}).eq('id',id);if(r.error)throw r.error;flash('Help request marked as handled');await loadInstructorNotifications(false)}catch(e){error(e)}}

async function instructorRefresh(quiet){try{var s=await db.from('l101_live_scenarios').select('id,title,payload').order('id');if(s.error)throw s.error;scenarios=s.data||[];var c=await db.from('l101_live_classes').select('id,title,code,scenario_id,is_open,created_at').order('created_at',{ascending:false});if(c.error)throw c.error;classes=c.data||[];if(!selectedClass&&classes.length)selectedClass=classes[0].id;
participants=[];responses=[];injects=[];if(selectedClass){var p=await db.from('l101_live_participants').select('id,class_id,display_name,reflection,joined_at').eq('class_id',selectedClass);if(p.error)throw p.error;participants=p.data||[];if(participants.length){var rr=await db.from('l101_live_responses').select('id,participant_id,observation_index,submitted_text,option_index,rating,observer_comment').in('participant_id',participants.map(function(x){return x.id})).order('observation_index');if(rr.error)throw rr.error;responses=rr.data||[]}var ir=await db.from('l101_live_injects').select('id,title,description,created_at').eq('class_id',selectedClass);if(ir.error)throw ir.error;injects=ir.data||[]}var digest=JSON.stringify({classes:classes,participants:participants,responses:responses,injects:injects});if(!quiet||digest!==lastInstructorHash){if(!quiet||!document.activeElement||!/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)){instructorRender();lastInstructorHash=digest}}}catch(e){error(e)}}
function currentClass(){return classes.find(function(x){return x.id===selectedClass})}
function currentScenario(){var c=currentClass();return c&&scenarios.find(function(s){return s.id===c.scenario_id})}
function instructorRender(){var c=currentClass(),sc=currentScenario();var pending=responses.filter(function(x){return !x.rating});var rated=responses.filter(function(x){return !!x.rating});var cards=classes.map(function(x){return '<button class="choice" style="margin:0 0 8px" data-class="'+h(x.id)+'"><span>◈</span><span><b>'+h(x.title)+'</b><br><small>'+h(x.code)+(x.is_open?' · Open':' · Closed')+'</small></span></button>'}).join('');
var ui='<div class="grid"><div><div class="panel"><div class="spread"><h2>Live Classrooms</h2><button class="btn" id="instructor-logout">Sign out</button></div><div class="grid3">'+stat(classes.length,'Classes')+stat(participants.length,'Participants in current class')+stat(notificationRows.filter(function(n){return n.kind==='needs_review'&&!n.resolved_at}).length,'Written responses across all classes')+'</div><div class="notice" style="margin-top:15px"><div class="spread"><div><b>🔔 Instructor Notification Center</b><p class="small muted">Monitor all active scenarios without switching classrooms.</p></div><button class="btn gold" id="open-inbox-dashboard">Open all alerts ('+attentionCount()+')</button></div></div><div class="stack" style="margin-top:18px"><label>New class title<input id="new-class-title" placeholder="Leadership 101 — Cohort A"></label><label>Choose scenario<select id="new-class-scenario">'+scenarios.map(function(s){return '<option value="'+h(s.id)+'">'+h(s.title)+'</option>'}).join('')+'</select></label><button class="btn gold" id="create-class">Create Classroom</button></div></div>';
if(c){ui+='<div class="panel"><div class="spread"><div><span class="eyebrow">Active classroom</span><h2>'+h(c.title)+'</h2></div><button class="btn" id="toggle-class">'+(c.is_open?'Close joining':'Reopen class')+'</button></div><p>Join code: <strong style="font-size:24px">'+h(c.code)+'</strong></p><p><a id="share-class" target="_blank" rel="noopener" href="/leadership101-live.html?code='+encodeURIComponent(c.code)+'">Student joining link</a></p><button class="btn ghost" id="copy-class">Copy student link</button><div style="display:flex;gap:14px;align-items:center;margin:14px 0"><canvas id="join-qrcode" width="160" height="160" aria-label="QR code for the student joining link"></canvas><p class="small muted">Students can scan this QR code to join the current class. The link includes only the classroom code.</p></div><div class="notice"><b>Assigned:</b> '+h(sc?sc.title:'Unknown scenario')+'<br>Students can join using the code or link. Instructor ratings appear on their screens automatically.</div></div>';
ui+='<div class="panel"><h2>Review student responses</h2>'+ (pending.length?pending.map(function(r){var p=participants.find(function(x){return x.id===r.participant_id}),moment=sc&&sc.payload&&sc.payload.moments[r.observation_index];return '<div class="card" style="margin-bottom:13px"><div class="spread"><b>'+h(p&&p.display_name)+' · Observation '+(r.observation_index+1)+'</b><span class="tag">Awaiting review</span></div><p class="small muted">'+h(moment&&moment.title)+'</p><div class="response">'+h(r.submitted_text)+'</div><div class="rating" data-rating="'+h(r.id)+'"><button data-grade="positive">Positive</button><button data-grade="neutral">Neutral</button><button data-grade="negative">Negative</button></div><label style="margin-top:9px">Observer comments<textarea id="comment-'+h(r.id)+'" placeholder="What did the leader demonstrate? What should improve?"></textarea></label><div class="row" style="margin-top:10px"><button class="btn primary" data-save-rating="'+h(r.id)+'">Save Rating</button></div></div>'}).join(''):'<p class="muted">No responses currently awaiting observer review.</p>')+'</div>';
ui+='<div class="panel"><div class="spread"><h2>Class Roster & Reports</h2><button class="btn" id="export-class">Export reports (JSON)</button></div><div class="list">'+(participants.length?participants.map(function(p){var mine=responses.filter(function(r){return r.participant_id===p.id});return '<div class="scitem"><div><strong>'+h(p.display_name)+'</strong><p>'+mine.filter(function(r){return !!r.rating}).length+' evaluated decisions · '+mine.filter(function(r){return !r.rating}).length+' awaiting review</p></div><button class="btn ghost" data-print-participant="'+h(p.id)+'">Print report</button></div>'}).join(''):'<p class="muted">No participants have joined yet.</p>')+'</div></div>';
ui+='<div class="panel"><h2>Release change injects</h2><p class="muted">Injects appear on all students’ screens in this classroom within a few seconds.</p><label>Available scenario challenges<select id="inject-selector">'+((sc&&sc.payload&&sc.payload.injects)||[]).map(function(i,n){return '<option value="'+n+'">'+h(i.title)+'</option>'}).join('')+'</select></label><div class="row" style="margin-top:12px"><button class="btn gold" id="release-inject">Release selected inject</button></div><div class="list" style="margin-top:13px">'+injects.map(function(i){return '<div class="notice"><b>'+h(i.title)+'</b><p>'+h(i.description)+'</p></div>'}).join('')+'</div></div>'}
ui+='</div><aside><div class="panel"><h3>Your classes</h3>'+ (cards||'<p class="muted">Create your first classroom.</p>')+'</div><div class="panel"><h3>Scenario library</h3><p class="small muted">The original nine Leadership 101 scenarios are loaded. Import, create, or edit a scenario as needed.</p><div class="scenarios">'+scenarios.map(function(s){return '<div class="scitem"><div><strong>'+h(s.title)+'</strong></div><button class="btn ghost" data-edit-scenario="'+h(s.id)+'">Edit</button></div>'}).join('')+'</div><hr style="border:0;border-top:1px solid #e4edf3;margin:16px 0"><label>Import your standalone Studio JSON<input type="file" id="import-scenarios" accept=".json,application/json"></label><button class="btn ghost" style="margin-top:10px" id="new-scenario">Create new scenario</button></div></aside></div>';
app.innerHTML=ui;
var inboxButton=document.getElementById('open-inbox-dashboard');if(inboxButton)inboxButton.onclick=openNotificationPanel;
if(c&&window.lead101QR){window.lead101QR.toCanvas(document.getElementById('join-qrcode'),new URL('/leadership101-live.html?code='+c.code,location.origin).href,{width:160,margin:1,errorCorrectionLevel:'M'}).catch(function(){})}
app.querySelectorAll('[data-class]').forEach(function(x){x.onclick=function(){selectedClass=x.dataset.class;instructorRefresh()}});
app.querySelectorAll('[data-rating]').forEach(function(div){div.querySelectorAll('[data-grade]').forEach(function(b){b.onclick=function(){div.querySelectorAll('button').forEach(function(z){z.classList.remove('selected')});b.classList.add('selected');div.dataset.grade=b.dataset.grade}})});
app.querySelectorAll('[data-save-rating]').forEach(function(b){b.onclick=function(){saveRating(b.dataset.saveRating)}});
app.querySelectorAll('[data-print-participant]').forEach(function(b){b.onclick=function(){printParticipant(b.dataset.printParticipant)}});
app.querySelectorAll('[data-edit-scenario]').forEach(function(b){b.onclick=function(){editScenario(b.dataset.editScenario)}});
document.getElementById('instructor-logout').onclick=async function(){stopNotificationSubscription();await db.auth.signOut();instructorUser=null;notificationRows=[];notificationResponseRows={};notificationsReady=false;notifiedIds.clear();closeNotificationPanel();updateNotificationBell();instructorLogin()};
document.getElementById('create-class').onclick=createClass;
document.getElementById('import-scenarios').onchange=importScenarios;
document.getElementById('new-scenario').onclick=function(){editScenario(null)};
if(c){document.getElementById('toggle-class').onclick=toggleClass;document.getElementById('release-inject').onclick=releaseInject;document.getElementById('copy-class').onclick=async function(){try{await navigator.clipboard.writeText(new URL('/leadership101-live.html?code='+c.code,location.origin).href);flash('Student link copied')}catch(e){error(e)}};document.getElementById('export-class').onclick=function(){download('Leadership101-Class-'+c.code+'.json',{classroom:c,participants:participants,responses:responses,injects:injects})}}
}
async function createClass(){try{var title=val('new-class-title').trim(),scenario=val('new-class-scenario');if(title.length<3||!scenario){flash('Enter a class title and select a scenario.',true);return}var r=await db.from('l101_live_classes').insert({title:title,scenario_id:scenario,instructor_id:instructorUser.id}).select('id').single();if(r.error)throw r.error;selectedClass=r.data.id;await instructorRefresh();flash('Classroom created')}catch(e){error(e)}}
async function toggleClass(){try{var c=currentClass(),r=await db.from('l101_live_classes').update({is_open:!c.is_open}).eq('id',c.id);if(r.error)throw r.error;await instructorRefresh()}catch(e){error(e)}}
async function saveRating(id){try{var div=app.querySelector('[data-rating="'+id+'"]'),grade=div&&div.dataset.grade;if(!grade){flash('Choose Positive, Neutral, or Negative.',true);return}var r=await db.from('l101_live_responses').update({rating:grade,observer_comment:val('comment-'+id),updated_at:new Date().toISOString()}).eq('id',id);if(r.error)throw r.error;flash('Observer evaluation saved');await instructorRefresh()}catch(e){error(e)}}
async function releaseInject(){try{var sc=currentScenario(),c=currentClass(),idx=Number(val('inject-selector')),inj=sc&&sc.payload&&sc.payload.injects[idx];if(!inj){flash('No inject selected.',true);return}var r=await db.from('l101_live_injects').insert({class_id:c.id,title:inj.title,description:inj.text});if(r.error)throw r.error;flash('Live inject released');await instructorRefresh()}catch(e){error(e)}}
function printParticipant(id){var p=participants.find(function(x){return x.id===id}),sc=currentScenario(),c=currentClass();if(!p||!sc)return;var rs=responses.filter(function(r){return r.participant_id===p.id}),d={participant:{name:p.display_name,reflection:p.reflection},class:{title:c.title},scenario:{title:sc.title,moments:sc.payload.moments},responses:rs};setPrint(d);window.print()}
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
