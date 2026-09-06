-- Migration: 20260905200000_stage_sms_delivery_suspension_guard.sql
-- Goal: Restore the account suspension freeze in stage_sms_delivery alongside
--       the 24-hour TTL expiration from 20260904210000.

begin;
set local lock_timeout = '5s';

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

  -- Outbound messaging freeze: a suspended or closing account sends nothing.
  if exists (
    select 1 from public.accounts a
     where a.id = v_event.account_id
       and a.suspended_at is not null
  ) then
    update public.sms_events e
       set status = 'cancelled', error_reason = 'account_suspended_closed',
           cancelled_at = v_now, updated_at = v_now
     where e.id = v_event.id;
    update public.sms_delivery_tasks t
       set task_state = 'cancelled', claim_token = null,
           lease_expires_at = null, last_error_code = 'account_suspended_closed',
           cancelled_at = v_now, updated_at = v_now
     where t.sms_event_id = v_event.id;
    update public.sms_delivery_attempts a
       set outcome = 'cancelled', error_code = 'account_suspended_closed',
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

revoke all on function public.stage_sms_delivery(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.stage_sms_delivery(uuid, uuid, text) to service_role;

commit;
