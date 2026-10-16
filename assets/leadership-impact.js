const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const api=async(action,payload)=>{const r=await fetch('/api/leadership-impact',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,payload})});const body=await r.json().catch(()=>({}));if(!r.ok)throw new Error(body.error||'Unable to reach the classroom.');return body;};
const toast=(message,error=false)=>{const t=$('toast');if(!t)return;t.textContent=message||'';t.classList.toggle('error',error);};
const cases=window.LEADERSHIP_IMPACT_CASES||[];
const teamName=n=>'Team '+String.fromCharCode(64+n);
function evidenceCards(items){return (items||[]).map((item,i)=>'<article class="reveal-card"><h4>Evidence '+(i+1)+' · '+esc(item.title||'New information')+'</h4><p>'+esc(item.text||'')+'</p></article>').join('');}
function csv(rows,name){const text=rows.map(row=>row.map(x=>'"'+String(x??'').replace(/"/g,'""')+'"').join(',')).join('\r\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type:'text/csv;charset=utf-8'}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),3000);}
function host(){
 let session=null,latest=null,lastRosterTeams=0,busy=false,period;
 const stored=localStorage.getItem('ml_impact_host_id');
 if(stored){$('resume').hidden=false;$('resume-button').onclick=()=>load(stored);}
 $('create').onclick=async()=>{try{toast('Creating session…');const d=await api('create',{title:$('session-title').value.trim(),teams:Number($('teams-count').value)});session=d.session;localStorage.setItem('ml_impact_host_id',session.id);showHost();toast('Session ready. Share the QR code with students.');}catch(e){toast(e.message,true);}};
 async function load(id){try{const d=await api('host-view',{id});session=d.session;localStorage.setItem('ml_impact_host_id',session.id);showHost();render(d);toast('Session restored.');}catch(e){toast(e.message,true);}}
 function showHost(){$('setup').hidden=true;$('dashboard').hidden=false;renderJoin();fillTeamChoices();fillCases();refresh();clearInterval(period);period=setInterval(refresh,3500);}
 function renderJoin(){const u=new URL('/leadership-impact-join.html',location.origin);u.searchParams.set('room',session.room);u.searchParams.set('teams',session.teams);$('join-link').href=u.toString();$('join-link').textContent=u.toString();$('student-preview-link').href=u.toString();$('copy-link').onclick=()=>navigator.clipboard.writeText(u.toString()).then(()=>toast('Invitation link copied.')).catch(()=>toast('Copy the displayed link instead.',true));const qr=$('qr');qr.textContent='';if(window.QRCode)new window.QRCode(qr,{text:u.toString(),width:130,height:130,colorDark:'#173958',colorLight:'#ffffff'});else qr.textContent='QR unavailable. Use the link.';}
 function fillTeamChoices(){const select=$('active-team');select.textContent='';for(let t=1;t<=session.teams;t++){const option=document.createElement('option');option.value=t;option.textContent=teamName(t);select.append(option);}select.value=String(session.active_team);lastRosterTeams=session.teams;}
 function fillCases(){const sel=$('selection');for(const sc of cases){const opt=document.createElement('option');opt.value=sc.id;opt.textContent=sc.title;sel.append(opt);}}
 async function refresh(){if(busy||!session||document.hidden)return;busy=true;try{const data=await api('host-view',{id:session.id});session=data.session;latest=data;render(data);}catch(e){toast('Connection: '+e.message,true);}finally{busy=false;}}
 function render(data){const s=data.session;$('phase-label').textContent={lobby:'Lobby',discuss:'Discussion',vote:'Collecting feedback',reveal:'Feedback revealed',closed:'Session closed'}[s.phase]||s.phase;$('round-label').textContent=String(s.round);$('count-label').textContent=String((data.roster||[]).reduce((a,x)=>a+Number(x.members),0));const eligibility=(data.roster||[]).filter(x=>x.team!==s.active_team).reduce((a,x)=>a+Number(x.members),0);$('response-label').textContent=data.votes.length+' / '+eligibility;
 $('roster').innerHTML=Array.from({length:s.teams},(_,i)=>{const num=i+1;const n=(data.roster||[]).find(r=>r.team===num)?.members||0;return '<span class="team-chip '+(s.round>0&&s.active_team===num?'active':'')+'">'+esc(teamName(num))+' · '+n+'</span>';}).join('');
 if(document.activeElement!==$('active-team'))$('active-team').value=String(s.active_team);
 $('scenario-name').textContent=s.scenario.title||'No scenario launched yet';
 $('scenario-text').textContent=s.scenario.brief||'Select an active team and launch a scenario.';
 $('scenario-prompt').hidden=!s.scenario.prompt;$('scenario-prompt').textContent=s.scenario.prompt||'';
 $('scenario-text').classList.add('case-brief');
 const evidence=Array.isArray(s.scenario?.reveals)?s.scenario.reveals:[];
 const shown=Math.max(0,Math.min(Number(s.scenario?.revealed)||0,evidence.length));
 $('host-evidence').hidden=!evidence.length;
 $('reveal-progress').textContent=shown+' of '+evidence.length+' shared';
 $('host-revealed').innerHTML=evidenceCards(evidence.slice(0,shown));
 $('reveal-next').disabled=!['discuss','vote'].includes(s.phase)||shown>=evidence.length;
 $('reveal-next').textContent=shown>=evidence.length?'All evidence shared':'Release evidence '+(shown+1)+' → '+(evidence[shown]?.title||'');
 $('facilitator-notes').textContent=s.scenario?.facilitator||'Invite competing explanations and ask what facts are missing. No answer key is supplied.';
 $('open-voting').disabled=s.phase!=='discuss';$('reveal').disabled=s.phase!=='vote';$('discussion').disabled=!['vote','reveal'].includes(s.phase);$('new-round').disabled=s.phase==='closed';$('close').disabled=s.phase==='closed';$('export').disabled=s.round===0;
 const showing=s.phase==='reveal'&&data.votes.length>0;
 $('results-cover').hidden=showing;$('results-data').hidden=!showing;
 if(!showing){$('results-cover').querySelector('strong').textContent=s.phase==='reveal'&&data.votes.length===0?'No feedback submitted yet':'Feedback is waiting';$('results-cover').querySelector('p').textContent=s.phase==='reveal'&&data.votes.length===0?'No one has submitted a rating for this round. Return to discussion and reopen ratings to collect responses.':s.phase==='vote'?'Observers are rating now. Reveal when responses are in.':'Results appear after the facilitator reveals the ratings.';}
 if(showing){$('sample').textContent=data.votes.length+' anonymous observer responses · descriptive feedback, not an objective effectiveness score';const metrics=[['Trust','trust'],['Willingness to support','support'],['Perceived effectiveness','effective']];$('metrics').innerHTML=metrics.map(([label,key])=>{const vals=data.votes.map(x=>Number(x[key]));const avg=Math.round(vals.reduce((a,b)=>a+b,0)/vals.length);const sorted=[...vals].sort((a,b)=>a-b);const spread=sorted[sorted.length-1]-sorted[0];return '<div class="metric"><div class="metric-head"><span>'+esc(label)+'</span><strong>'+avg+'<small style="font-size:13px;color:#73899d">/100</small></strong></div><div class="bar"><span style="width:'+avg+'%"></span></div><div class="metric-foot">Range '+sorted[0]+'–'+sorted.at(-1)+' · spread '+spread+' points'+(spread>=50?' · mixed reactions':'')+'</div></div>';}).join('');}
 $('question-count').textContent=(data.questions||[]).length+(data.comments||[]).filter(x=>x.kind==='question').length;
 $('comment-count').textContent=(data.comments||[]).filter(x=>x.kind!=='question').length;
 const questions=[...(data.questions||[]),...(data.comments||[]).filter(x=>x.kind==='question')];const comments=(data.comments||[]).filter(x=>x.kind!=='question');
 $('questions').innerHTML=questions.length?questions.map(x=>'<div class="entry"><span class="tag">Anonymous question</span><div>'+esc(x.text)+'</div></div>').join(''):'<p class="fine">No questions yet.</p>';
 $('comments').innerHTML=comments.length?comments.map(x=>'<div class="entry">'+esc(x.text)+'</div>').join(''):'<p class="fine">No written reflections yet.</p>';
 }
 async function update(payload){try{await api('host-update',{id:session.id,...payload});await refresh();toast('Round updated.');}catch(e){toast(e.message,true);}}
 $('reveal-next').onclick=async()=>{if(!session)return;try{await api('host-reveal-info',{id:session.id});await refresh();toast('New evidence released to participants.');}catch(e){toast(e.message,true);}};
 $('new-round').onclick=async()=>{if(!session)return;const selected=$('selection').value;let chosen=cases.find(c=>c.id===selected);const used=Array.isArray(session.used_ids)?session.used_ids:[];let remaining=cases.filter(c=>!used.includes(c.id));if(!remaining.length)remaining=[...cases];if(!chosen){const a=new Uint32Array(1);crypto.getRandomValues(a);chosen=remaining[a[0]%remaining.length];}const ids=[...new Set([...used,chosen.id])];if(session.round>0&&!confirm('Start a new round? The current team\'s ratings and comments will remain stored but will no longer be shown in the live dashboard.'))return;await update({new_round:true,active_team:Number($('active-team').value),scenario:{...chosen,revealed:0},used_ids:ids});};
 $('open-voting').onclick=()=>update({phase:'vote'});$('reveal').onclick=()=>update({phase:'reveal'});$('discussion').onclick=()=>update({phase:'discuss'});$('close').onclick=()=>{if(confirm('Close this session? Students will no longer be able to join or respond.'))update({phase:'closed'});};
 $('export').onclick=async()=>{if(!session||session.round<1)return;try{const d=await api('host-export',{id:session.id});const rows=[['Session','Round','Team','Scenario','Responses','Avg trust','Avg support','Avg perceived effectiveness','Comment type','Anonymous feedback or question']];for(const round of d.rounds||[]){const votes=round.ratings||[];const avg=key=>votes.length?(votes.reduce((total,v)=>total+Number(v[key]),0)/votes.length).toFixed(1):'';const base=[session.title,round.round,teamName(round.team),round.scenario,votes.length,avg('trust'),avg('support'),avg('effective')];const entries=[...(round.feedback||[]),...(round.questions||[]).map(text=>({kind:'question',text}))];if(!entries.length)rows.push([...base,'','']);else for(const item of entries)rows.push([...base,item.kind,item.text]);}csv(rows,'leadership-impact-'+session.id.slice(0,8)+'.csv');toast('Complete anonymous session report downloaded.');}catch(e){toast(e.message,true);}};
}
function student(){
 let member=null,lastRound=-1,working=false,interval=null;
 const query=new URLSearchParams(location.search);const urlRoom=query.get('room')||'';$('room-code').value=urlRoom;let maxTeams=Number(query.get('teams'))||6;
 function populate(max){$('my-team').textContent='';for(let n=1;n<=Math.min(Math.max(max,2),6);n++){let opt=document.createElement('option');opt.value=n;opt.textContent=teamName(n);$('my-team').append(opt);}}
 populate(maxTeams);
 const saved=()=>{try{return JSON.parse(localStorage.getItem('ml_impact_member:'+($('room-code').value.trim().toLowerCase()))||'null');}catch{return null;}};
 async function enter(info){member=info;$('join-box').hidden=true;$('student-dashboard').hidden=false;$('student-team').textContent=teamName(member.team);clearInterval(interval);await refresh();interval=setInterval(refresh,4000);}
 if(urlRoom&&saved())enter(saved()).catch(()=>{$('join-box').hidden=false;$('student-dashboard').hidden=true;});
 $('join').onclick=async()=>{try{toast('Joining assessment…');const room=$('room-code').value.trim().toLowerCase();const info=await api('join',{room,team:Number($('my-team').value)});info.room=room;localStorage.setItem('ml_impact_member:'+room,JSON.stringify(info));await enter(info);toast('Joined anonymously. Wait for your facilitator.');}catch(e){toast(e.message,true);}};
 async function refresh(){if(!member||working||document.hidden)return;working=true;try{const d=await api('state',{room:member.room,member:member.member,proof:member.proof});render(d);}catch(e){toast(e.message,true);if(/rejoin|access denied|not found/i.test(e.message)){member=null;clearInterval(interval);$('join-box').hidden=false;$('student-dashboard').hidden=true;}}finally{working=false;}}
 function render(d){$('student-phase').textContent={lobby:'Lobby · Waiting for the facilitator',discuss:'Live team discussion',vote:'Observer feedback is open',reveal:'Peer feedback revealed',closed:'Session closed'}[d.phase]||d.phase;
 $('student-scenario').textContent=d.scenario?.title||'Waiting for the first scenario';$('student-brief').textContent=d.scenario?.brief||'Your instructor will begin the next round shortly.';$('student-brief').classList.add('case-brief');$('student-prompt').textContent=d.scenario?.prompt||'';$('student-prompt').hidden=!d.scenario?.prompt;
 const newInfo=Array.isArray(d.scenario?.revealed_info)?d.scenario.revealed_info:[];
 $('student-reveals').hidden=!newInfo.length;$('student-reveals-list').innerHTML=evidenceCards(newInfo);
 if(d.round!==lastRound){lastRound=d.round;for(const key of ['trust','support','effective']){$(key).value='50';$(key+'-output').textContent='50';}$('comment').value='';$('question').value='';$('vote-confirm').textContent='';}
 const active=d.round>0&&d.active_team===member.team;
 const canDraft=d.round>0&&!active&&['discuss','vote'].includes(d.phase);
 const canVote=canDraft&&d.phase==='vote';
 const canAsk=canDraft;
 $('presenter-message').hidden=!active;
 $('rating-panel').hidden=!canDraft;
 $('question-panel').hidden=!canAsk;
 $('waiting').hidden=active||canDraft;
 $('send-vote').disabled=!canVote;
 $('send-vote').textContent=canVote?'Submit or update anonymous feedback →':'Waiting for instructor to open feedback';
 $('observer-target').textContent=d.round>0?'You are observing '+teamName(d.active_team)+' · Round '+d.round:'Waiting for a presenting team';
 $('observer-status').classList.toggle('ready',canVote);
 $('observer-status').classList.toggle('drafting',canDraft&&!canVote);
 $('observer-status-title').textContent=canVote?'Feedback submissions are OPEN':canDraft?'Observer feedback — prepare your response':active?'Your team is presenting':'Observer feedback';
 $('observer-status-description').textContent=canVote?'Use the three sliders and optional personal reflection below, then select Submit anonymous feedback.':canDraft?'Your sliders and comment box are ready below. Draft your response as the team presents; submission will unlock when your instructor opens ratings.':active?'You will give anonymous feedback when a different team presents. Your team cannot rate itself.':d.phase==='closed'?'This session has ended.':'When a different team presents, the sliders and anonymous reflection area will appear here.';
 $('draft-instructions').textContent=canVote?'Ratings are open. Submit your personal reaction to the leadership approach.': 'Your response is a private draft on this device until your instructor opens observer ratings.';
 $('waiting-text').textContent=d.phase==='reveal'?'Your class will discuss the results. Prepare for the next round.':d.phase==='closed'?'This assessment has ended. Thank you for your contributions.':d.phase==='vote'&&active?'Your team is currently presenting.':'The facilitator controls when each round begins and when observer ratings open.';
 $('vote-confirm').textContent=d.has_voted?'Your feedback was received for this round. You may update it while ratings are open.':'';
 }
 for(const key of ['trust','support','effective'])$(key).addEventListener('input',()=>$(key+'-output').textContent=$(key).value);
 $('send-vote').onclick=async()=>{if(!member)return;$('send-vote').disabled=true;try{await api('vote',{id:member.id,member:member.member,proof:member.proof,trust:Number($('trust').value),support:Number($('support').value),effective:Number($('effective').value),comment:$('comment').value.trim(),kind:$('comment-kind').value});$('vote-confirm').textContent='Thank you. Your anonymous feedback was saved.';toast('Anonymous feedback received.');}catch(e){toast(e.message,true);}finally{$('send-vote').disabled=false;}};
 $('send-question').onclick=async()=>{if(!member)return;try{await api('ask',{id:member.id,member:member.member,proof:member.proof,body:$('question').value.trim()});$('question').value='';toast('Question sent privately to the instructor.');}catch(e){toast(e.message,true);}};
}
function present(){
 const id=localStorage.getItem('ml_impact_host_id');
 if(!id){$('present-status').textContent='Open the instructor console first';$('present-brief').textContent='Create or resume a session in the instructor dashboard, then reopen this view.';return;}
 const refresh=async()=>{
 try{const d=await api('host-view',{id});const s=d.session;
 $('present-status').textContent={lobby:'LOBBY',discuss:'TEAM DISCUSSION',vote:'RATINGS OPEN',reveal:'PEER FEEDBACK',closed:'SESSION ENDED'}[s.phase]||s.phase.toUpperCase();
 $('present-title').textContent=s.title;
 $('present-meta').textContent=(s.round?'Round '+s.round+' · '+teamName(s.active_team):'Classroom joining')+' · '+s.teams+' teams';
 $('present-case-title').textContent=s.scenario?.title||'Waiting for a leadership situation';
 $('present-brief').textContent=s.scenario?.brief||'The facilitator will launch the first scenario.';$('present-brief').classList.add('case-brief');
 const revealed=Array.isArray(s.scenario?.reveals)?s.scenario.reveals.slice(0,Number(s.scenario?.revealed)||0):[];
 $('present-reveals').hidden=!revealed.length;$('present-reveals-list').innerHTML=evidenceCards(revealed);
 $('present-prompt').textContent=s.scenario?.prompt||'What kind of leadership would earn your trust?';
 const counts=(d.roster||[]).reduce((a,x)=>a+Number(x.members),0);
 $('present-participants').textContent=counts+' participants joined · '+d.votes.length+' ratings this round';
 const show=s.phase==='reveal'&&d.votes.length>0;
 $('present-graphic').hidden=show;$('present-metrics').hidden=!show;
 $('present-results-title').textContent=show?'How observers experienced this approach':s.phase==='reveal'?'No peer ratings submitted yet':'Results not yet revealed';
 if(show){$('present-metrics').innerHTML=[['Trust','trust'],['Willingness to support','support'],['Perceived effectiveness','effective']].map(([name,key])=>{const values=d.votes.map(x=>Number(x[key]));const avg=Math.round(values.reduce((a,b)=>a+b,0)/values.length);return '<div class="present-meter"><div><strong>'+esc(name)+'</strong><span>'+avg+'<small>/100</small></span></div><div class="bar"><span style="width:'+avg+'%"></span></div></div>';}).join('')+'<p class="fine">'+d.votes.length+' anonymous ratings · averages reflect class perceptions, not correctness.</p>';}
 }catch(e){$('present-status').textContent='Connection unavailable';}
 };
 refresh();setInterval(refresh,3500);
}
document.body.dataset.mode==='host'?host():document.body.dataset.mode==='present'?present():student();
