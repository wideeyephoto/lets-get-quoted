import { describe, it, expect, vi } from 'vitest';
import { POST } from '@/app/api/stripe/top-ups/webhook/route';

vi.mock('@/lib/billing/stripe-top-up-webhook', () => ({
  handleStripeTopUpWebhook: vi.fn().mockResolvedValue(new Response('OK')),
}));

describe('Stripe Top Up Webhook Route', () => {
  it('calls handleStripeTopUpWebhook', async () => {
    const req = new Request('http://localhost/api/stripe/top-ups/webhook', { method: 'POST' });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toBe('OK');
  });
});
