-- ============================================================================
-- SOFT DELETION, RECOVERY & IMMUTABLE TENANT AUDIT LEDGER
--
-- 1. public.tenant_audit_events immutable transactional audit ledger
-- 2. public.recoverable_deletions trash bin manifest and restoration state
-- 3. Aggregate root lifecycle fields (leads, crew, services, jobs, account_attachments)
-- 4. 30-day grace period enhancements for account_closure_jobs
-- 5. Atomic stored procedures (soft_delete_entity_atomic, restore_entity_atomic,
--    record_tenant_audit_event_atomic, cancel_account_closure_atomic,
--    claim_recoverable_deletions_for_purge)
-- 6. Privilege hardening (revocation of raw DELETE on aggregate roots)
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. Immutable Tenant Audit Ledger
-- ----------------------------------------------------------------------------
create table if not exists public.tenant_audit_events (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null,
  entity_type text not null,
  entity_id text not null,
  action text not null,
  actor jsonb not null default '{}'::jsonb,
  source text not null default 'web'
    check (source in ('web', 'staff', 'integration', 'cron', 'migration', 'api')),
  request_id text,
  delete_operation_id uuid,
  reason text,
  changed_fields text[] default '{}'::text[],
  before_state jsonb,
  after_state jsonb,
  occurred_at timestamptz not null default clock_timestamp()
);

-- Performance and query indexes
create index if not exists tenant_audit_events_account_occurred_idx
  on public.tenant_audit_events (account_id, occurred_at desc);

create index if not exists tenant_audit_events_account_entity_idx
  on public.tenant_audit_events (account_id, entity_type, entity_id);

create index if not exists tenant_audit_events_account_action_idx
  on public.tenant_audit_events (account_id, action);

create index if not exists tenant_audit_events_delete_op_idx
  on public.tenant_audit_events (delete_operation_id)
  where delete_operation_id is not null;

-- Trigger to guarantee append-only immutability
create or replace function public.enforce_tenant_audit_immutable()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  raise exception 'tenant_audit_events is immutable and cannot be updated, deleted, or truncated';
end;
$$;

drop trigger if exists trg_tenant_audit_events_immutable on public.tenant_audit_events;
create trigger trg_tenant_audit_events_immutable
  before update or delete on public.tenant_audit_events
  for each row execute function public.enforce_tenant_audit_immutable();

alter table public.tenant_audit_events enable row level security;

-- Only tenant members can view their own tenant audit events
drop policy if exists "tenant_audit_events_select_member" on public.tenant_audit_events;
create policy "tenant_audit_events_select_member"
  on public.tenant_audit_events
  for select
  to authenticated
  using (
    exists (
      select 1 from public.memberships m
      where m.account_id = public.tenant_audit_events.account_id
        and m.user_id = auth.uid()
        and m.deactivated_at is null
    )
  );

-- Direct client inserts/updates/deletes are strictly forbidden
revoke insert, update, delete, truncate on table public.tenant_audit_events from public, anon, authenticated;
grant select on table public.tenant_audit_events to authenticated;
grant all on table public.tenant_audit_events to service_role;

-- ----------------------------------------------------------------------------
-- 2. Recoverable Deletions (Trash Bin)
-- ----------------------------------------------------------------------------
create table if not exists public.recoverable_deletions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null,
  entity_type text not null,
  entity_id text not null,
  display_snapshot jsonb not null default '{}'::jsonb,
  cascade_manifest jsonb not null default '[]'::jsonb,
  storage_manifest jsonb not null default '[]'::jsonb,
  deleted_at timestamptz not null default clock_timestamp(),
  purge_eligible_at timestamptz not null default (clock_timestamp() + interval '30 days'),
  deleted_by_user_id uuid,
  deleted_by_role text,
  deletion_reason text,
  status text not null default 'trashed'
    check (status in ('trashed', 'restoring', 'restored', 'purged')),
  restored_at timestamptz,
  restored_by_user_id uuid,
  purge_locked boolean not null default false,
  legal_hold boolean not null default false,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);

create index if not exists recoverable_deletions_account_status_idx
  on public.recoverable_deletions (account_id, status, deleted_at desc);

create index if not exists recoverable_deletions_account_entity_idx
  on public.recoverable_deletions (account_id, entity_type, entity_id);

create index if not exists recoverable_deletions_purge_queue_idx
  on public.recoverable_deletions (status, purge_eligible_at)
  where status = 'trashed' and legal_hold = false and purge_locked = false;

alter table public.recoverable_deletions enable row level security;

drop policy if exists "recoverable_deletions_select_member" on public.recoverable_deletions;
create policy "recoverable_deletions_select_member"
  on public.recoverable_deletions
  for select
  to authenticated
  using (
    exists (
      select 1 from public.memberships m
      where m.account_id = public.recoverable_deletions.account_id
        and m.user_id = auth.uid()
        and m.deactivated_at is null
    )
  );

revoke insert, update, delete, truncate on table public.recoverable_deletions from public, anon, authenticated;
grant select on table public.recoverable_deletions to authenticated;
grant all on table public.recoverable_deletions to service_role;

-- ----------------------------------------------------------------------------
-- 3. Aggregate Root Lifecycle Fields
-- ----------------------------------------------------------------------------

-- leads
alter table public.leads
  add column if not exists deleted_at timestamptz default null,
  add column if not exists purge_after timestamptz default null,
  add column if not exists deleted_by_user_id uuid default null,
  add column if not exists deletion_reason text default null,
  add column if not exists delete_operation_id uuid default null;

create index if not exists leads_account_active_idx
  on public.leads (account_id, created_at desc)
  where deleted_at is null;

-- crew (already has deleted_at from earlier migrations)
alter table public.crew
  add column if not exists purge_after timestamptz default null,
  add column if not exists deleted_by_user_id uuid default null,
  add column if not exists deletion_reason text default null,
  add column if not exists delete_operation_id uuid default null;

create index if not exists crew_account_active_idx
  on public.crew (account_id, name)
  where deleted_at is null;

-- services
alter table public.services
  add column if not exists deleted_at timestamptz default null,
  add column if not exists purge_after timestamptz default null,
  add column if not exists deleted_by_user_id uuid default null,
  add column if not exists deletion_reason text default null,
  add column if not exists delete_operation_id uuid default null;

create index if not exists services_account_active_idx
  on public.services (account_id, name)
  where deleted_at is null;

-- jobs
alter table public.jobs
  add column if not exists deleted_at timestamptz default null,
  add column if not exists purge_after timestamptz default null,
  add column if not exists deleted_by_user_id uuid default null,
  add column if not exists deletion_reason text default null,
  add column if not exists delete_operation_id uuid default null;

create index if not exists jobs_account_active_idx
  on public.jobs (account_id, created_at desc)
  where deleted_at is null;

-- account_attachments
alter table public.account_attachments
  add column if not exists deleted_at timestamptz default null,
  add column if not exists purge_after timestamptz default null,
  add column if not exists deleted_by_user_id uuid default null,
  add column if not exists deletion_reason text default null,
  add column if not exists delete_operation_id uuid default null;

create index if not exists account_attachments_account_active_idx
  on public.account_attachments (account_id, created_at desc)
  where deleted_at is null;

-- ----------------------------------------------------------------------------
-- 4. Account Closure 30-Day Grace Period Fields
-- ----------------------------------------------------------------------------
alter table public.account_closure_jobs
  add column if not exists closure_state text not null default 'pending_grace_period'
    check (closure_state in ('pending_grace_period', 'grace_period_expired', 'processing', 'completed', 'cancelled_restored')),
  add column if not exists recoverable_until timestamptz default null,
  add column if not exists purge_eligible_at timestamptz default null,
  add column if not exists recovered_at timestamptz default null,
  add column if not exists recovered_by_user_id uuid default null,
  add column if not exists prior_account_status text default 'active',
  add column if not exists legal_hold boolean not null default false;

-- ----------------------------------------------------------------------------
-- 5. Stored Procedures & Atomic RPCs
-- ----------------------------------------------------------------------------

-- 5.1 Record Tenant Audit Event (Security Definer)
create or replace function public.record_tenant_audit_event_atomic(
  p_account_id uuid,
  p_entity_type text,
  p_entity_id text,
  p_action text,
  p_actor jsonb default '{}'::jsonb,
  p_source text default 'web',
  p_request_id text default null,
  p_delete_operation_id uuid default null,
  p_reason text default null,
  p_changed_fields text[] default '{}'::text[],
  p_before_state jsonb default null,
  p_after_state jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_event_id uuid;
begin
  insert into public.tenant_audit_events (
    account_id,
    entity_type,
    entity_id,
    action,
    actor,
    source,
    request_id,
    delete_operation_id,
    reason,
    changed_fields,
    before_state,
    after_state,
    occurred_at
  ) values (
    p_account_id,
    p_entity_type,
    p_entity_id,
    p_action,
    coalesce(p_actor, '{}'::jsonb),
    coalesce(p_source, 'web'),
    p_request_id,
    p_delete_operation_id,
    p_reason,
    coalesce(p_changed_fields, '{}'::text[]),
    p_before_state,
    p_after_state,
    clock_timestamp()
  )
  returning id into v_event_id;

  return v_event_id;
end;
$$;

revoke all on function public.record_tenant_audit_event_atomic(uuid, text, text, text, jsonb, text, text, uuid, text, text[], jsonb, jsonb) from public, anon;
grant execute on function public.record_tenant_audit_event_atomic(uuid, text, text, text, jsonb, text, text, uuid, text, text[], jsonb, jsonb) to authenticated, service_role;

-- 5.2 Atomic Soft Delete Entity RPC
create or replace function public.soft_delete_entity_atomic(
  p_account_id uuid,
  p_entity_type text,
  p_entity_id text,
  p_actor jsonb default '{}'::jsonb,
  p_reason text default null,
  p_source text default 'web',
  p_request_id text default null,
  p_grace_days integer default 30
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_purge_at timestamptz := v_now + (p_grace_days || ' days')::interval;
  v_op_id uuid := gen_random_uuid();
  v_user_id uuid;
  v_user_role text;
  v_display jsonb := '{}'::jsonb;
  v_cascade jsonb := '[]'::jsonb;
  v_storage jsonb := '[]'::jsonb;
  v_before jsonb;
  v_found boolean := false;
begin
  if p_actor ? 'user_id' and p_actor->>'user_id' ~ '^[0-9a-fA-F-]{36}$' then
    v_user_id := (p_actor->>'user_id')::uuid;
  end if;
  v_user_role := coalesce(p_actor->>'role', 'authenticated');

  if p_entity_type = 'lead' then
    select to_jsonb(l.*) into v_before
      from public.leads l
     where l.account_id = p_account_id and l.id = p_entity_id::uuid and l.deleted_at is null;

    if v_before is null then
      return jsonb_build_object('success', false, 'error', 'lead_not_found_or_already_deleted');
    end if;

    v_display := jsonb_build_object(
      'title', coalesce(v_before->>'name', 'Untitled Lead'),
      'subtitle', coalesce(v_before->>'phone', v_before->>'email', 'No contact'),
      'badge', v_before->>'status',
      'details', jsonb_build_object('source', v_before->>'source', 'created_at', v_before->>'created_at')
    );

    update public.leads
       set deleted_at = v_now,
           purge_after = v_purge_at,
           deleted_by_user_id = v_user_id,
           deletion_reason = p_reason,
           delete_operation_id = v_op_id
     where account_id = p_account_id and id = p_entity_id::uuid;

  elsif p_entity_type = 'crew' then
    select to_jsonb(c.*) into v_before
      from public.crew c
     where c.account_id = p_account_id and c.id = p_entity_id::uuid and c.deleted_at is null;

    if v_before is null then
      return jsonb_build_object('success', false, 'error', 'crew_not_found_or_already_deleted');
    end if;

    v_display := jsonb_build_object(
      'title', coalesce(v_before->>'name', 'Crew Member'),
      'subtitle', coalesce(v_before->>'phone', v_before->>'role', 'Technician'),
      'badge', case when (v_before->>'active')::boolean then 'Active' else 'Inactive' end,
      'details', jsonb_build_object('role', v_before->>'role', 'created_at', v_before->>'created_at')
    );

    -- Preserve photo path in storage manifest instead of destroying
    if v_before->>'photo_path' is not null and length(v_before->>'photo_path') > 0 then
      v_storage := jsonb_build_array(jsonb_build_object(
        'bucket', 'crew-photos',
        'path', v_before->>'photo_path',
        'quarantined', true
      ));
    end if;

    update public.crew
       set deleted_at = v_now,
           active = false,
           purge_after = v_purge_at,
           deleted_by_user_id = v_user_id,
           deletion_reason = p_reason,
           delete_operation_id = v_op_id
     where account_id = p_account_id and id = p_entity_id::uuid;

  elsif p_entity_type = 'service' then
    select to_jsonb(s.*) into v_before
      from public.services s
     where s.account_id = p_account_id and s.id = p_entity_id::uuid and s.deleted_at is null;

    if v_before is null then
      return jsonb_build_object('success', false, 'error', 'service_not_found_or_already_deleted');
    end if;

    v_display := jsonb_build_object(
      'title', coalesce(v_before->>'name', 'Untitled Service'),
      'subtitle', case when (v_before->>'price')::numeric > 0 then ('$' || (v_before->>'price')) else 'Custom Price' end,
      'badge', case when coalesce((v_before->>'is_active')::boolean, true) then 'Active' else 'Disabled' end,
      'details', jsonb_build_object('category', v_before->>'category')
    );

    update public.services
       set deleted_at = v_now,
           purge_after = v_purge_at,
           deleted_by_user_id = v_user_id,
           deletion_reason = p_reason,
           delete_operation_id = v_op_id
     where account_id = p_account_id and id = p_entity_id::uuid;

  elsif p_entity_type = 'job' then
    select to_jsonb(j.*) into v_before
      from public.jobs j
     where j.account_id = p_account_id and j.id = p_entity_id::uuid and j.deleted_at is null;

    if v_before is null then
      return jsonb_build_object('success', false, 'error', 'job_not_found_or_already_deleted');
    end if;

    v_display := jsonb_build_object(
      'title', coalesce(v_before->>'title', 'Job #' || left(p_entity_id, 8)),
      'subtitle', coalesce(v_before->>'client_name', v_before->>'address', 'No client info'),
      'badge', v_before->>'status',
      'details', jsonb_build_object('total', v_before->>'total', 'created_at', v_before->>'created_at')
    );

    update public.jobs
       set deleted_at = v_now,
           purge_after = v_purge_at,
           deleted_by_user_id = v_user_id,
           deletion_reason = p_reason,
           delete_operation_id = v_op_id
     where account_id = p_account_id and id = p_entity_id::uuid;

  elsif p_entity_type = 'attachment' then
    select to_jsonb(a.*) into v_before
      from public.account_attachments a
     where a.account_id = p_account_id and a.id = p_entity_id::uuid and a.deleted_at is null;

    if v_before is null then
      return jsonb_build_object('success', false, 'error', 'attachment_not_found_or_already_deleted');
    end if;

    v_display := jsonb_build_object(
      'title', coalesce(v_before->>'filename', 'Attachment'),
      'subtitle', coalesce(v_before->>'bucket', 'Storage file'),
      'badge', v_before->>'content_type',
      'details', jsonb_build_object('file_size', v_before->>'file_size')
    );

    if v_before->>'storage_path' is not null then
      v_storage := jsonb_build_array(jsonb_build_object(
        'bucket', coalesce(v_before->>'bucket', 'account-attachments'),
        'path', v_before->>'storage_path',
        'quarantined', true
      ));
    end if;

    update public.account_attachments
       set deleted_at = v_now,
           purge_after = v_purge_at,
           deleted_by_user_id = v_user_id,
           deletion_reason = p_reason,
           delete_operation_id = v_op_id
     where account_id = p_account_id and id = p_entity_id::uuid;

  else
    return jsonb_build_object('success', false, 'error', 'unsupported_entity_type');
  end if;

  -- Create trash manifest
  insert into public.recoverable_deletions (
    id,
    account_id,
    entity_type,
    entity_id,
    display_snapshot,
    cascade_manifest,
    storage_manifest,
    deleted_at,
    purge_eligible_at,
    deleted_by_user_id,
    deleted_by_role,
    deletion_reason,
    status
  ) values (
    v_op_id,
    p_account_id,
    p_entity_type,
    p_entity_id,
    v_display,
    v_cascade,
    v_storage,
    v_now,
    v_purge_at,
    v_user_id,
    v_user_role,
    p_reason,
    'trashed'
  );

  -- Record audit log
  perform public.record_tenant_audit_event_atomic(
    p_account_id => p_account_id,
    p_entity_type => p_entity_type,
    p_entity_id => p_entity_id,
    p_action => p_entity_type || '.soft_deleted',
    p_actor => p_actor,
    p_source => p_source,
    p_request_id => p_request_id,
    p_delete_operation_id => v_op_id,
    p_reason => p_reason,
    p_changed_fields => array['deleted_at', 'purge_after', 'deleted_by_user_id', 'deletion_reason', 'delete_operation_id'],
    p_before_state => v_before,
    p_after_state => jsonb_build_object('deleted_at', v_now, 'purge_after', v_purge_at, 'status', 'trashed')
  );

  return jsonb_build_object(
    'success', true,
    'operation_id', v_op_id,
    'entity_type', p_entity_type,
    'entity_id', p_entity_id,
    'deleted_at', v_now,
    'purge_eligible_at', v_purge_at
  );
end;
$$;

revoke all on function public.soft_delete_entity_atomic(uuid, text, text, jsonb, text, text, text, integer) from public, anon;
grant execute on function public.soft_delete_entity_atomic(uuid, text, text, jsonb, text, text, text, integer) to authenticated, service_role;

-- 5.3 Atomic Restore Entity RPC (Conservative Semantics)
create or replace function public.restore_entity_atomic(
  p_account_id uuid,
  p_entity_type text,
  p_entity_id text,
  p_actor jsonb default '{}'::jsonb,
  p_source text default 'web',
  p_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_user_id uuid;
  v_deletion_record public.recoverable_deletions%rowtype;
  v_before jsonb;
begin
  if p_actor ? 'user_id' and p_actor->>'user_id' ~ '^[0-9a-fA-F-]{36}$' then
    v_user_id := (p_actor->>'user_id')::uuid;
  end if;

  select * into v_deletion_record
    from public.recoverable_deletions
   where account_id = p_account_id
     and entity_type = p_entity_type
     and entity_id = p_entity_id
     and status = 'trashed'
   order by deleted_at desc
   limit 1;

  if v_deletion_record.id is null then
    return jsonb_build_object('success', false, 'error', 'no_active_trash_record_found');
  end if;

  if p_entity_type = 'lead' then
    select to_jsonb(l.*) into v_before
      from public.leads l
     where l.account_id = p_account_id and l.id = p_entity_id::uuid;

    -- Conservative restoration: returned as 'archived' so it never triggers auto-SMS or auto-dispatch
    update public.leads
       set deleted_at = null,
           purge_after = null,
           deleted_by_user_id = null,
           deletion_reason = null,
           delete_operation_id = null,
           status = 'archived'
     where account_id = p_account_id and id = p_entity_id::uuid;

  elsif p_entity_type = 'crew' then
    select to_jsonb(c.*) into v_before
      from public.crew c
     where c.account_id = p_account_id and c.id = p_entity_id::uuid;

    -- Conservative restoration: returned as active: false so they are not silently scheduled
    update public.crew
       set deleted_at = null,
           active = false,
           purge_after = null,
           deleted_by_user_id = null,
           deletion_reason = null,
           delete_operation_id = null
     where account_id = p_account_id and id = p_entity_id::uuid;

  elsif p_entity_type = 'service' then
    select to_jsonb(s.*) into v_before
      from public.services s
     where s.account_id = p_account_id and s.id = p_entity_id::uuid;

    -- Conservative restoration: returned as is_active: false
    update public.services
       set deleted_at = null,
           is_active = false,
           purge_after = null,
           deleted_by_user_id = null,
           deletion_reason = null,
           delete_operation_id = null
     where account_id = p_account_id and id = p_entity_id::uuid;

  elsif p_entity_type = 'job' then
    select to_jsonb(j.*) into v_before
      from public.jobs j
     where j.account_id = p_account_id and j.id = p_entity_id::uuid;

    update public.jobs
       set deleted_at = null,
           purge_after = null,
           deleted_by_user_id = null,
           deletion_reason = null,
           delete_operation_id = null
     where account_id = p_account_id and id = p_entity_id::uuid;

  elsif p_entity_type = 'attachment' then
    select to_jsonb(a.*) into v_before
      from public.account_attachments a
     where a.account_id = p_account_id and a.id = p_entity_id::uuid;

    update public.account_attachments
       set deleted_at = null,
           purge_after = null,
           deleted_by_user_id = null,
           deletion_reason = null,
           delete_operation_id = null
     where account_id = p_account_id and id = p_entity_id::uuid;

  else
    return jsonb_build_object('success', false, 'error', 'unsupported_entity_type');
  end if;

  -- Update trash manifest
  update public.recoverable_deletions
     set status = 'restored',
         restored_at = v_now,
         restored_by_user_id = v_user_id,
         updated_at = v_now
   where id = v_deletion_record.id;

  -- Record audit log
  perform public.record_tenant_audit_event_atomic(
    p_account_id => p_account_id,
    p_entity_type => p_entity_type,
    p_entity_id => p_entity_id,
    p_action => p_entity_type || '.restored',
    p_actor => p_actor,
    p_source => p_source,
    p_request_id => p_request_id,
    p_delete_operation_id => v_deletion_record.id,
    p_reason => 'Manual restoration from trash bin',
    p_changed_fields => array['deleted_at', 'purge_after', 'status'],
    p_before_state => v_before,
    p_after_state => jsonb_build_object('deleted_at', null, 'status', 'restored')
  );

  return jsonb_build_object(
    'success', true,
    'entity_type', p_entity_type,
    'entity_id', p_entity_id,
    'restored_at', v_now,
    'status', 'restored'
  );
end;
$$;

revoke all on function public.restore_entity_atomic(uuid, text, text, jsonb, text, text) from public, anon;
grant execute on function public.restore_entity_atomic(uuid, text, text, jsonb, text, text) to authenticated, service_role;

-- 5.4 Atomic Account Closure Request with 30-Day Grace Period
create or replace function public.request_account_closure_atomic(
  p_account_id uuid,
  p_requested_by_user_id uuid,
  p_requested_by_role text,
  p_encrypted_vendor_handles text default null,
  p_stripe_applicable boolean default true,
  p_quickbooks_applicable boolean default true,
  p_storage_applicable boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_grace_expires timestamptz := v_now + interval '30 days';
  v_job_id uuid;
  v_prior_status text := 'active';
begin
  -- Capture prior status
  select coalesce(status, 'active') into v_prior_status
    from public.accounts
   where id = p_account_id;

  -- 1. Suspend the account tenant access immediately
  update public.accounts
     set suspended_at = coalesce(suspended_at, v_now),
         status = 'closure_requested',
         updated_at = v_now
   where id = p_account_id;

  -- 2. Deactivate all memberships for this account
  update public.memberships
     set deactivated_at = v_now
   where account_id = p_account_id
     and deactivated_at is null;

  -- 3. Cancel all queued/leased SMS delivery tasks and events
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

  -- 4. Insert or fetch existing active closure job with 30-day grace period
  insert into public.account_closure_jobs (
    closure_subject_id,
    account_id,
    requested_by_user_id,
    requested_by_role,
    access_revoked_at,
    closure_state,
    recoverable_until,
    purge_eligible_at,
    prior_account_status,
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
    'pending_grace_period',
    v_grace_expires,
    v_grace_expires,
    v_prior_status,
    'pending',
    case when p_stripe_applicable then 'pending' else 'not_applicable' end,
    case when p_quickbooks_applicable then 'pending' else 'not_applicable' end,
    case when p_storage_applicable then 'pending' else 'not_applicable' end,
    'pending',
    p_encrypted_vendor_handles
  )
  on conflict (closure_subject_id) where completed_at is null
  do update set updated_at = v_now,
                recoverable_until = coalesce(public.account_closure_jobs.recoverable_until, v_grace_expires)
  returning id into v_job_id;

  -- 5. Record tenant audit log
  perform public.record_tenant_audit_event_atomic(
    p_account_id => p_account_id,
    p_entity_type => 'account',
    p_entity_id => p_account_id::text,
    p_action => 'account.closure_requested',
    p_actor => jsonb_build_object('user_id', p_requested_by_user_id, 'role', p_requested_by_role),
    p_source => 'web',
    p_reason => 'Account closure requested by owner. 30-day grace period active.',
    p_changed_fields => array['suspended_at', 'status', 'closure_state', 'recoverable_until']
  );

  return v_job_id;
end;
$$;

revoke all on function public.request_account_closure_atomic(uuid, uuid, text, text, boolean, boolean, boolean) from public, anon, authenticated;
grant execute on function public.request_account_closure_atomic(uuid, uuid, text, text, boolean, boolean, boolean) to service_role;

-- 5.5 Cancel Account Closure Atomic (Owner Recovery during Grace Period)
create or replace function public.cancel_account_closure_atomic(
  p_account_id uuid,
  p_actor jsonb default '{}'::jsonb,
  p_source text default 'web',
  p_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_job public.account_closure_jobs%rowtype;
  v_user_id uuid;
begin
  if p_actor ? 'user_id' and p_actor->>'user_id' ~ '^[0-9a-fA-F-]{36}$' then
    v_user_id := (p_actor->>'user_id')::uuid;
  end if;

  select * into v_job
    from public.account_closure_jobs
   where closure_subject_id = p_account_id
     and completed_at is null
   order by created_at desc
   limit 1;

  if v_job.id is null then
    return jsonb_build_object('success', false, 'error', 'no_active_closure_job_found');
  end if;

  if v_job.local_disposal_state = 'completed' then
    return jsonb_build_object('success', false, 'error', 'account_already_purged_cannot_restore');
  end if;

  -- 1. Restore account state
  update public.accounts
     set suspended_at = null,
         status = coalesce(v_job.prior_account_status, 'active'),
         updated_at = v_now
   where id = p_account_id;

  -- 2. Reactivate memberships
  update public.memberships
     set deactivated_at = null
   where account_id = p_account_id;

  -- 3. Mark closure job cancelled and completed
  update public.account_closure_jobs
     set closure_state = 'cancelled_restored',
         completed_at = v_now,
         recovered_at = v_now,
         recovered_by_user_id = v_user_id,
         updated_at = v_now
   where id = v_job.id;

  -- 4. Record audit log
  perform public.record_tenant_audit_event_atomic(
    p_account_id => p_account_id,
    p_entity_type => 'account',
    p_entity_id => p_account_id::text,
    p_action => 'account.closure_cancelled',
    p_actor => p_actor,
    p_source => p_source,
    p_request_id => p_request_id,
    p_reason => 'Owner cancelled account closure during 30-day grace period',
    p_changed_fields => array['suspended_at', 'status', 'closure_state', 'recovered_at']
  );

  return jsonb_build_object(
    'success', true,
    'account_id', p_account_id,
    'status', 'restored',
    'recovered_at', v_now
  );
end;
$$;

revoke all on function public.cancel_account_closure_atomic(uuid, jsonb, text, text) from public, anon;
grant execute on function public.cancel_account_closure_atomic(uuid, jsonb, text, text) to authenticated, service_role;

-- 5.6 Claim Account Closure Job (Only After Grace Period Expires & No Legal Hold)
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
     and (j.recoverable_until is null or j.recoverable_until <= v_now)
     and j.legal_hold = false
     and j.closure_state != 'cancelled_restored'
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
           closure_state = 'processing',
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

-- 5.7 Claim Recoverable Deletions for Background Purge Engine
create or replace function public.claim_recoverable_deletions_for_purge(
  p_batch_size integer default 50
)
returns table (
  id uuid,
  account_id uuid,
  entity_type text,
  entity_id text,
  storage_manifest jsonb,
  cascade_manifest jsonb,
  deleted_at timestamptz,
  purge_eligible_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_now timestamptz := clock_timestamp();
begin
  return query
    update public.recoverable_deletions d
       set purge_locked = true,
           updated_at = v_now
     where d.id in (
       select r.id
         from public.recoverable_deletions r
        where r.status = 'trashed'
          and r.purge_eligible_at <= v_now
          and r.legal_hold = false
          and r.purge_locked = false
        order by r.purge_eligible_at asc
        limit p_batch_size
        for update skip locked
     )
    returning d.id, d.account_id, d.entity_type, d.entity_id, d.storage_manifest, d.cascade_manifest, d.deleted_at, d.purge_eligible_at;
end;
$$;

revoke all on function public.claim_recoverable_deletions_for_purge(integer) from public, anon, authenticated;
grant execute on function public.claim_recoverable_deletions_for_purge(integer) to service_role;

-- ----------------------------------------------------------------------------
-- 6. Privilege Hardening (Revoke Direct DELETE from Authenticated Roles)
-- ----------------------------------------------------------------------------
revoke delete on table public.leads from authenticated, anon;
revoke delete on table public.crew from authenticated, anon;
revoke delete on table public.services from authenticated, anon;
revoke delete on table public.jobs from authenticated, anon;
revoke delete on table public.account_attachments from authenticated, anon;

commit;
