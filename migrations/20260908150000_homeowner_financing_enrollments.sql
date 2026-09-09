-- Migration: 20260908150000_homeowner_financing_enrollments.sql
-- Description: Homeowner financing partner enrollments (Stage 0: Acorn Finance referral foundation)

create table if not exists public.homeowner_financing_enrollments (
  id                   uuid primary key default gen_random_uuid(),
  account_id           uuid not null references public.accounts(id) on delete cascade,
  provider             text not null default 'acorn'
                         check (provider in ('acorn')),
  provider_code        text,                     -- dealer/partner code (e.g. Acorn ?d=<code>)
  status               text not null default 'pending'
                         check (status in ('pending','active','suspended','declined')),
  enabled_on_quotes    boolean not null default false,
  enabled_on_invoices  boolean not null default false,
  enrolled_at          timestamptz,
  disabled_reason      text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create unique index if not exists homeowner_financing_one_per_account
  on public.homeowner_financing_enrollments (account_id, provider);

create index if not exists homeowner_financing_account_idx
  on public.homeowner_financing_enrollments (account_id);

-- RLS
alter table public.homeowner_financing_enrollments enable row level security;
revoke all on public.homeowner_financing_enrollments from anon, authenticated;
grant select on public.homeowner_financing_enrollments to authenticated;

drop policy if exists homeowner_financing_read on public.homeowner_financing_enrollments;
create policy homeowner_financing_read on public.homeowner_financing_enrollments
  for select to authenticated
  using (public.office_can(account_id, 'settings.write'));
