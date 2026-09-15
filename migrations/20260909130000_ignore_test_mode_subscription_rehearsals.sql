-- Migration: 20260909130000_ignore_test_mode_subscription_rehearsals.sql
-- Purpose: Provide ignore_test_mode_stripe_billing_subscription_event RPC for
-- live production workers to ignore test-mode rehearsal events without failing,
-- and clear the 185 stuck test-mode billing events from 2026-09-07 -> 09-08.

begin;

-- Both constraints must admit the new result, extended from their own live text
-- exactly as 20260819030000 extends them.
do $mig$
declare
  spec record;
  body text;
begin
  for spec in
    select *
      from (values
        (
          'billing_events_projection_result_check',
          $extra$(projection_result = 'test_mode_rehearsal_ignored')$extra$
        ),
        (
          'billing_events_projection_terminal_shape_check',
          $extra$(
            event_scope = 'platform_subscription'
            and processing_status = 'ignored'
            and processed_at is not null
            and projection_schema_version is not distinct from
              'stripe_subscription_projection_v1'
            and projection_applied is not null
            and not projection_applied
            and projection_result = 'test_mode_rehearsal_ignored'
          )$extra$
        )
      ) as t(conname, extra)
  loop
    select pg_get_constraintdef(c.oid) into body
      from pg_constraint c
     where c.conrelid = 'public.billing_events'::regclass
       and c.conname = spec.conname;

    if body is null then
      raise exception 'constraint % not found on billing_events', spec.conname;
    end if;

    -- Already extended: a second apply must not append the branch twice.
    if pg_catalog.strpos(body, 'test_mode_rehearsal_ignored') > 0 then
      continue;
    end if;

    body := pg_catalog.btrim(body);
    if body !~ '^CHECK \(' then
      raise exception 'unexpected constraint shape for %: %', spec.conname, pg_catalog.left(body, 40);
    end if;
    body := pg_catalog.substr(body, 8, pg_catalog.length(body) - 8);

    execute pg_catalog.format(
      'alter table public.billing_events drop constraint %I', spec.conname);
    execute pg_catalog.format(
      'alter table public.billing_events add constraint %I check ((%s) or %s)',
      spec.conname, body, spec.extra);
  end loop;
end
$mig$;

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
     or v_event.provider is distinct from 'stripe'
     or v_event.livemode is distinct from false
     or v_event.event_scope <> 'platform_subscription'
     or v_event.processing_status <> 'processing'
     or v_event.projection_claim_token is distinct from p_claim_token
     or v_event.projection_lease_expires_at is null
     or v_event.projection_lease_expires_at <= pg_catalog.clock_timestamp() then
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

-- Historical rows require an exact manifest review; no broad data update belongs in this migration.
commit;
