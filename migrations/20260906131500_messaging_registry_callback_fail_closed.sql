-- Fail closed when SignalWire reports that a platform/shared sender's
-- Campaign Registry number assignment failed.
--
-- The prior callback function changed only assignment_state. For an active
-- sender, sms_sender_numbers_activation_shape requires assignment_state to
-- remain assigned, so PostgreSQL rejected that partial update and rolled back
-- the callback receipt with it. The sender therefore remained eligible for
-- egress after a carrier failure.

begin;

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
  v_sender_match_count integer := 0;
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

  -- 1. Try matching contractor application by order id.
  if p_provider_order_id is not null then
    select a.* into v_application
      from public.messaging_registration_applications a
     where a.assignment_order_id = p_provider_order_id
     for update;
    v_matched := found;
  end if;

  -- 2. Try matching contractor application by phone number or assignment id.
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
    -- 3. Check platform/shared sender inventory. Every supplied identifier must
    -- identify the same row. In particular, a phone/assignment conflict must
    -- never fall back to its Campaign, and Campaign-only callbacks mutate a
    -- sender only when that Campaign has exactly one platform number.
    if p_provider_phone_number is not null
       or p_provider_assignment_id is not null
       or p_provider_campaign_id is not null then
      -- Sender provisioning and platform registration use this same lock. It
      -- keeps the cardinality proof and row lock in one inventory snapshot.
      perform pg_catalog.pg_advisory_xact_lock(1280265031, 2108);

      select pg_catalog.count(*)::integer into v_sender_match_count
        from public.sms_sender_numbers s
       where s.provider = 'signalwire'
         and s.purpose in ('lgq_shared', 'lgq_dispatch')
         and (p_provider_phone_number is null or s.e164_number = p_provider_phone_number)
         and (p_provider_assignment_id is null or s.assignment_id = p_provider_assignment_id)
         and (p_provider_campaign_id is null or s.campaign_id = p_provider_campaign_id);

      if v_sender_match_count = 1 then
        select s.* into strict v_sender
          from public.sms_sender_numbers s
         where s.provider = 'signalwire'
           and s.purpose in ('lgq_shared', 'lgq_dispatch')
           and (p_provider_phone_number is null or s.e164_number = p_provider_phone_number)
           and (p_provider_assignment_id is null or s.assignment_id = p_provider_assignment_id)
           and (p_provider_campaign_id is null or s.campaign_id = p_provider_campaign_id)
         for update;
      end if;
    end if;

    if v_sender.id is not null then
      v_account := v_sender.account_id;
      v_status  := 'processed';
      v_application.id := v_sender.provisioning_application_id;

      if p_normalized_state = 'complete' then
        -- Preserve the existing completion behavior: this callback records
        -- assignment proof, but never activates or unsuspends a sender.
        update public.sms_sender_numbers
           set assignment_state = 'assigned',
               last_verified_at = v_now,
               updated_at = v_now
         where id = v_sender.id;
      elsif p_normalized_state = 'failed' then
        -- assignment_state and provisioning_status move together so the
        -- activation CHECK accepts the transition and egress immediately loses
        -- eligibility. Keep inbound_ready truthful as configuration evidence:
        -- the webhook is still configured, while the independent active,
        -- assigned, and unsuspended predicates quarantine both runtime rails.
        -- The suspension timestamp requires explicit verified recovery.
        update public.sms_sender_numbers
           set assignment_state = 'failed',
               provisioning_status = 'failed',
               suspended_at = coalesce(suspended_at, v_now),
               last_verified_at = v_now,
               updated_at = v_now
         where id = v_sender.id;
      end if;

      if not found then
        raise exception 'registry callback could not update its sender row'
          using errcode = '55000';
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

-- CREATE OR REPLACE retains privileges today, but restate the service-role-only
-- contract so a fresh schema and an upgraded database converge exactly.
revoke all on function public.ingest_messaging_registry_callback(
  text, text, text, text, text, text, jsonb, text, text, jsonb,
  text, text, text, text, text, text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.ingest_messaging_registry_callback(
  text, text, text, text, text, text, jsonb, text, text, jsonb,
  text, text, text, text, text, text, text, text)
  to service_role;

do $verify_registry_callback_fail_closed$
declare
  v_definition text;
begin
  select pg_catalog.pg_get_functiondef(p.oid) into v_definition
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'ingest_messaging_registry_callback'
     and pg_catalog.pg_get_function_identity_arguments(p.oid) =
       'p_receipt_key text, p_body_sha256 text, p_raw_body text, p_content_type text, p_request_method text, p_request_path text, p_request_headers jsonb, p_signature_header_name text, p_signature_header_value text, p_parsed jsonb, p_provider_order_id text, p_provider_assignment_id text, p_provider_campaign_id text, p_provider_phone_number text, p_provider_state text, p_normalized_state text, p_failure_code text, p_failure_detail text';

  if v_definition is null
     or v_definition not like '%provisioning_status = ''failed''%'
     or v_definition not like '%suspended_at = coalesce(suspended_at, v_now)%'
     or v_definition not like '%last_verified_at = v_now%'
     or v_definition not like '%pg_advisory_xact_lock(1280265031, 2108)%'
     or v_definition not like '%v_sender_match_count = 1%'
     or v_definition not like '%p_provider_phone_number is null or s.e164_number = p_provider_phone_number%'
     or v_definition not like '%p_provider_assignment_id is null or s.assignment_id = p_provider_assignment_id%'
     or v_definition not like '%p_provider_campaign_id is null or s.campaign_id = p_provider_campaign_id%'
     or v_definition like '%inbound_ready = false%' then
    raise exception 'registry callback failure quarantine is incomplete';
  end if;

  if not exists (
    select 1
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'ingest_messaging_registry_callback'
       and p.prosecdef
       and p.proconfig @> array['search_path=pg_catalog, pg_temp', 'TimeZone=UTC']
  ) then
    raise exception 'registry callback security configuration drifted';
  end if;

  if not pg_catalog.has_function_privilege(
       'service_role',
       'public.ingest_messaging_registry_callback(text,text,text,text,text,text,jsonb,text,text,jsonb,text,text,text,text,text,text,text,text)',
       'execute'
     )
     or pg_catalog.has_function_privilege(
       'authenticated',
       'public.ingest_messaging_registry_callback(text,text,text,text,text,text,jsonb,text,text,jsonb,text,text,text,text,text,text,text,text)',
       'execute'
     )
     or pg_catalog.has_function_privilege(
       'anon',
       'public.ingest_messaging_registry_callback(text,text,text,text,text,text,jsonb,text,text,jsonb,text,text,text,text,text,text,text,text)',
       'execute'
     ) then
    raise exception 'registry callback execution privilege drifted';
  end if;
end;
$verify_registry_callback_fail_closed$;

commit;
