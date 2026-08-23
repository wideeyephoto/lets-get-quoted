-- Enable crew_pay.read and crew_pay.write in public.office_capabilities
-- and update RLS policies for crew_pay_periods, crew_pay_entries, crew_pay_events, and time_entries.

begin;

update public.office_capabilities
   set enabled = true,
       updated_at = pg_catalog.now()
 where capability in ('crew_pay.read', 'crew_pay.write');

-- 1. crew_pay_periods
alter table if exists public.crew_pay_periods enable row level security;
drop policy if exists crew_pay_period_owner on public.crew_pay_periods;
drop policy if exists crew_pay_period_select on public.crew_pay_periods;
drop policy if exists crew_pay_period_modify on public.crew_pay_periods;

create policy crew_pay_period_select on public.crew_pay_periods
  for select using (
    public.office_can(account_id, 'crew_pay.read')
  );

create policy crew_pay_period_modify on public.crew_pay_periods
  for all using (
    public.office_can(account_id, 'crew_pay.write')
  ) with check (
    public.office_can(account_id, 'crew_pay.write')
  );

-- 2. crew_pay_entries
alter table if exists public.crew_pay_entries enable row level security;
drop policy if exists crew_pay_entry_owner on public.crew_pay_entries;
drop policy if exists crew_pay_entry_select on public.crew_pay_entries;
drop policy if exists crew_pay_entry_modify on public.crew_pay_entries;

create policy crew_pay_entry_select on public.crew_pay_entries
  for select using (
    public.office_can(account_id, 'crew_pay.read')
  );

create policy crew_pay_entry_modify on public.crew_pay_entries
  for all using (
    public.office_can(account_id, 'crew_pay.write')
  ) with check (
    public.office_can(account_id, 'crew_pay.write')
  );

-- 3. crew_pay_events
alter table if exists public.crew_pay_events enable row level security;
drop policy if exists crew_pay_event_owner_read on public.crew_pay_events;
drop policy if exists crew_pay_event_owner_insert on public.crew_pay_events;
drop policy if exists crew_pay_event_select on public.crew_pay_events;
drop policy if exists crew_pay_event_insert on public.crew_pay_events;

create policy crew_pay_event_select on public.crew_pay_events
  for select using (
    public.office_can(account_id, 'crew_pay.read')
  );

create policy crew_pay_event_insert on public.crew_pay_events
  for insert with check (
    public.office_can(account_id, 'crew_pay.write')
  );

-- 4. time_entries
alter table if exists public.time_entries enable row level security;
drop policy if exists time_entry_owner on public.time_entries;
drop policy if exists time_entry_office_select on public.time_entries;
drop policy if exists time_entry_office_modify on public.time_entries;

create policy time_entry_office_select on public.time_entries
  for select using (
    public.office_can(account_id, 'crew.read')
    or public.office_can(account_id, 'crew_pay.read')
    or public.office_can(account_id, 'jobs.read')
  );

create policy time_entry_office_modify on public.time_entries
  for all using (
    public.office_can(account_id, 'crew.write')
    or public.office_can(account_id, 'crew_pay.write')
  ) with check (
    public.office_can(account_id, 'crew.write')
    or public.office_can(account_id, 'crew_pay.write')
  );

commit;
