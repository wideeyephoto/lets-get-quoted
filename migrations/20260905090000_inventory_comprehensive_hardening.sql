-- Migration: 20260905090000_inventory_comprehensive_hardening.sql
-- Description: Comprehensive hardening for inventory: image storage column, soft deletion support,
-- tool custody audit log, van kit templates, maintenance immutability enforcement, and granular office permissions.

begin;

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

commit;
