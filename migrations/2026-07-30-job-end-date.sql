-- Per-job end date for multi-day work.
--
-- Run this against the production database (Supabase SQL editor). Until it
-- runs, the calendar keeps deriving a job's span from
-- ceil(estimated_hours / accounts.schedule_day_hours) exactly as it does today
-- — getJobEndDate() catches the missing column and reads it as null, so nothing
-- throws and nothing changes.
--
-- Additive only: one nullable column on an existing table. It drops nothing and
-- changes no existing value. Safe to run twice.
--
-- Do NOT apply this with scripts/deploy-schema.mjs — that replays all of
-- schema.sql, including drop policy / create policy pairs, against a live
-- database. This file is the whole change.

begin;

-- NULL means "single day, or work it out from estimated_hours" — i.e. exactly
-- what every existing row already means. No backfill: inferring an end date for
-- past jobs would invent a fact nobody entered.
alter table jobs add column if not exists scheduled_until date;

-- An end date before the start date would draw a negative span. The app blocks
-- it, but the app is not the guarantee.
do $$ begin
  alter table jobs add constraint jobs_scheduled_until_after_for
    check (scheduled_until is null or scheduled_for is null or scheduled_until >= scheduled_for);
exception when duplicate_object then null; end $$;

-- The calendar reads a month at a time and now has to catch jobs that STARTED
-- before the window but run into it.
create index if not exists jobs_scheduled_span_idx on jobs (account_id, scheduled_for, scheduled_until);

commit;
