-- Reviewed one-time production operation: record the single genuine live
-- destination Checkout Session pointer terminally, then clear it.
--
-- Covers ONLY payment bf0df2cb-b402-4397-a38b-b9572d592f09. The other three
-- destination pointers cannot be recorded here -- see the note at the bottom.
--
-- Prerequisite: migration 20260816220000_legacy_destination_checkout_session_
-- adoption.sql must already be applied to this database. Nothing else is
-- required, and the foundation migration 20260816221500 must NOT be applied yet.
--
-- Run as the service role. Everything is inside one transaction: if the RPC
-- refuses the evidence, the pointer is not cleared either.

begin;

-- Evidence exactly as read from Stripe on 2026-08-17 against acct_1TuCWJGqh5LFKuTC
-- in live mode. expires_at is passed as the raw epoch Stripe returned rather than
-- a transcribed timestamp, so no timezone or formatting error can creep in.
--
-- The digest is computed from a canonical, ordered rendering of those same facts,
-- so a second call inside the same pointer state reproduces it byte-for-byte and
-- the RPC answers 'replay' rather than writing again.
--
-- Re-running the whole script after it has succeeded is a different case, and the
-- pending CTE below is what makes it safe. Once the pointer is cleared the RPC
-- would refuse the call outright -- its check that the payment still carries the
-- exact Session fires before the replay path -- so calling it unconditionally
-- turns a completed run into a hard error on re-run. Verified against PG17: the
-- unguarded form raises 'does not match the recorded Session pointer'. Selecting
-- zero rows means the function is never invoked at all.
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
-- Empty once the pointer has been cleared, which makes the lateral below a no-op
-- instead of an error. This is the idempotency guard; see the note above.
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
   d.payment_id,
   d.session_id,
   'inert_terminal',
   d.session_status,
   d.payment_status,
   d.amount_total_cents,
   d.currency,
   d.livemode,
   d.expires_at,
   d.payment_intent_id,
   d.charge_id,
   d.application_fee_cents,
   d.destination_account_id,
   d.sibling_open_session_count,
   null,
   '2026-08-17 read-only audit of destination Checkout pointers on acct_1TuCWJGqh5LFKuTC',
   d.evidence_digest,
   pg_catalog.now()
 ) r;

-- Clear the pointer only once the adoption row exists. The guard on
-- stripe_checkout_session makes a re-run a no-op rather than a second write, and
-- the exists() means the pointer can never be cleared without its audit record.
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

-- Expect 3 before this script and 3 after: this clears one of the four, and the
-- three test-mode pointers are deliberately untouched.
select public.legacy_destination_checkout_unadopted_pointer_count() as remaining_pointers;

commit;

-- WHY THE OTHER THREE ARE NOT HERE
--
-- ba7a6159 (processing, $2500), 665d872a (paid, $2500) and 9e355543 (paid, $100)
-- all carry cs_test_ pointers that return 404 on acct_1TuCWJGqh5LFKuTC in test
-- mode, as do the two PaymentIntents on the paid pair.
--
-- Their origin account is NOT established. An earlier guess that they came from
-- the sandbox acct_1TtDcKPqCWgR3Ww0 was inferred from Stripe id substrings and
-- does not hold: a create against that sandbox rejects their recorded
-- destination acct_1TtEtEPqTgY5Sbcb as "No such destination", so that connected
-- account does not exist there either. All that is established is that these
-- Sessions cannot be resolved or settled on the production platform.
--
-- This RPC cannot record them, by design. Every provider fact it takes is NOT
-- NULL and range-checked: session status, payment status, amount, currency,
-- livemode and expiry. A 404 is the absence of provider truth, not a value, and
-- the ledger exists to record audited evidence rather than to launder an absence
-- into some. Supplying invented values to satisfy the signature would put a
-- fabricated observation into an append-only audit table.
--
-- Two of them are additionally unrepresentable: 665d872a and 9e355543 are 'paid',
-- and inert_terminal requires the payment to be 'failed' or 'canceled', while
-- frozen_paid asserts the provider reported paid -- which is exactly what cannot
-- be observed. They are not adoption cases at all; they are account-migration
-- pollution, and they need their own reviewed decision.
