-- Handing a pay period to a payroll provider.
--
-- The export was one generic spreadsheet with our own column names. Two things
-- were wrong with it as a way of paying people:
--
-- 1. NOBODY IS MATCHED BY NAME. Every payroll provider keys on its own employee
--    id, and matching on "Mike Torres" breaks the first time somebody is
--    "Michael" in one system, or two people share a name — which this roster
--    already manages. payroll_id is the crew member's id IN THE PROVIDER, and
--    the partial unique index below is the guard that matters: two crew rows
--    pointing at one payroll employee would pay that person twice.
--
-- 2. The provider has to be remembered somewhere. It decides the shape of the
--    file, not just its column names — a salaried employee belongs in an hours
--    import differently from an hourly one, and getting that wrong is how
--    somebody gets paid their salary twice in one run.
--
-- Additive only. Safe to run twice.
--
-- Do NOT apply this with scripts/deploy-schema.mjs — that replays all of
-- schema.sql, including drop policy / create policy pairs, against a live
-- database. This file is the whole change.

begin;

-- This person's id in the payroll provider. Free text: ADP calls it a File #,
-- Gusto an Employee ID, and neither is a uuid.
alter table crew add column if not exists payroll_id text;

-- Two crew rows aimed at one payroll employee is a double payment. Partial, so
-- the many crew with no payroll id at all don't collide with each other.
create unique index if not exists crew_payroll_id_unique
  on crew (account_id, payroll_id) where payroll_id is not null and deleted_at is null;

alter table accounts add column if not exists payroll_provider text;

do $$ begin
  alter table accounts add constraint accounts_payroll_provider_check
    check (payroll_provider is null or payroll_provider in ('generic', 'gusto', 'quickbooks', 'adp', 'paychex'));
exception when duplicate_object then null; end $$;

commit;
