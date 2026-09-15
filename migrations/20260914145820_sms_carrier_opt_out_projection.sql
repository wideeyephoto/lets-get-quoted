-- Carrier 21610 means an explicit recipient opt-out for Twilio and SignalWire.
-- Project it with the canonical receipt transaction, including reconciliation.
-- No carrier call or historical-consent rewrite is performed by this migration.
begin;

alter table public.sms_events
  add column if not exists sender_campaign_id_at_send text,
  add column if not exists sender_e164_at_send text,
  add column if not exists sender_account_id_at_send uuid,
  add column if not exists sender_scope_recorded_at timestamptz;
alter table public.sms_webhook_receipts
  add column if not exists carrier_opt_out_disposition text;

alter table public.sms_sender_keyword_preferences
  drop constraint if exists sms_sender_keyword_preferences_source_check;
alter table public.sms_sender_keyword_preferences
  add constraint sms_sender_keyword_preferences_source_check
  check (source in ('inbound_stop', 'inbound_start', 'carrier_21610'));
alter table public.sms_campaign_keyword_preferences
  drop constraint if exists sms_campaign_keyword_preferences_source_check;
alter table public.sms_campaign_keyword_preferences
  add constraint sms_campaign_keyword_preferences_source_check
  check (source in ('inbound_stop', 'inbound_start', 'carrier_21610'));

-- Capture scope at the existing atomic request-start boundary. Do not infer
-- historical Campaigns from today's inventory, which can have been reassigned.
create or replace function public.capture_sms_sender_scope_at_request()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $$
declare
  v_sender public.sms_sender_numbers%rowtype;
begin
  if current_user in ('anon', 'authenticated') then
    raise exception 'Browser sessions cannot assign SMS request scope' using errcode = '42501';
  end if;
  if new.send_started_at is not null
     and (tg_op = 'INSERT' or new.send_started_at is distinct from old.send_started_at) then
    select s.* into v_sender from public.sms_sender_numbers s
     where s.id = new.sender_number_id and s.provider = new.provider
     for share;
    if not found then
      raise exception 'SMS request sender scope unavailable' using errcode = 'P5102';
    end if;
    new.sender_campaign_id_at_send := nullif(pg_catalog.lower(pg_catalog.btrim(v_sender.campaign_id)), '');
    new.sender_e164_at_send := v_sender.e164_number;
    new.sender_account_id_at_send := v_sender.account_id;
    new.sender_scope_recorded_at := new.send_started_at;
  end if;
  return new;
end;
$$;
revoke all on function public.capture_sms_sender_scope_at_request() from public, anon, authenticated, service_role;
drop trigger if exists sms_events_capture_sender_scope on public.sms_events;
create trigger sms_events_capture_sender_scope
before insert or update of send_started_at, sender_campaign_id_at_send,
  sender_e164_at_send, sender_account_id_at_send, sender_scope_recorded_at
on public.sms_events for each row
execute function public.capture_sms_sender_scope_at_request();

create or replace function public.apply_sms_carrier_opt_out_receipt(p_receipt_id uuid)
returns text
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $$
declare
  v_receipt public.sms_webhook_receipts%rowtype;
  v_event public.sms_events%rowtype;
  v_sender public.sms_sender_numbers%rowtype;
  v_campaign text;
  v_preference_at timestamptz;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  select r.* into v_receipt from public.sms_webhook_receipts r where r.id = p_receipt_id for update;
  if not found then
    raise exception 'SMS carrier receipt is unavailable' using errcode = 'P0002';
  end if;
  if v_receipt.carrier_opt_out_disposition is not null then
    return v_receipt.carrier_opt_out_disposition;
  end if;
  if v_receipt.webhook_kind <> 'status' or v_receipt.provider_error_code is distinct from '21610'
     or coalesce(v_receipt.provider_status, '') not in ('failed', 'undelivered')
     or v_receipt.sms_event_id is null then
    return (select r.carrier_opt_out_disposition from public.sms_webhook_receipts r where r.id = p_receipt_id);
  end if;
  select e.* into v_event from public.sms_events e where e.id = v_receipt.sms_event_id;
  select s.* into v_sender from public.sms_sender_numbers s
   where s.id = v_event.sender_number_id for share;
  v_campaign := nullif(pg_catalog.lower(pg_catalog.btrim(v_sender.campaign_id)), '');

  if v_event.id is null or v_sender.id is null
     or v_event.provider is distinct from v_receipt.provider
     or v_event.provider_id is distinct from v_receipt.provider_event_id
     or v_event.account_id is distinct from v_receipt.account_id
     or v_sender.provider is distinct from v_receipt.provider
     or v_event.sender_number_id is distinct from v_receipt.sender_number_id
     or v_event.sender_scope_recorded_at is null
     or v_event.sender_campaign_id_at_send is distinct from v_campaign
     or v_event.sender_e164_at_send is distinct from v_sender.e164_number
     or v_event.sender_account_id_at_send is distinct from v_sender.account_id then
    insert into public.sms_operator_review_items (
      webhook_receipt_id, reason, severity, provider, account_id,
      sender_number_id, sms_event_id, provider_event_id,
      provider_status, provider_error_code, resolution_note
    ) values (
      v_receipt.id, 'ambiguous_destination', 'critical', v_receipt.provider, v_event.account_id,
      v_event.sender_number_id, v_event.id, v_receipt.provider_event_id,
      v_receipt.provider_status, '21610', 'Carrier opt-out sender scope is missing or changed; review before resending.'
    ) on conflict (webhook_receipt_id) do update
      set reason = 'ambiguous_destination', severity = 'critical', review_state = 'open',
          resolved_at = null,
          resolution_note = pg_catalog.concat_ws(' | ', public.sms_operator_review_items.resolution_note,
            'Carrier opt-out sender scope is missing or changed; review before resending.');
    update public.sms_webhook_receipts set carrier_opt_out_disposition = 'review_unbound_sender' where id = v_receipt.id;
    return (select r.carrier_opt_out_disposition from public.sms_webhook_receipts r where r.id = p_receipt_id);
  end if;

  -- Match the sender-then-Campaign order used by STOP/START and final egress.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'sms-sender-consent:' || v_sender.id::text || ':' || v_event.phone_number, 20260821));
  if v_campaign is not null then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      'sms-campaign-consent:' || v_sender.provider || ':' || v_campaign || ':' || v_event.phone_number, 20260906));
    select p.updated_at into v_preference_at
      from public.sms_campaign_keyword_preferences p
     where p.provider = v_sender.provider and p.campaign_id = v_campaign
       and p.phone_number = v_event.phone_number;
  else
    select p.updated_at into v_preference_at
      from public.sms_sender_keyword_preferences p
     where p.sender_number_id = v_sender.id and p.phone_number = v_event.phone_number;
  end if;

  -- The request preceded a later keyword decision. Preserve the newer choice,
  -- even if this is the first arrival of the old carrier callback.
  if v_preference_at > v_event.sender_scope_recorded_at then
    update public.sms_webhook_receipts set carrier_opt_out_disposition = 'ignored_newer_preference' where id = v_receipt.id;
    return (select r.carrier_opt_out_disposition from public.sms_webhook_receipts r where r.id = p_receipt_id);
  end if;

  insert into public.sms_sender_keyword_preferences (
    sender_number_id, phone_number, status, source, opted_out_at, updated_at
  ) values (v_sender.id, v_event.phone_number, 'opted_out', 'carrier_21610', v_now, v_now)
  on conflict (sender_number_id, phone_number) do update
    set status = excluded.status, source = excluded.source,
        opted_out_at = excluded.opted_out_at, updated_at = excluded.updated_at;
  -- The existing trigger projects this into the exact provider/Campaign row.
  -- Both final egress and producer checks already read that canonical veto.
  update public.sms_webhook_receipts set carrier_opt_out_disposition = 'applied' where id = v_receipt.id;
  return (select r.carrier_opt_out_disposition from public.sms_webhook_receipts r where r.id = p_receipt_id);
end;
$$;
revoke all on function public.apply_sms_carrier_opt_out_receipt(uuid) from public, anon, authenticated, service_role;
grant execute on function public.apply_sms_carrier_opt_out_receipt(uuid) to service_role;

create or replace function public.project_sms_carrier_opt_out()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $$
begin
  if new.webhook_kind = 'status' and new.provider_error_code = '21610'
     and new.sms_event_id is not null then
    perform public.apply_sms_carrier_opt_out_receipt(new.id);
  end if;
  return new;
end;
$$;
revoke all on function public.project_sms_carrier_opt_out() from public, anon, authenticated, service_role;
drop trigger if exists sms_status_project_carrier_opt_out on public.sms_webhook_receipts;
create trigger sms_status_project_carrier_opt_out
after insert or update of sms_event_id on public.sms_webhook_receipts
for each row execute function public.project_sms_carrier_opt_out();

commit;
