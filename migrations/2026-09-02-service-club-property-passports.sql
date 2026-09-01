-- ============================================================================
-- Service-Club Memberships (Club Tiers & Member Benefits) and Durable Property Passports
-- ============================================================================

-- 1. Membership Tiers
create table if not exists membership_tiers (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  name text not null,
  tier_level integer not null default 1 check (tier_level between 1 and 4),
  badge_color text not null default '#38bdf8',
  description text not null default '',
  monthly_price numeric(10,2) not null default 0.00 check (monthly_price >= 0),
  annual_price numeric(10,2) not null default 0.00 check (annual_price >= 0),
  trade_category text not null default 'general',
  benefits jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists membership_tiers_account_idx on membership_tiers (account_id, is_active, tier_level);

alter table membership_tiers enable row level security;
drop policy if exists membership_tiers_owner on membership_tiers;
create policy membership_tiers_owner on membership_tiers
  for all using (is_owner(account_id)) with check (is_owner(account_id));

-- Add membership columns to recurring_plans
alter table recurring_plans
  add column if not exists membership_tier_id uuid references membership_tiers(id) on delete set null,
  add column if not exists membership_tier_name text,
  add column if not exists tier_level integer check (tier_level is null or tier_level between 1 and 4),
  add column if not exists tier_benefits jsonb,
  add column if not exists member_number text;

create index if not exists recurring_plans_membership_idx on recurring_plans (account_id, membership_tier_id)
  where membership_tier_id is not null;

-- 2. Durable Property Passports
create table if not exists property_passports (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  client_id uuid references clients(id) on delete set null,
  passport_code text not null unique,
  address text not null,
  unit_number text,
  city text,
  state text,
  postal_code text,
  country text not null default 'USA',
  property_type text not null default 'single_family',
  year_built integer,
  square_feet integer,
  stories integer,
  heating_type text,
  cooling_type text,
  water_heater_type text,
  electrical_panel_amps integer,
  roof_type text,
  access_notes text,
  homeowner_name text not null,
  homeowner_phone text,
  homeowner_email text,
  homeowner_since date not null default current_date,
  ownership_history jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists property_passports_account_idx on property_passports (account_id, address);
create index if not exists property_passports_client_idx on property_passports (account_id, client_id);
create index if not exists property_passports_code_idx on property_passports (passport_code);

alter table property_passports enable row level security;
drop policy if exists property_passports_owner on property_passports;
create policy property_passports_owner on property_passports
  for all using (is_owner(account_id)) with check (is_owner(account_id));

-- 3. Equipment Passports (Installed Assets Registry)
create table if not exists equipment_passports (
  id uuid primary key default gen_random_uuid(),
  passport_id uuid not null references property_passports(id) on delete cascade,
  account_id uuid not null references accounts(id) on delete cascade,
  job_id uuid references jobs(id) on delete set null,
  warranty_id uuid references warranties(id) on delete set null,
  category text not null default 'other',
  name text not null,
  brand text not null default '',
  model_number text,
  serial_number text,
  location text,
  installed_on date not null default current_date,
  expected_lifespan_years integer not null default 15,
  condition text not null default 'good',
  specs jsonb not null default '{}'::jsonb,
  maintenance_interval_months integer,
  last_serviced_on date,
  next_service_due date,
  manual_url text,
  photos text[] not null default '{}',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists equipment_passports_passport_idx on equipment_passports (passport_id);
create index if not exists equipment_passports_account_idx on equipment_passports (account_id, category);

alter table equipment_passports enable row level security;
drop policy if exists equipment_passports_owner on equipment_passports;
create policy equipment_passports_owner on equipment_passports
  for all using (is_owner(account_id)) with check (is_owner(account_id));

-- 4. Property Passport Maintenance Ledger
create table if not exists property_passport_ledger (
  id uuid primary key default gen_random_uuid(),
  passport_id uuid not null references property_passports(id) on delete cascade,
  account_id uuid not null references accounts(id) on delete cascade,
  job_id uuid references jobs(id) on delete set null,
  equipment_id uuid references equipment_passports(id) on delete set null,
  type text not null default 'tuneup',
  date date not null default current_date,
  title text not null,
  summary text not null default '',
  performed_by text not null default 'Technician',
  cost numeric(10,2),
  invoice_ref text,
  document_urls jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists property_passport_ledger_idx on property_passport_ledger (passport_id, date desc);

alter table property_passport_ledger enable row level security;
drop policy if exists property_passport_ledger_owner on property_passport_ledger;
create policy property_passport_ledger_owner on property_passport_ledger
  for all using (is_owner(account_id)) with check (is_owner(account_id));
