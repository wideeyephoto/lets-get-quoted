import { describe, expect, it, vi } from 'vitest';
import { ownerVoiceEmergencyAlertText, ownerVoiceCallNotificationText } from '@/lib/sms-templates';
import { sendOwnerVoiceEmergencyAlertSms } from '@/lib/sms';
import { detectCallEmergency, notifyEmergencyCall, notifyOrdinaryCall } from '@/lib/voice/triage';

describe('AI Voice Emergency SMS Alerts (Tier 1)', () => {
  it('formats owner emergency alert text with clear caller context and direct link', () => {
    const text = ownerVoiceEmergencyAlertText({
      businessName: 'BrokePipes Plumbing',
      callerNumber: '+12485550199',
      hazardSummary: 'Natural gas leak reported in basement',
      dashboardUrl: 'https://app.letsgetquoted.com/dashboard/voice-calls/call-123',
    });

    expect(text).toContain('🚨 EMERGENCY CALL for BrokePipes Plumbing from +12485550199: Natural gas leak reported in basement.');
    expect(text).toContain('https://app.letsgetquoted.com/dashboard/voice-calls/call-123');
    expect(text).toContain('Reply STOP to opt out.');
  });

  it('detects emergency hazards and passes detection to notifyEmergencyCall', async () => {
    const summary = 'Homeowner smells a strong gas leak and hearing hissing in basement';
    const emergency = detectCallEmergency(summary);

    expect(emergency.isEmergency).toBe(true);
    expect(emergency.hazardType).toBe('gas_leak_hazard');

    const sentDeliveries: unknown[] = [];
    const mockAdmin = {
      from: (table: string) => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => {
              if (table === 'accounts') {
                return {
                  data: {
                    business_name: 'BrokePipes Plumbing',
                    alert_phone: '+12485550100',
                  },
                  error: null,
                };
              }
              return { data: null, error: null };
            },
          }),
        }),
      }),
      rpc: async (fn: string, args: Record<string, unknown>) => {
        if (fn === 'enqueue_sms_delivery') {
          sentDeliveries.push(args);
          return {
            data: [{ sms_event_id: '99999999-9999-4999-8999-999999999999', task_state: 'queued', created: true }],
            error: null,
          };
        }
        return { data: null, error: null };
      },
    } as never;

    const notified = await notifyEmergencyCall(
      mockAdmin,
      '11111111-1111-4111-8111-111111111111',
      '+12485550199',
      summary,
      emergency,
      'call-xyz-123',
    );

    expect(notified).toBe(true);
    expect(sentDeliveries).toHaveLength(1);
    const sent = sentDeliveries[0] as Record<string, unknown>;
    expect(sent.p_phone_number).toBe('+12485550100');
    expect(sent.p_message_kind).toBe('owner-voice-emergency-alert');
    expect(sent.p_body).toContain('🚨 EMERGENCY CALL for BrokePipes Plumbing');
    expect(sent.p_body).toContain('/dashboard/voice-calls/call-xyz-123');
  });

  it('does not send emergency SMS when call is normal inquiry', async () => {
    const summary = 'Customer inquiring about pricing for a routine bathroom faucet installation';
    const emergency = detectCallEmergency(summary);

    expect(emergency.isEmergency).toBe(false);

    const mockAdmin = {} as never;
    const notified = await notifyEmergencyCall(
      mockAdmin,
      '11111111-1111-4111-8111-111111111111',
      '+12485550199',
      summary,
      emergency,
      'call-normal-1',
    );

    expect(notified).toBe(false);
  });

  it('formats owner ordinary call notification text with caller name and inquiry summary', () => {
    const text = ownerVoiceCallNotificationText({
      businessName: 'BrokePipes Plumbing',
      callerName: 'Jane Smith',
      callerNumber: '+12485550199',
      summary: 'Caller requested quote for tankless water heater installation',
      dashboardUrl: 'https://app.letsgetquoted.com/dashboard/voice-calls/call-456',
    });

    expect(text).toContain('📞 New call answered for BrokePipes Plumbing from Jane Smith (+12485550199): Caller requested quote for tankless water heater installation.');
    expect(text).toContain('https://app.letsgetquoted.com/dashboard/voice-calls/call-456');
    expect(text).toContain('Reply STOP to opt out.');
  });

  it('dispatches ordinary call notification SMS when enabled', async () => {
    const sentDeliveries: unknown[] = [];
    const mockAdmin = {
      from: (table: string) => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => {
              if (table === 'accounts') {
                return {
                  data: {
                    business_name: 'BrokePipes Plumbing',
                    alert_phone: '+12485550100',
                  },
                  error: null,
                };
              }
              if (table === 'voice_settings') {
                return {
                  data: {
                    contractor_notifications_enabled: true,
                    contractor_notification_channel: 'sms',
                  },
                  error: null,
                };
              }
              return { data: null, error: null };
            },
          }),
        }),
      }),
      rpc: async (fn: string, args: Record<string, unknown>) => {
        if (fn === 'enqueue_sms_delivery') {
          sentDeliveries.push(args);
          return {
            data: [{ sms_event_id: '88888888-8888-4888-8888-888888888888', task_state: 'queued', created: true }],
            error: null,
          };
        }
        return { data: null, error: null };
      },
    } as never;

    const notified = await notifyOrdinaryCall(
      mockAdmin,
      '11111111-1111-4111-8111-111111111111',
      '+12485550199',
      'Caller requested water heater maintenance',
      'Bob Miller',
      'call-ord-1',
    );

    expect(notified).toBe(true);
    expect(sentDeliveries).toHaveLength(1);
    const sent = sentDeliveries[0] as Record<string, unknown>;
    expect(sent.p_phone_number).toBe('+12485550100');
    expect(sent.p_message_kind).toBe('owner-voice-call-notification');
    expect(sent.p_body).toContain('📞 New call answered for BrokePipes Plumbing');
    expect(sent.p_body).toContain('Bob Miller (+12485550199)');
  });

  it('skips ordinary call notification when contractor_notifications_enabled is false', async () => {
    const mockAdmin = {
      from: (table: string) => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => {
              if (table === 'voice_settings') {
                return {
                  data: {
                    contractor_notifications_enabled: false,
                  },
                  error: null,
                };
              }
              return { data: null, error: null };
            },
          }),
        }),
      }),
    } as never;

    const notified = await notifyOrdinaryCall(
      mockAdmin,
      '11111111-1111-4111-8111-111111111111',
      '+12485550199',
      'Routine maintenance inquiry',
      'Bob Miller',
      'call-ord-2',
    );

    expect(notified).toBe(false);
  });
});
