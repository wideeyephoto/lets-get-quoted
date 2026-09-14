# Google Ads migration and live verification — September 14, 2026

**The developer-token and Data Manager migrations are deployed and production validation passes.** App-domain access and fresh campaign writes passed; the enabled Data Manager transport passed its production validation-only check at 18:52 UTC with zero warnings. Real conversion ingestion/attribution remains unverified because the user has no genuine eligible unuploaded event. The earlier Google upload restriction and initial Data Manager payload failure below are resolved historical checkpoints. See [LAUNCH_CHECKLIST.md](../LAUNCH_CHECKLIST.md).

## Cloud access and contacts

- Manager customer: `975-646-7203`.
- Cloud project: `letsgetquoted`, number `126766638442`, label LETSGETQUOTED.
- Cloud Console showed EXPLORER access, 2,880 daily production operations and 15,000 test operations.
- IAM showed `hello@letsgetquoted.com` (Brett A) already assigned Owner, so it is eligible for future mandatory project notices. No roles were granted or changed.
- Google's notice states upcoming API releases in the first half of 2027 will no longer accept developer tokens and the legacy API Center is expected to be decommissioned in that period. Current access is tied to the Cloud project owning the OAuth credentials; see [Google's migration documentation](https://developers.google.com/google-ads/api/docs/api-policy/developer-token).

## Implementation and release evidence

| Change | Release | Verification |
| --- | --- | --- |
| Remove developer-token headers and required-token checks from managed Google Ads, Local Services Ads, server verifier and both CLI scripts; update setup guidance and diagnostics | [PR #88](https://github.com/wideeyephoto/lets-get-quoted/pull/88), merge `190aebe29570bd193459e6922fbe69185afb5d1e`; READY deployment `dpl_XefjDwZA9RVbqa44A8c5NAWCpa5w` | 136 focused tests across 10 files, TypeScript and local production build passed; [full CI passed](https://github.com/wideeyephoto/lets-get-quoted/actions/runs/34860824257); Vercel preview passed |
| Add `GET /api/admin/verify-google-ads/read-only`, protected by the existing CRON_SECRET Bearer header and constant-time comparison | [PR #89](https://github.com/wideeyephoto/lets-get-quoted/pull/89), merge `b1c4bdd52a61d593fb1aee2815322e29e695ce41`; READY deployment `dpl_AvAHiewcmXRG8UNobdqVh2QNFHsJ` | 28 focused tests across 3 files, TypeScript and local production build passed; [full CI passed](https://github.com/wideeyephoto/lets-get-quoted/actions/runs/34864892325); Vercel preview passed |

`getGoogleAdsConfig()` no longer reads `GOOGLE_ADS_DEVELOPER_TOKEN`. Legacy token options and flags remain accepted but ignored/deprecated. OAuth and manager/advertiser account restrictions remain in place. The application uses direct REST, so no Google Ads SDK upgrade was needed. The old production token secret remains stored but unused; no credentials were rotated or downgraded.

The new verifier performs OAuth refresh followed by `customers:listAccessibleCustomers`, with bounded timeouts, no caching and sanitized responses. It exposes only status, timestamp, account count and manager accessibility. Tests cover rejected authentication, the OAuth/discovery-only request sequence, omitted developer-token header, secret nondisclosure and sanitized errors. The older base verification endpoint has write behavior; use the explicit `/read-only` path for this check.

## Live result

At **2026-09-14T16:11:32.226Z** (12:11:32 EDT), authenticated Vercel CLI access to [the production deployment](https://lets-get-quoted-3g80m5mo2-lets-get-quoted.vercel.app) returned:

```json
{
  "ok": true,
  "mode": "read-only",
  "upstreamStatus": 200,
  "developerTokenHeaderSent": false,
  "accessibleAccountCount": 2,
  "managerAccountAccessible": true
}
```

The [sanitized evidence file](google-ads-token-free-live-result-2026-09-14.json) records the timestamp, deployment ID, URL, merge commit, access method and app-domain status. This confirms OAuth refresh and account discovery with the deployed production credentials, without a developer token. No campaigns or conversions were modified by this probe. September 7 campaign-write and offline-conversion results are historical; those paths were not freshly exercised on September 14.

## Retry history and remaining work

- Earlier direct Vercel REST credential access returned 403. Refreshing CLI login succeeded, but old saved-token REST access still returned 403.
- Vercel CLI production environment retrieval could not export Secret values, including the Google OAuth credentials. The Vercel environment page confirmed those credentials existed as Production Secrets. They were not revealed, exported or made less restricted.
- The deployed read-only endpoint allowed verification where those protected credentials are available. Direct deployment URLs required Vercel SSO; authenticated CLI access succeeded without disabling deployment protection. The earlier statement that live token-free access was unverified is superseded by the successful response above.
- At **2026-09-14T16:09:18.486Z**, the same path on `https://app.letsgetquoted.com` returned **404**. The exact READY deployment later passed. The cause of the domain/deployment difference is not confirmed; no domain settings were changed.
- An incidental authenticated health request returned 503 during access troubleshooting. Its cause was not investigated in this Google Ads task; the successful Google check does not establish overall application health.

**App-domain acceptance completed at 17:20:41.216 UTC:** Vercel resolved `app.letsgetquoted.com` to deployment `dpl_AvAHiewcmXRG8UNobdqVh2QNFHsJ`, merge commit `b1c4bdd52a61d593fb1aee2815322e29e695ce41`, with the custom domain in its aliases. The authenticated read-only request through that domain returned HTTP 200, upstream 200, no developer-token header, two accessible accounts and manager access. No routing configuration change was necessary in this follow-up. The exact cause of the earlier transient 404 was not established. [App-domain evidence](google-ads-app-domain-live-result-2026-09-14.json).

The follow-up review found the older write verifier did not check its campaign cleanup response, left the budget behind and used a placeholder conversion action. [PR #91](https://github.com/wideeyephoto/lets-get-quoted/pull/91) corrects those checks: campaign and budget cleanup responses are checked, failed account reads stop writes, and conversion validation uses the configured action with `validateOnly=true`, rejecting HTTP 200 partial failures. These checks do not record synthetic conversions or establish real-click attribution.

PR #91 merged as `eebbcabab7fdef3b35534ff88fbb8a232a50b939`. Local validation passed 145 focused tests across 14 files and TypeScript. The first full CI run found four legacy test expectations requiring updates for the corrected server contract; after correction, [full CI run 34875490176](https://github.com/wideeyephoto/lets-get-quoted/actions/runs/34875490176) passed in 10m41s, including the full unit suite, database checks, type checking, lint and production build. The updated Vercel preview also passed. The legacy standalone CLI's reachability-only behavior is distinct from the strict server verifier used for this follow-up.

## Final production follow-up at 17:51 UTC

The new production deployment was READY but had `readySubstate: STAGED`, `aliasAssigned: false` and a pending deployment-alias check. The app domain was still on the preceding release. Project domain records were verified and automatic custom-domain assignment was enabled. Explicitly promoting `dpl_55Ktz8TMDVWjNeXczWTg5RjrVz6i` succeeded, after which resolving the app domain returned the new merge commit. This establishes the deployment mismatch and its repair for this release; it does not prove why Vercel originally staged it. Future release checks must verify custom-domain assignment rather than relying on READY alone.

| Check | Result |
| --- | --- |
| App-domain authenticated read-only request, 17:51:00.042 UTC | HTTP 200, Google upstream 200, no developer-token header, two accessible accounts, manager accessible |
| OAuth, advertiser discovery and account read | PASS |
| Billing | APPROVED |
| Budget creation | PASS; test budget `15871507184` |
| PAUSED campaign creation and PAUSED status update | PASS; test campaign `24251013287` |
| Campaign removal and budget removal | Both provider responses successful; never activated campaign |
| Offline conversion validation, real configured Job Won action `7752658766` | FAIL; Google requires Data Manager API |
| Combined verification route | HTTP 207, `ok: false`; campaign report success, conversion report failure |

Google's response says new click-conversion integrations should use Data Manager API and restricts `ConversionUploadService.UploadClickConversions` to existing users. The restriction appeared in `partialFailureError` despite upstream HTTP 200. The new server verifier correctly rejects it. Its `requiresDataManagerApi` boolean currently only classifies non-2xx restrictions and was false for this partial failure; the error message and `success: false` are authoritative here. Do not use that boolean alone as a readiness decision.

Evidence: [promoted app-domain response](google-ads-promoted-domain-live-result-2026-09-14.json), [campaign and conversion reports](google-ads-write-conversion-live-result-2026-09-14.json). Payment-account identifiers were omitted from the stored report. No production credentials were revealed or changed, no campaign was activated, and the conversion request used `validateOnly=true`, so no conversion was recorded.

## Remaining conversion migration and acceptance

Google documents the historical conversion-upload access restriction and directs affected integrations to Data Manager. Removing or restoring the developer-token header does not resolve this restriction. [Google Ads deprecations](https://developers.google.com/google-ads/api/docs/deprecations).

1. Enable Data Manager API on the OAuth Cloud project and authorize credentials with `https://www.googleapis.com/auth/datamanager`. Retain the existing `adwords` authorization for campaign management. The new scope requires a Google authorization grant; existing Ads account-discovery success does not establish it. [Data Manager authorization requirements](https://developers.google.com/data-manager/api/reference/rest/v1/events/ingest).
2. Migrate the production upload transport in `src/lib/google-ads-api.ts` and its verifier to `POST https://datamanager.googleapis.com/v1/events:ingest`. For this account, use the conversion-owning advertiser as `operatingAccount` (`GOOGLE_ADS`, `2285671544`), the manager as `loginAccount` (`GOOGLE_ADS`, `9756467203`), and action ID `7752658766` as `productDestinationId`. Verify ownership for each tenant instead of assuming all actions use this advertiser. [Destination migration rules](https://developers.google.com/data-manager/api/devguides/events/google-ads/offline/upgrade).
3. Map event timestamp, stable transaction/order ID, currency, conversion value, click identifiers and appropriately normalized/hashed user identifiers. Preserve consent and tenant/account restrictions. Add regression tests for destination ownership, formatting, provider rejection and diagnostics; do not mark asynchronous acceptance as completed attribution. [Event request guide](https://developers.google.com/data-manager/api/devguides/events/send-events).
4. First pass `validateOnly=true` against the production destination using the newly authorized credentials. Then verify a genuine eligible conversion and its downstream diagnostics without inventing a conversion or duplicating an existing event. Attach dated evidence before closing the offline-conversion launch gate.

## Data Manager implementation follow-up — September 14, 18:24 UTC

The transport is implemented in [PR #92](https://github.com/wideeyephoto/lets-get-quoted/pull/92), commit `917b694da`. It includes destination ownership checks, normalized and hashed enhanced-conversion identifiers, stable transaction IDs, provider request-ID persistence, sanitized failures, and a protected validation-only endpoint. Production selection is gated by `GOOGLE_ADS_CONVERSION_TRANSPORT=data-manager`. The existing Ads authorization remains available for campaign management.

Local verification passed **157 focused tests across 16 files** and TypeScript. Vercel preview passed. Full CI run `34879405525` has passed unit tests, database checks, TypeScript and lint; the build job is still pending at this checkpoint. The PR has not yet been merged or promoted.

Data Manager API is enabled on the Cloud project. A dedicated desktop OAuth client named **LGQ Data Manager Conversions** was created. The user approved exchanging Google consent and storing the three new credentials as protected Vercel production variables. The client-ID variable was successfully saved as a Production Secret. The automated save encountered a missing project link followed by a Windows command-quoting error; both helper defects were corrected. The client secret and refresh token are **not confirmed saved**.

The final consent retry was blocked by automatic approval review: Google's required `datamanager` scope allows seeing, creating, editing, importing and deleting customer data across Google Ads, Google Marketing Platform and Google Analytics, broader than the upload-only purpose described in the initial credential approval. Explicit approval of this full scope is pending. No workaround was used after the rejection.

Remaining acceptance: finish approved OAuth and protected credential storage; finish CI and deploy; pass the dedicated validation-only route through the app domain; then enable the production transport and revalidate the active release. A genuine eligible event and downstream diagnostics remain necessary to establish real conversion acceptance/attribution. API configuration or a validation-only success must not be represented as recorded attribution.

### Authorization and release follow-up — September 14, 18:31 UTC

The user explicitly approved the full Data Manager permission after the scope clarification. The consent grant succeeded. At **18:27:41.674 UTC**, the helper confirmed all three dedicated credentials were saved as protected Vercel Production Secrets. The Windows command wrapper was replaced with PowerShell; no secret values were printed or committed. The previous pending-approval and incomplete-storage checkpoint is superseded.

PR #92 passed the full CI run in **11m 1s** and merged as `efc8bc44f386b4eab4cd9c8b5890e752a932f10a`. A fresh production deployment `dpl_5dh3ybVWmJgJV4L3m9w85ivSL7Gz` was started after credential storage to bind the new variables. Production transport selection remains unchanged pending live validation.

Cloud Audience status was verified as **In production**, External. Google displays an app-verification requirement for unapproved sensitive/restricted scopes and a 100-user cap. This is a broader OAuth distribution consideration; this owner grant succeeded. No publishing-status or user-cap settings were changed.
### Live payload correction — September 14, 18:37 UTC

The credential-bound release was promoted successfully to the app domain. At **18:32:28.072 UTC**, the protected endpoint reached ingestion but Google returned HTTP 400. A local validation-only diagnostic identified `REQUIRED_FIELD_MISSING` at `events.events[0].event_source`. The general Event reference marks this field optional, but the Google Ads offline destination requires it.

[PR #93](https://github.com/wideeyephoto/lets-get-quoted/pull/93), commit `59a65c4a6`, explicitly sends `eventSource: OTHER` for offline CRM events and both verification paths. Thirteen focused transport/route tests passed, including a regression for this requirement. The corrected payload then received Google HTTP 200 with validation request ID `v-809be260-6293-4c52-9d34-df59a81cfeb9`. It still used `validateOnly=true`; this is not a recorded conversion. [Initial deployed failure](google-data-manager-initial-validation-2026-09-14.json), [corrected Google validation](google-data-manager-corrected-validation-2026-09-14.json).

The corrective preview deployment passed. Full corrective CI and production activation are pending at this checkpoint. A genuine unuploaded Google Ads won-job/lead ID was requested for the final real-event check.

The user confirmed no genuine eligible unuploaded conversion is available. Real-event ingestion/attribution must remain an open first-conversion acceptance gate; no synthetic sale will be generated. This does not prevent enabling the API transport after production validation passes.

### Corrective release gates complete — September 14, 18:48 UTC

Full CI run `34881769597` passed, including the full unit suite, database checks, type checks, lint and build. PR #93 merged as `4cbc22a6a347e591125223088ed00a5425bcc7ae`. After live corrected-payload validation and passing CI, the production configuration was set to `GOOGLE_ADS_CONVERSION_TRANSPORT=data-manager`. Deployment `dpl_F27bydJqQWBnsUW56MU2vRuUeQeb` is building from that merge with the new setting.

## Final production acceptance — September 14, 18:52 UTC

Deployment `dpl_F27bydJqQWBnsUW56MU2vRuUeQeb` (`https://lets-get-quoted-pe13ksmmq-lets-get-quoted.vercel.app`), merge `4cbc22a6a347e591125223088ed00a5425bcc7ae`, completed successfully and was explicitly promoted. Resolving `app.letsgetquoted.com` confirmed this exact READY release.

- At **18:52:31.702 UTC**, the protected Data Manager route returned **HTTP 200**, `ok: true`, `productionTransportEnabled: true`, stage `ingestion`, **zero warnings**, `validationOnly: true`, and `conversionRecorded: false`. [Production validation evidence](google-data-manager-production-validation-2026-09-14.json).
- At **18:52:40.545 UTC**, the protected Ads read-only route returned **HTTP 200**, Google upstream 200, no developer-token header, two accessible accounts and manager access. [Post-cutover account-access evidence](google-ads-post-data-manager-read-only-2026-09-14.json).
- The downloaded temporary client-secret JSON was removed after successful protected storage and authorization. Production secrets were not exported or committed.

The migration and production API configuration/validation are complete. Genuine conversion ingestion, provider processing and attribution remain unverified because no eligible real event is available. No synthetic conversion was recorded and no campaign was activated. Review the first genuine conversion's request ID and downstream diagnostics before calling attribution green.
