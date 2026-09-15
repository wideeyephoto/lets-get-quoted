begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
-- Source: 20260904200000_voice_ai_lead_capture_and_notifications.sql
-- Migration: 20260904200000_voice_ai_lead_capture_and_notifications.sql
--
-- Add per-workspace toggles for caller post-call SMS and contractor call notifications.

alter table public.voice_settings
  add column if not exists post_call_sms_enabled boolean not null default true,
  add column if not exists contractor_notifications_enabled boolean not null default true,
  add column if not exists contractor_notification_channel text not null default 'sms'
    check (contractor_notification_channel in ('sms', 'email', 'both', 'none'));

comment on column public.voice_settings.post_call_sms_enabled is
  'Whether callers receive an automated post-call SMS follow-up with booking or portal links.';

comment on column public.voice_settings.contractor_notifications_enabled is
  'Whether the contractor receives an immediate alert when an ordinary AI call completes.';

comment on column public.voice_settings.contractor_notification_channel is
  'Preferred channel for contractor call alerts: sms, email, both, or none.';


-- Source: 20260904210000_sms_delivery_task_ttl.sql
-- -------------------------------------------------------------------------
-- Enforce 24-Hour Expiration TTL on SMS Delivery Tasks
-- Tasks older than 24 hours past their available_at time are cancelled with
-- error_reason = 'sms_delivery_expired' instead of attempting delivery days late.
-- -------------------------------------------------------------------------

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

  -- Recover stale leases before selecting new work. A request-started lease is
  -- terminally uncertain; a pre-request lease may safely return to the queue.
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
      if not found then
        raise exception 'Expired SMS request has no exact sending event'
          using errcode = '55000';
      end if;
      update public.sms_delivery_attempts a
         set outcome = 'indeterminate',
             error_code = 'sms_delivery_unknown_after_lease_expiry',
             finished_at = v_now
       where a.claim_token = v_task.claim_token
         and a.outcome is null;
      if not found then
        raise exception 'Expired SMS request has no open attempt'
          using errcode = '55000';
      end if;
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
      if not found then
        raise exception 'Expired SMS lease has no open attempt'
          using errcode = '55000';
      end if;
      update public.sms_delivery_tasks t
         set task_state = 'queued', claim_token = null,
             lease_expires_at = null, available_at = v_now,
             last_error_code = 'sms_delivery_pre_request_lease_expired',
             updated_at = v_now
       where t.sms_event_id = v_task.sms_event_id;
    end if;
  end loop;

  -- Expire stale queued tasks that have exceeded their TTL (24 hours past available_at)
  for v_task in
    select t.*
      from public.sms_delivery_tasks t
     where t.task_state = 'queued'
       and t.available_at < v_now - interval '24 hours'
     order by t.available_at, t.sms_event_id
     limit 100
     for update skip locked
  loop
    update public.sms_events e
       set status = 'cancelled',
           error_reason = 'sms_delivery_expired',
           cancelled_at = v_now,
           updated_at = v_now
     where e.id = v_task.sms_event_id
       and e.status = 'queued';

    update public.sms_delivery_tasks t
       set task_state = 'cancelled',
           claim_token = null,
           lease_expires_at = null,
           last_error_code = 'sms_delivery_expired',
           cancelled_at = v_now,
           updated_at = v_now
     where t.sms_event_id = v_task.sms_event_id;
  end loop;

  -- Claim only unexpired tasks within the 24h window
  for v_task in
    select t.*
      from public.sms_delivery_tasks t
     where t.task_state = 'queued'
       and t.available_at <= v_now
       and t.available_at >= v_now - interval '24 hours'
       and t.attempt_count < 8
     order by t.available_at, t.sms_event_id
     limit p_batch_size
     for update skip locked
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

  -- Cancel expired tasks if more than 24 hours past available_at or created_at
  if v_task.available_at < v_now - interval '24 hours' or v_task.created_at < v_now - interval '24 hours' then
    update public.sms_events e
       set status = 'cancelled', error_reason = 'sms_delivery_expired',
           cancelled_at = v_now, updated_at = v_now
     where e.id = v_event.id;
    update public.sms_delivery_tasks t
       set task_state = 'cancelled', claim_token = null,
           lease_expires_at = null, last_error_code = 'sms_delivery_expired',
           cancelled_at = v_now, updated_at = v_now
     where t.sms_event_id = v_event.id;
    update public.sms_delivery_attempts a
       set outcome = 'cancelled', error_code = 'sms_delivery_expired',
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

  if v_event.sender_number_id is not null then
    select s.* into v_sender
      from public.sms_sender_numbers s
     where s.id = v_event.sender_number_id
       and s.provider = p_provider
       and s.purpose = v_event.sender_purpose
       and (s.account_id is null or s.account_id = v_event.account_id)
       and s.provisioning_status = 'active'
       and s.assignment_state = 'assigned'
       and s.inbound_ready
       and s.suspended_at is null
     for share;
  else
    select s.* into v_sender
      from public.sms_sender_numbers s
     where s.provider = p_provider
       and s.purpose = v_event.sender_purpose
       and (
         (s.purpose = 'contractor_dedicated' and s.account_id = v_event.account_id)
         or (s.purpose in ('lgq_shared', 'lgq_dispatch') and s.account_id is null)
       )
       and s.provisioning_status = 'active'
       and s.assignment_state = 'assigned'
       and s.inbound_ready
       and s.suspended_at is null
     order by s.activated_at, s.id
     limit 1
     for share;
  end if;
  if v_sender.id is null then
    return query select 'blocked_sender'::text, null::uuid, null::text, null::text;
    return;
  end if;

  -- Recheck sender-scoped STOP at the same compare-and-set boundary as consent
  -- and inventory readiness. A STOP arriving after enqueue but before egress
  -- therefore wins without a race, including for the shared LGQ sender.
  if exists (
    select 1
      from public.sms_sender_keyword_preferences p
     where p.sender_number_id = v_sender.id
       and p.phone_number = v_event.phone_number
       and p.status = 'opted_out'
       and p.opted_out_at is not null
  ) then
    update public.sms_events e
       set status = 'cancelled', error_reason = 'sms_sender_opted_out',
           cancelled_at = v_now, updated_at = v_now
     where e.id = v_event.id;
    update public.sms_delivery_tasks t
       set task_state = 'cancelled', claim_token = null,
           lease_expires_at = null, last_error_code = 'sms_sender_opted_out',
           cancelled_at = v_now, updated_at = v_now
     where t.sms_event_id = v_event.id;
    update public.sms_delivery_attempts a
       set outcome = 'cancelled', error_code = 'sms_sender_opted_out',
           finished_at = v_now
     where a.claim_token = p_claim_token and a.outcome is null;
    return query select 'cancelled'::text, null::uuid, null::text, null::text;
    return;
  end if;

  update public.sms_events e
     set provider = p_provider,
         sender_number_id = v_sender.id,
         updated_at = v_now
   where e.id = v_event.id;

  return query
  select 'ready'::text, v_sender.id, v_sender.e164_number,
         v_sender.provider_number_id;
end;
$$;

revoke all on function public.claim_sms_delivery_tasks(integer) from public, anon, authenticated;
grant execute on function public.claim_sms_delivery_tasks(integer) to service_role;

revoke all on function public.stage_sms_delivery(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.stage_sms_delivery(uuid, uuid, text) to service_role;


-- Source: 20260905090000_inventory_comprehensive_hardening.sql
-- Migration: 20260905090000_inventory_comprehensive_hardening.sql
-- Description: Comprehensive hardening for inventory: image storage column, soft deletion support,
-- tool custody audit log, van kit templates, maintenance immutability enforcement, and granular office permissions.

-- ============================================================================
-- 1. Ensure dedicated columns across inventory tables
-- ============================================================================

alter table public.inventory_tools
  add column if not exists image_url text,
  add column if not exists deleted_at timestamptz,
  add column if not exists expected_return_date date;

alter table public.inventory_vehicles
  add column if not exists deleted_at timestamptz;

alter table public.inventory_stock_items
  add column if not exists deleted_at timestamptz;

alter table public.inventory_locations
  add column if not exists deleted_at timestamptz;

-- Backfill image_url from notes TAX_META if previously encoded
update public.inventory_tools
set image_url = substring(notes from '<!--TAX_META:\{.*"imageUrl":"([^"]+)".*\}-->')
where image_url is null and notes ~ '<!--TAX_META:\{.*"imageUrl":"([^"]+)".*\}-->';

-- ============================================================================
-- 2. Tool Custody Audit Trail Table
-- ============================================================================

create table if not exists public.inventory_tool_custody_log (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  tool_id uuid not null references public.inventory_tools(id) on delete cascade,
  action text not null, -- 'check_out', 'check_in', 'relocate', 'maintenance_sent', 'maintenance_returned'
  crew_id uuid references public.crew(id) on delete set null,
  crew_name text,
  job_id uuid references public.jobs(id) on delete set null,
  job_label text,
  performed_by text,
  notes text,
  occurred_at timestamptz not null default now()
);

create index if not exists idx_inv_tool_custody_account_tool
  on public.inventory_tool_custody_log(account_id, tool_id);

create index if not exists idx_inv_tool_custody_occurred
  on public.inventory_tool_custody_log(account_id, occurred_at desc);

alter table public.inventory_tool_custody_log enable row level security;

drop policy if exists "office_users_read_inventory_tool_custody" on public.inventory_tool_custody_log;
create policy "office_users_read_inventory_tool_custody"
  on public.inventory_tool_custody_log
  for select
  to authenticated
  using (
    public.office_can(account_id, 'inventory.read')
    or public.office_can(account_id, 'jobs.read')
  );

drop policy if exists "office_users_insert_inventory_tool_custody" on public.inventory_tool_custody_log;
create policy "office_users_insert_inventory_tool_custody"
  on public.inventory_tool_custody_log
  for insert
  to authenticated
  with check (
    public.office_can(account_id, 'inventory.custody')
    or public.office_can(account_id, 'inventory.write')
    or public.office_can(account_id, 'jobs.write')
  );

grant select, insert on public.inventory_tool_custody_log to authenticated;
revoke all on public.inventory_tool_custody_log from anon, public;

-- ============================================================================
-- 3. Van Kit Restock Templates Table
-- ============================================================================

create table if not exists public.inventory_van_kit_templates (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  name text not null,
  description text,
  items jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_inv_van_kit_templates_acc
  on public.inventory_van_kit_templates(account_id);

alter table public.inventory_van_kit_templates enable row level security;

drop policy if exists "office_users_read_van_kit_templates" on public.inventory_van_kit_templates;
create policy "office_users_read_van_kit_templates"
  on public.inventory_van_kit_templates
  for select
  to authenticated
  using (
    public.office_can(account_id, 'inventory.read')
    or public.office_can(account_id, 'jobs.read')
  );

drop policy if exists "office_users_manage_van_kit_templates" on public.inventory_van_kit_templates;
create policy "office_users_manage_van_kit_templates"
  on public.inventory_van_kit_templates
  for all
  to authenticated
  using (
    public.office_can(account_id, 'inventory.write')
    or public.office_can(account_id, 'jobs.write')
  )
  with check (
    public.office_can(account_id, 'inventory.write')
    or public.office_can(account_id, 'jobs.write')
  );

grant select, insert, update, delete on public.inventory_van_kit_templates to authenticated;
revoke all on public.inventory_van_kit_templates from anon, public;

-- ============================================================================
-- 4. Maintenance Records Immutability Enforcement
-- ============================================================================

create or replace function public.enforce_inventory_maintenance_immutable()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  raise exception 'inventory_maintenance_records is an immutable audit ledger and cannot be modified or deleted';
end;
$$;

drop trigger if exists trg_enforce_inventory_maintenance_immutable on public.inventory_maintenance_records;
create trigger trg_enforce_inventory_maintenance_immutable
  before update or delete
  on public.inventory_maintenance_records
  for each row
  execute function public.enforce_inventory_maintenance_immutable();

-- Revoke update and delete on maintenance records to uphold audit guarantees
revoke update, delete on public.inventory_maintenance_records from authenticated;

-- ============================================================================
-- 5. Seed Granular Inventory Capabilities
-- ============================================================================

insert into public.office_capabilities (capability, band, grants) values
  ('inventory.read', 'work', 'Every tool, fleet vehicle, stock level, depot location, and maintenance schedule.'),
  ('inventory.custody', 'work', 'Sign tools in and out to crew or jobs, transfer van stock, and log vehicle maintenance.'),
  ('inventory.write', 'work', 'Add, edit, retire, and remove tools, fleet vehicles, catalog stock, and depot locations.')
on conflict (capability) do update
  set band = excluded.band, grants = excluded.grants;

-- Update RLS policies to admit inventory capabilities alongside backward-compatible jobs.* policies
drop policy if exists "office_users_read_inventory_locations" on public.inventory_locations;
create policy "office_users_read_inventory_locations"
  on public.inventory_locations
  for select
  to authenticated
  using (
    public.office_can(account_id, 'inventory.read')
    or public.office_can(account_id, 'jobs.read')
  );

drop policy if exists "office_users_write_inventory_locations" on public.inventory_locations;
create policy "office_users_write_inventory_locations"
  on public.inventory_locations
  for all
  to authenticated
  using (
    public.office_can(account_id, 'inventory.write')
    or public.office_can(account_id, 'jobs.write')
  )
  with check (
    public.office_can(account_id, 'inventory.write')
    or public.office_can(account_id, 'jobs.write')
  );

drop policy if exists "office_users_read_inventory_tools" on public.inventory_tools;
create policy "office_users_read_inventory_tools"
  on public.inventory_tools
  for select
  to authenticated
  using (
    public.office_can(account_id, 'inventory.read')
    or public.office_can(account_id, 'jobs.read')
  );

drop policy if exists "office_users_write_inventory_tools" on public.inventory_tools;
create policy "office_users_write_inventory_tools"
  on public.inventory_tools
  for all
  to authenticated
  using (
    public.office_can(account_id, 'inventory.write')
    or public.office_can(account_id, 'inventory.custody')
    or public.office_can(account_id, 'jobs.write')
  )
  with check (
    public.office_can(account_id, 'inventory.write')
    or public.office_can(account_id, 'inventory.custody')
    or public.office_can(account_id, 'jobs.write')
  );

drop policy if exists "office_users_read_inventory_vehicles" on public.inventory_vehicles;
create policy "office_users_read_inventory_vehicles"
  on public.inventory_vehicles
  for select
  to authenticated
  using (
    public.office_can(account_id, 'inventory.read')
    or public.office_can(account_id, 'jobs.read')
  );

drop policy if exists "office_users_write_inventory_vehicles" on public.inventory_vehicles;
create policy "office_users_write_inventory_vehicles"
  on public.inventory_vehicles
  for all
  to authenticated
  using (
    public.office_can(account_id, 'inventory.write')
    or public.office_can(account_id, 'inventory.custody')
    or public.office_can(account_id, 'jobs.write')
  )
  with check (
    public.office_can(account_id, 'inventory.write')
    or public.office_can(account_id, 'inventory.custody')
    or public.office_can(account_id, 'jobs.write')
  );

drop policy if exists "office_users_read_inventory_stock_items" on public.inventory_stock_items;
create policy "office_users_read_inventory_stock_items"
  on public.inventory_stock_items
  for select
  to authenticated
  using (
    public.office_can(account_id, 'inventory.read')
    or public.office_can(account_id, 'jobs.read')
  );

drop policy if exists "office_users_write_inventory_stock_items" on public.inventory_stock_items;
create policy "office_users_write_inventory_stock_items"
  on public.inventory_stock_items
  for all
  to authenticated
  using (
    public.office_can(account_id, 'inventory.write')
    or public.office_can(account_id, 'inventory.custody')
    or public.office_can(account_id, 'jobs.write')
  )
  with check (
    public.office_can(account_id, 'inventory.write')
    or public.office_can(account_id, 'inventory.custody')
    or public.office_can(account_id, 'jobs.write')
  );

drop policy if exists "office_users_read_inventory_stock_transfers" on public.inventory_stock_transfers;
create policy "office_users_read_inventory_stock_transfers"
  on public.inventory_stock_transfers
  for select
  to authenticated
  using (
    public.office_can(account_id, 'inventory.read')
    or public.office_can(account_id, 'jobs.read')
  );

drop policy if exists "office_users_write_inventory_stock_transfers" on public.inventory_stock_transfers;
create policy "office_users_write_inventory_stock_transfers"
  on public.inventory_stock_transfers
  for insert
  to authenticated
  with check (
    public.office_can(account_id, 'inventory.custody')
    or public.office_can(account_id, 'inventory.write')
    or public.office_can(account_id, 'jobs.write')
  );

drop policy if exists "office_users_read_inventory_maintenance_records" on public.inventory_maintenance_records;
create policy "office_users_read_inventory_maintenance_records"
  on public.inventory_maintenance_records
  for select
  to authenticated
  using (
    public.office_can(account_id, 'inventory.read')
    or public.office_can(account_id, 'jobs.read')
  );

drop policy if exists "office_users_write_inventory_maintenance_records" on public.inventory_maintenance_records;
create policy "office_users_write_inventory_maintenance_records"
  on public.inventory_maintenance_records
  for insert
  to authenticated
  with check (
    public.office_can(account_id, 'inventory.custody')
    or public.office_can(account_id, 'inventory.write')
    or public.office_can(account_id, 'jobs.write')
  );


-- Source: 20260905100000_office_enable_client_duplicate_dismissals_and_portal.sql
-- Enable capability-aware RLS policies on client_duplicate_dismissals and client_portal_access
-- allowing office users with clients.read to view and clients.write to manage dismissals and portal access.

-- 1. client_duplicate_dismissals
alter table if exists client_duplicate_dismissals enable row level security;
drop policy if exists client_duplicate_dismissals_owner on client_duplicate_dismissals;
drop policy if exists client_duplicate_dismissals_select on client_duplicate_dismissals;
drop policy if exists client_duplicate_dismissals_modify on client_duplicate_dismissals;

create policy client_duplicate_dismissals_select on client_duplicate_dismissals
  for select using (office_can(account_id, 'clients.read'));

create policy client_duplicate_dismissals_modify on client_duplicate_dismissals
  for all using (office_can(account_id, 'clients.write')) with check (office_can(account_id, 'clients.write'));

-- 2. client_portal_access
alter table if exists client_portal_access enable row level security;
drop policy if exists client_portal_access_owner on client_portal_access;
drop policy if exists client_portal_access_select on client_portal_access;
drop policy if exists client_portal_access_modify on client_portal_access;

create policy client_portal_access_select on client_portal_access
  for select using (office_can(account_id, 'clients.read'));

create policy client_portal_access_modify on client_portal_access
  for all using (office_can(account_id, 'clients.write')) with check (office_can(account_id, 'clients.write'));


-- Source: 20260905120000_merchandise_hardening.sql
-- Migration: 20260905120000_merchandise_hardening.sql
-- Description: Hardening merchandise orders, unique index on stripe_session_id, status CHECK constraint, fulfillment attempts dead-letter ledger, and revenue ledger security

-- 1. Unique index on stripe_session_id for idempotent lookups and expired session queries
CREATE UNIQUE INDEX IF NOT EXISTS idx_merchandise_orders_stripe_session_unique
  ON public.merchandise_orders(stripe_session_id)
  WHERE stripe_session_id IS NOT NULL;

-- 2. Status constraint on merchandise_orders
ALTER TABLE public.merchandise_orders
  DROP CONSTRAINT IF EXISTS chk_merchandise_orders_status;

ALTER TABLE public.merchandise_orders
  ADD CONSTRAINT chk_merchandise_orders_status
  CHECK (status IN (
    'pending_payment',
    'paid',
    'proof_approved',
    'in_production',
    'shipped',
    'delivered',
    'cancelled',
    'failed',
    'on_hold',
    'refunded',
    'disputed'
  ));

-- 3. Revoke client access to merchandise_revenue_ledger (Platform-Internal Service-Role only)
DROP POLICY IF EXISTS "office_users_read_merchandise_revenue" ON public.merchandise_revenue_ledger;
REVOKE ALL ON public.merchandise_revenue_ledger FROM authenticated;
REVOKE ALL ON public.merchandise_revenue_ledger FROM anon, public;

-- 4. Merchandise Fulfillment Attempts Ledger (Dead-letter & Retry tracking)
CREATE TABLE IF NOT EXISTS public.merchandise_fulfillment_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.merchandise_orders(id) ON DELETE CASCADE,
  attempt_number INT NOT NULL DEFAULT 1,
  provider TEXT NOT NULL DEFAULT 'printful', -- 'printful', 'commercial_print_broker'
  status TEXT NOT NULL, -- 'pending', 'succeeded', 'failed'
  request_payload JSONB,
  response_payload JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_merchandise_fulfillment_order
  ON public.merchandise_fulfillment_attempts(order_id);

ALTER TABLE public.merchandise_fulfillment_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.merchandise_fulfillment_attempts FROM anon, authenticated, public;


-- Source: 20260905140000_cancellation_waitlist_office_rls.sql
-- Configure capability-aware RLS policies on cancellation_waitlist and waitlist_offers
-- allowing office users with schedule.write and jobs.read to manage the waitlist.

-- 1. cancellation_waitlist
alter table if exists cancellation_waitlist enable row level security;
drop policy if exists cancellation_waitlist_owner on cancellation_waitlist;
drop policy if exists cancellation_waitlist_select on cancellation_waitlist;
drop policy if exists cancellation_waitlist_modify on cancellation_waitlist;

create policy cancellation_waitlist_select on cancellation_waitlist
  for select using (office_can(account_id, 'jobs.read'));

create policy cancellation_waitlist_modify on cancellation_waitlist
  for all using (office_can(account_id, 'schedule.write')) with check (office_can(account_id, 'schedule.write'));

-- 2. waitlist_offers
alter table if exists waitlist_offers enable row level security;
drop policy if exists waitlist_offers_owner on waitlist_offers;
drop policy if exists waitlist_offers_select on waitlist_offers;
drop policy if exists waitlist_offers_modify on waitlist_offers;

create policy waitlist_offers_select on waitlist_offers
  for select using (office_can(account_id, 'jobs.read'));

create policy waitlist_offers_modify on waitlist_offers
  for all using (office_can(account_id, 'schedule.write')) with check (office_can(account_id, 'schedule.write'));


-- Source: 20260905140000_office_marketing_capabilities.sql
-- ============================================================================
-- Seed Marketing Capabilities in office_capabilities
-- ============================================================================

insert into public.office_capabilities (capability, band, grants) values
  ('marketing.read', 'work', 'Campaign history, attribution, marketing performance and the seasonal calendar.'),
  ('marketing.write', 'work', 'Compose and send email and text campaigns, write blog posts, and configure ad campaigns.')
on conflict (capability) do update
  set band = excluded.band, grants = excluded.grants;


-- Source: 20260905140000_review_invites_rls_hardening.sql
-- Align review_invites_modify WITH CHECK policy with USING (OR instead of AND)
-- so office users holding jobs.write can manage review invites without failing check constraints.
-- Also revoke anon INSERT, UPDATE, DELETE permissions on review_invites.

alter table if exists public.review_invites enable row level security;

drop policy if exists review_invites_modify on public.review_invites;

create policy review_invites_modify on public.review_invites
  for all using (
    public.office_can(account_id, 'jobs.write')
    or public.office_can(account_id, 'clients.write')
  ) with check (
    public.office_can(account_id, 'jobs.write')
    or public.office_can(account_id, 'clients.write')
  );

-- The revoke is the security: revoke unauthenticated write grants on review_invites
revoke insert, update, delete on table public.review_invites from anon;


-- Source: 20260905150000_marketing_tracking_links.sql
-- Migration: 20260905150000_marketing_tracking_links.sql
-- Description: Multi-user campaign tracking links, short-codes, offline QR collateral, scan tracking, and ad-spend.

create table if not exists public.marketing_tracking_links (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  short_code text not null,
  name text not null,
  channel_id text not null default 'print_qr',
  source text not null default 'yard_sign',
  medium text not null default 'print_qr',
  campaign text not null,
  content text,
  term text,
  promo text,
  destination_url text not null,
  full_url text not null,
  ad_spend numeric(10, 2) not null default 0.00,
  scan_count integer not null default 0,
  last_scanned_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  deleted_at timestamptz
);

create unique index if not exists idx_marketing_tracking_links_short_code
  on public.marketing_tracking_links(lower(short_code))
  where deleted_at is null;

create index if not exists idx_marketing_tracking_links_account
  on public.marketing_tracking_links(account_id, created_at desc)
  where deleted_at is null;

create index if not exists idx_marketing_tracking_links_campaign
  on public.marketing_tracking_links(account_id, lower(campaign))
  where deleted_at is null;

alter table public.marketing_tracking_links enable row level security;

drop policy if exists "office_users_read_marketing_tracking_links" on public.marketing_tracking_links;
create policy "office_users_read_marketing_tracking_links"
  on public.marketing_tracking_links
  for select
  to authenticated
  using (
    public.office_can(account_id, 'marketing.read')
  );

drop policy if exists "office_users_insert_marketing_tracking_links" on public.marketing_tracking_links;
create policy "office_users_insert_marketing_tracking_links"
  on public.marketing_tracking_links
  for insert
  to authenticated
  with check (
    public.office_can(account_id, 'marketing.write')
  );

drop policy if exists "office_users_update_marketing_tracking_links" on public.marketing_tracking_links;
create policy "office_users_update_marketing_tracking_links"
  on public.marketing_tracking_links
  for update
  to authenticated
  using (
    public.office_can(account_id, 'marketing.write')
  )
  with check (
    public.office_can(account_id, 'marketing.write')
  );

drop policy if exists "office_users_delete_marketing_tracking_links" on public.marketing_tracking_links;
create policy "office_users_delete_marketing_tracking_links"
  on public.marketing_tracking_links
  for delete
  to authenticated
  using (
    public.office_can(account_id, 'marketing.write')
  );

grant select, insert, update, delete on public.marketing_tracking_links to authenticated;
revoke all on public.marketing_tracking_links from anon, public;


-- Source: 20260905151055_voice_observation_and_recording_hardening.sql

-- Provider durations are operational measurements, never AI billing authority.
alter table public.voice_calls
  add column if not exists forwarding_seconds integer check (forwarding_seconds >= 0),
  add column if not exists forwarding_connected_at timestamptz,
  add column if not exists forwarding_ended_at timestamptz;

-- Keep early recording callbacks until the canonical call arrives. No browser
-- role may write or read provider payloads or recording URLs through this table.
create table if not exists public.voice_recording_observations (
  provider_call_id text primary key,
  recording_status text not null check (recording_status in ('pending','ready','failed')),
  storage_path text,
  duration_seconds integer check (duration_seconds >= 0),
  size_bytes bigint check (size_bytes >= 0),
  created_at timestamptz not null default now(),
  check (recording_status <> 'ready' or storage_path is not null)
);
create table if not exists public.voice_recording_deletions (
  id uuid primary key default gen_random_uuid(),
  storage_path text not null unique,
  created_at timestamptz not null default now()
);
alter table public.voice_recording_observations enable row level security;
alter table public.voice_recording_observations force row level security;
alter table public.voice_recording_deletions enable row level security;
alter table public.voice_recording_deletions force row level security;
revoke all on public.voice_recording_observations, public.voice_recording_deletions from public, anon, authenticated;
grant all on public.voice_recording_observations, public.voice_recording_deletions to service_role;

create or replace function public.apply_voice_recording_observation(
  p_call_id text, p_status text, p_url text, p_duration integer, p_size bigint,
  p_to_number text default null, p_caller text default null
) returns void language plpgsql security invoker set search_path = pg_catalog, public as $$
declare v_account uuid; v_admitted boolean := false; v_observation public.voice_recording_observations;
begin
  if nullif(btrim(p_call_id),'') is null then raise exception 'Missing call identity'; end if;
  -- Serialize early callback and call creation, and monotonically preserve ready.
  perform pg_advisory_xact_lock(hashtextextended(p_call_id, 7261));
  insert into public.voice_recording_observations(provider_call_id,recording_status,storage_path,duration_seconds,size_bytes)
    values(p_call_id,p_status,p_url,p_duration,p_size)
    on conflict(provider_call_id) do update set
      recording_status=excluded.recording_status,storage_path=excluded.storage_path,
      duration_seconds=excluded.duration_seconds,size_bytes=excluded.size_bytes
    where voice_recording_observations.recording_status <> 'ready'
      and (excluded.recording_status <> 'pending' or voice_recording_observations.recording_status = 'pending');
  select * into v_observation from public.voice_recording_observations where provider_call_id=p_call_id;
  select account_id into v_account from public.voice_call_admissions where provider='signalwire' and provider_call_id=p_call_id;
  v_admitted := found;
  if v_account is null and p_to_number is not null then
    select account_id into v_account from public.voice_number_inventory
      where provider='signalwire' and e164_number=p_to_number and lifecycle_state='active';
  end if;
  if v_account is not null then
    insert into public.voice_calls(account_id,provider,provider_call_id,caller_number,started_at,outcome,settlement,is_provisional)
      values(v_account,'signalwire',p_call_id,p_caller,now(),case when v_admitted then 'in_progress' else 'voicemail' end,case when v_admitted then 'unsettled' else 'unmetered' end,v_admitted)
      on conflict(provider,provider_call_id) do nothing;
  end if;
  update public.voice_calls set outcome=case when not v_admitted and p_to_number is not null and p_status='ready' then 'voicemail' else outcome end,recording_status=v_observation.recording_status,
    recording_storage_path=v_observation.storage_path,recording_duration_seconds=v_observation.duration_seconds,
    recording_size_bytes=v_observation.size_bytes,recording_content_type='audio/mpeg',recording_captured_at=now()
    where provider='signalwire' and provider_call_id=p_call_id and recording_status <> 'expired';
end $$;

create or replace function public.project_early_voice_recording() returns trigger
language plpgsql security invoker set search_path = pg_catalog, public as $$
declare r public.voice_recording_observations;
begin
  perform pg_advisory_xact_lock(hashtextextended(new.provider_call_id,7261));
  select * into r from public.voice_recording_observations where provider_call_id=new.provider_call_id;
  if found then
    new.recording_status=r.recording_status; new.recording_storage_path=r.storage_path;
    new.recording_duration_seconds=r.duration_seconds; new.recording_size_bytes=r.size_bytes;
    new.recording_content_type='audio/mpeg'; new.recording_captured_at=now();
  end if;
  return new;
end $$;
drop trigger if exists project_early_voice_recording on public.voice_calls;
create trigger project_early_voice_recording before insert on public.voice_calls
  for each row execute function public.project_early_voice_recording();

-- Enqueue provider deletion in the same transaction that removes caller history.
create or replace function public.queue_deleted_voice_recording() returns trigger
language plpgsql security invoker set search_path = pg_catalog, public as $$
begin
  if old.recording_storage_path is not null then
    insert into public.voice_recording_deletions(storage_path) values(old.recording_storage_path) on conflict do nothing;
  end if;
  delete from public.voice_recording_observations where provider_call_id=old.provider_call_id;
  return old;
end $$;
drop trigger if exists queue_deleted_voice_recording on public.voice_calls;
create trigger queue_deleted_voice_recording before delete on public.voice_calls
  for each row execute function public.queue_deleted_voice_recording();

-- Usage evidence outlives transcript retention and contains no caller content.
create table if not exists public.voice_forwarding_usage (
  provider_call_id text primary key, account_id uuid not null references public.accounts(id) on delete cascade,
  observed_at timestamptz not null, connected_at timestamptz, ended_at timestamptz,
  seconds integer check(seconds>=0 and seconds<=86400)
);
create index if not exists voice_forwarding_usage_account_period on public.voice_forwarding_usage(account_id,observed_at);
alter table public.voice_forwarding_usage enable row level security;
alter table public.voice_forwarding_usage force row level security;
revoke all on public.voice_forwarding_usage from public,anon,authenticated;
grant all on public.voice_forwarding_usage to service_role;
create or replace function public.record_voice_forwarding_usage(
  p_account_id uuid,p_call_id text,p_caller text,p_state text,p_seconds integer,p_observed_at timestamptz
) returns void language plpgsql security invoker set search_path = pg_catalog, public as $$
declare u public.voice_forwarding_usage;
begin
  if p_seconds < 0 or p_seconds > 86400 or nullif(btrim(p_call_id),'') is null then raise exception 'Invalid forwarding duration'; end if;
  insert into public.voice_forwarding_usage(provider_call_id,account_id,observed_at,seconds,connected_at,ended_at)
    values(p_call_id,p_account_id,case when p_state='completed' and p_seconds is not null then p_observed_at-make_interval(secs=>p_seconds) else p_observed_at end,p_seconds,
      case when p_state='connected' then p_observed_at end,
      case when p_state in ('disconnected','completed') then p_observed_at end)
    on conflict(provider_call_id) do update set
      observed_at=least(voice_forwarding_usage.observed_at,excluded.observed_at),
      seconds=greatest(voice_forwarding_usage.seconds,excluded.seconds),
      connected_at=least(voice_forwarding_usage.connected_at,excluded.connected_at),
      ended_at=greatest(voice_forwarding_usage.ended_at,excluded.ended_at)
      where voice_forwarding_usage.account_id=excluded.account_id;
  update public.voice_forwarding_usage set seconds=greatest(seconds,
    least(86400,greatest(0,ceil(extract(epoch from (ended_at-connected_at)))::integer)))
    where provider_call_id=p_call_id and account_id=p_account_id and connected_at is not null and ended_at is not null;
  select * into strict u from public.voice_forwarding_usage where provider_call_id=p_call_id and account_id=p_account_id;
  insert into public.voice_calls(account_id,provider,provider_call_id,caller_number,started_at,outcome,settlement)
    values(p_account_id,'signalwire',p_call_id,p_caller,u.observed_at,case when p_state in ('no-answer','busy','failed','canceled','ended') then 'failed' else 'transferred' end,'unmetered')
    on conflict(provider,provider_call_id) do nothing;
  update public.voice_calls set forwarding_seconds=u.seconds,forwarding_connected_at=u.connected_at,forwarding_ended_at=u.ended_at
    where provider='signalwire' and provider_call_id=p_call_id and account_id=p_account_id;
end $$;
create or replace function public.voice_forwarding_usage_summary(p_account_id uuid)
returns table(minutes bigint,unresolved_calls bigint,included_minutes integer,period_start timestamptz,period_end timestamptz)
language sql stable security invoker set search_path = pg_catalog, public as $$
  select coalesce(sum(ceil(u.seconds/60.0)),0)::bigint,
    count(u.provider_call_id) filter(where u.seconds is null),
    coalesce((e.feature_limits->>'forwarding_minutes')::integer,0),e.period_start,e.period_end
    from public.workspace_entitlements e left join public.voice_forwarding_usage u
      on u.account_id=e.account_id and u.observed_at>=e.period_start and u.observed_at<e.period_end
    where e.account_id=p_account_id group by e.feature_limits,e.period_start,e.period_end
$$;
revoke all on function public.voice_forwarding_usage_summary(uuid) from public,anon,authenticated;
grant execute on function public.voice_forwarding_usage_summary(uuid) to service_role;

alter table public.voice_call_admissions add column if not exists tool_invocations integer not null default 0;
create or replace function public.authorize_voice_tool_invocation(p_account_id uuid,p_call_id text,p_caller text)
returns boolean language plpgsql security invoker set search_path = pg_catalog, public as $$
begin
  update public.voice_call_admissions set tool_invocations=tool_invocations+1
    where account_id=p_account_id and provider='signalwire' and provider_call_id=p_call_id
      and caller_number is not distinct from p_caller and admission_state='admitted'
      and provider_terminal_at is null and admitted_at > now()-interval '60 minutes' and tool_invocations < 100;
  return found;
end $$;

revoke all on function public.apply_voice_recording_observation(text,text,text,integer,bigint,text,text),
 public.project_early_voice_recording(),public.queue_deleted_voice_recording(),
 public.record_voice_forwarding_usage(uuid,text,text,text,integer,timestamptz),
 public.authorize_voice_tool_invocation(uuid,text,text) from public,anon,authenticated;
grant execute on function public.apply_voice_recording_observation(text,text,text,integer,bigint,text,text),
 public.project_early_voice_recording(),public.queue_deleted_voice_recording(),
 public.record_voice_forwarding_usage(uuid,text,text,text,integer,timestamptz),
 public.authorize_voice_tool_invocation(uuid,text,text) to service_role;
create or replace function public.queue_expired_voice_recording_observations() returns void
language plpgsql security invoker set search_path = pg_catalog, public as $$
begin
  with removed as (
    delete from public.voice_recording_observations r where created_at < now()-interval '90 days'
      and not exists(select 1 from public.voice_calls c where c.provider_call_id=r.provider_call_id)
      returning storage_path
  ) insert into public.voice_recording_deletions(storage_path)
    select storage_path from removed where storage_path is not null on conflict do nothing;
end $$;
revoke all on function public.queue_expired_voice_recording_observations() from public,anon,authenticated;
grant execute on function public.queue_expired_voice_recording_observations() to service_role;
-- Appointment changes remain requests until office staff verify ownership.
create or replace function public.append_voice_appointment_request(p_account_id uuid,p_lead_id uuid,p_call_id text,p_request text)
returns boolean language plpgsql security invoker set search_path = pg_catalog, public as $$
begin
  if length(p_request)>2000 or p_request is null then raise exception 'Invalid appointment request'; end if;
  update public.leads set message=case when strpos(coalesce(message,''),p_request)>0 then message
    else concat_ws(E'\n',nullif(message,''),p_request) end
    where id=p_lead_id and account_id=p_account_id and source_voice_provider_call_id=p_call_id;
  return found;
end $$;
revoke all on function public.append_voice_appointment_request(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.append_voice_appointment_request(uuid,uuid,text,text) to service_role;


-- Source: 20260905153351_sms_lead_delivery_history.sql
-- The marker and lead append commit together. It survives later triage edits
-- and makes retries after ingress has already committed safe.
alter table public.sms_events
  add column if not exists lead_delivery_history_recorded_at timestamptz;

create or replace function public.record_sms_lead_delivery_history(p_sms_event_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $$
declare
  v_event public.sms_events%rowtype;
  v_lead_id uuid;
  v_entry jsonb;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  select e.* into v_event from public.sms_events e
   where e.id = p_sms_event_id for update;
  if not found or v_event.lead_delivery_history_recorded_at is not null
     or v_event.status not in ('delivered', 'failed') then
    return false;
  end if;

  select l.id into v_lead_id from public.leads l
   where l.account_id = v_event.account_id
     and public.sms_normalize_recipient_phone(l.phone) = v_event.phone_number
   order by l.created_at desc, l.id desc
   limit 1;
  if v_lead_id is null then return false; end if;

  v_entry := pg_catalog.jsonb_build_object(
    'at', v_now,
    'label', case when v_event.status = 'delivered' then 'SMS Delivered' else 'SMS Delivery Failed' end,
    'note', case when v_event.status = 'delivered'
      then 'Delivered to ' || v_event.phone_number || '.'
      else 'Delivery to ' || v_event.phone_number || ' failed ('
        || coalesce(nullif(v_event.error_reason, ''), 'undelivered') || ').' end
  );
  -- UPDATE locks the lead and evaluates this expression against its latest row.
  -- Preserve all unrelated triage keys and any notes committed while waiting.
  update public.leads l
     set triage = pg_catalog.jsonb_set(
       case when pg_catalog.jsonb_typeof(l.triage) = 'object' then l.triage else '{}'::jsonb end,
       '{contactLog}',
       (case when pg_catalog.jsonb_typeof(l.triage->'contactLog') = 'array'
         then l.triage->'contactLog' else '[]'::jsonb end) || pg_catalog.jsonb_build_array(v_entry)
     ), updated_at = v_now
   where l.id = v_lead_id and l.account_id = v_event.account_id;
  if not found then return false; end if;

  update public.sms_events set lead_delivery_history_recorded_at = v_now
   where id = v_event.id;
  return true;
end;
$$;

revoke all on function public.record_sms_lead_delivery_history(uuid) from public, anon, authenticated;
grant execute on function public.record_sms_lead_delivery_history(uuid) to service_role;


-- Source: 20260905160000_referrals_performance_indexes.sql
-- Referrals Performance Indexes
--
-- WHY: The referrals dashboard (/dashboard/marketing/referrals) scans leads
-- and extra_stop_requests looking for referredBy keys in the triage/intake jsonb
-- blobs. Without indexes, every page visit performs a full table scan of leads.
--
-- ADDITIVE, IDEMPOTENT, AND CONCURRENTLY-FRIENDLY:
-- Uses CREATE INDEX IF NOT EXISTS with partial filters matching the query predicates.

-- Fast index for finding referred leads per account
create index if not exists idx_leads_referral_triage
  on leads (account_id, (triage->>'referredBy'))
  where (triage->>'referredBy') is not null and deleted_at is null;

-- Index for settlement state queries and joins
create index if not exists idx_leads_referral_settled
  on leads (account_id, referral_settled_at);

-- Fast index for finding referred Quick Stops per account
create index if not exists idx_extra_stops_referral_intake
  on extra_stop_requests (account_id, (intake->>'referredBy'))
  where (intake->>'referredBy') is not null;

-- Index for settlement state on Quick Stops
create index if not exists idx_extra_stops_referral_settled
  on extra_stop_requests (account_id, referral_settled_at);


-- Source: 20260905161546_release_schema_permissions.sql

-- Remove inherited table privileges that are not guarded by row policies.
revoke all on public.inventory_tool_custody_log,
  public.inventory_van_kit_templates, public.marketing_tracking_links,
  public.insurance_claims from public, anon, authenticated;
grant select, insert on public.inventory_tool_custody_log to authenticated;
grant select, insert, update, delete on public.inventory_van_kit_templates,
  public.marketing_tracking_links, public.insurance_claims to authenticated;
grant all on public.inventory_tool_custody_log,
  public.inventory_van_kit_templates, public.marketing_tracking_links,
  public.insurance_claims to service_role;

revoke all on function public.enforce_inventory_maintenance_immutable()
  from public, anon, authenticated;

-- The membership compatibility view must obey memberships RLS for its caller.
create or replace view public.account_memberships with (security_invoker = true) as
  select id, account_id, user_id, role, created_at, deactivated_at,
    (deactivated_at is null) as active
  from public.memberships;
revoke all on public.account_memberships from public, anon, authenticated;
grant select on public.account_memberships to authenticated, service_role;

notify pgrst, 'reload schema';

commit;;
