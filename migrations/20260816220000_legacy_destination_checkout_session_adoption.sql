-- DARK audited adoption record for pre-ledger legacy destination Checkout Sessions.
--
-- This migration creates no caller, route, feature flag, scheduler, provider
-- request, or network access, and it never mutates a payment. It only records
-- an explicit, provider-audited disposition for a destination Checkout Session
-- pointer that predates the serialized generation ledger.
--
-- Why this exists and why it is ordered BEFORE the generation foundation:
-- 20260816221500 opens with an unconditional preflight that refuses to install
-- while any destination payment carries a Session pointer. That preflight has no
-- exemption hook and lives in the same transaction as the ledger it guards, so a
-- later migration can never unblock it. This migration supplies the audited
-- evidence such an exemption would have to consult, and it is safe to apply on
-- its own because it is purely additive.
--
-- Deliberately NOT provided: any disposition that makes an old Session
-- recoverable. The pre-ledger runtime never persisted an operation identity,
-- request fingerprint, provider idempotency identity, presentation fact, or
-- authoritative Session lifecycle. Inventing any of those would make an unsafe
-- Session look collectible, so every disposition here is terminal for the new
-- ledger and recovery remains an explicit human operation.

begin;

create table public.legacy_destination_checkout_session_adoptions (
  id uuid primary key,
  account_id uuid not null,
  payment_id uuid not null,
  checkout_session_id text not null check (
    checkout_session_id ~ '^cs_(test|live)_[A-Za-z0-9_]+$'
    and pg_catalog.length(checkout_session_id) <= 255
  ),

  -- frozen_paid    : provider truth is paid; the payment must never generate again.
  -- frozen_unsafe  : open, contradictory, or multi-Session history; human only.
  -- inert_terminal : provider-expired, unpaid, terminal payment, no siblings.
  disposition text not null check (
    disposition in ('frozen_paid', 'frozen_unsafe', 'inert_terminal')
  ),

  provider_session_status text not null check (
    provider_session_status in ('open', 'complete', 'expired')
  ),
  provider_payment_status text not null check (
    provider_payment_status in ('unpaid', 'paid', 'no_payment_required')
  ),
  provider_amount_total_cents bigint not null check (provider_amount_total_cents > 0),
  provider_currency text not null check (provider_currency = 'usd'),
  provider_livemode boolean not null,
  provider_expires_at timestamptz not null check (
    provider_expires_at > '2000-01-01 00:00:00+00'::timestamptz
  ),
  provider_payment_intent_id text check (
    provider_payment_intent_id is null
    or provider_payment_intent_id ~ '^pi_[A-Za-z0-9_]+$'
  ),
  provider_charge_id text check (
    provider_charge_id is null or provider_charge_id ~ '^ch_[A-Za-z0-9_]+$'
  ),
  provider_application_fee_cents bigint check (
    provider_application_fee_cents is null
    or (
      provider_application_fee_cents >= 0
      and provider_application_fee_cents <= provider_amount_total_cents
    )
  ),
  provider_destination_account_id text not null check (
    provider_destination_account_id ~ '^acct_[A-Za-z0-9]{8,}$'
  ),
  -- Count of OTHER non-expired Sessions found for this payment during the audit.
  -- The pre-ledger runtime overwrote its Session pointer in place, so a nonzero
  -- count is a live multiple-disclosure exposure and forces frozen_unsafe.
  provider_sibling_open_session_count integer not null check (
    provider_sibling_open_session_count >= 0
  ),

  observed_payment_status text not null check (
    pg_catalog.length(pg_catalog.btrim(observed_payment_status)) between 1 and 40
  ),
  observed_gross_amount_cents bigint not null check (observed_gross_amount_cents > 0),

  auditor_user_id uuid,
  audit_reference text not null check (
    pg_catalog.length(pg_catalog.btrim(audit_reference)) between 1 and 200
    and audit_reference !~ '[[:cntrl:]]'
  ),
  evidence_digest text not null check (evidence_digest ~ '^[0-9a-f]{64}$'),
  audited_at timestamptz not null check (
    audited_at > '2000-01-01 00:00:00+00'::timestamptz
  ),
  created_at timestamptz not null default pg_catalog.now(),

  constraint legacy_destination_checkout_session_adoption_unique
    unique (payment_id, checkout_session_id),
  constraint legacy_destination_checkout_session_adoption_payment_fk
    foreign key (payment_id, account_id)
    references public.payments(id, account_id)
    on update restrict on delete restrict,
  constraint legacy_destination_checkout_session_adoption_paid_shape_check
    check (
      (provider_payment_status = 'paid') = (disposition = 'frozen_paid')
    ),
  constraint legacy_destination_checkout_session_adoption_inert_shape_check
    check (
      disposition <> 'inert_terminal'
      or (
        provider_session_status = 'expired'
        and provider_payment_status = 'unpaid'
        and provider_sibling_open_session_count = 0
      )
    ),
  constraint legacy_destination_checkout_session_adoption_sibling_shape_check
    check (
      provider_sibling_open_session_count = 0
      or disposition = 'frozen_unsafe'
    )
);

create index legacy_destination_checkout_session_adoption_payment_idx
  on public.legacy_destination_checkout_session_adoptions (payment_id);
create index legacy_destination_checkout_session_adoption_account_idx
  on public.legacy_destination_checkout_session_adoptions (account_id);
create index legacy_destination_checkout_session_adoption_disposition_idx
  on public.legacy_destination_checkout_session_adoptions (disposition);

alter table public.legacy_destination_checkout_session_adoptions
  enable row level security;
alter table public.legacy_destination_checkout_session_adoptions
  force row level security;
revoke all on table public.legacy_destination_checkout_session_adoptions
  from public, anon, authenticated, service_role;

create function public.protect_legacy_destination_checkout_session_adoption()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'legacy destination Checkout Session adoptions are append-only'
    using errcode = '55000';
end;
$$;

create trigger protect_legacy_destination_checkout_session_adoption_trigger
  before update or delete on public.legacy_destination_checkout_session_adoptions
  for each row
  execute function public.protect_legacy_destination_checkout_session_adoption();

-- Records one audited disposition. It performs no Stripe or network call: every
-- provider fact must already have been read out of band and passed in.
create function public.record_legacy_destination_checkout_session_adoption(
  p_payment_id uuid,
  p_checkout_session_id text,
  p_disposition text,
  p_provider_session_status text,
  p_provider_payment_status text,
  p_provider_amount_total_cents bigint,
  p_provider_currency text,
  p_provider_livemode boolean,
  p_provider_expires_at timestamptz,
  p_provider_payment_intent_id text,
  p_provider_charge_id text,
  p_provider_application_fee_cents bigint,
  p_provider_destination_account_id text,
  p_provider_sibling_open_session_count integer,
  p_auditor_user_id uuid,
  p_audit_reference text,
  p_evidence_digest text,
  p_audited_at timestamptz
)
returns table (
  adoption_status text,
  adoption_pk uuid,
  adoption_disposition text
)
language plpgsql
security definer
set search_path = ''
set timezone to 'UTC'
as $$
declare
  v_payment public.payments%rowtype;
  v_existing public.legacy_destination_checkout_session_adoptions%rowtype;
  v_connect_id text;
  v_observed_gross_cents bigint;
  v_adoption_pk uuid;
begin
  if p_payment_id is null
     or p_checkout_session_id is null
     or p_checkout_session_id !~ '^cs_(test|live)_[A-Za-z0-9_]+$'
     or pg_catalog.length(p_checkout_session_id) > 255
     or p_disposition is null
     or p_disposition not in ('frozen_paid', 'frozen_unsafe', 'inert_terminal')
     or p_provider_session_status is null
     or p_provider_session_status not in ('open', 'complete', 'expired')
     or p_provider_payment_status is null
     or p_provider_payment_status not in ('unpaid', 'paid', 'no_payment_required')
     or p_provider_amount_total_cents is null
     or p_provider_amount_total_cents <= 0
     or p_provider_currency is null
     or p_provider_currency <> 'usd'
     or p_provider_livemode is null
     or p_provider_expires_at is null
     or p_provider_expires_at <= '2000-01-01 00:00:00+00'::timestamptz
     or (
       p_provider_payment_intent_id is not null
       and p_provider_payment_intent_id !~ '^pi_[A-Za-z0-9_]+$'
     )
     or (p_provider_charge_id is not null and p_provider_charge_id !~ '^ch_[A-Za-z0-9_]+$')
     or (
       p_provider_application_fee_cents is not null
       and (
         p_provider_application_fee_cents < 0
         or p_provider_application_fee_cents > p_provider_amount_total_cents
       )
     )
     or p_provider_destination_account_id is null
     or p_provider_destination_account_id !~ '^acct_[A-Za-z0-9]{8,}$'
     or p_provider_sibling_open_session_count is null
     or p_provider_sibling_open_session_count < 0
     or p_audit_reference is null
     or pg_catalog.length(pg_catalog.btrim(p_audit_reference)) not between 1 and 200
     or p_audit_reference ~ '[[:cntrl:]]'
     or p_evidence_digest is null
     or p_evidence_digest !~ '^[0-9a-f]{64}$'
     or p_audited_at is null
     or p_audited_at <= '2000-01-01 00:00:00+00'::timestamptz
     or p_audited_at > pg_catalog.now() + interval '5 minutes' then
    raise exception 'legacy destination Checkout adoption evidence is invalid'
      using errcode = '22023';
  end if;

  if (p_provider_payment_status = 'paid') <> (p_disposition = 'frozen_paid') then
    raise exception 'legacy destination Checkout adoption paid disposition is contradictory'
      using errcode = '22000';
  end if;
  if p_provider_sibling_open_session_count > 0 and p_disposition <> 'frozen_unsafe' then
    raise exception 'legacy destination Checkout adoption with sibling Sessions must be unsafe'
      using errcode = '22000';
  end if;
  if p_disposition = 'inert_terminal'
     and not (
       p_provider_session_status = 'expired'
       and p_provider_payment_status = 'unpaid'
       and p_provider_sibling_open_session_count = 0
     ) then
    raise exception 'legacy destination Checkout adoption inert disposition is contradictory'
      using errcode = '22000';
  end if;

  select p.* into v_payment
    from public.payments p
   where p.id = p_payment_id
   for update;
  if not found then
    raise exception 'legacy destination Checkout adoption payment was not found'
      using errcode = 'P0002';
  end if;
  if v_payment.charge_model <> 'destination' then
    raise exception 'legacy destination Checkout adoption payment is not on the destination rail'
      using errcode = '55000';
  end if;
  -- The exact pointer must already be on the row. This RPC never guesses which
  -- Session belonged to a payment and never writes the pointer itself.
  if v_payment.stripe_checkout_session is distinct from p_checkout_session_id then
    raise exception 'legacy destination Checkout adoption does not match the recorded Session pointer'
      using errcode = '55000';
  end if;
  if (p_provider_livemode and p_checkout_session_id !~ '^cs_live_')
     or (not p_provider_livemode and p_checkout_session_id !~ '^cs_test_') then
    raise exception 'legacy destination Checkout adoption Session mode is contradictory'
      using errcode = '22000';
  end if;

  v_observed_gross_cents := pg_catalog.round(v_payment.amount * 100)::bigint;
  if v_observed_gross_cents <> p_provider_amount_total_cents then
    raise exception 'legacy destination Checkout adoption amount does not match payment truth'
      using errcode = '22000';
  end if;

  select a.stripe_connect_id into v_connect_id
    from public.accounts a
   where a.id = v_payment.account_id;
  if v_connect_id is distinct from p_provider_destination_account_id then
    raise exception 'legacy destination Checkout adoption destination account does not match the recipient'
      using errcode = '22000';
  end if;

  if p_disposition = 'frozen_paid' and v_payment.status::text <> 'paid' then
    raise exception 'legacy destination Checkout adoption paid truth conflicts with the payment'
      using errcode = '22000';
  end if;
  if p_disposition = 'inert_terminal'
     and v_payment.status::text not in ('failed', 'canceled') then
    raise exception 'legacy destination Checkout adoption inert truth conflicts with the payment'
      using errcode = '22000';
  end if;

  select a.* into v_existing
    from public.legacy_destination_checkout_session_adoptions a
   where a.payment_id = p_payment_id
     and a.checkout_session_id = p_checkout_session_id;
  if found then
    if v_existing.disposition is distinct from p_disposition
       or v_existing.provider_session_status is distinct from p_provider_session_status
       or v_existing.provider_payment_status is distinct from p_provider_payment_status
       or v_existing.provider_amount_total_cents is distinct from p_provider_amount_total_cents
       or v_existing.provider_currency is distinct from p_provider_currency
       or v_existing.provider_livemode is distinct from p_provider_livemode
       or v_existing.provider_expires_at is distinct from p_provider_expires_at
       or v_existing.provider_payment_intent_id is distinct from p_provider_payment_intent_id
       or v_existing.provider_charge_id is distinct from p_provider_charge_id
       or v_existing.provider_application_fee_cents is distinct from p_provider_application_fee_cents
       or v_existing.provider_destination_account_id is distinct from
         p_provider_destination_account_id
       or v_existing.provider_sibling_open_session_count is distinct from
         p_provider_sibling_open_session_count
       or v_existing.evidence_digest is distinct from p_evidence_digest then
      raise exception 'legacy destination Checkout adoption replay evidence changed'
        using errcode = '22000';
    end if;
    return query select 'replay'::text, v_existing.id, v_existing.disposition;
    return;
  end if;

  v_adoption_pk := pg_catalog.gen_random_uuid();
  insert into public.legacy_destination_checkout_session_adoptions (
    id, account_id, payment_id, checkout_session_id, disposition,
    provider_session_status, provider_payment_status, provider_amount_total_cents,
    provider_currency, provider_livemode, provider_expires_at,
    provider_payment_intent_id, provider_charge_id, provider_application_fee_cents,
    provider_destination_account_id, provider_sibling_open_session_count,
    observed_payment_status, observed_gross_amount_cents,
    auditor_user_id, audit_reference, evidence_digest, audited_at
  ) values (
    v_adoption_pk, v_payment.account_id, v_payment.id, p_checkout_session_id,
    p_disposition, p_provider_session_status, p_provider_payment_status,
    p_provider_amount_total_cents, p_provider_currency, p_provider_livemode,
    p_provider_expires_at, p_provider_payment_intent_id, p_provider_charge_id,
    p_provider_application_fee_cents, p_provider_destination_account_id,
    p_provider_sibling_open_session_count, v_payment.status::text,
    v_observed_gross_cents, p_auditor_user_id, pg_catalog.btrim(p_audit_reference),
    p_evidence_digest, p_audited_at
  );

  return query select 'recorded'::text, v_adoption_pk, p_disposition;
end;
$$;

-- Read-only outstanding-work counter. A future reviewed amendment to the
-- generation foundation's preflight may consult exactly this instead of failing
-- on the mere presence of a Session pointer. Nothing calls it today.
create function public.legacy_destination_checkout_unadopted_pointer_count()
returns bigint
language sql
stable
security definer
set search_path = ''
set timezone to 'UTC'
as $$
  select pg_catalog.count(*)::bigint
    from public.payments p
   where p.charge_model = 'destination'
     and p.stripe_checkout_session is not null
     and not exists (
       select 1
         from public.legacy_destination_checkout_session_adoptions a
        where a.payment_id = p.id
          and a.checkout_session_id = p.stripe_checkout_session
     );
$$;

revoke all on function public.record_legacy_destination_checkout_session_adoption(
  uuid, text, text, text, text, bigint, text, boolean, timestamptz, text, text,
  bigint, text, integer, uuid, text, text, timestamptz
) from public, anon, authenticated, service_role;
grant execute on function public.record_legacy_destination_checkout_session_adoption(
  uuid, text, text, text, text, bigint, text, boolean, timestamptz, text, text,
  bigint, text, integer, uuid, text, text, timestamptz
) to service_role;

revoke all on function public.legacy_destination_checkout_unadopted_pointer_count()
  from public, anon, authenticated, service_role;
grant execute on function public.legacy_destination_checkout_unadopted_pointer_count()
  to service_role;

commit;
