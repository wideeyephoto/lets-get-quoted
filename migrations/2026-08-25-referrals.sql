-- A tracked referral engine: two nullable columns, and nothing else.
--
-- WHY SO LITTLE. "Referral" was a campaign template — a blast asking customers
-- to send friends, with a plain booking link that attributed nothing. Making it
-- real needs three things: a per-customer code, a way to tie a booked job back
-- to the referrer, and a record of what was owed. Only the third is a schema
-- question.
--
--   The CODE is not stored. It is HMAC(accountId.clientId), recomputed on
--   verify (src/lib/referral.ts) — so there is no codes table, no unique index,
--   no generator, no collision retry and no backfill. Nothing to migrate.
--
--   The ATTRIBUTION is not stored either. createLead's insert already names
--   `triage`, so the verified referrer id rides into the row as
--   triage.referredBy with no migration and no deploy ordering on the capture
--   half. It is deliberately NOT a column for exactly that reason: a column
--   would force the separate best-effort UPDATE that jobs.message_channel needs
--   (src/lib/leads.ts), and would make capture depend on this file being run.
--
--   What IS here is the money-shaped half, and it is here BECAUSE it is
--   money-shaped. See the note on referral_settled_at.
--
-- APPLY THIS BEFORE the deploy that reads it. A select naming a column that
-- does not exist does not degrade, it errors. Until the owner-facing page
-- ships, nothing in the application reads or writes either column, so this is
-- safe to run well ahead of it — and safe to run on its own today.
--
-- ADDITIVE AND RE-RUNNABLE. Two nullable columns, no default, no constraint, no
-- backfill. Every row that exists today reads as null, which means exactly what
-- it meant before this file: no reward configured, nothing settled.
--
-- Run with:  node scripts/run-migration.mjs 2026-08-25-referrals.sql --check
--            node scripts/run-migration.mjs 2026-08-25-referrals.sql
-- (NOT deploy-schema.mjs — see the warning at the top of every other migration.)

begin;

-- The promise, in the owner's own words: "$50 off your next service",
-- "a $25 gift card", "a free spring tune-up".
--
-- TEXT, NOT A NUMBER, and that is the product decision rather than a shortcut.
-- There is no client-scoped ledger in this schema to spend a number out of —
-- account_credits is scoped to the ACCOUNT and is the contractor's own billing
-- balance, readable only by its owner, and the invoice rails cannot express
-- this either (jobs.reschedule_discount_percent is CHECK-capped at 40 percent,
-- and addInvoiceItem refuses a non-positive amount). Home-services referral
-- rewards are gift cards, cash and a discount agreed on the phone; the engine's
-- job is to make the debt visible and undeniable, not to move the money.
--
-- It doubles as the per-account ON SWITCH: null or empty means no referral link
-- is rendered into any outbound copy, and every account starts that way.
alter table accounts add column if not exists referral_reward text;

-- "I have thanked this person." The one fact the engine cannot derive.
--
-- A COLUMN, NOT A TRIAGE KEY — the one place this feature spends a migration,
-- and it is worth it. getLeadTriage does not read the triage blob, it REBUILDS
-- it field by known field, so a key nothing parses survives until the next
-- snooze, archive, decline or logged call and then vanishes with no error.
-- That bug has already shipped here once. Losing an attribution is mild and
-- self-correcting; losing THIS one means the owner pays the same person twice.
-- A column cannot rot, and listLeads' select('*') reads it with no code change.
--
-- Nullable rather than a boolean so the row records WHEN, which is the
-- difference between a checkbox and a record — and "still owed" is simply null.
alter table leads add column if not exists referral_settled_at timestamptz;

commit;
