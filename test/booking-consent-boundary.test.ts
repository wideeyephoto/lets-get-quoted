import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  consent: vi.fn(), send: vi.fn(), createLead: vi.fn(), createJob: vi.fn(), rate: vi.fn(),
}));
vi.mock('@/lib/leads', () => ({ createLead: mocks.createLead }));
vi.mock('@/lib/jobs', () => ({ createJob: mocks.createJob }));
vi.mock('@/lib/business-name', () => ({ loadBusinessName: vi.fn().mockResolvedValue('Test Plumbing') }));
vi.mock('@/lib/email', () => ({
  getAccountOwnerEmail: vi.fn().mockResolvedValue(null), sendLeadNotificationEmail: vi.fn(),
  sendBookingConfirmationEmail: vi.fn(),
}));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimitStrict: mocks.rate }));
vi.mock('@/lib/sms', () => ({
  ensureSmsConsentBaseline: mocks.consent, sendBookingRequestCustomerConfirmationSms: mocks.send,
  sendOwnerBookingRequestAlertSms: vi.fn(),
}));
import { createBooking, createBookingRequestLead } from '@/lib/booking';
const input = { name: 'Test Customer', phone: '+12485550122', email: null, address: null,
  description: 'Repair', serviceName: null, dateKey: '2026-09-10', dateLabel: 'Thursday',
  time: '09:00', endTime: '12:00', timeLabel: 'Morning' };
const admin = {
  from: (table: string) => {
    const chain: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'or', 'limit', 'update']) chain[method] = () => chain;
    chain.maybeSingle = async () => ({ data: table === 'jobs' ? { id: 'existing-job' } : {}, error: null });
    return chain;
  },
} as never;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createLead.mockResolvedValue({ id: 'lead-1' });
  mocks.consent.mockResolvedValue(true);
  mocks.rate.mockResolvedValue(true);
});
describe.each([
  ['scheduled booking', createBooking],
  ['callback request', createBookingRequestLead],
] as const)('%s consent boundary', (_name, create) => {
  it('persists approved consent before enqueueing the customer text', async () => {
    await create(admin, 'account-1', input);
    expect(mocks.consent).toHaveBeenCalledWith('account-1', input.phone, 'portal_link_request', admin);
    expect(mocks.send).toHaveBeenCalledOnce();
    expect(mocks.consent.mock.invocationCallOrder[0]).toBeLessThan(mocks.send.mock.invocationCallOrder[0]);
  });
  it('preserves the lead and skips SMS when the caller has opted out', async () => {
    mocks.consent.mockResolvedValue(false);
    await expect(create(admin, 'account-1', input)).resolves.toEqual({ id: 'lead-1' });
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it('preserves the lead and does not enqueue after a consent storage failure', async () => {
    mocks.consent.mockRejectedValue(new Error('database unavailable'));
    await expect(create(admin, 'account-1', input)).resolves.toEqual({ id: 'lead-1' });
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it('does not write consent or send after the recipient cap is exhausted', async () => {
    mocks.rate.mockResolvedValue(false);
    await create(admin, 'account-1', input);
    expect(mocks.consent).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
it('records the voice-call source for in-call bookings', async () => {
  await createBooking(admin, 'account-1', { ...input, sourceVoiceProviderCallId: 'call-1' });
  expect(mocks.consent).toHaveBeenCalledWith('account-1', input.phone, 'missed_call_text_back', admin);
});
