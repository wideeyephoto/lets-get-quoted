# Live Stripe Money-Rail Rehearsal & Ledger Reconciliation

**Document Version:** 1.0.0  
**Target:** Stripe Production & Platform Database  
**Requirement Gate:** [`LAUNCH_CHECKLIST.md:367`](../../LAUNCH_CHECKLIST.md#L367)  
**Operator Required:** Yes (Live Stripe API access & test charge/top-up authorization)

---

## 1. Overview & Money Invariants

Before taking public payments from third parties, every money movement rail must be proven in live production. Specifically:

1. **Connected Refund Protection**: Every connected charge is a destination charge where funds move to the contractor. A refund issued without `reverse_transfer: true` and `refund_application_fee: true` forces the platform to absorb the refund cost while the contractor retains the payout. This protocol guarantees that every app-issued refund returns platform fees and claws back the contractor payout in a single coordinated operation.
2. **Top-Up Add-Ons**: Live purchase of sellable credits (e.g. `$5` `crew_user` or `$12` `flex_text_250`) must record a `platform_top_up` event in `billing_events` and credit `purchased_capacity`.
3. **Plan Tier Transitions**: Plan upgrades/downgrades (Solo $\leftrightarrow$ Growth) must compute prorations cleanly without duplicate subscriptions.
4. **Dispute Ingestion**: Inbound `charge.dispute.created` webhooks must update `payments.dispute_due_by` and flag the dispute in the dashboard.
5. **Webhook Health**: All active Stripe webhook receivers must be verified for 100% event coverage and zero missing deliveries.

---

## 2. Webhook Endpoint Audit (5 Receivers)

Verify all 5 live webhook endpoints using the verification tool:

```bash
node scripts/verify-webhook-subscription.mjs
```

### Registered Receiver Inventory

| Route | Scope | Account | Signing Secret Var | Key Subscribed Events |
|---|---|---|---|---|
| `/api/stripe/webhook` | Legacy Platform / Connect | Platform | `STRIPE_WEBHOOK_SECRET` | `checkout.session.completed`, `payment_intent.succeeded`, `charge.refunded`, `charge.dispute.created`, `account.updated` |
| `/api/stripe/billing/webhook` | Platform Subscriptions | Platform | `STRIPE_BILLING_WEBHOOK_SECRET` | `customer.subscription.*`, `invoice.*` (18 events) |
| `/api/stripe/top-ups/webhook` | Platform Top-Ups | Platform | `STRIPE_TOP_UP_WEBHOOK_SECRET` | `checkout.session.completed`, `checkout.session.expired` |
| `/api/stripe/connected-payments/webhook` | Direct Card Payments | Connect | `STRIPE_CONNECTED_PAYMENT_WEBHOOK_SECRET` | Connected payment intents and sessions |
| Secondary Connect Receiver | Destination Legacy | Connect | Dedicated Secret | Webhook mirror for legacy routing |

---

## 3. Money Movement Procedures

### Procedure A: App-Issued Connected Refund with Loss Guard
1. From `/dashboard/payments`, locate a settled destination payment.
2. Click **Issue Refund**.
3. Once confirmed, inspect the resulting Stripe Refund via API:
   ```bash
   stripe refunds retrieve <re_id> --live
   ```
4. **Verify Properties**:
   - `transfer_reversal`: non-null ID (confirming contractor payout was reversed)
   - `refund_application_fee`: true (confirming platform application fee was refunded)
   - Database `payments.status = 'refunded'`
   - `platform_fee_refunded` matches fee ratio

### Procedure B: Live Top-Up Purchase & Capacity Grant
1. In the dashboard, navigate to **Settings** $\to$ **Plan & Usage** (`/dashboard/settings?tab=plan`).
2. Under Top-Up Add-Ons, select **Crew Seat (+1 Seat - $5/mo)** or **SMS Bundle**.
3. Complete Stripe Checkout with a live card.
4. Confirm success redirect to `/dashboard/settings?tab=plan&topup=success`.
5. Verify in database:
   - `billing_events` has row with `scope = 'platform_top_up'` and `projection_status = 'projected'`
   - `purchased_capacity` reflects incremented quota.

### Procedure C: Live Plan Tier Change (Solo $\leftrightarrow$ Growth)
1. In **Settings** $\to$ **Plan & Usage**, click **Change Plan**.
2. Select **Growth Plan ($129/mo)**.
3. Confirm change:
   - Inspect Stripe Subscription: proration applied, plan item updated to `price_1U5n8eGqh5LFKuTCZKW7rINt`.
   - `billing_subscriptions.plan_code` updates to `growth`.
   - `workspace_entitlements` updates seat allowance to Growth limits.
4. Revert to Solo Plan ($39/mo) and verify downgrade scheduling.

### Procedure D: Dispute Webhook Playback
Execute the automated dispute simulation script against the target endpoint:

```bash
node scripts/simulate-dispute-playback.mjs
```

**Verify**:
- Endpoint returns HTTP 200.
- `payments.status` transitions to `disputed`.
- `payments.dispute_due_by` is populated with the carrier response deadline.
- Replaying the identical payload returns HTTP 200 without duplicate records.

---

## 4. Full Ledger Reconciliation

Run the live ledger reconciler:

```bash
node scripts/reconcile-stripe-live-ledger.mjs
```

**Passing Criteria**:
- 0 amount or status mismatches between Stripe and `payments`.
- 0 open or unresolved rows in `webhook_failures`.
- All active Stripe subscriptions match `billing_subscriptions`.
