-- Migration: 20260909130000_ignore_test_mode_subscription_rehearsals.sql
-- Purpose: Provide ignore_test_mode_stripe_billing_subscription_event RPC for
-- live production workers to ignore test-mode rehearsal events without failing,
-- and clear the 185 stuck test-mode billing events from 2026-09-07 -> 09-08.

create or replace function public.ignore_test_mode_stripe_billing_subscription_event(
  p_billing_event_id uuid,
  p_claim_token uuid
)
returns text
language plpgsql
security definer
set search_path = ''
set timezone to 'UTC'
as $fn$
declare
  v_event public.billing_events%rowtype;
begin
  if p_billing_event_id is null or p_claim_token is null then
    raise exception 'test mode subscription ignore input is invalid' using errcode = '22023';
  end if;

  select e.* into v_event
    from public.billing_events e
   where e.id = p_billing_event_id
   for update;

  if not found
     or v_event.event_scope <> 'platform_subscription'
     or v_event.processing_status <> 'processing'
     or v_event.projection_claim_token is distinct from p_claim_token
     or v_event.projection_lease_expires_at <= pg_catalog.now() then
    raise exception 'subscription projection claim is not owned or expired'
      using errcode = '55000';
  end if;

  update public.billing_events e
     set processing_status = 'ignored',
         processed_at = pg_catalog.now(),
         next_attempt_at = null,
         last_error = null,
         projection_claim_token = null,
         projection_lease_expires_at = null,
         projection_schema_version = 'stripe_subscription_projection_v1',
         projection_applied = false,
         projection_result = 'test_mode_rehearsal_ignored'
   where e.id = v_event.id;

  return 'test_mode_rehearsal_ignored';
end;
$fn$;

comment on function public.ignore_test_mode_stripe_billing_subscription_event(uuid, uuid) is
  'Records a claimed platform_subscription event as an ignored test-mode rehearsal event in a live production worker, rather than dead-lettering it as a failure.';

revoke all on function public.ignore_test_mode_stripe_billing_subscription_event(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.ignore_test_mode_stripe_billing_subscription_event(uuid, uuid)
  to service_role;

-- T14: Clear the 185 stuck test-mode billing events
update public.billing_events e
   set processing_status = 'ignored',
       processed_at = pg_catalog.now(),
       next_attempt_at = null,
       last_error = null,
       projection_claim_token = null,
       projection_lease_expires_at = null,
       projection_schema_version = 'stripe_subscription_projection_v1',
       projection_applied = false,
       projection_result = 'test_mode_rehearsal_ignored'
 where e.event_scope = 'platform_subscription'
   and e.livemode = false
   and e.processing_status = 'failed';
