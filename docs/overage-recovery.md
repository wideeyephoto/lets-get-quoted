# Overage recovery and release runbook

The settlement worker records an invoice item. Its legacy `charged` state does **not** establish that an invoice was paid.

## Recovery contract

- A first claim freezes the provider account, live/test mode, customer, request payload, existing v1 key format, original submission timestamp, and 23-hour retry deadline.
- Claims require an expired/absent lease, due retry time, no recovery hold, fewer than 12 attempts, and at least one minute before the fixed deadline. The worker rechecks the deadline and lease immediately before dispatch, disables SDK retries, and limits one Stripe request to 20 seconds.
- The deadline never extends on reclaim. The old claim RPC rejects callers with an upgrade-required error; deploy the worker and migration as a coordinated change.
- Legacy attempted rows have unknown original age because the old worker rewrote `submitted_at`. The migration holds them rather than guessing a safe retry time.
- Reaping only establishes that a lease expired. Recent work can be reclaimed; old/unknown work remains held. Late workers cannot overwrite a new owner's state. Their successful provider response can still be recorded as evidence.
- If an invoice-item ID was observed, a recent reclaim completes locally from that evidence. An unresolved completion otherwise gets two local completion attempts and an explicit `completion_unconfirmed` result. It never goes through the provider refusal classifier.
- No Stripe match, a lookup failure, an incomplete scan, or mismatched provider scope can make a held row retryable. Operator reconciliation only links a verified existing item through a revision-checked RPC.
- Text and voice holds must be finalized or released before their period closes. The period close and accrual write guards serialize against the same account/period boundary. A late write after close fails explicitly; it must be investigated for an adjustment, not silently discarded.

Stripe may prune idempotency keys after at least 24 hours. Reusing a pruned key creates a new request, and retries require identical parameters. The 23-hour deadline plus dispatch margin is an application policy beneath that boundary. See [Stripe's idempotency contract](https://docs.stripe.com/api/idempotent_requests).

## Baseline observed on 2026-09-10

- Source baseline: `eed040fdcb853c0d1ea61df25d987491d2a186f3`.
- Production project `mfuvvtrkipkigwqqtcal`: read-only checks found zero accrual rows and zero settlements. Claim, reaper, and unclosed-period RPCs exist. This observation must be refreshed before release.
- Historical migration version lookups did not establish rollout provenance. Inspect deployed function definitions and current migration history rather than inferring deployment from a filename.
- Production worker flags were not changed. Local environment files do not prove deployed flag values.
- A local preview environment file references the production database. Do not assume a preview deployment is isolated. Verify the actual deployed database and Stripe mode before any worker rehearsal.

## Release sequence

1. Record current deployed revision, database project, both overage flag values, Stripe account/mode, worker cadence, and in-flight runs. Hourly schedules are period close at minute 17 and settlement at minute 37.
2. Disable `LGQ_OVERAGE_SETTLEMENT_ENABLED` and drain old runs. Keep period closing disabled until its finality guards are installed. A flag change does not cancel a request already in flight.
3. Apply `migrations/20260910121506_overage_recovery_guards.sql` through the normal migration release path. It is additive but deliberately disables v1 claiming. Do not rewrite the historical migrations.
4. Deploy the corresponding worker while dispatch remains disabled. Verify v2 claim, evidence, reconciliation, and candidate RPCs with the service role; verify client roles cannot execute them. Confirm the schema cache has reloaded.
5. Refresh state counts and run dry-run reconciliation for every attempted row in the correct Stripe scope. Apply only verified matches. Unknown, missing, incomplete, and duplicate cases stay held and receive an operator owner.
6. Enable period closing and verify a representative ended period with fully finalized usage closes once. Watch held usage and unclosed-period age.
7. Set `LGQ_OVERAGE_SETTLEMENT_ACCOUNT_IDS` to explicit comma-separated account UUIDs for the canary. Unset/empty means all eligible accounts; malformed nonempty values stop dispatch. Then enable settlement. The route has a 300-second runtime bound and stops taking new work after 180 seconds.
8. Verify each canary's local settlement, provider item, invoice attachment, and summary. Remove the allowlist only after scheduled runs remain healthy and all canary outcomes are accounted for.

The original request must always use the original provider account/mode, including during reconciliation. The worker reads its actual account and balance mode before dispatch; its Stripe credentials must permit those read operations as well as invoice-item creation.

## Read-only inventory

```sql
select state, recovery_reason, count(*), min(first_submitted_at), min(retry_deadline_at)
from public.workspace_overage_settlements
group by state, recovery_reason;

select id, account_id, state, recovery_reason, first_submitted_at,
       retry_deadline_at, lease_expires_at, next_attempt_at, attempt_count, revision
from public.workspace_overage_settlements
where recovery_reason is not null or state in ('submitted','indeterminate')
order by first_submitted_at nulls first, id;

select settlement_id, occurred_at, kind, invoice_item_id, details
from public.overage_settlement_evidence
where settlement_id = '<settlement UUID>'
order by id;
```

## Reconciliation command

Supply the database URL and Stripe key through a controlled process environment. The tool does not load arbitrary repository `.env` files or print credentials. For remote PostgreSQL, certificate verification is required; set `PGSSLROOTCERT` if the platform requires a custom CA.

```text
node scripts/reconcile-submitted-overage-settlements.mjs --mode=test --stripe-account=acct_EXPECTED --manifest=overage-dry-run.json
node scripts/reconcile-submitted-overage-settlements.mjs --mode=test --stripe-account=acct_EXPECTED --manifest=overage-apply.json --apply
```

Use `--mode=live` only for the explicitly selected production scope. Dry-run is the default; conflicting `--apply --dry-run` fails. Missing credentials fail rather than report a clean backfill. An unresolved case or lookup/apply failure returns a nonzero status and appears in the manifest.

The tool checks all necessary invoice-item pages, including attached and pending items. It caps a scan at 100 pages and reports an incomplete scan instead of inferring absence. Stripe's listing API does not offer an idempotency-key filter. See [invoice-item listing parameters](https://docs.stripe.com/api/invoiceitems/list).

Apply compares the revision observed before the provider scan, validates item facts, and refuses active leases or concurrent changes. If the revision moved, inspect fresh state and rerun the read-only scan. No code path resets a key or turns an empty search into permission to create another item.

## Monitoring and operator decisions

The existing operational-alert scanner now includes recovery holds, expired submitted leases, long-running uncertainty, and unclosed periods over three hours old without a recent close for that account. It preserves webhook, billing-event, SMS, dispute, and cron categories and their delivery path. A `nothing_owed`, `already_closed`, or deferred result is not by itself a starvation incident.

- Verified matching provider item: link the existing item through reconciliation.
- Duplicate or mismatched item: retain the hold and investigate both provider and local evidence. Do not select the first match.
- No match after the retry deadline: retain the hold. A listing's absence is not proof the original operation never occurred.
- Missing customer before the first attempt: repair customer configuration and use a separately reviewed operator resolution. This release does not automatically reopen terminal failures.
- Unfinished usage or late changes after close: inspect the underlying text/voice task and original authorization. Finalize pending work or record a deliberate adjustment; do not edit the immutable snapshot.

Stop rollout for duplicate items, changed request identity, a provider create outside the retry window, stale-token mutations, unaccounted completion uncertainty, scope mismatch, or persistent backlog without progress.

## Rollback

Disable settlement dispatch, drain or fence in-flight work, and reconcile provider outcomes. Keep the additive evidence, fixed deadlines, holds, and database guards. Do not reset settlements to `closed`, overwrite their keys, erase evidence, or restore the unsafe reaper. An older worker cannot claim under this migration; use a compatible worker fix rather than removing the guard to restore traffic.

## Verification

```text
npm test
npm run typecheck
npm run lint
npm run build
npm run test:overage-reconciliation
npm run test:pg17:overage-settlement
```

The PG17 harness requires `embedded-postgres` and the matching platform native package; the local verification used `17.10.0-beta.17`. It exits nonzero if it cannot run. `test:pg17:overage-reaper` aliases the same harness, so it is not independent coverage.

The optional real Stripe rehearsal uses only a test key and a disposable test customer; it voids/deletes its invoice and deletes its customer afterward. With PowerShell:

```powershell
$env:LGQ_OVERAGE_STRIPE_REHEARSAL = '1'
$env:LGQ_OVERAGE_STRIPE_TEST_ENV_FILE = 'C:\path\to\controlled-test.env'
npm run test:pg17:overage-settlement
```

The default test suite never enables this network rehearsal. The fake-provider worker test explicitly expires its idempotency cache; application code must prevent a second create after the deadline.
