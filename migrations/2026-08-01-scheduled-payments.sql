-- ============================================================================
-- SCHEDULED PAYMENTS — the money that leaves the account on a date, that
-- nothing else in this database knows about.
--
-- Every other cost we hold is attached to a job (`costs.job_id` is NOT NULL) and
-- is recorded AFTER it was spent. That is the right shape for job costing and
-- the wrong shape entirely for "will I make payroll on the 14th": insurance,
-- the truck payment, rent, software, quarterly tax, a materials order placed for
-- next Tuesday — none of them belong to a job, and all of them are known before
-- they happen.
--
-- So this table is deliberately NOT a cost. It is a dated commitment. It never
-- touches job margin, and job costs never appear here.
--
-- `direction` allows an inbound row too, for money the system genuinely cannot
-- know is coming — a financing draw, an equipment sale, an owner contribution.
-- Rare, but without it the only way to model one is to lie about the starting
-- balance.
-- ============================================================================

create table if not exists scheduled_payments (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid not null references accounts(id) on delete cascade,

  label         text not null,
  -- Always POSITIVE. `direction` carries the sign, so a row can never be both
  -- negative and outbound and end up counted as income.
  amount        numeric(12,2) not null check (amount >= 0),
  direction     text not null default 'out' check (direction in ('in', 'out')),
  category      text not null default 'bill'
    check (category in ('payroll', 'materials', 'equipment', 'bill', 'tax', 'loan', 'other')),

  -- For a repeating row this is the FIRST occurrence, not the next one. It never
  -- moves, so the series is reproducible: recomputing the forecast next month
  -- has to place the truck payment on the same days it placed it today.
  due_date      date not null,
  recurrence    text not null default 'once'
    check (recurrence in ('once', 'weekly', 'biweekly', 'monthly')),
  -- Inclusive last day a repeating row may land on. Null = open-ended.
  ends_on       date,

  -- The difference between "the bank will take this" and "it'll be about this".
  -- Drawn differently, and the confirmed-only line ignores anything false.
  confirmed     boolean not null default false,
  active        boolean not null default true,
  note          text,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- A repeating row that ends before it starts produces nothing, silently.
  constraint scheduled_payments_ends_check check (ends_on is null or ends_on >= due_date)
);

-- The forecast reads "everything active that could land in the next N days".
-- A repeating row starting in the distant past is still due tomorrow, so the
-- index can only narrow on account + active, not on the date.
create index if not exists scheduled_payments_account_idx
  on scheduled_payments (account_id, active, due_date);

alter table scheduled_payments enable row level security;
drop policy if exists scheduled_payments_owner on scheduled_payments;
create policy scheduled_payments_owner on scheduled_payments
  for all using ( is_owner(account_id) ) with check ( is_owner(account_id) );

-- ----------------------------------------------------------------------------
-- The two numbers the forecast cannot derive: what is actually in the bank, and
-- how low the owner is willing to let it get. Held on the account so the answer
-- survives a new browser — the whole page is worthless if the starting balance
-- resets to a guess every time it is opened.
--
-- cash_balance_at is what makes the balance honest: a number typed in three
-- weeks ago is not today's balance, and the page has to be able to say so.
-- ----------------------------------------------------------------------------
alter table accounts add column if not exists cash_balance numeric(12,2);
alter table accounts add column if not exists cash_balance_at timestamptz;
alter table accounts add column if not exists cash_buffer numeric(12,2);
-- Overdraft protection or a line of credit: cash you don't have but can reach.
-- Separate from the balance on purpose — borrowing to make payroll and having
-- the money are not the same event, and the chart draws them differently.
alter table accounts add column if not exists cash_credit_line numeric(12,2);
