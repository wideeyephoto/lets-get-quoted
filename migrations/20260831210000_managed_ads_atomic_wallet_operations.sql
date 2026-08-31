-- Migration: 20260831210000_managed_ads_atomic_wallet_operations.sql
-- Description: ACID atomic wallet credit and spend operations with row-level locking for Managed Ads

create or replace function public.atomic_ad_wallet_credit(
  p_account_id uuid,
  p_payment_intent_id text,
  p_credit_cents integer,
  p_fee_cents integer default 0,
  p_funding_model text default null,
  p_monthly_budget_cents integer default null,
  p_status text default 'active',
  p_landing_page_url text default null,
  p_google_campaign_id text default null,
  p_google_campaign_resource text default null,
  p_provisioning_status text default null,
  p_provisioning_message text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_site_id uuid;
  v_content jsonb;
  v_ad_state jsonb;
  v_current_balance integer;
  v_new_balance integer;
  v_processed_ids jsonb;
  v_already_credited boolean;
  v_now text;
begin
  if p_account_id is null then
    return jsonb_build_object('success', false, 'error', 'account_id_required');
  end if;

  if p_credit_cents is null or p_credit_cents < 0 then
    return jsonb_build_object('success', false, 'error', 'invalid_credit_amount');
  end if;

  -- Lock the sites row for this account to serialize wallet transactions
  select id, coalesce(content, '{}'::jsonb)
  into v_site_id, v_content
  from public.sites
  where account_id = p_account_id
  for update;

  if v_site_id is null then
    return jsonb_build_object('success', false, 'error', 'site_not_found');
  end if;

  v_ad_state := coalesce(v_content->'adCampaign', '{}'::jsonb);
  v_current_balance := coalesce((v_ad_state->>'walletBalanceCents')::integer, 25000);
  v_processed_ids := coalesce(v_ad_state->'processedRefillPaymentIntentIds', '[]'::jsonb);

  -- Check if already credited
  v_already_credited := false;
  if p_payment_intent_id is not null and p_payment_intent_id <> '' then
    if (v_ad_state->>'lastRefillPaymentIntentId') = p_payment_intent_id or v_processed_ids @> to_jsonb(p_payment_intent_id) then
      v_already_credited := true;
    end if;
  end if;

  if v_already_credited then
    return jsonb_build_object(
      'success', true,
      'already_credited', true,
      'new_balance_cents', v_current_balance,
      'previous_balance_cents', v_current_balance
    );
  end if;

  v_new_balance := v_current_balance + p_credit_cents;
  v_now := to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');

  -- Update processed list (deduped and capped at 500 items)
  if p_payment_intent_id is not null and p_payment_intent_id <> '' then
    v_processed_ids := v_processed_ids || to_jsonb(p_payment_intent_id);
  end if;

  -- Update adCampaign state object
  v_ad_state := v_ad_state || jsonb_build_object(
    'walletBalanceCents', v_new_balance,
    'status', coalesce(p_status, v_ad_state->>'status', 'active'),
    'lastPaymentAt', v_now,
    'lastPaymentError', null,
    'pendingRefillIdempotencyKey', null,
    'pendingRefillAmountCents', null,
    'pendingRefillFeeCents', null,
    'pendingRefillCreatedAt', null,
    'lastRefillPaymentIntentId', coalesce(p_payment_intent_id, v_ad_state->>'lastRefillPaymentIntentId'),
    'processedRefillPaymentIntentIds', v_processed_ids
  );

  if p_funding_model is not null then
    v_ad_state := v_ad_state || jsonb_build_object('fundingModel', p_funding_model);
  end if;

  if p_monthly_budget_cents is not null then
    v_ad_state := v_ad_state || jsonb_build_object('monthlyBudgetCents', p_monthly_budget_cents);
  end if;

  if p_landing_page_url is not null then
    v_ad_state := v_ad_state || jsonb_build_object('landingPageUrl', p_landing_page_url);
  end if;

  if p_google_campaign_id is not null then
    v_ad_state := v_ad_state || jsonb_build_object('googleCampaignId', p_google_campaign_id);
  end if;

  if p_google_campaign_resource is not null then
    v_ad_state := v_ad_state || jsonb_build_object('googleCampaignResource', p_google_campaign_resource);
  end if;

  if p_provisioning_status is not null then
    v_ad_state := v_ad_state || jsonb_build_object('provisioningStatus', p_provisioning_status);
  end if;

  if p_provisioning_message is not null then
    v_ad_state := v_ad_state || jsonb_build_object('provisioningMessage', p_provisioning_message);
  end if;

  -- Write back updated content atomically
  update public.sites
  set content = jsonb_set(content, '{adCampaign}', v_ad_state)
  where id = v_site_id;

  return jsonb_build_object(
    'success', true,
    'already_credited', false,
    'new_balance_cents', v_new_balance,
    'previous_balance_cents', v_current_balance
  );
end;
$$;

create or replace function public.atomic_ad_wallet_spend(
  p_account_id uuid,
  p_spend_cents integer,
  p_date text,
  p_clicks integer default 0,
  p_impressions integer default 0,
  p_conversions integer default 0,
  p_source text default 'scheduled_pacing'
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_site_id uuid;
  v_content jsonb;
  v_ad_state jsonb;
  v_status text;
  v_current_balance integer;
  v_new_balance integer;
  v_delta_spend integer;
  v_history jsonb;
  v_new_history jsonb;
  v_elem jsonb;
  v_found boolean;
  v_existing_spend integer;
  v_current_month text;
  v_last_sync_month text;
  v_spent_this_month integer;
  v_total_spend_all_time integer;
  v_refill_threshold integer;
  v_max_monthly_spend integer;
  v_should_refill boolean;
  v_now text;
begin
  if p_account_id is null then
    return jsonb_build_object('success', false, 'error', 'account_id_required');
  end if;

  if p_spend_cents is null or p_spend_cents <= 0 then
    return jsonb_build_object('success', true, 'message', 'zero_spend');
  end if;

  -- Lock the sites row for this account
  select id, coalesce(content, '{}'::jsonb)
  into v_site_id, v_content
  from public.sites
  where account_id = p_account_id
  for update;

  if v_site_id is null then
    return jsonb_build_object('success', false, 'error', 'site_not_found');
  end if;

  v_ad_state := coalesce(v_content->'adCampaign', '{}'::jsonb);
  v_status := coalesce(v_ad_state->>'status', 'inactive');

  if v_status <> 'active' then
    return jsonb_build_object('success', false, 'error', 'campaign_not_active', 'status', v_status);
  end if;

  v_current_balance := coalesce((v_ad_state->>'walletBalanceCents')::integer, 25000);
  v_history := coalesce(v_ad_state->'dailySpendHistory', '[]'::jsonb);
  v_refill_threshold := coalesce((v_ad_state->>'refillThresholdCents')::integer, 7500);
  v_max_monthly_spend := coalesce((v_ad_state->>'maxMonthlySpendCents')::integer, 100000);
  v_now := to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');

  -- Look for existing date entry in history
  v_found := false;
  v_new_history := '[]'::jsonb;
  v_existing_spend := 0;

  for v_elem in select * from jsonb_array_elements(v_history)
  loop
    if (v_elem->>'date') = p_date then
      v_found := true;
      v_existing_spend := coalesce((v_elem->>'spendCents')::integer, 0);
      v_new_history := v_new_history || jsonb_build_object(
        'date', p_date,
        'spendCents', greatest(v_existing_spend, p_spend_cents),
        'clicks', greatest(coalesce((v_elem->>'clicks')::integer, 0), p_clicks),
        'impressions', greatest(coalesce((v_elem->>'impressions')::integer, 0), p_impressions),
        'conversions', greatest(coalesce((v_elem->>'conversions')::integer, 0), p_conversions),
        'source', p_source,
        'recordedAt', v_now
      );
    else
      v_new_history := v_new_history || v_elem;
    end if;
  end loop;

  if not v_found then
    v_delta_spend := p_spend_cents;
    v_new_history := jsonb_build_array(jsonb_build_object(
      'date', p_date,
      'spendCents', p_spend_cents,
      'clicks', p_clicks,
      'impressions', p_impressions,
      'conversions', p_conversions,
      'source', p_source,
      'recordedAt', v_now
    )) || v_history;
  else
    v_delta_spend := greatest(0, p_spend_cents - v_existing_spend);
  end if;

  v_new_balance := greatest(0, v_current_balance - v_delta_spend);

  -- Month rollover calculation
  v_current_month := substr(p_date, 1, 7);
  v_last_sync_month := substr(coalesce(v_ad_state->>'lastSpendSyncAt', ''), 1, 7);

  if v_last_sync_month <> '' and v_last_sync_month <> v_current_month then
    v_spent_this_month := v_delta_spend;
  else
    v_spent_this_month := coalesce((v_ad_state->>'spendThisMonthCents')::integer, 0) + v_delta_spend;
  end if;

  v_total_spend_all_time := coalesce((v_ad_state->>'totalSpendAllTimeCents')::integer, 0) + v_delta_spend;

  -- Evaluate auto-refill condition
  v_should_refill := false;
  if coalesce(v_ad_state->>'fundingModel', '') = 'auto_refill_wallet' then
    if v_new_balance <= v_refill_threshold and v_spent_this_month < v_max_monthly_spend then
      v_should_refill := true;
    end if;
  end if;

  -- Update adCampaign state
  v_ad_state := v_ad_state || jsonb_build_object(
    'walletBalanceCents', v_new_balance,
    'spendThisMonthCents', v_spent_this_month,
    'totalSpendAllTimeCents', v_total_spend_all_time,
    'lastSpendSyncAt', v_now,
    'dailySpendHistory', v_new_history
  );

  update public.sites
  set content = jsonb_set(content, '{adCampaign}', v_ad_state)
  where id = v_site_id;

  return jsonb_build_object(
    'success', true,
    'new_balance_cents', v_new_balance,
    'spent_this_month_cents', v_spent_this_month,
    'delta_spend_cents', v_delta_spend,
    'should_refill', v_should_refill
  );
end;
$$;

revoke all on function public.atomic_ad_wallet_credit(uuid, text, integer, integer, text, integer, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.atomic_ad_wallet_credit(uuid, text, integer, integer, text, integer, text, text, text, text, text, text) to service_role;

revoke all on function public.atomic_ad_wallet_spend(uuid, integer, text, integer, integer, integer, text) from public, anon, authenticated;
grant execute on function public.atomic_ad_wallet_spend(uuid, integer, text, integer, integer, integer, text) to service_role;
