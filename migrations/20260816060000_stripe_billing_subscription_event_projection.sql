-- Dark platform Stripe Billing event projection foundation.
--
-- This migration intentionally exposes no webhook route and creates no active
-- caller. It lets a future worker claim an already-signed, PII-redacted inbox
-- row, bind freshly retrieved platform Stripe objects to one immutable Checkout
-- operation, and atomically project provider truth. Direct table mutation stays
-- revoked. Annual billing still receives only one monthly allowance window;
-- the separate monthly reset worker remains an activation prerequisite.

begin;

-- The inbox is dark and has no processor. Preserve unclaimed received rows,
-- but abort if an unexpected platform event was already mutated by some other
-- code path rather than fabricating projection ownership/history for it.
lock table public.billing_events in share row exclusive mode;
do $$
begin
  if exists (
    select 1
      from public.billing_events e
     where e.event_scope = 'platform_subscription'
       and e.processing_status <> 'received'
  ) then
    raise exception 'platform Stripe Billing inbox contains pre-projector processing history'
      using errcode = '55000';
  end if;
end
$$;

alter table public.billing_events
  add column projection_claim_token uuid,
  add column projection_lease_expires_at timestamptz,
  add column projection_schema_version text,
  add column projection_applied boolean,
  add column projection_result text,
  add constraint billing_events_projection_result_check check (
    projection_result is null
    or projection_result in (
      'subscription_state_applied',
      'invoice_state_applied',
      'subscription_and_invoice_state_applied',
      'out_of_order_ignored'
    )
  ),
  add constraint billing_events_projection_claim_shape_check check (
    event_scope <> 'platform_subscription'
    or (
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
    )
  ),
  add constraint billing_events_projection_terminal_shape_check check (
    event_scope <> 'platform_subscription'
    or (
      (
        processing_status in ('processed', 'ignored')
        and processed_at is not null
        and projection_schema_version = 'stripe_subscription_projection_v1'
        and projection_applied is not null
        and projection_result is not null
      )
      or (
        processing_status not in ('processed', 'ignored')
        and processed_at is null
        and projection_applied is null
        and projection_result is null
      )
    )
  );

create index billing_events_projection_lease_idx
  on public.billing_events (projection_lease_expires_at, received_at, id)
  where processing_status = 'processing';

alter table public.billing_subscriptions
  add column provider_state_event_created_at timestamptz,
  add column provider_state_event_id text,
  add column latest_invoice_id text,
  add column latest_invoice_status text,
  add column latest_invoice_event_type text,
  add column latest_invoice_event_created_at timestamptz,
  add column latest_invoice_event_id text,
  add column last_paid_at timestamptz,
  add column last_payment_failed_at timestamptz,
  add constraint billing_subscriptions_provider_state_marker_check check (
    (provider_state_event_created_at is null and provider_state_event_id is null)
    or (
      provider_state_event_created_at is not null
      and provider_state_event_id ~ '^evt_[A-Za-z0-9_]{8,}$'
    )
  ),
  add constraint billing_subscriptions_latest_invoice_check check (
    (
      latest_invoice_id is null
      and latest_invoice_status is null
      and latest_invoice_event_type is null
      and latest_invoice_event_created_at is null
      and latest_invoice_event_id is null
    )
    or (
      latest_invoice_id ~ '^in_[A-Za-z0-9]{8,}$'
      and latest_invoice_status in ('draft', 'open', 'paid', 'uncollectible', 'void')
      and latest_invoice_event_type like 'invoice.%'
      and latest_invoice_event_created_at is not null
      and latest_invoice_event_id ~ '^evt_[A-Za-z0-9_]{8,}$'
    )
  );

alter table public.workspace_entitlements
  drop constraint workspace_entitlements_billing_status_check,
  add constraint workspace_entitlements_billing_status_check check (
    billing_status in (
      'free', 'incomplete', 'trialing', 'active', 'past_due',
      'unpaid', 'paused', 'canceled'
    )
  );

-- The projector RPC is the only writer for these ledgers in this dark layer.
revoke all on table public.billing_subscriptions
  from public, anon, authenticated, service_role;
grant select on table public.billing_subscriptions to service_role;

revoke all on table public.billing_events
  from public, anon, authenticated, service_role;
grant select on table public.billing_events to service_role;

revoke all on table public.workspace_entitlements
  from service_role;
grant select on table public.workspace_entitlements to service_role;

-- Claim one redacted platform-subscription inbox row. Replays and active leases
-- return without provider egress. A failed row with no retry time is a durable
-- terminal failure and must be explicitly repaired by a future operator tool.
create function public.claim_stripe_billing_subscription_event(
  p_billing_event_id uuid
)
returns table (
  claim_status text,
  billing_event_id uuid,
  claim_token uuid,
  attempt_count integer,
  provider_event_id text,
  event_type text,
  provider_object_id text,
  provider_object_type text,
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
  v_object_id text;
  v_object_type text;
begin
  select e.*
    into v_event
    from public.billing_events e
   where e.id = p_billing_event_id
   for update;
  if not found then
    raise exception 'Stripe Billing event was not found' using errcode = 'P0002';
  end if;
  if v_event.provider <> 'stripe'
     or v_event.event_scope <> 'platform_subscription'
     or v_event.provider_account_id is not null
     or v_event.provider_created_at is null
     or v_event.payload #>> '{schema}' <> 'lgq.stripe-event-inbox.v1'
     or v_event.payload #>> '{scope}' <> 'platform_subscription'
     or v_event.payload #>> '{event,id}' is distinct from v_event.provider_event_id
     or v_event.payload #>> '{event,type}' is distinct from v_event.event_type
     or (v_event.payload #>> '{event,livemode}')::boolean is distinct from v_event.livemode then
    raise exception 'Stripe Billing event inbox contract is invalid' using errcode = '22000';
  end if;

  v_object_id := v_event.payload #>> '{data_object,id}';
  v_object_type := v_event.payload #>> '{data_object,object}';
  if (
    v_event.event_type like 'customer.subscription.%'
    and (
      v_object_type is distinct from 'subscription'
      or v_object_id !~ '^sub_[A-Za-z0-9]{8,}$'
    )
  ) or (
    v_event.event_type like 'invoice.%'
    and (
      v_object_type is distinct from 'invoice'
      or v_object_id !~ '^in_[A-Za-z0-9]{8,}$'
    )
  ) then
    raise exception 'Stripe Billing event object binding is invalid' using errcode = '22000';
  end if;

  if v_event.processing_status in ('processed', 'ignored') then
    return query select
      v_event.processing_status,
      v_event.id,
      null::uuid,
      v_event.attempt_count,
      v_event.provider_event_id,
      v_event.event_type,
      v_object_id,
      v_object_type,
      v_event.livemode,
      v_event.provider_created_at;
    return;
  end if;

  if v_event.processing_status = 'failed'
     and v_event.next_attempt_at is null then
    return query select
      'failed_terminal'::text,
      v_event.id,
      null::uuid,
      v_event.attempt_count,
      v_event.provider_event_id,
      v_event.event_type,
      v_object_id,
      v_object_type,
      v_event.livemode,
      v_event.provider_created_at;
    return;
  end if;

  if (
    v_event.processing_status = 'processing'
    and v_event.projection_lease_expires_at > pg_catalog.now()
  ) or (
    v_event.processing_status = 'failed'
    and v_event.next_attempt_at > pg_catalog.now()
  ) then
    return query select
      'in_progress'::text,
      v_event.id,
      null::uuid,
      v_event.attempt_count,
      v_event.provider_event_id,
      v_event.event_type,
      v_object_id,
      v_object_type,
      v_event.livemode,
      v_event.provider_created_at;
    return;
  end if;

  if v_event.processing_status not in ('received', 'failed', 'processing') then
    raise exception 'Stripe Billing event has an unsupported processing state'
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
    'claimed'::text,
    v_event.id,
    v_event.projection_claim_token,
    v_event.attempt_count,
    v_event.provider_event_id,
    v_event.event_type,
    v_object_id,
    v_object_type,
    v_event.livemode,
    v_event.provider_created_at;
end;
$$;

-- Bind normalized subscription metadata to the one immutable Checkout claim
-- before the application is allowed to retrieve/recover its Checkout Session.
create function public.resolve_stripe_billing_subscription_projection_binding(
  p_billing_event_id uuid,
  p_claim_token uuid,
  p_account_id uuid,
  p_operation_id text,
  p_provider_customer_id text,
  p_provider_subscription_id text,
  p_provider_price_id text
)
returns table (
  operation_pk uuid,
  operation_state text,
  workspace_id uuid,
  operation_id text,
  checkout_session_id text,
  plan_code text,
  billing_interval text,
  catalog_version text,
  livemode boolean,
  price_id text,
  product_id text,
  currency text,
  unit_amount_cents bigint,
  terms_version text,
  recurring_consent_version text,
  recurring_consent_text_sha256 text,
  recurring_consent_acceptance_id uuid,
  checkout_expires_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $$
declare
  v_event public.billing_events%rowtype;
  v_operation public.billing_subscription_checkout_operations%rowtype;
  v_subscription public.billing_subscriptions%rowtype;
begin
  if p_claim_token is null
     or p_account_id is null
     or p_operation_id is null
     or pg_catalog.length(pg_catalog.btrim(p_operation_id)) not between 1 and 200
     or p_operation_id ~ '[[:cntrl:]]'
     or p_provider_customer_id is null
     or p_provider_customer_id !~ '^cus_[A-Za-z0-9]{8,}$'
     or p_provider_subscription_id is null
     or p_provider_subscription_id !~ '^sub_[A-Za-z0-9]{8,}$'
     or p_provider_price_id is null
     or p_provider_price_id !~ '^price_[A-Za-z0-9]{8,}$' then
    raise exception 'Stripe Billing projection binding input is invalid'
      using errcode = '22023';
  end if;

  select e.*
    into v_event
    from public.billing_events e
   where e.id = p_billing_event_id
   for update;
  if not found
     or v_event.event_scope <> 'platform_subscription'
     or v_event.processing_status <> 'processing'
     or v_event.projection_claim_token is distinct from p_claim_token
     or v_event.projection_lease_expires_at <= pg_catalog.now() then
    raise exception 'Stripe Billing event projection claim is not owned or expired'
      using errcode = '55000';
  end if;

  perform 1
    from public.accounts a
   where a.id = p_account_id
   for share;
  if not found then
    raise exception 'Stripe Billing projection workspace was not found'
      using errcode = 'P0002';
  end if;

  select o.*
    into v_operation
    from public.billing_subscription_checkout_operations o
   where o.account_id = p_account_id
     and o.operation_id = pg_catalog.btrim(p_operation_id)
   for share;
  if not found
     or v_operation.state not in (
       'checkout_created', 'indeterminate', 'activated', 'expired', 'canceled'
     )
     or v_operation.livemode is distinct from v_event.livemode
     or v_operation.stripe_price_id is distinct from p_provider_price_id
     or (
       v_operation.provider_customer_id is not null
       and v_operation.provider_customer_id is distinct from p_provider_customer_id
     )
     or v_operation.checkout_expires_at is null then
    raise exception 'Stripe Billing provider metadata does not bind to one Checkout operation'
      using errcode = '22000';
  end if;

  select s.*
    into v_subscription
    from public.billing_subscriptions s
   where s.provider = 'stripe'
     and s.livemode = v_event.livemode
     and s.provider_subscription_id = p_provider_subscription_id
   for share;
  if found and (
    v_subscription.account_id is distinct from p_account_id
    or v_subscription.provider_customer_id is distinct from p_provider_customer_id
    or v_subscription.provider_price_id is distinct from p_provider_price_id
  ) then
    raise exception 'Stripe Billing subscription identity is already bound differently'
      using errcode = '23505';
  end if;

  return query select
    v_operation.id,
    v_operation.state,
    v_operation.account_id,
    v_operation.operation_id,
    v_operation.provider_object_id,
    v_operation.plan_code,
    v_operation.billing_interval,
    v_operation.catalog_version,
    v_operation.livemode,
    v_operation.stripe_price_id,
    v_operation.stripe_product_id,
    v_operation.currency,
    v_operation.unit_amount_cents,
    v_operation.terms_version,
    v_operation.recurring_consent_version,
    v_operation.recurring_consent_text_sha256,
    v_operation.recurring_consent_acceptance_id,
    v_operation.checkout_expires_at;
end;
$$;

-- Atomically persist the PII-free provider snapshot, lifecycle state, Checkout
-- terminal state, entitlement, and at most one current monthly allowance lot
-- per resource. The JSON allowlist prevents accidental raw object retention.
create function public.project_stripe_billing_subscription_event(
  p_billing_event_id uuid,
  p_claim_token uuid,
  p_projection jsonb
)
returns table (
  processing_status text,
  billing_subscription_id uuid,
  workspace_id uuid,
  projection_applied boolean,
  allowances_granted boolean
)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $$
declare
  v_event public.billing_events%rowtype;
  v_operation public.billing_subscription_checkout_operations%rowtype;
  v_subscription public.billing_subscriptions%rowtype;
  v_entitlement public.workspace_entitlements%rowtype;
  v_customer public.billing_subscription_customers%rowtype;
  v_account_id uuid;
  v_operation_id text;
  v_provider_event_id text;
  v_event_type text;
  v_event_object_id text;
  v_event_created_at timestamptz;
  v_checkout_session_id text;
  v_customer_id text;
  v_subscription_id text;
  v_subscription_item_id text;
  v_price_id text;
  v_product_id text;
  v_plan_code text;
  v_billing_interval text;
  v_catalog_version text;
  v_currency text;
  v_unit_amount_cents bigint;
  v_platform_fee_bps integer;
  v_subscription_status text;
  v_period_start timestamptz;
  v_period_end timestamptz;
  v_cancel_at_period_end boolean;
  v_cancel_at timestamptz;
  v_canceled_at timestamptz;
  v_ended_at timestamptz;
  v_invoice_id text;
  v_invoice_status text;
  v_payment_evidence text;
  v_allowance_start timestamptz;
  v_allowance_end timestamptz;
  v_terms_version text;
  v_recurring_consent_version text;
  v_recurring_consent_text_sha256 text;
  v_recurring_consent_acceptance_id uuid;
  v_expected_amount bigint;
  v_expected_fee_bps integer;
  v_expected_feature_limits jsonb;
  v_expected_feature_flags jsonb;
  v_state_applied boolean := false;
  v_invoice_applied boolean := false;
  v_operation_was_activated boolean := false;
  v_was_activated boolean := false;
  v_can_activate boolean := false;
  v_should_grant boolean := false;
  v_allowances_granted boolean := false;
  v_inserted integer;
  v_resource record;
  v_existing_lot public.usage_credit_lots%rowtype;
  v_entitlement_billing_status text;
  v_entitlement_state text;
  v_result text;
begin
  if p_projection is null
     or pg_catalog.jsonb_typeof(p_projection) <> 'object'
     or not (p_projection ?& array[
       'schema', 'provider_event_id', 'event_type', 'event_created_at',
       'event_object_id', 'workspace_id', 'operation_id', 'checkout_session_id',
       'customer_id', 'subscription_id', 'subscription_item_id', 'price_id',
       'product_id', 'plan_code', 'billing_interval', 'catalog_version',
       'currency', 'unit_amount_cents', 'platform_fee_bps', 'subscription_status',
       'period_start', 'period_end', 'cancel_at_period_end', 'cancel_at',
       'canceled_at', 'ended_at', 'invoice_id', 'invoice_status',
       'payment_evidence_kind', 'allowance_start', 'allowance_end',
       'feature_limits', 'feature_flags', 'terms_version',
       'recurring_consent_version', 'recurring_consent_text_sha256',
       'recurring_consent_acceptance_id'
     ])
     or (
       p_projection - array[
         'schema', 'provider_event_id', 'event_type', 'event_created_at',
         'event_object_id', 'workspace_id', 'operation_id', 'checkout_session_id',
         'customer_id', 'subscription_id', 'subscription_item_id', 'price_id',
         'product_id', 'plan_code', 'billing_interval', 'catalog_version',
         'currency', 'unit_amount_cents', 'platform_fee_bps', 'subscription_status',
         'period_start', 'period_end', 'cancel_at_period_end', 'cancel_at',
         'canceled_at', 'ended_at', 'invoice_id', 'invoice_status',
         'payment_evidence_kind', 'allowance_start', 'allowance_end',
         'feature_limits', 'feature_flags', 'terms_version',
         'recurring_consent_version', 'recurring_consent_text_sha256',
         'recurring_consent_acceptance_id'
       ]::text[]
     ) <> '{}'::jsonb then
    raise exception 'Stripe Billing projection must use the exact PII-free schema'
      using errcode = '22023';
  end if;

  if p_projection ->> 'schema' <> 'stripe_subscription_projection_v1'
     or pg_catalog.jsonb_typeof(p_projection -> 'feature_limits') <> 'object'
     or pg_catalog.jsonb_typeof(p_projection -> 'feature_flags') <> 'object' then
    raise exception 'Stripe Billing projection schema is invalid' using errcode = '22023';
  end if;

  -- Cast only after the exact key/schema check. Invalid JSON scalar types or
  -- timestamps abort the whole transaction and leave the claim reclaimable.
  v_account_id := (p_projection ->> 'workspace_id')::uuid;
  v_operation_id := p_projection ->> 'operation_id';
  v_provider_event_id := p_projection ->> 'provider_event_id';
  v_event_type := p_projection ->> 'event_type';
  v_event_object_id := p_projection ->> 'event_object_id';
  v_event_created_at := (p_projection ->> 'event_created_at')::timestamptz;
  v_checkout_session_id := p_projection ->> 'checkout_session_id';
  v_customer_id := p_projection ->> 'customer_id';
  v_subscription_id := p_projection ->> 'subscription_id';
  v_subscription_item_id := p_projection ->> 'subscription_item_id';
  v_price_id := p_projection ->> 'price_id';
  v_product_id := p_projection ->> 'product_id';
  v_plan_code := p_projection ->> 'plan_code';
  v_billing_interval := p_projection ->> 'billing_interval';
  v_catalog_version := p_projection ->> 'catalog_version';
  v_currency := p_projection ->> 'currency';
  v_unit_amount_cents := (p_projection ->> 'unit_amount_cents')::bigint;
  v_platform_fee_bps := (p_projection ->> 'platform_fee_bps')::integer;
  v_subscription_status := p_projection ->> 'subscription_status';
  v_period_start := (p_projection ->> 'period_start')::timestamptz;
  v_period_end := (p_projection ->> 'period_end')::timestamptz;
  v_cancel_at_period_end := (p_projection ->> 'cancel_at_period_end')::boolean;
  v_cancel_at := (p_projection ->> 'cancel_at')::timestamptz;
  v_canceled_at := (p_projection ->> 'canceled_at')::timestamptz;
  v_ended_at := (p_projection ->> 'ended_at')::timestamptz;
  v_invoice_id := p_projection ->> 'invoice_id';
  v_invoice_status := p_projection ->> 'invoice_status';
  v_payment_evidence := p_projection ->> 'payment_evidence_kind';
  v_allowance_start := (p_projection ->> 'allowance_start')::timestamptz;
  v_allowance_end := (p_projection ->> 'allowance_end')::timestamptz;
  v_terms_version := p_projection ->> 'terms_version';
  v_recurring_consent_version := p_projection ->> 'recurring_consent_version';
  v_recurring_consent_text_sha256 := p_projection ->> 'recurring_consent_text_sha256';
  v_recurring_consent_acceptance_id :=
    (p_projection ->> 'recurring_consent_acceptance_id')::uuid;

  if v_provider_event_id is null
     or v_provider_event_id !~ '^evt_[A-Za-z0-9_]{8,}$'
     or v_event_type is null
     or v_event_object_id is null
     or v_event_created_at is null
     or v_account_id is null
     or v_checkout_session_id is null
     or v_checkout_session_id !~ '^cs_(test|live)_[A-Za-z0-9_]+$'
     or v_customer_id is null
     or v_customer_id !~ '^cus_[A-Za-z0-9]{8,}$'
     or v_subscription_id is null
     or v_subscription_id !~ '^sub_[A-Za-z0-9]{8,}$'
     or v_subscription_item_id is null
     or v_subscription_item_id !~ '^si_[A-Za-z0-9]{8,}$'
     or v_price_id is null
     or v_price_id !~ '^price_[A-Za-z0-9]{8,}$'
     or v_product_id is null
     or v_product_id !~ '^prod_[A-Za-z0-9]{8,}$'
     or v_operation_id is null
     or pg_catalog.length(pg_catalog.btrim(v_operation_id)) not between 1 and 200
     or v_operation_id ~ '[[:cntrl:]]'
     or v_plan_code is null
     or v_plan_code not in ('solo', 'growth', 'scale')
     or v_billing_interval is null
     or v_billing_interval not in ('monthly', 'annual')
     or v_catalog_version is null
     or v_catalog_version <> '2026-08-15-preview'
     or v_currency is null
     or v_currency <> 'usd'
     or v_unit_amount_cents is null
     or v_platform_fee_bps is null
     or v_subscription_status is null
     or v_subscription_status not in (
       'incomplete', 'incomplete_expired', 'trialing', 'active',
       'past_due', 'canceled', 'unpaid', 'paused'
     )
     or v_period_start is null
     or v_period_end is null
     or v_cancel_at_period_end is null
     or v_payment_evidence is null
     or v_payment_evidence not in ('none', 'checkout_session_paid', 'invoice_paid')
     or v_period_end <= v_period_start
     or v_allowance_start is null
     or v_allowance_end is null
     or v_allowance_start is distinct from v_period_start
     or v_allowance_end is distinct from least(
       v_period_end,
       v_period_start + interval '1 month'
     )
     or v_terms_version is null
     or v_terms_version <> '2026-08-16'
     or v_recurring_consent_version is null
     or v_recurring_consent_version <> 'base-plan-recurring-2026-08-16'
     or v_recurring_consent_text_sha256 is null
     or v_recurring_consent_text_sha256 <>
       'f39aeedb379d397f941d3c5fc48357703b4cc97148d8b1bb3c2f55b04e449c75'
     or v_recurring_consent_acceptance_id is null then
    raise exception 'Stripe Billing projection contract is invalid' using errcode = '22023';
  end if;

  v_expected_amount := case
    when v_plan_code = 'solo' and v_billing_interval = 'monthly' then 3900
    when v_plan_code = 'solo' and v_billing_interval = 'annual' then 42000
    when v_plan_code = 'growth' and v_billing_interval = 'monthly' then 12900
    when v_plan_code = 'growth' and v_billing_interval = 'annual' then 118800
    when v_plan_code = 'scale' and v_billing_interval = 'monthly' then 32900
    when v_plan_code = 'scale' and v_billing_interval = 'annual' then 358800
    else null
  end;
  v_expected_fee_bps := case v_plan_code
    when 'solo' then 50 when 'growth' then 25 when 'scale' then 10 else null end;
  v_expected_feature_limits := case v_plan_code
    when 'solo' then pg_catalog.jsonb_build_object(
      'office_users', 1, 'crew_users', 2, 'custom_domain_connections', 1,
      'dedicated_business_numbers', 1, 'storage_gb', 10, 'quickbooks_connections', 1,
      'forwarding_minutes', 100, 'voice_concurrent_calls', 1,
      'voice_history_days', 30, 'voice_included_minutes', 0
    )
    when 'growth' then pg_catalog.jsonb_build_object(
      'office_users', 5, 'crew_users', 10, 'custom_domain_connections', 1,
      'dedicated_business_numbers', 1, 'storage_gb', 100, 'quickbooks_connections', 1,
      'forwarding_minutes', 100, 'voice_concurrent_calls', 1,
      'voice_history_days', 30, 'voice_included_minutes', 0
    )
    when 'scale' then pg_catalog.jsonb_build_object(
      'office_users', 5, 'crew_users', 10, 'custom_domain_connections', 1,
      'dedicated_business_numbers', 1, 'storage_gb', 100, 'quickbooks_connections', 1,
      'forwarding_minutes', 100, 'voice_concurrent_calls', 3,
      'voice_history_days', 90, 'voice_included_minutes', 100
    )
  end;
  v_expected_feature_flags := case v_plan_code
    when 'solo' then pg_catalog.jsonb_build_object(
      'quickbooks', true, 'shared_lgq_texting_number', false,
      'voice_included', false, 'voice_advanced_routing', false
    )
    when 'growth' then pg_catalog.jsonb_build_object(
      'quickbooks', true, 'shared_lgq_texting_number', false,
      'voice_included', false, 'voice_advanced_routing', false
    )
    when 'scale' then pg_catalog.jsonb_build_object(
      'quickbooks', true, 'shared_lgq_texting_number', false,
      'voice_included', true, 'voice_advanced_routing', true
    )
  end;
  if v_unit_amount_cents is distinct from v_expected_amount
     or v_platform_fee_bps is distinct from v_expected_fee_bps
     or p_projection -> 'feature_limits' is distinct from v_expected_feature_limits
     or p_projection -> 'feature_flags' is distinct from v_expected_feature_flags then
    raise exception 'Stripe Billing projection does not match the canonical catalog'
      using errcode = '22000';
  end if;

  select e.*
    into v_event
    from public.billing_events e
   where e.id = p_billing_event_id
   for update;
  if not found
     or v_event.event_scope <> 'platform_subscription'
     or v_event.processing_status <> 'processing'
     or v_event.projection_claim_token is distinct from p_claim_token
     or v_event.projection_lease_expires_at <= pg_catalog.now()
     or v_event.provider_event_id is distinct from v_provider_event_id
     or v_event.event_type is distinct from v_event_type
     or v_event.provider_created_at is distinct from v_event_created_at
     or v_event.payload #>> '{data_object,id}' is distinct from v_event_object_id then
    raise exception 'Stripe Billing event projection claim or provider identity changed'
      using errcode = '55000';
  end if;
  if (v_event.livemode and v_checkout_session_id !~ '^cs_live_')
     or (not v_event.livemode and v_checkout_session_id !~ '^cs_test_') then
    raise exception 'Stripe Billing Checkout Session mode is invalid' using errcode = '22000';
  end if;
  if (
    v_event_type like 'invoice.%'
    and (
      v_invoice_id is distinct from v_event_object_id
      or v_invoice_status is null
    )
  ) or (
    v_event_type like 'customer.subscription.%'
    and (
      v_subscription_id is distinct from v_event_object_id
      or v_invoice_id is not null
      or v_invoice_status is not null
    )
  ) or (
    v_payment_evidence = 'invoice_paid'
    and (
      v_event_type not in ('invoice.paid', 'invoice.payment_succeeded')
      or v_invoice_status <> 'paid'
    )
  ) or (
    v_payment_evidence = 'checkout_session_paid'
    and v_event_type not like 'customer.subscription.%'
  ) then
    raise exception 'Stripe Billing invoice/payment evidence binding is invalid'
      using errcode = '22000';
  end if;

  perform 1 from public.accounts a where a.id = v_account_id for update;
  if not found then
    raise exception 'Stripe Billing projection workspace was not found' using errcode = 'P0002';
  end if;

  select o.*
    into v_operation
    from public.billing_subscription_checkout_operations o
   where o.account_id = v_account_id
     and o.operation_id = pg_catalog.btrim(v_operation_id)
   for update;
  if not found
     or v_operation.state not in (
       'checkout_created', 'indeterminate', 'activated', 'expired', 'canceled'
     )
     or v_operation.livemode is distinct from v_event.livemode
     or v_operation.stripe_price_id is distinct from v_price_id
     or v_operation.stripe_product_id is distinct from v_product_id
     or v_operation.plan_code is distinct from v_plan_code
     or v_operation.billing_interval is distinct from v_billing_interval
     or v_operation.catalog_version is distinct from v_catalog_version
     or v_operation.currency is distinct from v_currency
     or v_operation.unit_amount_cents is distinct from v_unit_amount_cents
     or v_operation.terms_version is distinct from v_terms_version
     or v_operation.recurring_consent_version is distinct from v_recurring_consent_version
     or v_operation.recurring_consent_text_sha256 is distinct from
       v_recurring_consent_text_sha256
     or v_operation.recurring_consent_acceptance_id is distinct from
       v_recurring_consent_acceptance_id
     or (
       v_operation.provider_object_id is not null
       and v_operation.provider_object_id is distinct from v_checkout_session_id
     )
     or (
       v_operation.provider_customer_id is not null
       and v_operation.provider_customer_id is distinct from v_customer_id
     ) then
    raise exception 'Stripe Billing projection does not match its immutable Checkout operation'
      using errcode = '22000';
  end if;
  -- Keep the pre-transition state stable. The original Checkout payment may
  -- authorize this operation's first activation, but it is not evidence that a
  -- later monthly renewal was paid.
  v_operation_was_activated := v_operation.state = 'activated';
  v_was_activated := v_operation_was_activated;

  insert into public.billing_subscription_customers (
    account_id, provider, livemode, provider_customer_id
  ) values (
    v_account_id, 'stripe', v_event.livemode, v_customer_id
  ) on conflict (account_id, provider, livemode) do nothing;

  select c.*
    into v_customer
    from public.billing_subscription_customers c
   where c.account_id = v_account_id
     and c.provider = 'stripe'
     and c.livemode = v_event.livemode
   for update;
  if not found or v_customer.provider_customer_id is distinct from v_customer_id then
    raise exception 'Stripe Billing Customer identity is already bound differently'
      using errcode = '23505';
  end if;

  select s.*
    into v_subscription
    from public.billing_subscriptions s
   where s.provider = 'stripe'
     and s.livemode = v_event.livemode
     and s.provider_subscription_id = v_subscription_id
   for update;
  if not found then
    insert into public.billing_subscriptions (
      account_id, provider, livemode, provider_customer_id,
      provider_subscription_id, provider_subscription_item_id, provider_price_id,
      plan_code, billing_interval, status, catalog_version, currency,
      base_amount_cents, platform_fee_bps, current_period_start, current_period_end,
      cancel_at_period_end, cancel_at, canceled_at, ended_at,
      provider_state_event_created_at, provider_state_event_id,
      latest_invoice_id, latest_invoice_status, latest_invoice_event_type,
      latest_invoice_event_created_at, latest_invoice_event_id,
      last_paid_at, last_payment_failed_at, metadata
    ) values (
      v_account_id, 'stripe', v_event.livemode, v_customer_id,
      v_subscription_id, v_subscription_item_id, v_price_id,
      v_plan_code, v_billing_interval, v_subscription_status, v_catalog_version, v_currency,
      v_unit_amount_cents, v_platform_fee_bps, v_period_start, v_period_end,
      v_cancel_at_period_end, v_cancel_at, v_canceled_at, v_ended_at,
      v_event_created_at, v_provider_event_id,
      v_invoice_id, v_invoice_status,
      case when v_invoice_id is null then null else v_event_type end,
      case when v_invoice_id is null then null else v_event_created_at end,
      case when v_invoice_id is null then null else v_provider_event_id end,
      case when v_payment_evidence = 'invoice_paid' then v_event_created_at else null end,
      case when v_event_type = 'invoice.payment_failed' then v_event_created_at else null end,
      pg_catalog.jsonb_build_object(
        'schema', 'stripe_subscription_projection_v1',
        'checkout_operation_pk', v_operation.id,
        'checkout_session_id', v_checkout_session_id,
        'recurring_consent_acceptance_id', v_recurring_consent_acceptance_id
      )
    )
    returning * into v_subscription;
    v_state_applied := true;
    v_invoice_applied := v_invoice_id is not null;
  else
    if v_subscription.account_id is distinct from v_account_id
       or v_subscription.provider_customer_id is distinct from v_customer_id then
      raise exception 'Stripe Billing subscription identity is already bound differently'
        using errcode = '23505';
    end if;

    -- Stripe Event.created has only second precision and Event IDs are not
    -- chronological. An older second is ignored; an equal second re-projects
    -- the freshly retrieved current object, so arbitrary ID ordering cannot
    -- preserve stale failure state or regress paid truth.
    v_state_applied := v_subscription.provider_state_event_created_at is null
      or v_event_created_at >= v_subscription.provider_state_event_created_at;
    v_invoice_applied := v_invoice_id is not null and (
      v_subscription.latest_invoice_event_created_at is null
      or v_event_created_at >= v_subscription.latest_invoice_event_created_at
    );

    if v_state_applied then
      update public.billing_subscriptions s
         set provider_subscription_item_id = v_subscription_item_id,
             provider_price_id = v_price_id,
             plan_code = v_plan_code,
             billing_interval = v_billing_interval,
             status = v_subscription_status,
             catalog_version = v_catalog_version,
             currency = v_currency,
             base_amount_cents = v_unit_amount_cents,
             platform_fee_bps = v_platform_fee_bps,
             current_period_start = v_period_start,
             current_period_end = v_period_end,
             cancel_at_period_end = v_cancel_at_period_end,
             cancel_at = v_cancel_at,
             canceled_at = v_canceled_at,
             ended_at = v_ended_at,
             provider_state_event_created_at = v_event_created_at,
             provider_state_event_id = v_provider_event_id,
             metadata = s.metadata || pg_catalog.jsonb_build_object(
               'schema', 'stripe_subscription_projection_v1',
               'checkout_operation_pk', v_operation.id,
               'checkout_session_id', v_checkout_session_id,
               'recurring_consent_acceptance_id', v_recurring_consent_acceptance_id
             )
       where s.id = v_subscription.id
      returning * into v_subscription;
    end if;

    if v_invoice_applied then
      update public.billing_subscriptions s
         set latest_invoice_id = v_invoice_id,
             latest_invoice_status = v_invoice_status,
              -- A generic update for the same still-open invoice does not
              -- resolve an earlier payment failure/action-required state. Keep
              -- that collection cause until paid/void/uncollectible (or a new
              -- invoice identity) supplies decisive provider truth.
              latest_invoice_event_type = case
                when v_invoice_status = 'open'
                     and s.latest_invoice_id = v_invoice_id
                     and s.latest_invoice_status = 'open'
                     and s.latest_invoice_event_type in (
                       'invoice.payment_failed', 'invoice.payment_action_required'
                     )
                     and v_event_type not in (
                       'invoice.payment_failed', 'invoice.payment_action_required'
                     )
                  then s.latest_invoice_event_type
                else v_event_type
              end,
             latest_invoice_event_created_at = v_event_created_at,
             latest_invoice_event_id = v_provider_event_id,
             last_paid_at = case
               when v_payment_evidence = 'invoice_paid' then v_event_created_at
               else s.last_paid_at end,
             last_payment_failed_at = case
               when v_event_type = 'invoice.payment_failed' then v_event_created_at
               else s.last_payment_failed_at end
       where s.id = v_subscription.id
      returning * into v_subscription;
    end if;
  end if;

  -- Never provision the paid plan until the exact subscription is active and
  -- either its original exact Checkout Session or its current invoice is paid.
  v_can_activate := v_subscription_status = 'active'
    and v_payment_evidence in ('checkout_session_paid', 'invoice_paid');
  if not v_was_activated and v_operation.state in ('expired', 'canceled') and v_can_activate then
    raise exception 'terminal Checkout operation cannot activate a subscription'
      using errcode = '55000';
  end if;

  if not v_was_activated and v_operation.state in ('checkout_created', 'indeterminate') then
    if v_can_activate then
      update public.billing_subscription_checkout_operations o
         set state = 'activated',
             provider_object_id = v_checkout_session_id,
             resolved_at = pg_catalog.now(),
             last_error = null,
             metadata = o.metadata || pg_catalog.jsonb_build_object(
               'projection_schema', 'stripe_subscription_projection_v1',
               'provider_subscription_id', v_subscription_id,
               'billing_subscription_id', v_subscription.id
             ),
             updated_at = pg_catalog.now()
       where o.id = v_operation.id
      returning * into v_operation;
      v_was_activated := true;
    elsif v_subscription_status = 'incomplete_expired' then
      update public.billing_subscription_checkout_operations o
         set state = 'expired',
             provider_object_id = v_checkout_session_id,
             resolved_at = pg_catalog.now(),
             last_error = null,
             updated_at = pg_catalog.now()
       where o.id = v_operation.id
      returning * into v_operation;
    elsif v_subscription_status = 'canceled' then
      update public.billing_subscription_checkout_operations o
         set state = 'canceled',
             provider_object_id = v_checkout_session_id,
             resolved_at = pg_catalog.now(),
             last_error = null,
             updated_at = pg_catalog.now()
       where o.id = v_operation.id
      returning * into v_operation;
    end if;
  end if;

  if v_was_activated and (v_state_applied or v_invoice_applied) then
    -- Subscription events carry no Invoice context. Use the persisted invoice
    -- collection snapshot so an unrelated active subscription update cannot
    -- erase failure-derived grace, and a later paid/void event can resolve it
    -- even when its Event.created second predates a newer subscription marker.
    v_entitlement_billing_status := case v_subscription.status
      when 'incomplete' then 'incomplete'
      when 'incomplete_expired' then 'incomplete'
      when 'trialing' then 'trialing'
      when 'active' then case
        when v_subscription.latest_invoice_event_type in (
               'invoice.payment_failed', 'invoice.payment_action_required'
             )
             and v_subscription.latest_invoice_status = 'open'
          then 'past_due'
        -- Uncollectible is itself a terminal collection status. A later
        -- invoice.updated for that same Invoice must not restore access merely
        -- because its event type is generic.
        when v_subscription.latest_invoice_status = 'uncollectible'
          then 'unpaid'
        else 'active' end
      when 'past_due' then 'past_due'
      when 'canceled' then 'canceled'
      when 'unpaid' then 'unpaid'
      when 'paused' then 'paused'
    end;
    -- A later paid/void/current-invoice provider snapshot maps the freshly
    -- retrieved active Subscription back to active. A subscription-only event
    -- cannot clear a still-open failed invoice by omitting Invoice context.
    v_entitlement_state := case
      when v_entitlement_billing_status = 'active' then 'active'
      when v_entitlement_billing_status = 'past_due' then 'grace'
      else 'restricted'
    end;

    select e.*
      into v_entitlement
      from public.workspace_entitlements e
     where e.account_id = v_account_id
     for update;
    if not found then
      raise exception 'workspace entitlement snapshot was not found' using errcode = 'P0002';
    end if;
    if v_entitlement.plan_code not in ('flex', v_plan_code) then
      raise exception 'workspace entitlement is already bound to another paid plan'
        using errcode = '22000';
    end if;

    v_should_grant := v_entitlement_billing_status = 'active'
      and (
        v_payment_evidence = 'invoice_paid'
        or (
          not v_operation_was_activated
          and v_payment_evidence = 'checkout_session_paid'
        )
      )
      and v_allowance_end > pg_catalog.now()
      and (
        v_entitlement.plan_code = 'flex'
        or v_entitlement.next_allowance_reset_at is null
        or v_allowance_start >= v_entitlement.next_allowance_reset_at
      );

    update public.workspace_entitlements e
       set plan_code = v_plan_code,
           billing_interval = v_billing_interval,
           billing_status = v_entitlement_billing_status,
           entitlement_state = v_entitlement_state,
           catalog_version = v_catalog_version,
           platform_fee_bps = v_platform_fee_bps,
            period_start = v_subscription.current_period_start,
            period_end = v_subscription.current_period_end,
           next_allowance_reset_at = case
             when v_entitlement_billing_status = 'active' and v_should_grant
               then v_allowance_end
             when v_entitlement_billing_status = 'active'
               then e.next_allowance_reset_at
             when v_entitlement_billing_status in ('canceled', 'unpaid', 'paused', 'incomplete')
               then null
             else e.next_allowance_reset_at
           end,
           feature_limits = v_expected_feature_limits,
           feature_flags = v_expected_feature_flags,
           version = e.version + 1,
            effective_at = greatest(e.effective_at, v_event_created_at),
           updated_at = pg_catalog.now()
     where e.account_id = v_account_id;

    if v_should_grant then
      for v_resource in
        select * from (values
          ('text_segments'::text, case v_plan_code
            when 'solo' then 500 when 'growth' then 1500 when 'scale' then 1500 end),
          ('marketing_email_sends'::text, case v_plan_code
            when 'solo' then 500 when 'growth' then 2500 when 'scale' then 2500 end),
          ('ai_intake_threads'::text, case v_plan_code
            when 'solo' then 250 when 'growth' then 500 when 'scale' then 500 end),
          ('ai_writing_drafts'::text, case v_plan_code
            when 'solo' then 50 when 'growth' then 250 when 'scale' then 250 end)
        ) as resources(resource_code, units)
      loop
        insert into public.usage_credit_lots (
          account_id, resource_code, source_type, idempotency_key,
          catalog_version, billing_event_id, granted_units,
          available_from, expires_at, metadata
        ) values (
          v_account_id,
          v_resource.resource_code,
          'plan_period',
          'plan-period:' || v_catalog_version || ':' || v_subscription_id || ':'
            || pg_catalog.date_part('epoch', v_allowance_start)::bigint::text || ':'
            || v_resource.resource_code,
          v_catalog_version,
          v_event.id,
          v_resource.units,
          v_allowance_start,
          v_allowance_end,
          pg_catalog.jsonb_build_object(
            'schema', 'paid_plan_monthly_allowance_v1',
            'plan_code', v_plan_code,
            'billing_interval', v_billing_interval,
            'provider_subscription_id', v_subscription_id,
            'allowance_start', v_allowance_start,
            'allowance_end', v_allowance_end
          )
        ) on conflict (account_id, resource_code, idempotency_key) do nothing;
        get diagnostics v_inserted = row_count;
        if v_inserted = 1 then v_allowances_granted := true; end if;

        select l.*
          into v_existing_lot
          from public.usage_credit_lots l
         where l.account_id = v_account_id
           and l.resource_code = v_resource.resource_code
           and l.idempotency_key =
             'plan-period:' || v_catalog_version || ':' || v_subscription_id || ':'
             || pg_catalog.date_part('epoch', v_allowance_start)::bigint::text || ':'
             || v_resource.resource_code
         for update;
        if not found
           or v_existing_lot.source_type <> 'plan_period'
           or v_existing_lot.catalog_version is distinct from v_catalog_version
           or v_existing_lot.granted_units is distinct from v_resource.units
           or v_existing_lot.available_from is distinct from v_allowance_start
           or v_existing_lot.expires_at is distinct from v_allowance_end then
          raise exception 'monthly allowance idempotency binding is inconsistent'
            using errcode = '22000';
        end if;
      end loop;
    end if;
  end if;

  update public.billing_events e
     set account_id = v_account_id,
         billing_subscription_id = v_subscription.id,
         processing_status = case
           when v_state_applied or v_invoice_applied then 'processed' else 'ignored' end,
         processed_at = pg_catalog.now(),
         next_attempt_at = null,
         last_error = null,
         projection_claim_token = null,
         projection_lease_expires_at = null,
         projection_schema_version = 'stripe_subscription_projection_v1',
         projection_applied = v_state_applied or v_invoice_applied,
         projection_result = case
           when v_state_applied and v_invoice_applied
             then 'subscription_and_invoice_state_applied'
           when v_state_applied then 'subscription_state_applied'
           when v_invoice_applied then 'invoice_state_applied'
           else 'out_of_order_ignored'
         end
   where e.id = v_event.id;

  v_result := case when v_state_applied or v_invoice_applied then 'processed' else 'ignored' end;
  return query select
    v_result,
    v_subscription.id,
    v_account_id,
    v_state_applied or v_invoice_applied,
    v_allowances_granted;
end;
$$;

-- Store only a fixed machine code. Never persist provider/exception messages,
-- since they may contain request bodies, Customer fields, or identifiers.
create function public.fail_stripe_billing_subscription_event(
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
  if p_error_code is null
     or p_error_code !~ '^[a-z][a-z0-9_]{2,99}$'
     or p_retryable is null
     or (
       p_retryable
       and (
         p_next_attempt_at is null
         or p_next_attempt_at < pg_catalog.now() + interval '1 minute'
         or p_next_attempt_at > pg_catalog.now() + interval '1 day 1 minute'
       )
     )
     or (not p_retryable and p_next_attempt_at is not null) then
    raise exception 'Stripe Billing projection failure contract is invalid'
      using errcode = '22023';
  end if;

  select e.*
    into v_event
    from public.billing_events e
   where e.id = p_billing_event_id
   for update;
  if not found
     or v_event.event_scope <> 'platform_subscription'
     or v_event.processing_status <> 'processing'
     or v_event.projection_claim_token is distinct from p_claim_token
     or v_event.projection_lease_expires_at <= pg_catalog.now() then
    raise exception 'Stripe Billing event projection claim is not owned or expired'
      using errcode = '55000';
  end if;

  update public.billing_events e
     set processing_status = 'failed',
         projection_claim_token = null,
         projection_lease_expires_at = null,
         next_attempt_at = p_next_attempt_at,
         last_error = p_error_code
   where e.id = v_event.id;
  return true;
end;
$$;

revoke all on function public.claim_stripe_billing_subscription_event(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.resolve_stripe_billing_subscription_projection_binding(
  uuid, uuid, uuid, text, text, text, text
) from public, anon, authenticated, service_role;
revoke all on function public.project_stripe_billing_subscription_event(uuid, uuid, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.fail_stripe_billing_subscription_event(
  uuid, uuid, text, boolean, timestamptz
) from public, anon, authenticated, service_role;

grant execute on function public.claim_stripe_billing_subscription_event(uuid)
  to service_role;
grant execute on function public.resolve_stripe_billing_subscription_projection_binding(
  uuid, uuid, uuid, text, text, text, text
) to service_role;
grant execute on function public.project_stripe_billing_subscription_event(uuid, uuid, jsonb)
  to service_role;
grant execute on function public.fail_stripe_billing_subscription_event(
  uuid, uuid, text, boolean, timestamptz
) to service_role;

comment on function public.project_stripe_billing_subscription_event(uuid, uuid, jsonb) is
  'Dark PII-free Stripe Billing projector; no webhook route or active caller exists.';
comment on column public.workspace_entitlements.next_allowance_reset_at is
  'End of the current monthly usage window. Annual billing changes payment cadence only; a separate idempotent monthly reset worker must advance this value.';

commit;

-- Rollback is safe only while this dark projector has never been invoked. Drop
-- the four RPCs/index/added columns and restore service-role grants from the
-- prior migrations; restore the prior workspace_entitlements status check.
