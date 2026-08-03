-- Cost truth: what a crew hour really costs, what a price-book line really
-- costs, and where every recorded cost came from.

-- 1. LOADED LABOUR COST -------------------------------------------------------
--
-- A crew member on $30/hr does not cost $30/hr. Payroll taxes, workers' comp,
-- unemployment insurance and paid time off land on the employer, and a
-- contractor quoting off the bare wage is quoting a job they will lose money on
-- without ever seeing why.
--
-- Burden is a PERCENTAGE ON TOP of the wage, set once for the account and
-- overridable per person (a licensed electrician and a labourer carry very
-- different comp rates). NULL on a crew member means "use the account's figure",
-- which is why it is nullable and 0 is a real, different answer.
alter table accounts
  add column if not exists default_burden_pct numeric not null default 0;
alter table accounts
  add constraint accounts_default_burden_pct_range check (default_burden_pct between 0 and 200) not valid;

alter table crew
  add column if not exists burden_pct numeric;
alter table crew
  add constraint crew_burden_pct_range check (burden_pct is null or burden_pct between 0 and 200) not valid;

-- The employer-side add-on for a labour cost, snapshotted at clock-out.
--
-- It is a SEPARATE column and NOT folded into costs.amount, because crew pay is
-- computed from costs.amount: multiplying that by a burden factor would inflate
-- every hourly paycheque by the burden percentage. amount stays exactly what it
-- has always been — what the person earns. burden_amount is what the business
-- additionally spends. Only margin adds them together.
--
-- Existing rows default to 0, so no historical margin, report or export moves.
alter table costs
  add column if not exists burden_amount numeric not null default 0;

-- 2. PRICE-BOOK COST ----------------------------------------------------------
--
-- Deliberately NULLABLE with no default. A missing cost is UNKNOWN, not zero:
-- defaulting to 0 would show every un-costed line at a 100% margin, and a margin
-- feature that starts out lying is one nobody trusts afterwards.
alter table services
  add column if not exists unit_cost numeric;
alter table services
  add constraint services_unit_cost_nonneg check (unit_cost is null or unit_cost >= 0) not valid;

-- 3. COST SOURCE --------------------------------------------------------------
--
-- Where a number came from. 'estimated' is a guess, 'price_book' is the
-- contractor's own rate card, 'receipt' and 'supplier_invoice' are evidence, and
-- 'clocked' is measured time from the app itself — which is neither a guess nor
-- a document, and forcing it into 'estimated' would understate how much of a
-- job's cost is actually known.
--
-- 'unspecified' exists for every row recorded before this column did. Requiring
-- a source on those would either fail the migration or invent provenance for
-- numbers whose origin nobody can now recover.
alter table costs
  add column if not exists cost_source text not null default 'unspecified';
alter table costs
  add constraint costs_cost_source_valid
  check (cost_source in ('estimated', 'price_book', 'receipt', 'supplier_invoice', 'clocked', 'unspecified'))
  not valid;

-- Existing clocked labour genuinely IS measured time, so it can be relabelled
-- honestly rather than left as unknown. Anything else keeps 'unspecified'.
update costs c
   set cost_source = 'clocked'
  from time_entries t
 where t.cost_id = c.id
   and c.cost_source = 'unspecified';

-- 4. MINIMUM MARGIN -----------------------------------------------------------
-- The floor an owner wants to be warned below. 0 means "don't warn me".
alter table accounts
  add column if not exists min_margin_pct numeric not null default 0;
alter table accounts
  add constraint accounts_min_margin_pct_range check (min_margin_pct between 0 and 100) not valid;
