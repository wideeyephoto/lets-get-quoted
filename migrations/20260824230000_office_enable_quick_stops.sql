-- Enable office access for quick stops / extra stops operations and screenings
-- under capability schedule.write.

begin;

-- 1. extra_stop_requests
alter table if exists public.extra_stop_requests enable row level security;
drop policy if exists extra_stop_requests_owner on public.extra_stop_requests;
drop policy if exists extra_stop_requests_select on public.extra_stop_requests;
drop policy if exists extra_stop_requests_insert on public.extra_stop_requests;
drop policy if exists extra_stop_requests_update on public.extra_stop_requests;
drop policy if exists extra_stop_requests_delete on public.extra_stop_requests;

create policy extra_stop_requests_select
  on public.extra_stop_requests
  for select using (
    public.office_can(account_id, 'schedule.write')
  );

create policy extra_stop_requests_insert
  on public.extra_stop_requests
  for insert with check (
    public.office_can(account_id, 'schedule.write')
  );

create policy extra_stop_requests_update
  on public.extra_stop_requests
  for update using (
    public.office_can(account_id, 'schedule.write')
  ) with check (
    public.office_can(account_id, 'schedule.write')
  );

create policy extra_stop_requests_delete
  on public.extra_stop_requests
  for delete using (
    public.office_can(account_id, 'schedule.write')
  );

-- 2. extra_stop_events
alter table if exists public.extra_stop_events enable row level security;
drop policy if exists extra_stop_events_owner on public.extra_stop_events;
drop policy if exists extra_stop_events_select on public.extra_stop_events;
drop policy if exists extra_stop_events_insert on public.extra_stop_events;

create policy extra_stop_events_select
  on public.extra_stop_events
  for select using (
    public.office_can(account_id, 'schedule.write')
  );

create policy extra_stop_events_insert
  on public.extra_stop_events
  for insert with check (
    public.office_can(account_id, 'schedule.write')
  );

-- 3. extra_stop_screenings
alter table if exists public.extra_stop_screenings enable row level security;
drop policy if exists extra_stop_screenings_read on public.extra_stop_screenings;
drop policy if exists extra_stop_screenings_select on public.extra_stop_screenings;

create policy extra_stop_screenings_select
  on public.extra_stop_screenings
  for select using (
    public.office_can(account_id, 'schedule.write')
  );

-- 4. extra_stop_zones (if table exists)
do $$
begin
  if exists (
    select 1 from pg_tables
    where schemaname = 'public' and tablename = 'extra_stop_zones'
  ) then
    execute 'alter table public.extra_stop_zones enable row level security';
    execute 'drop policy if exists extra_stop_zones_owner on public.extra_stop_zones';
    execute 'drop policy if exists extra_stop_zones_all on public.extra_stop_zones';
    execute $pol$
      create policy extra_stop_zones_all
        on public.extra_stop_zones
        for all using (
          public.office_can(account_id, 'schedule.write')
        ) with check (
          public.office_can(account_id, 'schedule.write')
        )
    $pol$;
  end if;
end $$;

commit;
