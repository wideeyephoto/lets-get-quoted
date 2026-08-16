-- Dark legacy payment-plan projection foundation.
--
-- Stripe payment status is still committed by the existing legacy webhook. This
-- migration deliberately does not change that route, payoff creation, or the
-- installment cron. It adds the database-owned, replay-safe second half only:
-- once a caller has independently proved and persisted payment truth, one RPC can
-- atomically activate a paid deposit, finalize a paid payoff, or release the lock
-- owned by a failed payoff.
--
-- There are no best-effort repairs in this migration. Existing ambiguous money
-- state aborts the migration so an operator can reconcile it explicitly. Nothing
-- is deleted, merged, or guessed.

begin;

alter table public.payment_plans
  add column if not exists payoff_payment_id uuid;

comment on column public.payment_plans.payoff_payment_id is
  'The exact linked final payment that owns payoff_locked_at. Nullable until the payoff-start caller is cut over; the dark projector never guesses an owner.';

-- Hold a stable preflight snapshot against application DML, in the same parent
-- -> child -> feed order required of runtime writers. These tables are tiny at
-- the dark-foundation cutover; ambiguity appearing mid-install must not slip
-- between validation and index/constraint creation.
lock table public.payment_plans in share row exclusive mode;
lock table public.payments in share row exclusive mode;
lock table public.job_feed in share row exclusive mode;

-- Pure deterministic schedule authority. Monthly cadence intentionally advances
-- from the previously clamped date (Jan 31 -> Feb 28 -> Mar 28), matching
-- payment-plan-math.ts rather than re-anchoring every row to the original day.
create or replace function public.legacy_payment_plan_expected_installments(
  p_total_cents integer,
  p_deposit_cents integer,
  p_installment_count integer,
  p_frequency text,
  p_first_installment_date date
)
returns table (
  installment_seq integer,
  amount_cents integer,
  due_date date
)
language sql
immutable
strict
parallel safe
security invoker
set search_path = ''
set timezone = 'UTC'
as $$
  with recursive schedule(installment_seq, due_date) as (
    select 1, p_first_installment_date
     where p_installment_count between 1 and 24
       and p_total_cents > 0
       and p_deposit_cents between 0 and p_total_cents
       and p_frequency in ('weekly', 'biweekly', 'monthly')

    union all

    select
      s.installment_seq + 1,
      case p_frequency
        when 'weekly' then s.due_date + 7
        when 'biweekly' then s.due_date + 14
        when 'monthly' then
          n.next_month_start
          + (
              least(
                extract(day from s.due_date)::integer,
                extract(
                  day from (n.next_month_start + interval '1 month - 1 day')
                )::integer
              ) - 1
            )
      end
      from schedule s
      cross join lateral (
        select (
          pg_catalog.date_trunc('month', s.due_date::timestamp) + interval '1 month'
        )::date as next_month_start
      ) n
     where s.installment_seq < p_installment_count
  )
  select
    s.installment_seq,
    case
      when s.installment_seq < p_installment_count then
        (p_total_cents - p_deposit_cents) / p_installment_count
      else
        (p_total_cents - p_deposit_cents)
        - ((p_total_cents - p_deposit_cents) / p_installment_count)
          * (p_installment_count - 1)
    end::integer as amount_cents,
    s.due_date
  from schedule s
  order by s.installment_seq;
$$;

revoke all on function public.legacy_payment_plan_expected_installments(
  integer, integer, integer, text, date
) from public, anon, authenticated, service_role;
grant execute on function public.legacy_payment_plan_expected_installments(
  integer, integer, integer, text, date
) to service_role;

-- Refuse to install uniqueness over ambiguous historical facts. This block is
-- intentionally stricter than the future projector: migration-time ambiguity is
-- an operator task, not an opportunity for automatic repair.
do $$
begin
  if exists (
    select 1
      from public.payment_plans pp
     where pp.total_cents <= 0
        or pp.deposit_cents < 0
        or pp.deposit_cents > pp.total_cents
        or pp.installment_count not between 1 and 24
  ) then
    raise exception 'legacy payment-plan preflight: invalid plan money or installment shape'
      using errcode = '22000';
  end if;

  if exists (
    select 1
      from public.payments p
      join public.payment_plans pp on pp.id = p.payment_plan_id
     where p.account_id is distinct from pp.account_id
        or p.job_id is distinct from pp.job_id
        or p.charge_model is distinct from 'destination'
        or p.imported is true
        or (p.status::text = 'paid' and p.paid_at is null)
        or p.kind::text not in ('deposit', 'plan_installment', 'final')
  ) then
    raise exception 'legacy payment-plan preflight: linked payment scope or charge model mismatch'
      using errcode = '22000';
  end if;

  if exists (
    select 1
      from public.payment_plans pp
      left join public.payments p on p.id = pp.deposit_payment_id
     where pp.deposit_payment_id is not null
       and (
         p.id is null
         or p.payment_plan_id is distinct from pp.id
         or p.account_id is distinct from pp.account_id
         or p.job_id is distinct from pp.job_id
         or p.kind::text <> 'deposit'
         or pg_catalog.round(p.amount * 100)::bigint <> pp.deposit_cents::bigint
       )
  ) then
    raise exception 'legacy payment-plan preflight: deposit binding is missing or incoherent'
      using errcode = '22000';
  end if;

  if exists (
    select p.payment_plan_id
      from public.payments p
     where p.payment_plan_id is not null
       and p.kind::text = 'deposit'
     group by p.payment_plan_id
    having pg_catalog.count(*) > 1
  ) then
    raise exception 'legacy payment-plan preflight: more than one deposit is linked to a plan'
      using errcode = '23505';
  end if;

  if exists (
    select 1
      from public.payments p
      join public.payment_plans pp on pp.id = p.payment_plan_id
     where p.kind::text = 'deposit'
       and pp.deposit_payment_id is distinct from p.id
  ) then
    raise exception 'legacy payment-plan preflight: linked deposit is not the bound deposit'
      using errcode = '55000';
  end if;

  if exists (
    select pp.deposit_payment_id
      from public.payment_plans pp
     where pp.deposit_payment_id is not null
     group by pp.deposit_payment_id
    having pg_catalog.count(*) > 1
  ) then
    raise exception 'legacy payment-plan preflight: one deposit is bound to multiple plans'
      using errcode = '23505';
  end if;

  if exists (
    select 1
      from public.payments p
     where p.kind::text = 'plan_installment'
       and (
         p.payment_plan_id is null
         or p.installment_seq is null
         or p.installment_seq <= 0
         or p.due_date is null
       )
  ) then
    raise exception 'legacy payment-plan preflight: malformed installment identity'
      using errcode = '22000';
  end if;

  if exists (
    select p.payment_plan_id, p.installment_seq
      from public.payments p
     where p.kind::text = 'plan_installment'
       and p.payment_plan_id is not null
       and p.installment_seq is not null
     group by p.payment_plan_id, p.installment_seq
    having pg_catalog.count(*) > 1
  ) then
    raise exception 'legacy payment-plan preflight: duplicate installment sequence'
      using errcode = '23505';
  end if;

  if exists (
    select 1
      from public.payments p
      join public.payment_plans pp on pp.id = p.payment_plan_id
      left join lateral public.legacy_payment_plan_expected_installments(
        pp.total_cents,
        pp.deposit_cents,
        pp.installment_count,
        pp.frequency,
        pp.first_installment_date
      ) expected on expected.installment_seq = p.installment_seq
     where p.kind::text = 'plan_installment'
       and (
         expected.installment_seq is null
         or pg_catalog.round(p.amount * 100)::bigint
              <> expected.amount_cents::bigint
         or p.due_date is distinct from expected.due_date
       )
  ) then
    raise exception 'legacy payment-plan preflight: installment cents or dates differ from plan truth'
      using errcode = '22000';
  end if;

  -- An exact subset of the deterministic schedule is not ambiguous. Preserve
  -- it so a webhook retry through the projector can insert only missing rows.
  -- The RPC proves the complete schedule before publishing plan state.

  if exists (
    select p.payment_plan_id
      from public.payments p
     where p.payment_plan_id is not null
       and p.kind::text = 'final'
       and p.status::text in ('requested', 'processing', 'paid')
     group by p.payment_plan_id
    having pg_catalog.count(*) > 1
  ) then
    raise exception 'legacy payment-plan preflight: more than one unresolved payoff is linked to a plan'
      using errcode = '23505';
  end if;

  -- Compatibility only: a timestamp-only legacy lock is tolerated when exactly
  -- one unresolved final payment exists. The migration still does not bind it;
  -- the dark RPC refuses to act until a later reviewed cutover supplies the
  -- explicit owner. Zero or multiple candidates is ambiguous and aborts here.
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
    raise exception 'legacy payment-plan preflight: payoff lock owner is missing, stale, or ambiguous'
      using errcode = '55000';
  end if;

  if exists (
    select 1
      from public.payments p
      join public.payment_plans pp on pp.id = p.payment_plan_id
     where p.kind::text = 'final'
       and p.status::text in ('requested', 'processing')
       and pp.payoff_payment_id is distinct from p.id
       and not (
         pp.payoff_payment_id is null
         and pp.payoff_locked_at is not null
         and (
           select pg_catalog.count(*)
             from public.payments candidate
            where candidate.payment_plan_id = pp.id
              and candidate.kind::text = 'final'
              and candidate.status::text in ('requested', 'processing', 'paid')
         ) = 1
       )
  ) or exists (
    select 1
      from public.payments p
      join public.payment_plans pp on pp.id = p.payment_plan_id
     where p.kind::text = 'final'
       and p.status::text = 'paid'
       and pp.status in ('pending_deposit', 'active')
       and pp.payoff_payment_id is distinct from p.id
       and not (
         pp.payoff_payment_id is null
         and pp.payoff_locked_at is not null
         and (
           select pg_catalog.count(*)
             from public.payments candidate
            where candidate.payment_plan_id = pp.id
              and candidate.kind::text = 'final'
              and candidate.status::text in ('requested', 'processing', 'paid')
         ) = 1
       )
  ) then
    raise exception 'legacy payment-plan preflight: live payoff payment is not the bound lock owner'
      using errcode = '55000';
  end if;

  if exists (
    select 1
      from public.job_feed f
     where f.kind in ('payment_plan_active', 'payment_plan_paid_off')
       and (f.source_table is null or f.source_id is null)
  ) then
    raise exception 'legacy payment-plan preflight: source-less plan feed event cannot be bound safely'
      using errcode = '55000';
  end if;

  if exists (
    select 1
      from public.job_feed f
      left join public.payments p
        on f.source_table = 'payments'
       and f.source_id = p.id
      left join public.payment_plans pp on pp.id = p.payment_plan_id
     where f.kind in ('payment_plan_active', 'payment_plan_paid_off')
       and (
         f.source_table is distinct from 'payments'
         or p.id is null
         or pp.id is null
         or f.account_id is distinct from pp.account_id
         or f.job_id is distinct from pp.job_id
         or (f.kind = 'payment_plan_active' and p.kind::text <> 'deposit')
         or (f.kind = 'payment_plan_paid_off' and p.kind::text <> 'final')
       )
  ) then
    raise exception 'legacy payment-plan preflight: deterministic feed identity conflicts with plan truth'
      using errcode = '22000';
  end if;
end;
$$;

-- Schema invariants needed for idempotent inserts and exact lock ownership.
create unique index if not exists payments_plan_installment_seq_uidx
  on public.payments (payment_plan_id, installment_seq)
  where kind = 'plan_installment'
    and payment_plan_id is not null
    and installment_seq is not null;

create unique index if not exists payments_one_plan_deposit_uidx
  on public.payments (payment_plan_id)
  where kind = 'deposit' and payment_plan_id is not null;

create unique index if not exists payment_plans_deposit_payment_uidx
  on public.payment_plans (deposit_payment_id)
  where deposit_payment_id is not null;

-- Include paid until plan projection finishes. A late success for an old failed
-- payoff therefore cannot coexist with a newer requested/processing/paid payoff;
-- the payment CAS fails visibly instead of silently recording two valid payoffs.
create unique index if not exists payments_one_unresolved_plan_payoff_uidx
  on public.payments (payment_plan_id)
  where kind = 'final'
    and payment_plan_id is not null
    and status in ('requested', 'processing', 'paid');

create unique index if not exists payment_plans_payoff_payment_uidx
  on public.payment_plans (payoff_payment_id)
  where payoff_payment_id is not null;

do $$
begin
  if not exists (
    select 1
      from pg_catalog.pg_constraint
     where conrelid = 'public.payment_plans'::pg_catalog.regclass
       and conname = 'payment_plans_money_shape_check'
  ) then
    alter table public.payment_plans
      add constraint payment_plans_money_shape_check
      check (
        total_cents > 0
        and deposit_cents between 0 and total_cents
        and installment_count between 1 and 24
      );
  end if;

  if not exists (
    select 1
      from pg_catalog.pg_constraint
     where conrelid = 'public.payments'::pg_catalog.regclass
       and conname = 'payments_payment_plan_kind_check'
  ) then
    alter table public.payments
      add constraint payments_payment_plan_kind_check
      check (
        payment_plan_id is null
        or kind in ('deposit', 'plan_installment', 'final')
      );
  end if;

  if not exists (
    select 1
      from pg_catalog.pg_constraint
     where conrelid = 'public.payments'::pg_catalog.regclass
       and conname = 'payments_payment_plan_legacy_scope_check'
  ) then
    alter table public.payments
      add constraint payments_payment_plan_legacy_scope_check
      check (
        payment_plan_id is null
        or (
          charge_model = 'destination'
          and imported is false
          and (status <> 'paid' or paid_at is not null)
        )
      );
  end if;

  if not exists (
    select 1
      from pg_catalog.pg_constraint
     where conrelid = 'public.payments'::pg_catalog.regclass
       and conname = 'payments_plan_installment_shape_check'
  ) then
    alter table public.payments
      add constraint payments_plan_installment_shape_check
      check (
        kind <> 'plan_installment'
        or (
          payment_plan_id is not null
          and installment_seq is not null
          and installment_seq > 0
          and due_date is not null
        )
      );
  end if;

  if not exists (
    select 1
      from pg_catalog.pg_constraint
     where conrelid = 'public.payments'::pg_catalog.regclass
       and conname = 'payments_payment_plan_id_id_key'
  ) then
    alter table public.payments
      add constraint payments_payment_plan_id_id_key
      unique (payment_plan_id, id);
  end if;

  if not exists (
    select 1
      from pg_catalog.pg_constraint
     where conrelid = 'public.payment_plans'::pg_catalog.regclass
       and conname = 'payment_plans_payoff_payment_same_plan_fkey'
  ) then
    alter table public.payment_plans
      add constraint payment_plans_payoff_payment_same_plan_fkey
      foreign key (id, payoff_payment_id)
      references public.payments (payment_plan_id, id)
      deferrable initially deferred;
  end if;

  -- One-way during the dark compatibility window: old active code may still set
  -- a timestamp without an owner, but no new writer may set an owner without the
  -- lock. A later cutover migration can require both directions.
  if not exists (
    select 1
      from pg_catalog.pg_constraint
     where conrelid = 'public.payment_plans'::pg_catalog.regclass
       and conname = 'payment_plans_payoff_owner_requires_lock_check'
  ) then
    alter table public.payment_plans
      add constraint payment_plans_payoff_owner_requires_lock_check
      check (payoff_payment_id is null or payoff_locked_at is not null);
  end if;
end;
$$;

create or replace function public.project_legacy_payment_plan_payment(
  p_payment_id uuid,
  p_stripe_customer_id text default null,
  p_stripe_payment_method_id text default null,
  p_card_brand text default null,
  p_card_last4 text default null
)
returns table (
  projection_status text,
  payment_plan_id uuid,
  projected_plan_status text,
  projected_installment_count integer,
  canceled_payment_count integer,
  feed_recorded boolean
)
language plpgsql
security invoker
set search_path = ''
set timezone = 'UTC'
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_plan_id uuid;
  v_plan public.payment_plans%rowtype;
  v_payment public.payments%rowtype;
  v_existing_installments integer := 0;
  v_inserted_installments integer := 0;
  v_canceled integer := 0;
  v_feed_inserted integer := 0;
  v_feed public.job_feed%rowtype;
  v_other_paid_cents bigint := 0;
  v_final_cents bigint := 0;
  v_first_due date;
  v_first_due_label text;
  v_activation_body text;
  v_expected_status text;
begin
  if p_payment_id is null then
    raise exception 'legacy payment-plan projection requires a payment id'
      using errcode = '22004';
  end if;

  -- This first lookup is deliberately unlocked. It discovers the parent only;
  -- every fact is re-read after the parent and all children are locked.
  select p.payment_plan_id
    into v_plan_id
    from public.payments p
   where p.id = p_payment_id;

  if v_plan_id is null then
    raise exception 'legacy payment-plan projection payment is missing or unbound'
      using errcode = '22000';
  end if;

  -- Global lock order for every future payment-plan mutation:
  --   payment_plans parent -> all linked payments ordered by id -> job_feed.
  select pp.*
    into v_plan
    from public.payment_plans pp
   where pp.id = v_plan_id
   for update;

  if not found then
    raise exception 'legacy payment-plan projection plan is missing'
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
   where p.id = p_payment_id;

  if not found
     or v_payment.payment_plan_id is distinct from v_plan.id
     or v_payment.account_id is distinct from v_plan.account_id
     or v_payment.job_id is distinct from v_plan.job_id then
    raise exception 'legacy payment-plan projection payment binding changed under lock'
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
         or (p.status::text = 'paid' and p.paid_at is null)
         or p.kind::text not in ('deposit', 'plan_installment', 'final')
       )
  ) then
    raise exception 'legacy payment-plan linked payment scope or charge model changed'
      using errcode = '55000';
  end if;

  if (
    v_plan.deposit_payment_id is not null
    and not exists (
      select 1
        from public.payments p
       where p.id = v_plan.deposit_payment_id
         and p.payment_plan_id = v_plan.id
         and p.kind::text = 'deposit'
         and pg_catalog.round(p.amount * 100)::bigint = v_plan.deposit_cents::bigint
    )
  ) or exists (
    select 1
      from public.payments p
     where p.payment_plan_id = v_plan.id
       and p.kind::text = 'deposit'
       and p.id is distinct from v_plan.deposit_payment_id
  ) then
    raise exception 'legacy payment-plan deposit binding changed'
      using errcode = '55000';
  end if;

  -- Exact subsets are repairable; wrong identities, cents, or dates are not.
  -- This guard is shared by activation and payoff so a final payment can never
  -- close a plan whose schedule no longer matches the authorized plan truth.
  if exists (
    select 1
      from public.payments p
      left join lateral public.legacy_payment_plan_expected_installments(
        v_plan.total_cents,
        v_plan.deposit_cents,
        v_plan.installment_count,
        v_plan.frequency,
        v_plan.first_installment_date
      ) expected on expected.installment_seq = p.installment_seq
     where p.payment_plan_id = v_plan.id
       and p.kind::text = 'plan_installment'
       and (
         expected.installment_seq is null
         or pg_catalog.round(p.amount * 100)::bigint
              <> expected.amount_cents::bigint
         or p.due_date is distinct from expected.due_date
       )
  ) then
    raise exception 'legacy payment-plan locked schedule conflicts with plan truth'
      using errcode = '22000';
  end if;

  if v_payment.charge_model is distinct from 'destination' then
    raise exception 'legacy payment-plan projection accepts destination payments only'
      using errcode = '22000';
  end if;

  if v_payment.kind::text = 'deposit' then
    if v_payment.status::text <> 'paid' then
      raise exception 'legacy payment-plan deposit is not paid'
        using errcode = '55000';
    end if;
    if v_plan.deposit_payment_id is distinct from v_payment.id then
      raise exception 'legacy payment-plan paid deposit is not the bound deposit'
        using errcode = '55000';
    end if;
    if pg_catalog.round(v_payment.amount * 100)::bigint
         <> v_plan.deposit_cents::bigint then
      raise exception 'legacy payment-plan deposit cents conflict with plan truth'
        using errcode = '22000';
    end if;
    if v_payment.refunded_amount <> 0 then
      raise exception 'legacy payment-plan paid deposit has refunded cents'
        using errcode = '22000';
    end if;
    if v_plan.status not in ('pending_deposit', 'active') then
      raise exception 'legacy payment-plan paid deposit targets a terminal plan'
        using errcode = '55000';
    end if;
    if v_plan.payoff_locked_at is not null or v_plan.payoff_payment_id is not null then
      raise exception 'legacy payment-plan paid deposit conflicts with a payoff in flight'
        using errcode = '55000';
    end if;

    if p_stripe_customer_id is not null
       and p_stripe_customer_id !~ '^cus_[A-Za-z0-9_]+$' then
      raise exception 'legacy payment-plan Stripe customer id is malformed'
        using errcode = '22000';
    end if;
    if p_stripe_payment_method_id is not null
       and p_stripe_payment_method_id !~ '^pm_[A-Za-z0-9_]+$' then
      raise exception 'legacy payment-plan Stripe payment method id is malformed'
        using errcode = '22000';
    end if;
    if p_card_brand is not null
       and (pg_catalog.length(pg_catalog.btrim(p_card_brand)) = 0
            or pg_catalog.length(pg_catalog.btrim(p_card_brand)) > 32) then
      raise exception 'legacy payment-plan card brand is malformed'
        using errcode = '22000';
    end if;
    if p_card_last4 is not null and p_card_last4 !~ '^[0-9]{4}$' then
      raise exception 'legacy payment-plan card last4 is malformed'
        using errcode = '22000';
    end if;
    if v_plan.stripe_customer_id is not null
       and p_stripe_customer_id is not null
       and v_plan.stripe_customer_id is distinct from p_stripe_customer_id then
      raise exception 'legacy payment-plan Stripe customer conflicts with saved truth'
        using errcode = '22000';
    end if;
    if v_plan.stripe_payment_method_id is not null
       and p_stripe_payment_method_id is not null
       and v_plan.stripe_payment_method_id is distinct from p_stripe_payment_method_id then
      raise exception 'legacy payment-plan Stripe payment method conflicts with saved truth'
        using errcode = '22000';
    end if;
    if v_plan.card_brand is not null
       and p_card_brand is not null
       and v_plan.card_brand is distinct from pg_catalog.btrim(p_card_brand) then
      raise exception 'legacy payment-plan card brand conflicts with saved truth'
        using errcode = '22000';
    end if;
    if v_plan.card_last4 is not null
       and p_card_last4 is not null
       and v_plan.card_last4 is distinct from p_card_last4 then
      raise exception 'legacy payment-plan card last4 conflicts with saved truth'
        using errcode = '22000';
    end if;

    select pg_catalog.count(*)::integer
      into v_existing_installments
      from public.payments p
     where p.payment_plan_id = v_plan.id
       and p.kind::text = 'plan_installment';

    insert into public.payments (
      account_id,
      job_id,
      payment_plan_id,
      kind,
      label,
      amount,
      status,
      due_date,
      installment_seq,
      homeowner_phone,
      sms_consent,
      sms_consent_at
    )
    select
      v_plan.account_id,
      v_plan.job_id,
      v_plan.id,
      'plan_installment'::public.payment_kind,
      'Installment ' || expected.installment_seq::text
        || ' of ' || v_plan.installment_count::text
        || ' — '
        || case extract(month from expected.due_date)::integer
             when 1 then 'Jan' when 2 then 'Feb' when 3 then 'Mar'
             when 4 then 'Apr' when 5 then 'May' when 6 then 'Jun'
             when 7 then 'Jul' when 8 then 'Aug' when 9 then 'Sep'
             when 10 then 'Oct' when 11 then 'Nov' when 12 then 'Dec'
           end
        || ' ' || extract(day from expected.due_date)::integer::text
        || ', ' || extract(year from expected.due_date)::integer::text,
      expected.amount_cents::numeric / 100,
      'requested'::public.payment_status,
      expected.due_date,
      expected.installment_seq,
      v_payment.homeowner_phone,
      v_payment.sms_consent,
      v_payment.sms_consent_at
    from public.legacy_payment_plan_expected_installments(
      v_plan.total_cents,
      v_plan.deposit_cents,
      v_plan.installment_count,
      v_plan.frequency,
      v_plan.first_installment_date
    ) expected
    -- Any ignored uniqueness conflict is followed by full identity, amount,
    -- date, and cardinality proof. Omitting a conflict target also avoids an
    -- OUT-parameter/column ambiguity on payment_plan_id in PL/pgSQL.
    on conflict do nothing;

    get diagnostics v_inserted_installments = row_count;

    if exists (
      select 1
        from public.payments p
        left join lateral public.legacy_payment_plan_expected_installments(
          v_plan.total_cents,
          v_plan.deposit_cents,
          v_plan.installment_count,
          v_plan.frequency,
          v_plan.first_installment_date
        ) expected on expected.installment_seq = p.installment_seq
       where p.payment_plan_id = v_plan.id
         and p.kind::text = 'plan_installment'
         and (
           expected.installment_seq is null
           or p.account_id is distinct from v_plan.account_id
           or p.job_id is distinct from v_plan.job_id
           or pg_catalog.round(p.amount * 100)::bigint
                <> expected.amount_cents::bigint
           or p.due_date is distinct from expected.due_date
         )
    ) then
      raise exception 'legacy payment-plan installment identity conflicts with expected schedule'
        using errcode = '22000';
    end if;

    select pg_catalog.count(*)::integer
      into v_existing_installments
      from public.payments p
     where p.payment_plan_id = v_plan.id
       and p.kind::text = 'plan_installment';

    if v_existing_installments <> v_plan.installment_count then
      raise exception 'legacy payment-plan schedule is incomplete after projection'
        using errcode = '55000';
    end if;

    select expected.due_date
      into v_first_due
      from public.legacy_payment_plan_expected_installments(
        v_plan.total_cents,
        v_plan.deposit_cents,
        v_plan.installment_count,
        v_plan.frequency,
        v_plan.first_installment_date
      ) expected
     where expected.installment_seq = 1;

    v_first_due_label :=
      case extract(month from v_first_due)::integer
        when 1 then 'Jan' when 2 then 'Feb' when 3 then 'Mar'
        when 4 then 'Apr' when 5 then 'May' when 6 then 'Jun'
        when 7 then 'Jul' when 8 then 'Aug' when 9 then 'Sep'
        when 10 then 'Oct' when 11 then 'Nov' when 12 then 'Dec'
      end
      || ' ' || extract(day from v_first_due)::integer::text
      || ', ' || extract(year from v_first_due)::integer::text;
    v_activation_body := 'Deposit received. '
      || v_plan.installment_count::text
      || case when v_plan.installment_count = 1 then ' installment scheduled, first on '
              else ' installments scheduled, first on ' end
      || v_first_due_label || '.';

    perform f.id
      from public.job_feed f
     where f.account_id = v_plan.account_id
       and f.job_id = v_plan.job_id
       and f.kind = 'payment_plan_active'
     order by f.id
     for update;

    if exists (
      select 1
        from public.job_feed f
       where f.account_id = v_plan.account_id
         and f.job_id = v_plan.job_id
         and f.kind = 'payment_plan_active'
         and (f.source_table is null or f.source_id is null)
    ) then
      raise exception 'legacy payment-plan activation has an ambiguous source-less feed event'
        using errcode = '55000';
    end if;

    insert into public.job_feed (
      account_id, job_id, kind, title, body, author, visibility,
      source_table, source_id, published_at, created_at
    ) values (
      v_plan.account_id,
      v_plan.job_id,
      'payment_plan_active',
      'Payment plan started',
      v_activation_body,
      'Owner',
      'client_financial',
      'payments',
      v_payment.id,
      v_now,
      v_now
    )
    on conflict (source_table, source_id, kind)
      where source_table is not null and source_id is not null
    do nothing;

    get diagnostics v_feed_inserted = row_count;

    select f.*
      into v_feed
      from public.job_feed f
     where f.source_table = 'payments'
       and f.source_id = v_payment.id
       and f.kind = 'payment_plan_active'
     for share;

    if not found
       or v_feed.account_id is distinct from v_plan.account_id
       or v_feed.job_id is distinct from v_plan.job_id
       or v_feed.title is distinct from 'Payment plan started'
       or v_feed.body is distinct from v_activation_body
       or v_feed.visibility is distinct from 'client_financial' then
      raise exception 'legacy payment-plan activation feed conflicts with plan truth'
        using errcode = '22000';
    end if;

    v_expected_status := case
      when v_plan.status = 'pending_deposit' then 'activated'
      when v_inserted_installments > 0 or v_feed_inserted > 0 then 'activation_repaired'
      else 'activation_replay'
    end;

    update public.payment_plans pp
       set status = 'active',
           stripe_customer_id = coalesce(
             pp.stripe_customer_id,
             p_stripe_customer_id
           ),
           stripe_payment_method_id = coalesce(
             pp.stripe_payment_method_id,
             p_stripe_payment_method_id
           ),
           card_brand = coalesce(pp.card_brand, pg_catalog.btrim(p_card_brand)),
           card_last4 = coalesce(pp.card_last4, p_card_last4),
           updated_at = v_now
     where pp.id = v_plan.id;

    return query select
      v_expected_status,
      v_plan.id,
      'active'::text,
      v_existing_installments,
      0,
      true;
    return;
  end if;

  if v_payment.kind::text = 'final'
     and v_payment.status::text = 'paid' then
    if v_plan.status = 'canceled' then
      raise exception 'legacy payment-plan paid payoff targets a canceled plan'
        using errcode = '55000';
    end if;

    if v_plan.status in ('pending_deposit', 'active') then
      if v_plan.payoff_payment_id is distinct from v_payment.id
         or v_plan.payoff_locked_at is null then
        raise exception 'legacy payment-plan paid payoff does not own the current lock'
          using errcode = '55000';
      end if;
    elsif v_plan.status = 'paid_off' then
      if v_plan.payoff_payment_id is not null or v_plan.payoff_locked_at is not null then
        raise exception 'legacy payment-plan paid-off replay retains an invalid payoff lock'
          using errcode = '55000';
      end if;
      if (
        select pg_catalog.count(*)
          from public.payments p
         where p.payment_plan_id = v_plan.id
           and p.kind::text = 'final'
           and p.status::text = 'paid'
      ) <> 1 then
        raise exception 'legacy payment-plan paid-off replay has ambiguous paid payoff evidence'
          using errcode = '55000';
      end if;
    else
      raise exception 'legacy payment-plan paid payoff targets an unsupported plan state'
        using errcode = '55000';
    end if;

    if exists (
      select 1
        from public.payments p
       where p.payment_plan_id = v_plan.id
         and p.id <> v_payment.id
         and p.status::text in ('processing', 'disputed')
    ) then
      raise exception 'legacy payment-plan paid payoff conflicts with an unsettled sibling payment'
        using errcode = '55000';
    end if;

    select coalesce(
             pg_catalog.sum(
               pg_catalog.round((p.amount - p.refunded_amount) * 100)::bigint
             ),
             0
           )
      into v_other_paid_cents
      from public.payments p
     where p.payment_plan_id = v_plan.id
       and p.id <> v_payment.id
       and p.status::text = 'paid';
    v_final_cents := pg_catalog.round(
      (v_payment.amount - v_payment.refunded_amount) * 100
    )::bigint;

    if v_final_cents <= 0
       or v_other_paid_cents + v_final_cents <> v_plan.total_cents::bigint then
      raise exception 'legacy payment-plan paid payoff cents do not exactly settle the plan'
        using errcode = '22000';
    end if;

    perform f.id
      from public.job_feed f
     where f.account_id = v_plan.account_id
       and f.job_id = v_plan.job_id
       and f.kind = 'payment_plan_paid_off'
     order by f.id
     for update;

    if exists (
      select 1
        from public.job_feed f
       where f.account_id = v_plan.account_id
         and f.job_id = v_plan.job_id
         and f.kind = 'payment_plan_paid_off'
         and (f.source_table is null or f.source_id is null)
    ) then
      raise exception 'legacy payment-plan payoff has an ambiguous source-less feed event'
        using errcode = '55000';
    end if;

    update public.payments p
       set status = 'canceled'::public.payment_status
     where p.payment_plan_id = v_plan.id
       and (
         (p.kind::text = 'plan_installment' and p.status::text in ('requested', 'failed'))
         or (p.kind::text = 'deposit' and p.status::text in ('requested', 'failed'))
       );

    get diagnostics v_canceled = row_count;

    insert into public.job_feed (
      account_id, job_id, kind, title, body, author, visibility,
      source_table, source_id, published_at, created_at
    ) values (
      v_plan.account_id,
      v_plan.job_id,
      'payment_plan_paid_off',
      'Paid in full',
      'The full amount was paid. No further payments are scheduled.',
      'Owner',
      'client_financial',
      'payments',
      v_payment.id,
      v_now,
      v_now
    )
    on conflict (source_table, source_id, kind)
      where source_table is not null and source_id is not null
    do nothing;

    get diagnostics v_feed_inserted = row_count;

    select f.*
      into v_feed
      from public.job_feed f
     where f.source_table = 'payments'
       and f.source_id = v_payment.id
       and f.kind = 'payment_plan_paid_off'
     for share;

    if not found
       or v_feed.account_id is distinct from v_plan.account_id
       or v_feed.job_id is distinct from v_plan.job_id
       or v_feed.title is distinct from 'Paid in full'
       or v_feed.body is distinct from 'The full amount was paid. No further payments are scheduled.'
       or v_feed.visibility is distinct from 'client_financial' then
      raise exception 'legacy payment-plan payoff feed conflicts with plan truth'
        using errcode = '22000';
    end if;

    v_expected_status := case
      when v_plan.status in ('pending_deposit', 'active') then 'payoff_finalized'
      when v_canceled > 0 or v_feed_inserted > 0 then 'payoff_repaired'
      else 'payoff_replay'
    end;

    update public.payment_plans pp
       set status = 'paid_off',
           payoff_locked_at = null,
           payoff_payment_id = null,
           updated_at = v_now
     where pp.id = v_plan.id;

    select pg_catalog.count(*)::integer
      into v_existing_installments
      from public.payments p
     where p.payment_plan_id = v_plan.id
       and p.kind::text = 'plan_installment';

    return query select
      v_expected_status,
      v_plan.id,
      'paid_off'::text,
      v_existing_installments,
      v_canceled,
      true;
    return;
  end if;

  if v_payment.kind::text = 'final'
     and v_payment.status::text in ('failed', 'canceled') then
    if v_plan.payoff_payment_id is distinct from v_payment.id then
      if v_plan.payoff_payment_id is null and v_plan.payoff_locked_at is null then
        return query select
          'payoff_lock_release_replay'::text,
          v_plan.id,
          v_plan.status,
          (select pg_catalog.count(*)::integer
             from public.payments p
            where p.payment_plan_id = v_plan.id
              and p.kind::text = 'plan_installment'),
          0,
          false;
      else
        return query select
          'stale_payoff_noop'::text,
          v_plan.id,
          v_plan.status,
          (select pg_catalog.count(*)::integer
             from public.payments p
            where p.payment_plan_id = v_plan.id
              and p.kind::text = 'plan_installment'),
          0,
          false;
      end if;
      return;
    end if;

    if v_plan.payoff_locked_at is null then
      raise exception 'legacy payment-plan bound payoff owner has no lock'
        using errcode = '55000';
    end if;
    if v_plan.status not in ('pending_deposit', 'active') then
      raise exception 'legacy payment-plan failed payoff owns a terminal plan lock'
        using errcode = '55000';
    end if;

    update public.payment_plans pp
       set payoff_locked_at = null,
           payoff_payment_id = null,
           updated_at = v_now
     where pp.id = v_plan.id;

    return query select
      'payoff_lock_released'::text,
      v_plan.id,
      v_plan.status,
      (select pg_catalog.count(*)::integer
         from public.payments p
        where p.payment_plan_id = v_plan.id
          and p.kind::text = 'plan_installment'),
      0,
      false;
    return;
  end if;

  raise exception 'legacy payment-plan projection payment kind or status is unsupported'
    using errcode = '22000';
end;
$$;

revoke all on function public.project_legacy_payment_plan_payment(
  uuid, text, text, text, text
) from public, anon, authenticated, service_role;
grant execute on function public.project_legacy_payment_plan_payment(
  uuid, text, text, text, text
) to service_role;

comment on function public.project_legacy_payment_plan_payment(
  uuid, text, text, text, text
) is
  'Dark service-role projection for already-persisted legacy destination payment truth. No route calls it until a separate reviewed cutover.';

commit;
