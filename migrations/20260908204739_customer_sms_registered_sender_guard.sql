-- An active number is not proof of an approved customer messaging lane.
-- Keep existing history, shared owner alerts, and crew dispatch unchanged.
begin;

create or replace function public.customer_sms_sender_registered(p_sender_id uuid, p_account_id uuid)
returns boolean language sql stable security invoker
set search_path = pg_catalog, public as $$
  select exists (
    select 1
      from public.sms_sender_numbers s
      join public.messaging_registration_applications a
        on a.id = s.provisioning_application_id and a.account_id = s.account_id
     where s.id = p_sender_id and s.account_id = p_account_id
       and s.provider = 'signalwire' and s.purpose = 'contractor_dedicated'
       and s.provisioning_status = 'active' and s.assignment_state = 'assigned'
       and s.inbound_ready and s.suspended_at is null
       and a.status = 'active' and a.suspended_at is null and a.activated_at is not null
       and a.provider = s.provider
       and a.provider_brand_id = s.brand_id and a.provider_campaign_id = s.campaign_id
       and a.provider_number_id = s.provider_number_id and a.purchased_number = s.e164_number
       and a.provider_brand_state = 'complete' and a.provider_campaign_state = 'complete'
       and a.provider_assignment_state = 'complete'
       and a.provider_verified_at is not null and a.provider_phone_verified_at is not null
       and a.provider_sms_capable is true and a.inbound_configured_at is not null
       and a.inbound_request_method = 'POST' and a.inbound_message_handler = 'laml_webhooks'
       and not exists (
         select 1 from public.sms_sender_numbers shared
          where shared.provider = s.provider and shared.campaign_id = s.campaign_id
            and shared.purpose in ('lgq_shared', 'lgq_dispatch')
       )
  );
$$;
revoke all on function public.customer_sms_sender_registered(uuid,uuid) from public, anon, authenticated;
grant execute on function public.customer_sms_sender_registered(uuid,uuid) to service_role;

-- Preserve the current lease, TTL, consent, suspension and campaign-wide STOP
-- implementation. Fail migration if the guarded egress location has changed.
do $guard$
declare
  definition text := pg_get_functiondef('public.stage_sms_delivery(uuid,uuid,text)'::regprocedure);
  anchor text := E'  update public.sms_events event\n     set provider = p_provider,';
  insertion text := $insertion$
  if v_event.billing_category in ('customer_message', 'payment_message', 'verification')
     and not public.customer_sms_sender_registered(v_sender.id, v_event.account_id) then
    return query select 'blocked_sender'::text, null::uuid, null::text, null::text;
    return;
  end if;

$insertion$;
begin
  if strpos(definition, 'public.customer_sms_sender_registered(v_sender.id, v_event.account_id)') = 0 then
    if (length(definition) - length(replace(definition, anchor, ''))) / length(anchor) <> 1 then
      raise exception 'SMS egress guard insertion point changed';
    end if;
    execute replace(definition, anchor, insertion || anchor);
  end if;
end $guard$;

revoke all on function public.stage_sms_delivery(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.stage_sms_delivery(uuid,uuid,text) to service_role;
commit;
