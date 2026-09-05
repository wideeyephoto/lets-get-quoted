-- Migration: 20260905150000_marketing_tracking_links.sql
-- Description: Multi-user campaign tracking links, short-codes, offline QR collateral, scan tracking, and ad-spend.

begin;

create table if not exists public.marketing_tracking_links (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  short_code text not null,
  name text not null,
  channel_id text not null default 'print_qr',
  source text not null default 'yard_sign',
  medium text not null default 'print_qr',
  campaign text not null,
  content text,
  term text,
  promo text,
  destination_url text not null,
  full_url text not null,
  ad_spend numeric(10, 2) not null default 0.00,
  scan_count integer not null default 0,
  last_scanned_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  deleted_at timestamptz
);

create unique index if not exists idx_marketing_tracking_links_short_code
  on public.marketing_tracking_links(lower(short_code))
  where deleted_at is null;

create index if not exists idx_marketing_tracking_links_account
  on public.marketing_tracking_links(account_id, created_at desc)
  where deleted_at is null;

create index if not exists idx_marketing_tracking_links_campaign
  on public.marketing_tracking_links(account_id, lower(campaign))
  where deleted_at is null;

alter table public.marketing_tracking_links enable row level security;

drop policy if exists "office_users_read_marketing_tracking_links" on public.marketing_tracking_links;
create policy "office_users_read_marketing_tracking_links"
  on public.marketing_tracking_links
  for select
  to authenticated
  using (
    public.office_can(account_id, 'marketing.read')
  );

drop policy if exists "office_users_insert_marketing_tracking_links" on public.marketing_tracking_links;
create policy "office_users_insert_marketing_tracking_links"
  on public.marketing_tracking_links
  for insert
  to authenticated
  with check (
    public.office_can(account_id, 'marketing.write')
  );

drop policy if exists "office_users_update_marketing_tracking_links" on public.marketing_tracking_links;
create policy "office_users_update_marketing_tracking_links"
  on public.marketing_tracking_links
  for update
  to authenticated
  using (
    public.office_can(account_id, 'marketing.write')
  )
  with check (
    public.office_can(account_id, 'marketing.write')
  );

drop policy if exists "office_users_delete_marketing_tracking_links" on public.marketing_tracking_links;
create policy "office_users_delete_marketing_tracking_links"
  on public.marketing_tracking_links
  for delete
  to authenticated
  using (
    public.office_can(account_id, 'marketing.write')
  );

grant select, insert, update, delete on public.marketing_tracking_links to authenticated;
revoke all on public.marketing_tracking_links from anon, public;

commit;
