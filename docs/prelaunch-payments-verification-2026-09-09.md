# Live payments and add-on lifecycle verification — September 9, 2026

The live LGQ refund-engine requirement is verified. The entire paid add-on gate
remains open until the reviewed code is deployed and the live lifecycle runs.
No new charge, refund, production migration, or deployment was made in this task.

## Live connected refund

The [provider and application evidence](evidence/live-connected-refund-2026-09-09.json)
reconciles the September 7 programmatic LGQ refund of **$1.00** from the
**$150.00** test payment. On September 9, the authenticated Stripe UI
showed request (identifier retained privately), HTTP 200, live mode, both
`reverse_transfer=true` and `refund_application_fee=true`, and the exact
`refund_<payment-id>_0_100` idempotency key used by `refundPayment()`.

Stripe refund (identifier retained privately) succeeded and names transfer reversal
(identifier retained privately). The linked transfer shows **$1.00 reversed**.
The linked application fee shows **$0.01 refunded** from **$0.75**. The production
payment row and LGQ admin page show the same refunded amounts, $149.00 remaining
refundable, and $0.74 retained platform fee. The append-only admin action records
the programmatic rehearsal at the matching time.

This supersedes claims that only a Stripe-dashboard refund has ever run.
It is not evidence that a human clicked LGQ's refund form. The current form and
ledger presentation were inspected without submitting another refund. Local
legacy-refund tests cover the compare-and-set guard, concurrent/stale webhook
updates and direct-charge rejection; historical SQL statement execution was not
captured. A full refund, refund SMS and other refund call sites are separate gates.

## Code and repeatable verification

Integrated the relevant pending work from PR #33 into the current source baseline
`8a7b129ac`: add-on refund receipts/worker, benefit reversal and future-minute debt,
immediate cancellation after a full recurring refund, and item-level Stripe
renewal dates. Both the operational-alert and add-on-refund schedules are retained.

New negative tests exposed two unpaid-fulfillment cases across all six SKUs:
`no_payment_required` sessions and asynchronous-success receipts whose freshly
retrieved session is still unpaid. **12 tests failed before the correction.**
Only `payment_status=paid` now authorizes benefits. A contradictory async-success
read retries with backoff so the final success receipt is not discarded.

The add-on checkout panel explains proportional benefit removal, future-grant
offsets for used/reserved refunded minutes, immediate full-refund cancellation,
and preservation of files and memberships. This explanation is gated by the
refund rollout flag. The checkout return URL no longer asserts that payment was
received solely because the browser has a success query parameter.

| Check | Result and boundary |
| --- | --- |
| Full local suite | 14,374 tests / 1,120 files passed; mocked provider boundaries, no real charge |
| Six-SKU negative matrix | 24/24 passed; initial unpaid/failure/expiry, unsettled success retry, recovered success and stale failure |
| Disposable PostgreSQL 17 | 28/28 passed; all six refund SKUs, cumulative rounding, used/held debt, future grants, refund before fulfillment, lease expiry/reclaim, base-plan-change attribution, event identity conflicts, test/live separation and browser-role denial |
| Typecheck, lint and production build | Passed; lint retains existing repository warnings |
| Browser presentation | Real checkout component and dashboard stylesheet rendered on an isolated local review route; refund/debt explanation and return message readable, controls hydrated. Existing `useFormState` deprecation warning observed; no claim of a warning-free console. Temporary route removed before commit. |
| Existing September 8 staging evidence | Six actual sandbox purchases, five recurring renewal/failure/recovery/cancellation paths, actual partial/full refunds and reverse-order duplicate delivery are retained from the earlier execution register |

The database regression installs the real capacity, lifecycle, voice-SKU
constraints and refund migration in a disposable database. It uses explicit
purchase/allowance fixtures; it does not claim a paid base-plan upgrade or a
natural renewal. Existing provider journals remain outside the repository.

Commands: `npm test`, `npm run test:pg17:addon-refunds`, `npm run typecheck`,
`npm run lint`, and `npm run build`. Dated local logs are under
`C:/dev/prelaunch-payments-*.log` and `C:/dev/prelaunch-addon-*.log`.

## Remaining live work

- Production catalog inspection returned **null** for `addon_refund_jobs`,
  `addon_refund_reversals` and `apply_addon_refund(uuid,uuid,jsonb)` on September 9.
  Deploy the [refund migration and ordered rollout](addon-refund-reversal.md),
  verify the actual deployed revision, configure refund events on the correct
  platform top-up webhook, and enable the refund worker before new live proof.
- Brett authorized the designated payer with a **$248 total spending cap** in this
  task. The designated workspace is currently on Flex. Its eligible
  subset is AI Voice Flex ($69), the minute pack ($35), and storage ($15): **$119**
  before tax. This does not establish eligibility for Solo/Growth Voice or office
  seats. Do not change production entitlements to make a test eligible.
- Designate existing eligible Solo and Growth workspaces or budget the additional
  base-plan purchases separately. Reconcile all live purchases, usable benefits,
  partial/full refunds and cancellation. Never count the six sandbox purchases as
  live settlement. No part of the $248 cap has been spent by this task.
- Natural renewal and effective end-of-period cancellation require the actual
  billing period to elapse and any additional charges to remain within approved
  spending. Test clocks prove sandbox behavior only. Initial failed-payment and
  plan-change results above are local/database evidence; remaining provider and
  customer journeys stay open until executed.

The voice exhaustion-enforcement policy is unchanged. No new messages were sent.
