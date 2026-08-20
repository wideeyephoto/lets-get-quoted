-- Never let Stripe compute the platform fee refund.
--
-- THE FUNCTION IS `compute_direct_charge_refund_plan`, which is where the mode
-- is decided -- not `plan_direct_charge_refund_operation`, which calls it. Worth
-- naming, because the two sit 300 lines apart in one migration and the obvious
-- guess is the wrong one.
--
-- THE BUG. The refund planner chooses `full_combined` whenever this refund
-- brings the total refunded up to the whole charge:
--
--   when v_gross_after = v_gross_total and v_eligible_after = v_eligible_total
--        and v_fee_after > v_fee_before then 'full_combined'
--
-- It does not require that nothing was refunded BEFORE. So a partial refund
-- followed by a refund of the remainder takes the `full_combined` path -- and
-- that path is the one where LGQ stops doing the arithmetic.
--
-- `direct-refund-operation.ts` builds `full_combined` by OMITTING the amount and
-- setting `refund_application_fee: true`. Both halves are then Stripe's
-- judgement: it refunds the remaining charge, and it decides the Application Fee
-- refund itself, proportionally to the CHARGE amount.
--
-- LGQ's platform fee is not a proportion of the charge. It is a percentage of
-- the ELIGIBLE SERVICE SUBTOTAL -- tax, tips, Stripe fees and credits are
-- excluded, which the pricing page states plainly. On a charge carrying tax, the
-- proportion of the gross and the proportion of the eligible subtotal are
-- different numbers, and after a partial refund they diverge further because
-- what was already refunded may have been mostly tax or mostly service.
--
-- `record_direct_charge_refund_result` checks the amount, the charge and the
-- payment intent, and never the fee actually returned; `apply_direct_refund_
-- accounting` then writes the PLANNED `platform_fee_refunded`. So the ledger
-- records what LGQ intended and Stripe did something else, and nothing compares
-- them. That is the only place in this repo where real money moves by a wrong
-- amount with nothing noticing.
--
-- THE FIX IS TO NARROW, NOT TO CALCULATE. `full_combined` stays for what it was
-- for -- one refund, of everything, on an untouched charge -- where Stripe's
-- proportion and LGQ's are the same number because both are 100%. Every other
-- shape becomes `split`, which sends an exact charge amount and an exact
-- Application Fee amount that LGQ computed from the eligible subtotal. Nothing
-- about the split path changes; it was always correct and is now simply used
-- more often.
--
-- PATCHED FROM LIVE SOURCE, not replaced. 20260819060000 records why: eleven
-- functions in this tree were rewritten by text replacement, and recreating one
-- from repo source re-pins an old catalog version and breaks payment
-- preparation. The anchor is asserted to appear exactly once first.

begin;

do $patch$
declare
  v_name text := 'public.compute_direct_charge_refund_plan';
  v_def text;
  v_anchor text :=
    '  v_mode := case'
    || pg_catalog.chr(10) || '    when v_gross_after = v_gross_total'
    || pg_catalog.chr(10) || '      and v_eligible_after = v_eligible_total'
    || pg_catalog.chr(10) || '      and v_fee_after > v_fee_before'
    || pg_catalog.chr(10) || '    then ''full_combined''';
  v_replacement text :=
    '  v_mode := case'
    || pg_catalog.chr(10) || '    when v_gross_before = 0'
    || pg_catalog.chr(10) || '      and v_gross_after = v_gross_total'
    || pg_catalog.chr(10) || '      and v_eligible_after = v_eligible_total'
    || pg_catalog.chr(10) || '      and v_fee_after > v_fee_before'
    || pg_catalog.chr(10) || '    then ''full_combined''';
  v_hits integer;
begin
  -- The signature is not knowable from the repo alone: find it by name.
  select pg_catalog.pg_get_functiondef(p.oid) into v_def
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'compute_direct_charge_refund_plan'
  limit 1;

  if v_def is null then
    raise exception 'compute_direct_charge_refund_plan was not found; nothing to patch';
  end if;

  -- Already narrowed. Idempotent rather than raising: migrations get replayed.
  if pg_catalog.strpos(v_def, 'when v_gross_before = 0') > 0 then
    return;
  end if;

  v_hits := (pg_catalog.length(v_def) - pg_catalog.length(
    pg_catalog.replace(v_def, v_anchor, '')
  )) / pg_catalog.length(v_anchor);

  if v_hits <> 1 then
    raise exception
      'the refund-mode anchor appears % times, expected exactly 1 -- the function has drifted', v_hits;
  end if;

  execute pg_catalog.replace(v_def, v_anchor, v_replacement);
  perform v_name;
end;
$patch$;

do $post$
declare
  v_def text;
begin
  select pg_catalog.pg_get_functiondef(p.oid) into v_def
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'compute_direct_charge_refund_plan'
  limit 1;

  if v_def is null then
    raise exception 'compute_direct_charge_refund_plan disappeared during the patch';
  end if;

  if pg_catalog.strpos(v_def, 'when v_gross_before = 0') = 0 then
    raise exception 'the refund planner still allows full_combined after a partial refund';
  end if;

  -- The split path must be untouched. It is the one that sends exact amounts,
  -- and this migration works by using it MORE, not by changing it.
  if pg_catalog.strpos(v_def, '''split''') = 0 then
    raise exception 'the split refund mode is gone; this patch removed more than it should have';
  end if;

  -- And the fee must still be forbidden from moving backwards. That guard is
  -- what stops a refund plan claiming to return a fee that was never taken.
  if pg_catalog.strpos(v_def, 'Application Fee target cannot move backward') = 0 then
    raise exception 'the fee-monotonicity guard was lost in the patch';
  end if;
end $post$;

commit;
