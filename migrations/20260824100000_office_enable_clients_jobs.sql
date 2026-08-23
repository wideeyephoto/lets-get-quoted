-- Re-enable clients.read/write and jobs.read/write capabilities now that
-- their dashboard pages and actions have been audited and safely converted to
-- requireOfficeContext with appropriate financial data isolation.
--
-- WHAT WAS FIXED BEFORE RE-ENABLING:
-- 1. Clients detail page previously queried payments table (owner-only RLS),
--    which caused the page to display a false "$0.00 paid" fact to office staff.
--    The page now isolates statement and payment metrics to owners / payments.read.
-- 2. mergeClientsAction remains strictly guarded by requireOwnerContext so that
--    multi-table repointing (across recurring_plans and extra_stop_requests)
--    cannot fail silently under an office user session.
-- 3. Jobs dashboard and job detail pages now use requireOfficeContext('jobs.read', 'clients.read')
--    and protect owner-only financial costs/margins and payment collections.

begin;

update public.office_capabilities
   set enabled = true,
       updated_at = pg_catalog.now()
 where capability in ('clients.read', 'clients.write', 'jobs.read', 'jobs.write');

-- ---------------------------------------------------------------------------
-- Post-conditions. Assert that all 4 capabilities are active and wired to RLS.
-- ---------------------------------------------------------------------------
do $$
declare
  v_missing text;
begin
  select pg_catalog.string_agg(capability, ', ' order by capability)
    into v_missing
    from (
      select unnest(array['clients.read', 'clients.write', 'jobs.read', 'jobs.write']) as capability
    ) t
   where not exists (
     select 1 from public.office_capabilities
      where capability = t.capability and enabled
   );

  if v_missing is not null then
    raise exception 'expected office capability not enabled: %', v_missing;
  end if;

  -- Verify policies on clients and jobs consult office_can
  if not exists (
    select 1 from pg_catalog.pg_policies
     where schemaname = 'public' and tablename = 'clients'
       and coalesce(qual, with_check) like '%office_can%'
  ) then
    raise exception 'clients policies do not consult office_can';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_policies
     where schemaname = 'public' and tablename = 'jobs'
       and coalesce(qual, with_check) like '%office_can%'
  ) then
    raise exception 'jobs policies do not consult office_can';
  end if;
end $$;

commit;
