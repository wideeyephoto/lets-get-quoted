# Codex browser tasks — billing webhook + redeploy, 2026-08-17

For the agent with authenticated Stripe and Vercel sessions. Four tasks, in
order. **Do not enable any feature gate.** Every `LGQ_*_ENABLED` stays absent or
`0` — this brief only creates infrastructure so a later, separate decision can
turn it on.

Platform Stripe account: `acct_1TuCWJGqh5LFKuTC` (production).
Do not touch the sandbox account `acct_1TtDcKPqCWgR3Ww0`.

---

## Task 1 — Redeploy Production

The six `STRIPE_PRICE_*` variables and `LGQ_STRIPE_BILLING_LIVEMODE` were added
without a redeploy, so they are **not in the running runtime**. The current
Production deployment is `dpl_5JPNZD26b4NN9sytExbWQwaZU8Bh` on commit
`d972c39d`, which predates them.

1. Redeploy Production from the current `main`.
2. Report the new deployment id, the commit it built, and its status.
3. Confirm all seven variables are bound to the new deployment.

Nothing changes behaviourally: every consumer of those variables is behind a gate
that is still off. This only makes them present.

---

## Task 2 — Create the platform billing webhook endpoint

**This endpoint does not exist yet, and subscriptions cannot work without it.**

Today the platform account has exactly one endpoint — `we_1TuE0B…`, the
Connect/payment one with 11 events. That endpoint is **not** to be modified.

Create a **new, separate** endpoint:

- **URL**: `https://<production-domain>/api/stripe/billing/webhook`
- **Mode**: live
- **Listen to**: events on the **platform account** (not Connect / connected
  accounts)
- **API version**: match the pinned `2026-06-24.dahlia` if the dashboard offers a
  choice

### Events — exactly these 18, and nothing else

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

**Do NOT add `checkout.session.completed`** to this endpoint, even though a
subscription checkout produces one. The inbox validates an event against the
scope the route declares, and `checkout.session.completed` belongs to the
connected-payment scope only. Sending it here gets it rejected, not projected.

There are three separate event lists in this codebase and mixing them is the
mistake to avoid:

| list | count | endpoint |
| --- | --- | --- |
| `REQUIRED_LIVE_WEBHOOK_EVENTS` | 11 | the existing legacy Connect endpoint `we_1TuE0B…` |
| `CONNECTED_PAYMENT_EVENT_TYPES` | 20 | the dark connected-payment inbox (not being set up here) |
| `PLATFORM_SUBSCRIPTION_EVENT_TYPES` | **18** | **the endpoint you are creating** |

Report the new endpoint's id and the event list back verbatim.

---

## Task 3 — Add its signing secret to Vercel

Reveal the **new** endpoint's signing secret and add it to Vercel **Production**:

```
STRIPE_BILLING_WEBHOOK_SECRET = whsec_...
```

Hard requirements:

- It must be the secret of the endpoint created in Task 2.
- **It must never be the value of `STRIPE_WEBHOOK_SECRET`.** That belongs to the
  legacy Connect endpoint. The code comment calls this out by name because
  reusing it is the plausible mistake.
- Do **not** roll or regenerate any existing secret. Reveal only.
- Production scope only. Do not touch Preview or Development in this task.

Confirm the variable is present and Production-scoped **without printing its
value**.

---

## Task 4 — Audit the gate list

There is a discrepancy to resolve. The codebase defines **16** distinct
`LGQ_*_ENABLED` names; the Vercel UI was previously reported as showing 17.

List **every** `LGQ_*` variable in Vercel — all environments — with:

- its exact name,
- which environments it is bound to,
- whether its value is `0`, `1`, or something else.

Do not change any of them. This is a read-and-report task. The expected 16 are:

```
LGQ_AI_INTAKE_USAGE_GATE_ENABLED
LGQ_BASE_PLAN_SUBSCRIPTION_CHECKOUT_ENABLED
LGQ_CREW_SEAT_ENTITLEMENT_GATE_ENABLED
LGQ_DIRECT_PAYMENT_SETTLEMENT_WORKER_ENABLED
LGQ_LEGACY_DESTINATION_CHECKOUT_GENERATION_ENABLED
LGQ_LEGACY_DESTINATION_CHECKOUT_PROJECTION_ENABLED
LGQ_LEGACY_PAYMENT_PLAN_PROJECTION_ENABLED
LGQ_LEGACY_QUICK_STOP_LATE_REFUND_WORKER_ENABLED
LGQ_LEGACY_QUICK_STOP_RECONCILIATION_ENABLED
LGQ_OFFICE_SEAT_ENTITLEMENT_GATE_ENABLED
LGQ_PAID_PLAN_ALLOWANCE_RESET_WORKER_ENABLED
LGQ_PRICING_DASHBOARD_ENABLED
LGQ_STRIPE_BILLING_WEBHOOK_ENABLED
LGQ_STRIPE_CONNECTED_PAYMENT_PROJECTION_WORKER_ENABLED
LGQ_STRIPE_CONNECTED_PAYMENT_WEBHOOK_ENABLED
LGQ_STRIPE_SUBSCRIPTION_PROJECTION_WORKER_ENABLED
```

Plus the non-gate `LGQ_STRIPE_BILLING_LIVEMODE`, which takes `1` or `0` **only** —
any other value throws `Stripe Billing mode is not configured.`

A name in Vercel that is not on that list is a dead variable. A name on that list
with no variable in Vercel is not "off", it is undefined — worth knowing which,
because the two behave the same today and differently the moment someone reads
the value instead of comparing it to `'1'`.

---

## Standing constraints

- **Enable nothing.** No gate goes to `1` in this brief.
- Do not modify the existing endpoint `we_1TuE0B…` or its 11 events.
- Do not roll, regenerate or replace any existing secret or API key.
- Do not touch the sandbox account `acct_1TtDcKPqCWgR3Ww0`.
- Never print a secret value. Refer to variables by name and confirm
  presence/scope only.
- If a step's precondition does not hold — the endpoint already exists, a secret
  is already set, an event cannot be selected — **stop and report** rather than
  improvising. The last brief was right to stop at its key-mode check.

## What comes next, so the shape is clear

After these four tasks: the pipeline exists but is inert. Activation is then
`LGQ_STRIPE_BILLING_WEBHOOK_ENABLED=1`, then
`LGQ_STRIPE_SUBSCRIPTION_PROJECTION_WORKER_ENABLED=1`, then last and separately
`LGQ_BASE_PLAN_SUBSCRIPTION_CHECKOUT_ENABLED=1` — the only one that lets a
customer be charged. Rehearse in Preview with test keys and
`LGQ_STRIPE_BILLING_LIVEMODE=0` before any of that.
See `docs/subscription-activation-plan-2026-08-17.md`.
