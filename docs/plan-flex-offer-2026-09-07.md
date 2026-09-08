# Flex offer: implementation plan

**Date:** 2026-09-07
**Status:** plan — one decision open (see §2), nothing implemented yet
**Method:** 11-agent workflow — 6 parallel investigations, 1 design, 3 adversarial lenses, 1 ad map.
Two of the three lenses returned **broken**; 7 blockers. They are recorded in §6 so they are not re-derived.

---

## 1. The premise, corrected

The starting claim was "no `trial_period_days` anywhere, so an ad click lands on a paid signup with no trial."
Half of that is right and the conclusion is wrong.

| Claim | Verdict |
| --- | --- |
| No `trial_period_days` in the catalog | **True** — and it is actively *rejected*, at `stripe-plan-prices.ts:292` and `top-up-purchase.ts:129`. A Stripe trial is a price-contract change, not a toggle. |
| An ad click lands on a paid signup | **False** — Flex is $0/mo, no card, and is the default plan for every new workspace (`catalog.ts:473`, `workspace-fee-rate.ts:64`). |
| There is no offer | **False** — the offer is freemium: $0 + 1.25% of payments processed. |

The real defect is narrower and worse: **five CTAs promise a "Free Platform Trial" that does not exist and
cannot exist.** All five use the identical string. Meanwhile Flex's allowances are `cadence: 'one_time'` —
50 texts, 100 marketing emails, 30 AI intake, 25 writing drafts — and nothing refills them. There is no `flex`
path in `monthly-allowance-reset.ts` at all. Flex is functionally a trial that never admits it is one.

**Decisions taken:** (1) freemium named honestly, no Stripe trial; (2) Flex gets a small monthly refill.

---

## 2. THE OPEN DECISION — who is the refill for?

The adversarial review found that the mechanism recommended does not serve the goal it was approved for.
This needs resolving before any code is written.

**Top-up-TO-N** grants `greatest(0, target - available)`, summing *all* existing lots including the starter grant.

- **Dormant account** (signed up, never used anything): available texts = 50, target = 10 → **grants 0. Forever.**
- **Exhausted account** (burned all 50): available = 0, target = 10 → grants 10.

So top-up-to-N reaches **engaged-but-blocked** users and never reaches **dormant** ones. The approved goal was
"keep dormant free accounts alive as a remarketing audience." The mechanism cannot do that, because a dormant
account was never blocked — it is sitting on an untouched starter balance. *(The design's own prose claims "a
dormant account gets exactly one refill, ever"; that is wrong, and the product lens caught it.)*

Dormancy is an activation problem, not a credits problem. Handing credits to someone who never spent the first
50 changes nothing.

**Three ways forward:**

| Option | What it does | Cost |
| --- | --- | --- |
| **A. Fix exhaustion first** *(recommended)* | Build the conversion moment at zero credits — which **does not exist today**. Exhaustion is currently silent: AI Intake degrades to the classic quote form with neither contractor nor homeowner told. Then ship top-up-to-N for engaged users. | Small; no migration for phase 1 |
| **B. Refill as approved, retargeted** | Ship top-up-to-N, but describe it honestly as a working floor for active users, not a dormancy fix. Accept it does nothing for dormant accounts. | Full §4 build |
| **C. Add-N to reach dormant accounts** | Genuinely reaches dormant users — and accrues without bound, since credits never expire (`20260904160000`). 120 free texts per silent account per year, a permanent growing liability. | Full §4 build + unbounded cost |

**Recommendation: A, then B.** The refill is a real improvement for users who hit zero, but it is second in
line. The thing actually costing conversions is that hitting zero is invisible and unpriced — no prompt, no
email, no upsell. That is cheaper to fix and sits directly on the upgrade path. C is not recommended at any
price: it pays the most to the accounts least likely to convert.

---

## 3. Workstream A — honest copy (no dependencies, ship first)

Five identical strings. The codebase already exports the honest label: `SECONDARY_SIGNUP_LABEL = 'Start free'`
at `src/components/marketing/links.tsx:50`.

| File | Now | New |
| --- | --- | --- |
| `features/ai-ads/page.tsx:110` | Start Free Platform Trial | **Start free on Flex** |
| `features/ai-vision/page.tsx:174` | Start Free Platform Trial | **Start free on Flex** |
| `features/ai-voice/page.tsx:129` | Start Free Platform Trial | **Start free on Flex** |
| `features/sparky/AiCopilotWithAvatarsScreen.tsx:84` | Start Free Platform Trial | **Start free on Flex** |
| `demo/clients/[id]/page.tsx:179` | Start Free Platform Trial | **Build my free site** |

The last one is not a style call: it is the *only* demo page not already using "Build my free site" — nine
siblings use that exact anchor text.

**The guard is the point.** No test in `test/` asserts anything about the word "trial" in copy; the only hits
are Stripe status enums. Add to `test/claims-substantiation.test.ts` prohibited patterns (it already walks all
of `src/`):

```
/\bfree\s+(platform\s+)?trial\b/i
/\btrial\s+period\b/i
```

**Also found:** `feature=ai_intake` is factually wrong on both the AI Vision and AI Voice pages and routes users
to `/dashboard/leads`. Separate from the trial fix, but in the same files.

**Claims exposure:** the FTC substantiation register holds 12 numbered claims and **not one covers the
free/no-credit-card offer**. CLM-005 names `/pricing` as carrying a money-back claim that exists nowhere under
`src/app/pricing/`. The register is not a trustworthy inventory. Buying ads raises the stakes on this.

---

## 4. Workstream B — Flex monthly refill

Only if §2 resolves to B (or A-then-B). Shape: a **separate rail** — new `source_type = 'flex_monthly'`, own
SECURITY DEFINER function, own selector, own worker, own cron, own flag. It must not touch
`apply_paid_plan_monthly_allowance_reset`, which has a standing assertion migration guarding its body
(`20260819200000`) and hard-codes success as `verified_lot_count = 4`.

Flex has no Stripe subscription, so the period is a UTC calendar month, not a billing period.
`planCreditGrants('flex')` and `allowances.cadence` stay `one_time` — the starter grant and the refill are two
wallets with two reasons, and keeping them separate is what stops the projector, `planUpgradeCreditDeltas` and
the paid reset from being perturbed.

**Amounts** (targets, not additions): `text_segments` 10, `ai_intake_threads` 10, `ai_writing_drafts` 5,
`marketing_email_sends` 0 (excluded), voice excluded. Full-burn cost ≈ **$0.11 + ~$0.40** per active account per
month. AI intake is the most expensive and the most important — it is the resource whose exhaustion is
*silently* degrading.

Four migrations (CHECK widening → mark table → grant function → selector), a worker, a cron route, a flag, and
a PG17 verification script. Detail is in the workflow output; it is not reproduced here because **three of the
four files do not land as drafted** — see §6.

---

## 5. Workstream C — ad groups → landing pages

**Do not map the trade pages 1:1.** There are **150** trades, not 152 (two grep hits were the type and a
signature). 150 ad groups on a funnel with zero conversion history means none ever exits the learning phase.
Three tiers, each its own campaign so data pools:

- **Tier 1 — 7 ad groups, 1:1.** The only trades with the deep "definitive" suite and FAQPage JSON-LD:
  tree-services, deck-builders, cleaning-services, pressure-washing, garage-doors, pool-builders,
  water-damage-restoration. *(The constant is named `TOP_20_DEFINITIVE_TRADES` but holds 7 keys.)*
- **Tier 2 — ~18 ad groups.** Highest-volume trades that exist as pages, real trade copy but no definitive
  suite. Cap CPCs ~40% below Tier 1.
- **Tier 3 — the remaining ~125.** One DSA campaign, page feed restricted to `/for/`. The CTA is built
  server-side from the route param, so `trade=` attribution still works on auto-selected pages.

**Competitor pages are the strongest paid asset** — real per-competitor tables plus a savings calculator, 5
slugs mapping onto the highest-intent commercial queries. One ad group each, 1:1, no tiering.

**Feature pages need CTA surgery before they can take a click.** `/features/ai-intake` has **no signup CTA in
its hero at all** — unbuyable today. Eight more lead with a `/demo/*` link by deliberate design
(`feature-detail-layout.tsx:52-59` states the primary action is explicitly not sign-up). Correct for SEO, wrong
for paid. Either add a signup primary or accept a demo-first funnel and measure demo→signup as its own step.

**Hard exclusions — never a Final URL:** all six `/home-*` variants (noindexed, unsitemapped, `/home-flagship`
307s to `/`), `/features-flagship`, and the three indexable-but-unlisted duplicates `/for-mockup`,
`/website-builder-mockup`, `/features/website-builder-mockup` — which answer 200 on **both** hosts and can be
picked up by a DSA page feed. Noindex them before enabling Tier 3.

**Before any spend:**

- **Landing-page speed is unmeasured and structurally disadvantaged.** Nothing is statically prerendered: the
  root layout awaits `headers()` and `cookies()`, the root sets `force-dynamic`, `FlagshipHome` is a 1065-line
  client component. Every click pays SSR latency plus hydration, and Google penalises that twice — Quality
  Score and conversion rate. Measure `responseEnd`, not TTFB (streaming makes TTFB a flat ~14ms lie).
- **Cross-device magic link systematically understates paid performance.** Signup conversion fires at
  `/welcome`, reachable only via an emailed magic link. Request on desktop, open on phone → converts on a device
  with no ad-click context. Unfixable; size it from server-side events before calling a campaign dead.
- **The `/for` hub emits a different, hand-concatenated URL shape** than the trade pages, including a `custom=`
  param that `parseSignupIntent` silently discards. Normalise onto `buildSignupUrl` before pointing spend at it.

---

## 6. What the adversarial review broke

Recorded so it is not rediscovered. Verdicts: SQL **broken**, ops **sound_with_fixes**, product **broken**.

**Blockers**

1. **The mark-table migration aborts on production, and the PG17 harness certifies the opposite.** The revoke
   omits `service_role`. On Supabase, `ALTER DEFAULT PRIVILEGES` grants `service_role` ALL on every new table —
   which is exactly why `20260815220739:9-16` strips it on all eight billing tables. The migration's own
   assertion then fires and rolls back. **And the proof is silent about it:** the verification script runs on a
   bare cluster with a hand-created `service_role` carrying no default privileges, so the assertion passes and
   `test:pg17` exits 0. Green certification of a migration that cannot apply. Correct precedent:
   `20260906120000_sms_campaign_wide_stop.sql:84-86`.
2. **`npm run test:all` goes red on a test the design does not list.**
   `test/disposable-account-deletion-111-table-drill.test.ts:55-79` reads every `.sql` in `migrations/` and
   requires a `DATA_DISPOSITION_REGISTRY` entry for every new table.
3. **Silent permanent starvation above ~96k accounts.** The drain is capped by `least(p_limit, 2000)` *in SQL*,
   and `order by e.account_id` starves the same high-UUID accounts every month, for ever — reintroducing exactly
   the voice-allowance bug its own header claims to have fixed. Reports `failed: 0`, HTTP 200, health "ok".
   Fix: order by `hashtextextended(account_id || period_month)` so the tail rotates monthly.
4. **A timed-out run is recorded as a success by the tool the rollout names as proof.** `finishRun` never
   executes when the process is killed, leaving `cron_runs.ok = NULL`; `inspect-cron-health.mjs:242` counts
   failures as `count(*) filter (where not ok)`, and in SQL `not NULL` is NULL, not true. Needs `maxDuration`,
   a smaller batch (500 sequential RPCs is 2.5× the largest comparable worker), and a health query that counts
   `ok IS NULL`.
5. **Abuse: a one-time ~$0.53 signup cost becomes a perpetual annuity.** No identity check, no card, no rate
   limit on workspace creation anywhere. The design does not mention abuse once. Needs a sign-of-life
   eligibility predicate *before* the flag goes on, not after.
6. **The premise is unverified.** The "hard failure" the refill is sized against only exists if
   `LGQ_TEXT_CREDIT_METER_ENABLED`, `LGQ_TEXT_CREDIT_GATE_ENABLED` and three others are `'1'` in Production.
   Those are Sensitive and unread. **Step 0 is to read them.**
7. **The refill would be invisible to the user it exists for.** `source_type` is not in the column-level grant
   to `authenticated`, so no owner-facing surface can label a `flex_monthly` lot. A refill nobody sees
   re-engages nobody.

**Also: published pricing copy becomes false the moment the flag flips**, and two green tests certify the false
version. `pricing-catalog.ts:77` "No automatic refills; optional paid top-ups"; `:60`/`:204` "50 one-time
starter credits"; `:207`; `:241`; two more FAQ answers asserting the no-refill model is permanent; plus
`test/pricing-plans.test.ts:173-179`, which hard-pins three of those strings. **Copy ships in the same commit as
the flag**, and the guard tests are rewritten to pin the new true claim — not deleted.

**One more drift found in passing:** `claims-substantiation.test.ts` pins the public comparison table to
`BILLING_PLANS` for only two rows (platform fee, crew seats). The text-credit, marketing-email and AI-credit
rows are plain literals, so a Flex allowance change silently desyncs the published table.

---

## 7. Sequence

1. **Workstream A** — copy + the trial guard test. No dependencies. Ship now.
2. **Resolve §2.**
3. **Step 0** — read the five Sensitive production flags (blocker 6). Everything in B is sized against them.
4. **Exhaustion conversion moment** (option A).
5. **Workstream C** — CTA surgery on ad-targeted feature pages, noindex the duplicates, normalise `/for`,
   measure `responseEnd`. All before spend.
6. **Workstream B**, with all 7 blockers closed, if §2 says so.

**Do not ship copy promising "10 text credits every month" until the rail exists, has completed a full cycle,
and has an observable success count.** A dark worker records nothing, so "zero failures" will not tell you it
is running.
