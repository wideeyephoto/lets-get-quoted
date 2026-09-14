# Sending-domain restoration notices

Local implementation, September 14, 2026. Hosted acceptance remains open.

Apply migration 20260914174223_email_domain_restoration_notices.sql after the
failure and website snapshot/callback migrations and before the new worker and
webhook handler. It is mirrored in schema.sql. No backfill is performed.

## Source and delivery contract

A pending/failed domain becoming verified creates a restoration notice in the
same transaction, provided this same workspace/domain record has a saved failure
message snapshot. This includes recovery through the reconciler or interactive
verification. First-time verification and domains with no prepared failure stay
silent. A saved failure snapshot proves preparation, not provider acceptance or receipt.
The restoration message explicitly makes no claim that earlier mail arrived.

Identity is the domain record plus its verification timestamp. Concurrent
recovery and repeated checks cannot enqueue two notices for that occurrence.
Interactive verification and reconciliation compare the current status and
provider binding before updating. A missing notice insert rolls back the
verification update, so the next valid check can recover it.

The existing domain reconciler attempts up to five restoration notices per run.
It saves the normalized current owner recipient, current connection binding,
exact message, credential fingerprint and domain-restored:v1:<notice UUID> key
before the HTTP request. Workspace delivery blocks are checked again afterward.
Failure and restoration queue processing are independent and still run when
domain-management access is missing; that missing access remains unhealthy.

An unsent notice is cancelled when the domain is removed, held, loses
verification or has a different verification timestamp. An attempted notice is
never automatically reclaimed: a five-minute unknown outcome becomes review.
Acceptance without final evidence becomes review after thirty minutes. Signed
callbacks must match the saved workspace, single recipient and provider ID;
early delivery repairs acceptance without resending. Stronger negative evidence
wins, and explicit operator closeout stays intact while later evidence is saved.

## Review and retention

The domain cron summary includes combined failure/restoration backlog and review
counts, with bounded notice/account/error identifiers. Inspect the appropriate
private table by notice ID. The service-only resolve_email_domain_restoration_notice
RPC requires the exact account, actor and evidence. Missing callbacks alone do
not establish failure and are not a resend authorization. Deliberate resend UI
and broader recovery integration remain step 8 work.

Domain deletion retains attempted evidence with a null domain reference.
Account closure cascades notices and snapshots using the existing account data
disposition policy. Runtime retention, legal-hold execution and hosted capacity
must be verified in release acceptance; local registry entries do not prove them.

## Local verification

153 application tests across the restoration worker, domain reconciler,
server-action controls, signed webhook, actual SDK boundary and disposition
registry passed. The combined disposable PostgreSQL 17 runner passed 75 checks,
including atomic source rollback, concurrent events, private permissions,
immutable snapshots, obsolete events, callback races and scoped deletion.
Changed-file lint and ten registry tests passed; the local security advisor
reported No issues found. Full application/test type checking passed with no diagnostics.
No live email, migration, deployment or canary expansion was performed.
