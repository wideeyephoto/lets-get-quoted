-- Normalise stored function bodies in `public` from CRLF to LF.
--
-- WHY THIS EXISTS. `scripts/run-migration.mjs` used to hand the migration file to
-- Postgres byte for byte. `core.autocrlf` is true in this repo, so a checkout on
-- Windows produces CRLF on disk, and whatever is sent is what
-- `pg_get_functiondef` returns afterwards. Line endings in a function body are
-- invisible until something reads the body back as text — and several migrations
-- do exactly that. 20260816194056 and 20260816213000 patch existing functions by
-- reading the definition, asserting a multi-line needle occurs exactly once, then
-- replacing it: twenty-five such patches between them.
--
-- A CRLF needle cannot match an LF body. So those migrations refuse with
-- "<name> source contract drifted" (SQLSTATE 55000) purely on the line endings of
-- whoever applied the prerequisite — which is how production reached a mixed
-- state: functions from 20260816050000 stored LF, functions applied later through
-- the runner stored CRLF. 20260816194056 refused on
-- `compute_direct_charge_refund_plan` for this reason and nothing else.
--
-- The runner now normalises at the read site, so a fresh database never needs
-- this file: it finds nothing to rewrite and is a no-op. It exists to repair a
-- database that was migrated before that fix.
--
-- SAFETY. This refuses to run unless every CR in every body is part of a CRLF
-- pair, which makes the rewrite whitespace-only. `create or replace function`
-- preserves privileges and does not disturb `comment on`. Re-running is a no-op.

begin;

do $$
declare
  r record;
  v_def text;
  v_lone_cr integer;
  v_rewritten integer := 0;
begin
  -- A CR that is not followed by LF would be data rather than a line ending, and
  -- stripping it could change behaviour. Fail closed instead.
  select pg_catalog.count(*)
    into v_lone_cr
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    join pg_catalog.pg_language l on l.oid = p.prolang
   where n.nspname = 'public'
     and p.prokind = 'f'
     and l.lanname in ('plpgsql', 'sql')
     and pg_catalog.strpos(
           pg_catalog.replace(
             pg_catalog.pg_get_functiondef(p.oid),
             pg_catalog.chr(13) || pg_catalog.chr(10),
             ''
           ),
           pg_catalog.chr(13)
         ) > 0;

  if v_lone_cr > 0 then
    raise exception
      'refusing to normalise: % function bodies carry a CR outside a CRLF pair', v_lone_cr
      using errcode = '55000';
  end if;

  for r in
    select p.oid as oid
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      join pg_catalog.pg_language l on l.oid = p.prolang
     where n.nspname = 'public'
       and p.prokind = 'f'
       and l.lanname in ('plpgsql', 'sql')
       and pg_catalog.strpos(
             pg_catalog.pg_get_functiondef(p.oid),
             pg_catalog.chr(13)
           ) > 0
     order by p.oid::pg_catalog.regprocedure::text
  loop
    v_def := pg_catalog.replace(
      pg_catalog.pg_get_functiondef(r.oid),
      pg_catalog.chr(13) || pg_catalog.chr(10),
      pg_catalog.chr(10)
    );
    execute v_def;
    v_rewritten := v_rewritten + 1;
  end loop;

  raise notice 'normalised % function body/bodies to LF', v_rewritten;
end
$$;

-- Prove it, in the same transaction, so a partial rewrite cannot commit.
do $$
declare
  v_left integer;
begin
  select pg_catalog.count(*)
    into v_left
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    join pg_catalog.pg_language l on l.oid = p.prolang
   where n.nspname = 'public'
     and p.prokind = 'f'
     and l.lanname in ('plpgsql', 'sql')
     and pg_catalog.strpos(
           pg_catalog.pg_get_functiondef(p.oid),
           pg_catalog.chr(13)
         ) > 0;

  if v_left <> 0 then
    raise exception
      'normalisation incomplete: % function bodies still carry CR', v_left
      using errcode = '55000';
  end if;
end
$$;

commit;
