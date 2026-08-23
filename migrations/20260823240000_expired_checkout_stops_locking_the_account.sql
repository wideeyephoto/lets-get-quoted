-- An abandoned Checkout stops locking a workspace out of ever subscribing.
--
-- WHAT HAPPENED. On 2026-08-23 a browser agent opened the live base-plan
-- checkout for account `100021` and did not complete it. The rail writes its
-- durable row BEFORE calling Stripe, so a `checkout_created` row was left
-- behind. `billing_subscription_checkout_one_pending_per_account` is a partial
-- unique over (account_id) where state is one of claimed / submitted /
-- checkout_created / indeterminate, and
-- `claim_stripe_billing_subscription_checkout` returns `pending_conflict` for
-- ANY row in those states:
--
--     select o.* into v_operation ... where o.account_id = p_account_id
--       and o.state in ('claimed','submitted','checkout_created','indeterminate')
--     if found then return query select 'pending_conflict' ...
--
-- There is no expiry test in that branch. `checkout_expires_at` passing changes
-- nothing, and no sweeper exists: `checkout.session.expired` is handled on the
-- legacy and connected rails but not this one, and it is not even among the 18
-- events the billing endpoint subscribes to. The only thing that moves a row out
-- of `checkout_created` is the projector seeing `incomplete_expired`, which
-- needs a Subscription that an abandoned Session never created.
--
-- So the workspace was permanently unable to subscribe. Nothing self-heals, and
-- the only visible trace is an "unresolved operation" row in an admin list that
-- reports it and cannot resolve it.
--
-- This is not a rehearsal artifact. Every real customer who opens checkout and
-- closes the tab hits it, and the failure is silent and total: the button simply
-- never works again for them.
--
-- THE FIX. A new claim supersedes an operation whose Checkout Session has
-- expired, marking it `expired` and proceeding to write a fresh row. Chosen over
-- a sweeper because it needs no new cron, no new event subscription, and repairs
-- rows that already exist the moment somebody tries again -- including the one
-- this incident created.
--
-- THE FIVE-MINUTE GRACE IS NOT PADDING. A Session can be paid moments before it
-- expires, and its `customer.subscription.created` / `invoice.paid` events then
-- arrive slightly after. Superseding on the exact expiry instant could mark a
-- PAID operation expired while its projection is still in flight, and the
-- projector would then refuse to activate it -- 'terminal Checkout operation
-- cannot activate a subscription'. That converts a successful purchase into a
-- dead letter, which is far worse than the lockout being cleared a few minutes
-- late. Do not tighten this to zero.
--
-- Only `checkout_created` is superseded. `claimed` and `submitted` are in-flight
-- states with their own lease handling above; `indeterminate` means LGQ does not
-- know whether Stripe created the Session, and guessing there could abandon a
-- real one. Those stay conflicts, deliberately.
--
-- Source patch against the installed body; no file here states the live text.
-- Line endings normalised before matching.

begin;

-- ---------------------------------------------------------------------------
-- 0. The transition this relies on must be legal.
-- ---------------------------------------------------------------------------
do $$
declare
  v_trigger text;
begin
  select pg_catalog.replace(pg_catalog.pg_get_functiondef(p.oid), E'\r\n', E'\n')
    into v_trigger
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.prokind = 'f'
     and p.proname = 'protect_billing_subscription_checkout_operation';
  if v_trigger is null then
    raise exception 'the Checkout operation protection trigger is missing';
  end if;
  if pg_catalog.strpos(
       v_trigger,
       E'old.state in (''checkout_created'', ''indeterminate'')\n         and new.state in (''activated'', ''expired'', ''canceled'')'
     ) = 0 then
    raise exception 'the trigger no longer allows checkout_created -> expired';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Supersede an expired Checkout instead of conflicting with it.
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
     and p.proname = 'claim_stripe_billing_subscription_checkout';
  if v_def is null then
    raise exception 'the subscription Checkout claim function was not found';
  end if;

  -- Already applied. Safe to re-run.
  if pg_catalog.strpos(v_def, 'supersede an expired Checkout') > 0 then
    return;
  end if;

  v_before := E'   for update;\n  if found then\n    return query select\n'
    || E'      ''pending_conflict''::text,\n';
  v_after := E'   for update;\n'
    || E'  -- supersede an expired Checkout rather than conflict with it forever.\n'
    || E'  -- The five minutes are load-bearing: a Session paid just before expiry\n'
    || E'  -- lands its events just after, and marking that operation expired would\n'
    || E'  -- make the projector refuse to activate a purchase that succeeded.\n'
    || E'  if found\n'
    || E'     and v_operation.state = ''checkout_created''\n'
    || E'     and v_operation.checkout_expires_at is not null\n'
    || E'     and v_operation.checkout_expires_at < pg_catalog.now() - interval ''5 minutes'' then\n'
    || E'    update public.billing_subscription_checkout_operations o\n'
    || E'       set state = ''expired'',\n'
    || E'           resolved_at = pg_catalog.now(),\n'
    || E'           updated_at = pg_catalog.now()\n'
    || E'     where o.id = v_operation.id;\n'
    || E'  elsif found then\n'
    || E'    return query select\n'
    || E'      ''pending_conflict''::text,\n';
  v_hits := (pg_catalog.length(v_def) - pg_catalog.length(pg_catalog.replace(v_def, v_before, '')))
            / pg_catalog.length(v_before);
  if v_hits <> 1 then
    raise exception 'the pending-conflict branch matched % times, expected exactly 1', v_hits;
  end if;
  v_def := pg_catalog.replace(v_def, v_before, v_after);

  execute v_def;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Post-conditions, read from the live body.
--    prokind = 'f' is not decoration: pg_get_functiondef raises 42809 on an
--    aggregate, and an unfiltered scan here rolls the whole migration back.
-- ---------------------------------------------------------------------------
do $$
declare
  v_def text;
begin
  select pg_catalog.replace(pg_catalog.pg_get_functiondef(p.oid), E'\r\n', E'\n')
    into v_def
    from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind = 'f'
     and p.proname = 'claim_stripe_billing_subscription_checkout';

  if pg_catalog.strpos(v_def, E'v_operation.state = ''checkout_created''') = 0
     or pg_catalog.strpos(v_def, E'v_operation.checkout_expires_at < pg_catalog.now() - interval ''5 minutes''') = 0 then
    raise exception 'an expired Checkout still locks the account out';
  end if;

  -- The grace period, specifically. Tightening it to zero turns a purchase that
  -- succeeded moments before expiry into a dead letter.
  if pg_catalog.strpos(v_def, E'- interval ''5 minutes''') = 0 then
    raise exception 'the supersede grace period is gone';
  end if;

  -- ONLY checkout_created. claimed and submitted are in flight and have their
  -- own lease handling; indeterminate means we do not know whether a Session
  -- exists, and abandoning a real one is worse than the conflict.
  if pg_catalog.strpos(v_def, E'v_operation.state in (''claimed'', ''submitted'')') > 0 then
    raise exception 'the supersede reaches states it must not';
  end if;

  -- A live, unexpired operation must still conflict. Without this the whole
  -- one-pending invariant is gone and a workspace could run two checkouts.
  if pg_catalog.strpos(v_def, E'''pending_conflict''::text') = 0 then
    raise exception 'the pending-conflict branch was removed rather than narrowed';
  end if;

  -- Untouched neighbours: consent single-use and the immutable-input replay
  -- check are what stop a superseding claim laundering someone else's evidence.
  if pg_catalog.strpos(v_def, 'recurring consent evidence was already used by another operation') = 0
     or pg_catalog.strpos(v_def, 'operation ID was already claimed with different immutable subscription input') = 0 then
    raise exception 'the claim lost its consent or immutability guards';
  end if;
end $$;

commit;
