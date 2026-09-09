# Whole-platform go-live list — 2026-09-08

**What this is.** Every rail that must be true before Let's Get Quoted takes a
real paying customer, sequenced by *which sale each blocker must precede*. It is
not a copy of [LAUNCH_CHECKLIST.md](../LAUNCH_CHECKLIST.md) — that file tracks
243 boxes and has certified falsehoods before, so every load-bearing claim below
was re-checked against source, `git`, GitHub Actions, or a live probe today.
Items proven fixed since the last audit are recorded in §5 so nobody re-opens
them.

**How to read the status tags.**

- `VERIFIED TODAY` — I read the source, ran the command, or probed the live
  surface on 2026-09-08.
- `INHERITED` — carried from a prior audit and not re-verified; treat the
  finding as a lead, not a fact.
- `CLAIMED, NO ARTIFACT` — a document asserts it is done and nothing in the repo
  proves it.

---

## §0 — State hygiene. Nothing below means anything until this is done.

Everything in this list is a statement about *a tree*. Right now there are three
different trees and no frozen SHA, so any gate run today certifies an artifact
that will never be deployed.

### 0.1 This checkout has diverged from `origin/main` — `VERIFIED TODAY`

```
local main   11ed8a776
origin/main  bee028f35
             10 ahead, 8 behind, 53 files / +1185 −203 between them
```

Another agent edits this tree live. The ten local commits — custom-domain
certificate watching, the admin command-center fixes, the marketing contrast and
accuracy work, the welcome trade search — are **not on `origin/main` and
therefore not deployed**. The eight remote commits — including the six-SKU
release — are **not in this working tree**, which is why
[catalog.ts](../src/lib/billing/catalog.ts) still reads as fully withheld locally
while production sells all six.

**Do:** reconcile the divergence before anything else. Merge or rebase, resolve,
push. Then re-read every §1 item against the merged tree, not this one.

### 0.2 The audit frontier is 380 commits stale — `VERIFIED TODAY`

The last real audit is
[live-integrations-e2e-audit-2026-09-01.md](./live-integrations-e2e-audit-2026-09-01.md).
Since then `origin/main` has taken **380 commits**. This is the same shape as the
135-commit wave that
[audit-post-sweep-features-2026-08-31.md](./audit-post-sweep-features-2026-08-31.md)
found was "mostly theater, and all live" — except nearly three times larger, and
this time the range contains the decision to start selling six SKUs.

### 0.3 CI is mixed, and the alert channel is red again — `VERIFIED TODAY`

| Run | SHA | Result |
|---|---|---|
| Enable AI Voice subscriptions… (#30) | `bee028f3` | success |
| Merge PR #31 voice-status-auth | `2913ee53` | success |
| Fix voice retries (#29) | `378b32a7` | success |
| Release storage/office add-ons (#28) | `66b146d0` | success |
| `fix(marketing): stop advertising a trial…` | `25bdd1d9` | **failure** |
| `feat(email-domains): daily reconciler…` | `8b41b282` | **failure** |
| Cron Health Monitor & Alerting | `bee028f3` | **failure** (17:00Z) |

PR merges are green; two direct pushes to `main` today are red. The trial-copy
fix in §2.5 is one of the red ones — its correctness is currently unproven by
any gate.

**Do:** freeze one SHA. Run the gates as separate unpiped commands — piping loses
the exit code — after deleting `.next/types`:

```
rm -rf .next/types
npm run typecheck ; echo TC=$?
npm test          ; echo TEST=$?
npm run lint      ; echo LINT=$?
NEXT_DIST_DIR=.next-verify npx next build ; echo BUILD=$?
npm run check:schema:order
npm run check:schema:messaging
npm run audit:applied
```

**PASS =** all seven zero, *and* the deployed Vercel revision equals that SHA.
`npm run test:prelaunch` is a 40-file subset, not the suite — a green prelaunch
run is not a green suite.

---

## §1 — Before the first paying stranger

*No real customers exist yet, so nothing here has a victim today. That is the
entire reason this list is still cheap to act on.*

### 1.1 Six SKUs went on sale today. No live Stripe Price has been verified for any of them. — `VERIFIED TODAY` — **P0**

On `origin/main` (`bee028f35`), `TOP_UPS_WITHHELD` is now `Object.freeze({})`.
Every SKU that [catalog.ts](../src/lib/billing/catalog.ts) previously withheld —
`ai_voice_flex`, `ai_voice_solo`, `ai_voice_growth`, `voice_minutes_100`,
`storage_100gb`, `office_user` — is sellable, shipped across PRs #27, #28 and
#30 between 13:57 and 15:50 UTC today.

PR #30's own description says: *"Stripe Prices still require the canonical
catalog metadata."* That is the blocker, stated by the author, shipped anyway.

This fails in the worst possible way. Top-ups do **not** bind through env vars —
they resolve at runtime by metadata search on `lgq_top_up_id` +
`lgq_catalog_version`. Nothing fails at build. Nothing fails at boot. The first
symptom is a customer clicking Buy and getting an error, on a $55/mo
subscription SKU.

**Do:** `npm run inspect:live-top-ups`. It is strictly read-only and refuses any
key that is not the read-only `rk_live_`. **It cannot run here** — this checkout
has no `.env.live.local`, so it is an operator/Codex task.

**PASS =** for all six SKUs: a live Price exists, is `active`, `unit_amount`
matches `priceCents`, `recurring` matches the catalog's `recurring` flag, and
metadata carries the current `PRICING_CATALOG_VERSION`. Anything short of six
for six → re-withhold the missing ones in the same commit.

**Ordering trap:** a catalog change has no safe order once checkout is live.
Verify against the live function body, not the migration file.

### 1.2 `voice_minutes_100` is sellable with the exhaustion gate deliberately off — `VERIFIED TODAY` — **P0 (decision, not a bug)**

The catalog now carries: *"Voice launches with metering on and exhaustion
blocking off. LGQ absorbs unmetered usage while provider reconciliation
continues."*

That is a legitimate, explicitly-taken business decision — but it has three
conditions nobody has confirmed:

1. `LGQ_VOICE_MINUTE_METER_ENABLED` must actually be **present** in Production.
   Every flag reader is `env[FLAG] === '1'`, so absent silently means off with no
   boot complaint. If the meter is off rather than on, LGQ is not "absorbing
   unmetered usage" — it has no idea what the usage is.
2. Production env is **baked at build**. The flag does nothing until a redeploy,
   and turning it on is an ADD, not an edit — and the ADD is what fails.
3. The runbook requires reconciling a **full billing period** against the
   SignalWire invoice before the gate flips
   ([ai-voice-go-live-runbook.md](./ai-voice-go-live-runbook.md)). Until then
   every minute sold above allowance is LGQ's cost, uncapped and unmeasured.

**PASS =** one curl reads the flag from outside and returns on; and there is a
named date by which reconciliation completes and the gate flips.

### 1.3 The app's own refund path has never executed against a live charge — `INHERITED` — **P0**

[payments.ts:865](../src/lib/payments.ts#L865) sets `reverse_transfer: true` and
`refund_application_fee: true`. There are four distinct `stripe.refunds.create`
call sites and **zero** have run against a live key. The one live refund on
record (2026-08-17) was issued from the Stripe dashboard, which exercises only
the `charge.refunded` projection and never `refundPayment()`.

The comment block at [payments.ts:791](../src/lib/payments.ts#L791) states the
consequence plainly: without `reverse_transfer`, a $1,000 refund sends $1,000 to
the customer, leaves $987.50 with the contractor, and costs **the platform**
$987.50 of its own money. The first contractor who clicks Refund is the first
execution.

The webhook route handlers were rewritten for Next 15 *after* both live proofs
on file, so even the stale evidence no longer describes the shipped code.

**Do:** never through the Stripe dashboard UI. Create a $0.50 live invoice, pay
it, then issue the refund **from the LGQ dashboard**. **PASS =** Stripe shows
`transfer_reversal` set and `refund_application_fee` applied, and the payments
row advances by compare-and-set. Operator required.

### 1.4 Production feature-flag reconciliation — 67 flags, 12 documented — `VERIFIED TODAY` — **P0**

`grep -rhoE "LGQ_[A-Z0-9_]+" src/ | sort -u` → **67** distinct flags. The go-live
env table lists 12. Absent == off, silently. CI declares zero `LGQ_*` vars, so CI
has only ever exercised the OFF path for all 67.

This was a latent problem yesterday. It is a P0 today because six SKUs just went
on sale. The specific ordering that will burn the first stranger:

> `LGQ_STRIPE_TOP_UP_WEBHOOK_ENABLED` and
> `LGQ_STRIPE_TOP_UP_PROJECTION_WORKER_ENABLED` must be ON **before**
> `LGQ_TOP_UP_PURCHASE_ENABLED`.

If either is absent, Stripe charges the card,
[stripe-top-up-webhook.ts:38](../src/lib/billing/stripe-top-up-webhook.ts#L38)
refuses the delivery before reading it, credits are never granted — and there is
**no failed cron and no dead letter** to notice it by.
[top-up-purchases-go-live-runbook.md:48](./top-up-purchases-go-live-runbook.md)
explicitly forbids the wrong ordering.

**Do:** produce one table — flag name, expected Production value, actual
Production value, last redeploy that baked it. **PASS =** every flag on a rail
that can take money is present and correct, and the deploy that baked them is the
frozen SHA from §0.3.

### 1.5 The restore drill is documented as verified and has no artifact — `CLAIMED, NO ARTIFACT` — **P0**

[backup-posture.md](./backup-posture.md) claims `RTO ≤ 30 minutes` and *"Verified
clean restore of auth users, invoices, jobs, and storage assets in < 5 minutes on
scratch database"*, via `scripts/run-pitr-restore-drill.mjs`.

The script exists. It contains **no reference to `SCRATCH_DATABASE_URL`** — the
variable its own runbook says the drill needs — and there is **no dated run
record anywhere in the repo**: no drill output, no timing log, no scratch project
ID, no reconciled row counts.

Meanwhile [security/page.tsx:48](../src/app/security/page.tsx#L48) tells
customers there are automated backups, and seven Storage buckets hold homeowner
property photos and insurance documents.

**Do:** run it for real. `pg_restore --no-owner --no-privileges --clean
--if-exists` into a throwaway project; time it; capture every error (the
Supabase-flavoured archive — `supabase_auth_admin` / `supabase_storage_admin`
objects — is exactly the shape that fails on ownership and extension ordering).
Reconcile counts on `accounts`, `payments`, `invoices`, `quotes`, `jobs`,
`auth.users`. Point a Vercel preview at the scratch project and **log in as a
real workspace member** — the only thing that proves `auth.users` plus the RLS
helpers survived. Restore Storage and open one job photo through the app.

**PASS =** a preview app serving restored data, matching counts, and a written
wall-clock RTO. Until then, correct `backup-posture.md` to say the restore is
untested — a false durability claim on a security page is a consumer-protection
exposure, not a docs nit.

### 1.6 Failure-to-human: the only alert channel is failing again — `VERIFIED TODAY` — **P0**

`Cron Health Monitor & Alerting` — 2 of the last 4 runs failed today (12:32Z and
17:00Z). It works intermittently at best. Historically it produced 7 runs / 7
failures / 0 true readings.

Four failure sinks have **zero** push path to a human: `webhook_failures`,
billing dead-letters, SMS delivery failures, and `charge.dispute.created`.
[admin-alerts.ts](../src/lib/admin-alerts.ts) is 100% read-side.

And the untested-gate hole is still open: [package.json](../package.json) runs
`inspect:cron-health` **without** `--strict`, so a hand-run cannot fail. There is
an `inspect:cron-health:strict` script — use that one.

Remember what green means here: a worker once logged 75 OK runs against a table
that does not exist, and a logically-failed cron writes no reason.

**Do:** fix the channel first — a drill against a broken channel measures
nothing. Then manufacture one dead letter per class (a mismatched-price
subscription event reproduces the never-retryable
`provider_price_contract_mismatch`), start a stopwatch, record time-to-human with
zero polling. **PASS = under 60 minutes, per class.**

### 1.7 The office seat is now sellable — confirm what it actually buys — `VERIFIED TODAY` — **P1**

`office_user` came off the withheld list in PR #28. The historic blocker was that
an office user could reach the leads board and nothing else: `clients/[id]`
stated *"$0.00 paid"* as a fact when `payments` is owner-only, and `jobs/[id]`
built an admin client while rendering and read two dozen owner-only tables.

Partial progress is real:
[jobs/[id]/page.tsx:2](../src/app/dashboard/jobs/[id]/page.tsx#L2) now imports
`requireOfficeContext`. But **line 231 still calls `createAdminClient()` during
render**. Service role bypasses RLS, so the office-context guard at the top does
not constrain what that client can read.

**Do:** for both `clients/[id]` and `jobs/[id]`, prove every admin-client read is
tenant-scoped in the query itself, and that no money figure renders for a role
that cannot see `payments`. Note the pattern: a zero-row RLS read returns **no
error**, so a page that shows nothing looks identical to a page that is working.

**PASS =** a real office user opens a client and a job in production, sees correct
data, and sees no financial figure they are not entitled to. Selling a seat that
opens a page which lies about money is worse than selling one that refuses.

### 1.8 Tenant isolation is a ticked box that has been false before — `INHERITED` — **P1**

"Tenant isolation confirmed" is one of four launch-checklist ticks previously
found to be untrue. RLS covers a small minority of tables and most write actions
use the service role. New objects are anon-accessible by default — the DEFAULT
ACL grants `anon` EXECUTE on every new function and INSERT/UPDATE/DELETE on every
new table, so the revoke *is* the security — and 380 commits of new objects have
landed since the last check.

**Do:** `npm run verify:tenant-isolation` against the frozen SHA; record the
output verbatim into the checklist rather than re-ticking the box.

---

## §2 — Before the first week

### 2.1 Custom email sending domains — Stage 5 has no substitute — `VERIFIED TODAY`

Two independently fatal defects were fixed today behind a fully green suite, so
the code is much better than it was. What remains cannot be closed from inside
the codebase:

- **No real send has been made from a tenant domain.** `dkim=pass` / `spf=pass`
  with `d=` matching the contractor's own domain is unverified. Alignment is
  provable only by reading the headers of an email that actually arrived.
- **`LGQ_EMAIL_SENDING_DOMAINS_ENABLED` is absent in Production**, by design.
  Turning it on is an ADD and requires a redeploy to bake.
- **The reconciler has never fired.** Registered in `vercel.json` (`23 6 * * *`),
  unrun until a deploy reaches Production. Confirm with `npm run
  inspect:cron-health` — a green board with **no row** for this job is not
  evidence.

### 2.2 Custom website domains — one real domain serves, two gaps remain — `INHERITED`

TLS serving is resolved. Outstanding: no reconciler for the certificate wait, and
a binding that leaks on delete. Local commit `11ed8a776` addresses both — and is
**not on `origin/main`** (see §0.1), so neither fix is deployed.

### 2.3 SMS / 10DLC carrier coverage — the largest open cluster — `INHERITED`

Roughly a dozen open checklist items, and it gates selling the dedicated-number
SKU to any real contractor:

- **Contractor-to-customer campaign coverage does not exist.** The pilot number
  `+18103202687` sits on LGQ's *support* campaign, whose registered scope
  excludes that traffic. Number ownership, voice readiness and a successful test
  delivery do **not** establish coverage. BrokePipes is a test workspace, not a
  vetted independent business.
- **Registration automation has no production caller.**
  `automateDownstreamBrandAndCampaign` appears only in its definition in
  [messaging-csp-automation.ts](../src/lib/messaging-csp-automation.ts) and its
  tests. Admin approval currently requires externally-obtained brand/campaign
  IDs. Do not label this automatic.
- **Carrier Operations limits are approved and specific:** 75 AT&T SMS/min, 50
  AT&T MMS/min, 2,000 T-Mobile msgs/day at brand level, ≤49 assigned numbers. A
  different use case needs a new campaign, not an assumed increase.
- **The live matrix is unrun:** ordinary reply, HELP, STOP, blocked-after-STOP,
  START/re-opt-in, duplicate and out-of-order callbacks, quiet-hours deferred
  release, provider rejection, dead-letter recovery, missed-call text-back. Never
  use seeded `555-01xx` data as handset evidence.
- The 10DLC callback carries **no reason field** — support is the only path to
  why an assignment failed, and `failed` may be transient.

### 2.4 AI Voice live matrix — canaries are not a matrix — `INHERITED`

Real calls are answered on production. Still open: staff-call authorization and
denial cases, the real ten-minute provider cutoff, concurrency and fallback,
customer disclosure plus authorized recording/playback/retention, signed
lifecycle callbacks including failure and out-of-order, replay-safe settlement,
number-readiness reconciliation, operator-visible recovery.

Separately: **telephone quote-price editing is guarded off.** Either keep the
guard and the truthful copy, or restore it properly per
[voice-quote-write-guard-2026-09-06.md](./voice-quote-write-guard-2026-09-06.md).
Make it an explicit decision, not a drift.

### 2.5 Paid-ads truthfulness — every ad headline is itself a claim — `VERIFIED TODAY`

- **The false trial claim.** Five CTAs read "Start Free Platform Trial" for a
  trial that cannot exist — `trial_period_days` is actively *rejected* at
  [stripe-plan-prices.ts:292](../src/lib/billing/stripe-plan-prices.ts#L292).
  Commit `25bdd1d91` fixes it, but **that commit's CI run failed**, so the fix is
  unverified. Re-run the gates and confirm the phrase is added to the prohibited
  patterns in `test/claims-substantiation.test.ts` — otherwise it returns.
- **Noindex the mockup routes before any DSA campaign.** `/for-mockup`,
  `/website-builder-mockup`, `/features/website-builder-mockup` are
  self-canonical, absent from the sitemap, and answer 200 on both apex and
  `app.letsgetquoted.com` — so an automated landing-page crawl can select them as
  ad destinations. Same for all six `/home-*` variants and `/features-flagship`.
- **The FTC register is not a trustworthy inventory.**
  [ftc-substantiation-register.md](./ftc-substantiation-register.md) holds twelve
  claims; **none** covers the free/no-credit-card offer, and CLM-005 names
  `/pricing` as carrying a 30-day money-back claim that exists nowhere under
  `src/app/pricing/`.
- **Nothing on the marketing surface is statically prerendered.** Root layout
  awaits `headers()` and `cookies()`, root sets `force-dynamic`, `FlagshipHome`
  is a 1,065-line client component. Measure `responseEnd`, not TTFB — streaming
  renders TTFB a flat ~14ms lie.

### 2.6 Contractor-lifecycle cron — a dry run now exists; use it — `VERIFIED TODAY`

`runContractorLifecycleSweep` now takes `options?: { dryRun?: boolean }`
([contractor-lifecycle-emails.ts:388](../src/lib/contractor-lifecycle-emails.ts#L388)),
which closes the old "unsetting `RESEND_API_KEY` is not a dry run" problem. It
still fires `0 14 * * *` at every real account owner.

**Do:** before the next fire, run it dry against production and print every row —
accountId, resolved recipient, stepId, computed `accountAgeDays`. **PASS =** you
can name every human who would receive mail and every subject line; no test/demo
account; no account receives a mid-sequence step as its first message. Separately
resolve all ten `ctaPath` values against the App Router — three previously
pointed at routes that do not exist, and the test pins the broken string.

### 2.7 AI Operator — reconnected today; confirm it has data — `VERIFIED TODAY`

`6c055815b` makes it read approvals from Supabase and stop reporting figures
nothing measured — the exact defect where the cockpit read memory and both tables
held 0 rows. Confirm the tables now hold rows in production, and that no tool
fabricates evidence it did not measure.

---

## §3 — Can wait, but decide explicitly

| Item | Why it can wait | Why it can't wait forever |
|---|---|---|
| Dashboard ships both stylesheets — 375KB redundant CSS | Deferred on purpose; was blocked by a Next 14 `not-found` bug | The tree is on Next 15 now — re-test whether the blocker still exists |
| Credit ledger has no consumer | Top-ups grant a number nothing spends; one caller and it is dark | §1.1 just made three credit-granting SKUs sellable |
| Referral engine unmerged on `agent/referral-engine-port` | Nothing depends on it | The **merge** is what turns referrals on; leaving it stranded loses the work |
| Cross-device attribution gap | No spend yet | Signup conversion fires at `/welcome`, reachable only via an emailed magic link — desktop-request/phone-open converts with no ad context. Size it server-side *before* concluding a campaign failed |
| Flex monthly refill | **Do not build.** Adversarial review returned *broken* on 2 of 3 lenses, 7 blockers, including a migration that aborts on production while its PG17 harness certifies the opposite | The product fork is unresolved: top-up-to-N gives a dormant account **nothing**, because it still holds its untouched 50-credit balance |
| Flex pricing copy | Only false once a refill ships | `test/pricing-plans.test.ts:173-179` hard-pins three strings that become false in the same commit — rewrite the guards, do not delete them |

---

## §4 — Orderings where the wrong sequence causes the harm

These are not preferences. Each has a recorded incident behind it.

1. **Top-up webhook + projection worker flags ON → then the purchase flag.**
   Reverse it and the first stranger is charged and never credited, with nothing
   failing. (§1.4)
2. **Catalog version bump: widen the EVIDENCE readers, then MOVE the CURRENTNESS
   rows.** Skipping the second half stopped the only paid workspace collecting
   money.
3. **Migration before the deploy that reads the column, never after.**
4. **The cancellation flag must follow the billing webhook**, and two paths must
   *stay* ungated or a deleted account keeps billing.
5. **Fix the alert channel before running the alert drill.** A drill against a
   broken channel measures nothing. (§1.6)
6. **Freeze the SHA before running any gate.** Otherwise you certify a tree that
   will never deploy. (§0.3)

---

## §5 — Verified fixed. Do not re-open these.

Re-litigating closed findings has cost real days on this project, so:

- **The ad-wallet card-charging loop.** The `monthlyBudget / 30.4` spend
  fabrication is **gone** from [ad-billing.ts](../src/lib/ad-billing.ts) — zero
  matches today. Spend now goes through an `atomic_ad_wallet_spend` RPC returning
  `delta_spend_cents` and `should_refill`, and the refill carries a persisted
  `pendingRefillIdempotencyKey`
  ([ad-billing.ts:1316](../src/lib/ad-billing.ts#L1316)) plus a second key on the
  PaymentIntent projection. The three compounding defects that made it an
  autonomous card-charger are individually addressed. *Still worth one live
  observation of a real 15-minute cycle before any customer funds a wallet.*
- **Contractor-lifecycle dry run** now exists (§2.6).
- **AI Operator Supabase reads** (§2.7).
- **Custom-domain TLS serving** — one real domain serves.
- **Sending-domain connect action** — the two fatal defects are fixed.
- **`docs/backup-posture.md` now records measured evidence (2026-09-09).** A manual local database and Storage capture is verified; PITR is disabled, no managed recovery points are listed, and no hourly/offsite backup or restore is verified. See `docs/runbooks/dr-drill-record-2026-09-09.md`.

---

## §6 — Who does what

**Can be done without asking:** reconcile the branch divergence, run all gates,
run the dry runs, apply migrations, read production, write the flag-reconciliation
table, fix code, commit and push.

**Operator / Codex required** — Vercel and Stripe only:

1. `npm run inspect:live-top-ups` with `.env.live.local` (§1.1) — **the single
   highest-value action on this list.**
2. Add and bake the missing Production flags, in the §4 order (§1.4, §1.2, §2.1).
3. The $0.50 live invoice → pay → refund-from-LGQ-dashboard rehearsal (§1.3).
4. Supabase console reads and the scratch project for the restore drill (§1.5).
5. Confirm the deployed Vercel revision equals the frozen SHA (§0.3).

---

## The short version

Six SKUs went on sale today across three PRs, in a 380-commit range that has had
no audit, from a tree this checkout is eight commits behind. The author of the
release said in the PR body that the Stripe Prices still need work. **Nobody has
checked whether a customer clicking Buy on any of the six gets a checkout or an
error.** That check is one read-only command and it needs the operator.

Everything else on this list is real, but that is the one that is live right now.


September 9 follow-up: the tested crew-completion migration is now verified in production. Encrypted twice-daily Google Drive backups, private cloud presence and user-confirmed Dashlane key escrow are established. Offline pack opening passes; Chrome blocked independent cloud-download verification. PITR remains disabled by the user’s keep-Free decision. See [offsite recovery](runbooks/dr-offsite-recovery.md) for the current scope; earlier local-only findings above are historical.


September 9, 13:12 UTC follow-up: the user successfully downloaded the earlier 12:42 UTC encrypted pack from Google Drive. Its receipt hashes match exactly, and the database archive, all 38 Storage objects, source and encrypted configuration authenticate. This supersedes the earlier blocked-download finding. See [independent cloud-download evidence](runbooks/evidence/dr-cloud-download-2026-09-09.json). A live restore of this downloaded pack and full provider/infrastructure recovery were not performed in this check.
