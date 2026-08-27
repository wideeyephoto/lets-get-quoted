-- Migration: 20260826170000_permit_inspections.sql
-- Description: Creates job_permit_inspections table for tracking municipal inspection milestones

CREATE TABLE IF NOT EXISTS public.job_permit_inspections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  permit_case_id UUID REFERENCES public.job_permit_cases(id) ON DELETE SET NULL,
  inspection_type TEXT NOT NULL, -- e.g. 'mid_roof', 'rough_ice_barrier', 'final_building'
  title TEXT NOT NULL, -- Human-readable title
  status TEXT NOT NULL DEFAULT 'required', -- 'required', 'requested', 'scheduled', 'passed', 'failed', 'cancelled', 'waived'
  requested_date DATE,
  scheduled_date DATE,
  completed_date DATE,
  inspector_name TEXT,
  inspector_phone TEXT,
  notes TEXT,
  failure_reasons TEXT[],
  reinspection_fee NUMERIC(10, 2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indices
CREATE INDEX IF NOT EXISTS idx_job_permit_inspections_job ON public.job_permit_inspections(account_id, job_id);
CREATE INDEX IF NOT EXISTS idx_job_permit_inspections_status ON public.job_permit_inspections(status);

-- Enable RLS
ALTER TABLE public.job_permit_inspections ENABLE ROW LEVEL SECURITY;

-- Policies for tenant office users
DROP POLICY IF EXISTS "office_users_read_permit_inspections" ON public.job_permit_inspections;
CREATE POLICY "office_users_read_permit_inspections"
  ON public.job_permit_inspections
  FOR SELECT
  TO authenticated
  USING (
    public.office_can(account_id, 'jobs.read')
  );

DROP POLICY IF EXISTS "office_users_write_permit_inspections" ON public.job_permit_inspections;
CREATE POLICY "office_users_write_permit_inspections"
  ON public.job_permit_inspections
  FOR ALL
  TO authenticated
  USING (
    public.office_can(account_id, 'jobs.write')
  )
  WITH CHECK (
    public.office_can(account_id, 'jobs.write')
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_permit_inspections TO authenticated;
