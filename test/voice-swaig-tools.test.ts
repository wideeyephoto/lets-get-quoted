vi.mock('@/lib/voice/tool-admission', () => ({ authorizeVoiceToolInvocation: vi.fn().mockResolvedValue(true) }));
import { describe, expect, it, vi } from 'vitest';
import { signalwireVoiceProvider } from '@/lib/voice/signalwire';
import type { VoiceAnswerPlan } from '@/lib/voice/provider';
import { callerVoiceBookingLinkText, callerVoiceBookingConfirmationText } from '@/lib/sms-templates';

vi.mock('@/lib/auth', () => ({
  createAdminClient: vi.fn().mockReturnValue({
    from: () => {
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = () => chain;
      chain.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
      return chain;
    },
  }),
}));

vi.mock('@/lib/booking', () => ({
  getAvailableBookingDays: vi.fn().mockResolvedValue([
    {
      dateKey: '2026-08-27',
      dayLabel: 'Thursday, Aug 27',
      slots: [{ time: '09:00', endTime: '12:00', label: 'Morning: 9 AM – 12 PM' }],
    },
  ]),
  claimBookingHold: vi.fn().mockResolvedValue(true),
  createBooking: vi.fn().mockResolvedValue({ id: 'lead-123' }),
}));

vi.mock('@/lib/sms', () => ({
  sendCallerVoiceBookingLinkSms: vi.fn().mockResolvedValue({ ok: true }),
  sendCallerVoiceBookingConfirmationSms: vi.fn().mockResolvedValue({ ok: true }),
  ensureSmsConsentBaseline: vi.fn().mockResolvedValue({ status: 'opted_in' }),
}));

vi.mock('@/lib/voice/caller-identity', () => ({
  resolveVoiceCallerIdentity: vi.fn().mockResolvedValue({ status: 'customer' }),
}));

vi.mock('@/lib/leads', () => ({
  createLead: vi.fn().mockResolvedValue({ id: 'lead-captured-1' }),
}));

const DUMMY_AUTH = { scheme: 'basic' as const, username: 'test-user', password: 'test-password' };

describe('AI Voice Tier 3 Live SWAIG Tools & In-Call Scheduling', () => {
  it('renders SWML with SWAIG tool schemas for live booking and availability checks', () => {
    const plan: VoiceAnswerPlan = {
      kind: 'ai_agent',
      receiptUrl: 'https://example.com/api/voice/receipt',
      receiptAuthorization: DUMMY_AUTH,
      greeting: 'Thanks for calling BrokePipes Plumbing.',
      capMinutes: 10,
      transferTo: '+12485550100',
      swaigUrl: 'https://example.com/api/voice/swaig?account_id=acc-123',
    };

    const answer = signalwireVoiceProvider.renderAnswer(plan);
    expect(answer.contentType).toBe('application/json');

    const swml = JSON.parse(answer.body);
    const aiSection = swml.sections.main.find((s: any) => s.ai)?.ai;
    expect(aiSection).toBeDefined();
    expect(aiSection.SWAIG).toBeDefined();

    const functions = aiSection.SWAIG.functions;
    expect(functions.length).toBeGreaterThanOrEqual(4);

    // 1. Transfer tool
    const transferFn = functions.find((f: any) => f.function === 'transfer_to_business');
    expect(transferFn).toBeDefined();
    expect(transferFn.data_map.expressions[0].output.action[0].transfer).toBe(true);

    // 2. Booking Link tool
    const bookingLinkFn = functions.find((f: any) => f.function === 'send_booking_link');
    expect(bookingLinkFn).toBeDefined();
    expect(bookingLinkFn.web_hook_url).toBe('https://example.com/api/voice/swaig?account_id=acc-123');

    // 3. Available Slots tool
    const slotsFn = functions.find((f: any) => f.function === 'check_available_slots');
    expect(slotsFn).toBeDefined();
    expect(slotsFn.fillers).toBeDefined();

    // 4. In-Call Direct Booking tool
    const bookFn = functions.find((f: any) => f.function === 'book_appointment_slot');
    expect(bookFn).toBeDefined();
    expect(bookFn.argument.required).toContain('caller_name');
    expect(bookFn.argument.required).toContain('requested_date');
    expect(bookFn.argument.required).toContain('requested_time');
  });

  it('formats caller booking link and confirmation SMS copy accurately with opt-out compliance', () => {
    const linkText = callerVoiceBookingLinkText({
      businessName: 'BrokePipes Plumbing',
      bookingUrl: 'https://brokepipes.letsgetquoted.com/quote',
    });

    expect(linkText).toContain('Thanks for calling BrokePipes Plumbing!');
    expect(linkText).toContain('https://brokepipes.letsgetquoted.com/quote');
    expect(linkText).toContain('Reply STOP to opt out.');

    const confirmText = callerVoiceBookingConfirmationText({
      businessName: 'BrokePipes Plumbing',
      whenLabel: 'Thursday, Aug 27 (Morning: 9 AM – 12 PM)',
      serviceAddress: '123 Main St',
    });

    expect(confirmText).toContain('Thanks for calling BrokePipes Plumbing!');
    expect(confirmText).toContain('Thursday, Aug 27');
    expect(confirmText).toContain('123 Main St');
    expect(confirmText).toContain('Reply STOP to opt out.');
  });

  it('verifies SWAIG check_available_slots tool returns capacity windows', async () => {
    process.env.LGQ_VOICE_RECEIPT_BASIC = 'test-user:test-password';
    process.env.SIGNALWIRE_SIGNING_KEY = 'test-secret';

    const { POST: swaigHandler } = await import('@/app/api/voice/swaig/route');
    const { signVoiceToolToken } = await import('@/lib/voice/auth');

    const authHeader = `Basic ${Buffer.from('test-user:test-password').toString('base64')}`;
    const token = signVoiceToolToken(
      { accountId: 'acc-123', providerCallId: 'call-xyz' },
      3600,
      {
        LGQ_VOICE_RECEIPT_BASIC: 'test-user:test-password',
        SIGNALWIRE_SIGNING_KEY: 'test-secret',
      },
    );

    const req = new Request(`https://example.com/api/voice/swaig?token=${token}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeader,
      },
      body: JSON.stringify({
        function: 'check_available_slots',
        argument: { preferred_date: '2026-08-27' },
      }),
    });

    const res = await swaigHandler(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.response).toContain('Thursday, Aug 27');
    expect(data.response).toContain('Morning: 9 AM – 12 PM');
  }, 15000);

  it.each([
    'Basic !!!not-base64!!!',
    `Basic ${Buffer.from('test-user:test-password').toString('base64')}=`,
  ])('rejects malformed and noncanonical SWAIG Basic credentials', async (authorization) => {
    process.env.LGQ_VOICE_RECEIPT_BASIC = 'test-user:test-password';
    process.env.SIGNALWIRE_SIGNING_KEY = 'test-secret';
    const { POST: swaigHandler } = await import('@/app/api/voice/swaig/route');
    const response = await swaigHandler(new Request('https://example.com/api/voice/swaig?token=unused', {
      method: 'POST',
      headers: { authorization, 'content-type': 'application/json' },
      body: JSON.stringify({ function: 'check_available_slots', argument: {} }),
    }));
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
  });

  it('executes in-call book_appointment_slot tool with hold, booking creation, and confirmation text', async () => {
    process.env.LGQ_VOICE_RECEIPT_BASIC = 'test-user:test-password';
    process.env.SIGNALWIRE_SIGNING_KEY = 'test-secret';

    const { POST: swaigHandler } = await import('@/app/api/voice/swaig/route');
    const { signVoiceToolToken } = await import('@/lib/voice/auth');

    const authHeader = `Basic ${Buffer.from('test-user:test-password').toString('base64')}`;
    const token = signVoiceToolToken(
      { accountId: 'acc-123', providerCallId: 'call-xyz', callerPhone: '+12485550199' },
      3600,
      {
        LGQ_VOICE_RECEIPT_BASIC: 'test-user:test-password',
        SIGNALWIRE_SIGNING_KEY: 'test-secret',
      },
    );

    const req = new Request(`https://example.com/api/voice/swaig?token=${token}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeader,
      },
      body: JSON.stringify({
        function: 'book_appointment_slot',
        argument: {
          caller_name: 'John Wick',
          service_address: '450 Continental Way',
          requested_date: '2026-08-27',
          requested_time: '09:00',
          service_description: 'Fix basement water leak',
        },
      }),
    });


    const res = await swaigHandler(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.response).toContain('John Wick');
    expect(data.response).toContain('Thursday, Aug 27');
    expect(data.response).toContain('450 Continental Way');
  });

  it('executes in-call capture_lead tool without phone number', async () => {
    process.env.LGQ_VOICE_RECEIPT_BASIC = 'test-user:test-password';
    process.env.SIGNALWIRE_SIGNING_KEY = 'test-secret';

    const { POST: swaigHandler } = await import('@/app/api/voice/swaig/route');
    const { signVoiceToolToken } = await import('@/lib/voice/auth');

    const authHeader = `Basic ${Buffer.from('test-user:test-password').toString('base64')}`;
    const token = signVoiceToolToken(
      { accountId: 'acc-123', providerCallId: 'call-xyz', callerPhone: '+12485550199' },
      3600,
      {
        LGQ_VOICE_RECEIPT_BASIC: 'test-user:test-password',
        SIGNALWIRE_SIGNING_KEY: 'test-secret',
      },
    );

    const req = new Request(`https://example.com/api/voice/swaig?token=${token}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeader,
      },
      body: JSON.stringify({
        function: 'capture_lead',
        argument: {
          name: 'Sarah Connor',
          phone: 'none',
          address: '123 Resistance Way',
          notes: 'Burst pipe under kitchen sink',
        },
      }),
    });

    const res = await swaigHandler(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.response).toContain('Sarah Connor');
    expect(data.response).toContain('123 Resistance Way');
  });
});


describe('voice tool truthfulness and appointment safety', () => {
  async function invoke(fn: string, argument: Record<string, unknown> = {}) {
    process.env.LGQ_VOICE_RECEIPT_BASIC = 'test-user:test-password';
    process.env.SIGNALWIRE_SIGNING_KEY = 'test-secret';
    const { signVoiceToolToken } = await import('@/lib/voice/auth');
    const { POST } = await import('@/app/api/voice/swaig/route');
    const token = signVoiceToolToken({ accountId: 'acc-123', providerCallId: 'call-xyz', callerPhone: '+12485550199' });
    return POST(new Request(`https://example.com/api/voice/swaig?token=${token}`, { method: 'POST', headers: {
      'Content-Type': 'application/json', Authorization: `Basic ${Buffer.from('test-user:test-password').toString('base64')}`,
    }, body: JSON.stringify({ function: fn, argument }) }));
  }
  it('saves an office-review request using signed caller identity without mutating an appointment', async () => {
    const { createAdminClient } = await import('@/lib/auth');
    const { createLead } = await import('@/lib/leads');
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    const from = vi.fn(); vi.mocked(createAdminClient).mockReturnValue({ rpc, from } as never);
    const res = await invoke('cancel_or_reschedule_appointment',{action:'cancel',customer_phone:'+15559999999'});
    expect((await res.json()).response).toContain('has not changed');
    expect(createLead).toHaveBeenLastCalledWith(expect.anything(),'acc-123',expect.objectContaining({phone:'+12485550199'}));
    expect(from).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith('append_voice_appointment_request',expect.objectContaining({p_call_id:'call-xyz'}));
  });
  it('does not announce success after request persistence fails', async () => {
    const { createAdminClient } = await import('@/lib/auth');
    vi.mocked(createAdminClient).mockReturnValue({ rpc: async () => ({data:false,error:null}) } as never);
    const res = await invoke('cancel_or_reschedule_appointment',{action:'cancel'});
    expect((await res.json()).response).toContain('could not save');
  });
  it('does not announce lead capture success after a failed write', async () => {
    const { createLead } = await import('@/lib/leads');
    vi.mocked(createLead).mockRejectedValueOnce(new Error('offline'));
    const res = await invoke('capture_lead',{name:'Caller'});
    expect((await res.json()).response).toContain('could not save');
  });
  it('blocks tools after admission revocation', async () => {
    const { authorizeVoiceToolInvocation } = await import('@/lib/voice/tool-admission');
    vi.mocked(authorizeVoiceToolInvocation).mockResolvedValueOnce(false);
    expect((await invoke('capture_lead')).status).toBe(403);
  });
});
