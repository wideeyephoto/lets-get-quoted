-- Crash-safe, DARK direct-charge refund orchestration.
--
-- This migration deliberately does not create an authorization writer. A
-- future server-only policy must first persist the exact gross and eligible
-- service components (plus its deterministic policy/version/fingerprint).
-- Refund execution accepts only that authorization ID and revalidates it under
-- the payment lock. UI/request cents therefore never become payment authority.

begin;

-- Cumulative fee reversal cannot be reconstructed from gross refunds because
-- gross can contain separately stated tax. New direct payments start at zero;
-- any pre-foundation direct payment already refunded is set to NULL so it fails
-- closed until its eligible-service provenance is explicitly reconciled.
alter table public.payments
  add column if not exists eligible_service_refunded_amount numeric(12,2) default 0;

update public.payments
   set eligible_service_refunded_amount = null
 where charge_model = 'direct'
   and refunded_amount > 0
   and eligible_service_refunded_amount = 0;

do $$
begin
  if not exists (
    select 1
      from pg_catalog.pg_constraint
     where conrelid = 'public.payments'::pg_catalog.regclass
       and conname = 'payments_eligible_service_refunded_amount_check'
  ) then
    alter table public.payments
      add constraint payments_eligible_service_refunded_amount_check
      check (
        eligible_service_refunded_amount is null
        or (
          eligible_service_refunded_amount >= 0
          and (
            fee_basis_amount is null
            or eligible_service_refunded_amount <= fee_basis_amount
          )
        )
      );
  end if;
end
$$;

-- Direct refund accounting is RPC-owned. In particular, an eventual direct
-- charge.refunded webhook must reconcile through this state machine rather than
-- overwrite the eligible-service allocation with a gross-proportional guess.
create or replace function public.protect_direct_refund_accounting()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  if old.charge_model = 'direct'
     and current_user in ('anon', 'authenticated', 'service_role')
     and (
       old.refunded_amount is distinct from new.refunded_amount
       or old.eligible_service_refunded_amount is distinct from new.eligible_service_refunded_amount
       or old.platform_fee_refunded is distinct from new.platform_fee_refunded
       or old.refunded_at is distinct from new.refunded_at
       or old.stripe_latest_refund_id is distinct from new.stripe_latest_refund_id
       or old.stripe_latest_application_fee_refund_id is distinct from new.stripe_latest_application_fee_refund_id
     ) then
    raise exception 'direct refund accounting is RPC-managed' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_direct_refund_accounting_trigger on public.payments;
create trigger protect_direct_refund_accounting_trigger
before update of refunded_amount, eligible_service_refunded_amount,
  platform_fee_refunded, refunded_at, stripe_latest_refund_id,
  stripe_latest_application_fee_refund_id
on public.payments
for each row execute function public.protect_direct_refund_accounting();

revoke all on function public.protect_direct_refund_accounting()
  from public, anon, authenticated, service_role;

create table if not exists public.billing_direct_refund_authorizations (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null,
  payment_id uuid not null,
  charge_model text not null default 'direct' check (charge_model = 'direct'),
  stripe_account_id text not null check (stripe_account_id ~ '^acct_[A-Za-z0-9]{8,}$'),
  livemode boolean not null,
  stripe_payment_intent_id text not null check (stripe_payment_intent_id ~ '^pi_[A-Za-z0-9_]+$'),
  stripe_charge_id text not null check (stripe_charge_id ~ '^ch_[A-Za-z0-9_]+$'),
  stripe_application_fee_id text check (
    stripe_application_fee_id is null
    or stripe_application_fee_id ~ '^fee_[A-Za-z0-9_]+$'
  ),
  gross_refund_cents bigint not null check (gross_refund_cents between 1 and 99999999),
  eligible_service_refund_cents bigint not null check (
    eligible_service_refund_cents between 0 and gross_refund_cents
  ),
  refund_reason text not null check (
    refund_reason in ('duplicate', 'fraudulent', 'requested_by_customer')
  ),
  allocation_policy text not null check (
    allocation_policy ~ '^[a-z][a-z0-9_.-]{1,63}$'
  ),
  allocation_version text not null check (
    allocation_version ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$'
  ),
  allocation_fingerprint text not null check (allocation_fingerprint ~ '^[0-9a-f]{64}$'),
  authority_reference text not null check (
    pg_catalog.length(pg_catalog.btrim(authority_reference)) between 1 and 200
  ),
  authorized_at timestamptz not null default pg_catalog.now(),
  expires_at timestamptz not null,
  created_at timestamptz not null default pg_catalog.now(),
  constraint billing_direct_refund_authorizations_expiry_check
    check (expires_at > authorized_at),
  constraint billing_direct_refund_authorizations_payment_fk
    foreign key (payment_id, account_id, stripe_account_id, livemode, charge_model)
    references public.payments(id, account_id, stripe_account_id, stripe_livemode, charge_model)
    on delete restrict,
  constraint billing_direct_refund_authorizations_scope_unique
    unique (id, account_id, payment_id, stripe_account_id, livemode, charge_model)
);

create index if not exists billing_direct_refund_authorizations_payment_idx
  on public.billing_direct_refund_authorizations (payment_id, authorized_at desc);

create or replace function public.protect_direct_refund_authorization()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  raise exception 'direct refund authorizations are immutable; create a new authorization'
    using errcode = '22000';
end;
$$;

drop trigger if exists protect_direct_refund_authorization_update_trigger
  on public.billing_direct_refund_authorizations;
create trigger protect_direct_refund_authorization_update_trigger
before update or delete on public.billing_direct_refund_authorizations
for each row execute function public.protect_direct_refund_authorization();

revoke all on function public.protect_direct_refund_authorization()
  from public, anon, authenticated, service_role;

do $$
begin
  if not exists (
    select 1
      from pg_catalog.pg_constraint
     where conrelid = 'public.billing_payment_operations'::pg_catalog.regclass
       and conname = 'billing_payment_operations_refund_scope_unique'
  ) then
    alter table public.billing_payment_operations
      add constraint billing_payment_operations_refund_scope_unique
      unique (id, account_id, payment_id, stripe_account_id, livemode, charge_model);
  end if;
end
$$;

create table if not exists public.billing_direct_refund_operations (
  operation_pk uuid primary key,
  authorization_id uuid not null unique,
  account_id uuid not null,
  payment_id uuid not null,
  charge_model text not null default 'direct' check (charge_model = 'direct'),
  stripe_account_id text not null check (stripe_account_id ~ '^acct_[A-Za-z0-9]{8,}$'),
  livemode boolean not null,
  stripe_payment_intent_id text not null check (stripe_payment_intent_id ~ '^pi_[A-Za-z0-9_]+$'),
  stripe_charge_id text not null check (stripe_charge_id ~ '^ch_[A-Za-z0-9_]+$'),
  stripe_application_fee_id text check (
    stripe_application_fee_id is null
    or stripe_application_fee_id ~ '^fee_[A-Za-z0-9_]+$'
  ),
  allocation_policy text not null,
  allocation_version text not null,
  allocation_fingerprint text not null check (allocation_fingerprint ~ '^[0-9a-f]{64}$'),
  refund_reason text not null check (
    refund_reason in ('duplicate', 'fraudulent', 'requested_by_customer')
  ),
  refund_mode text not null check (refund_mode in ('full_combined', 'split')),
  gross_refund_cents bigint not null check (gross_refund_cents between 1 and 99999999),
  eligible_service_refund_cents bigint not null check (
    eligible_service_refund_cents between 0 and gross_refund_cents
  ),
  cumulative_gross_before_cents bigint not null check (cumulative_gross_before_cents >= 0),
  cumulative_gross_after_cents bigint not null check (
    cumulative_gross_after_cents = cumulative_gross_before_cents + gross_refund_cents
  ),
  cumulative_eligible_before_cents bigint not null check (cumulative_eligible_before_cents >= 0),
  cumulative_eligible_after_cents bigint not null check (
    cumulative_eligible_after_cents = cumulative_eligible_before_cents + eligible_service_refund_cents
  ),
  application_fee_total_cents bigint not null check (application_fee_total_cents >= 0),
  application_fee_refund_before_cents bigint not null check (
    application_fee_refund_before_cents between 0 and application_fee_total_cents
  ),
  application_fee_refund_after_cents bigint not null check (
    application_fee_refund_after_cents between application_fee_refund_before_cents and application_fee_total_cents
  ),
  application_fee_refund_cents bigint not null check (
    application_fee_refund_cents = application_fee_refund_after_cents - application_fee_refund_before_cents
  ),
  charge_operation_id text not null check (
    pg_catalog.length(pg_catalog.btrim(charge_operation_id)) between 1 and 200
  ),
  charge_idempotency_key text not null check (
    charge_idempotency_key ~ '^lgq:direct:v1:refund[.]create:[0-9a-f]{64}$'
  ),
  charge_request_fingerprint text not null check (charge_request_fingerprint ~ '^[0-9a-f]{64}$'),
  application_fee_operation_id text,
  application_fee_idempotency_key text,
  application_fee_request_fingerprint text,
  phase text not null default 'charge_ready' check (
    phase in (
      'charge_ready', 'charge_submitted', 'fee_ready', 'fee_submitted',
      'succeeded', 'failed', 'indeterminate'
    )
  ),
  indeterminate_step text check (indeterminate_step in ('charge', 'application_fee')),
  stripe_refund_id text check (stripe_refund_id is null or stripe_refund_id ~ '^re_[A-Za-z0-9_]+$'),
  stripe_refund_result jsonb check (
    stripe_refund_result is null or pg_catalog.jsonb_typeof(stripe_refund_result) = 'object'
  ),
  stripe_application_fee_refund_id text check (
    stripe_application_fee_refund_id is null
    or stripe_application_fee_refund_id ~ '^fr_[A-Za-z0-9_]+$'
  ),
  stripe_application_fee_refund_result jsonb check (
    stripe_application_fee_refund_result is null
    or pg_catalog.jsonb_typeof(stripe_application_fee_refund_result) = 'object'
  ),
  charge_submission_started_at timestamptz,
  charge_result_recorded_at timestamptz,
  application_fee_submission_started_at timestamptz,
  application_fee_result_recorded_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint billing_direct_refund_operations_fee_call_check check (
    (
      refund_mode = 'split'
      and application_fee_refund_cents > 0
      and stripe_application_fee_id is not null
      and application_fee_operation_id is not null
      and application_fee_idempotency_key ~ '^lgq:direct:v1:application_fee_refund[.]create:[0-9a-f]{64}$'
      and application_fee_request_fingerprint ~ '^[0-9a-f]{64}$'
    )
    or (
      (refund_mode = 'full_combined' or application_fee_refund_cents = 0)
      and application_fee_operation_id is null
      and application_fee_idempotency_key is null
      and application_fee_request_fingerprint is null
    )
  ),
  constraint billing_direct_refund_operations_combined_check check (
    refund_mode <> 'full_combined'
    or (
      application_fee_refund_cents > 0
      and application_fee_refund_after_cents = application_fee_total_cents
      and stripe_application_fee_id is not null
    )
  ),
  constraint billing_direct_refund_operations_operation_fk
    foreign key (operation_pk, account_id, payment_id, stripe_account_id, livemode, charge_model)
    references public.billing_payment_operations(
      id, account_id, payment_id, stripe_account_id, livemode, charge_model
    ) on delete restrict,
  constraint billing_direct_refund_operations_authorization_fk
    foreign key (authorization_id, account_id, payment_id, stripe_account_id, livemode, charge_model)
    references public.billing_direct_refund_authorizations(
      id, account_id, payment_id, stripe_account_id, livemode, charge_model
    ) on delete restrict
);

create index if not exists billing_direct_refund_operations_payment_idx
  on public.billing_direct_refund_operations (payment_id, created_at desc);
create unique index if not exists billing_direct_refund_operations_fee_key_unique
  on public.billing_direct_refund_operations (application_fee_idempotency_key)
  where application_fee_idempotency_key is not null;
create unique index if not exists billing_direct_refund_operations_fee_refund_unique
  on public.billing_direct_refund_operations (stripe_application_fee_refund_id)
  where stripe_application_fee_refund_id is not null;

-- A submitted/indeterminate mutation blocks every later refund on the payment.
-- Succeeded and terminal-failed operations release the serialization slot.
create unique index if not exists billing_payment_operations_one_active_direct_refund
  on public.billing_payment_operations (payment_id)
  where operation_type = 'direct_refund.create'
    and state in ('claimed', 'submitted', 'indeterminate');

drop trigger if exists billing_direct_refund_operations_touch_updated_at
  on public.billing_direct_refund_operations;
create trigger billing_direct_refund_operations_touch_updated_at
before update on public.billing_direct_refund_operations
for each row execute function public.touch_billing_updated_at();

alter table public.billing_direct_refund_authorizations enable row level security;
alter table public.billing_direct_refund_operations enable row level security;

-- Internal calculator. It has no grant to any API role. Existing operations
-- return their frozen plan, which lets a succeeded call replay without applying
-- the same authorization to the already-advanced cumulative totals.
create or replace function public.compute_direct_charge_refund_plan(
  p_account_id uuid,
  p_payment_id uuid,
  p_stripe_account_id text,
  p_livemode boolean,
  p_authorization_id uuid,
  p_operation_id text
)
returns table (
  authorization_id uuid,
  allocation_policy text,
  allocation_version text,
  allocation_fingerprint text,
  stripe_payment_intent_id text,
  stripe_charge_id text,
  stripe_application_fee_id text,
  refund_reason text,
  refund_mode text,
  gross_refund_cents bigint,
  eligible_service_refund_cents bigint,
  cumulative_gross_before_cents bigint,
  cumulative_gross_after_cents bigint,
  cumulative_eligible_before_cents bigint,
  cumulative_eligible_after_cents bigint,
  application_fee_total_cents bigint,
  application_fee_refund_before_cents bigint,
  application_fee_refund_after_cents bigint,
  application_fee_refund_cents bigint
)
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
declare
  v_authorization public.billing_direct_refund_authorizations%rowtype;
  v_payment public.payments%rowtype;
  v_existing public.billing_direct_refund_operations%rowtype;
  v_existing_operation public.billing_payment_operations%rowtype;
  v_gross_total bigint;
  v_eligible_total bigint;
  v_fee_total bigint;
  v_gross_before bigint;
  v_eligible_before bigint;
  v_fee_before bigint;
  v_gross_after bigint;
  v_eligible_after bigint;
  v_fee_after bigint;
  v_mode text;
begin
  if p_stripe_account_id is null
     or p_stripe_account_id !~ '^acct_[A-Za-z0-9]{8,}$'
     or p_livemode is null then
    raise exception 'direct refund Merchant account and livemode are required' using errcode = '22023';
  end if;
  if p_operation_id is null
     or pg_catalog.length(pg_catalog.btrim(p_operation_id)) not between 1 and 160 then
    raise exception 'direct refund operation ID must contain between 1 and 160 characters'
      using errcode = '22023';
  end if;

  select a.* into v_authorization
    from public.billing_direct_refund_authorizations a
   where a.id = p_authorization_id;
  if not found then
    raise exception 'direct refund authorization was not found' using errcode = 'P0002';
  end if;

  select p.* into v_payment
    from public.payments p
   where p.id = p_payment_id
     and p.account_id = p_account_id;
  if not found then
    raise exception 'direct refund payment was not found in the requested account' using errcode = 'P0002';
  end if;

  if v_authorization.account_id is distinct from p_account_id
     or v_authorization.payment_id is distinct from p_payment_id
     or v_authorization.charge_model <> 'direct'
     or v_authorization.stripe_account_id is distinct from p_stripe_account_id
     or v_authorization.livemode is distinct from p_livemode
     or v_payment.charge_model <> 'direct'
     or v_payment.stripe_account_id is distinct from p_stripe_account_id
     or v_payment.stripe_livemode is distinct from p_livemode
     or v_payment.stripe_payment_intent is distinct from v_authorization.stripe_payment_intent_id
     or v_payment.stripe_charge_id is distinct from v_authorization.stripe_charge_id
     or v_payment.stripe_application_fee_id is distinct from v_authorization.stripe_application_fee_id then
    raise exception 'direct refund authorization does not exactly match payment/Stripe provenance'
      using errcode = '22000';
  end if;

  if not exists (
    select 1
      from public.accounts a
     where a.id = p_account_id
       and a.stripe_merchant_account_id = p_stripe_account_id
       and a.merchant_livemode = p_livemode
  ) then
    raise exception 'direct refund connected-account binding is no longer valid'
      using errcode = '55000';
  end if;

  select d.* into v_existing
    from public.billing_direct_refund_operations d
    join public.billing_payment_operations o on o.id = d.operation_pk
   where d.authorization_id = p_authorization_id;
  if found then
    select o.* into v_existing_operation
      from public.billing_payment_operations o
     where o.id = v_existing.operation_pk;
    if not found then
      raise exception 'direct refund detail is missing its durable operation'
        using errcode = 'P0001';
    end if;
    if v_existing_operation.account_id is distinct from p_account_id
       or v_existing_operation.payment_id is distinct from p_payment_id
       or v_existing_operation.operation_type <> 'direct_refund.create'
       or v_existing_operation.operation_id is distinct from pg_catalog.btrim(p_operation_id)
       or v_existing_operation.stripe_account_id is distinct from p_stripe_account_id
       or v_existing_operation.livemode is distinct from p_livemode
       or v_existing.charge_model <> 'direct' then
      raise exception 'direct refund authorization was already consumed by a different operation'
        using errcode = '22000';
    end if;

    if v_existing_operation.state = 'succeeded' then
      -- A later serialized refund may have advanced the payment beyond this
      -- operation's frozen target. Preserve replay for the older succeeded
      -- operation, but fail closed if any cumulative total moved backward.
      if v_payment.refunded_amount is null
         or v_payment.refunded_amount < v_existing.cumulative_gross_after_cents::numeric / 100
         or v_payment.eligible_service_refunded_amount is null
         or v_payment.eligible_service_refunded_amount < v_existing.cumulative_eligible_after_cents::numeric / 100
         or v_payment.platform_fee_refunded is null
         or v_payment.platform_fee_refunded < v_existing.application_fee_refund_after_cents::numeric / 100 then
        raise exception 'succeeded direct refund is ahead of payment cumulative totals'
          using errcode = 'P0001';
      end if;
    elsif v_payment.refunded_amount is distinct from v_existing.cumulative_gross_before_cents::numeric / 100
       or v_payment.eligible_service_refunded_amount is distinct from v_existing.cumulative_eligible_before_cents::numeric / 100
       or v_payment.platform_fee_refunded is distinct from v_existing.application_fee_refund_before_cents::numeric / 100 then
      raise exception 'active direct refund payment totals changed outside its serialized operation'
        using errcode = 'P0001';
    end if;

    return query select
      v_existing.authorization_id,
      v_existing.allocation_policy,
      v_existing.allocation_version,
      v_existing.allocation_fingerprint,
      v_existing.stripe_payment_intent_id,
      v_existing.stripe_charge_id,
      v_existing.stripe_application_fee_id,
      v_existing.refund_reason,
      v_existing.refund_mode,
      v_existing.gross_refund_cents,
      v_existing.eligible_service_refund_cents,
      v_existing.cumulative_gross_before_cents,
      v_existing.cumulative_gross_after_cents,
      v_existing.cumulative_eligible_before_cents,
      v_existing.cumulative_eligible_after_cents,
      v_existing.application_fee_total_cents,
      v_existing.application_fee_refund_before_cents,
      v_existing.application_fee_refund_after_cents,
      v_existing.application_fee_refund_cents;
    return;
  end if;

  if exists (
    select 1
      from public.billing_payment_operations o
     where o.account_id = p_account_id
       and o.operation_type = 'direct_refund.create'
       and o.operation_id = pg_catalog.btrim(p_operation_id)
  ) then
    raise exception 'direct refund operation ID was already claimed without this authorization'
      using errcode = '22000';
  end if;

  if v_authorization.expires_at <= pg_catalog.now() then
    raise exception 'direct refund authorization has expired' using errcode = '55000';
  end if;
  if v_payment.status::text <> 'paid'
     or v_payment.paid_at is null
     or v_payment.stripe_dispute_id is not null
     or v_payment.disputed_at is not null
     or v_payment.reconciliation_status <> 'reconciled'
     or v_payment.reconciled_at is null then
    raise exception 'direct refund requires a paid, undisputed, reconciled payment'
      using errcode = '55000';
  end if;
  if v_payment.amount is null
     or v_payment.amount <> pg_catalog.round(v_payment.amount, 2)
     or v_payment.fee_basis_amount is null
     or v_payment.fee_basis_amount <> pg_catalog.round(v_payment.fee_basis_amount, 2)
     or v_payment.platform_fee is null
     or v_payment.platform_fee <> pg_catalog.round(v_payment.platform_fee, 2)
     or v_payment.refunded_amount is null
     or v_payment.refunded_amount <> pg_catalog.round(v_payment.refunded_amount, 2)
     or v_payment.eligible_service_refunded_amount is null
     or v_payment.eligible_service_refunded_amount <> pg_catalog.round(v_payment.eligible_service_refunded_amount, 2)
     or v_payment.platform_fee_refunded is null
     or v_payment.platform_fee_refunded <> pg_catalog.round(v_payment.platform_fee_refunded, 2)
     or v_payment.fee_rate_bps is null
     or v_payment.fee_rate_bps not between 0 and 10000
     or v_payment.fee_rate is distinct from v_payment.fee_rate_bps::numeric / 10000
     or v_payment.fee_plan_code is null
     or v_payment.fee_catalog_version is null
     or v_payment.stripe_payment_intent !~ '^pi_[A-Za-z0-9_]+$'
     or v_payment.stripe_charge_id !~ '^ch_[A-Za-z0-9_]+$' then
    raise exception 'direct refund payment provenance is incomplete or not cent-exact'
      using errcode = '22000';
  end if;

  v_gross_total := pg_catalog.round(v_payment.amount * 100)::bigint;
  v_eligible_total := pg_catalog.round(v_payment.fee_basis_amount * 100)::bigint;
  v_fee_total := pg_catalog.round(v_payment.platform_fee * 100)::bigint;
  v_gross_before := pg_catalog.round(v_payment.refunded_amount * 100)::bigint;
  v_eligible_before := pg_catalog.round(v_payment.eligible_service_refunded_amount * 100)::bigint;
  v_fee_before := pg_catalog.round(v_payment.platform_fee_refunded * 100)::bigint;

  if (v_fee_total > 0 and (
       v_payment.stripe_application_fee_id is null
       or v_payment.stripe_application_fee_id !~ '^fee_[A-Za-z0-9_]+$'
     ))
     or (v_fee_total = 0 and v_payment.stripe_application_fee_id is not null) then
    raise exception 'direct refund Application Fee provenance does not match the fee snapshot'
      using errcode = '22000';
  end if;
  if v_gross_before < 0 or v_gross_before > v_gross_total
     or v_eligible_before < 0 or v_eligible_before > v_eligible_total then
    raise exception 'direct refund cumulative payment amounts are out of bounds'
      using errcode = '22000';
  end if;

  -- Cumulative target rounding is based only on the eligible-service subtotal.
  -- Gross (which may contain tax) is intentionally absent from this formula.
  if v_eligible_before = v_eligible_total then
    if v_fee_before <> v_fee_total then
      raise exception 'fully returned eligible subtotal must reconcile to the entire Application Fee'
        using errcode = '22000';
    end if;
  elsif v_fee_before <> pg_catalog.round(
    v_eligible_before::numeric * v_payment.fee_rate_bps::numeric / 10000
  )::bigint then
    raise exception 'prior Application Fee refunds do not match cumulative eligible-service rounding'
      using errcode = '22000';
  end if;

  v_gross_after := v_gross_before + v_authorization.gross_refund_cents;
  v_eligible_after := v_eligible_before + v_authorization.eligible_service_refund_cents;
  if v_gross_after > v_gross_total or v_eligible_after > v_eligible_total then
    raise exception 'direct refund authorization exceeds the remaining payment allocation'
      using errcode = '22000';
  end if;
  if v_gross_after = v_gross_total and v_eligible_after <> v_eligible_total then
    raise exception 'a full gross refund must return the entire remaining eligible-service subtotal'
      using errcode = '22000';
  end if;

  v_fee_after := case
    when v_eligible_after = v_eligible_total then v_fee_total
    else pg_catalog.round(
      v_eligible_after::numeric * v_payment.fee_rate_bps::numeric / 10000
    )::bigint
  end;
  if v_fee_after < v_fee_before then
    raise exception 'direct refund Application Fee target cannot move backward' using errcode = '22000';
  end if;

  v_mode := case
    when v_gross_after = v_gross_total
      and v_eligible_after = v_eligible_total
      and v_fee_after > v_fee_before
    then 'full_combined'
    else 'split'
  end;

  return query select
    v_authorization.id,
    v_authorization.allocation_policy,
    v_authorization.allocation_version,
    v_authorization.allocation_fingerprint,
    v_authorization.stripe_payment_intent_id,
    v_authorization.stripe_charge_id,
    v_authorization.stripe_application_fee_id,
    v_authorization.refund_reason,
    v_mode,
    v_authorization.gross_refund_cents,
    v_authorization.eligible_service_refund_cents,
    v_gross_before,
    v_gross_after,
    v_eligible_before,
    v_eligible_after,
    v_fee_total,
    v_fee_before,
    v_fee_after,
    v_fee_after - v_fee_before;
end;
$$;

revoke all on function public.compute_direct_charge_refund_plan(
  uuid, uuid, text, boolean, uuid, text
) from public, anon, authenticated, service_role;

create or replace function public.plan_direct_charge_refund_operation(
  p_account_id uuid,
  p_payment_id uuid,
  p_stripe_account_id text,
  p_livemode boolean,
  p_authorization_id uuid,
  p_operation_id text
)
returns table (
  authorization_id uuid,
  allocation_policy text,
  allocation_version text,
  allocation_fingerprint text,
  stripe_payment_intent_id text,
  stripe_charge_id text,
  stripe_application_fee_id text,
  refund_reason text,
  refund_mode text,
  gross_refund_cents bigint,
  eligible_service_refund_cents bigint,
  cumulative_gross_before_cents bigint,
  cumulative_gross_after_cents bigint,
  cumulative_eligible_before_cents bigint,
  cumulative_eligible_after_cents bigint,
  application_fee_total_cents bigint,
  application_fee_refund_before_cents bigint,
  application_fee_refund_after_cents bigint,
  application_fee_refund_cents bigint
)
language sql
security definer
set search_path = pg_catalog, pg_temp
as $$
  select *
    from public.compute_direct_charge_refund_plan(
      p_account_id, p_payment_id, p_stripe_account_id, p_livemode,
      p_authorization_id, p_operation_id
    );
$$;

revoke all on function public.plan_direct_charge_refund_operation(
  uuid, uuid, text, boolean, uuid, text
) from public, anon, authenticated, service_role;
grant execute on function public.plan_direct_charge_refund_operation(
  uuid, uuid, text, boolean, uuid, text
) to service_role;

create or replace function public.claim_direct_charge_refund_operation(
  p_account_id uuid,
  p_payment_id uuid,
  p_stripe_account_id text,
  p_livemode boolean,
  p_authorization_id uuid,
  p_operation_id text,
  p_expected_allocation_fingerprint text,
  p_expected_gross_refund_cents bigint,
  p_expected_eligible_service_refund_cents bigint,
  p_expected_cumulative_gross_before_cents bigint,
  p_expected_cumulative_eligible_before_cents bigint,
  p_charge_operation_id text,
  p_charge_idempotency_key text,
  p_charge_request_fingerprint text,
  p_application_fee_operation_id text,
  p_application_fee_idempotency_key text,
  p_application_fee_request_fingerprint text,
  p_operation_fingerprint text
)
returns table (
  claim_status text,
  operation_pk uuid,
  claim_token uuid,
  operation_state text,
  operation_phase text,
  authorization_id uuid,
  allocation_policy text,
  allocation_version text,
  allocation_fingerprint text,
  stripe_payment_intent_id text,
  stripe_charge_id text,
  stripe_application_fee_id text,
  refund_reason text,
  refund_mode text,
  gross_refund_cents bigint,
  eligible_service_refund_cents bigint,
  cumulative_gross_before_cents bigint,
  cumulative_gross_after_cents bigint,
  cumulative_eligible_before_cents bigint,
  cumulative_eligible_after_cents bigint,
  application_fee_total_cents bigint,
  application_fee_refund_before_cents bigint,
  application_fee_refund_after_cents bigint,
  application_fee_refund_cents bigint,
  stripe_refund_id text,
  stripe_refund_result jsonb,
  stripe_application_fee_refund_id text,
  stripe_application_fee_refund_result jsonb
)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_plan record;
  v_operation public.billing_payment_operations%rowtype;
  v_detail public.billing_direct_refund_operations%rowtype;
  v_claim_token uuid := pg_catalog.gen_random_uuid();
  v_claim_status text;
begin
  if p_expected_allocation_fingerprint !~ '^[0-9a-f]{64}$'
     or p_charge_request_fingerprint !~ '^[0-9a-f]{64}$'
     or p_operation_fingerprint !~ '^[0-9a-f]{64}$'
     or p_charge_idempotency_key !~ '^lgq:direct:v1:refund[.]create:[0-9a-f]{64}$'
     or p_charge_operation_id is null
     or pg_catalog.length(pg_catalog.btrim(p_charge_operation_id)) not between 1 and 200 then
    raise exception 'invalid direct refund fingerprint/idempotency identity' using errcode = '22023';
  end if;

  -- Every refund RPC uses account, payment, authorization, operation, detail.
  -- The consistent order serializes cumulative targets without a long provider
  -- transaction: Stripe is contacted only after this RPC has committed.
  perform 1
    from public.accounts a
   where a.id = p_account_id
     and a.stripe_merchant_account_id = p_stripe_account_id
     and a.merchant_livemode = p_livemode
   for share;
  if not found then
    raise exception 'direct refund connected-account binding was not found' using errcode = 'P0002';
  end if;

  perform 1
    from public.payments p
   where p.id = p_payment_id
     and p.account_id = p_account_id
   for update;
  if not found then
    raise exception 'direct refund payment was not found' using errcode = 'P0002';
  end if;

  perform 1
    from public.billing_direct_refund_authorizations a
   where a.id = p_authorization_id
   for share;
  if not found then
    raise exception 'direct refund authorization was not found' using errcode = 'P0002';
  end if;

  select * into v_plan
    from public.compute_direct_charge_refund_plan(
      p_account_id, p_payment_id, p_stripe_account_id, p_livemode,
      p_authorization_id, p_operation_id
    );

  if v_plan.allocation_fingerprint is distinct from p_expected_allocation_fingerprint
     or v_plan.gross_refund_cents is distinct from p_expected_gross_refund_cents
     or v_plan.eligible_service_refund_cents is distinct from p_expected_eligible_service_refund_cents
     or v_plan.cumulative_gross_before_cents is distinct from p_expected_cumulative_gross_before_cents
     or v_plan.cumulative_eligible_before_cents is distinct from p_expected_cumulative_eligible_before_cents then
    raise exception 'direct refund plan changed between authorization read and durable claim'
      using errcode = '40001';
  end if;

  if v_plan.refund_mode = 'split' and v_plan.application_fee_refund_cents > 0 then
    if p_application_fee_operation_id is null
       or pg_catalog.length(pg_catalog.btrim(p_application_fee_operation_id)) not between 1 and 200
       or p_application_fee_idempotency_key !~ '^lgq:direct:v1:application_fee_refund[.]create:[0-9a-f]{64}$'
       or p_application_fee_request_fingerprint !~ '^[0-9a-f]{64}$'
       or v_plan.stripe_application_fee_id is null then
      raise exception 'split direct refund is missing exact Application Fee Refund identity'
        using errcode = '22023';
    end if;
  elsif p_application_fee_operation_id is not null
     or p_application_fee_idempotency_key is not null
     or p_application_fee_request_fingerprint is not null then
    raise exception 'direct refund must not submit an unneeded Application Fee Refund'
      using errcode = '22023';
  end if;

  select d.* into v_detail
    from public.billing_direct_refund_operations d
   where d.authorization_id = p_authorization_id;

  if found then
    select o.* into v_operation
      from public.billing_payment_operations o
     where o.id = v_detail.operation_pk
     for update;
    select d.* into v_detail
      from public.billing_direct_refund_operations d
     where d.operation_pk = v_operation.id
     for update;
  end if;

  if not found then
    select o into v_operation
      from public.billing_payment_operations o
     where o.account_id = p_account_id
       and o.operation_type = 'direct_refund.create'
       and o.operation_id = pg_catalog.btrim(p_operation_id)
     for update;
    if found then
      select d into v_detail
        from public.billing_direct_refund_operations d
       where d.operation_pk = v_operation.id
       for update;
      if not found then
        raise exception 'direct refund ledger operation is missing its bound detail row'
          using errcode = 'P0001';
      end if;
    end if;
  end if;

  if v_operation.id is null then
    if exists (
      select 1
        from public.billing_payment_operations o
       where o.payment_id = p_payment_id
         and o.operation_type = 'direct_refund.create'
         and o.state in ('claimed', 'submitted', 'indeterminate')
    ) then
      raise exception 'another direct refund is active or requires reconciliation for this payment'
        using errcode = '55000';
    end if;

    insert into public.billing_payment_operations (
      account_id,
      payment_id,
      operation_type,
      operation_id,
      charge_model,
      stripe_account_id,
      livemode,
      stripe_idempotency_key,
      request_fingerprint,
      state,
      attempt_count,
      claim_token,
      lease_expires_at,
      metadata
    ) values (
      p_account_id,
      p_payment_id,
      'direct_refund.create',
      pg_catalog.btrim(p_operation_id),
      'direct',
      p_stripe_account_id,
      p_livemode,
      p_charge_idempotency_key,
      p_operation_fingerprint,
      'claimed',
      0,
      v_claim_token,
      pg_catalog.now() + interval '5 minutes',
      pg_catalog.jsonb_build_object(
        'schema', 'direct_charge_refund_v1',
        'authorization_id', p_authorization_id,
        'allocation_policy', v_plan.allocation_policy,
        'allocation_version', v_plan.allocation_version,
        'allocation_fingerprint', v_plan.allocation_fingerprint,
        'gross_refund_cents', v_plan.gross_refund_cents,
        'eligible_service_refund_cents', v_plan.eligible_service_refund_cents,
        'application_fee_refund_cents', v_plan.application_fee_refund_cents,
        'refund_mode', v_plan.refund_mode
      )
    ) returning * into v_operation;

    insert into public.billing_direct_refund_operations (
      operation_pk,
      authorization_id,
      account_id,
      payment_id,
      charge_model,
      stripe_account_id,
      livemode,
      stripe_payment_intent_id,
      stripe_charge_id,
      stripe_application_fee_id,
      allocation_policy,
      allocation_version,
      allocation_fingerprint,
      refund_reason,
      refund_mode,
      gross_refund_cents,
      eligible_service_refund_cents,
      cumulative_gross_before_cents,
      cumulative_gross_after_cents,
      cumulative_eligible_before_cents,
      cumulative_eligible_after_cents,
      application_fee_total_cents,
      application_fee_refund_before_cents,
      application_fee_refund_after_cents,
      application_fee_refund_cents,
      charge_operation_id,
      charge_idempotency_key,
      charge_request_fingerprint,
      application_fee_operation_id,
      application_fee_idempotency_key,
      application_fee_request_fingerprint,
      phase
    ) values (
      v_operation.id,
      p_authorization_id,
      p_account_id,
      p_payment_id,
      'direct',
      p_stripe_account_id,
      p_livemode,
      v_plan.stripe_payment_intent_id,
      v_plan.stripe_charge_id,
      v_plan.stripe_application_fee_id,
      v_plan.allocation_policy,
      v_plan.allocation_version,
      v_plan.allocation_fingerprint,
      v_plan.refund_reason,
      v_plan.refund_mode,
      v_plan.gross_refund_cents,
      v_plan.eligible_service_refund_cents,
      v_plan.cumulative_gross_before_cents,
      v_plan.cumulative_gross_after_cents,
      v_plan.cumulative_eligible_before_cents,
      v_plan.cumulative_eligible_after_cents,
      v_plan.application_fee_total_cents,
      v_plan.application_fee_refund_before_cents,
      v_plan.application_fee_refund_after_cents,
      v_plan.application_fee_refund_cents,
      pg_catalog.btrim(p_charge_operation_id),
      p_charge_idempotency_key,
      p_charge_request_fingerprint,
      case when p_application_fee_operation_id is null then null
        else pg_catalog.btrim(p_application_fee_operation_id) end,
      p_application_fee_idempotency_key,
      p_application_fee_request_fingerprint,
      'charge_ready'
    ) returning * into v_detail;

    v_claim_status := 'claimed';
  else
    if v_operation.account_id is distinct from p_account_id
       or v_operation.payment_id is distinct from p_payment_id
       or v_operation.operation_type <> 'direct_refund.create'
       or v_operation.operation_id is distinct from pg_catalog.btrim(p_operation_id)
       or v_operation.charge_model <> 'direct'
       or v_operation.stripe_account_id is distinct from p_stripe_account_id
       or v_operation.livemode is distinct from p_livemode
       or v_operation.stripe_idempotency_key is distinct from p_charge_idempotency_key
       or v_operation.request_fingerprint is distinct from p_operation_fingerprint
       or v_detail.authorization_id is distinct from p_authorization_id
       or v_detail.allocation_fingerprint is distinct from p_expected_allocation_fingerprint
       or v_detail.charge_operation_id is distinct from pg_catalog.btrim(p_charge_operation_id)
       or v_detail.charge_idempotency_key is distinct from p_charge_idempotency_key
       or v_detail.charge_request_fingerprint is distinct from p_charge_request_fingerprint
       or v_detail.application_fee_operation_id is distinct from p_application_fee_operation_id
       or v_detail.application_fee_idempotency_key is distinct from p_application_fee_idempotency_key
       or v_detail.application_fee_request_fingerprint is distinct from p_application_fee_request_fingerprint then
      raise exception 'direct refund operation was already claimed with different immutable input'
        using errcode = '22000';
    end if;

    if v_operation.state = 'succeeded' and v_detail.phase = 'succeeded' then
      if v_operation.provider_object_id is null
         or v_operation.provider_object_id is distinct from v_detail.stripe_refund_id
         or v_detail.stripe_refund_result is null then
        raise exception 'succeeded direct refund is missing its durable provider result'
          using errcode = 'P0001';
      end if;
      v_claim_status := 'replay';
    elsif v_operation.state = 'claimed' and v_detail.phase = 'charge_ready' then
      if v_operation.lease_expires_at <= pg_catalog.now() then
        update public.billing_payment_operations o
           set claim_token = v_claim_token,
               lease_expires_at = pg_catalog.now() + interval '5 minutes',
               last_error = null
         where o.id = v_operation.id
        returning * into v_operation;
        v_claim_status := 'claimed';
      else
        v_claim_status := 'in_progress';
      end if;
    elsif v_operation.state = 'submitted' and v_detail.phase = 'fee_ready' then
      if v_operation.claim_token is null
         or v_operation.lease_expires_at is null
         or v_operation.lease_expires_at <= pg_catalog.now() then
        update public.billing_payment_operations o
           set claim_token = v_claim_token,
               lease_expires_at = pg_catalog.now() + interval '5 minutes',
               last_error = null
         where o.id = v_operation.id
        returning * into v_operation;
        v_claim_status := 'fee_ready';
      else
        v_claim_status := 'in_progress';
      end if;
    elsif v_operation.state = 'indeterminate' or v_detail.phase = 'indeterminate' then
      v_claim_status := 'indeterminate';
    elsif v_operation.state = 'failed' or v_detail.phase = 'failed' then
      v_claim_status := 'failed';
    else
      -- charge_submitted and fee_submitted are never reclaimed. A lost provider
      -- response must be reconciled; Stripe's idempotency window is not proof.
      v_claim_status := 'submitted';
    end if;
  end if;

  select o.* into v_operation
    from public.billing_payment_operations o
   where o.id = v_operation.id;
  select d.* into v_detail
    from public.billing_direct_refund_operations d
   where d.operation_pk = v_operation.id;

  return query select
    v_claim_status,
    v_operation.id,
    case when v_claim_status in ('claimed', 'fee_ready') then v_operation.claim_token else null end,
    v_operation.state,
    v_detail.phase,
    v_detail.authorization_id,
    v_detail.allocation_policy,
    v_detail.allocation_version,
    v_detail.allocation_fingerprint,
    v_detail.stripe_payment_intent_id,
    v_detail.stripe_charge_id,
    v_detail.stripe_application_fee_id,
    v_detail.refund_reason,
    v_detail.refund_mode,
    v_detail.gross_refund_cents,
    v_detail.eligible_service_refund_cents,
    v_detail.cumulative_gross_before_cents,
    v_detail.cumulative_gross_after_cents,
    v_detail.cumulative_eligible_before_cents,
    v_detail.cumulative_eligible_after_cents,
    v_detail.application_fee_total_cents,
    v_detail.application_fee_refund_before_cents,
    v_detail.application_fee_refund_after_cents,
    v_detail.application_fee_refund_cents,
    v_detail.stripe_refund_id,
    v_detail.stripe_refund_result,
    v_detail.stripe_application_fee_refund_id,
    v_detail.stripe_application_fee_refund_result;
end;
$$;

revoke all on function public.claim_direct_charge_refund_operation(
  uuid, uuid, text, boolean, uuid, text, text, bigint, bigint, bigint, bigint,
  text, text, text, text, text, text, text
) from public, anon, authenticated, service_role;
grant execute on function public.claim_direct_charge_refund_operation(
  uuid, uuid, text, boolean, uuid, text, text, bigint, bigint, bigint, bigint,
  text, text, text, text, text, text, text
) to service_role;

create or replace function public.begin_direct_charge_refund_submission(
  p_operation_pk uuid,
  p_claim_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_hint public.billing_payment_operations%rowtype;
  v_detail_hint public.billing_direct_refund_operations%rowtype;
  v_operation public.billing_payment_operations%rowtype;
  v_detail public.billing_direct_refund_operations%rowtype;
  v_payment public.payments%rowtype;
begin
  select o.* into v_hint
    from public.billing_payment_operations o
   where o.id = p_operation_pk;
  select d.* into v_detail_hint
    from public.billing_direct_refund_operations d
   where d.operation_pk = p_operation_pk;
  if v_hint.id is null or v_detail_hint.operation_pk is null
     or v_hint.operation_type <> 'direct_refund.create' then
    raise exception 'direct refund operation was not found' using errcode = 'P0002';
  end if;

  perform 1
    from public.accounts a
   where a.id = v_hint.account_id
     and a.stripe_merchant_account_id = v_hint.stripe_account_id
     and a.merchant_livemode = v_hint.livemode
   for share;
  if not found then
    raise exception 'direct refund connected-account binding is no longer valid'
      using errcode = '55000';
  end if;
  select p.* into v_payment
    from public.payments p
   where p.id = v_hint.payment_id
     and p.account_id = v_hint.account_id
   for share;
  perform 1
    from public.billing_direct_refund_authorizations a
   where a.id = v_detail_hint.authorization_id
   for share;
  select o.* into v_operation
    from public.billing_payment_operations o
   where o.id = p_operation_pk
   for update;
  select d.* into v_detail
    from public.billing_direct_refund_operations d
   where d.operation_pk = p_operation_pk
   for update;

  if v_payment.id is null
     or v_payment.charge_model <> 'direct'
     or v_payment.stripe_account_id is distinct from v_operation.stripe_account_id
     or v_payment.stripe_livemode is distinct from v_operation.livemode
     or v_payment.stripe_payment_intent is distinct from v_detail.stripe_payment_intent_id
     or v_payment.stripe_charge_id is distinct from v_detail.stripe_charge_id
     or v_payment.stripe_application_fee_id is distinct from v_detail.stripe_application_fee_id
     or v_payment.status::text <> 'paid'
     or v_payment.paid_at is null
     or v_payment.stripe_dispute_id is not null
     or v_payment.disputed_at is not null
     or v_payment.reconciliation_status <> 'reconciled'
     or v_payment.reconciled_at is null
     or v_payment.refunded_amount is distinct from v_detail.cumulative_gross_before_cents::numeric / 100
     or v_payment.eligible_service_refunded_amount is distinct from v_detail.cumulative_eligible_before_cents::numeric / 100
     or v_payment.platform_fee_refunded is distinct from v_detail.application_fee_refund_before_cents::numeric / 100 then
    raise exception 'direct refund payment is no longer charge-submit-ready'
      using errcode = '55000';
  end if;
  if v_operation.state <> 'claimed'
     or v_detail.phase <> 'charge_ready'
     or v_operation.claim_token is distinct from p_claim_token
     or v_operation.lease_expires_at is null
     or v_operation.lease_expires_at <= pg_catalog.now() then
    raise exception 'direct charge refund claim is not owned or has expired'
      using errcode = '55000';
  end if;

  update public.billing_payment_operations o
     set state = 'submitted',
         submission_started_at = pg_catalog.now(),
         attempt_count = o.attempt_count + 1,
         lease_expires_at = null,
         last_error = null
   where o.id = p_operation_pk;
  update public.billing_direct_refund_operations d
     set phase = 'charge_submitted',
         charge_submission_started_at = pg_catalog.now()
   where d.operation_pk = p_operation_pk;
  return true;
end;
$$;

revoke all on function public.begin_direct_charge_refund_submission(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.begin_direct_charge_refund_submission(uuid, uuid)
  to service_role;

-- Internal atomic accounting transition shared by the combined/no-fee and
-- explicit Application Fee Refund completion paths. No API role can call it.
create or replace function public.apply_direct_refund_accounting(p_operation_pk uuid)
returns void
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
declare
  v_detail public.billing_direct_refund_operations%rowtype;
  v_payment public.payments%rowtype;
  v_updated integer;
begin
  select d.* into v_detail
    from public.billing_direct_refund_operations d
   where d.operation_pk = p_operation_pk;
  if not found then
    raise exception 'direct refund detail was not found' using errcode = 'P0002';
  end if;

  select p.* into v_payment
    from public.payments p
   where p.id = v_detail.payment_id
     and p.account_id = v_detail.account_id
   for update;
  if not found
     or v_payment.charge_model <> 'direct'
     or v_payment.stripe_account_id is distinct from v_detail.stripe_account_id
     or v_payment.stripe_livemode is distinct from v_detail.livemode
     or v_payment.stripe_payment_intent is distinct from v_detail.stripe_payment_intent_id
     or v_payment.stripe_charge_id is distinct from v_detail.stripe_charge_id
     or v_payment.stripe_application_fee_id is distinct from v_detail.stripe_application_fee_id
     or v_payment.refunded_amount is distinct from v_detail.cumulative_gross_before_cents::numeric / 100
     or v_payment.eligible_service_refunded_amount is distinct from v_detail.cumulative_eligible_before_cents::numeric / 100
     or v_payment.platform_fee_refunded is distinct from v_detail.application_fee_refund_before_cents::numeric / 100 then
    raise exception 'direct refund accounting no longer matches its serialized payment snapshot'
      using errcode = 'P0001';
  end if;

  update public.payments p
     set refunded_amount = v_detail.cumulative_gross_after_cents::numeric / 100,
         eligible_service_refunded_amount = v_detail.cumulative_eligible_after_cents::numeric / 100,
         platform_fee_refunded = v_detail.application_fee_refund_after_cents::numeric / 100,
         refunded_at = pg_catalog.now(),
         status = case
           when v_detail.cumulative_gross_after_cents = pg_catalog.round(p.amount * 100)::bigint
           then 'refunded'::public.payment_status
           else 'paid'::public.payment_status
         end,
         stripe_latest_refund_id = v_detail.stripe_refund_id,
         stripe_latest_application_fee_refund_id = coalesce(
           v_detail.stripe_application_fee_refund_id,
           p.stripe_latest_application_fee_refund_id
         ),
         reconciliation_status = 'pending',
         reconciled_at = null
   where p.id = v_detail.payment_id
     and p.account_id = v_detail.account_id;
  get diagnostics v_updated = row_count;
  if v_updated <> 1 then
    raise exception 'direct refund accounting update did not affect exactly one payment'
      using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function public.apply_direct_refund_accounting(uuid)
  from public, anon, authenticated, service_role;

create or replace function public.record_direct_charge_refund_result(
  p_operation_pk uuid,
  p_claim_token uuid,
  p_stripe_refund_id text,
  p_stripe_refund_result jsonb
)
returns table (next_action text, claim_token uuid)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_hint public.billing_payment_operations%rowtype;
  v_detail_hint public.billing_direct_refund_operations%rowtype;
  v_operation public.billing_payment_operations%rowtype;
  v_detail public.billing_direct_refund_operations%rowtype;
  v_payment public.payments%rowtype;
  v_status text;
  v_fee_claim_token uuid;
begin
  if p_stripe_refund_id is null
     or p_stripe_refund_id !~ '^re_[A-Za-z0-9_]+$'
     or pg_catalog.jsonb_typeof(p_stripe_refund_result) <> 'object'
     or p_stripe_refund_result->>'id' is distinct from p_stripe_refund_id
     or p_stripe_refund_result->>'amount' is null
     or p_stripe_refund_result->>'amount' !~ '^[0-9]+$'
     or p_stripe_refund_result->>'currency' is distinct from 'usd' then
    raise exception 'invalid Stripe Refund provider result' using errcode = '22023';
  end if;

  select o.* into v_hint
    from public.billing_payment_operations o
   where o.id = p_operation_pk;
  select d.* into v_detail_hint
    from public.billing_direct_refund_operations d
   where d.operation_pk = p_operation_pk;
  if v_hint.id is null or v_detail_hint.operation_pk is null
     or v_hint.operation_type <> 'direct_refund.create' then
    raise exception 'direct refund operation was not found' using errcode = 'P0002';
  end if;

  perform 1 from public.accounts a where a.id = v_hint.account_id for share;
  select p.* into v_payment
    from public.payments p
   where p.id = v_hint.payment_id
     and p.account_id = v_hint.account_id
   for update;
  perform 1
    from public.billing_direct_refund_authorizations a
   where a.id = v_detail_hint.authorization_id
   for share;
  select o.* into v_operation
    from public.billing_payment_operations o
   where o.id = p_operation_pk
   for update;
  select d.* into v_detail
    from public.billing_direct_refund_operations d
   where d.operation_pk = p_operation_pk
   for update;

  if v_operation.state <> 'submitted'
     or v_detail.phase <> 'charge_submitted'
     or v_operation.claim_token is distinct from p_claim_token then
    raise exception 'direct charge refund submission is not owned by this claim'
      using errcode = '55000';
  end if;
  if v_payment.id is null
     or v_payment.refunded_amount is distinct from v_detail.cumulative_gross_before_cents::numeric / 100
     or v_payment.eligible_service_refunded_amount is distinct from v_detail.cumulative_eligible_before_cents::numeric / 100
     or v_payment.platform_fee_refunded is distinct from v_detail.application_fee_refund_before_cents::numeric / 100
     or (p_stripe_refund_result->>'amount')::bigint <> v_detail.gross_refund_cents
     or p_stripe_refund_result->>'charge' is distinct from v_detail.stripe_charge_id
     or p_stripe_refund_result->>'payment_intent' is distinct from v_detail.stripe_payment_intent_id then
    raise exception 'Stripe Refund result does not exactly match its payment/charge operation'
      using errcode = 'P0001';
  end if;

  v_status := p_stripe_refund_result->>'status';
  if v_status is null or v_status not in (
    'succeeded', 'pending', 'requires_action', 'failed', 'canceled'
  ) then
    raise exception 'Stripe Refund returned an unsupported status' using errcode = '22023';
  end if;

  update public.billing_direct_refund_operations d
     set stripe_refund_id = p_stripe_refund_id,
         stripe_refund_result = p_stripe_refund_result,
         charge_result_recorded_at = pg_catalog.now()
   where d.operation_pk = p_operation_pk;
  update public.billing_payment_operations o
     set provider_object_id = p_stripe_refund_id
   where o.id = p_operation_pk;

  if v_status in ('pending', 'requires_action') then
    update public.billing_direct_refund_operations d
       set phase = 'indeterminate', indeterminate_step = 'charge'
     where d.operation_pk = p_operation_pk;
    update public.billing_payment_operations o
       set state = 'indeterminate',
           claim_token = null,
           lease_expires_at = null,
           last_error = 'Stripe Refund status requires reconciliation: ' || v_status
     where o.id = p_operation_pk;
    return query select 'reconcile'::text, null::uuid;
    return;
  end if;

  if v_status in ('failed', 'canceled') then
    update public.billing_direct_refund_operations d
       set phase = 'failed'
     where d.operation_pk = p_operation_pk;
    update public.billing_payment_operations o
       set state = 'failed',
           completed_at = pg_catalog.now(),
           claim_token = null,
           lease_expires_at = null,
           last_error = 'Stripe Refund returned terminal status: ' || v_status
     where o.id = p_operation_pk;
    return query select 'failed'::text, null::uuid;
    return;
  end if;

  if v_detail.refund_mode = 'full_combined'
     or v_detail.application_fee_refund_cents = 0 then
    perform public.apply_direct_refund_accounting(p_operation_pk);
    update public.billing_direct_refund_operations d
       set phase = 'succeeded'
     where d.operation_pk = p_operation_pk;
    update public.billing_payment_operations o
       set state = 'succeeded',
           completed_at = pg_catalog.now(),
           claim_token = null,
           lease_expires_at = null,
           last_error = null
     where o.id = p_operation_pk;
    return query select 'complete'::text, null::uuid;
    return;
  end if;

  -- The charge mutation is durably known. A new token owns only the distinct
  -- platform Application Fee Refund step; no path can submit the charge again.
  v_fee_claim_token := pg_catalog.gen_random_uuid();
  update public.billing_direct_refund_operations d
     set phase = 'fee_ready'
   where d.operation_pk = p_operation_pk;
  update public.billing_payment_operations o
     set claim_token = v_fee_claim_token,
         lease_expires_at = pg_catalog.now() + interval '5 minutes',
         last_error = null
   where o.id = p_operation_pk;
  return query select 'fee_ready'::text, v_fee_claim_token;
end;
$$;

revoke all on function public.record_direct_charge_refund_result(uuid, uuid, text, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.record_direct_charge_refund_result(uuid, uuid, text, jsonb)
  to service_role;

create or replace function public.begin_direct_application_fee_refund_submission(
  p_operation_pk uuid,
  p_claim_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_hint public.billing_payment_operations%rowtype;
  v_detail_hint public.billing_direct_refund_operations%rowtype;
  v_operation public.billing_payment_operations%rowtype;
  v_detail public.billing_direct_refund_operations%rowtype;
  v_payment public.payments%rowtype;
begin
  select o.* into v_hint from public.billing_payment_operations o where o.id = p_operation_pk;
  select d.* into v_detail_hint from public.billing_direct_refund_operations d where d.operation_pk = p_operation_pk;
  if v_hint.id is null or v_detail_hint.operation_pk is null then
    raise exception 'direct refund operation was not found' using errcode = 'P0002';
  end if;

  perform 1 from public.accounts a where a.id = v_hint.account_id for share;
  select p.* into v_payment
    from public.payments p
   where p.id = v_hint.payment_id and p.account_id = v_hint.account_id
   for share;
  perform 1 from public.billing_direct_refund_authorizations a
   where a.id = v_detail_hint.authorization_id for share;
  select o.* into v_operation
    from public.billing_payment_operations o where o.id = p_operation_pk for update;
  select d.* into v_detail
    from public.billing_direct_refund_operations d where d.operation_pk = p_operation_pk for update;

  if v_operation.operation_type <> 'direct_refund.create'
     or v_operation.state <> 'submitted'
     or v_detail.phase <> 'fee_ready'
     or v_detail.refund_mode <> 'split'
     or v_detail.application_fee_refund_cents <= 0
     or v_detail.stripe_refund_id is null
     or v_detail.stripe_refund_result is null
     or v_operation.claim_token is distinct from p_claim_token
     or v_operation.lease_expires_at is null
     or v_operation.lease_expires_at <= pg_catalog.now() then
    raise exception 'direct Application Fee Refund claim is not owned or has expired'
      using errcode = '55000';
  end if;
  if v_payment.id is null
     or v_payment.refunded_amount is distinct from v_detail.cumulative_gross_before_cents::numeric / 100
     or v_payment.eligible_service_refunded_amount is distinct from v_detail.cumulative_eligible_before_cents::numeric / 100
     or v_payment.platform_fee_refunded is distinct from v_detail.application_fee_refund_before_cents::numeric / 100 then
    raise exception 'direct refund payment changed before Application Fee Refund submission'
      using errcode = 'P0001';
  end if;

  update public.billing_direct_refund_operations d
     set phase = 'fee_submitted',
         application_fee_submission_started_at = pg_catalog.now()
   where d.operation_pk = p_operation_pk;
  update public.billing_payment_operations o
     set attempt_count = o.attempt_count + 1,
         lease_expires_at = null,
         last_error = null
   where o.id = p_operation_pk;
  return true;
end;
$$;

revoke all on function public.begin_direct_application_fee_refund_submission(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.begin_direct_application_fee_refund_submission(uuid, uuid)
  to service_role;

create or replace function public.complete_direct_application_fee_refund_operation(
  p_operation_pk uuid,
  p_claim_token uuid,
  p_stripe_application_fee_refund_id text,
  p_stripe_application_fee_refund_result jsonb
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_hint public.billing_payment_operations%rowtype;
  v_detail_hint public.billing_direct_refund_operations%rowtype;
  v_operation public.billing_payment_operations%rowtype;
  v_detail public.billing_direct_refund_operations%rowtype;
  v_payment public.payments%rowtype;
begin
  if p_stripe_application_fee_refund_id is null
     or p_stripe_application_fee_refund_id !~ '^fr_[A-Za-z0-9_]+$'
     or pg_catalog.jsonb_typeof(p_stripe_application_fee_refund_result) <> 'object'
     or p_stripe_application_fee_refund_result->>'id' is distinct from p_stripe_application_fee_refund_id
     or p_stripe_application_fee_refund_result->>'amount' is null
     or p_stripe_application_fee_refund_result->>'amount' !~ '^[0-9]+$'
     or p_stripe_application_fee_refund_result->>'currency' is distinct from 'usd' then
    raise exception 'invalid Stripe Application Fee Refund provider result'
      using errcode = '22023';
  end if;

  select o.* into v_hint from public.billing_payment_operations o where o.id = p_operation_pk;
  select d.* into v_detail_hint from public.billing_direct_refund_operations d where d.operation_pk = p_operation_pk;
  if v_hint.id is null or v_detail_hint.operation_pk is null then
    raise exception 'direct refund operation was not found' using errcode = 'P0002';
  end if;

  perform 1 from public.accounts a where a.id = v_hint.account_id for share;
  select p.* into v_payment
    from public.payments p
   where p.id = v_hint.payment_id and p.account_id = v_hint.account_id
   for update;
  perform 1 from public.billing_direct_refund_authorizations a
   where a.id = v_detail_hint.authorization_id for share;
  select o.* into v_operation
    from public.billing_payment_operations o where o.id = p_operation_pk for update;
  select d.* into v_detail
    from public.billing_direct_refund_operations d where d.operation_pk = p_operation_pk for update;

  if v_operation.operation_type <> 'direct_refund.create'
     or v_operation.state <> 'submitted'
     or v_detail.phase <> 'fee_submitted'
     or v_operation.claim_token is distinct from p_claim_token
     or v_payment.id is null
     or v_payment.refunded_amount is distinct from v_detail.cumulative_gross_before_cents::numeric / 100
     or v_payment.eligible_service_refunded_amount is distinct from v_detail.cumulative_eligible_before_cents::numeric / 100
     or v_payment.platform_fee_refunded is distinct from v_detail.application_fee_refund_before_cents::numeric / 100
     or (p_stripe_application_fee_refund_result->>'amount')::bigint <> v_detail.application_fee_refund_cents
     or p_stripe_application_fee_refund_result->>'fee' is distinct from v_detail.stripe_application_fee_id then
    raise exception 'Application Fee Refund result does not exactly match its serialized operation'
      using errcode = 'P0001';
  end if;

  update public.billing_direct_refund_operations d
     set stripe_application_fee_refund_id = p_stripe_application_fee_refund_id,
         stripe_application_fee_refund_result = p_stripe_application_fee_refund_result,
         application_fee_result_recorded_at = pg_catalog.now()
   where d.operation_pk = p_operation_pk;

  perform public.apply_direct_refund_accounting(p_operation_pk);

  update public.billing_direct_refund_operations d
     set phase = 'succeeded'
   where d.operation_pk = p_operation_pk;
  update public.billing_payment_operations o
     set state = 'succeeded',
         completed_at = pg_catalog.now(),
         claim_token = null,
         lease_expires_at = null,
         last_error = null
   where o.id = p_operation_pk;
  return true;
end;
$$;

revoke all on function public.complete_direct_application_fee_refund_operation(uuid, uuid, text, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.complete_direct_application_fee_refund_operation(uuid, uuid, text, jsonb)
  to service_role;

create or replace function public.mark_direct_charge_refund_indeterminate(
  p_operation_pk uuid,
  p_claim_token uuid,
  p_last_error text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_hint public.billing_payment_operations%rowtype;
  v_detail_hint public.billing_direct_refund_operations%rowtype;
  v_operation public.billing_payment_operations%rowtype;
  v_detail public.billing_direct_refund_operations%rowtype;
begin
  select o.* into v_hint from public.billing_payment_operations o where o.id = p_operation_pk;
  select d.* into v_detail_hint from public.billing_direct_refund_operations d where d.operation_pk = p_operation_pk;
  if v_hint.id is null or v_detail_hint.operation_pk is null then
    raise exception 'direct refund operation was not found' using errcode = 'P0002';
  end if;

  perform 1 from public.accounts a where a.id = v_hint.account_id for share;
  perform 1 from public.payments p
   where p.id = v_hint.payment_id and p.account_id = v_hint.account_id for update;
  perform 1 from public.billing_direct_refund_authorizations a
   where a.id = v_detail_hint.authorization_id for share;
  select o.* into v_operation
    from public.billing_payment_operations o where o.id = p_operation_pk for update;
  select d.* into v_detail
    from public.billing_direct_refund_operations d where d.operation_pk = p_operation_pk for update;

  if v_operation.operation_type <> 'direct_refund.create'
     or v_operation.state <> 'submitted'
     or v_detail.phase not in ('charge_submitted', 'fee_submitted')
     or v_operation.claim_token is distinct from p_claim_token then
    raise exception 'direct refund submission is not owned by this claim'
      using errcode = '55000';
  end if;

  update public.billing_direct_refund_operations d
     set phase = 'indeterminate',
         indeterminate_step = case
           when v_detail.phase = 'fee_submitted' then 'application_fee'
           else 'charge'
         end
   where d.operation_pk = p_operation_pk;
  update public.billing_payment_operations o
     set state = 'indeterminate',
         claim_token = null,
         lease_expires_at = null,
         last_error = pg_catalog.left(
           coalesce(nullif(pg_catalog.btrim(p_last_error), ''),
             'Stripe refund submission outcome is unknown'),
           2000
         )
   where o.id = p_operation_pk;
  return true;
end;
$$;

revoke all on function public.mark_direct_charge_refund_indeterminate(uuid, uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.mark_direct_charge_refund_indeterminate(uuid, uuid, text)
  to service_role;

-- Supabase legacy projects can carry broad default grants. Rebuild an explicit
-- surface: service_role may inspect reconciliation facts, but every mutation is
-- constrained to the claim-token RPCs above. No authorization INSERT is granted.
revoke all on table public.billing_direct_refund_authorizations
  from public, anon, authenticated, service_role;
revoke all on table public.billing_direct_refund_operations
  from public, anon, authenticated, service_role;
grant select on table public.billing_direct_refund_authorizations to service_role;
grant select on table public.billing_direct_refund_operations to service_role;

revoke all on table public.billing_payment_operations from service_role;
grant select on table public.billing_payment_operations to service_role;

commit;
