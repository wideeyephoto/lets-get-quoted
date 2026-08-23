-- Recording what Stripe did, and making the ledger tamper-evident.
--
-- Rail stage 4. Inert on apply: nothing calls these.
--
-- Two things land together because neither is safe alone. The transition RPCs
-- are the only way a row moves after it is claimed; the trigger is what stops
-- anything ELSE moving it, including a future RPC written by somebody who has
-- not read this file. The checkout operations table has had exactly this pairing
-- since 20260816054500 and the ledger shipped without it.
--
-- WHY 'provider_accepted' IS NOT 'activated'. Stripe accepting the price change
-- means the customer is COMMITTED to the new price, not that they have PAID for
-- it. proration_behavior 'always_invoice' with the default payment_behavior of
-- allow_incomplete applies the change and leaves the proration invoice `open` if
-- collection fails -- Stripe does not throw. So the caller must read
-- latest_invoice and record its id here, and only the projector, seeing that
-- specific invoice paid, may move the row to 'activated'. Anything that treats
-- provider acceptance as activation hands over the new plan's limits on the
-- strength of the old plan's payment.

begin;

do $$
begin
  if to_regprocedure('public.claim_stripe_billing_subscription_plan_change(uuid, text, text, text, text, boolean, text, text, text, text, text, bigint, text, text, text, uuid, text, text)') is null then
    raise exception '20260823220000 has not been applied; there is no claim to transition from';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. The ledger is append-mostly and its binding is immutable.
-- ---------------------------------------------------------------------------
create or replace function public.protect_billing_subscription_plan_change_operation()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'pg_temp'
as $fn$
begin
  if tg_op = 'DELETE' then
    -- The consent acceptance it references is itself undeletable, and this row
    -- is the evidence that a specific human agreed to a specific recurring
    -- amount. Deleting it would leave the acceptance orphaned and the charge
    -- unexplained.
    raise exception 'plan-change operation rows cannot be deleted' using errcode = '42501';
  end if;

  if old.account_id is distinct from new.account_id
     or old.operation_id is distinct from new.operation_id
     or old.purpose is distinct from new.purpose
     or old.provider is distinct from new.provider
     or old.livemode is distinct from new.livemode
     or old.provider_subscription_id is distinct from new.provider_subscription_id
     or old.provider_subscription_item_id is distinct from new.provider_subscription_item_id
     or old.from_plan_code is distinct from new.from_plan_code
     or old.from_billing_interval is distinct from new.from_billing_interval
     or old.plan_code is distinct from new.plan_code
     or old.billing_interval is distinct from new.billing_interval
     or old.catalog_version is distinct from new.catalog_version
     or old.stripe_price_id is distinct from new.stripe_price_id
     or old.stripe_product_id is distinct from new.stripe_product_id
     or old.currency is distinct from new.currency
     or old.unit_amount_cents is distinct from new.unit_amount_cents
     or old.terms_version is distinct from new.terms_version
     or old.recurring_consent_version is distinct from new.recurring_consent_version
     or old.recurring_consent_text_sha256 is distinct from new.recurring_consent_text_sha256
     or old.recurring_consent_acceptance_id is distinct from new.recurring_consent_acceptance_id
     or old.recurring_consent_accepted_by is distinct from new.recurring_consent_accepted_by
     or old.recurring_consent_accepted_at is distinct from new.recurring_consent_accepted_at
     or old.stripe_idempotency_key is distinct from new.stripe_idempotency_key
     or old.request_fingerprint is distinct from new.request_fingerprint
     or old.created_at is distinct from new.created_at then
    raise exception 'plan-change operation binding is immutable' using errcode = '22000';
  end if;

  -- Once Stripe has named the invoice the proration was billed on, that is the
  -- invoice payment evidence binds to. Letting it be rewritten would let a later
  -- write point activation at a DIFFERENT invoice -- for instance an already-paid
  -- renewal -- which is precisely the hazard proration_invoice_id exists to close.
  if old.proration_invoice_id is not null
     and old.proration_invoice_id is distinct from new.proration_invoice_id then
    raise exception 'the proration invoice is immutable once assigned' using errcode = '22000';
  end if;

  if new.attempt_count < old.attempt_count then
    raise exception 'plan-change attempt count cannot decrease' using errcode = '22000';
  end if;

  if old.state is distinct from new.state then
    if not (
      (old.state = 'submitted' and new.state in ('provider_accepted', 'indeterminate', 'abandoned'))
      -- Reconciliation only. An indeterminate row is one where LGQ does not know
      -- whether Stripe applied the change, so it must be resolvable in both
      -- directions once somebody has looked.
      or (old.state = 'indeterminate' and new.state in ('provider_accepted', 'abandoned'))
      or (old.state = 'provider_accepted' and new.state in ('activated', 'abandoned'))
    ) then
      raise exception 'invalid plan-change state transition: % -> %', old.state, new.state
        using errcode = '22000';
    end if;
  end if;

  new.updated_at := pg_catalog.now();
  return new;
end;
$fn$;

revoke all on function public.protect_billing_subscription_plan_change_operation()
  from public, anon, authenticated, service_role;

create trigger protect_billing_subscription_plan_change_operation_update
  before update on public.billing_subscription_plan_change_operations
  for each row execute function public.protect_billing_subscription_plan_change_operation();

create trigger protect_billing_subscription_plan_change_operation_delete
  before delete on public.billing_subscription_plan_change_operations
  for each row execute function public.protect_billing_subscription_plan_change_operation();

-- ---------------------------------------------------------------------------
-- 2. Stripe accepted the change, and named the invoice.
--
--    p_proration_invoice_id is NULLABLE on purpose: a change that produces no
--    proration line (Stripe can decline to invoice a zero-value change) has no
--    invoice, and forcing one would make the caller invent an id. A NULL here
--    means "no proration was billed", which the projector must treat as
--    'nothing to collect', never as 'collected'.
-- ---------------------------------------------------------------------------
create or replace function public.mark_stripe_billing_subscription_plan_change_accepted(
  p_operation_pk uuid,
  p_claim_token uuid,
  p_proration_invoice_id text
)
returns boolean
language plpgsql
security definer
set search_path to 'pg_catalog', 'pg_temp'
as $fn$
declare
  v_updated integer;
begin
  if p_operation_pk is null or p_claim_token is null then
    raise exception 'plan-change acceptance requires its operation and claim token'
      using errcode = '22023';
  end if;
  if p_proration_invoice_id is not null
     and (p_proration_invoice_id !~ '^in_[A-Za-z0-9]{8,}$'
          or pg_catalog.length(p_proration_invoice_id) > 255) then
    raise exception 'invalid proration invoice id' using errcode = '22023';
  end if;

  -- Compare-and-set on the claim token: only the caller that claimed this row
  -- may resolve it, so a stale retry from an earlier attempt cannot overwrite a
  -- newer outcome.
  update public.billing_subscription_plan_change_operations
     set state = 'provider_accepted',
         claim_token = null,
         proration_invoice_id = p_proration_invoice_id,
         provider_applied_at = pg_catalog.now()
   where id = p_operation_pk
     and claim_token = p_claim_token
     and state = 'submitted';
  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 3. The Stripe outcome is unknown.
--
--    NOT a failure. This is the state where LGQ must not retry, because a retry
--    could apply the change twice, and must not report success, because it may
--    not have applied at all. It is reconciliation-only by design.
-- ---------------------------------------------------------------------------
create or replace function public.mark_stripe_billing_subscription_plan_change_indeterminate(
  p_operation_pk uuid,
  p_claim_token uuid,
  p_last_error text
)
returns boolean
language plpgsql
security definer
set search_path to 'pg_catalog', 'pg_temp'
as $fn$
declare
  v_updated integer;
begin
  if p_operation_pk is null or p_claim_token is null
     or p_last_error is null or pg_catalog.length(pg_catalog.btrim(p_last_error)) = 0 then
    raise exception 'an indeterminate plan change must record why' using errcode = '22023';
  end if;

  update public.billing_subscription_plan_change_operations
     set state = 'indeterminate',
         claim_token = null,
         last_error = pg_catalog.left(p_last_error, 2000)
   where id = p_operation_pk
     and claim_token = p_claim_token
     and state = 'submitted';
  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 4. Stripe refused, permanently.
--
--    Reachable from 'submitted' and from 'indeterminate' -- the second is the
--    reconciliation path, where somebody has since established that nothing was
--    applied. It sets resolved_at, which releases
--    billing_plan_change_one_in_flight_per_account so the customer can try
--    again rather than being locked out by a failure that was not theirs.
-- ---------------------------------------------------------------------------
create or replace function public.abandon_stripe_billing_subscription_plan_change(
  p_operation_pk uuid,
  p_claim_token uuid,
  p_last_error text
)
returns boolean
language plpgsql
security definer
set search_path to 'pg_catalog', 'pg_temp'
as $fn$
declare
  v_updated integer;
begin
  if p_operation_pk is null
     or p_last_error is null or pg_catalog.length(pg_catalog.btrim(p_last_error)) = 0 then
    raise exception 'an abandoned plan change must record why' using errcode = '22023';
  end if;

  update public.billing_subscription_plan_change_operations
     set state = 'abandoned',
         claim_token = null,
         resolved_at = pg_catalog.now(),
         last_error = pg_catalog.left(p_last_error, 2000)
   where id = p_operation_pk
     and state in ('submitted', 'indeterminate')
     -- From 'submitted' the token must match: that row is still owned by a live
     -- attempt. From 'indeterminate' there is no token left to match, and the
     -- caller is an operator resolving it after the fact.
     and (
       (state = 'submitted' and claim_token = p_claim_token)
       or (state = 'indeterminate' and p_claim_token is null)
     );
  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 5. Grants. service_role only; `anon` named because the default ACL grants it.
-- ---------------------------------------------------------------------------
do $$
declare
  v_sig text;
begin
  foreach v_sig in array array[
    'public.mark_stripe_billing_subscription_plan_change_accepted(uuid, uuid, text)',
    'public.mark_stripe_billing_subscription_plan_change_indeterminate(uuid, uuid, text)',
    'public.abandon_stripe_billing_subscription_plan_change(uuid, uuid, text)'
  ] loop
    execute pg_catalog.format('revoke all on function %s from public, anon, authenticated, service_role', v_sig);
    execute pg_catalog.format('grant execute on function %s to service_role', v_sig);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Post-conditions.
-- ---------------------------------------------------------------------------
do $$
declare
  v_sig text;
begin
  foreach v_sig in array array[
    'public.mark_stripe_billing_subscription_plan_change_accepted(uuid, uuid, text)',
    'public.mark_stripe_billing_subscription_plan_change_indeterminate(uuid, uuid, text)',
    'public.abandon_stripe_billing_subscription_plan_change(uuid, uuid, text)',
    'public.protect_billing_subscription_plan_change_operation()'
  ] loop
    if pg_catalog.has_function_privilege('anon', v_sig, 'EXECUTE')
       or pg_catalog.has_function_privilege('authenticated', v_sig, 'EXECUTE') then
      raise exception 'anon or authenticated can execute %', v_sig;
    end if;
  end loop;

  -- The trigger function itself must be executable by nobody: it runs as the
  -- trigger owner, and a direct grant would let a caller invoke it out of band.
  if pg_catalog.has_function_privilege('service_role', 'public.protect_billing_subscription_plan_change_operation()', 'EXECUTE') then
    raise exception 'service_role can execute the protection trigger function directly';
  end if;

  if (select count(*) from pg_catalog.pg_trigger t
       where t.tgrelid = 'public.billing_subscription_plan_change_operations'::regclass
         and not t.tgisinternal
         and t.tgenabled = 'O') <> 2 then
    raise exception 'the plan-change ledger does not carry exactly two enabled protection triggers';
  end if;
end $$;

commit;
