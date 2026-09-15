begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('merchandise-artwork', 'merchandise-artwork', false, 10000000, array['image/png'])
on conflict (id) do nothing;

-- Only the trusted server can create quotes/proofs and claim their checkout.
create or replace function public.claim_card_checkout(
  p_account_id uuid, p_quote_id uuid, p_proof_id uuid, p_approval_hash text,
  p_address jsonb, p_order_number text, p_lease_token uuid
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare q public.merchandise_order_quotes; proof public.merchandise_card_proofs;
  op public.merchandise_checkout_operations; order_uuid uuid; op_key text;
begin
  select * into q from public.merchandise_order_quotes where id=p_quote_id and account_id=p_account_id for update;
  if q.id is null or q.expires_at <= now() then raise exception 'Quote unavailable or expired'; end if;
  select * into proof from public.merchandise_card_proofs where id=p_proof_id and account_id=p_account_id;
  if proof.id is null or q.proof_id is distinct from proof.id or not proof.is_approved or not proof.preflight_passed
     or proof.approval_hash is distinct from p_approval_hash then raise exception 'Approved proof does not match quote'; end if;
  op_key := 'checkout_op_' || p_account_id || '_' || p_quote_id;
  select * into op from public.merchandise_checkout_operations where operation_key=op_key for update;
  if op.id is not null then
    if op.status in ('completed','expired') then raise exception 'Checkout already completed or expired'; end if;
    if op.stripe_session_id is not null then
      return jsonb_build_object('session_id',op.stripe_session_id,'order_id',op.order_id,'operation_key',op_key);
    end if;
    if op.lease_expires_at > now() then raise exception 'Checkout is being prepared. Please retry shortly'; end if;
    update public.merchandise_checkout_operations set lease_token=p_lease_token::text,lease_expires_at=now()+interval '5 minutes',status='processing' where id=op.id;
    return jsonb_build_object('order_id',op.order_id,'operation_key',op_key);
  end if;
  order_uuid := gen_random_uuid();
  insert into public.merchandise_orders(id,account_id,order_number,proof_id,quote_id,status,payment_status,fulfillment_status,
    items,subtotal,shipping_cost,tax_amount,total_amount,shipping_address,proof_approved_at)
  values(order_uuid,p_account_id,p_order_number,proof.id,q.id,'pending_payment','pending','not_submitted',
    jsonb_build_array(jsonb_build_object('productId','biz_cards','productName','Business Cards','quantity',q.card_count,
      'unitPrice',q.subtotal_cents/100.0/q.card_count,'totalPrice',q.subtotal_cents/100.0,'colorName','White','colorHex','#ffffff',
      'customizationDetails',jsonb_build_object('businessName',coalesce(p_address->>'companyName','Contractor Brand'),'finish','uncoated'))),
    q.subtotal_cents/100.0,q.shipping_cost_cents/100.0,0,q.total_cents/100.0,p_address,proof.approved_at);
  insert into public.merchandise_checkout_operations(operation_key,account_id,order_id,quote_id,status,lease_token,lease_expires_at)
    values(op_key,p_account_id,order_uuid,q.id,'processing',p_lease_token::text,now()+interval '5 minutes');
  return jsonb_build_object('order_id',order_uuid,'order_number',p_order_number,'operation_key',op_key);
end $$;

create or replace function public.complete_card_checkout(p_account_id uuid,p_operation_key text,p_lease_token uuid,p_session_id text)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare op public.merchandise_checkout_operations;
begin
  select * into op from public.merchandise_checkout_operations where operation_key=p_operation_key and account_id=p_account_id for update;
  if op.id is null or op.lease_token is distinct from p_lease_token::text then raise exception 'Checkout lease lost'; end if;
  update public.merchandise_orders set stripe_session_id=p_session_id where id=op.order_id and account_id=p_account_id;
  if not found then raise exception 'Checkout order missing'; end if;
  update public.merchandise_checkout_operations set stripe_session_id=p_session_id,status='pending',lease_token=null,lease_expires_at=null where id=op.id;
  return true;
end $$;

revoke all on function public.claim_card_checkout(uuid,uuid,uuid,text,jsonb,text,uuid) from public,anon,authenticated;
grant execute on function public.claim_card_checkout(uuid,uuid,uuid,text,jsonb,text,uuid) to service_role;
revoke all on function public.complete_card_checkout(uuid,text,uuid,text) from public,anon,authenticated;
grant execute on function public.complete_card_checkout(uuid,text,uuid,text) to service_role;


alter table public.neighborhood_halo_campaigns add column if not exists meta_ad_set_id text,
  add column if not exists meta_ad_id text, add column if not exists wallet_refunded_cents integer not null default 0,
  add column if not exists settlement_requested_at timestamptz, add column if not exists settlement_status text,
  add column if not exists delivery_lease_token uuid, add column if not exists delivery_lease_expires_at timestamptz;
-- Browser callers cannot fabricate debits, spend, or provider resource IDs.
revoke insert, update, delete on public.neighborhood_halo_campaigns from anon, authenticated;

create or replace function public.reserve_halo_campaign(p_account_id uuid,p_job_id uuid,p_campaign_id uuid,p_details jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare site_row public.sites; balance integer; budget integer; month_budget numeric; cap numeric;
  campaign public.neighborhood_halo_campaigns;
begin
  select * into site_row from public.sites where account_id=p_account_id for update;
  if site_row.id is null then raise exception 'Advertising wallet not found'; end if;
  budget := round((p_details->>'budget_dollars')::numeric*100)::integer;
  if budget is null or budget < 100 or budget > 100000 or (p_details->>'duration_days')::integer not between 1 and 30
    or (p_details->>'radius_miles')::numeric not between 1 and 25 then raise exception 'Invalid Halo budget or duration'; end if;
  if not exists(select 1 from public.jobs where id=p_job_id and account_id=p_account_id and status='complete') then raise exception 'Completed job not found'; end if;
  if exists(select 1 from public.neighborhood_halo_campaigns where account_id=p_account_id and job_id=p_job_id and deleted_at is null and status in ('pending_provisioning','active','paused')) then raise exception 'Halo already reserved for this job'; end if;
  if (p_details->>'center_lat')::numeric is null or (p_details->>'center_lng')::numeric is null
    or abs((p_details->>'center_lat')::numeric)>90 or abs((p_details->>'center_lng')::numeric)>180 then raise exception 'Verified coordinates required'; end if;
  if exists(select 1 from public.neighborhood_halo_campaigns c where c.account_id=p_account_id and c.deleted_at is null
    and c.status in ('pending_provisioning','active','paused')
    and 3959*2*asin(least(1,sqrt(power(sin(radians(c.center_lat::float8-(p_details->>'center_lat')::float8)/2),2)
      + cos(radians(c.center_lat::float8))*cos(radians((p_details->>'center_lat')::float8))*power(sin(radians(c.center_lng::float8-(p_details->>'center_lng')::float8)/2),2))))
    < (p_details->>'radius_miles')::float8*0.75) then raise exception 'An existing Halo covers this zone'; end if;
  select coalesce(monthly_spend_cap_dollars,250) into cap from public.neighborhood_halo_settings where account_id=p_account_id;
  cap := coalesce(cap,250);
  select coalesce(sum((wallet_deducted_cents-wallet_refunded_cents)/100.0),0) into month_budget
    from public.neighborhood_halo_campaigns where account_id=p_account_id and created_at>=date_trunc('month',now());
  if month_budget+budget/100.0>cap then raise exception 'Monthly Halo spending cap exceeded'; end if;
  balance := coalesce((site_row.content->'adCampaign'->>'walletBalanceCents')::integer,0);
  if balance<budget then raise exception 'INSUFFICIENT_WALLET_BALANCE'; end if;
  insert into public.neighborhood_halo_campaigns(id,account_id,job_id,status,street_name,neighborhood_name,city,state,
    center_lat,center_lng,radius_miles,budget_dollars,daily_budget_dollars,duration_days,wallet_deducted_cents,
    ad_copy,before_photo_url,after_photo_url,landing_page_url,expires_at)
  values(p_campaign_id,p_account_id,p_job_id,'pending_provisioning',p_details->>'street_name',p_details->>'neighborhood_name',
    p_details->>'city',p_details->>'state',(p_details->>'center_lat')::numeric,(p_details->>'center_lng')::numeric,
    (p_details->>'radius_miles')::numeric,budget/100.0,(p_details->>'daily_budget_dollars')::numeric,(p_details->>'duration_days')::integer,
    budget,p_details->'ad_copy',p_details->>'before_photo_url',p_details->>'after_photo_url',p_details->>'landing_page_url',(p_details->>'expires_at')::timestamptz)
    returning * into campaign;
  update public.sites set content=coalesce(content,'{}') || jsonb_build_object('adCampaign',coalesce(content->'adCampaign','{}') || jsonb_build_object('walletBalanceCents',balance-budget)) where id=site_row.id;
  return to_jsonb(campaign);
end $$;

create or replace function public.settle_halo_campaign(p_account_id uuid,p_campaign_id uuid,p_spend_cents integer,p_status text,p_reason text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare site_row public.sites; campaign public.neighborhood_halo_campaigns; refund integer; balance integer;
begin
  if p_status not in ('failed','killed','completed') or p_spend_cents is null or p_spend_cents<0 then raise exception 'Invalid settlement'; end if;
  select * into site_row from public.sites where account_id=p_account_id for update;
  if site_row.id is null then raise exception 'Wallet unavailable'; end if;
  select * into campaign from public.neighborhood_halo_campaigns where id=p_campaign_id and account_id=p_account_id for update;
  if campaign.id is null then raise exception 'Campaign unavailable'; end if;
  if campaign.status in ('failed','killed','completed') then return to_jsonb(campaign); end if;
  p_spend_cents:=greatest(p_spend_cents,round(campaign.spend_dollars*100)::integer);
  refund:=greatest(0,campaign.wallet_deducted_cents-p_spend_cents-campaign.wallet_refunded_cents);
  balance:=coalesce((site_row.content->'adCampaign'->>'walletBalanceCents')::integer,0);
  update public.sites set content=coalesce(content,'{}') || jsonb_build_object('adCampaign',coalesce(content->'adCampaign','{}') || jsonb_build_object('walletBalanceCents',balance+refund)) where id=site_row.id;
  update public.neighborhood_halo_campaigns set status=p_status,spend_dollars=p_spend_cents/100.0,wallet_refunded_cents=wallet_refunded_cents+refund,
    auto_kill_reason=p_reason,auto_killed_at=now(),updated_at=now() where id=campaign.id returning * into campaign;
  return to_jsonb(campaign);
end $$;
revoke all on function public.reserve_halo_campaign(uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.reserve_halo_campaign(uuid,uuid,uuid,jsonb) to service_role;
revoke all on function public.settle_halo_campaign(uuid,uuid,integer,text,text) from public,anon,authenticated;
grant execute on function public.settle_halo_campaign(uuid,uuid,integer,text,text) to service_role;

create or replace function public.atomic_ad_wallet_credit_v2(
  p_account_id uuid,p_payment_intent_id text,p_credit_cents integer,p_fee_cents integer default 0,
  p_funding_model text default null,p_monthly_budget_cents integer default null,p_status text default 'active',
  p_landing_page_url text default null,p_google_campaign_id text default null,p_google_campaign_resource text default null,
  p_provisioning_status text default null,p_provisioning_message text default null,p_metadata jsonb default '{}'
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare result jsonb; site_row public.sites; metadata jsonb;
begin
  if p_fee_cents<0 then raise exception 'Invalid fee'; end if;
  select * into site_row from public.sites where account_id=p_account_id for update;
  if site_row.id is null then return jsonb_build_object('success',false,'error','site_not_found'); end if;
  if site_row.content->'adCampaign'->>'walletBalanceCents' is null then
    update public.sites set content=coalesce(content,'{}') || jsonb_build_object('adCampaign',coalesce(content->'adCampaign','{}') || '{"walletBalanceCents":0}'::jsonb) where id=site_row.id;
  end if;
  result:=public.atomic_ad_wallet_credit(p_account_id,p_payment_intent_id,p_credit_cents,p_fee_cents,p_funding_model,p_monthly_budget_cents,
    p_status,p_landing_page_url,p_google_campaign_id,p_google_campaign_resource,p_provisioning_status,p_provisioning_message);
  if (result->>'success')::boolean and not (result->>'already_credited')::boolean then
    select coalesce(jsonb_object_agg(key,value),'{}') into metadata from jsonb_each(p_metadata)
      where key=any(array['metaCampaignId','metaAdSetId','metaCreativeId','metaAdId','metaProvisioningStatus','metaProvisioningMessage',
        'channelAllocations','smsAlertsEnabled','smsAlertPhone','stripeCustomerId','stripeSubscriptionId','cancelAtPeriodEnd','currentPeriodEnd','targetCpaDollars']);
    if p_funding_model='weekly_drip' then metadata:=metadata||jsonb_build_object('weeklyBudgetCents',p_credit_cents); end if;
    update public.sites set content=jsonb_set(content,'{adCampaign}',content->'adCampaign' || metadata) where id=site_row.id;
  end if;
  return result;
end $$;
revoke all on function public.atomic_ad_wallet_credit_v2(uuid,text,integer,integer,text,integer,text,text,text,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.atomic_ad_wallet_credit_v2(uuid,text,integer,integer,text,integer,text,text,text,text,text,text,jsonb) to service_role;

create or replace function public.set_meta_delivery_state(p_account_id uuid,p_campaign_id text,p_active boolean,p_message text)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare site_row public.sites;
begin
  select * into site_row from public.sites where account_id=p_account_id for update;
  if site_row.id is null or site_row.content->'adCampaign'->>'metaCampaignId' is distinct from p_campaign_id then raise exception 'Meta campaign ownership mismatch'; end if;
  update public.sites set content=jsonb_set(content,'{adCampaign}',content->'adCampaign' || jsonb_build_object(
    'metaProvisioningStatus',case when p_active then 'active' else 'paused' end,
    'status',case when p_active then 'active' else 'pending_provisioning' end,'metaProvisioningMessage',p_message)) where id=site_row.id;
  return true;
end $$;
revoke all on function public.set_meta_delivery_state(uuid,text,boolean,text) from public,anon,authenticated;
grant execute on function public.set_meta_delivery_state(uuid,text,boolean,text) to service_role;

alter table public.merchandise_orders add column if not exists fulfillment_lease_token uuid,
  add column if not exists fulfillment_lease_expires_at timestamptz;
revoke insert,update,delete on public.merchandise_orders from anon,authenticated;
grant all on public.merchandise_orders,public.merchandise_revenue_ledger,public.merchandise_fulfillment_attempts to service_role;
alter table public.merchandise_revenue_ledger add column if not exists event_key text;
create unique index if not exists merchandise_revenue_event_key on public.merchandise_revenue_ledger(event_key) where event_key is not null;

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
  if ord.fulfillment_status in ('accepted','in_production','partially_shipped','shipped','delivered','on_hold') then return jsonb_build_object('completed',true); end if;
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
create or replace function public.finish_card_fulfillment(p_account_id uuid,p_order_id uuid,p_lease uuid,p_result jsonb)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare ord public.merchandise_orders; successful boolean; provider_state text;
begin
  select * into ord from public.merchandise_orders where id=p_order_id and account_id=p_account_id for update;
  if ord.id is null or ord.fulfillment_lease_token is distinct from p_lease then raise exception 'Fulfillment lease lost'; end if;
  successful:=coalesce((p_result->>'ok')::boolean,false);
  provider_state:=case when p_result->>'status'='inprocess' then 'in_production' when p_result->>'status'='fulfilled' then 'shipped' else 'accepted' end;
  update public.merchandise_orders set status=case when not successful then 'failed' when provider_state='accepted' then 'paid' else provider_state end,
    fulfillment_status=case when successful then provider_state else 'failed' end,printful_order_id=(p_result->>'printfulOrderId')::bigint,
    printful_external_id=ord.order_number,confirmed_at=case when successful then now() else null end,
    fulfillment_lease_token=null,fulfillment_lease_expires_at=null,updated_at=now() where id=ord.id;
  update public.merchandise_checkout_operations set status=case when successful then 'completed' else 'failed' end,last_error=p_result->>'error' where order_id=ord.id;
  insert into public.merchandise_fulfillment_attempts(order_id,attempt_number,provider,status,response_payload,error_message)
    values(ord.id,1,'printful',case when successful then 'succeeded' else 'failed' end,p_result,p_result->>'error');
  return true;
end $$;
revoke all on function public.claim_card_fulfillment(uuid,uuid,text,text,integer,integer,uuid,integer) from public,anon,authenticated;
grant execute on function public.claim_card_fulfillment(uuid,uuid,text,text,integer,integer,uuid,integer) to service_role;
revoke all on function public.finish_card_fulfillment(uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.finish_card_fulfillment(uuid,uuid,uuid,jsonb) to service_role;

create or replace function public.sync_halo_metrics(p_campaign_id uuid,p_spend_cents integer,p_impressions integer,p_clicks integer,p_days integer)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
  if least(p_spend_cents,p_impressions,p_clicks,p_days)<0 then raise exception 'Invalid Halo metrics'; end if;
  update public.neighborhood_halo_campaigns set spend_dollars=greatest(spend_dollars,p_spend_cents/100.0),
    impressions=greatest(impressions,p_impressions),clicks=greatest(clicks,p_clicks),days_active=greatest(days_active,p_days),updated_at=now()
    where id=p_campaign_id and status in ('active','paused');
  return found;
end $$;
revoke all on function public.sync_halo_metrics(uuid,integer,integer,integer,integer) from public,anon,authenticated;
grant execute on function public.sync_halo_metrics(uuid,integer,integer,integer,integer) to service_role;

create or replace function public.apply_printful_order_event(p_external_id text,p_provider_id bigint,p_updates jsonb)
returns boolean language plpgsql security invoker set search_path='' as $$
declare ord public.merchandise_orders; target_status text;
begin
  select * into ord from public.merchandise_orders where
    (p_external_id is not null and order_number=p_external_id) or (p_external_id is null and printful_order_id=p_provider_id) for update;
  if ord.id is null then raise exception 'Printer order not found'; end if;
  if ord.printful_order_id is not null and p_provider_id is not null and ord.printful_order_id<>p_provider_id then raise exception 'Printer order mismatch'; end if;
  target_status:=p_updates->>'fulfillment_status';
  -- A delayed production or failure callback cannot undo physical delivery.
  if ord.fulfillment_status='delivered' or (ord.fulfillment_status='shipped' and target_status<>'delivered') then return true; end if;
  if ord.fulfillment_status='cancelled' and target_status not in ('shipped','delivered') then return true; end if;
  update public.merchandise_orders set fulfillment_status=target_status,
    status=case when payment_status in ('refunded','disputed','partially_refunded') then ord.status else p_updates->>'status' end,
    tracking_number=coalesce(p_updates->>'tracking_number',tracking_number),tracking_carrier=coalesce(p_updates->>'tracking_carrier',tracking_carrier),
    estimated_delivery_date=coalesce((p_updates->>'estimated_delivery_date')::date,estimated_delivery_date),updated_at=now()
    where id=ord.id;
  return true;
end $$;
revoke all on function public.apply_printful_order_event(text,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.apply_printful_order_event(text,bigint,jsonb) to service_role;

create or replace function public.claim_halo_delivery(p_account_id uuid,p_campaign_id uuid,p_lease uuid)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
  update public.neighborhood_halo_campaigns set delivery_lease_token=p_lease,delivery_lease_expires_at=now()+interval '5 minutes'
    where id=p_campaign_id and account_id=p_account_id and (delivery_lease_expires_at is null or delivery_lease_expires_at<=now());
  return found;
end $$;
create or replace function public.release_halo_delivery(p_account_id uuid,p_campaign_id uuid,p_lease uuid)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
  update public.neighborhood_halo_campaigns set delivery_lease_token=null,delivery_lease_expires_at=null
    where id=p_campaign_id and account_id=p_account_id and delivery_lease_token=p_lease;
  return found;
end $$;
revoke all on function public.claim_halo_delivery(uuid,uuid,uuid),public.release_halo_delivery(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_halo_delivery(uuid,uuid,uuid),public.release_halo_delivery(uuid,uuid,uuid) to service_role;
create or replace function public.set_ad_lifecycle_state(p_account_id uuid,p_status text,p_google_id text,p_meta_id text)
returns boolean language plpgsql security invoker set search_path='' as $$
declare site_row public.sites;
begin
  if p_status not in ('active','paused') then raise exception 'Invalid delivery state'; end if;
  select * into site_row from public.sites where account_id=p_account_id for update;
  if site_row.id is null or site_row.content->'adCampaign'->>'googleCampaignId' is distinct from p_google_id
    or site_row.content->'adCampaign'->>'metaCampaignId' is distinct from p_meta_id then raise exception 'Campaign resources changed'; end if;
  update public.sites set content=jsonb_set(content,'{adCampaign}',content->'adCampaign'||jsonb_build_object(
    'status',p_status,'provisioningStatus',p_status,'metaProvisioningStatus',case when p_meta_id is null then null else p_status end)) where id=site_row.id;
  return true;
end $$;
revoke all on function public.set_ad_lifecycle_state(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.set_ad_lifecycle_state(uuid,text,text,text) to service_role;
commit;
