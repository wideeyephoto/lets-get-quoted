# Top-Up Purchases — Go-Live Runbook

**Activation sequence for Platform Top-Up Purchases:** Live-mode webhook destination + strict 3-flag sequential rollout (`webhook` -> `worker` -> `purchase`).

---

## 1. Safety Architecture & The 3-Step Sequence

```
[Stripe Platform Account: acct_1TuCWJGqh5LFKuTC]
       |
       | checkout.session.completed (lgq_purpose='top_up')
       v
+-------------------------------------------------------------------------------------------------+
| STEP 1: Webhook Ingest Boundary                                                                 |
| Route:  /api/stripe/top-ups/webhook                                                             |
| Gate:   LGQ_STRIPE_TOP_UP_WEBHOOK_ENABLED=1                                                     |
| Secret: STRIPE_TOP_UP_WEBHOOK_SECRET (whsec_...)                                                |
+-------------------------------------------------------------------------------------------------+
       |
       | Durable Ingest (expectedScope='platform_top_up')
       v
+-------------------------------------------------------------------------------------------------+
| Postgres: billing_events Table                                                                  |
| (Envelope stored, PII-minimized; events accumulate safely even if worker is offline)           |
+-------------------------------------------------------------------------------------------------+
       |
       | Leased batch claiming
       v
+-------------------------------------------------------------------------------------------------+
| STEP 2: Top-Up Projection Worker                                                                |
| Cron:   /api/cron/billing-workers                                                               |
| Gate:   LGQ_STRIPE_TOP_UP_PROJECTION_WORKER_ENABLED=1                                           |
| Action: Drains billing_events -> Re-reads Stripe Session -> Writes usage_credit_lots / capacity |
+-------------------------------------------------------------------------------------------------+
       ^
       |
       | Customer buys add-on pack from Plan & usage
       |
+-------------------------------------------------------------------------------------------------+
| STEP 3: Customer Purchase Entrypoint                                                            |
| Surface: Settings -> Plan & usage -> TopUpPurchaseCheckout                                      |
| Gate:    LGQ_TOP_UP_PURCHASE_ENABLED=1 (Requires LGQ_PRICING_DASHBOARD_ENABLED=1)                |
+-------------------------------------------------------------------------------------------------+
```

### Why Strict Order (Webhook -> Worker -> Purchase) Is Mandatory
1. **`LGQ_STRIPE_TOP_UP_WEBHOOK_ENABLED=1` (First)**: Activates signature validation and durable write into `billing_events`. Events buffer safely without being lost or failing delivery retries.
2. **`LGQ_STRIPE_TOP_UP_PROJECTION_WORKER_ENABLED=1` (Second)**: Activates worker to lease and project events, turning paid sessions into non-expiring credit lots (`usage_credit_lots`) or capacity (`workspace_purchased_capacity`).
3. **`LGQ_TOP_UP_PURCHASE_ENABLED=1` (Third)**: Exposes the "Buy add-on credits" UI and Server Action only after receipt and projection are operational.

---

## 2. Prerequisites & Configuration

### Prerequisites
- `LGQ_PRICING_DASHBOARD_ENABLED=1` (In `settings/page.tsx`, `showTopUpPurchase` requires `planUsage?.plan.kind === 'ready'`, which requires this flag).
- `LGQ_STRIPE_BILLING_LIVEMODE=1`
- Live Stripe prices exist stamped with `PRICING_CATALOG_VERSION` (`2026-08-18-preview`).

### Sellable vs Withheld SKUs
- **Sellable**: `text_1000` ($42/1,000 credits), `marketing_email_5000` ($19/5,000 emails), `ai_intake_100` ($15/100 threads), `ai_writing_250` ($12/250 drafts), `crew_user` ($5/mo), `flex_text_250` ($12/250 credits, Flex only).
- **Withheld**: `storage_100gb`, `office_user`.

---

## 3. Step-by-Step Activation Instructions

### Step 1 — Create Stripe Live Webhook Endpoint & Capture Secret
1. On Stripe live account `acct_1TuCWJGqh5LFKuTC`, add endpoint:
   - **URL**: `https://letsgetquoted.com/api/stripe/top-ups/webhook`
   - **Scope**: Platform account (account-scoped, **NOT** Connect-scoped)
   - **Events** (strictly these 4):
     - `checkout.session.completed`
     - `checkout.session.expired`
     - `checkout.session.async_payment_succeeded`
     - `checkout.session.async_payment_failed`
2. Copy the signing secret (`whsec_...`).
3. Set in Vercel **Production**:
   - `STRIPE_TOP_UP_WEBHOOK_SECRET = whsec_...` (Sensitive: **ON**)

### Step 2 — Enable Webhook Receipt (`LGQ_STRIPE_TOP_UP_WEBHOOK_ENABLED=1`)
1. Set in Vercel **Production**:
   - `LGQ_STRIPE_TOP_UP_WEBHOOK_ENABLED = 1` (Sensitive: **OFF**)
2. **Redeploy Production**.
3. Verify endpoint status:
   ```bash
   curl -s -o /dev/null -w "%{http_code}\n" -X POST https://letsgetquoted.com/api/stripe/top-ups/webhook
   ```
   *Expect `400` (Invalid signature)*.

### Step 3 — Enable Projection Worker (`LGQ_STRIPE_TOP_UP_PROJECTION_WORKER_ENABLED=1`)
1. Set in Vercel **Production**:
   - `LGQ_STRIPE_TOP_UP_PROJECTION_WORKER_ENABLED = 1` (Sensitive: **OFF**)
2. **Redeploy Production**.
3. Verify worker runs in `cron_runs`:
   ```sql
   SELECT job, status, result_summary, started_at FROM public.cron_runs WHERE job = 'billing-workers' ORDER BY started_at DESC LIMIT 5;
   ```

### Step 4 — Enable Purchase Entrypoint (`LGQ_TOP_UP_PURCHASE_ENABLED=1`)
1. Set in Vercel **Production**:
   - `LGQ_TOP_UP_PURCHASE_ENABLED = 1` (Sensitive: **OFF**)
2. **Redeploy Production**.
3. Verify `/dashboard/settings#plan` renders the add-on purchase card and test checkouts resolve properly.

---

## 4. Verification SQL Queries

```sql
-- 1. Webhook receipts recorded
SELECT id, provider_event_id, event_type, scope, projection_status, projection_result, received_at
FROM public.billing_events
WHERE scope = 'platform_top_up'
ORDER BY received_at DESC LIMIT 10;

-- 2. Granted credit lots
SELECT id, account_id, resource_code, granted_units, source_type, idempotency_key, expires_at, created_at
FROM public.usage_credit_lots
WHERE source_type = 'purchase'
ORDER BY created_at DESC LIMIT 10;

-- 3. Purchased capacity
SELECT id, account_id, resource_code, granted_units, stripe_subscription_id, state, created_at
FROM public.workspace_purchased_capacity
ORDER BY created_at DESC LIMIT 10;
```

---

## 5. Rollback Matrix

| To Undo | Action | Immediate Effect |
|---|---|---|
| Customer purchases | `LGQ_TOP_UP_PURCHASE_ENABLED=0` & redeploy | UI hidden; endpoint immediately returns `disabled`. |
| Projection worker | `LGQ_STRIPE_TOP_UP_PROJECTION_WORKER_ENABLED=0` & redeploy | Draining paused; events remain safely in `billing_events`. |
| Webhook route | `LGQ_STRIPE_TOP_UP_WEBHOOK_ENABLED=0` & redeploy | Route returns 404 before reading payload. |
| Emergency switch | Disable endpoint in Stripe Dashboard | Stripe immediately stops deliveries. |
