-- A twenty-second wrong number costs $21, and nothing ever gives it back.
--
-- THE SHAPE OF IT. A phone call cannot be measured before it happens, so the
-- meter reserves the published 60-minute safety cap up front and settles the
-- truth afterwards through commit_usage_reservation_partial. That works
-- perfectly -- for a call covered by the allowance.
--
-- When the allowance is exhausted, the call is admitted on OVERAGE instead. That
-- path charges `cap` units immediately: 60 minutes x 35,000 millicents = $21.00,
-- before anyone knows whether the caller says "sorry, wrong number" and hangs
-- up. And then the hold is dropped on the floor:
--
--   * the admission row is written with reservation_id = null,
--   * settlement reads a null reservation_id as "admitted unmetered, on
--     purpose" and does nothing,
--   * so no code path exists that can reduce the charge.
--
-- Every overage call bills $21 whatever its length. A workspace with a $50 cap
-- gets exactly two calls before the meter refuses everyone -- the cap is
-- consumed thirty times faster than real usage.
--
-- TWO THINGS ARE MISSING, and both are needed.
--
-- 1. The admission has to remember it was an overage. It records a reservation
--    or nothing, and an overage is neither. Without the key, settlement cannot
--    find the charge even if it wanted to.
--
-- 2. There has to be a partial settlement for an overage, the way
--    commit_usage_reservation_partial is the partial settlement for a
--    reservation. release_usage_overage is all-or-nothing: it gives back the
--    whole charge, which is right for a call that never connected and wrong for
--    one that ran forty seconds.
--
-- THE RATE COMES FROM THE EVENT, never from a caller. millicents / units is
-- exactly the rate that was authorised, because the accrual computed
-- millicents = units x rate. Recomputing from a passed-in rate would let a
-- settlement quietly reprice a charge the cap already approved.
--
-- TWO CONSEQUENCES OF SETTLING IN PLACE, both deliberate.
--
-- Releasing a SETTLED event still works and is still correct: the accrual was
-- already reduced by the refund, and the event now carries the kept amount, so
-- a later release gives back exactly the remainder. A call trued down to one
-- minute and then found unbillable ends at zero, not below it.
--
-- Re-authorising a settled key raises 'reused for different work' rather than
-- something more precise, because the units on the event are now the settled
-- ones and no longer match the cap the caller would ask for again. It refuses,
-- which is the safe direction -- and voice fails open, so a redelivered
-- admission is admitted unmetered rather than dropped. Worth knowing before
-- reading that message and hunting for a caller bug that is not there.
--
-- Latent: the whole voice rail is dark, and no overage has ever been accrued.
-- This lands before AI Voice launches, not after.

begin;

-- The overage a call was admitted on. Null for a reservation-backed call and
-- for an unmetered one, which stay distinguishable by reservation_id.
alter table public.voice_call_admissions
  add column if not exists overage_key text;

-- When the held charge was trued down to what was actually used. Distinct from
-- released_at on purpose: a RELEASED event gave everything back and is spent
-- evidence, a SETTLED one kept part of the charge and is still owed.
alter table public.workspace_overage_accrual_events
  add column if not exists settled_at timestamptz;

-- Open work: accrued, not given back, not yet trued down. This is what a
-- reconciler would sweep, and what the expiry path has to be able to find.
create index if not exists workspace_overage_accrual_events_unsettled_idx
  on public.workspace_overage_accrual_events (account_id, created_at)
  where released_at is null and settled_at is null;

comment on column public.voice_call_admissions.overage_key is
  'Idempotency key of the workspace_overage_accrual_events row this call was '
  'charged against, when it was admitted on overage rather than on allowance. '
  'Settlement needs it to true the charge down to the minutes actually used.';

/**
 * Settle an overage for fewer units than were held.
 *
 * The mirror of commit_usage_reservation_partial, for the path that has no
 * reservation. Reduces the accrual by the difference between what was held and
 * what was used, and marks the event settled so it cannot be settled twice.
 *
 * Returns the millicents GIVEN BACK. Zero is a real answer -- a call that ran
 * the full cap owes the whole hold -- so it is not an error signal.
 *
 * Refuses rather than guessing when:
 *   - the key names no open event (already settled, already released, unknown)
 *   - p_units exceeds what was held, which would be a new charge that never
 *     passed the cap check
 *   - the period has already been settled, for the reason 20260819300000 gives
 */
create or replace function public.settle_usage_overage(
  p_account_id uuid,
  p_idempotency_key text,
  p_units bigint
)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $fn$
declare
  v_event public.workspace_overage_accrual_events%rowtype;
  v_kept bigint;
  v_refund bigint;
  v_settled boolean;
begin
  if p_account_id is null or p_idempotency_key is null or p_units is null or p_units < 0 then
    raise exception 'overage settlement arguments are invalid' using errcode = '22023';
  end if;

  select * into v_event
    from public.workspace_overage_accrual_events e
   where e.account_id = p_account_id
     and e.idempotency_key = p_idempotency_key
     and e.released_at is null
     and e.settled_at is null
   for update;

  if not found then
    return 0;
  end if;

  if p_units > v_event.units then
    -- Settling for more than was held would bill for units the cap never
    -- approved. The caller has to re-authorise, not stretch this one.
    raise exception 'overage settlement exceeds the units held' using errcode = '22023';
  end if;

  select exists (
    select 1
      from public.workspace_overage_settlements s
     where s.account_id = p_account_id
       and s.period_start = v_event.period_start
  ) into v_settled;

  if v_settled then
    raise exception 'overage period has already been settled; settlement refused'
      using errcode = '55000';
  end if;

  -- The rate is the event's own. Integer division truncates, which rounds the
  -- KEPT amount down and so the refund up -- the direction that cannot
  -- overcharge. It is exact in practice: the accrual multiplied units by a rate.
  v_kept := (v_event.millicents * p_units) / v_event.units;
  v_refund := v_event.millicents - v_kept;

  update public.workspace_overage_accrual_events e
     set units = p_units,
         millicents = v_kept,
         settled_at = pg_catalog.now()
   where e.account_id = p_account_id
     and e.idempotency_key = p_idempotency_key;

  if v_refund > 0 then
    update public.workspace_overage_accruals a
       set units = greatest(a.units - (v_event.units - p_units), 0),
           millicents = greatest(a.millicents - v_refund, 0),
           updated_at = pg_catalog.now()
     where a.account_id = p_account_id
       and a.period_start = v_event.period_start
       and a.resource_code = v_event.resource_code;
  end if;

  return v_refund;
end
$fn$;

revoke all on function public.settle_usage_overage(uuid, text, bigint)
  from public, anon, authenticated;
grant execute on function public.settle_usage_overage(uuid, text, bigint) to service_role;

do $post$
declare
  v_src text;
begin
  if to_regclass('public.workspace_overage_accrual_events') is null then
    raise exception 'apply 20260819290000 first: there is no accrual event table to settle';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_attribute
    where attrelid = 'public.voice_call_admissions'::regclass
      and attname = 'overage_key' and not attisdropped
  ) then
    raise exception 'voice_call_admissions.overage_key was not added';
  end if;

  select p.prosrc into v_src from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind = 'f' and p.proname = 'settle_usage_overage';
  if v_src is null then
    raise exception 'settle_usage_overage was not created';
  end if;

  -- The rate must come from the event. A body that took one as an argument
  -- could reprice a charge the cap already approved.
  if pg_catalog.strpos(v_src, '(v_event.millicents * p_units) / v_event.units') = 0 then
    raise exception 'settle_usage_overage does not derive the rate from the event';
  end if;
  -- And it must refuse a settlement larger than the hold.
  if pg_catalog.strpos(v_src, 'exceeds the units held') = 0 then
    raise exception 'settle_usage_overage does not refuse settling above the hold';
  end if;
end
$post$;

commit;
