# Financial and Billing Audit Report

This document contains a comprehensive list of fix-it tasks and TODOs uncovered during an audit of the codebase's financial, billing, and checkout logic. The issues focus on floating-point precision loss, race conditions (TOCTOU), and missing defensive validations.

## 🔴 High Priority: Race Conditions & Ledger Integrity

### 1. Checkout Session Race Condition (Double-Charge Risk)
- **Location**: `src/lib/payments.ts` (`createCheckoutSessionForPayment`)
- **Issue**: Missing CAS (Compare-And-Swap) protection on `stripe_checkout_session`. If a user double-clicks "Pay", two separate Stripe Checkout Sessions are created and both update the database record. The second thread overwrites the first thread's session ID in the database. If the user completes the first session, the Stripe webhook will fail to fulfill the payment because the DB expects the second session's ID. The customer is charged, but the system doesn't register the payment.
- **TODO/Fixit**: Implement CAS by adding the previously read `stripe_checkout_session` to the update query filter (e.g., `.eq('stripe_checkout_session', payment.stripe_checkout_session)` or `.is('stripe_checkout_session', null)`).

### 2. Billing Period Resolution TOCTOU
- **Location**: `src/lib/billing/usage-overage.ts` (`tryUsageOverage`)
- **Issue**: A classic read-modify-write race condition. The code fetches `period_start` and `period_end` timestamps from `workspace_entitlements`, then passes them to `admin.rpc('authorize_usage_overage')`. If the entitlement period rolls over between the read and the write operations, the overage gets accrued against the *old* period.
- **TODO/Fixit**: Refactor the logic to dynamically resolve the active period *inside* the `authorize_usage_overage` PostgreSQL RPC. This secures both the lookup and the insert under the same database lock.

### 3. Plan Change Timing Gap Exploitation
- **Location**: `src/lib/billing/plan-change.ts`
- **Issue**: The code uses `stripe.subscriptions.update` with `proration_behavior: 'always_invoice'`. If the invoice collection fails, Stripe leaves the invoice "open", effectively upgrading the plan at Stripe without immediate payment. The app relies on a separate webhook projector to activate features locally.
- **TODO/Fixit**: Ensure robust safeguards exist to prevent a malicious user from repeatedly upgrading plans and failing to pay, exploiting timing gaps between Stripe's state and the local application's feature guards.

## 🟠 Medium Priority: Unbounded Consumption & Missing Guards

### 4. Unbounded SMS Segment Consumption
- **Location**: `src/lib/billing/text-credit-usage.ts` (`beginTextCreditUsage`)
- **Issue**: The number of segments is computed dynamically (`smsSegmentCount(input.body)`) without any upper boundary check. A maliciously or accidentally oversized message payload could result in a massive segment count, instantly wiping out a workspace's entire credit balance or maxing out its overage cap in one shot.
- **TODO/Fixit**: Implement a strict upper limit (e.g., `MAX_SEGMENTS_PER_SEND`) and reject the request immediately if exceeded.

### 5. Missing Negative/Zero Usage Guards
- **Location**: `src/lib/billing/text-credit-usage.ts`
- **Issue**: The dynamically computed segment count is passed directly to the `reserve_usage_credits` RPC. If `smsSegmentCount` returns 0 or a negative number due to an edge case (like an empty string), it could corrupt the ledger balance or cause zero-value lockups.
- **TODO/Fixit**: Add an explicit defensive guard (`if (!Number.isSafeInteger(segments) || segments <= 0)`) before initiating the DB reservation.

### 6. Refund Amount Upper Bound Checks
- **Location**: `src/lib/billing/fee-basis.ts`
- **Issue**: While `Math.max(0, ...)` is generally used correctly to prevent negative bounds, `Number(row.refunded_amount)` must be validated to ensure it cannot arbitrarily exceed `row.amount` during aggregations, which could result in a net-negative balance.
- **TODO/Fixit**: Enforce an explicit check that the aggregated refund amount does not exceed the total payment amount.

## 🟡 Low Priority: Floating Point Precision Smells
JavaScript numbers are IEEE 754 double-precision floats. Operating on dollar amounts using floats instead of integer cents inherently risks precision drift (e.g. `0.1 + 0.2 = 0.30000000000000004`).

### 7. Incorrect Volume Tiering due to Drift
- **Location**: `src/lib/payments.ts` (`sumPaged`)
- **Issue**: `sumPaged` aggregates a contractor's 12-month trailing volume by directly adding dollar floats (`total += Number(row.amount)`). Over hundreds of payments, microscopic drift downward (e.g., calculating `$100,000` as `$99,999.999999`) can push a contractor incorrectly into a lower volume tier, causing them to be charged a higher platform fee.
- **TODO/Fixit**: Accumulate `totalCents += Math.round(Number(row.amount) * 100)` inside the loop, and convert to dollars at the end.

### 8. Subtotal Float Accumulation
- **Location**: `src/lib/invoices.ts` (`computeInvoiceTotals`)
- **Issue**: Accumulates subtotals by adding floats before rounding (`items.reduce((sum, item) => sum + Number(item.amount), 0)`). A sufficiently long invoice can drift before the rounding step.
- **TODO/Fixit**: Accumulate in integer cents and divide by 100 at the end.

### 9. Invoice Paid/Refund Accumulation
- **Location**: `src/lib/invoice-pay.ts` (`paidTowardInvoice`)
- **Issue**: Sums floats across multiple partial-payments and partial-refunds (`sum + (Number(payment.amount) || 0) - (Number(payment.refunded_amount) || 0)`), subject to the same precision drift.
- **TODO/Fixit**: Perform math in integer cents, converting to dollars only before returning.

### 10. Fee Basis Aggregation
- **Location**: `src/lib/billing/fee-basis.ts`
- **Issue**: The `paidBefore` calculation performs floating-point arithmetic (`row.amount - row.refunded_amount`) before calling `toCents()` on the final sum.
- **TODO/Fixit**: Convert each row's values to cents *before* doing any addition or subtraction.

### 11. Percentage Math Smells
- **Location**: `src/lib/billing/payment-fee.ts`
- **Issue**: `discountAdjustedServiceSubtotalCents` applies percentage math using floats. While `Math.round` mitigates issues, floating-point math for percentage calculations can occasionally drift.
- **TODO/Fixit**: Use strictly integer/BigInt math if sub-cent precision is required.

### 12. Email and Receipt Rendering Smells
- **Location**: `src/lib/merchandise/merchandise-emails.ts` and `src/lib/billing/usage-overage.ts`
- **Issue**: Formatting relies on dividing floats (e.g. `millicents / 1000 / 100`) or `.toFixed(2)` on raw JS floats, leading to artifacts or inaccurate displays.
- **TODO/Fixit**: Ensure all calculations maintain integer cents until the absolute last moment before formatting, or use string-based decimal placement for exact currency formatting.

### 13. Unnecessary Data Conversions
- **Location**: `src/lib/quick-stop-payments.ts` (`sendQuickStopOffer`)
- **Issue**: Converts integer cents into a dollar float using `centsToDollars`, only to pass it to `createDepositRequest`, which internally validates and converts it back to cents.
- **TODO/Fixit**: Refactor internal boundaries to strictly accept and pass integer cents rather than converting to and from floats.
