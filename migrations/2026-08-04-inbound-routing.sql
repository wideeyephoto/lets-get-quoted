-- Getting a customer's reply to the right contractor.
--
-- Run this against the production database (Supabase SQL editor) BEFORE the
-- feature will appear. Every read is written to tolerate the column being
-- absent, so until it runs routing behaves as it does today.
--
-- Additive only: one nullable column on accounts, one partial unique index.
-- Safe to run twice.
--
-- Do NOT apply this with scripts/deploy-schema.mjs — that replays all of
-- schema.sql, including drop policy / create policy pairs, against a live
-- database. This file is the whole change.

begin;

-- THE PROBLEM THIS STARTS TO FIX
--
-- Every contractor sends from one shared platform number, so an inbound text
-- carries the customer's number and nothing that says who it is for. Routing
-- guessed, and guessed badly: it picked whichever account had most recently
-- touched that customer's row in the CONSENT ledger — a row that is written by
-- creating a job or requesting a payment, not by talking to anybody.
--
-- So: contractor A texts a homeowner. Contractor B, who also knows that
-- homeowner, creates a job for them the next day. The homeowner replies to A,
-- and their message — the words, the photos — is delivered to B's inbox. Two
-- ordinary actions by two people who did nothing wrong.
--
-- A number of this account's own. When an inbound text arrives addressed To a
-- number claimed here, routing is EXACT and stops guessing entirely — the
-- number is the answer.
--
-- Nothing writes this yet: buying a number per contractor is a real recurring
-- cost and a provisioning decision, not a code change. The column exists so
-- that decision is a small step rather than a rewrite, and so the exact path is
-- already the first thing routing checks.
alter table accounts add column if not exists sms_number text;

-- One number, one account — always, and enforced rather than assumed. Two
-- accounts sharing a claimed number would put routing back where it started
-- while looking like it had been fixed. Partial, because null is the normal
-- case today and every account is null until numbers are bought.
create unique index if not exists accounts_sms_number_idx
  on accounts (sms_number)
  where sms_number is not null;

commit;
