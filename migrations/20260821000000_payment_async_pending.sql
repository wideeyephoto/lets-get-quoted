-- Tell "the bank is clearing it" apart from "they closed the tab".
--
-- THE BUG THIS FIXES, on the page where it matters most. `payments.status`
-- becomes 'processing' the instant a Checkout Session is CREATED
-- (createCheckoutSessionForPayment), not when money starts moving. So a
-- homeowner who clicks Pay, sees Stripe, and closes the tab lands back on
-- /pay/[id] in exactly the same row state as one whose $8,000 bank transfer is
-- genuinely in flight.
--
-- The page then tells both of them the same thing:
--
--   "This payment is processing. Bank transfers (ACH) can take a few business
--    days to clear -- you'll be confirmed once it settles."
--
-- For the abandoned checkout -- which is the common case, not the edge one --
-- that is false in the most expensive direction available: the homeowner
-- believes they have paid, the contractor is never paid, and nobody finds out
-- until somebody chases an invoice weeks later. And because the page ALSO
-- renders the Pay button for 'processing', the genuinely-in-flight homeowner is
-- invited to pay a second time.
--
-- WHY A NEW COLUMN AND NOT stripe_payment_intent. The intent id is the obvious
-- carrier and the wrong one: `admin-payments.ts` treats a non-null intent as
-- "there is something here to refund against", and dunning retrieves it as a
-- prior attempt. Writing one onto a row that has not been charged would make an
-- unpaid payment look refundable to the staff console. A column that means one
-- thing cannot be quietly given a second meaning.
--
-- WHY THE WEBHOOK HAS TO CHANGE TOO. `checkout.session.completed` is currently
-- handled only when `session.payment_status === 'paid'`. The ACH case arrives on
-- that same event with payment_status 'unpaid' and is dropped on the floor --
-- which is precisely why the two situations are indistinguishable in the row.
-- This column is the thing that event will now record.
--
-- NULLABLE AND UNSET FOR EVERY EXISTING ROW. Nothing is backfilled: for a row
-- that already exists we genuinely do not know which of the two happened, and
-- guessing would put the wrong sentence in front of a homeowner. Unset reads as
-- "not known to be in flight", which is the safe default -- it offers the Pay
-- button, and a duplicate payment is recoverable in a way a silently unpaid
-- invoice is not.

begin;

alter table public.payments
  add column if not exists async_payment_pending_at timestamptz;

comment on column public.payments.async_payment_pending_at is
  'Set when Stripe reports a completed Checkout Session whose payment is still '
  'in flight (ACH and other delayed methods). Distinguishes a genuinely pending '
  'bank transfer from an abandoned checkout, which are otherwise the same row. '
  'Cleared when the payment settles or fails.';

-- A pending async payment is only meaningful while the payment is unresolved. A
-- paid or refunded row carrying this timestamp means something failed to clear
-- it, and the page would show "your bank transfer is clearing" over a payment
-- that already settled.
alter table public.payments
  drop constraint if exists payments_async_pending_open_only;
alter table public.payments
  add constraint payments_async_pending_open_only
  check (
    async_payment_pending_at is null
    or status in ('requested', 'processing', 'failed')
  );

do $post$
declare
  v_count integer;
  v_probe uuid;
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'payments'
       and column_name = 'async_payment_pending_at'
  ) then
    raise exception 'async_payment_pending_at was not added';
  end if;

  -- Nothing was backfilled. A guess here becomes a sentence a homeowner reads
  -- about their own money.
  select pg_catalog.count(*) into v_count
    from public.payments where async_payment_pending_at is not null;
  if v_count > 0 then
    raise exception 'this migration set % row(s); it must only add the column', v_count;
  end if;

  -- Prove the constraint bites rather than trusting that it was created. A
  -- CHECK that is never exercised is indistinguishable from one that is always
  -- true, and this repo has shipped one of those before.
  -- Probed by UPDATE against a real settled row rather than by INSERT. The
  -- first version inserted a synthetic payment and died on job_id NOT NULL,
  -- never reaching the CHECK -- and reported that it could not run instead of
  -- passing, which is the only reason the hole was visible.
  select id into v_probe
    from public.payments
   where status not in ('requested', 'processing', 'failed')
   limit 1;

  if v_probe is null then
    if not exists (
      select 1 from pg_catalog.pg_constraint
       where conrelid = 'public.payments'::regclass
         and conname = 'payments_async_pending_open_only'
    ) then
      raise exception 'the open-only constraint was not created';
    end if;
    -- Said out loud. A silent skip would read as a pass.
    raise notice 'no settled payment exists, so the constraint is present but was not exercised';
  else
    begin
      update public.payments
         set async_payment_pending_at = pg_catalog.now()
       where id = v_probe;
      raise exception 'the open-only constraint did not refuse a settled row';
    exception
      when check_violation then
        null; -- refused, which is the point
      when others then
        raise exception 'constraint probe could not run: % (%)', sqlerrm, sqlstate;
    end;
  end if;
end $post$;

commit;
