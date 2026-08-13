-- Reviews Command Center.
--
-- The reviews page could show four numbers and a list of private notes. It could
-- not answer "who has not replied", "who did I already chase", or "have I dealt
-- with this one yet" — so an owner with an unhappy customer had a paragraph of
-- feedback on screen and no way to mark that they had picked up the phone.
--
-- Four columns, and every one of them exists because a control in the new UI
-- would otherwise be a lie:
--
--   resolved_at         "Mark resolved" on a piece of private feedback.
--   reminders_sent      The activity row says how many times this person has
--   last_reminded_at    been chased, and the resend button refuses a fourth.
--   reminders_stopped_at "Stop reminders" — the owner's own decision to leave
--                       somebody alone, distinct from an SMS STOP (that lives in
--                       sms_consent and is the CUSTOMER's decision; both are
--                       honoured, and neither overwrites the other).
--
-- ADDITIVE AND RE-RUNNABLE. No data is rewritten and no existing column changes
-- meaning: an invite that predates this migration reads as never reminded, never
-- resolved and never stopped, which is exactly what it is.
--
-- Run with:  node scripts/run-migration.mjs 2026-08-18-review-command-center.sql
-- (NOT deploy-schema.mjs — see the warning at the top of every other migration.)

-- "I have dealt with this." Nullable rather than a boolean so the page can say
-- WHEN, which is the difference between a checkbox and a record.
alter table review_invites add column if not exists resolved_at timestamptz;

-- How many times this customer has been asked again. A counter rather than a
-- row-per-reminder table: nothing in the product needs the individual reminder,
-- only "how many" and "how long ago", and a counter cannot drift out of step
-- with a list nobody reads.
alter table review_invites add column if not exists reminders_sent integer not null default 0;
alter table review_invites add column if not exists last_reminded_at timestamptz;

-- The owner's decision to stop chasing this one. Deliberately NOT the same thing
-- as the customer replying STOP — that is sms_consent, it applies to every
-- message to that number rather than to one review ask, and it is not the
-- owner's to set or clear.
alter table review_invites add column if not exists reminders_stopped_at timestamptz;

-- A counter that goes backwards is a bug rather than a state.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'review_invites_reminders_sent_check'
  ) then
    alter table review_invites
      add constraint review_invites_reminders_sent_check check (reminders_sent >= 0);
  end if;
end $$;

-- The activity list is "this account's invites, newest first", every time it
-- loads. Without this it is a sequential scan over the account's whole review
-- history on every page view.
create index if not exists review_invites_account_created_idx
  on review_invites (account_id, created_at desc);
