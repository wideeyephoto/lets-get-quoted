import { handleStripeTopUpWebhook } from '@/lib/billing/stripe-top-up-webhook';

// Stripe signs the unparsed body, so this route must remain dynamic and use the
// Node.js runtime. It is inert unless its exact-1 server-only flag is enabled.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request) {
  return handleStripeTopUpWebhook(request);
}
