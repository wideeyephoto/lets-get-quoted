vi.mock('@/lib/voice/tool-admission', () => ({ authorizeVoiceToolInvocation: vi.fn().mockResolvedValue(true) }));
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  adminFrom: vi.fn(),
  resolveIdentity: vi.fn(),
  getStepUpStatus: vi.fn(),
  requestStepUp: vi.fn(),
  verifyStepUp: vi.fn(),
  handleContractorAction: vi.fn(),
  resolveVoiceJob: vi.fn(),
  claimBookingHold: vi.fn(),
  createBooking: vi.fn(),
  sendBookingLink: vi.fn(),
  sendBookingConfirmation: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  createAdminClient: vi.fn(() => ({ from: mocks.adminFrom })),
}));

vi.mock('@/lib/voice/auth', () => ({
  verifyVoiceReceiptAuthorization: vi.fn(() => ({ ok: true })),
  verifyVoiceToolToken: vi.fn(() => ({
    ok: true,
    payload: {
      accountId: '11111111-1111-4111-8111-111111111111',
      providerCallId: 'signed-provider-call-123',
      callerPhone: '+18103042061',
    },
  })),
}));

vi.mock('@/lib/voice/caller-identity', () => ({
  resolveVoiceCallerIdentity: mocks.resolveIdentity,
}));

vi.mock('@/lib/voice/staff-step-up', () => ({
  getVoiceStaffStepUpStatus: mocks.getStepUpStatus,
  requestVoiceStaffStepUp: mocks.requestStepUp,
  verifyVoiceStaffStepUp: mocks.verifyStepUp,
}));

vi.mock('@/lib/voice/contractor-actions', () => ({
  CONTRACTOR_VOICE_FUNCTIONS: new Set([
    'lookup_jobs',
    'update_job_details',
    'update_job_scope',
    'create_or_update_lead',
    'log_crew_time_and_materials',
    'create_job_change_order',
    'append_job_caution_or_note',
    'add_caution_note',
  ]),
  handleContractorVoiceAction: mocks.handleContractorAction,
  resolveVoiceJob: mocks.resolveVoiceJob,
}));

vi.mock('@/lib/booking', () => ({
  getAvailableBookingDays: vi.fn().mockResolvedValue([]),
  claimBookingHold: mocks.claimBookingHold,
  createBooking: mocks.createBooking,
}));

vi.mock('@/lib/sms', () => ({
  sendCallerVoiceBookingLinkSms: mocks.sendBookingLink,
  sendCallerVoiceBookingConfirmationSms: mocks.sendBookingConfirmation,
}));

import { POST } from '@/app/api/voice/swaig/route';
import { authorizeVoiceToolInvocation } from '@/lib/voice/tool-admission';

const staffIdentity = {
  status: 'staff' as const,
  caller: {
    name: 'Brett',
    role: 'owner' as const,
    normalizedPhone: '+18103042061',
    crewId: null,
    hourlyRate: null,
    burdenPct: 15,
  },
};

function request(functionName: string, args: Record<string, unknown> = {}) {
  return new Request('https://example.test/api/voice/swaig?token=signed-token', {
    method: 'POST',
    headers: {
      authorization: `Basic ${Buffer.from('test-user:test-password').toString('base64')}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ function: functionName, argument: args }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(authorizeVoiceToolInvocation).mockResolvedValue(true);
  mocks.resolveIdentity.mockResolvedValue(staffIdentity);
  mocks.getStepUpStatus.mockResolvedValue({
    ok: true,
    verified: false,
    status: 'pending',
    response: 'Before I can save a dispatch change, I need to text a six-digit code to the verified phone calling now.',
  });
});

describe('staff-mode SWAIG application gates', () => {
  it('routes registered staff job lookup without a code or challenge lookup', async () => {
    mocks.handleContractorAction.mockResolvedValueOnce({ handled: true, response: 'Option 1: LGQ-1042.' });
    const response = await POST(request('lookup_jobs', { query: 'Rosa Holbrook' }));
    await expect(response.json()).resolves.toMatchObject({ response: 'Option 1: LGQ-1042.' });
    expect(mocks.handleContractorAction).toHaveBeenCalledWith(expect.objectContaining({ functionName: 'lookup_jobs', caller: staffIdentity.caller, accountId: '11111111-1111-4111-8111-111111111111' }));
    expect(mocks.getStepUpStatus).not.toHaveBeenCalled();
    expect(mocks.requestStepUp).not.toHaveBeenCalled();
  });

  it.each(['request_staff_step_up', 'verify_staff_step_up'])('retires %s without sending or checking a code', async (tool) => {
    const response = await POST(request(tool, { code: '123456' }));
    await expect(response.json()).resolves.toMatchObject({ response: expect.stringContaining('Verification codes are not used') });
    expect(mocks.requestStepUp).not.toHaveBeenCalled();
    expect(mocks.verifyStepUp).not.toHaveBeenCalled();
    expect(mocks.handleContractorAction).not.toHaveBeenCalled();
  });

  it('rejects an ended call before staff lookup or mutation dispatch', async () => {
    vi.mocked(authorizeVoiceToolInvocation).mockResolvedValueOnce(false);
    const response = await POST(request('lookup_jobs', { query: 'Rosa Holbrook' }));
    expect(response.status).toBe(403);
    expect(mocks.resolveIdentity).not.toHaveBeenCalled();
    expect(mocks.handleContractorAction).not.toHaveBeenCalled();
    expect(mocks.requestStepUp).not.toHaveBeenCalled();
  });

  it.each(['ambiguous', 'unavailable'])('rejects a staff update when identity is %s without offering a code', async (status) => {
    mocks.resolveIdentity.mockResolvedValueOnce({ status });
    const response = await POST(request('append_job_caution_or_note', { job_ref_or_client: 'LGQ-1042', note: 'Side gate is locked.' }));
    await expect(response.json()).resolves.toMatchObject({ response: expect.stringContaining('did not save anything') });
    expect(mocks.handleContractorAction).not.toHaveBeenCalled();
    expect(mocks.requestStepUp).not.toHaveBeenCalled();
  });

  it('rejects customer attempts to call the hidden staff lookup tool', async () => {
    mocks.resolveIdentity.mockResolvedValueOnce({ status: 'customer' });
    const response = await POST(request('lookup_jobs', { query: 'Rosa Holbrook' }));
    await expect(response.json()).resolves.toMatchObject({ response: expect.stringMatching(/restricted to verified team members/i) });
    expect(mocks.handleContractorAction).not.toHaveBeenCalled();
  });

  it('rejects a direct hidden customer-booking payload before any booking read or write', async () => {
    const response = await POST(request('book_appointment_slot', {
      caller_name: 'Injected Customer',
      caller_phone: '+12485550105',
      requested_date: '2026-09-04',
      requested_time: '09:00',
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      response: expect.stringMatching(/disabled on staff calls.*nothing was changed/i),
    });
    expect(mocks.resolveIdentity).toHaveBeenCalledTimes(1);
    expect(mocks.adminFrom).not.toHaveBeenCalled();
    expect(mocks.claimBookingHold).not.toHaveBeenCalled();
    expect(mocks.createBooking).not.toHaveBeenCalled();
    expect(mocks.sendBookingConfirmation).not.toHaveBeenCalled();
  });

  it('rejects the hidden booking-link tool and cannot redirect it to an argument phone', async () => {
    const response = await POST(request('send_booking_link', {
      caller_phone: '+12485550105',
    }));

    await expect(response.json()).resolves.toMatchObject({
      response: expect.stringMatching(/not available in contractor mode/i),
    });
    expect(mocks.adminFrom).not.toHaveBeenCalled();
    expect(mocks.sendBookingLink).not.toHaveBeenCalled();
  });

  it('allows registered staff inspection lookup without a verification code', async () => {
    mocks.resolveVoiceJob.mockResolvedValueOnce({ status: 'not_found' });
    const response = await POST(request('check_inspection_status', { customer_name_or_address: 'Rosa Holbrook' }));
    await expect(response.json()).resolves.toMatchObject({ response: expect.stringContaining('could not find a project') });
    expect(mocks.resolveVoiceJob).toHaveBeenCalledWith(expect.anything(), '11111111-1111-4111-8111-111111111111', 'Rosa Holbrook', { allowedCallerPhone: null });
    expect(mocks.getStepUpStatus).not.toHaveBeenCalled();
  });

  it('dispatches a registered staff update without a verification challenge', async () => {
    mocks.handleContractorAction.mockResolvedValueOnce({ handled: true, response: 'Saved the note.' });
    const response = await POST(request('append_job_caution_or_note', { job_ref_or_client: 'LGQ-1042', note: 'Side gate is locked.' }));
    await expect(response.json()).resolves.toMatchObject({ response: 'Saved the note.' });
    expect(mocks.handleContractorAction).toHaveBeenCalledWith(expect.objectContaining({ caller: staffIdentity.caller, providerCallId: 'signed-provider-call-123' }));
    expect(mocks.getStepUpStatus).not.toHaveBeenCalled();
    expect(mocks.requestStepUp).not.toHaveBeenCalled();
  });
});
