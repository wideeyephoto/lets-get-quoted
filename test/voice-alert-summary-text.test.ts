import { describe, expect, it } from 'vitest';
import { ownerVoiceCallNotificationText, ownerVoiceEmergencyAlertText } from '@/lib/sms-templates';

const input = {
  businessName: 'Test Plumbing',
  callerName: 'Brett',
  callerNumber: '+12485550199',
  dashboardUrl: 'https://app.letsgetquoted.com/dashboard/voice-calls/test-call',
};

describe('readable voice alert summaries', () => {
  it.each(['speak with a person', 'transfer to the owner'])('extracts the screenshot-shaped request: %s', (request) => {
    const summary = JSON.stringify({ caller_name: 'Brett', caller_phone: null, service_address: null,
      work_requested: request, urgency: 'normal', is_emergency: false, follow_up_action: 'none' }, null, 2);
    const text = ownerVoiceCallNotificationText({ ...input, summary });
    expect(text).toContain(`from Brett (+12485550199): ${request}. Details: ${input.dashboardUrl}`);
    expect(text).not.toMatch(/caller_name|work_requested|is_emergency|\bnull\b|[{}]/);
    expect(text.endsWith('Reply STOP to opt out.')).toBe(true);
  });

  it.each(['', '{"work_requested":null}', '{"work_requested":42,"service_address":{}}',
    '{"work_requested": "broken', '[{"work_requested":"hidden"}]'])('uses a readable fallback for empty or unusable payload %s', (summary) => {
    const text = ownerVoiceCallNotificationText({ ...input, summary });
    expect(text).toContain('No call summary available. Details:');
    expect(text).not.toContain('work_requested');
  });

  it('accepts fenced JSON and distinguishes requested from booked slots', () => {
    const text = ownerVoiceCallNotificationText({ ...input, summary: '```json\n{"work_requested":"Repair faucet","requested_slot":"Friday"}\n```' });
    expect(text).toContain('Repair faucet Requested: Friday. Details:');
    expect(text).not.toContain('Booked:');
  });

  it('uses a transfer request when work was not captured', () => {
    expect(ownerVoiceCallNotificationText({ ...input, summary: '{"transfer_requested":true}' }))
      .toContain('Caller requested a transfer. Details:');
  });

  it('normalizes prose without adding duplicate punctuation', () => {
    expect(ownerVoiceCallNotificationText({ ...input, summary: '  Needs\n a repair.  ' }))
      .toContain(': Needs a repair. Details:');
  });

  it('shortens prose on a word boundary while retaining the full link and opt-out', () => {
    const text = ownerVoiceCallNotificationText({ ...input, summary: 'water heater replacement '.repeat(20) });
    const brief = text.split('): ')[1].split(' Details:')[0];
    expect(brief.length).toBeLessThanOrEqual(140);
    expect(brief).toMatch(/(?:water|heater|replacement)\.\.\.$/);
    expect(text.endsWith(`${input.dashboardUrl} — Reply STOP to opt out.`)).toBe(true);
  });

  it('formats structured emergency details without exposing serialized fields', () => {
    const text = ownerVoiceEmergencyAlertText({ ...input, hazardSummary: JSON.stringify({
      caller_name: 'A'.repeat(180), work_requested: 'Water pouring into basement', hazard_type: 'water_leak_flooding',
    }) });
    expect(text).toContain('Water pouring into basement Hazard: water leak flooding. Review details');
    expect(text).not.toContain('caller_name');
    expect(text.endsWith(`${input.dashboardUrl} — Reply STOP to opt out.`)).toBe(true);
  });
});
