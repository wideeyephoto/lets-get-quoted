-- G5: the customer-facing status page.
--
-- platform_incidents shipped RLS-enabled with NO policy, which made it
-- unreachable from the browser roles -- that is why /status could not exist.
-- This opens exactly one hole in that wall: a row a human deliberately marked
-- published, read through a named list of columns, and nothing else.
--
-- WHAT THIS DELIBERATELY DOES NOT PUBLISH. The table carries the internal half
-- of an incident write-up: root_cause, owner, created_by, external_url,
-- affected_services, created_at. A policy on its own would have exposed every
-- one of them, because a policy filters ROWS and says nothing about COLUMNS --
-- `select *` against a published row would have returned the post-mortem and
-- the staff email that wrote it. The column grant below is what keeps those
-- server-side, and a column added by a later migration is not in it, so new
-- columns fail closed rather than publishing themselves.
begin;

alter table public.platform_incidents add column if not exists published boolean not null default false;

-- REVOKE ALL, then grant back exactly the read. Naming the privileges to remove
-- is the wrong shape: Supabase's default privileges grant ALL on every new
-- table in `public` to anon and authenticated, and that ALL includes TRUNCATE.
--
-- TRUNCATE IS NOT SUBJECT TO RLS. A policy restricts select/insert/update/delete
-- and does nothing at all about a truncate, so this table -- RLS on, no policy,
-- believed unreachable since 2026-08-06 -- has been emptiable by any browser
-- session for as long as it has existed. Removing a named list leaves behind
-- whatever the list forgot; removing everything and granting back what is
-- needed cannot.
revoke all on table public.platform_incidents from public, anon, authenticated;
grant select (
  id, kind, title, description, severity,
  impact_summary, resolution_summary,
  started_at, resolved_at, published
) on table public.platform_incidents to anon, authenticated;

-- Signed out and signed in read the same public page, so both browser roles get
-- the policy. Writes do not move: they stay on the service-role client behind
-- requireMfaPermission('ops.manage') in src/app/admin/incidents/actions.ts.
drop policy if exists "Anon can read published incidents" on public.platform_incidents;
drop policy if exists platform_incidents_public_read on public.platform_incidents;
create policy platform_incidents_public_read
  on public.platform_incidents
  for select
  to anon, authenticated
  using (published);

-- The page reads published rows newest-first and nothing else does.
create index if not exists platform_incidents_published_idx
  on public.platform_incidents (started_at desc) where published;

-- Post-conditions. Each one is a property this migration exists to establish,
-- checked against the catalog rather than assumed from the statements above.
do $$
declare
  v_writable text;
  v_leaked text[];
  v_private constant text[] := array['root_cause', 'owner', 'created_by', 'external_url', 'affected_services', 'created_at'];
  v_role text;
  v_col text;
begin
  if not exists (
    select 1 from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'platform_incidents' and c.relrowsecurity
  ) then
    raise exception 'row level security is not enabled on platform_incidents';
  end if;

  -- The property that matters most: a browser role may read a published row and
  -- may not write any of it. TRUNCATE is in this list precisely because RLS
  -- does not cover it.
  select pg_catalog.string_agg(distinct g.who || ':' || g.priv, ', ') into v_writable
  from (
    select pg_catalog.pg_get_userbyid(x.grantee) as who, x.privilege_type as priv
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    cross join lateral pg_catalog.aclexplode(coalesce(c.relacl, '{}'::aclitem[])) x
    where n.nspname = 'public' and c.relname = 'platform_incidents'
  ) g
  where g.who in ('anon', 'authenticated', 'public')
    and g.priv in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE');
  if v_writable is not null then
    raise exception 'browser roles can write platform_incidents: %', v_writable;
  end if;

  -- The internal half of a write-up stays internal even on a published row.
  foreach v_col in array v_private loop
    foreach v_role in array array['anon', 'authenticated'] loop
      if pg_catalog.has_column_privilege(v_role, 'public.platform_incidents', v_col, 'SELECT') then
        v_leaked := coalesce(v_leaked, '{}'::text[]) || (v_role || '.' || v_col);
      end if;
    end loop;
  end loop;
  if v_leaked is not null then
    raise exception 'internal incident columns are readable by browser roles: %', array_to_string(v_leaked, ', ');
  end if;

  -- And the read the page depends on is actually there.
  if not pg_catalog.has_column_privilege('anon', 'public.platform_incidents', 'title', 'SELECT') then
    raise exception 'anon cannot read the columns /status renders';
  end if;
end;
$$;

commit;
