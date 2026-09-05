import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/sms/status/route';

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), logFailure: vi.fn() }));
vi.mock('@/lib/auth', () => ({ createAdminClient: () => ({ rpc: mocks.rpc, from: mocks.from }) }));
vi.mock('@/lib/webhook-failures', () => ({ logWebhookFailure: mocks.logFailure }));
vi.mock('@/lib/sms-provider', () => ({
  hasSignatureHeader: () => true,
  validateWebhookSignature: () => ({ ok: true, provider: 'twilio' }),
  SIMULATED_PROVIDER_ID: 'SIMULATED',
}));
const request = () => new Request('http://localhost/api/sms/status', {
  method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: 'MessageSid=SMreal&MessageStatus=delivered',
});
const ingress = (disposition = 'applied', eventId: string | null = 'event-1') => ({ data: [{
  status_disposition: disposition, webhook_receipt_id: 'receipt-1', sms_event_id: eventId,
  previous_status: 'sent', projected_status: 'delivered',
}], error: null });
beforeEach(() => { vi.clearAllMocks(); });

describe('durable lead delivery history', () => {
  it.each(['applied', 'duplicate', 'ignored_terminal'])('uses the canonical atomic RPC for %s receipts', async (disposition) => {
    mocks.rpc.mockResolvedValueOnce(ingress(disposition)).mockResolvedValueOnce({ data: false, error: null });
    expect((await POST(request())).status).toBe(204);
    expect(mocks.rpc).toHaveBeenLastCalledWith('record_sms_lead_delivery_history', { p_sms_event_id: 'event-1' });
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it('returns a retryable failure and recovers on a duplicate receipt', async () => {
    mocks.rpc.mockResolvedValueOnce(ingress()).mockResolvedValueOnce({ data: null, error: { code: '40001' } })
      .mockResolvedValueOnce(ingress('duplicate')).mockResolvedValueOnce({ data: true, error: null });
    expect((await POST(request())).status).toBe(503);
    expect((await POST(request())).status).toBe(204);
    expect(mocks.rpc.mock.calls.filter(([name]) => name === 'record_sms_lead_delivery_history')).toHaveLength(2);
  });
  it('does not invent a lead history entry for an unmatched receipt', async () => {
    mocks.rpc.mockResolvedValueOnce(ingress('unmatched_status', null));
    expect((await POST(request())).status).toBe(204);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
});
