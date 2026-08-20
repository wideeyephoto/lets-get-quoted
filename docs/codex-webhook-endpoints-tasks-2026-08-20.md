# Codex browser tasks — the three unbuilt webhook endpoints, 2026-08-20

For the agent with authenticated Stripe and Vercel sessions.

Platform Stripe account: `acct_1TuCWJGqh5LFKuTC` (production).
Do not touch the sandbox account `acct_1TtDcKPqCWgR3Ww0`.

**Enable nothing.** Every `LGQ_*_ENABLED` stays exactly as it is. This brief creates
infrastructure and reports state so a later, separate decision can turn things on.

**Not in scope, deliberately:** the six `STRIPE_PRICE_*` bindings (rebound 2026-08-18,
verified, done — do not re-examine them), and the nine unapplied migrations (being
applied from the repo side, not here).

## Why this brief exists

The codebase now declares **four** Stripe webhook endpoints. One exists. I cannot
tell you the status of the other three, because the read-only restricted key on this
side lacks `webhook_read` — every attempt returns:

> Permission denied. The provided key does not have the required permissions for this
> endpoint on account `acct_1TuCWJGqh5LFKuTC`.

So Task 1 is an inventory, and Tasks 3–4 are conditional on what it finds. Do not
create anything before Task 1 is reported.

The four, as declared in `src/lib/billing/stripe-webhook-subscription.ts`:

| Path | Account scope | Flag | Secret var |
|---|---|---|---|
| `/api/stripe/webhook` | platform | none (predates the convention) | `STRIPE_WEBHOOK_SECRET` |
| `/api/stripe/billing/webhook` | platform | `LGQ_STRIPE_BILLING_WEBHOOK_ENABLED` | `STRIPE_BILLING_WEBHOOK_SECRET` |
| `/api/stripe/top-ups/webhook` | platform | `LGQ_STRIPE_TOP_UP_WEBHOOK_ENABLED` | `STRIPE_TOP_UP_WEBHOOK_SECRET` |
| `/api/stripe/connected-payments/webhook` | **connect** | `LGQ_STRIPE_CONNECTED_PAYMENT_WEBHOOK_ENABLED` | `STRIPE_CONNECTED_PAYMENT_WEBHOOK_SECRET` |

Each endpoint gets **its own** signing secret. A shared secret means an event meant for
one scope verifies against another, and scope is what decides whether a
`checkout.session.completed` paid a contractor or bought credits.

---

## Task 1 — Inventory every webhook endpoint (read only)

List **all** webhook endpoints on `acct_1TuCWJGqh5LFKuTC`, live mode, including both
account-scoped and Connect-scoped ones.

For each, report **verbatim, not summarised**:

- endpoint id
- url
- status (`enabled` / `disabled`)
- api_version
- whether it is Connect-scoped (listening to connected accounts) or account-scoped
- the **full list of enabled events**, one per line — not a count

A count is not enough. The legacy endpoint went live subscribed to seven of the eleven
events its route dispatches on, and a summarised count is exactly what hid it. The four
it omitted were the only events that could ever settle an ACH payment or close a dispute.

---

## Task 2 — Grant `webhook_read` on the read-only restricted key

Restricted key `mk_1U5nOCGqh5LFKuTCMk3VaoEW` (the `rk_live_…` used for verification
from the repo side). Add the **"Webhook Endpoints, Event Destinations Read"**
(`webhook_read`) permission.

- **Read** permission only. Do not grant write.
- Do not roll or regenerate the key. Its value must not change.
- Add no other permission.

This exists so nobody has to run a browser task to answer "what is this endpoint
subscribed to" again.

---

## Task 3 — Create the two platform endpoints, if Task 1 shows them absent

Both are safe to create now: production holds **zero subscriptions and zero top-up
Sessions**, so neither endpoint can receive an event until something is enabled.

If Task 1 shows either already exists, **stop on that one and report it** rather than
creating a duplicate or editing the existing one.

### 3a — `/api/stripe/billing/webhook`

- URL: `https://letsgetquoted.com/api/stripe/billing/webhook`
- Mode: live
- Scope: events on the **platform account** — *not* Connect / connected accounts
- API version: match `2026-06-24.dahlia` if the dashboard offers a choice

Exactly these **18** events, and nothing else:

```
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted
customer.subscription.paused
customer.subscription.resumed
customer.subscription.pending_update_applied
customer.subscription.pending_update_expired
customer.subscription.trial_will_end
invoice.created
invoice.updated
invoice.finalized
invoice.finalization_failed
invoice.paid
invoice.payment_succeeded
invoice.payment_failed
invoice.payment_action_required
invoice.marked_uncollectible
invoice.voided
```

Then reveal its signing secret and set it in Vercel **Production**:

```
STRIPE_BILLING_WEBHOOK_SECRET = whsec_...
```

It must never be the value of `STRIPE_WEBHOOK_SECRET`, which belongs to the legacy
endpoint. Confirm presence and scope **without printing the value**.

### 3b — `/api/stripe/top-ups/webhook`

- URL: `https://letsgetquoted.com/api/stripe/top-ups/webhook`
- Mode: live
- Scope: events on the **platform account**
- API version: as above

Exactly these **4** events, and nothing else:

```
checkout.session.completed
checkout.session.async_payment_succeeded
checkout.session.async_payment_failed
checkout.session.expired
```

Then reveal its signing secret and set it in Vercel **Production**:

```
STRIPE_TOP_UP_WEBHOOK_SECRET = whsec_...
```

Distinct from both other secrets. These four event types are identical to four on the
connected endpoint — the scope is declared by the route, never inferred from the type,
which is exactly why the secrets cannot be shared.

---

## Task 4 — The connected endpoint: report, do not create

**Do not create `/api/stripe/connected-payments/webhook` in this brief.**

Reason, so the instruction is auditable rather than arbitrary: all three new routes
return **404** while their flag is off. For 3a and 3b that is harmless — nothing can
generate those events yet. The connected endpoint is different: the destination-charge
rail is **live**, so a Connect-scoped endpoint could begin receiving real events
immediately and 404 every one of them. Stripe retries, then disables the endpoint and
emails about it. That turns a setup step into an incident.

What I need from you instead:

1. From Task 1, state whether any existing endpoint is already **Connect-scoped**, and
   if so which events it takes. The legacy endpoint's list includes `account.updated`,
   which is a Connect event, so it may already be Connect-enabled — that changes the
   plan and I cannot see it from here.
2. Confirm whether the dashboard allows creating a Connect endpoint in a **disabled**
   state. If it does, that resolves the hazard and the endpoint can be created in the
   next brief with its flag flipped in the same window.

---

## Task 5 — Refresh the `LGQ_*` inventory

The last audit expected 16 names. The codebase now defines **41**, of which **36** are
gates. List **every** `LGQ_*` variable in Vercel — all environments — with:

- exact name
- which environments it is bound to
- whether its value is `0`, `1`, or something else

Change none of them. The 36 gates the code now reads:

```
LGQ_AI_INTAKE_USAGE_GATE_ENABLED
LGQ_AI_VOICE_ENABLED
LGQ_AI_WRITING_GATE_ENABLED
LGQ_AI_WRITING_METER_ENABLED
LGQ_BASE_PLAN_SUBSCRIPTION_CHECKOUT_ENABLED
LGQ_CREW_SEAT_ENTITLEMENT_GATE_ENABLED
LGQ_DIRECT_PAYMENT_SETTLEMENT_WORKER_ENABLED
LGQ_LEGACY_DESTINATION_CHECKOUT_GENERATION_ENABLED
LGQ_LEGACY_DESTINATION_CHECKOUT_PROJECTION_ENABLED
LGQ_LEGACY_PAYMENT_PLAN_PROJECTION_ENABLED
LGQ_LEGACY_QUICK_STOP_LATE_REFUND_WORKER_ENABLED
LGQ_LEGACY_QUICK_STOP_RECONCILIATION_ENABLED
LGQ_MARKETING_EMAIL_GATE_ENABLED
LGQ_MARKETING_EMAIL_METER_ENABLED
LGQ_OFFICE_SEAT_ENTITLEMENT_GATE_ENABLED
LGQ_PAID_PLAN_ALLOWANCE_RESET_WORKER_ENABLED
LGQ_PRICING_DASHBOARD_ENABLED
LGQ_PURCHASED_CAPACITY_LIFECYCLE_ENABLED
LGQ_REFUND_RECONCILIATION_ENABLED
LGQ_STORAGE_CAP_ENFORCED
LGQ_STRIPE_BILLING_WEBHOOK_ENABLED
LGQ_STRIPE_CONNECTED_PAYMENT_PROJECTION_WORKER_ENABLED
LGQ_STRIPE_CONNECTED_PAYMENT_WEBHOOK_ENABLED
LGQ_STRIPE_MERCHANT_ONBOARDING_V2_ENABLED
LGQ_STRIPE_SUBSCRIPTION_PROJECTION_WORKER_ENABLED
LGQ_STRIPE_TOP_UP_PROJECTION_WORKER_ENABLED
LGQ_STRIPE_TOP_UP_WEBHOOK_ENABLED
LGQ_TEXT_CREDIT_GATE_ENABLED
LGQ_TEXT_CREDIT_METER_ENABLED
LGQ_TOP_UP_PURCHASE_ENABLED
LGQ_USAGE_OVERAGE_ENABLED
LGQ_USAGE_RESERVATION_EXPIRY_ENABLED
LGQ_VOICE_ALLOWANCE_WORKER_ENABLED
LGQ_VOICE_MINUTE_GATE_ENABLED
LGQ_VOICE_MINUTE_METER_ENABLED
LGQ_WORKSPACE_STORAGE_USAGE_SWEEP_ENABLED
```

Plus five non-gates: `LGQ_DISABLE_OUTBOUND_SMS`, `LGQ_LEAD_VERIFICATION_SECRET`,
`LGQ_SMS_PROVIDER`, `LGQ_STRIPE_BILLING_LIVEMODE`, `LGQ_VOICE_RECEIPT_BASIC`.

A name in Vercel not on this list is a dead variable. A name on this list with no
variable in Vercel is not "off" — it is undefined. Both behave identically today and
differently the moment code reads a value instead of comparing it to `'1'`. Say which
is which.

---

## Task 6 — Report the current Production deployment

Deployment id, the commit it built, its status, and whether any variable set in Task 3
is bound to it. A variable added without a redeploy is not in the running runtime — that
has already happened once with the six `STRIPE_PRICE_*` vars.

Do not redeploy in this brief. Just report.

---

## Standing constraints

- **Enable nothing.** No gate goes to `1`.
- Do not modify the existing endpoint `we_1TuE0B…` or its events.
- Do not roll, regenerate or replace any existing secret or API key.
- Do not touch the sandbox account `acct_1TtDcKPqCWgR3Ww0`.
- Do not touch the `STRIPE_PRICE_*` variables or any Price object.
- Never print a secret value. Confirm presence and scope by name only.
- Report raw output verbatim, not summarised — especially event lists.
- If a precondition does not hold — an endpoint already exists, a secret is already
  set, an event cannot be selected, a permission cannot be granted without also
  granting write — **stop and report**. A stop is a finding. Previous briefs were
  right to stop, twice.

## What comes next, so the shape is clear

After this: the platform pipeline exists and is inert. The connected endpoint is a
decision, not a task, pending Task 4's answer. Activation order is then the nine
migrations, one meter in measure-only mode, and only after that any gate at `1`.
