-- Universal RLS Suspension Hardening for Direct auth.uid() Policies
-- Ensures all policies directly comparing auth.uid() join accounts and enforce accounts.suspended_at IS NULL.

begin;

-- 1. crew self read
drop policy if exists crew_self_read on public.crew;
create policy crew_self_read on public.crew
  for select using (
    user_id = auth.uid()
    and exists (
      select 1 from public.accounts a
      where a.id = crew.account_id
        and a.suspended_at is null
    )
  );

-- 2. quick stop priority zones owner policy
drop policy if exists quick_stop_priority_zones_owner on public.quick_stop_priority_zones;
create policy quick_stop_priority_zones_owner on public.quick_stop_priority_zones
  for all using (
    exists (
      select 1
      from public.memberships m
      join public.accounts a on a.id = m.account_id
      where m.account_id = quick_stop_priority_zones.account_id
        and m.user_id = auth.uid()
        and m.role = 'owner'
        and a.suspended_at is null
    )
  )
  with check (
    exists (
      select 1
      from public.memberships m
      join public.accounts a on a.id = m.account_id
      where m.account_id = quick_stop_priority_zones.account_id
        and m.user_id = auth.uid()
        and m.role = 'owner'
        and a.suspended_at is null
    )
  );

-- 3. milestone_photos and job_milestones crew policies
drop policy if exists milestone_photos_crew_insert on public.milestone_photos;
create policy milestone_photos_crew_insert on public.milestone_photos
  for insert with check (
    exists (
      select 1
      from public.crew_assignments ca
      join public.crew c on c.id = ca.crew_id
      join public.accounts a on a.id = ca.account_id
      where ca.account_id = milestone_photos.account_id
        and ca.job_id = milestone_photos.job_id
        and c.user_id = auth.uid()
        and a.suspended_at is null
    )
  );

drop policy if exists milestone_photos_crew_read on public.milestone_photos;
create policy milestone_photos_crew_read on public.milestone_photos
  for select using (
    exists (
      select 1
      from public.crew_assignments ca
      join public.crew c on c.id = ca.crew_id
      join public.accounts a on a.id = ca.account_id
      where ca.account_id = milestone_photos.account_id
        and ca.job_id = milestone_photos.job_id
        and c.user_id = auth.uid()
        and a.suspended_at is null
    )
  );

drop policy if exists job_milestones_crew_read on public.job_milestones;
create policy job_milestones_crew_read on public.job_milestones
  for select using (
    exists (
      select 1
      from public.crew_assignments ca
      join public.crew c on c.id = ca.crew_id
      join public.accounts a on a.id = ca.account_id
      where ca.account_id = job_milestones.account_id
        and ca.job_id = job_milestones.job_id
        and c.user_id = auth.uid()
        and a.suspended_at is null
    )
  );

-- 4. change_orders crew policies
drop policy if exists change_orders_select on public.change_orders;
create policy change_orders_select on public.change_orders
  for select using (
    public.office_can(account_id, 'jobs.read')
    or (
      crew_id in (
        select c.id
        from public.crew c
        join public.accounts a on a.id = c.account_id
        where c.account_id = change_orders.account_id
          and c.user_id = auth.uid()
          and a.suspended_at is null
      )
    )
  );

drop policy if exists change_orders_insert on public.change_orders;
create policy change_orders_insert on public.change_orders
  for insert with check (
    public.office_can(account_id, 'jobs.write')
    or (
      crew_id in (
        select c.id
        from public.crew c
        join public.accounts a on a.id = c.account_id
        where c.account_id = change_orders.account_id
          and c.user_id = auth.uid()
          and a.suspended_at is null
      )
    )
  );

-- 5. office_member_capabilities self read
drop policy if exists office_member_capabilities_self_read on public.office_member_capabilities;
create policy office_member_capabilities_self_read on public.office_member_capabilities
  for select using (
    user_id = auth.uid()
    and exists (
      select 1 from public.accounts a
      where a.id = office_member_capabilities.account_id
        and a.suspended_at is null
    )
  );

commit;
