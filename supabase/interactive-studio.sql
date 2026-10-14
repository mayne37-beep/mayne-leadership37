-- Dedicated source storage. Reuses the existing server-only authoring gateway key
-- and PIN-verified API; no learner endpoint exposes editable projects.
create schema if not exists ml_interactive;
revoke all on schema ml_interactive from public;
create table if not exists ml_interactive.projects(
  id uuid primary key,
  title text not null check(length(title) between 1 and 200),
  data jsonb not null,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists ml_interactive.revisions(
  project_id uuid not null references ml_interactive.projects(id) on delete cascade,
  version integer not null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  primary key(project_id,version)
);
alter table ml_interactive.projects enable row level security;
alter table ml_interactive.revisions enable row level security;
revoke all on all tables in schema ml_interactive from public,anon,authenticated;
create or replace function ml_interactive.gateway(p_key text,p_action text,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare item ml_interactive.projects; target uuid; expected integer; result jsonb;
begin
  if p_key is null or length(p_key)<>64 or not exists(
    select 1 from ml_authoring.gateway_keys where key_hash=encode(sha256(convert_to(p_key,'UTF8')),'hex')
  ) then raise exception 'Unauthorized' using errcode='42501';end if;
  if p_action='list' then
    select coalesce(jsonb_agg(jsonb_build_object('id',id,'title',title,'version',version,'updated_at',updated_at) order by updated_at desc),'[]'::jsonb) into result from ml_interactive.projects;return result;
  end if;
  target:=(p_payload->>'id')::uuid;
  if p_action in ('create','save') then
    if p_payload->'data'->>'format'<>'mayne-interactive-course'
      or p_payload->'data'->>'id' is distinct from p_payload->>'id'
      or p_payload->'data'->>'schemaVersion'<>'1'
      or jsonb_typeof(p_payload->'data'->'scenes') is distinct from 'array'
      or pg_column_size(p_payload->'data')>3000000
      or coalesce(length(trim(p_payload->'data'->>'title')),0) not between 1 and 200
    then raise exception 'Invalid project';end if;
  end if;
  if p_action='create' then
    insert into ml_interactive.projects(id,title,data) values(target,p_payload->'data'->>'title',p_payload->'data') returning * into item;
    return jsonb_build_object('id',item.id,'version',item.version);
  end if;
  select * into item from ml_interactive.projects where id=target for update;
  if item.id is null then raise exception 'Project not found' using errcode='P0002';end if;
  if p_action='get' then return jsonb_build_object('data',item.data,'version',item.version);end if;
  if p_action='history' then
    select coalesce(jsonb_agg(jsonb_build_object('version',version,'data',data,'created_at',created_at) order by version desc),'[]'::jsonb) into result from ml_interactive.revisions where project_id=target;return result;
  end if;
  if p_action<>'save' then raise exception 'Unknown action';end if;
  expected:=(p_payload->>'version')::integer;
  if expected is null or expected<>item.version then raise exception 'Version conflict' using errcode='40001';end if;
  insert into ml_interactive.revisions(project_id,version,data) values(item.id,item.version,item.data);
  delete from ml_interactive.revisions where project_id=target and version<item.version-19;
  update ml_interactive.projects set data=p_payload->'data',title=p_payload->'data'->>'title',version=version+1,updated_at=now() where id=target returning * into item;
  return jsonb_build_object('id',item.id,'version',item.version);
end;
$function$;
revoke all on function ml_interactive.gateway(text,text,jsonb) from public;
grant usage on schema ml_interactive to anon,authenticated;
grant execute on function ml_interactive.gateway(text,text,jsonb) to anon,authenticated;
create or replace function public.ml_interactive_rpc(p_key text,p_action text,p_payload jsonb default '{}'::jsonb)
returns jsonb language sql security invoker set search_path=''
as $function$ select ml_interactive.gateway(p_key,p_action,p_payload); $function$;
revoke all on function public.ml_interactive_rpc(text,text,jsonb) from public;
grant execute on function public.ml_interactive_rpc(text,text,jsonb) to anon,authenticated;
