-- DARK serialized generations for the legacy platform destination-charge Checkout rail.
--
-- This migration creates no caller, route, feature flag, scheduler, provider
-- request, or network access. The runtime gate remains external and OFF. Every
-- provider mutation must occur after a short claim transaction commits, and
-- every provider result must be completed in a separate short transaction.
--
-- Existing destination Checkout Session pointers are deliberately NOT guessed
-- into this ledger. The old runtime did not persist an operation identity,
-- request fingerprint, provider idempotency identities, presentation fact, or
-- authoritative Session lifecycle. Inventing any of those would make an unsafe
-- Session look recoverable. The explicit preflight below therefore fails closed
-- until a separately reviewed provider audit/backfill proves exact history.

begin;

lock table public.payments in share row exclusive mode;

do $$
begin
  if exists (
    select 1
      from public.payments p
     where p.charge_model = 'destination'
       and p.stripe_checkout_session is not null
  ) then
    raise exception 'legacy destination Checkout Session history requires an explicit provider-audited backfill'
      using errcode = '55000';
  end if;

  if exists (
    select 1
      from public.payments p
     where p.charge_model = 'destination'
       and p.current_checkout_operation_pk is not null
  ) then
    raise exception 'legacy destination payment has an unexpected direct Checkout lineage pointer'
      using errcode = '55000';
  end if;
end
$$;

create table public.legacy_destination_checkout_operations (
  id uuid primary key,
  account_id uuid not null,
  payment_id uuid not null,
  checkout_generation integer not null check (checkout_generation > 0),
  predecessor_operation_pk uuid,

  operation_id text not null unique check (
    pg_catalog.length(pg_catalog.btrim(operation_id)) between 1 and 200
    and operation_id !~ '[[:cntrl:]]'
  ),
  ach_stripe_idempotency_key text not null unique check (
    ach_stripe_idempotency_key ~
      '^lgq:legacy-destination:v1:checkout:[0-9a-f-]{36}:[1-9][0-9]*:ach$'
  ),
  card_stripe_idempotency_key text not null unique check (
    card_stripe_idempotency_key ~
      '^lgq:legacy-destination:v1:checkout:[0-9a-f-]{36}:[1-9][0-9]*:card$'
  ),
  request_fingerprint text not null check (request_fingerprint ~ '^[0-9a-f]{64}$'),

  destination_account_id text not null check (
    destination_account_id ~ '^acct_[A-Za-z0-9]{8,}$'
  ),
  livemode boolean not null,
  gross_amount_cents bigint not null check (gross_amount_cents > 0),
  application_fee_cents bigint not null check (
    application_fee_cents >= 0
    and application_fee_cents <= gross_amount_cents
  ),
  fee_rate numeric not null check (fee_rate between 0 and 1),

  state text not null check (
    state in ('claimed', 'submitted', 'completed', 'indeterminate', 'quarantined')
  ),
  claim_token uuid,
  lease_expires_at timestamptz,
  submission_started_at timestamptz,
  checkout_session_id text,
  checkout_session_status text check (
    checkout_session_status is null
    or checkout_session_status in ('open', 'complete', 'expired')
  ),
  checkout_payment_status text check (
    checkout_payment_status is null
    or checkout_payment_status in ('unpaid', 'paid', 'no_payment_required')
  ),
  checkout_session_expires_at timestamptz,
  presented_at timestamptz,
  completed_at timestamptz,
  indeterminate_at timestamptz,
  quarantined_at timestamptz,
  last_error text check (
    last_error is null
    or (
      pg_catalog.length(pg_catalog.btrim(last_error)) between 1 and 500
      and last_error !~ '[[:cntrl:]]'
    )
  ),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),

  constraint legacy_destination_checkout_operation_payment_generation_unique
    unique (payment_id, checkout_generation),
  constraint legacy_destination_checkout_operation_scope_unique
    unique (id, payment_id, account_id),
  constraint legacy_destination_checkout_operation_payment_fk
    foreign key (payment_id, account_id)
    references public.payments(id, account_id)
    on update restrict on delete restrict,
  constraint legacy_destination_checkout_operation_predecessor_fk
    foreign key (predecessor_operation_pk, payment_id, account_id)
    references public.legacy_destination_checkout_operations(id, payment_id, account_id)
    on update restrict on delete restrict,
  constraint legacy_destination_checkout_operation_predecessor_shape_check
    check (
      (checkout_generation = 1 and predecessor_operation_pk is null)
      or (checkout_generation > 1 and predecessor_operation_pk is not null)
    ),
  constraint legacy_destination_checkout_operation_fee_check
    check (
      application_fee_cents =
        pg_catalog.round(gross_amount_cents::numeric * fee_rate)::bigint
    ),
  constraint legacy_destination_checkout_operation_state_shape_check
    check (
      (
        state = 'claimed'
        and claim_token is not null
        and lease_expires_at is not null
        and submission_started_at is null
        and checkout_session_id is null
        and checkout_session_status is null
        and checkout_payment_status is null
        and checkout_session_expires_at is null
        and presented_at is null
        and completed_at is null
        and indeterminate_at is null
        and quarantined_at is null
        and last_error is null
      )
      or (
        state = 'submitted'
        and claim_token is not null
        and lease_expires_at is null
        and submission_started_at is not null
        and checkout_session_id is null
        and checkout_session_status is null
        and checkout_payment_status is null
        and checkout_session_expires_at is null
        and presented_at is null
        and completed_at is null
        and indeterminate_at is null
        and quarantined_at is null
        and last_error is null
      )
      or (
        state = 'completed'
        and claim_token is null
        and lease_expires_at is null
        and submission_started_at is not null
        and checkout_session_id is not null
        and checkout_session_status is not null
        and checkout_payment_status is not null
        and checkout_session_expires_at is not null
        and completed_at is not null
        and indeterminate_at is null
        and quarantined_at is null
        and last_error is null
      )
      or (
        state = 'indeterminate'
        and claim_token is null
        and lease_expires_at is null
        and submission_started_at is not null
        and checkout_session_id is null
        and checkout_session_status is null
        and checkout_payment_status is null
        and checkout_session_expires_at is null
        and presented_at is null
        and completed_at is null
        and indeterminate_at is not null
        and quarantined_at is null
        and last_error is not null
      )
      or (
        state = 'quarantined'
        and claim_token is null
        and lease_expires_at is null
        and submission_started_at is not null
        and presented_at is null
        and completed_at is null
        and indeterminate_at is null
        and quarantined_at is not null
        and last_error is not null
        and (
          (
            checkout_session_id is null
            and checkout_session_status is null
            and checkout_payment_status is null
            and checkout_session_expires_at is null
          )
          or (
            checkout_session_id is not null
            and checkout_session_status is not null
            and checkout_payment_status is not null
            and checkout_session_expires_at is not null
          )
        )
      )
    ),
  constraint legacy_destination_checkout_operation_session_shape_check
    check (
      checkout_session_id is null
      or (
        checkout_session_id ~ '^cs_(test|live)_[A-Za-z0-9_]+$'
        and pg_catalog.length(checkout_session_id) <= 255
        and (
          (livemode and checkout_session_id ~ '^cs_live_')
          or (not livemode and checkout_session_id ~ '^cs_test_')
        )
      )
    ),
  constraint legacy_destination_checkout_operation_presentation_check
    check (
      presented_at is null
      or (
        state = 'completed'
        and checkout_session_id is not null
      )
    )
);

create unique index legacy_destination_checkout_operation_session_unique
  on public.legacy_destination_checkout_operations(checkout_session_id)
  where checkout_session_id is not null;

create index legacy_destination_checkout_operation_payment_order_idx
  on public.legacy_destination_checkout_operations(
    payment_id, checkout_generation, id
  );

alter table public.legacy_destination_checkout_operations enable row level security;
alter table public.legacy_destination_checkout_operations force row level security;
revoke all on table public.legacy_destination_checkout_operations
  from public, anon, authenticated, service_role;

create table public.legacy_destination_checkout_event_receipts (
  id uuid primary key,
  provider_event_id text not null unique check (
    provider_event_id ~ '^evt_[A-Za-z0-9_]{8,}$'
  ),
  event_type text not null check (
    event_type in (
      'checkout.session.completed',
      'checkout.session.async_payment_succeeded',
      'checkout.session.async_payment_failed',
      'checkout.session.expired',
      'payment_intent.succeeded',
      'payment_intent.payment_failed',
      'charge.succeeded',
      'charge.failed'
    )
  ),
  event_object_id text not null check (
    event_object_id ~ '^(cs_(test|live)_|pi_|ch_)[A-Za-z0-9_]+$'
  ),
  account_id uuid not null,
  payment_id uuid not null,
  operation_pk uuid not null,
  checkout_generation integer not null check (checkout_generation > 0),
  checkout_session_id text not null check (
    checkout_session_id ~ '^cs_(test|live)_[A-Za-z0-9_]+$'
  ),
  payment_intent_id text check (
    payment_intent_id is null or payment_intent_id ~ '^pi_[A-Za-z0-9_]+$'
  ),
  livemode boolean not null,
  outcome text not null check (outcome in ('success', 'failure', 'nonterminal')),
  checkout_session_status text check (
    checkout_session_status is null
    or checkout_session_status in ('open', 'complete', 'expired')
  ),
  checkout_payment_status text check (
    checkout_payment_status is null
    or checkout_payment_status in ('unpaid', 'paid', 'no_payment_required')
  ),
  observed_at timestamptz not null,
  classification text not null check (
    classification in (
      'current_success',
      'current_failure',
      'current_nonterminal_noop',
      'historical_failure_noop',
      'historical_paid_hold'
    )
  ),
  projection_allowed boolean not null,
  created_at timestamptz not null default pg_catalog.now(),

  constraint legacy_destination_checkout_event_operation_fk
    foreign key (operation_pk, payment_id, account_id)
    references public.legacy_destination_checkout_operations(id, payment_id, account_id)
    on update restrict on delete restrict
);

create index legacy_destination_checkout_event_operation_idx
  on public.legacy_destination_checkout_event_receipts(
    operation_pk, observed_at, provider_event_id
  );

alter table public.legacy_destination_checkout_event_receipts enable row level security;
alter table public.legacy_destination_checkout_event_receipts force row level security;
revoke all on table public.legacy_destination_checkout_event_receipts
  from public, anon, authenticated, service_role;

alter table public.payments
  add column current_legacy_destination_checkout_operation_pk uuid,
  add column legacy_destination_checkout_paid_hold_operation_pk uuid,
  add column legacy_destination_checkout_paid_hold_at timestamptz,
  add constraint payments_current_legacy_destination_checkout_operation_fk
    foreign key (
      current_legacy_destination_checkout_operation_pk, id, account_id
    ) references public.legacy_destination_checkout_operations(
      id, payment_id, account_id
    ) on update restrict on delete restrict
    deferrable initially deferred,
  add constraint payments_legacy_destination_checkout_paid_hold_fk
    foreign key (
      legacy_destination_checkout_paid_hold_operation_pk, id, account_id
    ) references public.legacy_destination_checkout_operations(
      id, payment_id, account_id
    ) on update restrict on delete restrict
    deferrable initially deferred,
  add constraint payments_legacy_destination_checkout_lineage_shape_check
    check (
      (
        charge_model <> 'destination'
        and current_legacy_destination_checkout_operation_pk is null
        and legacy_destination_checkout_paid_hold_operation_pk is null
        and legacy_destination_checkout_paid_hold_at is null
      )
      or (
        charge_model = 'destination'
        and (
          (
            legacy_destination_checkout_paid_hold_operation_pk is null
            and legacy_destination_checkout_paid_hold_at is null
          )
          or (
            legacy_destination_checkout_paid_hold_operation_pk is not null
            and legacy_destination_checkout_paid_hold_at is not null
          )
        )
      )
    );

create unique index payments_current_legacy_destination_checkout_operation_unique
  on public.payments(current_legacy_destination_checkout_operation_pk)
  where current_legacy_destination_checkout_operation_pk is not null;

create unique index payments_legacy_destination_checkout_paid_hold_unique
  on public.payments(legacy_destination_checkout_paid_hold_operation_pk)
  where legacy_destination_checkout_paid_hold_operation_pk is not null;

create function public.protect_legacy_destination_checkout_operation()
returns trigger
language plpgsql
set search_path = ''
set timezone to 'UTC'
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'legacy destination Checkout generations are append-only'
      using errcode = '42501';
  end if;

  if old.id is distinct from new.id
     or old.account_id is distinct from new.account_id
     or old.payment_id is distinct from new.payment_id
     or old.checkout_generation is distinct from new.checkout_generation
     or old.predecessor_operation_pk is distinct from new.predecessor_operation_pk
     or old.operation_id is distinct from new.operation_id
     or old.ach_stripe_idempotency_key is distinct from new.ach_stripe_idempotency_key
     or old.card_stripe_idempotency_key is distinct from new.card_stripe_idempotency_key
     or old.request_fingerprint is distinct from new.request_fingerprint
     or old.destination_account_id is distinct from new.destination_account_id
     or old.livemode is distinct from new.livemode
     or old.gross_amount_cents is distinct from new.gross_amount_cents
     or old.application_fee_cents is distinct from new.application_fee_cents
     or old.fee_rate is distinct from new.fee_rate
     or old.created_at is distinct from new.created_at then
    raise exception 'legacy destination Checkout generation identity is immutable'
      using errcode = '22000';
  end if;

  if not (
    (old.state = 'claimed' and new.state in ('claimed', 'submitted'))
    or (old.state = 'submitted' and new.state in (
      'completed', 'indeterminate', 'quarantined'
    ))
    or (old.state = 'indeterminate' and new.state = 'quarantined')
    or (old.state in ('completed', 'quarantined') and new.state = old.state)
  ) then
    raise exception 'invalid legacy destination Checkout operation transition: % -> %',
      old.state, new.state using errcode = '22000';
  end if;

  if old.checkout_session_id is not null
     and old.checkout_session_id is distinct from new.checkout_session_id then
    raise exception 'legacy destination Checkout Session identity is immutable'
      using errcode = '22000';
  end if;
  if old.presented_at is not null
     and old.presented_at is distinct from new.presented_at then
    raise exception 'legacy destination Checkout presentation is immutable'
      using errcode = '22000';
  end if;
  if old.checkout_payment_status = 'paid'
     and new.checkout_payment_status is distinct from 'paid' then
    raise exception 'legacy destination Checkout paid evidence is immutable'
      using errcode = '22000';
  end if;

  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

create trigger protect_legacy_destination_checkout_operation_update_trigger
before update on public.legacy_destination_checkout_operations
for each row execute function public.protect_legacy_destination_checkout_operation();

create trigger protect_legacy_destination_checkout_operation_delete_trigger
before delete on public.legacy_destination_checkout_operations
for each row execute function public.protect_legacy_destination_checkout_operation();

revoke all on function public.protect_legacy_destination_checkout_operation()
  from public, anon, authenticated, service_role;

create function public.protect_legacy_destination_checkout_event_receipt()
returns trigger
language plpgsql
set search_path = ''
set timezone to 'UTC'
as $$
begin
  raise exception 'legacy destination Checkout signed-event receipts are append-only'
    using errcode = '42501';
end;
$$;

create trigger protect_legacy_destination_checkout_event_receipt_trigger
before update or delete on public.legacy_destination_checkout_event_receipts
for each row execute function public.protect_legacy_destination_checkout_event_receipt();

revoke all on function public.protect_legacy_destination_checkout_event_receipt()
  from public, anon, authenticated, service_role;

create function public.protect_legacy_destination_checkout_payment_lineage()
returns trigger
language plpgsql
security invoker
set search_path = ''
set timezone to 'UTC'
as $$
declare
  v_context text := pg_catalog.current_setting(
    'lgq.legacy_destination_checkout_payment_id', true
  );
  v_payments_owner name;
begin
  select pg_catalog.pg_get_userbyid(c.relowner)
    into v_payments_owner
    from pg_catalog.pg_class c
   where c.oid = pg_catalog.to_regclass('public.payments');

  if old.legacy_destination_checkout_paid_hold_operation_pk is not null
     and (
       old.legacy_destination_checkout_paid_hold_operation_pk is distinct from
         new.legacy_destination_checkout_paid_hold_operation_pk
       or old.legacy_destination_checkout_paid_hold_at is distinct from
         new.legacy_destination_checkout_paid_hold_at
     ) then
    raise exception 'legacy destination historical-paid hold is immutable'
      using errcode = '22000';
  end if;

  if old.current_legacy_destination_checkout_operation_pk is distinct from
       new.current_legacy_destination_checkout_operation_pk
     or old.legacy_destination_checkout_paid_hold_operation_pk is distinct from
       new.legacy_destination_checkout_paid_hold_operation_pk
     or old.legacy_destination_checkout_paid_hold_at is distinct from
       new.legacy_destination_checkout_paid_hold_at
     or (
       new.current_legacy_destination_checkout_operation_pk is not null
       and old.stripe_checkout_session is distinct from new.stripe_checkout_session
      ) then
    -- Custom GUCs are caller-settable. The GUC is only a per-payment
    -- capability after the effective SQL identity is also proven to be the
    -- table owner. Keep this inside the protected-lineage branch: with the
    -- dark gate OFF, the active legacy path must still be able to update its
    -- old mutable Session pointer while both new lineage pointers are NULL.
    if v_payments_owner is null or current_user is distinct from v_payments_owner then
      raise exception 'legacy destination Checkout payment lineage requires its owning RPC'
        using errcode = '42501';
    end if;
    if v_context is null or v_context is distinct from old.id::text then
      raise exception 'legacy destination Checkout payment lineage is RPC-managed'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

create trigger protect_legacy_destination_checkout_payment_lineage_trigger
before update of current_legacy_destination_checkout_operation_pk,
  legacy_destination_checkout_paid_hold_operation_pk,
  legacy_destination_checkout_paid_hold_at, stripe_checkout_session
on public.payments
for each row execute function public.protect_legacy_destination_checkout_payment_lineage();

revoke all on function public.protect_legacy_destination_checkout_payment_lineage()
  from public, anon, authenticated, service_role;

create function public.claim_legacy_destination_checkout_operation(
  p_payment_id uuid,
  p_livemode boolean,
  p_request_fingerprint text,
  p_gross_amount_cents bigint,
  p_application_fee_cents bigint,
  p_fee_rate numeric
)
returns table (
  claim_status text,
  operation_pk uuid,
  claim_token uuid,
  operation_state text,
  checkout_generation integer,
  predecessor_operation_pk uuid,
  operation_id text,
  ach_stripe_idempotency_key text,
  card_stripe_idempotency_key text,
  request_fingerprint text,
  destination_account_id text,
  livemode boolean,
  gross_amount_cents bigint,
  application_fee_cents bigint,
  fee_rate numeric,
  checkout_session_id text,
  checkout_session_status text,
  checkout_payment_status text,
  checkout_session_expires_at timestamptz,
  presented_at timestamptz,
  paid_hold_active boolean
)
language plpgsql
security definer
set search_path = ''
set timezone to 'UTC'
as $$
declare
  v_payment public.payments%rowtype;
  v_current public.legacy_destination_checkout_operations%rowtype;
  v_operation public.legacy_destination_checkout_operations%rowtype;
  v_destination_account_id text;
  v_generation integer;
  v_operation_pk uuid := pg_catalog.gen_random_uuid();
  v_claim_token uuid := pg_catalog.gen_random_uuid();
  v_operation_id text;
  v_ach_key text;
  v_card_key text;
  v_status text;
begin
  if p_payment_id is null
     or p_livemode is null
     or p_request_fingerprint is null
     or p_request_fingerprint !~ '^[0-9a-f]{64}$'
     or p_gross_amount_cents is null
     or p_gross_amount_cents <= 0
     or p_application_fee_cents is null
     or p_application_fee_cents < 0
     or p_application_fee_cents > p_gross_amount_cents
     or p_fee_rate is null
     or p_fee_rate not between 0 and 1
     or p_application_fee_cents is distinct from
       pg_catalog.round(p_gross_amount_cents::numeric * p_fee_rate)::bigint then
    raise exception 'invalid legacy destination Checkout claim input'
      using errcode = '22023';
  end if;

  -- Universal runtime lock order: payment first, then every generation ordered
  -- by generation and UUID. No RPC holds these locks across a provider call.
  select p.* into v_payment
    from public.payments p
   where p.id = p_payment_id
   for update;
  if not found then
    raise exception 'legacy destination Checkout payment was not found'
      using errcode = 'P0002';
  end if;

  perform 1
    from public.legacy_destination_checkout_operations o
   where o.payment_id = p_payment_id
   order by o.checkout_generation, o.id
   for update;

  select a.stripe_connect_id into v_destination_account_id
    from public.accounts a
   where a.id = v_payment.account_id
     and a.connect_onboarded
     and a.stripe_connect_id ~ '^acct_[A-Za-z0-9]{8,}$'
     and a.payouts_restricted_at is null;
  if not found then
    raise exception 'legacy destination Checkout recipient is not currently chargeable'
      using errcode = '55000';
  end if;

  if v_payment.charge_model <> 'destination'
     or v_payment.amount is distinct from p_gross_amount_cents::numeric / 100
     or v_payment.paid_at is not null
     or v_payment.refunded_amount is distinct from 0
     or v_payment.disputed_at is not null then
    raise exception 'legacy destination Checkout payment scope is not claimable'
      using errcode = '55000';
  end if;

  if v_payment.legacy_destination_checkout_paid_hold_operation_pk is not null
     or v_payment.status::text in ('paid', 'refunded', 'disputed', 'canceled') then
    if v_payment.current_legacy_destination_checkout_operation_pk is not null then
      select o.* into v_current
        from public.legacy_destination_checkout_operations o
       where o.id = v_payment.current_legacy_destination_checkout_operation_pk;
    end if;
    return query select
      'paid_hold'::text, v_current.id, null::uuid, v_current.state,
      v_current.checkout_generation, v_current.predecessor_operation_pk,
      v_current.operation_id, v_current.ach_stripe_idempotency_key,
      v_current.card_stripe_idempotency_key, v_current.request_fingerprint,
      v_current.destination_account_id, v_current.livemode,
      v_current.gross_amount_cents, v_current.application_fee_cents,
      v_current.fee_rate, v_current.checkout_session_id,
      v_current.checkout_session_status, v_current.checkout_payment_status,
      v_current.checkout_session_expires_at, v_current.presented_at,
      (v_payment.legacy_destination_checkout_paid_hold_operation_pk is not null);
    return;
  end if;

  if v_payment.current_legacy_destination_checkout_operation_pk is not null then
    select o.* into v_current
      from public.legacy_destination_checkout_operations o
     where o.id = v_payment.current_legacy_destination_checkout_operation_pk
       and o.payment_id = v_payment.id
       and o.account_id = v_payment.account_id;
    if not found then
      raise exception 'legacy destination Checkout current pointer is invalid'
        using errcode = 'P0001';
    end if;

    if v_current.request_fingerprint is distinct from p_request_fingerprint
       or v_current.livemode is distinct from p_livemode
       or v_current.destination_account_id is distinct from v_destination_account_id
       or v_current.gross_amount_cents is distinct from p_gross_amount_cents
       or v_current.application_fee_cents is distinct from p_application_fee_cents
       or v_current.fee_rate is distinct from p_fee_rate then
      raise exception 'legacy destination Checkout replay input changed'
        using errcode = '22000';
    end if;

    if v_current.state = 'claimed'
       and v_current.lease_expires_at <= pg_catalog.now() then
      update public.legacy_destination_checkout_operations o
         set claim_token = v_claim_token,
             lease_expires_at = pg_catalog.now() + interval '5 minutes'
       where o.id = v_current.id
      returning * into v_current;
      v_status := 'claimed';
    elsif v_current.state = 'claimed' then
      v_status := 'in_progress';
    elsif v_current.state = 'submitted' then
      v_status := 'submitted';
    elsif v_current.state = 'indeterminate' then
      v_status := 'indeterminate';
    elsif v_current.state = 'quarantined' then
      v_status := 'quarantined';
    elsif v_current.checkout_session_status = 'complete'
       and v_current.checkout_payment_status = 'unpaid' then
      v_status := 'complete_unpaid';
    elsif not (
      v_current.state = 'completed'
      and v_current.checkout_session_status = 'expired'
      and v_current.checkout_payment_status = 'unpaid'
    ) then
      v_status := case
        when v_current.presented_at is null then 'replay_unpresented'
        else 'replay_presented'
      end;
    end if;

    if v_status is not null then
      return query select
        v_status, v_current.id,
        case when v_status = 'claimed' then v_current.claim_token else null::uuid end,
        v_current.state, v_current.checkout_generation,
        v_current.predecessor_operation_pk, v_current.operation_id,
        v_current.ach_stripe_idempotency_key,
        v_current.card_stripe_idempotency_key,
        v_current.request_fingerprint, v_current.destination_account_id,
        v_current.livemode, v_current.gross_amount_cents,
        v_current.application_fee_cents, v_current.fee_rate,
        v_current.checkout_session_id, v_current.checkout_session_status,
        v_current.checkout_payment_status, v_current.checkout_session_expires_at,
        v_current.presented_at, false;
      return;
    end if;

    -- Only signed exact-current expired + unpaid evidence recorded by the event
    -- classifier can reach this branch. Complete/unpaid, submitted,
    -- indeterminate, and quarantined generations remain permanently blocked.
    if not exists (
      select 1
        from public.legacy_destination_checkout_event_receipts r
       where r.operation_pk = v_current.id
         and r.payment_id = v_payment.id
         and r.checkout_session_id = v_current.checkout_session_id
         and r.event_type = 'checkout.session.expired'
         and r.outcome = 'failure'
         and r.checkout_session_status = 'expired'
         and r.checkout_payment_status = 'unpaid'
         and r.classification = 'current_failure'
    ) then
      raise exception 'legacy destination Checkout replacement lacks exact signed expiration evidence'
        using errcode = '55000';
    end if;
    v_generation := v_current.checkout_generation + 1;
  else
    if exists (
      select 1
        from public.legacy_destination_checkout_operations o
       where o.payment_id = v_payment.id
    ) then
      raise exception 'legacy destination Checkout ledger is missing its current pointer'
        using errcode = 'P0001';
    end if;
    if v_payment.status::text not in ('requested', 'failed')
       or v_payment.stripe_checkout_session is not null
       or v_payment.stripe_payment_intent is not null
       or v_payment.stripe_charge_id is not null then
      raise exception 'first legacy destination Checkout claim requires an unbound requested or failed payment'
        using errcode = '55000';
    end if;
    v_generation := 1;
  end if;

  v_operation_id := 'payment:' || p_payment_id::text
    || ':legacy-destination-checkout:' || v_generation::text;
  v_ach_key := 'lgq:legacy-destination:v1:checkout:' || p_payment_id::text
    || ':' || v_generation::text || ':ach';
  v_card_key := 'lgq:legacy-destination:v1:checkout:' || p_payment_id::text
    || ':' || v_generation::text || ':card';

  insert into public.legacy_destination_checkout_operations (
    id, account_id, payment_id, checkout_generation,
    predecessor_operation_pk, operation_id, ach_stripe_idempotency_key,
    card_stripe_idempotency_key, request_fingerprint,
    destination_account_id, livemode, gross_amount_cents,
    application_fee_cents, fee_rate, state, claim_token, lease_expires_at
  ) values (
    v_operation_pk, v_payment.account_id, v_payment.id, v_generation,
    v_current.id, v_operation_id, v_ach_key, v_card_key,
    p_request_fingerprint, v_destination_account_id, p_livemode,
    p_gross_amount_cents, p_application_fee_cents, p_fee_rate,
    'claimed', v_claim_token, pg_catalog.now() + interval '5 minutes'
  ) returning * into v_operation;

  perform pg_catalog.set_config(
    'lgq.legacy_destination_checkout_payment_id', v_payment.id::text, true
  );
  update public.payments p
     set current_legacy_destination_checkout_operation_pk = v_operation.id,
         stripe_checkout_session = null
   where p.id = v_payment.id;
  perform pg_catalog.set_config('lgq.legacy_destination_checkout_payment_id', '', true);

  return query select
    'claimed'::text, v_operation.id, v_operation.claim_token,
    v_operation.state, v_operation.checkout_generation,
    v_operation.predecessor_operation_pk, v_operation.operation_id,
    v_operation.ach_stripe_idempotency_key,
    v_operation.card_stripe_idempotency_key,
    v_operation.request_fingerprint, v_operation.destination_account_id,
    v_operation.livemode, v_operation.gross_amount_cents,
    v_operation.application_fee_cents, v_operation.fee_rate,
    v_operation.checkout_session_id, v_operation.checkout_session_status,
    v_operation.checkout_payment_status, v_operation.checkout_session_expires_at,
    v_operation.presented_at, false;
end;
$$;

create function public.begin_legacy_destination_checkout_submission(
  p_operation_pk uuid,
  p_claim_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
set timezone to 'UTC'
as $$
declare
  v_hint public.legacy_destination_checkout_operations%rowtype;
  v_operation public.legacy_destination_checkout_operations%rowtype;
  v_payment public.payments%rowtype;
begin
  if p_operation_pk is null or p_claim_token is null then
    raise exception 'legacy destination Checkout submission identity is invalid'
      using errcode = '22023';
  end if;

  select o.* into v_hint
    from public.legacy_destination_checkout_operations o
   where o.id = p_operation_pk;
  if not found then
    raise exception 'legacy destination Checkout operation was not found'
      using errcode = 'P0002';
  end if;

  select p.* into v_payment
    from public.payments p
   where p.id = v_hint.payment_id
   for update;
  if not found then
    raise exception 'legacy destination Checkout payment was not found'
      using errcode = 'P0002';
  end if;

  perform 1
    from public.legacy_destination_checkout_operations o
   where o.payment_id = v_payment.id
   order by o.checkout_generation, o.id
   for update;
  select o.* into v_operation
    from public.legacy_destination_checkout_operations o
   where o.id = p_operation_pk;

  if v_operation.state <> 'claimed'
     or v_operation.claim_token is distinct from p_claim_token
     or v_operation.lease_expires_at is null
     or v_operation.lease_expires_at <= pg_catalog.now()
     or v_payment.charge_model <> 'destination'
     or v_payment.current_legacy_destination_checkout_operation_pk is distinct from
       v_operation.id
     or v_payment.legacy_destination_checkout_paid_hold_operation_pk is not null
     or v_payment.stripe_checkout_session is not null
     or v_payment.stripe_payment_intent is not null
     or v_payment.stripe_charge_id is not null
     or v_payment.status::text not in ('requested', 'processing', 'failed') then
    raise exception 'legacy destination Checkout claim is not current, owned, or submit-ready'
      using errcode = '55000';
  end if;

  if not exists (
    select 1
      from public.accounts a
     where a.id = v_payment.account_id
       and a.stripe_connect_id = v_operation.destination_account_id
       and a.connect_onboarded
       and a.payouts_restricted_at is null
  ) then
    raise exception 'legacy destination Checkout recipient changed before submission'
      using errcode = '55000';
  end if;

  update public.legacy_destination_checkout_operations o
     set state = 'submitted',
         lease_expires_at = null,
         submission_started_at = pg_catalog.now()
   where o.id = v_operation.id;
  return true;
end;
$$;

create function public.complete_legacy_destination_checkout_operation(
  p_operation_pk uuid,
  p_claim_token uuid,
  p_checkout_session_id text,
  p_checkout_session_status text,
  p_checkout_payment_status text,
  p_checkout_session_expires_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
set timezone to 'UTC'
as $$
declare
  v_hint public.legacy_destination_checkout_operations%rowtype;
  v_operation public.legacy_destination_checkout_operations%rowtype;
  v_payment public.payments%rowtype;
begin
  if p_operation_pk is null
     or p_claim_token is null
     or p_checkout_session_id is null
     or p_checkout_session_id !~ '^cs_(test|live)_[A-Za-z0-9_]+$'
     or pg_catalog.length(p_checkout_session_id) > 255
     or p_checkout_session_status is distinct from 'open'
     or p_checkout_payment_status is distinct from 'unpaid'
     or p_checkout_session_expires_at is null
     or p_checkout_session_expires_at <= pg_catalog.now()
     or p_checkout_session_expires_at > pg_catalog.now() + interval '25 hours' then
    raise exception 'legacy destination Checkout completion evidence is invalid'
      using errcode = '22023';
  end if;

  select o.* into v_hint
    from public.legacy_destination_checkout_operations o
   where o.id = p_operation_pk;
  if not found then
    raise exception 'legacy destination Checkout operation was not found'
      using errcode = 'P0002';
  end if;

  select p.* into v_payment
    from public.payments p
   where p.id = v_hint.payment_id
   for update;
  if not found then
    raise exception 'legacy destination Checkout payment was not found'
      using errcode = 'P0002';
  end if;

  perform 1
    from public.legacy_destination_checkout_operations o
   where o.payment_id = v_payment.id
   order by o.checkout_generation, o.id
   for update;
  select o.* into v_operation
    from public.legacy_destination_checkout_operations o
   where o.id = p_operation_pk;

  if (v_operation.livemode and p_checkout_session_id !~ '^cs_live_')
     or (not v_operation.livemode and p_checkout_session_id !~ '^cs_test_')
     or v_operation.state <> 'submitted'
     or v_operation.claim_token is distinct from p_claim_token
     or v_payment.charge_model <> 'destination'
     or v_payment.current_legacy_destination_checkout_operation_pk is distinct from
       v_operation.id
     or v_payment.legacy_destination_checkout_paid_hold_operation_pk is not null
     or v_payment.stripe_checkout_session is not null
     or v_payment.stripe_payment_intent is not null
     or v_payment.stripe_charge_id is not null
     or v_payment.status::text not in ('requested', 'processing', 'failed') then
    raise exception 'legacy destination Checkout result does not own the exact current generation'
      using errcode = '55000';
  end if;

  if not exists (
    select 1
      from public.accounts a
     where a.id = v_payment.account_id
       and a.stripe_connect_id = v_operation.destination_account_id
       and a.connect_onboarded
       and a.payouts_restricted_at is null
  ) then
    raise exception 'legacy destination Checkout recipient changed before completion'
      using errcode = '55000';
  end if;

  update public.legacy_destination_checkout_operations o
     set state = 'completed',
         claim_token = null,
         checkout_session_id = p_checkout_session_id,
         checkout_session_status = p_checkout_session_status,
         checkout_payment_status = p_checkout_payment_status,
         checkout_session_expires_at = p_checkout_session_expires_at,
         completed_at = pg_catalog.now()
   where o.id = v_operation.id;

  perform pg_catalog.set_config(
    'lgq.legacy_destination_checkout_payment_id', v_payment.id::text, true
  );
  update public.payments p
     set status = 'processing',
         stripe_checkout_session = p_checkout_session_id,
         platform_fee = v_operation.application_fee_cents::numeric / 100,
         fee_rate = v_operation.fee_rate
   where p.id = v_payment.id
     and p.current_legacy_destination_checkout_operation_pk = v_operation.id;
  perform pg_catalog.set_config('lgq.legacy_destination_checkout_payment_id', '', true);
  if not found then
    raise exception 'legacy destination Checkout payment pointer changed during completion'
      using errcode = '40001';
  end if;

  return true;
end;
$$;

create function public.confirm_legacy_destination_checkout_presentation(
  p_operation_pk uuid,
  p_checkout_session_id text
)
returns boolean
language plpgsql
security definer
set search_path = ''
set timezone to 'UTC'
as $$
declare
  v_hint public.legacy_destination_checkout_operations%rowtype;
  v_operation public.legacy_destination_checkout_operations%rowtype;
  v_payment public.payments%rowtype;
begin
  if p_operation_pk is null
     or p_checkout_session_id is null
     or p_checkout_session_id !~ '^cs_(test|live)_[A-Za-z0-9_]+$' then
    raise exception 'legacy destination Checkout presentation identity is invalid'
      using errcode = '22023';
  end if;

  select o.* into v_hint
    from public.legacy_destination_checkout_operations o
   where o.id = p_operation_pk;
  if not found then
    raise exception 'legacy destination Checkout operation was not found'
      using errcode = 'P0002';
  end if;
  select p.* into v_payment
    from public.payments p
   where p.id = v_hint.payment_id
   for update;
  perform 1
    from public.legacy_destination_checkout_operations o
   where o.payment_id = v_hint.payment_id
   order by o.checkout_generation, o.id
   for update;
  select o.* into v_operation
    from public.legacy_destination_checkout_operations o
   where o.id = p_operation_pk;

  if v_payment.current_legacy_destination_checkout_operation_pk is distinct from
       v_operation.id
     or v_payment.legacy_destination_checkout_paid_hold_operation_pk is not null
     or v_payment.stripe_checkout_session is distinct from p_checkout_session_id
     or v_operation.state <> 'completed'
     or v_operation.checkout_session_id is distinct from p_checkout_session_id
     or v_operation.checkout_session_status <> 'open'
     or v_operation.checkout_payment_status <> 'unpaid' then
    raise exception 'only the exact current open unpaid Checkout URL may be presented'
      using errcode = '55000';
  end if;

  if v_operation.presented_at is null then
    update public.legacy_destination_checkout_operations o
       set presented_at = pg_catalog.now()
     where o.id = v_operation.id;
  end if;
  return true;
end;
$$;

create function public.mark_legacy_destination_checkout_indeterminate(
  p_operation_pk uuid,
  p_claim_token uuid,
  p_last_error text
)
returns boolean
language plpgsql
security definer
set search_path = ''
set timezone to 'UTC'
as $$
declare
  v_hint public.legacy_destination_checkout_operations%rowtype;
  v_operation public.legacy_destination_checkout_operations%rowtype;
  v_payment public.payments%rowtype;
begin
  if p_operation_pk is null
     or p_claim_token is null
     or p_last_error is null
     or pg_catalog.length(pg_catalog.btrim(p_last_error)) not between 1 and 500
     or p_last_error ~ '[[:cntrl:]]' then
    raise exception 'legacy destination Checkout indeterminate evidence is invalid'
      using errcode = '22023';
  end if;
  select o.* into v_hint
    from public.legacy_destination_checkout_operations o
   where o.id = p_operation_pk;
  if not found then
    raise exception 'legacy destination Checkout operation was not found'
      using errcode = 'P0002';
  end if;
  select p.* into v_payment
    from public.payments p
   where p.id = v_hint.payment_id
   for update;
  perform 1
    from public.legacy_destination_checkout_operations o
   where o.payment_id = v_hint.payment_id
   order by o.checkout_generation, o.id
   for update;
  select o.* into v_operation
    from public.legacy_destination_checkout_operations o
   where o.id = p_operation_pk;

  if v_operation.state <> 'submitted'
     or v_operation.claim_token is distinct from p_claim_token
     or v_payment.current_legacy_destination_checkout_operation_pk is distinct from
       v_operation.id then
    raise exception 'legacy destination Checkout submission is not owned by this claim'
      using errcode = '55000';
  end if;

  update public.legacy_destination_checkout_operations o
     set state = 'indeterminate',
         claim_token = null,
         indeterminate_at = pg_catalog.now(),
         last_error = pg_catalog.btrim(p_last_error)
   where o.id = v_operation.id;
  return true;
end;
$$;

create function public.quarantine_legacy_destination_checkout_operation(
  p_operation_pk uuid,
  p_claim_token uuid,
  p_checkout_session_id text,
  p_checkout_session_status text,
  p_checkout_payment_status text,
  p_checkout_session_expires_at timestamptz,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path = ''
set timezone to 'UTC'
as $$
declare
  v_hint public.legacy_destination_checkout_operations%rowtype;
  v_operation public.legacy_destination_checkout_operations%rowtype;
  v_payment public.payments%rowtype;
begin
  if p_operation_pk is null
     or p_claim_token is null
     or p_reason is null
     or pg_catalog.length(pg_catalog.btrim(p_reason)) not between 1 and 500
     or p_reason ~ '[[:cntrl:]]'
     or not (
       (
         p_checkout_session_id is null
         and p_checkout_session_status is null
         and p_checkout_payment_status is null
         and p_checkout_session_expires_at is null
       )
       or (
         p_checkout_session_id is not null
         and p_checkout_session_status is not null
         and p_checkout_payment_status is not null
         and p_checkout_session_expires_at is not null
         and p_checkout_session_id ~ '^cs_(test|live)_[A-Za-z0-9_]+$'
         and pg_catalog.length(p_checkout_session_id) <= 255
         and p_checkout_session_status in ('open', 'complete', 'expired')
         and p_checkout_payment_status in ('unpaid', 'paid', 'no_payment_required')
         and p_checkout_session_expires_at > '2000-01-01 00:00:00+00'::timestamptz
       )
     ) then
    raise exception 'legacy destination Checkout quarantine evidence is invalid'
      using errcode = '22023';
  end if;
  select o.* into v_hint
    from public.legacy_destination_checkout_operations o
   where o.id = p_operation_pk;
  if not found then
    raise exception 'legacy destination Checkout operation was not found'
      using errcode = 'P0002';
  end if;
  select p.* into v_payment
    from public.payments p
   where p.id = v_hint.payment_id
   for update;
  perform 1
    from public.legacy_destination_checkout_operations o
   where o.payment_id = v_hint.payment_id
   order by o.checkout_generation, o.id
   for update;
  select o.* into v_operation
    from public.legacy_destination_checkout_operations o
   where o.id = p_operation_pk;

  if v_operation.state <> 'submitted'
     or v_operation.claim_token is distinct from p_claim_token
     or v_payment.current_legacy_destination_checkout_operation_pk is distinct from
       v_operation.id
     or (
       p_checkout_session_id is not null
       and (
         (v_operation.livemode and p_checkout_session_id !~ '^cs_live_')
         or (not v_operation.livemode and p_checkout_session_id !~ '^cs_test_')
       )
     ) then
    raise exception 'legacy destination Checkout quarantine does not own the exact current submission'
      using errcode = '55000';
  end if;

  update public.legacy_destination_checkout_operations o
     set state = 'quarantined',
         claim_token = null,
         checkout_session_id = p_checkout_session_id,
         checkout_session_status = p_checkout_session_status,
         checkout_payment_status = p_checkout_payment_status,
         checkout_session_expires_at = p_checkout_session_expires_at,
         quarantined_at = pg_catalog.now(),
         last_error = pg_catalog.btrim(p_reason)
   where o.id = v_operation.id;
  return true;
end;
$$;

create function public.classify_legacy_destination_checkout_event(
  p_provider_event_id text,
  p_event_type text,
  p_event_object_id text,
  p_payment_id uuid,
  p_checkout_session_id text,
  p_payment_intent_id text,
  p_livemode boolean,
  p_outcome text,
  p_checkout_session_status text,
  p_checkout_payment_status text,
  p_observed_at timestamptz
)
returns table (
  event_status text,
  classification text,
  operation_pk uuid,
  checkout_generation integer,
  is_current boolean,
  projection_allowed boolean,
  paid_hold_active boolean
)
language plpgsql
security definer
set search_path = ''
set timezone to 'UTC'
as $$
declare
  v_payment public.payments%rowtype;
  v_operation public.legacy_destination_checkout_operations%rowtype;
  v_receipt public.legacy_destination_checkout_event_receipts%rowtype;
  v_classification text;
  v_is_current boolean;
  v_projection_allowed boolean := false;
begin
  if p_provider_event_id is null
     or p_provider_event_id !~ '^evt_[A-Za-z0-9_]{8,}$'
     or p_event_type is null
     or p_event_type not in (
       'checkout.session.completed',
       'checkout.session.async_payment_succeeded',
       'checkout.session.async_payment_failed',
       'checkout.session.expired',
       'payment_intent.succeeded',
       'payment_intent.payment_failed',
       'charge.succeeded',
       'charge.failed'
     )
     or p_event_object_id is null
     or p_event_object_id !~ '^(cs_(test|live)_|pi_|ch_)[A-Za-z0-9_]+$'
     or p_payment_id is null
     or p_checkout_session_id is null
     or p_checkout_session_id !~ '^cs_(test|live)_[A-Za-z0-9_]+$'
     or p_livemode is null
     or p_outcome is null
     or p_outcome not in ('success', 'failure', 'nonterminal')
     or (
       p_payment_intent_id is not null
       and p_payment_intent_id !~ '^pi_[A-Za-z0-9_]+$'
     )
     or (
       p_checkout_session_status is not null
       and p_checkout_session_status not in ('open', 'complete', 'expired')
     )
     or (
       p_checkout_payment_status is not null
       and p_checkout_payment_status not in ('unpaid', 'paid', 'no_payment_required')
     )
     or p_observed_at is null
     or p_observed_at <= '2000-01-01 00:00:00+00'::timestamptz
     or p_observed_at > pg_catalog.now() + interval '5 minutes' then
    raise exception 'legacy destination signed-event input is invalid'
      using errcode = '22023';
  end if;

  if (p_livemode and p_checkout_session_id !~ '^cs_live_')
     or (not p_livemode and p_checkout_session_id !~ '^cs_test_')
     or (
       p_event_type like 'checkout.session.%'
       and p_event_object_id is distinct from p_checkout_session_id
     )
     or (
       p_event_type like 'payment_intent.%'
       and p_event_object_id is distinct from p_payment_intent_id
     )
     or (p_event_type = 'checkout.session.expired' and not (
       p_outcome = 'failure'
       and p_checkout_session_status = 'expired'
       and p_checkout_payment_status = 'unpaid'
     ))
     or (p_event_type = 'checkout.session.async_payment_failed' and not (
       p_outcome = 'failure'
       and p_checkout_session_status = 'complete'
       and p_checkout_payment_status = 'unpaid'
     ))
     or (p_event_type = 'checkout.session.completed' and not (
       (p_outcome = 'success' and p_checkout_payment_status = 'paid')
       or (
         p_outcome = 'nonterminal'
         and p_checkout_session_status = 'complete'
         and p_checkout_payment_status = 'unpaid'
       )
     ))
     or (
       p_event_type in (
         'checkout.session.async_payment_succeeded',
         'payment_intent.succeeded',
         'charge.succeeded'
       )
       and (p_outcome <> 'success' or p_checkout_payment_status <> 'paid')
     )
     or (
       p_event_type in ('payment_intent.payment_failed', 'charge.failed')
       and p_outcome <> 'failure'
     )
     or (
       p_outcome = 'success'
       and p_payment_intent_id is null
     ) then
    raise exception 'legacy destination signed-event semantics are contradictory'
      using errcode = '22000';
  end if;

  -- Event classification uses the same payment-first, ordered-generation lock
  -- order as create orchestration, so a classification can never race a pointer
  -- move and accidentally authorize a successor generation.
  select p.* into v_payment
    from public.payments p
   where p.id = p_payment_id
   for update;
  if not found or v_payment.charge_model <> 'destination' then
    raise exception 'legacy destination signed event payment was not found on its rail'
      using errcode = 'P0002';
  end if;

  perform 1
    from public.legacy_destination_checkout_operations o
   where o.payment_id = p_payment_id
   order by o.checkout_generation, o.id
   for update;

  select r.* into v_receipt
    from public.legacy_destination_checkout_event_receipts r
   where r.provider_event_id = p_provider_event_id;
  if found then
    if v_receipt.event_type is distinct from p_event_type
       or v_receipt.event_object_id is distinct from p_event_object_id
       or v_receipt.payment_id is distinct from p_payment_id
       or v_receipt.checkout_session_id is distinct from p_checkout_session_id
       or v_receipt.payment_intent_id is distinct from p_payment_intent_id
       or v_receipt.livemode is distinct from p_livemode
       or v_receipt.outcome is distinct from p_outcome
       or v_receipt.checkout_session_status is distinct from p_checkout_session_status
       or v_receipt.checkout_payment_status is distinct from p_checkout_payment_status
       or v_receipt.observed_at is distinct from p_observed_at then
      raise exception 'legacy destination signed-event replay input changed'
        using errcode = '22000';
    end if;
    return query select
      'replay'::text, v_receipt.classification, v_receipt.operation_pk,
      v_receipt.checkout_generation,
      v_payment.current_legacy_destination_checkout_operation_pk =
        v_receipt.operation_pk,
      false::boolean,
      v_payment.legacy_destination_checkout_paid_hold_operation_pk is not null;
    return;
  end if;

  select o.* into v_operation
    from public.legacy_destination_checkout_operations o
   where o.payment_id = p_payment_id
     and o.checkout_session_id = p_checkout_session_id;
  if not found
     or v_operation.account_id is distinct from v_payment.account_id
     or v_operation.livemode is distinct from p_livemode
     or v_operation.state not in ('completed', 'quarantined') then
    raise exception 'legacy destination signed event is not bound to an exact Checkout generation'
      using errcode = '55000';
  end if;

  v_is_current := v_payment.current_legacy_destination_checkout_operation_pk =
    v_operation.id;

  if not v_is_current then
    if p_outcome = 'success' then
      if v_payment.legacy_destination_checkout_paid_hold_operation_pk is not null
         and v_payment.legacy_destination_checkout_paid_hold_operation_pk is distinct from
           v_operation.id then
        raise exception 'legacy destination payment has multiple historical paid generations'
          using errcode = '55000';
      end if;

      update public.legacy_destination_checkout_operations o
         set checkout_session_status = coalesce(
               p_checkout_session_status, o.checkout_session_status
             ),
             checkout_payment_status = 'paid'
       where o.id = v_operation.id;

      perform pg_catalog.set_config(
        'lgq.legacy_destination_checkout_payment_id', v_payment.id::text, true
      );
      update public.payments p
         set legacy_destination_checkout_paid_hold_operation_pk = v_operation.id,
             legacy_destination_checkout_paid_hold_at = coalesce(
               p.legacy_destination_checkout_paid_hold_at, pg_catalog.now()
             )
       where p.id = v_payment.id;
      perform pg_catalog.set_config(
        'lgq.legacy_destination_checkout_payment_id', '', true
      );
      v_classification := 'historical_paid_hold';
    else
      -- Historical failures are deliberately fixed no-ops. They may never
      -- change the current payment or make the current generation replaceable.
      v_classification := 'historical_failure_noop';
    end if;
  elsif p_outcome = 'nonterminal' then
    update public.legacy_destination_checkout_operations o
       set checkout_session_status = p_checkout_session_status,
           checkout_payment_status = p_checkout_payment_status
     where o.id = v_operation.id;
    v_classification := 'current_nonterminal_noop';
  elsif p_outcome = 'success' then
    update public.legacy_destination_checkout_operations o
       set checkout_session_status = coalesce(
             p_checkout_session_status, o.checkout_session_status
           ),
           checkout_payment_status = 'paid'
     where o.id = v_operation.id;
    v_classification := 'current_success';

    if v_payment.legacy_destination_checkout_paid_hold_operation_pk is null
       and v_payment.status::text in ('requested', 'processing', 'failed')
       and (
         v_payment.stripe_payment_intent is null
         or v_payment.stripe_payment_intent = p_payment_intent_id
       ) then
      perform pg_catalog.set_config(
        'lgq.legacy_destination_checkout_payment_id', v_payment.id::text, true
      );
      update public.payments p
         set status = 'paid',
             paid_at = p_observed_at,
             stripe_checkout_session = v_operation.checkout_session_id,
             stripe_payment_intent = p_payment_intent_id,
             platform_fee = v_operation.application_fee_cents::numeric / 100,
             fee_rate = v_operation.fee_rate
       where p.id = v_payment.id
         and p.current_legacy_destination_checkout_operation_pk = v_operation.id;
      perform pg_catalog.set_config(
        'lgq.legacy_destination_checkout_payment_id', '', true
      );
      v_projection_allowed := found;
    elsif not (
      v_payment.status::text = 'paid'
      and v_payment.stripe_checkout_session = v_operation.checkout_session_id
      and v_payment.stripe_payment_intent = p_payment_intent_id
    ) then
      raise exception 'legacy destination current success conflicts with payment truth'
        using errcode = '22000';
    end if;
  else
    update public.legacy_destination_checkout_operations o
       set checkout_session_status = coalesce(
             p_checkout_session_status, o.checkout_session_status
           ),
           checkout_payment_status = coalesce(
             p_checkout_payment_status, o.checkout_payment_status
           )
     where o.id = v_operation.id;
    v_classification := 'current_failure';

    if v_payment.legacy_destination_checkout_paid_hold_operation_pk is null
       and v_payment.status::text in ('requested', 'processing', 'failed')
       and (
         p_payment_intent_id is null
         or v_payment.stripe_payment_intent is null
         or v_payment.stripe_payment_intent = p_payment_intent_id
       ) then
      v_projection_allowed := v_payment.status::text <> 'failed'
        or (
          p_payment_intent_id is not null
          and v_payment.stripe_payment_intent is distinct from p_payment_intent_id
        );
      update public.payments p
         set status = 'failed',
             stripe_payment_intent = coalesce(
               p.stripe_payment_intent, p_payment_intent_id
             )
       where p.id = v_payment.id
         and p.current_legacy_destination_checkout_operation_pk = v_operation.id;
    end if;
  end if;

  insert into public.legacy_destination_checkout_event_receipts (
    id, provider_event_id, event_type, event_object_id, account_id,
    payment_id, operation_pk, checkout_generation, checkout_session_id,
    payment_intent_id, livemode, outcome, checkout_session_status,
    checkout_payment_status, observed_at, classification, projection_allowed
  ) values (
    pg_catalog.gen_random_uuid(), p_provider_event_id, p_event_type,
    p_event_object_id, v_payment.account_id, v_payment.id, v_operation.id,
    v_operation.checkout_generation, p_checkout_session_id,
    p_payment_intent_id, p_livemode, p_outcome, p_checkout_session_status,
    p_checkout_payment_status, p_observed_at, v_classification,
    v_projection_allowed
  ) returning * into v_receipt;

  return query select
    'recorded'::text, v_classification, v_operation.id,
    v_operation.checkout_generation, v_is_current, v_projection_allowed,
    v_payment.legacy_destination_checkout_paid_hold_operation_pk is not null
      or v_classification = 'historical_paid_hold';
end;
$$;

revoke all on function public.claim_legacy_destination_checkout_operation(
  uuid, boolean, text, bigint, bigint, numeric
) from public, anon, authenticated, service_role;
grant execute on function public.claim_legacy_destination_checkout_operation(
  uuid, boolean, text, bigint, bigint, numeric
) to service_role;

revoke all on function public.begin_legacy_destination_checkout_submission(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.begin_legacy_destination_checkout_submission(uuid, uuid)
  to service_role;

revoke all on function public.complete_legacy_destination_checkout_operation(
  uuid, uuid, text, text, text, timestamptz
) from public, anon, authenticated, service_role;
grant execute on function public.complete_legacy_destination_checkout_operation(
  uuid, uuid, text, text, text, timestamptz
) to service_role;

revoke all on function public.confirm_legacy_destination_checkout_presentation(
  uuid, text
) from public, anon, authenticated, service_role;
grant execute on function public.confirm_legacy_destination_checkout_presentation(
  uuid, text
) to service_role;

revoke all on function public.mark_legacy_destination_checkout_indeterminate(
  uuid, uuid, text
) from public, anon, authenticated, service_role;
grant execute on function public.mark_legacy_destination_checkout_indeterminate(
  uuid, uuid, text
) to service_role;

revoke all on function public.quarantine_legacy_destination_checkout_operation(
  uuid, uuid, text, text, text, timestamptz, text
) from public, anon, authenticated, service_role;
grant execute on function public.quarantine_legacy_destination_checkout_operation(
  uuid, uuid, text, text, text, timestamptz, text
) to service_role;

revoke all on function public.classify_legacy_destination_checkout_event(
  text, text, text, uuid, text, text, boolean, text, text, text, timestamptz
) from public, anon, authenticated, service_role;
grant execute on function public.classify_legacy_destination_checkout_event(
  text, text, text, uuid, text, text, boolean, text, text, text, timestamptz
) to service_role;

comment on table public.legacy_destination_checkout_operations is
  'Private FORCE-RLS append-only legacy destination Checkout generation ledger; no table role has direct access.';
comment on table public.legacy_destination_checkout_event_receipts is
  'Private FORCE-RLS append-only exact signed-event classification receipts.';
comment on column public.payments.current_legacy_destination_checkout_operation_pk is
  'Exact serialized legacy destination Checkout generation pointer; RPC-managed only.';
comment on column public.payments.legacy_destination_checkout_paid_hold_operation_pk is
  'Immutable historical-paid generation hold. Any non-null value blocks provider mutation pending operator reconciliation.';
comment on function public.claim_legacy_destination_checkout_operation(
  uuid, boolean, text, bigint, bigint, numeric
) is 'Dark service-only short transaction. It performs no Stripe or network call and appends only after exact signed current expired-unpaid evidence.';
comment on function public.classify_legacy_destination_checkout_event(
  text, text, text, uuid, text, text, boolean, text, text, text, timestamptz
) is 'Records an exact signed event atomically with classification. Historical failure is a fixed no-op; historical paid installs an immutable hold before return.';

commit;
