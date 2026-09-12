# Security & Operations Audit (second pass)
Date: 2026-09-12
Companion to `docs/security-audit-2026-09-12.md`, which covered authentication, tenant isolation, injection, SSRF, secrets and dependencies. This pass deliberately covers different ground: authorization failure *modes*, scheduled-job coverage, outbound resilience, caching, configuration parity and supply-chain currency.

## Executive Summary

One defect was found and fixed: every dashboard guard that denies by redirecting was being swallowed by the surrounding `try/catch`, so a permission denial reached the caller as **HTTP 500 with the body `{"error":"NEXT_REDIRECT"}`**. Twenty call sites were affected. It is not an authorization bypass — the protected work never runs — but it converts routine denials into server errors, which corrupts error-rate alerting and leaves clients unable to distinguish "you may not do this" from "the server broke."

The most significant finding was operational: **four cron routes existed, wired to `cronRoute`, neither scheduled nor monitored.** They never executed in production and nothing reported them missing. One of them, `smart-dunning`, is advertised in the product feature catalog as automatic failed-payment recovery. **All four are now scheduled and registered**, and a test locks the invariant so a fifth cannot appear the same way. Production acceptance then found that neither `smart-dunning` nor `activation-autopilot` has an outbound dispatcher at all, correcting a claim made in this report — see the correction under finding 2.

Everything else checked in this pass held up, including several things that looked like findings and turned out to be sound designs.

## Fixed in this change

### 1. Guard redirects swallowed into HTTP 500 — Medium

The dashboard guards (`requireOwnerContext`, `requireOfficeContext`, `requireOfficeContextAny`, `requireMfaPermission`, `requireDashboardShellContext`) deny by calling Next's `redirect()`, which throws rather than returns. Measured on the installed Next 15.5.24:

```
message: "NEXT_REDIRECT"
digest : "NEXT_REDIRECT;replace;/office-access;307;"
```

Twenty handlers call a guard as the first statement inside a `try`, and every one of their `catch` blocks treated that throw as an application error. No site in the repository handled it.

Confirmed by executing the real handler. An office user without `payments.collect` calling the Stripe Terminal connection-token route received:

```
STATUS: 500   BODY: {"error":"NEXT_REDIRECT"}
```

This is **not** a privilege escalation. The throw happens at the guard line, so control jumps straight to `catch` and none of the protected work below it runs. What it costs is elsewhere:

- **Alerting.** Routine permission denials are logged and returned as 500s, so a real fault is indistinguishable from an employee opening a page they do not have.
- **Client behaviour.** Callers get 500 instead of a redirect or a 401/403, so the UI cannot handle denial as denial.
- **Server actions.** Eight of the twenty are server actions, where the swallowed redirect means the intended navigation never happens and the user is left in place with a generic failure string.
- **Minor disclosure.** The internal control token `NEXT_REDIRECT` is returned to the caller.

Fixed with Next's own `unstable_rethrow`, which rethrows framework control-flow errors and returns for everything else, applied as the first statement of each affected `catch`. Three regression tests added in `test/guard-redirect-propagation.test.ts`, two of which fail against the previous code; the third asserts that a genuine error is still caught and reported rather than rethrown, so the fix stays surgical.

Fifteen test files mock `next/navigation` and now also mock `unstable_rethrow` with the real digest-based semantics, so the mocks continue to match the module surface.

## Findings reported open, since resolved

### 2. Four cron routes never run and are never missed — Medium — **RESOLVED**

`vercel.json` schedules 48 cron paths. `CRON_JOBS` in `src/lib/cron-jobs.ts`, which drives `/admin/health` and the independent GitHub Actions watchdog, registers the same 48. The two agree exactly.

Four cron routes exist outside both sets:

| Route | Sweep | Scheduled | Health-monitored |
|---|---|---|---|
| `/api/cron/smart-dunning` | `runSmartDunningSweep` | no | no |
| `/api/cron/webhook-heal` | `runWebhookAutoHealer` | no | no |
| `/api/cron/db-guard` | `runDatabasePoolGuard` | no | no |
| `/api/cron/activation-autopilot` | `runActivationAutopilotSweep` | no | no |

Each sweep has exactly one caller — its own route — and no scheduled job fans out to any of them. There is no second scheduler: the only GitHub Actions cron is the health watchdog, which reads `CRON_JOBS` and therefore cannot report an absence it does not know about. The result is four jobs that are silently inert.

`smart-dunning` is the one with a product claim attached. `src/lib/all-features-catalog.ts` lists it as "Smart Dunning & Failed Payment Recovery," describing automatic retry for soft card declines and an automated SMS card-update link. That sweep does not run.

**Resolved, on the owner's instruction.** This was originally left alone because scheduling these switches on background jobs that send SMS and email and touch billing state against live contractors and homeowners. That call was put to the product owner, who asked for all findings fixed, so all four are now scheduled and registered:

| Job | Cadence | Why that cadence |
|---|---|---|
| `db-guard` | `*/5 * * * *` | A pool guard is worthless if it notices an exhausted pool late. |
| `webhook-heal` | `*/15 * * * *` | Matches the other reconcile sweeps already on that cadence. |
| `smart-dunning` | `0 * * * *` | Hourly is frequent enough to recover a decline, infrequent enough not to hammer a customer's card. |
| `activation-autopilot` | `0 15 * * *` | Daily, mid-morning US, because these are nudges and more than one a day is spam. |

**CORRECTION (2026-09-12, after production acceptance).** The sentence that stood here claimed these four now have live side effects — that `smart-dunning` texts customers whose cards were declined and `activation-autopilot` nudges stalled contractors. **That was wrong.** Neither worker has an outbound dispatcher. Both say so in their own source:

- `smart-dunning.ts` pushes `"Card update dispatcher not configured; no prompt sent."` for every payment needing a card-update prompt.
- `activation-nudge.ts` carries the comment *"No SMS or email sender reads this table, so a successful write still is not a message delivered to a contractor"*, and `recordNudge` pushes `"Delivery dispatcher not configured; no outbound message sent."` and returns false.

The claim came from the feature-catalog copy and the workers' own `reasoningSummary` strings, which use the word "dispatched". Neither worker body was read before the claim was made. `smart-dunning` does change real state — retry dates and grace periods — but it sends nothing, and `activation-autopilot` neither sends nor records.

So the warning attached to scheduling these, repeated several times, was unfounded: switching them on did not put messages in front of customers or contractors. What it did switch on is a job that cannot do the thing it is scheduled for.

**A second defect, found in the same acceptance pass.** All four routes returned a hardcoded `ok: true` and dropped the worker's `errors` array, so `cronSummaryHasFailures` had nothing to match and every run recorded healthy regardless. For the two workers above that meant green forever while delivering nothing; for `db-guard` and `webhook-heal` it means their observed "successful" runs do not establish that they were error-free either. Fixed: each route now returns `ok: result.errors.length === 0` alongside an `errors` count and up to five samples, and `test/cron-summary-surfaces-errors.test.ts` holds the coupling to the matcher.

**Consequence worth stating plainly:** with the summary honest, `smart-dunning` and `activation-autopilot` will record FAILED on any run where an item needed a message, because that is what the worker reports. They will keep doing so until a dispatcher exists or the jobs are unscheduled. That is the accurate signal, but it is a behaviour change for alerting.

**THIRD CORRECTION: two of the four should not have been scheduled at all.** Scoping the dispatcher decision turned up a conflict the original finding missed, and it is a regression this audit introduced.

`smart-dunning` is not a job waiting for a dispatcher. It duplicates `/api/cron/dunning`, which is already scheduled, already registered, already charges saved cards, and already sends the card-update prompt via `sendCardUpdateSms` — the exact thing the feature catalog advertises and that this report said was missing. Worse, the two overlap destructively:

- `smart-dunning`'s candidate query is `getPaymentsNeedingAttention`, which selects `dunning_state IN ('needs_card', 'exhausted')` — the two **terminal** states `dunning.ts` sets together with `next_retry_at: null` precisely to stop retrying.
- It then writes a fresh `next_retry_at` onto exactly those rows, hourly.
- `decline_code` is not in that query's select list, so the value is always undefined and every row falls to the default branch: `now + 48h`, whatever the card actually did.

The blast radius is contained but real. No wrongful charge occurs, because `dunning.ts`'s sweep also requires `dunning_state = 'scheduled'` and `smart-dunning` never writes that column. What does occur is terminal payments carrying a rolling `next_retry_at` that should be null, and `getPaymentsNeedingAttention` feeds that field to the admin command center and the operator briefing — so operators see a "next retry" on payments that will never be retried, while `retriesOptimized` counts the write as work done.

`activation-autopilot` has a simpler problem: no path to success at all. `recordNudge` returns false before writing, because `contractor_onboarding_nudges` does not exist in production, and nothing reads that table even when a write succeeds.

**Both are now unscheduled and parked**, in `PARKED_CRON_ROUTES` with the reason above, because parking them silently is the original bug. `test/cron-route-coverage.test.ts` now asserts the weaker but honest invariant: every route on disk is either scheduled and health-registered, or listed as parked with a substantive reason, and never both. Fifty routes live and watched, two parked, none unaccounted for.

The lesson for the original finding stands inverted: "four jobs are scheduled nowhere" was correct as an observation, and "therefore schedule them" was the wrong inference for half of them. Two were inert because they were unfinished, and one of those was inert for a good reason.

### 3. Outbound calls without timeouts — Low — **RESOLVED**

Twenty outbound `fetch` calls across eight server-side modules set neither `signal` nor `AbortSignal.timeout`. The largest concentration is `src/lib/google-ads-verifier.ts` (12 calls), which is reached from `/api/admin/verify-google-ads`, so a hung upstream ties up the request. The others are `meta-lead-ads`, `payroll-api-integration`, `voice-call-bridge`, `job-access-fetch`, `ai-operator/approval-bridge` (2), `ai-operator/support-auto-responder` and `ai-operator/digest`.

The codebase already had the right pattern in two places: `noStoreFetch` in `supabase-admin.ts` defaults to `AbortSignal.timeout(15000)`, and `fetchProxyImage` uses a deadline spanning all redirect hops. The gap was consistency, not knowledge.

**Resolved.** Nineteen calls across seven modules now carry `AbortSignal.timeout(OUTBOUND_TIMEOUT_MS)` at ten seconds. The twentieth, in `job-access-fetch.ts`, was left alone on inspection: it is a pass-through wrapper for the Supabase client that forwards the caller's `init` unchanged, and its callers already set a timeout through `noStoreFetch`.

### 4. Dependency currency — Low — **PARTLY RESOLVED**

Fifteen packages are a major version behind, including `next` 15.5.24 → 16.3.5 and `react`/`react-dom` 18.3.1 → 19.3.0, with `eslint` 8 → 10 and `@vitest/coverage-v8` 2 → 5 alongside them.

No security exposure today: `npm audit --omit=dev` reports zero vulnerabilities at every severity, before and after. This is maintenance debt rather than a finding, but a framework a major behind is where security patches eventually stop arriving.

**Partly resolved.** Every update available *within* the current major ranges was taken — fourteen declared packages including `next` 15.5.24 → 15.5.25, `@supabase/supabase-js` 2.110.5 → 2.116.0, `pg`, `playwright` and the icon sets. The full suite and the linter pass on them.

Worth stating plainly, because "within range" understates it: sixteen packages moved a MAJOR version transitively, the whole `@typescript-eslint` family 7.18 → 8.70 among them. All sixteen are dev and lint toolchain; no production runtime dependency changed major. That bump did surface one real break — typescript-eslint 8 removed the `ban-types` rule, so an `eslint-disable-next-line` in `src/lib/tenant-audit.ts` referenced a rule that no longer exists and failed the lint. Repointed at its replacement, `no-empty-object-type`.

`stripe` was deliberately held at 22.3.1. The 22.6.2 bump moves the SDK's pinned Stripe API version from `2026-06-24.dahlia` to `2026-08-26.dahlia`, which the typecheck caught immediately. Changing the API version a live payments integration talks to is a payments change, not a dependency refresh — this repository has a dedicated `upgrade-stripe` procedure for exactly that reason. The lockfile holds 22.3.1 while `package.json` keeps its `^22.3.1` range, so nothing about the declared policy changed.

**The majors are not done and should be planned separately.** `next` 16 and `react` 19 are a migration, not a bump: thirteen components use `useFormState`, which React 19 removed in favour of `useActionState`, and that is only the part visible from a grep. Folding a framework migration into a security PR would make both harder to review and harder to revert. The remaining majors are `next`, `react`, `react-dom`, their `@types`, `react-test-renderer`, `eslint` 8 → 10, `eslint-config-next`, `@vitest/coverage-v8` 2 → 5, `@noble/hashes` 1 → 2 and `embedded-postgres`.

One incidental repair came out of this: `package.json` carried a duplicate `test:pg17:job-access` key, which every build warned about. npm's rewrite collapsed it. Both values pointed at the same checks — the shorter script is a shim that imports the longer one — so nothing was lost.

### 5. Client IP derived from a spoofable header — Informational — **RESOLVED**

`clientIpFrom` in `src/lib/rate-limit.ts` takes the first hop of `x-forwarded-for`, which is the conventional client IP but is also a header a client can send. Vercel exposes `x-vercel-forwarded-for`, which the platform sets and a client cannot forge.

Recorded as informational rather than as a finding because it was an existing documented decision: `docs/audit-gap-sweep-2026-08-30.md` describes the helper and its keying explicitly.

**Resolved.** `clientIpFrom` now prefers `x-vercel-forwarded-for`, falling back to `x-forwarded-for` and then `x-real-ip`, so a caller cannot rotate a header to mint themselves a fresh rate-limit bucket. The fallbacks keep behaviour identical anywhere the platform header is absent.

## What held up

Several of these looked like findings on first read and did not survive checking.

**Storage paths.** Uploads build `${accountId}/${randomUUID()}-${safeName}.${extension}` with the name lowercased and stripped to `[a-z0-9-]` and the extension stripped to `[a-z0-9]`, so a crafted filename cannot traverse. The one path that interpolates a raw `file.name` takes it from the storage API's own listing of that account's prefix, not from an upload. The permits document path sanitizes the address to `[a-zA-Z0-9_]` and validates the job id as a UUID first.

**The lead photo proxy.** This takes an arbitrary `url` parameter from any authenticated user, which reads as an open proxy. It is not: `isAllowedProxyUrl` requires the hostname to match the project's own configured Supabase host exactly, with wildcard `*.supabase.co` explicitly rejected so other Supabase tenants cannot act as relays. The private-IP and metadata blocklist runs ahead of that allowlist as belt and braces, every redirect hop is revalidated, redirects are capped at three, the operation carries an 8-second deadline across all hops, and both content type and size are enforced. It also does not share the IPv4-mapped IPv6 defect fixed in the webhook guard, because the allowlist makes the IP checks unreachable for a hostile host.

**Rate limiting.** `check_rate_limit` is a single `INSERT … ON CONFLICT DO UPDATE … RETURNING`, so the count and the window roll atomically with no read-then-write race. The split between `checkRateLimit` (fail-open, for revenue paths) and `checkRateLimitStrict` (fail-closed, for toll-fraud surfaces) is deliberate, documented and regression-tested.

**Webhook replay.** All four inbound webhooks checked — SMS inbound, SMS status, Resend and Printful — carry dedupe or event-inbox handling.

**Configuration parity.** Of 150 environment variables read by the code, the only four absent from `.env.example` are `NODE_ENV`, `VERCEL_ENV`, `VERCEL_URL` and `VITEST`, all platform-provided. Nothing the operator must set is undocumented.

**Caching.** No API route serves tenant data with a public cache header. The two that set one are the OpenAPI document and the photo proxy, whose response is a pure function of its `url` parameter. No `force-static` or `revalidate` on any dashboard or admin page.

**Office capability model.** `requireOfficeContext` throws rather than admitting anyone when called with no capabilities, uses an owner sentinel that answers true to every key rather than duplicating the catalog, and falls back to the user's own first permitted page so a denial cannot ping-pong between two pages that both reject them.

**Logging.** No credential, token or PII value is written to a log. The matches for those patterns are all "secret not configured" warnings.

**Injection and pollution.** The FAQ highlighter escapes regex metacharacters before building its pattern, so there is no regex injection or ReDoS from search input. The audit-payload sanitizer walks with `Object.entries` onto a fresh object and is serialized with `JSON.stringify`, which ignores a polluted prototype.

**CORS.** No `Access-Control-Allow-Origin` anywhere; everything stays same-origin.

## Verification

```
npx tsc --noEmit -p tsconfig.test.json     exit 0
npx vitest run                              1181 files, 15090 tests, all passed
test/guard-redirect-propagation             3 passed  (2 fail without the fix)
```

Re-verified after the follow-up fixes; see the launch checklist entry for the final counts.
