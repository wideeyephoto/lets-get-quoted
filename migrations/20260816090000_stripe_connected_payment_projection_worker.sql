-- Dark bounded worker selector for connected-account direct payment success.
--
-- The committed success projector owns provider correlation, five-minute
-- leases, retries, and the atomic payment projection. This additive migration
-- supplies the missing one-at-a-time due selector and makes the eight-attempt
-- provider cap durable in Postgres. It adds no route activation, secret, or
-- webhook behavior.

begin;

create index if not exists billing_events_connected_payment_projection_ready_idx
  on public.billing_events (
    processing_status,
    next_attempt_at,
    projection_lease_expires_at,
    provider_created_at,
    received_at,
    id
  )
  where provider = 'stripe'
    and event_scope = 'connected_payment'
    and event_type = 'checkout.session.completed'
    and provider_account_id is not null
    and processing_status in ('received', 'failed', 'processing');

create function public.claim_next_due_stripe_connected_payment_event()
returns table (
  claim_status text,
  billing_event_id uuid,
  claim_token uuid,
  attempt_count integer,
  provider_event_id text,
  event_type text,
  checkout_session_id text,
  workspace_id uuid,
  merchant_account_id text,
  livemode boolean,
  provider_created_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $$
declare
  v_event public.billing_events%rowtype;
  v_claim record;
  v_checkout_session_id text;
begin
  -- Take one lease just in time. The server runner finishes this item before
  -- asking for another, so provider latency cannot age a later batch of leases.
  select e.*
    into v_event
    from public.billing_events e
   where e.provider = 'stripe'
     and e.event_scope = 'connected_payment'
     and e.event_type = 'checkout.session.completed'
     and e.account_id is not null
     and e.provider_account_id is not null
     and e.provider_created_at is not null
     and e.payload_sha256 = pg_catalog.encode(
       extensions.digest(pg_catalog.convert_to(e.payload::text, 'UTF8'), 'sha256'),
       'hex'
     )
     and e.payload #>> '{schema}' = 'lgq.stripe-event-inbox.v1'
     and e.payload #>> '{scope}' = 'connected_payment'
     and e.payload #>> '{event,id}' = e.provider_event_id
     and e.payload #>> '{event,type}' = e.event_type
     and e.payload #>> '{event,account}' = e.provider_account_id
     and e.payload #> '{event,livemode}' = pg_catalog.to_jsonb(e.livemode)
     and e.payload #>> '{data_object,object}' = 'checkout.session'
     and e.payload #>> '{data_object,id}' ~ '^cs_[A-Za-z0-9_]+$'
     -- The redacted inbox deliberately carries no payment method. Prove this
     -- Session came from LGQ's card-only direct Checkout constructor through
     -- its immutable succeeded operation/payment binding before claiming it.
     and exists (
       select 1
         from public.billing_payment_operations o
         join public.payments p
           on p.id = o.payment_id
          and p.account_id = o.account_id
        where o.account_id = e.account_id
          and o.operation_type = 'checkout_session.create'
          and o.charge_model = 'direct'
          and o.stripe_account_id = e.provider_account_id
          and o.livemode = e.livemode
          and o.state = 'succeeded'
          and o.provider_object_id = e.payload #>> '{data_object,id}'
          and o.metadata #>> '{schema}' = 'one_off_direct_checkout_v1'
          and pg_catalog.jsonb_typeof(o.metadata #> '{fee_snapshot}') = 'object'
          and p.charge_model = 'direct'
          and p.stripe_account_id = e.provider_account_id
          and p.stripe_livemode = e.livemode
          and p.stripe_checkout_session = o.provider_object_id
          and p.status::text in ('processing', 'paid')
          and p.reconciliation_status in ('pending', 'reconciled')
     )
     and exists (
       select 1
         from public.accounts a
        where a.id = e.account_id
          and a.stripe_merchant_account_id = e.provider_account_id
          and a.merchant_livemode = e.livemode
     )
     -- A valid received row has never held a lease. Do not try to convert an
     -- impossible/tampered received+at-limit shape directly to failed because
     -- the append-only event transition guard correctly forbids that edge.
     and (e.processing_status <> 'received' or e.attempt_count < 8)
     and (
       e.processing_status = 'received'
       or (
         e.processing_status = 'failed'
         and e.next_attempt_at is not null
         and (
           e.attempt_count >= 8
           or e.next_attempt_at <= pg_catalog.now()
         )
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

  v_checkout_session_id := v_event.payload #>> '{data_object,id}';

  -- attempt_count is incremented when a provider lease is acquired. Once eight
  -- such leases have existed, a due failure or expired lease is dead-lettered
  -- atomically here and can never cause a ninth connected-account retrieval.
  if v_event.attempt_count >= 8 then
    update public.billing_events e
       set processing_status = 'failed',
           processed_at = null,
           next_attempt_at = null,
           last_error = 'projection_retry_attempt_limit',
           projection_claim_token = null,
           projection_lease_expires_at = null,
           projection_schema_version = null,
           projection_applied = null,
           projection_result = null
     where e.id = v_event.id;

    return query select
      'failed_terminal'::text,
      v_event.id,
      null::uuid,
      v_event.attempt_count,
      v_event.provider_event_id,
      v_event.event_type,
      v_checkout_session_id,
      v_event.account_id,
      v_event.provider_account_id,
      v_event.livemode,
      v_event.provider_created_at;
    return;
  end if;

  -- Keep one source of truth for the ordinary claim transition. The committed
  -- explicit-ID RPC revalidates the envelope and Merchant mapping, increments
  -- attempt_count, mints the claim token, and starts the five-minute lease.
  select c.*
    into v_claim
    from public.claim_stripe_connected_payment_event(v_event.id) c;

  if not found
     or v_claim.claim_status is distinct from 'claimed'
     or v_claim.billing_event_id is distinct from v_event.id
     or v_claim.claim_token is null
     or v_claim.attempt_count is null
     or v_claim.attempt_count not between 1 and 8 then
    raise exception 'connected payment worker selector did not receive an owned claim'
      using errcode = '55000';
  end if;

  return query select
    v_claim.claim_status::text,
    v_claim.billing_event_id::uuid,
    v_claim.claim_token::uuid,
    v_claim.attempt_count::integer,
    v_claim.provider_event_id::text,
    v_claim.event_type::text,
    v_claim.checkout_session_id::text,
    v_claim.workspace_id::uuid,
    v_claim.merchant_account_id::text,
    v_claim.livemode::boolean,
    v_claim.provider_created_at::timestamptz;
end;
$$;

revoke all on function public.claim_next_due_stripe_connected_payment_event()
  from public, anon, authenticated, service_role;
grant execute on function public.claim_next_due_stripe_connected_payment_event()
  to service_role;

comment on function public.claim_next_due_stripe_connected_payment_event() is
  'Dark deterministic one-at-a-time connected direct-payment success selector with an eight-provider-attempt cap; service role only.';

commit;

-- Activation blockers (intentionally unresolved here):
--   1. Apply and transactionally probe all connected-payment migrations in staging.
--   2. Reconcile signed inbox events against connected-account Stripe objects.
--   3. Establish operator inspection/requeue policy for terminal failures.
--   4. Enable webhook first, then this worker, only with monitored test-mode proof.
