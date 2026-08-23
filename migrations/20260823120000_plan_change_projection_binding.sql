-- Let a self-serve plan change actually project.
--
-- WHAT IS BROKEN. ChangePlanPanel is live and ungated. It calls
-- stripe.subscriptions.update with proration_behavior 'always_invoice', so the
-- customer's card is charged the difference immediately -- and then EVERY event
-- for that subscription fails to project, forever. Three separate refusals sit
-- in the way, and clearing fewer than all three fixes nothing:
--
--   1. The binding requires an operation row whose stripe_price_id equals the
--      event's price. A plan change wrote no operation row at all, so the only
--      candidate was the ORIGINAL checkout, still holding the old price.
--   2. Even given a correct operation row, the binding then refuses because
--      billing_subscriptions.provider_price_id still holds the OLD price while
--      the event carries the new one -> 23505 'subscription identity is already
--      bound differently'. plan-change.ts deliberately does not write that row
--      ("the projector owns it") -- and the projector refuses before it can.
--      That is a deadlock, not an ordering problem.
--   3. The projector then refuses again: `v_entitlement.plan_code not in
--      ('flex', v_plan_code)` -> 22000. An upgrade from solo to growth is
--      exactly a paid-to-different-paid transition.
--
-- The customer keeps the old plan's limits and fee while paying the new price,
-- and their billing record freezes at the pre-change state permanently. Nothing
-- self-heals, because the only thing that could repair the row is the projector
-- that is refusing.
--
-- WHAT THIS CHANGES, and what it deliberately does not.
--
-- Refusals 2 and 3 are relaxed ONLY when the operation driving the event is a
-- plan-change operation belonging to that same workspace. Every other clause is
-- untouched: a subscription still cannot move between workspaces, cannot change
-- Stripe customer, and an unknown price with no operation row behind it is still
-- refused by check 1, which is the guard actually doing the anti-forgery work.
--
-- The new purpose is what carries the permission, so a plan change cannot be
-- mistaken for a first checkout and a first checkout gains no new latitude.
--
-- Both function edits are SOURCE PATCHES against the installed body, because
-- after a chain of earlier patches no file in this repo states the live text.
-- Line endings are normalised before matching: production has held both CRLF and
-- LF function bodies, and comparing them raw matches nothing.

begin;

-- ---------------------------------------------------------------------------
-- 1. The operations table admits a plan-change operation.
--
--    `purpose` was pinned to exactly 'base_plan_subscription', and the
--    idempotency key to a subscription_checkout.create shape. A plan change is
--    neither, and forcing one into those shapes would have meant writing a key
--    into the ledger that no Stripe call ever used.
-- ---------------------------------------------------------------------------
alter table public.billing_subscription_checkout_operations
  drop constraint if exists billing_subscription_checkout_operations_purpose_check;
alter table public.billing_subscription_checkout_operations
  add constraint billing_subscription_checkout_operations_purpose_check
  check (purpose in ('base_plan_subscription', 'base_plan_plan_change'));

alter table public.billing_subscription_checkout_operations
  drop constraint if exists billing_subscription_checkout_oper_stripe_idempotency_key_check;
alter table public.billing_subscription_checkout_operations
  add constraint billing_subscription_checkout_oper_stripe_idempotency_key_check
  check (
    stripe_idempotency_key ~
      '^lgq:billing:v1:(subscription_checkout[.]create|subscription[.]plan_change):[0-9a-f]{64}$'
    and length(stripe_idempotency_key) <= 255
  );

-- ---------------------------------------------------------------------------
-- 2. The binding permits a price transition under a plan-change operation.
--
--    NOTE THE FUNCTION NAME. `..._v1_unchecked` is 67 characters and PostgreSQL
--    truncates identifiers at 63, so the stored proname is `..._v1_unche`.
--    Worse, `proname` is of type `name`, so `proname = '<67-char text>'`
--    silently truncates the literal and appears to match -- which is how the
--    long name reads as correct everywhere it is used. Patch the real one.
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
     and p.proname = 'resolve_stripe_billing_subscription_projection_binding_v1_unche';
  if v_def is null then
    raise exception 'binding function not found; refusing to patch blind';
  end if;

  -- Already applied. Safe to re-run.
  if pg_catalog.strpos(v_def, 'base_plan_plan_change') > 0 then
    return;
  end if;

  v_before := E'    or v_subscription.provider_price_id is distinct from p_provider_price_id\n  ) then';
  v_after := E'    or (\n'
    || E'      v_subscription.provider_price_id is distinct from p_provider_price_id\n'
    || E'      and v_operation.purpose is distinct from ''base_plan_plan_change''\n'
    || E'    )\n  ) then';

  -- EXACTLY ONE match. A patch that matches nothing has drifted; one that
  -- matches twice has rewritten a neighbour. Both are silent without this.
  v_hits := (pg_catalog.length(v_def) - pg_catalog.length(pg_catalog.replace(v_def, v_before, '')))
            / pg_catalog.length(v_before);
  if v_hits <> 1 then
    raise exception 'binding price clause matched % times, expected exactly 1', v_hits;
  end if;

  execute pg_catalog.replace(v_def, v_before, v_after);
end $$;

-- ---------------------------------------------------------------------------
-- 3. The projector permits a paid-to-paid entitlement transition, under the
--    same condition and no other.
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
     and p.proname = 'project_stripe_billing_subscription_event_v1_unchecked';
  if v_def is null then
    raise exception 'subscription projector not found; refusing to patch blind';
  end if;

  if pg_catalog.strpos(v_def, 'base_plan_plan_change') > 0 then
    return;
  end if;

  v_before := E'    if v_entitlement.plan_code not in (''flex'', v_plan_code) then\n';
  v_after := E'    if v_entitlement.plan_code not in (''flex'', v_plan_code)\n'
    || E'       and not exists (\n'
    || E'         select 1\n'
    || E'           from public.billing_subscription_checkout_operations o\n'
    || E'          where o.account_id = v_account_id\n'
    || E'            and o.operation_id = v_operation_id\n'
    || E'            and o.purpose = ''base_plan_plan_change''\n'
    || E'       ) then\n';

  v_hits := (pg_catalog.length(v_def) - pg_catalog.length(pg_catalog.replace(v_def, v_before, '')))
            / pg_catalog.length(v_before);
  if v_hits <> 1 then
    raise exception 'projector entitlement clause matched % times, expected exactly 1', v_hits;
  end if;

  execute pg_catalog.replace(v_def, v_before, v_after);
end $$;

-- ---------------------------------------------------------------------------
-- 4. Post-conditions. Prove the live bodies changed, and that the clauses that
--    must NOT have moved are still there.
-- ---------------------------------------------------------------------------
do $$
declare
  v_binding text;
  v_projector text;
begin
  select pg_catalog.pg_get_functiondef(p.oid) into v_binding
    from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'resolve_stripe_billing_subscription_projection_binding_v1_unche';
  select pg_catalog.pg_get_functiondef(p.oid) into v_projector
    from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'project_stripe_billing_subscription_event_v1_unchecked';

  if pg_catalog.strpos(v_binding, 'base_plan_plan_change') = 0 then
    raise exception 'binding function did not take the plan-change patch';
  end if;
  if pg_catalog.strpos(v_projector, 'base_plan_plan_change') = 0 then
    raise exception 'projector did not take the plan-change patch';
  end if;

  -- The anti-forgery clause. If this ever disappears, an event could bind to an
  -- operation for a different price entirely and the patch above would be the
  -- only thing between a forged price and a workspace's entitlements.
  if pg_catalog.strpos(v_binding, 'v_operation.stripe_price_id is distinct from p_provider_price_id') = 0 then
    raise exception 'binding no longer pins the operation price';
  end if;
  -- Cross-workspace and cross-customer must still be absolute.
  if pg_catalog.strpos(v_binding, 'v_subscription.account_id is distinct from p_account_id') = 0
     or pg_catalog.strpos(v_binding, 'v_subscription.provider_customer_id is distinct from p_provider_customer_id') = 0 then
    raise exception 'binding no longer pins workspace or customer identity';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
     where conrelid = 'public.billing_subscription_checkout_operations'::regclass
       and conname = 'billing_subscription_checkout_operations_purpose_check'
       and pg_catalog.pg_get_constraintdef(oid) like '%base_plan_plan_change%'
  ) then
    raise exception 'purpose check does not admit a plan-change operation';
  end if;
end $$;

commit;
