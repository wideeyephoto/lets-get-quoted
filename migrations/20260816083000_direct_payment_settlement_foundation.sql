-- DARK one-off direct-payment settlement and notification foundation.
--
-- This migration adds no route, cron, caller, environment flag, or provider
-- egress. The existing connected-payment projector remains the only intended
-- payment-success writer. Its processing -> paid UPDATE fires the trigger below
-- in the same transaction. The trigger re-proves the exact full-outstanding
-- invoice scope, preserves a real signature timestamp, and queues one PII-free
-- task. Any invariant or queue write failure aborts the payment projection.

begin;

-- A provider request can succeed even when the worker loses the response. Such
-- a pending row is not retryable evidence: on lease recovery it is explicitly
-- indeterminate, so no future worker can blindly send the same text again.
alter table public.sms_events
  drop constraint if exists sms_events_status_check;
alter table public.sms_events
  add constraint sms_events_status_check check (
    status in ('pending', 'sent', 'failed', 'opted_out', 'indeterminate')
  );

create table public.billing_direct_payment_settlement_tasks (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  payment_id uuid not null unique,
  billing_event_id uuid not null unique
    references public.billing_events(id) on delete restrict,
  account_id uuid not null references public.accounts(id) on delete restrict,
  job_id uuid not null references public.jobs(id) on delete restrict,
  invoice_id uuid not null references public.invoices(id) on delete restrict,
  settled_at timestamptz not null,
  task_state text not null default 'ready'
    check (task_state in ('ready', 'leased', 'retry_wait', 'completed', 'dead_letter')),
  claim_token uuid,
  lease_expires_at timestamptz,
  attempt_count integer not null default 0 check (attempt_count between 0 and 8),
  next_attempt_at timestamptz,
  feed_status text not null default 'pending'
    check (feed_status in ('pending', 'recorded')),
  sms_status text not null default 'pending'
    check (
      sms_status in (
        'pending', 'dispatching', 'sent',
        'skipped_no_consent', 'skipped_opted_out', 'indeterminate'
      )
    ),
  sms_event_id uuid references public.sms_events(id) on delete restrict,
  last_error_code text check (
    last_error_code is null or last_error_code ~ '^[a-z][a-z0-9_]{2,99}$'
  ),
  completed_at timestamptz,
  dead_lettered_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint billing_direct_payment_settlement_payment_scope_fk
    foreign key (payment_id, account_id)
    references public.payments(id, account_id) on delete restrict,
  constraint billing_direct_payment_settlement_task_shape_check check (
    (
      task_state = 'ready'
      and claim_token is null
      and lease_expires_at is null
      and attempt_count = 0
      and next_attempt_at is null
      and last_error_code is null
      and completed_at is null
      and dead_lettered_at is null
    )
    or (
      task_state = 'leased'
      and claim_token is not null
      and lease_expires_at is not null
      and attempt_count between 1 and 8
      and next_attempt_at is null
      and completed_at is null
      and dead_lettered_at is null
    )
    or (
      task_state = 'retry_wait'
      and claim_token is null
      and lease_expires_at is null
      and attempt_count between 1 and 7
      and next_attempt_at is not null
      and last_error_code is not null
      and completed_at is null
      and dead_lettered_at is null
    )
    or (
      task_state = 'completed'
      and claim_token is null
      and lease_expires_at is null
      and attempt_count between 1 and 8
      and next_attempt_at is null
      and feed_status = 'recorded'
      and sms_status in ('sent', 'skipped_no_consent', 'skipped_opted_out')
      and last_error_code is null
      and completed_at is not null
      and dead_lettered_at is null
    )
    or (
      task_state = 'dead_letter'
      and claim_token is null
      and lease_expires_at is null
      and attempt_count between 1 and 8
      and next_attempt_at is null
      and last_error_code is not null
      and completed_at is null
      and dead_lettered_at is not null
    )
  ),
  constraint billing_direct_payment_settlement_sms_shape_check check (
    (
      sms_status = 'pending'
      and sms_event_id is null
    )
    or (
      sms_status in ('skipped_no_consent', 'skipped_opted_out')
      and sms_event_id is null
      and task_state = 'completed'
    )
    or (
      sms_status = 'dispatching'
      and sms_event_id is not null
      and task_state = 'leased'
    )
    or (
      sms_status = 'sent'
      and sms_event_id is not null
      and task_state = 'completed'
    )
    or (
      sms_status = 'indeterminate'
      and sms_event_id is not null
      and task_state = 'dead_letter'
    )
  )
);

create unique index billing_direct_payment_settlement_claim_unique
  on public.billing_direct_payment_settlement_tasks (claim_token)
  where claim_token is not null;
create index billing_direct_payment_settlement_queue_idx
  on public.billing_direct_payment_settlement_tasks (
    task_state, next_attempt_at, created_at, id
  )
  where task_state in ('ready', 'leased', 'retry_wait');
create index billing_direct_payment_settlement_dead_letter_idx
  on public.billing_direct_payment_settlement_tasks (dead_lettered_at desc, id)
  where task_state = 'dead_letter';

create table public.billing_direct_payment_settlement_attempts (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  task_id uuid not null
    references public.billing_direct_payment_settlement_tasks(id) on delete restrict,
  claim_token uuid not null unique,
  attempt_number integer not null check (attempt_number between 1 and 8),
  lease_expires_at timestamptz not null,
  outcome_status text check (
    outcome_status is null
    or outcome_status in (
      'completed', 'failed_retryable', 'failed_terminal', 'sms_indeterminate'
    )
  ),
  error_code text check (
    error_code is null or error_code ~ '^[a-z][a-z0-9_]{2,99}$'
  ),
  feed_status text check (feed_status is null or feed_status in ('pending', 'recorded')),
  sms_status text check (
    sms_status is null
    or sms_status in (
      'pending', 'dispatching', 'sent',
      'skipped_no_consent', 'skipped_opted_out', 'indeterminate'
    )
  ),
  claimed_at timestamptz not null default pg_catalog.now(),
  finished_at timestamptz,
  constraint billing_direct_payment_settlement_attempt_shape_check check (
    (
      outcome_status is null
      and error_code is null
      and feed_status is null
      and sms_status is null
      and finished_at is null
    )
    or (
      outcome_status = 'completed'
      and error_code is null
      and feed_status = 'recorded'
      and sms_status in ('sent', 'skipped_no_consent', 'skipped_opted_out')
      and finished_at is not null
    )
    or (
      outcome_status in ('failed_retryable', 'failed_terminal', 'sms_indeterminate')
      and error_code is not null
      and feed_status is not null
      and sms_status is not null
      and finished_at is not null
    )
  )
);

create unique index billing_direct_payment_settlement_one_open_attempt
  on public.billing_direct_payment_settlement_attempts (task_id)
  where outcome_status is null;
create index billing_direct_payment_settlement_attempt_history_idx
  on public.billing_direct_payment_settlement_attempts (task_id, claimed_at desc);

alter table public.billing_direct_payment_settlement_tasks enable row level security;
alter table public.billing_direct_payment_settlement_tasks force row level security;
alter table public.billing_direct_payment_settlement_attempts enable row level security;
alter table public.billing_direct_payment_settlement_attempts force row level security;

create function public.protect_direct_payment_settlement_attempt()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'direct payment settlement attempts are append-only'
      using errcode = '42501';
  end if;
  if old.id is distinct from new.id
     or old.task_id is distinct from new.task_id
     or old.claim_token is distinct from new.claim_token
     or old.attempt_number is distinct from new.attempt_number
     or old.lease_expires_at is distinct from new.lease_expires_at
     or old.claimed_at is distinct from new.claimed_at
     or old.outcome_status is not null
     or old.finished_at is not null
     or new.outcome_status is null
     or new.finished_at is null then
    raise exception 'direct payment settlement attempt transition is invalid'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger protect_direct_payment_settlement_attempt_trigger
before update or delete on public.billing_direct_payment_settlement_attempts
for each row execute function public.protect_direct_payment_settlement_attempt();

revoke all on function public.protect_direct_payment_settlement_attempt()
  from public, anon, authenticated, service_role;

-- This AFTER trigger extends the connected projector transaction without
-- copying that large RPC. Lock order is payment -> invoice, matching the
-- existing payment mutation trigger. It intentionally does not lock line-item
-- rows after the invoice: the open direct snapshot's existing item trigger
-- serializes every mutation on this same invoice lock, avoiding an
-- item -> invoice / invoice -> item deadlock.
create function public.enqueue_one_off_direct_payment_settlement()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $$
declare
  v_invoice public.invoices%rowtype;
  v_operation public.billing_payment_operations%rowtype;
  v_billing_event_ids uuid[];
  v_billing_event_id uuid;
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
  if old.charge_model is distinct from 'direct'
     or new.charge_model is distinct from 'direct'
     or old.status::text is distinct from 'processing'
     or new.status::text is distinct from 'paid'
     or old.paid_at is not null
     or new.paid_at is null
     or old.stripe_account_id is distinct from new.stripe_account_id
     or old.stripe_livemode is distinct from new.stripe_livemode
     or old.stripe_checkout_session is distinct from new.stripe_checkout_session
     or old.fee_plan_code is distinct from new.fee_plan_code
     or old.fee_catalog_version is distinct from new.fee_catalog_version
     or old.fee_rate_bps is distinct from new.fee_rate_bps
     or old.fee_rate is distinct from new.fee_rate
     or old.fee_basis_amount is distinct from new.fee_basis_amount
     or old.platform_fee is distinct from new.platform_fee
     or (old.stripe_payment_intent is not null
       and old.stripe_payment_intent is distinct from new.stripe_payment_intent)
     or (old.stripe_charge_id is not null
       and old.stripe_charge_id is distinct from new.stripe_charge_id)
     or (old.stripe_application_fee_id is not null
       and old.stripe_application_fee_id is distinct from new.stripe_application_fee_id)
     or (old.stripe_balance_transaction_id is not null
       and old.stripe_balance_transaction_id is distinct from new.stripe_balance_transaction_id) then
    raise exception 'direct settlement requires the exact processing-to-paid transition'
      using errcode = '55000';
  end if;

  if new.invoice_id is null
     or new.kind::text not in ('deposit', 'stage', 'final')
     or new.payment_plan_id is not null
     or new.recurring_plan_id is not null
     or new.installment_seq is not null
     or new.due_date is not null
     or new.imported is distinct from false
     or new.amount <= 0
     or new.refunded_amount is distinct from 0
     or new.eligible_service_refunded_amount is distinct from 0
     or new.platform_fee_refunded is distinct from 0
     or new.refunded_at is not null
     or new.stripe_latest_refund_id is not null
     or new.stripe_latest_application_fee_refund_id is not null then
    raise exception 'direct settlement supports only an unrefunded one-off invoice payment'
      using errcode = '0A000';
  end if;

  if new.stripe_account_id is null
     or new.stripe_account_id !~ '^acct_[A-Za-z0-9]{8,}$'
     or new.stripe_livemode is null
     or new.stripe_checkout_session is null
     or new.stripe_checkout_session !~ '^cs_[A-Za-z0-9_]+$'
     or new.stripe_payment_intent is null
     or new.stripe_payment_intent !~ '^pi_[A-Za-z0-9_]+$'
     or new.stripe_charge_id is null
     or new.stripe_charge_id !~ '^ch_[A-Za-z0-9_]+$'
     or new.reconciliation_status is null
     or new.reconciliation_status not in ('pending', 'reconciled')
     or (
       new.stripe_application_fee_id is not null
       and new.stripe_application_fee_id !~ '^fee_[A-Za-z0-9_]+$'
     )
     or (new.platform_fee = 0 and new.stripe_application_fee_id is not null)
     or (
       new.stripe_balance_transaction_id is not null
       and new.stripe_balance_transaction_id !~ '^txn_[A-Za-z0-9_]+$'
     )
     or (
       new.reconciliation_status = 'reconciled'
       and (
         new.stripe_balance_transaction_id is null
         or (new.platform_fee > 0 and new.stripe_application_fee_id is null)
       )
     ) then
    raise exception 'direct settlement provider evidence is incomplete or contradictory'
      using errcode = '22000';
  end if;

  perform 1
    from public.accounts a
   where a.id = new.account_id
     and a.stripe_merchant_account_id = new.stripe_account_id
     and a.merchant_livemode = new.stripe_livemode
   for key share;
  if not found then
    raise exception 'direct settlement Merchant mapping changed'
      using errcode = '55000';
  end if;

  perform 1
    from public.jobs j
   where j.id = new.job_id
     and j.account_id = new.account_id
   for key share;
  if not found then
    raise exception 'direct settlement job scope changed'
      using errcode = '55000';
  end if;

  -- The existing BEFORE payment trigger has already acquired this invoice lock
  -- after the payment row. Re-selecting FOR UPDATE asserts ownership and makes
  -- the dependency explicit without reversing lock order.
  select i.*
    into v_invoice
    from public.invoices i
   where i.id = new.invoice_id
   for update;
  if not found
     or v_invoice.account_id is distinct from new.account_id
     or v_invoice.job_id is distinct from new.job_id
     or v_invoice.status::text not in ('sent', 'signed')
     or v_invoice.total <= 0
     or v_invoice.discount_percent not between 0 and 100
     or v_invoice.tax_rate not between 0 and 100 then
    raise exception 'direct settlement invoice is outside the exact payable scope'
      using errcode = '55000';
  end if;

  select pg_catalog.count(*),
         pg_catalog.round(coalesce(pg_catalog.sum(ii.amount), 0), 2)
    into v_item_count, v_subtotal
    from public.invoice_items ii
   where ii.invoice_id = new.invoice_id;
  if v_item_count = 0 or exists (
    select 1 from public.invoice_items ii
     where ii.invoice_id = new.invoice_id and ii.amount <= 0
  ) then
    raise exception 'direct settlement invoice requires positive canonical line items'
      using errcode = '55000';
  end if;

  v_discount_amount := pg_catalog.round(
    v_subtotal * v_invoice.discount_percent / 100,
    2
  );
  v_eligible_subtotal := pg_catalog.round(v_subtotal - v_discount_amount, 2);
  v_tax_amount := pg_catalog.round(
    v_eligible_subtotal * v_invoice.tax_rate / 100,
    2
  );
  v_reconciled_total := pg_catalog.round(v_eligible_subtotal + v_tax_amount, 2);
  if v_invoice.total is distinct from v_reconciled_total
     or v_eligible_subtotal < 0
     or v_eligible_subtotal > v_invoice.total then
    raise exception 'direct settlement invoice arithmetic no longer reconciles'
      using errcode = '22000';
  end if;

  if exists (
    select 1
      from public.payments p
     where p.invoice_id = new.invoice_id
       and p.id <> new.id
       and (
         p.status::text in ('requested', 'processing', 'failed', 'disputed')
         or p.charge_model = 'direct'
         or p.payment_plan_id is not null
         or p.recurring_plan_id is not null
         or p.kind::text = 'plan_installment'
         or (p.stripe_checkout_session is not null and p.status::text not in ('paid', 'refunded'))
         or (p.stripe_payment_intent is not null and p.status::text not in ('paid', 'refunded'))
       )
  ) then
    raise exception 'direct settlement invoice has a competing payment scope'
      using errcode = '55000';
  end if;

  select pg_catalog.round(coalesce(pg_catalog.sum(
           case when p.status::text = 'paid'
             then p.amount - p.refunded_amount
             else 0 end
         ), 0), 2)
    into v_prior_paid
    from public.payments p
   where p.invoice_id = new.invoice_id
     and p.id <> new.id;
  if v_prior_paid < 0
     or v_prior_paid >= v_invoice.total
     or new.amount is distinct from pg_catalog.round(v_invoice.total - v_prior_paid, 2)
     or pg_catalog.round(v_prior_paid + new.amount, 2) is distinct from v_invoice.total then
    raise exception 'direct settlement payment is not the exact full outstanding invoice balance'
      using errcode = '55000';
  end if;

  v_expected_bps := case new.fee_plan_code
    when 'flex' then 125
    when 'solo' then 50
    when 'growth' then 25
    when 'scale' then 10
    else null
  end;
  if v_expected_bps is null
     or new.fee_catalog_version is null
     or new.fee_rate_bps is null
     or new.fee_rate is null
     or new.fee_basis_amount is null
     or new.platform_fee is null
     or new.fee_catalog_version is distinct from '2026-08-15-preview'
     or new.fee_rate_bps is distinct from v_expected_bps
     or new.fee_rate is distinct from v_expected_bps::numeric / 10000 then
    raise exception 'direct settlement frozen fee snapshot is non-canonical'
      using errcode = '22000';
  end if;

  v_invoice_total_cents := (v_invoice.total * 100)::bigint;
  v_prior_paid_cents := (v_prior_paid * 100)::bigint;
  v_eligible_total_cents := (v_eligible_subtotal * 100)::bigint;
  v_expected_fee_basis_cents := v_eligible_total_cents - case
    when v_prior_paid_cents = 0 or v_eligible_total_cents = 0 then 0
    else pg_catalog.round(
      v_prior_paid_cents::numeric * v_eligible_total_cents::numeric
        / v_invoice_total_cents::numeric,
      0
    )::bigint
  end;
  v_expected_fee_cents := pg_catalog.round(
    v_expected_fee_basis_cents::numeric * v_expected_bps::numeric / 10000,
    0
  )::bigint;
  if (new.fee_basis_amount * 100)::bigint is distinct from v_expected_fee_basis_cents
     or (new.platform_fee * 100)::bigint is distinct from v_expected_fee_cents
     or v_expected_fee_basis_cents < 0
     or v_expected_fee_basis_cents > (new.amount * 100)::bigint
     or v_expected_fee_cents < 0
     or v_expected_fee_cents > v_expected_fee_basis_cents then
    raise exception 'direct settlement fee allocation no longer matches invoice scope'
      using errcode = '22000';
  end if;

  select o.*
    into v_operation
    from public.billing_payment_operations o
   where o.payment_id = new.id
     and o.account_id = new.account_id
     and o.operation_type = 'checkout_session.create'
   for share;
  if not found
     or v_operation.state is distinct from 'succeeded'
     or v_operation.provider_object_id is distinct from new.stripe_checkout_session
     or v_operation.stripe_account_id is distinct from new.stripe_account_id
     or v_operation.livemode is distinct from new.stripe_livemode
     or v_operation.charge_model is distinct from 'direct'
     or v_operation.completed_at is null then
    raise exception 'direct settlement has no exact succeeded Checkout operation'
      using errcode = '22000';
  end if;

  -- The projector still owns one unexpired inbox claim when it updates the
  -- payment. Binding the task to that exact minimized event prevents an
  -- unrelated service-role UPDATE from manufacturing settlement work.
  select pg_catalog.array_agg(e.id order by e.id)
    into v_billing_event_ids
    from public.billing_events e
   where e.provider = 'stripe'
     and e.event_scope = 'connected_payment'
     and e.event_type = 'checkout.session.completed'
     and e.processing_status = 'processing'
     and e.account_id = new.account_id
     and e.provider_account_id = new.stripe_account_id
     and e.livemode = new.stripe_livemode
     and e.provider_created_at >= new.paid_at
     and e.projection_claim_token is not null
     and e.projection_lease_expires_at > pg_catalog.now()
     and e.payload #>> '{schema}' = 'lgq.stripe-event-inbox.v1'
     and e.payload #>> '{scope}' = 'connected_payment'
     and e.payload #>> '{event,id}' = e.provider_event_id
     and e.payload #>> '{event,type}' = e.event_type
     and e.payload #>> '{event,account}' = e.provider_account_id
     and e.payload #> '{event,livemode}' = pg_catalog.to_jsonb(e.livemode)
     and e.payload #>> '{data_object,id}' = new.stripe_checkout_session
     and e.payload #>> '{data_object,object}' = 'checkout.session';
  if pg_catalog.cardinality(v_billing_event_ids) is distinct from 1 then
    raise exception 'direct settlement requires exactly one owned connected payment event'
      using errcode = '55000';
  end if;
  v_billing_event_id := v_billing_event_ids[1];

  update public.invoices i
     set status = 'paid',
         signed_at = coalesce(i.signed_at, new.paid_at)
   where i.id = v_invoice.id
     and i.account_id = new.account_id
     and i.job_id = new.job_id
     and i.status::text in ('sent', 'signed');
  if not found then
    raise exception 'direct settlement invoice transition was lost'
      using errcode = '55000';
  end if;

  insert into public.billing_direct_payment_settlement_tasks (
    payment_id, billing_event_id, account_id, job_id, invoice_id, settled_at
  ) values (
    new.id, v_billing_event_id, new.account_id, new.job_id, new.invoice_id, new.paid_at
  );

  return new;
end;
$$;

create trigger enqueue_one_off_direct_payment_settlement_trigger
after update of status, paid_at, stripe_payment_intent, stripe_charge_id,
  stripe_application_fee_id, stripe_balance_transaction_id,
  reconciliation_status, reconciled_at
on public.payments
for each row
when (
  old.charge_model = 'direct'
  and new.charge_model = 'direct'
  and old.status::text = 'processing'
  and new.status::text = 'paid'
)
execute function public.enqueue_one_off_direct_payment_settlement();

revoke all on function public.enqueue_one_off_direct_payment_settlement()
  from public, anon, authenticated, service_role;

create function public.claim_direct_payment_settlement_tasks(
  p_batch_size integer
)
returns table (
  work_claim_token uuid,
  task_id uuid,
  payment_id uuid,
  workspace_id uuid,
  job_id uuid,
  invoice_id uuid,
  billing_event_id uuid,
  settled_at timestamptz,
  feed_status text,
  sms_status text,
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
  v_task public.billing_direct_payment_settlement_tasks%rowtype;
  v_claim_token uuid;
  v_lease_expires_at timestamptz;
  v_updated integer;
begin
  if p_batch_size is null or p_batch_size not between 1 and 25 then
    raise exception 'direct settlement batch size must be between 1 and 25'
      using errcode = '22023';
  end if;

  for v_task in
    select t.*
      from public.billing_direct_payment_settlement_tasks t
     where t.task_state = 'ready'
        or (t.task_state = 'retry_wait' and t.next_attempt_at <= v_now)
        or (t.task_state = 'leased' and t.lease_expires_at <= v_now)
     order by t.created_at, t.id
     limit p_batch_size
     for update skip locked
  loop
    if v_task.task_state = 'leased' then
      if v_task.sms_status = 'dispatching' then
        update public.sms_events s
           set status = 'indeterminate',
               error_reason = 'settlement_sms_delivery_unknown_after_lease_expiry'
         where s.id = v_task.sms_event_id
           and s.payment_id = v_task.payment_id
           and s.event_type = 'payment_paid'
           and s.status = 'pending';
        get diagnostics v_updated = row_count;
        if v_updated <> 1 then
          raise exception 'stale settlement SMS has no exact pending event'
            using errcode = '55000';
        end if;

        update public.billing_direct_payment_settlement_attempts a
           set outcome_status = 'sms_indeterminate',
               error_code = 'sms_delivery_unknown_after_lease_expiry',
               feed_status = v_task.feed_status,
               sms_status = 'indeterminate',
               finished_at = v_now
         where a.claim_token = v_task.claim_token
           and a.outcome_status is null;
        get diagnostics v_updated = row_count;
        if v_updated <> 1 then
          raise exception 'stale settlement SMS lease has no open attempt'
            using errcode = '55000';
        end if;

        update public.billing_direct_payment_settlement_tasks t
           set task_state = 'dead_letter',
               claim_token = null,
               lease_expires_at = null,
               next_attempt_at = null,
               sms_status = 'indeterminate',
               last_error_code = 'sms_delivery_unknown_after_lease_expiry',
               dead_lettered_at = v_now,
               updated_at = v_now
         where t.id = v_task.id;
        continue;
      end if;

      update public.billing_direct_payment_settlement_attempts a
         set outcome_status = case
               when v_task.attempt_count >= 8 then 'failed_terminal'
               else 'failed_retryable'
             end,
             error_code = case
               when v_task.attempt_count >= 8 then 'worker_lease_expired_attempt_limit'
               else 'worker_lease_expired'
             end,
             feed_status = v_task.feed_status,
             sms_status = v_task.sms_status,
             finished_at = v_now
       where a.claim_token = v_task.claim_token
         and a.outcome_status is null;
      get diagnostics v_updated = row_count;
      if v_updated <> 1 then
        raise exception 'expired settlement lease has no open attempt'
          using errcode = '55000';
      end if;

      if v_task.attempt_count >= 8 then
        update public.billing_direct_payment_settlement_tasks t
           set task_state = 'dead_letter',
               claim_token = null,
               lease_expires_at = null,
               next_attempt_at = null,
               last_error_code = 'worker_lease_expired_attempt_limit',
               dead_lettered_at = v_now,
               updated_at = v_now
         where t.id = v_task.id;
        continue;
      end if;
    end if;

    if v_task.attempt_count >= 8 then
      update public.billing_direct_payment_settlement_tasks t
         set task_state = 'dead_letter',
             claim_token = null,
             lease_expires_at = null,
             next_attempt_at = null,
             last_error_code = 'worker_attempt_limit_reached',
             dead_lettered_at = v_now,
             updated_at = v_now
       where t.id = v_task.id;
      continue;
    end if;

    v_claim_token := pg_catalog.gen_random_uuid();
    v_lease_expires_at := v_now + interval '5 minutes';

    update public.billing_direct_payment_settlement_tasks t
       set task_state = 'leased',
           claim_token = v_claim_token,
           lease_expires_at = v_lease_expires_at,
           attempt_count = t.attempt_count + 1,
           next_attempt_at = null,
           last_error_code = null,
           dead_lettered_at = null,
           updated_at = v_now
     where t.id = v_task.id
     returning t.* into v_task;

    insert into public.billing_direct_payment_settlement_attempts (
      task_id, claim_token, attempt_number, lease_expires_at, claimed_at
    ) values (
      v_task.id, v_claim_token, v_task.attempt_count, v_lease_expires_at, v_now
    );

    return query select
      v_claim_token,
      v_task.id,
      v_task.payment_id,
      v_task.account_id,
      v_task.job_id,
      v_task.invoice_id,
      v_task.billing_event_id,
      v_task.settled_at,
      v_task.feed_status,
      v_task.sms_status,
      v_task.attempt_count,
      v_lease_expires_at;
  end loop;
end;
$$;

-- Feed recording is an independent, idempotent database outcome. It never
-- changes jobs; the source-key uniqueness is the same invariant used by the
-- existing timeline writer.
create function public.record_direct_payment_settlement_feed(
  p_task_id uuid,
  p_claim_token uuid
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_task public.billing_direct_payment_settlement_tasks%rowtype;
  v_payment public.payments%rowtype;
  v_feed public.job_feed%rowtype;
begin
  select t.* into v_task
    from public.billing_direct_payment_settlement_tasks t
   where t.id = p_task_id
   for update;
  if not found
     or v_task.task_state <> 'leased'
     or v_task.claim_token is distinct from p_claim_token
     or v_task.lease_expires_at <= v_now then
    raise exception 'direct settlement feed claim is not owned or expired'
      using errcode = '55000';
  end if;
  if v_task.feed_status = 'recorded' then
    return 'recorded';
  end if;

  select p.* into v_payment
    from public.payments p
   where p.id = v_task.payment_id
     and p.account_id = v_task.account_id
   for share;
  if not found
     or v_payment.job_id is distinct from v_task.job_id
     or v_payment.invoice_id is distinct from v_task.invoice_id
     or v_payment.charge_model <> 'direct'
     or v_payment.status::text <> 'paid'
     or v_payment.paid_at is distinct from v_task.settled_at then
    raise exception 'direct settlement feed payment scope changed'
      using errcode = '55000';
  end if;

  insert into public.job_feed (
    account_id, job_id, kind, title, body, author, visibility, amount,
    source_table, source_id, action_url, published_at, created_at
  ) values (
    v_task.account_id,
    v_task.job_id,
    'payment_paid',
    'Payment received',
    v_payment.label,
    'Owner',
    'client_financial',
    v_payment.amount,
    'payments',
    v_payment.id,
    '/pay/' || v_payment.id::text,
    v_task.settled_at,
    v_task.settled_at
  )
  on conflict (source_table, source_id, kind)
    where source_table is not null and source_id is not null
  do nothing;

  select f.* into v_feed
    from public.job_feed f
   where f.source_table = 'payments'
     and f.source_id = v_payment.id
     and f.kind = 'payment_paid';
  if not found
     or v_feed.account_id is distinct from v_task.account_id
     or v_feed.job_id is distinct from v_task.job_id
     or v_feed.title is distinct from 'Payment received'
     or v_feed.body is distinct from v_payment.label
     or v_feed.visibility is distinct from 'client_financial'
     or v_feed.amount is distinct from v_payment.amount
     or v_feed.action_url is distinct from '/pay/' || v_payment.id::text then
    raise exception 'direct settlement feed outcome conflicts with payment truth'
      using errcode = '22000';
  end if;

  update public.billing_direct_payment_settlement_tasks t
     set feed_status = 'recorded',
         updated_at = v_now
   where t.id = v_task.id;
  return 'recorded';
end;
$$;

create function public.stage_direct_payment_settlement_sms(
  p_task_id uuid,
  p_claim_token uuid,
  p_normalized_phone text,
  p_body text
)
returns table (
  dispatch_status text,
  sms_event_id uuid,
  phone_number text
)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_task public.billing_direct_payment_settlement_tasks%rowtype;
  v_payment public.payments%rowtype;
  v_consent public.sms_consent%rowtype;
  v_sms public.sms_events%rowtype;
  v_digits text;
  v_expected_phone text;
  v_outcome text;
  v_updated integer;
  v_sms_exists boolean := false;
begin
  select t.* into v_task
    from public.billing_direct_payment_settlement_tasks t
   where t.id = p_task_id
   for update;
  if not found
     or v_task.task_state <> 'leased'
     or v_task.claim_token is distinct from p_claim_token
     or v_task.lease_expires_at <= v_now
     or v_task.feed_status <> 'recorded'
     or v_task.sms_status <> 'pending' then
    raise exception 'direct settlement SMS claim is not ready, owned, or current'
      using errcode = '55000';
  end if;

  select p.* into v_payment
    from public.payments p
   where p.id = v_task.payment_id
     and p.account_id = v_task.account_id
   for share;
  if not found
     or v_payment.job_id is distinct from v_task.job_id
     or v_payment.invoice_id is distinct from v_task.invoice_id
     or v_payment.charge_model <> 'direct'
     or v_payment.status::text <> 'paid'
     or v_payment.paid_at is distinct from v_task.settled_at then
    raise exception 'direct settlement SMS payment scope changed'
      using errcode = '55000';
  end if;

  -- Inspect the one-per-payment SMS ledger before any no-consent fast path.
  -- A stale pending/failed row remains ambiguous even if consent has since
  -- changed; quarantine it rather than leaving retry-looking evidence behind.
  select s.* into v_sms
    from public.sms_events s
   where s.payment_id = v_task.payment_id
     and s.event_type = 'payment_paid'
   for update;
  v_sms_exists := found;
  if v_sms_exists then
    if v_sms.account_id is distinct from v_task.account_id then
      raise exception 'existing settlement SMS conflicts with current payment scope'
        using errcode = '22000';
    end if;

    if v_sms.status not in ('sent', 'opted_out') then
      update public.sms_events s
         set status = 'indeterminate',
             error_reason = 'settlement_sms_existing_nonterminal_outcome'
       where s.id = v_sms.id;
      update public.billing_direct_payment_settlement_tasks t
         set task_state = 'dead_letter', claim_token = null,
             lease_expires_at = null, next_attempt_at = null,
             sms_status = 'indeterminate', sms_event_id = v_sms.id,
             last_error_code = 'sms_existing_nonterminal_outcome',
             dead_lettered_at = v_now, updated_at = v_now
       where t.id = v_task.id;
      update public.billing_direct_payment_settlement_attempts a
         set outcome_status = 'sms_indeterminate',
             error_code = 'sms_existing_nonterminal_outcome',
             feed_status = 'recorded', sms_status = 'indeterminate', finished_at = v_now
       where a.claim_token = p_claim_token and a.outcome_status is null;
      get diagnostics v_updated = row_count;
      if v_updated <> 1 then
        raise exception 'indeterminate settlement SMS has no open attempt'
          using errcode = '55000';
      end if;
      return query select 'indeterminate'::text, v_sms.id, null::text;
      return;
    end if;
  end if;

  if v_payment.sms_consent is distinct from true
     or v_payment.homeowner_phone is null
     or pg_catalog.length(pg_catalog.btrim(v_payment.homeowner_phone)) = 0 then
    v_outcome := 'skipped_no_consent';
  else
    v_digits := pg_catalog.regexp_replace(v_payment.homeowner_phone, '[^0-9]', '', 'g');
    v_expected_phone := case
      when pg_catalog.length(v_digits) = 10 then '+1' || v_digits
      when pg_catalog.length(v_digits) = 11 and v_digits like '1%' then '+' || v_digits
      when v_payment.homeowner_phone like '+%'
        and pg_catalog.length(v_digits) between 10 and 15 then '+' || v_digits
      else null
    end;
    if v_expected_phone is null
       or p_normalized_phone is distinct from v_expected_phone
       or p_normalized_phone !~ '^\+[0-9]{10,15}$'
       or p_body is null
       or pg_catalog.length(p_body) not between 1 and 1600
       or p_body ~ '[[:cntrl:]]' then
      raise exception 'direct settlement SMS envelope is invalid'
        using errcode = '22023';
    end if;

    select c.* into v_consent
      from public.sms_consent c
     where c.account_id = v_task.account_id
       and c.phone_number = p_normalized_phone
     for share;
    if not found
       or v_consent.status <> 'opted_in'
       or v_consent.consented_at is null
       or v_consent.opted_out_at is not null then
      v_outcome := case
        when found and v_consent.status = 'opted_out' then 'skipped_opted_out'
        else 'skipped_no_consent'
      end;
    end if;
  end if;

  if v_outcome is not null then
    update public.billing_direct_payment_settlement_tasks t
       set task_state = 'completed',
           claim_token = null,
           lease_expires_at = null,
           next_attempt_at = null,
           sms_status = v_outcome,
           last_error_code = null,
           completed_at = v_now,
           updated_at = v_now
     where t.id = v_task.id;

    update public.billing_direct_payment_settlement_attempts a
       set outcome_status = 'completed',
           feed_status = 'recorded',
           sms_status = v_outcome,
           finished_at = v_now
     where a.claim_token = p_claim_token
       and a.outcome_status is null;
    get diagnostics v_updated = row_count;
    if v_updated <> 1 then
      raise exception 'direct settlement SMS skip has no open attempt'
        using errcode = '55000';
    end if;

    return query select v_outcome, null::uuid, null::text;
    return;
  end if;

  if v_sms_exists then
    if v_sms.phone_number is distinct from p_normalized_phone
       or v_sms.body is distinct from p_body then
      raise exception 'existing settlement SMS conflicts with current envelope'
        using errcode = '22000';
    end if;

    if v_sms.status = 'sent' then
      update public.billing_direct_payment_settlement_tasks t
         set task_state = 'completed', claim_token = null,
             lease_expires_at = null, next_attempt_at = null,
             sms_status = 'sent', sms_event_id = v_sms.id,
             last_error_code = null, completed_at = v_now, updated_at = v_now
       where t.id = v_task.id;
      update public.billing_direct_payment_settlement_attempts a
         set outcome_status = 'completed', feed_status = 'recorded',
             sms_status = 'sent', finished_at = v_now
       where a.claim_token = p_claim_token and a.outcome_status is null;
      get diagnostics v_updated = row_count;
      if v_updated <> 1 then
        raise exception 'already-sent settlement SMS has no open attempt'
          using errcode = '55000';
      end if;
      return query select 'already_sent'::text, v_sms.id, null::text;
      return;
    end if;

    if v_sms.status = 'opted_out' then
      update public.billing_direct_payment_settlement_tasks t
         set task_state = 'completed', claim_token = null,
             lease_expires_at = null, next_attempt_at = null,
             sms_status = 'skipped_opted_out', sms_event_id = null,
             last_error_code = null, completed_at = v_now, updated_at = v_now
       where t.id = v_task.id;
      update public.billing_direct_payment_settlement_attempts a
         set outcome_status = 'completed', feed_status = 'recorded',
             sms_status = 'skipped_opted_out', finished_at = v_now
       where a.claim_token = p_claim_token and a.outcome_status is null;
      get diagnostics v_updated = row_count;
      if v_updated <> 1 then
        raise exception 'opted-out settlement SMS has no open attempt'
          using errcode = '55000';
      end if;
      return query select 'skipped_opted_out'::text, null::uuid, null::text;
      return;
    end if;

    raise exception 'existing settlement SMS has an unsupported terminal status'
      using errcode = '22000';
  end if;

  insert into public.sms_events (
    account_id, payment_id, event_type, phone_number, status, body, context
  ) values (
    v_task.account_id, v_task.payment_id, 'payment_paid',
    p_normalized_phone, 'pending', p_body, 'payment'
  ) returning * into v_sms;

  update public.billing_direct_payment_settlement_tasks t
     set sms_status = 'dispatching',
         sms_event_id = v_sms.id,
         updated_at = v_now
   where t.id = v_task.id;

  return query select 'dispatch'::text, v_sms.id, p_normalized_phone;
end;
$$;

create function public.complete_direct_payment_settlement_sms(
  p_task_id uuid,
  p_claim_token uuid,
  p_sms_event_id uuid,
  p_provider_id text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_task public.billing_direct_payment_settlement_tasks%rowtype;
  v_updated integer;
begin
  if p_provider_id is null
     or pg_catalog.length(pg_catalog.btrim(p_provider_id)) not between 1 and 255
     or p_provider_id ~ '[[:cntrl:]]' then
    raise exception 'direct settlement SMS provider ID is invalid'
      using errcode = '22023';
  end if;

  select t.* into v_task
    from public.billing_direct_payment_settlement_tasks t
   where t.id = p_task_id
   for update;
  if not found
     or v_task.task_state <> 'leased'
     or v_task.claim_token is distinct from p_claim_token
     or v_task.lease_expires_at <= v_now
     or v_task.feed_status <> 'recorded'
     or v_task.sms_status <> 'dispatching'
     or v_task.sms_event_id is distinct from p_sms_event_id then
    raise exception 'direct settlement SMS completion claim is not owned or current'
      using errcode = '55000';
  end if;

  update public.sms_events s
     set status = 'sent',
         provider_id = p_provider_id,
         sent_at = v_now,
         error_reason = null
   where s.id = p_sms_event_id
     and s.account_id = v_task.account_id
     and s.payment_id = v_task.payment_id
     and s.event_type = 'payment_paid'
     and s.status = 'pending';
  get diagnostics v_updated = row_count;
  if v_updated <> 1 then
    raise exception 'direct settlement SMS completion has no exact pending event'
      using errcode = '55000';
  end if;

  update public.billing_direct_payment_settlement_tasks t
     set task_state = 'completed',
         claim_token = null,
         lease_expires_at = null,
         next_attempt_at = null,
         sms_status = 'sent',
         last_error_code = null,
         completed_at = v_now,
         updated_at = v_now
   where t.id = v_task.id;

  update public.billing_direct_payment_settlement_attempts a
     set outcome_status = 'completed',
         feed_status = 'recorded',
         sms_status = 'sent',
         finished_at = v_now
   where a.claim_token = p_claim_token
     and a.outcome_status is null;
  get diagnostics v_updated = row_count;
  if v_updated <> 1 then
    raise exception 'direct settlement SMS completion has no open attempt'
      using errcode = '55000';
  end if;
  return true;
end;
$$;

create function public.fail_direct_payment_settlement_task(
  p_task_id uuid,
  p_claim_token uuid,
  p_error_code text,
  p_retryable boolean
)
returns table (
  failure_status text,
  task_state text,
  next_attempt_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_task public.billing_direct_payment_settlement_tasks%rowtype;
  v_next_attempt_at timestamptz;
  v_outcome text;
  v_updated integer;
begin
  if p_error_code is null
     or p_error_code !~ '^[a-z][a-z0-9_]{2,99}$'
     or p_retryable is null then
    raise exception 'direct settlement failure contract is invalid'
      using errcode = '22023';
  end if;

  select t.* into v_task
    from public.billing_direct_payment_settlement_tasks t
   where t.id = p_task_id
   for update;
  if not found then
    raise exception 'direct settlement task was not found' using errcode = 'P0002';
  end if;
  if v_task.task_state in ('completed', 'dead_letter') then
    return query select 'already_finished'::text, v_task.task_state, null::timestamptz;
    return;
  end if;
  if v_task.task_state <> 'leased'
     or v_task.claim_token is distinct from p_claim_token
     or v_task.lease_expires_at <= v_now then
    raise exception 'direct settlement failure claim is not owned or expired'
      using errcode = '55000';
  end if;

  if v_task.sms_status = 'dispatching' then
    update public.sms_events s
       set status = 'indeterminate',
           error_reason = 'settlement_sms_provider_result_unknown'
     where s.id = v_task.sms_event_id
       and s.payment_id = v_task.payment_id
       and s.event_type = 'payment_paid'
       and s.status = 'pending';
    get diagnostics v_updated = row_count;
    if v_updated <> 1 then
      raise exception 'ambiguous settlement SMS has no exact pending event'
        using errcode = '55000';
    end if;
    v_outcome := 'sms_indeterminate';
    p_error_code := 'sms_provider_result_unknown';

    update public.billing_direct_payment_settlement_tasks t
       set task_state = 'dead_letter', claim_token = null,
           lease_expires_at = null, next_attempt_at = null,
           sms_status = 'indeterminate', last_error_code = p_error_code,
           dead_lettered_at = v_now, updated_at = v_now
     where t.id = v_task.id;
  elsif p_retryable and v_task.attempt_count < 8 then
    v_outcome := 'failed_retryable';
    v_next_attempt_at := v_now + pg_catalog.make_interval(
      mins => least(60, (5 * pg_catalog.power(2, v_task.attempt_count - 1))::integer)
    );
    update public.billing_direct_payment_settlement_tasks t
       set task_state = 'retry_wait', claim_token = null,
           lease_expires_at = null, next_attempt_at = v_next_attempt_at,
           last_error_code = p_error_code, updated_at = v_now
     where t.id = v_task.id;
  else
    v_outcome := 'failed_terminal';
    update public.billing_direct_payment_settlement_tasks t
       set task_state = 'dead_letter', claim_token = null,
           lease_expires_at = null, next_attempt_at = null,
           last_error_code = case
             when p_retryable then 'worker_attempt_limit_reached'
             else p_error_code
           end,
           dead_lettered_at = v_now, updated_at = v_now
     where t.id = v_task.id;
    if p_retryable then p_error_code := 'worker_attempt_limit_reached'; end if;
  end if;

  update public.billing_direct_payment_settlement_attempts a
     set outcome_status = v_outcome,
         error_code = p_error_code,
         feed_status = v_task.feed_status,
         sms_status = case
           when v_outcome = 'sms_indeterminate' then 'indeterminate'
           else v_task.sms_status
         end,
         finished_at = v_now
   where a.claim_token = p_claim_token
     and a.outcome_status is null;
  get diagnostics v_updated = row_count;
  if v_updated <> 1 then
    raise exception 'direct settlement failure has no open attempt'
      using errcode = '55000';
  end if;

  return query select v_outcome, case
    when v_outcome = 'failed_retryable' then 'retry_wait'
    else 'dead_letter'
  end, v_next_attempt_at;
end;
$$;

revoke all on table public.billing_direct_payment_settlement_tasks
  from public, anon, authenticated, service_role;
revoke all on table public.billing_direct_payment_settlement_attempts
  from public, anon, authenticated, service_role;

revoke all on function public.claim_direct_payment_settlement_tasks(integer)
  from public, anon, authenticated, service_role;
revoke all on function public.record_direct_payment_settlement_feed(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.stage_direct_payment_settlement_sms(uuid, uuid, text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.complete_direct_payment_settlement_sms(uuid, uuid, uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.fail_direct_payment_settlement_task(uuid, uuid, text, boolean)
  from public, anon, authenticated, service_role;

grant execute on function public.claim_direct_payment_settlement_tasks(integer)
  to service_role;
grant execute on function public.record_direct_payment_settlement_feed(uuid, uuid)
  to service_role;
grant execute on function public.stage_direct_payment_settlement_sms(uuid, uuid, text, text)
  to service_role;
grant execute on function public.complete_direct_payment_settlement_sms(uuid, uuid, uuid, text)
  to service_role;
grant execute on function public.fail_direct_payment_settlement_task(uuid, uuid, text, boolean)
  to service_role;

commit;
