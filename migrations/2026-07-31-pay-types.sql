-- People who are not paid by the hour.
--
-- Every amount in this product is hours × rate. That is one way of being paid,
-- and the app treats it as the only one — so a salaried foreman or a day-rate
-- subcontractor has to be entered as fake hours to get paid at all, and the
-- overtime threshold then gets applied to a number that was never hours in the
-- first place. The totals are not merely incomplete, they are wrong.
--
-- WHAT hourly_rate NOW MEANS. It stays, and it stays NOT NULL, but for a
-- non-hourly person it is no longer what they are paid — it is what an hour of
-- their time COSTS A JOB. The app derives it when their pay type is saved
-- (salary ÷ 2080, day rate ÷ 8), so every existing consumer — createCost, the
-- field app, job margin, Labor by job — keeps working untouched and keeps
-- costing their time to the jobs they worked on. Only PAYROLL changes.
--
-- Two facts are kept apart that used to be one:
--   what a job pays for  ->  hourly_rate, on every costs row, unchanged
--   what a person is owed ->  pay_type + annual_salary / day_rate, per period
--
-- Nullable on purpose. A salary of 0 and "no salary recorded" are different
-- things, and defaulting either to zero would quietly pay somebody nothing.
--
-- Additive only. Safe to run twice.
--
-- Do NOT apply this with scripts/deploy-schema.mjs — that replays all of
-- schema.sql, including drop policy / create policy pairs, against a live
-- database. This file is the whole change.

begin;

alter table crew add column if not exists pay_type text not null default 'hourly';
alter table crew add column if not exists annual_salary numeric(12,2);
alter table crew add column if not exists day_rate numeric(10,2);

do $$ begin
  alter table crew add constraint crew_pay_type_check
    check (pay_type in ('hourly', 'salary', 'day_rate'));
exception when duplicate_object then null; end $$;

-- A pay type with nothing behind it would total to zero every period without
-- ever saying why, so the amount has to be present and positive for the type
-- that needs it. Hourly is unconstrained: hourly_rate is already NOT NULL.
do $$ begin
  alter table crew add constraint crew_pay_amount_check
    check (
      pay_type <> 'salary'   or (annual_salary is not null and annual_salary > 0)
    );
exception when duplicate_object then null; end $$;

do $$ begin
  alter table crew add constraint crew_day_rate_check
    check (
      pay_type <> 'day_rate' or (day_rate is not null and day_rate > 0)
    );
exception when duplicate_object then null; end $$;

-- The basis an approved amount was computed under, frozen with it — the same
-- reason overtime_threshold and rounding_rule are stamped on the entry. Six
-- months later "why is this $1,384.62" has to have an answer, and for a
-- salaried person that answer is not in the hours.
alter table crew_pay_entries add column if not exists pay_type text;
-- Human-readable, deliberately: "Salary $72,000.00/yr ÷ 52 weeks". A machine
-- can recompute from pay_type and the numbers; a person reading a dispute six
-- months later cannot, because the salary may have changed since.
alter table crew_pay_entries add column if not exists pay_basis text;

commit;
