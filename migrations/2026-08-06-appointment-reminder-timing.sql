-- When appointment reminders go out, as a setting instead of an accident.
--
--   node scripts/run-migration.mjs 2026-08-06-appointment-reminder-timing.sql
--
-- Additive only: two new columns. Safe to run twice.
--
-- Do NOT apply this with scripts/deploy-schema.mjs — that replays all of
-- schema.sql, including drop policy / create policy pairs, against a live
-- database. This file is the whole change.

begin;

-- THERE WAS NO SEND TIME BEFORE THIS, only a side effect.
--
-- runAppointmentReminders() added one UTC day to now() and matched that against
-- jobs.scheduled_for, and vercel.json fired the cron at 22:00 UTC. So the real
-- send moment was "whatever 22:00 UTC is where you are": 6pm in New York, 5pm in
-- Chicago, 3pm in Los Angeles, noon in Honolulu. It was correct only because
-- 22:00 UTC happens to fall after the UTC date rollover for every US zone — move
-- the cron to 09:00 UTC and Honolulu starts reminding people about the wrong day.
--
-- The card could therefore only ever say "the day before" and stay silent about
-- the rest, which is what the owner asked to fix. Both halves are now stored,
-- and the sweep runs hourly and fires when the account's OWN clock reaches the
-- hour below.
alter table accounts
  add column if not exists appointment_reminder_lead_days integer not null default 1;

-- 9am local, which is a deliberate change of behaviour and not a preservation of
-- the old one. Existing accounts move from roughly 6pm the evening before to 9am
-- the morning before; that was chosen explicitly rather than backfilled to the
-- old effective hour, and there are six accounts, all the owner's own.
alter table accounts
  add column if not exists appointment_reminder_hour integer not null default 9;

alter table accounts
  drop constraint if exists accounts_appointment_reminder_lead_days_check;
alter table accounts
  add constraint accounts_appointment_reminder_lead_days_check
  check (appointment_reminder_lead_days >= 1 and appointment_reminder_lead_days <= 30);

alter table accounts
  drop constraint if exists accounts_appointment_reminder_hour_check;
alter table accounts
  add constraint accounts_appointment_reminder_hour_check
  check (appointment_reminder_hour >= 0 and appointment_reminder_hour <= 23);

comment on column accounts.appointment_reminder_lead_days is
  'Calendar days before a scheduled job that its reminder is sent. 1 = the day before. See src/lib/appointment-reminders.ts.';
comment on column accounts.appointment_reminder_hour is
  'Hour (0-23) in the account''s own timezone at which reminders are sent. The sweep runs hourly and fires when the account''s local clock reaches this hour, with a few hours of catch-up if a run is missed.';

commit;
