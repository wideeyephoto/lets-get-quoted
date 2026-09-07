# Meta Ads Launch Checklist & Production Runbook

**Date:** September 7, 2026  
**Status:** Pre-Launch Readiness — Code Remediation Complete & Operator Staging Instructions  
**Target Capabilities:**
1. **Neighborhood Halo Micro-Ads** (Hyper-local 1-mile Facebook & Instagram feed ads on completed jobs)
2. **Managed Ads Multi-Channel Autopilot** (Growth & Scale Smart Bundles combining Google Search + Meta Social)
3. **Meta Conversions API (CAPI)** (Closed-loop offline conversion sync persisted on `leads.triage`)
4. **Meta Lead Ads Ingestion** (Real-time webhook routing from Facebook Lead Forms into CRM)

---

## 0. Hard Code & Operational Blockers (Remediations Completed)

The verified code-level gaps where delivery failed closed, ran unbounded, or fabricated spend have been fixed and covered by unit tests:

- [x] **Blocker 1: Register `/api/cron/halo-pacing` in `vercel.json`**:
  - *Fixed in:* `vercel.json` (registered as `"0 4 * * *"`) and `src/lib/cron-jobs.ts` (`CRON_JOBS` registry).
  - *Verification:* `test/cron-jobs.test.ts` passes (27/27 tests).
  - *Schedule:* Daily execution safely evaluates pacing, handles expiry, and pauses completed campaigns.

- [x] **Blocker 2: Live Meta Campaigns Paused on Auto-Kill & Duration Completion + Provider-Side `end_time`**:
  - *Fixed in:*
    1. `src/lib/neighborhood-halo-service.ts`: `killHaloCampaign` calls `pauseMetaCampaign(campaign.metaCampaignId)`.
    2. `src/lib/billing/halo-pacing-worker.ts`: When campaign reaches full duration or expiry, calls `pauseMetaCampaign(row.meta_campaign_id)`.
    3. `src/lib/meta-ads-api.ts`: Added `durationDays?: number` and `endTime?: string` to `ProvisionMetaCampaignParams`; ad set payload includes provider-side `end_time: computedEndTime` (ISO-8601).
    4. Hardened `pauseMetaCampaign` to guard against empty strings and handle simulated campaign IDs.
  - *Verification:* `test/neighborhood-halo-service.test.ts`, `test/meta-ads-api.test.ts`, and `test/halo-pacing-worker.test.ts` pass.

- [x] **Blocker 3: Real Elapsed Time Tracking & Zero Synthetic Spend Fabrication**:
  - *Fixed in:* `src/lib/billing/halo-pacing-worker.ts`:
    1. Calculates real calendar elapsed days (`Math.floor((now - createdAt) / 86400000)`), preventing cron frequency from advancing multiple days artificially.
    2. Zeroes out additional spend (`additionalSpend = 0`) on live campaigns if the Meta API insights fetch fails, preventing spend fabrication.
  - *Verification:* `test/halo-pacing-worker.test.ts` passes with real insights mock and failing insights test.

- [x] **Blocker 4: Meta Graph API Version Upgraded to v22.0**:
  - *Fixed in:* Defaulted `META_GRAPH_API_VERSION` to `v22.0` across `src/lib/meta-ads-api.ts`, `src/lib/marketplace-router/meta-lead-ads.ts`, `src/lib/ad-closed-loop-sync.ts`, and tooling scripts, with environment override support (`process.env.META_GRAPH_API_VERSION`).
  - *Status:* Supported through May 2027 (avoiding v20.0 September 2026 deprecation).

- [x] **Blocker 5: Webhook Signature Fail-Closed Security**:
  - *Fixed in:* `src/app/api/webhooks/meta-leads/route.ts`: In production (`NODE_ENV === 'production'`), if `META_APP_SECRET` and `FACEBOOK_APP_SECRET` are unset, requests fail closed with HTTP 500 rather than bypassing verification.

---

## 1. Meta Business Portfolio & Identity Setup (Operator Tasks)

Before configuring production environment variables, organization-level Meta assets must be provisioned and authorized:

- [ ] **Meta Business Portfolio (Business Manager)**:
  - [ ] Business verification completed under Meta Business Settings (`business.facebook.com`).
  - [ ] Two-factor authentication enforced for all Business Portfolio admins.
  - [ ] Dedicated payment method attached to the primary Ad Account with verified spending limits.

- [ ] **Meta Ad Account (`META_AD_ACCOUNT_ID`)**:
  - [ ] Production Ad Account created under the primary Business Portfolio (`USD`, `America/New_York`).
  - [ ] Verify Ad Account status is `ACTIVE` (1) with clean billing status and zero outstanding policy violations.
  - [ ] Record Account ID (numeric string, e.g. `123456789012345`; application normalizes with `act_`).

- [ ] **Facebook Page & Instagram Account (`META_PAGE_ID`)**:
  - [ ] Primary Facebook Page published and linked to the Business Portfolio.
  - [ ] Professional Instagram Account linked to the Facebook Page (for native Instagram placements).
  - [ ] Page profile image, cover photo, website domain (`letsgetquoted.com`), and verified contact details published.

- [ ] **System User & Long-Lived Access Token (`META_ACCESS_TOKEN`)**:
  - [ ] Create a dedicated System User in Business Settings with **Admin** role (e.g. `LGQ-Ads-Engine-Production`).
  - [ ] Assign Assets to System User:
    - Ad Account $\to$ **Manage Campaigns** & **View Performance**
    - Facebook Page $\to$ **Create Content**, **Manage Ads**, & **View Insights**
    - Dataset/Pixel $\to$ **Manage Dataset**
  - [ ] Generate a Permanent System User Token with required scopes:
    - `ads_management` (Create & manage campaigns, ad sets, ads, creatives)
    - `ads_read` (Read campaign metrics & daily spend insights)
    - `pages_read_engagement` (Page feed read access)
    - `pages_manage_ads` (Publish ads under Page identity)
    - `leads_retrieval` (Access inbound webhook lead form data)
  - [ ] Store token securely (token does not expire unless revoked or password rotated).

- [ ] **Meta Dataset / Pixel (`META_PIXEL_ID` / `META_DATASET_ID`)**:
  - [ ] Create or select the primary Dataset in Meta Events Manager.
  - [ ] Record Dataset/Pixel ID for CAPI offline purchase conversion uploads.

---

## 2. Production Environment Variables (Vercel)

All values must be configured with **Production** scope in Vercel.

| Environment Variable | Description | Exact Code Usage |
| :--- | :--- | :--- |
| `META_ACCESS_TOKEN` | System User Permanent Access Token | `src/lib/meta-ads-api.ts` (checked by `isMetaAdsConfigured()`) |
| `META_AD_ACCOUNT_ID` | Production Ad Account ID (`act_...` or raw digits) | `src/lib/meta-ads-api.ts` (normalized via `normalizeAdAccountId`) |
| `META_PAGE_ID` | Facebook Page ID backing ad creatives | `src/lib/meta-ads-api.ts` (`targetPageId`) |
| `META_APP_SECRET` / `FACEBOOK_APP_SECRET` | Meta App Secret | `src/app/api/webhooks/meta-leads/route.ts` (HMAC validation, fails closed in prod) |
| `META_WEBHOOK_VERIFY_TOKEN` | Verification token string for webhook handshake | `src/lib/marketplace-router/meta-lead-ads.ts` (preferred) |
| `META_VERIFY_TOKEN` | Fallback webhook verification token string | `src/lib/marketplace-router/meta-lead-ads.ts` (fallback) |
| `META_PIXEL_ID` / `META_DATASET_ID` | Meta Pixel / Dataset ID for CAPI | `src/lib/meta-ads-api.ts`, `src/lib/ad-closed-loop-sync.ts` |
| `META_GRAPH_API_VERSION` | Pin to Graph API version (default: `v22.0`) | `src/lib/meta-ads-api.ts`, `meta-lead-ads.ts`, `ad-closed-loop-sync.ts` |
| `FEATURE_MANAGED_ADS_CHECKOUT_ENABLED` | Feature flag gating self-service ad purchases | `src/lib/ad-billing-shared.ts` |

---

## 3. Database Schema & Migration Verification

The Neighborhood Halo schema is **already applied in production** (confirmed `ok` via `node scripts/audit-applied-migrations.mjs` for `20260905180000_neighborhood_halo_campaigns.sql`).

- [x] **Verified Database Objects**:
  - Tables: `public.neighborhood_halo_settings` and `public.neighborhood_halo_campaigns`.
  - RLS policies: Access granted via `public.office_can(account_id, 'marketing.read')` and `'marketing.write'`.
  - Service role: Public claim route securely uses `createAdminClient()` after validating HMAC capability tokens.
  - Stored procedures: `atomic_ad_wallet_spend` and `atomic_ad_wallet_credit`.

---

## 4. Graph API Write-Path Verification Runner

Tooling script created: `scripts/verify-meta-ads-api-write-path.mjs`.

- [x] **Test Script Created & Validated**:
  - Supports `--dry-run` mode for safe offline/CI validation.
  - Live execution verifies:
    1. Token inspection (`/me` and `/debug_token`).
    2. Ad account status (`account_status === 1`) and currency (`USD`).
    3. Facebook Page publishing status (`is_published === true`).
    4. Creation of paused test campaign and ad set with `end_time`.
    5. Creative and ad assembly.
    6. Immediate deletion/teardown of test campaign.
- [ ] **Run Live Rehearsal**:
  ```bash
  node scripts/verify-meta-ads-api-write-path.mjs
  ```

---

## 5. Inbound Webhook Handshake & Lead Ads Routing

- [x] **Security Hardening**:
  - HMAC SHA-256 signature verification fails closed in production.
- [ ] **Webhook Handshake Configuration**:
  - Callback URL: `https://letsgetquoted.com/api/webhooks/meta-leads`
  - Verify Token: Matches `META_WEBHOOK_VERIFY_TOKEN` (or `META_VERIFY_TOKEN`).
  - Subscribe to field: `leadgen`.
- [ ] **Synthetic Lead Test**:
  - Fire test lead via Meta Lead Ads Testing Tool (`developers.facebook.com/tools/lead-ads-testing`).
  - Verify lead normalization and insertion into Supabase `leads` with `source: 'facebook_lead_ad'`.

---

## 6. Conversions API (CAPI) Closed-Loop Sync Verification

- [x] **Persistence Architecture**:
  - Durability is grounded on `leads.triage->metaOfflineConversion`.
  - Won-job hooks call `triggerWonLeadMetaCapiConversion(admin, accountId, lead)`.
  - Graph API endpoint upgraded to `v22.0`.
  - **Auction Feedback Scope Note**: Neighborhood Halo campaigns optimize for off-Facebook landing page clicks (`OUTCOME_TRAFFIC` + `LINK_CLICKS`) with no pixel `promoted_object`. Consequently, the server-side CAPI purchase conversion loop functions as closed-loop conversion reporting, CAC measurement, and ROAS attribution within Meta Events Manager and reporting dashboards — it does not directly feed real-time ad auction delivery bidding optimization (which requires a pixel `promoted_object` and `OFFSITE_CONVERSIONS` optimization goal).
- [ ] **Events Manager Test Event Tool**:
  - Trigger synthetic offline conversion upload with `test_event_code`.
  - Verify receipt in Events Manager Test Events tab:
    - Event: `Purchase`
    - Source: `Server`
    - Hashed customer data (`em`, `ph`) and `fbclid` present.

---

## 7. Neighborhood Halo Public Claim Flow & Security Audit

- [x] **Capability Tokens (`claimToken`)**:
  - Public claim URL: `https://[contractor-site]/claim/halo/[campaignId]`
  - Token TTL is **2 hours** (`DEFAULT_TOKEN_TTL_MS = 2 * 60 * 60 * 1000` in `neighborhood-halo-claim-token.ts`), failing closed upon expiry.
- [ ] **End-to-End Claim Test**:
  - Verify claim submissions increment `leads_generated` on `neighborhood_halo_campaigns`.
  - Verify contractor SMS alert fires upon valid claim.

---

## 8. Budget Pacing, Auto-Kill & Wallet Guardrails

- [x] **Atomic Wallet Spend Deductions & Rollbacks**:
  - Handled by `launchHaloCampaign` with `atomic_ad_wallet_spend`.
  - Fail-closed guard: Refuses launch immediately without debiting wallet when Meta is not configured.
  - Immediate rollback with `atomic_ad_wallet_credit` upon provisioning failure.
- [x] **Auto-Kill & Completion Meta Pausing**:
  - Auto-kill criteria (`ageHours >= 72 && impressions >= 150 && clicks === 0`) terminates and pauses on Meta.
  - Duration completion terminates and pauses on Meta.
  - Elapsed calendar days prevent accelerated completion.
  - Synthetic spend fabrication on API failure eliminated.

---

## 9. Controlled Canary Deployment & Go-Live Sequence

1. [ ] **Canary Campaign Launch (Re-run Required with OUTCOME_TRAFFIC)**:
   - *Previous Canary:* Campaign `120254255069430440` was provisioned under the old `OUTCOME_LEADS` / `LEAD_GENERATION` schema.
   - *Current Schema:* The codebase now creates `OUTCOME_TRAFFIC` / `LINK_CLICKS` campaigns without `promoted_object`.
   - *Action:* Re-run `node scripts/verify-meta-ads-api-write-path.mjs` against live Meta API to verify provider acceptance of the new traffic-objective shape before marking live verification complete.

2. [x] **Cron & Sync Registration**:
   - `/api/cron/halo-pacing` registered in `vercel.json` (`0 4 * * *`) and `src/lib/cron-jobs.ts`.
   - `pauseFailures` surfaced in route response and tracked by `cronSummaryHasFailures` to fail the run when non-zero.
   - Real elapsed day pacing and zero synthetic spend logic verified.

3. [x] **Unflag Managed Ads Checkout**:
   - `FEATURE_MANAGED_ADS_CHECKOUT_ENABLED=true` set in Vercel Production and Preview.

---

## 10. Emergency Abort & Kill Switch Procedures

Tooling script created: `scripts/emergency-pause-all-meta-campaigns.mjs`.

- [x] **Emergency Script Validated**:
  - `node scripts/emergency-pause-all-meta-campaigns.mjs --dry-run` verified.
  - Live execution queries all active campaigns under `META_AD_ACCOUNT_ID` and pauses them via Graph API.
- **Protocol in Case of Incident**:
  1. **Run Emergency Script**:
     ```bash
     node scripts/emergency-pause-all-meta-campaigns.mjs
     ```
  2. **Disable Checkout**:
     - Set `FEATURE_MANAGED_ADS_CHECKOUT_ENABLED=false` in Vercel.
  3. **Revoke System User Access Token (Last Resort)**:
     - Revoking token causes `isMetaAdsConfigured()` to evaluate to `false`, failing closed across all provisioning.
