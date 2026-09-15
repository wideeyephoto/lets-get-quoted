-- Give the overage accrual an idempotency anchor.
--
-- THE HOLE. authorize_usage_overage took the cap lock, compared the accrued
-- total, and then did a blind increment into workspace_overage_accruals.
-- Nothing recorded WHICH overrun that was. So the same logical send charged
-- twice whenever the call was repeated, and it is repeated more often than it
-- looks:
--
--   * the RPC commits, the connection drops before the row comes back, the
--     TypeScript side reads an error and answers `unavailable`, the caller
--     refuses to send, and the workspace has now paid for work nobody did;
--   * the caller retries that same send, and pays a second time;
--   * a queue redelivers, a worker restarts mid-batch, a user double-clicks.
--
-- Every one of those is a duplicate charge against a cap the customer set
-- precisely because they did not want surprises.
--
-- THE ANCHOR ALREADY EXISTED EVERYWHERE ELSE. All four meters compute a stable
-- idempotency key for their reservation -- 'text-credit:v1:...',
-- 'ai-voice:v1:<provider call id>' -- and hand it to the reservation RPC. Only
-- the overage path threw it away. This migration makes it required.
--
-- AND THE RELEASE IS ANCHORED TOO. It used to take the amount from the caller,
-- floor the decrement at zero, and hope. Flooring stops a single release going
-- negative; it does not stop the SAME release being applied twice once other
-- charges have refilled the row, and it cannot tell a release of the wrong
-- amount from a release of the right one.
--
-- Signatures change, so the old ones are dropped rather than overloaded. A
-- caller left on the old shape would keep the un-anchored behaviour, which is
-- the whole defect.

begin;

-- PRECONDITION, because the failure without it is unreadable.
--
-- authorize_usage_overage declares `v_settings public.workspace_overage_settings
-- %rowtype`, and %rowtype is resolved when the function is COMPILED, not when it
-- is called. So on a database without 20260819080000 this file fails with
-- "relation public.workspace_overage_settings does not exist ... near line 3" --
-- pointing at a declare block, four migrations away from the actual gap. That
-- happened on 2026-08-20 and cost an apply run.
--
-- `scripts/audit-applied-migrations.mjs` answers "what is actually live?"
-- properly. This is the check that speaks at the moment of failure.
do $pre$
begin
  if to_regclass('public.workspace_overage_settings') is null
     or to_regclass('public.workspace_overage_accruals') is null then
    raise exception
      'apply 20260819080000_usage_overage_authorization.sql first: this migration rewrites the overage functions and cannot compile without their tables'
      using errcode = '55000';
  end if;
end
$pre$;

-- One row per authorized overage charge. This is the evidence the accrual
-- totals are built from, and the only thing that can answer "have I already
-- charged for this?".
create table if not exists public.workspace_overage_accrual_events (
  account_id uuid not null references public.accounts(id) on delete cascade,
  idempotency_key text not null
    check (idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9:_.@|-]{7,199}$'),
  period_start timestamptz not null,
  period_end timestamptz not null,
  resource_code text not null check (resource_code ~ '^[a-z][a-z0-9_]{1,63}$'),
  units bigint not null check (units > 0),
  millicents bigint not null check (millicents > 0),
  -- What the caller was told at the time. A replay must be able to repeat the
  -- original answer without recomputing it against a cap that has since moved.
  accrued_millicents bigint not null check (accrued_millicents >= 0),
  cap_millicents bigint not null check (cap_millicents >= 0),
  released_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  primary key (account_id, idempotency_key),
  constraint workspace_overage_accrual_events_period_check check (period_end > period_start)
);

create index if not exists workspace_overage_accrual_events_period_idx
  on public.workspace_overage_accrual_events (account_id, period_start, resource_code);

-- Unreleased events, oldest first: what a reconciler would sweep.
create index if not exists workspace_overage_accrual_events_open_idx
  on public.workspace_overage_accrual_events (account_id, created_at)
  where released_at is null;

alter table public.workspace_overage_accrual_events enable row level security;

-- Owner-readable like the accrual totals beside it, service-role-writable. An
-- owner who could write here could erase evidence of their own overruns.
drop policy if exists workspace_overage_accrual_events_read
  on public.workspace_overage_accrual_events;
create policy workspace_overage_accrual_events_read
  on public.workspace_overage_accrual_events
  for select using ( public.is_owner(account_id) );

revoke all on table public.workspace_overage_accrual_events
  from public, anon, authenticated;
grant select on table public.workspace_overage_accrual_events to authenticated;
grant select, insert, update on table public.workspace_overage_accrual_events to service_role;

-- The old shapes go. Leaving them would leave a caller able to charge without
-- naming what it is charging for.
drop function if exists public.authorize_usage_overage(
  uuid, text, bigint, bigint, timestamptz, timestamptz);
drop function if exists public.release_usage_overage(
  uuid, text, timestamptz, bigint, bigint);

-- Decide whether this overrun may be charged, record it if so, and never charge
-- for the same key twice.
--
-- One statement, one lock, one answer. The settings row is taken FOR UPDATE
-- before the accrued total is read, so two concurrent sends that each fit under
-- the cap but together exceed it cannot both be admitted.
--
-- A REPLAY REPEATS THE ORIGINAL ANSWER. It does not re-evaluate the cap. If it
-- did, a retry arriving after the cap filled would answer 'cap_reached' for work
-- that has already been paid for, and the caller would refuse to do it: the
-- customer charged, the send withheld, which is worse than either alone.
--
-- Returns exactly one row:
--   decision  'accrued' | 'not_authorized' | 'cap_reached'
-- plus the numbers behind it, so a caller can say "you have $3.40 of your $50
-- left" rather than only "no".
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
  -- Required, and shaped. A caller that cannot name what it is charging for
  -- must not be able to charge at all.
  if p_idempotency_key is null
     or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9:_.@|-]{7,199}$' then
    raise exception 'overage idempotency key is missing or malformed'
      using errcode = '22023';
  end if;

  -- The lock. Everything after this is serialized per workspace, which is also
  -- what makes the replay check below safe against a concurrent first attempt.
  select * into v_settings
    from public.workspace_overage_settings s
   where s.account_id = p_account_id
   for update;

  -- Already charged. Repeat exactly what was said the first time, whether or
  -- not the settings or the cap have moved since.
  select * into v_event
    from public.workspace_overage_accrual_events e
   where e.account_id = p_account_id
     and e.idempotency_key = p_idempotency_key;
  if found then
    -- Same key, different work, is a caller bug and not something to paper
    -- over: silently returning the first charge would under-bill, and charging
    -- again would double-bill. Refuse and let it surface.
    if v_event.resource_code <> p_resource_code
       or v_event.units <> p_units
       or v_event.period_start <> p_period_start then
      raise exception 'overage idempotency key was reused for different work'
        using errcode = '22000';
    end if;
    -- A released event is spent evidence, not a live charge. Re-authorizing
    -- under the same key would resurrect a charge that was given back.
    if v_event.released_at is not null then
      raise exception 'overage idempotency key was already released'
        using errcode = '22000';
    end if;
    return query select
      'accrued'::text, v_event.accrued_millicents, v_event.cap_millicents, v_event.millicents;
    return;
  end if;

  -- No row, disabled, or somehow capless: all the same answer. A workspace that
  -- never opted in is indistinguishable from one that opted out, deliberately.
  if v_settings.account_id is null
     or not v_settings.enabled
     or v_settings.cap_cents is null then
    return query select 'not_authorized'::text, 0::bigint, 0::bigint, 0::bigint;
    return;
  end if;

  -- cap_cents is CENTS. Millicents are thousandths of a cent, and getting this
  -- conversion wrong is a thousandfold error in either direction.
  v_cap_millicents := v_settings.cap_cents * 1000;
  v_charge := p_units * p_rate_millicents;

  select coalesce(sum(a.millicents), 0) into v_accrued
    from public.workspace_overage_accruals a
   where a.account_id = p_account_id
     and a.period_start = p_period_start;

  -- Hard stop. A charge that would cross the cap is refused whole rather than
  -- billed in part.
  if v_accrued + v_charge > v_cap_millicents then
    return query select 'cap_reached'::text, v_accrued, v_cap_millicents, 0::bigint;
    return;
  end if;

  -- Evidence first. If this insert conflicts, a concurrent caller won the same
  -- key and the accrual below must not also run.
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

-- Give back an overage that was authorized for work which then failed.
--
-- The cap check and the accrual have to happen together, before the work, or
-- two concurrent charges could each pass a cap they jointly exceed. That means
-- an overage is charged a moment before anyone knows the send succeeded, so
-- there has to be a way back, exactly as release_usage_reservation is the way
-- back from a reservation.
--
-- THE AMOUNT COMES FROM THE EVENT, not from the caller.
--
-- Returns the millicents actually given back. A second release of the same key
-- returns 0, as does a key that was never accrued.
create or replace function public.release_usage_overage(
  p_account_id uuid,
  p_idempotency_key text
)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $fn$
declare
  v_event public.workspace_overage_accrual_events%rowtype;
begin
  if p_account_id is null or p_idempotency_key is null then
    return 0;
  end if;

  -- Claim the event first. The row lock is what makes a concurrent double
  -- release one release, and the released_at predicate makes a sequential one a
  -- no-op rather than a second credit.
  update public.workspace_overage_accrual_events e
     set released_at = pg_catalog.now()
   where e.account_id = p_account_id
     and e.idempotency_key = p_idempotency_key
     and e.released_at is null
  returning e.* into v_event;

  if not found then
    return 0;
  end if;

  update public.workspace_overage_accruals a
     set units = greatest(a.units - v_event.units, 0),
         millicents = greatest(a.millicents - v_event.millicents, 0),
         updated_at = pg_catalog.now()
   where a.account_id = p_account_id
     and a.period_start = v_event.period_start
     and a.resource_code = v_event.resource_code;

  return v_event.millicents;
end
$fn$;

revoke all on function public.release_usage_overage(uuid, text)
  from public, anon, authenticated;
grant execute on function public.release_usage_overage(uuid, text) to service_role;

-- Post-conditions. Each asserts a thing is PRESENT or ABSENT outright: a check
-- shaped "if it exists and is wrong" abstains when it cannot find its subject,
-- which is how a guard passes on a database it never looked at.
do $post$
declare
  v_count integer;
begin
  select count(*) into v_count from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'authorize_usage_overage';
  if v_count <> 1 then
    raise exception 'expected exactly one authorize_usage_overage, found %', v_count;
  end if;

  select count(*) into v_count from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'release_usage_overage';
  if v_count <> 1 then
    raise exception 'expected exactly one release_usage_overage, found %', v_count;
  end if;

  -- The key must be the seventh argument, or the meters are calling something
  -- that silently ignores it.
  select count(*) into v_count from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'authorize_usage_overage'
     and p.pronargs = 7
     and p.proargnames[7] = 'p_idempotency_key';
  if v_count <> 1 then
    raise exception 'authorize_usage_overage does not require an idempotency key';
  end if;

  if to_regclass('public.workspace_overage_accrual_events') is null then
    raise exception 'workspace_overage_accrual_events was not created';
  end if;

  select count(*) into v_count from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relname = 'workspace_overage_accrual_events'
     and c.relrowsecurity;
  if v_count <> 1 then
    raise exception 'workspace_overage_accrual_events does not have RLS enabled';
  end if;

  -- Nothing but service_role may write the evidence.
  if has_table_privilege('authenticated', 'public.workspace_overage_accrual_events', 'INSERT')
     or has_table_privilege('anon', 'public.workspace_overage_accrual_events', 'SELECT') then
    raise exception 'workspace_overage_accrual_events grants are too wide';
  end if;
end
$post$;

commit;
