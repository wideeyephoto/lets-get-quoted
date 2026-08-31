# Official Pre-Launch & Go-Live Checklist — Let's Get Quoted

This is the definitive production deployment and launch checklist. All automated testing gates, database migrations, and schema verifications are complete and passing.

---

## 1. Verified System Readiness (Gates at 100%)

- [x] **TypeScript Strict Typecheck**: `npm run typecheck` (0 errors)
- [x] **Vitest Unit & Integration Suite**: `npm test` (838 test files, 11,243 tests passed, 0 failures)
- [x] **Production Compilation**: `npm run build` (Clean SSR/SSG compilation across all routes and contractor templates)
- [x] **Database Schema & Migrations**: Schema dependency ordering and runtime migrations synchronized
- [x] **Row-Level Security & Multi-Tenancy**: Tenant boundary isolation confirmed across all account roles
- [x] **Core Lifecycles Verified**:
  - Lead Intake → Estimation → Job Conversion → Crew Dispatch → Invoice E-Sign
  - Schedule Day Planning & Route Geographic Optimization
  - Stripe Checkout Webhook Idempotency, E-Signature Preservation, Charge Failure, Disputes, and Refunds
  - Outbox SMS Delivery, 10DLC Consent Ledgers, and White-Label Invariants
  - 1-Page PDF Generation (Invoices, Estimates, Lien Waivers)
  - 34 of 34 Scheduled Vercel Background Crons

---

## 2. Stripe Production Billing & Live Keys

### Base Plan Price Bindings (Catalog: `2026-08-18-preview`)
The following Price IDs exist in the live Stripe account, are active, single-currency USD, and bound:

| Variable Name | Plan Tier | Interval | Price | Bound Stripe Price ID |
| :--- | :--- | :--- | :--- | :--- |
| `STRIPE_PRICE_SOLO_MONTHLY` | Solo | Monthly | $39/mo | `price_1U5n8eGqh5LFKuTCh9KIQFws` |
| `STRIPE_PRICE_SOLO_ANNUAL` | Solo | Annual | $420/yr | `price_1U5n8eGqh5LFKuTCTSUmI5CR` |
| `STRIPE_PRICE_GROWTH_MONTHLY` | Growth | Monthly | $129/mo | `price_1U5n8eGqh5LFKuTCZKW7rINt` |
| `STRIPE_PRICE_GROWTH_ANNUAL` | Growth | Annual | $1,188/yr | `price_1U5n8fGqh5LFKuTCjJRhOzQ9` |
| `STRIPE_PRICE_SCALE_MONTHLY` | Scale | Monthly | $329/mo | `price_1U5n8fGqh5LFKuTCUBcPBlFY` |
| `STRIPE_PRICE_SCALE_ANNUAL` | Scale | Annual | $3,588/yr | `price_1U5n8fGqh5LFKuTCOEm7ACLn` |

### Top-Up Add-Ons (Live & Sellable)
- [x] `flex_text_250`: `price_1U5tXzGqh5LFKuTCXUPxSJY7` ($15/mo)
- [x] `text_1000`: `price_1U5tXzGqh5LFKuTCyqyMSkQ7` ($45/mo)
- [x] `marketing_email_5000`: `price_1U5tY0Gqh5LFKuTCITQbEhEK` ($20/mo)
- [x] `ai_intake_100`: `price_1U5tY1Gqh5LFKuTCzgsuPkbj` ($25/mo)
- [x] `ai_writing_250`: `price_1U5tY2Gqh5LFKuTCNgbygfUp` ($15/mo)
- [x] `crew_user`: `price_1U6gVfGqh5LFKuTC9wFCN28D` ($5/mo)
- [x] Withheld from sale: `storage_100gb`, `office_user`, AI Voice SKUs

### Live Stripe Webhook Endpoints
- [ ] **Standard Connect Webhook**: `https://app.letsgetquoted.com/api/stripe/webhook`
  - Events: `checkout.session.completed`, `checkout.session.expired`, `charge.failed`, `charge.refunded`, `charge.dispute.created`, `charge.dispute.closed`, `account.updated`
  - Variable: `STRIPE_WEBHOOK_SECRET=whsec_...`
- [ ] **Platform Billing Webhook**: `https://app.letsgetquoted.com/api/stripe/billing-webhook`
  - Events: `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_succeeded`, `invoice.payment_failed`
  - Variable: `STRIPE_BILLING_WEBHOOK_SECRET=whsec_...`
  - Flag: `LGQ_STRIPE_BILLING_WEBHOOK_ENABLED=1`

---

## 3. Telephony, SMS & Carrier 10DLC Approval

- [ ] **10DLC Brand & Campaign Registration**: Ensure Brand and Campaign registrations are active in Twilio/SignalWire Console so transactional homeowner messages are not filtered by Tier 1 US mobile carriers.
- [ ] **Shared & Dedicated Numbers**: Verify `SIGNALWIRE_FROM_NUMBER=+19479412323` and `SIGNALWIRE_SPACE_URL=lets-get-quoted.signalwire.com`.
- [x] **White-Labeling Invariant**: Ensure no internal persona names appear in homeowner-facing SMS payloads.

---

## 4. Transactional Email & Deliverability (Resend)

- [ ] **DNS Records**: Verify DKIM, SPF, and DMARC records for `letsgetquoted.com` in [Resend](https://resend.com) to maintain 99%+ deliverability for invoices, estimate links, and login emails.
- [ ] **API Key**: Ensure `RESEND_API_KEY=re_...` is set in Vercel Production.

---

## 5. Google Maps & Geocoding APIs

- [ ] **Browser Key (`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`)**: Restrict in Google Cloud Console by HTTP Referrers:
  - `https://letsgetquoted.com/*`
  - `https://*.letsgetquoted.com/*`
  - `https://app.letsgetquoted.com/*`
- [ ] **Server-Side Geocoding Key (`GOOGLE_MAPS_API_KEY`)**: Must be unrestricted by HTTP referrer (or IP-restricted) so server-side background geocoding and drive-time calculations succeed.

---

## 6. DNS, Domains & Routing (Vercel)

- [ ] **Apex & Application Domains**:
  - `letsgetquoted.com` → Vercel
  - `app.letsgetquoted.com` → Vercel
- [ ] **Wildcard Contractor Websites & Portals**:
  - `*.letsgetquoted.com` CNAME record pointing to `cname.vercel-dns.com`.
- [ ] **Cron Security**: Set `CRON_SECRET` in Vercel Production to secure the 34 background cron endpoints.

---

## 7. Master Production Environment Variable Checklist

| Environment Variable | Production Value / Note |
| :--- | :--- |
| `NEXT_PUBLIC_APP_URL` | `https://app.letsgetquoted.com` |
| `NEXT_PUBLIC_ROOT_DOMAIN` | `letsgetquoted.com` |
| `DATABASE_URL` | *Supabase Production Postgres URI* |
| `NEXT_PUBLIC_SUPABASE_URL` | *Supabase Project URL* |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | *Supabase Anon Key* |
| `SUPABASE_SERVICE_ROLE_KEY` | *Supabase Service Role Key (Sensitive)* |
| `LGQ_STRIPE_BILLING_LIVEMODE` | `1` |
| `STRIPE_SECRET_KEY` | `sk_live_...` (or restricted live key) |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | `pk_live_...` |
| `STRIPE_WEBHOOK_SECRET` | *Connect Webhook Signing Secret* |
| `STRIPE_BILLING_WEBHOOK_SECRET` | *Platform Billing Webhook Signing Secret* |
| `LGQ_STRIPE_BILLING_WEBHOOK_ENABLED` | `1` |
| `STRIPE_PRICE_SOLO_MONTHLY` | `price_1U5n8eGqh5LFKuTCh9KIQFws` |
| `STRIPE_PRICE_SOLO_ANNUAL` | `price_1U5n8eGqh5LFKuTCTSUmI5CR` |
| `STRIPE_PRICE_GROWTH_MONTHLY` | `price_1U5n8eGqh5LFKuTCZKW7rINt` |
| `STRIPE_PRICE_GROWTH_ANNUAL` | `price_1U5n8fGqh5LFKuTCjJRhOzQ9` |
| `STRIPE_PRICE_SCALE_MONTHLY` | `price_1U5n8fGqh5LFKuTCUBcPBlFY` |
| `STRIPE_PRICE_SCALE_ANNUAL` | `price_1U5n8fGqh5LFKuTCOEm7ACLn` |
| `RESEND_API_KEY` | `re_...` |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | `AIzaSy...` (Referrer-restricted) |
| `GOOGLE_MAPS_API_KEY` | `AIzaSy...` (Server-side geocoding) |
| `SIGNALWIRE_PROJECT_ID` | `2687f308-939e-4e73-97bd-4edfc0d7fd5a` |
| `SIGNALWIRE_API_TOKEN` | *Live API Token* |
| `SIGNALWIRE_SPACE_URL` | `lets-get-quoted.signalwire.com` |
| `SIGNALWIRE_FROM_NUMBER` | `+19479412323` |
| `LGQ_SMS_PROVIDER` | `signalwire` |
| `LGQ_SMS_SHARED_ENABLED` | `1` |
| `LGQ_SMS_DISPATCH_ENABLED` | `1` |
| `LGQ_SMS_INBOUND_ACTION_WORKER_ENABLED` | `1` |
| `CRON_SECRET` | *Vercel Cron Secret Token* |
| `LGQ_PRICING_DASHBOARD_ENABLED` | `1` |
| `LGQ_BASE_PLAN_SUBSCRIPTION_CHECKOUT_ENABLED` | `1` |
| `LGQ_BASE_PLAN_SUBSCRIPTION_CANCELLATION_ENABLED` | `1` |
| `LGQ_TOP_UP_PURCHASE_ENABLED` | `1` |
| `LGQ_OVERAGE_SELF_SERVE_ENABLED` | `1` |
| `LGQ_STRIPE_MERCHANT_ONBOARDING_V2_ENABLED` | `1` |

---

## 8. Final Go-Live Verification Step

1. **Deploy to Vercel Production**.
2. Run live preflight verification in production:
   ```bash
   npm run preflight:prices
   ```
3. Complete 1 live end-to-end checkout with a live test transaction.
4. Verify webhook receipt and account provisioning in `/dashboard/settings`.
