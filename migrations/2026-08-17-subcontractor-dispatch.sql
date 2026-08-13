-- Subcontractor dispatch: saved subs, one job request, many offers, one winner.
--
-- THE SHAPE, and why it is this shape.
--
--   1. A SUBCONTRACTOR IS A CREW ROW. Not a second directory. Everything that
--      already works on a person — assigning them to a job (crew_assignments),
--      texting them (sms_events context='crew'), costing their labor (costs.crew_id),
--      archiving them — keeps working the moment a sub is one of these. A parallel
--      `subcontractors` table would have meant a second assignment table, a second
--      consent ledger and a second answer to "who is on this job".
--      worker_type is what tells the two apart, and it defaults to 'employee' so
--      every row that already exists stays exactly what it was.
--
--   2. THE REQUEST IS THE THING THAT GETS CLAIMED. Not the job. One row per ask,
--      carrying its own copy of what was offered — the pay, the window, the scope
--      as it was written at the time. A sub who accepted $650 on Tuesday must
--      still be able to see $650 on Friday after the job page was edited.
--
--   3. THE OFFER IS PER PERSON, and holds the only copy of the link. One row per
--      recipient, its own hashed token, its own delivery state. "First qualified
--      acceptance wins" is only meaningful if losing is a state somebody's own
--      offer can be in, which is what 'covered' is.
--
--   4. THE CLAIM IS A PARTIAL UNIQUE INDEX, not a promise the app makes.
--      subcontractor_requests_one_winner refuses a second accepted offer on one
--      request at the storage layer, so even if two acceptances somehow got past
--      the conditional UPDATE in lib/subcontractor-dispatch-data, the database
--      would still only ever hold one winner. Belt and braces, deliberately:
--      two subs turning up to one water heater is the failure this whole feature
--      exists to prevent.
--
-- Additive only. New columns are nullable or defaulted; new tables are created
-- if absent. Safe to run twice.
--
-- Do NOT apply this with scripts/deploy-schema.mjs — that replays all of
-- schema.sql, including drop policy / create policy pairs, against a live
-- database. Use: node scripts/run-migration.mjs 2026-08-17-subcontractor-dispatch.sql

begin;

-- ---------------------------------------------------------------------------
-- 1. CREW, extended into a directory of people AND firms.
-- ---------------------------------------------------------------------------

alter table crew add column if not exists worker_type text not null default 'employee';

do $$ begin
  alter table crew add constraint crew_worker_type_check
    check (worker_type in ('employee', 'subcontractor'));
exception when duplicate_object then null; end $$;

-- The firm behind the contact. Null for an employee, and null for a one-man
-- sub who trades under their own name — which is common enough that the UI must
-- never require it.
alter table crew add column if not exists company_name text;

-- What they do and what they will travel for. Arrays rather than a join table:
-- these are tags on a person, only ever read whole, and a `trades` table would
-- add two joins to every match query to store the same six strings.
alter table crew add column if not exists trades text[] not null default '{}';
alter table crew add column if not exists skills text[] not null default '{}';
alter table crew add column if not exists tags text[] not null default '{}';
alter table crew add column if not exists service_area text;
alter table crew add column if not exists travel_radius_miles numeric(6,1);

-- Availability as the sub described it ("weekdays, evenings by arrangement"),
-- plus the one fact worth its own column because it is the one people search on
-- at 11pm.
alter table crew add column if not exists availability_note text;
alter table crew add column if not exists emergency_available boolean not null default false;

-- How they price. hourly_rate and day_rate already exist and keep their meaning;
-- these two say which one they PREFER and the floor below which the trip is not
-- worth making. Fixed-price is the first-class case for dispatch — see the
-- composer, which only offers a fixed number.
alter table crew add column if not exists rate_preference text not null default 'fixed';
alter table crew add column if not exists minimum_charge numeric(10,2);

do $$ begin
  alter table crew add constraint crew_rate_preference_check
    check (rate_preference in ('hourly', 'day_rate', 'fixed'));
exception when duplicate_object then null; end $$;

-- Paperwork. Dates rather than booleans, because "insured" is a claim with an
-- end date on it and a boolean cannot expire. A null date beside a present
-- number means "on file, no expiry recorded" and is shown differently from
-- nothing at all.
alter table crew add column if not exists license_number text;
alter table crew add column if not exists license_expires_on date;
alter table crew add column if not exists insurance_carrier text;
alter table crew add column if not exists insurance_expires_on date;
alter table crew add column if not exists w9_status text not null default 'missing';
alter table crew add column if not exists agreement_status text not null default 'missing';
alter table crew add column if not exists payment_terms text;
alter table crew add column if not exists internal_notes text;

do $$ begin
  alter table crew add constraint crew_w9_status_check
    check (w9_status in ('missing', 'requested', 'on_file'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table crew add constraint crew_agreement_status_check
    check (agreement_status in ('missing', 'sent', 'signed'));
exception when duplicate_object then null; end $$;

-- Where this firm stands with this contractor. Separate from `active`, which
-- stays the roster's on/off switch: a backup sub is active and is not somebody
-- you call first. 'archived' here is a label; archiving for real still means
-- active = false, so nothing downstream has to learn a second rule.
alter table crew add column if not exists sub_status text not null default 'active';

do $$ begin
  alter table crew add constraint crew_sub_status_check
    check (sub_status in ('active', 'preferred', 'backup', 'archived'));
exception when duplicate_object then null; end $$;

-- The match query is always "subs on this account", never "everybody".
create index if not exists crew_worker_type_idx
  on crew (account_id, worker_type) where deleted_at is null;

-- ---------------------------------------------------------------------------
-- 2. THE REQUEST — one ask, put to several firms at once.
-- ---------------------------------------------------------------------------

create table if not exists subcontractor_requests (
  id                uuid primary key default gen_random_uuid(),
  account_id        uuid not null references accounts(id) on delete cascade,
  job_id            uuid not null references jobs(id) on delete cascade,

  status            text not null default 'draft',

  -- What was offered, frozen at the moment of sending. Deliberately copied off
  -- the job rather than joined to it: editing the job next week must not
  -- retroactively change what somebody agreed to, and the sub's own page reads
  -- these columns.
  work_description  text not null,
  service_date      date,
  window_start      time,
  window_end        time,
  -- "Royal Oak, MI" — a place, never the street address. This column is shown
  -- on a public page to people who have not accepted anything yet.
  general_location  text not null default '',

  pay_amount        numeric(10,2) not null,
  pay_kind          text not null default 'fixed',

  required_trade    text not null default '',
  required_skills   text[] not null default '{}',
  requires_license  boolean not null default false,
  requires_insurance boolean not null default false,

  expires_at        timestamptz not null,
  selection_mode    text not null default 'first_accept',

  -- Photos and documents already uploaded against the job, chosen for this ask.
  -- Paths into the same storage buckets the job page uses — not copies.
  document_paths    text[] not null default '{}',

  -- The text as the owner approved it, with [secure link] still in it. Each
  -- offer stores its own rendered copy; this is the template that produced them,
  -- kept so "what did we send" survives an edit to the next request.
  message_body      text not null default '',

  claimed_offer_id  uuid,
  claimed_crew_id   uuid references crew(id) on delete set null,
  claimed_at        timestamptz,
  sent_at           timestamptz,
  cancelled_at      timestamptz,
  reopened_at       timestamptz,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

do $$ begin
  alter table subcontractor_requests add constraint subcontractor_requests_status_check
    check (status in ('draft', 'sent', 'viewed', 'partially_responded', 'claimed', 'expired', 'cancelled', 'reopened'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table subcontractor_requests add constraint subcontractor_requests_mode_check
    check (selection_mode in ('first_accept', 'collect_interest'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table subcontractor_requests add constraint subcontractor_requests_pay_kind_check
    check (pay_kind in ('fixed', 'hourly', 'day_rate'));
exception when duplicate_object then null; end $$;

-- Paying a sub nothing is a typo, not an offer.
do $$ begin
  alter table subcontractor_requests add constraint subcontractor_requests_pay_check
    check (pay_amount > 0);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table subcontractor_requests add constraint subcontractor_requests_window_check
    check (window_start is null or window_end is null or window_end > window_start);
exception when duplicate_object then null; end $$;

-- A claimed request has a winner, and an unclaimed one does not. Without this
-- a bug could leave `claimed` sitting over three null columns, which reads on
-- every screen as "somebody took it" and names nobody.
do $$ begin
  alter table subcontractor_requests add constraint subcontractor_requests_claim_check
    check (
      (status = 'claimed') = (claimed_offer_id is not null)
      and (claimed_offer_id is null) = (claimed_at is null)
    );
exception when duplicate_object then null; end $$;

-- ONE LIVE REQUEST PER JOB. A second open ask on the same job is how two subs
-- end up claiming one water heater from two different links.
create unique index if not exists subcontractor_requests_one_live_per_job
  on subcontractor_requests (job_id)
  where status in ('draft', 'sent', 'viewed', 'partially_responded', 'reopened');

create index if not exists subcontractor_requests_account_idx
  on subcontractor_requests (account_id, created_at desc);

create index if not exists subcontractor_requests_open_idx
  on subcontractor_requests (account_id, expires_at)
  where status in ('sent', 'viewed', 'partially_responded', 'reopened');

alter table subcontractor_requests enable row level security;
drop policy if exists subcontractor_requests_owner on subcontractor_requests;
create policy subcontractor_requests_owner on subcontractor_requests
  for all using (is_owner(account_id)) with check (is_owner(account_id));

-- ---------------------------------------------------------------------------
-- 3. THE OFFER — one row per recipient, one link per row.
-- ---------------------------------------------------------------------------

create table if not exists subcontractor_offers (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid not null references accounts(id) on delete cascade,
  request_id    uuid not null references subcontractor_requests(id) on delete cascade,
  crew_id       uuid not null references crew(id) on delete cascade,

  -- ONLY THE HASH. The link is shown once, in the text that goes out; a
  -- database read must not be able to reconstruct a working one. Unique so a
  -- token collision is a failed insert rather than two offers answering to one
  -- URL.
  token_hash    text not null unique,

  status        text not null default 'queued',

  phone         text not null,
  -- Exactly what this person was sent, link and all. Not a template id: when a
  -- sub says "you told me eleven o'clock", a template that has since been
  -- edited is not an answer.
  body          text not null default '',
  provider_id   text,
  error_reason  text,

  -- What we believed when we picked them, kept for the audit trail — a match
  -- explained after the fact from today's data is not an explanation.
  distance_miles numeric(6,1),
  match_reason   text,

  queued_at     timestamptz not null default now(),
  sent_at       timestamptz,
  delivered_at  timestamptz,
  viewed_at     timestamptz,
  responded_at  timestamptz,

  decline_reason text,
  question       text,
  -- "Keep me as backup", offered to everybody who arrives too late.
  backup         boolean not null default false,

  -- THE WINNER FLAG, and why it is not just status='accepted'.
  --
  -- Under "collect interest and let the owner choose", several firms accept —
  -- each one is saying "I can do it", and none of them has the job yet. So
  -- 'accepted' cannot be the thing the one-winner index is built on, or the
  -- second firm to put their hand up would be refused by the database. `won` is
  -- set on exactly one offer per request: immediately on acceptance in
  -- first-qualified mode, and when the owner picks in the other.
  won            boolean not null default false,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  unique (request_id, crew_id)
);

do $$ begin
  alter table subcontractor_offers add constraint subcontractor_offers_status_check
    check (status in ('queued', 'sent', 'delivered', 'failed', 'viewed', 'accepted', 'declined', 'expired', 'covered'));
exception when duplicate_object then null; end $$;

-- THE WINNER, ENFORCED BY STORAGE. See note 4 at the top of this file, and the
-- note on `won` above for why this is not keyed on status = 'accepted'.
create unique index if not exists subcontractor_offers_one_winner
  on subcontractor_offers (request_id) where won;

-- A winner has accepted. Nothing else may carry the flag.
do $$ begin
  alter table subcontractor_offers add constraint subcontractor_offers_won_check
    check (not won or status = 'accepted');
exception when duplicate_object then null; end $$;

create index if not exists subcontractor_offers_request_idx
  on subcontractor_offers (request_id, created_at);

create index if not exists subcontractor_offers_crew_idx
  on subcontractor_offers (account_id, crew_id, created_at desc);

alter table subcontractor_offers enable row level security;
-- Owners see and manage their own offers. The public proposal page reads and
-- writes through the service-role client, which bypasses RLS — it has no
-- session and is authorised by the token instead.
drop policy if exists subcontractor_offers_owner on subcontractor_offers;
create policy subcontractor_offers_owner on subcontractor_offers
  for all using (is_owner(account_id)) with check (is_owner(account_id));

-- The claim points at a real offer. Added after the offers table exists.
do $$ begin
  alter table subcontractor_requests add constraint subcontractor_requests_claimed_offer_fkey
    foreign key (claimed_offer_id) references subcontractor_offers(id) on delete set null;
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- 4. THE PRIVATE REVIEW — the contractor's own note on how it went.
--
-- Deliberately NOT the `reviews` table. That one holds what customers say in
-- public and feeds the review-request flow and the public site; a sub's score
-- for cleanliness has no business anywhere near it. Same reason this is keyed on
-- (job, crew) rather than on a client.
-- ---------------------------------------------------------------------------

create table if not exists subcontractor_reviews (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid not null references accounts(id) on delete cascade,
  job_id        uuid not null references jobs(id) on delete cascade,
  crew_id       uuid not null references crew(id) on delete cascade,
  request_id    uuid references subcontractor_requests(id) on delete set null,

  work_quality  smallint not null,
  communication smallint not null,
  on_time       smallint not null,
  cleanliness   smallint not null,
  within_price  boolean not null default true,
  hire_again    boolean not null default true,
  notes         text,

  author_email  text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  unique (job_id, crew_id)
);

do $$ begin
  alter table subcontractor_reviews add constraint subcontractor_reviews_scores_check
    check (
      work_quality between 1 and 5
      and communication between 1 and 5
      and on_time between 1 and 5
      and cleanliness between 1 and 5
    );
exception when duplicate_object then null; end $$;

create index if not exists subcontractor_reviews_crew_idx
  on subcontractor_reviews (account_id, crew_id, created_at desc);

alter table subcontractor_reviews enable row level security;
drop policy if exists subcontractor_reviews_owner on subcontractor_reviews;
create policy subcontractor_reviews_owner on subcontractor_reviews
  for all using (is_owner(account_id)) with check (is_owner(account_id));

-- ---------------------------------------------------------------------------
-- 5. THE TEXT LEDGER, extended rather than duplicated.
--
-- sms_events already records every crew-directed text with its consent verdict,
-- its provider id and its failure reason. A subcontractor offer is a crew-
-- directed text; it gets a context and three event types, not a second table.
-- ---------------------------------------------------------------------------

alter table sms_events drop constraint if exists sms_events_context_check;
do $$ begin
  alter table sms_events add constraint sms_events_context_check
    check (context in ('payment', 'crew', 'subcontractor'));
exception when duplicate_object then null; end $$;

alter table sms_events drop constraint if exists sms_events_event_type_allowed;
do $$ begin
  alter table sms_events add constraint sms_events_event_type_allowed
    check (event_type in (
      'payment_requested','payment_paid','payment_failed','payment_refunded',
      'crew_assigned','crew_scheduled',
      'sub_offer','sub_offer_covered','sub_offer_won','sub_offer_cancelled'
    ));
exception when duplicate_object then null; end $$;

-- A subcontractor row targets a crew member, exactly like a crew row does.
alter table sms_events drop constraint if exists sms_events_target_check;
do $$ begin
  alter table sms_events add constraint sms_events_target_check
    check (
      (context = 'payment' and payment_id is not null)
      or (context in ('crew', 'subcontractor') and crew_id is not null)
    );
exception when duplicate_object then null; end $$;

commit;
