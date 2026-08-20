-- Let an office user READ leads, clients and jobs. The first actual grant.
--
-- Step 2 of the two-step in docs/office-capability-activation.md. 20260820230000
-- split each of these three tables into a read policy and a write policy with
-- identical predicates; this narrows the read side only, and leaves the write
-- side exactly as it was.
--
-- WHAT CHANGES, PRECISELY. Nothing for an owner: `office_can` returns true for
-- an owner unconditionally, for every capability including ones nobody has
-- defined, which is the property that makes swapping a tenant predicate safe at
-- all. What changes is that a user holding an `office` membership on the account
-- can now SELECT these three tables, provided the matching capability row is
-- enabled -- which 20260820220000 did for all three.
--
-- WHAT DELIBERATELY DOES NOT CHANGE. The write policies still test `is_owner` on
-- both sides. `leads.write`, `clients.write` and `jobs.write` are enabled in the
-- catalog, so an office user is INTENDED to be able to write these -- but that is
-- a separate migration, because a read grant and a write grant fail differently
-- and a combined migration could not be attributed. Until then an office user
-- can see this workspace and change nothing in it.
--
-- WHY THE WRITE POLICY DOES NOT LEAK READS. `..._owner_write` is `for all`, so
-- it also governs select. Permissive policies OR together: select becomes
-- `office_can(acc,'x.read') OR is_owner(acc)`, which is the read policy for an
-- office user and unchanged for an owner. Insert, update and delete are reached
-- by no other policy, so they remain owner-only. That asymmetry is the whole
-- design and it only works because the read policy is `for select` alone -- if
-- 20260820230000 had created it `for all`, this migration would be granting
-- deletes under a capability named "read".
--
-- IT MUST NOT BE A NO-OP. If the three capability rows were not enabled, every
-- policy below would still read `office_can(...)` and grant nothing, and the
-- migration would look applied. The post-condition checks the switches too.

begin;

drop policy if exists lead_owner_read on public.leads;
create policy lead_owner_read on public.leads
  for select using (public.office_can(account_id, 'leads.read'));

drop policy if exists clients_owner_read on public.clients;
create policy clients_owner_read on public.clients
  for select using (public.office_can(account_id, 'clients.read'));

drop policy if exists job_owner_read on public.jobs;
create policy job_owner_read on public.jobs
  for select using (public.office_can(account_id, 'jobs.read'));

do $post$
declare
  v_tbl text;
  v_read text;
  v_write text;
  v_cap text;
  v_cmd "char";
  v_qual text;
  v_check text;
begin
  foreach v_tbl in array array['leads', 'clients', 'jobs'] loop
    v_read  := case v_tbl when 'leads' then 'lead_owner_read'
                          when 'clients' then 'clients_owner_read'
                          else 'job_owner_read' end;
    v_write := case v_tbl when 'leads' then 'lead_owner_write'
                          when 'clients' then 'clients_owner_write'
                          else 'job_owner_write' end;
    v_cap   := case v_tbl when 'leads' then 'leads.read'
                          when 'clients' then 'clients.read'
                          else 'jobs.read' end;

    select p.polcmd, pg_catalog.pg_get_expr(p.polqual, p.polrelid)
      into v_cmd, v_qual
      from pg_catalog.pg_policy p
      join pg_catalog.pg_class c on c.oid = p.polrelid
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = v_tbl and p.polname = v_read;

    if v_qual is null then
      raise exception 'read policy % is missing on %', v_read, v_tbl;
    end if;

    -- Select alone. A read policy that became `for all` here would hand an
    -- office user delete under a capability named "read" -- the exact failure
    -- the split migration existed to make impossible.
    if v_cmd <> 'r' then
      raise exception 'read policy % covers % rather than select alone', v_read, v_cmd;
    end if;

    -- The right capability, not merely some capability. A copy-paste that left
    -- 'leads.read' on the clients policy would grant clients to anybody holding
    -- leads, and every structural check would still pass.
    if pg_catalog.strpos(v_qual, v_cap) = 0 then
      raise exception 'read policy % does not test %; it tests %', v_read, v_cap, v_qual;
    end if;
    if pg_catalog.strpos(v_qual, 'office_can') = 0 then
      raise exception 'read policy % was not swapped to office_can', v_read;
    end if;

    -- The write side must be untouched, and must still refuse an office user.
    select pg_catalog.pg_get_expr(p.polqual, p.polrelid),
           pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid)
      into v_qual, v_check
      from pg_catalog.pg_policy p
      join pg_catalog.pg_class c on c.oid = p.polrelid
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = v_tbl and p.polname = v_write;

    if v_qual is null or v_check is null then
      raise exception 'write policy % lost a predicate', v_write;
    end if;
    if pg_catalog.strpos(v_qual, 'office_can') > 0
       or pg_catalog.strpos(v_check, 'office_can') > 0 then
      raise exception 'write policy % was swapped; this migration grants reads only', v_write;
    end if;
    if v_qual !~ 'is_owner' or v_check !~ 'is_owner' then
      raise exception 'write policy % no longer tests is_owner on both sides', v_write;
    end if;

    -- AND THE SWITCH IS ON. Without this, a policy reading a disabled capability
    -- grants nothing while looking exactly like one that grants everything, and
    -- the migration reports success either way.
    if not exists (
      select 1 from public.office_capabilities where capability = v_cap and enabled
    ) then
      raise exception 'capability % is not enabled, so % grants nothing', v_cap, v_read;
    end if;
  end loop;

  -- Unchanged from the split, and still worth asserting: a crew member reading
  -- their own jobs is a different audience on the same table.
  if not exists (
    select 1 from pg_catalog.pg_policy p
      join pg_catalog.pg_class c on c.oid = p.polrelid
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = 'jobs' and p.polname = 'job_crew_read'
  ) then
    raise exception 'job_crew_read was dropped';
  end if;

  if exists (
    select 1 from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname in ('leads', 'clients', 'jobs')
       and not c.relrowsecurity
  ) then
    raise exception 'row-level security is disabled on one of the swapped tables';
  end if;
end $post$;

commit;
