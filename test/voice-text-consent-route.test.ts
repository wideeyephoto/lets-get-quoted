import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ consent: vi.fn(), send: vi.fn(), booking: vi.fn() }));
vi.mock('@/lib/auth', () => ({ createAdminClient: () => ({
  from: () => {
    const chain: Record<string, unknown> = {};
    for (const method of ['select', 'eq']) chain[method] = () => chain;
    chain.maybeSingle = async () => ({ data: null, error: null });
    return chain;
  },
}) }));
vi.mock('@/lib/voice/auth', () => ({
  verifyVoiceReceiptAuthorization: () => ({ ok: true }),
  verifyVoiceToolToken: () => ({ ok: true, payload: { accountId: 'account-1',
    providerCallId: 'call-1', callerPhone: '+12485550122' } }),
}));
vi.mock('@/lib/voice/tool-admission', () => ({ authorizeVoiceToolInvocation: async () => true }));
vi.mock('@/lib/voice/caller-identity', () => ({ resolveVoiceCallerIdentity: async () => ({ status: 'customer' }) }));
vi.mock('@/lib/sms', () => ({
  ensureSmsConsentBaseline: mocks.consent,
  sendCallerVoiceBookingLinkSms: mocks.send, sendCallerVoiceBookingConfirmationSms: mocks.send,
}));
vi.mock('@/lib/booking', () => ({
  getAvailableBookingDays: async () => [{ dateKey: '2026-09-10', dayLabel: 'Thursday',
    slots: [{ time: '09:00', endTime: '12:00', label: 'Morning' }] }],
  claimBookingHold: async () => true, createBooking: mocks.booking,
}));
import { POST } from '@/app/api/voice/swaig/route';
const request = (fn: string) => new Request('https://example.test/api/voice/swaig?token=signed', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ function: fn, argument: {
    caller_name: 'Test Customer', requested_date: '2026-09-10', requested_time: '09:00',
  } }),
});
beforeEach(() => {
  vi.clearAllMocks();
  mocks.consent.mockResolvedValue(true);
  mocks.send.mockResolvedValue({ ok: true });
  mocks.booking.mockResolvedValue({ id: 'lead-1' });
});
describe.each(['send_booking_link', 'book_appointment_slot'])('%s', fn => {
  it('does not claim delivery when the text is merely queued', async () => {
    const response = await POST(request(fn));
    const body = await response.json();
    expect(body.response).toContain('queued');
    expect(body.response).not.toContain('I also texted');
    expect(body.response).not.toContain("I've just texted");
  });
  it.each(['STOP', 'database failure'])('does not send on %s', async failure => {
    if (failure === 'STOP') mocks.consent.mockResolvedValue(false);
    else mocks.consent.mockRejectedValue(new Error('database unavailable'));
    const response = await POST(request(fn));
    expect(response.status).toBe(200);
    expect(mocks.send).not.toHaveBeenCalled();
    if (fn === 'book_appointment_slot') expect(mocks.booking).toHaveBeenCalledOnce();
  });
});
