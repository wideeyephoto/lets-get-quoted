import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

const mocks = vi.hoisted(() => ({ getRequest: vi.fn(), sendSms: vi.fn(), admin: vi.fn() }));
vi.mock('@/lib/auth', () => ({ createAdminClient: mocks.admin }));
vi.mock('@/lib/quick-stop-requests', () => ({ getQuickStopRequest: mocks.getRequest, logQuickStopEvent: vi.fn() }));
vi.mock('@/lib/quick-stop-refund-recovery', () => ({ queueQuickStopRefund: vi.fn(), processQuickStopRefunds: vi.fn() }));
vi.mock('@/lib/sms', () => ({ sendQuickStopOfferSms: mocks.sendSms, sendQuickStopConfirmedSms: vi.fn() }));
vi.mock('@/lib/email', () => ({ getAccountOwnerEmail: vi.fn(), sendContractorAlertEmail: vi.fn() }));
import { sendQuickStopOffer } from '@/lib/quick-stop-payments';

describe('published Quick Stop offer delivery', () => {
  const request = {
    id: 'request', status: 'awaiting_customer_payment', job_id: 'job', payment_id: 'payment',
    fee_cents: 9900, client_phone: '+15555550100', arrival_date: '2026-09-14', arrival_start: '13:00', arrival_end: '14:00',
    payment_deadline_at: '2026-09-14T12:15:00Z',
  };
  const session = {} as SupabaseClient;
  beforeEach(() => {
    vi.clearAllMocks(); vi.useFakeTimers(); vi.setSystemTime('2026-09-14T12:00:00Z');
    mocks.getRequest.mockResolvedValue(request);
    const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: { company_name: 'Contractor' }, error: null }) };
    mocks.admin.mockReturnValue({ from: vi.fn().mockReturnValue(query) });
    mocks.sendSms.mockResolvedValue(undefined);
  });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it('retries delivery with the same existing payment and SMS idempotency key', async () => {
    await sendQuickStopOffer(session, 'account', 'request');
    await sendQuickStopOffer(session, 'account', 'request');
    expect(mocks.sendSms).toHaveBeenCalledTimes(2);
    expect(mocks.sendSms).toHaveBeenLastCalledWith(expect.objectContaining({
      payUrl: 'http://localhost:3010/pay/payment', idempotencyKey: 'quick-stop:request:offer:payment', minutes: 15,
    }));
  });

  it.each(['contractor_offer_sent', 'offer_expired', 'customer_canceled'])('never sends a payment link from %s', async (status) => {
    mocks.getRequest.mockResolvedValue({ ...request, status });
    await sendQuickStopOffer(session, 'account', 'request');
    expect(mocks.sendSms).not.toHaveBeenCalled();
  });

  it('does not turn notification failure into an offer-creation failure', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.sendSms.mockRejectedValue(new Error('delivery unavailable'));
    await expect(sendQuickStopOffer(session, 'account', 'request')).resolves.toBeUndefined();
    expect(log).toHaveBeenCalled();
  });

  it('skips delivery once the durable payment deadline has elapsed', async () => {
    vi.setSystemTime('2026-09-14T12:16:00Z');
    await sendQuickStopOffer(session, 'account', 'request');
    expect(mocks.sendSms).not.toHaveBeenCalled();
  });
});
