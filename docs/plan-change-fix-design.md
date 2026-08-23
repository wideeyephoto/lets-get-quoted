# Plan change — what is actually required

**Date:** 2026-08-23 (revised, second pass)<br>
**Status:** contained, not built. The panel is withheld AND the operation is
gated (`LGQ_BASE_PLAN_SUBSCRIPTION_PLAN_CHANGE_ENABLED`, default 0).<br>
**Read this before writing any code.** The first version of this note was wrong
in ways that would have taken money before provisioning.

---

## What changed in this revision

The earlier note said "the SQL half is done and applied; what remains is the
TypeScript half". **Both halves of that sentence are wrong.** There is no
TypeScript-only path, and the SQL that exists is a third of the SQL required.
Everything below was re-verified against the live production database and live
function bodies on 2026-08-23 — not against migration files, which no longer
state the installed text.

---

## Why there is no TypeScript-only path

Three refusals, none of which a TypeScript change can reach:

1. **Writes to `billing_subscription_checkout_operations` are revoked.**
   `revoke all … from public, anon, authenticated, service_role`, then
   `grant select … to service_role`. The admin client can read the table and
   nothing else. The only writer is
   `claim_stripe_billing_subscription_checkout`, a `SECURITY DEFINER` function.
2. **That claim function refuses a paying workspace twice** — once on
   `plan_code <> 'flex'` ("new subscription Checkout requires an active Flex
   workspace", `55000`) and again on any existing `billing_subscriptions` row
   ("existing subscription history requires the future plan-change flow",
   `0A000`). Its own error message names this work as unbuilt.
3. **`record_base_plan_recurring_consent` carries the same Flex gate**
   ("first-subscription consent requires an active Flex workspace") and
   hardcodes `purpose = 'base_plan_subscription'`. The acceptances table pins
   that purpose in a CHECK as well —
   `billing_subscription_consent_acceptances_purpose_check CHECK ((purpose =
   'base_plan_subscription'::text))`, which migration `20260823120000` did not
   widen even though it widened the operations table's equivalent.

A plan change happens on a PAID workspace, so it fails every one of these by
definition.

---

## The central unsolved problem: a plan change has no Checkout Session

This is the thing to solve first, because the shape of everything else follows
from it. Verified in the live projector body:

- `'checkout_session_id'` is in the required key set of the projection payload.
- `or v_checkout_session_id is null or v_checkout_session_id !~
  '^cs_(test|live)_[A-Za-z0-9_]+$'` → `22023`.
- the checked wrapper refuses a null `checkout_session_id` before that.

A first subscription has a Session. A `subscriptions.update` does not. Three
candidate resolutions, and **none of them is clean**:

| Option | Why it fails |
|---|---|
| Fabricate a session id | `retrieveCheckoutSession` 404s → `checkout_session_retrieve_failed`, retryable, forever |
| Reuse the original session id | Blocked by `billing_subscription_checkout_provider_object_unique (livemode, provider_object_id) WHERE provider_object_id IS NOT NULL` — and the production row's `provider_object_id` is NOT null. Worse: `paymentEvidence` would return `checkout_session_paid` off the stale paid Session, **activating the new plan before the proration is paid** |
| Allow NULL `checkout_session_id` for a plan-change operation only | Needs a projector patch, and see the two traps below |

The third is the most promising and still has two confirmed traps. Solve them
before writing the migration.

### Trap 1 — `state = 'activated'` provisions before the money lands

The earlier note's field contract said `state: activated`. **Do not.** The
projector sets `v_operation_was_activated := v_operation.state = 'activated'`,
and that variable gates the entire entitlement block. An `activated` row opens
the gate on the very first `customer.subscription.updated`, which arrives
*before* the proration invoice is paid. The customer gets the new plan's limits
on the strength of the old plan's payment.

### Trap 2 — `state = 'indeterminate'` freezes the entitlement machine

The obvious fix for trap 1 is to insert at `'indeterminate'` and let the
projector's own activation transition open the gate. But `v_was_activated` gates
far more than the plan move: it also gates the `past_due` → grace transition,
the `unpaid` → restricted transition, **and the cancel-to-Flex reversion**.

So between repointing `lgq_operation_id` at a non-activated row and that row
activating, a workspace cannot go to grace, cannot be restricted, and **cannot
be returned to Flex when it cancels**. A customer who upgrades, whose proration
declines, and who then cancels keeps a paid entitlement indefinitely. That is a
strict regression against today's behaviour and the same class of bug this area
has already produced twice.

### Trap 3 — payment evidence is not scoped to the proration invoice

`paymentEvidence` returns `invoice_paid` for **any** paid invoice on the
subscription, not the proration one: `normalizeInvoice` checks id, livemode,
currency and parent type, never the amount, the line items or the period. A
renewal invoice still sitting in the event queue — normal, the projection cron
runs every 5 minutes and retry backoff reaches 24h — will activate the upgrade.
Evidence has to be bound to a specific invoice id captured from the
`subscriptions.update` response and written to the operation row.

---

## One claim from the adversarial pass that is FALSE

It was briefly written into this note as a defect, so it is recorded here rather
than quietly deleted. **"Annual subscribers have no immediate upgrade; the
immediate rail only serves monthly → monthly" is wrong.** `plan-transition.ts`
gates on `isCapacityUpgrade && (current.planCode === 'flex' ||
!changesBillingInterval)`, so annual Solo → annual Growth is
`activate_after_payment` like any other same-interval tier move. What waits for
renewal is a change of *interval*, which is the rule that stops an annual
subscriber escaping their paid term by bundling a tier move with a switch to
monthly.

---

## Confirmed defects in the current code, independent of the above

- **`always_invoice` does not throw on a declined proration.**
  `payment_behavior` defaults to `allow_incomplete`, so Stripe applies the price
  change and leaves the invoice `open`. `activateAfterPayment` discards the
  response entirely and returns `ok: true`. The customer is committed to the new
  price, entitled to the old one, and told they were upgraded. Any fix must read
  `latest_invoice` rather than assume a rejection.
- **The idempotency key cannot express a retry.** It is derived from
  `billing_subscriptions.updated_at`, and the plan would write it into
  `billing_subscription_checkout_idempotency_key_unique (livemode,
  stripe_idempotency_key)` — a full unique index. A retry after a failed change
  reuses the same key and hits a raw `23505`. The key needs the operation id in it.
- **Prorated credit grants are computed and thrown away.**
  `decidePlanTransition` returns `creditGrants` from
  `proratedPlanUpgradeCreditDeltas` for a mid-cycle upgrade, and nothing outside
  `plan-transition.ts` and its own test ever reads the field. So an upgrade moves
  `feature_limits` and `plan_code` but tops up no credit lots until the next
  allowance reset — the customer pays the new price and waits up to a month for
  the new plan's allowances. Decide whether that is the intended product before
  building on top of it.
- **`past_due` and `trialing` workspaces are offered the upgrade** by
  `CHANGEABLE_STATUSES`, and any new claim RPC modelled on the existing one will
  refuse them — after consent has already been minted and permanently recorded.
- **`cancel_at_period_end` is never read.** A customer with a scheduled
  cancellation can still be charged an immediate proration for a plan that ends
  anyway.
- **Nothing sweeps stale operations.**
  `billing_subscription_checkout_one_pending_per_account UNIQUE (account_id)
  WHERE state IN ('claimed','submitted','checkout_created','indeterminate')`
  means one unresolved plan change locks a workspace out of all further plan
  changes.  `billing_subscription_checkout_reconciliation_queue_idx` exists and
  has no consumer.

---

## Separate, verified, and nothing to do with plan change

**The one paid subscription in production will terminally dead-letter its next
renewal.** Read from the Stripe API on 2026-08-23:

```
sub_1U5hxLPqTgiW6iRM2f12RKn0   status active   livemode false
  lgq_catalog_version: "2026-08-15-preview"
```

`exactMetadata` requires `metadata.lgq_catalog_version === PRICING_CATALOG_VERSION`,
which is `'2026-08-18-preview'` (`catalog.ts:10`). A mismatch returns null, which
reaches `fail('provider_object_contract_mismatch')` — and `fail` defaults
`retryable = false`, so it lands `failed_terminal` on attempt 1. The renewal on
2026-09-18 will not project.

The catalog bump moved the code and did not move the metadata already written on
live subscriptions. **This is its own fix and should not be folded into the plan
change**, though a plan change would incidentally repair the row by rewriting
`lgq_catalog_version`.

Note this subscription is a *sandbox rehearsal*, not a customer — every id
carries the `PqTgiW6iRM` suffix of `acct_1TtDcSPqTgiW6iRM`. It reached the
production database because Preview deployments write there.

---

## Sequencing

1. ~~Gate the operation.~~ **Done** — `78a87549`. The panel was already withheld
   at the render site; the gate closes the server action, which stays POST-able
   because `ChangePlanPanel` is still compiled into the bundle.
2. ~~Fix the catalog-version outage.~~ **Done and applied** — `9cd072de`,
   migration `20260823190000`. That turned out to be a live inability to collect
   card payments, not a September renewal problem. See the handoff.
3. ~~Consent rail.~~ **Done and applied** — `56d707cd`, migration
   `20260823200000`. `record_base_plan_plan_change_consent`, the acceptances
   `purpose` CHECK widened, granted to `authenticated` only with the `anon`
   revoke asserted. Inert: nothing calls it.

### Done since

4. ~~The ledger.~~ **Applied** — `e9a5c61a`, migration `20260823210000`.
   `billing_subscription_plan_change_operations`, separate from the checkout
   table for the three reasons in that commit. Consent pinned twice: the same
   13-column FK the checkout rail uses, plus an `(acceptance_id, purpose)` FK
   the checkout rail cannot express — a gap created by widening the acceptances
   purpose CHECK. `anon` revoke asserted, and proved by mutation.
5. ~~The claim RPC.~~ **Applied** — `59ba346a`, migration `20260823220000`.
   Lock order copied from the first-checkout claim so the two serialize rather
   than deadlock. Subscription lookup filtered on the
   `one_live_per_account` status list, which is what makes it provably
   single-row. `cancel_at_period_end` now read. Proved behaviourally against
   production in a rolled-back transaction.

### Still to build, in order

4. **Decide the Checkout-Session question above.** Traps 1–3 must have an answer
   before the ledger migration is written, because the answer determines the
   operation row's state, its columns, and how many function bodies get patched.
   The current intent is a **separate ledger table**
   (`billing_subscription_plan_change_operations`) rather than widening the
   checkout table — the Stripe *events* cannot be routed elsewhere, since they
   arrive on the same subscription object, but the *ledger* can. That avoids
   widening the checkout CHECKs, avoids `one_pending_per_account` locking a
   workspace out of further changes, and avoids the consent single-use unique
   colliding across rails.
5a. **The transition RPCs.** `submitted → provider_accepted` carrying the
   `proration_invoice_id` read off the `subscriptions.update` response;
   `→ indeterminate` when the Stripe outcome is unknown; `→ abandoned` on a
   permanent failure. Each compare-and-set on `claim_token`. Note that
   `always_invoice` does **not** throw on a declined proration —
   `payment_behavior` defaults to `allow_incomplete` — so the caller must read
   `latest_invoice` rather than assume a rejection.
6. Projector/binding patches. Payment evidence must be bound to the **specific
   proration invoice id** captured from the `subscriptions.update` response, and
   the `checkout_session_paid` re-tightening must key on
   `v_checkout_session_id is null`, not only on operation purpose.
7. The TypeScript write path: operation row **before** the Stripe call, the new
   `lgq_operation_id` in the subscription metadata without dropping the other
   keys, and fresh consent captured in `ChangePlanPanel` mirroring
   `BasePlanSubscriptionCheckout`'s three hidden fields. Reuse
   `base-plan-checkout-consent` / `base-plan-checkout-affirmation` rather than
   inventing a class, or `globals.css` changes and `globals-lite.css` must be
   regenerated.
8. Grant the prorated credit lots. `proratedPlanUpgradeCreditDeltas` already
   computes them and nothing reads the result, so today an upgrade moves limits
   and the customer waits up to a month for the allowances they just paid for.
9. The end-to-end projection test in test mode is what gates the flag — not the
   migration, and not this note.

**A ceiling worth stating:** steps 4–8 are code and SQL and can be finished from
here. Step 9 and the flag flips cannot — they need a real test-mode Stripe
purchase and Vercel environment changes, and `vercel-env-is-baked-at-build`
means a Production flag does nothing until a redeploy.

**A note on writing the migration when you get there:** `pg_catalog.coalesce`
does not exist. `COALESCE`, `NULLIF`, `LEAST` and `GREATEST` are SQL constructs,
not `pg_proc` entries, and this repo's habit of `pg_catalog.`-qualifying
everything will produce a function body that parses and then fails at first
execution — on every subscription event, platform-wide, not just the plan-change
path. The live projector already uses bare `least(` and `greatest(` for exactly
this reason.
