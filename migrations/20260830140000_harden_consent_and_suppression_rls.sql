-- ============================================================================
-- HARDEN SMS CONSENT AND EMAIL SUPPRESSION RLS POLICIES
--
-- Security fix: Restricts authenticated owner access to SELECT-only.
--
-- Prevents browser-session tampering (e.g. deleting customer opt-outs or
-- manually forging consent). All mutations must execute via service-role RPCs,
-- signed webhook receivers, or verified server-side actions.
-- ============================================================================

begin;

-- 1. sms_consent
drop policy if exists sms_consent_all on public.sms_consent;
drop policy if exists sms_consent_owner_read on public.sms_consent;

create policy sms_consent_owner_read on public.sms_consent
  for select
  using ( is_owner(account_id) );

-- 2. email_suppression
drop policy if exists email_suppression_all on public.email_suppression;
drop policy if exists email_suppression_owner_read on public.email_suppression;

create policy email_suppression_owner_read on public.email_suppression
  for select
  using ( is_owner(account_id) );

commit;
