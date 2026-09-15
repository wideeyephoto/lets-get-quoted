-- Migration: 20260915010000_sms_campaign_lifecycle_and_canary.sql
-- Description: Add 10DLC campaign lifecycle and carrier rate limit columns to messaging_registration_applications, and create sms_canary_probes for reachability health tracking.

begin;

-- 1. Campaign lifecycle and carrier limits on messaging_registration_applications
alter table public.messaging_registration_applications
  add column if not exists campaign_renewal_at timestamptz,
  add column if not exists brand_revet_at timestamptz,
  add column if not exists max_assigned_numbers integer not null default 49,
  add column if not exists att_sms_per_minute_cap integer not null default 75,
  add column if not exists att_mms_per_minute_cap integer not null default 50,
  add column if not exists tmobile_daily_brand_cap integer not null default 2000;

-- 2. Create sms_canary_probes table
create table if not exists public.sms_canary_probes (
  id uuid primary key default gen_random_uuid(),
  account_id uuid,
  phone_number text not null
    check (phone_number ~ '^\+[1-9][0-9]{7,14}$'),
  provider text not null
    check (provider in ('signalwire', 'twilio', 'simulated')),
  provider_message_id text,
  status text not null
    check (status in ('dispatched', 'confirmed', 'failed', 'timeout')),
  dispatched_at timestamptz not null default clock_timestamp(),
  confirmed_at timestamptz,
  latency_ms integer,
  error_message text,
  created_at timestamptz not null default clock_timestamp()
);

create index if not exists idx_sms_canary_probes_dispatched
  on public.sms_canary_probes (dispatched_at desc);

create index if not exists idx_sms_canary_probes_provider_msg
  on public.sms_canary_probes (provider_message_id)
  where provider_message_id is not null;

-- 3. RLS and Grants
alter table public.sms_canary_probes enable row level security;
alter table public.sms_canary_probes force row level security;

revoke all on table public.sms_canary_probes from anon, public;
grant select, insert, update on table public.sms_canary_probes to service_role;
grant select on table public.sms_canary_probes to authenticated;

commit;
