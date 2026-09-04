import { describe, expect, it, vi } from 'vitest';
import { callerVoicePostCallFollowupText } from '@/lib/sms-templates';
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

  it('records sms_consent baseline and sms_consent_scopes upon triggering follow-up', async () => {
    const insertedRows: Record<string, unknown[]> = {};
    const mockAdmin = {
      from: (table: string) => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { post_call_sms_enabled: true },
              error: null,
            }),
          }),
        }),
        insert: async (row: unknown) => {
          insertedRows[table] = insertedRows[table] || [];
          insertedRows[table].push(row);
          return { error: null };
        },
      }),
    } as never;

    const result = await triggerVoicePostCallFollowup(
      mockAdmin,
      'acc-456',
      'call-789',
      '+12485550122',
      { callerName: 'Alice Green' }
    );

    expect(result.ok).toBe(true);
    expect(insertedRows.sms_consent).toBeDefined();
    expect(insertedRows.sms_consent[0]).toMatchObject({
      account_id: 'acc-456',
      phone_number: '+12485550122',
      status: 'opted_in',
      source: 'missed_call_text_back',
    });
    expect(insertedRows.sms_consent_scopes).toBeDefined();
    expect(insertedRows.sms_consent_scopes[0]).toMatchObject({
      account_id: 'acc-456',
      phone_number: '+12485550122',
      consent_scope: 'customer',
      evidence_source: 'missed_call_text_back',
    });
  });
});
