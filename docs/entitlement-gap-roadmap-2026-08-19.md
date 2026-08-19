# Closing the entitlement-gating gaps — 2026-08-19

The gating *machinery* is sound: a reserve/commit/release credit ledger, purchased-capacity
tables, DB-level trigger guards, the exact-`'1'` flag convention, and all eight billing worker
cron routes already scheduled in `vercel.json`. What is missing is **coverage**. Of the fourteen
metered items the price book sells, three have an enforcement path with a live caller.

This roadmap is ordered by what unblocks what, not by size. Sizes are relative (S/M/L), not
calendar estimates.

## Where we actually are

| Item | Limit | Measured | Enforced | Live caller | Flag |
|---|---|---|---|---|---|
| Crew seats | yes | yes | yes | `dashboard/crew/actions.ts` | `LGQ_CREW_SEAT_ENTITLEMENT_GATE_ENABLED` |
| AI Intake credits | yes | yes | yes | `api/public/leads/classify-estimate` | `LGQ_AI_INTAKE_USAGE_GATE_ENABLED` |
| File storage | yes | yes | yes | six `*-storage.ts` libs | `LGQ_STORAGE_CAP_ENFORCED` |
| Office seats | yes | yes | yes | **none** | `LGQ_OFFICE_SEAT_ENTITLEMENT_GATE_ENABLED` |
| Text credits | yes | no | no | no | none |
| Marketing email sends | yes | no | no | no | none |
| AI writing drafts | yes | no | no | no | none |
| Custom domains | yes | no | no | no | none |
| Dedicated numbers | yes | no | no | no | none |
| Forwarding minutes | yes | no | no | no | none |
| AI Voice minutes | yes | no | no | no | none |
| Voice concurrency | yes | no | no | no | none |
| Voice history days | yes | no | no | no | none |
| `featureFlags` block | yes | n/a | no | no | none |

Office seats being callerless is expected and documented (`docs/office-seat-activation.md`).
Everything below that row is not.

## The two enforcement templates

Both already exist in the codebase. New meters should copy one of them rather than invent a third.

**Reservation ledger** — `src/lib/billing/ai-intake-usage.ts`. For *flow* meters where the work
can fail after the credit is claimed: reserve, do the work, commit or release. It already handles
idempotent replay, a claim nonce so only the reserving request may refund, and fail-closed
fallback on any uncertainty. This is the template for text credits, marketing email, and AI
writing drafts.

**Cap check** — `src/lib/billing/storage-usage.ts`. For *stock* meters: measure, compare to the
entitlement limit, refuse at admission. This is the template for custom domains, dedicated
numbers, and voice concurrency.

---

## Phase 0 — Repair and truth-telling

Small, independent, and worth doing before anything else: one is a live defect, one is a public
claim we cannot currently honor.

### 0.1 Wire the reservation expiry sweeper — S — **live defect**

`expire_usage_reservations` is a properly built sweeper (batch limit, `for update skip locked`,
advisory locks) in `migrations/20260815213142_pricing_entitlements.sql`, and
`usage_reservations.expires_at` is `not null` — the design expects it to run. It has **no caller**
anywhere in `src`, `migrations`, or `scripts`, and no cron route.

Because `available = granted − consumed − reserved − revoked`, an AI Intake reservation abandoned
mid-request (crashed process, dropped connection) strands those credits permanently. AI Intake is
the one meter that *is* enforced, so this is reachable in production the moment
`LGQ_AI_INTAKE_USAGE_GATE_ENABLED=1`.

The code already anticipates the sweeper's absence — `ai-intake-usage.ts` declines to spend a
provider call on a stale row "while waiting for the expiry sweeper."

Add `/api/cron/usage-reservation-expiry` following the existing `billing-worker-cron.ts` pattern
used by the other eight routes, plus a `vercel.json` entry. Gate it on its own flag for symmetry.

### 0.2 Reconcile the overage / spending-cap copy — S — **public claim, no implementation**

There is no overage or spending-cap mechanism in `src` or `migrations`. The only `overage` in the
product is job-price overage (`lib/job-lifecycle.ts`), unrelated. But the capability is already
stated publicly in three places:

- `src/app/pricing/pricing-catalog.ts:190` — "Top-ups or enabled overages with a spending cap"
- `src/app/pricing/pricing-catalog.ts:234-235` — FAQ: "an overage setting you deliberately enable with a spending cap"
- `src/app/pricing/PricingExperience.tsx:718` — "Top up once or deliberately enable a spending cap"

Until Phase 3.2 ships, soften these to what is true: extra capacity requires a top-up, and LGQ
never charges an unapproved overage. That second half is trivially true today — because there is
no overage at all — and is the more valuable promise anyway.

### 0.3 Correct the appendix status table — S

Four rows in section 10 read more complete than the code is:

- *Flex starter allowances / "enforcement coverage is incomplete"* — understates it. Text,
  marketing email, and AI writing have no enforcement on **any** plan, not just Flex.
- *Top-ups / "purchase/fulfillment not fully active"* — the purchase rail is built; fulfillment is
  only meaningful for AI Intake, storage, and crew seats. Four of the five one-time SKUs sell
  credits into a wallet nothing draws from.
- Add a row: **AI Voice — priced, not built.**
- Add a row: **Overage / spending cap — published, not built.**

---

## Phase 1 — Make the sold credits real

The largest revenue-integrity gap. Today `flex_text_250` ($12), `text_1000` ($42),
`marketing_email_5000` ($17), and `ai_writing_250` ($19) are purchasable SKUs whose units nothing
consumes. Only `ai_intake_100` has a consumer. Grants, monthly resets, purchased-credit wallets,
and the settings display all work — the drain does not exist.

`src/lib/sms.ts`, `src/lib/campaigns.ts`, `src/lib/email.ts`, `quote-draft-ai.ts`,
`change-order-ai.ts`, `marketing-draft.ts`, `smart-import-ai.ts`, and `client-import-ai.ts` have
**zero** imports from `lib/billing`.

### 1.1 Segment counter utility — S — blocks 1.2

No segment counting exists anywhere. The book defines a text credit as one carrier SMS segment,
so this needs a real GSM-7 vs UCS-2 classifier with the 160/153 and 70/67 boundaries, plus the
GSM-7 extended characters that cost two septets. Pure function, heavily testable, no dependencies.

### 1.2 Text credit meter — L

**Seam decision.** `sendProviderMessage(to, body)` at `src/lib/sms-provider.ts:327` is the single
funnel every outbound message passes through — but it takes no `accountId`. Every `sendXxxSms`
helper in `src/lib/sms.ts` does have one; it is already required for the opt-out check
(`sms.ts:117-118`).

Recommend threading `accountId` into `sendProviderMessage` rather than metering at the helper
layer. It is one signature change across 42 importing files, most of which route through the
sms.ts helpers, and it buys the property that matters: exactly one place a segment can escape
unmetered. Metering at the helper layer leaves every future caller free to skip it.

**Semantics from the book.** Outbound only — inbound replies do not consume, subject to fair-use
controls. Count segments, not messages. Note that `sendProviderMessage` returns a
`SIMULATED_PROVIDER_ID` sentinel when suppressed; a suppressed message was composed but never
carried, so it must not consume a credit.

Reservation pattern: reserve N segments, send, commit on a provider ID, release on throw.

Flag: `LGQ_TEXT_CREDIT_GATE_ENABLED`.

### 1.3 Marketing email meter — M

A clean seam already exists. `sendCampaignEmail` is a dedicated marketing function called only
from `src/lib/campaigns.ts`, which is also the only caller of `sendCampaignSms`.

**Critical scoping.** Meter *only* the campaign path. The price book promises "Transactional
email: Unlimited · fair use" on every plan — metering `email.ts` broadly would break that promise
and silently cap invoices, quotes, and portal links. The twenty-odd `send*Email` functions in
`email.ts` are transactional and stay unmetered.

`campaigns.ts:172` already chunks recipients into batches. Reserve the audience size at campaign
start, commit per accepted delivery, release the remainder — a campaign that dies halfway should
not bill for what it never sent.

Flag: `LGQ_MARKETING_EMAIL_GATE_ENABLED`.

### 1.4 AI writing drafts meter — M — **needs a product decision first**

Ten modules call a model. The book sells "AI writing drafts" at 25/50/250/500 without defining
which generations count, and the answer changes the effective value of every plan:

| Module | Plausible classification |
|---|---|
| `quote-draft-ai.ts` | draft — almost certainly counts |
| `change-order-ai.ts` | draft — almost certainly counts |
| `marketing-draft.ts` | draft — almost certainly counts |
| `smart-import-ai.ts` | import assist — counts? |
| `client-import-ai.ts` | import assist — counts? |
| `quote-guard-ai.ts` | guard, not a draft — probably free |
| `campaign-guard-ai.ts` | guard, not a draft — probably free |
| `quick-stop-qualify.ts` | qualifier — probably free |
| `receipt-ocr.ts` | OCR, not writing — probably free |
| `blog-generate.ts` | LGQ's own content, not the customer's — must not count |

Settle the counted set, record it in the catalog, then meter only those. Reservation pattern — a
model call that fails should refund.

Flag: `LGQ_AI_WRITING_GATE_ENABLED`.

### 1.5 Roll out measure-first — M

Do not enable any Phase 1 gate straight to enforcing. For each meter, run a period where the
reservation is taken and immediately committed but exhaustion **logs** instead of refusing. The
storage cap comments make the argument better than this doc can: turning enforcement on before
the first sweep has run "would refuse real uploads from contractors standing on a roof."

Then flip to enforcing, one meter at a time.

---

## Phase 2 — Close the display-only limits

These are in the entitlement snapshot and rendered in `PlanUsageSection.tsx`, and read by no
enforcement point.

### 2.1 Custom domain connections — S

Limit is 1 on every plan. Enforce at domain-connect, cap-check pattern.

### 2.2 Dedicated business numbers — M

`dedicatedBusinessNumbers` is 0 on Flex and 1 elsewhere. Nothing prevents a Flex workspace
attaching a dedicated number today. Enforce at number attach.

Coupled to the already-open carrier-registration item — two-way messaging is sold on every plan
and blocked on carrier registration regardless. Sequence these together.

### 2.3 Decide the fate of `featureFlags` — S

`entitlement-catalog.ts:78` builds `quickbooks`, `shared_lgq_texting_number`, `voice_included`,
and `voice_advanced_routing` into every entitlement snapshot;
`stripe-billing-subscription-events.ts:705` persists it; **nothing reads it.**

Either wire the flags to real branches or drop the block. A write-only entitlement field is worse
than no field — it looks like enforcement to anyone auditing the snapshot.

(QuickBooks' one-connection limit happens to be structurally enforced already:
`quickbooks_connections` upserts on `account_id`. It needs no gate.)

---

## Phase 3 — The gates the business model depends on

### 3.1 Enforce `entitlement_state` — L — **blocks launch gate #5**

`active | grace | restricted | archived` is projected by the subscription event projector,
admin-editable via `admin-plan-authority.ts`, and displayed in settings and the admin console.
The only functional read is *checkout eligibility* — `base-plan-subscription-entrypoint.ts:229`
uses it to decide whether a Flex workspace may start a paid plan.

**No product surface degrades on `past_due`, `restricted`, or `canceled`.** A workspace that stops
paying keeps everything. `/api/cron/dunning` is homeowner-invoice dunning, unrelated to
subscriptions.

This is the gate that makes a paid plan actually paid, and it cannot be skipped before selling
subscriptions. It needs three things:

1. A policy matrix — what precisely does `grace` allow that `restricted` does not, and what does
   `archived` retain? The book already commits to some of this: archived Flex workspaces keep
   data and purchased credits, and reactivation is free.
2. A single server-side read point, so the answer cannot drift per surface.
3. Customer-facing messaging — dunning, grace countdown, recovery — which launch gate #5 already
   calls for.

### 3.2 Overage and spending cap — L — depends on Phase 1

Cannot be built before the meters exist; you cannot overage a meter that does not drain. Needs
metered Stripe Prices, a per-workspace cap, a durable approval artifact in the same shape as the
recurring-consent evidence, and a hard stop at the cap. The book's rule is absolute — automatic
overages are forbidden without affirmative approval and a cap — so the failure mode must be
refusal, never a silent charge.

### 3.3 Office seat lifecycle — L

The gate, trigger, RPC, and flag are all built; `office-seat-entitlement.ts` has no product
caller. Requirements are already written up in `docs/office-seat-activation.md`: role design,
invitation lifecycle, last-owner protection, promotion rules. The blocking constraint is
unchanged — an added office user currently receives full owner-dashboard authority, so a narrower
role has to exist before the seat can be sold.

The `office_user` top-up SKU ($15/mo) should stay unpurchasable until this lands.

---

## Phase 4 — AI Voice Receptionist

The largest gap and the most independent. Priced on all four plans — $69 / $59 / $55 / included —
with 100–200 minutes, 1–3 concurrency, standard vs advanced routing, and 30/90-day history. **None
of it exists.** `src/app/api/sms/voice/route.ts` is 113 lines of signature validation and
dial/forward. There is no AI voice implementation, no minute meter, no concurrency limiter, no
history retention job.

It is also not purchasable: there is no Voice add-on SKU in `TOP_UPS`, so even the three plans
that price it as a monthly add-on have no way to buy it.

Work, roughly in order:

1. **Build vs. partner decision.** Everything else depends on it.
2. Voice add-on SKU in the catalog plus mode-scoped Stripe Prices for Flex/Solo/Growth. Recurring
   capacity, same shape as `storage_100gb`.
3. AI-connected minute meter with the book's exclusions: ringing, failed calls, blocked spam, and
   time after a completed transfer do not consume. Reservation pattern, since a call's length is
   unknown at admission.
4. The package-limit behavior the book already specifies: finish the current interaction, up to 15
   grace minutes, 60-minute total-call safety cap, then fall through to the configured forwarding
   or voicemail rule.
5. Concurrency limiter (1/1/1/3) — cap-check at call admission.
6. Routing tiers and history retention (30 vs 90 days) — a retention job, plus the first real
   reader of the `voice_advanced_routing` feature flag from Phase 2.3.
7. Forwarding/voicemail minutes (100/100/200). Note this is not even in `PlanUsageLimits` in
   `plan-usage.ts:37-45` — the type needs the field before anything can display or enforce it.

**Interim:** consider pulling AI Voice from the public pricing page until it exists, or labeling it
clearly as coming. It is currently the only priced line item on the page with no product behind it.

---

## Sequencing summary

```
Phase 0  ─────────────────────────────────────────►  independent, do now
  0.1 expiry sweeper (live defect)
  0.2 overage copy
  0.3 appendix rows

Phase 1  ─────────────────────────────────────────►  revenue integrity
  1.1 segment counter ──► 1.2 text meter ──┐
  1.3 marketing email meter ───────────────┤
  1.4 AI writing meter (decision first) ───┼──► 1.5 measure-first rollout
                                           │
Phase 2  ──────────────────────────────────┤        display-only limits
  2.1 domains   2.2 numbers   2.3 featureFlags
                                           │
Phase 3                                    │
  3.1 entitlement_state ───────────────────┼──► blocks subscription launch
  3.2 overage + cap ◄──────────────────────┘    (needs Phase 1 meters)
  3.3 office seat lifecycle

Phase 4  ─────────────────────────────────────────►  independent, largest
  AI Voice, end to end
```

**Before selling subscriptions:** Phase 0, Phase 1, and 3.1. Without 3.1 a non-paying workspace
keeps everything; without Phase 1, four of the five one-time top-up SKUs sell nothing.

**Can ship after launch:** Phase 2, 3.2, 3.3, and Phase 4 — provided the public pricing page is
truthful about them in the meantime, which is what 0.2 and the Phase 4 interim note are for.

## What not to do

- Do not meter `email.ts` broadly. Transactional email is sold as unlimited on every plan.
- Do not meter inbound SMS. The book excludes replies from the customer's balance.
- Do not enable a Phase 1 gate without a measure-only period first.
- Do not build a third enforcement pattern. Extend the reservation ledger or the cap check.
- Do not enable the `office_user` SKU before 3.3. It would sell a seat that grants full owner
  authority.
