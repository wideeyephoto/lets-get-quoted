-- Migration: 20260905142000_insurance_claims.sql
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
  total_supplement_amount numeric(10, 2) not null default 0.00
    check (total_supplement_amount >= 0 and total_supplement_amount <= 99999999.99),
  revised_rcv_amount numeric(10, 2)
    check (revised_rcv_amount is null or (revised_rcv_amount >= 0 and revised_rcv_amount <= 99999999.99)),
  justification_letter text,
  letter_revisions jsonb not null default '[]'::jsonb,
  status text not null default 'draft'
    check (status in ('draft', 'scope_received', 'supplement_pending', 'approved', 'invoiced', 'closed')),
  trade_slug text not null default 'roofers',
  ai_analyzed_at timestamptz,
  analysis_method text not null default 'heuristic'
    check (analysis_method in ('heuristic', 'ai')),
  deleted_at timestamptz,
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
  on public.insurance_claims(account_id, status)
  where deleted_at is null;

create index if not exists idx_insurance_claims_created_at
  on public.insurance_claims(account_id, created_at desc)
  where deleted_at is null;

create index if not exists idx_insurance_claims_deleted_at
  on public.insurance_claims(account_id, deleted_at)
  where deleted_at is not null;

-- updated_at trigger
create or replace function public.touch_insurance_claims_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  new.updated_at := pg_catalog.clock_timestamp();
  return new;
end;
$$;

drop trigger if exists touch_insurance_claims_updated_at_trigger on public.insurance_claims;
create trigger touch_insurance_claims_updated_at_trigger
before update on public.insurance_claims
for each row execute function public.touch_insurance_claims_updated_at();

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
grant all on public.insurance_claims to service_role;
revoke all on public.insurance_claims from anon, public;

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'insurance_claims' and c.relrowsecurity
  ) then
    raise exception 'row level security is not enabled on insurance_claims';
  end if;
end $$;

commit;
