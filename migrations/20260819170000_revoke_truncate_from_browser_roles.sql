-- Take TRUNCATE away from anon and authenticated, on every table in public.
--
-- WHY. A survey of production found 84 tables with TRUNCATE granted to both
-- browser roles. Every one has row level security enabled. Every one looks
-- protected. **TRUNCATE is not subject to row level security**: PostgreSQL
-- checks it against the table privilege alone, so a policy that correctly scopes
-- select, insert, update and delete says nothing about emptying the table
-- outright — for every workspace at once, not just the caller's own.
--
-- The list is not obscure. accounts, leads, clients, jobs, invoices, payments,
-- memberships, crew_pay_entries, sms_consent, magic_link_tokens, staff.
--
-- HOW IT GOT THERE. Nobody granted it. Supabase sets default privileges that
-- grant ALL on every new table in `public` to anon, authenticated and
-- service_role, so each table arrives with TRUNCATE already attached and RLS is
-- then relied upon to do the rest. It does the rest, except this.
--
-- HOW IT WAS FOUND. Not by review. 20260819150000 carried a post-condition that
-- refuses to commit if any browser role can write its own table, and it failed
-- on production with `anon:TRUNCATE, authenticated:TRUNCATE`. The survey that
-- followed found the other 83.
--
-- HOW EXPLOITABLE IS IT, HONESTLY. Not directly, today. PostgREST exposes no
-- TRUNCATE verb, and no function in this schema issues one, so there is no path
-- from a browser session to a truncate right now. This is a missing layer rather
-- than an open door — and it is the layer that stops the next SECURITY INVOKER
-- function, or the next direct connection made with one of these roles, from
-- being a catastrophe instead of a bug.
--
-- WHAT THIS CANNOT BREAK. Nothing in the application truncates anything. The
-- service-role client keeps every privilege it has; only anon and authenticated
-- are narrowed, and only for a verb neither has ever used.

begin;

revoke truncate on all tables in schema public from anon, authenticated;
revoke truncate on all tables in schema public from public;

-- And for tables that do not exist yet, or this is a one-off that decays.
--
-- Default privileges are recorded per creating role, so this covers tables
-- created by `postgres` — which is what runs migrations here, confirmed by
-- `current_user` in the operator's own preflight. A table created by some other
-- role would still arrive with the grant; the post-condition below cannot see
-- into the future, so the check that matters long term is the one each new
-- table's own migration carries.
alter default privileges for role postgres in schema public
  revoke truncate on tables from anon, authenticated;

do $$
declare
  v_left text;
  v_count integer;
begin
  select pg_catalog.count(*), pg_catalog.string_agg(distinct rel, ', ')
    into v_count, v_left
  from (
    select c.relname as rel
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    cross join lateral pg_catalog.aclexplode(coalesce(c.relacl, '{}'::aclitem[])) x
    where n.nspname = 'public'
      and c.relkind = 'r'
      and x.privilege_type = 'TRUNCATE'
      and pg_catalog.pg_get_userbyid(x.grantee) in ('anon', 'authenticated')
  ) s;

  if v_count > 0 then
    raise exception '% table(s) still truncatable by a browser role: %', v_count, pg_catalog.left(v_left, 400);
  end if;

  -- service_role must NOT have been caught by this. It bypasses RLS and does
  -- the trusted server work; narrowing it here would be a different and much
  -- worse migration than the one this is meant to be.
  if not exists (
    select 1
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    cross join lateral pg_catalog.aclexplode(coalesce(c.relacl, '{}'::aclitem[])) x
    where n.nspname = 'public'
      and c.relname = 'accounts'
      and pg_catalog.pg_get_userbyid(x.grantee) = 'service_role'
      and x.privilege_type = 'SELECT'
  ) then
    raise exception 'service_role lost access to accounts; this migration went too wide';
  end if;

  -- The reads the product depends on are untouched: this removed one verb, and
  -- a run that also removed SELECT would look identical until a page loaded.
  if not exists (
    select 1
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    cross join lateral pg_catalog.aclexplode(coalesce(c.relacl, '{}'::aclitem[])) x
    where n.nspname = 'public'
      and c.relname = 'leads'
      and pg_catalog.pg_get_userbyid(x.grantee) = 'authenticated'
      and x.privilege_type = 'SELECT'
  ) then
    raise exception 'authenticated lost SELECT on leads; this migration went too wide';
  end if;
end $$;

commit;
