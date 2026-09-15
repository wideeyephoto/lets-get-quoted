import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ office: vi.fn(), admin: vi.fn(), request: vi.fn(), route: vi.fn(), rpc: vi.fn(), sms: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/auth', () => ({ requireOfficeContext: mocks.office, createAdminClient: mocks.admin }));
vi.mock('@/lib/quick-stop-requests', () => ({ getQuickStopRequest: mocks.request, logQuickStopEvent: vi.fn() }));
vi.mock('@/lib/quick-stop-route', () => ({ computeQuickStopRoute: mocks.route }));
vi.mock('@/lib/quick-stop-refunds', () => ({ resolveQuickStopCancellation: vi.fn() }));
vi.mock('@/lib/quick-stop-refund-recovery', () => ({ queueQuickStopRefund: vi.fn(), processQuickStopRefunds: vi.fn() }));
vi.mock('@/lib/sms', () => ({ sendQuickStopOfferSms: mocks.sms, sendQuickStopStatusSms: vi.fn(), sendQuickStopConfirmedSms: vi.fn() }));
vi.mock('@/lib/email', () => ({ getAccountOwnerEmail: vi.fn(), sendContractorAlertEmail: vi.fn() }));
vi.mock('@/lib/geocode', () => ({ geocodeArea: vi.fn() }));
import { createQuickStopOfferAction } from '@/app/dashboard/quick-stops/actions';
import { sendQuickStopOffer } from '@/lib/quick-stop-payments';

const initial = { id: 'request', status: 'awaiting_contractor', lat: null, lng: null };
const published = { ...initial, status: 'awaiting_customer_payment', job_id: 'job', payment_id: 'payment',
  fee_cents: 12000, client_phone: '+15555550100', arrival_date: '2026-07-30', arrival_start: '13:00', arrival_end: '15:00', payment_deadline_at: '2026-07-29T14:15:00Z' };
let client: { from: ReturnType<typeof vi.fn>; rpc: typeof mocks.rpc };
function form(overrides: Record<string, string> = {}) {
  const data = new FormData();
  for (const [key, value] of Object.entries({ arrivalDate: '2026-07-30', arrivalStart: '13:00', arrivalEnd: '15:00', fee: '120', ...overrides })) data.set(key, value);
  return data;
}
beforeEach(() => {
  vi.resetAllMocks(); vi.useFakeTimers(); vi.setSystemTime('2026-07-29T14:00:00Z');
  const account = { timezone: 'America/New_York', connect_onboarded: true, stripe_connect_id: 'acct_test',
    extra_stop_days_ahead: 1, extra_stop_weekdays: '1,2,3,4,5', extra_stop_earliest_time: '08:00', extra_stop_latest_end: '20:00' };
  const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: account, error: null }),
    maybeSingle: vi.fn().mockResolvedValue({ data: { company_name: 'Contractor' }, error: null }) };
  client = { from: vi.fn().mockReturnValue(query), rpc: mocks.rpc };
  mocks.office.mockResolvedValue({ supabase: client, accountId: 'account' }); mocks.admin.mockReturnValue(client);
  mocks.request.mockResolvedValue(published).mockResolvedValueOnce(initial);
  mocks.route.mockResolvedValue({ detourMiles: 1, detourMinutes: 2, routeExtensionMinutes: 3 });
  mocks.rpc.mockResolvedValue({ data: published, error: null }); mocks.sms.mockResolvedValue(undefined);
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('offer guards before atomic publication', () => {
  it.each([{ arrivalDate: '2026-07-28', arrivalStart: '13:00', arrivalEnd: '15:00' }, { arrivalDate: '2026-07-29', arrivalStart: '08:00', arrivalEnd: '09:00' }])(
    'rejects an elapsed account-local window: %j', async (window) => {
      await expect(createQuickStopOfferAction('request', form(window))).rejects.toThrow(/has not ended/i);
      expect(mocks.rpc).not.toHaveBeenCalled(); expect(mocks.sms).not.toHaveBeenCalled();
    });
  it('allows a contractor-negotiated date beyond the customer picker horizon', async () => {
    await createQuickStopOfferAction('request', form({ arrivalDate: '2026-07-31' }));
    expect(mocks.rpc).toHaveBeenCalledWith('create_quick_stop_offer', expect.objectContaining({
      p_account_id: 'account', p_request_id: 'request', p_offer: expect.objectContaining({ arrival_date: '2026-07-31' }),
    }));
  });
  it.each(['Quick Stop limit reached', 'injected payment failure'])(
    'does not send a pay link when the transaction fails: %s', async (message) => {
      // Real concurrent reservation and rollback are checked by test:pg17:quick-stop-offers.
      mocks.rpc.mockResolvedValue({ data: null, error: { message } });
      await expect(createQuickStopOfferAction('request', form())).rejects.toThrow(message);
      expect(mocks.rpc).toHaveBeenCalledOnce(); expect(mocks.sms).not.toHaveBeenCalled();
    });
});
describe('delivery failure after the offer commits', () => {
  it('retries the same payment link without reserving another offer', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.sms.mockRejectedValueOnce(new Error('SMS temporarily unavailable'));
    await expect(createQuickStopOfferAction('request', form())).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledWith('Quick Stop offer notification failed:', 'SMS temporarily unavailable');
    await sendQuickStopOffer(client as never, 'account', 'request');
    expect(mocks.rpc).toHaveBeenCalledOnce(); expect(mocks.sms).toHaveBeenCalledTimes(2);
    expect(mocks.sms.mock.calls[0][0]).toEqual(mocks.sms.mock.calls[1][0]);
    expect(mocks.sms.mock.calls[1][0]).toMatchObject({ payUrl: 'http://localhost:3010/pay/payment', idempotencyKey: 'quick-stop:request:offer:payment' });
  });
});
