# Website connection owner notices

This covers the existing email sent when the scheduled website-domain reconciler
confirms TLS readiness. It is separate from sending-domain failure notices and
does not introduce a new email for sending-domain restoration.

## Committed notice and one attempt

The reconciler writes `custom_domain_verified_at` and
`custom_domain_notice_requested_at` together. The database creates a private
`website_domain_connection_notices` row in that transaction. If creation fails,
the verification stamp rolls back. Interactive verification and old application
versions do not set the request marker, so they do not enqueue extra emails.
There is no backfill of already-connected sites.

A connection event is identified by its site and verification timestamp; the
notice gets its own UUID. Concurrent promotions and claims have one winner.
Each run claims at most five notices, checks the current site/domain/verification
binding and saves the normalized owner address before submitting. The sender
requires the notice ID and workspace, adds `website_domain_notice_id` for tracing,
applies the existing recipient delivery policy and requires a provider message ID.

`ownersNotified` counts provider acceptance, not confirmed receipt. Failed sends,
missing owner addresses and rejected preparation remain `manual_review`. A dead
worker's claim expires after five minutes and requires review; it is not reclaimed.
An accepted notice without reviewed delivery evidence becomes `delivery_unconfirmed`
after thirty minutes, when the worker next runs. Until signed callback recovery
is added for this family, even a delivered provider event requires evidence-backed
operator closeout of that notice. The callback does not currently resolve it.

Unsent notices are cancelled when the site is removed, the domain changes or the
verification stamp is cleared/replaced. A genuinely new connection can create a
new notice. Site deletion retains incident evidence; account deletion cascades it
under the existing account-cleanup policy and data-disposition registry.

## Monitoring and closeout

`notificationReviews`, `notificationBacklog` and bounded identifier/error-code
details are included in the custom-domain reconciler summary. Open reviews and
pending work keep `errors` nonzero on later runs, even with no pending domains.
Already-queued notices are processed and reviewed if provisioning credentials
become unavailable; no domain checks are attempted in that case.

Use service-role access for inspection:

```sql
select id, account_id, site_id, domain, state, created_at, attempted_at,
       provider_id, accepted_at, last_error, resolved_at, resolved_by
from public.website_domain_connection_notices
where state in ('pending','sending','accepted','manual_review')
order by created_at;
```

Do not reset attempted notices, delete them to retry, or interpret a missing
provider ID as proof that the provider never accepted the message. Confirm the
exact owner receipt and provider history through the existing approved support
process. `resolve_website_domain_connection_notice(id, account_id, actor, evidence)`
closes only a manual-review record, requires a named operator and substantive
evidence, and never submits email or erases its original failure code.

## Release gates

Apply `20260914171633_website_domain_connection_notices.sql` before deploying the
updated reconciler and sender. The migration requires the existing `sites` and
`accounts` tables. Drain older reconciler invocations during cutover and retain
the additive schema on rollback. Assign outstanding notices for review if rolling
back to a worker that does not process the queue.

This is the initial durable-event and acceptance step. Immutable rendered-message
snapshots, provider credential/scope binding and idempotency headers, signed
callback acceptance/delivery repair, approved retention and any automatic retry
contract remain open. Local checks do not satisfy hosted receiver or canary gates.
No schedule, enrollment or live recipient change accompanies this local work.

Verification: [dated local evidence](../evidence/website-domain-notices-2026-09-14.md).
Track next steps in [the rollout plan](../customer-email-implementation-plan-2026-09-14.md)
and [the official prelaunch list](../../LAUNCH_CHECKLIST.md).
