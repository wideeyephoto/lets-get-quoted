-- Make the shared-number courtesy claim the final STOP authority.
--
-- The route performs a fail-closed read before calling this function, but that
-- read and this receipt claim are separate transactions. A concurrent STOP
-- could otherwise commit between them and still allow the old receipt to
-- return a carrier <Message>. The canonical sender/recipient advisory lock is
-- the same one used by inbound STOP/START, so the preference read and immutable
-- notice claim now have a single serialization point.

begin;

create or replace function public.record_sms_shared_notice_reply(
  p_webhook_receipt_id uuid,
  p_egress_result text,
  p_response_body_sha256 text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $$
declare
  v_receipt public.sms_webhook_receipts%rowtype;
  v_sender public.sms_sender_numbers%rowtype;
  v_preference public.sms_sender_keyword_preferences%rowtype;
  v_consent public.sms_consent%rowtype;
  v_result public.sms_shared_notice_replies%rowtype;
  v_effective_egress_result text := p_egress_result;
  v_effective_body_sha256 text := p_response_body_sha256;
  v_recipient_opted_out boolean := false;
begin
  if p_webhook_receipt_id is null
     or p_egress_result not in ('twiml', 'suppressed')
     or p_response_body_sha256 is null
     or p_response_body_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'SMS shared notice reply result is invalid' using errcode = '22023';
  end if;

  select r.* into v_receipt
    from public.sms_webhook_receipts r
   where r.id = p_webhook_receipt_id
   for share;

  if v_receipt.id is null
     or v_receipt.webhook_kind <> 'inbound'
     or v_receipt.processing_state not in ('processed', 'review')
     or v_receipt.sender_number_id is null
     or v_receipt.from_number is null
     or v_receipt.from_number !~ '^\+[1-9][0-9]{7,14}$'
     or v_receipt.to_number is null then
    raise exception 'SMS shared notice reply is not bound to an exact inbound sender'
      using errcode = '55000';
  end if;

  -- STOP/START/HELP keep their separate compliance acknowledgement and audit.
  if v_receipt.disposition is not null
     and v_receipt.disposition like 'keyword\_%' then
    raise exception 'SMS shared notice reply may not answer a compliance keyword'
      using errcode = '55000';
  end if;

  select s.* into v_sender
    from public.sms_sender_numbers s
   where s.id = v_receipt.sender_number_id
     and s.provider = v_receipt.provider
     and s.e164_number = v_receipt.to_number
     and s.purpose in ('lgq_shared', 'lgq_dispatch')
     and s.account_id is null
     and s.provisioning_status = 'active'
     and s.assignment_state = 'assigned'
     and s.inbound_ready
     and s.activated_at is not null
     and s.suspended_at is null
   for share;

  if v_sender.id is null then
    raise exception 'SMS shared notice reply is not bound to an active LGQ platform sender'
      using errcode = '55000';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'sms-sender-consent:' || v_sender.id::text || ':' || v_receipt.from_number,
      20260821
    )
  );

  -- Global consent writers use this second account/recipient lock. Keep the
  -- canonical sender-then-recipient order used by inbound routing and the field
  -- worker so consent cannot change between the final read and notice claim.
  if v_receipt.account_id is not null then
    perform pg_catalog.pg_advisory_xact_lock(
      public.sms_inbound_recipient_lock_key(
        v_receipt.account_id,
        v_receipt.from_number
      )
    );
  end if;

  select preference.* into v_preference
    from public.sms_sender_keyword_preferences preference
   where preference.sender_number_id = v_sender.id
     and preference.phone_number = v_receipt.from_number
   for share;

  v_recipient_opted_out := v_preference.sender_number_id is not null
    and (
      v_preference.status = 'opted_out'
      or v_preference.opted_out_at is not null
    );

  if v_receipt.account_id is not null then
    select consent.* into v_consent
      from public.sms_consent consent
     where consent.account_id = v_receipt.account_id
       and consent.phone_number = v_receipt.from_number
     for share;

    -- An account-bound courtesy reply requires current affirmative consent;
    -- deletion, an unexpected state, and explicit STOP all fail closed.
    v_recipient_opted_out := v_recipient_opted_out
      or v_consent.id is null
      or v_consent.status <> 'opted_in'
      or v_consent.opted_out_at is not null;
  end if;

  if v_recipient_opted_out then
    v_effective_egress_result := 'suppressed';
    -- SHA-256 of the exact EMPTY_TWIML returned by the route. Persisting the
    -- suppressed claim prevents a retry after a later START from resurrecting
    -- an old courtesy response.
    v_effective_body_sha256 :=
      'f94774d9eace296b75aeb622792d92dd74b7873a3b10ade1f415c0d399cfac07';
  end if;

  insert into public.sms_shared_notice_replies (
    webhook_receipt_id, egress_result, response_body_sha256
  ) values (
    p_webhook_receipt_id, v_effective_egress_result, v_effective_body_sha256
  ) on conflict (webhook_receipt_id) do nothing
  returning * into v_result;

  -- Only the first unsuppressed claim may return a carrier Message verb.
  return v_result.webhook_receipt_id is not null
    and v_effective_egress_result = 'twiml';
end;
$$;

revoke all on function public.record_sms_shared_notice_reply(uuid, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.record_sms_shared_notice_reply(uuid, text, text)
  to service_role;

do $$
declare
  v_definition text;
begin
  select pg_catalog.pg_get_functiondef(p.oid) into v_definition
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'record_sms_shared_notice_reply'
     and p.proargtypes = '2950 25 25'::pg_catalog.oidvector;

  if v_definition is null
     or v_definition not like '%sms-sender-consent:%'
     or v_definition not like '%sms_inbound_recipient_lock_key%'
     or v_definition not like '%sms_sender_keyword_preferences%'
     or v_definition not like '%sms_consent%' then
    raise exception 'record_sms_shared_notice_reply STOP authority is incomplete';
  end if;
end
$$;

commit;
