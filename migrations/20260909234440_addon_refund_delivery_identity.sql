-- Stripe may resend the same verified event with different delivery metadata
-- (for example pending_webhooks) or JSON formatting. Retain the first body hash
-- for audit; it is not the identity of a refund reconciliation signal.
-- The receipt boundary still verifies the signature, platform scope and mode.
-- The worker independently retrieves the charge/refunds and validates purchase
-- ownership before changing benefits. A replay never queues or applies work.
create or replace function public.ingest_addon_refund_event(
  p_livemode boolean,
  p_event_id text,
  p_charge_id text,
  p_payload_sha256 text
)
returns boolean language plpgsql security invoker set search_path='' as $$
declare v_row public.addon_refund_events%rowtype; v_inserted boolean;
begin
  insert into public.addon_refund_events(livemode,event_id,charge_id,payload_sha256)
    values(p_livemode,p_event_id,p_charge_id,p_payload_sha256) on conflict do nothing;
  v_inserted:=found;
  select * into strict v_row from public.addon_refund_events
    where livemode=p_livemode and event_id=p_event_id;
  if v_row.charge_id is distinct from p_charge_id then
    raise exception 'refund_event_identity_conflict' using errcode='22000';
  end if;
  if v_inserted then
    insert into public.addon_refund_jobs(livemode,charge_id) values(p_livemode,p_charge_id)
    on conflict(livemode,charge_id) do update set
      revision=addon_refund_jobs.revision+1,
      state=case when addon_refund_jobs.state='processing' then 'processing' else 'pending' end,
      next_attempt_at=now(),updated_at=now();
  end if;
  return v_inserted;
end $$;
