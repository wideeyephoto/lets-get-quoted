-- Dark legacy payment-plan payoff owner binding.
--
-- The active payoff flow still takes a timestamp-only lock and then inserts its
-- final payment in a separate request. This migration does not call or alter that
-- flow. It adds one service-role-only transaction that can bind an explicitly
-- supplied, already-existing final payment to that lock before any Stripe object
-- has been created. It never guesses an owner, creates/cancels a payment, changes
-- money, or submits anything to a provider.

begin;

-- Preserve the projection foundation's migration-time compatibility rule while
-- taking the same parent -> child order used at runtime. In particular, the one
-- known timestamp-only legacy lock remains valid only when it has exactly one
-- unresolved final candidate. This migration deliberately does not backfill it.
lock table public.payment_plans in share row exclusive mode;
lock table public.payments in share row exclusive mode;

do $payoff_owner_preflight$
begin
  if exists (
    select 1
      from public.payment_plans pp
      left join public.payments owner_payment on owner_payment.id = pp.payoff_payment_id
     where (
          pp.payoff_locked_at is not null
          and pp.status not in ('pending_deposit', 'active')
        )
        or (
          pp.payoff_payment_id is null
          and pp.payoff_locked_at is not null
          and (
            select pg_catalog.count(*)
              from public.payments candidate
             where candidate.payment_plan_id = pp.id
               and candidate.kind::text = 'final'
               and candidate.status::text in ('requested', 'processing', 'paid')
          ) <> 1
        )
        or (pp.payoff_payment_id is not null and pp.payoff_locked_at is null)
        or (
          pp.payoff_payment_id is not null
          and (
            owner_payment.id is null
            or owner_payment.payment_plan_id is distinct from pp.id
            or owner_payment.account_id is distinct from pp.account_id
            or owner_payment.job_id is distinct from pp.job_id
            or owner_payment.kind::text <> 'final'
            or owner_payment.status::text not in ('requested', 'processing', 'paid')
          )
        )
  ) then
    raise exception 'legacy payoff-owner binding preflight: lock owner is missing, stale, or ambiguous'
      using errcode = '55000';
  end if;
end;
$payoff_owner_preflight$;

-- `payment_plans_all` intentionally lets an owner manage ordinary plan fields,
-- so RLS alone cannot make this new money-control identity server-owned. Refuse
-- raw anon/authenticated inserts or changes while leaving the current service-
-- role payoff writer (which only touches the timestamp) compatible.
create or replace function public.protect_legacy_payment_plan_payoff_owner()
returns trigger
language plpgsql
security invoker
set search_path = ''
set timezone = 'UTC'
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT'
       and (new.payoff_payment_id is not null or new.payoff_locked_at is not null) then
      raise exception 'payment-plan payoff lock and owner are backend-managed'
        using errcode = '42501';
    end if;
    if tg_op = 'UPDATE'
       and (
         old.payoff_payment_id is distinct from new.payoff_payment_id
         or old.payoff_locked_at is distinct from new.payoff_locked_at
       ) then
      raise exception 'payment-plan payoff lock and owner are backend-managed'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.protect_legacy_payment_plan_payoff_owner()
  from public, anon, authenticated, service_role;

drop trigger if exists protect_legacy_payment_plan_payoff_owner_trigger
  on public.payment_plans;
create trigger protect_legacy_payment_plan_payoff_owner_trigger
before insert or update on public.payment_plans
for each row execute function public.protect_legacy_payment_plan_payoff_owner();

create or replace function public.bind_legacy_payment_plan_payoff_owner(
  p_payment_plan_id uuid,
  p_payment_id uuid
)
returns table (
  binding_status text,
  payment_plan_id uuid,
  payoff_payment_id uuid,
  locked_at timestamptz,
  remaining_cents bigint
)
language plpgsql
security invoker
set search_path = ''
set timezone = 'UTC'
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_plan public.payment_plans%rowtype;
  v_payment public.payments%rowtype;
  v_paid_cents bigint := 0;
  v_remaining_cents bigint := 0;
  v_updated integer := 0;
  v_binding_status text;
begin
  if p_payment_plan_id is null or p_payment_id is null then
    raise exception 'legacy payoff-owner binding requires plan and payment ids'
      using errcode = '22004';
  end if;

  -- Global mutation order: parent plan first, then every linked payment in UUID
  -- order. The parent FOR UPDATE also conflicts with the FK key-share lock of a
  -- concurrent child insert, so the locked payment set cannot gain a new member
  -- while the remaining balance is being derived.
  select pp.*
    into v_plan
    from public.payment_plans pp
   where pp.id = p_payment_plan_id
   for update;

  if not found then
    raise exception 'legacy payoff-owner binding plan is missing'
      using errcode = '22000';
  end if;

  perform p.id
    from public.payments p
   where p.payment_plan_id = v_plan.id
   order by p.id
   for update;

  select p.*
    into v_payment
    from public.payments p
   where p.id = p_payment_id
     and p.payment_plan_id = v_plan.id;

  if not found then
    raise exception 'legacy payoff-owner binding payment is missing or belongs to another plan'
      using errcode = '22000';
  end if;

  if v_plan.status not in ('pending_deposit', 'active') then
    raise exception 'legacy payoff-owner binding targets a terminal plan'
      using errcode = '55000';
  end if;

  if v_plan.status = 'pending_deposit' and v_plan.allow_pay_in_full is false then
    raise exception 'legacy payoff-owner binding is disabled before plan activation'
      using errcode = '55000';
  end if;

  if v_plan.payoff_locked_at is null then
    raise exception 'legacy payoff-owner binding requires the existing payoff lock timestamp'
      using errcode = '55000';
  end if;

  if v_plan.payoff_payment_id is not null
     and v_plan.payoff_payment_id is distinct from v_payment.id then
    raise exception 'legacy payoff-owner binding conflicts with a different lock owner'
      using errcode = '55000';
  end if;

  if exists (
    select 1
      from public.payments p
     where p.payment_plan_id = v_plan.id
       and (
         p.account_id is distinct from v_plan.account_id
         or p.job_id is distinct from v_plan.job_id
         or p.charge_model is distinct from 'destination'
         or p.imported is true
         or p.kind::text not in ('deposit', 'plan_installment', 'final')
       )
  ) then
    raise exception 'legacy payoff-owner binding linked payment scope changed under lock'
      using errcode = '55000';
  end if;

  if v_payment.account_id is distinct from v_plan.account_id
     or v_payment.job_id is distinct from v_plan.job_id
     or v_payment.kind::text <> 'final'
     or v_payment.status::text not in ('requested', 'processing')
     or v_payment.charge_model is distinct from 'destination'
     or v_payment.imported is true then
    raise exception 'legacy payoff-owner binding payment is not an unresolved legacy final'
      using errcode = '22000';
  end if;

  -- Binding is allowed only before provider submission. A normal processing row
  -- already has a Checkout Session and therefore fails here; accepting processing
  -- only keeps an otherwise-pristine legacy state value from becoming an owner
  -- inference. Paid/refund/dispute/dunning facts are all explicit hard failures.
  if v_payment.paid_at is not null
     or v_payment.refunded_amount is distinct from 0::numeric
     or v_payment.refunded_at is not null
     or v_payment.platform_fee_refunded is distinct from 0::numeric
     or v_payment.disputed_at is not null
     or v_payment.dispute_reason is not null
     or v_payment.dispute_status is not null
     or v_payment.stripe_dispute_id is not null
     or v_payment.dispute_due_by is not null
     or v_payment.stripe_checkout_session is not null
     or v_payment.stripe_payment_intent is not null
     or v_payment.stripe_account_id is not null
     or v_payment.stripe_charge_id is not null
     or v_payment.stripe_application_fee_id is not null
     or v_payment.stripe_latest_refund_id is not null
     or v_payment.stripe_latest_application_fee_refund_id is not null
     or v_payment.stripe_balance_transaction_id is not null
     or v_payment.platform_fee is not null
     or v_payment.fee_rate is not null
     or v_payment.fee_basis_amount is not null
     or v_payment.fee_rate_bps is not null
     or v_payment.fee_plan_code is not null
     or v_payment.fee_catalog_version is not null
     or v_payment.reconciliation_status is not null
     or v_payment.reconciled_at is not null
     or v_payment.failure_code is not null
     or v_payment.failure_message is not null
     or v_payment.failed_at is not null
     or v_payment.dunning_attempts <> 0
     or v_payment.charge_attempts <> 0
     or v_payment.next_retry_at is not null
     or v_payment.dunning_state is not null then
    raise exception 'legacy payoff-owner binding payment already has settlement or provider facts'
      using errcode = '55000';
  end if;

  if (
    select pg_catalog.count(*)
      from public.payments p
     where p.payment_plan_id = v_plan.id
       and p.kind::text = 'final'
       and p.status::text in ('requested', 'processing', 'paid')
  ) <> 1 then
    raise exception 'legacy payoff-owner binding unresolved final payment is ambiguous'
      using errcode = '55000';
  end if;

  if exists (
    select 1
      from public.payments p
     where p.payment_plan_id = v_plan.id
       and p.id <> v_payment.id
       and p.status::text in ('processing', 'disputed')
  ) then
    raise exception 'legacy payoff-owner binding conflicts with a processing sibling payment or dispute'
      using errcode = '55000';
  end if;

  select coalesce(
           pg_catalog.sum(
             pg_catalog.round((p.amount - p.refunded_amount) * 100)::bigint
           ),
           0
         )
    into v_paid_cents
    from public.payments p
   where p.payment_plan_id = v_plan.id
     and p.id <> v_payment.id
     and p.status::text = 'paid';

  v_remaining_cents := v_plan.total_cents::bigint - v_paid_cents;

  if v_remaining_cents <= 0
     or pg_catalog.round(v_payment.amount * 100)::bigint <> v_remaining_cents then
    raise exception 'legacy payoff-owner binding amount does not equal the locked remaining cents'
      using errcode = '22000';
  end if;

  if v_plan.payoff_payment_id is null then
    update public.payment_plans pp
       set payoff_payment_id = v_payment.id,
           updated_at = v_now
     where pp.id = v_plan.id
       and pp.payoff_payment_id is null;

    get diagnostics v_updated = row_count;
    if v_updated <> 1 then
      raise exception 'legacy payoff-owner binding lost its owner compare-and-set'
        using errcode = '40001';
    end if;
    v_binding_status := 'bound';
  else
    v_binding_status := 'already_bound';
  end if;

  return query select
    v_binding_status,
    v_plan.id,
    v_payment.id,
    v_plan.payoff_locked_at,
    v_remaining_cents;
end;
$$;

revoke all on function public.bind_legacy_payment_plan_payoff_owner(
  uuid, uuid
) from public, anon, authenticated, service_role;
grant execute on function public.bind_legacy_payment_plan_payoff_owner(
  uuid, uuid
) to service_role;

comment on function public.bind_legacy_payment_plan_payoff_owner(
  uuid, uuid
) is
  'Dark service-role binder for an explicitly supplied, pristine legacy payoff payment. No active caller imports it until a separate reviewed cutover.';

-- Do not add the reverse (timestamp requires owner) constraint yet. The active
-- service-role legacy writer still commits payoff_locked_at before it inserts the payment, and
-- production contains one reviewed timestamp-only development fixture. The
-- binder makes that owner explicit; a later activation migration can validate
-- and enforce the paired invariant after the writer is replaced.

commit;
