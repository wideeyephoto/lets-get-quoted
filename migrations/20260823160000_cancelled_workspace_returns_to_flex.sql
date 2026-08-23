-- A cancelled workspace returns to Flex, so it can come back.
--
-- WHAT WAS WRONG. The projector wrote `plan_code = v_plan_code` on EVERY event
-- including cancellation. Only `entitlement_state` moved, to 'restricted'. So a
-- cancelled Solo workspace kept `plan_code = 'solo'` for ever, and every route
-- back in is closed to it:
--
--   * checkout requires plan_code='flex' AND billing_interval='none' AND
--     billing_status='free' AND entitlement_state='active'
--     (base-plan-subscription-entrypoint.ts) -> not_eligible, with a message
--     saying "Existing paid plans need the plan-change flow";
--   * the plan-change flow requires status in (trialing, active, past_due)
--     (plan-change.ts CHANGEABLE_STATUSES) -> the panel does not render;
--   * resume excludes 'canceled' (subscription-cancellation.ts).
--
-- Settings said "This workspace is currently restricted. Contact support if that
-- does not look right." No Buy button, no plan panel, no resume. Winning that
-- customer back needed a manual database edit -- for the single most likely
-- thing a first customer does: try it for a month, cancel, then want back in.
-- Downgrade-to-Flex routes through cancellation too, so it landed in the same
-- hole.
--
-- WHERE THE REVERT GOES, and why it is not a conditional on the UPDATE.
--
-- The obvious fix is a CASE on each of the seven columns. The cleaner one is to
-- move the variables, but ONLY at a point where nothing else still needs the
-- real plan the subscription carried. Two things do:
--
--   1. the three billing_subscriptions writes above -- that row must keep saying
--      it was a solo subscription that got cancelled;
--   2. the entitlement plan-binding check -- reverting before it would compare
--      flex against flex and let a genuinely conflicting paid plan through.
--
-- Both are finished by the time `v_should_grant` is computed, and the UPDATE is
-- the next statement. So the revert sits exactly between them.
--
-- ONLY 'canceled'. `unpaid`, `paused` and `past_due` are recoverable states
-- where the workspace should keep its plan and keep its restriction; dropping
-- them to Flex would hand a non-paying workspace a clean free plan and lose the
-- fact that money is owed.
--
-- The Flex shape is copied from initialize_workspace_pricing, which is what a
-- brand new workspace gets. Everything downstream already treats that as the
-- correct free state.

begin;

do $patch$
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
     and p.proname = 'project_stripe_billing_subscription_event_v1_unchecked';
  if v_def is null then
    raise exception 'subscription projector not found; refusing to patch blind';
  end if;

  -- Already applied. Safe to re-run.
  if pg_catalog.strpos(v_def, 'RETURNS THE WORKSPACE TO FLEX') > 0 then
    return;
  end if;

  v_before := E'    update public.workspace_entitlements e\n       set plan_code = v_plan_code,';

  v_after :=
    E'    -- A CANCELLED SUBSCRIPTION RETURNS THE WORKSPACE TO FLEX, so it can\n'
    || E'    -- resubscribe. Without this, plan_code stayed on the paid plan for ever\n'
    || E'    -- and every self-serve route back required flex/none/free/active.\n'
    || E'    --\n'
    || E'    -- Placed here deliberately: after the billing_subscriptions writes, which\n'
    || E'    -- must record the plan the subscription actually carried, and after the\n'
    || E'    -- entitlement plan-binding check, which would otherwise compare flex\n'
    || E'    -- against flex and stop catching a genuine conflict.\n'
    || E'    --\n'
    || E'    -- Only ''canceled''. unpaid, paused and past_due are recoverable and keep\n'
    || E'    -- their plan and their restriction.\n'
    || E'    if v_entitlement_billing_status = ''canceled'' then\n'
    || E'      v_plan_code := ''flex'';\n'
    || E'      v_billing_interval := ''none'';\n'
    || E'      v_entitlement_billing_status := ''free'';\n'
    || E'      v_entitlement_state := ''active'';\n'
    || E'      v_platform_fee_bps := 125;\n'
    || E'      v_expected_feature_limits := ''{"office_users":1,"crew_users":2,"custom_domain_connections":1,"dedicated_business_numbers":0,"storage_gb":5,"quickbooks_connections":1,"forwarding_minutes":0,"voice_concurrent_calls":1,"voice_history_days":30,"voice_included_minutes":0}''::jsonb;\n'
    || E'      v_expected_feature_flags := ''{"quickbooks":true,"shared_lgq_texting_number":true,"voice_included":false,"voice_advanced_routing":false}''::jsonb;\n'
    || E'    end if;\n\n'
    || v_before;

  v_hits := (pg_catalog.length(v_def) - pg_catalog.length(pg_catalog.replace(v_def, v_before, '')))
            / pg_catalog.length(v_before);
  if v_hits <> 1 then
    raise exception 'entitlement update anchor matched % times, expected exactly 1', v_hits;
  end if;

  execute pg_catalog.replace(v_def, v_before, v_after);
end $patch$;

-- ---------------------------------------------------------------------------
-- Post-conditions.
-- ---------------------------------------------------------------------------
do $check$
declare
  v_def text;
begin
  select pg_catalog.pg_get_functiondef(p.oid) into v_def
    from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'project_stripe_billing_subscription_event_v1_unchecked';

  if pg_catalog.strpos(v_def, 'RETURNS THE WORKSPACE TO FLEX') = 0 then
    raise exception 'projector did not take the cancellation revert';
  end if;

  -- The revert must be conditional on cancellation ONLY. If this string ever
  -- disappears the revert has become unconditional and every event drops the
  -- workspace to Flex, including the one that activated it.
  if pg_catalog.strpos(v_def, 'if v_entitlement_billing_status = ''canceled'' then') = 0 then
    raise exception 'the Flex revert is no longer gated on canceled';
  end if;

  -- And it must still sit AFTER the plan-binding check, or that check compares
  -- flex against flex.
  if pg_catalog.strpos(v_def, 'already bound to another paid plan')
     > pg_catalog.strpos(v_def, 'RETURNS THE WORKSPACE TO FLEX') then
    raise exception 'the Flex revert now runs before the plan-binding check';
  end if;

  -- The plan-change patch from 20260823120000 must survive this edit.
  if pg_catalog.strpos(v_def, 'base_plan_plan_change') = 0 then
    raise exception 'this patch dropped the plan-change relaxation';
  end if;
end $check$;

commit;
