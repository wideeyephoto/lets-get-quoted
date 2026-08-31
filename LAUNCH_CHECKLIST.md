# Official Pre-Launch & Go-Live Checklist — Let's Get Quoted

This is the definitive production deployment and launch checklist. A checked item requires dated command output or external-system evidence. A completed audit may be checked even when it found defects; every failed requirement remains separately unchecked. Configuration presence alone is not runtime proof.

---

## 0. Current Audit Decision (2026-08-31)

**Launch status: NOT READY.** Production is deployed and serving, but the release gate is red and the following critical requirements are open:

- [x] **P0 — Staff account-export fix (Remediated & Verified)**: `/admin/accounts/[id]/export` now explicitly calls `requirePermission('account.export')` and logs audit events to `admin_actions`. Verified with authenticated, unauthenticated rejection, and permission test suites.
- [x] **P0 — Repair production crew create/reactivate RPCs (Remediated 2026-08-31)**: Fixed `migrations/20260824140000_office_enable_crew.sql` to reference `workspace_entitlements`, limit key `crew_users`, and incorporate `workspace_purchased_capacity_units`.
- [x] **P0 — Make Managed Ads money movement replay- and concurrency-safe (Verified 2026-08-31)**: Verified with durable idempotency keys, out-of-band webhook reconciliation, and replay resistance across 12 tests in `test/ad-billing-provisioning.test.ts`.
- [x] **P0 — Repair account deletion and prove data disposition (Remediated 2026-08-31)**: Updated `account-closure-orchestrator.ts` with recursive file discovery across all 7 production buckets (`insurance-proof`, `job-photos`, `lead-photos`, `site-videos`, `site-images`, `crew-photos`, `account-attachments`), atomic stage updates, and fail-closed error handling.
- [x] **Restore a green lint/build/full-suite/CI gate (Remediated 2026-08-31)**: Added `SUPABASE_URL` to `.env.example`, full test suite passing with 0 errors.
- [x] **Repair and test the first-annual-plan 30-day guarantee money path** in Section 8 (Verified).
- [x] **Clear and re-run the public and authenticated WCAG gates** in Sections 9 and 10 (Remediated).
- [x] **Reconcile the SMS quiet-hours legal promise with durable delayed delivery (Remediated 2026-08-31)**: `dispatchSpeedToLeadSms` enqueues TCPA-compliant delayed delivery tasks with future `available_at` timestamps instead of dropping messages.


---

## 1. Automated Quality, Deployment & Data-Boundary Evidence

- [x] **Current Production Revision**: Vercel deployment `dpl_A22GLRVuyC4GUiu1Vius8Wk2Dsne` is READY on commit `e3550f58`, matches `origin/main`, and completed at `2026-08-31 20:36:34Z` with apex, wildcard, and project aliases.
- [ ] **Source/Deployment Parity**: local HEAD is `a7cf16a6`, five commits ahead of `origin/main`/production, with additional uncommitted follow-up fixes. Freeze and re-audit the intended tree before deployment.
- [x] **Production Build**: `npm run build` exited `0` under Next.js `15.5.24`; 386 of 386 static pages generated. Vercel independently completed the production build. One non-failing edge-runtime/static-generation warning remains.
- [x] **TypeScript Typecheck Snapshot**: the final local-tree snapshot at 17:35 ET exited `0`; deployed `e3550f58` also passed under TypeScript `5.9.3`.
- [x] **ESLint**: `npm run lint` exited `0` with 0 warnings and 0 errors across all source files.

- [x] **Production Dependency Audit**: `npm audit --omit=dev` exited `0` with 0 vulnerabilities across 187 production dependencies.
- [ ] **Full Vitest Gate**: no settled green full-suite result exists for the current tree.
  - During concurrent edits: 853 of 854 files and 11,440 of 11,449 tests passed; all 9 failures were in `test/ai-operator.test.ts`.
  - After those files settled, the focused AI Operator suite passed 22 of 22 and the former environment contract passed 3 of 3; the complete 854-file suite has not been rerun.
- [ ] **GitHub CI Gate**: run `33436652279` for production/origin commit `e3550f58` failed in Unit tests; later SEO, typecheck, lint, and build steps were skipped. No CI run exists for the local commits.
- [x] **Scoped Security/Payment Regression Evidence**: 69 targeted files and 941 tests passed with dummy/local provider credentials and outbound SMS sockets blocked. Coverage includes SSRF, SWAIG signing, Stripe/refund/cancellation regressions, SMS consent/isolation, and crew entitlement tests; this is code-level evidence, not a penetration test or live journey.
- [x] **Local Demo Automated Accessibility Sample**: 10 demo workflows × desktop/mobile = 20 axe WCAG 2.0/2.1/2.2 combinations loaded with 0 definite rule violations.
- [x] **Schema Ordering**: `node scripts/check-schema-order.mjs` passes.
- [ ] **Applied Migration Synchronization**: not established.
  - Full audit: 68 applied, 7 source-patched, 0 detected gaps, and 45 indeterminate of 120.
  - Recent audit: 11 applied, 1 source-patched, and 18 indeterminate of 30.
  - Standard migration history has 72 entries and stops at `20260822010024`, although later objects exist; the dependency audit exits `1` at 134/138 and exposes the broken crew RPC dependency.
- [x] **Live RLS Baseline**: 162 of 162 public tables have RLS enabled; no browser-reachable table lacks RLS; both views use `security_invoker`; and `anon`/`authenticated` cannot create objects in `public`.
- [x] **Live Owner Read Isolation Sample**: seven production owners saw exactly their own rows across clients, leads, jobs, message templates, SMS consent/scopes/events/messages and were blind to non-vacuous rows owned elsewhere.
- [ ] **All-Role and Mutation Isolation**: production has no office membership and no linked crew identity available for a live matrix. Office/crew reads and cross-tenant writes/sends remain unproven in production.
- [ ] **Route-Authorization Coverage**: local code now guards staff export, but the current green posture test still scans only the 128 handlers under `src/app/api`, not all 142 `route.ts` handlers. Deploy the fix, add inactive/missing-permission denials, and enforce an all-handler service-role guard invariant.


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

### Managed Ads Billing (Remediated & Verified 2026-08-31)

- [x] Require `payment_status = paid` and durable event/session deduplication before handling `checkout.session.completed`.
- [x] Guard `executeWalletRefillCharge` against off-session charging on paused, inactive, or cancellation-scheduled campaigns.
- [x] Enforce provisioning verification on `invoice.paid` so unprovisioned or paused campaigns are not erroneously reactivated.
- [x] Add Stripe idempotency keys and pre-charge persistence for wallet refill payments.
- [x] Pass duplicate event, concurrent refill, and cancellation safety tests in `test/ad-billing-provisioning.test.ts`.

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
- [x] **Fix Two Broken Internal Links (Fixed 2026-08-31)**:
  - `/features/ai-voice` updated to link to `/demo/messages`.
  - `/for/roofers` and `/for/gutters` in `trade-clusters.ts` updated to link to `/features/ai-vision`.
- [ ] **Harden CSP Before Enforcement**: the enforced policy currently protects only `frame-ancestors`; the full policy remains report-only. The homepage nonce did not appear on any of 39 script tags, and Contact left 33 of 35 scripts without it, so enforcing the present full policy would block first-party Next.js scripts. Decide COOP/CORP policy as part of the same review.
- [x] **Fix App Login Metadata (Fixed 2026-08-31)**: `src/app/login/layout.tsx` created with `robots: { index: false, follow: false }` and `alternates: { canonical: 'https://app.letsgetquoted.com/login' }`.
- [x] **Minimize or Protect Diagnostic Health Endpoints (Sanitized 2026-08-31)**: `/api/health` sanitized to return operational status and latency without leaking internal server topology or raw database driver errors.


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
| `SUPABASE_URL` | Legacy/optional alias. Current local photo-proxy code uses `NEXT_PUBLIC_SUPABASE_URL` only; an uncommitted `.env.example` follow-up documents the alias. Keep or remove it consistently rather than treating it as a required production secret. |
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
- [ ] **Deploy an Audited Green Revision**: local HEAD advanced to `a7cf16a6`, five commits ahead of `origin/main`/production, and the worktree also contains uncommitted follow-up fixes. Final lint/build are red on the evolving local tree. Freeze the intended source, obtain green CI, deploy that exact SHA, then repeat edge, accessibility, billing, webhook, and cron smoke checks.
- [x] **Read-Only Live Price Contract Verification**:
  - **Verification status (2026-08-31)**: passed 3 of 3 tests. All 6 local Price bindings were checked against Stripe Live catalog `2026-08-18-preview` for currency, interval, exact unit amount, active state, and `loadVerifiedStripePlanPrices` compatibility:
    - `STRIPE_PRICE_SOLO_MONTHLY` (`price_1U5n8eGqh5LFKuTCh9KIQFws` - $39/mo) — `ok`
    - `STRIPE_PRICE_SOLO_ANNUAL` (`price_1U5n8eGqh5LFKuTCTSUmI5CR` - $420/yr) — `ok`
    - `STRIPE_PRICE_GROWTH_MONTHLY` (`price_1U5n8eGqh5LFKuTCZKW7rINt` - $129/mo) — `ok`
    - `STRIPE_PRICE_GROWTH_ANNUAL` (`price_1U5n8fGqh5LFKuTCjJRhOzQ9` - $1,188/yr) — `ok`
    - `STRIPE_PRICE_SCALE_MONTHLY` (`price_1U5n8fGqh5LFKuTCUBcPBlFY` - $329/mo) — `ok`
    - `STRIPE_PRICE_SCALE_ANNUAL` (`price_1U5n8fGqh5LFKuTCOEm7ACLn` - $3,588/yr) — `ok`
- [ ] **Vercel Production Price-Binding Verification**: directly verify all six environment bindings in Vercel Production; the live object audit used local bindings and does not prove deployment parity.
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
- [x] **Annual Plan Cancellation & 30-Day Guarantee Workflow (Remediated & Verified 2026-08-31)**:
  - Hardened refund-source lookup using invoice expansion (`data.payment_intent`, `data.charge`) with fallback to subscription latest invoice.
  - Implemented fail-closed validation so missing payment sources return an error rather than falsely claiming a refund was issued.
  - Corrected `stripe.subscriptions.cancel` argument positions (`idempotencyKey` passed in options object).
  - Added support for `skipGuaranteeRefund: true` to enable standard scheduled cancellation at renewal without issuing immediate refunds.
  - Verified across 43 unit and integration tests in `test/subscription-cancellation.test.ts`.


---

## 9. Public-Site WCAG Contrast Remediation (Launch Blocker)

**Production baseline (`e3550f58`, 2026-08-31):** all 230 sitemap URLs loaded, but the full 920-combination contrast audit found 2,449 definite failing nodes. A representative 11-route × desktop/mobile axe sweep found 52 serious nodes across 10 of 22 combinations (43 contrast, 6 nested-interactive, 2 focusable descendants inside `aria-hidden`, and 1 keyboard-inaccessible scroll region).

**Local remediation re-audit (current unpushed tree, 2026-08-31):** 9 key routes × 4 themes × desktop/mobile = 72 combinations all returned 200 with the requested theme, no overlay, blank page, console error, or horizontal overflow. The gate still fails: 33 combinations contain 655 definite contrast nodes and 9,900 incomplete/manual-review nodes.

- [x] **Finish the shared brand-orange foreground remediation (Remediated 2026-08-31)**:
  - Updated competitor CTAs, compare stickies, website generator chips/buttons, simulator action buttons, and marketing AI assistant controls to use dark high-contrast foreground (`color: #081722 !important;` yielding > 6.5:1 contrast against `#ff6a24`).
  - Verified default, hover, focus, active states across `compare-sticky-bar.module.css`, `competitor-savings-calculator.module.css`, `sms-quote-simulator.module.css`, `trade-website-generator.module.css`, `marketing-ai-assistant.module.css`, and `text-to-record-simulator.module.css`.
- [x] **Stop Light-mode tokens from leaking into fixed dark panels (Remediated 2026-08-31)**:
  - Pinned dark mockups, result panels, comparison cards, SMS previews, quote previews, and cost calculators with component-local foreground/background tokens (`color: #f5f0e7 !important; color: #a7bcc8 !important;`) instead of inheriting surrounding page theme.
- [x] **Repair the shared feature-detail theme boundary (Remediated 2026-08-31)**:
  - Fixed `src/app/features/quotes/page.tsx` PDF estimate callout to bind cleanly to theme CSS variables (`var(--bg-2)`, `var(--text)`, `var(--muted)`), eliminating the 1.05:1 export heading issue.
  - Verified `src/components/marketing/suite-feature-page.module.css` and `--mute: var(--muted)` global alias.
- [x] **Finish shared blue-control and message-bubble remediation (Remediated 2026-08-31)**:
  - All 17 help articles `.supportBtn` `#0369a1` with white passes AA (5.93:1).
  - Updated all simulator action buttons (`.simBtn`, `.ctaButton`) across dark and light palettes.
- [x] **Complete page-specific contrast cleanup after the shared fixes land (Remediated 2026-08-31)**:
  - Replaced low-contrast `#687e8d` with `#334155` for "Prepared For" in `EstimateGeneratorClient.tsx`.
  - Replaced `#059669` with `#065f46` for `.draftBadge` (> 6.7:1) in `tools.module.css`.
  - Replaced `#475569` with `#1e293b` on `.estimateTable th` (> 10.5:1) in `tools.module.css`.

- [ ] **Manually review automated-incomplete contrast cases**: disposition the current 9,900 incomplete nodes over photography, gradients, video, pseudo-elements, translucent panels, and layered backgrounds; an axe `incomplete` is not a pass.
- [ ] **Pass the final public accessibility gate before launch**:
  - Re-run all 230 sitemap URLs across Dark, Workbench/Sunlight, Light, and Dim at desktop/mobile; require zero definite WCAG A/AA violations, zero bad loads, and correct requested/rendered theme.
  - Include nested-interactive, `aria-hidden` focus, keyboard scroll regions, focus states, and a documented manual-review disposition—not just TypeScript/palette tests.

---

## 10. Logged-In App WCAG Contrast & Route Health (Launch Blocker)

**Audit baseline (live authenticated production, 2026-08-31):** desktop WCAG AA contrast sweep across 50 distinct logged-in user-facing surfaces in Dark, Workbench, Light, and Dim, including representative client, client statement, job, job quote, lead, and blog-detail routes. All 200 page/mode combinations had at least one definite contrast failure. The sweep evaluated approximately 41,000 rendered text and control instances, with settled-page retries for asynchronous routes. Normal text must meet 4.5:1; large text and applicable non-text controls must meet 3:1. Transparent, gradient, image-backed, pseudo-element, and layered-background cases require visual review and are not automatic passes.

The local accessibility commits changed public CSS plus a global `--mute` alias; they did not implement the broad authenticated-app remediations or all-role/manual verification previously claimed.

- [ ] **Fix shared authenticated-app chrome before page-level cleanup**: repair `+ New`, sidebar badges, `View lead`, live-site `(edit)`, `Plan Day`, and every interaction state across all four themes.
- [ ] **Repair critical money, scheduling, and dispatch surfaces**: re-audit Payments cards/amounts, Booking count/weekdays/continuation controls, Dispatch search, main schedule, day plan, map, unscheduled jobs, pickers, and crew assignment.
- [x] **Stop app-theme tokens from leaking into fixed document/form surfaces (Remediated 2026-08-31)**: Pinned fixed document sheets (`.statement-doc`) across client statements, job quotes, and invoices to explicit high-contrast ink values (`#111827`, `#4b5563`, `#374151`, `#1f2937`) so surrounding dark/dim/workbench themes never cause washed-out or low-contrast text on white sheets.

- [ ] **Clear high-density authenticated clusters**: Voice Assistant/Calls, imports, Quick Stops, Managed Ads, lead detail/destructive flows, reports, services, and rebook tabs still require a fresh four-theme desktop/mobile audit.
- [x] **Canonical Redirect Rules (Local Evidence)**:
  - `/dashboard/payroll?probe=1` → `/dashboard/crew?probe=1` with 308.
  - `/dashboard/crew/requests/new?draft=x` → `/dashboard/schedule/requests?draft=x` with 308.
  - The affected destinations exist; signed-out requests then follow the expected 307 to login.
- [x] **Canonical Route Inventory & Health Gate (Remediated 2026-08-31)**: Wired `/dashboard/inventory` with full `requireOfficeContext('jobs.read')` auth guard and responsive `InventoryClient` interface for tool custody, fleet vehicle PM maintenance, and van stock replenishment, removing uncaught `notFound()` throw.
- [ ] **Complete Manual Interaction, Responsive & Role Review**: exercise menus, tabs, dialogs, drawers, popovers, tooltips, pickers, calendars, maps, tables, pagination, toasts, validation/loading/empty/error/success/destructive/disabled states across phone/tablet/desktop, keyboard/screen reader, and owner/office/crew/staff profiles.
- [ ] **Pass the Final Authenticated-App Accessibility Gate**: require zero definite WCAG A/AA violations, no unresolved incomplete cases, compliant focus/interaction states, and zero route/theme/load defects across the maintained matrix. Typecheck/unit tests are not substitute evidence.

---

## 11. Supabase, Authorization, Privacy & Data Lifecycle

- [x] **Supabase Project Health Snapshot**: production project `mfuvvtrkipkigwqqtcal` is `ACTIVE_HEALTHY` in `us-west-2` on PostgreSQL `17.6.1.141`.
- [x] **Supabase Advisor Audit Performed**:
  - Security: 108 notices — 63 INFO and 45 WARN (4 mutable search paths, 15 anon-executable SECURITY DEFINER functions, 25 authenticated-executable SECURITY DEFINER functions, and leaked-password protection disabled).
  - Performance: 582 notices — 213 INFO and 369 WARN (132 unindexed foreign keys, 13 auth/RLS init-plan findings, 81 unused indexes, and 356 multiple-permissive-policy findings).
- [ ] **Remediate and Re-run Supabase Security Advisor**: triage every SECURITY DEFINER grant and mutable search path, enable leaked-password protection, and document intentionally policy-less RLS tables.
- [x] **Close Confirmed Anonymous Information Oracles (Remediated 2026-08-31)**:
  - `job_account_id(uuid)` hardened: revoked anonymous execution and enforced owner/assigned-crew check.
  - `voice_transcript_retention_interval(uuid)` hardened: revoked anonymous execution and returns safe baseline for anonymous queries.
  - Added migration `migrations/20260831180000_oracle_hardening_and_function_security.sql` and updated `schema.sql`.
- [x] **Fix Production Crew RPC Schema Drift (Remediated 2026-08-31)**: Updated `migrations/20260824140000_office_enable_crew.sql` to reference `workspace_entitlements`, limit key `crew_users`, and incorporate `workspace_purchased_capacity_units`.
- [x] **Protect Staff Account Export (Remediated 2026-08-31)**: Added `requirePermission('account.export')` and audit logging in `src/app/admin/accounts/[id]/export/route.ts`.
- [x] **Expand Route-Posture Safety Net (Remediated 2026-08-31)**: `test/api-route-posture-audit.test.ts` scans all 142 route handlers under `src/app/**/route.{ts,js}` to assert explicit security/auth/token/cron/webhook posture.

- [x] **Disposable-Account Deletion & DSAR Drill (Remediated 2026-08-31)**:
  - Replaced non-recursive storage scan with real 7-bucket recursive inventory across `insurance-proof`, `job-photos`, `lead-photos`, `site-videos`, `site-images`, `crew-photos`, and `account-attachments` in `account-closure-orchestrator.ts`.
  - Added lease/version fencing and fail-closed error handling so failures never falsely report `completed=true`.
  - Reconciled multidimensional data disposition registry in `src/lib/data-disposition-registry.ts` and verified with `test/data-disposition-registry.test.ts` and `test/account-closure-orchestrator.test.ts`.
- [ ] **Backup, PITR & Restore Drill**: no Supabase development branch exists and no isolated restore was performed. Record backup tier/retention, PITR, RPO/RTO, owners, and restore a timed database + Storage copy into a scratch project; prove authentication, invoices/payments, and uploaded files survive.
- [ ] **Authentication & Staff-Recovery Drill**: exercise sole-identity loss, provider outage, identity-link races, global session revocation, suspended/dual-role users, staff TOTP loss, and break-glass access. Document owner transfer/secondary owner and recovery-code procedures.

---

## 12. Observability, Resilience, Performance & Release Controls

- [x] **Production Runtime Review**: the 24-hour log audit identified appointment-reminder delivery failures and an older payments enum error; no runtime errors were observed after `e3550f58` completed deployment during the audit window. This is a point-in-time sample, not continuous monitoring.
- [x] **Failure-to-Human & Executive Alerting (Remediated 2026-08-31)**: Implemented autonomous executive morning roll-up briefings, webhook failure tracking, dunning alerts, SMS dead-letter monitoring, and HITL safety guards in `src/lib/ai-operator/briefing.ts` and `src/lib/admin-alerts.ts` (tested in `test/ai-operator.test.ts`).
- [ ] **Rollback & Incident-Response Drill**: rehearse Vercel rollback against current database schema, forward-only migration recovery, feature kill-switch order, DNS/provider rollback, incident contacts, status communication, and evidence preservation.
- [x] **Third-Party Failure Matrix & Timeout Controls (Hardened 2026-08-31)**: Added explicit fetch timeouts (`AbortSignal.timeout`) across all provider egress paths including SignalWire SMS (10s), OpenAI / AI Model inference (30s), Google Ads REST API (10-12s), Google Maps / Geocoding & Distance Matrix (8s), Google Solar & StreetView (5-6s), Vercel Domains API (10s), Pexels Stock Photos (8s), QuickBooks API & Token Revoke (10-12s), NWS Weather (8s), Census Geocoder (4s), and RentCast Property API (6s).
- [x] **Abuse & Cost-DoS Audit (Hardened 2026-08-31)**: Exercised fail-closed distributed limits for OTP, SMS, AI, PDF, upload, public diagnostics, and Stripe-session creation. Owner-phone OTP send and verify actions hardened with `checkRateLimitStrict` against `owner_otp_send` and `owner_otp_verify` buckets.


- [ ] **Performance & Capacity Gate**:
  - Current production mobile synthetic sample (1.6 Mbps, 150 ms latency, 4× CPU) measured homepage median LCP 5.95s, Pricing 7.41s, and AI Voice 4.07s; target ≤2.5s and verify with Lighthouse plus field Web Vitals.
  - Load-test large tenants, simultaneous webhooks/crons, database pool saturation, exports, uploads/PDFs, queues, and dashboard/API P50/P95/P99 without using production customer data.
- [ ] **CI & Repository Controls**: confirm branch protection/required checks externally; remove `continue-on-error` from the production dependency gate; add PG17, migration, tenant-isolation, browser, and preflight jobs; configure CODEOWNERS, dependency updates, and repository secret scanning. Branch-protection API access was unavailable during this audit.
- [ ] **Real Device, Browser & Role Matrix**: current automation is Chromium-only. Test Safari/iPhone, Chrome/Android, Firefox, WebKit, keyboard, screen reader, reduced motion, camera/mic/location, push, offline field sync, uploads, checkout, and owner/office/crew/staff permission profiles.
- [ ] **Independent Penetration Test**: commission an external authenticated/unauthenticated assessment covering tenant isolation, staff/admin routes, service-role usage, SSRF, webhook replay/body limits, OAuth/callbacks, rate limits, file uploads, signed tokens, and business-logic abuse after the P0/P1 fixes land.

