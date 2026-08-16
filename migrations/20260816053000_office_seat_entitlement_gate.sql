-- Dark office-seat entitlement boundary.
--
-- The only office-capable identity in the current product is a memberships row
-- whose role is `owner`. Every such row counts, including the founder. There is
-- no office-user invitation, permission-role, suspension, or reactivation model
-- yet, so this migration deliberately does not invent one or wire an active
-- caller. The server rollout flag remains the application activation boundary.
--
-- Existing rows are never changed. A workspace already above its allowance is
-- left intact and receives an explicit remediation error only if a future
-- enabled caller attempts to add another owner membership.

begin;

create index if not exists memberships_office_seat_idx
  on public.memberships (account_id)
  where role = 'owner';

-- Existing membership RLS lets a workspace owner manage rows for that
-- workspace. Preserve its read/update/delete behavior, but prevent a browser
-- client from entering the counted owner set outside the atomic RPC. Trusted
-- service-role bootstrap and crew-link writes remain exactly as they are.
create or replace function public.guard_office_seat_entry()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
declare
  v_old_counted boolean := false;
  v_new_counted boolean;
begin
  v_new_counted := new.role = 'owner';

  if tg_op = 'UPDATE' then
    v_old_counted := old.role = 'owner';
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

drop trigger if exists guard_office_seat_entry_trigger on public.memberships;
create trigger guard_office_seat_entry_trigger
before insert or update on public.memberships
for each row execute function public.guard_office_seat_entry();

revoke all on function public.guard_office_seat_entry()
  from public, anon, authenticated, service_role;

-- Atomically add one future office identity. This takes an existing auth user
-- id because invitation/auth provisioning semantics do not exist yet and are
-- intentionally outside this foundation. The function still verifies that its
-- eventual actor owns the exact workspace, but this migration grants EXECUTE to
-- no API role: tenant binding alone is not invitation/acceptance authorization.
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

  -- Same-target retries are idempotent and consume no additional seat. A crew
  -- membership cannot silently become an owner membership: promotion semantics
  -- affect both access and crew identity and remain an activation decision.
  select pg_catalog.to_jsonb(m)
    into v_existing
  from public.memberships m
  where m.account_id = p_account_id
    and m.user_id = p_user_id
  for update;

  if found then
    if v_existing ->> 'role' = 'owner' then
      return v_existing;
    end if;
    raise exception 'office_membership_role_conflict'
      using errcode = 'P0001';
  end if;

  -- Presence of an owner membership is the complete active-office lifecycle in
  -- today's schema. There is no status timestamp to filter, and the founder is
  -- intentionally not excluded from this count.
  select pg_catalog.count(*)
    into v_active_count
  from public.memberships m
  where m.account_id = p_account_id
    and m.role = 'owner';

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
    values (p_account_id, p_user_id, 'owner')
    returning pg_catalog.to_jsonb(m) into v_created;
  exception
    when unique_violation or foreign_key_violation then
      -- Do not disclose whether the target user belongs to another workspace or
      -- does not exist. Both require the future invitation flow to resolve.
      raise exception 'office_user_target_unavailable'
        using errcode = 'P0001';
  end;

  return v_created;
end;
$$;

revoke all on function public.create_office_user_membership_with_seat_entitlement(uuid, uuid)
  from public, anon, authenticated, service_role;

-- Deliberately no GRANT. A separate activation migration must first add the
-- approved invitation/acceptance authorization and then expose the function to
-- only the role used by that flow. Until then even a current owner cannot call
-- this SECURITY DEFINER function through PostgREST.

commit;
