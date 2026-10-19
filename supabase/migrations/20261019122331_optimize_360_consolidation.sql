-- Retain one index per foreign-key access path and evaluate the caller once.
drop index public.ml360_invitations_cycle_id_idx;
drop index public.ml360_responses_cycle_id_idx;

alter policy ml360_admins_self_read on public.ml360_admins
  using (user_id=(select auth.uid()));
alter policy ml360_admin_cycles_insert on public.ml360_cycles
  with check (created_by=(select auth.uid()) and status='draft'
    and exists(select 1 from public.ml360_admins a where a.user_id=(select auth.uid())));
alter policy ml360_admin_cycles_read on public.ml360_cycles
  using (exists(select 1 from public.ml360_admins a where a.user_id=(select auth.uid())));
alter policy ml360_admin_invitation_read on public.ml360_invitations
  using (exists(select 1 from public.ml360_admins a where a.user_id=(select auth.uid())));
