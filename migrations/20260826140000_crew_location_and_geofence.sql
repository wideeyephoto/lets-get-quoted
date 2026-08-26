-- Migration: 20260826140000_crew_location_and_geofence.sql
-- Live Crew Operations, Telemetry State, Geofencing, and Location Capabilities

begin;

-- 1. Create crew_location_state table for current-state foreground telemetry
create table if not exists public.crew_location_state (
  account_id        uuid not null references public.accounts(id) on delete cascade,
  crew_id           uuid not null references public.crew(id) on delete cascade,
  time_entry_id     uuid references public.time_entries(id) on delete set null,
  job_id            uuid references public.jobs(id) on delete set null,

  lat               double precision not null,
  lng               double precision not null,
  accuracy_m        numeric(8,2),
  heading_deg       numeric(5,2),
  speed_mps         numeric(6,2),

  captured_at       timestamptz not null default pg_catalog.now(),
  received_at       timestamptz not null default pg_catalog.now(),
  expires_at        timestamptz not null default (pg_catalog.now() + interval '10 minutes'),

  source            text not null default 'shift',
  client_sequence   bigint not null default 1,
  permission_state  text not null default 'granted',

  created_at        timestamptz not null default pg_catalog.now(),
  updated_at        timestamptz not null default pg_catalog.now(),

  constraint crew_location_state_pkey primary key (account_id, crew_id),
  constraint crew_location_state_source_check check (source in ('shift', 'arrival', 'manual_refresh')),
  constraint crew_location_state_permission_check check (permission_state in ('granted', 'denied', 'prompt')),
  constraint crew_location_state_lat_range check (lat >= -90.0 and lat <= 90.0),
  constraint crew_location_state_lng_range check (lng >= -180.0 and lng <= 180.0)
);

create index if not exists crew_location_state_account_captured_idx
  on public.crew_location_state (account_id, captured_at desc);

create index if not exists crew_location_state_crew_idx
  on public.crew_location_state (crew_id);

create index if not exists crew_location_state_job_idx
  on public.crew_location_state (job_id) where job_id is not null;

create index if not exists crew_location_state_expires_idx
  on public.crew_location_state (expires_at);

-- 2. Account level policy and default geofence configuration
alter table public.accounts add column if not exists work_location_policy text not null default 'during_active_shift';
alter table public.accounts add column if not exists geofence_radius_feet integer not null default 200;

do $$ begin
  alter table public.accounts add constraint accounts_work_location_policy_check
    check (work_location_policy in ('off', 'ask', 'during_active_shift'));
exception when duplicate_object then null; end $$;

-- 3. Per-crew work location sharing consent
alter table public.crew add column if not exists can_share_work_location boolean not null default true;

-- 4. Clock evidence audit fields on time_entries
alter table public.time_entries add column if not exists clock_in_geofence_status text;
alter table public.time_entries add column if not exists clock_in_distance_ft numeric(10,2);
alter table public.time_entries add column if not exists clock_in_accuracy_m numeric(8,2);
alter table public.time_entries add column if not exists clock_in_verified_at timestamptz;
alter table public.time_entries add column if not exists clock_in_gps_unavailable boolean default false;

alter table public.time_entries add column if not exists clock_out_geofence_status text;
alter table public.time_entries add column if not exists clock_out_distance_ft numeric(10,2);
alter table public.time_entries add column if not exists clock_out_accuracy_m numeric(8,2);
alter table public.time_entries add column if not exists clock_out_verified_at timestamptz;

-- 5. Capabilities are governed under existing crew.read / crew.write permissions.

-- 6. Enable Row Level Security on crew_location_state
alter table public.crew_location_state enable row level security;

drop policy if exists crew_location_owner on public.crew_location_state;
drop policy if exists crew_location_office_select on public.crew_location_state;
drop policy if exists crew_location_office_modify on public.crew_location_state;
drop policy if exists crew_location_crew_read on public.crew_location_state;
drop policy if exists crew_location_crew_upsert on public.crew_location_state;

-- Owner full access
create policy crew_location_owner on public.crew_location_state
  for all using ( public.is_owner(account_id) );

-- Office staff with crew.read
create policy crew_location_office_select on public.crew_location_state
  for select using (
    public.office_can(account_id, 'crew.read')
  );

-- Office staff with crew.write
create policy crew_location_office_modify on public.crew_location_state
  for all using (
    public.office_can(account_id, 'crew.write')
  ) with check (
    public.office_can(account_id, 'crew.write')
  );

-- Crew members can select their own location state
create policy crew_location_crew_read on public.crew_location_state
  for select using ( public.crew_owns_crew_row(crew_id) );

-- Crew members can insert and update their own location state
create policy crew_location_crew_upsert on public.crew_location_state
  for all using ( public.crew_owns_crew_row(crew_id) )
  with check ( public.crew_owns_crew_row(crew_id) );

commit;
