# Vendor Account Continuity Register

| Vendor | Service / Capability | Plan/Tier | Payment Method & Expiry | Billing Owner | Billing Alert Recipient | Hard Limits | Behavior at Limit | What Breaks | Console URL |
|---|---|---|---|---|---|---|---|---|---|
| **Vercel** | Hosting & Edge Functions | | | | | | | | [Vercel Dashboard](https://vercel.com/dashboard) |
| **Supabase** | Database, Auth, Storage, Edge Functions | | | | | | | | [Supabase Dashboard](https://supabase.com/dashboard) |
| **Stripe** | Payments & Subscriptions | | | | | | | | [Stripe Dashboard](https://dashboard.stripe.com) |
| **SignalWire** | SMS & Voice | | | | | | | | [SignalWire Dashboard](https://signalwire.com/signin) |
| **Resend** | Transactional Email | | | | | | | | [Resend Dashboard](https://resend.com/dashboard) |
| **Google Cloud** | Gemini AI Inference | | | | | | | | [GCP Console](https://console.cloud.google.com) |
| **Google Cloud** | Maps Platform | | | | | | | | [GCP Console](https://console.cloud.google.com) |
| **Google Ads** | Marketing | | | | | | | | [Google Ads](https://ads.google.com) |
| **OpenAI** | AI Inference | | | | | | | | [OpenAI Platform](https://platform.openai.com) |
| **Meta** | Lead Ads | | | | | | | | [Meta Business Suite](https://business.facebook.com) |
| **Printful** | Merchandise Fulfillment | | | | | | | | [Printful Dashboard](https://www.printful.com/dashboard) |
| **Intuit** | Accounting / QuickBooks | | | | | | | | [QuickBooks](https://qbo.intuit.com) |
| **Acorn** | (Vendor specific) | | | | | | | | |
| **Cloudflare** | Turnstile Captcha | | | | | | | | [Cloudflare Dashboard](https://dash.cloudflare.com) |

## Actions Required (Operator)

1. **Confirm a non-expiring payment method and billing alerts** on each vendor, with notices routed to a monitored address from G3 (`finance@` or similar).
2. **SignalWire auto-recharge:** Confirm balance is auto-recharged. SMS and voice stop at zero balance with no application-level symptom.
3. **Size the Supabase free ceilings:** Upgrade now, or document the accepted limits with the number that would force the upgrade (database size, storage across buckets, egress, log retention, connections).
