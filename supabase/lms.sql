-- LMS data is private; only the server gateway can enter this schema.
create schema if not exists ml_lms;
revoke all on schema ml_lms from public,anon,authenticated;
create table if not exists ml_lms.gateway_keys(key_hash text primary key);
create table if not exists ml_lms.courses(id uuid primary key default gen_random_uuid(),owner uuid not null,name text not null,data jsonb not null,version integer not null default 1,archived boolean not null default false,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table if not exists ml_lms.enrollments(id uuid primary key default gen_random_uuid(),course_id uuid not null references ml_lms.courses(id),user_id uuid,name text not null,email text not null,external_id text not null default '',active boolean not null default true,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),completed_at timestamptz,unique(course_id,email));
create table if not exists ml_lms.submissions(id uuid primary key default gen_random_uuid(),enrollment_id uuid not null references ml_lms.enrollments(id),item_id text not null,status text not null default 'draft' check(status in ('draft','submitted','graded','excused')),answer jsonb not null default '{}',score numeric,posted boolean not null default false,feedback text not null default '',rubric jsonb not null default '[]',attempt integer not null default 1,version integer not null default 1,submitted_at timestamptz,updated_at timestamptz not null default now(),unique(enrollment_id,item_id));
create table if not exists ml_lms.attempts(id uuid primary key default gen_random_uuid(),enrollment_id uuid not null references ml_lms.enrollments(id),item_id text not null,number integer not null,snapshot jsonb not null,answer jsonb not null default '{}',started_at timestamptz not null default now(),deadline timestamptz,submitted_at timestamptz,score numeric,unique(enrollment_id,item_id,number));
create table if not exists ml_lms.posts(id uuid primary key default gen_random_uuid(),enrollment_id uuid not null references ml_lms.enrollments(id),item_id text not null,parent_id uuid references ml_lms.posts(id),body text not null,created_at timestamptz not null default now());
create table if not exists ml_lms.views(enrollment_id uuid not null references ml_lms.enrollments(id),item_id text not null,viewed_at timestamptz not null default now(),primary key(enrollment_id,item_id));
create table if not exists ml_lms.files(id uuid primary key default gen_random_uuid(),course_id uuid not null references ml_lms.courses(id),enrollment_id uuid references ml_lms.enrollments(id),item_id text not null,name text not null,mime text not null,data text not null,created_at timestamptz not null default now());
create table if not exists ml_lms.audit(id bigint generated always as identity primary key,course_id uuid,actor uuid,action text not null,detail jsonb not null default '{}',created_at timestamptz not null default now());
create index if not exists lms_enrollment_course on ml_lms.enrollments(course_id);
create index if not exists lms_enrollment_identity on ml_lms.enrollments(user_id,email);
create index if not exists lms_posts_item on ml_lms.posts(item_id,enrollment_id);
create index if not exists lms_files_course on ml_lms.files(course_id,enrollment_id);
do $$ declare t text;begin foreach t in array array['gateway_keys','courses','enrollments','submissions','attempts','posts','views','files','audit'] loop execute format('alter table ml_lms.%I enable row level security',t);end loop;end $$;
revoke all on all tables in schema ml_lms from public,anon,authenticated;

create or replace function ml_lms.summary(eid uuid) returns jsonb language plpgsql set search_path='' as $$
declare c ml_lms.courses;e ml_lms.enrollments;i jsonb;s ml_lms.submissions;g text;r int:=0;d int:=0;sent int:=0;started bool:=false;ok bool;participates bool;num numeric;den numeric;cur numeric;fin numeric;w numeric:=0;current_w numeric:=0;total numeric:=0;ctotal numeric:=0;status text;viewed bool;
begin
 select * into e from ml_lms.enrollments where id=eid;select * into c from ml_lms.courses where id=e.course_id;
 for i in select value from jsonb_array_elements(c.data->'items') where coalesce((value->>'published')::bool,false) loop
 select * into s from ml_lms.submissions where enrollment_id=eid and item_id=i->>'id';
 select exists(select 1 from ml_lms.views where enrollment_id=eid and item_id=i->>'id') into viewed;
 started:=started or viewed or s.id is not null or exists(select 1 from ml_lms.posts where enrollment_id=eid and item_id=i->>'id');
 if not coalesce((i->>'required')::bool,false) then continue;end if;r:=r+1;
 participates:=true;
 if i->>'type'='discussion' then
 participates:=exists(select 1 from ml_lms.posts where enrollment_id=eid and item_id=i->>'id' and parent_id is null) and (select count(*) from ml_lms.posts p join ml_lms.posts parent on parent.id=p.parent_id where p.enrollment_id=eid and p.item_id=i->>'id' and parent.enrollment_id<>eid)>=coalesce((i->>'replies')::int,0);
 end if;
 ok:=s.status='excused' or case when i->>'type'='lecture' then viewed else s.id is not null and s.status<>'draft' and participates end;
 if coalesce(ok,false) then sent:=sent+1;if i->>'type'='lecture' or s.status='excused' or (s.score is not null and s.posted) then d:=d+1;end if;end if;
 end loop;
 for g in select unnest(array['assignment','discussion','quiz']) loop
 select coalesce(sum(case when ss.posted and ss.status<>'draft' then ss.score else 0 end),0),coalesce(sum((it.value->>'points')::numeric),0) into num,den from jsonb_array_elements(c.data->'items') as it(value) left join ml_lms.submissions ss on ss.enrollment_id=eid and ss.item_id=it.value->>'id' where (it.value->>'published')::bool and it.value->>'type'=g and coalesce(ss.status,'')<>'excused';
 if den>0 then
 if coalesce((c.data->>'weighted')::bool,false) then total:=total+num/den*(c.data->'weights'->>g)::numeric;w:=w+(c.data->'weights'->>g)::numeric;else total:=total+num;w:=w+den;end if;end if;
 select coalesce(sum(ss.score),0),coalesce(sum((it.value->>'points')::numeric),0) into num,den from jsonb_array_elements(c.data->'items') as it(value) join ml_lms.submissions ss on ss.enrollment_id=eid and ss.item_id=it.value->>'id' where (it.value->>'published')::bool and it.value->>'type'=g and ss.status not in ('draft','excused') and ss.score is not null and ss.posted;
 if den>0 then
 if coalesce((c.data->>'weighted')::bool,false) then ctotal:=ctotal+num/den*(c.data->'weights'->>g)::numeric;current_w:=current_w+(c.data->'weights'->>g)::numeric;else ctotal:=ctotal+num;current_w:=current_w+den;end if;end if;
 end loop;
 fin:=case when w>0 then round(total/w*100,2) else null end;cur:=case when current_w>0 then round(ctotal/current_w*100,2) else null end;
 status:=case when r>0 and d=r then case when fin>=(c.data->>'pass')::numeric then 'completed' else 'not_passed' end when r>0 and sent=r then 'awaiting_grading' when started then 'in_progress' else 'not_started' end;
 return jsonb_build_object('status',status,'required',r,'done',d,'progress',case when r>0 then round(d::numeric/r*100) else 0 end,'current',cur,'final',fin);
end $$;
create or replace function ml_lms.refresh(cid uuid) returns void language plpgsql set search_path='' as $$
declare e ml_lms.enrollments;state jsonb;
begin for e in select * from ml_lms.enrollments where course_id=cid loop state:=ml_lms.summary(e.id);update ml_lms.enrollments set completed_at=case when state->>'status'='completed' then coalesce(completed_at,now()) else null end,updated_at=now() where id=e.id;end loop;end $$;

create or replace function ml_lms.gateway(p_key text,p_actor uuid,p_email text,p_admin bool,p_action text,p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare c ml_lms.courses;e ml_lms.enrollments;s ml_lms.submissions;a ml_lms.attempts;f ml_lms.files;cid uuid;eid uuid;i jsonb;q jsonb;v jsonb;clean jsonb;result jsonb;num numeric:=0;pending bool:=false;count_n int;n int;is_teacher bool:=false;parent ml_lms.posts;payload_answer jsonb;newid uuid;expected int;previous jsonb;
begin
 if p_key is null or length(p_key)<>64 or not exists(select 1 from ml_lms.gateway_keys where key_hash=encode(sha256(convert_to(p_key,'UTF8')),'hex')) or p_actor is null then raise exception 'Unauthorized' using errcode='42501';end if;
 if p_action='list' then
 return jsonb_build_object('instructor',p_admin,'courses',coalesce((select jsonb_agg(jsonb_build_object('id',cc.id,'name',cc.name,'title',cc.data->>'title','code',cc.data->>'code','description',cc.data->>'description','published',cc.data->'published','version',cc.version,'students',(select count(*) from ml_lms.enrollments where course_id=cc.id and active)) order by cc.updated_at desc) from ml_lms.courses cc where not cc.archived and ((p_admin and cc.owner=p_actor) or (coalesce((cc.data->>'published')::bool,false) and exists(select 1 from ml_lms.enrollments where course_id=cc.id and active and (user_id=p_actor or email=lower(p_email)))))), '[]'::jsonb));end if;
 if p_action='create' then
 if not p_admin then raise exception 'Instructor access required' using errcode='42501';end if;
 insert into ml_lms.courses(owner,name,data) values(p_actor,left(p_payload->>'name',200),p_payload->'data') returning * into c;return jsonb_build_object('id',c.id);end if;
 cid:=(p_payload->>'course')::uuid;select * into c from ml_lms.courses where id=cid and not archived for update;
 if c.id is null then raise exception 'Class not found' using errcode='P0002';end if;
 is_teacher:=p_admin and c.owner=p_actor;
 if is_teacher and p_payload->>'preview' is not null then eid:=(p_payload->>'preview')::uuid;select * into e from ml_lms.enrollments where id=eid and course_id=cid and active;
 elsif not is_teacher then
 select * into e from ml_lms.enrollments where course_id=cid and active and (user_id=p_actor or (user_id is null and email=lower(p_email)));
 if e.id is null or not coalesce((c.data->>'published')::bool,false) then raise exception 'You are not enrolled in this class' using errcode='42501';end if;
 if e.user_id is null then update ml_lms.enrollments set user_id=p_actor where id=e.id;end if;eid:=e.id;
 end if;
 if p_action in ('save','enroll','enrollment','grade','archive') then
 if not is_teacher or eid is not null then raise exception 'Instructor access required' using errcode='42501';end if;
 if p_action='save' then
 if (p_payload->>'version')::int is distinct from c.version then raise exception 'Course changed in another tab. Reload before saving.' using errcode='40001';end if;
 update ml_lms.courses set data=p_payload->'data',name=left(p_payload->>'name',200),version=version+1,updated_at=now() where id=cid returning * into c;
 elsif p_action='enroll' then
 if (select count(*) from ml_lms.enrollments where course_id=cid and active)>=20 then raise exception 'This class already has 20 active students';end if;
 if length(trim(p_payload->>'name'))<1 or (p_payload->>'email')!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Enter a student name and valid email';end if;
 insert into ml_lms.enrollments(course_id,name,email,external_id) values(cid,left(trim(p_payload->>'name'),200),lower(trim(p_payload->>'email')),left(coalesce(p_payload->>'external_id',''),200));
 elsif p_action='enrollment' then
 select * into e from ml_lms.enrollments where id=(p_payload->>'enrollment')::uuid and course_id=cid;
 if e.id is null then raise exception 'Student not found';end if;
 if coalesce((p_payload->>'active')::bool,true) and not e.active and (select count(*) from ml_lms.enrollments where course_id=cid and active)>=20 then raise exception 'This class already has 20 active students';end if;
 update ml_lms.enrollments set active=coalesce((p_payload->>'active')::bool,true),external_id=coalesce(p_payload->>'external_id',external_id),updated_at=now() where id=e.id;eid:=null;
 elsif p_action='grade' then
 select * into e from ml_lms.enrollments where id=(p_payload->>'enrollment')::uuid and course_id=cid;
 if e.id is null then raise exception 'Student not found';end if;
 select value into i from jsonb_array_elements(c.data->'items') where value->>'id'=p_payload->>'item';
 if i is null or i->>'type'='lecture' then raise exception 'Invalid grading activity';end if;
 select * into s from ml_lms.submissions where enrollment_id=e.id and item_id=i->>'id' for update;
 if s.id is null and p_payload->>'status'<>'excused' then raise exception 'No submitted work to grade';end if;
 if s.id is not null and (p_payload->>'version')::int is distinct from s.version then raise exception 'Submission changed. Reload before grading.' using errcode='40001';end if;
 if s.status='draft' and p_payload->>'status'<>'excused' then raise exception 'Work has not been submitted';end if;
 num:=(p_payload->>'score')::numeric;
 if p_payload->>'status'<>'excused' and (num is null or num<0 or num>(i->>'points')::numeric) then raise exception 'Score is outside the activity point range';end if;
 previous:=to_jsonb(s)-'answer';
 insert into ml_lms.submissions(enrollment_id,item_id,status,score,posted,feedback,rubric) values(e.id,i->>'id',case when p_payload->>'status'='excused' then 'excused' else 'graded' end,num,coalesce((p_payload->>'posted')::bool,false),left(coalesce(p_payload->>'feedback',''),10000),coalesce(p_payload->'rubric','[]')) on conflict(enrollment_id,item_id) do update set status=excluded.status,score=excluded.score,posted=excluded.posted,feedback=excluded.feedback,rubric=excluded.rubric,version=ml_lms.submissions.version+1,updated_at=now();
 insert into ml_lms.audit(course_id,actor,action,detail) values(cid,p_actor,'grade',jsonb_build_object('enrollment',e.id,'item',i->>'id','previous',previous,'score',num,'posted',p_payload->'posted'));
 eid:=null;
 elsif p_action='archive' then update ml_lms.courses set archived=true where id=cid;return '{}'::jsonb;
 end if;
 elsif p_action not in ('get','file-get') then
 if e.id is null then raise exception 'Choose a student preview or sign in as an enrolled student';end if;
 select value into i from jsonb_array_elements(c.data->'items') where value->>'id'=p_payload->>'item' and (value->>'published')::bool;
 if i is null then raise exception 'Activity is unavailable';end if;
 -- Enforce preceding required activities when the module requests sequential completion.
 if exists(select 1 from jsonb_array_elements(c.data->'modules') m where m->>'id'=i->>'module' and coalesce((m->>'sequential')::bool,false)) then
 for previous in select value from jsonb_array_elements(c.data->'items') with ordinality x(value,ord) where ord<(select ord from jsonb_array_elements(c.data->'items') with ordinality z(value,ord) where value->>'id'=i->>'id') and value->>'module'=i->>'module' and (value->>'published')::bool and (value->>'required')::bool loop
 if previous->>'type'='lecture' then
 if not exists(select 1 from ml_lms.views where enrollment_id=e.id and item_id=previous->>'id') then raise exception 'Complete the preceding module activity first';end if;
 elsif not exists(select 1 from ml_lms.submissions where enrollment_id=e.id and item_id=previous->>'id' and status<>'draft') then raise exception 'Submit the preceding module activity first';end if;
 end loop;end if;
 if p_action='view' then
 if i->>'type'<>'lecture' then raise exception 'Only lectures can be marked viewed';end if;
 insert into ml_lms.views(enrollment_id,item_id) values(e.id,i->>'id') on conflict do nothing;
 elsif p_action='post' then
 if i->>'type'<>'discussion' or length(trim(p_payload->>'body')) not between 1 and 10000 then raise exception 'Enter a discussion post of 1–10,000 characters';end if;
 if p_payload->>'parent' is not null then select * into parent from ml_lms.posts where id=(p_payload->>'parent')::uuid and item_id=i->>'id' and enrollment_id in(select id from ml_lms.enrollments where course_id=cid);if parent.id is null then raise exception 'Reply target not found';end if;
 if coalesce((i->>'postFirst')::bool,false) and not exists(select 1 from ml_lms.posts where enrollment_id=e.id and item_id=i->>'id' and parent_id is null) then raise exception 'Write your initial post before replying';end if;end if;
 insert into ml_lms.posts(enrollment_id,item_id,parent_id,body) values(e.id,i->>'id',parent.id,trim(p_payload->>'body'));
 insert into ml_lms.submissions(enrollment_id,item_id,status,submitted_at) values(e.id,i->>'id','submitted',now()) on conflict(enrollment_id,item_id) do update set version=ml_lms.submissions.version+1,updated_at=now();
 elsif p_action='file-add' then
 if length(p_payload->>'data')>2800000 or (p_payload->>'mime') not in ('application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','text/plain','image/png','image/jpeg') then raise exception 'Upload a PDF, DOCX, TXT, PNG or JPG no larger than 2 MB';end if;
 insert into ml_lms.files(course_id,enrollment_id,item_id,name,mime,data) values(cid,e.id,i->>'id',left(p_payload->>'name',200),p_payload->>'mime',p_payload->>'data') returning id into newid;return jsonb_build_object('id',newid);
 elsif p_action in ('draft','submit') then
 if i->>'type'<>'assignment' then raise exception 'Use the appropriate activity submission';end if;
 payload_answer:=p_payload->'answer';if payload_answer is null or pg_column_size(payload_answer)>200000 then raise exception 'Submission is too large';end if;
 if payload_answer->>'file' is not null and not exists(select 1 from ml_lms.files where id=(payload_answer->>'file')::uuid and enrollment_id=e.id and item_id=i->>'id') then raise exception 'File does not belong to this submission';end if;
 if p_action='submit' and not (coalesce(length(trim(payload_answer->>'text')),0)>0 or payload_answer->>'file' is not null or (jsonb_typeof(payload_answer->'fields')='array' and jsonb_array_length(payload_answer->'fields')=jsonb_array_length(i->'fields') and not exists(select 1 from jsonb_array_elements_text(payload_answer->'fields') as field_value(val) where length(trim(field_value.val))=0))) then raise exception 'Complete your response or attach a file before submitting';end if;
 select * into s from ml_lms.submissions where enrollment_id=e.id and item_id=i->>'id' for update;
 if s.id is not null and (p_payload->>'version')::int is distinct from s.version then raise exception 'Your submission changed in another tab. Reload before saving.' using errcode='40001';end if;
 if s.status='excused' then raise exception 'This activity has been excused';end if;
 if p_action='draft' and s.status in ('submitted','graded') then raise exception 'Use Resubmit to send a revised submission';end if;
 insert into ml_lms.submissions(enrollment_id,item_id,answer,status,submitted_at) values(e.id,i->>'id',payload_answer,case when p_action='submit' then 'submitted' else 'draft' end,case when p_action='submit' then now() end) on conflict(enrollment_id,item_id) do update set answer=excluded.answer,status=excluded.status,score=null,posted=false,feedback='',rubric='[]',submitted_at=excluded.submitted_at,attempt=case when ml_lms.submissions.status in ('submitted','graded') then ml_lms.submissions.attempt+1 else ml_lms.submissions.attempt end,version=ml_lms.submissions.version+1,updated_at=now();
 elsif p_action='quiz-start' then
 if i->>'type'<>'quiz' then raise exception 'Not a quiz';end if;
 select * into a from ml_lms.attempts where enrollment_id=e.id and item_id=i->>'id' and submitted_at is null order by number desc limit 1 for update;
 if a.id is null then select coalesce(max(number),0)+1 into n from ml_lms.attempts where enrollment_id=e.id and item_id=i->>'id';if n>(i->>'attempts')::int then raise exception 'No quiz attempts remaining';end if;
 insert into ml_lms.attempts(enrollment_id,item_id,number,snapshot,deadline) values(e.id,i->>'id',n,i,case when (i->>'timeLimit')::numeric>0 then now()+((i->>'timeLimit')::numeric*interval '1 minute') end) returning * into a;end if;
 elsif p_action in ('quiz-save','quiz-submit') then
 select * into a from ml_lms.attempts where id=(p_payload->>'attempt')::uuid and enrollment_id=e.id and item_id=i->>'id' for update;
 if a.id is null then raise exception 'Quiz attempt not found';end if;
 if a.submitted_at is null then
 payload_answer:=p_payload->'answer';if jsonb_typeof(payload_answer)<>'object' or pg_column_size(payload_answer)>200000 then raise exception 'Invalid quiz response';end if;
 if a.deadline is not null and now()>a.deadline then payload_answer:=a.answer;end if;
 update ml_lms.attempts set answer=payload_answer where id=a.id;
 if p_action='quiz-submit' or (a.deadline is not null and now()>a.deadline) then
 for q in select value from jsonb_array_elements(a.snapshot->'questions') loop
 v:=payload_answer->(q->>'id');if q->>'type'='essay' then pending:=true;
 elsif q->>'type'='short' then if exists(select 1 from unnest(string_to_array(q->>'correct','|')) x where lower(trim(x))=lower(trim(v#>>'{}'))) then num:=num+(q->>'points')::numeric;end if;
 elsif q->>'correct'=v#>>'{}' then num:=num+(q->>'points')::numeric;end if;end loop;
 update ml_lms.attempts set score=num,submitted_at=now() where id=a.id;
 insert into ml_lms.submissions(enrollment_id,item_id,status,answer,score,posted,attempt,submitted_at) values(e.id,i->>'id',case when pending then 'submitted' else 'graded' end,jsonb_build_object('responses',payload_answer,'auto_score',num,'snapshot',a.snapshot),case when pending then null else num end,not pending,a.number,now()) on conflict(enrollment_id,item_id) do update set status=excluded.status,answer=excluded.answer,score=excluded.score,posted=excluded.posted,attempt=excluded.attempt,submitted_at=excluded.submitted_at,feedback='',rubric='[]',version=ml_lms.submissions.version+1,updated_at=now();end if;end if;
 else raise exception 'Unknown action';end if;
 end if;
 if p_action='file-get' then
 select * into f from ml_lms.files where id=(p_payload->>'file')::uuid and course_id=cid and (is_teacher or enrollment_id=eid);if f.id is null then raise exception 'File not found' using errcode='P0002';end if;return to_jsonb(f)-'enrollment_id';end if;
 if p_action<>'get' then perform ml_lms.refresh(cid);end if;
 clean:=c.data;
 if not is_teacher or eid is not null then
 select coalesce(jsonb_agg(value),'[]'::jsonb) into result from jsonb_array_elements(coalesce(c.data->'announcements','[]'::jsonb)) where coalesce((value->>'published')::bool,true);
 clean:=jsonb_set(clean,'{announcements}',result);
 select coalesce(jsonb_agg(case when value->>'type'='quiz' then (value-'questions')||jsonb_build_object('question_count',jsonb_array_length(value->'questions')) else value end),'[]') into result from jsonb_array_elements(c.data->'items') where (value->>'published')::bool;clean:=jsonb_set(clean,'{items}',result);
 end if;
 return jsonb_build_object('course',jsonb_build_object('id',c.id,'name',c.name,'data',clean,'version',c.version),'instructor',is_teacher and eid is null,'me',eid,
 'enrollments',coalesce((select jsonb_agg(to_jsonb(en)||jsonb_build_object('summary',ml_lms.summary(en.id))) from ml_lms.enrollments en where course_id=cid and (is_teacher and eid is null or en.id=eid)),'[]'),
 'submissions',coalesce((select jsonb_agg(case when is_teacher and eid is null then to_jsonb(ss) else to_jsonb(ss)-'score'-'feedback'-'rubric'||jsonb_build_object('score',case when ss.posted then ss.score end,'feedback',case when ss.posted then ss.feedback else '' end,'rubric',case when ss.posted then ss.rubric else '[]'::jsonb end,'answer',ss.answer-'snapshot') end) from ml_lms.submissions ss join ml_lms.enrollments en on en.id=ss.enrollment_id where en.course_id=cid and (is_teacher and eid is null or en.id=eid)),'[]'),
 'views',coalesce((select jsonb_agg(to_jsonb(vv)) from ml_lms.views vv join ml_lms.enrollments en on en.id=vv.enrollment_id where en.course_id=cid and (is_teacher and eid is null or en.id=eid)),'[]'),
 'posts',coalesce((select jsonb_agg(to_jsonb(pp)||jsonb_build_object('name',en.name) order by pp.created_at) from ml_lms.posts pp join ml_lms.enrollments en on en.id=pp.enrollment_id where en.course_id=cid and (is_teacher and eid is null or not exists(select 1 from jsonb_array_elements(c.data->'items') ii where ii->>'id'=pp.item_id and coalesce((ii->>'postFirst')::bool,false) and not exists(select 1 from ml_lms.posts own where own.enrollment_id=eid and own.item_id=pp.item_id and own.parent_id is null))) and exists(select 1 from jsonb_array_elements(c.data->'items') ii where ii->>'id'=pp.item_id and (is_teacher and eid is null or (ii->>'published')::bool))),'[]'),
 'attempts',coalesce((select jsonb_agg(to_jsonb(aa)-'snapshot'||jsonb_build_object('questions',(select jsonb_agg(qq-'correct') from jsonb_array_elements(aa.snapshot->'questions') qq))) from ml_lms.attempts aa join ml_lms.enrollments en on en.id=aa.enrollment_id where en.course_id=cid and (is_teacher and eid is null or en.id=eid)),'[]'),
 'files',coalesce((select jsonb_agg(to_jsonb(ff)-'data') from ml_lms.files ff where ff.course_id=cid and (is_teacher and eid is null or ff.enrollment_id=eid)),'[]'),
 'audit',case when is_teacher and eid is null then coalesce((select jsonb_agg(to_jsonb(au)) from (select * from ml_lms.audit where course_id=cid order by created_at desc limit 50) au),'[]') else '[]'::jsonb end);
end $$;
revoke all on all functions in schema ml_lms from public,anon,authenticated;
grant usage on schema ml_lms to anon;
grant execute on function ml_lms.gateway(text,uuid,text,bool,text,jsonb) to anon;
create or replace function public.ml_lms_rpc(p_key text,p_actor uuid,p_email text,p_admin bool,p_action text,p_payload jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$select ml_lms.gateway(p_key,p_actor,p_email,p_admin,p_action,p_payload);$$;
revoke all on function public.ml_lms_rpc(text,uuid,text,bool,text,jsonb) from public,anon,authenticated;
grant execute on function public.ml_lms_rpc(text,uuid,text,bool,text,jsonb) to anon;
notify pgrst,'reload schema';
