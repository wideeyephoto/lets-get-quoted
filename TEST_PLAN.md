# Feature Test Plan — Let's Get Quoted (2026-07-15)

## Quick Start for Testing

### Prerequisites
- Dev server running on port 3010
- Stripe test mode CLI running (`stripe listen`)
- Resend API key configured
- Create a test account (magic link sign-in to /login)

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

- [ ] **Payment display**: Amount + fee visible on /pay page
- [ ] **Refund**: Button refunds payment, invoice marked void
- [ ] **Retry**: Failed payment can retry checkout
- [ ] **Invoice linking**: Payment linked to invoice, auto-marks paid
- [ ] **Email sending**: Invoice sent → email arrives from hello@letsgetquoted.com
- [ ] **Webhook success**: Real payment completes → status updates to paid
- [ ] **Webhook failures**: Simulate failed charges → status updates to failed
- [ ] **Connect status**: Account capability changes logged

---

## Known Limitations (Not Yet Implemented)

- ❌ Destination charge error recovery (transfer failures not caught)
- ❌ Connect capability auto-disable (monitoring only)
- ❌ Invoice signature flow (only marks signed_at on payment)
- ❌ PDF invoice attachment (sends HTML email only)
- ❌ Contractor fee transparency before checkout (only shown after)

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
