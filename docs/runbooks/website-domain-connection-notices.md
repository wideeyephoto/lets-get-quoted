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

The snapshot migration now additionally requires an immutable saved message before
submission. `website_domain_notice_snapshots` contains the exact rendered payload,
the SHA-256 fingerprint of the actual SDK credential and the stable
`website-domain-connected:v1:<notice UUID>` provider key. The credential itself is
not stored. Only one preparation wins; later calls cannot change the recipient,
message, event identity, fingerprint or key. Recipient policy is checked again
after saving. A credential fingerprint does not establish the provider's workspace
or region; those remain part of hosted acceptance.

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

Apply `20260914171633_website_domain_connection_notices.sql`, then
`20260914173129_website_domain_notice_snapshots.sql`, before deploying the
updated reconciler and sender. The migration requires the existing `sites` and
`accounts` tables. Drain older reconciler invocations during cutover and retain
the additive schema on rollback. Assign outstanding notices for review if rolling
back to a worker that does not process the queue.

Durable events, immutable message snapshots, credential fingerprints and provider
idempotency headers are implemented locally. Signed callback acceptance/delivery
repair, verified provider workspace/region, approved retention and any automatic
retry contract remain open. Local checks do not satisfy hosted receiver or canary gates.
No schedule, enrollment or live recipient change accompanies this local work.

Verification: [dated local evidence](../evidence/website-domain-notices-2026-09-14.md).
Later snapshot/key evidence: [ten-step execution record](../customer-email-ten-step-execution-2026-09-14.md).
Track next steps in [the rollout plan](../customer-email-implementation-plan-2026-09-14.md)
and [the official prelaunch list](../../LAUNCH_CHECKLIST.md).

## Signed callback recovery

Apply 20260914173622_website_domain_notice_callbacks.sql after the snapshot
migration and before the updated webhook handler. The callback must match the
saved notice, account, single recipient and provider ID. Missing or unprepared
notice callbacks produce a private DOMAIN_NOTICE_QUARANTINE record; investigate
legacy sending, deletion or environment routing. Failed quarantine writes remain
retryable. Conflicts cannot assign delivery history or suppression.

Delivery closes the notice using signed_provider_webhook. Negative outcomes
return it to manual review; lower or duplicate events cannot erase stronger
evidence. Operator closeout remains intact while later callback evidence is
recorded. A late worker response or timeout preserves the callback result.
Callbacks never submit email. The acceptance deadline still applies when no
final delivery evidence arrives. Local proof is in the ten-step execution record;
hosted receipt has not yet been verified for this release.
