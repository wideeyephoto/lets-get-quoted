-- Preserve text-credit/overage evidence before provider egress and reconcile
-- it after the durable delivery task reaches a known local outcome. A socket
-- can succeed while its response is lost; releasing the hold in that case can
-- make a carrier-delivered message free.

begin;

alter table public.sms_events
  add column if not exists text_usage_kind text,
  add column if not exists text_usage_reservation_id uuid
    references public.usage_reservations(id) on delete restrict,
  add column if not exists text_usage_finalization_key text,
  add column if not exists text_usage_overage_key text,
  add column if not exists text_usage_state text,
  add column if not exists text_usage_last_error text,
  add column if not exists text_usage_updated_at timestamptz;

alter table public.sms_events
  drop constraint if exists sms_events_text_usage_shape_check;
alter table public.sms_events
  add constraint sms_events_text_usage_shape_check check (
    (text_usage_kind is null
      and text_usage_reservation_id is null
      and text_usage_finalization_key is null
      and text_usage_overage_key is null
      and text_usage_state is null)
    or (text_usage_kind = 'reservation'
      and text_usage_reservation_id is not null
      and text_usage_finalization_key is not null
      and text_usage_overage_key is null
      and text_usage_state in ('held', 'committed', 'released', 'reconciliation_failed'))
    or (text_usage_kind = 'overage'
      and text_usage_reservation_id is null
      and text_usage_finalization_key is null
      and text_usage_overage_key is not null
      and text_usage_state in ('accrued', 'committed', 'released', 'reconciliation_failed'))
    or (text_usage_kind = 'unmetered'
      and text_usage_reservation_id is null
      and text_usage_finalization_key is null
      and text_usage_overage_key is null
      and text_usage_state = 'unmetered')
  );

create index if not exists sms_events_text_usage_reconcile_idx
  on public.sms_events (text_usage_updated_at, id)
  where text_usage_state in ('held', 'accrued', 'reconciliation_failed');

create or replace function public.mark_sms_delivery_request_started_with_usage(
  p_sms_event_id uuid,
  p_claim_token uuid,
  p_usage_kind text,
  p_reservation_id uuid,
  p_finalization_key text,
  p_overage_key text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $fn$
declare
  v_event public.sms_events%rowtype;
  v_task public.sms_delivery_tasks%rowtype;
  v_sender public.sms_sender_numbers%rowtype;
  v_consent public.sms_consent%rowtype;
  v_preference public.sms_sender_keyword_preferences%rowtype;
  v_reservation public.usage_reservations%rowtype;
  v_overage public.workspace_overage_accrual_events%rowtype;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if p_usage_kind not in ('reservation', 'overage', 'unmetered')
     or (p_usage_kind = 'reservation' and (
       p_reservation_id is null or p_finalization_key is null or p_overage_key is not null))
     or (p_usage_kind = 'overage' and (
       p_reservation_id is not null or p_finalization_key is not null or p_overage_key is null))
     or (p_usage_kind = 'unmetered' and (
       p_reservation_id is not null or p_finalization_key is not null or p_overage_key is not null)) then
    raise exception 'SMS text-usage evidence is malformed' using errcode = '22023';
  end if;

  select e.* into v_event
    from public.sms_events e
   where e.id = p_sms_event_id
   for update;
  select t.* into v_task
    from public.sms_delivery_tasks t
   where t.sms_event_id = p_sms_event_id
   for update;
  if v_event.id is null or v_task.sms_event_id is null
     or v_event.status <> 'queued'
     or v_task.task_state <> 'leased'
     or v_task.claim_token is distinct from p_claim_token
     or v_task.lease_expires_at <= v_now
     or v_task.request_started_at is not null then
    raise exception 'SMS delivery usage boundary is stale or invalid'
      using errcode = '55000';
  end if;

  -- `stage_sms_delivery` is an early filter, not the no-return boundary. Lock
  -- and prove the exact sender and consent again in the same transaction that
  -- records request_started_at. A STOP or suspension that commits before this
  -- boundary therefore wins; one trying concurrently waits behind these locks
  -- and observes request_started_at as the already-crossed boundary.
  select s.* into v_sender
    from public.sms_sender_numbers s
   where s.id = v_event.sender_number_id
     and s.provider = v_event.provider
     and s.purpose = v_event.sender_purpose
     and (s.account_id is null or s.account_id = v_event.account_id)
     and s.provisioning_status = 'active'
     and s.assignment_state = 'assigned'
     and s.inbound_ready
     and s.suspended_at is null
   for share;
  if not found then
    raise exception 'SMS sender became unavailable before provider request'
      using errcode = 'P5102';
  end if;

  -- This lock also covers the no-row sender-preference case. The inbound
  -- keyword transaction takes the same key before its upsert, so an INSERT of a
  -- first STOP preference cannot race this check as a phantom.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'sms-sender-consent:' || v_sender.id::text || ':' || v_event.phone_number,
      20260821
    )
  );

  select c.* into v_consent
    from public.sms_consent c
   where c.account_id = v_event.account_id
     and c.phone_number = v_event.phone_number
   for share;
  if not found
     or v_consent.status <> 'opted_in'
     or v_consent.consented_at is null
     or v_consent.opted_out_at is not null then
    raise exception 'SMS consent became unavailable before provider request'
      using errcode = 'P5101';
  end if;

  select p.* into v_preference
    from public.sms_sender_keyword_preferences p
   where p.sender_number_id = v_sender.id
     and p.phone_number = v_event.phone_number
   for share;
  if found and v_preference.status = 'opted_out'
     and v_preference.opted_out_at is not null then
    raise exception 'SMS sender preference became opted out before provider request'
      using errcode = 'P5103';
  end if;

  if p_usage_kind = 'reservation' then
    select r.* into v_reservation
      from public.usage_reservations r
     where r.id = p_reservation_id;
    if not found
       or v_reservation.account_id <> v_event.account_id
       or v_reservation.resource_code <> 'text_segments'
       or v_reservation.operation_type <> 'text_send'
       or v_reservation.state <> 'reserved'
       or p_finalization_key <> v_reservation.idempotency_key || ':commit' then
      raise exception 'SMS text reservation does not match this delivery'
        using errcode = '22000';
    end if;
  elsif p_usage_kind = 'overage' then
    select o.* into v_overage
      from public.workspace_overage_accrual_events o
     where o.account_id = v_event.account_id
       and o.idempotency_key = p_overage_key;
    if not found
       or v_overage.resource_code <> 'text_segments'
       or v_overage.released_at is not null then
      raise exception 'SMS text overage does not match this delivery'
        using errcode = '22000';
    end if;
  end if;

  update public.sms_events e
     set text_usage_kind = p_usage_kind,
         text_usage_reservation_id = p_reservation_id,
         text_usage_finalization_key = p_finalization_key,
         text_usage_overage_key = p_overage_key,
         text_usage_state = case p_usage_kind
           when 'reservation' then 'held'
           when 'overage' then 'accrued'
           else 'unmetered'
         end,
         text_usage_last_error = null,
         text_usage_updated_at = v_now
   where e.id = p_sms_event_id;

  -- The legacy two-argument function owns the already-proven task/event/attempt
  -- transition. Calling it here keeps evidence plus no-return boundary in one
  -- transaction without maintaining a second copy of that state machine.
  perform public.mark_sms_delivery_request_started(p_sms_event_id, p_claim_token);
  return true;
end
$fn$;

-- A request-start RPC can commit and then lose its response. The worker still
-- knows one useful fact: its provider fetch was never opened. This token-bound
-- compensator releases the exact persisted usage evidence and returns the
-- attempt to its pre-request state; fail_sms_delivery can then apply the normal
-- retry policy. If this compensator is itself uncertain, the started boundary
-- remains and fail_sms_delivery quarantines the task as indeterminate.
create or replace function public.rollback_sms_delivery_pre_request_boundary(
  p_sms_event_id uuid,
  p_claim_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $fn$
declare
  v_event public.sms_events%rowtype;
  v_task public.sms_delivery_tasks%rowtype;
  v_reservation public.usage_reservations%rowtype;
  v_overage public.workspace_overage_accrual_events%rowtype;
  v_released bigint;
  v_ok boolean;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  select e.* into v_event
    from public.sms_events e
   where e.id = p_sms_event_id
   for update;
  select t.* into v_task
    from public.sms_delivery_tasks t
   where t.sms_event_id = p_sms_event_id
   for update;
  if v_event.id is null or v_task.sms_event_id is null
     or v_task.task_state <> 'leased'
     or v_task.claim_token is distinct from p_claim_token
     or v_task.lease_expires_at <= v_now then
    raise exception 'SMS pre-request rollback lease is stale or invalid'
      using errcode = '55000';
  end if;

  -- The marker never committed. There is no durable boundary to undo and the
  -- send helper owns release of its local-only hold.
  if v_task.request_started_at is null then
    if v_event.text_usage_kind is not null then
      raise exception 'SMS pre-request usage exists without a request boundary'
        using errcode = '55000';
    end if;
    return true;
  end if;

  if v_event.status <> 'sending' or v_event.provider_id is not null
     or v_event.text_usage_kind is null then
    raise exception 'SMS pre-request boundary cannot be rolled back'
      using errcode = '55000';
  end if;

  if v_event.text_usage_kind = 'reservation' then
    select r.* into v_reservation
      from public.usage_reservations r
     where r.id = v_event.text_usage_reservation_id
       and r.account_id = v_event.account_id
     for update;
    if not found
       or v_reservation.resource_code <> 'text_segments'
       or v_reservation.operation_type <> 'text_send'
       or v_reservation.idempotency_key || ':commit'
            <> v_event.text_usage_finalization_key then
      raise exception 'SMS pre-request reservation is invalid'
        using errcode = '22000';
    end if;
    if v_reservation.state = 'reserved' then
      v_ok := public.release_usage_reservation(
        v_event.text_usage_reservation_id,
        v_event.text_usage_finalization_key,
        'provider_request_not_opened');
      if not v_ok then
        raise exception 'SMS pre-request reservation was not released'
          using errcode = '55000';
      end if;
    elsif v_reservation.state not in ('released', 'expired') then
      raise exception 'SMS pre-request reservation is already final'
        using errcode = '55000';
    end if;
  elsif v_event.text_usage_kind = 'overage' then
    select o.* into v_overage
      from public.workspace_overage_accrual_events o
     where o.account_id = v_event.account_id
       and o.idempotency_key = v_event.text_usage_overage_key
     for update;
    if not found or v_overage.resource_code <> 'text_segments' then
      raise exception 'SMS pre-request overage is invalid'
        using errcode = '22000';
    end if;
    if v_overage.released_at is null then
      v_released := public.release_usage_overage(
        v_event.account_id, v_event.text_usage_overage_key);
      if v_released <= 0 then
        raise exception 'SMS pre-request overage was not released'
          using errcode = '55000';
      end if;
    end if;
  elsif v_event.text_usage_kind <> 'unmetered' then
    raise exception 'SMS pre-request usage kind is invalid'
      using errcode = '22000';
  end if;

  update public.sms_events
     set status = 'queued', send_started_at = null,
         text_usage_kind = null,
         text_usage_reservation_id = null,
         text_usage_finalization_key = null,
         text_usage_overage_key = null,
         text_usage_state = null,
         text_usage_last_error = null,
         text_usage_updated_at = null,
         updated_at = v_now
   where id = p_sms_event_id;
  update public.sms_delivery_tasks
     set request_started_at = null, updated_at = v_now
   where sms_event_id = p_sms_event_id;
  update public.sms_delivery_attempts
     set request_started_at = null
   where claim_token = p_claim_token and outcome is null;
  if not found then
    raise exception 'SMS pre-request rollback has no open attempt'
      using errcode = '55000';
  end if;
  return true;
end
$fn$;

-- A definitive carrier rejection may be retried only after the exact usage
-- hold for this attempt is proven released. The send helper makes a best-effort
-- release, but a lost release response cannot authorize overwriting that
-- evidence with the next attempt. Re-prove/finalize it here in the same
-- transaction that requeues the delivery.
create or replace function public.record_sms_delivery_provider_rejection(
  p_sms_event_id uuid,
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
as $fn$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_task public.sms_delivery_tasks%rowtype;
  v_event public.sms_events%rowtype;
  v_reservation public.usage_reservations%rowtype;
  v_overage public.workspace_overage_accrual_events%rowtype;
  v_next timestamptz;
  v_usage_released boolean := false;
  v_release_ok boolean;
  v_released bigint;
begin
  if p_error_code is null or p_error_code !~ '^[a-z][a-z0-9_]{2,99}$'
     or p_retryable is null then
    raise exception 'SMS provider rejection arguments are invalid'
      using errcode = '22023';
  end if;

  select t.* into v_task
    from public.sms_delivery_tasks t
   where t.sms_event_id = p_sms_event_id
   for update;
  select e.* into v_event
    from public.sms_events e
   where e.id = p_sms_event_id
   for update;
  if v_task.sms_event_id is null or v_event.id is null
     or v_task.task_state <> 'leased'
     or v_task.claim_token is distinct from p_claim_token
     or v_task.request_started_at is null
     or v_event.status <> 'sending' then
    raise exception 'SMS provider rejection lease is stale or not request-started'
      using errcode = '55000';
  end if;

  if v_event.text_usage_kind = 'reservation' then
    select r.* into v_reservation
      from public.usage_reservations r
     where r.id = v_event.text_usage_reservation_id
       and r.account_id = v_event.account_id
     for update;
    if found
       and v_reservation.resource_code = 'text_segments'
       and v_reservation.operation_type = 'text_send'
       and v_reservation.idempotency_key || ':commit'
             = v_event.text_usage_finalization_key then
      if v_reservation.state = 'reserved' then
        v_release_ok := public.release_usage_reservation(
          v_event.text_usage_reservation_id,
          v_event.text_usage_finalization_key,
          'provider_rejected');
        v_usage_released := coalesce(v_release_ok, false);
      else
        v_usage_released := v_reservation.state in ('released', 'expired');
      end if;
    end if;
  elsif v_event.text_usage_kind = 'overage' then
    select o.* into v_overage
      from public.workspace_overage_accrual_events o
     where o.account_id = v_event.account_id
       and o.idempotency_key = v_event.text_usage_overage_key
       and o.resource_code = 'text_segments'
     for update;
    if found then
      if v_overage.released_at is null then
        v_released := public.release_usage_overage(
          v_event.account_id, v_event.text_usage_overage_key);
        v_usage_released := v_released > 0;
      else
        v_usage_released := true;
      end if;
    end if;
  elsif v_event.text_usage_kind = 'unmetered' then
    v_usage_released := true;
  elsif v_event.text_usage_kind is null then
    -- Compatibility for an already-request-started row created before usage
    -- evidence existed. Treat it explicitly as unmetered; never manufacture a
    -- reservation or block a safe provider-rejection retry on absent legacy data.
    v_usage_released := true;
  end if;

  update public.sms_events e
     set text_usage_kind = coalesce(e.text_usage_kind, 'unmetered'),
         text_usage_state = case
           when v_usage_released and (e.text_usage_kind is null
             or e.text_usage_kind = 'unmetered') then 'unmetered'
           when v_usage_released then 'released'
           else 'reconciliation_failed'
         end,
         text_usage_last_error = case when v_usage_released then null
           else 'sms_usage_release_unproven' end,
         text_usage_updated_at = v_now
   where e.id = p_sms_event_id;

  -- A retry without proven release can double-charge. Terminalize the provider-
  -- rejected attempt and leave its exact evidence for reconciliation instead.
  if p_retryable and v_usage_released and v_task.attempt_count < 8 then
    v_next := v_now + pg_catalog.make_interval(
      secs => least(900, 15 * (2 ^ least(v_task.attempt_count - 1, 6)))::integer
    );
    update public.sms_events e
       set status = 'queued', send_started_at = null,
           error_reason = p_error_code, updated_at = v_now
     where e.id = p_sms_event_id and e.status = 'sending';
    if not found then
      raise exception 'Retryable SMS rejection has no exact sending event'
        using errcode = '55000';
    end if;
    update public.sms_delivery_tasks t
       set task_state = 'queued', claim_token = null,
           lease_expires_at = null, request_started_at = null,
           available_at = v_next, last_error_code = p_error_code,
           updated_at = v_now
     where t.sms_event_id = p_sms_event_id;
    update public.sms_delivery_attempts a
       set outcome = 'provider_rejected_retryable', error_code = p_error_code,
           finished_at = v_now
     where a.claim_token = p_claim_token and a.outcome is null;
    if not found then
      raise exception 'Retryable SMS rejection has no open attempt'
        using errcode = '55000';
    end if;
    return query select 'retryable'::text, 'queued'::text, v_next;
    return;
  end if;

  update public.sms_events e
     set status = 'failed', error_reason = p_error_code,
         failed_at = v_now, updated_at = v_now
   where e.id = p_sms_event_id and e.status = 'sending';
  if not found then
    raise exception 'Terminal SMS rejection has no exact sending event'
      using errcode = '55000';
  end if;
  update public.sms_delivery_tasks t
     set task_state = 'failed', claim_token = null,
         lease_expires_at = null, last_error_code = case
           when v_usage_released then p_error_code
           else 'sms_usage_release_unproven'
         end,
         failed_at = v_now, updated_at = v_now
   where t.sms_event_id = p_sms_event_id;
  update public.sms_delivery_attempts a
     set outcome = 'provider_rejected_terminal', error_code = p_error_code,
         finished_at = v_now
   where a.claim_token = p_claim_token and a.outcome is null;
  if not found then
    raise exception 'Terminal SMS rejection has no open attempt'
      using errcode = '55000';
  end if;
  return query select 'terminal'::text, 'failed'::text, null::timestamptz;
end
$fn$;

create or replace function public.reconcile_sms_text_usage(
  p_batch_size integer default 50
)
returns table (
  examined integer,
  committed integer,
  released integer,
  unmetered integer,
  failed integer
)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $fn$
declare
  v_row record;
  v_reservation public.usage_reservations%rowtype;
  v_overage public.workspace_overage_accrual_events%rowtype;
  v_should_commit boolean;
  v_ok boolean;
  v_released bigint;
  v_examined integer := 0;
  v_committed integer := 0;
  v_released_count integer := 0;
  v_unmetered integer := 0;
  v_failed integer := 0;
begin
  if p_batch_size is null or p_batch_size < 1 or p_batch_size > 500 then
    raise exception 'SMS text-usage reconciliation batch is invalid'
      using errcode = '22023';
  end if;

  for v_row in
    select e.id, e.account_id, e.provider_id, e.provider_accepted_at,
           e.text_usage_kind,
           e.text_usage_reservation_id, e.text_usage_finalization_key,
           e.text_usage_overage_key, t.task_state
      from public.sms_events e
      join public.sms_delivery_tasks t on t.sms_event_id = e.id
     where e.text_usage_state in ('held', 'accrued', 'reconciliation_failed')
       and t.task_state in ('completed', 'indeterminate', 'failed', 'cancelled')
     order by e.text_usage_updated_at nulls first, e.id
     limit p_batch_size
     for update of e skip locked
  loop
    v_examined := v_examined + 1;
    -- A provider identity/acceptance timestamp is the billing boundary even if
    -- a later delivery callback says failed or undelivered. Only a pre-accept
    -- provider rejection is releasable.
    v_should_commit := v_row.task_state in ('completed', 'indeterminate')
      or v_row.provider_id is not null
      or v_row.provider_accepted_at is not null;
    begin
      if v_row.text_usage_kind = 'reservation' then
        select r.* into v_reservation
          from public.usage_reservations r
         where r.id = v_row.text_usage_reservation_id
           and r.account_id = v_row.account_id
         for update;
        if not found then
          raise exception 'SMS usage reservation is missing' using errcode = 'P0002';
        end if;

        if v_should_commit then
          if v_reservation.state = 'reserved' then
            v_ok := public.commit_usage_reservation(
              v_row.text_usage_reservation_id, v_row.text_usage_finalization_key);
          else
            v_ok := v_reservation.state = 'committed'
              and v_reservation.finalization_key = v_row.text_usage_finalization_key;
          end if;
          if not v_ok then
            raise exception 'SMS usage reservation is not committable'
              using errcode = '55000';
          end if;
          update public.sms_events set text_usage_state = 'committed',
            text_usage_last_error = null, text_usage_updated_at = pg_catalog.clock_timestamp()
           where id = v_row.id;
          v_committed := v_committed + 1;
        else
          if v_reservation.state = 'reserved' then
            v_ok := public.release_usage_reservation(
              v_row.text_usage_reservation_id, v_row.text_usage_finalization_key,
              'provider_rejected');
          else
            v_ok := v_reservation.state in ('released', 'expired');
          end if;
          if not v_ok then
            raise exception 'SMS usage reservation is not releasable'
              using errcode = '55000';
          end if;
          update public.sms_events set text_usage_state = 'released',
            text_usage_last_error = null, text_usage_updated_at = pg_catalog.clock_timestamp()
           where id = v_row.id;
          v_released_count := v_released_count + 1;
        end if;
      elsif v_row.text_usage_kind = 'overage' then
        select o.* into v_overage
          from public.workspace_overage_accrual_events o
         where o.account_id = v_row.account_id
           and o.idempotency_key = v_row.text_usage_overage_key
         for update;
        if not found then
          raise exception 'SMS usage overage is missing' using errcode = 'P0002';
        end if;

        if v_should_commit then
          if v_overage.released_at is not null then
            raise exception 'SMS usage overage was released before commit'
              using errcode = '55000';
          end if;
          update public.sms_events set text_usage_state = 'committed',
            text_usage_last_error = null, text_usage_updated_at = pg_catalog.clock_timestamp()
           where id = v_row.id;
          v_committed := v_committed + 1;
        else
          if v_overage.released_at is null then
            v_released := public.release_usage_overage(
              v_row.account_id, v_row.text_usage_overage_key);
            if v_released <= 0 then
              raise exception 'SMS usage overage release changed nothing'
                using errcode = '55000';
            end if;
          end if;
          update public.sms_events set text_usage_state = 'released',
            text_usage_last_error = null, text_usage_updated_at = pg_catalog.clock_timestamp()
           where id = v_row.id;
          v_released_count := v_released_count + 1;
        end if;
      else
        update public.sms_events set text_usage_state = 'unmetered',
          text_usage_last_error = null, text_usage_updated_at = pg_catalog.clock_timestamp()
         where id = v_row.id;
        v_unmetered := v_unmetered + 1;
      end if;
    exception when others then
      update public.sms_events
         set text_usage_state = 'reconciliation_failed',
             text_usage_last_error = 'sms_usage_reconciliation_failed',
             text_usage_updated_at = pg_catalog.clock_timestamp()
       where id = v_row.id;
      v_failed := v_failed + 1;
    end;
  end loop;

  -- Recover a reservation whose create RPC committed but its response was lost
  -- before the request marker could persist the reservation id. The durable
  -- attempt identity makes the key derivable without trusting process memory.
  for v_row in
    select a.id as attempt_id, e.account_id, r.id as reservation_id,
           r.idempotency_key
      from public.sms_delivery_attempts a
      join public.sms_events e on e.id = a.sms_event_id
      join public.usage_reservations r
        on r.account_id = e.account_id
       and r.resource_code = 'text_segments'
       and r.operation_type = 'text_send'
       and r.idempotency_key = 'text-credit:v1:sms:' || e.id::text
         || ':attempt:' || a.attempt_number::text
     where a.outcome is not null
       and a.request_started_at is null
       and r.state = 'reserved'
     order by a.finished_at nulls last, a.id
     limit p_batch_size
     for update of r skip locked
  loop
    v_examined := v_examined + 1;
    begin
      v_ok := public.release_usage_reservation(
        v_row.reservation_id,
        v_row.idempotency_key || ':commit',
        'provider_request_not_opened');
      if not v_ok then
        raise exception 'Orphan SMS reservation was not released'
          using errcode = '55000';
      end if;
      v_released_count := v_released_count + 1;
    exception when others then
      v_failed := v_failed + 1;
    end;
  end loop;

  -- Same recovery for an overage authorization whose commit response was lost.
  -- This is the charge-without-send case: the attempt is terminal and proves
  -- that the provider request boundary was never crossed.
  for v_row in
    select a.id as attempt_id, e.account_id, o.idempotency_key
      from public.sms_delivery_attempts a
      join public.sms_events e on e.id = a.sms_event_id
      join public.workspace_overage_accrual_events o
        on o.account_id = e.account_id
       and o.resource_code = 'text_segments'
       and o.idempotency_key = 'text-credit:v1:sms:' || e.id::text
         || ':attempt:' || a.attempt_number::text || ':overage'
     where a.outcome is not null
       and a.request_started_at is null
       and o.released_at is null
     order by a.finished_at nulls last, a.id
     limit p_batch_size
     for update of o skip locked
  loop
    v_examined := v_examined + 1;
    begin
      v_released := public.release_usage_overage(
        v_row.account_id, v_row.idempotency_key);
      if v_released <= 0 then
        raise exception 'Orphan SMS overage was not released'
          using errcode = '55000';
      end if;
      v_released_count := v_released_count + 1;
    exception when others then
      v_failed := v_failed + 1;
    end;
  end loop;

  return query select v_examined, v_committed, v_released_count, v_unmetered, v_failed;
end
$fn$;

revoke all on function public.mark_sms_delivery_request_started_with_usage(
  uuid, uuid, text, uuid, text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.rollback_sms_delivery_pre_request_boundary(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.reconcile_sms_text_usage(integer)
  from public, anon, authenticated, service_role;
grant execute on function public.mark_sms_delivery_request_started_with_usage(
  uuid, uuid, text, uuid, text, text) to service_role;
grant execute on function public.rollback_sms_delivery_pre_request_boundary(uuid, uuid)
  to service_role;
grant execute on function public.reconcile_sms_text_usage(integer) to service_role;

commit;
