# Customer email handling and verification

Updated September 14, 2026. This incorporates the supplied T01–T15 list, the accepted T16–T20 additions, and corrections to T03, T06, T07, T12 and T13.

This checklist tracks work; an unchecked live acceptance item is not satisfied by unit tests. Keep dated evidence, commit/deployment, environment, outcome and remaining gaps beside each completed item. Historical receiver and canary evidence lives in the [domain go-live checklist](contractor-email-domain-go-live-checklist-2026-09-09.md) and [canary record](contractor-domains-canary-2026-09-09.md). Re-read those before sending another test email or restarting observation. Do not replace measured run dates with the original pasted list's estimated September 18 sign-off.

## First implementation pass

- [x] Correct suppression reason persistence; preserve the distinction between marketing opt-outs and provider delivery blocks (T12 subcheck; full send-path enforcement remains open).
- [x] Verify existing explicit-rejection/ambiguous-timeout fallback behavior and identify the remaining durable-send/idempotency gap (T06/T16 subcheck).
- [x] Repair the lifecycle dry-run runner, prove it does not send or advance history, and expose failed prerequisite reads (T03/T17 local subchecks).
- [x] Run the email regression suite and record results (T15).

## Second implementation pass

- [x] Add durable lifecycle claims shared by welcome, daily sweep and approved activation batches (T16 local subcheck).
- [x] Preserve exact retry payload/key, bound attempts and recover lost acceptance through signed callbacks (T16/T17/T19 local subchecks).
- [x] Verify concurrent workers and access restrictions in PostgreSQL; document evidence-based recovery and deployment order in the [lifecycle send runbook](runbooks/contractor-lifecycle-email-sends.md).
- [ ] Apply the migration and deploy through the approved release process; hosted/live acceptance remains open.
- [x] Extend durable intent protection to quote and invoice sends in the third local pass; T16 still has remaining rollout and other-path gates.

## Third implementation pass

- [x] Save quote/invoice send intents against database-managed document revisions; reuse exact links, content and PDF bytes on retries.
- [x] Save a separate fallback phase/key after an exact sender-domain rejection and resume that phase after a crash.
- [x] Require durable provider acceptance before reporting emailed invoices sent; guard status writes against concurrent invoice edits.
- [x] Make concurrent lead conversions choose one winner before downstream sends; avoid deleting a possibly committed conversion after a lost acknowledgement.
- [x] Test database concurrency, revision changes, suppression, callbacks and action behavior; add the [document email recovery runbook](runbooks/document-email-sends.md).
- [ ] Apply migrations and complete hosted acceptance under the existing rollout gates.

## Phase 1 — Canary and infrastructure

- [ ] **T01 — Observe seven consecutive clean scheduled canary runs.** Check `/admin/health` after the 06:23 UTC `email-domain-reconcile` run. Verify the expected active-domain count, zero errors, fresh `last_checked_at`, no false downgrade, and actual delivery/reply evidence. Retain run IDs and dates. The pasted Day 1/7 and earliest sign-off date are historical assumptions until reconciled with live evidence. Owner: Operations/Brett.
- [ ] **T02 — Provision and budget rollout capacity.** Verify live Resend domain inventory, pending/cleanup slots, daily/monthly send caps, and request-rate limits. Keep platform/test reserve and a bounded workspace cohort before expanding the allowlist. Record any selected plan, price and resulting quota; capacity budgeting alone cannot increase a provider cap. Owner: Operations/Brett.
- [ ] **T03 — Dry-run the contractor lifecycle sweep.** Review recipients, exact step IDs and subjects before the next 14:00 UTC run. The actual function signature is `runContractorLifecycleSweep(adminClient?, options?)`: use `runContractorLifecycleSweep(undefined, { dryRun: true })` in a runner that resolves TypeScript and the project's `@/` imports, or pass a test client. The pasted single-argument `node -e` example is not a validated runner. Prove zero provider sends and zero event/history writes; new accounts start at welcome. Recheck quote/payment setup, suspension and owner changes to prevent obsolete nudges. Owner: Engineering/Operations.

## Phase 2 — Received mail and presentation

- [ ] **T04 — Inspect received Gmail and Outlook authentication.** Use an approved internal recipient and real quote. Retain raw `.eml` showing business From, operational Reply-To, aligned DKIM and receiver SPF/DKIM/DMARC results. Record inbox/spam placement and tab as observations; Primary/Focused placement is not deterministic. Reuse valid existing evidence where its deployment and binding still apply.
- [ ] **T05 — Verify Outlook for Windows rendering.** Inspect the classic Word-rendering client as well as the supported modern client. Check invoice/quote rows and totals, CTA padding, brand contrast, and a usable mobile layout. Unit HTML assertions do not replace client screenshots.

## Phase 3 — Failure and recovery

- [ ] **T06 — Test confirmed sender-domain rejection fallback.** Retry exactly once from the platform sender only after a definitive rejection naming the attempted From domain. Preserve display name, Reply-To, content, links and attachments. Never change sender after acceptance, timeout, quota/rate limit, suppression or general provider errors. Verify keyed fallback requests have a deterministic identity distinct from the changed original payload.
- [ ] **T07 — Verify domain-loss notice and recovery.** Distinguish confirmed DNS loss from transient API/access errors; transient failures must not downgrade a verified domain. Confirm status/reason and one platform notice per failure episode linking to `/dashboard/settings#email-domain`. Test notice retries, restoration to verified and a later new failure episode. Preserve existing administrative holds.
- [ ] **T08 — Exercise large invoice PDF failure.** Generate 25+ line items and a custom logo. Inject PDF exception/timeout and verify HTML email remains usable without claiming an attachment is present; quote/payment links and totals remain correct.

## Phase 4 — Replies and settings

- [ ] **T09 — Verify actual inbound replies.** Reply from Gmail and Outlook, confirm the operational `accounts.reply_to_email` destination and receipt in that external inbox. Retain evidence without exposing customer correspondence.
- [ ] **T10 — Check alias guidance.** Explain Reply-To routing and recommend creating a `quotes@` alias with the contractor's existing mailbox provider for customers who manually copy From. Do not imply LGQ creates an inbox or that an alias is free without an existing supported mailbox plan.
- [ ] **T11 — Validate Reply-To input.** Reject malformed addresses, embedded whitespace, angle-bracket/header injection and CR/LF before saving; define trimming behavior for harmless surrounding whitespace. Confirm the displayed and sent address match.

## Phase 5 — Suppression and unsubscribe

- [ ] **T12 — Separate marketing opt-outs from delivery blocks.** An `unsubscribe_link` or `one_click_unsubscribe` blocks marketing/review/rebook sends for the relevant workspace but leaves transactional mail eligible. Hard bounce, complaint and provider suppression are delivery blocks, not marketing preferences: do not promise transactional delivery or bypass them using platform fallback. Preserve/escalate delivery reasons even if a marketing opt-out already exists; a later opt-out must not downgrade a delivery block. Audit all send paths and provider-region scope before claiming full application enforcement. Test transient/undetermined bounce behavior and failed suppression lookups/writes.
- [ ] **T13 — Verify RFC 8058 directly.** Check HTTPS `List-Unsubscribe` plus `List-Unsubscribe-Post: List-Unsubscribe=One-Click` and DKIM coverage of both headers in received mail. POST without login, cookies or confirmation; signed token selects only the intended workspace/recipient. Test repeated POST, tampering and persistence failure. GET/link scanning must not unsubscribe. Gmail's native button is optional observational evidence, because Google decides eligibility.
- [ ] **T14 — Verify signed delivery webhooks.** Exercise permanent/transient bounces, complaints, suppression, delivery and provider failure. Verify signature validation, expected durable event/suppression writes and retryable failures. Extend with T19 replay/order/isolation checks. Use local signed fixtures first; live replay remains separate acceptance.

## Phase 6 — Automated verification

- [x] **T15 — Execute email regressions and typecheck (local September 14 pass).** Ran the original engine, fallback, domain verification, suppression, compliance, theme contrast and reconciler suites, plus lifecycle safety, unsubscribe, webhook and affected admin/worker suites. Final typecheck and changed-file lint passed; counts are below. This completes the local verification of this pass, not deployed/live acceptance or future changes.

## Phase 7 — Added pre-rollout checks

- [ ] **T16 — Prevent duplicate sends.** Test double-click Send, overlapping cron runs, crash/restart, and timeout after provider acceptance. Persist intent and final provider message ID, with an atomic claim or equivalent concurrency control. Provider idempotency is supplementary and expires after 24 hours; do not treat it as a permanent send ledger. Same-request retries reuse identity and payload; changing From for a definitively rejected request uses a stable fallback identity. Recovery after the provider window must reconcile uncertain outcomes before resending. Owner: Engineering.
- [ ] **T17 — Handle outages and quota exhaustion.** Simulate 429, daily/monthly quota exhaustion, timeout and 5xx. Preserve pending work with bounded retries and an actionable terminal/uncertain state. Safe manual retry must not duplicate accepted sends. Reserve transactional capacity from marketing traffic. Treat prerequisite account/history/suppression lookup failure as an error, not a clean zero-candidate run. Platform-sender fallback cannot solve an outage of the same provider. Owner: Engineering/Operations.
- [ ] **T18 — Verify tenant isolation and customer links.** Workspace A cannot use B's sending domain, branding, recipients, PDFs or documents. Exercise logged-out customer links plus tampered, expired and revoked tokens. GET previews/scanners cannot approve quotes, make payments or trigger other consequential actions. Record exact routes and fixtures tested. Owner: Engineering.
- [ ] **T19 — Track delivery and replay safely.** Distinguish queued, provider-accepted, delivered, delayed, bounced, complained, failed and suppressed. Replay duplicate/out-of-order signed events and concurrent updates; older events cannot overwrite terminal state or change tenant identity. Reject invalid signatures without delivery mutations. Retain unrouteable-event evidence, and acknowledge only after required durable writes succeed. Confirm the UI never calls provider acceptance delivery. Owner: Engineering.
- [ ] **T20 — Define and rehearse rollout stop conditions.** Name responder and backup, initial workspace IDs, capacity budget, review time and escalation thresholds. Pause enrollment for any cross-tenant identity leak, failed authentication, unexplained lost/duplicate message, inability to suspend or exhausted quota; investigate every complaint/material failure during the canary. Verify enrollment pause and actual send hold separately, including effects on transactional mail. Alert on missed/stale cron runs and failed owner notices. Rehearse recovery before increasing cohort. Coordinate with existing go-live I04/J04/J05; do not create a second conflicting rollout policy. Owner: Brett/Operations.

## References

- [Resend suppression behavior](https://resend.com/docs/knowledge-base/why-are-my-emails-landing-on-the-suppression-list)
- [Resend idempotency: 24-hour window and changed-payload conflicts](https://resend.com/docs/dashboard/emails/idempotency-keys)
- [Google unsubscribe eligibility](https://support.google.com/mail/answer/14229414?hl=en-GB)
- [RFC 8058](https://www.rfc-editor.org/info/rfc8058/)

## Execution evidence

September 14: implementation started from `a773f17a8` in `codex/customer-email-checks-20260914`. No new live email, provider purchase, DNS mutation, rollout expansion or deployment has been performed in this pass.

### Completed local changes

- **T12:** Suppression writes now promote an existing marketing opt-out to provider suppression, permanent bounce or complaint. Conditional account/email/reason filters prevent weaker replays from downgrading a stronger reason. The concurrent-insert recovery path also promotes; failed promotion stays retryable. This does not backfill historical lost reasons or add a universal transactional suppression gate. Transactional delivery still relies on Resend's suppression enforcement.
- **T03/T17:** Account and owner lookup failures now fail the sweep visibly. A null or potentially truncated (1,000-row) suppression result stops the lifecycle sweep and approved activation batch. This conservative guard needs pagination before operating beyond that bound.
- **T03/T19:** Dry-runs now return `planned` and `dryRun`, keep `sent = 0`, and label preview rows `planned`. Both sweep and activation batch use the same reporting distinction. Existing actual-send counters remain unchanged.
- **T03:** `node scripts/dry-run-contractor-lifecycle.mjs` now compiles the actual application sweep with TypeScript aliases. The runner disables the email provider, ambient admin client and audit writer; its supplied Supabase transport permits only the five reviewed table reads (including the new lifecycle ledger) and owner-email lookup RPC, and refuses redirects. It requires explicitly supplied environment credentials and does not read `.env` automatically. Local integration tests run the compiled sweep through the installed Supabase client against synthetic responses, with no external requests.
- **T06:** All 10 existing fallback tests pass, covering accepted messages, exact domain rejection, other-domain rejection, rate limits, access errors, thrown timeouts, platform identity and single fallback. No fallback implementation change was needed.

### First-pass verification

- Before changes, the added suppression/lifecycle regression cases reproduced **11 failures** in the focused suite.
- Email and affected admin/worker regression selection: **35 files, 373 tests passed**. One further real-Supabase-client query-construction test was added afterward; the affected two files then passed **23 tests**, including that new test (374 distinct regression tests in total).
- Standalone dry-run transport and compiled-sweep integration: **2 tests passed** using `node --test scripts/dry-run-contractor-lifecycle.test.mjs`.
- Changed-file lint: passed with **zero warnings/errors**. Whitespace/diff check: passed.
- Full app/test typecheck: **passed**, including a final incremental check after the added query-construction test and final edits (`node --max-old-space-size=4096 node_modules/typescript/bin/tsc --noEmit -p tsconfig.test.json`).

### Second-pass verification and scope

- **T16:** Added `contractor_lifecycle_sends`, atomic per-account claims, persisted payload/key/provider scope, lease fencing and durable provider acceptance. Welcome, lifecycle sweep and activation batches share the mechanism. Missing best-effort activity writes cannot erase the new acceptance history. Quote/invoice paths remain open.
- **T17:** Retries use the original snapshot and identity, with five-minute backoff, three attempts maximum and a fixed 23-hour window. Uncertain expired sends require evidence-based closeout. This does not add an automatic retry worker or capacity reservation; a daily rerun can miss the retry window.
- **T19:** Signed callbacks correlate the exact intent/workspace/recipient/provider ID and recover lost acceptance without sending again. Acceptance is not delivery. Broader event-order/UI tracking remains open.
- **Verification:** 36 regression files / **392 tests passed**, plus **2 standalone dry-run tests** and **14 actual PostgreSQL 17 checks**. Full app/test typecheck, changed-file lint and schema-order check passed. Supabase security advisor reported no issues against the disposable local database; hosted advisors were not run.
- Migration prepared at `migrations/20260914133327_contractor_lifecycle_send_ledger.sql`; mirrored in `schema.sql`. Neither hosted migration nor deployment performed. Deployment sequencing, historical reconciliation and recovery are in the [runbook](runbooks/contractor-lifecycle-email-sends.md). CI now includes the database and standalone preview checks.

### Third-pass verification and scope

- **T16:** Added a private `document_email_sends` ledger shared by all three customer quote-email call sites and the invoice sender. Database-managed job/invoice revisions distinguish actual edits from duplicate submissions. The first intent saves exact recipient/content/links and base64 PDF bytes; retries use the saved message. Existing accepted records stay authoritative beyond provider-key expiry.
- **T06/T16:** Exact domain rejection now saves a separate fallback payload, phase and key before sending. A resumed attempt uses that phase; it never switches sender after an ambiguous timeout or general provider error. Fallback rechecks document/recipient eligibility and local delivery blocks.
- **T12:** Quote/invoice claims now enforce hard-bounce, complaint and provider-suppressed reasons locally while keeping marketing opt-outs eligible for transactional mail. Other transactional paths and historical reason reconciliation remain open.
- **T19:** Signed quote/invoice callbacks reconcile exact intent/workspace/recipient/provider/phase. Deleted-document callbacks are durably quarantined for review and still apply relevant suppression. Invoice status updates require confirmed acceptance and the same invoice revision. Repeated accepted sends avoid duplicate owner receipts/feed rows. Acceptance still does not mean delivery.
- **T16:** Concurrent lead conversions condition the winning update on `converted_job IS NULL`; the loser stops before downstream sends. An uncertain write response no longer deletes a possibly committed job. This does not make the entire conversion/payment workflow atomic or deduplicate separately created documents.
- **Verification:** 52 selected regression files / **629 tests passed**, followed by **18 passing webhook tests** after adding the deleted-document case (**630 distinct tests**). **14 actual PostgreSQL 17 checks passed**, and the local Supabase security advisor reported no issues. Full app/test typecheck passed, including the final incremental check after callback changes. Lint: zero errors, six unchanged warnings verified against the previous commit. Schema-order and diff checks passed.
- Migration prepared at `migrations/20260914135714_document_email_send_ledger.sql`, mirrored in `schema.sql`, with `test:pg17:document-email` added to CI. No hosted migration, deployment or real email occurred. See the [document email runbook](runbooks/document-email-sends.md) for release order, privacy, recovery and remaining scope.

### Fourth-pass verification and scope

- **T12:** Added a final account-scoped suppression check to the shared sender, including To/Cc/Bcc and each fallback attempt. Delivery reasons block transactional mail; marketing opt-outs block shared campaign/review/rebook mail. Failed reads stop submission. Null or capped marketing suppression lists now fail closed. The check is not atomic with the provider request; independent and untagged transports, provider-region scope and historical reason reconciliation remain open.
- **T17/T19/T20:** Added a private read-only recovery queue for lifecycle/document sends and integrated it with the existing operational scanner. It identifies uncertain, expired, exhausted, interrupted and overdue sends, avoids repeat alerts for unchanged findings, and preserves findings when source reads fail. It does not retry customer mail.
- **T19:** Added an admin health recovery panel with workspace/reference links, fallback phase and fixed UTC cutoff. Unavailable checks are visibly separate from an empty queue; acceptance is explicitly distinguished from delivery. Failed and provider-suppressed events now appear in recent email failures with consistent totals. Operator summaries distinguish these statuses and no longer claim a 100% inbox rate from an empty failure sample.
- **T12/T16:** Recorded the remaining shared and independent transports in the [delivery audit and recovery runbook](runbooks/email-delivery-audit-and-recovery-monitoring.md), including owner notifications, authentication, merchandise, platform campaigns, public reports and theme tests.
- **Verification:** Final selection: **45 regression files / 510 tests passed**. **14 actual PostgreSQL 17 checks passed** with no local security-advisor issues. Full app/test typecheck passed; lint has zero errors and three unchanged warnings verified against the previous commit. Isolated browser preview checked the actual component's populated, empty and unavailable states.
- Migration prepared at `migrations/20260914142641_email_send_recovery_monitoring.sql`, mirrored in `schema.sql`; operational database checks added to CI. No hosted migration, deployment or customer email performed.

### Fifth-pass implementation — automatic recovery

- **T16/T17:** Added an opt-in, cohort-limited recovery worker for the existing lifecycle/document ledgers, with a shared run lease, bounded sequential processing, saved-payload execution, provider pacing, Retry-After handling and terminal/uncertain outcomes. Confirmed quota/access problems hold recovery instead of repeatedly spending retry attempts.
- **T12/T18:** Recheck account, recipient, suppression, source revisions and lease/window eligibility immediately before each provider request, including saved fallback. Changed or expired work cannot mint another send identity.
- **T19:** Repair an accepted, unchanged draft invoice's status without resending; preserve paid/void and edited invoices. Preview reads only due-work metadata and makes no provider, ledger or heartbeat writes.
- **Verification:** 46 selected regression files / 491 tests passed, followed by 18 passing focused tests including one new fallback case (492 distinct regressions). Both standalone dry-run tests and 22 PostgreSQL 17 checks passed. Disposable local security advisor reported no issues. Full app/test typecheck and changed-file lint passed. See the [worker runbook](runbooks/email-recovery-worker.md).
- Migration `20260914150046_email_recovery_worker.sql` and a five-minute schedule are prepared locally. Environment and database defaults disable sending; an explicit cohort is required. No hosted migration, deployment, enablement or real email was performed.

### Sixth-pass implementation — independent workspace senders

- **T12/T19:** Added final delivery-block checks for account-specific crew invitations, signed-in theme tests and customer merchandise receipts. The helper binds the authoritative workspace and rejects conflicting tags. Marketing-only opt-outs still allow transactional messages.
- **T18:** Failed or missing crew account lookups stop token creation. A delivery block recorded during token generation stops submission; callback and expiry behavior stay intact.
- **T19:** Crew/theme and customer/staff merchandise paths require a provider acceptance ID before reporting success. Provider rejection or missing acceptance is not a successful send.
- **Verification:** 10 selected regression files / 182 tests passed. Full app/test typecheck passed; lint has zero errors and four pre-existing test warnings. No hosted changes or real email. Platform login, founder/operator/staff mail, public reports and platform campaigns still require their appropriate policy; durable identities remain separate work.

### Seventh-pass implementation — complete shared suppression reads

- **T12/T19:** Shared campaign/rebook audience checks now read suppression records in ordered UUID pages until an empty page, including when the API returns fewer than the requested 500 rows. Errors, malformed/repeated data and the 200-query limit fail closed; no partial set is returned.
- **Verification:** 10 selected files / 90 tests passed, including 11 query-contract cases using the installed Supabase client and local HTTP fixtures. These cover 1,201 records, lower API caps, tenant isolation, concurrent deletion and later-page failures. Full app/test typecheck passed; lint has zero errors and four pre-existing test warnings. No hosted changes or real email.
- **Remaining:** Independent lifecycle/platform scans are still open. Platform campaigns also require separate opt-out persistence and consistent footer/header scope: the existing literal `platform` cannot fit the workspace UUID foreign key. Their cross-workspace union of suppression addresses needs correction with the final per-recipient policy.

### Eighth-pass implementation — platform campaign preferences

- **T12/T13/T14:** Added private platform preference storage and atomic reason promotion. Platform campaigns, custom lists and test emails use exact recipient/workspace checks at audience selection and immediately before submission. Preferences are no longer unioned across unrelated workspaces.
- **T18/T19:** HTML/text/header unsubscribe tokens now agree. Existing signed `platform`/`test-preview` links persist correctly; workspace links keep their original scope. The public page reads the appropriate storage and verifies persisted status before showing completion. GET requests remain read-only. Signed platform delivery callbacks retain delivery blocks and retry failed persistence.
- **Verification:** 16 selected files / 236 tests and 26 disposable PostgreSQL 17 checks passed. Local security advisor reported no issues. Full app/test typecheck passed; lint has zero errors and three pre-existing test warnings. See the [platform campaign policy](runbooks/platform-campaign-email-policy.md). Migration `20260914152829_platform_campaign_preferences.sql` must precede deploying these paths; no hosted changes or real email were performed.
- **Remaining:** Other platform senders, lifecycle suppression scans, provider-region/history reconciliation, durable platform send identities and hosted acceptance remain open.

### Ninth-pass implementation — bounded lifecycle suppression checks

- **T12/T19:** Lifecycle sweep and approved activation batches now check only intended workspace/address pairs, in batches of 100 with a 500-unique-recipient limit. Unrelated suppression rows no longer stop a batch at the REST response cap. Mixed-case records and literal wildcard characters match correctly; incomplete/mismatched results stop the batch.
- **T03/T18:** Standalone preview permits the new private read-only RPC while retaining its ban on sends and writes. The durable send ledger's final checks remain unchanged.
- **Verification:** 10 selected files / 155 tests, two standalone dry-run tests and 29 disposable PostgreSQL 17 checks passed. Local security advisor found no issues. Full app/test typecheck passed; lint has zero errors and three pre-existing test warnings. Migration `20260914155952_lifecycle_recipient_suppression.sql` must precede the updated application/preview. No hosted changes or emails performed.
- **Remaining:** Platform login, founder/staff alerts, digests, support and public reports still need their appropriate delivery-block policy and provider-scope evidence. Campaign opt-outs are not transactional blocks. Other audience/quote/history caps and provider capacity remain separate from this suppression fix.

### Tenth-pass implementation — platform transactional senders

- **T12/T18:** Added a platform delivery-block gate for owner/crew self-login, requested reports, founder/staff alerts, operator digests, merchandise staff notices and shared contact/support messages. Campaign-only opt-outs remain eligible; exact To/Cc/Bcc lookups and fallback rechecks fail closed on uncertainty.
- **T19:** Explicit callback scope retains newly observed platform delivery blocks and retries failed persistence. Covered success paths require provider acceptance; missing provider configuration no longer reports a report as dispatched. Authentication token destination and expiry behavior remain intact.
- **Verification:** 16 selected files / 196 tests passed; full application/test type checking and changed-file lint passed without warnings. See the [platform transactional policy](runbooks/platform-transactional-email-policy.md). This uses the existing platform preference migration; no hosted changes or emails were performed.
- **Remaining:** Provider inventory/history reconciliation, external sender audit, durable identities and hosted acceptance remain open.

### Eleventh-pass implementation — support auto-reply audit

- **T12/T18/T19:** Found and repaired the direct HTTP support sender omitted by the earlier SDK inventory. It uses platform delivery blocks and callback scope, preserves its timeout, rejects redirects and requires provider acceptance before ticket resolution. Failed status persistence retains acceptance for review; dry-run reports eligibility only.
- **Verification:** 18 files / 224 tests passed; full application/test type checking passed. Changed-file lint has zero errors and two existing unused-import warnings. The sender inventory now includes the independent seed script and its unresolved policy/evidence gaps. No production caller was found for the support auto-responder; no live sending was enabled.
- **Remaining:** Durable support reply identity, uncertain acceptance recovery, seed-script guards, provider inventory/history and hosted acceptance. See the [platform transactional policy](runbooks/platform-transactional-email-policy.md).

### Twelfth-pass implementation — controlled seed runner

- **T12/T18/T19:** Replaced default live sending and assumed seed recipients with offline preview, explicit bounded targets and a live allowlist guard. Each submission uses the shared platform delivery check and scoped callback tag. Partial acceptance IDs survive later failures; uncertain outcomes stop further submissions without retry.
- **T02/T19:** Removed unverified authentication PASS claims and fake dry-run provider IDs. Samples identify nonfunctional links; inbox/authentication/reply/PDF receiver evidence remains explicitly unverified.
- **Verification:** 19 offline runner tests passed, including actual templates/PDF, CLI guards, installed-client suppression queries and provider failure fixtures. Changed-script lint passed. The test command is included in CI. No live emails or hosted changes occurred. See the [seed runner runbook](runbooks/deliverability-seed-runner.md).
- **Remaining:** Provider scope/history, external transport review, capacity, durable identities and hosted acceptance.

### Thirteenth-pass implementation — maintained sender registry

- **T12/T18/T19:** Added a reviewed machine-readable registry for 21 transport/helper files, with purpose, recipient scope, delivery policy and remaining evidence. CI now detects added, removed or changed transport markers and missing policy descriptions; comments and formatting do not masquerade as transport changes.
- **Verification:** 10 offline checker tests passed; all reviewed file signatures match; changed-script lint passed. Scan limits are documented. No hosted queries, credentials, live sends or deployment were involved.
- **Remaining:** Optional account-tag callers, independent operational-alert policy, indirect/external transports, provider workspace/region/history and durable identities remain open. See the [registry runbook](runbooks/email-sender-registry.md).

### Fourteenth-pass implementation — required workspace scope

- **T12/T18:** Reviewed the production callers of eleven formerly optional shared senders; all already pass an account. Their contracts now require it. Tenant tag creation rejects missing/altered IDs, and the shared transport refuses unscoped submissions except the three explicitly gated platform support/contact kinds.
- **Verification:** 17 files / 348 tests and full application/test type checking passed, including 23 new cases across the real sender functions. Changed-file lint and the sender-registry check passed. See the [workspace caller review](runbooks/shared-email-workspace-scope.md). No live sends or hosted changes occurred.
- **Remaining:** Independent operations-recipient policy, indirect/external transport review, durable identities, provider evidence and hosted acceptance.

### Fifteenth-pass implementation — operational recipient policy

- **T12/T18/T19:** Queued alerts now verify the saved single recipient and exact platform delivery status before submission. Blocks/mismatches move to review; unavailable checks defer without sending. Existing payloads, keys and recovery protections are preserved.
- **T20:** Emergency outage/recovery remains explicitly database-independent. Invalid recipient configuration and missing provider acceptance cannot report success; redirects are rejected. This exception is not platform-table coverage.
- **Verification:** 4 files / 57 tests, full type checking and registry checks passed. Lint has zero errors and two existing warnings. No live sends, migration or hosted changes. See the [operations policy](runbooks/operational-email-recipient-policy.md).
- **Remaining:** Operational callback/history reconciliation, provider scope/capacity, external transports, independent responder receipt and durable remaining email families.

### Sixteenth-pass implementation — bound operational callbacks

- **T12/T18/T19:** Signed, otherwise unscoped callback failures now use the unique operational ledger provider ID plus exact saved single recipient to establish platform scope. Valid complaints, suppressions and permanent bounces persist delivery blocks. Mismatches, unavailable reads and failed writes remain errors; tenant or extra-recipient payloads cannot be reassigned.
- **Verification:** 4 files / 97 tests passed, including 13 new signed-callback cases; full type checking and changed-file lint passed. No schema, saved-message/key or live changes occurred.
- **Remaining:** Early callbacks before acceptance bookkeeping, emergency messages without ledger rows, historical/provider evidence and hosted acceptance. See the [operational callback policy](runbooks/operational-email-recipient-policy.md).

### Seventeenth-pass implementation — early callback reconciliation

- **T12/T18/T19:** Added private durable negative evidence and database reconciliation in both arrival directions. Early permanent bounces/complaints/provider suppressions now establish a block once the exact operational provider ID and saved recipient are known. Concurrent arrival, stronger reason provenance and failed-write recovery are covered without changing payloads or retry keys.
- **Verification:** 100 selected application tests, full type checking and 35 actual PostgreSQL 17 checks passed; the local security advisor found no issues. Changed-file lint and registry checks passed. Migration `20260914164359_operational_callback_evidence.sql` is prepared locally only; no emails or hosted changes occurred.
- **Remaining:** Unknown/unrecovered IDs, emergency messages without ledgers, historical evidence, storage retention review and hosted acceptance. See the [durable evidence runbook](runbooks/operational-callback-evidence.md).

### Eighteenth-pass implementation — read-only evidence review

- **T12/T19/T20:** Added a bounded report for retained callback evidence: unmatched provider IDs, recipient-binding conflicts and missing/weaker/present blocks. Explicit host matching and GET-only table restrictions prevent writes, RPCs and provider calls. Output omits recipient addresses and message bodies.
- **Verification:** 16 offline tests with the installed Supabase client passed, including lower API caps, partial-read failures, privacy and request restrictions. Changed-script lint and registry checks passed; CI includes the report tests. No hosted report or email was run.
- **Remaining:** Collect/review actual environment evidence, resolve unknown IDs through supported paths, approve retention rules and continue durable identities. See the [review runbook](runbooks/operational-callback-evidence-review.md).

### Nineteenth-pass implementation — domain failure submission identity

- **T16/T17:** The domain failure sender now requires its existing durable incident UUID, sends a stable provider key and includes the incident ID with its workspace tag. Invalid identities fail before submission; a separate failure episode receives a different key even on the same domain. Uncertain sends still require manual review and are never automatically rearmed.
- **Verification:** 50 selected application tests and 10 registry tests passed, including an offline request-boundary check using the installed SDK; type checking and changed-file lint passed. No migration, hosted change or email was run.
- **Remaining:** Save immutable message snapshots and provider scope, reconcile signed callbacks with acceptance, and define bounded recovery before enabling retries. Domain restoration and other owner notice families remain open. The provider key alone does not establish permanent deduplication or delivery.

### Twentieth-pass implementation — immutable domain failure snapshots

- **T16/T17:** Added private saved messages tied to existing failure incidents and the actual sending credential fingerprint. Only one current, exact-workspace preparation wins; duplicate preparation, stale claims, changed domain eligibility and altered payload bindings cannot authorize submission. Failed saves stop sending, and recipient blocks are checked again after saving.
- **Verification:** 60 selected application and data-disposition tests and 24 PostgreSQL checks passed; the local security advisor found no issues. Type checking, changed-file lint and 10 sender-registry tests passed. Added the database checks to CI and recorded snapshot cleanup in the data-disposition registry. The migration is prepared locally only.
- **Remaining:** Signed callback acceptance repair, verified provider workspace/region, retention approval and bounded recovery. No retries, live emails, deployment or hosted migration were enabled. See the [notice runbook](runbooks/email-domain-failure-notices.md).

### Twenty-first-pass implementation — signed domain notice recovery

- **T16/T17/T19:** Signed callbacks now bind to the saved notice/workspace/recipient before delivery history or suppression changes. They repair lost acceptance without resending, preserve stronger negative outcomes and cannot be overwritten by delayed worker completion. Missing or unprepared notice callbacks are retained for review; failed quarantine writes remain retryable.
- **Verification:** [Dated local evidence](evidence/customer-email-domain-callbacks-2026-09-14.md): 75 application tests and 33 PostgreSQL checks passed, including callback/worker races, provider-ID conflicts, out-of-order evidence, private grants and operator closeout preservation. Type checking, changed-file lint and 10 sender-registry tests passed; the local security advisor found no issues.
- **Prelaunch tracking:** Updated [the official prelaunch list](../LAUNCH_CHECKLIST.md) with this local evidence and explicit open deployment, hosted acceptance, provider scope/capacity, retention, remaining-family and canary gates. No live changes or new canary evidence were collected.

### Next work and live gates (updated)

Execution order, acceptance criteria and milestone dependencies are in the [implementation and rollout plan](customer-email-implementation-plan-2026-09-14.md). The initial recovery worker is implemented locally; continue with the remaining independent sender policies and capacity verification.

1. **T16/T17:** Deploy and verify the prepared lifecycle and quote/invoice ledgers, recovery monitor and opt-in worker after reconciling uncertain historical sends. Verify hosted capacity and bounded recovery before enabling the cohort. Add durable identities for the remaining audited email families/owner notifications. Explicit unchanged-document resends and atomic creation/payment remain separate work. Migrations must precede enabling the new senders.
2. **T12/T19:** Extend delivery-block enforcement to independent and untagged transports using the appropriate recipient scope; verify provider-region scope and reconcile historical evidence before claiming application-wide enforcement.
3. **T03:** Run the repaired read-only runner in the intended hosted environment after review of environment identity. No live recipient preview has been fetched in this pass.
4. **T01:** The repository canary record, last updated September 11, says Day 1 started September 11. Current scheduled runs were not re-read here; resolve the pasted list's differing date using actual retained run evidence. Keep enrollment closed until all live gates pass.
5. **T02/T04/T05/T07–T11/T13/T14/T18/T20:** Retain or collect the required live capacity, receiver, recovery, tenant and operational evidence. Local green tests do not complete those gates.
