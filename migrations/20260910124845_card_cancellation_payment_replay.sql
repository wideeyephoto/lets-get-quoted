-- A delayed paid Checkout event must not restart a printer-canceled order.
begin;

create or replace function public.claim_card_fulfillment(p_account_id uuid,p_order_id uuid,p_session_id text,p_payment_intent_id text,p_total_cents integer,p_tax_cents integer,p_lease uuid,p_fee_cents integer)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare ord public.merchandise_orders;
begin
  select * into ord from public.merchandise_orders where id=p_order_id and account_id=p_account_id for update;
  if ord.id is null or ord.proof_id is null then raise exception 'Card order unavailable'; end if;
  if p_payment_intent_id is null or p_payment_intent_id='' or p_fee_cents is null or p_fee_cents<0 then raise exception 'Payment details missing'; end if;
  if ord.stripe_session_id is not null and ord.stripe_session_id<>p_session_id then raise exception 'Payment session mismatch'; end if;
  if p_total_cents<>round((ord.subtotal+ord.shipping_cost)*100)::integer+p_tax_cents or p_tax_cents<0 then raise exception 'Payment amount mismatch'; end if;
  if ord.payment_status in ('cancelled','refunded','disputed','partially_refunded') then raise exception 'Order payment cannot be fulfilled'; end if;
  -- Cancellation is terminal for fulfillment; it does not itself refund payment.
  if ord.fulfillment_status in ('accepted','in_production','partially_shipped','shipped','delivered','on_hold','cancelled') then return jsonb_build_object('completed',true); end if;
  if ord.fulfillment_lease_expires_at>now() then raise exception 'Fulfillment already being processed'; end if;
  insert into public.merchandise_revenue_ledger(account_id,order_id,order_number,gross_retail_amount,wholesale_manufacturing_cost,platform_cut_amount,stripe_processing_fee,net_platform_profit,event_key)
    select ord.account_id,ord.id,ord.order_number,ord.subtotal,q.wholesale_cost_cents/100.0,q.platform_fee_cents/100.0,p_fee_cents/100.0,
      ord.subtotal-q.wholesale_cost_cents/100.0-p_fee_cents/100.0,'card-payment:'||p_payment_intent_id
    from public.merchandise_order_quotes q where q.id=ord.quote_id and q.account_id=ord.account_id
    on conflict(event_key) where event_key is not null do nothing;
  update public.merchandise_orders set payment_status='paid',status='paid',stripe_session_id=p_session_id,stripe_payment_intent_id=p_payment_intent_id,
    tax_amount=p_tax_cents/100.0,total_amount=p_total_cents/100.0,fulfillment_status='submitting',fulfillment_lease_token=p_lease,
    fulfillment_lease_expires_at=now()+interval '5 minutes' where id=ord.id;
  return jsonb_build_object('completed',false);
end $$;

revoke all on function public.claim_card_fulfillment(uuid,uuid,text,text,integer,integer,uuid,integer) from public,anon,authenticated;
grant execute on function public.claim_card_fulfillment(uuid,uuid,text,text,integer,integer,uuid,integer) to service_role;

commit;
