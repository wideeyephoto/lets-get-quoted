# Live payments and add-on lifecycle verification — September 9, 2026

The live LGQ refund-engine requirement is verified. The add-on implementation
and both migrations are deployed, and the enabled refund worker has completed a
successful scheduled production run. Paid lifecycle acceptance remains open:
no new live charge or refund has been made by this task.

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
| Full local suite | 14,392 tests / 1,121 files passed; mocked provider boundaries, no real charge |
| Six-SKU negative matrix | 24/24 passed; initial unpaid/failure/expiry, unsettled success retry, recovered success and stale failure |
| Final combined CI | 14,554 tests / 1,127 files, typecheck, lint, security audit, SEO, stock and production build passed on `7ec1ab6fd`; [run 34407268408](https://github.com/wideeyephoto/lets-get-quoted/actions/runs/34407268408) completed September 9 at 21:39 UTC |
| Disposable PostgreSQL 17 | 44/44 passed in each LF/CRLF direction; all six refund SKUs, cumulative rounding, used/held debt, future grants, refund before fulfillment, lease expiry/reclaim, base-plan-change attribution, event identity conflicts, test/live separation, browser-role denial, exact paid Voice invoice grants and mixed-line-ending migration regression |
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

Pre-charge inspection found that the Solo workspace's existing allowance would
swallow a new purchase's minutes under the legacy overlap guard. The capacity
worker now proves the paid invoice and settled charge before granting an invoice
lot. The base-plan worker excludes real checkout capacity from its own grant;
refunds use exact invoice attribution. The rollout migration stops if an active
paid Voice subscription already needs legacy reconciliation. Production inspection
found only the existing manual canary, with no active paid Voice subscriptions.
Eighteen provider checks and fifteen additional PostgreSQL checks cover this fix.

- Both migrations were applied after explicit production approval. All four
  refund tables have RLS enabled and deny browser-role reads. The paid Voice RPC
  denies execution to `anon` and `authenticated` and allows `service_role`.
  [PR #56](https://github.com/wideeyephoto/lets-get-quoted/pull/56) was merged as
  `399e95a44f481a122aad5d6f399daae71199ee3c`; that exact revision was built and
  promoted to `app.letsgetquoted.com` with refund reconciliation enabled.
- The existing platform top-up webhook now subscribes to `charge.refunded`,
  `refund.created`, `refund.failed` and `refund.updated`, in addition to its four
  checkout events. The endpoint and signing secret were preserved. The scheduled
  refund worker completed at 21:55:12 UTC with zero failures and zero jobs
  claimed. Its unauthenticated endpoint returned HTTP 401. This proves worker
  activation, not processing of a new paid add-on refund.
- Brett authorized the designated payer with a **$248 total spending cap** in this
  task. The designated workspace is currently on Flex. Its eligible
  subset is AI Voice Flex ($69), the minute pack ($35), and storage ($15): **$119**
  before tax. This does not establish eligibility for Solo/Growth Voice or office
  seats. Do not change production entitlements to make a test eligible.
- The user also approved existing eligible Solo and Growth workspaces; their exact
  identities are retained in the private execution record. Reconcile purchases, usable benefits,
  partial/full refunds and cancellation. Never count the six sandbox purchases as
  live settlement. No part of the $248 cap has been spent by this task.
- Natural renewal and effective end-of-period cancellation require the actual
  billing period to elapse and any additional charges to remain within approved
  spending. Test clocks prove sandbox behavior only. Initial failed-payment and
  plan-change results above are local/database evidence; remaining provider and
  customer journeys stay open until executed.

The voice exhaustion-enforcement policy is unchanged. The payer completed the
normal magic-link sign-in flow. Five checkouts are prepared and unpaid: the $35
minute pack, $69 Flex Voice, $59 Solo Voice, $15 storage and $15 office seat.
Growth Voice ($55) remains to be prepared. The user selected Link CLI for payment;
the connection must match the designated payer before any spend request is made.
The workspace selector uses the account's business name while the dashboard uses
its different website company name; both were verified against the same account
number and database identity before preparing checkout.

Public release status: the user approved publication of the additional paid
Voice fix and sanitized evidence. PR #56 includes the current main Voice and
security releases. Combined revision `25367d26e` passed all CI checks and its
Vercel preview build. Production migration then stopped at a source-contract
guard because the existing refund function retained CRLF while the new patch
used LF; the transaction rolled back, including the new grant function.
The correction normalizes line endings on both sides while preserving the guards.
The PostgreSQL harness reproduces this exact failure and checks both directions
of mixed LF/CRLF deployment history (44 checks each). An existing runtime can be
selected with `LGQ_PG_RUNTIME_ROOT`; use `--migration-crlf` for the reverse case.
The corrected migration subsequently applied successfully under explicit approval,
followed by merge, deployment, webhook subscription changes and worker activation.
No paid add-on lifecycle result is inferred from these release checks.
