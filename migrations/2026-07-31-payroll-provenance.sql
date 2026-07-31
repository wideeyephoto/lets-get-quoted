-- Payroll you can answer questions about six months later.
--
-- Three gaps, all of the same kind: the app could tell you WHAT it decided and
-- never HOW, so an amount could be correct and still be indefensible.
--
-- 1. THE RULES LIVED IN A COOKIE. Pay-period length, the overtime threshold and
--    the rounding rule were per-browser. The same account on a phone and a
--    laptop could total the same week differently — different boundaries,
--    different overtime, different rounding — and nothing recorded which rules
--    an amount was approved under. They move to the account, and a snapshot of
--    them is stamped onto every approval.
--
-- 2. NOTHING RECORDED WHICH ENTRIES AN APPROVAL COVERED. crew_pay_entries held
--    the totals and the money, never the lines. "You paid me for 32 hours, I
--    worked 38" had no answer, and an adjustment could say "$60 more than
--    agreed" without being able to say which shift moved. crew_pay_entry_lines
--    freezes the hours, the rate and the amount of every entry at the moment it
--    was approved.
--
-- 3. THE SAME PERSON COULD APPROVE AND PAY. Fine for a one-person shop, which
--    is most of them — so require_separate_payer is opt-in and defaults false.
--    Where it is on, whoever approved cannot be the one who records payment.
--
-- Additive only. Safe to run twice.
--
-- Do NOT apply this with scripts/deploy-schema.mjs — that replays all of
-- schema.sql, including drop policy / create policy pairs, against a live
-- database. This file is the whole change.

begin;

-- 1. The rules, on the account where every device and every cron can see them.
alter table accounts add column if not exists labor_period_mode text not null default 'weekly';
alter table accounts add column if not exists labor_overtime_threshold numeric(6,2) not null default 40;
alter table accounts add column if not exists labor_rounding text not null default 'none';
-- Set the first time an owner saves them, so the screen can tell a chosen rule
-- from a default it has been assuming — the same distinction the pay day makes.
alter table accounts add column if not exists labor_rules_set_at timestamptz;

do $$ begin
  alter table accounts add constraint accounts_labor_period_mode_check
    check (labor_period_mode in ('weekly', 'biweekly', 'monthly', 'custom'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table accounts add constraint accounts_labor_rounding_check
    check (labor_rounding in ('none', 'quarter', 'tenth'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table accounts add constraint accounts_labor_overtime_check
    check (labor_overtime_threshold between 1 and 168);
exception when duplicate_object then null; end $$;

-- The rules an amount was actually computed under, frozen with it. Nullable:
-- entries approved before this existed genuinely do not know, and inventing a
-- value for them would be worse than admitting it.
alter table crew_pay_entries add column if not exists overtime_threshold numeric(6,2);
alter table crew_pay_entries add column if not exists rounding_rule text;

-- 2. The lines behind an approved amount.
create table if not exists crew_pay_entry_lines (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid not null references accounts(id) on delete cascade,
  pay_entry_id  uuid not null references crew_pay_entries(id) on delete cascade,
  -- The labor row this came from. SET NULL rather than cascade: if the cost is
  -- ever removed the LINE must survive, because the line is the evidence.
  cost_id       uuid references costs(id) on delete set null,
  job_id        uuid references jobs(id) on delete set null,
  description   text,
  -- Frozen at approval. Never rewritten — a later edit shows as a difference
  -- against these, which is the entire point of keeping them.
  logged_at     timestamptz,
  hours         numeric(8,2) not null,
  rate          numeric(10,2) not null,
  amount        numeric(12,2) not null,
  created_at    timestamptz not null default now()
);

create index if not exists crew_pay_entry_lines_entry_idx on crew_pay_entry_lines (pay_entry_id);
create index if not exists crew_pay_entry_lines_cost_idx on crew_pay_entry_lines (cost_id) where cost_id is not null;
-- One line per cost per approval; re-approving replaces rather than doubles.
create unique index if not exists crew_pay_entry_lines_unique
  on crew_pay_entry_lines (pay_entry_id, cost_id) where cost_id is not null;

alter table crew_pay_entry_lines enable row level security;

-- Read and insert only, exactly like crew_pay_events: evidence that the owner
-- can rewrite is not evidence. Corrections are made by undoing the approval,
-- which is itself recorded.
drop policy if exists crew_pay_entry_lines_read on crew_pay_entry_lines;
create policy crew_pay_entry_lines_read on crew_pay_entry_lines for select using ( is_owner(account_id) );
drop policy if exists crew_pay_entry_lines_insert on crew_pay_entry_lines;
create policy crew_pay_entry_lines_insert on crew_pay_entry_lines for insert with check ( is_owner(account_id) );

-- 3. Two-person rule, off by default.
alter table accounts add column if not exists require_separate_payer boolean not null default false;

commit;
