# Google Ads Production Credential Setup

Date started: 2026-09-01

Current status: the new manager account is linked to the existing advertiser account and the active relationship was verified from the advertiser account. The Google Ads API Access application is fully staged as an Agency/SEM submission; Google's API Terms remain unchecked and the developer token has not been created pending explicit user confirmation.

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
- [ ] Submit the Google Ads API Access form and record the issued developer-token access level.
- [ ] Generate a long-lived refresh token using the official OAuth flow and the organization identity.
- [ ] Store all five values as encrypted, Production-only Vercel environment variables.
- [ ] Redeploy Production so the new environment revision is active.
- [ ] Verify all five names exist in Production without printing their values.
- [ ] Verify the application's Google Ads configuration check succeeds.

## Security notes

- Secrets and customer IDs are handled only in authenticated provider surfaces and encrypted Vercel configuration.
- No secret value is printed to command output, committed, or retained in a temporary repository file.
- Adding a second OAuth client secret leaves the existing secret enabled; the existing website-login integration is not rotated during this work.
- A newly issued developer token may initially have Test Account Access. Production calls require Explorer, Basic, or Standard Access; Basic Access review is typically five business days when an automatic Explorer upgrade is not granted.
- Google Cloud projects become paired with a Google Ads developer token after the first API request. This project must not be tested with a different manager account's token.
