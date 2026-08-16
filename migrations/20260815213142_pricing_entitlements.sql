-- Pricing, subscriptions, usage credits, and direct-charge migration foundation.
--
-- This migration is deliberately additive. `accounts` remains the workspace
-- boundary, the legacy plan_tier enum remains untouched, and the existing
-- accounts.stripe_connect_id remains the legacy recipient/destination account.
-- New Stripe merchant accounts are recorded separately so a payment can always
-- be reconciled against the charge architecture that created it.

begin;

-- ---------------------------------------------------------------------------
-- Stripe Connect merchant readiness (new direct-charge architecture)
-- ---------------------------------------------------------------------------

alter table public.accounts
  add column if not exists stripe_merchant_account_id text,
  add column if not exists merchant_onboarding_state text not null default 'not_started',
  add column if not exists merchant_onboarding_started_at timestamptz,
  add column if not exists merchant_requirements_checked_at timestamptz,
  add column if not exists merchant_ready_at timestamptz,
  add column if not exists merchant_disabled_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
     where conrelid = 'public.accounts'::pg_catalog.regclass
       and conname = 'accounts_merchant_onboarding_state_check'
  ) then
    alter table public.accounts add constraint accounts_merchant_onboarding_state_check
      check (merchant_onboarding_state in ('not_started', 'pending', 'restricted', 'ready', 'disabled'));
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
     where conrelid = 'public.accounts'::pg_catalog.regclass
       and conname = 'accounts_merchant_ready_state_check'
  ) then
    alter table public.accounts add constraint accounts_merchant_ready_state_check
      check (
        merchant_onboarding_state <> 'ready'
        or (
          stripe_merchant_account_id is not null
          and merchant_ready_at is not null
          and merchant_disabled_at is null
        )
      );
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
     where conrelid = 'public.accounts'::pg_catalog.regclass
       and conname = 'accounts_merchant_timestamps_require_account_check'
  ) then
    alter table public.accounts add constraint accounts_merchant_timestamps_require_account_check
      check (
        stripe_merchant_account_id is not null
        or (
          merchant_onboarding_started_at is null
          and merchant_requirements_checked_at is null
          and merchant_ready_at is null
          and merchant_disabled_at is null
        )
      );
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
     where conrelid = 'public.accounts'::pg_catalog.regclass
       and conname = 'accounts_stripe_merchant_account_format_check'
  ) then
    alter table public.accounts add constraint accounts_stripe_merchant_account_format_check
      check (
        stripe_merchant_account_id is null
        or stripe_merchant_account_id ~ '^acct_[A-Za-z0-9]{8,}$'
      );
  end if;
end
$$;

create unique index if not exists accounts_stripe_merchant_account_unique
  on public.accounts (stripe_merchant_account_id)
  where stripe_merchant_account_id is not null;

create index if not exists accounts_merchant_onboarding_state_idx
  on public.accounts (merchant_onboarding_state, merchant_requirements_checked_at);

comment on column public.accounts.stripe_connect_id is
  'Legacy recipient/destination Connect account. Do not overwrite during the direct-charge migration.';
comment on column public.accounts.stripe_merchant_account_id is
  'Stripe Merchant connected account used for direct charges. Separate from the legacy recipient account.';

-- accounts already has an owner UPDATE policy. Without a column guard, that
-- broad legacy policy would let a browser session declare its own Merchant
-- account ready. Merchant readiness is provider state and is backend-managed.
create or replace function public.protect_account_merchant_state()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      if new.stripe_merchant_account_id is not null
         or new.merchant_onboarding_state <> 'not_started'
         or new.merchant_onboarding_started_at is not null
         or new.merchant_requirements_checked_at is not null
         or new.merchant_ready_at is not null
         or new.merchant_disabled_at is not null then
        raise exception 'Stripe Merchant state is backend-managed' using errcode = '42501';
      end if;
    elsif old.stripe_merchant_account_id is distinct from new.stripe_merchant_account_id
       or old.merchant_onboarding_state is distinct from new.merchant_onboarding_state
       or old.merchant_onboarding_started_at is distinct from new.merchant_onboarding_started_at
       or old.merchant_requirements_checked_at is distinct from new.merchant_requirements_checked_at
       or old.merchant_ready_at is distinct from new.merchant_ready_at
       or old.merchant_disabled_at is distinct from new.merchant_disabled_at then
      raise exception 'Stripe Merchant state is backend-managed' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_account_merchant_state_insert_trigger on public.accounts;
create trigger protect_account_merchant_state_insert_trigger
before insert on public.accounts
for each row execute function public.protect_account_merchant_state();

drop trigger if exists protect_account_merchant_state_update_trigger on public.accounts;
create trigger protect_account_merchant_state_update_trigger
before update of stripe_merchant_account_id, merchant_onboarding_state,
  merchant_onboarding_started_at, merchant_requirements_checked_at,
  merchant_ready_at, merchant_disabled_at
on public.accounts
for each row execute function public.protect_account_merchant_state();

revoke all on function public.protect_account_merchant_state() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Immutable payment fee and charge-architecture snapshots
-- ---------------------------------------------------------------------------

alter table public.payments
  add column if not exists refunded_at timestamptz,
  add column if not exists platform_fee_refunded numeric(12,2) not null default 0,
  add column if not exists fee_basis_amount numeric(12,2),
  add column if not exists fee_plan_code text,
  add column if not exists fee_catalog_version text,
  add column if not exists fee_rate_bps integer,
  add column if not exists stripe_account_id text,
  add column if not exists charge_model text not null default 'destination',
  add column if not exists stripe_charge_id text,
  add column if not exists stripe_application_fee_id text,
  add column if not exists stripe_latest_refund_id text,
  add column if not exists stripe_latest_application_fee_refund_id text,
  add column if not exists stripe_balance_transaction_id text,
  add column if not exists reconciliation_status text,
  add column if not exists reconciled_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
     where conrelid = 'public.payments'::pg_catalog.regclass
       and conname = 'payments_refunded_amount_check'
  ) then
    alter table public.payments add constraint payments_refunded_amount_check
      check (refunded_amount >= 0 and refunded_amount <= amount);
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
     where conrelid = 'public.payments'::pg_catalog.regclass
       and conname = 'payments_platform_fee_refunded_check'
  ) then
    alter table public.payments add constraint payments_platform_fee_refunded_check
      check (
        platform_fee_refunded >= 0
        and (platform_fee is null or platform_fee_refunded <= platform_fee)
      );
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
     where conrelid = 'public.payments'::pg_catalog.regclass
       and conname = 'payments_fee_basis_amount_check'
  ) then
    alter table public.payments add constraint payments_fee_basis_amount_check
      check (fee_basis_amount is null or (fee_basis_amount >= 0 and fee_basis_amount <= amount));
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
     where conrelid = 'public.payments'::pg_catalog.regclass
       and conname = 'payments_fee_plan_code_check'
  ) then
    alter table public.payments add constraint payments_fee_plan_code_check
      check (fee_plan_code is null or fee_plan_code in ('flex', 'solo', 'growth', 'scale', 'enterprise'));
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
     where conrelid = 'public.payments'::pg_catalog.regclass
       and conname = 'payments_fee_catalog_version_check'
  ) then
    alter table public.payments add constraint payments_fee_catalog_version_check
      check (fee_catalog_version is null or pg_catalog.length(pg_catalog.btrim(fee_catalog_version)) > 0);
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
     where conrelid = 'public.payments'::pg_catalog.regclass
       and conname = 'payments_platform_fee_check'
  ) then
    alter table public.payments add constraint payments_platform_fee_check
      check (
        platform_fee is null
        or (
          platform_fee >= 0
          and platform_fee <= amount
          and (fee_basis_amount is null or platform_fee <= fee_basis_amount)
        )
      );
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
     where conrelid = 'public.payments'::pg_catalog.regclass
       and conname = 'payments_fee_rate_check'
  ) then
    alter table public.payments add constraint payments_fee_rate_check
      check (fee_rate is null or (fee_rate >= 0 and fee_rate <= 1));
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
     where conrelid = 'public.payments'::pg_catalog.regclass
       and conname = 'payments_fee_rate_bps_check'
  ) then
    alter table public.payments add constraint payments_fee_rate_bps_check
      check (fee_rate_bps is null or fee_rate_bps between 0 and 10000);
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
     where conrelid = 'public.payments'::pg_catalog.regclass
       and conname = 'payments_charge_model_check'
  ) then
    alter table public.payments add constraint payments_charge_model_check
      check (charge_model in ('destination', 'direct'));
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
     where conrelid = 'public.payments'::pg_catalog.regclass
       and conname = 'payments_direct_charge_account_check'
  ) then
    alter table public.payments add constraint payments_direct_charge_account_check
      check (
        charge_model <> 'direct'
        or (
          stripe_account_id is not null
          and fee_basis_amount is not null
          and fee_plan_code is not null
          and fee_catalog_version is not null
          and fee_rate_bps is not null
          and fee_rate is not null
          and platform_fee is not null
          and reconciliation_status is not null
          and stripe_account_id ~ '^acct_[A-Za-z0-9]{8,}$'
          and fee_rate = fee_rate_bps::numeric / 10000
          and platform_fee = pg_catalog.round(fee_basis_amount * fee_rate_bps::numeric / 10000, 2)
        )
      );
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
     where conrelid = 'public.payments'::pg_catalog.regclass
       and conname = 'payments_reconciliation_status_check'
  ) then
    alter table public.payments add constraint payments_reconciliation_status_check
      check (reconciliation_status is null or reconciliation_status in ('pending', 'reconciled', 'mismatch', 'waived'));
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
     where conrelid = 'public.payments'::pg_catalog.regclass
       and conname = 'payments_reconciled_at_check'
  ) then
    alter table public.payments add constraint payments_reconciled_at_check
      check (
        (
          reconciled_at is null
          and (reconciliation_status is null or reconciliation_status in ('pending', 'mismatch'))
        )
        or (
          reconciled_at is not null
          and reconciliation_status in ('reconciled', 'waived')
        )
      );
  end if;
end
$$;

create index if not exists payments_stripe_account_charge_idx
  on public.payments (stripe_account_id, stripe_charge_id)
  where stripe_account_id is not null;
create unique index if not exists payments_id_account_unique
  on public.payments (id, account_id);
create unique index if not exists payments_stripe_application_fee_unique
  on public.payments (stripe_application_fee_id)
  where stripe_application_fee_id is not null;
create index if not exists payments_reconciliation_queue_idx
  on public.payments (reconciliation_status, paid_at)
  where reconciliation_status in ('pending', 'mismatch');

create or replace function public.protect_payment_pricing_snapshot()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    if current_user in ('anon', 'authenticated')
       and (
         new.fee_basis_amount is not null
          or new.platform_fee is not null
          or new.fee_rate is not null
          or new.fee_rate_bps is not null
          or new.fee_plan_code is not null
         or new.fee_catalog_version is not null
         or new.stripe_account_id is not null
         or new.charge_model <> 'destination'
         or new.stripe_charge_id is not null
         or new.stripe_application_fee_id is not null
         or new.stripe_latest_refund_id is not null
         or new.stripe_latest_application_fee_refund_id is not null
         or new.stripe_balance_transaction_id is not null
         or new.reconciliation_status is not null
         or new.reconciled_at is not null
       ) then
      raise exception 'payment pricing and Stripe reconciliation fields are backend-managed' using errcode = '42501';
    end if;
    return new;
  end if;

  if current_user in ('anon', 'authenticated')
     and (
       old.fee_basis_amount is distinct from new.fee_basis_amount
        or old.platform_fee is distinct from new.platform_fee
        or old.fee_rate is distinct from new.fee_rate
        or old.fee_rate_bps is distinct from new.fee_rate_bps
        or old.fee_plan_code is distinct from new.fee_plan_code
       or old.fee_catalog_version is distinct from new.fee_catalog_version
       or old.stripe_account_id is distinct from new.stripe_account_id
       or old.charge_model is distinct from new.charge_model
       or old.stripe_charge_id is distinct from new.stripe_charge_id
       or old.stripe_application_fee_id is distinct from new.stripe_application_fee_id
       or old.stripe_latest_refund_id is distinct from new.stripe_latest_refund_id
       or old.stripe_latest_application_fee_refund_id is distinct from new.stripe_latest_application_fee_refund_id
       or old.stripe_balance_transaction_id is distinct from new.stripe_balance_transaction_id
       or old.reconciliation_status is distinct from new.reconciliation_status
       or old.reconciled_at is distinct from new.reconciled_at
     ) then
    raise exception 'payment pricing and Stripe reconciliation fields are backend-managed' using errcode = '42501';
  end if;

  if old.charge_model is distinct from new.charge_model then
    raise exception 'payments.charge_model is immutable' using errcode = '22000';
  end if;
  if old.stripe_account_id is not null and old.stripe_account_id is distinct from new.stripe_account_id then
    raise exception 'payments.stripe_account_id is immutable once assigned' using errcode = '22000';
  end if;
  if old.fee_basis_amount is not null and old.fee_basis_amount is distinct from new.fee_basis_amount then
    raise exception 'payments.fee_basis_amount is immutable once assigned' using errcode = '22000';
  end if;
  if old.charge_model = 'direct'
     and old.platform_fee is not null
     and old.platform_fee is distinct from new.platform_fee then
    raise exception 'payments.platform_fee is immutable once assigned' using errcode = '22000';
  end if;
  if old.charge_model = 'direct'
     and old.fee_rate is not null
     and old.fee_rate is distinct from new.fee_rate then
    raise exception 'payments.fee_rate is immutable once assigned' using errcode = '22000';
  end if;
  if old.fee_rate_bps is not null and old.fee_rate_bps is distinct from new.fee_rate_bps then
    raise exception 'payments.fee_rate_bps is immutable once assigned' using errcode = '22000';
  end if;
  if old.fee_plan_code is not null and old.fee_plan_code is distinct from new.fee_plan_code then
    raise exception 'payments.fee_plan_code is immutable once assigned' using errcode = '22000';
  end if;
  if old.fee_catalog_version is not null and old.fee_catalog_version is distinct from new.fee_catalog_version then
    raise exception 'payments.fee_catalog_version is immutable once assigned' using errcode = '22000';
  end if;
  if old.stripe_application_fee_id is not null
     and old.stripe_application_fee_id is distinct from new.stripe_application_fee_id then
    raise exception 'payments.stripe_application_fee_id is immutable once assigned' using errcode = '22000';
  end if;
  if old.stripe_charge_id is not null and old.stripe_charge_id is distinct from new.stripe_charge_id then
    raise exception 'payments.stripe_charge_id is immutable once assigned' using errcode = '22000';
  end if;
  if old.stripe_balance_transaction_id is not null
     and old.stripe_balance_transaction_id is distinct from new.stripe_balance_transaction_id then
    raise exception 'payments.stripe_balance_transaction_id is immutable once assigned' using errcode = '22000';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_payment_pricing_snapshot_trigger on public.payments;
create trigger protect_payment_pricing_snapshot_trigger
before update of charge_model, stripe_account_id, fee_basis_amount, platform_fee, fee_rate, fee_rate_bps, fee_plan_code,
  fee_catalog_version, stripe_charge_id, stripe_application_fee_id,
  stripe_latest_refund_id, stripe_latest_application_fee_refund_id,
  stripe_balance_transaction_id, reconciliation_status, reconciled_at
on public.payments
for each row execute function public.protect_payment_pricing_snapshot();

drop trigger if exists protect_payment_pricing_snapshot_insert_trigger on public.payments;
create trigger protect_payment_pricing_snapshot_insert_trigger
before insert on public.payments
for each row execute function public.protect_payment_pricing_snapshot();

revoke all on function public.protect_payment_pricing_snapshot() from public, anon, authenticated;

-- A direct-charge payment row is a server-owned settlement record. Keep the
-- legacy destination/manual workflow unchanged, but prevent browser sessions
-- from forging Stripe outcomes and freeze the identity/amount of direct rows.
create or replace function public.protect_direct_payment_truth()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    if old.charge_model = 'direct' then
      raise exception 'direct payment audit rows cannot be deleted' using errcode = '42501';
    end if;
    return old;
  end if;

  if old.charge_model <> 'direct' then
    return new;
  end if;

  if old.account_id is distinct from new.account_id
     or old.job_id is distinct from new.job_id
     or old.invoice_id is distinct from new.invoice_id
     or old.payment_plan_id is distinct from new.payment_plan_id
     or old.recurring_plan_id is distinct from new.recurring_plan_id
     or old.kind is distinct from new.kind
     or old.amount is distinct from new.amount
     or old.due_date is distinct from new.due_date
     or old.installment_seq is distinct from new.installment_seq then
    raise exception 'direct payment identity and amount are immutable' using errcode = '22000';
  end if;

  if old.stripe_payment_intent is not null
     and old.stripe_payment_intent is distinct from new.stripe_payment_intent then
    raise exception 'direct payment intent is immutable once assigned' using errcode = '22000';
  end if;

  if current_user in ('anon', 'authenticated')
     and (
       old.status is distinct from new.status
       or old.paid_at is distinct from new.paid_at
       or old.stripe_checkout_session is distinct from new.stripe_checkout_session
       or old.stripe_payment_intent is distinct from new.stripe_payment_intent
       or old.refunded_amount is distinct from new.refunded_amount
       or old.refunded_at is distinct from new.refunded_at
       or old.platform_fee_refunded is distinct from new.platform_fee_refunded
       or old.disputed_at is distinct from new.disputed_at
       or old.dispute_reason is distinct from new.dispute_reason
       or old.dispute_status is distinct from new.dispute_status
       or old.stripe_dispute_id is distinct from new.stripe_dispute_id
       or old.dispute_due_by is distinct from new.dispute_due_by
       or old.failure_code is distinct from new.failure_code
       or old.failure_message is distinct from new.failure_message
       or old.failed_at is distinct from new.failed_at
       or old.dunning_attempts is distinct from new.dunning_attempts
       or old.charge_attempts is distinct from new.charge_attempts
       or old.next_retry_at is distinct from new.next_retry_at
       or old.dunning_state is distinct from new.dunning_state
     ) then
    raise exception 'direct payment provider state is backend-managed' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists protect_direct_payment_truth_trigger on public.payments;
create trigger protect_direct_payment_truth_trigger
before update of account_id, job_id, invoice_id, payment_plan_id, recurring_plan_id,
  kind, amount, due_date, installment_seq, status, paid_at, stripe_checkout_session,
  stripe_payment_intent, refunded_amount, refunded_at, platform_fee_refunded,
  disputed_at, dispute_reason, dispute_status, stripe_dispute_id, dispute_due_by,
  failure_code, failure_message, failed_at, dunning_attempts, charge_attempts,
  next_retry_at, dunning_state
on public.payments
for each row execute function public.protect_direct_payment_truth();

drop trigger if exists protect_direct_payment_truth_delete_trigger on public.payments;
create trigger protect_direct_payment_truth_delete_trigger
before delete on public.payments
for each row execute function public.protect_direct_payment_truth();

revoke all on function public.protect_direct_payment_truth() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Current Stripe Billing subscription and safe workspace entitlement snapshot
-- ---------------------------------------------------------------------------

create table if not exists public.billing_subscriptions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  provider text not null default 'stripe' check (provider = 'stripe'),
  provider_customer_id text not null check (pg_catalog.length(pg_catalog.btrim(provider_customer_id)) > 0),
  provider_subscription_id text not null check (pg_catalog.length(pg_catalog.btrim(provider_subscription_id)) > 0),
  provider_subscription_item_id text,
  provider_price_id text not null check (pg_catalog.length(pg_catalog.btrim(provider_price_id)) > 0),
  plan_code text not null check (plan_code in ('solo', 'growth', 'scale', 'enterprise')),
  billing_interval text not null check (billing_interval in ('monthly', 'annual')),
  status text not null check (
    status in ('incomplete', 'incomplete_expired', 'trialing', 'active', 'past_due', 'canceled', 'unpaid', 'paused')
  ),
  catalog_version text not null check (pg_catalog.length(pg_catalog.btrim(catalog_version)) > 0),
  currency text not null default 'usd' check (currency ~ '^[a-z]{3}$'),
  base_amount_cents bigint not null check (base_amount_cents >= 0),
  platform_fee_bps integer not null check (platform_fee_bps between 0 and 10000),
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  cancel_at timestamptz,
  canceled_at timestamptz,
  ended_at timestamptz,
  pending_plan_code text check (pending_plan_code is null or pending_plan_code in ('solo', 'growth', 'scale', 'enterprise')),
  pending_billing_interval text check (pending_billing_interval is null or pending_billing_interval in ('monthly', 'annual')),
  pending_effective_at timestamptz,
  metadata jsonb not null default '{}'::jsonb check (pg_catalog.jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_subscriptions_provider_subscription_unique unique (provider, provider_subscription_id),
  constraint billing_subscriptions_period_check check (
    current_period_start is null or current_period_end is null or current_period_end > current_period_start
  ),
  constraint billing_subscriptions_pending_change_check check (
    (pending_plan_code is null and pending_billing_interval is null and pending_effective_at is null)
    or
    (pending_plan_code is not null and pending_billing_interval is not null and pending_effective_at is not null)
  )
);

create unique index if not exists billing_subscriptions_one_live_per_account
  on public.billing_subscriptions (account_id)
  where status in ('incomplete', 'trialing', 'active', 'past_due', 'unpaid', 'paused');
create index if not exists billing_subscriptions_customer_idx
  on public.billing_subscriptions (provider, provider_customer_id);
create index if not exists billing_subscriptions_period_end_idx
  on public.billing_subscriptions (current_period_end)
  where status in ('trialing', 'active', 'past_due', 'unpaid', 'paused');

create table if not exists public.workspace_entitlements (
  account_id uuid primary key references public.accounts(id) on delete cascade,
  plan_code text not null check (plan_code in ('flex', 'solo', 'growth', 'scale', 'enterprise')),
  billing_interval text not null check (billing_interval in ('none', 'monthly', 'annual')),
  billing_status text not null check (billing_status in ('free', 'trialing', 'active', 'past_due', 'paused', 'canceled')),
  entitlement_state text not null check (entitlement_state in ('active', 'grace', 'restricted', 'archived')),
  catalog_version text not null check (pg_catalog.length(pg_catalog.btrim(catalog_version)) > 0),
  platform_fee_bps integer not null check (platform_fee_bps between 0 and 10000),
  period_start timestamptz,
  period_end timestamptz,
  next_allowance_reset_at timestamptz,
  starter_credits_issued_at timestamptz,
  archived_at timestamptz,
  feature_limits jsonb not null default '{}'::jsonb check (pg_catalog.jsonb_typeof(feature_limits) = 'object'),
  feature_flags jsonb not null default '{}'::jsonb check (pg_catalog.jsonb_typeof(feature_flags) = 'object'),
  version bigint not null default 1 check (version > 0),
  effective_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workspace_entitlements_period_check check (
    period_start is null or period_end is null or period_end > period_start
  ),
  constraint workspace_entitlements_archive_check check (
    entitlement_state <> 'archived' or archived_at is not null
  )
);

create index if not exists workspace_entitlements_plan_state_idx
  on public.workspace_entitlements (plan_code, entitlement_state);
create index if not exists workspace_entitlements_allowance_reset_idx
  on public.workspace_entitlements (next_allowance_reset_at)
  where next_allowance_reset_at is not null and entitlement_state = 'active';

create or replace function public.touch_billing_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

drop trigger if exists billing_subscriptions_touch_updated_at on public.billing_subscriptions;
create trigger billing_subscriptions_touch_updated_at
before update on public.billing_subscriptions
for each row execute function public.touch_billing_updated_at();

drop trigger if exists workspace_entitlements_touch_updated_at on public.workspace_entitlements;
create trigger workspace_entitlements_touch_updated_at
before update on public.workspace_entitlements
for each row execute function public.touch_billing_updated_at();

revoke all on function public.touch_billing_updated_at() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Durable, idempotent Stripe event inbox (payloads are backend-only)
-- ---------------------------------------------------------------------------

create table if not exists public.billing_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'stripe' check (provider = 'stripe'),
  provider_event_id text not null check (pg_catalog.length(pg_catalog.btrim(provider_event_id)) > 0),
  event_type text not null check (pg_catalog.length(pg_catalog.btrim(event_type)) > 0),
  account_id uuid references public.accounts(id) on delete set null,
  billing_subscription_id uuid references public.billing_subscriptions(id) on delete set null,
  provider_account_id text,
  livemode boolean not null,
  api_version text,
  provider_created_at timestamptz,
  payload jsonb not null check (pg_catalog.jsonb_typeof(payload) = 'object'),
  payload_sha256 text check (payload_sha256 is null or payload_sha256 ~ '^[0-9a-f]{64}$'),
  processing_status text not null default 'received'
    check (processing_status in ('received', 'processing', 'processed', 'failed', 'ignored')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  processing_started_at timestamptz,
  processed_at timestamptz,
  next_attempt_at timestamptz,
  last_error text,
  received_at timestamptz not null default now(),
  constraint billing_events_provider_event_unique unique (provider, provider_event_id),
  constraint billing_events_processed_state_check check (
    processed_at is null or processing_status in ('processed', 'ignored')
  )
);

create index if not exists billing_events_processing_queue_idx
  on public.billing_events (processing_status, next_attempt_at, received_at)
  where processing_status in ('received', 'failed');
create index if not exists billing_events_account_received_idx
  on public.billing_events (account_id, received_at desc)
  where account_id is not null;
create index if not exists billing_events_provider_account_idx
  on public.billing_events (provider_account_id, received_at desc)
  where provider_account_id is not null;

-- Stripe's idempotency window is not a durable business-operation ledger. This
-- table claims each create/refund operation exactly once and records its result,
-- while Stripe idempotency remains a second line of defense.
create table if not exists public.billing_payment_operations (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete restrict,
  payment_id uuid,
  operation_type text not null check (operation_type ~ '^[a-z][a-z0-9_.]{1,63}$'),
  operation_id text not null check (pg_catalog.length(pg_catalog.btrim(operation_id)) > 0),
  charge_model text not null default 'direct' check (charge_model = 'direct'),
  stripe_account_id text not null check (stripe_account_id ~ '^acct_[A-Za-z0-9]{8,}$'),
  stripe_idempotency_key text not null check (
    pg_catalog.length(pg_catalog.btrim(stripe_idempotency_key)) between 1 and 255
  ),
  request_fingerprint text not null check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  state text not null default 'claimed'
    check (state in ('claimed', 'submitted', 'succeeded', 'failed', 'indeterminate')),
  provider_object_id text,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  lease_expires_at timestamptz,
  completed_at timestamptz,
  last_error text,
  metadata jsonb not null default '{}'::jsonb check (pg_catalog.jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_payment_operations_business_key_unique
    unique (account_id, operation_type, operation_id),
  constraint billing_payment_operations_stripe_key_unique
    unique (stripe_account_id, stripe_idempotency_key),
  constraint billing_payment_operations_payment_fk
    foreign key (payment_id, account_id)
    references public.payments(id, account_id) on delete restrict,
  constraint billing_payment_operations_completion_check check (
    completed_at is null or state in ('succeeded', 'failed')
  )
);

create index if not exists billing_payment_operations_recovery_idx
  on public.billing_payment_operations (state, lease_expires_at, created_at)
  where state in ('claimed', 'submitted', 'indeterminate');
create unique index if not exists billing_payment_operations_provider_object_unique
  on public.billing_payment_operations (stripe_account_id, provider_object_id)
  where provider_object_id is not null;

drop trigger if exists billing_payment_operations_touch_updated_at on public.billing_payment_operations;
create trigger billing_payment_operations_touch_updated_at
before update on public.billing_payment_operations
for each row execute function public.touch_billing_updated_at();

-- ---------------------------------------------------------------------------
-- Credit lots and reservation ledger
-- ---------------------------------------------------------------------------

create table if not exists public.usage_credit_lots (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  resource_code text not null check (resource_code ~ '^[a-z][a-z0-9_]{1,63}$'),
  source_type text not null check (
    source_type in ('flex_starter', 'plan_period', 'purchase', 'promotion', 'adjustment', 'voice_addon')
  ),
  idempotency_key text not null check (pg_catalog.length(pg_catalog.btrim(idempotency_key)) > 0),
  catalog_version text check (catalog_version is null or pg_catalog.length(pg_catalog.btrim(catalog_version)) > 0),
  billing_event_id uuid references public.billing_events(id) on delete set null,
  granted_units bigint not null check (granted_units > 0),
  consumed_units bigint not null default 0 check (consumed_units >= 0),
  reserved_units bigint not null default 0 check (reserved_units >= 0),
  revoked_units bigint not null default 0 check (revoked_units >= 0),
  available_from timestamptz not null default now(),
  expires_at timestamptz,
  metadata jsonb not null default '{}'::jsonb check (pg_catalog.jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  constraint usage_credit_lots_id_account_unique unique (id, account_id),
  constraint usage_credit_lots_idempotency_unique unique (account_id, resource_code, idempotency_key),
  constraint usage_credit_lots_units_check check (
    consumed_units + reserved_units + revoked_units <= granted_units
  ),
  constraint usage_credit_lots_expiration_check check (
    expires_at is null or expires_at > available_from
  ),
  constraint usage_credit_lots_purchases_do_not_expire check (
    source_type <> 'purchase' or expires_at is null
  )
);

create index if not exists usage_credit_lots_fifo_idx
  on public.usage_credit_lots (account_id, resource_code, expires_at, available_from, created_at, id)
  where consumed_units + reserved_units + revoked_units < granted_units;
create index if not exists usage_credit_lots_billing_event_idx
  on public.usage_credit_lots (billing_event_id)
  where billing_event_id is not null;

create table if not exists public.usage_reservations (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  resource_code text not null check (resource_code ~ '^[a-z][a-z0-9_]{1,63}$'),
  units bigint not null check (units > 0),
  operation_type text not null check (operation_type ~ '^[a-z][a-z0-9_]{1,63}$'),
  idempotency_key text not null check (pg_catalog.length(pg_catalog.btrim(idempotency_key)) > 0),
  state text not null default 'reserved' check (state in ('reserved', 'committed', 'released', 'expired')),
  expires_at timestamptz not null,
  committed_at timestamptz,
  released_at timestamptz,
  finalization_key text,
  release_reason text,
  metadata jsonb not null default '{}'::jsonb check (pg_catalog.jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  constraint usage_reservations_id_account_unique unique (id, account_id),
  constraint usage_reservations_idempotency_unique unique (account_id, resource_code, idempotency_key),
  constraint usage_reservations_expiration_check check (expires_at > created_at),
  constraint usage_reservations_final_state_check check (
    (state = 'reserved' and committed_at is null and released_at is null)
    or (state = 'committed' and committed_at is not null and released_at is null)
    or (state in ('released', 'expired') and committed_at is null and released_at is not null)
  )
);

create index if not exists usage_reservations_expiry_queue_idx
  on public.usage_reservations (expires_at, id)
  where state = 'reserved';
create index if not exists usage_reservations_account_created_idx
  on public.usage_reservations (account_id, created_at desc);

create table if not exists public.usage_reservation_allocations (
  account_id uuid not null,
  reservation_id uuid not null,
  credit_lot_id uuid not null,
  units bigint not null check (units > 0),
  created_at timestamptz not null default now(),
  primary key (reservation_id, credit_lot_id),
  constraint usage_reservation_allocations_reservation_fk
    foreign key (reservation_id, account_id)
    references public.usage_reservations(id, account_id) on delete cascade,
  constraint usage_reservation_allocations_lot_fk
    foreign key (credit_lot_id, account_id)
    references public.usage_credit_lots(id, account_id)
    on delete no action deferrable initially deferred
);

create index if not exists usage_reservation_allocations_lot_idx
  on public.usage_reservation_allocations (credit_lot_id, reservation_id);
create index if not exists usage_reservation_allocations_account_idx
  on public.usage_reservation_allocations (account_id, reservation_id);

-- A caller-safe balance projection. security_invoker is intentional: the view
-- obeys usage_credit_lots RLS and the caller's column grants rather than running
-- with its creator's rights.
create or replace view public.workspace_usage_credit_balances
with (security_invoker = true)
as
select
  l.account_id,
  l.resource_code,
  pg_catalog.sum(l.granted_units)::bigint as granted_units,
  pg_catalog.sum(l.consumed_units)::bigint as consumed_units,
  pg_catalog.sum(l.reserved_units)::bigint as reserved_units,
  pg_catalog.sum(l.revoked_units)::bigint as revoked_units,
  pg_catalog.sum(
    case
      when l.available_from <= pg_catalog.now()
       and (l.expires_at is null or l.expires_at > pg_catalog.now())
      then l.granted_units - l.consumed_units - l.reserved_units - l.revoked_units
      else 0
    end
  )::bigint as available_units,
  pg_catalog.sum(
    case
      when l.expires_at is not null and l.expires_at <= pg_catalog.now()
      then l.granted_units - l.consumed_units - l.reserved_units - l.revoked_units
      else 0
    end
  )::bigint as expired_unused_units,
  pg_catalog.min(l.expires_at) filter (
    where l.expires_at > pg_catalog.now()
      and l.granted_units - l.consumed_units - l.reserved_units - l.revoked_units > 0
  ) as next_expiration_at
from public.usage_credit_lots l
group by l.account_id, l.resource_code;

-- ---------------------------------------------------------------------------
-- Service-only credit grant and atomic reservation lifecycle
-- ---------------------------------------------------------------------------

create or replace function public.grant_usage_credits(
  p_account_id uuid,
  p_resource_code text,
  p_units bigint,
  p_source_type text,
  p_idempotency_key text,
  p_catalog_version text default null,
  p_billing_event_id uuid default null,
  p_available_from timestamptz default null,
  p_expires_at timestamptz default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_id uuid;
  v_existing public.usage_credit_lots%rowtype;
  v_available_from timestamptz := coalesce(p_available_from, pg_catalog.now());
begin
  if p_units <= 0 then
    raise exception 'usage credit grant must be positive' using errcode = '22023';
  end if;
  if p_resource_code is null or p_resource_code !~ '^[a-z][a-z0-9_]{1,63}$' then
    raise exception 'invalid usage resource code' using errcode = '22023';
  end if;
  if p_idempotency_key is null or pg_catalog.length(pg_catalog.btrim(p_idempotency_key)) = 0 then
    raise exception 'usage credit idempotency key is required' using errcode = '22023';
  end if;
  if p_metadata is null or pg_catalog.jsonb_typeof(p_metadata) <> 'object' then
    raise exception 'usage credit metadata must be a JSON object' using errcode = '22023';
  end if;
  if p_expires_at is not null and p_expires_at <= v_available_from then
    raise exception 'usage credit expiration must follow availability' using errcode = '22023';
  end if;
  if not exists (select 1 from public.accounts a where a.id = p_account_id) then
    raise exception 'workspace not found' using errcode = '23503';
  end if;
  if p_billing_event_id is not null and not exists (
    select 1 from public.billing_events e
     where e.id = p_billing_event_id
       and e.account_id = p_account_id
  ) then
    raise exception 'billing event does not belong to workspace' using errcode = '23503';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_account_id::text || ':' || p_resource_code, 0)
  );

  select l.* into v_existing
    from public.usage_credit_lots l
   where l.account_id = p_account_id
     and l.resource_code = p_resource_code
     and l.idempotency_key = p_idempotency_key;

  if found then
    if v_existing.granted_units <> p_units
       or v_existing.source_type <> p_source_type
       or v_existing.catalog_version is distinct from p_catalog_version
       or v_existing.billing_event_id is distinct from p_billing_event_id
       or (p_available_from is not null and v_existing.available_from is distinct from p_available_from)
       or v_existing.expires_at is distinct from p_expires_at then
      raise exception 'usage credit idempotency key was reused with different grant data' using errcode = '22000';
    end if;
    return v_existing.id;
  end if;

  insert into public.usage_credit_lots (
    account_id, resource_code, source_type, idempotency_key, catalog_version,
    billing_event_id, granted_units, available_from, expires_at, metadata
  ) values (
    p_account_id, p_resource_code, p_source_type, p_idempotency_key, p_catalog_version,
    p_billing_event_id, p_units, v_available_from, p_expires_at, p_metadata
  )
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.reserve_usage_credits(
  p_account_id uuid,
  p_resource_code text,
  p_units bigint,
  p_idempotency_key text,
  p_operation_type text default 'usage',
  p_expires_at timestamptz default (now() + interval '15 minutes'),
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_id uuid;
  v_remaining bigint := p_units;
  v_take bigint;
  v_lot record;
  v_existing public.usage_reservations%rowtype;
begin
  if p_units <= 0 then
    raise exception 'usage reservation must be positive' using errcode = '22023';
  end if;
  if p_resource_code is null or p_resource_code !~ '^[a-z][a-z0-9_]{1,63}$' then
    raise exception 'invalid usage resource code' using errcode = '22023';
  end if;
  if p_operation_type is null or p_operation_type !~ '^[a-z][a-z0-9_]{1,63}$' then
    raise exception 'invalid usage operation type' using errcode = '22023';
  end if;
  if p_idempotency_key is null or pg_catalog.length(pg_catalog.btrim(p_idempotency_key)) = 0 then
    raise exception 'usage reservation idempotency key is required' using errcode = '22023';
  end if;
  if p_metadata is null or pg_catalog.jsonb_typeof(p_metadata) <> 'object' then
    raise exception 'usage reservation metadata must be a JSON object' using errcode = '22023';
  end if;
  if p_expires_at <= pg_catalog.now() or p_expires_at > pg_catalog.now() + interval '24 hours' then
    raise exception 'usage reservation expiration must be within the next 24 hours' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_account_id::text || ':' || p_resource_code, 0)
  );

  select r.* into v_existing
    from public.usage_reservations r
   where r.account_id = p_account_id
     and r.resource_code = p_resource_code
     and r.idempotency_key = p_idempotency_key;

  if found then
    if v_existing.units <> p_units or v_existing.operation_type <> p_operation_type then
      raise exception 'usage reservation idempotency key was reused with different request data' using errcode = '22000';
    end if;
    return v_existing.id;
  end if;

  insert into public.usage_reservations (
    account_id, resource_code, units, operation_type, idempotency_key, expires_at, metadata
  ) values (
    p_account_id, p_resource_code, p_units, p_operation_type, p_idempotency_key, p_expires_at, p_metadata
  )
  returning id into v_id;

  for v_lot in
    select
      l.id,
      l.granted_units - l.consumed_units - l.reserved_units - l.revoked_units as available_units
    from public.usage_credit_lots l
    where l.account_id = p_account_id
      and l.resource_code = p_resource_code
      and l.available_from <= pg_catalog.now()
      and (l.expires_at is null or l.expires_at > p_expires_at)
      and l.granted_units - l.consumed_units - l.reserved_units - l.revoked_units > 0
    order by l.expires_at asc nulls last, l.available_from asc, l.created_at asc, l.id asc
    for update
  loop
    exit when v_remaining = 0;
    v_take := least(v_remaining, v_lot.available_units);

    update public.usage_credit_lots l
       set reserved_units = l.reserved_units + v_take
     where l.id = v_lot.id;

    insert into public.usage_reservation_allocations (
      account_id, reservation_id, credit_lot_id, units
    ) values (
      p_account_id, v_id, v_lot.id, v_take
    );

    v_remaining := v_remaining - v_take;
  end loop;

  if v_remaining > 0 then
    raise exception 'insufficient usage credits for resource % (missing % units)', p_resource_code, v_remaining
      using errcode = 'P0001';
  end if;

  return v_id;
end;
$$;

create or replace function public.commit_usage_reservation(
  p_reservation_id uuid,
  p_finalization_key text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_reservation public.usage_reservations%rowtype;
  v_allocation record;
  v_updated integer;
begin
  if p_finalization_key is null or pg_catalog.length(pg_catalog.btrim(p_finalization_key)) = 0 then
    raise exception 'reservation finalization key is required' using errcode = '22023';
  end if;

  select r.* into v_reservation
    from public.usage_reservations r
   where r.id = p_reservation_id
   for update;

  if not found then
    raise exception 'usage reservation not found' using errcode = 'P0002';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_reservation.account_id::text || ':' || v_reservation.resource_code, 0)
  );

  if v_reservation.state = 'committed' then
    if v_reservation.finalization_key is distinct from p_finalization_key then
      raise exception 'reservation was committed with a different finalization key' using errcode = '22000';
    end if;
    return true;
  end if;
  if v_reservation.state in ('released', 'expired') then
    return false;
  end if;

  if v_reservation.expires_at <= pg_catalog.now() then
    for v_allocation in
      select a.credit_lot_id, a.units
        from public.usage_reservation_allocations a
       where a.reservation_id = p_reservation_id
       order by a.credit_lot_id
    loop
      update public.usage_credit_lots l
         set reserved_units = l.reserved_units - v_allocation.units
       where l.id = v_allocation.credit_lot_id
         and l.account_id = v_reservation.account_id
         and l.reserved_units >= v_allocation.units;
      get diagnostics v_updated = row_count;
      if v_updated <> 1 then
        raise exception 'usage credit reservation invariant failed while expiring' using errcode = 'P0001';
      end if;
    end loop;

    update public.usage_reservations
       set state = 'expired', released_at = pg_catalog.now(), finalization_key = p_finalization_key,
           release_reason = 'expired_before_commit'
     where id = p_reservation_id;
    return false;
  end if;

  for v_allocation in
    select a.credit_lot_id, a.units
      from public.usage_reservation_allocations a
     where a.reservation_id = p_reservation_id
     order by a.credit_lot_id
  loop
    update public.usage_credit_lots l
       set reserved_units = l.reserved_units - v_allocation.units,
           consumed_units = l.consumed_units + v_allocation.units
     where l.id = v_allocation.credit_lot_id
       and l.account_id = v_reservation.account_id
       and l.reserved_units >= v_allocation.units;
    get diagnostics v_updated = row_count;
    if v_updated <> 1 then
      raise exception 'usage credit reservation invariant failed while committing' using errcode = 'P0001';
    end if;
  end loop;

  update public.usage_reservations
     set state = 'committed', committed_at = pg_catalog.now(), finalization_key = p_finalization_key
   where id = p_reservation_id;
  return true;
end;
$$;

create or replace function public.release_usage_reservation(
  p_reservation_id uuid,
  p_finalization_key text,
  p_reason text default 'released'
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_reservation public.usage_reservations%rowtype;
  v_allocation record;
  v_updated integer;
begin
  if p_finalization_key is null or pg_catalog.length(pg_catalog.btrim(p_finalization_key)) = 0 then
    raise exception 'reservation finalization key is required' using errcode = '22023';
  end if;

  select r.* into v_reservation
    from public.usage_reservations r
   where r.id = p_reservation_id
   for update;

  if not found then
    raise exception 'usage reservation not found' using errcode = 'P0002';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_reservation.account_id::text || ':' || v_reservation.resource_code, 0)
  );

  if v_reservation.state = 'committed' then
    return false;
  end if;
  if v_reservation.state in ('released', 'expired') then
    if v_reservation.finalization_key is distinct from p_finalization_key then
      raise exception 'reservation was finalized with a different key' using errcode = '22000';
    end if;
    return true;
  end if;

  for v_allocation in
    select a.credit_lot_id, a.units
      from public.usage_reservation_allocations a
     where a.reservation_id = p_reservation_id
     order by a.credit_lot_id
  loop
    update public.usage_credit_lots l
       set reserved_units = l.reserved_units - v_allocation.units
     where l.id = v_allocation.credit_lot_id
       and l.account_id = v_reservation.account_id
       and l.reserved_units >= v_allocation.units;
    get diagnostics v_updated = row_count;
    if v_updated <> 1 then
      raise exception 'usage credit reservation invariant failed while releasing' using errcode = 'P0001';
    end if;
  end loop;

  update public.usage_reservations
     set state = 'released', released_at = pg_catalog.now(), finalization_key = p_finalization_key,
         release_reason = pg_catalog.left(coalesce(p_reason, 'released'), 500)
   where id = p_reservation_id;
  return true;
end;
$$;

create or replace function public.expire_usage_reservations(p_limit integer default 250)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_reservation record;
  v_allocation record;
  v_updated integer;
  v_expired integer := 0;
begin
  if p_limit < 1 or p_limit > 1000 then
    raise exception 'expiration batch limit must be between 1 and 1000' using errcode = '22023';
  end if;

  for v_reservation in
    select r.id, r.account_id, r.resource_code
      from public.usage_reservations r
     where r.state = 'reserved' and r.expires_at <= pg_catalog.now()
     order by
       pg_catalog.hashtextextended(r.account_id::text || ':' || r.resource_code, 0),
       r.account_id,
       r.resource_code,
       r.expires_at,
       r.id
     limit p_limit
     for update skip locked
  loop
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(v_reservation.account_id::text || ':' || v_reservation.resource_code, 0)
    );

    for v_allocation in
      select a.credit_lot_id, a.units
        from public.usage_reservation_allocations a
       where a.reservation_id = v_reservation.id
       order by a.credit_lot_id
    loop
      update public.usage_credit_lots l
         set reserved_units = l.reserved_units - v_allocation.units
       where l.id = v_allocation.credit_lot_id
         and l.account_id = v_reservation.account_id
         and l.reserved_units >= v_allocation.units;
      get diagnostics v_updated = row_count;
      if v_updated <> 1 then
        raise exception 'usage credit reservation invariant failed in expiration sweep' using errcode = 'P0001';
      end if;
    end loop;

    update public.usage_reservations
       set state = 'expired', released_at = pg_catalog.now(),
           finalization_key = 'system-expiry:' || v_reservation.id::text,
           release_reason = 'reservation_expired'
     where id = v_reservation.id and state = 'reserved';
    get diagnostics v_updated = row_count;
    v_expired := v_expired + v_updated;
  end loop;

  return v_expired;
end;
$$;

-- ---------------------------------------------------------------------------
-- New workspaces and existing development workspaces begin on Flex exactly once
-- ---------------------------------------------------------------------------

-- There are no paying legacy customers at launch. Fail the whole migration if
-- that assumption changes instead of silently turning a paid/suspended legacy
-- workspace into Flex or issuing the wrong starter balance.
do $$
begin
  if exists (select 1 from public.accounts a where a.plan::text <> 'free') then
    raise exception 'pricing backfill requires an explicit review of non-free legacy workspaces'
      using errcode = 'P0001';
  end if;
end
$$;

create or replace function public.initialize_workspace_pricing()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_issued_at timestamptz := pg_catalog.now();
begin
  insert into public.workspace_entitlements (
    account_id, plan_code, billing_interval, billing_status, entitlement_state,
    catalog_version, platform_fee_bps, starter_credits_issued_at,
    feature_limits, feature_flags
  ) values (
    new.id, 'flex', 'none', 'free', 'active', '2026-08-15-preview', 125, v_issued_at,
    '{"office_users":1,"crew_users":2,"custom_domain_connections":1,"dedicated_business_numbers":0,"storage_gb":5,"quickbooks_connections":1,"voice_concurrent_calls":1,"voice_history_days":30}'::jsonb,
    '{"quickbooks":true,"shared_lgq_texting_number":true,"voice_included":false,"voice_advanced_routing":false}'::jsonb
  ) on conflict (account_id) do nothing;

  insert into public.usage_credit_lots (
    account_id, resource_code, source_type, idempotency_key, catalog_version,
    granted_units, available_from
  )
  select new.id, seed.resource_code, 'flex_starter',
         'flex-starter:2026-08-15-preview:' || seed.resource_code,
         '2026-08-15-preview', seed.units, v_issued_at
    from (values
      ('text_segments'::text, 50::bigint),
      ('marketing_email_sends'::text, 100::bigint),
      ('ai_intake_threads'::text, 30::bigint),
      ('ai_writing_drafts'::text, 25::bigint)
    ) as seed(resource_code, units)
  on conflict (account_id, resource_code, idempotency_key) do nothing;

  return new;
end;
$$;

drop trigger if exists initialize_workspace_pricing_trigger on public.accounts;
create trigger initialize_workspace_pricing_trigger
after insert on public.accounts
for each row execute function public.initialize_workspace_pricing();

insert into public.workspace_entitlements (
  account_id, plan_code, billing_interval, billing_status, entitlement_state,
  catalog_version, platform_fee_bps, starter_credits_issued_at,
  feature_limits, feature_flags
)
select
  a.id, 'flex', 'none', 'free', 'active', '2026-08-15-preview', 125, pg_catalog.now(),
  '{"office_users":1,"crew_users":2,"custom_domain_connections":1,"dedicated_business_numbers":0,"storage_gb":5,"quickbooks_connections":1,"voice_concurrent_calls":1,"voice_history_days":30}'::jsonb,
  '{"quickbooks":true,"shared_lgq_texting_number":true,"voice_included":false,"voice_advanced_routing":false}'::jsonb
from public.accounts a
on conflict (account_id) do nothing;

insert into public.usage_credit_lots (
  account_id, resource_code, source_type, idempotency_key, catalog_version,
  granted_units, available_from
)
select
  a.id,
  seed.resource_code,
  'flex_starter',
  'flex-starter:2026-08-15-preview:' || seed.resource_code,
  '2026-08-15-preview',
  seed.units,
  e.starter_credits_issued_at
from public.accounts a
join public.workspace_entitlements e on e.account_id = a.id
cross join (values
  ('text_segments'::text, 50::bigint),
  ('marketing_email_sends'::text, 100::bigint),
  ('ai_intake_threads'::text, 30::bigint),
  ('ai_writing_drafts'::text, 25::bigint)
) as seed(resource_code, units)
where e.plan_code = 'flex'
on conflict (account_id, resource_code, idempotency_key) do nothing;

-- ---------------------------------------------------------------------------
-- RLS and explicit Data API grants (Supabase's 2026 opt-in exposure model)
-- ---------------------------------------------------------------------------

alter table public.billing_subscriptions enable row level security;
alter table public.workspace_entitlements enable row level security;
alter table public.billing_events enable row level security;
alter table public.billing_payment_operations enable row level security;
alter table public.usage_credit_lots enable row level security;
alter table public.usage_reservations enable row level security;
alter table public.usage_reservation_allocations enable row level security;

drop policy if exists workspace_entitlements_owner_read on public.workspace_entitlements;
create policy workspace_entitlements_owner_read
on public.workspace_entitlements
for select
to authenticated
using ((select public.is_owner(account_id)));

drop policy if exists usage_credit_lots_owner_read on public.usage_credit_lots;
create policy usage_credit_lots_owner_read
on public.usage_credit_lots
for select
to authenticated
using ((select public.is_owner(account_id)));

-- Default privileges vary across Supabase projects. Revoke first, then grant
-- the exact API surface this migration intends.
revoke all on table public.billing_subscriptions from public, anon, authenticated;
revoke all on table public.workspace_entitlements from public, anon, authenticated;
revoke all on table public.billing_events from public, anon, authenticated;
revoke all on table public.billing_payment_operations from public, anon, authenticated;
revoke all on table public.usage_credit_lots from public, anon, authenticated;
revoke all on table public.usage_reservations from public, anon, authenticated;
revoke all on table public.usage_reservation_allocations from public, anon, authenticated;
revoke all on table public.workspace_usage_credit_balances from public, anon, authenticated;

grant select on table public.workspace_entitlements to authenticated;
grant select (
  account_id, resource_code, granted_units, consumed_units, reserved_units,
  revoked_units, available_from, expires_at
) on table public.usage_credit_lots to authenticated;
grant select on table public.workspace_usage_credit_balances to authenticated;

grant select, insert, update on table public.billing_subscriptions to service_role;
grant select, insert, update on table public.workspace_entitlements to service_role;
grant select, insert, update on table public.billing_events to service_role;
grant select, insert, update on table public.billing_payment_operations to service_role;
grant select on table public.usage_credit_lots to service_role;
grant select on table public.usage_reservations to service_role;
grant select on table public.usage_reservation_allocations to service_role;
grant select on table public.workspace_usage_credit_balances to service_role;

-- Every SECURITY DEFINER function is a backend capability, never a public RPC.
revoke all on function public.grant_usage_credits(uuid, text, bigint, text, text, text, uuid, timestamptz, timestamptz, jsonb)
  from public, anon, authenticated;
grant execute on function public.grant_usage_credits(uuid, text, bigint, text, text, text, uuid, timestamptz, timestamptz, jsonb)
  to service_role;

revoke all on function public.reserve_usage_credits(uuid, text, bigint, text, text, timestamptz, jsonb)
  from public, anon, authenticated;
grant execute on function public.reserve_usage_credits(uuid, text, bigint, text, text, timestamptz, jsonb)
  to service_role;

revoke all on function public.commit_usage_reservation(uuid, text)
  from public, anon, authenticated;
grant execute on function public.commit_usage_reservation(uuid, text)
  to service_role;

revoke all on function public.release_usage_reservation(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.release_usage_reservation(uuid, text, text)
  to service_role;

revoke all on function public.expire_usage_reservations(integer)
  from public, anon, authenticated;
grant execute on function public.expire_usage_reservations(integer)
  to service_role;

revoke all on function public.initialize_workspace_pricing()
  from public, anon, authenticated;
grant execute on function public.initialize_workspace_pricing()
  to service_role;

commit;
