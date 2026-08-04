-- Reusable selection boards.
--
-- Run this against the production database (Supabase SQL editor) BEFORE the
-- feature will appear. Reads are written to tolerate the table being absent, so
-- until it runs the board behaves exactly as it does today.
--
-- Additive only: one new table. Safe to run twice.
--
-- Do NOT apply this with scripts/deploy-schema.mjs — that replays all of
-- schema.sql, including drop policy / create policy pairs, against a live
-- database. This file is the whole change.

begin;

-- A painter runs the same six choices on every interior job and was retyping
-- them each time, product codes and all. That is the difference between a
-- feature used once and a feature used on job number two.
--
-- The board is stored as one jsonb document rather than three normalised
-- tables. Nothing queries inside a template — it is read whole, written whole,
-- and applied whole — so the tables would be machinery with no reader.
create table if not exists selection_templates (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  name text not null,
  -- { items: [{ title, description, allowance, creditUnderspend, options: [...] }] }
  --
  -- Deliberately NOT holding decide_by: a needed-by date belongs to a job, and
  -- copying one from a template would either be in the past or be a deadline
  -- nobody chose. The contractor sets it on the job.
  body jsonb not null default '{"items":[]}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One name per account: saving over an existing name should replace it, which
-- is what a contractor means by "save this as Interior repaint" the second time.
create unique index if not exists selection_templates_name_idx
  on selection_templates (account_id, lower(name));

alter table selection_templates enable row level security;
drop policy if exists selection_templates_owner on selection_templates;
create policy selection_templates_owner on selection_templates
  for all using (is_owner(account_id)) with check (is_owner(account_id));

commit;
