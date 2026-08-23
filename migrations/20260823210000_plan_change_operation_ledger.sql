-- The durable record a plan change writes BEFORE it calls Stripe.
--
-- Rail stage 2. Inert on apply: the claim RPC has no caller, and nothing reads
-- the table yet.
--
-- WHY A SEPARATE TABLE rather than widening billing_subscription_checkout_operations.
-- The Stripe EVENTS cannot be routed anywhere else -- a plan change emits
-- customer.subscription.updated and invoice.paid on the same subscription object
-- as everything else -- but the LEDGER can. Reusing the checkout table would
-- mean:
--   * widening its state-shape CHECK, which is written around a Checkout Session
--     that a subscriptions.update does not have;
--   * inheriting billing_subscription_checkout_one_pending_per_account, whose
--     partial unique on (account_id) would let one unresolved plan change lock a
--     workspace out of every further plan change AND out of any new checkout --
--     and nothing sweeps that index today;
--   * sharing billing_subscription_checkout_consent_single_use_unique across two
--     rails that mint consent independently.
-- A separate table costs one more binding lookup in the projector and buys all
-- three back.
--
-- WHY THE ROW IS WRITTEN BEFORE THE STRIPE CALL. The webhook can arrive before
-- subscriptions.update() returns. A row written afterwards leaves the projector
-- meeting an event with no operation to bind, which dead-letters it -- the same
-- bug from the other side. Writing first and letting Stripe fail leaves an
-- orphaned row that is harmless: nothing references it, and its idempotency key
-- means a retry finds the same row rather than writing a second.

begin;

-- ---------------------------------------------------------------------------
-- 0. Refuse to run out of order.
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regprocedure('public.record_base_plan_plan_change_consent(uuid, text, text, text, text, bigint, text, text, text, text)') is null then
    raise exception '20260823200000 has not been applied; there is no plan-change consent recorder';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Let the consent binding pin PURPOSE.
--
--    The existing 13-column consent FK does NOT include `purpose`, and until
--    20260823200000 that was safe because only one purpose existed. Now that the
--    acceptances CHECK admits two, nothing structural stops a plan-change
--    operation binding a first-checkout acceptance or the reverse. The RPC below
--    matches on purpose explicitly; this makes the database enforce it too, so a
--    future writer cannot forget.
-- ---------------------------------------------------------------------------
alter table public.billing_subscription_consent_acceptances
  drop constraint if exists billing_subscription_consent_purpose_binding_unique;
alter table public.billing_subscription_consent_acceptances
  add constraint billing_subscription_consent_purpose_binding_unique
  unique (id, purpose);

-- ---------------------------------------------------------------------------
-- 2. The ledger.
-- ---------------------------------------------------------------------------
create table public.billing_subscription_plan_change_operations (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete restrict,
  operation_id text not null check (
    pg_catalog.length(pg_catalog.btrim(operation_id)) between 1 and 200
    and operation_id !~ '[[:cntrl:]]'
  ),
  -- Pinned, not defaulted-and-open. This table exists for exactly one purpose,
  -- and the column is here so the consent FK below can pin it.
  purpose text not null default 'base_plan_plan_change'
    check (purpose = 'base_plan_plan_change'),
  provider text not null default 'stripe' check (provider = 'stripe'),
  livemode boolean not null,

  provider_subscription_id text not null check (
    provider_subscription_id ~ '^sub_[A-Za-z0-9]{8,}$'
    and pg_catalog.length(provider_subscription_id) <= 255
  ),
  -- NOT NULL on purpose. Without the item id there is nothing to point at a new
  -- Price, and guessing items[0] is wrong for any subscription that ever gains a
  -- second line. A plan change that cannot name its line item must not get a row.
  provider_subscription_item_id text not null check (
    provider_subscription_item_id ~ '^si_[A-Za-z0-9]{8,}$'
    and pg_catalog.length(provider_subscription_item_id) <= 255
  ),
  provider_customer_id text check (
    provider_customer_id is null
    or (provider_customer_id ~ '^cus_[A-Za-z0-9]{8,}$'
        and pg_catalog.length(provider_customer_id) <= 255)
  ),

  -- Where the workspace was when it agreed. Recorded because the customer's
  -- consent was to a move FROM something, and the account timeline and any
  -- later dispute need both ends.
  from_plan_code text not null check (from_plan_code in ('flex', 'solo', 'growth', 'scale')),
  from_billing_interval text not null check (from_billing_interval in ('none', 'monthly', 'annual')),

  plan_code text not null check (plan_code in ('solo', 'growth', 'scale')),
  billing_interval text not null check (billing_interval in ('monthly', 'annual')),
  catalog_version text not null check (catalog_version in ('2026-08-15-preview', '2026-08-18-preview')),
  stripe_price_id text not null check (
    stripe_price_id ~ '^price_[A-Za-z0-9]{8,}$' and pg_catalog.length(stripe_price_id) <= 255
  ),
  stripe_product_id text not null check (
    stripe_product_id ~ '^prod_[A-Za-z0-9]{8,}$' and pg_catalog.length(stripe_product_id) <= 255
  ),
  currency text not null default 'usd' check (currency = 'usd'),
  unit_amount_cents bigint not null check (unit_amount_cents > 0),

  terms_version text not null,
  recurring_consent_version text not null,
  recurring_consent_text_sha256 text not null,
  recurring_consent_acceptance_id uuid not null,
  recurring_consent_accepted_by uuid not null,
  recurring_consent_accepted_at timestamptz not null,

  stripe_idempotency_key text not null check (
    stripe_idempotency_key ~ '^lgq:billing:v1:subscription[.]plan_change:[0-9a-f]{64}$'
    and pg_catalog.length(stripe_idempotency_key) <= 255
  ),
  request_fingerprint text not null check (request_fingerprint ~ '^[0-9a-f]{64}$'),

  state text not null default 'submitted'
    check (state in ('submitted', 'provider_accepted', 'activated', 'indeterminate', 'abandoned')),
  claim_token uuid,

  -- The invoice the proration was billed on, captured from the
  -- subscriptions.update response. THE PROJECTOR MUST BIND PAYMENT EVIDENCE TO
  -- THIS ID, not to "any paid invoice on the subscription": a renewal invoice
  -- still sitting in the event queue would otherwise activate the upgrade
  -- before the proration is collected.
  proration_invoice_id text check (
    proration_invoice_id is null
    or (proration_invoice_id ~ '^in_[A-Za-z0-9]{8,}$'
        and pg_catalog.length(proration_invoice_id) <= 255)
  ),
  provider_applied_at timestamptz,
  resolved_at timestamptz,
  attempt_count integer not null default 1 check (attempt_count >= 1),
  last_error text,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),

  constraint billing_plan_change_business_key_unique
    unique (account_id, operation_id),
  constraint billing_plan_change_idempotency_key_unique
    unique (livemode, stripe_idempotency_key),
  -- Consent is single-use across this rail, mirroring the checkout table.
  constraint billing_plan_change_consent_single_use_unique
    unique (recurring_consent_acceptance_id),

  -- The same 13-column binding the checkout rail uses: the acceptance cannot be
  -- swapped for one covering a different plan, amount, workspace or actor.
  constraint billing_plan_change_consent_binding_fk
    foreign key (
      recurring_consent_acceptance_id, account_id, operation_id, plan_code,
      billing_interval, catalog_version, unit_amount_cents, currency,
      terms_version, recurring_consent_version, recurring_consent_text_sha256,
      recurring_consent_accepted_by, recurring_consent_accepted_at
    ) references public.billing_subscription_consent_acceptances (
      id, account_id, operation_id, plan_code, billing_interval, catalog_version,
      unit_amount_cents, currency, terms_version, recurring_consent_version,
      recurring_consent_text_sha256, accepted_by, accepted_at
    ) on delete restrict,
  -- ...plus the part the checkout rail cannot express, now that two purposes
  -- exist: this row may only bind an acceptance recorded FOR a plan change.
  constraint billing_plan_change_consent_purpose_fk
    foreign key (recurring_consent_acceptance_id, purpose)
    references public.billing_subscription_consent_acceptances (id, purpose)
    on delete restrict,

  constraint billing_plan_change_customer_mode_fk
    foreign key (account_id, livemode, provider_customer_id)
    references public.billing_subscription_customers (account_id, livemode, provider_customer_id)
    on delete restrict,

  constraint billing_plan_change_catalog_binding_check check (
    (plan_code = 'solo' and billing_interval = 'monthly' and unit_amount_cents = 3900)
    or (plan_code = 'solo' and billing_interval = 'annual' and unit_amount_cents = 42000)
    or (plan_code = 'growth' and billing_interval = 'monthly' and unit_amount_cents = 12900)
    or (plan_code = 'growth' and billing_interval = 'annual' and unit_amount_cents = 118800)
    or (plan_code = 'scale' and billing_interval = 'monthly' and unit_amount_cents = 32900)
    or (plan_code = 'scale' and billing_interval = 'annual' and unit_amount_cents = 358800)
  ),

  -- A change must be a change. The consent recorder already refuses a no-op;
  -- this stops a row existing for one even if some other writer appears.
  constraint billing_plan_change_moves_somewhere_check check (
    from_plan_code is distinct from plan_code
    or from_billing_interval is distinct from billing_interval
  ),

  constraint billing_plan_change_state_shape_check check (
    (
      state = 'submitted'
      and claim_token is not null
      and proration_invoice_id is null
      and provider_applied_at is null
      and resolved_at is null
      and last_error is null
    )
    or (
      state = 'provider_accepted'
      and claim_token is null
      and provider_applied_at is not null
      and resolved_at is null
      and last_error is null
    )
    or (
      state = 'activated'
      and claim_token is null
      and provider_applied_at is not null
      and resolved_at is not null
      and last_error is null
    )
    or (
      state = 'indeterminate'
      and claim_token is null
      and resolved_at is null
      and last_error is not null
    )
    or (
      state = 'abandoned'
      and claim_token is null
      and resolved_at is not null
      and last_error is not null
    )
  )
);

-- One in-flight change per workspace. Deliberately NOT including the resolved
-- states: unlike the checkout rail's equivalent, a completed plan change must
-- never block the next one, because moving solo -> growth -> solo is an ordinary
-- sequence and a workspace that could not change twice would be worse off than
-- before this rail existed.
create unique index billing_plan_change_one_in_flight_per_account
  on public.billing_subscription_plan_change_operations (account_id)
  where state in ('submitted', 'provider_accepted');

create index billing_plan_change_subscription_idx
  on public.billing_subscription_plan_change_operations (provider, livemode, provider_subscription_id);
create index billing_plan_change_invoice_idx
  on public.billing_subscription_plan_change_operations (provider, livemode, proration_invoice_id)
  where proration_invoice_id is not null;

-- ---------------------------------------------------------------------------
-- 3. Grants.
--
--    THE `anon` IS THE SECURITY. pg_default_acl for public/'r'/postgres grants
--    anon `arwdxtm` -- INSERT, UPDATE and DELETE included -- on every new table,
--    by name rather than via PUBLIC. Without this revoke the ledger that decides
--    whether a customer's plan change is real would be world-writable.
--
--    service_role keeps SELECT only, matching the checkout operations table:
--    every write goes through a compare-and-set RPC so no caller can invent a
--    state transition.
-- ---------------------------------------------------------------------------
revoke all on table public.billing_subscription_plan_change_operations
  from public, anon, authenticated, service_role;
grant select on table public.billing_subscription_plan_change_operations to service_role;

-- ---------------------------------------------------------------------------
-- 4. Post-conditions. ASSERT the grants rather than trusting that the revoke
--    above ran -- performing a revoke and not proving it is how the next edit
--    reopens it silently, and on this table `anon` starts with INSERT.
-- ---------------------------------------------------------------------------
do $$
declare
  v_t text := 'public.billing_subscription_plan_change_operations';
  v_role text;
  v_priv text;
begin
  foreach v_role in array array['anon', 'authenticated', 'public'] loop
    foreach v_priv in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE'] loop
      if pg_catalog.has_table_privilege(v_role, v_t, v_priv) then
        raise exception '% still holds % on the plan-change ledger', v_role, v_priv;
      end if;
    end loop;
  end loop;

  if not pg_catalog.has_table_privilege('service_role', v_t, 'SELECT') then
    raise exception 'service_role cannot read the plan-change ledger';
  end if;
  foreach v_priv in array array['INSERT', 'UPDATE', 'DELETE'] loop
    if pg_catalog.has_table_privilege('service_role', v_t, v_priv) then
      raise exception 'service_role holds % on the plan-change ledger; every write must go through an RPC', v_priv;
    end if;
  end loop;

  -- Both halves of the consent binding must exist, or an operation could bind
  -- an acceptance from the other rail.
  if not exists (
    select 1 from pg_catalog.pg_constraint
     where conrelid = v_t::regclass and conname = 'billing_plan_change_consent_binding_fk'
  ) or not exists (
    select 1 from pg_catalog.pg_constraint
     where conrelid = v_t::regclass and conname = 'billing_plan_change_consent_purpose_fk'
  ) then
    raise exception 'the plan-change consent binding is incomplete';
  end if;

  -- A completed change must never block the next one.
  if not exists (
    select 1 from pg_catalog.pg_indexes
     where schemaname = 'public'
       and indexname = 'billing_plan_change_one_in_flight_per_account'
       and indexdef like '%submitted%provider_accepted%'
       and indexdef not like '%activated%'
  ) then
    raise exception 'the in-flight index is missing or covers a resolved state';
  end if;
end $$;

commit;
