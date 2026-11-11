create table public.crs_saved_projects (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null check (char_length(id) between 1 and 100),
  name text not null check (char_length(btrim(name)) between 1 and 100),
  project jsonb not null,
  slide_count integer generated always as (jsonb_array_length(project -> 'slides')) stored not null,
  revision uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id),
  check (coalesce(project ->> 'format' = 'word-cloud-studio' and project -> 'version' = '1'::jsonb, false)),
  check (slide_count between 1 and 100),
  check (octet_length(project::text) <= 45 * 1024 * 1024)
);

create index crs_saved_projects_recency on public.crs_saved_projects (user_id, updated_at desc, id);

alter table public.crs_saved_projects enable row level security;
revoke all on public.crs_saved_projects from public, anon, authenticated;
grant select, delete on public.crs_saved_projects to authenticated;
grant insert (user_id, id, name, project, revision) on public.crs_saved_projects to authenticated;
grant update (name, project, revision) on public.crs_saved_projects to authenticated;

create policy crs_saved_projects_owner on public.crs_saved_projects
  for all to authenticated
  using ((select auth.uid()) = user_id and (select auth.jwt() ->> 'is_anonymous') is distinct from 'true')
  with check ((select auth.uid()) = user_id and (select auth.jwt() ->> 'is_anonymous') is distinct from 'true');

create function public.crs_saved_projects_touch() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := statement_timestamp();
  return new;
end;
$$;

revoke all on function public.crs_saved_projects_touch() from public, anon, authenticated;
create trigger crs_saved_projects_touch before update on public.crs_saved_projects
  for each row execute function public.crs_saved_projects_touch();
