-- Evidence that a tracking number is actually connected.
--
-- Run this against the production database (Supabase SQL editor) BEFORE the
-- feature will appear. Every read tolerates the column being absent, so until
-- it runs the settings card simply reports "waiting for the first call".
--
-- Additive only: one column on accounts. Safe to run twice.
--
-- Do NOT apply this with scripts/deploy-schema.mjs — that replays all of
-- schema.sql, including drop policy / create policy pairs, against a live
-- database. This file is the whole change.

begin;

-- The settings card used to show a green "tracking number connected" the moment
-- somebody typed a number into a box. That is not evidence of anything: the
-- number ALSO has to have its Voice webhook pointed at us inside Twilio, which
-- we cannot see from our side.
--
-- The only honest proof is a call that actually arrived. /api/twilio/voice
-- stamps this the first time it sees one, and the card says "waiting for the
-- first call" until then.
--
-- Nullable with no default on purpose: NULL means "never seen", which is the
-- correct answer for every existing account, including ones whose number does
-- work. It resolves itself on their next call.
alter table accounts add column if not exists call_tracking_verified_at timestamptz;

-- The tracking number was indexed but NOT unique, and /api/twilio/voice resolves
-- the account with .maybeSingle() on it. Two accounts holding the same number
-- makes that throw, which kills every call to it — for both of them. Same shape
-- as the sms_number index above.
--
-- Deliberately NOT `if not exists`-and-shrug: if this fails, two accounts really
-- do share a number and somebody has to decide whose it is. A duplicate that
-- silently stays is a phone line that stops working with no explanation.
create unique index if not exists accounts_call_tracking_unique_idx
  on accounts (call_tracking_number)
  where call_tracking_number is not null;

commit;
