-- Let a payment be refunded more than once.
--
-- THE DEADLOCK. `plan_direct_charge_refund_operation` refuses any payment whose
-- `reconciliation_status` is not `reconciled`. `apply_direct_refund_accounting`
-- sets it to `pending` on every refund -- correctly, because the recorded
-- amounts have just changed and the old reconciliation no longer describes the
-- payment. And the ONLY thing in this repo that ever writes `reconciled` is the
-- connected-payment event projector, which runs on `checkout.session.completed`
-- and never fires again for a payment already collected.
--
-- So the first refund permanently blocks every later one. A contractor who
-- refunds a deposit cannot then refund the balance. Money that is owed back
-- cannot be sent, and the failure is silent: the second attempt raises
-- 'direct refund requires a paid, undisputed, reconciled payment', which reads
-- like a data problem rather than a design one.
--
-- Worse, it is not only refunds. Any transient failure during the original
-- projection leaves `pending` for ever, so a payment that was never refunded at
-- all can be permanently unrefundable because a balance-transaction read timed
-- out once.
--
-- WHAT THIS ADDS. A way back to `reconciled`, and only through evidence:
-- `reconcile_direct_payment` takes what the provider currently reports and
-- compares it with what the ledger holds. Agreement promotes. Disagreement
-- writes `mismatch` -- a value `payments_reconciliation_status_check` has always
-- permitted (20260815213142:284) and which nothing has ever produced -- and a
-- mismatched payment stays unrefundable, which is the correct outcome for a
-- payment whose books and provider disagree about money.
--
-- WHAT THIS DELIBERATELY DOES NOT DO. It does not read Stripe. The caller does
-- that and passes the figures in, for the same reason the refund planner does
-- not call Stripe: a SQL function that made a network call could not be run
-- inside the transaction that depends on its answer.

begin;

-- ---------------------------------------------------------------------------
-- The work list
-- ---------------------------------------------------------------------------
-- Payments whose reconciliation is stale and which could be reconciled again.
-- Ordered oldest-first so a bounded batch cannot starve the tail, and excluding
-- disputed payments, whose money is not ours to reason about.
create or replace function public.direct_payments_pending_reconciliation(
  p_limit integer default 100
)
returns table (
  payment_id uuid,
  account_id uuid,
  stripe_account_id text,
  stripe_charge_id text,
  stripe_application_fee_id text,
  livemode boolean
)
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $work$
  select p.id, p.account_id, p.stripe_account_id, p.stripe_charge_id,
         p.stripe_application_fee_id, p.stripe_livemode
  from public.payments p
  where p.charge_model = 'direct'
    and p.reconciliation_status = 'pending'
    and p.status in ('paid', 'refunded')
    and p.paid_at is not null
    and p.stripe_charge_id is not null
    and p.stripe_account_id is not null
    and p.stripe_dispute_id is null
    and p.disputed_at is null
  order by p.paid_at asc
  limit greatest(1, least(coalesce(p_limit, 100), 500));
$work$;

-- ---------------------------------------------------------------------------
-- The decision
-- ---------------------------------------------------------------------------
create or replace function public.reconcile_direct_payment(
  p_payment_id uuid,
  p_observed_refunded_cents bigint,
  p_observed_fee_refunded_cents bigint,
  p_observed_charge_id text,
  p_observed_disputed boolean default false
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $rec$
declare
  v_payment public.payments%rowtype;
  v_ledger_refunded bigint;
  v_ledger_fee_refunded bigint;
  v_status text;
begin
  select * into v_payment from public.payments p where p.id = p_payment_id for update;
  if not found then
    raise exception 'payment not found' using errcode = 'P0002';
  end if;

  if v_payment.charge_model <> 'direct' then
    raise exception 'only a direct charge is reconciled here' using errcode = '22023';
  end if;

  -- A charge id that does not match is not a mismatch to be recorded against
  -- this payment -- it is evidence about a different payment, and writing it
  -- here would be worse than refusing.
  if p_observed_charge_id is null
     or v_payment.stripe_charge_id is distinct from p_observed_charge_id then
    raise exception 'reconciliation evidence is for a different charge' using errcode = '22023';
  end if;

  -- A dispute takes the payment out of scope entirely. Whatever the numbers say,
  -- money under dispute is not ours to reconcile or to refund.
  if p_observed_disputed then
    update public.payments p
       set reconciliation_status = 'mismatch', reconciled_at = null
     where p.id = p_payment_id;
    return 'disputed';
  end if;

  v_ledger_refunded := pg_catalog.round(coalesce(v_payment.refunded_amount, 0) * 100)::bigint;
  v_ledger_fee_refunded := pg_catalog.round(coalesce(v_payment.platform_fee_refunded, 0) * 100)::bigint;

  -- EXACT, both figures. The gross alone agreeing would let a wrong Application
  -- Fee refund pass unnoticed, which is precisely the failure 20260819270000
  -- narrows the refund planner to prevent -- and this is the check that would
  -- have caught it after the fact.
  if v_ledger_refunded = p_observed_refunded_cents
     and v_ledger_fee_refunded = p_observed_fee_refunded_cents then
    v_status := 'reconciled';
  else
    v_status := 'mismatch';
  end if;

  update public.payments p
     set reconciliation_status = v_status,
         reconciled_at = case when v_status = 'reconciled' then pg_catalog.now() else null end
   where p.id = p_payment_id;

  return v_status;
end;
$rec$;

revoke all on function public.direct_payments_pending_reconciliation(integer)
  from public, anon, authenticated;
revoke all on function public.reconcile_direct_payment(uuid, bigint, bigint, text, boolean)
  from public, anon, authenticated;
grant execute on function public.direct_payments_pending_reconciliation(integer) to service_role;
grant execute on function public.reconcile_direct_payment(uuid, bigint, bigint, text, boolean) to service_role;

do $post$
declare
  v_def text;
begin
  if not exists (
    select 1 from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'reconcile_direct_payment'
  ) then
    raise exception 'reconcile_direct_payment was not created';
  end if;

  -- THE ONE THAT MATTERS. The refund gate must still require `reconciled`.
  -- This migration exists to give a payment a way BACK to that state, not to
  -- relax the requirement -- and relaxing it would let a payment be refunded
  -- while its books and Stripe disagree about how much has already gone back.
  --
  -- IT IS IN compute_direct_charge_refund_plan, not in
  -- plan_direct_charge_refund_operation. The planner only calls the computer;
  -- the gate lives in the callee. This block asserted against the caller on
  -- 2026-08-20, found no `reconciliation_status` there because there is none,
  -- and refused a migration that was entirely correct.
  --
  -- Verified against production the same day: the exact expression below lives
  -- in compute_direct_charge_refund_plan and begin_direct_charge_refund_
  -- submission, and in neither the planner nor record_direct_charge_refund_
  -- result.
  select p.prosrc into v_def
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prokind = 'f'
    and p.proname = 'compute_direct_charge_refund_plan'
  limit 1;

  if v_def is null then
    raise exception 'compute_direct_charge_refund_plan is missing; this migration assumes it exists';
  end if;
  -- The EXPRESSION, not the column name. A body that merely writes
  -- reconciliation_status -- and every refund path writes it -- would satisfy a
  -- check for the bare word while gating on nothing at all. That is how the
  -- harness for this migration passed against a comment in a stub.
  if pg_catalog.strpos(v_def, 'reconciliation_status <> ''reconciled''') = 0 then
    raise exception 'the refund gate no longer requires a reconciled payment';
  end if;

  -- And `mismatch` must remain a legal value, since this is the first thing
  -- that ever writes it.
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'payments_reconciliation_status_check'
      and pg_catalog.pg_get_constraintdef(oid) like '%mismatch%'
  ) then
    raise exception 'payments_reconciliation_status_check does not permit mismatch';
  end if;
end $post$;

commit;
