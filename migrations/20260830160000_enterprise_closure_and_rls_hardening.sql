-- ============================================================================
-- ENTERPRISE ACCOUNT CLOSURE LEDGER & RLS HARDENING MIGRATION
--
-- 1. Schema audit & audit.account_closure_jobs outbox ledger
-- 2. memberships.deactivated_at column & active membership indexing
-- 3. Hardened RLS helpers with safe search_path and membership deactivation
-- 4. Purge legacy singular quick_stop_priority_zone_owner policy & recreate
-- 5. Atomic closure request and worker claim RPCs
-- 6. Multi-tenant safe Auth cleanup membership verification RPC
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. Membership Deactivation Tracking
-- ----------------------------------------------------------------------------
alter table public.memberships
  add column if not exists deactivated_at timestamptz default null;

create index if not exists memberships_user_active_idx
  on public.memberships (user_id, account_id)
  where deactivated_at is null;

-- ----------------------------------------------------------------------------
-- 2. Audit Schema & Account Closure Outbox Ledger
-- ----------------------------------------------------------------------------
create schema if not exists audit;
revoke all on schema audit from public, anon, authenticated;
grant usage on schema audit to service_role;

create table if not exists audit.account_closure_jobs (
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
  on audit.account_closure_jobs (closure_subject_id)
  where completed_at is null;

create index if not exists account_closure_jobs_retry_idx
  on audit.account_closure_jobs (next_retry_at)
  where completed_at is null;

revoke all on table audit.account_closure_jobs from public, anon, authenticated;
grant all on table audit.account_closure_jobs to service_role;

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

grant execute on function public.is_member(uuid) to authenticated;
grant execute on function public.is_owner(uuid) to authenticated;
grant execute on function public.is_crew(uuid) to authenticated;
grant execute on function public.is_office(uuid) to authenticated;
grant execute on function public.has_office_access(uuid) to authenticated;
grant execute on function public.crew_on_job(uuid) to authenticated;
grant execute on function public.crew_owns_crew_row(uuid) to authenticated;

revoke all on function public.is_member(uuid) from public, anon;
revoke all on function public.is_owner(uuid) from public, anon;
revoke all on function public.is_crew(uuid) from public, anon;
revoke all on function public.is_office(uuid) from public, anon;
revoke all on function public.has_office_access(uuid) from public, anon;
revoke all on function public.crew_on_job(uuid) from public, anon;
revoke all on function public.crew_owns_crew_row(uuid) from public, anon;

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
-- 5. Atomic Closure Request RPC
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
     set suspended_at = v_now,
         updated_at = v_now
   where id = p_account_id;

  if not found then
    raise exception 'Account % not found for closure', p_account_id;
  end if;

  -- 2. Deactivate all memberships for this account
  update public.memberships
     set deactivated_at = v_now,
         updated_at = v_now
   where account_id = p_account_id
     and deactivated_at is null;

  -- 3. Insert or fetch existing active closure job
  insert into audit.account_closure_jobs (
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

-- ----------------------------------------------------------------------------
-- 6. Atomic Closure Worker Claim RPC
-- ----------------------------------------------------------------------------
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
    from audit.account_closure_jobs j
   where j.completed_at is null
     and (j.lease_expires_at is null or j.lease_expires_at < v_now)
     and (j.next_retry_at is null or j.next_retry_at <= v_now)
     and j.attempts < j.max_attempts
   order by j.created_at asc
   limit 1
   for update skip locked;

  if v_claimed_id is not null then
    update audit.account_closure_jobs
       set lease_token = p_lease_token,
           lease_expires_at = v_now + (p_lease_duration_seconds || ' seconds')::interval,
           attempts = audit.account_closure_jobs.attempts + 1,
           version = audit.account_closure_jobs.version + 1,
           updated_at = v_now
     where audit.account_closure_jobs.id = v_claimed_id;

    return query
      select j.id, j.closure_subject_id, j.account_id,
             j.local_disposal_state, j.stripe_state, j.quickbooks_state,
             j.storage_state, j.auth_cleanup_state, j.encrypted_vendor_handles,
             j.version, j.attempts
        from audit.account_closure_jobs j
       where j.id = v_claimed_id;
  end if;
end;
$$;

revoke all on function public.claim_account_closure_job(uuid, integer) from public, anon, authenticated;
grant execute on function public.claim_account_closure_job(uuid, integer) to service_role;

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
