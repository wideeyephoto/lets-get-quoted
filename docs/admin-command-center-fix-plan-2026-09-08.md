# Command Center — live-readiness fix plan

**Date:** 2026-09-08 · **Scope:** every item in the `/admin` nav (22 surfaces)
**Source:** audit of 2026-09-08. Every claim below was verified against committed
`HEAD`, not the working tree, and against the live production database.

**Tree caveat.** At the time of the audit `src/lib/ai-operator/*`,
`src/app/admin/operator/*`, `src/lib/cron-jobs.ts` and `vercel.json` were all
**dirty** from a concurrent agent. Every operator finding here was re-checked with
`git show HEAD:<file>` and is present in deployed code. Before starting any P1/P2
item, re-read the file — the other agent may have already moved it.

**Verified-clean surfaces (no work required):** Money, Payment ledger, Accounts,
Closures & Trash, Cases, Audit log, Search, Admin manual, Command Center home.
These consistently distinguish "unavailable" from zero, which is exactly the
property the health and operator surfaces lack.

---

## P0 — the console cannot be operated at all today

### P0-1. Enrol MFA for both staff accounts

`auth.mfa_factors` is **empty in production**. `requireMfa`
([src/lib/auth.ts](../src/lib/auth.ts)) redirects to `/admin/security?step_up=1`
unless the session is `aal2`, so **~42 actions across 10 pages currently cannot
complete**: Accounts (suspend/close/delete/credit/payout), Review queue,
Quick Stop refunds, Billing operations, Failures, Incidents, Messaging (2),
Messaging registrations (9), AI Voice numbers (9), Staff (2).

- [ ] Confirm WebAuthn **and** TOTP are enabled in Supabase Dashboard →
      Authentication → Multi-Factor Authentication.
      [MfaPanel.tsx:94](../src/app/admin/security/MfaPanel.tsx#L94) already renders
      a specific error for this being off, which is a strong hint it has never been
      turned on.
- [ ] Enrol a factor on `hdartguy@gmail.com` **and** `brett.arnold@live.com` via
      `/admin/security`. Two accounts, because one lost device otherwise locks every
      refund and every account closure out of the platform permanently.
- [ ] Record the recovery path somewhere that is not the platform itself.
- **Verify:** `select factor_type, status from auth.mfa_factors` returns two
  `verified` rows; then complete one real MFA-gated action end to end. Suggested:
  resolve a `webhook_failures` group — there are 92 rows, it is reversible, and it
  exercises `requireMfaPermission` plus `logAdminAction`.
- **Owner:** user (Supabase console + browser). **Effort:** 30 min.

### P0-2. Stop swallowing the MFA step-up redirect

[billing-operations/actions.ts:27](../src/app/admin/billing-operations/actions.ts#L27)
calls `requireMfaPermission` **inside `try`**. Next's `redirect()` throws a
`NEXT_REDIRECT` control-flow error, so the catch turns the step-up into the string
`Requeue failed: NEXT_REDIRECT`. `grep -rn "isRedirectError\|unstable_rethrow" src/`
returns **nothing** repo-wide, so the same bug eats the *login* redirect in
[campaigns:20,55,101,142](../src/app/admin/campaigns/actions.ts#L20),
[health:10,31](../src/app/admin/health/actions.ts#L10) and
[manual:19,52,76](../src/app/admin/manual/actions.ts#L19).

- [ ] Move every `require*` call **above** its `try` block. This is the fix, not a
      rethrow helper — the guard is not something the action should be recovering
      from.
- [ ] Where a guard genuinely must sit inside a `try` (none found today), import
      `unstable_rethrow` from `next/navigation` and call it first in the catch.
- [ ] Add a test asserting no `require(Admin|Permission|MfaPermission|Permissions)`
      call appears inside a `try` block in any `src/app/admin/**/actions.ts` — a
      grep test in the style of `test/p0-compliance-remediations.test.ts`.
- **Verify:** with MFA unenrolled, the Billing operations requeue button must land
  on `/admin/security?step_up=1`, not print an error. Test this **before** P0-1, or
  the condition disappears.
- **Owner:** me. **Effort:** 1 hour.

---

## P1 — panels that present invented numbers as production truth

All three live on **Service health**, the page an operator opens *specifically* to
decide whether the platform is healthy. That is the worst possible place for
fabricated data, and it is why this cluster outranks the silent no-ops.

### P1-1. Delete the fabricated APM baseline

[apm-telemetry.ts](../src/lib/apm-telemetry.ts) `ensureBaselineMetrics()` invents
**120 request samples with `Math.random()`** across real route names
(`/api/stripe/webhook`, `/api/voice/ai`, `/api/leads`) whenever `requestBuffer` is
empty. The buffer is module-level in-memory, written by exactly one caller
([api/health/route.ts:151](../src/app/api/health/route.ts#L151)) in a *different*
lambda from the one rendering `/admin`. On Vercel that branch is effectively always
taken, so the p95/p99/RPM/error-rate tiles and the "slowest routes" table at
[health/page.tsx:246-300](../src/app/admin/health/page.tsx#L246-L300) are pure
fiction — and the panel self-labels "High-Res APM · 120 requests buffered".

- [ ] Delete `ensureBaselineMetrics()` and its call site outright. Do not "improve"
      the seed data.
- [ ] Make `getApmSummary()` return `active: false` when `totalRequestsTracked === 0`,
      and have the page render the honest empty state the rest of the console
      already uses (see the em-dash convention at
      [money/page.tsx:110](../src/app/admin/money/page.tsx#L110)).
- [ ] Fix the panel's own description at
      [health/page.tsx:670](../src/app/admin/health/page.tsx#L670), which claims
      coverage "across API routes and server actions". One route is instrumented.
- [ ] `captureException` has **zero callers** — the Exceptions panel can only ever
      be empty. Either wire it into the error boundaries and API catch blocks, or
      remove the panel. Do not leave a panel whose only possible state is blank.
- [ ] Decide the real fix and record it: an in-memory buffer cannot work on
      serverless. Either persist metrics to a table, adopt Sentry/Datadog (the code
      already branches on `SENTRY_DSN`/`DATADOG_API_KEY`), or drop the APM panel and
      rely on Vercel's own observability. **Shipping a lie is not one of the three
      options.**
- [ ] Test: assert `getApmSummary()` on a cold module returns
      `totalRequestsTracked === 0`. This is the guard that stops the seed data
      coming back.
- **Owner:** me (removal + honest empty state), user (which of the three real
  fixes). **Effort:** half day for the removal; the replacement is a separate call.

### P1-2. Make the uptime probe probe things

[uptime-monitoring.ts](../src/lib/uptime-monitoring.ts) reports 8 subsystems. Only
`database` and `cron-cadence` do real work. `stripe-payments`, `sms-gateway`,
`voice-webhook`, `email-resend` and `contractor-cdn` are `Boolean(process.env.X)`
checks paired with **hardcoded latencies** (8/12/16/14/10 ms) rendered as measured
probe times. "Stripe Payments & Connect Rails — operational, 8ms" means a string
was non-empty.

- [ ] For each of the 5 fake subsystems, choose one: **(a)** a real cheap probe
      (`stripe.balance.retrieve()`, a SignalWire `GET /api/relay/rest`, a Resend
      domains list, an HTTP HEAD on a tenant subdomain), or **(b)** relabel the tile
      honestly as `configured` / `not configured` with **no latency number at all**.
- [ ] Never emit a `latencyMs` that was not measured. Make it `number | null` in the
      type so the honest case is representable and the compiler forces the decision
      at every call site.
- [ ] The `contractor-cdn` tile is worth a real probe regardless: custom domains
      currently say "Verified and connected" while the TLS handshake fails. A HEAD
      against a live tenant domain would have caught it.
- [ ] Test: assert no subsystem returns a non-null `latencyMs` without an
      accompanying awaited probe.
- **Owner:** me. **Effort:** 1 day.

### P1-3. On-call paging pages nobody

- `dispatchOnCallPage` ([on-call-paging.ts:115](../src/lib/on-call-paging.ts#L115))
  has **zero callers**. No cron failure, no incident, no uptime outage triggers it.
  The only thing that ever fires is the manual "Send test page" button.
- `getRecentPagingEvents` ([:233](../src/lib/on-call-paging.ts#L233)) returns a
  **fabricated resolved incident** "acknowledged by ops-lead" when its list is empty
  — and the list is module-level in-memory, so it is always empty.
- The roster falls back to `+1 (555) 019-2831`
  ([:50](../src/lib/on-call-paging.ts#L50)) — a fake 555 number displayed as the
  on-call contact — and to `ops@letsgetquoted.com`, a mailbox nobody has confirmed
  exists.

- [ ] Delete the fabricated baseline event. Empty renders as empty.
- [ ] Remove the `555` and `ops@` fallbacks; render "not configured" instead. A
      plausible-looking wrong number is worse than a blank, because it is the thing
      someone reads at 3am.
- [ ] Wire `dispatchOnCallPage` to at least one real trigger, or remove the whole
      subsystem. Candidates, in order of value: a cron marked FAILING, a P1 row
      landing in `platform_incidents`, an uptime probe returning `outage`.
- [ ] Persist paging events (they are an audit trail — in-memory is wrong for the
      same reason as P1-1) or drop the "recent pages" table.
- [ ] Set `ONCALL_PRIMARY_EMAIL` / `ONCALL_PRIMARY_PHONE` in Vercel Production, and
      confirm whichever mailbox is chosen actually receives.
- **Owner:** me (code), operator/Codex (Vercel env). **Effort:** 1 day.

### P1-4. Delete the synthetic operator trend history

[tools.ts:900-920](../src/lib/ai-operator/tools.ts#L900-L920)
`get_ops_trend_history` returns a **fully invented series** —
`mrrEstimated: 168 + i*15`, `totalActiveContractors: 11`,
`smsDeliverabilityPct: 100`, `unresolvedWebhooksCount: i === 0 ? 2 : 0` — rendered
to the founder under "**7-Day Operational Trends**". It is reachable from the no-key
keyword fallback on any query containing "trend", "history" or "growth".

- [ ] Either build a real snapshot table written daily by `operator-briefing`, or
      have the tool return the honest `{ error: 'No historical snapshots exist yet.' }`
      shape the dispute-evidence tool already uses at
      [tools.ts:895](../src/lib/ai-operator/tools.ts#L895). That refusal is the
      pattern to copy; it is well written.
- [ ] Remove the `trend|history|growth` branch from the no-key fallback until the
      tool has real data behind it.
- **Owner:** me. **Effort:** half day for the honest refusal; 1 day with the
  snapshot table.

### P1-5. Stop running real tools against fabricated IDs

[engine.ts:127](../src/lib/ai-operator/engine.ts#L127) calls
`generate_dispute_evidence_packet` with `disputeId: 'dp_sample_123'` and
[:172](../src/lib/ai-operator/engine.ts#L172) calls
`diagnose_contractor_onboarding` with `accountId: 'acc-test-123'`, then renders the
result under "**Onboarding Diagnostics**" as though it described the business.

- [ ] Replace both with an explicit prompt for the missing identifier.
- [ ] Audit the remaining seven no-key branches for the same shape.
- [ ] Test: assert no string matching `/(dp|acc|cus|sub)[-_](sample|test)/` appears
      in `src/lib/ai-operator/`.
- **Owner:** me. **Effort:** 2 hours.

---

## P2 — actions that report success without doing anything

### P2-1. Smart dunning is a triple no-op that increments its own counters

[smart-dunning.ts:88](../src/lib/ai-operator/smart-dunning.ts#L88):

| What the code does | Reality | Consequence |
|---|---|---|
| `insert into dunning_events` | **table does not exist**; no migration ever created it | `error` unchecked, so `cardUpdateLinksDispatched++` regardless |
| `update payments set dunning_strategy` | **column does not exist** | PostgREST rejects the whole statement, so `next_retry_at` is **also** never written; `retriesOptimized++` regardless |
| reads `payments.decline_code` | **column does not exist** | every decline classifies as `generic_decline`, so the strategy branch is never exercised |

The comment says "Dispatch payment update reminder link" — it only ever wrote a
row. **No sender reads that table**, so even a successful write is not a message.

- [ ] Decide whether smart dunning is a product or not. It is currently
      **unscheduled** (no `smart-dunning` in `vercel.json`), so nothing is broken in
      production right now — this is a build decision, not an incident.
- [ ] If yes: migration for `dunning_events` plus `payments.dunning_strategy` and
      `payments.decline_code`; check `error` on **every** write and only then
      increment; wire an actual email/SMS sender; register the cron.
- [ ] If no: delete `smart-dunning.ts` and its route. Do not leave it callable from
      the operator's `optimize_dunning_retries` tool, which is the one path that
      *can* reach it today.
- [ ] Either way: grep the whole `ai-operator/` tree for `insert(`/`update(` whose
      `error` is never read. Same defect class as the activation nudge, which was
      already fixed once — one fix, one file, and the pattern survived next door.
- **Owner:** user (product decision), me (either branch). **Effort:** 2 hours to
  delete; 2 days to build properly.

### P2-2. Activation nudges send nothing

[activation-nudge.ts:53](../src/lib/ai-operator/activation-nudge.ts#L53) now fails
loudly on the missing `contractor_onboarding_nudges` table — that part is fixed and
the comment above it is accurate and good. What is **not** fixed: its own comment
records that *"No SMS or email sender reads this table, so a successful write still
is not a message delivered to a contractor."* The operator's "🚀 Nudge 4 Unactivated
Signups" chip therefore promises an action that does not exist, and
`safeActionsExecuted` in the cycle report counts it.

- [ ] Create the table **and** wire a real sender, or remove the quick-prompt chip
      and the tool. A ledger with no dispatcher is not a feature.
- [ ] Until then, rename `safeActionsExecuted` to something that does not read as
      "messages sent" — it is the number the briefing email leads with.
- **Owner:** user (decision), me (build). **Effort:** 1 day if built.

### P2-3. Five reads point at tables that do not exist

None of these five ever had a migration; they were never real.

| Read | Site | Real source | Symptom today |
|---|---|---|---|
| `account_staff` | [tools.ts:441](../src/lib/ai-operator/tools.ts#L441) | **`memberships`** (`account_id`, `user_id`, `role`, `deactivated_at`) | Contractor 360 shows `staffCount: 0` for every workspace |
| `stripe_connected_accounts` | [support-copilot.ts:22](../src/lib/ai-operator/support-copilot.ts#L22) | `accounts.connect_onboarded` / `stripe_connect_id` | masked by the `connect_onboarded` fallback — works by luck |
| `contractor_onboarding_nudges` | activation-nudge | n/a | see P2-2 |
| `dunning_events` | smart-dunning | n/a | see P2-1 |
| `messaging_sender_numbers` | [admin-accounts.ts:230](../src/lib/admin-accounts.ts#L230) | `sms_sender_numbers` | correctly guarded; other sources cover it — **no fix needed** |

- [ ] Point `account_staff` → `memberships`, filtering `deactivated_at is null`.
      `staffCount` is read by the founder to size an account; silently 0 is worse
      than absent.
- [ ] Drop the dead `stripe_connected_accounts` read; the fallback is the real check.
- [ ] Add a schema-contract test asserting every `.from('...')` literal in `src/lib`
      and `src/app` resolves to a table in `schema.sql`. This class of defect has
      appeared five times in one directory and no gate catches it. **Highest-leverage
      single item in this document.**
- **Owner:** me. **Effort:** half day for the fixes, half day for the gate.

### P2-4. Billing operations requeue can silently no-op

The three `billing_events` branches
([actions.ts](../src/app/admin/billing-operations/actions.ts)) filter
`.is('next_attempt_at', null)`. A failed event that already carries a retry stamp is
never requeued, and the button reports "Successfully requeued 0 item(s)" — which
reads as "nothing needed doing" rather than "the filter excluded them".

- [ ] Decide whether the `next_attempt_at is null` narrowing is intentional (it
      plausibly is, to avoid stomping an in-flight backoff). If so, say so in the
      result message and in the page's legend.
- [ ] Distinguish "0 matched the filter" from "0 dead letters exist" in the toast.
- [ ] Note for whoever tests this: the known dead-lettered subscription event is
      `provider_price_contract_mismatch`, which is **never retryable** — requeuing it
      will re-fail by design. Do not read that as a bug in this button.
- **Owner:** me. **Effort:** 2 hours.

---

## P3 — customer-facing falsehoods reachable from the console

A human reads these and pastes them to a contractor. That is the whole risk.

### P3-1. Support copilot promises two things the platform cannot do

- [ ] [support-copilot.ts:207](../src/lib/ai-operator/support-copilot.ts#L207) — "a
      dedicated local SMS number… 100% white-labeled". **Every plan grants zero
      dedicated numbers**; the allowance was deliberately zeroed. Rewrite or remove.
- [ ] [:282](../src/lib/ai-operator/support-copilot.ts#L282) — "SSL certificates are
      issued automatically". Custom domains currently **fail the TLS handshake**.
      Rewrite or remove.
- [ ] [:97](../src/lib/ai-operator/support-copilot.ts#L97) — the same
      dedicated-number claim inside the onboarding remediation steps, which tells the
      contractor to go "claim a dedicated business phone number" on a screen that
      cannot give them one.
- [ ] `quotesCount` at [:33-45](../src/lib/ai-operator/support-copilot.ts#L33) is
      selected from the **`jobs`** table, so "No quotes created yet" actually means
      "no jobs". Same conflation as `contractor-lifecycle-emails.ts:453` — fix both.
- [ ] Test: assert no customer-facing string in `ai-operator/` asserts a capability
      that `billing/catalog.ts` grants zero of. Pin the specific claims; a substring
      OR-check will pass on an incomplete list.
- **Owner:** me. **Effort:** half day.

---

## P4 — authorization consistency

### P4-1. AI Operator is visible and usable by every staff role

- [ ] [operator/page.tsx:10](../src/app/admin/operator/page.tsx#L10) is bare
      `requireAdmin()`, which admits **any active staff row of any role**, then
      renders platform MRR, dunning, paused payouts and open Stripe disputes. Gate it
      on a permission.
- [ ] [AdminNav.tsx](../src/app/admin/AdminNav.tsx) gives "AI Operator ⚡" **no
      `permission` key**, so the link renders for everyone. `/admin/staff` is the only
      nav item that carries one. Add one to match the page gate.
- [ ] Same review for `/admin/money`, `/admin/health`, `/admin/campaigns` and
      `/admin/audit`, all `requireAdmin()` today and all showing cross-account
      financial or security data.
- [ ] Test: assert every nav item whose page requires a permission also declares that
      permission in `ITEMS`, and vice versa. Two lists that must agree, and nothing
      checks that they do.
- **Owner:** me + user (who should see what). **Effort:** half day.

### P4-2. Two high-impact actions skip MFA that comparable ones require

- [ ] **Email campaigns** — `sendPlatformCampaignBlastAction` is
      `requirePermission('ops.manage')` with **no MFA**, while Messaging and Voice
      (arguably lower impact) both require it. This action emails every contractor on
      the platform from `hello@letsgetquoted.com`. Promote to `requireMfaPermission`.
- [ ] **Service health "Run now"** —
      [health/actions.ts:31](../src/app/admin/health/actions.ts#L31) is
      `requireAdmin()` plus an inline `staffCan` check, no MFA and **no confirmation
      step**, and it triggers live money-moving workers
      (`direct-payment-settlement`, `ad-wallet-refill`, `overage-settlement`) against
      the real Stripe account. Add MFA and a typed confirmation for the money-touching
      subset.
- [ ] Campaign sends have **no idempotency key** — a double-click sends the blast
      twice. Add one keyed on the campaign UUID.
- [ ] Campaign audience reach silently falls back to 0 on a read error
      ([campaigns/page.tsx:24](../src/app/admin/campaigns/page.tsx#L24)). A blast
      composed against "0 recipients" that is actually 200 is the wrong direction to
      fail. Surface the error instead.
- **Owner:** me. **Effort:** half day.

### P4-3. Operator HITL can approve itself

`create_hitl_action_request` and `resolve_hitl_action` are **both model-callable**,
so one model turn can mint a high-impact card and approve it.
`validateActionExecutionSafety` is called in 3 of ~19 tool branches. The system
prompt asserts "High-impact mutations MUST be queued as HITL" — enforced by prose
only. `resolve_hitl_action` at [tools.ts:558](../src/lib/ai-operator/tools.ts#L558)
does refuse in its body, which is the right instinct.

- [ ] Remove `resolve_hitl_action` from the model-callable switch entirely rather
      than refusing inside it. A tool that always refuses should not be offered.
- [ ] This is harmless **only while approved cards do nothing**. Before any
      dispatcher is wired to approvals this becomes a P0 — record that dependency
      next to the dispatcher work.
- **Owner:** me. **Effort:** half day.

---

## P5 — dark rails: decide on or off

### P5-1. Four cron routes exist with no schedule and no registry entry

`activation-autopilot`, `smart-dunning`, `webhook-heal`, `db-guard` — present in
`src/app/api/cron/` but absent from **both** `vercel.json` and
`src/lib/cron-jobs.ts`. Absent from the registry means they are not even reachable
from the "Run now" list (`cronJob(slug)` returns null → "Unknown cron job"). Three of
the AI Operator's four autonomous workers are dead paths in production.

- [ ] For each: schedule it, or delete it. A fifth state — "exists, unreachable,
      untested, still importable by the operator's tool switch" — is how P2-1 stayed
      invisible.
- [ ] Do **not** schedule `smart-dunning` before P2-1 is resolved.
- [ ] `db-guard` has one recorded run and is not declared — find out what ran it.

### P5-2. operator-briefing has never run

Declared in the **working tree only** — `git show HEAD:vercel.json` has no such cron,
and `cron_runs` has zero rows for it. `ai_operator_logs` and
`ai_operator_action_requests` are both empty: the autonomous cycle has **never
executed in production**. Everything on the page is computed live per request.

- [ ] Commit and deploy the `vercel.json` entry (coordinate with the other agent — it
      is their edit).
- [ ] Confirm it recorded a run: `npm run inspect:cron-health` must move
      `operator-briefing` off SILENT.
- [ ] Before enabling it, resolve P1-4, P1-5 and P2-2 — otherwise the first thing it
      does is email the founder a briefing containing invented trends and a nudge
      count for messages nobody received.
- [ ] `dispatchExecutiveBriefingDigest` defaults to `founder@letsgetquoted.com` when
      `ADMIN_ALERT_EMAIL` is unset. Confirm that mailbox exists or set the var —
      otherwise the daily briefing bounces silently.

### P5-3. AI Voice numbers is gated on two flags whose Production state is unknown

`LGQ_SIGNALWIRE_VOICE_PROVISIONING_ENABLED` and
`LGQ_SIGNALWIRE_VOICE_RECOVERY_ENABLED` are absent from `.env.local` and cannot be
read from Vercel (Sensitive vars are write-only).

- [ ] Operator/Codex: confirm both values in Vercel Production, and confirm the
      current deployment was **built after** they were set — Vercel bakes env at
      build, so a flag added later is inert.
- [ ] Same question for `GEMINI_API_KEY`, which decides whether the operator uses the
      LLM path or the fabricated-ID keyword fallback (P1-5). Two materially different
      products ship depending on the answer.

### P5-4. Privacy requests: "Resolve" does not fulfil anything

`resolvePrivacyRequest` ([privacy-requests.ts](../src/lib/privacy-requests.ts)) only
stamps `resolved_at`/`status`. It performs **no erasure, export or correction**, and
there is no self-serve DSAR intake — a request must be typed in by staff from the
account page. So the statutory 30-day clock can be zeroed with nothing done.
`executeAccountClosureSaga` exists and does real anonymisation, but nothing connects
the two.

- [ ] Wire deletion-kind resolution to the closure saga, or make the button say what
      it does ("Mark responded") and require a note recording how the request was
      actually fulfilled.
- [ ] Add a documented intake route (a `/privacy` mailbox someone reads) and make sure
      `/privacy` publishes it.
- [ ] The account page already warns that deletion is blocked by 24 RESTRICT tables.
      Reconcile that path with what "resolved" is allowed to mean.
- **Owner:** user (legal posture), me (wiring). **Effort:** 1 day.

---

## Gates to add (the durable half of this work)

Ordered by how much future breakage each prevents.

- [ ] **Table-existence contract** — every `.from('literal')` in `src/` resolves to a
      table in `schema.sql`. Would have caught all five of P2-3.
- [ ] **No auth guard inside `try`** in any admin server action (P0-2).
- [ ] **Nav permissions match page permissions** (P4-1).
- [ ] **No fabricated fallbacks** — assert cold-module `getApmSummary()`,
      `getRecentPagingEvents()` and `get_ops_trend_history` all return empty
      (P1-1, P1-3, P1-4).
- [ ] **No `sample`/`test` identifiers** in `src/lib/ai-operator/` (P1-5).
- [ ] **Capability claims match the catalog** for customer-facing copy (P3-1).
- [ ] Run `npm run lint` **unpiped** alongside `npm run build` before declaring any of
      this done — piping a gate loses its exit code, and a green typecheck has shipped
      a failing build here before.

## Open questions for the user

1. **APM** — persist to a table, adopt Sentry/Datadog, or drop the panel? (P1-1)
2. **Smart dunning** — build it properly, or delete it? (P2-1)
3. **Activation nudges** — wire a real sender, or remove the chip? (P2-2)
4. **On-call paging** — is there a real on-call rotation to page, or should the whole
   subsystem go? (P1-3)
5. **Who should see `/admin/operator`** — super_admin only, or ops too? (P4-1)
6. **Privacy** — what is "resolved" allowed to mean before a deletion is actually
   executed? (P5-4)

## Suggested order

1. **P0-1 + P0-2 together** — until MFA works, none of the rest can even be tested.
2. **P2-3's schema-contract gate** — cheap, and it fences off the whole defect class.
3. **P1-1 → P1-3** — the Service health lies, in one pass over one page.
4. **P3-1** — smallest edit, most direct customer exposure.
5. **P1-4, P1-5, P4-1, P4-2** — the operator cluster.
6. **P5 decisions**, then P2-1 / P2-2 build-or-delete.

## Not in scope (already correct)

Recorded so nobody re-audits them: the Money page's window handling and
availability diagnostics; `fetchFeeWindow` as the single fee definition; campaign
suppression and RFC 8058 one-click unsubscribe (both fail closed); the incidents
writer and its migration comment; the phone-search guard at
`admin-accounts.ts:230`; and the dispute-evidence tool's refusal at `tools.ts:895`,
which is the model every other unwired tool in this document should copy.
