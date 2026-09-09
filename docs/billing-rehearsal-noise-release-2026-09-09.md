# Billing rehearsal noise completion — 9 September 2026

The historical noise cleanup was applied to production at 18:22 UTC. There is now one actionable billing finding and one configuration-review case covering 185 non-live receipts. Source routing/provenance remains open and must not be described as a verified obsolete rehearsal.

## Production data and audit

- Migration: `20260909182123_billing_event_operational_reviews` (repository migration `20260909160000_billing_event_operational_reviews.sql`).
- Review batch key: `billing-rehearsal-review-20260909-v1`. Exactly 185 original manifest rows were validated and reviewed transactionally.
- Original manifest SHA-256 with LF line endings: `77eae020aaab19405971748fdbd86d6fac2dbf31cb31d6aa2668492c9fbe2ecd`.
- A concurrent release changed the 185 source rows from failed to ignored before this completion. This implementation did not reverse those terminal transitions. It retained both the original failed snapshots and the observed post-transition state in an append-only ledger.
- The review transaction compared full source-row hashes before and after and verified that the original billing digest payload was unchanged.
- The live failure remains failed with `provider_object_contract_mismatch`, attempt 1 and no scheduled retry.
- Scanner, queue and review transactions share an advisory lock; scanner time is taken after acquiring it. All four queue eligibility checks exclude resolved findings.
- Reopened reviews and source-state drift restore billing visibility, including ignored receipts. Admin and scanner share the same classification reader.
- The old migration no longer contains an unrestricted historical backfill. Future review batches require complete snapshots and exact matching. A changed same-size batch is not treated as an idempotent retry.

## Runtime and admin behavior

A test receipt is rejected only after the configured mode and Stripe credential agree on live mode. Missing or conflicting runtime configuration remains a failure; live receipts cannot use the test-mode ignore RPC. Valid test-runtime processing remains supported.

The runtime RPC requires a non-live, unbound subscription receipt and an owned, unexpired claim. Its terminal transition and audit record commit together. Failed audit persistence rolls the transition back. Existing source write privileges remain restricted; the two narrowly scoped mutation RPCs retain the repository's service-role-only security-definer pattern.

Billing operations displays actionable failures separately from non-live reviews and explains the outstanding configuration case. Broad subscription requeue is disabled behind the existing authentication check.

## Verification

- 185 targeted tests passed across nine suites covering inbox signatures/deduplication, projection, worker summaries, admin readers and operational monitoring.
- 21 disposable-Postgres checks passed with the captured production projection constraints and immutable-event trigger. Coverage includes manifest drift, batch identity, privileges, recurrence, queue eligibility, live receipts, claim ownership/expiry, atomic audit failure and transaction serialization.
- Typecheck, targeted ESLint and the production build passed. The full build reports existing warnings outside this change.
- Production confirmed 185 reviews, one billing finding and one billing_configuration finding. Four unrelated SMS findings remain.

Application deployment, browser confirmation and subsequent scheduled-cycle evidence are recorded in the task's completion response. A full 24-hour observation cannot be inferred from these initial checks. Operations owner: Brett; verify the original source and webhook destination routing before closing the configuration case.

The separate MFA change in PR #47 is outside this billing release.
