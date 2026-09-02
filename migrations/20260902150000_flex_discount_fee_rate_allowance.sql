-- Migration: 20260902150000_flex_discount_fee_rate_allowance.sql
-- Purpose: Allow Flex platform fee rate to be 75 bps (0.75%) for Friends & Family discount workspaces.
--
-- Background:
-- By default, Flex workspaces carry a 125 bps (1.25%) platform fee rate.
-- Payment preparation, checkout claims, and settlement functions fail closed if
-- the workspace's stored platform_fee_bps deviates from the canonical catalog rate.
--
-- This migration surgically patches the 4 direct payment stored procedures so that
-- a Flex workspace with platform_fee_bps = 75 is recognized as an authorized
-- fee snapshot, while still failing closed against any other arbitrary rate.

begin;

-- 1. prepare_one_off_direct_invoice_payment
do $$
declare
  v_before text;
  v_after text;
  v_old text := $needle$  v_expected_bps := case v_entitlement.plan_code
    when 'flex' then 125$needle$;
  v_new text := $replacement$  v_expected_bps := case v_entitlement.plan_code
    when 'flex' then case when v_entitlement.platform_fee_bps = 75 then 75 else 125 end$replacement$;
begin
  v_before := pg_catalog.pg_get_functiondef(
    'public.prepare_one_off_direct_invoice_payment(uuid, uuid, uuid, uuid)'::pg_catalog.regprocedure
  );
  if pg_catalog.length(v_before)
       - pg_catalog.length(pg_catalog.replace(v_before, v_old, ''))
       is distinct from pg_catalog.length(v_old) then
    raise exception 'prepare_one_off_direct_invoice_payment Flex fee patch did not match exactly once'
      using errcode = '55000';
  end if;
  v_after := pg_catalog.replace(v_before, v_old, v_new);
  execute v_after;
end
$$;

-- 2. claim_one_off_direct_checkout_operation
do $$
declare
  v_before text;
  v_after text;
  v_old text := $needle$  v_expected_bps := case v_entitlement.plan_code
    when 'flex' then 125$needle$;
  v_new text := $replacement$  v_expected_bps := case v_entitlement.plan_code
    when 'flex' then case when v_entitlement.platform_fee_bps = 75 then 75 else 125 end$replacement$;
begin
  v_before := pg_catalog.pg_get_functiondef(
    'public.claim_one_off_direct_checkout_operation(uuid, uuid, text, boolean, integer, uuid, text, text, text, bigint, bigint, bigint, text, text, integer, numeric)'::pg_catalog.regprocedure
  );
  if pg_catalog.length(v_before)
       - pg_catalog.length(pg_catalog.replace(v_before, v_old, ''))
       is distinct from pg_catalog.length(v_old) then
    raise exception 'claim_one_off_direct_checkout_operation Flex fee patch did not match exactly once'
      using errcode = '55000';
  end if;
  v_after := pg_catalog.replace(v_before, v_old, v_new);
  execute v_after;
end
$$;

-- 3. enqueue_one_off_direct_payment_settlement
do $$
declare
  v_before text;
  v_after text;
  v_old text := $needle$  v_expected_bps := case new.fee_plan_code
    when 'flex' then 125$needle$;
  v_new text := $replacement$  v_expected_bps := case new.fee_plan_code
    when 'flex' then case when new.fee_rate_bps = 75 then 75 else 125 end$replacement$;
begin
  v_before := pg_catalog.pg_get_functiondef(
    'public.enqueue_one_off_direct_payment_settlement()'::pg_catalog.regprocedure
  );
  if pg_catalog.length(v_before)
       - pg_catalog.length(pg_catalog.replace(v_before, v_old, ''))
       is distinct from pg_catalog.length(v_old) then
    raise exception 'enqueue_one_off_direct_payment_settlement Flex fee patch did not match exactly once'
      using errcode = '55000';
  end if;
  v_after := pg_catalog.replace(v_before, v_old, v_new);
  execute v_after;
end
$$;

-- 4. enqueue_one_off_direct_payment_late_success_settlement
do $$
declare
  v_before text;
  v_after text;
  v_old text := $needle$  v_expected_bps := case p_new.fee_plan_code
    when 'flex' then 125$needle$;
  v_new text := $replacement$  v_expected_bps := case p_new.fee_plan_code
    when 'flex' then case when p_new.fee_rate_bps = 75 then 75 else 125 end$replacement$;
begin
  v_before := pg_catalog.pg_get_functiondef(
    'public.enqueue_one_off_direct_payment_late_success_settlement(public.payments, public.payments, uuid)'::pg_catalog.regprocedure
  );
  if pg_catalog.length(v_before)
       - pg_catalog.length(pg_catalog.replace(v_before, v_old, ''))
       is distinct from pg_catalog.length(v_old) then
    raise exception 'enqueue_one_off_direct_payment_late_success_settlement Flex fee patch did not match exactly once'
      using errcode = '55000';
  end if;
  v_after := pg_catalog.replace(v_before, v_old, v_new);
  execute v_after;
end
$$;

commit;
