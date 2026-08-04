-- Telling somebody there is a decision waiting.
--
-- Run this against the production database (Supabase SQL editor) BEFORE the
-- feature will appear. Every read tolerates the columns being absent, so until
-- it runs the board behaves exactly as it does today — which is to say silently.
--
-- Additive only: two columns on job_selections, one on accounts. Safe to run twice.
--
-- Do NOT apply this with scripts/deploy-schema.mjs — that replays all of
-- schema.sql, including drop policy / create policy pairs, against a live
-- database. This file is the whole change.

begin;

-- DECISION_CHASE_DAYS existed only to colour a label. There was no sweep, no
-- text, no email, and selections appeared nowhere in the daily digest — so a
-- homeowner learned they had a decision to make only if they happened to open
-- their job link, and a deadline nobody is reminded of is decoration.
--
-- Two stamps, not one, because there are exactly two moments worth a message:
-- once as the date approaches, once when it has passed. A third would be
-- nagging, and the messages are batched per JOB, so a board of six choices due
-- the same day is one text and not six.
alter table job_selections add column if not exists chase_sent_at timestamptz;
alter table job_selections add column if not exists overdue_sent_at timestamptz;

-- The master switch, like every other automation that texts a customer.
--
-- DEFAULT TRUE: a contractor who typed a decide-by date has already said they
-- want the homeowner chased, and a switch defaulting to off would mean the
-- deadline still goes unmentioned with nobody finding out. Nothing sends for a
-- selection with no date on it either way.
alter table accounts add column if not exists selection_reminders_enabled boolean not null default true;

commit;
