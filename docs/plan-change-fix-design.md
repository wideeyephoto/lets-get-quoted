# Plan change — remaining build

**Date:** 2026-08-23<br>
**Status:** SQL half applied (`ea92ed3d`, migration `20260823120000`) and inert. TypeScript half not started.<br>
**Panel:** WITHHELD 2026-08-23 (`PLAN_CHANGE_PANEL_WITHHELD`), so it can no longer charge a card for a change it cannot record.<br>
**Until this lands:** upgrades are handled by hand.

---

## What is already done

Migration `20260823120000_plan_change_projection_binding.sql`, applied to production
and verified 13/13 on a real PostgreSQL 17:

- `billing_subscription_checkout_operations.purpose` now admits `base_plan_plan_change`.
- The idempotency-key CHECK now admits `lgq:billing:v1:subscription.plan_change:<64 hex>`.
- The binding permits a price transition, and the projector permits a
  paid-to-paid entitlement transition — **only** when the driving operation
  carries that purpose for that workspace.

It changes nothing today, because nothing writes an operation row with that
purpose. That is the piece below.

---

## Why the audit's one-line fix was not enough

Three refusals, not one. All confirmed against live function bodies:

1. Binding: the operation's `stripe_price_id` must equal the event's price. A
   plan change wrote no operation row, so the only candidate was the original
   checkout, still holding the old price.
2. Binding: `billing_subscriptions.provider_price_id` holds the **old** price
   while the event carries the new one → `23505`. `plan-change.ts` deliberately
   does not write that row ("the projector owns it") and the projector refuses
   before it can. **A deadlock**, which is why a function patch was unavoidable.
3. Projector: `v_entitlement.plan_code not in ('flex', v_plan_code)` → `22000`.

---

## The remaining build

### 0. Two more refusals, found 2026-08-23 while starting step 1

The consent capture is not "mirror the checkout". BOTH functions that could
record an acceptance refuse a plan change outright:

- `record_base_plan_recurring_consent` raises
  *"first-subscription consent requires an active Flex workspace"* unless the
  entitlement is flex/none/free/active, and hardcodes
  `purpose = 'base_plan_subscription'`.
- `claim_stripe_billing_subscription_checkout` carries the same two gates.
- `billing_subscription_consent_acceptances_purpose_check` pins the purpose to
  `base_plan_subscription` as well.

A plan change happens on a PAID workspace, so it fails the Flex gate by
definition. That is two more function patches and a third CHECK widening, on top
of the two already applied — six SQL surfaces for one feature.

**The panel was withheld on 2026-08-23 rather than half-built.** See
`PLAN_CHANGE_PANEL_WITHHELD` in `src/app/dashboard/settings/page.tsx`. Turning
it back on is deleting that constant, and the end-to-end test below is what
should gate it.

---

### 1. Capture fresh recurring consent

`recurring_consent_acceptance_id` on the operations table is **NOT NULL and
UNIQUE** — consent is single-use by construction. A plan change cannot reuse the
acceptance captured at first purchase, and should not: the customer is agreeing
to a *different* recurring amount.

Mirror `BasePlanSubscriptionCheckout.tsx:173-179` — the same pinned text, the same
`BASE_PLAN_RECURRING_CONSENT_TEXT_SHA256`. The CHECKs enforce both values, so a
drifted string fails loudly rather than storing a weaker record.

Both paths need it. `scheduleAtRenewal` charges nothing today but still changes
the recurring amount, and its renewal event meets the same binding.

### 2. Write the operation row BEFORE calling Stripe

**This is the ordering subtlety, and it is the part to get right.**

The webhook can arrive before `stripe.subscriptions.update()` returns. If the row
is written after, the projector can meet the event with no operation to bind and
dead-letter it — reintroducing the bug from the other side.

So: write the operation row first, in a state the binding accepts, then call
Stripe. If Stripe then fails, the row is orphaned and harmless — nothing
references it, and its idempotency key means a retry finds the same row rather
than writing a second.

The row must satisfy, all verified against the live binding:

| Field | Value |
|---|---|
| `state` | `activated` — and the state-shape CHECK then requires `claim_token` NULL, `lease_expires_at` NULL, `resolved_at` NOT NULL, `request_fingerprint` NOT NULL, `attempt_count` 1 |
| `checkout_expires_at` | **NOT NULL** — the binding refuses a null outright |
| `stripe_price_id` | the **new** price |
| `livemode` | must equal the event's |
| `provider_customer_id` | the subscription's customer, or NULL |
| `purpose` | `base_plan_plan_change` |
| `stripe_idempotency_key` | the existing `buildPlanChangeIdempotencyKey` output |

`unit_amount_cents` must match plan+interval exactly or
`billing_subscription_checkout_catalog_binding_check` refuses.

### 3. Put the new operation id in the subscription metadata

`planChangeMetadata()` currently sends only plan, interval and catalog version —
it deliberately does not touch `lgq_operation_id`, so the subscription keeps
pointing at the original checkout. It must now carry the new one, or the binding
looks up the wrong row.

### 4. Fix the vacuous guard while in here

`assertMetadataMatchesPrice` compares three values against themselves:
`stripe-plan-prices.ts:302-304` builds `planCode`/`billingInterval` from the
definition found by that same key, and `catalogVersion` from the same constant
`planChangeMetadata` uses. The throw is unreachable, and the file's header rests
its whole safety argument on it. The real contract check is upstream at
`metadataMatches(price.metadata, metadata)` → `price_contract_mismatch`, so this
is a dead guard rather than an open hole — but it should either compare something
that can differ or be deleted.

---

## Testing this properly

The PG17 harness added here (`npm run test:pg17:plan-change`) covers the **text
edit only** and says so. It does not prove a plan change projects end to end —
that needs the full billing schema, a synthetic `customer.subscription.updated`,
and an assertion that entitlements land on the new plan.

That end-to-end test is what should gate turning the panel back on.

---

## Sequencing

1. Consent capture + acceptance row.
2. Operation row written before the Stripe call.
3. Metadata carries the new operation id.
4. End-to-end PG17 projection test.
5. Only then is the panel trustworthy.

Until 1–4 are done, the safest state is a gated panel and upgrades handled by
hand. There are no real customers yet, so that costs nothing.
