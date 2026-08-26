import { describe, it, expect } from 'vitest';
import { signalwireVoiceProvider } from '../src/lib/voice/signalwire';
import type { VoiceAnswerPlan } from '../src/lib/voice/provider';

describe('SignalWire SWML SWAIG Permitting Tools Registration', () => {
  it('includes check_permit_requirement and check_inspection_status when swaigUrl is provided', () => {
    const plan: VoiceAnswerPlan = {
      kind: 'ai_agent',
      greeting: 'Thanks for calling Apex Roofing.',
      systemPrompt: 'You are an AI receptionist for Apex Roofing.',
      postPrompt: 'Summarize the caller details.',
      capMinutes: 10,
      transferTo: null,
      receiptUrl: 'https://app.letsgetquoted.com/api/voice/receipt',
      receiptAuthorization: {
        scheme: 'basic',
        username: 'user-123',
        password: 'pass-456',
      },
      swaigUrl: 'https://app.letsgetquoted.com/api/voice/swaig?account_id=acc-1',
    };

    const answer = signalwireVoiceProvider.renderAnswer(plan);
    expect(answer.contentType).toBe('application/json');

    const swml = JSON.parse(answer.body);
    const mainAi = swml.sections.main.find((s: any) => s.ai)?.ai;
    expect(mainAi).toBeDefined();

    const functions = mainAi.SWAIG.functions;
    expect(functions).toBeInstanceOf(Array);

    const permitReqFn = functions.find((f: any) => f.function === 'check_permit_requirement');
    expect(permitReqFn).toBeDefined();
    expect(permitReqFn.web_hook_url).toBe(plan.swaigUrl);
    expect(permitReqFn.argument.properties.city_or_address).toBeDefined();
    expect(permitReqFn.argument.properties.trade).toBeDefined();

    const inspStatusFn = functions.find((f: any) => f.function === 'check_inspection_status');
    expect(inspStatusFn).toBeDefined();
    expect(inspStatusFn.web_hook_url).toBe(plan.swaigUrl);
    expect(inspStatusFn.argument.properties.customer_name_or_address).toBeDefined();
  });
});
