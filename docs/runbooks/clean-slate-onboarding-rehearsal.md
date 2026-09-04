# Clean-Slate Onboarding & First Payment Rehearsal Protocol

**Document Version:** 1.0.0  
**Target:** Production (`https://letsgetquoted.com` & `https://app.letsgetquoted.com`)  
**Requirement Gate:** [`LAUNCH_CHECKLIST.md:366`](../../LAUNCH_CHECKLIST.md#L366)  
**Operator Required:** Yes (Stripe Connect KYC identity, live card authorization, physical mobile handset)

---

## 1. Objective & Scope

Prove that a complete stranger can independently sign up, accept legal terms, configure Stripe Connect, create and dispatch a quote, have a homeowner inspect and pay the quote from a mobile handset, and issue a platform-fee-protected refund from the dashboard—with zero operator intervention or manual database corrections.

---

## 2. Pre-Requisites

1. **Unseeded Email Address**: A real external inbox (Gmail, Outlook, or proton) that has never been registered in Let's Get Quoted.
2. **Physical Mobile Handset**: A real smartphone on a commercial cellular carrier (iOS Safari or Android Chrome) with SMS capability.
3. **Valid Payment Card**: A real credit/debit card capable of settling a $1.00 live transaction.
4. **Clean Browser Profile**: Fresh Incognito/Private window with cookies and local storage cleared.

---

## 3. Step-by-Step Rehearsal Execution

### Phase 1: Authentication & Workspace Provisioning
1. In a private browser window, navigate to `https://letsgetquoted.com/pricing?plan=solo`.
2. Click **Start 14-Day Free Trial** (or enter email on `/login`).
3. Submit the unseeded test email.
4. Open the external mailbox and verify receipt of the branded Magic Link email:
   - Check headers: SPF, DKIM, and DMARC passes.
   - Confirm sender is `hello@letsgetquoted.com` (or configured transactional sender).
   - Click the sign-in link.
5. You are redirected to `/welcome`:
   - Enter **Business Name** (e.g. `Apex Plumbing Solutions`).
   - Select **Trade** (e.g. `Plumbing`).
   - Enter **ZIP Code** (e.g. `78701`).
   - Review and check the **Terms of Service** checkbox.
   - Click **Complete Setup**.
6. **Telemetry Verification**:
   - Confirm `accounts.terms_accepted_at` is stamped.
   - Confirm `terms_version` matches current active terms.
   - Confirm owner membership is established in `account_memberships`.

---

### Phase 2: Stripe Connect Onboarding
1. From the dashboard, navigate to **Settings** $\to$ **Payments** (`/dashboard/settings?tab=payments`).
2. Click **Connect with Stripe** (or **Set Up Card Payments**).
3. Complete Stripe-hosted onboarding:
   - Provide business structure and banking payout destination.
   - Complete required KYC verification.
4. Return to the dashboard via `/dashboard/stripe-merchant/return`:
   - Verify page displays **Card Payments Active** and **Payouts Active**.
   - Ensure `stripe_merchant_account_id` or `stripe_account_id` is populated in `accounts`.

---

### Phase 3: Quote Creation & Homeowner Dispatch
1. Navigate to **Quotes** $\to$ **New Quote** (`/dashboard/quotes` or `/dashboard/jobs`).
2. Enter client details:
   - **Client Name**: `Test Homeowner`
   - **Client Phone**: Your controlled physical mobile handset number.
   - **Client Email**: Controlled recipient email.
3. Add a simple service line item:
   - Description: `Emergency Pipe Inspection & Diagnosis`
   - Amount: `$1.00`
4. Set Deposit requirement:
   - Deposit amount: `$1.00` (100% deposit).
5. Click **Send Quote**:
   - Choose **Send via SMS & Email**.
   - Verify SMS arrives on your mobile phone with no internal persona names (`[Apex Plumbing Solutions] Your estimate is ready...`).

---

### Phase 4: Homeowner Mobile Token Experience & Live Payment
1. On the physical mobile phone, tap the link received via SMS:
   - Resolves to `https://letsgetquoted.com/quote/[token]`.
2. Verify mobile rendering:
   - Responsive layout at 375px–390px width.
   - Clear contractor branding (Apex Plumbing Solutions).
   - Deposit amount ($1.00) visible.
3. Tap **Accept & Pay Deposit**:
   - The `/pay?token=...` payment modal or page opens.
   - Verify Apple Pay / Google Pay / Card Element loads cleanly without horizontal clipping.
4. Enter real credit card details and submit the $1.00 payment.
5. Verify instant payment confirmation screen and confirmation SMS/email receipt.

---

### Phase 5: Dashboard Ledger Check & In-App Refund
1. Back on the contractor desktop dashboard, navigate to **Payments** (`/dashboard/payments`).
2. Confirm the payment displays as **Paid** ($1.00).
3. Click into the payment record and select **Issue Refund**:
   - Select **Full Refund ($1.00)**.
   - Enter Reason: `Rehearsal test refund`.
   - Click **Confirm Refund**.
4. Confirm payment status transitions to **Refunded** with compare-and-set verification.
5. In Stripe Dashboard (or via API), confirm:
   - `refund.status = 'succeeded'`
   - `reverse_transfer = true` (contractor payout reversed)
   - `refund_application_fee = true` (platform fee returned)

---

## 4. Post-Rehearsal Automated Audit

Run the automated verification script against the newly created account:

```bash
node scripts/verify-clean-slate-onboarding-journey.mjs <newAccountId>
```

**Passing Criteria:**
- [x] Account record exists with active owner role
- [x] Terms accepted with valid timestamp and version
- [x] Stripe Connect merchant account in ready state
- [x] Quote and public token generated
- [x] Payment succeeded and settled
- [x] In-app refund completed with fee reversal
- [x] Outbound notification events logged in `email_events` and `sms_events`
