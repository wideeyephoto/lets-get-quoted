import { describe, expect, it } from 'vitest';
import { signalwireVoiceProvider } from '@/lib/voice/signalwire';
import type { VoiceAnswerPlan } from '@/lib/voice/provider';
import { callerVoiceBookingLinkText } from '@/lib/sms-templates';

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
    expect(functions).toHaveLength(3);

    // 1. Transfer tool
    const transferFn = functions.find((f: any) => f.function === 'transfer_to_business');
    expect(transferFn).toBeDefined();
    expect(transferFn.data_map.expressions[0].output.action[0].transfer).toBe(true);

    // 2. Booking Link tool
    const bookingFn = functions.find((f: any) => f.function === 'send_booking_link');
    expect(bookingFn).toBeDefined();
    expect(bookingFn.web_hook_url).toBe('https://example.com/api/voice/swaig?account_id=acc-123');
    expect(bookingFn.web_hook_auth_user).toBe('test-user');
    expect(bookingFn.web_hook_auth_password).toBe('test-password');
    expect(bookingFn.argument.properties.caller_phone).toBeDefined();

    // 3. Availability tool
    const availFn = functions.find((f: any) => f.function === 'check_contractor_availability');
    expect(availFn).toBeDefined();
    expect(availFn.web_hook_url).toBe('https://example.com/api/voice/swaig?account_id=acc-123');
    expect(availFn.web_hook_auth_user).toBe('test-user');
    expect(availFn.web_hook_auth_password).toBe('test-password');
  });

  it('formats caller booking link SMS copy accurately with opt-out compliance', () => {
    const text = callerVoiceBookingLinkText({
      businessName: 'BrokePipes Plumbing',
      bookingUrl: 'https://brokepipes.letsgetquoted.com/quote',
    });

    expect(text).toContain('Thanks for calling BrokePipes Plumbing!');
    expect(text).toContain('https://brokepipes.letsgetquoted.com/quote');
    expect(text).toContain('Reply STOP to opt out.');
  });
});
