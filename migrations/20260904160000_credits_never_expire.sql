-- Credits Never Expire for Anyone
--
-- Guarantees that usage credits (plan allowances, starter grants, and purchases)
-- roll over and never expire for any account.
--
-- 1. Updates workspace_usage_credit_balances to treat all available units as
--    unexpiring, reporting 0 expired_unused_units and null next_expiration_at.
-- 2. Updates reserve_usage_credits to draw from all available unconsumed lots
--    regardless of past window bounds, honoring strict FIFO consumption.

-- 1. Balance projection: all available lots are spendable; credits never expire.
create or replace view public.workspace_usage_credit_balances
with (security_invoker = true)
as
select
  l.account_id,
  l.resource_code,
  pg_catalog.sum(l.granted_units)::bigint as granted_units,
  pg_catalog.sum(l.consumed_units)::bigint as consumed_units,
  pg_catalog.sum(l.reserved_units)::bigint as reserved_units,
  pg_catalog.sum(l.revoked_units)::bigint as revoked_units,
  pg_catalog.sum(
    case
      when l.available_from <= pg_catalog.now()
      then l.granted_units - l.consumed_units - l.reserved_units - l.revoked_units
      else 0
    end
  )::bigint as available_units,
  0::bigint as expired_unused_units,
  null::timestamptz as next_expiration_at
from public.usage_credit_lots l
group by l.account_id, l.resource_code;

revoke all on table public.workspace_usage_credit_balances from public, anon, authenticated;
grant select on table public.workspace_usage_credit_balances to authenticated;
grant select on table public.workspace_usage_credit_balances to service_role;

-- 2. Reservation lifecycle: eligible lots include all available lots, FIFO ordered.
create or replace function public.reserve_usage_credits(
  p_account_id uuid,
  p_resource_code text,
  p_units bigint,
  p_idempotency_key text,
  p_operation_type text default 'usage',
  p_expires_at timestamptz default (now() + interval '15 minutes'),
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_id uuid;
  v_remaining bigint := p_units;
  v_take bigint;
  v_lot record;
  v_existing public.usage_reservations%rowtype;
begin
  if p_units <= 0 then
    raise exception 'usage reservation must be positive' using errcode = '22023';
  end if;
  if p_resource_code is null or p_resource_code !~ '^[a-z][a-z0-9_]{1,63}$' then
    raise exception 'invalid usage resource code' using errcode = '22023';
  end if;
  if p_operation_type is null or p_operation_type !~ '^[a-z][a-z0-9_]{1,63}$' then
    raise exception 'invalid usage operation type' using errcode = '22023';
  end if;
  if p_idempotency_key is null or pg_catalog.length(pg_catalog.btrim(p_idempotency_key)) = 0 then
    raise exception 'usage reservation idempotency key is required' using errcode = '22023';
  end if;
  if p_metadata is null or pg_catalog.jsonb_typeof(p_metadata) <> 'object' then
    raise exception 'usage reservation metadata must be a JSON object' using errcode = '22023';
  end if;
  if p_expires_at <= pg_catalog.now() or p_expires_at > pg_catalog.now() + interval '24 hours' then
    raise exception 'usage reservation expiration must be within the next 24 hours' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_account_id::text || ':' || p_resource_code, 0)
  );

  select r.* into v_existing
    from public.usage_reservations r
   where r.account_id = p_account_id
     and r.resource_code = p_resource_code
     and r.idempotency_key = p_idempotency_key;

  if found then
    if v_existing.units <> p_units or v_existing.operation_type <> p_operation_type then
      raise exception 'usage reservation idempotency key was reused with different request data' using errcode = '22000';
    end if;
    return v_existing.id;
  end if;

  insert into public.usage_reservations (
    account_id, resource_code, units, operation_type, idempotency_key, expires_at, metadata
  ) values (
    p_account_id, p_resource_code, p_units, p_operation_type, p_idempotency_key, p_expires_at, p_metadata
  )
  returning id into v_id;

  for v_lot in
    select
      l.id,
      l.granted_units - l.consumed_units - l.reserved_units - l.revoked_units as available_units
    from public.usage_credit_lots l
    where l.account_id = p_account_id
      and l.resource_code = p_resource_code
      and l.available_from <= pg_catalog.now()
      and l.granted_units - l.consumed_units - l.reserved_units - l.revoked_units > 0
    order by l.available_from asc, l.created_at asc, l.id asc
    for update
  loop
    exit when v_remaining = 0;
    v_take := least(v_remaining, v_lot.available_units);

    update public.usage_credit_lots l
       set reserved_units = l.reserved_units + v_take
     where l.id = v_lot.id;

    insert into public.usage_reservation_allocations (
      account_id, reservation_id, credit_lot_id, units
    ) values (
      p_account_id, v_id, v_lot.id, v_take
    );

    v_remaining := v_remaining - v_take;
  end loop;

  if v_remaining > 0 then
    raise exception 'insufficient usage credits for resource % (missing % units)', p_resource_code, v_remaining
      using errcode = 'P0001';
  end if;

  return v_id;
end;
$$;

revoke all on function public.reserve_usage_credits(uuid, text, bigint, text, text, timestamptz, jsonb)
  from public, anon, authenticated;
grant execute on function public.reserve_usage_credits(uuid, text, bigint, text, text, timestamptz, jsonb)
  to service_role;
