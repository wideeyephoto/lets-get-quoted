-- Move the enforced catalog version from 2026-08-15-preview to 2026-08-18-preview.
--
-- WHY. Scale's included capacity was a field-for-field copy of Growth's while
-- costing 2.55x. Correcting it is an allowance change, and the change-control
-- rule requires a new catalog version. The version is not only a TypeScript
-- constant: this database enforces it in three CHECK constraints and eleven
-- function bodies. Bumping the constant alone would let checkout build an
-- operation the database then rejects, so subscription checkout would fail on
-- its first real customer.
--
-- The constraints accept BOTH versions, deliberately. Existing rows carry
-- 2026-08-15-preview -- the 2026-08-18 rehearsal wrote one -- and a
-- new-version-only constraint would fail to validate them. Historical evidence
-- must stay interpretable at the version it was written under.
--
-- Function bodies are rewritten from pg_get_functiondef rather than retyped.
-- Patching function source by exact text match has already failed once here,
-- when production held a mix of CRLF and LF bodies and refused every match.
-- Reading the definition back out of the catalog sidesteps line endings, and
-- REPLACE touches only the version literal.

begin;

-- 1. Constraints: allow the new version alongside the old.
alter table public.billing_subscription_checkout_operations
  drop constraint if exists billing_subscription_checkout_operations_catalog_version_check;
alter table public.billing_subscription_checkout_operations
  add constraint billing_subscription_checkout_operations_catalog_version_check
  check (catalog_version in ('2026-08-15-preview', '2026-08-18-preview'));

alter table public.billing_subscription_consent_acceptances
  drop constraint if exists billing_subscription_consent_acceptances_catalog_version_check;
alter table public.billing_subscription_consent_acceptances
  add constraint billing_subscription_consent_acceptances_catalog_version_check
  check (catalog_version in ('2026-08-15-preview', '2026-08-18-preview'));

alter table public.billing_allowance_reset_operations
  drop constraint if exists billing_allowance_reset_operations_catalog_version_check;
alter table public.billing_allowance_reset_operations
  add constraint billing_allowance_reset_operations_catalog_version_check
  check (catalog_version in ('2026-08-15-preview', '2026-08-18-preview'));

-- 2. Functions: rewrite every body that pins the old version.
do $$
declare
  fn record;
  new_def text;
  rewritten int := 0;
begin
  for fn in
    select p.oid, p.proname
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prosrc like '%2026-08-15-preview%'
  loop
    new_def := replace(pg_get_functiondef(fn.oid), '2026-08-15-preview', '2026-08-18-preview');
    execute new_def;
    rewritten := rewritten + 1;
  end loop;

  -- Eleven were found when this migration was written. Fewer means a function
  -- was dropped or already rewritten; more means new ones pinned the old
  -- version since. Either way the assumption behind this migration no longer
  -- holds, so stop rather than half-apply it.
  if rewritten <> 11 then
    raise exception 'expected to rewrite 11 functions, rewrote %', rewritten;
  end if;

  raise notice 'rewrote % function bodies to the new catalog version', rewritten;
end;
$$;

-- 3. Prove it. No public function may still pin the old version.
do $$
declare
  stragglers int;
begin
  select count(*) into stragglers
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.prosrc like '%2026-08-15-preview%';
  if stragglers <> 0 then
    raise exception '% function(s) still pin the old catalog version', stragglers;
  end if;
end;
$$;

commit;
