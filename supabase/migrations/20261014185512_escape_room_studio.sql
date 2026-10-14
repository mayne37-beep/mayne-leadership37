-- Escape Room Studio uses the existing PIN-verified Vercel authoring gateway.
-- All application tables are private. The public wrapper is SECURITY INVOKER.
create schema if not exists ml_escape;
revoke all on schema ml_escape from public;
create table ml_escape.projects (
 id text primary key check(id ~ '^[A-Za-z0-9_-]{1,128}$'),
 title text not null check(length(title) between 1 and 200),
 draft jsonb not null, version integer not null default 1,
 published jsonb, published_version integer, token text unique,
 published_assets jsonb not null default '[]'::jsonb,
 updated_at timestamptz not null default now(), published_at timestamptz
);
create table ml_escape.assets (
 id text primary key check(id ~ '^asset-[a-f0-9]{64}$'),
 mime text not null check(mime in ('image/png','image/jpeg','image/webp','image/gif')),
 parts integer not null check(parts between 1 and 8),
 ready boolean not null default false, created_at timestamptz not null default now()
);
create table ml_escape.asset_parts (
 asset_id text not null references ml_escape.assets(id) on delete cascade,
 part integer not null check(part between 0 and 7),
 data text not null check(length(data)<=524288), primary key(asset_id,part)
);
create table ml_escape.sessions (
 id uuid primary key, project_id text not null references ml_escape.projects(id),
 publication_version integer not null, proof_hash text not null,
 learner text not null default '', finished boolean not null default false,
 elapsed integer not null default 0, attempts integer not null default 0,
 hints integer not null default 0, progress jsonb not null default '{}'::jsonb,
 started_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 completed_at timestamptz
);
create index escape_sessions_project_recent on ml_escape.sessions(project_id,started_at desc);
alter table ml_escape.projects enable row level security;
alter table ml_escape.assets enable row level security;
alter table ml_escape.asset_parts enable row level security;
alter table ml_escape.sessions enable row level security;
revoke all on all tables in schema ml_escape from public,anon,authenticated;

create function ml_escape.gateway(p_key text,p_action text,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $function$
declare room ml_escape.projects; image ml_escape.assets; sess ml_escape.sessions;
 target text; expected integer; result jsonb; token_value text; part_number integer;
begin
 -- PIN sessions are checked by Vercel, rather than represented as Supabase users.
 -- Only the server's anonymous-key gateway with the existing secret is accepted.
 if (select auth.uid()) is not null or p_key is null or length(p_key)<>64 or not exists(
  select 1 from ml_authoring.gateway_keys where key_hash=encode(sha256(convert_to(p_key,'UTF8')),'hex')
 ) then raise exception 'Unauthorized' using errcode='42501';end if;

 if p_action='list' then
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'title',title,'version',version,
   'updated_at',updated_at,'published',published is not null,'token',token,
   'publishedVersion',published_version,'scenes',jsonb_array_length(draft->'scenes')) order by updated_at desc),'[]'::jsonb)
   into result from ml_escape.projects;return result;
 end if;

 if p_action in ('published','start','progress') or p_action='asset' and p_payload->>'room' is not null then
  token_value:=p_payload->>'room';
  if token_value is null or token_value !~ '^[a-f0-9]{48}$' then raise exception 'Not found' using errcode='P0002';end if;
  select * into room from ml_escape.projects where token=token_value and published is not null;
  if not found then raise exception 'Not found' using errcode='P0002';end if;
  if p_action='published' then return jsonb_build_object('data',room.published,'version',room.published_version);end if;
  if p_action='start' then
   if (select count(*) from ml_escape.sessions where project_id=room.id and started_at>now()-interval '1 hour')>200 then raise exception 'Session limit' using errcode='42501';end if;
   insert into ml_escape.sessions(id,project_id,publication_version,proof_hash,learner)
    values((p_payload->>'session')::uuid,room.id,room.published_version,encode(sha256(convert_to(p_payload->>'proof','UTF8')),'hex'),left(coalesce(p_payload->>'learner',''),100));
   return jsonb_build_object('session',p_payload->>'session','proof',p_payload->>'proof');
  end if;
  if p_action='progress' then
   select * into sess from ml_escape.sessions where id=(p_payload->>'session')::uuid and project_id=room.id for update;
   if not found or sess.proof_hash is distinct from encode(sha256(convert_to(p_payload->>'proof','UTF8')),'hex') then raise exception 'Access denied' using errcode='42501';end if;
   if pg_column_size(p_payload->'progress')>300000 then raise exception 'Report too large';end if;
   update ml_escape.sessions set learner=left(p_payload->'progress'->>'learner',100),
    finished=finished or (p_payload->'progress'->>'finished')::boolean,
    elapsed=greatest(elapsed,least(604800,round((p_payload->'progress'->>'elapsed')::numeric)::integer)),
    attempts=least(100000,(p_payload->'progress'->>'attempts')::integer),
    hints=greatest(0,least(10000,coalesce((p_payload->'progress'->>'hints')::integer,0))),
    progress=p_payload->'progress',updated_at=now(),
    completed_at=case when completed_at is null and (p_payload->'progress'->>'finished')::boolean then now() else completed_at end
    where id=sess.id;
   return jsonb_build_object('ok',true);
  end if;
 end if;

 target:=p_payload->>'id';
 if p_action in ('asset-init','asset-part','asset') then
  if target is null or target !~ '^asset-[a-f0-9]{64}$' then raise exception 'Invalid asset';end if;
  if p_action='asset-init' then
   insert into ml_escape.assets(id,mime,parts) values(target,p_payload->>'mime',(p_payload->>'parts')::integer) on conflict(id) do nothing;
   select * into image from ml_escape.assets where id=target;
   if image.mime is distinct from p_payload->>'mime' or image.parts<>(p_payload->>'parts')::integer then raise exception 'Asset mismatch';end if;
   return jsonb_build_object('id',target,'ready',image.ready);
  end if;
  select * into image from ml_escape.assets where id=target for update;
  if not found then raise exception 'Not found' using errcode='P0002';end if;
  if p_action='asset-part' then
   if image.ready then return jsonb_build_object('ok',true,'ready',true);end if;
   part_number:=(p_payload->>'part')::integer;
   if part_number<0 or part_number>=image.parts or length(p_payload->>'data')>524288 or coalesce(p_payload->>'data','') !~ '^[A-Za-z0-9+/]*={0,2}$' then raise exception 'Invalid part';end if;
   insert into ml_escape.asset_parts(asset_id,part,data) values(target,part_number,p_payload->>'data') on conflict(asset_id,part) do update set data=excluded.data;
   update ml_escape.assets set ready=(select count(*) from ml_escape.asset_parts where asset_id=target)=parts where id=target returning * into image;
   return jsonb_build_object('ok',true,'ready',image.ready);
  end if;
  if not image.ready then raise exception 'Upload incomplete' using errcode='P0002';end if;
  if token_value is not null and not (room.published_assets @> jsonb_build_array(target)) then raise exception 'Not found' using errcode='P0002';end if;
  select jsonb_build_object('mime',image.mime,'data',string_agg(data,'' order by part)) into result from ml_escape.asset_parts where asset_id=target;return result;
 end if;

 if target is null or target !~ '^[A-Za-z0-9_-]{1,128}$' then raise exception 'Invalid project';end if;
 if p_action='save' then
  if p_payload->'data'->>'id' is distinct from target or p_payload->'data'->>'schemaVersion' is distinct from '1'
   or jsonb_typeof(p_payload->'data'->'scenes') is distinct from 'array'
   or jsonb_array_length(p_payload->'data'->'scenes') not between 1 and 100
   or pg_column_size(p_payload->'data')>1100000
   or coalesce(length(trim(p_payload->'data'->>'title')),0) not between 1 and 200
   or jsonb_typeof(p_payload->'assets') is distinct from 'array'
  then raise exception 'Invalid project';end if;
  if exists(select 1 from jsonb_array_elements_text(p_payload->'assets') a(id) where not exists(select 1 from ml_escape.assets where id=a.id and ready)) then raise exception 'Upload images first';end if;
  expected:=(p_payload->>'version')::integer;
  if expected=0 then
   insert into ml_escape.projects(id,title,draft) values(target,p_payload->'data'->>'title',p_payload->'data') on conflict(id) do nothing;
   if not found then raise exception 'Version conflict' using errcode='40001';end if;
   return jsonb_build_object('id',target,'version',1,'published',false,'updated_at',now());
  end if;
 end if;
 select * into room from ml_escape.projects where id=target for update;
 if not found then raise exception 'Not found' using errcode='P0002';end if;
 if p_action='get' then return jsonb_build_object('data',room.draft,'version',room.version,'published',room.published is not null,'token',room.token,'publishedVersion',room.published_version,'updated_at',room.updated_at);end if;
 if p_action='reports' then
  select coalesce(jsonb_agg(to_jsonb(s) - 'proof_hash' order by started_at desc),'[]'::jsonb) into result from (select id,project_id,publication_version,learner,finished,elapsed,attempts,hints,started_at,updated_at,completed_at,progress->>'notes' as notes from ml_escape.sessions where project_id=target order by started_at desc limit 200) s;return result;
 end if;
 if p_action not in ('save','publish','unpublish') then raise exception 'Unknown action';end if;
 expected:=(p_payload->>'version')::integer;
 if expected is null or expected<>room.version then raise exception 'Version conflict' using errcode='40001';end if;
 if p_action='save' then
  update ml_escape.projects set title=p_payload->'data'->>'title',draft=p_payload->'data',version=version+1,updated_at=now() where id=target returning * into room;
 elsif p_action='publish' then
  if p_payload->>'token' !~ '^[a-f0-9]{48}$' then raise exception 'Invalid learner link';end if;
  update ml_escape.projects set published=draft,published_version=version,published_at=now(),
   token=coalesce(token,p_payload->>'token'),
   published_assets=(select coalesce(jsonb_agg(distinct m[1]),'[]'::jsonb) from regexp_matches(draft::text,'/api/escape-studio\?action=asset&id=(asset-[a-f0-9]{64})','g') m)
   where id=target returning * into room;
 else update ml_escape.projects set published=null,token=null,published_assets='[]'::jsonb,published_version=null,published_at=null where id=target returning * into room;
 end if;
 return jsonb_build_object('id',room.id,'version',room.version,'published',room.published is not null,'token',room.token,'publishedVersion',room.published_version,'updated_at',room.updated_at);
end;
$function$;
revoke all on function ml_escape.gateway(text,text,jsonb) from public,anon,authenticated;
grant usage on schema ml_escape to anon;
grant execute on function ml_escape.gateway(text,text,jsonb) to anon;
create function public.ml_escape_rpc(p_key text,p_action text,p_payload jsonb default '{}'::jsonb)
returns jsonb language sql security invoker set search_path='' as $function$ select ml_escape.gateway(p_key,p_action,p_payload); $function$;
revoke all on function public.ml_escape_rpc(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.ml_escape_rpc(text,text,jsonb) to anon;
notify pgrst,'reload schema';
