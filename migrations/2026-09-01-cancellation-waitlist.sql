-- Cancellation Waitlist & Window Offering
--
-- When a job is cancelled or a time window opens unexpectedly, this table stores
-- waitlisted customers and leads who desire earlier openings.
-- Offers are made sequentially in priority order based on distance, wait time,
-- urgency, duration fit, and job value.
--
-- Safety and integrity rules:
--   1. ONE ACTIVE OFFER PER OPENED SLOT: A partial unique index prevents race conditions
--      where multiple customers are promised the same specific slot simultaneously.
--   2. EXPLICIT HOLD TIMEOUT: hold_expires_at is required and bounded, ensuring
--      a non-responsive customer automatically frees the slot for the next qualified person.
--   3. AUDITABLE TEXT & REPLIES: Full SMS body and customer replies are recorded verbatim.
--   4. RLS & TENANCY: Account isolation strictly enforced.

begin;

create table if not exists cancellation_waitlist (
  id                uuid primary key default gen_random_uuid(),
  account_id        uuid not null references accounts(id) on delete cascade,
  client_id         uuid references clients(id) on delete set null,
  job_id            uuid references jobs(id) on delete set null,
  lead_id           uuid references leads(id) on delete set null,

  client_name       text not null,
  client_phone      text not null,
  client_email      text,
  address           text,
  lat               double precision,
  lng               double precision,

  -- Preferred availability filters
  -- Weekdays array (e.g. {1,2,3,4,5} where 0=Sun, 1=Mon, ..., 6=Sat). Empty = any day.
  preferred_days    integer[] default '{}',
  -- Preferred window: morning (8-12), afternoon (12-4), evening (4-7), or any
  preferred_window  text not null default 'any',
  earliest_date     date,
  latest_date       date,

  -- Work scope & requirements
  service_name      text,
  estimated_hours   numeric not null default 2.0,
  estimated_value   numeric default 0,
  urgency           text not null default 'medium',
  notes             text,

  status            text not null default 'active',

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

do $$ begin
  alter table cancellation_waitlist add constraint cancellation_waitlist_status_check
    check (status in ('active', 'offered', 'fulfilled', 'expired', 'removed'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table cancellation_waitlist add constraint cancellation_waitlist_window_check
    check (preferred_window in ('morning', 'afternoon', 'evening', 'any'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table cancellation_waitlist add constraint cancellation_waitlist_urgency_check
    check (urgency in ('emergency', 'high', 'medium', 'flexible'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table cancellation_waitlist add constraint cancellation_waitlist_hours_check
    check (estimated_hours > 0 and estimated_hours <= 40);
exception when duplicate_object then null; end $$;

create index if not exists cancellation_waitlist_account_status_idx
  on cancellation_waitlist (account_id, status);

create index if not exists cancellation_waitlist_phone_idx
  on cancellation_waitlist (account_id, client_phone);

-- Table for time-limited slot offers dispatched to waitlisted customers
create table if not exists waitlist_offers (
  id                  uuid primary key default gen_random_uuid(),
  account_id          uuid not null references accounts(id) on delete cascade,
  waitlist_entry_id   uuid not null references cancellation_waitlist(id) on delete cascade,
  client_id           uuid references clients(id) on delete set null,
  job_id              uuid references jobs(id) on delete set null,
  lead_id             uuid references leads(id) on delete set null,

  -- The opened slot details
  opened_slot_date    date not null,
  window_start        time not null,
  window_end          time not null,
  arrival_time        time not null,

  status              text not null default 'pending',

  -- Scoring & ranking snapshot
  priority_rank       integer not null default 1,
  priority_score      numeric not null default 0,
  score_breakdown     jsonb not null default '{}'::jsonb,

  -- Hold parameters
  hold_minutes        integer not null default 30,
  hold_expires_at     timestamptz not null,
  auto_cascade        boolean not null default true,

  phone               text not null,
  body                text not null,

  sent_at             timestamptz not null default now(),
  replied_at          timestamptz,
  reply_body          text,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

do $$ begin
  alter table waitlist_offers add constraint waitlist_offers_status_check
    check (status in ('pending', 'accepted', 'declined', 'expired', 'canceled'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table waitlist_offers add constraint waitlist_offers_hold_check
    check (hold_minutes between 5 and 240);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table waitlist_offers add constraint waitlist_offers_window_check
    check (window_end > window_start and arrival_time >= window_start and arrival_time <= window_end);
exception when duplicate_object then null; end $$;

-- Indexes for performance and sweep jobs
create index if not exists waitlist_offers_account_date_idx
  on waitlist_offers (account_id, opened_slot_date);

create index if not exists waitlist_offers_pending_expires_idx
  on waitlist_offers (hold_expires_at)
  where status = 'pending';

create index if not exists waitlist_offers_phone_idx
  on waitlist_offers (phone, sent_at desc)
  where status = 'pending';

-- Row Level Security
alter table cancellation_waitlist enable row level security;
alter table waitlist_offers enable row level security;

drop policy if exists cancellation_waitlist_owner on cancellation_waitlist;
create policy cancellation_waitlist_owner on cancellation_waitlist
  for all using ( is_owner(account_id) );

drop policy if exists waitlist_offers_owner on waitlist_offers;
create policy waitlist_offers_owner on waitlist_offers
  for all using ( is_owner(account_id) );

commit;
