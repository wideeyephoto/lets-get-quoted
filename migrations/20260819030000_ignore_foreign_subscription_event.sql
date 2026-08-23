-- Stop a capacity subscription's events dead-lettering the base-plan rail.
--
-- WHY, PRECISELY. Every customer.subscription.* delivery is scoped
-- platform_subscription by the inbox -- there is no price or plan test anywhere
-- upstream -- so the subscription created by a capacity top-up lands in the base
-- plan projector. normalizeSubscription requires the subscription's metadata key
-- set to be EXACTLY the ten base-plan keys; a capacity subscription carries the
-- six top-up keys that subscription_data.metadata put on it, so the key sets
-- differ, metadata resolves to null, and it fails provider_object_contract_mismatch
-- with retryable = false. Terminal on the first attempt. One Stripe retrieve
-- spent, one dead letter, and it never reaches the price check at all -- the
-- price contract mismatch everyone assumes is responsible is unreachable here.
--
-- Today that costs nothing because no capacity SKU is sellable. The moment one
-- is, every renewal, every payment failure and every cancellation of every
-- purchased seat becomes a dead letter on a live billing rail.
--
-- IGNORED, NOT FAILED, and not silently dropped either. The event is real, it
-- was signed, and it belongs to a rail that handles it elsewhere -- the capacity
-- lifecycle sweep reads Stripe directly rather than these events. So it is
-- recorded as processed-and-ignored with a result that says which rail owns it,
-- which is the same shape the top-up projector already uses for not_a_purchase.
--
-- WHY A NEW RPC. project_stripe_billing_subscription_event's only 'ignored' path
-- is the out-of-order no-op, and that requires a bound operation plus every
-- NOT NULL field the hardening wrapper enforces. A foreign subscription has no
-- binding and never will. fail_stripe_billing_subscription_event is the closest
-- shape and this is modelled on it, differing only in writing 'ignored' with the
-- four columns the terminal shape demands rather than 'failed'.

begin;

-- BOTH constraints must admit the new result, extended from their own live text
-- exactly as 20260818160000 and 20260819010000 extend them.
--
-- The terminal shape is the one that is easy to miss, and a real engine caught
-- it here rather than production. Its platform_subscription branch does not
-- merely require a non-null projection_result: it pins the value to a list of
-- exactly four, nested INSIDE the branch. OR-appending to the top level is the
-- only way to widen that, because an append cannot reach into a nested AND.
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
          $extra$(projection_result = 'subscription_not_our_rail')$extra$
        ),
        (
          'billing_events_projection_terminal_shape_check',
          -- A complete branch, because the existing subscription branch pins
          -- projection_result to four values it cannot be talked out of.
          $extra$(
            event_scope = 'platform_subscription'
            and processing_status = 'ignored'
            and processed_at is not null
            and projection_schema_version is not distinct from
              'stripe_subscription_projection_v1'
            and projection_applied is not null
            and not projection_applied
            and projection_result = 'subscription_not_our_rail'
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
    if pg_catalog.strpos(body, 'subscription_not_our_rail') > 0 then
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

-- Record a claimed platform_subscription event as belonging to another rail.
--
-- Takes the claim token like every other terminal writer here, so a worker whose
-- lease has expired cannot write over whoever holds it now.
create or replace function public.ignore_foreign_stripe_billing_subscription_event(
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
    raise exception 'foreign subscription ignore input is invalid' using errcode = '22023';
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

  -- All four columns the terminal shape demands for an ignored row of this
  -- scope: processed_at, the schema version, a non-null applied flag and a
  -- non-null result. applied is false because nothing was written anywhere.
  update public.billing_events e
     set processing_status = 'ignored',
         processed_at = pg_catalog.now(),
         next_attempt_at = null,
         last_error = null,
         projection_claim_token = null,
         projection_lease_expires_at = null,
         projection_schema_version = 'stripe_subscription_projection_v1',
         projection_applied = false,
         projection_result = 'subscription_not_our_rail'
   where e.id = v_event.id;

  return 'subscription_not_our_rail';
end;
$fn$;

comment on function public.ignore_foreign_stripe_billing_subscription_event(uuid, uuid) is
  'Records a claimed platform_subscription event as belonging to another rail (a purchased-capacity subscription), rather than dead-lettering it on the base-plan projector.';

revoke all on function public.ignore_foreign_stripe_billing_subscription_event(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.ignore_foreign_stripe_billing_subscription_event(uuid, uuid)
  to service_role;

commit;
