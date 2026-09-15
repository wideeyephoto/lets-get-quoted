# Google Ads Production Credential Setup

Date started: 2026-09-01

Historical setup status (2026-09-01): complete. All five original values were stored as Vercel Production secrets and OAuth refresh and Google Ads API v25 read access were verified successfully.

Purpose: document the server-side Google Ads configuration without storing credential values or OAuth tokens in the repository.

## Required Vercel Production variables (updated 2026-09-14)

- `GOOGLE_ADS_CLIENT_ID`
- `GOOGLE_ADS_CLIENT_SECRET`
- `GOOGLE_ADS_REFRESH_TOKEN`
- `GOOGLE_ADS_MCC_CUSTOMER_ID`

Google Ads API access now belongs to the Cloud project that owns the OAuth client. The application uses direct REST requests, so no Google Ads client-library upgrade is required. It no longer reads or sends a developer token. Deprecated configuration fields and CLI arguments are accepted but ignored for compatibility.

The serving advertiser ID (`GOOGLE_ADS_CLIENT_CUSTOMER_ID`, or an explicit per-call advertiser ID) is also required for campaign operations. OAuth credentials, account permissions, and the manager/advertiser distinction are unchanged.

Cloud Console review on 2026-09-14 confirmed Explorer access for LETSGETQUOTED: 2,880 production operations/day and 15,000 test operations/day. The organization mailbox is already a project Owner and is eligible for future mandatory API notices. No IAM grants were changed.

Manage access and upgrade applications in Google Cloud Console → Google Ads API Overview. The September 2026 announcement expects future API releases to reject developer-token headers in the first half of 2027. See [Google's migration guide](https://developers.google.com/google-ads/api/docs/api-policy/developer-token).

The records below describe the original token-based setup and historical verification; they are not current setup instructions.

## Confirmed starting state

- All five variables were absent from Vercel Production, Preview, and Development.
- No trusted local environment file, archive, process environment, or Git history entry contained their values.
- The Google Cloud project is `LETSGETQUOTED`.
- An existing website-login OAuth client remains in use; its original secret is intentionally not changed or removed.
- The organization Google Ads identity initially had only a standard advertiser account, not a manager account.

## Change record

- [x] Enabled Google Ads API in the `LETSGETQUOTED` Google Cloud project.
- [x] Save the sensitive Google Ads OAuth scope (`https://www.googleapis.com/auth/adwords`).
- [x] Publish the OAuth app so an offline refresh token does not expire after seven days.
- [x] Add a second client secret while preserving the existing website-login secret.
- [x] Create a production Google Ads manager account for the company's own accounts (United States, New York time, USD).
- [x] Link the existing advertiser account to the manager account, accept the link, and verify the active relationship from the advertiser account.
- [x] Submit the Google Ads API Access form and record the issued developer-token access level (Explorer Access).
- [x] Generate a long-lived refresh token using the official OAuth flow and the organization identity; remove and verify removal of the temporary OAuth Playground redirect URI.
- [x] Store all five values as encrypted, Production-only Vercel environment variables.
- [x] Redeploy Production so the new environment revision is active; verify the deployment reaches Ready status.
- [x] Verify all five names exist with Production scope without printing their values.
- [x] Verify the application's exact Google Ads configuration predicate is satisfied by the five non-empty Production secrets in the Ready deployment.

## Verification results

- The OAuth refresh grant returned HTTP 200 and issued an access token.
- A read-only Google Ads API v25 `customers:listAccessibleCustomers` request returned HTTP 200.
- Both the linked manager account and advertiser account were present in the accessible-account response; their IDs were not printed or recorded here.
- The deployed application does not expose a dedicated read-only endpoint for the exact five-variable predicate. Verification therefore paired the exact predicate in `src/lib/google-ads-api.ts` with the five Production-only secret entries and the Ready redeployment.
- Compatibility status: The primary Google Ads client in `src/lib/google-ads-api.ts` has been upgraded to API `v25` by default (retiring legacy v17 offline conversions and pruning redundant v20 LSA endpoints).
- Write-path verification contract: Implemented and validated the campaign creation and status toggle runner (`scripts/verify-google-ads-v25-write-path.mjs`) against Google Ads API v25 schema. Validated OAuth 2.0 refresh, `customers:listAccessibleCustomers` advertiser account isolation, budget mutation, paused campaign creation (`status: 'PAUSED'`, `containsEuPoliticalAdvertising: 'DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING'`, `maximizeConversions: {}`), status toggle write-path mutations with updateMask `status`, and immediate teardown (`status: 'REMOVED'`). Full contract test coverage verified in `test/google-ads-write-path.test.ts`. Note: Dry-run and mocked tests validate API payload shapes; live network execution against production advertiser account `228-567-1544` is required prior to booking alpha campaigns.
- Offline conversion upload & Data Manager API verification: Implemented standalone verification runner (`scripts/verify-google-ads-offline-conversions.mjs`) and test suite (`test/google-ads-offline-conversions.test.ts`). Proves whether the active developer token is allowlisted for `ConversionUploadService.UploadClickConversions` or restricted under Google's June 15, 2026 cutoff (which mandates migration to Google Data Manager API for tokens without 2025-2026 historical upload traffic).
- Environment variable deployment gating: `GOOGLE_ADS_CLIENT_CUSTOMER_ID` is required by `resolveServingCustomerId()` to clear the 503 guard in `/api/stripe/ad-budget`. Vercel environment variable additions take effect only after a Production redeployment.

## Separate public acquisition tracking

The five `GOOGLE_ADS_*` values above authorize server-side campaign management. They do not configure Let's Get Quoted's own public acquisition tag or sign-up attribution.

Production acquisition tracking uses these paired public identifiers:

- `NEXT_PUBLIC_GOOGLE_TAG_ID`
- `NEXT_PUBLIC_GOOGLE_ADS_SIGNUP_CONVERSION_ID`

They are public identifiers, not credentials. Both are configured as Vercel Production `Config` values; Preview and Development remain unset so non-production traffic cannot pollute the Production conversion action. Because Next.js embeds `NEXT_PUBLIC_*` values at build time, any addition, change, or removal requires a new Production deployment.

Verification completed 2026-09-01 against READY Production release `97761d26`:

- [x] Both identifiers exist with Production-only scope and share the same Google Ads base tag ID.
- [x] The public homepage and pricing page render the tag; `gtag.js` returned HTTP 200 in a real browser.
- [x] Login/token-sensitive routes render no Google tag or data layer.
- [x] Page arrival emits zero sign-up conversion commands.
- [x] One labeled synthetic sign-up conversion added exactly one command and received HTTP 204 from Google's collection endpoint.
- [x] Google's current collection endpoint is explicitly allowed by `connect-src`; the verified marketing-page run produced no Google CSP violation.
- [x] First-run action tests prove validation failures, zero-row/database failures, unavailable prior state, and returning Terms acceptance are not conversion-eligible.
- [x] A persisted initial onboarding returns a stable opaque transaction ID, and the client sends it through the once-per-page conversion helper before best-effort site seeding.

Consent currently defaults `ad_storage`, `ad_user_data`, `ad_personalization`, and `analytics_storage` to `denied`; no consent-update path is implemented. The verified event therefore uses Google's privacy-limited Consent Mode behavior and must not be described as full cookie-based attribution.

## Historical security notes (before the September 2026 migration)

- Secrets and customer IDs are handled only in authenticated provider surfaces and encrypted Vercel configuration.
- No secret value is printed to command output, committed, or retained in a temporary repository file.
- Adding a second OAuth client secret leaves the existing secret enabled; the existing website-login integration is not rotated during this work.
- A newly issued developer token may initially have Test Account Access. Production calls require Explorer, Basic, or Standard Access; Basic Access review is typically five business days when an automatic Explorer upgrade is not granted.
- The issued developer token has Explorer Access: permits production-account operations capped at **2,880 operations/day for production accounts** (the 15,000 operations/day limit applies only to test accounts under Explorer Access, or to Basic Access tokens). Upgrading to Basic Access (15,000 ops/day on production) requires standard application review in the Google Ads API Center.
- Google Cloud projects become paired with a Google Ads developer token after the first API request. This project must not be tested with a different manager account's token.

## Live Network Verification Record (Completed 2026-09-07)

Live write-path and offline conversion probes were executed against real Google Ads API v25 endpoints from Vercel Production via authenticated endpoint `/api/admin/verify-google-ads`:

1. **Serving Account Confirmation**: Queried account metadata for advertiser `228-567-1544` under MCC `***-***-7203`. Confirmed `testAccount: false` (real production account), `currency: USD`, `timeZone: America/New_York`.
2. **Campaign Budget Mutation**: Successfully created daily campaign budget (`campaignBudgets/15859183194`, HTTP 200).
3. **Paused Campaign Creation**: Successfully created search campaign with `status: 'PAUSED'`, `containsEuPoliticalAdvertising: 'DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING'`, and `maximizeConversions: {}` (`campaigns/24231331135`, HTTP 200).
4. **Status Mutate & Teardown**: Executed `campaigns:mutate` status update with `updateMask=status`, cleanly transitioning the test campaign to `REMOVED` (HTTP 200). Zero test spend incurred.
5. **Offline Click Conversions Reachability**: Probed `ConversionUploadService.uploadClickConversions`. Received HTTP 200 (`allowlisted: true`, `requiresDataManagerApi: false`), confirming the developer token is active and allowlisted on production without blocking errors.

