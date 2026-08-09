-- How this customer may be messaged, carried on the job.
--
-- Run this against the production database BEFORE the picker on the job and
-- lead pages will stick. Until it runs, every reader falls back to 'auto' —
-- exactly today's behaviour — so nothing throws and nothing changes.
--
--   node scripts/run-migration.mjs 2026-08-10-client-message-channel.sql
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

-- THE CONTRACTOR'S HALF OF CONSENT HAD NOWHERE TO LIVE.
--
-- The customer's half already did: sms_consent.opted_out records a STOP reply
-- and every send path checks it. The contractor's half — "don't text this one,
-- she's 80 and reads email" — was asked exactly once, as the "Text quote and
-- sign-off link" checkbox on the quote form, and was never written down. It
-- governed that single send and then evaporated, so the next automation that
-- found a phone number texted her anyway.
--
-- On JOBS rather than only on leads because that is where the automations look.
-- Choice reminders, appointment reminders, the morning-of confirmation, the
-- review request and the arrival texts all start from a job row; a preference
-- that stopped at the lead would be honoured for the quote and forgotten for
-- everything after it, which is the same bug with extra steps. The lead keeps
-- its own copy in triage.messageChannel (JSON, no migration) and hands it over
-- at conversion — see convertLeadToJob.
--
-- NOT NULL DEFAULT 'auto' so every existing job keeps exactly today's
-- behaviour on the day this runs: text if there is a mobile, email if not.
-- 'auto' is deliberately distinct from 'sms'. It means "nobody has decided",
-- and a customer explicitly set to text-only with no mobile on file is a
-- mistake worth showing, while one on 'auto' with no mobile is just an email
-- customer. Collapsing the two would lose that.
alter table jobs
  add column if not exists message_channel text not null default 'auto';

alter table jobs
  drop constraint if exists jobs_message_channel_check;
alter table jobs
  add constraint jobs_message_channel_check
  check (message_channel in ('auto', 'sms', 'email', 'off'));

comment on column jobs.message_channel is
  'How automatic client messages for this job may be delivered. auto = text if a mobile exists else email; sms = never email; email = never text; off = nothing automatic. Resolved together with the phone, the email and the STOP flag by resolveClientChannel in src/lib/client-channel.ts.';

commit;
