# Command Center — what is still outstanding

**Date:** 2026-09-09 · **Verified against:** `d9a88e61f` and the live production database
**Supersedes the open items in:** [admin-command-center-fix-plan-2026-09-08.md](./admin-command-center-fix-plan-2026-09-08.md)

Everything below was re-checked today. Items the 09-08 plan listed that are now
genuinely closed are recorded at the bottom so nobody re-audits them.

---

## A. Blocking

### A1. Enrol MFA — still the only thing stopping the console being usable
`select * from auth.mfa_factors` returns **zero rows**, unchanged since 09-08.
`requireMfa` redirects to `/admin/security?step_up=1` unless the session is
`aal2`, so ~42 actions across 10 pages still cannot complete: account
suspend/close/delete/credit/payout, Review queue, Quick Stop refunds, Billing
operations requeue, Failures, Incidents, Messaging (11), AI Voice numbers (9),
Staff (2), and now the money-cron "Run now" button.

Every line of code behind this is finished and verified. The remaining work is
entirely in consoles.

- [ ] Supabase Dashboard → Authentication → Multi-Factor Authentication: confirm
      **WebAuthn** and **TOTP** are enabled. [MfaPanel.tsx:94](../src/app/admin/security/MfaPanel.tsx#L94)
      renders a specific error when they are not, which is a strong hint this has
      never been switched on.
- [ ] Enrol on **both** `hdartguy@gmail.com` and `brett.arnold@live.com`. Two
      accounts, because one lost device otherwise locks every refund and every
      account closure out of the platform permanently.
- [ ] Record the recovery path somewhere that is not the platform itself.
- **Verify:** two `verified` rows in `auth.mfa_factors`, then complete one real
  MFA-gated action end to end. Use "resolve a `webhook_failures` group" — 92 rows
  exist, it is reversible, and it exercises `requireMfaPermission` +
  `logAdminAction`.
- **Owner:** user. **Effort:** 30 min. **Everything else in this document is
  smaller than this one item.**

---

## B. Service health — the half of the honesty work that was not finished

The 09-08 pass fixed the fabricated *numbers*. What survives is fabricated
*status* and three subsystems that cannot work on serverless.

### B1. Six subsystems still show a green `operational` pill from an env check
`SubsystemStatus` is still `'operational' | 'degraded' | 'outage'`
([uptime-monitoring.ts:9](../src/lib/uptime-monitoring.ts#L9)), so there is no
honest value to return. `quoting-engine`, `stripe-payments`, `sms-gateway`,
`voice-webhook`, `email-resend` and `contractor-cdn` all report `operational`
because an environment variable is a non-empty string. Only `database` and
`cron-cadence` probe anything. The latency claim was withdrawn (`latencyMs: null`);
the status claim was not.

- [ ] Add `'configured'` to `SubsystemStatus` and return it for all six. Render it
      in a neutral colour, not green — a green pill next to "Stripe Payments &
      Connect Rails" is the specific thing an operator misreads at 3am.
- [ ] **Do not** replace these with synchronous external calls on every page
      render. Hitting Stripe/SignalWire/Resend per refresh invites rate limits and
      edge timeouts, and makes the health page fail when the thing it monitors is
      slow. If real probes are wanted later, run them from a cron and read the
      cached result here.
- [ ] `contractor-cdn` is the one worth a real (cached) probe eventually: custom
      domains report "Verified and connected" while the TLS handshake fails, and a
      HEAD against a live tenant domain would have caught that.
- [ ] Extend `test/service-health-telemetry.test.ts` to assert no subsystem returns
      `operational` without an awaited probe in the same code path.
- **Effort:** 2 hours for the honest label; 1 day if the cached-probe cron is built.

### B2. On-call paging still pages nobody
`dispatchOnCallPage` ([on-call-paging.ts:115](../src/lib/on-call-paging.ts#L115))
has **zero callers** — re-verified today with `git grep` at HEAD. No cron failure,
no incident, no uptime outage triggers it. The only thing that fires is the manual
"Send test page" drill.

- [ ] Wire it to at least one real trigger, or delete the subsystem. Candidates in
      order of value: a cron crossing into FAILING, a P1 row landing in
      `platform_incidents`, an uptime subsystem returning `outage`.
- [ ] If wiring: add debounce/dedupe keyed on `incidentKey`, or the first outage
      pages on every 5-minute cron tick.
- [ ] Set `ONCALL_PRIMARY_EMAIL` / `ONCALL_PRIMARY_PHONE` in Vercel Production and
      confirm the mailbox receives. The `.env.example` entries exist; the values do
      not. Until then the roster correctly renders "Not configured", which is
      honest but means a wired dispatcher would page nobody.
- **Effort:** 1 day.

### B3. Three module-level buffers that cannot work on serverless
`requestBuffer`, `exceptionBuffer` ([apm-telemetry.ts:70-71](../src/lib/apm-telemetry.ts#L70))
and `recentPagingEvents` ([on-call-paging.ts:38](../src/lib/on-call-paging.ts#L38))
are module-level arrays. On Vercel the lambda rendering `/admin/health` is not the
lambda that served the request being measured, so these are near-permanently empty.
They now *display* honestly ("—", "No paging dispatches or drills on record"),
which is why this is no longer a P1 — but the panels can never show anything true.

- [ ] Decide per buffer: **persist** (a table), **adopt** (Sentry/Datadog — the code
      already branches on `SENTRY_DSN`/`DATADOG_API_KEY`), or **remove the panel**.
- [ ] Paging events are an audit trail and should persist regardless if B2 is wired.
- [ ] Whichever is chosen, keep the cold-module assertions in
      `test/service-health-telemetry.test.ts` — they are what stops seed data
      returning.
- **Effort:** half day to remove; 1–2 days to persist.

### B4. `captureException` has zero callers
Re-verified at HEAD. The Exceptions panel can only ever be blank.

- [ ] Wire it into the admin `error.tsx` boundary and the API route catch blocks, or
      remove the panel. Do not ship a panel whose only possible state is empty.
- **Effort:** 2 hours either way.

---

## C. Correctness defects

### C1. Campaign idempotency — cross-lambda now, but the race window is the send
[campaigns/actions.ts:145-165](../src/app/admin/campaigns/actions.ts#L145) reads
`admin_actions` for a `platform_campaign_send` in the last 60s. That correctly
fixed the in-memory `Map` problem. But the marker row is written by
`logAdminAction` at [admin-platform-campaigns.ts:105](../src/lib/admin-platform-campaigns.ts#L105)
— **after** the send loop at :41-79 finishes. For any non-trivial audience the loop
runs for seconds, and a second click during that window finds no row and sends
again. That window is exactly when a double-click happens.

- [ ] Move to **insert-first**: write the idempotency claim *before* the loop and let
      a unique constraint reject the duplicate. Either a small
      `platform_campaign_dispatches` table keyed on `idempotency_key`, or a
      partial unique index on `admin_actions (meta->>'idempotencyKey')` where
      `action = 'platform_campaign_send'`.
- [ ] If a new table: it must ship with RLS enabled and `REVOKE ALL ... FROM anon,
      authenticated` in the same migration — the default ACL grants anon
      INSERT/UPDATE/DELETE on every new table, and the revoke is the security.
      Assert the revoke in a test.
- [ ] Drop the `subject`-match fallback once the key is authoritative; today it will
      block a legitimate resend of the same subject within 60s.
- [ ] Test: two concurrent calls with the same key — one succeeds, one is refused.
- **Severity:** low today (11 accounts, the send is fast), rising with audience size.
- **Effort:** half day.

### C2. `runCronJobNowAction` answers before authenticating
[health/actions.ts:31-34](../src/app/admin/health/actions.ts#L31) calls
`cronJob(jobSlug)` and returns `Unknown cron job: 'x'` **before**
`requireMfaPermission`/`requireAdmin`. The P0-2 rule still holds (the guard is
outside the `try`), but an unauthenticated caller now gets a different response for
a valid slug than an invalid one.

- [ ] Move the `cronJob()` lookup below the auth calls. The `isMoney` branch needs
      `spec`, so hoist auth by calling `requireAdmin()` first, then look up the spec,
      then step up to `requireMfaPermission` for money jobs — or simply call
      `requireAdmin()` unconditionally before the lookup and keep the MFA step-up
      where it is.
- **Effort:** 15 minutes.

---

## D. Decisions that are still not made

Each of these is safe today — the code refuses honestly. None is an incident. But
each is an unowned fork that will rot.

### D1. Smart dunning: build or delete
`dunning_events` still does not exist (confirmed today). `optimize_dunning_retries`
returns an honest `available: false`. The route exists but is **not scheduled and not
registered**, so nothing runs it.

- [ ] **Build:** migration for `dunning_events` + `payments.decline_code`; check
      `error` on every write; wire a real email/SMS dispatcher; register + schedule
      the cron. ~2 days.
- [ ] **Delete:** remove `smart-dunning.ts`, its route, and the tool branch. ~2 hours.
- [ ] Note the current `decline_code` read resolves to `generic_decline` for every
      payment because that column does not exist — so the strategy branch is never
      exercised. Fix that in the build path or it will silently do the wrong thing.

### D2. Activation nudges: build or delete
`contractor_onboarding_nudges` still does not exist. The writer now fails loudly,
which is correct. But even with the table, **no sender reads it** — the operator's
"Nudge unactivated signups" chip would still deliver nothing.

- [ ] **Build:** table + a real dispatcher, and only then count it in
      `safeActionsExecuted`. ~1 day.
- [ ] **Delete:** remove the chip and the tool. ~1 hour.
- [ ] Either way, rename `safeActionsExecuted` — it is the number the briefing email
      leads with and it currently reads as "messages sent".

### D3. Four cron routes exist with no schedule and no registry entry
`activation-autopilot`, `db-guard`, `smart-dunning`, `webhook-heal` — absent from
**both** `vercel.json` and `src/lib/cron-jobs.ts`, so they are unreachable even from
the "Run now" list.

- [ ] Schedule each or delete it. The fifth state — exists, unreachable, untested,
      still importable by the operator tool switch — is how the smart-dunning defect
      stayed invisible for weeks.
- [ ] Do not schedule `smart-dunning` before D1.
- [ ] `db-guard` has recorded runs but is undeclared — find out what invokes it.

### D4. Privacy requests still cannot fulfil anything
Resolution notes are now **required** and appended to `details`, which is a genuine
improvement and closes the "silently zero the clock" hole. What is still missing:
resolution is not wired to `executeAccountClosureSaga`, and there is no self-serve
intake. `privacy_requests` is empty, so nothing is overdue today.

- [ ] Wire deletion-kind resolution to the closure saga, **or** rename the button to
      "Mark responded" so the record matches what happened.
- [ ] Publish an intake route on `/privacy` that a human actually reads.
- [ ] Reconcile with the account page's own warning that hard deletion is blocked by
      24 RESTRICT tables — decide what "resolved" is permitted to mean.
- **Owner:** user (legal posture), then code. **Effort:** 1 day.

---

## E. Data hygiene

### E1. 185 test-mode billing events stuck in `failed`
`event_scope='platform_subscription'`, **all `livemode=false`**, received
2026-09-07 → 09-08, `attempt_count=1`, `next_attempt_at=null`. Cause is correct
fail-closed behaviour: `assertMode(claim.livemode)` at
[stripe-billing-subscription-events.ts:545](../src/lib/billing/stripe-billing-subscription-events.ts#L545)
rejects test-mode events in a live-mode Production worker.

**No real money is affected.** All 7 live-mode subscription events processed
successfully. The single live-mode failure is the known 2026-08-29
`provider_object_contract_mismatch`, correctly non-retryable.

- [ ] Purge or explicitly dead-letter the 185 rows so the backlog reads as handled
      rather than as 185 broken payments.
- [ ] Consider having the projector **skip** `livemode=false` events in Production
      rather than failing them — a rehearsal event is not a failure, and every future
      test-mode session will re-create this pile.
- **Severity:** cosmetic/hygiene. **Effort:** 1 hour.

### E2. Two unexplained cron failures from today
`direct-payment-settlement` (2 failures, last 2026-09-09T10:30, `worker_errors: 1`)
and `voice-allowance` (2 failures, last 10:00, `failed: 1` of 2 considered). Small
counts, both money-marked, neither traced.

- [ ] Pull the `error` column for those runs and classify. If transient, note it; if
      structural, it becomes its own item.
- **Effort:** 1 hour.

---

## F. Needs an external console (operator relay)

Unreadable from the repo — Vercel Sensitive vars are write-only.

- [ ] `LGQ_SIGNALWIRE_VOICE_PROVISIONING_ENABLED` and
      `LGQ_SIGNALWIRE_VOICE_RECOVERY_ENABLED` — confirm the values in Production
      **and** that the current deployment was built *after* they were set. Vercel
      bakes env at build; a flag added later is inert.
- [ ] `GEMINI_API_KEY` — present in Production? It decides whether the AI Operator
      uses the LLM path or the keyword fallback. Two materially different products.
- [ ] Is the Gemini project on the **paid** tier? `/privacy` publicly claims AI
      providers do not train on customer data; that holds only on the paid tier, and
      full homeowner records go to Gemini. This has been an open question since
      08-30.
- [ ] `ONCALL_PRIMARY_EMAIL` / `ONCALL_PRIMARY_PHONE` (see B2).

---

## Suggested order

1. **A1** — nothing else can be tested until MFA works. 30 minutes, all console.
2. **C2** — 15 minutes, zero risk.
3. **B1** — 2 hours, and it removes the last false claim on the health page.
4. **E1 + E2** — 2 hours, clears the money-cron noise so a real failure is visible.
5. **B4, B2, B3** — the paging/APM cluster, decided together since B2 depends on B3.
6. **C1** — before the first campaign to a large audience, not before then.
7. **D1–D4** — decisions first, then whichever branch you pick.
8. **F** — relay whenever the operator is next available; F blocks nothing else.

---

## Closed since 09-08 (do not re-audit)

- **P0-2** auth guards hoisted out of `try` — verified, and the gate bites.
- **P1-1** fabricated APM baseline deleted; `active: total > 0`.
- **P1-2** fabricated probe latencies replaced with `null`; cron latency now measured.
- **P1-3** fabricated "resolved by ops-lead" paging event and the `555` roster number
  removed.
- **P1-4** synthetic 7-day trend series replaced with `available: false`.
- **P1-5** `dp_sample_123` / `acc-test-123` replaced with UUID extraction and prompts.
- **P2-1** smart dunning no longer increments counters over failed writes.
- **P2-3** `account_staff` → `memberships`; the other four phantom reads removed.
- **P3-1** the white-label SMS and automatic-SSL claims removed; quote counts now
  filter `quoted_amount > 0`.
- **P4-1** `/admin/operator` and its nav item both gated on `ops.manage`.
- **P4-2** campaign blast promoted to `requireMfaPermission`; money crons require MFA
  **and** a typed confirmation, now derived from `spec.importance === 'money'`
  (all 22 money crons, not a hardcoded 3) and wired through `RunCronButton`.
- **P4-3** `resolve_hitl_action` removed from the model-callable switch.
- **P5-2** `operator-briefing` is deployed and running — 2 clean runs,
  `ai_operator_logs` 14 rows, `ai_operator_action_requests` 2.
- **Six new gates** — schema contract, auth-guard placement, nav permissions,
  telemetry truthfulness, no sample IDs, copilot claims. **Each was proven to bite**
  by reintroducing the original defect.
- **Suite state at `d9a88e61f`:** 1104 test files pass, typecheck 0, lint 0,
  `next build` 0 with 420/420 pages.

## Correction to the 09-09 verbal report

I described `billing-subscription-projection` as "now failing on every run, 3 → 19
and climbing". That was wrong. The 22 failures were a **single burst on 2026-09-08**
as the test-mode events arrived; each event failed once terminally
(`attempt_count = 1`, `next_attempt_at = null`) and the job has claimed 0 and
returned `ok = true` on every run since 2026-09-08T18:55. The FAILING label in
`inspect:cron-health` is a rolling-24h artifact that clears on its own. The count
I read was cumulative-in-window, not a rate.
