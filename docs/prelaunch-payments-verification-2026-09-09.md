# Live payments and add-on lifecycle verification — September 9, 2026

The live LGQ refund-engine requirement is verified. All six initial live add-on
purchases succeeded for exactly **$248**, the authorized gross spending cap, and
all $248 is fully refunded. Usable benefits and proportional half/full reversals
were verified for every SKU. All five recurring subscriptions are canceled and
all six refund jobs are complete with no remaining debt. A real duplicate delivery
exposed a receipt identity bug; the production correction and successful live
duplicate/stale replays are verified. See the [sanitized execution evidence](evidence/live-addon-lifecycle-2026-09-09.json).
Natural paid renewals and effective period-end cancellation remain open.

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
| Disposable PostgreSQL 17 | 47/47 passed in each LF/CRLF direction; all six refund SKUs, cumulative rounding, used/held debt, future grants, refund before fulfillment, lease expiry/reclaim, base-plan-change attribution, event/charge identity conflicts, harmless delivery variations in pending/processing/completed jobs, test/live separation, browser-role denial, exact paid Voice invoice grants and mixed-line-ending migration regression |
| Replay fix boundary checks | 26 add-on refund tests and 19 top-up webhook route tests passed; the new database case first failed against the old function with `refund_event_identity_conflict` |
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

## Production rollout and authorization

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
  claimed. Its unauthenticated endpoint returned HTTP 401. Subsequent scheduled
  runs processed actual paid add-on refunds, as recorded below.
- The user authorized the designated payer with a **$248 total spending cap** in this
  task. The designated workspace is currently on Flex. Its eligible
  subset is AI Voice Flex ($69), the minute pack ($35), and storage ($15): **$119**
  before tax. This does not establish eligibility for Solo/Growth Voice or office
  seats. Do not change production entitlements to make a test eligible.
- The user also approved existing eligible Solo and Growth workspaces; their exact
  identities are retained in the private execution record. Reconcile purchases, usable benefits,
  partial/full refunds and cancellation. Never count the six sandbox purchases as
  live settlement. All **$248** of the gross cap is now spent; refunds do not
  replenish that cap. No additional purchase or renewal charge is authorized.
- Natural renewal and effective end-of-period cancellation require the actual
  billing period to elapse and any additional charges to remain within approved
  spending. Test clocks prove sandbox behavior only. Initial failed-payment and
  plan-change results above are local/database evidence; remaining provider and
  customer journeys stay open until executed.

The voice exhaustion-enforcement policy is unchanged. The payer completed the
normal magic-link sign-in flow. All six existing application checkouts are paid:
the $35 minute pack, $69 Flex Voice, $59 Solo Voice, $15 storage, $15 office seat
and $55 Growth Voice. Growth completed through hosted Link outside the agent's
final-payment-click sequence. The other five used approved Link CLI one-time
cards for the designated payer. Expired approval requests did not create extra
checkout charges. The user explicitly approved the creation of the remaining
monthly subscriptions, cancellation before renewal, and each two-stage refund.
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

## September 9 live execution

The authenticated Stripe transaction list confirms exactly six successful
initial charges totaling $248. Signed checkout receipts identify the intended
Flex, Solo and Growth workspaces, and the production projector processed all
six purchases. Provider identifiers, payer details and card credentials are
excluded from this public record and retained only in the private execution
register.

These add-on refunds were initiated in the authenticated Stripe dashboard.
Signed platform webhook receipts and LGQ's scheduled refund worker performed
benefit reversal and full-refund subscription cancellation. The separate
connected-charge evidence above proves refund initiation through the LGQ engine.

| Add-on | Paid | Initial benefit | Refund verification |
| --- | ---: | --- | --- |
| Growth Voice | $55 | 200 usable minutes in its own paid-invoice lot; September 9–October 9 period | $27.50 removed 100 minutes; the second $27.50 removed the remaining 100 and immediately canceled the add-on |
| 100-minute pack | $35 | 100 usable minutes granted once | $17.50 removed 50 minutes; the second $17.50 removed the remaining 50 |
| Flex Voice | $69 | 100 usable minutes in its own paid-invoice lot | $34.50 removed 50 minutes; the second $34.50 removed the remaining 50 and immediately canceled the add-on |
| Solo Voice | $59 | 100 usable minutes in a separate paid-invoice lot despite the existing manual allowance | $29.50 removed exactly 50 minutes; the second $29.50 removed the remaining 50 and canceled the add-on without revoking the manual allowance |
| Storage | $15 | 100 GB confirmed by the effective-capacity function | $7.50 removed 50 GB after period reconciliation; the second $7.50 removed the remaining 50 GB and canceled the add-on |
| Office seat | $15 | One seat confirmed by the effective-capacity function | $7.50 correctly retained one seat because reversal units round down; the second $7.50 removed the seat and canceled the add-on |

Growth renewal cancellation was submitted through LGQ's **Cancel renewal**
control and confirmed in Stripe for October 9, with all 200 paid minutes still
available. Its later full refund canceled immediately through LGQ's refund
worker. The other four recurring add-ons had period-end cancellation confirmed
in Stripe before further cleanup. All five subsequently reached Canceled in
Stripe and LGQ following full refunds. This proves scheduling and immediate
full-refund cancellation; no natural month-end transition is claimed.

The paid Voice grant worker runs hourly at minute 37; the top-up projector and
refund worker run every five minutes. Growth's scheduled grant completed at
22:37 UTC, its half reversal at 22:50 UTC, and its full reversal/cancellation at
22:55 UTC. A manual capacity-run attempt stopped at a browser confirmation
dialog; it is not counted as a successful worker invocation. Flex and Solo's
invoice lots appeared in the scheduled 23:37 UTC run. Storage's refund ledger
recorded its half reversal at 23:30 UTC, but effective capacity remained 100 GB
until that hourly run populated the subscription period; it then read 50 GB.
Initial usable Voice fulfillment and this capacity adjustment therefore depend
on the hourly reconciliation cadence. Five-minute receipt processing alone is
not proof that every effective benefit has already changed.

The final production audit at **23:55:42 UTC** found all six refund jobs complete,
all six cumulative refunded amounts equal to their original charges, no job
errors and zero remaining refund debt. The four paid minute lots totaled **500
granted and 500 revoked**, with zero consumed/reserved. Storage and office add-on
capacity both read zero. Solo's unrelated manual allowance remained at 100
granted, 57 consumed, zero reserved and **zero revoked** (43 available); its
separate 100-unit capacity record was preserved. These tests did not consume
paid minutes or create/delete files or memberships. Used/reserved-minute debt
and preservation behavior beyond these records remain local/database coverage.
Stripe reports some same-day refunds as reversals; bank-statement settlement
was not inspected. No renewal charge was made or authorized.

## Real duplicate delivery regression and recovery

Resending the already completed Growth full-refund event through Stripe to the
existing platform top-up endpoint returned HTTP 500 at 23:23:31, 23:23:46 and
23:25:21 UTC. The completed job and 200-minute reversal stayed intact. The SQL
receipt function compared the entire raw-body hash as part of event identity,
so a legitimate replay with a different signed body was rejected.

The new regression reproduces the failure by varying delivery metadata and JSON
formatting. Stripe documents `pending_webhooks` as a delivery count on the
[event object](https://docs.stripe.com/api/events/object) and recommends tracking
processed event IDs for [duplicate deliveries](https://docs.stripe.com/webhooks).
The exact byte difference in the live resend was not captured.

Applied `20260909233336_addon_refund_delivery_identity.sql` to production at
23:44 UTC. It preserves the first payload hash for audit while binding duplicates
to the verified event, live/test mode and charge. A changed charge still raises
an identity conflict; duplicate receipts cannot enqueue work or change an active
lease. The webhook still verifies the signature, platform scope and mode, and
the worker independently retrieves Stripe's current charge/refunds and validates
purchase attribution before changing benefits. Production function privileges
remain service-role only.

The same real event returned **HTTP 200 at 23:45:59 UTC** after the correction.
Stripe's refreshed delivery history confirms the response. Before and after:
four receipts, completed job revision four, two attempts, no error, 200 minutes
granted and 200 revoked, with zero consumed or reserved. The original delivery
hash remains retained; the resend caused no additional refund or benefit change.

Replayed the earlier Growth half-refund event after the full refund as an
ordering check. Stripe confirmed **HTTP 200 at 23:54:19 UTC**. The final database
audit retained the same four receipts, completed job revision four/two attempts
and all 200 minutes revoked. The stale delivery did not restore benefits.
