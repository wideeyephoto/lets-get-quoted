# Feature Test Plan — Let's Get Quoted (2026-07-15)

## Quick Start for Testing

### Prerequisites
- Dev server running on port 3010
- Stripe test mode CLI running (`stripe listen`)
- Resend API key configured
- Create a test account (magic link sign-in to /login)

---

## Automated verification (2026-07-16)

`scripts/test-payment-webhook-flow.mjs` fabricates signed Stripe webhook events
and POSTs them at the local dev server to exercise `/api/stripe/webhook`
end-to-end without needing a real browser/Checkout session (auth for the
dashboard isn't scriptable, but the webhook route and the public `/pay`,
`/invoice` routes need no login). Run any time with the dev server up:

```
node scripts/test-payment-webhook-flow.mjs
```

Covers: `checkout.session.completed` (+ duplicate-delivery idempotency),
`checkout.session.expired`, `charge.failed`, `charge.refunded`,
`charge.dispute.created`, and invoice auto-paid linking. This pass found and
fixed two real bugs:
- A duplicate webhook delivery (Stripe explicitly guarantees at-least-once,
  not exactly-once, delivery) used to overwrite `paid_at` with a later
  timestamp on every redelivery.
- Marking a payment paid used to unconditionally overwrite the linked
  invoice's `signed_at` — including stomping a REAL client e-signature
  timestamp/`signer_name` (from the `/invoice/[id]` e-sign flow) with the
  payment-completion time. Fixed: `signed_at` is now only backfilled when the
  invoice was never actually signed.

Not covered by this script (would need a real completed test-mode Checkout
session / browser, since these call OUT to Stripe rather than receive a
webhook): actually creating a Checkout Session, actually calling
`stripe.refunds.create` from the dashboard Refund button, and the
invoice-voided-on-refund side effect (`refundPayment()` in `src/lib/payments.ts`)
which is separate from the webhook's own `charge.refunded` handling.

---

## Test 1: Payment Flow + Platform Fee Display ✅

**File**: `/pay/[id]`

**Steps**:
1. In dashboard → Create a job (e.g., "Test Kitchen Remodel")
2. Create a payment request → "Deposit" → $2,500
3. Copy the payment ID from URL: `/pay/{paymentId}`
4. Open `/pay/{paymentId}` in browser
5. **Verify**: 
   - ✅ Amount shows $2,500
   - ✅ Platform fee displays (should be 1.25% of $2,500 = $31.25)
   - ✅ Fee explanation shows: "This fee is included in the amount above..."
   - ✅ "Pay" button shows total: "Pay $2,500"

---

## Test 2: Refund Flow ✅

**File**: `/dashboard/jobs/[id]` → Payments tab

**Setup**: Create a test payment and mark it as 'paid' (you'll need to do this manually in DB or via webhook simulation)

**Steps**:
1. Go to dashboard → Jobs → {job} → Payments tab
2. Find a payment with status "paid"
3. Click ↩️ **Refund** button
4. Confirm the dialog
5. **Verify**:
   - ✅ Payment status changes to 'refunded'
   - ✅ Console logs show refund was created in Stripe
   - ✅ Linked invoice (if any) marked as 'void'

---

## Test 3: Payment Reconciliation (Retry/Fail) ✅

**File**: `/dashboard/jobs/[id]` → Payments tab

**Steps**:
1. Create a payment request (status: 'requested')
2. Click "Pay" link → go to checkout
3. **Don't complete** the payment; close the tab
4. Back in dashboard, payment is now 'processing'
5. Click 🔄 **Retry** button
6. New checkout tab opens (should be same session URL if still open, fresh if expired)
7. **Verify**:
   - ✅ Retry opens a checkout
   - ✅ Can choose to pay now or abandon
   - ✅ If abandoned again, ❌ **Fail** button marks it failed for reconciliation

---

## Test 4: Invoice + Payment Linking ✅

**File**: `/dashboard/jobs/[id]` → Invoices tab

**Steps**:
1. Create an invoice with line items (e.g., "Labor: $1000", "Materials: $500")
2. Create a payment request and **link it to the invoice**:
   - In payment form, look for "Invoice" dropdown (should show the invoice you just created)
   - Select the invoice before submitting
3. Complete the payment (via /pay link)
4. **Verify**:
   - ✅ Payment shows `invoice_id` in DB
   - ✅ Invoice status automatically changed to 'paid'
   - ✅ `signed_at` timestamp set on invoice

---

## Test 5: Invoice Email Sending ✅

**File**: `/dashboard/jobs/[id]` → Invoices tab

**Prerequisite**: Have a RESEND_API_KEY configured

**Steps**:
1. Create an invoice with line items
2. Click status dropdown → change to **"Sent"**
3. Check your inbox (email goes to contractor's auth email)
4. **Verify**:
   - ✅ Email arrives from `hello@letsgetquoted.com`
   - ✅ Email has professional HTML layout
   - ✅ Shows invoice ref, line items, total
   - ✅ "View Invoice" button links to `/dashboard/jobs/{jobId}/invoices/{invoiceId}`
   - ✅ Invoice status in DB is 'sent'

---

## Test 6: Webhook Handlers (Advanced)

**Files**: `/api/stripe/webhook`

**Setup**: Use `stripe trigger` commands to simulate events

**Test charge.failed**:
```bash
stripe trigger charge.failed
```
- Create a payment in DB
- Simulate a failed charge
- **Verify**: Payment status changes to 'failed'

**Test charge.refunded**:
```bash
stripe trigger charge.refunded
```
- Create a paid payment in DB
- Simulate a refund event
- **Verify**: Payment status changes to 'refunded'

---

## Test 7: Payment Success Webhook

**Files**: Stripe webhook + `/api/stripe/webhook`

**Setup**: Create a real test payment (or simulate with Stripe CLI)

**Steps**:
1. Create a payment request
2. Go to `/pay/{paymentId}` → Click "Pay"
3. Enter Stripe test card: `4242 4242 4242 4242` exp `12/26` CVC `123`
4. Complete checkout
5. **Verify**:
   - ✅ Payment status changes to 'paid' (via webhook)
   - ✅ `paid_at` timestamp set
   - ✅ If invoice linked, invoice auto-marked 'paid' + `signed_at` set
   - ✅ Platform fee and fee_rate recorded in DB

---

## Test 8: Connect Account Status (Capability Monitoring)

**Files**: `/api/stripe/webhook` → `account.updated` handler

**Manual Test**:
1. Go to contractor Stripe Connect onboarding
2. Complete onboarding
3. Manually trigger account capability change in Stripe dashboard
4. **Verify**:
   - ✅ Webhook receives `account.updated` event
   - ✅ Logs show capability status in console
   - ✅ (No automatic disable — just monitoring for now)

---

## Quick Test Summary Checklist

- [x] **Payment display**: Amount + fee visible on /pay page (verified by code review of `getQuotedFee`/page.tsx; not re-verified via live fetch this pass)
- [ ] **Refund**: Button refunds payment, invoice marked void (NOT covered by the automated script — needs a real completed test-mode payment; only the webhook's own `charge.refunded` handling is automated)
- [ ] **Retry**: Failed payment can retry checkout (not automated — needs a real Checkout Session)
- [x] **Invoice linking**: Payment linked to invoice, auto-marks paid — automated via `scripts/test-payment-webhook-flow.mjs`
- [ ] **Email sending**: Invoice sent → email arrives from hello@letsgetquoted.com (not automated — no inbox access; PDF attachment code path confirmed present via code review)
- [x] **Webhook success**: Real payment completes → status updates to paid — automated, including duplicate-delivery idempotency
- [x] **Webhook failures**: Simulate failed charges → status updates to failed — automated (`charge.failed`, `checkout.session.expired`)
- [x] **Connect status**: Account capability changes logged — automated guard added (skips update on ambiguous read instead of blindly disabling)

---

## Known Limitations (Not Yet Implemented)

- ✅ RESOLVED (2026-07-16): Invoice signature flow — real client e-signature
  capture now exists (`/invoice/[id]` public sign-off page + `signInvoice()`),
  not just `signed_at` set as a side effect of payment.
- ✅ RESOLVED (2026-07-16): PDF invoice attachment — `emails/InvoicePdf.ts`
  generates a PDF attached to the invoice email (falls back to HTML-only if
  generation fails).
- ✅ RESOLVED (earlier session): Contractor fee transparency before checkout —
  `/pay/[id]` shows an estimated fee via `getQuotedFee()` before checkout ever
  starts, not just after.
- ⚠️ IMPROVED (2026-07-16), not fully closed: Connect capability auto-disable —
  `account.updated` now only flips `connect_onboarded` off on a concrete
  (non-null) capability read, so a transient/ambiguous Stripe API response can
  no longer force a working contractor's account offline. Still no
  contractor-facing alert if a capability is later genuinely revoked.
- ⚠️ IMPROVED (2026-07-16), not fully closed: Destination-charge/transfer
  failure recovery — `charge.dispute.created` is now logged server-side
  (`[DISPUTE]` log lines) so a chargeback is no longer completely invisible.
  Still no dedicated `disputed` payment status (would need a schema
  migration), no automatic homeowner/contractor notification, and no
  automatic retry/reversal handling for a failed destination transfer
  specifically.
- ❌ QuickBooks OAuth two-way sync (CSV export is the only path today)
- ❌ Twilio missed-call text-back + AI (Claude) text intake
- ❌ Wisetack financing integration (schema has a dormant `finance_plans`
  table ready for it; blocked on Wisetack partner/API signup)

---

## Debugging Tips

**Email not sending?**
- Check `RESEND_API_KEY` in `.env.local`
- Check console logs for "Invoice email error"
- Verify contractor email is set in Supabase auth

**Webhook not triggering?**
- Verify `stripe listen` is running
- Check webhook secret in `.env.local` matches CLI output
- Use `stripe trigger checkout.session.completed` to test

**Payment not updating?**
- Check database directly: `SELECT * FROM payments WHERE id = '...'`
- Verify payment is in correct state before action
- Check `.next` cache: `rmdir /s /q .next` if needed

**Invoice email template looks wrong?**
- Check [src/emails/InvoiceEmail.tsx](src/emails/InvoiceEmail.tsx)
- Email HTML is generated at send time, not cached
