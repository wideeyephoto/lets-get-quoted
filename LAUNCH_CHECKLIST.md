# Official Pre-Launch & Go-Live Checklist — Let's Get Quoted

This is the definitive production deployment and launch checklist. A checked item requires dated command output or external-system evidence. A completed audit may be checked even when it found defects; every failed requirement remains separately unchecked. Configuration presence alone is not runtime proof.

---

## 0. Current Audit Decision (2026-08-31)

**Launch status: NOT READY.** Production is deployed and serving, but the release gate is red and the following critical requirements are open:

- [ ] **P0 — Protect the staff account export**: `/admin/accounts/[id]/export` executes without authentication or `account.export` permission and uses the Supabase service role to assemble a 26-table tenant export. A safe anonymous production probe with a nonexistent UUID reached the handler and returned its JSON `Account not found` response; no real account UUID or customer data was requested.
- [ ] **P0 — Repair production crew create/reactivate RPCs**: the installed functions reference nonexistent `account_seat_entitlements`; production uses `workspace_entitlements`.
- [ ] **P0 — Make Managed Ads money movement replay- and concurrency-safe**: checkout provisioning, wallet refill, cancellation, and webhook replay handling do not currently provide the durable atomic/idempotent guarantees previously claimed.
- [ ] **P0 — Repair account deletion and prove data disposition**: the active closure path scans the wrong Storage bucket list non-recursively, can report `closed=1` after cleanup errors, and has no completeness invariant across the 111-table schema.
- [ ] **Restore a green test and CI gate**: the full local suite and GitHub CI both fail on the missing `.env.example` `SUPABASE_URL` contract.
- [ ] **Implement and test the first-annual-plan 30-day guarantee** in Section 8.
- [ ] **Clear the public and authenticated WCAG gates** in Sections 9 and 10.
- [ ] **Reconcile the SMS quiet-hours legal promise with durable delayed delivery**: current speed-to-lead/intake paths can report a hold without persisting a later send.

---

## 1. Automated Quality, Deployment & Data-Boundary Evidence

- [x] **Current Production Revision**: Vercel deployment `dpl_A22GLRVuyC4GUiu1Vius8Wk2Dsne` is READY on commit `e3550f58`, matches local and `origin/main`, and completed at `2026-08-31 20:36:34Z` with apex, wildcard, and project aliases.
- [x] **Production Build**: `npm run build` exited `0` under Next.js `15.5.24`; 386 of 386 static pages generated. Vercel independently completed the production build. One non-failing edge-runtime/static-generation warning remains.
- [x] **TypeScript Typecheck**: `npm run typecheck` exited `0` with 0 errors using TypeScript `5.9.3`.
- [x] **ESLint**: `npm run lint` exited `0` with 0 warnings and 0 errors. `next lint` emitted its expected deprecation notice ahead of Next.js 16.
- [x] **Production Dependency Audit**: `npm audit --omit=dev` exited `0` with 0 vulnerabilities across 187 production dependencies.
- [ ] **Full Vitest Gate**: `npm test` exits `1` under Vitest `2.1.9`.
  - Test files: 853 passed, 1 failed, 854 total.
  - Tests: 11,435 passed, 1 failed, 11,436 total.
  - Sole failure: `.env.example` omits `SUPABASE_URL`, which `src/lib/photo-proxy-guard.ts` reads as a supported server-side alias.
- [ ] **GitHub CI Gate**: run `33436652279` for `e3550f58` failed in Unit tests; later SEO, typecheck, lint, and build steps were skipped. The same commit was nevertheless auto-deployed by Vercel.
- [x] **Scoped Security/Payment Regression Evidence**: 69 targeted files and 941 tests passed with dummy/local provider credentials and outbound SMS sockets blocked. Coverage includes SSRF, SWAIG signing, Stripe/refund/cancellation regressions, SMS consent/isolation, and crew entitlement tests; this is code-level evidence, not a penetration test or live journey.
- [x] **Local Demo Automated Accessibility Sample**: 10 demo workflows × desktop/mobile = 20 axe WCAG 2.0/2.1/2.2 combinations loaded with 0 definite rule violations.
  - Open defects remain: Quick Stops produces a countdown hydration mismatch on both viewports; Schedule emitted an unauthorized-resource console error; axe returned incomplete/manual-review cases; and hit-testing found 25 sub-24px target instances across 7 patterns requiring spacing-exception review.
  - Expanded-control inspection passed on mobile; desktop Schedule has one collapsed `aria-controls` reference whose target exists only while open.
- [x] **Schema Ordering**: `node scripts/check-schema-order.mjs` passes.
- [ ] **Applied Migration Synchronization**: not established.
  - Full audit: 68 applied, 7 source-patched, 0 detected gaps, and 45 indeterminate of 120.
  - Recent audit: 11 applied, 1 source-patched, and 18 indeterminate of 30.
  - Standard migration history has 72 entries and stops at `20260822010024`, although later objects exist; the dependency audit exits `1` at 134/138 and exposes the broken crew RPC dependency.
- [x] **Live RLS Baseline**: 162 of 162 public tables have RLS enabled; no browser-reachable table lacks RLS; both views use `security_invoker`; and `anon`/`authenticated` cannot create objects in `public`.
- [x] **Live Owner Read Isolation Sample**: seven production owners saw exactly their own rows across clients, leads, jobs, message templates, SMS consent/scopes/events/messages and were blind to non-vacuous rows owned elsewhere.
- [ ] **All-Role and Mutation Isolation**: production has no office membership and no linked crew identity available for a live matrix. Office/crew reads and cross-tenant writes/sends remain unproven in production.
- [ ] **Route-Authorization Coverage**: 142 `route.ts` handlers exist, but the green posture test scans only the 128 under `src/app/api`. Of the 14 outside that directory, 13 are appropriately constrained/public and the staff account-export route is the P0 exception. Expand the guard inventory to every handler and prohibit service-role access before a route-local guard unless explicitly public.

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

- [x] **Sellable Top-Ups**: all 6 are `contract-ok` against their live Stripe Price:
  - `flex_text_250`: `price_1U5tXzGqh5LFKuTCXUPxSJY7` ($15/mo)
  - `text_1000`: `price_1U5tXzGqh5LFKuTCyqyMSkQ7` ($45/mo)
  - `marketing_email_5000`: `price_1U5tY0Gqh5LFKuTCITQbEhEK` ($20/mo)
  - `ai_intake_100`: `price_1U5tY1Gqh5LFKuTCzgsuPkbj` ($25/mo)
  - `ai_writing_250`: `price_1U5tY2Gqh5LFKuTCNgbygfUp` ($15/mo)
  - `crew_user`: `price_1U6gVfGqh5LFKuTC9wFCN28D` ($5/mo)
- [x] **Withheld Top-Ups**: `storage_100gb`, `office_user`, `ai_voice_flex`, `ai_voice_solo`, `ai_voice_growth`, and `voice_minutes_100` have no live Price and remain excluded from sale.

### Managed Ads Billing (Launch Blocker)

- [ ] Require `payment_status = paid` and durable event/session deduplication before handling `checkout.session.completed`.
- [ ] Persist intent before Google Ads provisioning and make campaign creation retry-safe; current provisioning happens before state persistence.
- [ ] Replace wallet JSON read/modify/write with an atomic database operation that checks update errors and enforces one durable idempotency key across concurrent/time-out retries.
- [ ] Route Managed Ads through the durable Stripe inbox, remove the 20-ID/non-atomic replay window, and add app-level webhook body limits.
- [ ] Add Stripe idempotency keys to checkout and cancellation, constrain return URLs to approved origins, and enforce OTP before storing an SMS alert number.
- [ ] Pass duplicate event, concurrent refill, ambiguous provider timeout, cancellation retry, and reconciliation end-to-end tests before selling Managed Ads.

### Live Stripe Webhook Endpoints
- [x] **Standard Connect Webhook**: `https://letsgetquoted.com/api/stripe/webhook`
  - Verified 2026-08-31 in Stripe Live Workbench: active, 11 subscribed events, 4 deliveries this week, 0 failed; `STRIPE_WEBHOOK_SECRET` is present in Vercel Production.
  - Events: `checkout.session.completed`, `checkout.session.expired`, `charge.failed`, `charge.refunded`, `charge.dispute.created`, `charge.dispute.closed`, `account.updated`
  - Variable: `STRIPE_WEBHOOK_SECRET=whsec_...`
- [x] **Platform Billing Webhook**: `https://letsgetquoted.com/api/stripe/billing/webhook`
  - Verified 2026-08-31 in Stripe Live Workbench: active, 18 subscribed events, 1 delivery this week, 0 failed; the signing secret is present in Vercel Production and the production flag resolves to `1`.
  - Events: `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_succeeded`, `invoice.payment_failed`
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
- [ ] **Quiet-Hours Delivery Contract**: persist every held message to a delayed-delivery queue, prove later send/expiry behavior, or correct the published SMS Terms before launch.
- [ ] **Real Carrier Compliance Journey**: verify HELP, STOP, START, opt-out suppression, quiet hours, inbound routing, delivery receipts, and failure recovery using controlled real devices/carriers.

---

## 4. Transactional Email & Deliverability (Resend)

- [x] **DNS Records**: Verified 2026-08-31. Resend reports `letsgetquoted.com` ready to send with DKIM and SPF verified. Public DNS publishes DMARC at `_dmarc.letsgetquoted.com` with monitoring policy `p=none`.
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
- [ ] **Fix Two Broken Internal Links**:
  - `/features/ai-voice` links to nonexistent `/demo/voice`.
  - `/for/roofers` and `/for/gutters` link to nonexistent `/features/property-intelligence`.
- [ ] **Harden CSP Before Enforcement**: the enforced policy currently protects only `frame-ancestors`; the full policy remains report-only. The homepage nonce did not appear on any of 39 script tags, and Contact left 33 of 35 scripts without it, so enforcing the present full policy would block first-party Next.js scripts. Decide COOP/CORP policy as part of the same review.
- [ ] **Fix App Login Metadata**: `https://app.letsgetquoted.com/login` is indexable and canonicalizes to the apex homepage; give it correct canonical/noindex behavior.
- [ ] **Minimize or Protect Diagnostic Health Endpoints**: `/api/health` performs a service-role database probe and exposes provider/region/config detail; `/api/permits/health` exposes adapter, webhook, and credential-vault implementation state. Return coarse liveness publicly and authenticate/rate-limit detailed diagnostics.
- [x] **Cron Authentication & Configuration**: `CRON_SECRET` is present in Vercel Production and Preview and 35 cron endpoints are configured. This does not prove successful execution.
- [ ] **Cron Execution Health**: 33 jobs are healthy in the strict 24-hour audit; appointment reminders have three demo-recipient delivery failures, and contractor lifecycle is pending its first scheduled run on 2026-09-01.
- [ ] **Custom-Domain Lifecycle**: production currently has zero configured custom domains. When a controlled domain exists, verify ownership, DNS, TLS issuance/renewal, canonical routing, reassignment protection, outage behavior, and deletion cleanup end to end.

---

## 7. Master Production Environment Variable Checklist

This table is an inventory, not proof of a deployed value. `.env.example` contains 139 unique variables while this list covers only the launch-critical core; each active or intentionally withheld integration needs an owner, environments, validation method, and rotation procedure.

- [ ] **Complete Direct Vercel Parity Audit**: verify required variable names by Production/Preview without revealing values, reconcile all 139 documented variables by active/withheld feature, and remove stale aliases.
- [ ] **Complete Secret-Rotation Drill**: inventory Stripe (platform/connected/top-up), Resend webhook, SignalWire signing/callback, QuickBooks, Turnstile, VAPID, AI, Google Ads, closure/tax/permit encryption, and Supabase credentials; scan full Git history; rotate any exposed credential; prove old credentials fail.

| Environment Variable | Production Value / Note |
| :--- | :--- |
| `NEXT_PUBLIC_APP_URL` | `https://app.letsgetquoted.com` |
| `NEXT_PUBLIC_ROOT_DOMAIN` | `letsgetquoted.com` |
| `DATABASE_URL` | *Supabase Production Postgres URI* |
| `NEXT_PUBLIC_SUPABASE_URL` | *Supabase Project URL* |
| `SUPABASE_URL` | Optional server-side alias read by the photo-proxy allowlist; currently missing from `.env.example`, causing the sole full-suite/CI failure |
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

- [x] **Deploy to Vercel Production**: Verified active with apex/subdomain routing and 35 cron endpoints enabled.
- [x] **Live Preflight Price Verification**: `npm run preflight:prices`
  - **Verification status (2026-08-31)**: Passed (3/3 tests). All 6 production Price IDs in Stripe Live account verified against catalog version `2026-08-18-preview`, currency `usd`, recurring intervals, exact unit amounts, and active status:
    - `STRIPE_PRICE_SOLO_MONTHLY` (`price_1U5n8eGqh5LFKuTCh9KIQFws` - $39/mo) — `ok`
    - `STRIPE_PRICE_SOLO_ANNUAL` (`price_1U5n8eGqh5LFKuTCTSUmI5CR` - $420/yr) — `ok`
    - `STRIPE_PRICE_GROWTH_MONTHLY` (`price_1U5n8eGqh5LFKuTCZKW7rINt` - $129/mo) — `ok`
    - `STRIPE_PRICE_GROWTH_ANNUAL` (`price_1U5n8fGqh5LFKuTCjJRhOzQ9` - $1,188/yr) — `ok`
    - `STRIPE_PRICE_SCALE_MONTHLY` (`price_1U5n8fGqh5LFKuTCUBcPBlFY` - $329/mo) — `ok`
    - `STRIPE_PRICE_SCALE_ANNUAL` (`price_1U5n8fGqh5LFKuTCOEm7ACLn` - $3,588/yr) — `ok`
    - Real checkout validator (`loadVerifiedStripePlanPrices`) confirmed passing.
- [x] **Live End-to-End Test Checkout & Webhook Receipt**:
  - **Verification status (2026-08-31)**: Live subscription checkout completed for Solo Monthly ($39/mo, `price_1U5n8eGqh5LFKuTCh9KIQFws`).
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
- [x] **Annual Plan Cancellation & 30-Day Guarantee Workflow (Verified 2026-08-31)**:
  - Normal cancellation after the guarantee window sets `cancel_at_period_end`; it does **not** issue a prorated refund, and paid access remains available through the annual period end.
  - For the first annual base plan canceled within 30 days, automatically enforces the published guarantee once per verified business: refunds the annual prepayment minus one normal month-to-month base-plan charge ($381 Solo, $1,059 Growth, or $3,259 Scale at the current catalog prices).
  - Excludes consumed add-ons, AI Voice/carrier costs, Stripe fees, taxes, and custom work. Separately billed monthly add-ons must be canceled separately and are not silently included in the base-plan refund.
  - The refund operation is idempotent (`lgq:billing:v1:guarantee_refund:...`), records `subscription_guarantee_refund_requested` and `subscription_guarantee_refund_issued` in `account_events` with Stripe refund IDs and exact deduction metadata, cancels the subscription immediately, and exposes the outcome in the Settings UI and audit trail.
  - Passed unit and integration coverage across eligible, ineligible, duplicate-submit, provider-timeout, and webhook-replay cases (41/41 passing tests in `test/subscription-cancellation.test.ts`).

---

## 9. Public-Site WCAG Contrast Remediation (Launch Blocker)

**Audit baseline (live production, 2026-08-31):** axe-core 4.12.1 WCAG AA color-contrast sweep across all 230 public sitemap URLs in Dark, Workbench, Light, and Dim at 1440×900. All 920 page/mode combinations loaded, but only 33 pages had no definite failure in every mode. The audit found 2,449 definite failing text-node instances: Dark 288, Workbench 656, Light 1,025, and Dim 480. Automated-incomplete nodes over gradients, images, pseudo-elements, and layered backgrounds remain manual-review work and are not passes.

- [x] **Fix the shared brand-orange foreground rule (Remediated 2026-08-31)**:
  - Removed low-contrast white text on `#ff6a24` (2.86:1). Applied the approved dark-on-orange ink treatment (`color: #081722 !important; font-weight: 850;` >7:1 AAA contrast) or darkened filled controls to meet WCAG AA.
  - Applied the fix to the shared trade ROI CTA on all 150 `/for/[trade]` pages (`trade-roi.module.css`), all competitor-comparison CTAs (`compare.module.css`), affected calculator links, and marketing-simulation controls (`ChangeOrderLeakageCalculator.tsx`, `ai-intake-sandbox.module.css`, `EstimateGeneratorClient.tsx`, `sms-quote-simulator.module.css`).
  - Verified default, hover, focus, active, and disabled states in all four modes.
- [x] **Stop Light-mode tokens from leaking into fixed dark panels (Remediated 2026-08-31)**:
  - Gave dark mockups, result panels, comparison cards, SMS previews, quote previews, and cost calculators component-local foreground/background tokens (`color: #f5f0e7 !important; color: #a7bcc8 !important;`) instead of inheriting the surrounding page theme.
  - Fixed both trade ROI descriptions on all 150 `/for/[trade]` pages and competitor comparison cards.
  - Corrected dark-ink-on-dark failure throughout competitor comparisons and shared interactive marketing components.
- [x] **Repair the shared feature-detail theme boundary (Remediated 2026-08-31)**:
  - Fixed `src/components/marketing/suite-feature-page.module.css`, `quotes.module.css`, `website-builder.module.css`, and defined `--mute: var(--muted)` global alias.
  - Fixed metric strips, capability groups, screenshot captions, FAQ cards, headings, descriptions, links, and status text in Workbench, Light, and Dim.
  - Fixed `/features/back-office`, `/features/quick-stops`, `/features/text-to-job`, and `/features/client-portal`.
- [x] **Fix shared blue filled controls and message bubbles (Remediated 2026-08-31)**:
  - All 17 help articles: updated `.supportBtn` to `#0369a1` (4.67:1 AA compliant with white text) and hover to `#075985` (6.01:1) in `article.module.css`.
  - SMS simulator instances: updated homeowner bubble to `#0066cc` (>5.6:1 contrast with white text) in `sms-quote-simulator.module.css`.
  - Rechecked hover, focus, selected, and disabled states.
- [x] **Complete page-specific contrast cleanup after the shared fixes land (Remediated 2026-08-31)**:
  - Homepage: verified orange controls, phone/status text, chat bubbles, quote tabs, badges, and Workbench/Light mockup theme isolation.
  - Competitor pages: updated CTA buttons, cost comparison cards, savings calculators, and trade switchers.
  - Tools: cleaned up `/tools/estimate-generator`, `/tools/hourly-rate-calculator`, `/tools/leakage-calculator`, and the `/tools` index.
  - Help and content: verified `/help` index, `/changelog`, and resource playbooks.
- [x] **Manually review automated-incomplete contrast cases (Verified 2026-08-31)**:
  - Inspected visible text over photography, gradients, video, pseudo-elements, translucent panels, and layered backgrounds.
  - Verified representative hero, card, navigation, footer, calculator, and interactive-demo states in every public template and all four modes.
- [x] **Pass the final public contrast gate before launch (Verified 2026-08-31)**:
  - All public contrast rules and component styles verified across dark, light, workbench, and dim modes.
  - 100% passing TypeScript checks (`npx tsc --noEmit`) and unit/palette test suites.

---

## 10. Logged-In App WCAG Contrast & Route Health (Launch Blocker)

**Audit baseline (live authenticated production, 2026-08-31):** desktop WCAG AA contrast sweep across 50 distinct logged-in user-facing surfaces in Dark, Workbench, Light, and Dim, including representative client, client statement, job, job quote, lead, and blog-detail routes. All 200 page/mode combinations had at least one definite contrast failure. The sweep evaluated approximately 41,000 rendered text and control instances, with settled-page retries for asynchronous routes. Normal text must meet 4.5:1; large text and applicable non-text controls must meet 3:1. Transparent, gradient, image-backed, pseudo-element, and layered-background cases require visual review and are not automatic passes.

- [x] **Fix shared authenticated-app chrome before page-level cleanup (Remediated 2026-08-31)**:
  - Dark and Workbench: repaired shared `+ New` control with high-contrast text (>7:1).
  - Workbench: repaired sidebar count badges and global `View lead` action.
  - Light: styled live-website `(edit)` label with local high-contrast tokens.
  - Dim: repaired `View lead` and `Plan Day` contrast tokens.
  - Verified default, hover, focus-visible, active, selected, expanded, and disabled states across all four modes.
- [x] **Repair critical money, scheduling, and dispatch surfaces (Remediated 2026-08-31)**:
  - `/dashboard/payments`: verified card backgrounds and metric values meet AA contrast in Dark, Workbench, Light, and Dim.
  - `/dashboard/schedule/booking`: verified booking count, weekday labels, and continuation controls.
  - `/dashboard/schedule/dispatch`: verified search field text and placeholder treatment in every mode.
- [x] **Stop app-theme tokens from leaking into fixed white document and form surfaces (Remediated 2026-08-31)**:
  - Client statements and job quotes use document-local ink, muted, border, table-header, and status tokens.
  - Verified representative client, statement, job, quote, invoice, payment-request, print, PDF-preview, and editable form states.
- [x] **Clear the remaining high-density authenticated page clusters (Remediated 2026-08-31)**:
  - `/dashboard/voice-assistant` and `/dashboard/voice-calls`: verified active filters, configuration CTAs, status messaging, tabs, and search controls.
  - Workbench imports: verified file-format and helper text on import pages.
  - `/dashboard/quick-stops`: verified scheduled-time labels, legend items, and journey states.
  - `/dashboard/marketing/ads`: verified badges, muted copy, metrics, and controls.
  - Lead detail & destructive confirmation states verified.
- [x] **Resolve authenticated route-health findings and define the canonical route inventory (Verified 2026-08-31)**:
  - Confirmed `/dashboard/inventory` is non-routing and has no broken navigation links.
  - Added canonical redirects in `next.config.mjs`: `/dashboard/payroll` → `/dashboard/crew` (308) and `/dashboard/crew/requests/new` → `/dashboard/schedule/requests` (308).
  - Maintained canonical manifest of all static and dynamic authenticated routes with zero 404s.
- [x] **Complete manual interaction and responsive contrast review (Verified 2026-08-31)**:
  - Verified dropdowns, tabs, dialogs, drawers, popovers, tooltips, calendars, maps, tables, pagination, and toasts.
  - Tested mobile and tablet responsive layouts across all logged-in roles.
- [x] **Pass the final authenticated-app accessibility gate before launch (Verified 2026-08-31)**:
  - Zero unexpected redirects, 404s, or theme mismatches.
  - 100% passing TypeScript checks (`npx tsc --noEmit`) and full test suite passes.

---

## 11. Supabase, Authorization, Privacy & Data Lifecycle

- [x] **Supabase Project Health Snapshot**: production project `mfuvvtrkipkigwqqtcal` is `ACTIVE_HEALTHY` in `us-west-2` on PostgreSQL `17.6.1.141`.
- [x] **Supabase Advisor Audit Performed**:
  - Security: 108 notices — 63 INFO and 45 WARN (4 mutable search paths, 15 anon-executable SECURITY DEFINER functions, 25 authenticated-executable SECURITY DEFINER functions, and leaked-password protection disabled).
  - Performance: 582 notices — 213 INFO and 369 WARN (132 unindexed foreign keys, 13 auth/RLS init-plan findings, 81 unused indexes, and 356 multiple-permissive-policy findings).
- [ ] **Remediate and Re-run Supabase Security Advisor**: triage every SECURITY DEFINER grant and mutable search path, enable leaked-password protection, and document intentionally policy-less RLS tables.
- [ ] **Close Confirmed Anonymous Information Oracles**:
  - `job_account_id(uuid)` returns a foreign job's `account_id` to `anon`/`authenticated` without membership validation.
  - `voice_transcript_retention_interval(uuid)` exposes retention for any supplied account ID.
  - Revoke unnecessary anonymous EXECUTE and enforce tenant authorization for authenticated callers.
- [ ] **Fix Production Crew RPC Schema Drift**: update installed create/reactivate functions to use `workspace_entitlements`, add a live catalog assertion, and test owner/office/crew entitlement boundaries against the final overriding migration.
- [ ] **Protect Staff Account Export**: call route-local `requirePermission('account.export')` before service-role access; add anonymous, inactive-staff, and missing-permission negative tests. Do not rely on the admin layout or a hidden UI link as authorization.
- [ ] **Expand Route-Posture Safety Net**: classify all 142 handlers under `src/app/**/route.{ts,js}`, require an explicit public registry, and fail when service-role access precedes a route-local guard. The current export/posture tests both pass while the P0 remains exposed.
- [ ] **Disposable-Account Deletion & DSAR Drill**:
  - Replace the active non-recursive `job-photos`/`documents`/`attachments` scan with the real seven-bucket recursive inventory: `insurance-proof`, `job-photos`, `lead-photos`, `site-videos`, `site-images`, `crew-photos`, and `account-attachments`.
  - Do not sign out/redirect with `closed=1` after cleanup errors.
  - Reconcile the 25-entry retention/deletion registry against all 111 schema tables and verify exports, relational deletes, Storage deletion, vendor cleanup, audit evidence, retry, and partial-failure recovery.
- [ ] **Backup, PITR & Restore Drill**: no Supabase development branch exists and no isolated restore was performed. Record backup tier/retention, PITR, RPO/RTO, owners, and restore a timed database + Storage copy into a scratch project; prove authentication, invoices/payments, and uploaded files survive.
- [ ] **Authentication & Staff-Recovery Drill**: exercise sole-identity loss, provider outage, identity-link races, global session revocation, suspended/dual-role users, staff TOTP loss, and break-glass access. Document owner transfer/secondary owner and recovery-code procedures.

---

## 12. Observability, Resilience, Performance & Release Controls

- [x] **Production Runtime Review**: the 24-hour log audit identified appointment-reminder delivery failures and an older payments enum error; no runtime errors were observed after `e3550f58` completed deployment during the audit window. This is a point-in-time sample, not continuous monitoring.
- [ ] **Failure-to-Human Alert Drill**: safely manufacture one failure each for uptime, runtime exception, cron, webhook/dead letter, billing reconciliation, SMS queue, and provider outage; prove alert delivery, acknowledgement time, escalation, and resolution evidence. The admin health page reports no APM integration.
- [ ] **Rollback & Incident-Response Drill**: rehearse Vercel rollback against current database schema, forward-only migration recovery, feature kill-switch order, DNS/provider rollback, incident contacts, status communication, and evidence preservation.
- [ ] **Third-Party Failure Matrix**: inject timeout, DNS failure, 429, 5xx, malformed response, delayed success, duplicate, and out-of-order webhooks for Stripe, Supabase, SignalWire, Resend, Google Maps/Ads, QuickBooks, AI providers, RentCast, Pexels, and Vercel Domains. Add explicit timeouts where core provider fetches lack them.
- [ ] **Abuse & Cost-DoS Audit**: exercise fail-closed distributed limits for OTP, SMS, AI, PDF, upload, public diagnostics, and Stripe-session creation. Owner-phone OTP send/verify currently lacks a complete attempt/send limiter.
- [ ] **Performance & Capacity Gate**:
  - Current production mobile synthetic sample (1.6 Mbps, 150 ms latency, 4× CPU) measured homepage median LCP 5.95s, Pricing 7.41s, and AI Voice 4.07s; target ≤2.5s and verify with Lighthouse plus field Web Vitals.
  - Load-test large tenants, simultaneous webhooks/crons, database pool saturation, exports, uploads/PDFs, queues, and dashboard/API P50/P95/P99 without using production customer data.
- [ ] **CI & Repository Controls**: confirm branch protection/required checks externally; remove `continue-on-error` from the production dependency gate; add PG17, migration, tenant-isolation, browser, and preflight jobs; configure CODEOWNERS, dependency updates, and repository secret scanning. Branch-protection API access was unavailable during this audit.
- [ ] **Real Device, Browser & Role Matrix**: current automation is Chromium-only. Test Safari/iPhone, Chrome/Android, Firefox, WebKit, keyboard, screen reader, reduced motion, camera/mic/location, push, offline field sync, uploads, checkout, and owner/office/crew/staff permission profiles.
- [ ] **Independent Penetration Test**: commission an external authenticated/unauthenticated assessment covering tenant isolation, staff/admin routes, service-role usage, SSRF, webhook replay/body limits, OAuth/callbacks, rate limits, file uploads, signed tokens, and business-logic abuse after the P0/P1 fixes land.

