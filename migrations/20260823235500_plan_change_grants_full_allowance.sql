-- An upgrade hands over the new plan's FULL monthly allowance, immediately.
--
-- WHAT WAS ACTUALLY HAPPENING. Not "the delta was not prorated" -- the
-- contractor got NOTHING. `v_should_grant` ends with:
--
--     and (
--       v_entitlement.plan_code = 'flex'
--       or v_entitlement.next_allowance_reset_at is null
--       or v_allowance_start >= v_entitlement.next_allowance_reset_at
--     )
--
-- A mid-cycle upgrade keeps the same billing period, so `v_allowance_start` is
-- the period start the workspace already had and `next_allowance_reset_at` is
-- this period's end. The comparison is false, all three disjuncts are false, and
-- no lots are granted. So a Solo contractor who upgraded to Growth on day 3 paid
-- the prorated difference, moved on to Growth's feature limits and Growth's
-- platform fee, and then sent texts against Solo's 500 segments until the
-- renewal. The one thing they upgraded FOR was the thing they did not get.
--
-- AND IT COULD NOT SIMPLY BE SWITCHED ON. The grant's idempotency key is
--
--     plan-period:<catalog>:<subscription>:<epoch of allowance_start>:<resource>
--
-- which is identical for both plans inside one period. Flipping `v_should_grant`
-- alone would hit `on conflict do nothing`, and then the verification read below
-- it -- which re-reads the lot and compares `granted_units` -- would find Solo's
-- 500 where the loop now expects Growth's 1500 and raise 22000. Every event for
-- that subscription would dead-letter. The key has to carry the plan, or turning
-- the grant on breaks projection outright. That trap is the reason this is one
-- migration and not a one-line change.
--
-- THE POLICY, chosen deliberately: FULL allowance, added on top of what is left.
-- Not the prorated delta `proratedPlanUpgradeCreditDeltas` computes, and the old
-- plan's remaining lots are NOT clawed back. An upgrade should make the month
-- better immediately and be explainable in one sentence -- "you get Growth's
-- full monthly allowance now, and you keep what you had left" -- which is worth
-- more than the arithmetic of a part-month. The renewal is unaffected: the
-- entitlement's `next_allowance_reset_at` is still this period's end.
--
-- SELF-LIMITING BY CONSTRUCTION, which matters because a second event for the
-- same plan change must not grant twice. The new disjunct compares the event's
-- plan against `v_entitlement.plan_code`, read BEFORE the entitlement update. On
-- the first event they differ and the grant runs; on every later event the
-- entitlement already holds the new plan, so they match and it does not. The
-- plan-aware idempotency key is the second belt.
--
-- SECOND CHANGE: a plan change Stripe never invoiced no longer strands the
-- contractor. 20260823230000 says a NULL `proration_invoice_id` means "nothing to
-- collect, never collected", and 20260823235000 implemented the cautious half --
-- it refused to activate at all, so a zero-value change left the workspace on the
-- old plan until renewal for something it owed nothing for. It now activates,
-- but only while no invoice on that subscription is open or uncollectible, so
-- "nothing was owed" can never be confused with "something is owed and unpaid".
-- The other half of making that safe is in TypeScript: the plan-change call now
-- expands `latest_invoice`, so a NULL id means Stripe created no invoice rather
-- than that the response did not include one.
--
-- Source patches against the installed body; no file here states the live text.
-- Line endings normalised before matching.

begin;

-- ---------------------------------------------------------------------------
-- 0. Refuse to run out of order.
-- ---------------------------------------------------------------------------
do $$
declare
  v_def text;
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
  if pg_catalog.strpos(v_def, 'v_operation_source') = 0 then
    raise exception '20260823235000 has not been applied; the projector cannot tell a plan change from a checkout';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. The three edits, applied to one body and executed once.
-- ---------------------------------------------------------------------------
do $$
declare
  v_def text;
  v_before text;
  v_after text;
  v_hits integer;
  v_note text := 'full-allowance upgrade patch';
begin
  select pg_catalog.replace(pg_catalog.pg_get_functiondef(p.oid), E'\r\n', E'\n')
    into v_def
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.prokind = 'f'
     and p.proname = 'project_stripe_billing_subscription_event_v1_unchecked';

  -- Already applied. Safe to re-run.
  if pg_catalog.strpos(v_def, 'upgrade grants the new plan') > 0 then
    return;
  end if;

  -- 1a. A mid-cycle upgrade earns a grant even though the period did not move.
  v_before := E'      and (\n'
    || E'        v_entitlement.plan_code = ''flex''\n'
    || E'        or v_entitlement.next_allowance_reset_at is null\n'
    || E'        or v_allowance_start >= v_entitlement.next_allowance_reset_at\n'
    || E'      );\n';
  v_after := E'      and (\n'
    || E'        v_entitlement.plan_code = ''flex''\n'
    || E'        or v_entitlement.next_allowance_reset_at is null\n'
    || E'        or v_allowance_start >= v_entitlement.next_allowance_reset_at\n'
    || E'        -- A mid-cycle upgrade grants the new plan''s FULL monthly\n'
    || E'        -- allowance on top of whatever is left of the old one. The\n'
    || E'        -- period has not moved, so the comparison above is false and\n'
    || E'        -- without this the contractor pays for the upgrade and keeps\n'
    || E'        -- the smaller plan''s credits until renewal.\n'
    || E'        --\n'
    || E'        -- v_entitlement is read BEFORE the update below, so on any\n'
    || E'        -- later event for this same change the two plans already match\n'
    || E'        -- and this cannot fire twice.\n'
    || E'        or (\n'
    || E'          v_operation_source = ''plan_change''\n'
    || E'          and v_plan_code is distinct from v_entitlement.plan_code\n'
    || E'        )\n'
    || E'      );\n';
  v_hits := (pg_catalog.length(v_def) - pg_catalog.length(pg_catalog.replace(v_def, v_before, '')))
            / pg_catalog.length(v_before);
  if v_hits <> 1 then
    raise exception '% 1a matched % times, expected exactly 1', v_note, v_hits;
  end if;
  v_def := pg_catalog.replace(v_def, v_before, v_after);

  -- 1b/1c. The key carries the plan, so both plans' lots coexist in one period.
  --        BOTH sites move together: the insert and the verification read that
  --        follows it. Changing one alone makes the read miss its own row and
  --        raise 'monthly allowance idempotency binding is inconsistent'.
  v_before := E'          ''plan-period:'' || v_catalog_version || '':'' || v_subscription_id || '':''\n'
    || E'            || pg_catalog.date_part(''epoch'', v_allowance_start)::bigint::text || '':''\n'
    || E'            || v_resource.resource_code,\n';
  v_after := E'          ''plan-period:'' || v_catalog_version || '':'' || v_subscription_id || '':''\n'
    || E'            || pg_catalog.date_part(''epoch'', v_allowance_start)::bigint::text || '':''\n'
    || E'            || v_plan_code || '':''\n'
    || E'            || v_resource.resource_code,\n';
  v_hits := (pg_catalog.length(v_def) - pg_catalog.length(pg_catalog.replace(v_def, v_before, '')))
            / pg_catalog.length(v_before);
  if v_hits <> 1 then
    raise exception '% 1b matched % times, expected exactly 1', v_note, v_hits;
  end if;
  v_def := pg_catalog.replace(v_def, v_before, v_after);

  v_before := E'             ''plan-period:'' || v_catalog_version || '':'' || v_subscription_id || '':''\n'
    || E'             || pg_catalog.date_part(''epoch'', v_allowance_start)::bigint::text || '':''\n'
    || E'             || v_resource.resource_code\n';
  v_after := E'             ''plan-period:'' || v_catalog_version || '':'' || v_subscription_id || '':''\n'
    || E'             || pg_catalog.date_part(''epoch'', v_allowance_start)::bigint::text || '':''\n'
    || E'             || v_plan_code || '':''\n'
    || E'             || v_resource.resource_code\n';
  v_hits := (pg_catalog.length(v_def) - pg_catalog.length(pg_catalog.replace(v_def, v_before, '')))
            / pg_catalog.length(v_before);
  if v_hits <> 1 then
    raise exception '% 1c matched % times, expected exactly 1', v_note, v_hits;
  end if;
  v_def := pg_catalog.replace(v_def, v_before, v_after);

  -- 1d. A change Stripe never invoiced activates instead of stranding.
  v_before := E'  v_can_activate := v_subscription_status = ''active''\n'
    || E'    and case\n'
    || E'      when v_operation_source = ''plan_change'' then\n'
    || E'        v_payment_evidence = ''invoice_paid''\n'
    || E'        and v_plan_change.proration_invoice_id is not null\n'
    || E'        and v_invoice_id is not distinct from v_plan_change.proration_invoice_id\n'
    || E'      else v_payment_evidence in (''checkout_session_paid'', ''invoice_paid'')\n'
    || E'    end;\n';
  v_after := E'  v_can_activate := v_subscription_status = ''active''\n'
    || E'    and case\n'
    || E'      when v_operation_source = ''plan_change'' then\n'
    || E'        case\n'
    || E'          when v_plan_change.proration_invoice_id is not null then\n'
    || E'            v_payment_evidence = ''invoice_paid''\n'
    || E'            and v_invoice_id is not distinct from v_plan_change.proration_invoice_id\n'
    || E'          else\n'
    || E'            -- Stripe invoiced NOTHING for this change, so there is\n'
    || E'            -- nothing to collect and demanding a paid invoice would\n'
    || E'            -- strand the contractor on the old plan until renewal for\n'
    || E'            -- something they never owed. Still refused while any\n'
    || E'            -- invoice on this subscription is open or uncollectible,\n'
    || E'            -- so "nothing was owed" cannot be read as "owed, unpaid".\n'
    || E'            v_subscription.latest_invoice_status is distinct from ''open''\n'
    || E'            and v_subscription.latest_invoice_status is distinct from ''uncollectible''\n'
    || E'        end\n'
    || E'      else v_payment_evidence in (''checkout_session_paid'', ''invoice_paid'')\n'
    || E'    end;\n';
  v_hits := (pg_catalog.length(v_def) - pg_catalog.length(pg_catalog.replace(v_def, v_before, '')))
            / pg_catalog.length(v_before);
  if v_hits <> 1 then
    raise exception '% 1d matched % times, expected exactly 1', v_note, v_hits;
  end if;
  v_def := pg_catalog.replace(v_def, v_before, v_after);

  execute v_def;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Post-conditions, read from the live body.
--    prokind = 'f' is not decoration: pg_get_functiondef raises 42809 on an
--    aggregate and an unfiltered scan here rolls the whole migration back.
-- ---------------------------------------------------------------------------
do $$
declare
  v_def text;
  v_keys integer;
begin
  select pg_catalog.replace(pg_catalog.pg_get_functiondef(p.oid), E'\r\n', E'\n')
    into v_def
    from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind = 'f'
     and p.proname = 'project_stripe_billing_subscription_event_v1_unchecked';

  if pg_catalog.strpos(
       v_def,
       E'v_operation_source = ''plan_change''\n          and v_plan_code is distinct from v_entitlement.plan_code'
     ) = 0 then
    raise exception 'an upgrade still grants no allowance mid-cycle';
  end if;

  -- BOTH key sites, or the verification read misses the row the insert wrote.
  v_keys := (pg_catalog.length(v_def)
             - pg_catalog.length(pg_catalog.replace(v_def, E'|| v_plan_code || '':''', '')))
            / pg_catalog.length(E'|| v_plan_code || '':''');
  if v_keys <> 2 then
    raise exception 'the allowance idempotency key carries the plan at % of 2 sites', v_keys;
  end if;

  -- The self-limiter. Without the comparison against the PRE-update entitlement,
  -- every later event for the same change grants the allowance again.
  if pg_catalog.strpos(v_def, 'v_plan_code is distinct from v_entitlement.plan_code') = 0 then
    raise exception 'the repeat-grant limiter is gone';
  end if;

  -- A named proration invoice is still the only thing that activates a change
  -- that HAS one. Losing this would let an already-paid renewal activate an
  -- unpaid upgrade.
  if pg_catalog.strpos(
       v_def,
       'v_invoice_id is not distinct from v_plan_change.proration_invoice_id'
     ) = 0 then
    raise exception 'plan-change activation is no longer bound to its proration invoice';
  end if;
  -- ...and a zero-invoice change may not activate over an unpaid one.
  if pg_catalog.strpos(v_def, E'v_subscription.latest_invoice_status is distinct from ''open''') = 0
     or pg_catalog.strpos(v_def, E'is distinct from ''uncollectible''') = 0 then
    raise exception 'a change with no proration invoice can now activate over an open invoice';
  end if;

  -- Untouched neighbours. The grant must still require an active workspace and
  -- a live allowance window; this migration widens WHEN it fires, never what it
  -- costs to fire.
  if pg_catalog.strpos(v_def, E'v_should_grant := v_entitlement_billing_status = ''active''') = 0
     or pg_catalog.strpos(v_def, 'and v_allowance_end > pg_catalog.now()') = 0 then
    raise exception 'the grant no longer requires an active workspace and a live window';
  end if;
  if pg_catalog.strpos(v_def, 'monthly allowance idempotency binding is inconsistent') = 0 then
    raise exception 'the allowance verification read is gone';
  end if;
end $$;

commit;
