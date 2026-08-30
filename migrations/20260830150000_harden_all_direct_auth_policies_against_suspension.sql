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
create policy milestone_photos_crew_insert on public.milestone_photos
  for insert with check (
    public.crew_on_job(job_id)
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
drop policy if exists change_orders_select on public.change_orders;
create policy change_orders_select on public.change_orders
  for select using (
    public.office_can(account_id, 'jobs.read')
    or public.crew_owns_crew_row(crew_id)
  );

drop policy if exists change_orders_insert on public.change_orders;
create policy change_orders_insert on public.change_orders
  for insert with check (
    public.office_can(account_id, 'jobs.write')
    or public.crew_owns_crew_row(crew_id)
  );

-- 5. office_member_capabilities self read
drop policy if exists office_member_capabilities_self_read on public.office_member_capabilities;
create policy office_member_capabilities_self_read on public.office_member_capabilities
  for select using (
    user_id = auth.uid()
    and public.is_member(account_id)
  );

commit;
