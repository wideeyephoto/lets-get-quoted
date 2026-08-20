# Activating subscription billing — 2026-08-17

One-off payments are live and proven. Subscriptions are built, migrated, and have
never run: `billing_subscriptions`, `billing_subscription_customers`,
`billing_subscription_checkout_operations` and
`billing_subscription_consent_acceptances` are all **0 rows**, every account is
`plan=free` with a null `subscription_status`, and no account has a
`stripe_customer_id`.

This is what standing it up actually requires, read out of the code rather than
from the handoff.

## The thing most likely to be missed

**Subscriptions need a SECOND Stripe webhook endpoint.**
`src/lib/billing/stripe-billing-webhook.ts:15-19` is explicit:

> Activation requires both `LGQ_STRIPE_BILLING_WEBHOOK_ENABLED=1` and
> `STRIPE_BILLING_WEBHOOK_SECRET=whsec_...`. The secret must belong to
> `/api/stripe/billing/webhook`. **It must never reuse `STRIPE_WEBHOOK_SECRET`**,
> which belongs to the legacy Connect/payment endpoint.

Today there is exactly one endpoint on the platform account — `we_1TuE0B…`, the
Connect one with 11 events. The billing endpoint does not exist, and neither does
its secret. Until both exist, a completed subscription Checkout produces no
projection: the account pays and nothing changes in the product.

While the gate is off the route returns a bare `404` before reading the body,
initialising a client, or verifying a signature — so it is safe to create the
endpoint in Stripe *before* flipping anything.

## What the pipeline actually is

```
/api/stripe/billing/webhook          gate: LGQ_STRIPE_BILLING_WEBHOOK_ENABLED
  -> verify signature (STRIPE_BILLING_WEBHOOK_SECRET)
  -> rpc ingest_stripe_event_inbox(...)
  -> table billing_events            (0 rows today; the inbox is billing_events,
                                      there is no table called stripe_event_inbox)
  -> subscription projection worker  gate: LGQ_STRIPE_SUBSCRIPTION_PROJECTION_WORKER_ENABLED
       claims via projection_claim_token / projection_lease_expires_at
  -> billing_subscriptions, billing_subscription_customers, workspace_entitlements
```

The webhook only verifies and records. It never calls the projector and never
retrieves anything from Stripe, so acknowledgement is independent of downstream
processing — a projector failure cannot cause Stripe to retry.

## Order of activation

Enable back-to-front, so the pipeline behind a subscription is live before a
subscription can exist.

| # | step | why this order |
| --- | --- | --- |
| 0 | Redeploy Production | The 6 `STRIPE_PRICE_*` vars and `LGQ_STRIPE_BILLING_LIVEMODE` were added without a redeploy, so they are **not in the running runtime**. Nothing else works until they are. |
| 1 | Create the billing webhook endpoint in Stripe → `/api/stripe/billing/webhook`, capture its `whsec_` | Safe while the gate is off: the route 404s before touching the body. |
| 2 | Add `STRIPE_BILLING_WEBHOOK_SECRET` | Must be the new endpoint's secret. Never `STRIPE_WEBHOOK_SECRET`. |
| 3 | `LGQ_STRIPE_BILLING_WEBHOOK_ENABLED=1` | Events now land in `billing_events`. Nothing consumes them yet — harmless. |
| 4 | `LGQ_STRIPE_SUBSCRIPTION_PROJECTION_WORKER_ENABLED=1` | Drains the inbox. Nothing is in it yet. |
| 4a | `LGQ_PAID_PLAN_ALLOWANCE_RESET_WORKER_ENABLED=1` | **Required before selling annual.** A monthly plan re-grants credits from its next invoice; an annual plan has no next invoice for 365 days, so months 2–12 come from this worker alone. Without it an annual subscriber gets one month of credits per year and nothing fails. |
| 4b | `LGQ_PRICING_DASHBOARD_ENABLED=1` | **Required before step 5 does anything.** Not independent — see below. |
| 5 | `LGQ_BASE_PLAN_SUBSCRIPTION_CHECKOUT_ENABLED=1` | **Last.** This is the only one that lets a customer be charged. |

Steps 3–5 are each independently reversible by setting the var back to `0`.
Step 5 is the only one with a blast radius.

### Step 4b is not optional, and its absence is silent

`settings/page.tsx:87` only loads `planUsage` when `LGQ_PRICING_DASHBOARD_ENABLED`
is on; otherwise it is `null`. `showSubscriptionCheckout` (line 217) requires
`planUsage?.plan.kind === 'ready'`, and the whole Plan tab is only added when
`pricingDashboardEnabled && planUsage` (line 359).

So with step 5 on and step 4b off, there is **no buy button anywhere and no error
to explain it**. An operator would reasonably read that as a failed deploy. The
same flag gates the top-up purchase surface at line 227.

### Before any of this: the six live Prices are stamped with the wrong catalog

`stripe-billing-subscription-checkout.ts:227` compares each Price's
`lgq_catalog_version` metadata against `PRICING_CATALOG_VERSION`
character-for-character and throws when they differ. The live Prices were created
carrying `2026-08-15-preview`; raising Scale's allowances on 2026-08-18 moved the
code to `2026-08-18-preview`.

Until the Prices are recreated at the current version, **every plan checkout
fails closed** with "Plan checkout is not configured for this environment.
Nothing was charged." — deliberately uninformative, so it reads as a deploy
problem rather than a data one. No flag in this table changes that.

### And apply `20260820100000` before selling Scale

Both grant tables spelled Scale's monthly allowance as Growth's — half, on every
resource. The migration is written and verified; see
`docs/unapplied-migrations-runbook.md`.

## Exercise it in test mode first

`LGQ_STRIPE_BILLING_LIVEMODE` accepts **only `'1'` or `'0'`** — any other value
throws `Stripe Billing mode is not configured.`
(`base-plan-subscription-entrypoint.ts:123-127`). The mode is also cross-checked
against the secret key's prefix, so a `sk_test_` key with `LIVEMODE=1` fails as
`credential_mode_mismatch` rather than charging anyone.

So: do the whole rehearsal in **Preview**, with test keys and
`LGQ_STRIPE_BILLING_LIVEMODE=0`, using test Price IDs. Preview env vars were
repaired earlier today, so this works.

### What a good rehearsal proves

1. `/dashboard/settings#plan` offers a paid plan. This needs
   `LGQ_PRICING_DASHBOARD_ENABLED` as well as the checkout flag -- it is a
   prerequisite, not an independent surface. See step 4b.
2. Accepting consent writes one row to `billing_subscription_consent_acceptances`.
3. Checkout redirects to a URL on `https://checkout.stripe.com` — anything else is
   rejected by `requireStripeHostedCheckoutUrl`.
4. Paying with `4242…` returns to
   `/dashboard/settings?subscription_checkout=success#plan`.
5. `billing_events` gains the delivery; the worker projects it.
6. `billing_subscriptions` and `billing_subscription_customers` gain a row;
   `workspace_entitlements` moves off `flex/none/free`.
7. **Replay the same webhook from the Stripe dashboard.** It must be idempotent —
   `provider_event_id` is unique and `payload_sha256` is recorded.
8. Cancel the subscription and confirm the entitlement returns to free.

## Preconditions that are already true

- **All six accounts are eligible.** Eligibility is exactly
  `plan_code='flex' AND billing_interval='none' AND billing_status='free' AND
  entitlement_state='active'` on `workspace_entitlements`
  (`base-plan-subscription-entrypoint.ts:198-213`), and all six rows match.
- The 6 live Price IDs are created and bound, and `validatePrice` checks 16 fields
  including currency options, `tax_behavior` and the 4 metadata keys.
- Rate limit is 6 attempts per 10 minutes per account+user.
- Plans are `solo | growth | scale`; intervals are `monthly | annual`.

## Replay safety, which is the part worth reading twice

A checkout operation is keyed by `operation_id`
(`base-plan-subscription:<uuid>`), and a re-submission is compared field by field
against the stored row: `account_id`, `operation_id`, `purpose`, `plan_code`,
`billing_interval`, `catalog_version`, `livemode`, `terms_version`,
`recurring_consent_version` and `recurring_consent_text_sha256`. Any mismatch
returns `conflict` rather than starting a second checkout.

That means **bumping `TERMS_VERSION`, `PRICING_CATALOG_VERSION` or the consent
text invalidates in-flight checkouts**. Do not touch them during activation.

## Known gaps, deliberately not fixed here

- **The migration history is inconsistent.** 39 files carry a version prefix and
  there are 39 history rows, but 21 of the files are unrecorded and 21 of the rows
  match no file — those appear to be keyed by *application time* rather than by
  filename. Production is correct; a fresh-environment replay would try to
  re-apply 21 migrations. Worth fixing before anyone stands up a second
  environment, irrelevant until then.
- `LGQ_LEGACY_DESTINATION_CHECKOUT_PROJECTION_ENABLED` **must not be enabled in
  any order** — `classifyLegacyDestinationCheckoutSignedEvent` has no production
  caller, so it is a kill switch rather than a switch.
- The direct rail has never run: no payment on this platform has
  `charge_model = 'direct'`. That is a separate activation with its own gates
  (`LGQ_DIRECT_PAYMENT_SETTLEMENT_WORKER_ENABLED`,
  `LGQ_STRIPE_CONNECTED_PAYMENT_WEBHOOK_ENABLED`, …) and should not be mixed into
  this one.
- The code defines **16** `LGQ_*_ENABLED` gates. The Vercel UI was reported as
  showing 17. Resolve the discrepancy before trusting any "all gates off" count —
  a var with no code reference is dead, and a gate with no var is not off, it is
  undefined.
