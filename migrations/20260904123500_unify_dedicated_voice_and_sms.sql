-- Migration: 20260904123500_unify_dedicated_voice_and_sms.sql
-- Goal: Unify Voice and SMS on dedicated contractor numbers.
-- 1. Relax prevent_reserved_voice_identity_assignment to allow a dedicated number
--    to exist in both voice_number_inventory (purpose: ai_voice) and
--    sms_sender_numbers (purpose: contractor_dedicated) for the same account_id.
-- 2. Update apply_authorized_sms_field_action to allow contractor_dedicated
--    senders for field commands (Text-to-Job) when texted by the account owner.
-- 3. Update stage_sms_delivery to prioritize the contractor's dedicated number
--    for account outbound delivery when active.
-- 4. Register and activate the dedicated canary number (+18103202687) in sms_sender_numbers.

begin;

-- 1. Relax cross-rail trigger
create or replace function public.prevent_reserved_voice_identity_assignment()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $fn$
declare
  v_row jsonb;
  v_provider_number_id text;
  v_e164_number text;
begin
  v_row := pg_catalog.to_jsonb(new);
  v_provider_number_id := v_row->>'provider_number_id';
  v_e164_number := v_row->>'e164_number';
  if v_row->>'provider' is distinct from 'signalwire' then
    return new;
  end if;
  if (tg_table_name = 'sms_sender_numbers' and v_row->>'provisioning_status' = 'released')
     or (tg_table_name = 'voice_number_inventory' and v_row->>'lifecycle_state' = 'released') then
    return new;
  end if;

  -- Cross-rail mutations always take the shared global lock before either
  -- exact identity lock. Messaging purchase claims use the same first lock.
  perform pg_catalog.pg_advisory_xact_lock(1280265031, 2108);
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('voice-cleanup-id:' || v_provider_number_id, 91240519)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('voice-cleanup-number:' || v_e164_number, 91240520)
  );

  -- Dual existence is explicitly allowed when the provider identity belongs to the
  -- same contractor account for dedicated voice and dedicated SMS.
  if tg_table_name = 'sms_sender_numbers' and exists (
    select 1 from public.voice_number_inventory i
     where i.provider = 'signalwire' and i.lifecycle_state <> 'released'
       and (i.provider_number_id = v_provider_number_id or i.e164_number = v_e164_number)
       and not (
         v_row->>'purpose' = 'contractor_dedicated'
         and i.purpose = 'ai_voice'
         and (v_row->>'account_id')::uuid is not null
         and i.account_id = (v_row->>'account_id')::uuid
       )
  ) then
    raise exception 'Provider identity is already owned by the live AI Voice rail'
      using errcode = '23505';
  elsif tg_table_name = 'sms_sender_numbers'
        and public.unresolved_voice_number_identity_conflict(
          null, v_provider_number_id, v_e164_number
        ) then
    raise exception 'Provider identity is reserved by an unresolved AI Voice operation'
      using errcode = '23505';
  elsif tg_table_name = 'voice_number_inventory' and exists (
    select 1 from public.sms_sender_numbers s
     where s.provider = 'signalwire' and s.provisioning_status <> 'released'
       and (s.provider_number_id = v_provider_number_id or s.e164_number = v_e164_number)
       and not (
         s.purpose = 'contractor_dedicated'
         and v_row->>'purpose' = 'ai_voice'
         and (v_row->>'account_id')::uuid is not null
         and s.account_id = (v_row->>'account_id')::uuid
       )
  ) then
    raise exception 'Provider identity is already owned by the live SMS rail'
      using errcode = '23505';
  elsif tg_table_name = 'voice_number_inventory'
        and public.unresolved_messaging_number_identity_conflict(
          null, v_provider_number_id, v_e164_number
        ) then
    raise exception 'Provider identity is reserved by an unresolved messaging operation'
      using errcode = '23505';
  end if;

  if exists (
    select 1
      from public.voice_number_identity_cleanup_reservations r
     where r.provider = 'signalwire'
       and r.state = 'reserved'
       and (
         r.provider_number_id = v_provider_number_id
         or r.e164_number = v_e164_number
       )
  ) then
    raise exception 'Provider identity is reserved for fail-closed AI Voice cleanup'
      using errcode = '55000';
  end if;

  return new;
end
$fn$;

revoke all on function public.prevent_reserved_voice_identity_assignment()
  from public, anon, authenticated, service_role;

-- 2. Update apply_authorized_sms_field_action to allow contractor_dedicated senders
create or replace function public.apply_authorized_sms_field_action(
  p_task_id uuid,
  p_claim_token uuid,
  p_intent text,
  p_params jsonb,
  p_transcript text,
  p_confirmation_text text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $$
declare
  v_task public.sms_inbound_action_tasks%rowtype;
  v_receipt public.sms_webhook_receipts%rowtype;
  v_message public.sms_messages%rowtype;
  v_sender public.sms_sender_numbers%rowtype;
  v_account public.accounts%rowtype;
  v_crew public.crew%rowtype;
  v_consent public.sms_consent%rowtype;
  v_sender_preference public.sms_sender_keyword_preferences%rowtype;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_has_caller_scope boolean := false;
  v_is_owner boolean := false;
  v_crew_match_count integer := 0;
  v_required_scope text;
  v_cost_amount numeric;
  v_cost_type text;
begin
  select t.* into v_task
    from public.sms_inbound_action_tasks t
   where t.id = p_task_id
   for update;

  if v_task.id is null
     or v_task.task_state <> 'processing'
     or v_task.claim_token is distinct from p_claim_token
     or v_task.lease_expires_at <= v_now then
    raise exception 'Inbound action claim is not active' using errcode = '55000';
  end if;

  if v_task.effect_applied_at is not null then
    return v_task.outcome;
  end if;

  select r.* into v_receipt
    from public.sms_webhook_receipts r
   where r.id = v_task.webhook_receipt_id
   for share;

  if v_receipt.id is null
     or v_receipt.webhook_kind <> 'inbound'
     or v_receipt.processing_state <> 'processed'
     or v_receipt.disposition <> 'routed'
     or v_receipt.account_id is distinct from v_task.account_id
     or v_receipt.sender_number_id is distinct from v_task.sender_number_id
     or v_receipt.sms_message_id is distinct from v_task.sms_message_id
     or v_receipt.from_number is null then
    raise exception 'Inbound action task binding is invalid' using errcode = '23514';
  end if;

  select m.* into v_message
    from public.sms_messages m
   where m.id = v_task.sms_message_id
     and m.id = v_receipt.sms_message_id
     and m.account_id = v_task.account_id
     and m.sender_number_id = v_task.sender_number_id
     and m.provider = v_receipt.provider
     and m.provider_id = v_receipt.provider_event_id
     and m.phone_number = v_receipt.from_number
     and m.direction = 'inbound'
   for share;

  if v_message.id is null then
    raise exception 'Inbound action message binding is invalid' using errcode = '23514';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'sms-sender-consent:' || v_task.sender_number_id::text || ':' || v_receipt.from_number,
      20260821
    )
  );
  perform pg_catalog.pg_advisory_xact_lock(
    public.sms_inbound_recipient_lock_key(v_task.account_id, v_receipt.from_number)
  );

  select s.* into v_sender
    from public.sms_sender_numbers s
   where s.id = v_task.sender_number_id
     and s.id = v_receipt.sender_number_id
     and s.provider = v_receipt.provider
     and s.e164_number = v_receipt.to_number
     and (
       (s.purpose = 'lgq_shared' and s.account_id is null)
       or (s.purpose = 'contractor_dedicated' and s.account_id = v_task.account_id)
     )
     and s.provisioning_status = 'active'
     and s.assignment_state = 'assigned'
     and s.inbound_ready
     and s.activated_at is not null
     and s.suspended_at is null
   for share;

  if v_sender.id is null then
    raise exception 'Inbound action sender is not active' using errcode = '55000';
  end if;

  select a.* into v_account
    from public.accounts a
   where a.id = v_task.account_id
     and a.suspended_at is null
   for share;

  if v_account.id is null then
    raise exception 'Field intake account is no longer active' using errcode = '28000';
  end if;

  v_is_owner := v_account.high_value_sms_enabled is true
    and public.sms_normalize_recipient_phone(v_account.alert_phone) = v_receipt.from_number;

  if v_is_owner then
    v_required_scope := 'owner';
  else
    for v_crew in
      select cr.*
        from public.crew cr
       where cr.account_id = v_task.account_id
         and cr.active
         and cr.deleted_at is null
         and cr.access_revoked_at is null
         and public.sms_normalize_recipient_phone(cr.phone) = v_receipt.from_number
       order by cr.id
       for share
    loop
      v_crew_match_count := v_crew_match_count + 1;
    end loop;

    if v_crew_match_count <> 1 then
      raise exception 'Field intake sender identity is missing or ambiguous' using errcode = '28000';
    end if;
    if p_intent <> 'no_action' then
      raise exception 'Crew field commands are not enabled' using errcode = '42501';
    end if;
    v_required_scope := 'crew';
  end if;

  select c.* into v_consent
    from public.sms_consent c
   where c.account_id = v_task.account_id
     and c.phone_number = v_receipt.from_number
   for share;

  if v_consent.id is null
     or v_consent.status <> 'opted_in'
     or v_consent.opted_out_at is not null then
    raise exception 'Sender consent is missing or revoked' using errcode = '28000';
  end if;

  select true into v_has_caller_scope
    from public.sms_consent_scopes scope
   where scope.account_id = v_task.account_id
     and scope.phone_number = v_receipt.from_number
     and scope.consent_scope = v_required_scope
   for share;

  if not coalesce(v_has_caller_scope, false) then
    raise exception 'Sender consent scope is missing' using errcode = '28000';
  end if;

  select pref.* into v_sender_preference
    from public.sms_sender_keyword_preferences pref
   where pref.sender_number_id = v_task.sender_number_id
     and pref.phone_number = v_receipt.from_number
   for share;

  if v_sender_preference.sender_number_id is not null
     and (
       v_sender_preference.status <> 'opted_in'
       or v_sender_preference.opted_out_at is not null
     ) then
    raise exception 'Sender-specific consent is revoked' using errcode = '28000';
  end if;

  if p_intent = 'complete_job_task' then
    raise exception 'Task completion by SMS requires an exact task ID' using errcode = '42501';
  end if;

  if p_intent = 'log_cost' then
    if pg_catalog.jsonb_typeof(p_params->'amount') is distinct from 'number' then
      raise exception 'Cost amount must be a JSON number' using errcode = '22023';
    end if;
    v_cost_amount := (p_params->>'amount')::numeric;
    v_cost_type := coalesce(
      nullif(pg_catalog.btrim(p_params->>'cost_type'), ''),
      'material'
    );
    if v_cost_amount::text in ('NaN', 'Infinity', '-Infinity')
       or v_cost_amount <= 0
       or v_cost_amount > 1000000 then
      raise exception 'Cost amount is outside the allowed range' using errcode = '22023';
    end if;
    if v_cost_type not in ('material', 'labor', 'sub', 'receipt', 'other') then
      raise exception 'Cost type is invalid' using errcode = '22023';
    end if;
  end if;

  return public.apply_owner_field_action(
    p_task_id,
    p_claim_token,
    p_intent,
    p_params,
    p_transcript,
    p_confirmation_text
  );
end;
$$;

revoke all on function public.apply_authorized_sms_field_action(uuid,uuid,text,jsonb,text,text)
  from public, anon, authenticated, service_role;
grant execute on function public.apply_authorized_sms_field_action(uuid,uuid,text,jsonb,text,text)
  to service_role;

-- 3. Update stage_sms_delivery with identical return signature (dispatch_status, sender_number_id, sender_e164, provider_number_id)
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
  v_required_scope text;
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

  v_required_scope := case v_event.billing_category
    when 'customer_message' then 'customer'
    when 'payment_message' then 'customer'
    when 'verification' then 'customer'
    when 'crew_message' then 'crew'
    when 'owner_alert' then 'owner'
    else null
  end;
  if v_required_scope is null or not exists (
    select 1 from public.sms_consent_scopes s
     where s.account_id = v_event.account_id
       and s.phone_number = v_event.phone_number
       and s.consent_scope = v_required_scope
  ) then
    update public.sms_events e
       set status = 'cancelled', error_reason = 'sms_consent_scope_not_current',
           cancelled_at = v_now, updated_at = v_now
     where e.id = v_event.id;
    update public.sms_delivery_tasks t
       set task_state = 'cancelled', claim_token = null,
           lease_expires_at = null,
           last_error_code = 'sms_consent_scope_not_current',
           cancelled_at = v_now, updated_at = v_now
     where t.sms_event_id = v_event.id;
    update public.sms_delivery_attempts a
       set outcome = 'cancelled', error_code = 'sms_consent_scope_not_current',
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
  else
    -- Priority 1: If this account owns an active dedicated business line, ALL outbound runs through it!
    select s.* into v_sender
      from public.sms_sender_numbers s
     where s.provider = p_provider
       and s.purpose = 'contractor_dedicated'
       and s.account_id = v_event.account_id
       and s.provisioning_status = 'active'
       and s.assignment_state = 'assigned'
       and s.inbound_ready
       and s.suspended_at is null
     order by s.activated_at, s.id
     limit 1
     for share;

    -- Priority 2: Fall back to purpose matching (e.g. lgq_shared for accounts without dedicated lines)
    if v_sender.id is null then
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
  end if;

  if v_sender.id is null then
    return query select 'blocked_sender'::text, null::uuid, null::text, null::text;
    return;
  end if;

  -- Recheck sender-scoped STOP at the same compare-and-set boundary
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

revoke all on function public.stage_sms_delivery(uuid,uuid,text)
  from public, anon, authenticated;
grant execute on function public.stage_sms_delivery(uuid,uuid,text)
  to service_role;

-- 4. Synchronize +18103202687 for BrokePipes into sms_sender_numbers
insert into public.sms_sender_numbers (
  provider,
  e164_number,
  provider_number_id,
  purpose,
  account_id,
  brand_id,
  campaign_id,
  assignment_id,
  assignment_state,
  inbound_webhook_url,
  inbound_ready,
  provisioning_status,
  activated_at,
  provider_sms_capable,
  inbound_message_handler,
  inbound_request_method,
  provider_brand_state,
  provider_campaign_state,
  provider_verified_at,
  provider_phone_verified_at
) values (
  'signalwire',
  '+18103202687',
  'fba6ff80-aec2-4d5e-9be1-c4bf9faf8984',
  'contractor_dedicated',
  'c63293b4-138e-45c2-8e11-0f4e6d7e08e6',
  '4a09f38f-2de4-48b7-aba5-dac76a398ccf',
  '638bad76-629d-4321-90e2-6fe533c09091',
  '6ae94736-2197-446d-ac88-73294328d006',
  'assigned',
  'https://app.letsgetquoted.com/api/sms/inbound',
  true,
  'active',
  clock_timestamp(),
  true,
  'laml_webhooks',
  'POST',
  'complete',
  'complete',
  clock_timestamp(),
  clock_timestamp()
)
on conflict (provider, e164_number) do update set
  provider_number_id = excluded.provider_number_id,
  purpose = excluded.purpose,
  account_id = excluded.account_id,
  brand_id = excluded.brand_id,
  campaign_id = excluded.campaign_id,
  assignment_id = excluded.assignment_id,
  assignment_state = excluded.assignment_state,
  inbound_webhook_url = excluded.inbound_webhook_url,
  inbound_ready = excluded.inbound_ready,
  provisioning_status = excluded.provisioning_status,
  provider_sms_capable = excluded.provider_sms_capable,
  inbound_message_handler = excluded.inbound_message_handler,
  inbound_request_method = excluded.inbound_request_method,
  updated_at = clock_timestamp();

commit;
