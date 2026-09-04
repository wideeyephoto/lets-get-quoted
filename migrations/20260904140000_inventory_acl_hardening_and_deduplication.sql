-- Migration: 20260904140000_inventory_acl_hardening_and_deduplication.sql
-- Description: Revoke anon and public privileges on multi-location inventory tables,
-- deduplicate accidentally seeded duplicate records across all inventory tables,
-- establish unique indexes, and add dedicated vehicle/tool purchase price and tax basis columns.

begin;

-- ============================================================================
-- 1. Add dedicated columns for vehicle and tool purchase price & depreciation
-- ============================================================================

alter table public.inventory_vehicles
  add column if not exists purchase_price numeric(10, 2),
  add column if not exists purchase_date date,
  add column if not exists depreciation_schedule text;

alter table public.inventory_tools
  add column if not exists depreciation_schedule text;

-- Backfill vehicle purchase price and tax metadata if present in notes HTML comments
update public.inventory_vehicles
set
  purchase_price = coalesce(
    purchase_price,
    case
      when notes ~ '<!--TAX_META:\{.*"purchasePrice":([0-9.]+).*\}-->'
      then (substring(notes from '<!--TAX_META:\{.*"purchasePrice":([0-9.]+).*\}-->'))::numeric(10,2)
      else null
    end
  ),
  purchase_date = coalesce(
    purchase_date,
    case
      when notes ~ '<!--TAX_META:\{.*"purchaseDate":"([^"]+)".*\}-->'
      then (substring(notes from '<!--TAX_META:\{.*"purchaseDate":"([^"]+)".*\}-->'))::date
      else null
    end
  ),
  depreciation_schedule = coalesce(
    depreciation_schedule,
    case
      when notes ~ '<!--TAX_META:\{.*"depreciationSchedule":"([^"]+)".*\}-->'
      then substring(notes from '<!--TAX_META:\{.*"depreciationSchedule":"([^"]+)".*\}-->')
      else null
    end
  );

update public.inventory_vehicles
set notes = trim(regexp_replace(notes, '<!--TAX_META:.*?-->', '', 'g'))
where notes ~ '<!--TAX_META:.*?-->';

-- ============================================================================
-- 2. Deduplicate all 5 inventory tables and re-point dependent records
-- ============================================================================

-- 2A. Locations: re-point tools & stock items, then delete duplicates
with loc_keepers as (
  select id,
         first_value(id) over (
           partition by account_id, lower(trim(name))
           order by created_at desc, id desc
         ) as keeper_id
  from public.inventory_locations
)
update public.inventory_tools t
set location_id = k.keeper_id
from loc_keepers k
where t.location_id = k.id and k.id <> k.keeper_id;

with loc_keepers as (
  select id,
         first_value(id) over (
           partition by account_id, lower(trim(name))
           order by created_at desc, id desc
         ) as keeper_id
  from public.inventory_locations
)
update public.inventory_stock_items s
set location_id = k.keeper_id
from loc_keepers k
where s.location_id = k.id and k.id <> k.keeper_id;

delete from public.inventory_locations a
using public.inventory_locations b
where a.account_id = b.account_id
  and lower(trim(a.name)) = lower(trim(b.name))
  and (a.created_at < b.created_at or (a.created_at = b.created_at and a.id < b.id));

create unique index if not exists idx_inventory_locations_account_name
  on public.inventory_locations(account_id, lower(trim(name)));

-- 2B. Vehicles: re-point maintenance records, then delete duplicates
with veh_keepers as (
  select id,
         first_value(id) over (
           partition by account_id, lower(trim(license_plate))
           order by created_at desc, id desc
         ) as keeper_id
  from public.inventory_vehicles
)
update public.inventory_maintenance_records m
set asset_id = k.keeper_id::text
from veh_keepers k
where m.asset_type = 'vehicle' and m.asset_id = k.id::text and k.id <> k.keeper_id;

delete from public.inventory_vehicles a
using public.inventory_vehicles b
where a.account_id = b.account_id
  and lower(trim(a.license_plate)) = lower(trim(b.license_plate))
  and (a.created_at < b.created_at or (a.created_at = b.created_at and a.id < b.id));

create unique index if not exists idx_inventory_vehicles_account_plate
  on public.inventory_vehicles(account_id, lower(trim(license_plate)));

-- 2C. Tools: re-point maintenance records, then delete duplicates
with tool_keepers as (
  select id,
         first_value(id) over (
           partition by account_id, lower(trim(asset_tag))
           order by created_at desc, id desc
         ) as keeper_id
  from public.inventory_tools
)
update public.inventory_maintenance_records m
set asset_id = k.keeper_id::text
from tool_keepers k
where m.asset_type = 'tool' and m.asset_id = k.id::text and k.id <> k.keeper_id;

delete from public.inventory_tools a
using public.inventory_tools b
where a.account_id = b.account_id
  and lower(trim(a.asset_tag)) = lower(trim(b.asset_tag))
  and (a.created_at < b.created_at or (a.created_at = b.created_at and a.id < b.id));

create unique index if not exists idx_inventory_tools_account_asset_tag
  on public.inventory_tools(account_id, lower(trim(asset_tag)));

-- 2D. Stock Items: re-point transfers, then delete duplicates
with stock_keepers as (
  select id,
         first_value(id) over (
           partition by account_id, lower(trim(sku)), lower(trim(coalesce(location_name, '')))
           order by created_at desc, id desc
         ) as keeper_id
  from public.inventory_stock_items
)
update public.inventory_stock_transfers t
set item_id = k.keeper_id
from stock_keepers k
where t.item_id = k.id and k.id <> k.keeper_id;

delete from public.inventory_stock_items a
using public.inventory_stock_items b
where a.account_id = b.account_id
  and lower(trim(a.sku)) = lower(trim(b.sku))
  and lower(trim(coalesce(a.location_name, ''))) = lower(trim(coalesce(b.location_name, '')))
  and (a.created_at < b.created_at or (a.created_at = b.created_at and a.id < b.id));

create unique index if not exists idx_inventory_stock_account_sku_loc
  on public.inventory_stock_items(account_id, lower(trim(sku)), lower(trim(coalesce(location_name, ''))));

-- 2E. Maintenance Records: delete duplicates
delete from public.inventory_maintenance_records a
using public.inventory_maintenance_records b
where a.account_id = b.account_id
  and a.asset_type = b.asset_type
  and lower(trim(a.asset_name)) = lower(trim(b.asset_name))
  and lower(trim(a.service_type)) = lower(trim(b.service_type))
  and a.performed_at = b.performed_at
  and coalesce(a.cost, 0) = coalesce(b.cost, 0)
  and (a.created_at < b.created_at or (a.created_at = b.created_at and a.id < b.id));

create unique index if not exists idx_inventory_maint_record_dedup
  on public.inventory_maintenance_records(account_id, asset_type, lower(trim(asset_name)), lower(trim(service_type)), performed_at);

-- ============================================================================
-- 3. Revoke all privileges on inventory tables from anon and public
-- ============================================================================

revoke all on table public.inventory_locations from anon, public;
revoke all on table public.inventory_tools from anon, public;
revoke all on table public.inventory_vehicles from anon, public;
revoke all on table public.inventory_stock_items from anon, public;
revoke all on table public.inventory_stock_transfers from anon, public;
revoke all on table public.inventory_maintenance_records from anon, public;

-- Explicitly ensure authenticated has appropriate permissions under RLS
grant select, insert, update, delete on table public.inventory_locations to authenticated;
grant select, insert, update, delete on table public.inventory_tools to authenticated;
grant select, insert, update, delete on table public.inventory_vehicles to authenticated;
grant select, insert, update, delete on table public.inventory_stock_items to authenticated;
grant select, insert, update, delete on table public.inventory_stock_transfers to authenticated;
grant select, insert, update, delete on table public.inventory_maintenance_records to authenticated;

-- Ensure service_role maintains all privileges
grant all on table public.inventory_locations to service_role;
grant all on table public.inventory_tools to service_role;
grant all on table public.inventory_vehicles to service_role;
grant all on table public.inventory_stock_items to service_role;
grant all on table public.inventory_stock_transfers to service_role;
grant all on table public.inventory_maintenance_records to service_role;

-- ============================================================================
-- 4. Verification post-condition
-- ============================================================================

do $$
declare
  v_bad text;
begin
  select pg_catalog.string_agg(distinct (g.relname || ':' || g.grantee_name || ':' || g.privilege_type), ', ') into v_bad
  from (
    select c.relname, grantee.rolname as grantee_name, privs.privilege_type
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    cross join lateral pg_catalog.aclexplode(coalesce(c.relacl, acldefault(case when c.relkind = 'r' then 'r' else 'v' end::"char", c.relowner))) as privs
    join pg_catalog.pg_roles grantee on grantee.oid = privs.grantee
    where n.nspname = 'public'
      and c.relname in (
        'inventory_locations',
        'inventory_tools',
        'inventory_vehicles',
        'inventory_stock_items',
        'inventory_stock_transfers',
        'inventory_maintenance_records'
      )
      and grantee.rolname in ('anon', 'public')
  ) g;

  if v_bad is not null then
    raise exception 'Inventory table(s) still hold anon/public grants: %', v_bad;
  end if;
end $$;

commit;
