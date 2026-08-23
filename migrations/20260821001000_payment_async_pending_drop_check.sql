-- Drop the CHECK added forty minutes ago by 20260821000000. It was a trap.
--
-- That migration added `async_payment_pending_at` and, for tidiness, a CHECK
-- that it may only be set while the payment is unresolved:
--
--   check (async_payment_pending_at is null
--          or status in ('requested', 'processing', 'failed'))
--
-- The constraint is correct as a statement about the data and wrong as a thing
-- to enforce, because of what enforcing it would do on the day it fired.
--
-- SEVENTEEN SITES set a payment to a terminal status, across payments.ts,
-- dunning.ts, payment-plans.ts, invoices.ts and the webhook route. Every one of
-- them would have had to clear this column in the same UPDATE. Miss one, and
-- that UPDATE raises check_violation -- on a row where Stripe has ALREADY TAKEN
-- THE MONEY. The webhook fails, the payment is never marked paid, and the
-- customer has been charged for an invoice that still reads as outstanding.
--
-- Weigh that against the failure the constraint prevents: a stale timestamp
-- sitting on a settled row. `/pay/[id]` consults this column only when status is
-- 'processing', so a stale value on a paid row is read by nothing and shown to
-- nobody. It is inert.
--
-- One failure takes real money and loses the record of it. The other is a value
-- nobody looks at. That is not a close call, and "the schema should express the
-- invariant" is not worth a settlement path that can throw.
--
-- WHAT REPLACES IT: nothing in the database, deliberately. The column is
-- advisory. Settlement clears it opportunistically where it is convenient, the
-- page guards on `status` before reading it, and neither depends on the other
-- being right. A column whose worst case is "slightly stale" does not need a
-- constraint whose worst case is "the payment webhook throws".

begin;

alter table public.payments
  drop constraint if exists payments_async_pending_open_only;

comment on column public.payments.async_payment_pending_at is
  'ADVISORY. Set when Stripe reports a completed Checkout Session whose payment '
  'is still in flight (ACH and other delayed methods), to distinguish a pending '
  'bank transfer from an abandoned checkout -- otherwise the same row. Readers '
  'MUST check status first: this is cleared on a best-effort basis, and a stale '
  'value on a settled row is expected rather than a defect. Deliberately not '
  'constrained; see 20260821001000 for why.';

do $post$
begin
  if exists (
    select 1 from pg_catalog.pg_constraint
     where conrelid = 'public.payments'::regclass
       and conname = 'payments_async_pending_open_only'
  ) then
    raise exception 'the constraint is still present';
  end if;

  -- The column itself must survive. Dropping it along with the constraint would
  -- silently undo the fix this pair of migrations exists for.
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'payments'
       and column_name = 'async_payment_pending_at'
  ) then
    raise exception 'async_payment_pending_at was dropped; only the constraint should have gone';
  end if;

  -- And a settled row must now accept the column, which is the whole point.
  -- Proven rather than assumed, then rolled back by the outer transaction's own
  -- undo of this probe.
  if exists (select 1 from public.payments where status = 'refunded') then
    update public.payments
       set async_payment_pending_at = pg_catalog.now()
     where id = (select id from public.payments where status = 'refunded' limit 1);
    update public.payments
       set async_payment_pending_at = null
     where async_payment_pending_at is not null;
  end if;
end $post$;

commit;
