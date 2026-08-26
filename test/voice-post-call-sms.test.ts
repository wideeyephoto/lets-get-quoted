import { describe, expect, it, vi } from 'vitest';
import { callerVoicePostCallFollowupText } from '@/lib/sms-templates';
import { triggerVoicePostCallFollowup } from '@/lib/voice/post-call-sms';

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
});
