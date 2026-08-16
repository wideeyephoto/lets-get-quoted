-- DARK paid-plan monthly allowance reset worker foundation.
--
-- This migration creates no cron job, route, scheduler, or feature flag. It
-- provides a bounded service-role queue, one-workspace lease ownership, and a
-- PII-free attempt ledger around the already-reviewed atomic reset RPC.

begin;

-- The worker intentionally audits inactive/misaligned paid snapshots instead
-- of filtering them away, so it needs a selector index broader than the
-- existing active-entitlement-only allowance index.
create index workspace_entitlements_paid_allowance_worker_due_idx
  on public.workspace_entitlements (next_allowance_reset_at, account_id)
  where plan_code in ('solo', 'growth', 'scale')
    and billing_interval in ('monthly', 'annual')
    and next_allowance_reset_at is not null;

create table public.billing_allowance_reset_worker_states (
  account_id uuid primary key references public.accounts(id) on delete restrict,
  due_at timestamptz not null,
  worker_state text not null default 'ready'
    check (worker_state in ('ready', 'leased', 'retry_wait', 'dead_letter')),
  claim_token uuid,
  lease_expires_at timestamptz,
  attempt_count integer not null default 0 check (attempt_count between 0 and 8),
  next_attempt_at timestamptz,
  last_outcome_status text check (
    last_outcome_status is null
    or last_outcome_status in (
      'completed', 'blocked_catchup', 'not_due', 'not_eligible',
      'failed_retryable', 'failed_terminal'
    )
  ),
  last_reason_code text check (
    last_reason_code is null
    or last_reason_code ~ '^[a-z][a-z0-9_]{2,99}$'
  ),
  last_error_code text check (
    last_error_code is null
    or last_error_code ~ '^[a-z][a-z0-9_]{2,99}$'
  ),
  dead_lettered_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint billing_allowance_reset_worker_states_shape_check check (
    (
      worker_state = 'ready'
      and claim_token is null
      and lease_expires_at is null
      and next_attempt_at is null
      and dead_lettered_at is null
    )
    or (
      worker_state = 'leased'
      and claim_token is not null
      and lease_expires_at is not null
      and attempt_count between 1 and 8
      and next_attempt_at is null
      and dead_lettered_at is null
    )
    or (
      worker_state = 'retry_wait'
      and claim_token is null
      and lease_expires_at is null
      and attempt_count between 1 and 7
      and next_attempt_at is not null
      and dead_lettered_at is null
    )
    or (
      worker_state = 'dead_letter'
      and claim_token is null
      and lease_expires_at is null
      and attempt_count between 1 and 8
      and next_attempt_at is null
      and last_error_code is not null
      and dead_lettered_at is not null
    )
  )
);

create unique index billing_allowance_reset_worker_states_claim_unique
  on public.billing_allowance_reset_worker_states (claim_token)
  where claim_token is not null;
create index billing_allowance_reset_worker_states_due_idx
  on public.billing_allowance_reset_worker_states (
    worker_state, next_attempt_at, due_at, account_id
  )
  where worker_state in ('ready', 'leased', 'retry_wait');

create table public.billing_allowance_reset_worker_attempts (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete restrict,
  claim_token uuid not null unique,
  attempt_number integer not null check (attempt_number between 1 and 8),
  due_at timestamptz not null,
  lease_expires_at timestamptz not null,
  outcome_status text check (
    outcome_status is null
    or outcome_status in (
      'completed', 'blocked_catchup', 'not_due', 'not_eligible',
      'failed_retryable', 'failed_terminal'
    )
  ),
  reason_code text check (
    reason_code is null or reason_code ~ '^[a-z][a-z0-9_]{2,99}$'
  ),
  error_code text check (
    error_code is null or error_code ~ '^[a-z][a-z0-9_]{2,99}$'
  ),
  retryable boolean,
  dead_lettered boolean not null default false,
  next_attempt_at timestamptz,
  reset_operation_id uuid references public.billing_allowance_reset_operations(id)
    on delete restrict,
  billing_subscription_id uuid,
  allowance_window_start timestamptz,
  allowance_window_end timestamptz,
  inserted_lot_count integer check (inserted_lot_count between 0 and 4),
  verified_lot_count integer check (verified_lot_count between 0 and 4),
  next_allowance_reset_at timestamptz,
  claimed_at timestamptz not null default pg_catalog.now(),
  finished_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  constraint billing_allowance_reset_worker_attempts_subscription_fk
    foreign key (billing_subscription_id, account_id)
    references public.billing_subscriptions(id, account_id)
    on delete restrict,
  constraint billing_allowance_reset_worker_attempts_window_check check (
    allowance_window_start is null
    or allowance_window_end is null
    or allowance_window_end > allowance_window_start
  ),
  constraint billing_allowance_reset_worker_attempts_shape_check check (
    (
      outcome_status is null
      and reason_code is null
      and error_code is null
      and retryable is null
      and not dead_lettered
      and next_attempt_at is null
      and reset_operation_id is null
      and billing_subscription_id is null
      and allowance_window_start is null
      and allowance_window_end is null
      and inserted_lot_count is null
      and verified_lot_count is null
      and next_allowance_reset_at is null
      and finished_at is null
    )
    or (
      outcome_status = 'completed'
      and reason_code is null
      and error_code is null
      and retryable is false
      and not dead_lettered
      and next_attempt_at is null
      and reset_operation_id is not null
      and billing_subscription_id is not null
      and allowance_window_start is not null
      and allowance_window_end is not null
      and inserted_lot_count between 0 and 4
      and verified_lot_count = 4
      and next_allowance_reset_at = allowance_window_end
      and finished_at is not null
    )
    or (
      outcome_status = 'blocked_catchup'
      and reason_code = 'catchup_requires_reconciliation'
      and error_code = 'reset_blocked_catchup'
      and retryable is false
      and dead_lettered
      and next_attempt_at is null
      and reset_operation_id is not null
      and billing_subscription_id is not null
      and allowance_window_start is not null
      and allowance_window_end is not null
      and inserted_lot_count = 0
      and verified_lot_count = 0
      and next_allowance_reset_at = allowance_window_start
      and finished_at is not null
    )
    or (
      outcome_status in ('not_due', 'not_eligible')
      and reason_code is not null
      and error_code is not null
      and retryable is not null
      and reset_operation_id is null
      and inserted_lot_count = 0
      and verified_lot_count = 0
      and finished_at is not null
      and (
        (retryable and not dead_lettered and next_attempt_at is not null)
        or (not retryable and dead_lettered and next_attempt_at is null)
      )
    )
    or (
      outcome_status = 'failed_retryable'
      and reason_code is null
      and error_code is not null
      and retryable
      and not dead_lettered
      and next_attempt_at is not null
      and reset_operation_id is null
      and billing_subscription_id is null
      and allowance_window_start is null
      and allowance_window_end is null
      and inserted_lot_count is null
      and verified_lot_count is null
      and next_allowance_reset_at is null
      and finished_at is not null
    )
    or (
      outcome_status = 'failed_terminal'
      and reason_code is null
      and error_code is not null
      and retryable is false
      and dead_lettered
      and next_attempt_at is null
      and reset_operation_id is null
      and billing_subscription_id is null
      and allowance_window_start is null
      and allowance_window_end is null
      and inserted_lot_count is null
      and verified_lot_count is null
      and next_allowance_reset_at is null
      and finished_at is not null
    )
  )
);

create index billing_allowance_reset_worker_attempts_account_claimed_idx
  on public.billing_allowance_reset_worker_attempts (account_id, claimed_at desc);
create unique index billing_allowance_reset_worker_attempts_one_open_per_account
  on public.billing_allowance_reset_worker_attempts (account_id)
  where outcome_status is null;
create index billing_allowance_reset_worker_attempts_subscription_account_idx
  on public.billing_allowance_reset_worker_attempts (billing_subscription_id, account_id)
  where billing_subscription_id is not null;
create index billing_allowance_reset_worker_attempts_reset_operation_idx
  on public.billing_allowance_reset_worker_attempts (reset_operation_id)
  where reset_operation_id is not null;
create index billing_allowance_reset_worker_attempts_dead_letter_idx
  on public.billing_allowance_reset_worker_attempts (finished_at desc, account_id)
  where dead_lettered;

alter table public.billing_allowance_reset_worker_states enable row level security;
alter table public.billing_allowance_reset_worker_states force row level security;
alter table public.billing_allowance_reset_worker_attempts enable row level security;
alter table public.billing_allowance_reset_worker_attempts force row level security;

-- Attempt identity and terminal outcomes are immutable. The privileged worker
-- may complete one open attempt exactly once; no RPC can rewrite history.
create function public.protect_billing_allowance_reset_worker_attempt()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'allowance reset worker attempts are append-only'
      using errcode = '42501';
  end if;
  if old.id is distinct from new.id
     or old.account_id is distinct from new.account_id
     or old.claim_token is distinct from new.claim_token
     or old.attempt_number is distinct from new.attempt_number
     or old.due_at is distinct from new.due_at
     or old.lease_expires_at is distinct from new.lease_expires_at
     or old.claimed_at is distinct from new.claimed_at
     or old.created_at is distinct from new.created_at
     or old.outcome_status is not null
     or old.finished_at is not null
     or new.outcome_status is null
     or new.finished_at is null then
    raise exception 'allowance reset worker attempt transition is invalid'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger protect_billing_allowance_reset_worker_attempt_trigger
before update or delete on public.billing_allowance_reset_worker_attempts
for each row execute function public.protect_billing_allowance_reset_worker_attempt();

revoke all on function public.protect_billing_allowance_reset_worker_attempt()
  from public, anon, authenticated, service_role;

-- Claim at most 25 workspaces in stable due-time/workspace order. The selector
-- locks only worker-state rows. It never locks entitlements before the existing
-- reset RPC acquires its subscription-then-entitlement domain locks.
create function public.claim_due_paid_plan_allowance_reset_work(
  p_batch_size integer
)
returns table (
  work_claim_token uuid,
  workspace_id uuid,
  due_at timestamptz,
  attempt_number integer,
  lease_expires_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_candidate record;
  v_claim_token uuid;
  v_attempt_number integer;
  v_lease_expires_at timestamptz;
  v_updated integer;
begin
  if p_batch_size is null or p_batch_size not between 1 and 25 then
    raise exception 'allowance reset worker batch size must be between 1 and 25'
      using errcode = '22023';
  end if;

  -- Materialize no more than one bounded batch of previously unseen due rows.
  insert into public.billing_allowance_reset_worker_states (account_id, due_at)
  select e.account_id, e.next_allowance_reset_at
    from public.workspace_entitlements e
   where e.plan_code in ('solo', 'growth', 'scale')
     and e.billing_interval in ('monthly', 'annual')
     and e.next_allowance_reset_at is not null
     and e.next_allowance_reset_at <= v_now
     and not exists (
       select 1
         from public.billing_allowance_reset_worker_states w
        where w.account_id = e.account_id
     )
   order by e.next_allowance_reset_at, e.account_id
   limit p_batch_size
  on conflict (account_id) do nothing;

  for v_candidate in
    select w.*, e.next_allowance_reset_at as current_due_at
      from public.billing_allowance_reset_worker_states w
      join public.workspace_entitlements e on e.account_id = w.account_id
     where e.plan_code in ('solo', 'growth', 'scale')
       and e.billing_interval in ('monthly', 'annual')
       and e.next_allowance_reset_at is not null
       and e.next_allowance_reset_at <= v_now
       and (
         w.worker_state = 'ready'
         or (
           w.worker_state = 'retry_wait'
           and w.next_attempt_at <= v_now
         )
         or (
           w.worker_state = 'leased'
           and w.lease_expires_at <= v_now
         )
       )
     order by e.next_allowance_reset_at, e.account_id
     limit p_batch_size
     for update of w skip locked
  loop
    v_attempt_number := case
      when v_candidate.due_at is distinct from v_candidate.current_due_at
        and v_candidate.worker_state <> 'leased' then 0
      else v_candidate.attempt_count
    end;

    -- Close the prior attempt before reclaiming an expired lease. Eight lost
    -- leases are terminal and cannot spin forever.
    if v_candidate.worker_state = 'leased' then
      if v_attempt_number >= 8 then
        update public.billing_allowance_reset_worker_attempts a
           set outcome_status = 'failed_terminal',
               error_code = 'worker_lease_expired_attempt_limit',
               retryable = false,
               dead_lettered = true,
               finished_at = v_now
         where a.claim_token = v_candidate.claim_token
           and a.outcome_status is null;
        get diagnostics v_updated = row_count;
        if v_updated <> 1 then
          raise exception 'expired allowance reset lease has no open attempt'
            using errcode = '55000';
        end if;

        update public.billing_allowance_reset_worker_states w
           set worker_state = 'dead_letter',
               claim_token = null,
               lease_expires_at = null,
               next_attempt_at = null,
               last_outcome_status = 'failed_terminal',
               last_reason_code = null,
               last_error_code = 'worker_lease_expired_attempt_limit',
               dead_lettered_at = v_now,
               updated_at = v_now
         where w.account_id = v_candidate.account_id;
        continue;
      end if;

      update public.billing_allowance_reset_worker_attempts a
         set outcome_status = 'failed_retryable',
             error_code = 'worker_lease_expired',
             retryable = true,
             dead_lettered = false,
             next_attempt_at = v_now,
             finished_at = v_now
       where a.claim_token = v_candidate.claim_token
         and a.outcome_status is null;
      get diagnostics v_updated = row_count;
      if v_updated <> 1 then
        raise exception 'expired allowance reset lease has no open attempt'
          using errcode = '55000';
      end if;
    end if;

    if v_attempt_number >= 8 then
      update public.billing_allowance_reset_worker_states w
         set worker_state = 'dead_letter',
             claim_token = null,
             lease_expires_at = null,
             next_attempt_at = null,
             last_outcome_status = 'failed_terminal',
             last_reason_code = null,
             last_error_code = 'worker_attempt_limit_reached',
             dead_lettered_at = v_now,
             updated_at = v_now
       where w.account_id = v_candidate.account_id;
      continue;
    end if;

    v_attempt_number := v_attempt_number + 1;
    v_claim_token := pg_catalog.gen_random_uuid();
    v_lease_expires_at := v_now + interval '5 minutes';

    update public.billing_allowance_reset_worker_states w
       set due_at = v_candidate.current_due_at,
           worker_state = 'leased',
           claim_token = v_claim_token,
           lease_expires_at = v_lease_expires_at,
           attempt_count = v_attempt_number,
           next_attempt_at = null,
           last_outcome_status = null,
           last_reason_code = null,
           last_error_code = null,
           dead_lettered_at = null,
           updated_at = v_now
     where w.account_id = v_candidate.account_id;

    insert into public.billing_allowance_reset_worker_attempts (
      account_id, claim_token, attempt_number, due_at, lease_expires_at,
      claimed_at, created_at
    ) values (
      v_candidate.account_id, v_claim_token, v_attempt_number,
      v_candidate.current_due_at, v_lease_expires_at, v_now, v_now
    );

    return query select
      v_claim_token,
      v_candidate.account_id::uuid,
      v_candidate.current_due_at::timestamptz,
      v_attempt_number,
      v_lease_expires_at;
  end loop;
end;
$$;

-- Execute exactly one owned workspace. The called reset RPC is the only source
-- of plan, units, provider period, and allowance-window authority.
create function public.execute_claimed_paid_plan_allowance_reset_work(
  p_claim_token uuid
)
returns table (
  outcome_status text,
  worker_state text,
  attempt_id uuid,
  workspace_id uuid,
  reset_operation_id uuid,
  billing_subscription_id uuid,
  allowance_window_start timestamptz,
  allowance_window_end timestamptz,
  inserted_lot_count integer,
  verified_lot_count integer,
  next_allowance_reset_at timestamptz,
  reason_code text,
  retryable boolean,
  dead_lettered boolean,
  next_attempt_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_state public.billing_allowance_reset_worker_states%rowtype;
  v_attempt public.billing_allowance_reset_worker_attempts%rowtype;
  v_reset record;
  v_retryable boolean := false;
  v_dead_lettered boolean := false;
  v_next_attempt_at timestamptz;
  v_error_code text;
begin
  if p_claim_token is null then
    raise exception 'allowance reset worker claim token is required'
      using errcode = '22023';
  end if;

  select w.*
    into v_state
    from public.billing_allowance_reset_worker_states w
   where w.worker_state = 'leased'
     and w.claim_token = p_claim_token
   for update;
  if not found or v_state.lease_expires_at is null then
    raise exception 'allowance reset worker claim is not owned'
      using errcode = '55000';
  end if;
  if v_state.lease_expires_at <= v_now then
    -- P0004 is private to this dark worker contract. The server adapter maps
    -- it to the database-owned, bounded lease-expiry retry path.
    raise exception 'allowance reset worker claim lease expired'
      using errcode = 'P0004';
  end if;

  select a.*
    into v_attempt
    from public.billing_allowance_reset_worker_attempts a
   where a.claim_token = p_claim_token
     and a.account_id = v_state.account_id
   for update;
  if not found or v_attempt.outcome_status is not null then
    raise exception 'allowance reset worker attempt is missing or already terminal'
      using errcode = '55000';
  end if;

  -- This function acquires no entitlement row itself. The called RPC keeps the
  -- established subscription-then-entitlement lock order.
  select r.*
    into v_reset
    from public.apply_paid_plan_monthly_allowance_reset(v_state.account_id) r;
  if not found
     or v_reset.workspace_id is distinct from v_state.account_id
     or v_reset.reset_status not in (
       'completed', 'blocked_catchup', 'not_due', 'not_eligible'
     ) then
    raise exception 'allowance reset RPC returned an invalid worker result'
      using errcode = '22000';
  end if;

  if v_reset.reset_status = 'completed' then
    update public.billing_allowance_reset_worker_attempts a
       set outcome_status = 'completed',
           retryable = false,
           dead_lettered = false,
           reset_operation_id = v_reset.operation_id,
           billing_subscription_id = v_reset.billing_subscription_id,
           allowance_window_start = v_reset.allowance_window_start,
           allowance_window_end = v_reset.allowance_window_end,
           inserted_lot_count = v_reset.inserted_lot_count,
           verified_lot_count = v_reset.verified_lot_count,
           next_allowance_reset_at = v_reset.next_allowance_reset_at,
           finished_at = v_now
     where a.id = v_attempt.id;

    update public.billing_allowance_reset_worker_states w
       set due_at = v_reset.next_allowance_reset_at,
           worker_state = 'ready',
           claim_token = null,
           lease_expires_at = null,
           attempt_count = 0,
           next_attempt_at = null,
           last_outcome_status = 'completed',
           last_reason_code = null,
           last_error_code = null,
           dead_lettered_at = null,
           updated_at = v_now
     where w.account_id = v_state.account_id;

  elsif v_reset.reset_status = 'blocked_catchup' then
    v_dead_lettered := true;
    v_error_code := 'reset_blocked_catchup';

    update public.billing_allowance_reset_worker_attempts a
       set outcome_status = 'blocked_catchup',
           reason_code = v_reset.reason_code,
           error_code = v_error_code,
           retryable = false,
           dead_lettered = true,
           reset_operation_id = v_reset.operation_id,
           billing_subscription_id = v_reset.billing_subscription_id,
           allowance_window_start = v_reset.allowance_window_start,
           allowance_window_end = v_reset.allowance_window_end,
           inserted_lot_count = v_reset.inserted_lot_count,
           verified_lot_count = v_reset.verified_lot_count,
           next_allowance_reset_at = v_reset.next_allowance_reset_at,
           finished_at = v_now
     where a.id = v_attempt.id;

    update public.billing_allowance_reset_worker_states w
       set worker_state = 'dead_letter',
           claim_token = null,
           lease_expires_at = null,
           next_attempt_at = null,
           last_outcome_status = 'blocked_catchup',
           last_reason_code = v_reset.reason_code,
           last_error_code = v_error_code,
           dead_lettered_at = v_now,
           updated_at = v_now
     where w.account_id = v_state.account_id;

  else
    -- Only provider/eventual-consistency outcomes are retried. Structural or
    -- authority failures dead-letter immediately. Every retry is capped at 8.
    v_retryable := (
      v_reset.reset_status = 'not_due'
      and v_reset.reason_code in (
        'waiting_for_provider_period', 'allowance_window_not_started'
      )
    ) or (
      v_reset.reset_status = 'not_eligible'
      and v_reset.reason_code in (
        'subscription_not_active', 'current_provider_period_not_paid'
      )
    );
    v_retryable := v_retryable and v_state.attempt_count < 8;
    v_dead_lettered := not v_retryable;
    v_error_code := case
      when v_retryable then 'reset_' || v_reset.reset_status || '_' || v_reset.reason_code
      when v_state.attempt_count >= 8
        then 'reset_retry_attempt_limit'
      else 'reset_' || v_reset.reset_status || '_' || v_reset.reason_code
    end;
    v_next_attempt_at := case v_state.attempt_count
      when 1 then v_now + interval '5 minutes'
      when 2 then v_now + interval '15 minutes'
      when 3 then v_now + interval '1 hour'
      when 4 then v_now + interval '4 hours'
      when 5 then v_now + interval '12 hours'
      else v_now + interval '24 hours'
    end;
    if not v_retryable then v_next_attempt_at := null; end if;

    update public.billing_allowance_reset_worker_attempts a
       set outcome_status = v_reset.reset_status,
           reason_code = v_reset.reason_code,
           error_code = v_error_code,
           retryable = v_retryable,
           dead_lettered = v_dead_lettered,
           next_attempt_at = v_next_attempt_at,
           billing_subscription_id = v_reset.billing_subscription_id,
           allowance_window_start = v_reset.allowance_window_start,
           allowance_window_end = v_reset.allowance_window_end,
           inserted_lot_count = v_reset.inserted_lot_count,
           verified_lot_count = v_reset.verified_lot_count,
           next_allowance_reset_at = v_reset.next_allowance_reset_at,
           finished_at = v_now
     where a.id = v_attempt.id;

    update public.billing_allowance_reset_worker_states w
       set worker_state = case when v_retryable then 'retry_wait' else 'dead_letter' end,
           claim_token = null,
           lease_expires_at = null,
           next_attempt_at = v_next_attempt_at,
           last_outcome_status = v_reset.reset_status,
           last_reason_code = v_reset.reason_code,
           last_error_code = v_error_code,
           dead_lettered_at = case when v_dead_lettered then v_now else null end,
           updated_at = v_now
     where w.account_id = v_state.account_id;
  end if;

  return query
  select
    a.outcome_status,
    w.worker_state,
    a.id,
    a.account_id,
    a.reset_operation_id,
    a.billing_subscription_id,
    a.allowance_window_start,
    a.allowance_window_end,
    a.inserted_lot_count,
    a.verified_lot_count,
    a.next_allowance_reset_at,
    a.reason_code,
    a.retryable,
    a.dead_lettered,
    a.next_attempt_at
  from public.billing_allowance_reset_worker_attempts a
  join public.billing_allowance_reset_worker_states w on w.account_id = a.account_id
  where a.id = v_attempt.id;
end;
$$;

-- Finalize an owned attempt after a worker/transport failure. Callers submit
-- only one fixed code; the database owns retryability and the attempt ceiling.
create function public.fail_claimed_paid_plan_allowance_reset_work(
  p_claim_token uuid,
  p_error_code text
)
returns table (
  failure_status text,
  recorded_outcome_status text,
  worker_state text,
  attempt_id uuid,
  workspace_id uuid,
  retryable boolean,
  dead_lettered boolean,
  next_attempt_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_state public.billing_allowance_reset_worker_states%rowtype;
  v_attempt public.billing_allowance_reset_worker_attempts%rowtype;
  v_retryable boolean;
  v_next_attempt_at timestamptz;
  v_outcome_status text;
  v_effective_error_code text;
begin
  if p_claim_token is null
     or p_error_code is null
     or p_error_code not in (
       'worker_database_serialization',
       'worker_database_deadlock',
       'worker_database_lock_timeout',
       'worker_database_timeout',
       'worker_transport_error',
       'worker_claim_lease_expired',
       'worker_rpc_contract_error',
       'worker_internal_error'
     ) then
    raise exception 'allowance reset worker failure code is invalid'
      using errcode = '22023';
  end if;

  select w.*
    into v_state
    from public.billing_allowance_reset_worker_states w
   where w.worker_state = 'leased'
     and w.claim_token = p_claim_token
   for update;

  if not found then
    select a.*
      into v_attempt
      from public.billing_allowance_reset_worker_attempts a
     where a.claim_token = p_claim_token;
    if found and v_attempt.outcome_status is not null then
      return query select
        'already_finished'::text,
        v_attempt.outcome_status,
        case
          when v_attempt.retryable then 'retry_wait'
          when v_attempt.dead_lettered then 'dead_letter'
          else 'ready'
        end,
        v_attempt.id,
        v_attempt.account_id,
        v_attempt.retryable,
        v_attempt.dead_lettered,
        v_attempt.next_attempt_at;
      return;
    end if;
    raise exception 'allowance reset worker claim is not owned'
      using errcode = '55000';
  end if;

  -- Once a lease has elapsed, a stale worker may only record a bounded
  -- lease-lost retry. It cannot poison the attempt with a terminal diagnosis,
  -- even if its original failure was otherwise classified as terminal.
  v_effective_error_code := case
    when v_state.lease_expires_at <= v_now then 'worker_claim_lease_expired'
    else p_error_code
  end;

  select a.*
    into v_attempt
    from public.billing_allowance_reset_worker_attempts a
   where a.claim_token = p_claim_token
     and a.account_id = v_state.account_id
   for update;
  if not found or v_attempt.outcome_status is not null then
    raise exception 'allowance reset worker attempt is missing or already terminal'
      using errcode = '55000';
  end if;

  v_retryable := v_effective_error_code in (
    'worker_database_serialization',
    'worker_database_deadlock',
    'worker_database_lock_timeout',
    'worker_database_timeout',
    'worker_transport_error',
    'worker_claim_lease_expired'
  ) and v_state.attempt_count < 8;
  v_outcome_status := case when v_retryable
    then 'failed_retryable' else 'failed_terminal' end;
  v_next_attempt_at := case v_state.attempt_count
    when 1 then v_now + interval '5 minutes'
    when 2 then v_now + interval '15 minutes'
    when 3 then v_now + interval '1 hour'
    when 4 then v_now + interval '4 hours'
    when 5 then v_now + interval '12 hours'
    else v_now + interval '24 hours'
  end;
  if not v_retryable then v_next_attempt_at := null; end if;

  update public.billing_allowance_reset_worker_attempts a
     set outcome_status = v_outcome_status,
         error_code = case when v_state.attempt_count >= 8
           then 'worker_retry_attempt_limit' else v_effective_error_code end,
         retryable = v_retryable,
         dead_lettered = not v_retryable,
         next_attempt_at = v_next_attempt_at,
         finished_at = v_now
   where a.id = v_attempt.id;

  update public.billing_allowance_reset_worker_states w
     set worker_state = case when v_retryable then 'retry_wait' else 'dead_letter' end,
         claim_token = null,
         lease_expires_at = null,
         next_attempt_at = v_next_attempt_at,
         last_outcome_status = v_outcome_status,
         last_reason_code = null,
         last_error_code = case when v_state.attempt_count >= 8
           then 'worker_retry_attempt_limit' else v_effective_error_code end,
         dead_lettered_at = case when v_retryable then null else v_now end,
         updated_at = v_now
   where w.account_id = v_state.account_id;

  return query select
    v_outcome_status,
    v_outcome_status,
    case when v_retryable then 'retry_wait' else 'dead_letter' end,
    v_attempt.id,
    v_attempt.account_id,
    v_retryable,
    not v_retryable,
    v_next_attempt_at;
end;
$$;

-- Explicit 2026 Data API posture: operator/service readers may inspect state
-- and dead letters, while every write remains constrained by the three RPCs.
revoke all on table public.billing_allowance_reset_worker_states
  from public, anon, authenticated, service_role;
revoke all on table public.billing_allowance_reset_worker_attempts
  from public, anon, authenticated, service_role;
grant select on table public.billing_allowance_reset_worker_states to service_role;
grant select on table public.billing_allowance_reset_worker_attempts to service_role;

revoke all on function public.claim_due_paid_plan_allowance_reset_work(integer)
  from public, anon, authenticated, service_role;
revoke all on function public.execute_claimed_paid_plan_allowance_reset_work(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.fail_claimed_paid_plan_allowance_reset_work(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.claim_due_paid_plan_allowance_reset_work(integer)
  to service_role;
grant execute on function public.execute_claimed_paid_plan_allowance_reset_work(uuid)
  to service_role;
grant execute on function public.fail_claimed_paid_plan_allowance_reset_work(uuid, text)
  to service_role;

comment on table public.billing_allowance_reset_worker_states is
  'Dark PII-free one-workspace lease/retry/dead-letter state; no scheduler exists.';
comment on table public.billing_allowance_reset_worker_attempts is
  'Dark PII-free immutable attempt/outcome history for monthly paid-plan allowance resets.';
comment on function public.claim_due_paid_plan_allowance_reset_work(integer) is
  'Dark bounded deterministic due-workspace selector; service role only.';
comment on function public.execute_claimed_paid_plan_allowance_reset_work(uuid) is
  'Dark one-workspace worker executor around the database-owned allowance reset RPC.';

commit;

-- Activation blockers (intentionally unresolved here):
--   1. Apply and transactionally verify this migration in staging.
--   2. Add an operator reconciliation/reset path for dead letters.
--   3. Add a monitored scheduler only after Stripe test-clock coverage.
--   4. Keep the future route server-only and authenticate scheduler requests.
