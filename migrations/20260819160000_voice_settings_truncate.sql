-- Take TRUNCATE away from the browser roles on voice_settings.
--
-- WHAT WENT WRONG. 20260819140000 created the table, enabled row level security
-- and wrote an owner-only policy — and revoked nothing, on the assumption that
-- RLS was the whole of the access control. It is not.
--
-- **TRUNCATE is not subject to row level security.** A policy governs select,
-- insert, update and delete; PostgreSQL checks TRUNCATE against the table
-- privilege alone. Supabase's default privileges grant ALL on every new table in
-- `public` to `anon` and `authenticated`, and that ALL includes TRUNCATE. So
-- from the moment 20260819140000 applied, any authenticated session could empty
-- voice_settings — every workspace's receptionist configuration at once, not
-- just their own, with the policy looking correct the whole time.
--
-- HOW IT WAS FOUND. Not by review. 20260819150000 carries a post-condition that
-- refuses to commit if any browser role can write its table, and it failed on
-- production with `voice_calls is writable by: anon:TRUNCATE,
-- authenticated:TRUNCATE`. The migration aborted having applied nothing, which
-- is what that check exists for. voice_settings has no such check, which is why
-- it shipped.
--
-- WHY `revoke all` AND NOT `revoke truncate`. Naming the privilege to remove is
-- the mistake that caused this: a named list leaves behind whatever the list
-- forgot. Revoking everything and granting back exactly what the policy needs
-- cannot leave a gap, and it states the intended reach in one place.
--
-- Additive and safe on a live table: it changes privileges, never rows. The
-- service-role client bypasses grants entirely, so the receipt boundary and the
-- server actions are unaffected.

begin;

revoke all on table public.voice_settings from public, anon, authenticated;

-- Exactly what `voice_settings_owner_all` needs to be able to do anything at
-- all. RLS then scopes each of these to the caller's own workspace.
grant select, insert, update, delete on table public.voice_settings to authenticated;

do $$
declare
  v_bad text;
begin
  select pg_catalog.string_agg(distinct g.who || ':' || g.priv, ', ') into v_bad
  from (
    select pg_catalog.pg_get_userbyid(x.grantee) as who, x.privilege_type as priv
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    cross join lateral pg_catalog.aclexplode(coalesce(c.relacl, '{}'::aclitem[])) x
    where n.nspname = 'public' and c.relname = 'voice_settings'
  ) g
  where (g.who = 'anon')
     or (g.who in ('authenticated', 'public') and g.priv in ('TRUNCATE', 'REFERENCES', 'TRIGGER'));

  if v_bad is not null then
    raise exception 'voice_settings is still reachable by: %', v_bad;
  end if;

  -- And the policy that does the actual scoping is still there, since revoking
  -- everything would otherwise look like a fix while removing the read too.
  if not exists (
    select 1 from pg_catalog.pg_policy
    where polrelid = 'public.voice_settings'::regclass
      and polname = 'voice_settings_owner_all'
  ) then
    raise exception 'voice_settings_owner_all policy is missing';
  end if;
end $$;

commit;
