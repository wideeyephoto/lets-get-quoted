-- Dark bounded worker selector for platform top-up purchases.
--
-- 20260818160000 committed the projector: the claim token, the five-minute
-- lease, the atomic grant, and the terminal shapes. What is missing is the
-- non-blocking "next due event" selector, so nothing yet drains the inbox. This
-- adds only that. No route, scheduler, secret, or webhook behaviour changes
-- here, and the eight-attempt provider cap is made durable in Postgres rather
-- than trusted to the runner.
--
-- It deliberately calls the existing explicit-ID claim RPC, so there is still
-- one claim transition and one source of event-contract truth.
--
-- WHAT THIS SELECTOR DOES NOT REQUIRE, unlike the connected-payment one. That
-- selector proves the Session came from LGQ's own direct-Checkout constructor
-- through an immutable operation/payment binding, and refuses to claim anything
-- else. This one must not. A top-up destination also receives base-plan
-- subscription checkout completions — same platform account, same event type —
-- and those have to be claimed in order to be terminated as
-- top_up_not_a_purchase. Refusing to claim them would leave them received
-- forever, which is the stuck queue the result vocabulary exists to avoid.
--
-- It also must not require account_id. The inbox leaves it null for this scope
-- on purpose; binding the workspace is the projector's job, from Session
-- metadata, and it happens after this selector has already handed the row over.

begin;

-- Match the equality predicates and due-time scan below without indexing
-- unrelated scopes or terminal projection history.
create index if not exists billing_events_top_up_projection_ready_idx
  on public.billing_events (
    processing_status,
    next_attempt_at,
    projection_lease_expires_at,
    provider_created_at,
    received_at,
    id
  )
  where provider = 'stripe'
    and event_scope = 'platform_top_up'
    and provider_account_id is null
    and processing_status in ('received', 'failed', 'processing');

create or replace function public.claim_next_due_stripe_platform_top_up_event()
returns table (
  claim_status text,
  billing_event_id uuid,
  claim_token uuid,
  attempt_count integer,
  provider_event_id text,
  event_type text,
  checkout_session_id text,
  workspace_id uuid,
  livemode boolean,
  provider_created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
set timezone to 'UTC'
as $$
declare
  v_event public.billing_events%rowtype;
  v_claim record;
  v_checkout_session_id text;
begin
  -- Take one lease just in time. The runner finishes this item before asking
  -- for another, so provider latency cannot age a later batch of leases.
  select e.*
    into v_event
    from public.billing_events e
   where e.provider = 'stripe'
     and e.event_scope = 'platform_top_up'
     and e.provider_account_id is null
     and e.provider_created_at is not null
     and e.event_type in (
       'checkout.session.completed',
       'checkout.session.async_payment_succeeded',
       'checkout.session.async_payment_failed',
       'checkout.session.expired'
     )
     and e.payload_sha256 = pg_catalog.encode(
       extensions.digest(pg_catalog.convert_to(e.payload::text, 'UTF8'), 'sha256'),
       'hex'
     )
     and e.payload #>> '{schema}' = 'lgq.stripe-event-inbox.v1'
     and e.payload #>> '{scope}' = 'platform_top_up'
     and e.payload #>> '{event,id}' = e.provider_event_id
     and e.payload #>> '{event,type}' = e.event_type
     and e.payload #> '{event,account}' = 'null'::jsonb
     and e.payload #> '{event,livemode}' = pg_catalog.to_jsonb(e.livemode)
     and e.payload #>> '{data_object,object}' = 'checkout.session'
     and e.payload #>> '{data_object,id}' ~ '^cs_[A-Za-z0-9_]+$'
     -- A valid received row has never held a lease. Do not try to convert an
     -- impossible received+at-limit shape directly to failed: the append-only
     -- event transition guard correctly forbids that edge.
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
  -- atomically here and can never cause a ninth Stripe retrieval.
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
      v_event.livemode,
      v_event.provider_created_at;
    return;
  end if;

  -- Keep one source of truth for the ordinary claim transition. The committed
  -- explicit-ID RPC revalidates the envelope, increments attempt_count, mints
  -- the claim token, and starts the five-minute lease.
  select c.*
    into v_claim
    from public.claim_stripe_platform_top_up_event(v_event.id) c;

  if not found
     or v_claim.claim_status is distinct from 'claimed'
     or v_claim.billing_event_id is distinct from v_event.id
     or v_claim.claim_token is null
     or v_claim.attempt_count is null
     or v_claim.attempt_count not between 1 and 8 then
    raise exception 'top-up worker selector did not receive an owned claim'
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
    v_claim.livemode::boolean,
    v_claim.provider_created_at::timestamptz;
end;
$$;

revoke all on function public.claim_next_due_stripe_platform_top_up_event()
  from public, anon, authenticated, service_role;
grant execute on function public.claim_next_due_stripe_platform_top_up_event()
  to service_role;

comment on function public.claim_next_due_stripe_platform_top_up_event() is
  'Dark deterministic one-at-a-time top-up selector with an eight-provider-attempt cap; service role only. Claims non-purchase Sessions too, so they can be terminated rather than left received.';

-- Prove the selector exists and is service-role only.
do $$
begin
  if not exists (
    select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'claim_next_due_stripe_platform_top_up_event'
  ) then
    raise exception 'top-up worker selector was not created';
  end if;
  if pg_catalog.has_function_privilege(
       'authenticated',
       'public.claim_next_due_stripe_platform_top_up_event()',
       'execute')
     or pg_catalog.has_function_privilege(
       'anon',
       'public.claim_next_due_stripe_platform_top_up_event()',
       'execute') then
    raise exception 'top-up worker selector is reachable by a client role';
  end if;
end;
$$;

commit;

-- Activation blockers (intentionally unresolved here):
--   1. Apply and probe 20260818160000/170000/180000 against a real database.
--   2. Enable the webhook first, prove receipt, then enable this worker.
--   3. Establish an operator inspection path for top_up_fulfillment_withheld and
--      top_up_capacity_fulfillment_deferred, which are paid-but-ungranted rows.
