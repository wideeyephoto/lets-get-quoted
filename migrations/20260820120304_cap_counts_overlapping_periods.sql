-- Stop a spending cap re-arming itself when the period boundary moves.
--
-- THE DOUBLE SPEND. The cap is one number per workspace with no period attached
-- (workspace_overage_settings.cap_cents). What has been spent against it was
-- summed by EXACT period_start match. And period_start is not stable: the
-- subscription projector writes it from Stripe's current_period_start on every
-- subscription event, and the TypeScript side falls back to the calendar month
-- for a workspace that has no entitlement period at all.
--
-- So:
--
--   1. A Flex workspace enables overage with a $50 cap and accrues $50 under
--      the calendar-month bucket 2026-08-01 .. 2026-09-01.
--   2. On the 15th they subscribe to Solo. The projector writes period_start =
--      2026-08-15, period_end = 2026-09-15.
--   3. The next overrun sums accruals for 2026-08-15 exactly, finds none, and
--      the whole $50 is available again.
--
-- One cap, set once, spent twice, in the same month. A cap exists precisely so
-- that cannot happen.
--
-- THE FIX IS AN OVERLAP, NOT AN EQUALITY. What has been spent is the sum over
-- every accrual bucket that OVERLAPS the period being charged into. A bucket
-- that ended before this period began does not overlap, so a genuine monthly
-- roll still resets the cap exactly as it should -- and it does so without
-- waiting on a settlement, which matters because nothing settles anything yet.
-- A bucket produced by a boundary that shifted mid-month does overlap, and
-- therefore still counts.
--
--   old month  2026-08-01 .. 2026-09-01   overlaps 08-15 .. 09-15   -> counts
--   old month  2026-08-01 .. 2026-09-01   overlaps 09-15 .. 10-15   -> does not
--
-- close_overage_period is deliberately NOT changed. It settles one bucket and
-- bills one bucket. Two overlapping buckets produce two snapshots which together
-- come to no more than the cap, which is the right answer.
--
-- Everything else in this function is unchanged from 20260819290000. It is
-- restated in full rather than patched by source text, because prosrc holds
-- whatever line endings the file was applied with and an exact-text patch has
-- already failed once on this database for exactly that reason.

begin;

create or replace function public.authorize_usage_overage(
  p_account_id uuid,
  p_resource_code text,
  p_units bigint,
  p_rate_millicents bigint,
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_idempotency_key text
)
returns table (
  decision text,
  accrued_millicents bigint,
  cap_millicents bigint,
  charged_millicents bigint
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
  if p_period_start is null or p_period_end is null or p_period_end <= p_period_start then
    raise exception 'overage period is not a period' using errcode = '22023';
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

  select * into v_event
    from public.workspace_overage_accrual_events e
   where e.account_id = p_account_id
     and e.idempotency_key = p_idempotency_key;
  if found then
    if v_event.resource_code <> p_resource_code
       or v_event.units <> p_units
       or v_event.period_start <> p_period_start then
      raise exception 'overage idempotency key was reused for different work'
        using errcode = '22000';
    end if;
    if v_event.released_at is not null then
      raise exception 'overage idempotency key was already released'
        using errcode = '22000';
    end if;
    return query select
      'accrued'::text, v_event.accrued_millicents, v_event.cap_millicents, v_event.millicents;
    return;
  end if;

  if v_settings.account_id is null
     or not v_settings.enabled
     or v_settings.cap_cents is null then
    return query select 'not_authorized'::text, 0::bigint, 0::bigint, 0::bigint;
    return;
  end if;

  v_cap_millicents := v_settings.cap_cents * 1000;
  v_charge := p_units * p_rate_millicents;

  -- EVERY BUCKET THAT OVERLAPS THIS PERIOD, not the one whose start happens to
  -- match. See the header: period_start moves, and an equality here let a cap
  -- that had already been spent read as untouched.
  select coalesce(sum(a.millicents), 0) into v_accrued
    from public.workspace_overage_accruals a
   where a.account_id = p_account_id
     and a.period_end > p_period_start
     and a.period_start < p_period_end;

  if v_accrued + v_charge > v_cap_millicents then
    return query select 'cap_reached'::text, v_accrued, v_cap_millicents, 0::bigint;
    return;
  end if;

  insert into public.workspace_overage_accrual_events (
    account_id, idempotency_key, period_start, period_end, resource_code,
    units, millicents, accrued_millicents, cap_millicents
  )
  values (
    p_account_id, p_idempotency_key, p_period_start, p_period_end, p_resource_code,
    p_units, v_charge, v_accrued + v_charge, v_cap_millicents
  );

  insert into public.workspace_overage_accruals as a (
    account_id, period_start, period_end, resource_code, units, millicents
  )
  values (p_account_id, p_period_start, p_period_end, p_resource_code, p_units, v_charge)
  on conflict (account_id, period_start, resource_code) do update
    set units = a.units + excluded.units,
        millicents = a.millicents + excluded.millicents,
        updated_at = pg_catalog.now();

  return query select 'accrued'::text, v_accrued + v_charge, v_cap_millicents, v_charge;
end
$fn$;

revoke all on function public.authorize_usage_overage(
  uuid, text, bigint, bigint, timestamptz, timestamptz, text)
  from public, anon, authenticated;
grant execute on function public.authorize_usage_overage(
  uuid, text, bigint, bigint, timestamptz, timestamptz, text)
  to service_role;

do $post$
declare
  v_count integer;
  v_source text;
begin
  select count(*) into v_count from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'authorize_usage_overage';
  if v_count <> 1 then
    raise exception 'expected exactly one authorize_usage_overage, found %', v_count;
  end if;

  select p.prosrc into v_source from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'authorize_usage_overage';
  if v_source is null then
    raise exception 'authorize_usage_overage has no body to check';
  end if;

  -- The overlap has to BE there, and the equality has to be GONE. Checking only
  -- the first would pass on a body that kept both.
  if position('a.period_end > p_period_start' in v_source) = 0
     or position('a.period_start < p_period_end' in v_source) = 0 then
    raise exception 'the cap check does not count overlapping periods';
  end if;
  if position('a.period_start = p_period_start' in v_source) <> 0 then
    raise exception 'the cap check still matches period_start exactly';
  end if;

  -- The idempotency anchor from 20260819290000 must have survived the replace.
  if position('p_idempotency_key' in v_source) = 0 then
    raise exception 'authorize_usage_overage lost its idempotency key';
  end if;
end
$post$;

commit;
