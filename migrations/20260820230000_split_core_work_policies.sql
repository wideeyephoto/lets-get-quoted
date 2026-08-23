-- Split the three core work policies into read and write. Grants nothing.
--
-- Step 1 of the two-step in docs/office-capability-activation.md, for `leads`,
-- `clients` and `jobs`. Every predicate below is still `is_owner`, so this
-- changes NOTHING for anybody -- it is a refactor whose only purpose is to make
-- the next migration expressible.
--
-- WHY IT IS NOT EXPRESSIBLE TODAY. All three tables carry a single `for all`
-- policy covering select, insert, update and delete with one predicate:
--
--   create policy job_owner on jobs for all using ( is_owner(account_id) );
--
-- The capability catalog distinguishes `jobs.read` from `jobs.write` because
-- contractors need that distinction. Swapping the predicate on a `for all`
-- policy erases it: an office user granted `jobs.read` could delete jobs. So the
-- policy has to become two before either can be swapped.
--
-- WHY SPLIT AND SWAP ARE SEPARATE MIGRATIONS. This one is verifiable by
-- "nothing moved" -- and that is a claim worth being able to make on its own.
-- Combined with the grant, a failure afterwards could not be attributed to
-- either half. This is also the most dangerous kind of edit in the schema: get a
-- predicate wrong on a tenant policy and rows cross an account boundary.
--
-- WHY `with check` IS WRITTEN OUT EVEN THOUGH IT IS IDENTICAL. A `for all`
-- policy given only `using` defaults `with check` from it. That default is
-- invisible and correct today, and silently wrong the moment somebody edits one
-- side: `using` governs which existing rows a command can see, `with check`
-- which new or modified rows it may leave behind. A write policy whose `using`
-- was narrowed and whose absent `with check` still followed the old expression
-- would permit writes the read side refuses. Both are written, always, even when
-- they are the same expression.
--
-- NOT TOUCHED: `job_crew_read` on `jobs` (`for select using crew_on_job(id)`).
-- It is a separate permissive policy for a different audience and the split does
-- not concern it. Its continued existence is asserted below, because dropping a
-- crew's read access while refactoring an owner's would be an easy accident.

begin;

-- ---------------------------------------------------------------------------
-- leads
-- ---------------------------------------------------------------------------
drop policy if exists lead_all on public.leads;

create policy lead_owner_read on public.leads
  for select using (public.is_owner(account_id));

create policy lead_owner_write on public.leads
  for all
  using (public.is_owner(account_id))
  with check (public.is_owner(account_id));

-- ---------------------------------------------------------------------------
-- clients
-- ---------------------------------------------------------------------------
drop policy if exists clients_all on public.clients;

create policy clients_owner_read on public.clients
  for select using (public.is_owner(account_id));

create policy clients_owner_write on public.clients
  for all
  using (public.is_owner(account_id))
  with check (public.is_owner(account_id));

-- ---------------------------------------------------------------------------
-- jobs
-- ---------------------------------------------------------------------------
drop policy if exists job_owner on public.jobs;

create policy job_owner_read on public.jobs
  for select using (public.is_owner(account_id));

create policy job_owner_write on public.jobs
  for all
  using (public.is_owner(account_id))
  with check (public.is_owner(account_id));

do $post$
declare
  v_tbl text;
  v_read text;
  v_write text;
  v_count integer;
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

    -- The old combined policy must be gone. Left behind, it would keep granting
    -- everything through one predicate and make the split cosmetic -- the split
    -- would look done and the next migration's narrowing would do nothing.
    if exists (
      select 1 from pg_catalog.pg_policy p
        join pg_catalog.pg_class c on c.oid = p.polrelid
        join pg_catalog.pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relname = v_tbl
         and p.polname in ('lead_all', 'clients_all', 'job_owner')
    ) then
      raise exception 'the combined for-all policy still exists on %', v_tbl;
    end if;

    -- Read side: select only. A read policy created `for all` would grant the
    -- writes this whole migration exists to separate out.
    select p.polcmd, pg_catalog.pg_get_expr(p.polqual, p.polrelid)
      into v_check, v_qual
      from pg_catalog.pg_policy p
      join pg_catalog.pg_class c on c.oid = p.polrelid
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = v_tbl and p.polname = v_read;

    if v_check is null then
      raise exception 'read policy % was not created', v_read;
    end if;
    if v_check <> 'r' then
      raise exception 'read policy % covers % rather than select alone', v_read, v_check;
    end if;
    if v_qual !~ 'is_owner' then
      raise exception 'read policy % does not still test is_owner', v_read;
    end if;

    -- Write side: `with check` must be PRESENT, not defaulted. polwithcheck is
    -- null when it was inherited from `using`, which is the invisible state this
    -- migration exists to eliminate -- so null here is a failure even though the
    -- effective behaviour today would be identical.
    select pg_catalog.pg_get_expr(p.polqual, p.polrelid),
           pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid)
      into v_qual, v_check
      from pg_catalog.pg_policy p
      join pg_catalog.pg_class c on c.oid = p.polrelid
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = v_tbl and p.polname = v_write;

    if v_qual is null then
      raise exception 'write policy % was not created', v_write;
    end if;
    if v_check is null then
      raise exception 'write policy % has no explicit with check; it would be inherited and invisible', v_write;
    end if;
    if v_qual !~ 'is_owner' or v_check !~ 'is_owner' then
      raise exception 'write policy % does not test is_owner on both sides', v_write;
    end if;
  end loop;

  -- The crew's read of jobs is a different audience and must have survived.
  if not exists (
    select 1 from pg_catalog.pg_policy p
      join pg_catalog.pg_class c on c.oid = p.polrelid
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = 'jobs' and p.polname = 'job_crew_read'
  ) then
    raise exception 'job_crew_read was dropped; the crew can no longer read their jobs';
  end if;

  -- AND NOTHING WAS GRANTED. This migration must not be the one that wires a
  -- capability: it is the refactor that makes wiring possible. If office_can
  -- appears in any policy, the two steps have been combined and a failure
  -- afterwards could not be attributed to either.
  select pg_catalog.count(*) into v_count
    from pg_catalog.pg_policy p
   where pg_catalog.pg_get_expr(p.polqual, p.polrelid) like '%office_can%'
      or pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid) like '%office_can%';

  if v_count > 0 then
    raise exception 'this migration granted a capability (% policies read office_can); it must only split', v_count;
  end if;

  -- Row-level security must still be ON. Dropping the last policy on a table
  -- whose RLS is enabled denies everything; disabling RLS to "fix" that opens
  -- the table to every tenant. Neither is a state this migration may leave.
  if exists (
    select 1 from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname in ('leads', 'clients', 'jobs')
       and not c.relrowsecurity
  ) then
    raise exception 'row-level security is disabled on one of the split tables';
  end if;
end $post$;

commit;
