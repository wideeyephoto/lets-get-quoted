# What still needs hardening — 2026-09-14

Compiled by reading the repo at `20db0289` (branch `golive-followup`, last commit
2026-08-22), not by trusting the older roadmaps. Where an older document is now wrong,
that is noted — `PROJECT_HISTORY.md` in particular predates most of the billing work
and should not be used to scope any of this.

**The shape of the problem.** This is not a codebase with holes in it. 560 test files,
no TODO markers anywhere in `src/`, disputes carry a real status and a `charge.dispute.closed`
handler, and the Connect capability-revocation alert that §6 of `PROJECT_HISTORY.md`
calls missing is implemented and emails the contractor
(`src/app/api/stripe/webhook/route.ts:1170`). What is unhardened is almost entirely
**built, tested, and dark** — behind exact-`1` flags that are `0` in `.env.example` and
absent in Production. Hardening here means proving each rail against a real provider in
a controlled order, not writing it.

The risk that follows from that: every one of these fails *open* or fails *silent*.
A gate that is absent does not refuse, it permits. A worker that is disabled does not
error, it returns. A cron firing into a disabled worker looks exactly like a cron
firing into a healthy one.

---

## Tier 1 — Money rails: built, never run in production

Ordered by what unblocks what. Each is a flag that is off, guarding code that has
tests but no live traffic.

### 1. The subscription chain — webhook, then projection, then checkout, then cancel

`LGQ_STRIPE_BILLING_WEBHOOK_ENABLED`, `LGQ_STRIPE_SUBSCRIPTION_PROJECTION_WORKER_ENABLED`,
`LGQ_BASE_PLAN_SUBSCRIPTION_CHECKOUT_ENABLED`, `LGQ_BASE_PLAN_SUBSCRIPTION_CANCELLATION_ENABLED`

The ordering is written into `.env.example` and is load-bearing: cancellation must go
on *before* checkout, never after, or a workspace can buy a plan it cannot leave. The
route is always-dynamic and inert rather than 404
(`src/app/api/stripe/billing/webhook/route.ts`), so the older roadmap's "a live Stripe
endpoint points at a 404" claim needs re-checking against production before anyone acts
on it.

**Harden by:** confirming the Stripe dashboard endpoint, then enabling in the written
order with a redeploy between each, and proving one real subscription through
checkout → projection → visible entitlement → cancellation.

### 2. The top-up rail — three flags, and money that accrues while off

`LGQ_STRIPE_TOP_UP_WEBHOOK_ENABLED`, `LGQ_STRIPE_TOP_UP_PROJECTION_WORKER_ENABLED`,
`LGQ_TOP_UP_PURCHASE_ENABLED`

This is the sharpest one. With the webhook off, paid top-ups **accumulate as received
and are granted once it is enabled** — a customer can be charged and hold nothing. The
projection worker runs on a Vercel cron, which fires only against Production, so this
cannot be fully rehearsed anywhere else.

**Harden by:** webhook first with receipt proved, then projection, then the buying half.
Verify the backlog drains rather than double-grants.

### 3. Overage — authorize, cap, close the period, settle

`LGQ_USAGE_OVERAGE_ENABLED`, `LGQ_OVERAGE_SELF_SERVE_ENABLED`,
`LGQ_OVERAGE_PERIOD_CLOSE_ENABLED`, `LGQ_OVERAGE_SETTLEMENT_ENABLED`

The newest code in the repo — the settlement rail got its first operator control on
2026-08-22 (`a44a5fb9`) and the self-serve switch the same day (`dde0d95f`). Least soak
time of anything here. Two migrations both restate `authorize_usage_overage` in full
and silently overwrite each other if applied out of order
(`docs/unapplied-migrations-runbook.md`); the content check matters more than the
apply log.

**Harden by:** one workspace through a full period boundary with overage on and a cap
set, then a settled charge, before any second workspace sees the switch.

### 4. Purchased-capacity lifecycle — the reason every recurring SKU is withheld

`LGQ_PURCHASED_CAPACITY_LIFECYCLE_ENABLED`

Without the sweep, *a cancelled seat or storage subscription keeps granting for ever*.
This is why `TOP_UPS_WITHHELD` exists and why both seat top-ups and `storage_100gb`
refuse at purchase (`src/lib/billing/top-up-purchase.ts:83`). It must go on **before**
any of them is unwithheld.

### 5. Refund reconciliation — a refund that locks out the next refund

`LGQ_REFUND_RECONCILIATION_ENABLED`

Until this runs, a payment refunded once can never be refunded again: the refund gate
requires `reconciled`, every refund sets `pending`, and nothing else writes `reconciled`
back. A partial refund followed by a needed second one is a support case with no
in-product path.

### 6. The legacy rails still dark

`LGQ_LEGACY_DESTINATION_CHECKOUT_GENERATION_ENABLED`,
`LGQ_LEGACY_DESTINATION_CHECKOUT_PROJECTION_ENABLED`,
`LGQ_LEGACY_PAYMENT_PLAN_PROJECTION_ENABLED`,
`LGQ_LEGACY_QUICK_STOP_RECONCILIATION_ENABLED`,
`LGQ_LEGACY_QUICK_STOP_LATE_REFUND_WORKER_ENABLED`

Generation strictly before projection, never alongside. The Quick Stop late-refund
worker has a five-condition activation precondition written above it in `.env.example`
— read it rather than the flag name.

---

## Tier 2 — Metering that measures but does not enforce

Every one of these is metered at a single egress point, tested, and **fails open in
production because the flag is absent**. The roadmap's own rule: never enable a gate
without a measure-only period first. That measure-only period has not been run for any
of them.

| Meter | Egress point | Gate state |
|---|---|---|
| Text credits | `sms-provider.ts`, all 32 sites | meter + gate both off |
| Marketing email | `lib/campaigns.ts` | meter + gate both off |
| AI writing drafts | `ai-model-call.ts`, all 11 sites | meter + gate both off |
| AI Intake credits | `api/public/leads/classify-estimate` | gate off |
| Crew seats | `dashboard/crew/actions.ts` | gate off |
| Office seats | no live caller, by design | dark |
| Storage cap | five workspace `*-storage.ts` libs | cap + sweep both off |

**7. `LGQ_USAGE_RESERVATION_EXPIRY_ENABLED` is the prerequisite nobody sees.** It
releases reservations whose work never finished. It is explicitly load-bearing for AI
Voice — a call that fails while connecting sends no receipt at all, so nothing in the
request path ever releases the hold. Turning on any flow meter without this leaks
credits that look spent.

**8. `LGQ_WORKSPACE_STORAGE_USAGE_SWEEP_ENABLED` before `LGQ_STORAGE_CAP_ENFORCED`.**
Enforcing a cap against usage nobody has measured refuses at a number that was never
computed. Public lead-photo uploads stay ungated on purpose — a homeowner's photos are
never refused over the contractor's storage bill. Keep that carve-out when enforcing.

---

## Tier 3 — Messaging: authenticated, unproven against a real carrier

The code is strict — callbacks authenticate the exact raw body before parsing, senders
are purpose-separated with three independent exact-`1` release gates, unknown
destinations go to operator review with no "most recent conversation" fallback. What
is missing is carrier reality.

**9. The delivery worker and its three lanes.** `LGQ_SMS_DELIVERY_WORKER_ENABLED`,
then `LGQ_SMS_SHARED_ENABLED` / `LGQ_SMS_DISPATCH_ENABLED` /
`LGQ_SMS_CONTRACTOR_MESSAGING_ENABLED`, each released separately. The cutover runbook's
gates are stricter than credentials-present and none has been satisfied in production:
callback bytes and signing key captured in staging, the **individual** Campaign
assignment successful (an order marked `Processed` is not readiness), one canary
`delivered`, one reply routed exactly once, STOP/START proved.

**10. Dedicated number provisioning is blocked on the carrier, not on us.**
`LGQ_SIGNALWIRE_PROVISIONING_ENABLED` is the only flag that permits provider mutations
that spend money. Purchase fails closed with no database spend policy row, and the env
proposal values never authorize a purchase on their own. The pricing surface is
currently honest about this — `pricing-dedicated-number-not-provisionable.test.ts`
holds that line, and the "Coming soon" contradiction the entitlement roadmap led with
is gone. **Keep that test when the carrier block clears**; it is the only thing
preventing the sold-but-not-shipped mismatch from returning.

**11. There is no separately-authenticated 10DLC status callback route.**
`LGQ_SIGNALWIRE_10DLC_STATUS_CALLBACK_URL` is documented as unsupported and must stay
blank; activation polls and trusts only the individual assignment state. That is a
real missing surface, deliberately deferred.

**12. `LGQ_LEAD_VERIFICATION_SECRET` must be set before any application Twilio secret
is removed.** It only lived on `TWILIO_AUTH_TOKEN` by accident. With neither present,
phone verification stops running and every affected lead is silently flagged unverified.

---

## Tier 4 — AI Voice: the largest dark surface

Three switches on purpose, because "stop charging for this" and "stop doing this" must
not be the same lever: `LGQ_AI_VOICE_ENABLED`, `LGQ_VOICE_MINUTE_METER_ENABLED`,
`LGQ_VOICE_MINUTE_GATE_ENABLED`, plus `LGQ_VOICE_ALLOWANCE_WORKER_ENABLED`, which must
precede the meter or the gate sends every caller to voicemail.

**13. The receipt contract is a different authentication path from everything else.**
SignalWire AI Agent end-of-call receipts use `LGQ_VOICE_RECEIPT_BASIC` — HTTP Basic,
never the signing key. The admission check is security-critical: a receipt for a call
LGQ did not admit is stored as inert evidence and never settled. This path has tests
but no real call behind it.

**14. `voice_minute_lot_tail()` is coupled to `RESERVATION_TTL_MS` by derivation, not
by code.** A voice hold is 90 minutes; a lot expiring exactly at period end is
ineligible for the last 90 minutes of every period. If the two constants drift apart,
a once-a-month refusal returns with the credits visibly present. Worth a test that
fails when they disagree.

**15. Voice retention is continuous, not an activation flag** — it runs regardless, so
it needs watching from the first call, not from go-live.

---

## Tier 5 — Operational truth: how the above fails silently

These are not features. They are the reasons a Tier 1–4 rollout can report success
while doing nothing, and each has already cost something once.

**16. Vercel bakes env at build time.** A flag flipped in the dashboard does nothing
until a redeploy. This made two billing workers look like they had stopped. Every
enablement step above is really *flag + redeploy + verify at runtime*.

**17. Preview deploys write Production Supabase.** A variable set only in Production
makes preview behave differently against the same data. Any rehearsal in preview is
rehearsing against real rows.

**18. A cron firing into a disabled worker is indistinguishable from a healthy one.**
Twenty-plus crons are scheduled in `vercel.json`, several pointing at workers whose
flags are `0`. Nothing separates "ran and deliberately did nothing" from "ran and
failed" from "did not run". `/admin/health` and `/admin/messaging` are the closest
surfaces; extending one to report per-worker gate state and last effective run is the
highest-leverage observability work on this list.

**19. Twelve migrations are "undetermined", which is not "applied".** They create no
object and replace no function, so `audit-applied-migrations.mjs` abstains. Each needs
its own probe. Ask the database, not any written list — a stale list already produced
one blocker that was not real and one real gap that was reported clean.

**20. The six `STRIPE_PRICE_*` bindings are Sensitive and unreadable.** Nobody can
currently confirm they point at the `2026-08-18-preview` Prices rather than the six
stale twins still active in Stripe. Run `npm run preflight:prices` where the Production
vars are, before selling anything.

**21. 267 demo payments sit in production, 194 reading `paid` with populated
`platform_fee`, against Stripe objects that do not exist.** Harmless until someone
looks at a report; actively misleading the moment trailing-volume or fee-bracket maths
runs over $2,600 nobody collected. `scripts/remove-demo-data.mjs` exists. This should
happen before the first real contractor onboards, as a deliberate, separately-reviewed
destructive pass.

---

## If only three things get done

1. **Observability for gates and workers (#18).** Everything else on this list is
   enabled by flipping a flag and then believing what you see. Right now there is no
   reliable way to see it.
2. **The top-up rail, in order (#2).** It is the only item where being wrong takes a
   customer's money and hands them nothing.
3. **Reservation expiry (#7).** A one-flag prerequisite that three separate Tier 2
   meters and all of Tier 4 quietly depend on.

## What not to do

- Do not enable any gate without a measure-only period first.
- Do not enable a metering gate before `LGQ_USAGE_RESERVATION_EXPIRY_ENABLED`.
- Do not unwithhold a recurring SKU before the purchased-capacity lifecycle sweep.
- Do not enable checkout before cancellation.
- Do not build a third enforcement pattern — extend the reservation ledger
  (`src/lib/billing/ai-intake-usage.ts`) or the cap check
  (`src/lib/billing/storage-usage.ts`).
- Do not treat a verification query returning zero rows as a pass. `20260819190000`
  shipped green having verified nothing, because its post-condition named a function
  that did not exist.
