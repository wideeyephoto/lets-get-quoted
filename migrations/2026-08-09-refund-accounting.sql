-- Refunds had no date of their own, and reversed platform fees had no record.
--
-- Both admin money readers filtered refunds with `.gte('paid_at', …)` because
-- paid_at was the only timestamp on the row. So "Refunds issued (30 days)"
-- actually meant "refunds on payments PAID in the last 30 days" — a refund
-- issued today against a ninety-day-old charge appeared in no window at all.
--
-- The second half is worse because it moves the number the wrong way. Refunds
-- are created with refund_application_fee: true (see src/lib/payments.ts), so
-- Stripe hands our platform fee back in proportion to the refund — but nothing
-- recorded that, and "Platform fees (30 days)" was gross of every reversal.
-- Two errors in opposite directions on a page whose own lead text invites
-- reconciliation.

-- WHEN the money went back.
alter table payments add column if not exists refunded_at timestamptz;

-- How much of the platform fee went back with it. A SEPARATE column rather than
-- a decrement of platform_fee: that column is documented as never retroactively
-- re-rated once paid, it is what was actually charged, and a correction that
-- overwrites the original is not a correction anybody can audit.
alter table payments add column if not exists platform_fee_refunded numeric(12,2) not null default 0;

-- Backfill. paid_at is the only timestamp these rows have, so historical refunds
-- keep exactly the dating they already had — no worse than today, and correct
-- from here on. Rows refunded after this migration carry a true refunded_at.
update payments
   set refunded_at = paid_at
 where refunded_amount > 0
   and refunded_at is null;

-- Proportional, matching what Stripe returned at the time. Guarded against a
-- zero or null amount rather than trusting the data.
update payments
   set platform_fee_refunded = round((platform_fee * (refunded_amount / amount))::numeric, 2)
 where refunded_amount > 0
   and platform_fee is not null
   and amount is not null
   and amount > 0
   and platform_fee_refunded = 0;

-- Refund reporting reads (refunded_at) across every account, so it cannot use
-- any of the existing account-scoped indexes. Partial: refunded rows are a small
-- fraction of the table and the unrefunded ones are never selected by it.
create index if not exists payments_refunded_at_idx
  on payments (refunded_at)
  where refunded_amount > 0;
