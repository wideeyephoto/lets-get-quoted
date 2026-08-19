-- Let a workspace that is behind on its own subscription still get paid.
--
-- WHY. The subscription projector maps a past_due Stripe subscription to
-- entitlement_state 'grace' (20260816060000:1005-1009), and every entrance to
-- the direct-payment rail requires 'active':
--
--   if not v_entitlement_is_current then
--     raise exception 'direct payment requires the exact canonical active workspace entitlement'
--       using errcode = '55000';
--
-- So the moment a contractor's card fails, they lose the ability to collect
-- money from their own customers -- which is the single thing most likely to let
-- them fix the failed card. They are not told why; a 55000 reaches the UI as a
-- generic failure. `grace` reads like the forgiving state and behaves as the
-- harshest one: meanwhile the crew and office seat gates refuse only on
-- 'archived', so the same workspace carries on adding seats it cannot pay for.
--
-- WHAT CHANGES. Two conditions, in the four functions that guard this rail:
--
--   entitlement_state <> 'active'      ->  not in ('active', 'grace')
--   billing_status = 'active' AND      ->  that, OR billing_status = 'past_due'
--     period_start/period_end current
--
-- The period test is deliberately NOT required of a past_due workspace. Whether
-- Stripe has advanced current_period_end by the time an invoice fails is a
-- provider detail, and hanging a contractor's ability to invoice on it would
-- reintroduce the same defect through a narrower door.
--
-- WHAT DOES NOT CHANGE, and why this is not simply "loosen the guard". These
-- checks exist to prove the fee frozen onto a payment is the canonical one for
-- the plan. Both parts of that survive untouched: catalog_version must still be
-- current, and platform_fee_bps must still equal the rate the plan_code sells
-- at. A workspace in grace is still on its plan and still owes the same rate --
-- which is exactly why its fee snapshot is safe to take. 'restricted' and
-- 'archived' remain blocked: those mean the subscription ended, not that a
-- payment failed.
--
-- LATENT, NOT LIVE. Reaching 'grace' requires the subscription projection
-- worker, whose flag is absent from Production, and a Flex workspace cannot
-- reach it at all (billing_status 'free'). This arms itself the day base plans
-- go on sale, which is why it is fixed now rather than then.
--
-- HOW. Each function is patched from its own live source, the house pattern --
-- see 20260818200000_scale_entitlement_limits_catalog_drift.sql. A session-local
-- helper does the read/assert/replace/execute so that six patches read as six
-- lines rather than six copies of the same twenty.
--
-- The anchors deliberately exclude the catalog_version line. 20260818120000
-- rewrote that literal in every function body, so the live source says
-- '2026-08-18-preview' while this repository still says '2026-08-15-preview';
-- an anchor spanning it would match nothing on a real database and everything
-- on a fresh one.

begin;

create or replace function pg_temp.patch_source(
  p_name text,
  p_old text,
  p_new text
)
returns void
language plpgsql
as $helper$
declare
  v_oid pg_catalog.oid;
  v_before text;
  v_old text := p_old;
  v_new text := p_new;
  v_hits integer;
begin
  -- Resolved by NAME, not by signature. These four have been dropped, renamed
  -- and recreated across four migrations, and a guessed argument list is a
  -- silent no-match rather than an error worth reading.
  select p.oid into v_oid
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = p_name;
  if not found then
    raise exception 'no public function named %', p_name using errcode = '55000';
  end if;
  if (select pg_catalog.count(*) from pg_catalog.pg_proc p
        join pg_catalog.pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = p_name) <> 1 then
    raise exception '% is overloaded; patching it by name is ambiguous', p_name
      using errcode = '55000';
  end if;

  v_before := pg_catalog.pg_get_functiondef(v_oid);

  -- Compare on LF alone, on both sides: stored bodies here have held a mix of
  -- CRLF and LF, and this file's endings depend on how it reached the server.
  v_before := pg_catalog.replace(v_before, pg_catalog.chr(13) || pg_catalog.chr(10), pg_catalog.chr(10));
  v_old := pg_catalog.replace(v_old, pg_catalog.chr(13) || pg_catalog.chr(10), pg_catalog.chr(10));
  v_new := pg_catalog.replace(v_new, pg_catalog.chr(13) || pg_catalog.chr(10), pg_catalog.chr(10));

  -- Already applied.
  if pg_catalog.strpos(v_before, v_new) > 0 then
    return;
  end if;

  v_hits := (pg_catalog.length(v_before) - pg_catalog.length(pg_catalog.replace(v_before, v_old, '')))
            / pg_catalog.length(v_old);
  if v_hits <> 1 then
    raise exception 'expected exactly one match in %, found %', p_name, v_hits
      using errcode = '55000';
  end if;

  execute pg_catalog.replace(v_before, v_old, v_new);
end
$helper$;

do $mig$
declare
  -- The state test, in the three functions that spell it as a refusal.
  v_state_old text := $a$     or v_entitlement.entitlement_state <> 'active'$a$;
  v_state_new text := $a$     or v_entitlement.entitlement_state not in ('active', 'grace')$a$;

  -- The same test inside prepare_one_off_direct_invoice_payment_v1_fresh_only,
  -- where it is spelled as an assertion rather than a refusal.
  v_fresh_old text := $b$    v_entitlement.entitlement_state = 'active'$b$;
  v_fresh_new text := $b$    v_entitlement.entitlement_state in ('active', 'grace')$b$;

  -- The paid-plan coherence branch, at the two indentations it appears at.
  v_paid9_old text := $c$         and v_entitlement.billing_status = 'active'
         and v_entitlement.period_start is not null
         and v_entitlement.period_end > pg_catalog.now())$c$;
  v_paid9_new text := $c$         and (
           (v_entitlement.billing_status = 'active'
             and v_entitlement.period_start is not null
             and v_entitlement.period_end > pg_catalog.now())
           or v_entitlement.billing_status = 'past_due'
         ))$c$;

  v_paid8_old text := $d$        and v_entitlement.billing_status = 'active'
        and v_entitlement.period_start is not null
        and v_entitlement.period_end > pg_catalog.now())$d$;
  v_paid8_new text := $d$        and (
          (v_entitlement.billing_status = 'active'
            and v_entitlement.period_start is not null
            and v_entitlement.period_end > pg_catalog.now())
          or v_entitlement.billing_status = 'past_due'
        ))$d$;
begin
  -- 1. The snapshot guard every direct checkout passes through.
  perform pg_temp.patch_source(
    'require_direct_checkout_entitlement_snapshot',
    v_state_old, v_state_new);
  perform pg_temp.patch_source(
    'require_direct_checkout_entitlement_snapshot',
    v_paid9_old, v_paid9_new);

  -- 2. The original preparer, renamed by 20260816161844 and still reachable.
  perform pg_temp.patch_source(
    'prepare_one_off_direct_invoice_payment_v1_fresh_only',
    v_fresh_old, v_fresh_new);
  perform pg_temp.patch_source(
    'prepare_one_off_direct_invoice_payment_v1_fresh_only',
    v_paid8_old, v_paid8_new);

  -- 3. The current preparer. Its guard compares the frozen fee against the
  --    entitlement and carries no period test, so only the state moves.
  perform pg_temp.patch_source(
    'prepare_one_off_direct_invoice_payment',
    v_state_old, v_state_new);

  -- 4. Claiming the checkout operation, the first thing a payment attempt does.
  perform pg_temp.patch_source(
    'claim_one_off_direct_checkout_operation',
    v_state_old, v_state_new);
  perform pg_temp.patch_source(
    'claim_one_off_direct_checkout_operation',
    v_paid9_old, v_paid9_new);
end
$mig$;

-- Prove it, on the two things that must be true together: grace may collect,
-- and the fee contract did not move.
do $verify$
declare
  v_name text;
  v_src text;
begin
  foreach v_name in array array[
    'require_direct_checkout_entitlement_snapshot',
    'prepare_one_off_direct_invoice_payment_v1_fresh_only',
    'prepare_one_off_direct_invoice_payment',
    'claim_one_off_direct_checkout_operation'
  ]
  loop
    select pg_catalog.replace(
             pg_catalog.pg_get_functiondef(p.oid),
             pg_catalog.chr(13) || pg_catalog.chr(10), pg_catalog.chr(10))
      into v_src
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = v_name;

    if pg_catalog.strpos(v_src, $q$entitlement_state <> 'active'$q$) > 0
       or pg_catalog.strpos(v_src, $q$entitlement_state = 'active'$q$) > 0 then
      raise exception '% still refuses a workspace in grace', v_name using errcode = '55000';
    end if;

    -- The fee contract is the reason these guards exist. If a patch had eaten
    -- it, this migration would have turned a payment-blocking bug into a
    -- fee-mispricing one, which is far worse and much quieter.
    if pg_catalog.strpos(v_src, 'platform_fee_bps') = 0 then
      raise exception '% no longer checks the platform fee', v_name using errcode = '55000';
    end if;
    if pg_catalog.strpos(v_src, 'catalog_version') = 0 then
      raise exception '% no longer checks the catalog version', v_name using errcode = '55000';
    end if;

    -- And the states that mean the subscription ENDED stay out.
    if pg_catalog.strpos(v_src, $q$('active', 'grace')$q$) = 0 then
      raise exception '% does not name the states it accepts', v_name using errcode = '55000';
    end if;
    if pg_catalog.strpos(v_src, $q$'restricted'$q$) > 0 then
      raise exception '% mentions restricted, which this change never intended to admit', v_name
        using errcode = '55000';
    end if;
  end loop;
end;
$verify$;

commit;
