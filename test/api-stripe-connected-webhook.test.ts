import { describe, it, expect, vi } from 'vitest';
import { POST } from '@/app/api/stripe/connected-payments/webhook/route';

vi.mock('@/lib/billing/stripe-connected-payment-webhook', () => ({
  handleStripeConnectedPaymentWebhook: vi.fn().mockResolvedValue(new Response('OK')),
}));

describe('Stripe Connected Payments Webhook Route', () => {
  it('calls handleStripeConnectedPaymentWebhook', async () => {
    const req = new Request('http://localhost/api/stripe/connected-payments/webhook', { method: 'POST' });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toBe('OK');
  });
});
