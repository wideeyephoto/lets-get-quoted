begin;

drop function if exists public.authorize_usage_overage(uuid, text, bigint, bigint, timestamptz, timestamptz, text);

create or replace function public.authorize_usage_overage(
  p_account_id uuid,
  p_resource_code text,
  p_units bigint,
  p_rate_millicents bigint,
  p_idempotency_key text
)
returns table (
  decision text,
  accrued_millicents bigint,
  cap_millicents bigint,
  charged_millicents bigint,
  period_start timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $fn$
declare
  v_settings public.workspace_overage_settings%rowtype;
  v_event public.workspace_overage_accrual_events%rowtype;
  v_accrued bigint;
  v_charge bigint;
  v_cap_millicents bigint;
  v_period_start timestamptz;
  v_period_end timestamptz;
begin
  if p_units is null or p_units <= 0 then
    raise exception 'overage units must be positive' using errcode = '22023';
  end if;
  if p_rate_millicents is null or p_rate_millicents <= 0 then
    raise exception 'overage rate must be positive' using errcode = '22023';
  end if;
  if p_resource_code is null or p_resource_code !~ '^[a-z][a-z0-9_]{1,63}$' then
    raise exception 'invalid overage resource code' using errcode = '22023';
  end if;
  if p_idempotency_key is null
     or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9:_.@|-]{7,199}$' then
    raise exception 'overage idempotency key is missing or malformed'
      using errcode = '22023';
  end if;

  select * into v_settings
    from public.workspace_overage_settings s
   where s.account_id = p_account_id
   for update;

  select e.period_start, e.period_end into v_period_start, v_period_end
    from public.workspace_entitlements e
   where e.account_id = p_account_id;

  if not found or v_period_start is null or v_period_end is null then
    v_period_start := date_trunc('month', pg_catalog.now() at time zone 'utc');
    v_period_end := v_period_start + interval '1 month';
  end if;

  select * into v_event
    from public.workspace_overage_accrual_events e
   where e.account_id = p_account_id
     and e.idempotency_key = p_idempotency_key;
  if found then
    if v_event.resource_code <> p_resource_code
       or v_event.units <> p_units
       or v_event.period_start <> v_period_start then
      raise exception 'overage idempotency key was reused for different work'
        using errcode = '22000';
    end if;
    if v_event.released_at is not null then
      raise exception 'overage idempotency key was already released'
        using errcode = '22000';
    end if;
    return query select
      'accrued'::text, v_event.accrued_millicents, v_event.cap_millicents, v_event.millicents, v_event.period_start;
    return;
  end if;

  if v_settings.account_id is null
     or not v_settings.enabled
     or v_settings.cap_cents is null then
    return query select 'not_authorized'::text, 0::bigint, 0::bigint, 0::bigint, v_period_start;
    return;
  end if;

  v_cap_millicents := v_settings.cap_cents * 1000;
  v_charge := p_units * p_rate_millicents;

  select coalesce(sum(a.millicents), 0) into v_accrued
    from public.workspace_overage_accruals a
   where a.account_id = p_account_id
     and a.period_end > v_period_start
     and a.period_start < v_period_end;

  if v_accrued + v_charge > v_cap_millicents then
    return query select 'cap_reached'::text, v_accrued, v_cap_millicents, 0::bigint, v_period_start;
    return;
  end if;

  insert into public.workspace_overage_accrual_events (
    account_id, idempotency_key, period_start, period_end, resource_code,
    units, millicents, accrued_millicents, cap_millicents
  )
  values (
    p_account_id, p_idempotency_key, v_period_start, v_period_end, p_resource_code,
    p_units, v_charge, v_accrued + v_charge, v_cap_millicents
  );

  insert into public.workspace_overage_accruals as a (
    account_id, period_start, period_end, resource_code, units, millicents
  )
  values (p_account_id, v_period_start, v_period_end, p_resource_code, p_units, v_charge)
  on conflict (account_id, period_start, resource_code) do update
    set units = a.units + excluded.units,
        millicents = a.millicents + excluded.millicents,
        updated_at = pg_catalog.now();

  return query select 'accrued'::text, v_accrued + v_charge, v_cap_millicents, v_charge, v_period_start;
end
$fn$;

revoke all on function public.authorize_usage_overage(
  uuid, text, bigint, bigint, text)
  from public, anon, authenticated;
grant execute on function public.authorize_usage_overage(
  uuid, text, bigint, bigint, text)
  to service_role;

commit;
