import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { validateQuickStopOfferWindow } from '@/lib/quick-stop-offers';

const mocks = vi.hoisted(() => ({
  requireOfficeContext: vi.fn(), createAdminClient: vi.fn(), getQuickStopRequest: vi.fn(),
  computeQuickStopRoute: vi.fn(), sendQuickStopOffer: vi.fn(), rpc: vi.fn(), revalidatePath: vi.fn(),
}));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock('@/lib/auth', () => ({ requireOfficeContext: mocks.requireOfficeContext, createAdminClient: mocks.createAdminClient }));
vi.mock('@/lib/quick-stop-requests', () => ({ getQuickStopRequest: mocks.getQuickStopRequest, logQuickStopEvent: vi.fn() }));
vi.mock('@/lib/quick-stop-route', () => ({ computeQuickStopRoute: mocks.computeQuickStopRoute }));
vi.mock('@/lib/quick-stop-payments', () => ({ sendQuickStopOffer: mocks.sendQuickStopOffer }));
vi.mock('@/lib/quick-stop-refunds', () => ({ resolveQuickStopCancellation: vi.fn() }));
vi.mock('@/lib/sms', () => ({ sendQuickStopStatusSms: vi.fn() }));
vi.mock('@/lib/geocode', () => ({ geocodeArea: vi.fn() }));
import { completeQuickStopAction, createQuickStopOfferAction } from '@/app/dashboard/quick-stops/actions';

const hours = { weekdays: [0, 1, 2, 3, 4, 5, 6], earliestTime: '00:00', latestEnd: '23:59' };

describe('contractor offer window validation', () => {
  it('uses the account timezone for a same-day window, including when UTC has passed it', () => {
    const now = Date.parse('2026-09-14T12:00:00Z');
    expect(() => validateQuickStopOfferWindow('2026-09-14', '09:00', '10:00', 'America/Los_Angeles', hours, now)).not.toThrow();
    expect(() => validateQuickStopOfferWindow('2026-09-14', '03:00', '04:00', 'America/Los_Angeles', hours, now)).toThrow(/has not ended/);
  });

  it.each([
    ['2026-02-30', '09:00', '10:00', 'America/New_York'],
    ['2027-03-14', '02:15', '03:30', 'America/New_York'],
    ['2027-03-14', '09:00', '10:00', 'Bad/Zone'],
    ['not-a-date', '09:00', '10:00', 'America/New_York'],
  ])('rejects a malformed or nonexistent local window: %s %s', (date, start, end, zone) => {
    expect(() => validateQuickStopOfferWindow(date, start, end, zone, hours, Date.parse('2026-01-01T00:00:00Z'))).toThrow(/valid arrival/);
  });

  it('allows a negotiated date beyond the customer request horizon', () => {
    expect(() => validateQuickStopOfferWindow('2026-10-14', '09:00', '10:00', 'America/New_York', hours, Date.parse('2026-09-14T12:00:00Z'))).not.toThrow();
  });
});

describe('atomic offer action', () => {
  let session: { from: ReturnType<typeof vi.fn> };
  const form = () => {
    const data = new FormData();
    data.set('arrivalDate', '2026-09-16'); data.set('arrivalStart', '09:00');
    data.set('arrivalEnd', '11:00'); data.set('fee', '99');
    return data;
  };

  beforeEach(() => {
    vi.clearAllMocks(); vi.useFakeTimers(); vi.setSystemTime('2026-09-14T12:00:00Z');
    const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: {
      timezone: 'America/New_York', connect_onboarded: true, stripe_connect_id: 'acct_test', extra_stop_days_ahead: 0,
    }, error: null }) };
    session = { from: vi.fn().mockReturnValue(query) };
    mocks.requireOfficeContext.mockResolvedValue({ supabase: session, accountId: 'account' });
    mocks.createAdminClient.mockReturnValue({ rpc: mocks.rpc });
    mocks.getQuickStopRequest.mockResolvedValue({ id: 'request', status: 'awaiting_contractor', lat: null, lng: null });
    mocks.computeQuickStopRoute.mockResolvedValue({ detourMiles: null, detourMinutes: null, routeExtensionMinutes: null });
    mocks.rpc.mockResolvedValue({ data: { id: 'request', status: 'awaiting_customer_payment', job_id: 'job', payment_id: 'payment' }, error: null });
  });
  afterEach(() => vi.useRealTimers());

  it('publishes the date and monetary fields atomically before notification', async () => {
    await createQuickStopOfferAction('request', form());
    expect(mocks.requireOfficeContext).toHaveBeenCalledWith('schedule.write', 'jobs.write', 'payments.collect');
    expect(mocks.rpc).toHaveBeenCalledWith('create_quick_stop_offer', expect.objectContaining({
      p_account_id: 'account', p_request_id: 'request',
      p_offer: expect.objectContaining({ arrival_date: '2026-09-16', arrival_start: '09:00', arrival_end: '11:00', fee_cents: 9900 }),
    }));
    expect(mocks.rpc.mock.invocationCallOrder[0]).toBeLessThan(mocks.sendQuickStopOffer.mock.invocationCallOrder[0]);
    expect(session.from).toHaveBeenCalledTimes(1); // Settings only; no pre-transaction request claim.
  });

  it('does not claim anything when route work fails', async () => {
    mocks.computeQuickStopRoute.mockRejectedValue(new Error('route unavailable'));
    await expect(createQuickStopOfferAction('request', form())).rejects.toThrow('route unavailable');
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.sendQuickStopOffer).not.toHaveBeenCalled();
  });

  it('surfaces database publication failure without attempting to send a pay link', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'day is full' } });
    await expect(createQuickStopOfferAction('request', form())).rejects.toThrow('day is full');
    expect(mocks.sendQuickStopOffer).not.toHaveBeenCalled();
  });

  it('rejects an elapsed offer before any database reservation', async () => {
    const data = form(); data.set('arrivalDate', '2026-09-13');
    await expect(createQuickStopOfferAction('request', data)).rejects.toThrow('has not ended');
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('does not expose staff dispute-resolution transitions through the contractor completion action', async () => {
    mocks.getQuickStopRequest.mockResolvedValue({ id: 'request', status: 'disputed' });
    await expect(completeQuickStopAction('request')).rejects.toThrow('can’t be completed');
    expect(session.from).not.toHaveBeenCalled();
  });
});
