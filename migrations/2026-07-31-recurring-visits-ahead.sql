-- Recurring visits as real jobs, created ahead of the day they happen.
--
-- Until now a plan's job was created on the morning of the visit, so a weekly
-- plan showed an empty calendar all week and there was nothing to assign crew
-- to, route, or drag. Creating them ahead needs one thing the schema didn't
-- have: a durable link from the job back to the plan AND to the visit it is.
--
-- Why the visit date is stored on the job rather than inferred from
-- scheduled_for: the owner is allowed to drag a recurring job to another day.
-- If the daily sweep looked it up by scheduled_for it would find nothing and
-- create a SECOND job for the same visit. recurring_visit_date never moves, so
-- the visit and the calendar slot can disagree without the sweep double-booking.
--
-- The unique index is what makes creating visits ahead idempotent: topping the
-- horizon up on every cron run, on every plan edit, and at creation time all
-- converge on the same rows rather than piling up duplicates.
--
-- Additive only: two nullable columns and one partial unique index. Every
-- existing job keeps meaning exactly what it meant. Safe to run twice.
--
-- Do NOT apply this with scripts/deploy-schema.mjs — that replays all of
-- schema.sql, including drop policy / create policy pairs, against a live
-- database. This file is the whole change.

begin;

alter table jobs add column if not exists recurring_plan_id uuid references recurring_plans(id) on delete set null;
-- The visit this job IS, in the plan's cadence. Immutable — rescheduling the
-- job changes scheduled_for, never this.
alter table jobs add column if not exists recurring_visit_date date;

-- One job per plan per visit, enforced by the database rather than by every
-- caller remembering to look first.
create unique index if not exists jobs_recurring_visit_unique
  on jobs (recurring_plan_id, recurring_visit_date)
  where recurring_plan_id is not null and recurring_visit_date is not null;

-- "Which visits has this plan already put on the calendar?" — asked on every
-- top-up.
create index if not exists jobs_recurring_plan_idx
  on jobs (recurring_plan_id, recurring_visit_date)
  where recurring_plan_id is not null;

commit;
