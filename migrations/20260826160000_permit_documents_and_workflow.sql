-- Migration: 20260826160000_permit_documents_and_workflow.sql
-- Permit Documents Storage Metadata & Job Workflow Extensions

begin;

-- 1. Create job_permit_documents table
create table if not exists public.job_permit_documents (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  permit_case_id uuid references public.job_permit_cases(id) on delete cascade,
  document_type text not null check (
    document_type in (
      'application_draft', 'site_plan', 'contractor_license', 'insurance_coi',
      'homeowner_affidavit', 'permit_issued_pdf', 'inspection_report', 'receipt', 'other'
    )
  ),
  file_name text not null,
  file_size_bytes bigint not null default 0,
  mime_type text not null default 'application/pdf',
  storage_path text not null,
  sha256_hash text,
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default pg_catalog.now()
);

create index if not exists idx_job_permit_documents_account_job
  on public.job_permit_documents (account_id, job_id);

create index if not exists idx_job_permit_documents_case
  on public.job_permit_documents (permit_case_id);

-- 2. RLS & Grants on job_permit_documents
alter table public.job_permit_documents enable row level security;

drop policy if exists job_permit_documents_select on public.job_permit_documents;
create policy job_permit_documents_select on public.job_permit_documents
  for select to authenticated using (public.office_can(account_id, 'jobs.read'));

drop policy if exists job_permit_documents_insert on public.job_permit_documents;
create policy job_permit_documents_insert on public.job_permit_documents
  for insert to authenticated with check (public.office_can(account_id, 'jobs.write'));

drop policy if exists job_permit_documents_delete on public.job_permit_documents;
create policy job_permit_documents_delete on public.job_permit_documents
  for delete to authenticated using (public.office_can(account_id, 'jobs.write'));

grant select, insert, delete on public.job_permit_documents to authenticated;

commit;
