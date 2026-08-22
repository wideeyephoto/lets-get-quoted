-- Replay authenticated status receipts that arrived before provider identity
-- was persisted. This migration follows both the webhook inbox and delivery
-- queue foundations so neither lower-level migration depends on the other.

begin;

create or replace function public.reconcile_sms_matched_status_receipts(
  p_batch_size integer default 50
)
returns table (
  examined integer,
  projected integer,
  failed integer
)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $fn$
declare
  v_receipt public.sms_webhook_receipts%rowtype;
  v_disposition text;
  v_event_id uuid;
  v_examined integer := 0;
  v_projected integer := 0;
  v_failed integer := 0;
begin
  if p_batch_size is null or p_batch_size < 1 or p_batch_size > 500 then
    raise exception 'SMS matched-status reconciliation batch is invalid'
      using errcode = '22023';
  end if;

  for v_receipt in
    select r.*
      from public.sms_webhook_receipts r
     where r.webhook_kind = 'status'
       and r.processing_state = 'review'
       and r.disposition = 'unmatched_status'
       and r.sms_event_id is null
       and exists (
         select 1 from public.sms_events e
          where e.provider = r.provider
            and e.provider_id = r.provider_event_id
       )
     order by r.received_at, r.id
     limit p_batch_size
     for update skip locked
  loop
    v_examined := v_examined + 1;
    begin
      select s.status_disposition, s.sms_event_id
        into v_disposition, v_event_id
        from public.apply_sms_delivery_status_webhook(
          v_receipt.provider,
          v_receipt.provider_event_id,
          v_receipt.provider_status,
          v_receipt.provider_error_code,
          v_receipt.receipt_key,
          v_receipt.body_sha256,
          v_receipt.content_type,
          v_receipt.request_url
        ) s;
      if v_event_id is null
         or v_disposition not in ('applied', 'ignored_stale', 'ignored_terminal') then
        raise exception 'Matched SMS status receipt did not project'
          using errcode = '55000';
      end if;
      v_projected := v_projected + 1;
    exception when others then
      v_failed := v_failed + 1;
    end;
  end loop;

  return query select v_examined, v_projected, v_failed;
end
$fn$;

revoke all on function public.reconcile_sms_matched_status_receipts(integer)
  from public, anon, authenticated, service_role;
grant execute on function public.reconcile_sms_matched_status_receipts(integer)
  to service_role;

commit;
