-- Canonical, authenticated recurring-consent evidence for the dark platform
-- Stripe Billing Checkout foundation.
--
-- Consent is captured by an authenticated-only RPC which records auth.uid()
-- itself. Evidence is bound to one workspace, one future operation ID, and the
-- complete immutable plan/price/Terms/artifact contract. Unclaimed evidence is
-- valid for 30 minutes. One evidence row can back only one Checkout operation;
-- a replay of that same operation is allowed, while changed input fails closed.

begin;

create table public.billing_subscription_consent_acceptances (
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
  unit_amount_cents bigint not null check (unit_amount_cents > 0),
  currency text not null default 'usd' check (currency = 'usd'),
  terms_version text not null check (terms_version = '2026-08-16'),
  recurring_consent_version text not null
    check (recurring_consent_version = 'base-plan-recurring-2026-08-16'),
  recurring_consent_text_sha256 text not null check (
    recurring_consent_text_sha256 =
      'f39aeedb379d397f941d3c5fc48357703b4cc97148d8b1bb3c2f55b04e449c75'
  ),
  -- Deliberately no auth.users FK: deleting an identity must not erase or
  -- weaken historical evidence of who accepted a recurring charge.
  accepted_by uuid not null,
  accepted_at timestamptz not null,
  expires_at timestamptz not null,
  created_at timestamptz not null,
  constraint billing_subscription_consent_catalog_binding_check check (
    (plan_code = 'solo' and billing_interval = 'monthly' and unit_amount_cents = 3900)
    or (plan_code = 'solo' and billing_interval = 'annual' and unit_amount_cents = 42000)
    or (plan_code = 'growth' and billing_interval = 'monthly' and unit_amount_cents = 12900)
    or (plan_code = 'growth' and billing_interval = 'annual' and unit_amount_cents = 118800)
    or (plan_code = 'scale' and billing_interval = 'monthly' and unit_amount_cents = 32900)
    or (plan_code = 'scale' and billing_interval = 'annual' and unit_amount_cents = 358800)
  ),
  constraint billing_subscription_consent_validity_window_check check (
    created_at = accepted_at
    and expires_at = accepted_at + interval '30 minutes'
  ),
  -- The Checkout operation copies every binding and proves that copy with one
  -- composite FK rather than relying only on application code.
  constraint billing_subscription_consent_checkout_binding_unique unique (
    id,
    account_id,
    operation_id,
    plan_code,
    billing_interval,
    catalog_version,
    unit_amount_cents,
    currency,
    terms_version,
    recurring_consent_version,
    recurring_consent_text_sha256,
    accepted_by,
    accepted_at
  )
);

create index billing_subscription_consent_account_time_idx
  on public.billing_subscription_consent_acceptances (account_id, accepted_at desc, id);

alter table public.billing_subscription_consent_acceptances enable row level security;
alter table public.billing_subscription_consent_acceptances force row level security;

create function public.protect_billing_subscription_consent_acceptance()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'recurring subscription consent evidence cannot be deleted'
      using errcode = '42501';
  end if;
  raise exception 'recurring subscription consent evidence is immutable'
    using errcode = '22000';
end;
$$;

create trigger protect_billing_subscription_consent_acceptance_update
before update on public.billing_subscription_consent_acceptances
for each row execute function public.protect_billing_subscription_consent_acceptance();

create trigger protect_billing_subscription_consent_acceptance_delete
before delete on public.billing_subscription_consent_acceptances
for each row execute function public.protect_billing_subscription_consent_acceptance();

revoke all on function public.protect_billing_subscription_consent_acceptance()
  from public, anon, authenticated, service_role;

create function public.record_base_plan_recurring_consent(
  p_account_id uuid,
  p_operation_id text,
  p_plan_code text,
  p_billing_interval text,
  p_catalog_version text,
  p_unit_amount_cents bigint,
  p_currency text,
  p_terms_version text,
  p_recurring_consent_version text,
  p_recurring_consent_text_sha256 text
)
returns table (
  acceptance_id uuid,
  account_id uuid,
  operation_id text,
  accepted_by uuid,
  accepted_at timestamptz,
  expires_at timestamptz,
  plan_code text,
  billing_interval text,
  catalog_version text,
  unit_amount_cents bigint,
  currency text,
  terms_version text,
  recurring_consent_version text,
  recurring_consent_text_sha256 text
)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_account public.accounts%rowtype;
  v_entitlement public.workspace_entitlements%rowtype;
  v_acceptance public.billing_subscription_consent_acceptances%rowtype;
  v_expected_amount bigint;
  v_now timestamptz := pg_catalog.now();
begin
  if v_actor is null
     or coalesce(auth.jwt() ->> 'is_anonymous', 'false') = 'true' then
    raise exception 'authenticated non-anonymous owner is required for recurring consent'
      using errcode = '42501';
  end if;
  if p_operation_id is null
     or pg_catalog.length(pg_catalog.btrim(p_operation_id)) not between 1 and 200
     or p_operation_id ~ '[[:cntrl:]]' then
    raise exception 'invalid recurring consent operation ID' using errcode = '22023';
  end if;
  if p_plan_code is null or p_plan_code not in ('solo', 'growth', 'scale')
     or p_billing_interval is null or p_billing_interval not in ('monthly', 'annual') then
    raise exception 'invalid recurring consent plan selection' using errcode = '22023';
  end if;
  if p_catalog_version is distinct from '2026-08-15-preview'
     or p_currency is distinct from 'usd'
     or p_terms_version is distinct from '2026-08-16'
     or p_recurring_consent_version is distinct from 'base-plan-recurring-2026-08-16'
     or p_recurring_consent_text_sha256 is distinct from
       'f39aeedb379d397f941d3c5fc48357703b4cc97148d8b1bb3c2f55b04e449c75' then
    raise exception 'recurring consent contract is not the exact current artifact'
      using errcode = '22023';
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
    raise exception 'recurring consent amount does not match the canonical catalog'
      using errcode = '22000';
  end if;

  select a.*
    into v_account
    from public.accounts a
   where a.id = p_account_id
   for share;
  if not found
     or v_account.terms_accepted_at is null
     or v_account.terms_version is distinct from p_terms_version then
    raise exception 'workspace must accept the exact current Terms before recurring consent'
      using errcode = '55000';
  end if;

  perform 1
    from public.memberships m
   where m.account_id = p_account_id
     and m.user_id = v_actor
     and m.role = 'owner'
   for share;
  if not found then
    raise exception 'only the authenticated workspace owner may accept recurring billing'
      using errcode = '42501';
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
    raise exception 'first-subscription consent requires an active Flex workspace'
      using errcode = '55000';
  end if;

  insert into public.billing_subscription_consent_acceptances (
    account_id,
    operation_id,
    purpose,
    plan_code,
    billing_interval,
    catalog_version,
    unit_amount_cents,
    currency,
    terms_version,
    recurring_consent_version,
    recurring_consent_text_sha256,
    accepted_by,
    accepted_at,
    expires_at,
    created_at
  ) values (
    p_account_id,
    pg_catalog.btrim(p_operation_id),
    'base_plan_subscription',
    p_plan_code,
    p_billing_interval,
    p_catalog_version,
    p_unit_amount_cents,
    p_currency,
    p_terms_version,
    p_recurring_consent_version,
    p_recurring_consent_text_sha256,
    v_actor,
    v_now,
    v_now + interval '30 minutes',
    v_now
  )
  returning * into v_acceptance;

  return query select
    v_acceptance.id,
    v_acceptance.account_id,
    v_acceptance.operation_id,
    v_acceptance.accepted_by,
    v_acceptance.accepted_at,
    v_acceptance.expires_at,
    v_acceptance.plan_code,
    v_acceptance.billing_interval,
    v_acceptance.catalog_version,
    v_acceptance.unit_amount_cents,
    v_acceptance.currency,
    v_acceptance.terms_version,
    v_acceptance.recurring_consent_version,
    v_acceptance.recurring_consent_text_sha256;
end;
$$;

revoke all on function public.record_base_plan_recurring_consent(
  uuid, text, text, text, text, bigint, text, text, text, text
) from public, anon, authenticated, service_role;
grant execute on function public.record_base_plan_recurring_consent(
  uuid, text, text, text, text, bigint, text, text, text, text
) to authenticated;

-- No Checkout caller exists, so any row here would indicate an unexpected dark
-- invocation. Abort rather than fabricate recurring-consent evidence for it.
lock table public.billing_subscription_checkout_operations in access exclusive mode;
do $$
begin
  if exists (select 1 from public.billing_subscription_checkout_operations) then
    raise exception 'subscription Checkout operation ledger must be empty before consent hardening'
      using errcode = '55000';
  end if;
end
$$;

do $$
declare
  v_terms_constraint text;
  v_consent_constraint text;
begin
  select c.conname
    into v_terms_constraint
    from pg_catalog.pg_constraint c
   where c.conrelid = 'public.billing_subscription_checkout_operations'::pg_catalog.regclass
     and c.contype = 'c'
     and pg_catalog.pg_get_constraintdef(c.oid) like '%terms_version = ''2026-08-03''%';
  select c.conname
    into v_consent_constraint
    from pg_catalog.pg_constraint c
   where c.conrelid = 'public.billing_subscription_checkout_operations'::pg_catalog.regclass
     and c.contype = 'c'
     and pg_catalog.pg_get_constraintdef(c.oid) like '%recurring_consent_version ~%';
  if v_terms_constraint is null or v_consent_constraint is null then
    raise exception 'expected prior subscription consent constraints were not found'
      using errcode = '55000';
  end if;
  execute pg_catalog.format(
    'alter table public.billing_subscription_checkout_operations drop constraint %I',
    v_terms_constraint
  );
  execute pg_catalog.format(
    'alter table public.billing_subscription_checkout_operations drop constraint %I',
    v_consent_constraint
  );
end
$$;

alter table public.billing_subscription_checkout_operations
  add column recurring_consent_acceptance_id uuid not null,
  add column recurring_consent_text_sha256 text not null,
  add column recurring_consent_accepted_by uuid not null,
  add column recurring_consent_accepted_at timestamptz not null,
  add constraint billing_subscription_checkout_terms_version_check
    check (terms_version = '2026-08-16'),
  add constraint billing_subscription_checkout_consent_version_check
    check (recurring_consent_version = 'base-plan-recurring-2026-08-16'),
  add constraint billing_subscription_checkout_consent_hash_check check (
    recurring_consent_text_sha256 =
      'f39aeedb379d397f941d3c5fc48357703b4cc97148d8b1bb3c2f55b04e449c75'
  ),
  add constraint billing_subscription_checkout_consent_single_use_unique
    unique (recurring_consent_acceptance_id),
  add constraint billing_subscription_checkout_consent_binding_fk foreign key (
    recurring_consent_acceptance_id,
    account_id,
    operation_id,
    plan_code,
    billing_interval,
    catalog_version,
    unit_amount_cents,
    currency,
    terms_version,
    recurring_consent_version,
    recurring_consent_text_sha256,
    recurring_consent_accepted_by,
    recurring_consent_accepted_at
  ) references public.billing_subscription_consent_acceptances (
    id,
    account_id,
    operation_id,
    plan_code,
    billing_interval,
    catalog_version,
    unit_amount_cents,
    currency,
    terms_version,
    recurring_consent_version,
    recurring_consent_text_sha256,
    accepted_by,
    accepted_at
  ) on delete restrict;

create or replace function public.protect_billing_subscription_checkout_operation()
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
     or old.recurring_consent_acceptance_id is distinct from new.recurring_consent_acceptance_id
     or old.recurring_consent_text_sha256 is distinct from new.recurring_consent_text_sha256
     or old.recurring_consent_accepted_by is distinct from new.recurring_consent_accepted_by
     or old.recurring_consent_accepted_at is distinct from new.recurring_consent_accepted_at
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

revoke all on function public.claim_stripe_billing_subscription_checkout(
  uuid, text, text, text, text, boolean, text, text, text, bigint, text, text, text
) from public, anon, authenticated, service_role;
drop function public.claim_stripe_billing_subscription_checkout(
  uuid, text, text, text, text, boolean, text, text, text, bigint, text, text, text
);

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
  p_recurring_consent_text_sha256 text,
  p_recurring_consent_acceptance_id uuid,
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
  v_acceptance public.billing_subscription_consent_acceptances%rowtype;
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
  if p_terms_version is distinct from '2026-08-16'
     or p_recurring_consent_version is distinct from 'base-plan-recurring-2026-08-16'
     or p_recurring_consent_text_sha256 is distinct from
       'f39aeedb379d397f941d3c5fc48357703b4cc97148d8b1bb3c2f55b04e449c75'
     or p_recurring_consent_acceptance_id is null then
    raise exception 'subscription Checkout consent evidence is not the exact current artifact'
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

  -- Account -> entitlement -> consent -> operation is the global lock order.
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

  select a.*
    into v_acceptance
    from public.billing_subscription_consent_acceptances a
   where a.id = p_recurring_consent_acceptance_id
     and a.account_id = p_account_id
     and a.operation_id = pg_catalog.btrim(p_operation_id)
     and a.purpose = 'base_plan_subscription'
     and a.plan_code = p_plan_code
     and a.billing_interval = p_billing_interval
     and a.catalog_version = p_catalog_version
     and a.unit_amount_cents = p_unit_amount_cents
     and a.currency = p_currency
     and a.terms_version = p_terms_version
     and a.recurring_consent_version = p_recurring_consent_version
     and a.recurring_consent_text_sha256 = p_recurring_consent_text_sha256
   for update;
  if not found then
    raise exception 'matching authenticated recurring consent evidence was not found'
      using errcode = '55000';
  end if;

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
       or v_operation.recurring_consent_text_sha256 is distinct from p_recurring_consent_text_sha256
       or v_operation.recurring_consent_acceptance_id is distinct from p_recurring_consent_acceptance_id
       or v_operation.recurring_consent_accepted_by is distinct from v_acceptance.accepted_by
       or v_operation.recurring_consent_accepted_at is distinct from v_acceptance.accepted_at
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

  if v_acceptance.expires_at <= pg_catalog.now() then
    raise exception 'recurring consent evidence expired before Checkout was claimed'
      using errcode = '55000';
  end if;

  perform 1
    from public.billing_subscription_checkout_operations o
   where o.recurring_consent_acceptance_id = p_recurring_consent_acceptance_id
   for share;
  if found then
    raise exception 'recurring consent evidence was already used by another operation'
      using errcode = '55000';
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
    recurring_consent_acceptance_id,
    recurring_consent_text_sha256,
    recurring_consent_accepted_by,
    recurring_consent_accepted_at,
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
    p_recurring_consent_acceptance_id,
    p_recurring_consent_text_sha256,
    v_acceptance.accepted_by,
    v_acceptance.accepted_at,
    p_stripe_idempotency_key,
    'claimed',
    v_claim_token,
    pg_catalog.now() + interval '5 minutes',
    pg_catalog.jsonb_build_object(
      'schema', 'base_plan_subscription_checkout_v2',
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
      'recurring_consent_version', p_recurring_consent_version,
      'recurring_consent_text_sha256', p_recurring_consent_text_sha256,
      'recurring_consent_acceptance_id', p_recurring_consent_acceptance_id,
      'recurring_consent_accepted_by', v_acceptance.accepted_by,
      'recurring_consent_accepted_at', v_acceptance.accepted_at
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

revoke all on function public.claim_stripe_billing_subscription_checkout(
  uuid, text, text, text, text, boolean, text, text, text, bigint,
  text, text, text, uuid, text
) from public, anon, authenticated, service_role;
grant execute on function public.claim_stripe_billing_subscription_checkout(
  uuid, text, text, text, text, boolean, text, text, text, bigint,
  text, text, text, uuid, text
) to service_role;

revoke all on table public.billing_subscription_consent_acceptances
  from public, anon, authenticated, service_role;
grant select on table public.billing_subscription_consent_acceptances to service_role;

comment on table public.billing_subscription_consent_acceptances is
  'Immutable authenticated owner assent for one exact dark base-plan Checkout operation.';
comment on column public.billing_subscription_checkout_operations.recurring_consent_accepted_by is
  'Authenticated auth.uid() copied from the exact single-use consent evidence before Stripe create.';

commit;

-- Rollback is intentionally fail-closed and only safe while both dark ledgers
-- are empty: restore the prior claim RPC from migration 20260816041255 before
-- removing these columns/table or deploying the prior application modules.
