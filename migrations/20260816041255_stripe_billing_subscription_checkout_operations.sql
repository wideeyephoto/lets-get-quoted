-- Dark, crash-safe platform Stripe Billing Checkout foundation.
--
-- This migration is intentionally isolated from active callers. It mode-scopes
-- the externally confirmed empty subscription ledger, but activates no route,
-- entitlement, fulfillment, subscription, or plan-transition behavior. A
-- `checkout_created` row remains pending until a future, separately reviewed
-- platform-webhook reconciler resolves it. Submitted and indeterminate creates
-- are never reclaimed automatically because Stripe idempotency is finite-lived.

begin;

-- Both production and staging were externally confirmed empty on 2026-08-16.
-- Take an exclusive lock and prove that invariant again inside this transaction
-- so a concurrent first insert cannot acquire an unbound mode during rollout.
lock table public.billing_subscriptions in access exclusive mode;

do $$
begin
  if exists (select 1 from public.billing_subscriptions) then
    raise exception 'billing_subscriptions must be empty before adding mandatory Stripe mode'
      using errcode = '55000';
  end if;
end
$$;

alter table public.billing_subscriptions
  add column livemode boolean not null;

alter table public.billing_subscriptions
  drop constraint billing_subscriptions_provider_subscription_unique,
  add constraint billing_subscriptions_provider_subscription_unique
    unique (provider, livemode, provider_subscription_id),
  add constraint billing_subscriptions_id_livemode_unique
    unique (id, livemode);

drop index public.billing_subscriptions_customer_idx;
create index billing_subscriptions_customer_idx
  on public.billing_subscriptions (provider, livemode, provider_customer_id);
create index billing_subscriptions_price_idx
  on public.billing_subscriptions (provider, livemode, provider_price_id);
create unique index billing_subscriptions_item_unique
  on public.billing_subscriptions (provider, livemode, provider_subscription_item_id)
  where provider_subscription_item_id is not null;

-- Platform Billing Customers are not connected-account homeowner Customers.
-- One immutable Stripe Customer identity is allowed per workspace and mode.
-- An existing mapping is reused at Session create. Stripe creates the first
-- Customer only on Checkout confirmation, so the first mapping is deliberately
-- deferred to a future, separately reviewed platform-webhook RPC.
create table public.billing_subscription_customers (
  account_id uuid not null references public.accounts(id) on delete restrict,
  provider text not null default 'stripe' check (provider = 'stripe'),
  livemode boolean not null,
  provider_customer_id text not null check (
    provider_customer_id ~ '^cus_[A-Za-z0-9]{8,}$'
    and pg_catalog.length(provider_customer_id) <= 255
  ),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  primary key (account_id, provider, livemode),
  constraint billing_subscription_customers_provider_identity_unique
    unique (provider, livemode, provider_customer_id),
  constraint billing_subscription_customers_workspace_identity_unique
    unique (account_id, provider, livemode, provider_customer_id),
  constraint billing_subscription_customers_operation_reference_unique
    unique (account_id, livemode, provider_customer_id)
);

alter table public.billing_subscription_customers enable row level security;
alter table public.billing_subscription_customers force row level security;

create function public.protect_billing_subscription_customer_identity()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'platform Billing Customer identities cannot be deleted'
      using errcode = '42501';
  end if;
  if old.account_id is distinct from new.account_id
     or old.provider is distinct from new.provider
     or old.livemode is distinct from new.livemode
     or old.provider_customer_id is distinct from new.provider_customer_id
     or old.created_at is distinct from new.created_at then
    raise exception 'platform Billing Customer identity is immutable'
      using errcode = '22000';
  end if;
  return new;
end;
$$;

create trigger protect_billing_subscription_customer_identity_update
before update on public.billing_subscription_customers
for each row execute function public.protect_billing_subscription_customer_identity();

create trigger protect_billing_subscription_customer_identity_delete
before delete on public.billing_subscription_customers
for each row execute function public.protect_billing_subscription_customer_identity();

revoke all on function public.protect_billing_subscription_customer_identity()
  from public, anon, authenticated, service_role;

alter table public.billing_subscriptions
  add constraint billing_subscriptions_customer_mode_fk
  foreign key (account_id, provider, livemode, provider_customer_id)
  references public.billing_subscription_customers (
    account_id, provider, livemode, provider_customer_id
  ) on delete restrict;

create table public.billing_subscription_checkout_operations (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete restrict,
  operation_id text not null check (
    pg_catalog.length(pg_catalog.btrim(operation_id)) between 1 and 200
    and operation_id !~ '[[:cntrl:]]'
  ),
  purpose text not null default 'base_plan_subscription'
    check (purpose = 'base_plan_subscription'),
  plan_code text not null check (plan_code in ('solo', 'growth', 'scale')),
  billing_interval text not null check (billing_interval in ('monthly', 'annual')),
  catalog_version text not null check (catalog_version = '2026-08-15-preview'),
  livemode boolean not null,
  stripe_price_id text not null check (
    stripe_price_id ~ '^price_[A-Za-z0-9]{8,}$'
    and pg_catalog.length(stripe_price_id) <= 255
  ),
  stripe_product_id text not null check (
    stripe_product_id ~ '^prod_[A-Za-z0-9]{8,}$'
    and pg_catalog.length(stripe_product_id) <= 255
  ),
  provider_customer_id text check (
    provider_customer_id is null
    or (
      provider_customer_id ~ '^cus_[A-Za-z0-9]{8,}$'
      and pg_catalog.length(provider_customer_id) <= 255
    )
  ),
  currency text not null default 'usd' check (currency = 'usd'),
  unit_amount_cents bigint not null check (unit_amount_cents > 0),
  terms_version text not null check (terms_version = '2026-08-03'),
  recurring_consent_version text not null check (
    recurring_consent_version ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
    and pg_catalog.length(recurring_consent_version) <= 100
  ),
  stripe_idempotency_key text not null check (
    stripe_idempotency_key ~ '^lgq:billing:v1:subscription_checkout[.]create:[0-9a-f]{64}$'
    and pg_catalog.length(stripe_idempotency_key) <= 255
  ),
  request_fingerprint text check (
    request_fingerprint is null or request_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  state text not null default 'claimed'
    check (state in (
      'claimed', 'submitted', 'checkout_created', 'indeterminate',
      'activated', 'expired', 'canceled'
    )),
  claim_token uuid,
  lease_expires_at timestamptz,
  submission_started_at timestamptz,
  checkout_expires_at timestamptz,
  provider_object_id text,
  checkout_created_at timestamptz,
  resolved_at timestamptz,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_error text,
  metadata jsonb not null default '{}'::jsonb
    check (pg_catalog.jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint billing_subscription_checkout_business_key_unique
    unique (account_id, operation_id),
  constraint billing_subscription_checkout_idempotency_key_unique
    unique (livemode, stripe_idempotency_key),
  constraint billing_subscription_checkout_customer_mode_fk
    foreign key (account_id, livemode, provider_customer_id)
    references public.billing_subscription_customers (
      account_id, livemode, provider_customer_id
    ) on delete restrict,
  constraint billing_subscription_checkout_catalog_binding_check check (
    (plan_code = 'solo' and billing_interval = 'monthly' and unit_amount_cents = 3900)
    or (plan_code = 'solo' and billing_interval = 'annual' and unit_amount_cents = 42000)
    or (plan_code = 'growth' and billing_interval = 'monthly' and unit_amount_cents = 12900)
    or (plan_code = 'growth' and billing_interval = 'annual' and unit_amount_cents = 118800)
    or (plan_code = 'scale' and billing_interval = 'monthly' and unit_amount_cents = 32900)
    or (plan_code = 'scale' and billing_interval = 'annual' and unit_amount_cents = 358800)
  ),
  constraint billing_subscription_checkout_provider_mode_check check (
    provider_object_id is null
    or (
      pg_catalog.length(provider_object_id) <= 255
      and (
        (livemode and provider_object_id ~ '^cs_live_[A-Za-z0-9_]+$')
        or (not livemode and provider_object_id ~ '^cs_test_[A-Za-z0-9_]+$')
      )
    )
  ),
  constraint billing_subscription_checkout_state_shape_check check (
    (
      state = 'claimed'
      and claim_token is not null
      and lease_expires_at is not null
      and submission_started_at is null
      and checkout_expires_at is null
      and request_fingerprint is null
      and provider_object_id is null
      and checkout_created_at is null
      and resolved_at is null
      and attempt_count = 0
    )
    or (
      state = 'submitted'
      and claim_token is not null
      and lease_expires_at is null
      and submission_started_at is not null
      and checkout_expires_at is not null
      and request_fingerprint is not null
      and provider_object_id is null
      and checkout_created_at is null
      and resolved_at is null
      and attempt_count = 1
    )
    or (
      state = 'checkout_created'
      and claim_token is null
      and lease_expires_at is null
      and submission_started_at is not null
      and checkout_expires_at is not null
      and request_fingerprint is not null
      and provider_object_id is not null
      and checkout_created_at is not null
      and resolved_at is null
      and attempt_count = 1
    )
    or (
      state = 'indeterminate'
      and claim_token is null
      and lease_expires_at is null
      and submission_started_at is not null
      and checkout_expires_at is not null
      and request_fingerprint is not null
      and provider_object_id is null
      and checkout_created_at is null
      and resolved_at is null
      and attempt_count = 1
      and last_error is not null
    )
    or (
      state in ('activated', 'expired', 'canceled')
      and claim_token is null
      and lease_expires_at is null
      and resolved_at is not null
      and request_fingerprint is not null
      and attempt_count = 1
    )
  )
);

-- Claimed, provider-ambiguous, and created-but-unfulfilled Sessions all block a
-- second plan change. Only an explicit future terminal reconciliation
-- releases this workspace-level guard.
create unique index billing_subscription_checkout_one_pending_per_account
  on public.billing_subscription_checkout_operations (account_id)
  where state in ('claimed', 'submitted', 'checkout_created', 'indeterminate');

create unique index billing_subscription_checkout_provider_object_unique
  on public.billing_subscription_checkout_operations (livemode, provider_object_id)
  where provider_object_id is not null;

create index billing_subscription_checkout_reconciliation_queue_idx
  on public.billing_subscription_checkout_operations (state, created_at, id)
  where state in ('submitted', 'checkout_created', 'indeterminate');

alter table public.billing_subscription_checkout_operations enable row level security;
alter table public.billing_subscription_checkout_operations force row level security;

create function public.protect_billing_subscription_checkout_operation()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'subscription Checkout operation audit rows cannot be deleted'
      using errcode = '42501';
  end if;

  if old.account_id is distinct from new.account_id
     or old.operation_id is distinct from new.operation_id
     or old.purpose is distinct from new.purpose
     or old.plan_code is distinct from new.plan_code
     or old.billing_interval is distinct from new.billing_interval
     or old.catalog_version is distinct from new.catalog_version
     or old.livemode is distinct from new.livemode
     or old.stripe_price_id is distinct from new.stripe_price_id
     or old.stripe_product_id is distinct from new.stripe_product_id
     or old.provider_customer_id is distinct from new.provider_customer_id
     or old.currency is distinct from new.currency
     or old.unit_amount_cents is distinct from new.unit_amount_cents
     or old.terms_version is distinct from new.terms_version
     or old.recurring_consent_version is distinct from new.recurring_consent_version
     or old.stripe_idempotency_key is distinct from new.stripe_idempotency_key
     or old.created_at is distinct from new.created_at then
    raise exception 'subscription Checkout immutable binding cannot change'
      using errcode = '22000';
  end if;

  if old.request_fingerprint is not null
     and old.request_fingerprint is distinct from new.request_fingerprint then
    raise exception 'subscription Checkout request fingerprint is immutable after binding'
      using errcode = '22000';
  end if;

  if old.checkout_expires_at is not null
     and old.checkout_expires_at is distinct from new.checkout_expires_at then
    raise exception 'subscription Checkout expiration is immutable after binding'
      using errcode = '22000';
  end if;

  if old.provider_object_id is not null
     and old.provider_object_id is distinct from new.provider_object_id then
    raise exception 'subscription Checkout provider object is immutable once assigned'
      using errcode = '22000';
  end if;

  if new.attempt_count < old.attempt_count then
    raise exception 'subscription Checkout attempt count cannot decrease'
      using errcode = '22000';
  end if;

  if old.state is distinct from new.state
     and not (
       (old.state = 'claimed' and new.state = 'submitted')
       or (old.state = 'submitted' and new.state in ('checkout_created', 'indeterminate'))
       or (
         old.state in ('checkout_created', 'indeterminate')
         and new.state in ('activated', 'expired', 'canceled')
       )
     ) then
    raise exception 'invalid subscription Checkout state transition: % -> %', old.state, new.state
      using errcode = '22000';
  end if;

  return new;
end;
$$;

create trigger protect_billing_subscription_checkout_operation_update
before update on public.billing_subscription_checkout_operations
for each row execute function public.protect_billing_subscription_checkout_operation();

create trigger protect_billing_subscription_checkout_operation_delete
before delete on public.billing_subscription_checkout_operations
for each row execute function public.protect_billing_subscription_checkout_operation();

revoke all on function public.protect_billing_subscription_checkout_operation()
  from public, anon, authenticated, service_role;

create function public.claim_stripe_billing_subscription_checkout(
  p_account_id uuid,
  p_operation_id text,
  p_plan_code text,
  p_billing_interval text,
  p_catalog_version text,
  p_livemode boolean,
  p_stripe_price_id text,
  p_stripe_product_id text,
  p_currency text,
  p_unit_amount_cents bigint,
  p_terms_version text,
  p_recurring_consent_version text,
  p_stripe_idempotency_key text
)
returns table (
  claim_status text,
  operation_pk uuid,
  claim_token uuid,
  operation_state text,
  provider_object_id text,
  provider_customer_id text,
  checkout_expires_at_epoch bigint
)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_operation public.billing_subscription_checkout_operations%rowtype;
  v_entitlement public.workspace_entitlements%rowtype;
  v_account public.accounts%rowtype;
  v_expected_amount bigint;
  v_claim_token uuid := pg_catalog.gen_random_uuid();
  v_provider_customer_id text;
begin
  if p_operation_id is null
     or pg_catalog.length(pg_catalog.btrim(p_operation_id)) not between 1 and 200
     or p_operation_id ~ '[[:cntrl:]]' then
    raise exception 'invalid subscription Checkout operation ID' using errcode = '22023';
  end if;
  if p_plan_code is null or p_plan_code not in ('solo', 'growth', 'scale')
     or p_billing_interval is null or p_billing_interval not in ('monthly', 'annual') then
    raise exception 'invalid subscription Checkout plan selection' using errcode = '22023';
  end if;
  if p_catalog_version is distinct from '2026-08-15-preview' then
    raise exception 'subscription Checkout catalog version is not supported' using errcode = '22023';
  end if;
  if p_livemode is null then
    raise exception 'subscription Checkout livemode is required' using errcode = '22023';
  end if;
  if p_stripe_price_id is null
     or p_stripe_price_id !~ '^price_[A-Za-z0-9]{8,}$'
     or pg_catalog.length(p_stripe_price_id) > 255
     or p_stripe_product_id is null
     or p_stripe_product_id !~ '^prod_[A-Za-z0-9]{8,}$'
     or pg_catalog.length(p_stripe_product_id) > 255 then
    raise exception 'invalid verified Stripe Price binding' using errcode = '22023';
  end if;
  if p_currency is distinct from 'usd' then
    raise exception 'subscription Checkout currency must be usd' using errcode = '22023';
  end if;
  if p_terms_version is distinct from '2026-08-03'
     or p_recurring_consent_version is null
     or p_recurring_consent_version !~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
     or pg_catalog.length(p_recurring_consent_version) > 100 then
    raise exception 'subscription Checkout consent metadata is not valid'
      using errcode = '22023';
  end if;
  if p_stripe_idempotency_key is null
     or p_stripe_idempotency_key !~ '^lgq:billing:v1:subscription_checkout[.]create:[0-9a-f]{64}$'
     or pg_catalog.length(p_stripe_idempotency_key) > 255 then
    raise exception 'invalid subscription Checkout request identity' using errcode = '22023';
  end if;

  v_expected_amount := case
    when p_plan_code = 'solo' and p_billing_interval = 'monthly' then 3900
    when p_plan_code = 'solo' and p_billing_interval = 'annual' then 42000
    when p_plan_code = 'growth' and p_billing_interval = 'monthly' then 12900
    when p_plan_code = 'growth' and p_billing_interval = 'annual' then 118800
    when p_plan_code = 'scale' and p_billing_interval = 'monthly' then 32900
    when p_plan_code = 'scale' and p_billing_interval = 'annual' then 358800
    else null
  end;
  if p_unit_amount_cents is distinct from v_expected_amount then
    raise exception 'subscription Checkout amount does not match the canonical catalog'
      using errcode = '22000';
  end if;

  -- Every orchestration RPC uses account -> entitlement -> operation ordering.
  -- The account row serializes competing plan-change claims for this workspace.
  select a.*
    into v_account
    from public.accounts a
   where a.id = p_account_id
   for update;
  if not found then
    raise exception 'subscription Checkout workspace was not found' using errcode = 'P0002';
  end if;
  if v_account.terms_accepted_at is null
     or v_account.terms_version is distinct from p_terms_version then
    raise exception 'workspace must accept the exact current Terms before subscription Checkout'
      using errcode = '55000';
  end if;

  select e.*
    into v_entitlement
    from public.workspace_entitlements e
   where e.account_id = p_account_id
   for share;
  if not found
     or v_entitlement.plan_code <> 'flex'
     or v_entitlement.billing_interval <> 'none'
     or v_entitlement.billing_status <> 'free'
     or v_entitlement.entitlement_state <> 'active' then
    raise exception 'new subscription Checkout requires an active Flex workspace'
      using errcode = '55000';
  end if;

  -- This first-subscription foundation deliberately does not implement paid
  -- upgrades, downgrades, reactivation, or proration.
  perform 1
    from public.billing_subscriptions s
   where s.account_id = p_account_id
   for share;
  if found then
    raise exception 'existing subscription history requires the future plan-change flow'
      using errcode = '0A000';
  end if;

  select c.provider_customer_id
    into v_provider_customer_id
    from public.billing_subscription_customers c
   where c.account_id = p_account_id
     and c.provider = 'stripe'
     and c.livemode = p_livemode
   for share;

  select o.*
    into v_operation
    from public.billing_subscription_checkout_operations o
   where o.account_id = p_account_id
     and o.operation_id = pg_catalog.btrim(p_operation_id)
   for update;

  if found then
    if v_operation.purpose <> 'base_plan_subscription'
       or v_operation.plan_code is distinct from p_plan_code
       or v_operation.billing_interval is distinct from p_billing_interval
       or v_operation.catalog_version is distinct from p_catalog_version
       or v_operation.livemode is distinct from p_livemode
       or v_operation.stripe_price_id is distinct from p_stripe_price_id
       or v_operation.stripe_product_id is distinct from p_stripe_product_id
       or v_operation.currency is distinct from p_currency
       or v_operation.unit_amount_cents is distinct from p_unit_amount_cents
       or v_operation.terms_version is distinct from p_terms_version
       or v_operation.recurring_consent_version is distinct from p_recurring_consent_version
       or v_operation.stripe_idempotency_key is distinct from p_stripe_idempotency_key then
      raise exception 'operation ID was already claimed with different immutable subscription input'
        using errcode = '22000';
    end if;

    if v_operation.state = 'checkout_created' then
      if v_operation.provider_object_id is null then
        raise exception 'created subscription Checkout is missing its provider object'
          using errcode = 'P0001';
      end if;
      return query select
        'replay'::text,
        v_operation.id,
        null::uuid,
        v_operation.state,
        v_operation.provider_object_id,
        v_operation.provider_customer_id,
        pg_catalog.date_part('epoch', v_operation.checkout_expires_at)::bigint;
      return;
    end if;

    if v_operation.state = 'claimed'
       and v_operation.lease_expires_at <= pg_catalog.now() then
      update public.billing_subscription_checkout_operations o
         set claim_token = v_claim_token,
             lease_expires_at = pg_catalog.now() + interval '5 minutes',
             last_error = null,
             updated_at = pg_catalog.now()
       where o.id = v_operation.id
      returning * into v_operation;

      return query select
        'claimed'::text,
        v_operation.id,
        v_operation.claim_token,
        v_operation.state,
        v_operation.provider_object_id,
        v_operation.provider_customer_id,
        null::bigint;
      return;
    end if;

    return query select
      case when v_operation.state = 'claimed' then 'in_progress' else v_operation.state end,
      v_operation.id,
      null::uuid,
      v_operation.state,
      v_operation.provider_object_id,
      v_operation.provider_customer_id,
      case when v_operation.checkout_expires_at is null then null::bigint
        else pg_catalog.date_part('epoch', v_operation.checkout_expires_at)::bigint end;
    return;
  end if;

  select o.*
    into v_operation
    from public.billing_subscription_checkout_operations o
   where o.account_id = p_account_id
     and o.state in ('claimed', 'submitted', 'checkout_created', 'indeterminate')
   order by o.created_at, o.id
   limit 1
   for update;
  if found then
    return query select
      'pending_conflict'::text,
      v_operation.id,
      null::uuid,
      v_operation.state,
      v_operation.provider_object_id,
      v_operation.provider_customer_id,
      case when v_operation.checkout_expires_at is null then null::bigint
        else pg_catalog.date_part('epoch', v_operation.checkout_expires_at)::bigint end;
    return;
  end if;

  insert into public.billing_subscription_checkout_operations (
    account_id,
    operation_id,
    purpose,
    plan_code,
    billing_interval,
    catalog_version,
    livemode,
    stripe_price_id,
    stripe_product_id,
    provider_customer_id,
    currency,
    unit_amount_cents,
    terms_version,
    recurring_consent_version,
    stripe_idempotency_key,
    state,
    claim_token,
    lease_expires_at,
    metadata
  ) values (
    p_account_id,
    pg_catalog.btrim(p_operation_id),
    'base_plan_subscription',
    p_plan_code,
    p_billing_interval,
    p_catalog_version,
    p_livemode,
    p_stripe_price_id,
    p_stripe_product_id,
    v_provider_customer_id,
    p_currency,
    p_unit_amount_cents,
    p_terms_version,
    p_recurring_consent_version,
    p_stripe_idempotency_key,
    'claimed',
    v_claim_token,
    pg_catalog.now() + interval '5 minutes',
    pg_catalog.jsonb_build_object(
      'schema', 'base_plan_subscription_checkout_v1',
      'purpose', 'base_plan_subscription',
      'plan_code', p_plan_code,
      'billing_interval', p_billing_interval,
      'catalog_version', p_catalog_version,
      'livemode', p_livemode,
      'stripe_price_id', p_stripe_price_id,
      'stripe_product_id', p_stripe_product_id,
      'provider_customer_id', v_provider_customer_id,
      'currency', p_currency,
      'unit_amount_cents', p_unit_amount_cents,
      'terms_version', p_terms_version,
      'recurring_consent_version', p_recurring_consent_version
    )
  )
  returning * into v_operation;

  return query select
    'claimed'::text,
    v_operation.id,
    v_operation.claim_token,
    v_operation.state,
    v_operation.provider_object_id,
    v_operation.provider_customer_id,
    null::bigint;
end;
$$;

create function public.begin_stripe_billing_subscription_checkout_submission(
  p_operation_pk uuid,
  p_claim_token uuid,
  p_checkout_expires_at timestamptz,
  p_request_fingerprint text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_hint public.billing_subscription_checkout_operations%rowtype;
  v_operation public.billing_subscription_checkout_operations%rowtype;
  v_entitlement public.workspace_entitlements%rowtype;
begin
  if p_checkout_expires_at is null
     or p_checkout_expires_at < pg_catalog.now() + interval '30 minutes'
     or p_checkout_expires_at > pg_catalog.now() + interval '31 minutes'
     or p_request_fingerprint is null
     or p_request_fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception 'subscription Checkout request binding or 30-minute expiry is invalid'
      using errcode = '22023';
  end if;

  select o.*
    into v_hint
    from public.billing_subscription_checkout_operations o
   where o.id = p_operation_pk;
  if not found then
    raise exception 'subscription Checkout operation was not found' using errcode = 'P0002';
  end if;

  perform 1
    from public.accounts a
   where a.id = v_hint.account_id
   for update;
  if not found then
    raise exception 'subscription Checkout workspace was not found' using errcode = 'P0002';
  end if;

  select e.*
    into v_entitlement
    from public.workspace_entitlements e
   where e.account_id = v_hint.account_id
   for share;
  if not found
     or v_entitlement.plan_code <> 'flex'
     or v_entitlement.billing_interval <> 'none'
     or v_entitlement.billing_status <> 'free'
     or v_entitlement.entitlement_state <> 'active' then
    raise exception 'workspace is no longer eligible for new subscription Checkout'
      using errcode = '55000';
  end if;

  perform 1
    from public.billing_subscriptions s
   where s.account_id = v_hint.account_id
   for share;
  if found then
    raise exception 'subscription history appeared before Checkout submission'
      using errcode = '55000';
  end if;

  select o.*
    into v_operation
    from public.billing_subscription_checkout_operations o
   where o.id = p_operation_pk
   for update;

  if v_operation.state <> 'claimed'
     or v_operation.claim_token is distinct from p_claim_token
     or v_operation.lease_expires_at is null
     or v_operation.lease_expires_at <= pg_catalog.now() then
    raise exception 'subscription Checkout claim is not owned or has expired'
      using errcode = '55000';
  end if;

  update public.billing_subscription_checkout_operations o
     set state = 'submitted',
         submission_started_at = pg_catalog.now(),
         checkout_expires_at = p_checkout_expires_at,
         request_fingerprint = p_request_fingerprint,
         lease_expires_at = null,
         attempt_count = 1,
         last_error = null,
         metadata = o.metadata || pg_catalog.jsonb_build_object(
           'checkout_expires_at', p_checkout_expires_at,
           'request_fingerprint', p_request_fingerprint
         ),
         updated_at = pg_catalog.now()
   where o.id = p_operation_pk;

  return true;
end;
$$;

create function public.complete_stripe_billing_subscription_checkout(
  p_operation_pk uuid,
  p_claim_token uuid,
  p_checkout_session_id text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_hint public.billing_subscription_checkout_operations%rowtype;
  v_operation public.billing_subscription_checkout_operations%rowtype;
begin
  if p_checkout_session_id is null
     or p_checkout_session_id !~ '^cs_(test|live)_[A-Za-z0-9_]+$'
     or pg_catalog.length(p_checkout_session_id) > 255 then
    raise exception 'invalid Stripe subscription Checkout Session ID' using errcode = '22023';
  end if;

  select o.*
    into v_hint
    from public.billing_subscription_checkout_operations o
   where o.id = p_operation_pk;
  if not found then
    raise exception 'subscription Checkout operation was not found' using errcode = 'P0002';
  end if;

  perform 1
    from public.accounts a
   where a.id = v_hint.account_id
   for share;

  select o.*
    into v_operation
    from public.billing_subscription_checkout_operations o
   where o.id = p_operation_pk
   for update;

  if v_operation.state <> 'submitted'
     or v_operation.claim_token is distinct from p_claim_token then
    raise exception 'subscription Checkout submission is not owned by this claim'
      using errcode = '55000';
  end if;
  if (v_operation.livemode and p_checkout_session_id !~ '^cs_live_')
     or (not v_operation.livemode and p_checkout_session_id !~ '^cs_test_') then
    raise exception 'subscription Checkout Session mode does not match its Price binding'
      using errcode = '22000';
  end if;

  update public.billing_subscription_checkout_operations o
     set state = 'checkout_created',
         provider_object_id = p_checkout_session_id,
         checkout_created_at = pg_catalog.now(),
         claim_token = null,
         lease_expires_at = null,
         last_error = null,
         updated_at = pg_catalog.now()
   where o.id = p_operation_pk;

  return true;
end;
$$;

create function public.mark_stripe_billing_subscription_checkout_indeterminate(
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
  v_hint public.billing_subscription_checkout_operations%rowtype;
  v_operation public.billing_subscription_checkout_operations%rowtype;
begin
  select o.*
    into v_hint
    from public.billing_subscription_checkout_operations o
   where o.id = p_operation_pk;
  if not found then
    raise exception 'subscription Checkout operation was not found' using errcode = 'P0002';
  end if;

  perform 1
    from public.accounts a
   where a.id = v_hint.account_id
   for share;

  select o.*
    into v_operation
    from public.billing_subscription_checkout_operations o
   where o.id = p_operation_pk
   for update;

  if v_operation.state <> 'submitted'
     or v_operation.claim_token is distinct from p_claim_token then
    raise exception 'subscription Checkout submission is not owned by this claim'
      using errcode = '55000';
  end if;

  update public.billing_subscription_checkout_operations o
     set state = 'indeterminate',
         claim_token = null,
         lease_expires_at = null,
         last_error = pg_catalog.left(
           coalesce(nullif(pg_catalog.btrim(p_last_error), ''),
             'Stripe subscription Checkout outcome is unknown'),
           2000
         ),
         updated_at = pg_catalog.now()
   where o.id = p_operation_pk;

  return true;
end;
$$;

-- The service role can inspect this ledger but can mutate it only through the
-- compare-and-set RPCs. No anon/authenticated policy or table grant exists.
revoke all on table public.billing_subscription_customers
  from public, anon, authenticated, service_role;
grant select on table public.billing_subscription_customers to service_role;

revoke all on table public.billing_subscription_checkout_operations
  from public, anon, authenticated, service_role;
grant select on table public.billing_subscription_checkout_operations to service_role;

revoke all on function public.claim_stripe_billing_subscription_checkout(
  uuid, text, text, text, text, boolean, text, text, text, bigint, text, text, text
) from public, anon, authenticated, service_role;
revoke all on function public.begin_stripe_billing_subscription_checkout_submission(
  uuid, uuid, timestamptz, text
)
  from public, anon, authenticated, service_role;
revoke all on function public.complete_stripe_billing_subscription_checkout(uuid, uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.mark_stripe_billing_subscription_checkout_indeterminate(uuid, uuid, text)
  from public, anon, authenticated, service_role;

grant execute on function public.claim_stripe_billing_subscription_checkout(
  uuid, text, text, text, text, boolean, text, text, text, bigint, text, text, text
) to service_role;
grant execute on function public.begin_stripe_billing_subscription_checkout_submission(
  uuid, uuid, timestamptz, text
)
  to service_role;
grant execute on function public.complete_stripe_billing_subscription_checkout(uuid, uuid, text)
  to service_role;
grant execute on function public.mark_stripe_billing_subscription_checkout_indeterminate(uuid, uuid, text)
  to service_role;

comment on table public.billing_subscription_checkout_operations is
  'Dark platform Stripe Billing Checkout claims; no entitlement activation occurs here.';

commit;

-- Rollback, only after the dark application modules are removed/disabled:
--   begin;
--   drop function public.mark_stripe_billing_subscription_checkout_indeterminate(uuid, uuid, text);
--   drop function public.complete_stripe_billing_subscription_checkout(uuid, uuid, text);
--   drop function public.begin_stripe_billing_subscription_checkout_submission(
--     uuid, uuid, timestamptz, text
--   );
--   drop function public.claim_stripe_billing_subscription_checkout(
--     uuid, text, text, text, text, boolean, text, text, text, bigint, text, text, text
--   );
--   drop table public.billing_subscription_checkout_operations;
--   drop function public.protect_billing_subscription_checkout_operation();
--   alter table public.billing_subscriptions
--     drop constraint billing_subscriptions_customer_mode_fk;
--   drop table public.billing_subscription_customers;
--   drop function public.protect_billing_subscription_customer_identity();
--   drop index public.billing_subscriptions_item_unique;
--   drop index public.billing_subscriptions_price_idx;
--   drop index public.billing_subscriptions_customer_idx;
--   create index billing_subscriptions_customer_idx
--     on public.billing_subscriptions (provider, provider_customer_id);
--   alter table public.billing_subscriptions
--     drop constraint billing_subscriptions_id_livemode_unique,
--     drop constraint billing_subscriptions_provider_subscription_unique,
--     add constraint billing_subscriptions_provider_subscription_unique
--       unique (provider, provider_subscription_id),
--     drop column livemode;
--   commit;
