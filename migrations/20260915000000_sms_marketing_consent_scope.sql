-- Migration: 20260915000000_sms_marketing_consent_scope.sql
-- Description: Expand consent scope CHECK constraints to admit 'marketing' in sms_consent_scopes and sms_consent_evidence; add index and map marketing sources in trigger.

begin;

-- 1. Expand CHECK constraint on sms_consent_scopes
alter table public.sms_consent_scopes
  drop constraint if exists sms_consent_scopes_consent_scope_check;

alter table public.sms_consent_scopes
  add constraint sms_consent_scopes_consent_scope_check
  check (consent_scope in ('customer', 'crew', 'owner', 'marketing'));

-- 2. Expand CHECK constraint on sms_consent_evidence
alter table public.sms_consent_evidence
  drop constraint if exists sms_consent_evidence_consent_scope_check;

alter table public.sms_consent_evidence
  add constraint sms_consent_evidence_consent_scope_check
  check (consent_scope in ('customer', 'crew', 'owner', 'marketing'));

-- 3. Partial index for marketing consent lookups
create index if not exists sms_consent_scopes_marketing_lookup_idx
  on public.sms_consent_scopes (account_id, phone_number)
  where consent_scope = 'marketing';

-- 4. Update trigger function to classify marketing sources
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
    when new.source in (
      'marketing_opt_in', 'campaign_opt_in', 'promo_opt_in',
      'web_form_marketing_opt_in', 'broadcast_marketing_consent'
    ) then 'marketing'
    when new.source in ('crew_added', 'subcontractor_added') then 'crew'
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
