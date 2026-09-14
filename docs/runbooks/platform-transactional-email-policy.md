# Platform transactional delivery policy

Local implementation, September 14, 2026. No hosted changes, email sends or rollout expansion were performed.

## Covered paths

- Owner magic-link login and crew self-login before selecting a workspace. Account-specific crew invitations retain their tenant gate.
- Requested public tool reports, including accurate failure when the provider is absent or acceptance is missing.
- Founder signup, messaging-application, operational emergency and feature-request alerts.
- Operator executive digests and critical incident emails. Existing optional webhook channels remain independent.
- Internal merchandise staff alerts. Customer receipts retain the order workspace gate.
- Shared contact-message, support-staff and support-customer messages, including any domain fallback attempt.
- Support auto-responder direct HTTP submission, with the same final platform check and callback scope; its existing ten-second timeout remains bounded and redirects are rejected.

These paths use the shared application Resend configuration. Their recipients are platform recipients; mentioning a customer account in the content does not grant that account ownership of the recipient's preferences.

## Submission and callbacks

`sendPlatformTransactionalEmail` reads the existing private `platform_email_suppression` table immediately before submission. `hard_bounce`, `complaint` and `provider_suppressed` block sending. `unsubscribe_link` and `one_click_unsubscribe` are marketing preferences and do not block requested transactional messages. Unknown reasons, failed lookups and mismatched results stop submission.

The helper rejects account tags and conflicting scope tags, normalizes and deduplicates To/Cc/Bcc addresses, rejects header injection and checks at most 100 recipients. Each lookup uses the exact normalized primary-key email, so row caps and wildcard characters cannot hide a blocked recipient. A block in any recipient stops the whole request. Supported provider request options are preserved. The shared contact/support fallback rechecks eligibility before its provider attempt.

Messages carry `delivery_scope=platform_transactional`. After signature verification and event recording, the Resend webhook writes their permanent bounces, complaints and provider suppression to platform storage. Failed persistence returns an error for provider retry. Existing reason-promotion rules prevent weaker events or marketing opt-outs from replacing a delivery block. Older untagged callbacks are not reclassified automatically.

Provider acceptance IDs are required before covered paths report success. Founder signup/messaging alerts retain their best-effort behavior but no longer log success after rejection. Operator digests do not count an email channel without acceptance. These records indicate submission acceptance, not inbox delivery.

The check and provider request are not atomic. A later suppression can race submission. Authentication links keep their configured host, destination validation and expiry; the final check occurs after token generation to observe a block recorded during that operation. The helper does not generate replacement links, retry automatically, or create a durable send identity.

## Dependencies and remaining evidence

The prerequisite is `20260914152829_platform_campaign_preferences.sql`, which created the private platform table and atomic persistence RPC. No new migration is needed for this pass. Deploying these paths without that prerequisite fails closed. Preserve the table and callback handlers when rolling back senders.

The table contains local recorded evidence. This change does not inventory provider regions/accounts, reconcile historical untagged failures, import a provider suppression list or certify credentials in the hosted environment. Do not claim provider-wide completeness. Separate operational scripts and future untagged sender kinds remain subject to their own audit. Durable identities, intentional resend/recovery and hosted receipt tests remain open for these families.

## Local verification

16 selected regression files / 196 tests passed. Tests cover the real login and report paths, support/contact sends, staff paths, To/Cc/Bcc lookups with the installed Supabase client, literal wildcard addresses, campaign-only opt-outs, failed lookups, missing acceptance, signed callback persistence and the final fallback recheck. Full application/test type checking and changed-file lint passed without warnings. Hosted database/provider receipt was not tested in this pass.

### Subsequent support auto-reply audit

The raw HTTP sender previously treated any completed HTTP response as success and resolved eligible tickets even without a recipient or provider key. It now uses `preparePlatformTransactionalEmail`, the same checked-payload preparation as the SDK wrapper. HTTP success and a nonempty provider ID are required before attempting resolution. Failed or missing sends leave the ticket for human review. Returned results separate `eligibleForAutoReply`, `replyDispatched`, `replyProviderId` and `autoResolved`; dry-run reports eligibility with no dispatch or resolution. A failed, thrown or zero-row resolution update retains acceptance in the result and audit, with an instruction to repair status without resending.

Local verification: 18 files / 224 tests passed; full application/test type checking passed, including 17 targeted support cases and existing platform/webhook/operator regressions. Lint has zero errors and two pre-existing unused-import warnings in the autopilot test. No production caller was found for this exported auto-responder. It has no durable send identity: reruns, concurrent execution and ambiguous timeouts are not deduplicated by this change. Do not enable automatic retries until that separate contract exists. Audit output is not a replacement for a durable acceptance ledger. No hosted changes or actual emails were performed.
