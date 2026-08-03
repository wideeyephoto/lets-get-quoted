-- Arrival management, round two: the feedback loop and the proactive half.
--
-- Round one made a promise. This measures whether it was kept, and starts
-- nudging the people who can still do something about it.
--
-- Safe to re-run; every column is additive and defaults to the round-one
-- behaviour, so nothing changes for an account that never opens the settings.

-- ---------------------------------------------------------------------------
-- DID THEY EVEN OPEN IT?
--
-- A status link nobody opens is a text nobody read, and an arrival window
-- nobody saw is not a promise that was communicated. Open RATE is the honest
-- headline; view_count is throttled below and only ever an approximation,
-- because the page auto-refreshes and would otherwise report a phone left on a
-- kitchen counter as an engaged customer.
-- ---------------------------------------------------------------------------
alter table job_tracking add column if not exists first_viewed_at timestamptz;
alter table job_tracking add column if not exists last_viewed_at timestamptz;
alter table job_tracking add column if not exists view_count integer not null default 0;

comment on column job_tracking.first_viewed_at is
  'First time the homeowner opened the status link. NULL means the text arrived and was never read — the number that matters.';
comment on column job_tracking.view_count is
  'Approximate visits, throttled to one per 10 minutes. The page auto-refreshes, so a raw render count would be meaningless.';

-- ---------------------------------------------------------------------------
-- RUNNING LATE
--
-- Stamped when the sweep has already nudged this trip, so a tech who is
-- genuinely stuck gets told once and not every fifteen minutes for an hour.
-- ---------------------------------------------------------------------------
alter table job_tracking add column if not exists late_notified_at timestamptz;

-- The straight-line drive estimate at the moment of sending, kept so the
-- analytics can ask "was the ETA wrong, or was the tech late leaving?" —
-- two different problems with two different fixes.
alter table job_tracking add column if not exists suggested_minutes integer;

create index if not exists job_tracking_late_sweep_idx
  on job_tracking (arrival_end) where status in ('en_route', 'delayed');

-- ---------------------------------------------------------------------------
-- TRAVEL TIME vs LABOR
--
-- "Optionally start drive time at On My Way; start job time at Arrived; keep
-- travel and labor separate for costing."
--
-- kind lives on time_entries rather than on a new table because the existing
-- one-open-shift-per-crew index is exactly the guard we want: travel closes as
-- labor opens, so a person is never both driving and working.
--
-- Costing stays honest without touching the cost_type enum (which every report,
-- export and margin calculation reads): a travel shift still becomes a labor
-- cost — it is real money — but carries category 'Travel', so anything that
-- wants the split can group on it.
-- ---------------------------------------------------------------------------
alter table time_entries add column if not exists kind text not null default 'labor';
do $$ begin
  alter table time_entries add constraint time_entries_kind_check
    check (kind in ('labor', 'travel'));
exception when duplicate_object then null; end $$;

comment on column time_entries.kind is
  'labor | travel. Travel shifts are opened by "on my way" and closed on arrival, and cost out under category Travel.';

-- Off by default: silently adding drive time to every job would change the
-- margin on work that was already quoted.
alter table accounts add column if not exists arrival_clock_travel boolean not null default false;

-- ---------------------------------------------------------------------------
-- MORNING-OF CONFIRMATION
--
-- Separate from the existing day-before appointment reminder, and deliberately
-- so: that one says "you have an appointment tomorrow", this one says "today,
-- between 9 and 11". Stamped per job so a re-run cannot double-text, and the
-- sweep skips any job that already has a live trip — if the crew has already
-- said they're on the way, a "we'll be there today" text is noise.
-- ---------------------------------------------------------------------------
alter table accounts add column if not exists arrival_morning_confirmation boolean not null default false;
alter table jobs add column if not exists arrival_confirm_sent_at timestamptz;

comment on column jobs.arrival_confirm_sent_at is
  'Morning-of arrival window text. Set once per job; the sweep uses it as the idempotency key.';

create index if not exists jobs_morning_confirm_idx
  on jobs (account_id, scheduled_for) where arrival_confirm_sent_at is null;
