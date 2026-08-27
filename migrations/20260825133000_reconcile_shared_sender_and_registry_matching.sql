-- ===========================================================================
-- Reconcile LGQ shared number (+1 947-941-2323) and improve registry callback
-- matching across applications and platform sender numbers.
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Reconcile LGQ shared sender (+1 947-941-2323) as assigned and active.
-- ---------------------------------------------------------------------------
insert into public.sms_sender_numbers (
  provider,
  e164_number,
  purpose,
  account_id,
  assignment_state,
  provisioning_status,
  inbound_ready,
  activated_at,
  updated_at,
  provider_brand_state,
  provider_campaign_state,
  provider_verified_at,
  provider_phone_verified_at,
  provider_sms_capable,
  inbound_request_method,
  inbound_message_handler
) values (
  'signalwire',
  '+19479412323',
  'lgq_shared',
  null,
  'assigned',
  'active',
  true,
  pg_catalog.now(),
  pg_catalog.now(),
  'complete',
  'complete',
  pg_catalog.now(),
  pg_catalog.now(),
  true,
  'POST',
  'laml_webhooks'
) on conflict (provider, e164_number) do update set
  purpose = excluded.purpose,
  assignment_state = excluded.assignment_state,
  provisioning_status = excluded.provisioning_status,
  inbound_ready = excluded.inbound_ready,
  activated_at = coalesce(public.sms_sender_numbers.activated_at, excluded.activated_at),
  suspended_at = null,
  provider_brand_state = coalesce(public.sms_sender_numbers.provider_brand_state, excluded.provider_brand_state),
  provider_campaign_state = coalesce(public.sms_sender_numbers.provider_campaign_state, excluded.provider_campaign_state),
  provider_verified_at = coalesce(public.sms_sender_numbers.provider_verified_at, excluded.provider_verified_at),
  provider_phone_verified_at = coalesce(public.sms_sender_numbers.provider_phone_verified_at, excluded.provider_phone_verified_at),
  provider_sms_capable = coalesce(public.sms_sender_numbers.provider_sms_capable, excluded.provider_sms_capable),
  inbound_request_method = coalesce(public.sms_sender_numbers.inbound_request_method, excluded.inbound_request_method),
  inbound_message_handler = coalesce(public.sms_sender_numbers.inbound_message_handler, excluded.inbound_message_handler),
  updated_at = pg_catalog.now();

-- ---------------------------------------------------------------------------
-- 2. Upgrade ingest_messaging_registry_callback to resolve callbacks against
--    both contractor applications and platform sender inventory.
-- ---------------------------------------------------------------------------
create or replace function public.ingest_messaging_registry_callback(
  p_receipt_key text,
  p_body_sha256 text,
  p_raw_body text,
  p_content_type text,
  p_request_method text,
  p_request_path text,
  p_request_headers jsonb,
  p_signature_header_name text,
  p_signature_header_value text,
  p_parsed jsonb,
  p_provider_order_id text,
  p_provider_assignment_id text,
  p_provider_campaign_id text,
  p_provider_phone_number text,
  p_provider_state text,
  p_normalized_state text,
  p_failure_code text,
  p_failure_detail text
)
returns table (
  callback_id uuid,
  inserted boolean,
  matched_application_id uuid,
  disposition text
)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_existing public.messaging_registry_callbacks%rowtype;
  v_application public.messaging_registration_applications%rowtype;
  v_sender public.sms_sender_numbers%rowtype;
  v_matched boolean := false;
  v_account uuid;
  v_status text;
  v_id uuid;
begin
  if p_receipt_key is null or pg_catalog.length(pg_catalog.btrim(p_receipt_key)) = 0
     or coalesce(p_body_sha256, '') !~ '^[0-9a-f]{64}$'
     or p_raw_body is null then
    raise exception 'registry callback input is invalid' using errcode = '22023';
  end if;

  select c.* into v_existing
    from public.messaging_registry_callbacks c
   where c.provider = 'signalwire' and c.receipt_key = p_receipt_key
   for update;

  if found then
    -- A replay must be byte-identical. Differing bytes under one receipt key
    -- means the key was built from something that does not identify the event.
    if v_existing.body_sha256 is distinct from p_body_sha256 then
      raise exception 'registry callback already received with different bytes'
        using errcode = '23505';
    end if;
    return query select v_existing.id, false, v_existing.application_id,
                        v_existing.processing_status;
    return;
  end if;

  -- 1. Try matching contractor application by order id
  if p_provider_order_id is not null then
    select a.* into v_application
      from public.messaging_registration_applications a
     where a.assignment_order_id = p_provider_order_id
     for update;
    v_matched := found;
  end if;

  -- 2. Try matching contractor application by phone number, assignment id, or campaign id if not matched by order
  if not v_matched then
    if p_provider_phone_number is not null then
      select a.* into v_application
        from public.messaging_registration_applications a
       where a.purchased_number = p_provider_phone_number
       order by a.created_at desc
       limit 1
       for update;
      v_matched := found;
    end if;

    if not v_matched and p_provider_assignment_id is not null then
      select a.* into v_application
        from public.messaging_registration_applications a
       where a.assignment_id = p_provider_assignment_id
       order by a.created_at desc
       limit 1
       for update;
      v_matched := found;
    end if;
  end if;

  if v_matched and v_application.id is not null then
    v_account := v_application.account_id;
    v_status  := 'received';
  else
    -- 3. Check for platform/shared senders in sms_sender_numbers
    select s.* into v_sender
      from public.sms_sender_numbers s
     where s.provider = 'signalwire'
       and (
         (p_provider_phone_number is not null and s.e164_number = p_provider_phone_number)
         or (p_provider_assignment_id is not null and s.assignment_id = p_provider_assignment_id)
         or (p_provider_campaign_id is not null and s.campaign_id = p_provider_campaign_id and s.purpose in ('lgq_shared', 'lgq_dispatch'))
       )
     order by s.created_at desc
     limit 1
     for update;

    if found then
      v_account := v_sender.account_id;
      v_status  := 'processed';
      v_application.id := v_sender.provisioning_application_id;

      -- Update assignment state on sender number
      if p_normalized_state = 'complete' then
        update public.sms_sender_numbers
           set assignment_state = 'assigned',
               last_verified_at = v_now,
               updated_at = v_now
         where id = v_sender.id;
      elsif p_normalized_state = 'failed' then
        update public.sms_sender_numbers
           set assignment_state = 'failed',
               updated_at = v_now
         where id = v_sender.id;
      end if;
    else
      -- A callback naming an identifier LGQ cannot resolve is still stored.
      v_application.id := null;
      v_account := null;
      v_status  := 'unmatched';
    end if;
  end if;

  insert into public.messaging_registry_callbacks (
    provider, receipt_key, body_sha256, raw_body, content_type,
    request_method, request_path, request_headers,
    signature_header_name, signature_header_value, parsed,
    provider_order_id, provider_assignment_id, provider_campaign_id,
    provider_phone_number, provider_state, normalized_state,
    failure_code, failure_detail,
    application_id, account_id, processing_status, processed_at
  ) values (
    'signalwire', p_receipt_key, p_body_sha256, p_raw_body, p_content_type,
    p_request_method, p_request_path, coalesce(p_request_headers, '{}'::jsonb),
    p_signature_header_name, p_signature_header_value, p_parsed,
    p_provider_order_id, p_provider_assignment_id, p_provider_campaign_id,
    p_provider_phone_number, p_provider_state, p_normalized_state,
    p_failure_code, p_failure_detail,
    v_application.id, v_account, v_status,
    case when v_status <> 'received' then v_now else null end
  )
  returning id into v_id;

  if v_id is null then
    raise exception 'registry callback was not stored' using errcode = '55000';
  end if;

  return query select v_id, true, v_application.id, v_status;
end;
$$;

commit;
