-- Step 2 of 2. Run in the Supabase SQL editor against LETSGETQUOTED-DB
-- (mfuvvtrkipkigwqqtcal) -- NOT staging-db.
--
-- Step 1 is migrations/20260816220000_legacy_destination_checkout_session_adoption.sql,
-- which must already be applied. This clears all four destination Checkout Session
-- pointers blocking 20260816221500's preflight, in the two ways they each require:
--
--   bf0df2cb   the one genuine live Session -- expired, unpaid, no PaymentIntent,
--              no siblings -- recorded terminally as inert_terminal, then cleared.
--   the other  three Sessions that 404 on acct_1TuCWJGqh5LFKuTC. They cannot go
--   three      through the adoption ledger: every provider field it takes is NOT
--              NULL, and a 404 is the absence of provider truth rather than a
--              value. They get the existing test_marker convention instead, which
--              is what excludes them from trailing-volume and fee-bracket maths.
--
-- Safe to re-run: the adoption call is filtered to a pointer that is still set, and
-- the UPDATE only touches rows whose test_marker is still null. A second run
-- reports zero rows both times.
--
-- Verified end to end against PostgreSQL 17 seeded to production's exact shape.

begin;

-- Refuse outright if this is not the expected database. Both projects report
-- current_database() as 'postgres', so identity is established from data.
do $$
declare
  v_found integer;
begin
  select count(*) into v_found
    from public.payments
   where charge_model = 'destination'
     and (id, amount) in (
       ('bf0df2cb-b402-4397-a38b-b9572d592f09'::uuid, 125.00),
       ('ba7a6159-fcf1-4259-8bd3-345b8106197a'::uuid, 2500.00),
       ('665d872a-3fc6-45bb-96cd-9dc9a742ee0b'::uuid, 2500.00),
       ('9e355543-4a8a-4772-b0fe-9ab1bb577553'::uuid, 100.00)
     );
  if v_found <> 4 then
    raise exception
      'wrong database: expected 4 known destination payments, found %. This is LETSGETQUOTED-DB only, not staging.', v_found
      using errcode = '55000';
  end if;
  if not exists (
    select 1 from public.payments
     where test_marker = 'backfill-test-markers:demo job or seeded client'
  ) then
    raise exception 'test_marker convention not present; refusing to invent one'
      using errcode = '55000';
  end if;
end $$;

-- 1. Record the one genuine live Session terminally, then clear its pointer.
with evidence as (
  select
    'bf0df2cb-b402-4397-a38b-b9572d592f09'::uuid                            as payment_id,
    'cs_live_a1RKiUykiIblzCfdeMq7pEnQ5netaDslAVO1DXBmaqdJpgJ6159loKM2mN'   as session_id,
    'expired'::text                                                        as session_status,
    'unpaid'::text                                                         as payment_status,
    12500::bigint                                                          as amount_total_cents,
    'usd'::text                                                            as currency,
    true                                                                   as livemode,
    to_timestamp(1784494702)                                               as expires_at,
    null::text                                                             as payment_intent_id,
    null::text                                                             as charge_id,
    null::bigint                                                           as application_fee_cents,
    'acct_1TuEg3GjJLVfg2pQ'::text                                          as destination_account_id,
    0                                                                      as sibling_open_session_count
),
digest as (
  select e.*,
    encode(sha256(convert_to(
      'lgq:legacy-destination-adoption:v1'
      || '|payment=' || e.payment_id::text
      || '|session=' || e.session_id
      || '|session_status=' || e.session_status
      || '|payment_status=' || e.payment_status
      || '|amount_total_cents=' || e.amount_total_cents::text
      || '|currency=' || e.currency
      || '|livemode=' || e.livemode::text
      || '|expires_at=' || extract(epoch from e.expires_at)::bigint::text
      || '|payment_intent=' || coalesce(e.payment_intent_id, '')
      || '|charge=' || coalesce(e.charge_id, '')
      || '|application_fee_cents=' || coalesce(e.application_fee_cents::text, '')
      || '|destination=' || e.destination_account_id
      || '|siblings=' || e.sibling_open_session_count::text
    , 'UTF8')), 'hex') as evidence_digest
  from evidence e
),
-- Empty once the pointer is cleared, so the function is never invoked on a
-- re-run rather than raising "does not match the recorded Session pointer".
pending as (
  select d.*
    from digest d
    join public.payments p
      on p.id = d.payment_id
     and p.stripe_checkout_session = d.session_id
)
select r.adoption_status, r.adoption_pk, r.adoption_disposition
  from pending d
 cross join lateral public.record_legacy_destination_checkout_session_adoption(
   d.payment_id, d.session_id, 'inert_terminal', d.session_status, d.payment_status,
   d.amount_total_cents, d.currency, d.livemode, d.expires_at, d.payment_intent_id,
   d.charge_id, d.application_fee_cents, d.destination_account_id,
   d.sibling_open_session_count, null,
   '2026-08-17 read-only audit of destination Checkout pointers on acct_1TuCWJGqh5LFKuTC',
   d.evidence_digest, pg_catalog.now()
 ) r;

update public.payments p
   set stripe_checkout_session = null
 where p.id = 'bf0df2cb-b402-4397-a38b-b9572d592f09'::uuid
   and p.stripe_checkout_session
       = 'cs_live_a1RKiUykiIblzCfdeMq7pEnQ5netaDslAVO1DXBmaqdJpgJ6159loKM2mN'
   and exists (
     select 1 from public.legacy_destination_checkout_session_adoptions a
      where a.payment_id = p.id
        and a.checkout_session_id
            = 'cs_live_a1RKiUykiIblzCfdeMq7pEnQ5netaDslAVO1DXBmaqdJpgJ6159loKM2mN'
   );

-- 2. Mark the three unresolvable test pointers with the existing convention.
update public.payments
   set test_marker = 'backfill-test-markers:demo job or seeded client',
       stripe_checkout_session = null
 where id in ('ba7a6159-fcf1-4259-8bd3-345b8106197a'::uuid,
              '665d872a-3fc6-45bb-96cd-9dc9a742ee0b'::uuid,
              '9e355543-4a8a-4772-b0fe-9ab1bb577553'::uuid)
   and charge_model = 'destination'
   and test_marker is null;

-- 3. Verify. Must be 0, or the foundation preflight will still refuse.
select public.legacy_destination_checkout_unadopted_pointer_count() as remaining_pointers;

select disposition, observed_payment_status,
       observed_gross_amount_cents, provider_amount_total_cents
  from public.legacy_destination_checkout_session_adoptions;

commit;
