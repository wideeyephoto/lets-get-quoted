-- When crew actually get paid.
--
-- Hours & pay could say who was owed money and never when it was due. A period
-- unpaid for three weeks looked exactly like the one that ended yesterday,
-- because nothing in the schema knew what a pay day was — so nothing could be
-- late, nothing could be coming up, and no reminder could be sent.
--
-- Two columns, deliberately not one:
--
--   pay_delay_days  how long after a period ends you settle it. On its own this
--                   covers "we pay five days later".
--   pay_weekday     0=Sun … 6=Sat, or NULL. When set, the pay day is the first
--                   such weekday on or after end+delay — which is how most
--                   shops actually run ("the Friday after"). Without it, a
--                   monthly period ending on a Tuesday would pay on a Sunday.
--
-- Both nullable-with-defaults, so an account that never opens the setting gets
-- "five days after the period ends", which is a defensible guess rather than a
-- claim — and the UI says it is a default until they set one.
--
-- Additive only. Safe to run twice.
--
-- Do NOT apply this with scripts/deploy-schema.mjs — that replays all of
-- schema.sql, including drop policy / create policy pairs, against a live
-- database. This file is the whole change.

begin;

alter table accounts add column if not exists pay_delay_days integer not null default 5;
alter table accounts add column if not exists pay_weekday integer;
-- Set the first time the owner opens the setting, so the page can tell a chosen
-- pay day apart from the default it has been assuming.
alter table accounts add column if not exists pay_day_set_at timestamptz;

do $$ begin
  alter table accounts add constraint accounts_pay_delay_check check (pay_delay_days between 0 and 31);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table accounts add constraint accounts_pay_weekday_check check (pay_weekday is null or pay_weekday between 0 and 6);
exception when duplicate_object then null; end $$;

commit;
