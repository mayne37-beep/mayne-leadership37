import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {PGlite} from '@electric-sql/pglite';
import {JSDOM,VirtualConsole} from 'jsdom';

async function classroomDatabase(){
  const db=new PGlite();
  await db.exec(`
    create role anon;
    create role authenticated;
    create schema extensions;
    create function extensions.digest(value text,algorithm text) returns bytea
      language sql immutable as $$ select sha256(convert_to(value,'UTF8')); $$;
  `);
  for(const file of ['classroom_response_studio.sql','classroom_response_countdown.sql',
    'classroom_response_pacing.sql','migrations/202611120001_live_dot_voting.sql',
    'migrations/20261112033855_bike_trail_classroom_controls.sql']){
    await db.exec(await readFile(new URL('../../supabase/'+file,import.meta.url),'utf8'));
  }
  return db;
}

const deck=[
  {id:'first',type:'wordcloud',question:'Opening question',info:'',accepting:true,responseLimit:3},
  {id:'second',type:'poll',question:'Choose a response',info:'',accepting:true,multiple:false,choices:[{id:'a',label:'One'},{id:'b',label:'Two'}]},
  {id:'third',type:'open',question:'Final reflection',info:'',accepting:true,openLimit:1000},
  {id:'draft',type:'wordcloud',question:'',info:'',accepting:true,responseLimit:3}
];
const host='a'.repeat(64),participant='11111111-1111-4111-8111-111111111111',token='b'.repeat(64);
async function rpc(db,name,args){
  const names=Object.keys(args),values=Object.values(args);
  const parameters=names.map((key,index)=>key+' => $'+(index+1));
  const result=await db.query(`select public.${name}(${parameters.join(',')}) as result`,values);
  return result.rows[0].result;
}
const create=(db,pacing)=>rpc(db,'crs_create_session',{p_deck:JSON.stringify(deck),p_active_slide:'second',p_host_token:host,...(pacing?{p_pacing:pacing}:{})});
const snapshot=(db,code,slideId,participantToken=token)=>rpc(db,'crs_student_snapshot',{
  p_code:code,p_participant_id:participant,p_participant_token:participantToken,p_known_revision:null,p_slide_id:slideId
});
const control=(db,session,active,pacing)=>rpc(db,'crs_control_session',{
  p_session_id:session.id,p_host_token:host,p_deck:null,p_active_slide:active,p_status:null,p_action:null,p_pacing:pacing
});
const submit=(db,session,slide,answer,requestId=crypto.randomUUID())=>rpc(db,'crs_submit_response',{
  p_code:session.code,p_participant_id:participant,p_participant_token:token,p_request_id:requestId,
  p_slide_id:slide.active_slide_id,p_revision:slide.revision,p_epoch:slide.epoch,p_answer:JSON.stringify(answer)
});

test('students can answer independently while the presenter advances, then rejoin instructor pacing',async()=>{
  const db=await classroomDatabase();
  try{
    await db.exec('set role anon');
    const session=await create(db,'self');
    let first=await snapshot(db,session.code,null);
    assert.equal(first.active_slide_id,'first');
    assert.equal(first.presenter_slide_id,'second');
    assert.deepEqual(first.slides.map(s=>s.id),['first','second','third']);
    const moved=await control(db,session,'third','self');
    assert.equal(moved.revision,first.revision,'presenter navigation must not invalidate independent answers');
    const requestId=crypto.randomUUID();
    first=await submit(db,session,first,{words:['independent']},requestId);
    assert.equal(first.active_slide_id,'first');
    assert.deepEqual(first.my_answer,{words:['independent']});
    assert.equal(first.slides[0].answered,true);
    const replay=await submit(db,session,first,{words:['independent']},requestId);
    assert.deepEqual(replay.my_answer,first.my_answer,'a retried request counts once');
    const second=await snapshot(db,session.code,'second');
    assert.equal(second.my_answer,null);
    await submit(db,session,second,{choice_ids:['b']});
    const third=await snapshot(db,session.code,'third');
    await submit(db,session,third,{text:'My reflection'});
    const finished=await snapshot(db,session.code,'first');
    assert.equal(finished.slides.filter(s=>s.answered).length,3);
    assert.deepEqual(finished.my_answer,{words:['independent']});
    const stranger=await snapshot(db,session.code,'first','c'.repeat(64));
    assert.equal(stranger.my_answer,null);
    assert.equal(stranger.slides.filter(s=>s.answered).length,0,'progress is private to the response token');
    await assert.rejects(submit(db,session,{...finished,active_slide_id:'missing'},{words:['invalid']}),/unavailable/);
    await rpc(db,'crs_control_session',{p_session_id:session.id,p_host_token:host,p_active_slide:'second',p_action:'clear'});
    const cleared=await snapshot(db,session.code,'second');
    assert.equal(cleared.my_answer,null);
    assert.equal(cleared.slides.filter(s=>s.answered).length,2);
    await assert.rejects(submit(db,session,{...cleared,epoch:second.epoch},{choice_ids:['a']}),/cleared/);
    await control(db,session,'second','instructor');
    const together=await snapshot(db,session.code,'third');
    assert.equal(together.active_slide_id,'second');
    assert.equal(together.slides,null,'instructor mode exposes the current question');
    await assert.rejects(submit(db,session,{...together,active_slide_id:'third'},{text:'Out of sequence'}),/teacher changed/);
    await assert.rejects(submit(db,session,finished,{words:['stale']}),/teacher changed/);
  }finally{await db.close();}
});

test('existing clients, pause, expiry, and per-question countdowns retain their controls',async()=>{
  const db=await classroomDatabase();
  try{
    const session=await create(db);
    assert.equal(session.pacing,'instructor');
    const old=await rpc(db,'crs_student_snapshot',{p_code:session.code});
    assert.equal(old.active_slide_id,'second');
    await rpc(db,'crs_control_session',{p_session_id:session.id,p_host_token:host,p_active_slide:'first'});
    const moved=await snapshot(db,session.code,'third');
    assert.equal(moved.active_slide_id,'first');
    await control(db,session,'first','self');
    await db.query(`update crs_private.sessions set timers=jsonb_build_object('third',jsonb_build_object('state','finished','auto_close',true,'remaining',0)) where id=$1`,[session.id]);
    const expiredQuestion=await snapshot(db,session.code,'third');
    assert.equal(expiredQuestion.status,'paused');
    await assert.rejects(submit(db,session,expiredQuestion,{text:'Too late'}),/Time is up/);
    const availableQuestion=await snapshot(db,session.code,'first');
    assert.equal(availableQuestion.status,'open');
    await submit(db,session,availableQuestion,{words:['on time']});
    await rpc(db,'crs_control_session',{p_session_id:session.id,p_host_token:host,p_status:'paused'});
    const paused=await snapshot(db,session.code,'second');
    await assert.rejects(submit(db,session,paused,{choice_ids:['a']}),/paused/);
    await db.query(`update crs_private.sessions set expires_at=now()-interval '1 second' where id=$1`,[session.id]);
    assert.equal((await snapshot(db,session.code,'third')).status,'expired');
    await assert.rejects(control(db,session,'first','instructor'),/ended/);
    const privileges=await db.query(`select has_table_privilege('anon','crs_private.responses','SELECT') as readable,
      has_function_privilege('anon','crs_private.student_packet(crs_private.sessions,uuid,text,integer,text)','EXECUTE') as helper`);
    assert.deepEqual(privileges.rows,[{readable:false,helper:false}]);
  }finally{await db.close();}
});

function browser(html,path,db,errors,requests,stopPolling,sharedStorage){
  const virtualConsole=new VirtualConsole();
  virtualConsole.on('jsdomError',error=>errors.push(error));
  return new JSDOM(html,{
    url:'https://www.mayneleadership.com/'+path,
    runScripts:'dangerously',
    pretendToBeVisual:true,
    virtualConsole,
    beforeParse(window){
      if(sharedStorage){
        Object.defineProperty(window,'localStorage',{value:{
          getItem:key=>sharedStorage.get(key)??null,
          setItem:(key,value)=>sharedStorage.set(key,String(value)),
          removeItem:key=>sharedStorage.delete(key)
        }});
      }
      const intervals=[],setInterval=window.setInterval.bind(window);
      window.setInterval=(...args)=>{
        const id=setInterval(...args);
        intervals.push(id);
        return id;
      };
      stopPolling.push(()=>intervals.forEach(id=>window.clearInterval(id)));
      window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
      window.HTMLDialogElement.prototype.close=function(){this.open=false;};
      window.HTMLCanvasElement.prototype.getContext=()=>({measureText(text){return{width:text.length*9};}});
      window.fetch=async(url,{body})=>{
        const name=new URL(url).pathname.split('/').at(-1),args=JSON.parse(body);
        const payload=Object.fromEntries(Object.entries(args).map(([key,value])=>[
          key,value&&typeof value==='object'?JSON.stringify(value):value
        ]));
        try{
          const result=await rpc(db,name,payload);
          requests.push({name,result});
          return {ok:true,json:async()=>result};
        }catch(error){
          return {ok:false,json:async()=>({message:error.message})};
        }
      };
    }
  });
}
async function eventually(check,message){
  const until=Date.now()+6500;
  do {
    if(check())return;
    await new Promise(resolve=>setTimeout(resolve,35));
  }while(Date.now()<until);
  assert.fail(message);
}
const click=(win,selector)=>{const button=win.document.querySelector(selector);assert.ok(button,selector);assert.ok(!button.disabled,selector);button.click();};
const type=(win,selector,value)=>{const field=win.document.querySelector(selector);assert.ok(field,selector);field.value=value;field.dispatchEvent(new win.Event('input',{bubbles:true}));};
const submitForm=win=>win.document.querySelector('#responseForm').dispatchEvent(new win.Event('submit',{bubbles:true,cancelable:true}));

test('Bike Trail uses one code for private submissions, two-dot ballots, and the agreement debrief',{timeout:45000},async()=>{
  const db=await classroomDatabase(),browsers=[],errors=[],requests=[],stopPolling=[];
  try{
    await db.exec('set role anon');
    const [studio,respond]=await Promise.all(['word-cloud-studio.html','word-cloud-respond.html'].map(path=>
      readFile(new URL('../../'+path,import.meta.url),'utf8')
    ));
    const launch=(html,path)=>{
      const dom=browser(html,path,db,errors,requests,stopPolling);
      browsers.push(dom.window);
      return dom.window;
    };
    const instructor=launch(studio,'word-cloud-studio.html?activity=bike-trail');
    await eventually(()=>instructor.document.querySelector('[data-action="live-start"]'),'Template opens the live session controls');
    click(instructor,'[data-action="live-start"]');
    await eventually(()=>instructor.document.querySelector('#studentJoinLink'),'Session created');
    const join=instructor.document.querySelector('#studentJoinLink').value,code=new URL(join).searchParams.get('code');
    assert.match(code,/^\d{7}$/);
    const first=launch(respond,'word-cloud-respond.html?code='+code);
    const second=launch(respond,'word-cloud-respond.html?code='+code);
    const question=win=>win.document.querySelector('#question').textContent;
    const saved=win=>/saved|submitted/i.test(win.document.querySelector('#noticeTitle').textContent);
    await eventually(()=>[first,second].every(w=>question(w)==='What problem do you see on the bike trail?'),'Students joined on the first question');
    type(first,'[name="text"]','People report hazards and disagree about passing.');
    submitForm(first);
    await eventually(()=>saved(first),'Problem statement saved');
    click(instructor,'#nextSlide');
    await eventually(()=>question(first)==='Who is involved or affected?','Stakeholders question reached');
    type(first,'[name="text"]','People walking and biking, and trail managers.');
    submitForm(first);
    await eventually(()=>saved(first),'Stakeholders saved');
    click(instructor,'#nextSlide');
    await eventually(()=>[first,second].every(w=>question(w)==='What solution would you propose?'),'Proposal question reached');
    type(first,'[name="text"]','Clarify passing and yielding.');
    type(second,'[name="text"]','Improve hazard reporting.');
    submitForm(first);submitForm(second);
    await eventually(()=>[first,second].every(saved),'Student proposals saved');
    click(instructor,'#nextSlide');
    click(instructor,'#dotVotingControls');
    await eventually(()=>instructor.document.querySelectorAll('[data-action="dot-add-suggestion"]').length===2,'Student proposals received by instructor');
    assert.match(instructor.document.querySelector('[data-dot-example]').textContent,/Five example ballots/);
    type(instructor,'#dotVotingContent [data-field="question"]','How can we make the trail safer for everyone?');
    click(instructor,'[data-dot-source] summary');
    click(instructor,'.dot-proposals li:nth-child(1) button');
    click(instructor,'.dot-proposals li:nth-child(2) button');
    const proposals=[...instructor.document.querySelectorAll('#dotVotingContent [data-item-group="choices"]')].map(el=>el.value);
    assert.deepEqual(new Set(proposals),new Set(['Clarify passing and yielding.','Improve hazard reporting.']));
    click(instructor,'[data-round="open"]');
    const enabled=win=>!win.document.querySelector('#submitButton').disabled;
    await eventually(()=>[first,second].every(w=>question(w).includes('safer for everyone')&&enabled(w)),'Ballot opened for both students');
    assert.equal(first.document.body.textContent.includes('Five example ballots'),false);
    const ballotSnapshot=requests.findLast(entry=>entry.name==='crs_student_snapshot'&&entry.result.slide?.type==='dotvote').result;
    assert.equal(ballotSnapshot.dot_tally,null);
    const firstProposal=ballotSnapshot.slide.choices[0].id;
    await assert.rejects(submit(db,{code},ballotSnapshot,{dots:{[firstProposal]:1}}),/Allocate both dots/);
    await assert.rejects(submit(db,{code},ballotSnapshot,{dots:{[firstProposal]:3}}),/ballot allotment/);
    const steps=win=>[...win.document.querySelectorAll('[data-dot-step="1"]')];
    steps(first)[0].click();
    submitForm(first);
    await eventually(()=>/Allocate both dots/.test(first.document.querySelector('#status').textContent),'One dot is rejected');
    steps(first)[0].click();
    assert.ok(steps(first).every(button=>button.disabled),'Third dot is disabled');
    steps(second)[0].click();
    steps(second)[1].click();
    submitForm(first);submitForm(second);
    await eventually(()=>[first,second].every(saved),'Both ballots saved');
    await eventually(()=>instructor.document.querySelector('[data-dot-count]').textContent==='2 ballots submitted','Instructor receives count');
    const hostSnapshot=requests.findLast(entry=>entry.name==='crs_host_snapshot'&&entry.result.responses.filter(r=>r.kind==='dotvote').length===2);
    assert.deepEqual(hostSnapshot.result.responses.filter(r=>r.kind==='dotvote').map(r=>r.answer),[{},{}]);
    assert.equal(first.document.querySelector('#dotResults').hidden,true);
    click(instructor,'[data-round="close"]');
    await eventually(()=>[first,second].every(w=>!enabled(w)&&w.document.querySelector('#noticeTitle').textContent==='Voting is closed.'),'Voting closes without a tally');
    assert.equal(second.document.querySelector('#dotResults').hidden,true);
    click(instructor,'[data-round="reveal"]');
    await eventually(()=>[first,second].every(w=>!w.document.querySelector('#dotResults').hidden),'Instructor reveals the tally on both devices');
    for(const win of [first,second]){
      assert.deepEqual([...win.document.querySelectorAll('#dotResults tbody tr')].map(row=>
        [...row.cells].map(cell=>cell.textContent.trim())
      ),[['1','1. '+proposals[0],'3'],['2','2. '+proposals[1],'1']]);
    }
    click(instructor,'[data-action="dot-select"]');
    await eventually(()=>question(first)==='How much do you support the selected proposal?'&&enabled(first),'Agreement scale is open');
    assert.equal(first.document.querySelector('.scale-question legend').textContent,proposals[0]);
    assert.equal(first.document.querySelectorAll('.scale-question input').length,8);
    click(first,'.scale-question input[value="3"]');
    submitForm(first);
    await eventually(()=>saved(first),'Agreement rating saved');
    click(instructor,'#nextSlide');
    await eventually(()=>question(first)==='What’s your reason or reservation?'&&enabled(first),'Reservation question is open');
    type(first,'[name="text"]','We should check if signs address the cause of conflicts.');
    submitForm(first);
    await eventually(()=>saved(first),'Reservation saved');
    assert.deepEqual(errors,[]);
  }finally{
    stopPolling.forEach(stop=>stop());
    await db.query('select 1');
    await new Promise(resolve=>setImmediate(resolve));
    browsers.forEach(win=>win.close());
    await db.close();
  }
});

async function originalBikeTrailPage(){
  const [html, classroom, live] = await Promise.all(['bike-trail-dot-voting.html','assets/bike-trail-classroom.js','assets/bike-trail-live.js'].map(path=>
    readFile(new URL('../../'+path,import.meta.url),'utf8')
  ));
  return html.replace('<script src="assets/bike-trail-classroom.js"></script>', '<script>'+classroom+'</script>')
    .replace('<script src="assets/bike-trail-live.js?v=classroom-controls"></script>', '<script>'+live+'</script>');
}

test('the original Bike Trail page retains the worked example and both in-person voting methods',async()=>{
  const errors=[],stop=[],page=await originalBikeTrailPage();
  const host=browser(page,'bike-trail-dot-voting.html',null,errors,[],stop).window;
  try{
    click(host,'#example-tab');
    assert.equal(host.document.querySelector('#example-panel').hidden,false);
    for(let ballot=0;ballot<6;ballot++)click(host,'#next-example');
    assert.deepEqual([...host.document.querySelectorAll('#example-totals td')].map(cell=>cell.textContent),['3','4','3']);
    click(host,'#vote-tab');
    type(host,'#proposal-1','Improve hazard reporting');
    type(host,'#proposal-2','Clarify passing');
    click(host,'#add-proposal');type(host,'#proposal-3','Widen the path');
    click(host,'#add-proposal');type(host,'#proposal-4','Update the signs');
    click(host,'#add-proposal');type(host,'#proposal-5','Offer trail maps');
    assert.match(host.document.querySelector('#suggested-dots').textContent,/5 proposals.*3 dots/);
    assert.equal(host.document.querySelector('#dot-budget').value,'2');
    type(host,'#dot-budget','4');
    type(host,'#voters','1');
    click(host,'#start-vote');
    click(host,'#handoff-primary');
    const add=host.document.querySelector('#ballot-proposals button[aria-label^="Add dot"]');
    add.click();add.click();add.click();
    assert.equal(host.document.querySelector('#submit-ballot').disabled,true);
    assert.equal(host.document.querySelector('#dots-left').textContent,'1 dot left');
    add.click();
    assert.equal(add.disabled,true);
    click(host,'#submit-ballot');
    click(host,'#handoff-primary');
    assert.equal(host.document.querySelector('#results-summary').textContent,'1 ballot recorded · 4 dots');
    host.confirm=()=>true;
    click(host,'#new-round');
    click(host,'input[value=tally]');
    type(host,'#voters','2');
    type(host,'#dot-budget','3');
    click(host,'#start-vote');
    type(host,'#tally-1','3');
    assert.equal(host.document.querySelector('#submit-tally').disabled,true);
    type(host,'#tally-2','3');
    click(host,'#submit-tally');
    assert.equal(host.document.querySelector('#results-summary').textContent,'2 ballots recorded · 6 dots');
    assert.equal(host.document.querySelector('#discussion-choice legend').textContent,'Tie for first');
    assert.deepEqual(errors,[]);
  }finally{
    stop.forEach(clear=>clear());
    host.close();
  }
});

test('the original instructor page runs the live exercise using its own setup and results',{timeout:70000},async()=>{
  const db=await classroomDatabase(),browsers=[],errors=[],requests=[],stopPolling=[];
  try{
    await db.exec('set role anon');
    const [page,respond]=await Promise.all([originalBikeTrailPage(),readFile(new URL('../../word-cloud-respond.html',import.meta.url),'utf8')]);
    const launch=(html,path,storage)=>{
      const win=browser(html,path,db,errors,requests,stopPolling,storage).window;
      browsers.push(win);
      return win;
    };
    const sharedStorage=new Map();
    const instructor=launch(page,'bike-trail-dot-voting.html',sharedStorage);
    const find=(win,label)=>[...win.document.querySelectorAll('button')].find(node=>node.textContent===label);
    const press=(win,label)=>{const node=find(win,label);assert.ok(node&&!node.disabled,label);node.click();};
    const title=()=>instructor.document.querySelector('#stage-title')?.textContent;
    const question=win=>win.document.querySelector('#question').textContent;
    const saved=win=>/saved|submitted/i.test(win.document.querySelector('#noticeTitle').textContent);
    const written=(win,value)=>{type(win,'[name=text]',value);submitForm(win);};

    click(instructor,'input[value=live]');
    press(instructor,'Create live session');
    await eventually(()=>instructor.document.querySelector('.live-join a'),'Session code and link appear on the original page');
    const link=new URL(instructor.document.querySelector('.live-join a').href);
    const code=link.searchParams.get('code');
    assert.match(code,/^\d{7}$/);
    const displayLink=new URL([...instructor.document.querySelectorAll('.live-join a')].find(a=>a.textContent==='Open class display').href);
    const display=launch(page,displayLink.pathname.slice(1)+displayLink.search,sharedStorage);
    const refreshDisplay=()=>display.dispatchEvent(new display.StorageEvent('storage',{key:'bike-trail-class-display-v1'}));
    assert.equal(display.document.querySelector('#class-display-title').textContent,'What problem do you see on the bike trail?');
    const students=[1,2].map(()=>launch(respond,link.pathname.slice(1)+link.search));
    await eventually(()=>students.every(win=>question(win)==='What problem do you see on the bike trail?'),'Students begin with the individual problem');
    written(students[0],'The shared trail feels crowded at busy times.');
    await eventually(()=>instructor.document.querySelector('.live-responses')?.textContent.includes('crowded'),'Problem response appears on the original page');

    type(students[1],'[name=text]','An unsent draft.');
    press(instructor,'Who is involved?');
    await eventually(()=>students.every(win=>question(win)==='Who is involved or affected?'),'Stakeholder prompt follows the instructor');
    assert.equal(students[1].document.querySelector('#status').textContent,'New question. Your previous draft is saved on this device.');
    assert.equal(students[0].document.querySelector('#status').textContent,'New question. Your previous response was submitted to the instructor.');
    written(students[0],'Walkers, cyclists, runners and trail managers.');
    await eventually(()=>saved(students[0]),'Stakeholder response saved');
    press(instructor,'Proposals');
    await eventually(()=>students.every(win=>question(win)==='What solution would you propose?'),'Proposal prompt follows the instructor');
    written(students[0],'Explain passing and yielding.');
    written(students[1],'Improve hazard reporting.');
    await eventually(()=>instructor.document.querySelectorAll('.live-responses button').length===2,'Both suggestions appear for grouping');
    instructor.document.querySelector('.live-responses li:nth-child(1) button').click();
    instructor.document.querySelector('.live-responses li:nth-child(2) button').click();
    const labels=[...instructor.document.querySelectorAll('.proposal-edit input')].map(input=>input.value);
    assert.deepEqual(new Set(labels),new Set(['Explain passing and yielding.','Improve hazard reporting.']));
    type(instructor,'#problem','How can we make the trail safer for everyone?');
    type(instructor,'#expected-voters','2');
    type(instructor,'#dot-budget','3');
    const normalFetch=instructor.fetch;
    let dropped=false;
    instructor.fetch=async(url,options)=>{
      const reply=await normalFetch(url,options);
      if(!dropped&&reply.ok&&url.endsWith('/crs_bike_trail_control')&&JSON.parse(options.body).p_active_slide==='ballot'){
        dropped=true;
        throw new instructor.TypeError('Test connection dropped after the server accepted the ballot.');
      }
      return reply;
    };
    click(instructor,'#start-vote');
    await eventually(()=>title()==='Voting is open'&&students.every(win=>question(win).includes('safer for everyone')),'The instructor recovers the ballot that students received');
    assert.equal(dropped,true);
    assert.match(instructor.document.querySelector('#live-vote-instructions').textContent,/3 dots/);
    assert.equal(students[0].document.querySelector('[data-dot-budget]').textContent,'3 dots left');
    refreshDisplay();
    assert.equal(display.document.querySelector('#class-display-proposals').children.length,2);
    assert.equal(display.document.querySelector('#class-display-proposals .result-count'),null);
    const resumed=launch(page,'bike-trail-dot-voting.html',sharedStorage);
    await eventually(()=>resumed.document.querySelector('#stage-title')?.textContent==='Voting is open'&&
      find(resumed,'Close voting')?.disabled===false,'A fresh instructor tab restores the current ballot controls');
    assert.equal(new URL(resumed.document.querySelector('.live-join a').href).searchParams.get('code'),code);
    press(instructor,'Close voting');
    await eventually(()=>title()==='Voting is closed','An empty ballot can be closed');
    press(instructor,'Edit setup');
    await eventually(()=>title()==='Prepare the vote'&&students.every(win=>question(win)==='What solution would you propose?'),'The same code returns to preparation before any ballots');
    assert.equal(new URL(instructor.document.querySelector('.live-join a').href).searchParams.get('code'),code);
    click(instructor,'#start-vote');
    await eventually(()=>title()==='Voting is open'&&students.every(win=>question(win).includes('safer for everyone')),'The ballot reopens under the same code');
    for(const [index,win] of students.entries()){
      const add=win.document.querySelectorAll('[data-dot-step="1"]')[index];
      add.click();add.click();add.click();
      submitForm(win);
    }
    await eventually(()=>students.every(saved),'Both ballots are accepted');
    await eventually(()=>instructor.document.querySelector('[data-live-data="vote"]')?.textContent==='2 of 2 ballots submitted','Only the ballot count is shown while voting');
    assert.equal(instructor.document.querySelector('#ranked-proposals'),null);
    assert.ok(students.every(win=>win.document.querySelector('#dotResults').hidden));
    press(instructor,'Close voting');
    await eventually(()=>title()==='Voting is closed'&&students.every(win=>win.document.querySelector('#noticeTitle').textContent==='Voting is closed.'),'Closing keeps the totals hidden');
    press(instructor,'Reveal tally');
    await eventually(()=>title()==='Vote results'&&students.every(win=>!win.document.querySelector('#dotResults').hidden),'The original Results screen and student tally appear together');
    assert.equal(instructor.document.querySelector('#results-summary').textContent,'2 ballots recorded · 6 dots');
    assert.match(students[0].document.querySelector('#dotResults').textContent,/2 ballots submitted/);
    refreshDisplay();
    assert.deepEqual([...display.document.querySelectorAll('#class-display-proposals .result-count')].map(el=>el.textContent),['3 dots','3 dots']);
    assert.equal(instructor.document.querySelector('#discussion-choice legend').textContent,'Tie for first');
    assert.equal(find(instructor,'Open Gradients of Agreement').disabled,true);
    click(instructor,'input[name=discussion-proposal]');
    press(instructor,'Open Gradients of Agreement');
    await eventually(()=>students.every(win=>question(win)==='How much do you support the selected proposal?'),'The chosen proposal opens its 1–8 agreement rating');
    assert.equal(students[0].document.querySelector('.scale-question legend').textContent,labels[0]);
    const agreementChart=()=>instructor.document.querySelector('[data-live-agreement]');
    const height=(level)=>agreementChart().querySelector(`[data-agreement-level="${level}"]`).style.getPropertyValue('--agreement-height');
    const ratingsTotal=()=>agreementChart().querySelector('[data-agreement-total]').textContent;
    const rate=(win,level)=>{
      click(win,`.scale-question input[value="${level}"]`);
      if(level===3)assert.equal(win.document.querySelector('[data-scale-selection]').textContent,'3 — Support with reservations');
      submitForm(win);
    };
    const chart=agreementChart();
    assert.deepEqual([...chart.querySelectorAll('.live-agreement-number')].map(tick=>tick.textContent),
      ['1','2','3','4','5','6','7','8']);
    assert.equal(ratingsTotal(),'0 of 2 ratings submitted');
    rate(students[0],3);
    await eventually(()=>ratingsTotal()==='1 of 2 ratings submitted'&&height(3)==='25%','The first rating raises its bar');
    rate(students[1],7);
    await eventually(()=>ratingsTotal()==='2 of 2 ratings submitted'&&height(7)==='25%','Ratings appear in separate columns');
    rate(students[0],7);
    await eventually(()=>height(3)==='0%'&&height(7)==='50%','An updated rating lowers one bar and raises the other');
    assert.equal(agreementChart(),chart,'The same chart updates as ratings change');
    assert.equal(chart.querySelector('[data-agreement-level="7"] .live-agreement-count').textContent,'2');
    refreshDisplay();
    assert.equal(display.document.querySelector('[data-live-agreement]'),null);
    press(instructor,'Reveal agreement results');
    await eventually(()=>!find(instructor,'Reveal agreement results'),'The instructor can reveal the chart');
    refreshDisplay();
    assert.equal(display.document.querySelector('[data-agreement-level="7"] .live-agreement-count').textContent,'2');
    await eventually(()=>students.every(win=>win.document.querySelector('#submitButton').disabled),'Revealing results closes ratings');
    press(instructor,'Collect reasons and reservations');
    await eventually(()=>students.every(win=>question(win)==='What’s your reason or reservation?'),'Reservation prompt follows the instructor');
    assert.equal(height(7),'50%','The agreement chart remains visible for the debrief');
    written(students[0],'Check if signs would address the cause of conflicts.');
    await eventually(()=>instructor.document.querySelector('.live-responses')?.textContent.includes('cause of conflicts'),'Instructor receives the reservation for the debrief');
    press(instructor,'Use as concern');
    const concern='Check if signs would address the cause of conflicts.';
    assert.equal(instructor.document.querySelector('#shifting-the-burden-concern').value,concern);
    refreshDisplay();
    assert.equal(display.document.body.textContent.includes(concern),false);
    press(instructor,'Save debrief');
    assert.match(instructor.document.querySelector('#saved-debriefs').textContent,/cause of conflicts/);
    let downloaded;
    instructor.URL.createObjectURL=blob=>{downloaded=blob;return 'blob:https://www.mayneleadership.com/debrief-test';};
    instructor.URL.revokeObjectURL=()=>{};
    instructor.HTMLAnchorElement.prototype.click=function(){};
    press(instructor,'Download debrief');
    const exportText=await new Promise((resolve,reject)=>{
      const reader=new instructor.FileReader();
      reader.onload=()=>resolve(reader.result);
      reader.onerror=reject;
      reader.readAsText(downloaded);
    });
    assert.match(exportText,/3 dots per student/);
    assert.match(exportText,/Gradients of Agreement/);
    assert.match(exportText,/Concern for Shifting the Burden/);
    assert.ok(exportText.includes(concern));
    instructor.confirm=()=>true;
    press(instructor,'End live session');
    await eventually(()=>students.every(win=>win.document.querySelector('#noticeTitle').textContent==='This session has ended.'),'Ending the session closes the student code');
    assert.equal(height(7),'50%','The chart stays available after the session ends');
    click(instructor,'#new-round');
    await eventually(()=>title()==='Prepare the vote','A new round returns to setup');
    const afterClass=launch(page,'bike-trail-dot-voting.html',sharedStorage);
    assert.match(afterClass.document.querySelector('#saved-debriefs').textContent,/cause of conflicts/);
    assert.equal(afterClass.document.querySelector('#saved-debriefs [data-agreement-level="7"] .live-agreement-count').textContent,'2');
    assert.deepEqual(errors,[]);
  }finally{
    stopPolling.forEach(stop=>stop());
    await db.query('select 1');
    await new Promise(resolve=>setImmediate(resolve));
    browsers.forEach(win=>win.close());
    await db.close();
  }
});

test('a live session can be retried and its allotment is locked once a ballot is submitted',async()=>{
  const db=await classroomDatabase();
  try{
    await db.exec('set role anon');
    const liveDeck=[
      {id:'problem',type:'open',question:'What problem do you see?',info:'',accepting:true,openLimit:500},
      {id:'ballot',type:'dotvote',question:'Which proposal should the group discuss?',info:'',accepting:true,
        dotRevealed:false,dotBudget:1,choices:[{id:'a',label:'First'},{id:'b',label:'Second'}]}
    ];
    const args={p_deck:JSON.stringify(liveDeck),p_host_token:host};
    const room=await rpc(db,'crs_bike_trail_start',args);
    const retry=await rpc(db,'crs_bike_trail_start',args);
    assert.equal(retry.id,room.id);
    assert.equal(retry.code,room.code);
    const update=(revision,next=null)=>rpc(db,'crs_bike_trail_control',{
      p_session_id:room.id,p_host_token:host,p_expected_revision:revision,
      p_deck:next?JSON.stringify(next):null,p_active_slide:'ballot',p_status:null
    });
    const opened=await update(room.revision);
    const outdated=await update(room.revision);
    assert.equal(outdated.conflict,true);
    assert.equal(outdated.active_slide_id,'ballot');
    const ballot=await snapshot(db,room.code,'ballot');
    assert.equal(ballot.slide.dotBudget,1);
    await assert.rejects(submit(db,room,ballot,{dots:{a:1,b:1}}),/Place your dot/);
    const accepted=await submit(db,room,ballot,{dots:{a:1}});
    assert.deepEqual(accepted.my_answer,{dots:{a:1}});
    const changed=liveDeck.map(slide=>slide.id==='ballot'?{...slide,dotBudget:3}:slide);
    await assert.rejects(update(opened.revision,changed),/Clear this slide’s results/);
    const masked=await rpc(db,'crs_bike_trail_state',{p_session_id:room.id,p_host_token:host,p_known_revision:room.revision});
    assert.equal(masked.deck[1].dotBudget,1);
    assert.deepEqual(masked.responses.find(response=>response.kind==='dotvote').answer,{});
    const revealed=liveDeck.map(slide=>slide.id==='ballot'?{...slide,accepting:false,dotRevealed:true}:slide);
    await update(opened.revision,revealed);
    assert.deepEqual((await snapshot(db,room.code,'ballot')).dot_tally,{ballots:1,counts:{a:1}});
  }finally{await db.close();}
});
