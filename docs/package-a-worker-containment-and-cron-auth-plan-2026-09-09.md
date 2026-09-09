# Package A: contain incomplete workers and authenticate cron actions first

Status: implementation-ready proposal. Prepared September 9, 2026. This document plans the changes; it does not implement or deploy them.

The release is complete when the four incomplete workers cannot perform business work through any entry point, their callers report unavailability accurately, and the manual cron action authenticates and authorizes the caller before examining a job slug. Existing scheduled billing, messaging, lifecycle, and operational-alert workers must retain their behavior.

## 1. Baseline and verified findings

Latest production-target release checked: [`48dee526b6c25a020758e42f4684bd5698ef54e2`](https://github.com/wideeyephoto/lets-get-quoted/commit/48dee526b6c25a020758e42f4684bd5698ef54e2), Vercel deployment `dpl_uLi2ZDS2BP6NY78hfwxd8gCasGwo`. The newer MFA-enrollment release is a preview, not this cron authorization fix.

The local checkout is `6cf9c6a35` and diverges from production. The relevant worker and auth helpers match, but local `main` lacks production's operational-alert additions and contains the older SRE helper. Start implementation from the current verified production/remote baseline; do not overwrite the deployed alert recovery fix with the older local implementation. Preserve unrelated working changes, including `LAUNCH_CHECKLIST.md`.

| Surface | Current behavior | Required outcome |
| --- | --- | --- |
| `runCronJobNowAction` | Calls `cronJob(jobSlug)` before authentication. Unknown slugs return immediately; known slugs enter auth. | All callers must pass authentication and `ops.manage` before any slug-specific lookup or response. |
| `smart-dunning` | Attempts `payments.next_retry_at` updates, attempts a nonexistent `accounts.grace_period_until` update, and can overstate applied work. | Retired for this release; no retry/grace writes, scans, or sends. Preserve the separate scheduled `dunning` job. |
| `activation-autopilot` | Still scans accounts; its sender refuses, while dry-run paths can count proposed nudges as sent. | Explicitly deferred; no autonomous scan or dispatch through this worker. Preserve the separate `contractor-lifecycle` job. |
| `webhook-heal` | Simulates replay, increments success counters, and attempts to resolve the receipt without replaying it. | Retired; unresolved receipts remain unresolved. Preserve verified source-specific recovery. |
| `db-guard` | Calls missing inspection/cancellation RPCs, uses SQL-text heuristics for cancellation, and can report healthy despite errors. | Disabled; no inspection/cancellation RPC calls or invented headroom-restored results. |
| Four cron wrappers | All return `ok: true` and omit worker error arrays. None is scheduled or registered. | Authenticated disabled responses; no business callback and no successful run history. |
| AI tools and approvals | Nudge/dunning tools refuse, but remain advertised. Saved approval cards can reach the executor, which can mark approval/execution after an error-shaped tool result. | Remove executable claims and block old cards before execution/finalization. |
| RevOps scan | Creates `trigger_dunning_escalation` and `batch_activation_nudges` approval cards despite missing execution paths. | Keep diagnostic findings; stop creating executable promises for unavailable capabilities. |
| Logical-failure detector | Handles numeric/boolean/string failure fields, but does not recognize error arrays or `ok: false` by themselves. | Retained active wrappers cannot translate an explicit failure into success. |
| Tests | The autopilot test expects simulated webhook replay to increment resolved counts. Other tests treat the unavailable nudge as safe for automatic execution. | Replace these expectations with proofs of refusal and absence of side effects. |

The missing database objects were verified during the preceding production audit. This package does not need those objects created and does not depend on a new schema migration.

## 2. Scope and decisions

Use these defaults in the implementation:

- **Retire** `smart-dunning` and `webhook-heal`.
- **Defer** `activation-autopilot` until a separately approved delivery design exists.
- **Disable** `db-guard` until a separately scoped observation-only design exists. Automatic cancellation is outside this package.
- Keep the four URLs as authenticated disabled endpoints for a compatibility period. This gives authorized callers a clear result and allows a safe production containment check.
- Keep the four public worker exports as small compatibility stubs for the same period. Remove their unsafe bodies instead of leaving executable code behind an optional flag. Re-enabling requires a reviewed implementation change, not an environment-variable toggle.
- Add a small inactive-capability policy and route-inventory check. Leave the full cron registry redesign and abandoned-run analysis to package H.

This package does not build replacement dunning, activation delivery, webhook replay, query cancellation, billing-backlog classification, campaign idempotency, or a new observability system. It does not replay events, resolve historical failures, edit payment schedules, or delete approval history.

## 3. Define one inactive-capability policy

Proposed new module: `src/lib/inactive-operator-capabilities.ts`. Keep it pure, with typed, immutable records and no environment, database, or provider access.

Each record identifies the capability, its disposition (`retired` or `deferred`), reason code, cron slug, worker export, known tool/action aliases, and an operator-facing recovery location. The database guard may use `deferred` with a reason specifically stating that automatic cancellation is disabled.

| Capability | Cron slug | Worker export | Known tool/action aliases to block |
| --- | --- | --- | --- |
| Custom dunning | `smart-dunning` | `runSmartDunningSweep` | `optimize_dunning_retries`, `trigger_dunning_escalation` |
| Activation autopilot | `activation-autopilot` | `runActivationAutopilotSweep` | `trigger_contractor_lifecycle_nudge`, `batch_activation_nudges`, `send_onboarding_reminder` |
| Generic webhook healer | `webhook-heal` | `runWebhookAutoHealer` | Retire the obsolete `sre.inspect_webhook_failure` approval action; preserve actual diagnostic readers and verified replay tools. |
| Database guard | `db-guard` | `runDatabasePoolGuard` | Any alias discovered to invoke this specific guard. Do not blanket-disable unrelated database administration. |

Re-run the alias/caller search on the implementation baseline. A new discovered alias is added to this policy and tested before release. Use exact names; substring matching must not block legitimate jobs such as `dunning`, `contractor-lifecycle`, or `webhook-deliveries`.

Return a common refusal envelope from compatibility workers and blocked tool calls:

```ts
type UnavailableCapabilityResult = {
  ok: false;
  success: false;
  available: false;
  status: 'disabled';
  capability: string;
  disposition: 'retired' | 'deferred';
  reasonCode: string;
  message: string;
};
```

Legacy report adapters may retain existing counter fields for one release, but every scan/send/retry/cancel/resolve counter must be zero. They must not expose a successful dispatch timestamp, `healthy`, or `headroom_restored`. Treat the response as unavailable, not as a zero-work success. Do not allocate a Supabase client or emit asynchronous audit writes inside a worker stub.

## 4. Fix `runCronJobNowAction`

**Recommended implementation order**

1. Call `requirePermission('ops.manage')` as the first authorization operation.
2. After that succeeds, check the inactive-cron policy and resolve the active `cronJob` specification. Return an authorized disabled/unknown result as appropriate.
3. For an active money job, call the existing `requireMfaPermission('ops.manage')` and require typed confirmation equal to the canonical `spec.job`.
4. Enter the operational `try/catch` only after all auth, permission, and MFA guards. Read `CRON_SECRET`, construct the URL from the allowlisted `spec.job`, and issue the existing request.
5. Preserve the audit entry and revalidation behavior. A disabled response or logical failure cannot produce the “ran successfully” message.

The existing MFA helper performs permission/auth checks internally and its lower-level context helper is private. For this small fix, use the established public helper twice on the money branch rather than broadening/refactoring the auth API. Use the stepped-up context for the actual invocation and audit. An optimization to share the context is optional future work, not a release dependency.

Illustrative control flow, not a drop-in implementation:

```ts
let ctx = await requirePermission('ops.manage');
const inactive = inactiveCronJob(jobSlug);
if (inactive) return disabledActionResult(inactive);

const spec = cronJob(jobSlug);
if (!spec) return unknownJobResult(jobSlug);

if (spec.importance === 'money') {
  ctx = await requireMfaPermission('ops.manage');
  if (confirmation !== spec.job) return confirmationRequired(spec.job);
}

// Operational handling begins here; auth control flow remains outside it.
return invokeAndRecordCron(ctx, spec);
```

Anonymous, deactivated, and nonstaff callers retain the auth helper's existing `notFound` behavior. Active staff without the permission retain the permission denial. The acceptance criterion is the same auth behavior and no slug-dependent work for these callers; it is not a promise of identical network timing.

Do not add MFA to every ordinary cron job. Preserve metadata-based classification of **every** money worker instead of introducing a hardcoded job-name list.

## 5. Contain cron routes and direct worker calls

### Authenticated disabled routes

- Add a small `disabledCronRoute(job)` helper in the cron routing layer, using the same bearer-secret check as `cronRoute`. Extract that check into a shared internal function if useful, preserving current behavior.
- Missing configuration, missing credentials, and incorrect bearer credentials return the existing generic `401 Unauthorized` before creating a database client, revealing a disablement reason, or recording a run.
- A valid cron secret returns **410** with the refusal envelope and a stable reason code. Keep cache behavior disabled. The route does not call its former worker.
- Replace all four wrappers with this helper. Remove their worker imports and `createAdminClient` calls. Their old `maxDuration=300` setting is unnecessary for a constant response.
- Add an inactive-slug check inside ordinary `cronRoute`, after authentication and before `createAdminClient`, as defense against accidentally wiring a blocked slug back to a normal callback.
- Emit a small structured refusal log after authorized invocation if useful. Do not write `cron_runs` start/success records: no run occurred. Unexpected repeat calls should be discoverable in runtime logs without becoming a new healthy heartbeat.

### Compatibility worker stubs

- Replace each worker body with its typed unavailable result. Apply this to default, explicit live, and `dryRun: true` invocation; dry-run is not a bypass for scanning or invented execution counts.
- Remove side-effect imports, helper paths reachable only from those bodies, and calls to `recordOperatorAudit`/`createHitlAction` that claim performed work.
- Preserve any pure helper only if a real remaining caller needs it. Do not retain unused retry heuristics simply because a test asserts their current behavior.
- Do not add `dunning_events`, `contractor_onboarding_nudges`, `grace_period_until`, `get_long_running_queries`, or `cancel_backend_query` to support retired code.

### Route inventory

Keep `CRON_JOBS` as the active scheduled registry for this release. Add the inactive slugs through the shared policy rather than pretending they have a cadence.

Update route coverage tests so every discovered cron route belongs to the scheduled set or an explicitly declared nonscheduled disposition. Every scheduled route must exist and match its expression. Inactive slugs must be absent from `vercel.json` and the active registry. If other manual routes are discovered, classify them explicitly; do not automatically schedule them.

The health page may show a small inactive-workers list with reason text, but no Run button, overdue calculation, or operational pill. This is explanatory status, not a new monitoring subsystem.

## 6. Close AI-tool, autonomous-cycle, and approval bypasses

**Tool exposure and direct calls**

- Remove the two unavailable execution tools from `OPERATOR_TOOLS_DECLARATION`, or filter them out using the policy before presenting tools to the model. Remove examples and descriptions promising their execution.
- Keep direct-name dispatch compatibility: `executeOperatorTool` checks the policy and returns the refusal envelope even if the model reuses an old tool call from conversation history.
- Remove unavailable nudge aliases from `SAFE_AUTO_REMEDIATION_ACTION_TYPES`. Approval-required classification alone is not availability: approved dunning aliases must also be blocked.
- The policy takes precedence over founder approval, `dryRun`, `source='founder_cli'`, staff role, and circuit-breaker success. None of those makes an unimplemented capability available.

**Autonomous RevOps cycle**

- Preserve read-only dunning/onboarding findings and the executive briefing.
- Stop creating `trigger_dunning_escalation` and `batch_activation_nudges` cards offering one-click execution. Present the findings as manual-review recommendations linked to existing admin views.
- Remove or rename `autoDispatchNudges` in this diagnostic path so it cannot imply sending. Continue reporting zero performed actions and separate candidate counts.
- Do not remove legitimate `dunning`, `contractor-lifecycle`, operational-alert, or source-specific recovery flows because their names overlap with the retired experiments.

**Previously saved approval cards**

- In `executeHitlDecision`, after loading the card and preserving the existing rejection path, reject approval of an inactive action **before** entering the execution branch. Check this even when no Supabase execution context was supplied.
- A disabled, unknown, explicitly failed, or unavailable tool result must not fall through to `resolveHitlAction(..., 'approved', ...)` or write `executed_at`. Add a narrow result-normalization guard for tool-backed execution paths; do not infer success from the mere presence of `data`.
- Missing execution context returns a refusal. Do not create a privileged staff identity or pass a service-role context merely to make the mobile bridge succeed.
- Retain old cards for audit history. Render an “Unavailable” explanation and disable Approve; permit an appropriately authorized rejection/dismissal with a reason. Do not automatically purge cards or introduce a new database status solely for this containment release.
- Audit the attempted decision and its refused outcome separately. `resolveHitlActionServerAction` must include success/refusal in its audit metadata instead of making an approved intention look like completed execution.
- Exercise the signed mobile callback path, which also reaches `executeHitlDecision`. For blocked actions it must not emit `operator.mobile_approval_executed` or a success page. Existing signature/expiry checks remain mandatory. Any broader mobile-approval authorization redesign is tracked separately.
- Flush authorized refusal audit writes at the existing request boundary where used. Audit persistence trouble must never cause an unavailable capability to execute.

## 7. Preserve truthful failure reporting

The inactive route short-circuit avoids creating a run entirely. Separately, close the small shared result-contract gap for active routes:

- Extend `cronSummaryHasFailures` to recognize explicit `ok: false` / `success: false`, an explicit failed status where used, and nonempty `errors`/`failures` arrays, while preserving existing supported failure counters.
- Failure evidence wins over `ok: true`. For example, `{ ok: true, errors: ['query_failed'] }` is a failed run.
- Empty error arrays, zero counters, and a valid no-work/skipped result remain successful only when the active worker actually evaluated its work successfully.
- If a disabled envelope unexpectedly reaches an active worker callback, treat it as failed/unavailable, never completed. This is a fallback; the inactive route check should normally prevent the callback entirely.
- Keep sanitized reason codes in client responses. Do not expose raw database/provider errors, secrets, or customer payloads.
- Have the manual cron action inspect logical failure in a returned body as well as HTTP status, so an accidental HTTP 200 failure cannot produce a success toast.

Preserve the existing separation between business execution and best-effort cron-history recording for supported workers. A broader telemetry persistence rewrite belongs to another package.

## 8. Verification matrix

Use behavior tests against exported actions/handlers, with spies proving ordering and absence of effects. File-string assertions supplement these tests; they do not prove containment by themselves.

| Test group | Cases | Required evidence |
| --- | --- | --- |
| Manual action auth | Anonymous, nonstaff, inactive staff, staff lacking `ops.manage`; each with valid, invalid, and inactive slugs. | Auth denial occurs first. No slug lookup, cron fetch, cron-run write, or success audit. Framework auth exceptions are not swallowed. |
| Money controls | Every registered money job; AAL1, MFA-query error, AAL2 with missing/wrong confirmation, AAL2 with exact confirmation. | Denied/redirected cases never fetch. Only authorized, stepped-up, confirmed calls execute. Classification is derived from registry metadata. |
| Ordinary active jobs | Authorized nonmoney job, unknown slug, inactive slug, malformed slug. | Ordinary job retains intended access; unknown/inactive inputs do not fetch. URL uses the validated canonical slug. |
| Four raw routes | No secret configured; missing/wrong bearer; valid bearer. | Generic 401 before work, or authorized 410 disabled. No admin-client creation, worker invocation, or `cron_runs` heartbeat. |
| Four direct exports | Default options, live options, dry-run options, supplied client whose methods throw if called. | Disabled result and zero reads/writes/RPCs/provider requests; zero performed-work counters. |
| Side-effect fixtures | Unresolved webhook, failed payment with retry timestamp, eligible new account, long-query candidate. | Receipt remains unresolved; retry/grace fields unchanged; no nudge; no cancellation. |
| Tool dispatch | Removed declarations; stale direct tool calls; founder-approved/source overrides. | Tool exposure is absent and every stale call refuses. No safety override enables it. |
| Saved approvals | Each blocked alias, repeated approval, valid mobile signature, expired/tampered signature, missing context. | No execution, no approved/executed transition, no `executed_at`, and no success notification. Authorized rejection remains possible. |
| RevOps cycle | Dunning/onboarding candidates present. | Findings remain; no unsupported approval cards, send claims, or automatic-execution counts. |
| Summary normalization | Explicit false flags; array/numeric/string errors; contradictory success flag; empty arrays; zero work; thrown worker. | Failure maps to HTTP 500 and failed history for actual active runs; valid no-work stays valid; disabled paths never masquerade as runs. |
| Schedule inventory | Current route set; a new unclassified route; an inactive route accidentally scheduled; a scheduled route removed. | All accidental changes fail validation; deliberate inactive routes do not create overdue alerts. |
| Preservation | Scheduled `dunning`, `contractor-lifecycle`, billing workers, `webhook-deliveries`, operational alerts, and genuine recovery paths. | Contracts, schedules, permissions, and relevant existing tests remain intact. |

Replace the autopilot test that expects simulated replay/resolution. Replace nudge safe-auto expectations and dry-run send-count expectations. Keep unrelated support-response, approval-signature, and working-worker tests.

For the no-side-effect proof, use seeded local/test fixtures and compare relevant rows before/after invoking the contained paths. No new concurrency test suite is required: this package removes execution paths rather than creating a queue or a new transactional workflow.

## 9. File-level change map

All paths below are relative to the repository root; proposed new files are marked.

| Files | Planned change |
| --- | --- |
| `src/lib/inactive-operator-capabilities.ts` **(new)** | Single typed policy, aliases, reasons, and refusal construction. |
| `src/app/admin/health/actions.ts` | Permission-before-lookup ordering; inactive-job refusal; existing MFA/confirmation preservation; body-failure handling. |
| `src/lib/cron-runs.ts` | Shared secret validation, disabled-route helper, inactive-slug guard before database/run start. |
| Four `src/app/api/cron/<inactive-job>/route.ts` files | Replace business wrappers with authenticated disabled handlers. |
| `src/lib/ai-operator/{smart-dunning,activation-nudge,webhook-healer,db-guard}.ts` | Replace unsafe worker bodies with compatibility stubs and remove dead side-effect code. |
| `src/lib/ai-operator/{tools,audit,engine,revops}.ts` | Remove unavailable execution exposure, safe-auto classification, unsupported card creation, and false approval completion. |
| `src/app/admin/operator/actions.ts`, `src/app/admin/operator/OperatorCockpit.tsx` | Refusal-aware audit/result rendering and disabled approval controls. |
| `src/lib/ai-operator/approval-bridge.ts`, `src/app/api/webhooks/operator-approval/route.ts` | Verify disabled-result propagation through signed callbacks; change only where refusal currently appears successful. |
| `src/lib/cron-jobs.ts` | Narrow logical-failure detection improvement; preserve active schedule definitions. |
| `src/lib/all-features-catalog.ts` | Remove/rewrite claims attributable to the retired custom dunning/SMS-update implementation after confirming no separate working implementation supports them. |
| `test/ai-operator-autopilot.test.ts`, `test/ai-operator.test.ts`, `test/cron-jobs.test.ts` | Replace false expectations and add availability/route inventory coverage. |
| `test/admin-cron-actions.test.ts`, `test/inactive-operator-capabilities.test.ts`, `test/inactive-cron-routes.test.ts` **(new)** | Focused auth ordering, direct-call containment, route responses, and approval refusal tests. |
| Existing auth, billing cron, operational-monitor, and service-health tests | Regression coverage for preserved controls and production alert behavior. |
| Runbook/decision note | Record inactive capabilities, retained working alternatives, removal criteria, and deployment evidence. |

Prefer two or three small reviewable commits within one coordinated change set. No production environment-variable change or database migration is expected.

## 10. Delivery sequence

1. **Baseline and contract:** verify current production SHA and remote main; create an isolated checkout; enumerate all callers/aliases/routes; agree on the disabled envelope and dispositions above.
2. **Containment:** add the policy, direct worker stubs, authenticated route responses, and auth-before-lookup change. Add focused tests immediately.
3. **Reachability closure:** remove AI exposure and unsupported card producers; block historical approvals/mobile paths; fix result normalization and misleading execution messages.
4. **Regression checks:** run focused tests, existing auth guards, cron registry, billing cron tests, operational-monitor tests, typecheck, lint, and a production build. Check the final diff does not remove the deployed alert route or restore the old SRE mutations.
5. **Preview verification:** test anonymous/unauthorized responses; exercise inactive routes and old cards against controlled fixtures; verify UI messages and a supported nonmoney job with a harmless test adapter. Do not invoke production money workers for testing.
6. **Release:** deploy only the reviewed commit after the implementation is authorized. Verify the deployment actually serving the canonical application domain. Existing schedules remain unchanged; no migration ordering is required.
7. **Production containment check:** on the verified new deployment, request the four disabled endpoints with the proper secret and confirm 410 plus reason codes. Confirm no corresponding new `cron_runs` rows and no business mutations. A wrong-secret request remains 401. Never test the old unsafe endpoints with valid credentials before the new deployment is verified.
8. **Observe and close:** inspect subsequent regular active-worker and operational-alert runs; retain an evidence record of SHA, route responses, tests, and checks. Cover the next run of preserved daily jobs through normal execution rather than manually triggering them. No monitoring automation is created by this planning document.

Planning estimate: **1–2 engineering days**, mostly for the approval-path and regression coverage. Allow additional time if baseline integration or existing tests expose an unrelated blocker. The initial containment/auth change should remain independently reviewable.

## 11. Rollback and future removal

- If UI or result-format changes regress, fix or revert those changes while retaining the inactive policy, worker stubs, and authenticated refusal paths.
- If a shared cron-wrapper change disrupts valid jobs, restore its prior active-job behavior while preserving the inactive-slug short-circuit and four disabled handlers.
- Do not roll back wholesale to code that restores simulated webhook resolution or unguarded dunning/query mutations. Prepare a containment-only fallback commit before release.
- Retain historical receipts, approval cards, and cron records. No cleanup migration or data deletion is part of rollback.
- After the compatibility period, remove the four worker exports/routes only when searches show no supported callers, runtime evidence shows no necessary consumers, and the route inventory is updated. Until then, keep the disabled response.
- A future replacement requires a separately reviewed purpose, schema, authorization model, idempotency/delivery or observation proof, and rollout plan. An unimplemented feature does not become available by changing the policy entry alone.

## 12. Completion checklist

- [ ] Authentication and `ops.manage` precede all slug-specific work in the manual action.
- [ ] MFA and exact confirmation still protect every active money job.
- [ ] All four inactive cron routes return generic unauthenticated denial or authenticated disabled status without running work.
- [ ] Direct imports of the four workers perform zero scans, mutations, provider requests, or false success audits.
- [ ] The unavailable tools and aliases cannot be enabled by old conversation history, founder approval, dry-run, or saved approval cards.
- [ ] RevOps stops creating unsupported execution cards while keeping useful diagnostic findings.
- [ ] Disabled/failed/unknown results cannot mark an approval executed or a cron invocation successful.
- [ ] Existing tests no longer require fabricated replay, cancellation, or delivery behavior.
- [ ] Active schedules and the deployed operational-alert/recovery changes are preserved.
- [ ] Focused tests, regression checks, build, preview behavior, and verified production containment evidence are recorded.
- [ ] Inactive capability decisions and future removal/replacement criteria are documented.

Source references: [cron action](https://github.com/wideeyephoto/lets-get-quoted/blob/48dee526b6c25a020758e42f4684bd5698ef54e2/src/app/admin/health/actions.ts), [auth helpers](https://github.com/wideeyephoto/lets-get-quoted/blob/48dee526b6c25a020758e42f4684bd5698ef54e2/src/lib/auth.ts), [cron wrapper](https://github.com/wideeyephoto/lets-get-quoted/blob/48dee526b6c25a020758e42f4684bd5698ef54e2/src/lib/cron-runs.ts), [operator executor](https://github.com/wideeyephoto/lets-get-quoted/blob/48dee526b6c25a020758e42f4684bd5698ef54e2/src/lib/ai-operator/engine.ts), [RevOps card producer](https://github.com/wideeyephoto/lets-get-quoted/blob/48dee526b6c25a020758e42f4684bd5698ef54e2/src/lib/ai-operator/revops.ts), [existing autopilot tests](https://github.com/wideeyephoto/lets-get-quoted/blob/48dee526b6c25a020758e42f4684bd5698ef54e2/test/ai-operator-autopilot.test.ts).
