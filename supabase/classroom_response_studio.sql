-- Shared seven-type classroom sessions. Existing wc_* sessions remain unchanged.
-- Public invoker RPCs call private, capability-checked implementations.
create schema if not exists crs_private;
revoke all on schema crs_private from public;
grant usage on schema crs_private to anon, authenticated;

create table crs_private.sessions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[0-9]{7}$'),
  host_hash text not null,
  deck jsonb not null,
  active_slide text not null,
  epochs jsonb not null default '{}'::jsonb,
  revision integer not null default 1,
  status text not null default 'open' check (status in ('open','paused','ended')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now()+interval '7 days'
);
create table crs_private.participants (
  session_id uuid not null references crs_private.sessions(id) on delete cascade,
  id uuid not null,
  token_hash text not null,
  created_at timestamptz not null default now(),
  primary key(session_id,id)
);
create table crs_private.responses (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references crs_private.sessions(id) on delete cascade,
  slide_id text not null,
  epoch integer not null,
  participant_id uuid not null,
  kind text not null,
  answer jsonb not null,
  request_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(session_id,slide_id,epoch,participant_id),
  foreign key(session_id,participant_id) references crs_private.participants(session_id,id) on delete cascade
);
create index crs_sessions_expiry_idx on crs_private.sessions(expires_at);
create index crs_sessions_created_idx on crs_private.sessions(created_at);
create index crs_responses_session_updated_idx on crs_private.responses(session_id,updated_at);
create index crs_responses_participant_idx on crs_private.responses(session_id,participant_id);
alter table crs_private.sessions enable row level security;
alter table crs_private.participants enable row level security;
alter table crs_private.responses enable row level security;
revoke all on all tables in schema crs_private from public,anon,authenticated;

create function crs_private.token_hash(p_token text) returns text
language plpgsql immutable security invoker set search_path='' as $$
begin
  if p_token is null or p_token !~ '^[a-f0-9]{64}$' then raise exception 'Invalid session capability.'; end if;
  return encode(extensions.digest(p_token,'sha256'),'hex');
end; $$;

create function crs_private.is_number(j jsonb, key text, lo numeric, hi numeric) returns boolean
language sql immutable security invoker set search_path='' as $$
  select case when jsonb_typeof(j->key)='number' then (j->>key)::numeric between lo and hi else false end;
$$;

create function crs_private.validate_deck(p_deck jsonb,p_active text) returns void
language plpgsql immutable security invoker set search_path='' as $$
declare s jsonb; it jsonb; ids text[]:='{}'; choices text[]; kind text; key text; n integer;
begin
  if jsonb_typeof(p_deck) is distinct from 'array' then raise exception 'Choose a valid presentation.'; end if;
  if jsonb_array_length(p_deck) not between 1 and 100 or octet_length(p_deck::text)>8000000 then raise exception 'Presentation is too large.'; end if;
  for s in select value from jsonb_array_elements(p_deck) loop
    if jsonb_typeof(s) is distinct from 'object' or coalesce(s->>'id','') !~ '^[A-Za-z0-9_-]{1,100}$' or s->>'id' in ('__proto__','constructor','prototype') or s->>'id'=any(ids) then raise exception 'Slide IDs must be unique.'; end if;
    ids:=array_append(ids,s->>'id');kind:=s->>'type';
    if kind is null or kind not in ('wordcloud','poll','open','scale','ranking','pin','xy') then raise exception 'Unknown question type.'; end if;
    if jsonb_typeof(s->'question') is distinct from 'string' or length(s->>'question')>220 or jsonb_typeof(s->'info') is distinct from 'string' or length(s->>'info')>500 then raise exception 'Question or instructions are too long.'; end if;
    if jsonb_typeof(s->'accepting') is distinct from 'boolean' then raise exception 'Invalid response setting.'; end if;
    if kind='wordcloud' then
      if not crs_private.is_number(s,'responseLimit',1,10) or (s->>'responseLimit')::numeric<>trunc((s->>'responseLimit')::numeric) then raise exception 'Choose 1 to 10 responses per student.'; end if;
    elsif kind='open' then
      if not crs_private.is_number(s,'openLimit',100,2000) or (s->>'openLimit')::numeric<>trunc((s->>'openLimit')::numeric) then raise exception 'Invalid written response limit.'; end if;
    elsif kind in ('poll','ranking','scale') then
      key:=case when kind='scale' then 'statements' else 'choices' end;
      if jsonb_typeof(s->key) is distinct from 'array' then raise exception 'Add choices or statements.'; end if;
      n:=jsonb_array_length(s->key);
      if n not between 1 and 10 then raise exception 'Use up to 10 choices or statements.'; end if;
      choices:='{}';
      for it in select value from jsonb_array_elements(s->key) loop
        if jsonb_typeof(it) is distinct from 'object' or coalesce(it->>'id','') !~ '^[A-Za-z0-9_-]{1,100}$' or it->>'id' in ('__proto__','constructor','prototype') or it->>'id'=any(choices) or jsonb_typeof(it->'label') is distinct from 'string' or length(it->>'label')>160 then raise exception 'Invalid choice or statement.'; end if;
        choices:=array_append(choices,it->>'id');
      end loop;
      if kind='poll' and jsonb_typeof(s->'multiple') is distinct from 'boolean' then raise exception 'Invalid poll setting.'; end if;
      if kind='scale' then
        if not crs_private.is_number(s,'scaleMin',0,9) or not crs_private.is_number(s,'scaleMax',1,10) then raise exception 'Invalid scale range.'; end if;
        if (s->>'scaleMin')::numeric>=(s->>'scaleMax')::numeric or (s->>'scaleMin')::numeric<>trunc((s->>'scaleMin')::numeric) or (s->>'scaleMax')::numeric<>trunc((s->>'scaleMax')::numeric) then raise exception 'Use an increasing whole-number scale.'; end if;
        foreach key in array array['scaleLow','scaleHigh'] loop
          if jsonb_typeof(s->key) is distinct from 'string' or length(s->>key)>80 then raise exception 'Invalid scale label.'; end if;
        end loop;
      end if;
    elsif kind='pin' then
      if jsonb_typeof(s->'pinImage') is distinct from 'string' or length(s->>'pinImage')>2500000 or ((s->>'pinImage')<>'' and (s->>'pinImage') !~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$') then raise exception 'Choose a PNG, JPEG, or WebP image.'; end if;
    elsif kind='xy' then
      foreach key in array array['xMin','xMax','yMin','yMax'] loop
        if not crs_private.is_number(s,key,-1000,1000) then raise exception 'Invalid axis range.'; end if;
      end loop;
      if (s->>'xMin')::numeric>=(s->>'xMax')::numeric or (s->>'yMin')::numeric>=(s->>'yMax')::numeric then raise exception 'Axis maximum must exceed its minimum.'; end if;
      foreach key in array array['xLabel','yLabel','xLow','xHigh','yLow','yHigh'] loop
        if jsonb_typeof(s->key) is distinct from 'string' or length(s->>key)>80 then raise exception 'Invalid axis label.'; end if;
      end loop;
    end if;
  end loop;
  if p_active is null or not p_active=any(ids) then raise exception 'Choose a slide in this presentation.'; end if;
end; $$;

create function crs_private.slide_ready(s jsonb) returns boolean
language plpgsql immutable security invoker set search_path='' as $$
declare kind text:=s->>'type'; key text;
begin
  if coalesce(length(trim(s->>'question')),0)=0 then return false; end if;
  if kind in ('poll','ranking','scale') then
    key:=case when kind='scale' then 'statements' else 'choices' end;
    if kind<>'scale' and jsonb_array_length(s->key)<2 then return false; end if;
    if exists(select 1 from jsonb_array_elements(s->key) where length(trim(value->>'label'))=0) then return false; end if;
  end if;
  if kind='pin' and coalesce(s->>'pinImage','')='' then return false; end if;
  return true;
end; $$;

create function crs_private.response_schema(s jsonb) returns jsonb
language sql immutable security invoker set search_path='' as $$
  select case s->>'type'
    when 'poll' then jsonb_build_object('type','poll','multiple',s->'multiple','ids',(select jsonb_agg(value->>'id' order by value->>'id') from jsonb_array_elements(s->'choices')))
    when 'ranking' then jsonb_build_object('type','ranking','ids',(select jsonb_agg(value->>'id' order by value->>'id') from jsonb_array_elements(s->'choices')))
    when 'scale' then jsonb_build_object('type','scale','min',s->'scaleMin','max',s->'scaleMax','ids',(select jsonb_agg(value->>'id' order by value->>'id') from jsonb_array_elements(s->'statements')))
    when 'pin' then jsonb_build_object('type','pin','image',encode(extensions.digest(coalesce(s->>'pinImage',''),'sha256'),'hex'))
    when 'xy' then jsonb_build_object('type','xy','xmin',s->'xMin','xmax',s->'xMax','ymin',s->'yMin','ymax',s->'yMax')
    else jsonb_build_object('type',s->'type') end;
$$;

create function crs_private.host_packet(v crs_private.sessions) returns jsonb
language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('id',v.id,'code',v.code,'status',case when v.expires_at<=now() then 'expired' else v.status end,'expires_at',v.expires_at,'revision',v.revision,'active_slide_id',v.active_slide,'epochs',v.epochs,
    'responses',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'slide_id',r.slide_id,'epoch',r.epoch,'kind',r.kind,'answer',r.answer,'at',r.created_at,'updated_at',r.updated_at) order by r.created_at,r.id)
      from crs_private.responses r where r.session_id=v.id and r.epoch=coalesce((v.epochs->>r.slide_id)::integer,1) and exists(select 1 from jsonb_array_elements(v.deck) s where s->>'id'=r.slide_id)),'[]'::jsonb));
$$;

create function crs_private.student_packet(v crs_private.sessions,p_participant uuid,p_token text,p_known_revision integer) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare s jsonb; answer jsonb; ep integer; st text;
begin
  select value into s from jsonb_array_elements(v.deck) where value->>'id'=v.active_slide;
  ep:=coalesce((v.epochs->>v.active_slide)::integer,1);
  st:=case when v.expires_at<=now() then 'expired' when v.status='ended' then 'ended' when v.status='paused' or not (s->>'accepting')::boolean then 'paused' else 'open' end;
  if p_participant is not null and p_token ~ '^[a-f0-9]{64}$' and exists(select 1 from crs_private.participants p where p.session_id=v.id and p.id=p_participant and p.token_hash=crs_private.token_hash(p_token)) then
    select r.answer into answer from crs_private.responses r where r.session_id=v.id and r.slide_id=v.active_slide and r.epoch=ep and r.participant_id=p_participant;
  end if;
  return jsonb_build_object('id',v.id,'code',v.code,'status',st,'expires_at',v.expires_at,'revision',v.revision,'active_slide_id',v.active_slide,'epoch',ep,'ready',crs_private.slide_ready(s),'slide',case when p_known_revision is distinct from v.revision then s else null end,'my_answer',answer);
end; $$;

create function crs_private.create_session(p_deck jsonb,p_active_slide text,p_host_token text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v crs_private.sessions; code text; token_hash text:=crs_private.token_hash(p_host_token); s jsonb;
begin
  perform crs_private.validate_deck(p_deck,p_active_slide);
  select value into s from jsonb_array_elements(p_deck) where value->>'id'=p_active_slide;
  if not crs_private.slide_ready(s) then raise exception 'Finish this question before starting a live session.'; end if;
  if (select count(*) from crs_private.sessions where created_at>now()-interval '1 day')>=1000 then raise exception 'Session creation limit reached. Try again later.'; end if;
  for i in 1..20 loop
    code:=(1000000+floor(random()*9000000))::integer::text;
    begin
      insert into crs_private.sessions(code,host_hash,deck,active_slide) values(code,token_hash,p_deck,p_active_slide) returning * into v;
      return crs_private.host_packet(v);
    exception when unique_violation then null; end;
  end loop;
  raise exception 'Could not create a session. Please try again.';
end; $$;

create function crs_private.host_snapshot(p_session_id uuid,p_host_token text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v crs_private.sessions;
begin
  select * into v from crs_private.sessions where id=p_session_id and host_hash=crs_private.token_hash(p_host_token);
  if not found then raise exception 'Teacher session is unavailable in this browser.'; end if;
  return crs_private.host_packet(v);
end; $$;

create function crs_private.control_session(p_session_id uuid,p_host_token text,p_deck jsonb,p_active_slide text,p_status text,p_action text) returns jsonb
language plpgsql security definer set search_path='' as $$
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
    ep:=coalesce((v.epochs->>active)::integer,1)+1;v.epochs:=jsonb_set(v.epochs,array[active],to_jsonb(ep),true);changed:=true;
  end if;
  for s in select value from jsonb_array_elements(next_deck) loop
    select value into old_s from jsonb_array_elements(v.deck) where value->>'id'=s->>'id';
    if old_s is not null and crs_private.response_schema(old_s) is distinct from crs_private.response_schema(s) and exists(select 1 from crs_private.responses r where r.session_id=v.id and r.slide_id=s->>'id' and r.epoch=coalesce((v.epochs->>(s->>'id'))::integer,1)) then raise exception 'Clear this slide’s results before changing its question type, choices, scale, axes, or image.'; end if;
  end loop;
  changed:=changed or next_deck is distinct from v.deck or active is distinct from v.active_slide or (p_status is not null and p_status is distinct from v.status);
  update crs_private.sessions set deck=next_deck,active_slide=active,status=coalesce(p_status,v.status),epochs=v.epochs,revision=v.revision+case when changed then 1 else 0 end where id=v.id returning * into v;
  return crs_private.host_packet(v);
end; $$;

create function crs_private.student_snapshot(p_code text,p_participant_id uuid,p_participant_token text,p_known_revision integer) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v crs_private.sessions;
begin
  if p_code is null or p_code !~ '^[0-9]{7}$' then raise exception 'Enter a seven-digit classroom session code.'; end if;
  select * into v from crs_private.sessions where code=p_code;
  if not found then raise exception 'That session was not found. Check the code with your teacher.'; end if;
  return crs_private.student_packet(v,p_participant_id,p_participant_token,p_known_revision);
end; $$;

create function crs_private.validate_answer(s jsonb,a jsonb) returns jsonb
language plpgsql immutable security invoker set search_path='' as $$
declare kind text:=s->>'type'; it jsonb; id text; ids text[]:='{}'; selected text[]:='{}'; clean text; words jsonb:='[]'; ratings jsonb:='{}'; rating_value numeric; x numeric; y numeric;
begin
  if jsonb_typeof(a) is distinct from 'object' or octet_length(a::text)>15000 then raise exception 'Invalid response.'; end if;
  if kind='wordcloud' then
    if jsonb_typeof(a->'words') is distinct from 'array' then raise exception 'Enter words or phrases.'; end if;
    if jsonb_array_length(a->'words') not between 1 and (s->>'responseLimit')::integer then raise exception 'Too many words for this question.'; end if;
    for it in select value from jsonb_array_elements(a->'words') loop
      if jsonb_typeof(it) is distinct from 'string' then raise exception 'Enter words or phrases.'; end if;
      clean:=regexp_replace(trim(it#>>'{}'),'\s+',' ','g');
      if length(clean) not between 1 and 65 then raise exception 'Use a word or short phrase of up to 65 characters.'; end if;
      words:=words||jsonb_build_array(clean);
    end loop;return jsonb_build_object('words',words);
  elsif kind='open' then
    if jsonb_typeof(a->'text') is distinct from 'string' or coalesce(length(trim(a->>'text')),0) not between 1 and (s->>'openLimit')::integer then raise exception 'Write a response within the character limit.'; end if;
    return jsonb_build_object('text',trim(a->>'text'));
  elsif kind in ('poll','ranking') then
    select array_agg(value->>'id') into ids from jsonb_array_elements(s->'choices');
    clean:=case when kind='poll' then 'choice_ids' else 'order' end;
    if jsonb_typeof(a->clean) is distinct from 'array' then raise exception 'Choose or rank the items.'; end if;
    for it in select value from jsonb_array_elements(a->clean) loop
      id:=it#>>'{}';if jsonb_typeof(it) is distinct from 'string' or not id=any(ids) or id=any(selected) then raise exception 'Each response must match an available choice.'; end if;
      selected:=array_append(selected,id);
    end loop;
    if cardinality(selected)<1 or (kind='poll' and not (s->>'multiple')::boolean and cardinality(selected)<>1) or (kind='ranking' and cardinality(selected)<>cardinality(ids)) then raise exception 'Choose one option or rank all items as instructed.'; end if;
    return jsonb_build_object(clean,to_jsonb(selected));
  elsif kind='scale' then
    if jsonb_typeof(a->'ratings') is distinct from 'object' or (select count(*) from jsonb_object_keys(a->'ratings'))<>jsonb_array_length(s->'statements') then raise exception 'Rate every statement.'; end if;
    for it in select value from jsonb_array_elements(s->'statements') loop
      id:=it->>'id';if not crs_private.is_number(a->'ratings',id,(s->>'scaleMin')::numeric,(s->>'scaleMax')::numeric) then raise exception 'Choose a rating on the scale for every statement.'; end if;
      rating_value:=(a->'ratings'->>id)::numeric;if rating_value<>trunc(rating_value) then raise exception 'Choose a whole-number rating.'; end if;
      ratings:=jsonb_set(ratings,array[id],to_jsonb(rating_value),true);
    end loop;return jsonb_build_object('ratings',ratings);
  elsif kind in ('pin','xy') then
    if not crs_private.is_number(a,'x',case when kind='pin' then 0 else (s->>'xMin')::numeric end,case when kind='pin' then 100 else (s->>'xMax')::numeric end) or not crs_private.is_number(a,'y',case when kind='pin' then 0 else (s->>'yMin')::numeric end,case when kind='pin' then 100 else (s->>'yMax')::numeric end) then raise exception 'Choose a position within both axes.'; end if;
    x:=round((a->>'x')::numeric,2);y:=round((a->>'y')::numeric,2);return jsonb_build_object('x',x,'y',y);
  end if;
  raise exception 'Unknown response type.';
end; $$;

create function crs_private.submit_response(p_code text,p_participant_id uuid,p_participant_token text,p_request_id uuid,p_slide_id text,p_revision integer,p_epoch integer,p_answer jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
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
end; $$;

-- Default PUBLIC execution is revoked on every private helper and public wrapper.
revoke execute on all functions in schema crs_private from public,anon,authenticated;
grant execute on function crs_private.create_session(jsonb,text,text),crs_private.host_snapshot(uuid,text),crs_private.control_session(uuid,text,jsonb,text,text,text),crs_private.student_snapshot(text,uuid,text,integer),crs_private.submit_response(text,uuid,text,uuid,text,integer,integer,jsonb) to anon,authenticated;

create function public.crs_create_session(p_deck jsonb,p_active_slide text,p_host_token text) returns jsonb language sql security invoker set search_path='' as $$ select crs_private.create_session(p_deck,p_active_slide,p_host_token); $$;
create function public.crs_host_snapshot(p_session_id uuid,p_host_token text) returns jsonb language sql stable security invoker set search_path='' as $$ select crs_private.host_snapshot(p_session_id,p_host_token); $$;
create function public.crs_control_session(p_session_id uuid,p_host_token text,p_deck jsonb default null,p_active_slide text default null,p_status text default null,p_action text default null) returns jsonb language sql security invoker set search_path='' as $$ select crs_private.control_session(p_session_id,p_host_token,p_deck,p_active_slide,p_status,p_action); $$;
create function public.crs_student_snapshot(p_code text,p_participant_id uuid default null,p_participant_token text default null,p_known_revision integer default null) returns jsonb language sql stable security invoker set search_path='' as $$ select crs_private.student_snapshot(p_code,p_participant_id,p_participant_token,p_known_revision); $$;
create function public.crs_submit_response(p_code text,p_participant_id uuid,p_participant_token text,p_request_id uuid,p_slide_id text,p_revision integer,p_epoch integer,p_answer jsonb) returns jsonb language sql security invoker set search_path='' as $$ select crs_private.submit_response(p_code,p_participant_id,p_participant_token,p_request_id,p_slide_id,p_revision,p_epoch,p_answer); $$;
revoke execute on function public.crs_create_session(jsonb,text,text),public.crs_host_snapshot(uuid,text),public.crs_control_session(uuid,text,jsonb,text,text,text),public.crs_student_snapshot(text,uuid,text,integer),public.crs_submit_response(text,uuid,text,uuid,text,integer,integer,jsonb) from public;
grant execute on function public.crs_create_session(jsonb,text,text),public.crs_host_snapshot(uuid,text),public.crs_control_session(uuid,text,jsonb,text,text,text),public.crs_student_snapshot(text,uuid,text,integer),public.crs_submit_response(text,uuid,text,uuid,text,integer,integer,jsonb) to anon,authenticated;
notify pgrst,'reload schema';
