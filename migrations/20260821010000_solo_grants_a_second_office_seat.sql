-- Give Solo a second office seat.
--
-- WHY. Solo granted office_users = 1, and the owner IS that one seat: the seat
-- gate counts owner and office memberships against the same limit, so a Solo
-- workspace could never invite anybody. Solo's buyer is an owner-operator whose
-- partner keeps the books, and the invite they would send is the first thing
-- they try. One seat also meant $39/month bought nothing over free Flex except
-- +5 GB of storage -- Flex and Solo were identical on office users, crew users,
-- custom domains, dedicated numbers and voice. The forthcoming Plan & usage
-- capacity grid renders used-against-limit, which would have shown a paying
-- Solo customer "Office users 1 of 1 - at plan limit" permanently, with no
-- in-plan remedy, because the office_user top-up is withheld and has no live
-- Stripe Price.
--
-- WHY IT CANNOT BE A CODE-ONLY CHANGE. project_stripe_billing_subscription_event_v1_unchecked
-- does not trust its caller's feature_limits. It recomputes them from a
-- hardcoded per-plan table and refuses the whole projection when the two
-- disagree:
--
--   raise exception 'Stripe Billing projection does not match the canonical catalog'
--
-- So raising the allowance in src/lib/billing/catalog.ts alone would make every
-- Solo activation raise 22000 and dead-letter -- charged and never entitled.
-- The TypeScript change and this migration are one change in two places. Same
-- shape as 20260820150000 and 20260818200000.
--
-- NOTHING NEEDS BACKFILLING FOR THE RIGHT REASON, NOT AN ASSUMED ONE. This
-- raises an entitlement, so no stored row can be over-granted by it; a row
-- still carrying office_users = 1 is short a seat until the projector next
-- rewrites it, never broken by it. The seat gates read the stored entitlement
-- (v_limits -> 'office_users' in office_seat_usage, office_invitations and the
-- purchased-capacity rollup), so they honour 2 the moment feature_limits says
-- 2, with no further change here.
--
-- PRICING_CATALOG_VERSION is deliberately NOT bumped, for the reason set out at
-- length in 20260820150000: the version identifies the price book, no price
-- changes here, bumping it reaches live payment traffic because
-- direct-payment-preparation throws on any entitlement row still carrying the
-- old version, and the version is stamped on every seeded Stripe Price.
--
-- ANCHORS. 'office_users', 1 is a PREFIX of 'office_users', 15 -- Scale's value
-- since 20260818200000. Every needle and every probe below therefore carries
-- through 'crew_users' and its value, which is what actually distinguishes the
-- three branches (Solo 2, Growth 10, Scale 50). A bare 'office_users', 1 would
-- match inside Scale's line and silently corrupt it.
--
-- EVERY dollar-quote inside the DO bodies below is TAG-DELIMITED, including
-- inside `--` lines: a comment within a dollar-quoted body is not a comment to
-- the outer lexer. See the header of 20260818200000, which failed that way
-- twice.

begin;

do $$
declare
  v_before text;
  v_after text;
  v_solo_old text := $needle$'office_users', 1, 'crew_users', 2,$needle$;
  v_solo_new text := $replacement$'office_users', 2, 'crew_users', 2,$replacement$;
begin
  v_before := pg_catalog.pg_get_functiondef(
    'public.project_stripe_billing_subscription_event_v1_unchecked(uuid,uuid,jsonb)'
      ::pg_catalog.regprocedure
  );

  -- Compare on LF alone. Stored bodies here have held a mix of CRLF and LF (see
  -- 20260817120000) and this file's endings depend on how it reached the server.
  v_before := pg_catalog.replace(v_before, pg_catalog.chr(13) || pg_catalog.chr(10), pg_catalog.chr(10));

  -- Already applied. Keyed on the corrected pair, because the replacement
  -- consumes its own anchor.
  if pg_catalog.strpos(v_before, v_solo_new) > 0 then
    return;
  end if;

  -- Exactly once, not merely present.
  if pg_catalog.length(v_before) - pg_catalog.length(pg_catalog.replace(v_before, v_solo_old, ''))
       is distinct from pg_catalog.length(v_solo_old) then
    raise exception 'solo office seat source contract drifted'
      using errcode = '55000';
  end if;

  v_after := pg_catalog.replace(v_before, v_solo_old, v_solo_new);
  execute v_after;
end
$$;

-- Prove Solo now grants two, that no branch still grants Solo's old one, that
-- Growth and Scale did not move, and that the guard this migration exists to
-- satisfy is still in place.
do $$
declare
  v_source text;
  v_solo integer;
  v_solo_old_count integer;
begin
  v_source := pg_catalog.pg_get_functiondef(
    'public.project_stripe_billing_subscription_event_v1_unchecked(uuid,uuid,jsonb)'
      ::pg_catalog.regprocedure
  );
  v_source := pg_catalog.replace(v_source, pg_catalog.chr(13) || pg_catalog.chr(10), pg_catalog.chr(10));

  -- Counted, not merely present.
  v_solo := (pg_catalog.length(v_source)
    - pg_catalog.length(pg_catalog.replace(v_source, $probe$'office_users', 2, 'crew_users', 2,$probe$, '')))
    / pg_catalog.length($probe$'office_users', 2, 'crew_users', 2,$probe$);
  v_solo_old_count := (pg_catalog.length(v_source)
    - pg_catalog.length(pg_catalog.replace(v_source, $probe$'office_users', 1, 'crew_users', 2,$probe$, '')))
    / pg_catalog.length($probe$'office_users', 1, 'crew_users', 2,$probe$);

  if v_solo <> 1 or v_solo_old_count <> 0 then
    raise exception 'solo office seat is % two-seat branch(es) and % one-seat branch(es), expected 1 and 0',
      v_solo, v_solo_old_count;
  end if;

  -- The other two paid plans must be exactly as they were.
  if v_source not like '%''office_users'', 5, ''crew_users'', 10,%'
     or v_source not like '%''office_users'', 15, ''crew_users'', 50,%' then
    raise exception 'a plan seat allowance was lost';
  end if;

  -- Solo's neighbouring allowances must be untouched. This is the text the
  -- anchor ran through, so it is the text most at risk from a bad replacement.
  -- Kept to single lines: the stored body's line breaks are not this file's to
  -- assume, and a pattern spanning one would fail for a formatting reason and
  -- read as drift.
  if v_source not like '%''crew_users'', 2, ''custom_domain_connections'', 1,%'
     or v_source not like '%''dedicated_business_numbers'', 0, ''storage_gb'', 10,%' then
    raise exception 'a solo allowance neighbouring the anchor moved';
  end if;

  if v_source not like '%Stripe Billing projection does not match the canonical catalog%' then
    raise exception 'the canonical-catalog equality check was lost';
  end if;
end;
$$;

commit;
