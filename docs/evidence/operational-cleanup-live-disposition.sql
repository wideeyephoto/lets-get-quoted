do $$
declare old_event public.billing_events; successor public.billing_events; sub public.billing_subscriptions;
  action_key text := 'operational-cleanup-20260909:live-superseded:13eb0d53-2433-4cea-b7ae-0529d8878909';
begin
  perform pg_advisory_xact_lock(hashtextextended(action_key,0));
  select * into strict old_event from public.billing_events where id='13eb0d53-2433-4cea-b7ae-0529d8878909' for update;
  if exists(select 1 from public.account_events where kind='billing.historical_event_superseded' and meta->>'action_key'=action_key) then
    if old_event.processing_status <> 'ignored' or old_event.projection_result <> 'out_of_order_ignored' then raise exception 'Disposition drift'; end if;
    return;
  end if;
  select * into strict successor from public.billing_events where id='3b830e51-46d9-486b-bc9a-9b820fbb3cbb' for share;
  select * into strict sub from public.billing_subscriptions where id='935f4441-2979-498f-ab75-5b41c59d8b9f' for share;
  if coalesce(old_event.processing_status <> 'failed' or old_event.last_error <> 'provider_object_contract_mismatch'
     or old_event.attempt_count <> 1 or old_event.next_attempt_at is not null or not old_event.livemode
     or old_event.provider_event_id <> 'evt_1U9nSQGqh5LFKuTCeXUjIBq7'
     or old_event.payload_sha256 <> '567c82ddc8f53e0252c6afb8317fe5a9101018a9109769e1cc5b7bf7d42cf750'
     or old_event.payload->'data_object'->>'id' <> sub.provider_subscription_id
     or old_event.event_type <> 'customer.subscription.updated'
     or successor.event_type <> 'customer.subscription.updated'
     or successor.payload->'data_object'->>'id' <> sub.provider_subscription_id
     or successor.processing_status <> 'processed' or not successor.projection_applied
     or successor.provider_created_at <= old_event.provider_created_at
     or successor.livemode is distinct from old_event.livemode
     or successor.account_id <> sub.account_id
     or sub.account_id <> 'c63293b4-138e-45c2-8e11-0f4e6d7e08e6'
     or sub.provider_state_event_id <> successor.provider_event_id
     or sub.status <> 'active' or sub.plan_code <> 'solo' or sub.cancel_at_period_end
     or sub.provider_customer_id <> 'cus_V80unutoZovvJQ'
     or sub.provider_price_id <> 'price_1U5n8eGqh5LFKuTCh9KIQFws'
     or sub.current_period_end <> '2026-09-23T23:33:06Z',true) then raise exception 'Reviewed state changed'; end if;
  update public.billing_events set processing_status='ignored',processed_at=clock_timestamp(),
    projection_schema_version='stripe_subscription_projection_v1',projection_applied=false,
    projection_result='out_of_order_ignored',account_id=sub.account_id,billing_subscription_id=sub.id
    where id=old_event.id;
  insert into public.account_events(account_id,kind,summary,actor_email,meta) values(sub.account_id,
    'billing.historical_event_superseded','Reviewed historical subscription cancellation superseded by later applied provider state; no replay or business mutation.',
    'hello@letsgetquoted.com',jsonb_build_object('action_key',action_key,'before',to_jsonb(old_event),
    'successor_event_id',successor.id,'binding',to_jsonb(sub),'disposition','superseded',
    'provider_evidence','Stripe dashboard reviewed 2026-09-09: original cancellation; current active Solo, matching customer/item/period/workspace metadata',
    'evidence_reference','docs/operational-cleanup-2026-09-09.md','new_charges',0,'new_credits',0,'new_messages',0));
end $$;
