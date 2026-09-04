-- Migration: 20260904070000_ai_voice_relay_script_support.sql
-- Allow relay_script as an approved call_handler alongside laml_webhooks for AI Voice.

-- 1. Update check constraint on voice_number_inventory
alter table public.voice_number_inventory
  drop constraint if exists voice_number_inventory_active_shape;

alter table public.voice_number_inventory
  add constraint voice_number_inventory_active_shape check (
    lifecycle_state <> 'active'
    or (
      voice_capable
      and provider_readiness_state = 'ready'
      and pg_catalog.lower(coalesce(call_handler, '')) in ('laml_webhooks', 'relay_script')
      and call_request_url ~ '^https://[^[:space:]]+/api/voice/ai$'
      and (call_request_method is null or call_request_method = 'POST')
      and (call_status_callback_url is null or call_status_callback_url ~ '^https://[^[:space:]]+/api/voice/provider-status$')
      and (call_status_callback_method is null or call_status_callback_method = 'POST')
      and provider_verified_at is not null
      and last_provider_sync_at is not null
      and activated_at is not null
      and suspended_at is null
      and released_at is null
    )
  );

-- 2. Update claim_voice_call_admission_v2 to accept relay_script
create or replace function public.claim_voice_call_admission_v2(
  p_account_id uuid,
  p_provider_call_id text,
  p_dialed_number text,
  p_concurrency_limit integer,
  p_caller_number text,
  p_caller_kind text
)
returns table(claim_status text, admission_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_existing public.voice_call_admissions%rowtype;
  v_open bigint;
  v_id uuid;
  v_voice_number_id uuid;
  v_route_revision bigint;
begin
  if p_account_id is null
     or p_provider_call_id is null
     or pg_catalog.length(pg_catalog.btrim(p_provider_call_id)) = 0
     or pg_catalog.length(p_provider_call_id) > 255
     or p_dialed_number is null
     or p_dialed_number !~ '^\+[1-9][0-9]{7,14}$'
     or p_concurrency_limit is null
     or p_concurrency_limit < 1
     or p_concurrency_limit > 100
     or (p_caller_number is not null and p_caller_number !~ '^\+1[2-9][0-9]{9}$')
     or p_caller_kind is null
     or p_caller_kind not in ('customer', 'owner', 'office', 'crew', 'staff_ambiguous', 'unknown') then
    raise exception 'voice admission claim arguments are invalid'
      using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('signalwire:' || p_provider_call_id, 63190215)
  );
  if exists (
    select 1
      from public.voice_provider_terminal_call_tombstones t
     where t.provider = 'signalwire'
       and t.provider_call_id = p_provider_call_id
       and t.expires_at > pg_catalog.clock_timestamp()
  ) then
    return query select 'call_terminal'::text, null::uuid;
    return;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_account_id::text, 84601211)
  );

  select v.id, a.ai_voice_route_revision
    into v_voice_number_id, v_route_revision
    from public.accounts a
    join public.voice_number_inventory v
      on v.account_id = a.id
     and v.e164_number = a.call_tracking_number
   where a.id = p_account_id
     and a.suspended_at is null
     and a.call_tracking_number = p_dialed_number
     and v.provider = 'signalwire'
     and v.purpose = 'ai_voice'
     and v.e164_number = p_dialed_number
     and v.lifecycle_state = 'active'
     and v.voice_capable
     and pg_catalog.lower(v.call_handler) in ('laml_webhooks', 'relay_script')
     and (v.call_request_method is null or v.call_request_method = 'POST')
     and v.call_request_url ~ '^https://[^[:space:]]+/api/voice/ai$'
     and (v.call_status_callback_url is null or v.call_status_callback_url ~ '^https://[^[:space:]]+/api/voice/provider-status$')
     and (v.call_status_callback_method is null or v.call_status_callback_method = 'POST')
     and v.provider_readiness_state = 'ready'
     and v.provider_verified_at is not null
     and v.provider_verified_at >= pg_catalog.clock_timestamp() - interval '6 hours'
     and v.provider_verified_at <= pg_catalog.clock_timestamp() + interval '5 minutes'
     and v.last_provider_sync_at is not null
     and v.last_provider_sync_at >= pg_catalog.clock_timestamp() - interval '6 hours'
     and v.last_provider_sync_at <= pg_catalog.clock_timestamp() + interval '5 minutes'
     and v.activated_at is not null
     and v.suspended_at is null
     and v.released_at is null
   for share of a, v;

  if not found then
    return query select 'number_not_ready'::text, null::uuid;
    return;
  end if;

  select a.* into v_existing
    from public.voice_call_admissions a
   where a.provider = 'signalwire'
     and a.provider_call_id = p_provider_call_id;

  if found then
    if v_existing.account_id <> p_account_id then
      raise exception 'voice call id is already bound to another workspace'
        using errcode = '22000';
    end if;
    if v_existing.provider_terminal_at is not null
       or exists (
         select 1 from public.voice_events e
          where e.provider = v_existing.provider
            and e.provider_call_id = v_existing.provider_call_id
       ) then
      return query select 'call_terminal'::text, v_existing.id;
    elsif v_existing.voice_number_id is distinct from v_voice_number_id
       or v_existing.dialed_number is distinct from p_dialed_number
       or v_existing.route_revision is distinct from v_route_revision
       or v_existing.caller_number is distinct from p_caller_number
       or v_existing.caller_kind is distinct from p_caller_kind then
      return query select 'number_not_ready'::text, null::uuid;
    elsif v_existing.admission_state = 'admitted'
      and v_existing.provider_terminal_at is null then
      return query select 'existing'::text, v_existing.id;
    else
      return query select 'busy'::text, v_existing.id;
    end if;
    return;
  end if;

  select pg_catalog.count(*) into v_open
    from public.voice_call_admissions a
   where a.account_id = p_account_id
     and a.provider = 'signalwire'
     and a.provider_terminal_at is null
     and a.admitted_at >= pg_catalog.clock_timestamp() - interval '60 minutes'
     and not exists (
       select 1
         from public.voice_events e
        where e.provider = a.provider
          and e.provider_call_id = a.provider_call_id
     );

  if v_open >= p_concurrency_limit then
    return query select 'at_capacity'::text, null::uuid;
    return;
  end if;

  insert into public.voice_call_admissions (
    account_id, provider, provider_call_id, reservation_id,
    reserved_minutes, admission_state, sender_number_id, voice_number_id,
    dialed_number, route_revision, caller_number, caller_kind
  ) values (
    p_account_id, 'signalwire', p_provider_call_id, null,
    0, 'claimed', null, v_voice_number_id, p_dialed_number, v_route_revision,
    p_caller_number, p_caller_kind
  )
  returning id into v_id;

  return query select 'claimed'::text, v_id;
end;
$$;

-- 3. Update apply_voice_number_provider_verification
create or replace function public.apply_voice_number_provider_verification(
  p_account_id uuid,
  p_voice_number_id uuid,
  p_observed_provider_object_id text,
  p_observed_result jsonb,
  p_verification_status text,
  p_error_code text default null
)
returns table(
  voice_number_id uuid,
  lifecycle_state text,
  provider_readiness_state text,
  last_provider_sync_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_inventory public.voice_number_inventory%rowtype;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_handler text;
  v_req_url text;
begin
  if p_verification_status not in ('ready', 'drifted', 'missing') then
    raise exception 'Invalid verification status %', p_verification_status
      using errcode = '22023';
  end if;

  select * into v_inventory
    from public.voice_number_inventory i
   where i.id = p_voice_number_id
     and i.account_id = p_account_id
     and i.provider = 'signalwire'
     and i.lifecycle_state in ('purchased', 'configuring', 'active', 'suspended')
   for update;

  if not found then
    raise exception 'Voice number inventory row % not found or not in a verifiable state', p_voice_number_id
      using errcode = '22000';
  end if;

  if p_verification_status = 'ready' then
    v_handler := pg_catalog.lower(coalesce(p_observed_result->>'call_handler', ''));
    v_req_url := coalesce(p_observed_result->>'call_relay_script_url', p_observed_result->>'call_request_url');

    if v_inventory.lifecycle_state <> 'active'
       or p_observed_provider_object_id is distinct from v_inventory.provider_number_id
       or p_observed_result->>'provider' is distinct from 'signalwire'
       or p_observed_result->>'id' is distinct from v_inventory.provider_number_id
       or p_observed_result->>'number' is distinct from v_inventory.e164_number
       or p_observed_result->'voice_capable' is distinct from 'true'::jsonb
       or v_handler not in ('laml_webhooks', 'relay_script')
       or v_req_url is distinct from v_inventory.call_request_url
       or (v_handler = 'laml_webhooks' and (
             p_observed_result->>'call_request_method' is distinct from 'POST'
             or p_observed_result->>'call_status_callback_url' is distinct from v_inventory.call_status_callback_url
             or p_observed_result->>'call_status_callback_method' is distinct from 'POST'
          )) then
      raise exception 'Ready verification does not prove the exact active AI Voice provider configuration'
        using errcode = '22000';
    end if;
    update public.voice_number_inventory i
       set voice_capable = true,
           provider_verified_at = v_now,
           last_provider_sync_at = v_now,
           last_provider_check_attempt_at = v_now,
           last_provider_check_error_code = null,
           provider_readiness_state = 'ready',
           provider_readiness_reason = null,
           provider_readiness_changed_at = case
             when i.provider_readiness_state = 'ready' then i.provider_readiness_changed_at
             else v_now end,
           last_provider_observation = p_observed_result,
           updated_at = v_now
     where i.id = v_inventory.id
     returning * into strict v_inventory;
  else
    update public.voice_number_inventory i
       set lifecycle_state = 'suspended', voice_capable = false,
           suspended_at = coalesce(i.suspended_at, v_now),
           last_provider_sync_at = v_now,
           last_provider_check_attempt_at = v_now,
           last_provider_check_error_code = p_error_code,
           provider_readiness_state = p_verification_status,
           provider_readiness_reason = p_error_code,
           provider_readiness_changed_at = v_now,
           last_provider_observation = p_observed_result,
           updated_at = v_now
     where i.id = v_inventory.id
     returning * into strict v_inventory;
    update public.accounts
       set call_tracking_number = null
     where id = p_account_id
       and call_tracking_number = v_inventory.e164_number;
  end if;

  return query select v_inventory.id, v_inventory.lifecycle_state,
    v_inventory.provider_readiness_state, v_inventory.last_provider_sync_at;
end;
$$;
