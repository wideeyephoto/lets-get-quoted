begin;

alter table recurring_plans drop constraint if exists recurring_plans_frequency_check;
alter table recurring_plans add constraint recurring_plans_frequency_check
  check (frequency in ('weekly', 'biweekly', 'monthly', 'quarterly', 'semi-annual', 'annual'));

alter table recurring_plans add column if not exists prepaid boolean not null default false;

commit;
