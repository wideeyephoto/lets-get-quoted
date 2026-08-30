-- Migration: 20260830190000_subcontractor_tax_vault.sql
-- Description: Creates isolated private schema tax_vault unexposed to browser clients, with encrypted TIN storage.
--
-- REACHABILITY, read before wiring a caller: PostgREST serves only the schemas
-- in its exposed list, and tax_vault is deliberately NOT in it. The consumer
-- module (src/lib/subcontractor-tax-identity.ts, zero importers today) reaches
-- this table via supabase-js .schema('tax_vault'), which returns PGRST106
-- "Invalid schema" until tax_vault is added to the project's exposed schemas
-- (Supabase Dashboard -> Settings -> API -> Exposed schemas -- a Codex job)
-- and PostgREST reloads. The revokes below are what make that exposure safe:
-- anon/authenticated fail the schema USAGE check with 42501.
--
-- Do NOT resolve unreachability by moving this table into schema public: the
-- default ACL there grants anon INSERT/SELECT/UPDATE/DELETE on every new table
-- the instant it is created, and these rows are encrypted SSNs/EINs.
--
-- Wrapped in an explicit transaction so the table and its revokes land
-- atomically under any applier -- a mid-file failure must not leave a TIN
-- table sitting on default ACLs.
begin;

-- 1. Private schema creation
create schema if not exists tax_vault;

revoke all on schema tax_vault from public, anon, authenticated;
grant usage on schema tax_vault to service_role;

-- 2. Subcontractor tax identities table
create table if not exists tax_vault.subcontractor_tax_identities (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  crew_id uuid not null references public.crew(id) on delete cascade,
  legal_name text not null check (pg_catalog.length(pg_catalog.btrim(legal_name)) between 2 and 255),
  business_name text check (business_name is null or pg_catalog.length(business_name) <= 255),
  tax_classification text not null check (tax_classification in (
    'individual_sole_proprietor',
    'c_corporation',
    's_corporation',
    'partnership',
    'trust_estate',
    'llc_c',
    'llc_s',
    'llc_p',
    'other'
  )),
  tin_type text not null check (tin_type in ('ein', 'ssn')),
  tin_last_four text not null check (tin_last_four ~ '^[0-9]{4}$'),
  encrypted_tin text not null check (pg_catalog.length(encrypted_tin) > 0),
  tin_iv text not null check (pg_catalog.length(tin_iv) > 0),
  tin_auth_tag text not null check (pg_catalog.length(tin_auth_tag) > 0),
  tax_address_line1 text not null check (pg_catalog.length(pg_catalog.btrim(tax_address_line1)) >= 2),
  tax_address_line2 text,
  tax_city text not null check (pg_catalog.length(pg_catalog.btrim(tax_city)) >= 2),
  tax_region text not null check (pg_catalog.length(pg_catalog.btrim(tax_region)) = 2),
  tax_postal_code text not null check (tax_postal_code ~ '^[0-9]{5}(-[0-9]{4})?$'),
  exempt_payee_code text check (exempt_payee_code is null or pg_catalog.length(exempt_payee_code) <= 10),
  fatca_code text check (fatca_code is null or pg_catalog.length(fatca_code) <= 10),
  backup_withholding_required boolean not null default false,
  w9_document_path text check (w9_document_path is null or pg_catalog.length(w9_document_path) <= 1024),
  w9_signed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subcontractor_tax_identities_crew_unique unique (account_id, crew_id)
);

create index if not exists idx_tax_vault_subcontractor_account on tax_vault.subcontractor_tax_identities(account_id);
create index if not exists idx_tax_vault_subcontractor_crew on tax_vault.subcontractor_tax_identities(crew_id);

revoke all on table tax_vault.subcontractor_tax_identities from public, anon, authenticated;
grant all on table tax_vault.subcontractor_tax_identities to service_role;

commit;
