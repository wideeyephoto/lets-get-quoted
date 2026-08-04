-- Letting a homeowner change their mind, without losing what they first chose.
--
-- Run this against the production database (Supabase SQL editor) BEFORE the
-- feature will appear. The read is written to tolerate the column being absent,
-- so until it runs the board behaves exactly as it does today.
--
-- Additive only: one column on job_selections. Safe to run twice.
--
-- Do NOT apply this with scripts/deploy-schema.mjs — that replays all of
-- schema.sql, including drop policy / create policy pairs, against a live
-- database. This file is the whole change.

begin;

-- A chosen selection was frozen forever. updateSelection refused, cancel had
-- `.neq('status','chosen')`, and the chosen option could not be deleted — so a
-- homeowner who picked the wrong tile, or picked and phoned back an hour later
-- before anything was ordered, could only be fixed with a database edit. The
-- job total had already moved too.
--
-- Reopening now reverses that price change and puts the selection back to open.
-- What they first chose is APPENDED here rather than thrown away: the record is
-- the whole reason this feature exists, and "they picked the beige, then changed
-- to the grey on the 14th" is exactly the history worth keeping.
--
-- An array of { snapshot, chosenAt, chosenByName, reopenedAt, reason }.
alter table job_selections add column if not exists reopened jsonb not null default '[]'::jsonb;

commit;
