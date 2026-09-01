# Chargeback Evidence & Support Reachability Protocol

**Goal:** Provide an end-to-end operational protocol for responding to card disputes (chargebacks), assembling legally defensible evidence packages from platform records, and maintaining customer/homeowner support reachability SLAs.

---

## 1. Support Reachability & Inbox Routing

| Inbox Address | Purpose | Routing & Ingestion | Target SLA |
| :--- | :--- | :--- | :--- |
| `support@letsgetquoted.com` | Contractor technical support, billing inquiries, plan cancellations, operational bugs | Monitored team inbox + alert bridge | 2h acknowledgement (business hours), 12h resolution |
| `hello@letsgetquoted.com` | Public inquiries, sales questions, general correspondence | Inbound forwarding to founders | 24h response |
| `disputes@letsgetquoted.com` | Urgent chargeback notifications and banking inquiries | Dedicated high-priority alert routing | Immediate (<1h during business hours) |

### Homeowner Support Path (Logged-Out Visitors)
- Homeowners navigating to `letsgetquoted.com` or contractor tenant sites have access to:
  1. `/contact`: Public web inquiry form.
  2. `/portal`: Magic link self-service portal to review all historical jobs, estimates, invoices, and payment receipts.
  3. Contractor direct contact card on quote/invoice landing pages (phone, business email, physical address).

---

## 2. Stripe Dispute Rebuttal Evidence Package Assembly

When a cardholder initiates a dispute (e.g. `fraudulent`, `product_not_received`, `unrecognized`), assemble the following 6-part evidence package within **7 days**:

### Evidence Component Checklist:
1. **Contractor Client Contract & Signed Quote**:
   - Estimate Acceptance Record: Captured timestamp (`accepted_at`), signer name, client IP address, and acceptance token.
   - Itemized Scope of Work: PDF of finalized estimate showing line items, materials, labor costs, and accepted change orders.
2. **Customer Terms & Cancellation Policy**:
   - Screenshot / PDF of Terms of Service version stamped at checkout (`VALID_TERMS_VERSIONS`).
   - Explicit 30-day money-back guarantee terms (for SaaS subscriptions) or contractor cancellation clause (for field jobs).
3. **Proof of Delivery & Notification Receipts**:
   - Resend transactional email logs (`email_events`): Message ID, recipient email, delivered timestamp, and open/click event traces.
   - SignalWire 10DLC SMS logs (`sms_messages`): Message SID, recipient phone, delivery status `delivered`, carrier delivery receipt (DLR).
4. **Proof of Work & Fulfillment Documentation**:
   - High-resolution before & after photos from `job-photos` bucket.
   - Technician GPS arrival & departure timestamps from `account:${accountId}:crew-locations` telemetry.
   - Homeowner sign-off or completion approval signature.
5. **Customer Communication & Correspondence**:
   - SMS conversation transcript between contractor and homeowner.
   - Inbound inquiries and responses demonstrating active engagement and service delivery.
6. **Payment & Ledger Audit Trail**:
   - Stripe Charge ID, PaymentIntent ID, and connected merchant account ID.
   - Prior partial refunds or credits applied (if any).

---

## 3. Dispute Submission & Escalation Playbook

1. **Step 1: Triage within 24 hours of Stripe Webhook**:
   - `charge.dispute.created` webhook triggers high-priority operational alert via `sendOperationalEmergencyAlert`.
   - Inspect dispute reason and `evidence_details.due_by` deadline.
2. **Step 2: Collect & Collate Evidence**:
   - Run the dispute package export query:
     ```sql
     SELECT j.id, j.scope, q.total_amount, q.accepted_at, q.accepted_ip, p.stripe_charge_id
     FROM jobs j
     JOIN quotes q ON q.job_id = j.id
     JOIN payments p ON p.job_id = j.id
     WHERE p.stripe_charge_id = '<DISPUTED_CHARGE_ID>';
     ```
3. **Step 3: Submit Evidence via Stripe Workbench**:
   - Upload compiled PDF bundle and structured text fields in Stripe Dashboard $\to$ **Payments** $\to$ **Disputes**.
4. **Step 4: Record & Monitor Outcome**:
   - `charge.dispute.closed` webhook ingests final resolution (`won` / `lost`).
   - If won, funds and dispute fees are restored to connected account ledger.
