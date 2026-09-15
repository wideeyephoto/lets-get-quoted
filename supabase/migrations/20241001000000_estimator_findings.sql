CREATE TABLE public.estimator_findings (
    id uuid NOT NULL DEFAULT extensions.uuid_generate_v4(),
    job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
    account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
    photo_url text NOT NULL,
    notes text,
    trade text,
    defects jsonb NOT NULL DEFAULT '[]'::jsonb,
    total_estimated_repair_dollars numeric(10,2) NOT NULL DEFAULT 0,
    urgency text NOT NULL DEFAULT 'routine',
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    PRIMARY KEY (id)
);

CREATE INDEX idx_estimator_findings_job_id ON public.estimator_findings(job_id);
CREATE INDEX idx_estimator_findings_account_id ON public.estimator_findings(account_id);

ALTER TABLE public.estimator_findings ENABLE ROW LEVEL SECURITY;

-- Contractors can read/write findings for their account
CREATE POLICY "Contractors can read their account estimator findings" ON public.estimator_findings
    FOR SELECT
    USING (account_id IN (
        SELECT account_id FROM public.members WHERE user_id = auth.uid()
    ));

CREATE POLICY "Contractors can insert estimator findings" ON public.estimator_findings
    FOR INSERT
    WITH CHECK (account_id IN (
        SELECT account_id FROM public.members WHERE user_id = auth.uid()
    ));

CREATE POLICY "Contractors can update estimator findings" ON public.estimator_findings
    FOR UPDATE
    USING (account_id IN (
        SELECT account_id FROM public.members WHERE user_id = auth.uid()
    ))
    WITH CHECK (account_id IN (
        SELECT account_id FROM public.members WHERE user_id = auth.uid()
    ));

CREATE POLICY "Contractors can delete estimator findings" ON public.estimator_findings
    FOR DELETE
    USING (account_id IN (
        SELECT account_id FROM public.members WHERE user_id = auth.uid()
    ));

-- Homeowners can read findings for jobs they own
CREATE POLICY "Homeowners can view estimator findings for their jobs" ON public.estimator_findings
    FOR SELECT
    USING (job_id IN (
        SELECT id FROM public.jobs WHERE client_id = auth.uid()
    ));
