-- Migration: 20260909150000_platform_campaign_dispatches.sql
-- Description: Platform campaign dispatches table for insert-first idempotency

create table if not exists public.platform_campaign_dispatches (
  idempotency_key text primary key,
  campaign_id text not null,
  status text not null default 'dispatching',
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  sent_count integer default 0,
  failed_count integer default 0,
  details jsonb default '{}'::jsonb
);

-- Enforce Row Level Security
alter table public.platform_campaign_dispatches enable row level security;

-- Enforce zero public access (REVOKE ALL from anon, authenticated, public)
revoke all on table public.platform_campaign_dispatches from public, anon, authenticated;

-- Grant access strictly to service_role
grant select, insert, update on table public.platform_campaign_dispatches to service_role;
