# Security Audit
Date: 2026-09-12
Scope: full application — 2,296 TypeScript/TSX files, 186 API route handlers, 117 server-action modules, 240 database tables, 135 RLS policies.

## Executive Summary

One confirmed exploitable vulnerability was found and fixed: a reflected cross-site scripting flaw in the AI Operator mobile approval callback, reachable without any valid token, on the same origin that holds the dashboard session cookie. A second real weakness — a bypass in the outbound-webhook SSRF guard that let every IPv4-mapped IPv6 address through, cloud metadata included — was also found and fixed. Three smaller hardening issues were fixed alongside them.

Four issues are reported but **not** fixed, because each needs a product decision or a design change rather than a patch. They are listed under "Open findings" with the reasoning.

The wider picture is good. Tenant isolation, the area where a product like this usually bleeds, held up under every check: 237 of 240 tables enable row-level security, and the three that do not are each covered by an explicit `REVOKE` or are deliberately public. Every one of the 186 API routes reaches a guard, and so does every server action outside the intentionally public homeowner and login flows. There are no hardcoded credentials in the repository and no known-vulnerable production dependencies.

## What was checked

Authentication and session handling; multi-tenant isolation across API routes, server actions and the database; service-role key usage; webhook signature verification; injection (SQL, PostgREST filter, command, template); cross-site scripting sinks; server-side request forgery; insecure direct object references; open redirects; secret management and committed credentials; cryptographic primitives and comparisons; rate limiting on unauthenticated endpoints; storage bucket exposure; security headers and content security policy; dependency advisories.

## Fixed in this change

### 1. Reflected XSS in the AI Operator approval callback — High

`src/app/api/webhooks/operator-approval/route.ts`

The callback answered with `Content-Type: text/html` and interpolated the `actionId` query parameter straight into the page. No escaping was applied anywhere in the file.

Reaching it needed no valid token. Both failure paths render: a missing parameter returns 400 with the value already on the page, and an invalid signature returns 400 the same way. The error string handed back by the approval bridge was interpolated too.

Nothing downstream would have caught it. The middleware matcher excludes `/api`, so no content security policy is set on this response, and the policy the rest of the app ships is report-only in any case. The endpoint lives on the application origin, which is where the contractor and staff session cookies live.

Confirmed by executing the real route handler:

```
STATUS: 400   CONTENT-TYPE: text/html; charset=utf-8
Action ID: <script>alert(document.domain)</script></div>
```

Fixed by escaping `&`, `<`, `>`, `"` and `'` on every interpolated value. Five regression tests added in `test/operator-approval-callback-escaping.test.ts`. Four of them fail against the previous code; the fifth checks that a legitimate action id still renders readably, and guards against over-escaping rather than under-escaping.

### 2. SSRF guard bypass via IPv4-mapped IPv6 — Medium

`src/lib/public-api/ssrf-guard.ts`

`isPrivateOrRestrictedIpv6` decoded only the dotted spelling of a mapped address, `::ffff:192.168.1.1`. Nothing produces that spelling. `new URL('https://[::ffff:127.0.0.1]/')` normalizes its hostname to `[::ffff:7f00:1]`, and `dns.lookup` returns the hex form as well — an AAAA record for a mapped address comes back as `::ffff:a9fe:a9fe` with `family: 6`.

So the branch that existed never ran, and every mapped address fell past it to the `fc`/`fd`/`fe8` checks, matched none, and was reported safe. Measured against the shipped function:

| Address | Means | Verdict before |
|---|---|---|
| `::ffff:a9fe:a9fe` | 169.254.169.254, cloud metadata | safe |
| `::ffff:7f00:1` | 127.0.0.1 | safe |
| `::ffff:c0a8:0101` | 192.168.1.1 | safe |

A webhook subscription pointed at a hostname carrying such an AAAA record would have been delivered to the internal address; the kernel routes a mapped address to its IPv4 host. The other checks in the guard hold the blast radius to HTTPS on port 443, which puts the metadata service itself out of reach but leaves internal services on 443 reachable.

Fixed by decoding the hex form, treating an undecodable `::ffff:` prefix as restricted, and adding NAT64 (`64:ff9b::/96`). Separately, `URL.hostname` keeps the brackets on an IPv6 literal, so `isIP` rejected it and the literal fell through to a DNS lookup that only happened to fail closed; brackets are now stripped so the intended check runs. Eleven tests added to `test/public-api/ssrf-guard.test.ts`.

### 3. Hardcoded fallback encryption key — Medium

`src/lib/account-closure-orchestrator.ts`

The key for the account-closure vendor handles fell back to the literal `'default-dev-service-role-secret-key-32-chars!!'` when neither `CLOSURE_ENCRYPTION_SECRET` nor `SUPABASE_SERVICE_ROLE_KEY` was set. That literal is in the repository, so anything sealed under it was readable by anyone holding the ciphertext and a checkout. The payload is the set of vendor identifiers a closure uses to reach into Stripe and QuickBooks.

Fixed by throwing when no key is configured, matching what `neighborhood-halo-claim-token.ts` and `estimate-continuation-token.ts` already do with their own signing secrets. Four tests added.

### 4. Forgeable QuickBooks OAuth state when the key is unset — Low

`src/lib/quickbooks/state.ts`

`sign()` used `process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''`. An empty HMAC key still produces a stable signature, so an unset variable would leave the OAuth state signed with a key an attacker also has. That state is what binds the Intuit callback to an account, and the module's own comment explains that without it a code obtained under one account could be redeemed against another.

Fixed by throwing when the key is unset.

### 5. Non-constant-time signature comparison — Low

`src/lib/quickbooks/state.ts`

`verifyState` compared the HMAC with `===`, which returns as soon as two bytes differ. Nineteen other modules in this codebase already use `timingSafeEqual`; this one did not. Practical exploitation over a network is unlikely, but the inconsistency is the kind that outlives the reasoning behind it.

Fixed with a length-checked `timingSafeEqual` wrapper. Six tests added to `test/quickbooks-oauth.test.ts`.

## Open findings

### 6. DNS rebinding in webhook delivery — Medium, not fixed

`src/lib/public-api/ssrf-guard.ts` and `src/lib/public-api/webhook-delivery-worker.ts`

`validateWebhookUrl` resolves the hostname, checks the addresses, and returns. The worker then calls `fetch(task.target_url)`, which resolves the hostname again, independently. An attacker serving a short-TTL record can answer the check with a public address and the fetch with a private one.

Not fixed here because the correct fix changes how requests are made, not what is validated: the resolved address has to be pinned and the connection made to it directly, through a custom `lookup` on an undici agent, with the original hostname preserved for TLS and the `Host` header. That is a change to the delivery path worth making deliberately rather than folding into an audit. The guard's existing constraints — HTTPS only, port 443 only — limit what a successful rebind reaches.

### 7. Unauthenticated payroll webhook with no signature verification — Low, not fixed

`src/app/api/payroll/webhook/route.ts` and `src/lib/payroll-api-integration.ts`

The endpoint accepts any well-formed JSON body from anyone. `processPayrollWebhook` takes a `headers` argument and never reads it; every provider branch returns `valid: true` without verifying anything.

Impact today is low, and this is the reason it is reported rather than patched: the handler persists nothing. It parses the body and echoes a summary. The docstring, however, says it "updates internal pay tracking when a submitted payroll batch is processed or paid," which is what the next person to work on it will read. The gap between the documented behaviour and the implemented behaviour is the risk.

Choosing a verification scheme is a product decision — Gusto, QuickBooks, ADP and Paychex each sign differently, and the unused `headers` parameter suggests the shape was anticipated. Recommended: verify per provider before this endpoint is given the ability to write, and until then correct the docstring.

### 8. Unescaped user input in PostgREST filter strings — Low, not fixed

Roughly 25 call sites build a PostgREST `or=` filter by interpolating user input into a template literal. Examples: `src/lib/tenant-audit.ts:266`, `src/lib/expense-ledger.ts:82`, `src/lib/ai-assistant/tools.ts:674` and `:724`, `src/app/dashboard/schedule/waitlist/actions.ts:148`.

This is **not** a tenant-isolation bypass. In every case examined the account scope is a separate `.eq('account_id', …)`, which PostgREST ANDs with the injected `or` group, so a crafted search term cannot reach another workspace's rows. What it can do is manipulate the filter within the caller's own tenant, match on columns the caller did not intend to expose, and produce query errors.

`src/lib/marketplace-router/routing-engine.ts:34` is the one worth a second look: `.or(\`id.eq.${partnerId}\`)` against `accounts` is the sole selector, with `partnerId` arriving from an inbound marketplace lead payload. Injection there adds little beyond what the parameter already permits — it already accepts an arbitrary account id — so the real control is signature verification on the inbound adapter, which is present.

Recommended: a small shared helper that strips `,`, `(`, `)`, `.` and `:` from any value interpolated into a filter string, applied at all sites. Left unfixed because it touches 25 call sites across unrelated features and each needs its own search-behaviour check.

### 9. Content Security Policy is report-only — Informational

`src/lib/csp.ts` ships `content-security-policy-report-only`. The file documents this as deliberate and records a full enforcing dry run that found and fixed a missing `media-src`. The policy itself is well built: per-request nonce, `strict-dynamic`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`.

Worth noting only for its interaction with finding 1: while the policy is report-only, nothing mitigates an XSS at runtime. The enforcing flip is a one-line change in `cspHeaderName()`.

### 10. Weak identifier in unreferenced code — Informational

`src/lib/mobile-quick-pay.ts:24` builds a payment session id from `Math.random().toString(36).slice(2, 6)` — roughly 20 bits, in a value that appears in a payment URL. Nothing calls `createMobileQuickPaySession` and no `/pay/quick/[sessionId]` route exists, so this is not live. Worth deleting or rebuilding on `randomBytes` before anything wires it up.

## What held up

**Tenant isolation.** 237 of 240 tables enable row-level security, several with `force row level security`. The three without are each accounted for: `merchandise_revenue_ledger` and the `tax_vault` schema revoke all access from `anon` and `authenticated`, and `weather_cache` is documented as deliberately shared public forecast data keyed to a kilometre-wide grid square. 135 policies back this up.

**Authorization coverage.** All 186 API routes reach a guard. The cron routes go through `cronRoute`, which fails closed when `CRON_SECRET` is unset. The public API v1 routes go through `publicApiRoute`, which checks a bearer token, verifies scope, rate-limits per credential, enforces idempotency on mutations and writes an audit row. Dashboard and admin server actions route through `requireOwnerContext`, `requireOfficeContext` or `requireMfaPermission`; the ones that appear unguarded delegate to entrypoints that call those guards. The remainder are the intentionally public homeowner, login and unsubscribe flows.

**Secrets.** No live credentials in any tracked file. The four `whsec_` strings that matched are test fixtures. `.gitignore` covers `.env*` with an explicit exception for `.env.example`, and that file carries no real values.

**Dependencies.** `npm audit --omit=dev` reports zero vulnerabilities at every severity.

**Injection.** No `eval`, no `Function` constructor, no `child_process` anywhere in `src/`. No raw SQL string construction.

**Storage.** Private buckets are read through `createSignedUrl` with one-hour expiry. The buckets using `getPublicUrl` hold contractor site images and videos, which are published by design.

**Structured data.** The JSON-LD blocks on tenant-controlled pages escape `<` to `<` before embedding (`src/lib/templates/SiteStructuredData.tsx`, `src/lib/seo/video-index-page.tsx`). The unescaped `JSON.stringify` calls elsewhere are on marketing pages built from static content.

**Randomness.** Every security token uses `randomBytes` at 18 bytes or more. The `Math.random()` call sites are confirmation numbers, telemetry ids and simulated provider identifiers.

**Rate limiting.** Present on all public endpoints checked, including lead submission, phone verification, permit preview and the CSP report collector.

**Transport and headers.** HSTS with `includeSubDomains`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `frame-ancestors 'self'`, and `Referrer-Policy: strict-origin-when-cross-origin`, applied to every response including `/api`.

**Open redirect.** `safeNextPath` strips control characters before testing, requires a leading `/`, and rejects `//` and `/\`.

## Verification

```
npx tsc --noEmit -p tsconfig.test.json     exit 0
npx vitest run                              1180 files, 15087 tests, all passed
npm run test:security                       55 passed
test/operator-approval-callback-escaping    5 passed  (4 fail without the fix)
test/public-api/ssrf-guard                 18 passed  (6 fail without the fix)
test/quickbooks-oauth                      22 passed
test/account-closure-orchestrator          13 passed
```

23 tests were added across the four fixed issues.
