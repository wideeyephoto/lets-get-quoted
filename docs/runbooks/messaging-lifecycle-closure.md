# Lifecycle notification disposal during account closure

The closure registry must classify `messaging_lifecycle_notifications` and
`messaging_lifecycle_email_evidence` as directly owned by `account_id`. Marking
them global makes the closure worker skip their configured delete operation and
allows it to report local disposal complete while leaving the records behind.

This correction uses the existing service-role DELETE grants and
`guard_messaging_notice_disposal()` trigger. The database requires a suspended
account without a legal hold, a processing closure whose recovery period has
expired, a current lease and no completed timestamp. Both tables apply the
guard. Deleting a notification cascades to its evidence, subject to that guard.
The application scopes each delete to the closing account, treats a rejected
delete as failed local disposal, and retries through the normal closure worker.

No migration, grant change or production cleanup is part of this correction.
Existing retention metadata and portability choices are preserved. Their broader
policy review remains open, as does the separate treatment of setup orders,
payment-ledger entries, number-retention state/events and managed-registration
operations. This two-table correction is not complete messaging disposal sign-off.

## Verification

The application regression executes the real closure orchestrator and registry
with simulated database responses. It reproduces premature completion before
the correction, checks both tenant filters, and rejects completion on either
table's failed delete before testing recovery.

`npm run test:pg17:closure-domains` also installs the actual notification/evidence
table definitions, grants and disposal triggers in disposable PostgreSQL. It
checks browser-role denial, account and closure guards, scoped deletion,
notification/evidence cascade, repeat execution, atomic rollback when a held
account is included, and a concurrent legal-hold update. Unrelated registration
application columns and capture/queue RPCs are outside this fixture.

These checks make no network requests or sends. They do not establish hosted
provider deletion, full-schema closure completion, or the remaining contractor
domain canary acceptance. Production fixture deadlines and required authorization
still apply before any supported cleanup run.
