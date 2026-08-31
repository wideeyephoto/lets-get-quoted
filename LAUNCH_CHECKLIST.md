# Official Pre-Launch & Go-Live Checklist — Let's Get Quoted

This is the definitive production deployment and launch checklist. A checked item requires dated command output or external-system evidence. A completed audit may be checked even when it found defects; every failed requirement remains separately unchecked. Configuration presence alone is not runtime proof.

---

## 0. Current Audit Decision (2026-08-31)

**Launch status: NOT READY.** Production is deployed and serving, but the release gate is red and the following critical requirements are open:

- [ ] **P0 — Deploy and verify staff account-export authorization and auditing**: local source now calls `requirePermission('account.export')` before service-role access, but production `e3550f58` remains exposed. The two route tests mock authorization; add inactive-staff and missing-permission denial cases, prove a persisted audit row, deploy the exact SHA, and repeat the anonymous production probe.
- [ ] **P0 — Repair the production crew create/reactivate RPCs**: local source edits the already-applied `20260824140000` migration, which does not update installed production functions. Add a forward `CREATE OR REPLACE` migration, apply it, and prove owner/office create, reactivate, seat-limit, purchased-capacity, and concurrency behavior.
- [ ] **P0 — Make Managed Ads money movement replay-, price-, and concurrency-safe**: local guards and 14 mocked tests are partial. Client-controlled charge/spend values remain unbound; payment status is not fail-closed; webhook/refill state uses non-atomic capped JSON; and ambiguous provider outcomes, return URLs, phone verification, cancellation, and reconciliation remain unsafe.
- [ ] **P0 — Repair account deletion and prove data disposition**: recursive enumeration for seven real buckets is local, but Storage list errors and missing Stripe configuration can still report success, and the customer is signed out/redirected after cleanup errors. Fail closed and complete a disposable-account export/delete/Storage/vendor/retry drill against all 111 tables.
- [ ] **Restore the release gate, not only local checks**: committed source HEAD `1d95b16e` passes lint, typecheck, 856/856 Vitest files (11,476/11,476 tests), schema ordering, the production-dependency audit, and an isolated 386-page build. It is still 17 commits ahead of production, GitHub CI has not passed it, and that exact SHA has not been deployed or smoke-tested.
- [ ] **Repair and prove the first-annual-plan 30-day guarantee money path**: three local behaviors improved, but Stripe Dahlia Invoice Payments compatibility, eligibility, atomic once-per-entity claiming, cancellation/refund failure handling, reconciliation, and provider-backed E2E proof remain open in Section 8.
- [ ] **Clear the public and authenticated WCAG gates**: the latest recorded public 72-combination rerun at `3f48eafa` plus regenerated lite CSS has 683 definite contrast failures, 12,609 incomplete cases, 32 other serious nodes, six theme mismatches, and hydration errors in 56 combinations; later public-component changes at `1d95b16e` have not been rerun, and the authenticated production baseline remains red.
- [ ] **Reconcile the SMS quiet-hours legal promise with atomic delayed delivery**: the local implementation creates an immediately due task and separately updates `available_at`, ignores update failure, and can race the worker. Make delayed enqueue atomic and prove later send, expiry, retry, and opt-out behavior.


---

## 1. Automated Quality, Deployment & Data-Boundary Evidence

- [x] **Current Production Revision**: Vercel deployment `dpl_A22GLRVuyC4GUiu1Vius8Wk2Dsne` is READY on commit `e3550f58`, matches `origin/main`, and completed at `2026-08-31 20:36:34Z` with apex, wildcard, and project aliases.
- [ ] **Source/Deployment Parity**: audited committed source HEAD is `1d95b16e`, 17 commits ahead of `origin/main`/production `e3550f58`. Its exact-head local gates are green, but this checklist update is not part of that SHA and the source SHA has no green CI or deployment. Freeze the final tree, rerun the standing gate, and deploy/smoke exactly that commit.
- [x] **Production/Local Build Evidence**: production `e3550f58` built successfully on Vercel. An isolated local Next.js `15.5.24` build against exact source HEAD `1d95b16e` completed with 386 of 386 static pages; one non-failing edge-runtime/static-generation warning remains. This does not replace CI or exact-deployed-SHA verification.
- [x] **TypeScript Typecheck Snapshot**: exact source HEAD `1d95b16e` exited `0` under `tsc --noEmit -p tsconfig.test.json`; deployed `e3550f58` also passed under TypeScript `5.9.3`.
- [x] **ESLint**: exact source HEAD `1d95b16e` exited `0` with 0 warnings and 0 errors under `npm run lint`.

- [x] **Production Dependency Audit**: exact source HEAD `1d95b16e` exited `0` under `npm audit --omit=dev`, with 0 vulnerabilities across 187 production dependencies.
- [x] **Full Local Vitest Gate**: exact source HEAD `1d95b16e` passed 856 of 856 files and 11,476 of 11,476 tests on 2026-08-31. This is local code evidence; provider mocks do not prove live money, carrier, email, tenant-role, or recovery journeys.
- [ ] **GitHub CI Gate**: run `33436652279` for production/origin commit `e3550f58` failed in Unit tests; later SEO, typecheck, lint, and build steps were skipped. No CI run exists for the local commits.
- [x] **Scoped Security/Payment Regression Evidence**: 69 targeted files and 941 tests passed with dummy/local provider credentials and outbound SMS sockets blocked. Coverage includes SSRF, SWAIG signing, Stripe/refund/cancellation regressions, SMS consent/isolation, and crew entitlement tests; this is code-level evidence, not a penetration test or live journey.
- [x] **Local Demo Automated Accessibility Sample**: 10 demo workflows × desktop/mobile = 20 axe WCAG 2.0/2.1/2.2 combinations loaded with 0 definite rule violations.
- [x] **Schema Ordering**: `node scripts/check-schema-order.mjs` passes.
- [ ] **Applied Migration Synchronization**: not established.
  - Full audit: 68 applied, 7 source-patched, 0 detected gaps, and 45 indeterminate of 120.
  - Recent audit: 11 applied, 1 source-patched, and 18 indeterminate of 30.
  - Standard migration history has 72 entries and stops at `20260822010024`, although later objects exist; the current dependency audit exits `1` at 136/139 with three missing-dependency findings. Local source ordering for the edited crew/oracle migrations is not proof that production functions were replaced.
- [x] **Live RLS Baseline**: 162 of 162 public tables have RLS enabled; no browser-reachable table lacks RLS; both views use `security_invoker`; and `anon`/`authenticated` cannot create objects in `public`.
- [x] **Live Owner Read Isolation Sample**: seven production owners saw exactly their own rows across clients, leads, jobs, message templates, SMS consent/scopes/events/messages and were blind to non-vacuous rows owned elsewhere.
- [ ] **All-Role and Mutation Isolation**: production has no office membership and no linked crew identity available for a live matrix. Office/crew reads and cross-tenant writes/sends remain unproven in production.
- [ ] **Semantic Route-Authorization Coverage**: the local marker inventory now traverses all 142 `src/app/**/route.{ts,js}` handlers, but its single passing test is substring/prefix based and can accept a marker anywhere or blanket-exempt broad route families. Add method-, role-, tenant-, order-, and service-role-aware tests; deploy the export guard; and prove inactive/missing-permission denials.
- [ ] **Route, Server-Action & Service-Role Authorization Manifest**: inventory every route handler and exported server action; prove the relevant guard executes before service-role access; and exercise anonymous, inactive, wrong-role, wrong-method, cross-tenant, replay, and direct-call denials rather than relying on source markers.


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

### Managed Ads Billing (Launch Blocker; partial local patch 2026-08-31)

- [ ] Require exact settled payment state and durable event/session deduplication before provisioning. The current code rejects only exact `unpaid`, accepts missing/other states, and checks a capped non-atomic JSON history after external Google creation.
- [x] **Local narrow state guard**: `executeWalletRefillCharge` now refuses inactive, paused, and cancellation-scheduled campaigns. Deployment and live/provider verification remain open.
- [x] **Local narrow invoice guard**: `invoice.paid` no longer blindly reactivates an unprovisioned or paused campaign. Out-of-order event/version handling and Google-state reconciliation remain open.
- [ ] Bind charge, fee, and ad-spend amounts to a server-owned catalog. The authenticated route currently accepts client-controlled total/spend/fee values, so a small Stripe charge can request a much larger Google budget.
- [ ] Replace JSON read/merge/write state with durable claims, unique event/operation rows, atomic wallet crediting, body limits, and ambiguity-safe provider retries. Do not clear an idempotency key after an unknown Stripe outcome.
- [ ] Add checkout/customer idempotency, same-origin return-URL validation, server-enforced phone verification/consent, cancellation idempotency, Google pause/reconciliation, and strict billing authority.
- [ ] Pass adversarial tests for exact payment states, parallel delivery/refill, >20-event replay, database-write failure, ambiguous provider success, stale/out-of-order events, return URLs, phone bypass, and cancellation recovery. The current focused file passes 14 of 14 mocked tests but contains no true concurrent test.

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

- [x] **Current-Revision Edge Routing**: verified against production deployment `dpl_A22GLRVuyC4GUiu1Vius8Wk2Dsne` / `e3550f58`.
  - HTTP → HTTPS, `www` → apex, marketing app-host → apex, app login, unauthenticated dashboard → login, and trailing-slash behavior pass.
  - Apex, `app`, wildcard, and project aliases are attached to the current deployment.
- [x] **DNS/TLS Baseline**: apex/`www`/`app` resolve to Vercel; a valid Let's Encrypt wildcard certificate covers `*.letsgetquoted.com` and `letsgetquoted.com`; TLS 1.3 and HTTP/2 pass; HSTS is `max-age=31536000; includeSubDomains`.
- [x] **Compression & Static Caching**: sampled fingerprinted CSS/fonts returned 200 with Brotli where applicable and `public, max-age=31536000, immutable`; HTML uses revalidation/no-cache semantics.
- [x] **Robots, Sitemap & Public Crawl**:
  - `robots.txt` and `sitemap.xml` return 200.
  - 230 of 230 sitemap URLs return 200; all have title, description, canonical, and indexable metadata; 280 JSON-LD blocks parse.
  - 298 unique internal destinations were crawled.
- [x] **Local source patch for two broken internal links (2026-08-31)**:
  - `/features/ai-voice` updated to link to `/demo/messages`.
  - `/for/roofers` and `/for/gutters` in `trade-clusters.ts` updated to link to `/features/ai-vision`.
- [ ] **Deploy and production-recrawl local SEO fixes**: production `e3550f58` still serves the broken links and wrong login metadata. Deploy the audited SHA, repeat the 298-destination crawl, and verify the live login canonical/robots response.
- [ ] **Harden CSP Before Enforcement**: the enforced policy currently protects only `frame-ancestors`; the full policy remains report-only. The homepage nonce did not appear on any of 39 script tags, and Contact left 33 of 35 scripts without it, so enforcing the present full policy would block first-party Next.js scripts. Decide COOP/CORP policy as part of the same review.
- [ ] **CSP Reporting Pipeline & Enforcement Exit Criteria**: prove reports are authenticated/rate-limited, retained, deduplicated, alerted, and reviewable; define acceptable violation budgets and run a staged report-only → canary-enforced → fully enforced rollout without breaking first-party scripts.
- [ ] **Next.js Render/Cache & Served-Edge Security Matrix**: compare static, ISR, dynamic, RSC, and Router Cache behavior across host classes; verify nonce/theme/tag request context, session-cookie flags, middleware matcher coverage, security headers, and built-client/RSC output for secret leakage. Make cache lifetimes and invalidation explicit.
- [x] **Local app-login metadata patch (2026-08-31)**: `src/app/login/layout.tsx` adds `robots: { index: false, follow: false }` and canonical `https://app.letsgetquoted.com/login`; deployment verification remains open above.
- [ ] **Minimize or protect diagnostic health endpoints**: local `/api/health` removes raw database error text and the exact region, but remains public/unlimited and exposes provider/config/topology details while using service-role access. `/api/permits/health` still exposes implementation, secret-state, storage, and jurisdiction diagnostics. Make both opaque or authenticated/rate-limited and verify live behavior.
- [ ] **Repair production mobile clipping**: `/features` is visibly clipped at 390 px in the production viewport sample; fix and re-run representative real-device/responsive checks.


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

- [x] **Current Production Deployment Identified and Smoked**: `e3550f58` / `dpl_A22GLRVuyC4GUiu1Vius8Wk2Dsne` is READY with apex/subdomain routing, current asset tags, and no runtime-error cluster observed after its deployment during the audit window.
- [ ] **Deploy an Audited Green Revision**: audited committed source HEAD `1d95b16e` is 17 commits ahead of `origin/main`/production `e3550f58`. Exact-head lint, typecheck, 11,476 tests, dependency/schema checks, and the isolated 386-page build are green, but this checklist update is not in that SHA, GitHub CI is red/absent for the candidate, and no exact-SHA deployment exists. Freeze the final commit, rerun the standing gate, obtain green CI, deploy it, then repeat edge, accessibility, billing, webhook, and cron smoke checks.
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

**Latest recorded local re-audit (`3f48eafa` plus regenerated lite CSS, 2026-08-31; later `1d95b16e` public-component changes not rerun):** 9 high-risk routes × 4 themes × desktop/mobile = 72 combinations. All returned 200 with no blank page, overlay, page exception, or horizontal overflow, but the gate failed with 683 definite contrast nodes in 33 combinations, 12,609 incomplete nodes, 32 other serious nodes, six homepage theme mismatches, and nonce hydration console errors in 56 combinations.

- [ ] **Finish the shared brand-orange foreground remediation**: local selector changes are incomplete. Current examples include homepage white/orange at 2.61–2.86:1 and AI Intake Dim `.simBtn` foreground/background at 1.01:1. Inventory and test every default, hover, focus, active, selected, and disabled state.
- [ ] **Stop Light-mode tokens from leaking into fixed dark panels**: Back Office still has 318 definite failures across the matrix, including 82 per Light viewport; sampled foreground/background pairs measure as low as 1.64:1.
- [ ] **Repair the shared feature-detail theme boundary**: Quotes still contributes 70 definite nodes—five per Sunlight viewport, 22 per Light viewport, and eight per Dim viewport—despite the local callout/token changes.
- [ ] **Finish shared blue-control and message-bubble remediation**: the sampled help article is clear of definite contrast failures, but the homepage user bubble remains 4.09:1 and other simulator/control states are not cleared.
- [ ] **Complete page-specific contrast cleanup**: Estimate Generator still has 91 definite failures, including 43 per Sunlight viewport; AI Intake has 128, Compare 20, and Homepage 56. Keep the narrow color edits but do not treat the pages as complete.
- [ ] **Resolve non-contrast accessibility and render defects**: fix 24 nested-interactive nodes on the homepage, four mobile target-size nodes on Website Builder, four mobile keyboard-scroll nodes on Estimate Generator, the six forced-Dark homepage theme mismatches, and JSON-LD nonce hydration mismatches on 56 combinations.
- [ ] **Manually review automated-incomplete contrast cases**: disposition all 12,609 incomplete nodes over photography, gradients, video, pseudo-elements, translucent panels, and layered backgrounds; an axe `incomplete` is not a pass.
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
- [ ] **Close confirmed information oracles in production**:
  - A local forward migration revokes anonymous access to `job_account_id(uuid)` and adds a tenant check, but it is not applied or live-tested.
  - `voice_transcript_retention_interval(uuid)` remains executable by `authenticated` without tenant-membership authorization, so a signed-in cross-account oracle remains. `schema.sql` also retains the older unguarded definition.
  - Reconcile canonical schema, enforce tenant authorization, apply the migration, test anon plus cross-account authenticated callers, and rerun Security Advisor.
- [ ] **Fix Production Crew RPC Schema Drift**: local edits reference `workspace_entitlements`, `crew_users`, and purchased capacity, but only modify an already-applied historical migration. Add/apply a forward replacement and run live owner/office/create/reactivate/limit/concurrency tests.
- [x] **Local staff-export source patch**: `requirePermission('account.export')` now precedes service-role access and two mocked route tests pass. Production deploy, denied-role/inactive-staff integration, and persisted audit-row proof remain open in the P0 list.
- [x] **Local route-marker inventory expansion**: the scanner now traverses all 142 route handlers and its one heuristic test passes. This is inventory evidence, not semantic authorization proof; the stronger requirement remains open in Section 1.

- [ ] **Disposable-Account Deletion & DSAR Drill**:
  - Local code now recursively enumerates the seven real Storage buckets and includes fencing, but a Storage `list` error breaks the loop and can still return success; missing Stripe configuration also returns success.
  - The customer action logs `!result.success` but still signs out and redirects with `closed=1`, and callers do not reliably honor `completed`.
  - Reconcile the 25-entry registry against all 111 schema tables and run a real disposable-account export/delete drill covering relational rows, nested Storage, Stripe/vendor cleanup, audit evidence, retries, partial failures, and recovery.
- [ ] **Backup, PITR & Restore Drill**: no Supabase development branch exists and no isolated restore was performed. Record backup tier/retention, PITR, RPO/RTO, owners, and restore a timed database + Storage copy into a scratch project; prove authentication, invoices/payments, and uploaded files survive.
- [ ] **Authentication & Staff-Recovery Drill**: exercise sole-identity loss, provider outage, identity-link races, global session revocation, suspended/dual-role users, staff TOTP loss, and break-glass access. Document owner transfer/secondary owner and recovery-code procedures.
- [ ] **Realtime Tenancy Matrix**: prove crew-GPS subscribe, broadcast and presence authorization for owner, permitted staff, inactive/revoked staff and a second tenant; verify denied clients cannot infer locations through channel names, payloads or reconnects.
- [ ] **Storage Tenancy Matrix**: for all seven buckets, verify object-path ownership for upload, list, read, signed URL, replace and delete; prove anonymous, inactive-user and cross-account denial, including guessed paths and replayed signed URLs.
- [ ] **Service-Role Scoping Sweep**: inventory every `createAdminClient`/service-role call in routes, server actions, libraries, jobs and cron handlers. Prove authentication/role/tenant checks execute first and every query is account-scoped or explicitly reviewed as global.
- [ ] **Token-Surface Security Inventory**: inventory homeowner, portal, unsubscribe, invite, referral and similar bearer links; verify entropy, expiry, single use where required, revocation, replay resistance, tenant binding, secret rotation, safe logging and referrer-leakage controls.

---

## 12. Observability, Resilience, Performance & Release Controls

- [x] **Production Runtime Review**: the 24-hour log audit identified appointment-reminder delivery failures and an older payments enum error; no runtime errors were observed after `e3550f58` completed deployment during the audit window. This is a point-in-time sample, not continuous monitoring.
- [x] **Local briefing/diagnostic implementation**: executive roll-up, webhook/dunning/SMS-dead-letter diagnostics, and HITL guards have mocked unit coverage.
- [ ] **Failure-to-Human Alert Drill**: safely manufacture one failure each for uptime, runtime exception, cron, webhook/dead letter, billing reconciliation, SMS queue, and provider outage; prove actual delivery, acknowledgement time, escalation, and resolution evidence. The local briefing test does not prove a human was alerted.
- [ ] **Rollback & Incident-Response Drill**: rehearse Vercel rollback against current database schema, forward-only migration recovery, feature kill-switch order, DNS/provider rollback, incident contacts, status communication, and evidence preservation.
- [x] **Local Egress Timeout Patches (2026-08-31)**: fail-fast timeouts were added on enumerated SignalWire, OpenAI, Google Ads/Maps/Solar/StreetView, Vercel Domains, Pexels, QuickBooks API, photo-proxy, NWS, Census and RentCast paths. This is implementation evidence, not a complete inventory or failure-behavior audit.
- [ ] **Complete Egress Inventory & Third-Party Failure Matrix**: unbounded or unreviewed paths still include Turnstile, the QuickBooks callback company lookup, remote change-order photos and the global Supabase fetch wrapper. Enforce one operation-wide deadline or documented exemption; the photo proxy currently resets its 8-second timer per redirect and may surface a slow-body abort as a generic 500. Inject DNS failure, connect/header/body timeout, 429, 5xx, malformed data, ambiguous success, duplicate/out-of-order callbacks and retry exhaustion; prove bounded latency, idempotency, durable state, alerts and user-visible recovery.
- [ ] **OpenAI Timeout Accounting & Observability**: fault-inject primary and forced-retry timeouts in public lead classification; prove the correct legacy/classic fallback, usage lease release exactly once with no commit, bounded attempts, no hang, and an operator-visible metric/log for potentially billed ambiguous attempts.
- [x] **Local owner-phone OTP rate limits**: send and verify use strict distributed buckets.
- [ ] **Abuse & Cost-DoS Audit**: public health/permit diagnostics and ad-budget checkout still lack complete rate/cost controls, and the ad route accepts client-controlled money/spend inputs. Exercise fail-closed distributed limits for OTP, SMS, AI, PDF, uploads, diagnostics, and Stripe-session creation under concurrency and provider failure.


- [ ] **Performance & Capacity Gate**:
  - Current production mobile synthetic sample (1.6 Mbps, 150 ms latency, 4× CPU) measured homepage median LCP 5.95s, Pricing 7.41s, and AI Voice 4.07s; target ≤2.5s and verify with Lighthouse plus field Web Vitals.
  - Load-test large tenants, simultaneous webhooks/crons, database pool saturation, exports, uploads/PDFs, queues, and dashboard/API P50/P95/P99 without using production customer data.
- [ ] **Changed-Image Cold-Cache Browser Audit**: at 390×844, capture request waterfall, bytes, LCP and CLS for `/`, `/pricing`, `/features/ai-intake` and `/features/website-builder`; prove below-fold images defer before scroll, decode after scroll, and changed orbit/lightbox/simulator/slider interactions work. Run three throttled LCP samples against the pre-change baseline; review whether `quality={80}` increases bytes/cache variants.
- [ ] **Cron Replay-Safety Inventory**: for every scheduled handler, record schedule, flag, authentication, `maxDuration`, batch/page limits, lock/lease, crash windows, durable cursor, idempotency and replay procedure; exercise duplicate, overlapping and mid-batch-crash runs.
- [ ] **Large-Tenant Capacity Gate**: seed a representative 2,000-row workspace and test the Supabase 1,000-row response ceiling, pagination/export completeness, dashboard latency, cron completion, Realtime load and database connection-pool headroom against explicit budgets.
- [ ] **Standing Release Regression Gates**: for every candidate require a clean frozen SHA; lint, typecheck, full unit suite and production build; green CI; route/action/service-role authorization manifest; Storage/Realtime tenancy tests; Stripe SKU↔live Price↔entitlement reconciliation; money formatting across page/email/PDF; claims/compliance-copy register; dead-feature detection; and exact-deployed-SHA smoke verification.
- [ ] **CI & Repository Controls**: confirm branch protection/required checks externally; remove `continue-on-error` from the production dependency gate; add PG17, migration, tenant-isolation, browser, and preflight jobs; configure CODEOWNERS, dependency updates, and repository secret scanning. Branch-protection API access was unavailable during this audit.
- [ ] **Real Device, Browser & Role Matrix**: current automation is Chromium-only. Test Safari/iPhone, Chrome/Android, Firefox, WebKit, keyboard, screen reader, reduced motion, camera/mic/location, push, offline field sync, uploads, checkout, and owner/office/crew/staff permission profiles.
- [ ] **Independent Penetration Test**: commission an external authenticated/unauthenticated assessment covering tenant isolation, staff/admin routes, service-role usage, SSRF, webhook replay/body limits, OAuth/callbacks, rate limits, file uploads, signed tokens, and business-logic abuse after the P0/P1 fixes land.

---

## 13. Claims, Communications & Legal Compliance

- [ ] **Sold-vs-Built Claim Sweep**: reconcile public pages, pricing, comparison tables, changelog, lifecycle email/SMS and in-app usage UI against functionality actually enabled in production; remove, qualify or feature-gate unsupported claims.
- [ ] **Advertising/FTC Substantiation Register**: record evidence, owner, scope and expiration for every percentage, multiplier, savings, guarantee, `100%`, `compliant`, `proven`, testimonial and outcome claim; block publication where substantiation is absent.
- [ ] **Outbound-Email Compliance Invariant**: at every send site, verify applicable `List-Unsubscribe`/one-click headers, legal-entity name, postal address, preference/unsubscribe route, fail-closed suppression and hard-bounce/complaint handling.
- [ ] **Privacy-Egress Reconciliation**: reconcile every outbound host/provider and data category with the privacy policy, processor terms, retention/deletion behavior and user-rights workflow; document AI/Gemini training/no-training tier and homeowner-photo handling.
- [ ] **Recording, Monitoring & State-Law Review**: verify call-recording disclosure occurs before recording and crew-GPS/employee-monitoring notice/consent is captured; obtain jurisdiction-specific review for liens/NOI, public-adjuster exposure, payment surcharges, privacy rights, Terms versioning and ADA claims.

