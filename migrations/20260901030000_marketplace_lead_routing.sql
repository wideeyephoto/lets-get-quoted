-- Marketplace Lead Routing and Meta Lead Ads Ingress
--
-- Adds:
--   1. source_marketplace_ref column and uniqueness index on public.leads for replay-safe deduplication
--   2. marketplace_lead_receipts audit ledger for raw webhook payloads, verification results, and routing dispositions
--   3. Updates lead_source enum and constraints if applicable

begin;

-- 1. Add source_marketplace_ref to public.leads
alter table public.leads
  add column if not exists source_marketplace_ref text;

create unique index if not exists leads_source_marketplace_ref_idx
  on public.leads (source_marketplace_ref)
  where source_marketplace_ref is not null;

-- 2. Audit table for marketplace lead ingress receipts
create table if not exists public.marketplace_lead_receipts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references public.accounts(id) on delete cascade,
  provider text not null,
  provider_lead_id text not null,
  idempotency_key text not null unique,
  disposition text not null default 'pending',
  lead_id uuid references public.leads(id) on delete set null,
  raw_payload jsonb not null default '{}'::jsonb,
  signature_verified boolean not null default false,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists marketplace_lead_receipts_account_idx
  on public.marketplace_lead_receipts (account_id, received_at desc);

create index if not exists marketplace_lead_receipts_provider_idx
  on public.marketplace_lead_receipts (provider, provider_lead_id);

alter table public.marketplace_lead_receipts enable row level security;

drop policy if exists marketplace_lead_receipts_owner on public.marketplace_lead_receipts;
create policy marketplace_lead_receipts_owner on public.marketplace_lead_receipts
  for select using (account_id is not null and is_owner(account_id));

revoke all on public.marketplace_lead_receipts from public, anon, authenticated;
grant select, insert, update on public.marketplace_lead_receipts to service_role;

commit;
