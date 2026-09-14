# Customer email ten-step execution record

Objective: complete all ten agreed steps, commit verified work along the way,
then push when finished. This record supplements the M1–M6 rollout plan; it does
not replace any requirement with a smaller target. Hosted acceptance and the
controlled canary require actual environment and receiver evidence.

| Step | Requirement | Status | Evidence needed to close |
| --- | --- | --- | --- |
| 1 | Complete website-notice snapshots | Implemented locally; verification below | Immutable recipient/content/link/sender snapshots before submission; failure and mutation tests |
| 2 | Provider identity and deduplication keys | Implemented locally; verification below | Saved credential fingerprint and stable per-notice key; actual request-boundary proof; hosted scope verified in step 9 |
| 3 | Signed website callback recovery | Next | Saved binding checks, lost-acceptance repair, monotonic outcomes and callback/worker race tests without resend |
| 4 | Remaining domain/owner notices | Open | Inventoried source events and recipients; defined restoration behavior; every intended event has durable identity |
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
