-- The only paid workspace cannot collect a card payment. Fix the row, then
-- stop the projector being able to write that state again.
--
-- WHAT IS BROKEN. workspace_entitlements for account
-- 7caf66e2-7c05-4d7d-a768-83f2da784713 still carries
-- catalog_version = '2026-08-15-preview'. Three live, granted, wired functions
-- refuse on that exact column with errcode 55000:
--
--   claim_one_off_direct_checkout_operation      -- reached from direct-checkout-operation.ts
--   prepare_one_off_direct_invoice_payment       -- reached from direct-payment-preparation.ts
--   require_direct_checkout_entitlement_snapshot -- reached from TWO ENABLED TRIGGERS on
--                                                   billing_payment_operations
--
-- So that workspace cannot take money from its own customers by any route. It
-- has not been observed because all four of its payments rows have a NULL
-- fee_catalog_version -- the direct rail has never been exercised there -- but
-- it is provable from the guard text plus the row, and the first attempt would
-- fail.
--
-- THE DISTINCTION THIS MIGRATION IS BUILT ON. catalog_version does two
-- structurally different jobs and they need opposite handling:
--
--   EVIDENCE  -- "the version this agreement was signed under".
--               billing_subscription_checkout_operations, ..._consent_acceptances,
--               billing_subscriptions, and the Stripe-side metadata. Immutable
--               (an enabled trigger enforces it), and it must stay READABLE at
--               its own version. Never rewrite these.
--
--   CURRENTNESS -- "this row carries catalog X's limits and fee right now".
--               workspace_entitlements.catalog_version, payments.fee_catalog_version.
--               Must equal the current catalog, because live guards compare it
--               to a literal. Move the row; never widen the reader.
--
-- Migration 20260818120000 widened three EVIDENCE checks and correctly left the
-- CURRENTNESS ones alone. What it did not do was move the currentness rows
-- forward, and 20260819040000 -- which existed to do exactly that -- skipped
-- this row: its guard matched on an eight-key feature_limits map and this row
-- carries ten, because the projector writes all ten.
--
-- WHY THIS IS NOT A RELABEL. The row does not merely carry the old label, it
-- carries the old LIMITS: office_users 1 (corrected to 2 by 20260821010000,
-- because the owner occupies a seat so a one-seat plan can never invite
-- anybody) and dedicated_business_numbers 1 (zeroed by 20260820150000, because
-- a TS-only change would have dead-lettered every paid activation). Writing the
-- label without the limits would make the row claim a catalog whose numbers it
-- does not carry -- the precise substitution 20260819040000 warns against. So
-- this writes the whole canonical snapshot, exactly what the projector itself
-- would compute, and refuses if the row is not the shape it expects.

begin;

-- ---------------------------------------------------------------------------
-- 1. Move every CURRENTNESS row to the current catalog, limits and all.
--
--    Sourced from the projector's own v_expected_feature_limits table so the
--    two cannot disagree; if they ever did, the projector refuses the whole
--    projection with 'does not match the canonical catalog' and the workspace
--    silently stops updating.
-- ---------------------------------------------------------------------------
do $$
declare
  v_moved integer;
  v_remaining integer;
begin
  with canonical as (
    select
      e.account_id,
      case e.plan_code
        when 'solo' then pg_catalog.jsonb_build_object(
          'office_users', 2, 'crew_users', 2, 'custom_domain_connections', 1,
          'dedicated_business_numbers', 0, 'storage_gb', 10, 'quickbooks_connections', 1,
          'forwarding_minutes', 100, 'voice_concurrent_calls', 1,
          'voice_history_days', 30, 'voice_included_minutes', 0
        )
        when 'growth' then pg_catalog.jsonb_build_object(
          'office_users', 5, 'crew_users', 10, 'custom_domain_connections', 1,
          'dedicated_business_numbers', 0, 'storage_gb', 100, 'quickbooks_connections', 1,
          'forwarding_minutes', 100, 'voice_concurrent_calls', 1,
          'voice_history_days', 30, 'voice_included_minutes', 0
        )
        when 'scale' then pg_catalog.jsonb_build_object(
          'office_users', 15, 'crew_users', 50, 'custom_domain_connections', 1,
          'dedicated_business_numbers', 0, 'storage_gb', 250, 'quickbooks_connections', 1,
          'forwarding_minutes', 200, 'voice_concurrent_calls', 3,
          'voice_history_days', 90, 'voice_included_minutes', 100
        )
      end as limits,
      case e.plan_code
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
      end as flags,
      case e.plan_code
        when 'solo' then 50 when 'growth' then 25 when 'scale' then 10
      end as fee_bps
      from public.workspace_entitlements e
     where e.catalog_version <> '2026-08-18-preview'
       and e.plan_code in ('solo', 'growth', 'scale')
  )
  update public.workspace_entitlements e
     set catalog_version  = '2026-08-18-preview',
         feature_limits   = canonical.limits,
         feature_flags    = canonical.flags,
         platform_fee_bps = canonical.fee_bps,
         updated_at       = pg_catalog.now()
    from canonical
   where canonical.account_id = e.account_id;
  get diagnostics v_moved = row_count;

  -- Flex rows are seeded at their own version by initialize_workspace_pricing
  -- and are not part of the paid catalog. If a paid row is still behind after
  -- this, the CASE above does not cover its plan_code and the outage stands --
  -- refuse rather than report success.
  select pg_catalog.count(*) into v_remaining
    from public.workspace_entitlements
   where catalog_version <> '2026-08-18-preview'
     and plan_code in ('solo', 'growth', 'scale');
  if v_remaining <> 0 then
    raise exception 'paid entitlement rows still behind the current catalog: %', v_remaining;
  end if;

  raise notice 'entitlement rows moved to the current catalog: %', v_moved;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Stop the projector writing a stale version onto a currentness column.
--
--    Today this is EXACTLY EQUIVALENT: the gate at 'v_catalog_version <>
--    ''2026-08-18-preview''' means v_catalog_version can only ever be the
--    current version by the time this UPDATE runs, so the literal and the
--    variable are the same string. It is not a no-op change in intent, though.
--
--    The renewal of a subscription sold under an older catalog cannot project
--    at all right now, and fixing that means widening that gate to accept a set
--    of supported EVIDENCE versions. The moment somebody does, this UPDATE
--    would start stamping the agreement's version onto a CURRENTNESS column and
--    silently re-create the outage this migration just cleared -- while the
--    limits written two lines below still come from today's catalog.
--
--    So the literal goes in FIRST, while it changes nothing, rather than being
--    remembered later while it changes everything.
--
--    NOTE the anchor. 'catalog_version = v_catalog_version,' appears twice in
--    this body: once on billing_subscriptions (line ~435), which is EVIDENCE
--    and must keep the agreement's version, and once here. The anchor includes
--    the surrounding SET list so it cannot match the wrong one.
-- ---------------------------------------------------------------------------
do $$
declare
  v_def text;
  v_before text;
  v_after text;
  v_hits integer;
begin
  select pg_catalog.replace(pg_catalog.pg_get_functiondef(p.oid), E'\r\n', E'\n')
    into v_def
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.prokind = 'f'
     and p.proname = 'project_stripe_billing_subscription_event_v1_unchecked';
  if v_def is null then
    raise exception 'subscription projector not found; refusing to patch blind';
  end if;

  v_before := E'    update public.workspace_entitlements e\n'
    || E'       set plan_code = v_plan_code,\n'
    || E'           billing_interval = v_billing_interval,\n'
    || E'           billing_status = v_entitlement_billing_status,\n'
    || E'           entitlement_state = v_entitlement_state,\n'
    || E'           catalog_version = v_catalog_version,\n';
  v_after := E'    update public.workspace_entitlements e\n'
    || E'       set plan_code = v_plan_code,\n'
    || E'           billing_interval = v_billing_interval,\n'
    || E'           billing_status = v_entitlement_billing_status,\n'
    || E'           entitlement_state = v_entitlement_state,\n'
    || E'           catalog_version = ''2026-08-18-preview'',\n';

  -- Already applied. Safe to re-run.
  if pg_catalog.strpos(v_def, v_after) > 0 then
    return;
  end if;

  -- EXACTLY ONE match. Nothing means the body has drifted; two means the
  -- billing_subscriptions write got caught as well, which would rewrite
  -- evidence.
  v_hits := (pg_catalog.length(v_def) - pg_catalog.length(pg_catalog.replace(v_def, v_before, '')))
            / pg_catalog.length(v_before);
  if v_hits <> 1 then
    raise exception 'entitlement catalog_version anchor matched % times, expected exactly 1', v_hits;
  end if;

  execute pg_catalog.replace(v_def, v_before, v_after);
end $$;

-- ---------------------------------------------------------------------------
-- 3. Post-conditions. Prove the outage is cleared, the patch landed, and the
--    EVIDENCE writes were not touched.
--
--    NOTE: every pg_get_functiondef call is filtered on prokind = 'f'.
--    pg_get_functiondef raises 42809 on an aggregate ('"array_agg" is an
--    aggregate function'), and an unfiltered scan of pg_proc in this database
--    hits one and rolls the whole migration back.
-- ---------------------------------------------------------------------------
do $$
declare
  v_proj text;
  v_bad integer;
begin
  select pg_catalog.count(*) into v_bad
    from public.workspace_entitlements
   where catalog_version <> '2026-08-18-preview'
     and plan_code in ('solo', 'growth', 'scale');
  if v_bad <> 0 then
    raise exception 'a paid entitlement row is still behind the current catalog';
  end if;

  -- The three guards that caused the outage must now pass for every paid row.
  if exists (
    select 1 from public.workspace_entitlements
     where plan_code in ('solo', 'growth', 'scale')
       and (
         feature_limits -> 'office_users' is null
         or feature_limits -> 'dedicated_business_numbers' is null
         or platform_fee_bps is null
       )
  ) then
    raise exception 'a paid entitlement row is missing canonical limits after the move';
  end if;

  -- Solo specifically: the two keys that were stale.
  if exists (
    select 1 from public.workspace_entitlements
     where plan_code = 'solo'
       and (
         feature_limits ->> 'office_users' <> '2'
         or feature_limits ->> 'dedicated_business_numbers' <> '0'
       )
  ) then
    raise exception 'Solo entitlement did not take the corrected allowances';
  end if;

  select pg_catalog.replace(pg_catalog.pg_get_functiondef(p.oid), E'\r\n', E'\n')
    into v_proj
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.prokind = 'f'
     and p.proname = 'project_stripe_billing_subscription_event_v1_unchecked';

  if pg_catalog.strpos(v_proj, E'           catalog_version = ''2026-08-18-preview'',\n') = 0 then
    raise exception 'projector did not take the entitlement currentness patch';
  end if;

  -- EVIDENCE must be untouched: billing_subscriptions still records the
  -- agreement's own version.
  --
  -- Counted, not matched on indentation. The first draft of this block pinned
  -- the literal line with fourteen leading spaces; the live body has thirteen,
  -- so the assertion raised and would have rolled back the whole migration --
  -- a postcondition that fails on a correct patch is worse than none. The
  -- invariant is really about arity: there were TWO writes of
  -- 'catalog_version = v_catalog_version,' before this patch, and exactly one
  -- must remain.
  if (pg_catalog.length(v_proj)
      - pg_catalog.length(pg_catalog.replace(v_proj, 'catalog_version = v_catalog_version,', '')))
     / pg_catalog.length('catalog_version = v_catalog_version,') <> 1 then
    raise exception 'expected exactly one remaining agreement-version write (billing_subscriptions)';
  end if;
  if pg_catalog.strpos(v_proj, 'update public.billing_subscriptions') = 0 then
    raise exception 'the billing_subscriptions update disappeared entirely';
  end if;
  if pg_catalog.strpos(v_proj, 'v_operation.catalog_version is distinct from v_catalog_version') = 0 then
    raise exception 'projector no longer checks the operation catalog version';
  end if;
  -- And the canonical-catalog refusal must still be there, or the limits this
  -- migration just wrote could drift from the projector's own table unnoticed.
  if pg_catalog.strpos(v_proj, 'Stripe Billing projection does not match the canonical catalog') = 0 then
    raise exception 'projector no longer refuses a projection that disagrees with the canonical catalog';
  end if;
end $$;

commit;
