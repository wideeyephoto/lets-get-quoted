-- ============================================================================
-- LET'S GET QUOTED — database schema (PostgreSQL / Supabase)
-- Derived from the working prototype's data model.
--
-- Design principles:
--   1. IDENTITY  → who the person is        (auth.users, provided by Supabase)
--   2. TENANCY   → which business + role    (accounts, memberships)
--   3. SCOPING   → every row carries account_id; RLS enforces isolation
--   4. BILLING   → the account is the unit that pays you (Stripe Billing)
--                  homeowner money movement is separate (Stripe Connect)
--
-- Convention: every business table has account_id; RLS policies at the bottom
-- guarantee a user only ever touches rows for accounts they belong to.
-- ============================================================================

create extension if not exists "pgcrypto";  -- for gen_random_uuid()

-- ----------------------------------------------------------------------------
-- ENUMS
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'member_role') then
    create type member_role as enum ('owner', 'crew');
  end if;

  if not exists (select 1 from pg_type where typname = 'job_status') then
    create type job_status as enum ('new_lead', 'in_progress', 'complete', 'archived');
  end if;

  if not exists (select 1 from pg_type where typname = 'cost_type') then
    create type cost_type as enum ('material', 'labor', 'sub', 'receipt', 'other');
  end if;

  if not exists (select 1 from pg_type where typname = 'invoice_status') then
    create type invoice_status as enum ('draft', 'sent', 'signed', 'paid', 'void');
  end if;

  if not exists (select 1 from pg_type where typname = 'payment_kind') then
    create type payment_kind as enum ('deposit', 'stage', 'final', 'plan_installment');
  end if;

  if not exists (select 1 from pg_type where typname = 'payment_status') then
    create type payment_status as enum ('requested', 'processing', 'paid', 'failed', 'refunded');
  end if;

  if not exists (select 1 from pg_type where typname = 'lead_source') then
    create type lead_source as enum ('website_form', 'missed_call', 'manual', 'referral');
  end if;

  if not exists (select 1 from pg_type where typname = 'lead_status') then
    create type lead_status as enum ('new', 'contacted', 'quoted', 'won', 'lost');
  end if;

  if not exists (select 1 from pg_type where typname = 'plan_tier') then
    create type plan_tier as enum ('free', 'pro', 'crew_plus', 'suspended');
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- ACCOUNTS  — the contractor business. THE BILLABLE UNIT.
-- (prototype: this was the implicit "site" + freeJobsUsed + plan)
-- ----------------------------------------------------------------------------
create table if not exists accounts (
  id                    uuid primary key default gen_random_uuid(),
  account_number        bigint generated always as identity (start with 100001),
  business_name         text not null,
  created_at            timestamptz not null default now(),

  -- SaaS billing (Stripe Billing — YOUR subscription fee)
  plan                  plan_tier not null default 'free',
  stripe_customer_id    text,
  subscription_status   text,
  free_jobs_used        int  not null default 0,
  free_jobs_limit       int  not null default 5,

  -- Stripe Connect (moving HOMEOWNER money to this contractor)
  stripe_connect_id     text,
  connect_onboarded     boolean not null default false,

  -- integrations
  quickbooks_realm_id   text,
  quickbooks_connected  boolean not null default false
);

alter table accounts add column if not exists account_number bigint generated always as identity (start with 100001);

-- ----------------------------------------------------------------------------
-- MEMBERSHIPS  — links a person (auth.users) to an account with a role.
-- This IS the Owner/Crew split, enforced in data instead of UI.
-- A person can belong to multiple accounts (rare, but the model allows it).
-- ----------------------------------------------------------------------------
create table if not exists memberships (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid not null references accounts(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  role          member_role not null default 'owner',
  created_at    timestamptz not null default now(),
  unique (account_id, user_id)
);

-- ----------------------------------------------------------------------------
-- CREW  — roster members. NOTE: a crew member is not necessarily a login user.
-- Owner adds them by name/phone; they may later be invited to an auth account.
-- ----------------------------------------------------------------------------
create table if not exists crew (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid not null references accounts(id) on delete cascade,
  name          text not null,
  phone         text not null,
  role_label    text not null default 'Laborer',
  hourly_rate   numeric(10,2) not null default 0,
  user_id       uuid references auth.users(id) on delete set null,
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- SITES  — the published website config for an account.
-- ----------------------------------------------------------------------------
create table if not exists sites (
  id                uuid primary key default gen_random_uuid(),
  account_id        uuid not null references accounts(id) on delete cascade,
  subdomain         text unique,
  custom_domain     text unique,
  published         boolean not null default false,

  template          text not null default 'carbon',
  header_font       text,
  button_style      text,
  accent_override   text,

  company_name      text not null,
  headline          text,
  tagline           text,
  phone             text,
  license           text,
  hours             text,
  service_area      text,

  logo_url          text,
  hero_url          text,

  sections          jsonb not null default '{}'::jsonb,
  content           jsonb not null default '{}'::jsonb,
  chrome            jsonb not null default '{}'::jsonb,
  reviews_cache     jsonb,
  portal_mode       text not null default 'light',

  updated_at        timestamptz not null default now()
);

alter table sites add column if not exists seo_title text;
alter table sites add column if not exists seo_description text;
alter table sites add column if not exists custom_domain_verified_at timestamptz;

-- ----------------------------------------------------------------------------
-- JOBS  — the core object.
-- ----------------------------------------------------------------------------
create table if not exists jobs (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid not null references accounts(id) on delete cascade,
  ref           text not null,

  client_name   text not null,
  client_phone  text,
  address       text,
  scope         text,
  status        job_status not null default 'in_progress',

  lead_source   lead_source,
  scheduled_for date,
  scheduled_time time,

  -- Manual revenue basis for the Costs & Margin panel until invoicing (step 5)
  -- provides a real signed/paid amount. Mirrors the prototype's "signed quote".
  quoted_amount numeric(12,2) not null default 0,

  certificate   jsonb,

  photo_paths   jsonb not null default '[]'::jsonb,

  created_at    timestamptz not null default now(),
  unique (account_id, ref)
);

-- Safe to re-run: adds the column if this table already existed pre-migration.
alter table jobs add column if not exists quoted_amount numeric(12,2) not null default 0;
alter table jobs add column if not exists photo_paths jsonb not null default '[]'::jsonb;
alter table jobs add column if not exists scheduled_time time;

-- ----------------------------------------------------------------------------
-- CREW_ASSIGNMENTS  — many-to-many jobs <-> crew.
-- ----------------------------------------------------------------------------
create table if not exists crew_assignments (
  job_id      uuid not null references jobs(id) on delete cascade,
  crew_id     uuid not null references crew(id) on delete cascade,
  account_id  uuid not null references accounts(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  primary key (job_id, crew_id)
);

-- ----------------------------------------------------------------------------
-- COSTS  — itemized job costing.
-- ----------------------------------------------------------------------------
create table if not exists costs (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid not null references accounts(id) on delete cascade,
  job_id        uuid not null references jobs(id) on delete cascade,

  type          cost_type not null,
  category      text not null,
  description   text not null,
  amount        numeric(12,2) not null,

  supplier      text,
  receipt_url   text,

  crew_id       uuid references crew(id) on delete set null,
  hours         numeric(8,2),
  rate          numeric(10,2),

  created_at    timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- JOB_FEED  — the activity/timeline per job.
-- ----------------------------------------------------------------------------
create table if not exists job_feed (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid not null references accounts(id) on delete cascade,
  job_id        uuid not null references jobs(id) on delete cascade,

  kind          text not null,
  body          text,
  image_url     text,
  author        text,
  meta          jsonb,
  created_at    timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- INVOICES  + line items.
-- ----------------------------------------------------------------------------
create table if not exists invoices (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid not null references accounts(id) on delete cascade,
  job_id        uuid not null references jobs(id) on delete cascade,
  ref           text not null,

  status        invoice_status not null default 'draft',
  total         numeric(12,2) not null default 0,
  signed_at     timestamptz,
  signer_name   text,
  created_at    timestamptz not null default now(),
  unique (account_id, ref)
);

create table if not exists invoice_items (
  id            uuid primary key default gen_random_uuid(),
  invoice_id    uuid not null references invoices(id) on delete cascade,
  description   text not null,
  amount        numeric(12,2) not null,
  sort_order    int not null default 0
);

-- ----------------------------------------------------------------------------
-- PAYMENTS  — deposits, stage payments, final, plan installments.
-- ----------------------------------------------------------------------------
create table if not exists payments (
  id                       uuid primary key default gen_random_uuid(),
  account_id               uuid not null references accounts(id) on delete cascade,
  job_id                   uuid not null references jobs(id) on delete cascade,
  invoice_id               uuid references invoices(id) on delete set null,

  kind                     payment_kind not null,
  label                    text,
  amount                   numeric(12,2) not null,
  status                   payment_status not null default 'requested',

  -- Platform fee actually charged on this payment, computed from the
  -- account's trailing-12mo volume bracket at the time of payment. Never
  -- retroactively re-rated once paid.
  platform_fee             numeric(12,2),
  fee_rate                 numeric(6,4),

  stripe_checkout_session  text,
  stripe_payment_intent    text,
  homeowner_phone          text,
  sms_consent              boolean not null default false,
  sms_consent_at           timestamptz,
  requested_at             timestamptz not null default now(),
  paid_at                  timestamptz
);

-- Safe to re-run: adds columns if this table already existed pre-migration.
alter table payments add column if not exists platform_fee numeric(12,2);
alter table payments add column if not exists fee_rate numeric(6,4);
alter table payments add column if not exists stripe_checkout_session text;
alter table payments add column if not exists homeowner_phone text;
alter table payments add column if not exists sms_consent boolean not null default false;
alter table payments add column if not exists sms_consent_at timestamptz;

-- ----------------------------------------------------------------------------
-- SMS EVENTS  — transactional delivery log and lifecycle idempotency.
-- ----------------------------------------------------------------------------
create table if not exists sms_events (
  id              uuid primary key default gen_random_uuid(),
  account_id      uuid not null references accounts(id) on delete cascade,
  payment_id      uuid not null references payments(id) on delete cascade,
  event_type      text not null check (event_type in ('payment_requested','payment_paid','payment_failed','payment_refunded')),
  phone_number    text not null,
  status          text not null default 'pending' check (status in ('pending','sent','failed','opted_out')),
  provider_id     text,
  body            text not null,
  error_reason    text,
  created_at      timestamptz not null default now(),
  sent_at         timestamptz,
  unique (payment_id, event_type)
);

create table if not exists sms_consent (
  id              uuid primary key default gen_random_uuid(),
  account_id      uuid not null references accounts(id) on delete cascade,
  phone_number    text not null,
  status          text not null default 'opted_in' check (status in ('opted_in','opted_out')),
  source          text not null default 'payment_request',
  consented_at    timestamptz,
  opted_out_at    timestamptz,
  updated_at      timestamptz not null default now(),
  unique (account_id, phone_number)
);

-- ----------------------------------------------------------------------------
-- FINANCE PLANS
-- ----------------------------------------------------------------------------
create table if not exists finance_plans (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid not null references accounts(id) on delete cascade,
  job_id        uuid not null references jobs(id) on delete cascade,
  provider      text not null default 'Wisetack',
  financed      numeric(12,2) not null,
  monthly       numeric(12,2) not null,
  months        int not null,
  apr           text,
  status        text not null default 'active',
  created_at    timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- LEADS
-- ----------------------------------------------------------------------------
create table if not exists leads (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid not null references accounts(id) on delete cascade,
  source        lead_source not null,
  status        lead_status not null default 'new',
  name          text,
  phone         text,
  email         text,
  address       text,
  project_type  text,
  message       text,
  photo_paths   jsonb not null default '[]'::jsonb,
  source_page   text,
  converted_job uuid references jobs(id) on delete set null,
  updated_at    timestamptz not null default now(),
  created_at    timestamptz not null default now()
);

alter table leads add column if not exists status lead_status not null default 'new';
alter table leads add column if not exists email text;
alter table leads add column if not exists project_type text;
alter table leads add column if not exists photo_paths jsonb not null default '[]'::jsonb;
alter table leads add column if not exists source_page text;
alter table leads add column if not exists updated_at timestamptz not null default now();

-- ----------------------------------------------------------------------------
-- HELPFUL VIEW  — per-job margin, computed (never stored).
-- ----------------------------------------------------------------------------
drop view if exists job_margins;
create view job_margins as
select
  j.id as job_id,
  j.account_id,
  coalesce(rev.revenue, 0) as revenue,
  coalesce(c.total_cost, 0) as cost,
  coalesce(rev.revenue, 0) - coalesce(c.total_cost, 0) as profit,
  case when coalesce(rev.revenue, 0) = 0 then 0
       else (coalesce(rev.revenue, 0) - coalesce(c.total_cost, 0)) / rev.revenue
  end as margin
from jobs j
left join (
  select job_id, sum(amount) total_cost from costs group by job_id
) c on c.job_id = j.id
left join (
  select job_id, max(total) revenue from invoices
  where status in ('paid','signed','sent') group by job_id
) rev on rev.job_id = j.id;

-- ============================================================================
-- ROW-LEVEL SECURITY
-- ============================================================================
create or replace function is_member(acc uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from memberships m
    where m.account_id = acc and m.user_id = auth.uid()
  );
$$;

create or replace function is_owner(acc uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from memberships m
    where m.account_id = acc and m.user_id = auth.uid() and m.role = 'owner'
  );
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'accounts','memberships','crew','sites','jobs','crew_assignments',
    'costs','job_feed','invoices','payments','finance_plans','leads','sms_events','sms_consent'
  ] loop
    execute format('alter table %I enable row level security;', t);
  end loop;
end $$;

drop policy if exists acc_read on accounts;
drop policy if exists acc_write on accounts;
drop policy if exists mem_read on memberships;
drop policy if exists mem_manage on memberships;
drop policy if exists crew_all on crew;
drop policy if exists site_all on sites;
drop policy if exists job_all on jobs;
drop policy if exists asg_all on crew_assignments;
drop policy if exists cost_all on costs;
drop policy if exists feed_all on job_feed;
drop policy if exists inv_all on invoices;
drop policy if exists pay_all on payments;
drop policy if exists plan_all on finance_plans;
drop policy if exists lead_all on leads;
drop policy if exists sms_event_all on sms_events;
drop policy if exists sms_consent_all on sms_consent;
drop policy if exists invitem_all on invoice_items;

create policy acc_read   on accounts for select using ( is_member(id) );
create policy acc_write  on accounts for update using ( is_owner(id) );

create policy mem_read   on memberships for select using ( is_member(account_id) );
create policy mem_manage on memberships for all    using ( is_owner(account_id) );

create policy crew_all   on crew             for all using ( is_member(account_id) );
create policy site_all   on sites            for all using ( is_member(account_id) );
create policy job_all    on jobs             for all using ( is_member(account_id) );
create policy asg_all    on crew_assignments for all using ( is_member(account_id) );
create policy cost_all   on costs            for all using ( is_member(account_id) );
create policy feed_all   on job_feed         for all using ( is_member(account_id) );
create policy inv_all    on invoices         for all using ( is_member(account_id) );
create policy pay_all    on payments         for all using ( is_member(account_id) );
create policy plan_all   on finance_plans    for all using ( is_member(account_id) );
create policy lead_all   on leads            for all using ( is_member(account_id) );
create policy sms_event_all on sms_events     for all using ( is_member(account_id) );
create policy sms_consent_all on sms_consent  for all using ( is_member(account_id) );

alter table invoice_items enable row level security;
create policy invitem_all on invoice_items for all using (
  exists (select 1 from invoices i where i.id = invoice_id and is_member(i.account_id))
);

-- ============================================================================
-- INDEXES worth having from day one
-- ============================================================================
create index if not exists jobs_account_id_status_idx on jobs (account_id, status);
create index if not exists costs_job_id_idx on costs (job_id);
create index if not exists job_feed_job_id_created_at_idx on job_feed (job_id, created_at);
create index if not exists invoices_job_id_idx on invoices (job_id);
create index if not exists payments_job_id_status_idx on payments (job_id, status);
create index if not exists crew_assignments_crew_id_idx on crew_assignments (crew_id);
create index if not exists memberships_user_id_idx on memberships (user_id);
create index if not exists leads_account_id_status_created_at_idx on leads (account_id, status, created_at desc);
create index if not exists sms_events_account_payment_idx on sms_events (account_id, payment_id, created_at desc);
create index if not exists sms_consent_phone_idx on sms_consent (phone_number, status);
