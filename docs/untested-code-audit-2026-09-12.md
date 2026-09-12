# Untested code audit — 2026-09-12

Scope: every file under `src/`. The question asked of each one is narrow and
answerable: **does anything in the test suite ever run this code?**

## How this was measured

Two independent passes, which agree with each other:

1. **Execution.** `npm run test:coverage` — the full suite, from a clean
   `npm ci`. 1,186 test files, 15,123 tests, **all passing**, 297s.
   V8 line coverage over the paths in `vitest.config.ts`.
2. **Reachability.** `npm run audit:untested` (added with this report) walks
   the import graph from every test file. A file no test can reach is untested
   no matter what a percentage says, and this pass covers the source that the
   coverage config never looks at.

Both passes classify a file three ways: **executed** by a test, **read as
source text** by a test but never run, or **untouched**.

## The headline

| | |
|---|---|
| Line coverage reported by the suite | 72.81% (125,172 of 171,908 statements) |
| Share of source lines the coverage config looks at | 44.6% (240,213 of 538,386) |
| Source files no test ever executes | 1,151 of 2,300 |
| Lines in those files | 231,502 |

The 72.81% is accurate for what it measures, and what it measures is
`src/lib`, `src/app/api` and `src/middleware.ts`. The other 298,173 source lines
are not at 0%; they are unmeasured, which reads the same in a report and is not
the same thing.

There is no honest single percentage across both halves — the unmeasured half
has no statement counts to average in. The file-level number is the one that
spans them: **half the files in `src/` are never run by a test.**

Code outside the coverage configuration entirely:

| Area | Files | Lines |
|---|---|---|
| App-local UI and helpers under `src/app` | 527 | 160,143 |
| Pages and layouts | 305 | 50,056 |
| Components | 208 | 45,327 |
| **Server actions** | **117** | **24,962** |
| `src/lib` excluded by config (barrels, generated catalogs, `.tsx`) | 61 | 15,928 |
| Email templates | 6 | 1,571 |

Pages and presentational components carrying no coverage number is a normal
trade for a node-environment suite. Server actions are not — they are the
mutation surface of the product.

## Finding 1 — the server-action surface is the largest gap

117 modules export Next.js server actions. They authenticate the caller, write
to the database and move money, and they are invoked straight from forms in the
browser. No coverage number exists for any of them, and:

- **75 of 117 are never executed by a test.** 37 of those are read as source
  text by a test and asserted on with `toContain`; 38 are not mentioned anywhere
  in the suite.
- 44 of the never-executed ones run their own database or Stripe calls rather
  than delegating to a tested `src/lib` module.

The largest single one is `src/app/dashboard/payments/actions.ts`: 973 lines,
29 exported actions, 23 database calls, 167 branches, zero executions. It
contains refund issuance, instant pay-link creation, payment-plan scheduling,
dispute-evidence assembly, lien-waiver generation and the Stripe Terminal
flow (connection tokens, payment intents, capture, cancel). Three test files
name it in a string literal, fourteen times between them; none of them run it.

Others worth naming, all never executed:

| File | Lines | Why it matters |
|---|---|---|
| `src/app/dashboard/crew/pay-actions.ts` | 443 | payroll amounts |
| `src/app/book/[subdomain]/actions.ts` | 349 | public booking intake, 130 branches |
| `src/app/field/jobs/[id]/actions.ts` | 271 | crew field mutations, service-role client |
| `src/app/dashboard/recurring/actions.ts` | 275 | recurring billing setup |
| `src/app/portal/view/[token]/actions.ts` | 122 | token-authenticated homeowner portal |
| `src/app/client/jobs/[token]/actions.ts` | 146 | token-authenticated client actions |
| `src/app/quick-stop/[id]/actions.ts` | 125 | public, service-role client |
| `src/app/login/actions.ts` | 44 | magic-link issuance |
| `src/app/recover-account/actions.ts` | 43 | account reactivation |

The token-authenticated ones are the sharpest edge: the signed token *is* the
authorization, there is no session behind it, and nothing pins the check.

## Finding 2 — 114 of 186 API route files never execute

`src/app/api` sits at 51.9% lines. Broken down:

| Area | Files | At 0% | Lines executed |
|---|---|---|---|
| `api/v1` (the public, customer-facing API) | 9 | 9 | 0.0% |
| `api/export` (tenant data egress) | 9 | 9 | 0.0% |
| `api/cron` | 52 | 45 | 12.5% |
| `api/twilio` | 4 | 4 | 0.0% |
| `api/stripe` | 6 | 3 | 87.6% |
| `api/voice` | 15 | 3 | 67.0% |

Two of those rows are less alarming than they look, and saying so is part of the
audit. The three uncovered `api/stripe` webhook routes are six lines each —
they delegate to `src/lib/billing/*`, which is tested at 81%. The four
`api/twilio` routes are one-line re-exports. Wiring that thin fails visibly.

The other rows are real:

- **`api/v1`, 553 lines, nothing executed.** This is the published API that
  customers integrate against — lead list and detail, lead creation, webhook
  subscription CRUD, delivery retry, `/me`, the OpenAPI document. Pagination,
  cursor handling, status filtering and tenant scoping are written inline in
  the handlers. The shared `publicApiRoute` wrapper *is* tested
  (`test/public-api/`); what sits inside each handler is not.
- **`api/export`, 193 lines, nothing executed** — and `src/lib/data-export.ts`,
  which builds the CSVs, is also at 0%. The whole "download everything in this
  account" path is unexercised end to end. Tenant scoping in the builders looks
  correct on reading; nothing holds it there.

## Finding 3 — 17 scheduled cron jobs are dark end to end

For these jobs, neither the route nor the worker it calls is meaningfully
executed. They run in production on `vercel.json`'s schedule, unattended, and
mostly against the service-role client.

| Job | Worker | Worker lines executed |
|---|---|---|
| `geocode-backfill` | `src/lib/geocode-sweep.ts` | 0.0% |
| `google-lsa-sync` | `src/lib/google-lsa/sync.ts` | 0.0% |
| `purge-expired` | `src/lib/purge-worker.ts` | 0.0% |
| `quick-stop-sweep` | `src/lib/quick-stop-sweep.ts` | 0.0% |
| `service-reminders` | `src/lib/warranty-sweep.ts` | 0.0% |
| `blog` | `src/lib/blog-generate.ts` | 1.7% |
| `daily-digest` | `src/lib/daily-digest.ts` | 1.9% |
| `appointment-reminders` | `src/lib/reminders.ts` | 8.8% |
| `weather-morning-alert` | `src/lib/weather-morning-alert.ts` | 10.8% |
| `arrival-confirm` | `src/lib/arrival-sweep.ts` | 12.4% |
| `arrival-late` | `src/lib/arrival-sweep.ts` | 12.4% |
| `plan-installments` | `src/lib/payment-plans.ts` | 12.4% |
| `waitlist-sweep` | `src/lib/cancellation-waitlist-data.ts` | 13.3% |
| `recurring` | `src/lib/recurring.ts` | 18.3% |
| `smart-dunning` | `src/lib/ai-operator/smart-dunning.ts` | 26.9% |
| `quickbooks-sync` | `src/lib/quickbooks/sync.ts` | 29.6% |
| `operator-briefing` | `src/lib/ai-operator/engine.ts` | 39.6% |

`purge-expired` deletes. `plan-installments` and `smart-dunning` charge.
`appointment-reminders`, `service-reminders` and `weather-morning-alert` send
to customers. `test/cron-jobs.test.ts` does good work holding the registry,
`vercel.json` and the route files in agreement — but agreeing on a schedule is
not the same as running the job.

## Finding 4 — imported does not mean exercised

101 files are imported by a test and execute under 40% of their lines. These
are more dangerous than the files at 0%, because a file list or a dependency
scan shows them as covered. The worst by unexecuted volume:

| File | Lines executed | Unexecuted lines |
|---|---|---|
| `src/lib/sms.ts` | 23.9% | 1,059 |
| `src/lib/email.ts` | 14.3% | 970 |
| `src/lib/google-ads-api.ts` | 39.1% | 753 |
| `src/lib/crew-pay-data.ts` | 4.8% | 592 |
| `src/lib/jobs.ts` | 38.8% | 539 |
| `src/lib/job-feed.ts` | 7.7% | 525 |
| `src/lib/google-ads-verifier.ts` | 0.8% | 517 |
| `src/lib/recurring.ts` | 18.3% | 506 |
| `src/lib/client-portal-data.ts` | 15.3% | 503 |
| `src/lib/selections-data.ts` | 15.8% | 433 |
| `src/lib/reviews.ts` | 5.3% | 430 |
| `src/lib/payment-plans.ts` | 12.4% | 389 |
| `src/lib/property-passport-data.ts` | 0.3% | 357 |
| `src/lib/milestones-data.ts` | 1.1% | 262 |

`src/lib/sms.ts` is imported from 62 places in `src/` and `src/lib/email.ts`
from 51; between them they have 2,029 unexecuted lines. Much of that is message
composition — the copy that reaches homeowners. `crew-pay-data.ts` at 4.8% with
7% of its functions ever called is payroll arithmetic.

Part of this is deliberate and good: `test/setup/no-provider-egress.ts` blocks
the socket to every SMS provider, and the vitest env deliberately omits a sender
so `isSmsConfigured()` stays false. That stops the suite from sending. It also
means the send paths never run, and nothing currently substitutes for them.

## Finding 5 — a large slice of the suite asserts on source text, not behavior

487 of the 1,186 test files call `readFileSync` on a source file. For **248 of
them the source text is all there is** — they import no application module at
all, and assert that a string appears in a file.

This is not worthless — `test/cron-jobs.test.ts` catches a deleted cron route
this way, and several security suites — `cash-flow-actions-security`,
`database-acl-security`, `security-penetration-testing` — read a source file to
pin a pattern that must or must not appear in it. It is
worth being precise about what it buys: 316 source files are read as text by a
test and never executed. A rename satisfies these tests. So does a correct
string in an unreachable branch.

The risk is not that the technique exists; it is that the count of passing tests
reads as behavioral verification when a fifth of it is not.

## Finding 6 — most verification suites do not run in CI

`.github/workflows/ci.yml` runs `npm test`, five targeted scripts, typecheck,
lint and build. `package.json` defines 76 test and verification scripts.
**70 of them never run automatically**, including:

- the entire `vitest.pg17.config.ts` suite (`test:pg17:late-success`)
- the entire `test-staging/` suite — admin console, field-app RLS,
  marketing-flow transactions
- ~40 `scripts/verify-*.mjs` database checks covering overage settlement,
  refund reconciliation, capacity lifecycle, tenant isolation, SMS campaign
  boundaries and voice provisioning

The database story is thinner than the migration count suggests. CI does stand
up a real PostgreSQL 17: `test:pg17:job-access` loads `schema.sql` and
`test:pg17:closure-domains` builds from migrations, and between them they
execute **9 of the 359 files in `migrations/`**. 107 migrations are named
somewhere in a test; the other 252 are not mentioned at all. In the main suite,
exactly one test executes SQL against a real engine — every other migration
test asserts on the text of the `.sql` file.

These suites were written, and they work. They just are not load-bearing,
because nothing runs them on a pull request.

## Finding 7 — 111 unreferenced files, 17,463 lines

Files under `src/` that nothing imports and that are not a framework entrypoint.
38 are also untested, so they are simply dark. The rest have tests and no
callers, which is the more misleading shape — the tests pass, the code is not
reachable from the app.

The clearest case: `src/lib/billing/direct-checkout-operation.ts`, 1,144 lines,
with a dedicated test file. Its only export, `orchestrateOneOffDirectCheckout`, is referenced
nowhere in `src/`. Three sibling billing modules are in the same state
(`connected-checkout-expiration-projector.ts` 726 lines,
`direct-refund-operation.ts` 685, `direct-checkout-late-success-operator-resolution.ts` 570).
`src/lib/admin-manual/index.ts` still cites `src/lib/direct-checkout-operation.ts`
at its pre-move path, which suggests the move left references behind.

Either these are the live implementation and something is mis-wired, or they are
superseded and should go. Both answers are worth knowing before launch.

## What is genuinely solid

Worth stating plainly, because the findings above are one-sided:

- 15,123 tests pass. Nothing is red, nothing is flaky in this run.
- There are **no skipped or `todo` tests** in the suite. Three `it.skipIf`
  guards, nothing else. Nobody has been parking failures.
- `src/lib/billing` 81.0%, `src/lib/voice` 84.9%, `src/lib/permit-intel` 87.9%,
  `src/app/api/stripe/webhook/route.ts` 87.6%, `src/middleware.ts` 79.3%. The
  money rails and the request gate are the best-covered code in the repository.
- The suite is fast (297s including coverage) and hermetic — provider egress is
  blocked at the socket, and the SMS sender is deliberately absent from the test
  env so nothing can send by accident.

## Recommended order of work

1. **Cover the token-authenticated server actions** —
   `client/jobs/[token]`, `portal/view/[token]`, `sub/[token]`,
   `schedule/[token]`, `review/[token]`, `quick-stop/[id]`. Each is small and
   each is an authorization boundary with no session behind it. Highest risk per
   line of test written.
2. **Add `src/app/**/*.ts` to `coverage.include`** so server actions carry a
   number at all. The percentage will drop. It will be a true one.
3. **`api/v1` and `api/export`.** Public API contract and tenant data egress,
   zero executions between them, and both already have a tested wrapper to build
   on.
4. **Split `src/app/dashboard/payments/actions.ts`.** 973 lines and 29 actions
   is too large to test as a unit; move the refund, pay-link, payment-plan and
   Terminal logic into `src/lib` where the existing billing tests live.
5. **Put the pg17 and staging suites in CI**, or delete them. A verification
   script nobody runs is worse than none, because it reads as covered.
6. **The 17 dark cron jobs**, starting with `purge-expired` (deletes),
   `plan-installments` and `smart-dunning` (charge).
7. **Resolve the 111 unreferenced files.** Deleting dead code is the cheapest
   way to raise real coverage, and the four orphaned billing modules need an
   answer either way.
8. **Set coverage thresholds** once the scope in (2) is fixed, using the
   commented-out block already in `vitest.config.ts`. Floors prevent the slide;
   a number without a floor only records it.

## Closed since this audit

**Step 1 is done.** The token-authenticated server actions now have tests: 129
of them across five files, covering `client/jobs/[token]` (the action module
plus its selection, change-order and form siblings), `portal/view/[token]`,
`sub/[token]`, `schedule/[token]`, `review/[token]` and `quick-stop/[id]`, and
`resolveJobAccess` itself — the resolver all four client-job modules depend on,
which was at 2.17%.

The reachability pass moves accordingly: server actions go from 42 executed to
51, and from 38 untouched to 29. What the tests assert is the boundary rather
than the happy path — that an action refuses a revoked or expired link before
writing, that account and job scope come from the resolved access and never
from posted fields, that a rate limit is checked first, and that a failed
request does not revalidate a page.

Writing them turned up one defect, now fixed. `selectScheduleOptionAction` and
`selectClientJobScheduleOptionAction` validated the chosen slot with
`Number(formData.get('optionIndex'))`, and `Number(null)` is `0`. A request
omitting the field entirely passed the guard and booked the first offered slot,
which the contractor then saw as a choice the customer had made. The page posts
the value in a hidden input, so the normal UI never hit it; a server action is
reachable by anyone holding the link, which is the case the guard existed for.
Both now reject an absent or blank field before coercion.

**Step 2 is done.** `coverage.include` now takes `src/app/**/*.ts` rather than
only `src/app/api/**`, so all 117 server-action modules are measured. The
reported figure moved from 72.81% to 67.27% (132,438 of 196,855 statements): the denominator gained
roughly 25,000 statements nobody was counting, and nothing stopped being
tested. Pages and components are `.tsx` and still carry no number, since this
suite runs in a node environment; covering them needs a second config with a
DOM environment.

**Step 3 is done.** 156 tests across two files. All nine route files under
`api/v1` and eight of the nine under `api/export`, plus `src/lib/data-export.ts`
which builds the CSVs. The `api/v1` wrapper was already tested, so these stand
it down to a pass-through and hold what each handler alone decides: every read
and write narrows to the token's workspace and no query string or request body
can redirect it; the cursor contract is the documented one; the webhook signing
secret is returned once at creation, stored only encrypted, and selected back
by no projection; and a delivery retry answers a byte-identical 404 whether the
delivery is missing, another workspace's, or simply not retryable. For the
exports the rule is blunter: no owner context, no bytes, with `reports.read`
required for the expenses ledger.

Two of those assertions started out wrong and the code was right, so they now
pin the rules as written. `PATCH /v1/leads` refuses a direct transition to
`won`, because a lead becomes won by converting a quote or completing a job
rather than by an integration setting a string. The OpenAPI document carries
the `lgq_live_` prefix deliberately, as the token format an integrator needs.

`api/export/insights` is the one export route still uncovered; it renders
through pdfkit and needs its own fixture.

The reachability pass across all of this work: files no test executes fall from
1,151 to 1,121 of 2,300, server actions from 75 never-executed to 66, and route
handlers from 74 executed to 91.

Steps 4 through 8 below are open.

## Reproducing this

```
npm run test:coverage        # execution data -> coverage/
npm run audit:untested       # reachability, all of src/
node scripts/audit-untested-code.mjs --coverage   # both, plus the <40% list
```

## Appendix A — server actions no test executes (75)

```
src/app/admin/accounts/actions.ts
src/app/admin/actions.ts
src/app/admin/cases/[id]/actions.ts
src/app/admin/cases/new/actions.ts
src/app/admin/health/actions.ts
src/app/admin/incidents/actions.ts
src/app/admin/manual/actions.ts
src/app/admin/payments/[id]/actions.ts
src/app/admin/privacy-requests/actions.ts
src/app/admin/quick-stops/[id]/actions.ts
src/app/admin/risk/actions.ts
src/app/admin/staff/actions.ts
src/app/admin/voice/numbers/actions.ts
src/app/book/[subdomain]/actions.ts
src/app/client/jobs/[token]/actions.ts
src/app/client/jobs/[token]/change-order-actions.ts
src/app/client/jobs/[token]/form-actions.ts
src/app/client/jobs/[token]/selection-actions.ts
src/app/dashboard/cash-flow/actions.ts
src/app/dashboard/claims/actions.ts
src/app/dashboard/clients/[id]/portal-actions.ts
src/app/dashboard/clients/actions.ts
src/app/dashboard/crew/pay-actions.ts
src/app/dashboard/crew/settings-actions.ts
src/app/dashboard/forms/actions.ts
src/app/dashboard/help/actions.ts
src/app/dashboard/import/actions.ts
src/app/dashboard/jobs/[id]/arrival-actions.ts
src/app/dashboard/jobs/[id]/change-order-actions.ts
src/app/dashboard/jobs/[id]/form-actions.ts
src/app/dashboard/jobs/[id]/milestone-actions.ts
src/app/dashboard/jobs/[id]/selection-actions.ts
src/app/dashboard/jobs/[id]/warranty-actions.ts
src/app/dashboard/jobs/import-invoices/actions.ts
src/app/dashboard/jobs/import/actions.ts
src/app/dashboard/jobs/invoices-actions.ts
src/app/dashboard/jobs/payments-actions.ts
src/app/dashboard/marketing/ads/halo-actions.ts
src/app/dashboard/marketing/blog/actions.ts
src/app/dashboard/marketing/links/actions.ts
src/app/dashboard/marketing/referrals/actions.ts
src/app/dashboard/messages/dedicated-number/actions.ts
src/app/dashboard/payments/actions.ts
src/app/dashboard/rebook/actions.ts
src/app/dashboard/recurring/actions.ts
src/app/dashboard/reviews/actions.ts
src/app/dashboard/schedule/actions.ts
src/app/dashboard/schedule/plan/offer-actions.ts
src/app/dashboard/schedule/plan/reschedule-actions.ts
src/app/dashboard/schedule/weather-actions.ts
src/app/dashboard/services/actions.ts
src/app/dashboard/services/import/actions.ts
src/app/dashboard/settings/developer-api-actions.ts
src/app/dashboard/settings/financing-actions.ts
src/app/dashboard/settings/merchant-actions.ts
src/app/dashboard/stripe-actions.ts
src/app/dashboard/trash/actions.ts
src/app/field/choose/actions.ts
src/app/field/jobs/[id]/actions.ts
src/app/field/jobs/[id]/change-order-actions.ts
src/app/field/jobs/[id]/form-actions.ts
src/app/field/jobs/[id]/milestone-actions.ts
src/app/field/login/actions.ts
src/app/field/push-actions.ts
src/app/login/actions.ts
src/app/portal/[subdomain]/actions.ts
src/app/portal/global-actions.ts
src/app/portal/view/[token]/actions.ts
src/app/quick-stop/[id]/actions.ts
src/app/recover-account/actions.ts
src/app/review/[token]/actions.ts
src/app/schedule/[token]/actions.ts
src/app/sub/[token]/actions.ts
src/app/unsubscribe/actions.ts
src/app/welcome/seed-actions.ts
```

## Appendix B — `src/lib` modules at 0% lines executed (61 with executable code)

Ordered by size. Thirteen further `types.ts` modules report 0% because they hold
no executable lines; they are not listed.

```
342L  src/lib/google-lsa/sync.ts
300L  src/lib/estimate-offers-data.ts
243L  src/lib/reschedule-offers-data.ts
213L  src/lib/demo-focus.ts
194L  src/lib/receivables-data.ts
186L  src/lib/admin-closures.ts
186L  src/lib/admin-search.ts
157L  src/lib/admin-overage.ts
142L  src/lib/admin-google-lsa.ts
133L  src/lib/subcontractor-tax-identity.ts
123L  src/lib/admin-public-api.ts
119L  src/lib/crew-pay-view.ts
116L  src/lib/purge-worker.ts
113L  src/lib/quote-options-data.ts
110L  src/lib/admin-risk.ts
109L  src/lib/job-detail.ts
108L  src/lib/client-media-frames.ts
101L  src/lib/quick-stop-sweep.ts
101L  src/lib/reschedule-offers.ts
 93L  src/lib/demo-analytics.ts
 91L  src/lib/data-export.ts
 89L  src/lib/google-lsa/lead-detail.ts
 83L  src/lib/lead-detail.ts
 82L  src/lib/admin-command-center.ts
 82L  src/lib/crew-rows.ts
 81L  src/lib/tile-png.ts
 73L  src/lib/warranty-sweep.ts
 71L  src/lib/smart-import-ai.ts
 70L  src/lib/dispute-evidence.ts
 67L  src/lib/location-context/census-geocoder.ts
 66L  src/lib/admin-messages.ts
 65L  src/lib/admin-quick-stops.ts
 65L  src/lib/client-question.ts
 64L  src/lib/day-plan-prefs.ts
 63L  src/lib/client-import-ai.ts
 62L  src/lib/site-images.ts
 55L  src/lib/field-offline-client.ts
 55L  src/lib/google-maps-loader.ts
 54L  src/lib/quickbooks.ts
 45L  src/lib/quick-stop-zones-data.ts
 39L  src/lib/client-rows.ts
 39L  src/lib/templates/fonts.ts
 38L  src/lib/account-notes.ts
 36L  src/lib/crew-job-status.ts
 33L  src/lib/geocode-sweep.ts
 31L  src/lib/insurance-client.ts
 30L  src/lib/home-faqs.ts
 30L  src/lib/smart-import-run.ts
 29L  src/lib/arrival-analytics-data.ts
 29L  src/lib/legal/site-legal.ts
 26L  src/lib/client-images.ts
 23L  src/lib/message-templates.ts
 18L  src/lib/read-import-file.ts
 17L  src/lib/templates/social-icons.data.ts
 15L  src/lib/data-export-sets.ts
 15L  src/lib/risk-reviews.ts
 15L  src/lib/public-api/types.ts
  8L  src/lib/client-duplicates-data.ts
  1L  src/lib/crew-add-state.ts
  1L  src/lib/financing-calculator.ts
  1L  src/lib/ai-operator/revops-growth.ts
```

## Appendix C — route handlers at 0% lines executed

114 of 186 files under `src/app/api`. A further 9 route handlers live elsewhere
under `src/app` (`auth/signout`, `auth/crew-verify-phone`, `client/portal`,
`r/[code]`, `review/[token]/google`, and the four site robots/sitemap routes);
those sit outside the coverage scope, and the reachability pass finds no test
importing any of them. The measured list is regenerable:

```
npm run test:coverage
node -e "const s=require('./coverage/coverage-summary.json');
for (const [f,v] of Object.entries(s))
  if (v.lines && v.lines.covered === 0 && v.lines.total > 0 && f.includes('/api/'))
    console.log(v.lines.total + 'L', f.replace(process.cwd()+'/',''));"
```

The groups: all 9 `api/v1` files, all 9 `api/export` files, 45 of 52 `api/cron`
routes, all 4 `api/twilio` routes (one-line re-exports), the three delegating
`api/stripe` webhook routes, and 44 others spread across `api/property-passports`,
`api/quickbooks`, `api/google-lsa`, `api/lead-photos`, `api/job-photos`,
`api/search`, `api/payroll` and `api/field`.
