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

### Next work and live gates

1. **T16/T17:** Deploy and verify the prepared lifecycle and quote/invoice ledgers and recovery monitor after reconciling uncertain historical sends. Implement bounded retry scheduling and durable identities for the remaining audited email families/owner notifications. Explicit unchanged-document resends and atomic creation/payment remain separate work. Migrations must precede enabling the new senders.
2. **T12/T19:** Extend delivery-block enforcement to independent and untagged transports using the appropriate recipient scope; verify provider-region scope and reconcile historical evidence before claiming application-wide enforcement.
3. **T03:** Run the repaired read-only runner in the intended hosted environment after review of environment identity. No live recipient preview has been fetched in this pass.
4. **T01:** The repository canary record, last updated September 11, says Day 1 started September 11. Current scheduled runs were not re-read here; resolve the pasted list's differing date using actual retained run evidence. Keep enrollment closed until all live gates pass.
5. **T02/T04/T05/T07–T11/T13/T14/T18/T20:** Retain or collect the required live capacity, receiver, recovery, tenant and operational evidence. Local green tests do not complete those gates.
