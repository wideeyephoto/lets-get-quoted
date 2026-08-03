-- The homeowner selection board.
--
-- Colours, materials and fixtures the customer has to choose, with what's
-- allowed for in the quote and what an upgrade costs. It exists to settle one
-- argument in advance: "that is absolutely not the beige I picked."
--
-- Which means the RECORD is the feature. A choice, once made, is frozen with the
-- person's name, the moment, and a snapshot of exactly what they were looking
-- at — because the contractor may reasonably edit that option next month, and
-- doing so must not quietly rewrite what somebody agreed to.

create table if not exists job_selections (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  job_id uuid not null references jobs(id) on delete cascade,

  title text not null,
  description text not null default '',
  -- What the quote already covers for this item. 0 means "nothing allowed for",
  -- which is different from a small allowance and is shown differently.
  allowance numeric not null default 0,
  -- When the contractor needs to know, driven by ordering lead time. Null when
  -- it genuinely doesn't matter yet — inventing a deadline teaches people to
  -- ignore them.
  decide_by date,
  -- Picking under the allowance normally gives the money back; that IS what an
  -- allowance means in a construction contract. Off for contractors who write
  -- theirs as "up to".
  credit_underspend boolean not null default true,

  status text not null default 'open' check (status in ('open', 'chosen', 'cancelled')),

  -- The decision. chosen_snapshot is the whole point: it holds what the option
  -- SAID at the moment it was picked, so editing the option afterwards cannot
  -- change what the customer agreed to.
  chosen_option_id uuid,
  chosen_snapshot jsonb,
  chosen_at timestamptz,
  chosen_by_name text,

  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists job_selections_job_idx on job_selections (account_id, job_id, sort_order);
create index if not exists job_selections_due_idx on job_selections (account_id, decide_by)
  where status = 'open' and decide_by is not null;

alter table job_selections enable row level security;
drop policy if exists job_selections_owner on job_selections;
create policy job_selections_owner on job_selections
  for all using (is_owner(account_id)) with check (is_owner(account_id));

create table if not exists selection_options (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  selection_id uuid not null references job_selections(id) on delete cascade,
  job_id uuid not null references jobs(id) on delete cascade,

  name text not null,
  description text not null default '',
  -- What this option costs, all in. Compared against the selection's allowance
  -- to produce the upgrade or the credit — the customer is never asked to do
  -- that subtraction themselves.
  price numeric not null default 0,
  -- Product code, colour reference, the thing that gets ordered. This is what
  -- ends the beige argument: "Sherwin-Williams SW7036" is not a matter of opinion.
  reference text not null default '',
  photo_path text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists selection_options_idx on selection_options (account_id, selection_id, sort_order);

alter table selection_options enable row level security;
drop policy if exists selection_options_owner on selection_options;
create policy selection_options_owner on selection_options
  for all using (is_owner(account_id)) with check (is_owner(account_id));
