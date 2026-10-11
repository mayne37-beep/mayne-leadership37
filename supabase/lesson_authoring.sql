-- Shared PIN-authorized lesson studio. Tables are never exposed to the Data API.
create schema if not exists ml_authoring;
revoke all on schema ml_authoring from public;
create table ml_authoring.gateway_keys (key_hash text primary key, created_at timestamptz not null default now());
create table ml_authoring.courses (
  id uuid primary key, kind text not null default 'course', title text not null,
  draft jsonb not null, published jsonb, version integer not null default 1,
  archived boolean not null default false, updated_at timestamptz not null default now()
);
create table ml_authoring.revisions (
  course_id uuid not null references ml_authoring.courses(id) on delete cascade,
  version integer not null, draft jsonb not null, created_at timestamptz not null default now(),
  primary key (course_id,version)
);
create table ml_authoring.assets (
  id uuid primary key, name text not null, mime text not null, parts integer not null check(parts between 1 and 40),
  created_at timestamptz not null default now()
);
create table ml_authoring.asset_parts (
  asset_id uuid not null references ml_authoring.assets(id) on delete cascade,
  part integer not null, data text not null, primary key(asset_id,part)
);
alter table ml_authoring.gateway_keys enable row level security;
alter table ml_authoring.courses enable row level security;
alter table ml_authoring.revisions enable row level security;
alter table ml_authoring.assets enable row level security;
alter table ml_authoring.asset_parts enable row level security;
revoke all on all tables in schema ml_authoring from public, anon, authenticated;

-- A narrow application gateway. It accepts an unguessable server-only credential,
-- not the site PIN. No arbitrary SQL, role changes, or other project tables.
create function ml_authoring.gateway(p_key text,p_action text,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare c ml_authoring.courses; a ml_authoring.assets; target uuid; expected integer; result jsonb;
begin
  if p_key is null or length(p_key) <> 64 or not exists (
    select 1 from ml_authoring.gateway_keys where key_hash = encode(sha256(convert_to(p_key,'UTF8')),'hex')
  ) then raise exception 'Unauthorized' using errcode='42501'; end if;
  if p_action in ('list','templates') then
    select coalesce(jsonb_agg(jsonb_build_object('id',id,'title',title,'version',version,'updated_at',updated_at,
      'published',published is not null,'description',draft->>'description','cover',draft->>'cover',
      'lessons',jsonb_array_length(coalesce(draft->'lessons','[]'::jsonb))) order by updated_at desc),'[]'::jsonb)
      into result from ml_authoring.courses where not archived and kind=case when p_action='templates' then 'template' else 'course' end;
    return result;
  end if;
  if p_action in ('asset-init','asset-part','asset') then
    target := (p_payload->>'id')::uuid;
    if p_action='asset-init' then
      if p_payload->>'mime' not in ('image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm',
        'audio/mpeg','audio/wav','audio/ogg','audio/webm','application/pdf','text/plain','application/octet-stream') then
        raise exception 'Unsupported file type'; end if;
      insert into ml_authoring.assets(id,name,mime,parts) values(target,left(p_payload->>'name',180),p_payload->>'mime',(p_payload->>'parts')::int);
      return jsonb_build_object('id',target);
    end if;
    select * into a from ml_authoring.assets where id=target;
    if not found then raise exception 'Not found' using errcode='P0002'; end if;
    if p_action='asset-part' then
      expected := (p_payload->>'part')::int;
      if expected<0 or expected>=a.parts or length(p_payload->>'data')>700000 or coalesce(p_payload->>'data','') !~ '^[A-Za-z0-9+/]*={0,2}$' then
        raise exception 'Invalid file part'; end if;
      insert into ml_authoring.asset_parts(asset_id,part,data) values(target,expected,p_payload->>'data')
        on conflict(asset_id,part) do update set data=excluded.data;
      return jsonb_build_object('ok',true);
    end if;
    if (select count(*) from ml_authoring.asset_parts where asset_id=target)<>a.parts then raise exception 'Upload incomplete'; end if;
    select jsonb_build_object('name',a.name,'mime',a.mime,'data',string_agg(data,'' order by part)) into result
      from ml_authoring.asset_parts where asset_id=target;
    return result;
  end if;
  target := (p_payload->>'id')::uuid;
  select * into c from ml_authoring.courses where id=target for update;
  if p_action='create' then
    if c.id is not null then raise exception 'Already exists' using errcode='23505'; end if;
    if jsonb_typeof(p_payload->'data'->'lessons') is distinct from 'array' or pg_column_size(p_payload->'data')>3500000 then raise exception 'Invalid course'; end if;
    insert into ml_authoring.courses(id,title,draft,kind) values(target,left(p_payload->'data'->>'title',200),p_payload->'data',
      case when p_payload->>'kind'='template' then 'template' else 'course' end) returning * into c;
  else
    if c.id is null or c.archived then raise exception 'Not found' using errcode='P0002'; end if;
    if p_action='published' then
      if c.published is null then raise exception 'Course is not published' using errcode='P0002'; end if;
      return jsonb_build_object('data',c.published,'version',c.version);
    elsif p_action='get' then return jsonb_build_object('data',c.draft,'version',c.version,'published',c.published is not null);
    elsif p_action='history' then
      select coalesce(jsonb_agg(jsonb_build_object('version',version,'data',draft,'created_at',created_at) order by version desc),'[]'::jsonb)
      into result from ml_authoring.revisions where course_id=target; return result;
    end if;
    expected := (p_payload->>'version')::int;
    if expected is null or expected<>c.version then raise exception 'Version conflict' using errcode='40001'; end if;
    if p_action='save' then
      if jsonb_typeof(p_payload->'data'->'lessons') is distinct from 'array' or pg_column_size(p_payload->'data')>3500000 then raise exception 'Invalid course'; end if;
      insert into ml_authoring.revisions(course_id,version,draft) values(c.id,c.version,c.draft);
      delete from ml_authoring.revisions where course_id=c.id and version<c.version-19;
      update ml_authoring.courses set draft=p_payload->'data',title=left(p_payload->'data'->>'title',200),version=version+1,updated_at=now() where id=target returning * into c;
    elsif p_action='publish' then
      update ml_authoring.courses set published=draft,version=version+1,updated_at=now() where id=target returning * into c;
    elsif p_action='unpublish' then
      update ml_authoring.courses set published=null,version=version+1,updated_at=now() where id=target returning * into c;
    elsif p_action='archive' then
      update ml_authoring.courses set archived=true,version=version+1,updated_at=now() where id=target returning * into c;
    else raise exception 'Invalid action'; end if;
  end if;
  return jsonb_build_object('id',c.id,'version',c.version,'published',c.published is not null,'updated_at',c.updated_at);
end; $$;
revoke all on function ml_authoring.gateway(text,text,jsonb) from public,anon,authenticated;
grant usage on schema ml_authoring to anon;
grant execute on function ml_authoring.gateway(text,text,jsonb) to anon;
create function public.ml_lesson_rpc(p_key text,p_action text,p_payload jsonb default '{}'::jsonb)
returns jsonb language sql security invoker set search_path = '' as $$ select ml_authoring.gateway(p_key,p_action,p_payload); $$;
revoke all on function public.ml_lesson_rpc(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.ml_lesson_rpc(text,text,jsonb) to anon;
notify pgrst,'reload schema';
