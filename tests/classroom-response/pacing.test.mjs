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
    'classroom_response_pacing.sql','migrations/202611120001_live_dot_voting.sql']){
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

function browser(html,path,db,errors,requests,stopPolling){
  const virtualConsole=new VirtualConsole();
  virtualConsole.on('jsdomError',error=>errors.push(error));
  return new JSDOM(html,{
    url:'https://www.mayneleadership.com/'+path,
    runScripts:'dangerously',
    pretendToBeVisual:true,
    virtualConsole,
    beforeParse(window){
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
    const saved=win=>win.document.querySelector('#noticeTitle').textContent.includes('saved');
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
    await assert.rejects(submit(db,{code},ballotSnapshot,{dots:{[firstProposal]:3}}),/available proposal/);
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
