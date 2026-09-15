import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/sms/status/route';

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), log: vi.fn(), signature: vi.fn() }));
vi.mock('@/lib/auth', () => ({ createAdminClient: () => ({ rpc: mocks.rpc, from: mocks.from }) }));
vi.mock('@/lib/webhook-failures', () => ({ logWebhookFailure: mocks.log }));
vi.mock('@/lib/sms-provider', () => ({
  hasSignatureHeader: () => true, validateWebhookSignature: mocks.signature, SIMULATED_PROVIDER_ID: 'SIMULATED',
}));
const receiptId = '11111111-1111-4111-8111-111111111111';
const eventId = '22222222-2222-4222-8222-222222222222';
const request = (code = '21610', status = 'undelivered') => new Request('https://letsgetquoted.com/api/sms/status', {
  method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ MessageSid: 'provider-message', MessageStatus: status, ErrorCode: code }),
});
beforeEach(() => {
  vi.clearAllMocks();
  mocks.signature.mockReturnValue({ ok: true, provider: 'signalwire' });
  mocks.rpc.mockImplementation(async (name: string) => {
    if (name === 'apply_sms_delivery_status_webhook') return { data: [{
      status_disposition: 'applied', webhook_receipt_id: receiptId,
      sms_event_id: eventId, projected_status: 'failed',
    }], error: null };
    return { data: name === 'apply_sms_carrier_opt_out_receipt' ? 'applied' : true, error: null };
  });
});

describe('carrier opt-out acknowledgement', () => {
  it.each(['applied', 'ignored_newer_preference', 'review_unbound_sender'])('acknowledges durable %s disposition', async (disposition) => {
    const original = mocks.rpc.getMockImplementation()!;
    mocks.rpc.mockImplementation(async (name, params) => name === 'apply_sms_carrier_opt_out_receipt'
      ? { data: disposition, error: null } : original(name, params));
    expect((await POST(request())).status).toBe(204);
    expect(mocks.rpc).toHaveBeenCalledWith('apply_sms_carrier_opt_out_receipt', { p_receipt_id: receiptId });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it.each([{ code: '40001' }, { code: 'PGRST202' }, null])('does not acknowledge a missing or failed consent projection: %j', async (error) => {
    const original = mocks.rpc.getMockImplementation()!;
    mocks.rpc.mockImplementation(async (name, params) => name === 'apply_sms_carrier_opt_out_receipt'
      ? { data: null, error } : original(name, params));
    expect((await POST(request())).status).toBe(503);
    expect(mocks.rpc.mock.calls.some(([name]) => name === 'record_sms_lead_delivery_history')).toBe(false);
    expect(mocks.log).toHaveBeenCalled();
  });

  it('retries the canonical projection after ingress already committed', async () => {
    const original = mocks.rpc.getMockImplementation()!;
    let attempts = 0;
    mocks.rpc.mockImplementation(async (name, params) => {
      if (name === 'apply_sms_carrier_opt_out_receipt') {
        attempts += 1;
        return attempts === 1 ? { data: null, error: { code: '08006' } } : { data: 'applied', error: null };
      }
      if (name === 'apply_sms_delivery_status_webhook') return { data: [{
        status_disposition: 'duplicate', webhook_receipt_id: receiptId, sms_event_id: eventId,
      }], error: null };
      return original(name, params);
    });
    expect((await POST(request())).status).toBe(503);
    expect((await POST(request())).status).toBe(204);
    expect(attempts).toBe(2);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it.each(['30003', '30004', '30006', '30007'])('does not reinterpret carrier code %s as consent withdrawal', async (code) => {
    expect((await POST(request(code))).status).toBe(204);
    expect(mocks.rpc.mock.calls.some(([name]) => name === 'apply_sms_carrier_opt_out_receipt')).toBe(false);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('rejects an invalid signature without any consent or receipt mutation', async () => {
    mocks.signature.mockReturnValue({ ok: false, reason: 'invalid' });
    expect((await POST(request())).status).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
