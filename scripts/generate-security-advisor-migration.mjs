import fs from 'node:fs';

const schema = fs.readFileSync('schema.sql', 'utf8');

// Parse CREATE TABLE and ALTER TABLE foreign keys
const fkList = [];
const tableIndexes = new Map();

// Parse CREATE INDEX
const indexMatches = [...schema.matchAll(/create\s+(?:unique\s+)?index\s+(?:if\s+not\s+exists\s+)?([a-zA-Z0-9_]+)\s+on\s+(?:public\.)?([a-zA-Z0-9_]+)(?:\s+using\s+[a-z]+)?\s*\(([^)]+)\)/gi)];
for (const match of indexMatches) {
  const [, indexName, tableName, cols] = match;
  const t = tableName.toLowerCase();
  if (!tableIndexes.has(t)) tableIndexes.set(t, new Set());
  const firstCol = cols.split(',')[0].trim().replace(/^["']|["']$/g, '').split(' ')[0].toLowerCase();
  tableIndexes.get(t).add(firstCol);
}

// Parse inline foreign keys in CREATE TABLE
const tableChunks = schema.split(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-zA-Z0-9_]+)\s*\(/i);
for (let i = 1; i < tableChunks.length; i += 2) {
  const tableName = tableChunks[i].toLowerCase();
  const body = tableChunks[i + 1].split(');')[0];
  const colLines = body.split('\n');
  for (const line of colLines) {
    const trimmed = line.trim();
    const fkMatch = trimmed.match(/^([a-zA-Z0-9_]+)\s+[^,]*\breferences\s+(?:public\.)?([a-zA-Z0-9_]+)(?:\s*\(([a-zA-Z0-9_]+)\))?/i);
    if (fkMatch) {
      const [, colName, refTable, refCol] = fkMatch;
      fkList.push({ table: tableName, col: colName.toLowerCase(), refTable: refTable.toLowerCase(), refCol: refCol || 'id' });
    }
    const constraintMatch = trimmed.match(/foreign\s+key\s*\(([a-zA-Z0-9_]+)\)\s+references\s+(?:public\.)?([a-zA-Z0-9_]+)(?:\s*\(([a-zA-Z0-9_]+)\))?/i);
    if (constraintMatch) {
      const [, colName, refTable, refCol] = constraintMatch;
      fkList.push({ table: tableName, col: colName.toLowerCase(), refTable: refTable.toLowerCase(), refCol: refCol || 'id' });
    }
  }
}

// Parse ALTER TABLE ADD FOREIGN KEY
const alterMatches = [...schema.matchAll(/alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?(?:public\.)?([a-zA-Z0-9_]+)\s+add\s+(?:constraint\s+[a-zA-Z0-9_]+\s+)?foreign\s+key\s*\(([a-zA-Z0-9_]+)\)\s+references\s+(?:public\.)?([a-zA-Z0-9_]+)/gi)];
for (const match of alterMatches) {
  const [, tableName, colName, refTable] = match;
  fkList.push({ table: tableName.toLowerCase(), col: colName.toLowerCase(), refTable: refTable.toLowerCase(), refCol: 'id' });
}

// Filter unique unindexed FKs
const unindexedMap = new Map();
for (const fk of fkList) {
  const indexes = tableIndexes.get(fk.table);
  if (!indexes || !indexes.has(fk.col)) {
    const key = `${fk.table}.${fk.col}`;
    if (!unindexedMap.has(key)) {
      unindexedMap.set(key, fk);
    }
  }
}

console.log(`Found ${unindexedMap.size} unique unindexed FK columns.`);

const indexStatements = [];
for (const [key, fk] of unindexedMap.entries()) {
  const indexName = `idx_${fk.table}_${fk.col}`;
  indexStatements.push(`create index if not exists ${indexName} on public.${fk.table} (${fk.col});`);
}

const migrationSql = `-- Migration: 20260901000000_supabase_security_advisor_remediations.sql
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

${indexStatements.join('\n')}
`;

fs.writeFileSync('migrations/20260901000000_supabase_security_advisor_remediations.sql', migrationSql, 'utf8');
console.log('Successfully written migrations/20260901000000_supabase_security_advisor_remediations.sql');
