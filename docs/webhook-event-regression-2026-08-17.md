# The live webhook is missing four events — 2026-08-17

`src/lib/billing/stripe-webhook-subscription.ts` exists to prevent exactly this,
and it did not prevent it.

## What was found

An authenticated read of `we_1TuE0BGqh5LFKuTCEyt5d4jh` (the live platform
endpoint, `https://letsgetquoted.com/api/stripe/webhook`, API version
`2026-06-24.dahlia`, status Active) reports **7 subscribed events**:

```
account.updated
charge.dispute.created
charge.failed
charge.refunded
checkout.session.completed
checkout.session.expired
payment_intent.payment_failed
```

That is **byte-for-byte** `LIVE_WEBHOOK_EVENTS_BEFORE_2026_08_17_FIX`
(`stripe-webhook-subscription.ts:60-68`) — the list the file records as the state
*before* it was corrected earlier the same day.

The four missing from `REQUIRED_LIVE_WEBHOOK_EVENTS`:

```
charge.dispute.closed
checkout.session.async_payment_failed
checkout.session.async_payment_succeeded
payment_intent.succeeded
```

## Why it matters, in the file's own words

> `checkout.session.async_payment_succeeded` and `payment_intent.succeeded` are
> the only two events that ever move an ACH payment to paid. ACH is offered on
> every one-off payment at or above the ACH threshold that is not a plan deposit,
> and /pay tells the customer they will be "confirmed once it settles". Without
> these, the bank debit clears at Stripe and the payment row stays `processing`
> forever.

ACH is on the **live, ungated** path: `us_bank_account` appears in
`legacy-destination-checkout-operation.ts:72`, typed at line 658, and that module
is the legacy destination rail serving `/pay` — the rail that going live on
2026-08-17 made real.

`checkout.session.async_payment_failed` is the bounce path, so a failed debit is
never marked failed and nobody is notified. `charge.dispute.closed` means disputes
open in the database and never close.

## Nobody is currently harmed

Verified read-only against production after the demo sweep: the platform holds
**4 payments total** — 2 `requested` (July, no Stripe session), 1 `failed`, 1
`refunded`. **Nothing is in `processing`**, so no ACH settlement is stranded right
now.

That is the traffic volume, not the safety of the system. The first real
contractor taking a bank payment strands it.

## The three possibilities

1. **The correction never happened.** The comment says the endpoint "was
   corrected in place the same day … and re-read to confirm all eleven". If that
   re-read did not occur, or occurred against a stale view, the claim is false and
   the file has been asserting a fix that was never applied.
2. **It happened and regressed.** Something reverted the endpoint after the fix.
3. **The new reading is wrong** — a stale dashboard view, or the UI showing a
   filtered subset.

Only a fresh read **through the Stripe API** settles it. The dashboard UI is not
sufficient evidence in either direction; the original diagnosis in the file was
explicitly made "when first read from the Stripe API".

## Why the guard did not fire

`stripe-webhook-subscription.ts:12-14` claims
`stripe-webhook-subscription.test.ts` "parses the route and fails if this list and
the route's dispatch table drift apart in either direction".

That guards **code against code**. It cannot observe the Stripe endpoint, so it
passes at full green while production is broken — which is what happened. 421 test
files and 7645 tests were green all day.

`missingLiveWebhookEvents(subscribed)` already exists in the same file and takes
the subscribed list as an argument. **Nothing calls it.** The diffing tool was
written; the thing that feeds it real data was not.

## What to do, in order

1. **Re-read the endpoint through the Stripe API**, not the dashboard. Record the
   full event list verbatim.
2. If four are genuinely missing, **add them in place** — do not create a new
   endpoint and do not roll the secret. Keep `id`, `url`, `api_version` and
   `status` unchanged so `STRIPE_WEBHOOK_SECRET` stays valid.
3. **Re-read again** and confirm all eleven.
4. Only then proceed to the separate billing endpoint
   (`docs/codex-billing-webhook-tasks-2026-08-17.md`).
5. Decide whether the "RESOLVED" comment needs rewriting, and whether the guard
   should become something that actually reads Stripe.

Do not change the `/pay` code. The route dispatches on all eleven already; the
defect is entirely on the Stripe side.
