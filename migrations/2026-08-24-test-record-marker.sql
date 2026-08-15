-- Seeded and probe rows say so, instead of being guessed at.
--
-- WHY. Every seeding and smoke-test script in this repo writes into the same
-- tables the owner's lists read, and nothing sits between the query and the
-- screen. Seeded rows inflate the Leads ticker, the average response time, the
-- clients repeat-customer count and the campaign composer's audience totals.
--
-- The only thing that could tell them apart until now was a name/email/phone
-- heuristic (src/lib/test-data-markers.ts): @example.com, the 555 exchange, a
-- J-DEMO- reference, a wholly placeholder name. That heuristic is careful and
-- it stays where it is — it is the ONLY thing that can classify the rows
-- already in the database — but it is structurally incapable of being the
-- production filter. It reads name, email, phone and ref; the seeder also
-- writes JOBS, INVOICES and PAYMENTS, and an invoice has none of those fields.
-- And pointed at a real customer named "Test", it is wrong in the direction
-- that loses somebody their history.
--
-- So the writers mark their own rows. A column is the only thing a payment row
-- can carry.
--
-- APPLY THIS BEFORE the deploy that reads it — the usual rule here, and it is
-- load-bearing this time: a select naming a column that does not exist does not
-- degrade, it errors. The application code shipping alongside this puts the
-- filter behind an option that DEFAULTS TO OFF and passes it nowhere, so the
-- two halves are safe to deploy in either order. Flipping that default is the
-- follow-up, once this is confirmed applied.
--
-- Nullable, no default, no constraint, no backfill. Every row that exists today
-- reads as null, which means "real" — the same answer those rows got before
-- this column existed. Nothing here rewrites a single row.
--
-- The VALUE is the name of the script that wrote it ('seed-customers',
-- 'test-rls'), not a bare true. When somebody finds an unexpected row in a
-- production account six months from now, "which script did this" is the whole
-- question, and a boolean cannot answer it.
--
-- Safe to run twice.
--
-- Do NOT apply this with scripts/deploy-schema.mjs — that replays all of
-- schema.sql against a live database. This file is the whole change.

begin;

alter table clients  add column if not exists test_marker text;
alter table leads    add column if not exists test_marker text;
alter table jobs     add column if not exists test_marker text;
alter table invoices add column if not exists test_marker text;
alter table payments add column if not exists test_marker text;

comment on column clients.test_marker is
  'Set by the seeding/probe script that wrote this row, to its own name. NULL means a real record — that is what every row predating this column reads as, and what the application writes. Never set by application code.';
comment on column leads.test_marker is
  'Set by the seeding/probe script that wrote this row, to its own name. NULL means a real record.';
comment on column jobs.test_marker is
  'Set by the seeding/probe script that wrote this row, to its own name. NULL means a real record. Invoices and payments carry it too, because a name/email heuristic cannot see them.';
comment on column invoices.test_marker is
  'Set by the seeding/probe script that wrote this row, to its own name. NULL means a real record.';
comment on column payments.test_marker is
  'Set by the seeding/probe script that wrote this row, to its own name. NULL means a real record.';

-- No index. The filter these support is `test_marker is null`, which matches
-- almost every row on a healthy account — an index would never be chosen for
-- it, and building five of them is cost with no reader.

commit;
