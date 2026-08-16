-- Dark bounded worker selector for platform Stripe Billing subscription events.
--
-- The durable inbox/projector migration already owns the event claim token,
-- five-minute lease, retry timestamp, projection transaction, and terminal
-- failed shape. This additive migration supplies only the missing non-blocking
-- "next due event" selector. It deliberately calls the existing claim RPC so
-- there is still one claim transition and one source of event-contract truth.
-- No route, scheduler, webhook, or environment activation is added here.

begin;

-- Match the equality predicates and due-time scan used below without indexing
-- unrelated connected-payment events or terminal projection history.
create index if not exists billing_events_subscription_projection_ready_idx
  on public.billing_events (
    processing_status,
    next_attempt_at,
    provider_created_at,
    received_at,
    id
  )
  where provider = 'stripe'
    and event_scope = 'platform_subscription'
    and provider_account_id is null
    and processing_status in ('received', 'failed');

create function public.claim_next_due_stripe_billing_subscription_event()
returns table (
  claim_status text,
  billing_event_id uuid,
  claim_token uuid,
  attempt_count integer,
  provider_event_id text,
  event_type text,
  provider_object_id text,
  provider_object_type text,
  livemode boolean,
  provider_created_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $$
declare
  v_event_id uuid;
  v_claim record;
begin
  -- Claim only one row per transaction. The server-only runner repeats this
  -- call up to its bounded batch size and processes the event before claiming
  -- another, so a slow Stripe retrieval cannot age later leases in a batch.
  select e.id
    into v_event_id
    from public.billing_events e
   where e.provider = 'stripe'
     and e.event_scope = 'platform_subscription'
     and e.provider_account_id is null
     and e.provider_created_at is not null
     and e.payload #>> '{schema}' = 'lgq.stripe-event-inbox.v1'
     and e.payload #>> '{scope}' = 'platform_subscription'
     and e.payload #>> '{event,id}' = e.provider_event_id
     and e.payload #>> '{event,type}' = e.event_type
     and e.payload #> '{event,livemode}' = pg_catalog.to_jsonb(e.livemode)
     and (
       (
         e.event_type like 'customer.subscription.%'
         and e.payload #>> '{data_object,object}' = 'subscription'
         and e.payload #>> '{data_object,id}' ~ '^sub_[A-Za-z0-9]{8,}$'
       )
       or (
         e.event_type like 'invoice.%'
         and e.payload #>> '{data_object,object}' = 'invoice'
         and e.payload #>> '{data_object,id}' ~ '^in_[A-Za-z0-9]{8,}$'
       )
     )
     and (
       e.processing_status = 'received'
       or (
         e.processing_status = 'failed'
         and e.next_attempt_at is not null
         and e.next_attempt_at <= pg_catalog.now()
       )
       or (
         e.processing_status = 'processing'
         and e.projection_lease_expires_at is not null
         and e.projection_lease_expires_at <= pg_catalog.now()
       )
     )
   order by e.provider_created_at, e.received_at, e.id
   limit 1
   for update of e skip locked;

  if not found then
    return;
  end if;

  -- The existing function re-checks the complete redacted-inbox contract and
  -- atomically increments attempt_count, mints the claim token, and starts the
  -- five-minute lease. This selector never duplicates that state transition.
  select c.*
    into v_claim
    from public.claim_stripe_billing_subscription_event(v_event_id) c;

  if not found
     or v_claim.claim_status is distinct from 'claimed'
     or v_claim.billing_event_id is distinct from v_event_id
     or v_claim.claim_token is null
     or v_claim.attempt_count is null
     or v_claim.attempt_count < 1 then
    raise exception 'Stripe Billing worker selector did not receive an owned claim'
      using errcode = '55000';
  end if;

  return query select
    v_claim.claim_status::text,
    v_claim.billing_event_id::uuid,
    v_claim.claim_token::uuid,
    v_claim.attempt_count::integer,
    v_claim.provider_event_id::text,
    v_claim.event_type::text,
    v_claim.provider_object_id::text,
    v_claim.provider_object_type::text,
    v_claim.livemode::boolean,
    v_claim.provider_created_at::timestamptz;
end;
$$;

revoke all on function public.claim_next_due_stripe_billing_subscription_event()
  from public, anon, authenticated, service_role;
grant execute on function public.claim_next_due_stripe_billing_subscription_event()
  to service_role;

comment on function public.claim_next_due_stripe_billing_subscription_event() is
  'Dark deterministic one-at-a-time platform-subscription event selector; service role only.';

commit;

-- Activation blockers (intentionally unresolved here):
--   1. Apply and transactionally probe this migration in staging.
--   2. Add operator inspection/requeue tooling for terminal failed events.
--   3. Add monitored scheduling only after Stripe test-clock coverage.
--   4. Keep every caller server-only and authenticate any future trigger.
