-- Consolidate the 360 application into the existing classroom backend.

-- Schema only. Account credentials and application data are imported privately.

-- Generated from the live source catalog; preserves RLS and public API signatures.

do $$ begin if to_regclass('public.calendar_events') is null or to_regclass('ml_authoring.courses') is null then raise exception 'This migration belongs only on the existing Classroom Calendar project.'; end if; if to_regclass('public.ml360_admins') is not null then raise exception '360 tables already exist; inspect before attempting a restore.'; end if; end $$;

create schema ml360_private;

revoke all on schema ml360_private from public,anon,authenticated;

grant usage on schema ml360_private to authenticated,service_role;

create table public."ml360_admins" (
  "user_id" uuid not null,
  "created_at" timestamp with time zone default now() not null,
  constraint "ml360_admins_pkey" PRIMARY KEY (user_id)
);

create table public."ml360_cycles" (
  "id" uuid default gen_random_uuid() not null,
  "participant_name" text not null,
  "participant_email" text not null,
  "instrument" text default 'leadership_impact_profile_48'::text not null,
  "status" text default 'draft'::text not null,
  "created_by" uuid not null,
  "created_at" timestamp with time zone default now() not null,
  "released_at" timestamp with time zone,
  constraint "ml360_cycles_instrument_check" CHECK (instrument = ANY (ARRAY['leadership_impact_profile_48'::text, 'leadership_impact_30'::text])),
  constraint "ml360_cycles_pkey" PRIMARY KEY (id),
  constraint "ml360_cycles_status_check" CHECK (status = ANY (ARRAY['draft'::text, 'open'::text, 'closed'::text, 'released'::text]))
);

create table public."ml360_invitations" (
  "id" uuid default gen_random_uuid() not null,
  "cycle_id" uuid not null,
  "role" text not null,
  "token_hash" text not null,
  "expires_at" timestamp with time zone not null,
  "redeemed_at" timestamp with time zone,
  "created_at" timestamp with time zone default now() not null,
  "invitee_email" text,
  constraint "ml360_invitations_pkey" PRIMARY KEY (id),
  constraint "ml360_invitations_role_check" CHECK (role = ANY (ARRAY['Self'::text, 'Supervisor'::text, 'Peer'::text, 'Direct Report'::text])),
  constraint "ml360_invitations_token_hash_key" UNIQUE (token_hash)
);

create table public."ml360_responses" (
  "id" uuid default gen_random_uuid() not null,
  "cycle_id" uuid not null,
  "invitation_id" uuid not null,
  "role" text not null,
  "ratings" jsonb not null,
  "feedback" jsonb default '{}'::jsonb not null,
  "submitted_at" timestamp with time zone default now() not null,
  constraint "ml360_responses_invitation_id_key" UNIQUE (invitation_id),
  constraint "ml360_responses_pkey" PRIMARY KEY (id),
  constraint "ml360_responses_ratings_check" CHECK (jsonb_typeof(ratings) = 'array'::text),
  constraint "ml360_responses_role_check" CHECK (role = ANY (ARRAY['Self'::text, 'Supervisor'::text, 'Peer'::text, 'Direct Report'::text]))
);

create table public."ml_smart_goals" (
  "user_id" uuid not null,
  "goals" jsonb default '[]'::jsonb not null,
  "updated_at" timestamp with time zone default now() not null,
  constraint "ml_smart_goals_pkey" PRIMARY KEY (user_id)
);

alter table public."ml360_admins" add constraint "ml360_admins_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public."ml360_admins" enable row level security;

revoke all on public."ml360_admins" from public,anon,authenticated;

grant all on public."ml360_admins" to service_role;

create policy "ml360_admins_self_read" on public."ml360_admins" as PERMISSIVE for SELECT to "authenticated" using ((user_id = auth.uid()));

alter table public."ml360_cycles" add constraint "ml360_cycles_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id);

alter table public."ml360_cycles" enable row level security;

revoke all on public."ml360_cycles" from public,anon,authenticated;

grant all on public."ml360_cycles" to service_role;

create policy "ml360_admin_cycles_insert" on public."ml360_cycles" as PERMISSIVE for INSERT to "authenticated" with check (((created_by = auth.uid()) AND (status = 'draft'::text) AND (EXISTS ( SELECT 1
   FROM ml360_admins a
  WHERE (a.user_id = auth.uid())))));

create policy "ml360_admin_cycles_read" on public."ml360_cycles" as PERMISSIVE for SELECT to "authenticated" using ((EXISTS ( SELECT 1
   FROM ml360_admins a
  WHERE (a.user_id = auth.uid()))));

alter table public."ml360_invitations" add constraint "ml360_invitations_cycle_id_fkey" FOREIGN KEY (cycle_id) REFERENCES ml360_cycles(id) ON DELETE CASCADE;

CREATE INDEX ml360_inv_cycle_idx ON public.ml360_invitations USING btree (cycle_id);

alter table public."ml360_invitations" enable row level security;

revoke all on public."ml360_invitations" from public,anon,authenticated;

grant all on public."ml360_invitations" to service_role;

create policy "ml360_admin_invitation_read" on public."ml360_invitations" as PERMISSIVE for SELECT to "authenticated" using ((EXISTS ( SELECT 1
   FROM ml360_admins a
  WHERE (a.user_id = auth.uid()))));

alter table public."ml360_responses" add constraint "ml360_responses_cycle_id_fkey" FOREIGN KEY (cycle_id) REFERENCES ml360_cycles(id) ON DELETE CASCADE;

alter table public."ml360_responses" add constraint "ml360_responses_invitation_id_fkey" FOREIGN KEY (invitation_id) REFERENCES ml360_invitations(id);

CREATE INDEX ml360_res_cycle_idx ON public.ml360_responses USING btree (cycle_id);

alter table public."ml360_responses" enable row level security;

revoke all on public."ml360_responses" from public,anon,authenticated;

grant all on public."ml360_responses" to service_role;

alter table public."ml_smart_goals" add constraint "ml_smart_goals_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public."ml_smart_goals" enable row level security;

revoke all on public."ml_smart_goals" from public,anon,authenticated;

grant all on public."ml_smart_goals" to service_role;

create policy "Users insert own SMART goals" on public."ml_smart_goals" as PERMISSIVE for INSERT to "authenticated" with check ((( SELECT auth.uid() AS uid) = user_id));

create policy "Users read own SMART goals" on public."ml_smart_goals" as PERMISSIVE for SELECT to "authenticated" using ((( SELECT auth.uid() AS uid) = user_id));

create policy "Users update own SMART goals" on public."ml_smart_goals" as PERMISSIVE for UPDATE to "authenticated" using ((( SELECT auth.uid() AS uid) = user_id)) with check ((( SELECT auth.uid() AS uid) = user_id));

grant select on public.ml360_admins,public.ml360_invitations to authenticated;

grant select,insert on public.ml360_cycles to authenticated;

grant select,insert,update on public.ml_smart_goals to authenticated;

create index if not exists ml360_cycles_created_by_idx on public.ml360_cycles(created_by);

create index if not exists ml360_invitations_cycle_id_idx on public.ml360_invitations(cycle_id);

create index if not exists ml360_responses_cycle_id_idx on public.ml360_responses(cycle_id);

CREATE OR REPLACE FUNCTION ml360_private.ml360_admin_report(p_cycle uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ declare out jsonb; begin if not exists(select 1 from public.ml360_admins where user_id=auth.uid()) then raise exception 'not authorized'; end if; if not exists(select 1 from public.ml360_cycles where id=p_cycle) then raise exception 'assessment not found'; end if; with groups as (select role,count(*)::int n from public.ml360_responses where cycle_id=p_cycle group by role), totals as (select count(*) filter(where role='Self')::int self_n,count(*) filter(where role='Supervisor')::int supervisor_n,count(*) filter(where role in ('Peer','Direct Report'))::int others_n from public.ml360_responses where cycle_id=p_cycle), scores as (select r.role,(q.ordinality-1)/4+1 as competency,avg(case when q.value::text in ('1','2','3','4','5') then (q.value::text)::numeric end) as score from public.ml360_responses r cross join lateral jsonb_array_elements(r.ratings) with ordinality q(value,ordinality) where r.cycle_id=p_cycle group by r.role,(q.ordinality-1)/4+1), grouped_scores as (select s.role,jsonb_agg(jsonb_build_object('competency',s.competency,'score',round(s.score,2)) order by s.competency) vals from scores s join groups g on g.role=s.role where s.role='Self' or g.n>=3 group by s.role), combined as (select (q.ordinality-1)/4+1 competency,round(avg(case when q.value::text in ('1','2','3','4','5') then (q.value::text)::numeric end),2) score from public.ml360_responses r cross join lateral jsonb_array_elements(r.ratings) with ordinality q(value,ordinality) where r.cycle_id=p_cycle and r.role<>'Self' group by (q.ordinality-1)/4+1), comments as (select jsonb_agg(jsonb_build_object('role',case when r.role='Self' then 'Self' else 'Other evaluators' end,'feedback',r.feedback)) vals from public.ml360_responses r where r.cycle_id=p_cycle and (r.role='Self' or (select count(*) from public.ml360_responses rr where rr.cycle_id=p_cycle and rr.role<>'Self')>=5)) select jsonb_build_object('counts',(select to_jsonb(t) from totals t),'groups',coalesce((select jsonb_object_agg(role,n) from groups),'{}'::jsonb),'scores',coalesce((select jsonb_object_agg(role,vals) from grouped_scores),'{}'::jsonb),'others',coalesce((select jsonb_agg(jsonb_build_object('competency',competency,'score',score) order by competency) from combined),'[]'::jsonb),'comments',coalesce((select vals from comments),'[]'::jsonb)) into out; return out; end $function$;

CREATE OR REPLACE FUNCTION ml360_private.ml360_redeem_response(p_hash text, p_ratings jsonb, p_feedback jsonb)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ declare inv public.ml360_invitations%rowtype; cyc public.ml360_cycles%rowtype; begin select * into inv from public.ml360_invitations where token_hash=p_hash for update; if not found then return 'invalid'; end if; if inv.redeemed_at is not null then return 'used'; end if; if inv.expires_at<=now() then return 'expired'; end if; select * into cyc from public.ml360_cycles where id=inv.cycle_id; if cyc.status<>'open' then return 'closed'; end if; if jsonb_typeof(p_ratings)<>'array' or jsonb_array_length(p_ratings)<>48 or exists(select 1 from jsonb_array_elements(p_ratings) x where jsonb_typeof(x) <> 'number' or (x::text)::numeric not in (0,1,2,3,4,5)) then return 'invalid_ratings'; end if; if jsonb_typeof(p_feedback)<>'object' or length(p_feedback::text)>7000 then return 'invalid_feedback'; end if; insert into public.ml360_responses(cycle_id,invitation_id,role,ratings,feedback) values(inv.cycle_id,inv.id,inv.role,p_ratings,p_feedback); update public.ml360_invitations set redeemed_at=now() where id=inv.id; return 'ok'; end $function$;

create function public.ml360_admin_report(p_cycle uuid) returns jsonb language sql security invoker set search_path='' as $$select ml360_private.ml360_admin_report(p_cycle)$$;

create function public.ml360_redeem_response(p_hash text,p_ratings jsonb,p_feedback jsonb) returns text language sql security invoker set search_path='' as $$select ml360_private.ml360_redeem_response(p_hash,p_ratings,p_feedback)$$;

revoke all on function ml360_private.ml360_admin_report(uuid),public.ml360_admin_report(uuid),ml360_private.ml360_redeem_response(text,jsonb,jsonb),public.ml360_redeem_response(text,jsonb,jsonb) from public,anon,authenticated;

grant execute on function ml360_private.ml360_admin_report(uuid),public.ml360_admin_report(uuid) to authenticated,service_role;

grant execute on function ml360_private.ml360_redeem_response(text,jsonb,jsonb),public.ml360_redeem_response(text,jsonb,jsonb) to service_role;

create view public."ml360_admin_progress" with (security_invoker=true) as  SELECT c.id AS cycle_id,
    (count(i.id))::integer AS invitations,
    (count(i.id) FILTER (WHERE (i.redeemed_at IS NOT NULL)))::integer AS completed,
    (count(i.id) FILTER (WHERE ((i.role = 'Self'::text) AND (i.redeemed_at IS NOT NULL))))::integer AS self_completed,
    (count(i.id) FILTER (WHERE ((i.role = 'Supervisor'::text) AND (i.redeemed_at IS NOT NULL))))::integer AS supervisor_completed,
    (count(i.id) FILTER (WHERE ((i.role = 'Peer'::text) AND (i.redeemed_at IS NOT NULL))))::integer AS peer_completed,
    (count(i.id) FILTER (WHERE ((i.role = 'Direct Report'::text) AND (i.redeemed_at IS NOT NULL))))::integer AS direct_completed
   FROM (ml360_cycles c
     LEFT JOIN ml360_invitations i ON ((i.cycle_id = c.id)))
  GROUP BY c.id;

revoke all on public."ml360_admin_progress" from public,anon,authenticated;

grant select on public."ml360_admin_progress" to authenticated,service_role;

create policy "lcs_media_delete" on storage."objects" as PERMISSIVE for DELETE to "authenticated" using (((bucket_id = 'leadership-challenge'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text) AND (EXISTS ( SELECT 1
   FROM ml360_admins
  WHERE (ml360_admins.user_id = ( SELECT auth.uid() AS uid))))));

create policy "lcs_media_select" on storage."objects" as PERMISSIVE for SELECT to "authenticated" using (((bucket_id = 'leadership-challenge'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)));

create policy "lcs_media_insert" on storage."objects" as PERMISSIVE for INSERT to "authenticated" with check (((bucket_id = 'leadership-challenge'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text) AND (EXISTS ( SELECT 1
   FROM ml360_admins
  WHERE (ml360_admins.user_id = ( SELECT auth.uid() AS uid))))));
