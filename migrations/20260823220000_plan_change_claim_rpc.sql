-- The only writer of the plan-change ledger.
--
-- Rail stage 3. Inert on apply: nothing calls it.
--
-- It writes the row and returns; it does NOT call Stripe. The caller writes
-- first, then calls Stripe, then records the outcome through a separate
-- transition. That ordering is the point of the whole rail: a webhook can arrive
-- before subscriptions.update() returns, and a row written afterwards leaves the
-- projector meeting an event with no operation to bind.
--
-- LOCK ORDER IS COPIED, NOT CHOSEN. accounts (for update) -> workspace_entitlements
-- -> billing_subscriptions -> billing_subscription_customers -> acceptance
-- (for update) -> operation (for update). That is exactly the order
-- claim_stripe_billing_subscription_checkout takes. A different order here
-- deadlocks against it the first time a workspace does both at once, and both
-- take accounts FOR UPDATE first, so they serialize instead.

begin;

do $$
begin
  if to_regclass('public.billing_subscription_plan_change_operations') is null then
    raise exception '20260823210000 has not been applied; there is no plan-change ledger to write';
  end if;
end $$;

create or replace function public.claim_stripe_billing_subscription_plan_change(
  p_account_id uuid,
  p_operation_id text,
  p_plan_code text,
  p_billing_interval text,
  p_catalog_version text,
  p_livemode boolean,
  p_provider_subscription_id text,
  p_provider_subscription_item_id text,
  p_stripe_price_id text,
  p_stripe_product_id text,
  p_currency text,
  p_unit_amount_cents bigint,
  p_terms_version text,
  p_recurring_consent_version text,
  p_recurring_consent_text_sha256 text,
  p_recurring_consent_acceptance_id uuid,
  p_stripe_idempotency_key text,
  p_request_fingerprint text
)
returns table(claim_status text, operation_pk uuid, operation_state text, claim_token uuid)
language plpgsql
security definer
set search_path to 'pg_catalog', 'pg_temp'
as $fn$
declare
  v_account public.accounts%rowtype;
  v_entitlement public.workspace_entitlements%rowtype;
  v_subscription public.billing_subscriptions%rowtype;
  v_acceptance public.billing_subscription_consent_acceptances%rowtype;
  v_operation public.billing_subscription_plan_change_operations%rowtype;
  v_expected_amount bigint;
  v_provider_customer_id text;
  v_token uuid := pg_catalog.gen_random_uuid();
begin
  -- Argument shape, clause for clause from the first-checkout claim except the
  -- idempotency key, which is pinned to the plan_change shape ONLY. The table
  -- CHECK admits that shape alone, but each writer must admit exactly one or a
  -- plan change could be written under a key no Stripe call ever used.
  if p_operation_id is null
     or pg_catalog.length(pg_catalog.btrim(p_operation_id)) not between 1 and 200
     or p_operation_id ~ '[[:cntrl:]]' then
    raise exception 'invalid plan-change operation ID' using errcode = '22023';
  end if;
  if p_plan_code is null or p_plan_code not in ('solo', 'growth', 'scale')
     or p_billing_interval is null or p_billing_interval not in ('monthly', 'annual') then
    raise exception 'invalid plan-change plan selection' using errcode = '22023';
  end if;
  if p_catalog_version is distinct from '2026-08-18-preview' then
    raise exception 'plan-change catalog version is not supported' using errcode = '22023';
  end if;
  if p_livemode is null then
    raise exception 'plan-change livemode is required' using errcode = '22023';
  end if;
  if p_provider_subscription_id is null
     or p_provider_subscription_id !~ '^sub_[A-Za-z0-9]{8,}$'
     or p_provider_subscription_item_id is null
     or p_provider_subscription_item_id !~ '^si_[A-Za-z0-9]{8,}$' then
    raise exception 'invalid plan-change subscription identity' using errcode = '22023';
  end if;
  if p_stripe_price_id is null
     or p_stripe_price_id !~ '^price_[A-Za-z0-9]{8,}$'
     or p_stripe_product_id is null
     or p_stripe_product_id !~ '^prod_[A-Za-z0-9]{8,}$' then
    raise exception 'invalid verified Stripe Price binding' using errcode = '22023';
  end if;
  if p_currency is distinct from 'usd' then
    raise exception 'plan-change currency must be usd' using errcode = '22023';
  end if;
  if p_terms_version is distinct from '2026-08-16'
     or p_recurring_consent_version is distinct from 'base-plan-recurring-2026-08-16'
     or p_recurring_consent_text_sha256 is distinct from
       'f39aeedb379d397f941d3c5fc48357703b4cc97148d8b1bb3c2f55b04e449c75'
     or p_recurring_consent_acceptance_id is null then
    raise exception 'plan-change consent evidence is not the exact current artifact'
      using errcode = '22023';
  end if;
  if p_stripe_idempotency_key is null
     or p_stripe_idempotency_key !~ '^lgq:billing:v1:subscription[.]plan_change:[0-9a-f]{64}$' then
    raise exception 'invalid plan-change request identity' using errcode = '22023';
  end if;
  if p_request_fingerprint is null or p_request_fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid plan-change request fingerprint' using errcode = '22023';
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
    raise exception 'plan-change amount does not match the canonical catalog'
      using errcode = '22000';
  end if;

  -- accounts -> entitlement -> subscription -> customer -> consent -> operation.
  select a.* into v_account from public.accounts a where a.id = p_account_id for update;
  if not found then
    raise exception 'plan-change workspace was not found' using errcode = 'P0002';
  end if;
  if v_account.terms_accepted_at is null
     or v_account.terms_version is distinct from p_terms_version then
    raise exception 'workspace must accept the exact current Terms before a plan change'
      using errcode = '55000';
  end if;

  -- The INVERSE of the first-checkout guard, and it must stay the exact inverse.
  -- That one stops a paid workspace running the first-subscription rail; this
  -- one stops a Flex workspace running the plan-change rail and reaching a
  -- projector clause relaxed for paying customers only.
  select e.* into v_entitlement
    from public.workspace_entitlements e where e.account_id = p_account_id for share;
  if not found
     or v_entitlement.plan_code not in ('solo', 'growth', 'scale')
     or v_entitlement.billing_interval not in ('monthly', 'annual')
     or v_entitlement.billing_status <> 'active'
     or v_entitlement.entitlement_state <> 'active' then
    raise exception 'a plan change requires an active paid workspace' using errcode = '55000';
  end if;
  if v_entitlement.plan_code = p_plan_code
     and v_entitlement.billing_interval = p_billing_interval then
    raise exception 'a plan change must name a different plan' using errcode = '22000';
  end if;

  -- THE STATUS LIST IS NOT DECORATION. billing_subscriptions has no plain
  -- per-account unique -- it has a PARTIAL one,
  -- billing_subscriptions_one_live_per_account, over exactly these six statuses.
  -- Filtering on them is what makes this SELECT INTO provably single-row. Drop
  -- the filter and a workspace that cancelled and resubscribed has two rows, and
  -- SELECT INTO takes an arbitrary one WITHOUT error -- so the ledger could
  -- record a plan change against the dead subscription.
  select s.* into v_subscription
    from public.billing_subscriptions s
   where s.account_id = p_account_id
     and s.provider = 'stripe'
     and s.livemode = p_livemode
     and s.status in ('incomplete', 'trialing', 'active', 'past_due', 'unpaid', 'paused')
   for share;
  if not found then
    raise exception 'a plan change requires a live subscription' using errcode = '55000';
  end if;
  -- Narrower than the index: a plan change is only coherent where there is
  -- something to prorate against and a card that has not already failed twice.
  if v_subscription.status not in ('trialing', 'active', 'past_due') then
    raise exception 'this subscription is not in a state where a plan can be changed'
      using errcode = '55000';
  end if;
  if v_subscription.provider_subscription_id is distinct from p_provider_subscription_id
     or v_subscription.provider_subscription_item_id is distinct from p_provider_subscription_item_id then
    raise exception 'plan-change subscription identity does not match this workspace'
      using errcode = '22000';
  end if;
  -- A scheduled cancellation makes an immediate prorated upgrade incoherent:
  -- the customer would be charged the difference for a plan that ends anyway.
  if v_subscription.cancel_at_period_end then
    raise exception 'this subscription is scheduled to cancel; resume it before changing plan'
      using errcode = '55000';
  end if;

  select c.provider_customer_id into v_provider_customer_id
    from public.billing_subscription_customers c
   where c.account_id = p_account_id and c.provider = 'stripe' and c.livemode = p_livemode
   for share;

  select a.* into v_acceptance
    from public.billing_subscription_consent_acceptances a
   where a.id = p_recurring_consent_acceptance_id
     and a.account_id = p_account_id
     and a.operation_id = pg_catalog.btrim(p_operation_id)
     and a.purpose = 'base_plan_plan_change'
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
    raise exception 'matching authenticated plan-change consent evidence was not found'
      using errcode = '55000';
  end if;

  select o.* into v_operation
    from public.billing_subscription_plan_change_operations o
   where o.account_id = p_account_id
     and o.operation_id = pg_catalog.btrim(p_operation_id)
   for update;

  if found then
    -- Replay. Every immutable field must agree, or this is a different request
    -- wearing a used operation id.
    if v_operation.plan_code is distinct from p_plan_code
       or v_operation.billing_interval is distinct from p_billing_interval
       or v_operation.catalog_version is distinct from p_catalog_version
       or v_operation.livemode is distinct from p_livemode
       or v_operation.provider_subscription_id is distinct from p_provider_subscription_id
       or v_operation.provider_subscription_item_id is distinct from p_provider_subscription_item_id
       or v_operation.stripe_price_id is distinct from p_stripe_price_id
       or v_operation.stripe_product_id is distinct from p_stripe_product_id
       or v_operation.currency is distinct from p_currency
       or v_operation.unit_amount_cents is distinct from p_unit_amount_cents
       or v_operation.recurring_consent_acceptance_id is distinct from p_recurring_consent_acceptance_id
       or v_operation.stripe_idempotency_key is distinct from p_stripe_idempotency_key then
      raise exception 'operation ID was already claimed with different immutable plan-change input'
        using errcode = '22000';
    end if;
    return query select
      case v_operation.state
        when 'submitted' then 'replay'
        else v_operation.state
      end,
      v_operation.id,
      v_operation.state,
      v_operation.claim_token;
    return;
  end if;

  -- Expiry is tested only on the row-creating path and AFTER the replay branch,
  -- so a legitimate retry does not start failing thirty minutes later. Same
  -- placement as the first-checkout claim; do not move it.
  if v_acceptance.expires_at <= pg_catalog.now() then
    raise exception 'plan-change consent evidence expired before the operation was claimed'
      using errcode = '55000';
  end if;

  insert into public.billing_subscription_plan_change_operations (
    account_id, operation_id, purpose, provider, livemode,
    provider_subscription_id, provider_subscription_item_id, provider_customer_id,
    from_plan_code, from_billing_interval,
    plan_code, billing_interval, catalog_version,
    stripe_price_id, stripe_product_id, currency, unit_amount_cents,
    terms_version, recurring_consent_version, recurring_consent_text_sha256,
    recurring_consent_acceptance_id, recurring_consent_accepted_by, recurring_consent_accepted_at,
    stripe_idempotency_key, request_fingerprint,
    state, claim_token, attempt_count
  ) values (
    p_account_id, pg_catalog.btrim(p_operation_id), 'base_plan_plan_change', 'stripe', p_livemode,
    p_provider_subscription_id, p_provider_subscription_item_id, v_provider_customer_id,
    v_entitlement.plan_code, v_entitlement.billing_interval,
    p_plan_code, p_billing_interval, p_catalog_version,
    p_stripe_price_id, p_stripe_product_id, p_currency, p_unit_amount_cents,
    p_terms_version, p_recurring_consent_version, p_recurring_consent_text_sha256,
    p_recurring_consent_acceptance_id, v_acceptance.accepted_by, v_acceptance.accepted_at,
    p_stripe_idempotency_key, p_request_fingerprint,
    'submitted', v_token, 1
  )
  returning * into v_operation;

  return query select 'claimed'::text, v_operation.id, v_operation.state, v_operation.claim_token;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- Grants. `anon` by name, because pg_default_acl grants it EXECUTE on every new
-- function in public. service_role only: this one takes the workspace as a
-- parameter and is called from trusted server code that has already established
-- ownership, unlike the consent recorder, which derives the actor from
-- auth.uid() and is therefore granted to authenticated instead.
-- ---------------------------------------------------------------------------
revoke all on function public.claim_stripe_billing_subscription_plan_change(
  uuid, text, text, text, text, boolean, text, text, text, text, text, bigint,
  text, text, text, uuid, text, text
) from public, anon, authenticated, service_role;
grant execute on function public.claim_stripe_billing_subscription_plan_change(
  uuid, text, text, text, text, boolean, text, text, text, text, text, bigint,
  text, text, text, uuid, text, text
) to service_role;

do $$
declare
  v_sig text := 'public.claim_stripe_billing_subscription_plan_change(uuid, text, text, text, text, boolean, text, text, text, text, text, bigint, text, text, text, uuid, text, text)';
  v_def text := pg_catalog.pg_get_functiondef(v_sig::regprocedure);
begin
  if pg_catalog.has_function_privilege('anon', v_sig, 'EXECUTE') then
    raise exception 'anon can execute the plan-change claim';
  end if;
  if pg_catalog.has_function_privilege('authenticated', v_sig, 'EXECUTE') then
    raise exception 'authenticated can execute the plan-change claim directly';
  end if;
  if not pg_catalog.has_function_privilege('service_role', v_sig, 'EXECUTE') then
    raise exception 'service_role cannot execute the plan-change claim';
  end if;

  -- The clauses whose absence would be silent and expensive.
  if pg_catalog.strpos(v_def, 'one_live_per_account') = 0
     and pg_catalog.strpos(v_def, '''incomplete'', ''trialing'', ''active'', ''past_due'', ''unpaid'', ''paused''') = 0 then
    raise exception 'the subscription lookup lost its status filter and is no longer single-row';
  end if;
  if pg_catalog.strpos(v_def, 'a plan change requires an active paid workspace') = 0 then
    raise exception 'the paid-workspace guard is missing';
  end if;
  if pg_catalog.strpos(v_def, 'cancel_at_period_end') = 0 then
    raise exception 'the scheduled-cancellation guard is missing';
  end if;
  if pg_catalog.strpos(v_def, '''base_plan_plan_change''') = 0 then
    raise exception 'the claim no longer pins the consent purpose';
  end if;
end $$;

commit;
