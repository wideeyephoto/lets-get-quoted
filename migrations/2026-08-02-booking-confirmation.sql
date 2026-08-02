-- Online bookings wait for the contractor before they reach the calendar.
--
-- Until now a self-serve booking created a job with scheduled_for already set,
-- so a stranger could put work on a contractor's calendar with no one agreeing
-- to it. The customer email always said "this time isn't locked in until they
-- confirm" — the behaviour was the thing that disagreed.
--
-- WHY THE REQUESTED SLOT IS NOT scheduled_for.
-- The pending job is created with scheduled_for NULL and the customer's chosen
-- window parked in these columns instead. That is the whole safety property:
-- every calendar, every capacity count, Plan my day, appointment reminders and
-- the daily digest already filter on `scheduled_for is not null`, so an
-- unconfirmed booking cannot leak into any of them through a query someone
-- forgot to update. Confirming copies the requested slot into scheduled_for,
-- which is the single moment the job becomes real.

alter table jobs
  add column if not exists booking_requested_date date,
  add column if not exists booking_requested_time text,
  add column if not exists booking_confirmed_at timestamptz,
  add column if not exists booking_declined_at timestamptz;

comment on column jobs.booking_requested_date is
  'The day a self-serve booking asked for. Set only by the public booking page. While booking_confirmed_at and booking_declined_at are both null this job is a REQUEST and is deliberately not on any calendar.';
comment on column jobs.booking_requested_time is
  'The 24h "HH:MM" window start the customer chose, copied into scheduled_time on confirmation.';
comment on column jobs.booking_confirmed_at is
  'When the contractor confirmed. Setting this is what moves the requested slot into scheduled_for.';
comment on column jobs.booking_declined_at is
  'When the contractor turned the request down. Frees the held slot for other customers.';

-- Pending requests are read on two hot paths: the panel that lists them, and
-- the availability calculation that has to treat a requested window as taken.
-- Partial, because a confirmed or declined booking is never queried this way.
create index if not exists jobs_pending_booking_idx
  on jobs (account_id, booking_requested_date)
  where booking_requested_date is not null
    and booking_confirmed_at is null
    and booking_declined_at is null;
