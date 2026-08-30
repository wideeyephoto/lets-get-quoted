-- Universal RLS Suspension Hardening for Direct auth.uid() Policies
-- Ensures all policies directly comparing auth.uid() route through SECURITY DEFINER helpers that enforce accounts.suspended_at IS NULL.

begin;

-- 1. crew self read
drop policy if exists crew_self_read on public.crew;
create policy crew_self_read on public.crew
  for select using (
    user_id = auth.uid()
    and public.crew_owns_crew_row(id)
  );

-- 2. quick stop priority zones owner policy
drop policy if exists quick_stop_priority_zone_owner on public.quick_stop_priority_zones;
drop policy if exists quick_stop_priority_zones_owner on public.quick_stop_priority_zones;
create policy quick_stop_priority_zones_owner on public.quick_stop_priority_zones
  for all using (
    public.is_owner(account_id)
  )
  with check (
    public.is_owner(account_id)
  );

-- 3. milestone_photos and job_milestones crew policies
drop policy if exists milestone_photos_crew_insert on public.milestone_photos;
-- crew_on_job() adds the suspension check; the EXISTS is the installed policy's
-- tenant tie and MUST stay. The helper alone leaves the inserted row's
-- account_id completely unconstrained: any crew user assigned to any job could
-- INSERT a row carrying another tenant's account_id, and that row then renders
-- to the victim tenant's office users through milestone_photos_select. This is
-- a payment-gating evidence table -- keep the account tie.
create policy milestone_photos_crew_insert on public.milestone_photos
  for insert with check (
    public.crew_on_job(job_id)
    and exists (
      select 1
        from public.crew_assignments ca
        join public.crew c on c.id = ca.crew_id
       where ca.account_id = milestone_photos.account_id
         and ca.job_id = milestone_photos.job_id
         and c.user_id = auth.uid()
    )
  );

drop policy if exists milestone_photos_crew_read on public.milestone_photos;
create policy milestone_photos_crew_read on public.milestone_photos
  for select using (
    public.crew_on_job(job_id)
  );

drop policy if exists job_milestones_crew_read on public.job_milestones;
create policy job_milestones_crew_read on public.job_milestones
  for select using (
    public.crew_on_job(job_id)
  );

-- 4. change_orders crew policies
-- crew_owns_crew_row() adds the suspension check; the crew_id IN (...) subquery
-- is the installed policy's crew-to-account tie and MUST stay. The helper alone
-- lets a crew member write a change order into ANY account_id while naming
-- their own crew row -- change_orders is a money surface (its payment_id FK
-- points at payments), and the forged row would surface to the victim tenant's
-- office users through the office_can branch.
drop policy if exists change_orders_select on public.change_orders;
create policy change_orders_select on public.change_orders
  for select using (
    public.office_can(account_id, 'jobs.read')
    or (
      public.crew_owns_crew_row(crew_id)
      and crew_id in (
        select c.id
          from public.crew c
         where c.account_id = change_orders.account_id
           and c.user_id = auth.uid()
      )
    )
  );

drop policy if exists change_orders_insert on public.change_orders;
create policy change_orders_insert on public.change_orders
  for insert with check (
    public.office_can(account_id, 'jobs.write')
    or (
      public.crew_owns_crew_row(crew_id)
      and crew_id in (
        select c.id
          from public.crew c
         where c.account_id = change_orders.account_id
           and c.user_id = auth.uid()
      )
    )
  );

-- 5. office_member_capabilities self read
drop policy if exists office_member_capabilities_self_read on public.office_member_capabilities;
create policy office_member_capabilities_self_read on public.office_member_capabilities
  for select using (
    user_id = auth.uid()
    and public.is_member(account_id)
  );

commit;
