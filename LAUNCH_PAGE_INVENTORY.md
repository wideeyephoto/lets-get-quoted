# Master Page Inventory & Touch Dates — Let's Get Quoted

Generated: 2026-09-04

## 14. Full Application Page Inventory & Freshness Audit (Updated 2026-09-04)

This section is the definitive inventory of all **246 App Router page surfaces** across Let's Get Quoted. It records the exact date each page was last updated/touched in version control or active development, tracks staleness metrics, and provides an active triage plan to guarantee **no page is neglected or abandoned** for launch.

### Page Freshness Breakdown

- **Total App Router Pages**: **246** distinct `page.tsx` surfaces.
- 🟢 **Fresh / Recently Touched (Sep 1–4, 2026)**: **111 pages** (45%) — actively validated during final pre-launch hardening, WCAG remediation, voice/SMS contractor dispatch, and insights updates.
- 🟡 **Stable (Aug 20–31, 2026)**: **120 pages** (49%) — hardened during late August feature sprints (Stripe Connect, schedule waitlists, marketing campaigns, permissions).
- 🔴 **Stale / Neglected (>3 Weeks Ago — Prior to Aug 20, 2026)**: **15 pages** (6%) — flagged for explicit verification below.

### Neglected Page Triage & Disposition Matrix

The following **15 pages** have not been touched in over 3 weeks. Each surface has been reviewed to determine its current operational status, whether it carries breaking changes or needs retirement, and its go-live disposition:

| Route | File Path | Last Touched | Commit | Launch Status & Disposition |
| :--- | :--- | :--- | :--- | :--- |
| `/demo/campaigns` | `src/app/demo/campaigns/page.tsx` | 2026-08-06 (4 weeks ago) | `b9fb1174e` | Static live-demo campaign builder. Renders demo mock sequences; verified operational without console errors. |
| `/demo/marketing/performance` | `src/app/demo/marketing/performance/page.tsx` | 2026-08-06 (4 weeks ago) | `b9fb1174e` | Demo performance analytics view. Verified functional against synthetic metrics. |
| `/demo/recurring` | `src/app/demo/recurring/page.tsx` | 2026-08-06 (4 weeks ago) | `b9fb1174e` | Demo recurring agreements manager. Verified rendering with mock agreements. |
| `/home-compare` | `src/app/home-compare/page.tsx` | 2026-08-07 (4 weeks ago) | `56684ddd3` | A/B test homepage comparison rig (`/home-compare`). Standalone internal preview; non-indexed; safe. |
| `/home-flagship` | `src/app/home-flagship/page.tsx` | 2026-08-07 (4 weeks ago) | `55a60a4d2` | Alternative flagship interactive tour homepage variant. Standalone internal preview; non-indexed; safe. |
| `/dashboard/clients/import` | `src/app/dashboard/clients/import/page.tsx` | 2026-08-14 (3 weeks ago) | `3c18ab230` | CSV customer roster importer. Schema field mapping verified; paginated bulk import ready. |
| `/dashboard/jobs/import` | `src/app/dashboard/jobs/import/page.tsx` | 2026-08-14 (3 weeks ago) | `3c18ab230` | CSV job history importer. Column matching and job staging verified operational. |
| `/dashboard/jobs/import-invoices` | `src/app/dashboard/jobs/import-invoices/page.tsx` | 2026-08-14 (3 weeks ago) | `3c18ab230` | CSV invoice history importer. Connect ledger mapping verified. |
| `/demo/messages` | `src/app/demo/messages/page.tsx` | 2026-08-14 (3 weeks ago) | `3c18ab230` | Demo message workspace. Updated on 2026-08-31 to serve as fallback target for AI Voice demo links. |
| `/demo/schedule/plan` | `src/app/demo/schedule/plan/page.tsx` | 2026-08-14 (3 weeks ago) | `7c3ac4112` | Demo route planner & day scheduler. Verified clean with demo jobs and route stops. |
| `/admin/billing-operations` | `src/app/admin/billing-operations/page.tsx` | 2026-08-16 (3 weeks ago) | `fb5b7d571` | Super-admin operator console for dead-letter billing events. Protected by staff permission gate; verified. |
| `/dashboard/stripe-merchant/refresh` | `src/app/dashboard/stripe-merchant/refresh/page.tsx` | 2026-08-16 (3 weeks ago) | `fde575acb` | Stripe Connect merchant onboarding refresh redirect destination. Lightweight auth-gated redirector; verified. |
| `/dashboard/stripe-merchant/return` | `src/app/dashboard/stripe-merchant/return/page.tsx` | 2026-08-16 (3 weeks ago) | `fde575acb` | Stripe Connect merchant onboarding return destination. Directs back to settings with refresh state; verified. |
| `/features/client-portal` | `src/app/features/client-portal/page.tsx` | 2026-08-16 (3 weeks ago) | `28a2d0925` | Public feature page for Client Portal. Passed full 4-theme WCAG AA contrast audit on 2026-09-01. |
| `/security` | `src/app/security/page.tsx` | 2026-08-16 (3 weeks ago) | `28a2d0925` | Platform security & trust overview page. Reconciled with subprocessor, SOC2, and storage encryption claims. |

---

### Authenticated Dashboard (68 pages)

| Route | Source File | Last Touched | Commit | Freshness |
| :--- | :--- | :--- | :--- | :--- |
| `/dashboard` | `src/app/dashboard/page.tsx` | 2026-09-04 | `89520a762*` | 🟢 Fresh |
| `/dashboard/activity` | `src/app/dashboard/activity/page.tsx` | 2026-09-03 | `77e751f04` | 🟢 Fresh |
| `/dashboard/automations` | `src/app/dashboard/automations/page.tsx` | 2026-09-04 | `dcd42987c` | 🟢 Fresh |
| `/dashboard/cash-flow` | `src/app/dashboard/cash-flow/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/dashboard/claims` | `src/app/dashboard/claims/page.tsx` | 2026-09-03 | `7ca281b47` | 🟢 Fresh |
| `/dashboard/clients` | `src/app/dashboard/clients/page.tsx` | 2026-09-03 | `a18225bff` | 🟢 Fresh |
| `/dashboard/clients/[id]` | `src/app/dashboard/clients/[id]/page.tsx` | 2026-09-03 | `2e6c7af21` | 🟢 Fresh |
| `/dashboard/clients/[id]/statement` | `src/app/dashboard/clients/[id]/statement/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/dashboard/clients/import` | `src/app/dashboard/clients/import/page.tsx` | 2026-08-14 | `3c18ab230` | 🔴 Neglected (>3 wks) |
| `/dashboard/crew` | `src/app/dashboard/crew/page.tsx` | 2026-09-03 | `5bfdd49e5` | 🟢 Fresh |
| `/dashboard/crew/requests/[id]` | `src/app/dashboard/crew/requests/[id]/page.tsx` | 2026-09-01 | `8fd524833` | 🟢 Fresh |
| `/dashboard/crew/requests/new` | `src/app/dashboard/crew/requests/new/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/dashboard/expenses` | `src/app/dashboard/expenses/page.tsx` | 2026-09-04 | `89520a762` | 🟢 Fresh |
| `/dashboard/forms` | `src/app/dashboard/forms/page.tsx` | 2026-09-02 | `bff437d13` | 🟢 Fresh |
| `/dashboard/forms/[id]` | `src/app/dashboard/forms/[id]/page.tsx` | 2026-09-01 | `12e223c0b` | 🟢 Fresh |
| `/dashboard/forms/builder` | `src/app/dashboard/forms/builder/page.tsx` | 2026-09-01 | `12e223c0b` | 🟢 Fresh |
| `/dashboard/help` | `src/app/dashboard/help/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/dashboard/help/[caseId]` | `src/app/dashboard/help/[caseId]/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/dashboard/import` | `src/app/dashboard/import/page.tsx` | 2026-08-24 | `7b290d591*` | 🟡 Stable (Aug 20-31) |
| `/dashboard/insights` | `src/app/dashboard/insights/page.tsx` | 2026-09-04 | `0c66cd74b` | 🟢 Fresh |
| `/dashboard/inventory` | `src/app/dashboard/inventory/page.tsx` | 2026-09-03 | `7ca281b47` | 🟢 Fresh |
| `/dashboard/jobs` | `src/app/dashboard/jobs/page.tsx` | 2026-09-04 | `89520a762` | 🟢 Fresh |
| `/dashboard/jobs/[id]` | `src/app/dashboard/jobs/[id]/page.tsx` | 2026-09-03 | `2e6c7af21` | 🟢 Fresh |
| `/dashboard/jobs/[id]/forms/[submissionId]/print` | `src/app/dashboard/jobs/[id]/forms/[submissionId]/print/page.tsx` | 2026-09-01 | `12e223c0b` | 🟢 Fresh |
| `/dashboard/jobs/[id]/invoices/[invoiceId]` | `src/app/dashboard/jobs/[id]/invoices/[invoiceId]/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/dashboard/jobs/[id]/quote` | `src/app/dashboard/jobs/[id]/quote/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/dashboard/jobs/import` | `src/app/dashboard/jobs/import/page.tsx` | 2026-08-14 | `3c18ab230` | 🔴 Neglected (>3 wks) |
| `/dashboard/jobs/import-invoices` | `src/app/dashboard/jobs/import-invoices/page.tsx` | 2026-08-14 | `3c18ab230` | 🔴 Neglected (>3 wks) |
| `/dashboard/leads` | `src/app/dashboard/leads/page.tsx` | 2026-09-03 | `a06ca21e2` | 🟢 Fresh |
| `/dashboard/leads/[leadId]` | `src/app/dashboard/leads/[leadId]/page.tsx` | 2026-09-03 | `2e6c7af21` | 🟢 Fresh |
| `/dashboard/marketing` | `src/app/dashboard/marketing/page.tsx` | 2026-09-03 | `77e751f04` | 🟢 Fresh |
| `/dashboard/marketing/ads` | `src/app/dashboard/marketing/ads/page.tsx` | 2026-09-03 | `77e751f04` | 🟢 Fresh |
| `/dashboard/marketing/blog` | `src/app/dashboard/marketing/blog/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/dashboard/marketing/blog/[id]` | `src/app/dashboard/marketing/blog/[id]/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/dashboard/marketing/campaigns` | `src/app/dashboard/marketing/campaigns/page.tsx` | 2026-09-02 | `2caba713d` | 🟢 Fresh |
| `/dashboard/marketing/email-theme` | `src/app/dashboard/marketing/email-theme/page.tsx` | 2026-08-30 | `d311d6527` | 🟡 Stable (Aug 20-31) |
| `/dashboard/marketing/links` | `src/app/dashboard/marketing/links/page.tsx` | 2026-09-01 | `8fd524833` | 🟢 Fresh |
| `/dashboard/marketing/performance` | `src/app/dashboard/marketing/performance/page.tsx` | 2026-09-01 | `8fd524833` | 🟢 Fresh |
| `/dashboard/marketing/referrals` | `src/app/dashboard/marketing/referrals/page.tsx` | 2026-08-22 | `9088f7d94` | 🟡 Stable (Aug 20-31) |
| `/dashboard/messages` | `src/app/dashboard/messages/page.tsx` | 2026-09-03 | `99b99805e` | 🟢 Fresh |
| `/dashboard/messages/dedicated-number` | `src/app/dashboard/messages/dedicated-number/page.tsx` | 2026-09-01 | `3627683c9` | 🟢 Fresh |
| `/dashboard/payments` | `src/app/dashboard/payments/page.tsx` | 2026-09-04 | `e2650432f*` | 🟢 Fresh |
| `/dashboard/payroll` | `src/app/dashboard/payroll/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/dashboard/quick-stops` | `src/app/dashboard/quick-stops/page.tsx` | 2026-09-03 | `6c5cbf20e` | 🟢 Fresh |
| `/dashboard/rebook` | `src/app/dashboard/rebook/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/dashboard/recurring` | `src/app/dashboard/recurring/page.tsx` | 2026-09-04 | `2f01d3cbb` | 🟢 Fresh |
| `/dashboard/reports` | `src/app/dashboard/reports/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/dashboard/reviews` | `src/app/dashboard/reviews/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/dashboard/schedule` | `src/app/dashboard/schedule/page.tsx` | 2026-09-03 | `77e751f04` | 🟢 Fresh |
| `/dashboard/schedule/booking` | `src/app/dashboard/schedule/booking/page.tsx` | 2026-09-03 | `99b99805e` | 🟢 Fresh |
| `/dashboard/schedule/dispatch` | `src/app/dashboard/schedule/dispatch/page.tsx` | 2026-08-26 | `ead4a91a6` | 🟡 Stable (Aug 20-31) |
| `/dashboard/schedule/plan` | `src/app/dashboard/schedule/plan/page.tsx` | 2026-09-01 | `8fd524833` | 🟢 Fresh |
| `/dashboard/schedule/requests` | `src/app/dashboard/schedule/requests/page.tsx` | 2026-08-26 | `ead4a91a6` | 🟡 Stable (Aug 20-31) |
| `/dashboard/schedule/settings` | `src/app/dashboard/schedule/settings/page.tsx` | 2026-09-03 | `1ced5fca3` | 🟢 Fresh |
| `/dashboard/schedule/waitlist` | `src/app/dashboard/schedule/waitlist/page.tsx` | 2026-09-03 | `e6e5b9d6d` | 🟢 Fresh |
| `/dashboard/services` | `src/app/dashboard/services/page.tsx` | 2026-09-04 | `ead3f43a4*` | 🟢 Fresh |
| `/dashboard/services/import` | `src/app/dashboard/services/import/page.tsx` | 2026-09-04 | `77dcdc675*` | 🟢 Fresh |
| `/dashboard/settings` | `src/app/dashboard/settings/page.tsx` | 2026-09-03 | `2e6c7af21` | 🟢 Fresh |
| `/dashboard/sites` | `src/app/dashboard/sites/page.tsx` | 2026-09-04 | `a08202fcb` | 🟢 Fresh |
| `/dashboard/sites/preview` | `src/app/dashboard/sites/preview/page.tsx` | 2026-08-23 | `333d702a3` | 🟡 Stable (Aug 20-31) |
| `/dashboard/stripe-merchant/refresh` | `src/app/dashboard/stripe-merchant/refresh/page.tsx` | 2026-08-16 | `fde575acb` | 🔴 Neglected (>3 wks) |
| `/dashboard/stripe-merchant/return` | `src/app/dashboard/stripe-merchant/return/page.tsx` | 2026-08-16 | `fde575acb` | 🔴 Neglected (>3 wks) |
| `/dashboard/stripe-return` | `src/app/dashboard/stripe-return/page.tsx` | 2026-09-01 | `3627683c9` | 🟢 Fresh |
| `/dashboard/text-to-job` | `src/app/dashboard/text-to-job/page.tsx` | 2026-09-04 | `663ffec41` | 🟢 Fresh |
| `/dashboard/trash` | `src/app/dashboard/trash/page.tsx` | 2026-09-01 | `3c3dff71a` | 🟢 Fresh |
| `/dashboard/voice-assistant` | `src/app/dashboard/voice-assistant/page.tsx` | 2026-08-26 | `cdd0b44fd` | 🟡 Stable (Aug 20-31) |
| `/dashboard/voice-calls` | `src/app/dashboard/voice-calls/page.tsx` | 2026-09-03 | `6c5cbf20e` | 🟢 Fresh |
| `/dashboard/voice-calls/[callId]` | `src/app/dashboard/voice-calls/[callId]/page.tsx` | 2026-09-03 | `2e6c7af21` | 🟢 Fresh |

### Customer & Client Facing (10 pages)

| Route | Source File | Last Touched | Commit | Freshness |
| :--- | :--- | :--- | :--- | :--- |
| `/book/[subdomain]` | `src/app/book/[subdomain]/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/client/jobs/[token]` | `src/app/client/jobs/[token]/page.tsx` | 2026-09-03 | `5806fd4ca` | 🟢 Fresh |
| `/invoice/[id]` | `src/app/invoice/[id]/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/pay/[id]` | `src/app/pay/[id]/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/portal` | `src/app/portal/page.tsx` | 2026-09-04 | `2f01d3cbb` | 🟢 Fresh |
| `/portal/[subdomain]` | `src/app/portal/[subdomain]/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/portal/view/[token]` | `src/app/portal/view/[token]/page.tsx` | 2026-09-04 | `2f01d3cbb` | 🟢 Fresh |
| `/review/[token]` | `src/app/review/[token]/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/track/[token]` | `src/app/track/[token]/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/unsubscribe` | `src/app/unsubscribe/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |

### Auth & Onboarding (5 pages)

| Route | Source File | Last Touched | Commit | Freshness |
| :--- | :--- | :--- | :--- | :--- |
| `/auth/confirm` | `src/app/auth/confirm/page.tsx` | 2026-08-30 | `4db77d660` | 🟡 Stable (Aug 20-31) |
| `/login` | `src/app/login/page.tsx` | 2026-09-03 | `5576cd959` | 🟢 Fresh |
| `/office-invite/[token]` | `src/app/office-invite/[token]/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/start` | `src/app/start/page.tsx` | 2026-09-03 | `35ba268ba` | 🟢 Fresh |
| `/welcome` | `src/app/welcome/page.tsx` | 2026-09-03 | `35ba268ba` | 🟢 Fresh |

### Product Features (23 pages)

| Route | Source File | Last Touched | Commit | Freshness |
| :--- | :--- | :--- | :--- | :--- |
| `/features` | `src/app/features/page.tsx` | 2026-09-03 | `5fad5ce03` | 🟢 Fresh |
| `/features-flagship` | `src/app/features-flagship/page.tsx` | 2026-08-26 | `de72f3cf5` | 🟡 Stable (Aug 20-31) |
| `/features/ai-ads` | `src/app/features/ai-ads/page.tsx` | 2026-09-03 | `77e751f04` | 🟢 Fresh |
| `/features/ai-copilot` | `src/app/features/ai-copilot/page.tsx` | 2026-09-03 | `b6ede0e5b` | 🟢 Fresh |
| `/features/ai-intake` | `src/app/features/ai-intake/page.tsx` | 2026-09-01 | `1a0c6fd90` | 🟢 Fresh |
| `/features/ai-vision` | `src/app/features/ai-vision/page.tsx` | 2026-09-03 | `b6f2d990e` | 🟢 Fresh |
| `/features/ai-voice` | `src/app/features/ai-voice/page.tsx` | 2026-09-01 | `c39099360` | 🟢 Fresh |
| `/features/back-office` | `src/app/features/back-office/page.tsx` | 2026-09-01 | `80232fe27` | 🟢 Fresh |
| `/features/cash-flow` | `src/app/features/cash-flow/page.tsx` | 2026-08-29 | `e4f635a58` | 🟡 Stable (Aug 20-31) |
| `/features/client-portal` | `src/app/features/client-portal/page.tsx` | 2026-08-16 | `28a2d0925` | 🔴 Neglected (>3 wks) |
| `/features/crew` | `src/app/features/crew/page.tsx` | 2026-08-29 | `e4f635a58` | 🟡 Stable (Aug 20-31) |
| `/features/dispatch` | `src/app/features/dispatch/page.tsx` | 2026-08-27 | `91f85e576` | 🟡 Stable (Aug 20-31) |
| `/features/neighborhood-halo` | `src/app/features/neighborhood-halo/page.tsx` | 2026-09-03 | `5fad5ce03` | 🟢 Fresh |
| `/features/payments` | `src/app/features/payments/page.tsx` | 2026-08-29 | `e4f635a58` | 🟡 Stable (Aug 20-31) |
| `/features/quick-stops` | `src/app/features/quick-stops/page.tsx` | 2026-08-29 | `0533d57a9` | 🟡 Stable (Aug 20-31) |
| `/features/quotes` | `src/app/features/quotes/page.tsx` | 2026-09-02 | `37dc4c966` | 🟢 Fresh |
| `/features/recurring` | `src/app/features/recurring/page.tsx` | 2026-08-29 | `e4f635a58` | 🟡 Stable (Aug 20-31) |
| `/features/reviews` | `src/app/features/reviews/page.tsx` | 2026-08-29 | `e4f635a58` | 🟡 Stable (Aug 20-31) |
| `/features/scheduling` | `src/app/features/scheduling/page.tsx` | 2026-08-29 | `e4f635a58` | 🟡 Stable (Aug 20-31) |
| `/features/sparky` | `src/app/features/sparky/page.tsx` | 2026-09-03 | `750e8cb1f` | 🟢 Fresh |
| `/features/text-to-job` | `src/app/features/text-to-job/page.tsx` | 2026-09-03 | `2a9510fff` | 🟢 Fresh |
| `/features/website-builder` | `src/app/features/website-builder/page.tsx` | 2026-09-02 | `dd0a59154` | 🟢 Fresh |
| `/features/website-builder-mockup` | `src/app/features/website-builder-mockup/page.tsx` | 2026-08-28 | `ec20b4264` | 🟡 Stable (Aug 20-31) |

### Public Marketing (41 pages)

| Route | Source File | Last Touched | Commit | Freshness |
| :--- | :--- | :--- | :--- | :--- |
| `/` | `src/app/page.tsx` | 2026-09-04 | `f643bf134*` | 🟢 Fresh |
| `/account-suspended` | `src/app/account-suspended/page.tsx` | 2026-08-31 | `33c409ea4` | 🟡 Stable (Aug 20-31) |
| `/card-saved` | `src/app/card-saved/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/changelog` | `src/app/changelog/page.tsx` | 2026-08-26 | `192ffbce6` | 🟡 Stable (Aug 20-31) |
| `/contact` | `src/app/contact/page.tsx` | 2026-09-01 | `80232fe27` | 🟢 Fresh |
| `/dpa` | `src/app/dpa/page.tsx` | 2026-08-27 | `91f85e576` | 🟡 Stable (Aug 20-31) |
| `/faq` | `src/app/faq/page.tsx` | 2026-09-02 | `beaf80591` | 🟢 Fresh |
| `/field` | `src/app/field/page.tsx` | 2026-09-03 | `9552fb115` | 🟢 Fresh |
| `/field/choose` | `src/app/field/choose/page.tsx` | 2026-09-02 | `3a3f2aa65` | 🟢 Fresh |
| `/field/dictate` | `src/app/field/dictate/page.tsx` | 2026-09-02 | `3a3f2aa65` | 🟢 Fresh |
| `/field/intake/[id]` | `src/app/field/intake/[id]/page.tsx` | 2026-09-03 | `9552fb115` | 🟢 Fresh |
| `/field/jobs/[id]` | `src/app/field/jobs/[id]/page.tsx` | 2026-09-02 | `3a3f2aa65` | 🟢 Fresh |
| `/field/login` | `src/app/field/login/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/field/offline` | `src/app/field/offline/page.tsx` | 2026-08-28 | `a54825870` | 🟡 Stable (Aug 20-31) |
| `/field/pay` | `src/app/field/pay/page.tsx` | 2026-09-02 | `3a3f2aa65` | 🟢 Fresh |
| `/for` | `src/app/for/page.tsx` | 2026-09-03 | `7091aae2d` | 🟢 Fresh |
| `/for-mockup` | `src/app/for-mockup/page.tsx` | 2026-09-01 | `a519c0ee6` | 🟢 Fresh |
| `/founder` | `src/app/founder/page.tsx` | 2026-09-03 | `de1142d9c` | 🟢 Fresh |
| `/home-classic` | `src/app/home-classic/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/home-compact` | `src/app/home-compact/page.tsx` | 2026-08-28 | `c5132ccf2` | 🟡 Stable (Aug 20-31) |
| `/home-compare` | `src/app/home-compare/page.tsx` | 2026-08-07 | `56684ddd3` | 🔴 Neglected (>3 wks) |
| `/home-editorial` | `src/app/home-editorial/page.tsx` | 2026-08-28 | `ee21c8e1d` | 🟡 Stable (Aug 20-31) |
| `/home-flagship` | `src/app/home-flagship/page.tsx` | 2026-08-07 | `55a60a4d2` | 🔴 Neglected (>3 wks) |
| `/home-next` | `src/app/home-next/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/how-it-works` | `src/app/how-it-works/page.tsx` | 2026-09-02 | `dd0a59154` | 🟢 Fresh |
| `/office-access` | `src/app/office-access/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/passport/[passportCode]` | `src/app/passport/[passportCode]/page.tsx` | 2026-09-01 | `a05e3d1a4` | 🟢 Fresh |
| `/pricing` | `src/app/pricing/page.tsx` | 2026-09-01 | `80232fe27` | 🟢 Fresh |
| `/privacy` | `src/app/privacy/page.tsx` | 2026-09-01 | `0cc7421e7` | 🟢 Fresh |
| `/quick-stop/[id]` | `src/app/quick-stop/[id]/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/quickbooks/disconnected` | `src/app/quickbooks/disconnected/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/recover-account` | `src/app/recover-account/page.tsx` | 2026-09-01 | `82eefc37f` | 🟢 Fresh |
| `/resources` | `src/app/resources/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/resources/[slug]` | `src/app/resources/[slug]/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/schedule/[token]` | `src/app/schedule/[token]/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/security` | `src/app/security/page.tsx` | 2026-08-16 | `28a2d0925` | 🔴 Neglected (>3 wks) |
| `/sms-terms` | `src/app/sms-terms/page.tsx` | 2026-08-31 | `51abfa532` | 🟡 Stable (Aug 20-31) |
| `/sub/[token]` | `src/app/sub/[token]/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/terms` | `src/app/terms/page.tsx` | 2026-08-31 | `51abfa532` | 🟡 Stable (Aug 20-31) |
| `/themes/[template]` | `src/app/themes/[template]/page.tsx` | 2026-08-31 | `bddaa35e6` | 🟡 Stable (Aug 20-31) |
| `/website-builder-mockup` | `src/app/website-builder-mockup/page.tsx` | 2026-08-31 | `df967bdae` | 🟡 Stable (Aug 20-31) |

### Trade Landing Pages (1 pages)

| Route | Source File | Last Touched | Commit | Freshness |
| :--- | :--- | :--- | :--- | :--- |
| `/for/[trade]` | `src/app/for/[trade]/page.tsx` | 2026-09-01 | `8eb04f1ba` | 🟢 Fresh |

### Competitive Comparisons (2 pages)

| Route | Source File | Last Touched | Commit | Freshness |
| :--- | :--- | :--- | :--- | :--- |
| `/compare` | `src/app/compare/page.tsx` | 2026-09-01 | `ba8cc421a` | 🟢 Fresh |
| `/compare/[competitor]` | `src/app/compare/[competitor]/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |

### Public Free Tools (4 pages)

| Route | Source File | Last Touched | Commit | Freshness |
| :--- | :--- | :--- | :--- | :--- |
| `/tools` | `src/app/tools/page.tsx` | 2026-09-01 | `80232fe27` | 🟢 Fresh |
| `/tools/estimate-generator` | `src/app/tools/estimate-generator/page.tsx` | 2026-09-01 | `80232fe27` | 🟢 Fresh |
| `/tools/hourly-rate-calculator` | `src/app/tools/hourly-rate-calculator/page.tsx` | 2026-08-27 | `503c50171` | 🟡 Stable (Aug 20-31) |
| `/tools/leakage-calculator` | `src/app/tools/leakage-calculator/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |

### Help & Documentation (4 pages)

| Route | Source File | Last Touched | Commit | Freshness |
| :--- | :--- | :--- | :--- | :--- |
| `/help` | `src/app/help/page.tsx` | 2026-09-01 | `8eb04f1ba` | 🟢 Fresh |
| `/help/articles/[slug]` | `src/app/help/articles/[slug]/page.tsx` | 2026-08-31 | `227d8dcb3` | 🟡 Stable (Aug 20-31) |
| `/help/manual` | `src/app/help/manual/page.tsx` | 2026-09-01 | `8eb04f1ba` | 🟢 Fresh |
| `/help/manual/[slug]` | `src/app/help/manual/[slug]/page.tsx` | 2026-09-01 | `8eb04f1ba` | 🟢 Fresh |

### Interactive Demo (45 pages)

| Route | Source File | Last Touched | Commit | Freshness |
| :--- | :--- | :--- | :--- | :--- |
| `/demo` | `src/app/demo/page.tsx` | 2026-09-04 | `0c66cd74b` | 🟢 Fresh |
| `/demo/automations` | `src/app/demo/automations/page.tsx` | 2026-08-27 | `2dc29d9e9` | 🟡 Stable (Aug 20-31) |
| `/demo/campaigns` | `src/app/demo/campaigns/page.tsx` | 2026-08-06 | `b9fb1174e` | 🔴 Neglected (>3 wks) |
| `/demo/cash-flow` | `src/app/demo/cash-flow/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/demo/clients` | `src/app/demo/clients/page.tsx` | 2026-09-03 | `2e6c7af21` | 🟢 Fresh |
| `/demo/clients/[id]` | `src/app/demo/clients/[id]/page.tsx` | 2026-09-03 | `2e6c7af21` | 🟢 Fresh |
| `/demo/crew` | `src/app/demo/crew/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/demo/customize` | `src/app/demo/customize/page.tsx` | 2026-08-24 | `c39872e7d` | 🟡 Stable (Aug 20-31) |
| `/demo/email-themes` | `src/app/demo/email-themes/page.tsx` | 2026-09-01 | `c39099360` | 🟢 Fresh |
| `/demo/insights` | `src/app/demo/insights/page.tsx` | 2026-09-04 | `0c66cd74b` | 🟢 Fresh |
| `/demo/jobs` | `src/app/demo/jobs/page.tsx` | 2026-09-03 | `f97c93a14` | 🟢 Fresh |
| `/demo/jobs/[id]` | `src/app/demo/jobs/[id]/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/demo/leads` | `src/app/demo/leads/page.tsx` | 2026-09-03 | `f97c93a14` | 🟢 Fresh |
| `/demo/leads/[leadId]` | `src/app/demo/leads/[leadId]/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/demo/marketing` | `src/app/demo/marketing/page.tsx` | 2026-09-01 | `c39099360` | 🟢 Fresh |
| `/demo/marketing/ads` | `src/app/demo/marketing/ads/page.tsx` | 2026-08-30 | `7886b7ea9` | 🟡 Stable (Aug 20-31) |
| `/demo/marketing/blog` | `src/app/demo/marketing/blog/page.tsx` | 2026-09-01 | `8eb04f1ba` | 🟢 Fresh |
| `/demo/marketing/blog/[id]` | `src/app/demo/marketing/blog/[id]/page.tsx` | 2026-09-01 | `8eb04f1ba` | 🟢 Fresh |
| `/demo/marketing/campaigns` | `src/app/demo/marketing/campaigns/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/demo/marketing/email-theme` | `src/app/demo/marketing/email-theme/page.tsx` | 2026-09-01 | `c39099360` | 🟢 Fresh |
| `/demo/marketing/links` | `src/app/demo/marketing/links/page.tsx` | 2026-09-01 | `8eb04f1ba` | 🟢 Fresh |
| `/demo/marketing/performance` | `src/app/demo/marketing/performance/page.tsx` | 2026-08-06 | `b9fb1174e` | 🔴 Neglected (>3 wks) |
| `/demo/messages` | `src/app/demo/messages/page.tsx` | 2026-08-14 | `3c18ab230` | 🔴 Neglected (>3 wks) |
| `/demo/payroll` | `src/app/demo/payroll/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/demo/quick-stops` | `src/app/demo/quick-stops/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/demo/rebook` | `src/app/demo/rebook/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/demo/recurring` | `src/app/demo/recurring/page.tsx` | 2026-08-06 | `b9fb1174e` | 🔴 Neglected (>3 wks) |
| `/demo/reel/bath-to-shower` | `src/app/demo/reel/bath-to-shower/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/demo/reel/mock-site` | `src/app/demo/reel/mock-site/page.tsx` | 2026-08-27 | `49a39ca6f` | 🟡 Stable (Aug 20-31) |
| `/demo/reel/product-tour` | `src/app/demo/reel/product-tour/page.tsx` | 2026-09-02 | `bf4e4a5ce` | 🟢 Fresh |
| `/demo/reviews` | `src/app/demo/reviews/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/demo/schedule` | `src/app/demo/schedule/page.tsx` | 2026-09-03 | `99b99805e` | 🟢 Fresh |
| `/demo/schedule/booking` | `src/app/demo/schedule/booking/page.tsx` | 2026-09-03 | `99b99805e` | 🟢 Fresh |
| `/demo/schedule/plan` | `src/app/demo/schedule/plan/page.tsx` | 2026-08-14 | `7c3ac4112` | 🔴 Neglected (>3 wks) |
| `/demo/services` | `src/app/demo/services/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/demo/settings` | `src/app/demo/settings/page.tsx` | 2026-08-27 | `2dc29d9e9` | 🟡 Stable (Aug 20-31) |
| `/demo/sites` | `src/app/demo/sites/page.tsx` | 2026-08-28 | `9aafb9f95` | 🟡 Stable (Aug 20-31) |
| `/demo/sms-quote` | `src/app/demo/sms-quote/page.tsx` | 2026-08-26 | `a9e81b590` | 🟡 Stable (Aug 20-31) |
| `/demo/tour` | `src/app/demo/tour/page.tsx` | 2026-08-27 | `65506d9ef` | 🟡 Stable (Aug 20-31) |
| `/demo/tour/approve` | `src/app/demo/tour/approve/page.tsx` | 2026-08-27 | `2ad68083f` | 🟡 Stable (Aug 20-31) |
| `/demo/tour/complete` | `src/app/demo/tour/complete/page.tsx` | 2026-08-27 | `2ad68083f` | 🟡 Stable (Aug 20-31) |
| `/demo/tour/intake` | `src/app/demo/tour/intake/page.tsx` | 2026-08-27 | `2ad68083f` | 🟡 Stable (Aug 20-31) |
| `/demo/tour/lead` | `src/app/demo/tour/lead/page.tsx` | 2026-08-27 | `2ad68083f` | 🟡 Stable (Aug 20-31) |
| `/demo/tour/quote` | `src/app/demo/tour/quote/page.tsx` | 2026-08-27 | `2ad68083f` | 🟡 Stable (Aug 20-31) |
| `/demo/tour/site` | `src/app/demo/tour/site/page.tsx` | 2026-08-27 | `65506d9ef` | 🟡 Stable (Aug 20-31) |

### Admin Operations (28 pages)

| Route | Source File | Last Touched | Commit | Freshness |
| :--- | :--- | :--- | :--- | :--- |
| `/admin` | `src/app/admin/page.tsx` | 2026-09-03 | `bd25aa7ac` | 🟢 Fresh |
| `/admin/accounts` | `src/app/admin/accounts/page.tsx` | 2026-09-01 | `0cc7421e7` | 🟢 Fresh |
| `/admin/accounts/[id]` | `src/app/admin/accounts/[id]/page.tsx` | 2026-09-01 | `0cc7421e7` | 🟢 Fresh |
| `/admin/audit` | `src/app/admin/audit/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/admin/billing-operations` | `src/app/admin/billing-operations/page.tsx` | 2026-08-16 | `fb5b7d571` | 🔴 Neglected (>3 wks) |
| `/admin/campaigns` | `src/app/admin/campaigns/page.tsx` | 2026-08-31 | `48ac1a911` | 🟡 Stable (Aug 20-31) |
| `/admin/cases` | `src/app/admin/cases/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/admin/cases/[id]` | `src/app/admin/cases/[id]/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/admin/cases/new` | `src/app/admin/cases/new/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/admin/failures` | `src/app/admin/failures/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/admin/health` | `src/app/admin/health/page.tsx` | 2026-09-01 | `6917ad445` | 🟢 Fresh |
| `/admin/health/[job]` | `src/app/admin/health/[job]/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/admin/incidents` | `src/app/admin/incidents/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/admin/manual` | `src/app/admin/manual/page.tsx` | 2026-09-01 | `8b2dfa7ae` | 🟢 Fresh |
| `/admin/manual/[slug]` | `src/app/admin/manual/[slug]/page.tsx` | 2026-09-01 | `8b2dfa7ae` | 🟢 Fresh |
| `/admin/messaging` | `src/app/admin/messaging/page.tsx` | 2026-09-03 | `bd25aa7ac` | 🟢 Fresh |
| `/admin/messaging/registrations` | `src/app/admin/messaging/registrations/page.tsx` | 2026-09-03 | `bd25aa7ac` | 🟢 Fresh |
| `/admin/money` | `src/app/admin/money/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/admin/operator` | `src/app/admin/operator/page.tsx` | 2026-09-03 | `2e6c7af21` | 🟢 Fresh |
| `/admin/payments` | `src/app/admin/payments/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/admin/payments/[id]` | `src/app/admin/payments/[id]/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/admin/quick-stops` | `src/app/admin/quick-stops/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/admin/quick-stops/[id]` | `src/app/admin/quick-stops/[id]/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/admin/risk` | `src/app/admin/risk/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/admin/search` | `src/app/admin/search/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/admin/security` | `src/app/admin/security/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/admin/staff` | `src/app/admin/staff/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/admin/voice/numbers` | `src/app/admin/voice/numbers/page.tsx` | 2026-09-03 | `bd25aa7ac` | 🟢 Fresh |

### Tenant Sites & Previews (15 pages)

| Route | Source File | Last Touched | Commit | Freshness |
| :--- | :--- | :--- | :--- | :--- |
| `/site-domain/[domain]` | `src/app/site-domain/[domain]/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/site-domain/[domain]/blog` | `src/app/site-domain/[domain]/blog/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/site-domain/[domain]/blog/[slug]` | `src/app/site-domain/[domain]/blog/[slug]/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/site-domain/[domain]/portal` | `src/app/site-domain/[domain]/portal/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/site-domain/[domain]/privacy` | `src/app/site-domain/[domain]/privacy/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/site-domain/[domain]/terms` | `src/app/site-domain/[domain]/terms/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/site-domain/[domain]/videos` | `src/app/site-domain/[domain]/videos/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/site-preview-frame` | `src/app/site-preview-frame/page.tsx` | 2026-09-01 | `792b40156` | 🟢 Fresh |
| `/site/[subdomain]` | `src/app/site/[subdomain]/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/site/[subdomain]/blog` | `src/app/site/[subdomain]/blog/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/site/[subdomain]/blog/[slug]` | `src/app/site/[subdomain]/blog/[slug]/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/site/[subdomain]/portal` | `src/app/site/[subdomain]/portal/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/site/[subdomain]/privacy` | `src/app/site/[subdomain]/privacy/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/site/[subdomain]/terms` | `src/app/site/[subdomain]/terms/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/site/[subdomain]/videos` | `src/app/site/[subdomain]/videos/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |

