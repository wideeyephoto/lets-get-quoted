-- migrations/20260904133000_unify_delivery_request_started_sender.sql
-- Allow contractor_dedicated sender numbers during the provider pre-request boundary
-- in mark_sms_delivery_request_started_with_usage when stage_sms_delivery routed
-- outbound traffic through the account's dedicated line.

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
set "TimeZone" to 'UTC'
as $function$
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

  -- Verify sender availability at compare-and-set boundary. Allow dedicated line for account.
  select s.* into v_sender
    from public.sms_sender_numbers s
   where s.id = v_event.sender_number_id
     and s.provider = v_event.provider
     and (
       s.purpose = v_event.sender_purpose
       or (s.purpose = 'contractor_dedicated' and s.account_id = v_event.account_id)
     )
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

  perform public.mark_sms_delivery_request_started(p_sms_event_id, p_claim_token);
  return true;
end
$function$;
