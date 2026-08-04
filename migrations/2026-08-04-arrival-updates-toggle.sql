-- One switch for arrival updates.
--
-- Run this against the production database (Supabase SQL editor) BEFORE the
-- feature will appear. Every read is written to tolerate the column being
-- absent, so until it runs arrival updates behave exactly as they do today.
--
-- Additive only: one column on accounts. Safe to run twice.
--
-- Do NOT apply this with scripts/deploy-schema.mjs — that replays all of
-- schema.sql, including drop policy / create policy pairs, against a live
-- database. This file is the whole change.

begin;

-- Arrival updates had no master switch. Every other automation on that tab has
-- one, and a contractor who wanted to stop the texts had to go and revoke the
-- per-person send permission on Crew & Labor — which is a different decision
-- about different people.
--
-- DEFAULT TRUE, deliberately. The feature works today for everyone who has it
-- set up, and adding a switch that defaults to off would silently turn it off
-- for them: the crew taps "on my way", nothing reaches the customer, and
-- nobody finds out until somebody complains that nobody warned them.
alter table accounts add column if not exists arrival_updates_enabled boolean not null default true;

commit;
