-- Isolated storage. Instructor authority is verified by the existing PIN API and
-- the existing server-only authoring gateway key. No browser receives that key.
create schema if not exists ml_systems;
revoke all on schema ml_systems from public;
create table ml_systems.projects(
 id uuid primary key, title text not null check(length(title) between 1 and 100),
 data jsonb not null, version integer not null default 1, archived boolean not null default false,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table ml_systems.revisions(
 project_id uuid not null references ml_systems.projects(id) on delete cascade,
 version integer not null, data jsonb not null, created_at timestamptz not null default now(),
 primary key(project_id,version)
);
create table ml_systems.sessions(
 id uuid primary key, project_id uuid not null references ml_systems.projects(id) on delete cascade,
 token_hash text not null unique, mode text not null default 'edit' check(mode in ('edit','view')),
 locked boolean not null default false, active boolean not null default true,
 deadline timestamptz, created_at timestamptz not null default now(), expires_at timestamptz not null default now()+interval '24 hours'
);
create table ml_systems.members(
 id uuid primary key, session_id uuid not null references ml_systems.sessions(id) on delete cascade,
 proof_hash text not null, name text not null check(length(name) between 1 and 80), team text not null default '',
 contributions integer not null default 0, reflection text not null default '', last_seen timestamptz not null default now()
);
create index on ml_systems.sessions(project_id);
create index on ml_systems.members(session_id);
alter table ml_systems.projects enable row level security;
alter table ml_systems.revisions enable row level security;
alter table ml_systems.sessions enable row level security;
alter table ml_systems.members enable row level security;
revoke all on all tables in schema ml_systems from public,anon,authenticated;
create function ml_systems.gateway(p_key text,p_action text,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare item ml_systems.projects; sess ml_systems.sessions; member_row ml_systems.members;
 target uuid; expected integer; result jsonb; source jsonb; tok text; public_action boolean;
begin
 if p_key is null or length(p_key)<>64 or not exists(select 1 from ml_authoring.gateway_keys where key_hash=encode(sha256(convert_to(p_key,'UTF8')),'hex')) then raise exception 'Unauthorized' using errcode='42501';end if;
 if jsonb_typeof(p_payload) is distinct from 'object' or pg_column_size(p_payload)>1800000 then raise exception 'Invalid payload';end if;
 public_action:=p_action in ('session-get','session-join','session-save','session-reflect');
 if public_action then
  tok:=p_payload->>'room';
  if tok is null or tok !~ '^[a-f0-9]{48}$' then raise exception 'Invalid room' using errcode='P0002';end if;
  select * into sess from ml_systems.sessions where token_hash=encode(sha256(convert_to(tok,'UTF8')),'hex') and active and expires_at>now();
  if sess.id is null then raise exception 'Session unavailable' using errcode='P0002';end if;
  target:=sess.project_id;
 else
  if p_action='list' then
   select coalesce(jsonb_agg(jsonb_build_object('id',id,'title',title,'version',version,'folder',data->>'folder','tags',data->>'tags','updated_at',updated_at) order by updated_at desc),'[]'::jsonb) into result from ml_systems.projects where not archived;return result;
  end if;
  target:=(p_payload->>'id')::uuid;
 end if;
 if p_action in ('save','session-save') then
  source:=p_payload->'data';expected:=(p_payload->>'version')::integer;
  if source->>'format' is distinct from 'mayne-systems-map' or source->>'schemaVersion' is distinct from '1' or source->>'id' is distinct from target::text or
    pg_column_size(source)>1500000 or jsonb_typeof(source->'nodes') is distinct from 'array' or jsonb_typeof(source->'edges') is distinct from 'array' or jsonb_typeof(source->'groups') is distinct from 'array' or
    coalesce(length(trim(source->>'title')),0) not between 1 and 100 then raise exception 'Invalid map';end if;
  if jsonb_array_length(source->'nodes')>250 or jsonb_array_length(source->'edges')>600 or jsonb_array_length(source->'groups')>40 then raise exception 'Map limit exceeded';end if;
  if p_action='save' and expected=0 then
   insert into ml_systems.projects(id,title,data) values(target,source->>'title',source) on conflict do nothing returning * into item;
   if item.id is null then raise exception 'Version conflict' using errcode='40001';end if;
   return jsonb_build_object('id',item.id,'version',item.version);
  end if;
 end if;
 select * into item from ml_systems.projects where id=target for update;
 if item.id is null or item.archived then raise exception 'Map unavailable' using errcode='P0002';end if;
 -- All writers lock the project before its session to avoid inverse lock order.
 if public_action then
  select * into sess from ml_systems.sessions where id=sess.id and active and expires_at>now() for update;
  if sess.id is null then raise exception 'Session unavailable' using errcode='P0002';end if;
 end if;
 if p_action='get' then return jsonb_build_object('data',item.data,'version',item.version);end if;
 if p_action='history' then
  select coalesce(jsonb_agg(jsonb_build_object('version',version,'data',data,'created_at',created_at) order by version desc),'[]'::jsonb) into result from ml_systems.revisions where project_id=target;return result;
 end if;
 if p_action='archive' then
  update ml_systems.projects set archived=true where id=target;
  update ml_systems.sessions set active=false where project_id=target;return jsonb_build_object('ok',true);
 end if;
 if p_action='session-create' then
  tok:=p_payload->>'room';if tok is null or tok !~ '^[a-f0-9]{48}$' then raise exception 'Invalid token';end if;
  update ml_systems.sessions set active=false where project_id=target and active;
  insert into ml_systems.sessions(id,project_id,token_hash) values((p_payload->>'session')::uuid,target,encode(sha256(convert_to(tok,'UTF8')),'hex')) returning * into sess;
  return jsonb_build_object('id',sess.id,'room',tok,'mode',sess.mode,'locked',sess.locked,'active',true,'deadline',sess.deadline,'expires_at',sess.expires_at);
 end if;
 if p_action in ('session-settings','session-roster') then
  select * into sess from ml_systems.sessions where id=(p_payload->>'session')::uuid and project_id=target and active and expires_at>now() for update;
  if sess.id is null then raise exception 'Session unavailable' using errcode='P0002';end if;
  if p_action='session-roster' then
   select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'team',team,'contributions',contributions,'reflection',reflection,'last_seen',last_seen) order by last_seen desc),'[]'::jsonb) into result from ml_systems.members where session_id=sess.id;return result;
  end if;
  update ml_systems.sessions set mode=coalesce(p_payload->>'mode',mode),locked=coalesce((p_payload->>'locked')::boolean,locked),active=coalesce((p_payload->>'active')::boolean,active),deadline=case when p_payload ? 'minutes' then case when (p_payload->>'minutes')::integer=0 then null else now()+make_interval(mins=>greatest(1,least(180,(p_payload->>'minutes')::integer))) end else deadline end where id=sess.id returning * into sess;
  return jsonb_build_object('id',sess.id,'mode',sess.mode,'locked',sess.locked,'active',sess.active,'deadline',sess.deadline,'expires_at',sess.expires_at);
 end if;
 if p_action='session-join' then
  if (select count(*) from ml_systems.members where session_id=sess.id)>=60 then raise exception 'Classroom full' using errcode='54000';end if;
  if length(trim(coalesce(p_payload->>'name',''))) not between 1 and 80 or length(coalesce(p_payload->>'team',''))>80 or coalesce(p_payload->>'proof','') !~ '^[a-f0-9]{48}$' then raise exception 'Invalid participant';end if;
  insert into ml_systems.members(id,session_id,proof_hash,name,team) values((p_payload->>'member')::uuid,sess.id,encode(sha256(convert_to(p_payload->>'proof','UTF8')),'hex'),trim(p_payload->>'name'),coalesce(p_payload->>'team','')) returning * into member_row;
  return jsonb_build_object('member',member_row.id,'proof',p_payload->>'proof','data',item.data,'version',item.version,'session',jsonb_build_object('id',sess.id,'mode',sess.mode,'locked',sess.locked,'active',sess.active,'deadline',sess.deadline));
 end if;
 if p_action in ('session-save','session-reflect') or p_action='session-get' and p_payload ? 'member' then
  select * into member_row from ml_systems.members where id=(p_payload->>'member')::uuid and session_id=sess.id and proof_hash=encode(sha256(convert_to(coalesce(p_payload->>'proof',''),'UTF8')),'hex') for update;
  if member_row.id is null then raise exception 'Participant access denied' using errcode='42501';end if;
  update ml_systems.members set last_seen=now() where id=member_row.id;
 end if;
 if p_action='session-get' then return jsonb_build_object('data',item.data,'version',item.version,'session',jsonb_build_object('id',sess.id,'mode',sess.mode,'locked',sess.locked,'active',sess.active,'deadline',sess.deadline));end if;
 if p_action='session-reflect' then
  if length(coalesce(p_payload->>'reflection',''))>4000 then raise exception 'Reflection too long';end if;
  update ml_systems.members set reflection=coalesce(p_payload->>'reflection','') where id=member_row.id;return jsonb_build_object('ok',true);
 end if;
 if p_action in ('save','session-save') then
  if p_action='session-save' and (sess.locked or sess.mode<>'edit') then raise exception 'Editing locked' using errcode='42501';end if;
  if expected is null or expected<>item.version then raise exception 'Version conflict' using errcode='40001';end if;
  if p_action='session-save' then source:=jsonb_set(source,'{title}',to_jsonb(item.title));end if;
  insert into ml_systems.revisions(project_id,version,data) values(target,item.version,item.data);
  delete from ml_systems.revisions where project_id=target and version<item.version-19;
  update ml_systems.projects set data=source,title=source->>'title',version=version+1,updated_at=now() where id=target returning * into item;
  if p_action='session-save' then update ml_systems.members set contributions=contributions+1,last_seen=now() where id=member_row.id;end if;
  return jsonb_build_object('id',item.id,'version',item.version);
 end if;
 raise exception 'Unknown action';
end;
$function$;
revoke all on function ml_systems.gateway(text,text,jsonb) from public;
grant usage on schema ml_systems to anon,authenticated;
grant execute on function ml_systems.gateway(text,text,jsonb) to anon,authenticated;
create function public.ml_systems_rpc(p_key text,p_action text,p_payload jsonb default '{}'::jsonb)
returns jsonb language sql security invoker set search_path=''
as $function$ select ml_systems.gateway(p_key,p_action,p_payload); $function$;
revoke all on function public.ml_systems_rpc(text,text,jsonb) from public;
grant execute on function public.ml_systems_rpc(text,text,jsonb) to anon,authenticated;
notify pgrst,'reload schema';
