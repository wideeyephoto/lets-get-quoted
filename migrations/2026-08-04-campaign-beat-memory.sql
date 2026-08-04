-- A marketing calendar that remembers what you already did.
--
-- Run this against the production database (Supabase SQL editor) BEFORE the
-- feature will appear. Every read is written to tolerate the column being
-- absent, so until it runs the calendar behaves exactly as it does today.
--
-- Additive only: one nullable column on campaigns, one partial index. Safe to
-- run twice.
--
-- Do NOT apply this with scripts/deploy-schema.mjs — that replays all of
-- schema.sql, including drop policy / create policy pairs, against a live
-- database. This file is the whole change.

begin;

-- Which seasonal topic a campaign came from, when it came from one.
--
-- Without this the calendar has no memory: it offers "Book a heating tune-up
-- before the first cold snap" in September and offers it again in October,
-- looking exactly as untouched the second time as the first. A contractor
-- cannot tell what they have already done from the page whose whole job is
-- telling them what to do.
--
-- NULL is the normal case and always will be — most campaigns are one-offs the
-- owner wrote themselves, and those belong to no topic. It is deliberately a
-- plain text id (matching BEATS in src/lib/marketing-calendar.ts) and NOT a
-- foreign key: the beats are code, not rows, and a beat that gets retired
-- should not take a contractor's send history with it.
alter table campaigns add column if not exists beat_id text;

-- The lookup is always "which beats has this account sent, ever" — narrow, and
-- only ever interested in rows that HAVE a beat, so the index skips the nulls
-- that make up most of the table.
create index if not exists campaigns_account_beat_idx
  on campaigns (account_id, beat_id)
  where beat_id is not null;

commit;
