-- DARK late-success reconciliation foundation for generation-aware direct Checkout.
--
-- A signed paid completion can arrive for an expired Checkout generation after
-- a successor has already been created. SQL cannot cancel that successor at
-- Stripe and must not pretend that it has. This migration therefore records
-- the complete validated paid observation, preserves every authoritative
-- Session/provider pointer, and leaves a durable payment-level presentation
-- and mutation block. A
-- service-only prepare/finalize protocol may later GET and expire the exact
-- successor outside all database transactions. This migration deliberately
-- does not project/reparent the predecessor, mark the payment paid, settle the
-- invoice, add a worker/route/cron, change an environment variable, or enable a
-- gate.

begin;

-- Match the runtime financial lock order before installing the reciprocal
-- task/payment guards. The relevant staging ledgers are expected to be empty,
-- but the DDL is valid for nonempty ledgers and requires no truth backfill.
lock table public.payments in share row exclusive mode;
lock table public.billing_payment_operations in share row exclusive mode;
lock table public.billing_events in share row exclusive mode;

-- Extend only the connected-payment completed-event terminal vocabulary. The
-- projection schema is still v1: the provider evidence contract is unchanged;
-- only its safe local disposition is new.
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
      'direct_payment_paid_reconciled',
      'direct_checkout_expired',
      'direct_payment_late_success_resolution_pending',
      'direct_payment_late_success_manual_review',
      'direct_payment_additional_paid_truth_manual_review'
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
          and projection_applied is not null
          and projection_result is not null
          and (
            (
              event_type = 'checkout.session.completed'
              and projection_schema_version is not distinct from 'stripe_connected_payment_projection_v1'
              and projection_result in (
                'direct_payment_paid_pending_reconciliation',
                'direct_payment_paid_reconciled',
                'direct_payment_late_success_resolution_pending',
                'direct_payment_late_success_manual_review',
                'direct_payment_additional_paid_truth_manual_review'
              )
            )
            or (
              event_type = 'checkout.session.expired'
              and projection_schema_version is not distinct from 'stripe_connected_checkout_expiration_v1'
              and projection_result = 'direct_checkout_expired'
            )
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

create table public.billing_direct_checkout_late_success_tasks (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  billing_event_id uuid not null unique
    references public.billing_events(id) on update restrict on delete restrict,
  account_id uuid not null references public.accounts(id) on update restrict on delete restrict,
  payment_id uuid not null,
  charge_model text not null default 'direct' check (charge_model = 'direct'),
  stripe_account_id text not null check (
    stripe_account_id ~ '^acct_[A-Za-z0-9]{8,}$'
  ),
  livemode boolean not null,

  paid_operation_pk uuid not null,
  paid_checkout_generation integer not null check (paid_checkout_generation between 1 and 5),
  paid_checkout_session_id text not null check (
    paid_checkout_session_id ~ '^cs_(test|live)_[A-Za-z0-9_]+$'
    and pg_catalog.length(paid_checkout_session_id) <= 255
  ),
  observed_current_operation_pk uuid not null,
  observed_current_generation integer not null check (
    observed_current_generation between 1 and 5
  ),
  observed_current_state text not null check (
    observed_current_state in ('claimed', 'submitted', 'succeeded', 'failed', 'indeterminate')
  ),
  observed_current_lifecycle text check (
    observed_current_lifecycle is null
    or observed_current_lifecycle in ('open', 'expired_unpaid', 'paid')
  ),
  observed_current_session_id text check (
    observed_current_session_id is null
    or (
      observed_current_session_id ~ '^cs_(test|live)_[A-Za-z0-9_]+$'
      and pg_catalog.length(observed_current_session_id) <= 255
    )
  ),
  expected_amount_cents bigint not null check (
    expected_amount_cents between 1 and 99999999
  ),
  expected_application_fee_cents bigint not null check (
    expected_application_fee_cents between 0 and expected_amount_cents
  ),
  expected_reconciliation_status text not null check (
    expected_reconciliation_status in ('pending', 'reconciled')
  ),

  provider_event_id text check (
    provider_event_id is null
    or (
    provider_event_id ~ '^evt_[A-Za-z0-9_]{8,}$'
    and pg_catalog.length(provider_event_id) <= 255
    )
  ),
  provider_event_created_at timestamptz,
  paid_at timestamptz,
  payment_intent_id text check (
    payment_intent_id is null
    or (
    payment_intent_id ~ '^pi_[A-Za-z0-9_]+$'
    and pg_catalog.length(payment_intent_id) <= 255
    )
  ),
  charge_id text check (
    charge_id is null
    or (
    charge_id ~ '^ch_[A-Za-z0-9_]+$'
    and pg_catalog.length(charge_id) <= 255
    )
  ),
  application_fee_id text check (
    application_fee_id is null
    or (
      application_fee_id ~ '^fee_[A-Za-z0-9_]+$'
      and pg_catalog.length(application_fee_id) <= 255
    )
  ),
  balance_transaction_id text check (
    balance_transaction_id is null
    or (
      balance_transaction_id ~ '^txn_[A-Za-z0-9_]+$'
      and pg_catalog.length(balance_transaction_id) <= 255
    )
  ),
  currency text check (currency is null or currency = 'usd'),
  amount_cents bigint check (
    amount_cents is null or amount_cents between 1 and 99999999
  ),
  application_fee_cents bigint check (
    application_fee_cents is null
    or (
      amount_cents is not null
      and application_fee_cents between 0 and amount_cents
    )
  ),
  provider_reconciliation_status text check (
    provider_reconciliation_status is null
    or provider_reconciliation_status in ('pending', 'reconciled')
  ),
  late_success_projection jsonb check (
    late_success_projection is null
    or pg_catalog.jsonb_typeof(late_success_projection) = 'object'
  ),
  late_success_projection_sha256 text check (
    late_success_projection_sha256 is null
    or late_success_projection_sha256 ~ '^[0-9a-f]{64}$'
  ),

  prepared_action text check (
    prepared_action is null
    or prepared_action in (
      'retrieve_then_expire', 'successor_neutralized', 'manual_review'
    )
  ),
  prepared_current_operation_pk uuid,
  prepared_current_session_id text check (
    prepared_current_session_id is null
    or (
      prepared_current_session_id ~ '^cs_(test|live)_[A-Za-z0-9_]+$'
      and pg_catalog.length(prepared_current_session_id) <= 255
    )
  ),
  prepared_current_session_expires_at timestamptz,
  expire_operation_id text check (
    expire_operation_id is null
    or (
      pg_catalog.length(expire_operation_id) between 1 and 200
      and expire_operation_id !~ '[[:cntrl:]]'
    )
  ),
  prepared_reason_code text check (
    prepared_reason_code is null
    or (
      pg_catalog.length(prepared_reason_code) between 3 and 100
      and prepared_reason_code ~ '^[a-z][a-z0-9_]+$'
    )
  ),
  prepared_at timestamptz,

  task_state text not null default 'ready' check (
    task_state in (
      'ready', 'leased', 'retry_wait',
      'successor_neutralized', 'manual_review'
    )
  ),
  claim_token uuid,
  last_claim_token uuid,
  lease_expires_at timestamptz,
  attempt_count integer not null default 0 check (attempt_count between 0 and 8),
  next_attempt_at timestamptz,
  last_error_code text check (
    last_error_code is null
    or (
      pg_catalog.length(last_error_code) between 3 and 100
      and last_error_code ~ '^[a-z][a-z0-9_]+$'
    )
  ),
  resolution_source text check (
    resolution_source is null
    or resolution_source in (
      'never_submitted', 'signed_expiration', 'stripe_observation'
    )
  ),
  successor_observation jsonb check (
    successor_observation is null
    or pg_catalog.jsonb_typeof(successor_observation) = 'object'
  ),
  successor_observation_sha256 text check (
    successor_observation_sha256 is null
    or successor_observation_sha256 ~ '^[0-9a-f]{64}$'
  ),
  reason_code text check (
    reason_code is null
    or (
      pg_catalog.length(reason_code) between 3 and 100
      and reason_code ~ '^[a-z][a-z0-9_]+$'
    )
  ),
  neutralized_at timestamptz,
  manual_reviewed_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),

  constraint direct_checkout_late_task_payment_fk
    foreign key (
      payment_id, account_id, stripe_account_id, livemode, charge_model
    ) references public.payments(
      id, account_id, stripe_account_id, stripe_livemode, charge_model
    ) on update restrict on delete restrict,
  constraint direct_checkout_late_task_paid_operation_fk
    foreign key (
      paid_operation_pk, account_id, payment_id,
      stripe_account_id, livemode, charge_model
    ) references public.billing_payment_operations(
      id, account_id, payment_id, stripe_account_id, livemode, charge_model
    ) on update restrict on delete restrict,
  constraint direct_checkout_late_task_current_operation_fk
    foreign key (
      observed_current_operation_pk, account_id, payment_id,
      stripe_account_id, livemode, charge_model
    ) references public.billing_payment_operations(
      id, account_id, payment_id, stripe_account_id, livemode, charge_model
    ) on update restrict on delete restrict,
  constraint direct_checkout_late_task_prepared_operation_fk
    foreign key (
      prepared_current_operation_pk, account_id, payment_id,
      stripe_account_id, livemode, charge_model
    ) references public.billing_payment_operations(
      id, account_id, payment_id, stripe_account_id, livemode, charge_model
    ) on update restrict on delete restrict,
  constraint direct_checkout_late_task_scope_unique unique (
    id, account_id, payment_id, stripe_account_id, livemode, charge_model
  ),
  constraint direct_checkout_late_task_evidence_check check (
    (
      (
        paid_operation_pk = observed_current_operation_pk
        and paid_checkout_generation = observed_current_generation
      )
      or (
        paid_operation_pk <> observed_current_operation_pk
        and paid_checkout_generation < observed_current_generation
      )
    )
    and (
      (
        provider_event_id is null
        and provider_event_created_at is null
        and paid_at is null
        and payment_intent_id is null
        and charge_id is null
        and application_fee_id is null
        and balance_transaction_id is null
        and currency is null
        and amount_cents is null
        and application_fee_cents is null
        and provider_reconciliation_status is null
        and late_success_projection is null
        and late_success_projection_sha256 is null
      )
      or (
        provider_event_id is not null
        and provider_event_created_at is not null
        and paid_at is not null
        and paid_at <= provider_event_created_at
        and payment_intent_id is not null
        and charge_id is not null
        and currency = 'usd'
        and amount_cents is not null
        and application_fee_cents is not null
        and provider_reconciliation_status is not null
        and late_success_projection is not null
        and late_success_projection_sha256 is not null
        and (application_fee_cents > 0 or application_fee_id is null)
        and (
          provider_reconciliation_status = 'pending'
          or (
            balance_transaction_id is not null
            and (application_fee_cents = 0 or application_fee_id is not null)
          )
        )
      )
    )
    and (
      (not livemode and paid_checkout_session_id ~ '^cs_test_')
      or (livemode and paid_checkout_session_id ~ '^cs_live_')
    )
    and (
      observed_current_session_id is null
      or (not livemode and observed_current_session_id ~ '^cs_test_')
      or (livemode and observed_current_session_id ~ '^cs_live_')
    )
    and (
      (successor_observation is null and successor_observation_sha256 is null)
      or (
        successor_observation is not null
        and successor_observation_sha256 is not null
      )
    )
    and (
      (
        prepared_action is null
        and prepared_current_operation_pk is null
        and prepared_current_session_id is null
        and prepared_current_session_expires_at is null
        and expire_operation_id is null
        and prepared_reason_code is null
        and prepared_at is null
      )
      or (
        prepared_action is not null
        and prepared_current_operation_pk is not null
        and expire_operation_id is not null
        and prepared_reason_code is not null
        and prepared_at is not null
        and (
          (
            prepared_action = 'retrieve_then_expire'
            and prepared_current_session_id is not null
            and prepared_current_session_expires_at is not null
          )
          or (
            prepared_action <> 'retrieve_then_expire'
            and (
              (
                prepared_current_session_id is null
                and prepared_current_session_expires_at is null
              )
              or (
                prepared_current_session_id is not null
                and prepared_current_session_expires_at is not null
              )
            )
          )
        )
      )
    )
  ),
  constraint direct_checkout_late_task_state_shape_check check (
    (
      task_state = 'ready'
      and claim_token is null
      and last_claim_token is null
      and lease_expires_at is null
      and attempt_count = 0
      and next_attempt_at is null
      and last_error_code is null
      and resolution_source is null
      and successor_observation is null
      and reason_code is null
      and neutralized_at is null
      and manual_reviewed_at is null
    )
    or (
      task_state = 'leased'
      and claim_token is not null
      and last_claim_token = claim_token
      and lease_expires_at is not null
      and attempt_count between 1 and 8
      and next_attempt_at is null
      and last_error_code is null
      and resolution_source is null
      and successor_observation is null
      and reason_code is null
      and neutralized_at is null
      and manual_reviewed_at is null
    )
    or (
      task_state = 'retry_wait'
      and claim_token is null
      and last_claim_token is not null
      and lease_expires_at is null
      and attempt_count between 1 and 7
      and next_attempt_at is not null
      and last_error_code is not null
      and resolution_source is null
      and successor_observation is null
      and reason_code is null
      and neutralized_at is null
      and manual_reviewed_at is null
    )
    or (
      task_state = 'successor_neutralized'
      and claim_token is null
      and lease_expires_at is null
      and next_attempt_at is null
      and last_error_code is null
      and resolution_source is not null
      and (
        (resolution_source = 'stripe_observation' and successor_observation is not null)
        or (
          resolution_source in ('never_submitted', 'signed_expiration')
          and successor_observation is null
        )
      )
      and reason_code is not null
      and neutralized_at is not null
      and manual_reviewed_at is null
    )
    or (
      task_state = 'manual_review'
      and claim_token is null
      and lease_expires_at is null
      and next_attempt_at is null
      and reason_code is not null
      and neutralized_at is null
      and manual_reviewed_at is not null
    )
  )
);

create index direct_checkout_late_task_payment_idx
  on public.billing_direct_checkout_late_success_tasks(
    payment_id, created_at, id
  );
create index direct_checkout_late_task_paid_session_idx
  on public.billing_direct_checkout_late_success_tasks(
    stripe_account_id, livemode, paid_checkout_session_id
  );
create unique index direct_checkout_late_task_claim_unique
  on public.billing_direct_checkout_late_success_tasks(claim_token)
  where claim_token is not null;
create index direct_checkout_late_task_work_idx
  on public.billing_direct_checkout_late_success_tasks(
    task_state, next_attempt_at, lease_expires_at, created_at, id
  )
  where task_state in ('ready', 'leased', 'retry_wait');
create index direct_checkout_late_task_manual_idx
  on public.billing_direct_checkout_late_success_tasks(
    manual_reviewed_at desc, id
  )
  where task_state = 'manual_review';

alter table public.billing_direct_checkout_late_success_tasks enable row level security;
alter table public.billing_direct_checkout_late_success_tasks force row level security;

alter table public.payments
  add column late_checkout_success_task_pk uuid;

alter table public.payments
  add constraint payments_late_checkout_success_task_fk
    foreign key (
      late_checkout_success_task_pk, account_id, id,
      stripe_account_id, stripe_livemode, charge_model
    ) references public.billing_direct_checkout_late_success_tasks(
      id, account_id, payment_id, stripe_account_id, livemode, charge_model
    ) on update restrict on delete restrict
    deferrable initially deferred,
  add constraint payments_late_checkout_success_shape_check check (
    late_checkout_success_task_pk is null
    or charge_model = 'direct'
  );

create unique index payments_late_checkout_success_task_unique
  on public.payments(late_checkout_success_task_pk)
  where late_checkout_success_task_pk is not null;

create index direct_checkout_late_task_paid_operation_idx
  on public.billing_direct_checkout_late_success_tasks(paid_operation_pk);
create index direct_checkout_late_task_current_operation_idx
  on public.billing_direct_checkout_late_success_tasks(observed_current_operation_pk);
create index direct_checkout_late_task_prepared_operation_idx
  on public.billing_direct_checkout_late_success_tasks(prepared_current_operation_pk)
  where prepared_current_operation_pk is not null;

create function public.direct_checkout_late_success_projection_is_valid(
  p_projection jsonb
)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_expected_keys text[] := array[
    'schema', 'provider_event_id', 'event_type', 'event_created_at',
    'workspace_id', 'payment_id', 'operation_id', 'checkout_session_id',
    'payment_intent_id', 'charge_id', 'application_fee_id',
    'balance_transaction_id', 'merchant_account_id', 'livemode', 'currency',
    'amount_cents', 'application_fee_cents', 'paid_at',
    'reconciliation_status'
  ];
  v_event_created_at timestamptz;
  v_paid_at timestamptz;
  v_amount_cents bigint;
  v_application_fee_cents bigint;
begin
  if p_projection is null
     or pg_catalog.jsonb_typeof(p_projection) <> 'object'
     or not (p_projection ?& v_expected_keys)
     or (p_projection - v_expected_keys) <> '{}'::jsonb then
    return false;
  end if;

  begin
    perform (p_projection ->> 'workspace_id')::uuid;
    perform (p_projection ->> 'payment_id')::uuid;
    v_event_created_at := (p_projection ->> 'event_created_at')::timestamptz;
    v_paid_at := (p_projection ->> 'paid_at')::timestamptz;
    v_amount_cents := (p_projection ->> 'amount_cents')::bigint;
    v_application_fee_cents := (p_projection ->> 'application_fee_cents')::bigint;
  exception when others then
    return false;
  end;

  return coalesce((
    p_projection ->> 'schema' = 'stripe_connected_payment_projection_v1'
    and p_projection ->> 'event_type' = 'checkout.session.completed'
    and p_projection ->> 'currency' = 'usd'
    and pg_catalog.jsonb_typeof(p_projection -> 'livemode') = 'boolean'
    and p_projection ->> 'provider_event_id' ~ '^evt_[A-Za-z0-9_]{8,}$'
    and pg_catalog.length(p_projection ->> 'provider_event_id') <= 255
    and p_projection ->> 'checkout_session_id' ~ '^cs_(test|live)_[A-Za-z0-9_]+$'
    and pg_catalog.length(p_projection ->> 'checkout_session_id') <= 255
    and p_projection ->> 'payment_intent_id' ~ '^pi_[A-Za-z0-9_]+$'
    and pg_catalog.length(p_projection ->> 'payment_intent_id') <= 255
    and p_projection ->> 'charge_id' ~ '^ch_[A-Za-z0-9_]+$'
    and pg_catalog.length(p_projection ->> 'charge_id') <= 255
    and p_projection ->> 'merchant_account_id' ~ '^acct_[A-Za-z0-9]{8,}$'
    and pg_catalog.length(pg_catalog.btrim(p_projection ->> 'operation_id')) between 1 and 200
    and p_projection ->> 'operation_id' !~ '[[:cntrl:]]'
    and v_event_created_at > '2000-01-01 00:00:00+00'::timestamptz
    and v_paid_at > '2000-01-01 00:00:00+00'::timestamptz
    and v_paid_at <= v_event_created_at
    and v_amount_cents between 1 and 99999999
    and v_application_fee_cents between 0 and v_amount_cents
    and p_projection ->> 'reconciliation_status' in ('pending', 'reconciled')
    and (
      p_projection ->> 'application_fee_id' is null
      or p_projection ->> 'application_fee_id' ~ '^fee_[A-Za-z0-9_]+$'
    )
    and (
      p_projection ->> 'balance_transaction_id' is null
      or p_projection ->> 'balance_transaction_id' ~ '^txn_[A-Za-z0-9_]+$'
    )
    and (
      v_application_fee_cents > 0
      or p_projection ->> 'application_fee_id' is null
    )
    and (
      p_projection ->> 'reconciliation_status' = 'pending'
      or (
        p_projection ->> 'balance_transaction_id' is not null
        and (
          v_application_fee_cents = 0
          or p_projection ->> 'application_fee_id' is not null
        )
      )
    )
  ), false);
end;
$$;

create function public.direct_checkout_late_success_observation_is_valid(
  p_observation jsonb,
  p_checkout_session_id text
)
returns boolean
language plpgsql
stable
set search_path = ''
as $$
declare
  v_expected_keys text[] := array[
    'schema', 'source', 'checkout_session_id', 'session_status',
    'payment_status', 'payment_intent_id', 'observed_at'
  ];
  v_observed_at timestamptz;
begin
  if p_observation is null
     or pg_catalog.jsonb_typeof(p_observation) <> 'object'
     or not (p_observation ?& v_expected_keys)
     or (p_observation - v_expected_keys) <> '{}'::jsonb then
    return false;
  end if;
  begin
    v_observed_at := (p_observation ->> 'observed_at')::timestamptz;
  exception when others then
    return false;
  end;
  return coalesce((
    p_observation ->> 'schema'
      = 'direct_checkout_late_success_successor_observation_v1'
    and p_observation ->> 'source' in (
      'retrieve', 'post_expire_retrieve', 'post_error_retrieve'
    )
    and p_observation ->> 'checkout_session_id' = p_checkout_session_id
    and p_observation ->> 'session_status' in ('open', 'complete', 'expired')
    and p_observation ->> 'payment_status' in (
      'paid', 'unpaid', 'no_payment_required'
    )
    and (
      p_observation ->> 'payment_intent_id' is null
      or p_observation ->> 'payment_intent_id' ~ '^pi_[A-Za-z0-9_]+$'
    )
    and v_observed_at > '2000-01-01 00:00:00+00'::timestamptz
    and v_observed_at <= pg_catalog.now() + interval '5 minutes'
  ), false);
end;
$$;

create function public.protect_direct_checkout_late_success_task()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_task_id text := pg_catalog.current_setting(
    'lgq.direct_checkout_late_success_task_id',
    true
  );
begin
  if tg_op = 'DELETE' then
    raise exception 'direct Checkout late-success tasks are append-only'
      using errcode = '42501';
  end if;
  if v_task_id is distinct from new.id::text then
    raise exception 'direct Checkout late-success task writes require an owned RPC'
      using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' then
    if old.task_state in ('successor_neutralized', 'manual_review')
       and new.task_state is distinct from old.task_state then
      raise exception 'terminal direct Checkout late-success tasks are immutable'
        using errcode = '55000';
    end if;
    if old.late_success_projection is not null
       and (
         new.late_success_projection is distinct from old.late_success_projection
         or new.late_success_projection_sha256
            is distinct from old.late_success_projection_sha256
       ) then
      raise exception 'validated late-success paid evidence is immutable'
        using errcode = '55000';
    end if;
    if old.successor_observation is not null
       and (
         new.successor_observation is distinct from old.successor_observation
         or new.successor_observation_sha256
            is distinct from old.successor_observation_sha256
       ) then
      raise exception 'late-success successor observation is immutable'
        using errcode = '55000';
    end if;
    if old.prepared_action is not null
       and (
         new.prepared_action is distinct from old.prepared_action
         or new.prepared_current_operation_pk
            is distinct from old.prepared_current_operation_pk
         or new.prepared_current_session_id
            is distinct from old.prepared_current_session_id
         or new.prepared_current_session_expires_at
            is distinct from old.prepared_current_session_expires_at
         or new.expire_operation_id is distinct from old.expire_operation_id
         or new.prepared_reason_code is distinct from old.prepared_reason_code
         or new.prepared_at is distinct from old.prepared_at
       ) then
      raise exception 'direct Checkout late-success provider action is immutable'
        using errcode = '55000';
    end if;
    if (
      pg_catalog.to_jsonb(new) - array[
        'provider_event_id', 'provider_event_created_at', 'paid_at',
        'payment_intent_id', 'charge_id', 'application_fee_id',
        'balance_transaction_id', 'currency', 'amount_cents',
        'application_fee_cents', 'provider_reconciliation_status',
        'late_success_projection', 'late_success_projection_sha256',
        'prepared_action', 'prepared_current_operation_pk',
        'prepared_current_session_id', 'prepared_current_session_expires_at',
        'expire_operation_id', 'prepared_reason_code', 'prepared_at',
        'task_state', 'claim_token', 'last_claim_token', 'lease_expires_at',
        'attempt_count', 'next_attempt_at', 'last_error_code',
        'resolution_source', 'successor_observation',
        'successor_observation_sha256', 'reason_code', 'neutralized_at',
        'manual_reviewed_at', 'updated_at'
      ]::text[]
    ) is distinct from (
      pg_catalog.to_jsonb(old) - array[
        'provider_event_id', 'provider_event_created_at', 'paid_at',
        'payment_intent_id', 'charge_id', 'application_fee_id',
        'balance_transaction_id', 'currency', 'amount_cents',
        'application_fee_cents', 'provider_reconciliation_status',
        'late_success_projection', 'late_success_projection_sha256',
        'prepared_action', 'prepared_current_operation_pk',
        'prepared_current_session_id', 'prepared_current_session_expires_at',
        'expire_operation_id', 'prepared_reason_code', 'prepared_at',
        'task_state', 'claim_token', 'last_claim_token', 'lease_expires_at',
        'attempt_count', 'next_attempt_at', 'last_error_code',
        'resolution_source', 'successor_observation',
        'successor_observation_sha256', 'reason_code', 'neutralized_at',
        'manual_reviewed_at', 'updated_at'
      ]::text[]
    ) then
      raise exception 'direct Checkout late-success task scope is immutable'
        using errcode = '55000';
    end if;
  end if;
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

create trigger protect_direct_checkout_late_success_task_trigger
before insert or update or delete
on public.billing_direct_checkout_late_success_tasks
for each row execute function public.protect_direct_checkout_late_success_task();

create function public.protect_payment_late_checkout_success_hold()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.late_checkout_success_task_pk is null then
      return new;
    end if;
    if new.charge_model <> 'direct'
       or pg_catalog.current_setting(
         'lgq.direct_checkout_late_success_payment_id',
         true
       ) is distinct from new.id::text then
      raise exception 'direct Checkout late-success payment hold requires an owned RPC'
        using errcode = '42501';
    end if;
    return new;
  end if;
  if new.late_checkout_success_task_pk is not distinct from
     old.late_checkout_success_task_pk then
    return new;
  end if;
  if old.late_checkout_success_task_pk is not null then
    raise exception 'direct Checkout late-success payment hold is immutable'
      using errcode = '42501';
  end if;
  if new.late_checkout_success_task_pk is null
     or new.charge_model <> 'direct'
     or pg_catalog.current_setting(
       'lgq.direct_checkout_late_success_payment_id',
       true
     ) is distinct from new.id::text then
    raise exception 'direct Checkout late-success payment hold requires an owned RPC'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger protect_payment_late_checkout_success_hold_trigger
before insert or update
on public.payments
for each row execute function public.protect_payment_late_checkout_success_hold();

create function public.plan_stripe_connected_payment_projection(
  p_billing_event_id uuid,
  p_claim_token uuid
)
returns table (
  projection_kind text,
  task_id uuid,
  task_claim_token uuid,
  workspace_id uuid,
  payment_id uuid,
  merchant_account_id text,
  livemode boolean,
  paid_operation_pk uuid,
  paid_operation_id text,
  paid_checkout_session_id text,
  paid_checkout_generation integer,
  amount_cents bigint,
  application_fee_cents bigint,
  reconciliation_status text
)
language plpgsql
security definer
set search_path = ''
set timezone to 'UTC'
as $$
declare
  v_event public.billing_events%rowtype;
  v_expected_payload_sha256 text;
  v_paid_hint public.billing_payment_operations%rowtype;
  v_paid public.billing_payment_operations%rowtype;
  v_current public.billing_payment_operations%rowtype;
  v_payment public.payments%rowtype;
  v_task public.billing_direct_checkout_late_success_tasks%rowtype;
  v_session_id text;
  v_task_claim_token uuid := pg_catalog.gen_random_uuid();
  v_is_current boolean;
  v_is_expired_predecessor boolean;
begin
  if p_billing_event_id is null or p_claim_token is null then
    raise exception 'connected payment projection plan identity is invalid'
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
     or v_event.account_id is null
     or v_event.provider_account_id !~ '^acct_[A-Za-z0-9]{8,}$'
     or v_event.livemode is null then
    raise exception 'connected payment projection plan claim is not owned or expired'
      using errcode = '55000';
  end if;
  v_session_id := v_event.payload #>> '{data_object,id}';
  v_expected_payload_sha256 := pg_catalog.encode(
    extensions.digest(pg_catalog.convert_to(v_event.payload::text, 'UTF8'), 'sha256'),
    'hex'
  );
  if v_event.payload #>> '{data_object,object}' is distinct from 'checkout.session'
     or v_session_id !~ '^cs_(test|live)_[A-Za-z0-9_]+$'
     or pg_catalog.length(v_session_id) > 255
     or v_event.payload_sha256 is distinct from v_expected_payload_sha256
     or (v_event.livemode and v_session_id !~ '^cs_live_')
     or (not v_event.livemode and v_session_id !~ '^cs_test_') then
    raise exception 'connected payment projection plan inbox evidence is invalid'
      using errcode = '22000';
  end if;

  perform 1
    from public.accounts a
   where a.id = v_event.account_id
     and a.stripe_merchant_account_id = v_event.provider_account_id
     and a.merchant_livemode = v_event.livemode
   for key share;
  if not found then
    raise exception 'connected payment projection plan Merchant scope changed'
      using errcode = '55000';
  end if;

  select o.* into v_paid_hint
    from public.billing_payment_operations o
   where o.account_id = v_event.account_id
     and o.stripe_account_id = v_event.provider_account_id
     and o.livemode = v_event.livemode
     and o.charge_model = 'direct'
     and o.operation_type = 'checkout_session.create'
     and o.provider_object_id = v_session_id;
  if not found then
    raise exception 'connected payment projection plan has no Checkout generation'
      using errcode = 'P0002';
  end if;

  select p.* into v_payment
    from public.payments p
   where p.id = v_paid_hint.payment_id
     and p.account_id = v_event.account_id
   for update;
  if not found
     or v_payment.charge_model <> 'direct'
     or v_payment.stripe_account_id is distinct from v_event.provider_account_id
     or v_payment.stripe_livemode is distinct from v_event.livemode
     or v_payment.current_checkout_operation_pk is null
     or v_payment.status::text not in ('processing', 'paid')
     or v_payment.reconciliation_status not in ('pending', 'reconciled')
     or v_payment.amount <= 0
     or v_payment.platform_fee is null
     or v_payment.platform_fee < 0
     or v_payment.platform_fee > v_payment.amount then
    raise exception 'connected payment projection plan payment scope conflicts'
      using errcode = '22000';
  end if;

  perform 1
    from public.billing_payment_operations locked_operation
   where locked_operation.payment_id = v_payment.id
     and locked_operation.operation_type = 'checkout_session.create'
   order by locked_operation.checkout_generation, locked_operation.id
   for update;

  select o.* into v_paid
    from public.billing_payment_operations o
   where o.id = v_paid_hint.id
     and o.payment_id = v_payment.id
     and o.account_id = v_payment.account_id;
  select o.* into v_current
    from public.billing_payment_operations o
   where o.id = v_payment.current_checkout_operation_pk
     and o.payment_id = v_payment.id
     and o.account_id = v_payment.account_id
     and o.operation_type = 'checkout_session.create';
  if v_paid.id is null
     or v_current.id is null
     or v_paid.state <> 'succeeded'
     or v_paid.provider_object_id is distinct from v_session_id
     or v_paid.metadata #>> '{schema}'
        is distinct from 'one_off_direct_checkout_generation_v2'
     or (v_paid.metadata #>> '{checkout_generation}')::integer
        is distinct from v_paid.checkout_generation
     or v_current.metadata #>> '{schema}'
        is distinct from 'one_off_direct_checkout_generation_v2'
     or (v_current.metadata #>> '{checkout_generation}')::integer
        is distinct from v_current.checkout_generation
     or v_paid.checkout_generation > v_current.checkout_generation then
    raise exception 'connected payment projection plan generation lineage conflicts'
      using errcode = '22000';
  end if;

  v_is_current :=
    v_payment.late_checkout_success_task_pk is null
    and v_paid.id = v_current.id
    and v_paid.checkout_lifecycle in ('open', 'paid')
    and v_paid.checkout_expiration_id is null
    and v_paid.superseded_by_operation_pk is null
    and v_payment.stripe_checkout_session = v_session_id;
  if v_is_current then
    return query select
      'current'::text, null::uuid, null::uuid, null::uuid, null::uuid,
      null::text, null::boolean, null::uuid, null::text, null::text,
      null::integer, null::bigint, null::bigint, null::text;
    return;
  end if;

  v_is_expired_predecessor :=
    v_paid.checkout_lifecycle = 'expired_unpaid'
    and v_paid.checkout_expiration_id is not null
    and exists (
      select 1
        from public.stripe_connected_checkout_expirations x
       where x.id = v_paid.checkout_expiration_id
         and x.operation_pk = v_paid.id
         and x.payment_id = v_payment.id
         and x.account_id = v_payment.account_id
         and x.checkout_generation = v_paid.checkout_generation
         and x.stripe_account_id = v_payment.stripe_account_id
         and x.livemode = v_payment.stripe_livemode
         and x.checkout_session_id = v_session_id
         and x.session_expires_at = v_paid.checkout_session_expires_at
         and x.observed_session_status = 'expired'
         and x.observed_payment_status = 'unpaid'
         and x.observed_currency = 'usd'
         and x.observed_payment_method_types = array['card']::text[]
         and x.observed_payment_intent_id is null
         and x.observed_recovered_from is null
    );
  if not v_is_expired_predecessor
     and v_payment.late_checkout_success_task_pk is null then
    raise exception 'connected payment projection is neither current nor an expired generation'
      using errcode = '22000';
  end if;
  if v_paid.id <> v_current.id
     and (
       v_paid.checkout_generation >= v_current.checkout_generation
       or v_paid.superseded_by_operation_pk is null
       or not exists (
         with recursive lineage as (
           select current_operation.id,
                  current_operation.predecessor_operation_pk,
                  current_operation.checkout_generation
             from public.billing_payment_operations current_operation
            where current_operation.id = v_current.id
           union all
           select predecessor.id,
                  predecessor.predecessor_operation_pk,
                  predecessor.checkout_generation
             from lineage child
             join public.billing_payment_operations predecessor
               on predecessor.id = child.predecessor_operation_pk
              and predecessor.payment_id = v_payment.id
              and predecessor.account_id = v_payment.account_id
              and predecessor.checkout_generation = child.checkout_generation - 1
              and predecessor.superseded_by_operation_pk = child.id
         )
         select 1
           from lineage
          where lineage.id = v_paid.id
            and lineage.checkout_generation = v_paid.checkout_generation
       )
     ) then
    raise exception 'connected payment projection predecessor lineage is invalid'
      using errcode = '22000';
  end if;

  select t.* into v_task
    from public.billing_direct_checkout_late_success_tasks t
   where t.billing_event_id = v_event.id
   for update;
  if not found then
    v_task.id := pg_catalog.gen_random_uuid();
    perform pg_catalog.set_config(
      'lgq.direct_checkout_late_success_task_id',
      v_task.id::text,
      true
    );
    insert into public.billing_direct_checkout_late_success_tasks (
      id, billing_event_id, account_id, payment_id,
      stripe_account_id, livemode,
      paid_operation_pk, paid_checkout_generation, paid_checkout_session_id,
      observed_current_operation_pk, observed_current_generation,
      observed_current_state, observed_current_lifecycle,
      observed_current_session_id, expected_amount_cents,
      expected_application_fee_cents, expected_reconciliation_status,
      task_state, claim_token, last_claim_token, lease_expires_at,
      attempt_count
    ) values (
      v_task.id, v_event.id, v_payment.account_id, v_payment.id,
      v_payment.stripe_account_id, v_payment.stripe_livemode,
      v_paid.id, v_paid.checkout_generation, v_session_id,
      v_current.id, v_current.checkout_generation, v_current.state,
      v_current.checkout_lifecycle, v_current.provider_object_id,
      (v_payment.amount * 100)::bigint,
      (v_payment.platform_fee * 100)::bigint,
      v_payment.reconciliation_status,
      'leased', v_task_claim_token, v_task_claim_token,
      pg_catalog.now() + interval '5 minutes', 1
    ) returning * into v_task;
    perform pg_catalog.set_config(
      'lgq.direct_checkout_late_success_task_id',
      '',
      true
    );
  else
    if v_task.account_id is distinct from v_payment.account_id
       or v_task.payment_id is distinct from v_payment.id
       or v_task.stripe_account_id is distinct from v_payment.stripe_account_id
       or v_task.livemode is distinct from v_payment.stripe_livemode
       or v_task.paid_operation_pk is distinct from v_paid.id
       or v_task.paid_checkout_session_id is distinct from v_session_id
       or v_task.observed_current_operation_pk is distinct from v_current.id
       or v_task.expected_amount_cents
          is distinct from (v_payment.amount * 100)::bigint
       or v_task.expected_application_fee_cents
          is distinct from (v_payment.platform_fee * 100)::bigint then
      raise exception 'connected payment late-success task scope changed'
        using errcode = '55000';
    end if;
    if v_task.task_state in ('successor_neutralized', 'manual_review') then
      if v_task.prepared_action is null or v_task.last_claim_token is null then
        raise exception 'connected payment late-success terminal task is incomplete'
          using errcode = '55000';
      end if;
      v_task_claim_token := v_task.last_claim_token;
    else
      if v_task.task_state = 'leased'
         and v_task.lease_expires_at > pg_catalog.now() then
        raise exception 'connected payment late-success task is already leased'
          using errcode = '55P03';
      end if;
      if v_task.task_state not in ('ready', 'leased', 'retry_wait')
         or (
           v_task.task_state = 'retry_wait'
           and v_task.next_attempt_at > pg_catalog.now()
         ) then
        raise exception 'connected payment late-success task is not claimable'
          using errcode = '55000';
      end if;
      perform pg_catalog.set_config(
        'lgq.direct_checkout_late_success_task_id',
        v_task.id::text,
        true
      );
      update public.billing_direct_checkout_late_success_tasks t
         set task_state = 'leased',
             claim_token = v_task_claim_token,
             last_claim_token = v_task_claim_token,
             lease_expires_at = pg_catalog.now() + interval '5 minutes',
             attempt_count = case
               when t.task_state = 'ready' then 1
               when t.attempt_count < 8 then t.attempt_count + 1
               else t.attempt_count
             end,
             next_attempt_at = null,
             last_error_code = null
       where t.id = v_task.id
      returning * into v_task;
      perform pg_catalog.set_config(
        'lgq.direct_checkout_late_success_task_id',
        '',
        true
      );
    end if;
  end if;

  if v_payment.late_checkout_success_task_pk is null then
    perform pg_catalog.set_config(
      'lgq.direct_checkout_late_success_payment_id',
      v_payment.id::text,
      true
    );
    update public.payments p
       set late_checkout_success_task_pk = v_task.id
     where p.id = v_payment.id
       and p.late_checkout_success_task_pk is null;
    if not found then
      raise exception 'connected payment late-success hold changed concurrently'
        using errcode = '40001';
    end if;
    perform pg_catalog.set_config(
      'lgq.direct_checkout_late_success_payment_id',
      '',
      true
    );
  end if;

  return query select
    'late_predecessor'::text,
    v_task.id,
    v_task_claim_token,
    v_payment.account_id,
    v_payment.id,
    v_payment.stripe_account_id,
    v_payment.stripe_livemode,
    v_paid.id,
    v_paid.operation_id,
    v_session_id,
    v_paid.checkout_generation,
    (v_payment.amount * 100)::bigint,
    (v_payment.platform_fee * 100)::bigint,
    v_payment.reconciliation_status;
end;
$$;

create function public.prepare_stripe_connected_checkout_late_success_resolution(
  p_task_id uuid,
  p_task_claim_token uuid,
  p_billing_event_id uuid,
  p_event_claim_token uuid,
  p_paid_projection jsonb
)
returns table (
  resolution_action text,
  task_state text,
  reason_code text,
  current_operation_pk uuid,
  current_operation_id text,
  current_checkout_generation integer,
  current_checkout_session_id text,
  current_checkout_session_expires_at timestamptz,
  expire_operation_id text
)
language plpgsql
security definer
set search_path = ''
set timezone to 'UTC'
as $$
declare
  v_task_hint public.billing_direct_checkout_late_success_tasks%rowtype;
  v_task public.billing_direct_checkout_late_success_tasks%rowtype;
  v_event public.billing_events%rowtype;
  v_payment public.payments%rowtype;
  v_paid public.billing_payment_operations%rowtype;
  v_current public.billing_payment_operations%rowtype;
  v_projection_sha256 text;
  v_action text;
  v_reason text;
  v_resolution_source text;
  v_expire_operation_id text;
begin
  if p_task_id is null
     or p_task_claim_token is null
     or p_billing_event_id is null
     or p_event_claim_token is null
     or public.direct_checkout_late_success_projection_is_valid(
       p_paid_projection
     ) is not true then
    raise exception 'direct Checkout late-success prepare input is invalid'
      using errcode = '22023';
  end if;
  v_projection_sha256 := pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(p_paid_projection::text, 'UTF8'),
      'sha256'
    ),
    'hex'
  );

  select t.* into v_task_hint
    from public.billing_direct_checkout_late_success_tasks t
   where t.id = p_task_id;
  if not found then
    raise exception 'direct Checkout late-success task was not found'
      using errcode = 'P0002';
  end if;

  select e.* into v_event
    from public.billing_events e
   where e.id = p_billing_event_id
   for update;
  if not found
     or v_event.id is distinct from v_task_hint.billing_event_id
     or v_event.provider <> 'stripe'
     or v_event.event_scope <> 'connected_payment'
     or v_event.event_type <> 'checkout.session.completed'
     or v_event.processing_status <> 'processing'
     or v_event.projection_claim_token is distinct from p_event_claim_token
     or v_event.projection_lease_expires_at <= pg_catalog.now() then
    raise exception 'direct Checkout late-success event claim is not owned'
      using errcode = '55000';
  end if;

  perform 1
    from public.accounts a
   where a.id = v_task_hint.account_id
     and a.stripe_merchant_account_id = v_task_hint.stripe_account_id
     and a.merchant_livemode = v_task_hint.livemode
   for key share;
  if not found then
    raise exception 'direct Checkout late-success Merchant scope changed'
      using errcode = '55000';
  end if;

  select p.* into v_payment
    from public.payments p
   where p.id = v_task_hint.payment_id
     and p.account_id = v_task_hint.account_id
   for update;
  if not found
     or v_payment.charge_model <> 'direct'
     or v_payment.stripe_account_id is distinct from v_task_hint.stripe_account_id
     or v_payment.stripe_livemode is distinct from v_task_hint.livemode
     or v_payment.current_checkout_operation_pk is null
     or v_payment.late_checkout_success_task_pk is null then
    raise exception 'direct Checkout late-success payment hold changed'
      using errcode = '55000';
  end if;

  perform 1
    from public.billing_payment_operations locked_operation
   where locked_operation.payment_id = v_payment.id
     and locked_operation.operation_type = 'checkout_session.create'
   order by locked_operation.checkout_generation, locked_operation.id
   for update;

  select t.* into v_task
    from public.billing_direct_checkout_late_success_tasks t
   where t.id = p_task_id
   for update;
  select o.* into v_paid
    from public.billing_payment_operations o
   where o.id = v_task.paid_operation_pk
     and o.payment_id = v_task.payment_id
     and o.account_id = v_task.account_id;
  select o.* into v_current
    from public.billing_payment_operations o
   where o.id = v_payment.current_checkout_operation_pk
     and o.payment_id = v_payment.id
     and o.account_id = v_payment.account_id;
  if not (
       (
         v_task.task_state = 'leased'
         and v_task.claim_token = p_task_claim_token
         and v_task.lease_expires_at > pg_catalog.now()
       )
       or (
         v_task.task_state in ('successor_neutralized', 'manual_review')
         and v_task.last_claim_token = p_task_claim_token
         and v_task.prepared_action is not null
       )
     )
     or v_paid.id is null
     or v_current.id is null
     or v_current.id is distinct from v_task.observed_current_operation_pk
     or v_current.checkout_generation
        is distinct from v_task.observed_current_generation
     or v_paid.operation_type <> 'checkout_session.create'
     or v_current.operation_type <> 'checkout_session.create' then
    raise exception 'direct Checkout late-success task lease or lineage changed'
      using errcode = '55000';
  end if;

  if p_paid_projection ->> 'provider_event_id'
       is distinct from v_event.provider_event_id
     or (p_paid_projection ->> 'event_created_at')::timestamptz
        is distinct from v_event.provider_created_at
     or (p_paid_projection ->> 'workspace_id')::uuid
        is distinct from v_task.account_id
     or (p_paid_projection ->> 'payment_id')::uuid
        is distinct from v_task.payment_id
     or p_paid_projection ->> 'operation_id'
        is distinct from v_paid.operation_id
     or p_paid_projection ->> 'checkout_session_id'
        is distinct from v_task.paid_checkout_session_id
     or p_paid_projection ->> 'merchant_account_id'
        is distinct from v_task.stripe_account_id
     or (p_paid_projection ->> 'livemode')::boolean
        is distinct from v_task.livemode
     or (p_paid_projection ->> 'amount_cents')::bigint
        is distinct from v_task.expected_amount_cents
     or (p_paid_projection ->> 'application_fee_cents')::bigint
        is distinct from v_task.expected_application_fee_cents
     or (
       v_task.expected_reconciliation_status = 'reconciled'
       and p_paid_projection ->> 'reconciliation_status' <> 'reconciled'
     )
     or v_event.payload #>> '{data_object,id}'
        is distinct from v_task.paid_checkout_session_id then
    raise exception 'direct Checkout late-success paid projection scope changed'
      using errcode = '55000';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    public.stripe_connected_checkout_session_mutex_key(
      v_task.account_id,
      v_task.stripe_account_id,
      v_task.livemode,
      v_task.paid_checkout_session_id
    )
  );
  if v_task.late_success_projection is null then
    perform pg_catalog.set_config(
      'lgq.direct_checkout_late_success_task_id',
      v_task.id::text,
      true
    );
    update public.billing_direct_checkout_late_success_tasks t
       set provider_event_id = p_paid_projection ->> 'provider_event_id',
           provider_event_created_at =
             (p_paid_projection ->> 'event_created_at')::timestamptz,
           paid_at = (p_paid_projection ->> 'paid_at')::timestamptz,
           payment_intent_id = p_paid_projection ->> 'payment_intent_id',
           charge_id = p_paid_projection ->> 'charge_id',
           application_fee_id = p_paid_projection ->> 'application_fee_id',
           balance_transaction_id =
             p_paid_projection ->> 'balance_transaction_id',
           currency = p_paid_projection ->> 'currency',
           amount_cents = (p_paid_projection ->> 'amount_cents')::bigint,
           application_fee_cents =
             (p_paid_projection ->> 'application_fee_cents')::bigint,
           provider_reconciliation_status =
             p_paid_projection ->> 'reconciliation_status',
           late_success_projection = p_paid_projection,
           late_success_projection_sha256 = v_projection_sha256
     where t.id = v_task.id
    returning * into v_task;
    perform pg_catalog.set_config(
      'lgq.direct_checkout_late_success_task_id',
      '',
      true
    );
  elsif v_task.late_success_projection is distinct from p_paid_projection
     or v_task.late_success_projection_sha256
        is distinct from v_projection_sha256 then
    raise exception 'direct Checkout late-success paid evidence is immutable'
      using errcode = '22000';
  end if;

  v_expire_operation_id :=
    'payment:' || v_task.payment_id::text
    || ':late-success:' || v_task.paid_checkout_generation::text
    || ':successor:' || v_current.checkout_generation::text || ':expire';

  if v_task.prepared_action is null then
    if v_paid.id = v_current.id then
      v_action := 'manual_review';
      v_reason := case
        when v_payment.late_checkout_success_task_pk = v_task.id
          then 'late_paid_truth_without_successor'
        else 'additional_paid_truth_operator_required'
      end;
    elsif v_current.state = 'claimed'
       or (
         v_current.state = 'failed'
         and v_current.submission_started_at is null
         and v_current.provider_object_id is null
       ) then
      v_action := 'successor_neutralized';
      v_reason := 'successor_never_submitted';
      v_resolution_source := 'never_submitted';
    elsif v_current.state = 'succeeded'
       and v_current.checkout_lifecycle = 'expired_unpaid'
       and v_current.checkout_expiration_id is not null
       and exists (
         select 1
           from public.stripe_connected_checkout_expirations x
          where x.id = v_current.checkout_expiration_id
            and x.operation_pk = v_current.id
            and x.payment_id = v_payment.id
            and x.checkout_session_id = v_current.provider_object_id
            and x.observed_session_status = 'expired'
            and x.observed_payment_status = 'unpaid'
       ) then
      v_action := 'successor_neutralized';
      v_reason := 'successor_signed_expired_unpaid';
      v_resolution_source := 'signed_expiration';
    elsif v_current.state = 'succeeded'
       and v_current.checkout_lifecycle = 'open'
       and v_current.provider_object_id is not null
       and v_current.checkout_session_expires_at is not null
       and v_payment.status::text = 'processing'
       and v_payment.stripe_checkout_session = v_current.provider_object_id then
      v_action := 'retrieve_then_expire';
      v_reason := 'successor_provider_expiration_required';
    elsif v_current.checkout_lifecycle = 'paid'
       or v_payment.status::text = 'paid' then
      v_action := 'manual_review';
      v_reason := 'additional_paid_truth_operator_required';
    elsif v_current.state in ('submitted', 'indeterminate')
       or (
         v_current.state = 'failed'
         and v_current.submission_started_at is not null
       ) then
      -- A provider create may still be in flight. Keep the billing event and
      -- durable task retryable so a later completion can bind the exact Session
      -- without ever disclosing its URL, after which this same task expires it.
      raise exception 'direct Checkout successor provider identity is not durable yet'
        using errcode = '55000';
    else
      v_action := 'manual_review';
      v_reason := 'successor_provider_state_indeterminate';
    end if;

    perform pg_catalog.set_config(
      'lgq.direct_checkout_late_success_task_id',
      v_task.id::text,
      true
    );
    update public.billing_direct_checkout_late_success_tasks t
       set prepared_action = v_action,
           prepared_current_operation_pk = v_current.id,
           prepared_current_session_id = v_current.provider_object_id,
           prepared_current_session_expires_at =
             v_current.checkout_session_expires_at,
           expire_operation_id = v_expire_operation_id,
           prepared_reason_code = v_reason,
           prepared_at = pg_catalog.now()
     where t.id = v_task.id
    returning * into v_task;
    perform pg_catalog.set_config(
      'lgq.direct_checkout_late_success_task_id',
      '',
      true
    );
  else
    if v_task.prepared_current_operation_pk is distinct from v_current.id
       or v_task.expire_operation_id is distinct from v_expire_operation_id
       or (
         v_task.prepared_action = 'retrieve_then_expire'
         and (
           v_task.prepared_current_session_id
             is distinct from v_current.provider_object_id
           or v_task.prepared_current_session_expires_at
             is distinct from v_current.checkout_session_expires_at
         )
       ) then
      raise exception 'direct Checkout late-success prepared action changed'
        using errcode = '55000';
    end if;
    v_action := v_task.prepared_action;
    v_reason := v_task.prepared_reason_code;
    v_expire_operation_id := v_task.expire_operation_id;
    v_resolution_source := case v_reason
      when 'successor_never_submitted' then 'never_submitted'
      when 'successor_signed_expired_unpaid' then 'signed_expiration'
      else null
    end;
  end if;

  if v_action <> 'retrieve_then_expire'
     and v_task.task_state not in ('successor_neutralized', 'manual_review') then
    perform pg_catalog.set_config(
      'lgq.direct_checkout_late_success_task_id',
      v_task.id::text,
      true
    );
    update public.billing_direct_checkout_late_success_tasks t
       set task_state = case v_action
             when 'successor_neutralized' then 'successor_neutralized'
             else 'manual_review'
           end,
           claim_token = null,
           lease_expires_at = null,
           next_attempt_at = null,
           last_error_code = null,
           resolution_source = v_resolution_source,
           reason_code = v_reason,
           neutralized_at = case
             when v_action = 'successor_neutralized' then pg_catalog.now()
             else null
           end,
           manual_reviewed_at = case
             when v_action = 'manual_review' then pg_catalog.now()
             else null
           end
     where t.id = v_task.id
    returning * into v_task;
    perform pg_catalog.set_config(
      'lgq.direct_checkout_late_success_task_id',
      '',
      true
    );
  end if;

  return query select
    v_action,
    v_task.task_state,
    v_reason,
    v_current.id,
    v_current.operation_id,
    v_current.checkout_generation,
    v_task.prepared_current_session_id,
    v_task.prepared_current_session_expires_at,
    v_expire_operation_id;
end;
$$;

create function public.finalize_stripe_connected_checkout_late_success_resolution(
  p_task_id uuid,
  p_task_claim_token uuid,
  p_billing_event_id uuid,
  p_event_claim_token uuid,
  p_outcome text,
  p_reason_code text,
  p_successor_observation jsonb
)
returns table (
  processing_status text,
  billing_event_id uuid,
  task_id uuid,
  task_state text,
  reason_code text,
  projection_applied boolean,
  projection_result text
)
language plpgsql
security definer
set search_path = ''
set timezone to 'UTC'
as $$
declare
  v_task_hint public.billing_direct_checkout_late_success_tasks%rowtype;
  v_task public.billing_direct_checkout_late_success_tasks%rowtype;
  v_event public.billing_events%rowtype;
  v_payment public.payments%rowtype;
  v_current public.billing_payment_operations%rowtype;
  v_observation_sha256 text;
  v_projection_result text;
begin
  if p_task_id is null
     or p_task_claim_token is null
     or p_billing_event_id is null
     or p_event_claim_token is null
     or p_outcome is null
     or p_reason_code is null
     or p_outcome not in ('successor_neutralized', 'manual_review')
     or p_reason_code not in (
       'successor_never_submitted',
       'successor_signed_expired_unpaid',
       'successor_expired_unpaid',
       'late_paid_truth_without_successor',
       'additional_paid_truth_operator_required',
       'successor_additional_paid_truth',
       'successor_unexpireable_state',
       'successor_contract_mismatch',
       'successor_provider_state_indeterminate'
     ) then
    raise exception 'direct Checkout late-success finalize input is invalid'
      using errcode = '22023';
  end if;

  select t.* into v_task_hint
    from public.billing_direct_checkout_late_success_tasks t
   where t.id = p_task_id;
  if not found then
    raise exception 'direct Checkout late-success task was not found'
      using errcode = 'P0002';
  end if;

  select e.* into v_event
    from public.billing_events e
   where e.id = p_billing_event_id
   for update;
  if not found
     or v_event.id is distinct from v_task_hint.billing_event_id
     or v_event.processing_status <> 'processing'
     or v_event.projection_claim_token is distinct from p_event_claim_token
     or v_event.projection_lease_expires_at <= pg_catalog.now() then
    raise exception 'direct Checkout late-success finalize event is not owned'
      using errcode = '55000';
  end if;

  perform 1
    from public.accounts a
   where a.id = v_task_hint.account_id
     and a.stripe_merchant_account_id = v_task_hint.stripe_account_id
     and a.merchant_livemode = v_task_hint.livemode
   for key share;
  if not found then
    raise exception 'direct Checkout late-success finalize Merchant scope changed'
      using errcode = '55000';
  end if;

  select p.* into v_payment
    from public.payments p
   where p.id = v_task_hint.payment_id
     and p.account_id = v_task_hint.account_id
   for update;
  if not found
     or v_payment.late_checkout_success_task_pk is null
     or v_payment.current_checkout_operation_pk is null then
    raise exception 'direct Checkout late-success finalize payment hold changed'
      using errcode = '55000';
  end if;

  perform 1
    from public.billing_payment_operations locked_operation
   where locked_operation.payment_id = v_payment.id
     and locked_operation.operation_type = 'checkout_session.create'
   order by locked_operation.checkout_generation, locked_operation.id
   for update;
  select t.* into v_task
    from public.billing_direct_checkout_late_success_tasks t
   where t.id = p_task_id
   for update;
  select o.* into v_current
    from public.billing_payment_operations o
   where o.id = v_payment.current_checkout_operation_pk
     and o.payment_id = v_payment.id
     and o.account_id = v_payment.account_id;
  if v_current.id is null
     or v_current.id is distinct from v_task.observed_current_operation_pk
     or v_current.checkout_generation
        is distinct from v_task.observed_current_generation
     or v_task.late_success_projection is null then
    raise exception 'direct Checkout late-success finalize lineage changed'
      using errcode = '55000';
  end if;

  if v_task.task_state in ('successor_neutralized', 'manual_review') then
    if v_task.task_state is distinct from p_outcome
       or v_task.reason_code is distinct from p_reason_code
       or v_task.last_claim_token is distinct from p_task_claim_token
       or p_successor_observation is not null then
      raise exception 'direct Checkout late-success terminal replay conflicts'
        using errcode = '22000';
    end if;
  else
    if v_task.task_state <> 'leased'
       or v_task.claim_token is distinct from p_task_claim_token
       or v_task.lease_expires_at <= pg_catalog.now()
       or v_task.prepared_action <> 'retrieve_then_expire'
       or v_task.prepared_current_operation_pk is distinct from v_current.id
       or v_task.prepared_current_session_id is null
       or v_task.prepared_current_session_id
          is distinct from v_current.provider_object_id
       or v_task.prepared_current_session_expires_at
          is distinct from v_current.checkout_session_expires_at
       or v_task.prepared_reason_code
          is distinct from 'successor_provider_expiration_required'
       or (
         (
           (
             p_outcome = 'manual_review'
             and p_reason_code = 'successor_contract_mismatch'
             and p_successor_observation is null
           )
           or public.direct_checkout_late_success_observation_is_valid(
             p_successor_observation,
             v_task.prepared_current_session_id
           )
         ) is not true
       ) then
      raise exception 'direct Checkout late-success provider observation is invalid'
        using errcode = '55000';
    end if;
    if p_outcome = 'successor_neutralized'
       and (
         p_reason_code <> 'successor_expired_unpaid'
         or p_successor_observation ->> 'session_status' <> 'expired'
         or p_successor_observation ->> 'payment_status' <> 'unpaid'
       ) then
      raise exception 'direct Checkout successor neutralization was not proven'
        using errcode = '22000';
    end if;
    if p_outcome = 'manual_review'
       and p_reason_code = 'successor_additional_paid_truth'
       and (
         p_successor_observation ->> 'session_status' <> 'complete'
         or p_successor_observation ->> 'payment_status' <> 'paid'
         or p_successor_observation ->> 'payment_intent_id' is null
       ) then
      raise exception 'direct Checkout additional paid truth was not proven'
        using errcode = '22000';
    end if;
    if p_successor_observation is not null then
      v_observation_sha256 := pg_catalog.encode(
        extensions.digest(
          pg_catalog.convert_to(p_successor_observation::text, 'UTF8'),
          'sha256'
        ),
        'hex'
      );
    end if;
    perform pg_catalog.set_config(
      'lgq.direct_checkout_late_success_task_id',
      v_task.id::text,
      true
    );
    update public.billing_direct_checkout_late_success_tasks t
       set task_state = p_outcome,
           claim_token = null,
           lease_expires_at = null,
           next_attempt_at = null,
           last_error_code = null,
           resolution_source = case
             when p_successor_observation is null then null
             else 'stripe_observation'
           end,
           successor_observation = p_successor_observation,
           successor_observation_sha256 = v_observation_sha256,
           reason_code = p_reason_code,
           neutralized_at = case
             when p_outcome = 'successor_neutralized' then pg_catalog.now()
             else null
           end,
           manual_reviewed_at = case
             when p_outcome = 'manual_review' then pg_catalog.now()
             else null
           end
     where t.id = v_task.id
    returning * into v_task;
    perform pg_catalog.set_config(
      'lgq.direct_checkout_late_success_task_id',
      '',
      true
    );
  end if;

  v_projection_result := case
    when v_task.reason_code in (
      'additional_paid_truth_operator_required',
      'successor_additional_paid_truth'
    ) then 'direct_payment_additional_paid_truth_manual_review'
    when v_task.task_state = 'successor_neutralized'
      then 'direct_payment_late_success_resolution_pending'
    else 'direct_payment_late_success_manual_review'
  end;
  update public.billing_events e
     set processing_status = 'processed',
         processed_at = pg_catalog.now(),
         next_attempt_at = null,
         last_error = null,
         projection_claim_token = null,
         projection_lease_expires_at = null,
         projection_schema_version = 'stripe_connected_payment_projection_v1',
         projection_applied = false,
         projection_result = v_projection_result
   where e.id = v_event.id;

  return query select
    'processed'::text,
    v_event.id,
    v_task.id,
    v_task.task_state,
    v_task.reason_code,
    false,
    v_projection_result;
end;
$$;

create function public.fail_stripe_connected_checkout_late_success_resolution(
  p_task_id uuid,
  p_task_claim_token uuid,
  p_billing_event_id uuid,
  p_event_claim_token uuid,
  p_error_code text,
  p_retryable boolean,
  p_next_attempt_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
set timezone to 'UTC'
as $$
declare
  v_task_hint public.billing_direct_checkout_late_success_tasks%rowtype;
  v_task public.billing_direct_checkout_late_success_tasks%rowtype;
  v_event public.billing_events%rowtype;
  v_payment public.payments%rowtype;
  v_will_retry boolean;
begin
  if p_task_id is null
     or p_task_claim_token is null
     or p_billing_event_id is null
     or p_event_claim_token is null
     or p_retryable is null
     or p_error_code not in (
       'provider_metadata_mismatch',
       'provider_mode_mismatch',
       'provider_object_retrieve_failed',
       'provider_object_contract_mismatch',
       'late_success_successor_retrieve_failed',
       'late_success_successor_expire_indeterminate',
       'projection_internal_error',
       'projection_retry_attempt_limit'
     )
     or (
       p_retryable
       and (
         p_next_attempt_at is null
         or p_next_attempt_at <= pg_catalog.now()
         or p_next_attempt_at > pg_catalog.now() + interval '25 hours'
       )
     )
     or (not p_retryable and p_next_attempt_at is not null) then
    raise exception 'direct Checkout late-success failure input is invalid'
      using errcode = '22023';
  end if;

  select t.* into v_task_hint
    from public.billing_direct_checkout_late_success_tasks t
   where t.id = p_task_id;
  if not found then
    raise exception 'direct Checkout late-success task was not found'
      using errcode = 'P0002';
  end if;
  select e.* into v_event
    from public.billing_events e
   where e.id = p_billing_event_id
   for update;
  perform 1
    from public.accounts a
   where a.id = v_task_hint.account_id
   for key share;
  select p.* into v_payment
    from public.payments p
   where p.id = v_task_hint.payment_id
     and p.account_id = v_task_hint.account_id
   for update;
  perform 1
    from public.billing_payment_operations locked_operation
   where locked_operation.payment_id = v_task_hint.payment_id
     and locked_operation.operation_type = 'checkout_session.create'
   order by locked_operation.checkout_generation, locked_operation.id
   for update;
  select t.* into v_task
    from public.billing_direct_checkout_late_success_tasks t
   where t.id = p_task_id
   for update;

  if v_event.id is null
     or v_event.id is distinct from v_task.billing_event_id
     or v_event.processing_status <> 'processing'
     or v_event.projection_claim_token is distinct from p_event_claim_token
     or v_task.task_state <> 'leased'
     or v_task.claim_token is distinct from p_task_claim_token
     or v_payment.id is null
     or v_payment.late_checkout_success_task_pk is null then
    raise exception 'direct Checkout late-success failure claim changed'
      using errcode = '55000';
  end if;

  v_will_retry := p_retryable and v_task.attempt_count < 8;
  perform pg_catalog.set_config(
    'lgq.direct_checkout_late_success_task_id',
    v_task.id::text,
    true
  );
  update public.billing_direct_checkout_late_success_tasks t
     set task_state = case when v_will_retry then 'retry_wait' else 'manual_review' end,
         claim_token = null,
         lease_expires_at = null,
         next_attempt_at = case when v_will_retry then p_next_attempt_at else null end,
         last_error_code = p_error_code,
         reason_code = case when v_will_retry then null else p_error_code end,
         manual_reviewed_at = case
           when v_will_retry then null
           else pg_catalog.now()
         end
   where t.id = v_task.id;
  perform pg_catalog.set_config(
    'lgq.direct_checkout_late_success_task_id',
    '',
    true
  );

  update public.billing_events e
     set processing_status = 'failed',
         processed_at = null,
         next_attempt_at = case when v_will_retry then p_next_attempt_at else null end,
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

create function public.confirm_one_off_direct_checkout_presentation(
  p_operation_pk uuid,
  p_checkout_session_id text
)
returns boolean
language plpgsql
security definer
set search_path = ''
set timezone to 'UTC'
as $$
declare
  v_hint public.billing_payment_operations%rowtype;
  v_payment public.payments%rowtype;
  v_operation public.billing_payment_operations%rowtype;
begin
  if p_operation_pk is null
     or p_checkout_session_id !~ '^cs_(test|live)_[A-Za-z0-9_]+$'
     or pg_catalog.length(p_checkout_session_id) > 255 then
    raise exception 'direct Checkout presentation input is invalid'
      using errcode = '22023';
  end if;
  select o.* into v_hint
    from public.billing_payment_operations o
   where o.id = p_operation_pk;
  if not found or v_hint.operation_type <> 'checkout_session.create' then
    raise exception 'direct Checkout presentation operation was not found'
      using errcode = 'P0002';
  end if;
  perform 1
    from public.accounts a
   where a.id = v_hint.account_id
     and a.stripe_merchant_account_id = v_hint.stripe_account_id
     and a.merchant_livemode = v_hint.livemode
   for key share;
  if not found then
    raise exception 'direct Checkout presentation Merchant scope changed'
      using errcode = '55000';
  end if;
  select p.* into v_payment
    from public.payments p
   where p.id = v_hint.payment_id
     and p.account_id = v_hint.account_id
   for update;
  if not found then
    raise exception 'direct Checkout presentation payment was not found'
      using errcode = 'P0002';
  end if;
  perform 1
    from public.billing_payment_operations locked_operation
   where locked_operation.payment_id = v_payment.id
     and locked_operation.operation_type = 'checkout_session.create'
   order by locked_operation.checkout_generation, locked_operation.id
   for update;
  select o.* into v_operation
    from public.billing_payment_operations o
   where o.id = p_operation_pk
     and o.payment_id = v_payment.id
     and o.account_id = v_payment.account_id;
  if v_operation.id is null
     or v_operation.state <> 'succeeded'
     or v_operation.checkout_lifecycle <> 'open'
     or v_operation.provider_object_id is distinct from p_checkout_session_id
     or v_payment.current_checkout_operation_pk is distinct from v_operation.id
     or v_payment.stripe_checkout_session is distinct from p_checkout_session_id
     or v_payment.charge_model <> 'direct'
     or v_payment.status::text <> 'processing' then
    raise exception 'direct Checkout presentation is not the exact current open Session'
      using errcode = '55000';
  end if;
  if v_payment.late_checkout_success_task_pk is not null then
    return false;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    public.stripe_connected_checkout_session_mutex_key(
      v_payment.account_id,
      v_payment.stripe_account_id,
      v_payment.stripe_livemode,
      p_checkout_session_id
    )
  );
  if exists (
    select 1
      from public.billing_events success_event
      join public.billing_payment_operations predecessor
        on predecessor.payment_id = v_payment.id
       and predecessor.account_id = v_payment.account_id
       and predecessor.operation_type = 'checkout_session.create'
       and predecessor.provider_object_id =
         success_event.payload #>> '{data_object,id}'
       and predecessor.checkout_generation < v_operation.checkout_generation
     where success_event.provider = 'stripe'
       and success_event.event_scope = 'connected_payment'
       and success_event.account_id = v_payment.account_id
       and success_event.provider_account_id = v_payment.stripe_account_id
       and success_event.livemode = v_payment.stripe_livemode
       and success_event.event_type in (
         'checkout.session.completed',
         'checkout.session.async_payment_succeeded'
       )
       and success_event.payload #>> '{data_object,object}' = 'checkout.session'
  ) then
    return false;
  end if;
  return true;
end;
$$;

-- Patch every generation boundary with an exact source contract. The
-- migration aborts if an installed function has drifted, rather than silently
-- leaving a URL or provider-mutation path outside the payment hold.
do $$
declare
  v_before text;
  v_after text;
  v_old text := $needle$
     or v_payment.current_checkout_operation_pk is null
     or v_payment.paid_at is not null$needle$;
  v_new text := $replacement$
     or v_payment.current_checkout_operation_pk is null
     or v_payment.late_checkout_success_task_pk is not null
     or v_payment.paid_at is not null$replacement$;
begin
  v_before := pg_catalog.pg_get_functiondef(
    'public.prepare_one_off_direct_invoice_payment(uuid,uuid,uuid,uuid)'
      ::pg_catalog.regprocedure
  );
  if pg_catalog.length(v_before)
       - pg_catalog.length(pg_catalog.replace(v_before, v_old, ''))
       is distinct from pg_catalog.length(v_old) then
    raise exception 'direct Checkout prepare hold source contract drifted'
      using errcode = '55000';
  end if;
  v_after := pg_catalog.replace(v_before, v_old, v_new);
  execute v_after;
end
$$;

do $$
declare
  v_before text;
  v_after text;
  v_old text := $needle$
  if old.charge_model is distinct from 'direct'
     or new.charge_model is distinct from 'direct'
     or old.status::text is distinct from 'processing'$needle$;
  v_new text := $replacement$
  if old.charge_model is distinct from 'direct'
     or new.charge_model is distinct from 'direct'
     or new.late_checkout_success_task_pk is not null
     or old.status::text is distinct from 'processing'$replacement$;
begin
  v_before := pg_catalog.pg_get_functiondef(
    'public.enqueue_one_off_direct_payment_settlement()'::pg_catalog.regprocedure
  );
  if pg_catalog.length(v_before)
       - pg_catalog.length(pg_catalog.replace(v_before, v_old, ''))
       is distinct from pg_catalog.length(v_old) then
    raise exception 'direct settlement enqueue hold source contract drifted'
      using errcode = '55000';
  end if;
  v_after := pg_catalog.replace(v_before, v_old, v_new);
  execute v_after;
end
$$;

do $$
declare
  v_before text;
  v_after text;
  v_old text := $needle$
      end if;
    end if;

    if v_task.attempt_count >= 8 then
      update public.billing_direct_payment_settlement_tasks t$needle$;
  v_new text := $replacement$
      end if;
    end if;

    if exists (
      select 1
        from public.payments held_payment
       where held_payment.id = v_task.payment_id
         and held_payment.account_id = v_task.account_id
         and held_payment.late_checkout_success_task_pk is not null
    ) then
      update public.billing_direct_payment_settlement_tasks t
         set task_state = 'dead_letter',
             claim_token = null,
             lease_expires_at = null,
             next_attempt_at = null,
             last_error_code = 'late_success_payment_hold',
             dead_lettered_at = v_now,
             updated_at = v_now
       where t.id = v_task.id;
      continue;
    end if;

    if v_task.attempt_count >= 8 then
      update public.billing_direct_payment_settlement_tasks t$replacement$;
begin
  v_before := pg_catalog.pg_get_functiondef(
    'public.claim_direct_payment_settlement_tasks(integer)'::pg_catalog.regprocedure
  );
  if pg_catalog.length(v_before)
       - pg_catalog.length(pg_catalog.replace(v_before, v_old, ''))
       is distinct from pg_catalog.length(v_old) then
    raise exception 'direct settlement claim hold source contract drifted'
      using errcode = '55000';
  end if;
  v_after := pg_catalog.replace(v_before, v_old, v_new);
  execute v_after;
end
$$;

do $$
declare
  v_before text;
  v_after text;
  v_old text := $needle$
     or v_payment.charge_model <> 'direct'
     or v_payment.status::text <> 'paid'$needle$;
  v_new text := $replacement$
     or v_payment.charge_model <> 'direct'
     or v_payment.late_checkout_success_task_pk is not null
     or v_payment.status::text <> 'paid'$replacement$;
begin
  v_before := pg_catalog.pg_get_functiondef(
    'public.record_direct_payment_settlement_feed(uuid,uuid)'
      ::pg_catalog.regprocedure
  );
  if pg_catalog.length(v_before)
       - pg_catalog.length(pg_catalog.replace(v_before, v_old, ''))
       is distinct from pg_catalog.length(v_old) then
    raise exception 'direct settlement feed hold source contract drifted'
      using errcode = '55000';
  end if;
  v_after := pg_catalog.replace(v_before, v_old, v_new);
  execute v_after;
end
$$;

do $$
declare
  v_before text;
  v_after text;
  v_old text := $needle$
  v_sms_exists := found;
  if v_sms_exists then$needle$;
  v_new text := $replacement$
  v_sms_exists := found;
  if v_payment.late_checkout_success_task_pk is not null
     and not v_sms_exists then
    raise exception 'direct settlement SMS is blocked by late payment truth'
      using errcode = '55000';
  end if;
  if v_sms_exists then$replacement$;
begin
  v_before := pg_catalog.pg_get_functiondef(
    'public.stage_direct_payment_settlement_sms(uuid,uuid,text,text)'
      ::pg_catalog.regprocedure
  );
  if pg_catalog.length(v_before)
       - pg_catalog.length(pg_catalog.replace(v_before, v_old, ''))
       is distinct from pg_catalog.length(v_old) then
    raise exception 'direct settlement SMS hold source contract drifted'
      using errcode = '55000';
  end if;
  v_after := pg_catalog.replace(v_before, v_old, v_new);
  execute v_after;
end
$$;

do $$
declare
  v_before text;
  v_after text;
  v_old text := $needle$
     or v_payment.charge_model <> 'direct'
     or v_payment.stripe_account_id is distinct from p_stripe_account_id$needle$;
  v_new text := $replacement$
     or v_payment.charge_model <> 'direct'
     or v_payment.late_checkout_success_task_pk is not null
     or v_payment.stripe_account_id is distinct from p_stripe_account_id$replacement$;
begin
  v_before := pg_catalog.pg_get_functiondef(
    'public.compute_direct_charge_refund_plan(uuid,uuid,text,boolean,uuid,text)'
      ::pg_catalog.regprocedure
  );
  if pg_catalog.length(v_before)
       - pg_catalog.length(pg_catalog.replace(v_before, v_old, ''))
       is distinct from pg_catalog.length(v_old) then
    raise exception 'direct refund plan hold source contract drifted'
      using errcode = '55000';
  end if;
  v_after := pg_catalog.replace(v_before, v_old, v_new);
  execute v_after;
end
$$;

do $$
declare
  v_before text;
  v_after text;
  v_old text := $needle$
   where p.id = p_payment_id
     and p.account_id = p_account_id
   for update;$needle$;
  v_new text := $replacement$
   where p.id = p_payment_id
     and p.account_id = p_account_id
     and p.late_checkout_success_task_pk is null
   for update;$replacement$;
begin
  v_before := pg_catalog.pg_get_functiondef(
    'public.claim_direct_charge_refund_operation(uuid,uuid,text,boolean,uuid,text,text,bigint,bigint,bigint,bigint,text,text,text,text,text,text,text)'
      ::pg_catalog.regprocedure
  );
  if pg_catalog.length(v_before)
       - pg_catalog.length(pg_catalog.replace(v_before, v_old, ''))
       is distinct from pg_catalog.length(v_old) then
    raise exception 'direct refund claim hold source contract drifted'
      using errcode = '55000';
  end if;
  v_after := pg_catalog.replace(v_before, v_old, v_new);
  execute v_after;
end
$$;

do $$
declare
  v_before text;
  v_after text;
  v_old text := $needle$
     or v_payment.charge_model <> 'direct'
     or v_payment.stripe_account_id is distinct from v_operation.stripe_account_id$needle$;
  v_new text := $replacement$
     or v_payment.charge_model <> 'direct'
     or v_payment.late_checkout_success_task_pk is not null
     or v_payment.stripe_account_id is distinct from v_operation.stripe_account_id$replacement$;
begin
  v_before := pg_catalog.pg_get_functiondef(
    'public.begin_direct_charge_refund_submission(uuid,uuid)'
      ::pg_catalog.regprocedure
  );
  if pg_catalog.length(v_before)
       - pg_catalog.length(pg_catalog.replace(v_before, v_old, ''))
       is distinct from pg_catalog.length(v_old) then
    raise exception 'direct refund begin hold source contract drifted'
      using errcode = '55000';
  end if;
  v_after := pg_catalog.replace(v_before, v_old, v_new);
  execute v_after;
end
$$;

do $$
declare
  v_before text;
  v_after text;
  v_old text := $needle$
  if not found then
    raise exception 'direct Checkout payment was not found in the requested account'
      using errcode = 'P0002';
  end if;

  perform 1
    from public.billing_payment_operations locked_attempt$needle$;
  v_new text := $replacement$
  if not found then
    raise exception 'direct Checkout payment was not found in the requested account'
      using errcode = 'P0002';
  end if;
  if v_payment.late_checkout_success_task_pk is not null then
    raise exception 'direct Checkout is blocked by verified late payment truth'
      using errcode = '55000';
  end if;

  perform 1
    from public.billing_payment_operations locked_attempt$replacement$;
begin
  v_before := pg_catalog.pg_get_functiondef(
    'public.claim_one_off_direct_checkout_operation(uuid,uuid,text,boolean,integer,uuid,text,text,text,bigint,bigint,bigint,text,text,integer,numeric)'
      ::pg_catalog.regprocedure
  );
  if pg_catalog.length(v_before)
       - pg_catalog.length(pg_catalog.replace(v_before, v_old, ''))
       is distinct from pg_catalog.length(v_old) then
    raise exception 'direct Checkout claim hold source contract drifted'
      using errcode = '55000';
  end if;
  v_after := pg_catalog.replace(v_before, v_old, v_new);
  execute v_after;
end
$$;

do $$
declare
  v_before text;
  v_after text;
  v_old text := $needle$
     or v_payment.charge_model <> 'direct'
     or v_payment.stripe_account_id is distinct from v_operation.stripe_account_id$needle$;
  v_new text := $replacement$
     or v_payment.charge_model <> 'direct'
     or v_payment.late_checkout_success_task_pk is not null
     or v_payment.stripe_account_id is distinct from v_operation.stripe_account_id$replacement$;
begin
  v_before := pg_catalog.pg_get_functiondef(
    'public.begin_one_off_direct_checkout_submission(uuid,uuid)'
      ::pg_catalog.regprocedure
  );
  if pg_catalog.length(v_before)
       - pg_catalog.length(pg_catalog.replace(v_before, v_old, ''))
       is distinct from pg_catalog.length(v_old) then
    raise exception 'direct Checkout begin hold source contract drifted'
      using errcode = '55000';
  end if;
  v_after := pg_catalog.replace(v_before, v_old, v_new);
  execute v_after;
end
$$;

do $$
declare
  v_before text;
  v_after text;
  v_old text := $needle$
  return true;
end;$needle$;
  v_new text := $replacement$
  -- A create that started before the hold must still bind its exact Session,
  -- but the caller receives false and must withhold the URL.
  return v_payment.late_checkout_success_task_pk is null;
end;$replacement$;
begin
  v_before := pg_catalog.pg_get_functiondef(
    'public.complete_one_off_direct_checkout_operation(uuid,uuid,text,timestamptz)'
      ::pg_catalog.regprocedure
  );
  if pg_catalog.length(v_before)
       - pg_catalog.length(pg_catalog.replace(v_before, v_old, ''))
       is distinct from pg_catalog.length(v_old) then
    raise exception 'direct Checkout completion decision source contract drifted'
      using errcode = '55000';
  end if;
  v_after := pg_catalog.replace(v_before, v_old, v_new);
  execute v_after;
end
$$;

do $$
declare
  v_before text;
  v_after text;
  v_old text := $needle$
     or v_payment.charge_model <> 'direct'
     or v_payment.stripe_account_id is distinct from v_event.provider_account_id$needle$;
  v_new text := $replacement$
     or v_payment.charge_model <> 'direct'
     or v_payment.late_checkout_success_task_pk is not null
     or v_payment.stripe_account_id is distinct from v_event.provider_account_id$replacement$;
begin
  v_before := pg_catalog.pg_get_functiondef(
    'public.resolve_stripe_connected_payment_projection_binding(uuid,uuid,uuid,uuid,text)'
      ::pg_catalog.regprocedure
  );
  if pg_catalog.length(v_before)
       - pg_catalog.length(pg_catalog.replace(v_before, v_old, ''))
       is distinct from pg_catalog.length(v_old) then
    raise exception 'connected payment binding hold source contract drifted'
      using errcode = '55000';
  end if;
  v_after := pg_catalog.replace(v_before, v_old, v_new);
  execute v_after;
end
$$;

do $$
declare
  v_before text;
  v_after text;
  v_old text := $needle$
     or v_payment.charge_model <> 'direct'
     or v_payment.stripe_account_id is distinct from v_event.provider_account_id$needle$;
  v_new text := $replacement$
     or v_payment.charge_model <> 'direct'
     or v_payment.late_checkout_success_task_pk is not null
     or v_payment.stripe_account_id is distinct from v_event.provider_account_id$replacement$;
begin
  v_before := pg_catalog.pg_get_functiondef(
    'public.project_stripe_connected_payment_event(uuid,uuid,jsonb)'
      ::pg_catalog.regprocedure
  );
  if pg_catalog.length(v_before)
       - pg_catalog.length(pg_catalog.replace(v_before, v_old, ''))
       is distinct from pg_catalog.length(v_old) then
    raise exception 'connected payment projector hold source contract drifted'
      using errcode = '55000';
  end if;
  v_after := pg_catalog.replace(v_before, v_old, v_new);
  execute v_after;
end
$$;

do $$
declare
  v_before text;
  v_after text;
  v_old text := $needle$
  if v_payment.id is null
     or v_payment.refunded_amount is distinct from v_detail.cumulative_gross_before_cents::numeric / 100$needle$;
  v_new text := $replacement$
  if v_payment.id is null
     or v_payment.late_checkout_success_task_pk is not null
     or v_payment.refunded_amount is distinct from v_detail.cumulative_gross_before_cents::numeric / 100$replacement$;
begin
  v_before := pg_catalog.pg_get_functiondef(
    'public.begin_direct_application_fee_refund_submission(uuid,uuid)'
      ::pg_catalog.regprocedure
  );
  if pg_catalog.length(v_before)
       - pg_catalog.length(pg_catalog.replace(v_before, v_old, ''))
       is distinct from pg_catalog.length(v_old) then
    raise exception 'direct Application Fee Refund begin hold source contract drifted'
      using errcode = '55000';
  end if;
  v_after := pg_catalog.replace(v_before, v_old, v_new);
  execute v_after;
end
$$;

-- The connected-payment selector owns the durable eight-attempt cap. If its
-- final lease expires after a late-success task was established, terminalize
-- that task in the same transaction as the inbox event. Otherwise the event
-- would become unclaimable while the task remained leased forever and an
-- already-disclosed successor could lose its automatic neutralization owner.
do $$
declare
  v_before text;
  v_after text;
  v_old text := $needle$
  if v_event.attempt_count >= 8 then
    update public.billing_events e$needle$;
  v_new text := $replacement$
  if v_event.attempt_count >= 8 then
    declare
      v_late_task_hint public.billing_direct_checkout_late_success_tasks%rowtype;
      v_late_task public.billing_direct_checkout_late_success_tasks%rowtype;
      v_late_payment public.payments%rowtype;
    begin
      select t.* into v_late_task_hint
        from public.billing_direct_checkout_late_success_tasks t
       where t.billing_event_id = v_event.id;
      if found then
        perform 1
          from public.accounts a
         where a.id = v_late_task_hint.account_id
           and a.stripe_merchant_account_id = v_late_task_hint.stripe_account_id
           and a.merchant_livemode = v_late_task_hint.livemode
         for key share;
        if not found then
          raise exception 'direct Checkout late-success attempt-cap Merchant scope changed'
            using errcode = '55000';
        end if;

        select p.* into v_late_payment
          from public.payments p
         where p.id = v_late_task_hint.payment_id
           and p.account_id = v_late_task_hint.account_id
         for update;
        if not found
           or v_late_payment.late_checkout_success_task_pk is null then
          raise exception 'direct Checkout late-success attempt-cap hold changed'
            using errcode = '55000';
        end if;

        perform 1
          from public.billing_payment_operations locked_operation
         where locked_operation.payment_id = v_late_payment.id
           and locked_operation.operation_type = 'checkout_session.create'
         order by locked_operation.checkout_generation, locked_operation.id
         for update;

        select t.* into v_late_task
          from public.billing_direct_checkout_late_success_tasks t
         where t.id = v_late_task_hint.id
           and t.billing_event_id = v_event.id
         for update;
        if not found then
          raise exception 'direct Checkout late-success attempt-cap task changed'
            using errcode = '55000';
        end if;

        if v_late_task.task_state in ('ready', 'leased', 'retry_wait') then
          perform pg_catalog.set_config(
            'lgq.direct_checkout_late_success_task_id',
            v_late_task.id::text,
            true
          );
          update public.billing_direct_checkout_late_success_tasks t
             set task_state = 'manual_review',
                 claim_token = null,
                 lease_expires_at = null,
                 next_attempt_at = null,
                 last_error_code = 'projection_retry_attempt_limit',
                 reason_code = 'projection_retry_attempt_limit',
                 neutralized_at = null,
                 manual_reviewed_at = pg_catalog.now(),
                 updated_at = pg_catalog.now()
           where t.id = v_late_task.id;
          perform pg_catalog.set_config(
            'lgq.direct_checkout_late_success_task_id',
            '',
            true
          );
        end if;
      end if;
    end;

    update public.billing_events e$replacement$;
begin
  v_before := pg_catalog.pg_get_functiondef(
    'public.claim_next_due_stripe_connected_payment_event()'
      ::pg_catalog.regprocedure
  );
  if pg_catalog.length(v_before)
       - pg_catalog.length(pg_catalog.replace(v_before, v_old, ''))
       is distinct from pg_catalog.length(v_old) then
    raise exception 'connected payment attempt-cap task source contract drifted'
      using errcode = '55000';
  end if;
  v_after := pg_catalog.replace(v_before, v_old, v_new);
  execute v_after;
end
$$;

-- The staff readiness page needs to distinguish an active hard hold from a
-- completed neutralization or a case awaiting operator review. Keep the task
-- table outside the Data API and expose only exact, bounded aggregates. Every
-- terminal reason is classified through a closed allowlist before it crosses
-- the SECURITY DEFINER boundary.
create function public.admin_billing_direct_checkout_late_success_summary()
returns table (
  total_count bigint,
  held_payment_count bigint,
  worker_open_count bigint,
  successor_neutralized_count bigint,
  manual_review_count bigint,
  evidence_count bigint,
  oldest_held_at timestamptz,
  fixed_reason_code text,
  fixed_reason_code_count bigint,
  fixed_reason_codes_truncated boolean
)
language sql
stable
security definer
set search_path = ''
as $function$
  with task_groups as materialized (
    select
      classified.task_state,
      classified.is_primary_hold,
      classified.has_paid_evidence,
      classified.fixed_reason_code,
      pg_catalog.count(*) as task_count,
      pg_catalog.min(classified.created_at) as oldest_created_at
    from (
      select
        task.task_state,
        task.created_at,
        payment.id is not null as is_primary_hold,
        task.late_success_projection is not null as has_paid_evidence,
        case
          when task.task_state not in ('successor_neutralized', 'manual_review')
            then null::pg_catalog.text
          when task.reason_code in (
            'successor_never_submitted',
            'successor_signed_expired_unpaid',
            'successor_expired_unpaid',
            'late_paid_truth_without_successor',
            'additional_paid_truth_operator_required',
            'successor_additional_paid_truth',
            'successor_unexpireable_state',
            'successor_contract_mismatch',
            'successor_provider_state_indeterminate',
            'provider_metadata_mismatch',
            'provider_mode_mismatch',
            'provider_object_retrieve_failed',
            'provider_object_contract_mismatch',
            'late_success_successor_retrieve_failed',
            'late_success_successor_expire_indeterminate',
            'projection_internal_error',
            'projection_retry_attempt_limit'
          ) then task.reason_code
          else 'unrecognized_error_code'::pg_catalog.text
        end as fixed_reason_code
      from public.billing_direct_checkout_late_success_tasks as task
      left join public.payments as payment
        on payment.id = task.payment_id
       and payment.account_id = task.account_id
       and payment.late_checkout_success_task_pk = task.id
    ) as classified
    group by
      classified.task_state,
      classified.is_primary_hold,
      classified.has_paid_evidence,
      classified.fixed_reason_code
  ),
  task_summary as (
    select
      coalesce(pg_catalog.sum(groups.task_count), 0::pg_catalog.numeric)::pg_catalog.int8
        as total_count,
      coalesce(
        pg_catalog.sum(groups.task_count) filter (
          where groups.is_primary_hold
        ),
        0::pg_catalog.numeric
      )::pg_catalog.int8 as held_payment_count,
      coalesce(
        pg_catalog.sum(groups.task_count) filter (
          where groups.task_state in ('ready', 'leased', 'retry_wait')
        ),
        0::pg_catalog.numeric
      )::pg_catalog.int8 as worker_open_count,
      coalesce(
        pg_catalog.sum(groups.task_count) filter (
          where groups.task_state = 'successor_neutralized'
        ),
        0::pg_catalog.numeric
      )::pg_catalog.int8 as successor_neutralized_count,
      coalesce(
        pg_catalog.sum(groups.task_count) filter (
          where groups.task_state = 'manual_review'
        ),
        0::pg_catalog.numeric
      )::pg_catalog.int8 as manual_review_count,
      coalesce(
        pg_catalog.sum(groups.task_count) filter (
          where groups.has_paid_evidence
        ),
        0::pg_catalog.numeric
      )::pg_catalog.int8 as evidence_count,
      pg_catalog.min(groups.oldest_created_at) filter (
        where groups.is_primary_hold
      ) as oldest_held_at
    from task_groups as groups
  ),
  fixed_reason_codes as (
    select
      groups.fixed_reason_code,
      pg_catalog.sum(groups.task_count)::pg_catalog.int8
        as fixed_reason_code_count
    from task_groups as groups
    where groups.task_state in ('successor_neutralized', 'manual_review')
    group by groups.fixed_reason_code
  )
  select
    summary.total_count,
    summary.held_payment_count,
    summary.worker_open_count,
    summary.successor_neutralized_count,
    summary.manual_review_count,
    summary.evidence_count,
    summary.oldest_held_at,
    codes.fixed_reason_code,
    coalesce(codes.fixed_reason_code_count, 0::pg_catalog.int8),
    false as fixed_reason_codes_truncated
  from task_summary as summary
  left join fixed_reason_codes as codes on true
  order by
    codes.fixed_reason_code_count desc nulls last,
    codes.fixed_reason_code asc nulls last;
$function$;

-- The task ledger is not a Data API surface. All reads/writes use bounded
-- service-only RPCs; trigger helpers and validators are non-callable.
revoke all on table public.billing_direct_checkout_late_success_tasks
  from public, anon, authenticated, service_role;

revoke all on function public.direct_checkout_late_success_projection_is_valid(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.direct_checkout_late_success_observation_is_valid(jsonb, text)
  from public, anon, authenticated, service_role;
revoke all on function public.protect_direct_checkout_late_success_task()
  from public, anon, authenticated, service_role;
revoke all on function public.protect_payment_late_checkout_success_hold()
  from public, anon, authenticated, service_role;

revoke all on function public.plan_stripe_connected_payment_projection(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.prepare_stripe_connected_checkout_late_success_resolution(
  uuid, uuid, uuid, uuid, jsonb
) from public, anon, authenticated, service_role;
revoke all on function public.finalize_stripe_connected_checkout_late_success_resolution(
  uuid, uuid, uuid, uuid, text, text, jsonb
) from public, anon, authenticated, service_role;
revoke all on function public.fail_stripe_connected_checkout_late_success_resolution(
  uuid, uuid, uuid, uuid, text, boolean, timestamptz
) from public, anon, authenticated, service_role;
revoke all on function public.confirm_one_off_direct_checkout_presentation(uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.admin_billing_direct_checkout_late_success_summary()
  from public, anon, authenticated, service_role;

grant execute on function public.plan_stripe_connected_payment_projection(uuid, uuid)
  to service_role;
grant execute on function public.prepare_stripe_connected_checkout_late_success_resolution(
  uuid, uuid, uuid, uuid, jsonb
) to service_role;
grant execute on function public.finalize_stripe_connected_checkout_late_success_resolution(
  uuid, uuid, uuid, uuid, text, text, jsonb
) to service_role;
grant execute on function public.fail_stripe_connected_checkout_late_success_resolution(
  uuid, uuid, uuid, uuid, text, boolean, timestamptz
) to service_role;
grant execute on function public.confirm_one_off_direct_checkout_presentation(uuid, text)
  to service_role;
grant execute on function public.admin_billing_direct_checkout_late_success_summary()
  to service_role;

comment on table public.billing_direct_checkout_late_success_tasks is
  'Service-only durable conflicts for signed paid truth on an expired/direct Checkout generation. Rows never expose a Checkout URL and remain operator-blocking after terminal classification.';
comment on column public.payments.late_checkout_success_task_pk is
  'Write-once hard hold. While non-null, direct Checkout presentation/new provider mutation, normal settlement, and new refund submission must fail closed.';
comment on function public.plan_stripe_connected_payment_projection(uuid, uuid) is
  'Classifies a claimed connected-payment event before Stripe reads and atomically establishes the late-success task/payment hold when it is not the unheld exact current generation.';
comment on function public.confirm_one_off_direct_checkout_presentation(uuid, text) is
  'Last locking gate before returning an exact direct Checkout URL; false means the Session must remain undisclosed and be expired/reconciled.';
comment on function public.admin_billing_direct_checkout_late_success_summary() is
  'Read-only exact aggregate for staff visibility into direct Checkout late-success holds; returns no record or provider identifiers.';

commit;
