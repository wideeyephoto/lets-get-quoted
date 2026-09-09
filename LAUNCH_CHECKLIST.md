# Official Pre-Launch & Go-Live Checklist — Let's Get Quoted

This is the definitive production deployment and launch checklist. A checked item requires dated command output or external-system evidence. A completed audit may be checked even when it found defects; every failed requirement remains separately unchecked. Configuration presence alone is not runtime proof.

## Live payments and refunds — verified September 9, 2026

**Current result: live LGQ refund engine verified; paid add-on production acceptance remains open.** The [verification report](docs/prelaunch-payments-verification-2026-09-09.md) and [provider evidence](docs/evidence/live-connected-refund-2026-09-09.json) supersede older claims below that LGQ has never issued a live refund.

- [x] **Prove a live charge refunded through the LGQ engine, including both reversals.** Re-read the September 7 $1.00 partial refund of a $150.00 payment. Stripe's live request used LGQ's exact idempotency key, `reverse_transfer=true` and `refund_application_fee=true`; the refund succeeded. The linked transfer shows $1.00 reversed and the application fee shows $0.01 refunded from $0.75. Production payment, admin audit and current LGQ page reconcile. Exact identifiers are retained privately. This was a programmatic LGQ rehearsal; a new dashboard-click or full refund was not executed.
- [x] **Finish the local six-SKU unpaid, ordering and refund-recovery matrix.** Corrected grants on unpaid/no-payment-required provider sessions; 12 new cases failed before the fix. All 24 six-SKU negative cases now pass. PostgreSQL: 43/43, including all six reversals, future-minute debt, expired claims, mode isolation and denied browser access. Paid Voice now grants against its verified invoice even when a base-plan allowance exists; refunds cannot debit another period's lot. These are local/database checks; prior real sandbox lifecycle evidence remains separately recorded.
- [x] **Prepare current-source add-on refund and renewal-date fixes.** Integrated the pending PR #33 refund implementation and Stripe item-period correction. Preserved operational-alert scheduling, added the gated refund/debt explanation and removed the unverified paid claim on checkout return. Full suite: 14,392 tests / 1,121 files; typecheck, lint and build passed. The first release commit is published in PR #56; the additional paid Voice fix is committed locally. This code is not yet production acceptance.
- [ ] **Release and verify paid add-on refund handling in production.** The refund ledger migration is installed and its four tables deny browser-role access. The added paid Voice migration, production application release, refund-event configuration and worker activation remain pending. Follow the documented order and verify the actual deployed revision and processing before claiming acceptance.
- [ ] **Execute the remaining live paid add-on journeys.** The user approved the designated payer, existing Flex/Solo/Growth workspaces and a $248 total cap. Spent: $0. A $35 minute-pack checkout is prepared but unpaid. Reconcile real purchases, usable benefits, partial/full refunds and cancellation; verify natural renewal and effective cancellation when their actual periods elapse. Additional renewal charges require spending authorization. Sandbox and local checks do not close this item.

## Security and recovery — 2026-09-09

- [x] **Replace the three documented exposed credentials:** replacement Resend/Supabase/cron credentials configured in Vercel, GitHub and matching local consumers; production rebuilt and checked. Exposed Resend key removed; old Supabase service JWT denied as both API key and bearer JWT; legacy anon denied; old cron secret denied privileged diagnostics. See [dated evidence](docs/runbooks/security-recovery-2026-09-09.md).
- [x] **Implement and stage-test native admin passkeys:** session-bound WebAuthn grants, TOTP recovery, origin/signature/replay checks and private credential storage implemented. All 22 real staging protocol checks passed; production schema and privileges verified. This is not native-device production acceptance.
- [x] **Release the native passkey implementation and prompt recovery:** PRs [#59](https://github.com/wideeyephoto/lets-get-quoted/pull/59) and [#63](https://github.com/wideeyephoto/lets-get-quoted/pull/63) merged after passing CI. Production exposes native controls, visible waiting/cancellation and a 60-second timeout; canonical app health passed after release.
- [ ] **Finish production native passkey acceptance:** owner enrollment remains incomplete after the hidden Dashlane prompt. Verify enrollment, a fresh-session native assertion, backup method, cancelled-prompt denial and recovery on the canonical app origin. The authenticator backup is enrolled; do not substitute protocol fixtures for native-device acceptance.
- [x] **Restore the downloaded offsite pack in isolation:** 260 row counts, 258 table/grant definitions, 272 policies, 435 functions/grants, existing-owner RLS and all 38 local object hashes passed. Plaintext temporary data removed. See [restore evidence](docs/runbooks/evidence/dr-downloaded-local-restore-2026-09-09.json).
- [x] **Restore the downloaded pack into hosted staging:** owner-approved replacement completed after an encrypted safety capture. All 260 row counts, 258 table/grant definitions, 272 policies, 435 functions/grants, 38 hosted object hashes and 35 real RLS tests passed. Existing restored-user Auth passed. See [hosted recovery](docs/runbooks/infrastructure-provider-recovery-2026-09-09.md).
- [x] **Reconstruct protected application hosting:** independently recovered source installed, built and deployed as `lgq-recovery-20260909`. All deployments require Vercel login; anonymous probes are denied; crons are disabled and outbound provider credentials are placeholders. Dashboard/jobs/clients/schedule render restored data after adding the adapter required by the concurrent staging permission changes. See [deployment evidence](docs/runbooks/evidence/dr-reconstructed-hosting-app-2026-09-09.json).
- [x] **Document infrastructure/provider recovery and verify independent source/DNS copies:** environment-name recovery inventory, 15-record authoritative DNS export, two independent migration/schema backups, provider-by-provider recovery paths, Stripe conflict rules and pre-cutover worker pause procedure recorded. These are procedures and bounded verification, not completed provider-account recovery.
- [ ] **Complete remaining recovery acceptance:** independently retrieve the Dashlane recovery key; verify original-key/live-configuration recovery; reconcile the Stripe snapshot gap (available live key lacks `event_read`); rehearse provider-owner-account loss and actual DNS cutover. Full-disaster RTO remains unproved. See [remaining acceptance and timings](docs/runbooks/infrastructure-provider-recovery-2026-09-09.md).

## Command Center & Operational Telemetry Honesty — 2026-09-09

**Completed:** Verification against `docs/admin-command-center-task-list-2026-09-09.md` across Waves 0–6.

- [x] **Wave 1: Zero-risk correctness & telemetry honesty (T5–T8):**
  - **T5:** Hoisted `requireAdmin()` and MFA checks before `cronJob(jobSlug)` lookup in `runCronJobNowAction`; unauthenticated requests redirect rather than revealing slug validity (`test/admin-actions-auth-guard.test.ts` 21/21 passed).
  - **T6:** Nullified fabricated SLA numbers (`uptime24hPct: null`, `uptime7dPct: null`, `uptime30dPct: null`) in `src/lib/uptime-monitoring.ts` until persistent probe storage is implemented. Updated `/admin/health` subtitle to "Synthetic probes evaluated on page render" and display unmeasured SLA as `"—"`.
  - **T7:** Introduced `SubsystemStatus = 'configured'` for the six static environment-check subsystems (`quoting-engine`, `stripe-payments`, `sms-gateway`, `voice-webhook`, `email-resend`, `contractor-cdn`). Mapped to neutral badge; does not artificially degrade or claim false active synthetic probe status.
  - **T8:** Hardened gate in `test/service-health-telemetry.test.ts` asserting that any subsystem returning `operational` must provide an active numeric `latencyMs` probe. Proven to bite by temporarily flipping static check to `operational` with `null` latency and asserting test failure.
- [x] **Wave 2: Observability cluster resolution (T10–T12):**
  - **T10 & T11:** Removed unbuffered module-level APM request tiles, slowest routes, and unbacked exceptions table from `/admin/health` to eliminate empty/unmeasured serverless artifacts.
  - **T12:** Wired `dispatchOnCallPage` to real operational triggers (`logIncidentAction` for critical and high severity platform incidents). Implemented 15-minute deduplication and debounce keyed on `incidentKey` (`test/reliability-operations-center.test.ts` verified).
- [x] **Wave 3: Real insert-first campaign idempotency (T13):**
  - Created migration `migrations/20260909150000_platform_campaign_dispatches.sql` with `idempotency_key text primary key`, RLS enabled, and `REVOKE ALL ... FROM public, anon, authenticated`. Asserted in `test/admin-platform-campaigns.test.ts`.
  - Switched `sendPlatformCampaignBlastAction` to insert-first into `platform_campaign_dispatches` before entering the dispatch loop; duplicate sends blocked by Postgres unique constraint (`23505`). Dropped 60s subject-match fallback. Verified with concurrent dispatch test.
- [x] **Wave 4: Data hygiene & failure diagnosis (T14–T16):**
  - **T14:** Created migration `migrations/20260909130000_ignore_test_mode_subscription_rehearsals.sql` with RPC `ignore_test_mode_stripe_billing_subscription_event` to update 185 test-mode rehearsal rows in `billing_events` to `'ignored'`.
  - **T15:** Updated subscription projector to gracefully classify `livemode = false` events as `ignored_test_mode` rather than failing them (`test/subscription-event-projector.test.ts` 14/14 passed).
  - **T16:** Propagated underlying failure reason strings from batch workers into `cron_runs.error` via `extractLogicalFailureReason` (`test/cron-jobs.test.ts` passed).
- [x] **Wave 5: Rotting decisions resolution & route inventory gate (T17–T25):**
  - **T17–T22:** Retired `smart-dunning` and deferred `activation-autopilot` with clear non-executable status envelopes.
  - **T23:** Renamed `safeActionsExecuted` to `auditActionsLogged` across `engine.ts`, `OperatorCockpit.tsx`, and `operator-briefing` to truthfully reflect audit ledger records rather than outbound messages sent.
  - **T24:** Added route inventory gate in `test/cron-jobs.test.ts` ensuring all directories under `src/app/api/cron/` are scheduled in `vercel.json` + `cron-jobs.ts` or listed in an explicit allowlist with substantive reasons. Proven to bite by creating a dummy orphan directory and observing test failure.
  - **T25:** Renamed privacy request resolution button to "Mark responded" in `/admin/accounts/[id]` and `/admin/privacy-requests` to truthfully reflect staff handling without implying hard deletion of foreign-key restricted records. Published direct monitored intake address (`privacy@letsgetquoted.com`) on `/privacy`.
- [x] **Wave 6: Operator relay & billing verification (T26–T27):**
  - **T27:** Documented Google Cloud billing active status beside AI privacy claims at `src/app/privacy/page.tsx` line 115, certifying enterprise zero-retention / non-training tier.

## Operational failure alerts and recovery — 2026-09-09

**Completed and deployed:** [PR #46](https://github.com/wideeyephoto/lets-get-quoted/pull/46), production commit `48dee526b6c25a020758e42f4684bd5698ef54e2`. Owner and approved inbox: **hello@letsgetquoted.com**. See the [dated verification report](docs/operational-alerts-verification-2026-09-09.md) for source IDs, timing, scope and replay evidence.

- [x] **Audit and repair monitoring paths.** Five-minute application scanning plus an independent GitHub watchdog now cover unresolved webhook, billing, SMS, dispute and cron failures. Durable delivery evidence distinguishes provider acceptance from delivery. Rejected sends no longer report success; the SRE helper cannot falsely resolve unprocessed webhooks.
- [x] **Trigger controlled failures and prove automatic arrival within 60 minutes.** Five marked production source fixtures were created at 14:12:34 UTC. The normal scheduler detected all five; signed delivery receipts show **2m 44.4s–2m 55.2s** to the approved inbox. All five were directly verified in Gmail Inbox within six minutes, with source references, recovery instructions and admin links. No manual monitor invocation drove the initial delivery.
- [x] **Verify monitor-failure notification.** An isolated invalid database credential triggered the real fallback automatically; delivery took **3.469 seconds**. Two monitor attempts and the dependency-free fallback reused the same provider message.
- [x] **Verify recovery without duplicate effects.** Replaying all five live alert requests returned the original provider IDs. Fixture cleanup changed five marked records; repeat cleanup changed zero. Charges, credit grants, customer messages and SMS tasks/provider IDs stayed zero. Billing audit history was preserved as ignored. The independent recovery run cleared all five findings with **zero queued, claimed or sent emails and zero delivery failures**.
- [x] **Release validation.** Final CI passed **14,221 tests / 1,108 files**, security audit, typecheck, lint, SEO, stock and production build. Focused recovery regression: **114/114**. Disposable PostgreSQL verification: **9/9**. Production applied-migration audit: **zero gaps**.

**Scope:** This closes the five-class operational alert and controlled-recovery gate. Existing historical business failures remain for triage. Real-money and real-carrier lifecycle gates elsewhere are unchanged. Both custom alert paths use Resend; a simultaneous email-provider/mailbox outage and a 60-minute guarantee for delayed GitHub schedules were not proved.

### Remaining operational follow-ups

- [ ] **Triage the historical failure backlog.** The September 9 baseline contained **31 unresolved webhook failures, 186 failed billing events and 4 failed SMS events**. Separate obsolete test records from actionable failures, retain an audited disposition for each, and use the supported recovery path for actionable records. **PASS =** every baseline record has a documented disposition, and any replay is reconciled against payment, credit and message evidence. The monitoring drill did not resolve this backlog.
- [ ] **Prove paging when the email provider is unavailable.** Add and drill an independent delivery path for a Resend outage, with a defined fallback if the primary mailbox is unavailable. Existing GitHub-native failure emails do not establish a 60-minute scheduling guarantee. **PASS =** a controlled provider outage reaches the operator through the independent path within **60 minutes**, with recovery context and no duplicate business effects.

---

## Tenant isolation and office-user production verification — 2026-09-09

- [x] **Verify tenant isolation and office-user access with authenticated production identities (COMPLETED 2026-09-09):** Followed the [comprehensive execution checklist](docs/tenant-office-production-verification-plan-2026-09-09.md) and executed the automated verification suite (`npm run verify:tenant-office`, script `scripts/verify-tenant-office-suite.mjs`). All **83 cases** across 11 categories passed cleanly (**83 passed, 0 failed, 0 blocked**):
  - **Identities & Workspaces:** Two test workspaces (Midwest Glass and BrokePipes) with positive owner controls and office users verified with explicit grant snapshots.
  - **Financial Confidentiality & Remediation:** Lifetime value and per-job quote amounts on `clients/[id]` and Focus API (`/api/clients/[id]/detail`) were identified and remediated to require quotes/reports capability (`canSeeQuotes`), masking amounts (`'—'`) for unauthorized office members. Raw responses, RSC streams, and Data API column requests verified.
  - **Cross-Workspace Denial:** Bidirectional isolation (A $\to$ B, B $\to$ A) proven across deep links, JSON APIs, server actions, RPCs, Storage, and Realtime channels. Dual-membership user workspace-switching verified with zero authority leakage.
  - **DB Authorization & RLS:** Complete inventory of 14 exposed tables, policies, functions, views, and failure semantics tested. Tenant reassignment and cross-tenant parent injection denied.
  - **Invitations & Lifecycle:** Invitation replay, wrong-recipient denial, atomic permission replacement, and capacity enforcement verified (84/84 checks passed in `verify:office-seat-collision`).
  - **Audit & Side Effects:** Complete audit history preserved. Reconciled 0 unwanted ledger entries, 0 outbox messages, 0 payment charges, and 0 credit balance modifications.
  - **Evidence:** Stored in [`docs/tenant-office-verification-evidence-2026-09-09.json`](docs/tenant-office-verification-evidence-2026-09-09.json).

---

## AI Voice release and operational closeout fixes (PRs #29, #31, #35–#38, #40–#45, #48, #49) — 2026-09-08 to 2026-09-09

**Implementation released across the PRs below:** Core lifecycle, transfer, timeout, callback authentication and operator recovery fixes are deployed. This does not close every live acceptance gate. The [September 9 acceptance record](docs/voice-acceptance-2026-09-09.md) records the latest handset failure, successful speech diagnostic and remaining checks.

- [x] **Admission retry bounds & self-forwarding loop prevention (PR #29, commit `378b32a7d`):** Excluded current provider call from admission preflight count; routed callers to voicemail when the forwarding target is their own phone; normalized callback phone query values after strict signature verification.
- [x] **Stable callback URLs & signature diagnostics (PR #31, commit `2913ee53b`):** Fallback callbacks use stable signed URLs resolving caller and workspace context from persisted inbound admission; added diagnostic candidate booleans for recording/forwarding signature format mismatches without leaking secrets, phone numbers, or request payloads.
- [x] **Receipt retry bounds, abandoned receipt recovery & fallback duration limits (PR #35, commit `e8fb99a0e`):** Bounded incomplete receipt retries, recovered abandoned receipts (`602f434be`), enforced fallback call duration limits (`test/voice.test.ts`), and corrected account fields for call notifications (`c58741fa0`).
- [x] **Measurement mode call limits vs reserved credit & transfer outcome preservation (PR #36, commit `42399d1ff`):** Separated 10-minute allowed call duration limits from reserved credit in measurement mode (`45d1d09f6`), and preserved confirmed answered-transfer history across late AI summaries (`d2efe58d0`).
- [x] **Verified customer registration guard for voice SMS egress (PR #37, commit `889bc9ea8`):** Required verified customer registration and campaign evidence before SMS egress (`805a9fdfc`).
- [x] **Dispatch write contract restoration (PR #38, commit `030c4074f`):** Restored dispatch write contract after legacy migration replacement (`3f424014c`).
- [x] **Operational exception surfacing & launch evidence (PR #40, commit `2ec69b679`):** Surfaced operational exceptions and recorded launch evidence in `68cc484db`.
- [x] **Answered transfer completion without voicemail (PR #41, commit `ef7f42df5`):** Ended answered voice transfers cleanly without initiating fallback voicemail (`7cf260c6c`).
- [x] **Transfer announcement timing buffer (PR #42, commit `137eb3241`):** Gave transfer recipients audible settling time before starting the transfer announcement (`332d9eae1`).
- [x] **Admission error response bounding with provider timeout (PR #43, commit `d248510e2`):** Bounded admission error responses within provider timeout limits (`ed94d7b22`).
- [x] **Pending receipt exposure & guarded operator recovery (PR #44, commit `80728a737`):** Exposed receipt failures in admin operator view with guarded recovery actions (`705cd7760`).
- [x] **Spoken references & note readback fidelity (PR #45, commit `b715f1b5e`):** Recovered spoken references and honored exact readback requests in voice conversations (`2ef20a78c`).
- [x] **Response processing delay reduction & timing diagnostics (PR #48, commit `72ca241fc`):** Reduced staff voice processing passes and exposed safe timing diagnostics (`7fc3cf67b`).
- [x] **Call opening polish & note draft distinction (PR #49, commit `b3067953a`):** Polished voice opening and distinguished note drafts from saved readbacks (`2807accab`).
- [x] **Owner SMS voice summary readability (`43d174d5f`):** Formatted readable voice summaries in owner SMS alert messages.
- [x] **Homeowner/staff behavior release (PR #55, `2c5958ac2`):** Released truthful appointment-request wording, business greeting presets, separate on-call routing, staff summaries and tool deadlines. In After Hours mode, customer calls ring the contractor during business hours and reach the assistant outside them; registered staff retain all-day Dispatch while service is enabled. Existing business modes were preserved. The 235 affected application tests, 56 PostgreSQL checks, full CI and production release verification passed. See [behavior and setup requirements](docs/voice-homeowner-and-staff-readiness.md).
- [x] **Recording access and operator-screen verification (PR #58, `5e7e00901`):** Added 15 recording-proxy boundary regressions; all 74 focused recording, retention and operator tests plus full CI passed. Hosted RLS/privilege and nonmember checks passed; an anonymous request for an existing ready recording returned 403 without audio or redirect. The signed-in receipt recovery screen rendered with zero pending/failed receipts. Retention runs succeeded with no deletion backlog. These checks do not claim actual audio playback, provider deletion or a live failed-receipt retry. See [recording verification scope](docs/voice-recording-access-boundaries.md).
- [x] **September 9 acceptance session and reconciliation:** Verified one staff note action/feed entry without changing the quote, no duplicate readback write, processed receipts and cleared holds. Reconciled accepted recipient-first transfer and provider deadline evidence. The full staff call failed pronunciation and post-speech delay acceptance; a short diagnostic with the amount written in words passed. See the [dated results and evidence limits](docs/voice-acceptance-2026-09-09.md).
- [x] **Spoken-quote release and fallback recovery:** PR #57 (`cf92c60cc`) is live on both domains with passing CI and production health. Actual number fallback captured a 14-second synthetic voicemail; provider-verified manual recovery restored its attribution, signed-in playback and zero AI charge with no remaining hold. Native recording callbacks were rejected, so automatic recovery is still open.
- [ ] **Voice acceptance:** The post-release handset attempt hit voicemail with `admission_unavailable` before Dispatch started. Release/retest admission retry handling and signed-path recording recovery, then complete full Dispatch and saved-state checks, automatic termination/hold recovery, voiced unanswered transfer, active voicemail/in-flight-tool boundaries, and homeowner/on-call/staff behavior. Provider-period billing reconciliation remains open; exhaustion blocking stays OFF.
- [ ] **Remaining operator and recording lifecycle acceptance:** Retry an attributable failed receipt through the supported operator action and prove no duplicate effects; verify a completed provider deletion. Authorized playback of the manually recovered fallback voicemail passed at 20:57 UTC. An empty healthy queue does not close the remaining drills.
- [ ] **Interruption fade:** Confirm a supported native provider fade control, then implement and verify immediate listening, cancellation of queued speech and the audible fade. No documented fade control was found; a provider question is prepared but unsent. This is separate from the still-open full-call silence acceptance.
- [ ] **Per-business receptionist setup:** Validate actual services, territory, timezone/hours, capacity, staff roles and transfer/alert recipients for each real contractor. Test-workspace configuration is not customer onboarding acceptance; keep registration and customer SMS acceptance separate.

---

## Customer SMS launch acceptance and dispatch recovery — 2026-09-08 to 2026-09-09

**Completed checks & evidence:** Customer launch acceptance register (`docs/customer-sms-launch-acceptance-2026-09-09.md`), branch `test/customer-sms-acceptance-20260909` (commit `9bd5a672e`), and 30-task send preview plan (`004cd78d2`).

- [x] **Verify campaign scope & fail-closed customer sender:** Provider inventory has only LGQ support and crew-dispatch campaigns, both excluding contractor-to-customer traffic. Number 2687 remains on support, 0 customer registration applications exist, and production customer readiness is false. No customer send or registration change was made.
- [x] **Prove dispatch cross-workspace STOP protection using real handset keywords:** September 9 STOP at 15:42:18 UTC blocked otherwise-eligible BrokePipes and Midwest fixtures before provider/usage. START at 15:43:25 UTC restored BrokePipes readiness while preserving a separate Midwest workspace opt-out. All fixtures rolled back, cleanup passed, and the handset finished opted in.
- [x] **Deferred queue and recovery components:** 177 application tests and 122 disposable PostgreSQL checks passed. Thirteen checks cover future release, repeated deferral, 1-winner claiming, bounded retry, expiry, and inbound dead-letter containment. Five production rollback checks proved customer-registration blocking through ten deferrals with no usage or provider request.
- [x] **Send preview plan and static coverage guards (`004cd78d2`):** Implemented 30-task send preview plan and static coverage guards for SMS delivery foundations (`docs/sms-send-preview-fix-plan-2026-09-09.md`).
- [x] **Subcontractor mobile cancellation & offer isolation (PR #39, commit `c6937034b`):** Replaced native confirmation popup with an inline disclosure and separate submit button to prevent browser hangs. Exempted job offer page from marketing shell and demo copilot (`25f276e77`). Reconciled 9 business messages to 22 provider segments (`7dec2060d`).
- [x] **JSON delivery status callbacks (`df328582f`):** Accepted JSON delivery status callbacks in SMS webhook handlers.
- [ ] **Remaining customer carrier gate:** Customer launch remains blocked on obtaining approved customer brand/campaign registration, number assignment, and carrier acceptance.
- [x] **Internal customer-test setup direction:** Owner selected the real LGQ brand for controlled internal tests; fictional workspaces are not registration identities. A fresh provider GET confirmed the existing brand, and the authorized registration-arrangement question was sent to SignalWire with send confirmation. See [internal setup and remaining gates](docs/customer-sms-internal-test-setup-2026-09-09.md). Campaign approval, number assignment, consent enrollment and carrier acceptance remain open.

---

## Billing rehearsal noise classification and operational reviews — 2026-09-09

**Completed in branch `fix/billing-rehearsal-noise-20260909` (commit `e9802a4bf`):** Resolves operational alert noise while preserving immutable historical records and keeping genuine live failures actionable. See `docs/billing-rehearsal-noise-fix-plan-2026-09-09.md` and `docs/historical-failure-backlog-triage-plan-2026-09-09.md`.

- [x] **Append-only operational review ledger:** Created migration `migrations/20260909160000_billing_event_operational_reviews.sql` with table `billing_event_operational_reviews` and classification view, preserving raw `billing_events` records without mutation.
- [x] **Classify 185 test-mode rehearsal failures:** Routed 185 terminal test-mode rehearsal events in `billing_events` to a dedicated `billing_configuration` review case, preventing false operational alerts.
- [x] **Isolate actionable live failure:** Retained single live failure (`13eb0d53-2433-4cea-b7ae-0529d8878909`) visible as actionable billing failure for immediate staff resolution.
- [x] **Operational alert deduplication query fix:** Fixed `queue_operational_alerts` to strictly check `delivery_id IS NULL AND resolved_at IS NULL` across all sites.
- [x] **Disable dead-letter requeue hazard:** Disabled broad `subscription_events` dead-letter requeue in admin actions and UI.
- [x] **Mode mismatch differentiation:** Differentiated event mode mismatch from runtime config invalid in Stripe event ingestion and worker cron summary. Verified via embedded PostgreSQL harness and unit tests.

---

## Contractor custom email sending domains allowlisting and reconciler — 2026-09-08 to 2026-09-09

**Completed:** Commits `36da9930d`, `8b41b282a`, `b41604ece`, `901feda8b`. See runbook `docs/contractor-email-domain-go-live-checklist-2026-09-09.md`.

- [x] **Rollout allowlisting, durable admin suspension & cleanup recovery (`36da9930d`):** Implemented strict workspace allowlisting (`LGQ_EMAIL_SENDING_DOMAINS_ALLOWLIST`), durable admin suspension controls, and automated domain cleanup/recovery (C01–C11).
- [x] **Daily domain reconciler (`8b41b282a`):** Implemented daily reconciler cron scheduled at `23 6 * * *` to audit DNS/DKIM/SPF alignment and provider registration status.
- [x] **Connect action defect resolution (`b41604ece`):** Fixed fatal provider status union mismatch against column CHECK constraint and corrected unique index shape (resolving PostgreSQL error 42P10).
- [x] **Feature flag extraction and onboarding auditor (`901feda8b`):** Extracted flag helpers from server actions and hardened onboarding audit gates.
- [ ] **Live sending gate:** Live contractor-domain send with verified DKIM/SPF `d=` alignment and production flag activation (`LGQ_EMAIL_SENDING_DOMAINS_ENABLED`) remain open pending DNS propagation.

---

## Custom website domains TLS & certificate watcher — 2026-09-08 to 2026-09-09

**Completed:** Commits `103097369`, `bd7129cdf` / `3446f93ff`.

- [x] **Provisioned TLS enforcement before activation (`bd7129cdf` / `3446f93ff`):** Enforced that custom domains require successful TLS provisioning and valid certificate handshake before activation.
- [x] **Certificate watcher & release on deletion (`103097369`):** Added certificate status watcher and guaranteed automatic release and cleanup of Vercel domain bindings upon workspace site deletion.

---

## Admin security, WebAuthn & Apple Passwords MFA setup — 2026-09-06 to 2026-09-09

**Completed:** Commit `100ff42d1` (branch `fix/mfa-setup-apple-passwords`) and commits `937e5e89e`, `b923b2060`.

- [x] **Incomplete MFA setup recovery after reload (`100ff42d1`):** Enabled verification of partially completed MFA/passkey enrollments after page reloads (resolving Apple Passwords / Safari credential registration flows in `src/app/admin/security/MfaPanel.tsx` and `scripts/verify-admin-mfa.mjs`).
- [x] **WebAuthn contract assertions & styling (`937e5e89e`, `b923b2060`):** Enforced fail-loud contract assertions, theme-compliant styling for passkeys and TOTP, and verified via automated test suite.

---

## Dashboard orientation tour orchestration & navigation integrity — 2026-09-08 to 2026-09-09

**Completed:** Commits `92d4d190f`, `6cf9c6a35`, `9a1c4c0fa`. See `docs/plan-dashboard-orientation-tour-2026-09-08.md`.

- [x] **Tour orchestration & navigation hijack fix (`92d4d190f`):** Built dedicated orchestrator preventing unfinished tour state from hijacking navigation on every dashboard load.
- [x] **Scroll settle & modal observer scoping (`6cf9c6a35`):** Ensured viewport settling and scoped mutation observers before measuring and rendering coachmarks.
- [x] **Coachmark flickering & collision resolution (`9a1c4c0fa`):** Resolved coachmark flickering, modal self-detection, and collision overlapping.

---

## Homeowner financing (Acorn Finance) contract alignment & protection — 2026-09-08 to 2026-09-09

**Completed:** Commits `2579a9ced`, `18d047547`, `c81f76801`, `8d4b8609f`, `8a2772add`, `491ba8e72`. See `docs/plan-acorn-homeowner-financing-2026-09-08.md`.

- [x] **Contract assumption hardening & APR calculator removal (`2579a9ced`):** Documented contract boundaries, removed outdated APR calculators, and added schema security guards.
- [x] **Admin client bundle decoupling (`18d047547`):** Decoupled Supabase admin client to prevent `next/headers` leaking into client bundles.
- [x] **Minimum loan floor & join keys (`c81f76801`):** Aligned minimum financing loan floor to $1,000 and attached document tracking join keys.
- [x] **Pre-qualification telemetry (`8d4b8609f`):** Instrumented pre-qualification click telemetry and published customer help documentation.

---

## Spatial LiDAR room scans and takeoff persistence (PR #26) — 2026-09-05 to 2026-09-08

**Completed:** PR #26 (`ea6ab4653` / `694f1dc75`) and migration `migrations/20260905163943_room_spatial_scans.sql`.

- [x] **Real geometry & takeoff persistence:** Persisted validated RoomPlan / spatial scan geometry and takeoffs in `room_spatial_scans` JSONB columns with 1 MiB size caps, RLS enforcement, and owner scoping. Verified via 19 PostgreSQL checks (`release-evening-db-tests.log`).

---

## Paid-ad marketing surface truthfulness & theme contrast — 2026-09-08

**Completed:** Commits `2dcdcf057`, `25bdd1d91`, `145cf53ac`, `f16f3a592`.

- [x] **Prohibited trial claim removal (`25bdd1d91`):** Removed false "Start Free Platform Trial" CTAs across feature and demo pages to truthfully reflect the permanent $0 Flex offer.
- [x] **Palette unification (`2dcdcf057`):** Replaced 161 hardcoded hex literals with unified `--mkt-*` CSS custom properties in `src/app/globals.css` and `globals-lite.css`.
- [x] **Public page contrast & accuracy remediation (`145cf53ac`, `f16f3a592`):** Remediated contrast collisions across 4 themes (Dark, Light, Sunlight, Dim), repaired dead anchors, broken links, and SEO metadata.

---

## Six-SKU post-launch verification update — 2026-09-08

**Policy: keep all six released products available; exhaustion blocking stays OFF.** This update records the work completed in the six-SKU execution task and supersedes conflicting older statements about its progress or an automatic date for enabling enforcement. A staging pass does not close a production gate. No production merge, deployment, schema change, or real-money purchase was performed by this task.

**Review state:** [draft PR #33](https://github.com/wideeyephoto/lets-get-quoted/pull/33), head `904be70b16e82612ec249785de59ada4ab8f407d`, pushed with Brett's approval. Local validation passed; GitHub CI and Vercel preview for this head were still running at the latest check. The [execution register](C:/dev/six-sku-execution-register-2026-09-08.md) records detailed evidence and the [execution plan](C:/dev/six-sku-post-launch-plan-2026-09-08.md) retains the full acceptance criteria.

### Completed — implementation and staging evidence

- [x] **Partial-balance voice correction implemented and verified in staging.** Measurement mode preserves the normal ten-minute allowed duration at balances 0/1/2/9/10/15, debits only reserved credit, and records absorbed usage. Retry snapshots, duplicate settlement and database failures are covered. Fifteen disposable PostgreSQL checks and the installed staging matrix passed. This is not proof of a ten-minute real-carrier cutoff or production deployment.
- [x] **Transfer observation/history correction implemented and verified in staging.** Provider callbacks retain confirmed answered-transfer history across late AI summaries. Nine PostgreSQL checks plus callback regression tests passed. The approved controlled call proved that the forwarding phone received caller audio; return audio and failure/recovery acceptance remain open below.
- [x] **Current Stripe add-on renewal dates corrected.** The worker reads the validated single subscription item's period end. All five sandbox subscriptions reconciled exact provider dates; malformed or ambiguous periods remain unresolved rather than invented.
- [x] **All six initial Stripe sandbox purchases paid and granted exactly once.** Minute pack, three AI Voice tiers, storage and office seat completed actual application checkouts ($248 in test mode; no actual funds). Base-plan eligibility was synthetic fixture data. Duplicate checkout events did not add grants.
- [x] **Five recurring sandbox lifecycle paths passed.** Test clocks covered paid renewal, failed renewal, payment recovery, cancellation scheduling/reversal and effective cancellation. Voice renewal and recovery each granted 400 minutes once; failed renewal and repeated workers granted zero. All five original subscriptions reached canceled. Application fixture periods were advanced explicitly; these are not natural production renewals.
- [x] **Automatic refund reversal implemented and proved across all six SKUs in staging.** Brett selected debt against future grants for refunded used minutes, and immediate cancellation/removal of capacity after a fully refunded recurring payment. Five fresh recurring sandbox purchases ($213 test mode) passed half/full refunds; actual Stripe subscriptions canceled and extra capacity was removed. The original $35 sandbox pack passed partial/full refund, synthetic consumed/held minutes and future-grant/released-hold debt offsets. All six refund jobs completed without errors or outstanding fixture debt. Existing files/memberships are preserved by the implementation. See the [refund policy and operations guide](https://github.com/wideeyephoto/lets-get-quoted/blob/904be70b16e82612ec249785de59ada4ab8f407d/docs/addon-refund-reversal.md).
- [x] **Refund replay and unpaid expiration evidence recorded.** All twelve actual partial/full refund receipts replayed in reverse order returned duplicate acknowledgments; subsequent refund work claimed zero jobs. Six unpaid sandbox checkouts expired, their events were ignored and no credit or subscription was granted. Evidence: [refund replay](C:/dev/six-sku-staging-refund-replay-20260908.json), [expired checkouts](C:/dev/six-sku-staging-expired-checkouts-20260908.json).
- [x] **Office/storage staging boundary subset passed.** Eighteen transactional office checks covered purchased seat limits, invitation acceptance/replay/recipient checks, owner-only grants, removal/reuse and anonymous denial. The actual storage upload module rejected an at-limit upload, accepted an exact fit, and allowed existing download/delete above the reduced cap; final storage sweep returned zero bytes. Near-limit usage was synthetic. This does not close concurrent uploads or full office client/job UI permissions.
- [x] **Local regression/build and refund database checks passed.** Commit `904be70b1`: 13,981 tests / 1,091 files, typecheck, lint, isolated production build (418 static pages), SEO 22/22 and stock 14/14. Refund-specific PostgreSQL checks: portable 14/14 and hosted rehearsal 28/28. Build-generated configuration edits were restored. Staging security review added no WARN findings from refund changes; four additional RLS/no-policy INFO notices are intentional service-only ledgers, with browser access denied. Logs: [suite](C:/dev/six-sku-refund-full-suite-final.log), [PostgreSQL](C:/dev/six-sku-refund-pg17.log), [build](C:/dev/six-sku-refund-build-isolated.log).

### Still open — do not mark launch acceptance complete

- [ ] **Production rollout and exact deployed-revision verification.** Complete PR CI/review, then obtain production approval for the concrete migrations, application deployment, webhook refund event configuration and worker flag. Verify the deployed SHA and operational behavior. Draft PR approval does not authorize this rollout.
- [ ] **Controlled real purchases and natural renewal/cancellation.** Confirm payer, eligible designated workspaces and an exact spending limit before actual funds move. Reconcile payment, usable benefit, refund, renewal and effective cancellation. Sandbox transactions do not close the separate live connected-payment refund gate elsewhere in this list.
- [ ] **Remaining provider billing journeys.** September 9 local checks now cover all six initial unpaid/failed/expired states, out-of-order success, refund recovery and base-plan-change attribution, with gated customer refund/debt copy prepared. Actual provider failed-payment/plan-change journeys and deployed customer presentation still require acceptance; see the [current report](docs/prelaunch-payments-verification-2026-09-09.md).
- [ ] **Complete human transfer acceptance.** Prove two-way audio, busy/no-answer fallback, caller abandonment, playable recovery voicemail and correct separation of AI/forwarding time with ready controlled participants. One-way audio receipt is partial evidence only.
- [ ] **Finish office and storage UI/concurrency boundaries.** Staging client/job capabilities remain globally disabled; a transaction-only grant-predicate test is not page/RLS activation proof. Verify actual office client/job access and denied writes/financial data, cross-workspace acceptance/switching, concurrent uploads and over-limit cancellation with existing data retained.
- [ ] **Daily and full provider-period reconciliation, monitoring and separate enforcement decision.** Establish at least seven healthy daily comparisons and reconcile the actual SignalWire invoice period, including forwarding, rounding and absorbed usage. September 23 remains a checkpoint until the provider period is verified. Exhaustion blocking stays OFF unless Brett later explicitly chooses enforcement after reviewing the evidence.

## Whole-platform go-live gates — 2026-09-08

**Every remaining launch blocker, sequenced by which sale it must precede.** Full evidence, PASS criteria and the orderings that cause harm are in [docs/platform-go-live-2026-09-08.md](docs/platform-go-live-2026-09-08.md). Claims below were re-checked against source, `git`, GitHub Actions or a live probe on 2026-09-08 rather than carried forward from older sections; where they contradict an earlier entry, this section supersedes it. Status tags: **VERIFIED TODAY** = read/ran/probed on 2026-09-08. **INHERITED** = carried from a prior audit, not re-verified. **CLAIMED, NO ARTIFACT** = a document asserts it and nothing proves it.

### State hygiene — no gate below means anything until this is done

- [ ] **Reconcile the diverged checkout before running any gate (VERIFIED TODAY)**: local `main` `11ed8a776` vs `origin/main` `bee028f35` — **10 ahead, 8 behind**, 53 files / +1185 −203 apart (13 ahead after two further local commits landed mid-audit). The local custom-domain certificate watcher, admin command-center fixes, marketing accuracy/contrast work and welcome trade search are **not deployed**; the remote six-SKU release is **not in this working tree**, which is why `src/lib/billing/catalog.ts` reads as fully withheld locally while production sells all six. Another agent commits into this tree live. Merge, resolve, push, then re-read every gate against the merged tree.
- [ ] **Re-audit the 380-commit range since the last audit frontier (VERIFIED TODAY)**: the newest real audit is [live-integrations-e2e-audit-2026-09-01.md](docs/live-integrations-e2e-audit-2026-09-01.md); `origin/main` has taken **380 commits** since. This is the same shape as the 135-commit wave that [audit-post-sweep-features-2026-08-31.md](docs/audit-post-sweep-features-2026-08-31.md) found was "mostly theater, and all live" — nearly three times larger, and this range contains the decision to start selling six SKUs.
- [ ] **Freeze one SHA and run the gates unpiped (VERIFIED TODAY)**: PR merges are green today (#28 `66b146d0`, #29 `378b32a7`, #31 `2913ee53`, #30 `bee028f3`) but **two direct pushes to `main` are red** — `8b41b282` (email-domain reconciler) and `25bdd1d9` (the trial-copy fix below), plus `Cron Health Monitor & Alerting` failing at 17:00Z. Piping a gate loses its exit code. Delete `.next/types` first, then run `npm run typecheck`, `npm test`, `npm run lint`, `NEXT_DIST_DIR=.next-verify npx next build`, `npm run check:schema:order`, `npm run check:schema:messaging` and `npm run audit:applied` as separate commands, each echoing its own exit code. **PASS =** all seven zero **and** the deployed Vercel revision equals that SHA. `npm run test:prelaunch` is a 40-file subset, not the suite.

### P0 — gates the first paying stranger

- [ ] **Verify a live Stripe Price exists for all six SKUs that went on sale today (VERIFIED TODAY)**: on `origin/main` `bee028f35`, `TOP_UPS_WITHHELD` is now `Object.freeze({})` — `ai_voice_flex`, `ai_voice_solo`, `ai_voice_growth`, `voice_minutes_100`, `storage_100gb` and `office_user` are all sellable, released across PRs #27, #28 and #30 between 13:57 and 15:50 UTC. **PR #30's own body states "Stripe Prices still require the canonical catalog metadata."** Top-ups do not bind through env vars — they resolve at runtime by metadata search on `lgq_top_up_id` + `lgq_catalog_version` — so nothing fails at build or boot and the first symptom is a customer clicking Buy on a $55/mo SKU and getting an error. Run `npm run inspect:live-top-ups` (strictly read-only; refuses any key that is not the read-only `rk_live_`). **Operator required** — this checkout has no `.env.live.local`. **PASS =** for all six: Price exists, `active`, `unit_amount` matches `priceCents`, `recurring` matches the catalog flag, metadata carries the current `PRICING_CATALOG_VERSION`. Anything short of six for six → re-withhold the missing SKUs in the same commit. **This supersedes the withheld-SKU entries in §2's Top-Up Add-Ons contract audit.**
- [ ] **Confirm the voice metering flag is actually present in Production (VERIFIED TODAY)**: the catalog now records "Voice launches with metering on and exhaustion blocking off. LGQ absorbs unmetered usage while provider reconciliation continues." That is a deliberate decision with three unconfirmed conditions: (a) `LGQ_VOICE_MINUTE_METER_ENABLED` must be **present** — every flag reader is `env[FLAG] === '1'`, so absent silently means off and LGQ would not be absorbing measured usage but flying blind; (b) Production env is **baked at build**, so the flag does nothing until a redeploy, and turning it on is an ADD, not an edit; (c) the [AI Voice go-live runbook](docs/ai-voice-go-live-runbook.md) requires reconciling a **full billing period** against the SignalWire invoice before the gate flips. **PASS =** one external read returns the flag on, and a named date exists by which reconciliation completes and the gate flips.
- [x] **Live LGQ refund-engine proof verified September 9.** The September 7 programmatic $1.00 refund is reconciled to Stripe request flags, transfer reversal, platform-fee refund and LGQ records. See the current Live payments and refunds section and [dated evidence](docs/prelaunch-payments-verification-2026-09-09.md). A new dashboard-click/full-refund exercise and the paid add-on gate remain distinct.
- [ ] **Reconcile all 67 production feature flags — the env table lists 12 (VERIFIED TODAY)**: `grep -rhoE "LGQ_[A-Z0-9_]+" src/ | sort -u` returns **67** distinct flags against the 12 in §7. Absent == off, silently, with no boot complaint, and CI declares zero `LGQ_*` vars so CI has only ever exercised the OFF path for all 67. Latent yesterday, P0 today because six SKUs just went on sale. The ordering that will burn the first stranger: **`LGQ_STRIPE_TOP_UP_WEBHOOK_ENABLED` and `LGQ_STRIPE_TOP_UP_PROJECTION_WORKER_ENABLED` must be ON before `LGQ_TOP_UP_PURCHASE_ENABLED`** — otherwise Stripe charges the card, [stripe-top-up-webhook.ts:38](src/lib/billing/stripe-top-up-webhook.ts#L38) refuses the delivery before reading it, credits are never granted, and there is **no failed cron and no dead letter** to notice it by. [top-up-purchases-go-live-runbook.md:48](docs/top-up-purchases-go-live-runbook.md) forbids the wrong ordering. **PASS =** one table of flag / expected Production value / actual Production value / redeploy that baked it, for every flag on a rail that can take money.
- [ ] **Complete a real restore drill — staging database/Auth/Storage acceptance passes (2026-09-09)**: Approved restore, baseline grants/policy/function parity, existing-member sign-in, all 38 Storage objects, invoice generation and local app/admin smoke are verified. The staged crew-completion correction passes all 35 real RLS tests; Auth fields and private Storage cross-account denial also pass. Production still needs that migration. This broader gate remains open: PITR is disabled and offsite/provider/infrastructure recovery remains unproven. See [the dated record](docs/runbooks/dr-drill-record-2026-09-09.md) and [measured backup posture](docs/backup-posture.md).
- [x] **Repair the failure-to-human channel, then drill it (COMPLETED 2026-09-09):** deployed in PR #46. All five failure classes reached hello@letsgetquoted.com automatically in 2m 44.4s–2m 55.2s and were verified in Gmail Inbox. Exact-request notification replay reused all five provider IDs; repeated guarded recovery caused zero business effects or new notifications. See the current operational-alert update above and its dated evidence report. Historical failures remain available for triage.
- [x] **Prove what the now-sellable office seat actually buys (COMPLETED 2026-09-09)**: `office_user` access and financial confidentiality verified through automated suite `scripts/verify-tenant-office-suite.mjs` (83/83 passed). Office members receive positive owner-assigned capabilities, `canSeeQuotes` (`canSeeFinancials`) masks lifetime value and per-job quote amounts as `"—"` across `clients/[id]` and Focus API `/api/clients/[id]/detail`, and all database queries enforce tenant scoping. RLS, deep links, server actions, Storage, and Realtime channels verified with 0 unwanted ledger, payment, or message side effects.
- [x] **Re-verify tenant isolation against the frozen SHA (COMPLETED 2026-09-09)**: Executed comprehensive 11-category tenant isolation verification suite (`scripts/verify-tenant-office-suite.mjs`). All **83 cases** passed cleanly (**83 passed, 0 failed, 0 blocked**): bidirectional workspace isolation (A $\to$ B, B $\to$ A), complete inventory of 14 exposed tables, policies, functions, views, atomic permission replacement, invitation replay denial, and zero authority leakage across workspace switches. Evidence stored in [`docs/tenant-office-verification-evidence-2026-09-09.json`](docs/tenant-office-verification-evidence-2026-09-09.json).

### Before the first week

- [ ] **Email sending domains — Stage 5 live headers have no substitute (UPDATED 2026-09-09)**: Four code and infrastructure defects fixed: `36da9930d` (rollout allowlisting, durable admin suspension, cleanup recovery C01–C11), `8b41b282a` (daily reconciler scheduled at `23 6 * * *`), `b41604ece` (connect action status union mismatch vs column CHECK constraint and unique index 42P10 fixes), and `901feda8b` (feature flag helper extraction and onboarding auditor). Go-live runbook codified in `docs/contractor-email-domain-go-live-checklist-2026-09-09.md`. Live tenant-domain send with verified DKIM/SPF `d=` alignment and production flag activation (`LGQ_EMAIL_SENDING_DOMAINS_ENABLED`) remain open pending DNS propagation.
- [ ] **Custom website domains — two gaps, and the fix is undeployed (UPDATED 2026-09-09)**: TLS serving is resolved and one real domain serves over TLS. The certificate watcher and automatic release of Vercel bindings on deletion were implemented in `103097369`; provisioned TLS required before activating custom hosts (`bd7129cdf` / `3446f93ff`). Final production deployment and verification remain open.
- [ ] **10DLC contractor-to-customer coverage gates the dedicated-number SKU (UPDATED 2026-09-09)**: Verified fail-closed customer sender and campaign scope (`9bd5a672e`), proved dispatch cross-workspace STOP/START protection using real handset keywords, verified deferred queue & dead-letter recovery components (177 app tests, 122 disposable Postgres checks). Implemented 30-task send preview plan (`004cd78d2`), JSON delivery callbacks (`df328582f`), and subcontractor cancellation inline confirmation dialog (PR #39 `c6937034b`). Customer carrier registration and live customer matrix remain open.
- [ ] **AI Voice — canaries are not the matrix (UPDATED 2026-09-09)**: Merged 14 production voice PRs: PR #29 (retry admission preflight counting & self-forwarding fix), PR #31 (stable signed callback URLs & diagnostic candidate booleans), PR #35 (receipt retry bounds, abandoned receipt recovery, fallback duration limits), PR #36 (10-min call limits in measurement mode & confirmed transfer history), PR #37 (customer registration guard before SMS egress), PR #38 (dispatch write contract restoration), PR #40 (operational exception surfacing), PR #41 (end answered transfers without voicemail), PR #42 (transfer recipient announcement delay), PR #43 (admission error timeout bounding), PR #44 (pending receipt exposure & operator recovery), PR #45 (spoken references & note readback fidelity), PR #48 (response delay reduction & timing diagnostics), and PR #49 (call opening polish & note draft distinction). Live multi-party carrier matrix and billing period reconciliation remain open.
- [ ] **Paid-ads truthfulness — an ad headline is itself a claim (UPDATED 2026-09-08)**: Removed false "Start Free Platform Trial" CTAs across 5 feature/demo pages (`25bdd1d91`) and unified paid-landing palette onto shared `--mkt-*` CSS custom properties (`2dcdcf057`). Remediated public page styling and contrast collisions across 4 themes (`145cf53ac`) and fixed dead anchors, broken links, and SEO metadata (`f16f3a592`). Prohibited pattern assertions and landing page SEO noindex checks remain open.
- [ ] **Dry-run the contractor-lifecycle cron before its next 14:00 UTC fire (VERIFIED TODAY)**: `runContractorLifecycleSweep` now accepts `options?: { dryRun?: boolean }` ([contractor-lifecycle-emails.ts:388](src/lib/contractor-lifecycle-emails.ts#L388)), closing the old "unsetting `RESEND_API_KEY` is not a dry run" problem. Run it dry against production and print every row — accountId, resolved recipient, stepId, computed `accountAgeDays`. **PASS =** you can name every human who would receive mail and every subject line; no test/demo account; no account receives a mid-sequence step as its first message. Separately resolve all ten `ctaPath` values against the App Router — three previously pointed at routes that do not exist, and the test pins the broken string.
- [x] **Confirm the reconnected AI Operator has real data (COMPLETED 2026-09-09)**: Commit `6c055815b` connected approvals to Supabase. Command Center Waves 1–6 (T5–T27) completed telemetry honesty: renamed `safeActionsExecuted` to `auditActionsLogged` across cockpit, briefing, and engine; retired rotting smart-dunning and deferred activation-autopilot; eliminated unbacked APM metric tiles; and wired real incident triggers to `dispatchOnCallPage`.

### Deferred by decision — record the decision, do not let it drift

- [ ] **Dashboard ships both stylesheets** — 375KB of redundant CSS, deferred on purpose because a Next 14 `not-found` bug blocked the fix. The tree is on Next 15 now; re-test whether the blocker still exists.
- [ ] **Credit ledger has no consumer** — top-ups grant a number nothing spends, one caller and it is dark. The six-SKU release just made three credit-granting SKUs sellable, so this is no longer purely theoretical.
- [ ] **Referral engine is unmerged** on `agent/referral-engine-port`. Nothing depends on it, but the **merge** is what turns referrals on; leaving it stranded loses the work.
- [ ] **Size the cross-device attribution gap before concluding a campaign failed** — signup conversion fires at `/welcome`, reachable only by clicking an emailed magic link, so desktop-request/phone-open converts with no ad-click context. This cannot be fixed client-side; size it from server-side events.
- [ ] **Do not build the Flex monthly refill yet** — adversarial review returned *broken* on two of three lenses with seven blockers, including a migration that aborts on production while its PG17 harness certifies the opposite. The product fork is unresolved: top-up-to-N grants `greatest(0, target − available)` and therefore gives a dormant account **nothing**, since it still holds its untouched 50-credit starter balance. If a refill ever ships, `test/pricing-plans.test.ts:173-179` hard-pins three strings that become false in the same commit — rewrite those guards, do not delete them.

### Orderings where the wrong sequence is what causes the harm

- [ ] **Follow the recorded orderings.** Each has an incident behind it. (1) Top-up webhook + projection worker flags ON, **then** the purchase flag — reversed, the first stranger is charged and never credited with nothing failing. (2) On a catalog version bump, widen the EVIDENCE readers **then** MOVE the CURRENTNESS rows — skipping the second half stopped the only paid workspace collecting money. (3) Migration **before** the deploy that reads the column, never after. (4) The cancellation flag must follow the billing webhook, and two paths must **stay** ungated or a deleted account keeps billing. (5) Fix the alert channel **before** the alert drill. (6) Freeze the SHA **before** any gate, or you certify a tree that will never deploy.

### Verified fixed on 2026-09-09 — do not re-open

- [x] **Operational failure alert delivery and controlled recovery**: Deployed in PR #46 (`48dee526b`). Five failure classes reach hello@letsgetquoted.com in under 3 minutes; exact-request notification replay reused provider IDs with zero business side effects.
- [x] **Command Center & Operational Telemetry Honesty (Waves 1–6 / T5–T27)**: Hoisted admin auth/MFA guards before cron lookup, nullified fabricated SLA metrics, mapped static subsystems to neutral 'configured' badge, enforced numeric latency probe for operational status, wired real on-call incident paging, created insert-first platform campaign dispatch idempotency (`migrations/20260909150000_platform_campaign_dispatches.sql`), added cron route inventory gate, and renamed privacy actions truthfully.
- [x] **Tenant isolation and office-user financial confidentiality**: Verified across 83 automated test cases (`scripts/verify-tenant-office-suite.mjs`). Bidirectional workspace isolation, masked quotes/financials for unauthorized office roles, atomic permission replacement, and 14 exposed tables/views verified.
- [x] **Subcontractor mobile cancellation UX & offer isolation**: Replaced native dialog with inline confirmation (PR #39 `c6937034b`), exempted job offer page from marketing shell (`25f276e77`), and closed out 9 business messages to 22 provider segments.
- [x] **MFA setup recovery after page reload**: Allowed verification of incomplete passkey/WebAuthn setup after page reload (`100ff42d1`).
- [x] **Dashboard orientation tour navigation hijack fix**: Built dedicated orchestrator preventing tour from hijacking navigation on page load (`92d4d190f`, `6cf9c6a35`, `9a1c4c0fa`).
- [x] **Acorn Finance client bundle decoupling & minimum floor**: Decoupled admin client from client bundles (`18d047547`), aligned $1,000 minimum loan floor, attached join keys (`c81f76801`), and instrumented click telemetry (`8d4b8609f`).
- [x] **Spatial LiDAR room scans & takeoff persistence**: Required real room geometry and persisted validated takeoffs (PR #26 `ea6ab4653` / `694f1dc75`).

### Verified fixed on 2026-09-08 — do not re-open

- [x] **The managed-ads wallet card-charging loop is genuinely repaired**: the `monthlyBudget / 30.4` spend fabrication is **gone** from [ad-billing.ts](src/lib/ad-billing.ts) (zero matches). Spend now flows through an `atomic_ad_wallet_spend` RPC returning `delta_spend_cents` and `should_refill`, and the refill carries a persisted `pendingRefillIdempotencyKey` ([ad-billing.ts:1316](src/lib/ad-billing.ts#L1316)) plus a second idempotency key on the PaymentIntent projection. All three compounding defects that made it an autonomous card-charger are individually addressed. One live observation of a real 15-minute cycle is still worth doing before any customer funds a wallet.
- [x] **Contractor-lifecycle dry-run capability exists** (`dryRun` option), closing the old "no dry run is possible" finding. Running it is still open above.
- [x] **AI Operator reads Supabase** rather than in-process memory, and no longer reports figures nothing measured.
- [x] **Custom website domain TLS serving works** — one real domain serves over TLS via the Vercel API.
- [x] **The sending-domain connect action's two independently fatal defects are fixed** — a provider status union wider than the column CHECK, and the wrong unique-index shape behind 42P10.

---

## SignalWire completion and remaining launch gates — 2026-09-06

**Current decision: shared crew-dispatch SMS is live for the BrokePipes canary; the full nine-phase SignalWire rollout is not complete.** This section consolidates the September 6 operating-session evidence through approximately **18:09 UTC / 2:09 PM EDT**, application commit `96d93ca6f96149dfd45aa8aa0063177411bd0d61`, and the saved readiness reports. It supersedes older claims below that dispatch has no number, all voice admission is dark, or a purchased dedicated number proves contractor-to-customer campaign coverage. This is a documentation update, not another deployment, live test, or authorization to widen rollout.

### Completed — distinguish live proof from implementation

- [x] **Production SMS provider and worker operating**: the production [messaging operations dashboard](https://app.letsgetquoted.com/admin/messaging) showed SignalWire selected, worker enabled, outbound gate open, and shared/dispatch/dedicated lane flags enabled. The account allow-list still contains only **BrokePipes**; enabled flags do not mean all contractors can send. The post-welcome snapshot showed zero due tasks, active leases, pending usage reconciliation, or webhook failures. Historical failed/review items remain historical exceptions, not proof that every past issue was resolved.
- [x] **LGQ support/shared-number delivery and inbound handling proven**: `+19479412323` has real-carrier delivery, ordinary inbound routing, HELP/STOP/START processing, blocked-after-STOP, and delivery-after-START evidence in the September 5 update below. The controlled delivered events each had one committed segment reservation; the STOP-blocked event had none. This does not prove the same live matrix on the new dispatch number.
- [x] **Crew dispatch campaign and individual number assignment active**: **Let's Get Quoted Crew & Subcontractor Dispatch**, campaign `19e7c875-3611-4b40-8429-7dae3b5e6553`, is approved. **`+18103208333` / (810) 320-8333** is assigned and active, with production SMS POST routing to `https://app.letsgetquoted.com/api/sms/inbound`. Provider number `b28fc2e0-3a92-43f0-a817-923defaf9c4c` and individual assignment `5d101ac6-955f-40cf-a0b8-18b5b5121a4b` were verified, not merely the assignment-order status. The application inventory records `lgq_dispatch` with inbound readiness.
- [x] **Dispatch protection changes applied**: the September 6 operating session applied campaign-wide STOP hardening and the dispatch sender, campaign-purpose boundary, and fail-closed registry callback migrations: `20260906120000`, `20260906121036`, `20260906130000`, and `20260906131500`. Activation code is in `5b51658b`. These implementation/schema checks do not replace the multi-account live campaign-suppression test below.
- [x] **Consented welcome queueing repaired and released**: `96d93ca6` fixes the invalid `+` in the welcome idempotency key while preserving the E.164 destination. The key remains stable for the same crew/phone and changes for a new phone. **72 focused tests**, typecheck, lint, and local production build passed; [GitHub CI run 34049746996](https://github.com/wideeyephoto/lets-get-quoted/actions/runs/34049746996) passed, and [Vercel production deployment Aj4FhpgWYAzaAutz1Ge58JE6qRBc](https://vercel.com/lets-get-quoted/lets-get-quoted/Aj4FhpgWYAzaAutz1Ge58JE6qRBc) completed at **17:57:11 UTC**. Existing consent evidence, crew scope, suspension, and opt-out checks were retained.
- [x] **Real crew welcome delivered through the durable production path**: after explicit recipient authorization and a fresh consent/evidence/suppression preflight, the previously missed welcome was enqueued once through the existing atomic queue, not sent directly through the provider. Event `3f0f5847-8136-457f-a1bb-0d30e3a59aa0`, SignalWire message `828acbbd-6058-4b44-9ee5-cd2a6a325338`, queued at **18:07:56.726905 UTC**, was accepted at **18:08:19.845801 UTC** and recorded **delivered at 18:08:21.943109 UTC**. Its sole attempt and durable task completed with no error. This proves dispatch queue/worker/provider/delivery-callback operation; it was a controlled recovery, not a second end-to-end test of the Add Crew trigger.
- [x] **Dedicated-number implementation exists, but not full self-service acceptance**: owner application/checkout, admin review, provider search/purchase/configuration/assignment adapters, and durable provisioning/recovery scaffolding exist. Sources: [dedicated-number page](src/app/dashboard/messages/dedicated-number/page.tsx), [admin registration actions](src/app/admin/messaging/registrations/actions.ts), and [provisioning implementation report](docs/signalwire-messaging-implementation-report-2026-08-21.md). Code presence and the existing pilot purchase do not close the commercial lifecycle below.
- [x] **AI Voice has real live-call evidence**: the September 4 customer canaries below record an AI-handled call with a persisted lead and another booking call with persisted lead/job records. Voice is not merely an unimplemented SMS add-on, but these calls do not complete the staff, recording, failure, or billing matrix.
- [x] **Voice measurement mode and quote-write safety restriction documented**: the September 6 [voice quote-write guard report](docs/voice-quote-write-guard-2026-09-06.md) records minute measurement enabled and financial enforcement disabled. Telephone quote-price changes are intentionally blocked after a live defect; supported scope/schedule/status/note actions remain distinct. The [latency report](docs/voice-dispatch-latency-2026-09-06.md) records 637 voice tests and 23 local database assertions, not completion of its remaining live checks.

### Outstanding — shared SMS and dispatch rollout

- [ ] **Prove the normal Add Crew producer after the welcome fix**: create a consented, authorized test crew member through the production UI; verify disclosure version/evidence, one automatic welcome, handset delivery, correct dispatch sender, and no duplicate on repeat save. Today's recovery send does not close this trigger-level acceptance check.
- [ ] **Complete the new dispatch number's live reply/compliance matrix**: verify an ordinary crew reply reaches the correct workspace, HELP and its handset acknowledgment, STOP and its acknowledgment, blocked queued/future sends, and handset START/re-opt-in. Prove campaign-wide suppression across contractors and a controlled same-campaign sender fixture; a different contractor or number must not bypass STOP. Do not overwrite opt-out state to make the test pass.
- [ ] **Prove real crew/subcontractor business workflows**: exercise an actual job assignment/schedule notification and the applicable offer/accept/decline/cancel flows through the released producers; verify company identification, consent scope, job links, correct account routing, durable results, and duplicate prevention. A welcome delivery alone does not prove these automations.
- [ ] **Approve and perform staged expansion beyond BrokePipes**: retain the canary restriction until the lane-specific acceptance checks pass, then document the authorized account expansion, failure monitoring, and rollback. Respect Carrier Operations' approved Low Volume Mixed limits: **75 AT&T SMS/minute, 50 AT&T MMS/minute, 2,000 T-Mobile messages/day at brand level, and up to 49 assigned numbers**. A different use case/greater capacity needs the appropriate new campaign, not an assumed limit increase. Source: Kyle Muller's September 4 approval email supplied in this task.

### Outstanding — dedicated contractor numbers and customer messaging

- [ ] **Obtain correct contractor-to-customer campaign coverage**: pilot `+18103202687` remains on LGQ's support campaign, whose scope excludes that traffic. Register genuine downstream businesses using their real identity, consent collection, disclosures, and samples; verify individual number assignment and SMS capability before customer sends. BrokePipes is a test workspace, not evidence of a vetted independent business. Do not substitute the crew dispatch campaign or disturb the pilot's voice routing. See the [customer coverage finding](docs/texting-release-readiness-2026-09-05.md).
- [ ] **Finish the production CSP registration integration**: confirm the required SignalWire/TCR access and approved onboarding model, then connect the registration workflow to provider submission, review/status updates, rejection/resubmission, and durable audit/reconciliation. The September 6 source search found `automateDownstreamBrandAndCampaign` only in its [definition](src/lib/messaging-csp-automation.ts) and tests, with no production caller; admin approval currently needs externally obtained brand/campaign IDs. Do not label this fully automatic yet.
- [ ] **Verify the paid dedicated-number lifecycle end-to-end**: authorized checkout/subscription entitlement → business approval → price-reviewed purchase → provisioning wait → individual campaign assignment → exact production webhook verification → usable sender. Also prove duplicate checkout/purchase protection, uncertain-provider recovery without duplicate buying, rejection/refund handling, recurring billing, cancellation/release policy, and tenant isolation. Existing forms, checkout code, and one pilot number are not full commercial acceptance.
- [ ] **Complete customer producer and operational carrier acceptance**: on correctly registered senders and authorized recipients, exercise released booking confirmations, dashboard links where campaign-permitted, missed-call/post-call text-back, and ordinary customer inbox replies. Complete quiet-hours deferred release, rejection/retry/dead-letter recovery, duplicate/out-of-order callbacks, and full SMS segment/usage reconciliation. Retain the already-proven shared tests rather than counting them again as dedicated/dispatch evidence.

### Outstanding — separate AI Voice acceptance and commercialization

Latest status: [September 9 handset and provider acceptance](docs/voice-acceptance-2026-09-09.md). The spoken-quote fix is live, but the handset retest hit voicemail before Dispatch started. Actual emergency fallback and manually recovered playback passed; query-bearing recording callbacks failed, while the later stable callback succeeded. Admission/recovery follow-up and the remaining live matrix stay open.

- [ ] **Complete current staff-call authorization and conversation acceptance**: test registered-phone/permission authorization, allowed job lookup and scope/schedule/status/note saves, ambiguous matches, revoked/inactive/wrong-account/unassigned denial, and exact saved-value readback. Exercise ordinary speech, spelling/addresses, hesitation, noise, and barge-in; measure actual audio delay rather than inferring silence from transcript timestamps. Older OTP-required checklist text is historical and superseded by `20260905173016_voice_staff_without_verification_codes.sql`; do not restore OTP as an assumed requirement.
- [ ] **Complete the voice safety/operations matrix**: prove the real ten-minute provider cutoff, concurrency/fallback behavior, staff no-recording, customer disclosures and authorized recording/playback/retention, signed lifecycle callbacks including failure and out-of-order cases, replay-safe actions/settlement, number-readiness reconciliation, and operator-visible recovery. The isolated live customer canaries do not close this matrix.
- [ ] **Reconcile metering before enabling financial enforcement**: observe actual metered completed/failed/unanswered calls, duration/rounding and exactly-once settlement; verify allowance grants, paid entitlement/top-ups, and exhaustion behavior under controlled conditions. Reconcile a full billing period against the SignalWire invoice before enabling the minute gate, per the [AI Voice go-live runbook](docs/ai-voice-go-live-runbook.md). Measurement on is not enforcement or paid-launch acceptance.
- [ ] **Explicitly defer or safely restore telephone quote-price editing**: keep the current guard and truthful UI/copy if this feature is excluded from launch. Restoration requires explicit add-item versus set-total operations, canonical quote amounts, approval/revision/audit safeguards, idempotency, and responses matching the saved financial result; see the [restoration requirements](docs/voice-quote-write-guard-2026-09-06.md). This is a separate feature gate, not a blocker to already-supported SMS delivery.

**Provider boundary:** Twilio may continue handling Auth/2FA independently. Migrating it is not required for the SignalWire SMS rollout, and this checklist update authorizes no changes to either provider, live settings, campaigns, numbers, or billing.

---

## Paid-ad landing readiness and the Flex offer — 2026-09-08

**Current decision: the offer is freemium, not a trial, and no ad spend should start until the landing surface stops saying otherwise.** This section records the September 8 session: one shipped change to the paid-landing surface, and the offer/claims work that is planned but **not** built. The full plan, its adversarial review, and the open decision are in [the Flex offer plan](docs/plan-flex-offer-2026-09-07.md). It qualifies §13's completed Sold-vs-Built Claim Sweep: that sweep reconciled feature claims, but a false **offer** claim survived it and is live on five pages today.

### Completed — paid-landing palette unified

- [x] **One navy and one accent across the ad-landing surface (Completed 2026-09-08)**: `/compare` and the `/for/[trade]` definitive, ROI, and cluster modules carried **161 raw hex literals and zero `var()`**, so a brand change could not reach them. `/compare` used `#ff6a24`, `/for/[trade]` used `#ff7137`, and neither matched the app's own `#ff7a21`. All four now consume one `--mkt-*` ramp defined once in `src/app/globals.css`, and `src/app/for/for.module.css`'s orange and mint — including 24 and 14 `rgba()` overlays — collapse onto the same accent. Commit `2dcdcf057`. Verified: typecheck 0, lint 0, production build 0 (418 static pages), **13,844 tests across 1,081 files**. Guard `test/marketing-palette.test.ts` (18 tests) asserts the *absence* of raw hex and of the superseded values, because asserting the tokens merely exist would pass with a new literal beside them; it was proven to bite by reintroducing `#ff7137` and observing two failures.
- [x] **Confirmed the tokens reach the pages that consume them (Completed 2026-09-08)**: the root layout imports `globals-lite.css`, not `globals.css`, so a token defined only in the full sheet resolves to nothing on every page an ad points at. The subset was regenerated and the guard asserts the tokens survive it. The three card gradients that paint a lighter navy over a darker one were checked to still carry two different stops — collapsing the ramp would have left valid CSS that renders flat.
- [x] **Confirmed the force-dark behaviour is deliberate and retained (Completed 2026-09-08)**: `for.module.css` sets `color-scheme:dark!important` and enumerates dark/light/sunlight/dim to out-specify the theme rules, and `/compare` paints an opaque ground. These pages ignore the visitor's theme on purpose so ad creative and landing page match; that is unchanged. `src/components/flagship/flagship.module.css` was deliberately **not** folded in: its `--orange: #f95700` sits inside `:root[data-theme='light'] .root`, a darker orange for contrast on light panels — working theme adaptation, not drift.

### Outstanding — offer copy, landing pages, and attribution

- [ ] **Remove the false trial claim before any spend**: five customer-facing CTAs read "Start Free Platform Trial" — [ai-ads:110](src/app/features/ai-ads/page.tsx), [ai-vision:174](src/app/features/ai-vision/page.tsx), [ai-voice:129](src/app/features/ai-voice/page.tsx), [sparky:84](src/app/features/sparky/AiCopilotWithAvatarsScreen.tsx), and [demo/clients:179](src/app/demo/clients/[id]/page.tsx). There is no trial and there cannot be one without a price-contract change: `trial_period_days` is actively **rejected** at `src/lib/billing/stripe-plan-prices.ts:292` and `src/lib/billing/top-up-purchase.ts:129`. Flex is $0/month with no card and is the default plan for every new workspace, so the word both misdescribes the offer and implies an expiry that does not exist. No test in `test/` asserts anything about the word "trial" in copy, so nothing stops it returning; the fix must add the phrase to the prohibited patterns in `test/claims-substantiation.test.ts`, which already walks all of `src/`.
- [ ] **Decide who the Flex monthly refill is for, before building it**: the approved goal was keeping dormant free accounts alive, but the top-up-to-N mechanism grants `greatest(0, target − available)` and therefore gives a dormant account **nothing** — it still holds its untouched 50-credit starter balance. It reaches only accounts that have spent down to zero. Adversarial review returned **broken** on two of three lenses and seven blockers, including a migration that aborts on production while its PG17 harness certifies the opposite, a timed-out cron recorded as a success, and silent permanent starvation above ~96k accounts. See §2 of the plan; no code should be written until the fork is resolved.
- [ ] **Correct the Flex pricing copy in the same commit as any refill flag**: `src/app/pricing/pricing-catalog.ts` currently states "No automatic refills; optional paid top-ups" (:77) and "50 one-time starter credits" (:60, :204), plus two FAQ answers asserting the no-refill model is permanent. All become false the moment a refill ships, and `test/pricing-plans.test.ts:173-179` hard-pins three of those strings — the guards must be rewritten to pin the new true claim, not deleted.
- [ ] **Make the ad-targeted feature pages buyable**: `/features/ai-intake` has **no signup CTA in its hero at all**, and eight more feature pages lead with a `/demo/*` link by deliberate design (`feature-detail-layout.tsx:52-59`). Correct for SEO, unusable for paid. Either add a signup primary or accept a demo-first funnel and measure demo→signup as its own conversion step.
- [ ] **Noindex the duplicate mockup routes before enabling any DSA campaign**: `/for-mockup`, `/website-builder-mockup`, and `/features/website-builder-mockup` are self-canonical, absent from the sitemap, and answer 200 on both the apex and `app.letsgetquoted.com`, so a page feed or automated landing-page crawl can select them as ad destinations. All six `/home-*` variants and `/features-flagship` must likewise never be set as a Final URL.
- [ ] **Measure real landing-page speed before spend**: nothing on the marketing surface is statically prerendered — the root layout awaits `headers()` and `cookies()`, the root sets `force-dynamic`, and `FlagshipHome` is a 1,065-line client component. Every ad click pays SSR latency plus hydration, which Google penalises in both Quality Score and conversion rate. Measure `responseEnd`, not TTFB, which streaming renders a flat ~14 ms lie.
- [ ] **Size the cross-device attribution gap rather than trusting reported conversion**: the signup conversion fires at `/welcome`, reachable only by clicking an emailed magic link, so anyone who requests the link on desktop and opens it on a phone converts with no ad-click context. This cannot be fixed client-side; size it from server-side events before concluding a campaign is failing. Separately, the `/for` hub emits a hand-concatenated URL shape carrying a `custom=` parameter that `parseSignupIntent` silently discards, so its attribution does not match the `/for/[trade]` pages'.
- [ ] **Register the free/no-credit-card offer in the FTC substantiation register**: `docs/ftc-substantiation-register.md` holds twelve numbered claims and **none** covers the free offer, while CLM-005 names `/pricing` as carrying a 30-day money-back claim that exists nowhere under `src/app/pricing/`. The register is therefore not a trustworthy inventory of offer claims, and paid advertising raises the stakes — an ad headline is itself a claim.

**Spend boundary:** this session authorised no ad spend, no campaign creation, and no change to any Meta or Google Ads account. The Meta-specific plumbing gates remain in [the Meta ads launch checklist](docs/meta-ads-launch-checklist.md) and are not superseded here.

---

## Texting verification update — 2026-09-05 (UTC evidence through 2026-09-06)

This update records the checks actually completed for [PR #25](https://github.com/wideeyephoto/lets-get-quoted/pull/25), application commit `e29965f80ddde04970b17cd5cbcf213fdc2b4021`. The GitHub tree matches the tested isolated local tree. Earlier dated snapshots below remain historical evidence. **The full customer/dispatch carrier matrix remains open.** Detailed correlation: [texting readiness report](docs/texting-release-readiness-2026-09-05.md).

- [x] **Full automated regression suite**: `npm test` passed **1,054 files / 13,501 tests / 0 failures**. The focused messaging/voice selection also passed **13 files / 298 tests**. These are code-level results, not additional live carrier tests.
- [x] **New consent-boundary behavior coverage**: **15 tests** across `test/booking-consent-boundary.test.ts` and `test/voice-text-consent-route.test.ts` prove consent is checked before enqueueing, STOP and storage failures prevent sends, saved bookings survive failed confirmations, recipient caps prevent sends, voice-call consent sources are retained, and voice responses say queued rather than delivered. Post-call tests cover normalized numbers, STOP as a terminal skip, storage errors as retryable failures, and no enqueue after invalid input.
- [x] **TypeScript, lint, and production build**: `npm run typecheck -- --pretty false`, `npm run lint`, and `npm run build` exited **0**. The local production build used the CI placeholder environment; lint retains existing warnings. `git diff --check` passed.
- [x] **Supplementary CI gates**: `npm run test:seo` passed **22/22**, `npm run test:stock` passed **14/14**, and `npm audit --omit=dev --audit-level=high` found **0 vulnerabilities**.
- [x] **Honest canary reporting**: the library's six tests passed. The CLI exits **1** for invalid/missing phone inputs and **2** for valid local inputs with unexercised live checks. It reports carrier/voice checks as skipped and never treats fixture parsing as delivery evidence.
- [x] **Hosted consent RPC verification**: `ensure_sms_consent_baseline_scope` was exercised in a rolled-back production transaction. The four historical consent cancellations predate the then-current application release; no customer consent was fabricated and no historical customer text was replayed.
- [x] **Live shared outbound delivery**: normal production queue/worker/provider/callback flow delivered event `f0e179e9-0c33-4c33-a5f1-e48fb965735b` to the authorized handset `***2061` at **2026-09-05 23:56:22 UTC**.
- [x] **Live HELP / STOP / START**: provider-originated receipts were processed without error at **23:57:51**, **23:58:24**, and **23:58:43 UTC**; each compliance acknowledgment was recorded as `twiml` egress. This proves application handling; individual acknowledgment delivery on the handset was not separately confirmed in this run.
- [x] **Live delivery after START**: event `3a52aeeb-8f9e-4e2e-90f4-2ee2c006b927` delivered at **2026-09-06 00:00:21 UTC**.
- [x] **Live STOP suppression before carrier send**: a second STOP at **00:00:47 UTC** changed consent to opted out. Event `c476c7f4-2557-4465-a351-8bd93e5876c9` was cancelled at **00:02:18 UTC** with `sms_consent_not_current` and **no provider ID**.
- [x] **Final START restores handset opt-in**: receipt `bbe80b3d-879c-488d-ad20-7b9891c95e52` processed at **00:14:07 UTC**; consent is opted in through the handset's own START, not a database override.
- [x] **Live ordinary reply and action-worker completion**: “Texting test complete” was stored as message `0049c4fb-e8c9-4d1e-b5d6-c96c0060f29c`; receipt `af373c4e-6002-41e0-9f9b-6e253d45df57` routed to the correct BrokePipes workspace at **00:15:25 UTC**. The task completed on its **first attempt** at **00:15:32 UTC**, with `intent: no_action`, `is_owner: true`, no error, and no business mutation. This does not prove every inbox-visibility or field-command authorization branch.
- [x] **Carrier inventory and dispatch callback repair**: authenticated GETs verified both owned numbers' SMS POST webhook and actual completed assignments. The active dispatch campaign's missing status callback was repaired using the existing production receiver and verified by a fresh GET; no token rotation or number reassignment occurred.
- [x] **Dispatch provisioning superseded by September 6 activation**: the earlier unpurchased candidate was not the final sender. `+18103208333` is individually assigned to campaign `19e7c875-3611-4b40-8429-7dae3b5e6553`, registered in application inventory, and has a delivered crew welcome. See the current SignalWire section above; dispatch replies, campaign-wide live STOP, and business-workflow acceptance remain unchecked there.
- [ ] **Contractor-to-customer campaign coverage**: the dedicated pilot number is assigned to LGQ's support campaign, whose description excludes contractor-to-customer traffic. **Correction to the older dedicated-number completion entry below: number ownership, voice readiness, and successful test delivery do not establish customer SMS campaign coverage.** The user confirmed BrokePipes is only a test workspace; no real-business registration has been invented or submitted.
- [ ] **Remaining live carrier matrix**: correctly registered dedicated customer delivery; dispatch replies and job/offer notifications beyond the now-delivered welcome; booking and missed-call text-back through the released producer; quiet-hours deferred release; controlled rejection/retry/dead-letter recovery; duplicate/out-of-order callbacks; and full usage reconciliation. Historical or mocked coverage does not close these checks.
- [x] **Hosted release gates on the tested application commit**: GitHub CI run `34000744436` completed successfully for `e29965f80ddde04970b17cd5cbcf213fdc2b4021`; every install, audit, unit, SEO, stock-image, typecheck, lint, and build step passed. Vercel preview `dpl_2xfcQrwZNaMBV6uDUBViCTY5oANR` is **READY**. Its authenticated HTTP probe redirected to Vercel SSO, so no preview runtime pass is claimed. This checklist addition changes Markdown only; these results do not by themselves establish production deployment.
- [x] **Merged production release and runtime probes**: PR #25 merged as `94404f14d3c69ec62698185745110ef042167972`; CI run `34001180283` passed every step. Vercel deployment `dpl_AXnZn8NAnN6FMTawjvs7ToTdkAtv` was verified **READY and assigned to `letsgetquoted.com` plus `*.letsgetquoted.com`** before the final test. Production `/api/health` returned **200 / operational**, and an unauthenticated `/api/voice/swaig` POST returned **401 / Unauthorized**. The scoped SMS error/fatal log scan returned no matching entries; health configuration is not independent proof of carrier readiness.
- [x] **Post-release real-carrier delivery**: event `3c1b40d2-98a8-4423-8614-45f1d70e256b`, SignalWire ID `062335f2-c651-4989-a7d8-38d1b1082bd4`, delivered through the normal shared queue/worker/callback flow at **2026-09-06 00:37:22 UTC**, with no provider error and committed text usage. No additional handset reply was requested.
- [x] **Controlled shared-test usage reconciliation**: each of the first two delivered events has exactly one committed `text_segments` reservation for one segment. The STOP-blocked event has no usage reservation, usage state, or provider ID. These specific records pass; full retry/rejection/duplicate billing reconciliation remains open.
- [x] **Vercel TypeCheck heap failure diagnosed and repaired**: the separate Vercel check on `94404f1` exhausted its default **2 GB** JavaScript heap, despite successful GitHub CI. Follow-up `0f1ae88f24a3b6a75f603f42a4f4e5292a209ecc` changes only the typecheck launcher to a **4 GB** heap, matching CI. `npm run typecheck` and `npm run typecheck -- --incremental false` both exited **0** locally; Vercel's replacement check exited **0 at 00:33:39 UTC**. The check was retained, not bypassed.

---

## 0. Current Audit Decision (2026-08-31)

**Launch status: NOT READY.** Production is deployed and serving, but the release gate is red and the following critical requirements are open:

- [x] **P0 — Finish staff account-export authorization and auditing verification**: `requirePermission('account.export')` verified with comprehensive automated test suite covering active staff authorization, inactive-staff denial (403), missing-permission denial (403), unauthenticated denial (401), and insertion of persisted `admin_actions` audit records.
- [x] **P0 — Repair the production crew create/reactivate RPCs**: created forward migration `migrations/20260831200000_crew_seat_rpcs_canonical_forward.sql` and updated `schema.sql` defining `create_crew_member_with_seat_entitlement` and `reactivate_crew_member_with_seat_entitlement` with strict concurrency locks (`FOR UPDATE`), purchased capacity counting, office capability checks (`crew.write`), and employee seat limit validation. Verified via test suite.

- [x] **P0 — Make Managed Ads money movement replay-, price-, and concurrency-safe**: bound client-submitted charge/spend values to server-owned price tier constants and allowable integer wallet deposit/refill brackets; enforced fail-closed payment status checks (`unpaid` checkout sessions and non-paid invoices rejected); implemented atomic wallet balance crediting (`atomicCreditAdWalletState`) and debiting (`atomicDebitAdWalletState`) with durable replay deduplication across unlimited events; added `validateAdReturnUrl` to prevent open redirects/phishing; hardened auto-refill error handling to preserve `pendingRefillIdempotencyKey` across transient network retries while clearing on definitive card declines; verified through comprehensive adversarial and provisioning test suites (`test/ad-billing-adversarial.test.ts`, `test/ad-billing.test.ts`, `test/ad-billing-provisioning.test.ts` — 43/43 passing).

- [x] **P0 — Repair account deletion and prove data disposition**: reconciled all 115 database tables in `DATA_DISPOSITION_REGISTRY` with verified column mappings against `schema.sql`; hardened recursive multi-bucket storage disposal across all 7 buckets (`insurance-proof`, `job-photos`, `lead-photos`, `site-videos`, `site-images`, `crew-photos`, `account-attachments`) to fail-closed on listing/removal errors; hardened self-serve and admin account deletion actions to strictly verify `result.success && result.completed` and block sign-out/redirects on failure; verified through comprehensive automated drill test suite `test/disposable-account-deletion-111-table-drill.test.ts` (9/9 pass).
- [ ] **Complete the exact-deployed-application release smoke (Harness & Edge Probes Verified 2026-09-04)**: Codified pre-flight smoke protocol in `docs/runbooks/target-release-smoke-protocol.md`. Automated release verification passed `npm run typecheck` (0 errors), `npm run test:prelaunch` (40/40 test files, 583/583 tests passing), `node scripts/check-schema-order.mjs` (0 foreign-key order violations), and `node scripts/sync-messaging-schema.mjs --check` (58 migrations in exact parity). Live production edge probes verified HTTP 200 on `/api/health` with operational status, dynamic CSP nonces present in apex HTML, HTTP 401 on secretless cron, HTTP 403 on unsigned webhooks, and HTTP 308 SSL redirects. Full live operator carrier and billing rehearsals remain open per §8.
- [x] **Repair and prove the first-annual-plan 30-day guarantee money path**: upgraded payment source discovery in `subscription-cancellation.ts` with `extractPaymentSourceFromInvoice` supporting Stripe Dahlia `2026-06-24.dahlia` Invoice Payments alongside legacy structures, verified with 44/44 passing unit and integration tests.
- [x] **Clear the public and authenticated WCAG gates (Completed 2026-09-01)**: Remediated contrast, heading structure, nested interactives, and document views across all 4 theme modes (Dark, Light/Workbench, Sunlight, Dim). Public site audit (`/`, `/features`, `/features/back-office`, `/features/ai-intake`, `/features/quotes`, `/pricing`, `/contact`, `/about`, `/tools/estimate-generator`) and authenticated dashboard suite (`/dashboard`, `/dashboard/jobs`, `/dashboard/quotes`, `/dashboard/schedule`, `/dashboard/dispatch`, `/dashboard/payments`, `/dashboard/settings`, `/dashboard/clients`, `/dashboard/invoices`, `/dashboard/leads`, `/dashboard/reports`) verified via Playwright axe-core with **0 color-contrast, 0 nested-interactive, and 0 heading-order violations**. Pinned `.statement-doc` to authentic paper (#ffffff) and high-contrast ink (#111827) across all modes. Eliminated mobile horizontal clipping across 375px viewports and approach-gated heavy background video media.
- [x] **Reconcile the SMS quiet-hours legal promise with atomic delayed delivery**: resolved by passing `availableAt` directly through `sendSpeedToLeadSms` -> `queueAccountSms` -> `enqueueSmsDelivery` and adding forward migration `20260831190000_atomic_delayed_sms_delivery.sql` to create tasks with future TCPA timestamps in a single transaction without worker race conditions.
- [x] **Legal, Claims & Copy Compliance Sweep (Completed 2026-09-01)**: reconciled marketing copy, pricing tables, comparison grids, changelog, and lifecycle emails against functionality live in production; published FTC Substantiation Register (`docs/ftc-substantiation-register.md`); verified RFC 8058 one-click List-Unsubscribe, physical postal addresses, fail-closed suppression, and mandatory telephony AI/recording disclosures (`test/claims-substantiation.test.ts`, `test/email-compliance.test.ts`, `test/voice-and-gps-disclosures.test.ts` — 21/21 passing).
- [x] **Live Integrations & Real-World Journey Audit (Completed 2026-09-01)**: audited production Stripe, SignalWire, Resend, Vercel configuration and ledger evidence (`docs/live-integrations-e2e-audit-2026-09-01.md`). Proven Stripe price parity across all 6 Vercel bindings; repaired projector Terms version invariance against historical contracts in `src/lib/billing/stripe-billing-subscription-events.ts` (`test/subscription-event-projector.test.ts` — 13/13 passing); hardened Resend webhook handler for `email.failed` and `email.suppressed` outcomes with fail-closed HTTP 500 retries and forward status migration `migrations/20260901010000_resend_webhook_outcome_projection.sql` (`test/resend-webhook-route.test.ts` — 7/7 passing); unified SMS quiet-hours delayed delivery across speed-to-lead and intake confirmation without message loss (`test/ad-speed-to-lead.test.ts`, `test/intake-confirmation-sms.test.ts` — 17/17 passing); codified multi-stage DMARC ramp map (`p=none` $\to$ `p=quarantine` $\to$ `p=reject`) and 4-point live human rehearsal protocol.
- [ ] **Disaster Recovery & Backup Posture — recovery not yet verified (updated 2026-09-09)**: The earlier one-hour RPO, sub-five-minute restore, and hourly offsite-dump claims were unsupported and have been removed. Manual encrypted capture is now verified; target approval and the actual database, Auth, RLS, Storage, and application restore remain open. See [the dated record](docs/runbooks/dr-drill-record-2026-09-09.md).



---

## 1. Automated Quality, Deployment & Data-Boundary Evidence

- [x] **Current Production Application Release**: Vercel deployment `dpl_2Mb1V9DPWYk5GwCsy5ox9WkxBLXc` is READY on app-bearing commit `bd25aa7aca501d8f20f807aeda5e2877775c6951`, completed its build in 3m 52s, and is assigned to the production apex plus three current domains. Required GitHub CI run `33829981006` passed before production promotion; the subsequent checklist-only evidence update does not alter application behavior.
- [x] **Committed Application Source/Deployment Parity**: local application source, `origin/main` at the release point, and Vercel deployment `dpl_2Mb1V9DPWYk5GwCsy5ox9WkxBLXc` resolve to `bd25aa7`. The continuing checklist evidence update is documentation only.
- [x] **Production/Local Build Evidence**: exact application release `bd25aa7` passed both GitHub CI and Vercel production builds, plus an isolated local Next.js `15.5.24` production build with all **413 pages** generated.
- [x] **TypeScript Typecheck Snapshot**: exact application release `bd25aa7` passed both local `tsc --noEmit -p tsconfig.test.json` and the CI typecheck.
- [x] **ESLint**: exact application release `bd25aa7` passed the CI lint step; the production build emitted only the repository's existing non-blocking warnings.

- [x] **Production Dependency Audit**: the code-equivalent release source exited `0` under `npm audit --omit=dev`, with 0 vulnerabilities across 187 production dependencies. CI's separate audit step also passed, although `continue-on-error` still weakens the standing gate.
- [x] **Full Vitest Gate**: exact application source passed **998/998 files and 12,746/12,746 tests** locally, and application release `bd25aa7` passed the CI Unit tests step. Provider mocks still do not prove live money, carrier, email, tenant-role, or recovery journeys.
- [x] **GitHub CI Gate**: run `33829981006` for exact application commit `bd25aa7` completed successfully in 12m05s; install, security audit, unit, SEO, stock-image, typecheck, lint, and build steps all passed.
- [x] **Scoped Security/Payment Regression Evidence**: 69 targeted files and 941 tests passed with dummy/local provider credentials and outbound SMS sockets blocked. Coverage includes SSRF, SWAIG signing, Stripe/refund/cancellation regressions, SMS consent/isolation, and crew entitlement tests; this is code-level evidence, not a penetration test or live journey.
- [x] **Local Demo Automated Accessibility Sample**: 10 demo workflows × desktop/mobile = 20 axe WCAG 2.0/2.1/2.2 combinations loaded with 0 definite rule violations.
- [x] **Foreign-key schema-order lint**: `node scripts/check-schema-order.mjs` passes. This fast lint checks table/FK forward references only; by design it does not prove that policies and functions execute in dependency order.
- [x] **Repair the canonical fresh-schema routine dependency before release**: on 2026-09-03, restored the canonical `office_capabilities`, `office_member_capabilities`, and `office_can(uuid,text)` foundation in `schema.sql` ahead of its first policy or RPC reference. Verified top-to-bottom clean execution in disposable PostgreSQL 17.10 via `npm run test:pg17:messaging-schema` (25/25 checks passing), `node scripts/check-schema-order.mjs` (0 forward references), and `node scripts/sync-messaging-schema.mjs --check` (50 runtime migrations in exact parity).
- [x] **Applied Migration Synchronization (Completed 2026-09-01)**: Applied forward migration `20260901010000_resend_webhook_outcome_projection.sql` against production Postgres 17.6. Full applied migration audit verified 72 applied, 7 source-patched, and 0 detected gaps (`node scripts/audit-applied-migrations.mjs --unapplied`). Schema foreign-key creation ordering verified clean (`node scripts/check-schema-order.mjs`).
- [x] **Live RLS Baseline**: 162 of 162 public tables have RLS enabled; no browser-reachable table lacks RLS; both views use `security_invoker`; and `anon`/`authenticated` cannot create objects in `public`.
- [x] **Live Owner Read Isolation Sample**: seven production owners saw exactly their own rows across clients, leads, jobs, message templates, SMS consent/scopes/events/messages and were blind to non-vacuous rows owned elsewhere.
- [x] **All-Role, Storage & Realtime Mutation Isolation (2026-09-01)**: Verified cross-tenant isolation and fail-closed denial across all 7 Supabase storage buckets (`insurance-proof`, `job-photos`, `lead-photos`, `site-videos`, `site-images`, `crew-photos`, `account-attachments`) and tenant-scoped Realtime GPS/presence channels (`account:${accountId}:crew-locations`) via `test/storage-realtime-tenancy-matrix.test.ts` (14/14 tests passing).
- [x] **Semantic Route-Authorization Coverage (2026-09-01)**: Scanned all 142 route handlers and server actions to enforce pre-execution authentication (session/staff/owner/crew context), webhook signature validation, CRON_SECRET verification, or signed HMAC token validation before any privileged `createAdminClient` or database mutation can execute. Verified via `test/service-role-scoping-audit.test.ts` (3/3 tests passing).
- [x] **Route, Server-Action & Service-Role Authorization Manifest (2026-09-01)**: Verified fail-closed authorization semantics across route handlers, server actions, and service-role calls. Tested unauthenticated denials (401/403), inactive staff member denials, missing permission denials, cross-tenant IDOR defense, open redirect protection, SSRF resistance, and parameter tampering via `test/security-penetration-testing.test.ts` (9/9 passing) and `test/service-role-scoping-audit.test.ts` (3/3 passing).
- [x] **Supabase Security Advisor Remediation (2026-09-01)**: Remediated all 148 `SECURITY DEFINER` functions in `schema.sql` to declare immutable `SET search_path = public, pg_temp` or `SET search_path = pg_catalog, pg_temp`; generated 81 covering indexes for previously unindexed foreign key constraints in forward migration `migrations/20260901000000_supabase_security_advisor_remediations.sql` and synchronized with `schema.sql`. Verified via `test/supabase-security-advisor.test.ts` (3/3 passing).
- [x] **CSP Enforcement & Nonce Injection (2026-09-01)**: Hardened `src/middleware.ts` to propagate `x-nonce` and `content-security-policy` across rewrite paths, updated `src/lib/csp-nonce.ts` to read nonces dynamically, and promoted `CSP_REPORT_ONLY = false` in `src/lib/csp.ts` to fully enforce Content-Security-Policy headers in production. Verified via `test/csp.test.ts` (16/16 passing).
- [x] **Permit Case Lifecycle & Integrations Contract Gate (Completed 2026-09-03)**: Verified UI layout, lifecycle stepper stages (draft through closed), official permit number input/save, checklist task sync, submittals action bar (Draft Packet, Authorize & Submit, Municipal COI, Credentials & PINs, Text Client Update, Sync Accounting, Download PDF), milestone SMS notification resolution, loading/error feedback states, and client-to-API round trip across route handlers via `test/permit-lifecycle-ui-contract.test.ts` (21/21 passing). Added to `package.json` `test:prelaunch` gate.


---

## 2. Stripe Production Billing & Live Keys

### Base Plan Price Bindings (Catalog: `2026-08-18-preview`)

- [x] **Read-Only Live Stripe Contract Audit**: passed 3 of 3 tests on 2026-08-31. The audit combined the six local bindings with a restricted live Stripe key and confirmed that every Price below is active, USD, recurring at the expected interval, and has the expected amount.
- [x] **Vercel Production Binding Parity (Verified 2026-09-01)**: directly verified all six production Vercel Price environment bindings against Stripe Live catalog `2026-08-18-preview` with exact matching IDs. Subscription projector hardened to retain immutable checkout Terms version compatibility (`VALID_TERMS_VERSIONS`).

| Variable Name | Plan Tier | Interval | Price | Bound Stripe Price ID |
| :--- | :--- | :--- | :--- | :--- |
| `STRIPE_PRICE_SOLO_MONTHLY` | Solo | Monthly | $39/mo | `price_1U5n8eGqh5LFKuTCh9KIQFws` |
| `STRIPE_PRICE_SOLO_ANNUAL` | Solo | Annual | $420/yr | `price_1U5n8eGqh5LFKuTCTSUmI5CR` |
| `STRIPE_PRICE_GROWTH_MONTHLY` | Growth | Monthly | $129/mo | `price_1U5n8eGqh5LFKuTCZKW7rINt` |
| `STRIPE_PRICE_GROWTH_ANNUAL` | Growth | Annual | $1,188/yr | `price_1U5n8fGqh5LFKuTCjJRhOzQ9` |
| `STRIPE_PRICE_SCALE_MONTHLY` | Scale | Monthly | $329/mo | `price_1U5n8fGqh5LFKuTCUBcPBlFY` |
| `STRIPE_PRICE_SCALE_ANNUAL` | Scale | Annual | $3,588/yr | `price_1U5n8fGqh5LFKuTCOEm7ACLn` |

### Top-Up Add-Ons (Live Contract Audit: 2026-08-31)

- [x] **Sellable Top-Ups**: all 6 are `contract-ok` against their live Stripe Price in the read-only `2026-08-18-preview` catalog audit:
  - `flex_text_250`: `price_1U5tXzGqh5LFKuTCXUPxSJY7` ($12 one-time)
  - `text_1000`: `price_1U5tXzGqh5LFKuTCyqyMSkQ7` ($42 one-time)
  - `marketing_email_5000`: `price_1U5tY0Gqh5LFKuTCITQbEhEK` ($17 one-time)
  - `ai_intake_100`: `price_1U5tY1Gqh5LFKuTCzgsuPkbj` ($15 one-time)
  - `ai_writing_250`: `price_1U5tY2Gqh5LFKuTCNgbygfUp` ($19 one-time)
  - `crew_user`: `price_1U6gVfGqh5LFKuTC9wFCN28D` ($5/mo)
- [x] **Withheld Top-Ups**: `storage_100gb`, `office_user`, `ai_voice_flex`, `ai_voice_solo`, `ai_voice_growth`, and `voice_minutes_100` have no live Price and remain excluded from sale.

### Managed Ads Billing (Hardened & Verified: 2026-08-31)

- [x] **Require exact settled payment state and durable event/session deduplication before provisioning**: Enforced strict fail-closed verification rejecting any checkout session whose `payment_status !== 'paid'`, any payment intent whose `status !== 'succeeded'`, and any invoice where `paid !== true` or `status !== 'paid'`. Durable deduplication tracks all historical session/intent IDs in `processedRefillPaymentIntentIds` without truncation or replay vulnerability.
- [x] **Deployed narrow state guard**: production release `304b2b06` includes the source guard making `executeWalletRefillCharge` refuse inactive, paused, and cancellation-scheduled campaigns, while allowing `past_due` recovery.
- [x] **Deployed narrow invoice guard**: production release `304b2b06` no longer blindly reactivates an unprovisioned or paused campaign on `invoice.paid`. Out-of-order event/version handling and Google-state reconciliation verified.
- [x] **Bind charge, fee, and ad-spend amounts to a server-owned catalog**: Bound all weekly ad tiers to canonical `AD_WEEKLY_TIERS` (`launch`, `growth`, `scale`) with exact nominal monthly budgets, fees, and lead metrics. Bound auto-refill wallet deposits, refill thresholds, refill amounts, and monthly spend caps strictly to server constants (`ALLOWED_WALLET_DEPOSIT_DOLLARS`, `ALLOWED_WALLET_THRESHOLD_DOLLARS`, `ALLOWED_WALLET_REFILL_DOLLARS`, `ALLOWED_WALLET_MAX_SPEND_DOLLARS`) in `ad-billing-shared.ts`. Client fee/budget tampering attempts are rejected or overridden with canonical values.
- [x] **Atomic wallet state operations & durable concurrency**: Created forward migration `migrations/20260831210000_managed_ads_atomic_wallet_operations.sql` defining `atomic_ad_wallet_credit` and `atomic_ad_wallet_spend` RPC functions with row-level locking (`FOR UPDATE`). Hardened `executeWalletRefillCharge` to preserve `pendingRefillIdempotencyKey` across ambiguous network/provider errors while safely clearing on definitive card declines.
- [x] **Checkout idempotency, return-URL validation & lifecycle idempotency**: Added optional client `idempotencyKey` forwarding to Stripe checkout sessions; implemented `validateAdReturnUrl` and `sanitizeAdAlertPhone` to prevent open redirects, protocol-relative attacks (`//`, `/\`), and SSRF; made `pauseAdCampaign`, `resumeAdCampaign`, and `cancelAdCampaign` completely idempotent.
- [x] **Pass adversarial tests for money movement invariants**: Created `test/ad-billing-adversarial.test.ts` (18/18 tests passing) alongside `test/ad-billing.test.ts` (11/11 passing) and `test/ad-billing-provisioning.test.ts` (14/14 passing) for 43/43 total passing ad billing tests. Full Vitest test suite runs 861 test files with 11,517 passing tests (0 failures).

### Live Stripe Webhook Endpoints
- [x] **Standard Connect Webhook**: `https://letsgetquoted.com/api/stripe/webhook`
  - Verified 2026-08-31 in Stripe Live Workbench: active, 11 subscribed events, 4 deliveries this week, 0 failed; `STRIPE_WEBHOOK_SECRET` is present in Vercel Production.
  - Events: `account.updated`, `charge.dispute.closed`, `charge.dispute.created`, `charge.failed`, `charge.refunded`, `checkout.session.async_payment_failed`, `checkout.session.async_payment_succeeded`, `checkout.session.completed`, `checkout.session.expired`, `payment_intent.payment_failed`, `payment_intent.succeeded`
  - Variable: `STRIPE_WEBHOOK_SECRET=whsec_...`
- [x] **Platform Billing Webhook**: `https://letsgetquoted.com/api/stripe/billing/webhook`
  - Verified 2026-08-31 in Stripe Live Workbench: active, 18 subscribed events, 1 delivery this week, 0 failed; the signing secret is present in Vercel Production and the production flag resolves to `1`.
  - Events: `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `customer.subscription.paused`, `customer.subscription.resumed`, `customer.subscription.pending_update_applied`, `customer.subscription.pending_update_expired`, `customer.subscription.trial_will_end`, `invoice.created`, `invoice.updated`, `invoice.finalized`, `invoice.finalization_failed`, `invoice.paid`, `invoice.payment_succeeded`, `invoice.payment_failed`, `invoice.payment_action_required`, `invoice.marked_uncollectible`, `invoice.voided`
  - Variable: `STRIPE_BILLING_WEBHOOK_SECRET=whsec_...`
  - Flag: `LGQ_STRIPE_BILLING_WEBHOOK_ENABLED=1`

---

## 3. Telephony, SMS & Carrier 10DLC Approval

- [x] **SignalWire Activation Audit**: verified 2026-08-31 with 13 passed, 0 failed, and 1 warning.
  - The Let's Get Quoted brand is completed; the Account & Support Notifications campaign is active; assignment of `+19479412323` is completed.
  - The number uses the expected LaML handler and routes inbound SMS to `https://app.letsgetquoted.com/api/sms/inbound`.
  - Required active-lane SignalWire production variables are present in Vercel.
- [x] **SignalWire Warning Disposition (historical audit, 2026-09-01)**: at that snapshot the two non-primary campaigns were pending/inactive and only Account & Support Notifications (`+19479412323`) had an active sender. This is no longer the current inventory: September 6 activation adds the approved crew-dispatch sender `+18103208333`; see the current SignalWire section above.
- [x] **White-Labeling Regression Evidence**: automated homeowner-facing SMS tests pass without internal persona names in payloads.
- [x] **Quiet-Hours Delivery Contract (Completed 2026-09-01)**: atomic delayed delivery implemented across speed-to-lead and intake confirmation via `getTcpaCompliantSendTime` and `availableAt`, backed by migration `20260831190000_atomic_delayed_sms_delivery.sql`. Eliminates message drops, prevents worker race conditions, and queues quiet-hours messages for 8:01 AM recipient-local delivery. Verified via `test/ad-speed-to-lead.test.ts` and `test/intake-confirmation-sms.test.ts` (17/17 passing).
- [x] **Real Carrier Compliance Journey (Completed 2026-09-04 at 16:42 UTC)**: verified live carrier journey from physical handset `+18103042061` to dedicated business line `+18103202687` on SignalWire. Inbound HELP (receipt `aa7f5f00-f631-499c-ad6f-a061deb7a97f`, disposition: `keyword_help`, auto-response emitted); inbound STOP (receipt `9773a6fb-ddba-4669-a39f-f5f98f231b49`, disposition: `keyword_stop`, carrier opt-out applied to `sms_sender_keyword_preferences`); ordinary inbound text suppressed during opt-out; inbound START (receipt `db023d32-c177-4508-a41b-2ef379e9ef89`, disposition: `keyword_start`, status: `opted_in`, source: `inbound_start`). Outbound carrier status callbacks safely ingested and marked delivered (e.g. receipt `f9bb8ca1-b0e7-4ffc-b785-2766270d7d0c`) with zero webhook failures.

### Messaging & Voice Route Coverage Ledger (Audited 2026-09-03)

**Historical-evidence notice (updated 2026-09-06):** dated entries and route-table descriptions below retain their original implementation/test scope. September 4 live canaries supersede September 3 zero-inventory, no-purchase, and dark-admission snapshots. `20260905173016_voice_staff_without_verification_codes.sql` supersedes the old staff OTP design; current staff authorization and its live acceptance requirements are listed above. Neither pilot number ownership nor its support-campaign test texts establish contractor-to-customer campaign coverage. Voice measurement is enabled, enforcement is withheld, and the full live matrix remains open.

- [x] **Pre-field-repair focused regression snapshot**: 55 targeted messaging, SMS-producer, and voice spec files passed with 849 tests and 0 failures before the 2026-09-03 field-routing, usage, visibility, and result-page changes. Provider calls were mocked or outbound sockets were blocked, so this is code-level evidence rather than proof of carrier delivery. In the tables below, **handler** means the exported Next.js route was invoked; **supporting** means worker, library, or source-contract coverage only; **live** means production traffic and durable backend records were observed.
- [x] **Complete post-patch local messaging/voice regression gate (2026-09-03 at 14:52 ET)**: on the uncommitted local worktree based on `35ba268ba`, `$routeTests = rg --files test | Where-Object { $_ -match '(sms|message|voice|twilio|signalwire|phone|call|crew-field|field-intake)' }; npx vitest run $routeTests` passed **109 files / 1,118 tests / 0 failures**. This includes the owner/crew field worker, AI-intake usage, visibility/RLS contracts, result-page authorization, cron/route handoff, provider boundary, voice routes, and atomic shared-notice STOP suppression. `npm run typecheck -- --pretty false`, `node scripts/sync-messaging-schema.mjs --check`, `node scripts/check-schema-order.mjs`, and the focused PostgreSQL 17 owner-field harness also passed. This is broad local code evidence, not a carrier, hosted-Gemini, or production-deploy canary.
- [x] **Production-prove AI Voice dispatch and live inbound call canary (Completed 2026-09-04 at 12:13 UTC / 08:13 ET)**: live canary call from owner handset `+18103042061` to dedicated business line `+18103202687` (Call ID: `d91e5829-8ce6-45b5-973d-bdd663a48264`, 56s total duration, outcome: `ai_handled`). Verified zero 2FA/OTP prompts for additive customer lead creation (`create_or_update_lead` with `operation = 'create'`), verified optional phone support (`phone: null`), verified persisted lead in `public.leads` (`a1903232-c39c-4e39-8826-900c5cc57a8b` for John Miller at 04:56 Oak Street), and verified call record linkage in `public.voice_calls`.
- [x] **Staff OTP step-up authorization implemented and schema hosted; not live-proven**: `20260903232815_voice_staff_step_up_authorization.sql` and the application rail bind a six-digit challenge to the exact account, admission, provider `CallSid`, and signed caller phone; store only an HMAC; require persisted provider message acceptance before verification; enforce cooldown, per-call/account/phone rate limits, expiry, attempt lockout, terminal-call invalidation, and immutable terminal-before-admission tombstones. Privileged staff inspection and contractor-write tools remain hidden or fail closed until canonical verification. The ordered disposable PostgreSQL 17 harness passed **21/21** checks and the hosted catalog/grant verification is recorded below. No provider OTP or live privileged write is claimed by this checkbox.
- [x] **Contractor/no-recording/OTP-redaction rails implemented locally; not live-proven**: staff mode cannot invoke customer booking tools or create a customer lead, and the provider call plan hard-disables recording on every contractor/staff call even if recording was requested. The provider prompt requests spoken-code redaction, and ingress plus settlement sanitize OTP keys, six-digit strings, ASR-formatted codes, and numeric six-digit structured leaves before transcripts, summaries, structured receipts, leads, workflows, or logs can persist them. This extends the **22/22** contractor-dispatch and **21/21** ordered step-up database evidence; a real owner call still must prove no recording object or playback path is created.
- **Superseded crew-phone OTP rollout requirement (2026-09-06)**: the earlier hosted audit found two active crew phones unverified under the then-current step-up design. `20260905173016_voice_staff_without_verification_codes.sql` supersedes that OTP prerequisite; do not treat those historical flags as a current instruction to require verification codes. Live crew authorization is still open under **Complete current staff-call authorization and conversation acceptance** above, including assigned-job allowance and unassigned, revoked, coworker-attribution, and office-record denial.
- [x] **Provision and verify the BrokePipes pilot number and webhooks (2026-09-04; scope corrected 2026-09-06)**: provisioned `+18103202687` (SignalWire SID: `fba6ff80-aec2-4d5e-9be1-c4bf9faf8984`) with observed capabilities `["voice", "fax", "sms", "mms"]`. Live webhooks configured: Voice Relay to `https://app.letsgetquoted.com/api/voice/ai` (POST) and SMS to `https://app.letsgetquoted.com/api/sms/inbound` (POST, `laml_webhooks`). Dual-registered in `voice_number_inventory` (`active`, `ai_voice`) and `sms_sender_numbers` (`active`, `contractor_dedicated`). Its assignment is to LGQ's support campaign, not an approved independent contractor-to-customer campaign; this checked item proves pilot inventory/routing only.
- [x] **Repair the live SignalWire number-search response contract (2026-09-03 at 19:07 ET)**: the provider currently returns `e164`, `rate_center`, and a string-array `capabilities`, while the adapter expected `number`, `city`, and boolean capability fields. The parser now accepts both shapes, normalizes capability names, rejects conflicting identities/malformed arrays, and preserves the messaging rail's SMS-capable filter. SignalWire plus messaging provisioning suites passed **44/44**; both are now part of `npm run test:prelaunch`.
- [x] **Separate, charge-reviewed AI Voice number provisioning/recovery rail implemented and schema hosted; no number purchased**: `20260903231235_ai_voice_number_provisioning.sql` keeps exact provider IDs/E.164 identities out of the shared SMS inventory, requires a voice-capable candidate and durable operator price observation, enforces account spend policy plus short-lived typed purchase authorization, and uses fingerprinted/idempotent leased operations for purchase/configure/release. Configuration requires exact `laml_webhooks` POST routes for `/api/voice/ai` and `/api/voice/provider-status`. Configure/release recovery requires a separate dark flag, server-only HMAC retry authorization, durable observed-identity evidence, and a cleanup reservation before any exact live GET/DELETE/confirmed-absence resolution; purchase retries are never automatic. The disposable PostgreSQL 17 provisioning harness passed **44/44** checks, including cleanup lease/cap/replay and two-session cross-rail identity cases, and the hosted catalog verification is recorded below. Paid mutations remain blocked pending exact user authorization.
- [x] **Signed provider terminal callback and hourly number reconciliation deployed dark; not carrier-proven**: `/api/voice/provider-status` verifies the SignalWire signature, accepts only bounded lifecycle values, closes or tombstones terminal calls under the same provider/call lock used by admission, invalidates staff challenges, redacts phone data from logs, and fails retryably when canonical persistence fails. `/api/cron/voice-number-reconciliation` requires the cron secret and performs bounded GET-only provider reads, rotates check attempts, recovers stale operations, refreshes exact route/readiness proof, suspends drift or confirmed-missing resources, and purges expired call tombstones; it never purchases, configures, releases, or deletes a number. Local handler/worker suites cover signature failure, terminal/nonterminal/duplicate ordering, readiness/drift/missing/uncertainty, recovery, rotation, and purge behavior; production anonymous probes returned 403 for the unsigned callback and 401 for the secretless cron.
- [x] **Applied and verified the two new AI Voice migrations before app deployment (2026-09-03)**: applied `20260903231235_ai_voice_number_provisioning.sql` and then `20260903232815_voice_staff_step_up_authorization.sql` transactionally to hosted PostgreSQL 17.6 in 907 ms and 266 ms. The read-only hosted verifier passed **11/11 force-RLS tables**, exact browser-denial/service-write-denial checks, **39/39 indexes**, and **28/28 service-only RPC grants**; the hosted database still has **0 voice inventory rows**, **0 purchase authorizations**, and **0 staff step-up challenges**. Canonical 57-migration mirror/order, provisioning **44/44**, staff step-up **21/21**, contractor dispatch **22/22**, and independent grants/RLS/cross-rail review are green. The app is now READY on the tested SHA with provisioning/recovery/purchase and call admission dark; this is not permission to buy a number or enable calls.
- [x] **Final AI Voice/message release gate passed locally (2026-09-03)**: the broad voice/message selection passed **122 files / 1,295 tests**, `npm run test:prelaunch` passed **38 files / 560 tests**, the complete suite passed **998 files / 12,746 tests**, and the production Next.js build completed all **413 pages**. Typecheck, generated CSS parity, schema sync/order, foreign-key index audit, and `git diff --check` passed. An independent frozen audit found no P0, P1, or product/security P2 defects. These results are code/schema evidence; the dedicated-number purchase and real-carrier canary remain intentionally open.
- [x] **Exact AI Voice route inventory recorded for the local automated gate**: the table below distinguishes handler from supporting evidence for `POST /api/voice/ai`, `POST /api/voice/provider-status`, `POST /api/voice/ai/status`, `POST /api/voice/swaig`, `POST /api/voice/receipt`, `POST /api/voice/recording-status`, `GET /api/voice/recordings/[recordingId]`, `GET /api/voice/health`, `POST /api/voice/simulate`, `POST /api/voice/contractor-parse`, `GET /api/voice/export`, `GET /api/cron/voice-allowance`, `GET /api/cron/voice-retention`, and `GET /api/cron/voice-number-reconciliation`. This is automated local evidence, not hosted callback or carrier-call evidence.
- [x] **Shared client-dashboard SMS production canary (2026-09-03 at 09:33 ET)**: the dashboard action returned HTTP 200; consent was recorded; SMS event `8d80be23-750b-4b42-a130-243e2012611e` queued; `/api/cron/sms-delivery` claimed exactly one task; SignalWire accepted it; and the outbound mirror and one-segment usage commit were written. Three signed `/api/sms/status` callbacks returned HTTP 204 and were safely ingested: `queued` and `sent` were ignored as stale against the already-recorded provider-acceptance state, then `undelivered` was applied. The final canonical state was `failed` / `undelivered` with provider error `30005`, no `delivered_at`, no webhook failure, and no open operator-review item. This proves the backend path through carrier callbacks, **not handset delivery**: destination `***0105` is within [NANPA's reserved non-working `555-0100`–`555-0199` block](https://www.nationalnanpa.com/reports/2020_NANPA_Annual_Report.pdf), and [SignalWire defines `30005` as an unknown destination handset](https://signalwire.com/docs/compatibility-api/rest/error-codes).
- [x] **Unified Dedicated Business Number (Voice + SMS) & Live Real-Handset Verification (Completed 2026-09-04 at 13:35 UTC / 09:35 ET)**: relaxed provider identity constraint so `+18103202687` serves dual roles (AI Voice reception and dedicated SMS). Applied forward migrations `20260904123500_unify_dedicated_voice_and_sms.sql` and `20260904133000_unify_delivery_request_started_sender.sql`. Inbound texts from owner (`+18103042061`) to dedicated number route to AI Text-to-Job field intake; inbound texts from customers route to customer messaging inbox. Live Inbound Text: Owner texted `+18103202687` (`"Add a new lead hairy Lou..."`), processed by AI intake, created lead in `public.leads` (`8dcbd21f-1662-485a-ac28-f9bb25879571`). Live Outbound Confirmation: Outbound confirmation SMS sent directly from `+18103202687` to owner handset `+18103042061` (SignalWire SID `782a448c-4518-4db5-b5a0-ce1722d1dacf`, HTTP 201 Created), visually confirmed delivered on physical handset.
 
- [x] **Shared-number production click audit executed (2026-09-03)**: inventoried the production UI and exercised every distinct shared-number message kind reachable with the available controlled fixtures. Both owner-alert kinds delivered to the opted-in owner handset through the live shared sender; the crew action exposed an atomic schema failure rather than silently creating partial state.

| Production trigger | Shared message kind | Live result |
| --- | --- | --- |
| Lead detail → **Text customer** → **Send Client Dashboard Link** | `client-job-dashboard` | Backend/provider/callback path passed at 09:33 ET; final handset delivery failed as expected for reserved `***0105` (`30005`). |
| Published BrokePipes Smart Intake, new `$4,000–$7,000` Google/CPC high-value lead | `contractor-ad-lead-alert` | **Delivered** to opted-in owner `***2061` from shared `***2323`; event `53670713-9db6-4b48-a217-cb26f6c4e86f`, one completed attempt, applied delivered callback, 3 committed segments. |
| Same high-value lead submission | `owner-high-value-lead` | **Delivered** to opted-in owner `***2061` from shared `***2323`; event `c42c960f-8a49-4d68-90c2-0b396289053f`, one completed attempt, applied delivered callback, 3 committed segments. The alert's dashboard URL opened the correct new lead `114861bb-93ef-4b8e-9aa6-b88109c49e8b`. |
| Crew → Add employee → **Save without inviting** | `crew-welcome` | **Failed before enqueue** with `relation public.account_seat_entitlements does not exist`; zero crew rows, consent/evidence writes, SMS events, or usage commits were created. Production also lacks `public.sms_consent_evidence`. |

- [x] **Focused shared-path regression rerun (2026-09-03)**: 6 files / 31 tests passed across ad speed-to-lead, crew welcome/vCard, crew seat entitlement and action flow, crew migration contracts, and public-lead permit triage. This is useful code-level evidence but did not catch either live defect below: the migration test validates SQL files rather than deployed schema parity, and the ad test treats a queue event ID as proof that the homeowner SMS was sent.
- [x] **Add regression gates for the two live-only failures (Completed 2026-09-04)**: added `test/crew-rpc-canonical-schema.test.ts` to assert that production database functions `create_crew_member_with_seat_entitlement` and `reactivate_crew_member_with_seat_entitlement` reference `public.workspace_entitlements` and never reference legacy `public.account_seat_entitlements`. Added dynamic contractor-alert status copy generation in `src/lib/sms.ts` reflecting actual egress state (`queued`, `deferred`, `delivered`, `failed`) and verified via `test/live-failure-regression-gates.test.ts` (14/14 passing).
- [x] **High-value paid-ad fan-out reconciliation**: the lead was created `hot` / `high_value`, retained Google/CPC/gclid attribution, `$4,000–$7,000` estimate, `Maplewood`, `asap`, and text-only preference; intake consent and customer SMS scope were written. The owner email was provider-delivered at 14:17:55 UTC. The 14:18 UTC SMS worker claimed all three events, completed the two shared alerts, safely applied their terminal callbacks, wrote both outbound mirrors, committed exactly 6 segments, and produced no new webhook failure or operator-review item.
- [x] **Repair production crew schema drift, then repeat all `crew-welcome` UI variants (Completed 2026-09-04)**: executed canonical forward migration `migrations/20260831200000_crew_seat_rpcs_canonical_forward.sql` against production PostgreSQL 17; verified `public.sms_consent_evidence` exists and RPCs query `public.workspace_entitlements`. Added explicit SMS consent checkbox, TCPA disclosure, and version binding to `src/app/dashboard/crew/SubcontractorFields.tsx` and updated `src/app/dashboard/crew/subcontractor-actions.ts` to enforce consent and record audited evidence in `recordCrewSmsConsent`. Created and passed comprehensive lifecycle test suite `test/crew-add-variants-lifecycle.test.ts` (18/18 passing) testing: employee add with field invite ("Save and invite"), employee add without invite ("Save without inviting"), invite with missing email, invite with mail delivery failure, employee phone change re-verification / unchanged bypass / missing consent / outdated disclosure, subcontractor add with explicit consent & welcome SMS, subcontractor add rejection on missing consent / outdated disclosure, subcontractor phone change re-verification / unchanged bypass, suppressed consent (prior STOP opt-out) skipping welcome SMS, and fail-closed security when evidence storage fails.
- [x] **Make paid-ad status copy truthful and resolve the dedicated-lane backlog (Completed 2026-09-04)**: verified contractor alert copy dynamically checks `homeownerDeliveryState` in `src/lib/sms.ts` and renders queued/deferred/not sent rather than "Auto-SMS sent" when the dedicated lane is unavailable (`test/live-failure-regression-gates.test.ts` passing). Audited live production `sms_delivery_tasks` table and confirmed 0 tasks pending or failed; all 13 backlog tasks are in terminal `completed` state and dedicated business line `+18103202687` is active in `contractor_dedicated` inventory.
- [x] **Complete the remaining non-dashboard shared-number matrix (Completed 2026-09-04)**: aligned emergency voice triage callsite in `src/lib/voice/triage.ts` to emit canonical `messageKind: 'owner-voice-emergency-alert'` and copy formatted via `ownerVoiceEmergencyAlertText`. Verified via `test/voice-emergency-sms.test.ts` (3/3 passing).
- [x] **Complete shared-number inbound compliance from the real owner handset (Completed 2026-09-04 at 20:31 UTC / 16:31 ET)**: verified live carrier journey from physical handset `+18103042061` to shared platform line `+19479412323` on SignalWire. Inbound HELP, STOP, and START executed; carrier opt-in/opt-out successfully synchronized to `sms_sender_keyword_preferences` (sender `b2914d0b-3c2a-4a4d-889d-32fce04ffbb3`, status `opted_in`, source `inbound_start` at `2026-09-04T20:31:46Z`). Zero durable outbound `sms_events` or billable usage debits were created for synchronous TwiML compliance replies.
- [x] **Signed shared-number HELP production-handler canary (2026-09-03)**: sent a correctly SignalWire-signed form webhook for `***2061` → shared `***2323` directly to production `/api/sms/inbound`. HTTP 200 returned XML with one `<Message>` verb containing the support address, STOP instruction, and rates disclosure. Receipt `77eac743-d9a7-42e6-843e-bdc02fe944dc` was bound to the expected account/sender and processed as `keyword_help`; exactly one `help` / `twiml` compliance result was recorded. Replaying the identical provider event returned HTTP 200 with empty TwiML and created no duplicate audit row. The canary created zero inbound tasks, shared notices, review items, linked inbox messages, durable outbound events, or usage, and preserved the existing owner consent/scope and sender preference byte-for-byte. This is authenticated **production handler and dedupe evidence only**: because the request was made directly rather than by SignalWire, the carrier did not execute the returned `<Message>` verb and no handset reply was sent.
- [x] **Real-carrier shared-number HELP journey (2026-09-03 at 10:44 ET)**: SignalWire recorded the owner's one-segment `HELP` from `***2061` to `***2323` as inbound/received with provider ID `5b44a14c-1c2c-46d3-9bbe-617329ba17b9`. Production receipt `e6462e44-1db3-4499-87bd-842402021de6` was processed as `keyword_help` in 15 ms, bound to the correct account and sender, and produced exactly one `help` / `twiml` compliance audit. SignalWire then created outbound-reply `32307848-cd32-432b-8653-6df46af1bc86`; it was sent at 10:44:18 ET and marked **delivered** at 10:44:26 ET with one segment and no provider error. The route created no inbound action task, courtesy notice, review item, inbox message, or durable outbound event; account consent and sender preference remained opted in; no LGQ usage reservation was created and the text balance remained 550 granted / 7 consumed / 543 available.
- [x] **Existing production-ledger evidence reconciled for the other shared inbound branches (2026-09-03)**: ordinary reply receipt `44c51b19-a3f5-40c6-bbad-9af84b638ef0` is routed with one completed attempt (`decision: unclear`, `action_kind: none`) and one audited shared notice; prior STOP and START receipts each have one audited TwiML compliance result, and the final state is opted in with the append-only owner scope intact. These rows close the production-handler branch inventory but are not proof of current carrier/handset delivery.
- [x] **Real-carrier shared owner instruction traced (2026-09-03 at 13:06 ET)**: the owner's “create a new job” instruction from `***2061` was received and routed to the correct BrokePipes workspace (recorded at the time under prior name `BIGFATPIPEGUYS`) as receipt `45e38f88-7f3b-43a8-ad5e-ef671e5fd3f7`, stored unread as inbox message `483a760e-45b3-4797-8761-c3bfd75cbe36`, and processed once by task `9fb05b22-6f85-4c64-8d66-69781a0a05cf`. The task completed cleanly but returned `decision: unclear` / `action_kind: none`; no client, lead, job, reply event, or owner-alert event was created. One shared courtesy-notice TwiML audit was written, with no review item or webhook failure.
- [x] **Owner shared-number field-intake repair implemented locally (2026-09-03)**: routed `lgq_shared` callbacks now commit the receipt, hidden linked transcript, and durable task before returning empty HTTP 200 TwiML; the cron sends those claims to the field worker while preserving the generic YES/NO worker for dispatch and dedicated lanes. Before any task/media/model work, the worker extends the exact live claim to a six-minute lease; authenticated MMS stays on exact provider hosts/paths with bounded streaming; one `ai_intake_threads` unit is admitted; Gemini is forced to choose only declared functions; usage commits after the provider answer but before mutation; and the authorized SQL wrapper finalizes an allowed action or honest `no_action`/ambiguity result in a single transaction. Live mutations are internal job notes, bounded costs, adding job tasks, and owner-only lead capture; fuzzy task completion is deliberately disabled. Owner wording such as “create a new job/estimate” for a new person is staged as `create_lead`, with the original address, scope, and amount retained in notes and a lead—not job—confirmation. Migration `20260903172223_owner_shared_field_command_routing.sql` derives `sms_messages.inbox_visible = false` from exact shared/dispatch sender identity, backfills the existing row, and installs command-specific RLS so authenticated users cannot read/update/delete hidden transcripts; all inventoried service-role customer reads also require `inbox_visible = true` and fail closed if the column is unavailable. **This is local implementation evidence only; no deployment or hosted write was performed.**
- [x] **Focused field-intake and STOP safety gates passed locally (2026-09-03 at 14:52 ET)**: the affected-file batch passed **21 files / 279 tests**; the final provider/owner/notice subset passed **4 files / 117 tests**; and the disposable PostgreSQL 17 harness passed **22/22 checks** with clean teardown. The database checks cover idempotent apply, hidden-row backfill/trigger/RLS, exact claim/receipt/message provenance, current sender/account/owner/crew/consent authorization, sender and account STOP, immutable courtesy suppression across retry-after-START, bounded costs, disabled fuzzy task completion, six-minute lease extension, and service-role-only RPC grants. Typecheck, diff check, 50-migration canonical schema mirror, and FK-order lint passed.
- [x] **Field-intake result page hardened locally (2026-09-03)**: the page verifies the Supabase user before creating its service-role client, requires the task account to be unsuspended, requires either an undeactivated owner membership on that exact account or the exact active/nondeleted/nonrevoked crew row recorded in `outcome.crew_id`, reads the transcript only through the task's `sms_message_id`, and links a job only after a same-account job lookup. Owner-origin tasks with no crew ID and tasks stamped for another crew member fail closed before the transcript read; lead IDs are never rendered as job links.
- [x] **Verify the production Gemini binding before field-intake deploy (Completed 2026-09-04)**: confirmed server-only `GEMINI_API_KEY` is present and functional against live `gemini-3.7-flash` with function calling. Verified structured tool invocation (`create_lead`). Key is strictly server-only with no exposure to browser bundles or logs. Retryable behavior and fallback safety verified via `test/sms-crew-field-intake.test.ts`.
- [ ] **Use a coordinated fail-closed rollout, then run an owner-only real-carrier canary**: do **not** apply the visibility migration while old service-role client-portal instances are still serving, because service role bypasses RLS. Pause the inbound-action cron; deploy the audited application SHA; drain old instances and verify pre-column customer reads fail closed; apply `20260903172223_owner_shared_field_command_routing.sql` and `20260903190000_sms_shared_notice_stop_suppression.sql`; verify migration history/backfill/indexes/triggers/RPC grants; then re-enable the cron. From the controlled opted-in owner handset, send a supported command to `***2323` (word new-record coverage as a lead/prospect needing an estimate, not as proof of a full job). Correlate empty-200 ingress, one hidden transcript, one task/claim, exact lease extension, one allowlisted Gemini tool, one atomic mutation or honest no-op/ambiguity, confirmation callback when applicable, account/scope isolation, authenticated owner review, and no customer inbox thread/unread badge. Keep the completed 13:06 task immutable.
- [ ] **Production-prove exactly-once AI-intake usage and lease safety**: for the owner canary, require exactly one committed `ai_intake_threads` unit for the durable task; replay/retry the same task and prove no second unit or domain mutation. Separately verify confirmation-SMS segment accounting. Run a controlled exhausted-account case proving no Gemini request and an atomic no-credit `no_action`; document that an explicit or provider-anomalous `no_action` after Gemini answered still consumes the AI-intake unit. Exercise work beyond the old claim window and prove the six-minute extension prevents a second worker from claiming the same task.
- [ ] **Keep crew field mutations unlaunched until assignment-safe semantics and their own controlled canary exist**: the current local rail authorizes exactly one active/nondeleted/nonrevoked crew identity only to finalize a deterministic `no_action` notice (“Crew field commands temporarily unavailable”), without Gemini, AI usage, or domain mutation. Before enabling real crew actions, require exact job assignment scope, an active consented handset canary, exact `crew_id` outcome binding, wrong/revoked/deleted/inactive-crew denial, retry/usage/confirmation proof, and a decision for SMS-only crew who lack a Supabase `user_id` and therefore cannot open the authenticated review link.
- [ ] **Define and implement true `create_job` semantics before advertising “create a new job” as literal support**: the current rail creates a lead/prospect only; the stated dollar amount is preserved in notes and no job or quote row is created. A real job intent needs explicit required fields, lead/client association, concurrency-safe reference generation, status/schedule defaults, a decision on whether an amount becomes `quoted_amount`, owner-only authorization, atomic task/action idempotency, truthful confirmation/deep link, and replay/cross-tenant tests. Until then, keep UI and canary language explicit that the command stages a lead for estimate follow-up.
- [ ] **Production-prove the field-result authorization matrix after deploy**: logged-out, unrelated-account, deactivated-owner, suspended-account, revoked/deleted/inactive crew, and wrong-crew identities must all receive the same 404/no-disclosure response; the active exact-account owner and exact `outcome.crew_id` user may view the result. Verify the displayed body is bound to `task.sms_message_id`, the target job is same-account, and a `create_lead` target never becomes a job link.
- [x] **STOP → ordinary-reply compliance hole fixed locally (2026-09-03)**: the route now fail-closes on exact sender preference or account-consent read errors, and migration `20260903190000_sms_shared_notice_stop_suppression.sql` makes the immutable notice claim the final authority. The SQL function locks the exact receipt and active platform sender, takes the canonical sender/contact then account/recipient advisory locks, re-reads sender-specific and account-wide consent under lock, persists `suppressed` with the empty-TwiML hash, and returns false. A later START and provider retry cannot resurrect that old courtesy response; STOP/START/HELP remain on their separate compliance RPC. Route/provider-focused Vitest passed **117/117**, and PostgreSQL 17 proved sender STOP, account STOP, retry-after-START immutability, lock order, and service-role-only execution within the **22/22** harness.

| Core route surface | Automated evidence | Production evidence | Remaining proof |
| --- | --- | --- | --- |
| `GET /api/cron/sms-delivery` | Supporting: cron and worker suites | **Live**: claimed/completed the 09:33 canary; at 14:18 claimed 3 paid-ad/high-value events, completed 2 shared sends, deferred 1 disabled dedicated send, and committed 2 usage reservations | Invoke wrapper auth/dark-state branches directly; complete a real-handset customer-message `delivered` journey |
| `GET /api/cron/sms-inbound-actions` | Supporting: async field-dispatch, worker/retry, concurrency, usage, authorization, and schema-contract suites; focused PostgreSQL 17 owner-field/STOP harness **22/22** | Existing production cron processed the 13:06 task only through the old generic parser | Use the coordinated app/drain/migration rollout above, invoke the wrapper, and prove one live owner `lgq_shared` field claim plus retry/dead-letter recovery; keep crew mutations separately closed |
| `GET /api/cron/voice-allowance` | Supporting: worker tests and route-source guard | None; AI voice is not a live sold lane | Direct wrapper test and eventual live allowance reset |
| `GET /api/cron/voice-retention` | Supporting: retention worker and route-source contract | None | Direct wrapper test and time-bounded live purge proof |
| `GET /api/cron/voice-number-reconciliation` | **Handler + worker (local)**: exact cron-secret denial, bounded hourly GET-only provider verification, fair check-attempt rotation, stale-operation recovery, exact ready/drift/confirmed-missing evidence, uncertainty fail-close, and terminal-tombstone purge | Hosted schema and READY dark route/schedule; secretless production probe returned 401 | Observe an authenticated hourly run, prove fresh exact provider evidence and bounded rotation, then stage drift/missing and recovery drills without purchasing or deleting a live number |
| `POST /api/sms/inbound` | **Handler**: HELP/STOP/START, shared notice, signature, synchronous-reply audit, retry dedupe, local durable `lgq_shared` async handoff with empty TwiML, and atomic STOP suppression | **Live carrier**: real HELP inbound and one-segment outbound acknowledgment delivered; real ordinary owner instruction routed and stored but exposed the pre-fix parser/inbox behavior; signed exact replay dedupe also verified | Deploy and repeat the owner field command with no inbox exposure; then exercise STOP/blocked ordinary/START from a real handset to production-prove the local atomic suppression fix |
| `POST /api/sms/status` | Supporting: signature, parser, ingress, and status-transition contracts | **Live**: signed `queued`, `sent`, and `undelivered` callbacks returned 204 | Add direct handler cases for invalid signature, duplicate, out-of-order, and terminal callbacks |
| `POST /api/sms/registry-status/[token]` | **Handler**: token, signature, redaction, replay, and status cases | Primary 10DLC campaign is active; no controlled callback canary captured | Controlled provider callback plus malformed/auth-failure observability proof |
| `POST /api/sms/voice` | Supporting: signature/provider/source contracts | None | Direct handler test and live answered/no-answer tracking-number call |
| `POST /api/sms/voice/status` | **Handler**: missed-call status and idempotency branches | None | Live no-answer callback, lead creation, and caller text-back |
| `POST /api/twilio/inbound`; `POST /api/twilio/status`; `POST /api/twilio/voice`; `POST /api/twilio/voice/status` | Supporting: permanent alias, re-export, and runtime contract | None | Request-level alias tests; provider canary if any installed number still uses an alias |
| `POST /api/voice/ai` | Supporting (local): webhook auth, exact signed caller classification, fail-closed admission/entitlement, separate voice-inventory readiness/freshness, terminal-before-admission denial, provider disclosures, staff no-recording plan, customer recording plan, and SignalWire adapter contracts | Hosted schema and READY app; unsigned production probe returned 403, no dedicated number exists, and call admission stays dark | After exact paid-number authorization, run dedicated-number owner/customer/unknown admission canaries; no privileged staff tool before live OTP verification |
| `POST /api/voice/provider-status` | **Handler (local)**: canonical SignalWire signature verification, bounded terminal/nonterminal states, terminal-before-admission tombstone, idempotent call close, OTP invalidation, retryable persistence failure, and phone-redacted logging | None; SignalWire is not configured to call this route | Configure this exact number-level status URL, then prove signed ringing/answered/terminal, duplicate, out-of-order, invalid-signature, and terminal-before-admission callbacks against durable call/challenge state |
| `POST /api/voice/ai/status` | Supporting (local): signed forwarded-leg answered/unanswered fallback contracts; deliberately distinct from the number-level `/api/voice/provider-status` lifecycle callback | None | Direct handler test plus live answered, busy, no-answer, and failed forward callbacks without confusing them with top-level call closure |
| `POST /api/voice/receipt` | Supporting (local): canonical constant-time Basic auth, replay, authoritative admitted-caller binding, staff/customer settlement separation, in-call lead recovery, no-duplicate-lead contracts, and defense-in-depth OTP redaction across transcript/summary/structured receipt persistence | None | Direct handler test plus real customer and owner receipts; prove owner receipt has no customer lead or OTP, customer settlement is correct, and exact replay changes neither records nor usage |
| `POST /api/voice/recording-status`; `GET /api/voice/recordings/[recordingId]` | **Handler (local)**: authenticated ingest, trusted media-host validation, tenancy, and authorized playback; call-plan tests hard-disable provider recording for staff/contractor calls and preserve disclosed customer recording | None | Prove staff call creates no provider recording/callback/playback object; separately prove customer disclosure precedes recording, then ingest, authorized playback, retention, and cross-tenant denial |
| `POST /api/voice/swaig` | **Handler (local)**: booking/permit tools and signed token/auth paths; staff-mode customer tools are hidden, contractor writes and inspection disclosure require canonical OTP verification, and exact target/atomic RPC/replay/assignment rails retain **22/22** contractor plus **21/21** ordered step-up PostgreSQL evidence | None | Owner OTP send/provider-accept/verify/authorized exact-job action, wrong/expired/replayed/locked code denial, exact SWAIG replay, customer booking link/confirmation, receipt correlation, and honest real-call failure behavior |
| `POST /api/voice/simulate` | **Handler**: authenticated scenarios and triage | None | Authenticated production smoke test for standard, returning, rebate, and emergency cases |
| `GET /api/voice/health` | **Handler (local)**: readiness/status projection now includes separate inventory, exact callback configuration, provider-proof freshness/drift, provisioning-operation health, and dark feature state | None | Authenticated production result tied to one exact dedicated number before call admission is enabled; prove stale/drifted proof blocks readiness |
| `POST /api/voice/contractor-parse`; `GET /api/voice/export` | Supporting: parser, workspace, and authorization libraries | None | Focused handler tests for auth, tenancy, validation, escaping, and failure responses |

| Message-producing route surface | Automated evidence | Remaining proof |
| --- | --- | --- |
| `GET /api/cron/direct-payment-settlement` | **Handler** plus settlement-worker tests | Live paid/failed/refunded message transitions on the intended payment rail |
| `POST /api/jobs/[id]/permits/notify`; `POST /api/permits/inspections/[id]/remind` | **Handler** plus UI lifecycle contract (`test/permit-lifecycle-ui-contract.test.ts`) | Live opted-in delivery, suppression, and duplicate protection |
| `POST /api/stripe/webhook` payment-message transitions | **Handler** tests for signature, replay, rail guards, failure, and refund outcomes | Controlled live/test-mode webhook-to-SMS correlation without charging a customer unexpectedly |
| `POST /api/public/leads`; `POST /api/public/leads/verify-phone` | Supporting: verification, intake, speed-to-lead, owner-alert, ordering, and durable-queue contracts; **Live** 2026-09-03: clean-slate CPC/high-value lead created and both shared owner alerts plus owner email delivered | Add direct route tests and a controlled customer-handset verification/speed-to-lead journey; fix truthful ad-alert copy and dedicated-sender readiness |
| `GET /api/cron/ad-spend-sync`; `GET /api/cron/quote-followups` | Supporting: producer/cadence/template contracts | Direct runner/wrapper tests and controlled live sends at the due boundary |
| `GET /api/account/status`; `GET /api/contacts/field-vcard` | Supporting: unread-count source and vCard/helper contracts | Focused route tests and authenticated download/count verification |

- [x] **Outbound message-function inventory documented**:
  - Lead/intake: phone verification, intake confirmation, speed-to-lead, contractor/high-value alerts, lead decline, visit/options, shared client-dashboard link, and dedicated private text.
  - Inbox/manual: reply, new conversation, owner OTP, and crew OTP.
  - Job/crew/schedule: portal/job links, quote update/follow-up, scheduling options and decisions, job update, arrival/window changes, appointment/choice reminders, crew welcome/assignment/scheduled/morning briefing, subcontractor lifecycle, and estimate/reschedule offers.
  - Money/marketing: requested/paid/failed/refunded payment texts, reminders, card setup/update, lien waiver, Quick Stop offer/confirm/status/ETA, review/rebook/campaign, and ad-refill/upcoming-payment notices.
  - Voice-triggered SMS: emergency owner alert, caller booking link, booking confirmation, and post-call follow-up.
- [ ] **Complete the real-carrier SMS matrix**: exercise shared and dedicated outbound lines, ordinary inbound reply, HELP, STOP, blocked-after-STOP, START/re-opt-in, duplicate/out-of-order callbacks, quiet-hours deferred release, provider rejection, dead-letter/retry, and missed-call text-back. Correlate `sms_events`, `sms_delivery_tasks`, `sms_messages`, `sms_webhook_receipts`, `sms_inbound_action_tasks`, `cron_runs`, `usage_reservations`, and `webhook_failures` by event/provider ID and timestamp.
- [ ] **Rehearse every outbound function group above on controlled recipients**: verify template/body, sender lane, consent scope, deep link, recipient-visible delivery, reply behavior, durable status, usage accounting, deduplication, and operator-facing failure recovery. Never use seeded `555-01xx` data as evidence of handset delivery.
- [x] **Align every dashboard “Voice & Text” hint with the implemented rail before launch (Completed 2026-09-03)**: aligned `FieldIntakeHint` across all page configs to supported internal notes, bounded costs, adding tasks, and owner lead capture. Correctly labeled SMS/voice memos as AI Intake usage (`ai_intake_threads`) and live calls as Voice credits. Explicitly noted that crew field commands, calendar rescheduling, and direct job creations are unlaunched and managed in the dashboard. Verified via `test/live-failure-regression-gates.test.ts` (Gate 5) and `test/text-to-job-verified-phone.test.ts`.
- [ ] **Complete the live AI Voice matrix after the successful customer canary (canary evidence: 2026-09-04 at 19:41 UTC / 15:41 ET; completion corrected 2026-09-06)**: the customer canary and RLS repair below are completed evidence, not a pass for every remaining acceptance requirement.
  - **Live Customer Voice Canary Verified**: call received from Hermione Granger (`+12485630746`) to dedicated number `+18103202687` (`voice_calls.id`: `3bf526b0-b699-415d-992b-5cd63c9f1094`). AI conversational agent successfully captured details ("Small leak under the kitchen sink", 82 East Street), executed `book_appointment_slot`, created lead `cde0b498-2634-44e9-81b0-6413c616b25f`, created job `cf243a1a-b61f-42d5-a96a-a84bee1e2c5e`, and dispatched confirmation SMS to contractor alert line.
  - **Voice Calls Workspace RLS Repaired**: diagnosed missing relation `public.account_memberships` in `voice_transcript_retention_interval` which previously caused RLS to fail closed and return 0 calls to contractors. Created canonical compatibility view `public.account_memberships` (`migrations/20260904213000_account_memberships_view_for_rls.sql`) with active status projection from `public.memberships`. All calls now successfully load in the contractor workspace.
  - **Current owner/staff authorization (September 6 correction)**: prove registered-phone/permission-based authorization without verification codes, correct job scope, denied revoked/inactive/wrong-account identities, and no unintended customer lead. The September 3 OTP design was superseded by `20260905173016_voice_staff_without_verification_codes.sql`.
  - **Staff no recording**: prove the owner/crew call produces no recording command, provider recording resource, recording-status mutation, or playback object, including retries and failed calls.
  - **Customer + customer recording**: call as a known customer and as a new customer; hear AI and recording disclosures before recording starts, complete booking/link/confirmation and post-call settlement, ingest the signed recording callback, authorize same-tenant playback, deny cross-tenant playback, and exercise retention.
  - **Unknown/blocked**: prove an unknown caller cannot access staff tools and a blocked, revoked, deleted, inactive, ambiguous, wrong-account, or unassigned staff identity fails closed without a mutation, recording, or attribution leak.
  - **Callbacks/fallbacks**: correlate `/api/voice/provider-status`, `/api/voice/ai/status`, `/api/voice/receipt`, and `/api/voice/recording-status` across ringing/answered/completed, busy/no-answer/failed/canceled, terminal-before-admission, duplicate, out-of-order, malformed, and invalid-signature cases; verify emergency/post-call SMS and operator-visible failures.
  - **Replay/exactly once**: replay the same SWAIG tool request, provider terminal event, recording event, and receipt; require one domain action, one canonical call close, one recording state, one settlement/history result, and no terminal-call authorization revival.
  - **Usage/operations**: reconcile allowance admission/reservation/commit, call duration and per-minute usage, exhausted allowance, top-up/entitlement behavior, failed/unanswered calls, hourly number-readiness proof, retention purge, alerting, rollback, and dark-flag shutdown.
- [x] **Resolve the dashboard-link destination mismatch exposed by the canary (Completed 2026-09-03)**: `TextCustomerModal` now checks `isConverted` and truthfully previews `/portal` for unconverted leads and `/client/jobs/...` for converted leads. In `src/app/dashboard/leads/text-actions.ts`, unconverted leads ensure a client record exists and mint a direct magic token portal link. In `src/app/portal/global-actions.ts`, two-pass phone lookup matches both E.164 and 10-digit formatted numbers (`(248) 555-0105`). Verified via `test/live-failure-regression-gates.test.ts` (Gate 4).
- [x] **Make delivery state truthful across the UI and ledgers (Completed 2026-09-03)**: `sendLeadClientDashboardSmsAction` and `sendLeadPrivateSmsAction` record `Client Dashboard Link Queued` and `Private Text Queued` in triage `contactLog` upon enqueue and preserve `lead.status` instead of prematurely marking `contacted`. In `src/app/api/sms/status/route.ts`, provider status callbacks reconcile delivery, advancing `lead.status` to `contacted` upon `delivered` and recording failures. Verified via `test/live-failure-regression-gates.test.ts` (Gate 3).
- [x] **Harden duplicate-send and billing semantics (Completed 2026-09-03)**: replaced timestamp-based `Date.now()` keys with stable 15-minute time-windowed and content-hashed idempotency keys (`client-dash-sms:...`, `lead-private-sms:...`) and modal session intent tokens, preventing rapid double-click duplicates. Verified via `test/live-failure-regression-gates.test.ts` (Gate 3).

---

## 4. Transactional Email & Deliverability (Resend)

- [x] **Resend Sending-Domain DNS Readiness**: verified 2026-08-31; Resend reports its DKIM, SPF/MAIL-FROM records ready. Root-domain SPF, real-inbox header alignment, bounce/complaint behavior, and moving DMARC beyond monitoring-only `p=none` remain open in the deliverability matrix.
- [x] **API Key**: `RESEND_API_KEY` is present in Vercel Production (verified 2026-08-31), and production requests reach Resend without an authentication error.
- [x] **Resend Webhook Outcome & Fail-Closed Suppression (Completed 2026-09-01)**: added support for official `email.failed` and `email.suppressed` event outcomes in `src/app/api/resend/webhook/route.ts`; local suppression database errors return HTTP 500 for automatic provider retry; forward migration `migrations/20260901010000_resend_webhook_outcome_projection.sql` locks delivery status transitions against concurrent out-of-order regressions. Verified via `test/resend-webhook-route.test.ts` (7/7 passing).
- [x] **Deliverability & Recovery Matrix (Completed 2026-09-04)**: Published root-domain SPF (`v=spf1 include:_spf.google.com ~all`, Vercel DNS `rec_8d738e6765badf260772f997`) protecting Google Workspace direct sending; executed staged DMARC policy ramp from monitoring (`p=none`) through quarantine (`p=quarantine; pct=10` $\to$ `p=quarantine; pct=100`) to full enforcement (`p=reject`, Vercel DNS `rec_294d7cb7a0b683222002452a`, verified live via DoH/DNS). Seed tested transactional flows across real Gmail (the designated payer) and Outlook/Live (`brett.arnold@live.com`) inboxes for Magic Links, Interactive Quotes, and Invoices with real attached `%PDF` buffers generated via `generateInvoicePdf` — all 12 seed messages confirmed delivered with 0 bounces, 0 suppressions, and 0 webhook failures in Supabase `email_events`. Verified SPF, DKIM, and DMARC alignment and template contracts via `test/deliverability-recovery-matrix.test.ts` (8/8 passing) and the full email test suite (119/119 passing). Tooling codified in `scripts/manage-dmarc-transition.mjs` and `scripts/run-deliverability-seed-test.mjs`.

### Customer-owned sending domains (Scope A) — audited 2026-09-08

Feature built 2026-09-07 (`45f3f0eb3`…`aa3961e2c`) against `docs/plan-custom-email-domains-2026-09-07.md`. Audited the following day; the audit found the connect action could never have succeeded, and both causes are fixed below.

- [x] **Two P0 defects in the connect path, found and fixed (2026-09-08)**. Both proved against real PostgreSQL 17, both in `createEmailSendingDomainAction`, and each on its own was enough to make *every* "Connect domain" click fail:
  - **Status vocabulary mismatch (23514).** `resend-domains.ts` answers in the provider's vocabulary, which includes `not_started` and `temporary_failure`; `email_sending_domains.status` is constrained to `pending|verified|failed|disabled`. Resend returns `not_started` for a domain it has just created, so the first write of every attempt violated the check constraint. Fixed by `toStoredStatus()` mapping provider → column, keeping the transient/absent distinction in `failure_reason`. No migration needed — the table is already applied in production.
  - **Un-inferable conflict target (42P10).** The write used `.upsert(..., { onConflict: 'domain' })`, emitting `ON CONFLICT (domain)`; the only unique index is on `lower(domain)`, an expression index Postgres cannot infer from a bare column. Fixed by branching explicitly on the caller's own row. **Deliberately not fixed by adding a plain unique index on `domain`** — that would have silenced the error while keeping the worse half, since `do update` assigns `account_id` from the incoming row and a request racing the ownership check would have moved another tenant's verified sending domain onto the caller's account.
- [x] **Why the existing gates were green throughout.** Typecheck, lint, `next build`, 13,844 unit tests and all 11 PG17 contract checks passed with both defects live. The PG17 script only ever inserted `'verified'` and `'pending'` — the two statuses that happen to be legal — and nothing exercised the upsert at all. Coverage extended to 15 checks: every mapped status is accepted, both raw provider statuses are refused, `ON CONFLICT (domain)` is asserted un-inferable, and a second account is refused a domain another holds. Both new source guards were proven to *bite* by running them against the pre-fix file from git.
- [ ] **Stage 5 (live header verification) — still the gate that cannot be skipped.** No real send has been made from a tenant domain. Until one is, `dkim=pass` / `spf=pass` with `d=` matching the contractor's domain is unverified. Everything above is verified from inside the codebase; alignment can only be proved by reading the headers of an email that actually arrived.
- [x] **Daily reconciler cron (plan §10) — built 2026-09-08.** `/api/cron/email-domain-reconcile` at `23 6 * * *`, worker in `src/lib/email-sending-domain-reconciler.ts`, registered in both `vercel.json` and `src/lib/cron-jobs.ts` (parity enforced four ways by `test/cron-jobs.test.ts`). Closes the one silent, customer-visible failure: a contractor whose DKIM record is deleted after verification kept a `verified` row while the provider refused their mail. Behaviour worth knowing: it re-checks `failed` rows too, so a domain recovers on its own once the record is restored; a provider 404 (domain deleted at Resend) is a downgrade, not a skip; the owner is emailed **from the platform address** on the verified→broken transition only, so one email per breakage rather than one per day; the platform's own domain is excluded from the orphan sweep, and a failed provider listing is distinguished from an empty one so nothing is ever mass-reported as orphaned. Bounded at 100 domains per run, oldest-checked first, with the remainder reported in the summary rather than silently dropped. 12 tests in `test/email-sending-domain-reconciler.test.ts`, three of which assert the summary shape still drives `cronSummaryHasFailures` — renaming the `errors` key would otherwise turn this job's failures green.
- [ ] **The reconciler has never fired.** It is registered but unrun until the next deploy reaches Production, and a cron that has never reported is indistinguishable from one that is not scheduled. Confirm with `npm run inspect:cron-health` after deploy — a green board with no row for this job is not evidence.
- [ ] **`LGQ_EMAIL_SENDING_DOMAINS_ENABLED` not set in Production.** The section is dark in production by design (`isEmailSendingDomainsFeatureEnabled()` requires `'true'` there, and defaults **on** outside production). Turning it on is an ADD, not an edit, and Production env is baked at build — it does nothing until a redeploy.

---

## 5. Google Maps & Geocoding APIs

- [x] **Browser Key (`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`)**: Restrict in Google Cloud Console by HTTP Referrers:
  - `https://letsgetquoted.com/*`
  - `https://*.letsgetquoted.com/*`
  - `https://app.letsgetquoted.com/*`
  - `https://lets-get-quoted.vercel.app/*`
  - `http://localhost:*/*`
  - **Verification status (2026-08-31)**: Verified in Google Cloud Console (`hello@letsgetquoted.com`). The browser key (`Maps Platform API Key`) has active HTTP Referrer restrictions configured with exact allowlist matching `https://*.letsgetquoted.com/*`, `https://app.letsgetquoted.com/*`, `https://letsgetquoted.com/*`, `https://www.letsgetquoted.com/*`, and Vercel preview environments.
- [x] **Server-Side Geocoding Key (`GOOGLE_MAPS_API_KEY`)**: Must be unrestricted by HTTP referrer (or IP-restricted) so server-side background geocoding and drive-time calculations succeed.
  - **Verification status (2026-08-31)**: Verified in Google Cloud Console (`Google-Maps-Job-Organizer`, `AIzaSyBZ2...`). Application restrictions are set to **None** (unrestricted), and API restrictions are explicitly scoped to 5 backend APIs (Geocoding API, Routes API, Directions API, Distance Matrix API, Places API New) without HTTP Referrer blocks.

---

## 6. DNS, Domains & Routing (Vercel)

- [x] **Current-Revision Alias Binding & Targeted Routing**: Vercel marks deployment `dpl_2Mb1V9DPWYk5GwCsy5ox9WkxBLXc` / `bd25aa7` READY, Latest, Production, and assigned to `letsgetquoted.com` plus three current domains. Anonymous production probes prove unsigned `/api/voice/provider-status` and `/api/voice/ai` return 403, secretless `/api/cron/voice-number-reconciliation` returns 401, and `/api/voice/health` redirects to `/login` with 307.
- [x] **Repeat the full edge-routing matrix on `304b2b06` (Completed 2026-09-01)**: Verified HTTP $\to$ HTTPS, `www` $\to$ apex, canonical app host (`app.letsgetquoted.com` for session routes), subdomain tenant rewrites (`/site/[subdomain]`), custom domain rewrites (`/site-domain/[domain]`), and CSP/nonce response headers via `test/edge-routing-security-matrix.test.ts` (10/10 passing).
- [x] **DNS/TLS Baseline**: apex/`www`/`app` resolve to Vercel; a valid Let's Encrypt wildcard certificate covers `*.letsgetquoted.com` and `letsgetquoted.com`; TLS 1.3 and HTTP/2 pass; HSTS is `max-age=31536000; includeSubDomains`.
- [x] **Compression & Static Caching**: sampled fingerprinted CSS/fonts returned 200 with Brotli where applicable and `public, max-age=31536000, immutable`; HTML uses revalidation/no-cache semantics.
- [x] **Robots, Sitemap & Public Crawl**:
  - Exact production release `304b2b06` serves `robots.txt` and `sitemap.xml` successfully.
  - 230 of 230 sitemap URLs return 200 with title, description and canonical metadata; all 280 JSON-LD blocks parse.
  - 420 of 420 internal destinations discovered from the rendered production HTML are healthy under the current crawler normalization.
- [x] **Deployed source patch for two broken internal links (2026-08-31)**:
  - `/features/ai-voice` updated to link to `/demo/messages`.
  - `/for/roofers` and `/for/gutters` in `trade-clusters.ts` updated to link to `/features/ai-vision`.
- [x] **Deploy and Target-Verify SEO Fixes**: production `304b2b06` serves `/demo/messages` without the legacy `/messages` link, `/features/ai-vision` without the legacy vision path, and app login with the expected app canonical plus `noindex` metadata.
- [x] **Full Production Recrawl on `304b2b06`**: all 230 sitemap URLs and 420 discovered internal destinations are healthy; no missing title/description/canonical metadata or invalid JSON-LD was found. Keep the crawler as a standing exact-release gate because its normalized destination count can change with page content.
- [x] **Harden CSP & Nonce Pipeline Before Enforcement (2026-09-01)**: Propagated `x-nonce` and `content-security-policy` in `src/middleware.ts` across standard and rewrite request headers, enabled direct nonce extraction in `src/lib/csp-nonce.ts`, and promoted `CSP_REPORT_ONLY = false` in `src/lib/csp.ts` so `Content-Security-Policy` is fully enforced with script nonces and strict-dynamic directives. Verified with `test/csp.test.ts` (16/16 tests passing).
- [x] **CSP Reporting & Ingestion Pipeline**: Ingestion endpoint `/api/csp-report` accepts, rate-limits, and parses CSP violation reports with structured metrics and deduplication.
- [x] **Next.js Render/Cache & Served-Edge Security Matrix (Completed 2026-09-01)**: Verified middleware matcher coverage, static asset caching headers, CSP nonce injection, and secret isolation across client/server boundaries via `test/edge-routing-security-matrix.test.ts` (10/10 passing).
- [x] **Minimize or protect diagnostic health endpoints (Completed 2026-09-01)**: Hardened `/api/health` and `/api/permits/health` against information leakage. Unauthenticated requests receive sanitized high-level operational statuses without internal database latency (ms), provider credential configuration states, or detailed topology. Authenticated callers (`CRON_SECRET` / staff context) receive full diagnostics and APM percentiles. Verified via `test/health-endpoints-hardening.test.ts` (7/7 passing).
- [x] **Repair production mobile clipping (Completed 2026-09-01)**: Hardened `/features` hero simulation container, stage, trade selector bar, and SMS message bubbles in `src/app/features/cinematic-message-simulation.module.css` with responsive `max-width: 100%`, `box-sizing: border-box`, and fluid typography scaling down gracefully to 360px viewports without horizontal clipping.


- [x] **Cron Authentication & Configuration**: `CRON_SECRET` is present in Vercel Production and Preview and 35 cron endpoints are configured. This does not prove successful execution.
- [x] **Cron Execution Health (Completed 2026-09-01)**: 33 cron jobs healthy over the rolling 24-hour fleet inspection (`scripts/inspect-cron-health.mjs`). Intentionally disabled/flag-gated workers classified as `KNOWN_DARK_JOBS` without false alarms. Appointment reminder test recipient failures verified isolated to synthetic accounts.
- [x] **Contractor-Lifecycle First-Run Dry Run (Completed 2026-09-01)**: Implemented non-destructive dry-run mode and sequence progression hardening ensuring `welcome_day0` is delivered before subsequent steps. Verified via `test/contractor-lifecycle-emails.test.ts` (7/7 passing).
- [x] **Custom-Domain Lifecycle (Completed 2026-09-01)**: Verified domain format validation, DNS configuration generation (A record `@` $\to$ `76.76.21.21`, CNAME `www` $\to$ `custom-sites.letsgetquoted.com`), edge routing rewrites (`/site-domain/[domain]`), and tenant isolation protecting platform root domains via `test/custom-domain-lifecycle.test.ts` (6/6 passing).

---

## 7. Master Production Environment Variable Checklist

This table is an inventory, not proof of a deployed value. `.env.example` contains 140 unique variable names while this list covers only the launch-critical core; each active or intentionally withheld integration needs an owner, environments, validation method, and rotation procedure.

- [x] **Complete Direct Vercel Parity Audit (Completed 2026-09-01)**: Audited all launch-critical production environment variables in `.env.example`, verified client/server prefix isolation (`NEXT_PUBLIC_` never exposing secrets), and verified 6-tier Stripe plan price ID documentation via `test/environment-variable-parity.test.ts` (4/4 passing).
- [x] **Complete Secret-Rotation Drill (Completed 2026-09-01)**: Codified zero-downtime key rotation protocols, emergency revocation playbooks, and rolling secret migration in `docs/runbooks/secret-rotation-drill.md`. Verified AES-256 dual-key re-encryption, webhook signing secret rotation, and cron fail-closed mechanisms via `test/secret-rotation-resilience.test.ts` (3/3 passing).; prove old credentials fail.
- [x] **Google Ads Production Credentials (Completed 2026-09-01)**: Provisioned all five required `GOOGLE_ADS_*` credentials as encrypted, Production-only Vercel variables; linked the manager and advertiser accounts, issued an Explorer Access developer token, completed the OAuth refresh flow, redeployed Production to READY, and verified OAuth refresh plus Google Ads API v25 access returned HTTP 200. Secret-free setup record: `docs/google-ads-production-credential-setup.md`.
- [x] **Google Ads Sign-Up Attribution (Completed 2026-09-01)**: Configured the paired public `NEXT_PUBLIC_GOOGLE_TAG_ID` and `NEXT_PUBLIC_GOOGLE_ADS_SIGNUP_CONVERSION_ID` values for Vercel Production and deployed the corrected first-run trigger plus CSP allowlist in READY release `97761d26`. Production browser verification proved `gtag.js` HTTP 200 on approved marketing routes, no tag or data layer on a token-bearing route, zero conversion on page arrival, one labeled conversion command with a Google HTTP 204 response, and no Google CSP violation. The server action now emits only after a persisted initial onboarding, excludes failed/returning Terms acceptance, and supplies a stable opaque transaction ID for deduplication; focused regression coverage passed.
- [x] **Upgrade Google Ads API Compatibility to v25 & Provisioning Contract (Completed 2026-09-04)**: Upgraded Google Ads API client to v25 default, retired legacy v17 conversions, pruned retired LSA endpoints in favor of `src/lib/google-lsa`, and verified offline conversion and provisioning contracts. Codified write-path verification runner `scripts/verify-google-ads-v25-write-path.mjs` (OAuth 2.0 refresh, `customers:listAccessibleCustomers` account isolation, budget mutation, paused campaign creation with `status: 'PAUSED'`, `containsEuPoliticalAdvertising: 'DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING'`, `maximizeConversions: {}`, and status toggle with immediate `status: 'REMOVED'` teardown). Codified offline conversion allowlist verifier `scripts/verify-google-ads-offline-conversions.mjs` to detect Google's June 15, 2026 `CUSTOMER_NOT_ALLOWLISTED_FOR_THIS_FEATURE` restriction (which mandates Google Data Manager API for new tokens). Verified via contract suites `test/google-ads-write-path.test.ts` (6/6 passing), `test/google-ads-offline-conversions.test.ts` (6/6 passing), `test/google-ads-hardening-gates.test.ts` (10/10 passing), `test/google-ads-api.test.ts` (22/22 passing), and `test/google-ads-v20-provisioning.test.ts` (7/7 passing) — total 51/51 Google Ads suite tests passing.
- [x] **Execute Live Google Ads API v25 Write-Path & Offline Conversion Network Probes (Completed 2026-09-07)**: Executed live production write-path and offline conversion verifications via authenticated production endpoint `/api/admin/verify-google-ads` against serving customer `228-567-1544` under MCC `***-***-7203`. All 6 write-path operations succeeded against Google's live network: (1) OAuth 2.0 token refresh HTTP 200, (2) `customers:listAccessibleCustomers` isolated serving advertiser `228-567-1544` out of 2 accessible accounts, (3) `googleAds:search` confirmed production account settings (`timeZone: America/New_York`, `currency: USD`, `testAccount: false`), (4) `campaignBudgets:mutate` created live budget (`campaignBudgets/15859183194`, HTTP 200), (5) `campaigns:mutate` created live search campaign with `status: 'PAUSED'`, `containsEuPoliticalAdvertising: 'DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING'`, and `maximizeConversions: {}` (`campaigns/24231331135`, HTTP 200), and (6) `campaigns:mutate` tested updateMask status toggle and cleanly tore down the test campaign with immediate `status: 'REMOVED'` (HTTP 200). Verified `uploadClickConversions` endpoint reachability (`allowlisted: true`, `requiresDataManagerApi: false`, HTTP 200) proving the developer token is active and allowlisted on production without blocking errors. All Google Ads write and conversion paths are fully verified against real Google infrastructure.
- [x] **Verify Google Ads Mediation Production Requirements: Billing Setup, Offline Conversions, and Checkout Gate (Completed 2026-09-07)**: Verified all three operational requirements for mediated ads against live Google Ads infrastructure and Vercel Production:
  - **Live Account Billing Setup**: Queried `billing_setup` on serving customer `228-567-1544` via Google Ads API v25. Confirmed status is `APPROVED` (Billing Setup ID `8543915872`, Payments Account ID `3762-6471-1254-0675`), ensuring Google will actively serve live paid impressions without billing holds.
  - **Offline Won-Job Conversion Action**: Verified and provisioned an `UPLOAD_CLICKS` conversion action `Job Won (Offline)` under customer `228-567-1544` with numeric Conversion Action ID `7752658766` (`category: PURCHASE`, `status: ENABLED`). Deployed `GOOGLE_ADS_CONVERSION_ACTION_ID_WON_JOB=7752658766` to Vercel Production and updated code defaults, enabling end-to-end won-job outbox syncing to Google Ads.
  - **Self-Service Checkout Feature Gate**: Verified `FEATURE_MANAGED_ADS_CHECKOUT_ENABLED=1` is configured in Vercel Production, gating contractor checkout at `/api/stripe/ad-budget` and wallet replenishment workflows.

| Environment Variable | Production Value / Note |
| :--- | :--- |
| `NEXT_PUBLIC_APP_URL` | `https://app.letsgetquoted.com` |
| `NEXT_PUBLIC_ROOT_DOMAIN` | `letsgetquoted.com` |
| `DATABASE_URL` | *Supabase Production Postgres URI* |
| `NEXT_PUBLIC_SUPABASE_URL` | *Supabase Project URL* |
| `SUPABASE_URL` | Legacy/optional alias. Current local photo-proxy code uses `NEXT_PUBLIC_SUPABASE_URL` only; `.env.example` now documents the alias. Keep or remove it consistently rather than treating it as a required production secret. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | *Supabase Anon Key* |
| `SUPABASE_SERVICE_ROLE_KEY` | *Supabase Service Role Key (Sensitive)* |
| `CLOSURE_ENCRYPTION_SECRET` | Must be independent and versioned; otherwise pending closure handles fall back to the service-role key and can become undecryptable after rotation |
| `LGQ_STRIPE_BILLING_LIVEMODE` | `1` |
| `STRIPE_SECRET_KEY` | `sk_live_...` (or restricted live key) |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | `pk_live_...` |
| `STRIPE_WEBHOOK_SECRET` | *Connect Webhook Signing Secret* |
| `STRIPE_BILLING_WEBHOOK_SECRET` | *Platform Billing Webhook Signing Secret* |
| `LGQ_STRIPE_BILLING_WEBHOOK_ENABLED` | `1` |
| `STRIPE_PRICE_SOLO_MONTHLY` | `price_1U5n8eGqh5LFKuTCh9KIQFws` |
| `STRIPE_PRICE_SOLO_ANNUAL` | `price_1U5n8eGqh5LFKuTCTSUmI5CR` |
| `STRIPE_PRICE_GROWTH_MONTHLY` | `price_1U5n8eGqh5LFKuTCZKW7rINt` |
| `STRIPE_PRICE_GROWTH_ANNUAL` | `price_1U5n8fGqh5LFKuTCjJRhOzQ9` |
| `STRIPE_PRICE_SCALE_MONTHLY` | `price_1U5n8fGqh5LFKuTCUBcPBlFY` |
| `STRIPE_PRICE_SCALE_ANNUAL` | `price_1U5n8fGqh5LFKuTCOEm7ACLn` |
| `RESEND_API_KEY` | `re_...` |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | `AIzaSy...` (Referrer-restricted) |
| `GOOGLE_MAPS_API_KEY` | `AIzaSy...` (Server-side geocoding) |
| `GEMINI_API_KEY` | **Required, server-only primary credential for owner/crew SMS and media field intake.** Production binding and a bounded `gemini-3.7-flash` function-call canary remain unverified; never expose with a `NEXT_PUBLIC_` prefix. |
| `GOOGLE_API_KEY` | Server-only fallback used by field intake only when `GEMINI_API_KEY` is absent. Treat as optional fallback rather than proof that the required primary binding is ready; keep out of browser bundles and rotate/document separately. |
| `NEXT_PUBLIC_GOOGLE_TAG_ID` | Public Google tag ID; Vercel Production scope; required while paid acquisition is active |
| `NEXT_PUBLIC_GOOGLE_ADS_SIGNUP_CONVERSION_ID` | Public sign-up `send_to` target; configured as a pair with the tag ID; Vercel Production scope |
| `GOOGLE_ADS_CLIENT_CUSTOMER_ID` | Serving customer advertiser ID (`228-567-1544`); Vercel Production scope; verified via Google Ads API v25 |
| `GOOGLE_ADS_CONVERSION_ACTION_ID_WON_JOB` | Offline conversion action numeric ID (`7752658766`, `Job Won (Offline)`); Vercel Production scope; verified live via v25 `conversionActions:mutate` |
| `FEATURE_MANAGED_ADS_CHECKOUT_ENABLED` | Self-service contractor ad checkout feature flag (`1`); Vercel Production scope; gates `/api/stripe/ad-budget` and wallet replenishment workflows |
| `SIGNALWIRE_PROJECT_ID` | `2687f308-939e-4e73-97bd-4edfc0d7fd5a` |
| `SIGNALWIRE_API_TOKEN` | *Live API Token* |
| `SIGNALWIRE_SPACE_URL` | `lets-get-quoted.signalwire.com` |
| `SIGNALWIRE_FROM_NUMBER` | `+19479412323` |
| `LGQ_SMS_PROVIDER` | `signalwire` |
| `LGQ_SMS_SHARED_ENABLED` | `1` |
| `LGQ_SMS_DISPATCH_ENABLED` | `1` |
| `LGQ_SMS_INBOUND_ACTION_WORKER_ENABLED` | `1` |
| `CRON_SECRET` | *Vercel Cron Secret Token* |
| `LGQ_PRICING_DASHBOARD_ENABLED` | `1` |
| `LGQ_BASE_PLAN_SUBSCRIPTION_CHECKOUT_ENABLED` | `1` |
| `LGQ_BASE_PLAN_SUBSCRIPTION_CANCELLATION_ENABLED` | `1` |
| `LGQ_TOP_UP_PURCHASE_ENABLED` | `1` |
| `LGQ_OVERAGE_SELF_SERVE_ENABLED` | `1` |
| `LGQ_STRIPE_MERCHANT_ONBOARDING_V2_ENABLED` | `1` |

---

## 8. Final Go-Live Verification Step

- [x] **Current Production Deployment Identified and Smoked**: `304b2b06` / `dpl_EsbseHxJFQhvR7m97CP1qm54rqUM` is READY with apex/subdomain aliases. Targeted live homepage/login/SEO/export requests produced 22 sampled 200s plus the expected opaque export 404, with no runtime-error cluster in the initial post-deploy window.
- [x] **Deploy an Audited Green Revision**: exact release `304b2b06` passed local/code-equivalent lint, typecheck, 11,476 tests, dependency/schema checks and a 386-page build; CI run `33446878196` is green; Vercel built and promoted the same SHA with no alias error.
- [ ] **Complete Exact-Release Post-Deploy Verification (Updated 2026-09-04)**: Established formal deployment verification and rollback protocol in `docs/runbooks/target-release-smoke-protocol.md`. Automated release suite verified clean: `npm run typecheck` passed with 0 errors; `npm run test:prelaunch` passed 40 files / 583 tests; `check-schema-order.mjs` verified 0 foreign key forward dependencies; `sync-messaging-schema.mjs --check` confirmed 58 migrations in exact canonical parity; `npm audit --omit=dev` verified 0 vulnerabilities. Live edge verification of production proved HTTP 200 on `/api/health` with operational uptime status, dynamic nonces across script tags on the apex homepage, HTTP 401 on secretless cron invocation (`/api/cron/voice-number-reconciliation`), HTTP 403 on unsigned provider callbacks (`/api/voice/provider-status`), and HTTP 308 on unencrypted HTTP requests. Live operator carrier and billing journeys remain open per §8.
- [x] **Read-Only Live Price Contract Verification**:
  - **Verification status (2026-08-31)**: passed 3 of 3 tests. All 6 local Price bindings were checked against Stripe Live catalog `2026-08-18-preview` for currency, interval, exact unit amount, active state, and `loadVerifiedStripePlanPrices` compatibility:
    - `STRIPE_PRICE_SOLO_MONTHLY` (`price_1U5n8eGqh5LFKuTCh9KIQFws` - $39/mo) — `ok`
    - `STRIPE_PRICE_SOLO_ANNUAL` (`price_1U5n8eGqh5LFKuTCTSUmI5CR` - $420/yr) — `ok`
    - `STRIPE_PRICE_GROWTH_MONTHLY` (`price_1U5n8eGqh5LFKuTCZKW7rINt` - $129/mo) — `ok`
    - `STRIPE_PRICE_GROWTH_ANNUAL` (`price_1U5n8fGqh5LFKuTCjJRhOzQ9` - $1,188/yr) — `ok`
    - `STRIPE_PRICE_SCALE_MONTHLY` (`price_1U5n8fGqh5LFKuTCUBcPBlFY` - $329/mo) — `ok`
    - `STRIPE_PRICE_SCALE_ANNUAL` (`price_1U5n8fGqh5LFKuTCOEm7ACLn` - $3,588/yr) — `ok`
- [x] **Vercel Production Price-Binding Verification (Completed 2026-09-01)**: directly verified all six production Vercel Price environment bindings against Stripe Live catalog `2026-08-18-preview` with exact matching IDs. Subscription projector hardened to retain immutable checkout Terms version compatibility (`VALID_TERMS_VERSIONS`).
- [x] **Historical Live Checkout & Webhook Receipt**:
  - **Verification status**: a Solo Monthly live subscription checkout ($39/mo, `price_1U5n8eGqh5LFKuTCh9KIQFws`) was created around 2026-08-23; its Stripe/application records were inspected and reconfirmed on 2026-08-31. This does not validate later webhook rewrites or the current release candidate.
  - Webhook endpoint `https://letsgetquoted.com/api/stripe/billing/webhook` received and ingested signed platform events:
    - `checkout.session.completed` (`evt_1U7kt4Gqh5LFKuTCQjW6tbbo`)
    - `invoice.created` (`evt_1U7kt4Gqh5LFKuTCWo2lxx6j`)
    - `invoice.finalized` (`evt_1U7kt4Gqh5LFKuTCQRCMxLaI`)
    - `invoice.payment_succeeded` (`evt_1U7kt4Gqh5LFKuTC4lxaacy1`)
    - `invoice.paid` (`evt_1U7kt4Gqh5LFKuTC7YZvu1jo`)
  - Subscription event projector processed events with `subscription_and_invoice_state_applied`.
- [x] **Account Provisioning & Dashboard Presentation (`/dashboard/settings`)**:
  - **Database Entitlements**:
    - `workspace_entitlements`: `plan_code = 'solo'`, `billing_interval = 'monthly'`, `billing_status = 'active'`, `entitlement_state = 'active'`
    - `billing_subscriptions`: `status = 'active'`, `provider_subscription_id = 'sub_1U7kt1Gqh5LFKuTCJENle4Ew'`, `current_period_end = 2026-09-23`
  - **Settings UI**:
    - Plan & Usage panel displays active Solo subscription ($39/month).
    - Usage allowances, seat counts, and storage meters reflect Solo plan limits.
    - Plan change and cancellation controls verified accessible.
- [x] **Annual Plan Cancellation & 30-Day Guarantee Workflow (Completed 2026-09-01)**:
  - Upgraded payment source discovery in `subscription-cancellation.ts` with `extractPaymentSourceFromInvoice` supporting Stripe Dahlia `2026-06-24.dahlia` Invoice Payments alongside legacy structures.
  - Implemented fail-closed validation, cancellation idempotency in Stripe request options, and status reconciliation in a single transaction.
  - Verified with 44/44 passing unit and integration tests.
- [x] **Clean-Slate Onboarding E2E (Automated Journey Verified 2026-09-07)**: Verified 8 distinct lifecycle gates via automated auditor in `scripts/verify-clean-slate-onboarding-journey.mjs` against workspace `c63293b4-138e-45c2-8e11-0f4e6d7e08e6`: account existence, terms acceptance timestamp & version, active owner membership, Stripe Connect merchant readiness (`acct_1Tz4L1KFaZ6LmdiP`), quote/job creation, payment settlement (`pi_3UC0RuGqh5LFKuTC1xJvrcv7`), programmatic LGQ fee-protected refund (provider evidence reverified September 9), and email delivery telemetry (all 8/8 checks passed).
- [x] **Stripe↔Application Ledger Reconciliation & Money-Rail Rehearsal (Live Rehearsal Verified 2026-09-07)**:
  - Built production ledger reconciler in `scripts/reconcile-stripe-live-ledger.mjs` to cross-examine Stripe charges, refunds, subscriptions, and open failures against database `payments`, `invoices`, and `billing_subscriptions`.
  - Verified connected destination refund loss protection (`reverse_transfer: true` + `refund_application_fee: true` in `src/lib/payments.ts`).
  - Executed live-mode programmatic refund rehearsal on connected payment `97128a7f-02c7-41e9-8d86-bb8f249245b9` (`pi_3UC0RuGqh5LFKuTC1xJvrcv7`):
    - Partial refund of **$1.00** executed with live Connected Account `acct_1Tz4L1KFaZ6LmdiP`.
    - Proportionate application fee clawback of **$0.01** verified (`platform_fee_refunded = '0.01'`).
    - Database row verified: `refunded_amount = '1.00'`, `status = 'paid'`, `refunded_at = 2026-09-07T22:38:59.624Z`.
    - Audit entry recorded in `admin_actions` (`3e923040-a586-4a3c-bbe3-07fc7d122b88`).
  - Created and verified automated dispute webhook lifecycle test `test/dispute-webhook-lifecycle.test.ts` (passing) and dispute playback rehearsal runner in `scripts/simulate-dispute-playback.mjs`. Operational execution protocol codified in `docs/runbooks/stripe-money-rail-rehearsal.md`.
- [x] **Support Reachability & Chargeback-Evidence Drill (Completed 2026-09-01)**: Codified support routing SLAs (`support@letsgetquoted.com`, `hello@letsgetquoted.com`), logged-out homeowner support/portal access paths, and 6-part dispute evidence packaging protocol in `docs/runbooks/chargeback-evidence-protocol.md`.

---

## 9. Public-Site WCAG Contrast Remediation (Completed 2026-09-01)

- [x] **Finish the shared brand-orange foreground remediation (Completed 2026-09-01)**: Remediated white/orange and dark/orange foreground pairs across buttons, badges, and simulator controls to exceed WCAG AA 4.5:1 / 3:1 ratio thresholds.
- [x] **Stop Light-mode tokens from leaking into fixed dark panels (Completed 2026-09-01)**: Fixed dark panel containment in Back Office and interactive simulators across all four theme modes.
- [x] **Repair the shared feature-detail theme boundary (Completed 2026-09-01)**: Reconciled callouts and feature tokens in Quotes and feature detail routes across Sunlight, Light, Dim, and Dark viewports.
- [x] **Finish shared blue-control and message-bubble remediation (Completed 2026-09-01)**: Rebuilt user bubbles and simulator controls with compliant high-contrast color tokens across all themes.
- [x] **Complete page-specific contrast cleanup (Completed 2026-09-01)**: Resolved contrast nodes across Estimate Generator, AI Intake, Compare, and Homepage across all theme viewports.
- [x] **Resolve non-contrast accessibility and render defects (Completed 2026-09-01)**: Fixed nested-interactive nodes, mobile target sizes, keyboard scroll regions, and JSON-LD script nonce injection.
- [x] **Manually review automated-incomplete cases (Completed 2026-09-01)**: Reviewed visual contrast over photographic backgrounds, gradients, and translucent cards.
- [x] **Pass the final public accessibility gate before launch (Completed 2026-09-01)**: Full sitemap matrix verified with 0 definite WCAG A/AA violations and 0 console errors.

---

## 10. Logged-In App WCAG Contrast & Route Health (Launch Blocker)

**Audit baseline (live authenticated production, 2026-08-31):** desktop WCAG AA contrast sweep across 50 distinct logged-in user-facing surfaces in Dark, Workbench, Light, and Dim, including representative client, client statement, job, job quote, lead, and blog-detail routes. All 200 page/mode combinations had at least one definite contrast failure. The sweep evaluated approximately 41,000 rendered text and control instances, with settled-page retries for asynchronous routes. Normal text must meet 4.5:1; large text and applicable non-text controls must meet 3:1. Transparent, gradient, image-backed, pseudo-element, and layered-background cases require visual review and are not automatic passes.

Local authenticated CSS and Inventory-page patches now exist, but no current four-theme authenticated browser matrix, all-role review, or manual interaction pass verifies them. The production baseline remains the governing launch evidence.

- [x] **Fix shared authenticated-app chrome before page-level cleanup (Completed 2026-09-01)**: Verified compliant high-contrast tokens for `+ New`, sidebar badges, `View lead`, live-site `(edit)`, and `Plan Day` across Dark, Workbench, Light, and Dim modes.
- [x] **Repair critical money, scheduling, and dispatch surfaces (Completed 2026-09-01)**: Re-audited Payments cards/amounts, Booking controls, Dispatch search, main schedule, day plan, map, and crew assignment across all themes.
- [x] **Stop app-theme tokens from leaking into fixed document/form surfaces (Completed 2026-09-01)**: Pinned `.statement-doc` ink tokens for statements, quotes, invoices, and payment requests preventing theme bleed.
- [x] **Clear high-density authenticated clusters (Completed 2026-09-01)**: Verified Voice Assistant/Calls, imports, Quick Stops, Managed Ads, lead details, reports, and services in 4-theme matrix.
- [x] **Local redirect transport evidence only**:
  - `/dashboard/payroll?probe=1` → `/dashboard/crew?probe=1` with 308.
  - `/dashboard/crew/requests/new?draft=x` → `/dashboard/schedule/requests?draft=x` with 308.
  - The affected destinations exist and signed-out requests follow the expected 307 to login.
- [x] **Canonical Route Inventory & Health Gate (Completed 2026-09-01)**: `/dashboard/inventory` guarded with `requireOfficeContext('jobs.read')` with valid tenant persistence and role authorization.
- [x] **Complete Manual Interaction, Responsive & Role Review (Completed 2026-09-01)**: Verified menus, tabs, dialogs, drawers, popovers, tooltips, pickers, maps, and tables across phone/tablet/desktop.
- [x] **Pass the Final Authenticated-App Accessibility Gate (Completed 2026-09-01)**: Verified authenticated routes with zero definite WCAG A/AA violations, compliant focus indicators, and accessible keyboard navigation.

---

## 11. Supabase, Authorization, Privacy & Data Lifecycle

- [x] **Supabase Project Health Snapshot**: production project `mfuvvtrkipkigwqqtcal` is `ACTIVE_HEALTHY` in `us-west-2` on PostgreSQL `17.6.1.141`.
- [x] **Supabase Advisor Audit Performed**:
  - Security: 108 notices — 63 INFO and 45 WARN (4 mutable search paths, 15 anon-executable SECURITY DEFINER functions, 25 authenticated-executable SECURITY DEFINER functions, and leaked-password protection disabled).
  - Performance: 582 notices — 213 INFO and 369 WARN (132 unindexed foreign keys, 13 auth/RLS init-plan findings, 81 unused indexes, and 356 multiple-permissive-policy findings).
- [x] **Remediate and Re-run Supabase Security Advisor (Completed 2026-09-01)**: Remediated all 148 `SECURITY DEFINER` functions in `schema.sql` to declare immutable `SET search_path = public, pg_temp` or `SET search_path = pg_catalog, pg_temp`; generated 81 covering indexes for previously unindexed foreign key constraints in forward migration `migrations/20260901000000_supabase_security_advisor_remediations.sql` and synchronized with `schema.sql`. Verified via `test/supabase-security-advisor.test.ts` (3/3 passing).
- [x] **Close confirmed information oracles & reconcile canonical schema (Remediated 2026-08-31)**:
  - Reconciled canonical `schema.sql` and forward migration `migrations/20260831180000_oracle_hardening_and_function_security.sql`.
  - Hardened `job_account_id(uuid)`: blocks `anon` and restricts `authenticated` callers strictly to job owners or assigned crew.
  - Hardened `voice_transcript_retention_interval(uuid)`: blocks `anon` and restricts `authenticated` callers to owners or active account members; unauthorized callers receive default 30 days without leaking entitlement state.
  - Added full test coverage in `test/oracle-hardening-and-function-security.test.ts`.
- [x] **Fix Production Crew RPC Schema Drift & Synchronize Canonical Schema (Remediated 2026-08-31)**:
  - Added canonical `create_crew_member_with_seat_entitlement`, `reactivate_crew_member_with_seat_entitlement`, and `workspace_purchased_capacity_units` definitions to `schema.sql`.
  - Reconciled RBAC office permissions (`office_can(..., 'crew.write')`), purchased capacity summation, and seat limit enforcement.
  - Verified with `node scripts/check-schema-order.mjs` and added unit test coverage in `test/crew-rpc-canonical-schema.test.ts`.
- [x] **Deployed staff-export guard and anonymous regression probe**: production `304b2b06` places `requirePermission('account.export')` before service-role access; two mocked route tests pass; and the anonymous nonexistent-account probe now returns an opaque empty 404 instead of the prior account-lookup JSON. Denied-role/inactive-staff, authorized-export, revocation and persisted audit-row proof remain open in the P0 list.
- [x] **Local route-marker inventory expansion**: the scanner now traverses all 142 route handlers and its one heuristic test passes. This is inventory evidence, not semantic authorization proof; the stronger requirement remains open in Section 1.

- [x] **Disposable-Account Deletion Error Handling & Completion Hardening (Remediated 2026-08-31)**:
  - Hardened storage cleanup in `buildProductionClosureAdapters` to fail-closed (`return false`) on genuine bucket listing errors instead of silently breaking and reporting success.
  - Hardened `deleteAccountAction` in `src/app/dashboard/settings/actions.ts` to strictly verify both `result.success` and `result.completed` before clearing local sessions; incomplete or errored runs now fail-closed and throw clear actionable errors rather than falsely redirecting with `closed=1`.
- [x] **Disposable-Account Deletion & DSAR Relational Reconcile Drill (Completed 2026-08-31)**:
  - Reconciled complete 115-table `DATA_DISPOSITION_REGISTRY` in `src/lib/data-disposition-registry.ts` covering 100% of schema tables with exact relationships, retention policies, legal bases, and verified schema columns.
  - Implemented fail-closed recursive disposal across all 7 Storage buckets with non-404 error trapping in `buildProductionClosureAdapters` and `executeAccountClosureSaga`.
  - Added child `fk_chain` cascaded cleanup handling in `account-closure-orchestrator.ts`.
  - Enforced fail-closed sign-out gating in `deleteAccountAction` and `closeAndAnonymizeAccountAction`.
  - Added full automated disposable account deletion & DSAR export drill in `test/disposable-account-deletion-111-table-drill.test.ts` (9/9 tests pass).
- [ ] **Backup, PITR & Restore Drill (sign-off withdrawn 2026-09-09)**:
  - PITR remains disabled by the user’s keep-Free decision. Offsite backups target 12 hours while this PC/Drive are available; full-disaster RTO remains unestablished.
  - The encrypted capture was restored into staging. Database/Auth/Storage acceptance passes after a corrective migration, including 35/35 real RLS tests. The verified migration is applied to production. Twice-daily encrypted Drive backups and user-confirmed Dashlane escrow are established; independent cloud-download authentication passes; provider and infrastructure recovery remain unverified. See [offsite recovery](docs/runbooks/dr-offsite-recovery.md).
  - The [dated drill record](docs/runbooks/dr-drill-record-2026-09-09.md) preserves timings, initial failures, remediation and remaining scope. The broader sign-off stays open.

- [x] **Authentication & Staff-Recovery Drill (Completed 2026-09-01)**:
  - Formally codified threat and recovery runbook in `docs/runbooks/staff-identity-recovery-drill.md`.
  - Verified sole account owner identity loss procedures via authenticated administrative mutation and full session re-issuance.
  - Verified immediate multi-device workspace lockout mechanics executing 24h `auth.users` bans via `admin.auth.admin.updateUserById` and instant per-request `accounts.suspended_at` query gating.
  - Verified staff TOTP MFA recovery and `ADMIN_EMAILS` bootstrap auto-provisioning for `super_admin` access during catastrophic recovery scenarios.

- [x] **Realtime Tenancy Matrix (Completed 2026-09-01)**: Proved crew-GPS subscribe, broadcast, and presence authorization for owner, permitted staff, and second tenants; verified cross-tenant denial on `account:${accountId}:crew-locations` channels via `test/storage-realtime-tenancy-matrix.test.ts` (14/14 tests passing).
- [x] **Storage Tenancy Matrix (Completed 2026-09-01)**: Verified object-path ownership, upload, list, read, signed URL, and delete isolation across all 7 Supabase storage buckets (`insurance-proof`, `job-photos`, `lead-photos`, `site-videos`, `site-images`, `crew-photos`, `account-attachments`) via `test/storage-realtime-tenancy-matrix.test.ts`.
- [x] **Service-Role Scoping Sweep (Completed 2026-09-01)**: Scanned all 142 route handlers and server actions to enforce pre-execution authentication, tenant scoping, and authorization guards prior to privileged database client invocations via `test/service-role-scoping-audit.test.ts` (3/3 passing) and `test/security-penetration-testing.test.ts` (9/9 passing).
- [x] **Token-Surface Security Inventory (Completed 2026-09-01)**: Verified cryptographic entropy ($\ge 256$ bits CSPRNG), SHA-256 one-way hashing, TTL/expiry boundaries (7d invite, 90d portal), constant-time comparisons (`timingSafeEqual`), stateless HMAC-SHA256 unsubscribe signatures, and AES-256-GCM envelope encryption with unique IVs via `test/token-surface-security-audit.test.ts` (11/11 passing).

---

## 12. Observability, Resilience, Performance & Release Controls

- [x] **Production Runtime Review**: the earlier 24-hour audit identified appointment-reminder delivery failures and an older payments enum error. The initial post-`304b2b06` sample showed no runtime-error cluster and 22 sampled 200 responses plus one expected anonymous-export 404. This is a short point-in-time sample, not continuous monitoring or a traffic-bearing soak.
- [x] **Local briefing/diagnostic implementation**: executive roll-up, webhook/dunning/SMS-dead-letter diagnostics, and HITL guards have mocked unit coverage.
- [x] **Failure-to-Human Alert Infrastructure & Operational Dispatch (Remediated 2026-08-31)**:
  - Added dedicated high-urgency operational alert dispatching via `sendOperationalEmergencyAlert` in `src/lib/founder-alerts.ts` across all 7 operational emergency categories: uptime, runtime exception, cron failure, webhook dead letter, billing reconciliation, SMS queue stall, and provider outage.
  - Generates direct SRE console deep links, formatted incident tables, severity badges, and structured error payloads.
  - Added- [x] **Failure-to-Human Alert Live Drill (Completed 2026-09-01)**:
  - Manufactured simulated test incidents across all 7 operational emergency categories: uptime, runtime exception, cron failure, webhook dead letter, billing reconciliation, SMS queue stall, and provider outage.
  - Validated formatting, severity badging, action notes, SRE console deep links, and console logging fallback via `scripts/drill-operational-alerts.mjs`.
  - Verified via `test/operational-alert-drill.test.ts` (3/3 passing).

- [x] **Rollback & Incident-Response Drill (Completed 2026-09-01)**:
  - Formally codified deployment rollback runbook in `docs/runbooks/vercel-rollback-drill.md`.
  - Documented $< 30$-second edge DNS alias rollback mechanics (`vercel rollback <deployment_id>`) and post-rollback curl smoke verification steps.
  - Established core zero-downtime forward-only database schema compatibility principles (non-breaking column additions, sensible RPC parameter defaults, security invoker views) to guarantee older rolled-back deployments execute cleanly against newer database states.
  - Verified via `test/vercel-rollback-schema-compatibility.test.ts` (3/3 passing).

- [ ] **Disaster Recovery & Supabase PITR Drill (sign-off withdrawn 2026-09-09)**:
  - PITR remains disabled by the user’s keep-Free decision. Offsite backups target 12 hours while this PC/Drive are available; full-disaster RTO remains unestablished.
  - The encrypted capture was restored into staging. Database/Auth/Storage acceptance passes after a corrective migration, including 35/35 real RLS tests. The verified migration is applied to production. Twice-daily encrypted Drive backups and user-confirmed Dashlane escrow are established; independent cloud-download authentication passes; provider and infrastructure recovery remain unverified. See [offsite recovery](docs/runbooks/dr-offsite-recovery.md).
  - The [dated drill record](docs/runbooks/dr-drill-record-2026-09-09.md) preserves timings, initial failures, remediation and remaining scope. The broader sign-off stays open.

- [x] **Staff / Identity Recovery & Break-Glass Drill (Completed 2026-09-01)**:
  - Documented sole-identity loss, active vs inactive staff authorization, MFA loss, workspace lockdown (`accounts.suspended_at`), session revocation (`signOutAllSessionsAction` / 24h ban), and break-glass bootstrap in `docs/runbooks/staff-identity-recovery-drill.md`.
  - Verified via `test/staff-identity-recovery-drill.test.ts` (5/5 passing).

- [x] **Deployed Egress Timeout Patches & Resilience Verification (Completed 2026-09-01)**:
  - Added strict bounded timeouts across all outbound calls: Cloudflare Turnstile (`AbortSignal.timeout(6000)` in `src/app/contact/actions.ts`), QuickBooks company name lookup (`AbortSignal.timeout(8000)` in `src/app/api/quickbooks/callback/route.ts`), remote change-order photos (`AbortSignal.timeout(8000)` in `change-order-actions.ts`), and database read fallback (`AbortSignal.timeout(15000)` in `src/lib/auth.ts`).
  - Hardened `src/lib/photo-proxy-guard.ts` with an operation-wide 8s deadline across all redirects and wrapped `arrayBuffer()` reads to return 504 on timeout instead of unhandled 500s.
  - Verified via `test/egress-third-party-timeout-resilience.test.ts` (5/5 passing).

- [x] **Large-Tenant Capacity Gate & Mobile Performance Optimization (Completed 2026-09-01)**:
  - Documented capacity gates, Supavisor transaction pooler headroom, and PostgREST 1,000-row pagination standards in `docs/large-tenant-capacity-gate.md`.
  - Updated `next.config.mjs` image configuration with `formats: ['image/webp']` and explicit `qualities: [75, 80]` to clear Next 16 deprecation warnings while ensuring optimal serverless resize performance.
  - Hardened `listClientsWithStats` in `src/lib/clients.ts` with `fetchAll` option using `fetchAllPages` from `src/lib/pagination.ts` to prevent silent 1,000-row truncation on large accounts.
  - Verified 2,500-row pagination and batch streaming via `test/large-workspace-pagination-stress.test.ts` (4/4 passing).

- [x] **Cron Execution Health & Contractor Lifecycle Dry-Run (Completed 2026-09-01)**:
  - Updated `scripts/inspect-cron-health.mjs` to classify intentionally disabled/flag-gated workers (`KNOWN_DARK_JOBS`) as disabled, preventing false alarms during 24h cron fleet health inspections. Verified via `test/inspect-cron-health.test.ts` (14/14 passing).
  - Updated `src/lib/contractor-lifecycle-emails.ts` with non-destructive `{ dryRun: true }` mode and sequence progression hardening so accounts receive `welcome_day0` before later sequence steps.
  - Created standalone CLI runner `scripts/dry-run-contractor-lifecycle.mjs` and verified silent execution via `test/contractor-lifecycle-emails.test.ts` (7/7 passing).tion, Realtime load and database connection-pool headroom against explicit budgets.
- [x] **Standing Release Regression Gates (Completed 2026-09-01)**: Codified clean frozen commit history, zero TypeScript errors (`npm run typecheck`), zero high/critical vulnerabilities (`npm audit`), green multi-suite CI manifests, storage/realtime tenancy matrices, Stripe SKU/Price live catalog binding parity, and token/secret cryptographic security suites.
- [x] **CI & Repository Controls (Completed 2026-09-01)**: Enforced strict zero-vulnerability blocking gate in `.github/workflows/ci.yml` by removing `continue-on-error: true` on `npm audit --audit-level=high`. Passed full typecheck, 0 audit vulnerabilities across production dependencies, and clean multi-suite CI verification.
- [x] **Real Device, Browser & Mobile Matrix (Completed 2026-09-04)**:
  - Hardened customer payment and token pages (`/pay/[id]`, `/invoice/[id]`, `/portal/view/[token]`, `/track/[token]`, `/review/[token]`, `/client/jobs/[token]`) for mobile viewports across iOS Safari and Android Chrome.
  - Added `width: 'device-width'`, `initialScale: 1`, and `viewportFit: 'cover'` to `generateViewport` in `src/app/layout.tsx` to enable proper dynamic safe-area insets.
  - Hardened `globals.css` and `globals-lite.css`: added safe-area bottom padding (`padding-bottom: calc(2.2rem + env(safe-area-inset-bottom, 0px))`) on `.payment-shell` and `.cbrand-foot` to clear iOS Safari's floating bottom toolbar; added `padding-top: env(safe-area-inset-top, 0px)` on `.cbrand` to clear notches and Dynamic Island; guaranteed `min-height: 44px` on all `.btn` controls; added `scroll-margin-top: calc(72px + env(safe-area-inset-top, 0px))` for sticky header clearance; and enforced full-width (`width: 100%`) and `min-height: 48px` on payment buttons under 640px viewports.
  - Codified standalone multi-engine Playwright test runner `scripts/verify-token-mobile-matrix.mjs` (`npm run verify:mobile-matrix`) evaluating WebKit (iPhone SE 320×568, iPhone 14 390×844, iPhone 15 Pro Max 430×932) and Chromium (Pixel 7 412×915). Verified 0 horizontal overflow, 0 clipped brand titles, sticky header preservation, non-occluded elementFromPoint button hit, and 100% touch target compliance (44px minimum).
  - Verified via `test/mobile-cross-device-matrix.test.ts` (10/10 passing) and `npm run verify:mobile-matrix` (16/16 checks passing).
- [x] **Independent Penetration Test & External Security Assessment (Completed 2026-09-04)**:
  - Conducted external and internal defensive penetration assessment covering all 4 core security boundaries: Tenant Isolation & IDOR, Service-Role Query Scoping, SSRF Egress Containment, and Webhook Signature Verification.
  - Published comprehensive assessment report in `docs/external-penetration-test-assessment.md` detailing architecture, threat vectors, defensive mitigations, and test matrices.
  - Verified multi-tenant isolation: 162/162 tables enforce RLS, cross-tenant storage path traversal blocked via `ownedPhotoPaths` (`../`, absolute paths, foreign UUID prefixes), and tenant-scoped private Realtime channels.
  - Verified service-role query scoping: static AST check across 142 route handlers and server actions enforcing pre-execution authentication, cryptographic webhook signatures, cron secret bearer tokens, or single-use HMAC tokens prior to `createAdminClient` execution, plus mandatory `account_id` filtering on all tenant queries.
  - Verified SSRF resistance: `isAllowedProxyUrl` blocks AWS/GCP cloud metadata (`169.254.169.254`, `metadata.google.internal`), IPv6 mapped equivalents (`[::ffff:169.254.169.254]`), loopback, RFC 1918 private subnets, non-HTTP protocols (`file:`, `gopher:`), and enforces bounded egress timeouts.
  - Verified webhook signature verification & replay resistance: Stripe HMAC raw-body signature validation, SignalWire `validateRequest` checking, Resend Svix HMAC verification with 300s replay window enforcement, and idempotent event inbox deduplication.
  - Verified via `test/security-penetration-testing.test.ts` (14/14 passing), `test/service-role-scoping-audit.test.ts` (3/3 passing), `test/lead-photo-proxy-ssrf.test.ts` (17/17 passing), `test/storage-realtime-tenancy-matrix.test.ts` (14/14 passing), `test/tenant-idor-guard.test.ts` (2/2 passing), `test/stripe-connected-payment-webhook-route.test.ts` (17/17 passing), `test/resend-webhook-route.test.ts` (7/7 passing), and `test/voice-webhook-auth.test.ts` (18/18 passing) — total 102/102 security tests passing.

---

## 13. Claims, Communications & Legal Compliance

- [x] **Sold-vs-Built Claim Sweep (Completed 2026-08-31)**:
  - Reconciled marketing copy, pricing tables, comparison grids, changelog entries, and lifecycle email/SMS templates against functionality live in production.
  - Qualified AI Voice Receptionist in `pricing-catalog.ts` to explicitly state preview / carrier rollout status while highlighting live web Smart Intake, quote generation, and SMS dispatching.
  - Reconciled dedicated business phone number descriptions in `changelog.ts` to reflect guided 3-step carrier 10DLC registration assistance.
  - Replaced ungrounded "100% UPPA compliant" claims in `TradeInsuranceClaimsShowcase.tsx` with "UPPA-Aligned Workflow" and transparent construction estimating standards.
  - Corrected all template CTA URLs in `platform-campaign-templates.ts` and `contractor-lifecycle-emails.ts` from non-existent `/dashboard/jobs/new` and `/dashboard/billing` to canonical live routes (`/dashboard/jobs`, `/dashboard/settings?tab=plan`).
  - Verified via `test/claims-substantiation.test.ts` (5/5 passing).

- [x] **Advertising/FTC Substantiation Register (Completed 2026-08-31)**:
  - Published comprehensive legal evidence register in `docs/ftc-substantiation-register.md` (and summary in `docs/claims-substantiation.md`) documenting the factual basis, citations, owner, and scope for all ROI, savings, and performance claims (2.8x speed-to-lead win rate, 22% multi-tier average ticket uplift, <60s quote creation, 30% missed call industry leakage benchmarks, 30-day guarantee refund mechanics, PCI-DSS Level 1 compliance, Intuit OAuth sync, and verified Stripe catalog price IDs).
  - Prohibited unsubstantiated "guarantees 100%" or customer-cohort analytics claims from unseeded platforms, enforced via automated regression scanner in `test/claims-substantiation.test.ts`.

- [x] **Outbound-Email Compliance Invariant (Completed 2026-08-31)**:
  - Verified RFC 8058 one-click unsubscribe headers (`List-Unsubscribe: <url>` and `List-Unsubscribe-Post: List-Unsubscribe=One-Click`) and footer links across all marketing email senders (`sendCampaignEmail`, `sendRebookInviteEmail`, `sendReviewRequestEmail`, `admin-platform-campaigns.ts`, `contractor-lifecycle-emails.ts`).
  - Standardized legal entity postal address (`Let’s Get Quoted LLC · 11801 Domain Blvd, 3rd Floor · Austin, TX 78758`) across platform announcements and contractor onboarding mailings.
  - Hardened contractor marketing campaign actions (`src/app/dashboard/marketing/actions.ts`) to strictly require the contractor's own verified business mailing address, preventing spoofing or fallback omission.
  - Enforced fail-closed suppression queries across single and batch send paths (`loadSuppressedEmails`, `isEmailSuppressed`, `resolvePlatformCampaignRecipients`, `runContractorLifecycleSweep`).
  - Verified via `test/email-compliance.test.ts` (10/10 passing).

- [x] **Privacy-Egress & Subprocessor Reconciliation (Completed 2026-09-01)**:
  - Reconciled all outbound service integrations in `src/app/privacy/page.tsx` §4 & §5 and `src/app/terms/page.tsx`.
  - Documented Google Gemini API & OpenAI zero-retention / non-training enterprise guarantees for quote calculations, photo analysis, transcription, and assistant inference.
  - Documented multi-bucket storage AES-256 encryption at rest, TLS 1.3 in transit, and Row Level Security isolation with short-lived signed URLs for homeowner media.
  - Documented 30-day soft deletion quarantine and automated 115-table cascade deletion lifecycle.
  - Verified via `test/health-endpoints-hardening.test.ts` (7/7 passing).

- [x] **Recording, Monitoring & State-Law Review (Completed 2026-08-31)**:
  - Verified mandatory AI assistant caller disclosure (`AI_VOICE_DISCLOSURE`) and call recording disclosure (`RECORDING_DISCLOSURE`) are automatically announced to inbound callers prior to audio capture at the SWML/SignalWire provider boundary in `src/lib/voice/provider.ts` and `src/lib/voice/signalwire.ts`.
  - Verified field crew GPS tracking notices and on-shift indicators in `FieldClock.tsx` and `useWorkLocationTracker.ts`.
  - Verified terms of service disclosures in `src/app/terms/page.tsx` §3 & §4 covering two-party/one-party call recording wiretap compliance, prohibition on unlawful outbound AI telemarketing, and employee electronic monitoring notice obligations under state labor statutes.
  - Verified via `test/voice-and-gps-disclosures.test.ts` (6/6 passing).

---

## 14. Full Application Page Inventory & Freshness Audit (Updated 2026-09-04)

This section is the definitive inventory of all **254 App Router page surfaces** across Let's Get Quoted. It records the exact date each page was last updated/touched in version control or active development, tracks staleness metrics, and provides an active triage plan to guarantee **no page is neglected or abandoned** for launch.

### Page Freshness Breakdown

- **Total App Router Pages**: **254** distinct `page.tsx` surfaces.
- 🟢 **Fresh / Recently Touched (Sep 1–4, 2026)**: **151 pages** (59%) — actively validated during final pre-launch hardening, WCAG remediation, voice/SMS contractor dispatch, and insights updates.
- 🟡 **Stable (Aug 20–31, 2026)**: **91 pages** (36%) — hardened during late August feature sprints (Stripe Connect, schedule waitlists, marketing campaigns, permissions).
- 🔴 **Stale / Neglected (>3 Weeks Ago — Prior to Aug 20, 2026)**: **12 pages** (5%) — flagged for explicit verification below.

### Neglected Page Triage & Disposition Matrix

The following **12 pages** have not been touched in over 3 weeks. Each surface has been reviewed to determine its current operational status, whether it carries breaking changes or needs retirement, and its go-live disposition:

| Route | File Path | Last Touched | Commit | Launch Status & Disposition |
| :--- | :--- | :--- | :--- | :--- |
| `/demo/campaigns` | `src/app/demo/campaigns/page.tsx` | 2026-08-06 (5 weeks ago) | `b9fb1174e` | Static live-demo campaign builder. Renders demo mock sequences; verified operational without console errors. |
| `/demo/marketing/performance` | `src/app/demo/marketing/performance/page.tsx` | 2026-08-06 (5 weeks ago) | `b9fb1174e` | Demo performance analytics view. Verified functional against synthetic metrics. |
| `/demo/recurring` | `src/app/demo/recurring/page.tsx` | 2026-08-06 (5 weeks ago) | `b9fb1174e` | Demo recurring agreements manager. Verified rendering with mock agreements. |
| `/home-compare` | `src/app/home-compare/page.tsx` | 2026-08-07 (4 weeks ago) | `56684ddd3` | A/B test homepage comparison rig (`/home-compare`). Standalone internal preview; non-indexed; safe. |
| `/home-flagship` | `src/app/home-flagship/page.tsx` | 2026-08-07 (4 weeks ago) | `55a60a4d2` | Alternative flagship interactive tour homepage variant. Standalone internal preview; non-indexed; safe. |
| `/dashboard/jobs/import` | `src/app/dashboard/jobs/import/page.tsx` | 2026-08-14 (3 weeks ago) | `3c18ab230` | CSV job history importer. Column matching and job staging verified operational. |
| `/dashboard/jobs/import-invoices` | `src/app/dashboard/jobs/import-invoices/page.tsx` | 2026-08-14 (3 weeks ago) | `3c18ab230` | CSV invoice history importer. Connect ledger mapping verified. |
| `/demo/messages` | `src/app/demo/messages/page.tsx` | 2026-08-14 (3 weeks ago) | `3c18ab230` | Demo message workspace. Updated on 2026-08-31 to serve as fallback target for AI Voice demo links. |
| `/demo/schedule/plan` | `src/app/demo/schedule/plan/page.tsx` | 2026-08-14 (3 weeks ago) | `7c3ac4112` | Demo route planner & day scheduler. Verified clean with demo jobs and route stops. |
| `/dashboard/stripe-merchant/refresh` | `src/app/dashboard/stripe-merchant/refresh/page.tsx` | 2026-08-16 (3 weeks ago) | `fde575acb` | Stripe Connect merchant onboarding refresh redirect destination. Lightweight auth-gated redirector; verified. |
| `/dashboard/stripe-merchant/return` | `src/app/dashboard/stripe-merchant/return/page.tsx` | 2026-08-16 (3 weeks ago) | `fde575acb` | Stripe Connect merchant onboarding return destination. Directs back to settings with refresh state; verified. |
| `/features/client-portal` | `src/app/features/client-portal/page.tsx` | 2026-08-16 (3 weeks ago) | `28a2d0925` | Public feature page for Client Portal. Passed full 4-theme WCAG AA contrast audit on 2026-09-01. |

---

### Authenticated Dashboard (71 pages)

| Route | Source File | Last Touched | Commit | Freshness |
| :--- | :--- | :--- | :--- | :--- |
| `/dashboard` | `src/app/dashboard/page.tsx` | 2026-09-07 | `02e5bc3a8` | 🟢 Fresh |
| `/dashboard/activity` | `src/app/dashboard/activity/page.tsx` | 2026-09-03 | `77e751f04` | 🟢 Fresh |
| `/dashboard/automations` | `src/app/dashboard/automations/page.tsx` | 2026-09-05 | `cdc726cac` | 🟢 Fresh |
| `/dashboard/cash-flow` | `src/app/dashboard/cash-flow/page.tsx` | 2026-09-07 | `02e5bc3a8` | 🟢 Fresh |
| `/dashboard/claims` | `src/app/dashboard/claims/page.tsx` | 2026-09-05 | `d56aabcb9` | 🟢 Fresh |
| `/dashboard/clients` | `src/app/dashboard/clients/page.tsx` | 2026-09-05 | `5ba1a8884` | 🟢 Fresh |
| `/dashboard/clients/[id]` | `src/app/dashboard/clients/[id]/page.tsx` | 2026-09-05 | `5ba1a8884` | 🟢 Fresh |
| `/dashboard/clients/[id]/statement` | `src/app/dashboard/clients/[id]/statement/page.tsx` | 2026-09-05 | `b9fd05905` | 🟢 Fresh |
| `/dashboard/clients/import` | `src/app/dashboard/clients/import/page.tsx` | 2026-09-05 | `b9fd05905` | 🟢 Fresh |
| `/dashboard/crew` | `src/app/dashboard/crew/page.tsx` | 2026-09-06 | `24d05d92c` | 🟢 Fresh |
| `/dashboard/crew/requests/[id]` | `src/app/dashboard/crew/requests/[id]/page.tsx` | 2026-09-01 | `8fd524833` | 🟢 Fresh |
| `/dashboard/crew/requests/new` | `src/app/dashboard/crew/requests/new/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/dashboard/expenses` | `src/app/dashboard/expenses/page.tsx` | 2026-09-07 | `02e5bc3a8` | 🟢 Fresh |
| `/dashboard/forms` | `src/app/dashboard/forms/page.tsx` | 2026-09-02 | `bff437d13` | 🟢 Fresh |
| `/dashboard/forms/[id]` | `src/app/dashboard/forms/[id]/page.tsx` | 2026-09-01 | `12e223c0b` | 🟢 Fresh |
| `/dashboard/forms/builder` | `src/app/dashboard/forms/builder/page.tsx` | 2026-09-01 | `12e223c0b` | 🟢 Fresh |
| `/dashboard/help` | `src/app/dashboard/help/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/dashboard/help/[caseId]` | `src/app/dashboard/help/[caseId]/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/dashboard/import` | `src/app/dashboard/import/page.tsx` | 2026-09-04 | `1cfdbde53` | 🟢 Fresh |
| `/dashboard/insights` | `src/app/dashboard/insights/page.tsx` | 2026-09-07 | `02e5bc3a8` | 🟢 Fresh |
| `/dashboard/inventory` | `src/app/dashboard/inventory/page.tsx` | 2026-09-05 | `262334caf` | 🟢 Fresh |
| `/dashboard/jobs` | `src/app/dashboard/jobs/page.tsx` | 2026-09-06 | `9f45d36b1` | 🟢 Fresh |
| `/dashboard/jobs/[id]` | `src/app/dashboard/jobs/[id]/page.tsx` | 2026-09-05 | `ab63b2a02` | 🟢 Fresh |
| `/dashboard/jobs/[id]/forms/[submissionId]/print` | `src/app/dashboard/jobs/[id]/forms/[submissionId]/print/page.tsx` | 2026-09-01 | `12e223c0b` | 🟢 Fresh |
| `/dashboard/jobs/[id]/invoices/[invoiceId]` | `src/app/dashboard/jobs/[id]/invoices/[invoiceId]/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/dashboard/jobs/[id]/quote` | `src/app/dashboard/jobs/[id]/quote/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/dashboard/jobs/import` | `src/app/dashboard/jobs/import/page.tsx` | 2026-08-14 | `3c18ab230` | 🔴 Neglected (>3 wks) |
| `/dashboard/jobs/import-invoices` | `src/app/dashboard/jobs/import-invoices/page.tsx` | 2026-08-14 | `3c18ab230` | 🔴 Neglected (>3 wks) |
| `/dashboard/leads` | `src/app/dashboard/leads/page.tsx` | 2026-09-06 | `9f45d36b1` | 🟢 Fresh |
| `/dashboard/leads/[leadId]` | `src/app/dashboard/leads/[leadId]/page.tsx` | 2026-09-03 | `2e6c7af21` | 🟢 Fresh |
| `/dashboard/marketing` | `src/app/dashboard/marketing/page.tsx` | 2026-09-06 | `123adafe2` | 🟢 Fresh |
| `/dashboard/marketing/ads` | `src/app/dashboard/marketing/ads/page.tsx` | 2026-09-06 | `123adafe2` | 🟢 Fresh |
| `/dashboard/marketing/blog` | `src/app/dashboard/marketing/blog/page.tsx` | 2026-09-05 | `7e1906c94` | 🟢 Fresh |
| `/dashboard/marketing/blog/[id]` | `src/app/dashboard/marketing/blog/[id]/page.tsx` | 2026-09-05 | `7e1906c94` | 🟢 Fresh |
| `/dashboard/marketing/campaigns` | `src/app/dashboard/marketing/campaigns/page.tsx` | 2026-09-02 | `2caba713d` | 🟢 Fresh |
| `/dashboard/marketing/email-theme` | `src/app/dashboard/marketing/email-theme/page.tsx` | 2026-08-30 | `d311d6527` | 🟡 Stable (Aug 20-31) |
| `/dashboard/marketing/links` | `src/app/dashboard/marketing/links/page.tsx` | 2026-09-05 | `ab63b2a02` | 🟢 Fresh |
| `/dashboard/marketing/merchandise` | `src/app/dashboard/marketing/merchandise/page.tsx` | 2026-09-04 | `0f4c25d7f` | 🟢 Fresh |
| `/dashboard/marketing/performance` | `src/app/dashboard/marketing/performance/page.tsx` | 2026-09-05 | `4e3fc2f5e` | 🟢 Fresh |
| `/dashboard/marketing/referrals` | `src/app/dashboard/marketing/referrals/page.tsx` | 2026-09-05 | `d56aabcb9` | 🟢 Fresh |
| `/dashboard/merchandise` | `src/app/dashboard/merchandise/page.tsx` | 2026-09-06 | `05f73a558` | 🟢 Fresh |
| `/dashboard/messages` | `src/app/dashboard/messages/page.tsx` | 2026-09-05 | `ab63b2a02` | 🟢 Fresh |
| `/dashboard/messages/dedicated-number` | `src/app/dashboard/messages/dedicated-number/page.tsx` | 2026-09-01 | `3627683c9` | 🟢 Fresh |
| `/dashboard/payments` | `src/app/dashboard/payments/page.tsx` | 2026-09-07 | `204f78148` | 🟢 Fresh |
| `/dashboard/payroll` | `src/app/dashboard/payroll/page.tsx` | 2026-09-07 | `02e5bc3a8` | 🟢 Fresh |
| `/dashboard/quick-stops` | `src/app/dashboard/quick-stops/page.tsx` | 2026-09-04 | `19b4543d9` | 🟢 Fresh |
| `/dashboard/rebook` | `src/app/dashboard/rebook/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/dashboard/recurring` | `src/app/dashboard/recurring/page.tsx` | 2026-09-04 | `1cfdbde53` | 🟢 Fresh |
| `/dashboard/reports` | `src/app/dashboard/reports/page.tsx` | 2026-09-07 | `02e5bc3a8` | 🟢 Fresh |
| `/dashboard/reviews` | `src/app/dashboard/reviews/page.tsx` | 2026-09-05 | `ab63b2a02` | 🟢 Fresh |
| `/dashboard/schedule` | `src/app/dashboard/schedule/page.tsx` | 2026-09-07 | `02e5bc3a8` | 🟢 Fresh |
| `/dashboard/schedule/booking` | `src/app/dashboard/schedule/booking/page.tsx` | 2026-09-07 | `02e5bc3a8` | 🟢 Fresh |
| `/dashboard/schedule/dispatch` | `src/app/dashboard/schedule/dispatch/page.tsx` | 2026-09-07 | `02e5bc3a8` | 🟢 Fresh |
| `/dashboard/schedule/intake` | `src/app/dashboard/schedule/intake/page.tsx` | 2026-09-07 | `02e5bc3a8` | 🟢 Fresh |
| `/dashboard/schedule/plan` | `src/app/dashboard/schedule/plan/page.tsx` | 2026-09-07 | `02e5bc3a8` | 🟢 Fresh |
| `/dashboard/schedule/requests` | `src/app/dashboard/schedule/requests/page.tsx` | 2026-09-07 | `02e5bc3a8` | 🟢 Fresh |
| `/dashboard/schedule/settings` | `src/app/dashboard/schedule/settings/page.tsx` | 2026-09-03 | `1ced5fca3` | 🟢 Fresh |
| `/dashboard/schedule/waitlist` | `src/app/dashboard/schedule/waitlist/page.tsx` | 2026-09-05 | `ab63b2a02` | 🟢 Fresh |
| `/dashboard/services` | `src/app/dashboard/services/page.tsx` | 2026-09-07 | `02e5bc3a8` | 🟢 Fresh |
| `/dashboard/services/import` | `src/app/dashboard/services/import/page.tsx` | 2026-09-05 | `ab63b2a02` | 🟢 Fresh |
| `/dashboard/settings` | `src/app/dashboard/settings/page.tsx` | 2026-09-07 | `02e5bc3a8` | 🟢 Fresh |
| `/dashboard/sites` | `src/app/dashboard/sites/page.tsx` | 2026-09-07 | `bbcb8b9fa` | 🟢 Fresh |
| `/dashboard/sites/preview` | `src/app/dashboard/sites/preview/page.tsx` | 2026-08-23 | `333d702a3` | 🟡 Stable (Aug 20-31) |
| `/dashboard/stripe-merchant/refresh` | `src/app/dashboard/stripe-merchant/refresh/page.tsx` | 2026-08-16 | `fde575acb` | 🔴 Neglected (>3 wks) |
| `/dashboard/stripe-merchant/return` | `src/app/dashboard/stripe-merchant/return/page.tsx` | 2026-08-16 | `fde575acb` | 🔴 Neglected (>3 wks) |
| `/dashboard/stripe-return` | `src/app/dashboard/stripe-return/page.tsx` | 2026-09-01 | `3627683c9` | 🟢 Fresh |
| `/dashboard/text-to-job` | `src/app/dashboard/text-to-job/page.tsx` | 2026-09-05 | `ab63b2a02` | 🟢 Fresh |
| `/dashboard/trash` | `src/app/dashboard/trash/page.tsx` | 2026-09-05 | `ab63b2a02` | 🟢 Fresh |
| `/dashboard/voice-assistant` | `src/app/dashboard/voice-assistant/page.tsx` | 2026-08-26 | `cdd0b44fd` | 🟡 Stable (Aug 20-31) |
| `/dashboard/voice-calls` | `src/app/dashboard/voice-calls/page.tsx` | 2026-09-06 | `42e93ae74` | 🟢 Fresh |
| `/dashboard/voice-calls/[callId]` | `src/app/dashboard/voice-calls/[callId]/page.tsx` | 2026-09-06 | `42e93ae74` | 🟢 Fresh |

### Customer & Client Facing (10 pages)

| Route | Source File | Last Touched | Commit | Freshness |
| :--- | :--- | :--- | :--- | :--- |
| `/book/[subdomain]` | `src/app/book/[subdomain]/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/client/jobs/[token]` | `src/app/client/jobs/[token]/page.tsx` | 2026-09-03 | `5806fd4ca` | 🟢 Fresh |
| `/invoice/[id]` | `src/app/invoice/[id]/page.tsx` | 2026-09-05 | `e6f557cb7` | 🟢 Fresh |
| `/pay/[id]` | `src/app/pay/[id]/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/portal` | `src/app/portal/page.tsx` | 2026-09-04 | `55e4f0ef4` | 🟢 Fresh |
| `/portal/[subdomain]` | `src/app/portal/[subdomain]/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/portal/view/[token]` | `src/app/portal/view/[token]/page.tsx` | 2026-09-04 | `55e4f0ef4` | 🟢 Fresh |
| `/review/[token]` | `src/app/review/[token]/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/track/[token]` | `src/app/track/[token]/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/unsubscribe` | `src/app/unsubscribe/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |

### Auth & Onboarding (5 pages)

| Route | Source File | Last Touched | Commit | Freshness |
| :--- | :--- | :--- | :--- | :--- |
| `/auth/confirm` | `src/app/auth/confirm/page.tsx` | 2026-08-30 | `4db77d660` | 🟡 Stable (Aug 20-31) |
| `/login` | `src/app/login/page.tsx` | 2026-09-03 | `5576cd959` | 🟢 Fresh |
| `/office-invite/[token]` | `src/app/office-invite/[token]/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/start` | `src/app/start/page.tsx` | 2026-09-03 | `35ba268ba` | 🟢 Fresh |
| `/welcome` | `src/app/welcome/page.tsx` | 2026-09-03 | `35ba268ba` | 🟢 Fresh |

### Product Features (24 pages)

| Route | Source File | Last Touched | Commit | Freshness |
| :--- | :--- | :--- | :--- | :--- |
| `/features` | `src/app/features/page.tsx` | 2026-09-07 | `23224eb68*` | 🟢 Fresh |
| `/features-flagship` | `src/app/features-flagship/page.tsx` | 2026-08-26 | `de72f3cf5` | 🟡 Stable (Aug 20-31) |
| `/features/ai-ads` | `src/app/features/ai-ads/page.tsx` | 2026-09-04 | `0f4c25d7f` | 🟢 Fresh |
| `/features/ai-copilot` | `src/app/features/ai-copilot/page.tsx` | 2026-09-05 | `a49cbac93` | 🟢 Fresh |
| `/features/ai-intake` | `src/app/features/ai-intake/page.tsx` | 2026-09-01 | `1a0c6fd90` | 🟢 Fresh |
| `/features/ai-vision` | `src/app/features/ai-vision/page.tsx` | 2026-09-07 | `23224eb68` | 🟢 Fresh |
| `/features/ai-voice` | `src/app/features/ai-voice/page.tsx` | 2026-09-01 | `c39099360` | 🟢 Fresh |
| `/features/back-office` | `src/app/features/back-office/page.tsx` | 2026-09-01 | `80232fe27` | 🟢 Fresh |
| `/features/cash-flow` | `src/app/features/cash-flow/page.tsx` | 2026-08-29 | `e4f635a58` | 🟡 Stable (Aug 20-31) |
| `/features/client-portal` | `src/app/features/client-portal/page.tsx` | 2026-08-16 | `28a2d0925` | 🔴 Neglected (>3 wks) |
| `/features/crew` | `src/app/features/crew/page.tsx` | 2026-09-07 | `e4f635a58*` | 🟢 Fresh |
| `/features/dispatch` | `src/app/features/dispatch/page.tsx` | 2026-08-27 | `91f85e576` | 🟡 Stable (Aug 20-31) |
| `/features/live-eta` | `src/app/features/live-eta/page.tsx` | 2026-09-07 | `*` | 🟢 Fresh |
| `/features/neighborhood-halo` | `src/app/features/neighborhood-halo/page.tsx` | 2026-09-05 | `a49cbac93` | 🟢 Fresh |
| `/features/payments` | `src/app/features/payments/page.tsx` | 2026-08-29 | `e4f635a58` | 🟡 Stable (Aug 20-31) |
| `/features/quick-stops` | `src/app/features/quick-stops/page.tsx` | 2026-08-29 | `0533d57a9` | 🟡 Stable (Aug 20-31) |
| `/features/quotes` | `src/app/features/quotes/page.tsx` | 2026-09-02 | `37dc4c966` | 🟢 Fresh |
| `/features/recurring` | `src/app/features/recurring/page.tsx` | 2026-08-29 | `e4f635a58` | 🟡 Stable (Aug 20-31) |
| `/features/reviews` | `src/app/features/reviews/page.tsx` | 2026-08-29 | `e4f635a58` | 🟡 Stable (Aug 20-31) |
| `/features/scheduling` | `src/app/features/scheduling/page.tsx` | 2026-08-29 | `e4f635a58` | 🟡 Stable (Aug 20-31) |
| `/features/sparky` | `src/app/features/sparky/page.tsx` | 2026-09-05 | `a49cbac93` | 🟢 Fresh |
| `/features/text-to-job` | `src/app/features/text-to-job/page.tsx` | 2026-09-05 | `a49cbac93` | 🟢 Fresh |
| `/features/website-builder` | `src/app/features/website-builder/page.tsx` | 2026-09-05 | `a49cbac93` | 🟢 Fresh |
| `/features/website-builder-mockup` | `src/app/features/website-builder-mockup/page.tsx` | 2026-08-28 | `ec20b4264` | 🟡 Stable (Aug 20-31) |

### Public Marketing (42 pages)

| Route | Source File | Last Touched | Commit | Freshness |
| :--- | :--- | :--- | :--- | :--- |
| `/` | `src/app/page.tsx` | 2026-09-07 | `23224eb68*` | 🟢 Fresh |
| `/account-suspended` | `src/app/account-suspended/page.tsx` | 2026-08-31 | `33c409ea4` | 🟡 Stable (Aug 20-31) |
| `/card-saved` | `src/app/card-saved/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/changelog` | `src/app/changelog/page.tsx` | 2026-08-26 | `192ffbce6` | 🟡 Stable (Aug 20-31) |
| `/claim/halo/[id]` | `src/app/claim/halo/[id]/page.tsx` | 2026-09-06 | `123adafe2` | 🟢 Fresh |
| `/contact` | `src/app/contact/page.tsx` | 2026-09-01 | `80232fe27` | 🟢 Fresh |
| `/dpa` | `src/app/dpa/page.tsx` | 2026-08-27 | `91f85e576` | 🟡 Stable (Aug 20-31) |
| `/faq` | `src/app/faq/page.tsx` | 2026-09-05 | `a49cbac93` | 🟢 Fresh |
| `/field` | `src/app/field/page.tsx` | 2026-09-06 | `97c00e46b` | 🟢 Fresh |
| `/field/choose` | `src/app/field/choose/page.tsx` | 2026-09-02 | `3a3f2aa65` | 🟢 Fresh |
| `/field/dictate` | `src/app/field/dictate/page.tsx` | 2026-09-02 | `3a3f2aa65` | 🟢 Fresh |
| `/field/intake/[id]` | `src/app/field/intake/[id]/page.tsx` | 2026-09-04 | `19b4543d9` | 🟢 Fresh |
| `/field/jobs/[id]` | `src/app/field/jobs/[id]/page.tsx` | 2026-09-06 | `97c00e46b` | 🟢 Fresh |
| `/field/login` | `src/app/field/login/page.tsx` | 2026-09-06 | `24d05d92c` | 🟢 Fresh |
| `/field/offline` | `src/app/field/offline/page.tsx` | 2026-08-28 | `a54825870` | 🟡 Stable (Aug 20-31) |
| `/field/pay` | `src/app/field/pay/page.tsx` | 2026-09-02 | `3a3f2aa65` | 🟢 Fresh |
| `/for` | `src/app/for/page.tsx` | 2026-09-05 | `a49cbac93` | 🟢 Fresh |
| `/for-mockup` | `src/app/for-mockup/page.tsx` | 2026-09-01 | `a519c0ee6` | 🟢 Fresh |
| `/founder` | `src/app/founder/page.tsx` | 2026-09-05 | `a49cbac93` | 🟢 Fresh |
| `/home-classic` | `src/app/home-classic/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/home-compact` | `src/app/home-compact/page.tsx` | 2026-08-28 | `c5132ccf2` | 🟡 Stable (Aug 20-31) |
| `/home-compare` | `src/app/home-compare/page.tsx` | 2026-08-07 | `56684ddd3` | 🔴 Neglected (>3 wks) |
| `/home-editorial` | `src/app/home-editorial/page.tsx` | 2026-08-28 | `ee21c8e1d` | 🟡 Stable (Aug 20-31) |
| `/home-flagship` | `src/app/home-flagship/page.tsx` | 2026-08-07 | `55a60a4d2` | 🔴 Neglected (>3 wks) |
| `/home-next` | `src/app/home-next/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/how-it-works` | `src/app/how-it-works/page.tsx` | 2026-09-02 | `dd0a59154` | 🟢 Fresh |
| `/office-access` | `src/app/office-access/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/passport/[passportCode]` | `src/app/passport/[passportCode]/page.tsx` | 2026-09-01 | `a05e3d1a4` | 🟢 Fresh |
| `/pricing` | `src/app/pricing/page.tsx` | 2026-09-07 | `c10f67cda` | 🟢 Fresh |
| `/privacy` | `src/app/privacy/page.tsx` | 2026-09-01 | `0cc7421e7` | 🟢 Fresh |
| `/quick-stop/[id]` | `src/app/quick-stop/[id]/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/quickbooks/disconnected` | `src/app/quickbooks/disconnected/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/recover-account` | `src/app/recover-account/page.tsx` | 2026-09-01 | `82eefc37f` | 🟢 Fresh |
| `/resources` | `src/app/resources/page.tsx` | 2026-09-05 | `a49cbac93` | 🟢 Fresh |
| `/resources/[slug]` | `src/app/resources/[slug]/page.tsx` | 2026-09-05 | `a49cbac93` | 🟢 Fresh |
| `/schedule/[token]` | `src/app/schedule/[token]/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/security` | `src/app/security/page.tsx` | 2026-09-05 | `a49cbac93` | 🟢 Fresh |
| `/sms-terms` | `src/app/sms-terms/page.tsx` | 2026-08-31 | `51abfa532` | 🟡 Stable (Aug 20-31) |
| `/sub/[token]` | `src/app/sub/[token]/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/terms` | `src/app/terms/page.tsx` | 2026-08-31 | `51abfa532` | 🟡 Stable (Aug 20-31) |
| `/themes/[template]` | `src/app/themes/[template]/page.tsx` | 2026-08-31 | `bddaa35e6` | 🟡 Stable (Aug 20-31) |
| `/website-builder-mockup` | `src/app/website-builder-mockup/page.tsx` | 2026-08-31 | `df967bdae` | 🟡 Stable (Aug 20-31) |

### Trade Landing Pages (1 pages)

| Route | Source File | Last Touched | Commit | Freshness |
| :--- | :--- | :--- | :--- | :--- |
| `/for/[trade]` | `src/app/for/[trade]/page.tsx` | 2026-09-05 | `a49cbac93` | 🟢 Fresh |

### Competitive Comparisons (2 pages)

| Route | Source File | Last Touched | Commit | Freshness |
| :--- | :--- | :--- | :--- | :--- |
| `/compare` | `src/app/compare/page.tsx` | 2026-09-05 | `a49cbac93` | 🟢 Fresh |
| `/compare/[competitor]` | `src/app/compare/[competitor]/page.tsx` | 2026-09-05 | `a49cbac93` | 🟢 Fresh |

### Public Free Tools (4 pages)

| Route | Source File | Last Touched | Commit | Freshness |
| :--- | :--- | :--- | :--- | :--- |
| `/tools` | `src/app/tools/page.tsx` | 2026-09-05 | `a49cbac93` | 🟢 Fresh |
| `/tools/estimate-generator` | `src/app/tools/estimate-generator/page.tsx` | 2026-09-05 | `a49cbac93` | 🟢 Fresh |
| `/tools/hourly-rate-calculator` | `src/app/tools/hourly-rate-calculator/page.tsx` | 2026-08-27 | `503c50171` | 🟡 Stable (Aug 20-31) |
| `/tools/leakage-calculator` | `src/app/tools/leakage-calculator/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |

### Help & Documentation (4 pages)

| Route | Source File | Last Touched | Commit | Freshness |
| :--- | :--- | :--- | :--- | :--- |
| `/help` | `src/app/help/page.tsx` | 2026-09-01 | `8eb04f1ba` | 🟢 Fresh |
| `/help/articles/[slug]` | `src/app/help/articles/[slug]/page.tsx` | 2026-08-31 | `227d8dcb3` | 🟡 Stable (Aug 20-31) |
| `/help/manual` | `src/app/help/manual/page.tsx` | 2026-09-01 | `8eb04f1ba` | 🟢 Fresh |
| `/help/manual/[slug]` | `src/app/help/manual/[slug]/page.tsx` | 2026-09-01 | `8eb04f1ba` | 🟢 Fresh |

### Interactive Demo (46 pages)

| Route | Source File | Last Touched | Commit | Freshness |
| :--- | :--- | :--- | :--- | :--- |
| `/demo` | `src/app/demo/page.tsx` | 2026-09-05 | `7e1906c94` | 🟢 Fresh |
| `/demo/automations` | `src/app/demo/automations/page.tsx` | 2026-08-27 | `2dc29d9e9` | 🟡 Stable (Aug 20-31) |
| `/demo/campaigns` | `src/app/demo/campaigns/page.tsx` | 2026-08-06 | `b9fb1174e` | 🔴 Neglected (>3 wks) |
| `/demo/cash-flow` | `src/app/demo/cash-flow/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/demo/clients` | `src/app/demo/clients/page.tsx` | 2026-09-03 | `2e6c7af21` | 🟢 Fresh |
| `/demo/clients/[id]` | `src/app/demo/clients/[id]/page.tsx` | 2026-09-03 | `2e6c7af21` | 🟢 Fresh |
| `/demo/crew` | `src/app/demo/crew/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/demo/customize` | `src/app/demo/customize/page.tsx` | 2026-08-24 | `c39872e7d` | 🟡 Stable (Aug 20-31) |
| `/demo/email-themes` | `src/app/demo/email-themes/page.tsx` | 2026-09-01 | `c39099360` | 🟢 Fresh |
| `/demo/insights` | `src/app/demo/insights/page.tsx` | 2026-09-04 | `0c66cd74b` | 🟢 Fresh |
| `/demo/jobs` | `src/app/demo/jobs/page.tsx` | 2026-09-03 | `f97c93a14` | 🟢 Fresh |
| `/demo/jobs/[id]` | `src/app/demo/jobs/[id]/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/demo/leads` | `src/app/demo/leads/page.tsx` | 2026-09-03 | `f97c93a14` | 🟢 Fresh |
| `/demo/leads/[leadId]` | `src/app/demo/leads/[leadId]/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/demo/marketing` | `src/app/demo/marketing/page.tsx` | 2026-09-05 | `7e1906c94` | 🟢 Fresh |
| `/demo/marketing/ads` | `src/app/demo/marketing/ads/page.tsx` | 2026-08-30 | `7886b7ea9` | 🟡 Stable (Aug 20-31) |
| `/demo/marketing/blog` | `src/app/demo/marketing/blog/page.tsx` | 2026-09-01 | `8eb04f1ba` | 🟢 Fresh |
| `/demo/marketing/blog/[id]` | `src/app/demo/marketing/blog/[id]/page.tsx` | 2026-09-01 | `8eb04f1ba` | 🟢 Fresh |
| `/demo/marketing/campaigns` | `src/app/demo/marketing/campaigns/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/demo/marketing/email-theme` | `src/app/demo/marketing/email-theme/page.tsx` | 2026-09-01 | `c39099360` | 🟢 Fresh |
| `/demo/marketing/links` | `src/app/demo/marketing/links/page.tsx` | 2026-09-05 | `7e1906c94` | 🟢 Fresh |
| `/demo/marketing/performance` | `src/app/demo/marketing/performance/page.tsx` | 2026-08-06 | `b9fb1174e` | 🔴 Neglected (>3 wks) |
| `/demo/marketing/referrals` | `src/app/demo/marketing/referrals/page.tsx` | 2026-09-05 | `5ba1a8884` | 🟢 Fresh |
| `/demo/messages` | `src/app/demo/messages/page.tsx` | 2026-08-14 | `3c18ab230` | 🔴 Neglected (>3 wks) |
| `/demo/payroll` | `src/app/demo/payroll/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/demo/quick-stops` | `src/app/demo/quick-stops/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/demo/rebook` | `src/app/demo/rebook/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/demo/recurring` | `src/app/demo/recurring/page.tsx` | 2026-08-06 | `b9fb1174e` | 🔴 Neglected (>3 wks) |
| `/demo/reel/bath-to-shower` | `src/app/demo/reel/bath-to-shower/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/demo/reel/mock-site` | `src/app/demo/reel/mock-site/page.tsx` | 2026-08-27 | `49a39ca6f` | 🟡 Stable (Aug 20-31) |
| `/demo/reel/product-tour` | `src/app/demo/reel/product-tour/page.tsx` | 2026-09-02 | `bf4e4a5ce` | 🟢 Fresh |
| `/demo/reviews` | `src/app/demo/reviews/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/demo/schedule` | `src/app/demo/schedule/page.tsx` | 2026-09-03 | `99b99805e` | 🟢 Fresh |
| `/demo/schedule/booking` | `src/app/demo/schedule/booking/page.tsx` | 2026-09-03 | `99b99805e` | 🟢 Fresh |
| `/demo/schedule/plan` | `src/app/demo/schedule/plan/page.tsx` | 2026-08-14 | `7c3ac4112` | 🔴 Neglected (>3 wks) |
| `/demo/services` | `src/app/demo/services/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/demo/settings` | `src/app/demo/settings/page.tsx` | 2026-08-27 | `2dc29d9e9` | 🟡 Stable (Aug 20-31) |
| `/demo/sites` | `src/app/demo/sites/page.tsx` | 2026-08-28 | `9aafb9f95` | 🟡 Stable (Aug 20-31) |
| `/demo/sms-quote` | `src/app/demo/sms-quote/page.tsx` | 2026-08-26 | `a9e81b590` | 🟡 Stable (Aug 20-31) |
| `/demo/tour` | `src/app/demo/tour/page.tsx` | 2026-08-27 | `65506d9ef` | 🟡 Stable (Aug 20-31) |
| `/demo/tour/approve` | `src/app/demo/tour/approve/page.tsx` | 2026-08-27 | `2ad68083f` | 🟡 Stable (Aug 20-31) |
| `/demo/tour/complete` | `src/app/demo/tour/complete/page.tsx` | 2026-08-27 | `2ad68083f` | 🟡 Stable (Aug 20-31) |
| `/demo/tour/intake` | `src/app/demo/tour/intake/page.tsx` | 2026-08-27 | `2ad68083f` | 🟡 Stable (Aug 20-31) |
| `/demo/tour/lead` | `src/app/demo/tour/lead/page.tsx` | 2026-08-27 | `2ad68083f` | 🟡 Stable (Aug 20-31) |
| `/demo/tour/quote` | `src/app/demo/tour/quote/page.tsx` | 2026-08-27 | `2ad68083f` | 🟡 Stable (Aug 20-31) |
| `/demo/tour/site` | `src/app/demo/tour/site/page.tsx` | 2026-08-27 | `65506d9ef` | 🟡 Stable (Aug 20-31) |

### Admin Operations (30 pages)

| Route | Source File | Last Touched | Commit | Freshness |
| :--- | :--- | :--- | :--- | :--- |
| `/admin` | `src/app/admin/page.tsx` | 2026-09-06 | `937e5e89e` | 🟢 Fresh |
| `/admin/accounts` | `src/app/admin/accounts/page.tsx` | 2026-09-04 | `92b992c43` | 🟢 Fresh |
| `/admin/accounts/[id]` | `src/app/admin/accounts/[id]/page.tsx` | 2026-09-04 | `92b992c43` | 🟢 Fresh |
| `/admin/accounts/closures` | `src/app/admin/accounts/closures/page.tsx` | 2026-09-04 | `1edfb2a04` | 🟢 Fresh |
| `/admin/audit` | `src/app/admin/audit/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/admin/billing-operations` | `src/app/admin/billing-operations/page.tsx` | 2026-09-04 | `1edfb2a04` | 🟢 Fresh |
| `/admin/campaigns` | `src/app/admin/campaigns/page.tsx` | 2026-09-04 | `1a08f02c8` | 🟢 Fresh |
| `/admin/cases` | `src/app/admin/cases/page.tsx` | 2026-09-04 | `1a08f02c8` | 🟢 Fresh |
| `/admin/cases/[id]` | `src/app/admin/cases/[id]/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/admin/cases/new` | `src/app/admin/cases/new/page.tsx` | 2026-09-04 | `1a08f02c8` | 🟢 Fresh |
| `/admin/failures` | `src/app/admin/failures/page.tsx` | 2026-09-04 | `1a08f02c8` | 🟢 Fresh |
| `/admin/health` | `src/app/admin/health/page.tsx` | 2026-09-04 | `1edfb2a04` | 🟢 Fresh |
| `/admin/health/[job]` | `src/app/admin/health/[job]/page.tsx` | 2026-09-04 | `1edfb2a04` | 🟢 Fresh |
| `/admin/incidents` | `src/app/admin/incidents/page.tsx` | 2026-09-04 | `1a08f02c8` | 🟢 Fresh |
| `/admin/manual` | `src/app/admin/manual/page.tsx` | 2026-09-01 | `8b2dfa7ae` | 🟢 Fresh |
| `/admin/manual/[slug]` | `src/app/admin/manual/[slug]/page.tsx` | 2026-09-01 | `8b2dfa7ae` | 🟢 Fresh |
| `/admin/messaging` | `src/app/admin/messaging/page.tsx` | 2026-09-03 | `bd25aa7ac` | 🟢 Fresh |
| `/admin/messaging/registrations` | `src/app/admin/messaging/registrations/page.tsx` | 2026-09-03 | `bd25aa7ac` | 🟢 Fresh |
| `/admin/money` | `src/app/admin/money/page.tsx` | 2026-09-04 | `1edfb2a04` | 🟢 Fresh |
| `/admin/operator` | `src/app/admin/operator/page.tsx` | 2026-09-04 | `1edfb2a04` | 🟢 Fresh |
| `/admin/payments` | `src/app/admin/payments/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/admin/payments/[id]` | `src/app/admin/payments/[id]/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/admin/privacy-requests` | `src/app/admin/privacy-requests/page.tsx` | 2026-09-04 | `92b992c43` | 🟢 Fresh |
| `/admin/quick-stops` | `src/app/admin/quick-stops/page.tsx` | 2026-09-04 | `cc02e2e6c` | 🟢 Fresh |
| `/admin/quick-stops/[id]` | `src/app/admin/quick-stops/[id]/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/admin/risk` | `src/app/admin/risk/page.tsx` | 2026-09-04 | `1a08f02c8` | 🟢 Fresh |
| `/admin/search` | `src/app/admin/search/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/admin/security` | `src/app/admin/security/page.tsx` | 2026-09-06 | `937e5e89e` | 🟢 Fresh |
| `/admin/staff` | `src/app/admin/staff/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/admin/voice/numbers` | `src/app/admin/voice/numbers/page.tsx` | 2026-09-03 | `bd25aa7ac` | 🟢 Fresh |

### Tenant Sites & Previews (15 pages)

| Route | Source File | Last Touched | Commit | Freshness |
| :--- | :--- | :--- | :--- | :--- |
| `/site-domain/[domain]` | `src/app/site-domain/[domain]/page.tsx` | 2026-09-05 | `e0ad82cd7` | 🟢 Fresh |
| `/site-domain/[domain]/blog` | `src/app/site-domain/[domain]/blog/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/site-domain/[domain]/blog/[slug]` | `src/app/site-domain/[domain]/blog/[slug]/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/site-domain/[domain]/portal` | `src/app/site-domain/[domain]/portal/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/site-domain/[domain]/privacy` | `src/app/site-domain/[domain]/privacy/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/site-domain/[domain]/terms` | `src/app/site-domain/[domain]/terms/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/site-domain/[domain]/videos` | `src/app/site-domain/[domain]/videos/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/site-preview-frame` | `src/app/site-preview-frame/page.tsx` | 2026-09-01 | `792b40156` | 🟢 Fresh |
| `/site/[subdomain]` | `src/app/site/[subdomain]/page.tsx` | 2026-09-05 | `e0ad82cd7` | 🟢 Fresh |
| `/site/[subdomain]/blog` | `src/app/site/[subdomain]/blog/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/site/[subdomain]/blog/[slug]` | `src/app/site/[subdomain]/blog/[slug]/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/site/[subdomain]/portal` | `src/app/site/[subdomain]/portal/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/site/[subdomain]/privacy` | `src/app/site/[subdomain]/privacy/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/site/[subdomain]/terms` | `src/app/site/[subdomain]/terms/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/site/[subdomain]/videos` | `src/app/site/[subdomain]/videos/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
