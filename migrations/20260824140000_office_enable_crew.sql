-- Enable crew.read and crew.write capabilities in public.office_capabilities
-- and update RLS policies for crew, subcontractor_requests, subcontractor_offers,
-- and subcontractor_reviews, as well as the seat entitlement functions.

begin;

update public.office_capabilities
   set enabled = true,
       updated_at = pg_catalog.now()
 where capability in ('crew.read', 'crew.write');

-- 1. crew table
drop policy if exists crew_owner_select on public.crew;
drop policy if exists crew_owner_update on public.crew;
drop policy if exists crew_owner_delete on public.crew;
drop policy if exists crew_owner_insert_subcontractor on public.crew;
drop policy if exists crew_office_select on public.crew;
drop policy if exists crew_office_update on public.crew;
drop policy if exists crew_office_delete on public.crew;
drop policy if exists crew_office_insert_subcontractor on public.crew;

create policy crew_office_select
on public.crew
for select
to authenticated
using (public.office_can(account_id, 'crew.read'));

create policy crew_office_update
on public.crew
for update
to authenticated
using (public.office_can(account_id, 'crew.write'))
with check (public.office_can(account_id, 'crew.write'));

create policy crew_office_delete
on public.crew
for delete
to authenticated
using (public.office_can(account_id, 'crew.write'));

create policy crew_office_insert_subcontractor
on public.crew
for insert
to authenticated
with check (
  public.office_can(account_id, 'crew.write')
  and worker_type = 'subcontractor'
);

-- 2. create_crew_member_with_seat_entitlement RPC update
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

-- 3. reactivate_crew_member_with_seat_entitlement RPC update
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


-- 4. subcontractor tables RLS
alter table if exists subcontractor_requests enable row level security;
drop policy if exists subcontractor_requests_owner on subcontractor_requests;
drop policy if exists subcontractor_requests_select on subcontractor_requests;
drop policy if exists subcontractor_requests_modify on subcontractor_requests;

create policy subcontractor_requests_select on subcontractor_requests
  for select using (office_can(account_id, 'crew.read'));

create policy subcontractor_requests_modify on subcontractor_requests
  for all using (office_can(account_id, 'crew.write')) with check (office_can(account_id, 'crew.write'));

alter table if exists subcontractor_offers enable row level security;
drop policy if exists subcontractor_offers_owner on subcontractor_offers;
drop policy if exists subcontractor_offers_select on subcontractor_offers;
drop policy if exists subcontractor_offers_modify on subcontractor_offers;

create policy subcontractor_offers_select on subcontractor_offers
  for select using (office_can(account_id, 'crew.read'));

create policy subcontractor_offers_modify on subcontractor_offers
  for all using (office_can(account_id, 'crew.write')) with check (office_can(account_id, 'crew.write'));

alter table if exists subcontractor_reviews enable row level security;
drop policy if exists subcontractor_reviews_owner on subcontractor_reviews;
drop policy if exists subcontractor_reviews_select on subcontractor_reviews;
drop policy if exists subcontractor_reviews_modify on subcontractor_reviews;

create policy subcontractor_reviews_select on subcontractor_reviews
  for select using (office_can(account_id, 'crew.read'));

create policy subcontractor_reviews_modify on subcontractor_reviews
  for all using (office_can(account_id, 'crew.write')) with check (office_can(account_id, 'crew.write'));

commit;
