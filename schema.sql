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
-- This account's OWN inbound number, when it has one.
--
-- Every contractor currently sends from one shared platform number, so an
-- inbound text carries the customer's number and nothing saying who it is for,
-- and routing has to guess. A number claimed here makes it exact — the To field
-- IS the answer. Nothing writes this yet: buying a number per contractor is a
-- recurring cost and a provisioning decision, not a code change. See
-- resolveAccountForInbound, which checks it first.
alter table accounts add column if not exists sms_number text;
-- One number, one account — enforced, not assumed. Two accounts sharing a
-- claimed number puts routing back to guessing while looking fixed.
create unique index if not exists accounts_sms_number_idx
  on accounts (sms_number)
  where sms_number is not null;
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
-- Email the contractor a receipt when a quote goes out to a customer. Default on:
-- it confirms the thing left, and who it reached. Off for contractors who send
-- enough quotes that the confirmations become noise.
alter table accounts add column if not exists quote_confirmation_email boolean not null default true;
-- The same receipt for the other things that go out to a customer. Payment
-- requests and review asks confirm per send; appointment reminders confirm once
-- per nightly run, because they fire for every job booked tomorrow and a mail
-- per customer would be a pile of email at 10pm rather than a useful signal.
alter table accounts add column if not exists payment_confirmation_email boolean not null default true;
alter table accounts add column if not exists review_confirmation_email boolean not null default true;
alter table accounts add column if not exists reminder_confirmation_email boolean not null default false;

-- Value gate for instant booking. When ON, the /book page asks a couple of quick
-- questions for an instant AI estimate first, and only jobs at/above the floor
-- (and in-area / work-you-take) can grab a slot; everyone else is routed to a
-- graceful "request a callback" instead of a hard no. OFF by default = booking
-- stays open to everyone exactly as before.
-- Days after a lead arrives before it is auto-marked lost, counted from
-- created_at and applied only to leads still new/contacted/quoted. 0 = never.
-- Was a hardcoded 30 in expireStaleLeads; see the 2026-08-06 migration for why
-- zero rather than null carries "never".
alter table accounts add column if not exists lead_lost_after_days integer not null default 30;
-- The bound belongs here as well as in the migration, or a database built from
-- this file alone would accept values production rejects. Nothing can currently
-- produce one — normalizeLeadLostAfterDays clamps identically on both the read
-- and the write — but "the app happens to be careful" is not a schema, and the
-- column is exposed for write through PostgREST like every other.
alter table accounts drop constraint if exists accounts_lead_lost_after_days_check;
alter table accounts add constraint accounts_lead_lost_after_days_check
  check (lead_lost_after_days >= 0 and lead_lost_after_days <= 3650);

-- When appointment reminders go out. Lead days are calendar days before the job
-- (1 = the day before); the hour is in the ACCOUNT'S own timezone, and the sweep
-- runs hourly to catch it. Before these existed the send moment was whatever
-- 22:00 UTC happened to be locally — see the 2026-08-06 migration.
alter table accounts add column if not exists appointment_reminder_lead_days integer not null default 1;
alter table accounts add column if not exists appointment_reminder_hour integer not null default 9;
alter table accounts drop constraint if exists accounts_appointment_reminder_lead_days_check;
alter table accounts add constraint accounts_appointment_reminder_lead_days_check
  check (appointment_reminder_lead_days >= 1 and appointment_reminder_lead_days <= 30);
alter table accounts drop constraint if exists accounts_appointment_reminder_hour_check;
alter table accounts add constraint accounts_appointment_reminder_hour_check
  check (appointment_reminder_hour >= 0 and appointment_reminder_hour <= 23);

-- Staff-imposed payout restriction, mirroring the suspended_at/_reason/_by
-- triple. Enforced at all FOUR Connect charge-creation sites — lib/payments.ts,
-- lib/recurring.ts, lib/payment-plans.ts and lib/dunning.ts. Dunning is the one
-- that matters most and was the one initially missed: the other three are
-- triggered by a person doing something, while dunning is a cron retrying saved
-- cards unattended, which is exactly the traffic a restriction exists to stop.
alter table accounts add column if not exists payouts_restricted_at timestamptz;
alter table accounts add column if not exists payouts_restricted_reason text;
alter table accounts add column if not exists payouts_restricted_by text;

-- When quote follow-ups go out, and how. Days are absolute offsets from the day
-- the quote was shared ({2,5} is the cadence that used to be hardcoded in
-- lib/quote-followups.ts); the hour is in the ACCOUNT'S own timezone, and the
-- sweep runs hourly to catch it. Before these existed the send moment was
-- whatever 16:00 UTC happened to be locally — 6am in Honolulu, chosen by nobody.
-- See the 2026-08-06 migration.
alter table accounts add column if not exists quote_followup_days integer[] not null default '{2,5}';
alter table accounts add column if not exists quote_followup_hour integer not null default 10;
alter table accounts add column if not exists quote_followup_channel text not null default 'auto';
alter table accounts add column if not exists quote_followup_skip_weekends boolean not null default false;
-- Bounds only: ascending-and-distinct is enforced by normalizeFollowupDays on
-- the read path as well as the write, and a CHECK cannot contain the subquery it
-- would take to say it here.
alter table accounts drop constraint if exists accounts_quote_followup_days_check;
alter table accounts add constraint accounts_quote_followup_days_check
  check (
    quote_followup_days is not null
    and cardinality(quote_followup_days) between 1 and 3
    and quote_followup_days <@ '{1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30}'::integer[]
  );
alter table accounts drop constraint if exists accounts_quote_followup_hour_check;
alter table accounts add constraint accounts_quote_followup_hour_check
  check (quote_followup_hour >= 0 and quote_followup_hour <= 23);
alter table accounts drop constraint if exists accounts_quote_followup_channel_check;
alter table accounts add constraint accounts_quote_followup_channel_check
  check (quote_followup_channel in ('auto', 'email'));

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
-- The rules that decide a pay amount, on the ACCOUNT rather than in a cookie.
-- They used to be per-browser, so the same week could total differently on a
-- phone and a laptop, and nothing recorded which rules an amount was agreed
-- under. require_separate_payer is the optional two-person rule.
alter table accounts add column if not exists labor_period_mode text not null default 'weekly';
alter table accounts add column if not exists labor_overtime_threshold numeric(6,2) not null default 40;
alter table accounts add column if not exists labor_rounding text not null default 'none';
alter table accounts add column if not exists labor_rules_set_at timestamptz;
alter table accounts add column if not exists require_separate_payer boolean not null default false;

-- Which payroll provider receives the export. It decides the SHAPE of the file,
-- not only its column names — a salaried employee belongs in an hours import
-- differently from an hourly one, and getting that wrong pays somebody their
-- salary twice in one run. See src/lib/payroll-export.ts.
alter table accounts add column if not exists payroll_provider text;
do $$ begin
  alter table accounts add constraint accounts_payroll_provider_check
    check (payroll_provider is null or payroll_provider in ('generic', 'gusto', 'quickbooks', 'adp', 'paychex'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table accounts add constraint accounts_labor_period_mode_check
    check (labor_period_mode in ('weekly', 'biweekly', 'monthly', 'custom'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table accounts add constraint accounts_labor_rounding_check
    check (labor_rounding in ('none', 'quarter', 'tenth'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table accounts add constraint accounts_labor_overtime_check
    check (labor_overtime_threshold between 1 and 168);
exception when duplicate_object then null; end $$;

-- When crew get paid. Without this nothing on Hours & pay could be early or
-- late: a period unpaid for three weeks looked exactly like yesterday's.
-- pay_weekday is nullable and MUST be read with a nullish check before it is
-- coerced — Number(null) is 0, which is a valid weekday, so a plain cast pins
-- every unset account to Sundays.
alter table accounts add column if not exists pay_delay_days integer not null default 5;
alter table accounts add column if not exists pay_weekday integer;
alter table accounts add column if not exists pay_day_set_at timestamptz;
do $$ begin
  alter table accounts add constraint accounts_pay_delay_check check (pay_delay_days between 0 and 31);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table accounts add constraint accounts_pay_weekday_check check (pay_weekday is null or pay_weekday between 0 and 6);
exception when duplicate_object then null; end $$;

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

-- How this person is actually paid. Everything in the app used to compute money
-- as hours × rate, so a salaried foreman or a day-rate sub had to be entered as
-- fake hours and the overtime threshold was applied to a number that was never
-- hours. hourly_rate stays NOT NULL and keeps its job — but for a non-hourly
-- person it is no longer what they're PAID, it's what an hour of their time
-- COSTS A JOB, derived by the app (salary ÷ 2080, day rate ÷ 8) so job costing,
-- the field app and margin all keep working untouched. See src/lib/pay-types.ts.
alter table crew add column if not exists pay_type text not null default 'hourly';
-- Nullable on purpose: a salary of 0 and "no salary recorded" are different
-- things, and defaulting either to zero would quietly pay somebody nothing.
alter table crew add column if not exists annual_salary numeric(12,2);
alter table crew add column if not exists day_rate numeric(10,2);

do $$ begin
  alter table crew add constraint crew_pay_type_check
    check (pay_type in ('hourly', 'salary', 'day_rate'));
exception when duplicate_object then null; end $$;

-- A pay type with nothing behind it would total to zero every period without
-- ever saying why.
do $$ begin
  alter table crew add constraint crew_pay_amount_check
    check (pay_type <> 'salary' or (annual_salary is not null and annual_salary > 0));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table crew add constraint crew_day_rate_check
    check (pay_type <> 'day_rate' or (day_rate is not null and day_rate > 0));
exception when duplicate_object then null; end $$;

-- This person's id IN THE PAYROLL PROVIDER (ADP File #, Gusto Employee ID).
-- Providers match on their own id, never on a name — a name match breaks the
-- first time somebody is "Michael" in one system and "Mike" in the other, or
-- two people share a name. Partial unique so the many crew with no id don't
-- collide: two crew rows aimed at one payroll employee is a double payment.
alter table crew add column if not exists payroll_id text;
create unique index if not exists crew_payroll_id_unique
  on crew (account_id, payroll_id) where payroll_id is not null and deleted_at is null;

-- THE FIELD-APP INVITE, as a lifecycle rather than a boolean.
--
-- The roster used to derive a crew member's state from two facts — is user_id
-- set, is there an email — which collapses five different situations into two.
-- "Not invited" and "invited three weeks ago and the link died an hour later"
-- looked identical to the owner, and the fix for one is not the fix for the
-- other. See src/lib/crew-invite.ts for how these are read.
--
-- No backfill: somebody who signed in before these existed has a user_id and no
-- last_signed_in_at, which reads as "signed in, date unknown" rather than as a
-- timestamp nobody recorded.
alter table crew add column if not exists invited_at timestamptz;
alter table crew add column if not exists invite_expires_at timestamptz;
alter table crew add column if not exists invite_count integer not null default 0;
alter table crew add column if not exists last_signed_in_at timestamptz;
-- Field-app access withdrawn, while the person stays on the roster. Distinct
-- from active = false (archived, off the crew) and from deleted_at (gone).
-- Clearing user_id alone would not hold: the next magic link would silently
-- re-link them, so the revocation has to be a fact the linker can read.
alter table crew add column if not exists access_revoked_at timestamptz;

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
  email_theme       text not null default 'studio'
                    check (email_theme in ('studio', 'letterhead', 'neighborly', 'blueprint', 'spotlight')),

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
  -- Last day the job runs, for work that spans days. NULL means a single day,
  -- or fall back to estimating the span from estimated_hours. Held on the job
  -- so the calendar can't be reshaped by changing the account's daily capacity.
  scheduled_until date,
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
-- Who accepted the quote, and when. The same pair invoices have carried since
-- the beginning. Accepting the work and the price is a SEPARATE agreement from
-- authorizing recurring card charges on a payment plan, and only the second one
-- was ever being signed. See migrations/2026-08-11-quote-acceptance-signature.
alter table jobs add column if not exists quote_signer_name text;
alter table jobs add column if not exists quote_signed_at timestamptz;
-- The mark, when they signed with a finger rather than only typing. SVG path
-- data in a fixed 600x200 viewBox, not a rasterised image: it prints at the
-- printer's resolution, it is kilobytes rather than tens of them, and path data
-- is numbers and eight letters — which a strict allowlist can prove is inert,
-- and this value arrives from an anonymous visitor holding a link. See
-- src/lib/signature.ts and migrations/2026-08-13-quote-signature.sql.
alter table jobs add column if not exists quote_signature_path text;
alter table jobs add column if not exists quote_signature_method text;
alter table jobs drop constraint if exists jobs_quote_signature_method_check;
alter table jobs add constraint jobs_quote_signature_method_check
  check (quote_signature_method is null or quote_signature_method in ('drawn', 'typed'));
-- Geocoded coordinates of the job address — the anchors for instant-booking
-- route-density ("we'll already be near you that day"). Populated best-effort at
-- job create (see src/lib/geocode.ts); only precise (rooftop/interpolated)
-- results are stored, so a city-centroid never fakes proximity. Null when
-- geocoding is unavailable or imprecise. geocoded_at caches the attempt.
alter table jobs add column if not exists lat numeric;
alter table jobs add column if not exists lng numeric;
alter table jobs add column if not exists geocoded_at timestamptz;
-- How this customer may be messaged about this job. The CONTRACTOR's half of
-- consent; sms_consent.opted_out is the customer's half and outranks it.
-- 'auto' (the default, and today's behaviour) = text if there's a mobile, else
-- email. 'sms' = never email. 'email' = never text. 'off' = nothing automatic.
-- Resolved with the phone, the email and the STOP flag by resolveClientChannel
-- in src/lib/client-channel.ts. Carried over from the lead's
-- triage.messageChannel at conversion.
alter table jobs add column if not exists message_channel text not null default 'auto';
alter table jobs drop constraint if exists jobs_message_channel_check;
alter table jobs add constraint jobs_message_channel_check
  check (message_channel in ('auto', 'sms', 'email', 'off'));

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
-- TIME_ENTRIES  — clock in / clock out, when an account turns it on.
--
-- A separate table on purpose. An OPEN shift is not a cost: it has no hours and
-- no amount yet, and writing it into `costs` would drag an unknown into every
-- job-margin and pay total until somebody clocked out. So a shift lives here
-- while it is running, and on clock-out it BECOMES a normal labor cost row
-- (cost_id below). Everything downstream — Hours & pay, Labor by job, margin —
-- keeps working unchanged, because the end product is still a costs row.
--
-- The partial unique index is the real constraint: one open shift per crew
-- member, account-wide. Without it, a double tap on Clock in, or clocking in on
-- a second job while still on the first, silently starts two shifts and bills
-- the same minutes twice.
-- ----------------------------------------------------------------------------
create table if not exists time_entries (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid not null references accounts(id) on delete cascade,
  crew_id       uuid not null references crew(id) on delete cascade,
  job_id        uuid not null references jobs(id) on delete cascade,

  started_at    timestamptz not null default now(),
  ended_at      timestamptz,
  -- Snapshotted at clock-in, so a later rate change doesn't silently restate
  -- shifts that were already worked.
  rate          numeric(10,2) not null default 0,
  note          text,

  -- The labor cost this shift turned into. Null while the shift is open.
  --
  -- The foreign key is declared further down, immediately after `costs` is
  -- created, NOT here: this table is defined before that one, and an inline
  -- reference made this file fail on the first statement when building a
  -- database from scratch. Production never hit it because production was built
  -- up migration by migration, against a database that already had `costs`.
  cost_id       uuid,
  -- True when the owner closed it from the dashboard because the crew member
  -- forgot. Worth showing: an owner-guessed end time is not a clocked one.
  closed_by_owner boolean not null default false,

  created_at    timestamptz not null default now()
);

create unique index if not exists time_entries_one_open_per_crew
  on time_entries (crew_id) where ended_at is null;
create index if not exists time_entries_account_started_idx
  on time_entries (account_id, started_at desc);
create index if not exists time_entries_cost_idx on time_entries (cost_id);

-- Whether crew must clock in/out, may choose to, or never see it.
-- 'off' keeps the original behaviour: type your hours when the work is done.
alter table accounts add column if not exists time_clock_mode text not null default 'off';
do $$ begin
  alter table accounts add constraint accounts_time_clock_mode_check
    check (time_clock_mode in ('off', 'optional', 'required'));
exception when duplicate_object then null; end $$;

-- Places a contractor goes back to: the county dump, the Home Depot on the way
-- out, the yard that stocks the right pipe. Account-scoped and free-form —
-- every trade's list is different, and a national directory would be wrong for
-- the one-yard-in-town case that actually matters.
create table if not exists saved_places (
  id              uuid primary key default gen_random_uuid(),
  account_id      uuid not null references accounts(id) on delete cascade,
  label           text not null,
  address         text not null,
  lat             numeric,
  lng             numeric,
  kind            text not null default 'supply',
  default_minutes integer not null default 20,
  -- Ordering for the quick-add list: most-used first, ties broken by recency.
  use_count       integer not null default 0,
  last_used_at    timestamptz,
  created_at      timestamptz not null default now()
);
do $$ begin
  alter table saved_places add constraint saved_places_kind_check
    check (kind in ('supply', 'dump', 'fuel', 'other'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table saved_places add constraint saved_places_minutes_check
    check (default_minutes between 0 and 480);
exception when duplicate_object then null; end $$;
create unique index if not exists saved_places_unique_per_account
  on saved_places (account_id, lower(label), lower(address));
create index if not exists saved_places_account_rank_idx
  on saved_places (account_id, use_count desc, last_used_at desc nulls last);

-- A stop on one day that isn't a job: a dump run, a supply pickup, fuel. They
-- cost real time and real miles, and leaving them out of the route is why a
-- planned day and a real day disagree.
create table if not exists route_stops (
  id             uuid primary key default gen_random_uuid(),
  account_id     uuid not null references accounts(id) on delete cascade,
  -- NULL = belongs to the whole day, so it shows in every crew's plan. Same rule
  -- unassigned jobs already follow.
  crew_id        uuid references crew(id) on delete set null,
  saved_place_id uuid references saved_places(id) on delete set null,
  scheduled_for  date not null,
  -- NULL = "fit it in": the planner places it and proposes a time, exactly as it
  -- does for a job with no time on it.
  scheduled_time time,
  label          text not null,
  address        text,
  lat            numeric,
  lng            numeric,
  minutes        integer not null default 20,
  -- 'estimate' is never created by hand: it's the stop a lead's YES makes when
  -- they accept an offered slot (see estimate_offers).
  kind           text not null default 'supply',
  note           text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
-- route_stops.lead_id is added further down, once leads exists.
do $$ begin
  alter table route_stops drop constraint if exists route_stops_kind_check;
  alter table route_stops add constraint route_stops_kind_check
    check (kind in ('supply', 'dump', 'fuel', 'other', 'estimate'));
end $$;
do $$ begin
  alter table route_stops add constraint route_stops_minutes_check
    check (minutes between 0 and 480);
exception when duplicate_object then null; end $$;
create index if not exists route_stops_day_idx on route_stops (account_id, scheduled_for);
create index if not exists route_stops_crew_idx on route_stops (crew_id) where crew_id is not null;

-- Where a crew member's day starts. Filtering Plan my day to one crew anchors
-- the route at their address instead of the shop. Coordinates are stored only
-- when geocoding was precise — a city-level match would silently move every leg
-- of their day by several miles.
alter table crew add column if not exists start_address text;
alter table crew add column if not exists start_lat numeric;
alter table crew add column if not exists start_lng numeric;

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

-- The deferred half of time_entries.cost_id, declared here because this is the
-- first point at which `costs` exists. Same constraint, same ON DELETE — only
-- the position differs.
do $$ begin
  alter table time_entries add constraint time_entries_cost_id_fkey
    foreign key (cost_id) references costs(id) on delete set null;
exception when duplicate_object then null; end $$;

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
-- When a manually-posted update was last rewritten. Only job_update rows are
-- ever editable — everything else in this feed is a record of something that
-- happened, and a record you can rewrite is not a record. The boundary is a
-- where clause in editJobFeedUpdateAction, not a UI convention. Shown on the
-- customer's page too: an update that quietly changes after they have read it
-- is the same fault as a quote whose total moves underneath them.
alter table job_feed add column if not exists edited_at timestamptz;
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
-- When the most recent refund on this payment was issued. Reporting MUST date
-- refunds by this and never by paid_at: a refund issued today against a
-- ninety-day-old charge belongs in this month, not in that one.
-- (Two partials on different days share one timestamp — exact for the single
-- refund case, which is nearly all of them. A per-refund ledger is the real fix
-- and is deliberately not this column.)
alter table payments add column if not exists refunded_at timestamptz;
-- How much of platform_fee Stripe handed back with the refund. Refunds are
-- created with refund_application_fee: true, so the fee returns in proportion.
-- Kept SEPARATE from platform_fee, which is what was actually charged and is
-- never retroactively re-rated — a correction that overwrites the original is
-- not a correction anybody can audit.
alter table payments add column if not exists platform_fee_refunded numeric(12,2) not null default 0;
create index if not exists payments_refunded_at_idx on payments (refunded_at) where refunded_amount > 0;

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
-- saved card (a plain payments row otherwise has no path to the plan). The
-- foreign key is added after recurring_plans is created, further down — see the
-- note on time_entries.cost_id for why an inline reference cannot work here.
alter table payments add column if not exists recurring_plan_id uuid;
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
  -- WHICH wording they agreed to, not merely that they agreed. A carrier 10DLC
  -- review asks exactly that: the evidence screenshot shows one sentence, and
  -- the ledger has to be able to say this person accepted THAT sentence. See
  -- src/lib/owner-sms-disclosure.ts for the current identifier. Null marks a
  -- row written before the wording was versioned — deliberately not
  -- backfilled, because stamping a version onto a consent nobody gave under it
  -- is inventing evidence. Null reads as stale and the dialog re-asks.
  disclosure_version text,
  updated_at      timestamptz not null default now(),
  unique (account_id, phone_number)
);

-- ----------------------------------------------------------------------------
-- MESSAGING REGISTRATIONS - where a contractor's customer-texting registration
-- actually stands, said explicitly rather than inferred.
--
-- WHY THIS IS NOT A BOOLEAN. The tempting shortcut is to read accounts.sms_number
-- and call a number "approved", and it is backwards: the number is a CONSEQUENCE
-- of approval, assigned after the fact, and (see its own note above) nothing
-- writes it yet. An account with no number could be not-started, under review or
-- rejected, and those are three different things to tell somebody.
--
-- There is deliberately no 'unavailable' status. That is not something an account
-- IS — it is something the reader could not find out — and storing a read failure
-- as a value is how "we could not check" quietly becomes "we checked and it is
-- fine". The absence is handled in lib/owner-sms, which returns a different shape
-- for it.
--
-- Every account is 'not_started' today: the provider has not confirmed the
-- downstream-business registration process, so there is nothing to submit.
-- ----------------------------------------------------------------------------
create table if not exists messaging_registrations (
  -- The account IS the key. A second row would be a second answer to "can this
  -- contractor text customers".
  account_id          uuid primary key references accounts(id) on delete cascade,
  status              text not null default 'not_started'
    check (status in ('not_started','submitted','in_review','approved','action_required','rejected')),
  provider            text,
  provider_reference  text,
  -- What they have to DO, when the status says they have to do something. An
  -- action_required with no reason on it is a dead end.
  status_detail       text,
  -- The two-way number once one is assigned. Kept here rather than read back
  -- from accounts.sms_number, which is inbound ROUTING: conflating "we route
  -- this number to you" with "you may text customers" is the inference this
  -- table exists to stop.
  assigned_number     text,
  submitted_at        timestamptz,
  decided_at          timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- One number, one account. Same reasoning as accounts_sms_number_idx: two
-- accounts holding the same assigned number is a routing bug that would look
-- like a working feature.
create unique index if not exists messaging_registrations_number_idx
  on messaging_registrations (assigned_number)
  where assigned_number is not null;

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

-- The estimate visit an accepted offer creates. Declared here rather than with
-- the rest of route_stops because it points at leads, which is defined above.
alter table route_stops add column if not exists lead_id uuid references leads(id) on delete set null;
create index if not exists route_stops_lead_idx on route_stops (lead_id) where lead_id is not null;

-- Offering a nearby lead the gap in a day's route.
--
-- One row per ask. The unique index on lead_id is the guardrail that matters:
-- a lead gets asked once, ever, and that is enforced by the database rather
-- than by everyone remembering to check.
create table if not exists estimate_offers (
  id              uuid primary key default gen_random_uuid(),
  account_id      uuid not null references accounts(id) on delete cascade,
  lead_id         uuid not null references leads(id) on delete cascade,
  crew_id         uuid references crew(id) on delete set null,
  status          text not null default 'held',
  offer_date      date not null,
  -- What the homeowner was promised: a window, never a single time.
  window_start    time not null,
  window_end      time not null,
  -- What the route was planned around, inside that window.
  arrival_time    time not null,
  visit_minutes   integer not null default 30,
  detour_miles    numeric,
  detour_minutes  integer,
  after_stop_id   text,
  phone           text not null,
  -- The text as sent. A template id would stop being an answer the moment the
  -- template was edited.
  body            text not null,
  hold_minutes    integer not null default 45,
  hold_expires_at timestamptz not null,
  sent_at         timestamptz not null default now(),
  replied_at      timestamptz,
  reply_body      text,
  forwarded_at    timestamptz,
  route_stop_id   uuid references route_stops(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
do $$ begin
  alter table estimate_offers add constraint estimate_offers_status_check
    check (status in ('held', 'accepted', 'accepted_late', 'declined', 'expired', 'canceled'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table estimate_offers add constraint estimate_offers_window_check
    check (window_end > window_start and arrival_time >= window_start and arrival_time <= window_end);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table estimate_offers add constraint estimate_offers_hold_check
    check (hold_minutes between 15 and 120);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table estimate_offers add constraint estimate_offers_visit_check
    check (visit_minutes between 10 and 240);
exception when duplicate_object then null; end $$;
create unique index if not exists estimate_offers_one_per_lead on estimate_offers (lead_id);
create index if not exists estimate_offers_day_idx on estimate_offers (account_id, offer_date);
create index if not exists estimate_offers_pending_idx
  on estimate_offers (phone, sent_at desc) where status = 'held';

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
-- Its policy is declared with every other policy in the RLS section below, not
-- here: is_owner() is defined down there, and a policy cannot reference a
-- function that does not exist yet. This was the only table declaring its own
-- policy inline, and it stopped this file building from scratch.
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
  -- NULL means unread. Only inbound rows are ever unread — our own outbound
  -- copy is not mail. See migrations/2026-08-04-messages-unread-and-media.sql.
  read_at       timestamptz,
  -- Twilio-hosted MMS URLs. Unguessable but publicly fetchable, so they are
  -- treated as capability URLs and rendered only in the owner's dashboard.
  media_urls    text[],
  created_at    timestamptz not null default now()
);
create index if not exists sms_messages_thread_idx on sms_messages (account_id, phone_number, created_at desc);
-- Partial index so the nav's unread count stays cheap as threads pile up.
create index if not exists sms_messages_unread_idx
  on sms_messages (account_id)
  where direction = 'inbound' and read_at is null;

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
  -- Which seasonal topic this came from, when it came from one. NULL is the
  -- normal case — most campaigns are one-offs that belong to no topic. Plain
  -- text, not a foreign key: the beats are code, not rows, and retiring one
  -- must not take a contractor's send history with it.
  beat_id         text,
  created_at      timestamptz not null default now()
);
create index if not exists campaigns_account_idx on campaigns (account_id, created_at desc);
create index if not exists campaigns_account_beat_idx
  on campaigns (account_id, beat_id)
  where beat_id is not null;

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

-- The deferred half of payments.recurring_plan_id — payments is defined ~400
-- lines above this, so the reference could not be inline. Same constraint, same
-- ON DELETE.
do $$ begin
  alter table payments add constraint payments_recurring_plan_id_fkey
    foreign key (recurring_plan_id) references recurring_plans(id) on delete set null;
exception when duplicate_object then null; end $$;

-- Recurring visits, created as real jobs ahead of the day they happen. The
-- visit date is stored on the job and never moves, so the daily sweep can find
-- the exact visit to bill even after the owner drags the job to another day —
-- matching on scheduled_for would miss it and create a duplicate.
alter table jobs add column if not exists recurring_plan_id uuid references recurring_plans(id) on delete set null;
alter table jobs add column if not exists recurring_visit_date date;
create unique index if not exists jobs_recurring_visit_unique
  on jobs (recurring_plan_id, recurring_visit_date)
  where recurring_plan_id is not null and recurring_visit_date is not null;
create index if not exists jobs_recurring_plan_idx
  on jobs (recurring_plan_id, recurring_visit_date)
  where recurring_plan_id is not null;

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
-- Whether the homeowner may settle the whole total instead of starting the plan.
-- A plan is an offer, not a requirement; see
-- migrations/2026-08-11-plan-pay-in-full.sql for why the default is true and why
-- this never gates paying OFF an already-active plan.
alter table payment_plans add column if not exists allow_pay_in_full boolean not null default true;

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

-- Column-level guard for crew job UPDATEs, kept as defence in depth now that
-- crew hold no UPDATE policy on jobs at all (see below). RLS can't restrict
-- which columns a policy lets through, so if one is ever re-granted this is
-- what stops a crew member rewriting account_id (a tenant move — the job
-- vanishes from the real owner) or quoted_amount/quote_items (margin +
-- invoicing basis). Owners and the service-role/admin client (auth.uid() not a
-- crew member) pass through untouched.
--
-- The transaction-local flag is how crew_set_job_status() writes the one thing
-- a crew member legitimately changes. It is set by that function and by nothing
-- else — there is no PostgREST route to set_config(), so a crew session cannot
-- raise it on its own behalf.
create or replace function crew_jobs_update_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('app.crew_job_write', true), '') = 'on' then
    return new;
  end if;
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

-- THE WHOLE of what a crew member may do to a job.
--
-- The field app's Start work writes status AND started_at — every owner-facing
-- surface reads started_at to tell "on the calendar" from "underway" — while
-- the guard above allowed crew `status` and nothing else. Those two facts
-- cannot both be satisfied through a table grant, so the grant is gone and this
-- is what replaced it: one function, two transitions, assignment checked here
-- rather than trusted from the caller.
--
-- 'archived' and 'new_lead' are deliberately absent. Retiring a job or pushing
-- it back to the quote stage are owner decisions, and a job already archived is
-- not something a phone reopens.
--
-- started_at is stamped on the way in and NEVER re-dated: it records a thing
-- that happened, and a second press must not move it.
create or replace function crew_set_job_status(j uuid, new_status text)
returns table (id uuid, status text, started_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare current_status text;
begin
  if new_status not in ('in_progress', 'complete') then
    raise exception 'unsupported status %', new_status using errcode = 'check_violation';
  end if;
  if not crew_on_job(j) then
    raise exception 'you are not assigned to this job' using errcode = 'insufficient_privilege';
  end if;

  select jobs.status into current_status from jobs where jobs.id = j;
  if current_status is null then
    raise exception 'job not found' using errcode = 'no_data_found';
  end if;
  if current_status = 'archived' then
    raise exception 'that job has been archived' using errcode = 'check_violation';
  end if;

  perform set_config('app.crew_job_write', 'on', true);

  return query
    update jobs
       set status = new_status,
           started_at = coalesce(jobs.started_at, now())
     where jobs.id = j
    returning jobs.id, jobs.status, jobs.started_at;
end;
$$;

revoke all on function crew_set_job_status(uuid, text) from public;
grant execute on function crew_set_job_status(uuid, text) to authenticated;

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

-- ----------------------------------------------------------------------------
-- FIELD_SUBMISSIONS — what makes an offline replay safe to repeat.
--
-- The field app's service worker holds a clock-out, a note or a material in
-- IndexedDB when the network drops, and sends it when signal returns. It cannot
-- know whether a request it never got an answer to actually arrived: a reply
-- lost on the way back looks exactly like a request lost on the way out. So it
-- retries — and without this, a retry is a second labor cost on somebody's job
-- and a second set of hours in their pay.
--
-- The unique index IS the lock. The insert either succeeds (first time this
-- submission has been seen) or raises 23505 (it hasn't), with no window between
-- checking and acting for a second attempt to slip through.
-- ----------------------------------------------------------------------------
create table if not exists field_submissions (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references accounts(id) on delete cascade,
  crew_id     uuid not null references crew(id) on delete cascade,
  -- Generated on the phone before the first send attempt; identical on every
  -- replay of the same tap.
  key         text not null,
  kind        text not null,
  created_at  timestamptz not null default now()
);
create unique index if not exists field_submissions_key_unique on field_submissions (crew_id, key);
create index if not exists field_submissions_account_idx on field_submissions (account_id, created_at desc);

do $$
declare t text;
begin
  foreach t in array array[
    'accounts','memberships','crew','sites','jobs','crew_assignments',
    'costs','job_feed','client_job_access','invoices','payments','finance_plans','payment_plans','leads','sms_events','sms_consent','sms_messages','clients','campaigns','recurring_plans','services','review_invites','message_templates','job_tasks','job_schedule_requests','email_suppression','booking_holds','messaging_registrations'
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
drop policy if exists lead_blocklist_all on lead_blocklist;
drop policy if exists inv_all on invoices;
drop policy if exists pay_all on payments;
drop policy if exists plan_all on finance_plans;
drop policy if exists lead_all on leads;
drop policy if exists sms_event_all on sms_events;
drop policy if exists sms_consent_all on sms_consent;
drop policy if exists messaging_registration_read on messaging_registrations;
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

-- JOBS: owners full access; crew may READ only the jobs they're assigned to,
-- and may not UPDATE them at all. There WAS a job_crew_update policy — RLS
-- can't restrict columns, so it handed a crew session every column on an
-- assigned job and a trigger had to claw it back. crew_set_job_status() (above)
-- is the replacement: one function, the two transitions the field app offers,
-- assignment checked in the database.
create policy job_owner       on jobs for all    using ( is_owner(account_id) );
create policy job_crew_read   on jobs for select using ( crew_on_job(id) );

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

-- ...and the money on a labor row is not theirs to write. The insert policy
-- pins WHO and WHICH JOB but says nothing about the rate, so a crafted insert
-- could log an hour at any figure it liked. The rate has to be the one on the
-- roster, or one this person has actually clocked on this job (clockIn
-- snapshots the rate at the start of a shift, and an owner who changes it
-- mid-afternoon must not make clocking out fail). The amount has to be the
-- arithmetic rather than a number of its own — a cent of tolerance because the
-- app rounds in JavaScript and this rounds in Postgres.
create or replace function crew_costs_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare pinned numeric;
begin
  if not is_crew(new.account_id) then return new; end if;
  if new.type <> 'labor' then return new; end if;

  select c.hourly_rate into pinned from crew c where c.id = new.crew_id;
  if pinned is null then
    raise exception 'labor has to be attributed to a crew member on this account';
  end if;

  if new.rate is distinct from pinned
     and not exists (
       select 1 from time_entries t
        where t.crew_id = new.crew_id and t.job_id = new.job_id and t.rate = new.rate
     ) then
    raise exception 'crew may not set their own pay rate';
  end if;

  if new.hours is null or new.hours <= 0
     or abs(coalesce(new.amount, 0) - round(new.hours * new.rate, 2)) > 0.01 then
    raise exception 'labor amount must be hours x the rate on file';
  end if;
  return new;
end;
$$;
drop trigger if exists crew_costs_guard on costs;
create trigger crew_costs_guard before insert or update on costs
  for each row execute function crew_costs_guard();

-- TIME_ENTRIES: owners full access (they close forgotten shifts). A crew member
-- may open a shift on a job they're assigned to, attributed to themselves, and
-- read/close only their OWN — never a coworker's, and never one on a job they
-- were taken off. The account_id is pinned to the job's real account so a crew
-- session can't open a shift carrying a foreign account_id, the same guard the
-- costs insert policy uses.
alter table time_entries enable row level security;
drop policy if exists time_entry_owner on time_entries;
drop policy if exists time_entry_crew_read on time_entries;
drop policy if exists time_entry_crew_insert on time_entries;
drop policy if exists time_entry_crew_update on time_entries;
create policy time_entry_owner       on time_entries for all    using ( is_owner(account_id) );
create policy time_entry_crew_read   on time_entries for select using ( crew_owns_crew_row(crew_id) );
create policy time_entry_crew_insert on time_entries for insert with check ( crew_on_job(job_id) and crew_owns_crew_row(crew_id) and account_id = job_account_id(job_id) );
create policy time_entry_crew_update on time_entries for update using ( crew_owns_crew_row(crew_id) ) with check ( crew_owns_crew_row(crew_id) );

-- ...and the policy above is "you may rewrite every column of your own shift",
-- because RLS cannot restrict columns. That includes `rate` (what the hour is
-- worth), `started_at` (backdating a shift to this morning), `job_id` (moving
-- the hours onto somebody else's job) and `closed_by_owner` (laundering a
-- guessed end time into a clocked one). The UI offers exactly one of those —
-- clocking out — so that is what the database permits, and the rate is pinned
-- to the owner's number on the way in.
create or replace function crew_time_entries_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare pinned numeric;
begin
  -- Owners and the service-role client pass through untouched: closing somebody
  -- else's forgotten shift at a corrected time is exactly their job.
  if not is_crew(new.account_id) then return new; end if;

  if tg_op = 'INSERT' then
    select c.hourly_rate into pinned from crew c where c.id = new.crew_id;
    new.rate := coalesce(pinned, 0);
    -- A shift opens open. Inserting one already closed would skip the cost row
    -- that is what makes the hours visible to anybody.
    new.ended_at := null;
    new.cost_id := null;
    new.closed_by_owner := false;

    -- HOW FAR BACK A SHIFT MAY REACH. started_at is outside the update
    -- whitelist below, so backdating a running shift is refused — but the
    -- offline queue endpoint exists precisely to accept a start time this
    -- server did not witness, and the insert policy answers PostgREST without
    -- going through it. 13 hours against the application's 12 so that the
    -- app's bound is the binding one and clock drift between the web host and
    -- the database never turns a legitimate replay into an error.
    if new.started_at < now() - interval '13 hours' then
      raise exception 'a shift cannot start more than 13 hours ago';
    end if;
    if new.started_at > now() + interval '15 minutes' then
      raise exception 'a shift cannot start in the future';
    end if;
    return new;
  end if;

  if old.ended_at is not null then
    raise exception 'that shift is already closed';
  end if;
  if (to_jsonb(new) - 'ended_at' - 'cost_id' - 'note')
     is distinct from (to_jsonb(old) - 'ended_at' - 'cost_id' - 'note') then
    raise exception 'crew may only close their own shift';
  end if;
  return new;
end;
$$;
drop trigger if exists crew_time_entries_guard on time_entries;
create trigger crew_time_entries_guard before insert or update on time_entries
  for each row execute function crew_time_entries_guard();

-- ROUTE STOPS + SAVED PLACES: owners manage both. Crew get READ on route stops
-- — their own, plus the day's UNASSIGNED ones — so the field app can show the
-- dump run and the supply stop without exposing another truck's route. An
-- unassigned stop belongs to whoever is out that day, which is the same rule
-- the owner's planner already applies to it.
alter table saved_places enable row level security;
alter table route_stops enable row level security;
drop policy if exists saved_place_owner on saved_places;
drop policy if exists route_stop_owner on route_stops;
drop policy if exists route_stop_crew_read on route_stops;
create policy saved_place_owner    on saved_places for all    using ( is_owner(account_id) );
create policy route_stop_owner     on route_stops  for all    using ( is_owner(account_id) );
create policy route_stop_crew_read on route_stops  for select using ( is_crew(account_id) and (crew_id is null or crew_owns_crew_row(crew_id)) );

-- FIELD SUBMISSIONS: written only by the admin client on the offline-queue
-- endpoint, which is why crew get nothing here — a crew session that could
-- write its own idempotency keys could mark a submission as already handled and
-- make the real one vanish. The owner policy exists so an owner can see what
-- arrived from a phone that had been out of signal.
alter table field_submissions enable row level security;
drop policy if exists field_submission_owner on field_submissions;
create policy field_submission_owner on field_submissions for all using ( is_owner(account_id) );

-- ESTIMATE_OFFERS: the owner's own. Replies come in through the Twilio webhook
-- on the service-role client, which bypasses RLS.
alter table estimate_offers enable row level security;
drop policy if exists estimate_offer_owner on estimate_offers;
create policy estimate_offer_owner on estimate_offers for all using ( is_owner(account_id) );

-- JOB_FEED: owners full access. Crew may READ and POST feed events on an assigned
-- job (status changes, field notes, client-shared updates) — nothing else.
create policy feed_owner       on job_feed for all    using ( is_owner(account_id) );
create policy feed_crew_read   on job_feed for select using ( crew_on_job(job_id) );
create policy feed_crew_insert on job_feed for insert with check ( crew_on_job(job_id) and account_id = job_account_id(job_id) );

create policy client_access_all on client_job_access for all using ( is_owner(account_id) );

-- Financials, CRM, comms, marketing config: OWNER-ONLY. Crew touch none of these.
create policy lead_blocklist_all on lead_blocklist for all using ( is_owner(account_id) );
create policy inv_all    on invoices         for all using ( is_owner(account_id) );
create policy pay_all    on payments         for all using ( is_owner(account_id) );
create policy plan_all   on finance_plans    for all using ( is_owner(account_id) );
-- Booking holds are written only by the admin client on the public booking path;
-- the owner policy just lets an owner read/manage their own rows.
create policy booking_holds_all on booking_holds for all using ( is_owner(account_id) );
create policy lead_all   on leads            for all using ( is_owner(account_id) );
create policy sms_event_all on sms_events     for all using ( is_owner(account_id) );
create policy sms_consent_all on sms_consent  for all using ( is_owner(account_id) );
-- SELECT ONLY, and the only account-scoped table in this file that is. The rest
-- hold things the owner creates; this holds a provider's decision about them,
-- applied by staff through the service role. An owner who could write their own
-- row could set it to 'approved' and start texting customers on that basis.
create policy messaging_registration_read on messaging_registrations for select using ( is_owner(account_id) );
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
  -- Deliberately NOT a foreign key. This is a log of things that happened, not
  -- a row about a live account, and a log with referential integrity to the
  -- mutable thing it describes can be rewritten by editing something else.
  -- It was `on delete set null`, so deleting an account NULLed the audit row
  -- recording that deletion — plus every prior row for that account.
  -- The index still answers "everything ever done to account X", which is the
  -- question actually asked once an account is gone.
  account_id   uuid,
  target_type  text,                    -- 'extra_stop_request' | 'payment' | 'account' | ...
  target_id    text,
  meta         jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);
create index if not exists admin_actions_created_idx on admin_actions (created_at desc);
-- Phase 1 audit hardening. admin_actions carried four of the sixteen fields an
-- audit trail is asked for; everything else was squeezed into meta jsonb, where
-- it could not be required, validated, indexed or filtered — which in practice
-- meant it was usually absent.
alter table admin_actions add column if not exists reason text;          -- WHY
alter table admin_actions add column if not exists before_value jsonb;   -- what it was
alter table admin_actions add column if not exists after_value jsonb;    -- what it became
alter table admin_actions add column if not exists ip text;              -- from where
alter table admin_actions add column if not exists request_id text;      -- ties one request's rows together
alter table admin_actions add column if not exists permission text;      -- under what authority
alter table admin_actions add column if not exists staff_id uuid;        -- the acting staff row
create index if not exists admin_actions_request_idx on admin_actions (request_id) where request_id is not null;
create index if not exists admin_actions_permission_idx on admin_actions (permission, created_at desc);

-- APPEND-ONLY, ENFORCED. This table has always been DESCRIBED as append-only and
-- was never prevented from being anything else: every read and write goes through
-- the service-role client, which bypasses RLS, so nothing stopped an UPDATE or a
-- DELETE. An audit trail the audited party can edit is not an audit trail.
create or replace function admin_actions_append_only() returns trigger
language plpgsql as $$
begin
  raise exception 'admin_actions is append-only (attempted %)', tg_op;
end $$;
drop trigger if exists admin_actions_no_update on admin_actions;
create trigger admin_actions_no_update
  before update or delete on admin_actions
  for each row execute function admin_actions_append_only();

-- ----------------------------------------------------------------------------
-- STAFF. Who works here, and what each of them may do.
-- ----------------------------------------------------------------------------
-- TWO GATES, and both must permit. ADMIN_EMAILS (env) decides whether you can
-- reach /admin at all — a database row must never be able to grant console
-- access, and the first staff member has to get in before there is a table to
-- read. This table decides what you can DO once inside, and can revoke what the
-- env still allows, because deactivation has to work faster than a redeploy.
-- The permission matrix itself lives in src/lib/staff.ts.
create table if not exists staff (
  id              uuid primary key default gen_random_uuid(),
  email           text not null,
  -- read_only by default: a row that appears without anybody choosing a role
  -- should be able to look and change nothing.
  role            text not null default 'read_only'
                  check (role in ('super_admin','support','finance','risk','ops','read_only')),
  display_name    text,
  -- Checked before role, everywhere. A deactivated super admin must be able to
  -- do less than a read_only one.
  active          boolean not null default true,
  deactivated_at  timestamptz,
  deactivated_by  text,
  last_seen_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create unique index if not exists staff_email_idx on staff (lower(email));
create index if not exists staff_active_idx on staff (active, role);
alter table staff enable row level security;

-- Who changed whose access, when, and why. Separate from the row because "when
-- did this person get the ability to issue refunds" is asked long after the row
-- itself has moved on. A log, so no foreign key and no updates.
create table if not exists staff_role_changes (
  id           uuid primary key default gen_random_uuid(),
  staff_id     uuid,
  staff_email  text not null,
  from_role    text,
  to_role      text,
  from_active  boolean,
  to_active    boolean,
  reason       text,
  changed_by   text not null,
  created_at   timestamptz not null default now()
);
create index if not exists staff_role_changes_staff_idx on staff_role_changes (staff_email, created_at desc);
alter table staff_role_changes enable row level security;
drop trigger if exists staff_role_changes_no_update on staff_role_changes;
create trigger staff_role_changes_no_update
  before update or delete on staff_role_changes
  for each row execute function admin_actions_append_only();


create index if not exists admin_actions_account_idx on admin_actions (account_id, created_at desc);
-- RLS on with NO policy: unreachable via the anon/authed keys. Only the
-- service-role client (used inside requireAdmin's context) can read/write it.
alter table admin_actions enable row level security;

-- ----------------------------------------------------------------------------
-- Admin dashboard build-out (Command Center, Universal Search, account profile)
-- ----------------------------------------------------------------------------
-- Every table below follows the admin_actions precedent exactly: RLS ENABLED
-- WITH NO POLICY. They are staff surfaces, reachable only through the
-- service-role client from createAdminClient(), and never read from the owner
-- dashboard. Adding a policy to any of them would expose an internal surface.
--
-- These carry the same DDL as their migrations under migrations/2026-08-0*.sql.
-- They belong HERE as well, for the same reason the lead-lost bound does: a
-- database built from this file alone — which is how a staging or local
-- environment gets created — would otherwise be missing every table the admin
-- console reads, and every one of those screens would fail at runtime rather
-- than at deploy.

-- Inbound webhook deliveries we could not process: a bad signature, or a throw
-- inside the handler. Surfaced on the Command Center with a "mark resolved".
-- The source list is provider-NEUTRAL on purpose. It used to name Twilio
-- ('twilio_inbound', 'twilio_status'), which made a CHECK constraint the one
-- place a change of SMS provider fails at the database rather than at a
-- comment — and it fails invisibly, because logWebhookFailure swallows its own
-- insert error. The old two are still legal so existing rows stay readable.
create table if not exists webhook_failures (
  id               uuid primary key default gen_random_uuid(),
  source           text not null check (source in ('stripe','resend','twilio_inbound','twilio_status','sms_inbound','sms_status','sms_voice')),
  event_type       text,              -- Stripe event.type / SMS MessageStatus / Resend event type, when we got far enough to know it
  reference_id     text,              -- Stripe event id / SMS provider message id / Resend email_id, when known
  error_message    text not null,
  payload_excerpt  text,              -- small truncated snippet for debugging — never the full raw body
  resolved_at      timestamptz,
  resolved_by      text,
  created_at       timestamptz not null default now()
);
create index if not exists webhook_failures_unresolved_idx on webhook_failures (created_at desc) where resolved_at is null;
create index if not exists webhook_failures_source_idx on webhook_failures (source, created_at desc);
alter table webhook_failures enable row level security;

-- Delivery outcomes reported by Resend's webhook. One row per send, keyed by
-- provider_id and upserted: a send's status only moves forward (sent ->
-- delivered, or sent -> bounced), so the latest event is the one worth keeping.
-- account_id is nullable because the tag that carries it can be absent.
create table if not exists email_events (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid references accounts(id) on delete set null,
  kind          text not null default 'unknown',
  recipient     text not null,
  provider_id   text not null,
  status        text not null check (status in ('sent','delivered','delayed','bounced','complained')),
  error_reason  text,
  occurred_at   timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  unique (provider_id)
);
create index if not exists email_events_status_idx on email_events (status, occurred_at desc);
create index if not exists email_events_account_idx on email_events (account_id, occurred_at desc);
alter table email_events enable row level security;

-- Staff-authored release and incident log. Manually curated: there is no deploy
-- tracking or incident management anywhere else in this codebase, and one small
-- table staff write by hand is honest about that.
create table if not exists platform_incidents (
  id            uuid primary key default gen_random_uuid(),
  kind          text not null check (kind in ('release','incident')),
  title         text not null,
  description   text,
  severity      text not null default 'info' check (severity in ('info','warning','critical')),
  started_at    timestamptz not null default now(),
  resolved_at   timestamptz,
  created_by    text not null,
  created_at    timestamptz not null default now()
);
create index if not exists platform_incidents_created_idx on platform_incidents (created_at desc);
create index if not exists platform_incidents_active_idx on platform_incidents (started_at desc) where kind = 'incident' and resolved_at is null;
alter table platform_incidents enable row level security;

-- Lightweight internal support-case log. No external help desk exists in this
-- codebase, so staff open a case, thread notes on it, and change its status from
-- /admin. account_id is nullable: a case can be about the platform generally.
create table if not exists support_cases (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid references accounts(id) on delete set null,
  subject       text not null,
  status        text not null default 'open' check (status in ('open', 'pending', 'resolved', 'closed')),
  priority      text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  assigned_to   text,
  sla_due_at    timestamptz,
  -- Who opened it. A staff-opened case is a log; a customer-opened one is
  -- somebody waiting, and the queue should not have to guess from created_by.
  source        text not null default 'staff' check (source in ('staff', 'customer')),
  -- Where a reply goes. Separate from created_by and from the account owner's
  -- login: whoever typed the request is who is waiting on the answer.
  requester_email text,
  created_by    text not null,
  created_at    timestamptz not null default now()
);
create index if not exists support_cases_sla_idx on support_cases (sla_due_at) where status not in ('resolved', 'closed');
create index if not exists support_cases_assigned_idx on support_cases (assigned_to, status);
create index if not exists support_cases_account_idx on support_cases (account_id);
create index if not exists support_cases_account_created_idx on support_cases (account_id, created_at desc);
alter table support_cases enable row level security;

-- Append-only thread per case: ordinary notes plus a kind='status_change' row
-- written whenever the status moves, so the thread alone is a full history.
--
-- The contractor reads this same thread from /dashboard/help, which is what
-- `visibility` governs. It defaults to 'internal' so that a code path which
-- forgets to set it publishes nothing — the only safe direction, since the
-- customer who would see a leaked note is the subject of it.
create table if not exists support_case_notes (
  id            uuid primary key default gen_random_uuid(),
  case_id       uuid not null references support_cases(id) on delete cascade,
  kind          text not null default 'note' check (kind in ('note', 'status_change')),
  visibility    text not null default 'internal' check (visibility in ('internal', 'customer')),
  body          text not null,
  created_by    text not null,
  created_at    timestamptz not null default now()
);
create index if not exists support_case_notes_case_idx on support_case_notes (case_id, created_at);
create index if not exists support_case_notes_visible_idx on support_case_notes (case_id, visibility, created_at);
alter table support_case_notes enable row level security;

-- Staff notes on an account. Append-only, and deliberately distinct from
-- clients.notes, which is a single owner-authored field about a customer.
create table if not exists account_notes (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid not null references accounts(id) on delete cascade,
  body          text not null,
  created_by    text not null,
  created_at    timestamptz not null default now()
);
create index if not exists account_notes_account_idx on account_notes (account_id, created_at desc);
alter table account_notes enable row level security;

create table if not exists account_tags (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid not null references accounts(id) on delete cascade,
  tag           text not null,
  created_by    text not null,
  created_at    timestamptz not null default now(),
  unique (account_id, tag)
);
create index if not exists account_tags_account_idx on account_tags (account_id);
alter table account_tags enable row level security;

-- Staff-uploaded files against an account. The row is the metadata; the file
-- lives in the private 'account-attachments' bucket created below, under
-- ${accountId}/${uuid}.${ext} — the same path convention insurance proof uses,
-- so ownership can be re-checked from the path alone.
create table if not exists account_attachments (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid not null references accounts(id) on delete cascade,
  path          text not null,
  filename      text not null,
  content_type  text,
  size_bytes    bigint,
  uploaded_by   text not null,
  created_at    timestamptz not null default now()
);
create index if not exists account_attachments_account_idx on account_attachments (account_id, created_at desc);
alter table account_attachments enable row level security;

insert into storage.buckets (id, name, public)
values ('account-attachments', 'account-attachments', false)
on conflict (id) do nothing;

-- GDPR/CCPA-style requests logged against an account, with who resolved them.
create table if not exists privacy_requests (
  id            uuid primary key default gen_random_uuid(),
  -- Not a foreign key, for the same reason admin_actions.account_id is not one.
  -- This was `on delete cascade`, so honouring a deletion request destroyed the
  -- proof you had honoured it — the one record that exists to be produced later
  -- by somebody who does not believe you.
  -- deleteAccountAction clears `details` before the account goes, so the free
  -- text cannot outlive the data it may quote; the log itself survives.
  account_id    uuid not null,
  kind          text not null check (kind in ('access', 'deletion', 'correction', 'other')),
  status        text not null default 'open' check (status in ('open', 'resolved')),
  details       text,
  created_by    text not null,
  resolved_at   timestamptz,
  resolved_by   text,
  created_at    timestamptz not null default now()
);
create index if not exists privacy_requests_account_idx on privacy_requests (account_id, created_at desc);
create index if not exists privacy_requests_open_idx on privacy_requests (status) where status = 'open';
alter table privacy_requests enable row level security;

-- Sign-ins, recorded at the three OWNER auth callbacks (OAuth, magic link,
-- phone). Not hooked into ensureAccountMembership, which also runs on every
-- authenticated page load — that would record a "login" per navigation. The
-- crew callback is excluded; this is scoped to the account profile.
create table if not exists login_events (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid not null references accounts(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  method        text not null check (method in ('oauth', 'magic_link', 'phone')),
  ip            text,
  user_agent    text,
  created_at    timestamptz not null default now()
);
create index if not exists login_events_account_idx on login_events (account_id, created_at desc);
alter table login_events enable row level security;

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
-- call_textback_enabled governs the TEXT, not the dial: /api/twilio/voice rings
-- the forward number whatever it is set to, and voice/status checks it before
-- texting. It used to gate the dial, which meant switching the automation off
-- broke the phone number — callers reached a recording instead of a person.
alter table accounts add column if not exists call_textback_enabled boolean not null default false;
alter table accounts add column if not exists call_tracking_number text;
alter table accounts add column if not exists call_forward_number text;
-- Stamped by /api/twilio/voice on the FIRST real call. The only evidence the
-- number's Voice webhook is actually pointed at us — that lives in the Twilio
-- console and is invisible from here, so without this the settings card would be
-- calling a number "connected" purely because somebody typed it into a box.
alter table accounts add column if not exists call_tracking_verified_at timestamptz;
-- UNIQUE: the voice webhook resolves the account with .maybeSingle() on this
-- column, so two accounts sharing a number kills every call to it for both.
create unique index if not exists accounts_call_tracking_unique_idx
  on accounts (call_tracking_number)
  where call_tracking_number is not null;

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

-- ============================================================================
-- Crew pay: approval and payment tracking on the Hours & pay tab.
--
-- Until now Hours & pay was a pure rollup — it read labor costs and totalled
-- them. Nothing recorded that an owner had LOOKED at those hours, agreed them,
-- or paid them, so "did I pay Danny for that week?" had no answer anywhere in
-- the product and the same week could quietly be paid twice.
--
-- Three tables, and the split matters:
--
--   crew_pay_periods  one row per account per pay period, created lazily the
--                     first time someone acts on that period. Its key is
--                     derived from the period itself ('weekly:2026-07-26'), so
--                     the same range always resolves to the same row no matter
--                     who opens it or when.
--
--   crew_pay_entries  one row per crew member per period — the unit of payment.
--                     Payment is NEVER recorded against a person globally: a
--                     worker is paid FOR A PERIOD, and this table is the only
--                     place that fact exists.
--
--   crew_pay_events   append-only audit. Who approved, who paid, who undid it,
--                     and why. Owners can read it and can add to it; nothing in
--                     the product can edit or delete a line of it.
--
-- WHAT "PAID" MEANS HERE. It means the contractor told us they paid. This
-- product does not move money to a crew member, does not calculate or withhold
-- tax and does not talk to a payroll provider — so 'paid' is a record, not a
-- transfer, and every surface says so. 'sent' is the separate, weaker claim
-- that the hours left here as an export.
--
-- SNAPSHOTS, NOT LIVE MATH. Hours live in `costs` and can change after the
-- fact. approved_amount and paid_amount freeze what was agreed and what was
-- paid at the moment each happened, so editing hours afterwards produces a
-- visible difference rather than silently rewriting history.
-- ============================================================================

create table if not exists crew_pay_periods (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid not null references accounts(id) on delete cascade,
  -- Deterministic from mode + start date, e.g. 'weekly:2026-07-26'. Two owners
  -- opening the same week must land on the same row, so this is never random.
  period_key    text not null,
  mode          text not null,
  starts_on     date not null,
  ends_on       date not null,          -- INCLUSIVE, unlike the query bounds
  closed_at     timestamptz,
  closed_by     text,
  reopened_at   timestamptz,
  reopen_reason text,
  created_at    timestamptz not null default now(),
  constraint crew_pay_periods_mode_check check (mode in ('weekly', 'biweekly', 'monthly', 'custom')),
  constraint crew_pay_periods_range_check check (ends_on >= starts_on)
);
create unique index if not exists crew_pay_periods_key_idx on crew_pay_periods (account_id, period_key);
-- Overlap detection: a month contains the weeks inside it, so paying a week and
-- then paying the month would pay it twice. The page warns using this index.
create index if not exists crew_pay_periods_span_idx on crew_pay_periods (account_id, starts_on, ends_on);

create table if not exists crew_pay_entries (
  id                uuid primary key default gen_random_uuid(),
  account_id        uuid not null references accounts(id) on delete cascade,
  period_id         uuid not null references crew_pay_periods(id) on delete cascade,
  -- NOT NULL on purpose. Labor logged without a crew member has nobody to pay,
  -- so it can't have a payment record — the page shows it as ineligible with
  -- the reason, rather than inventing a payee.
  -- ON DELETE RESTRICT: a payment record outlives the roster entry. Archiving a
  -- crew member is the supported way to remove them; hard-deleting someone who
  -- has been paid is refused in the app with that explanation.
  crew_id           uuid not null references crew(id) on delete restrict,
  -- Name at the time, so a historical period still reads correctly after a rename.
  crew_name         text not null default '',
  status            text not null default 'draft',
  regular_hours     numeric(10, 2) not null default 0,
  overtime_hours    numeric(10, 2) not null default 0,
  -- What the hours came to when they were approved. Compared against live hours
  -- to detect an edit made after the fact.
  approved_amount   numeric(12, 2) not null default 0,
  approved_at       timestamptz,
  approved_by       text,
  sent_at           timestamptz,
  sent_by           text,
  -- What was actually paid. Null until paid; frozen afterwards.
  paid_amount       numeric(12, 2),
  paid_at           timestamptz,
  paid_by           text,
  payment_date      date,
  payment_method    text,
  payment_reference text,
  payment_note      text,
  -- Paid entries lock by default so a stray edit can't move money that's gone.
  locked            boolean not null default false,
  currency          text not null default 'USD',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint crew_pay_entries_status_check check (status in ('draft', 'needs_review', 'approved', 'sent', 'paid')),
  -- A payment record without a date is a claim with no time on it.
  constraint crew_pay_entries_paid_check check (status <> 'paid' or (paid_at is not null and payment_date is not null))
);
create unique index if not exists crew_pay_entries_unique_idx on crew_pay_entries (period_id, crew_id);

-- The rules an amount was actually computed under, frozen with it. Nullable:
-- entries approved before these existed genuinely do not know, and inventing a
-- value for them would be worse than admitting it.
alter table crew_pay_entries add column if not exists overtime_threshold numeric(6,2);
alter table crew_pay_entries add column if not exists rounding_rule text;
-- And the BASIS. For an hourly person the frozen lines add up to the amount;
-- for a salaried one they deliberately do not, so without this "why is this
-- $1,384.62" has no answer six months later — the salary may have changed
-- since. pay_basis is human-readable on purpose: a machine could recompute it
-- from the numbers, a person reading a dispute could not.
alter table crew_pay_entries add column if not exists pay_type text;
alter table crew_pay_entries add column if not exists pay_basis text;

-- The entries an approved amount was built from, frozen as they were then.
-- Without them an adjustment can say "$60 more than agreed" and never say which
-- shift moved, and a dispute about hours has nothing to appeal to.
create table if not exists crew_pay_entry_lines (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid not null references accounts(id) on delete cascade,
  pay_entry_id  uuid not null references crew_pay_entries(id) on delete cascade,
  -- SET NULL, not cascade: if the cost is ever removed the LINE must survive,
  -- because the line is the evidence.
  cost_id       uuid references costs(id) on delete set null,
  job_id        uuid references jobs(id) on delete set null,
  description   text,
  logged_at     timestamptz,
  hours         numeric(8,2) not null,
  rate          numeric(10,2) not null,
  amount        numeric(12,2) not null,
  created_at    timestamptz not null default now()
);
create index if not exists crew_pay_entry_lines_entry_idx on crew_pay_entry_lines (pay_entry_id);
create index if not exists crew_pay_entry_lines_cost_idx on crew_pay_entry_lines (cost_id) where cost_id is not null;
create unique index if not exists crew_pay_entry_lines_unique
  on crew_pay_entry_lines (pay_entry_id, cost_id) where cost_id is not null;
alter table crew_pay_entry_lines enable row level security;
-- Read and insert only, like crew_pay_events: evidence the owner can rewrite is
-- not evidence.
drop policy if exists crew_pay_entry_lines_read on crew_pay_entry_lines;
create policy crew_pay_entry_lines_read on crew_pay_entry_lines for select using ( is_owner(account_id) );
drop policy if exists crew_pay_entry_lines_insert on crew_pay_entry_lines;
create policy crew_pay_entry_lines_insert on crew_pay_entry_lines for insert with check ( is_owner(account_id) );
create index if not exists crew_pay_entries_account_idx on crew_pay_entries (account_id, period_id);
create index if not exists crew_pay_entries_crew_idx on crew_pay_entries (account_id, crew_id, paid_at desc);

create table if not exists crew_pay_events (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references accounts(id) on delete cascade,
  period_id   uuid references crew_pay_periods(id) on delete cascade,
  entry_id    uuid references crew_pay_entries(id) on delete set null,
  crew_id     uuid,
  crew_name   text,
  action      text not null,            -- 'hours_approved' | 'marked_paid' | 'paid_undone' | ...
  summary     text not null,            -- human-readable, shown as-is
  actor_email text,
  reason      text,                     -- required by the app for undo / reopen
  meta        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists crew_pay_events_period_idx on crew_pay_events (account_id, period_id, created_at desc);
create index if not exists crew_pay_events_account_idx on crew_pay_events (account_id, created_at desc);

-- --- RLS ---------------------------------------------------------------------
-- Pay is owner-only. Crew members reach the field app, never these tables — a
-- crew member must not be able to read a coworker's rate or the payroll total.

alter table crew_pay_periods enable row level security;
drop policy if exists crew_pay_period_owner on crew_pay_periods;
create policy crew_pay_period_owner on crew_pay_periods for all using ( is_owner(account_id) ) with check ( is_owner(account_id) );

alter table crew_pay_entries enable row level security;
drop policy if exists crew_pay_entry_owner on crew_pay_entries;
create policy crew_pay_entry_owner on crew_pay_entries for all using ( is_owner(account_id) ) with check ( is_owner(account_id) );

-- Append-only for real: owners may read and insert, and there is deliberately
-- no update or delete policy, so a history line can't be rewritten by anyone
-- holding an owner session — including us.
alter table crew_pay_events enable row level security;
drop policy if exists crew_pay_event_owner_read on crew_pay_events;
drop policy if exists crew_pay_event_owner_insert on crew_pay_events;
create policy crew_pay_event_owner_read   on crew_pay_events for select using ( is_owner(account_id) );
create policy crew_pay_event_owner_insert on crew_pay_events for insert with check ( is_owner(account_id) );

-- ============================================================================
-- Day plan preferences — the decisions a contractor makes about a day that
-- aren't yet times on the calendar.
--
-- Today there is exactly one: which stop they mean to end on. It lived in
-- browser state, which meant planning tomorrow's route tonight and finding it
-- gone in the morning — the one moment the feature exists for.
--
-- A property of the DAY, not of the stop. "Which stop am I ending Tuesday on"
-- can't live on a job, because the answer changes when the day is rearranged
-- and the job may not even be on Tuesday any more.
--
-- Note what is NOT here: the running order. That still only reaches the
-- calendar when Save schedule is pressed, deliberately — rearranging the list
-- must never move a customer's appointment behind their back.
-- ============================================================================

create table if not exists day_plan_prefs (
  id           uuid primary key default gen_random_uuid(),
  account_id   uuid not null references accounts(id) on delete cascade,
  plan_date    date not null,
  -- Null means the whole business. A day filtered to one crew gets its own
  -- answer: two crews on the same date end at different places.
  crew_id      uuid references crew(id) on delete cascade,
  -- A job's uuid, or 'rs:<uuid>' for a supply stop — the same id the planner
  -- uses throughout, so it needs no translation on the way in or out. Text
  -- rather than a foreign key precisely because it points at either table;
  -- a stop that no longer exists is filtered out on read, not enforced here.
  preferred_last_id text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- One answer per day per crew. coalesce, because in Postgres two NULL crew_ids
-- are distinct and a plain unique index would happily store the business-wide
-- preference twice.
create unique index if not exists day_plan_prefs_unique_idx
  on day_plan_prefs (account_id, plan_date, coalesce(crew_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index if not exists day_plan_prefs_day_idx on day_plan_prefs (account_id, plan_date);

alter table day_plan_prefs enable row level security;
drop policy if exists day_plan_pref_owner on day_plan_prefs;
create policy day_plan_pref_owner on day_plan_prefs for all using ( is_owner(account_id) ) with check ( is_owner(account_id) );

-- ============================================================================
-- SCHEDULED PAYMENTS — the money that leaves the account on a date, that
-- nothing else in this database knows about.
--
-- Every other cost we hold is attached to a job (`costs.job_id` is NOT NULL) and
-- is recorded AFTER it was spent. That is the right shape for job costing and
-- the wrong shape entirely for "will I make payroll on the 14th": insurance,
-- the truck payment, rent, software, quarterly tax, a materials order placed for
-- next Tuesday — none of them belong to a job, and all of them are known before
-- they happen.
--
-- So this table is deliberately NOT a cost. It is a dated commitment. It never
-- touches job margin, and job costs never appear here.
--
-- `direction` allows an inbound row too, for money the system genuinely cannot
-- know is coming — a financing draw, an equipment sale, an owner contribution.
-- Rare, but without it the only way to model one is to lie about the starting
-- balance.
-- ============================================================================

create table if not exists scheduled_payments (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid not null references accounts(id) on delete cascade,

  label         text not null,
  -- Always POSITIVE. `direction` carries the sign, so a row can never be both
  -- negative and outbound and end up counted as income.
  amount        numeric(12,2) not null check (amount >= 0),
  direction     text not null default 'out' check (direction in ('in', 'out')),
  category      text not null default 'bill'
    check (category in ('payroll', 'materials', 'equipment', 'bill', 'tax', 'loan', 'other')),

  -- For a repeating row this is the FIRST occurrence, not the next one. It never
  -- moves, so the series is reproducible: recomputing the forecast next month
  -- has to place the truck payment on the same days it placed it today.
  due_date      date not null,
  recurrence    text not null default 'once'
    check (recurrence in ('once', 'weekly', 'biweekly', 'monthly')),
  -- Inclusive last day a repeating row may land on. Null = open-ended.
  ends_on       date,

  -- The difference between "the bank will take this" and "it'll be about this".
  -- Drawn differently, and the confirmed-only line ignores anything false.
  confirmed     boolean not null default false,
  active        boolean not null default true,
  note          text,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- A repeating row that ends before it starts produces nothing, silently.
  constraint scheduled_payments_ends_check check (ends_on is null or ends_on >= due_date)
);

-- The forecast reads "everything active that could land in the next N days".
-- A repeating row starting in the distant past is still due tomorrow, so the
-- index can only narrow on account + active, not on the date.
create index if not exists scheduled_payments_account_idx
  on scheduled_payments (account_id, active, due_date);

alter table scheduled_payments enable row level security;
drop policy if exists scheduled_payments_owner on scheduled_payments;
create policy scheduled_payments_owner on scheduled_payments
  for all using ( is_owner(account_id) ) with check ( is_owner(account_id) );

-- ----------------------------------------------------------------------------
-- The two numbers the forecast cannot derive: what is actually in the bank, and
-- how low the owner is willing to let it get. Held on the account so the answer
-- survives a new browser — the whole page is worthless if the starting balance
-- resets to a guess every time it is opened.
--
-- cash_balance_at is what makes the balance honest: a number typed in three
-- weeks ago is not today's balance, and the page has to be able to say so.
-- ----------------------------------------------------------------------------
alter table accounts add column if not exists cash_balance numeric(12,2);
alter table accounts add column if not exists cash_balance_at timestamptz;
alter table accounts add column if not exists cash_buffer numeric(12,2);
-- Overdraft protection or a line of credit: cash you don't have but can reach.
-- Separate from the balance on purpose — borrowing to make payroll and having
-- the money are not the same event, and the chart draws them differently.
alter table accounts add column if not exists cash_credit_line numeric(12,2);

-- ============================================================================
-- When the work actually STARTED.
--
-- The job lifecycle could say "scheduled" and it could say "complete", and had
-- nothing in between. A job sitting on Tuesday's calendar and a job with a crew
-- currently standing in the driveway were the same row, so the pipeline step
-- read "Scheduled / underway" without knowing which of the two it meant.
--
-- A timestamp, not a status: `status` already carries in_progress and would have
-- to invent a value that means "in progress, but really this time". This records
-- the moment, so the client's feed can say when work began and the owner can see
-- how long a job has been open.
--
-- Nullable and undated by default. A job that was never explicitly started is
-- not "started at its creation date" — it is a job nobody pressed the button on,
-- and guessing a time here would put a wrong date in front of the customer.
-- ============================================================================

alter table jobs add column if not exists started_at timestamptz;

-- Only ever read per-job, alongside the row itself, so no index is warranted.

-- ============================================================================
-- Every Extra Stop request that was ASKED FOR, including the ones we refused.
--
-- Until now a refusal left no trace at all: the booking action returned an
-- error and no row was written anywhere. So an owner looking at an empty queue
-- couldn't tell the difference between "nobody asked" and "eleven people asked
-- and we turned all of them away" — which are opposite problems with opposite
-- fixes. One means market it; the other means your visit limit is too tight, or
-- your trade throws off work this was never going to fit.
--
-- Deliberately NOT the same table as extra_stop_requests. A refusal is not a
-- request in a terminal state: it never had a customer, a slot, a hold or a
-- price, and putting it there would pollute the daily-limit counts, the
-- duplicate guard and the queue the owner actually works from.
--
-- PRIVACY. This records what was asked for and why it was answered that way,
-- and nothing about who asked. No name, no phone, no email, no address — a
-- refused enquiry is not a lead, and keeping contact details for somebody we
-- declined to serve would be collecting data we have no use for.
-- ============================================================================

create table if not exists extra_stop_screenings (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid not null references accounts(id) on delete cascade,

  -- 'accepted' is logged too, so the panel can state a rate rather than a
  -- count. A refusal number with no denominator says nothing.
  outcome       text not null check (outcome in ('accepted', 'not_a_fit', 'unsafe')),

  -- The human labels from the same screener the dashboard panel uses, so the
  -- reason a customer saw and the reason the owner reads are the same words.
  exclusions    text[] not null default '{}',
  reason        text,

  -- What they said was wrong, truncated. The one free-text field, and the only
  -- reason it's here is that "3 turned away" teaches nothing while "3 turned
  -- away, all of them water heater replacements" teaches the whole thing.
  issue         text,

  -- What the AI thought it would take, when it got that far.
  visit_minutes int,

  created_at    timestamptz not null default now()
);

-- Only ever read as "this account, last N days".
create index if not exists extra_stop_screenings_account_idx
  on extra_stop_screenings (account_id, created_at desc);

alter table extra_stop_screenings enable row level security;
-- Read-only to the owner. Writes come from the public booking flow through the
-- admin client, which bypasses RLS — so there is deliberately no insert policy:
-- nothing holding a user session should be able to add to this.
drop policy if exists extra_stop_screenings_read on extra_stop_screenings;
create policy extra_stop_screenings_read on extra_stop_screenings
  for select using ( is_owner(account_id) );

-- ============================================================================
-- The day of the month a monthly plan is actually anchored to.
--
-- Monthly rollover clamps into short months — the 31st becomes the 28th — and
-- until now that clamp was PERMANENT, because each step could only see the day
-- it had just landed on. A plan set up on the 31st ran 01-31, 02-28, and then
-- 03-28: one February and the customer is on the 28th forever, having agreed to
-- the last day of the month.
--
-- Storing the agreed day fixes it in one column: February borrows the 28th and
-- March gives the 31st straight back.
--
-- Backfilled from next_run_date, which is the best evidence we have of the day
-- these plans were meant to run on. Plans that have ALREADY drifted keep their
-- drifted day — inventing an original date for them would move real customers'
-- billing to a day nobody agreed to. They stop drifting further, which is the
-- part that matters.
-- ============================================================================

alter table recurring_plans add column if not exists anchor_day int
  check (anchor_day is null or (anchor_day >= 1 and anchor_day <= 31));

update recurring_plans
set anchor_day = extract(day from next_run_date)::int
where anchor_day is null;

-- ============================================================================
-- Extra Stops can reach past today.
--
-- The owner's side already handled any date — the offer form takes a free date
-- input and the route is computed for whatever day it's given. Only the customer
-- ever assumed "today": the booking page asked "can they squeeze you in today"
-- and never recorded which day the customer actually wanted.
--
-- That mismatch quietly capped the feature at the hours left in the afternoon.
-- A contractor whose max visit is four hours has almost no same-day slot for it
-- by 2pm, but plenty of room at 8am tomorrow — and the customer with a dripping
-- faucet is usually fine with tomorrow. Same route-filling idea, a day wider.
--
-- days_ahead is a COUNT OF DAYS BEYOND TODAY, so 0 preserves the old behaviour
-- exactly and is a real choice, not a disabled state. Default 1 (today and
-- tomorrow): the point of the feature is filling a gap you can still see.
-- ============================================================================

alter table accounts add column if not exists extra_stop_days_ahead int not null default 1
  check (extra_stop_days_ahead >= 0 and extra_stop_days_ahead <= 7);

-- Which day the CUSTOMER asked for. Distinct from arrival_date, which is the day
-- the contractor committed to in their offer: the two are usually the same and
-- the whole negotiation lives in the times they aren't. Null on rows created
-- before this existed, and read as "today" — which is what they meant.
alter table extra_stop_requests add column if not exists requested_date date;

-- ============================================================================
-- What the forecast SAID, so it can be held to it.
--
-- The cash-flow page could draw a curve and nag when the balance went stale,
-- and it could never answer the only question that decides whether anyone
-- should trust it: last time, was it right? A forecast nobody can check is a
-- forecast nobody should act on, and a page nobody acts on is a page nobody
-- opens.
--
-- One row per day the owner tells us what's in the bank. `projected` is the
-- curve exactly as it was drawn that day, so the comparison is against what
-- they actually saw — not against a re-derivation from data that has since
-- changed underneath it. That distinction is the whole point: re-running
-- today's inputs through today's code would always look accurate.
--
-- Unique on (account, day) so opening the page twice doesn't create a second
-- version of the same morning.
-- ============================================================================

create table if not exists cash_snapshots (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid not null references accounts(id) on delete cascade,

  taken_on      date not null,
  -- What they said was in the bank, and the floor they were holding to.
  balance       numeric(12,2) not null,
  buffer        numeric(12,2) not null default 0,
  horizon_days  int not null default 30,

  -- The drawn curve: [{ "d": "2026-08-14", "p": 19400.25 }, …]. Compact keys
  -- because this is ~90 entries a row and nothing reads it as prose.
  projected     jsonb not null default '[]'::jsonb,

  created_at    timestamptz not null default now()
);

create unique index if not exists cash_snapshots_day_idx on cash_snapshots (account_id, taken_on);
-- Only ever read as "the most recent one before today".
create index if not exists cash_snapshots_recent_idx on cash_snapshots (account_id, taken_on desc);

alter table cash_snapshots enable row level security;
drop policy if exists cash_snapshots_owner on cash_snapshots;
create policy cash_snapshots_owner on cash_snapshots
  for all using ( is_owner(account_id) ) with check ( is_owner(account_id) );

-- ============================================================================
-- ARRIVAL MANAGEMENT  — "On my way", grown up.
--
-- The first version was a button that fired a text. That is the easy 20% of the
-- problem. What actually goes wrong on the way to a house is: the tech guesses
-- an ETA and is wrong, the homeowner has no way to say "the gate is locked", the
-- tech taps the button twice, the tech taps it on the WRONG job, the text
-- silently fails to send and nobody knows, and a location share that was meant
-- to last twenty minutes keeps running all afternoon.
--
-- So this is a state machine with a promised window, an audit trail, a delivery
-- receipt, and an expiry — not a message send.
--
-- Everything hangs off the existing job_tracking row, because "the visit that is
-- happening right now" is exactly what that row already means.
-- ============================================================================

-- WHO is arriving. A job can have five people assigned; the homeowner should see
-- ONE name and one face, not a convergence of dots. This is the designated
-- arriving contact for this trip.
alter table job_tracking add column if not exists crew_id uuid references crew(id) on delete set null;
alter table job_tracking add column if not exists sent_by text;

-- The PROMISED window. Nullable: a tech who declines to give a time still gets
-- to say "I'm on my way", and a null window renders as exactly that rather than
-- as a promise nobody made.
alter table job_tracking add column if not exists arrival_start timestamptz;
alter table job_tracking add column if not exists arrival_end timestamptz;

-- Location sharing is a SEPARATE, shorter-lived grant than the link itself.
-- Conflating the two is how a tech ends up broadcasting their position for
-- twelve hours because a customer's status page was left open.
alter table job_tracking add column if not exists share_location boolean not null default false;
alter table job_tracking add column if not exists location_expires_at timestamptz;

-- What was actually sent, and whether it actually arrived. "It says sent" and
-- "it sent" are different claims, and only one of them is worth showing a tech
-- who is about to knock on a door unannounced.
alter table job_tracking add column if not exists message_body text;
alter table job_tracking add column if not exists sms_status text;
alter table job_tracking add column if not exists sms_sid text;
alter table job_tracking add column if not exists sms_error text;

-- The homeowner's side of the conversation. One current note (shown back to the
-- tech) — the full history lives in job_feed like every other job event.
alter table job_tracking add column if not exists homeowner_note text;
alter table job_tracking add column if not exists homeowner_note_at timestamptz;

-- Revisions. A second "on my way" for the same trip is an UPDATE, not a new
-- trip, and the count is what lets the UI stop a tech from sending five.
alter table job_tracking add column if not exists revision_count integer not null default 0;
alter table job_tracking add column if not exists last_sent_at timestamptz;

-- The lifecycle. 'delayed' is still en route (a revised promise); the three
-- terminal states below it are outcomes a tech has to be able to record,
-- because "we never showed up" and "nobody was home" look identical in a
-- system that can only say en_route or arrived.
do $$ begin
  alter table job_tracking drop constraint if exists job_tracking_status_check;
  alter table job_tracking add constraint job_tracking_status_check
    check (status in ('en_route', 'delayed', 'arrived', 'no_access', 'rescheduled', 'cancelled', 'done'));
exception when others then null; end $$;

-- ----------------------------------------------------------------------------
-- ACCOUNT SETTINGS for arrival.
-- ----------------------------------------------------------------------------

-- Whether a tech is asked to share location, always shares, or never can.
-- 'ask' is the default on purpose: an employer silently turning on location
-- broadcast for their staff is a thing we should make them choose, not inherit.
-- Master switch for arrival updates. TRUE by default: the feature works for
-- everyone who has it set up, and a switch that defaulted to off would silently
-- stop the texts with nobody finding out until a customer complained.
alter table accounts add column if not exists arrival_updates_enabled boolean not null default true;
alter table accounts add column if not exists arrival_location_policy text not null default 'ask';
do $$ begin
  alter table accounts add constraint accounts_arrival_location_policy_check
    check (arrival_location_policy in ('ask', 'on', 'off'));
exception when duplicate_object then null; end $$;

-- Coordinate precision on the public page. 'street' rounds to ~3 decimal places
-- (about 100m) — enough to show "he's a few blocks away", not enough to be a
-- tracking device pointed at an employee.
alter table accounts add column if not exists arrival_location_precision text not null default 'street';
do $$ begin
  alter table accounts add constraint accounts_arrival_location_precision_check
    check (arrival_location_precision in ('exact', 'street'));
exception when duplicate_object then null; end $$;

-- Exact ETA ("2:15") or a safer window ("between 2:15 and 2:45"). Window is the
-- default because a single promised minute is a promise that gets broken.
alter table accounts add column if not exists arrival_window_style text not null default 'window';
do $$ begin
  alter table accounts add constraint accounts_arrival_window_style_check
    check (arrival_window_style in ('exact', 'window'));
exception when duplicate_object then null; end $$;
alter table accounts add column if not exists arrival_window_minutes integer not null default 30;

-- The remembered common selection, so the tech's usual answer is pre-picked.
alter table accounts add column if not exists arrival_default_minutes integer;

-- The business's own wording, with {{tokens}}. Null = use the built-in default.
alter table accounts add column if not exists arrival_message_template text;

-- How long the status link stays live. Shorter than a day, because it is a
-- link to where somebody's house is being visited.
alter table accounts add column if not exists arrival_link_hours integer not null default 12;

-- ----------------------------------------------------------------------------
-- CREW PERMISSIONS.
--
-- Defaults preserve exactly what every crew member can do today (send + share
-- location + see the customer's number), so applying this migration changes
-- nobody's access. Rescheduling is the one new capability, so it starts OFF —
-- a new power that switches itself on for everyone is not a default, it's a
-- surprise.
-- ----------------------------------------------------------------------------
alter table crew add column if not exists can_send_arrival boolean not null default true;
alter table crew add column if not exists can_share_location boolean not null default true;
alter table crew add column if not exists can_view_client_contact boolean not null default true;
alter table crew add column if not exists can_reschedule boolean not null default false;

-- The public status page reads by token hash (already unique-indexed); the field
-- app and the owner's job screen both ask "is there a live trip on this job?",
-- which is this index.
create index if not exists job_tracking_active_idx
  on job_tracking (account_id, job_id, status) where status not in ('done', 'cancelled');

-- ============================================================================
-- ARRIVAL MANAGEMENT, ROUND TWO — the feedback loop and the proactive half.
-- See migrations/2026-08-03-arrival-phase-two.sql for the reasoning.
-- ============================================================================

-- Did the homeowner open the link? Open RATE is the honest headline; view_count
-- is throttled to one per 10 minutes, because the page auto-refreshes and a raw
-- render count would report a phone on a kitchen counter as an engaged customer.
alter table job_tracking add column if not exists first_viewed_at timestamptz;
alter table job_tracking add column if not exists last_viewed_at timestamptz;
alter table job_tracking add column if not exists view_count integer not null default 0;

-- Nudged-once marker, so a tech who is genuinely stuck isn't told every
-- fifteen minutes for an hour.
alter table job_tracking add column if not exists late_notified_at timestamptz;
-- What the GPS suggested at the moment of sending, so analytics can separate
-- "the ETA was wrong" from "the tech was late leaving".
alter table job_tracking add column if not exists suggested_minutes integer;
create index if not exists job_tracking_late_sweep_idx
  on job_tracking (arrival_end) where status in ('en_route', 'delayed');

-- Travel time vs labor. kind lives here because the existing
-- one-open-shift-per-crew index is exactly the guard we want: travel closes as
-- labor opens, so nobody is ever both driving and working. A travel shift still
-- costs out as labor (it is real money) but under category 'Travel', which
-- keeps the split without touching the cost_type enum every report reads.
alter table time_entries add column if not exists kind text not null default 'labor';
do $$ begin
  alter table time_entries add constraint time_entries_kind_check
    check (kind in ('labor', 'travel'));
exception when duplicate_object then null; end $$;
alter table accounts add column if not exists arrival_clock_travel boolean not null default false;

-- Morning-of confirmation. Separate from the day-before reminder on purpose:
-- that one says "you have an appointment tomorrow", this says "today, between
-- 9 and 11". Stamped per job as the idempotency key.
alter table accounts add column if not exists arrival_morning_confirmation boolean not null default false;
alter table jobs add column if not exists arrival_confirm_sent_at timestamptz;
create index if not exists jobs_morning_confirm_idx
  on jobs (account_id, scheduled_for) where arrival_confirm_sent_at is null;

-- Which of the three treatments this contractor's quote page wears — Classic,
-- Signature or Bold. Presentation only; see src/lib/quote-style.ts for what a
-- style may change and what it may not. Nullable with no default so "never
-- chose" stays distinguishable from "chose the middle one"; every reader puts
-- it through normalizeQuoteStyle, which lands on 'signature' either way.
-- Whether this contractor's customers may change their own optional extras
-- after approving, up to the day the job starts. Off by default: the same
-- control that lets somebody add the gate lets them drop the pressure-washing,
-- possibly off materials already bought, so a contractor opts in. Every rule
-- about when the window shuts lives in src/lib/quote-options.ts and is
-- re-derived server-side at the moment of the write.
alter table accounts add column if not exists client_quote_changes boolean not null default false;
alter table accounts add column if not exists quote_style text;
alter table accounts drop constraint if exists accounts_quote_style_check;
alter table accounts add constraint accounts_quote_style_check
  check (quote_style is null or quote_style in ('classic', 'signature', 'bold'));

-- ============================================================================
-- PROOF-TO-PAY MILESTONES
--
-- A job gets paid in stages. Until now a contractor could request a stage
-- payment at any moment for any amount, and the homeowner's only way to know
-- whether the work behind it happened was to walk outside and look. That
-- asymmetry breaks both ways: homeowners refuse legitimate draws because they
-- can't see progress, and contractors chase money for work they genuinely did
-- with nothing to point at.
--
-- A milestone carries what was PROMISED, the checklist that proves it, the
-- before/after photos, and the amount — and the payment request is gated on
-- that proof existing. See migrations/2026-08-03-proof-to-pay-milestones.sql.
-- ============================================================================

create table if not exists job_milestones (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid not null references accounts(id) on delete cascade,
  job_id        uuid not null references jobs(id) on delete cascade,

  title         text not null,
  -- The promise, in the contractor's words, written before the work rather
  -- than justified after it.
  scope         text,

  amount        numeric(12,2) not null default 0,
  sort_order    integer not null default 0,
  -- Reuses payment_kind so a deposit milestone creates a real deposit payment
  -- and lands in every rollup that already understands one.
  kind          payment_kind not null default 'stage',

  -- 0 means not required. A deposit taken before anyone is on site has nothing
  -- to photograph, and demanding a picture of an empty driveway would only
  -- teach people to upload noise.
  require_before_photos integer not null default 0,
  require_after_photos  integer not null default 0,

  -- When the proof gate was passed. Distinct from the payment's requested_at:
  -- this survives a cancelled payment, so re-requesting doesn't reset the record.
  submitted_at  timestamptz,
  payment_id    uuid references payments(id) on delete set null,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists job_milestones_job_idx on job_milestones (account_id, job_id, sort_order);
create index if not exists job_milestones_payment_idx on job_milestones (payment_id) where payment_id is not null;
alter table job_milestones enable row level security;
drop policy if exists job_milestones_owner on job_milestones;
create policy job_milestones_owner on job_milestones
  for all using ( is_owner(account_id) ) with check ( is_owner(account_id) );

-- The crew's existing checklist becomes the evidence. Pointing a task at a
-- milestone turns the same tick they already do in the field into the proof
-- behind a payment — no second list to learn, and no chance of the "real" list
-- and the "billing" list disagreeing. Null = an ordinary job task, as before.
alter table job_tasks add column if not exists milestone_id uuid references job_milestones(id) on delete set null;
create index if not exists job_tasks_milestone_idx on job_tasks (milestone_id) where milestone_id is not null;

-- Before/after photos. A separate table rather than more entries in
-- jobs.photo_paths, because these carry a role and belong to one stage —
-- flattening them into the job gallery would lose both, and the whole point is
-- showing a homeowner these two pictures next to this one amount.
create table if not exists milestone_photos (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid not null references accounts(id) on delete cascade,
  milestone_id  uuid not null references job_milestones(id) on delete cascade,
  job_id        uuid not null references jobs(id) on delete cascade,
  path          text not null,
  phase         text not null,
  caption       text,
  created_at    timestamptz not null default now()
);
do $$ begin
  alter table milestone_photos add constraint milestone_photos_phase_check
    check (phase in ('before', 'after'));
exception when duplicate_object then null; end $$;
create index if not exists milestone_photos_milestone_idx on milestone_photos (milestone_id, phase, created_at);
alter table milestone_photos enable row level security;
drop policy if exists milestone_photos_owner on milestone_photos;
create policy milestone_photos_owner on milestone_photos
  for all using ( is_owner(account_id) ) with check ( is_owner(account_id) );

-- A heartbeat for the scheduled jobs.
--
-- Fourteen crons are scheduled in vercel.json — including dunning, recurring
-- and plan-installments, which are the three that collect money — and until now
-- none of them recorded that they had run. Each route checked CRON_SECRET,
-- called one library function, and returned a JSON summary to a caller
-- (Vercel's scheduler) that reads the status code and discards the body. There
-- is no APM in this codebase either. So a job that stopped firing, or started
-- throwing on every invocation, was invisible: recurring charges would quietly
-- stop being collected and every screen in the console would look healthy.
--
-- The distinction that makes this worth a table rather than a "last_run_at"
-- column: a row is written when a job STARTS, and updated when it finishes. A
-- job that is killed mid-run — a Vercel timeout past maxDuration, an OOM —
-- leaves a started row that never finishes, and that is the failure mode a
-- success-only timestamp cannot show. It looks identical to "never ran" and it
-- is a completely different problem.
create table if not exists cron_runs (
  id            uuid primary key default gen_random_uuid(),
  -- Matches the route segment under /api/cron, e.g. 'dunning'. Deliberately
  -- not a foreign key to anything: the set of jobs lives in vercel.json and in
  -- lib/cron-jobs.ts, and a job removed from the schedule must not take its
  -- own history with it.
  job           text not null,
  started_at    timestamptz not null default now(),
  -- Null means still running, or killed before it could finish. Those two are
  -- told apart by age, on the health page.
  finished_at   timestamptz,
  ok            boolean,
  duration_ms   integer,
  -- Whatever the job returned — the same summary that used to go only into an
  -- HTTP response body nobody read. Shapes differ per job by design; this is
  -- evidence, not a schema.
  summary       jsonb,
  error         text,
  created_at    timestamptz not null default now()
);

-- The health page's only query shape: newest run per job.
create index if not exists cron_runs_job_started_idx on cron_runs (job, started_at desc);
-- Finding the last SUCCESS is a separate question from finding the last run,
-- and it is the one that decides whether a job is overdue.
create index if not exists cron_runs_job_ok_idx on cron_runs (job, started_at desc) where ok;

-- RLS on with NO policy: unreachable via the anon/authed keys. Only the
-- service-role client can read or write it.
alter table cron_runs enable row level security;

-- Retention. The two 15-minute jobs alone write ~192 rows a day, and the whole
-- schedule is roughly 250/day — call it 90k a year, which is small but grows
-- without bound and has no reason to. Ninety days is longer than any question
-- anyone asks of a heartbeat ("is it running, when did it last work, what did
-- it say when it broke") and short enough that the table stays trivial.
--
-- Deleted by the sweep in lib/cron-runs.ts rather than by a pg_cron job,
-- because pg_cron is not enabled on this project and adding a scheduled job to
-- watch the scheduled jobs has an obvious problem.
create index if not exists cron_runs_started_idx on cron_runs (started_at);
