# Google Ads migration and live verification — September 14, 2026

The developer-token migration, app-domain access and fresh campaign-write checks passed. **Offline conversions remain blocked:** the September 14 retest using the real configured action returned Google's requirement to migrate to Data Manager API. The corrected verifier treats that partial failure as a failure, superseding the older conversion-green conclusion. See [LAUNCH_CHECKLIST.md](../LAUNCH_CHECKLIST.md).

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

The Data Manager transport and new authorization have **not** been implemented or obtained in this verification follow-up. The app-domain and campaign checks are complete; conversion acceptance and attribution remain open.
