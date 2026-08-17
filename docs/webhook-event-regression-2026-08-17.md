# The webhook endpoint is correct. The false alarm is the finding. — 2026-08-17

**Resolved: there is no regression.** The Stripe API, read twice independently,
reports `we_1TuE0BGqh5LFKuTCEyt5d4jh` carrying all **11** required events. The
earlier version of this document claimed four were missing and that ACH payments
would strand. That claim was wrong, and this file is rewritten rather than
deleted because how it went wrong is worth keeping.

## What the API actually says

```
id:          we_1TuE0BGqh5LFKuTCEyt5d4jh
url:         https://letsgetquoted.com/api/stripe/webhook
api_version: 2026-06-24.dahlia
status:      enabled
livemode:    true
enabled_events (11):
  checkout.session.completed          charge.dispute.created
  checkout.session.expired            charge.dispute.closed
  charge.failed                       checkout.session.async_payment_failed
  charge.refunded                     checkout.session.async_payment_succeeded
  payment_intent.payment_failed       payment_intent.succeeded
  account.updated
```

That is `REQUIRED_LIVE_WEBHOOK_EVENTS` exactly. The `RESOLVED 2026-08-17` comment
in `src/lib/billing/stripe-webhook-subscription.ts` is accurate.

## How the alarm happened

A **dashboard UI** read reported 7 events — byte-for-byte the documented pre-fix
list, which is what made it so convincing. It was wrong. The API read that
followed showed 11.

The endpoint object's `updated` timestamp is `2026-08-17T13:25:46Z`, and Stripe
exposes no field-level diff, so the object did change today (consistent with the
fix being applied that morning) but nothing proves *what* changed. The request
history shows retrieves at 09:17 and 09:26 EDT and no mutation call — which is
consistent with the correction having been made through the dashboard rather than
the API.

**The lesson is not "check twice". It is that this repository has no way to know.**

## The real gap, which the false alarm demonstrates better than a real one would

`missingLiveWebhookEvents(subscribed)` exists in
`stripe-webhook-subscription.ts:71`. It takes the subscribed list as an argument
and returns what is missing. **Nothing calls it.**

`test/stripe-webhook-subscription.test.ts` passes, all six cases — and one of
those cases is `missingLiveWebhookEvents(LIVE_WEBHOOK_EVENTS_BEFORE_2026_08_17_FIX)`
asserting it returns the four. The suite exercises the comparison against a
*hardcoded fixture*. It compares the required list to the route's dispatch table:
**code against code**. It cannot observe Stripe, so it is green whether the
endpoint is right or wrong.

So the state of the live endpoint is knowable only by a human opening a browser,
and today a human opening a browser got the wrong answer. Half a day of work went
into a defect that did not exist, and the same tooling would have been equally
silent had it existed.

What would close it: a script that reads the endpoint through the Stripe API and
feeds `missingLiveWebhookEvents()`, run on demand and after any deploy that
touches the webhook route. It is perhaps thirty lines, it has a function waiting
for it, and it is the difference between "we believe the endpoint is right" and
"we checked".

## What the audit found while the alarm was still live

Verified against the code and against production, and it stands independently of
the webhook question.

### ACH is offered automatically above $1,000, with no flag and no opt-in

`src/lib/payments.ts:492`:

```js
const offerAch = payment.amount >= ACH_MIN_AMOUNT && !isPlanDeposit;
```

`ACH_MIN_AMOUNT = 1000` (`src/lib/pricing.ts:82`), in **dollars** —
`payments.amount` is numeric dollars, converted by `toCents()` at `payments.ts:511`.
There is no feature flag anywhere in the `/pay` checkout path, no operator
setting, and no capability read. `/pay` mirrors the predicate at
`src/app/pay/[id]/page.tsx:120` and renders the ACH copy at `:218-223`.

The marketing site states it publicly —
`src/app/features/payments/page.tsx:60, 94, 157`: *"Bank debit is offered
automatically on payments of $1,000 or more."*

Three of six accounts satisfy `canCreateConnectCharge` (connect id present,
onboarded, not payouts-restricted); none is restricted. Every payment the platform
creates is `charge_model = 'destination'`, which is the rail that offers ACH — so
that gate is currently a no-op.

**No production payment has ever reached $1,000** (the largest ever is $125), so
ACH has never actually been presented on a real payment. It is reachable, not yet
reached.

### Capability enforcement is reactive, not checked

There is no capability *read*, but there is a fallback: `payments.ts:534-542`
catches a session-create error matching `/us_bank_account/i` and retries
card-only. Enforcement is delegated to Stripe at session-create time.

`accounts.merchant_us_bank_account_payments_active` exists and is written by
`stripe-merchant.ts:569`, but it is read only by the Accounts v2 onboarding rail,
never by checkout — and all six accounts are `merchant_onboarding_state =
'not_started'` with the flag false, so that rail is inert.

### One code comment is wrong

`payments.ts:535` says the ACH capability belongs to "this account", meaning the
connected account. These are **destination** charges (`transfer_data` at `:519`),
so the charge is created on the **platform** account and it is the platform's
`us_bank_account` capability that governs. Worth correcting; it would mislead
anyone debugging an ACH rejection.

## Standing conclusion

Nothing is broken. Nothing needs fixing on the Stripe side. The billing-webhook
work (`docs/codex-billing-webhook-tasks-2026-08-17.md`) can resume from Task 2.

The one thing worth building is the check that would have answered this in
seconds instead of half a day.
