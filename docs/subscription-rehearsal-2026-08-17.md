# Subscription rehearsal — Preview runbook

**Status:** not yet run. Nobody has ever bought a subscription on this platform.

This branch exists to carry a Preview deployment where one can be bought with a
test card, because Production deploys from `main` and a Preview needs a branch of
its own.

## Why a rehearsal is needed at all

Every piece of subscription infrastructure is in place and none of it has ever
executed. The route exists, the inbox exists, the projection workers run on live
crons every five minutes, and the live webhook endpoint carries exactly the right
eighteen events. All of it is inert because every gate is absent.

That combination is the hazard: infrastructure that looks finished, verified
component by component, that has never once run end to end. The 2026-08-17
morning was lost to exactly this shape — a component verified against itself
rather than against reality.

## What the rehearsal must prove

1. Checkout starts. This is not a formality: `loadVerifiedStripePlanPrices()`
   fails the entire load if any one of six price bindings is missing or violates
   the contract, and until today the test account contained zero Prices.
2. Stripe delivers to the billing route and the route accepts it.
3. A subscription and an invoice reach the expected states.
4. **A replayed event produces one row, not two.** This is the assertion the
   rehearsal exists for. Everything else can be inferred from configuration; this
   cannot.

## The two failures most likely to waste the afternoon

**Deployment Protection.** Vercel guards Preview deployments behind login, so
Stripe's POSTs receive an HTML login page. Stripe records delivery failures that
read exactly like application faults, and the natural response is to debug the
route — which is fine. Use Protection Bypass for Automation, appending the token
to the webhook URL, or disable protection for this Preview only.

**Variables are read at boot.** A Preview deployed before its variables were set
will not see them. Any change to the environment needs a fresh deployment, or
you are testing the previous configuration and drawing conclusions about the new
one.

## Preview configuration

Test-mode price IDs, created and contract-verified on 2026-08-17 by
`scripts/seed-stripe-plan-prices.mjs`. All six are required.

| Binding | Test price | Amount |
| --- | --- | --- |
| `STRIPE_PRICE_SOLO_MONTHLY` | `price_1U5cw2PqTgiW6iRMQl0e4HG9` | $39.00/month |
| `STRIPE_PRICE_SOLO_ANNUAL` | `price_1U5cw3PqTgiW6iRMvthHdSpd` | $420.00/year |
| `STRIPE_PRICE_GROWTH_MONTHLY` | `price_1U5cw3PqTgiW6iRMbPqXN820` | $129.00/month |
| `STRIPE_PRICE_GROWTH_ANNUAL` | `price_1U5cw4PqTgiW6iRMkTWARp89` | $1188.00/year |
| `STRIPE_PRICE_SCALE_MONTHLY` | `price_1U5cw5PqTgiW6iRMiMcqjoVb` | $329.00/month |
| `STRIPE_PRICE_SCALE_ANNUAL` | `price_1U5cw5PqTgiW6iRMecpFZGLD` | $3588.00/year |

Also required in Preview, which currently has no Stripe configuration at all:

- `STRIPE_SECRET_KEY` — test key
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` — test key
- `LGQ_STRIPE_BILLING_LIVEMODE=0` — exactly `0`; the code throws on anything that
  is not the character `0` or `1`, and it is neither a boolean nor `"false"`
- `STRIPE_BILLING_WEBHOOK_SECRET` — from the test-mode endpoint's create
  response, which is the only time Stripe returns it. It must differ from
  `STRIPE_WEBHOOK_SECRET`; if they match the route returns 503 before reading
  the body, which presents as a dead webhook rather than an error.

Three gates, **Preview scope only**:

- `LGQ_BASE_PLAN_SUBSCRIPTION_CHECKOUT_ENABLED=1`
- `LGQ_STRIPE_BILLING_WEBHOOK_ENABLED=1`
- `LGQ_STRIPE_SUBSCRIPTION_PROJECTION_WORKER_ENABLED=1`

`LGQ_LEGACY_DESTINATION_CHECKOUT_PROJECTION_ENABLED` is never enabled in any
scope. It has no production caller; it is a kill switch, not a feature switch.

Production must end the rehearsal with all sixteen gates still absent.

## Verifying afterwards

- `node scripts/verify-webhook-subscription.mjs` — diffs both endpoints against
  the event lists in source, in both directions for the billing endpoint. Exit 0
  subscribed, 1 wrong, 2 inconclusive because the key was not live.
- `node scripts/seed-stripe-plan-prices.mjs --dry-run` — reports whether every
  binding still satisfies the price contract without creating anything.
- The replay check is a database read: one `billing_events` row per Stripe event
  id, no matter how many times it is delivered.
