-- Make the subscription projection rail read EITHER operation ledger.
--
-- Rail stage 5, and the one that connects everything built on 2026-08-23.
--
-- THE FORK THIS RESOLVES. `project_stripe_billing_subscription_event_v1_unchecked`
-- and `resolve_stripe_billing_subscription_projection_binding_v1_unche` each do
-- their OWN operation lookup, both declared `%rowtype` against
-- `billing_subscription_checkout_operations`. A plan-change operation living in
-- `billing_subscription_plan_change_operations` is therefore never found, and
-- every event for that subscription raises. Two ways out were weighed:
--
--   A) teach both functions to read either table  <- this file
--   B) move plan-change operations into the checkout table
--
-- B was recommended on blast radius and is wrong on the facts. The checkout
-- table's `billing_subscription_checkout_state_shape_check` gives a plan change
-- no legal pre-activation state: `checkout_created` demands a non-null
-- `provider_object_id`, which `billing_subscription_checkout_provider_mode_check`
-- then demands match `^cs_(test|live)_`, and a `subscriptions.update` produces no
-- Checkout Session; `indeterminate` demands a fabricated `last_error`;
-- `activated` provisions the new plan before the proration invoice is paid. Both
-- usable states also sit inside
-- `billing_subscription_checkout_one_pending_per_account`, a partial unique on
-- (account_id) that would let one unresolved plan change lock a workspace out of
-- every further plan change AND every new checkout, with nothing sweeping it. B's
-- cost is three CHECK relaxations plus an index lockout on the only rail
-- collecting money; A's cost is two function bodies that are source-patched
-- routinely and can be dry-run and rolled back. 20260823210000 made this argument
-- before the fork was reopened; it holds.
--
-- HOW THE PROJECTOR STAYS SMALL. `v_operation` keeps its checkout `%rowtype`, but
-- it is now a CARRIER, not a table binding: a plan-change row is copied into its
-- fields and written back through a forked UPDATE. That leaves all 40 read sites
-- untouched and confines the change to the lookup, the four state-machine sites
-- and the entitlement escape. THE STATES ARE NOT SHARED -- `v_operation.state`
-- holds whichever ledger's own vocabulary, so every state comparison is forked on
-- `v_operation_source`. Do not "simplify" one back into the other: 'indeterminate'
-- means a lost Checkout response on one table and a lost subscriptions.update
-- response on the other, and 'activated' is the only token they legitimately
-- share.
--
-- WHY A PLAN CHANGE ACTIVATES ONLY ON ITS OWN PRORATION INVOICE. `always_invoice`
-- with the default `payment_behavior` of `allow_incomplete` does not throw when
-- collection fails -- it applies the change and leaves the proration invoice
-- `open`. So provider acceptance is not payment, and any paid invoice on that
-- subscription is not evidence either: an already-paid renewal would otherwise
-- activate an unpaid upgrade. Activation binds to the exact invoice id
-- 20260823230000 recorded, and to nothing else.
--
-- KNOWN GAP, deliberately left open. A plan change accepted with a NULL
-- `proration_invoice_id` ("Stripe declined to invoice a zero-value change") has
-- no invoice to bind to and therefore never activates here. 20260823230000 says
-- the projector must treat that as 'nothing to collect', never as 'collected',
-- and the two readings of that sentence differ on whether such a change may
-- provision with no paid invoice at all. The safe reading is implemented: it does
-- not provision. The event still projects, the subscription and its price are
-- still recorded, and entitlements stay where they are. Deciding the other way is
-- a product call and must not be made silently inside a source patch.
--
-- INERT ON APPLY. Nothing writes a plan-change operation row yet: the claim RPC
-- has no TypeScript caller, the panel is withheld at the render site, and
-- LGQ_BASE_PLAN_SUBSCRIPTION_PLAN_CHANGE_ENABLED is absent in every environment.
-- Every checkout-purpose path through both functions is equivalent to what it was
-- before this file, which is what section 5 asserts.
--
-- Both projector edits are SOURCE PATCHES against the installed bodies, because
-- after a chain of earlier patches no file in this repo states the live text.
-- Line endings are normalised before matching: production has held both CRLF and
-- LF function bodies, and comparing them raw matches nothing. The binding pair is
-- DROP-and-CREATE instead, because adding the `operation_purpose` OUT column
-- changes the return type and `create or replace function` refuses that.

begin;

-- ---------------------------------------------------------------------------
-- 0. Refuse to run out of order.
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.billing_subscription_plan_change_operations') is null then
    raise exception '20260823210000 has not been applied; there is no plan-change ledger to read';
  end if;
  if to_regprocedure('public.mark_stripe_billing_subscription_plan_change_accepted(uuid, uuid, text)') is null then
    raise exception '20260823230000 has not been applied; nothing can move a row to provider_accepted';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_constraint
     where conrelid = 'public.billing_subscription_checkout_operations'::regclass
       and conname = 'billing_subscription_checkout_operations_purpose_check'
       and pg_catalog.pg_get_constraintdef(oid) like '%base_plan_plan_change%'
  ) then
    raise exception '20260823120000 has not been applied; the operations purpose check does not admit a plan change';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. The binding resolves an operation from either ledger, and says which.
--
--    `operation_purpose` is new, and it is why this is a drop rather than a
--    replace. The TypeScript caller needs it: when a binding carries no Checkout
--    Session, `loadExactSession` falls back to listing that subscription's
--    Sessions and demanding exactly one contract match. For a plan change the
--    fallback finds the ORIGINAL checkout, whose price is the OLD one, matches
--    nothing, and fails `checkout_session_ambiguous`. The caller has to know not
--    to look. Inferring it from `checkout_expires_at is null` would work today
--    and is exactly the kind of implicit coupling that rots.
-- ---------------------------------------------------------------------------
drop function if exists public.resolve_stripe_billing_subscription_projection_binding(
  uuid, uuid, uuid, text, text, text, text);
drop function if exists public.resolve_stripe_billing_subscription_projection_binding_v1_unche(
  uuid, uuid, uuid, text, text, text, text);

create function public.resolve_stripe_billing_subscription_projection_binding_v1_unche(
  p_billing_event_id uuid,
  p_claim_token uuid,
  p_account_id uuid,
  p_operation_id text,
  p_provider_customer_id text,
  p_provider_subscription_id text,
  p_provider_price_id text
)
returns table(
  operation_pk uuid, operation_state text, workspace_id uuid, operation_id text,
  checkout_session_id text, plan_code text, billing_interval text,
  catalog_version text, livemode boolean, price_id text, product_id text,
  currency text, unit_amount_cents bigint, terms_version text,
  recurring_consent_version text, recurring_consent_text_sha256 text,
  recurring_consent_acceptance_id uuid, checkout_expires_at timestamptz,
  operation_purpose text
)
language plpgsql
security definer
set search_path to 'pg_catalog', 'pg_temp'
set "TimeZone" to 'UTC'
as $fn$
declare
  v_event public.billing_events%rowtype;
  v_operation public.billing_subscription_checkout_operations%rowtype;
  v_plan_change public.billing_subscription_plan_change_operations%rowtype;
  v_source text;
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

  -- Both ledgers, then exactly one. An operation id present in both is not a tie
  -- to break -- it is a forgery surface, because the two tables enforce different
  -- invariants on the same id and picking either would let the caller choose
  -- which set applies.
  select o.*
    into v_operation
    from public.billing_subscription_checkout_operations o
   where o.account_id = p_account_id
     and o.operation_id = pg_catalog.btrim(p_operation_id)
   for share;
  v_source := case when found then 'checkout' else null end;

  select c.*
    into v_plan_change
    from public.billing_subscription_plan_change_operations c
   where c.account_id = p_account_id
     and c.operation_id = pg_catalog.btrim(p_operation_id)
   for share;
  if found then
    if v_source is not null then
      raise exception 'Stripe Billing operation id resolves in two ledgers'
        using errcode = '22000';
    end if;
    v_source := 'plan_change';
    -- Carry the plan-change row through the checkout rowtype. Only the fields
    -- read below and returned are populated; the Checkout-only ones stay null on
    -- purpose, and the accept-list below is forked so a null can never read as a
    -- passing Checkout operation.
    v_operation.id := v_plan_change.id;
    v_operation.account_id := v_plan_change.account_id;
    v_operation.operation_id := v_plan_change.operation_id;
    v_operation.purpose := v_plan_change.purpose;
    v_operation.state := v_plan_change.state;
    v_operation.livemode := v_plan_change.livemode;
    v_operation.plan_code := v_plan_change.plan_code;
    v_operation.billing_interval := v_plan_change.billing_interval;
    v_operation.catalog_version := v_plan_change.catalog_version;
    v_operation.stripe_price_id := v_plan_change.stripe_price_id;
    v_operation.stripe_product_id := v_plan_change.stripe_product_id;
    v_operation.provider_customer_id := v_plan_change.provider_customer_id;
    v_operation.currency := v_plan_change.currency;
    v_operation.unit_amount_cents := v_plan_change.unit_amount_cents;
    v_operation.terms_version := v_plan_change.terms_version;
    v_operation.recurring_consent_version := v_plan_change.recurring_consent_version;
    v_operation.recurring_consent_text_sha256 := v_plan_change.recurring_consent_text_sha256;
    v_operation.recurring_consent_acceptance_id := v_plan_change.recurring_consent_acceptance_id;
    v_operation.provider_object_id := null;
    v_operation.checkout_expires_at := null;
  end if;

  if v_source is null
     or (
       v_source = 'checkout'
       and (
         v_operation.state not in (
           'checkout_created', 'indeterminate', 'activated', 'expired', 'canceled'
         )
         or v_operation.checkout_expires_at is null
       )
     )
     or (
       v_source = 'plan_change'
       and (
         v_operation.state not in (
           'submitted', 'provider_accepted', 'activated', 'indeterminate', 'abandoned'
         )
         -- A plan-change ledger row names the subscription it was raised
         -- against. The checkout rail has no equivalent to check, so this is an
         -- extra binding, never a relaxed one.
         or v_plan_change.provider_subscription_id is distinct from p_provider_subscription_id
       )
     )
     or v_operation.livemode is distinct from v_event.livemode
     or v_operation.stripe_price_id is distinct from p_provider_price_id
     or (
       v_operation.provider_customer_id is not null
       and v_operation.provider_customer_id is distinct from p_provider_customer_id
     ) then
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
    or (
      v_subscription.provider_price_id is distinct from p_provider_price_id
      and v_operation.purpose is distinct from 'base_plan_plan_change'
    )
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
    v_operation.checkout_expires_at,
    v_operation.purpose;
end;
$fn$;

create function public.resolve_stripe_billing_subscription_projection_binding(
  p_billing_event_id uuid,
  p_claim_token uuid,
  p_account_id uuid,
  p_operation_id text,
  p_provider_customer_id text,
  p_provider_subscription_id text,
  p_provider_price_id text
)
returns table(
  operation_pk uuid, operation_state text, workspace_id uuid, operation_id text,
  checkout_session_id text, plan_code text, billing_interval text,
  catalog_version text, livemode boolean, price_id text, product_id text,
  currency text, unit_amount_cents bigint, terms_version text,
  recurring_consent_version text, recurring_consent_text_sha256 text,
  recurring_consent_acceptance_id uuid, checkout_expires_at timestamptz,
  operation_purpose text
)
language plpgsql
security definer
set search_path to 'pg_catalog', 'pg_temp'
set "TimeZone" to 'UTC'
as $fn$
begin
  if p_billing_event_id is null
     or p_claim_token is null
     or p_account_id is null
     or p_operation_id is null
     or p_provider_customer_id is null
     or p_provider_subscription_id is null
     or p_provider_price_id is null then
    raise exception 'Stripe Billing projection binding input is invalid'
      using errcode = '22023';
  end if;

  return query
  select *
    from public.resolve_stripe_billing_subscription_projection_binding_v1_unche(
      p_billing_event_id,
      p_claim_token,
      p_account_id,
      p_operation_id,
      p_provider_customer_id,
      p_provider_subscription_id,
      p_provider_price_id
    );
end;
$fn$;

-- The default ACL for `public` grants anon EXECUTE on every NEW function BY
-- NAME, and after the drop above both of these are new objects again. The revoke
-- IS the security; section 5 asserts it rather than trusting that it ran.
revoke all on function public.resolve_stripe_billing_subscription_projection_binding_v1_unche(
  uuid, uuid, uuid, text, text, text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.resolve_stripe_billing_subscription_projection_binding(
  uuid, uuid, uuid, text, text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.resolve_stripe_billing_subscription_projection_binding(
  uuid, uuid, uuid, text, text, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- 2. The projector reads either ledger.
--
--    Eight anchors, each asserted to match EXACTLY once against the installed
--    body. A patch matching zero times has drifted; one matching twice has
--    rewritten a neighbour, and both are silent without the count.
-- ---------------------------------------------------------------------------
do $$
declare
  v_def text;
  v_before text;
  v_after text;
  v_hits integer;

  procedure_note text := 'projector plan-change patch';
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

  -- Already applied. Safe to re-run.
  if pg_catalog.strpos(v_def, 'v_operation_source') > 0 then
    return;
  end if;

  -- 2a. The carrier for a plan-change row, and which ledger it came from.
  v_before := E'  v_operation public.billing_subscription_checkout_operations%rowtype;\n';
  v_after := E'  v_operation public.billing_subscription_checkout_operations%rowtype;\n'
    || E'  v_plan_change public.billing_subscription_plan_change_operations%rowtype;\n'
    || E'  v_operation_source text;\n';
  v_hits := (pg_catalog.length(v_def) - pg_catalog.length(pg_catalog.replace(v_def, v_before, '')))
            / pg_catalog.length(v_before);
  if v_hits <> 1 then
    raise exception '% 2a matched % times, expected exactly 1', procedure_note, v_hits;
  end if;
  v_def := pg_catalog.replace(v_def, v_before, v_after);

  -- 2b. A plan change has no Checkout Session, so the contract must admit a null
  --     one. The SHAPE stays mandatory whenever a value is present.
  v_before := E'     or v_account_id is null\n'
    || E'     or v_checkout_session_id is null\n'
    || E'     or v_checkout_session_id !~ ''^cs_(test|live)_[A-Za-z0-9_]+$''\n';
  v_after := E'     or v_account_id is null\n'
    || E'     or (\n'
    || E'       v_checkout_session_id is not null\n'
    || E'       and v_checkout_session_id !~ ''^cs_(test|live)_[A-Za-z0-9_]+$''\n'
    || E'     )\n';
  v_hits := (pg_catalog.length(v_def) - pg_catalog.length(pg_catalog.replace(v_def, v_before, '')))
            / pg_catalog.length(v_before);
  if v_hits <> 1 then
    raise exception '% 2b matched % times, expected exactly 1', procedure_note, v_hits;
  end if;
  v_def := pg_catalog.replace(v_def, v_before, v_after);

  -- 2c. The livemode check compared a null with !~, which yields NULL and falls
  --     out of the `if` -- it accepted a null Session by accident, not by intent.
  --     Say so.
  v_before := E'  if (v_event.livemode and v_checkout_session_id !~ ''^cs_live_'')\n'
    || E'     or (not v_event.livemode and v_checkout_session_id !~ ''^cs_test_'') then\n';
  v_after := E'  if v_checkout_session_id is not null\n'
    || E'     and (\n'
    || E'       (v_event.livemode and v_checkout_session_id !~ ''^cs_live_'')\n'
    || E'       or (not v_event.livemode and v_checkout_session_id !~ ''^cs_test_'')\n'
    || E'     ) then\n';
  v_hits := (pg_catalog.length(v_def) - pg_catalog.length(pg_catalog.replace(v_def, v_before, '')))
            / pg_catalog.length(v_before);
  if v_hits <> 1 then
    raise exception '% 2c matched % times, expected exactly 1', procedure_note, v_hits;
  end if;
  v_def := pg_catalog.replace(v_def, v_before, v_after);

  -- 2d. Evidence of a paid Checkout Session requires a Checkout Session. Keyed on
  --     the null, NOT on the purpose: a forged purpose must not be able to claim
  --     a payment that has no object behind it.
  v_before := E'  ) or (\n'
    || E'    v_payment_evidence = ''checkout_session_paid''\n'
    || E'    and v_event_type not like ''customer.subscription.%''\n';
  v_after := E'  ) or (\n'
    || E'    v_payment_evidence = ''checkout_session_paid''\n'
    || E'    and (\n'
    || E'      v_event_type not like ''customer.subscription.%''\n'
    || E'      or v_checkout_session_id is null\n'
    || E'    )\n';
  v_hits := (pg_catalog.length(v_def) - pg_catalog.length(pg_catalog.replace(v_def, v_before, '')))
            / pg_catalog.length(v_before);
  if v_hits <> 1 then
    raise exception '% 2d matched % times, expected exactly 1', procedure_note, v_hits;
  end if;
  v_def := pg_catalog.replace(v_def, v_before, v_after);

  -- 2e. The lookup itself: both ledgers, exactly one, then the immutable-contract
  --     comparison unchanged for every field the two tables share.
  v_before := E'  select o.*\n'
    || E'    into v_operation\n'
    || E'    from public.billing_subscription_checkout_operations o\n'
    || E'   where o.account_id = v_account_id\n'
    || E'     and o.operation_id = pg_catalog.btrim(v_operation_id)\n'
    || E'   for update;\n'
    || E'  if not found\n'
    || E'     or v_operation.state not in (\n'
    || E'       ''checkout_created'', ''indeterminate'', ''activated'', ''expired'', ''canceled''\n'
    || E'     )\n';
  v_after := E'  select o.*\n'
    || E'    into v_operation\n'
    || E'    from public.billing_subscription_checkout_operations o\n'
    || E'   where o.account_id = v_account_id\n'
    || E'     and o.operation_id = pg_catalog.btrim(v_operation_id)\n'
    || E'   for update;\n'
    || E'  v_operation_source := case when found then ''checkout'' else null end;\n'
    || E'\n'
    || E'  select c.*\n'
    || E'    into v_plan_change\n'
    || E'    from public.billing_subscription_plan_change_operations c\n'
    || E'   where c.account_id = v_account_id\n'
    || E'     and c.operation_id = pg_catalog.btrim(v_operation_id)\n'
    || E'   for update;\n'
    || E'  if found then\n'
    || E'    if v_operation_source is not null then\n'
    || E'      raise exception ''Stripe Billing operation id resolves in two ledgers''\n'
    || E'        using errcode = ''22000'';\n'
    || E'    end if;\n'
    || E'    v_operation_source := ''plan_change'';\n'
    || E'    v_operation.id := v_plan_change.id;\n'
    || E'    v_operation.account_id := v_plan_change.account_id;\n'
    || E'    v_operation.operation_id := v_plan_change.operation_id;\n'
    || E'    v_operation.purpose := v_plan_change.purpose;\n'
    || E'    v_operation.state := v_plan_change.state;\n'
    || E'    v_operation.livemode := v_plan_change.livemode;\n'
    || E'    v_operation.plan_code := v_plan_change.plan_code;\n'
    || E'    v_operation.billing_interval := v_plan_change.billing_interval;\n'
    || E'    v_operation.catalog_version := v_plan_change.catalog_version;\n'
    || E'    v_operation.stripe_price_id := v_plan_change.stripe_price_id;\n'
    || E'    v_operation.stripe_product_id := v_plan_change.stripe_product_id;\n'
    || E'    v_operation.provider_customer_id := v_plan_change.provider_customer_id;\n'
    || E'    v_operation.currency := v_plan_change.currency;\n'
    || E'    v_operation.unit_amount_cents := v_plan_change.unit_amount_cents;\n'
    || E'    v_operation.terms_version := v_plan_change.terms_version;\n'
    || E'    v_operation.recurring_consent_version := v_plan_change.recurring_consent_version;\n'
    || E'    v_operation.recurring_consent_text_sha256 := v_plan_change.recurring_consent_text_sha256;\n'
    || E'    v_operation.recurring_consent_acceptance_id := v_plan_change.recurring_consent_acceptance_id;\n'
    || E'    v_operation.provider_object_id := null;\n'
    || E'    v_operation.metadata := ''{}''::jsonb;\n'
    || E'  end if;\n'
    || E'\n'
    || E'  if v_operation_source is null\n'
    || E'     or (\n'
    || E'       v_operation_source = ''checkout''\n'
    || E'       and v_operation.state not in (\n'
    || E'         ''checkout_created'', ''indeterminate'', ''activated'', ''expired'', ''canceled''\n'
    || E'       )\n'
    || E'     )\n'
    || E'     or (\n'
    || E'       v_operation_source = ''plan_change''\n'
    || E'       and (\n'
    || E'         v_operation.state not in (\n'
    || E'           ''submitted'', ''provider_accepted'', ''activated'', ''indeterminate'', ''abandoned''\n'
    || E'         )\n'
    || E'         or v_plan_change.provider_subscription_id is distinct from v_subscription_id\n'
    || E'       )\n'
    || E'     )\n';
  v_hits := (pg_catalog.length(v_def) - pg_catalog.length(pg_catalog.replace(v_def, v_before, '')))
            / pg_catalog.length(v_before);
  if v_hits <> 1 then
    raise exception '% 2e matched % times, expected exactly 1', procedure_note, v_hits;
  end if;
  v_def := pg_catalog.replace(v_def, v_before, v_after);

  -- 2f. `provider_object_id` is Checkout-only. On the plan-change ledger it is
  --     always null and the comparison must not silently pass by being null.
  --
  --     BOTH directions, and the second one is not symmetry for its own sake.
  --     2b relaxed the null-Session refusal for the whole contract, which the
  --     checkout rail never wanted: a checkout operation arriving with a null
  --     Session would otherwise pass, and then the activation UPDATE below sets
  --     `provider_object_id = v_checkout_session_id`, destroying the recorded
  --     Checkout Session id on a live paid row. The state-shape CHECK permits
  --     that, because `activated` does not demand a provider object. So the
  --     narrowing has to be restated here, where the source is known.
  v_before := E'     or (\n'
    || E'       v_operation.provider_object_id is not null\n'
    || E'       and v_operation.provider_object_id is distinct from v_checkout_session_id\n'
    || E'     )\n';
  v_after := E'     or (\n'
    || E'       v_operation_source = ''checkout''\n'
    || E'       and v_operation.provider_object_id is not null\n'
    || E'       and v_operation.provider_object_id is distinct from v_checkout_session_id\n'
    || E'     )\n'
    || E'     or (v_operation_source = ''checkout'' and v_checkout_session_id is null)\n'
    || E'     or (v_operation_source = ''plan_change'' and v_checkout_session_id is not null)\n';
  v_hits := (pg_catalog.length(v_def) - pg_catalog.length(pg_catalog.replace(v_def, v_before, '')))
            / pg_catalog.length(v_before);
  if v_hits <> 1 then
    raise exception '% 2f matched % times, expected exactly 1', procedure_note, v_hits;
  end if;
  v_def := pg_catalog.replace(v_def, v_before, v_after);

  -- 2g. Activation evidence, and the two state-machine guards around it.
  v_before := E'  v_can_activate := v_subscription_status = ''active''\n'
    || E'    and v_payment_evidence in (''checkout_session_paid'', ''invoice_paid'');\n'
    || E'  if not v_was_activated and v_operation.state in (''expired'', ''canceled'') and v_can_activate then\n'
    || E'    raise exception ''terminal Checkout operation cannot activate a subscription''\n'
    || E'      using errcode = ''55000'';\n'
    || E'  end if;\n'
    || E'\n'
    || E'  if not v_was_activated and v_operation.state in (''checkout_created'', ''indeterminate'') then\n';
  v_after := E'  v_can_activate := v_subscription_status = ''active''\n'
    || E'    and case\n'
    || E'      when v_operation_source = ''plan_change'' then\n'
    || E'        v_payment_evidence = ''invoice_paid''\n'
    || E'        and v_plan_change.proration_invoice_id is not null\n'
    || E'        and v_invoice_id is not distinct from v_plan_change.proration_invoice_id\n'
    || E'      else v_payment_evidence in (''checkout_session_paid'', ''invoice_paid'')\n'
    || E'    end;\n'
    || E'  if not v_was_activated\n'
    || E'     and v_can_activate\n'
    || E'     and (\n'
    || E'       (v_operation_source = ''checkout'' and v_operation.state in (''expired'', ''canceled''))\n'
    || E'       or (v_operation_source = ''plan_change'' and v_operation.state = ''abandoned'')\n'
    || E'     ) then\n'
    || E'    raise exception ''terminal Checkout operation cannot activate a subscription''\n'
    || E'      using errcode = ''55000'';\n'
    || E'  end if;\n'
    || E'\n'
    || E'  if not v_was_activated\n'
    || E'     and (\n'
    || E'       (v_operation_source = ''checkout'' and v_operation.state in (''checkout_created'', ''indeterminate''))\n'
    || E'       or (v_operation_source = ''plan_change'' and v_operation.state = ''provider_accepted'')\n'
    || E'     ) then\n';
  v_hits := (pg_catalog.length(v_def) - pg_catalog.length(pg_catalog.replace(v_def, v_before, '')))
            / pg_catalog.length(v_before);
  if v_hits <> 1 then
    raise exception '% 2g matched % times, expected exactly 1', procedure_note, v_hits;
  end if;
  v_def := pg_catalog.replace(v_def, v_before, v_after);

  -- 2h. The three writes back. The plan-change ledger has no metadata column and
  --     no provider_object_id, its resolved failure state is 'abandoned', and its
  --     protection trigger admits provider_accepted -> activated | abandoned and
  --     nothing else -- so these are separate statements, not a parameterised one.
  v_before := E'    if v_can_activate then\n'
    || E'      update public.billing_subscription_checkout_operations o\n';
  v_after := E'    if v_can_activate then\n'
    || E'      if v_operation_source = ''plan_change'' then\n'
    || E'        update public.billing_subscription_plan_change_operations c\n'
    || E'           set state = ''activated'',\n'
    || E'               resolved_at = pg_catalog.now(),\n'
    || E'               last_error = null\n'
    || E'         where c.id = v_operation.id\n'
    || E'        returning * into v_plan_change;\n'
    || E'        v_operation.state := v_plan_change.state;\n'
    || E'        v_was_activated := true;\n'
    || E'      else\n'
    || E'      update public.billing_subscription_checkout_operations o\n';
  v_hits := (pg_catalog.length(v_def) - pg_catalog.length(pg_catalog.replace(v_def, v_before, '')))
            / pg_catalog.length(v_before);
  if v_hits <> 1 then
    raise exception '% 2h matched % times, expected exactly 1', procedure_note, v_hits;
  end if;
  v_def := pg_catalog.replace(v_def, v_before, v_after);

  v_before := E'      returning * into v_operation;\n'
    || E'      v_was_activated := true;\n'
    || E'    elsif v_subscription_status = ''incomplete_expired'' then\n'
    || E'      update public.billing_subscription_checkout_operations o\n'
    || E'         set state = ''expired'',\n';
  v_after := E'      returning * into v_operation;\n'
    || E'      v_was_activated := true;\n'
    || E'      end if;\n'
    || E'    elsif v_subscription_status = ''incomplete_expired'' then\n'
    || E'      if v_operation_source = ''plan_change'' then\n'
    || E'        update public.billing_subscription_plan_change_operations c\n'
    || E'           set state = ''abandoned'',\n'
    || E'               resolved_at = pg_catalog.now(),\n'
    || E'               last_error = ''subscription reached incomplete_expired before the proration invoice was paid''\n'
    || E'         where c.id = v_operation.id\n'
    || E'        returning * into v_plan_change;\n'
    || E'        v_operation.state := v_plan_change.state;\n'
    || E'      else\n'
    || E'      update public.billing_subscription_checkout_operations o\n'
    || E'         set state = ''expired'',\n';
  v_hits := (pg_catalog.length(v_def) - pg_catalog.length(pg_catalog.replace(v_def, v_before, '')))
            / pg_catalog.length(v_before);
  if v_hits <> 1 then
    raise exception '% 2h-expired matched % times, expected exactly 1', procedure_note, v_hits;
  end if;
  v_def := pg_catalog.replace(v_def, v_before, v_after);

  v_before := E'      returning * into v_operation;\n'
    || E'    elsif v_subscription_status = ''canceled'' then\n'
    || E'      update public.billing_subscription_checkout_operations o\n'
    || E'         set state = ''canceled'',\n';
  v_after := E'      returning * into v_operation;\n'
    || E'      end if;\n'
    || E'    elsif v_subscription_status = ''canceled'' then\n'
    || E'      if v_operation_source = ''plan_change'' then\n'
    || E'        update public.billing_subscription_plan_change_operations c\n'
    || E'           set state = ''abandoned'',\n'
    || E'               resolved_at = pg_catalog.now(),\n'
    || E'               last_error = ''subscription was canceled before the proration invoice was paid''\n'
    || E'         where c.id = v_operation.id\n'
    || E'        returning * into v_plan_change;\n'
    || E'        v_operation.state := v_plan_change.state;\n'
    || E'      else\n'
    || E'      update public.billing_subscription_checkout_operations o\n'
    || E'         set state = ''canceled'',\n';
  v_hits := (pg_catalog.length(v_def) - pg_catalog.length(pg_catalog.replace(v_def, v_before, '')))
            / pg_catalog.length(v_before);
  if v_hits <> 1 then
    raise exception '% 2h-canceled matched % times, expected exactly 1', procedure_note, v_hits;
  end if;
  v_def := pg_catalog.replace(v_def, v_before, v_after);

  v_before := E'       where o.id = v_operation.id\n'
    || E'      returning * into v_operation;\n'
    || E'    end if;\n'
    || E'  end if;\n';
  v_after := E'       where o.id = v_operation.id\n'
    || E'      returning * into v_operation;\n'
    || E'      end if;\n'
    || E'    end if;\n'
    || E'  end if;\n';
  v_hits := (pg_catalog.length(v_def) - pg_catalog.length(pg_catalog.replace(v_def, v_before, '')))
            / pg_catalog.length(v_before);
  if v_hits <> 1 then
    raise exception '% 2h-close matched % times, expected exactly 1', procedure_note, v_hits;
  end if;
  v_def := pg_catalog.replace(v_def, v_before, v_after);

  -- 2j. The breadcrumb the projector leaves on billing_subscriptions.metadata is
  --      keyed `checkout_operation_pk`, and under this change it can now hold a
  --      PLAN-CHANGE ledger id. Nothing reads that key today, which is exactly
  --      why it is worth labelling now: a future join to
  --      billing_subscription_checkout_operations on it would return zero rows
  --      for plan-change-driven subscriptions and report that as "no operation".
  --      Two sites, distinguished only by indentation, so each is asserted alone.
  v_before := E'        ''schema'', ''stripe_subscription_projection_v1'',\n'
    || E'        ''checkout_operation_pk'', v_operation.id,\n';
  v_after := E'        ''schema'', ''stripe_subscription_projection_v1'',\n'
    || E'        ''operation_source'', v_operation_source,\n'
    || E'        ''checkout_operation_pk'', v_operation.id,\n';
  v_hits := (pg_catalog.length(v_def) - pg_catalog.length(pg_catalog.replace(v_def, v_before, '')))
            / pg_catalog.length(v_before);
  if v_hits <> 1 then
    raise exception '% 2j-insert matched % times, expected exactly 1', procedure_note, v_hits;
  end if;
  v_def := pg_catalog.replace(v_def, v_before, v_after);

  v_before := E'               ''schema'', ''stripe_subscription_projection_v1'',\n'
    || E'               ''checkout_operation_pk'', v_operation.id,\n';
  v_after := E'               ''schema'', ''stripe_subscription_projection_v1'',\n'
    || E'               ''operation_source'', v_operation_source,\n'
    || E'               ''checkout_operation_pk'', v_operation.id,\n';
  v_hits := (pg_catalog.length(v_def) - pg_catalog.length(pg_catalog.replace(v_def, v_before, '')))
            / pg_catalog.length(v_before);
  if v_hits <> 1 then
    raise exception '% 2j-update matched % times, expected exactly 1', procedure_note, v_hits;
  end if;
  v_def := pg_catalog.replace(v_def, v_before, v_after);

  -- 2i. The entitlement escape 20260823120000 added queried the checkout table,
  --     where a plan-change operation cannot exist under this design -- so it was
  --     dead code, not merely inert. The carrier already holds the purpose.
  v_before := E'    if v_entitlement.plan_code not in (''flex'', v_plan_code)\n'
    || E'       and not exists (\n'
    || E'         select 1\n'
    || E'           from public.billing_subscription_checkout_operations o\n'
    || E'          where o.account_id = v_account_id\n'
    || E'            and o.operation_id = v_operation_id\n'
    || E'            and o.purpose = ''base_plan_plan_change''\n'
    || E'       ) then\n';
  v_after := E'    if v_entitlement.plan_code not in (''flex'', v_plan_code)\n'
    || E'       and v_operation.purpose is distinct from ''base_plan_plan_change'' then\n';
  v_hits := (pg_catalog.length(v_def) - pg_catalog.length(pg_catalog.replace(v_def, v_before, '')))
            / pg_catalog.length(v_before);
  if v_hits <> 1 then
    raise exception '% 2i matched % times, expected exactly 1', procedure_note, v_hits;
  end if;
  v_def := pg_catalog.replace(v_def, v_before, v_after);

  execute v_def;
end $$;

-- ---------------------------------------------------------------------------
-- 3. The projector wrapper stops demanding a Checkout Session id.
--
--    The KEY is still mandatory -- the unchecked body's exact-schema check uses
--    `?&`, which a JSON null satisfies -- so a caller still cannot omit it. Only
--    the not-null demand goes, and only here.
-- ---------------------------------------------------------------------------
do $$
declare
  v_def text;
  v_before text;
  v_hits integer;
begin
  select pg_catalog.replace(pg_catalog.pg_get_functiondef(p.oid), E'\r\n', E'\n')
    into v_def
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.prokind = 'f'
     and p.proname = 'project_stripe_billing_subscription_event';
  if v_def is null then
    raise exception 'subscription projector wrapper not found; refusing to patch blind';
  end if;

  v_before := E'     or p_projection ->> ''checkout_session_id'' is null\n';
  v_hits := (pg_catalog.length(v_def) - pg_catalog.length(pg_catalog.replace(v_def, v_before, '')))
            / pg_catalog.length(v_before);
  if v_hits = 0 then
    -- Already applied. Safe to re-run.
    return;
  end if;
  if v_hits <> 1 then
    raise exception 'projector wrapper session clause matched % times, expected exactly 1', v_hits;
  end if;

  execute pg_catalog.replace(v_def, v_before, '');
end $$;

-- ---------------------------------------------------------------------------
-- 4. Post-conditions.
--
--    Every probe reads the LIVE bodies. `prokind = 'f'` is not decoration:
--    pg_get_functiondef raises 42809 on an aggregate, and an unfiltered pg_proc
--    scan in here rolls the whole migration back.
-- ---------------------------------------------------------------------------
do $$
declare
  v_projector text;
  v_wrapper text;
  v_binding text;
begin
  select pg_catalog.replace(pg_catalog.pg_get_functiondef(p.oid), E'\r\n', E'\n')
    into v_projector
    from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind = 'f'
     and p.proname = 'project_stripe_billing_subscription_event_v1_unchecked';
  select pg_catalog.replace(pg_catalog.pg_get_functiondef(p.oid), E'\r\n', E'\n')
    into v_wrapper
    from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind = 'f'
     and p.proname = 'project_stripe_billing_subscription_event';
  select pg_catalog.replace(pg_catalog.pg_get_functiondef(p.oid), E'\r\n', E'\n')
    into v_binding
    from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind = 'f'
     and p.proname = 'resolve_stripe_billing_subscription_projection_binding_v1_unche';

  -- The change landed.
  if pg_catalog.strpos(v_projector, 'billing_subscription_plan_change_operations') = 0 then
    raise exception 'the projector still cannot see the plan-change ledger';
  end if;
  if pg_catalog.strpos(v_binding, 'billing_subscription_plan_change_operations') = 0 then
    raise exception 'the binding still cannot see the plan-change ledger';
  end if;
  if pg_catalog.strpos(v_wrapper, E'''checkout_session_id'' is null') > 0 then
    raise exception 'the projector wrapper still refuses a null Checkout Session';
  end if;

  -- Activation binds to the recorded proration invoice and to nothing else. If
  -- this clause is ever dropped, an already-paid renewal activates an unpaid
  -- upgrade, which is the single worst outcome available on this rail.
  if pg_catalog.strpos(
       v_projector,
       'v_invoice_id is not distinct from v_plan_change.proration_invoice_id'
     ) = 0 then
    raise exception 'plan-change activation is no longer bound to its proration invoice';
  end if;
  if pg_catalog.strpos(v_projector, 'v_plan_change.proration_invoice_id is not null') = 0 then
    raise exception 'a plan change with no proration invoice can now activate';
  end if;

  -- A plan change may only activate out of provider_accepted. Any other
  -- predecessor means activating on Stripe having accepted the change rather
  -- than on the customer having paid for it.
  if pg_catalog.strpos(
       v_projector,
       E'v_operation_source = ''plan_change'' and v_operation.state = ''provider_accepted'''
     ) = 0 then
    raise exception 'plan-change activation no longer requires provider_accepted';
  end if;

  -- Evidence of a paid Checkout Session still requires one to exist.
  if pg_catalog.strpos(v_projector, E'      or v_checkout_session_id is null\n') = 0 then
    raise exception 'checkout_session_paid evidence no longer requires a Checkout Session';
  end if;

  -- The null-Session relaxation is for the plan-change ledger ONLY. Without the
  -- first clause a checkout operation could activate with a null Session and the
  -- activation UPDATE would erase its recorded Checkout Session id; without the
  -- second, a plan change could carry someone else's Session.
  if pg_catalog.strpos(
       v_projector,
       E'or (v_operation_source = ''checkout'' and v_checkout_session_id is null)'
     ) = 0 then
    raise exception 'the checkout rail no longer requires a Checkout Session id';
  end if;
  if pg_catalog.strpos(
       v_projector,
       E'or (v_operation_source = ''plan_change'' and v_checkout_session_id is not null)'
     ) = 0 then
    raise exception 'a plan change may now carry a Checkout Session id';
  end if;

  -- The subscription breadcrumb says which ledger the operation came from.
  if (pg_catalog.length(v_projector)
      - pg_catalog.length(pg_catalog.replace(v_projector, E'''operation_source'', v_operation_source', '')))
     / pg_catalog.length(E'''operation_source'', v_operation_source') <> 2 then
    raise exception 'the subscription metadata breadcrumb does not label both write sites';
  end if;

  -- The clauses that must NOT have moved. These are the anti-forgery guards; the
  -- patches above are only safe while these are still doing their work.
  if pg_catalog.strpos(v_binding, 'v_operation.stripe_price_id is distinct from p_provider_price_id') = 0 then
    raise exception 'binding no longer pins the operation price';
  end if;
  if pg_catalog.strpos(v_binding, 'v_subscription.account_id is distinct from p_account_id') = 0
     or pg_catalog.strpos(v_binding, 'v_subscription.provider_customer_id is distinct from p_provider_customer_id') = 0 then
    raise exception 'binding no longer pins workspace or customer identity';
  end if;
  if pg_catalog.strpos(v_binding, 'Stripe Billing operation id resolves in two ledgers') = 0
     or pg_catalog.strpos(v_projector, 'Stripe Billing operation id resolves in two ledgers') = 0 then
    raise exception 'an operation id may now resolve in both ledgers at once';
  end if;
  if pg_catalog.strpos(v_projector, 'v_operation.unit_amount_cents is distinct from v_unit_amount_cents') = 0
     or pg_catalog.strpos(v_projector, 'v_operation.recurring_consent_acceptance_id is distinct from') = 0 then
    raise exception 'projector no longer pins the operation amount or consent';
  end if;
  -- The checkout rail keeps its Checkout Session expiry demand. Relaxing it for
  -- the plan-change ledger must not have relaxed it for checkouts.
  if pg_catalog.strpos(v_binding, 'v_operation.checkout_expires_at is null') = 0 then
    raise exception 'binding no longer requires a Checkout expiry on the checkout rail';
  end if;

  -- The entitlement escape is live rather than dead: it now reads the carrier,
  -- which is populated from whichever ledger the operation actually came from.
  if pg_catalog.strpos(
       v_projector,
       E'v_operation.purpose is distinct from ''base_plan_plan_change'''
     ) = 0 then
    raise exception 'the paid-to-paid entitlement escape did not re-point';
  end if;
  -- Spelled with an explicit \n rather than a literal line break: this file has
  -- to survive being stored CRLF, and a guard whose needle carries a \r can
  -- never match a normalised body. It would then pass by finding nothing, which
  -- is the failure mode a postcondition exists to prevent.
  if pg_catalog.strpos(
       v_projector,
       E'from public.billing_subscription_checkout_operations o\n          where o.account_id = v_account_id'
     ) > 0 then
    raise exception 'the dead entitlement subquery is still in the projector';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 5. The revoke is the security. Prove it bit, rather than that it ran.
--
--    pg_default_acl for `public` grants anon EXECUTE on every new function BY
--    NAME. Both binding functions were dropped and recreated above, so both got
--    that grant afresh. Deleting the revokes in section 1 makes this refuse.
-- ---------------------------------------------------------------------------
do $$
declare
  v_role text;
  v_fn text;
begin
  foreach v_fn in array array[
    'resolve_stripe_billing_subscription_projection_binding',
    'resolve_stripe_billing_subscription_projection_binding_v1_unche'
  ] loop
    foreach v_role in array array['anon', 'authenticated'] loop
      if exists (
        select 1
          from pg_catalog.pg_proc p
          join pg_catalog.pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public'
           and p.prokind = 'f'
           and p.proname = v_fn
           and pg_catalog.has_function_privilege(v_role, p.oid, 'EXECUTE')
      ) then
        raise exception '% still holds EXECUTE on %', v_role, v_fn;
      end if;
    end loop;
  end loop;

  -- service_role must keep the wrapper and must NOT have the unchecked one.
  if not exists (
    select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f'
       and p.proname = 'resolve_stripe_billing_subscription_projection_binding'
       and pg_catalog.has_function_privilege('service_role', p.oid, 'EXECUTE')
  ) then
    raise exception 'service_role lost EXECUTE on the projection binding wrapper';
  end if;
  if exists (
    select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f'
       and p.proname = 'resolve_stripe_billing_subscription_projection_binding_v1_unche'
       and pg_catalog.has_function_privilege('service_role', p.oid, 'EXECUTE')
  ) then
    raise exception 'service_role can now call the unchecked binding directly';
  end if;
end $$;

commit;
