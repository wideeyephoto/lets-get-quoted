-- -------------------------------------------------------------------------
-- Forward Migration: Crew Create & Reactivate RPCs Canonical Definitions
--
-- Re-applies the canonical implementations of create_crew_member_with_seat_entitlement
-- and reactivate_crew_member_with_seat_entitlement.
--
-- Guarantees:
--  1. Authorization: Allows account owners OR active office members with crew.write.
--  2. Capacity: Adds plan feature_limits('crew_users') + workspace_purchased_capacity_units.
--  3. Concurrency: Serializes on workspace_entitlements FOR UPDATE lock.
--  4. Employee Count: Only counts active, non-deleted employees (subcontractors unmetered).
--  5. Remediation details: Surfaces active_count and crew_limit JSON details on cap error.
-- -------------------------------------------------------------------------

begin;

-- 1. create_crew_member_with_seat_entitlement
create or replace function public.create_crew_member_with_seat_entitlement(
  p_account_id uuid,
  p_name text,
  p_phone text,
  p_email text,
  p_role_label text,
  p_photo_path text,
  p_hourly_rate numeric,
  p_pay_type text,
  p_annual_salary numeric,
  p_day_rate numeric,
  p_payroll_id text
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
  v_created jsonb;
begin
  if v_actor_id is null or not (
    public.is_owner(p_account_id)
    or public.office_can(p_account_id, 'crew.write')
  ) then
    raise exception 'crew_seat_forbidden' using errcode = 'P0001';
  end if;

  select e.feature_limits, e.entitlement_state
    into v_limits, v_entitlement_state
  from public.workspace_entitlements e
  where e.account_id = p_account_id
  for update;

  if not found or v_entitlement_state = 'archived' then
    raise exception 'crew_seat_entitlement_unavailable'
      using errcode = 'P0001';
  end if;

  v_limit_json := v_limits -> 'crew_users';
  v_limit_text := v_limit_json #>> '{}';
  if pg_catalog.jsonb_typeof(v_limit_json) <> 'number'
     or v_limit_text is null then
    raise exception 'crew_seat_entitlement_unavailable'
      using errcode = 'P0001';
  end if;

  begin
    v_limit_numeric := v_limit_text::numeric;
  exception when numeric_value_out_of_range then
    raise exception 'crew_seat_entitlement_unavailable'
      using errcode = 'P0001';
  end;

  if v_limit_numeric < 0
     or pg_catalog.trunc(v_limit_numeric) <> v_limit_numeric
     or v_limit_numeric > 9223372036854775807::numeric then
    raise exception 'crew_seat_entitlement_unavailable'
      using errcode = 'P0001';
  end if;
  v_limit := v_limit_numeric::bigint
    + public.workspace_purchased_capacity_units(p_account_id, 'crew_users');

  select pg_catalog.count(*)
    into v_active_count
  from public.crew c
  where c.account_id = p_account_id
    and c.active = true
    and c.deleted_at is null
    and c.worker_type = 'employee';

  if v_active_count > v_limit then
    raise exception 'crew_seat_remediation_required'
      using errcode = 'P0001',
            detail = pg_catalog.jsonb_build_object(
              'code', 'crew_seat_remediation_required',
              'active_count', v_active_count,
              'crew_limit', v_limit
            )::text;
  end if;

  if v_active_count = v_limit then
    raise exception 'crew_seat_limit_reached'
      using errcode = 'P0001',
            detail = pg_catalog.jsonb_build_object(
              'code', 'crew_seat_limit_reached',
              'active_count', v_active_count,
              'crew_limit', v_limit
            )::text;
  end if;

  insert into public.crew as c (
    account_id,
    name,
    phone,
    email,
    role_label,
    photo_path,
    hourly_rate,
    pay_type,
    annual_salary,
    day_rate,
    payroll_id,
    worker_type,
    active
  ) values (
    p_account_id,
    p_name,
    p_phone,
    p_email,
    p_role_label,
    p_photo_path,
    p_hourly_rate,
    p_pay_type,
    p_annual_salary,
    p_day_rate,
    p_payroll_id,
    'employee',
    true
  )
  returning pg_catalog.to_jsonb(c) into v_created;

  return v_created;
end;
$$;

-- 2. reactivate_crew_member_with_seat_entitlement
create or replace function public.reactivate_crew_member_with_seat_entitlement(
  p_account_id uuid,
  p_crew_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_actor_id uuid := auth.uid();
  v_member public.crew%rowtype;
  v_worker_type text;
  v_limits jsonb;
  v_limit_json jsonb;
  v_limit_text text;
  v_limit_numeric numeric;
  v_limit bigint;
  v_active_count bigint;
  v_entitlement_state text;
begin
  if v_actor_id is null or not (
    public.is_owner(p_account_id)
    or public.office_can(p_account_id, 'crew.write')
  ) then
    raise exception 'crew_seat_forbidden' using errcode = 'P0001';
  end if;

  select c.*
    into v_member
  from public.crew c
  where c.account_id = p_account_id
    and c.id = p_crew_id
    and c.deleted_at is null;

  if not found then
    raise exception 'crew_member_not_found' using errcode = 'P0001';
  end if;

  if v_member.active then
    return true;
  end if;

  v_worker_type := coalesce(v_member.worker_type, 'employee');
  if v_worker_type <> 'employee' then
    update public.crew as c
    set active = true
    where c.account_id = p_account_id
      and c.id = p_crew_id
      and c.deleted_at is null
    returning c.* into v_member;
    if not found then
      raise exception 'crew_member_not_found' using errcode = 'P0001';
    end if;
    return true;
  end if;

  select e.feature_limits, e.entitlement_state
    into v_limits, v_entitlement_state
  from public.workspace_entitlements e
  where e.account_id = p_account_id
  for update;

  if not found or v_entitlement_state = 'archived' then
    raise exception 'crew_seat_entitlement_unavailable'
      using errcode = 'P0001';
  end if;

  v_limit_json := v_limits -> 'crew_users';
  v_limit_text := v_limit_json #>> '{}';
  if pg_catalog.jsonb_typeof(v_limit_json) <> 'number'
     or v_limit_text is null then
    raise exception 'crew_seat_entitlement_unavailable'
      using errcode = 'P0001';
  end if;

  begin
    v_limit_numeric := v_limit_text::numeric;
  exception when numeric_value_out_of_range then
    raise exception 'crew_seat_entitlement_unavailable'
      using errcode = 'P0001';
  end;

  if v_limit_numeric < 0
     or pg_catalog.trunc(v_limit_numeric) <> v_limit_numeric
     or v_limit_numeric > 9223372036854775807::numeric then
    raise exception 'crew_seat_entitlement_unavailable'
      using errcode = 'P0001';
  end if;
  v_limit := v_limit_numeric::bigint
    + public.workspace_purchased_capacity_units(p_account_id, 'crew_users');

  select c.*
    into v_member
  from public.crew c
  where c.account_id = p_account_id
    and c.id = p_crew_id
    and c.deleted_at is null
  for update;

  if not found then
    raise exception 'crew_member_not_found' using errcode = 'P0001';
  end if;
  if v_member.active then
    return true;
  end if;
  if coalesce(v_member.worker_type, 'employee') <> 'employee' then
    update public.crew
    set active = true
    where account_id = p_account_id
      and id = p_crew_id
      and active = false;
    return true;
  end if;

  select pg_catalog.count(*)
    into v_active_count
  from public.crew c
  where c.account_id = p_account_id
    and c.active = true
    and c.deleted_at is null
    and c.worker_type = 'employee';

  if v_active_count > v_limit then
    raise exception 'crew_seat_remediation_required'
      using errcode = 'P0001',
            detail = pg_catalog.jsonb_build_object(
              'code', 'crew_seat_remediation_required',
              'active_count', v_active_count,
              'crew_limit', v_limit
            )::text;
  end if;

  if v_active_count = v_limit then
    raise exception 'crew_seat_limit_reached'
      using errcode = 'P0001',
            detail = pg_catalog.jsonb_build_object(
              'code', 'crew_seat_limit_reached',
              'active_count', v_active_count,
              'crew_limit', v_limit
            )::text;
  end if;

  update public.crew
    set active = true,
        updated_at = pg_catalog.now()
  where id = p_crew_id
    and account_id = p_account_id;

  return true;
end;
$$;

revoke all on function public.create_crew_member_with_seat_entitlement(uuid,text,text,text,text,text,numeric,text,numeric,numeric,text) from public, anon, service_role;
grant execute on function public.create_crew_member_with_seat_entitlement(uuid,text,text,text,text,text,numeric,text,numeric,numeric,text) to authenticated;

revoke all on function public.reactivate_crew_member_with_seat_entitlement(uuid,uuid) from public, anon, service_role;
grant execute on function public.reactivate_crew_member_with_seat_entitlement(uuid,uuid) to authenticated;

commit;
