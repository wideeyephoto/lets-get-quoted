# Quick Stop lifecycle and payment hardening

## Scope

Implement the confirmed findings from the Quick Stop review and the missing earliest no-show reporting boundary. Preserve the contractor's ability to negotiate a future date outside the customer's request horizon. Work is isolated on `codex/quick-stop-hardening-20260914`; delivery is a tested local commit, with database rollout instructions rather than changes to the live service.

## Implementation plan

1. Convert stored arrival dates/times using the account's IANA timezone. Share window eligibility between the customer page, actions, refund policy, and completion sweep. Validate dates and daylight-saving edge cases.
2. Require a paid, scheduled, unarrived visit before accepting a customer no-show, and accept reports only from the window end through the two-hour deadline. Protect decisions against concurrent arrival/completion.
3. Reconcile the lifecycle transition table with intentional expiry, completion, cancellation, refund, and staff dispute resolution. Enforce allowed transitions with atomic source-state checks; reject ineligible or repeated sanctions.
4. Reserve day capacity atomically in PostgreSQL, saving the arrival date at reservation time. Test concurrent requests for the last slot.
5. Validate offer and revised-window times in the account timezone. Reject elapsed/invalid windows while retaining negotiated future dates.
6. Commit offer construction in one database transaction, so a job/payment failure rolls back the whole reservation. Recover unpaid offers stranded by the previous implementation and disable their linked unpaid artifacts.
7. Persist refund intent atomically with cancellation. Keep the visit canceled while repayment is pending, reconcile uncertain provider results, retry safely, and communicate whether repayment is pending or confirmed.
8. Recover settled payments for all appropriate nonfulfillable states in both payment handling paths. Preserve idempotency and account/payment ownership checks.
9. Bound sweep work with ordered batches of eligible rows and a time budget, include stranded offers and refund recovery, and prevent skipped rows from starving later candidates.
10. Run focused lifecycle/payment/timezone tests, actual local PostgreSQL concurrency and migration checks, TypeScript and lint checks. Review the integrated diff, document results and rollout dependencies, then commit only this work.

## Acceptance cases

- A Los Angeles afternoon visit cannot auto-complete or lose its no-show reporting window in the morning on a UTC server.
- Reporting before the visit window ends, after the deadline, after arrival, or for an unpaid/terminal request has no refund or sanction side effects.
- Concurrent last-slot reservations admit at most one request.
- A failure during job/payment creation eventually releases the reservation and disables associated unpaid artifacts without reviving an expired request.
- Stripe rejection, provider success followed by a local error, retries, and duplicate settlement events cannot lose refund intent or create an extra refund.
- Payment settling after customer/contractor cancellation is recovered without creating an appointment.
- Sweep pagination progresses past ineligible and reported candidates within bounded execution time.

## Verification and delivery

Implementation is complete on the isolated branch named above. The commit containing this document includes the application changes, five incremental migrations, the canonical schema mirror, and regression harnesses.

### Final decisions

- Customer no-show reporting opens at the actual window end and closes two hours later, inclusive. A visit must be paid, scheduled, unarrived, and confirmed or en route. Staff can adjudicate eligible completed/disputed visits after that customer deadline.
- DST gaps are rejected; ambiguous fall-back times consistently use the later occurrence in both JavaScript and PostgreSQL. Invalid account timezones fail closed.
- Offer publication and revised-window acceptance serialize capacity checks per account and arrival date. Negotiated dates may exceed the customer request horizon.
- Cancellation, linked job closure, refund intent, and any no-show enforcement commit together. A failed refund does not reopen the appointment. Sanctions count distinct confirmed requests, including subsequently refunded/disputed requests, and cannot be extended by replay or overwrite a stronger manual lock.
- Refund recovery retains immutable provider operation keys and amount snapshots. Pending provider responses, uncertain old results, manual-refund collisions, and changed refund balances remain pending or require review. Manual refunds retain the appointment until a separate cancellation resolves it.
- The sweep processes at most 25 eligible rows per lifecycle phase and claims refund tasks individually within a provider time budget. Completed rows leave the next batch; ineligible rows do not consume its limit.
- Customer and staff pages distinguish money owed from money confirmed returned. Staff can reconcile uncertain provider status without issuing another refund.

### Verification

- Combined Quick Stop, legacy payment/refund, affected server action, sweep, and disposition suites: 666 tests passed across 40 files, including legacy-worker coexistence regression coverage.
- Local PostgreSQL 17: 11 atomic-offer checks, 13 refund-concurrency checks, 70 timezone/sweep/permission assertions, and 38 no-show-enforcement assertions passed.
- The complete canonical schema executed top-to-bottom in a fresh disposable PostgreSQL 17 database; its existing harness passed all 26 checks. The schema ordering check found no forward foreign-key references.
- Scoped application lint passed with one existing unused-variable warning in the unchanged admin Quick Stop list page.
- Full TypeScript check and final diff whitespace check passed.

### Rollout order

Apply these migrations in order before deploying this application version. Their functions call shared helpers introduced later in the bundle, so finish the whole bundle before exercising new Quick Stop operations. Keep Quick Stop writes and workers paused during the changeover so older application instances cannot publish or cancel against a partially upgraded database.

1. `20260914132411_quick_stop_refund_recovery.sql`
2. `20260914132439_quick_stop_atomic_offer.sql`
3. `20260914132825_quick_stop_atomic_sweep.sql`
4. `20260914133059_quick_stop_lifecycle_guard.sql`
5. `20260914134359_quick_stop_no_show_lock.sql`

The first migration also establishes unique payment bindings and protected event deduplication for installations that never enabled the optional legacy refund worker. It intentionally stops on ambiguous duplicate payment bindings; resolve those records before rollout.

Keep `LGQ_LEGACY_QUICK_STOP_LATE_REFUND_WORKER_ENABLED` disabled during the transition and drain any already-running legacy worker. The new recovery path refuses automatic or manual refund authority while an older task remains unresolved. Existing legacy tasks require reconciliation through their original operation before they can be treated as complete.

After rollout, verify the existing Quick Stop cron runs successfully and that pending/retry records progress to completed or review. Review any `contractor_offer_sent` request with a settled payment; automatic cleanup preserves it because appointment fulfillment is uncertain. Also audit pre-migration canceled/no-show/expired records with paid balances and no durable refund obligation against their payment and event history. Historical refund promises cannot safely be reconstructed from status alone.

No hosted database, deployment, payment provider, or live customer messages were changed during implementation and verification.
