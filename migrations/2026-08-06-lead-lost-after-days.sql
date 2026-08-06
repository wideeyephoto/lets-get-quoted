-- How long a lead sits before the app gives up on it.
--
-- Run this against the production database BEFORE the selector on the Leads
-- page will stick. Until it runs, the reader catches the missing column and
-- every account keeps the old fixed 30 days, so nothing throws and nothing
-- changes.
--
--   node scripts/run-migration.mjs 2026-08-06-lead-lost-after-days.sql
--
-- (or paste it into the Supabase SQL editor — the runner exists so the same
-- change can be applied the same way twice, with a lock_timeout in front of it.)
--
-- Additive only: one new column. Safe to run twice.
--
-- Do NOT apply this with scripts/deploy-schema.mjs — that replays all of
-- schema.sql, including drop policy / create policy pairs, against a live
-- database. This file is the whole change.

begin;

-- THIRTY DAYS WAS A CONSTANT IN THE CODE, and it was wrong for most people who
-- noticed it. A roofer chasing storm work writes a lead off in a fortnight; a
-- kitchen fitter is still in conversation at ninety days and had the app quietly
-- close the lead underneath them. expireStaleLeads runs on four different page
-- loads, so by the time anyone saw the status it had already changed.
--
-- NOT NULL DEFAULT 30 so every existing account keeps exactly today's behaviour
-- on the day this runs. The setting is a choice they now have, not a change made
-- on their behalf.
--
-- ZERO MEANS NEVER. A nullable column would have said the same thing more
-- prettily, but null is also what a missing column reads as, and "the migration
-- has not run yet" and "this owner switched auto-lost off" are not the same
-- state — conflating them would silently stop expiring leads on every account
-- the moment the code shipped ahead of the SQL.
alter table accounts
  add column if not exists lead_lost_after_days integer not null default 30;

alter table accounts
  drop constraint if exists accounts_lead_lost_after_days_check;
alter table accounts
  add constraint accounts_lead_lost_after_days_check
  check (lead_lost_after_days >= 0 and lead_lost_after_days <= 3650);

comment on column accounts.lead_lost_after_days is
  'Days after a lead arrives before it is auto-marked lost. Counted from created_at, and only applied to leads still new/contacted/quoted. 0 = never auto-mark. See expireStaleLeads in src/lib/leads.ts.';

commit;
