-- Migration: 20260826150000_permit_intel_foundation.sql
-- Permit Intelligence Foundation: Reference Schemas, Royal Oak / Michigan Fixtures, Job Permit Cases & RLS

begin;

-- 1. Shared Reference Tables

-- 1a. Permit Authorities
create table if not exists public.permit_authorities (
  id text primary key,
  name text not null,
  agency_name text not null,
  state text not null,
  county text not null,
  city_or_township text,
  portal_url text,
  phone text,
  office_hours text,
  provider_type text not null default 'generic' check (provider_type in ('bsa_accessmygov', 'accela', 'opengov', 'municipality_native', 'generic')),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

-- 1b. Authority Coverage by Discipline
create table if not exists public.permit_authority_coverage (
  id uuid primary key default gen_random_uuid(),
  authority_id text not null references public.permit_authorities(id) on delete cascade,
  discipline text not null check (discipline in ('building', 'electrical', 'mechanical', 'plumbing')),
  enforcing_agency text not null,
  level text not null check (level in ('municipality', 'township', 'county', 'state')),
  effective_from date not null default '2020-01-01',
  effective_to date,
  source_url text,
  created_at timestamptz not null default pg_catalog.now()
);

create index if not exists idx_permit_authority_coverage_auth_disc
  on public.permit_authority_coverage (authority_id, discipline);

-- 1c. Permit Sources & Licensing Metadata
create table if not exists public.permit_sources (
  id text primary key,
  publisher text not null,
  url text not null,
  retrieval_date date not null default current_date,
  content_hash text,
  licensing_class text not null default 'advisory_summary',
  created_at timestamptz not null default pg_catalog.now()
);

-- 1d. Code Adoptions
create table if not exists public.permit_code_adoptions (
  id uuid primary key default gen_random_uuid(),
  authority_id text not null references public.permit_authorities(id) on delete cascade,
  code_family text not null,
  edition_year text not null,
  effective_from date not null default '2016-02-08',
  effective_to date,
  governing_body text not null,
  is_current boolean not null default true,
  created_at timestamptz not null default pg_catalog.now()
);

-- 1e. Code Amendments & References
create table if not exists public.permit_code_amendments (
  id uuid primary key default gen_random_uuid(),
  adoption_id uuid references public.permit_code_adoptions(id) on delete cascade,
  authority_id text references public.permit_authorities(id) on delete cascade,
  section_ref text not null,
  title text not null,
  summary text not null,
  amendment_type text not null default 'standard_model' check (amendment_type in ('standard_model', 'state_amendment', 'local_ordinance')),
  citation_url text,
  created_at timestamptz not null default pg_catalog.now()
);

-- 1f. Deterministic Requirement Rules
create table if not exists public.permit_requirement_rules (
  id uuid primary key default gen_random_uuid(),
  authority_id text references public.permit_authorities(id) on delete cascade,
  trade text not null,
  scope text not null,
  decision text not null check (decision in ('required', 'not_required', 'verify')),
  base_fee numeric(10,2),
  effective_from date not null default '2020-01-01',
  effective_to date,
  created_at timestamptz not null default pg_catalog.now()
);

-- 2. Tenant Job Permit Cases Table
create table if not exists public.job_permit_cases (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  authority_id text references public.permit_authorities(id) on delete set null,
  requirement_verdict text not null default 'verify' check (requirement_verdict in ('required', 'not_required', 'verify')),
  application_status text not null default 'not_started' check (
    application_status in (
      'not_started', 'draft', 'ready_for_review', 'authorized', 'submitting',
      'submitted', 'in_review', 'corrections_required', 'approved', 'issued',
      'rejected', 'withdrawn', 'inspection_scheduled', 'inspection_passed',
      'inspection_failed', 'closed'
    )
  ),
  external_permit_number text,
  estimated_fee numeric(10,2),
  actual_fee numeric(10,2),
  notes text,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint job_permit_cases_account_job_unique unique (account_id, job_id)
);

create index if not exists idx_job_permit_cases_account_job
  on public.job_permit_cases (account_id, job_id);

-- 3. Row Level Security & Explicit Data API Grants

alter table public.permit_authorities enable row level security;
alter table public.permit_authority_coverage enable row level security;
alter table public.permit_sources enable row level security;
alter table public.permit_code_adoptions enable row level security;
alter table public.permit_code_amendments enable row level security;
alter table public.permit_requirement_rules enable row level security;
alter table public.job_permit_cases enable row level security;

-- Global reference tables: read-only for authenticated
drop policy if exists permit_authorities_select on public.permit_authorities;
create policy permit_authorities_select on public.permit_authorities
  for select to authenticated using (true);

drop policy if exists permit_authority_coverage_select on public.permit_authority_coverage;
create policy permit_authority_coverage_select on public.permit_authority_coverage
  for select to authenticated using (true);

drop policy if exists permit_sources_select on public.permit_sources;
create policy permit_sources_select on public.permit_sources
  for select to authenticated using (true);

drop policy if exists permit_code_adoptions_select on public.permit_code_adoptions;
create policy permit_code_adoptions_select on public.permit_code_adoptions
  for select to authenticated using (true);

drop policy if exists permit_code_amendments_select on public.permit_code_amendments;
create policy permit_code_amendments_select on public.permit_code_amendments
  for select to authenticated using (true);

drop policy if exists permit_requirement_rules_select on public.permit_requirement_rules;
create policy permit_requirement_rules_select on public.permit_requirement_rules
  for select to authenticated using (true);

grant select on public.permit_authorities to authenticated;
grant select on public.permit_authority_coverage to authenticated;
grant select on public.permit_sources to authenticated;
grant select on public.permit_code_adoptions to authenticated;
grant select on public.permit_code_amendments to authenticated;
grant select on public.permit_requirement_rules to authenticated;

-- Tenant job permit cases: isolated by account_id and office permissions
drop policy if exists job_permit_cases_select on public.job_permit_cases;
create policy job_permit_cases_select on public.job_permit_cases
  for select to authenticated using (public.office_can(account_id, 'jobs.read'));

drop policy if exists job_permit_cases_insert on public.job_permit_cases;
create policy job_permit_cases_insert on public.job_permit_cases
  for insert to authenticated with check (public.office_can(account_id, 'jobs.write'));

drop policy if exists job_permit_cases_update on public.job_permit_cases;
create policy job_permit_cases_update on public.job_permit_cases
  for update to authenticated
  using (public.office_can(account_id, 'jobs.write'))
  with check (public.office_can(account_id, 'jobs.write'));

drop policy if exists job_permit_cases_delete on public.job_permit_cases;
create policy job_permit_cases_delete on public.job_permit_cases
  for delete to authenticated using (public.office_can(account_id, 'jobs.write'));

grant select, insert, update, delete on public.job_permit_cases to authenticated;

-- 4. Seed Data: Michigan Baseline & City of Royal Oak Pilot

insert into public.permit_authorities (
  id, name, agency_name, state, county, city_or_township, portal_url, phone, office_hours, provider_type
) values
  (
    'mi-royal-oak',
    'City of Royal Oak',
    'Building Inspection Division',
    'MI',
    'Oakland',
    'Royal Oak',
    'https://www.accessmygov.com/?uid=1349',
    '248-246-3210',
    'Monday – Friday, 8:00 AM – 4:30 PM',
    'bsa_accessmygov'
  ),
  (
    'mi-detroit',
    'City of Detroit',
    'Buildings, Safety Engineering, and Environmental Dept (BSEED)',
    'MI',
    'Wayne',
    'Detroit',
    'https://detroitmi.gov/departments/buildings-safety-engineering-and-environmental-department',
    '313-224-2733',
    'Monday – Friday, 8:30 AM – 4:30 PM',
    'municipality_native'
  ),
  (
    'mi-grand-rapids',
    'City of Grand Rapids',
    'Development Center - Building Inspections',
    'MI',
    'Kent',
    'Grand Rapids',
    'https://www.citizenaccess.grandrapidsmi.gov',
    '616-456-4100',
    'Monday – Friday, 8:00 AM – 5:00 PM',
    'accela'
  ),
  (
    'mi-ann-arbor',
    'City of Ann Arbor',
    'Planning & Development Services - Building Division',
    'MI',
    'Washtenaw',
    'Ann Arbor',
    'https://stream.a2gov.org',
    '734-794-6263',
    'Monday – Friday, 7:30 AM – 4:00 PM',
    'opengov'
  )
on conflict (id) do update set
  name = excluded.name,
  agency_name = excluded.agency_name,
  portal_url = excluded.portal_url,
  phone = excluded.phone,
  office_hours = excluded.office_hours,
  provider_type = excluded.provider_type,
  updated_at = pg_catalog.now();

insert into public.permit_sources (
  id, publisher, url, retrieval_date, licensing_class
) values
  ('mi-lara-asd-2026', 'Michigan LARA BCC', 'https://www.michigan.gov/lara/-/media/Project/Websites/lara/bcc-media/ASD/StatewideJurisdictionList.pdf', '2026-08-26', 'official_registry'),
  ('romi-building-2026', 'City of Royal Oak', 'https://www.romi.gov/176/Building-Inspection', '2026-08-26', 'municipal_instruction')
on conflict (id) do update set
  retrieval_date = excluded.retrieval_date;

commit;
