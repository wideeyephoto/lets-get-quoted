import { describe, it, expect } from 'vitest';
import {
  deliverSingleWebhookTask,
  calculateExponentialBackoffSeconds,
  type ClaimedWebhookTask,
} from '@/lib/public-api/webhook-delivery-worker';
import { encryptWebhookSecret } from '@/lib/public-api/webhook-vault-crypto';

describe('Webhook Delivery Worker', () => {
  const secret = 'whsec_testkey1234567890123456789012345678';
  const encryptedSecret = encryptWebhookSecret(secret);

  it('calculates expected backoff schedule for retry attempts', () => {
    expect(calculateExponentialBackoffSeconds(1)).toBe(15);
    expect(calculateExponentialBackoffSeconds(2)).toBe(60);
    expect(calculateExponentialBackoffSeconds(3)).toBe(300);
    expect(calculateExponentialBackoffSeconds(4)).toBe(900);
    expect(calculateExponentialBackoffSeconds(5)).toBe(3600);
    expect(calculateExponentialBackoffSeconds(6)).toBe(7200);
    expect(calculateExponentialBackoffSeconds(7)).toBe(14400);
  });

  it('immediately fails and disables delivery if target URL violates SSRF policy', async () => {
    const mockTask: ClaimedWebhookTask = {
      delivery_id: 'del_123',
      account_id: 'acc_123',
      subscription_id: 'sub_123',
      lease_token: 'lease_abc',
      lease_expires_at: '2026-09-01T10:05:00Z',
      target_url: 'http://169.254.169.254/latest/meta-data', // AWS metadata SSRF attempt
      encrypted_secret: encryptedSecret,
      event_id: 'evt_123',
      event_payload: { id: 'lead_1' },
      attempt_number: 1,
    };

    let rpcCalled = false;
    const mockAdmin = {
      rpc: (method: string, args: Record<string, unknown>) => {
        rpcCalled = true;
        expect(method).toBe('fail_webhook_delivery');
        expect(args.p_delivery_id).toBe('del_123');
        expect(args.p_disable_subscription).toBe(true);
        expect(args.p_error_code).toBe('ssrf_blocked');
        return Promise.resolve({ data: 'disabled', error: null });
      },
    };

    const outcome = await deliverSingleWebhookTask(mockAdmin as any, mockTask);
    expect(outcome).toBe('disabled');
    expect(rpcCalled).toBe(true);
  });
});
