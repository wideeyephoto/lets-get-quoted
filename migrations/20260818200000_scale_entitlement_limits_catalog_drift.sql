-- Let a Scale subscription activate at the allowances Scale actually sells.
--
-- WHY. project_stripe_billing_subscription_event_v1_unchecked does not trust its
-- caller's feature_limits. It recomputes them from a hardcoded per-plan table and
-- refuses the whole projection if the two disagree:
--
--   if ... p_projection -> 'feature_limits' is distinct from v_expected_feature_limits ...
--     raise exception 'Stripe Billing projection does not match the canonical catalog'
--
-- That check is correct and worth keeping -- it is what stops a caller inventing
-- an entitlement. But its copy of the catalog never followed commit 7dc8f96a,
-- "Give Scale more than Growth, at catalog 2026-08-18-preview", which raised four
-- Scale allowances in src/lib/billing/catalog.ts and left this function behind.
--
-- So the two disagree on every Scale projection:
--
--   office_users        catalog 15, here 5
--   crew_users          catalog 50, here 10
--   storage_gb          catalog 250, here 100
--   forwarding_minutes  catalog 200, here 100
--
-- A paying Scale subscriber's activation raises 22000 and dead-letters. They are
-- charged and never entitled. Solo and Growth were checked field by field and
-- match, so this is the only branch that drifted -- which is exactly what a
-- change that raised only Scale would produce.
--
-- It is unreachable today because both LGQ_BASE_PLAN_SUBSCRIPTION_CHECKOUT_ENABLED
-- and the subscription projection worker are off. It is fixed now rather than at
-- go-live because the failure is silent at the moment of sale and only visible
-- afterwards, in a dead-lettered row.
--
-- Growth and Scale currently share office_users 5 / crew_users 10 / storage_gb
-- 100 / forwarding_minutes 100 here, so the anchor deliberately spans the whole
-- Scale branch including its voice lines, which are the only text distinguishing
-- it from Growth. A narrower anchor would match twice and the exactly-once
-- assertion below would refuse the migration rather than patch the wrong plan.
--
-- HOW. The function is patched from its own live source rather than retyped, the
-- house pattern -- see 20260818170000_top_up_inbox_ingest_scope.sql. Unlike that
-- one, this replacement does NOT re-include its own anchor, so the needle is gone
-- afterwards; re-running is guarded on the new value instead.

begin;

do $$
declare
  v_before text;
  v_after text;
  v_old text := $needle$
    when 'scale' then pg_catalog.jsonb_build_object(
      'office_users', 5, 'crew_users', 10, 'custom_domain_connections', 1,
      'dedicated_business_numbers', 1, 'storage_gb', 100, 'quickbooks_connections', 1,
      'forwarding_minutes', 100, 'voice_concurrent_calls', 3,
      'voice_history_days', 90, 'voice_included_minutes', 100
    )$needle$;
  v_new text := $replacement$
    when 'scale' then pg_catalog.jsonb_build_object(
      'office_users', 15, 'crew_users', 50, 'custom_domain_connections', 1,
      'dedicated_business_numbers', 1, 'storage_gb', 250, 'quickbooks_connections', 1,
      'forwarding_minutes', 200, 'voice_concurrent_calls', 3,
      'voice_history_days', 90, 'voice_included_minutes', 100
    )$replacement$;
begin
  v_before := pg_catalog.pg_get_functiondef(
    'public.project_stripe_billing_subscription_event_v1_unchecked(uuid,uuid,jsonb)'
      ::pg_catalog.regprocedure
  );

  -- Compare on LF alone, on BOTH sides. Stored bodies here have held a mix of
  -- CRLF and LF (see 20260817120000), and this file's own endings depend on how
  -- it reached the server. Normalising both keeps the exactly-once assertion
  -- meaningful while removing a failure mode that is purely about transport.
  v_before := pg_catalog.replace(v_before, pg_catalog.chr(13) || pg_catalog.chr(10), pg_catalog.chr(10));
  v_old := pg_catalog.replace(v_old, pg_catalog.chr(13) || pg_catalog.chr(10), pg_catalog.chr(10));
  v_new := pg_catalog.replace(v_new, pg_catalog.chr(13) || pg_catalog.chr(10), pg_catalog.chr(10));

  -- Already applied. Keyed on the corrected pair rather than on the anchor,
  -- because this replacement consumes its anchor entirely.
  --
  -- The probe is $probe$-tagged, NOT bare $$. A bare $$ here closes the enclosing
  -- `do $$` body at the first delimiter, and the rest of the block is then parsed
  -- as top-level SQL -- which is a syntax error at the next comma, thousands of
  -- characters from anything that looks wrong. This file did exactly that and
  -- never applied; PostgreSQL 17 found it, reading it twice did not.
  if pg_catalog.strpos(v_before, $probe$'office_users', 15, 'crew_users', 50$probe$) > 0 then
    return;
  end if;

  if pg_catalog.length(v_before)
       - pg_catalog.length(pg_catalog.replace(v_before, v_old, ''))
       is distinct from pg_catalog.length(v_old) then
    raise exception 'Stripe Billing subscription projection Scale limits source contract drifted'
      using errcode = '55000';
  end if;
  v_after := pg_catalog.replace(v_before, v_old, v_new);
  execute v_after;
end
$$;

-- Prove Scale now matches the catalog and that Solo and Growth were not touched.
do $$
declare
  v_source text;
begin
  v_source := pg_catalog.pg_get_functiondef(
    'public.project_stripe_billing_subscription_event_v1_unchecked(uuid,uuid,jsonb)'
      ::pg_catalog.regprocedure
  );
  v_source := pg_catalog.replace(v_source, pg_catalog.chr(13) || pg_catalog.chr(10), pg_catalog.chr(10));

  if v_source not like '%''office_users'', 15, ''crew_users'', 50%'
     or v_source not like '%''storage_gb'', 250%'
     or v_source not like '%''forwarding_minutes'', 200%' then
    raise exception 'Scale entitlement limits were not corrected';
  end if;

  -- Solo is the only branch with storage_gb 10, Growth the only remaining one
  -- with forwarding_minutes 100 alongside voice_history_days 30.
  if v_source not like '%''office_users'', 1, ''crew_users'', 2, ''custom_domain_connections'', 1,%'
     or v_source not like '%''storage_gb'', 10, ''quickbooks_connections'', 1,%' then
    raise exception 'Solo entitlement limits were lost';
  end if;
  if v_source not like '%''office_users'', 5, ''crew_users'', 10, ''custom_domain_connections'', 1,%'
     or v_source not like '%''voice_history_days'', 30, ''voice_included_minutes'', 0%' then
    raise exception 'Growth entitlement limits were lost';
  end if;

  -- The guard this whole migration exists to satisfy must still be in place.
  if v_source not like '%Stripe Billing projection does not match the canonical catalog%' then
    raise exception 'the canonical-catalog equality check was lost';
  end if;
end;
$$;

commit;
