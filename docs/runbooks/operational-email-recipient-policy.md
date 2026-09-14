# Operational email recipient policy

Local review and implementation, September 14, 2026. No hosted settings, messages or rollout changes were performed.

## Queued operational findings

Immediately before each queued submission, the monitor verifies that the saved payload has exactly one To address matching the currently configured operations recipient, with no additional Cc/Bcc recipients. A configuration change does not rewrite or redirect an existing intent. A mismatch moves the existing delivery to `manual_review` without submitting it.

An exact normalized-address lookup in `platform_email_suppression` then applies delivery blocks: `hard_bounce`, `complaint` and `provider_suppressed` move the delivery to `manual_review`. Marketing-only opt-outs do not block operational alerts. Missing, mismatched or unknown data, lookup errors and thrown connection failures defer the existing intent through its pending retry path, without a provider request.

The saved body, recipients and `lgq-operational-<id>` provider key remain unchanged. The check adds no tags or replacement payload. Existing leases, five-minute deferral, pacing, 23-hour idempotency cutoff and accepted-message receipt checks retain their existing behavior. In particular, uncertain provider acceptance is not permission to replace a payload or key.

This path requires the existing platform preference migration `20260914152829_platform_campaign_preferences.sql`. It introduces no new schema. The existing operational delivery constraint already supports `manual_review`. Missing preference storage fails closed for queued alerts.

## Independent emergency channel

`sendMonitorFailure` and `sendMonitorRecovery` remain independent of the suppression database so they can report database outage and recovery. They are explicit operations notifications, not a customer/marketing fallback. They validate a single plain recipient address and preserve existing outage/recovery keys. Recovery validates configuration before claiming dispatch. Both now require a nonempty provider acceptance ID; all operational HTTP requests reject redirects and retain their timeout.

Recipient precedence remains `ONCALL_PRIMARY_EMAIL`, then `FOUNDER_ALERT_EMAIL`, then the existing `hello@letsgetquoted.com` fallback. This pass does not certify the fallback mailbox or change who receives alerts. Before hosted release, configure and verify the intended responder and backup. Comma-separated recipients, display-name wrappers, whitespace and header injection are rejected.

**Exception:** emergency outage/recovery notices do not perform a local suppression lookup. Provider rejection remains visible, but this channel is not claimed to have platform-table enforcement. An independent responder channel and provider-recipient validity need operational verification. Do not use this exception for ordinary customer messages.

## Remaining evidence and recovery

Queued-alert callbacks continue to update receipt evidence by provider ID. The subsequent callback pass also checks otherwise unscoped delivery-block events against the operational ledger's unique provider ID. Only an exact match to the saved single recipient, with no extra recipients or tenant tag in the saved payload, establishes platform scope. Complaints, provider suppressions and permanent bounces then use existing atomic platform reason-promotion rules. Transient/undetermined bounces do not create blocks. Lookup or suppression-write failures return a retryable webhook error; mismatched bindings remain errors requiring review.

Existing saved payloads gain no tags or replacement keys. A callback arriving before its provider ID is saved, an emergency notification without a ledger row, or an unknown provider ID does not establish scope; the event remains recorded without inferred platform suppression. This race and historical/provider evidence reconciliation remain open. Do not alter saved payloads to add tags under an existing idempotency key.

Review blocked or mismatched deliveries using the existing send reference, destination configuration and provider evidence. Reconcile uncertain acceptance before changing configuration or creating another notification. A healthy scan state is not proof of successful notification: inspect `failed`, manual-review records and actual responder receipt.

Validation: 4 files / 57 tests passed, including 25 new recipient-policy cases, existing outage independence, accepted-send bookkeeping failures, lease recovery, cron error handling and SMS paging. Full application/test type checking passed. Lint has no errors and two existing unused-variable warnings. Registry transport signatures still match. Hosted database/provider/receiver acceptance was not performed.

Subsequent callback validation: 4 files / 97 tests passed, including 13 new signed-callback cases for exact binding, recipient mismatch, extra recipients, tenant-scope rejection, unavailable reads, failed writes, unknown/early IDs and transient bounces. Full application/test type checking and changed-file lint passed. No schema, saved payload, provider permission or hosted change was made.
