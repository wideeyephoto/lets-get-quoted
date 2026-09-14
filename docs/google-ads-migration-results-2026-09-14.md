# Google Ads migration and live verification — September 14, 2026

The developer-token migration is deployed and live OAuth/account discovery succeeded without the developer-token header. Verification passed on the exact production deployment; the custom app-domain verification route returned 404 and remains an open prelaunch item in [LAUNCH_CHECKLIST.md](../LAUNCH_CHECKLIST.md).

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

**Open acceptance item:** reconcile the custom app-domain routing/deployment, then repeat the authenticated read-only request through that domain and attach its timestamp and response before checking off the domain item. General go-live, ad-spend authorization and write-path gates retain their existing requirements.
