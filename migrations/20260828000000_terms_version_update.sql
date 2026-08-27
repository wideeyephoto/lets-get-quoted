-- Update Terms of Service version check from 2026-08-16 to 2026-08-28.
--
-- Widens table check constraints so historical evidence recorded under 2026-08-03
-- or 2026-08-16 remains valid, while allowing 2026-08-28 for all new operations.
-- Rewrites functions that validate incoming consent/checkout operations to require
-- the active 2026-08-28 Terms of Service.

begin;

-- 1. Constraints: widen to accept 2026-08-28 alongside historical versions.
alter table public.billing_subscription_consent_acceptances
  drop constraint if exists billing_subscription_consent_terms_version_check;
alter table public.billing_subscription_consent_acceptances
  add constraint billing_subscription_consent_terms_version_check
  check (terms_version in ('2026-08-03', '2026-08-16', '2026-08-28'));

alter table public.billing_subscription_checkout_operations
  drop constraint if exists billing_subscription_checkout_terms_version_check;
alter table public.billing_subscription_checkout_operations
  add constraint billing_subscription_checkout_terms_version_check
  check (terms_version in ('2026-08-03', '2026-08-16', '2026-08-28'));

-- 2. Functions: rewrite functions where terms_version is pinned to 2026-08-16.
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
       and p.prosrc like '%2026-08-16%'
       and (p.proname like '%consent%' or p.proname like '%plan_change%' or p.proname like '%subscription%')
  loop
    -- Replace '2026-08-16' with '2026-08-28' in terms checks while leaving
    -- base-plan-recurring-2026-08-16 recurring consent version intact if distinct.
    new_def := replace(pg_get_functiondef(fn.oid), 'p_terms_version is distinct from ''2026-08-16''', 'p_terms_version is distinct from ''2026-08-28''');
    new_def := replace(new_def, 'v_terms_version <> ''2026-08-16''', 'v_terms_version <> ''2026-08-28''');
    new_def := replace(new_def, 'v_terms_version is distinct from ''2026-08-16''', 'v_terms_version is distinct from ''2026-08-28''');
    if new_def <> pg_get_functiondef(fn.oid) then
      execute new_def;
      rewritten := rewritten + 1;
    end if;
  end loop;

  raise notice 'rewrote % functions with active terms_version checks', rewritten;
end;
$$;

commit;
