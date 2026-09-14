# Customer email ten-step execution record

Objective: complete all ten agreed steps, commit verified work along the way,
then push when finished. This record supplements the M1–M6 rollout plan; it does
not replace any requirement with a smaller target. Hosted acceptance and the
controlled canary require actual environment and receiver evidence.

| Step | Requirement | Status | Evidence needed to close |
| --- | --- | --- | --- |
| 1 | Complete website-notice snapshots | Implemented locally; verification below | Immutable recipient/content/link/sender snapshots before submission; failure and mutation tests |
| 2 | Provider identity and deduplication keys | Implemented locally; verification below | Saved credential fingerprint and stable per-notice key; actual request-boundary proof; hosted scope verified in step 9 |
| 3 | Signed website callback recovery | Implemented locally; verification below | Saved binding checks, lost-acceptance repair, monotonic outcomes and callback/worker race tests without resend |
| 4 | Remaining domain/owner notices | In progress: restoration implemented locally; other owner events remain | Inventoried source events and recipients; defined restoration behavior; every intended event has durable identity |
| 5 | Appointment/booking/selection reminders | Open | Durable scheduled occurrences and obsolete-event cancellation, including concurrent and repeated triggers |
| 6 | Campaign/review/rebook messages | Open | Durable recipient occurrences, audience-rerun deduplication, correct opt-out policy |
| 7 | Remaining email families | Open | Digests/support/merchandise/auth/report inventory closed with durable identities and token/report preservation |
| 8 | Operator recovery controls | Open | Authorized detail/closeout and deliberate-resend flows; state, tenancy and duplicate-request verification |
| 9 | Hosted release and acceptance | Open | Environment/provider/capacity/retention evidence; applied migrations; inbox, suppression, failure and rollback acceptance |
| 10 | Controlled canary and expansion review | Open | Required clean scheduled runs, alert receipt, responder/backup and reviewed expansion decision |

Push remains pending until the agreed work is finished. An existing historical
canary check or prior release is not proof for this release.

## September 14 — website snapshots and keys

Prepared migration `20260914173129_website_domain_notice_snapshots.sql` adds one
immutable snapshot per connection notice. It requires the saved owner recipient,
workspace and current claim, plus the unchanged site's domain/verification event.
It freezes the rendered message, credential fingerprint and
`website-domain-connected:v1:<notice UUID>` key. Current delivery blocks are
checked again after persistence. No retry was enabled.

Observed local verification:

- Four selected application files: **47 tests passed** (`custom-domain-reconciler`, `custom-domain-connected-email`, `domain-failure-email-transport`, `email-required-workspace`).
- `node scripts/verify-email-domain-failure-notices.mjs`: **48/48 checks passed**, using actual migrations on disposable PostgreSQL 17. Includes six new website snapshot groups and the previous 42 checks.
- Local Supabase security advisor: **No issues found**.
- Changed-file lint and sender-registry tests: passed; all **21** reviewed transport signatures still match.
- Full application/test type checking completed with exit 0 and no diagnostics.

The request-boundary tests use the installed SDK with offline HTTP responses,
and compare saved content to the submitted body and actual idempotency header.
Hosted scope, receiver delivery and canary results remain unverified for this change.

## September 14 — website signed callback recovery

Steps 1–2 committed as 84ccbad1f. Step 3 adds migration
20260914173622_website_domain_notice_callbacks.sql and signed webhook binding.
Callbacks match the saved notice, workspace, single recipient and provider ID
before event history or suppression changes. Early callbacks repair acceptance;
late acknowledgements/timeouts cannot overwrite them. Stronger negative evidence
wins out of order. Explicit operator closeout survives while evidence is retained.
Missing/unprepared notices are quarantined without assigning recipient effects.
No callback triggers another send.

Verification: **97 application tests**, **57/57 actual PostgreSQL 17 checks**,
changed-file lint and full application/test type checking passed. The local
Supabase security advisor reported **No issues found**. PostgreSQL checks cover
concurrent callback/completion, provider collisions, tenant/recipient mismatch,
expired observation, immutable snapshots and operator closeout. Worker tests
cover early delivery followed by acknowledgement or timeout and a second run.
Hosted acceptance and canary evidence remain open. Step 4 is next.

## September 14 — restoration notices and remaining owner inventory

Step 3 committed as a959c44f7. Restoration now has an atomic source event,
private immutable snapshot, current recipient/provider key, one-attempt worker
and signed callback repair. See the [restoration runbook](runbooks/email-domain-restoration-notices.md).
The domain reconciler processes both queues even without management credentials,
and a failure reading one queue does not hide the other. Interactive verification
and scheduled reconciliation fence status/provider changes to preserve the
winning recovery timestamp.

Observed local verification: **153 application tests**, **75/75 PostgreSQL 17
checks**, changed-file lint, **10 registry tests** and the local security advisor
passed. Provider receiver/region/capacity evidence remains unverified.

Step 4 remains open: the source scan found generic contractor alerts for client
questions/changes, payments/disputes, scheduling, warranty, margin, review and
subcontractor events; quote/invoice/payment/review confirmation wrappers; lead
notifications from public leads, marketplace and booking; and messaging
application submission/status notices. These need source identities and saved
payloads too. They must not be described as protected merely because domain
notices are done. Digests/support are also tracked in step 7 and booking/reminder
notifications in step 5; overlap does not remove their acceptance requirement.

Full application/test type checking completed successfully with no diagnostics after the final application changes.

## September 14 — shared owner-event queue, first source migration

Restoration committed as 639a2e877. Added a shared owner-event ledger with atomic
source creation, immutable source/message snapshots, one-winner claims and signed
callback repair. Client questions and follow-up/more-work requests now dispatch
their saved event ID, so a request interruption cannot lose the pending notice.
A bounded, authenticated five-minute pickup route is configured locally and
background sending defaults disabled. See the [owner-event runbook](runbooks/owner-event-notices.md).

Observed verification: **192 application tests**, **93/93 PostgreSQL 17 checks**,
**10 sender-registry tests**, changed-file lint and a clean local security advisor.
No hosted migration, email, environment change, deployment or canary expansion.

Step 4 remains in progress. Dispatch deduplication now covers each migrated feed
event, but repeated HTTP submissions creating separate feed rows still need an
explicit request identity. Remaining owner alert callers and families are not
silently counted as migrated. The full ten-step goal and final push stay open.

Full application/test type checking completed with exit 0 and no diagnostics for the owner-event implementation.

## September 14 — request IDs for migrated customer requests

Owner event foundation committed as 31db0be62. Question and follow-up forms now
carry stable request IDs through their actions. A private request receipt binds
content and atomically commits with its feed event and owner notice. Concurrent
or delayed identical submissions reuse the result; changed content is rejected.
Deletion retains a replay tombstone. Attachment paths and quote-question SMS keys
are stable across retries. See the [updated owner-event runbook](runbooks/owner-event-notices.md).

Verification: **50 application tests**, **99 PostgreSQL checks**, full type checking
and local security advisor passed. Changed-file lint reports no errors and the
same existing unused-variable/import warnings. The form is exercised in a rendered
DOM, including uncertain response, retry and explicit new request.

Step 4 remains open for the remaining owner alert/confirmation, lead and messaging
application families. The full ten-step goal, hosted acceptance and final push
remain open. No live changes were made.
