-- The marker and lead append commit together. It survives later triage edits
-- and makes retries after ingress has already committed safe.
alter table public.sms_events
  add column if not exists lead_delivery_history_recorded_at timestamptz;

create or replace function public.record_sms_lead_delivery_history(p_sms_event_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $$
declare
  v_event public.sms_events%rowtype;
  v_lead_id uuid;
  v_entry jsonb;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  select e.* into v_event from public.sms_events e
   where e.id = p_sms_event_id for update;
  if not found or v_event.lead_delivery_history_recorded_at is not null
     or v_event.status not in ('delivered', 'failed') then
    return false;
  end if;

  select l.id into v_lead_id from public.leads l
   where l.account_id = v_event.account_id
     and public.sms_normalize_recipient_phone(l.phone) = v_event.phone_number
   order by l.created_at desc, l.id desc
   limit 1;
  if v_lead_id is null then return false; end if;

  v_entry := pg_catalog.jsonb_build_object(
    'at', v_now,
    'label', case when v_event.status = 'delivered' then 'SMS Delivered' else 'SMS Delivery Failed' end,
    'note', case when v_event.status = 'delivered'
      then 'Delivered to ' || v_event.phone_number || '.'
      else 'Delivery to ' || v_event.phone_number || ' failed ('
        || coalesce(nullif(v_event.error_reason, ''), 'undelivered') || ').' end
  );
  -- UPDATE locks the lead and evaluates this expression against its latest row.
  -- Preserve all unrelated triage keys and any notes committed while waiting.
  update public.leads l
     set triage = pg_catalog.jsonb_set(
       case when pg_catalog.jsonb_typeof(l.triage) = 'object' then l.triage else '{}'::jsonb end,
       '{contactLog}',
       (case when pg_catalog.jsonb_typeof(l.triage->'contactLog') = 'array'
         then l.triage->'contactLog' else '[]'::jsonb end) || pg_catalog.jsonb_build_array(v_entry)
     ), updated_at = v_now
   where l.id = v_lead_id and l.account_id = v_event.account_id;
  if not found then return false; end if;

  update public.sms_events set lead_delivery_history_recorded_at = v_now
   where id = v_event.id;
  return true;
end;
$$;

revoke all on function public.record_sms_lead_delivery_history(uuid) from public, anon, authenticated;
grant execute on function public.record_sms_lead_delivery_history(uuid) to service_role;
