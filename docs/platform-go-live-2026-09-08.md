# Whole-platform go-live audit — September 8, with dated follow-ups

This is the September 8 audit and its later evidence updates. The [current remaining-work register](../LAUNCH_CHECKLIST.md#current-remaining-work--reconciled-september-10-2026) is authoritative for open status as reconciled September 10. Its 12 workstreams replace duplicate checklist counts; the [reconciliation record](launch-checklist-reconciliation-2026-09-10.md) explains which findings were superseded and which acceptance remains open.

Ahead/behind counts, audit-range counts, source line numbers, flag inventories and CI results below belong to their recorded dates. They must be recomputed for the chosen final release. This document does not establish a new production probe or authorize an unapproved release, purchase or feature expansion.

**How to read the status tags.**

- `VERIFIED TODAY` — I read the source, ran the command, or probed the live
  surface on 2026-09-08.
- `INHERITED` — carried from a prior audit and not re-verified; treat the
  finding as a lead, not a fact.
- `CLAIMED, NO ARTIFACT` — a document asserts it is done and nothing in the repo
  proves it.

---

## §0 — State hygiene. Nothing below means anything until this is done.

The following checkout and CI findings describe September 8. Later payment and domain releases have their own recorded validation. R10 in the current register still requires one integrated candidate, its exact audit range, independently captured gate results and a matching deployed revision.

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

### 1.1 Six live add-on Prices and initial purchases — superseded finding

The [September 8 provider record](six-sku-release-readiness-2026-09-08.md) records all six live Prices, amounts, cadences and catalog metadata. [September 9 live acceptance](evidence/live-addon-lifecycle-2026-09-09.json) subsequently proves actual checkout, payment and fulfillment for all six, followed by full refunds totaling $248. The earlier statement that none had been verified is obsolete.

Natural renewals, effective period-end cancellation, provider failed-payment/plan-change journeys and deployed refund/debt presentation remain in [R01](../LAUNCH_CHECKLIST.md#launch-r01). Revalidate any changed catalog against the selected release under [R10](../LAUNCH_CHECKLIST.md#launch-r10).

### 1.2 Voice measurement is recorded ON; enforcement remains OFF

[Dated provider settings and usage](six-sku-release-readiness-2026-09-08.md) confirm the meter and allowance worker enabled, the exhaustion gate disabled, and a call settled for two minutes. The ledger is not an unconsumed or wholly dark implementation.

Seven healthy daily comparisons and a full actual provider invoice period, including forwarding/rounding, remain in [R02](../LAUNCH_CHECKLIST.md#launch-r02). Recheck current deployment flags under R10. Exhaustion blocking stays OFF unless Brett separately chooses enforcement after reviewing evidence; no checkpoint date automatically turns it on.

### 1.3 Live LGQ refund engine — verified September 9, 2026

The earlier statement that no LGQ refund call site had run live is superseded
by [verified provider/application evidence](prelaunch-payments-verification-2026-09-09.md).
The September 7 programmatic LGQ refund returned $1.00, reversed $1.00 of the
contractor transfer and refunded $0.01 of the platform fee. Stripe's API request
log contains both reversal flags and LGQ's exact idempotency key. The production
ledger and admin audit agree.

**Scope:** this verifies the live partial-refund engine. It does not claim a new
dashboard-button execution, a full refund, every other refund call site or the
paid add-on lifecycle. The remaining live add-on gate is tracked in the current
[launch checklist](../LAUNCH_CHECKLIST.md).

September 9 completion: PR #56 is merged and included in production. Refund,
paid Voice and duplicate-delivery migrations are applied, refund webhook events
are saved, and the scheduled worker processed all six live add-on refunds.
Exactly $248 was charged and fully refunded. All 500 purchased minutes were
revoked, storage returned from 100 to 50 to 0 GB, and office-seat rounding was
verified at 1 to 1 to 0. All five recurring add-ons are canceled; the unrelated
Solo allowance remains unrevoked. Fixed a real duplicate-delivery 500 and proved
HTTP 200 for both full-refund and stale half-refund replays with unchanged
balances. Natural paid renewals and effective period-end transitions remain open;
see the [dated execution record](prelaunch-payments-verification-2026-09-09.md)
and [sanitized evidence](evidence/live-addon-lifecycle-2026-09-09.json).

The separate [natural-renewal cohort](evidence/live-addon-renewal-2026-09-10.json)
has an approved $426 additional cap. As of September 10, 01:41 UTC, Solo Voice
and storage are paid ($74); the other three initial purchases await fresh Link
approval. Storage adds 100 GB; the normal 01:37 worker granted exactly one
100-minute Solo paid-invoice lot and preserved the manual allowance. Both exact
provider renewal timestamps are reconciled. Follow-ups now surround the October
and November 9-10 billing boundaries, with the next check October 9 at 7:40 p.m.
Eastern. This does not close natural renewal or cancellation acceptance.

### 1.4 Reconcile current production feature flags — still open

The 67-source-flags/12-documented-flags count was measured on September 8. Recompute the inventory for the selected release; record expected and actual values, defaults, scope, and the deployment that uses them. Paid checkout/grant/refund evidence demonstrates the exercised add-on paths operated, not that every feature flag is correct.

[R10](../LAUNCH_CHECKLIST.md#launch-r10) retains the complete inventory and rollout-order check. Webhook and projection/refund workers must be ready before their purchase/cleanup paths depend on them. Preserve the recorded distinction between measurement and enforcement.

### 1.5 Recovery has dated artifacts; full disaster recovery remains open

The [staging restore record](runbooks/dr-drill-record-2026-09-09.md) verifies database/Auth/Storage and application acceptance after correction, including 35 real RLS cases. The [crew-completion migration](runbooks/evidence/dr-production-migration-2026-09-09.json) is verified in production. The independently downloaded offsite pack has also been authenticated and [restored locally](runbooks/evidence/dr-downloaded-local-restore-2026-09-09.json), including all 38 object hashes. Earlier claims that only capture existed or that no dated artifact existed are superseded.

[R06](../LAUNCH_CHECKLIST.md#launch-r06) retains hosted Auth/Storage/application recovery from that exact downloaded pack, independent recovery-key retrieval, deployment/DNS recovery and provider-account recovery/reconciliation. Staging and local restores are separate evidence, not full-disaster RTO. Keep the user's Free/PITR-disabled decision; see [current security/recovery scope](runbooks/security-recovery-2026-09-09.md).

### 1.6 Failure-to-human monitoring and controlled recovery — **COMPLETED 2026-09-09**

- [x] **Deploy the repaired monitoring paths.** [PR #46](https://github.com/wideeyephoto/lets-get-quoted/pull/46)
  shipped as production commit `48dee526b6c25a020758e42f4684bd5698ef54e2`.
  Five-minute application scanning and an independent GitHub watchdog now use
  durable notification claims, provider error checks and signed delivery evidence.
- [x] **Prove automatic arrival within 60 minutes for all five classes.** Controlled
  webhook, billing, SMS, dispute and cron failures reached **hello@letsgetquoted.com**
  in **2m 44.4s–2m 55.2s**. All five were verified in Gmail Inbox within six minutes,
  with source references, recovery instructions and admin links. Initial detection
  and delivery came from the normal scheduler.
- [x] **Verify fallback and replay safety.** An isolated database-authorization
  failure triggered an automatic fallback delivered in **3.469 seconds**. Replaying
  the five alert requests reused their original provider IDs. Repeated guarded
  fixture recovery changed zero records and created no charges, credit grants,
  customer messages or duplicate alerts. The recovery watchdog run cleared all five
  findings with zero new notifications and zero delivery failures.

Evidence: [dated verification report](operational-alerts-verification-2026-09-09.md).
This supersedes the September 8 finding that these failure classes had no push path.
Historical backlog triage and paging through an independent provider remain open
in the [canonical prelaunch checklist](../LAUNCH_CHECKLIST.md). Controlled fixtures
do not close separate real-money or real-carrier lifecycle gates.

### 1.7 Office access and financial confidentiality — dated production acceptance recorded

The [September 9 production evidence](tenant-office-verification-evidence-2026-09-09.json) records 83 passing tenant/office cases, including allowed client/job access, denied financial data and mutations, invitation/permission boundaries and workspace isolation. The old staging-only/no-useful-office-access finding is superseded.

Initial live seat purchase and half/full refund capacity arithmetic also passed. Production storage concurrency and preservation under reduced capacity remain in [R09](../LAUNCH_CHECKLIST.md#launch-r09); real subscription renewal and effective cancellation remain in R01. The final integrated release still requires R10.

### 1.8 Tenant isolation — September 9 evidence retained; final release scope still applies

The [83-case dated production suite](tenant-office-verification-evidence-2026-09-09.json) records authenticated workspace separation, scoped service reads, denied office financial access, invitation/permission changes, Storage and other boundary checks. Do not reopen those cases merely because this older audit contained a duplicate checkbox.

[R10](../LAUNCH_CHECKLIST.md#launch-r10) must identify changes since that tested revision and verify the exact chosen release. The dated suite is not a claim that arbitrary later schema/application changes are already accepted.

---

## §2 — Before the first week

### 2.1 Custom email domains — release verified; lifecycle and canary still open

Gmail and Outlook authentication/replies and the production quote link have evidence. The one-workspace enrollment and Check Connection release reached Verified in production, as recorded in the [later committed canary](https://github.com/wideeyephoto/lets-get-quoted/blob/59949e2bd/docs/contractor-domains-canary-2026-09-09.md). The earlier globally-off and pending-verification statements are superseded.

[R04](../LAUNCH_CHECKLIST.md#launch-r04) retains the new binding's real custom-domain product send, remaining message/recovery/disconnect/reconnect drills and seven elapsed healthy days with active-domain scheduled runs. The observation clock has not started in that dated record. The disconnect UI follow-up's local checks do not count as a production disconnect.

### 2.2 Website domains — pending-domain worker proved; final lifecycle still open

The [committed fixture record](https://github.com/wideeyephoto/lets-get-quoted/blob/59949e2bd/docs/contractor-domains-canary-2026-09-09.md) records valid TLS for the active site, scheduled watcher execution and attachment of one real pending disposable domain through deployed credentials. These supersede the older zero-pending-domain-only observation.

Certificate-ready promotion, owner notification and disposable site/account deletion through the deployed application remain in [R04](../LAUNCH_CHECKLIST.md#launch-r04). Preserve the active website.

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

### 2.5 Paid-ad readiness — copy fixed; deployed offer/landing acceptance remains

The false trial CTA was removed from the five recorded pages. [Source regression guards](../test/claims-substantiation.test.ts) now prohibit free-trial and trial-period claims. The earlier assertion that no trial guard exists is obsolete.

[R11](../LAUNCH_CHECKLIST.md#launch-r11) retains deployed offer/substantiation verification, buyable landing journeys, duplicate-route noindex/DSA exclusions, real page-speed measurement and cross-device attribution. A source guard does not prove every deployed page or ad. Any Flex refill decision must update the product contract, pricing copy and tests together.

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

### 2.7 AI Operator and Command Center — recorded verification complete

The [launch evidence](../LAUNCH_CHECKLIST.md#command-center--operational-telemetry-honesty--2026-09-09) records Command Center Waves 1–6: durable campaign idempotency, honest configured/unmeasured states, incident paging and audit-action naming. The old request simply to confirm data is superseded by that dated scope.

Historical business failures and paging independent of the email provider remain separately open in R07 and R08; final release verification remains R10.

## §3 — Can wait, but decide explicitly

| Item | Why it can wait | Why it can't wait forever |
|---|---|---|
| Dashboard ships both stylesheets — 375KB redundant CSS | Deferred on purpose; was blocked by a Next 14 `not-found` bug | The tree is on Next 15 now — re-test whether the blocker still exists |
| Voice ledger consumer is recorded; broader reconciliation remains | The old no-consumer finding is superseded by the settled-call evidence in §1.2 | Complete R02's actual provider-period and remaining lifecycle acceptance |
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

## Current status and historical follow-ups

The [current remaining-work register](../LAUNCH_CHECKLIST.md#current-remaining-work--reconciled-september-10-2026) replaces the September 8 conclusion that no real checkout had been verified. All six initial paid/refund journeys are complete; the wider launch remains open for the acceptance and recovery work listed there. Follow-ups below retain their own timestamps and scope; the later downloaded-pack local restore supersedes the last follow-up's then-unrun local restoration.

September 9 follow-up: the tested crew-completion migration is now verified in production. Encrypted twice-daily Google Drive backups, private cloud presence and user-confirmed Dashlane key escrow are established. Offline pack opening passes; Chrome blocked independent cloud-download verification. PITR remains disabled by the user’s keep-Free decision. See [offsite recovery](runbooks/dr-offsite-recovery.md) for the current scope; earlier local-only findings above are historical.


September 9, 13:12 UTC follow-up: the user successfully downloaded the earlier 12:42 UTC encrypted pack from Google Drive. Its receipt hashes match exactly, and the database archive, all 38 Storage objects, source and encrypted configuration authenticate. This supersedes the earlier blocked-download finding. See [independent cloud-download evidence](runbooks/evidence/dr-cloud-download-2026-09-09.json). A live restore of this downloaded pack and full provider/infrastructure recovery were not performed in this check.
