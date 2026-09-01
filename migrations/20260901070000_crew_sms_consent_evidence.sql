-- Migration: 20260901070000_crew_sms_consent_evidence.sql
-- Description: Audited SMS consent evidence ledger for crew members with RLS and explicit grants.

begin;

-- ============================================================================
-- 1. Create sms_consent_evidence table
-- ============================================================================

create table if not exists public.sms_consent_evidence (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null,
  phone_number text not null
    check (phone_number ~ '^\+[1-9][0-9]{7,14}$'),
  consent_scope text not null default 'crew'
    check (consent_scope in ('customer', 'crew', 'owner')),
  disclosure_version text not null
    check (
      pg_catalog.length(disclosure_version) between 1 and 100
      and disclosure_version !~ '[[:cntrl:]]'
    ),
  disclosure_text text not null,
  disclosure_hash text not null
    check (pg_catalog.length(disclosure_hash) = 64),
  consented_by_user_id uuid,
  consented_at timestamptz not null default pg_catalog.now(),
  source text not null default 'crew_roster'
    check (
      pg_catalog.length(source) between 1 and 100
      and source !~ '[[:cntrl:]]'
    ),
  source_page text not null default '/dashboard/crew'
    check (
      pg_catalog.length(source_page) between 1 and 200
      and source_page !~ '[[:cntrl:]]'
    ),
  crew_id uuid,
  created_at timestamptz not null default pg_catalog.now()
);

create index if not exists idx_sms_consent_evidence_account_phone
  on public.sms_consent_evidence (account_id, phone_number);

create index if not exists idx_sms_consent_evidence_crew_id
  on public.sms_consent_evidence (crew_id)
  where crew_id is not null;

create index if not exists idx_sms_consent_evidence_account_created
  on public.sms_consent_evidence (account_id, created_at desc);

-- ============================================================================
-- 2. Enable and force RLS on sms_consent_evidence
-- ============================================================================

alter table public.sms_consent_evidence enable row level security;
alter table public.sms_consent_evidence force row level security;

drop policy if exists sms_consent_evidence_owner_read on public.sms_consent_evidence;
create policy sms_consent_evidence_owner_read on public.sms_consent_evidence
  for select
  using ( is_owner(account_id) );

-- ============================================================================
-- 3. Explicit table-level privileges (Supabase 2026 posture)
-- ============================================================================

revoke all on table public.sms_consent_evidence from anon, public;
grant select on table public.sms_consent_evidence to authenticated;
grant all on table public.sms_consent_evidence to service_role;

-- ============================================================================
-- 4. Update establish_sms_consent_scope_from_source to handle crew_roster
-- ============================================================================

create or replace function public.establish_sms_consent_scope_from_source()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $$
declare
  v_scope text;
begin
  if new.status <> 'opted_in' or new.consented_at is null then
    return new;
  end if;
  v_scope := case
    when new.source in (
      'payment_request', 'lead_quote_visit', 'lead_quote_visit_options',
      'client_job_dashboard', 'lead_decline', 'job_update',
      'review_request', 'arrival_time_changed', 'reschedule_offer',
      'estimate_offer', 'schedule_request', 'lead_verification_request',
      'portal_link_request', 'missed_call_text_back', 'authenticated_inbound'
    ) then 'customer'
    when new.source in ('crew_added', 'subcontractor_added', 'crew_roster') then 'crew'
    when new.source = 'owner_alerts' then 'owner'
    else null
  end;
  if v_scope is not null then
    insert into public.sms_consent_scopes (
      account_id, phone_number, consent_scope, evidence_source, established_at
    ) values (
      new.account_id, new.phone_number, v_scope, new.source,
      coalesce(new.consented_at, pg_catalog.clock_timestamp())
    ) on conflict (account_id, phone_number, consent_scope) do nothing;
  end if;
  return new;
end;
$$;

commit;
