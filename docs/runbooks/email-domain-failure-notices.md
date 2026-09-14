# Sending-domain owner notice recovery

Owner: Brett / LGQ Operations. Inspect the `email-domain-reconcile` worker in
`/admin/health`. A technical downgrade must both remove verified eligibility and
record a notice. `email_domain_failure_notices` stores the account, domain, failed
connection reason, attempted send, provider ID, and reviewed outcome. Browser roles
cannot read or modify this internal evidence.

The prepared snapshot migration adds `email_domain_failure_snapshots`, keyed by
the existing incident UUID. Before provider submission the worker saves the exact
rendered message (including recipient, sender, subject, links and tracking tags),
the stable `domain-failure:v1:<notice UUID>` key and a SHA-256 fingerprint of the
credential used by the actual SDK client. The credential itself is never saved.
This fingerprint identifies the credential; provider workspace/region inventory
is still required before claiming verified provider scope.

Preparation requires the exact workspace and current sending claim, within its
five-minute lease, with the domain still failed or pending. The database permits
one snapshot, rejects replacement even with identical content, and prevents
changes to the prepared incident's identity. Only the successful first preparation
permits submission. A rejected or uncertain save becomes `snapshot_prepare_failed`
for manual review; a crash after saving leaves the snapshot as evidence without
authorizing a retry. Current recipient blocks are checked again after persistence.
Domain disconnection retains the snapshot; existing account deletion cascades it.
Retention approval and any longer-lived deduplication requirement remain open.

This step does not add signed callback acceptance repair or automatic retries.
Older already-attempted incidents are not backfilled or rearmed, and the callback
tag alone is not trusted to recover a missing provider ID.

The worker claims each pending notice once. An expired sending claim or any failed
or uncertain submission becomes `manual_review`; it is never blindly resent.
Successful submission is `accepted`, and a matching account's signed callback in
`email_events` resolves it only after delivery. Negative delivery outcomes or
unconfirmed delivery older than 30 minutes become incidents when the worker next
checks them. The worker is daily, so this is not a promise of detection within
30 minutes. An unsent notice is cancelled if its domain recovers, is disabled, or
is disconnected before claiming.

Open reviews and unprocessed pending notices keep the worker's `errors` count
nonzero. Review IDs, account IDs, and bounded error codes appear in its durable
summary, including later runs where the domain is already failed or has recovered.
The existing operational monitor escalates this failed worker through its configured
on-call route. Rechecking DNS alone cannot erase the unresolved notice incident.

Read-only inspection with the service role:

```sql
select id, account_id, domain_id, domain, state, created_at, attempted_at,
       provider_id, accepted_at, last_error, resolved_at, resolved_by, resolution
from public.email_domain_failure_notices
where state in ('pending','sending','accepted','manual_review')
order by created_at;
```

For each incident, verify the exact account and provider message history before
deciding whether any mail needs to be sent. A missing saved provider ID can mean the
provider accepted the request before a database failure. Do not reset the row to
`pending`, delete it, or change sender to bypass suppression. For a rejected or
missing owner address, repair the address and use the existing support process to
confirm the owner has received the connection instructions. Canary support contact
must remain within the owner's approved recipients and daily message allowance.

Once provider/recipient evidence or a documented support recovery confirms the
outcome, call the service-only `resolve_email_domain_failure_notice` RPC with the
exact notice ID, account ID, named operator, and substantive evidence. It changes
only an existing `manual_review` row; it does not send mail, alter the domain, or
erase the original failure. A second resolution or wrong account returns false.
The next normal worker/monitor run can then clear the operational alarm. Do not
record resolution solely to turn the worker green.

## Release and rollback

For the snapshot release, apply
`20260914170327_email_domain_failure_snapshots.sql` after the original notice
migration and before deploying the updated sender. Without that RPC the sender
fails closed and records an incident instead of submitting. Drain old workers
before cutover: old application versions do not save snapshots. Keep the additive
schema on rollback and review any incomplete incidents; do not reset them to pending.

Apply `20260910120000_email_domain_failure_notices.sql` before the application
release. The new request timestamp makes the trigger inactive for legacy worker
updates, which still use the inline sender. Existing failed domains are not
backfilled into unsolicited notices. Verify no legacy domain-worker invocation is
in flight and release between daily scheduled runs; do not manually invoke the
worker during cutover. Drain the old deployment before the first new-worker drill.

Inspect the notice table before rollback. Rolling application code back would stop
this incident processor; keep the new worker available or assign every outstanding
notice to Operations first. Retain the additive schema and incident evidence. Never
roll back by dropping the table or recreating pending notices. No change to the
production allowlist, email recipients, or schedule is required by this migration.

## Verification

`node scripts/verify-email-domain-failure-notices.mjs` uses disposable PostgreSQL 17
and the real migrations to test atomicity, legacy compatibility, concurrent claims,
unknown outcomes, service-only privileges, exact-account closeout, recovery/hold/
deletion cancellation, repeated breakages, and scoped account deletion.
`test/email-domain-failure-notices.test.ts` injects transport and persistence faults
without sending mail. These checks support F07; live incident escalation and
recipient recovery still need their own hosted evidence.

The snapshot checks additionally cover immutable content and credential binding,
one winning concurrent preparation, invalid message/tag/recipient sets, expired
claims, domain changes after claiming, failed persistence and late recipient
blocks. CI runs `npm run test:pg17:domain-failure-notices`; request-boundary tests
use the installed SDK with offline HTTP responses. The database guards use
[Postgres triggers](https://supabase.com/docs/guides/database/postgres/triggers).
