-- Stop granting a dedicated business number that nothing can provision.
--
-- WHY. Solo, Growth and Scale each carried dedicated_business_numbers = 1 as a
-- real entitlement: written into workspace_entitlements.feature_limits at
-- activation and shown to the customer in Settings. No code anywhere can buy a
-- phone number. The provisioning API surface is absent on purpose --
-- AvailablePhoneNumbers, IncomingPhoneNumbers and SignalWire's Relay REST get
-- zero hits across src, scripts and migrations -- and accounts.sms_number and
-- messaging_registrations.assigned_number exist with nothing writing them. US
-- carriers also require each downstream business to be registered before it can
-- send, and the provider has not opened that process, so it is not merely
-- unbuilt. The pricing copy was corrected in d02ccbfb; this is the entitlement
-- underneath it.
--
-- WHY IT CANNOT BE A CODE-ONLY CHANGE. project_stripe_billing_subscription_event_v1_unchecked
-- does not trust its caller's feature_limits. It recomputes them from a
-- hardcoded per-plan table and refuses the whole projection when the two
-- disagree:
--
--   raise exception 'Stripe Billing projection does not match the canonical catalog'
--
-- So lowering the allowance in src/lib/billing/catalog.ts alone would make every
-- paid activation raise 22000 and dead-letter -- charged and never entitled. The
-- TypeScript change and this migration are one change in two places. Same shape
-- as 20260818200000, which fixed the mirror-image drift on Scale.
--
-- Unreachable today: LGQ_BASE_PLAN_SUBSCRIPTION_CHECKOUT_ENABLED and the
-- subscription projection worker are both off, and production holds no paid
-- subscription -- the one billing_subscriptions row is a test-mode rehearsal
-- (livemode false, cs_test_ session) on the superseded 2026-08-15-preview
-- catalog. Done now because the failure is silent at the moment of sale.
--
-- PRICING_CATALOG_VERSION is deliberately NOT bumped. Bumping it reaches live
-- payment traffic -- direct-payment-preparation throws on any entitlement row
-- still carrying the old version, and the version is also matched DB-side and
-- stamped on every seeded Stripe Price. The version identifies the price book,
-- and no price changes here. The one stored row carrying
-- dedicated_business_numbers = 1 is the rehearsal row above, already on a
-- superseded version, and is left alone rather than rewritten.
--
-- ANCHORS. 'dedicated_business_numbers', 1 occurs three times in the body, once
-- per paid plan. Each anchor therefore spans through the following storage_gb
-- value, which is the nearest text that distinguishes the three branches
-- (Solo 10, Growth 100, Scale 250). A bare needle would match three times and
-- the exactly-once assertion would refuse the migration -- the safe failure, but
-- a failure.
--
-- EVERY dollar-quote inside the DO bodies below is TAG-DELIMITED. An untagged
-- pair would close the enclosing DO body at its first delimiter and the
-- remainder would parse as top-level SQL, surfacing thousands of characters away
-- from the mistake. That applies inside `--` lines too: a comment within a
-- dollar-quoted body is not a comment to the outer lexer. See the header of
-- 20260818200000, which failed that way twice.

begin;

do $$
declare
  v_before text;
  v_after text;
  v_solo_old text := $needle$'dedicated_business_numbers', 1, 'storage_gb', 10,$needle$;
  v_solo_new text := $replacement$'dedicated_business_numbers', 0, 'storage_gb', 10,$replacement$;
  v_growth_old text := $needle$'dedicated_business_numbers', 1, 'storage_gb', 100,$needle$;
  v_growth_new text := $replacement$'dedicated_business_numbers', 0, 'storage_gb', 100,$replacement$;
  v_scale_old text := $needle$'dedicated_business_numbers', 1, 'storage_gb', 250,$needle$;
  v_scale_new text := $replacement$'dedicated_business_numbers', 0, 'storage_gb', 250,$replacement$;
begin
  v_before := pg_catalog.pg_get_functiondef(
    'public.project_stripe_billing_subscription_event_v1_unchecked(uuid,uuid,jsonb)'
      ::pg_catalog.regprocedure
  );

  -- Compare on LF alone. Stored bodies here have held a mix of CRLF and LF (see
  -- 20260817120000) and this file's endings depend on how it reached the server.
  v_before := pg_catalog.replace(v_before, pg_catalog.chr(13) || pg_catalog.chr(10), pg_catalog.chr(10));

  -- Already applied. Keyed on the corrected pair, because each replacement
  -- consumes its own anchor.
  if pg_catalog.strpos(v_before, $probe$'dedicated_business_numbers', 0, 'storage_gb', 10,$probe$) > 0 then
    return;
  end if;

  if pg_catalog.length(v_before) - pg_catalog.length(pg_catalog.replace(v_before, v_solo_old, ''))
       is distinct from pg_catalog.length(v_solo_old)
     or pg_catalog.length(v_before) - pg_catalog.length(pg_catalog.replace(v_before, v_growth_old, ''))
       is distinct from pg_catalog.length(v_growth_old)
     or pg_catalog.length(v_before) - pg_catalog.length(pg_catalog.replace(v_before, v_scale_old, ''))
       is distinct from pg_catalog.length(v_scale_old) then
    raise exception 'dedicated business number allowance source contract drifted'
      using errcode = '55000';
  end if;

  v_after := pg_catalog.replace(v_before, v_solo_old, v_solo_new);
  v_after := pg_catalog.replace(v_after, v_growth_old, v_growth_new);
  v_after := pg_catalog.replace(v_after, v_scale_old, v_scale_new);
  execute v_after;
end
$$;

-- Prove all three paid plans now grant zero, that no branch still grants one,
-- and that nothing else in the table moved.
do $$
declare
  v_source text;
  v_zeros integer;
  v_ones integer;
begin
  v_source := pg_catalog.pg_get_functiondef(
    'public.project_stripe_billing_subscription_event_v1_unchecked(uuid,uuid,jsonb)'
      ::pg_catalog.regprocedure
  );
  v_source := pg_catalog.replace(v_source, pg_catalog.chr(13) || pg_catalog.chr(10), pg_catalog.chr(10));

  -- Counted, not merely present. A `like` test would pass with one branch
  -- corrected and two still granting a number.
  v_zeros := (pg_catalog.length(v_source)
    - pg_catalog.length(pg_catalog.replace(v_source, $probe$'dedicated_business_numbers', 0$probe$, '')))
    / pg_catalog.length($probe$'dedicated_business_numbers', 0$probe$);
  v_ones := (pg_catalog.length(v_source)
    - pg_catalog.length(pg_catalog.replace(v_source, $probe$'dedicated_business_numbers', 1$probe$, '')))
    / pg_catalog.length($probe$'dedicated_business_numbers', 1$probe$);

  if v_zeros <> 3 or v_ones <> 0 then
    raise exception 'dedicated business number allowance is % zero(s) and % one(s), expected 3 and 0',
      v_zeros, v_ones;
  end if;

  -- The neighbouring allowances must be exactly as they were. These three
  -- storage values are what distinguished the branches for the anchors.
  if v_source not like '%''storage_gb'', 10, ''quickbooks_connections'', 1,%'
     or v_source not like '%''storage_gb'', 100, ''quickbooks_connections'', 1,%'
     or v_source not like '%''storage_gb'', 250, ''quickbooks_connections'', 1,%' then
    raise exception 'a plan storage allowance was lost';
  end if;
  if v_source not like '%''office_users'', 1, ''crew_users'', 2,%'
     or v_source not like '%''office_users'', 5, ''crew_users'', 10,%'
     or v_source not like '%''office_users'', 15, ''crew_users'', 50,%' then
    raise exception 'a plan seat allowance was lost';
  end if;

  -- The guard this migration exists to satisfy must still be in place.
  if v_source not like '%Stripe Billing projection does not match the canonical catalog%' then
    raise exception 'the canonical-catalog equality check was lost';
  end if;
end;
$$;

commit;
