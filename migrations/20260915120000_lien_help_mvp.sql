-- Create storage bucket for lien-help
INSERT INTO storage.buckets (id, name, public) 
VALUES ('lien-help', 'lien-help', false) 
ON CONFLICT (id) DO NOTHING;

-- RLS for storage.objects on lien-help
CREATE POLICY "Account owners can manage their lien-help objects"
    ON storage.objects
    FOR ALL
    TO authenticated
    USING (bucket_id = 'lien-help' AND public.is_owner((string_to_array(name, '/'))[1]::uuid))
    WITH CHECK (bucket_id = 'lien-help' AND public.is_owner((string_to_array(name, '/'))[1]::uuid));

-- 1. lien_help_cases
CREATE TABLE IF NOT EXISTS public.lien_help_cases (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
    job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
    purpose text,
    lifecycle text NOT NULL DEFAULT 'preparing',
    revision integer NOT NULL DEFAULT 1,
    reviewed_data jsonb DEFAULT '{}'::jsonb,
    provider_name text,
    provider_ref text,
    next_action_date date,
    next_action_text text,
    next_action_source text,
    closure_reason text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    actor_id uuid
);

ALTER TABLE public.lien_help_cases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their account lien cases"
    ON public.lien_help_cases FOR SELECT TO authenticated
    USING (public.is_owner(account_id));
CREATE POLICY "Users can insert their account lien cases"
    ON public.lien_help_cases FOR INSERT TO authenticated
    WITH CHECK (public.is_owner(account_id));
CREATE POLICY "Users can update their account lien cases"
    ON public.lien_help_cases FOR UPDATE TO authenticated
    USING (public.is_owner(account_id))
    WITH CHECK (public.is_owner(account_id));

-- Unique case per job
CREATE UNIQUE INDEX IF NOT EXISTS idx_lien_help_cases_job_id ON public.lien_help_cases(account_id, job_id);
CREATE INDEX IF NOT EXISTS idx_lien_help_cases_followup ON public.lien_help_cases(account_id, next_action_date) WHERE next_action_date IS NOT NULL AND lifecycle != 'closed';

-- 2. lien_help_documents
CREATE TABLE IF NOT EXISTS public.lien_help_documents (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
    case_id uuid NOT NULL REFERENCES public.lien_help_cases(id) ON DELETE CASCADE,
    category text NOT NULL,
    storage_path text NOT NULL,
    safe_filename text NOT NULL,
    mime_type text,
    byte_size bigint,
    sha256_hash text,
    status text NOT NULL DEFAULT 'pending',
    source_type text,
    source_id text,
    superseded_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    actor_id uuid
);

ALTER TABLE public.lien_help_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their account lien documents"
    ON public.lien_help_documents FOR SELECT TO authenticated
    USING (public.is_owner(account_id));
CREATE POLICY "Users can insert their account lien documents"
    ON public.lien_help_documents FOR INSERT TO authenticated
    WITH CHECK (public.is_owner(account_id));
CREATE POLICY "Users can update their account lien documents"
    ON public.lien_help_documents FOR UPDATE TO authenticated
    USING (public.is_owner(account_id))
    WITH CHECK (public.is_owner(account_id));

CREATE INDEX IF NOT EXISTS idx_lien_help_documents_case_id ON public.lien_help_documents(account_id, case_id);

-- 3. lien_help_packets
CREATE TABLE IF NOT EXISTS public.lien_help_packets (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
    case_id uuid NOT NULL REFERENCES public.lien_help_cases(id) ON DELETE CASCADE,
    version_number integer NOT NULL,
    request_id text NOT NULL,
    case_revision integer NOT NULL,
    snapshot_data jsonb DEFAULT '{}'::jsonb,
    manifest jsonb DEFAULT '{}'::jsonb,
    build_state text NOT NULL DEFAULT 'building',
    error_code text,
    zip_path text,
    zip_size bigint,
    zip_hash text,
    created_at timestamp with time zone DEFAULT now(),
    actor_id uuid
);

ALTER TABLE public.lien_help_packets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their account lien packets"
    ON public.lien_help_packets FOR SELECT TO authenticated
    USING (public.is_owner(account_id));
CREATE POLICY "Users can insert their account lien packets"
    ON public.lien_help_packets FOR INSERT TO authenticated
    WITH CHECK (public.is_owner(account_id));
CREATE POLICY "Users can update their account lien packets"
    ON public.lien_help_packets FOR UPDATE TO authenticated
    USING (public.is_owner(account_id))
    WITH CHECK (public.is_owner(account_id));

CREATE UNIQUE INDEX IF NOT EXISTS idx_lien_help_packets_case_version ON public.lien_help_packets(case_id, version_number);
CREATE UNIQUE INDEX IF NOT EXISTS idx_lien_help_packets_request ON public.lien_help_packets(account_id, request_id);

-- 4. lien_help_events
CREATE TABLE IF NOT EXISTS public.lien_help_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
    case_id uuid NOT NULL REFERENCES public.lien_help_cases(id) ON DELETE CASCADE,
    event_type text NOT NULL,
    event_date date NOT NULL,
    source text,
    provider_reference text,
    evidence_document_ids jsonb DEFAULT '[]'::jsonb,
    related_recording_id text,
    note text,
    operation_id text,
    created_at timestamp with time zone DEFAULT now(),
    actor_id uuid
);

ALTER TABLE public.lien_help_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their account lien events"
    ON public.lien_help_events FOR SELECT TO authenticated
    USING (public.is_owner(account_id));
CREATE POLICY "Users can insert their account lien events"
    ON public.lien_help_events FOR INSERT TO authenticated
    WITH CHECK (public.is_owner(account_id));
-- Intentionally no UPDATE policy for events (append-only)

CREATE INDEX IF NOT EXISTS idx_lien_help_events_case_id ON public.lien_help_events(account_id, case_id, created_at);

-- Add 'lien-help' to metered buckets
create or replace function public.workspace_storage_metered_buckets()
returns text[]
language sql
immutable
set search_path = ''
as $fn$
  select array[
    'job-photos',
    'lead-photos',
    'crew-photos',
    'insurance-proof',
    'site-images',
    'site-videos',
    'account-attachments',
    'lien-help'
  ]::text[];
$fn$;

comment on function public.workspace_storage_metered_buckets() is
  'Buckets counted against a workspace storage allowance. Mirrored in lib/billing/storage-usage.ts.';

grant execute on function public.workspace_storage_metered_buckets() to service_role;
