import { beforeEach, describe, expect, it, vi } from 'vitest';
import { callerVoicePostCallFollowupText } from '@/lib/sms-templates';
import { sendCallerVoicePostCallFollowupSms, ensureSmsConsentBaseline } from '@/lib/sms';
import { triggerVoicePostCallFollowup } from '@/lib/voice/post-call-sms';

vi.mock('@/lib/sms', () => ({
  sendCallerVoicePostCallFollowupSms: vi.fn(async () => ({ ok: true })),
  ensureSmsConsentBaseline: vi.fn(async () => true),
}));

describe('AI Voice Post-Call SMS Follow-up Engine', () => {
  it('formats scheduled appointment follow-up SMS text correctly with portal url', () => {
    const text = callerVoicePostCallFollowupText({
      businessName: 'Apex Roofing & Solar',
      callerName: 'Sarah Jenkins',
      scheduledTime: 'Thursday at 2:00 PM',
      portalUrl: 'https://apexroofing.letsgetquoted.com/portal',
    });

    expect(text).toContain('Hi Sarah Jenkins, thanks for calling Apex Roofing & Solar!');
    expect(text).toContain("We've reserved your appointment for Thursday at 2:00 PM.");
    expect(text).toContain('https://apexroofing.letsgetquoted.com/portal');
    expect(text).toContain('Reply STOP to opt out.');
  });

  it('formats general inquiry follow-up SMS text with issue summary', () => {
    const text = callerVoicePostCallFollowupText({
      businessName: 'Rivera Plumbing',
      callerName: 'Marcus Vance',
      issueSummary: 'Water heater leaking in garage',
      portalUrl: 'https://riveraplumbing.com/status',
    });

    expect(text).toContain('Hi Marcus Vance, thanks for calling Rivera Plumbing!');
    expect(text).toContain('We received your inquiry regarding Water heater leaking in garage.');
    expect(text).toContain('https://riveraplumbing.com/status');
    expect(text).toContain('Reply STOP to opt out.');
  });

  it('handles empty caller phone gracefully without throwing', async () => {
    const mockAdmin = {} as never;
    const result = await triggerVoicePostCallFollowup(
      mockAdmin,
      'acc-123',
      'call-123',
      '',
      { callerName: 'John Doe' }
    );

    expect(result.ok).toBe(false);
    expect(result.error).toContain('Invalid or missing caller phone');
  });

  it('skips follow-up SMS when postCallSmsEnabled is false in options', async () => {
    const mockAdmin = {} as never;
    const result = await triggerVoicePostCallFollowup(
      mockAdmin,
      'acc-123',
      'call-123',
      '+12485550199',
      { callerName: 'John Doe', postCallSmsEnabled: false }
    );

    expect(result.ok).toBe(true);
    expect(result.skipped).toBe(true);
  });

  it('skips follow-up SMS when post_call_sms_enabled is false in voice_settings', async () => {
    const mockAdmin = {
      from: (table: string) => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => {
              if (table === 'voice_settings') {
                return {
                  data: { post_call_sms_enabled: false },
                  error: null,
                };
              }
              return { data: null, error: null };
            },
          }),
        }),
      }),
    } as never;

    const result = await triggerVoicePostCallFollowup(
      mockAdmin,
      'acc-123',
      'call-123',
      '+12485550199',
      { callerName: 'John Doe' }
    );

    expect(result.ok).toBe(true);
    expect(result.skipped).toBe(true);
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(ensureSmsConsentBaseline).mockResolvedValue(true);
  });

  it('uses the atomic consent boundary before sending and reuses the supplied client', async () => {
    const admin = { rpc: vi.fn(), from: vi.fn() } as never;
    const result = await triggerVoicePostCallFollowup(admin, 'acc-456', 'call-789', '2485550122',
      { postCallSmsEnabled: true });
    expect(result.ok).toBe(true);
    expect(ensureSmsConsentBaseline).toHaveBeenCalledWith('acc-456', '+12485550122', 'missed_call_text_back', admin);
    expect(sendCallerVoicePostCallFollowupSms).toHaveBeenCalledWith(expect.objectContaining({
      callerPhone: '+12485550122', idempotencyKey: 'voice-post-call-followup-call-789',
    }));
  });

  it('treats STOP as a terminal skip instead of enqueueing or retrying', async () => {
    vi.mocked(ensureSmsConsentBaseline).mockResolvedValue(false);
    const result = await triggerVoicePostCallFollowup({} as never, 'acc-456', 'call-789', '+12485550122',
      { postCallSmsEnabled: true });
    expect(result).toEqual({ ok: true, skipped: true });
    expect(sendCallerVoicePostCallFollowupSms).not.toHaveBeenCalled();
  });

  it('reports a storage failure for settlement retry without enqueueing a doomed text', async () => {
    vi.mocked(ensureSmsConsentBaseline).mockRejectedValue(new Error('consent storage unavailable'));
    const result = await triggerVoicePostCallFollowup({} as never, 'acc-456', 'call-789', '+12485550122',
      { postCallSmsEnabled: true });
    expect(result).toEqual({ ok: false, error: 'consent storage unavailable' });
    expect(sendCallerVoicePostCallFollowupSms).not.toHaveBeenCalled();
  });

  it('rejects an invalid nonempty phone before attempting consent', async () => {
    const result = await triggerVoicePostCallFollowup({} as never, 'acc-456', 'call-789', 'not-a-phone',
      { postCallSmsEnabled: true });
    expect(result.ok).toBe(false);
    expect(ensureSmsConsentBaseline).not.toHaveBeenCalled();
    expect(sendCallerVoicePostCallFollowupSms).not.toHaveBeenCalled();
  });
});
