-- Mayne Leadership 360: initial private data model
-- Deploy only after verifying authentication and invitation workflows.
create extension if not exists pgcrypto;
create table if not exists public.ml360_admins (
 user_id uuid primary key references auth.users(id) on delete cascade,
 created_at timestamptz not null default now()
);
create table if not exists public.ml360_cycles (
 id uuid primary key default gen_random_uuid(),
 participant_name text not null,
 participant_email text not null,
 instrument text not null default 'leadership_impact_profile_48' check (instrument in ('leadership_impact_profile_48','leadership_impact_30')),
 status text not null default 'draft' check (status in ('draft','open','closed','released')),
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 released_at timestamptz
);
create table if not exists public.ml360_invitations (
 id uuid primary key default gen_random_uuid(),
 cycle_id uuid not null references public.ml360_cycles(id) on delete cascade,
 role text not null check (role in ('Self','Supervisor','Peer','Direct Report')),
 token_hash text not null unique,
 expires_at timestamptz not null,
 redeemed_at timestamptz,
 created_at timestamptz not null default now()
);
create table if not exists public.ml360_responses (
 id uuid primary key default gen_random_uuid(),
 cycle_id uuid not null references public.ml360_cycles(id) on delete cascade,
 invitation_id uuid not null unique references public.ml360_invitations(id),
 role text not null check (role in ('Self','Supervisor','Peer','Direct Report')),
 ratings jsonb not null check (jsonb_typeof(ratings) = 'array'),
 feedback jsonb not null default '{}'::jsonb,
 submitted_at timestamptz not null default now()
);
create index if not exists ml360_inv_cycle_idx on public.ml360_invitations(cycle_id);
create index if not exists ml360_res_cycle_idx on public.ml360_responses(cycle_id);
alter table public.ml360_admins enable row level security;
alter table public.ml360_cycles enable row level security;
alter table public.ml360_invitations enable row level security;
alter table public.ml360_responses enable row level security;
-- Default deny: no direct browser access to confidential invitations or responses.
-- All respondent submission and report release actions must run via validated server-side functions.
create policy ml360_admins_self_read on public.ml360_admins for select to authenticated using (user_id=auth.uid());
create policy ml360_admin_cycles_read on public.ml360_cycles for select to authenticated using (exists (select 1 from public.ml360_admins a where a.user_id=auth.uid()));
-- No policies for invitation and response tables: service-role/server-side access only.
