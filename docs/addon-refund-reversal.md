# Add-on refund reversal

Successful refunds for the 100-minute pack, three AI Voice tiers, 100 GB storage
and office seats automatically reverse their purchased benefit. Refunding a
recurring payment in full also cancels its Stripe subscription immediately,
without a new invoice or proration. Existing files and memberships are preserved.
This does not issue refunds; it reconciles refunds already issued in Stripe.

## Credit and capacity policy

- Partial refunds remove `floor(purchased units × cumulative refunded / paid)`
  units. Rounding happens on the cumulative total, so split refunds cannot remove
  extra units. A partial refund of one office seat leaves that indivisible seat
  until the payment is fully refunded.
- Voice reversal uses the original purchase lot, or the allowance window
  containing the recurring invoice line's service start. Available units are
  revoked first. Consumed or reserved units become debt against subsequent voice
  grants. Reservations remain intact; releasing a hold can also settle debt.
  Debt offsets have their own ledger and never make a credit lot negative.
- Example: after a 50-minute reversal, consume 25 and hold 15 of a 100-minute
  pack. Refunding the rest revokes the 10 free minutes and creates 40 debt. A new
  30-minute grant offsets 30; releasing the hold offsets the final 10 and leaves
  5 usable minutes. This is an accounting test, not a telephone call.
- Partial storage/seat reductions apply to the refunded service period. A new
  paid period restores subscribed capacity. A full refund of even an older
  payment cancels the subscription, per the selected policy.
- Credit purchase balances continue to use the existing non-expiration policy.
  Refund reversal does not enable voice exhaustion blocking.

## Deployment and operation

1. Apply `20260908175533_addon_refund_reversal_and_future_credit_debt.sql` after
   the existing purchase, capacity lifecycle and voice allowance migrations.
2. Deploy the webhook and worker code with
   `LGQ_ADDON_REFUND_REVERSAL_ENABLED=0` initially. The existing top-up endpoint
   also requires `LGQ_STRIPE_TOP_UP_WEBHOOK_ENABLED=1` and its own signing secret.
3. Add `charge.refunded`, `refund.created`, `refund.updated`, and `refund.failed`
   to the platform `/api/stripe/top-ups/webhook` destination, preserving checkout
   events. Do not reuse another endpoint's signing secret or Connect events.
4. Enable the refund flag for the intended Stripe mode. The authenticated
   `/api/cron/addon-refunds` job runs every five minutes, ten jobs per batch.
   Preview/local testing invokes this route explicitly; Vercel scheduled runs
   happen in production. The worker verifies configured test/live mode.
5. Monitor `addon_refund_jobs` for overdue pending/processing jobs or `review`,
   and cron failures. Review rows contain safe error codes. Do not overwrite
   financial ledger rows to make a check green.

Receipts are signature verified and deduplicated. The worker retrieves current
Stripe state, paginates refunds, and counts only successful refunds. It verifies
the exact payment, checkout, catalog, workspace and durable purchase operation.
New receipts received during a lease remain queued. A failure after the database
reversal retries subscription cancellation without applying another debit.

Unsupported attribution (multiple invoice payments or lines, prorations,
connected charges, unknown refund status, ambiguous grants) enters review rather
than guessing. Missing fulfillment can retry after its projector catches up.
Pending refunds remain queued; failed/canceled refunds add no reversal.

For a pause, disable the flag and retain the destination and all receipts/ledgers;
Stripe retries unsuccessful delivery. Existing recorded debt continues to offset
grants because that policy is enforced in the database. Disabling the flag does
not undo refunds or restore capacity. Resolve any needed compensating adjustment
explicitly, with an audit trail. Never remove debt history as a rollback.

The four new tables follow existing billing retention and account-closure
handling. Browser roles cannot read or mutate them. Service RPCs use invoker
security and narrow additional column privileges. The existing internal capacity
helper retains its original security mode and ACL.

## Verification on 2026-09-08

Staging only; production remains unchanged. Five fresh sandbox subscription
checkouts paid $213 total and granted 400 voice minutes, 100 GB and one office
seat. Each received a successful half refund and then the remainder. All five
worker jobs completed for each phase; full refunds canceled all five actual
Stripe subscriptions and removed their extra capacity. The original $35 sandbox
minute pack passed partial/full refunds, synthetic consumption/reservation and
future-grant debt offsets. These are test-mode amounts, not actual spending.

Local regression passed 13,981 tests across 1,091 files, typecheck and lint.
The portable PostgreSQL regression passed 14/14 checks.

All twelve actual refund receipts replayed in reverse order returned duplicate
acknowledgments. Earlier staging clock tests separately covered successful renewal,
failed renewal, payment recovery, cancellation scheduling/reversal and effective
cancellation. Base-plan periods were synthetic fixtures, not paid base plans.

Run `npm run test:pg17:addon-refunds` for the isolated PostgreSQL regression and
`npx vitest run test/addon-refunds.test.ts` for provider contracts, signature routing
and worker failure behavior. The staging rehearsal additionally covered 28
database cases. Evidence journals and credentials are kept outside the repository.
This evidence does not claim production delivery, real-money settlement, customer
UI debt presentation or full provider-period reconciliation.
