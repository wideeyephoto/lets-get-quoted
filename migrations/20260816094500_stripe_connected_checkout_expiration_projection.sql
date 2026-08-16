-- DARK connected-account Checkout expiration projection.
--
-- This migration adds no route, scheduler, flag, provider mutation, or active
-- caller. It records only a signed `checkout.session.expired` observation for
-- the one-off Merchant-direct card rail. An expired Session does not release
-- the invoice, replace the Session, or turn the payment into a failed payment.

begin;

-- Runtime payment projection owns payment before billing-event truth. Acquire
-- migration table locks in that same order before installing the reciprocal
-- payment/event triggers below.
lock table public.payments in share row exclusive mode;
lock table public.billing_events in share row exclusive mode;
do $$
begin
  if exists (
    select 1
      from public.billing_events e
     where e.event_scope = 'connected_payment'
       and e.event_type = 'checkout.session.expired'
       and e.processing_status <> 'received'
  ) then
    raise exception 'connected Checkout expiration inbox contains pre-projector processing history'
      using errcode = '55000';
  end if;
end
$$;

-- Extend the shared event terminal contract without changing the existing
-- subscription or connected-payment success projector semantics.
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
      'direct_checkout_expired'
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
                'direct_payment_paid_reconciled'
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

create table public.stripe_connected_checkout_expirations (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  billing_event_id uuid not null unique
    references public.billing_events(id) on update restrict on delete restrict,
  account_id uuid not null,
  payment_id uuid not null,
  operation_pk uuid not null unique,
  operation_id text not null check (
    pg_catalog.length(pg_catalog.btrim(operation_id)) between 1 and 200
    and operation_id !~ '[[:cntrl:]]'
  ),
  charge_model text not null default 'direct' check (charge_model = 'direct'),
  stripe_account_id text not null check (stripe_account_id ~ '^acct_[A-Za-z0-9]{8,}$'),
  livemode boolean not null,
  provider_event_id text not null unique check (provider_event_id ~ '^evt_[A-Za-z0-9_]{8,}$'),
  checkout_session_id text not null check (checkout_session_id ~ '^cs_[A-Za-z0-9_]+$'),
  provider_created_at timestamptz not null,
  session_expires_at timestamptz not null,
  observed_mode text not null check (observed_mode = 'payment'),
  observed_session_status text not null check (observed_session_status = 'expired'),
  observed_payment_status text not null check (observed_payment_status = 'unpaid'),
  observed_currency text not null check (observed_currency = 'usd'),
  observed_amount_cents bigint not null check (observed_amount_cents between 1 and 99999999),
  observed_payment_method_types text[] not null check (
    observed_payment_method_types = array['card']::text[]
  ),
  observed_recovered_from text check (observed_recovered_from is null),
  observed_payment_intent_id text check (observed_payment_intent_id is null),
  fee_plan_code text not null check (fee_plan_code in ('flex', 'solo', 'growth', 'scale', 'enterprise')),
  fee_catalog_version text not null check (
    pg_catalog.length(pg_catalog.btrim(fee_catalog_version)) between 1 and 100
  ),
  fee_rate_bps integer not null check (fee_rate_bps between 0 and 10000),
  fee_basis_amount_cents bigint not null check (
    fee_basis_amount_cents between 0 and observed_amount_cents
  ),
  application_fee_cents bigint not null check (
    application_fee_cents between 0 and fee_basis_amount_cents
  ),
  recorded_at timestamptz not null default pg_catalog.now(),
  constraint stripe_connected_checkout_expiration_time_check check (
    session_expires_at > '2000-01-01 00:00:00+00'::timestamptz
    and provider_created_at >= session_expires_at
  ),
  constraint stripe_connected_checkout_expiration_session_unique
    unique (stripe_account_id, livemode, checkout_session_id),
  constraint stripe_connected_checkout_expiration_payment_fk
    foreign key (payment_id, account_id, stripe_account_id, livemode, charge_model)
    references public.payments(id, account_id, stripe_account_id, stripe_livemode, charge_model)
    on update restrict on delete restrict,
  constraint stripe_connected_checkout_expiration_operation_fk
    foreign key (operation_pk, account_id, payment_id, stripe_account_id, livemode, charge_model)
    references public.billing_payment_operations(
      id, account_id, payment_id, stripe_account_id, livemode, charge_model
    ) on update restrict on delete restrict
);

alter table public.stripe_connected_checkout_expirations enable row level security;
alter table public.stripe_connected_checkout_expirations force row level security;

create or replace function public.protect_stripe_connected_checkout_expiration()
returns trigger
language plpgsql
set search_path = ''
set timezone to 'UTC'
as $$
begin
  raise exception 'connected Checkout expiration evidence is immutable'
    using errcode = '22000';
end;
$$;

create trigger protect_stripe_connected_checkout_expiration_update_delete
before update or delete on public.stripe_connected_checkout_expirations
for each row execute function public.protect_stripe_connected_checkout_expiration();

revoke all on function public.protect_stripe_connected_checkout_expiration()
  from public, anon, authenticated, service_role;

revoke all on table public.stripe_connected_checkout_expirations
  from public, anon, authenticated, service_role;
grant select on table public.stripe_connected_checkout_expirations to service_role;

-- Every signed success/expiration receipt and every processing-to-paid payment
-- transition for one connected Checkout Session shares this transaction lock.
-- The key contains the full workspace + Merchant + mode + Session identity;
-- a different Session therefore remains independently processable. Hash
-- collisions can only over-serialize work and cannot weaken correctness.
create function public.stripe_connected_checkout_session_mutex_key(
  p_account_id uuid,
  p_stripe_account_id text,
  p_livemode boolean,
  p_checkout_session_id text
)
returns bigint
language sql
immutable
strict
parallel safe
set search_path = ''
set timezone to 'UTC'
as $$
  select pg_catalog.hashtextextended(
    'lgq:stripe:connected-checkout-session:v1:'
      || p_account_id::text || ':'
      || p_stripe_account_id || ':'
      || case when p_livemode then 'live' else 'test' end || ':'
      || p_checkout_session_id,
    0
  )
$$;

create function public.serialize_stripe_connected_checkout_event_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
set timezone to 'UTC'
as $$
declare
  v_checkout_session_id text;
begin
  if new.provider = 'stripe'
     and new.event_scope = 'connected_payment'
     and new.event_type in (
       'checkout.session.completed',
       'checkout.session.async_payment_succeeded',
       'checkout.session.expired'
     ) then
    v_checkout_session_id := new.payload #>> '{data_object,id}';
    if new.account_id is null
       or new.provider_account_id is null
       or new.provider_account_id !~ '^acct_[A-Za-z0-9]{8,}$'
       or new.livemode is null
       or new.payload #>> '{schema}' is distinct from 'lgq.stripe-event-inbox.v1'
       or new.payload #>> '{scope}' is distinct from 'connected_payment'
       or new.payload #>> '{event,id}' is distinct from new.provider_event_id
       or new.payload #>> '{event,type}' is distinct from new.event_type
       or new.payload #>> '{event,account}' is distinct from new.provider_account_id
       or new.payload #> '{event,livemode}' is distinct from pg_catalog.to_jsonb(new.livemode)
       or new.payload #>> '{data_object,object}' is distinct from 'checkout.session'
       or v_checkout_session_id is null
       or v_checkout_session_id !~ '^cs_[A-Za-z0-9_]+$' then
      raise exception 'connected Checkout event mutex identity is invalid'
        using errcode = '22000';
    end if;

    perform pg_catalog.pg_advisory_xact_lock(
      public.stripe_connected_checkout_session_mutex_key(
        new.account_id,
        new.provider_account_id,
        new.livemode,
        v_checkout_session_id
      )
    );
  end if;
  return new;
end;
$$;

create trigger serialize_stripe_connected_checkout_event_insert_trigger
before insert on public.billing_events
for each row execute function public.serialize_stripe_connected_checkout_event_insert();

-- This is the reciprocal half of the Session mutex. The existing success
-- projector already owns the payment row before reaching its UPDATE. The
-- trigger therefore takes payment -> Session mutex, which is the same order as
-- the expiration projector below, and refuses only newly asserted paid,
-- PaymentIntent, or Charge truth for a Session with immutable expiration
-- evidence. The raised code/message is classified as a fixed terminal result
-- by the connected success projector; no payment or invoice mutation commits.
create function public.guard_stripe_connected_checkout_expiration_payment_truth()
returns trigger
language plpgsql
security definer
set search_path = ''
set timezone to 'UTC'
as $$
begin
  if old.charge_model = 'direct'
     and old.stripe_account_id is not null
     and old.stripe_account_id ~ '^acct_[A-Za-z0-9]{8,}$'
     and old.stripe_livemode is not null
     and old.stripe_checkout_session is not null
     and old.stripe_checkout_session ~ '^cs_[A-Za-z0-9_]+$'
     and (
       (old.status::text <> 'paid' and new.status::text = 'paid')
       or (old.paid_at is null and new.paid_at is not null)
       or (
         old.stripe_payment_intent is null
         and new.stripe_payment_intent is not null
       )
       or (old.stripe_charge_id is null and new.stripe_charge_id is not null)
     ) then
    perform pg_catalog.pg_advisory_xact_lock(
      public.stripe_connected_checkout_session_mutex_key(
        old.account_id,
        old.stripe_account_id,
        old.stripe_livemode,
        old.stripe_checkout_session
      )
    );

    if exists (
      select 1
        from public.stripe_connected_checkout_expirations x
       where x.account_id = old.account_id
         and x.payment_id = old.id
         and x.stripe_account_id = old.stripe_account_id
         and x.livemode = old.stripe_livemode
         and x.checkout_session_id = old.stripe_checkout_session
    ) then
      raise exception 'stripe_connected_checkout_expiration_conflict'
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

create trigger guard_stripe_connected_checkout_expiration_payment_truth_trigger
before update of status, paid_at, stripe_payment_intent, stripe_charge_id
on public.payments
for each row execute function public.guard_stripe_connected_checkout_expiration_payment_truth();

revoke all on function public.stripe_connected_checkout_session_mutex_key(
  uuid, text, boolean, text
) from public, anon, authenticated, service_role;
revoke all on function public.serialize_stripe_connected_checkout_event_insert()
  from public, anon, authenticated, service_role;
revoke all on function public.guard_stripe_connected_checkout_expiration_payment_truth()
  from public, anon, authenticated, service_role;

create function public.claim_stripe_connected_checkout_expiration_event(
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
set search_path = ''
set timezone to 'UTC'
as $$
declare
  v_event public.billing_events%rowtype;
  v_claim_token uuid := pg_catalog.gen_random_uuid();
  v_checkout_session_id text;
  v_expected_hash text;
  v_evidence public.stripe_connected_checkout_expirations%rowtype;
begin
  if p_billing_event_id is null then
    raise exception 'connected Checkout expiration event ID is required' using errcode = '22023';
  end if;

  select e.* into v_event
    from public.billing_events e
   where e.id = p_billing_event_id
   for update;
  if not found then
    raise exception 'connected Checkout expiration event was not found' using errcode = 'P0002';
  end if;

  v_checkout_session_id := v_event.payload #>> '{data_object,id}';
  v_expected_hash := pg_catalog.encode(
    extensions.digest(pg_catalog.convert_to(v_event.payload::text, 'UTF8'), 'sha256'),
    'hex'
  );
  if v_event.provider <> 'stripe'
     or v_event.event_scope <> 'connected_payment'
     or v_event.event_type <> 'checkout.session.expired'
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
    raise exception 'connected Checkout expiration inbox contract is invalid' using errcode = '22000';
  end if;

  if v_event.processing_status = 'processed' then
    select x.* into v_evidence
      from public.stripe_connected_checkout_expirations x
     where x.billing_event_id = v_event.id;
    if not found
       or v_event.projection_schema_version is distinct from 'stripe_connected_checkout_expiration_v1'
       or v_event.projection_result is distinct from 'direct_checkout_expired'
       or v_event.projection_applied is distinct from true
       or v_evidence.provider_event_id is distinct from v_event.provider_event_id
       or v_evidence.checkout_session_id is distinct from v_checkout_session_id
       or v_evidence.account_id is distinct from v_event.account_id
       or v_evidence.stripe_account_id is distinct from v_event.provider_account_id
       or v_evidence.livemode is distinct from v_event.livemode
       or v_evidence.provider_created_at is distinct from v_event.provider_created_at then
      raise exception 'processed connected Checkout expiration is missing immutable evidence'
        using errcode = '22000';
    end if;
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

  if v_event.attempt_count >= 8 then
    if v_event.processing_status = 'received' then
      raise exception 'received connected Checkout expiration has an impossible attempt count'
        using errcode = '22000';
    end if;
    update public.billing_events e
       set processing_status = 'failed',
           processed_at = null,
           next_attempt_at = null,
           last_error = 'expiration_retry_attempt_limit',
           projection_claim_token = null,
           projection_lease_expires_at = null,
           projection_schema_version = null,
           projection_applied = null,
           projection_result = null
     where e.id = v_event.id;
    return query select
      'failed_terminal'::text, v_event.id, null::uuid, v_event.attempt_count,
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
    raise exception 'connected Checkout expiration Merchant mapping no longer matches its workspace'
      using errcode = '55000';
  end if;

  if v_event.processing_status not in ('received', 'failed', 'processing') then
    raise exception 'connected Checkout expiration has an unsupported processing state'
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

create function public.resolve_stripe_connected_checkout_expiration_binding(
  p_billing_event_id uuid,
  p_claim_token uuid,
  p_workspace_id uuid,
  p_payment_id uuid,
  p_operation_id text,
  p_amount_cents bigint
)
returns table (
  binding_status text,
  error_code text,
  operation_pk uuid,
  workspace_id uuid,
  payment_id uuid,
  operation_id text,
  invoice_id uuid,
  checkout_session_id text,
  merchant_account_id text,
  livemode boolean,
  amount_cents bigint,
  fee_basis_amount_cents bigint,
  application_fee_cents bigint,
  fee_plan_code text,
  fee_catalog_version text,
  fee_rate_bps integer
)
language plpgsql
security definer
set search_path = ''
set timezone to 'UTC'
as $$
declare
  v_event public.billing_events%rowtype;
  v_payment public.payments%rowtype;
  v_operation public.billing_payment_operations%rowtype;
  v_invoice public.invoices%rowtype;
  v_checkout_session_id text;
  v_failure_code text;
begin
  if p_billing_event_id is null
     or p_claim_token is null
     or p_workspace_id is null
     or p_payment_id is null
     or p_operation_id is null
     or pg_catalog.length(pg_catalog.btrim(p_operation_id)) not between 1 and 200
     or p_operation_id ~ '[[:cntrl:]]'
     or p_amount_cents is null
     or p_amount_cents not between 1 and 99999999 then
    raise exception 'connected Checkout expiration binding input is invalid'
      using errcode = '22023';
  end if;

  select e.* into v_event
    from public.billing_events e
   where e.id = p_billing_event_id
   for update;
  if not found
     or v_event.provider <> 'stripe'
     or v_event.event_scope <> 'connected_payment'
     or v_event.event_type <> 'checkout.session.expired'
     or v_event.processing_status <> 'processing'
     or v_event.projection_claim_token is distinct from p_claim_token
     or v_event.projection_lease_expires_at <= pg_catalog.now()
     or v_event.account_id is distinct from p_workspace_id then
    raise exception 'connected Checkout expiration claim is not owned or expired'
      using errcode = '55000';
  end if;
  v_checkout_session_id := v_event.payload #>> '{data_object,id}';

  perform 1
    from public.accounts a
   where a.id = v_event.account_id
     and a.stripe_merchant_account_id = v_event.provider_account_id
     and a.merchant_livemode = v_event.livemode
   for key share;
  if not found then
    v_failure_code := 'expiration_merchant_mapping_conflict';
  end if;

  if v_failure_code is null then
    select p.* into v_payment
      from public.payments p
     where p.id = p_payment_id
       and p.account_id = p_workspace_id
     for update;
    if not found
       or v_payment.charge_model <> 'direct'
       or v_payment.stripe_account_id is distinct from v_event.provider_account_id
       or v_payment.stripe_livemode is distinct from v_event.livemode
       or v_payment.stripe_checkout_session is distinct from v_checkout_session_id
       or (v_payment.amount * 100)::bigint is distinct from p_amount_cents
       or v_payment.status::text <> 'processing'
       or v_payment.reconciliation_status <> 'pending'
       or v_payment.invoice_id is null
       or v_payment.stripe_payment_intent is not null
       or v_payment.stripe_charge_id is not null
       or v_payment.stripe_application_fee_id is not null
       or v_payment.stripe_balance_transaction_id is not null
       or v_payment.paid_at is not null
       or v_payment.refunded_amount is distinct from 0
       or v_payment.eligible_service_refunded_amount is distinct from 0
       or v_payment.platform_fee_refunded is distinct from 0
       or v_payment.refunded_at is not null
       or v_payment.stripe_latest_refund_id is not null
       or v_payment.stripe_latest_application_fee_refund_id is not null
       or v_payment.disputed_at is not null
       or v_payment.dispute_reason is not null
       or v_payment.dispute_status is not null
       or v_payment.stripe_dispute_id is not null
       or v_payment.dispute_due_by is not null
       or v_payment.fee_basis_amount is null
       or v_payment.platform_fee is null
       or v_payment.fee_plan_code is null
       or v_payment.fee_catalog_version is null
       or v_payment.fee_rate_bps is null
       or v_payment.fee_rate is distinct from v_payment.fee_rate_bps::numeric / 10000
       or v_payment.platform_fee is distinct from
          pg_catalog.round(v_payment.fee_basis_amount * v_payment.fee_rate_bps::numeric / 10000, 2) then
      v_failure_code := 'expiration_payment_binding_conflict';
    end if;
  end if;

  if v_failure_code is null then
    select i.* into v_invoice
      from public.invoices i
     where i.id = v_payment.invoice_id
       and i.account_id = v_payment.account_id
       and i.job_id = v_payment.job_id
     for share;
    if not found or v_invoice.status not in ('sent', 'signed') then
      v_failure_code := 'expiration_invoice_lock_conflict';
    end if;
  end if;

  if v_failure_code is null then
    select o.* into v_operation
      from public.billing_payment_operations o
     where o.payment_id = p_payment_id
       and o.account_id = p_workspace_id
       and o.operation_type = 'checkout_session.create'
       and o.operation_id = pg_catalog.btrim(p_operation_id)
     for share;
    begin
      if not found
         or v_operation.state <> 'succeeded'
         or v_operation.charge_model <> 'direct'
         or v_operation.stripe_account_id is distinct from v_event.provider_account_id
         or v_operation.livemode is distinct from v_event.livemode
         or v_operation.provider_object_id is distinct from v_checkout_session_id
         or v_operation.metadata #>> '{schema}' is distinct from 'one_off_direct_checkout_v1'
         or pg_catalog.jsonb_typeof(v_operation.metadata #> '{fee_snapshot}') is distinct from 'object'
         or v_operation.metadata #>> '{fee_snapshot,plan_code}' is distinct from v_payment.fee_plan_code
         or v_operation.metadata #>> '{fee_snapshot,catalog_version}' is distinct from v_payment.fee_catalog_version
         or pg_catalog.jsonb_typeof(v_operation.metadata #> '{fee_snapshot,fee_rate_bps}') is distinct from 'number'
         or (v_operation.metadata #>> '{fee_snapshot,fee_rate_bps}')::integer
            is distinct from v_payment.fee_rate_bps
         or pg_catalog.jsonb_typeof(v_operation.metadata #> '{fee_snapshot,fee_rate}') is distinct from 'number'
         or (v_operation.metadata #>> '{fee_snapshot,fee_rate}')::numeric
            is distinct from v_payment.fee_rate
         or pg_catalog.jsonb_typeof(v_operation.metadata #> '{fee_snapshot,gross_amount_cents}') is distinct from 'number'
         or (v_operation.metadata #>> '{fee_snapshot,gross_amount_cents}')::bigint
            is distinct from (v_payment.amount * 100)::bigint
         or pg_catalog.jsonb_typeof(
           v_operation.metadata #> '{fee_snapshot,eligible_service_subtotal_cents}'
         ) is distinct from 'number'
         or (v_operation.metadata #>> '{fee_snapshot,eligible_service_subtotal_cents}')::bigint
            is distinct from (v_payment.fee_basis_amount * 100)::bigint
         or pg_catalog.jsonb_typeof(
           v_operation.metadata #> '{fee_snapshot,application_fee_cents}'
         ) is distinct from 'number'
         or (v_operation.metadata #>> '{fee_snapshot,application_fee_cents}')::bigint
            is distinct from (v_payment.platform_fee * 100)::bigint then
        v_failure_code := 'expiration_operation_binding_conflict';
      end if;
    exception when others then
      v_failure_code := 'expiration_operation_binding_conflict';
    end;
  end if;

  if v_failure_code is not null then
    update public.billing_events e
       set processing_status = 'failed',
           processed_at = null,
           next_attempt_at = null,
           last_error = v_failure_code,
           projection_claim_token = null,
           projection_lease_expires_at = null,
           projection_schema_version = null,
           projection_applied = null,
           projection_result = null
     where e.id = v_event.id;
    return query select
      'manual_reconciliation'::text, v_failure_code,
      null::uuid, v_event.account_id, p_payment_id, pg_catalog.btrim(p_operation_id),
      null::uuid, v_checkout_session_id, v_event.provider_account_id,
      v_event.livemode, p_amount_cents, null::bigint, null::bigint,
      null::text, null::text, null::integer;
    return;
  end if;

  return query select
    'ready'::text, null::text, v_operation.id, v_payment.account_id,
    v_payment.id, v_operation.operation_id, v_payment.invoice_id,
    v_payment.stripe_checkout_session, v_payment.stripe_account_id,
    v_payment.stripe_livemode, (v_payment.amount * 100)::bigint,
    (v_payment.fee_basis_amount * 100)::bigint,
    (v_payment.platform_fee * 100)::bigint, v_payment.fee_plan_code,
    v_payment.fee_catalog_version, v_payment.fee_rate_bps;
end;
$$;

create function public.project_stripe_connected_checkout_expiration(
  p_billing_event_id uuid,
  p_claim_token uuid,
  p_projection jsonb
)
returns table (
  processing_status text,
  error_code text,
  billing_event_id uuid,
  payment_id uuid,
  workspace_id uuid,
  projection_applied boolean
)
language plpgsql
security definer
set search_path = ''
set timezone to 'UTC'
as $$
declare
  v_event public.billing_events%rowtype;
  v_payment public.payments%rowtype;
  v_operation public.billing_payment_operations%rowtype;
  v_invoice public.invoices%rowtype;
  v_existing public.stripe_connected_checkout_expirations%rowtype;
  v_expected_keys text[] := array[
    'schema', 'provider_event_id', 'event_type', 'provider_created_at',
    'workspace_id', 'payment_id', 'operation_id', 'operation_pk',
    'invoice_id', 'checkout_session_id', 'merchant_account_id', 'livemode',
    'currency', 'amount_cents', 'session_expires_at', 'mode',
    'session_status', 'payment_status', 'payment_method_types',
    'recovered_from', 'payment_intent_id', 'fee_plan_code',
    'fee_catalog_version', 'fee_rate_bps', 'fee_basis_amount_cents',
    'application_fee_cents'
  ];
  v_workspace_id uuid;
  v_payment_id uuid;
  v_operation_pk uuid;
  v_invoice_id uuid;
  v_provider_created_at timestamptz;
  v_session_expires_at timestamptz;
  v_amount_cents bigint;
  v_fee_basis_amount_cents bigint;
  v_application_fee_cents bigint;
  v_fee_rate_bps integer;
  v_failure_code text;
begin
  if p_billing_event_id is null
     or p_claim_token is null
     or p_projection is null
     or pg_catalog.jsonb_typeof(p_projection) <> 'object'
     or not (p_projection ?& v_expected_keys)
     or (p_projection - v_expected_keys) <> '{}'::jsonb then
    raise exception 'connected Checkout expiration projection shape is invalid'
      using errcode = '22023';
  end if;

  begin
    v_workspace_id := (p_projection ->> 'workspace_id')::uuid;
    v_payment_id := (p_projection ->> 'payment_id')::uuid;
    v_operation_pk := (p_projection ->> 'operation_pk')::uuid;
    v_invoice_id := (p_projection ->> 'invoice_id')::uuid;
    v_provider_created_at := (p_projection ->> 'provider_created_at')::timestamptz;
    v_session_expires_at := (p_projection ->> 'session_expires_at')::timestamptz;
    v_amount_cents := (p_projection ->> 'amount_cents')::bigint;
    v_fee_basis_amount_cents := (p_projection ->> 'fee_basis_amount_cents')::bigint;
    v_application_fee_cents := (p_projection ->> 'application_fee_cents')::bigint;
    v_fee_rate_bps := (p_projection ->> 'fee_rate_bps')::integer;
  exception when others then
    raise exception 'connected Checkout expiration projection scalar is invalid'
      using errcode = '22023';
  end;

  if p_projection ->> 'schema' is distinct from 'stripe_connected_checkout_expiration_v1'
     or p_projection ->> 'event_type' is distinct from 'checkout.session.expired'
     or p_projection ->> 'provider_event_id' is null
     or p_projection ->> 'provider_event_id' !~ '^evt_[A-Za-z0-9_]{8,}$'
     or p_projection ->> 'checkout_session_id' is null
     or p_projection ->> 'checkout_session_id' !~ '^cs_[A-Za-z0-9_]+$'
     or p_projection ->> 'merchant_account_id' is null
     or p_projection ->> 'merchant_account_id' !~ '^acct_[A-Za-z0-9]{8,}$'
     or p_projection ->> 'operation_id' is null
     or pg_catalog.length(pg_catalog.btrim(p_projection ->> 'operation_id')) not between 1 and 200
     or p_projection ->> 'operation_id' ~ '[[:cntrl:]]'
     or p_projection ->> 'currency' is distinct from 'usd'
     or p_projection ->> 'mode' is distinct from 'payment'
     or p_projection ->> 'session_status' is distinct from 'expired'
     or p_projection ->> 'payment_status' is distinct from 'unpaid'
     or p_projection -> 'payment_method_types' is distinct from '["card"]'::jsonb
     or p_projection -> 'recovered_from' is distinct from 'null'::jsonb
     or p_projection -> 'payment_intent_id' is distinct from 'null'::jsonb
     or pg_catalog.jsonb_typeof(p_projection -> 'livemode') is distinct from 'boolean'
     or pg_catalog.jsonb_typeof(p_projection -> 'provider_event_id') is distinct from 'string'
     or pg_catalog.jsonb_typeof(p_projection -> 'provider_created_at') is distinct from 'string'
     or pg_catalog.jsonb_typeof(p_projection -> 'workspace_id') is distinct from 'string'
     or pg_catalog.jsonb_typeof(p_projection -> 'payment_id') is distinct from 'string'
     or pg_catalog.jsonb_typeof(p_projection -> 'operation_id') is distinct from 'string'
     or pg_catalog.jsonb_typeof(p_projection -> 'operation_pk') is distinct from 'string'
     or pg_catalog.jsonb_typeof(p_projection -> 'invoice_id') is distinct from 'string'
     or pg_catalog.jsonb_typeof(p_projection -> 'checkout_session_id') is distinct from 'string'
     or pg_catalog.jsonb_typeof(p_projection -> 'merchant_account_id') is distinct from 'string'
     or pg_catalog.jsonb_typeof(p_projection -> 'amount_cents') is distinct from 'number'
     or pg_catalog.jsonb_typeof(p_projection -> 'session_expires_at') is distinct from 'string'
     or pg_catalog.jsonb_typeof(p_projection -> 'fee_plan_code') is distinct from 'string'
     or pg_catalog.jsonb_typeof(p_projection -> 'fee_catalog_version') is distinct from 'string'
     or pg_catalog.jsonb_typeof(p_projection -> 'fee_rate_bps') is distinct from 'number'
     or pg_catalog.jsonb_typeof(p_projection -> 'fee_basis_amount_cents') is distinct from 'number'
     or pg_catalog.jsonb_typeof(p_projection -> 'application_fee_cents') is distinct from 'number'
     or v_workspace_id is null
     or v_payment_id is null
     or v_operation_pk is null
     or v_invoice_id is null
     or v_provider_created_at is null
     or v_session_expires_at is null
     or v_session_expires_at <= '2000-01-01 00:00:00+00'::timestamptz
     or v_provider_created_at < v_session_expires_at
     or v_amount_cents not between 1 and 99999999
     or v_fee_basis_amount_cents not between 0 and v_amount_cents
     or v_application_fee_cents not between 0 and v_fee_basis_amount_cents
     or v_fee_rate_bps not between 0 and 10000
     or v_application_fee_cents is distinct from pg_catalog.round(
       v_fee_basis_amount_cents::numeric * v_fee_rate_bps::numeric / 10000,
       0
     )::bigint
     or p_projection ->> 'fee_plan_code' is null
     or p_projection ->> 'fee_plan_code' not in ('flex', 'solo', 'growth', 'scale', 'enterprise')
     or p_projection ->> 'fee_catalog_version' is null
     or pg_catalog.length(pg_catalog.btrim(p_projection ->> 'fee_catalog_version')) not between 1 and 100 then
    raise exception 'connected Checkout expiration projection contract is invalid'
      using errcode = '22023';
  end if;

  select e.* into v_event
    from public.billing_events e
   where e.id = p_billing_event_id
   for update;
  if not found
     or v_event.provider <> 'stripe'
     or v_event.event_scope <> 'connected_payment'
     or v_event.event_type <> 'checkout.session.expired'
     or v_event.processing_status <> 'processing'
     or v_event.projection_claim_token is distinct from p_claim_token
     or v_event.projection_lease_expires_at <= pg_catalog.now() then
    raise exception 'connected Checkout expiration claim is not owned or expired'
      using errcode = '55000';
  end if;

  if v_event.provider_event_id is distinct from (p_projection ->> 'provider_event_id')
     or v_event.provider_created_at is distinct from v_provider_created_at
     or v_event.account_id is distinct from v_workspace_id
     or v_event.provider_account_id is distinct from (p_projection ->> 'merchant_account_id')
     or v_event.livemode is distinct from (p_projection ->> 'livemode')::boolean
     or v_event.payload #>> '{data_object,id}' is distinct from (p_projection ->> 'checkout_session_id') then
    v_failure_code := 'expiration_event_binding_conflict';
  end if;

  if v_failure_code is null then
    perform 1
      from public.accounts a
     where a.id = v_workspace_id
       and a.stripe_merchant_account_id = v_event.provider_account_id
       and a.merchant_livemode = v_event.livemode
     for key share;
    if not found then
      v_failure_code := 'expiration_merchant_mapping_conflict';
    end if;
  end if;

  if v_failure_code is null then
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
       or v_payment.invoice_id is distinct from v_invoice_id
       or (v_payment.amount * 100)::bigint is distinct from v_amount_cents
       or (v_payment.fee_basis_amount * 100)::bigint is distinct from v_fee_basis_amount_cents
       or (v_payment.platform_fee * 100)::bigint is distinct from v_application_fee_cents
       or v_payment.fee_plan_code is distinct from (p_projection ->> 'fee_plan_code')
       or v_payment.fee_catalog_version is distinct from (p_projection ->> 'fee_catalog_version')
       or v_payment.fee_rate_bps is distinct from v_fee_rate_bps
       or v_payment.status::text <> 'processing'
       or v_payment.reconciliation_status <> 'pending'
       or v_payment.paid_at is not null
       or v_payment.stripe_payment_intent is not null
       or v_payment.stripe_charge_id is not null
       or v_payment.stripe_application_fee_id is not null
       or v_payment.stripe_balance_transaction_id is not null
       or v_payment.refunded_amount is distinct from 0
       or v_payment.eligible_service_refunded_amount is distinct from 0
       or v_payment.platform_fee_refunded is distinct from 0
       or v_payment.refunded_at is not null
       or v_payment.stripe_latest_refund_id is not null
       or v_payment.stripe_latest_application_fee_refund_id is not null
       or v_payment.disputed_at is not null
       or v_payment.dispute_reason is not null
       or v_payment.dispute_status is not null
       or v_payment.stripe_dispute_id is not null
       or v_payment.dispute_due_by is not null then
      v_failure_code := 'expiration_payment_evidence_conflict';
    end if;
  end if;

  if v_failure_code is null then
    select i.* into v_invoice
      from public.invoices i
     where i.id = v_invoice_id
       and i.account_id = v_workspace_id
       and i.job_id = v_payment.job_id
     for share;
    if not found or v_invoice.status not in ('sent', 'signed') then
      v_failure_code := 'expiration_invoice_lock_conflict';
    end if;
  end if;

  if v_failure_code is null then
    select o.* into v_operation
      from public.billing_payment_operations o
     where o.id = v_operation_pk
       and o.payment_id = v_payment_id
       and o.account_id = v_workspace_id
       and o.operation_type = 'checkout_session.create'
       and o.operation_id = pg_catalog.btrim(p_projection ->> 'operation_id')
     for share;
    begin
      if not found
         or v_operation.state <> 'succeeded'
         or v_operation.charge_model <> 'direct'
         or v_operation.stripe_account_id is distinct from v_event.provider_account_id
         or v_operation.livemode is distinct from v_event.livemode
         or v_operation.provider_object_id is distinct from (p_projection ->> 'checkout_session_id')
         or v_operation.metadata #>> '{schema}' is distinct from 'one_off_direct_checkout_v1'
         or pg_catalog.jsonb_typeof(v_operation.metadata #> '{fee_snapshot}') is distinct from 'object'
         or pg_catalog.jsonb_typeof(v_operation.metadata #> '{fee_snapshot,fee_rate_bps}') is distinct from 'number'
         or pg_catalog.jsonb_typeof(v_operation.metadata #> '{fee_snapshot,gross_amount_cents}') is distinct from 'number'
         or pg_catalog.jsonb_typeof(
           v_operation.metadata #> '{fee_snapshot,eligible_service_subtotal_cents}'
         ) is distinct from 'number'
         or pg_catalog.jsonb_typeof(
           v_operation.metadata #> '{fee_snapshot,application_fee_cents}'
         ) is distinct from 'number'
         or v_operation.metadata #>> '{fee_snapshot,plan_code}' is distinct from (p_projection ->> 'fee_plan_code')
         or v_operation.metadata #>> '{fee_snapshot,catalog_version}' is distinct from (p_projection ->> 'fee_catalog_version')
         or (v_operation.metadata #>> '{fee_snapshot,fee_rate_bps}')::integer is distinct from v_fee_rate_bps
         or (v_operation.metadata #>> '{fee_snapshot,gross_amount_cents}')::bigint is distinct from v_amount_cents
         or (v_operation.metadata #>> '{fee_snapshot,eligible_service_subtotal_cents}')::bigint
            is distinct from v_fee_basis_amount_cents
         or (v_operation.metadata #>> '{fee_snapshot,application_fee_cents}')::bigint
            is distinct from v_application_fee_cents then
        v_failure_code := 'expiration_operation_binding_conflict';
      end if;
    exception when others then
      v_failure_code := 'expiration_operation_binding_conflict';
    end;
  end if;

  -- The payment row is already locked. Take the shared Session mutex in that
  -- same order before observing inbox success facts. Relevant inbox INSERTs
  -- take only this mutex, so a concurrent delivery must serialize either
  -- before this scan or after the immutable evidence is committed. The
  -- reciprocal payment trigger rejects the latter from asserting paid truth.
  if v_failure_code is null then
    perform pg_catalog.pg_advisory_xact_lock(
      public.stripe_connected_checkout_session_mutex_key(
        v_workspace_id,
        v_event.provider_account_id,
        v_event.livemode,
        p_projection ->> 'checkout_session_id'
      )
    );
  end if;

  -- Event ordering and projector outcomes are not trusted: every signed
  -- success receipt blocks expiration evidence, including a receipt whose
  -- projector is retryable-failed, terminal-failed, or ignored.
  if v_failure_code is null and exists (
    select 1
      from public.billing_events success_event
     where success_event.id <> v_event.id
       and success_event.provider = 'stripe'
       and success_event.event_scope = 'connected_payment'
       and success_event.account_id = v_event.account_id
       and success_event.provider_account_id = v_event.provider_account_id
       and success_event.livemode = v_event.livemode
       and success_event.event_type in (
         'checkout.session.completed',
         'checkout.session.async_payment_succeeded'
       )
       and success_event.payload #>> '{data_object,object}' = 'checkout.session'
       and success_event.payload #>> '{data_object,id}' = (p_projection ->> 'checkout_session_id')
  ) then
    v_failure_code := 'expiration_success_event_conflict';
  end if;

  if v_failure_code is null then
    select x.* into v_existing
      from public.stripe_connected_checkout_expirations x
     where (x.stripe_account_id, x.livemode, x.checkout_session_id) = (
       v_event.provider_account_id,
       v_event.livemode,
       p_projection ->> 'checkout_session_id'
     )
        or x.billing_event_id = v_event.id
     for share;
    if found then
      v_failure_code := 'expiration_evidence_conflict';
    end if;
  end if;

  if v_failure_code is not null then
    update public.billing_events e
       set processing_status = 'failed',
           processed_at = null,
           next_attempt_at = null,
           last_error = v_failure_code,
           projection_claim_token = null,
           projection_lease_expires_at = null,
           projection_schema_version = null,
           projection_applied = null,
           projection_result = null
     where e.id = v_event.id;
    return query select
      'manual_reconciliation'::text, v_failure_code, v_event.id,
      v_payment_id, v_workspace_id, false;
    return;
  end if;

  insert into public.stripe_connected_checkout_expirations (
    billing_event_id, account_id, payment_id, operation_pk, operation_id,
    stripe_account_id, livemode, provider_event_id, checkout_session_id,
    provider_created_at, session_expires_at, observed_mode,
    observed_session_status, observed_payment_status, observed_currency,
    observed_amount_cents, observed_payment_method_types,
    observed_recovered_from, observed_payment_intent_id, fee_plan_code,
    fee_catalog_version, fee_rate_bps, fee_basis_amount_cents,
    application_fee_cents
  ) values (
    v_event.id, v_workspace_id, v_payment_id, v_operation_pk,
    pg_catalog.btrim(p_projection ->> 'operation_id'),
    v_event.provider_account_id, v_event.livemode, v_event.provider_event_id,
    p_projection ->> 'checkout_session_id', v_provider_created_at,
    v_session_expires_at, p_projection ->> 'mode',
    p_projection ->> 'session_status', p_projection ->> 'payment_status',
    p_projection ->> 'currency', v_amount_cents, array['card']::text[],
    null, null, p_projection ->> 'fee_plan_code',
    p_projection ->> 'fee_catalog_version', v_fee_rate_bps,
    v_fee_basis_amount_cents, v_application_fee_cents
  );

  -- Deliberately update only this expiration event. Payment status remains
  -- processing, reconciliation remains pending, and the invoice remains locked.
  update public.billing_events e
     set processing_status = 'processed',
         processed_at = pg_catalog.now(),
         next_attempt_at = null,
         last_error = null,
         projection_claim_token = null,
         projection_lease_expires_at = null,
         projection_schema_version = 'stripe_connected_checkout_expiration_v1',
         projection_applied = true,
         projection_result = 'direct_checkout_expired'
   where e.id = v_event.id;

  return query select
    'processed'::text, null::text, v_event.id, v_payment_id,
    v_workspace_id, true;
end;
$$;

create function public.fail_stripe_connected_checkout_expiration_event(
  p_billing_event_id uuid,
  p_claim_token uuid,
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
  v_event public.billing_events%rowtype;
  v_retryable boolean;
  v_error_code text;
begin
  if p_billing_event_id is null
     or p_claim_token is null
     or p_error_code is null
     or p_error_code not in (
       'expiration_provider_mode_mismatch',
       'expiration_provider_retrieve_failed',
       'expiration_provider_contract_mismatch',
       'expiration_metadata_mismatch',
       'expiration_internal_error',
       'expiration_retry_attempt_limit'
     )
     or p_retryable is null
     or (p_retryable and (p_next_attempt_at is null or p_next_attempt_at <= pg_catalog.now()))
     or (not p_retryable and p_next_attempt_at is not null) then
    raise exception 'connected Checkout expiration failure input is invalid'
      using errcode = '22023';
  end if;

  select e.* into v_event
    from public.billing_events e
   where e.id = p_billing_event_id
   for update;
  if not found
     or v_event.provider <> 'stripe'
     or v_event.event_scope <> 'connected_payment'
     or v_event.event_type <> 'checkout.session.expired'
     or v_event.processing_status <> 'processing'
     or v_event.projection_claim_token is distinct from p_claim_token
     or v_event.projection_lease_expires_at <= pg_catalog.now() then
    raise exception 'connected Checkout expiration failure claim is not owned or expired'
      using errcode = '55000';
  end if;

  v_retryable := p_retryable and v_event.attempt_count < 8;
  v_error_code := case
    when p_retryable and v_event.attempt_count >= 8
      then 'expiration_retry_attempt_limit'
    else p_error_code
  end;

  update public.billing_events e
     set processing_status = 'failed',
         processed_at = null,
         next_attempt_at = case when v_retryable then p_next_attempt_at else null end,
         last_error = v_error_code,
         projection_claim_token = null,
         projection_lease_expires_at = null,
         projection_schema_version = null,
         projection_applied = null,
         projection_result = null
   where e.id = v_event.id;
  return true;
end;
$$;

revoke all on function public.claim_stripe_connected_checkout_expiration_event(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.claim_stripe_connected_checkout_expiration_event(uuid)
  to service_role;

revoke all on function public.resolve_stripe_connected_checkout_expiration_binding(
  uuid, uuid, uuid, uuid, text, bigint
) from public, anon, authenticated, service_role;
grant execute on function public.resolve_stripe_connected_checkout_expiration_binding(
  uuid, uuid, uuid, uuid, text, bigint
) to service_role;

revoke all on function public.project_stripe_connected_checkout_expiration(uuid, uuid, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.project_stripe_connected_checkout_expiration(uuid, uuid, jsonb)
  to service_role;

revoke all on function public.fail_stripe_connected_checkout_expiration_event(
  uuid, uuid, text, boolean, timestamptz
) from public, anon, authenticated, service_role;
grant execute on function public.fail_stripe_connected_checkout_expiration_event(
  uuid, uuid, text, boolean, timestamptz
) to service_role;

comment on table public.stripe_connected_checkout_expirations is
  'Immutable PII-free evidence that one exact Merchant-direct card Checkout Session was observed expired and unpaid; does not release its payment or invoice.';
comment on function public.claim_stripe_connected_checkout_expiration_event(uuid) is
  'DARK explicit-ID, five-minute, eight-attempt claim for minimized connected checkout.session.expired inbox events.';

commit;

-- Activation blockers (intentionally unresolved here):
--   1. Apply and transactionally probe this migration in staging.
--   2. Configure the test-mode connected endpoint for checkout.session.expired.
--   3. Add a reviewed due-event selector/cron only after signed test-mode proof.
--   4. Define the separate user-authorized Session replacement/release policy.
