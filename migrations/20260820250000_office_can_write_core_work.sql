-- Let an office user CHANGE leads, clients and jobs. The other half of the work.
--
-- 20260820240000 swapped the read side. This swaps the write side, completing
-- the six capabilities `leads.read/write`, `clients.read/write` and
-- `jobs.read/write` that 20260820220000 enabled.
--
-- THE `for all` WRITE POLICY IS REPLACED BY THREE, NOT SWAPPED IN PLACE, and
-- that is the whole substance of this migration.
--
-- `..._owner_write` is `for all`, so it governs select as well as the three
-- write commands. Swapping its predicate to `office_can(acc, 'x.write')` would
-- therefore have granted SELECT to anybody holding `x.write` -- so a contractor
-- who gave somebody permission to edit customers, and deliberately withheld
-- permission to see them, would have handed over both. The capability catalog
-- exists precisely to let those two be decided separately, and a `for all`
-- policy quietly re-merges them.
--
-- It is a real difference and not a theoretical one: read and write are separate
-- rows in office_capabilities, and nothing stops a future per-workspace grant
-- turning on one without the other.
--
-- So each table gets insert, update and delete policies, and select is left to
-- the read policy alone. After this migration the only policy on these tables
-- governing select is `..._owner_read`, which tests `x.read`. That is the
-- property that makes the two capabilities mean what they say, and the PG17
-- harness asserts it by enabling write, disabling read, and checking the office
-- user is blind while still able to update.
--
-- UPDATE TAKES BOTH SIDES. `using` decides which rows the update may find,
-- `with check` which rows it may leave behind. Given only `using`, `with check`
-- is inherited -- so an office user could move a row to another account_id and
-- the policy would permit it, because the row was findable before the change.
-- Both are written, and the post-condition refuses a null `with check`.
--
-- INSERT TAKES ONLY `with check`. There is no existing row to find, so PostgreSQL
-- ignores `using` on an insert policy entirely; writing one would look like a
-- guard and be dead text.

begin;

-- ---------------------------------------------------------------------------
-- leads
-- ---------------------------------------------------------------------------
drop policy if exists lead_owner_write on public.leads;

create policy lead_owner_insert on public.leads
  for insert with check (public.office_can(account_id, 'leads.write'));

create policy lead_owner_update on public.leads
  for update
  using (public.office_can(account_id, 'leads.write'))
  with check (public.office_can(account_id, 'leads.write'));

create policy lead_owner_delete on public.leads
  for delete using (public.office_can(account_id, 'leads.write'));

-- ---------------------------------------------------------------------------
-- clients
-- ---------------------------------------------------------------------------
drop policy if exists clients_owner_write on public.clients;

create policy clients_owner_insert on public.clients
  for insert with check (public.office_can(account_id, 'clients.write'));

create policy clients_owner_update on public.clients
  for update
  using (public.office_can(account_id, 'clients.write'))
  with check (public.office_can(account_id, 'clients.write'));

create policy clients_owner_delete on public.clients
  for delete using (public.office_can(account_id, 'clients.write'));

-- ---------------------------------------------------------------------------
-- jobs
-- ---------------------------------------------------------------------------
drop policy if exists job_owner_write on public.jobs;

create policy job_owner_insert on public.jobs
  for insert with check (public.office_can(account_id, 'jobs.write'));

create policy job_owner_update on public.jobs
  for update
  using (public.office_can(account_id, 'jobs.write'))
  with check (public.office_can(account_id, 'jobs.write'));

create policy job_owner_delete on public.jobs
  for delete using (public.office_can(account_id, 'jobs.write'));

do $post$
declare
  v_tbl text;
  v_prefix text;
  v_cap text;
  v_cmd "char";
  v_qual text;
  v_check text;
  v_selects text;
begin
  foreach v_tbl in array array['leads', 'clients', 'jobs'] loop
    v_prefix := case v_tbl when 'leads' then 'lead_owner'
                           when 'clients' then 'clients_owner'
                           else 'job_owner' end;
    v_cap := case v_tbl when 'leads' then 'leads.write'
                        when 'clients' then 'clients.write'
                        else 'jobs.write' end;

    -- The combined write policy must be gone. Left behind, it would keep
    -- granting select to write-holders and this migration would be decorative.
    if exists (
      select 1 from pg_catalog.pg_policy p
        join pg_catalog.pg_class c on c.oid = p.polrelid
        join pg_catalog.pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relname = v_tbl
         and p.polname = v_prefix || '_write'
    ) then
      raise exception 'the combined for-all write policy still exists on %', v_tbl;
    end if;

    -- INSERT: with check only, and no `using`, which PostgreSQL would ignore.
    select p.polcmd, pg_catalog.pg_get_expr(p.polqual, p.polrelid),
           pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid)
      into v_cmd, v_qual, v_check
      from pg_catalog.pg_policy p
      join pg_catalog.pg_class c on c.oid = p.polrelid
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = v_tbl and p.polname = v_prefix || '_insert';

    if v_check is null then
      raise exception 'insert policy on % has no with check', v_tbl;
    end if;
    if v_cmd <> 'a' then
      raise exception 'insert policy on % covers % rather than insert alone', v_tbl, v_cmd;
    end if;
    if pg_catalog.strpos(v_check, v_cap) = 0 then
      raise exception 'insert policy on % does not test %', v_tbl, v_cap;
    end if;

    -- UPDATE: both sides, both naming the same capability. An inherited
    -- `with check` would let a row be moved to another account.
    select p.polcmd, pg_catalog.pg_get_expr(p.polqual, p.polrelid),
           pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid)
      into v_cmd, v_qual, v_check
      from pg_catalog.pg_policy p
      join pg_catalog.pg_class c on c.oid = p.polrelid
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = v_tbl and p.polname = v_prefix || '_update';

    if v_qual is null then
      raise exception 'update policy on % is missing', v_tbl;
    end if;
    if v_check is null then
      raise exception 'update policy on % has an inherited with check; a row could be moved to another account', v_tbl;
    end if;
    if v_cmd <> 'w' then
      raise exception 'update policy on % covers % rather than update alone', v_tbl, v_cmd;
    end if;
    if pg_catalog.strpos(v_qual, v_cap) = 0 or pg_catalog.strpos(v_check, v_cap) = 0 then
      raise exception 'update policy on % does not test % on both sides', v_tbl, v_cap;
    end if;

    -- DELETE: using only. There is no new row.
    select p.polcmd, pg_catalog.pg_get_expr(p.polqual, p.polrelid)
      into v_cmd, v_qual
      from pg_catalog.pg_policy p
      join pg_catalog.pg_class c on c.oid = p.polrelid
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = v_tbl and p.polname = v_prefix || '_delete';

    if v_qual is null then
      raise exception 'delete policy on % is missing', v_tbl;
    end if;
    if v_cmd <> 'd' then
      raise exception 'delete policy on % covers % rather than delete alone', v_tbl, v_cmd;
    end if;
    if pg_catalog.strpos(v_qual, v_cap) = 0 then
      raise exception 'delete policy on % does not test %', v_tbl, v_cap;
    end if;

    -- THE ASSERTION THIS MIGRATION EXISTS FOR. Exactly one policy on each table
    -- may govern select for the office/owner audience, and it must be the read
    -- policy. Any `for all` policy here would re-merge read and write, which is
    -- the failure the three-policy shape was chosen to avoid.
    --
    -- job_crew_read is excluded by name: it is `for select` for a different
    -- audience and is supposed to be there.
    select pg_catalog.string_agg(p.polname, ', ')
      into v_selects
      from pg_catalog.pg_policy p
      join pg_catalog.pg_class c on c.oid = p.polrelid
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = v_tbl
       and p.polcmd in ('r', '*')
       and p.polname <> 'job_crew_read';

    if v_selects is distinct from (v_prefix || '_read') then
      raise exception 'select on % is governed by [%], not by % alone', v_tbl, v_selects, v_prefix || '_read';
    end if;

    if not exists (
      select 1 from public.office_capabilities where capability = v_cap and enabled
    ) then
      raise exception 'capability % is not enabled, so the write policies on % grant nothing', v_cap, v_tbl;
    end if;
  end loop;

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
