-- -------------------------------------------------------------------------
-- Enforce 24-Hour Expiration TTL on SMS Delivery Tasks
-- Tasks older than 24 hours past their available_at time are cancelled with
-- error_reason = 'sms_delivery_expired' instead of attempting delivery days late.
-- -------------------------------------------------------------------------

create or replace function public.claim_sms_delivery_tasks(p_batch_size integer)
returns table (
  work_claim_token uuid,
  sms_event_id uuid,
  account_id uuid,
  phone_number text,
  body text,
  message_kind text,
  billing_category text,
  sender_purpose text,
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
  v_task public.sms_delivery_tasks%rowtype;
  v_token uuid;
  v_lease timestamptz;
begin
  if p_batch_size is null or p_batch_size not between 1 and 25 then
    raise exception 'SMS delivery batch size must be between 1 and 25'
      using errcode = '22023';
  end if;

  -- Recover stale leases before selecting new work. A request-started lease is
  -- terminally uncertain; a pre-request lease may safely return to the queue.
  for v_task in
    select t.*
      from public.sms_delivery_tasks t
     where t.task_state = 'leased'
       and t.lease_expires_at <= v_now
     order by t.lease_expires_at, t.sms_event_id
     for update skip locked
  loop
    if v_task.request_started_at is not null then
      update public.sms_events e
         set status = 'indeterminate',
             error_reason = 'sms_delivery_unknown_after_lease_expiry',
             indeterminate_at = v_now,
             updated_at = v_now
       where e.id = v_task.sms_event_id
         and e.status = 'sending';
      if not found then
        raise exception 'Expired SMS request has no exact sending event'
          using errcode = '55000';
      end if;
      update public.sms_delivery_attempts a
         set outcome = 'indeterminate',
             error_code = 'sms_delivery_unknown_after_lease_expiry',
             finished_at = v_now
       where a.claim_token = v_task.claim_token
         and a.outcome is null;
      if not found then
        raise exception 'Expired SMS request has no open attempt'
          using errcode = '55000';
      end if;
      update public.sms_delivery_tasks t
         set task_state = 'indeterminate',
             claim_token = null,
             lease_expires_at = null,
             last_error_code = 'sms_delivery_unknown_after_lease_expiry',
             indeterminate_at = v_now,
             updated_at = v_now
       where t.sms_event_id = v_task.sms_event_id;
    elsif v_task.attempt_count >= 8 then
      update public.sms_events e
         set status = 'failed',
             error_reason = 'sms_delivery_attempt_limit_reached',
             failed_at = v_now,
             updated_at = v_now
       where e.id = v_task.sms_event_id
         and e.status = 'queued';
      update public.sms_delivery_attempts a
         set outcome = 'terminal_failure',
             error_code = 'sms_delivery_attempt_limit_reached',
             finished_at = v_now
       where a.claim_token = v_task.claim_token
         and a.outcome is null;
      update public.sms_delivery_tasks t
         set task_state = 'failed', claim_token = null,
             lease_expires_at = null,
             last_error_code = 'sms_delivery_attempt_limit_reached',
             failed_at = v_now, updated_at = v_now
       where t.sms_event_id = v_task.sms_event_id;
    else
      update public.sms_delivery_attempts a
         set outcome = 'lease_expired',
             error_code = 'sms_delivery_pre_request_lease_expired',
             finished_at = v_now
       where a.claim_token = v_task.claim_token
         and a.outcome is null;
      if not found then
        raise exception 'Expired SMS lease has no open attempt'
          using errcode = '55000';
      end if;
      update public.sms_delivery_tasks t
         set task_state = 'queued', claim_token = null,
             lease_expires_at = null, available_at = v_now,
             last_error_code = 'sms_delivery_pre_request_lease_expired',
             updated_at = v_now
       where t.sms_event_id = v_task.sms_event_id;
    end if;
  end loop;

  -- Expire stale queued tasks that have exceeded their TTL (24 hours past available_at)
  for v_task in
    select t.*
      from public.sms_delivery_tasks t
     where t.task_state = 'queued'
       and t.available_at < v_now - interval '24 hours'
     order by t.available_at, t.sms_event_id
     limit 100
     for update skip locked
  loop
    update public.sms_events e
       set status = 'cancelled',
           error_reason = 'sms_delivery_expired',
           cancelled_at = v_now,
           updated_at = v_now
     where e.id = v_task.sms_event_id
       and e.status = 'queued';

    update public.sms_delivery_tasks t
       set task_state = 'cancelled',
           claim_token = null,
           lease_expires_at = null,
           last_error_code = 'sms_delivery_expired',
           cancelled_at = v_now,
           updated_at = v_now
     where t.sms_event_id = v_task.sms_event_id;
  end loop;

  -- Claim only unexpired tasks within the 24h window
  for v_task in
    select t.*
      from public.sms_delivery_tasks t
     where t.task_state = 'queued'
       and t.available_at <= v_now
       and t.available_at >= v_now - interval '24 hours'
       and t.attempt_count < 8
     order by t.available_at, t.sms_event_id
     limit p_batch_size
     for update skip locked
  loop
    v_token := pg_catalog.gen_random_uuid();
    v_lease := v_now + interval '5 minutes';

    update public.sms_delivery_tasks t
       set task_state = 'leased',
           claim_token = v_token,
           lease_expires_at = v_lease,
           attempt_count = t.attempt_count + 1,
           request_started_at = null,
           last_error_code = null,
           updated_at = v_now
     where t.sms_event_id = v_task.sms_event_id;

    insert into public.sms_delivery_attempts (
      sms_event_id, claim_token, attempt_number,
      leased_at, lease_expires_at, created_at
    ) values (
      v_task.sms_event_id, v_token, v_task.attempt_count + 1,
      v_now, v_lease, v_now
    );

    return query
    select v_token, e.id, e.account_id, e.phone_number, e.body,
           e.message_kind, e.billing_category, e.sender_purpose,
           v_task.attempt_count + 1, v_lease
      from public.sms_events e
     where e.id = v_task.sms_event_id
       and e.status = 'queued';
  end loop;
end;
$$;

create or replace function public.stage_sms_delivery(
  p_sms_event_id uuid,
  p_claim_token uuid,
  p_provider text
)
returns table (
  dispatch_status text,
  sender_number_id uuid,
  sender_e164 text,
  provider_number_id text
)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_task public.sms_delivery_tasks%rowtype;
  v_event public.sms_events%rowtype;
  v_sender public.sms_sender_numbers%rowtype;
begin
  if p_provider is null or p_provider not in ('twilio', 'signalwire') then
    raise exception 'SMS provider is invalid'
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
     or v_task.lease_expires_at <= v_now
     or v_task.request_started_at is not null
     or v_event.status <> 'queued' then
    raise exception 'SMS delivery lease is stale or invalid'
      using errcode = '55000';
  end if;

  -- Cancel expired tasks if more than 24 hours past available_at or created_at
  if v_task.available_at < v_now - interval '24 hours' or v_task.created_at < v_now - interval '24 hours' then
    update public.sms_events e
       set status = 'cancelled', error_reason = 'sms_delivery_expired',
           cancelled_at = v_now, updated_at = v_now
     where e.id = v_event.id;
    update public.sms_delivery_tasks t
       set task_state = 'cancelled', claim_token = null,
           lease_expires_at = null, last_error_code = 'sms_delivery_expired',
           cancelled_at = v_now, updated_at = v_now
     where t.sms_event_id = v_event.id;
    update public.sms_delivery_attempts a
       set outcome = 'cancelled', error_code = 'sms_delivery_expired',
           finished_at = v_now
     where a.claim_token = p_claim_token and a.outcome is null;
    return query select 'cancelled'::text, null::uuid, null::text, null::text;
    return;
  end if;

  if not exists (
    select 1 from public.sms_consent c
     where c.account_id = v_event.account_id
       and c.phone_number = v_event.phone_number
       and c.status = 'opted_in'
       and c.consented_at is not null
       and c.opted_out_at is null
  ) then
    update public.sms_events e
       set status = 'cancelled', error_reason = 'sms_consent_not_current',
           cancelled_at = v_now, updated_at = v_now
     where e.id = v_event.id;
    update public.sms_delivery_tasks t
       set task_state = 'cancelled', claim_token = null,
           lease_expires_at = null, last_error_code = 'sms_consent_not_current',
           cancelled_at = v_now, updated_at = v_now
     where t.sms_event_id = v_event.id;
    update public.sms_delivery_attempts a
       set outcome = 'cancelled', error_code = 'sms_consent_not_current',
           finished_at = v_now
     where a.claim_token = p_claim_token and a.outcome is null;
    return query select 'cancelled'::text, null::uuid, null::text, null::text;
    return;
  end if;

  if v_event.sender_number_id is not null then
    select s.* into v_sender
      from public.sms_sender_numbers s
     where s.id = v_event.sender_number_id
       and s.provider = p_provider
       and s.purpose = v_event.sender_purpose
       and (s.account_id is null or s.account_id = v_event.account_id)
       and s.provisioning_status = 'active'
       and s.assignment_state = 'assigned'
       and s.inbound_ready
       and s.suspended_at is null
     for share;
  else
    select s.* into v_sender
      from public.sms_sender_numbers s
     where s.provider = p_provider
       and s.purpose = v_event.sender_purpose
       and (
         (s.purpose = 'contractor_dedicated' and s.account_id = v_event.account_id)
         or (s.purpose in ('lgq_shared', 'lgq_dispatch') and s.account_id is null)
       )
       and s.provisioning_status = 'active'
       and s.assignment_state = 'assigned'
       and s.inbound_ready
       and s.suspended_at is null
     order by s.activated_at, s.id
     limit 1
     for share;
  end if;
  if v_sender.id is null then
    return query select 'blocked_sender'::text, null::uuid, null::text, null::text;
    return;
  end if;

  -- Recheck sender-scoped STOP at the same compare-and-set boundary as consent
  -- and inventory readiness. A STOP arriving after enqueue but before egress
  -- therefore wins without a race, including for the shared LGQ sender.
  if exists (
    select 1
      from public.sms_sender_keyword_preferences p
     where p.sender_number_id = v_sender.id
       and p.phone_number = v_event.phone_number
       and p.status = 'opted_out'
       and p.opted_out_at is not null
  ) then
    update public.sms_events e
       set status = 'cancelled', error_reason = 'sms_sender_opted_out',
           cancelled_at = v_now, updated_at = v_now
     where e.id = v_event.id;
    update public.sms_delivery_tasks t
       set task_state = 'cancelled', claim_token = null,
           lease_expires_at = null, last_error_code = 'sms_sender_opted_out',
           cancelled_at = v_now, updated_at = v_now
     where t.sms_event_id = v_event.id;
    update public.sms_delivery_attempts a
       set outcome = 'cancelled', error_code = 'sms_sender_opted_out',
           finished_at = v_now
     where a.claim_token = p_claim_token and a.outcome is null;
    return query select 'cancelled'::text, null::uuid, null::text, null::text;
    return;
  end if;

  update public.sms_events e
     set provider = p_provider,
         sender_number_id = v_sender.id,
         updated_at = v_now
   where e.id = v_event.id;

  return query
  select 'ready'::text, v_sender.id, v_sender.e164_number,
         v_sender.provider_number_id;
end;
$$;

revoke all on function public.claim_sms_delivery_tasks(integer) from public, anon, authenticated;
grant execute on function public.claim_sms_delivery_tasks(integer) to service_role;

revoke all on function public.stage_sms_delivery(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.stage_sms_delivery(uuid, uuid, text) to service_role;
