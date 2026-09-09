# Operational cleanup — 2026-09-09

The 221-record baseline has an individual disposition in the [exact manifest](evidence/operational-cleanup-manifest-2026-09-09.json). Production changes resolved the stale live billing receipt, disabled the misrouted rehearsal endpoint, and established the operator SMS paging ledger and secret configuration. The controlled Resend outage SMS reached the owner within 23 seconds and the owner confirmed receipt. **The full operational launch gate remains open for production activation and the subsequent 24-hour observation.**

## Historical dispositions

| Source | Count | Disposition and evidence |
| --- | ---: | --- |
| Test billing | 185 | Verified obsolete rehearsals: authoritative Stripe test-mode events, 13 subscription identities, 10 Six-SKU staging subscription fixtures, and owner confirmation for the other three base-plan rehearsals. |
| Live billing | 1 | Superseded by the September 7 processed subscription update; current Stripe subscription and application binding agree. |
| Voice webhook rejections | 29 | Terminal authentication rejections: 13 missing admission signatures, 4 missing provider-status signatures and 12 fallback signature mismatches. No trusted call/event ID or retained payload exists to replay. |
| Registry callback | 1 | Intermediate pending callback superseded by the complete callback for the same order. |
| Registry callback | 1 | Final provider state reconciled to LGQ's completed platform support sender assignment. |
| SMS | 4 | Terminal undelivered messages to fictional destinations in the owner test workspace; no replacement needed. Accepted usage remains committed. |
| **Total** | **221** | Every original record retained. No webhook or customer SMS was replayed. |

The [audit writer](../scripts/dispose-prelaunch-operational-backlog.mjs) defaults to rollback, compares the exact current source fingerprint, locks the source while appending its disposition, and serializes repeated submissions. It writes individual `admin_actions` entries and a correction referencing audit `108e8081-c110-4483-be5d-0f304db69d2e`. The earlier aggregate “31 replayed” claim is unsupported: a bulk administrative closure did not run a handler. The original audit is retained. This release removes both remaining generic false-recovery paths and replaces the cockpit's hard-coded replay control with inspection.

These audit entries record reviewed historical outcomes. The four original SMS failures and the bounded billing configuration case remain visible in existing operational readers; this change does not introduce a second suppression policy or call a failed message delivered. The configuration case remains owned by Brett through the observation window. New failures remain detectable.

## Live billing

Receipt `13eb0d53-2433-4cea-b7ae-0529d8878909`, event `evt_1U9nSQGqh5LFKuTCeXUjIBq7`, failed with `provider_object_contract_mismatch` on August 29. The original Stripe event requested cancellation at period end. Its stored digest does not establish which historical validator field failed; that specific cause is not claimed.

Current provider subscription `sub_1U7kt1Gqh5LFKuTCJENle4Ew` and application subscription `935f4441-2979-498f-ab75-5b41c59d8b9f` both show the owner's BrokePipes Solo monthly plan active, cancellation false, with period ending September 23 at 23:33:06 UTC. The newer event `evt_1UD5rKGqh5LFKuTCaReyySxT` was processed and applied as receipt `3b830e51-46d9-486b-bc9a-9b820fbb3cbb`.

The [guarded SQL](evidence/operational-cleanup-live-disposition.sql) marked only the old receipt `ignored / out_of_order_ignored`, bound it to the verified account/subscription, and appended audit `16978bdc-8880-49dc-a5f7-907fbb0047bf`. Original error, payload hash and attempt count remain. [Execution evidence](evidence/ops-live-disposition-applied.json) records identical before/after hashes for subscriptions, payments, credit lots, usage reservations and SMS events, including repetition with zero business delta. No provider financial request was made.

## Rehearsal provenance and routing

All 185 original provider event IDs were retrieved from the Stripe test account; every event is non-live. Subscription events and invoice parent subscription identities map to 13 subscriptions. Ten match the saved `six-sku-staging-billing-evidence-20260908.json` and related refund fixture files. The owner identified the Alpha Sandbox Test, Beta Electric Pros and personal Stripe test customer base-plan subscriptions as obsolete prelaunch rehearsals. All 185 production receipts are unbound and unapplied. Test-provider subscription/invoice activity actually occurred; this is not a claim that the rehearsals had no test-provider effects.

The legacy test endpoint `we_1U5dHvPqTgiW6iRM8Si0gH56` targeted the `subscription-rehearsal` Vercel alias at `/api/stripe/billing/webhook`. That deployment inherited the production Supabase destination from the shared Preview configuration, without a branch override. This explains how valid test-provider events reached production storage and were rejected by its mode boundary. The test endpoint was disabled at **20:23:57 UTC**, preserving its configuration. The live Stripe endpoint and independent staging CLI relay were untouched. See [routing inspection](evidence/ops-routing-evidence.json) and [containment result](evidence/ops-rehearsal-routing-containment.json); bypass credentials are excluded.

Future rehearsals must use a staging-only deployment/database with an explicit server-mode setting and a correspondingly scoped Stripe test endpoint. Do not re-enable the legacy endpoint until those bindings are verified.

## Historical SMS and registry

[Provider evidence](evidence/ops-provider-redacted.json) confirms all four SMS IDs are `undelivered`, code `30005`, with 2, 4, 1 and 3 accepted segments. Their destinations are in the reserved non-working 555-0100–0199 range ([NANPA](https://nanpa.com/numbering/555-line-numbers)). The original tasks are completed at attempt 1 with no active lease. Three later messages have ordered durable status callbacks; the September 3 message predates that receipt boundary and was verified directly with SignalWire.

Each message's committed text reservation and finalization key matches its original accepted send. Historical `committed_units=null` means the full reservation: the schema explicitly requires `coalesce(committed_units, units)` (`20260819110000_commit_usage_reservation_partial.sql`). These four effective quantities total 10 and match the provider segments. Delivery failure alone does not undo acceptance-based usage. No resend, reservation release, credit grant or accounting correction was performed.

Registry order `12f7579b-6990-4edc-b031-5950f4c233e8` produced a pending callback followed by a complete callback. SignalWire reports assignment `eaea6053-4b33-4e2b-ad80-33251a88b698` completed on campaign `638bad76-629d-4321-90e2-6fe533c09091`, matching the LGQ shared support sender ending 2323. No contractor application was expected for that platform inventory assignment. This does not grant contractor-to-customer campaign coverage to the separate pilot sender.

## Email outage paging

The owner authorized the existing owner phone ending 2061 and shared support sender ending 2323. The isolated drill returned HTTP 503 for every Resend request while using real Supabase and SignalWire calls. It did not disable production email.

- First invocation: **20:22:01.641 UTC**; provider message `84ec323b-0a83-4507-8360-cbbad4e5d89b` accepted.
- Repeat reconciliation: **20:22:23.961 UTC**, same provider ID, delivered, zero additional SMS submissions. Elapsed wall time: **22.32 seconds**.
- Owner reply: **“Yes, received.”** The message contained the admin health URL and instructions to restore monitoring without replaying payments or customer messages.
- No tenant SMS event/task or usage reservation was created. The dedicated paging ledger owns the send.

See [drill evidence](evidence/ops-outage-drill-evidence.json). The database and local clocks differ by several seconds; elapsed delivery time uses one local clock, not mixed provider/database timestamps. `delivered_at` is the time delivery was observed, not an exact handset receipt timestamp.

Production Vercel now has the two phone settings. GitHub repository secrets have those settings and the existing SignalWire project ID, space URL and API token, as explicitly approved by the owner. [Configuration evidence](evidence/ops-paging-configuration-evidence.json) contains names and masked endings only. Runtime activation requires the code/workflow release; secret installation alone is not deployment evidence.

SMS is attempted even when the email API accepts the fallback notification, covering primary mailbox unavailability. A durable hourly page key permits one submission across competing watchdogs. Unknown submission outcomes stop in manual review; repeats reconcile the original provider ID. The SMS rail depends on Supabase for this claim ledger. Simultaneous database and email-provider failure therefore remains outside this proof; independent GitHub execution/status is available but is not a proved handset paging channel.

## Validation and observation

Focused operator/monitor/SMS regression after reconciliation with main: **88 tests across 6 suites passed**. Typecheck and targeted ESLint passed. Disposable PostgreSQL paging tests passed **7 checks**, covering browser-role denial, one winner under concurrent claims, immutable recipient/provider/delivery evidence and denied deletion. Source-specific billing disposition was rehearsed, applied and repeated with zero business delta.

The observation clock must start no earlier than the latest relevant production activation or containment. The routing-only minimum is **September 10 at 20:23:58 UTC**; a later deployment moves the final deadline later. Record three consecutive successful scheduled monitor/projection cycles, then inspect the entire 24-hour interval for renewed misrouted test receipts, live billing failures, historical source drift, SMS retries/new sends, and alert delivery failures. Check Vercel and the independent GitHub watchdog, not just a manual invocation. Preserve all provider IDs and delivered alert payloads.

Do not check off the full gate based on a short clean sample. The follow-up should update this report and `LAUNCH_CHECKLIST.md`, commit the final evidence, and stop after completion. Keep the owner informed only of material changes, required action, failures or completion.

### Initial observation at 20:49 UTC

Five scheduled operational-monitor cycles and five billing-projection cycles succeeded after routing containment; 26 SMS-delivery cycles succeeded. No new non-live billing receipt or failed live billing receipt appeared in that interval. All operational email deliveries had confirmed delivery. The baseline audit has 221 unique dispositions plus correction `f6ead810-6f4a-4765-83fe-8d6ab14835e3`; repeating the exact audit transaction inserted zero rows and made zero source/provider changes. Production paging migration is recorded as `20260909202110_operational_sms_paging` (repository timestamp `20260909200503`).

The scan also exposed **12 new Resend webhook failures for two provider messages**, `45d14716-1535-412e-b65b-84264775ad4d` and `81bbc108-4026-4e3b-a8eb-f4e126d724c4`. They match the authorized Black Hole Art custom-domain/fallback rehearsal recorded in the separate contractor-domain verification report. That rehearsal used staging account `152db1d4-4448-4c02-8b89-bfb1f243ff26` with the shared live provider, whose callbacks reached production and violated the email account foreign key. This is an additional environment-routing finding, outside the original 221-record manifest. Preserve it for an explicit disposition and future rehearsal routing isolation; it prevents calling this a clean observation. No source record was silently closed.

An hourly follow-up is scheduled in this task under `complete-operational-cleanup-observation`. It stays quiet on unchanged state, verifies the full window, and updates/commits the final gate only when all evidence exists. Publication is awaiting explicit user authorization after automatic approval review rejected pushing the local commit to the remote.

### Local release validation

The rebased commit's optimized production build completed successfully on September 9, including TypeScript validation, lint and static-page generation. Existing lint warnings remain outside the changed paths. The focused six-suite run passed 88 tests. Redaction checks found no Stripe/webhook/Supabase secrets, JWTs or deployment-bypass query values in the changed files. The branch is locally committed; no branch push, merge or deployment succeeded in this task. Publication needs the owner's explicit approval following the automatic approval-review rejection.

### Observation started at the owner's request

The current-production observation runs from **2026-09-09 21:13:17 UTC through at least 2026-09-10 21:13:17 UTC** (**5:13 PM September 9–10, America/New_York**). The [fixed start baseline](evidence/operational-cleanup-observation-start-2026-09-09.json) captures the deployed revision, scheduler evidence, current findings and paging ledger. The existing hourly task follow-up has been updated to this window and will report new actionable failures, material changes, needed action or completion; it remains quiet on unchanged known findings.

At start, live failed billing and new post-containment test-mode billing ingress were both zero. The latest billing, SMS and operational-monitor cycles succeeded. The known two rehearsal emails had generated 16 Resend callback failure records; these remain an open routing issue. One operational alert was accepted less than five minutes before the snapshot and awaited its normal delivery reconciliation. The prior SMS drill remained delivered under its original provider ID, and all 221 baseline disposition audits remained present.

The owner subsequently authorized the push, and cleanup commit `f51f246202d3dceffaf90e9dba2415c385b65d79` is now on its remote branch. This supersedes the earlier publication-pending notes. Production remains READY on `5e7e00901e128df70deddadfa9f2d63757efbf7e`, deployment `dpl_CVtCbj611jCkrumbvAZMFoPnXeFb`; its source tree does not contain `operational-sms-paging.mjs`. This observation can establish the current live state, but cannot pass acceptance for undeployed paging code. Any later relevant activation requires its own three successful scheduled cycles and full 24-hour acceptance window. Starting observation does not authorize a merge, deployment, extra drill or replay.
