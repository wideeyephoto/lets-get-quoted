import { describe, expect, it } from 'vitest';

import { signalwireVoiceProvider as provider } from '@/lib/voice/signalwire';

/**
 * The payload below is the one captured from a live SignalWire scratch agent on
 * 2026-08-19, trimmed to the fields this adapter reads. Measured, not imagined:
 * every earlier assumption about this provider — that a call-started event
 * arrives, that a duration field exists, that a signature can be verified —
 * turned out to be wrong when somebody actually placed a call.
 */
const CALL = 'a15ce0a0-ac77-44a8-bd9e-5d9e506775ba';
const measured = () => ({
  project_id: '2687f308-939e-4e73-97bd-4edfc0d7fd5a',
  space_id: '7e9a4752-2bfc-4cd1-a66f-fb3bd902a4ac',
  call_id: CALL,
  action: 'post_conversation',
  conversation_type: 'voice',
  call_log: [
    { role: 'system', content: 'You are a test agent.', timestamp: 1787171667036808 },
    { role: 'assistant', content: ' Hello! Please say "test complete."' },
    { role: 'user', content: 'Test complete. ' },
    { role: 'assistant', content: ' Thank you! The test is complete.' },
  ],
  call_start_date: 1787171665880654,
  call_answer_date: 1787171666607564,
  call_end_date: 1787171699845567,
  ai_start_date: 1787171667036808,
  ai_end_date: 1787171699843237,
  caller_id_number: 'sip:0d96cff8@example.call.signalwire.com;context=guest',
  SWMLVars: { userVariables: { memberCallId: CALL } },
  SWMLCall: { call_id: CALL, call_state: 'answered', direction: 'inbound' },
  post_prompt_data: { raw: 'This was an authentication test.', substituted: 'This was an authentication test.' },
});

describe('reading the measured receipt', () => {
  it('accepts the payload a real agent sent', () => {
    const parsed = provider.parseReceipt(measured());
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.receipt).toMatchObject({
      provider: 'signalwire',
      providerCallId: CALL,
      eventType: 'post_conversation',
      aiStartMicros: 1787171667036808,
      aiEndMicros: 1787171699843237,
    });
  });

  it('carries the billable window and the answered window separately', () => {
    const parsed = provider.parseReceipt(measured());
    if (!parsed.ok) throw new Error('expected a receipt');
    const r = parsed.receipt;
    // The AI session sits strictly inside the answered window. Billing the
    // answered window instead would charge for ringing and for any leg that
    // continued after the agent handed off.
    expect(r.aiStartMicros!).toBeGreaterThan(r.callAnswerMicros!);
    expect(r.aiEndMicros!).toBeLessThan(r.callEndMicros!);
    expect(r.aiEndMicros! - r.aiStartMicros!).toBe(32_806_429);
  });

  it('refuses a payload whose three copies of the call id disagree', () => {
    // A payload where they disagree is either a provider change worth noticing
    // or something hand-assembled. Reading one copy and ignoring the rest would
    // make both look ordinary.
    const forged = { ...measured(), SWMLCall: { call_id: 'someone-elses-call' } };
    expect(provider.parseReceipt(forged)).toMatchObject({ ok: false, reason: 'call_id_disagreement' });

    const forgedVars = { ...measured(), SWMLVars: { userVariables: { memberCallId: 'other' } } };
    expect(provider.parseReceipt(forgedVars)).toMatchObject({ ok: false, reason: 'call_id_disagreement' });
  });

  it('accepts a payload that simply omits the echoes', () => {
    // Absent is not disagreement. A provider that stops sending a redundant copy
    // must not take every call down with it.
    const { SWMLCall, SWMLVars, ...rest } = measured();
    void SWMLCall; void SWMLVars;
    expect(provider.parseReceipt(rest).ok).toBe(true);
  });

  it('says why it refused, rather than returning null', () => {
    expect(provider.parseReceipt(null)).toMatchObject({ ok: false, reason: 'not_an_object' });
    expect(provider.parseReceipt([])).toMatchObject({ ok: false, reason: 'not_an_object' });
    expect(provider.parseReceipt({ ...measured(), call_id: '  ' }))
      .toMatchObject({ ok: false, reason: 'missing_call_id' });
    expect(provider.parseReceipt({ ...measured(), action: 'call_started' }))
      .toMatchObject({ ok: false, reason: 'unsupported_event_type' });
  });

  it('treats a missing or zero timestamp as absent, never as a time', () => {
    const parsed = provider.parseReceipt({ ...measured(), ai_start_date: 0, ai_end_date: undefined });
    if (!parsed.ok) throw new Error('expected a receipt');
    // Zero would otherwise become 1970 and make every call look hours long.
    expect(parsed.receipt.aiStartMicros).toBeNull();
    expect(parsed.receipt.aiEndMicros).toBeNull();
  });

  it('prefers the provider summary, and falls back to the last thing said', () => {
    const withSummary = provider.parseReceipt(measured());
    if (!withSummary.ok) throw new Error('expected a receipt');
    expect(withSummary.receipt.summary).toBe('This was an authentication test.');

    const { post_prompt_data, ...rest } = measured();
    void post_prompt_data;
    const without = provider.parseReceipt(rest);
    if (!without.ok) throw new Error('expected a receipt');
    expect(without.receipt.summary).toBe('Thank you! The test is complete.');
  });
});

describe('reading an inbound call', () => {
  it('reads the compatibility fields the existing rail already uses', () => {
    const form = new FormData();
    form.set('To', '+15551230000');
    form.set('From', '+15559876543');
    form.set('CallSid', CALL);
    expect(provider.parseInboundCall(form)).toEqual({
      providerCallId: CALL, toNumber: '+15551230000', fromNumber: '+15559876543',
    });
  });

  it('returns null when there is no number to resolve a workspace by', () => {
    const form = new FormData();
    form.set('CallSid', CALL);
    expect(provider.parseInboundCall(form)).toBeNull();
  });

  it('returns null without a call id, since nothing could be settled later', () => {
    expect(provider.parseInboundCall({ To: '+15551230000' })).toBeNull();
  });
});

describe('rendering an answer', () => {
  it('points the receipt at a URL LGQ owns, and at no other URL', () => {
    const answer = provider.renderAnswer({
      kind: 'ai_agent',
      receiptUrl: 'https://letsgetquoted.com/api/voice/receipt?account=abc',
      greeting: 'Thanks for calling.',
      capMinutes: 60,
      transferTo: '+15551230000',
    });
    const swml = JSON.parse(answer.body);
    expect(answer.contentType).toBe('application/json');
    expect(JSON.stringify(swml)).toContain('letsgetquoted.com/api/voice/receipt');
    // The published safety cap is stated to the provider too, so it holds even
    // if LGQ's own settlement never runs.
    expect(swml.sections.main[1].ai.params.max_duration).toBe(3600);
  });

  it('omits the transfer function entirely when there is nowhere to transfer', () => {
    const answer = provider.renderAnswer({
      kind: 'ai_agent', receiptUrl: 'https://x.test/r', greeting: 'Hi', capMinutes: 60, transferTo: null,
    });
    expect(JSON.parse(answer.body).sections.main[1].ai.SWAIG).toBeUndefined();
  });

  it('escapes a number that would otherwise break the markup', () => {
    const answer = provider.renderAnswer({
      kind: 'forward', number: '+1555"><Hangup/>', callerId: '+15551230000',
      timeoutSeconds: 20, actionUrl: 'https://x.test/s?a=1&b=2',
    });
    expect(answer.body).not.toContain('<Hangup/>');
    expect(answer.body).toContain('&amp;b=2');
  });

  it('pins the spoken voice, so it does not change with the provider', () => {
    // <Say> defaults to a male voice on Twilio and a female one on SignalWire.
    for (const plan of [
      { kind: 'voicemail' as const, message: 'Leave a message.' },
      { kind: 'unavailable' as const, message: 'Sorry.' },
    ]) {
      expect(provider.renderAnswer(plan).body).toContain('<Say voice="man">');
    }
  });

  it('records after a voicemail prompt but not after an unavailable one', () => {
    // Voicemail is the contractor's configured handling; unavailable is LGQ
    // failing to resolve something, and recording that would file an outage as
    // if it were a message.
    expect(provider.renderAnswer({ kind: 'voicemail', message: 'Leave a message.' }).body)
      .toContain('<Record');
    expect(provider.renderAnswer({ kind: 'unavailable', message: 'Sorry.' }).body)
      .not.toContain('<Record');
  });
});
