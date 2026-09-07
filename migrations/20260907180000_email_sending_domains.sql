-- Migration: 20260907180000_email_sending_domains.sql
-- Description: Customer-owned email sending domains (Scope A: outbound custom sending domain)

create table if not exists public.email_sending_domains (
  id                 uuid primary key default gen_random_uuid(),
  account_id         uuid not null references public.accounts(id) on delete cascade,
  domain             text not null,
  from_local_part    text not null default 'hello',
  from_display_name  text,
  provider           text not null default 'resend',
  provider_domain_id text,
  status             text not null default 'pending'
                       check (status in ('pending','verified','failed','disabled')),
  dns_records        jsonb not null default '[]'::jsonb,
  last_checked_at    timestamptz,
  verified_at        timestamptz,
  failure_reason     text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- Global, not per-account. Two tenants must never send as the same domain.
create unique index if not exists email_sending_domains_domain_key on public.email_sending_domains (lower(domain));
create unique index if not exists email_sending_domains_provider_key
  on public.email_sending_domains (provider_domain_id) where provider_domain_id is not null;
create index if not exists email_sending_domains_account_idx on public.email_sending_domains (account_id);

-- One verified sending domain per account for v1. Widening this later is additive.
create unique index if not exists email_sending_domains_one_verified_per_account
  on public.email_sending_domains (account_id) where status = 'verified';

-- RLS
alter table public.email_sending_domains enable row level security;
revoke all on public.email_sending_domains from anon, authenticated;
grant select on public.email_sending_domains to authenticated;

drop policy if exists email_sending_domains_read on public.email_sending_domains;
create policy email_sending_domains_read on public.email_sending_domains
  for select to authenticated
  using (public.office_can(account_id, 'settings.write'));
