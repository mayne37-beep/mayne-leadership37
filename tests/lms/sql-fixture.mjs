import {seed} from '../../src/lms/model.js';import {writeFile} from 'node:fs/promises';
const c=seed();c.announcements.push({id:crypto.randomUUID(),title:'Private instructor draft',body:'Confidential draft message',published:false,date:new Date().toISOString()});const lecture=c.items.find(i=>i.type==='lecture'),discussion=c.items.find(i=>i.type==='discussion'),assignment=c.items.find(i=>i.type==='assignment'),quiz=c.items.find(i=>i.type==='quiz');
const sql=`begin;
insert into ml_lms.gateway_keys values(encode(sha256(convert_to(repeat('a',64),'UTF8')),'hex')) on conflict do nothing;
do $test$
declare k text:=repeat('a',64);teacher uuid:='10000000-0000-4000-8000-000000000001';learner uuid:='20000000-0000-4000-8000-000000000002';cid uuid;eid uuid;peer uuid;r jsonb;s jsonb;attempt uuid;n int;
begin
r:=ml_lms.gateway(k,teacher,'teacher@example.invalid',true,'create',jsonb_build_object('name','LMS transaction QA','data','${JSON.stringify(c).replaceAll("'","''")}'::jsonb));cid:=(r->>'id')::uuid;
r:=ml_lms.gateway(k,teacher,'teacher@example.invalid',true,'enroll',jsonb_build_object('course',cid,'name','QA Student','email','student@example.invalid','external_id','QA-1'));
eid:=(r->'enrollments'->0->>'id')::uuid;
r:=ml_lms.gateway(k,teacher,'teacher@example.invalid',true,'enroll',jsonb_build_object('course',cid,'name','Peer','email','peer@example.invalid'));
select id into peer from ml_lms.enrollments where course_id=cid and email='peer@example.invalid';
begin perform ml_lms.gateway(k,learner,'outsider@example.invalid',false,'get',jsonb_build_object('course',cid));raise exception 'FAIL outsider access';exception when insufficient_privilege then null;end;
r:=ml_lms.gateway(k,learner,'student@example.invalid',false,'get',jsonb_build_object('course',cid));
if r->>'instructor'<>'false' or jsonb_array_length(r->'enrollments')<>1 or r::text like '%"correct"%' then raise exception 'FAIL student privacy';end if;
if r::text like '%Confidential draft message%' or jsonb_array_length(r->'course'->'data'->'announcements')<>1 then raise exception 'FAIL announcement draft privacy';end if;
r:=ml_lms.gateway(k,teacher,'teacher@example.invalid',true,'get',jsonb_build_object('course',cid));
if jsonb_array_length(r->'course'->'data'->'announcements')<>2 then raise exception 'FAIL instructor announcement access';end if;
r:=ml_lms.gateway(k,teacher,'teacher@example.invalid',true,'get',jsonb_build_object('course',cid,'preview',eid));
if r::text like '%Confidential draft message%' then raise exception 'FAIL student preview announcement privacy';end if;

begin perform ml_lms.gateway(k,learner,'student@example.invalid',false,'grade',jsonb_build_object('course',cid));raise exception 'FAIL student grading';exception when insufficient_privilege then null;end;
r:=ml_lms.gateway(k,learner,'student@example.invalid',false,'view',jsonb_build_object('course',cid,'item','${lecture.id}'));
r:=ml_lms.gateway(k,learner,'student@example.invalid',false,'draft',jsonb_build_object('course',cid,'item','${assignment.id}','answer',jsonb_build_object('fields',jsonb_build_array('One','Two','Three','Four'))));
select to_jsonb(ss) into s from ml_lms.submissions ss where enrollment_id=eid and item_id='${assignment.id}';
begin perform ml_lms.gateway(k,learner,'student@example.invalid',false,'submit',jsonb_build_object('course',cid,'item','${assignment.id}','version',999,'answer',jsonb_build_object('text','x')));raise exception 'FAIL stale draft';exception when serialization_failure then null;end;
r:=ml_lms.gateway(k,learner,'student@example.invalid',false,'submit',jsonb_build_object('course',cid,'item','${assignment.id}','version',(s->>'version')::int,'answer',jsonb_build_object('fields',jsonb_build_array('One','Two','Three','Four'))));
r:=ml_lms.gateway(k,teacher,'teacher@example.invalid',true,'post',jsonb_build_object('course',cid,'preview',peer,'item','${discussion.id}','body','Peer initial post'));
r:=ml_lms.gateway(k,learner,'student@example.invalid',false,'post',jsonb_build_object('course',cid,'item','${discussion.id}','body','My initial response'));
r:=ml_lms.gateway(k,learner,'student@example.invalid',false,'post',jsonb_build_object('course',cid,'item','${discussion.id}','body','My peer reply','parent',(select id from ml_lms.posts where enrollment_id=peer limit 1)));
r:=ml_lms.gateway(k,learner,'student@example.invalid',false,'quiz-start',jsonb_build_object('course',cid,'item','${quiz.id}'));
attempt:=(r->'attempts'->0->>'id')::uuid;
r:=ml_lms.gateway(k,learner,'student@example.invalid',false,'quiz-submit',jsonb_build_object('course',cid,'item','${quiz.id}','attempt',attempt,'answer','${JSON.stringify(Object.fromEntries(quiz.questions.map(q=>[q.id,q.type==='essay'?'Compare outage logs with daily delays':q.type==='short'?'assumption':q.correct])))}'::jsonb));
if ml_lms.summary(eid)->>'status'<>'awaiting_grading' then raise exception 'FAIL awaiting grading';end if;
for s in select to_jsonb(ss) from ml_lms.submissions ss where enrollment_id=eid loop
r:=ml_lms.gateway(k,teacher,'teacher@example.invalid',true,'grade',jsonb_build_object('course',cid,'item',s->>'item_id','enrollment',eid,'version',(s->>'version')::int,'score',case when s->>'item_id'='${discussion.id}' then 20 else 40 end,'posted',false,'feedback','Private feedback'));
end loop;
r:=ml_lms.gateway(k,learner,'student@example.invalid',false,'get',jsonb_build_object('course',cid));
if r::text like '%Private feedback%' or r->'submissions'->0->>'score' is not null then raise exception 'FAIL held grades privacy';end if;
for s in select to_jsonb(ss) from ml_lms.submissions ss where enrollment_id=eid loop
r:=ml_lms.gateway(k,teacher,'teacher@example.invalid',true,'grade',jsonb_build_object('course',cid,'item',s->>'item_id','enrollment',eid,'version',(s->>'version')::int,'score',(s->>'score')::numeric,'posted',true,'feedback','Released feedback'));
end loop;
if ml_lms.summary(eid)->>'status'<>'completed' then raise exception 'FAIL completion';end if;
if not exists(select 1 from ml_lms.enrollments where id=eid and completed_at is not null) then raise exception 'FAIL completion timestamp';end if;
for n in 3..20 loop r:=ml_lms.gateway(k,teacher,'teacher@example.invalid',true,'enroll',jsonb_build_object('course',cid,'name','Seat '||n,'email','seat'||n||'@example.invalid'));end loop;
begin perform ml_lms.gateway(k,teacher,'teacher@example.invalid',true,'enroll',jsonb_build_object('course',cid,'name','Extra','email','extra@example.invalid'));raise exception 'FAIL seat limit';exception when raise_exception then if sqlerrm like 'FAIL%' then raise;end if;end;
end $test$;
select 'PASS: privacy, enrollment, submissions, stale-version protection, discussions, quiz scoring, held grades, release, completion date, 20-seat limit' as result;
rollback;`;
await writeFile('/tmp/lms-integration.sql',sql);
