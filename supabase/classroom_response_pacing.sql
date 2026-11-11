-- Existing sessions start in instructor-paced mode. Older RPC signatures stay available.
alter table crs_private.sessions
  add column pacing text not null default 'instructor'
  check (pacing in ('instructor','self'));


CREATE OR REPLACE FUNCTION crs_private.host_packet(v crs_private.sessions)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select jsonb_build_object('id',v.id,'code',v.code,'status',case when v.expires_at<=now() then 'expired' else v.status end,'expires_at',v.expires_at,'revision',v.revision,'active_slide_id',v.active_slide,'pacing',v.pacing,'epochs',v.epochs,'timers',v.timers,'server_now',clock_timestamp(),
    'responses',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'slide_id',r.slide_id,'epoch',r.epoch,'kind',r.kind,'answer',r.answer,'at',r.created_at,'updated_at',r.updated_at) order by r.created_at,r.id)
      from crs_private.responses r where r.session_id=v.id and r.epoch=coalesce((v.epochs->>r.slide_id)::integer,1) and exists(select 1 from jsonb_array_elements(v.deck) s where s->>'id'=r.slide_id)),'[]'::jsonb));
$function$
;

create function crs_private.student_packet(
  v crs_private.sessions, p_participant uuid, p_token text,
  p_known_revision integer, p_slide_id text
) returns jsonb language plpgsql stable set search_path='' as $$
declare
  s jsonb;
  selected_slide text;
  answer jsonb;
  questions jsonb;
  ep integer;
  st text;
  verified boolean := false;
begin
  if v.pacing='self' then
    select value into s from jsonb_array_elements(v.deck)
      where value->>'id'=p_slide_id and crs_private.slide_ready(value);
    if s is null then
      select value into s from jsonb_array_elements(v.deck)
        where crs_private.slide_ready(value) limit 1;
    end if;
  end if;
  if s is null then
    select value into s from jsonb_array_elements(v.deck)
      where value->>'id'=v.active_slide;
  end if;
  selected_slide := s->>'id';
  ep := coalesce((v.epochs->>selected_slide)::integer,1);
  st := case when v.expires_at<=now() then 'expired'
    when v.status='ended' then 'ended'
    when v.status='paused' or not (s->>'accepting')::boolean
      or crs_private.timer_closed(v,selected_slide) then 'paused'
    else 'open' end;
  if p_participant is not null and p_token ~ '^[a-f0-9]{64}$' then
    select exists(select 1 from crs_private.participants p
      where p.session_id=v.id and p.id=p_participant
        and p.token_hash=crs_private.token_hash(p_token)) into verified;
  end if;
  if verified then
    select r.answer into answer from crs_private.responses r
      where r.session_id=v.id and r.slide_id=selected_slide
        and r.epoch=ep and r.participant_id=p_participant;
  end if;
  if v.pacing='self' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id',q.value->>'id','question',q.value->>'question','type',q.value->>'type',
      'answered',r.id is not null) order by q.position),'[]'::jsonb)
    into questions
    from jsonb_array_elements(v.deck) with ordinality q(value,position)
    left join crs_private.responses r on verified and r.session_id=v.id
      and r.participant_id=p_participant and r.slide_id=q.value->>'id'
      and r.epoch=coalesce((v.epochs->>(q.value->>'id'))::integer,1)
    where crs_private.slide_ready(q.value);
  end if;
  return jsonb_build_object(
    'id',v.id,'code',v.code,'status',st,'expires_at',v.expires_at,
    'revision',v.revision,'pacing',v.pacing,'active_slide_id',selected_slide,
    'presenter_slide_id',v.active_slide,'slides',questions,'epoch',ep,
    'ready',crs_private.slide_ready(s),
    'slide',case when p_known_revision is distinct from v.revision then s else null end,
    'my_answer',answer,'timer',v.timers->selected_slide,'server_now',clock_timestamp());
end; $$;

-- Older student pages continue following the presenter.
create or replace function crs_private.student_packet(
  v crs_private.sessions, p_participant uuid, p_token text, p_known_revision integer
) returns jsonb language sql stable set search_path='' as $$
  select crs_private.student_packet(v,p_participant,p_token,p_known_revision,v.active_slide);
$$;

create function crs_private.student_snapshot(
  p_code text,p_participant_id uuid,p_participant_token text,
  p_known_revision integer,p_slide_id text
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v crs_private.sessions;
begin
  if p_code is null or p_code !~ '^[0-9]{7}$' then
    raise exception 'Enter a seven-digit classroom session code.';
  end if;
  select * into v from crs_private.sessions where code=p_code;
  if not found then raise exception 'That session was not found. Check the code with your teacher.'; end if;
  return crs_private.student_packet(v,p_participant_id,p_participant_token,p_known_revision,p_slide_id);
end; $$;


create function crs_private.create_session(p_deck jsonb,p_active_slide text,p_host_token text,p_pacing text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v crs_private.sessions; code text; token_hash text:=crs_private.token_hash(p_host_token); s jsonb;
begin
  if p_pacing is null or p_pacing not in ('instructor','self') then raise exception 'Choose instructor-paced or self-paced responses.'; end if;
  perform crs_private.validate_deck(p_deck,p_active_slide);
  select value into s from jsonb_array_elements(p_deck)
    where (p_pacing='self' or value->>'id'=p_active_slide)
      and crs_private.slide_ready(value) limit 1;
  if s is null then raise exception 'Finish a question before starting a live session.'; end if;
  if (select count(*) from crs_private.sessions where created_at>now()-interval '1 day')>=1000 then raise exception 'Session creation limit reached. Try again later.'; end if;
  for i in 1..20 loop
    code:=(1000000+floor(random()*9000000))::integer::text;
    begin
      insert into crs_private.sessions(code,host_hash,deck,active_slide,pacing) values(code,token_hash,p_deck,p_active_slide,p_pacing) returning * into v;
      return crs_private.host_packet(v);
    exception when unique_violation then null; end;
  end loop;
  raise exception 'Could not create a session. Please try again.';
end; $$;

CREATE FUNCTION crs_private.control_session(p_session_id uuid, p_host_token text, p_deck jsonb, p_active_slide text, p_status text, p_action text, p_pacing text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v crs_private.sessions; next_deck jsonb; active text; s jsonb; old_s jsonb; changed boolean:=false; ep integer;next_pacing text;
begin
  select * into v from crs_private.sessions where id=p_session_id and host_hash=crs_private.token_hash(p_host_token) for update;
  if not found then raise exception 'Teacher session is unavailable in this browser.'; end if;
  if v.status='ended' or v.expires_at<=now() then raise exception 'This session has ended. Start a new session.'; end if;
  next_pacing:=coalesce(p_pacing,v.pacing);
  if next_pacing not in ('instructor','self') then raise exception 'Choose instructor-paced or self-paced responses.'; end if;
  next_deck:=coalesce(p_deck,v.deck);active:=coalesce(p_active_slide,v.active_slide);
  perform crs_private.validate_deck(next_deck,active);
  if p_status is not null and p_status not in ('open','paused','ended') then raise exception 'Invalid session status.'; end if;
  if p_action is not null and p_action not in ('clear') then raise exception 'Invalid session action.'; end if;
  if p_action='clear' then
    v.timers:=v.timers-active;
    ep:=coalesce((v.epochs->>active)::integer,1)+1;v.epochs:=jsonb_set(v.epochs,array[active],to_jsonb(ep),true);changed:=true;
  end if;
  for s in select value from jsonb_array_elements(next_deck) loop
    select value into old_s from jsonb_array_elements(v.deck) where value->>'id'=s->>'id';
    if old_s is not null and crs_private.response_schema(old_s) is distinct from crs_private.response_schema(s) and exists(select 1 from crs_private.responses r where r.session_id=v.id and r.slide_id=s->>'id' and r.epoch=coalesce((v.epochs->>(s->>'id'))::integer,1)) then raise exception 'Clear this slide’s results before changing its question type, choices, scale, axes, or image.'; end if;
  end loop;
  changed:=changed or next_deck is distinct from v.deck or next_pacing is distinct from v.pacing or (next_pacing='instructor' and active is distinct from v.active_slide) or (p_status is not null and p_status is distinct from v.status);
  update crs_private.sessions set deck=next_deck,active_slide=active,pacing=next_pacing,status=coalesce(p_status,v.status),epochs=v.epochs,timers=v.timers,revision=v.revision+case when changed then 1 else 0 end where id=v.id returning * into v;
  return crs_private.host_packet(v);
end; $function$
;

create or replace function crs_private.control_session(
  p_session_id uuid,p_host_token text,p_deck jsonb,p_active_slide text,p_status text,p_action text
) returns jsonb language sql security invoker set search_path='' as $$
  select crs_private.control_session(p_session_id,p_host_token,p_deck,p_active_slide,p_status,p_action,null);
$$;


CREATE OR REPLACE FUNCTION crs_private.submit_response(p_code text, p_participant_id uuid, p_participant_token text, p_request_id uuid, p_slide_id text, p_revision integer, p_epoch integer, p_answer jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v crs_private.sessions; s jsonb; a jsonb; token_hash text:=crs_private.token_hash(p_participant_token); existing crs_private.responses; stored_hash text; ep integer;
begin
  if p_participant_id is null or p_request_id is null then raise exception 'Reload the page and try again.'; end if;
  select * into v from crs_private.sessions where code=p_code for update;
  if not found then raise exception 'Session not found.'; end if;
  select p.token_hash into stored_hash from crs_private.participants p where p.session_id=v.id and p.id=p_participant_id;
  if stored_hash is not null and stored_hash<>token_hash then raise exception 'This response belongs to a different browser.'; end if;
  select * into existing from crs_private.responses r where r.session_id=v.id and r.slide_id=p_slide_id and r.epoch=p_epoch and r.participant_id=p_participant_id;
  if existing.request_id=p_request_id and stored_hash=token_hash then return crs_private.student_packet(v,p_participant_id,p_participant_token,null,p_slide_id)||jsonb_build_object('ack_slide_id',p_slide_id); end if;
  if v.status<>'open' or v.expires_at<=now() then raise exception 'Responses are paused or this session has ended.'; end if;
  if (v.pacing='instructor' and p_slide_id is distinct from v.active_slide) or p_revision is distinct from v.revision then raise exception 'Your teacher changed the question. Refresh and submit to the current slide.'; end if;
  ep:=coalesce((v.epochs->>p_slide_id)::integer,1);if p_epoch is distinct from ep then raise exception 'Your teacher cleared the results. Refresh before responding again.'; end if;
  select value into s from jsonb_array_elements(v.deck) where value->>'id'=p_slide_id;
  if s is null then raise exception 'This question is unavailable. Refresh before responding again.'; end if;
  if not (s->>'accepting')::boolean or not crs_private.slide_ready(s) then raise exception 'Your teacher is preparing this question. Please wait.'; end if;
  if crs_private.timer_closed(v,p_slide_id) then raise exception 'Time is up. Responses for this question are closed.';end if;
  a:=crs_private.validate_answer(s,p_answer);
  if existing.updated_at>clock_timestamp()-interval '750 milliseconds' then raise exception 'Please wait a moment before updating your answer.'; end if;
  if stored_hash is null then
    if (select count(*) from crs_private.participants where session_id=v.id)>=2000 then raise exception 'This session has reached its participant limit.'; end if;
    insert into crs_private.participants(session_id,id,token_hash) values(v.id,p_participant_id,token_hash);
  end if;
  if existing.id is null and (select count(*) from crs_private.responses where session_id=v.id)>=20000 then raise exception 'This session has reached its response limit.'; end if;
  insert into crs_private.responses(session_id,slide_id,epoch,participant_id,kind,answer,request_id) values(v.id,p_slide_id,ep,p_participant_id,s->>'type',a,p_request_id)
  on conflict(session_id,slide_id,epoch,participant_id) do update set answer=excluded.answer,request_id=excluded.request_id,updated_at=clock_timestamp();
  return crs_private.student_packet(v,p_participant_id,p_participant_token,null,p_slide_id)||jsonb_build_object('ack_slide_id',p_slide_id);
end; $function$
;

revoke all on function crs_private.student_packet(crs_private.sessions,uuid,text,integer,text),
  crs_private.student_snapshot(text,uuid,text,integer,text),
  crs_private.create_session(jsonb,text,text,text),
  crs_private.control_session(uuid,text,jsonb,text,text,text,text) from public,anon,authenticated;
grant execute on function crs_private.student_snapshot(text,uuid,text,integer,text),
  crs_private.create_session(jsonb,text,text,text),
  crs_private.control_session(uuid,text,jsonb,text,text,text,text) to anon,authenticated;

-- Required extra parameters distinguish these overloads from existing clients.
create function public.crs_create_session(
  p_deck jsonb,p_active_slide text,p_host_token text,p_pacing text
) returns jsonb language sql security invoker set search_path='' as $$
  select crs_private.create_session(p_deck,p_active_slide,p_host_token,p_pacing);
$$;
create function public.crs_control_session(
  p_session_id uuid,p_host_token text,p_deck jsonb,p_active_slide text,
  p_status text,p_action text,p_pacing text
) returns jsonb language sql security invoker set search_path='' as $$
  select crs_private.control_session(p_session_id,p_host_token,p_deck,p_active_slide,p_status,p_action,p_pacing);
$$;
create function public.crs_student_snapshot(
  p_code text,p_participant_id uuid,p_participant_token text,
  p_known_revision integer,p_slide_id text
) returns jsonb language sql stable security invoker set search_path='' as $$
  select crs_private.student_snapshot(p_code,p_participant_id,p_participant_token,p_known_revision,p_slide_id);
$$;
revoke all on function public.crs_create_session(jsonb,text,text,text),
  public.crs_control_session(uuid,text,jsonb,text,text,text,text),
  public.crs_student_snapshot(text,uuid,text,integer,text) from public;
grant execute on function public.crs_create_session(jsonb,text,text,text),
  public.crs_control_session(uuid,text,jsonb,text,text,text,text),
  public.crs_student_snapshot(text,uuid,text,integer,text) to anon,authenticated;
notify pgrst,'reload schema';
