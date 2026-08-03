-- Photo-to-Change-Order.
--
-- A crew member opens a wall, finds rotted sheathing, and photographs it. Today
-- that photo lands in a folder and the extra work gets agreed by phone, argued
-- about later, and sometimes never billed at all. A change order is the object
-- that turns the find into a decision the homeowner made in writing.

create table if not exists change_orders (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  job_id uuid not null references jobs(id) on delete cascade,

  -- Who found it. Kept as a snapshot alongside the id because the person who
  -- documented the condition matters months later, and crew leave.
  crew_id uuid references crew(id) on delete set null,
  crew_name text,

  -- draft   : the crew member wrote it up; the owner hasn't priced or sent it
  -- sent    : with the homeowner, awaiting a decision
  -- approved: they said yes, in writing
  -- declined: they said no — kept, because "we told you about the rot" is the
  --           whole reason to record this at all
  -- void    : the owner withdrew it
  status text not null default 'draft'
    check (status in ('draft', 'sent', 'approved', 'declined', 'void')),

  title text not null,
  -- What the crew member actually said, in their words. Never overwritten by the
  -- drafted version: it's the primary record of the condition found on site.
  field_note text not null default '',
  -- The write-up shown to the homeowner. Editable by the owner.
  scope text not null default '',
  photo_paths text[] not null default '{}',

  -- Priced line items, same shape as a quote's. Money comes from the price book,
  -- never from the model — see src/lib/quote-draft.ts.
  items jsonb not null default '[]'::jsonb,
  amount numeric not null default 0,
  -- What it costs to deliver, for the margin impact. Null = unknown, not free.
  estimated_cost numeric,

  sent_at timestamptz,
  responded_at timestamptz,
  -- Typed name + the decision. This is what "signed" means here: a named person
  -- clicked approve on a page only they had the link to.
  signature_name text,
  decline_reason text,

  -- Set when approval triggers a deposit request for the added work.
  payment_id uuid references payments(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists change_orders_job_idx on change_orders (account_id, job_id, created_at desc);

alter table change_orders enable row level security;

drop policy if exists change_orders_owner on change_orders;
create policy change_orders_owner on change_orders
  for all using (is_owner(account_id)) with check (is_owner(account_id));

-- Crew may raise one and read their own. They may NOT price it or send it: a
-- change order is a bill, and deciding what to charge is the owner's job.
drop policy if exists change_orders_crew_insert on change_orders;
create policy change_orders_crew_insert on change_orders
  for insert with check (
    crew_id in (select id from crew where crew.account_id = change_orders.account_id and crew.user_id = auth.uid())
  );

drop policy if exists change_orders_crew_read on change_orders;
create policy change_orders_crew_read on change_orders
  for select using (
    crew_id in (select id from crew where crew.account_id = change_orders.account_id and crew.user_id = auth.uid())
  );
