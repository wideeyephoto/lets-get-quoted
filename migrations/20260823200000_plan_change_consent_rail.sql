-- A paid workspace can record recurring consent for a PLAN CHANGE.
--
-- WHY THIS IS NEEDED AT ALL. `billing_subscription_checkout_operations.recurring_consent_acceptance_id`
-- is NOT NULL and UNIQUE, so consent is single-use by construction and a plan
-- change cannot reuse the acceptance captured at first purchase. Nor should it:
-- the customer is agreeing to a DIFFERENT recurring amount.
--
-- But both existing routes refuse a paying workspace by design:
--
--   record_base_plan_recurring_consent      -- 'first-subscription consent requires
--                                              an active Flex workspace' (55000)
--   claim_stripe_billing_subscription_checkout -- 'existing subscription history requires
--                                              the future plan-change flow' (0A000)
--
-- That second message names this work. This is the first half of it.
--
-- A NEW FUNCTION, NOT A PARAMETER ON THE OLD ONE. The Flex gate on
-- record_base_plan_recurring_consent is CORRECT for a first subscription, and
-- claim_stripe_billing_subscription_checkout still depends on the invariant it
-- enforces. Adding a p_purpose branch would put a paid-workspace path inside the
-- function the first-checkout rail trusts, and the blast radius of getting that
-- wrong is every new sale. The body below is a verbatim copy except for the
-- entitlement guard and the inserted purpose.
--
-- WHAT IS DELIBERATELY COPIED UNCHANGED, because each line is load-bearing:
-- the auth.uid() capture, the is_anonymous rejection, the absence of any
-- p_accepted_by parameter (the caller cannot claim to be somebody else), the
-- operation-id shape test, the artifact triple pinned with `is distinct from`,
-- the hardcoded amount table, the exact-Terms check, the owner-membership check,
-- accepted_by = v_actor, the 30-minute window, and the lock order
-- accounts -> memberships -> entitlements.
--
-- THE 30-MINUTE WINDOW IS WHY THE SCHEDULED PATH IS NOT BUILT HERE. It is one of
-- three synchronised copies of the same number (this literal, the
-- billing_subscription_consent_validity_window_check CHECK, and
-- BASE_PLAN_RECURRING_CONSENT_CLAIM_TTL_SECONDS in subscription-consent.ts).
-- A change scheduled for renewal needs consent minted at schedule time to
-- survive to apply time, weeks later. That needs a purpose-scoped window and is
-- its own migration.
--
-- INERT ON APPLY. Nothing calls this function. The purpose CHECK is widened, so
-- a row COULD carry the new purpose, but no writer produces one.

begin;

-- ---------------------------------------------------------------------------
-- 0. Refuse to run out of order.
--
--    20260823120000 widened the OPERATIONS table's purpose check to admit
--    'base_plan_plan_change'. If that is missing, this migration widens the
--    acceptances side of a pairing whose other half does not exist, and the
--    first plan change would mint consent that nothing can ever bind.
-- ---------------------------------------------------------------------------
do $$
begin
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
-- 1. The acceptances table admits the plan-change purpose.
--
--    The one thing 20260823120000 missed. It widened the operations table's
--    purpose CHECK and left its twin here pinned to 'base_plan_subscription',
--    so consent for a plan change could not have been stored even if something
--    had tried to write it.
--
--    The DEFAULT stays 'base_plan_subscription' on purpose: anything that omits
--    the column cannot silently become a plan change.
-- ---------------------------------------------------------------------------
alter table public.billing_subscription_consent_acceptances
  drop constraint if exists billing_subscription_consent_acceptances_purpose_check;
alter table public.billing_subscription_consent_acceptances
  add constraint billing_subscription_consent_acceptances_purpose_check
  check (purpose in ('base_plan_subscription', 'base_plan_plan_change'));

-- ---------------------------------------------------------------------------
-- 2. The recorder.
-- ---------------------------------------------------------------------------
create or replace function public.record_base_plan_plan_change_consent(
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
returns table(
  acceptance_id uuid, account_id uuid, operation_id text, accepted_by uuid,
  accepted_at timestamptz, expires_at timestamptz, plan_code text,
  billing_interval text, catalog_version text, unit_amount_cents bigint,
  currency text, terms_version text, recurring_consent_version text,
  recurring_consent_text_sha256 text
)
language plpgsql
security definer
set search_path to 'pg_catalog', 'pg_temp'
as $fn$
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
    raise exception 'authenticated non-anonymous owner is required for plan-change consent'
      using errcode = '42501';
  end if;
  if p_operation_id is null
     or pg_catalog.length(pg_catalog.btrim(p_operation_id)) not between 1 and 200
     or p_operation_id ~ '[[:cntrl:]]' then
    raise exception 'invalid plan-change consent operation ID' using errcode = '22023';
  end if;
  if p_plan_code is null or p_plan_code not in ('solo', 'growth', 'scale')
     or p_billing_interval is null or p_billing_interval not in ('monthly', 'annual') then
    raise exception 'invalid plan-change consent plan selection' using errcode = '22023';
  end if;
  if p_catalog_version is distinct from '2026-08-18-preview'
     or p_currency is distinct from 'usd'
     or p_terms_version is distinct from '2026-08-16'
     or p_recurring_consent_version is distinct from 'base-plan-recurring-2026-08-16'
     or p_recurring_consent_text_sha256 is distinct from
       'f39aeedb379d397f941d3c5fc48357703b4cc97148d8b1bb3c2f55b04e449c75' then
    raise exception 'plan-change consent contract is not the exact current artifact'
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
    raise exception 'plan-change consent amount does not match the canonical catalog'
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
    raise exception 'workspace must accept the exact current Terms before plan-change consent'
      using errcode = '55000';
  end if;

  perform 1
    from public.memberships m
   where m.account_id = p_account_id
     and m.user_id = v_actor
     and m.role = 'owner'
   for share;
  if not found then
    raise exception 'only the authenticated workspace owner may accept a plan change'
      using errcode = '42501';
  end if;

  -- THE INVERSE OF THE FIRST-CHECKOUT GUARD, and it must stay the exact
  -- inverse. That one exists so a paid workspace cannot run the
  -- first-subscription rail; this one exists so a FLEX workspace cannot run the
  -- plan-change rail and reach a projector clause relaxed for paying customers
  -- only. Neither is decoration.
  select e.*
    into v_entitlement
    from public.workspace_entitlements e
   where e.account_id = p_account_id
   for share;
  if not found
     or v_entitlement.plan_code not in ('solo', 'growth', 'scale')
     or v_entitlement.billing_interval not in ('monthly', 'annual')
     or v_entitlement.billing_status <> 'active'
     or v_entitlement.entitlement_state <> 'active' then
    raise exception 'plan-change consent requires an active paid workspace'
      using errcode = '55000';
  end if;

  -- Consent must name a move. Recording an acceptance for the plan the customer
  -- is already on would burn a single-use acceptance on a no-op and, because
  -- the acceptance row is immutable and undeletable, leave permanent evidence
  -- of an agreement to something that never happened.
  if v_entitlement.plan_code = p_plan_code
     and v_entitlement.billing_interval = p_billing_interval then
    raise exception 'plan-change consent must name a different plan'
      using errcode = '22000';
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
    'base_plan_plan_change',
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
$fn$;

-- ---------------------------------------------------------------------------
-- 3. Grants.
--
--    THE `anon` IN THIS REVOKE IS THE SECURITY, NOT BOILERPLATE. pg_default_acl
--    for schema public, objtype 'f', grantor postgres is
--    {postgres=X, anon=X, authenticated=X, service_role=X} -- anon by NAME, not
--    via PUBLIC. So a SECURITY DEFINER function that writes consent evidence is
--    anon-callable the instant it is created. Drop `anon` from this list and
--    an unauthenticated caller can reach it.
--
--    `authenticated`, NOT service_role, and that is not a style choice: the body
--    captures the actor from auth.uid(), which is NULL on a service-role
--    connection, and accepted_by is load-bearing in the consent binding. A
--    service_role grant would be dead code that widens the surface. This matches
--    the existing recorder's live ACL exactly.
-- ---------------------------------------------------------------------------
revoke all on function public.record_base_plan_plan_change_consent(
  uuid, text, text, text, text, bigint, text, text, text, text
) from public, anon, authenticated, service_role;
grant execute on function public.record_base_plan_plan_change_consent(
  uuid, text, text, text, text, bigint, text, text, text, text
) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Post-conditions. Prove the grants, not just perform them -- doing the
--    revoke and not asserting it is how the next edit silently reopens it.
-- ---------------------------------------------------------------------------
do $$
declare
  v_sig text := 'public.record_base_plan_plan_change_consent(uuid, text, text, text, text, bigint, text, text, text, text)';
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
     where conrelid = 'public.billing_subscription_consent_acceptances'::regclass
       and conname = 'billing_subscription_consent_acceptances_purpose_check'
       and pg_catalog.pg_get_constraintdef(oid) like '%base_plan_plan_change%'
  ) then
    raise exception 'acceptances purpose check does not admit a plan change';
  end if;

  -- The one that matters most.
  if pg_catalog.has_function_privilege('anon', v_sig, 'EXECUTE') then
    raise exception 'anon can execute the plan-change consent recorder';
  end if;
  if pg_catalog.has_function_privilege('service_role', v_sig, 'EXECUTE') then
    raise exception 'service_role can execute a recorder that depends on auth.uid()';
  end if;
  if not pg_catalog.has_function_privilege('authenticated', v_sig, 'EXECUTE') then
    raise exception 'authenticated cannot execute the plan-change consent recorder';
  end if;

  -- The first-checkout rail must be untouched. If either of these ever stops
  -- being true, a Flex workspace and a paid workspace can reach each other's
  -- rail, which is the whole thing these two guards exist to prevent.
  if pg_catalog.strpos(
       pg_catalog.pg_get_functiondef('public.record_base_plan_recurring_consent(uuid, text, text, text, text, bigint, text, text, text, text)'::regprocedure),
       'first-subscription consent requires an active Flex workspace') = 0 then
    raise exception 'the first-subscription consent Flex guard was removed';
  end if;
  if pg_catalog.strpos(
       pg_catalog.pg_get_functiondef('public.record_base_plan_plan_change_consent(uuid, text, text, text, text, bigint, text, text, text, text)'::regprocedure),
       'plan-change consent requires an active paid workspace') = 0 then
    raise exception 'the plan-change consent paid guard is missing';
  end if;

  -- And it must still capture the actor itself rather than trusting a caller.
  if pg_catalog.strpos(
       pg_catalog.pg_get_functiondef('public.record_base_plan_plan_change_consent(uuid, text, text, text, text, bigint, text, text, text, text)'::regprocedure),
       'auth.uid()') = 0 then
    raise exception 'the plan-change recorder does not capture auth.uid()';
  end if;
end $$;

commit;
