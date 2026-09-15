begin;
-- accounts uses suspended_at/reason/by; it has neither status nor updated_at.
-- Keep subscription_status untouched and preserve pre-existing enforcement.
alter table public.account_closure_jobs add column prior_active_member_ids jsonb;

create or replace function public.request_account_closure_atomic(
  p_account_id uuid, p_requested_by_user_id uuid, p_requested_by_role text,
  p_encrypted_vendor_handles text default null, p_stripe_applicable boolean default true,
  p_quickbooks_applicable boolean default true, p_storage_applicable boolean default true
)
returns uuid language plpgsql security definer
set search_path = pg_catalog, pg_temp as $$
declare
  v_now timestamptz := clock_timestamp(); v_job_id uuid;
  v_prior_suspended_at timestamptz; v_members jsonb;
begin
  select suspended_at into v_prior_suspended_at from public.accounts where id = p_account_id for update;
  if not found then raise exception 'Account not found for closure' using errcode = 'P0002'; end if;
  select id into v_job_id from public.account_closure_jobs where closure_subject_id = p_account_id and completed_at is null;
  if v_job_id is not null then return v_job_id; end if;
  select coalesce(jsonb_agg(user_id), '[]'::jsonb) into v_members
  from public.memberships where account_id = p_account_id and deactivated_at is null;

  update public.accounts set suspended_at = coalesce(suspended_at, v_now),
    suspended_reason = case when suspended_at is null then 'ACCOUNT_CLOSURE_PENDING' else suspended_reason end,
    suspended_by = case when suspended_at is null then p_requested_by_user_id else suspended_by end
  where id = p_account_id;
  update public.memberships set deactivated_at = v_now where account_id = p_account_id and deactivated_at is null;
  update public.sms_events set status = 'cancelled', error_reason = 'account_suspended_closed', cancelled_at = v_now, updated_at = v_now
  where account_id = p_account_id and status in ('pending', 'queued');
  update public.sms_delivery_tasks t set task_state = 'cancelled', claim_token = null, lease_expires_at = null,
    last_error_code = 'account_suspended_closed', cancelled_at = v_now, updated_at = v_now
  from public.sms_events e where e.id = t.sms_event_id and e.account_id = p_account_id and t.task_state in ('queued', 'leased');

  insert into public.account_closure_jobs(
    closure_subject_id, account_id, requested_by_user_id, requested_by_role, access_revoked_at,
    closure_state, recoverable_until, purge_eligible_at, prior_account_status, prior_active_member_ids,
    local_disposal_state, stripe_state, quickbooks_state, storage_state, auth_cleanup_state, encrypted_vendor_handles
  ) values (
    p_account_id, p_account_id, p_requested_by_user_id, p_requested_by_role, v_now,
    'pending_grace_period', v_now + interval '30 days', v_now + interval '30 days',
    case when v_prior_suspended_at is null then 'active' else 'suspended' end, v_members,
    'pending', case when p_stripe_applicable then 'pending' else 'not_applicable' end,
    case when p_quickbooks_applicable then 'pending' else 'not_applicable' end,
    case when p_storage_applicable then 'pending' else 'not_applicable' end, 'pending', p_encrypted_vendor_handles
  ) returning id into v_job_id;
  perform public.record_tenant_audit_event_atomic(
    p_account_id => p_account_id, p_entity_type => 'account', p_entity_id => p_account_id::text,
    p_action => 'account.closure_requested', p_actor => jsonb_build_object('user_id', p_requested_by_user_id, 'role', p_requested_by_role),
    p_source => 'web', p_reason => 'Account closure scheduled with a 30-day recovery period.',
    p_changed_fields => array['suspended_at', 'closure_state', 'recoverable_until']
  );
  return v_job_id;
end;
$$;

create or replace function public.cancel_account_closure_atomic(
  p_account_id uuid, p_actor jsonb default '{}'::jsonb, p_source text default 'web', p_request_id text default null
)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, pg_temp as $$
declare j public.account_closure_jobs%rowtype; v_now timestamptz := clock_timestamp(); v_actor_id uuid;
begin
  -- The owner-facing action authorizes membership and uses the service client.
  -- Direct browser execution is revoked below; caller-supplied actor is audit metadata.
  perform 1 from public.accounts where id = p_account_id for update;
  select * into j from public.account_closure_jobs where closure_subject_id = p_account_id and completed_at is null for update;
  if j.id is null then return jsonb_build_object('success', false, 'error', 'no_active_closure_job_found'); end if;
  if j.recoverable_until is null or j.recoverable_until <= v_now or j.closure_state <> 'pending_grace_period'
    or j.local_disposal_state <> 'pending' or j.domain_cleanup_started_at is not null
    or j.lease_token is not null or j.prior_active_member_ids is null then
    return jsonb_build_object('success', false, 'error', 'closure_recovery_not_eligible');
  end if;
  if coalesce(p_actor->>'user_id', p_actor->>'userId', '') ~ '^[0-9a-fA-F-]{36}$' then
    v_actor_id := coalesce(p_actor->>'user_id', p_actor->>'userId')::uuid;
  end if;
  -- Clear only the suspension this closure itself introduced. Existing or
  -- later staff enforcement survives account recovery.
  update public.accounts set suspended_at = null, suspended_reason = null, suspended_by = null
  where id = p_account_id and j.prior_account_status = 'active'
    and suspended_at = j.access_revoked_at and suspended_reason = 'ACCOUNT_CLOSURE_PENDING';
  update public.memberships set deactivated_at = null
  where account_id = p_account_id and deactivated_at = j.access_revoked_at
    and user_id::text in (select jsonb_array_elements_text(j.prior_active_member_ids));
  update public.account_closure_jobs set closure_state = 'cancelled_restored', completed_at = v_now,
    recovered_at = v_now, recovered_by_user_id = v_actor_id, encrypted_vendor_handles = null,
    updated_at = v_now, version = version + 1 where id = j.id;
  perform public.record_tenant_audit_event_atomic(
    p_account_id => p_account_id, p_entity_type => 'account', p_entity_id => p_account_id::text,
    p_action => 'account.closure_cancelled', p_actor => p_actor, p_source => p_source,
    p_request_id => p_request_id, p_reason => 'Account closure cancelled within its recovery period.',
    p_changed_fields => array['suspended_at', 'closure_state', 'recovered_at']
  );
  return jsonb_build_object('success', true, 'account_id', p_account_id, 'status', 'restored', 'recovered_at', v_now);
end;
$$;
revoke all on function public.request_account_closure_atomic(uuid, uuid, text, text, boolean, boolean, boolean) from public, anon, authenticated;
revoke all on function public.cancel_account_closure_atomic(uuid, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.request_account_closure_atomic(uuid, uuid, text, text, boolean, boolean, boolean) to service_role;
grant execute on function public.cancel_account_closure_atomic(uuid, jsonb, text, text) to service_role;
commit;
