# Billing rehearsal cleanup: production verification

Verified 9 September 2026 at 18:52 UTC.

The historical classification cleanup is live. Source and webhook-routing provenance remains a separate, open configuration review; a 24-hour observation has not yet elapsed.

## Released revision

- PR: https://github.com/wideeyephoto/lets-get-quoted/pull/51 (merged).
- Production commit: `f3da55d850bb86e6cfe425d3f0ad4b15d82567de`.
- Vercel deployment: `dpl_5SPfZsjZ8iMFCEMfRiB2ihkno9RV`, READY.
- Explicit promotion completed successfully. Both `app.letsgetquoted.com` and `letsgetquoted.com` resolve to this deployment. The initial Git deployment had updated scheduled jobs while the custom domains still served the previous revision; explicit promotion completed that release step.
- Production database migration: `20260909182123_billing_event_operational_reviews`.

## Observed production result

- The signed-in billing dashboard displays 205 subscription receipts, 18 applied, 185 non-live reviews, one actionable unresolved event, and one actionable failure.
- The dashboard explains the outstanding configuration review and shows "Targeted recovery only". The broad subscription requeue button is absent.
- Database verification confirms one open billing finding, one open billing-configuration case covering the 185 receipts, and four unrelated SMS findings.
- The append-only review ledger contains exactly 185 original failed snapshots and 185 links to the original sent digest.
- The existing live `provider_object_contract_mismatch` failure remains actionable. The cleanup did not retry or project it.
- A concurrent release had already transitioned the historical source rows to ignored. The review batch retained both the original failed snapshots and the observed post-transition state; it did not claim those original source rows were unchanged.
- Scheduled subscription-projector runs at 18:45:29 and 18:50:29 UTC passed with zero failures and the new `non_live_mode_rejections` field. These empty runs verify deployment and reporting; fixture tests cover actual rejection behavior.
- The operational-alerts run at 18:50:13 UTC passed, retaining six active findings with no new delivery queued.
- Both domains' public health endpoints returned HTTP 200. An unauthenticated subscription-projector request returned HTTP 401.
- No error/fatal runtime logs were returned for the released deployment between 18:43 and 18:52 UTC. This is an initial release check, not a full-day health claim.

## Validation

- Final PR-head CI passed: 1,115 test files and 14,300 tests, plus security audit, SEO/stock checks, typecheck, lint, and build. Workflow run `34389521115`, job `102594100918`, tested head `4ef8e8494f3ddf1ca0779b3cd43a8a3a62739c2a`.
- Twenty-one disposable-Postgres checks passed using the captured production projection constraints and immutable-event trigger, including exact manifests, claim ownership, live-event protection, audit rollback, privileges, reopening, drift, and serialization.

## Remaining separate work

- Operations owner Brett must verify the original source and webhook destination routing before closing the configuration case. Historical noise cleanup and source-routing closure have distinct completion states.
- A full 24-hour observation remains outstanding.
- MFA PR https://github.com/wideeyephoto/lets-get-quoted/pull/47 is still draft, unmerged, and conflicted as of this verification. Its 2FA fix is not included in the billing release.
