-- Migration: 20260905140000_insurance_claims.sql
-- Description: Homeowner insurance claims, adjuster scope persistence, building code supplements, and dispute letter storage.

begin;

create table if not exists public.insurance_claims (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  job_id uuid references public.jobs(id) on delete set null,
  claim_number text,
  policyholder_name text,
  property_address text,
  carrier_name text,
  adjuster_name text,
  adjuster_email text,
  adjuster_phone text,
  date_of_loss text,
  scope_text text,
  parsed_figures jsonb not null default '{}'::jsonb,
  discrepancies jsonb not null default '[]'::jsonb,
  total_supplement_amount numeric(10, 2) not null default 0.00,
  revised_rcv_amount numeric(10, 2),
  justification_letter text,
  status text not null default 'draft'
    check (status in ('draft', 'scope_received', 'supplement_pending', 'approved', 'invoiced', 'closed')),
  trade_slug text not null default 'roofers',
  ai_analyzed_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);

create index if not exists idx_insurance_claims_account_id
  on public.insurance_claims(account_id);

create index if not exists idx_insurance_claims_client_id
  on public.insurance_claims(client_id)
  where client_id is not null;

create index if not exists idx_insurance_claims_job_id
  on public.insurance_claims(job_id)
  where job_id is not null;

create index if not exists idx_insurance_claims_status
  on public.insurance_claims(account_id, status);

create index if not exists idx_insurance_claims_created_at
  on public.insurance_claims(account_id, created_at desc);

alter table public.insurance_claims enable row level security;

drop policy if exists "office_users_read_insurance_claims" on public.insurance_claims;
create policy "office_users_read_insurance_claims"
  on public.insurance_claims
  for select
  to authenticated
  using (
    public.office_can(account_id, 'jobs.read')
  );

drop policy if exists "office_users_write_insurance_claims" on public.insurance_claims;
create policy "office_users_write_insurance_claims"
  on public.insurance_claims
  for all
  to authenticated
  using (
    public.office_can(account_id, 'jobs.write')
  )
  with check (
    public.office_can(account_id, 'jobs.write')
  );

grant select, insert, update, delete on public.insurance_claims to authenticated;
revoke all on public.insurance_claims from anon, public;

commit;
