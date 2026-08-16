-- Dark success-only connected-payment event projection foundation.
--
-- This migration adds no route, scheduler, flag, or active caller. Only a paid
-- card `checkout.session.completed` event may be claimed. Refund, dispute,
-- failure, expiration, and delayed-payment events deliberately remain received
-- and unclaimed until their business transitions are specified.
-- Incomplete Charge-scoped fee/balance evidence records the payment as paid but
-- leaves reconciliation pending. A future platform Application Fee reconciler
-- needs its own reviewed account-scope and activation policy.

begin;

lock table public.billing_events in share row exclusive mode;
do $$
begin
  if exists (
    select 1
      from public.billing_events e
     where e.event_scope = 'connected_payment'
       and e.processing_status <> 'received'
  ) then
    raise exception 'connected payment inbox contains pre-projector processing history'
      using errcode = '55000';
  end if;
end
$$;

-- The platform-subscription projector introduced these shared lease/result
-- columns. Extend its constraints without weakening either scope.
alter table public.billing_events
  drop constraint if exists billing_events_projection_result_check,
  drop constraint if exists billing_events_projection_claim_shape_check,
  drop constraint if exists billing_events_projection_terminal_shape_check;

alter table public.billing_events
  add constraint billing_events_projection_result_check check (
    projection_result is null
    or projection_result in (
      'subscription_state_applied',
      'invoice_state_applied',
      'subscription_and_invoice_state_applied',
      'out_of_order_ignored',
      'direct_payment_paid_pending_reconciliation',
      'direct_payment_paid_reconciled'
    )
  ),
  add constraint billing_events_projection_claim_shape_check check (
    (
      processing_status = 'processing'
      and projection_claim_token is not null
      and projection_lease_expires_at is not null
      and processing_started_at is not null
    )
    or (
      processing_status <> 'processing'
      and projection_claim_token is null
      and projection_lease_expires_at is null
    )
  ),
  add constraint billing_events_projection_terminal_shape_check check (
    (
      event_scope = 'platform_subscription'
      and (
        (
          processing_status in ('processed', 'ignored')
          and processed_at is not null
          and projection_schema_version is not distinct from 'stripe_subscription_projection_v1'
          and projection_applied is not null
          and projection_result is not null
          and projection_result in (
            'subscription_state_applied',
            'invoice_state_applied',
            'subscription_and_invoice_state_applied',
            'out_of_order_ignored'
          )
        )
        or (
          processing_status not in ('processed', 'ignored')
          and processed_at is null
          and projection_schema_version is null
          and projection_applied is null
          and projection_result is null
        )
      )
    )
    or (
      event_scope = 'connected_payment'
      and (
        (
          processing_status = 'processed'
          and processed_at is not null
          and projection_schema_version is not distinct from 'stripe_connected_payment_projection_v1'
          and projection_applied is not null
          and projection_result is not null
          and projection_result in (
            'direct_payment_paid_pending_reconciliation',
            'direct_payment_paid_reconciled'
          )
        )
        or (
          processing_status <> 'processed'
          and processed_at is null
          and projection_schema_version is null
          and projection_applied is null
          and projection_result is null
        )
      )
    )
  );

create or replace function public.claim_stripe_connected_payment_event(
  p_billing_event_id uuid
)
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
  v_claim_token uuid := pg_catalog.gen_random_uuid();
  v_checkout_session_id text;
  v_expected_hash text;
begin
  if p_billing_event_id is null then
    raise exception 'connected payment event ID is required' using errcode = '22023';
  end if;

  select e.* into v_event
    from public.billing_events e
   where e.id = p_billing_event_id
   for update;
  if not found then
    raise exception 'connected payment event was not found' using errcode = 'P0002';
  end if;

  v_checkout_session_id := v_event.payload #>> '{data_object,id}';
  v_expected_hash := pg_catalog.encode(
    extensions.digest(pg_catalog.convert_to(v_event.payload::text, 'UTF8'), 'sha256'),
    'hex'
  );
  if v_event.provider <> 'stripe'
     or v_event.event_scope <> 'connected_payment'
     or v_event.event_type <> 'checkout.session.completed'
     or v_event.account_id is null
     or v_event.provider_account_id is null
     or v_event.provider_created_at is null
     or v_event.payload_sha256 is distinct from v_expected_hash
     or v_event.payload #>> '{schema}' is distinct from 'lgq.stripe-event-inbox.v1'
     or v_event.payload #>> '{scope}' is distinct from 'connected_payment'
     or v_event.payload #>> '{event,id}' is distinct from v_event.provider_event_id
     or v_event.payload #>> '{event,type}' is distinct from v_event.event_type
     or v_event.payload #>> '{event,account}' is distinct from v_event.provider_account_id
     or v_event.payload #> '{event,livemode}' is distinct from pg_catalog.to_jsonb(v_event.livemode)
     or v_event.payload #>> '{data_object,object}' is distinct from 'checkout.session'
     or v_checkout_session_id is null
     or v_checkout_session_id !~ '^cs_[A-Za-z0-9_]+$' then
    raise exception 'connected payment event inbox contract is invalid' using errcode = '22000';
  end if;

  -- Durable terminal/in-progress replays stop before re-checking the mutable
  -- account mapping or making provider calls. The immutable inbox envelope is
  -- still verified; current Merchant mapping matters only when acquiring work.
  if v_event.processing_status = 'processed' then
    return query select
      'processed'::text, v_event.id, null::uuid, v_event.attempt_count,
      v_event.provider_event_id, v_event.event_type, v_checkout_session_id,
      v_event.account_id, v_event.provider_account_id, v_event.livemode,
      v_event.provider_created_at;
    return;
  end if;
  if v_event.processing_status = 'ignored' then
    return query select
      'ignored'::text, v_event.id, null::uuid, v_event.attempt_count,
      v_event.provider_event_id, v_event.event_type, v_checkout_session_id,
      v_event.account_id, v_event.provider_account_id, v_event.livemode,
      v_event.provider_created_at;
    return;
  end if;
  if v_event.processing_status = 'failed' and v_event.next_attempt_at is null then
    return query select
      'failed_terminal'::text, v_event.id, null::uuid, v_event.attempt_count,
      v_event.provider_event_id, v_event.event_type, v_checkout_session_id,
      v_event.account_id, v_event.provider_account_id, v_event.livemode,
      v_event.provider_created_at;
    return;
  end if;
  if (v_event.processing_status = 'processing'
      and v_event.projection_lease_expires_at > pg_catalog.now())
     or (v_event.processing_status = 'failed'
      and v_event.next_attempt_at > pg_catalog.now()) then
    return query select
      'in_progress'::text, v_event.id, null::uuid, v_event.attempt_count,
      v_event.provider_event_id, v_event.event_type, v_checkout_session_id,
      v_event.account_id, v_event.provider_account_id, v_event.livemode,
      v_event.provider_created_at;
    return;
  end if;

  perform 1
    from public.accounts a
   where a.id = v_event.account_id
     and a.stripe_merchant_account_id = v_event.provider_account_id
     and a.merchant_livemode = v_event.livemode
   for key share;
  if not found then
    raise exception 'connected payment event Merchant mapping no longer matches its workspace'
      using errcode = '55000';
  end if;

  if v_event.processing_status not in ('received', 'failed', 'processing') then
    raise exception 'connected payment event has an unsupported processing state'
      using errcode = '55000';
  end if;

  update public.billing_events e
     set processing_status = 'processing',
         attempt_count = e.attempt_count + 1,
         processing_started_at = pg_catalog.now(),
         projection_claim_token = v_claim_token,
         projection_lease_expires_at = pg_catalog.now() + interval '5 minutes',
         next_attempt_at = null,
         last_error = null
   where e.id = v_event.id
  returning * into v_event;

  return query select
    'claimed'::text, v_event.id, v_event.projection_claim_token,
    v_event.attempt_count, v_event.provider_event_id, v_event.event_type,
    v_checkout_session_id, v_event.account_id, v_event.provider_account_id,
    v_event.livemode, v_event.provider_created_at;
end;
$$;

create or replace function public.resolve_stripe_connected_payment_projection_binding(
  p_billing_event_id uuid,
  p_claim_token uuid,
  p_workspace_id uuid,
  p_payment_id uuid,
  p_operation_id text
)
returns table (
  operation_pk uuid,
  workspace_id uuid,
  payment_id uuid,
  operation_id text,
  checkout_session_id text,
  merchant_account_id text,
  livemode boolean,
  amount_cents bigint,
  application_fee_cents bigint,
  payment_status text,
  reconciliation_status text
)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $$
declare
  v_event public.billing_events%rowtype;
  v_operation public.billing_payment_operations%rowtype;
  v_payment public.payments%rowtype;
begin
  if p_billing_event_id is null
     or p_claim_token is null
     or p_workspace_id is null
     or p_payment_id is null
     or p_operation_id is null
     or pg_catalog.length(pg_catalog.btrim(p_operation_id)) not between 1 and 200
     or p_operation_id ~ '[[:cntrl:]]' then
    raise exception 'connected payment projection binding input is invalid'
      using errcode = '22023';
  end if;

  select e.* into v_event
    from public.billing_events e
   where e.id = p_billing_event_id
   for update;
  if not found
     or v_event.provider <> 'stripe'
     or v_event.event_scope <> 'connected_payment'
     or v_event.event_type <> 'checkout.session.completed'
     or v_event.processing_status <> 'processing'
     or v_event.projection_claim_token is distinct from p_claim_token
     or v_event.projection_lease_expires_at <= pg_catalog.now()
     or v_event.account_id is distinct from p_workspace_id then
    raise exception 'connected payment projection claim is not owned or expired'
      using errcode = '55000';
  end if;

  perform 1
    from public.accounts a
   where a.id = v_event.account_id
     and a.stripe_merchant_account_id = v_event.provider_account_id
     and a.merchant_livemode = v_event.livemode
   for key share;
  if not found then
    raise exception 'connected payment workspace and Merchant mapping do not match'
      using errcode = '22000';
  end if;

  select p.* into v_payment
    from public.payments p
   where p.id = p_payment_id
     and p.account_id = p_workspace_id
   for share;
  if not found
     or v_payment.charge_model <> 'direct'
     or v_payment.stripe_account_id is distinct from v_event.provider_account_id
     or v_payment.stripe_livemode is distinct from v_event.livemode
     or v_payment.stripe_checkout_session is distinct from (v_event.payload #>> '{data_object,id}')
     or v_payment.status::text not in ('processing', 'paid')
     or v_payment.reconciliation_status not in ('pending', 'reconciled')
     or v_payment.amount <= 0
     or v_payment.platform_fee is null then
    raise exception 'connected payment does not match the immutable event binding'
      using errcode = '22000';
  end if;

  select o.* into v_operation
    from public.billing_payment_operations o
   where o.payment_id = p_payment_id
     and o.account_id = p_workspace_id
     and o.operation_type = 'checkout_session.create'
     and o.operation_id = pg_catalog.btrim(p_operation_id)
   for share;
  if not found
     or v_operation.state <> 'succeeded'
     or v_operation.charge_model <> 'direct'
     or v_operation.stripe_account_id is distinct from v_event.provider_account_id
     or v_operation.livemode is distinct from v_event.livemode
     or v_operation.provider_object_id is distinct from v_payment.stripe_checkout_session
     or v_operation.metadata #>> '{schema}' is distinct from 'one_off_direct_checkout_v1'
     or pg_catalog.jsonb_typeof(v_operation.metadata #> '{fee_snapshot}') is distinct from 'object' then
    raise exception 'connected payment Checkout operation does not match the event and payment'
      using errcode = '22000';
  end if;

  return query select
    v_operation.id, v_payment.account_id, v_payment.id, v_operation.operation_id,
    v_payment.stripe_checkout_session, v_payment.stripe_account_id,
    v_payment.stripe_livemode, (v_payment.amount * 100)::bigint,
    (v_payment.platform_fee * 100)::bigint, v_payment.status::text,
    v_payment.reconciliation_status;
end;
$$;

create or replace function public.project_stripe_connected_payment_event(
  p_billing_event_id uuid,
  p_claim_token uuid,
  p_projection jsonb
)
returns table (
  processing_status text,
  payment_id uuid,
  workspace_id uuid,
  projection_applied boolean,
  reconciliation_status text
)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $$
declare
  v_event public.billing_events%rowtype;
  v_payment public.payments%rowtype;
  v_operation public.billing_payment_operations%rowtype;
  v_expected_keys text[] := array[
    'schema', 'provider_event_id', 'event_type', 'event_created_at',
    'workspace_id', 'payment_id', 'operation_id', 'checkout_session_id',
    'payment_intent_id', 'charge_id', 'application_fee_id',
    'balance_transaction_id', 'merchant_account_id', 'livemode', 'currency',
    'amount_cents', 'application_fee_cents', 'paid_at',
    'reconciliation_status'
  ];
  v_workspace_id uuid;
  v_payment_id uuid;
  v_event_created_at timestamptz;
  v_paid_at timestamptz;
  v_amount_cents bigint;
  v_application_fee_cents bigint;
  v_reconciliation_status text;
  v_application_fee_id text;
  v_balance_transaction_id text;
  v_final_reconciliation_status text;
  v_applied boolean;
begin
  if p_billing_event_id is null
     or p_claim_token is null
     or p_projection is null
     or pg_catalog.jsonb_typeof(p_projection) <> 'object'
     or not (p_projection ?& v_expected_keys)
     or (p_projection - v_expected_keys) <> '{}'::jsonb then
    raise exception 'connected payment projection shape is invalid' using errcode = '22023';
  end if;

  begin
    v_workspace_id := (p_projection ->> 'workspace_id')::uuid;
    v_payment_id := (p_projection ->> 'payment_id')::uuid;
    v_event_created_at := (p_projection ->> 'event_created_at')::timestamptz;
    v_paid_at := (p_projection ->> 'paid_at')::timestamptz;
    v_amount_cents := (p_projection ->> 'amount_cents')::bigint;
    v_application_fee_cents := (p_projection ->> 'application_fee_cents')::bigint;
  exception when others then
    raise exception 'connected payment projection scalar is invalid' using errcode = '22023';
  end;
  v_reconciliation_status := p_projection ->> 'reconciliation_status';
  v_application_fee_id := p_projection ->> 'application_fee_id';
  v_balance_transaction_id := p_projection ->> 'balance_transaction_id';

  if p_projection ->> 'schema' is distinct from 'stripe_connected_payment_projection_v1'
     or p_projection ->> 'event_type' is distinct from 'checkout.session.completed'
     or p_projection ->> 'currency' is distinct from 'usd'
     or pg_catalog.jsonb_typeof(p_projection -> 'livemode') is distinct from 'boolean'
     or p_projection ->> 'provider_event_id' is null
     or p_projection ->> 'provider_event_id' !~ '^evt_[A-Za-z0-9_]{8,}$'
     or p_projection ->> 'checkout_session_id' is null
     or p_projection ->> 'checkout_session_id' !~ '^cs_[A-Za-z0-9_]+$'
     or p_projection ->> 'payment_intent_id' is null
     or p_projection ->> 'payment_intent_id' !~ '^pi_[A-Za-z0-9_]+$'
     or p_projection ->> 'charge_id' is null
     or p_projection ->> 'charge_id' !~ '^ch_[A-Za-z0-9_]+$'
     or p_projection ->> 'merchant_account_id' is null
     or p_projection ->> 'merchant_account_id' !~ '^acct_[A-Za-z0-9]{8,}$'
     or p_projection ->> 'operation_id' is null
     or pg_catalog.length(pg_catalog.btrim(p_projection ->> 'operation_id')) not between 1 and 200
     or p_projection ->> 'operation_id' ~ '[[:cntrl:]]'
     or v_workspace_id is null
     or v_payment_id is null
     or v_event_created_at is null
     or v_event_created_at <= '2000-01-01 00:00:00+00'::timestamptz
     or v_paid_at is null
     or v_paid_at <= '2000-01-01 00:00:00+00'::timestamptz
     or v_paid_at > v_event_created_at
     or v_amount_cents is null
     or v_amount_cents <= 0
     or v_application_fee_cents is null
     or v_application_fee_cents < 0
     or v_application_fee_cents > v_amount_cents
     or v_reconciliation_status is null
     or v_reconciliation_status not in ('pending', 'reconciled')
     or (v_application_fee_id is not null and v_application_fee_id !~ '^fee_[A-Za-z0-9_]+$')
     or (v_balance_transaction_id is not null and v_balance_transaction_id !~ '^txn_[A-Za-z0-9_]+$')
     or (v_application_fee_cents = 0 and v_application_fee_id is not null)
     or (
       v_reconciliation_status = 'reconciled'
       and (
         v_balance_transaction_id is null
         or (v_application_fee_cents > 0 and v_application_fee_id is null)
       )
     ) then
    raise exception 'connected payment projection contract is invalid' using errcode = '22023';
  end if;

  select e.* into v_event
    from public.billing_events e
   where e.id = p_billing_event_id
   for update;
  if not found
     or v_event.provider <> 'stripe'
     or v_event.event_scope <> 'connected_payment'
     or v_event.event_type <> 'checkout.session.completed'
     or v_event.processing_status <> 'processing'
     or v_event.projection_claim_token is distinct from p_claim_token
     or v_event.projection_lease_expires_at <= pg_catalog.now() then
    raise exception 'connected payment projection claim is not owned or expired'
      using errcode = '55000';
  end if;
  if v_event.provider_event_id is distinct from (p_projection ->> 'provider_event_id')
     or v_event.provider_created_at is distinct from v_event_created_at
     or v_event.account_id is distinct from v_workspace_id
     or v_event.provider_account_id is distinct from (p_projection ->> 'merchant_account_id')
     or v_event.livemode is distinct from (p_projection ->> 'livemode')::boolean
     or v_event.payload #>> '{data_object,id}' is distinct from (p_projection ->> 'checkout_session_id') then
    raise exception 'connected payment projection does not match its inbox event'
      using errcode = '22000';
  end if;

  perform 1
    from public.accounts a
   where a.id = v_event.account_id
     and a.stripe_merchant_account_id = v_event.provider_account_id
     and a.merchant_livemode = v_event.livemode
   for key share;
  if not found then
    raise exception 'connected payment projection workspace mapping changed'
      using errcode = '55000';
  end if;

  select p.* into v_payment
    from public.payments p
   where p.id = v_payment_id
     and p.account_id = v_workspace_id
   for update;
  if not found
     or v_payment.charge_model <> 'direct'
     or v_payment.stripe_account_id is distinct from v_event.provider_account_id
     or v_payment.stripe_livemode is distinct from v_event.livemode
     or v_payment.stripe_checkout_session is distinct from (p_projection ->> 'checkout_session_id')
     or (v_payment.amount * 100)::bigint is distinct from v_amount_cents
     or (v_payment.platform_fee * 100)::bigint is distinct from v_application_fee_cents
     or v_payment.status::text not in ('processing', 'paid')
     or v_payment.reconciliation_status not in ('pending', 'reconciled')
     or (v_payment.stripe_payment_intent is not null
       and v_payment.stripe_payment_intent is distinct from (p_projection ->> 'payment_intent_id'))
     or (v_payment.stripe_charge_id is not null
       and v_payment.stripe_charge_id is distinct from (p_projection ->> 'charge_id'))
     or (v_payment.stripe_application_fee_id is not null
       and v_payment.stripe_application_fee_id is distinct from v_application_fee_id)
     or (v_payment.stripe_balance_transaction_id is not null
       and v_payment.stripe_balance_transaction_id is distinct from v_balance_transaction_id)
     or (v_payment.paid_at is not null and v_payment.paid_at is distinct from v_paid_at) then
    raise exception 'connected payment projection conflicts with immutable payment truth'
      using errcode = '22000';
  end if;

  select o.* into v_operation
    from public.billing_payment_operations o
   where o.payment_id = v_payment.id
     and o.account_id = v_payment.account_id
     and o.operation_type = 'checkout_session.create'
   for share;
  if not found
     or v_operation.state <> 'succeeded'
     or v_operation.operation_id is distinct from (p_projection ->> 'operation_id')
     or v_operation.provider_object_id is distinct from v_payment.stripe_checkout_session
     or v_operation.stripe_account_id is distinct from v_payment.stripe_account_id
     or v_operation.livemode is distinct from v_payment.stripe_livemode then
    raise exception 'connected payment projection conflicts with immutable Checkout operation'
      using errcode = '22000';
  end if;

  v_final_reconciliation_status := case
    when v_payment.reconciliation_status = 'reconciled' then 'reconciled'
    else v_reconciliation_status
  end;
  v_applied := not (
    v_payment.status::text = 'paid'
    and v_payment.paid_at is not distinct from v_paid_at
    and v_payment.stripe_payment_intent is not distinct from (p_projection ->> 'payment_intent_id')
    and v_payment.stripe_charge_id is not distinct from (p_projection ->> 'charge_id')
    and v_payment.stripe_application_fee_id is not distinct from v_application_fee_id
    and v_payment.stripe_balance_transaction_id is not distinct from v_balance_transaction_id
    and v_payment.reconciliation_status = v_final_reconciliation_status
  );

  update public.payments p
     set status = 'paid',
         paid_at = v_paid_at,
         stripe_payment_intent = coalesce(
           p.stripe_payment_intent,
           p_projection ->> 'payment_intent_id'
         ),
         stripe_charge_id = coalesce(
           p.stripe_charge_id,
           p_projection ->> 'charge_id'
         ),
         stripe_application_fee_id = coalesce(
           p.stripe_application_fee_id,
           v_application_fee_id
         ),
         stripe_balance_transaction_id = coalesce(
           p.stripe_balance_transaction_id,
           v_balance_transaction_id
         ),
         reconciliation_status = v_final_reconciliation_status,
         reconciled_at = case
           when v_final_reconciliation_status = 'reconciled'
             then coalesce(p.reconciled_at, pg_catalog.now())
           else null
         end
   where p.id = v_payment.id;

  update public.billing_events e
     set processing_status = 'processed',
         processed_at = pg_catalog.now(),
         next_attempt_at = null,
         last_error = null,
         projection_claim_token = null,
         projection_lease_expires_at = null,
         projection_schema_version = 'stripe_connected_payment_projection_v1',
         projection_applied = v_applied,
         projection_result = case v_final_reconciliation_status
           when 'reconciled' then 'direct_payment_paid_reconciled'
           else 'direct_payment_paid_pending_reconciliation'
         end
   where e.id = v_event.id;

  return query select
    'processed'::text, v_payment.id, v_payment.account_id, v_applied,
    v_final_reconciliation_status;
end;
$$;

create or replace function public.fail_stripe_connected_payment_event(
  p_billing_event_id uuid,
  p_claim_token uuid,
  p_error_code text,
  p_retryable boolean,
  p_next_attempt_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $$
declare
  v_event public.billing_events%rowtype;
begin
  if p_billing_event_id is null
     or p_claim_token is null
     or p_error_code is null
     or p_error_code !~ '^[a-z][a-z0-9_]{2,63}$'
     or p_retryable is null
     or (p_retryable and (p_next_attempt_at is null or p_next_attempt_at <= pg_catalog.now()))
     or (not p_retryable and p_next_attempt_at is not null) then
    raise exception 'connected payment failure input is invalid' using errcode = '22023';
  end if;

  select e.* into v_event
    from public.billing_events e
   where e.id = p_billing_event_id
   for update;
  if not found
     or v_event.event_scope <> 'connected_payment'
     or v_event.event_type <> 'checkout.session.completed'
     or v_event.processing_status <> 'processing'
     or v_event.projection_claim_token is distinct from p_claim_token
     or v_event.projection_lease_expires_at <= pg_catalog.now() then
    raise exception 'connected payment failure claim is not owned or expired'
      using errcode = '55000';
  end if;

  update public.billing_events e
     set processing_status = 'failed',
         processed_at = null,
         next_attempt_at = p_next_attempt_at,
         last_error = p_error_code,
         projection_claim_token = null,
         projection_lease_expires_at = null,
         projection_schema_version = null,
         projection_applied = null,
         projection_result = null
   where e.id = v_event.id;
  return true;
end;
$$;

comment on function public.project_stripe_connected_payment_event(uuid, uuid, jsonb) is
  'Dark success-only connected payment projector; no active caller exists. Reconciliation is complete only with exact connected-account fee and balance evidence.';
comment on function public.claim_stripe_connected_payment_event(uuid) is
  'Dark claim by explicit inbox ID; unsupported connected event types remain received and unclaimed.';

revoke all on function public.claim_stripe_connected_payment_event(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.claim_stripe_connected_payment_event(uuid)
  to service_role;

revoke all on function public.resolve_stripe_connected_payment_projection_binding(
  uuid, uuid, uuid, uuid, text
) from public, anon, authenticated, service_role;
grant execute on function public.resolve_stripe_connected_payment_projection_binding(
  uuid, uuid, uuid, uuid, text
) to service_role;

revoke all on function public.project_stripe_connected_payment_event(uuid, uuid, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.project_stripe_connected_payment_event(uuid, uuid, jsonb)
  to service_role;

revoke all on function public.fail_stripe_connected_payment_event(
  uuid, uuid, text, boolean, timestamptz
) from public, anon, authenticated, service_role;
grant execute on function public.fail_stripe_connected_payment_event(
  uuid, uuid, text, boolean, timestamptz
) to service_role;

commit;
