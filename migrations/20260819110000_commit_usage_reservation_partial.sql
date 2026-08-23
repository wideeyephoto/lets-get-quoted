-- Settle a reservation for less than it held.
--
-- WHY. `commit_usage_reservation` is whole-or-nothing: it takes (uuid, text) and
-- consumes every unit the reservation holds. That is right for the four meters
-- that exist, because each reserves exactly what it is about to spend — one
-- credit per email, one per draft, one per carrier segment, all known before the
-- work starts.
--
-- A phone call is not known before it starts. AI Voice must admit a call before
-- anyone can say how long it will run, and the measured provider receipt
-- (docs/ai-voice-v1-decisions.md §11) arrives only at the end. With only a whole
-- commit available, the choices were:
--
--   * reserve the 60-minute safety cap and commit it whole — every 40-second
--     call billed as an hour;
--   * release the hold, then re-reserve the true amount — a window in which the
--     caller holds nothing, so a concurrent call can spend past a spending cap
--     while the first call is still running.
--
-- Both are wrong about money in a way a contractor would eventually notice on an
-- invoice, so the primitive is the thing that was missing.
--
-- SHAPE. Deliberately the same as `commit_usage_reservation`: same lock order,
-- same finalization-key replay guard, same expired-before-commit handling, same
-- per-allocation invariant check. It differs in exactly one respect — it takes a
-- unit count, consumes that many across the allocations in a deterministic
-- order, and RELEASES the remainder in the same transaction. There is no moment
-- when the unused units are neither held nor returned.
--
-- Additive: no existing function changes behaviour, and nothing calls this yet.

begin;

-- How much a committed reservation actually consumed.
--
-- Only the partial commit writes it. `commit_usage_reservation` leaves it null
-- because it always consumes the whole reservation, so a reader wanting "units
-- actually consumed" must use `coalesce(committed_units, units)` — and the
-- comment below says so at the place somebody will be looking.
alter table public.usage_reservations
  add column if not exists committed_units bigint;

alter table public.usage_reservations
  drop constraint if exists usage_reservations_committed_units_check;
alter table public.usage_reservations
  add constraint usage_reservations_committed_units_check
  check (committed_units is null or (committed_units >= 0 and committed_units <= units));

comment on column public.usage_reservations.committed_units is
  'Units actually consumed by a PARTIAL commit. Null when commit_usage_reservation '
  'committed the reservation whole, so read coalesce(committed_units, units).';

create or replace function public.commit_usage_reservation_partial(
  p_reservation_id uuid,
  p_finalization_key text,
  p_units bigint
)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_reservation public.usage_reservations%rowtype;
  v_allocation record;
  v_updated integer;
  v_remaining bigint;
  v_take bigint;
begin
  if p_finalization_key is null or pg_catalog.length(pg_catalog.btrim(p_finalization_key)) = 0 then
    raise exception 'reservation finalization key is required' using errcode = '22023';
  end if;
  if p_units is null or p_units < 0 then
    raise exception 'committed units must be zero or more' using errcode = '22023';
  end if;

  select r.* into v_reservation
    from public.usage_reservations r
   where r.id = p_reservation_id
   for update;

  if not found then
    raise exception 'usage reservation not found' using errcode = 'P0002';
  end if;

  -- Same lock, same key, same order as the whole commit. Two settlements for one
  -- workspace and resource must not interleave, and a partial and a whole
  -- commit must contend with each other exactly as two whole commits would.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_reservation.account_id::text || ':' || v_reservation.resource_code, 0)
  );

  if v_reservation.state = 'committed' then
    if v_reservation.finalization_key is distinct from p_finalization_key then
      raise exception 'reservation was committed with a different finalization key' using errcode = '22000';
    end if;
    -- Replay. Return what was actually committed rather than what this call
    -- asked for: the receipt is fixed, and a retry recomputing a slightly
    -- different duration must not appear to change a settled bill.
    return coalesce(v_reservation.committed_units, v_reservation.units);
  end if;
  if v_reservation.state in ('released', 'expired') then
    return 0;
  end if;

  -- A hold that outlived its expiry is released whole, exactly as the whole
  -- commit does. For voice this is the ordinary path for a call that never
  -- reported: the provider sends nothing at all for a failed connection.
  if v_reservation.expires_at <= pg_catalog.now() then
    for v_allocation in
      select a.credit_lot_id, a.units
        from public.usage_reservation_allocations a
       where a.reservation_id = p_reservation_id
       order by a.credit_lot_id
    loop
      update public.usage_credit_lots l
         set reserved_units = l.reserved_units - v_allocation.units
       where l.id = v_allocation.credit_lot_id
         and l.account_id = v_reservation.account_id
         and l.reserved_units >= v_allocation.units;
      get diagnostics v_updated = row_count;
      if v_updated <> 1 then
        raise exception 'usage credit reservation invariant failed while expiring' using errcode = 'P0001';
      end if;
    end loop;

    update public.usage_reservations
       set state = 'expired', released_at = pg_catalog.now(), finalization_key = p_finalization_key,
           release_reason = 'expired_before_commit'
     where id = p_reservation_id;
    return 0;
  end if;

  -- Asking for more than was held commits what was held. The caller is not
  -- refused: it reserved a cap and used it all, which is the 60-minute case.
  v_remaining := least(p_units, v_reservation.units);

  for v_allocation in
    select a.credit_lot_id, a.units
      from public.usage_reservation_allocations a
     where a.reservation_id = p_reservation_id
     order by a.credit_lot_id
  loop
    v_take := least(v_remaining, v_allocation.units);
    v_remaining := v_remaining - v_take;

    -- One UPDATE per lot moves both amounts at once: the whole allocation comes
    -- out of reserved, and only `v_take` goes into consumed -- so the difference
    -- returns to available in the same statement. Splitting this into a consume
    -- and a release would leave a moment where the lot's numbers do not add up,
    -- and the invariant check below could not tell which half had failed.
    update public.usage_credit_lots l
       set reserved_units = l.reserved_units - v_allocation.units,
           consumed_units = l.consumed_units + v_take
     where l.id = v_allocation.credit_lot_id
       and l.account_id = v_reservation.account_id
       and l.reserved_units >= v_allocation.units;
    get diagnostics v_updated = row_count;
    if v_updated <> 1 then
      raise exception 'usage credit reservation invariant failed while committing' using errcode = 'P0001';
    end if;
  end loop;

  update public.usage_reservations
     set state = 'committed',
         committed_at = pg_catalog.now(),
         finalization_key = p_finalization_key,
         committed_units = least(p_units, v_reservation.units)
   where id = p_reservation_id;

  return least(p_units, v_reservation.units);
end;
$$;

revoke all on function public.commit_usage_reservation_partial(uuid, text, bigint)
  from public, anon, authenticated;
grant execute on function public.commit_usage_reservation_partial(uuid, text, bigint)
  to service_role;

do $$
declare
  v_bad text;
begin
  if not exists (
    select 1 from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'commit_usage_reservation_partial'
  ) then
    raise exception 'commit_usage_reservation_partial was not created';
  end if;

  -- Same posture as every other ledger RPC: reachable by the trusted server
  -- role and by nothing a browser can present.
  select pg_catalog.string_agg(g, ', ') into v_bad
  from (
    select pg_catalog.pg_get_userbyid(x.grantee) as g
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    cross join lateral pg_catalog.aclexplode(coalesce(p.proacl, '{}'::aclitem[])) x
    where n.nspname = 'public'
      and p.proname = 'commit_usage_reservation_partial'
      and x.privilege_type = 'EXECUTE'
      and x.grantee <> p.proowner
  ) s
  where g in ('anon', 'authenticated', 'public');

  if v_bad is not null then
    raise exception 'commit_usage_reservation_partial is reachable by: %', v_bad;
  end if;
end $$;

commit;
