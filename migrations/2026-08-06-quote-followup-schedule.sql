-- Quote follow-ups become a schedule instead of four constants in a TypeScript file.
--
--   node scripts/run-migration.mjs 2026-08-06-quote-followup-schedule.sql
--
-- Additive only: four new columns, all defaulted to today's behaviour except the
-- send hour, which could not be preserved (see below). Safe to run twice.
--
-- Do NOT apply this with scripts/deploy-schema.mjs — that replays all of
-- schema.sql, including drop policy / create policy pairs, against a live
-- database. This file is the whole change.

begin;

-- THE CADENCE WAS NEVER A SETTING.
--
-- lib/quote-followups.ts held FOLLOWUP_FIRST_DELAY_DAYS = 2, INTERVAL_DAYS = 3
-- and MAX_FOLLOWUPS = 2, and every account on the platform got exactly that. A
-- contractor selling $200 drain clears and one selling $40k roofs chased on the
-- same two days, and the answer to "can I follow up three times?" was no.
--
-- Absolute day offsets counted from the day the quote was shared: '{2,5}' is the
-- old cadence exactly, so every existing account keeps the behaviour it has.
-- Ascending and de-duplicated, which normalizeFollowupDays enforces on the read
-- as well as the write — see the constraint note below.
alter table accounts
  add column if not exists quote_followup_days integer[] not null default '{2,5}';

-- THE SEND HOUR IS A DELIBERATE CHANGE, not a preservation.
--
-- vercel.json fired /api/cron/quote-followups at 16:00 UTC daily, so the real
-- send moment was "whatever 16:00 UTC is where you are": 11am in New York, 8am
-- in Los Angeles, 6am in Honolulu. Nobody chose 6am. The cron now runs hourly
-- and each account fires when its OWN clock reaches this hour, the same shape
-- appointment reminders moved to earlier today.
--
-- 10am local: late enough that a homeowner is up, early enough to be read before
-- the day gets away from them.
alter table accounts
  add column if not exists quote_followup_hour integer not null default 10;

-- 'auto' texts customers who opted in and emails the rest — the existing
-- behaviour. 'email' never texts, for owners who would rather not use their SMS
-- allowance on chasing. There is deliberately no 'sms' option: texting needs
-- both a mobile on file and a recorded opt-in, so a text-only setting would
-- silently send nothing at all to most customers.
alter table accounts
  add column if not exists quote_followup_channel text not null default 'auto';

-- Off by default, which is the behaviour today: the daily cron fired seven days
-- a week. On, a nudge that would land on a Saturday or Sunday waits for Monday.
alter table accounts
  add column if not exists quote_followup_skip_weekends boolean not null default false;

-- Bounds only. Ascending-and-distinct is enforced by normalizeFollowupDays,
-- which runs on the read path as well as the write, so an array edited straight
-- through PostgREST is re-sorted before the sweep or the card ever sees it.
-- Expressing that here would need a subquery, which a CHECK cannot contain, or a
-- helper function — more schema surface than the invariant is worth when the
-- read path already refuses to trust the column.
alter table accounts
  drop constraint if exists accounts_quote_followup_days_check;
alter table accounts
  add constraint accounts_quote_followup_days_check
  check (
    quote_followup_days is not null
    and cardinality(quote_followup_days) between 1 and 3
    and quote_followup_days <@ '{1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30}'::integer[]
  );

alter table accounts
  drop constraint if exists accounts_quote_followup_hour_check;
alter table accounts
  add constraint accounts_quote_followup_hour_check
  check (quote_followup_hour >= 0 and quote_followup_hour <= 23);

alter table accounts
  drop constraint if exists accounts_quote_followup_channel_check;
alter table accounts
  add constraint accounts_quote_followup_channel_check
  check (quote_followup_channel in ('auto', 'email'));

comment on column accounts.quote_followup_days is
  'Calendar days after a quote is shared that each follow-up is sent. Absolute offsets from the share date, ascending, 1-3 entries. Default {2,5} is the cadence that used to be hardcoded. See src/lib/quote-followups.ts.';
comment on column accounts.quote_followup_hour is
  'Hour (0-23) in the account''s own timezone at which follow-ups are sent. The sweep runs hourly and fires when the account''s local clock reaches this hour, with a few hours of catch-up if a run is missed.';
comment on column accounts.quote_followup_channel is
  'auto = text opted-in customers and email the rest; email = never text. No sms-only option: it would silently send nothing to customers without a recorded opt-in.';
comment on column accounts.quote_followup_skip_weekends is
  'When true, a follow-up whose day lands on a Saturday or Sunday waits until Monday.';

commit;
