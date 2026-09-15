# Admin operations remediation plan

Prepared September 9, 2026. Status: proposed implementation plan; no application, deployment, messaging, or production-data changes were made while preparing it.

The objective is to make operational failures actionable, prevent duplicate campaign sends, and ensure every health or completion claim has evidence behind it. Preserve the operational-alert delivery system already deployed. Fix the remaining paths around it.

## 1. Verified baseline and corrections to the earlier report

This plan uses Vercel's latest **production-target deployment**, `dpl_uLi2ZDS2BP6NY78hfwxd8gCasGwo`, at commit [`48dee526b6c25a020758e42f4684bd5698ef54e2`](https://github.com/wideeyephoto/lets-get-quoted/commit/48dee526b6c25a020758e42f4684bd5698ef54e2), plus read-only queries against the production Supabase project `mfuvvtrkipkigwqqtcal`. Database observations were collected around 15:12–15:17 UTC / 11:12–11:17 a.m. Eastern on September 9. These are snapshots, not continuing monitoring.

The local `main` checkout is at `d9a88e61f` and differs from this deployed revision. Its documentation and uncommitted changes must be preserved. Implementation should start from a freshly verified release baseline in an isolated checkout. Confirm the deployment serving the canonical application domain before release; the Vercel response inspected here listed its Vercel aliases.

| Item | Verified state | Consequence for the plan |
| --- | --- | --- |
| Automatic operational alerts | Deployed through a five-minute `operational-alerts` cron and a separate GitHub watchdog. Production contains nine delivery records marked delivered across billing, cron, dispute, SMS, and webhook categories; 13/13 recorded cron runs succeeded in the sampled window. | “Pages nobody” is no longer accurate for operational email. Reuse this system. Provider delivery does not establish that a human read the message. |
| Legacy on-call module | `dispatchOnCallPage` is still called only by its manual drill. `recentPagingEvents` is still a module-level array, and the health page still reads it. | Automatic alerts and the visible page history are separate systems. Consolidate them. |
| Subscription projector | 288 runs in the sampled 24 hours: 269 successful, 19 failed. Last failure: September 8 at 18:55:29 UTC / 2:55:29 p.m. Eastern. A later query counted 243 successful runs since that failure. | The claim that it fails every run or will remain red forever is outdated. Do not treat historical failures as a current outage. |
| 185 test subscription events | All are `livemode=false`, `processing_status='failed'`, `last_error='billing_mode_configuration_invalid'`, `attempt_count=1`, and `next_attempt_at IS NULL`. The deployed database selector excludes failed rows without a next attempt. | They are already terminal and are not being repeatedly claimed. The remaining defect is classification and alert noise. |
| Open billing findings | 186: the 185 terminal test events plus the live failure described below. | Separate expected rehearsal evidence from actionable production failures while retaining the original records. |
| Live subscription evidence | Seven events processed; one terminal `provider_object_contract_mismatch` event from August 29 remains. | Keep that live finding visible. These counts support the narrow test-backlog conclusion, not a blanket claim that all billing is correct. |
| Exceptions | `captureException` has no callers; exception storage and the panel reader are in memory. | Both instrumentation and persistent storage are needed. Adding callers alone is insufficient. |
| Uptime | Six subsystems infer health from configuration, a dependency, or a feature flag. Public `/api/health` repeats configuration-based claims. The admin page also displays a hardcoded 30-day SLA percentage. | Fix status semantics, public consumers, and fabricated historical metrics together. |
| Campaigns | A 60-second audit-log lookup precedes sending; its marker is written after the loop. Lookup errors are not checked. | Concurrent invocations and ambiguous partial sends remain unsafe. |
| Dunning and nudges | The two named tables are absent and the AI tools refuse execution. However, the separate dunning sweep still attempts `payments.next_retry_at` writes and writes a nonexistent `accounts.grace_period_until` column. | The tools' refusal is not a complete disablement boundary. Close every entry point. |
| Four orphan cron routes | All four remain outside the schedule and cron registry. A historical `db-guard` run exists from September 7; absence from the schedule does not make a route unreachable. | Explicitly retire or disable them before considering scheduling. |
| Privacy | Zero requests exist. Resolution still changes notes/status only and does not start or verify fulfillment. | Implement fulfillment before the first real request, including account/scope validation. |
| Cron authorization | `runCronJobNowAction` still resolves a slug before authentication. | Authenticate and authorize before examining or returning slug-specific results. |

Additional defects found within the requested paths:

- `webhook-healer.ts` increments replay counts for a simulated replay and attempts to mark the source resolved. No provider replay occurs in that branch. Its Supabase update result is not checked.
- `db-guard.ts` depends on `get_long_running_queries` and `cancel_backend_query`; neither RPC exists in production. It can report healthy after recording an error. Its proposed cancellation heuristic uses SQL text matching, which is not an adequate authorization boundary.
- The four orphan route wrappers return `ok: true` while omitting their workers' error arrays.
- Direct settlement, top-up projection, and voice allowance each have one old unfinished cron record in addition to the reported failures. A newer successful run should not erase evidence of an abandoned run.

Source anchors: [operational runbook](https://github.com/wideeyephoto/lets-get-quoted/blob/48dee526b6c25a020758e42f4684bd5698ef54e2/docs/runbooks/operational-alerts.md), [on-call module](https://github.com/wideeyephoto/lets-get-quoted/blob/48dee526b6c25a020758e42f4684bd5698ef54e2/src/lib/on-call-paging.ts), [uptime report](https://github.com/wideeyephoto/lets-get-quoted/blob/48dee526b6c25a020758e42f4684bd5698ef54e2/src/lib/uptime-monitoring.ts), [health page](https://github.com/wideeyephoto/lets-get-quoted/blob/48dee526b6c25a020758e42f4684bd5698ef54e2/src/app/admin/health/page.tsx), [campaign action](https://github.com/wideeyephoto/lets-get-quoted/blob/48dee526b6c25a020758e42f4684bd5698ef54e2/src/app/admin/campaigns/actions.ts), [campaign sender](https://github.com/wideeyephoto/lets-get-quoted/blob/48dee526b6c25a020758e42f4684bd5698ef54e2/src/lib/admin-platform-campaigns.ts).

## 2. Recommended decisions

These are recommended defaults for implementation, not claims that product decisions have already been approved.

1. Keep the existing durable operational email queue as the common alert foundation. Add an independent escalation channel only after choosing an actual provider, primary operator, backup, and acknowledgement policy.
2. Preserve the 185 test-event records. Classify the verified rehearsal cohort as excluded from production action queues, with an auditable reason. Do not purge them, replay them, or label them successfully projected.
3. Retire custom smart dunning for the current release. Retain existing billing recovery paths and inspect their actual retry ownership before making any future dunning change. Creating the missing table would not establish a correct retry system.
4. Defer activation messaging as an explicit product decision. Remove execution claims and disable the orphan sender path. A future implementation should reuse the existing lifecycle-email and delivery infrastructure where it fits.
5. Retire the generic webhook healer. Recovery must use each event source's real, idempotent replay mechanism.
6. Disable automatic database-query cancellation. Consider an observation-only database monitor after its data source and permissions are proven.
7. Treat privacy deletion fulfillment as a durable workflow. A resolution note is evidence accompanying fulfillment; it is not fulfillment by itself.

Decision records should name Brett as the product decision owner and assign an implementation/review owner for each work package. New paid paging services, messaging policies, and retention/deadline policies remain explicit choices in the relevant package; they do not block the immediate correctness fixes.

## 3. Work packages and acceptance criteria

### A. Contain incomplete worker paths and fix cron authorization — first release

**Changes**

- Apply the decisions above at every reachable boundary: cron routes, worker exports, operator tool declarations/executors, manual actions, and autonomous-cycle callers. Disabled workers return an explicit disabled result before scanning or mutating business data. Remove retired implementations after checking imports and tests.
- Remove the simulated webhook replay/resolution branch. Failed receipts remain unresolved until a genuine recovery succeeds and its outcome is verified.
- Remove or disable the dunning retry/grace writes. Preserve any separately established billing retry worker. Do not implement `grace_period_until` merely to satisfy a stale caller.
- Disable database cancellation. Do not create privileged cancellation RPCs just to make the old guard run.
- For any route retained during transition, propagate query/RPC errors and logical failure into the existing cron result contract. Report `disabled`, `skipped`, `failed`, and `completed` distinctly. Never count a dry-run candidate as a sent message or completed mutation.
- In `runCronJobNowAction`, first authenticate and require `ops.manage`; then resolve the slug; then enforce the existing stronger MFA and typed confirmation requirements for money workers. Prefer reusing the authenticated context if the auth helpers support it.

**Acceptance**

- Anonymous callers receive the same authentication behavior for valid and invalid slugs. Authenticated staff without `ops.manage` cannot enumerate or invoke jobs through this action.
- Money jobs still require MFA and exact confirmation. Ordinary permitted jobs retain their intended behavior.
- Direct calls to retired/disabled workers cannot update payments, grace periods, webhook resolution, or backend query state.
- A database/RPC error cannot return successful work counts or `ok: true`.
- An unresolved webhook fixture remains unresolved when the retired healer is invoked.

Files: `src/app/admin/health/actions.ts`, the four `src/app/api/cron/<job>/route.ts` files, and `src/lib/ai-operator/{tools,smart-dunning,activation-nudge,webhook-healer,db-guard}.ts`.

### B. Remove rehearsal noise and prevent future mode contamination

**Changes**

1. Capture an exact, read-only manifest of the matching 185 event IDs, their mode, original error, terminal state, and receipt interval. Rerun the predicate immediately before a later data change; halt if membership or state differs.
2. Add a service-owned operational disposition record or equivalent metadata with a unique event reference, reason, actor, timestamp, and original classification. Mark only the reviewed rehearsal cohort as excluded from production action queues. Preserve the source rows and their original failures.
3. Make the operational scanner, admin billing counts, filters, and alert digests use the same classification policy. Keep an explicit rehearsal/history view and count. Let the next successful scan clear matching actionable findings with recorded disposition; do not blindly mark unrelated findings resolved.
4. At production ingestion/selection boundaries, identify test-mode events before provider lookup. Route approved test rehearsals to an isolated test environment. In production, terminally classify foreign-mode events using the existing inbox state contract or a reviewed additive extension. Derive environment policy from trusted server configuration, never from caller-supplied flags.
5. Preserve signature verification, inbox deduplication, ownership/lease fencing, live-mode binding validation, retry backoff, and the rule that terminal rows are not automatically reclaimed.
6. Treat newly arriving unexpected test traffic as a configuration finding with bounded notifications. Excluding a known rehearsal batch must not silently hide future endpoint misrouting.
7. Keep the August 29 live mismatch visible until its provider object and expected contract have been investigated. Do not replay it automatically or suppress all `billing_mode_configuration_invalid` errors regardless of mode.

**Acceptance**

- Exactly the reviewed test cohort leaves the actionable billing view; all 185 source records remain available with their original errors. The live mismatch remains actionable.
- Two independent queue consumers cannot claim the same event. A terminal row is not selected.
- A test-mode fixture submitted to the production policy makes no live-provider request and changes no subscriptions, balances, invoices, or entitlements.
- A valid live fixture still projects once. A malformed live binding remains a failure and generates an alert.
- Latest-run health can show recovery while the historical 24-hour failure count remains accurate. Three subsequent scheduled projector/monitor cycles pass; a follow-up observation covers 24 hours.

Files: subscription inbox/resolver/projector/worker modules under `src/lib/billing`, the deployed subscription claim RPC, `scan_operational_failures`, `src/lib/operational-monitor.mjs`, and admin billing readers. Preserve the deployed SQL function's current terminal-selection behavior.

### C. Make campaign sends durable and idempotent — before another blast

**Changes**

- Replace the 60-second audit-log heuristic with an atomic database reservation **before the first provider call**. Require a stable client-generated operation UUID for a send intent. Repeated clicks and request retries reuse that UUID; an explicit new campaign creates a new one.
- Introduce `platform_campaign_runs` with a unique operation key, campaign ID, immutable content/audience configuration hash, actor, state, lease/version fields, and timestamps. A repeated key with the same payload returns the existing run; a repeated key with different content is a conflict.
- Persist a deduplicated recipient snapshot and per-recipient delivery records, unique by campaign and normalized recipient identity. Store provider ID, immutable send payload or its reproducible version, attempt history, next attempt, and explicit outcome.
- Submit an intent and return its run ID promptly. Process recipients through bounded, leased batches so a request timeout cannot lose all progress. Register the new worker and schedule only once its schema, feature gate, and tests are in place.
- Use a stable provider idempotency key per campaign recipient. Distinguish provider acceptance from delivery, rejection, and unknown outcome. Reconcile unknown outcomes before retrying with any new key. Resend retains idempotency keys for 24 hours, so stop uncertain automatic retries before that boundary and require reconciliation afterward. [Resend idempotency documentation](https://resend.com/docs/dashboard/emails/idempotency-keys).
- Recheck current suppression/eligibility immediately before sending. Freeze campaign content while still honoring opt-outs or account restrictions that occur after audience creation. Database or suppression lookup errors block sends.
- Preserve MFA, `ops.manage`, unsubscribe headers, sender validation, and auditability. Write the intent/audit boundary durably; an audit-log failure after provider acceptance must not enable another blast.
- Make the composer show queued, sending, accepted, delivered, partially failed, and needs-review states from stored results. Update history to read the durable runs, with a fallback for old audit-only campaigns. Cancellation stops unsent recipients and does not claim to retract accepted email.

**Acceptance**

- Twenty concurrent invocations using one key produce one campaign run and at most one accepted email per eligible recipient under tested crash/retry scenarios. Verify this with real database concurrency, not only mocks.
- Crash before send, after provider acceptance but before persistence, between recipients, and after lease expiry; recovery reuses the same run and recipient keys.
- A changed payload under the same key is rejected. Separate intentional campaigns are not blocked merely because their subjects match.
- Suppressed recipients and failed suppression queries cause zero sends to those recipients.
- Ambiguous sends beyond the provider deduplication window enter review and are not automatically resent.
- The UI and counters distinguish acceptance from delivery. No campaign state depends on the lifetime of one lambda.

Files: campaign actions/composer, `src/lib/admin-platform-campaigns.ts`, a campaign queue migration/worker, delivery callback integration, admin history, `src/lib/cron-jobs.ts`, and `vercel.json`. Verify SDK support against the installed Resend version; use the documented HTTP API if necessary rather than bundling an unrelated upgrade.

### D. Connect the on-call panel to the working alert system

**Changes**

- Replace the in-memory recent-pages reader with persisted `operational_alert_findings` and `operational_alert_deliveries`. Show detection, queued, accepted, delivered, failed, and awaiting-review timestamps accurately.
- Route the manual drill through that same durable path, marked as a drill. Its UI initially reports queued/accepted and updates to delivered only after callback evidence. Do not run a live drill while implementing without an approved recipient and explicit send authorization.
- Retire the disconnected dispatcher or make it a thin adapter onto the common queue. Preserve stable incident identities so repeat scans and recurrence do not create uncontrolled duplicate pages.
- Add acknowledgement separately from delivery, recording actor and time. Acknowledgement is not resolution; resolution must refer to recovery evidence or an explicit disposition. Implement escalation timers only if an actual secondary channel and escalation policy are configured.
- Replace the implied 24/7 staffed rotation and automatic 15-minute escalation copy with the actual named contact and coverage. Label manual escalation honestly.
- Preserve the GitHub watchdog's database-independent fallback. Confirm scheduled workflow execution separately from its presence in YAML. A second channel remains a deliberate extension for loss of the primary email provider/inbox.

**Acceptance**

- An authorized source-level drill appears in the panel after a new lambda/process loads and after a redeploy. Its stored delivery status matches the signed provider callback.
- A bounce/timeout never appears as delivered. A lost database write after acceptance recovers using the existing immutable payload and idempotency key.
- A repeated finding does not page endlessly; a resolved finding that recurs produces a new actionable notification.
- Manual acknowledgement persists, requires appropriate staff permissions, and does not clear the underlying failed source.
- Scheduled app detection and the independent watchdog are both exercised in a controlled drill with measured detection/delivery times. Human receipt is recorded separately when confirmed.

Files: `src/lib/on-call-paging.ts`, `src/lib/operational-monitor.mjs`, health page/actions, alert RPCs/tables, and `.github/workflows/cron-health-alert.yml`. Build on the existing operational runbook and verification script.

### E. Make uptime and health statements evidence-based

**Changes**

- Expand the shared health contract to distinguish `configured`, `disabled`, and `unknown` from `operational`, `degraded`, and `outage`. Track evidence type, observation time, and freshness separately from configuration presence. Update exhaustive UI/status mappings and API consumers in the same change.
- Immediately render configuration-only checks as configured and show disabled voice as disabled. A database query does not prove quoting/PDF generation works. A root-domain variable does not prove customer domains resolve or terminate TLS.
- Define aggregation explicitly: current observed outage/degradation wins; otherwise missing or stale required evidence prevents an overall operational label. Intentional optional-feature disablement is excluded from required-service availability. Configuration evidence alone is never promoted to a successful probe.
- Remove fabricated 24h/7d/30d percentages, incident-free days, and probe counts. Remove the page's claim that probes run every 60 seconds until such a collector is actually scheduled and verified. Use “Not measured” until historical samples exist.
- Apply the same semantics to `/api/health` and its customer-facing consumers. Preserve non-2xx failure handling so consumers display the failure payload rather than blanking the status UI. Keep sensitive operational detail behind the existing authorization boundary.
- Add bounded, low-impact observations where valuable: database query; quote/PDF fixture; known application-domain reachability/TLS; recent signed voice/SMS/email receipts and queue age. A provider credential check verifies credentials only. Record “no recent evidence” when there is no traffic.
- If historical uptime is needed, persist probe samples and define expected cadence, timeout, stale/missing sample handling, retention, measurement scope, and coverage denominator. Show coverage beside percentages and distinguish measured availability from a contractual SLA.

**Acceptance**

- Setting all environment variables without successful observations cannot make six services or the overall report green.
- Disabled voice, missing credentials, stale samples, probe errors, empty history, and genuine outages each render their defined state.
- No hardcoded uptime percentage or invented probe count remains in the response or UI.
- Admin and public status consumers display consistent meanings; outage responses remain visible.
- Any displayed percentage can be reproduced from stored observations, including the treatment of missing samples.

Files: `src/lib/uptime-monitoring.ts`, `src/app/api/health/route.ts`, `src/app/admin/health/page.tsx`, status styles/types, and customer health consumers.

### F. Capture exceptions durably and expose instrumentation failures

**Changes**

- Keep a single exception-reporting adapter but replace the in-memory panel source with a persistent, access-controlled sink. Default proposal: a bounded application-exception table with timestamp, release/environment, normalized route, safe error code, severity, fingerprint, and correlation ID. Keep raw payloads and secrets out of it.
- Wire Next.js server error instrumentation, shared cron boundaries, webhook boundaries, and important caught server-action failures. Catch boundaries need explicit capture because framework instrumentation does not replace handling for errors intentionally consumed by application code.
- Check the installed Next.js 15.5 contract before implementation; use its documented `onRequestError` hook and await asynchronous reporting with bounded failure handling. Deduplicate framework/boundary reports of the same occurrence. [Next.js instrumentation documentation](https://nextjs.org/docs/pages/api-reference/file-conventions/instrumentation).
- Capture browser error boundaries through a constrained, validated reporting route only where needed. Bound payload size, rate, and accepted fields; exclude cookies, tokens, customer messages, and URL query secrets.
- Make telemetry failure non-recursive. Preserve the original response/error when persistence fails, emit a sanitized structured-log fallback, and surface capture-health degradation through the independent operational monitor.
- Define retention and rollups. A proposed starting point is 30 days of sanitized occurrences with longer aggregate counts; finalize against the application's data-disposition policy.
- The Exceptions panel must distinguish no captured exceptions from unavailable instrumentation or a failed query. Add release, environment, first/last occurrence, and grouped count.

**Acceptance**

- Controlled route, cron, webhook, and server-action errors are visible from a separate process after restart. A browser boundary fixture appears if client capture is included.
- One failure reported by two boundaries is grouped without losing occurrence accuracy. Redaction tests cover headers, query strings, nested payloads, and provider exceptions.
- A sink timeout does not change the business operation's outcome, recurse, or silently show an empty healthy panel.
- Normal business validation and framework control-flow responses are not recorded as outages.

Files: `src/lib/apm-telemetry.ts`, new `src/instrumentation.ts` if absent, existing request/cron/webhook boundaries, exception reader/panel, and the chosen persistence/retention implementation. General APM percentiles remain a separate scope unless they rely on the same misleading in-memory claims.

### G. Turn privacy resolution into verified fulfillment

**Changes**

- Add explicit request lifecycle and outcome fields: received/open, verifying, in progress, blocked, and resolved, plus a fulfillment outcome, evidence reference, and timestamps. Map existing rows compatibly. Keep rejection, withdrawal, partial fulfillment, and fulfilled outcomes distinct.
- Verify requester identity and the scope of the request. Fetch the request's actual account from the database; account-detail actions must check it matches the bound account. A homeowner/individual data request must not be treated as authorization to close an entire contractor account.
- For verified account-deletion requests, atomically link or reuse a durable closure job through `requestAccountClosure`; both admin entry points use the same service. Reuse existing identity suspension, lease/version fencing, vendor adapters, and data-disposition registry.
- Mark in progress when closure begins. Mark fulfilled only after the required local and applicable vendor stages are complete or have an explicitly recorded lawful/policy disposition. `success: true` alone is insufficient: the current orchestrator can return an incomplete grace-period state, and a restored/cancelled closure must not count as fulfilled deletion.
- Reconcile linked request/job state from the existing closure worker or an explicit bounded reconciliation job. Close the crash window between starting a closure and recording the privacy link. A repeated submission must recover the same job.
- Preserve legal holds and required retention. Show blocked stages and follow-up actions rather than accepting a generic note as completion. Retain the minimum privacy/closure evidence needed after account disposal; verify the account deletion path cannot cascade away the evidence before finalization.
- For access requests, link a scoped export artifact, completion evidence, and secure retrieval/expiry. For corrections, record which allowed data was corrected and evidence of completion. For other requests, require an explicit disposition and evidence type.
- Establish intake ownership and acknowledgement tracking. Treat the existing hardcoded 30-day deadline as a current application rule to review, not a universal legal conclusion. Reconcile deadline policy with the closure grace period; show approaching/overdue requests even while another workflow is waiting.
- Apply the existing destructive account-closure permission/MFA/confirmation requirements to the actual deletion step. Logging a privacy request or reading its state remains separate from authorizing destruction.

**Acceptance**

- Notes alone cannot fulfill a deletion. The wrong account/request combination is rejected.
- Two concurrent requests to begin fulfillment produce one linked closure job. A retry after a crash recovers the same workflow.
- Partial vendor failure, legal hold, grace period, restoration/cancellation, and export-generation failure remain accurately open/blocked or separately dispositioned.
- Full closure produces one auditable fulfilled outcome, and the audit evidence survives the relevant account disposition.
- Access exports contain only the authorized scope and expire as configured. Correction evidence identifies the actual completed change.
- Deadline/intake tests cover no requests, open requests, blocked workflows, impending deadlines, and overdue requests. A failed database read displays unavailable rather than zero.

Files: `src/lib/privacy-requests.ts`, both privacy admin action/page paths, `src/lib/account-closure-orchestrator.ts`, closure RPCs/worker, `src/lib/data-disposition-registry.ts`, export integration, and request schema.

### H. Make cron registration complete and investigate the smaller failures

**Registration changes**

- Extend the registry to explicitly describe scheduled, manual, disabled, and retired jobs, with purpose, owner, importance, expected cadence where applicable, and disablement reason. Preserve `vercel.json` as the deployed schedule authority.
- Strengthen parity checks to discover every cron route, not merely compare the current registry to `vercel.json`. Every route must have a disposition; every scheduled route must exist; a disabled/retired route must not be scheduled or manually runnable.
- Apply the proposed dispositions: smart dunning retired; activation deferred/disabled; generic webhook healing retired; database guard disabled pending an observation-only replacement. Do not schedule all four to make the lists match.
- Add a terminal abandoned/timed-out run state or an equivalent derived status once a run exceeds its configured maximum duration plus grace. Preserve the original run and make stale completion updates safe. Do not let a later success hide unfinished work that needs inspection.

**Failure investigation**

| Job | Evidence from the sampled 24 hours | Next diagnostic step |
| --- | --- | --- |
| `direct-payment-settlement` | Two failures, each `claimed=0, worker_errors=1`; one unfinished run. | Correlate invocation logs and RPC/database errors at 07:10 and 10:30 UTC September 9. Inspect queue state and the unfinished 21:45 UTC September 8 invocation. Zero claimed suggests an early failure but does not prove no side effect. |
| `top-up-projection` | One failure, `claimed=0, claim_errors=1`; one unfinished run. | Inspect claim failure at 22:45 UTC September 8 and the unfinished 19:00 invocation. Check RPC contracts, connection failures, leases, and grant ledger before any retry. |
| `voice-allowance` | Two failures, each `considered=2, skipped=1, failed=1`; one unfinished run. | Identify the failed account/period and safe error code in logs at 08:00 and 10:00 UTC September 9; compare allowance ledger and idempotency keys. Inspect the 06:45 unfinished run. |
| `email-domain-reconcile` | One failure, `checked=0, errors=1`; two successful runs. | Inspect the initial query/provider-list stage at 18:51 UTC September 8 and verify the next successful reconciliation covers the affected domain state. |

Root causes of these four failures are **not yet established**. Query current Vercel runtime logs if retained; if unavailable or insufficient, record that limitation and add safe stage/error-code/correlation logging before a controlled reproduction. Do not infer “transient” from small counts or clear failures by editing history.

**Acceptance**

- Adding an orphan cron route makes the registry parity check fail. Disabled jobs cannot acquire work even through direct authenticated invocation.
- Each of the four failures has either an evidenced root cause with a verified correction, or an assigned investigation with sufficient diagnostic instrumentation and an explicit open status.
- Abandoned runs remain visible, and any associated leases or financial outcomes are reconciled before retry.
- Payment/grant retries reuse their existing durable operation keys; no new charge, credit grant, or customer message is used as a diagnostic shortcut.

## 4. Implementation sequence and release controls

| Change set | Scope | Dependency / release gate |
| --- | --- | --- |
| 1 | A: disable/retire misleading worker paths; authenticate cron actions first. Add H's route-disposition coverage. | First. Keep existing scheduled production workers and alert delivery intact. |
| 2 | B: explicit rehearsal classification and production/test-mode handling; H's four-failure diagnostics. | Snapshot and migration review before any later data correction. Prove live events still alert/project correctly. |
| 3 | C: campaign reservation, recipient ledger, bounded worker, and composer/history states. | Complete before another blast. Schema and migration tests precede enabling the worker. |
| 4 | D + E: durable on-call history and honest health labels/metrics. | Reuse the deployed alert queue; update all status consumers together. |
| 5 | F: persistent exception capture and operational integration. | Verify redaction, failure isolation, and cross-process visibility before enabling broad capture. |
| 6 | G: privacy workflow and closure integration. | Confirm deletion scope, existing closure safeguards, retention/deadline policy, and workflow completion semantics. |
| 7 | H closeout: remaining root-cause fixes, abandoned-run handling, integrated verification and runbooks. | Do not mark unresolved investigations complete just because later runs succeed. |

A reasonable planning range is **8–14 engineering days** for implementation and verification of the recommended scope, assuming existing infrastructure is reusable. This is an estimate, not a commitment; unresolved worker causes or closure-contract defects can extend it. A new secondary paging provider, custom dunning, activation delivery, or a full historical uptime service is separately scoped.

For each change set:

1. Verify current remote/deployed state and relevant database schema. Work from an isolated checkout; preserve unrelated local changes and do not bundle divergent local documentation/product work.
2. Use additive, backward-compatible schema changes first. Review existing privileges, RLS, indexes, and service-only RPC execution. Register any new tables in the disposition/retention policy.
3. Run targeted behavior tests and real Postgres concurrency/fencing tests where state transitions are involved. Run typecheck, lint, relevant integration tests, and the production build on the final revision.
4. Verify the complete preview flow, including loading/empty/error/disabled states, staff permissions, and persisted results read from another process. Do not use production customer data for destructive or messaging tests.
5. Prepare concrete deployment/migration instructions and any exact data-change manifest. Apply migrations before code that requires them; verify the intended production deployment/alias and feature flags.
6. Run only explicitly authorized live notification or destructive canaries. This planning request itself does not authorize sending mail, replaying financial operations, closing accounts, or changing production data.
7. Record deployment SHA, migration identifiers, test evidence, before/after counts, and observed scheduled runs. Keep the original failure history. Set a follow-up observation window of at least 24 hours and cover daily jobs' next run; no automation has been scheduled by this plan.

**Rollback/containment**

- Stop a new campaign worker without discarding reservations or recipient outcomes. Never restore the old unreserved sender as the rollback path.
- Roll back reader/UI code while leaving additive evidence tables intact. Disable a failing capture adapter without changing business-operation outcomes.
- Rehearsal dispositions are reversible through an audited classification change; do not use destructive SQL or force those rows back into processing.
- Privacy destruction is not reversible by a code rollback. Pause new fulfillment requests, preserve active jobs/evidence, and resume through the existing fenced recovery path after correction.
- Alert faults must not disable payment workers or erase failures. Preserve the existing operational-alert watchdog and its database-independent fallback unless that specific channel is being contained.

## 5. Definition of done

- [ ] The original status report is superseded with the verified distinctions above: historical projector failures, terminal test backlog, working email alerts, and remaining legacy UI gaps.
- [ ] Retired/deferred worker decisions are recorded and enforced at every entry point.
- [ ] Production billing action queues exclude the exact reviewed rehearsal cohort while retaining all source evidence and the live mismatch.
- [ ] Concurrent campaign submissions and crash recovery cannot create duplicate send intents or blindly resend uncertain outcomes.
- [ ] On-call history and exceptions persist across processes; delivery, acknowledgement, resolution, and capture availability have distinct meanings.
- [ ] No service is called operational solely because credentials exist; historical uptime and probe counts are measured or absent.
- [ ] Privacy requests have validated scope, durable fulfillment, evidence-based completion, and deadline visibility.
- [ ] Every cron route has an explicit disposition; current failures and abandoned runs remain diagnosable.
- [ ] The four smaller cron failures are either fixed with evidence or remain explicitly open with an owner and next diagnostic step.
- [ ] Relevant tests, production build, preview flows, and authorized production checks are recorded against the released revision.
- [ ] Runbooks explain recovery, containment, and remaining limitations without claiming features or verification that do not exist.

## 6. Read-only verification queries for implementation handoff

Run these afresh; counts in this document are not assumptions for a future write.

```sql
-- Worker health: current state and historical failures are separate evidence.
select job, count(*) as runs,
       count(*) filter (where ok is true) as successful,
       count(*) filter (where ok is false) as failed,
       count(*) filter (where ok is null) as unfinished,
       max(started_at) as latest_run,
       max(started_at) filter (where ok is false) as last_failure
from public.cron_runs
where started_at > now() - interval '24 hours'
  and job in ('billing-subscription-projection', 'direct-payment-settlement',
              'top-up-projection', 'voice-allowance', 'email-domain-reconcile',
              'operational-alerts')
group by job order by job;

-- Terminal versus retryable, separated by mode and original cause.
select livemode, processing_status, last_error,
       (next_attempt_at is null) as no_scheduled_retry,
       count(*) as events, min(attempt_count), max(attempt_count)
from public.billing_events
where event_scope = 'platform_subscription'
group by livemode, processing_status, last_error, (next_attempt_at is null)
order by livemode, processing_status, last_error;

-- Persisted notification outcomes, not merely API success.
select category, state, provider_status, count(*) as deliveries,
       max(delivered_at) as latest_observed_delivery
from public.operational_alert_deliveries
group by category, state, provider_status order by category, state;

select category, count(*) as unresolved_findings
from public.operational_alert_findings
where resolved_at is null group by category order by category;

select status, kind, count(*) as requests
from public.privacy_requests group by status, kind;
```

Additional code anchors: [exception capture](https://github.com/wideeyephoto/lets-get-quoted/blob/48dee526b6c25a020758e42f4684bd5698ef54e2/src/lib/apm-telemetry.ts), [cron action](https://github.com/wideeyephoto/lets-get-quoted/blob/48dee526b6c25a020758e42f4684bd5698ef54e2/src/app/admin/health/actions.ts), [privacy service](https://github.com/wideeyephoto/lets-get-quoted/blob/48dee526b6c25a020758e42f4684bd5698ef54e2/src/lib/privacy-requests.ts), [closure orchestrator](https://github.com/wideeyephoto/lets-get-quoted/blob/48dee526b6c25a020758e42f4684bd5698ef54e2/src/lib/account-closure-orchestrator.ts), [dunning sweep](https://github.com/wideeyephoto/lets-get-quoted/blob/48dee526b6c25a020758e42f4684bd5698ef54e2/src/lib/ai-operator/smart-dunning.ts), [activation sweep](https://github.com/wideeyephoto/lets-get-quoted/blob/48dee526b6c25a020758e42f4684bd5698ef54e2/src/lib/ai-operator/activation-nudge.ts), [webhook healer](https://github.com/wideeyephoto/lets-get-quoted/blob/48dee526b6c25a020758e42f4684bd5698ef54e2/src/lib/ai-operator/webhook-healer.ts), [database guard](https://github.com/wideeyephoto/lets-get-quoted/blob/48dee526b6c25a020758e42f4684bd5698ef54e2/src/lib/ai-operator/db-guard.ts).
