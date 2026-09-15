import { describe, it, expect, vi } from 'vitest';
import { POST } from '@/app/api/stripe/billing/webhook/route';

vi.mock('@/lib/billing/stripe-billing-webhook', () => ({
  handleStripeBillingWebhook: vi.fn().mockResolvedValue(new Response('OK')),
}));

describe('Stripe Billing Webhook Route', () => {
  it('calls handleStripeBillingWebhook', async () => {
    const req = new Request('http://localhost/api/stripe/billing/webhook', { method: 'POST' });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toBe('OK');
  });
});
