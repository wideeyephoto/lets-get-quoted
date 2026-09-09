# Command Center — executable task list

**Date:** 2026-09-09 · **Baseline:** `d9a88e61f` · **Verified against** the live
production database.
**Companion docs:** [outstanding items](./admin-command-center-outstanding-2026-09-09.md)
(the why) · [original fix plan](./admin-command-center-fix-plan-2026-09-08.md) (history)

This is the *do* list. Every task names its files, its change, and the command that
proves it. Tasks are grouped into waves; within a wave they are independent unless a
**Depends on** line says otherwise.

**Standing rules for every task below**
- Run `npm run lint` **unpiped** alongside `npm test` and `npm run build`. Piping a
  gate loses its exit code.
- The main tree is frequently dirty with another session's work. Test in a detached
  worktree: `git worktree add --detach ../lgq-verify HEAD`, junction `node_modules`,
  copy `.env.local`. Never `git checkout -- ` a shared path.
- Any new table ships with RLS enabled **and** `REVOKE ALL ... FROM anon, authenticated`
  in the same migration, plus a test asserting the revoke. The default ACL grants anon
  INSERT/UPDATE/DELETE on every new table.
- When a task adds a gate, **prove it bites**: reintroduce the defect, watch the test
  fail, revert. A gate that has never failed is not a gate.

---

## Wave 0 — Unblocks everything else

### T1. Enable MFA in the Supabase project
- **Where:** Supabase Dashboard → Authentication → Multi-Factor Authentication
- **Do:** enable **WebAuthn** and **TOTP**.
- **Verify:** `/admin/security` no longer shows the "MFA enroll is disabled" branch at
  [MfaPanel.tsx:94](../src/app/admin/security/MfaPanel.tsx#L94).
- **Owner:** user · **Effort:** 10 min · **Blocks:** T2, and every MFA-gated action.

### T2. Enrol a factor on both staff accounts
- **Where:** `/admin/security`, signed in as each of `hdartguy@gmail.com` and
  `brett.arnold@live.com`.
- **Why both:** one lost device otherwise locks every refund and every account closure
  out of the platform permanently.
- **Verify:** `select factor_type, status from auth.mfa_factors` returns two `verified`
  rows.
- **Depends on:** T1 · **Owner:** user · **Effort:** 15 min.

### T3. Prove one MFA-gated action end to end
- **Do:** resolve a `webhook_failures` group from `/admin/failures`. 92 rows exist, it
  is reversible, and it exercises `requireMfaPermission` + `logAdminAction`.
- **Verify:** the action completes without redirecting, and a
  `webhook_failure_group_resolve` row lands in `admin_actions`.
- **Depends on:** T2 · **Owner:** user · **Effort:** 5 min.

### T4. Record the MFA recovery path somewhere that is not this platform
- **Do:** write down how to regain access if both factors are lost (Supabase dashboard
  factor deletion, who has that access).
- **Depends on:** T2 · **Owner:** user · **Effort:** 10 min.

---

## Wave 1 — Cheap, zero-risk correctness

### T5. Authenticate before answering in `runCronJobNowAction`
- **File:** [src/app/admin/health/actions.ts:31-34](../src/app/admin/health/actions.ts#L31)
- **Problem:** `cronJob(jobSlug)` returns `Unknown cron job: 'x'` *before* any auth call,
  so an unauthenticated caller gets a different answer for a valid slug than an invalid
  one.
- **Do:** call `await requireAdmin()` first, then look up `spec`, then step up to
  `requireMfaPermission('ops.manage')` when `spec.importance === 'money'`. Keep every
  guard **outside** the `try` — `test/admin-actions-auth-guard.test.ts` enforces this.
- **Verify:** `npx vitest run test/admin-actions-auth-guard.test.ts` and manually confirm
  an unauthenticated call redirects rather than reporting on slug validity.
- **Effort:** 15 min.

### T6. Delete the fabricated SLA block *(new — found 2026-09-09)*
- **File:** [src/lib/uptime-monitoring.ts:232-240](../src/lib/uptime-monitoring.ts#L232)
- **Problem:** `UptimeSlaMetrics` is entirely hardcoded — `uptime24hPct: 99.99`,
  `uptime7dPct: 99.98`, `uptime30dPct: 99.95`, `incidentFreeDays: 42`,
  `totalProbesRun24h: 1440`, `degradedProbesRun24h: 2`. None is measured. The page
  renders **"30d SLA: 99.95%"** at [health/page.tsx:192](../src/app/admin/health/page.tsx#L192)
  as though it were an availability figure.
- **Do:** remove the `sla` object and the rendered figure, or make every field
  `number | null` returning `null` (rendered "—") until something actually records probe
  history. Same treatment as `latencyMs` in the last pass.
- **Also fix the panel subtitle** at [health/page.tsx:184](../src/app/admin/health/page.tsx#L184):
  "Multi-subsystem synthetic probes evaluated every 60 seconds with 24h/7d/30d SLA
  tracking." There is no 60-second probe — it runs on page render — and there is no SLA
  tracking.
- **Note:** [test/reliability-operations-center.test.ts:125](../test/reliability-operations-center.test.ts#L125)
  asserts `report.sla.uptime30dPct >= 99.0` against a hardcoded `99.95`. That assertion
  is vacuous and currently pins the falsehood in place — update or delete it with the
  code.
- **Verify:** `npx vitest run test/reliability-operations-center.test.ts test/service-health-telemetry.test.ts`
- **Effort:** 1 hour.

### T7. Add a `configured` subsystem status
- **Files:** [src/lib/uptime-monitoring.ts:9](../src/lib/uptime-monitoring.ts#L9),
  [src/app/admin/health/page.tsx](../src/app/admin/health/page.tsx) (`SUBSYSTEM_CLASS`)
- **Problem:** six subsystems report `operational` purely because an env var is a
  non-empty string: `quoting-engine`, `stripe-payments`, `sms-gateway`, `voice-webhook`,
  `email-resend`, `contractor-cdn`. Only `database` and `cron-cadence` probe anything.
  The latency claim was withdrawn last pass; the status claim was not.
- **Do:**
  1. `export type SubsystemStatus = 'operational' | 'configured' | 'degraded' | 'outage'`
  2. Return `'configured'` from those six when their env check passes.
  3. Map `configured` to a **neutral** pill class, not green.
  4. Update `overallStatus` ([:221](../src/lib/uptime-monitoring.ts#L221)) so `configured`
     does **not** count as an outage or a degradation — it is "unknown", not "bad".
- **Do not:** replace these with synchronous external API calls on page render. Hitting
  Stripe/SignalWire/Resend per refresh invites rate limits and edge timeouts, and makes
  the health page fail when the thing it monitors is slow.
- **Depends on:** decide with T6 (same file, same render pass) · **Effort:** 2 hours.

### T8. Gate: no subsystem may claim `operational` without an awaited probe
- **File:** `test/service-health-telemetry.test.ts`
- **Do:** assert that any subsystem returning `operational` also returns a non-null
  `latencyMs` (the two that genuinely probe both do). Everything else must be
  `configured`, `degraded` or `outage`.
- **Prove it bites:** flip one subsystem back to `'operational'` with `latencyMs: null`,
  watch it fail, revert.
- **Depends on:** T7 · **Effort:** 30 min.

---

## Wave 2 — The observability cluster (decide these three together)

These three share one root cause: module-level state on serverless. Decide the shape
once, then execute.

### T9. DECISION: what is the Service health observability story?
- **Options:** (a) persist to Postgres tables, (b) adopt Sentry/Datadog — the code
  already branches on `SENTRY_DSN`/`DATADOG_API_KEY`, (c) delete the panels and rely on
  Vercel's own observability.
- **Constraint:** whatever is chosen, the cold-module assertions in
  `test/service-health-telemetry.test.ts` stay. They are what stops seed data returning.
- **Owner:** user · **Effort:** a conversation · **Blocks:** T10, T11, T12.

### T10. Resolve the APM request buffer
- **File:** [src/lib/apm-telemetry.ts:70](../src/lib/apm-telemetry.ts#L70)
- **Problem:** `requestBuffer` is a module-level array written by exactly one caller
  ([api/health/route.ts:151](../src/app/api/health/route.ts#L151)) in a different lambda
  from the one rendering `/admin/health`. Near-permanently empty. It displays honestly
  now ("—"), but can never show anything true.
- **Do:** per T9. If removing, delete the four stat tiles and the slowest-routes table.
- **Depends on:** T9 · **Effort:** half day to remove, 1–2 days to persist.

### T11. Resolve `captureException` — zero callers
- **File:** [src/lib/apm-telemetry.ts:132](../src/lib/apm-telemetry.ts#L132)
- **Problem:** re-verified at HEAD — nothing calls it, so the Exceptions panel can only
  ever be blank.
- **Do:** either wire it into [src/app/admin/error.tsx](../src/app/admin/error.tsx),
  [src/app/dashboard/error.tsx](../src/app/dashboard/error.tsx) and the API route catch
  blocks, or remove the panel. Do not ship a panel whose only possible state is empty.
- **If wiring:** scrub PII. Error objects on user-record write paths embed row values;
  log `error.message` and an account id, never the whole object.
- **Depends on:** T9 · **Effort:** 2 hours either way.

### T12. Resolve on-call paging — `dispatchOnCallPage` has zero callers
- **File:** [src/lib/on-call-paging.ts:115](../src/lib/on-call-paging.ts#L115)
- **Problem:** re-verified at HEAD. No cron failure, no incident, no uptime outage
  triggers it. The only thing that fires is the manual drill button. `recentPagingEvents`
  ([:38](../src/lib/on-call-paging.ts#L38)) is in-memory, so the history never persists.
- **Do (if keeping):**
  1. Wire one real trigger. Best value first: a cron crossing into FAILING; then a P1 row
     in `platform_incidents`; then an uptime subsystem returning `outage`.
  2. Add debounce/dedupe keyed on `incidentKey`, or the first outage pages on every
     5-minute tick.
  3. Persist paging events — they are an audit trail.
  4. Set `ONCALL_PRIMARY_EMAIL` / `ONCALL_PRIMARY_PHONE` in Vercel Production (see T26).
     The `.env.example` keys exist; the values do not, so a wired dispatcher would
     currently page nobody.
- **Do (if removing):** delete the subsystem, the panel and the drill button together.
- **Depends on:** T9 · **Effort:** 1 day to wire, 2 hours to remove.

---

## Wave 3 — Correctness before scale

### T13. Make the campaign blast genuinely idempotent
- **Files:** [src/app/admin/campaigns/actions.ts:145-165](../src/app/admin/campaigns/actions.ts#L145),
  [src/lib/admin-platform-campaigns.ts:105](../src/lib/admin-platform-campaigns.ts#L105)
- **Problem:** the guard reads `admin_actions` for a recent `platform_campaign_send` —
  correctly cross-lambda — but that row is written by `logAdminAction` **after** the send
  loop at :41-79 completes. For any non-trivial audience the loop runs for seconds, and a
  second click inside that window finds no row and sends again. That window is exactly
  when a double-click happens.
- **Do:** switch to **insert-first**. Either
  - a `platform_campaign_dispatches` table with `idempotency_key text primary key`,
    inserted *before* the loop, duplicate detected via unique violation (`23505`); or
  - a partial unique index on `admin_actions ((meta->>'idempotencyKey'))
    WHERE action = 'platform_campaign_send'` (`meta` is `jsonb`, confirmed), with the
    audit row written before the send and updated with counts after.
- **Also:** drop the `subject`-match fallback once the key is authoritative — today it
  blocks a legitimate resend of the same subject within 60s.
- **Migration rules:** RLS on, `REVOKE ALL ... FROM anon, authenticated`, assert the
  revoke in a test.
- **Verify:** a test firing two concurrent calls with the same key — exactly one succeeds.
- **Severity:** low today (11 accounts, fast send), rising with audience size. Do this
  before the first large campaign.
- **Effort:** half day.

---

## Wave 4 — Data hygiene, so real failures stay visible

### T14. Clear the 185 stuck test-mode billing events
- **Problem:** 185 `platform_subscription` events, **all `livemode=false`**, received
  2026-09-07 → 09-08, sit in `processing_status='failed'` with `attempt_count=1` and
  `next_attempt_at=null`. Cause is correct fail-closed behaviour:
  `assertMode(claim.livemode)` at
  [stripe-billing-subscription-events.ts:545](../src/lib/billing/stripe-billing-subscription-events.ts#L545)
  rejects test-mode events in a live-mode Production worker.
- **No real money is affected.** All 7 live-mode events processed. The single live-mode
  failure is the known 2026-08-29 `provider_object_contract_mismatch`, correctly
  non-retryable.
- **Do:** purge or explicitly dead-letter the 185 rows so the backlog reads as handled
  rather than as 185 broken payments.
- **Verify:** `select processing_status, count(*) from billing_events where
  event_scope='platform_subscription' and livemode=false group by 1`
- **Effort:** 1 hour.

### T15. Stop test-mode events being recorded as failures at all
- **Do:** have the projector **skip** `livemode=false` events in a live-mode Production
  worker rather than failing them. A rehearsal event is not a failure, and every future
  test-mode session will otherwise re-create this pile.
- **Careful:** the `assertMode` guard is correct and must stay — this is about the
  *disposition* of the rejected event (skip/ignore, not fail), not about relaxing the
  check.
- **Depends on:** T14 · **Effort:** half day.

### T16. Give logically-failed crons a reason
- **Problem:** `direct-payment-settlement` and `voice-allowance` each failed twice today,
  and the recorded `error` is only
  `"direct-payment-settlement reported logical failures (1 failure(s)) (worker_errors=1)"`
  — a restatement of the count with no reason. Diagnosis is impossible from the table.
- **Do:** propagate the first underlying failure reason into `cron_runs.error` for
  logical (non-throwing) failures.
- **Then:** diagnose those four runs and classify them — transient or structural. If
  structural, each becomes its own task.
- **Effort:** half day for the plumbing, 1 hour for the diagnosis.

---

## Wave 5 — Decisions that keep rotting

Each is safe today; the code refuses honestly. None is an incident. All four are unowned
forks.

### T17. DECISION: smart dunning — build or delete?
- **State:** `dunning_events` does not exist. `optimize_dunning_retries` returns an honest
  `available: false`. The route exists but is **not scheduled and not registered**.
- **Owner:** user · **Blocks:** T18 or T19.

### T18. (If build) Make smart dunning real
- Migration for `dunning_events` **and** `payments.decline_code` — that column does not
  exist, so `declineCode` currently resolves to `generic_decline` for every payment and
  the strategy branch is never exercised.
- Check `error` on every write before incrementing any counter.
- Wire a real email/SMS dispatcher. A ledger row is not a message.
- Register in `src/lib/cron-jobs.ts` and schedule in `vercel.json`.
- **Depends on:** T17 · **Effort:** 2 days.

### T19. (If delete) Remove smart dunning
- Delete `src/lib/ai-operator/smart-dunning.ts`, `src/app/api/cron/smart-dunning/`, and
  the `optimize_dunning_retries` tool branch and declaration.
- **Depends on:** T17 · **Effort:** 2 hours.

### T20. DECISION: activation nudges — build or delete?
- **State:** `contractor_onboarding_nudges` does not exist. The writer fails loudly, which
  is correct. But **no sender reads that table**, so even with it the "Nudge unactivated
  signups" chip delivers nothing.
- **Owner:** user · **Blocks:** T21 or T22.

### T21. (If build) Wire a nudge dispatcher
- Table **plus** a real sender, and only then count it in `safeActionsExecuted`.
- **Depends on:** T20 · **Effort:** 1 day.

### T22. (If delete) Remove the nudge chip and tool
- **Depends on:** T20 · **Effort:** 1 hour.

### T23. Rename `safeActionsExecuted`
- Regardless of T20's outcome. It is the number the briefing email leads with and it reads
  as "messages sent" when it counts ledger writes.
- **Effort:** 30 min.

### T24. Resolve the four unscheduled cron routes
- `activation-autopilot`, `db-guard`, `smart-dunning`, `webhook-heal` are absent from
  **both** `vercel.json` and `src/lib/cron-jobs.ts`, so they are unreachable even from the
  "Run now" list.
- **Do:** schedule each or delete it. The fifth state — exists, unreachable, untested,
  still importable by the operator tool switch — is how the smart-dunning defect stayed
  invisible for weeks.
- Do not schedule `smart-dunning` before T17. Find out what invokes `db-guard`, which has
  recorded runs but is undeclared.
- **Add a gate:** every route under `src/app/api/cron/` is either declared in `vercel.json`
  **and** registered in `cron-jobs.ts`, or explicitly listed in an `UNSCHEDULED` allowlist
  with a reason.
- **Effort:** half day including the gate.

### T25. DECISION + wiring: what does "resolve" mean on a privacy request?
- **State:** resolution notes are now required and appended to `details` — a genuine
  improvement that closed the "silently zero the clock" hole. Still missing: resolution is
  not wired to `executeAccountClosureSaga`, and there is no self-serve intake.
  `privacy_requests` is empty, so nothing is overdue.
- **Do:**
  1. Decide what "resolved" is permitted to mean given the account page's own warning that
     hard deletion is blocked by 24 RESTRICT tables.
  2. Either wire deletion-kind resolution to the closure saga, or rename the button to
     "Mark responded" so the record matches what happened.
  3. Publish an intake route on `/privacy` that a human actually reads.
- **Owner:** user (legal posture), then code · **Effort:** 1 day.

---

## Wave 6 — Operator relay (blocks nothing else; do whenever available)

Unreadable from the repo — Vercel Sensitive vars are write-only.

### T26. Confirm four Production environment values
- [ ] `LGQ_SIGNALWIRE_VOICE_PROVISIONING_ENABLED`
- [ ] `LGQ_SIGNALWIRE_VOICE_RECOVERY_ENABLED`
- [ ] `GEMINI_API_KEY` — decides whether the AI Operator uses the LLM path or the keyword
      fallback. Two materially different products.
- [ ] `ONCALL_PRIMARY_EMAIL` / `ONCALL_PRIMARY_PHONE` (needed by T12)
- **For each:** confirm the value exists **and** that the current deployment was built
  *after* it was set. Vercel bakes env at build; a flag added later is inert.

### T27. Confirm the Gemini project is on the paid tier
- `/privacy` publicly claims AI providers do not train on customer business data. That
  holds only on the paid tier, and full homeowner records go to Gemini. Open since
  2026-08-30 and never answered.
- **Where:** Google AI Studio / Cloud Console billing for the project owning
  `GEMINI_API_KEY`. PASS = billing enabled.
- **Do:** record the answer *beside* the claim at
  [privacy/page.tsx:115](../src/app/privacy/page.tsx#L115).

---

## Recommended execution order

| Order | Tasks | Why here |
|---|---|---|
| 1 | T1 → T4 | Nothing else can be tested until MFA works. All console, ~40 min. |
| 2 | T5 | 15 minutes, zero risk. |
| 3 | T6, T7, T8 | One pass over one file and its page. Removes the last false claims on Service health. |
| 4 | T14, T16 | Clears the money-cron noise so a real failure is visible. T15 follows. |
| 5 | T9 → T12 | Decide once, execute three. |
| 6 | T24, T23 | Cheap, and T24's gate prevents recurrence. |
| 7 | T17/T20/T25 decisions, then their branches | Unowned forks; resolve before they rot further. |
| 8 | T13 | Before the first large campaign, not before then. |
| 9 | T26, T27 | Whenever the operator is available. |

## Definition of done for the whole list

- [ ] `auth.mfa_factors` has two verified rows and one MFA-gated action has been completed.
- [ ] No panel on `/admin/health` displays a number that was not measured.
- [ ] No exported function that renders to an operator has zero callers.
- [ ] Every `src/app/api/cron/` route is scheduled, registered, or allowlisted with a reason.
- [ ] `npm test`, `npm run typecheck`, `npm run lint` and `npm run build` all exit 0.
- [ ] Every gate added by this list has been proven to fail when its defect is reintroduced.
