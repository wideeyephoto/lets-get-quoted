-- Register the carrier-verified LGQ crew/subcontractor dispatch sender.
--
-- SignalWire confirms that the individual number assignment is Completed and
-- that the exact phone resource is SMS-capable, Campaign-bound, and configured
-- for the production POST LaML webhook. This migration performs no provider
-- request and changes no runtime feature gate.

begin;

do $register_signalwire_dispatch_sender$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_sender public.sms_sender_numbers%rowtype;
begin
  -- Use the same first lock as every SignalWire sender/voice identity mutation
  -- before touching the inventory. The table's cross-rail trigger reacquires
  -- this transaction lock safely and then checks unresolved voice ownership.
  perform pg_catalog.pg_advisory_xact_lock(1280265031, 2108);

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
    inbound_resource_id,
    inbound_webhook_url,
    provisioning_status,
    inbound_ready,
    activated_at,
    last_verified_at,
    provider_brand_state,
    provider_campaign_state,
    provider_verified_at,
    provider_phone_verified_at,
    provider_sms_capable,
    inbound_request_method,
    inbound_message_handler,
    updated_at
  ) values (
    'signalwire',
    '+18103208333',
    'b28fc2e0-3a92-43f0-a817-923defaf9c4c',
    'lgq_dispatch',
    null,
    '4a09f38f-2de4-48b7-aba5-dac76a398ccf',
    '19e7c875-3611-4b40-8429-7dae3b5e6553',
    '5d101ac6-955f-40cf-a0b8-18b5b5121a4b',
    'assigned',
    '53ae4e4a-d03f-426b-9983-b09ba496fc43',
    'https://app.letsgetquoted.com/api/sms/inbound',
    'active',
    true,
    v_now,
    v_now,
    'complete',
    'complete',
    v_now,
    v_now,
    true,
    'POST',
    'laml_webhooks',
    v_now
  )
  on conflict (provider, e164_number) do nothing;

  select sender.* into v_sender
    from public.sms_sender_numbers sender
   where sender.provider = 'signalwire'
     and sender.e164_number = '+18103208333'
   for update;

  if not found then
    raise exception 'LGQ dispatch sender was not registered'
      using errcode = '55000';
  end if;

  -- Never rewrite a collision. Provider phone, brand, Campaign, individual
  -- assignment, inbound destination, purpose, and tenant shape are identity.
  if v_sender.provider_number_id is distinct from 'b28fc2e0-3a92-43f0-a817-923defaf9c4c'
     or v_sender.purpose is distinct from 'lgq_dispatch'
     or v_sender.account_id is not null
     or v_sender.brand_id is distinct from '4a09f38f-2de4-48b7-aba5-dac76a398ccf'
     or v_sender.campaign_id is distinct from '19e7c875-3611-4b40-8429-7dae3b5e6553'
     or v_sender.assignment_id is distinct from '5d101ac6-955f-40cf-a0b8-18b5b5121a4b'
     or v_sender.inbound_resource_id is distinct from '53ae4e4a-d03f-426b-9983-b09ba496fc43'
     or v_sender.inbound_webhook_url is distinct from 'https://app.letsgetquoted.com/api/sms/inbound'
     or v_sender.provisioning_application_id is not null then
    raise exception 'LGQ dispatch sender conflicts with canonical inventory identity'
      using errcode = '23505';
  end if;

  -- The row is an egress and ingress authority. Refuse to complete if any live
  -- carrier proof is absent or if an existing row is suspended/downgraded.
  if v_sender.assignment_state is distinct from 'assigned'
     or v_sender.provisioning_status is distinct from 'active'
     or v_sender.inbound_ready is distinct from true
     or v_sender.activated_at is null
     or v_sender.last_verified_at is null
     or v_sender.suspended_at is not null
     or v_sender.provider_brand_state is distinct from 'complete'
     or v_sender.provider_campaign_state is distinct from 'complete'
     or v_sender.provider_verified_at is null
     or v_sender.provider_phone_verified_at is null
     or v_sender.provider_sms_capable is distinct from true
     or pg_catalog.upper(coalesce(v_sender.inbound_request_method, '')) <> 'POST'
     or pg_catalog.lower(coalesce(v_sender.inbound_message_handler, '')) <> 'laml_webhooks' then
    raise exception 'LGQ dispatch sender lacks complete carrier activation proof'
      using errcode = '55000';
  end if;
end;
$register_signalwire_dispatch_sender$;

-- SignalWire assignment order a2bac09b-99c8-4423-a1bc-0cacf02858fa is
-- orchestration evidence, not the canonical individual assignment. The sender
-- inventory's assignment_id deliberately stores individual assignment
-- 5d101ac6-955f-40cf-a0b8-18b5b5121a4b. Signed provider callbacks retain the
-- order separately in messaging_registry_callbacks.provider_order_id.

commit;
