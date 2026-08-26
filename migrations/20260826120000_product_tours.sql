-- Migration: Product tour progress persistence & aggregate tour event telemetry
--
-- 1. Create public.product_tour_progress for cross-device signed-in tour state.
-- 2. Create public.product_tour_events for append-only, privacy-safe funnel telemetry.

begin;

-- 1. Product tour progress table
create table if not exists public.product_tour_progress (
  account_id uuid not null references public.accounts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  tour_key text not null,
  tour_version integer not null default 1,
  status text not null default 'active' check (status in ('active', 'dismissed', 'completed')),
  current_step_id text not null,
  started_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  dismissed_at timestamptz,
  completed_at timestamptz,
  primary key (account_id, user_id, tour_key, tour_version)
);

create index if not exists idx_product_tour_progress_account_user
  on public.product_tour_progress (account_id, user_id);

alter table public.product_tour_progress enable row level security;

drop policy if exists product_tour_progress_select on public.product_tour_progress;
create policy product_tour_progress_select
  on public.product_tour_progress
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists product_tour_progress_insert on public.product_tour_progress;
create policy product_tour_progress_insert
  on public.product_tour_progress
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists product_tour_progress_update on public.product_tour_progress;
create policy product_tour_progress_update
  on public.product_tour_progress
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists product_tour_progress_delete on public.product_tour_progress;
create policy product_tour_progress_delete
  on public.product_tour_progress
  for delete
  to authenticated
  using (user_id = auth.uid());

grant select, insert, update, delete on table public.product_tour_progress to authenticated;

-- 2. Product tour telemetry events table
create table if not exists public.product_tour_events (
  id uuid not null default gen_random_uuid() primary key,
  client_event_id text not null,
  tour_key text not null,
  tour_version integer not null default 1,
  event_type text not null,
  step_id text,
  account_id uuid references public.accounts(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  anonymous_session_id text,
  role text,
  source text,
  pathname text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default pg_catalog.now()
);

create index if not exists idx_product_tour_events_lookup
  on public.product_tour_events (tour_key, tour_version, event_type, created_at);

create index if not exists idx_product_tour_events_client_id
  on public.product_tour_events (client_event_id);

create index if not exists idx_product_tour_events_account_user
  on public.product_tour_events (account_id, user_id);

alter table public.product_tour_events enable row level security;

drop policy if exists product_tour_events_select on public.product_tour_events;
create policy product_tour_events_select
  on public.product_tour_events
  for select
  to authenticated
  using (user_id = auth.uid() or public.is_owner(account_id));

drop policy if exists product_tour_events_insert on public.product_tour_events;
create policy product_tour_events_insert
  on public.product_tour_events
  for insert
  to authenticated
  with check (user_id = auth.uid() or user_id is null);

grant select, insert on table public.product_tour_events to authenticated;
grant select, insert on table public.product_tour_events to anon;

commit;
