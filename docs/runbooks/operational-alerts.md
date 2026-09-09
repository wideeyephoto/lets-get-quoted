# Operational failure alerts and recovery

Owner and inbox: Brett, **hello@letsgetquoted.com**. The Vercel `operational-alerts`
cron runs every five minutes. The GitHub **Cron Health Monitor & Alerting** workflow
runs independently at minutes 7, 22, 37 and 52. Both use the same durable queue.
GitHub scheduled runs can be delayed; the five-minute application monitor is the
primary path. A database/scan failure also sends a direct email from the external
watchdog without requiring the failed database to write an alert record.

## What is detected

| Source | Condition | Recovery location |
| --- | --- | --- |
| `webhook_failures` | unresolved receipt or handler failure | `/admin/failures#webhooks` |
| `billing_events` | failed projection, receipt idle over 15 minutes, expired lease over five minutes | `/admin/billing-operations` |
| `sms_events` / `sms_delivery_tasks` | terminal or unknown outcome, overdue eligible task, expired lease | `/admin/messaging` |
| `payments` | open dispute, including evidence deadline | `/admin/money#disputes` |
| `cron_runs` | latest run failed, overdue cadence, or a declared job never ran | `/admin/health` |

Each notification includes the record reference, time, failure stage and recovery
instruction. Digests show up to 20 records per category; the complete reference list
is retained in `operational_alert_findings` by `delivery_id`. Notification payloads
contain no customer names, phone numbers, message bodies, payment amounts or raw
provider exceptions. Historical unresolved failures are retained and reported.

## Delivery evidence

`operational_alert_deliveries` retains the immutable payload, provider email ID,
attempt count, provider status, acceptance time and observed mailbox-delivery time.
`accepted` means the email API accepted the request. The existing signature-verified
Resend webhook records ordered provider delivery in `email_events`; the monitor
matches it by provider email ID. This works with a sending-only API key. Only a
provider `delivered` result closes delivery; `delivered_at` is the time that result
was observed, a conservative upper bound rather than the provider's exact receipt
timestamp. Reading the email is separately confirmed by the recipient during a drill.

One failed response or timeout is not a successful send. Retries preserve the same
payload and provider idempotency key. Unknown outcomes stop before the provider's
24-hour deduplication window expires. A bounce or expired retry becomes
`manual_review`; the monitor itself reports failure. If the only configured email
provider or recipient is unavailable, that same email channel cannot prove human
delivery; the failed external workflow remains visible. An independent second paging
provider is not configured by this release.

Read-only inspection:

```sql
select id,category,state,created_at,first_attempt_at,attempt_count,provider_id,
       accepted_at,delivered_at,provider_status,last_error
from operational_alert_deliveries order by created_at desc limit 30;

select source_key,reference,occurred_at,detected_at,resolved_at,detail,action_required
from operational_alert_findings where delivery_id = '<alert UUID>';
```

## Recovery rules

1. Inspect the source record and the original provider event/message/payment ID.
2. Repair the recorded cause. Use that source's existing, authenticated recovery
   action or worker. Reuse its original idempotency key and durable receipt.
3. Verify the payment, credit grant or message against provider and application
   evidence before marking a source resolved. An unknown SMS submission must be
   reconciled with the provider before retry; a new message is not a replay.
4. Let the next monitor scan record the cleared finding. Repeat the original
   recovery once in a controlled fixture and confirm counts/amounts are unchanged.

The monitor never charges a card, grants credits, replays a webhook, edits a dispute
or sends a customer SMS. The old SRE helper now reports unresolved failures for
review; it cannot claim healing by merely setting `resolved_at`.

## Release and containment

Apply `20260909133220_operational_alert_delivery.sql` before deploying the route.
Provide the existing production Supabase URL/service key and Resend key to the
GitHub workflow; secrets never belong in workflow YAML. The recipient is explicitly
configured in that workflow and defaults to the same approved inbox in the app.

Contain notification faults by disabling the GitHub workflow and removing only
the `operational-alerts` schedule in a reviewed deployment. Preserve source failures,
notification evidence, inbound callbacks, payment workers and messaging consent.
No schema rollback is needed to return to the prior application release.

Run `node scripts/verify-operational-alerts.mjs` for disposable PostgreSQL proofs.
The controlled live drill must record fixture IDs, failure and mailbox-delivery
times, provider IDs, replay outcomes and cleanup. A fabricated payload sent straight
to an email function does not close source-detection or scheduled-delivery acceptance.
