-- Google Local Services Ads import foundation.
--
-- Provider credentials and imported provider facts are deliberately dark:
-- only the server-side service-role client can read or mutate these tables.
-- End-user views are projected through the ordinary CRM leads/jobs tables.

begin;

-- Stable provider identity on the CRM row makes lead import replay-safe while
-- preserving one Local Services lead per workspace.
alter table public.leads
  add column if not exists source_google_lsa_resource text;

create unique index if not exists leads_account_google_lsa_resource_uidx
  on public.leads (account_id, source_google_lsa_resource);

create table if not exists public.google_lsa_connections (
  account_id uuid primary key
    references public.accounts(id) on delete cascade,

  customer_id text,
  login_customer_id text,
  customer_name text,
  customer_time_zone text,
  campaign_id text,
  campaign_mode text,

  access_token text not null,
  refresh_token text not null,
  access_expires_at timestamptz not null,
  candidate_customers jsonb not null default '[]'::jsonb,

  connected_at timestamptz not null default pg_catalog.now(),
  connected_by uuid references auth.users(id) on delete set null,
  sync_started_at timestamptz,
  last_sync_attempt_at timestamptz,
  last_sync_at timestamptz,
  last_full_rescan_at timestamptz,
  last_sync_summary text,
  last_error text,
  disconnected_at timestamptz,
  updated_at timestamptz not null default pg_catalog.now(),

  constraint google_lsa_connections_customer_id_digits check (
    customer_id is null or customer_id ~ '^[0-9]+$'
  ),
  constraint google_lsa_connections_login_customer_id_digits check (
    login_customer_id is null or login_customer_id ~ '^[0-9]+$'
  ),
  constraint google_lsa_connections_campaign_id_digits check (
    campaign_id is null or campaign_id ~ '^[0-9]+$'
  ),
  constraint google_lsa_connections_campaign_mode_check check (
    campaign_mode is null or campaign_mode in ('legacy', 'pmax')
  ),
  constraint google_lsa_connections_candidates_array check (
    pg_catalog.jsonb_typeof(candidate_customers) = 'array'
  )
);

create index if not exists google_lsa_connections_customer_id_idx
  on public.google_lsa_connections (customer_id)
  where customer_id is not null;

create index if not exists google_lsa_connections_connected_by_idx
  on public.google_lsa_connections (connected_by)
  where connected_by is not null;

create table if not exists public.google_lsa_leads (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null
    references public.accounts(id) on delete cascade,
  customer_id text not null,
  google_lead_id text not null,
  resource_name text not null,
  crm_lead_id uuid references public.leads(id) on delete set null,

  category_id text,
  service_id text,
  lead_type text,
  lead_status text,
  consumer_name text,
  consumer_phone text,
  consumer_phone_extension text,
  locale text,
  lead_charged boolean not null default false,
  credit_state text,
  credit_state_updated_at timestamptz,
  feedback_submitted boolean not null default false,
  note text,
  note_updated_at timestamptz,
  google_created_at timestamptz,
  first_synced_at timestamptz not null default pg_catalog.now(),
  last_synced_at timestamptz not null default pg_catalog.now(),

  constraint google_lsa_leads_customer_id_digits check (
    customer_id ~ '^[0-9]+$'
  ),
  constraint google_lsa_leads_google_id_nonempty check (
    pg_catalog.btrim(google_lead_id) <> ''
  ),
  constraint google_lsa_leads_resource_nonempty check (
    pg_catalog.btrim(resource_name) <> ''
  ),
  constraint google_lsa_leads_sync_order check (
    last_synced_at >= first_synced_at
  ),
  constraint google_lsa_leads_account_resource_key
    unique (account_id, resource_name),
  constraint google_lsa_leads_account_customer_google_lead_key
    unique (account_id, customer_id, google_lead_id)
);

create index if not exists google_lsa_leads_crm_lead_id_idx
  on public.google_lsa_leads (crm_lead_id)
  where crm_lead_id is not null;

create unique index if not exists google_lsa_leads_account_crm_lead_uidx
  on public.google_lsa_leads (account_id, crm_lead_id)
  where crm_lead_id is not null;

create index if not exists google_lsa_leads_account_created_idx
  on public.google_lsa_leads (account_id, google_created_at desc);

create table if not exists public.google_lsa_conversations (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null
    references public.accounts(id) on delete cascade,
  customer_id text not null,
  google_conversation_id text not null,
  resource_name text not null,
  google_lead_id text not null,

  channel text not null,
  participant text,
  event_type text,
  event_at timestamptz,
  message_text text,
  attachments jsonb not null default '[]'::jsonb,
  call_duration_seconds integer,
  recording_url text,
  first_synced_at timestamptz not null default pg_catalog.now(),
  last_synced_at timestamptz not null default pg_catalog.now(),

  constraint google_lsa_conversations_customer_id_digits check (
    customer_id ~ '^[0-9]+$'
  ),
  constraint google_lsa_conversations_google_id_nonempty check (
    pg_catalog.btrim(google_conversation_id) <> ''
  ),
  constraint google_lsa_conversations_resource_nonempty check (
    pg_catalog.btrim(resource_name) <> ''
  ),
  constraint google_lsa_conversations_attachments_array check (
    pg_catalog.jsonb_typeof(attachments) = 'array'
  ),
  constraint google_lsa_conversations_call_duration_check check (
    call_duration_seconds is null or call_duration_seconds >= 0
  ),
  constraint google_lsa_conversations_sync_order check (
    last_synced_at >= first_synced_at
  ),
  constraint google_lsa_conversations_account_customer_google_id_key
    unique (account_id, customer_id, google_conversation_id),
  constraint google_lsa_conversations_account_resource_key
    unique (account_id, resource_name),
  constraint google_lsa_conversations_lead_fkey
    foreign key (account_id, customer_id, google_lead_id)
    references public.google_lsa_leads(account_id, customer_id, google_lead_id)
    on delete cascade
);

create index if not exists google_lsa_conversations_lead_idx
  on public.google_lsa_conversations (account_id, customer_id, google_lead_id);

create index if not exists google_lsa_conversations_account_event_idx
  on public.google_lsa_conversations (account_id, event_at desc);

create table if not exists public.google_lsa_spend (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null
    references public.accounts(id) on delete cascade,
  customer_id text not null,
  campaign_id text,
  source text not null,
  period_start date not null,
  period_end date not null,
  gross_cost_micros bigint not null default 0,
  charged_leads integer not null default 0,
  phone_calls integer not null default 0,
  connected_phone_calls integer not null default 0,
  currency_code text not null default 'USD',
  captured_at timestamptz not null default pg_catalog.now(),

  constraint google_lsa_spend_customer_id_digits check (
    customer_id ~ '^[0-9]+$'
  ),
  constraint google_lsa_spend_campaign_id_digits check (
    campaign_id is null or campaign_id ~ '^[0-9]+$'
  ),
  constraint google_lsa_spend_source_check check (
    source in ('google_ads_api', 'local_services_account_report')
  ),
  constraint google_lsa_spend_period_check check (
    period_end >= period_start
  ),
  constraint google_lsa_spend_gross_cost_check check (
    gross_cost_micros >= 0
  ),
  constraint google_lsa_spend_counts_check check (
    charged_leads >= 0
    and phone_calls >= 0
    and connected_phone_calls >= 0
  ),
  constraint google_lsa_spend_currency_code_check check (
    currency_code ~ '^[A-Z]{3}$'
  ),
  constraint google_lsa_spend_snapshot_key unique nulls not distinct (
    account_id,
    customer_id,
    campaign_id,
    source,
    period_start,
    period_end
  )
);

create index if not exists google_lsa_spend_account_period_idx
  on public.google_lsa_spend (account_id, period_start, period_end);

create table if not exists public.google_lsa_feedback (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null
    references public.accounts(id) on delete cascade,
  customer_id text not null,
  google_lead_id text not null,
  crm_lead_id uuid references public.leads(id) on delete set null,
  answer text,
  reason text,
  comment text,
  credit_issuance_decision text,
  submission_status text not null default 'succeeded',
  last_error text,
  submitted_by uuid references auth.users(id) on delete set null,
  submitted_at timestamptz not null default pg_catalog.now(),

  constraint google_lsa_feedback_google_id_nonempty check (
    pg_catalog.btrim(google_lead_id) <> ''
  ),
  constraint google_lsa_feedback_customer_id_digits check (
    customer_id ~ '^[0-9]+$'
  ),
  constraint google_lsa_feedback_submission_status_check check (
    submission_status in ('pending', 'succeeded', 'failed')
  ),
  constraint google_lsa_feedback_account_customer_google_lead_key
    unique (account_id, customer_id, google_lead_id),
  constraint google_lsa_feedback_google_lead_fkey
    foreign key (account_id, customer_id, google_lead_id)
    references public.google_lsa_leads(account_id, customer_id, google_lead_id)
    on delete cascade
);

create index if not exists google_lsa_feedback_crm_lead_id_idx
  on public.google_lsa_feedback (crm_lead_id)
  where crm_lead_id is not null;

create index if not exists google_lsa_feedback_submitted_by_idx
  on public.google_lsa_feedback (submitted_by)
  where submitted_by is not null;

alter table public.google_lsa_connections enable row level security;
alter table public.google_lsa_leads enable row level security;
alter table public.google_lsa_conversations enable row level security;
alter table public.google_lsa_spend enable row level security;
alter table public.google_lsa_feedback enable row level security;

revoke all on table
  public.google_lsa_connections,
  public.google_lsa_leads,
  public.google_lsa_conversations,
  public.google_lsa_spend,
  public.google_lsa_feedback
from public, anon, authenticated, service_role;

grant select, insert, update, delete on table
  public.google_lsa_connections,
  public.google_lsa_leads,
  public.google_lsa_conversations,
  public.google_lsa_spend,
  public.google_lsa_feedback
to service_role;

commit;
