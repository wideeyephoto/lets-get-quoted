-- Migration: 20260826180000_contractor_credentials_vault.sql
-- Description: Creates contractor_credentials table for managing trade licenses, municipal registration PINs, and insurance

CREATE TABLE IF NOT EXISTS public.contractor_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  credential_type TEXT NOT NULL, -- 'state_license', 'municipal_registration', 'liability_insurance', 'workers_comp', 'surety_bond'
  trade_discipline TEXT NOT NULL DEFAULT 'building', -- 'building', 'electrical', 'mechanical', 'plumbing', 'general'
  license_number TEXT,
  issuing_authority TEXT NOT NULL, -- e.g. 'Michigan LARA BCC', 'City of Royal Oak'
  authority_id TEXT, -- e.g. 'mi-royal-oak'
  contractor_pin TEXT, -- Municipal PIN for AccessMyGov / BS&A
  holder_name TEXT NOT NULL, -- Qualifying officer or licensee
  policy_number TEXT,
  insurance_carrier TEXT,
  coverage_amount NUMERIC(12, 2),
  expires_at DATE,
  status TEXT NOT NULL DEFAULT 'active', -- 'active', 'expiring_soon', 'expired', 'revoked'
  document_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indices
CREATE INDEX IF NOT EXISTS idx_contractor_credentials_account ON public.contractor_credentials(account_id);
CREATE INDEX IF NOT EXISTS idx_contractor_credentials_discipline ON public.contractor_credentials(account_id, trade_discipline);
CREATE INDEX IF NOT EXISTS idx_contractor_credentials_authority ON public.contractor_credentials(account_id, authority_id);

-- Enable RLS
ALTER TABLE public.contractor_credentials ENABLE ROW LEVEL SECURITY;

-- Office / Owner RLS Policies
DROP POLICY IF EXISTS "office_users_read_contractor_credentials" ON public.contractor_credentials;
CREATE POLICY "office_users_read_contractor_credentials"
  ON public.contractor_credentials
  FOR SELECT
  TO authenticated
  USING (
    public.office_can(account_id, 'jobs.read')
  );

DROP POLICY IF EXISTS "office_users_write_contractor_credentials" ON public.contractor_credentials;
CREATE POLICY "office_users_write_contractor_credentials"
  ON public.contractor_credentials
  FOR ALL
  TO authenticated
  USING (
    public.office_can(account_id, 'jobs.write')
  )
  WITH CHECK (
    public.office_can(account_id, 'jobs.write')
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.contractor_credentials TO authenticated;
