-- Migration: 20260901000000_supabase_security_advisor_remediations.sql
-- Description: Remediate SECURITY DEFINER mutable search_path warnings and add covering indexes for all unindexed foreign keys

-- ============================================================================
-- 1. Remediate SECURITY DEFINER functions with immutable search paths
-- ============================================================================

-- Function: public.job_account_id
create or replace function public.job_account_id(j uuid)
returns uuid language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_account_id uuid;
begin
  select account_id into v_account_id from public.jobs where id = j;
  if v_account_id is null then
    return null;
  end if;

  if auth.role() = 'authenticated' then
    if not (public.is_owner(v_account_id) or public.crew_on_job(j)) then
      return null;
    end if;
  elsif auth.role() = 'anon' then
    return null;
  end if;

  return v_account_id;
end;
$$;
revoke execute on function public.job_account_id(uuid) from public, anon;
grant execute on function public.job_account_id(uuid) to authenticated, service_role;

-- Function: crew_jobs_update_guard
create or replace function crew_jobs_update_guard()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if coalesce(current_setting('app.crew_job_write', true), '') = 'on' then
    return new;
  end if;
  if is_crew(old.account_id)
     and (to_jsonb(new) - 'status') is distinct from (to_jsonb(old) - 'status') then
    raise exception 'crew may only change job status';
  end if;
  return new;
end;
$$;

-- Function: crew_set_job_status
create or replace function crew_set_job_status(j uuid, new_status text)
returns table (id uuid, status text, started_at timestamptz)
language plpgsql security definer set search_path = public, pg_temp as $$
declare current_status text;
begin
  if new_status not in ('in_progress', 'complete') then
    raise exception 'unsupported status %', new_status using errcode = 'check_violation';
  end if;
  if not crew_on_job(j) then
    raise exception 'you are not assigned to this job' using errcode = 'insufficient_privilege';
  end if;

  select jobs.status into current_status from jobs where jobs.id = j;
  if current_status is null then
    raise exception 'job not found' using errcode = 'no_data_found';
  end if;
  if current_status = 'archived' then
    raise exception 'that job has been archived' using errcode = 'check_violation';
  end if;

  perform set_config('app.crew_job_write', 'on', true);

  if new_status = 'in_progress' then
    update jobs
       set status = 'in_progress',
           started_at = coalesce(jobs.started_at, now())
     where jobs.id = j
 returning jobs.id, jobs.status, jobs.started_at
      into id, status, started_at;
  else
    update jobs
       set status = 'complete',
           completed_at = now()
     where jobs.id = j
 returning jobs.id, jobs.status, jobs.started_at
      into id, status, started_at;
  end if;

  return next;
end;
$$;

-- Function: crew_costs_guard
create or replace function crew_costs_guard()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare pinned numeric;
begin
  if not is_crew(new.account_id) then return new; end if;
  if new.type <> 'labor' then return new; end if;

  select c.hourly_rate into pinned from crew c where c.id = new.crew_id;
  if pinned is null then
    raise exception 'labor has to be attributed to a crew member on this account';
  end if;

  if new.rate is distinct from pinned
     and not exists (
       select 1 from time_entries t
        where t.crew_id = new.crew_id and t.job_id = new.job_id and t.rate = new.rate
     ) then
    raise exception 'crew may not set their own pay rate';
  end if;

  if new.hours is null or new.hours <= 0
     or abs(coalesce(new.amount, 0) - round(new.hours * new.rate, 2)) > 0.01 then
    raise exception 'labor amount must be hours x the rate on file';
  end if;
  return new;
end;
$$;

-- Function: crew_time_entries_guard
create or replace function crew_time_entries_guard()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare pinned numeric;
begin
  if not is_crew(new.account_id) then return new; end if;

  if tg_op = 'INSERT' then
    select c.hourly_rate into pinned from crew c where c.id = new.crew_id;
    new.rate := coalesce(pinned, 0);
    new.ended_at := null;
    new.cost_id := null;
    new.closed_by_owner := false;

    if new.started_at < now() - interval '13 hours' or new.started_at > now() + interval '5 minutes' then
      raise exception 'start time must be within 12 hours of now';
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.account_id is distinct from old.account_id
       or new.crew_id is distinct from old.crew_id
       or new.job_id is distinct from old.job_id
       or new.started_at is distinct from old.started_at
       or new.rate is distinct from old.rate
       or new.closed_by_owner is distinct from old.closed_by_owner then
      raise exception 'crew may only set the end time on their own shift';
    end if;

    if old.ended_at is not null and new.ended_at is distinct from old.ended_at then
      raise exception 'this shift is already closed';
    end if;

    if new.ended_at is not null and new.ended_at < new.started_at then
      raise exception 'shift cannot end before it started';
    end if;

    return new;
  end if;

  return new;
end;
$$;

-- Function: public.atomic_ad_wallet_credit
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
set search_path = public, pg_temp
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

  if p_payment_intent_id is not null and p_payment_intent_id <> '' then
    v_processed_ids := v_processed_ids || to_jsonb(p_payment_intent_id);
  end if;

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

-- Function: public.atomic_ad_wallet_spend
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
set search_path = public, pg_temp
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

  v_current_month := substr(p_date, 1, 7);
  v_last_sync_month := substr(coalesce(v_ad_state->>'lastSpendSyncAt', ''), 1, 7);

  if v_last_sync_month <> '' and v_last_sync_month <> v_current_month then
    v_spent_this_month := v_delta_spend;
  else
    v_spent_this_month := coalesce((v_ad_state->>'spendThisMonthCents')::integer, 0) + v_delta_spend;
  end if;

  v_total_spend_all_time := coalesce((v_ad_state->>'totalSpendAllTimeCents')::integer, 0) + v_delta_spend;

  v_should_refill := false;
  if coalesce(v_ad_state->>'fundingModel', '') = 'auto_refill_wallet' then
    if v_new_balance <= v_refill_threshold and v_spent_this_month < v_max_monthly_spend then
      v_should_refill := true;
    end if;
  end if;

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

-- ============================================================================
-- 2. Covering Indexes for Unindexed Foreign Keys
-- ============================================================================

create index if not exists idx_memberships_account_id on public.memberships (account_id);
create index if not exists idx_crew_user_id on public.crew (user_id);
create index if not exists idx_sites_account_id on public.sites (account_id);
create index if not exists idx_job_tasks_job_id on public.job_tasks (job_id);
create index if not exists idx_crew_assignments_job_id on public.crew_assignments (job_id);
create index if not exists idx_crew_assignments_account_id on public.crew_assignments (account_id);
create index if not exists idx_time_entries_job_id on public.time_entries (job_id);
create index if not exists idx_route_stops_saved_place_id on public.route_stops (saved_place_id);
create index if not exists idx_costs_account_id on public.costs (account_id);
create index if not exists idx_costs_crew_id on public.costs (crew_id);
create index if not exists idx_client_job_access_account_id on public.client_job_access (account_id);
create index if not exists idx_invoices_account_id on public.invoices (account_id);
create index if not exists idx_invoice_items_invoice_id on public.invoice_items (invoice_id);
create index if not exists idx_payments_account_id on public.payments (account_id);
create index if not exists idx_payments_invoice_id on public.payments (invoice_id);
create index if not exists idx_sms_events_payment_id on public.sms_events (payment_id);
create index if not exists idx_sms_consent_account_id on public.sms_consent (account_id);
create index if not exists idx_messaging_registrations_account_id on public.messaging_registrations (account_id);
create index if not exists idx_job_schedule_requests_account_id on public.job_schedule_requests (account_id);
create index if not exists idx_finance_plans_account_id on public.finance_plans (account_id);
create index if not exists idx_finance_plans_job_id on public.finance_plans (job_id);
create index if not exists idx_leads_converted_job on public.leads (converted_job);
create index if not exists idx_estimate_offers_crew_id on public.estimate_offers (crew_id);
create index if not exists idx_estimate_offers_route_stop_id on public.estimate_offers (route_stop_id);
create index if not exists idx_recurring_plans_client_id on public.recurring_plans (client_id);
create index if not exists idx_recurring_plans_last_job_id on public.recurring_plans (last_job_id);
create index if not exists idx_payment_plans_account_id on public.payment_plans (account_id);
create index if not exists idx_payment_plans_deposit_payment_id on public.payment_plans (deposit_payment_id);
create index if not exists idx_review_invites_account_id on public.review_invites (account_id);
create index if not exists idx_review_invites_job_id on public.review_invites (job_id);
create index if not exists idx_push_subscriptions_crew_id on public.push_subscriptions (crew_id);
create index if not exists idx_extra_stop_requests_client_id on public.extra_stop_requests (client_id);
create index if not exists idx_extra_stop_requests_payment_id on public.extra_stop_requests (payment_id);
create index if not exists idx_extra_stop_events_account_id on public.extra_stop_events (account_id);
create index if not exists idx_login_events_user_id on public.login_events (user_id);
create index if not exists idx_crew_pay_entries_crew_id on public.crew_pay_entries (crew_id);
create index if not exists idx_crew_pay_entry_lines_account_id on public.crew_pay_entry_lines (account_id);
create index if not exists idx_crew_pay_entry_lines_job_id on public.crew_pay_entry_lines (job_id);
create index if not exists idx_crew_pay_events_period_id on public.crew_pay_events (period_id);
create index if not exists idx_crew_pay_events_entry_id on public.crew_pay_events (entry_id);
create index if not exists idx_day_plan_prefs_crew_id on public.day_plan_prefs (crew_id);
create index if not exists idx_job_milestones_job_id on public.job_milestones (job_id);
create index if not exists idx_milestone_photos_account_id on public.milestone_photos (account_id);
create index if not exists idx_milestone_photos_job_id on public.milestone_photos (job_id);
create index if not exists idx_reschedule_offers_crew_id on public.reschedule_offers (crew_id);
create index if not exists idx_subcontractor_requests_claimed_crew_id on public.subcontractor_requests (claimed_crew_id);
create index if not exists idx_subcontractor_offers_crew_id on public.subcontractor_offers (crew_id);
create index if not exists idx_subcontractor_reviews_job_id on public.subcontractor_reviews (job_id);
create index if not exists idx_subcontractor_reviews_crew_id on public.subcontractor_reviews (crew_id);
create index if not exists idx_subcontractor_reviews_request_id on public.subcontractor_reviews (request_id);
create index if not exists idx_workspace_entitlements_account_id on public.workspace_entitlements (account_id);
create index if not exists idx_billing_events_billing_subscription_id on public.billing_events (billing_subscription_id);
create index if not exists idx_billing_payment_operations_account_id on public.billing_payment_operations (account_id);
create index if not exists idx_billing_direct_payment_settlement_tasks_account_id on public.billing_direct_payment_settlement_tasks (account_id);
create index if not exists idx_billing_direct_payment_settlement_tasks_job_id on public.billing_direct_payment_settlement_tasks (job_id);
create index if not exists idx_billing_direct_payment_settlement_tasks_invoice_id on public.billing_direct_payment_settlement_tasks (invoice_id);
create index if not exists idx_billing_direct_payment_settlement_tasks_sms_event_id on public.billing_direct_payment_settlement_tasks (sms_event_id);
create index if not exists idx_workspace_purchased_capacity_billing_event_id on public.workspace_purchased_capacity (billing_event_id);
create index if not exists idx_workspace_overage_settings_account_id on public.workspace_overage_settings (account_id);
create index if not exists idx_workspace_overage_settings_authorization_id on public.workspace_overage_settings (authorization_id);
create index if not exists idx_voice_call_admissions_reservation_id on public.voice_call_admissions (reservation_id);
create index if not exists idx_voice_settings_account_id on public.voice_settings (account_id);
create index if not exists idx_voice_settings_recording_disclosure_accepted_by on public.voice_settings (recording_disclosure_accepted_by);
create index if not exists idx_voice_calls_voice_event_id on public.voice_calls (voice_event_id);
create index if not exists idx_messaging_number_provisioning_operations_account_id on public.messaging_number_provisioning_operations (account_id);
create index if not exists idx_sms_inbound_action_tasks_account_id on public.sms_inbound_action_tasks (account_id);
create index if not exists idx_sms_inbound_action_tasks_customer_reply_event_id on public.sms_inbound_action_tasks (customer_reply_event_id);
create index if not exists idx_sms_inbound_action_tasks_owner_alert_event_id on public.sms_inbound_action_tasks (owner_alert_event_id);
create index if not exists idx_payment_sms_producer_tasks_account_id on public.payment_sms_producer_tasks (account_id);
create index if not exists idx_payment_sms_producer_tasks_sms_event_id on public.payment_sms_producer_tasks (sms_event_id);
create index if not exists idx_sms_missed_call_receipts_lead_id on public.sms_missed_call_receipts (lead_id);
create index if not exists idx_sms_missed_call_receipts_sms_event_id on public.sms_missed_call_receipts (sms_event_id);
create index if not exists idx_workspace_overage_event_settlements_account_id on public.workspace_overage_event_settlements (account_id);
create index if not exists idx_messaging_registry_callbacks_account_id on public.messaging_registry_callbacks (account_id);
create index if not exists idx_voice_call_workflows_call_id on public.voice_call_workflows (call_id);
create index if not exists idx_voice_call_workflows_assigned_user_id on public.voice_call_workflows (assigned_user_id);
create index if not exists idx_voice_call_workflows_reviewed_by on public.voice_call_workflows (reviewed_by);
create index if not exists idx_voice_call_notes_author_user_id on public.voice_call_notes (author_user_id);
create index if not exists idx_sms_events_crew_id on public.sms_events (crew_id);
create index if not exists idx_payments_recurring_plan_id on public.payments (recurring_plan_id);
create index if not exists idx_subcontractor_requests_claimed_offer_id on public.subcontractor_requests (claimed_offer_id);
