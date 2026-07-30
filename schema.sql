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

-- Added after the initial release: a paid payment can be charged back by the
-- homeowner. `disputed` is a distinct, non-terminal state (Stripe may resolve
-- it in the contractor's favor) — kept separate from `refunded` so it doesn't
-- silently count toward paid volume or disappear from the contractor's view.
-- Runs outside the do-block above because ALTER TYPE ... ADD VALUE cannot be
-- issued from a PL/pgSQL function body.
alter type payment_status add value if not exists 'disputed';

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
  -- Set when Stripe disables transfers on a PREVIOUSLY working account (vs. one
  -- that simply never finished onboarding). Drives the contractor-facing
  -- "payouts paused" alert; cleared when the account is reactivated.
  connect_disabled_at   timestamptz,

  -- integrations
  quickbooks_realm_id   text,
  quickbooks_connected  boolean not null default false,

  -- Scheduling preference: how many estimated job hours fill one calendar day.
  schedule_day_hours    numeric(5,2) not null default 8
);

alter table accounts add column if not exists account_number bigint generated always as identity (start with 100001);
alter table accounts add column if not exists schedule_day_hours numeric(5,2) not null default 8;
alter table accounts add column if not exists connect_disabled_at timestamptz;
-- When on, marking a job complete auto-texts (email fallback) the client a
-- Google review request. Opt-in, default off, so no client is texted by
-- surprise. The one-tap button on the job page works regardless of this flag.
alter table accounts add column if not exists auto_review_request boolean not null default false;
-- When on, a client approving their quote auto-creates a deposit payment request
-- for deposit_percent of the quote total (and texts the pay link when the client
-- has SMS consent). Opt-in, default off; percent defaults to 25%.
alter table accounts add column if not exists deposit_on_approval boolean not null default false;
alter table accounts add column if not exists deposit_percent numeric(5,2) not null default 25;
-- When on, a daily cron nudges clients who were sent a quote but haven't approved
-- it, up to twice (~day 2 and day 5), texting when they have SMS consent and
-- emailing otherwise. Opt-in, default off.
alter table accounts add column if not exists quote_followups_enabled boolean not null default false;
-- Opt-in: automatically remind clients the day before a scheduled job (SMS/email).
alter table accounts add column if not exists appointment_reminders_enabled boolean not null default false;
-- Opt-in: route review asks through a "how'd we do?" gate — 4-5★ to Google, 1-3★ to private feedback.
alter table accounts add column if not exists review_gating_enabled boolean not null default false;
-- CAN-SPAM: the business's physical postal address. Shown in the footer of every
-- MARKETING email (campaign blasts, "book again", review asks). Required to send
-- a campaign broadcast; the automated marketing sends fall back to a platform
-- address (COMPANY_MAILING_ADDRESS) when a contractor hasn't set their own.
alter table accounts add column if not exists mailing_address text;
-- Opt-in: a once-daily "here's your business today" digest email to the owner
-- (money in, new leads, quotes approved, today's schedule, confirmations,
-- reviews, rebook nudges). Only sends on days with something to report.
alter table accounts add column if not exists daily_digest_enabled boolean not null default false;
-- The UTC date the digest was last sent, so a cron re-run in the same day is a
-- no-op (account-level idempotency; the daily cron is the only writer).
alter table accounts add column if not exists last_digest_date date;

-- Intake AI tuning + lead priority (see src/lib/estimate-posture.ts).
-- estimate_posture: biases the AI instant-estimate lower/higher — one of
-- 'budget' | 'lean' | 'balanced' | 'premium' | 'high' (default 'lean', the prior
-- hardcoded behavior).
alter table accounts add column if not exists estimate_posture text not null default 'lean';
-- A lead whose AI estimate could reach this dollar amount is treated as
-- HIGH-VALUE: escalated alerts + top-priority. 0/null = feature off.
alter table accounts add column if not exists high_value_lead_amount numeric(12,2);
-- Stop low-quality leads (out-of-area, excluded work, below-minimum, just-
-- researching) from firing owner alerts / the dashboard nag. They still land in
-- the leads board, just quietly.
alter table accounts add column if not exists mute_low_quality_leads boolean not null default true;
-- Also text the owner's own mobile the moment a high-value lead comes in.
alter table accounts add column if not exists high_value_sms_enabled boolean not null default false;
-- The owner's mobile for those urgent high-value alert texts (their own number;
-- entering it is the consent to be texted their own leads).
alter table accounts add column if not exists alert_phone text;

-- Public online-booking availability (the /book self-serve page). Replaces the
-- previously hardcoded Mon–Fri, 08:00/13:00, 4-jobs/day constants with per-owner
-- config. Defaults reproduce the old behavior exactly, so nothing changes until
-- an owner edits them (see src/lib/booking-availability.ts).
-- IANA timezone the owner operates in — used to compute bookable calendar days
-- correctly (the old server-local math offered the WRONG day after ~7pm on a UTC
-- host). Default US-Eastern; owners pick their own in Settings.
alter table accounts add column if not exists timezone text not null default 'America/New_York';
-- Bookable weekdays as a CSV of day numbers (0=Sun … 6=Sat). Default Mon–Fri.
alter table accounts add column if not exists booking_weekdays text not null default '1,2,3,4,5';
-- Offered arrival windows as a JSON array of start-time strings (subset of the
-- presets in booking-availability.ts; labels are derived there). Default morning+afternoon.
alter table accounts add column if not exists booking_windows jsonb not null default '["08:00","13:00"]'::jsonb;
-- A day already carrying this many scheduled jobs is treated as full (was DAY_CAPACITY).
alter table accounts add column if not exists booking_max_per_day integer not null default 4;
-- Soonest a customer may self-book, in days ahead (1 = from tomorrow, the old behavior).
alter table accounts add column if not exists booking_lead_days integer not null default 1;
-- Master on/off for self-serve online booking, flipped from the Automations list.
-- Off closes the public /book page's calendar without disturbing the weekday /
-- window / capacity setup underneath, so turning it back on restores exactly the
-- availability the contractor had configured. Defaults true = prior behavior.
alter table accounts add column if not exists booking_enabled boolean not null default true;

-- Value gate for instant booking. When ON, the /book page asks a couple of quick
-- questions for an instant AI estimate first, and only jobs at/above the floor
-- (and in-area / work-you-take) can grab a slot; everyone else is routed to a
-- graceful "request a callback" instead of a hard no. OFF by default = booking
-- stays open to everyone exactly as before.
alter table accounts add column if not exists instant_book_enabled boolean not null default false;
-- Minimum estimated job value ($) to self-book a premium slot. 0 = no floor.
alter table accounts add column if not exists instant_book_min_amount numeric(12,2) not null default 0;
-- Geocoded coordinates of the business mailing_address — the service-area center
-- and a cold-start "home base" anchor for route-density batching. Populated
-- best-effort when the mailing address is saved (see src/lib/geocode.ts). Null
-- until geocoded / when geocoding is unavailable.
alter table accounts add column if not exists service_center_lat numeric;
alter table accounts add column if not exists service_center_lng numeric;
-- Batch/service radius (miles) for instant-booking route-density: how near an
-- existing stop counts as "already in the area". Doubles as the geo service-area
-- radius. Default 15.
alter table accounts add column if not exists instant_book_radius_miles numeric not null default 15;
-- Route-density mode: 'prefer' (nearby days first, others still bookable) or
-- 'restrict' (only days near an existing stop are premium-bookable).
alter table accounts add column if not exists instant_book_geo_mode text not null default 'prefer';
-- When on, rank "nearby" by REAL driving distance/time (Google Distance Matrix)
-- instead of straight-line miles. Costs a Distance Matrix call per eligible
-- booking and needs that API enabled on the key; falls back to haversine if not.
-- Off by default.
alter table accounts add column if not exists instant_book_drive_time boolean not null default false;

-- EXTRA STOP — a same-day / within-24h "add me to the end of your route" path
-- that runs ALONGSIDE standard instant booking with its OWN limits and rules.
-- The contractor reviews each request, proposes an arrival window, and sets a
-- separate Extra Stop fee; the customer pays only after approving the time and
-- price. All config is per-account and OFF by default so nothing changes until
-- an owner opts in (see src/lib/extra-stop.ts). Fees are stored in CENTS to
-- avoid float drift (matches the payment_plans convention).
alter table accounts add column if not exists extra_stop_enabled boolean not null default false;
-- Eligible weekdays as a CSV of day numbers (0=Sun … 6=Sat). Default Mon–Fri.
alter table accounts add column if not exists extra_stop_weekdays text not null default '1,2,3,4,5';
-- Earliest time an Extra Stop arrival window may START (HH:MM, 24h, owner's tz).
alter table accounts add column if not exists extra_stop_earliest_time text not null default '08:00';
-- Latest time an Extra Stop arrival window may END (HH:MM, 24h, owner's tz).
alter table accounts add column if not exists extra_stop_latest_end text not null default '20:00';
-- Separate daily cap. Extra Stops do NOT count toward booking_max_per_day.
alter table accounts add column if not exists extra_stop_max_per_day integer not null default 2;
-- Longest visit (minutes) an Extra Stop may qualify for. Longer ⇒ excluded.
alter table accounts add column if not exists extra_stop_max_visit_minutes integer not null default 60;
-- Max route detour the contractor will accept, in miles and in minutes.
alter table accounts add column if not exists extra_stop_max_detour_miles numeric not null default 10;
alter table accounts add column if not exists extra_stop_max_detour_minutes integer not null default 20;
-- Fee guardrails (CENTS). The contractor sets the exact fee per request, but it
-- must land within [min,max]. Defaults $50–$250.
alter table accounts add column if not exists extra_stop_min_fee_cents integer not null default 5000;
alter table accounts add column if not exists extra_stop_max_fee_cents integer not null default 25000;
-- Allow Extra Stops even once the normal daily booking capacity is reached.
alter table accounts add column if not exists extra_stop_allow_after_capacity boolean not null default true;
-- Contractor must respond to a request within this many minutes (spec default 30).
alter table accounts add column if not exists extra_stop_response_deadline_mins integer not null default 30;
-- Customer must pay within this many minutes of the offer (spec default 15).
-- NB: enforced app-side — Stripe Checkout's own minimum expiry is 30 min.
alter table accounts add column if not exists extra_stop_payment_deadline_mins integer not null default 15;
-- Allowed service categories as a CSV of free-form tags. Empty = all allowed.
alter table accounts add column if not exists extra_stop_categories text not null default '';
-- How many intake photos the customer must attach for an Extra Stop request.
alter table accounts add column if not exists extra_stop_required_photos integer not null default 1;
-- Require the AI eligibility check to pass before Extra Stop is offered.
alter table accounts add column if not exists extra_stop_require_ai_approval boolean not null default true;

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
  photo_path    text,
  user_id       uuid references auth.users(id) on delete set null,
  active        boolean not null default true,
  deleted_at    timestamptz,
  created_at    timestamptz not null default now()
);

alter table crew add column if not exists photo_path text;
alter table crew add column if not exists deleted_at timestamptz;
-- Email is the crew member's login handle for the mobile field app (magic-link
-- sign-in matches this to link their auth user). Optional: crew without an email
-- simply can't be invited to the field app yet.
alter table crew add column if not exists email text;
create index if not exists crew_email_idx on crew (account_id, lower(email));

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
  client_email  text,
  address       text,
  scope         text,
  status        job_status not null default 'in_progress',

  lead_source   lead_source,
  scheduled_for date,
  scheduled_time time,
  estimated_hours numeric(8,2),

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
alter table jobs add column if not exists estimated_hours numeric(8,2);
-- Itemized quote: an array of line items, each a base (always included) or an
-- optional add-on the client can accept. When present, quoted_amount is the
-- computed total (base + selected add-ons). Null/empty = legacy single-amount
-- quote, still fully supported.
alter table jobs add column if not exists quote_items jsonb;
alter table jobs add column if not exists client_email text;
-- Deposit gate: 'before_schedule' blocks the client from picking a start date
-- until a deposit payment is paid; 'before_work' is a reminder only. Null = none.
alter table jobs add column if not exists deposit_gate text;
-- Geocoded coordinates of the job address — the anchors for instant-booking
-- route-density ("we'll already be near you that day"). Populated best-effort at
-- job create (see src/lib/geocode.ts); only precise (rooftop/interpolated)
-- results are stored, so a city-centroid never fakes proximity. Null when
-- geocoding is unavailable or imprecise. geocoded_at caches the attempt.
alter table jobs add column if not exists lat numeric;
alter table jobs add column if not exists lng numeric;
alter table jobs add column if not exists geocoded_at timestamptz;

-- ----------------------------------------------------------------------------
-- CLIENTS  — a first-class, deduped customer record. A job's client_name/phone/
-- email are still the per-job snapshot; client_id links the job to the unified
-- profile (repeat-customer history, notes). Created/matched on job creation and
-- backfilled from existing jobs.
-- ----------------------------------------------------------------------------
create table if not exists clients (
  id           uuid primary key default gen_random_uuid(),
  account_id   uuid not null references accounts(id) on delete cascade,
  name         text not null,
  phone        text,
  email        text,
  address      text,
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists clients_account_phone_idx on clients (account_id, phone);
create index if not exists clients_account_email_idx on clients (account_id, email);
-- Last time we sent this client a "book again" re-engagement invite (repeat outreach).
alter table clients add column if not exists last_rebook_invite_at timestamptz;

-- Link jobs to their client profile (set on create + backfill). ON DELETE SET
-- NULL: removing a client never cascades away the job history.
alter table jobs add column if not exists client_id uuid references clients(id) on delete set null;
create index if not exists jobs_client_id_idx on jobs (client_id);

-- Set when a client texts "C" back to an appointment reminder to confirm.
alter table jobs add column if not exists appointment_confirmed_at timestamptz;

-- ----------------------------------------------------------------------------
-- JOB_TASKS  — per-job checklist / punch list. Owner sets the list; crew tick
-- items off from the field app (done_by/done_at record who + when).
-- ----------------------------------------------------------------------------
create table if not exists job_tasks (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references accounts(id) on delete cascade,
  job_id      uuid not null references jobs(id) on delete cascade,
  title       text not null,
  done        boolean not null default false,
  done_at     timestamptz,
  done_by     text,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists job_tasks_job_idx on job_tasks (account_id, job_id, sort_order);

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

  client_charge_payment_id uuid,
  client_charge_requested_at timestamptz,

  crew_id       uuid references crew(id) on delete set null,
  crew_name     text,
  crew_role_label text,
  hours         numeric(8,2),
  rate          numeric(10,2),

  created_at    timestamptz not null default now()
);

alter table costs add column if not exists crew_name text;
alter table costs add column if not exists crew_role_label text;
alter table costs add column if not exists client_charge_payment_id uuid;
alter table costs add column if not exists client_charge_requested_at timestamptz;

update costs
set crew_name = coalesce(costs.crew_name, crew.name),
    crew_role_label = coalesce(costs.crew_role_label, crew.role_label)
from crew
where costs.crew_id = crew.id
  and costs.account_id = crew.account_id
  and costs.type = 'labor'
  and (costs.crew_name is null or costs.crew_role_label is null);

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
  title         text,
  visibility    text not null default 'internal' check (visibility in ('internal','client','client_financial')),
  amount        numeric(12,2),
  source_table  text,
  source_id     uuid,
  action_url    text,
  published_at  timestamptz,
  created_at    timestamptz not null default now()
);

alter table job_feed add column if not exists title text;
alter table job_feed add column if not exists visibility text not null default 'internal';
alter table job_feed add column if not exists amount numeric(12,2);
alter table job_feed add column if not exists source_table text;
alter table job_feed add column if not exists source_id uuid;
alter table job_feed add column if not exists action_url text;
alter table job_feed add column if not exists published_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'job_feed_visibility_check'
  ) then
    alter table job_feed add constraint job_feed_visibility_check
      check (visibility in ('internal','client','client_financial'));
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- CLIENT_JOB_ACCESS  — revocable public job dashboard links.
-- ----------------------------------------------------------------------------
create table if not exists client_job_access (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid not null references accounts(id) on delete cascade,
  job_id        uuid not null references jobs(id) on delete cascade,
  token_hash    text not null unique,
  client_email  text,
  client_phone  text,
  expires_at    timestamptz,
  revoked_at    timestamptz,
  last_viewed_at timestamptz,
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

-- Invoice polish: an optional discount (% of subtotal) and tax (% of the
-- discounted subtotal). total is recomputed server-side as
-- subtotal - discount + tax, so every reader stays correct. Default 0 = the
-- legacy "total is just the sum of items" behavior.
alter table invoices add column if not exists discount_percent numeric(5,2) not null default 0;
alter table invoices add column if not exists tax_rate numeric(5,2) not null default 0;

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
  paid_at                  timestamptz,

  -- Running total refunded on this payment (partial refunds accumulate). The row
  -- stays `paid` until this reaches `amount`, then flips to `refunded`.
  refunded_amount          numeric(12,2) not null default 0
);

-- Safe to re-run: adds columns if this table already existed pre-migration.
alter table payments add column if not exists platform_fee numeric(12,2);
alter table payments add column if not exists fee_rate numeric(6,4);
alter table payments add column if not exists stripe_checkout_session text;
alter table payments add column if not exists homeowner_phone text;
alter table payments add column if not exists sms_consent boolean not null default false;
alter table payments add column if not exists sms_consent_at timestamptz;
-- Chargeback tracking (see the `disputed` payment_status value above).
alter table payments add column if not exists disputed_at timestamptz;
alter table payments add column if not exists dispute_reason text;
alter table payments add column if not exists dispute_status text;
-- Partial-refund tracking. A payment stays `paid` while partially refunded and
-- only becomes `refunded` once refunded_amount reaches amount.
alter table payments add column if not exists refunded_amount numeric(12,2) not null default 0;

-- Historical payments brought in via the CRM import (migrated from another
-- tool). They're real history but NOT new processed volume, so they're excluded
-- from the trailing-12mo platform-fee bracket (see getTrailingVolume) and never
-- touch Stripe/payouts/SMS.
alter table payments add column if not exists imported boolean not null default false;

-- Recurring-charge DUNNING. When an off-session saved-card charge fails, capture
-- the decline, then either schedule automated retries (transient declines like
-- insufficient_funds) or route it to a client "update your card" link (expired
-- card, SCA / authentication_required — a blind retry can never succeed).
-- recurring_plan_id links a payment back to its plan so a retry can find the
-- saved card (a plain payments row otherwise has no path to the plan).
alter table payments add column if not exists recurring_plan_id uuid references recurring_plans(id) on delete set null;
alter table payments add column if not exists failure_code text;      -- Stripe error code (card_declined, authentication_required, expired_card, …)
alter table payments add column if not exists failure_message text;   -- decline_code / human message
alter table payments add column if not exists failed_at timestamptz;  -- first failure time (preserved across retries)
alter table payments add column if not exists dunning_attempts int not null default 0;  -- retries in the CURRENT backoff cycle (reset when the client updates their card)
alter table payments add column if not exists charge_attempts int not null default 0;   -- LIFETIME charge attempts, never reset — seeds the idempotency key + a hard cap
alter table payments add column if not exists next_retry_at timestamptz;  -- next scheduled retry (null = none due)
alter table payments add column if not exists dunning_state text;     -- 'scheduled' | 'needs_card' | 'exhausted' | 'recovered'
-- The dunning sweep: failed recurring payments whose retry is due. Partial index
-- keeps it tiny (only rows actively awaiting a retry).
create index if not exists payments_dunning_due_idx on payments (next_retry_at) where dunning_state = 'scheduled';

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

-- Extend the ledger to also record CREW assignment/schedule texts (originally
-- payment-only). Idempotent / re-runnable. All metadata-only or fast-validate.
alter table sms_events alter column payment_id drop not null;
alter table sms_events add column if not exists context text not null default 'payment';
-- ON DELETE CASCADE (not set null): a crew-context row with no crew_id would
-- violate sms_events_target_check below, so deleting a crew member must remove
-- its log rows rather than orphan them into an invalid state.
alter table sms_events add column if not exists crew_id uuid references crew(id) on delete cascade;

-- Repair an already-deployed crew_id FK that was created with ON DELETE SET NULL.
do $$
begin
  if exists (
    select 1 from pg_constraint c
    where c.conrelid = 'sms_events'::regclass and c.conname = 'sms_events_crew_id_fkey'
      and pg_get_constraintdef(c.oid) not ilike '%on delete cascade%'
  ) then
    alter table sms_events drop constraint sms_events_crew_id_fkey;
    alter table sms_events add constraint sms_events_crew_id_fkey
      foreign key (crew_id) references crew(id) on delete cascade;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sms_events_context_check') then
    alter table sms_events add constraint sms_events_context_check check (context in ('payment','crew'));
  end if;
end $$;

-- Replace the payment-only event_type check with a superset that also allows
-- crew events (distinctly named so re-runs are true no-ops).
alter table sms_events drop constraint if exists sms_events_event_type_check;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sms_events_event_type_allowed') then
    alter table sms_events add constraint sms_events_event_type_allowed
      check (event_type in (
        'payment_requested','payment_paid','payment_failed','payment_refunded',
        'crew_assigned','crew_scheduled'
      ));
  end if;
end $$;

-- A row targets either a payment (payment_id) or a crew member (crew_id).
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sms_events_target_check') then
    alter table sms_events add constraint sms_events_target_check
      check (
        (context = 'payment' and payment_id is not null)
        or (context = 'crew' and crew_id is not null)
      );
  end if;
end $$;

create index if not exists sms_events_account_crew_idx
  on sms_events (account_id, crew_id, created_at desc)
  where crew_id is not null;

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
-- JOB SCHEDULE REQUESTS - contractor-proposed dates clients can choose from.
-- ----------------------------------------------------------------------------
create table if not exists job_schedule_requests (
  id                uuid primary key default gen_random_uuid(),
  account_id        uuid not null references accounts(id) on delete cascade,
  job_id            uuid not null references jobs(id) on delete cascade,
  token_hash        text not null unique,
  client_phone      text,
  options           jsonb not null default '[]'::jsonb,
  status            text not null default 'open' check (status in ('open','selected','needs_more_options','revoked')),
  selected_index    int,
  selected_date     date,
  selected_time     time,
  client_notes      text,
  sent_at           timestamptz,
  responded_at      timestamptz,
  expires_at        timestamptz,
  created_at        timestamptz not null default now()
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
  estimated_hours numeric(8,2),
  quote_visit   jsonb,
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
alter table leads add column if not exists estimated_hours numeric(8,2);
alter table leads add column if not exists quote_visit jsonb;
alter table leads add column if not exists photo_paths jsonb not null default '[]'::jsonb;
alter table leads add column if not exists source_page text;
alter table leads add column if not exists updated_at timestamptz not null default now();
-- Lead triage (2026-07-23): AI/rule scoring + prune flags + snooze/archive.
-- { score: 'hot'|'warm'|'low', flags: string[], timeline, location,
--   estimate: {min,max}|null, phoneVerified, snoozedUntil, archived, declinedReason }
alter table leads add column if not exists triage jsonb;
-- Link leads (incl. bookings) to the unified client profile from intake, so a
-- customer's leads and jobs collapse into one timeline. ON DELETE SET NULL.
alter table leads add column if not exists client_id uuid references clients(id) on delete set null;
create index if not exists leads_client_id_idx on leads (client_id);
-- Geocoded coordinates of the lead address (2026-07-29): pins on the dashboard
-- map across leads, jobs & schedule so nearby estimates and jobs can be batched.
-- Populated best-effort at intake (see src/lib/geocode.ts), precise-only, same as
-- jobs; null when geocoding is unavailable or imprecise. geocoded_at caches the attempt.
alter table leads add column if not exists lat numeric;
alter table leads add column if not exists lng numeric;
alter table leads add column if not exists geocoded_at timestamptz;

-- Contacts an owner has blocked from submitting new website leads. Matching
-- submissions are silently dropped (the visitor still sees success).
create table if not exists lead_blocklist (
  id           uuid primary key default gen_random_uuid(),
  account_id   uuid not null references accounts(id) on delete cascade,
  phone        text,
  email        text,
  reason       text,
  created_at   timestamptz not null default now()
);
alter table lead_blocklist enable row level security;
drop policy if exists lead_blocklist_all on lead_blocklist;
create policy lead_blocklist_all on lead_blocklist for all using ( is_owner(account_id) );
create index if not exists lead_blocklist_account_idx on lead_blocklist (account_id, created_at desc);

-- ----------------------------------------------------------------------------
-- HELPFUL VIEW  — per-job margin, computed (never stored).
-- ----------------------------------------------------------------------------
drop view if exists job_margins;
-- security_invoker: the view runs with the QUERYING user's RLS, not the view
-- owner's. Without this a crew member could read every job's margin straight
-- from the view (bypassing the per-table crew policies); with it, they see only
-- rows their own RLS allows (their assigned jobs), and owners still see all.
create view job_margins with (security_invoker = true) as
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

-- ----------------------------------------------------------------------------
-- SMS MESSAGES  — the two-way threaded inbox. Every inbound customer text and
-- every reply sent from the inbox is stored here, grouped by (account, phone).
-- ----------------------------------------------------------------------------
create table if not exists sms_messages (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid not null references accounts(id) on delete cascade,
  phone_number  text not null,
  direction     text not null check (direction in ('inbound','outbound')),
  body          text not null,
  provider_id   text,
  created_at    timestamptz not null default now()
);
create index if not exists sms_messages_thread_idx on sms_messages (account_id, phone_number, created_at desc);

-- ----------------------------------------------------------------------------
-- MESSAGE_TEMPLATES  — saved canned replies for the two-way inbox
-- ("On my way", "Running late"), inserted into a reply with one tap.
-- ----------------------------------------------------------------------------
create table if not exists message_templates (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references accounts(id) on delete cascade,
  title       text not null,
  body        text not null,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists message_templates_account_idx on message_templates (account_id, sort_order);

-- ----------------------------------------------------------------------------
-- CAMPAIGNS  — one-off email/SMS broadcasts to past clients. Stores the message
-- plus per-channel outcome counts (no per-recipient rows: the two-way inbox
-- already threads the SMS sends, and a contractor's list is small enough that
-- aggregate stats are what the history view needs).
-- ----------------------------------------------------------------------------
create table if not exists campaigns (
  id              uuid primary key default gen_random_uuid(),
  account_id      uuid not null references accounts(id) on delete cascade,
  channel         text not null check (channel in ('email','sms','both')),
  audience        text not null,
  subject         text,
  body            text not null,
  recipient_count integer not null default 0,
  email_sent      integer not null default 0,
  sms_sent        integer not null default 0,
  failed_count    integer not null default 0,
  skipped_count   integer not null default 0,
  created_at      timestamptz not null default now()
);
create index if not exists campaigns_account_idx on campaigns (account_id, created_at desc);

-- ----------------------------------------------------------------------------
-- RECURRING_PLANS  — repeating service agreements (lawn care, cleaning, pool).
-- Each due plan spawns a scheduled job on its cadence; when auto_charge is on
-- and a card is saved, that visit is charged off-session. The card lives on a
-- platform Stripe customer (destination-charge model), so charges transfer to
-- the connected account exactly like the one-off pay flow.
-- ----------------------------------------------------------------------------
create table if not exists recurring_plans (
  id                        uuid primary key default gen_random_uuid(),
  account_id                uuid not null references accounts(id) on delete cascade,
  client_id                 uuid references clients(id) on delete set null,
  title                     text not null,
  scope                     text,
  client_name               text not null,
  client_phone              text,
  client_email              text,
  address                   text,
  amount                    numeric(12,2) not null default 0,
  frequency                 text not null check (frequency in ('weekly','biweekly','monthly')),
  next_run_date             date not null,
  active                    boolean not null default true,
  auto_charge               boolean not null default false,
  stripe_customer_id        text,
  stripe_payment_method_id  text,
  card_brand                text,
  card_last4                text,
  last_job_id               uuid references jobs(id) on delete set null,
  last_run_at               timestamptz,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);
create index if not exists recurring_plans_due_idx on recurring_plans (account_id, active, next_run_date);
-- Optional fixed term: the plan stops after this many visits (decremented on
-- each spawn; deactivated at 0). Null = ongoing.
alter table recurring_plans add column if not exists remaining_cycles int;

-- ----------------------------------------------------------------------------
-- PAYMENT PLANS — split an existing quote total into a deposit + fixed,
-- 0%-interest installments. This is NOT lending/financing: no interest, no
-- fees, no credit check, no contractor advance. The plan only ALLOCATES the
-- quote total across scheduled charges; it never increases it. Reuses the same
-- Stripe Connect destination-charge rails as one-off payments — each
-- installment is a `payments` row (kind='plan_installment') charged off-session
-- against the card saved when the deposit was collected.
-- ----------------------------------------------------------------------------
create table if not exists payment_plans (
  id                        uuid primary key default gen_random_uuid(),
  account_id                uuid not null references accounts(id) on delete cascade,
  job_id                    uuid not null references jobs(id) on delete cascade,

  -- All money in integer cents so allocation never drifts: the deposit + every
  -- installment sum to EXACTLY total_cents (rounding lands in the final one).
  total_cents               int  not null,
  deposit_cents             int  not null,
  installment_count         int  not null,   -- installments AFTER the deposit
  frequency                 text not null default 'monthly'
    check (frequency in ('weekly','biweekly','monthly')),
  first_installment_date    date not null,

  -- pending_deposit → active (deposit webhook-confirmed) → paid_off | canceled.
  status                    text not null default 'pending_deposit'
    check (status in ('pending_deposit','active','paid_off','canceled')),

  -- Card saved off-session when the deposit was paid (platform customer, like
  -- recurring_plans; installments then transfer to the connected account).
  stripe_customer_id        text,
  stripe_payment_method_id  text,
  card_brand                text,
  card_last4                text,

  -- The client's typed-name authorization for automatic installment charges.
  authorized_at             timestamptz,
  authorized_name           text,

  -- Set atomically while an early payoff is in flight so the installment cron
  -- pauses collections on this plan; cleared if the payoff is abandoned.
  payoff_locked_at          timestamptz,

  deposit_payment_id        uuid references payments(id) on delete set null,

  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);
create index if not exists payment_plans_job_idx on payment_plans (job_id);

-- Link installment (+ deposit / payoff) payment rows back to their plan, plus
-- the installment's scheduled due date and order. Added here — after
-- payment_plans exists — so the FK resolves on a fresh deploy.
alter table payments add column if not exists payment_plan_id uuid references payment_plans(id) on delete set null;
alter table payments add column if not exists due_date date;         -- installment due date (null for deposit/payoff/one-offs)
alter table payments add column if not exists installment_seq int;   -- 1..N ordering within the plan
-- The installment sweep: due plan installments (requested = scheduled, or a
-- failed one awaiting retry). Partial index keeps it to just those rows.
create index if not exists payments_installment_due_idx on payments (due_date)
  where kind = 'plan_installment' and payment_plan_id is not null;

-- ----------------------------------------------------------------------------
-- SERVICES  — the account's price book: reusable named services + prices that
-- pre-fill quote line items and recurring plans, so owners stop retyping them.
-- ----------------------------------------------------------------------------
create table if not exists services (
  id           uuid primary key default gen_random_uuid(),
  account_id   uuid not null references accounts(id) on delete cascade,
  name         text not null,
  description  text,
  unit_price   numeric(12,2) not null default 0,
  unit         text not null default 'each',
  active       boolean not null default true,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists services_account_idx on services (account_id, active, sort_order);

-- ----------------------------------------------------------------------------
-- REVIEW_INVITES  — one row per gated review ask. The public /review/[token]
-- page reads by token; 4-5★ routes to google_url, 1-3★ captures private
-- feedback for the owner (never posted publicly).
-- ----------------------------------------------------------------------------
create table if not exists review_invites (
  id           uuid primary key default gen_random_uuid(),
  account_id   uuid not null references accounts(id) on delete cascade,
  job_id       uuid references jobs(id) on delete set null,
  token        text not null unique,
  client_name  text,
  google_url   text,
  rating       integer,
  feedback     text,
  routed_to    text,
  created_at   timestamptz not null default now(),
  responded_at timestamptz
);
create index if not exists review_invites_token_idx on review_invites (token);

-- ----------------------------------------------------------------------------
-- EMAIL_SUPPRESSION — email addresses that opted out of an account's MARKETING
-- email (campaign blasts, "book again", review asks). CAN-SPAM: unsubscribes
-- must be honored. Keyed by (account_id, lower(email)); both the unsubscribe
-- link / one-click POST and the send paths go through here. TRANSACTIONAL email
-- (receipts, quotes, invoices, reminders, card-setup) is exempt and never
-- consults this table.
-- ----------------------------------------------------------------------------
create table if not exists email_suppression (
  id           uuid primary key default gen_random_uuid(),
  account_id   uuid not null references accounts(id) on delete cascade,
  email        text not null,
  reason       text,
  created_at   timestamptz not null default now()
);
create unique index if not exists email_suppression_account_email_idx on email_suppression (account_id, lower(email));

-- ============================================================================
-- ROW-LEVEL SECURITY
-- ============================================================================
-- NOTE: is_member() is role-blind (owner OR crew). After the crew RLS tightening
-- NO policy uses it — every policy gates on is_owner() or a crew helper below.
-- It's retained only as a building block; do NOT reach for it in a new policy
-- (that would silently re-open crew access to whatever table it gates). Use
-- is_owner() for owner-only tables and the crew helpers for crew-scoped ones.
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

-- Role-aware helpers for CREW scoping. Everything sensitive is gated on
-- is_owner(); crew get a NARROW predicate: only their assigned jobs and their
-- own rows. All are security definer so the
-- lookups inside bypass RLS on memberships/crew/crew_assignments (no recursion).

-- The current auth user is a crew member (not owner) of this account.
create or replace function is_crew(acc uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from memberships m
    where m.account_id = acc and m.user_id = auth.uid() and m.role = 'crew'
  );
$$;

-- The current auth user is on the crew roster assigned to job j. This is how a
-- crew member is scoped to "only my jobs" at the DB level (previously enforced
-- only in application code).
create or replace function crew_on_job(j uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from crew_assignments ca
    join crew c on c.id = ca.crew_id
    where ca.job_id = j and c.user_id = auth.uid()
  );
$$;

-- A crew row (referenced by costs.crew_id / crew_assignments.crew_id) belongs to
-- the current auth user. Lets crew see ONLY their own costs/assignments, not a
-- coworker's pay rate or another crew's hours on a shared job.
create or replace function crew_owns_crew_row(cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from crew c where c.id = cid and c.user_id = auth.uid()
  );
$$;

-- The account a job belongs to, resolved bypassing RLS. Used in crew INSERT
-- WITH CHECK clauses to PIN the new row's account_id to the job's real account,
-- so a crew member can't insert a cost/feed/task carrying a foreign account_id
-- (cross-tenant write / margin injection) while pointing job_id at their own job.
create or replace function job_account_id(j uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select account_id from jobs where id = j;
$$;

-- Column-level guard for crew job UPDATEs. RLS can't restrict which columns a
-- policy lets through, and job_crew_update (needed so crew can flip status from
-- the field app) would otherwise let a crew member rewrite account_id (a tenant
-- move — the job vanishes from the real owner) or quoted_amount/quote_items
-- (margin + invoicing basis). This trigger constrains ONLY crew writers to
-- status-only updates; owners and the service-role/admin client (auth.uid() not
-- a crew member) pass through untouched.
create or replace function crew_jobs_update_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if is_crew(old.account_id)
     and (to_jsonb(new) - 'status') is distinct from (to_jsonb(old) - 'status') then
    raise exception 'crew may only change job status';
  end if;
  return new;
end;
$$;
drop trigger if exists crew_jobs_update_guard on jobs;
create trigger crew_jobs_update_guard before update on jobs
  for each row execute function crew_jobs_update_guard();

-- Short-lived soft holds for self-serve booking: closes the window where two
-- DIFFERENT visitors grab the same slot between the availability check and the
-- job insert. The unique index means only one live hold can exist per slot, so a
-- loser's insert raises 23505 and is bounced to ?error=slot_taken. Holds self-
-- expire (~1 min TTL); once the job is booked the window is unavailable anyway.
create table if not exists booking_holds (
  id             uuid primary key default gen_random_uuid(),
  account_id     uuid not null references accounts(id) on delete cascade,
  scheduled_for  date not null,
  scheduled_time text not null,
  expires_at     timestamptz not null,
  created_at     timestamptz not null default now()
);
create unique index if not exists booking_holds_slot_unique on booking_holds (account_id, scheduled_for, scheduled_time);

do $$
declare t text;
begin
  foreach t in array array[
    'accounts','memberships','crew','sites','jobs','crew_assignments',
    'costs','job_feed','client_job_access','invoices','payments','finance_plans','payment_plans','leads','sms_events','sms_consent','sms_messages','clients','campaigns','recurring_plans','services','review_invites','message_templates','job_tasks','job_schedule_requests','email_suppression','booking_holds'
  ] loop
    execute format('alter table %I enable row level security;', t);
  end loop;
end $$;

drop policy if exists acc_read on accounts;
drop policy if exists acc_write on accounts;
drop policy if exists mem_read on memberships;
drop policy if exists mem_manage on memberships;
-- crew: old single policy + new owner/self split
drop policy if exists crew_all on crew;
drop policy if exists crew_owner on crew;
drop policy if exists crew_self_read on crew;
-- sites: old single policy + new owner-only
drop policy if exists site_all on sites;
drop policy if exists site_owner on sites;
-- jobs: old single policy + new owner/crew split
drop policy if exists job_all on jobs;
drop policy if exists job_owner on jobs;
drop policy if exists job_crew_read on jobs;
drop policy if exists job_crew_update on jobs;
-- crew_assignments: old single policy + new owner/crew split
drop policy if exists asg_all on crew_assignments;
drop policy if exists asg_owner on crew_assignments;
drop policy if exists asg_crew_read on crew_assignments;
-- costs: old single policy + new owner/crew split
drop policy if exists cost_all on costs;
drop policy if exists cost_owner on costs;
drop policy if exists cost_crew_read on costs;
drop policy if exists cost_crew_insert on costs;
-- job_feed: old single policy + new owner/crew split
drop policy if exists feed_all on job_feed;
drop policy if exists feed_owner on job_feed;
drop policy if exists feed_crew_read on job_feed;
drop policy if exists feed_crew_insert on job_feed;
drop policy if exists client_access_all on client_job_access;
drop policy if exists inv_all on invoices;
drop policy if exists pay_all on payments;
drop policy if exists plan_all on finance_plans;
drop policy if exists lead_all on leads;
drop policy if exists sms_event_all on sms_events;
drop policy if exists sms_consent_all on sms_consent;
drop policy if exists sms_messages_all on sms_messages;
drop policy if exists clients_all on clients;
drop policy if exists campaigns_all on campaigns;
drop policy if exists recurring_plans_all on recurring_plans;
drop policy if exists payment_plans_all on payment_plans;
drop policy if exists services_all on services;
drop policy if exists review_invites_all on review_invites;
drop policy if exists message_templates_all on message_templates;
-- job_tasks: old single policy + prior crew combined policy + new owner/crew split
drop policy if exists job_tasks_all on job_tasks;
drop policy if exists job_tasks_owner on job_tasks;
drop policy if exists job_tasks_crew on job_tasks;
drop policy if exists job_tasks_crew_read on job_tasks;
drop policy if exists job_tasks_crew_insert on job_tasks;
drop policy if exists job_tasks_crew_update on job_tasks;
drop policy if exists job_schedule_request_all on job_schedule_requests;
drop policy if exists email_suppression_all on email_suppression;
drop policy if exists invitem_all on invoice_items;
drop policy if exists booking_holds_all on booking_holds;

-- ACCOUNTS: owners read + write. Crew do NOT read accounts — it holds Stripe
-- customer/connect ids, plan, subscription status, billing toggles. The field
-- app gets its branding (business name) via the admin client in requireCrewContext,
-- not by reading this table.
create policy acc_read   on accounts for select using ( is_owner(id) );
create policy acc_write  on accounts for update using ( is_owner(id) );

-- MEMBERSHIPS: owner-only. Crew never enumerate the member roster (their own
-- identity is resolved server-side via the admin client).
create policy mem_read   on memberships for select using ( is_owner(account_id) );
create policy mem_manage on memberships for all    using ( is_owner(account_id) );

-- CREW roster: owners manage everyone; a crew member may read ONLY their own row
-- (so createCost can snapshot their name/rate) — never a coworker's pay rate.
create policy crew_owner     on crew for all    using ( is_owner(account_id) );
create policy crew_self_read on crew for select using ( user_id = auth.uid() );

-- SITES: owner-only. The published website config isn't something crew edit or
-- need (branding comes from requireCrewContext).
create policy site_owner on sites for all using ( is_owner(account_id) );

-- JOBS: owners full access; crew may READ and UPDATE (status from the field) only
-- the jobs they're assigned to. (RLS can't restrict columns, so a crew member can
-- technically change non-status fields on THEIR assigned job — the field app only
-- writes status; owners see all changes in the job feed.)
create policy job_owner       on jobs for all    using ( is_owner(account_id) );
create policy job_crew_read   on jobs for select using ( crew_on_job(id) );
create policy job_crew_update on jobs for update using ( crew_on_job(id) ) with check ( crew_on_job(id) );

-- CREW_ASSIGNMENTS: owners manage; crew read only their OWN assignment rows
-- (this is the "my jobs" list). Crew never write assignments.
create policy asg_owner     on crew_assignments for all    using ( is_owner(account_id) );
create policy asg_crew_read on crew_assignments for select using ( crew_owns_crew_row(crew_id) );

-- COSTS: owners full access. Crew may INSERT time/materials on an assigned job,
-- attributed to themselves, and READ only their OWN cost rows — never a
-- coworker's labor rate or the job's full cost ledger / margin.
create policy cost_owner       on costs for all    using ( is_owner(account_id) );
create policy cost_crew_read   on costs for select using ( crew_owns_crew_row(crew_id) );
create policy cost_crew_insert on costs for insert with check ( crew_on_job(job_id) and crew_owns_crew_row(crew_id) and account_id = job_account_id(job_id) );

-- JOB_FEED: owners full access. Crew may READ and POST feed events on an assigned
-- job (status changes, field notes, client-shared updates) — nothing else.
create policy feed_owner       on job_feed for all    using ( is_owner(account_id) );
create policy feed_crew_read   on job_feed for select using ( crew_on_job(job_id) );
create policy feed_crew_insert on job_feed for insert with check ( crew_on_job(job_id) and account_id = job_account_id(job_id) );

create policy client_access_all on client_job_access for all using ( is_owner(account_id) );

-- Financials, CRM, comms, marketing config: OWNER-ONLY. Crew touch none of these.
create policy inv_all    on invoices         for all using ( is_owner(account_id) );
create policy pay_all    on payments         for all using ( is_owner(account_id) );
create policy plan_all   on finance_plans    for all using ( is_owner(account_id) );
-- Booking holds are written only by the admin client on the public booking path;
-- the owner policy just lets an owner read/manage their own rows.
create policy booking_holds_all on booking_holds for all using ( is_owner(account_id) );
create policy lead_all   on leads            for all using ( is_owner(account_id) );
create policy sms_event_all on sms_events     for all using ( is_owner(account_id) );
create policy sms_consent_all on sms_consent  for all using ( is_owner(account_id) );
create policy sms_messages_all on sms_messages for all using ( is_owner(account_id) );
create policy clients_all on clients          for all using ( is_owner(account_id) );
create policy campaigns_all on campaigns      for all using ( is_owner(account_id) );
create policy recurring_plans_all on recurring_plans for all using ( is_owner(account_id) );
create policy payment_plans_all on payment_plans for all using ( is_owner(account_id) );
create policy services_all on services        for all using ( is_owner(account_id) );
create policy review_invites_all on review_invites for all using ( is_owner(account_id) );
create policy message_templates_all on message_templates for all using ( is_owner(account_id) );
create policy job_schedule_request_all on job_schedule_requests for all using ( is_owner(account_id) );

-- JOB_TASKS: owners full access; crew may READ, ADD, and TICK tasks on an
-- assigned job — but NOT delete an owner's punch-list item (no crew DELETE
-- policy), and inserts/updates are pinned to the job's account.
create policy job_tasks_owner        on job_tasks for all    using ( is_owner(account_id) );
create policy job_tasks_crew_read    on job_tasks for select using ( crew_on_job(job_id) );
create policy job_tasks_crew_insert  on job_tasks for insert with check ( crew_on_job(job_id) and account_id = job_account_id(job_id) );
create policy job_tasks_crew_update  on job_tasks for update using ( crew_on_job(job_id) ) with check ( crew_on_job(job_id) and account_id = job_account_id(job_id) );

-- Owner-only: only owners send/manage marketing email, so only owners read/write
-- the opt-out list. Public unsubscribe writes go through the service-role client
-- (which bypasses RLS), so no anon policy is needed here.
create policy email_suppression_all on email_suppression for all using ( is_owner(account_id) );

alter table invoice_items enable row level security;
create policy invitem_all on invoice_items for all using (
  exists (select 1 from invoices i where i.id = invoice_id and is_owner(i.account_id))
);

-- ----------------------------------------------------------------------------
-- PUSH_SUBSCRIPTIONS — Web Push endpoints for the crew field app (PWA). One row
-- per browser/device a crew member enables notifications on. Written and read
-- through the service-role client (the field subscribe action + the sender), so
-- the only RLS policy is owner visibility; crew never query this table directly.
-- ----------------------------------------------------------------------------
create table if not exists push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references accounts(id) on delete cascade,
  crew_id     uuid references crew(id) on delete cascade,
  endpoint    text not null,
  p256dh      text not null,
  auth        text not null,
  user_agent  text,
  created_at  timestamptz not null default now(),
  unique (endpoint)
);
create index if not exists push_subscriptions_crew_idx on push_subscriptions (account_id, crew_id);
alter table push_subscriptions enable row level security;
drop policy if exists push_subscriptions_owner on push_subscriptions;
create policy push_subscriptions_owner on push_subscriptions for all using ( is_owner(account_id) );

-- ============================================================================
-- INDEXES worth having from day one
-- ============================================================================
create index if not exists jobs_account_id_status_idx on jobs (account_id, status);
create index if not exists costs_job_id_idx on costs (job_id);
create index if not exists job_feed_job_id_created_at_idx on job_feed (job_id, created_at);
create index if not exists job_feed_account_job_created_at_idx on job_feed (account_id, job_id, created_at desc);
create unique index if not exists job_feed_source_once_idx on job_feed (source_table, source_id, kind) where source_table is not null and source_id is not null;
create index if not exists client_job_access_job_id_idx on client_job_access (job_id, revoked_at, created_at desc);
create index if not exists invoices_job_id_idx on invoices (job_id);
create index if not exists payments_job_id_status_idx on payments (job_id, status);
create index if not exists crew_assignments_crew_id_idx on crew_assignments (crew_id);
create index if not exists memberships_user_id_idx on memberships (user_id);
create index if not exists leads_account_id_status_created_at_idx on leads (account_id, status, created_at desc);
create index if not exists sms_events_account_payment_idx on sms_events (account_id, payment_id, created_at desc);
create index if not exists sms_consent_phone_idx on sms_consent (phone_number, status);
create index if not exists job_schedule_requests_job_id_idx on job_schedule_requests (job_id, status, created_at desc);

-- ============================================================================
-- EXTRA STOP — requests + append-only audit log
-- ============================================================================
-- One row per customer Extra Stop request. It carries its OWN lifecycle (see the
-- status check) distinct from job_status: a request only becomes a real job (the
-- confirmed appointment) once payment succeeds, at which point job_id is set.
-- Money in CENTS. Timestamps in UTC; display in the account's configured tz.
create table if not exists extra_stop_requests (
  id                      uuid primary key default gen_random_uuid(),
  account_id              uuid not null references accounts(id) on delete cascade,
  client_id               uuid references clients(id) on delete set null,
  job_id                  uuid references jobs(id) on delete set null,
  status                  text not null default 'awaiting_contractor'
    check (status in (
      'requested','awaiting_contractor','more_information_requested','contractor_declined',
      'contractor_offer_sent','awaiting_customer_payment','offer_expired','customer_declined',
      'confirmed','en_route','arrived','completed','customer_canceled','contractor_canceled',
      'no_show_reported','no_show_confirmed','refunded','disputed'
    )),
  -- customer + location
  client_name             text not null,
  client_phone            text,
  client_email            text,
  address                 text,
  lat                     numeric,
  lng                     numeric,
  -- AI qualification snapshot (intake answers + generated verdict)
  intake                  jsonb not null default '{}'::jsonb,
  photo_paths             jsonb not null default '[]'::jsonb,
  ai_summary              text,
  ai_visit_minutes        integer,
  ai_complexity           text,
  ai_eligible             boolean,
  ai_confidence           numeric,
  ai_exclusions           text[] not null default '{}',
  -- customer-submitted acceptable availability (NOT a guaranteed chosen slot)
  availability            jsonb not null default '[]'::jsonb,
  -- route cost vs the contractor's LAST scheduled stop that day
  detour_miles            numeric,
  detour_minutes          integer,
  route_extension_minutes integer,
  -- contractor offer
  arrival_date            date,
  arrival_start           time,
  arrival_end             time,
  fee_cents               integer,
  diagnostic_fee_cents    integer,
  offer_visit_minutes     integer,
  contractor_note         text,
  -- payment + refunds (the actual charge reuses the payments table)
  payment_id              uuid references payments(id) on delete set null,
  refund_cents            integer not null default 0,
  -- arrival verification (location captured only when permission is granted)
  arrival_lat             numeric,
  arrival_lng             numeric,
  -- lifecycle timestamps (UTC)
  response_deadline_at    timestamptz,
  offer_sent_at           timestamptz,
  payment_deadline_at     timestamptz,
  hold_expires_at         timestamptz,
  paid_at                 timestamptz,
  en_route_at             timestamptz,
  arrived_at              timestamptz,
  completed_at            timestamptz,
  canceled_at             timestamptz,
  cancel_reason           text,
  no_show_reported_at     timestamptz,
  no_show_confirmed_at    timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);
create index if not exists extra_stop_requests_account_status_idx on extra_stop_requests (account_id, status, created_at desc);
create index if not exists extra_stop_requests_account_arrival_idx on extra_stop_requests (account_id, arrival_date);
create index if not exists extra_stop_requests_job_idx on extra_stop_requests (job_id);

-- Append-only audit trail of every state change / action on a request. Cheap to
-- keep from day one; it's the seed for the deferred admin dispute/audit view.
create table if not exists extra_stop_events (
  id           uuid primary key default gen_random_uuid(),
  account_id   uuid not null references accounts(id) on delete cascade,
  request_id   uuid not null references extra_stop_requests(id) on delete cascade,
  actor        text not null,            -- 'customer' | 'contractor' | 'system' | 'stripe'
  from_status  text,
  to_status    text,
  meta         jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);
create index if not exists extra_stop_events_request_idx on extra_stop_events (request_id, created_at);

alter table extra_stop_requests enable row level security;
alter table extra_stop_events enable row level security;
drop policy if exists extra_stop_requests_owner on extra_stop_requests;
drop policy if exists extra_stop_events_owner on extra_stop_events;
-- Owner-only visibility. Public writes (a customer creating a request, the Stripe
-- webhook confirming payment) go through the service-role client, which bypasses
-- RLS — the same pattern used by booking_holds / leads.
create policy extra_stop_requests_owner on extra_stop_requests for all using ( is_owner(account_id) );
create policy extra_stop_events_owner on extra_stop_events for all using ( is_owner(account_id) );

-- Extra Stop Phase 2: editable refund tiers, revised-window negotiation, and
-- on-site diagnostic conversion. All additive/nullable — nothing changes until
-- a contractor uses these paths.
-- Per-account refund-tier overrides (percent + grace minutes) as JSON; null =
-- the built-in defaults (see src/lib/extra-stop-refunds.ts).
alter table accounts add column if not exists extra_stop_refund_tiers jsonb;
-- Revised arrival window a contractor proposes AFTER confirmation. The customer
-- must explicitly accept before it replaces the live window; otherwise the
-- original stands (no silent extension).
alter table extra_stop_requests add column if not exists proposed_arrival_date date;
alter table extra_stop_requests add column if not exists proposed_arrival_start time;
alter table extra_stop_requests add column if not exists proposed_arrival_end time;
alter table extra_stop_requests add column if not exists proposed_window_at timestamptz;
-- On-site diagnostic conversion: contractor proposes turning the visit into a
-- diagnostic appointment; the customer must approve applying the Extra Stop fee
-- as a deposit + any extra diagnostic charge before it takes effect.
alter table extra_stop_requests add column if not exists diagnostic_conversion text; -- null | proposed | approved | declined
alter table extra_stop_requests add column if not exists diagnostic_proposed_cents integer;
alter table extra_stop_requests add column if not exists diagnostic_note text;
alter table extra_stop_requests add column if not exists diagnostic_payment_id uuid references payments(id) on delete set null;
alter table extra_stop_requests add column if not exists diagnostic_decided_at timestamptz;

-- ============================================================================
-- ADMIN CONSOLE (/admin) — internal staff surface
-- ============================================================================
-- Append-only audit trail of every MUTATING action a staff member takes in the
-- internal console (refund, no-show lockout, account credit, suspend, resolve a
-- dispute). Written BEFORE any write feature is built on top of it, so nothing
-- touches customer money without a record of who did it. Staff identity is the
-- env allowlist (ADMIN_EMAILS), not a DB role — admin_email is that address.
create table if not exists admin_actions (
  id           uuid primary key default gen_random_uuid(),
  admin_email  text not null,
  action       text not null,           -- e.g. 'extra_stop_refund', 'account_suspend'
  account_id   uuid references accounts(id) on delete set null,
  target_type  text,                    -- 'extra_stop_request' | 'payment' | 'account' | ...
  target_id    text,
  meta         jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);
create index if not exists admin_actions_created_idx on admin_actions (created_at desc);
create index if not exists admin_actions_account_idx on admin_actions (account_id, created_at desc);
-- RLS on with NO policy: unreachable via the anon/authed keys. Only the
-- service-role client (used inside requireAdmin's context) can read/write it.
alter table admin_actions enable row level security;

-- Platform-issued account credits (e.g. the goodwill credit on a verified Extra
-- Stop no-show). A ledger, not a mutable balance: the current balance is the sum
-- of amount_cents for an account. Positive = credit granted, negative = credit
-- consumed/reversed. Issued only from the admin console; never contractor-writable.
create table if not exists account_credits (
  id           uuid primary key default gen_random_uuid(),
  account_id   uuid not null references accounts(id) on delete cascade,
  amount_cents integer not null,        -- signed; grant > 0, reversal < 0
  reason       text not null,
  source       text not null default 'admin',  -- 'admin' | 'extra_stop_no_show' | ...
  created_by   text,                    -- admin_email when staff-issued
  meta         jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);
create index if not exists account_credits_account_idx on account_credits (account_id, created_at desc);
-- Owners may READ their own credit ledger (to show a balance); only the
-- service-role admin path writes it.
alter table account_credits enable row level security;
drop policy if exists account_credits_owner_read on account_credits;
create policy account_credits_owner_read on account_credits for select using ( is_owner(account_id) );

-- Extra Stop no-show governance (admin-driven). A verified no-show can escalate
-- to a temporary lock on the contractor's Extra Stop feature; the console sets
-- these and can clear them (override). Null lock = not locked. Distinct from the
-- owner's own extra_stop_enabled toggle so staff action is never silently undone.
alter table accounts add column if not exists extra_stop_locked_until timestamptz;
alter table accounts add column if not exists extra_stop_lock_reason text;

-- Account suspension (admin-driven, Trust & Safety). A suspended account is
-- blocked from the owner dashboard (see requireOwnerContext) until staff lift it.
-- Distinct from the 'suspended' plan_tier so suspending never clobbers the real
-- billing plan. Null = active.
alter table accounts add column if not exists suspended_at timestamptz;
alter table accounts add column if not exists suspended_reason text;
alter table accounts add column if not exists suspended_by text;

-- Dispute tracking for the admin console. The webhook already flips a disputed
-- payment's status; these let staff jump straight to Stripe's dispute-response UI
-- and see the evidence deadline. dispute_due_by is Stripe's evidence_details.due_by.
alter table payments add column if not exists stripe_dispute_id text;
alter table payments add column if not exists dispute_due_by timestamptz;

-- ============================================================================
-- AVAILABILITY — working hours, per-job buffer, and manual time-off blocks.
-- ============================================================================
-- Real working-hours window (used to bound offered arrival windows) and a
-- travel/lunch buffer added to each job's footprint when computing daily capacity
-- (schedule_day_hours is the hours/day cap). Defaults reproduce prior behavior.
alter table accounts add column if not exists workday_start time not null default '08:00';
alter table accounts add column if not exists workday_end time not null default '17:00';
alter table accounts add column if not exists job_buffer_minutes integer not null default 0;

-- Owner-declared time off / blocked days. A date range (inclusive) that drops out
-- of online booking and shows as blocked on the calendar. all-day only for now.
create table if not exists availability_blocks (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references accounts(id) on delete cascade,
  start_date  date not null,
  end_date    date not null,
  reason      text,
  created_at  timestamptz not null default now()
);
create index if not exists availability_blocks_account_idx on availability_blocks (account_id, start_date);
alter table availability_blocks enable row level security;
drop policy if exists availability_blocks_owner on availability_blocks;
create policy availability_blocks_owner on availability_blocks for all using ( is_owner(account_id) );

-- ============================================================================
-- RATE LIMITING — durable, cross-instance fixed-window counter.
-- ============================================================================
-- Replaces per-serverless-instance in-memory Maps (useless on Vercel) for the
-- public write/cost/SMS endpoints. One row per bucket (e.g. 'lead:ip:1.2.3.4').
-- Only reached via the service-role client on public routes; RLS on, no policy.
create table if not exists rate_limits (
  bucket        text primary key,
  window_start  timestamptz not null default now(),
  count         int not null default 0
);
alter table rate_limits enable row level security;

-- Atomic check-and-increment: one upsert either resets the window (if the current
-- one has elapsed) or increments the count. Returns true iff still within limit.
create or replace function check_rate_limit(p_bucket text, p_limit int, p_window_seconds int)
returns boolean
language plpgsql
as $$
declare
  v_count int;
begin
  insert into rate_limits (bucket, window_start, count)
  values (p_bucket, now(), 1)
  on conflict (bucket) do update
    set count = case when rate_limits.window_start < now() - make_interval(secs => p_window_seconds) then 1 else rate_limits.count + 1 end,
        window_start = case when rate_limits.window_start < now() - make_interval(secs => p_window_seconds) then now() else rate_limits.window_start end
  returning count into v_count;
  return v_count <= p_limit;
end;
$$;

-- ============================================================================
-- JOB TRACKING — "on my way" live status link texted to the customer.
-- ============================================================================
-- One active row per en-route job. The customer opens /track/<token> to see the
-- tech's status, a map, and an ETA. token is stored HASHED (sha-256); the raw
-- token lives only in the texted URL. Short-lived (expires same day).
create table if not exists job_tracking (
  id           uuid primary key default gen_random_uuid(),
  account_id   uuid not null references accounts(id) on delete cascade,
  job_id       uuid not null references jobs(id) on delete cascade,
  token_hash   text not null,
  status       text not null default 'en_route' check (status in ('en_route', 'arrived', 'done')),
  tech_lat     numeric,
  tech_lng     numeric,
  eta_minutes  integer,
  en_route_at  timestamptz not null default now(),
  arrived_at   timestamptz,
  updated_at   timestamptz not null default now(),
  expires_at   timestamptz not null default (now() + interval '12 hours'),
  created_at   timestamptz not null default now()
);
create index if not exists job_tracking_job_idx on job_tracking (job_id, created_at desc);
create unique index if not exists job_tracking_token_idx on job_tracking (token_hash);
alter table job_tracking enable row level security;
drop policy if exists job_tracking_owner on job_tracking;
create policy job_tracking_owner on job_tracking for all using ( is_owner(account_id) );

-- Missed-call text-back. A Twilio tracking number (call_tracking_number) points
-- its Voice webhook at /api/twilio/voice, which rings the contractor's real line
-- (call_forward_number); an unanswered call auto-texts the caller + logs a lead.
-- Requires a provisioned/BYO number wired in the Twilio console — not automatic.
alter table accounts add column if not exists call_textback_enabled boolean not null default false;
alter table accounts add column if not exists call_tracking_number text;
alter table accounts add column if not exists call_forward_number text;
create index if not exists accounts_call_tracking_idx on accounts (call_tracking_number) where call_tracking_number is not null;

-- ============================================================================
-- Account settings audit trail. Who changed which switch, and when.
--
-- Turning off Online booking, Extra Stop or missed-call text-back stops money
-- arriving; until now those flips were silent and unattributable, so "bookings
-- dried up last Tuesday" had no answer. Jobs have job_feed and staff actions have
-- admin_actions — this is the equivalent for account-level settings.
--
-- Append-only by design: owners may READ their own history (so it can be shown in
-- the dashboard) but never write or edit it. Writes go through the service-role
-- path, the same shape as account_credits above.
create table if not exists account_events (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references accounts(id) on delete cascade,
  kind        text not null,            -- 'automation_toggled' | ...
  summary     text not null,            -- human-readable, shown as-is
  actor_email text,                     -- who did it; null for system/cron
  meta        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists account_events_account_idx on account_events (account_id, created_at desc);
alter table account_events enable row level security;
drop policy if exists account_events_owner_read on account_events;
create policy account_events_owner_read on account_events for select using ( is_owner(account_id) );
