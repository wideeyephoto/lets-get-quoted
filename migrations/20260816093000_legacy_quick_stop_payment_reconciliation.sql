-- DARK foundation for reconciling legacy destination-charge Quick Stop
-- payments. Nothing in the application imports these RPCs yet.
--
-- Money invariant: a paid Quick Stop is either confirmed with its calendar job
-- activated in the same transaction, or an expired offer owns one durable,
-- exact-input full-refund task. Provider egress is deliberately outside SQL.

begin;

-- A payment may identify at most one Quick Stop. Refuse an ambiguous database
-- instead of choosing a winner or deleting history during a deployment.
do $$
begin
  if exists (
    select r.payment_id
      from public.extra_stop_requests r
     where r.payment_id is not null
     group by r.payment_id
    having pg_catalog.count(*) > 1
  ) then
    raise exception 'ambiguous Quick Stop payment bindings exist; migration stopped without changing data'
      using errcode = '23505';
  end if;

  if exists (
    select 1
      from public.extra_stop_requests r
      join public.payments p on p.id = r.payment_id
     where r.payment_id is not null
       and r.account_id is distinct from p.account_id
  ) then
    raise exception 'cross-account Quick Stop payment bindings exist; migration stopped without changing data'
      using errcode = '23514';
  end if;

  if exists (
    select 1
      from public.extra_stop_requests r
      join public.payments p on p.id = r.payment_id
     where r.payment_id is not null
       and (
         r.job_id is null
         or r.job_id is distinct from p.job_id
         or p.kind::text is distinct from 'deposit'
       )
  ) then
    raise exception 'cross-job or non-deposit Quick Stop payment bindings exist; migration stopped without changing data'
      using errcode = '23514';
  end if;
end
$$;

create unique index if not exists extra_stop_requests_payment_unique
  on public.extra_stop_requests (payment_id)
  where payment_id is not null;

-- System lifecycle rows get a deterministic key. Existing owner-authored event
-- rows remain compatible because their key is null.
alter table public.extra_stop_events
  add column if not exists dedupe_key text;

do $$
begin
  if not exists (
    select 1
      from pg_catalog.pg_constraint
     where conrelid = 'public.extra_stop_events'::pg_catalog.regclass
       and conname = 'extra_stop_events_dedupe_key_check'
  ) then
    alter table public.extra_stop_events
      add constraint extra_stop_events_dedupe_key_check
      check (
        dedupe_key is null
        or (
          pg_catalog.length(dedupe_key) between 12 and 180
          and dedupe_key ~ '^[a-z][a-z0-9_.:-]+$'
        )
      );
  end if;
end
$$;

create unique index if not exists extra_stop_events_request_dedupe_unique
  on public.extra_stop_events (request_id, dedupe_key)
  where dedupe_key is not null;

-- Authenticated owners may continue writing ordinary null-key lifecycle rows,
-- but cannot pre-seed, rewrite, or delete a system dedupe marker.
create or replace function public.protect_quick_stop_system_event_dedupe()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
set timezone = 'UTC'
as $$
begin
  if current_user not in ('postgres', 'service_role') then
    if tg_op = 'INSERT' and new.dedupe_key is not null then
      raise exception 'system Quick Stop event keys are backend-managed'
        using errcode = '42501';
    end if;
    if tg_op = 'UPDATE'
       and (old.dedupe_key is not null or new.dedupe_key is not null) then
      raise exception 'system Quick Stop events are immutable'
        using errcode = '42501';
    end if;
    if tg_op = 'DELETE' and old.dedupe_key is not null then
      raise exception 'system Quick Stop events are immutable'
        using errcode = '42501';
    end if;
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$$;

drop trigger if exists protect_quick_stop_system_event_dedupe_trigger
  on public.extra_stop_events;
create trigger protect_quick_stop_system_event_dedupe_trigger
before insert or update or delete on public.extra_stop_events
for each row execute function public.protect_quick_stop_system_event_dedupe();

revoke all on function public.protect_quick_stop_system_event_dedupe()
  from public, anon, authenticated, service_role;

create table public.quick_stop_payment_tasks (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete restrict,
  request_id uuid not null references public.extra_stop_requests(id) on delete restrict,
  payment_id uuid not null references public.payments(id) on delete restrict,
  job_id uuid not null references public.jobs(id) on delete restrict,

  task_type text not null check (task_type = 'late_refund'),
  task_dedupe_key text not null unique check (
    pg_catalog.length(task_dedupe_key) between 12 and 180
    and task_dedupe_key ~ '^late_refund\.v1:[0-9a-f-]{36}$'
  ),
  reason_code text not null check (
    reason_code = 'late_payment_after_expiry'
  ),

  -- Exact provider-request snapshot. A future adapter must use these values
  -- verbatim; it must never recompute an idempotency key from mutable rows.
  charge_model text not null check (charge_model = 'destination'),
  currency text not null check (currency = 'usd'),
  reverse_transfer boolean not null check (reverse_transfer),
  refund_application_fee boolean not null check (refund_application_fee),
  stripe_payment_intent text not null check (
    pg_catalog.length(pg_catalog.btrim(stripe_payment_intent)) between 4 and 255
  ),
  gross_amount_cents bigint not null check (gross_amount_cents > 0),
  refunded_amount_cents bigint not null check (
    refunded_amount_cents >= 0
    and refunded_amount_cents < gross_amount_cents
  ),
  refund_amount_cents bigint not null check (
    refund_amount_cents > 0
    and refund_amount_cents = gross_amount_cents - refunded_amount_cents
  ),
  stripe_idempotency_key text not null unique check (
    pg_catalog.length(stripe_idempotency_key) between 20 and 255
    and stripe_idempotency_key ~ '^quick_stop_late_refund_v1_[0-9a-f_]+$'
  ),
  request_fingerprint text not null check (
    request_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  payment_paid_at timestamptz not null,

  task_state text not null default 'ready' check (
    task_state in ('ready', 'leased', 'retry_wait', 'completed', 'dead_letter')
  ),
  claim_token uuid,
  last_claim_token uuid,
  lease_expires_at timestamptz,
  attempt_count integer not null default 0 check (attempt_count between 0 and 8),
  next_attempt_at timestamptz,
  last_error_code text check (
    last_error_code is null
    or (
      pg_catalog.length(last_error_code) between 3 and 100
      and last_error_code ~ '^[a-z][a-z0-9_]+$'
    )
  ),
  stripe_refund_id text check (
    stripe_refund_id is null
    or (
      pg_catalog.length(pg_catalog.btrim(stripe_refund_id)) between 4 and 255
      and stripe_refund_id ~ '^re_[A-Za-z0-9_]+$'
    )
  ),
  completion_source text check (
    completion_source is null
    or completion_source in ('provider_result', 'payment_state')
  ),
  completed_at timestamptz,
  dead_lettered_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),

  constraint quick_stop_payment_tasks_payment_type_unique
    unique (payment_id, task_type),
  constraint quick_stop_payment_tasks_request_type_unique
    unique (request_id, task_type),
  constraint quick_stop_payment_tasks_state_shape_check check (
    (
      task_state = 'ready'
      and claim_token is null
      and last_claim_token is null
      and lease_expires_at is null
      and attempt_count = 0
      and next_attempt_at is null
      and last_error_code is null
      and stripe_refund_id is null
      and completion_source is null
      and completed_at is null
      and dead_lettered_at is null
    )
    or (
      task_state = 'leased'
      and claim_token is not null
      and last_claim_token = claim_token
      and lease_expires_at is not null
      and attempt_count between 1 and 8
      and next_attempt_at is null
      and stripe_refund_id is null
      and completion_source is null
      and completed_at is null
      and dead_lettered_at is null
    )
    or (
      task_state = 'retry_wait'
      and claim_token is null
      and last_claim_token is not null
      and lease_expires_at is null
      and attempt_count between 1 and 7
      and next_attempt_at is not null
      and last_error_code is not null
      and stripe_refund_id is null
      and completion_source is null
      and completed_at is null
      and dead_lettered_at is null
    )
    or (
      task_state = 'completed'
      and claim_token is null
      and lease_expires_at is null
      and next_attempt_at is null
      and last_error_code is null
      and completion_source is not null
      and completed_at is not null
      and dead_lettered_at is null
      and (
        (completion_source = 'provider_result' and stripe_refund_id is not null)
        or completion_source = 'payment_state'
      )
    )
    or (
      task_state = 'dead_letter'
      and claim_token is null
      and lease_expires_at is null
      and attempt_count between 0 and 8
      and next_attempt_at is null
      and last_error_code is not null
      and stripe_refund_id is null
      and completion_source is null
      and completed_at is null
      and dead_lettered_at is not null
    )
  )
);

create unique index quick_stop_payment_tasks_claim_unique
  on public.quick_stop_payment_tasks (claim_token)
  where claim_token is not null;
create index quick_stop_payment_tasks_work_idx
  on public.quick_stop_payment_tasks (task_state, next_attempt_at, lease_expires_at, created_at, id)
  where task_state in ('ready', 'leased', 'retry_wait');
create index quick_stop_payment_tasks_dead_letter_idx
  on public.quick_stop_payment_tasks (dead_lettered_at desc, id)
  where task_state = 'dead_letter';

alter table public.quick_stop_payment_tasks enable row level security;
alter table public.quick_stop_payment_tasks force row level security;

-- Immutable provider inputs cannot be changed even by another backend path.
create function public.protect_quick_stop_payment_task_snapshot()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
set timezone = 'UTC'
as $$
begin
  if old.account_id is distinct from new.account_id
     or old.request_id is distinct from new.request_id
     or old.payment_id is distinct from new.payment_id
     or old.job_id is distinct from new.job_id
     or old.task_type is distinct from new.task_type
     or old.task_dedupe_key is distinct from new.task_dedupe_key
     or old.reason_code is distinct from new.reason_code
     or old.charge_model is distinct from new.charge_model
     or old.currency is distinct from new.currency
     or old.reverse_transfer is distinct from new.reverse_transfer
     or old.refund_application_fee is distinct from new.refund_application_fee
     or old.stripe_payment_intent is distinct from new.stripe_payment_intent
     or old.gross_amount_cents is distinct from new.gross_amount_cents
     or old.refunded_amount_cents is distinct from new.refunded_amount_cents
     or old.refund_amount_cents is distinct from new.refund_amount_cents
     or old.stripe_idempotency_key is distinct from new.stripe_idempotency_key
     or old.request_fingerprint is distinct from new.request_fingerprint
     or old.payment_paid_at is distinct from new.payment_paid_at
     or old.created_at is distinct from new.created_at then
    raise exception 'Quick Stop payment task provider snapshot is immutable'
      using errcode = '22000';
  end if;
  return new;
end
$$;

create trigger protect_quick_stop_payment_task_snapshot_trigger
before update on public.quick_stop_payment_tasks
for each row execute function public.protect_quick_stop_payment_task_snapshot();

revoke all on function public.protect_quick_stop_payment_task_snapshot()
  from public, anon, authenticated, service_role;

-- Transactionally reconcile one already-settled legacy payment. This function
-- is intentionally unusable for a direct charge, even by a future caller that
-- accidentally reaches it.
create function public.reconcile_legacy_quick_stop_payment(p_payment_id uuid)
returns table (
  reconcile_status text,
  quick_stop_request_id uuid,
  late_refund_task_id uuid,
  late_refund_task_state text
)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone = 'UTC'
as $$
declare
  v_payment public.payments%rowtype;
  v_request public.extra_stop_requests%rowtype;
  v_job public.jobs%rowtype;
  v_task public.quick_stop_payment_tasks%rowtype;
  v_event public.extra_stop_events%rowtype;
  v_now timestamptz := pg_catalog.now();
  v_gross_cents bigint;
  v_refunded_cents bigint;
  v_refund_cents bigint;
  v_task_key text;
  v_event_key text;
  v_idempotency_key text;
  v_snapshot jsonb;
  v_fingerprint text;
begin
  if p_payment_id is null then
    raise exception 'payment ID is required' using errcode = '22023';
  end if;

  -- Every task-aware path takes task -> payment -> request locks. On an
  -- initial reconciliation there is no visible task yet, so the payment lock
  -- serializes competing creators before either can insert one.
  select t.* into v_task
    from public.quick_stop_payment_tasks t
   where t.payment_id = p_payment_id
     and t.task_type = 'late_refund'
   for update;

  select p.* into v_payment
    from public.payments p
   where p.id = p_payment_id
   for update;
  if not found then
    raise exception 'payment was not found' using errcode = 'P0002';
  end if;
  if v_payment.charge_model is distinct from 'destination' then
    raise exception 'legacy Quick Stop reconciliation requires a destination payment'
      using errcode = '22000';
  end if;
  if v_payment.status not in ('paid', 'refunded') then
    raise exception 'legacy Quick Stop reconciliation requires settled payment truth'
      using errcode = '55000';
  end if;
  if v_payment.status = 'paid' and v_payment.paid_at is null then
    raise exception 'paid legacy Quick Stop payment is missing its settlement timestamp'
      using errcode = '22000';
  end if;

  select r.* into v_request
    from public.extra_stop_requests r
   where r.payment_id = p_payment_id
   for update;
  if not found then
    return query select 'not_quick_stop'::text, null::uuid, null::uuid, null::text;
    return;
  end if;

  if v_request.account_id is distinct from v_payment.account_id then
    raise exception 'Quick Stop and payment account scopes do not match'
      using errcode = '23514';
  end if;
  if v_request.job_id is null
     or v_request.job_id is distinct from v_payment.job_id
     or v_payment.kind::text is distinct from 'deposit' then
    raise exception 'Quick Stop and payment job scopes do not match'
      using errcode = '23514';
  end if;

  v_gross_cents := (v_payment.amount * 100)::bigint;
  v_refunded_cents := (coalesce(v_payment.refunded_amount, 0) * 100)::bigint;
  if v_gross_cents <= 0
     or v_payment.amount is distinct from v_gross_cents::numeric / 100
     or v_refunded_cents < 0
     or coalesce(v_payment.refunded_amount, 0)
        is distinct from v_refunded_cents::numeric / 100
     or v_refunded_cents > v_gross_cents then
    raise exception 'Quick Stop payment amount cannot be represented exactly in cents'
      using errcode = '22000';
  end if;
  if v_request.fee_cents is null
     or v_request.fee_cents::bigint is distinct from v_gross_cents then
    raise exception 'Quick Stop fee and payment amount do not match'
      using errcode = '22000';
  end if;

  if v_request.status in ('awaiting_customer_payment', 'confirmed') then
    if v_payment.status <> 'paid' then
      raise exception 'a refunded payment cannot confirm a Quick Stop'
        using errcode = '55000';
    end if;
    if v_request.job_id is null then
      raise exception 'paid Quick Stop has no calendar job'
        using errcode = '55000';
    end if;
    select j.* into v_job
      from public.jobs j
     where j.id = v_request.job_id
       and j.account_id = v_request.account_id
     for update;
    if not found then
      raise exception 'paid Quick Stop calendar job is unavailable'
        using errcode = '55000';
    end if;

    -- A fresh confirmation may activate only a tentative/live job. A replay of
    -- an already-confirmed payment must remain idempotent after the appointment
    -- has naturally moved to complete or archived.
    if v_request.status = 'awaiting_customer_payment' then
      if v_job.status not in ('new_lead', 'in_progress') then
        raise exception 'paid Quick Stop calendar job is unavailable'
          using errcode = '55000';
      end if;

      if v_job.status = 'new_lead' then
        update public.jobs j
           set status = 'in_progress'
         where j.id = v_job.id
           and j.account_id = v_request.account_id
           and j.status = 'new_lead';
        if not found then
          raise exception 'Quick Stop calendar job changed during confirmation'
            using errcode = '40001';
        end if;
      end if;
    end if;

    if v_request.status = 'awaiting_customer_payment' then
      update public.extra_stop_requests r
         set status = 'confirmed',
             paid_at = coalesce(r.paid_at, v_payment.paid_at, v_now),
             updated_at = v_now
       where r.id = v_request.id
         and r.status = 'awaiting_customer_payment';
      if not found then
        raise exception 'Quick Stop changed during confirmation'
          using errcode = '40001';
      end if;
    end if;

    v_event_key := 'quick_stop_payment.confirmed.v1:' || p_payment_id::text;
    insert into public.extra_stop_events (
      account_id, request_id, actor, from_status, to_status, meta, dedupe_key
    ) values (
      v_request.account_id,
      v_request.id,
      'stripe',
      'awaiting_customer_payment',
      'confirmed',
      pg_catalog.jsonb_build_object(
        'paymentId', p_payment_id,
        'reason', 'legacy_destination_payment_settled'
      ),
      v_event_key
    )
    on conflict (request_id, dedupe_key) where dedupe_key is not null do nothing;

    select e.* into v_event
      from public.extra_stop_events e
     where e.request_id = v_request.id
       and e.dedupe_key = v_event_key;
    if not found
       or v_event.account_id is distinct from v_request.account_id
       or v_event.actor is distinct from 'stripe'
       or v_event.from_status is distinct from 'awaiting_customer_payment'
       or v_event.to_status is distinct from 'confirmed'
       or v_event.meta is distinct from pg_catalog.jsonb_build_object(
         'paymentId', p_payment_id,
         'reason', 'legacy_destination_payment_settled'
       ) then
      raise exception 'Quick Stop confirmation event dedupe conflict'
        using errcode = '23505';
    end if;

    return query select
      case when v_request.status = 'confirmed' then 'already_confirmed' else 'confirmed' end,
      v_request.id,
      null::uuid,
      null::text;
    return;
  end if;

  if v_request.status = 'offer_expired' then
    -- A signed Stripe refund may have reconciled the payment before this repair
    -- path ran. Finish locally without scheduling a second provider mutation.
    if v_payment.status = 'refunded' and v_refunded_cents = v_gross_cents then
      if v_task.id is not null then
        if v_task.account_id is distinct from v_request.account_id
           or v_task.request_id is distinct from v_request.id
           or v_task.payment_id is distinct from p_payment_id
           or v_task.job_id is distinct from v_request.job_id
           or v_task.charge_model is distinct from 'destination'
           or v_task.currency is distinct from 'usd'
           or v_task.reverse_transfer is distinct from true
           or v_task.refund_application_fee is distinct from true
           or v_task.stripe_payment_intent is distinct from v_payment.stripe_payment_intent
           or v_task.gross_amount_cents is distinct from v_gross_cents then
          raise exception 'refunded Quick Stop conflicts with its durable task scope'
            using errcode = '23514';
        end if;

        if v_task.task_state <> 'completed' then
          update public.quick_stop_payment_tasks t
             set task_state = 'completed', claim_token = null,
                 lease_expires_at = null, next_attempt_at = null,
                 last_error_code = null, stripe_refund_id = null,
                 completion_source = 'payment_state', completed_at = v_now,
                 dead_lettered_at = null, updated_at = v_now
           where t.id = v_task.id;
        end if;
      end if;

      update public.extra_stop_requests r
         set status = 'refunded', refund_cents = v_gross_cents::integer,
             updated_at = v_now
       where r.id = v_request.id and r.status = 'offer_expired';
      if not found then
        raise exception 'expired Quick Stop changed during refund reconciliation'
          using errcode = '40001';
      end if;

      v_event_key := 'quick_stop_payment.late_refund_completed.v1:' || p_payment_id::text;
      insert into public.extra_stop_events (
        account_id, request_id, actor, from_status, to_status, meta, dedupe_key
      ) values (
        v_request.account_id, v_request.id, 'system', 'offer_expired', 'refunded',
        pg_catalog.jsonb_build_object(
          'paymentId', p_payment_id,
          'reason', 'late_payment_after_expiry',
          'source', 'payment_state'
        ),
        v_event_key
      )
      on conflict (request_id, dedupe_key) where dedupe_key is not null do nothing;

      return query select 'refund_reconciled'::text, v_request.id, null::uuid, 'completed'::text;
      return;
    end if;

    if v_payment.status <> 'paid'
       or v_payment.stripe_payment_intent is null
       or not pg_catalog.length(pg_catalog.btrim(v_payment.stripe_payment_intent)) between 4 and 255
       or v_refunded_cents >= v_gross_cents then
      raise exception 'expired Quick Stop lacks exact refundable payment truth'
        using errcode = '55000';
    end if;

    v_refund_cents := v_gross_cents - v_refunded_cents;
    v_task_key := 'late_refund.v1:' || p_payment_id::text;
    v_idempotency_key := 'quick_stop_late_refund_v1_'
      || pg_catalog.replace(p_payment_id::text, '-', '_') || '_'
      || v_refunded_cents::text || '_' || v_refund_cents::text;
    v_snapshot := pg_catalog.jsonb_build_object(
      'version', 1,
      'task_type', 'late_refund',
      'reason_code', 'late_payment_after_expiry',
      'account_id', v_request.account_id,
      'request_id', v_request.id,
      'payment_id', p_payment_id,
      'job_id', v_request.job_id,
      'charge_model', 'destination',
      'currency', 'usd',
      'reverse_transfer', true,
      'refund_application_fee', true,
      'stripe_payment_intent', v_payment.stripe_payment_intent,
      'gross_amount_cents', v_gross_cents,
      'refunded_amount_cents', v_refunded_cents,
      'refund_amount_cents', v_refund_cents,
      'payment_paid_at', v_payment.paid_at,
      'stripe_idempotency_key', v_idempotency_key
    );
    v_fingerprint := pg_catalog.encode(
      extensions.digest(pg_catalog.convert_to(v_snapshot::text, 'UTF8'), 'sha256'),
      'hex'
    );

    insert into public.quick_stop_payment_tasks (
      account_id, request_id, payment_id, job_id, task_type, task_dedupe_key,
      reason_code, charge_model, currency, reverse_transfer,
      refund_application_fee, stripe_payment_intent,
      gross_amount_cents, refunded_amount_cents, refund_amount_cents,
      stripe_idempotency_key, request_fingerprint, payment_paid_at
    ) values (
      v_request.account_id, v_request.id, p_payment_id, v_request.job_id,
      'late_refund', v_task_key, 'late_payment_after_expiry', 'destination',
      'usd', true, true, v_payment.stripe_payment_intent,
      v_gross_cents, v_refunded_cents, v_refund_cents,
      v_idempotency_key, v_fingerprint, v_payment.paid_at
    )
    on conflict (payment_id, task_type) do nothing;

    select t.* into v_task
      from public.quick_stop_payment_tasks t
     where t.payment_id = p_payment_id
       and t.task_type = 'late_refund'
     for update;
    if not found
       or v_task.account_id is distinct from v_request.account_id
       or v_task.request_id is distinct from v_request.id
       or v_task.job_id is distinct from v_request.job_id
       or v_task.task_dedupe_key is distinct from v_task_key
       or v_task.reason_code is distinct from 'late_payment_after_expiry'
       or v_task.charge_model is distinct from 'destination'
       or v_task.currency is distinct from 'usd'
       or v_task.reverse_transfer is distinct from true
       or v_task.refund_application_fee is distinct from true
       or v_task.stripe_payment_intent is distinct from v_payment.stripe_payment_intent
       or v_task.gross_amount_cents is distinct from v_gross_cents
       or v_task.refunded_amount_cents is distinct from v_refunded_cents
       or v_task.refund_amount_cents is distinct from v_refund_cents
       or v_task.stripe_idempotency_key is distinct from v_idempotency_key
       or v_task.request_fingerprint is distinct from v_fingerprint
       or v_task.payment_paid_at is distinct from v_payment.paid_at then
      raise exception 'late Quick Stop refund task immutable snapshot conflict'
        using errcode = '23505';
    end if;

    v_event_key := 'quick_stop_payment.late_refund_queued.v1:' || p_payment_id::text;
    insert into public.extra_stop_events (
      account_id, request_id, actor, from_status, to_status, meta, dedupe_key
    ) values (
      v_request.account_id, v_request.id, 'system', 'offer_expired', 'offer_expired',
      pg_catalog.jsonb_build_object(
        'paymentId', p_payment_id,
        'reason', 'late_payment_after_expiry',
        'taskId', v_task.id
      ),
      v_event_key
    )
    on conflict (request_id, dedupe_key) where dedupe_key is not null do nothing;

    select e.* into v_event
      from public.extra_stop_events e
     where e.request_id = v_request.id
       and e.dedupe_key = v_event_key;
    if not found
       or v_event.account_id is distinct from v_request.account_id
       or v_event.actor is distinct from 'system'
       or v_event.from_status is distinct from 'offer_expired'
       or v_event.to_status is distinct from 'offer_expired'
       or v_event.meta is distinct from pg_catalog.jsonb_build_object(
         'paymentId', p_payment_id,
         'reason', 'late_payment_after_expiry',
         'taskId', v_task.id
       ) then
      raise exception 'late Quick Stop refund queue event dedupe conflict'
        using errcode = '23505';
    end if;

    return query select
      case when v_task.task_state = 'ready' and v_task.attempt_count = 0
        then 'refund_queued' else 'refund_already_queued' end,
      v_request.id,
      v_task.id,
      v_task.task_state;
    return;
  end if;

  if v_request.status = 'refunded'
     and v_payment.status = 'refunded'
     and v_refunded_cents = v_gross_cents then
    return query select 'already_refunded'::text, v_request.id, null::uuid, 'completed'::text;
    return;
  end if;

  return query select 'not_actionable'::text, v_request.id, null::uuid, null::text;
end
$$;

-- Claim a bounded set. Expired leases are safe to retry because every provider
-- attempt must reuse the stored immutable Stripe idempotency key and payload.
create function public.claim_legacy_quick_stop_late_refund_tasks(p_batch_size integer default 1)
returns table (
  work_claim_token uuid,
  task_id uuid,
  account_id uuid,
  request_id uuid,
  payment_id uuid,
  job_id uuid,
  stripe_payment_intent text,
  gross_amount_cents bigint,
  refunded_amount_cents bigint,
  refund_amount_cents bigint,
  currency text,
  reverse_transfer boolean,
  refund_application_fee boolean,
  stripe_idempotency_key text,
  request_fingerprint text,
  reason_code text,
  attempt_number integer,
  lease_expires_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone = 'UTC'
as $$
declare
  v_task public.quick_stop_payment_tasks%rowtype;
  v_payment public.payments%rowtype;
  v_request public.extra_stop_requests%rowtype;
  v_now timestamptz := pg_catalog.now();
  v_claim_token uuid;
  v_lease_expires_at timestamptz;
  v_current_gross bigint;
  v_current_refunded bigint;
  v_event_key text;
  v_claimed integer := 0;
begin
  if p_batch_size is null or p_batch_size < 1 or p_batch_size > 10 then
    raise exception 'Quick Stop late-refund batch size must be between 1 and 10'
      using errcode = '22023';
  end if;

  for v_task in
    select t.*
      from public.quick_stop_payment_tasks t
     where t.task_type = 'late_refund'
       and (
         t.task_state = 'ready'
         or (t.task_state = 'retry_wait' and t.next_attempt_at <= v_now)
         or (t.task_state = 'leased' and t.lease_expires_at <= v_now)
       )
     order by t.created_at, t.id
     for update skip locked
  loop
    exit when v_claimed >= p_batch_size;

    select p.* into v_payment
      from public.payments p
     where p.id = v_task.payment_id
     for update;
    select r.* into v_request
      from public.extra_stop_requests r
     where r.id = v_task.request_id
     for update;

    if not found then
      update public.quick_stop_payment_tasks t
         set task_state = 'dead_letter', claim_token = null,
             lease_expires_at = null, next_attempt_at = null,
             last_error_code = 'request_missing',
             dead_lettered_at = v_now, updated_at = v_now
       where t.id = v_task.id;
      continue;
    end if;

    if v_payment.id is null
       or v_payment.account_id is distinct from v_task.account_id
       or v_payment.job_id is distinct from v_task.job_id
       or v_payment.kind::text is distinct from 'deposit'
       or v_payment.charge_model is distinct from 'destination'
       or v_payment.stripe_payment_intent is distinct from v_task.stripe_payment_intent
       or v_request.account_id is distinct from v_task.account_id
       or v_request.payment_id is distinct from v_task.payment_id
       or v_request.job_id is distinct from v_task.job_id
       or v_task.reverse_transfer is distinct from true
       or v_task.refund_application_fee is distinct from true then
      update public.quick_stop_payment_tasks t
         set task_state = 'dead_letter', claim_token = null,
             lease_expires_at = null, next_attempt_at = null,
             last_error_code = 'payment_scope_changed',
             dead_lettered_at = v_now, updated_at = v_now
       where t.id = v_task.id;
      continue;
    end if;

    v_current_gross := (v_payment.amount * 100)::bigint;
    v_current_refunded := (coalesce(v_payment.refunded_amount, 0) * 100)::bigint;

    if v_payment.amount is distinct from v_current_gross::numeric / 100
       or coalesce(v_payment.refunded_amount, 0)
          is distinct from v_current_refunded::numeric / 100 then
      update public.quick_stop_payment_tasks t
         set task_state = 'dead_letter', claim_token = null,
             lease_expires_at = null, next_attempt_at = null,
             last_error_code = 'payment_amount_not_exact',
             dead_lettered_at = v_now, updated_at = v_now
       where t.id = v_task.id;
      continue;
    end if;

    -- Recover a provider-success/local-finalizer-loss only from authoritative,
    -- full local refund truth. No second provider request is needed.
    if v_payment.status = 'refunded'
       and v_current_gross = v_task.gross_amount_cents
       and v_current_refunded = v_task.gross_amount_cents
       and v_request.status in ('offer_expired', 'refunded') then
      if v_request.status = 'offer_expired' then
        update public.extra_stop_requests r
           set status = 'refunded', refund_cents = v_task.gross_amount_cents::integer,
               updated_at = v_now
         where r.id = v_task.request_id and r.status = 'offer_expired';
        if not found then
          raise exception 'Quick Stop changed during payment-state refund recovery'
            using errcode = '40001';
        end if;
      elsif v_request.refund_cents::bigint is distinct from v_task.gross_amount_cents then
        raise exception 'refunded Quick Stop amount conflicts with task snapshot'
          using errcode = '22000';
      end if;

      v_event_key := 'quick_stop_payment.late_refund_completed.v1:' || v_task.payment_id::text;
      insert into public.extra_stop_events (
        account_id, request_id, actor, from_status, to_status, meta, dedupe_key
      ) values (
        v_task.account_id, v_task.request_id, 'system', 'offer_expired', 'refunded',
        pg_catalog.jsonb_build_object(
          'paymentId', v_task.payment_id,
          'reason', v_task.reason_code,
          'source', 'payment_state',
          'taskId', v_task.id
        ),
        v_event_key
      )
      on conflict (request_id, dedupe_key) where dedupe_key is not null do nothing;

      update public.quick_stop_payment_tasks t
         set task_state = 'completed', claim_token = null,
             lease_expires_at = null, next_attempt_at = null,
             last_error_code = null, completion_source = 'payment_state',
             completed_at = v_now, dead_lettered_at = null,
             updated_at = v_now
       where t.id = v_task.id;
      continue;
    end if;

    -- A final provider attempt can succeed just before its lease expires. Give
    -- authoritative full-refund truth the chance to repair locally before the
    -- attempt ceiling becomes terminal.
    if v_task.attempt_count >= 8 then
      update public.quick_stop_payment_tasks t
         set task_state = 'dead_letter', claim_token = null,
             lease_expires_at = null, next_attempt_at = null,
             last_error_code = 'worker_attempt_limit_reached',
             dead_lettered_at = v_now, updated_at = v_now
       where t.id = v_task.id;
      continue;
    end if;

    if v_payment.status is distinct from 'paid'
       or v_request.status is distinct from 'offer_expired'
       or v_current_gross is distinct from v_task.gross_amount_cents
       or v_current_refunded is distinct from v_task.refunded_amount_cents then
      update public.quick_stop_payment_tasks t
         set task_state = 'dead_letter', claim_token = null,
             lease_expires_at = null, next_attempt_at = null,
             last_error_code = 'payment_snapshot_changed',
             dead_lettered_at = v_now, updated_at = v_now
       where t.id = v_task.id;
      continue;
    end if;

    v_claim_token := pg_catalog.gen_random_uuid();
    v_lease_expires_at := v_now + interval '5 minutes';
    update public.quick_stop_payment_tasks t
       set task_state = 'leased', claim_token = v_claim_token,
           last_claim_token = v_claim_token,
           lease_expires_at = v_lease_expires_at,
           attempt_count = t.attempt_count + 1,
           next_attempt_at = null, last_error_code = null,
           dead_lettered_at = null, updated_at = v_now
     where t.id = v_task.id
     returning t.* into v_task;

    v_claimed := v_claimed + 1;
    return query select
      v_claim_token,
      v_task.id,
      v_task.account_id,
      v_task.request_id,
      v_task.payment_id,
      v_task.job_id,
      v_task.stripe_payment_intent,
      v_task.gross_amount_cents,
      v_task.refunded_amount_cents,
      v_task.refund_amount_cents,
      v_task.currency,
      v_task.reverse_transfer,
      v_task.refund_application_fee,
      v_task.stripe_idempotency_key,
      v_task.request_fingerprint,
      v_task.reason_code,
      v_task.attempt_count,
      v_lease_expires_at;
  end loop;
end
$$;

create function public.complete_legacy_quick_stop_late_refund_task(
  p_task_id uuid,
  p_claim_token uuid,
  p_stripe_refund_id text
)
returns table (completion_status text, task_state text)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone = 'UTC'
as $$
declare
  v_task public.quick_stop_payment_tasks%rowtype;
  v_payment public.payments%rowtype;
  v_request public.extra_stop_requests%rowtype;
  v_now timestamptz := pg_catalog.now();
  v_gross bigint;
  v_refunded bigint;
  v_event_key text;
begin
  if p_task_id is null or p_claim_token is null
     or p_stripe_refund_id is null
     or p_stripe_refund_id !~ '^re_[A-Za-z0-9_]+$'
     or not pg_catalog.length(pg_catalog.btrim(p_stripe_refund_id)) between 4 and 255 then
    raise exception 'valid task, claim, and Stripe refund IDs are required'
      using errcode = '22023';
  end if;

  select t.* into v_task
    from public.quick_stop_payment_tasks t
   where t.id = p_task_id
   for update;
  if not found then
    raise exception 'Quick Stop late-refund task was not found'
      using errcode = 'P0002';
  end if;

  if v_task.task_state = 'completed' then
    if v_task.completion_source = 'provider_result'
       and v_task.stripe_refund_id is distinct from p_stripe_refund_id then
      raise exception 'completed Quick Stop refund has different provider evidence'
        using errcode = '22000';
    end if;
    return query select 'already_completed'::text, 'completed'::text;
    return;
  end if;
  if v_task.task_state = 'dead_letter' then
    return query select 'already_finished'::text, 'dead_letter'::text;
    return;
  end if;
  if v_task.task_state <> 'leased'
     or v_task.claim_token is distinct from p_claim_token
     or v_task.lease_expires_at <= v_now then
    raise exception 'Quick Stop late-refund claim is stale'
      using errcode = '55000';
  end if;

  select p.* into v_payment
    from public.payments p
   where p.id = v_task.payment_id
   for update;
  select r.* into v_request
    from public.extra_stop_requests r
   where r.id = v_task.request_id
   for update;

  if v_payment.id is null
     or v_payment.account_id is distinct from v_task.account_id
     or v_payment.job_id is distinct from v_task.job_id
     or v_payment.kind::text is distinct from 'deposit'
     or v_payment.charge_model is distinct from 'destination'
     or v_payment.stripe_payment_intent is distinct from v_task.stripe_payment_intent
     or v_request.id is null
     or v_request.account_id is distinct from v_task.account_id
     or v_request.payment_id is distinct from v_task.payment_id
     or v_request.job_id is distinct from v_task.job_id
     or v_task.reverse_transfer is distinct from true
     or v_task.refund_application_fee is distinct from true then
    raise exception 'Quick Stop refund completion scope changed'
      using errcode = '22000';
  end if;

  v_gross := (v_payment.amount * 100)::bigint;
  v_refunded := (coalesce(v_payment.refunded_amount, 0) * 100)::bigint;
  if v_payment.amount is distinct from v_gross::numeric / 100
     or coalesce(v_payment.refunded_amount, 0)
        is distinct from v_refunded::numeric / 100
     or v_payment.status is distinct from 'refunded'
     or v_gross is distinct from v_task.gross_amount_cents
     or v_refunded is distinct from v_task.gross_amount_cents then
    raise exception 'full destination refund is not yet reconciled locally'
      using errcode = '55000';
  end if;

  if v_request.status = 'offer_expired' then
    update public.extra_stop_requests r
       set status = 'refunded', refund_cents = v_task.gross_amount_cents::integer,
           updated_at = v_now
     where r.id = v_task.request_id and r.status = 'offer_expired';
    if not found then
      raise exception 'Quick Stop changed during refund completion'
        using errcode = '40001';
    end if;
  elsif v_request.status <> 'refunded'
        or v_request.refund_cents::bigint is distinct from v_task.gross_amount_cents then
    raise exception 'Quick Stop refund completion state conflicts with task'
      using errcode = '22000';
  end if;

  v_event_key := 'quick_stop_payment.late_refund_completed.v1:' || v_task.payment_id::text;
  insert into public.extra_stop_events (
    account_id, request_id, actor, from_status, to_status, meta, dedupe_key
  ) values (
    v_task.account_id, v_task.request_id, 'system', 'offer_expired', 'refunded',
    pg_catalog.jsonb_build_object(
      'paymentId', v_task.payment_id,
      'reason', v_task.reason_code,
      'source', 'provider_result',
      'stripeRefundId', p_stripe_refund_id,
      'taskId', v_task.id
    ),
    v_event_key
  )
  on conflict (request_id, dedupe_key) where dedupe_key is not null do nothing;

  update public.quick_stop_payment_tasks t
     set task_state = 'completed', claim_token = null,
         lease_expires_at = null, next_attempt_at = null,
         last_error_code = null, stripe_refund_id = p_stripe_refund_id,
         completion_source = 'provider_result', completed_at = v_now,
         dead_lettered_at = null, updated_at = v_now
   where t.id = v_task.id;

  return query select 'completed'::text, 'completed'::text;
end
$$;

create function public.fail_legacy_quick_stop_late_refund_task(
  p_task_id uuid,
  p_claim_token uuid,
  p_error_code text,
  p_retryable boolean
)
returns table (failure_status text, task_state text, next_attempt_at timestamptz)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone = 'UTC'
as $$
declare
  v_task public.quick_stop_payment_tasks%rowtype;
  v_now timestamptz := pg_catalog.now();
  v_next_attempt_at timestamptz;
begin
  if p_task_id is null or p_claim_token is null or p_retryable is null
     or p_error_code is null
     or pg_catalog.length(p_error_code) not between 3 and 100
     or p_error_code !~ '^[a-z][a-z0-9_]+$' then
    raise exception 'valid PII-free failure inputs are required'
      using errcode = '22023';
  end if;

  select t.* into v_task
    from public.quick_stop_payment_tasks t
   where t.id = p_task_id
   for update;
  if not found then
    raise exception 'Quick Stop late-refund task was not found'
      using errcode = 'P0002';
  end if;

  -- Idempotent response if the caller lost the result of this same failure.
  if v_task.task_state in ('retry_wait', 'dead_letter', 'completed')
     and v_task.last_claim_token = p_claim_token then
    return query select
      case
        when v_task.task_state = 'retry_wait' then 'failed_retryable'
        when v_task.task_state = 'completed' then 'already_finished'
        else 'failed_terminal'
      end,
      v_task.task_state,
      v_task.next_attempt_at;
    return;
  end if;

  if v_task.task_state <> 'leased'
     or v_task.claim_token is distinct from p_claim_token
     or v_task.lease_expires_at <= v_now then
    raise exception 'Quick Stop late-refund failure claim is stale'
      using errcode = '55000';
  end if;

  if p_retryable and v_task.attempt_count < 8 then
    v_next_attempt_at := v_now + pg_catalog.make_interval(
      mins => least(
        60,
        (5 * pg_catalog.power(2, v_task.attempt_count - 1))::integer
      )
    );
    update public.quick_stop_payment_tasks t
       set task_state = 'retry_wait', claim_token = null,
           lease_expires_at = null, next_attempt_at = v_next_attempt_at,
           last_error_code = p_error_code, updated_at = v_now
     where t.id = v_task.id;
    return query select 'failed_retryable'::text, 'retry_wait'::text, v_next_attempt_at;
    return;
  end if;

  update public.quick_stop_payment_tasks t
     set task_state = 'dead_letter', claim_token = null,
         lease_expires_at = null, next_attempt_at = null,
         last_error_code = case
           when p_retryable then 'worker_attempt_limit_reached'
           else p_error_code
         end,
         dead_lettered_at = v_now, updated_at = v_now
   where t.id = v_task.id;
  return query select 'failed_terminal'::text, 'dead_letter'::text, null::timestamptz;
end
$$;

-- No browser role can read or mutate the task ledger. The service role reads
-- it for operations only and mutates exclusively through the guarded RPCs.
revoke all on table public.quick_stop_payment_tasks
  from public, anon, authenticated, service_role;
grant select on table public.quick_stop_payment_tasks to service_role;

revoke all on function public.reconcile_legacy_quick_stop_payment(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.claim_legacy_quick_stop_late_refund_tasks(integer)
  from public, anon, authenticated, service_role;
revoke all on function public.complete_legacy_quick_stop_late_refund_task(uuid, uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.fail_legacy_quick_stop_late_refund_task(uuid, uuid, text, boolean)
  from public, anon, authenticated, service_role;

grant execute on function public.reconcile_legacy_quick_stop_payment(uuid)
  to service_role;
grant execute on function public.claim_legacy_quick_stop_late_refund_tasks(integer)
  to service_role;
grant execute on function public.complete_legacy_quick_stop_late_refund_task(uuid, uuid, text)
  to service_role;
grant execute on function public.fail_legacy_quick_stop_late_refund_task(uuid, uuid, text, boolean)
  to service_role;

commit;
