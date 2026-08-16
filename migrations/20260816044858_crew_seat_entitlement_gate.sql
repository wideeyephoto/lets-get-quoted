-- Dark crew-seat entitlement enforcement.
--
-- The server rollout flag decides whether normal crew writes use the RPCs
-- below. This migration only installs the atomic boundary and narrows browser
-- writes; it does not change a workspace plan, rewrite an entitlement, or
-- archive/delete any existing person. A workspace that already has more active
-- employees than its allowance remains exactly as it is and receives the
-- explicit remediation error on its next counted add/reactivation.

begin;

-- The current crew model adds this column in the subcontractor migration. Keep
-- this migration independently safe to stage first: rows that predate the
-- distinction are employees, which is that column's established default.
alter table public.crew
  add column if not exists worker_type text not null default 'employee';

create index if not exists crew_active_employee_seat_idx
  on public.crew (account_id)
  where active = true
    and deleted_at is null
    and worker_type = 'employee';

-- Direct authenticated writes may still edit an active employee or move one
-- out of the counted set. Entering the counted set is reserved for the atomic
-- RPCs: INSERT, reactivation, undelete, and reclassification cannot race or
-- route around the entitlement check through PostgREST.
create or replace function public.guard_crew_seat_entry()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
declare
  v_old_counted boolean := false;
  v_new_counted boolean;
begin
  v_new_counted := new.active
    and new.deleted_at is null
    and new.worker_type = 'employee';

  if tg_op = 'UPDATE' then
    v_old_counted := old.active
      and old.deleted_at is null
      and old.worker_type = 'employee';

    if current_user in ('anon', 'authenticated')
       and old.worker_type is distinct from new.worker_type then
      raise exception 'crew_worker_type_change_requires_trusted_path'
        using errcode = 'P0001';
    end if;
  end if;

  if current_user in ('anon', 'authenticated')
     and v_new_counted
     and (
       not v_old_counted
       or (tg_op = 'UPDATE' and old.account_id is distinct from new.account_id)
     ) then
    raise exception 'crew_seat_entry_requires_entitlement_gate'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_crew_seat_entry_trigger on public.crew;
create trigger guard_crew_seat_entry_trigger
before insert or update on public.crew
for each row execute function public.guard_crew_seat_entry();

revoke all on function public.guard_crew_seat_entry() from public, anon, authenticated;

-- Replace the old FOR ALL owner policy with operation-specific policies. An
-- owner may still read, edit, deactivate, and delete exactly as before.
-- Subcontractors remain directly insertable because they are not crew-user
-- identities and their existing action is intentionally outside this gate.
drop policy if exists crew_owner on public.crew;
drop policy if exists crew_owner_select on public.crew;
drop policy if exists crew_owner_update on public.crew;
drop policy if exists crew_owner_delete on public.crew;
drop policy if exists crew_owner_insert_subcontractor on public.crew;

create policy crew_owner_select
on public.crew
for select
to authenticated
using ((select public.is_owner(account_id)));

create policy crew_owner_update
on public.crew
for update
to authenticated
using ((select public.is_owner(account_id)))
with check ((select public.is_owner(account_id)));

create policy crew_owner_delete
on public.crew
for delete
to authenticated
using ((select public.is_owner(account_id)));

create policy crew_owner_insert_subcontractor
on public.crew
for insert
to authenticated
with check (
  (select public.is_owner(account_id))
  and worker_type = 'subcontractor'
);

-- Insert one employee after serializing on this workspace's authoritative
-- entitlement row. Invitation/login fields do not participate: a crew row is
-- already the identity in this data model. Archived/deleted employees are out
-- of the active roster; access_revoked_at only revokes the field app and does
-- not stop the person occupying an active crew seat.
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
  if v_actor_id is null or not exists (
    select 1
    from public.memberships m
    where m.account_id = p_account_id
      and m.user_id = v_actor_id
      and m.role = 'owner'
  ) then
    raise exception 'crew_seat_forbidden' using errcode = 'P0001';
  end if;

  -- FOR UPDATE is the concurrency primitive. Every counted create/reactivation
  -- for one workspace waits on this same row before it counts, so the second
  -- transaction observes the first transaction's committed employee.
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
  v_limit := v_limit_numeric::bigint;

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

-- Reactivation is another transition into the counted set. Employees acquire
-- the same entitlement lock as creates before locking their crew row, keeping
-- lock order consistent. Subcontractors are reactivated without consulting
-- crew_users because their established worker_type excludes them.
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
  if v_actor_id is null or not exists (
    select 1
    from public.memberships m
    where m.account_id = p_account_id
      and m.user_id = v_actor_id
      and m.role = 'owner'
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

  v_worker_type := v_member.worker_type;
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
  v_limit := v_limit_numeric::bigint;

  -- Re-read under lock after the entitlement lock. A concurrent toggle that
  -- completed while this call waited is now visible and cannot be double-counted.
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
  if v_member.worker_type <> 'employee' then
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
  set active = true
  where account_id = p_account_id
    and id = p_crew_id
    and active = false;

  return true;
end;
$$;

revoke all on function public.create_crew_member_with_seat_entitlement(
  uuid, text, text, text, text, text, numeric, text, numeric, numeric, text
) from public, anon, authenticated, service_role;
grant execute on function public.create_crew_member_with_seat_entitlement(
  uuid, text, text, text, text, text, numeric, text, numeric, numeric, text
) to authenticated;

revoke all on function public.reactivate_crew_member_with_seat_entitlement(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.reactivate_crew_member_with_seat_entitlement(uuid, uuid)
  to authenticated;

commit;
