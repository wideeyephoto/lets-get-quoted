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
  mocks.resolveIdentity.mockResolvedValue(staffIdentity);
  mocks.getStepUpStatus.mockResolvedValue({
    ok: true,
    verified: false,
    status: 'pending',
    response: 'Before I can save a dispatch change, I need to text a six-digit code to the verified phone calling now.',
  });
});

describe('staff-mode SWAIG application gates', () => {
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

  it('requires a verified live step-up before staff can disclose account-wide inspection status', async () => {
    const response = await POST(request('check_inspection_status', {
      customer_name_or_address: 'Rosa Holbrook',
    }));

    await expect(response.json()).resolves.toMatchObject({
      response: expect.stringMatching(/six-digit code/i),
    });
    expect(mocks.getStepUpStatus).toHaveBeenCalledWith(expect.objectContaining({
      providerCallId: 'signed-provider-call-123',
      signedCallerPhone: '+18103042061',
      identity: staffIdentity,
    }));
    expect(mocks.resolveVoiceJob).not.toHaveBeenCalled();
    expect(mocks.adminFrom).not.toHaveBeenCalled();
  });

  it('does not dispatch any contractor mutation handler until canonical status is verified', async () => {
    const response = await POST(request('append_job_caution_or_note', {
      job_ref_or_client: 'LGQ-1042',
      note: 'Side gate is locked.',
    }));

    await expect(response.json()).resolves.toMatchObject({
      response: expect.stringMatching(/six-digit code/i),
    });
    expect(mocks.getStepUpStatus).toHaveBeenCalledTimes(1);
    expect(mocks.handleContractorAction).not.toHaveBeenCalled();
  });
});
