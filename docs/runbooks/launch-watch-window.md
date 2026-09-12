# Launch Watch Window (T-0 to T+72)

This runbook defines the numeric thresholds, metrics, and abort criteria during the initial launch and the first 72 hours of operation.

## 1. T-0 Sequence

Reference the §4 orderings in [platform-go-live-2026-09-08.md](../platform-go-live-2026-09-08.md) for flag sequencing.
Do not proceed out of order. If any flag fails or throws errors upon enablement, reverse in exact opposite order.

## 2. Watch Metrics (Hours 0-24 and 24-72)

Monitor these metrics for numeric thresholds. If any limit is exceeded, trigger the abort criteria.

- **Failed-payment rate**: > 10% of attempts within any 1-hour window.
- **Webhook dead-letter depth**: > 5 unhandled webhooks in DLQ within a 2-hour window.
- **SMS queue depth and stall duration**: > 100 messages in queue OR stall duration > 10 minutes.
- **Cron failures**: Any single cron job failing for 3 consecutive fleet inspections.
- **5xx rate**: > 1% of total traffic.
- **AI spend rate**: > $50/hour unexpectedly.
- **Signup-to-activation**: Drop-off rate > 40%.

## 3. Abort Criteria

If abort criteria are triggered, initiate a rollback.
Execute `vercel rollback` per the [Vercel Rollback Drill](vercel-rollback-drill.md) runbook. Follow the §4 reverse-ordering rules for flags.

## 4. Overnight Policy

Categories that page the phone via `ONCALL_PRIMARY_PHONE`:
- `uptime`
- `webhook_dead_letter`
- `sms_queue_stall`
- `provider_outage`

Categories that wait for morning:
- `runtime_exception` (unless volume exceeds 5xx rate abort criteria)
- `cron_failure`
- `billing_reconciliation`

## 5. Publication Trigger

Open a public incident (using the operator cockpit controls for `/status`) for any outage that triggers the abort criteria, affects > 5% of users, or causes an SMS/Webhook stall exceeding 30 minutes.

## 6. Tabletop Walkthrough

*Date:* [TO BE FILLED]
*Participants:* [TO BE FILLED]
*Notes:* [TO BE FILLED]
