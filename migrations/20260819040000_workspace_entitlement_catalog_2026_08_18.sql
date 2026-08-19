-- Move settled workspaces onto the current pricing catalog.
--
-- WHY. Every workspace_entitlements row in production still carries
-- catalog_version '2026-08-15-preview'. plan-usage.ts refuses to show a catalog
-- price for a row that is not on the current catalog -- deliberately, so a
-- workspace is never quoted prices it was not provisioned under -- so the Plan &
-- usage card reads "Price pinned to your agreement" for a FREE Flex plan, which
-- implies a negotiated deal that does not exist, and every workspace carries the
-- pinned-catalog note.
--
-- WHY A RELABEL IS NOT ENOUGH, and why this migration is an UPDATE of
-- feature_limits rather than of one string. The 2026-08-15 catalog wrote EIGHT
-- feature limits. The current one writes TEN: forwarding_minutes and
-- voice_included_minutes were added. Bumping catalog_version alone would make
-- the row claim to be on a catalog whose limits it does not carry, which is
-- exactly the substitution the pinning exists to prevent. So both move together
-- or neither does.
--
-- The change is purely ADDITIVE for the plans it touches. Every one of the eight
-- existing keys already equals what the current catalog would write; the two new
-- keys state capacity the plan already included and nothing here was reading.
--
-- THE GUARD IS THE POINT. A row is updated only when its stored limits are
-- byte-identical to the current catalog's map MINUS the two new keys. Expressed
-- that way round on purpose: it needs no hand-written copy of the old catalog,
-- it pins the key count and all eight values in one comparison, and any row that
-- has drifted -- a bespoke entitlement, a hand-edit, a plan whose allowances
-- genuinely changed between catalogs -- fails the match and is left exactly as
-- it is. Scale is the live example: 20260818200000 corrected its office and crew
-- allowances, so a Scale row from the old catalog will NOT match and will keep
-- its pinned note until somebody decides what it should say.
--
-- Idempotent: after this runs, no row is on '2026-08-15-preview' any more, so a
-- second apply matches nothing.

begin;

do $mig$
declare
  v_plan record;
  v_updated integer;
  v_total integer := 0;
  v_left integer;
begin
  for v_plan in
    select *
      from (values
        -- Exactly workspaceEntitlementCatalogSnapshot(plan).featureLimits for
        -- catalog 2026-08-18-preview. A test asserts these four maps equal what
        -- that function returns, so a transcription slip here fails in CI rather
        -- than silently rewriting an entitlement.
        ('flex', $j${"office_users":1,"crew_users":2,"custom_domain_connections":1,"dedicated_business_numbers":0,"storage_gb":5,"quickbooks_connections":1,"forwarding_minutes":0,"voice_concurrent_calls":1,"voice_history_days":30,"voice_included_minutes":0}$j$::jsonb),
        ('solo', $j${"office_users":1,"crew_users":2,"custom_domain_connections":1,"dedicated_business_numbers":1,"storage_gb":10,"quickbooks_connections":1,"forwarding_minutes":100,"voice_concurrent_calls":1,"voice_history_days":30,"voice_included_minutes":0}$j$::jsonb),
        ('growth', $j${"office_users":5,"crew_users":10,"custom_domain_connections":1,"dedicated_business_numbers":1,"storage_gb":100,"quickbooks_connections":1,"forwarding_minutes":100,"voice_concurrent_calls":1,"voice_history_days":30,"voice_included_minutes":0}$j$::jsonb),
        ('scale', $j${"office_users":15,"crew_users":50,"custom_domain_connections":1,"dedicated_business_numbers":1,"storage_gb":250,"quickbooks_connections":1,"forwarding_minutes":200,"voice_concurrent_calls":3,"voice_history_days":90,"voice_included_minutes":100}$j$::jsonb)
      ) as t(plan_code, limits)
  loop
    update public.workspace_entitlements e
       set feature_limits = v_plan.limits,
           catalog_version = '2026-08-18-preview'
     where e.plan_code = v_plan.plan_code
       and e.catalog_version = '2026-08-15-preview'
       -- The whole guard, in one comparison: the stored map must be the current
       -- map without the two keys the current catalog added.
       and e.feature_limits = (v_plan.limits - 'forwarding_minutes' - 'voice_included_minutes');
    get diagnostics v_updated = row_count;
    v_total := v_total + v_updated;
  end loop;

  select pg_catalog.count(*) into v_left
    from public.workspace_entitlements
   where catalog_version = '2026-08-15-preview';

  -- Not an error. A row left behind is a row this migration could not prove was
  -- equivalent, which is the correct outcome for it.
  raise notice 'entitlement catalog bump: % moved, % left pinned to 2026-08-15-preview',
    v_total, v_left;
end
$mig$;

-- Nothing may be left half-moved: a row on the current catalog must carry the
-- current catalog's ten keys. This is the assertion that would have caught a
-- version-only relabel.
do $verify$
declare
  v_bad integer;
begin
  select pg_catalog.count(*) into v_bad
    from public.workspace_entitlements e
   where e.catalog_version = '2026-08-18-preview'
     and (
       e.feature_limits -> 'forwarding_minutes' is null
       or e.feature_limits -> 'voice_included_minutes' is null
     );
  if v_bad > 0 then
    raise exception
      '% entitlement row(s) claim catalog 2026-08-18-preview without its limits', v_bad
      using errcode = '55000';
  end if;
end;
$verify$;

commit;
