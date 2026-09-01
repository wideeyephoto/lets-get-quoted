-- Migration: 20260901040000_multi_location_inventory.sql
-- Description: Multi-location inventory, fleet equipment tracking, van stock replenishment, and maintenance records

-- 1. Inventory Locations
CREATE TABLE IF NOT EXISTS public.inventory_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'warehouse', -- 'warehouse', 'vehicle', 'job_site', 'cage'
  code TEXT,
  address TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inventory_locations_account ON public.inventory_locations(account_id);

ALTER TABLE public.inventory_locations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "office_users_read_inventory_locations" ON public.inventory_locations;
CREATE POLICY "office_users_read_inventory_locations"
  ON public.inventory_locations
  FOR SELECT
  TO authenticated
  USING (
    public.office_can(account_id, 'jobs.read')
  );

DROP POLICY IF EXISTS "office_users_write_inventory_locations" ON public.inventory_locations;
CREATE POLICY "office_users_write_inventory_locations"
  ON public.inventory_locations
  FOR ALL
  TO authenticated
  USING (
    public.office_can(account_id, 'jobs.write')
  )
  WITH CHECK (
    public.office_can(account_id, 'jobs.write')
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_locations TO authenticated;

-- 2. Tools & Equipment Custody
CREATE TABLE IF NOT EXISTS public.inventory_tools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  location_id UUID REFERENCES public.inventory_locations(id) ON DELETE SET NULL,
  location_name TEXT,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  brand TEXT NOT NULL,
  model_number TEXT,
  serial_number TEXT,
  asset_tag TEXT NOT NULL,
  purchase_price NUMERIC(10, 2),
  purchase_date DATE,
  status TEXT NOT NULL DEFAULT 'available', -- 'available', 'checked_out', 'in_maintenance', 'lost_damaged'
  assigned_crew_id UUID REFERENCES public.crew(id) ON DELETE SET NULL,
  assigned_crew_name TEXT,
  assigned_job_id UUID REFERENCES public.jobs(id) ON DELETE SET NULL,
  assigned_job_label TEXT,
  checked_out_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inventory_tools_account ON public.inventory_tools(account_id);
CREATE INDEX IF NOT EXISTS idx_inventory_tools_status ON public.inventory_tools(account_id, status);
CREATE INDEX IF NOT EXISTS idx_inventory_tools_location ON public.inventory_tools(account_id, location_id);

ALTER TABLE public.inventory_tools ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "office_users_read_inventory_tools" ON public.inventory_tools;
CREATE POLICY "office_users_read_inventory_tools"
  ON public.inventory_tools
  FOR SELECT
  TO authenticated
  USING (
    public.office_can(account_id, 'jobs.read')
  );

DROP POLICY IF EXISTS "office_users_write_inventory_tools" ON public.inventory_tools;
CREATE POLICY "office_users_write_inventory_tools"
  ON public.inventory_tools
  FOR ALL
  TO authenticated
  USING (
    public.office_can(account_id, 'jobs.write')
  )
  WITH CHECK (
    public.office_can(account_id, 'jobs.write')
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_tools TO authenticated;

-- 3. Fleet Vehicles & Maintenance Schedules
CREATE TABLE IF NOT EXISTS public.inventory_vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  make TEXT NOT NULL,
  model TEXT NOT NULL,
  year INTEGER NOT NULL,
  license_plate TEXT NOT NULL,
  vin TEXT,
  current_mileage INTEGER NOT NULL DEFAULT 0,
  primary_driver_id UUID REFERENCES public.crew(id) ON DELETE SET NULL,
  primary_driver_name TEXT,
  status TEXT NOT NULL DEFAULT 'active', -- 'active', 'in_shop', 'retired'
  last_service_date DATE,
  last_service_mileage INTEGER,
  next_service_due_mileage INTEGER,
  inspection_expires_at DATE,
  insurance_expires_at DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inventory_vehicles_account ON public.inventory_vehicles(account_id);
CREATE INDEX IF NOT EXISTS idx_inventory_vehicles_status ON public.inventory_vehicles(account_id, status);

ALTER TABLE public.inventory_vehicles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "office_users_read_inventory_vehicles" ON public.inventory_vehicles;
CREATE POLICY "office_users_read_inventory_vehicles"
  ON public.inventory_vehicles
  FOR SELECT
  TO authenticated
  USING (
    public.office_can(account_id, 'jobs.read')
  );

DROP POLICY IF EXISTS "office_users_write_inventory_vehicles" ON public.inventory_vehicles;
CREATE POLICY "office_users_write_inventory_vehicles"
  ON public.inventory_vehicles
  FOR ALL
  TO authenticated
  USING (
    public.office_can(account_id, 'jobs.write')
  )
  WITH CHECK (
    public.office_can(account_id, 'jobs.write')
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_vehicles TO authenticated;

-- 4. Multi-Location Stock Items & Materials
CREATE TABLE IF NOT EXISTS public.inventory_stock_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  location_id UUID REFERENCES public.inventory_locations(id) ON DELETE SET NULL,
  location_name TEXT NOT NULL DEFAULT 'Main Shop',
  name TEXT NOT NULL,
  sku TEXT NOT NULL,
  category TEXT NOT NULL,
  quantity_on_hand NUMERIC(10, 2) NOT NULL DEFAULT 0,
  min_threshold NUMERIC(10, 2) NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT 'ea',
  unit_cost NUMERIC(10, 2) NOT NULL DEFAULT 0,
  preferred_supplier TEXT,
  reorder_qty NUMERIC(10, 2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inventory_stock_account ON public.inventory_stock_items(account_id);
CREATE INDEX IF NOT EXISTS idx_inventory_stock_location ON public.inventory_stock_items(account_id, location_id);
CREATE INDEX IF NOT EXISTS idx_inventory_stock_sku ON public.inventory_stock_items(account_id, sku);

ALTER TABLE public.inventory_stock_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "office_users_read_inventory_stock_items" ON public.inventory_stock_items;
CREATE POLICY "office_users_read_inventory_stock_items"
  ON public.inventory_stock_items
  FOR SELECT
  TO authenticated
  USING (
    public.office_can(account_id, 'jobs.read')
  );

DROP POLICY IF EXISTS "office_users_write_inventory_stock_items" ON public.inventory_stock_items;
CREATE POLICY "office_users_write_inventory_stock_items"
  ON public.inventory_stock_items
  FOR ALL
  TO authenticated
  USING (
    public.office_can(account_id, 'jobs.write')
  )
  WITH CHECK (
    public.office_can(account_id, 'jobs.write')
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_stock_items TO authenticated;

-- 5. Stock Transfers Between Locations
CREATE TABLE IF NOT EXISTS public.inventory_stock_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  item_id UUID REFERENCES public.inventory_stock_items(id) ON DELETE CASCADE,
  item_name TEXT NOT NULL,
  from_location TEXT NOT NULL,
  to_location TEXT NOT NULL,
  quantity NUMERIC(10, 2) NOT NULL,
  performed_by TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inventory_stock_transfers_account ON public.inventory_stock_transfers(account_id);
CREATE INDEX IF NOT EXISTS idx_inventory_stock_transfers_item ON public.inventory_stock_transfers(item_id);

ALTER TABLE public.inventory_stock_transfers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "office_users_read_inventory_stock_transfers" ON public.inventory_stock_transfers;
CREATE POLICY "office_users_read_inventory_stock_transfers"
  ON public.inventory_stock_transfers
  FOR SELECT
  TO authenticated
  USING (
    public.office_can(account_id, 'jobs.read')
  );

DROP POLICY IF EXISTS "office_users_write_inventory_stock_transfers" ON public.inventory_stock_transfers;
CREATE POLICY "office_users_write_inventory_stock_transfers"
  ON public.inventory_stock_transfers
  FOR ALL
  TO authenticated
  USING (
    public.office_can(account_id, 'jobs.write')
  )
  WITH CHECK (
    public.office_can(account_id, 'jobs.write')
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_stock_transfers TO authenticated;

-- 6. Maintenance & Service Records
CREATE TABLE IF NOT EXISTS public.inventory_maintenance_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  asset_type TEXT NOT NULL, -- 'tool', 'vehicle'
  asset_id TEXT NOT NULL,
  asset_name TEXT NOT NULL,
  service_type TEXT NOT NULL,
  cost NUMERIC(10, 2) NOT NULL DEFAULT 0,
  performed_by TEXT NOT NULL,
  performed_at DATE NOT NULL,
  next_due_at DATE,
  mileage_at_service INTEGER,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inventory_maint_account ON public.inventory_maintenance_records(account_id);
CREATE INDEX IF NOT EXISTS idx_inventory_maint_asset ON public.inventory_maintenance_records(account_id, asset_id);

ALTER TABLE public.inventory_maintenance_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "office_users_read_inventory_maintenance_records" ON public.inventory_maintenance_records;
CREATE POLICY "office_users_read_inventory_maintenance_records"
  ON public.inventory_maintenance_records
  FOR SELECT
  TO authenticated
  USING (
    public.office_can(account_id, 'jobs.read')
  );

DROP POLICY IF EXISTS "office_users_write_inventory_maintenance_records" ON public.inventory_maintenance_records;
CREATE POLICY "office_users_write_inventory_maintenance_records"
  ON public.inventory_maintenance_records
  FOR ALL
  TO authenticated
  USING (
    public.office_can(account_id, 'jobs.write')
  )
  WITH CHECK (
    public.office_can(account_id, 'jobs.write')
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_maintenance_records TO authenticated;
