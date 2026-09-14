# Prelaunch implementation session — September 14, 2026

Work window began at 13:40 UTC, with a one-hour target. Work continues on
`codex/prelaunch-closeout-20260914`, draft PR #86, from `c9317ebeb`.

## C2 — SMS destination-country restriction

Added a single destination assertion backed by pinned `libphonenumber-js@1.13.13`
numbering-plan metadata. It requires canonical `+1` E.164 and a possible number
classified as US or Canada. It does not guess US for an unknown area code, and
does not mistake every `+1` country/territory for US/Canada. Shared NANP toll-free
numbers recognized by the metadata remain supported. This is not a reachability,
SMS-capability, ownership or consent assertion.

Both `enqueueSmsDelivery` and the actual `sendProviderMessage` enforce the same
rule. The latter protects direct callers and older queued records before any
credit reservation or carrier request. The worker records an unsupported
destination as a terminal pre-request failure rather than retrying it.

The 12 unsupported-destination regression cases failed against the old queue
boundary and now pass. Five valid controls continue to enqueue unchanged. Cases
include UK, Mexico, Bahamas, Barbados, Bermuda, Jamaica, Dominican Republic,
Puerto Rico, US Virgin Islands, Guam, an unrecognized NANP area, and international
toll-free. Existing direct-send test fixtures now use a reserved subscriber
number in the valid 248 area rather than the unassigned 555 area.

Sources: [maintainer documentation](https://github.com/catamphetamine/libphonenumber-js)
and the npm package integrity recorded in `package-lock.json`.

Verification:

- 155 tests in 6 affected files passed at 13:43 UTC.
- Full unit suite: **1,425 files / 17,060 tests passed**, exit 0, 13:44–13:47 UTC.
  Command: `npm test -- --maxWorkers=4 --minWorkers=1`.
  Raw output: `C:/dev/prelaunch-hour-full-tests-20260914.log`.
- `npm run build`: PASS, exit 0, including compile, type/lint validation and
  433/433 page-generation steps. Existing repository lint warnings remain.
  Raw output: `C:/dev/prelaunch-destination-build-20260914.log`.

Deployment and real carrier acceptance remain open. No hosted database changes,
carrier messages, customer records or financial transactions were performed.

## B1 — Carrier opt-out projection

Migration `20260914134735_sms_carrier_opt_out_projection.sql` was generated with
Supabase CLI 2.117.0 and adds request-time sender scope plus an idempotent receipt
projection. Explicit carrier code `21610` on failed/undelivered statuses updates
the existing sender preference, whose trigger updates the exact provider/Campaign
ledger. All writes occur with the receipt transaction, including reconciliation.
The HTTP route retries the service-only projection and returns 503 on an unavailable
or invalid result; it no longer rewrites legacy account consent using callback time.

The projection preserves a keyword preference newer than the original send and
never re-applies a completed receipt. A reassigned sender or historical event
without a scope snapshot opens critical operator review instead of guessing.
Codes `30003`, `30004`, `30006`, and `30007` retain their existing terminal delivery
handling without being misclassified as an explicit consent withdrawal.

Sources: [SignalWire error codes](https://developer.signalwire.com/compatibility-api/rest/overview/error-codes/)
and [Twilio 21610](https://www.twilio.com/docs/api/errors/21610).

- Focused real PostgreSQL 17 harness: **14/14 passed**; tests atomic rollback,
  sender/Campaign/provider/recipient isolation, historical review, reassignment,
  reconciliation, duplicate/late receipt handling, concurrent START and RPC ACLs.
- Complete schema: **29/29 passed**, including real status ingress and replay.
  The harness now uses the canonical migration order instead of replaying older
  function replacements over newer patches. No production schema was modified.
- Schema digest and creation order both pass. The new focused database harness
  runs in GitHub CI through `test:pg17:sms-carrier-opt-out`.
- Raw outputs: `C:/dev/prelaunch-carrier-pg17-20260914.log` and
  `C:/dev/prelaunch-carrier-schema-pg17-20260914.log`.

Release order: apply the migration, verify function grants/scope capture, then
deploy the route. Historical unbound receipts remain reviewable. Real carrier
acceptance is still open; local database verification does not substitute for it.
An additional full-schema regression proves that operator matching of an old
unbound receipt without sender scope rolls back safely and retains the original
open unmatched-status review. It cannot silently resolve the consent question;
that historical case requires a separate supported recovery decision.

## A1/A2 — Quiet-hour policy and final egress

One category table now documents the existing owner, crew, and verification
exemptions while requiring customer and payment messages to wait for daytime.
The queue evaluates an explicit future timestamp too, rejects invalid dates,
and removes an unused bypass option. It preserves a later permitted schedule.

The worker rechecks before staging, after sender/credit preparation, and again
after the final asynchronous request-marker call. A crossed cutoff triggers
the existing token-bound rollback before safe deferral; an uncertain rollback
goes to quarantine. The provider releases its credit hold before returning the
deferral. No carrier socket opens in either race. This uses the existing recipient
phone/time-zone resolver; it does not add location evidence to a delivery claim.

Tests cover both customer-facing categories, all three exemptions, 9pm/8am,
both daylight-saving transitions, retry after cutoff, both asynchronous cutoff
races, credit release, and uncertain rollback. Production deferred-release and
the existing legal-policy review remain separate acceptance work.

## Validation of B1 and A1/A2 together

- **1,427 test files / 17,090 tests passed**, exit 0 at 14:14 UTC.
  `C:/dev/prelaunch-hour-final-tests-20260914.log`.
- `npm run typecheck`: PASS, including test files.
  `C:/dev/prelaunch-hour-final-typecheck-20260914.log`.
- `npm run build`: PASS, including production page generation; existing lint
  warnings remain. `C:/dev/prelaunch-hour-final-build-20260914.log`.

## Read-only production checks

Live Stripe top-up inspection at approximately 14:12 UTC returned one active
matching price for each of all 12 sellable SKUs, with every contract check passing.
The audit only used price search/retrieve. No purchase, price, subscription, or
tax-registration mutation occurred. Sanitized output is retained in
`docs/prelaunch-live-top-up-prices-2026-09-14.txt`.

At 14:14 UTC, read-only `cron_runs` queries against the configured production
project (`mfuvvtrkipkigwqqtcal`) showed:

| Job | Latest evidence | Disposition |
| --- | --- | --- |
| `db-guard` | `13da3412-4a9f-4152-bc1d-918b229252e6`, 14:10:34 UTC; ten recent runs failed with one error each | Open: `public.get_long_running_queries(min_duration_seconds)` is absent from the API schema cache; repository search finds no definition. |
| `webhook-heal` | `b512d076-3cbd-4a32-affc-a29f4c12ff96`, 14:00:41 UTC; ten recent quarter-hour runs successful | Scheduled execution proven; two unresolved items remain escalated. |
| `smart-dunning` | Last recorded run `c40bc0ca-09ce-4c0f-a75a-f7ed5ab3cd6f`, September 12, 12:00:19 UTC | Intentionally unscheduled and parked by `52a99e69c`; do not reactivate. |
| `activation-autopilot` | No run rows | Intentionally unscheduled and parked by `52a99e69c`; do not reactivate. |

No jobs were invoked and no backlog records were changed. The old four-job
observation item is corrected to reflect the deliberate parking decision.

## Database-guard report correction

A direct read of production `pg_proc` also confirmed that neither
`get_long_running_queries` nor `cancel_backend_query` exists in `public`.
The current worker was reporting `status: healthy` alongside its inspection error.
It now returns warning for inspection errors, invalid data, and unmitigated queries;
unknown active connection counts are null. Cancellation is counted only when the
RPC acknowledges true, while dry runs count no cancellation. The status and audit
describe cancellation requests rather than asserting that pool recovery was measured.
Audit writes are flushed before the worker completes. No production cancellation
or RPC provisioning was performed. The missing database contract and review of its
query-selection/cancellation safeguards remain open prerequisites.

- 15 new guard regressions and 20 adjacent tests passed.
- Final application unit suite: **1,428 files / 17,105 passed**, exit 0.
  `C:/dev/prelaunch-hour-guard-final-tests-20260914.log`.
- Final production build: PASS, exit 0.
  `C:/dev/prelaunch-hour-guard-final-build-20260914.log`.
- Payment late-success/operator-resolution races: **10/10 passed** on isolated
  PostgreSQL 17; no production/staging target is accepted by that harness.
  `C:/dev/prelaunch-late-success-pg17-20260914.log`.
- The schema harness now uses a unique temporary cluster per run to avoid
  reusing/deleting a directory while Windows still holds a prior process handle.
  The final **29/29** run used port 54379 after an earlier test left 54359 occupied.
