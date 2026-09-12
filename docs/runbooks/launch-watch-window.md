# Post-cutover watch window — G7

Written for
[G7 in the gap closure plan](../prelaunch-gap-closure-plan-2026-09-11.md#g7--no-post-cutover-watch-window):
what gets watched after cutover, by whom, at what cadence, and what number
triggers a rollback instead of a judgment call. Designed for the actual
constraint: **one operator, who sleeps.** That should be planned for, not
discovered at 3am.

Every threshold below is either a number the system **already** treats as a
failure (cited to source), or is explicitly marked as new and reasoned from
those existing numbers. None are invented from nothing.

---

## 1. T-0 sequence

Reference, don't restate:
[§4 of the go-live plan](../platform-go-live-2026-09-08.md#4--orderings-where-the-wrong-sequence-causes-the-harm),
the six orderings with a recorded incident behind each. In order, relevant to
cutover specifically:

1. Freeze the SHA before running any gate (§4.6).
2. Migration before the deploy that reads the column, never after (§4.3) —
   this is also the exact rule G5's release procedure names for
   `20260911094000_platform_incidents_published.sql`.
3. Flag orderings for anything toggled at cutover (§4.1, §4.4).
4. Fix the alert channel before the watch window starts, not during it (§4.5)
   — if [G3](../prelaunch-gap-closure-plan-2026-09-11.md#g3--nobody-has-proven-a-human-receives-mail-at-any-of-the-14-addresses)
   is still open, the paging chain this whole document assumes may terminate
   at an unread address. Close G3 before relying on anything below.

## 2. What's actually watching, right now

Before inventing new thresholds: this system already has a real, five-minute
automated scanner (`src/app/api/cron/operational-alerts/route.ts` →
`runOperationalMonitor` → the Postgres function `scan_operational_failures`).
Its existing per-item thresholds, read directly from the latest migration
(`20260910121506_overage_recovery_guards.sql`):

| Category | Existing threshold | Where |
| --- | --- | --- |
| Webhook failure | Any unresolved row — no grace period | `webhook_failures` |
| Billing event | Received & unclaimed 15 min, or processing lease expired 5 min, or failed | `billing_event_operational_classifications` |
| Overage settlement | Submitted lease expired 10 min, or indeterminate 3 hours, or failed | `workspace_overage_settlements` |
| Overage period close | Unclosed 3 hours past period end | `workspace_overage_accruals` |
| SMS | Queued & unclaimed 15 min, leased & expired 5 min, or failed/indeterminate | `sms_events` / `sms_delivery_tasks` |
| Dispute | Any open dispute, no grace period | `payments` |
| Cron | Failed, or overdue past `max_gap_minutes` (each job's own schedule interval + min(interval,15) grace), or a required job that never ran | `cron_runs` vs. `vercel.json` |
| Alert delivery itself | Accepted but not confirmed reaching the mailbox within 30 min | `operational_alert_deliveries`, `src/lib/operational-monitor.mjs:116` |

**This already pages on every one of those the moment it happens** — there is
no "wait for hours 0–24" grace period built in, and the watch window does not
need to re-implement any of it. What it needs to add is the layer this scanner
does not have: a **rate or count across many individual items**, since the
scanner flags each stuck item once, not "N of these in an hour."

The one category this system pages on **manually, not automatically**:
`uptime`, `runtime_exception`, `provider_outage` incidents are logged by a
human through `/admin/incidents` (`src/app/admin/incidents/actions.ts`), which
is also the mechanism that publishes to `/status` (see
[the G5 publication policy](status-page-publication-policy.md)). During the
watch window, that human is the one holding this document.

## 3. Hours 0–24 and 24–72 — named metrics, numeric thresholds

Each row: the metric, its real source, the number, and what it's tied to.

| Metric | Source | Hours 0–24 threshold | Hours 24–72 threshold | Ties to |
| --- | --- | --- | --- | --- |
| Failed-payment rate | `payments.status='disputed'` count, or Stripe dashboard failed-charge rate | **New**: >3 failed charges in any rolling hour that aren't declined cards (i.e., look like a platform bug, not a customer's bank) | >5 in a rolling 4 hours | `vercel rollback` (§4 below) if traced to the deploy |
| Webhook dead-letter depth | `select count(*) from webhook_failures where resolved_at is null` | **New**: >5 unresolved at once (the scanner already pages on 1; this is "the backlog is growing, not draining") | >10 | Investigate before rollback — a webhook backlog from a provider-side outage is not this deploy's fault; one caused by the deploy is |
| SMS queue depth / stall | `sms_delivery_tasks` where `task_state='queued'` count, and oldest `available_at` age | **New**: queue depth >20 **or** oldest queued item >15 min old (the scanner's own existing per-item threshold — codified here as a count trigger, not just a per-item page) | Same | Check SignalWire balance first ([G4](../vendor-account-register.md) — this is the silent-failure vendor) before assuming a code regression |
| Cron failures per fleet inspection | `npm run inspect:cron-health` (or `:strict` for the 90-minute-lookback variant) | **New**: any `required: true` job showing `never ran` or 2+ consecutive failures | Same | Re-run hourly during hours 0–24 |
| 5xx rate | `/api/health`'s `errorRatePct` (`src/lib/apm-telemetry.ts`, real request-level 5xx/total) | **New**: >2% sustained over any 10-minute window | >1% sustained over any hour | Immediate rollback if it started at the deploy and doesn't self-resolve in 10 min |
| AI spend rate | **Not currently measured anywhere.** No AI spend dashboard, alert, or per-request cost tracking was found in `src/lib/ai-model-call.ts` or the admin surfaces. | **Cannot set a numeric threshold today.** Until this exists, the substitute is a manual Google Cloud Billing / OpenAI usage check at hour 4, 24, and 72. | Same | This gap is real and belongs on the backlog — a runaway AI loop during the highest-traffic window of launch has no automated tripwire |
| Signup-to-activation | No existing funnel-stage tracking was found (same gap the "measure demo→signup as its own conversion step" note elsewhere in this checklist already names for paid-ad pages) | **Cannot set a numeric threshold today.** Manual spot-check: pick 5 real signups from `accounts.created_at` each 8 hours, confirm each reaches first job/quote created. | Same | Not a rollback trigger by itself — a funnel problem and a platform outage look different and need different responses |

**Two rows above have no automated threshold because no automated measurement
exists.** That is stated as a gap, not papered over with an invented number —
inventing a threshold for a metric nobody is collecting would be worse than
admitting the hole, since it reads as covered when it isn't.

## 4. Abort criteria — numbers, not adjectives, each tied to an action

- **5xx rate >2% for 10 minutes, correlated with the deploy time** →
  `vercel rollback` per [the existing drill runbook](vercel-rollback-drill.md).
- **Any §4 ordering violated** (a flag flipped out of sequence, a migration
  applied after the code that reads it) → do not wait for a symptom; reverse
  the ordering immediately per §4's own recorded incident for that exact
  sequence.
- **Webhook dead-letter depth >10, or SMS queue depth >20, and neither drains
  within 30 minutes of first crossing the line** → treat as P1, page per §5
  below regardless of hour.
- **A required cron shows `never ran`** → do not wait for a second failure;
  a Vercel flag-gated route can 404 before recording anything (exactly the
  failure `inspect-cron-health.mjs`'s own header comment describes), so one
  "never ran" is already the second-order symptom of a real problem.
- **Rollback itself must follow [the existing drill's](vercel-rollback-drill.md)
  forward-only, non-breaking migration discipline** — a rollback that assumes
  schema symmetry with the pre-cutover state can break on its own.

## 5. Overnight policy

Depends on [G3](../prelaunch-gap-closure-plan-2026-09-11.md#g3--nobody-has-proven-a-human-receives-mail-at-any-of-the-14-addresses):
phone paging goes through `ONCALL_PRIMARY_PHONE`
(`src/lib/operational-sms-paging.mjs`, `src/lib/operational-monitor.mjs`), and
if that variable is unset in Production, `sendMonitorFailure` silently skips
the SMS leg entirely (`if (env.ONCALL_PRIMARY_PHONE) { … }` —
`operational-monitor.mjs:47`) and falls back to email alone, to the same
`ONCALL_PRIMARY_EMAIL`-or-`hello@` address T26 never confirmed. **Do not treat
this section as usable until G3's T26 is closed with dated evidence that the
variable is set and baked into the current build.**

Once that holds:

- **Pages the phone, any hour:** any abort-criteria breach in §4 above; any
  `critical`-severity incident per the same severity scale
  [the publication policy](status-page-publication-policy.md) uses; the alert
  system's own failure to page (`sendMonitorFailure` throwing, which is what
  the independent GitHub watchdog exists to catch when the primary Vercel cron
  can't run at all).
- **Waits for morning:** everything the five-minute scanner already logged to
  `operational_alert_findings` but that hasn't crossed an abort threshold —
  it's recorded, resolvable in the morning queue, and paging on it at 3am
  trains the one operator to snooze real pages.
- **The exception that swallows every rule above:** the operator's own
  judgment on the ground beats this document. This is a floor, not a ceiling.

## 6. Publication trigger

Ties directly to [the G5 publication policy](status-page-publication-policy.md#2-which-severities-get-published):
`critical` publishes within 15 minutes, `warning` within 60, matching that
document's own severity table. This section and that one **must name the same
categories** — that document already says so; this is the other half of the
same promise. As of this writing both agree: `uptime`, `database`, and any
abort-criteria breach in §4 above are always publish-worthy; `billing_reconciliation`
and `webhook_dead_letter` publish only once customer-visible (a charge or
message the customer can see is affected), matching the publication policy's
own per-category table rather than restating it here.

## 7. Tabletop walkthrough

**Not yet run.** This is the one item in this document that is inherently not
agent-completable — it requires the actual operator (and anyone else who might
hold the pager) sitting through a dated, timed rehearsal of at least one
abort-criteria scenario end to end: notice the threshold crossed, decide
rollback vs. investigate, execute
[the rollback drill](vercel-rollback-drill.md), confirm recovery, and record
the elapsed time at each step. Schedule this **before** cutover, not during
the retrospective after a real incident proves whether this document works.

## What this document does not cover

It does not restate §4's orderings or the publication policy's severity table
— both are linked, not duplicated, so they can't drift apart from this one.
It does not close G3 (mail liveness), which every phone-paging claim above
depends on. It does not build AI-spend or funnel-stage monitoring, both named
above as real, currently-unmeasured gaps — this document's job was to state
that honestly, not invent a number to fill the blank.
