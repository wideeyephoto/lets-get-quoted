-- Fail-closed hardening for downstream campaign binding, carrier spend,
-- inbound activation, provider-object reconciliation, and uncertain outcomes.
-- This migration performs no provider request and grants no product entitlement.

begin;

alter table public.messaging_registration_applications
  add column if not exists provider_brand_state text,
  add column if not exists provider_campaign_state text,
  add column if not exists provider_campaign_use_case text,
  add column if not exists provider_verified_at timestamptz,
  add column if not exists provider_verified_legal_name text,
  add column if not exists provider_verified_dba_name text,
  add column if not exists provider_verified_website_host text,
  add column if not exists inbound_request_method text;

alter table public.sms_sender_numbers
  add column if not exists inbound_request_method text;

alter table public.messaging_registration_applications
  drop constraint if exists messaging_registration_application_verified_activation_shape;
alter table public.messaging_registration_applications
  add constraint messaging_registration_application_verified_activation_shape check (
    status <> 'active'
    or (
      provider_brand_state = 'complete'
      and provider_campaign_state = 'complete'
      and provider_verified_at is not null
      and inbound_request_method = 'POST'
    )
  ) not valid;

-- Approval accepts only a recent carrier snapshot tied to the exact reviewed
-- revision and restricted EIN suffix. Full EINs never enter this function's
-- arguments, application table, or owner-readable event ledger.
create or replace function public.review_messaging_registration_application_v2(
  p_application_id uuid,
  p_decision text,
  p_detail text,
  p_provider_brand_id text,
  p_provider_campaign_id text,
  p_provider_brand_state text,
  p_provider_campaign_state text,
  p_provider_campaign_use_case text,
  p_verified_legal_business_name text,
  p_verified_dba_name text,
  p_verified_website_host text,
  p_verified_ein_last_four text,
  p_provider_verified_at timestamptz,
  p_actor_reference text
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_application public.messaging_registration_applications%rowtype;
  v_compliance public.messaging_compliance_verifications%rowtype;
  v_previous text;
  v_projection text;
  v_expected_host text;
begin
  if p_decision not in ('under_review', 'action_required', 'approved', 'rejected') then
    raise exception 'Messaging application review decision is invalid' using errcode = '22023';
  end if;
  select * into strict v_application
    from public.messaging_registration_applications
   where id = p_application_id
   for update;
  if v_application.status not in ('submitted', 'under_review', 'action_required', 'rejected', 'approved') then
    raise exception 'Messaging application cannot be reviewed in its current state' using errcode = '55000';
  end if;
  if p_decision in ('action_required', 'rejected')
     and pg_catalog.length(coalesce(p_detail, '')) < 10 then
    raise exception 'A clear review reason is required' using errcode = '22023';
  end if;

  if p_decision = 'approved' then
    select * into strict v_compliance
      from public.messaging_compliance_verifications
     where application_id = v_application.id
       and account_id = v_application.account_id
       and application_revision = v_application.revision
     for update;
    v_expected_host := pg_catalog.lower(pg_catalog.split_part(
      pg_catalog.regexp_replace(v_application.website_url, '^https://', '', 'i'), '/', 1
    ));
    v_expected_host := pg_catalog.split_part(v_expected_host, ':', 1);
    v_expected_host := pg_catalog.regexp_replace(v_expected_host, '^www\.', '');

    if coalesce(p_provider_brand_id, '') !~ '^[0-9a-fA-F-]{36}$'
       or coalesce(p_provider_campaign_id, '') !~ '^[0-9a-fA-F-]{36}$'
       or pg_catalog.lower(coalesce(p_provider_brand_state, '')) <> 'complete'
       or pg_catalog.lower(coalesce(p_provider_campaign_state, '')) <> 'complete'
       or pg_catalog.length(coalesce(p_provider_campaign_use_case, '')) < 2
       or p_provider_verified_at is null
       or p_provider_verified_at < v_now - interval '10 minutes'
       or p_provider_verified_at > v_now + interval '2 minutes'
       or p_verified_legal_business_name is distinct from v_application.legal_business_name
       or p_verified_dba_name is distinct from v_application.dba_name
       or pg_catalog.lower(coalesce(p_verified_website_host, '')) <> v_expected_host
       or p_verified_ein_last_four is distinct from v_compliance.ein_last_four then
      raise exception 'Approval requires a fresh carrier-complete campaign bound to this exact business revision'
        using errcode = '55000';
    end if;
  end if;

  v_previous := v_application.status;
  update public.messaging_registration_applications
     set status = p_decision,
         status_detail = nullif(p_detail, ''),
         provider_brand_id = case when p_decision = 'approved' then p_provider_brand_id else provider_brand_id end,
         provider_campaign_id = case when p_decision = 'approved' then p_provider_campaign_id else provider_campaign_id end,
         provider_brand_state = case when p_decision = 'approved' then 'complete' else null end,
         provider_campaign_state = case when p_decision = 'approved' then 'complete' else null end,
         provider_campaign_use_case = case when p_decision = 'approved' then p_provider_campaign_use_case else null end,
         provider_verified_at = case when p_decision = 'approved' then p_provider_verified_at else null end,
         provider_verified_legal_name = case when p_decision = 'approved' then p_verified_legal_business_name else null end,
         provider_verified_dba_name = case when p_decision = 'approved' then p_verified_dba_name else null end,
         provider_verified_website_host = case when p_decision = 'approved' then p_verified_website_host else null end,
         reviewed_by = p_actor_reference,
         reviewed_at = v_now,
         updated_at = v_now
   where id = p_application_id;

  v_projection := case
    when p_decision in ('under_review', 'approved') then 'in_review'
    when p_decision = 'action_required' then 'action_required'
    else 'rejected'
  end;
  update public.messaging_registrations
     set status = v_projection,
         status_detail = nullif(p_detail, ''),
         provider = 'signalwire',
         provider_reference = p_application_id::text,
         decided_at = case when p_decision in ('action_required', 'rejected') then v_now else null end,
         updated_at = v_now
   where account_id = v_application.account_id;

  insert into public.messaging_registration_events (
    application_id, account_id, event_type, actor_type, actor_reference,
    previous_status, new_status, detail, metadata
  ) values (
    p_application_id, v_application.account_id, 'application_reviewed',
    'staff', p_actor_reference, v_previous, p_decision, nullif(p_detail, ''),
    pg_catalog.jsonb_build_object(
      'provider_brand_id', p_provider_brand_id,
      'provider_campaign_id', p_provider_campaign_id,
      'brand_state', case when p_decision = 'approved' then 'complete' else null end,
      'campaign_state', case when p_decision = 'approved' then 'complete' else null end
    )
  );
  return p_decision;
end;
$$;

-- Assignment and activation require a fresh repeat of the same provider check.
create or replace function public.record_messaging_campaign_verification_v2(
  p_application_id uuid,
  p_provider_brand_id text,
  p_provider_campaign_id text,
  p_provider_brand_state text,
  p_provider_campaign_state text,
  p_provider_campaign_use_case text,
  p_verified_legal_business_name text,
  p_verified_dba_name text,
  p_verified_website_host text,
  p_verified_ein_last_four text,
  p_provider_verified_at timestamptz,
  p_actor_reference text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_application public.messaging_registration_applications%rowtype;
  v_compliance public.messaging_compliance_verifications%rowtype;
  v_expected_host text;
begin
  select * into strict v_application
    from public.messaging_registration_applications
   where id = p_application_id
   for update;
  if v_application.status not in ('approved', 'provisioning', 'active')
     or v_application.provider_brand_id is distinct from p_provider_brand_id
     or v_application.provider_campaign_id is distinct from p_provider_campaign_id then
    raise exception 'Campaign verification is not bound to the approved application' using errcode = '55000';
  end if;
  select * into strict v_compliance
    from public.messaging_compliance_verifications
   where application_id = v_application.id
     and account_id = v_application.account_id
     and application_revision = v_application.revision;
  v_expected_host := pg_catalog.lower(pg_catalog.split_part(
    pg_catalog.regexp_replace(v_application.website_url, '^https://', '', 'i'), '/', 1
  ));
  v_expected_host := pg_catalog.split_part(v_expected_host, ':', 1);
  v_expected_host := pg_catalog.regexp_replace(v_expected_host, '^www\.', '');
  if pg_catalog.lower(coalesce(p_provider_brand_state, '')) <> 'complete'
     or pg_catalog.lower(coalesce(p_provider_campaign_state, '')) <> 'complete'
     or pg_catalog.length(coalesce(p_provider_campaign_use_case, '')) < 2
     or p_provider_verified_at is null
     or p_provider_verified_at < v_now - interval '10 minutes'
     or p_provider_verified_at > v_now + interval '2 minutes'
     or p_verified_legal_business_name is distinct from v_application.legal_business_name
     or p_verified_dba_name is distinct from v_application.dba_name
     or pg_catalog.lower(coalesce(p_verified_website_host, '')) <> v_expected_host
     or p_verified_ein_last_four is distinct from v_compliance.ein_last_four then
    raise exception 'Campaign verification does not match the exact downstream business' using errcode = '55000';
  end if;
  update public.messaging_registration_applications
     set provider_brand_state = 'complete',
         provider_campaign_state = 'complete',
         provider_campaign_use_case = p_provider_campaign_use_case,
         provider_verified_at = p_provider_verified_at,
         provider_verified_legal_name = p_verified_legal_business_name,
         provider_verified_dba_name = p_verified_dba_name,
         provider_verified_website_host = p_verified_website_host,
         updated_at = v_now
   where id = p_application_id;
  insert into public.messaging_registration_events (
    application_id, account_id, event_type, actor_type, actor_reference,
    previous_status, new_status, metadata
  ) values (
    v_application.id, v_application.account_id, 'provider_campaign_verified',
    'staff', p_actor_reference, v_application.status, v_application.status,
    pg_catalog.jsonb_build_object(
      'provider_brand_id', p_provider_brand_id,
      'provider_campaign_id', p_provider_campaign_id,
      'brand_state', 'complete',
      'campaign_state', 'complete'
    )
  );
  return true;
end;
$$;

-- The v2 claim wrapper adds a database-level carrier spend ceiling and a fresh
-- campaign verification precondition, then delegates to the original leased
-- operation engine in the same transaction.
create or replace function public.claim_messaging_number_operation_v2(
  p_application_id uuid,
  p_operation_type text,
  p_idempotency_key text,
  p_request_fingerprint text,
  p_request_payload jsonb
)
returns table (
  claim_status text,
  operation_id uuid,
  claim_token uuid,
  operation_state text,
  provider_object_id text,
  provider_result jsonb
)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_application public.messaging_registration_applications%rowtype;
  v_monthly_price bigint;
  v_monthly_ceiling bigint;
  v_purchased_count bigint;
  v_reserved_count bigint;
  v_existing_state text;
  v_additional_count bigint := 1;
begin
  select * into strict v_application
    from public.messaging_registration_applications
   where id = p_application_id
   for update;
  if p_operation_type = 'purchase_number' then
    if coalesce(p_request_payload->>'monthly_price_cents', '') !~ '^[1-9][0-9]{0,8}$'
       or coalesce(p_request_payload->>'monthly_spend_ceiling_cents', '') !~ '^[1-9][0-9]{0,8}$' then
      raise exception 'Purchase requires a reviewed monthly price and spend ceiling' using errcode = '22023';
    end if;
    v_monthly_price := (p_request_payload->>'monthly_price_cents')::bigint;
    v_monthly_ceiling := (p_request_payload->>'monthly_spend_ceiling_cents')::bigint;
    if v_monthly_price > v_monthly_ceiling then
      raise exception 'Configured number price exceeds the monthly spend ceiling' using errcode = '22023';
    end if;
    -- Serialize the global budget decision. An operation remains a reservation
    -- after this transaction commits, including an indeterminate request that
    -- may already have purchased a number at the carrier.
    perform pg_catalog.pg_advisory_xact_lock(1280265031, 2108);
    select o.state into v_existing_state
      from public.messaging_number_provisioning_operations o
     where o.idempotency_key = p_idempotency_key;
    select pg_catalog.count(*) into v_purchased_count
      from public.messaging_registration_applications
     where provider = 'signalwire'
       and provider_number_id is not null;
    select pg_catalog.count(*) into v_reserved_count
      from public.messaging_number_provisioning_operations o
      join public.messaging_registration_applications a on a.id = o.application_id
     where o.operation_type = 'purchase_number'
       and o.state in ('pending', 'claimed', 'request_started', 'indeterminate')
       and a.provider = 'signalwire'
       and a.provider_number_id is null;
    if v_existing_state in ('pending', 'claimed', 'request_started', 'indeterminate', 'succeeded') then
      v_additional_count := 0;
    end if;
    if (v_purchased_count + v_reserved_count + v_additional_count) * v_monthly_price > v_monthly_ceiling then
      raise exception 'This purchase would exceed the aggregate monthly dedicated-number spend ceiling'
        using errcode = '54000';
    end if;
  elsif p_operation_type = 'assign_campaign' then
    if v_application.provider_brand_state <> 'complete'
       or v_application.provider_campaign_state <> 'complete'
       or v_application.provider_verified_at is null
       or v_application.provider_verified_at < v_now - interval '10 minutes' then
      raise exception 'Campaign assignment requires a fresh carrier-complete business binding'
        using errcode = '55000';
    end if;
  end if;
  return query
    select * from public.claim_messaging_number_operation(
      p_application_id,
      p_operation_type,
      p_idempotency_key,
      p_request_fingerprint,
      p_request_payload
    );
end;
$$;

-- The v2 completion wrapper validates provider facts omitted from the original
-- projection before that projection can mark inventory inbound-ready.
create or replace function public.complete_messaging_number_operation_v2(
  p_operation_id uuid,
  p_claim_token uuid,
  p_provider_object_id text,
  p_provider_result jsonb
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $$
declare
  v_operation public.messaging_number_provisioning_operations%rowtype;
  v_completed boolean;
begin
  select * into strict v_operation
    from public.messaging_number_provisioning_operations
   where id = p_operation_id
   for update;
  if v_operation.state <> 'request_started' or v_operation.claim_token <> p_claim_token then
    raise exception 'Messaging number operation is not at its completion boundary' using errcode = '55000';
  end if;
  if v_operation.operation_type = 'purchase_number' then
    if pg_catalog.jsonb_typeof(p_provider_result->'capabilities') <> 'array'
       or not (p_provider_result->'capabilities' @> '["sms"]'::jsonb) then
      raise exception 'Purchased phone resource did not confirm SMS capability' using errcode = '22000';
    end if;
  elsif v_operation.operation_type = 'configure_inbound' then
    if pg_catalog.upper(pg_catalog.btrim(coalesce(v_operation.request_payload->>'message_request_method', ''))) <> 'POST'
       or pg_catalog.upper(pg_catalog.btrim(coalesce(p_provider_result->>'message_request_method', ''))) <> 'POST' then
      raise exception 'Inbound configuration did not confirm POST request method' using errcode = '22000';
    end if;
  end if;
  select public.complete_messaging_number_operation(
    p_operation_id, p_claim_token, p_provider_object_id, p_provider_result
  ) into v_completed;
  if v_operation.operation_type = 'configure_inbound' and v_completed then
    update public.messaging_registration_applications
       set inbound_request_method = 'POST'
     where id = v_operation.application_id;
    update public.sms_sender_numbers
       set inbound_request_method = 'POST'
     where provisioning_application_id = v_operation.application_id;
  end if;
  return v_completed;
end;
$$;

-- Preserve any provider object/result received before a projection or database
-- acknowledgement failed. This evidence is required for no-duplicate recovery.
create or replace function public.mark_messaging_number_operation_indeterminate_v2(
  p_operation_id uuid,
  p_claim_token uuid,
  p_error_code text,
  p_error_detail text,
  p_provider_object_id text,
  p_provider_result jsonb
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $$
declare v_marked boolean;
begin
  select public.mark_messaging_number_operation_indeterminate(
    p_operation_id, p_claim_token, p_error_code, p_error_detail
  ) into v_marked;
  update public.messaging_number_provisioning_operations
     set provider_object_id = coalesce(p_provider_object_id, provider_object_id),
         provider_result = coalesce(p_provider_result, provider_result)
   where id = p_operation_id and state = 'indeterminate';
  return v_marked;
end;
$$;

-- Supported recovery never repeats a carrier mutation. An MFA server action
-- either records provider-confirmed absence or verifies and imports the exact
-- existing provider object through the hardened completion projection.
create or replace function public.resolve_messaging_number_operation_v2(
  p_operation_id uuid,
  p_resolution text,
  p_provider_object_id text,
  p_provider_result jsonb,
  p_actor_reference text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_operation public.messaging_number_provisioning_operations%rowtype;
  v_application public.messaging_registration_applications%rowtype;
  v_token uuid;
begin
  if p_resolution not in ('confirmed_absent', 'confirmed_succeeded')
     or pg_catalog.length(coalesce(p_actor_reference, '')) < 3 then
    raise exception 'Messaging operation recovery input is invalid' using errcode = '22023';
  end if;
  select * into strict v_operation
    from public.messaging_number_provisioning_operations
   where id = p_operation_id
   for update;
  if v_operation.state <> 'indeterminate' then
    raise exception 'Only an indeterminate operation can be recovered' using errcode = '55000';
  end if;
  select * into strict v_application
    from public.messaging_registration_applications
   where id = v_operation.application_id
   for update;

  if p_resolution = 'confirmed_absent' then
    if v_operation.provider_object_id is not null or v_operation.provider_result is not null then
      raise exception 'Stored provider success evidence must be imported, not marked absent' using errcode = '55000';
    end if;
    update public.messaging_number_provisioning_operations
       set state = 'failed', error_code = 'operator_confirmed_absent',
           error_detail = 'MFA operations confirmed that SignalWire created no provider object.',
           claim_token = null, lease_expires_at = null,
           request_started_at = null, completed_at = null,
           indeterminate_at = null, failed_at = v_now, updated_at = v_now
     where id = p_operation_id;
  else
    if coalesce(p_provider_object_id, '') !~ '^[0-9a-fA-F-]{36}$'
       or p_provider_result is null
       or p_provider_result->>'id' is distinct from p_provider_object_id
       or (v_operation.provider_object_id is not null
           and v_operation.provider_object_id is distinct from p_provider_object_id) then
      raise exception 'Imported provider evidence does not match the quarantined operation'
        using errcode = '22000';
    end if;
    v_token := pg_catalog.gen_random_uuid();
    update public.messaging_number_provisioning_operations
       set state = 'request_started', claim_token = v_token,
           lease_expires_at = v_now + interval '5 minutes',
           request_started_at = v_now, completed_at = null,
           failed_at = null, indeterminate_at = null, updated_at = v_now
     where id = p_operation_id;
    perform public.complete_messaging_number_operation_v2(
      p_operation_id, v_token, p_provider_object_id, p_provider_result
    );
  end if;

  insert into public.messaging_registration_events (
    application_id, account_id, event_type, actor_type, actor_reference,
    previous_status, new_status, metadata
  ) values (
    v_application.id, v_application.account_id, 'provider_operation_recovered',
    'staff', p_actor_reference, v_application.status,
    case when v_operation.operation_type = 'purchase_number'
              and p_resolution = 'confirmed_succeeded' then 'provisioning'
         else v_application.status end,
    pg_catalog.jsonb_build_object(
      'operation_id', p_operation_id,
      'operation_type', v_operation.operation_type,
      'resolution', p_resolution,
      'provider_object_id', p_provider_object_id
    )
  );
  return true;
end;
$$;

-- Activation proves the individual assignment names the exact purchased
-- provider resource and that inbound POST plus campaign verification are fresh.
create or replace function public.record_messaging_number_assignment_state_v2(
  p_application_id uuid,
  p_assignment_id text,
  p_provider_state text,
  p_provider_number_id text,
  p_actor_reference text
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_application public.messaging_registration_applications%rowtype;
  v_sender public.sms_sender_numbers%rowtype;
  v_result text;
begin
  select * into strict v_application
    from public.messaging_registration_applications
   where id = p_application_id
   for update;
  select * into strict v_sender
    from public.sms_sender_numbers
   where provisioning_application_id = p_application_id
   for update;
  if coalesce(p_assignment_id, '') !~ '^[0-9a-fA-F-]{36}$'
     or p_provider_number_id is distinct from v_application.provider_number_id
     or p_provider_number_id is distinct from v_sender.provider_number_id
     or v_application.inbound_request_method <> 'POST'
     or v_sender.inbound_request_method <> 'POST'
     or v_application.inbound_webhook_url is null
     or v_sender.inbound_webhook_url is distinct from v_application.inbound_webhook_url
     or v_application.provider_brand_state <> 'complete'
     or v_application.provider_campaign_state <> 'complete'
     or v_application.provider_verified_at is null
     or v_application.provider_verified_at < v_now - interval '10 minutes' then
    raise exception 'Assignment cannot activate without exact phone, POST inbound, and fresh campaign evidence'
      using errcode = '55000';
  end if;
  select public.record_messaging_number_assignment_state(
    p_application_id, p_assignment_id, p_provider_state, p_actor_reference
  ) into v_result;
  return v_result;
end;
$$;

-- Retire bypassable service-role entry points. They remain owner-internal only
-- so v2 wrappers can reuse the leased engine in the same database transaction.
revoke all on function public.review_messaging_registration_application(uuid,text,text,text,text,text)
  from public, anon, authenticated, service_role;
revoke all on function public.claim_messaging_number_operation(uuid,text,text,text,jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.complete_messaging_number_operation(uuid,uuid,text,jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.mark_messaging_number_operation_indeterminate(uuid,uuid,text,text)
  from public, anon, authenticated, service_role;
revoke all on function public.record_messaging_number_assignment_state(uuid,text,text,text)
  from public, anon, authenticated, service_role;

revoke all on function public.review_messaging_registration_application_v2(uuid,text,text,text,text,text,text,text,text,text,text,text,timestamptz,text)
  from public, anon, authenticated, service_role;
revoke all on function public.record_messaging_campaign_verification_v2(uuid,text,text,text,text,text,text,text,text,text,timestamptz,text)
  from public, anon, authenticated, service_role;
revoke all on function public.claim_messaging_number_operation_v2(uuid,text,text,text,jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.complete_messaging_number_operation_v2(uuid,uuid,text,jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.mark_messaging_number_operation_indeterminate_v2(uuid,uuid,text,text,text,jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.resolve_messaging_number_operation_v2(uuid,text,text,jsonb,text)
  from public, anon, authenticated, service_role;
revoke all on function public.record_messaging_number_assignment_state_v2(uuid,text,text,text,text)
  from public, anon, authenticated, service_role;

grant execute on function public.review_messaging_registration_application_v2(uuid,text,text,text,text,text,text,text,text,text,text,text,timestamptz,text)
  to service_role;
grant execute on function public.record_messaging_campaign_verification_v2(uuid,text,text,text,text,text,text,text,text,text,timestamptz,text)
  to service_role;
grant execute on function public.claim_messaging_number_operation_v2(uuid,text,text,text,jsonb)
  to service_role;
grant execute on function public.complete_messaging_number_operation_v2(uuid,uuid,text,jsonb)
  to service_role;
grant execute on function public.mark_messaging_number_operation_indeterminate_v2(uuid,uuid,text,text,text,jsonb)
  to service_role;
grant execute on function public.resolve_messaging_number_operation_v2(uuid,text,text,jsonb,text)
  to service_role;
grant execute on function public.record_messaging_number_assignment_state_v2(uuid,text,text,text,text)
  to service_role;

commit;
