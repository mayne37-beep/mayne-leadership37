-- Countdown state is scoped to a slide and uses an absolute server deadline.
alter table crs_private.sessions add column if not exists timers jsonb not null default '{}'::jsonb;

CREATE OR REPLACE FUNCTION crs_private.host_packet(v crs_private.sessions)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select jsonb_build_object('id',v.id,'code',v.code,'status',case when v.expires_at<=now() then 'expired' else v.status end,'expires_at',v.expires_at,'revision',v.revision,'active_slide_id',v.active_slide,'epochs',v.epochs,'timers',v.timers,'server_now',clock_timestamp(),
    'responses',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'slide_id',r.slide_id,'epoch',r.epoch,'kind',r.kind,'answer',r.answer,'at',r.created_at,'updated_at',r.updated_at) order by r.created_at,r.id)
      from crs_private.responses r where r.session_id=v.id and r.epoch=coalesce((v.epochs->>r.slide_id)::integer,1) and exists(select 1 from jsonb_array_elements(v.deck) s where s->>'id'=r.slide_id)),'[]'::jsonb));
$function$
;

create or replace function crs_private.timer_closed(v crs_private.sessions, slide_id text)
returns boolean language sql volatile set search_path='' as $$
  select coalesce((v.timers->slide_id->>'auto_close')::boolean,false)
    and (v.timers->slide_id->>'state'='finished'
      or (v.timers->slide_id->>'state'='running' and (v.timers->slide_id->>'deadline')::timestamptz<=clock_timestamp()));
$$;
revoke all on function crs_private.timer_closed(crs_private.sessions,text) from public,anon,authenticated;

create or replace function crs_private.control_timer(p_session_id uuid,p_host_token text,p_slide_id text,p_action text,
  p_duration_seconds integer,p_add_seconds integer,p_auto_close boolean,p_show boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v crs_private.sessions;t jsonb;left_seconds integer;duration_seconds integer;timer_state text;deadline timestamptz;current_time_at timestamptz;
begin
  select * into v from crs_private.sessions where id=p_session_id and host_hash=crs_private.token_hash(p_host_token) for update;
  if not found then raise exception 'Teacher session is unavailable in this browser.';end if;
  current_time_at:=clock_timestamp();
  if v.status='ended' or v.expires_at<=current_time_at then raise exception 'This session has ended. Start a new session.';end if;
  if not exists(select 1 from jsonb_array_elements(v.deck) s where s->>'id'=p_slide_id) then raise exception 'This question is unavailable.';end if;
  if p_action is null or p_action not in ('start','pause','reset','extend','configure') then raise exception 'Invalid countdown control.';end if;
  t:=coalesce(v.timers->p_slide_id,'{}'::jsonb);
  duration_seconds:=coalesce(p_duration_seconds,(t->>'duration')::integer,120);
  if duration_seconds<1 or duration_seconds>31536000 then raise exception 'Enter a duration between 1 second and 8,760 hours.';end if;
  timer_state:=coalesce(t->>'state','idle');deadline:=(t->>'deadline')::timestamptz;
  left_seconds:=case when timer_state='running' then greatest(0,ceil(extract(epoch from deadline-current_time_at))::integer) else coalesce((t->>'remaining')::integer,duration_seconds) end;
  if timer_state='running' and left_seconds=0 then timer_state:='finished';end if;
  if p_action='start' and timer_state<>'running' then
    left_seconds:=case when timer_state='paused' and left_seconds>0 then left_seconds else duration_seconds end;
    timer_state:='running';deadline:=current_time_at+make_interval(secs=>left_seconds);
  elsif p_action='pause' then timer_state:=case when left_seconds>0 then 'paused' else 'finished' end;deadline:=null;
  elsif p_action='reset' then timer_state:='idle';left_seconds:=duration_seconds;deadline:=null;
  elsif p_action='extend' then
    if p_add_seconds is null or p_add_seconds<1 or p_add_seconds>31536000 or left_seconds::bigint+p_add_seconds>31536000 then raise exception 'Enter a valid amount of time to add.';end if;
    left_seconds:=left_seconds+p_add_seconds;
    if timer_state in ('running','finished') then timer_state:='running';deadline:=current_time_at+make_interval(secs=>left_seconds);else deadline:=null;end if;
  elsif p_action='configure' and timer_state='idle' then left_seconds:=duration_seconds;
  end if;
  t:=jsonb_build_object('state',timer_state,'duration',duration_seconds,'remaining',left_seconds,'deadline',deadline,
    'auto_close',coalesce(p_auto_close,(t->>'auto_close')::boolean,false),'show',coalesce(p_show,(t->>'show')::boolean,true));
  update crs_private.sessions set timers=jsonb_set(v.timers,array[p_slide_id],t,true) where id=v.id returning * into v;
  return crs_private.host_packet(v);
end;
$$;
revoke all on function crs_private.control_timer(uuid,text,text,text,integer,integer,boolean,boolean) from public;
grant execute on function crs_private.control_timer(uuid,text,text,text,integer,integer,boolean,boolean) to anon,authenticated;

create or replace function public.crs_control_timer(p_session_id uuid,p_host_token text,p_slide_id text,p_action text,
  p_duration_seconds integer default null,p_add_seconds integer default null,p_auto_close boolean default null,p_show boolean default null)
returns jsonb language sql security invoker set search_path='' as $$
  select crs_private.control_timer(p_session_id,p_host_token,p_slide_id,p_action,p_duration_seconds,p_add_seconds,p_auto_close,p_show);
$$;
revoke all on function public.crs_control_timer(uuid,text,text,text,integer,integer,boolean,boolean) from public;
grant execute on function public.crs_control_timer(uuid,text,text,text,integer,integer,boolean,boolean) to anon,authenticated;


CREATE OR REPLACE FUNCTION crs_private.student_packet(v crs_private.sessions, p_participant uuid, p_token text, p_known_revision integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare s jsonb; answer jsonb; ep integer; st text;
begin
  select value into s from jsonb_array_elements(v.deck) where value->>'id'=v.active_slide;
  ep:=coalesce((v.epochs->>v.active_slide)::integer,1);
  st:=case when v.expires_at<=now() then 'expired' when v.status='ended' then 'ended' when v.status='paused' or not (s->>'accepting')::boolean or crs_private.timer_closed(v,v.active_slide) then 'paused' else 'open' end;
  if p_participant is not null and p_token ~ '^[a-f0-9]{64}$' and exists(select 1 from crs_private.participants p where p.session_id=v.id and p.id=p_participant and p.token_hash=crs_private.token_hash(p_token)) then
    select r.answer into answer from crs_private.responses r where r.session_id=v.id and r.slide_id=v.active_slide and r.epoch=ep and r.participant_id=p_participant;
  end if;
  return jsonb_build_object('id',v.id,'code',v.code,'status',st,'expires_at',v.expires_at,'revision',v.revision,'active_slide_id',v.active_slide,'epoch',ep,'ready',crs_private.slide_ready(s),'slide',case when p_known_revision is distinct from v.revision then s else null end,'my_answer',answer,'timer',v.timers->v.active_slide,'server_now',clock_timestamp());
end; $function$
;

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
  if existing.request_id=p_request_id and stored_hash=token_hash then return crs_private.student_packet(v,p_participant_id,p_participant_token,null)||jsonb_build_object('ack_slide_id',p_slide_id); end if;
  if v.status<>'open' or v.expires_at<=now() then raise exception 'Responses are paused or this session has ended.'; end if;
  if p_slide_id is distinct from v.active_slide or p_revision is distinct from v.revision then raise exception 'Your teacher changed the question. Refresh and submit to the current slide.'; end if;
  ep:=coalesce((v.epochs->>v.active_slide)::integer,1);if p_epoch is distinct from ep then raise exception 'Your teacher cleared the results. Refresh before responding again.'; end if;
  select value into s from jsonb_array_elements(v.deck) where value->>'id'=v.active_slide;
  if not (s->>'accepting')::boolean or not crs_private.slide_ready(s) then raise exception 'Your teacher is preparing this question. Please wait.'; end if;
  if crs_private.timer_closed(v,v.active_slide) then raise exception 'Time is up. Responses for this question are closed.';end if;
  a:=crs_private.validate_answer(s,p_answer);
  if existing.updated_at>clock_timestamp()-interval '750 milliseconds' then raise exception 'Please wait a moment before updating your answer.'; end if;
  if stored_hash is null then
    if (select count(*) from crs_private.participants where session_id=v.id)>=2000 then raise exception 'This session has reached its participant limit.'; end if;
    insert into crs_private.participants(session_id,id,token_hash) values(v.id,p_participant_id,token_hash);
  end if;
  if existing.id is null and (select count(*) from crs_private.responses where session_id=v.id)>=20000 then raise exception 'This session has reached its response limit.'; end if;
  insert into crs_private.responses(session_id,slide_id,epoch,participant_id,kind,answer,request_id) values(v.id,p_slide_id,ep,p_participant_id,s->>'type',a,p_request_id)
  on conflict(session_id,slide_id,epoch,participant_id) do update set answer=excluded.answer,request_id=excluded.request_id,updated_at=clock_timestamp();
  return crs_private.student_packet(v,p_participant_id,p_participant_token,null)||jsonb_build_object('ack_slide_id',p_slide_id);
end; $function$
;

CREATE OR REPLACE FUNCTION crs_private.control_session(p_session_id uuid, p_host_token text, p_deck jsonb, p_active_slide text, p_status text, p_action text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v crs_private.sessions; next_deck jsonb; active text; s jsonb; old_s jsonb; changed boolean:=false; ep integer;
begin
  select * into v from crs_private.sessions where id=p_session_id and host_hash=crs_private.token_hash(p_host_token) for update;
  if not found then raise exception 'Teacher session is unavailable in this browser.'; end if;
  if v.status='ended' or v.expires_at<=now() then raise exception 'This session has ended. Start a new session.'; end if;
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
  changed:=changed or next_deck is distinct from v.deck or active is distinct from v.active_slide or (p_status is not null and p_status is distinct from v.status);
  update crs_private.sessions set deck=next_deck,active_slide=active,status=coalesce(p_status,v.status),epochs=v.epochs,timers=v.timers,revision=v.revision+case when changed then 1 else 0 end where id=v.id returning * into v;
  return crs_private.host_packet(v);
end; $function$
;
