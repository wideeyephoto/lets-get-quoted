-- Create lien_filings table
CREATE TABLE IF NOT EXISTS public.lien_filings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
    job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
    invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
    filing_type text NOT NULL, -- 'NOI', 'LIEN', 'PRELIM'
    external_provider_id text, -- e.g. Levelset Order ID
    status text NOT NULL DEFAULT 'processing', -- 'processing', 'mailed', 'recorded', 'rejected'
    filing_cost numeric(12,2) NOT NULL DEFAULT 45.00,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- RLS
ALTER TABLE public.lien_filings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their account lien filings"
    ON public.lien_filings
    FOR SELECT
    USING (account_id = (current_setting('request.jwt.claims', true)::jsonb ->> 'account_id')::uuid);

CREATE POLICY "Users can insert their account lien filings"
    ON public.lien_filings
    FOR INSERT
    WITH CHECK (account_id = (current_setting('request.jwt.claims', true)::jsonb ->> 'account_id')::uuid);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_lien_filings_account_id ON public.lien_filings(account_id);
CREATE INDEX IF NOT EXISTS idx_lien_filings_job_id ON public.lien_filings(job_id);
CREATE INDEX IF NOT EXISTS idx_lien_filings_invoice_id ON public.lien_filings(invoice_id);
