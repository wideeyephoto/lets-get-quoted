# Google Ads conversions through Data Manager

Campaign management continues to use the Google Ads API. Set `GOOGLE_ADS_CONVERSION_TRANSPORT=data-manager` to send offline conversions through Data Manager. No developer-token header is sent. The legacy transport remains available while the new authorization is being provisioned; do not interpret legacy HTTP 200 partial failures as accepted conversions.

Enable `datamanager.googleapis.com` in the OAuth Cloud project. Authorize a Google user with access to the conversion-owning advertiser (directly or through the configured manager) for `https://www.googleapis.com/auth/datamanager`. Save the dedicated `GOOGLE_DATA_MANAGER_CLIENT_ID`, `GOOGLE_DATA_MANAGER_CLIENT_SECRET` and `GOOGLE_DATA_MANAGER_REFRESH_TOKEN` as sensitive server-side production variables. Never commit their values. An Ads-only refresh token cannot gain this new permission without a new Google authorization grant.

Deploy with those variables, then call `GET /api/admin/verify-google-ads/data-manager` with the existing CRON_SECRET Bearer header. It validates the configured `GOOGLE_ADS_CONVERSION_ACTION_ID_WON_JOB` destination without recording a conversion. No secrets or account identifiers are returned. After validation succeeds, enable the transport variable and redeploy/promote; verify the custom app domain points to the tested release, not just that a deployment is READY.

The destination advertiser must own the supplied numeric conversion action. Full resource paths with a different owner are rejected. Events retain their stable order IDs, timestamps, click identifiers and normalized/hashed identifiers. Consent is not assumed or invented. Incomplete addresses are omitted. Actual ingestion requires a stable order ID and an ingestion request ID from Google; acceptance for processing is not confirmation of attributed conversions.

Verify a genuine eligible event and its downstream diagnostics before claiming real-click attribution. A validation-only probe deliberately does not prove that an actual event has been recorded. Do not generate fake sales or duplicate existing events merely to make a launch check green.

References: [Google migration guide](https://developers.google.com/data-manager/api/devguides/events/google-ads/offline/upgrade), [ingestion API and OAuth scope](https://developers.google.com/data-manager/api/reference/rest/v1/events/ingest), [user identifier format](https://developers.google.com/data-manager/api/reference/rest/v1/UserData).
