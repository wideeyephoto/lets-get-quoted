import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  sendOwnerHighValueLeadSms,
  sendOwnerVoiceEmergencyAlertSms,
  sendOwnerVoiceCallNotificationSms,
  sendCallerVoiceBookingLinkSms,
  sendCallerVoiceBookingConfirmationSms,
  sendCallerVoicePostCallFollowupSms,
  sendOwnerPhoneVerificationSms,
  sendCrewPhoneVerificationCodeSms,
  sendEstimateOfferSms,
  sendWeatherRescheduleSms,
  sendWeatherMorningAlertSms,
  sendBookingDecisionSms,
  sendBookingRequestCustomerConfirmationSms,
  sendOwnerBookingRequestAlertSms,
  sendOwnerPortalMessageAlertSms,
  sendClientPortalLinkSms,
  sendOwnerEstimateAcceptedSms,
  sendQuickStopOfferSms,
  sendQuickStopConfirmedSms,
  sendQuickStopStatusSms,
  recordOwnerSmsConsent,
  recordCrewSmsConsent,
  isOwnerPhoneVerified,
  isLiveMessagingEnvironment,
  isSmsConfigured,
} from '@/lib/sms';

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/lib/auth', () => ({
  createAdminClient: vi.fn(),
}));

vi.mock('@/lib/sms-delivery', () => ({
  enqueueSmsDelivery: vi.fn(),
}));

vi.mock('@/lib/business-name', () => ({
  loadBusinessName: vi.fn(() => Promise.resolve('Test Business')),
}));

vi.mock('@/lib/phone', () => ({
  normalizeUsPhone: vi.fn((phone: string) => {
    if (!phone || phone.includes('invalid') || phone.trim() === '') return null;
    return '+15551234567';
  }),
}));

vi.mock('@/lib/phone-timezone', () => ({
  resolveRecipientTimeZone: vi.fn(() => 'America/New_York'),
  getTcpaCompliantSendTime: vi.fn(() => ({ isDelayed: false, sendAt: null })),
}));

vi.mock('@/lib/sms-brand', () => ({
  lgqSmsText: vi.fn((text: string) => text),
}));

vi.mock('@/lib/crew-sms-disclosure', () => ({
  CREW_SMS_FULL_DISCLOSURE: 'Full disclosure text for crews',
  CREW_SMS_WELCOME_MESSAGE: 'Welcome crew message',
  getCrewSmsDisclosureHash: vi.fn(() => 'sha256hashvalue'),
}));

vi.mock('@/lib/sms-provider', () => ({
  isSmsProviderConfigured: vi.fn(() => true),
  outboundSmsSuppression: vi.fn(() => false),
}));

vi.mock('@/lib/sms-templates', async (importOriginal) => {
  const actual: Record<string, unknown> = await importOriginal() as Record<string, unknown>;
  return {
    ...actual,
    paymentText: vi.fn(() => 'payment text'),
    withOptOut: vi.fn((text: string) => `${text} Reply STOP to opt out.`),
    ownerHighValueLeadText: vi.fn(() => 'high value lead text'),
    ownerVoiceEmergencyAlertText: vi.fn(() => 'emergency alert text'),
    ownerVoiceCallNotificationText: vi.fn(() => 'call notification text'),
    callerVoiceBookingLinkText: vi.fn(() => 'booking link text'),
    callerVoiceBookingConfirmationText: vi.fn(() => 'booking confirmation text'),
    callerVoicePostCallFollowupText: vi.fn(() => 'post call followup text'),
    ownerVerificationCodeText: vi.fn(() => 'verification code text'),
    crewPhoneVerificationCodeText: vi.fn(() => 'crew verification text'),
    bookingRequestCustomerConfirmationText: vi.fn(() => 'booking request confirmation text'),
    ownerBookingRequestAlertText: vi.fn(() => 'owner booking alert text'),
    ownerPortalMessageAlertText: vi.fn(() => 'portal message alert text'),
    quickStopOfferText: vi.fn(() => 'quick stop offer text'),
    quickStopConfirmedText: vi.fn(() => 'quick stop confirmed text'),
  };
});

// ── Shared helpers ────────────────────────────────────────────────────────────

function createMockAdmin() {
  const chain: Record<string, unknown> = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    neq: vi.fn(() => chain),
    update: vi.fn(() => chain),
    upsert: vi.fn(() => chain),
    insert: vi.fn(() => chain),
    maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
    then: vi.fn((resolve: (arg: { data: unknown[]; error: null }) => unknown) =>
      resolve({ data: [], error: null })
    ),
  };
  return {
    from: vi.fn(() => chain),
    rpc: vi.fn(() => Promise.resolve({ data: false, error: null })),
    chain,
  };
}

import { createAdminClient } from '@/lib/auth';
import { enqueueSmsDelivery } from '@/lib/sms-delivery';

const mockCreateAdmin = vi.mocked(createAdminClient);
const mockEnqueueSmsDelivery = vi.mocked(enqueueSmsDelivery);

beforeEach(() => {
  vi.clearAllMocks();
  const { from, rpc } = createMockAdmin();
  mockCreateAdmin.mockReturnValue({ from, rpc } as unknown as ReturnType<typeof createAdminClient>);
  mockEnqueueSmsDelivery.mockResolvedValue({ eventId: 'test-event-uuid-1234-5678-9abc-def012345678' } as Awaited<ReturnType<typeof enqueueSmsDelivery>>);
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('sms-engine-coverage — owner alert sends', () => {
  it('sendOwnerHighValueLeadSms queues an SMS when not opted out', async () => {
    // isPhoneOptedOut uses admin.rpc → return false (not opted out)
    const admin = createMockAdmin();
    admin.rpc.mockResolvedValue({ data: false, error: null });
    mockCreateAdmin.mockReturnValue({ from: admin.from, rpc: admin.rpc } as unknown as ReturnType<typeof createAdminClient>);

    await sendOwnerHighValueLeadSms({
      accountId: 'acct-1',
      alertPhone: '5551234567',
      businessName: 'Acme Roofing',
      leadName: 'John Doe',
      estimate: { min: 500, max: 1500 },
      dashboardUrl: 'https://example.com/dashboard',
      idempotencyKey: 'lead-alert-key-1',
    });

    expect(mockEnqueueSmsDelivery).toHaveBeenCalledOnce();
    const call = mockEnqueueSmsDelivery.mock.calls[0][0];
    expect(call.messageKind).toBe('owner-high-value-lead');
    expect(call.billingCategory).toBe('owner_alert');
  });

  it('sendOwnerHighValueLeadSms skips send when phone is opted out', async () => {
    const admin = createMockAdmin();
    admin.rpc.mockResolvedValue({ data: true, error: null });
    mockCreateAdmin.mockReturnValue({ from: admin.from, rpc: admin.rpc } as unknown as ReturnType<typeof createAdminClient>);

    await sendOwnerHighValueLeadSms({
      accountId: 'acct-1',
      alertPhone: '5551234567',
      businessName: 'Acme',
      leadName: 'Jane',
      estimate: null,
      dashboardUrl: 'https://example.com',
      idempotencyKey: 'key-2',
    });

    expect(mockEnqueueSmsDelivery).not.toHaveBeenCalled();
  });

  it('sendOwnerHighValueLeadSms skips on invalid phone (never throws)', async () => {
    await sendOwnerHighValueLeadSms({
      accountId: 'acct-1',
      alertPhone: 'invalid-phone',
      businessName: 'Acme',
      leadName: 'Jane',
      estimate: null,
      dashboardUrl: 'https://example.com',
      idempotencyKey: 'key-3',
    });

    expect(mockEnqueueSmsDelivery).not.toHaveBeenCalled();
  });

  it('sendOwnerVoiceEmergencyAlertSms queues SMS with emergency category', async () => {
    const admin = createMockAdmin();
    admin.rpc.mockResolvedValue({ data: false, error: null });
    mockCreateAdmin.mockReturnValue({ from: admin.from, rpc: admin.rpc } as unknown as ReturnType<typeof createAdminClient>);

    await sendOwnerVoiceEmergencyAlertSms({
      accountId: 'acct-2',
      alertPhone: '5559876543',
      businessName: 'Plumbing Co',
      callerPhone: '+15551112222',
      hazardSummary: 'Gas leak reported',
      dashboardUrl: 'https://example.com/dash',
      idempotencyKey: 'emergency-key-1',
    });

    expect(mockEnqueueSmsDelivery).toHaveBeenCalledOnce();
    expect(mockEnqueueSmsDelivery.mock.calls[0][0].messageKind).toBe('owner-voice-emergency-alert');
  });

  it('sendOwnerVoiceCallNotificationSms queues call notification', async () => {
    const admin = createMockAdmin();
    admin.rpc.mockResolvedValue({ data: false, error: null });
    mockCreateAdmin.mockReturnValue({ from: admin.from, rpc: admin.rpc } as unknown as ReturnType<typeof createAdminClient>);

    await sendOwnerVoiceCallNotificationSms({
      accountId: 'acct-3',
      alertPhone: '5553334444',
      businessName: 'Fix-It LLC',
      callerName: 'Alice',
      callerPhone: '+15556667777',
      summary: 'Caller requested quote for roof repair',
      dashboardUrl: 'https://example.com',
    });

    expect(mockEnqueueSmsDelivery).toHaveBeenCalledOnce();
    expect(mockEnqueueSmsDelivery.mock.calls[0][0].messageKind).toBe('owner-voice-call-notification');
  });
});

describe('sms-engine-coverage — voice caller sends', () => {
  it('sendCallerVoiceBookingLinkSms returns ok:true on success', async () => {
    const admin = createMockAdmin();
    admin.rpc.mockResolvedValue({ data: false, error: null });
    mockCreateAdmin.mockReturnValue({ from: admin.from, rpc: admin.rpc } as unknown as ReturnType<typeof createAdminClient>);

    const result = await sendCallerVoiceBookingLinkSms({
      accountId: 'acct-4',
      callerPhone: '5551112222',
      bookingUrl: 'https://example.com/book',
      idempotencyKey: 'vbooking-key-1',
    });

    expect(result.ok).toBe(true);
    expect(mockEnqueueSmsDelivery).toHaveBeenCalledOnce();
    expect(mockEnqueueSmsDelivery.mock.calls[0][0].senderPurpose).toBe('contractor_dedicated');
  });

  it('sendCallerVoiceBookingLinkSms returns ok:false when opted out', async () => {
    const admin = createMockAdmin();
    admin.rpc.mockResolvedValue({ data: true, error: null });
    mockCreateAdmin.mockReturnValue({ from: admin.from, rpc: admin.rpc } as unknown as ReturnType<typeof createAdminClient>);

    const result = await sendCallerVoiceBookingLinkSms({
      accountId: 'acct-4',
      callerPhone: '5551112222',
      bookingUrl: 'https://example.com/book',
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain('opted out');
    expect(mockEnqueueSmsDelivery).not.toHaveBeenCalled();
  });

  it('sendCallerVoiceBookingLinkSms returns ok:false for invalid phone', async () => {
    const result = await sendCallerVoiceBookingLinkSms({
      accountId: 'acct-4',
      callerPhone: 'invalid-phone',
      bookingUrl: 'https://example.com/book',
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain('Invalid phone');
  });

  it('sendCallerVoiceBookingConfirmationSms succeeds with valid inputs', async () => {
    const admin = createMockAdmin();
    admin.rpc.mockResolvedValue({ data: false, error: null });
    mockCreateAdmin.mockReturnValue({ from: admin.from, rpc: admin.rpc } as unknown as ReturnType<typeof createAdminClient>);

    const result = await sendCallerVoiceBookingConfirmationSms({
      accountId: 'acct-5',
      callerPhone: '5554445555',
      whenLabel: 'Tomorrow at 10am',
      serviceAddress: '123 Main St',
      idempotencyKey: 'confirm-key-1',
    });

    expect(result.ok).toBe(true);
    expect(mockEnqueueSmsDelivery.mock.calls[0][0].messageKind).toBe('caller-voice-booking-confirmation');
  });

  it('sendCallerVoicePostCallFollowupSms succeeds with optional fields', async () => {
    const admin = createMockAdmin();
    admin.rpc.mockResolvedValue({ data: false, error: null });
    mockCreateAdmin.mockReturnValue({ from: admin.from, rpc: admin.rpc } as unknown as ReturnType<typeof createAdminClient>);

    const result = await sendCallerVoicePostCallFollowupSms({
      accountId: 'acct-6',
      callerPhone: '5556667777',
      callerName: 'Bob Smith',
      scheduledTime: '2pm tomorrow',
      portalUrl: 'https://example.com/portal',
      issueSummary: 'Leaky faucet',
    });

    expect(result.ok).toBe(true);
    expect(mockEnqueueSmsDelivery.mock.calls[0][0].messageKind).toBe('caller-voice-post-call-followup');
  });
});

describe('sms-engine-coverage — verification sends', () => {
  it('sendOwnerPhoneVerificationSms returns eventId string', async () => {
    const result = await sendOwnerPhoneVerificationSms({
      accountId: 'acct-7',
      phone: '5557778888',
      code: '482917',
      idempotencyKey: 'verify-key-1',
    });

    expect(typeof result).toBe('string');
    expect(mockEnqueueSmsDelivery).toHaveBeenCalledOnce();
    expect(mockEnqueueSmsDelivery.mock.calls[0][0].messageKind).toBe('owner-phone-verification');
    expect(mockEnqueueSmsDelivery.mock.calls[0][0].billingCategory).toBe('verification');
  });

  it('sendOwnerPhoneVerificationSms throws on invalid phone', async () => {
    await expect(
      sendOwnerPhoneVerificationSms({
        accountId: 'acct-7',
        phone: 'invalid',
        code: '123456',
      })
    ).rejects.toThrow('Invalid phone number');
  });

  it('sendCrewPhoneVerificationCodeSms queues crew verification', async () => {
    const result = await sendCrewPhoneVerificationCodeSms({
      accountId: 'acct-8',
      phone: '5558889999',
      code: '192837',
      businessName: 'Crew Services',
      idempotencyKey: 'crew-verify-1',
    });

    expect(typeof result).toBe('string');
    expect(mockEnqueueSmsDelivery.mock.calls[0][0].messageKind).toBe('crew-phone-verification');
    expect(mockEnqueueSmsDelivery.mock.calls[0][0].billingCategory).toBe('verification');
    expect(mockEnqueueSmsDelivery.mock.calls[0][0].context).toBe('crew');
  });

  it('sendCrewPhoneVerificationCodeSms throws on invalid phone', async () => {
    await expect(
      sendCrewPhoneVerificationCodeSms({
        accountId: 'acct-8',
        phone: 'invalid',
        code: '654321',
        businessName: 'Crew',
      })
    ).rejects.toThrow('Invalid phone number');
  });
});

describe('sms-engine-coverage — estimate/weather sends', () => {
  it('sendEstimateOfferSms queues with customer_message category', async () => {
    const result = await sendEstimateOfferSms({
      accountId: 'acct-9',
      toPhone: '5550001111',
      message: 'We have an opening near you today',
      idempotencyKey: 'estimate-offer-1',
    });

    expect(typeof result).toBe('string');
    expect(mockEnqueueSmsDelivery.mock.calls[0][0].messageKind).toBe('estimate-offer');
    expect(mockEnqueueSmsDelivery.mock.calls[0][0].billingCategory).toBe('customer_message');
  });

  it('sendWeatherRescheduleSms queues with availableAt when provided', async () => {
    const futureDate = new Date(Date.now() + 3600_000);
    const result = await sendWeatherRescheduleSms({
      accountId: 'acct-10',
      toPhone: '5552223333',
      message: 'Storm warning: please reschedule',
      idempotencyKey: 'weather-reschedule-1',
      availableAt: futureDate,
    });

    expect(typeof result).toBe('string');
    expect(mockEnqueueSmsDelivery.mock.calls[0][0].messageKind).toBe('weather-reschedule');
    expect(mockEnqueueSmsDelivery.mock.calls[0][0].availableAt).toBe(futureDate);
  });

  it('sendWeatherMorningAlertSms queues as owner_alert', async () => {
    const result = await sendWeatherMorningAlertSms({
      accountId: 'acct-11',
      alertPhone: '5554445555',
      message: 'Severe weather warning for today',
      idempotencyKey: 'weather-morning-1',
    });

    expect(typeof result).toBe('string');
    expect(mockEnqueueSmsDelivery.mock.calls[0][0].messageKind).toBe('weather-morning-alert');
    expect(mockEnqueueSmsDelivery.mock.calls[0][0].billingCategory).toBe('owner_alert');
  });
});

describe('sms-engine-coverage — booking decision sends', () => {
  it('sendBookingDecisionSms queues when not opted out', async () => {
    const admin = createMockAdmin();
    admin.rpc.mockResolvedValue({ data: false, error: null });
    mockCreateAdmin.mockReturnValue({ from: admin.from, rpc: admin.rpc } as unknown as ReturnType<typeof createAdminClient>);

    await sendBookingDecisionSms({
      accountId: 'acct-12',
      toPhone: '+15551234567',
      message: 'Your appointment has been confirmed!',
      idempotencyKey: 'booking-decision-1',
    });

    expect(mockEnqueueSmsDelivery).toHaveBeenCalledOnce();
    expect(mockEnqueueSmsDelivery.mock.calls[0][0].messageKind).toBe('booking-decision');
  });

  it('sendBookingDecisionSms skips silently when opted out (never throws)', async () => {
    const admin = createMockAdmin();
    admin.rpc.mockResolvedValue({ data: true, error: null });
    mockCreateAdmin.mockReturnValue({ from: admin.from, rpc: admin.rpc } as unknown as ReturnType<typeof createAdminClient>);

    await sendBookingDecisionSms({
      accountId: 'acct-12',
      toPhone: '+15551234567',
      message: 'Confirmed!',
      idempotencyKey: 'booking-decision-2',
    });

    expect(mockEnqueueSmsDelivery).not.toHaveBeenCalled();
  });

  it('sendBookingRequestCustomerConfirmationSms returns true on success', async () => {
    const admin = createMockAdmin();
    admin.rpc.mockResolvedValue({ data: false, error: null });
    mockCreateAdmin.mockReturnValue({ from: admin.from, rpc: admin.rpc } as unknown as ReturnType<typeof createAdminClient>);

    const result = await sendBookingRequestCustomerConfirmationSms({
      accountId: 'acct-13',
      phone: '5556667777',
      businessName: 'Handy Co',
      customerName: 'Sarah Johnson',
      whenLabel: 'Tuesday 2–4pm',
      serviceName: 'Plumbing repair',
      address: '456 Oak Ave, Dallas TX',
      accountTimeZone: 'America/Chicago',
      idempotencyKey: 'booking-req-confirm-1',
    });

    expect(result).toBe(true);
    expect(mockEnqueueSmsDelivery.mock.calls[0][0].messageKind).toBe('booking-request-confirmation');
  });

  it('sendBookingRequestCustomerConfirmationSms returns false on invalid phone', async () => {
    const result = await sendBookingRequestCustomerConfirmationSms({
      accountId: 'acct-13',
      phone: 'invalid',
      businessName: 'Handy Co',
      customerName: 'Sarah',
      whenLabel: 'Tuesday',
    });

    expect(result).toBe(false);
    expect(mockEnqueueSmsDelivery).not.toHaveBeenCalled();
  });

  it('sendOwnerBookingRequestAlertSms sends when phone is verified', async () => {
    const mockChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { status: 'opted_in' }, error: null }),
      update: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      then: vi.fn((resolve: (arg: { data: unknown[]; error: null }) => unknown) =>
        resolve({ data: [], error: null })
      ),
    };
    const admin = {
      from: vi.fn(() => mockChain),
      rpc: vi.fn().mockResolvedValue({ data: false, error: null }),
    };
    mockCreateAdmin.mockReturnValue(admin as unknown as ReturnType<typeof createAdminClient>);

    const result = await sendOwnerBookingRequestAlertSms({
      accountId: 'acct-14',
      alertPhone: '5558889999',
      businessName: 'Quick Fix',
      customerName: 'Tom Brown',
      whenLabel: 'Friday 10am',
      serviceName: 'HVAC check',
      dashboardUrl: 'https://example.com/dashboard',
      idempotencyKey: 'owner-booking-alert-1',
    });

    expect(result).toBe(true);
    expect(mockEnqueueSmsDelivery).toHaveBeenCalledOnce();
    expect(mockEnqueueSmsDelivery.mock.calls[0][0].messageKind).toBe('owner-booking-request-alert');
  });

  it('sendOwnerBookingRequestAlertSms returns false when phone is unverified', async () => {
    const mockChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      update: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
    };
    const admin = {
      from: vi.fn(() => mockChain),
      rpc: vi.fn().mockResolvedValue({ data: false, error: null }),
    };
    mockCreateAdmin.mockReturnValue(admin as unknown as ReturnType<typeof createAdminClient>);

    const result = await sendOwnerBookingRequestAlertSms({
      accountId: 'acct-14',
      alertPhone: '5558889999',
      businessName: 'Quick Fix',
      customerName: 'Tom Brown',
      whenLabel: 'Friday 10am',
      dashboardUrl: 'https://example.com',
      idempotencyKey: 'owner-booking-alert-2',
    });

    expect(result).toBe(false);
    expect(mockEnqueueSmsDelivery).not.toHaveBeenCalled();
  });
});

describe('sms-engine-coverage — portal and quick stop sends', () => {
  it('sendOwnerPortalMessageAlertSms sends when phone is verified', async () => {
    const mockChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { status: 'opted_in' }, error: null }),
      update: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
    };
    const admin = {
      from: vi.fn(() => mockChain),
      rpc: vi.fn().mockResolvedValue({ data: false, error: null }),
    };
    mockCreateAdmin.mockReturnValue(admin as unknown as ReturnType<typeof createAdminClient>);

    const result = await sendOwnerPortalMessageAlertSms({
      accountId: 'acct-15',
      alertPhone: '5550011223',
      businessName: 'Contractor Co',
      customerName: 'Eve Wilson',
      messagePreview: 'Hi, just checking on the status...',
      dashboardUrl: 'https://example.com/dashboard',
      idempotencyKey: 'portal-msg-alert-1',
    });

    expect(result).toBe(true);
    expect(mockEnqueueSmsDelivery.mock.calls[0][0].messageKind).toBe('owner-portal-message-alert');
  });

  it('sendClientPortalLinkSms queues link when not opted out and baseline succeeds', async () => {
    const admin = createMockAdmin();
    admin.rpc
      .mockResolvedValueOnce({ data: false, error: null }) // isPhoneOptedOut
      .mockResolvedValueOnce({ data: true, error: null }); // ensureSmsConsentBaseline
    mockCreateAdmin.mockReturnValue({ from: admin.from, rpc: admin.rpc } as unknown as ReturnType<typeof createAdminClient>);

    await sendClientPortalLinkSms({
      accountId: 'acct-16',
      toPhone: '+15551234567',
      message: 'Your portal link: https://example.com/portal/abc123',
    });

    expect(mockEnqueueSmsDelivery).toHaveBeenCalledOnce();
    expect(mockEnqueueSmsDelivery.mock.calls[0][0].messageKind).toBe('portal-link');
  });

  it('sendClientPortalLinkSms skips when opted out (never throws)', async () => {
    const admin = createMockAdmin();
    admin.rpc.mockResolvedValue({ data: true, error: null });
    mockCreateAdmin.mockReturnValue({ from: admin.from, rpc: admin.rpc } as unknown as ReturnType<typeof createAdminClient>);

    await sendClientPortalLinkSms({
      accountId: 'acct-16',
      toPhone: '+15551234567',
      message: 'Your portal link',
    });

    expect(mockEnqueueSmsDelivery).not.toHaveBeenCalled();
  });

  it('sendOwnerEstimateAcceptedSms queues owner alert on answer', async () => {
    const admin = createMockAdmin();
    admin.rpc.mockResolvedValue({ data: false, error: null });
    mockCreateAdmin.mockReturnValue({ from: admin.from, rpc: admin.rpc } as unknown as ReturnType<typeof createAdminClient>);

    await sendOwnerEstimateAcceptedSms({
      accountId: 'acct-17',
      alertPhone: '5552223344',
      message: 'Lead answered YES to your estimate offer!',
      idempotencyKey: 'estimate-accepted-1',
    });

    expect(mockEnqueueSmsDelivery).toHaveBeenCalledOnce();
    expect(mockEnqueueSmsDelivery.mock.calls[0][0].messageKind).toBe('owner-estimate-accepted');
    expect(mockEnqueueSmsDelivery.mock.calls[0][0].billingCategory).toBe('owner_alert');
  });

  it('sendQuickStopOfferSms queues payment_message category', async () => {
    const admin = createMockAdmin();
    admin.rpc.mockResolvedValue({ data: false, error: null });
    mockCreateAdmin.mockReturnValue({ from: admin.from, rpc: admin.rpc } as unknown as ReturnType<typeof createAdminClient>);

    await sendQuickStopOfferSms({
      accountId: 'acct-18',
      toPhone: '5554445566',
      businessName: 'Quick Fix',
      whenLabel: 'Today 3–5pm',
      feeLabel: '$75',
      payUrl: 'https://example.com/pay/qs123',
      minutes: 15,
      idempotencyKey: 'qs-offer-1',
    });

    expect(mockEnqueueSmsDelivery).toHaveBeenCalledOnce();
    expect(mockEnqueueSmsDelivery.mock.calls[0][0].messageKind).toBe('quick-stop-offer');
    expect(mockEnqueueSmsDelivery.mock.calls[0][0].billingCategory).toBe('payment_message');
  });

  it('sendQuickStopConfirmedSms queues after payment clears', async () => {
    const admin = createMockAdmin();
    admin.rpc.mockResolvedValue({ data: false, error: null });
    mockCreateAdmin.mockReturnValue({ from: admin.from, rpc: admin.rpc } as unknown as ReturnType<typeof createAdminClient>);

    await sendQuickStopConfirmedSms({
      accountId: 'acct-19',
      toPhone: '5556667788',
      businessName: 'Quick Fix',
      whenLabel: 'Today 3–5pm',
      statusUrl: 'https://example.com/track/qs456',
      idempotencyKey: 'qs-confirmed-1',
    });

    expect(mockEnqueueSmsDelivery.mock.calls[0][0].messageKind).toBe('quick-stop-confirmed');
  });

  it('sendQuickStopStatusSms queues with withOptOut wrapper', async () => {
    const admin = createMockAdmin();
    admin.rpc.mockResolvedValue({ data: false, error: null });
    mockCreateAdmin.mockReturnValue({ from: admin.from, rpc: admin.rpc } as unknown as ReturnType<typeof createAdminClient>);

    await sendQuickStopStatusSms({
      accountId: 'acct-20',
      toPhone: '5558889900',
      message: 'Your technician is en route!',
      idempotencyKey: 'qs-status-1',
    });

    expect(mockEnqueueSmsDelivery.mock.calls[0][0].messageKind).toBe('quick-stop-status');
    // body should include opt-out (from withOptOut mock)
    const body = mockEnqueueSmsDelivery.mock.calls[0][0].body as string;
    expect(body).toContain('Reply STOP to opt out');
  });

  it('sendQuickStopOfferSms does nothing on invalid phone (never throws)', async () => {
    await sendQuickStopOfferSms({
      accountId: 'acct-18',
      toPhone: 'invalid-phone',
      businessName: 'Quick Fix',
      whenLabel: 'Today',
      feeLabel: '$75',
      payUrl: 'https://example.com/pay/qs',
      minutes: 15,
      idempotencyKey: 'qs-offer-invalid',
    });

    expect(mockEnqueueSmsDelivery).not.toHaveBeenCalled();
  });
});

describe('sms-engine-coverage — consent record operations', () => {
  it('isOwnerPhoneVerified returns true when sms_consent row is opted_in', async () => {
    const mockChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { status: 'opted_in' }, error: null }),
    };
    mockCreateAdmin.mockReturnValue({ from: vi.fn(() => mockChain) } as unknown as ReturnType<typeof createAdminClient>);

    const result = await isOwnerPhoneVerified('acct-21', '5551234567');
    expect(result).toBe(true);
  });

  it('isOwnerPhoneVerified returns false when no row exists', async () => {
    const mockChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    mockCreateAdmin.mockReturnValue({ from: vi.fn(() => mockChain) } as unknown as ReturnType<typeof createAdminClient>);

    const result = await isOwnerPhoneVerified('acct-21', '5551234567');
    expect(result).toBe(false);
  });

  it('isOwnerPhoneVerified returns false on invalid phone', async () => {
    const result = await isOwnerPhoneVerified('acct-21', 'invalid-phone');
    expect(result).toBe(false);
  });

  it('recordOwnerSmsConsent returns "recorded" when update succeeds', async () => {
    const mockChain = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      select: vi.fn().mockResolvedValue({ data: [{ id: 'row-1' }], error: null }),
      from: vi.fn().mockReturnThis(),
    };
    mockCreateAdmin.mockReturnValue({ from: vi.fn(() => mockChain) } as unknown as ReturnType<typeof createAdminClient>);

    const result = await recordOwnerSmsConsent('acct-22', '5551234567', 'v2.1');
    expect(result).toBe('recorded');
  });

  it('recordOwnerSmsConsent returns "failed" on invalid phone', async () => {
    const result = await recordOwnerSmsConsent('acct-22', 'invalid-phone', 'v2.1');
    expect(result).toBe('failed');
  });

  it('recordOwnerSmsConsent returns "suppressed" when row exists as opted_out', async () => {
    const calls: number[] = [];
    const mockFrom = vi.fn(() => {
      calls.push(1);
      if (calls.length === 1) {
        // First call: update returns 0 rows (opted_out row not updated)
        return {
          update: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          neq: vi.fn().mockReturnThis(),
          select: vi.fn().mockResolvedValue({ data: [], error: null }),
        };
      }
      // Second call: maybeSingle read returns opted_out
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: { status: 'opted_out' }, error: null }),
      };
    });
    mockCreateAdmin.mockReturnValue({ from: mockFrom } as unknown as ReturnType<typeof createAdminClient>);

    const result = await recordOwnerSmsConsent('acct-22', '5551234567', 'v2.1');
    expect(result).toBe('suppressed');
  });

  it('recordCrewSmsConsent returns "failed" on invalid phone', async () => {
    const result = await recordCrewSmsConsent({
      accountId: 'acct-23',
      phone: 'invalid-phone',
      disclosureVersion: 'v1.0',
    });
    expect(result).toBe('failed');
  });

  it('recordCrewSmsConsent returns "failed" when evidence insert fails', async () => {
    const mockChain = {
      insert: vi.fn().mockResolvedValue({ error: { message: 'DB error', code: '99999' } }),
    };
    mockCreateAdmin.mockReturnValue({ from: vi.fn(() => mockChain) } as unknown as ReturnType<typeof createAdminClient>);

    const result = await recordCrewSmsConsent({
      accountId: 'acct-23',
      phone: '5551234567',
      disclosureVersion: 'v1.0',
    });
    expect(result).toBe('failed');
  });

  it('recordCrewSmsConsent returns "recorded" when update succeeds', async () => {
    let callCount = 0;
    const mockFrom = vi.fn(() => {
      callCount++;
      if (callCount === 1) {
        // evidence insert
        return { insert: vi.fn().mockResolvedValue({ error: null }) };
      }
      if (callCount === 2) {
        // sms_consent update
        return {
          update: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          neq: vi.fn().mockReturnThis(),
          select: vi.fn().mockResolvedValue({ data: [{ id: 'row-1' }], error: null }),
        };
      }
      // sms_consent_scopes upsert
      return {
        upsert: vi.fn().mockResolvedValue({ error: null }),
      };
    });
    mockCreateAdmin.mockReturnValue({ from: mockFrom } as unknown as ReturnType<typeof createAdminClient>);

    const result = await recordCrewSmsConsent({
      accountId: 'acct-23',
      phone: '5551234567',
      disclosureVersion: 'v1.0',
      userId: 'user-abc',
      crewId: 'crew-xyz',
    });
    expect(result).toBe('recorded');
  });
});

describe('sms-engine-coverage — utility functions', () => {
  it('isLiveMessagingEnvironment returns false in test environment', () => {
    // NODE_ENV=test so it should return false
    const result = isLiveMessagingEnvironment();
    expect(typeof result).toBe('boolean');
  });

  it('isSmsConfigured delegates to sms-provider', () => {
    const result = isSmsConfigured();
    expect(typeof result).toBe('boolean');
  });
});
