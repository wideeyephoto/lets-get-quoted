# Official Pre-Launch & Go-Live Checklist — Let's Get Quoted

This is the definitive production deployment and launch checklist. Checked items are verified; unchecked items are open launch requirements or blockers.

---

## 1. Verified System Readiness (Gates at 100%)

- [x] **TypeScript Strict Typecheck**: `npm run typecheck` (0 errors)
- [x] **Vitest Unit & Integration Suite**: `npm test` (851 test files, 11,379 tests passed, 0 failures)
- [x] **Framework Security & Compilation**: Next.js `15.5.24` (LTS) upgraded; `npm audit --omit=dev` reports 0 vulnerabilities; `npm run build` passes with clean SSR/SSG compilation across all routes, subdomains, and contractor templates
- [x] **Database Schema & Migrations**: Schema dependency ordering and runtime migrations synchronized
- [x] **Row-Level Security & Multi-Tenancy**: Tenant boundary isolation confirmed across all account roles
- [x] **Security & Integrity Hardening**:
  - SSRF protection on photo proxy with strict Supabase storage allowlist and loopback/metadata IP blocking
  - SWAIG voice webhook strict cryptographic tool token validation (`verifyVoiceToolToken`)
  - Cross-tenant SMS isolation with verified session account context
- [x] **Ad Billing Money Rails**:
  - Synthetic spend generation eliminated; delta-spend computation on syncs
  - Persistent pre-charge transaction idempotency keys with dual-layer webhook reconciliation and durable replay deduplication
  - Cancellation/pause state synchronization and monthly budget rollover
- [x] **Core Lifecycles Verified**:
  - Lead Intake → Estimation → Job Conversion → Crew Dispatch → Invoice E-Sign
  - Schedule Day Planning & Route Geographic Optimization
  - Stripe Checkout Webhook Idempotency, E-Signature Preservation, Charge Failure, Disputes, and Refunds
  - Outbox SMS Delivery, 10DLC Consent Ledgers, and White-Label Invariants
  - 1-Page PDF Generation (Invoices, Estimates, Lien Waivers)
  - 35 of 35 Scheduled Vercel Background Crons

---

## 2. Stripe Production Billing & Live Keys

### Base Plan Price Bindings (Catalog: `2026-08-18-preview`)
The following Price IDs exist in the live Stripe account, are active, single-currency USD, and bound:

| Variable Name | Plan Tier | Interval | Price | Bound Stripe Price ID |
| :--- | :--- | :--- | :--- | :--- |
| `STRIPE_PRICE_SOLO_MONTHLY` | Solo | Monthly | $39/mo | `price_1U5n8eGqh5LFKuTCh9KIQFws` |
| `STRIPE_PRICE_SOLO_ANNUAL` | Solo | Annual | $420/yr | `price_1U5n8eGqh5LFKuTCTSUmI5CR` |
| `STRIPE_PRICE_GROWTH_MONTHLY` | Growth | Monthly | $129/mo | `price_1U5n8eGqh5LFKuTCZKW7rINt` |
| `STRIPE_PRICE_GROWTH_ANNUAL` | Growth | Annual | $1,188/yr | `price_1U5n8fGqh5LFKuTCjJRhOzQ9` |
| `STRIPE_PRICE_SCALE_MONTHLY` | Scale | Monthly | $329/mo | `price_1U5n8fGqh5LFKuTCUBcPBlFY` |
| `STRIPE_PRICE_SCALE_ANNUAL` | Scale | Annual | $3,588/yr | `price_1U5n8fGqh5LFKuTCOEm7ACLn` |

### Top-Up Add-Ons (Live & Sellable)
- [x] `flex_text_250`: `price_1U5tXzGqh5LFKuTCXUPxSJY7` ($15/mo)
- [x] `text_1000`: `price_1U5tXzGqh5LFKuTCyqyMSkQ7` ($45/mo)
- [x] `marketing_email_5000`: `price_1U5tY0Gqh5LFKuTCITQbEhEK` ($20/mo)
- [x] `ai_intake_100`: `price_1U5tY1Gqh5LFKuTCzgsuPkbj` ($25/mo)
- [x] `ai_writing_250`: `price_1U5tY2Gqh5LFKuTCNgbygfUp` ($15/mo)
- [x] `crew_user`: `price_1U6gVfGqh5LFKuTC9wFCN28D` ($5/mo)
- [x] Withheld from sale: `storage_100gb`, `office_user`, AI Voice SKUs

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

- [x] **10DLC Brand & Campaign Registration**: Verified 2026-08-31 against SignalWire: the Let's Get Quoted brand is completed, the Account & Support Notifications campaign is active, and its number assignment is completed. Two non-primary campaigns remain pending/inactive and do not carry the verified transactional lane.
- [x] **Shared Number & SignalWire Space**: Verified 2026-08-31 that `+19479412323` exists in `lets-get-quoted.signalwire.com`, uses the expected LaML handler, and routes inbound SMS to `https://app.letsgetquoted.com/api/sms/inbound`. Both production variables are present in Vercel.
- [x] **White-Labeling Invariant**: Ensure no internal persona names appear in homeowner-facing SMS payloads.

---

## 4. Transactional Email & Deliverability (Resend)

- [x] **DNS Records**: Verified 2026-08-31. Resend reports `letsgetquoted.com` ready to send with DKIM and SPF verified. Public DNS publishes DMARC at `_dmarc.letsgetquoted.com` with monitoring policy `p=none`.
- [x] **API Key**: `RESEND_API_KEY` is present in Vercel Production (verified 2026-08-31), and production requests reach Resend without an authentication error.

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

- [x] **Apex & Application Domains** (verified 2026-08-31 in Vercel and by live browser routing):
  - `letsgetquoted.com` → Vercel
  - `app.letsgetquoted.com` → Vercel
- [x] **Wildcard Contractor Websites & Portals**: `*.letsgetquoted.com` is assigned to the Vercel project. Public DNS resolves arbitrary subdomains to Vercel-managed edge addresses, and HTTPS wildcard routing reaches the application's branded not-found surface.
- [x] **Cron Security**: `CRON_SECRET` is present in Vercel Production and Preview (verified 2026-08-31) and protects the 35 configured background cron endpoints.

---

## 7. Master Production Environment Variable Checklist

| Environment Variable | Production Value / Note |
| :--- | :--- |
| `NEXT_PUBLIC_APP_URL` | `https://app.letsgetquoted.com` |
| `NEXT_PUBLIC_ROOT_DOMAIN` | `letsgetquoted.com` |
| `DATABASE_URL` | *Supabase Production Postgres URI* |
| `NEXT_PUBLIC_SUPABASE_URL` | *Supabase Project URL* |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | *Supabase Anon Key* |
| `SUPABASE_SERVICE_ROLE_KEY` | *Supabase Service Role Key (Sensitive)* |
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

- [ ] **Fix the shared brand-orange foreground rule (750 failures across 160 pages)**:
  - Remove white text on `#ff6a24`, which measures 2.86:1 for normal text. Use the approved dark-on-orange ink treatment or darken the filled control enough to meet WCAG AA.
  - Apply the fix to the shared trade ROI CTA on all 150 `/for/[trade]` pages, all competitor-comparison CTAs, and affected homepage, calculator, and marketing-simulation controls.
  - Verify default, hover, focus, active, and disabled states in all four modes.
- [ ] **Stop Light-mode tokens from leaking into fixed dark panels (426 failures across 156 pages)**:
  - Give dark mockups, result panels, comparison cards, SMS previews, quote previews, and cost calculators component-local foreground/background tokens instead of inheriting the surrounding page theme.
  - Fix both trade ROI descriptions on all 150 `/for/[trade]` pages; Light currently renders `#090d16` on `#081722` at 1.06:1.
  - Correct the same dark-ink-on-dark failure throughout competitor comparisons and shared interactive marketing components, where measured ratios fall as low as 1.02:1.
- [ ] **Repair the shared feature-detail theme boundary**:
  - Start with `src/components/marketing/suite-feature-page.module.css`, then repair page-specific feature modules that override the shared tokens.
  - Fix metric strips, capability groups, screenshot captions, FAQ cards, headings, descriptions, links, and status text in Workbench, Light, and Dim.
  - Clear the current feature-detail baseline: Workbench fails 14/16 pages with 397 nodes, Light fails 15/16 with 97 nodes, and Dim fails 15/16 with 260 nodes.
  - Prioritize `/features/back-office` (179 failures), `/features/quick-stops` (97), `/features/text-to-job` (75), and `/features/client-portal` (71).
- [ ] **Fix shared blue filled controls and message bubbles**:
  - All 17 help articles: make the support button meet 4.5:1; white on `#0284c7` currently measures 4.09:1 in every mode.
  - Six SMS simulator instances: make the homeowner bubble meet 4.5:1; white on `#007aff` currently measures 4.01:1 in every mode.
  - Recheck hover, focus, selected, and disabled states after changing either foreground or background.
- [ ] **Complete page-specific contrast cleanup after the shared fixes land**:
  - Homepage: clear the remaining 47 failures across the four modes, including orange controls, phone/status text, chat bubbles, quote tabs, badges, and Workbench/Light mockup theme leakage.
  - Competitor pages: clear the remaining 87–88 failures per page across CTA bands, cost-comparison cards, savings calculators, trade switchers, quote samples, and pillar cards.
  - Tools: clear `/tools/estimate-generator` (72 failures), `/tools/hourly-rate-calculator`, `/tools/leakage-calculator`, and the `/tools` index.
  - Help and content: clear the `/help` index, `/changelog`, `/resources/speed-to-lead-contractor-playbook`, and `/resources/contractor-10dlc-sms-compliance-guide`.
- [ ] **Manually review automated-incomplete contrast cases**:
  - Inspect visible text over photography, gradients, video, pseudo-elements, translucent panels, and layered backgrounds; axe cannot assign a reliable ratio to these nodes.
  - Verify representative hero, card, navigation, footer, calculator, and interactive-demo states in every public template and all four modes.
  - Record each reviewed component as pass or remediate confirmed failures; do not treat an axe `incomplete` result as a pass.
- [ ] **Pass the final public contrast gate before launch**:
  - Re-run the complete 230-URL × 4-mode desktop audit and require zero definite WCAG AA color-contrast violations, zero page-load failures, and no theme mismatch between the requested and rendered mode.
  - Run the same contrast rule at the supported mobile breakpoint so mobile-only navigation and responsive content are covered.
  - Visually sign off the automated-incomplete cases and preserve the final summary plus raw results as launch evidence.
  - Regression-check the 33 pages that currently have no definite automated failures so remediation does not introduce new issues.

---

## 10. Logged-In App WCAG Contrast & Route Health (Launch Blocker)

**Audit baseline (live authenticated production, 2026-08-31):** desktop WCAG AA contrast sweep across 50 distinct logged-in user-facing surfaces in Dark, Workbench, Light, and Dim, including representative client, client statement, job, job quote, lead, and blog-detail routes. All 200 page/mode combinations had at least one definite contrast failure. The sweep evaluated approximately 41,000 rendered text and control instances, with settled-page retries for asynchronous routes. Normal text must meet 4.5:1; large text and applicable non-text controls must meet 3:1. Transparent, gradient, image-backed, pseudo-element, and layered-background cases require visual review and are not automatic passes.

- [ ] **Fix shared authenticated-app chrome before page-level cleanup**:
  - Dark and Workbench: repair the shared `+ New` control; white on its orange gradient currently bottoms out at 3.56:1.
  - Workbench: repair sidebar count badges, which also measure 3.56:1, and the global `View lead` action, which measures approximately 4.03:1.
  - Light: give the live-website `(edit)` label a local foreground/background treatment; it currently renders white on white at 1.00:1. Repair the global `View lead` action, which measures approximately 3.68:1.
  - Dim: repair the global `View lead` action at approximately 3.79:1 and `Plan Day` at approximately 4.23:1.
  - Verify default, hover, focus-visible, active, selected, expanded, and disabled states for shared navigation, badges, alerts, buttons, links, and menus in all four modes.
- [ ] **Repair critical money, scheduling, and dispatch surfaces**:
  - `/dashboard/payments`: correct dark text on near-black or dark-brown cards in Dark and Dim; important amounts currently fall to approximately 1.03-1.05:1. Recheck metric values, explanatory notes, transaction rows, and empty/loading/error states.
  - `/dashboard/schedule/booking`: correct the booking count, weekday labels, and continuation controls in Dark and Dim; measured ratios fall to approximately 1.04-1.12:1.
  - `/dashboard/schedule/dispatch`: correct the search field text and placeholder treatment in every mode; the current white-on-white case measures approximately 1.05:1.
  - Recheck the main schedule, day-plan, map, unscheduled-job, date/time picker, and crew-assignment states after the shared scheduling tokens change.
- [ ] **Stop app-theme tokens from leaking into fixed white document and form surfaces**:
  - Client statements and job quotes must use document-local ink, muted, border, table-header, and status tokens. Dark and Dim currently render several labels and table values on white at approximately 1.48-2.57:1.
  - Cover representative client, statement, job, quote, invoice, payment-request, print, PDF-preview, and editable form states.
  - Verify inputs, placeholders, helper text, validation messages, toggles, and read-only/disabled controls against their actual rendered surface rather than the surrounding app theme.
- [ ] **Clear the remaining high-density authenticated page clusters**:
  - `/dashboard/voice-assistant` and `/dashboard/voice-calls`: repair active filters, configuration CTAs, status messaging, tabs, and search controls; observed failures range from approximately 1.00-2.8:1 across the four modes.
  - Workbench imports: remove white-on-white file-format and helper text from `/dashboard/clients/import`, `/dashboard/import`, `/dashboard/jobs/import`, `/dashboard/jobs/import-invoices`, and `/dashboard/services/import`.
  - `/dashboard/quick-stops`: repair Workbench scheduled-time labels and legend items on pale panels, then verify the journey, fee, queue, dispatch, and empty states in every mode.
  - `/dashboard/marketing/ads`: replace inherited theme colors in badges, muted copy, metrics, controls, and fixed-color modules; verify the rest of the marketing area for the same boundary problem.
  - Lead detail: repair the Dark and Dim destructive/block-contact action, which measures approximately 2.12-2.15:1, and verify all destructive confirmation states.
  - Reports, Services, and Rebook: repair Light active-tab text on off-white surfaces and verify every tab state.
- [ ] **Resolve authenticated route-health findings and define the canonical route inventory**:
  - Decide whether `/dashboard/inventory` must ship; it currently renders the application 404. Implement the page or remove all user-facing links and audit expectations before launch.
  - Confirm and document `/dashboard/payroll` → `/dashboard/crew` and `/dashboard/crew/requests/new` → `/dashboard/schedule/requests` as intentional canonical redirects; update navigation, tests, and audit inputs so users do not traverse stale routes.
  - Audit `/dashboard/sites/preview` separately using its contractor-site theme contract. Do not count the embedded preview as passing merely because the surrounding authenticated shell passes.
  - Keep one maintained manifest of all static authenticated routes plus representative IDs for every dynamic template, and fail the audit when a route unexpectedly redirects, 404s, remains in a loading shell, or renders the wrong theme.
- [ ] **Complete manual interaction and responsive contrast review**:
  - Exercise dropdowns, tabs, dialogs, drawers, popovers, tooltips, date/time pickers, calendars, maps, tables, pagination, toasts, validation, loading, empty, error, success, destructive, and disabled states in every mode.
  - Inspect gradients, translucent panels, images, maps, charts, pseudo-elements, focus rings, borders, icons, and background-clipped text manually where automated contrast calculation is incomplete or ambiguous.
  - Repeat the authenticated sweep at every supported mobile/tablet breakpoint, including mobile-only navigation and sticky actions.
  - Repeat the route and state coverage for every supported logged-in role and permission profile so hidden or role-specific pages are not omitted.
- [ ] **Pass the final authenticated-app accessibility gate before launch**:
  - Re-run the maintained authenticated route manifest across Dark, Workbench, Light, and Dim and require zero definite WCAG AA text or applicable non-text contrast violations on every settled page.
  - Require zero unexpected redirects, 404s, loading-shell timeouts, authentication fallbacks, page-load failures, or requested/rendered theme mismatches.
  - Require keyboard-visible focus indicators and contrast-compliant interaction states for every shared component and representative page-specific workflow.
  - Preserve the dated route manifest, raw desktop/mobile results, manual-review disposition, screenshots for fixed-surface exceptions, and final summary as launch evidence.

