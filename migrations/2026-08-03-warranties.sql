-- Warranty and service history.
--
-- The relationship does not end when the invoice is paid. Two years later a
-- homeowner has a problem and cannot remember who did the work, what was
-- covered, or whether they are still inside the period. They call somebody else.
--
-- This is the record that stops that happening — and it is worth as much to the
-- contractor as to the customer, because "that's outside your warranty" is only
-- a defensible thing to say when there is a dated document saying so.

create table if not exists warranties (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  job_id uuid not null references jobs(id) on delete cascade,
  client_id uuid references clients(id) on delete set null,

  title text not null,
  -- What is covered, and — just as importantly — what is not. Both are shown to
  -- the homeowner, because a warranty that only lists inclusions is one that
  -- gets argued about at the first exclusion.
  covers text not null default '',
  excludes text not null default '',

  -- Dates, not durations. A duration has to be recalculated by every reader and
  -- gets it wrong at a month boundary; a date is a fact.
  starts_on date not null,
  ends_on date,

  -- Manufacturer paperwork, uploaded. Separate from the contractor's own labour
  -- warranty, which is what `title`/`covers` usually describe.
  document_paths text[] not null default '{}',
  -- "Flush the tank every 6 months. Do not pressure-wash the sealant."
  maintenance_notes text not null default '',

  -- The recurring service this warranty depends on, if any. Some manufacturer
  -- warranties are void without documented annual servicing, and a homeowner
  -- who does not know that finds out at the worst possible moment.
  service_interval_months integer check (service_interval_months is null or service_interval_months between 1 and 120),
  next_service_due date,
  last_service_on date,
  -- Stamped when a reminder goes out, so the sweep cannot send twice.
  service_reminded_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists warranties_job_idx on warranties (account_id, job_id);
create index if not exists warranties_client_idx on warranties (account_id, client_id);
-- The sweep's query: everything due, oldest first.
create index if not exists warranties_service_due_idx on warranties (account_id, next_service_due)
  where next_service_due is not null;

alter table warranties enable row level security;
drop policy if exists warranties_owner on warranties;
create policy warranties_owner on warranties
  for all using (is_owner(account_id)) with check (is_owner(account_id));

-- A homeowner asking for help under warranty. Kept separate from the warranty
-- itself: one warranty can be claimed against more than once, and a declined
-- claim is a record worth keeping.
create table if not exists warranty_claims (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  warranty_id uuid not null references warranties(id) on delete cascade,
  job_id uuid not null references jobs(id) on delete cascade,

  status text not null default 'open'
    check (status in ('open', 'scheduled', 'resolved', 'declined')),
  description text not null,
  photo_paths text[] not null default '{}',
  -- Snapshotted at the moment of claiming. Whether the work was in warranty
  -- ON THE DAY THEY REPORTED IT must not change later because a date rolled by
  -- while the contractor took a week to respond.
  in_warranty_at_claim boolean not null default true,

  -- The visit raised to deal with it, if one was.
  resolution_job_id uuid references jobs(id) on delete set null,
  resolution_note text,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists warranty_claims_idx on warranty_claims (account_id, status, created_at desc);

alter table warranty_claims enable row level security;
drop policy if exists warranty_claims_owner on warranty_claims;
create policy warranty_claims_owner on warranty_claims
  for all using (is_owner(account_id)) with check (is_owner(account_id));

-- Account default, so a contractor sets their labour warranty once rather than
-- typing "1 year" onto every finished job. 0 = they don't offer one.
alter table accounts
  add column if not exists default_warranty_months integer not null default 0;
alter table accounts
  add constraint accounts_default_warranty_months_range
  check (default_warranty_months between 0 and 600) not valid;
