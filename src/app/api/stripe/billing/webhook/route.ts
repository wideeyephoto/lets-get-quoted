import { handleStripeBillingWebhook } from '@/lib/billing/stripe-billing-webhook';

// Stripe signs the unparsed request body, so this endpoint must always execute
// dynamically in the Node.js runtime. The handler is inert unless the exact-1
// server flag in stripe-billing-webhook.ts is enabled.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const POST = handleStripeBillingWebhook;
