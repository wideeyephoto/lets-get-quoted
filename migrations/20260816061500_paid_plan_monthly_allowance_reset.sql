-- DARK paid-plan monthly allowance reset foundation.
--
-- This migration creates no route, cron, queue consumer, or environment
-- switch. A future server-only scheduler may call one RPC for one workspace.
-- The RPC derives plan and units exclusively from locked subscription and
-- entitlement rows, advances one exact calendar-month window at most, and is
-- atomic with all four credit lots. Annual payment cadence never pre-issues a
-- year of usage.

begin;

-- Composite ownership is useful to the immutable reset ledger and prevents an
-- audit row from ever pairing a subscription with another workspace.
alter table public.billing_subscriptions
  add constraint billing_subscriptions_id_account_unique
  unique (id, account_id);

create table public.billing_allowance_reset_operations (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  account_id uuid not null,
  billing_subscription_id uuid not null,
  operation_key text not null check (
    operation_key ~ '^paid-plan-monthly-reset:v1:[0-9a-f-]{36}:[0-9]+$'
    and pg_catalog.length(operation_key) <= 200
  ),
  plan_code text not null check (plan_code in ('solo', 'growth', 'scale')),
  billing_interval text not null check (billing_interval in ('monthly', 'annual')),
  catalog_version text not null check (catalog_version = '2026-08-15-preview'),
  provider_period_start timestamptz not null,
  provider_period_end timestamptz not null,
  allowance_window_start timestamptz not null,
  allowance_window_end timestamptz not null,
  status text not null check (status in ('completed', 'blocked_catchup')),
  inserted_lot_count integer not null check (inserted_lot_count between 0 and 4),
  verified_lot_count integer not null check (verified_lot_count between 0 and 4),
  block_reason text check (block_reason in ('more_than_one_boundary_overdue')),
  metadata jsonb not null default '{}'::jsonb
    check (pg_catalog.jsonb_typeof(metadata) = 'object'),
  completed_at timestamptz not null default pg_catalog.now(),
  created_at timestamptz not null default pg_catalog.now(),
  constraint billing_allowance_reset_operations_subscription_fk
    foreign key (billing_subscription_id, account_id)
    references public.billing_subscriptions(id, account_id)
    on delete restrict,
  constraint billing_allowance_reset_operations_window_check check (
    provider_period_end > provider_period_start
    and allowance_window_end > allowance_window_start
    and allowance_window_start >= provider_period_start
    and allowance_window_end <= provider_period_end
  ),
  constraint billing_allowance_reset_operations_status_shape_check check (
    (
      status = 'completed'
      and inserted_lot_count between 0 and 4
      and verified_lot_count = 4
      and block_reason is null
    )
    or (
      status = 'blocked_catchup'
      and inserted_lot_count = 0
      and verified_lot_count = 0
      and block_reason = 'more_than_one_boundary_overdue'
    )
  ),
  constraint billing_allowance_reset_operations_window_unique
    unique (billing_subscription_id, allowance_window_start),
  constraint billing_allowance_reset_operations_business_key_unique
    unique (account_id, operation_key)
);

create index billing_allowance_reset_operations_account_created_idx
  on public.billing_allowance_reset_operations (account_id, created_at desc);
create index billing_allowance_reset_operations_subscription_account_idx
  on public.billing_allowance_reset_operations (billing_subscription_id, account_id);

alter table public.billing_allowance_reset_operations enable row level security;
alter table public.billing_allowance_reset_operations force row level security;

-- Terminal audit rows are append-only. The reset RPC inserts the terminal row
-- in the same transaction as its credits (or its explicit catch-up block).
create function public.protect_billing_allowance_reset_operation()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  raise exception 'paid-plan allowance reset audit rows are immutable'
    using errcode = '42501';
end;
$$;

create trigger protect_billing_allowance_reset_operation_trigger
before update or delete on public.billing_allowance_reset_operations
for each row execute function public.protect_billing_allowance_reset_operation();

revoke all on function public.protect_billing_allowance_reset_operation()
  from public, anon, authenticated, service_role;

-- Apply at most one exact next monthly window for one workspace.
--
-- There is deliberately no p_plan_code, p_units, p_window_start, p_window_end,
-- or p_now. Provider state and the entitlement cursor are the only authority.
-- Locks follow the projector's subscription-then-entitlement order.
create function public.apply_paid_plan_monthly_allowance_reset(
  p_account_id uuid
)
returns table (
  reset_status text,
  operation_id uuid,
  workspace_id uuid,
  billing_subscription_id uuid,
  allowance_window_start timestamptz,
  allowance_window_end timestamptz,
  inserted_lot_count integer,
  verified_lot_count integer,
  next_allowance_reset_at timestamptz,
  reason_code text
)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_subscription public.billing_subscriptions%rowtype;
  v_entitlement public.workspace_entitlements%rowtype;
  v_existing_operation public.billing_allowance_reset_operations%rowtype;
  v_existing_lot public.usage_credit_lots%rowtype;
  v_operation_id uuid := pg_catalog.gen_random_uuid();
  v_operation_key text;
  v_window_start timestamptz;
  v_window_end timestamptz;
  v_anchor_boundary timestamptz;
  v_next_anchor_boundary timestamptz;
  v_anchor_index integer;
  v_inserted integer;
  v_inserted_total integer := 0;
  v_verified_total integer := 0;
  v_resource record;
begin
  if p_account_id is null then
    raise exception 'workspace ID is required' using errcode = '22023';
  end if;

  -- The partial unique index permits at most one live subscription. Canceled
  -- rows are intentionally not candidates: cancellation always fails closed.
  select s.*
    into v_subscription
    from public.billing_subscriptions s
   where s.account_id = p_account_id
     and s.status in (
       'incomplete', 'trialing', 'active', 'past_due', 'unpaid', 'paused'
     )
   for update;

  if not found then
    return query select
      'not_eligible'::text, null::uuid, p_account_id, null::uuid,
      null::timestamptz, null::timestamptz, 0, 0, null::timestamptz,
      'subscription_not_live'::text;
    return;
  end if;

  select e.*
    into v_entitlement
    from public.workspace_entitlements e
   where e.account_id = p_account_id
   for update;
  if not found then
    raise exception 'workspace entitlement snapshot was not found'
      using errcode = 'P0002';
  end if;

  -- Both provider projection and entitlement access must independently say
  -- active. Open failed invoices also fail closed if a corrupted entitlement
  -- snapshot were ever to remain active.
  if v_subscription.status <> 'active'
     or (
       v_subscription.latest_invoice_status = 'open'
       and v_subscription.latest_invoice_event_type in (
         'invoice.payment_failed', 'invoice.payment_action_required'
       )
     )
     -- Uncollectible is terminal provider truth even when a later generic
     -- invoice.updated event becomes the latest event type for that invoice.
     or v_subscription.latest_invoice_status = 'uncollectible' then
    return query select
      'not_eligible'::text, null::uuid, p_account_id, v_subscription.id,
      null::timestamptz, null::timestamptz, 0, 0,
      v_entitlement.next_allowance_reset_at, 'subscription_not_active'::text;
    return;
  end if;

  if v_entitlement.billing_status <> 'active'
     or v_entitlement.entitlement_state <> 'active' then
    return query select
      'not_eligible'::text, null::uuid, p_account_id, v_subscription.id,
      null::timestamptz, null::timestamptz, 0, 0,
      v_entitlement.next_allowance_reset_at, 'entitlement_not_active'::text;
    return;
  end if;

  if v_subscription.plan_code not in ('solo', 'growth', 'scale')
     or v_subscription.billing_interval not in ('monthly', 'annual')
     or v_subscription.catalog_version <> '2026-08-15-preview'
     or v_entitlement.plan_code is distinct from v_subscription.plan_code
     or v_entitlement.billing_interval is distinct from v_subscription.billing_interval
     or v_entitlement.catalog_version is distinct from v_subscription.catalog_version
     or v_entitlement.period_start is distinct from v_subscription.current_period_start
     or v_entitlement.period_end is distinct from v_subscription.current_period_end then
    raise exception 'paid-plan allowance authority is inconsistent'
      using errcode = '22000';
  end if;

  if v_subscription.current_period_start is null
     or v_subscription.current_period_end is null
     or v_subscription.current_period_end <= v_subscription.current_period_start
     or v_entitlement.next_allowance_reset_at is null then
    return query select
      'not_eligible'::text, null::uuid, p_account_id, v_subscription.id,
      null::timestamptz, null::timestamptz, 0, 0,
      v_entitlement.next_allowance_reset_at, 'allowance_schedule_missing'::text;
    return;
  end if;

  v_window_start := v_entitlement.next_allowance_reset_at;

  if v_subscription.billing_interval = 'monthly' then
    -- A paid monthly renewal first advances Stripe's provider period. The
    -- exact next cursor must then equal that new period start. If it still
    -- equals the current period end, there is no due window yet.
    if v_window_start = v_subscription.current_period_end then
      return query select
        'not_due'::text, null::uuid, p_account_id, v_subscription.id,
        null::timestamptz, null::timestamptz, 0, 0, v_window_start,
        'waiting_for_provider_period'::text;
      return;
    end if;

    -- An active Subscription object can advance before its renewal invoice is
    -- paid. Do not let that provider-period update become payment evidence.
    if v_subscription.latest_invoice_status is distinct from 'paid'
       or v_subscription.latest_invoice_event_type not in (
         'invoice.paid', 'invoice.payment_succeeded'
       )
       or v_subscription.last_paid_at is null
       or v_subscription.last_paid_at < v_subscription.current_period_start then
      return query select
        'not_eligible'::text, null::uuid, p_account_id, v_subscription.id,
        null::timestamptz, null::timestamptz, 0, 0, v_window_start,
        'current_provider_period_not_paid'::text;
      return;
    end if;

    if v_window_start is distinct from v_subscription.current_period_start then
      raise exception 'monthly allowance cursor is not the provider period start'
        using errcode = '22000';
    end if;
    v_window_end := least(
      v_subscription.current_period_end,
      (
        v_subscription.current_period_start at time zone 'UTC'
        + pg_catalog.make_interval(months => 1)
      ) at time zone 'UTC'
    );
  else
    -- Annual billing changes only payment cadence. Derive every boundary from
    -- the original provider-period start, never by repeatedly adding a month
    -- to the prior cursor (which would drift after dates such as January 31).
    if v_window_start = v_subscription.current_period_end then
      return query select
        'not_due'::text, null::uuid, p_account_id, v_subscription.id,
        null::timestamptz, null::timestamptz, 0, 0, v_window_start,
        'waiting_for_provider_period'::text;
      return;
    end if;
    if v_window_start < v_subscription.current_period_start
       or v_window_start > v_subscription.current_period_end then
      raise exception 'annual allowance cursor is outside the provider period'
        using errcode = '22000';
    end if;

    -- A Stripe annual period has at most twelve monthly starts. The fixed
    -- bound is also a fail-closed guard against malformed provider periods.
    for v_anchor_index in 1..11 loop
      v_anchor_boundary := (
        v_subscription.current_period_start at time zone 'UTC'
        + pg_catalog.make_interval(months => v_anchor_index)
      ) at time zone 'UTC';
      if v_anchor_boundary = v_window_start then
        v_next_anchor_boundary := (
          v_subscription.current_period_start at time zone 'UTC'
          + pg_catalog.make_interval(months => v_anchor_index + 1)
        ) at time zone 'UTC';
        exit;
      end if;
    end loop;

    if v_anchor_boundary is distinct from v_window_start
       or v_next_anchor_boundary is null then
      raise exception 'annual allowance cursor is not an anchored monthly boundary'
        using errcode = '22000';
    end if;
    v_window_end := least(v_subscription.current_period_end, v_next_anchor_boundary);
  end if;

  if v_window_end <= v_window_start then
    raise exception 'paid-plan allowance window is empty'
      using errcode = '22000';
  end if;

  if v_now < v_window_start then
    return query select
      'not_due'::text, null::uuid, p_account_id, v_subscription.id,
      v_window_start, v_window_end, 0, 0, v_window_start,
      'allowance_window_not_started'::text;
    return;
  end if;

  v_operation_key := 'paid-plan-monthly-reset:v1:' || v_subscription.id::text || ':'
    || pg_catalog.date_part('epoch', v_window_start)::bigint::text;

  select o.*
    into v_existing_operation
    from public.billing_allowance_reset_operations o
   where o.billing_subscription_id = v_subscription.id
     and o.allowance_window_start = v_window_start;

  if found then
    if v_existing_operation.account_id is distinct from p_account_id
       or v_existing_operation.operation_key is distinct from v_operation_key
       or v_existing_operation.plan_code is distinct from v_subscription.plan_code
       or v_existing_operation.billing_interval is distinct from v_subscription.billing_interval
       or v_existing_operation.catalog_version is distinct from v_subscription.catalog_version
       or v_existing_operation.provider_period_start is distinct from v_subscription.current_period_start
       or v_existing_operation.provider_period_end is distinct from v_subscription.current_period_end
       or v_existing_operation.allowance_window_end is distinct from v_window_end then
      raise exception 'paid-plan allowance operation identity is inconsistent'
        using errcode = '22000';
    end if;
    if v_existing_operation.status = 'blocked_catchup' then
      return query select
        'blocked_catchup'::text, v_existing_operation.id, p_account_id,
        v_subscription.id, v_window_start, v_window_end, 0, 0, v_window_start,
        'catchup_requires_reconciliation'::text;
      return;
    end if;
    -- A completed operation and an unadvanced cursor cannot be produced by
    -- this atomic RPC. Refuse to conceal out-of-band state corruption.
    raise exception 'completed allowance operation has an unadvanced cursor'
      using errcode = '22000';
  end if;

  -- Policy decision: once the exact next window has fully elapsed, do not
  -- skip it, backfill it, or bulk-issue later months. Record the block and wait
  -- for explicit operator/provider reconciliation.
  if v_now >= v_window_end then
    insert into public.billing_allowance_reset_operations (
      id, account_id, billing_subscription_id, operation_key,
      plan_code, billing_interval, catalog_version,
      provider_period_start, provider_period_end,
      allowance_window_start, allowance_window_end,
      status, inserted_lot_count, verified_lot_count, block_reason, metadata
    ) values (
      v_operation_id, p_account_id, v_subscription.id, v_operation_key,
      v_subscription.plan_code, v_subscription.billing_interval,
      v_subscription.catalog_version,
      v_subscription.current_period_start, v_subscription.current_period_end,
      v_window_start, v_window_end,
      'blocked_catchup', 0, 0, 'more_than_one_boundary_overdue',
      pg_catalog.jsonb_build_object(
        'schema', 'paid_plan_monthly_allowance_reset_v1',
        'policy', 'fail_closed_no_retroactive_catchup'
      )
    );

    return query select
      'blocked_catchup'::text, v_operation_id, p_account_id,
      v_subscription.id, v_window_start, v_window_end, 0, 0, v_window_start,
      'catchup_requires_reconciliation'::text;
    return;
  end if;

  -- Exactly four canonical grants. Values are database-owned and match the
  -- initial subscription projector for this immutable catalog version.
  for v_resource in
    select * from (values
      ('text_segments'::text, case v_subscription.plan_code
        when 'solo' then 500 when 'growth' then 1500 when 'scale' then 1500 end),
      ('marketing_email_sends'::text, case v_subscription.plan_code
        when 'solo' then 500 when 'growth' then 2500 when 'scale' then 2500 end),
      ('ai_intake_threads'::text, case v_subscription.plan_code
        when 'solo' then 250 when 'growth' then 500 when 'scale' then 500 end),
      ('ai_writing_drafts'::text, case v_subscription.plan_code
        when 'solo' then 50 when 'growth' then 250 when 'scale' then 250 end)
    ) as resources(resource_code, units)
  loop
    -- A second key overlapping this exact subscription/window is never a
    -- legitimate catch-up or plan grant. Purchased credits are not selected,
    -- updated, expired, or otherwise touched by this RPC.
    if exists (
      select 1
        from public.usage_credit_lots l
       where l.account_id = p_account_id
         and l.resource_code = v_resource.resource_code
         and l.source_type = 'plan_period'
         and l.metadata ->> 'provider_subscription_id' =
           v_subscription.provider_subscription_id
         and l.idempotency_key <> (
           'plan-period:' || v_subscription.catalog_version || ':'
           || v_subscription.provider_subscription_id || ':'
           || pg_catalog.date_part('epoch', v_window_start)::bigint::text || ':'
           || v_resource.resource_code
         )
         and tstzrange(l.available_from, l.expires_at, '[)')
           && tstzrange(v_window_start, v_window_end, '[)')
    ) then
      raise exception 'paid-plan allowance window overlaps another grant'
        using errcode = '22000';
    end if;

    insert into public.usage_credit_lots (
      account_id, resource_code, source_type, idempotency_key,
      catalog_version, billing_event_id, granted_units,
      available_from, expires_at, metadata
    ) values (
      p_account_id,
      v_resource.resource_code,
      'plan_period',
      'plan-period:' || v_subscription.catalog_version || ':'
        || v_subscription.provider_subscription_id || ':'
        || pg_catalog.date_part('epoch', v_window_start)::bigint::text || ':'
        || v_resource.resource_code,
      v_subscription.catalog_version,
      null,
      v_resource.units,
      v_window_start,
      v_window_end,
      pg_catalog.jsonb_build_object(
        'schema', 'paid_plan_monthly_allowance_v1',
        'plan_code', v_subscription.plan_code,
        'billing_interval', v_subscription.billing_interval,
        'provider_subscription_id', v_subscription.provider_subscription_id,
        'allowance_start', v_window_start,
        'allowance_end', v_window_end,
        'reset_operation_id', v_operation_id
      )
    ) on conflict (account_id, resource_code, idempotency_key) do nothing;
    get diagnostics v_inserted = row_count;
    v_inserted_total := v_inserted_total + v_inserted;

    select l.*
      into v_existing_lot
      from public.usage_credit_lots l
     where l.account_id = p_account_id
       and l.resource_code = v_resource.resource_code
       and l.idempotency_key =
         'plan-period:' || v_subscription.catalog_version || ':'
         || v_subscription.provider_subscription_id || ':'
         || pg_catalog.date_part('epoch', v_window_start)::bigint::text || ':'
         || v_resource.resource_code
     for update;

    if not found
       or v_existing_lot.source_type <> 'plan_period'
       or v_existing_lot.catalog_version is distinct from v_subscription.catalog_version
       or v_existing_lot.granted_units is distinct from v_resource.units
       or v_existing_lot.available_from is distinct from v_window_start
       or v_existing_lot.expires_at is distinct from v_window_end
       or v_existing_lot.metadata ->> 'schema' <> 'paid_plan_monthly_allowance_v1'
       or v_existing_lot.metadata ->> 'plan_code' <> v_subscription.plan_code
       or v_existing_lot.metadata ->> 'billing_interval' <> v_subscription.billing_interval
       or v_existing_lot.metadata ->> 'provider_subscription_id' <>
         v_subscription.provider_subscription_id
       or (v_existing_lot.metadata ->> 'allowance_start')::timestamptz
         is distinct from v_window_start
       or (v_existing_lot.metadata ->> 'allowance_end')::timestamptz
         is distinct from v_window_end then
      raise exception 'monthly allowance idempotency binding is inconsistent'
        using errcode = '22000';
    end if;
    v_verified_total := v_verified_total + 1;
  end loop;

  if v_verified_total <> 4 then
    raise exception 'monthly allowance did not verify all canonical resources'
      using errcode = '22000';
  end if;

  insert into public.billing_allowance_reset_operations (
    id, account_id, billing_subscription_id, operation_key,
    plan_code, billing_interval, catalog_version,
    provider_period_start, provider_period_end,
    allowance_window_start, allowance_window_end,
    status, inserted_lot_count, verified_lot_count, metadata
  ) values (
    v_operation_id, p_account_id, v_subscription.id, v_operation_key,
    v_subscription.plan_code, v_subscription.billing_interval,
    v_subscription.catalog_version,
    v_subscription.current_period_start, v_subscription.current_period_end,
    v_window_start, v_window_end,
    'completed', v_inserted_total, v_verified_total,
    pg_catalog.jsonb_build_object(
      'schema', 'paid_plan_monthly_allowance_reset_v1',
      'grant_schema', 'paid_plan_monthly_allowance_v1'
    )
  );

  update public.workspace_entitlements e
     set next_allowance_reset_at = v_window_end,
         version = e.version + 1,
         effective_at = greatest(e.effective_at, v_window_start),
         updated_at = pg_catalog.now()
   where e.account_id = p_account_id
     and e.next_allowance_reset_at = v_window_start;
  get diagnostics v_inserted = row_count;
  if v_inserted <> 1 then
    raise exception 'monthly allowance cursor changed during its locked reset'
      using errcode = '40001';
  end if;

  return query select
    'completed'::text, v_operation_id, p_account_id, v_subscription.id,
    v_window_start, v_window_end, v_inserted_total, v_verified_total,
    v_window_end, null::text;
end;
$$;

-- Explicit 2026 Data API hardening: the audit table is backend-readable only,
-- while all mutation is constrained by the sole security-definer RPC.
revoke all on table public.billing_allowance_reset_operations
  from public, anon, authenticated, service_role;
grant select on table public.billing_allowance_reset_operations to service_role;

revoke all on function public.apply_paid_plan_monthly_allowance_reset(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.apply_paid_plan_monthly_allowance_reset(uuid)
  to service_role;

comment on table public.billing_allowance_reset_operations is
  'PII-free terminal audit for one-window paid-plan usage resets; no active scheduler exists.';
comment on function public.apply_paid_plan_monthly_allowance_reset(uuid) is
  'Dark atomic reset for exactly one anchored paid-plan monthly usage window; service role only.';

commit;

-- Activation blockers (intentionally unresolved here):
--   1. Apply and validate the subscription-event projector first.
--   2. Add a server-only due-workspace selector and scheduler with overlap lock.
--   3. Build an operator reconciliation path for blocked_catchup rows.
--   4. Run Stripe test-clock coverage across month-end/leap-day anchors.
--   5. Add monitoring for not_eligible, failures, and blocked_catchup outcomes.
