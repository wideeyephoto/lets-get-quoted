# Google Ads Production Credential Setup

Date started: 2026-09-01

Current status: complete. All five values are stored as Vercel Production secrets, their names and Production scope were verified without revealing values, and the redeployment completed with Ready status. The exact five-input application configuration predicate is satisfied. OAuth refresh and Google Ads API v25 read access were also verified successfully.

Purpose: provision the five server-side Google Ads credentials required by the production application without storing credential values, OAuth tokens, or customer IDs in the repository.

## Required Vercel Production variables

- `GOOGLE_ADS_CLIENT_ID`
- `GOOGLE_ADS_CLIENT_SECRET`
- `GOOGLE_ADS_DEVELOPER_TOKEN`
- `GOOGLE_ADS_REFRESH_TOKEN`
- `GOOGLE_ADS_MCC_CUSTOMER_ID`

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
- Separate compatibility finding: the primary Google Ads client in `src/lib/google-ads-api.ts` is pinned to API `v20`. That endpoint returned HTTP 404 during verification, while `v25` succeeded. The credentials are valid, but primary campaign operations should be upgraded to a supported API version before relying on them.

## Security notes

- Secrets and customer IDs are handled only in authenticated provider surfaces and encrypted Vercel configuration.
- No secret value is printed to command output, committed, or retained in a temporary repository file.
- Adding a second OAuth client secret leaves the existing secret enabled; the existing website-login integration is not rotated during this work.
- A newly issued developer token may initially have Test Account Access. Production calls require Explorer, Basic, or Standard Access; Basic Access review is typically five business days when an automatic Explorer upgrade is not granted.
- The issued developer token has Explorer Access, so it can make production-account requests within Google's Explorer quota.
- Google Cloud projects become paired with a Google Ads developer token after the first API request. This project must not be tested with a different manager account's token.
