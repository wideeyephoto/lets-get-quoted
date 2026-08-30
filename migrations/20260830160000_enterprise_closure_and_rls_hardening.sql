-- ============================================================================
-- ENTERPRISE ACCOUNT CLOSURE LEDGER & RLS HARDENING MIGRATION
--
-- 1. accounts.legal_hold & memberships.deactivated_at tracking
-- 2. public.account_closure_jobs outbox ledger with partial unique index
-- 3. Hardened RLS helpers with safe search_path and membership deactivation
-- 4. Purge legacy singular quick_stop_priority_zone_owner policy & recreate
-- 5. Outbound SMS delivery freeze on suspended accounts
-- 6. Atomic closure request, claim, and lease-fenced update RPCs
-- 7. Multi-tenant safe Auth cleanup membership verification RPC
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. Accounts Legal Hold & Membership Deactivation Tracking
-- ----------------------------------------------------------------------------
alter table public.accounts
  add column if not exists legal_hold boolean not null default false;

alter table public.memberships
  add column if not exists deactivated_at timestamptz default null;

create index if not exists memberships_user_active_idx
  on public.memberships (user_id, account_id)
  where deactivated_at is null;

-- ----------------------------------------------------------------------------
-- 2. Account Closure Outbox Ledger (public schema for Data API compatibility)
-- ----------------------------------------------------------------------------
create table if not exists public.account_closure_jobs (
  id uuid primary key default gen_random_uuid(),
  closure_subject_id uuid not null,
  account_id uuid references public.accounts(id) on delete set null,
  requested_by_user_id uuid,
  requested_by_role text not null check (requested_by_role in ('owner', 'admin')),
  access_revoked_at timestamptz not null default now(),
  local_disposal_state text not null default 'pending'
    check (local_disposal_state in ('pending', 'in_progress', 'completed', 'failed')),
  stripe_state text not null default 'pending'
    check (stripe_state in ('pending', 'in_progress', 'success', 'retry', 'operator_review', 'not_applicable')),
  quickbooks_state text not null default 'pending'
    check (quickbooks_state in ('pending', 'in_progress', 'success', 'retry', 'operator_review', 'not_applicable')),
  storage_state text not null default 'pending'
    check (storage_state in ('pending', 'in_progress', 'success', 'retry', 'operator_review', 'not_applicable')),
  auth_cleanup_state text not null default 'pending'
    check (auth_cleanup_state in ('pending', 'in_progress', 'success', 'retry', 'operator_review', 'not_applicable')),
  encrypted_vendor_handles text,
  version integer not null default 1,
  lease_token uuid,
  lease_expires_at timestamptz,
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  next_retry_at timestamptz,
  last_error text,
  operator_exception jsonb,
  manifest jsonb,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists account_closure_jobs_one_active
  on public.account_closure_jobs (closure_subject_id)
  where completed_at is null;

create index if not exists account_closure_jobs_retry_idx
  on public.account_closure_jobs (next_retry_at)
  where completed_at is null;

alter table public.account_closure_jobs enable row level security;
revoke all on table public.account_closure_jobs from public, anon, authenticated;
grant all on table public.account_closure_jobs to service_role;

-- ----------------------------------------------------------------------------
-- 3. Hardened RLS Helper Predicates
-- ----------------------------------------------------------------------------

create or replace function public.is_member(acc uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
  select exists (
    select 1 from public.memberships m
    join public.accounts a on a.id = m.account_id
    where m.account_id = acc
      and m.user_id = auth.uid()
      and a.suspended_at is null
      and m.deactivated_at is null
  );
$$;

create or replace function public.is_owner(acc uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
  select exists (
    select 1 from public.memberships m
    join public.accounts a on a.id = m.account_id
    where m.account_id = acc
      and m.user_id = auth.uid()
      and m.role = 'owner'
      and a.suspended_at is null
      and m.deactivated_at is null
  );
$$;

create or replace function public.is_crew(acc uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
  select exists (
    select 1 from public.memberships m
    join public.accounts a on a.id = m.account_id
    where m.account_id = acc
      and m.user_id = auth.uid()
      and m.role = 'crew'
      and a.suspended_at is null
      and m.deactivated_at is null
  );
$$;

create or replace function public.is_office(acc uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
  select exists (
    select 1 from public.memberships m
    join public.accounts a on a.id = m.account_id
    where m.account_id = acc
      and m.user_id = auth.uid()
      and m.role = 'office'
      and a.suspended_at is null
      and m.deactivated_at is null
  );
$$;

create or replace function public.has_office_access(acc uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
  select exists (
    select 1 from public.memberships m
    join public.accounts a on a.id = m.account_id
    where m.account_id = acc
      and m.user_id = auth.uid()
      and m.role in ('owner', 'office')
      and a.suspended_at is null
      and m.deactivated_at is null
  );
$$;

create or replace function public.crew_on_job(j uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
  select exists (
    select 1
    from public.crew_assignments ca
    join public.crew c on c.id = ca.crew_id
    join public.jobs jb on jb.id = ca.job_id
    join public.accounts a on a.id = jb.account_id
    where ca.job_id = j
      and c.user_id = auth.uid()
      and a.suspended_at is null
  );
$$;

create or replace function public.crew_owns_crew_row(cid uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
  select exists (
    select 1
    from public.crew c
    join public.accounts a on a.id = c.account_id
    where c.id = cid
      and c.user_id = auth.uid()
      and a.suspended_at is null
  );
$$;

-- Strip the PUBLIC pseudo-role grant, then re-grant explicitly by role.
--
-- anon KEEPS execute, deliberately. These seven helpers are referenced by 62 RLS
-- policies on anon-readable tables, so without execute a logged-out read raises
-- "42501 permission denied for function is_owner" instead of returning zero rows.
-- Verified against this database by applying the batch inside a transaction and
-- querying as the real anon role: sites, accounts, jobs, invoices, payments,
-- memberships, sms_consent and services all regressed from "0 rows" to 42501.
--
-- Revoking buys nothing. auth.uid() is NULL for anon, so every one of these
-- returns false unconditionally -- they are an oracle that always says no.
revoke all on function public.is_member(uuid) from public;
revoke all on function public.is_owner(uuid) from public;
revoke all on function public.is_crew(uuid) from public;
revoke all on function public.is_office(uuid) from public;
revoke all on function public.has_office_access(uuid) from public;
revoke all on function public.crew_on_job(uuid) from public;
revoke all on function public.crew_owns_crew_row(uuid) from public;

grant execute on function public.is_member(uuid) to anon, authenticated;
grant execute on function public.is_owner(uuid) to anon, authenticated;
grant execute on function public.is_crew(uuid) to anon, authenticated;
grant execute on function public.is_office(uuid) to anon, authenticated;
grant execute on function public.has_office_access(uuid) to anon, authenticated;
grant execute on function public.crew_on_job(uuid) to anon, authenticated;
grant execute on function public.crew_owns_crew_row(uuid) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 4. Purge Singular and Plural quick_stop_priority_zone Policies
-- ----------------------------------------------------------------------------
drop policy if exists quick_stop_priority_zone_owner on public.quick_stop_priority_zones;
drop policy if exists quick_stop_priority_zones_owner on public.quick_stop_priority_zones;

create policy quick_stop_priority_zones_owner on public.quick_stop_priority_zones
  for all
  to authenticated
  using (
    exists (
      select 1 from public.memberships m
      join public.accounts a on a.id = m.account_id
      where m.account_id = quick_stop_priority_zones.account_id
        and m.user_id = auth.uid()
        and m.role = 'owner'
        and a.suspended_at is null
        and m.deactivated_at is null
    )
  )
  with check (
    exists (
      select 1 from public.memberships m
      join public.accounts a on a.id = m.account_id
      where m.account_id = quick_stop_priority_zones.account_id
        and m.user_id = auth.uid()
        and m.role = 'owner'
        and a.suspended_at is null
        and m.deactivated_at is null
    )
  );

-- ----------------------------------------------------------------------------
-- 5. Outbound SMS Freeze on Suspended Accounts
-- ----------------------------------------------------------------------------
create or replace function public.claim_sms_delivery_tasks(p_batch_size integer)
returns table (
  work_claim_token uuid,
  sms_event_id uuid,
  account_id uuid,
  phone_number text,
  body text,
  message_kind text,
  billing_category text,
  sender_purpose text,
  attempt_number integer,
  lease_expires_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_task public.sms_delivery_tasks%rowtype;
  v_token uuid;
  v_lease timestamptz;
begin
  if p_batch_size is null or p_batch_size not between 1 and 25 then
    raise exception 'SMS delivery batch size must be between 1 and 25'
      using errcode = '22023';
  end if;

  -- Recover stale leases
  for v_task in
    select t.*
      from public.sms_delivery_tasks t
     where t.task_state = 'leased'
       and t.lease_expires_at <= v_now
     order by t.lease_expires_at, t.sms_event_id
     for update skip locked
  loop
    if v_task.request_started_at is not null then
      update public.sms_events e
         set status = 'indeterminate',
             error_reason = 'sms_delivery_unknown_after_lease_expiry',
             indeterminate_at = v_now,
             updated_at = v_now
       where e.id = v_task.sms_event_id
         and e.status = 'sending';
      update public.sms_delivery_attempts a
         set outcome = 'indeterminate',
             error_code = 'sms_delivery_unknown_after_lease_expiry',
             finished_at = v_now
       where a.claim_token = v_task.claim_token
         and a.outcome is null;
      update public.sms_delivery_tasks t
         set task_state = 'indeterminate',
             claim_token = null,
             lease_expires_at = null,
             last_error_code = 'sms_delivery_unknown_after_lease_expiry',
             indeterminate_at = v_now,
             updated_at = v_now
       where t.sms_event_id = v_task.sms_event_id;
    elsif v_task.attempt_count >= 8 then
      update public.sms_events e
         set status = 'failed',
             error_reason = 'sms_delivery_attempt_limit_reached',
             failed_at = v_now,
             updated_at = v_now
       where e.id = v_task.sms_event_id
         and e.status = 'queued';
      update public.sms_delivery_attempts a
         set outcome = 'terminal_failure',
             error_code = 'sms_delivery_attempt_limit_reached',
             finished_at = v_now
       where a.claim_token = v_task.claim_token
         and a.outcome is null;
      update public.sms_delivery_tasks t
         set task_state = 'failed', claim_token = null,
             lease_expires_at = null,
             last_error_code = 'sms_delivery_attempt_limit_reached',
             failed_at = v_now, updated_at = v_now
       where t.sms_event_id = v_task.sms_event_id;
    else
      update public.sms_delivery_attempts a
         set outcome = 'lease_expired',
             error_code = 'sms_delivery_pre_request_lease_expired',
             finished_at = v_now
       where a.claim_token = v_task.claim_token
         and a.outcome is null;
      update public.sms_delivery_tasks t
         set task_state = 'queued', claim_token = null,
             lease_expires_at = null, available_at = v_now,
             last_error_code = 'sms_delivery_pre_request_lease_expired',
             updated_at = v_now
       where t.sms_event_id = v_task.sms_event_id;
    end if;
  end loop;

  -- Select queued work only for ACTIVE (non-suspended) accounts
  for v_task in
    select t.*
      from public.sms_delivery_tasks t
      join public.sms_events e on e.id = t.sms_event_id
      join public.accounts a on a.id = e.account_id
     where t.task_state = 'queued'
       and t.available_at <= v_now
       and t.attempt_count < 8
       and a.suspended_at is null
     order by t.available_at, t.sms_event_id
     limit p_batch_size
     for update of t skip locked
  loop
    v_token := pg_catalog.gen_random_uuid();
    v_lease := v_now + interval '5 minutes';

    update public.sms_delivery_tasks t
       set task_state = 'leased',
           claim_token = v_token,
           lease_expires_at = v_lease,
           attempt_count = t.attempt_count + 1,
           request_started_at = null,
           last_error_code = null,
           updated_at = v_now
     where t.sms_event_id = v_task.sms_event_id;

    insert into public.sms_delivery_attempts (
      sms_event_id, claim_token, attempt_number,
      leased_at, lease_expires_at, created_at
    ) values (
      v_task.sms_event_id, v_token, v_task.attempt_count + 1,
      v_now, v_lease, v_now
    );

    return query
    select v_token, e.id, e.account_id, e.phone_number, e.body,
           e.message_kind, e.billing_category, e.sender_purpose,
           v_task.attempt_count + 1, v_lease
      from public.sms_events e
     where e.id = v_task.sms_event_id
       and e.status = 'queued';
  end loop;
end;
$$;

create or replace function public.stage_sms_delivery(
  p_sms_event_id uuid,
  p_claim_token uuid,
  p_provider text
)
returns table (
  dispatch_status text,
  sender_number_id uuid,
  sender_e164 text,
  provider_number_id text
)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_task public.sms_delivery_tasks%rowtype;
  v_event public.sms_events%rowtype;
  v_sender public.sms_sender_numbers%rowtype;
  v_required_scope text;
begin
  if p_provider is null or p_provider not in ('twilio', 'signalwire') then
    raise exception 'SMS provider is invalid'
      using errcode = '22023';
  end if;

  select t.* into v_task
    from public.sms_delivery_tasks t
   where t.sms_event_id = p_sms_event_id
   for update;

  select e.* into v_event
    from public.sms_events e
   where e.id = p_sms_event_id
   for update;

  if v_task.sms_event_id is null or v_event.id is null
     or v_task.task_state <> 'leased'
     or v_task.claim_token is distinct from p_claim_token
     or v_task.lease_expires_at <= v_now
     or v_task.request_started_at is not null
     or v_event.status <> 'queued' then
    raise exception 'SMS delivery lease is stale or invalid'
      using errcode = '55000';
  end if;

  -- Outbound messaging freeze: cancel immediately if account is suspended
  if exists (
    select 1 from public.accounts a
     where a.id = v_event.account_id
       and a.suspended_at is not null
  ) then
    update public.sms_events e
       set status = 'cancelled', error_reason = 'account_suspended_closed',
           cancelled_at = v_now, updated_at = v_now
     where e.id = v_event.id;
    update public.sms_delivery_tasks t
       set task_state = 'cancelled', claim_token = null,
           lease_expires_at = null, last_error_code = 'account_suspended_closed',
           cancelled_at = v_now, updated_at = v_now
     where t.sms_event_id = v_event.id;
    update public.sms_delivery_attempts a
       set outcome = 'cancelled', error_code = 'account_suspended_closed',
           finished_at = v_now
     where a.claim_token = p_claim_token and a.outcome is null;
    return query select 'cancelled'::text, null::uuid, null::text, null::text;
    return;
  end if;

  if not exists (
    select 1 from public.sms_consent c
     where c.account_id = v_event.account_id
       and c.phone_number = v_event.phone_number
       and c.status = 'opted_in'
       and c.consented_at is not null
       and c.opted_out_at is null
  ) then
    update public.sms_events e
       set status = 'cancelled', error_reason = 'sms_consent_not_current',
           cancelled_at = v_now, updated_at = v_now
     where e.id = v_event.id;
    update public.sms_delivery_tasks t
       set task_state = 'cancelled', claim_token = null,
           lease_expires_at = null, last_error_code = 'sms_consent_not_current',
           cancelled_at = v_now, updated_at = v_now
     where t.sms_event_id = v_event.id;
    update public.sms_delivery_attempts a
       set outcome = 'cancelled', error_code = 'sms_consent_not_current',
           finished_at = v_now
     where a.claim_token = p_claim_token and a.outcome is null;
    return query select 'cancelled'::text, null::uuid, null::text, null::text;
    return;
  end if;

  v_required_scope := case v_event.billing_category
    when 'customer_message' then 'customer'
    when 'payment_message' then 'customer'
    when 'verification' then 'customer'
    when 'crew_message' then 'crew'
    when 'owner_alert' then 'owner'
    else null
  end;

  if v_required_scope is null or not exists (
    select 1 from public.sms_consent_scopes s
     where s.account_id = v_event.account_id
       and s.phone_number = v_event.phone_number
       and s.consent_scope = v_required_scope
  ) then
    update public.sms_events e
       set status = 'cancelled', error_reason = 'sms_consent_scope_not_current',
           cancelled_at = v_now, updated_at = v_now
     where e.id = v_event.id;
    update public.sms_delivery_tasks t
       set task_state = 'cancelled', claim_token = null,
           lease_expires_at = null, last_error_code = 'sms_consent_scope_not_current',
           cancelled_at = v_now, updated_at = v_now
     where t.sms_event_id = v_event.id;
    update public.sms_delivery_attempts a
       set outcome = 'cancelled', error_code = 'sms_consent_scope_not_current',
           finished_at = v_now
     where a.claim_token = p_claim_token and a.outcome is null;
    return query select 'cancelled'::text, null::uuid, null::text, null::text;
    return;
  end if;

  -- Select eligible active sender number
  select sn.* into v_sender
    from public.sms_sender_numbers sn
   where sn.account_id = v_event.account_id
     and sn.sender_purpose = v_event.sender_purpose
     and sn.provider = p_provider
     and sn.status = 'active'
   limit 1;

  if v_sender.id is null then
    return query select 'blocked_sender'::text, null::uuid, null::text, null::text;
    return;
  end if;

  return query select 'ready'::text, v_sender.id, v_sender.e164, v_sender.provider_number_id;
end;
$$;

revoke all on function public.claim_sms_delivery_tasks(integer) from public, anon, authenticated;
grant execute on function public.claim_sms_delivery_tasks(integer) to service_role;

revoke all on function public.stage_sms_delivery(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.stage_sms_delivery(uuid, uuid, text) to service_role;

-- ----------------------------------------------------------------------------
-- 6. Atomic Closure Request, Claim, and Fenced State Updates
-- ----------------------------------------------------------------------------
create or replace function public.request_account_closure_atomic(
  p_account_id uuid,
  p_requested_by_user_id uuid,
  p_requested_by_role text,
  p_encrypted_vendor_handles text,
  p_stripe_applicable boolean,
  p_quickbooks_applicable boolean,
  p_storage_applicable boolean
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_job_id uuid;
begin
  -- 1. Suspend account
  update public.accounts
     set suspended_at = v_now
   where id = p_account_id;

  if not found then
    raise exception 'Account % not found for closure', p_account_id;
  end if;

  -- 2. Deactivate all memberships for this account
  update public.memberships
     set deactivated_at = v_now
   where account_id = p_account_id
     and deactivated_at is null;

  -- 3. Cancel all queued/leased SMS delivery tasks and events for the account
  update public.sms_events
     set status = 'cancelled', error_reason = 'account_suspended_closed',
         cancelled_at = v_now, updated_at = v_now
   where account_id = p_account_id
     and status in ('pending', 'queued');

  update public.sms_delivery_tasks t
     set task_state = 'cancelled', claim_token = null, lease_expires_at = null,
         last_error_code = 'account_suspended_closed',
         cancelled_at = v_now, updated_at = v_now
    from public.sms_events e
   where e.id = t.sms_event_id
     and e.account_id = p_account_id
     and t.task_state in ('queued', 'leased');

  -- 4. Insert or fetch existing active closure job
  insert into public.account_closure_jobs (
    closure_subject_id,
    account_id,
    requested_by_user_id,
    requested_by_role,
    access_revoked_at,
    local_disposal_state,
    stripe_state,
    quickbooks_state,
    storage_state,
    auth_cleanup_state,
    encrypted_vendor_handles
  ) values (
    p_account_id,
    p_account_id,
    p_requested_by_user_id,
    p_requested_by_role,
    v_now,
    'pending',
    case when p_stripe_applicable then 'pending' else 'not_applicable' end,
    case when p_quickbooks_applicable then 'pending' else 'not_applicable' end,
    case when p_storage_applicable then 'pending' else 'not_applicable' end,
    'pending',
    p_encrypted_vendor_handles
  )
  on conflict (closure_subject_id) where completed_at is null
  do update set updated_at = v_now
  returning id into v_job_id;

  return v_job_id;
end;
$$;

revoke all on function public.request_account_closure_atomic(uuid, uuid, text, text, boolean, boolean, boolean) from public, anon, authenticated;
grant execute on function public.request_account_closure_atomic(uuid, uuid, text, text, boolean, boolean, boolean) to service_role;

create or replace function public.claim_account_closure_job(
  p_lease_token uuid,
  p_lease_duration_seconds integer default 300
)
returns table (
  id uuid,
  closure_subject_id uuid,
  account_id uuid,
  local_disposal_state text,
  stripe_state text,
  quickbooks_state text,
  storage_state text,
  auth_cleanup_state text,
  encrypted_vendor_handles text,
  version integer,
  attempts integer
)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_claimed_id uuid;
begin
  select j.id
    into v_claimed_id
    from public.account_closure_jobs j
   where j.completed_at is null
     and (j.lease_expires_at is null or j.lease_expires_at < v_now)
     and (j.next_retry_at is null or j.next_retry_at <= v_now)
     and j.attempts < j.max_attempts
   order by j.created_at asc
   limit 1
   for update skip locked;

  if v_claimed_id is not null then
    update public.account_closure_jobs
       set lease_token = p_lease_token,
           lease_expires_at = v_now + (p_lease_duration_seconds || ' seconds')::interval,
           attempts = public.account_closure_jobs.attempts + 1,
           version = public.account_closure_jobs.version + 1,
           updated_at = v_now
     where public.account_closure_jobs.id = v_claimed_id;

    return query
      select j.id, j.closure_subject_id, j.account_id,
             j.local_disposal_state, j.stripe_state, j.quickbooks_state,
             j.storage_state, j.auth_cleanup_state, j.encrypted_vendor_handles,
             j.version, j.attempts
        from public.account_closure_jobs j
       where j.id = v_claimed_id;
  end if;
end;
$$;

revoke all on function public.claim_account_closure_job(uuid, integer) from public, anon, authenticated;
grant execute on function public.claim_account_closure_job(uuid, integer) to service_role;

create or replace function public.update_closure_job_stage(
  p_job_id uuid,
  p_lease_token uuid,
  p_expected_version integer,
  p_stage text,
  p_status text,
  p_last_error text default null,
  p_encrypted_handles text default null,
  p_next_retry_at timestamptz default null
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_updated integer;
begin
  update public.account_closure_jobs
     set local_disposal_state = case when p_stage = 'local_disposal' then p_status else local_disposal_state end,
         stripe_state = case when p_stage = 'stripe' then p_status else stripe_state end,
         quickbooks_state = case when p_stage = 'quickbooks' then p_status else quickbooks_state end,
         storage_state = case when p_stage = 'storage' then p_status else storage_state end,
         auth_cleanup_state = case when p_stage = 'auth_cleanup' then p_status else auth_cleanup_state end,
         last_error = coalesce(p_last_error, last_error),
         encrypted_vendor_handles = case when p_encrypted_handles is not null then p_encrypted_handles else encrypted_vendor_handles end,
         next_retry_at = p_next_retry_at,
         version = public.account_closure_jobs.version + 1,
         updated_at = v_now
   where id = p_job_id
     and lease_token = p_lease_token
     and version = p_expected_version;

  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

revoke all on function public.update_closure_job_stage(uuid, uuid, integer, text, text, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.update_closure_job_stage(uuid, uuid, integer, text, text, text, text, timestamptz) to service_role;

create or replace function public.complete_closure_job(
  p_job_id uuid,
  p_lease_token uuid,
  p_expected_version integer,
  p_manifest jsonb
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_updated integer;
begin
  update public.account_closure_jobs
     set completed_at = v_now,
         encrypted_vendor_handles = null,
         manifest = p_manifest,
         lease_token = null,
         lease_expires_at = null,
         version = public.account_closure_jobs.version + 1,
         updated_at = v_now
   where id = p_job_id
     and lease_token = p_lease_token
     and version = p_expected_version;

  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

revoke all on function public.complete_closure_job(uuid, uuid, integer, jsonb) from public, anon, authenticated;
grant execute on function public.complete_closure_job(uuid, uuid, integer, jsonb) to service_role;

-- ----------------------------------------------------------------------------
-- 7. Multi-Tenant Safe Auth Cleanup Membership Verification RPC
-- ----------------------------------------------------------------------------
create or replace function public.check_user_active_memberships(
  p_user_id uuid,
  p_closing_account_id uuid
)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_count bigint;
begin
  -- Per-user advisory lock during Auth identity evaluation and cleanup
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('user-auth-cleanup:' || p_user_id::text, 20260830)
  );

  select pg_catalog.count(*)
    into strict v_count
    from public.memberships m
    join public.accounts a on a.id = m.account_id
   where m.user_id = p_user_id
     and m.account_id <> p_closing_account_id
     and a.suspended_at is null
     and m.deactivated_at is null;

  return v_count;
end;
$$;

revoke all on function public.check_user_active_memberships(uuid, uuid) from public, anon, authenticated;
grant execute on function public.check_user_active_memberships(uuid, uuid) to service_role;

commit;
