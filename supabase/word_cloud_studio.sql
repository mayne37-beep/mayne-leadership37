-- Word Cloud Studio has isolated sessions; the existing classroom tools are unchanged.
-- Anonymous students use narrowly scoped RPCs. Only the teacher's random capability
-- can read responses or change a session. Capability hashes never leave the database.
begin;
create table public.wc_sessions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[0-9]{6}$'),
  host_hash text not null,
  question text not null check (char_length(question) between 1 and 220),
  info text not null default '' check (char_length(info) <= 500),
  response_limit integer not null default 5 check (response_limit between 1 and 10),
  status text not null default 'open' check (status in ('open','paused','ended')),
  epoch integer not null default 1,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days')
);
create table public.wc_responses (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.wc_sessions(id) on delete cascade,
  epoch integer not null,
  participant_id uuid not null,
  words text[] not null,
  request_ids uuid[] not null,
  created_at timestamptz not null default now(),
  unique(session_id, epoch, participant_id),
  check (cardinality(words) between 1 and 10)
);
alter table public.wc_sessions enable row level security;
alter table public.wc_responses enable row level security;
revoke all on public.wc_sessions, public.wc_responses from public, anon, authenticated;

create function public.wc_create_session(p_question text, p_response_limit integer, p_info text, p_host_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s public.wc_sessions; i integer;
begin
  if p_host_token is null or p_host_token !~ '^[a-f0-9]{64}$' then raise exception 'Invalid teacher key'; end if;
  if p_question is null or char_length(trim(p_question)) not between 1 and 220 then raise exception 'Enter a question (up to 220 characters).'; end if;
  if p_response_limit is null or p_response_limit not between 1 and 10 then raise exception 'Choose 1 to 10 responses.'; end if;
  if char_length(coalesce(p_info,'')) > 500 then raise exception 'Instructions are too long.'; end if;
  for i in 1..20 loop
    begin
      insert into public.wc_sessions(code,host_hash,question,response_limit,info)
      values((100000+floor(random()*900000))::integer::text,encode(sha256(convert_to(p_host_token,'UTF8')),'hex'),trim(p_question),p_response_limit,coalesce(p_info,'')) returning * into s;
      exit;
    exception when unique_violation then if i=20 then raise exception 'Please try creating the session again.'; end if;
    end;
  end loop;
  return jsonb_build_object('id',s.id,'code',s.code,'question',s.question,'info',s.info,'response_limit',s.response_limit,'status',s.status,'epoch',s.epoch,'expires_at',s.expires_at);
end $$;

create function public.wc_session_info(p_code text, p_participant_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s public.wc_sessions; used integer;
begin
  select * into s from public.wc_sessions where code=p_code;
  if not found then raise exception 'Session not found. Check your six-digit code.'; end if;
  select cardinality(words) into used from public.wc_responses where session_id=s.id and epoch=s.epoch and participant_id=p_participant_id;
  return jsonb_build_object('id',s.id,'code',s.code,'question',s.question,'info',s.info,'response_limit',s.response_limit,'status',case when s.expires_at <= now() then 'expired' else s.status end,'epoch',s.epoch,'used',coalesce(used,0));
end $$;

create function public.wc_host_snapshot(p_session_id uuid, p_host_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s public.wc_sessions; responses jsonb;
begin
  select * into s from public.wc_sessions where id=p_session_id and host_hash=encode(sha256(convert_to(p_host_token,'UTF8')),'hex');
  if not found then raise exception 'This browser does not have the teacher key for this session.'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'at',r.created_at,'words',r.words) order by r.created_at,r.id),'[]'::jsonb) into responses from public.wc_responses r where r.session_id=s.id and r.epoch=s.epoch;
  return jsonb_build_object('id',s.id,'code',s.code,'question',s.question,'info',s.info,'response_limit',s.response_limit,'status',case when s.expires_at <= now() then 'expired' else s.status end,'epoch',s.epoch,'expires_at',s.expires_at,'responses',responses);
end $$;

create function public.wc_control_session(p_session_id uuid, p_host_token text, p_action text default 'update', p_question text default null, p_response_limit integer default null, p_info text default null, p_status text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s public.wc_sessions;
begin
  select * into s from public.wc_sessions where id=p_session_id and host_hash=encode(sha256(convert_to(p_host_token,'UTF8')),'hex') for update;
  if not found then raise exception 'Teacher key is required.'; end if;
  if p_action not in ('update','clear') or p_action is null then raise exception 'Unknown session action.'; end if;
  if p_question is not null and char_length(trim(p_question)) not between 1 and 220 then raise exception 'Enter a question (up to 220 characters).'; end if;
  if p_response_limit is not null and p_response_limit not between 1 and 10 then raise exception 'Choose 1 to 10 responses.'; end if;
  if p_info is not null and char_length(p_info)>500 then raise exception 'Instructions are too long.'; end if;
  if p_status is not null and p_status not in ('open','paused','ended') then raise exception 'Unknown session status.'; end if;
  if p_status='open' and (s.status='ended' or s.expires_at<=now()) then raise exception 'Start a new session to accept responses.'; end if;
  if p_action='clear' then
    delete from public.wc_responses where session_id=s.id;
    update public.wc_sessions set epoch=epoch+1 where id=s.id;
  end if;
  update public.wc_sessions set question=coalesce(trim(p_question),question),response_limit=coalesce(p_response_limit,response_limit),info=coalesce(p_info,info),status=coalesce(p_status,status) where id=s.id;
  return public.wc_host_snapshot(p_session_id,p_host_token);
end $$;

create function public.wc_submit_response(p_code text, p_participant_id uuid, p_request_id uuid, p_epoch integer, p_words text[])
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s public.wc_sessions; r public.wc_responses; clean text[]; used integer;
begin
  if p_participant_id is null or p_request_id is null then raise exception 'Please reload this page and try again.'; end if;
  select * into s from public.wc_sessions where code=p_code for update;
  if not found then raise exception 'Session not found.'; end if;
  if p_epoch is null or p_epoch<>s.epoch then raise exception 'Your teacher has reset this question. Refresh before submitting.'; end if;
  select * into r from public.wc_responses where session_id=s.id and epoch=s.epoch and participant_id=p_participant_id for update;
  if p_request_id=any(r.request_ids) then return public.wc_session_info(p_code,p_participant_id); end if;
  if s.expires_at<=now() or s.status='ended' then raise exception 'This session has ended.'; end if;
  if s.status<>'open' then raise exception 'Responses are paused. Wait for your teacher to resume.'; end if;
  if p_words is null or cardinality(p_words) not between 1 and 10 then raise exception 'Enter at least one word or phrase.'; end if;
  select array_agg(trim(regexp_replace(w,'\s+',' ','g')) order by n) into clean from unnest(p_words) with ordinality as t(w,n);
  if exists(select 1 from unnest(clean) w where w is null or char_length(w) not between 1 and 65) then raise exception 'Each response must contain 1 to 65 characters.'; end if;
  used:=coalesce(cardinality(r.words),0);
  if used+cardinality(clean)>s.response_limit then raise exception 'You have reached the response limit for this question.'; end if;
  if r.id is null then
    if (select count(*) from public.wc_responses where session_id=s.id and epoch=s.epoch)>=5000 then raise exception 'This session has reached its participant limit.'; end if;
    insert into public.wc_responses(session_id,epoch,participant_id,words,request_ids) values(s.id,s.epoch,p_participant_id,clean,array[p_request_id]);
  else
    update public.wc_responses set words=words||clean,request_ids=request_ids||p_request_id where id=r.id;
  end if;
  return public.wc_session_info(p_code,p_participant_id);
end $$;

revoke all on function public.wc_create_session(text,integer,text,text),public.wc_session_info(text,uuid),public.wc_host_snapshot(uuid,text),public.wc_control_session(uuid,text,text,text,integer,text,text),public.wc_submit_response(text,uuid,uuid,integer,text[]) from public;
grant execute on function public.wc_create_session(text,integer,text,text),public.wc_session_info(text,uuid),public.wc_host_snapshot(uuid,text),public.wc_control_session(uuid,text,text,text,integer,text,text),public.wc_submit_response(text,uuid,uuid,integer,text[]) to anon,authenticated;
notify pgrst,'reload schema';
commit;
