import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  deliverSingleWebhookTask,
  runWebhookDeliveryBatch,
  type ClaimedWebhookTask,
} from '@/lib/public-api/webhook-delivery-worker';

vi.mock('@/lib/public-api/webhook-vault-crypto', () => ({
  decryptWebhookSecret: vi.fn((secret) => {
    if (secret.data === 'bad') throw new Error('Decryption failed');
    return 'whsec_testkey1234567890123456789012345678';
  }),
}));

vi.mock('@/lib/public-api/ssrf-guard', () => ({
  // resolvedIp and parsedUrl are what the worker pins the connection to, so the
  // stub has to carry them the way the real validator does.
  validateWebhookUrl: vi.fn(async (raw: string) => ({
    safe: true,
    resolvedIp: '93.184.216.34',
    parsedUrl: new URL(raw),
  })),
}));

// Delivery no longer goes through global fetch: it goes to the address the SSRF
// check already inspected, so there is no second DNS lookup to race.
const postToPinnedAddress = vi.fn();
vi.mock('@/lib/public-api/pinned-fetch', () => ({
  postToPinnedAddress: (...args: unknown[]) => postToPinnedAddress(...args),
}));

const mockTask = (): ClaimedWebhookTask => ({
  delivery_id: 'del_123',
  account_id: 'acc_123',
  subscription_id: 'sub_123',
  lease_token: 'lease_abc',
  lease_expires_at: '2026-09-01T10:05:00Z',
  target_url: 'https://example.com/webhook',
  encrypted_secret: { alg: 'AES', v: '1', data: 'good', iv: 'iv', tag: 'tag' } as any,
  event_id: 'evt_123',
  event_payload: { id: 'lead_1' },
  attempt_number: 1,
});

describe('Webhook Delivery Worker - Coverage', () => {
  let mockAdmin: any;
  let rpcCalls: any[];

  beforeEach(() => {
    rpcCalls = [];
    mockAdmin = {
      rpc: vi.fn((method, args) => {
        rpcCalls.push({ method, args });
        return Promise.resolve({ data: null, error: null });
      }),
    };
    postToPinnedAddress.mockReset();
  });

  it('fails with dead_letter if decryption throws', async () => {
    const task = mockTask();
    (task.encrypted_secret as any).data = 'bad';
    const outcome = await deliverSingleWebhookTask(mockAdmin, task);
    expect(outcome).toBe('dead_letter');
    expect(rpcCalls[0].method).toBe('fail_webhook_delivery');
    expect(rpcCalls[0].args.p_error_code).toBe('crypto_secret_invalid');
  });

  it('completes delivery on 200 OK', async () => {
    postToPinnedAddress.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => 'Success',
    });
    const outcome = await deliverSingleWebhookTask(mockAdmin, mockTask());
    expect(outcome).toBe('completed');
    expect(rpcCalls[0].method).toBe('complete_webhook_delivery');
    expect(rpcCalls[0].args.p_http_status).toBe(200);
    expect(rpcCalls[0].args.p_response_preview).toBe('Success');
  });

  it('disables subscription on 410 Gone', async () => {
    postToPinnedAddress.mockResolvedValue({
      ok: false,
      status: 410,
      text: async () => 'Gone forever',
    });
    const outcome = await deliverSingleWebhookTask(mockAdmin, mockTask());
    expect(outcome).toBe('disabled');
    expect(rpcCalls[0].method).toBe('fail_webhook_delivery');
    expect(rpcCalls[0].args.p_error_code).toBe('http_410_gone');
    expect(rpcCalls[0].args.p_disable_subscription).toBe(true);
  });

  it('retries on 429 Too Many Requests with Retry-After', async () => {
    postToPinnedAddress.mockResolvedValue({
      ok: false,
      status: 429,
      headers: new Headers({ 'retry-after': '120' }),
      text: async () => 'Slow down',
    });
    const outcome = await deliverSingleWebhookTask(mockAdmin, mockTask());
    expect(outcome).toBe('failed');
    expect(rpcCalls[0].method).toBe('fail_webhook_delivery');
    expect(rpcCalls[0].args.p_error_code).toBe('http_429_rate_limited');
    expect(rpcCalls[0].args.p_backoff_seconds).toBe(120);
    expect(rpcCalls[0].args.p_retryable).toBe(true);
  });

  it('dead_letters on 400 Bad Request', async () => {
    postToPinnedAddress.mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => 'Bad Request',
    });
    const outcome = await deliverSingleWebhookTask(mockAdmin, mockTask());
    expect(outcome).toBe('dead_letter');
    expect(rpcCalls[0].method).toBe('fail_webhook_delivery');
    expect(rpcCalls[0].args.p_error_code).toBe('http_400');
    expect(rpcCalls[0].args.p_retryable).toBe(false);
  });

  it('retries on 500 Server Error', async () => {
    postToPinnedAddress.mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
    });
    const outcome = await deliverSingleWebhookTask(mockAdmin, mockTask());
    expect(outcome).toBe('failed');
    expect(rpcCalls[0].method).toBe('fail_webhook_delivery');
    expect(rpcCalls[0].args.p_error_code).toBe('http_500');
    expect(rpcCalls[0].args.p_retryable).toBe(true);
    expect(rpcCalls[0].args.p_backoff_seconds).toBe(15);
  });

  it('retries on network timeout', async () => {
    const timeoutError = new Error('The operation was aborted due to timeout');
    timeoutError.name = 'TimeoutError';
    postToPinnedAddress.mockRejectedValue(timeoutError);
    const outcome = await deliverSingleWebhookTask(mockAdmin, mockTask());
    expect(outcome).toBe('failed');
    expect(rpcCalls[0].method).toBe('fail_webhook_delivery');
    expect(rpcCalls[0].args.p_error_code).toBe('timeout');
    expect(rpcCalls[0].args.p_retryable).toBe(true);
  });

  it('retries on generic network error', async () => {
    postToPinnedAddress.mockRejectedValue(new Error('fetch failed'));
    const outcome = await deliverSingleWebhookTask(mockAdmin, mockTask());
    expect(outcome).toBe('failed');
    expect(rpcCalls[0].method).toBe('fail_webhook_delivery');
    expect(rpcCalls[0].args.p_error_code).toBe('network_error');
    expect(rpcCalls[0].args.p_retryable).toBe(true);
  });

  describe('runWebhookDeliveryBatch looping', () => {
    it('processes multiple tasks and counts outcomes', async () => {
      mockAdmin.rpc = vi.fn((method) => {
        if (method === 'claim_webhook_delivery_tasks') {
          return Promise.resolve({
            data: [
              mockTask(),
              { ...mockTask(), delivery_id: 'fail', target_url: 'https://fail.com' },
              { ...mockTask(), delivery_id: 'dead', target_url: 'https://dead.com' },
              { ...mockTask(), delivery_id: 'dis', target_url: 'https://dis.com' },
            ],
            error: null,
          });
        }
        return Promise.resolve({ data: null, error: null });
      });

      postToPinnedAddress.mockImplementation((url: URL) => {
        if (url.hostname === 'fail.com') return Promise.resolve({ ok: false, status: 500, text: async()=>'' });
        if (url.hostname === 'dead.com') return Promise.resolve({ ok: false, status: 400, text: async()=>'' });
        if (url.hostname === 'dis.com') return Promise.resolve({ ok: false, status: 410, text: async()=>'' });
        return Promise.resolve({ ok: true, status: 200, text: async()=>'' });
      }) as any;

      const result = await runWebhookDeliveryBatch(10, mockAdmin);
      expect(result).toEqual({
        claimedCount: 4,
        completedCount: 1,
        failedCount: 1,
        deadLetterCount: 1,
        disabledCount: 1,
      });
    });
  });
});
