# Untested Code Audit
Date: 2026-09-12
Scope: every non-test source file under `src/` — 2,300 files, 538,033 lines. Measured against the full unit suite (1,186 test files, 15,123 tests, all passing, 244s).

## Executive summary

The suite is large, green and genuinely good in the places it reaches. Over the code the coverage config measures, 72.81% of statements execute. The security primitives are the best-covered code in the repository: rate limiting 100%, the Stripe billing webhook 100%, `lib/auth` 87.7%, the middleware 79.3%.

The gap is not spread evenly, and it is not where the file count suggests. Three findings matter:

1. **`resolveJobAccess` — the token guard for every homeowner job link — has never executed in a test.** Both tests that name it mock it out. Its revocation check, its expiry check and its token-hash lookup are unverified, and six homeowner-facing entry points depend on it.
2. **74 of 118 server-action modules never execute under test** — 288 exported actions, 10,363 lines. Server actions are browser-reachable mutation endpoints. Among the untested ones are both login flows and every token-gated homeowner and subcontractor surface.
3. **A large tier of code is imported by a test but barely runs.** 38 modules of 150+ statements are imported directly by a test yet execute under 40% of their statements; several execute 0%. These read as tested on any file-level check and are not.

A fourth item is scope rather than neglect: 1,223 files and 297,820 lines — React pages and components — sit outside the coverage config entirely, by a documented choice in `vitest.config.ts`.

Four modules are untested *and* unreachable from any production entry point. One of them is a 194-line TIN vault with a shipped migration behind it.

## How "untested" was determined

Two independent measurements, because each alone is misleading.

**Executed coverage.** A full `vitest run --coverage` (v8) over the configured include globs — `src/lib/**/*.ts`, `src/app/api/**/*.ts`, `src/middleware.ts`. This is ground truth for what runs. Every file matching those globs appears in the report; none were missed.

**Static reachability.** For everything outside those globs (pages, components, server actions), the import graph from all 1,196 test entry points, resolved through the `@` alias. A module no test transitively imports cannot have executed.

The second measurement matters because of a pattern that is common here: **488 test files read source files as text** and assert on their contents rather than running them. `test/api-route-posture-audit.test.ts` sweeps all 1,135 route and action files and checks each contains one of a list of guard substrings. Fifteen such repo-wide sweeps exist. They are useful guardrails and they are not execution — a file they cover can still be at 0%.

## The numbers

Measured scope (`src/lib`, `src/app/api`, `src/middleware.ts`) — 1,077 files:

| Metric | Covered | Total | Pct |
| --- | --- | --- | --- |
| Statements | 125,172 | 171,908 | 72.81% |
| Branches | 30,234 | 39,822 | 75.92% |
| Functions | 4,829 | 6,132 | 78.75% |

| File band | Count |
| --- | --- |
| 0% of statements executed | 175 |
| Under 50% (non-zero) | 130 |
| 50% or above | 772 |

Outside the measured scope entirely — 1,223 files, 297,820 lines:

| Area | Files | Lines |
| --- | --- | --- |
| `src/app` pages and UI | 872 | 216,407 |
| `src/components` | 208 | 45,327 |
| Server actions in `src/app` | 77 | 18,754 |
| `src/lib` template components (.tsx) | 59 | 15,575 |
| `src/emails` | 6 | 1,571 |
| `src/hooks` | 1 | 186 |

## Findings

### 1. The homeowner job-token guard has never run — High

`src/lib/change-order-client.ts` — 2.2% of statements, **0% of functions**.

It exports two functions. `resolveJobAccess(token)` hashes the token, looks it up in `client_job_access`, and returns null if the row is missing, if `revoked_at` is set, or if `expires_at` has passed. Those three decisions are the entire access control for the homeowner portal.

Two tests mention it. Both replace it:

```
test/portal-message-alert-sms.test.ts:214
  vi.spyOn(changeOrderClientModule, 'resolveJobAccess').mockResolvedValue({...})

test/client-attachment-capacity.test.ts:13
  vi.mock('@/lib/change-order-client', () => ({ resolveJobAccess: mocks.access }))
```

Mocking it in those tests is correct — they are testing something else. The problem is that nothing else tests it either. No test asserts that a revoked token is rejected, that an expired token is rejected, or that the lookup is keyed on the hash rather than the raw token.

Six entry points depend on it: `actions.ts`, `form-actions.ts`, `change-order-actions.ts`, `selection-actions.ts`, `warranty-actions.ts` and `page.tsx`, all under `src/app/client/jobs/[token]/`.

The second export, `respondAsClient`, is also at 0%. Its own comment documents the protection it implements:

> The change order is re-read and checked to belong to THIS job before anything is written. Without that, a valid token for one job would answer a change order on another — and both belong to real customers.

That check has never executed.

### 2. 74 of 118 server-action modules never execute — High

288 exported actions, 10,363 lines. A server action is a POST endpoint the browser can call with arguments it chooses; the first argument of most of these is a token supplied by the caller.

The untested set includes every unauthenticated or token-gated surface:

| Lines | Actions | Module |
| --- | --- | --- |
| 532 | 4 | `src/app/book/[subdomain]/actions.ts` |
| 179 | 10 | `src/app/client/jobs/[token]/actions.ts` |
| 145 | 6 | `src/app/quick-stop/[id]/actions.ts` |
| 131 | 2 | `src/app/portal/view/[token]/actions.ts` |
| 81 | 1 | `src/app/portal/[subdomain]/actions.ts` |
| 80 | 2 | `src/app/field/login/actions.ts` |
| 54 | 1 | `src/app/client/jobs/[token]/form-actions.ts` |
| 38 | 1 | `src/app/login/actions.ts` |
| 36 | 1 | `src/app/recover-account/actions.ts` |
| 34 | 4 | `src/app/sub/[token]/actions.ts` |
| 20 | 1 | `src/app/unsubscribe/actions.ts` |
| 20 | 2 | `src/app/schedule/[token]/actions.ts` |
| 19 | 2 | `src/app/review/[token]/actions.ts` |

The largest untested admin module is `src/app/admin/voice/numbers/actions.ts` at 556 lines and 9 actions.

This is not a missing capability. 22 test files already import action modules directly and drive them — `@/app/admin/messaging/actions`, `@/app/dashboard/jobs/actions` and 25 others are covered this way. The pattern works; it has been applied to a third of the surface.

Note this does not contradict the 2026-09-12 security audit, which found every action reaches a guard. That was verified by reading the source. This finding is that nothing runs them.

### 3. Imported but barely executed — High

38 modules of 150+ statements are imported directly by a test and execute under 40% of their statements. Any file-level "is there a test for this" check reports them as covered.

| stmt% | fn% | Statements | Module |
| --- | --- | --- | --- |
| 0.0 | 0.0 | 194 | `src/lib/receivables-data.ts` |
| 0.8 | 0.0 | 521 | `src/lib/google-ads-verifier.ts` |
| 1.9 | 0.0 | 214 | `src/lib/daily-digest.ts` |
| 4.8 | 7.1 | 622 | `src/lib/crew-pay-data.ts` |
| 5.3 | 15.4 | 454 | `src/lib/reviews.ts` |
| 7.7 | 6.7 | 569 | `src/lib/job-feed.ts` |
| 12.4 | 12.5 | 444 | `src/lib/payment-plans.ts` |
| 15.3 | 14.3 | 594 | `src/lib/client-portal-data.ts` |
| 15.8 | 13.6 | 514 | `src/lib/selections-data.ts` |
| 18.2 | 28.0 | 619 | `src/lib/recurring.ts` |
| 24.7 | 57.1 | 154 | `src/lib/public-api/api-credentials.ts` |
| 39.6 | 46.7 | 227 | `src/lib/public-api/api-wrapper.ts` |

`receivables-data.ts` is at 0% because its only test reference is `import type` — erased at runtime. The public API pair is the weakest security-relevant coverage in the repository: `api-wrapper` and `api-credentials` gate every `/api/v1/` request, and between them roughly two thirds of their statements never run.

Widening the filter to modules where 5% or fewer functions ever execute, that are reachable from production, and that either write to the database or handle tokens and tenant scoping, gives **58 modules**. The largest:

| stmt% | DB writes | Module |
| --- | --- | --- |
| 0.3 | 4 | `src/lib/property-passport-data.ts` |
| 0.0 | 4 | `src/lib/google-lsa/sync.ts` |
| 0.7 | 8 | `src/lib/google-lsa/connection.ts` |
| 0.0 | 9 | `src/lib/estimate-offers-data.ts` |
| 1.1 | 8 | `src/lib/milestones-data.ts` |
| 0.0 | 7 | `src/lib/reschedule-offers-data.ts` |
| 0.5 | 6 | `src/lib/warranties-data.ts` |
| 0.0 | 5 | `src/lib/purge-worker.ts` |

`purge-worker.ts` deserves its own note. It permanently hard-deletes rows and storage objects, and it checks `legal_hold` on the account before each destruction. Nothing executes that check. Its `getTableName()` maps an entity-type string to a table name and throws on anything unrecognised; that mapping feeds a `DELETE` and is also unexecuted.

### 4. 114 of 186 API routes at 0% — Medium, and smaller than it looks

The headline number overstates it. Broken down:

| Kind | Count |
| --- | --- |
| Pure re-export aliases (≤6 lines) | 4 |
| Thin delegators to a tested lib (≤25 lines) | 55 |
| Substantive handlers (>25 lines) | 55 |

The four aliases are `api/twilio/inbound`, `api/twilio/status`, `api/twilio/voice` and `api/twilio/voice/status`, each two lines of `export { POST } from '@/app/api/sms/...'` with a comment explaining why the path cannot be retired. The Stripe webhook routes are 10 and 11 lines delegating to `stripe-billing-webhook.ts` and `stripe-top-up-webhook.ts`, both of which are at or near 100%. That is the right shape and needs nothing.

45 of the 114 are cron routes, and `test/cron-jobs.test.ts` does cross-check every one against `vercel.json` — by reading the source, not running it.

The substantive 55 are where the work is. The largest:

```
315 LOC  src/app/api/public/leads/classify-estimate/route.ts
193 LOC  src/app/api/lead-photos/ai-suggest/route.ts
160 LOC  src/app/api/payroll/submit/route.ts
138 LOC  src/app/api/v1/webhook-subscriptions/route.ts
134 LOC  src/app/api/field/location/route.ts
114 LOC  src/app/api/v1/leads/route.ts
 95 LOC  src/app/api/sms/voice/route.ts
 92 LOC  src/app/api/v1/leads/[id]/route.ts
```

`api/public/leads/classify-estimate` is unauthenticated and the largest untested handler in the repository.

### 5. The delivery layer cannot execute under the unit suite — Medium, by design

`src/lib/sms.ts` is at 23.9% of statements and 22.9% of functions across 1,391 statements. `src/lib/email.ts` is at 14.3% and 25.0% across 1,132.

For SMS this is deliberate and well documented. `vitest.config.ts` sets an account SID and token but no sender, so `isSmsConfigured()` is false and all ~30 send functions short-circuit. `test/setup/no-provider-egress.ts` then blocks the provider hosts at the socket, and its header explains the reasoning at length. The safety property is real and worth keeping.

The consequence is still that the send paths are unverified. The setup file names the way out itself: assert on `buildSendRequest()`, which returns the URL, headers and body without touching the network. That function is testable today and is the cheapest way to convert this gap into coverage without weakening the guard.

### 6. Four modules are untested and unreachable — Low, but worth a decision

No file in `src`, `scripts`, `test` or `migrations` imports these:

| Lines | Module |
| --- | --- |
| 194 | `src/lib/subcontractor-tax-identity.ts` |
| 74 | `src/lib/location-context/census-geocoder.ts` |
| 8 | `src/lib/financing-calculator.ts` |
| 1 | `src/lib/ai-operator/revops-growth.ts` |

`subcontractor-tax-identity.ts` is the one to look at. It loads, saves and decrypts subcontractor TINs with envelope encryption, and `migrations/20260830190000_subcontractor_tax_vault.sql` ships the table it writes to. The crypto primitives it calls (`encryptTin`, `decryptTin` in `tax-vault-crypto.ts`) *are* tested, at 80.8%. The wiring above them is dead code. Either it is a half-built feature that should be finished and tested, or it should be deleted along with its migration — but it should not sit in the tree looking like a live compliance surface.

### 7. The posture sweeps are substring checks — Low, no current exploit

`api-route-posture-audit.test.ts` decides a route is guarded with `content.includes('requireAdmin')` and about forty similar substring tests. That would pass on an unused import, a commented-out call, or a guard whose result is never checked.

I tested the weakness rather than asserting it. Across all route files, exactly one names a guard it never calls: `src/app/auth/crew-callback/route.ts` mentions `requireCrewContext` in a comment. That route verifies an OTP token properly and is not a hole. **No route currently exploits the weakness.** The check is structurally weaker than it reads, and today it is telling the truth.

### 8. The staging suite cannot run in CI — Low

`vitest.staging.config.ts` requires a gitignored `.env.staging.local` and a live Supabase scratch project, and throws without one. Its four test files therefore never run in CI. This is deliberate, but it means a module can look tested while contributing nothing to the measured number — `src/lib/admin-search.ts` is imported and driven by `test-staging/admin-console.test.ts` and sits at 0% in the report.

## Where I would start

Ranked by risk removed per unit of work.

1. **Execute `resolveJobAccess` against a fake Supabase client.** Four assertions — valid, revoked, expired, unknown — cover the access control for the entire homeowner portal. This is an afternoon at most and it is the single highest-value test missing from the repository.
2. **Drive the 13 public and login server actions.** The pattern already exists in 22 test files; copy it. Start with `client/jobs/[token]`, `sub/[token]`, `login` and `field/login`.
3. **Raise `public-api/api-wrapper.ts` and `api-credentials.ts`.** They gate every external `/api/v1/` call and are the weakest security-relevant coverage measured.
4. **Test `purge-worker.ts`'s legal-hold branch and `getTableName`.** Small surface, irreversible consequences.
5. **Assert on `buildSendRequest()`** to cover the SMS send paths without touching the egress guard.
6. **Decide on the four orphans**, starting with the TIN vault.
7. **Add a second vitest config with a jsdom or happy-dom environment** for components and server actions, so the 297,820 unmeasured lines become visible. `vitest.config.ts` already anticipates this in a comment. Measuring first, then setting floors, is the right order.

Setting coverage thresholds now would lock in the current shape. The commented-out `thresholds` block in `vitest.config.ts` is worth enabling after items 1 through 5, not before.

## What I checked and did not find

No source file matching the coverage include globs was skipped by the report — the measurement is complete for its scope. No test file is silently excluded from the main suite by the `include` pattern. The suite has no skipped or todo tests: 15,123 tests, 15,123 passing. No route was found where a named guard is never invoked in a way that creates an actual hole.
