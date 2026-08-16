-- DARK operator resolution for a verified late-paid direct Checkout predecessor.
--
-- This migration does not enable a worker, route, Stripe call, environment
-- variable, or production gate.  It adds an auditable one-way decision only.
-- The original late-success task, the current/successor operation pointer,
-- the current Session pointer, every expiration row, and every provider
-- observation remain immutable.  A settlement decision records a separate
-- canonical paid-operation pointer; it never reparents the current pointer or
-- rewrites the predecessor lifecycle.

begin;

lock table public.payments in share row exclusive mode;
lock table public.billing_payment_operations in share row exclusive mode;
lock table public.billing_events in share row exclusive mode;
lock table public.billing_direct_checkout_late_success_tasks
  in share row exclusive mode;

-- The new paid-operation shape is deliberately staging-first.  No heuristic
-- backfill is safe because an old direct row cannot prove which Checkout
-- generation supplied paid truth.  Production must remain blocked until its
-- own preflight proves these ledgers empty (or a separately reviewed exact
-- evidence backfill exists).
do $$
begin
  if exists (
    select 1 from public.payments p where p.charge_model = 'direct'
  ) or exists (
    select 1
      from public.billing_payment_operations o
     where o.charge_model = 'direct'
  ) or exists (
    select 1 from public.billing_direct_checkout_late_success_tasks t
  ) then
    raise exception
      'operator-resolution paid pointer requires zero existing direct payment, operation, and late-success rows'
      using errcode = '55000';
  end if;
end
$$;

alter table public.billing_events
  drop constraint if exists billing_events_projection_result_check,
  drop constraint if exists billing_events_projection_claim_shape_check,
  drop constraint if exists billing_events_projection_terminal_shape_check;

alter table public.billing_events
  add constraint billing_events_projection_result_check check (
    projection_result is null
    or projection_result in (
      'subscription_state_applied',
      'invoice_state_applied',
      'subscription_and_invoice_state_applied',
      'out_of_order_ignored',
      'direct_payment_paid_pending_reconciliation',
      'direct_payment_paid_reconciled',
      'direct_checkout_expired',
      'direct_payment_late_success_resolution_pending',
      'direct_payment_late_success_manual_review',
      'direct_payment_additional_paid_truth_manual_review',
      'direct_payment_late_success_resolved_settled',
      'direct_payment_late_success_hold_retained'
    )
  ),
  add constraint billing_events_projection_claim_shape_check check (
    (
      processing_status = 'processing'
      and projection_claim_token is not null
      and projection_lease_expires_at is not null
      and processing_started_at is not null
    )
    or (
      processing_status <> 'processing'
      and projection_claim_token is null
      and projection_lease_expires_at is null
    )
  ),
  add constraint billing_events_projection_terminal_shape_check check (
    (
      event_scope = 'platform_subscription'
      and (
        (
          processing_status in ('processed', 'ignored')
          and processed_at is not null
          and projection_schema_version is not distinct from
            'stripe_subscription_projection_v1'
          and projection_applied is not null
          and projection_result in (
            'subscription_state_applied',
            'invoice_state_applied',
            'subscription_and_invoice_state_applied',
            'out_of_order_ignored'
          )
        )
        or (
          processing_status not in ('processed', 'ignored')
          and processed_at is null
          and projection_schema_version is null
          and projection_applied is null
          and projection_result is null
        )
      )
    )
    or (
      event_scope = 'connected_payment'
      and (
        (
          processing_status = 'processed'
          and processed_at is not null
          and projection_applied is not null
          and projection_result is not null
          and (
            (
              event_type = 'checkout.session.completed'
              and projection_schema_version is not distinct from
                'stripe_connected_payment_projection_v1'
              and projection_result in (
                'direct_payment_paid_pending_reconciliation',
                'direct_payment_paid_reconciled',
                'direct_payment_late_success_resolution_pending',
                'direct_payment_late_success_manual_review',
                'direct_payment_additional_paid_truth_manual_review',
                'direct_payment_late_success_resolved_settled',
                'direct_payment_late_success_hold_retained'
              )
            )
            or (
              event_type = 'checkout.session.expired'
              and projection_schema_version is not distinct from
                'stripe_connected_checkout_expiration_v1'
              and projection_result = 'direct_checkout_expired'
            )
          )
        )
        or (
          processing_status <> 'processed'
          and processed_at is null
          and projection_schema_version is null
          and projection_applied is null
          and projection_result is null
        )
      )
    )
  );

-- PostgreSQL requires the referenced column list itself to be unique.  The
-- leading UUIDs are already primary keys; these redundant scoped keys make
-- every cross-ledger FK state its account/payment binding explicitly.
create unique index direct_checkout_late_task_resolution_scope_unique
  on public.billing_direct_checkout_late_success_tasks(id, account_id, payment_id);
create unique index billing_payment_operations_resolution_scope_unique
  on public.billing_payment_operations(id, account_id, payment_id);

create table public.billing_direct_checkout_late_success_resolutions (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  resolution_schema text not null default
    'direct_checkout_late_success_operator_resolution_v1'
    check (
      resolution_schema =
        'direct_checkout_late_success_operator_resolution_v1'
    ),
  action text not null check (
    action in ('settle_paid_predecessor', 'retain_hold')
  ),
  operation_id text not null unique check (
    pg_catalog.length(pg_catalog.btrim(operation_id)) between 1 and 200
    and operation_id !~ '[[:cntrl:]]'
    and operation_id = pg_catalog.btrim(operation_id)
  ),
  request_sha256 text not null unique check (
    request_sha256 ~ '^[0-9a-f]{64}$'
  ),
  task_set_sha256 text not null check (
    task_set_sha256 ~ '^[0-9a-f]{64}$'
  ),
  evidence_sha256 text not null check (
    evidence_sha256 ~ '^[0-9a-f]{64}$'
  ),
  task_id uuid not null unique,
  billing_event_id uuid not null,
  account_id uuid not null,
  payment_id uuid not null,
  paid_operation_pk uuid not null,
  current_operation_pk uuid not null,
  current_checkout_session_id text check (
    current_checkout_session_id is null
    or (
      current_checkout_session_id ~ '^cs_(test|live)_[A-Za-z0-9_]+$'
      and pg_catalog.length(current_checkout_session_id) <= 255
    )
  ),
  paid_checkout_session_id text not null check (
    paid_checkout_session_id ~ '^cs_(test|live)_[A-Za-z0-9_]+$'
    and pg_catalog.length(paid_checkout_session_id) <= 255
  ),
  provider_event_id text check (
    provider_event_id is null
    or (
      provider_event_id ~ '^evt_[A-Za-z0-9_]{8,}$'
      and pg_catalog.length(provider_event_id) <= 255
    )
  ),
  payment_intent_id text check (
    payment_intent_id is null
    or (
      payment_intent_id ~ '^pi_[A-Za-z0-9_]+$'
      and pg_catalog.length(payment_intent_id) <= 255
    )
  ),
  charge_id text check (
    charge_id is null
    or (
      charge_id ~ '^ch_[A-Za-z0-9_]+$'
      and pg_catalog.length(charge_id) <= 255
    )
  ),
  application_fee_id text check (
    application_fee_id is null
    or application_fee_id ~ '^fee_[A-Za-z0-9_]+$'
  ),
  balance_transaction_id text check (
    balance_transaction_id is null
    or balance_transaction_id ~ '^txn_[A-Za-z0-9_]+$'
  ),
  paid_at timestamptz,
  amount_cents bigint check (
    amount_cents is null or amount_cents between 1 and 99999999
  ),
  application_fee_cents bigint check (
    application_fee_cents is null
    or (
      amount_cents is not null
      and application_fee_cents between 0 and amount_cents
    )
  ),
  reconciliation_status text check (
    reconciliation_status is null
    or reconciliation_status in ('pending', 'reconciled')
  ),
  task_state_snapshot text not null check (
    task_state_snapshot in ('successor_neutralized', 'manual_review')
  ),
  task_reason_code text not null check (
    pg_catalog.length(task_reason_code) between 3 and 100
    and task_reason_code ~ '^[a-z][a-z0-9_]+$'
  ),
  disposition_reason text not null check (
    disposition_reason in (
      'successor_neutralized',
      'operator_retained_for_manual_review',
      'additional_paid_truth_requires_review',
      'successor_not_safely_neutralized',
      'provider_evidence_requires_review'
    )
  ),
  -- Deliberately no auth.users FK: immutable audit identity must outlive an
  -- Auth user deletion.  The RPC locks the exact live auth.users row before
  -- first application and snapshots its normalized email.
  actor_user_id uuid not null,
  actor_email_snapshot text not null check (
    pg_catalog.length(pg_catalog.btrim(actor_email_snapshot)) between 3 and 320
    and actor_email_snapshot = pg_catalog.lower(actor_email_snapshot)
  ),
  created_at timestamptz not null default pg_catalog.now(),

  constraint direct_checkout_late_resolution_task_scope_fk
    foreign key (
      task_id, account_id, payment_id
    ) references public.billing_direct_checkout_late_success_tasks(
      id, account_id, payment_id
    ) on update restrict on delete restrict,
  constraint direct_checkout_late_resolution_paid_operation_fk
    foreign key (
      paid_operation_pk, account_id, payment_id
    ) references public.billing_payment_operations(
      id, account_id, payment_id
    ) on update restrict on delete restrict,
  constraint direct_checkout_late_resolution_current_operation_fk
    foreign key (
      current_operation_pk, account_id, payment_id
    ) references public.billing_payment_operations(
      id, account_id, payment_id
    ) on update restrict on delete restrict,
  constraint direct_checkout_late_resolution_event_fk
    foreign key (billing_event_id)
    references public.billing_events(id) on update restrict on delete restrict,
  constraint direct_checkout_late_resolution_scope_unique unique (
    id, payment_id, account_id, task_id, paid_operation_pk, action
  ),
  constraint direct_checkout_late_resolution_payment_pointer_unique unique (
    id, payment_id, account_id, task_id, paid_operation_pk
  ),
  constraint direct_checkout_late_resolution_action_shape_check check (
    (
      action = 'settle_paid_predecessor'
      and task_state_snapshot = 'successor_neutralized'
      and task_reason_code in (
        'successor_never_submitted',
        'successor_signed_expired_unpaid',
        'successor_expired_unpaid'
      )
      and disposition_reason = 'successor_neutralized'
      and provider_event_id is not null
      and payment_intent_id is not null
      and charge_id is not null
      and paid_at is not null
      and amount_cents is not null
      and application_fee_cents is not null
      and reconciliation_status = 'reconciled'
      and balance_transaction_id is not null
      and (application_fee_cents = 0 or application_fee_id is not null)
    )
    or (
      action = 'retain_hold'
      and disposition_reason <> 'successor_neutralized'
      and (
        (
          provider_event_id is null
          and payment_intent_id is null
          and charge_id is null
          and application_fee_id is null
          and balance_transaction_id is null
          and paid_at is null
          and amount_cents is null
          and application_fee_cents is null
          and reconciliation_status is null
        )
        or (
          provider_event_id is not null
          and payment_intent_id is not null
          and charge_id is not null
          and paid_at is not null
          and amount_cents is not null
          and application_fee_cents is not null
          and reconciliation_status is not null
          and (application_fee_cents > 0 or application_fee_id is null)
          and (
            reconciliation_status = 'pending'
            or (
              balance_transaction_id is not null
              and (application_fee_cents = 0 or application_fee_id is not null)
            )
          )
        )
      )
    )
  )
);

alter table public.billing_direct_checkout_late_success_resolutions
  enable row level security;
alter table public.billing_direct_checkout_late_success_resolutions
  force row level security;

alter table public.payments
  add column paid_checkout_operation_pk uuid,
  add column late_checkout_success_resolution_pk uuid;

alter table public.payments
  add constraint payments_paid_checkout_operation_fk
    foreign key (
      paid_checkout_operation_pk, account_id, id
    ) references public.billing_payment_operations(
      id, account_id, payment_id
    ) on update restrict on delete restrict
    deferrable initially deferred,
  add constraint payments_late_checkout_success_resolution_fk
    foreign key (
      late_checkout_success_resolution_pk, id, account_id,
      late_checkout_success_task_pk, paid_checkout_operation_pk
    ) references public.billing_direct_checkout_late_success_resolutions(
      id, payment_id, account_id, task_id, paid_operation_pk
    ) on update restrict on delete restrict
    deferrable initially deferred,
  add constraint payments_paid_checkout_operation_shape_check check (
    (
      paid_checkout_operation_pk is null
      and status::text not in ('paid', 'refunded', 'disputed')
    )
    or (
      paid_checkout_operation_pk is not null
      and charge_model = 'direct'
      and status::text in ('paid', 'refunded', 'disputed')
    )
    or charge_model <> 'direct'
  ),
  add constraint payments_late_checkout_success_resolution_shape_check check (
    late_checkout_success_resolution_pk is null
    or (
      charge_model = 'direct'
      and late_checkout_success_task_pk is not null
      and paid_checkout_operation_pk is not null
    )
  );

create unique index payments_paid_checkout_operation_unique
  on public.payments(paid_checkout_operation_pk)
  where paid_checkout_operation_pk is not null;
create unique index payments_late_checkout_success_resolution_unique
  on public.payments(late_checkout_success_resolution_pk)
  where late_checkout_success_resolution_pk is not null;
create index direct_checkout_late_resolution_created_idx
  on public.billing_direct_checkout_late_success_resolutions(
    created_at desc, id
  );
create index direct_checkout_late_resolution_payment_action_idx
  on public.billing_direct_checkout_late_success_resolutions(
    payment_id, action, created_at, id
  );
create unique index direct_checkout_late_resolution_event_action_unique
  on public.billing_direct_checkout_late_success_resolutions(
    billing_event_id, action
  );
create unique index direct_checkout_late_resolution_single_settle_per_payment
  on public.billing_direct_checkout_late_success_resolutions(payment_id)
  where action = 'settle_paid_predecessor';

-- Canonical SHA-256 values are computed inside PostgreSQL from immutable rows.
-- The caller must echo them back as compare-and-set values; it cannot choose
-- or reinterpret the evidence being approved.
create function public.direct_checkout_late_success_evidence_sha256(
  p_task_id uuid
)
returns text
language sql
stable
security definer
set search_path = ''
set timezone to 'UTC'
as $$
  select pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(
        pg_catalog.jsonb_build_object(
          'schema', 'direct_checkout_late_success_evidence_fingerprint_v1',
          'task_id', t.id,
          'billing_event_id', t.billing_event_id,
          'account_id', t.account_id,
          'payment_id', t.payment_id,
          'charge_model', t.charge_model,
          'stripe_account_id', t.stripe_account_id,
          'livemode', t.livemode,
          'paid_operation_pk', t.paid_operation_pk,
          'paid_checkout_generation', t.paid_checkout_generation,
          'paid_checkout_session_id', t.paid_checkout_session_id,
          'current_operation_pk', t.observed_current_operation_pk,
          'current_generation', t.observed_current_generation,
          'current_state', t.observed_current_state,
          'current_lifecycle', t.observed_current_lifecycle,
          'current_session_id', t.observed_current_session_id,
          'expected_amount_cents', t.expected_amount_cents,
          'expected_application_fee_cents',
            t.expected_application_fee_cents,
          'expected_reconciliation_status',
            t.expected_reconciliation_status,
          'provider_event_id', t.provider_event_id,
          'paid_at', t.paid_at,
          'payment_intent_id', t.payment_intent_id,
          'charge_id', t.charge_id,
          'application_fee_id', t.application_fee_id,
          'balance_transaction_id', t.balance_transaction_id,
          'amount_cents', t.amount_cents,
          'application_fee_cents', t.application_fee_cents,
          'reconciliation_status', t.provider_reconciliation_status,
          'projection_sha256', t.late_success_projection_sha256,
          'prepared_action', t.prepared_action,
          'prepared_current_operation_pk',
            t.prepared_current_operation_pk,
          'prepared_current_session_id', t.prepared_current_session_id,
          'prepared_current_session_expires_at',
            t.prepared_current_session_expires_at,
          'expire_operation_id', t.expire_operation_id,
          'prepared_reason_code', t.prepared_reason_code,
          'prepared_at', t.prepared_at,
          'task_state', t.task_state,
          'attempt_count', t.attempt_count,
          'last_error_code', t.last_error_code,
          'resolution_source', t.resolution_source,
          'successor_observation_sha256', t.successor_observation_sha256,
          'reason_code', t.reason_code,
          'neutralized_at', t.neutralized_at,
          'manual_reviewed_at', t.manual_reviewed_at
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  )
  from public.billing_direct_checkout_late_success_tasks t
  where t.id = p_task_id
$$;

create function public.direct_checkout_late_success_task_set_sha256(
  p_payment_id uuid
)
returns text
language sql
stable
security definer
set search_path = ''
set timezone to 'UTC'
as $$
  select pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(
        pg_catalog.jsonb_build_object(
          'schema', 'direct_checkout_late_success_task_set_fingerprint_v1',
          'payment_id', p_payment_id,
          'tasks', coalesce(
            pg_catalog.jsonb_agg(
              pg_catalog.jsonb_build_object(
                'id', t.id,
                'evidence_sha256',
                  public.direct_checkout_late_success_evidence_sha256(t.id)
              ) order by t.id
            ),
            '[]'::jsonb
          )
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  )
  from public.billing_direct_checkout_late_success_tasks t
  where t.payment_id = p_payment_id
$$;

create function public.protect_direct_checkout_late_success_resolution()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_operation_id text := pg_catalog.current_setting(
    'lgq.direct_checkout_late_success_resolution_operation_id', true
  );
  v_task public.billing_direct_checkout_late_success_tasks%rowtype;
  v_actor_email text;
begin
  if tg_op <> 'INSERT' then
    raise exception 'direct Checkout late-success resolutions are append-only'
      using errcode = '42501';
  end if;
  if v_operation_id is null
     or v_operation_id = ''
     or v_operation_id is distinct from new.operation_id then
    raise exception 'direct Checkout late-success resolution writes require an owned RPC'
      using errcode = '42501';
  end if;
  select t.* into v_task
    from public.billing_direct_checkout_late_success_tasks t
   where t.id = new.task_id;
  select pg_catalog.lower(pg_catalog.btrim(u.email::text))
    into v_actor_email
    from auth.users u
   where u.id = new.actor_user_id and u.email is not null;
  if v_task.id is null
     or v_actor_email is null
     or new.actor_email_snapshot is distinct from v_actor_email
     or new.billing_event_id is distinct from v_task.billing_event_id
     or new.account_id is distinct from v_task.account_id
     or new.payment_id is distinct from v_task.payment_id
     or new.paid_operation_pk is distinct from v_task.paid_operation_pk
     or new.current_operation_pk is distinct from
       v_task.observed_current_operation_pk
     or new.current_checkout_session_id is distinct from
       v_task.observed_current_session_id
     or new.paid_checkout_session_id is distinct from
       v_task.paid_checkout_session_id
     or new.provider_event_id is distinct from v_task.provider_event_id
     or new.payment_intent_id is distinct from v_task.payment_intent_id
     or new.charge_id is distinct from v_task.charge_id
     or new.application_fee_id is distinct from v_task.application_fee_id
     or new.balance_transaction_id is distinct from
       v_task.balance_transaction_id
     or new.paid_at is distinct from v_task.paid_at
     or new.amount_cents is distinct from v_task.amount_cents
     or new.application_fee_cents is distinct from
       v_task.application_fee_cents
     or new.reconciliation_status is distinct from
       v_task.provider_reconciliation_status
     or new.task_state_snapshot is distinct from v_task.task_state
     or new.task_reason_code is distinct from v_task.reason_code
     or new.evidence_sha256 is distinct from
       public.direct_checkout_late_success_evidence_sha256(v_task.id)
     or new.task_set_sha256 is distinct from
       public.direct_checkout_late_success_task_set_sha256(v_task.payment_id)
  then
    raise exception 'direct Checkout late-success resolution evidence changed'
      using errcode = '55000';
  end if;
  return new;
end;
$$;

-- Full-replace the expiration/payment reciprocal guard.  Normal projection
-- remains unchanged.  The sole exception is the exact owned resolution row
-- whose predecessor and current Session mutexes were already acquired by the
-- settle RPC; all pointers and provider values are revalidated here.
do $$
begin
  if pg_catalog.md5(pg_catalog.pg_get_functiondef(
    'public.guard_stripe_connected_checkout_expiration_payment_truth()'
      ::pg_catalog.regprocedure
  )) <> 'd8b1b034df109dfb27fc5a353140a98d' then
    raise exception 'expiration payment-truth guard source contract drifted'
      using errcode = '55000';
  end if;
end
$$;

create or replace function
  public.guard_stripe_connected_checkout_expiration_payment_truth()
returns trigger
language plpgsql
security definer
set search_path = ''
set timezone to 'UTC'
as $$
declare
  v_resolution_id text := pg_catalog.current_setting(
    'lgq.direct_checkout_late_success_resolution_id', true
  );
  v_late_release boolean := false;
  v_task public.billing_direct_checkout_late_success_tasks%rowtype;
  v_session record;
begin
  if old.charge_model = 'direct'
     and old.stripe_account_id is not null
     and old.stripe_account_id ~ '^acct_[A-Za-z0-9]{8,}$'
     and old.stripe_livemode is not null
     and (
       (old.status::text <> 'paid' and new.status::text = 'paid')
       or (old.paid_at is null and new.paid_at is not null)
       or (old.stripe_payment_intent is null
         and new.stripe_payment_intent is not null)
       or (old.stripe_charge_id is null and new.stripe_charge_id is not null)
     ) then
    if v_resolution_id is not null and v_resolution_id <> '' then
      select t.* into v_task
        from public.billing_direct_checkout_late_success_resolutions r
        join public.billing_direct_checkout_late_success_tasks t
          on t.id = r.task_id
       where r.id = v_resolution_id::uuid
         and r.action = 'settle_paid_predecessor'
         and r.account_id = old.account_id
         and r.payment_id = old.id
         and r.task_id = old.late_checkout_success_task_pk
         and r.paid_operation_pk = new.paid_checkout_operation_pk
         and new.late_checkout_success_resolution_pk = r.id
         and old.current_checkout_operation_pk is not distinct from
           new.current_checkout_operation_pk
         and old.stripe_checkout_session is not distinct from
           new.stripe_checkout_session
         and new.stripe_payment_intent = r.payment_intent_id
         and new.stripe_charge_id = r.charge_id
         and new.stripe_application_fee_id is not distinct from
           r.application_fee_id
         and new.stripe_balance_transaction_id is not distinct from
           r.balance_transaction_id
         and new.paid_at = r.paid_at;
      v_late_release := found;
      if not v_late_release then
        raise exception 'late-success expiration guard resolution context is invalid'
          using errcode = '42501';
      end if;
      for v_session in
        select session_id
          from (values
            (v_task.paid_checkout_session_id),
            (old.stripe_checkout_session)
          ) as sessions(session_id)
         where session_id is not null
         group by session_id order by session_id
      loop
        perform pg_catalog.pg_advisory_xact_lock(
          public.stripe_connected_checkout_session_mutex_key(
            old.account_id, old.stripe_account_id, old.stripe_livemode,
            v_session.session_id
          )
        );
      end loop;
      return new;
    end if;

    if old.stripe_checkout_session is not null
       and old.stripe_checkout_session ~ '^cs_[A-Za-z0-9_]+$' then
      perform pg_catalog.pg_advisory_xact_lock(
        public.stripe_connected_checkout_session_mutex_key(
          old.account_id, old.stripe_account_id, old.stripe_livemode,
          old.stripe_checkout_session
        )
      );
      if exists (
        select 1
          from public.stripe_connected_checkout_expirations x
         where x.account_id = old.account_id
           and x.payment_id = old.id
           and x.stripe_account_id = old.stripe_account_id
           and x.livemode = old.stripe_livemode
           and x.checkout_session_id = old.stripe_checkout_session
      ) then
        raise exception 'stripe_connected_checkout_expiration_conflict'
          using errcode = 'P0001';
      end if;
    end if;
  end if;
  return new;
end;
$$;

-- Normal paid projection owns the current generation.  Persist that operation
-- as the canonical paid pointer in the same payment UPDATE; the retained late
-- hold continues to reject the normal projector before this point.
do $$
declare
  v_before text;
  v_after text;
  v_old_applied text := $needle$
    and v_payment.reconciliation_status = v_final_reconciliation_status
    and v_operation.checkout_lifecycle = 'paid'
  );$needle$;
  v_new_applied text := $replacement$
    and v_payment.reconciliation_status = v_final_reconciliation_status
    and v_payment.paid_checkout_operation_pk = v_operation.id
    and v_operation.checkout_lifecycle = 'paid'
  );$replacement$;
  v_old_update text := $needle$
  update public.payments p
     set status = 'paid',
         paid_at = v_paid_at,$needle$;
  v_new_update text := $replacement$
  update public.payments p
     set status = 'paid',
         paid_checkout_operation_pk = v_operation.id,
         paid_at = v_paid_at,$replacement$;
begin
  v_before := pg_catalog.pg_get_functiondef(
    'public.project_stripe_connected_payment_event(uuid,uuid,jsonb)'
      ::pg_catalog.regprocedure
  );
  if pg_catalog.md5(v_before) <> 'e581f8243fdfb826ee50ae0b032206a8'
     or pg_catalog.length(v_before)
       - pg_catalog.length(pg_catalog.replace(v_before, v_old_applied, ''))
       is distinct from pg_catalog.length(v_old_applied)
     or pg_catalog.length(v_before)
       - pg_catalog.length(pg_catalog.replace(v_before, v_old_update, ''))
       is distinct from pg_catalog.length(v_old_update) then
    raise exception 'connected paid projector source contract drifted'
      using errcode = '55000';
  end if;
  v_after := pg_catalog.replace(v_before, v_old_applied, v_new_applied);
  v_after := pg_catalog.replace(v_after, v_old_update, v_new_update);
  execute v_after;
end
$$;

-- Dedicated settlement path for operator-approved predecessor truth.  It is
-- invoked only by the existing payment AFTER trigger while the settle RPC's
-- owned resolution GUC is present.  This is a real invoice validator and task
-- enqueue; it does not put the already-processed Billing event back into a
-- synthetic processing lease.
create function public.enqueue_one_off_direct_payment_late_success_settlement(
  p_old public.payments,
  p_new public.payments,
  p_resolution_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
set timezone to 'UTC'
as $$
declare
  v_invoice public.invoices%rowtype;
  v_resolution public.billing_direct_checkout_late_success_resolutions%rowtype;
  v_task public.billing_direct_checkout_late_success_tasks%rowtype;
  v_paid_operation public.billing_payment_operations%rowtype;
  v_event public.billing_events%rowtype;
  v_item_count bigint;
  v_subtotal numeric(12,2);
  v_discount_amount numeric(12,2);
  v_eligible_subtotal numeric(12,2);
  v_tax_amount numeric(12,2);
  v_reconciled_total numeric(12,2);
  v_prior_paid numeric(12,2);
  v_prior_paid_cents bigint;
  v_invoice_total_cents bigint;
  v_eligible_total_cents bigint;
  v_expected_fee_basis_cents bigint;
  v_expected_fee_cents bigint;
  v_expected_bps integer;
begin
  select r.* into v_resolution
    from public.billing_direct_checkout_late_success_resolutions r
   where r.id = p_resolution_id
     and r.action = 'settle_paid_predecessor'
     and r.payment_id = p_new.id
     and r.account_id = p_new.account_id
   for share;
  select t.* into v_task
    from public.billing_direct_checkout_late_success_tasks t
   where t.id = v_resolution.task_id
     and t.payment_id = p_new.id
     and t.account_id = p_new.account_id
   for share;
  select o.* into v_paid_operation
    from public.billing_payment_operations o
   where o.id = v_resolution.paid_operation_pk
     and o.payment_id = p_new.id
     and o.account_id = p_new.account_id
   for share;
  select e.* into v_event
    from public.billing_events e
   where e.id = v_resolution.billing_event_id
   for share;

  if v_resolution.id is null
     or v_task.id is null
     or v_paid_operation.id is null
     or v_event.id is null
     or p_old.charge_model is distinct from 'direct'
     or p_new.charge_model is distinct from 'direct'
     or p_old.status::text is distinct from 'processing'
     or p_new.status::text is distinct from 'paid'
     or p_old.paid_at is not null
     or p_new.paid_at is null
     or p_old.stripe_account_id is distinct from p_new.stripe_account_id
     or p_old.stripe_livemode is distinct from p_new.stripe_livemode
     or p_old.stripe_checkout_session is distinct from
       p_new.stripe_checkout_session
     or p_old.current_checkout_operation_pk is distinct from
       p_new.current_checkout_operation_pk
     or p_old.late_checkout_success_task_pk is distinct from
       p_new.late_checkout_success_task_pk
     or v_resolution.task_id is distinct from
       p_new.late_checkout_success_task_pk
     or v_resolution.current_operation_pk is distinct from
       p_new.current_checkout_operation_pk
     or v_resolution.current_checkout_session_id is distinct from
       p_new.stripe_checkout_session
     or v_resolution.paid_checkout_session_id is distinct from
       v_task.paid_checkout_session_id
     or v_resolution.provider_event_id is distinct from
       v_task.provider_event_id
     or v_resolution.payment_intent_id is distinct from
       v_task.payment_intent_id
     or v_resolution.charge_id is distinct from v_task.charge_id
     or v_resolution.application_fee_id is distinct from
       v_task.application_fee_id
     or v_resolution.balance_transaction_id is distinct from
       v_task.balance_transaction_id
     or v_resolution.paid_at is distinct from v_task.paid_at
     or v_resolution.amount_cents is distinct from v_task.amount_cents
     or v_resolution.application_fee_cents is distinct from
       v_task.application_fee_cents
     or v_resolution.reconciliation_status is distinct from
       v_task.provider_reconciliation_status
     or v_resolution.evidence_sha256 is distinct from
       public.direct_checkout_late_success_evidence_sha256(v_task.id)
     or p_old.fee_plan_code is distinct from p_new.fee_plan_code
     or p_old.fee_catalog_version is distinct from p_new.fee_catalog_version
     or p_old.fee_rate_bps is distinct from p_new.fee_rate_bps
     or p_old.fee_rate is distinct from p_new.fee_rate
     or p_old.fee_basis_amount is distinct from p_new.fee_basis_amount
     or p_old.platform_fee is distinct from p_new.platform_fee
     or p_old.stripe_payment_intent is not null
     or p_old.stripe_charge_id is not null
     or p_old.stripe_application_fee_id is not null
     or p_old.stripe_balance_transaction_id is not null
     or p_new.paid_checkout_operation_pk is distinct from
       v_resolution.paid_operation_pk
     or p_new.late_checkout_success_resolution_pk is distinct from
       v_resolution.id then
    raise exception 'late-success settlement requires its exact canonical processing-to-paid transition'
      using errcode = '55000';
  end if;

  if p_new.invoice_id is null
     or p_new.kind::text not in ('deposit', 'stage', 'final')
     or p_new.payment_plan_id is not null
     or p_new.recurring_plan_id is not null
     or p_new.installment_seq is not null
     or p_new.due_date is not null
     or p_new.imported is distinct from false
     or p_new.amount <= 0
     or p_new.refunded_amount is distinct from 0
     or p_new.eligible_service_refunded_amount is distinct from 0
     or p_new.platform_fee_refunded is distinct from 0
     or p_new.refunded_at is not null
     or p_new.stripe_latest_refund_id is not null
     or p_new.stripe_latest_application_fee_refund_id is not null then
    raise exception 'late-success settlement supports only a pristine one-off invoice payment'
      using errcode = '0A000';
  end if;

  if p_new.stripe_account_id is null
     or p_new.stripe_account_id !~ '^acct_[A-Za-z0-9]{8,}$'
     or p_new.stripe_livemode is null
     or p_new.stripe_payment_intent is distinct from v_task.payment_intent_id
     or p_new.stripe_charge_id is distinct from v_task.charge_id
     or p_new.stripe_application_fee_id is distinct from
       v_task.application_fee_id
     or p_new.stripe_balance_transaction_id is distinct from
       v_task.balance_transaction_id
     or p_new.reconciliation_status is distinct from
       v_task.provider_reconciliation_status
     or p_new.paid_at is distinct from v_task.paid_at
     or p_new.stripe_payment_intent !~ '^pi_[A-Za-z0-9_]+$'
     or p_new.stripe_charge_id !~ '^ch_[A-Za-z0-9_]+$'
     or p_new.reconciliation_status not in ('pending', 'reconciled')
     or (p_new.platform_fee = 0
       and p_new.stripe_application_fee_id is not null)
     or (
       p_new.reconciliation_status = 'reconciled'
       and (
         p_new.stripe_balance_transaction_id is null
         or (p_new.platform_fee > 0
           and p_new.stripe_application_fee_id is null)
       )
     ) then
    raise exception 'late-success settlement provider evidence is incomplete or contradictory'
      using errcode = '22000';
  end if;

  perform 1
    from public.accounts a
   where a.id = p_new.account_id
     and a.stripe_merchant_account_id = p_new.stripe_account_id
     and a.merchant_livemode = p_new.stripe_livemode
   for key share;
  if not found then
    raise exception 'late-success settlement Merchant mapping changed'
      using errcode = '55000';
  end if;
  perform 1
    from public.jobs j
   where j.id = p_new.job_id and j.account_id = p_new.account_id
   for key share;
  if not found then
    raise exception 'late-success settlement job scope changed'
      using errcode = '55000';
  end if;

  select i.* into v_invoice
    from public.invoices i
   where i.id = p_new.invoice_id
   for update;
  if not found
     or v_invoice.account_id is distinct from p_new.account_id
     or v_invoice.job_id is distinct from p_new.job_id
     or v_invoice.status::text not in ('sent', 'signed')
     or v_invoice.total <= 0
     or v_invoice.discount_percent not between 0 and 100
     or v_invoice.tax_rate not between 0 and 100 then
    raise exception 'late-success settlement invoice is outside the exact payable scope'
      using errcode = '55000';
  end if;

  select pg_catalog.count(*),
         pg_catalog.round(coalesce(pg_catalog.sum(ii.amount), 0), 2)
    into v_item_count, v_subtotal
    from public.invoice_items ii
   where ii.invoice_id = p_new.invoice_id;
  if v_item_count = 0 or exists (
    select 1 from public.invoice_items ii
     where ii.invoice_id = p_new.invoice_id and ii.amount <= 0
  ) then
    raise exception 'late-success settlement invoice requires positive canonical line items'
      using errcode = '55000';
  end if;

  v_discount_amount := pg_catalog.round(
    v_subtotal * v_invoice.discount_percent / 100, 2
  );
  v_eligible_subtotal := pg_catalog.round(v_subtotal - v_discount_amount, 2);
  v_tax_amount := pg_catalog.round(
    v_eligible_subtotal * v_invoice.tax_rate / 100, 2
  );
  v_reconciled_total := pg_catalog.round(
    v_eligible_subtotal + v_tax_amount, 2
  );
  if v_invoice.total is distinct from v_reconciled_total
     or v_eligible_subtotal < 0
     or v_eligible_subtotal > v_invoice.total then
    raise exception 'late-success settlement invoice arithmetic no longer reconciles'
      using errcode = '22000';
  end if;

  if exists (
    select 1
      from public.payments p
     where p.invoice_id = p_new.invoice_id
       and p.id <> p_new.id
       and (
         p.status::text in ('requested', 'processing', 'failed', 'disputed')
         or p.charge_model = 'direct'
         or p.payment_plan_id is not null
         or p.recurring_plan_id is not null
         or p.kind::text = 'plan_installment'
         or (p.stripe_checkout_session is not null
           and p.status::text not in ('paid', 'refunded'))
         or (p.stripe_payment_intent is not null
           and p.status::text not in ('paid', 'refunded'))
       )
  ) then
    raise exception 'late-success settlement invoice has a competing payment scope'
      using errcode = '55000';
  end if;

  select pg_catalog.round(coalesce(pg_catalog.sum(
           case when p.status::text = 'paid'
             then p.amount - p.refunded_amount else 0 end
         ), 0), 2)
    into v_prior_paid
    from public.payments p
   where p.invoice_id = p_new.invoice_id and p.id <> p_new.id;
  if v_prior_paid < 0
     or v_prior_paid >= v_invoice.total
     or p_new.amount is distinct from
       pg_catalog.round(v_invoice.total - v_prior_paid, 2)
     or pg_catalog.round(v_prior_paid + p_new.amount, 2)
       is distinct from v_invoice.total then
    raise exception 'late-success settlement is not the exact outstanding invoice balance'
      using errcode = '55000';
  end if;

  v_expected_bps := case p_new.fee_plan_code
    when 'flex' then 125 when 'solo' then 50 when 'growth' then 25
    when 'scale' then 10 else null
  end;
  if v_expected_bps is null
     or p_new.fee_catalog_version is distinct from '2026-08-15-preview'
     or p_new.fee_rate_bps is distinct from v_expected_bps
     or p_new.fee_rate is distinct from
       v_expected_bps::numeric / 10000
     or p_new.fee_basis_amount is null
     or p_new.platform_fee is null then
    raise exception 'late-success settlement frozen fee snapshot is non-canonical'
      using errcode = '22000';
  end if;

  v_invoice_total_cents := (v_invoice.total * 100)::bigint;
  v_prior_paid_cents := (v_prior_paid * 100)::bigint;
  v_eligible_total_cents := (v_eligible_subtotal * 100)::bigint;
  v_expected_fee_basis_cents := v_eligible_total_cents - case
    when v_prior_paid_cents = 0 or v_eligible_total_cents = 0 then 0
    else pg_catalog.round(
      v_prior_paid_cents::numeric * v_eligible_total_cents::numeric
        / v_invoice_total_cents::numeric, 0
    )::bigint
  end;
  v_expected_fee_cents := pg_catalog.round(
    v_expected_fee_basis_cents::numeric * v_expected_bps::numeric / 10000,
    0
  )::bigint;
  if (p_new.fee_basis_amount * 100)::bigint is distinct from
       v_expected_fee_basis_cents
     or (p_new.platform_fee * 100)::bigint is distinct from
       v_expected_fee_cents
     or v_expected_fee_basis_cents < 0
     or v_expected_fee_basis_cents > (p_new.amount * 100)::bigint
     or v_expected_fee_cents < 0
     or v_expected_fee_cents > v_expected_fee_basis_cents then
    raise exception 'late-success settlement fee allocation no longer matches invoice scope'
      using errcode = '22000';
  end if;

  if v_paid_operation.operation_type <> 'checkout_session.create'
     or v_paid_operation.state <> 'succeeded'
     or v_paid_operation.checkout_lifecycle <> 'expired_unpaid'
     or v_paid_operation.checkout_expiration_id is null
     or v_paid_operation.provider_object_id is distinct from
       v_task.paid_checkout_session_id
     or v_paid_operation.superseded_by_operation_pk is distinct from
       p_new.current_checkout_operation_pk
     or not exists (
       select 1
         from public.stripe_connected_checkout_expirations x
        where x.id = v_paid_operation.checkout_expiration_id
          and x.operation_pk = v_paid_operation.id
          and x.payment_id = p_new.id
          and x.checkout_session_id = v_task.paid_checkout_session_id
          and x.observed_session_status = 'expired'
          and x.observed_payment_status = 'unpaid'
     ) then
    raise exception 'late-success settlement lacks immutable predecessor expiration evidence'
      using errcode = '22000';
  end if;

  if v_event.processing_status <> 'processed'
     or v_event.event_type <> 'checkout.session.completed'
     or v_event.event_scope <> 'connected_payment'
     or v_event.projection_schema_version is distinct from
       'stripe_connected_payment_projection_v1'
     or v_event.projection_applied is distinct from true
     or v_event.projection_result is distinct from
       'direct_payment_late_success_resolved_settled'
     or v_event.account_id is distinct from p_new.account_id
     or v_event.provider_account_id is distinct from p_new.stripe_account_id
     or v_event.livemode is distinct from p_new.stripe_livemode
     or v_event.payload #>> '{data_object,id}' is distinct from
       v_task.paid_checkout_session_id then
    raise exception 'late-success settlement event was not atomically resolved'
      using errcode = '55000';
  end if;

  update public.invoices i
     set status = 'paid', signed_at = coalesce(i.signed_at, p_new.paid_at)
   where i.id = v_invoice.id
     and i.account_id = p_new.account_id
     and i.job_id = p_new.job_id
     and i.status::text in ('sent', 'signed');
  if not found then
    raise exception 'late-success settlement invoice transition was lost'
      using errcode = '55000';
  end if;

  insert into public.billing_direct_payment_settlement_tasks (
    payment_id, billing_event_id, account_id, job_id, invoice_id, settled_at
  ) values (
    p_new.id, v_event.id, p_new.account_id, p_new.job_id,
    p_new.invoice_id, p_new.paid_at
  );
end;
$$;

-- Dispatch the exact owned late-resolution transition to the dedicated helper
-- and leave the entire normal settlement body untouched.  The live definition
-- hash makes rollout fail closed if any prior migration has drifted.
do $$
declare
  v_before text;
  v_after text;
  v_old text := $needle$
begin
  if old.charge_model is distinct from 'direct'$needle$;
  v_new text := $replacement$
begin
  if pg_catalog.current_setting(
       'lgq.direct_checkout_late_success_resolution_id', true
     ) is not null
     and pg_catalog.current_setting(
       'lgq.direct_checkout_late_success_resolution_id', true
     ) <> '' then
    perform public.enqueue_one_off_direct_payment_late_success_settlement(
      old,
      new,
      pg_catalog.current_setting(
        'lgq.direct_checkout_late_success_resolution_id', true
      )::uuid
    );
    return new;
  end if;
  if old.charge_model is distinct from 'direct'$replacement$;
begin
  v_before := pg_catalog.pg_get_functiondef(
    'public.enqueue_one_off_direct_payment_settlement()'::pg_catalog.regprocedure
  );
  if pg_catalog.md5(v_before) <> 'f5f9e6902f772fc593673906dae0ca1a'
     or pg_catalog.length(v_before)
       - pg_catalog.length(pg_catalog.replace(v_before, v_old, ''))
       is distinct from pg_catalog.length(v_old) then
    raise exception 'late-success settlement dispatcher source contract drifted'
      using errcode = '55000';
  end if;
  v_after := pg_catalog.replace(v_before, v_old, v_new);
  execute v_after;
end
$$;

create trigger protect_direct_checkout_late_success_resolution_trigger
before insert or update or delete
on public.billing_direct_checkout_late_success_resolutions
for each row execute function
  public.protect_direct_checkout_late_success_resolution();

-- This helper is intentionally stricter than "a resolution row exists".  It
-- validates the complete payment/task/operation binding and the copied paid
-- evidence.  Financial consumers may call it; Checkout and the normal event
-- projector must continue to inspect the retained hold pointer directly.
create function public.direct_checkout_late_success_canonical_release_is_valid(
  p_payment_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select
      p.charge_model = 'direct'
      and p.status::text in ('paid', 'refunded', 'disputed')
      and p.late_checkout_success_task_pk = t.id
      and p.paid_checkout_operation_pk = t.paid_operation_pk
      and p.late_checkout_success_resolution_pk = r.id
      and r.action = 'settle_paid_predecessor'
      and r.task_id = t.id
      and r.billing_event_id = t.billing_event_id
      and r.account_id = p.account_id
      and r.payment_id = p.id
      and r.paid_operation_pk = t.paid_operation_pk
      and r.current_operation_pk = p.current_checkout_operation_pk
      and r.current_checkout_session_id is not distinct from
        p.stripe_checkout_session
      and r.paid_checkout_session_id = t.paid_checkout_session_id
      and r.provider_event_id = t.provider_event_id
      and r.payment_intent_id = p.stripe_payment_intent
      and r.payment_intent_id = t.payment_intent_id
      and r.charge_id = p.stripe_charge_id
      and r.charge_id = t.charge_id
      and r.application_fee_id is not distinct from
        p.stripe_application_fee_id
      and r.application_fee_id is not distinct from t.application_fee_id
      and r.balance_transaction_id is not distinct from
        p.stripe_balance_transaction_id
      and r.balance_transaction_id is not distinct from
        t.balance_transaction_id
      and r.paid_at = p.paid_at
      and r.paid_at = t.paid_at
      and r.amount_cents = (p.amount * 100)::bigint
      and r.application_fee_cents = (p.platform_fee * 100)::bigint
      and r.reconciliation_status = p.reconciliation_status
      and r.evidence_sha256 =
        public.direct_checkout_late_success_evidence_sha256(t.id)
    from public.payments p
    join public.billing_direct_checkout_late_success_tasks t
      on t.id = p.late_checkout_success_task_pk
    join public.billing_direct_checkout_late_success_resolutions r
      on r.id = p.late_checkout_success_resolution_pk
    where p.id = p_payment_id
  ), false)
$$;

create function public.direct_checkout_late_success_has_active_hold(
  p_payment_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select
      (
        p.late_checkout_success_task_pk is not null
        and public.direct_checkout_late_success_canonical_release_is_valid(
          p.id
        ) is not true
      )
      or exists (
        select 1
          from public.billing_direct_checkout_late_success_tasks t
         where t.payment_id = p.id
           and not exists (
             select 1
               from public.billing_direct_checkout_late_success_resolutions r
              where r.task_id = t.id
                and r.payment_id = t.payment_id
                and r.action = 'settle_paid_predecessor'
           )
      )
      or exists (
        select 1
          from public.billing_direct_checkout_late_success_resolutions r
         where r.payment_id = p.id and r.action = 'retain_hold'
      )
      from public.payments p
     where p.id = p_payment_id
  ), false)
$$;

create function public.direct_checkout_late_success_refund_release_is_valid(
  p_payment_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.direct_checkout_late_success_canonical_release_is_valid(
      p_payment_id
    )
    and not exists (
      select 1
        from public.billing_direct_checkout_late_success_resolutions r
       where r.payment_id = p_payment_id
         and r.action = 'retain_hold'
    )
    and not exists (
      select 1
        from public.billing_direct_checkout_late_success_tasks t
       where t.payment_id = p_payment_id
         and not exists (
           select 1
             from public.billing_direct_checkout_late_success_resolutions r
            where r.task_id = t.id
              and r.payment_id = t.payment_id
              and r.action = 'settle_paid_predecessor'
         )
    )
$$;

create function public.protect_payment_paid_checkout_resolution_pointers()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_resolution_id text := pg_catalog.current_setting(
    'lgq.direct_checkout_late_success_resolution_id', true
  );
  v_operation public.billing_payment_operations%rowtype;
  v_resolution public.billing_direct_checkout_late_success_resolutions%rowtype;
begin
  if tg_op = 'INSERT' then
    if new.paid_checkout_operation_pk is not null
       or new.late_checkout_success_resolution_pk is not null then
      raise exception 'paid Checkout pointers cannot be supplied on payment insert'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if old.paid_checkout_operation_pk is not null
     and old.paid_checkout_operation_pk is distinct from
       new.paid_checkout_operation_pk then
    raise exception 'payments.paid_checkout_operation_pk is immutable once assigned'
      using errcode = '22000';
  end if;
  if old.late_checkout_success_resolution_pk is not null
     and old.late_checkout_success_resolution_pk is distinct from
       new.late_checkout_success_resolution_pk then
    raise exception 'payments.late_checkout_success_resolution_pk is immutable once assigned'
      using errcode = '22000';
  end if;

  if old.paid_checkout_operation_pk is null
     and new.paid_checkout_operation_pk is not null then
    select o.* into v_operation
      from public.billing_payment_operations o
     where o.id = new.paid_checkout_operation_pk
       and o.account_id = new.account_id
       and o.payment_id = new.id
       and o.operation_type = 'checkout_session.create';
    if not found then
      raise exception 'paid Checkout operation scope changed'
        using errcode = '55000';
    end if;

    if new.late_checkout_success_resolution_pk is null then
      if new.late_checkout_success_task_pk is not null
         or new.paid_checkout_operation_pk is distinct from
           new.current_checkout_operation_pk
         or v_operation.checkout_lifecycle <> 'paid'
         or v_operation.superseded_by_operation_pk is not null
         or v_operation.provider_object_id is distinct from
           new.stripe_checkout_session then
        raise exception 'normal paid pointer requires the exact current paid Checkout operation'
          using errcode = '55000';
      end if;
    else
      if v_resolution_id is null
         or v_resolution_id = ''
         or v_resolution_id is distinct from
           new.late_checkout_success_resolution_pk::text then
        raise exception 'late paid pointer requires an owned operator resolution'
          using errcode = '42501';
      end if;
      select r.* into v_resolution
        from public.billing_direct_checkout_late_success_resolutions r
       where r.id = new.late_checkout_success_resolution_pk
         and r.action = 'settle_paid_predecessor'
         and r.account_id = new.account_id
         and r.payment_id = new.id
         and r.task_id = new.late_checkout_success_task_pk
         and r.paid_operation_pk = new.paid_checkout_operation_pk;
      if not found
         or v_operation.checkout_lifecycle <> 'expired_unpaid'
         or v_operation.checkout_expiration_id is null
         or v_operation.provider_object_id is distinct from
           v_resolution.paid_checkout_session_id then
        raise exception 'late paid pointer does not match immutable predecessor evidence'
          using errcode = '55000';
      end if;
    end if;
  end if;

  if old.late_checkout_success_resolution_pk is null
     and new.late_checkout_success_resolution_pk is not null
     and (
       v_resolution_id is null
       or v_resolution_id = ''
       or v_resolution_id is distinct from
         new.late_checkout_success_resolution_pk::text
     ) then
    raise exception 'late Checkout resolution pointer requires its owned RPC'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger protect_payment_paid_checkout_resolution_pointers_insert_trigger
before insert on public.payments
for each row execute function
  public.protect_payment_paid_checkout_resolution_pointers();

create trigger protect_payment_paid_checkout_resolution_pointers_update_trigger
before update of paid_checkout_operation_pk,
  late_checkout_success_resolution_pk
on public.payments
for each row execute function
  public.protect_payment_paid_checkout_resolution_pointers();

-- A bounded read-only plan.  It reveals no customer/provider payload and
-- returns one fixed row for service orchestration, including database-derived
-- CAS fingerprints.
create function public.plan_direct_checkout_late_success_operator_resolution(
  p_account_id uuid,
  p_payment_id uuid,
  p_task_id uuid,
  p_action text
)
returns table (
  resolution_schema text,
  decision_code text,
  eligible boolean,
  reason_code text,
  account_id uuid,
  payment_id uuid,
  task_id uuid,
  paid_operation_pk uuid,
  current_operation_pk uuid,
  current_checkout_session_id text,
  task_set_sha256 text,
  evidence_sha256 text
)
language plpgsql
stable
security definer
set search_path = ''
set timezone to 'UTC'
as $$
declare
  v_payment public.payments%rowtype;
  v_task public.billing_direct_checkout_late_success_tasks%rowtype;
  v_task_count bigint;
  v_existing_resolution_action text;
  v_decision text;
  v_reason text;
begin
  if p_account_id is null
     or p_payment_id is null
     or p_task_id is null
     or p_action is null
     or p_action not in ('settle_paid_predecessor', 'retain_hold') then
    raise exception 'late-success operator plan input is invalid'
      using errcode = '22023';
  end if;

  select p.* into v_payment
    from public.payments p
   where p.id = p_payment_id and p.account_id = p_account_id;
  select t.* into v_task
    from public.billing_direct_checkout_late_success_tasks t
   where t.id = p_task_id
     and t.payment_id = p_payment_id
     and t.account_id = p_account_id;
  select pg_catalog.count(*) into v_task_count
    from public.billing_direct_checkout_late_success_tasks t
   where t.payment_id = p_payment_id;
  select r.action into v_existing_resolution_action
    from public.billing_direct_checkout_late_success_resolutions r
   where r.task_id = p_task_id;
  if v_payment.id is null or v_task.id is null then
    raise exception 'late-success operator plan scope was not found'
      using errcode = 'P0002';
  elsif v_payment.charge_model <> 'direct'
     or v_task.account_id <> v_payment.account_id
     or v_task.payment_id <> v_payment.id
     or v_payment.current_checkout_operation_pk is null then
    v_decision := 'reject_payment_scope_changed';
    v_reason := 'payment_scope_changed';
  elsif public.direct_checkout_late_success_has_active_hold(p_payment_id)
        is not true then
    v_decision := 'reject_hold_not_active';
    v_reason := 'hold_not_active';
  elsif p_action = 'retain_hold' then
    if v_existing_resolution_action is not null then
      v_decision := 'reject_task_already_resolved';
      v_reason := 'task_already_resolved';
    elsif v_task.task_state in ('successor_neutralized', 'manual_review') then
      v_decision := 'retain_operator_hold';
      v_reason := 'operator_hold_requested';
    else
      v_decision := 'reject_task_not_resolution_ready';
      v_reason := 'task_not_resolution_ready';
    end if;
  elsif v_task_count <> 1
     or v_payment.late_checkout_success_task_pk is distinct from v_task.id then
    v_decision := 'reject_additional_paid_truth';
    v_reason := 'additional_paid_truth_present';
  elsif v_existing_resolution_action is not null then
    v_decision := 'reject_task_already_resolved';
    v_reason := 'task_already_resolved';
  elsif v_payment.status::text <> 'processing'
     or v_payment.paid_at is not null
     or v_payment.stripe_payment_intent is not null
     or v_payment.stripe_charge_id is not null
     or v_payment.paid_checkout_operation_pk is not null
     or v_payment.late_checkout_success_resolution_pk is not null then
    v_decision := 'reject_payment_scope_changed';
    v_reason := 'payment_scope_changed';
  elsif v_task.provider_reconciliation_status <> 'reconciled'
     or v_task.balance_transaction_id is null
     or (v_task.application_fee_cents > 0
       and v_task.application_fee_id is null) then
    v_decision := 'reject_paid_evidence_not_reconciled';
    v_reason := 'paid_evidence_not_reconciled';
  elsif v_task.task_state <> 'successor_neutralized'
     or not (
       (v_task.resolution_source = 'never_submitted'
         and v_task.reason_code = 'successor_never_submitted')
       or (v_task.resolution_source = 'signed_expiration'
         and v_task.reason_code = 'successor_signed_expired_unpaid')
       or (v_task.resolution_source = 'stripe_observation'
         and v_task.reason_code = 'successor_expired_unpaid')
     ) then
    v_decision := 'reject_successor_not_neutralized';
    v_reason := 'successor_not_neutralized';
  else
    v_decision := 'accept_single_late_paid_predecessor';
    v_reason := 'single_late_paid_predecessor_resolution_ready';
  end if;

  return query select
    'direct_checkout_late_success_operator_resolution_v1'::text,
    v_decision,
    v_decision in (
      'accept_single_late_paid_predecessor', 'retain_operator_hold'
    ),
    v_reason,
    p_account_id,
    p_payment_id,
    p_task_id,
    v_task.paid_operation_pk,
    v_payment.current_checkout_operation_pk,
    v_payment.stripe_checkout_session,
    public.direct_checkout_late_success_task_set_sha256(p_payment_id),
    public.direct_checkout_late_success_evidence_sha256(p_task_id);
end;
$$;

create function public.settle_direct_checkout_late_success_task(
  p_account_id uuid,
  p_payment_id uuid,
  p_task_id uuid,
  p_operation_id text,
  p_request_sha256 text,
  p_task_set_sha256 text,
  p_evidence_sha256 text,
  p_actor_user_id uuid
)
returns table (
  resolution_schema text,
  resolution_id uuid,
  applied boolean,
  result_code text,
  payment_id uuid,
  task_id uuid,
  paid_operation_pk uuid
)
language plpgsql
security definer
set search_path = ''
set timezone to 'UTC'
as $$
declare
  v_task_hint public.billing_direct_checkout_late_success_tasks%rowtype;
  v_event public.billing_events%rowtype;
  v_payment public.payments%rowtype;
  v_task public.billing_direct_checkout_late_success_tasks%rowtype;
  v_paid public.billing_payment_operations%rowtype;
  v_current public.billing_payment_operations%rowtype;
  v_resolution public.billing_direct_checkout_late_success_resolutions%rowtype;
  v_actor_email text;
  v_task_count bigint;
  v_session record;
  v_expected_task_set text;
  v_expected_evidence text;
begin
  if p_account_id is null
     or p_payment_id is null
     or p_task_id is null
     or p_operation_id is null
     or pg_catalog.length(pg_catalog.btrim(p_operation_id)) not between 1 and 200
     or p_operation_id <> pg_catalog.btrim(p_operation_id)
     or p_operation_id ~ '[[:cntrl:]]'
     or p_request_sha256 is null
     or p_request_sha256 !~ '^[0-9a-f]{64}$'
     or p_task_set_sha256 is null
     or p_task_set_sha256 !~ '^[0-9a-f]{64}$'
     or p_evidence_sha256 is null
     or p_evidence_sha256 !~ '^[0-9a-f]{64}$'
     or p_actor_user_id is null then
    raise exception 'late-success settle input is invalid'
      using errcode = '22023';
  end if;

  select t.* into v_task_hint
    from public.billing_direct_checkout_late_success_tasks t
   where t.id = p_task_id
     and t.payment_id = p_payment_id
     and t.account_id = p_account_id;
  if not found then
    raise exception 'late-success settle task was not found'
      using errcode = 'P0002';
  end if;

  -- Financial lock order: event -> account -> payment -> every generation ->
  -- every task -> sorted Session mutexes.  Stripe is never called here.
  select e.* into v_event
    from public.billing_events e
   where e.id = v_task_hint.billing_event_id
   for update;
  if not found then
    raise exception 'late-success settle event was not found'
      using errcode = 'P0002';
  end if;
  perform 1
    from public.accounts a
   where a.id = p_account_id
     and a.stripe_merchant_account_id = v_task_hint.stripe_account_id
     and a.merchant_livemode = v_task_hint.livemode
   for key share;
  if not found then
    raise exception 'late-success settle Merchant mapping changed'
      using errcode = '55000';
  end if;
  select p.* into v_payment
    from public.payments p
   where p.id = p_payment_id and p.account_id = p_account_id
   for update;
  if not found then
    raise exception 'late-success settle payment was not found'
      using errcode = 'P0002';
  end if;
  perform 1
    from public.billing_payment_operations o
   where o.payment_id = p_payment_id
     and o.account_id = p_account_id
     and o.operation_type = 'checkout_session.create'
   order by o.checkout_generation, o.id
   for update;
  perform 1
    from public.billing_direct_checkout_late_success_tasks t
   where t.payment_id = p_payment_id
   order by t.id
   for update;
  select t.* into v_task
    from public.billing_direct_checkout_late_success_tasks t
   where t.id = p_task_id;
  select o.* into v_paid
    from public.billing_payment_operations o
   where o.id = v_task.paid_operation_pk;
  select o.* into v_current
    from public.billing_payment_operations o
   where o.id = v_payment.current_checkout_operation_pk;

  for v_session in
    select session_id
      from (
        values
          (v_task.paid_checkout_session_id),
          (v_payment.stripe_checkout_session)
      ) as sessions(session_id)
     where session_id is not null
     group by session_id
     order by session_id
  loop
    perform pg_catalog.pg_advisory_xact_lock(
      public.stripe_connected_checkout_session_mutex_key(
        p_account_id,
        v_task.stripe_account_id,
        v_task.livemode,
        v_session.session_id
      )
    );
  end loop;

  v_expected_task_set :=
    public.direct_checkout_late_success_task_set_sha256(p_payment_id);
  v_expected_evidence :=
    public.direct_checkout_late_success_evidence_sha256(p_task_id);

  select r.* into v_resolution
    from public.billing_direct_checkout_late_success_resolutions r
   where r.operation_id = p_operation_id
      or r.task_id = p_task_id
   order by case when r.operation_id = p_operation_id then 0 else 1 end
   limit 1
   for update;
  if found then
    if v_resolution.action is distinct from 'settle_paid_predecessor'
       or v_resolution.operation_id is distinct from p_operation_id
       or v_resolution.request_sha256 is distinct from p_request_sha256
       or v_resolution.task_set_sha256 is distinct from p_task_set_sha256
       or v_resolution.evidence_sha256 is distinct from p_evidence_sha256
       or v_resolution.actor_user_id is distinct from p_actor_user_id
       or v_resolution.account_id is distinct from p_account_id
       or v_resolution.payment_id is distinct from p_payment_id
       or v_resolution.task_id is distinct from p_task_id
       or v_resolution.paid_operation_pk is distinct from v_task.paid_operation_pk
       or public.direct_checkout_late_success_canonical_release_is_valid(
         p_payment_id
       ) is not true
       or v_event.projection_result is distinct from
         'direct_payment_late_success_resolved_settled'
       or not exists (
         select 1
           from public.billing_direct_payment_settlement_tasks st
          where st.payment_id = p_payment_id
            and st.billing_event_id = v_event.id
       ) then
      raise exception 'late-success settle replay conflicts with durable outcome'
        using errcode = '22000';
    end if;
    return query select
      v_resolution.resolution_schema, v_resolution.id, false,
      'already_settled'::text, p_payment_id, p_task_id,
      v_resolution.paid_operation_pk;
    return;
  end if;

  select pg_catalog.lower(pg_catalog.btrim(u.email::text))
    into v_actor_email
    from auth.users u
   where u.id = p_actor_user_id
     and u.email is not null
     and pg_catalog.length(pg_catalog.btrim(u.email::text)) between 3 and 320
   for key share;
  if not found or v_actor_email is null then
    raise exception 'late-success settlement actor identity is not a live Auth user'
      using errcode = '42501';
  end if;

  if v_expected_task_set is distinct from p_task_set_sha256
     or v_expected_evidence is distinct from p_evidence_sha256 then
    raise exception 'late-success settle evidence changed after planning'
      using errcode = '40001';
  end if;

  if exists (
    select 1
      from public.billing_direct_checkout_late_success_resolutions r
     where r.payment_id = p_payment_id
       and r.action = 'settle_paid_predecessor'
  ) then
    raise exception 'payment already has a different late-success settlement resolution'
      using errcode = '22000';
  end if;
  select pg_catalog.count(*) into v_task_count
    from public.billing_direct_checkout_late_success_tasks t
   where t.payment_id = p_payment_id;

  if v_task_count <> 1
     or v_payment.charge_model <> 'direct'
     or v_payment.status::text <> 'processing'
     or v_payment.paid_at is not null
     or v_payment.stripe_payment_intent is not null
     or v_payment.stripe_charge_id is not null
     or v_payment.stripe_application_fee_id is not null
     or v_payment.stripe_balance_transaction_id is not null
     or v_payment.refunded_amount is distinct from 0
     or v_payment.eligible_service_refunded_amount is distinct from 0
     or v_payment.platform_fee_refunded is distinct from 0
     or v_payment.refunded_at is not null
     or v_payment.paid_checkout_operation_pk is not null
     or v_payment.late_checkout_success_resolution_pk is not null
     or v_payment.late_checkout_success_task_pk is distinct from v_task.id
     or v_payment.current_checkout_operation_pk is distinct from
       v_task.observed_current_operation_pk
     or v_payment.stripe_checkout_session is distinct from
       v_task.observed_current_session_id then
    raise exception 'late-success settle payment is not exact and pristine'
      using errcode = '55000';
  end if;

  if v_task.task_state <> 'successor_neutralized'
     or v_task.prepared_action <> 'successor_neutralized'
     or v_task.neutralized_at is null
     or v_task.late_success_projection is null
     or v_task.provider_event_id is null
     or v_task.paid_at is null
     or v_task.payment_intent_id is null
     or v_task.charge_id is null
     or v_task.amount_cents is distinct from
       (v_payment.amount * 100)::bigint
     or v_task.application_fee_cents is distinct from
       (v_payment.platform_fee * 100)::bigint
     or v_task.provider_reconciliation_status <> 'reconciled'
     or v_task.balance_transaction_id is null
     or (v_task.application_fee_cents > 0
       and v_task.application_fee_id is null)
     or not (
       (v_task.resolution_source = 'never_submitted'
         and v_task.reason_code = 'successor_never_submitted')
       or (v_task.resolution_source = 'signed_expiration'
         and v_task.reason_code = 'successor_signed_expired_unpaid')
       or (v_task.resolution_source = 'stripe_observation'
         and v_task.reason_code = 'successor_expired_unpaid')
     ) then
    raise exception 'late-success settle task is not an approved neutralized successor'
      using errcode = '55000';
  end if;

  if v_paid.id is null
     or v_current.id is null
     or v_paid.id = v_current.id
     or v_paid.account_id <> p_account_id
     or v_paid.payment_id <> p_payment_id
     or v_paid.operation_type <> 'checkout_session.create'
     or v_paid.state <> 'succeeded'
     or v_paid.checkout_generation <> v_task.paid_checkout_generation
     or v_paid.checkout_lifecycle <> 'expired_unpaid'
     or v_paid.checkout_expiration_id is null
     or v_paid.provider_object_id <> v_task.paid_checkout_session_id
     or v_paid.superseded_by_operation_pk <> v_current.id
     or v_current.id <> v_task.observed_current_operation_pk
     or v_current.checkout_generation <> v_task.observed_current_generation
     or v_current.provider_object_id is distinct from
       v_task.observed_current_session_id
     or not exists (
       select 1
         from public.stripe_connected_checkout_expirations x
        where x.id = v_paid.checkout_expiration_id
          and x.operation_pk = v_paid.id
          and x.payment_id = p_payment_id
          and x.checkout_session_id = v_task.paid_checkout_session_id
          and x.observed_session_status = 'expired'
          and x.observed_payment_status = 'unpaid'
     ) then
    raise exception 'late-success settle predecessor/current lineage changed'
      using errcode = '55000';
  end if;

  if (v_task.resolution_source = 'never_submitted' and not (
        v_current.state = 'claimed'
        or (v_current.state = 'failed'
          and v_current.submission_started_at is null
          and v_current.provider_object_id is null)
      ))
     or (v_task.resolution_source = 'signed_expiration' and not (
        v_current.state = 'succeeded'
        and v_current.checkout_lifecycle = 'expired_unpaid'
        and v_current.checkout_expiration_id is not null
        and exists (
          select 1
            from public.stripe_connected_checkout_expirations x
           where x.id = v_current.checkout_expiration_id
             and x.operation_pk = v_current.id
             and x.payment_id = p_payment_id
             and x.observed_session_status = 'expired'
             and x.observed_payment_status = 'unpaid'
        )
      ))
     or (v_task.resolution_source = 'stripe_observation' and not (
        v_task.successor_observation is not null
        and v_task.successor_observation_sha256 is not null
        and v_task.successor_observation ->> 'session_status' = 'expired'
        and v_task.successor_observation ->> 'payment_status' = 'unpaid'
        and v_task.successor_observation ->> 'checkout_session_id'
          = v_task.observed_current_session_id
      )) then
    raise exception 'late-success successor neutralization evidence changed'
      using errcode = '55000';
  end if;

  if v_event.provider <> 'stripe'
     or v_event.event_scope <> 'connected_payment'
     or v_event.event_type <> 'checkout.session.completed'
     or v_event.processing_status <> 'processed'
     or v_event.projection_schema_version is distinct from
       'stripe_connected_payment_projection_v1'
     or v_event.projection_applied is distinct from false
     or v_event.projection_result <>
       'direct_payment_late_success_resolution_pending'
     or v_event.account_id <> p_account_id
     or v_event.provider_account_id <> v_task.stripe_account_id
     or v_event.livemode <> v_task.livemode
     or v_event.provider_event_id <> v_task.provider_event_id
     or v_event.payload #>> '{data_object,id}' <>
       v_task.paid_checkout_session_id then
    raise exception 'late-success settle Billing event is not resolution-pending'
      using errcode = '55000';
  end if;

  perform pg_catalog.set_config(
    'lgq.direct_checkout_late_success_resolution_operation_id',
    p_operation_id,
    true
  );
  insert into public.billing_direct_checkout_late_success_resolutions (
    action, operation_id, request_sha256, task_set_sha256,
    evidence_sha256, task_id, billing_event_id, account_id, payment_id,
    paid_operation_pk, current_operation_pk, current_checkout_session_id,
    paid_checkout_session_id, provider_event_id, payment_intent_id,
    charge_id, application_fee_id, balance_transaction_id, paid_at,
    amount_cents, application_fee_cents, reconciliation_status,
    task_state_snapshot, task_reason_code, disposition_reason,
    actor_user_id, actor_email_snapshot
  ) values (
    'settle_paid_predecessor', p_operation_id, p_request_sha256,
    p_task_set_sha256, p_evidence_sha256, v_task.id, v_event.id,
    p_account_id, p_payment_id, v_paid.id, v_current.id,
    v_payment.stripe_checkout_session, v_task.paid_checkout_session_id,
    v_task.provider_event_id, v_task.payment_intent_id, v_task.charge_id,
    v_task.application_fee_id, v_task.balance_transaction_id,
    v_task.paid_at, v_task.amount_cents, v_task.application_fee_cents,
    v_task.provider_reconciliation_status, v_task.task_state,
    v_task.reason_code, 'successor_neutralized', p_actor_user_id,
    v_actor_email
  ) returning * into v_resolution;
  perform pg_catalog.set_config(
    'lgq.direct_checkout_late_success_resolution_operation_id', '', true
  );

  update public.billing_events e
     set projection_applied = true,
         projection_result = 'direct_payment_late_success_resolved_settled'
   where e.id = v_event.id
     and e.processing_status = 'processed'
     and e.projection_applied = false
     and e.projection_result =
       'direct_payment_late_success_resolution_pending';
  if not found then
    raise exception 'late-success settle event transition was lost'
      using errcode = '40001';
  end if;

  perform pg_catalog.set_config(
    'lgq.direct_checkout_late_success_resolution_id',
    v_resolution.id::text,
    true
  );
  update public.payments p
     set status = 'paid',
         paid_at = v_task.paid_at,
         stripe_payment_intent = v_task.payment_intent_id,
         stripe_charge_id = v_task.charge_id,
         stripe_application_fee_id = v_task.application_fee_id,
         stripe_balance_transaction_id = v_task.balance_transaction_id,
         reconciliation_status = v_task.provider_reconciliation_status,
         reconciled_at = case
           when v_task.provider_reconciliation_status = 'reconciled'
             then pg_catalog.now()
           else null
         end,
         paid_checkout_operation_pk = v_task.paid_operation_pk,
         late_checkout_success_resolution_pk = v_resolution.id
   where p.id = p_payment_id
     and p.account_id = p_account_id
     and p.status::text = 'processing'
     and p.paid_at is null
     and p.paid_checkout_operation_pk is null
     and p.late_checkout_success_resolution_pk is null
     and p.current_checkout_operation_pk = v_current.id
     and p.late_checkout_success_task_pk = v_task.id
     and p.stripe_checkout_session is not distinct from
       v_task.observed_current_session_id;
  perform pg_catalog.set_config(
    'lgq.direct_checkout_late_success_resolution_id', '', true
  );
  if not found then
    raise exception 'late-success settle payment transition was lost'
      using errcode = '40001';
  end if;
  if not exists (
    select 1
      from public.billing_direct_payment_settlement_tasks st
     where st.payment_id = p_payment_id
       and st.billing_event_id = v_event.id
  ) then
    raise exception 'late-success settlement task was not atomically enqueued'
      using errcode = '55000';
  end if;

  return query select
    v_resolution.resolution_schema, v_resolution.id, true,
    'settled'::text, p_payment_id, p_task_id, v_paid.id;
end;
$$;

create function public.record_direct_checkout_late_success_manual_disposition(
  p_account_id uuid,
  p_payment_id uuid,
  p_task_id uuid,
  p_operation_id text,
  p_request_sha256 text,
  p_task_set_sha256 text,
  p_evidence_sha256 text,
  p_disposition_reason text,
  p_actor_user_id uuid
)
returns table (
  resolution_schema text,
  resolution_id uuid,
  applied boolean,
  result_code text,
  payment_id uuid,
  task_id uuid,
  paid_operation_pk uuid
)
language plpgsql
security definer
set search_path = ''
set timezone to 'UTC'
as $$
declare
  v_task_hint public.billing_direct_checkout_late_success_tasks%rowtype;
  v_event public.billing_events%rowtype;
  v_payment public.payments%rowtype;
  v_task public.billing_direct_checkout_late_success_tasks%rowtype;
  v_paid public.billing_payment_operations%rowtype;
  v_current public.billing_payment_operations%rowtype;
  v_resolution public.billing_direct_checkout_late_success_resolutions%rowtype;
  v_actor_email text;
  v_session record;
  v_expected_task_set text;
  v_expected_evidence text;
begin
  if p_account_id is null
     or p_payment_id is null
     or p_task_id is null
     or p_operation_id is null
     or pg_catalog.length(pg_catalog.btrim(p_operation_id)) not between 1 and 200
     or p_operation_id <> pg_catalog.btrim(p_operation_id)
     or p_operation_id ~ '[[:cntrl:]]'
     or p_request_sha256 is null
     or p_request_sha256 !~ '^[0-9a-f]{64}$'
     or p_task_set_sha256 is null
     or p_task_set_sha256 !~ '^[0-9a-f]{64}$'
     or p_evidence_sha256 is null
     or p_evidence_sha256 !~ '^[0-9a-f]{64}$'
     or p_disposition_reason is null
     or p_disposition_reason not in (
       'operator_retained_for_manual_review',
       'additional_paid_truth_requires_review',
       'successor_not_safely_neutralized',
       'provider_evidence_requires_review'
     )
     or p_actor_user_id is null then
    raise exception 'late-success manual disposition input is invalid'
      using errcode = '22023';
  end if;

  select t.* into v_task_hint
    from public.billing_direct_checkout_late_success_tasks t
   where t.id = p_task_id
     and t.payment_id = p_payment_id
     and t.account_id = p_account_id;
  if not found then
    raise exception 'late-success manual disposition task was not found'
      using errcode = 'P0002';
  end if;
  select e.* into v_event
    from public.billing_events e
   where e.id = v_task_hint.billing_event_id
   for update;
  if not found then
    raise exception 'late-success manual disposition event was not found'
      using errcode = 'P0002';
  end if;
  perform 1
    from public.accounts a
   where a.id = p_account_id
     and a.stripe_merchant_account_id = v_task_hint.stripe_account_id
     and a.merchant_livemode = v_task_hint.livemode
   for key share;
  if not found then
    raise exception 'late-success manual disposition Merchant mapping changed'
      using errcode = '55000';
  end if;
  select p.* into v_payment
    from public.payments p
   where p.id = p_payment_id and p.account_id = p_account_id
   for update;
  if not found then
    raise exception 'late-success manual disposition payment was not found'
      using errcode = 'P0002';
  end if;
  perform 1
    from public.billing_payment_operations o
   where o.payment_id = p_payment_id
     and o.account_id = p_account_id
     and o.operation_type = 'checkout_session.create'
   order by o.checkout_generation, o.id
   for update;
  perform 1
    from public.billing_direct_checkout_late_success_tasks t
   where t.payment_id = p_payment_id
   order by t.id
   for update;
  select t.* into v_task
    from public.billing_direct_checkout_late_success_tasks t
   where t.id = p_task_id;
  select o.* into v_paid
    from public.billing_payment_operations o where o.id = v_task.paid_operation_pk;
  select o.* into v_current
    from public.billing_payment_operations o
   where o.id = v_task.observed_current_operation_pk;

  for v_session in
    select session_id
      from (values
        (v_task.paid_checkout_session_id),
        (v_task.observed_current_session_id)
      ) as sessions(session_id)
     where session_id is not null
     group by session_id order by session_id
  loop
    perform pg_catalog.pg_advisory_xact_lock(
      public.stripe_connected_checkout_session_mutex_key(
        p_account_id, v_task.stripe_account_id, v_task.livemode,
        v_session.session_id
      )
    );
  end loop;

  v_expected_task_set :=
    public.direct_checkout_late_success_task_set_sha256(p_payment_id);
  v_expected_evidence :=
    public.direct_checkout_late_success_evidence_sha256(p_task_id);

  select r.* into v_resolution
    from public.billing_direct_checkout_late_success_resolutions r
   where r.operation_id = p_operation_id or r.task_id = p_task_id
   order by case when r.operation_id = p_operation_id then 0 else 1 end
   limit 1
   for update;
  if found then
    if v_resolution.action is distinct from 'retain_hold'
       or v_resolution.operation_id is distinct from p_operation_id
       or v_resolution.request_sha256 is distinct from p_request_sha256
       or v_resolution.task_set_sha256 is distinct from p_task_set_sha256
       or v_resolution.evidence_sha256 is distinct from p_evidence_sha256
       or v_resolution.disposition_reason is distinct from p_disposition_reason
       or v_resolution.actor_user_id is distinct from p_actor_user_id
       or v_resolution.account_id is distinct from p_account_id
       or v_resolution.payment_id is distinct from p_payment_id
       or v_resolution.task_id is distinct from p_task_id
       or v_event.projection_result is distinct from
         'direct_payment_late_success_hold_retained' then
      raise exception 'late-success manual disposition replay conflicts with durable outcome'
        using errcode = '22000';
    end if;
    return query select
      v_resolution.resolution_schema, v_resolution.id, false,
      'already_retained'::text, p_payment_id, p_task_id,
      v_resolution.paid_operation_pk;
    return;
  end if;

  select pg_catalog.lower(pg_catalog.btrim(u.email::text))
    into v_actor_email
    from auth.users u
   where u.id = p_actor_user_id
     and u.email is not null
     and pg_catalog.length(pg_catalog.btrim(u.email::text)) between 3 and 320
   for key share;
  if not found or v_actor_email is null then
    raise exception 'late-success manual disposition actor identity is not a live Auth user'
      using errcode = '42501';
  end if;

  if v_expected_task_set is distinct from p_task_set_sha256
     or v_expected_evidence is distinct from p_evidence_sha256 then
    raise exception 'late-success manual disposition evidence changed after planning'
      using errcode = '40001';
  end if;

  if v_payment.charge_model <> 'direct'
     or v_task.task_state not in ('successor_neutralized', 'manual_review')
     or v_paid.id is null
     or v_current.id is null
     or v_paid.account_id <> p_account_id
     or v_paid.payment_id <> p_payment_id
     or v_current.account_id <> p_account_id
     or v_current.payment_id <> p_payment_id
     or v_current.id <> v_task.observed_current_operation_pk then
    raise exception 'late-success manual disposition scope is not terminal and exact'
      using errcode = '55000';
  end if;
  if v_event.provider <> 'stripe'
     or v_event.event_scope <> 'connected_payment'
     or v_event.event_type <> 'checkout.session.completed'
     or v_event.account_id <> p_account_id
     or v_event.provider_account_id <> v_task.stripe_account_id
     or v_event.livemode <> v_task.livemode
     or v_event.payload #>> '{data_object,id}' <>
       v_task.paid_checkout_session_id
     or not (
       (
         v_event.processing_status = 'processed'
         and v_event.projection_schema_version is not distinct from
           'stripe_connected_payment_projection_v1'
         and v_event.projection_applied is distinct from false
         and v_event.projection_result in (
           'direct_payment_late_success_resolution_pending',
           'direct_payment_late_success_manual_review',
           'direct_payment_additional_paid_truth_manual_review'
         )
       )
       or (
         v_task.task_state = 'manual_review'
         and v_event.processing_status = 'failed'
         and v_event.processed_at is null
         and v_event.projection_schema_version is null
         and v_event.projection_applied is null
         and v_event.projection_result is null
       )
     ) then
    raise exception 'late-success manual disposition event is not held for review'
      using errcode = '55000';
  end if;

  perform pg_catalog.set_config(
    'lgq.direct_checkout_late_success_resolution_operation_id',
    p_operation_id, true
  );
  insert into public.billing_direct_checkout_late_success_resolutions (
    action, operation_id, request_sha256, task_set_sha256,
    evidence_sha256, task_id, billing_event_id, account_id, payment_id,
    paid_operation_pk, current_operation_pk, current_checkout_session_id,
    paid_checkout_session_id, provider_event_id, payment_intent_id,
    charge_id, application_fee_id, balance_transaction_id, paid_at,
    amount_cents, application_fee_cents, reconciliation_status,
    task_state_snapshot, task_reason_code, disposition_reason,
    actor_user_id, actor_email_snapshot
  ) values (
    'retain_hold', p_operation_id, p_request_sha256, p_task_set_sha256,
    p_evidence_sha256, v_task.id, v_event.id, p_account_id,
    p_payment_id, v_task.paid_operation_pk,
    v_task.observed_current_operation_pk,
    v_task.observed_current_session_id,
    v_task.paid_checkout_session_id, v_task.provider_event_id,
    v_task.payment_intent_id, v_task.charge_id,
    v_task.application_fee_id, v_task.balance_transaction_id,
    v_task.paid_at, v_task.amount_cents, v_task.application_fee_cents,
    v_task.provider_reconciliation_status, v_task.task_state,
    v_task.reason_code, p_disposition_reason, p_actor_user_id,
    v_actor_email
  ) returning * into v_resolution;
  perform pg_catalog.set_config(
    'lgq.direct_checkout_late_success_resolution_operation_id', '', true
  );

  update public.billing_events e
     set processing_status = 'processed',
         processed_at = coalesce(e.processed_at, pg_catalog.now()),
         next_attempt_at = null,
         projection_claim_token = null,
         projection_lease_expires_at = null,
         projection_schema_version =
           'stripe_connected_payment_projection_v1',
         projection_applied = false,
         projection_result = 'direct_payment_late_success_hold_retained'
   where e.id = v_event.id
     and (
       (
         e.processing_status = 'processed'
         and e.projection_applied = false
         and e.projection_result in (
           'direct_payment_late_success_resolution_pending',
           'direct_payment_late_success_manual_review',
           'direct_payment_additional_paid_truth_manual_review'
         )
       )
       or (
         v_task.task_state = 'manual_review'
         and e.processing_status = 'failed'
         and e.processed_at is null
         and e.projection_schema_version is null
         and e.projection_applied is null
         and e.projection_result is null
       )
     );
  if not found then
    raise exception 'late-success manual disposition event transition was lost'
      using errcode = '40001';
  end if;

  return query select
    v_resolution.resolution_schema, v_resolution.id, true,
    'hold_retained'::text, p_payment_id, p_task_id,
    v_resolution.paid_operation_pk;
end;
$$;

-- Financial consumers accept only a fully bound canonical release.  Any later
-- uncovered task or retain-hold disposition reactivates their payment hold.
-- Exact live hashes and one-occurrence needles make every patch fail closed.
do $$
declare
  v_before text;
  v_old text := $needle$
    if exists (
      select 1
        from public.payments held_payment
       where held_payment.id = v_task.payment_id
         and held_payment.account_id = v_task.account_id
         and held_payment.late_checkout_success_task_pk is not null
    ) then$needle$;
  v_new text := $replacement$
    if exists (
      select 1
        from public.payments held_payment
       where held_payment.id = v_task.payment_id
         and held_payment.account_id = v_task.account_id
         and public.direct_checkout_late_success_has_active_hold(
           held_payment.id
         ) is true
    ) then$replacement$;
begin
  v_before := pg_catalog.pg_get_functiondef(
    'public.claim_direct_payment_settlement_tasks(integer)'
      ::pg_catalog.regprocedure
  );
  if pg_catalog.md5(v_before) <> 'df320e96938c878461ad0942655ee987'
     or pg_catalog.length(v_before)
       - pg_catalog.length(pg_catalog.replace(v_before, v_old, ''))
       is distinct from pg_catalog.length(v_old) then
    raise exception 'settlement claim canonical-release source drifted'
      using errcode = '55000';
  end if;
  execute pg_catalog.replace(v_before, v_old, v_new);
end
$$;

do $$
declare
  v_before text;
  v_old text := $needle$
     or v_payment.charge_model <> 'direct'
     or v_payment.late_checkout_success_task_pk is not null
     or v_payment.status::text <> 'paid'$needle$;
  v_new text := $replacement$
     or v_payment.charge_model <> 'direct'
     or public.direct_checkout_late_success_has_active_hold(
       v_payment.id
     ) is true
     or v_payment.status::text <> 'paid'$replacement$;
begin
  v_before := pg_catalog.pg_get_functiondef(
    'public.record_direct_payment_settlement_feed(uuid,uuid)'
      ::pg_catalog.regprocedure
  );
  if pg_catalog.md5(v_before) <> 'e7596ee137869302ace925842b849932'
     or pg_catalog.length(v_before)
       - pg_catalog.length(pg_catalog.replace(v_before, v_old, ''))
       is distinct from pg_catalog.length(v_old) then
    raise exception 'settlement feed canonical-release source drifted'
      using errcode = '55000';
  end if;
  execute pg_catalog.replace(v_before, v_old, v_new);
end
$$;

do $$
declare
  v_before text;
  v_old text := $needle$
  if v_payment.late_checkout_success_task_pk is not null
     and not v_sms_exists then$needle$;
  v_new text := $replacement$
  if public.direct_checkout_late_success_has_active_hold(
       v_payment.id
     ) is true
     and not v_sms_exists then$replacement$;
begin
  v_before := pg_catalog.pg_get_functiondef(
    'public.stage_direct_payment_settlement_sms(uuid,uuid,text,text)'
      ::pg_catalog.regprocedure
  );
  if pg_catalog.md5(v_before) <> '36a492069e283c4caf0f8f00a03c079c'
     or pg_catalog.length(v_before)
       - pg_catalog.length(pg_catalog.replace(v_before, v_old, ''))
       is distinct from pg_catalog.length(v_old) then
    raise exception 'settlement SMS canonical-release source drifted'
      using errcode = '55000';
  end if;
  execute pg_catalog.replace(v_before, v_old, v_new);
end
$$;

do $$
declare
  v_before text;
  v_old text := $needle$
     or v_payment.charge_model <> 'direct'
     or v_payment.late_checkout_success_task_pk is not null
     or v_payment.stripe_account_id is distinct from p_stripe_account_id$needle$;
  v_new text := $replacement$
     or v_payment.charge_model <> 'direct'
     or (
       v_payment.late_checkout_success_task_pk is not null
       and public.direct_checkout_late_success_refund_release_is_valid(
         v_payment.id
       ) is not true
     )
     or v_payment.stripe_account_id is distinct from p_stripe_account_id$replacement$;
begin
  v_before := pg_catalog.pg_get_functiondef(
    'public.compute_direct_charge_refund_plan(uuid,uuid,text,boolean,uuid,text)'
      ::pg_catalog.regprocedure
  );
  if pg_catalog.md5(v_before) <> '73eb703fc38d26e72d4cdeab25334313'
     or pg_catalog.length(v_before)
       - pg_catalog.length(pg_catalog.replace(v_before, v_old, ''))
       is distinct from pg_catalog.length(v_old) then
    raise exception 'refund plan canonical-release source drifted'
      using errcode = '55000';
  end if;
  execute pg_catalog.replace(v_before, v_old, v_new);
end
$$;

do $$
declare
  v_before text;
  v_old text := $needle$
   where p.id = p_payment_id
     and p.account_id = p_account_id
     and p.late_checkout_success_task_pk is null
   for update;$needle$;
  v_new text := $replacement$
   where p.id = p_payment_id
     and p.account_id = p_account_id
     and (
       p.late_checkout_success_task_pk is null
       or public.direct_checkout_late_success_refund_release_is_valid(
         p.id
       ) is true
     )
   for update;$replacement$;
begin
  v_before := pg_catalog.pg_get_functiondef(
    'public.claim_direct_charge_refund_operation(uuid,uuid,text,boolean,uuid,text,text,bigint,bigint,bigint,bigint,text,text,text,text,text,text,text)'
      ::pg_catalog.regprocedure
  );
  if pg_catalog.md5(v_before) <> '9eb7b146b4d4e7da22d509a6c22c23c2'
     or pg_catalog.length(v_before)
       - pg_catalog.length(pg_catalog.replace(v_before, v_old, ''))
       is distinct from pg_catalog.length(v_old) then
    raise exception 'refund claim canonical-release source drifted'
      using errcode = '55000';
  end if;
  execute pg_catalog.replace(v_before, v_old, v_new);
end
$$;

do $$
declare
  v_before text;
  v_old text := $needle$
     or v_payment.charge_model <> 'direct'
     or v_payment.late_checkout_success_task_pk is not null
     or v_payment.stripe_account_id is distinct from v_operation.stripe_account_id$needle$;
  v_new text := $replacement$
     or v_payment.charge_model <> 'direct'
     or (
       v_payment.late_checkout_success_task_pk is not null
       and public.direct_checkout_late_success_refund_release_is_valid(
         v_payment.id
       ) is not true
     )
     or v_payment.stripe_account_id is distinct from v_operation.stripe_account_id$replacement$;
begin
  v_before := pg_catalog.pg_get_functiondef(
    'public.begin_direct_charge_refund_submission(uuid,uuid)'
      ::pg_catalog.regprocedure
  );
  if pg_catalog.md5(v_before) <> '4cf6cf523dfa076e02f7445b5d531159'
     or pg_catalog.length(v_before)
       - pg_catalog.length(pg_catalog.replace(v_before, v_old, ''))
       is distinct from pg_catalog.length(v_old) then
    raise exception 'charge refund begin canonical-release source drifted'
      using errcode = '55000';
  end if;
  execute pg_catalog.replace(v_before, v_old, v_new);
end
$$;

do $$
declare
  v_before text;
  v_old text := $needle$
  if v_payment.id is null
     or v_payment.late_checkout_success_task_pk is not null
     or v_payment.refunded_amount is distinct from v_detail.cumulative_gross_before_cents::numeric / 100$needle$;
  v_new text := $replacement$
  if v_payment.id is null
     or (
       v_payment.late_checkout_success_task_pk is not null
       and public.direct_checkout_late_success_refund_release_is_valid(
         v_payment.id
       ) is not true
     )
     or v_payment.refunded_amount is distinct from v_detail.cumulative_gross_before_cents::numeric / 100$replacement$;
begin
  v_before := pg_catalog.pg_get_functiondef(
    'public.begin_direct_application_fee_refund_submission(uuid,uuid)'
      ::pg_catalog.regprocedure
  );
  if pg_catalog.md5(v_before) <> 'ae14901d33ab976b387c2c3033424778'
     or pg_catalog.length(v_before)
       - pg_catalog.length(pg_catalog.replace(v_before, v_old, ''))
       is distinct from pg_catalog.length(v_old) then
    raise exception 'Application Fee Refund begin canonical-release source drifted'
      using errcode = '55000';
  end if;
  execute pg_catalog.replace(v_before, v_old, v_new);
end
$$;

create function
  public.admin_billing_direct_checkout_late_success_resolution_summary()
returns table (
  summary_schema text,
  total_task_count bigint,
  affected_payment_count bigint,
  active_hold_payment_count bigint,
  released_payment_count bigint,
  resolution_ready_payment_count bigint,
  worker_open_count bigint,
  successor_neutralized_count bigint,
  manual_review_count bigint,
  evidence_count bigint,
  oldest_active_hold_at timestamptz,
  fixed_reason_code text,
  fixed_reason_code_count bigint,
  fixed_reason_codes_truncated boolean
)
language sql
stable
security definer
set search_path = ''
set timezone to 'UTC'
as $$
  with task_facts as (
    select
      t.*,
      public.direct_checkout_late_success_has_active_hold(t.payment_id)
        as active_hold,
      public.direct_checkout_late_success_canonical_release_is_valid(
        t.payment_id
      ) and public.direct_checkout_late_success_has_active_hold(t.payment_id)
        is not true as released,
      case
        when t.reason_code in (
          'successor_never_submitted',
          'successor_signed_expired_unpaid',
          'successor_expired_unpaid',
          'late_paid_truth_without_successor',
          'additional_paid_truth_operator_required',
          'successor_additional_paid_truth',
          'successor_unexpireable_state',
          'successor_contract_mismatch',
          'successor_provider_state_indeterminate',
          'provider_metadata_mismatch',
          'provider_mode_mismatch',
          'provider_object_retrieve_failed',
          'provider_object_contract_mismatch',
          'late_success_successor_retrieve_failed',
          'late_success_successor_expire_indeterminate',
          'projection_internal_error',
          'projection_retry_attempt_limit'
        ) then t.reason_code
        else 'unrecognized_error_code'
      end as normalized_reason_code
    from public.billing_direct_checkout_late_success_tasks t
  ),
  payment_facts as (
    select
      f.payment_id,
      pg_catalog.bool_or(f.active_hold) as active_hold,
      pg_catalog.bool_or(f.released) as released,
      pg_catalog.count(*) as task_count,
      pg_catalog.count(*) filter (
        where f.task_state = 'successor_neutralized'
          and f.provider_reconciliation_status = 'reconciled'
          and f.balance_transaction_id is not null
          and (f.application_fee_cents = 0
            or f.application_fee_id is not null)
          and f.reason_code in (
            'successor_never_submitted',
            'successor_signed_expired_unpaid',
            'successor_expired_unpaid'
          )
          and not exists (
            select 1
              from public.billing_direct_checkout_late_success_resolutions r
             where r.task_id = f.id
          )
      ) as ready_task_count
    from task_facts f
    group by f.payment_id
  ),
  totals as (
    select
      (select pg_catalog.count(*) from task_facts)::bigint as total_count,
      (select pg_catalog.count(*) from payment_facts)::bigint
        as affected_count,
      (select pg_catalog.count(*) from payment_facts p
        where p.active_hold)::bigint as active_count,
      (select pg_catalog.count(*) from payment_facts p
        where p.released and not p.active_hold)::bigint as released_count,
      (select pg_catalog.count(*) from payment_facts p
        where p.active_hold and p.task_count = 1
          and p.ready_task_count = 1
          and exists (
            select 1
              from public.payments payment
              join public.billing_direct_checkout_late_success_tasks task
                on task.id = payment.late_checkout_success_task_pk
             where payment.id = p.payment_id
               and payment.charge_model = 'direct'
               and payment.status::text = 'processing'
               and payment.paid_at is null
               and payment.stripe_payment_intent is null
               and payment.stripe_charge_id is null
               and payment.paid_checkout_operation_pk is null
               and payment.late_checkout_success_resolution_pk is null
               and payment.current_checkout_operation_pk =
                 task.observed_current_operation_pk
               and payment.stripe_checkout_session is not distinct from
                 task.observed_current_session_id
          ))::bigint as ready_count,
      (select pg_catalog.count(*) from task_facts f
        where f.task_state in ('ready', 'leased', 'retry_wait'))::bigint
        as worker_count,
      (select pg_catalog.count(*) from task_facts f
        where f.task_state = 'successor_neutralized')::bigint
        as neutralized_count,
      (select pg_catalog.count(*) from task_facts f
        where f.task_state = 'manual_review')::bigint as manual_count,
      (select pg_catalog.count(*) from task_facts f
        where f.late_success_projection is not null
          and f.late_success_projection_sha256 is not null)::bigint
        as paid_evidence_count,
      (select pg_catalog.min(f.created_at) from task_facts f
        where f.active_hold) as oldest_hold
  ),
  reasons as (
    select f.normalized_reason_code as code,
           pg_catalog.count(*)::bigint as count
      from task_facts f
     where f.task_state in ('successor_neutralized', 'manual_review')
     group by f.normalized_reason_code
  ),
  output_reasons as (
    select r.code, r.count from reasons r
    union all
    select null::text, 0::bigint
     where not exists (select 1 from reasons)
  )
  select
    'direct_checkout_late_success_resolution_summary_v1'::text,
    t.total_count,
    t.affected_count,
    t.active_count,
    t.released_count,
    t.ready_count,
    t.worker_count,
    t.neutralized_count,
    t.manual_count,
    t.paid_evidence_count,
    t.oldest_hold,
    r.code,
    r.count,
    false
  from totals t
  cross join output_reasons r
  order by r.count desc, r.code nulls last
$$;

-- Private ledgers and helpers expose no Data API surface.  Only the four
-- bounded service RPCs are executable.  Mutation RPCs preserve a live Auth
-- user identity, but this dark module has no caller: a future route must add
-- MFA plus an explicit staff/permission check before invoking either mutation.
revoke all on table
  public.billing_direct_checkout_late_success_resolutions
  from public, anon, authenticated, service_role;
revoke update (
  paid_checkout_operation_pk, late_checkout_success_resolution_pk
) on public.payments from public, anon, authenticated, service_role;

revoke all on function
  public.direct_checkout_late_success_evidence_sha256(uuid)
  from public, anon, authenticated, service_role;
revoke all on function
  public.direct_checkout_late_success_task_set_sha256(uuid)
  from public, anon, authenticated, service_role;
revoke all on function
  public.protect_direct_checkout_late_success_resolution()
  from public, anon, authenticated, service_role;
revoke all on function
  public.direct_checkout_late_success_canonical_release_is_valid(uuid)
  from public, anon, authenticated, service_role;
revoke all on function
  public.direct_checkout_late_success_has_active_hold(uuid)
  from public, anon, authenticated, service_role;
revoke all on function
  public.direct_checkout_late_success_refund_release_is_valid(uuid)
  from public, anon, authenticated, service_role;
revoke all on function
  public.protect_payment_paid_checkout_resolution_pointers()
  from public, anon, authenticated, service_role;
revoke all on function
  public.enqueue_one_off_direct_payment_late_success_settlement(
    public.payments, public.payments, uuid
  ) from public, anon, authenticated, service_role;
revoke all on function
  public.guard_stripe_connected_checkout_expiration_payment_truth()
  from public, anon, authenticated, service_role;

revoke all on function
  public.plan_direct_checkout_late_success_operator_resolution(
    uuid, uuid, uuid, text
  ) from public, anon, authenticated, service_role;
grant execute on function
  public.plan_direct_checkout_late_success_operator_resolution(
    uuid, uuid, uuid, text
  ) to service_role;

revoke all on function public.settle_direct_checkout_late_success_task(
  uuid, uuid, uuid, text, text, text, text, uuid
) from public, anon, authenticated, service_role;
grant execute on function public.settle_direct_checkout_late_success_task(
  uuid, uuid, uuid, text, text, text, text, uuid
) to service_role;

revoke all on function
  public.record_direct_checkout_late_success_manual_disposition(
    uuid, uuid, uuid, text, text, text, text, text, uuid
  ) from public, anon, authenticated, service_role;
grant execute on function
  public.record_direct_checkout_late_success_manual_disposition(
    uuid, uuid, uuid, text, text, text, text, text, uuid
  ) to service_role;

revoke all on function
  public.admin_billing_direct_checkout_late_success_resolution_summary()
  from public, anon, authenticated, service_role;
grant execute on function
  public.admin_billing_direct_checkout_late_success_resolution_summary()
  to service_role;

comment on table
  public.billing_direct_checkout_late_success_resolutions is
  'Immutable operator dispositions for verified late-paid direct Checkout evidence; no row clears or reparents the original hold/current Session.';
comment on column public.payments.paid_checkout_operation_pk is
  'Write-once Checkout generation that supplied canonical paid provider truth; distinct from the retained current/successor pointer when operator-resolved.';
comment on column public.payments.late_checkout_success_resolution_pk is
  'Write-once canonical settle resolution; null for permanent retain-hold dispositions.';
comment on function public.settle_direct_checkout_late_success_task(
  uuid, uuid, uuid, text, text, text, text, uuid
) is 'Dark service-only atomic settlement of one exact reconciled late-paid predecessor after immutable successor neutralization; caller authorization is separate.';

commit;
