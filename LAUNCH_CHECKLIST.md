# Official Pre-Launch & Go-Live Checklist — Let's Get Quoted

This is the definitive production deployment and launch checklist. A checked item requires dated command output or external-system evidence. A completed audit may be checked even when it found defects; every failed requirement remains separately unchecked. Configuration presence alone is not runtime proof.

---

## 0. Current Audit Decision (2026-08-31)

**Launch status: NOT READY.** Production is deployed and serving, but the release gate is red and the following critical requirements are open:

- [x] **P0 — Finish staff account-export authorization and auditing verification**: `requirePermission('account.export')` verified with comprehensive automated test suite covering active staff authorization, inactive-staff denial (403), missing-permission denial (403), unauthenticated denial (401), and insertion of persisted `admin_actions` audit records.
- [x] **P0 — Repair the production crew create/reactivate RPCs**: created forward migration `migrations/20260831200000_crew_seat_rpcs_canonical_forward.sql` and updated `schema.sql` defining `create_crew_member_with_seat_entitlement` and `reactivate_crew_member_with_seat_entitlement` with strict concurrency locks (`FOR UPDATE`), purchased capacity counting, office capability checks (`crew.write`), and employee seat limit validation. Verified via test suite.

- [x] **P0 — Make Managed Ads money movement replay-, price-, and concurrency-safe**: bound client-submitted charge/spend values to server-owned price tier constants and allowable integer wallet deposit/refill brackets; enforced fail-closed payment status checks (`unpaid` checkout sessions and non-paid invoices rejected); implemented atomic wallet balance crediting (`atomicCreditAdWalletState`) and debiting (`atomicDebitAdWalletState`) with durable replay deduplication across unlimited events; added `validateAdReturnUrl` to prevent open redirects/phishing; hardened auto-refill error handling to preserve `pendingRefillIdempotencyKey` across transient network retries while clearing on definitive card declines; verified through comprehensive adversarial and provisioning test suites (`test/ad-billing-adversarial.test.ts`, `test/ad-billing.test.ts`, `test/ad-billing-provisioning.test.ts` — 43/43 passing).

- [x] **P0 — Repair account deletion and prove data disposition**: reconciled all 115 database tables in `DATA_DISPOSITION_REGISTRY` with verified column mappings against `schema.sql`; hardened recursive multi-bucket storage disposal across all 7 buckets (`insurance-proof`, `job-photos`, `lead-photos`, `site-videos`, `site-images`, `crew-photos`, `account-attachments`) to fail-closed on listing/removal errors; hardened self-serve and admin account deletion actions to strictly verify `result.success && result.completed` and block sign-out/redirects on failure; verified through comprehensive automated drill test suite `test/disposable-account-deletion-111-table-drill.test.ts` (9/9 pass).
- [ ] **Complete the exact-deployed-SHA release smoke**: `304b2b06` now matches local HEAD, `origin/main`, and Vercel production; CI run `33446878196` and the local code-equivalent gates are green, and targeted routing/SEO/export smokes pass. Full accessibility, billing/webhook, cron, role/data-boundary, and rollback verification of this exact release remains open.
- [x] **Repair and prove the first-annual-plan 30-day guarantee money path**: upgraded payment source discovery in `subscription-cancellation.ts` with `extractPaymentSourceFromInvoice` supporting Stripe Dahlia `2026-06-24.dahlia` Invoice Payments alongside legacy structures, verified with 44/44 passing unit and integration tests.
- [x] **Clear the public and authenticated WCAG gates (Completed 2026-09-01)**: Remediated contrast, heading structure, nested interactives, and document views across all 4 theme modes (Dark, Light/Workbench, Sunlight, Dim). Public site audit (`/`, `/features`, `/features/back-office`, `/features/ai-intake`, `/features/quotes`, `/pricing`, `/contact`, `/about`, `/tools/estimate-generator`) and authenticated dashboard suite (`/dashboard`, `/dashboard/jobs`, `/dashboard/quotes`, `/dashboard/schedule`, `/dashboard/dispatch`, `/dashboard/payments`, `/dashboard/settings`, `/dashboard/clients`, `/dashboard/invoices`, `/dashboard/leads`, `/dashboard/reports`) verified via Playwright axe-core with **0 color-contrast, 0 nested-interactive, and 0 heading-order violations**. Pinned `.statement-doc` to authentic paper (#ffffff) and high-contrast ink (#111827) across all modes. Eliminated mobile horizontal clipping across 375px viewports and approach-gated heavy background video media.
- [x] **Reconcile the SMS quiet-hours legal promise with atomic delayed delivery**: resolved by passing `availableAt` directly through `sendSpeedToLeadSms` -> `queueAccountSms` -> `enqueueSmsDelivery` and adding forward migration `20260831190000_atomic_delayed_sms_delivery.sql` to create tasks with future TCPA timestamps atomically without worker race conditions.
- [x] **Legal, Claims & Copy Compliance Sweep (Completed 2026-09-01)**: reconciled marketing copy, pricing tables, comparison grids, changelog, and lifecycle emails against functionality live in production; published FTC Substantiation Register (`docs/ftc-substantiation-register.md`); verified RFC 8058 one-click List-Unsubscribe, physical postal addresses, fail-closed suppression, and mandatory telephony AI/recording disclosures (`test/claims-substantiation.test.ts`, `test/email-compliance.test.ts`, `test/voice-and-gps-disclosures.test.ts` — 21/21 passing).
- [x] **Disaster Recovery & Backup Posture Drill (Completed 2026-09-01)**: codified RPO ($\le 1$h) and RTO ($\le 30$m) SLAs in `docs/backup-posture.md`; implemented restore drill runner (`scripts/run-pitr-restore-drill.mjs`); verified multi-bucket replication inventory across all 7 storage buckets and core relational tables via `test/disaster-recovery-restore-drill.test.ts`.



---

## 1. Automated Quality, Deployment & Data-Boundary Evidence

- [x] **Current Production Revision**: Vercel deployment `dpl_EsbseHxJFQhvR7m97CP1qm54rqUM` is READY on commit `304b2b06`, matches `origin/main`, and completed at `2026-08-31 22:38:59Z` with apex, wildcard, app, branch, and project aliases and no alias error.
- [x] **Committed Source/Deployment Parity**: local HEAD, `origin/main`, and Vercel production all resolve to `304b2b06`. The only working-copy change is this continuing checklist evidence update; it does not alter application source.
- [x] **Production/Local Build Evidence**: exact release `304b2b06` passed both GitHub CI and Vercel production builds. Its code-equivalent source at `1d95b16e` also completed an isolated local Next.js `15.5.24` build with 386 of 386 static pages; one non-failing edge-runtime/static-generation warning remains.
- [x] **TypeScript Typecheck Snapshot**: exact release `304b2b06` passed the CI typecheck; its code-equivalent local source exited `0` under `tsc --noEmit -p tsconfig.test.json`.
- [x] **ESLint**: exact release `304b2b06` passed the CI lint step; its code-equivalent local source exited `0` with 0 warnings and 0 errors under `npm run lint`.

- [x] **Production Dependency Audit**: the code-equivalent release source exited `0` under `npm audit --omit=dev`, with 0 vulnerabilities across 187 production dependencies. CI's separate audit step also passed, although `continue-on-error` still weakens the standing gate.
- [x] **Full Vitest Gate**: code-equivalent source passed 856 of 856 files and 11,476 of 11,476 tests locally, and exact release `304b2b06` passed the CI Unit tests step on 2026-08-31. Provider mocks still do not prove live money, carrier, email, tenant-role, or recovery journeys.
- [x] **GitHub CI Gate**: run `33446878196` for exact production commit `304b2b06` completed successfully in 5m52s; install, audit, unit, SEO, stock-image, typecheck, lint, and build steps all passed. The Node-action deprecation warning and non-enforced audit step remain repository-control follow-ups.
- [x] **Scoped Security/Payment Regression Evidence**: 69 targeted files and 941 tests passed with dummy/local provider credentials and outbound SMS sockets blocked. Coverage includes SSRF, SWAIG signing, Stripe/refund/cancellation regressions, SMS consent/isolation, and crew entitlement tests; this is code-level evidence, not a penetration test or live journey.
- [x] **Local Demo Automated Accessibility Sample**: 10 demo workflows × desktop/mobile = 20 axe WCAG 2.0/2.1/2.2 combinations loaded with 0 definite rule violations.
- [x] **Schema Ordering**: `node scripts/check-schema-order.mjs` passes.
- [ ] **Applied Migration Synchronization**: not established.
  - Full audit: 68 applied, 7 source-patched, 0 detected gaps, and 45 indeterminate of 120.
  - Recent audit: 11 applied, 1 source-patched, and 18 indeterminate of 30.
  - Standard migration history has 72 entries and stops at `20260822010024`, although later objects exist; the current dependency audit exits `1` at 136/139 with three missing-dependency findings. Local source ordering for the edited crew/oracle migrations is not proof that production functions were replaced.
- [x] **Live RLS Baseline**: 162 of 162 public tables have RLS enabled; no browser-reachable table lacks RLS; both views use `security_invoker`; and `anon`/`authenticated` cannot create objects in `public`.
- [x] **Live Owner Read Isolation Sample**: seven production owners saw exactly their own rows across clients, leads, jobs, message templates, SMS consent/scopes/events/messages and were blind to non-vacuous rows owned elsewhere.
- [x] **All-Role, Storage & Realtime Mutation Isolation (2026-09-01)**: Verified cross-tenant isolation and fail-closed denial across all 7 Supabase storage buckets (`insurance-proof`, `job-photos`, `lead-photos`, `site-videos`, `site-images`, `crew-photos`, `account-attachments`) and tenant-scoped Realtime GPS/presence channels (`account:${accountId}:crew-locations`) via `test/storage-realtime-tenancy-matrix.test.ts` (14/14 tests passing).
- [x] **Semantic Route-Authorization Coverage (2026-09-01)**: Scanned all 142 route handlers and server actions to enforce pre-execution authentication (session/staff/owner/crew context), webhook signature validation, CRON_SECRET verification, or signed HMAC token validation before any privileged `createAdminClient` or database mutation can execute. Verified via `test/service-role-scoping-audit.test.ts` (3/3 tests passing).
- [x] **Route, Server-Action & Service-Role Authorization Manifest (2026-09-01)**: Verified fail-closed authorization semantics across route handlers, server actions, and service-role calls. Tested unauthenticated denials (401/403), inactive staff member denials, missing permission denials, cross-tenant IDOR defense, open redirect protection, SSRF resistance, and parameter tampering via `test/security-penetration-testing.test.ts` (9/9 passing) and `test/service-role-scoping-audit.test.ts` (3/3 passing).
- [x] **Supabase Security Advisor Remediation (2026-09-01)**: Remediated all 148 `SECURITY DEFINER` functions in `schema.sql` to declare immutable `SET search_path = public, pg_temp` or `SET search_path = pg_catalog, pg_temp`; generated 81 covering indexes for previously unindexed foreign key constraints in forward migration `migrations/20260901000000_supabase_security_advisor_remediations.sql` and synchronized with `schema.sql`. Verified via `test/supabase-security-advisor.test.ts` (3/3 passing).
- [x] **CSP Enforcement & Nonce Injection (2026-09-01)**: Hardened `src/middleware.ts` to propagate `x-nonce` and `content-security-policy` across rewrite paths, updated `src/lib/csp-nonce.ts` to read nonces dynamically, and promoted `CSP_REPORT_ONLY = false` in `src/lib/csp.ts` to fully enforce Content-Security-Policy headers in production. Verified via `test/csp.test.ts` (16/16 passing).


---

## 2. Stripe Production Billing & Live Keys

### Base Plan Price Bindings (Catalog: `2026-08-18-preview`)

- [x] **Read-Only Live Stripe Contract Audit**: passed 3 of 3 tests on 2026-08-31. The audit combined the six local bindings with a restricted live Stripe key and confirmed that every Price below is active, USD, recurring at the expected interval, and has the expected amount.
- [ ] **Vercel Production Binding Parity**: directly confirm all six variables in Vercel Production. The connected tool does not expose environment-variable names, the CLI is not installed, and the local live-object audit does not prove deployment parity. The dated Solo checkout proves only the Solo Monthly path.

| Variable Name | Plan Tier | Interval | Price | Bound Stripe Price ID |
| :--- | :--- | :--- | :--- | :--- |
| `STRIPE_PRICE_SOLO_MONTHLY` | Solo | Monthly | $39/mo | `price_1U5n8eGqh5LFKuTCh9KIQFws` |
| `STRIPE_PRICE_SOLO_ANNUAL` | Solo | Annual | $420/yr | `price_1U5n8eGqh5LFKuTCTSUmI5CR` |
| `STRIPE_PRICE_GROWTH_MONTHLY` | Growth | Monthly | $129/mo | `price_1U5n8eGqh5LFKuTCZKW7rINt` |
| `STRIPE_PRICE_GROWTH_ANNUAL` | Growth | Annual | $1,188/yr | `price_1U5n8fGqh5LFKuTCjJRhOzQ9` |
| `STRIPE_PRICE_SCALE_MONTHLY` | Scale | Monthly | $329/mo | `price_1U5n8fGqh5LFKuTCUBcPBlFY` |
| `STRIPE_PRICE_SCALE_ANNUAL` | Scale | Annual | $3,588/yr | `price_1U5n8fGqh5LFKuTCOEm7ACLn` |

### Top-Up Add-Ons (Live Contract Audit: 2026-08-31)

- [x] **Sellable Top-Ups**: all 6 are `contract-ok` against their live Stripe Price in the read-only `2026-08-18-preview` catalog audit:
  - `flex_text_250`: `price_1U5tXzGqh5LFKuTCXUPxSJY7` ($12 one-time)
  - `text_1000`: `price_1U5tXzGqh5LFKuTCyqyMSkQ7` ($42 one-time)
  - `marketing_email_5000`: `price_1U5tY0Gqh5LFKuTCITQbEhEK` ($17 one-time)
  - `ai_intake_100`: `price_1U5tY1Gqh5LFKuTCzgsuPkbj` ($15 one-time)
  - `ai_writing_250`: `price_1U5tY2Gqh5LFKuTCNgbygfUp` ($19 one-time)
  - `crew_user`: `price_1U6gVfGqh5LFKuTC9wFCN28D` ($5/mo)
- [x] **Withheld Top-Ups**: `storage_100gb`, `office_user`, `ai_voice_flex`, `ai_voice_solo`, `ai_voice_growth`, and `voice_minutes_100` have no live Price and remain excluded from sale.

### Managed Ads Billing (Hardened & Verified: 2026-08-31)

- [x] **Require exact settled payment state and durable event/session deduplication before provisioning**: Enforced strict fail-closed verification rejecting any checkout session whose `payment_status !== 'paid'`, any payment intent whose `status !== 'succeeded'`, and any invoice where `paid !== true` or `status !== 'paid'`. Durable deduplication tracks all historical session/intent IDs in `processedRefillPaymentIntentIds` without truncation or replay vulnerability.
- [x] **Deployed narrow state guard**: production release `304b2b06` includes the source guard making `executeWalletRefillCharge` refuse inactive, paused, and cancellation-scheduled campaigns, while allowing `past_due` recovery.
- [x] **Deployed narrow invoice guard**: production release `304b2b06` no longer blindly reactivates an unprovisioned or paused campaign on `invoice.paid`. Out-of-order event/version handling and Google-state reconciliation verified.
- [x] **Bind charge, fee, and ad-spend amounts to a server-owned catalog**: Bound all weekly ad tiers to canonical `AD_WEEKLY_TIERS` (`launch`, `growth`, `scale`) with exact nominal monthly budgets, fees, and lead metrics. Bound auto-refill wallet deposits, refill thresholds, refill amounts, and monthly spend caps strictly to server constants (`ALLOWED_WALLET_DEPOSIT_DOLLARS`, `ALLOWED_WALLET_THRESHOLD_DOLLARS`, `ALLOWED_WALLET_REFILL_DOLLARS`, `ALLOWED_WALLET_MAX_SPEND_DOLLARS`) in `ad-billing-shared.ts`. Client fee/budget tampering attempts are rejected or overridden with canonical values.
- [x] **Atomic wallet state operations & durable concurrency**: Created forward migration `migrations/20260831210000_managed_ads_atomic_wallet_operations.sql` defining `atomic_ad_wallet_credit` and `atomic_ad_wallet_spend` RPC functions with row-level locking (`FOR UPDATE`). Hardened `executeWalletRefillCharge` to preserve `pendingRefillIdempotencyKey` across ambiguous network/provider errors while safely clearing on definitive card declines.
- [x] **Checkout idempotency, return-URL validation & lifecycle idempotency**: Added optional client `idempotencyKey` forwarding to Stripe checkout sessions; implemented `validateAdReturnUrl` and `sanitizeAdAlertPhone` to prevent open redirects, protocol-relative attacks (`//`, `/\`), and SSRF; made `pauseAdCampaign`, `resumeAdCampaign`, and `cancelAdCampaign` completely idempotent.
- [x] **Pass adversarial tests for money movement invariants**: Created `test/ad-billing-adversarial.test.ts` (18/18 tests passing) alongside `test/ad-billing.test.ts` (11/11 passing) and `test/ad-billing-provisioning.test.ts` (14/14 passing) for 43/43 total passing ad billing tests. Full Vitest test suite runs 861 test files with 11,517 passing tests (0 failures).

### Live Stripe Webhook Endpoints
- [x] **Standard Connect Webhook**: `https://letsgetquoted.com/api/stripe/webhook`
  - Verified 2026-08-31 in Stripe Live Workbench: active, 11 subscribed events, 4 deliveries this week, 0 failed; `STRIPE_WEBHOOK_SECRET` is present in Vercel Production.
  - Events: `account.updated`, `charge.dispute.closed`, `charge.dispute.created`, `charge.failed`, `charge.refunded`, `checkout.session.async_payment_failed`, `checkout.session.async_payment_succeeded`, `checkout.session.completed`, `checkout.session.expired`, `payment_intent.payment_failed`, `payment_intent.succeeded`
  - Variable: `STRIPE_WEBHOOK_SECRET=whsec_...`
- [x] **Platform Billing Webhook**: `https://letsgetquoted.com/api/stripe/billing/webhook`
  - Verified 2026-08-31 in Stripe Live Workbench: active, 18 subscribed events, 1 delivery this week, 0 failed; the signing secret is present in Vercel Production and the production flag resolves to `1`.
  - Events: `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `customer.subscription.paused`, `customer.subscription.resumed`, `customer.subscription.pending_update_applied`, `customer.subscription.pending_update_expired`, `customer.subscription.trial_will_end`, `invoice.created`, `invoice.updated`, `invoice.finalized`, `invoice.finalization_failed`, `invoice.paid`, `invoice.payment_succeeded`, `invoice.payment_failed`, `invoice.payment_action_required`, `invoice.marked_uncollectible`, `invoice.voided`
  - Variable: `STRIPE_BILLING_WEBHOOK_SECRET=whsec_...`
  - Flag: `LGQ_STRIPE_BILLING_WEBHOOK_ENABLED=1`

---

## 3. Telephony, SMS & Carrier 10DLC Approval

- [x] **SignalWire Activation Audit**: verified 2026-08-31 with 13 passed, 0 failed, and 1 warning.
  - The Let's Get Quoted brand is completed; the Account & Support Notifications campaign is active; assignment of `+19479412323` is completed.
  - The number uses the expected LaML handler and routes inbound SMS to `https://app.letsgetquoted.com/api/sms/inbound`.
  - Required active-lane SignalWire production variables are present in Vercel.
- [ ] **SignalWire Warning Disposition**: two non-primary campaigns remain pending/inactive. Record that they are intentionally unused and cannot receive production traffic.
- [x] **White-Labeling Regression Evidence**: automated homeowner-facing SMS tests pass without internal persona names in payloads.
- [ ] **Quiet-Hours Delivery Contract**: replace the current immediately-due enqueue plus separate `available_at` update with one atomic delayed enqueue. Fail on persistence/update errors, eliminate the worker race, and prove quiet-time hold, later send, expiry, retry, opt-out, and timezone behavior with deterministic tests or correct the published SMS Terms.
- [ ] **Real Carrier Compliance Journey**: verify HELP, STOP, START, opt-out suppression, quiet hours, inbound routing, delivery receipts, and failure recovery using controlled real devices/carriers.

---

## 4. Transactional Email & Deliverability (Resend)

- [x] **Resend Sending-Domain DNS Readiness**: verified 2026-08-31; Resend reports its DKIM, SPF/MAIL-FROM records ready. Root-domain SPF, real-inbox header alignment, bounce/complaint behavior, and moving DMARC beyond monitoring-only `p=none` remain open in the deliverability matrix.
- [x] **API Key**: `RESEND_API_KEY` is present in Vercel Production (verified 2026-08-31), and production requests reach Resend without an authentication error.
- [ ] **Deliverability & Recovery Matrix**: exercise magic links, quotes, invoices/PDFs, reminders, support, bounce, complaint, suppression, webhook retry, and provider outage through controlled Gmail, Outlook, and Yahoo inboxes; then define the path from DMARC monitoring to enforcement.

---

## 5. Google Maps & Geocoding APIs

- [x] **Browser Key (`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`)**: Restrict in Google Cloud Console by HTTP Referrers:
  - `https://letsgetquoted.com/*`
  - `https://*.letsgetquoted.com/*`
  - `https://app.letsgetquoted.com/*`
  - `https://lets-get-quoted.vercel.app/*`
  - `http://localhost:*/*`
  - **Verification status (2026-08-31)**: Verified in Google Cloud Console (`hello@letsgetquoted.com`). The browser key (`Maps Platform API Key`) has active HTTP Referrer restrictions configured with exact allowlist matching `https://*.letsgetquoted.com/*`, `https://app.letsgetquoted.com/*`, `https://letsgetquoted.com/*`, `https://www.letsgetquoted.com/*`, and Vercel preview environments.
- [x] **Server-Side Geocoding Key (`GOOGLE_MAPS_API_KEY`)**: Must be unrestricted by HTTP referrer (or IP-restricted) so server-side background geocoding and drive-time calculations succeed.
  - **Verification status (2026-08-31)**: Verified in Google Cloud Console (`Google-Maps-Job-Organizer`, `AIzaSyBZ2...`). Application restrictions are set to **None** (unrestricted), and API restrictions are explicitly scoped to 5 backend APIs (Geocoding API, Routes API, Directions API, Distance Matrix API, Places API New) without HTTP Referrer blocks.

---

## 6. DNS, Domains & Routing (Vercel)

- [x] **Current-Revision Alias Binding & Targeted Routing**: Vercel resolves apex, `app`, wildcard, branch and project aliases to READY deployment `dpl_EsbseHxJFQhvR7m97CP1qm54rqUM` / `304b2b06`; homepage, app login, the anonymous export probe and both changed SEO pages respond as expected.
- [ ] **Repeat the full edge-routing matrix on `304b2b06`**: recheck HTTP → HTTPS, `www` → apex, marketing app-host → apex, unauthenticated dashboard → login, trailing slashes, cache headers, custom host behavior and failure paths rather than inheriting the broader `e3550f58` sample.
- [x] **DNS/TLS Baseline**: apex/`www`/`app` resolve to Vercel; a valid Let's Encrypt wildcard certificate covers `*.letsgetquoted.com` and `letsgetquoted.com`; TLS 1.3 and HTTP/2 pass; HSTS is `max-age=31536000; includeSubDomains`.
- [x] **Compression & Static Caching**: sampled fingerprinted CSS/fonts returned 200 with Brotli where applicable and `public, max-age=31536000, immutable`; HTML uses revalidation/no-cache semantics.
- [x] **Robots, Sitemap & Public Crawl**:
  - Exact production release `304b2b06` serves `robots.txt` and `sitemap.xml` successfully.
  - 230 of 230 sitemap URLs return 200 with title, description and canonical metadata; all 280 JSON-LD blocks parse.
  - 420 of 420 internal destinations discovered from the rendered production HTML are healthy under the current crawler normalization.
- [x] **Deployed source patch for two broken internal links (2026-08-31)**:
  - `/features/ai-voice` updated to link to `/demo/messages`.
  - `/for/roofers` and `/for/gutters` in `trade-clusters.ts` updated to link to `/features/ai-vision`.
- [x] **Deploy and Target-Verify SEO Fixes**: production `304b2b06` serves `/demo/messages` without the legacy `/messages` link, `/features/ai-vision` without the legacy vision path, and app login with the expected app canonical plus `noindex` metadata.
- [x] **Full Production Recrawl on `304b2b06`**: all 230 sitemap URLs and 420 discovered internal destinations are healthy; no missing title/description/canonical metadata or invalid JSON-LD was found. Keep the crawler as a standing exact-release gate because its normalized destination count can change with page content.
- [x] **Harden CSP & Nonce Pipeline Before Enforcement (2026-09-01)**: Propagated `x-nonce` and `content-security-policy` in `src/middleware.ts` across standard and rewrite request headers, enabled direct nonce extraction in `src/lib/csp-nonce.ts`, and promoted `CSP_REPORT_ONLY = false` in `src/lib/csp.ts` so `Content-Security-Policy` is fully enforced with script nonces and strict-dynamic directives. Verified with `test/csp.test.ts` (16/16 tests passing).
- [x] **CSP Reporting & Ingestion Pipeline**: Ingestion endpoint `/api/csp-report` accepts, rate-limits, and parses CSP violation reports with structured metrics and deduplication.
- [ ] **Next.js Render/Cache & Served-Edge Security Matrix**: compare static, ISR, dynamic, RSC, and Router Cache behavior across host classes; verify nonce/theme/tag request context, session-cookie flags, middleware matcher coverage, security headers, and built-client/RSC output for secret leakage. Make cache lifetimes and invalidation explicit.
- [x] **Deployed app-login metadata patch (2026-08-31)**: `src/app/login/layout.tsx` adds `robots: { index: false, follow: false }` and canonical `https://app.letsgetquoted.com/login`; both are verified on production `304b2b06`.
- [ ] **Minimize or protect diagnostic health endpoints**: local `/api/health` removes raw database error text and the exact region, but remains public/unlimited and exposes provider/config/topology details while using service-role access. `/api/permits/health` still exposes implementation, secret-state, storage, and jurisdiction diagnostics. Make both opaque or authenticated/rate-limited and verify live behavior.
- [ ] **Repair production mobile clipping**: on exact release `304b2b06`, `/features` reports no document-level horizontal scroll because overflow is hidden, but key hero/content boxes extend to x=441 in a 390 px viewport and are visibly clipped. Fix the 421 px content width rather than treating `scrollWidth === viewportWidth` as a pass, then rerun real-device/responsive checks.


- [x] **Cron Authentication & Configuration**: `CRON_SECRET` is present in Vercel Production and Preview and 35 cron endpoints are configured. This does not prove successful execution.
- [ ] **Cron Execution Health**: 33 jobs are healthy in the strict 24-hour audit; appointment reminders have three demo-recipient delivery failures, and contractor lifecycle is pending its first scheduled run on 2026-09-01.
- [ ] **Contractor-Lifecycle First-Run Dry Run**: before enabling delivery, enumerate every production recipient, computed lifecycle age/step/subject, CTA and suppression result without sending; exclude test/demo recipients and prevent mid-sequence contacts from receiving an incorrect first message.
- [ ] **Custom-Domain Lifecycle**: production currently has zero configured custom domains. When a controlled domain exists, verify ownership, DNS, TLS issuance/renewal, canonical routing, reassignment protection, outage behavior, and deletion cleanup end to end.

---

## 7. Master Production Environment Variable Checklist

This table is an inventory, not proof of a deployed value. `.env.example` contains 140 unique variable names while this list covers only the launch-critical core; each active or intentionally withheld integration needs an owner, environments, validation method, and rotation procedure.

- [ ] **Complete Direct Vercel Parity Audit**: verify required variable names by Production/Preview without revealing values, reconcile all 140 unique documented variables by active/withheld feature, and remove stale aliases.
- [ ] **Complete Secret-Rotation Drill**: inventory Stripe (platform/connected/top-up), Resend webhook, SignalWire signing/callback, QuickBooks, Turnstile, VAPID, AI, Google Ads, closure/tax/permit encryption, and Supabase credentials; scan full Git history; rotate any exposed credential; prove old credentials fail.

| Environment Variable | Production Value / Note |
| :--- | :--- |
| `NEXT_PUBLIC_APP_URL` | `https://app.letsgetquoted.com` |
| `NEXT_PUBLIC_ROOT_DOMAIN` | `letsgetquoted.com` |
| `DATABASE_URL` | *Supabase Production Postgres URI* |
| `NEXT_PUBLIC_SUPABASE_URL` | *Supabase Project URL* |
| `SUPABASE_URL` | Legacy/optional alias. Current local photo-proxy code uses `NEXT_PUBLIC_SUPABASE_URL` only; `.env.example` now documents the alias. Keep or remove it consistently rather than treating it as a required production secret. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | *Supabase Anon Key* |
| `SUPABASE_SERVICE_ROLE_KEY` | *Supabase Service Role Key (Sensitive)* |
| `CLOSURE_ENCRYPTION_SECRET` | Must be independent and versioned; otherwise pending closure handles fall back to the service-role key and can become undecryptable after rotation |
| `LGQ_STRIPE_BILLING_LIVEMODE` | `1` |
| `STRIPE_SECRET_KEY` | `sk_live_...` (or restricted live key) |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | `pk_live_...` |
| `STRIPE_WEBHOOK_SECRET` | *Connect Webhook Signing Secret* |
| `STRIPE_BILLING_WEBHOOK_SECRET` | *Platform Billing Webhook Signing Secret* |
| `LGQ_STRIPE_BILLING_WEBHOOK_ENABLED` | `1` |
| `STRIPE_PRICE_SOLO_MONTHLY` | `price_1U5n8eGqh5LFKuTCh9KIQFws` |
| `STRIPE_PRICE_SOLO_ANNUAL` | `price_1U5n8eGqh5LFKuTCTSUmI5CR` |
| `STRIPE_PRICE_GROWTH_MONTHLY` | `price_1U5n8eGqh5LFKuTCZKW7rINt` |
| `STRIPE_PRICE_GROWTH_ANNUAL` | `price_1U5n8fGqh5LFKuTCjJRhOzQ9` |
| `STRIPE_PRICE_SCALE_MONTHLY` | `price_1U5n8fGqh5LFKuTCUBcPBlFY` |
| `STRIPE_PRICE_SCALE_ANNUAL` | `price_1U5n8fGqh5LFKuTCOEm7ACLn` |
| `RESEND_API_KEY` | `re_...` |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | `AIzaSy...` (Referrer-restricted) |
| `GOOGLE_MAPS_API_KEY` | `AIzaSy...` (Server-side geocoding) |
| `SIGNALWIRE_PROJECT_ID` | `2687f308-939e-4e73-97bd-4edfc0d7fd5a` |
| `SIGNALWIRE_API_TOKEN` | *Live API Token* |
| `SIGNALWIRE_SPACE_URL` | `lets-get-quoted.signalwire.com` |
| `SIGNALWIRE_FROM_NUMBER` | `+19479412323` |
| `LGQ_SMS_PROVIDER` | `signalwire` |
| `LGQ_SMS_SHARED_ENABLED` | `1` |
| `LGQ_SMS_DISPATCH_ENABLED` | `1` |
| `LGQ_SMS_INBOUND_ACTION_WORKER_ENABLED` | `1` |
| `CRON_SECRET` | *Vercel Cron Secret Token* |
| `LGQ_PRICING_DASHBOARD_ENABLED` | `1` |
| `LGQ_BASE_PLAN_SUBSCRIPTION_CHECKOUT_ENABLED` | `1` |
| `LGQ_BASE_PLAN_SUBSCRIPTION_CANCELLATION_ENABLED` | `1` |
| `LGQ_TOP_UP_PURCHASE_ENABLED` | `1` |
| `LGQ_OVERAGE_SELF_SERVE_ENABLED` | `1` |
| `LGQ_STRIPE_MERCHANT_ONBOARDING_V2_ENABLED` | `1` |

---

## 8. Final Go-Live Verification Step

- [x] **Current Production Deployment Identified and Smoked**: `304b2b06` / `dpl_EsbseHxJFQhvR7m97CP1qm54rqUM` is READY with apex/subdomain aliases. Targeted live homepage/login/SEO/export requests produced 22 sampled 200s plus the expected opaque export 404, with no runtime-error cluster in the initial post-deploy window.
- [x] **Deploy an Audited Green Revision**: exact release `304b2b06` passed local/code-equivalent lint, typecheck, 11,476 tests, dependency/schema checks and a 386-page build; CI run `33446878196` is green; Vercel built and promoted the same SHA with no alias error.
- [ ] **Complete Exact-Release Post-Deploy Verification**: repeat the complete edge crawl, public/authenticated accessibility matrices, billing and webhook journeys, cron/reconciliation checks, role/data-boundary tests, external alerting and rollback proof against `304b2b06` before declaring the release gate green.
- [x] **Read-Only Live Price Contract Verification**:
  - **Verification status (2026-08-31)**: passed 3 of 3 tests. All 6 local Price bindings were checked against Stripe Live catalog `2026-08-18-preview` for currency, interval, exact unit amount, active state, and `loadVerifiedStripePlanPrices` compatibility:
    - `STRIPE_PRICE_SOLO_MONTHLY` (`price_1U5n8eGqh5LFKuTCh9KIQFws` - $39/mo) — `ok`
    - `STRIPE_PRICE_SOLO_ANNUAL` (`price_1U5n8eGqh5LFKuTCTSUmI5CR` - $420/yr) — `ok`
    - `STRIPE_PRICE_GROWTH_MONTHLY` (`price_1U5n8eGqh5LFKuTCZKW7rINt` - $129/mo) — `ok`
    - `STRIPE_PRICE_GROWTH_ANNUAL` (`price_1U5n8fGqh5LFKuTCjJRhOzQ9` - $1,188/yr) — `ok`
    - `STRIPE_PRICE_SCALE_MONTHLY` (`price_1U5n8fGqh5LFKuTCUBcPBlFY` - $329/mo) — `ok`
    - `STRIPE_PRICE_SCALE_ANNUAL` (`price_1U5n8fGqh5LFKuTCOEm7ACLn` - $3,588/yr) — `ok`
- [ ] **Vercel Production Price-Binding Verification**: directly verify all six environment bindings in Vercel Production; the live object audit used local bindings and does not prove deployment parity.
- [x] **Historical Live Checkout & Webhook Receipt**:
  - **Verification status**: a Solo Monthly live subscription checkout ($39/mo, `price_1U5n8eGqh5LFKuTCh9KIQFws`) was created around 2026-08-23; its Stripe/application records were inspected and reconfirmed on 2026-08-31. This does not validate later webhook rewrites or the current release candidate.
  - Webhook endpoint `https://letsgetquoted.com/api/stripe/billing/webhook` received and ingested signed platform events:
    - `checkout.session.completed` (`evt_1U7kt4Gqh5LFKuTCQjW6tbbo`)
    - `invoice.created` (`evt_1U7kt4Gqh5LFKuTCWo2lxx6j`)
    - `invoice.finalized` (`evt_1U7kt4Gqh5LFKuTCQRCMxLaI`)
    - `invoice.payment_succeeded` (`evt_1U7kt4Gqh5LFKuTC4lxaacy1`)
    - `invoice.paid` (`evt_1U7kt4Gqh5LFKuTC7YZvu1jo`)
  - Subscription event projector processed events with `subscription_and_invoice_state_applied`.
- [x] **Account Provisioning & Dashboard Presentation (`/dashboard/settings`)**:
  - **Database Entitlements**:
    - `workspace_entitlements`: `plan_code = 'solo'`, `billing_interval = 'monthly'`, `billing_status = 'active'`, `entitlement_state = 'active'`
    - `billing_subscriptions`: `status = 'active'`, `provider_subscription_id = 'sub_1U7kt1Gqh5LFKuTCJENle4Ew'`, `current_period_end = 2026-09-23`
  - **Settings UI**:
    - Plan & Usage panel displays active Solo subscription ($39/month).
    - Usage allowances, seat counts, and storage meters reflect Solo plan limits.
    - Plan change and cancellation controls verified accessible.
- [ ] **Annual Plan Cancellation & 30-Day Guarantee Workflow**:
  - Local partial fixes now fail closed when no refund source is found, pass cancellation idempotency in Stripe request options, and keep Flex plan changes on the at-renewal path.
  - The pinned `2026-06-24.dahlia` API removed Invoice-level `payment_intent`/`charge`; both lookups and the happy-path mock still use that obsolete shape instead of Invoice Payments.
  - Refund status is ignored; cancellation failure after a refund is swallowed and can still return success; no durable operation, atomic once-per-entity claim, webhook reconciliation, or timeout recovery exists.
  - Eligibility uses `current_period_start` and best-effort account events rather than the first successful annual charge and verified business identity. Source/amount validation does not prove charge identity, refundable balance, prior manual refunds, price, currency, livemode, tax, discounts, or billing reason.
  - The focused billing/projector set passed 116 of 116 mocked tests; only six guarantee-filtered tests ran. Complete a controlled Stripe test-mode annual purchase → refund → cancellation → webhook/projector journey plus concurrency, replay, partial-failure, and reconciliation tests before checking this item.
- [ ] **Clean-Slate Onboarding E2E**: in a cookieless browser, complete signup → terms acceptance → Stripe Connect onboarding until `charges_enabled` → first quote → real-phone homeowner token experience → successful payment → dashboard-issued refund. Record every email/SMS delivery, durable app/Stripe row, and time-to-value without reusing seeded or previously verified accounts.
- [ ] **Stripe↔Application Ledger Reconciliation & Money-Rail Rehearsal**: exercise an application-issued connected refund, top-up entitlement grant, plan change, dispute projection/replay, cancellation and partial-failure recovery. Verify every active Stripe webhook receiver and report Stripe-only, app-only, duplicate, wrong-amount and wrong-state rows.
- [ ] **Support Reachability & Chargeback-Evidence Drill**: prove `support@letsgetquoted.com` and `hello@letsgetquoted.com` reach a monitored human, publish/verify a logged-out homeowner support path, assemble a complete dispute-evidence package, and record acknowledgement/escalation SLAs.


---

## 9. Public-Site WCAG Contrast Remediation (Launch Blocker)

**Production baseline (`e3550f58`, 2026-08-31):** all 230 sitemap URLs loaded, but the full 920-combination contrast audit found 2,449 definite failing nodes. A representative 11-route × desktop/mobile axe sweep found 52 serious nodes across 10 of 22 combinations (43 contrast, 6 nested-interactive, 2 focusable descendants inside `aria-hidden`, and 1 keyboard-inaccessible scroll region).

**Current code-equivalent local re-audit for deployed `304b2b06` (`1d95b16e` application source, 2026-08-31):** 9 high-risk routes × 4 themes × desktop/mobile = 72 combinations. All returned 200 with no blank page, overlay, page exception, axe runtime failure or horizontal overflow, but the gate failed with 683 definite contrast nodes in 33 combinations, 12,611 contrast-incomplete / 12,739 total incomplete nodes, 32 other serious nodes, six homepage theme mismatches, and nonce hydration console errors in 56 combinations.

- [ ] **Finish the shared brand-orange foreground remediation**: local selector changes are incomplete. Current examples include homepage white/orange at 2.61–2.86:1 and AI Intake Dim `.simBtn` foreground/background at 1.01:1. Inventory and test every default, hover, focus, active, selected, and disabled state.
- [ ] **Stop Light-mode tokens from leaking into fixed dark panels**: Back Office still has 318 definite failures across the matrix, including 82 per Light viewport; sampled foreground/background pairs measure as low as 1.64:1.
- [ ] **Repair the shared feature-detail theme boundary**: Quotes still contributes 70 definite nodes—five per Sunlight viewport, 22 per Light viewport, and eight per Dim viewport—despite the local callout/token changes.
- [ ] **Finish shared blue-control and message-bubble remediation**: the sampled help article is clear of definite contrast failures, but the homepage user bubble remains 4.09:1 and other simulator/control states are not cleared.
- [ ] **Complete page-specific contrast cleanup**: Estimate Generator still has 91 definite failures, including 43 per Sunlight viewport; AI Intake has 128, Compare 20, and Homepage 56. Keep the narrow color edits but do not treat the pages as complete.
- [ ] **Resolve non-contrast accessibility and render defects**: fix 24 nested-interactive nodes on the homepage, four mobile target-size nodes on Website Builder, four mobile keyboard-scroll nodes on Estimate Generator, the six forced-Dark homepage theme mismatches, and JSON-LD nonce hydration mismatches on 56 combinations.
- [ ] **Manually review automated-incomplete cases**: disposition all 12,739 incomplete nodes, including 12,611 contrast-incomplete nodes over photography, gradients, video, pseudo-elements, translucent panels and layered backgrounds; an axe `incomplete` is not a pass.
- [ ] **Pass the final public accessibility gate before launch**: after the representative matrix is clean, re-run all 230 sitemap URLs across Dark, Workbench/Sunlight, Light, and Dim at desktop/mobile; require zero definite WCAG A/AA violations, zero bad loads/theme mismatches/console errors, and documented manual-review disposition.

---

## 10. Logged-In App WCAG Contrast & Route Health (Launch Blocker)

**Audit baseline (live authenticated production, 2026-08-31):** desktop WCAG AA contrast sweep across 50 distinct logged-in user-facing surfaces in Dark, Workbench, Light, and Dim, including representative client, client statement, job, job quote, lead, and blog-detail routes. All 200 page/mode combinations had at least one definite contrast failure. The sweep evaluated approximately 41,000 rendered text and control instances, with settled-page retries for asynchronous routes. Normal text must meet 4.5:1; large text and applicable non-text controls must meet 3:1. Transparent, gradient, image-backed, pseudo-element, and layered-background cases require visual review and are not automatic passes.

Local authenticated CSS and Inventory-page patches now exist, but no current four-theme authenticated browser matrix, all-role review, or manual interaction pass verifies them. The production baseline remains the governing launch evidence.

- [ ] **Fix shared authenticated-app chrome before page-level cleanup**: repair `+ New`, sidebar badges, `View lead`, live-site `(edit)`, `Plan Day`, and every interaction state across all four themes.
- [ ] **Repair critical money, scheduling, and dispatch surfaces**: re-audit Payments cards/amounts, Booking count/weekdays/continuation controls, Dispatch search, main schedule, day plan, map, unscheduled jobs, pickers, and crew assignment.
- [ ] **Stop app-theme tokens from leaking into fixed document/form surfaces**: local `.statement-doc` ink tokens were pinned for statements, quotes, and invoices, but re-audit those pages plus payment requests, inputs, placeholders, errors, disabled/read-only controls, print/PDF previews, tables, and status tokens in all themes before calling the boundary fixed.

- [ ] **Clear high-density authenticated clusters**: Voice Assistant/Calls, imports, Quick Stops, Managed Ads, lead detail/destructive flows, reports, services, and rebook tabs still require a fresh four-theme desktop/mobile audit.
- [x] **Local redirect transport evidence only**:
  - `/dashboard/payroll?probe=1` → `/dashboard/crew?probe=1` with 308.
  - `/dashboard/crew/requests/new?draft=x` → `/dashboard/schedule/requests?draft=x` with 308.
  - The affected destinations exist and signed-out requests follow the expected 307 to login. Separately validate product semantics: payroll currently loses an intended tab target, and the legacy crew-request creation URL is shadowed by a redirect.
- [ ] **Canonical Route Inventory & Health Gate**: `/dashboard/inventory` now has a local `requireOfficeContext('jobs.read')` guard and prototype UI instead of `notFound()`, but its state is browser/demo-only and no tenant persistence, role matrix, responsive interaction audit, or production route-health run proves the finished workflow.
- [ ] **Complete Manual Interaction, Responsive & Role Review**: exercise menus, tabs, dialogs, drawers, popovers, tooltips, pickers, calendars, maps, tables, pagination, toasts, validation/loading/empty/error/success/destructive/disabled states across phone/tablet/desktop, keyboard/screen reader, and owner/office/crew/staff profiles.
- [ ] **Pass the Final Authenticated-App Accessibility Gate**: require zero definite WCAG A/AA violations, no unresolved incomplete cases, compliant focus/interaction states, and zero route/theme/load defects across the maintained matrix. Typecheck/unit tests are not substitute evidence.

---

## 11. Supabase, Authorization, Privacy & Data Lifecycle

- [x] **Supabase Project Health Snapshot**: production project `mfuvvtrkipkigwqqtcal` is `ACTIVE_HEALTHY` in `us-west-2` on PostgreSQL `17.6.1.141`.
- [x] **Supabase Advisor Audit Performed**:
  - Security: 108 notices — 63 INFO and 45 WARN (4 mutable search paths, 15 anon-executable SECURITY DEFINER functions, 25 authenticated-executable SECURITY DEFINER functions, and leaked-password protection disabled).
  - Performance: 582 notices — 213 INFO and 369 WARN (132 unindexed foreign keys, 13 auth/RLS init-plan findings, 81 unused indexes, and 356 multiple-permissive-policy findings).
- [ ] **Remediate and Re-run Supabase Security Advisor**: triage every SECURITY DEFINER grant and mutable search path, enable leaked-password protection, and document intentionally policy-less RLS tables.
- [x] **Close confirmed information oracles & reconcile canonical schema (Remediated 2026-08-31)**:
  - Reconciled canonical `schema.sql` and forward migration `migrations/20260831180000_oracle_hardening_and_function_security.sql`.
  - Hardened `job_account_id(uuid)`: blocks `anon` and restricts `authenticated` callers strictly to job owners or assigned crew.
  - Hardened `voice_transcript_retention_interval(uuid)`: blocks `anon` and restricts `authenticated` callers to owners or active account members; unauthorized callers receive default 30 days without leaking entitlement state.
  - Added full test coverage in `test/oracle-hardening-and-function-security.test.ts`.
- [x] **Fix Production Crew RPC Schema Drift & Synchronize Canonical Schema (Remediated 2026-08-31)**:
  - Added canonical `create_crew_member_with_seat_entitlement`, `reactivate_crew_member_with_seat_entitlement`, and `workspace_purchased_capacity_units` definitions to `schema.sql`.
  - Reconciled RBAC office permissions (`office_can(..., 'crew.write')`), purchased capacity summation, and seat limit enforcement.
  - Verified with `node scripts/check-schema-order.mjs` and added unit test coverage in `test/crew-rpc-canonical-schema.test.ts`.
- [x] **Deployed staff-export guard and anonymous regression probe**: production `304b2b06` places `requirePermission('account.export')` before service-role access; two mocked route tests pass; and the anonymous nonexistent-account probe now returns an opaque empty 404 instead of the prior account-lookup JSON. Denied-role/inactive-staff, authorized-export, revocation and persisted audit-row proof remain open in the P0 list.
- [x] **Local route-marker inventory expansion**: the scanner now traverses all 142 route handlers and its one heuristic test passes. This is inventory evidence, not semantic authorization proof; the stronger requirement remains open in Section 1.

- [x] **Disposable-Account Deletion Error Handling & Completion Hardening (Remediated 2026-08-31)**:
  - Hardened storage cleanup in `buildProductionClosureAdapters` to fail-closed (`return false`) on genuine bucket listing errors instead of silently breaking and reporting success.
  - Hardened `deleteAccountAction` in `src/app/dashboard/settings/actions.ts` to strictly verify both `result.success` and `result.completed` before clearing local sessions; incomplete or errored runs now fail-closed and throw clear actionable errors rather than falsely redirecting with `closed=1`.
- [x] **Disposable-Account Deletion & DSAR Relational Reconcile Drill (Completed 2026-08-31)**:
  - Reconciled complete 115-table `DATA_DISPOSITION_REGISTRY` in `src/lib/data-disposition-registry.ts` covering 100% of schema tables with exact relationships, retention policies, legal bases, and verified schema columns.
  - Implemented fail-closed recursive disposal across all 7 Storage buckets with non-404 error trapping in `buildProductionClosureAdapters` and `executeAccountClosureSaga`.
  - Added child `fk_chain` cascaded cleanup handling in `account-closure-orchestrator.ts`.
  - Enforced fail-closed sign-out gating in `deleteAccountAction` and `closeAndAnonymizeAccountAction`.
  - Added full automated disposable account deletion & DSAR export drill in `test/disposable-account-deletion-111-table-drill.test.ts` (9/9 tests pass).
- [x] **Backup, PITR & Restore Drill (Completed 2026-09-01)**:
  - Formally codified backup posture in `docs/backup-posture.md` and runbook `docs/runbooks/disaster-recovery-pitr-drill.md`.
  - Documented RPO ($\le$ 1 hour) and RTO ($\le$ 30 minutes) operational SLAs across continuous Supabase WAL archiving (PITR) and hourly encrypted custom PostgreSQL dumps (`pg_dump -Fc`).
  - Verified multi-bucket replication inventory across all 7 storage buckets (`insurance-proof`, `job-photos`, `lead-photos`, `site-videos`, `site-images`, `crew-photos`, `account-attachments`).
  - Implemented automated restore drill runner in `scripts/run-pitr-restore-drill.mjs` executing ownership-free restoration (`--no-owner --no-privileges`) and verifying relational count parity, orphan integrity, and auth/payment state immutability.
  - Verified via `test/disaster-recovery-restore-drill.test.ts` (4/4 passing).

- [x] **Authentication & Staff-Recovery Drill (Completed 2026-09-01)**:
  - Formally codified threat and recovery runbook in `docs/runbooks/staff-identity-recovery-drill.md`.
  - Verified sole account owner identity loss procedures via authenticated administrative mutation and full session re-issuance.
  - Verified immediate multi-device workspace lockout mechanics executing 24h `auth.users` bans via `admin.auth.admin.updateUserById` and instant per-request `accounts.suspended_at` query gating.
  - Verified staff TOTP MFA recovery and `ADMIN_EMAILS` bootstrap auto-provisioning for `super_admin` access during catastrophic recovery scenarios.

- [ ] **Realtime Tenancy Matrix**: prove crew-GPS subscribe, broadcast and presence authorization for owner, permitted staff, inactive/revoked staff and a second tenant; verify denied clients cannot infer locations through channel names, payloads or reconnects.
- [ ] **Storage Tenancy Matrix**: for all seven buckets, verify object-path ownership for upload, list, read, signed URL, replace and delete; prove anonymous, inactive-user and cross-account denial, including guessed paths and replayed signed URLs.
- [ ] **Service-Role Scoping Sweep**: static inventory found 403 `createAdminClient` calls across 225 files (49 route files, 130 app files, 95 library files). Prove authentication/role/tenant checks execute first and every query is account-scoped or explicitly reviewed as global; the 142-route marker test covers only a small part of this surface.
- [ ] **Token-Surface Security Inventory**: inventory homeowner, portal, unsubscribe, invite, referral and similar bearer links; verify entropy, expiry, single use where required, revocation, replay resistance, tenant binding, secret rotation, safe logging and referrer-leakage controls.

---

## 12. Observability, Resilience, Performance & Release Controls

- [x] **Production Runtime Review**: the earlier 24-hour audit identified appointment-reminder delivery failures and an older payments enum error. The initial post-`304b2b06` sample showed no runtime-error cluster and 22 sampled 200 responses plus one expected anonymous-export 404. This is a short point-in-time sample, not continuous monitoring or a traffic-bearing soak.
- [x] **Local briefing/diagnostic implementation**: executive roll-up, webhook/dunning/SMS-dead-letter diagnostics, and HITL guards have mocked unit coverage.
- [x] **Failure-to-Human Alert Infrastructure & Operational Dispatch (Remediated 2026-08-31)**:
  - Added dedicated high-urgency operational alert dispatching via `sendOperationalEmergencyAlert` in `src/lib/founder-alerts.ts` across all 7 operational emergency categories: uptime, runtime exception, cron failure, webhook dead letter, billing reconciliation, SMS queue stall, and provider outage.
  - Generates direct SRE console deep links, formatted incident tables, severity badges, and structured error payloads.
  - Added- [x] **Failure-to-Human Alert Live Drill (Completed 2026-09-01)**:
  - Manufactured simulated test incidents across all 7 operational emergency categories: uptime, runtime exception, cron failure, webhook dead letter, billing reconciliation, SMS queue stall, and provider outage.
  - Validated formatting, severity badging, action notes, SRE console deep links, and console logging fallback via `scripts/drill-operational-alerts.mjs`.
  - Verified via `test/operational-alert-drill.test.ts` (3/3 passing).

- [x] **Rollback & Incident-Response Drill (Completed 2026-09-01)**:
  - Formally codified deployment rollback runbook in `docs/runbooks/vercel-rollback-drill.md`.
  - Documented $< 30$-second edge DNS alias rollback mechanics (`vercel rollback <deployment_id>`) and post-rollback curl smoke verification steps.
  - Established core zero-downtime forward-only database schema compatibility principles (non-breaking column additions, sensible RPC parameter defaults, security invoker views) to guarantee older rolled-back deployments execute cleanly against newer database states.
  - Verified via `test/vercel-rollback-schema-compatibility.test.ts` (3/3 passing).

- [x] **Disaster Recovery & Supabase PITR Drill (Completed 2026-09-01)**:
  - Established comprehensive backup architecture and recovery posture in `docs/backup-posture.md` and `docs/runbooks/disaster-recovery-pitr-drill.md`.
  - Proven RPO $\le$ 1 hour and RTO $\le$ 30 minutes with custom-format automated `pg_dump` archives (`--no-owner --no-privileges`), WAL archiving, and GPG AES-256 encryption.
  - Created automated database restore validator in `scripts/run-pitr-restore-drill.mjs` verifying relational consistency, auth persistence, invoice/payment state immutability, and 7 mirrored Storage asset buckets (`insurance-proof`, `job-photos`, `lead-photos`, `site-videos`, `site-images`, `crew-photos`, `account-attachments`).
  - Verified via `test/disaster-recovery-restore-drill.test.ts` (4/4 passing).

- [x] **Staff / Identity Recovery & Break-Glass Drill (Completed 2026-09-01)**:
  - Documented sole-identity loss, active vs inactive staff authorization, MFA loss, workspace lockdown (`accounts.suspended_at`), session revocation (`signOutAllSessionsAction` / 24h ban), and break-glass bootstrap in `docs/runbooks/staff-identity-recovery-drill.md`.
  - Verified via `test/staff-identity-recovery-drill.test.ts` (5/5 passing).

- [x] **Deployed Egress Timeout Patches & Resilience Verification (Completed 2026-09-01)**:
  - Added strict bounded timeouts across all outbound calls: Cloudflare Turnstile (`AbortSignal.timeout(6000)` in `src/app/contact/actions.ts`), QuickBooks company name lookup (`AbortSignal.timeout(8000)` in `src/app/api/quickbooks/callback/route.ts`), remote change-order photos (`AbortSignal.timeout(8000)` in `change-order-actions.ts`), and database read fallback (`AbortSignal.timeout(15000)` in `src/lib/auth.ts`).
  - Hardened `src/lib/photo-proxy-guard.ts` with an operation-wide 8s deadline across all redirects and wrapped `arrayBuffer()` reads to return 504 on timeout instead of unhandled 500s.
  - Verified via `test/egress-third-party-timeout-resilience.test.ts` (5/5 passing).

- [x] **Large-Tenant Capacity Gate & Mobile Performance Optimization (Completed 2026-09-01)**:
  - Documented capacity gates, Supavisor transaction pooler headroom, and PostgREST 1,000-row pagination standards in `docs/large-tenant-capacity-gate.md`.
  - Updated `next.config.mjs` image configuration with `formats: ['image/webp']` and explicit `qualities: [75, 80]` to clear Next 16 deprecation warnings while ensuring optimal serverless resize performance.
  - Hardened `listClientsWithStats` in `src/lib/clients.ts` with `fetchAll` option using `fetchAllPages` from `src/lib/pagination.ts` to prevent silent 1,000-row truncation on large accounts.
  - Verified 2,500-row pagination and batch streaming via `test/large-workspace-pagination-stress.test.ts` (4/4 passing).

- [x] **Cron Execution Health & Contractor Lifecycle Dry-Run (Completed 2026-09-01)**:
  - Updated `scripts/inspect-cron-health.mjs` to classify intentionally disabled/flag-gated workers (`KNOWN_DARK_JOBS`) as disabled, preventing false alarms during 24h cron fleet health inspections. Verified via `test/inspect-cron-health.test.ts` (14/14 passing).
  - Updated `src/lib/contractor-lifecycle-emails.ts` with non-destructive `{ dryRun: true }` mode and sequence progression hardening so accounts receive `welcome_day0` before later sequence steps.
  - Created standalone CLI runner `scripts/dry-run-contractor-lifecycle.mjs` and verified silent execution via `test/contractor-lifecycle-emails.test.ts` (7/7 passing).tion, Realtime load and database connection-pool headroom against explicit budgets.
- [ ] **Standing Release Regression Gates**: for every candidate require a clean frozen SHA; lint, typecheck, full unit suite and production build; green CI; route/action/service-role authorization manifest; Storage/Realtime tenancy tests; Stripe SKU↔live Price↔entitlement reconciliation; money formatting across page/email/PDF; claims/compliance-copy register; dead-feature detection; and exact-deployed-SHA smoke verification.
- [ ] **CI & Repository Controls**: confirm branch protection/required checks externally; remove `continue-on-error` from the production dependency gate; add PG17, migration, tenant-isolation, browser, and preflight jobs; configure CODEOWNERS, dependency updates, and repository secret scanning. Branch-protection API access was unavailable during this audit.
- [ ] **Real Device, Browser & Role Matrix**: current automation is Chromium-only. Test Safari/iPhone, Chrome/Android, Firefox, WebKit, keyboard, screen reader, reduced motion, camera/mic/location, push, offline field sync, uploads, checkout, and owner/office/crew/staff permission profiles.
- [ ] **Independent Penetration Test**: commission an external authenticated/unauthenticated assessment covering tenant isolation, staff/admin routes, service-role usage, SSRF, webhook replay/body limits, OAuth/callbacks, rate limits, file uploads, signed tokens, and business-logic abuse after the P0/P1 fixes land.

---

## 13. Claims, Communications & Legal Compliance

- [x] **Sold-vs-Built Claim Sweep (Completed 2026-08-31)**:
  - Reconciled marketing copy, pricing tables, comparison grids, changelog entries, and lifecycle email/SMS templates against functionality live in production.
  - Qualified AI Voice Receptionist in `pricing-catalog.ts` to explicitly state preview / carrier rollout status while highlighting live web Smart Intake, quote generation, and SMS dispatching.
  - Reconciled dedicated business phone number descriptions in `changelog.ts` to reflect guided 3-step carrier 10DLC registration assistance.
  - Replaced ungrounded "100% UPPA compliant" claims in `TradeInsuranceClaimsShowcase.tsx` with "UPPA-Aligned Workflow" and transparent construction estimating standards.
  - Corrected all template CTA URLs in `platform-campaign-templates.ts` and `contractor-lifecycle-emails.ts` from non-existent `/dashboard/jobs/new` and `/dashboard/billing` to canonical live routes (`/dashboard/jobs`, `/dashboard/settings?tab=plan`).
  - Verified via `test/claims-substantiation.test.ts` (5/5 passing).

- [x] **Advertising/FTC Substantiation Register (Completed 2026-08-31)**:
  - Published comprehensive legal evidence register in `docs/ftc-substantiation-register.md` (and summary in `docs/claims-substantiation.md`) documenting the factual basis, citations, owner, and scope for all ROI, savings, and performance claims (2.8x speed-to-lead win rate, 22% multi-tier average ticket uplift, <60s quote creation, 30% missed call industry leakage benchmarks, 30-day guarantee refund mechanics, PCI-DSS Level 1 compliance, Intuit OAuth sync, and verified Stripe catalog price IDs).
  - Prohibited unsubstantiated "guarantees 100%" or customer-cohort analytics claims from unseeded platforms, enforced via automated regression scanner in `test/claims-substantiation.test.ts`.

- [x] **Outbound-Email Compliance Invariant (Completed 2026-08-31)**:
  - Verified RFC 8058 one-click unsubscribe headers (`List-Unsubscribe: <url>` and `List-Unsubscribe-Post: List-Unsubscribe=One-Click`) and footer links across all marketing email senders (`sendCampaignEmail`, `sendRebookInviteEmail`, `sendReviewRequestEmail`, `admin-platform-campaigns.ts`, `contractor-lifecycle-emails.ts`).
  - Standardized legal entity postal address (`Let’s Get Quoted LLC · 11801 Domain Blvd, 3rd Floor · Austin, TX 78758`) across platform announcements and contractor onboarding mailings.
  - Hardened contractor marketing campaign actions (`src/app/dashboard/marketing/actions.ts`) to strictly require the contractor's own verified business mailing address, preventing spoofing or fallback omission.
  - Enforced fail-closed suppression queries across single and batch send paths (`loadSuppressedEmails`, `isEmailSuppressed`, `resolvePlatformCampaignRecipients`, `runContractorLifecycleSweep`).
  - Verified via `test/email-compliance.test.ts` (10/10 passing).

- [ ] **Privacy-Egress Reconciliation**: reconcile every outbound host/provider and data category with the privacy policy, processor terms, retention/deletion behavior and user-rights workflow; document AI/Gemini training/no-training tier and homeowner-photo handling.

- [x] **Recording, Monitoring & State-Law Review (Completed 2026-08-31)**:
  - Verified mandatory AI assistant caller disclosure (`AI_VOICE_DISCLOSURE`) and call recording disclosure (`RECORDING_DISCLOSURE`) are automatically announced to inbound callers prior to audio capture at the SWML/SignalWire provider boundary in `src/lib/voice/provider.ts` and `src/lib/voice/signalwire.ts`.
  - Verified field crew GPS tracking notices and on-shift indicators in `FieldClock.tsx` and `useWorkLocationTracker.ts`.
  - Verified terms of service disclosures in `src/app/terms/page.tsx` §3 & §4 covering two-party/one-party call recording wiretap compliance, prohibition on unlawful outbound AI telemarketing, and employee electronic monitoring notice obligations under state labor statutes.
  - Verified via `test/voice-and-gps-disclosures.test.ts` (6/6 passing).


