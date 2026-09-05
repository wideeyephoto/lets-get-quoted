-- Migration: 20260905180000_neighborhood_halo_campaigns.sql
-- Description: Schema and RLS for Neighborhood Halo 1-Mile Micro-Ads persistence and settings.

begin;

create table if not exists public.neighborhood_halo_settings (
  account_id uuid primary key references public.accounts(id) on delete cascade,
  auto_launch_enabled boolean not null default false,
  default_radius_miles numeric(4, 2) not null default 1.00,
  per_job_budget_dollars numeric(10, 2) not null default 25.00,
  monthly_spend_cap_dollars numeric(10, 2) not null default 250.00,
  require_photos boolean not null default true,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);

alter table public.neighborhood_halo_settings enable row level security;

drop policy if exists "office_users_read_neighborhood_halo_settings" on public.neighborhood_halo_settings;
create policy "office_users_read_neighborhood_halo_settings"
  on public.neighborhood_halo_settings
  for select
  to authenticated
  using (
    public.office_can(account_id, 'marketing.read')
  );

drop policy if exists "office_users_insert_neighborhood_halo_settings" on public.neighborhood_halo_settings;
create policy "office_users_insert_neighborhood_halo_settings"
  on public.neighborhood_halo_settings
  for insert
  to authenticated
  with check (
    public.office_can(account_id, 'marketing.write')
  );

drop policy if exists "office_users_update_neighborhood_halo_settings" on public.neighborhood_halo_settings;
create policy "office_users_update_neighborhood_halo_settings"
  on public.neighborhood_halo_settings
  for update
  to authenticated
  using (
    public.office_can(account_id, 'marketing.write')
  )
  with check (
    public.office_can(account_id, 'marketing.write')
  );


create table if not exists public.neighborhood_halo_campaigns (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete set null,
  status text not null default 'draft' check (status in ('draft', 'pending_provisioning', 'active', 'paused', 'completed', 'killed', 'simulated_sandbox', 'failed')),
  street_name text not null,
  neighborhood_name text,
  city text not null,
  state text,
  zip text,
  center_lat numeric(10, 7),
  center_lng numeric(10, 7),
  radius_miles numeric(4, 2) not null default 1.00,
  budget_dollars numeric(10, 2) not null default 25.00,
  spend_dollars numeric(10, 2) not null default 0.00,
  daily_budget_dollars numeric(10, 2) not null default 5.00,
  duration_days integer not null default 5,
  days_active integer not null default 0,
  impressions integer not null default 0,
  clicks integer not null default 0,
  leads_generated integer not null default 0,
  ad_copy jsonb not null default '{}'::jsonb,
  before_photo_url text,
  after_photo_url text,
  google_campaign_id text,
  google_campaign_resource text,
  meta_campaign_id text,
  landing_page_url text not null,
  auto_killed_at timestamptz,
  auto_kill_reason text,
  expires_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  deleted_at timestamptz
);

create index if not exists idx_halo_campaigns_account_status
  on public.neighborhood_halo_campaigns(account_id, status)
  where deleted_at is null;

create index if not exists idx_halo_campaigns_job
  on public.neighborhood_halo_campaigns(job_id)
  where deleted_at is null;

create index if not exists idx_halo_campaigns_created
  on public.neighborhood_halo_campaigns(account_id, created_at desc)
  where deleted_at is null;

create index if not exists idx_halo_campaigns_pacing
  on public.neighborhood_halo_campaigns(status, created_at)
  where deleted_at is null and status = 'active';

alter table public.neighborhood_halo_campaigns enable row level security;

drop policy if exists "office_users_read_neighborhood_halo_campaigns" on public.neighborhood_halo_campaigns;
create policy "office_users_read_neighborhood_halo_campaigns"
  on public.neighborhood_halo_campaigns
  for select
  to authenticated
  using (
    public.office_can(account_id, 'marketing.read')
  );

drop policy if exists "office_users_insert_neighborhood_halo_campaigns" on public.neighborhood_halo_campaigns;
create policy "office_users_insert_neighborhood_halo_campaigns"
  on public.neighborhood_halo_campaigns
  for insert
  to authenticated
  with check (
    public.office_can(account_id, 'marketing.write')
  );

drop policy if exists "office_users_update_neighborhood_halo_campaigns" on public.neighborhood_halo_campaigns;
create policy "office_users_update_neighborhood_halo_campaigns"
  on public.neighborhood_halo_campaigns
  for update
  to authenticated
  using (
    public.office_can(account_id, 'marketing.write')
  )
  with check (
    public.office_can(account_id, 'marketing.write')
  );

commit;
