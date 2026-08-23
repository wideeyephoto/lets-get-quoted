-- Give a newly created workspace the limits its catalog version promises.
--
-- WHY. 20260818120000 moved the enforced catalog version to 2026-08-18-preview by
-- rewriting every function body that pinned the old string:
--
--   new_def := replace(pg_get_functiondef(fn.oid), '2026-08-15-preview', '2026-08-18-preview');
--
-- That is the right tool for a version bump and it did exactly what it says. But
-- initialize_workspace_pricing does not only NAME a catalog version, it also
-- carries a copy of the Flex limits, and REPLACE moved the label without moving
-- the map. The 2026-08-15 catalog wrote EIGHT limits. The current one writes TEN:
-- forwarding_minutes and voice_included_minutes were added.
--
-- So every account created since that migration gets:
--
--   catalog_version = '2026-08-18-preview'
--   feature_limits  = {8 keys, no forwarding_minutes, no voice_included_minutes}
--
-- which is precisely the shape 20260819040000 refuses:
--
--   '% entitlement row(s) claim catalog 2026-08-18-preview without its limits'
--
-- A row claiming a catalog whose limits it does not carry is the substitution the
-- pinning exists to prevent. It is also silent: nothing fails at signup, the
-- workspace simply carries two fewer limits than its plan sells, and the next run
-- of 20260819040000 raises 55000 on a row nobody edited.
--
-- WHY THE MAP IS NOT REWRITTEN FROM THE CATALOG. It cannot be. A migration has no
-- access to src/lib/billing/catalog.ts, which is why the values are transcribed
-- here and why test/new-workspace-flex-limits-migration.test.ts compares this
-- file's literal against what the catalog itself produces. A transcription slip is
-- the one dangerous thing about this file and the one SQL review would not catch.
--
-- WHY A PREREQUISITE CHECK RATHER THAN A VERSION-AGNOSTIC PATCH. If 20260818120000
-- has NOT been applied, the function still writes 2026-08-15-preview -- and eight
-- limits is CORRECT for that catalog. Patching the map without the label would
-- manufacture the mirror-image inconsistency. So this migration refuses to run out
-- of order rather than guessing which half of the pair it is fixing.
--
-- HOW. The function is patched from its own live source rather than retyped, the
-- house pattern -- see 20260818200000_scale_entitlement_limits_catalog_drift.sql.
-- The anchor is a single line containing no newline, so unlike that migration this
-- one needs no CRLF normalisation: line endings cannot fall inside the needle.

begin;

do $mig$
declare
  v_before text;
  v_after text;
  v_old text := $needle$'{"office_users":1,"crew_users":2,"custom_domain_connections":1,"dedicated_business_numbers":0,"storage_gb":5,"quickbooks_connections":1,"voice_concurrent_calls":1,"voice_history_days":30}'::jsonb,$needle$;
  v_new text := $replacement$'{"office_users":1,"crew_users":2,"custom_domain_connections":1,"dedicated_business_numbers":0,"storage_gb":5,"quickbooks_connections":1,"forwarding_minutes":0,"voice_concurrent_calls":1,"voice_history_days":30,"voice_included_minutes":0}'::jsonb,$replacement$;
begin
  v_before := pg_catalog.pg_get_functiondef(
    'public.initialize_workspace_pricing()'::pg_catalog.regprocedure
  );

  -- Already applied. Keyed on the corrected pair, because the replacement
  -- consumes its anchor entirely and the anchor cannot be probed for afterwards.
  if pg_catalog.strpos(v_before, $probe$"forwarding_minutes":0,"voice_concurrent_calls"$probe$) > 0 then
    return;
  end if;

  -- Out of order. See the header: eight limits is correct under the old catalog,
  -- so moving the map before the label would create the inverse defect.
  if pg_catalog.strpos(v_before, $old$2026-08-15-preview$old$) > 0 then
    raise exception
      'initialize_workspace_pricing still pins 2026-08-15-preview; apply 20260818120000 first'
      using errcode = '55000';
  end if;

  if pg_catalog.length(v_before)
       - pg_catalog.length(pg_catalog.replace(v_before, v_old, ''))
       is distinct from pg_catalog.length(v_old) then
    raise exception 'new-workspace Flex limits source contract drifted'
      using errcode = '55000';
  end if;

  v_after := pg_catalog.replace(v_before, v_old, v_new);
  execute v_after;
end
$mig$;

-- Repair any workspace already provisioned with the truncated map.
--
-- ADD the two missing keys rather than rewriting the map. 20260819040000 refuses
-- to touch a row whose limits differ from the catalog, because overwriting a whole
-- map would silently undo a deliberate change. That reasoning does not carry over
-- here: a row on 2026-08-18-preview is CLAIMING a catalog in which these two keys
-- exist, so supplying them contradicts nothing anyone chose. Concatenating the
-- defaults on the LEFT means any value already stored wins, so a workspace whose
-- limits were deliberately raised keeps every one of them and gains only what was
-- missing.
--
-- Scoped to Flex because that is the only plan initialize_workspace_pricing
-- creates. A non-Flex row in this shape would mean a second writer exists, which
-- is not something to paper over -- the post-check below is deliberately unscoped
-- so that case stops the migration instead of being quietly repaired.
update public.workspace_entitlements e
   set feature_limits =
     '{"forwarding_minutes":0,"voice_included_minutes":0}'::jsonb || e.feature_limits
 where e.plan_code = 'flex'
   and e.catalog_version = '2026-08-18-preview'
   and (
     e.feature_limits -> 'forwarding_minutes' is null
     or e.feature_limits -> 'voice_included_minutes' is null
   );

-- Prove the function now writes ten limits, and that nothing is left half-moved.
do $verify$
declare
  v_source text;
  v_bad integer;
begin
  v_source := pg_catalog.pg_get_functiondef(
    'public.initialize_workspace_pricing()'::pg_catalog.regprocedure
  );

  if pg_catalog.strpos(v_source, $need$"forwarding_minutes":0$need$) = 0
     or pg_catalog.strpos(v_source, $need$"voice_included_minutes":0$need$) = 0 then
    raise exception 'initialize_workspace_pricing does not write the current Flex limits'
      using errcode = '55000';
  end if;

  if pg_catalog.strpos(v_source, $old$2026-08-15-preview$old$) > 0 then
    raise exception 'initialize_workspace_pricing still pins the old catalog version'
      using errcode = '55000';
  end if;

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
