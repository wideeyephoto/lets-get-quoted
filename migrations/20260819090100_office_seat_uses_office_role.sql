-- Office users become their own membership role, and a workspace can no longer
-- be left with nobody who owns it.
--
-- WHAT WAS WRONG. 20260816053000 built the office-seat boundary on
-- `memberships.role = 'owner'`, because that was the only office-capable
-- identity the product had. Production also carries
-- `memberships_one_owner_per_user_idx` -- UNIQUE on (user_id) where
-- role = 'owner' -- added by 2026-08-03-one-owner-account.sql to stop a signup
-- race. Each is correct alone. Together an office invitation had exactly two
-- outcomes, and both were wrong:
--
--   * invitee already owns a workspace -> the insert trips the unique index,
--     and the RPC masks it as `office_user_target_unavailable`, an error that
--     blames the person. Not gated for later. It can never succeed.
--   * invitee owns nothing -> it succeeds, and they now hold the one owner row
--     they are permitted, on their employer's workspace, indistinguishable from
--     the founder. `ensureAccountMembership` reads exactly that row to answer
--     "does this user own a business", so the employer's workspace becomes
--     theirs and they can never make their own.
--
-- scripts/verify-office-seat-collision.mjs demonstrates both against a real
-- PostgreSQL 17. docs/office-seat-activation.md carries the full correction.
--
-- WHAT THIS CHANGES. Office users get role = 'office'. The partial unique index
-- is `where role = 'owner'`, so it stops applying to them; auth stops mistaking
-- employment for ownership; and a distinct role is the thing a narrower
-- permission set can attach to.
--
-- WHAT THIS DELIBERATELY DOES NOT CHANGE. `is_owner()` still means role =
-- 'owner' exactly, so all 63 policies built on it keep their current meaning and
-- an office user can currently read and write NOTHING. That is the intended
-- posture: every surface an office user reaches must be opened one policy at a
-- time, as a decision, rather than arriving as a side effect of this migration.
-- `has_office_access()` is defined here and used by nothing yet.
--
-- Still dark. The RPC is granted to no API role, exactly as before.

begin;

-- 20260819090000 must have committed first. Without it every 'office' literal
-- below is a type error, and this file would leave the boundary half-moved.
do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_enum e
    join pg_catalog.pg_type t on t.oid = e.enumtypid
    where t.typname = 'member_role' and e.enumlabel = 'office'
  ) then
    raise exception
      'Apply 20260819090000_office_role_value.sql first: member_role has no ''office'' value.'
      using errcode = '55000';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- The counted set is now owner + office.
-- ---------------------------------------------------------------------------
-- The founder still consumes an office seat. That is unchanged on purpose: the
-- plan catalog's `office_users` limits were written counting them, and quietly
-- making every plan one seat more generous is a pricing change, not a bug fix.
drop index if exists public.memberships_office_seat_idx;
create index if not exists memberships_office_seat_idx
  on public.memberships (account_id)
  where role in ('owner', 'office');

-- ---------------------------------------------------------------------------
-- Role predicates. `is_owner()` is untouched and lives in schema.sql.
-- ---------------------------------------------------------------------------
create or replace function public.is_office(acc uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from memberships m
    where m.account_id = acc and m.user_id = auth.uid() and m.role = 'office'
  );
$$;

-- The superset predicate: everyone who works in the office, founder included.
--
-- USED BY NO POLICY YET, and that is the point. Swapping `is_owner(account_id)`
-- for this on a given table is how one surface becomes visible to office users,
-- and each swap is a deliberate answer to "should the bookkeeper see this".
-- Defining it here, unused, keeps that answer a one-line change in one place
-- instead of a schema migration each time.
create or replace function public.has_office_access(acc uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from memberships m
    where m.account_id = acc
      and m.user_id = auth.uid()
      and m.role in ('owner', 'office')
  );
$$;

grant execute on function public.is_office(uuid) to authenticated;
grant execute on function public.has_office_access(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- A browser client still cannot enter the counted set on its own.
-- ---------------------------------------------------------------------------
create or replace function public.guard_office_seat_entry()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
declare
  v_old_counted boolean := false;
  v_new_counted boolean;
begin
  -- Both roles are counted now, so a self-insert of either is blocked, and so is
  -- a crew row updating itself into one.
  v_new_counted := new.role in ('owner', 'office');

  if tg_op = 'UPDATE' then
    v_old_counted := old.role in ('owner', 'office');
  end if;

  if current_user in ('anon', 'authenticated')
     and v_new_counted
     and (
       not v_old_counted
       or (
         tg_op = 'UPDATE'
         and (
           old.account_id is distinct from new.account_id
           or old.user_id is distinct from new.user_id
         )
       )
     ) then
    raise exception 'office_seat_entry_requires_entitlement_gate'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_office_seat_entry()
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- A workspace may be deleted. It may not be abandoned.
-- ---------------------------------------------------------------------------
-- Blocker 6 in docs/office-seat-activation.md. Once office users exist, a team
-- screen can remove memberships, and removing the last `owner` row leaves a
-- workspace with billing, a Stripe customer and live jobs that nobody can
-- administer -- `requireOwnerContext` redirects every remaining member to
-- /login. There is no application path back from that state.
--
-- Enforced in the database rather than the action, because the action is not the
-- only writer: support tooling, the service-role client and a future promotion
-- flow all reach this table.
create or replace function public.guard_last_owner()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_survivor boolean;
begin
  -- An UPDATE that leaves the row an owner of the same workspace, for the same
  -- person, has not removed anything.
  if tg_op = 'UPDATE'
     and new.role = 'owner'
     and new.account_id = old.account_id
     and new.user_id = old.user_id then
    return new;
  end if;

  if old.role <> 'owner' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  -- Deleting the WORKSPACE is allowed, and cascades through here. The parent row
  -- is already gone by the time the cascade fires, which is how this tells
  -- "close the business" apart from "remove the only owner".
  if not exists (select 1 from public.accounts a where a.id = old.account_id) then
    return old;
  end if;

  select exists (
    select 1
    from public.memberships m
    where m.account_id = old.account_id
      and m.role = 'owner'
      and m.id <> old.id
  ) into v_survivor;

  if not v_survivor then
    raise exception 'workspace_requires_one_owner'
      using errcode = 'P0001',
            detail = pg_catalog.jsonb_build_object(
              'code', 'workspace_requires_one_owner',
              'account_id', old.account_id
            )::text;
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists guard_last_owner_trigger on public.memberships;
create trigger guard_last_owner_trigger
before delete or update on public.memberships
for each row execute function public.guard_last_owner();

revoke all on function public.guard_last_owner()
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- The seat RPC now creates an office user, not a second owner.
-- ---------------------------------------------------------------------------
create or replace function public.create_office_user_membership_with_seat_entitlement(
  p_account_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_actor_id uuid := auth.uid();
  v_limits jsonb;
  v_limit_json jsonb;
  v_limit_text text;
  v_limit_numeric numeric;
  v_limit bigint;
  v_active_count bigint;
  v_entitlement_state text;
  v_existing jsonb;
  v_created jsonb;
begin
  if p_user_id is null then
    raise exception 'office_user_target_unavailable'
      using errcode = 'P0001';
  end if;

  if v_actor_id is null or not exists (
    select 1
    from public.memberships m
    where m.account_id = p_account_id
      and m.user_id = v_actor_id
      and m.role = 'owner'
  ) then
    raise exception 'office_seat_forbidden' using errcode = 'P0001';
  end if;

  -- Every counted create for one workspace waits on the same authoritative
  -- entitlement row. The lock is acquired before idempotency, count, and insert
  -- so a concurrent second call observes the first transaction's committed row.
  select e.feature_limits, e.entitlement_state
    into v_limits, v_entitlement_state
  from public.workspace_entitlements e
  where e.account_id = p_account_id
  for update;

  if not found or v_entitlement_state = 'archived' then
    raise exception 'office_seat_entitlement_unavailable'
      using errcode = 'P0001';
  end if;

  v_limit_json := v_limits -> 'office_users';
  v_limit_text := v_limit_json #>> '{}';
  if pg_catalog.jsonb_typeof(v_limit_json) <> 'number'
     or v_limit_text is null then
    raise exception 'office_seat_entitlement_unavailable'
      using errcode = 'P0001';
  end if;

  begin
    v_limit_numeric := v_limit_text::numeric;
  exception when numeric_value_out_of_range then
    raise exception 'office_seat_entitlement_unavailable'
      using errcode = 'P0001';
  end;

  if v_limit_numeric < 0
     or pg_catalog.trunc(v_limit_numeric) <> v_limit_numeric
     or v_limit_numeric > 9223372036854775807::numeric then
    raise exception 'office_seat_entitlement_unavailable'
      using errcode = 'P0001';
  end if;
  v_limit := v_limit_numeric::bigint;

  -- Same-target retries are idempotent and consume no additional seat. An owner
  -- passed here already holds office access by being an owner, so that is also
  -- a no-op rather than an error. A CREW membership is still refused: promoting
  -- someone from the field app to the office changes both their access and
  -- their crew identity, and remains an activation decision.
  select pg_catalog.to_jsonb(m)
    into v_existing
  from public.memberships m
  where m.account_id = p_account_id
    and m.user_id = p_user_id
  for update;

  if found then
    if v_existing ->> 'role' in ('office', 'owner') then
      return v_existing;
    end if;
    raise exception 'office_membership_role_conflict'
      using errcode = 'P0001';
  end if;

  -- Owners and office users both occupy office seats, and the founder is
  -- intentionally not excluded. Membership-row presence is still the whole
  -- active lifecycle; there is no suspended state to filter yet.
  select pg_catalog.count(*)
    into v_active_count
  from public.memberships m
  where m.account_id = p_account_id
    and m.role in ('owner', 'office');

  if v_active_count > v_limit then
    raise exception 'office_seat_remediation_required'
      using errcode = 'P0001',
            detail = pg_catalog.jsonb_build_object(
              'code', 'office_seat_remediation_required',
              'active_count', v_active_count,
              'office_limit', v_limit
            )::text;
  end if;

  if v_active_count = v_limit then
    raise exception 'office_seat_limit_reached'
      using errcode = 'P0001',
            detail = pg_catalog.jsonb_build_object(
              'code', 'office_seat_limit_reached',
              'active_count', v_active_count,
              'office_limit', v_limit
            )::text;
  end if;

  begin
    insert into public.memberships as m (account_id, user_id, role)
    values (p_account_id, p_user_id, 'office')
    returning pg_catalog.to_jsonb(m) into v_created;
  exception
    when unique_violation or foreign_key_violation then
      -- Now genuinely about the target: a missing auth user, or a row that
      -- appeared between the lock and the insert. It is no longer the
      -- one-owner-per-user index, which does not apply to an office row.
      raise exception 'office_user_target_unavailable'
        using errcode = 'P0001';
  end;

  return v_created;
end;
$$;

revoke all on function public.create_office_user_membership_with_seat_entitlement(uuid, uuid)
  from public, anon, authenticated, service_role;

-- Deliberately still no GRANT. A separate activation migration must first add
-- invitation/acceptance authorization and then expose the function to only the
-- role that flow uses.

-- ---------------------------------------------------------------------------
-- Post-checks. Fail the transaction rather than leave the boundary half-moved.
-- ---------------------------------------------------------------------------
do $$
declare
  v_grantees text;
begin
  if not exists (
    select 1 from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'has_office_access'
  ) then
    raise exception 'has_office_access was not created';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_trigger
    where tgname = 'guard_last_owner_trigger' and not tgisinternal
  ) then
    raise exception 'guard_last_owner_trigger was not created';
  end if;

  -- The whole point of the boundary: nothing can call the seat RPC yet.
  select pg_catalog.string_agg(a.grantee, ', ')
    into v_grantees
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  cross join lateral pg_catalog.aclexplode(coalesce(p.proacl, '{}'::aclitem[])) x
  cross join lateral (
    select pg_catalog.pg_get_userbyid(x.grantee) as grantee, x.privilege_type
  ) a
  where n.nspname = 'public'
    and p.proname = 'create_office_user_membership_with_seat_entitlement'
    and a.privilege_type = 'EXECUTE'
    and a.grantee <> pg_catalog.pg_get_userbyid(p.proowner);

  if v_grantees is not null then
    raise exception 'seat RPC is reachable by: %', v_grantees;
  end if;
end $$;

commit;
