import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {PGlite} from '@electric-sql/pglite';

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
    'classroom_response_pacing.sql']){
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
