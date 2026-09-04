import { describe, expect, it } from 'vitest';

import {
  minimizeSignalWireVoiceReceiptPayload,
  signalwireVoiceProvider as provider,
} from '@/lib/voice/signalwire';
import { sanitizeVoiceReceiptValue } from '@/lib/voice/receipt-redaction';

/**
 * The payload below is the one captured from a live SignalWire scratch agent on
 * 2026-08-19, trimmed to the fields this adapter reads. Measured, not imagined:
 * every earlier assumption about this provider — that a call-started event
 * arrives, that a duration field exists, that a signature can be verified —
 * turned out to be wrong when somebody actually placed a call.
 */
const CALL = 'a15ce0a0-ac77-44a8-bd9e-5d9e506775ba';
const RECEIPT_AUTH = Object.freeze({
  scheme: 'basic' as const,
  username: 'voice-receipt',
  password: 'test-only-password',
});
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
  raw_call_log: [{ role: 'user', content: 'duplicate raw transcript' }],
  call_timeline: [{ type: 'token', content: 'duplicate instrumented transcript' }],
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
  it('bounds deep model JSON while removing code keys and six-digit strings', () => {
    const otp = '481920';
    let deep: Record<string, unknown> = { code: otp };
    for (let index = 0; index < 20; index += 1) deep = { next: deep };
    const sanitized = sanitizeVoiceReceiptValue({
      code: 'arbitrary-secret',
      VerificationCode: 'spelled-out-secret',
      one_time_password: 'another-secret',
      note: `read ${otp}`,
      deep,
      oversized: [...Array.from({ length: 100 }, () => 'safe'), otp],
    });

    expect(JSON.stringify(sanitized)).not.toContain(otp);
    expect(JSON.stringify(sanitized)).not.toContain('arbitrary-secret');
    expect(JSON.stringify(sanitized)).not.toContain('spelled-out-secret');
    expect(JSON.stringify(sanitized)).not.toContain('another-secret');
    expect(sanitized).toMatchObject({
      code: '[REDACTED]',
      VerificationCode: '[REDACTED]',
      one_time_password: '[REDACTED]',
      note: 'read [REDACTED]',
    });
  });

  it('redacts ASR-formatted OTPs while preserving complete phone numbers', () => {
    const sanitized = sanitizeVoiceReceiptValue({
      grouped: 'The authorization code is 123 456.',
      separated: 'Code: 1-2-3-4-5-6.',
      words: 'My verification code was one two three four five six.',
      bareSpokenDigits: '1 2 3 4 5 6',
      bareSpokenWords: 'one two three four five six',
      embeddedSpokenWords: 'It is one two three four five six.',
      phoneDigits: 'My phone is 8 1 0 3 0 4 2 0 6 1.',
      phoneWords: 'My phone is eight one zero three zero four two zero six one.',
    });

    expect(sanitized).toMatchObject({
      grouped: 'The authorization code is [REDACTED].',
      separated: 'Code: [REDACTED].',
      words: 'My verification code was [REDACTED].',
      bareSpokenDigits: '[REDACTED]',
      bareSpokenWords: '[REDACTED]',
      embeddedSpokenWords: 'It is [REDACTED].',
      phoneDigits: 'My phone is 8 1 0 3 0 4 2 0 6 1.',
      phoneWords: 'My phone is eight one zero three zero four two zero six one.',
    });
  });

  it('redacts bare grouped six-digit OTPs while preserving complete phone runs', () => {
    const sanitized = sanitizeVoiceReceiptValue({
      groupedThreeThree: '123-456',
      groupedTwoTwoTwo: '12 34 56',
      groupedIrregular: '1 23 45 6',
      phoneContiguous: '2485550105',
      phoneSeparated: '248-555-0105',
      phoneSpaced: '248 555 0105',
    });

    expect(sanitized).toEqual(expect.objectContaining({
      groupedThreeThree: '[REDACTED]',
      groupedTwoTwoTwo: '[REDACTED]',
      groupedIrregular: '[REDACTED]',
      phoneContiguous: '2485550105',
      phoneSeparated: '248-555-0105',
      phoneSpaced: '248 555 0105',
    }));
  });

  it('redacts OTPs before the persisted transcript truncation boundary', () => {
    const boundary = 'x'.repeat(19_995);
    const spokenBoundary = `${'x'.repeat(19_994)} `;
    const sanitized = sanitizeVoiceReceiptValue({
      numeric: `${boundary}123456 trailing provider text`,
      separated: `${boundary}1-2-3-4-5-6 trailing provider text`,
      grouped: `${boundary}123-456 trailing provider text`,
      spoken: `${spokenBoundary}one two three four five six trailing provider text`,
    });

    expect(sanitized).toMatchObject({
      numeric: expect.stringContaining('[REDACTED]'),
      separated: expect.stringContaining('[REDACTED]'),
      grouped: expect.stringContaining('[REDACTED]'),
      spoken: expect.stringContaining('[REDACTED]'),
    });
    const durableJson = JSON.stringify(sanitized);
    expect(durableJson).not.toContain('12345');
    expect(durableJson).not.toContain('1-2-3-4-5');
    expect(durableJson).not.toContain('one two three four five');
    expect(durableJson).toContain('[TRUNCATED]');
  });

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
      callLog: [
        { role: 'system', content: 'You are a test agent.', timestamp: 1787171667036808 },
        { role: 'assistant', content: 'Hello! Please say "test complete."', timestamp: null },
        { role: 'user', content: 'Test complete.', timestamp: null },
        { role: 'assistant', content: 'Thank you! The test is complete.', timestamp: null },
      ],
    });
  });

  it('separates one normalized transcript from transcript-free receipt evidence', () => {
    const payload = measured();
    const parsed = provider.parseReceipt(payload);
    if (!parsed.ok) throw new Error('expected a receipt');

    const evidence = minimizeSignalWireVoiceReceiptPayload(payload, parsed.receipt);
    expect(evidence).toMatchObject({
      action: 'post_conversation',
      call_id: CALL,
      project_id: payload.project_id,
      space_id: payload.space_id,
      summary: 'This was an authentication test.',
    });
    for (const transcriptKey of [
      'call_log', 'raw_call_log', 'call_timeline', 'post_prompt_data',
    ]) {
      expect(evidence).not.toHaveProperty(transcriptKey);
    }
    expect(parsed.receipt.callLog).toHaveLength(4);
  });

  it('redacts spoken OTPs and exact code arguments before receipt evidence exists', () => {
    const otp = '481920';
    const payload = {
      ...measured(),
      call_log: [
        { role: 'user', content: `The authorization code is ${otp}. My phone is 8103042061.` },
        { role: 'tool', content: JSON.stringify({ code: otp, action: 'verify_staff_step_up' }) },
      ],
      post_prompt_data: {
        substituted: `Staff caller supplied ${otp}.`,
        parsed: {
          code: otp,
          issue_summary: `Verified with ${otp}`,
          nested: [{
            tool_args: { code: 'not-six-digits-but-still-secret' },
            numeric_note: 123456,
            leading_zero_note: '048192',
          }],
        },
      },
    };

    const parsed = provider.parseReceipt(payload);
    if (!parsed.ok) throw new Error('expected a receipt');
    const evidence = minimizeSignalWireVoiceReceiptPayload(payload, parsed.receipt);

    expect(JSON.stringify(parsed.receipt)).not.toContain(otp);
    expect(JSON.stringify(parsed.receipt)).not.toContain('123456');
    expect(JSON.stringify(parsed.receipt)).not.toContain('048192');
    expect(JSON.stringify(evidence)).not.toContain(otp);
    expect(parsed.receipt.summary).toBe('Staff caller supplied [REDACTED].');
    expect(parsed.receipt.callLog?.[0].content).toContain('[REDACTED]');
    expect(parsed.receipt.callLog?.[0].content).toContain('8103042061');
    expect(parsed.receipt.structuredPostPrompt).toMatchObject({
      code: '[REDACTED]',
      issue_summary: 'Verified with [REDACTED]',
      nested: [{
        tool_args: { code: '[REDACTED]' },
        numeric_note: '[REDACTED]',
        leading_zero_note: '[REDACTED]',
      }],
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
    expect(provider.parseReceipt({ ...measured(), project_id: '  ' }))
      .toMatchObject({ ok: false, reason: 'missing_project_id' });
    expect(provider.parseReceipt({ ...measured(), space_id: null }))
      .toMatchObject({ ok: false, reason: 'missing_space_id' });
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
      receiptUrl: 'https://letsgetquoted.com/api/voice/receipt',
      receiptAuthorization: RECEIPT_AUTH,
      greeting: 'Thanks for calling.',
      capMinutes: 60,
      transferTo: '+15551230000',
    });
    const swml = JSON.parse(answer.body);
    const ai = swml.sections.main[2].ai;
    expect(answer.contentType).toBe('application/json');
    expect(JSON.stringify(swml)).toContain('letsgetquoted.com/api/voice/receipt');
    expect(ai.post_prompt_url).not.toContain('@');
    expect(ai.post_prompt_auth_user).toBe(RECEIPT_AUTH.username);
    expect(ai.post_prompt_auth_password).toBe(RECEIPT_AUTH.password);
    // `prompt` is hidden model context. The disclosure must be deterministic
    // audio before the AI starts, not an instruction the model may paraphrase.
    expect(swml.sections.main[1].play.url)
      .toBe('say: You are speaking with an AI assistant. Thanks for calling.');
    expect(ai.prompt.text).toContain('opening greeting and AI disclosure have already been played');
    // The published safety cap is stated to the provider too, so it holds even
    // if LGQ's own settlement never runs.
    expect(ai.params.max_duration).toBe(3600);
  });

  it('plays both disclosures before it starts call recording', () => {
    const answer = provider.renderAnswer({
      kind: 'ai_agent', receiptUrl: 'https://x.test/r', receiptAuthorization: RECEIPT_AUTH,
      greeting: 'Thanks for calling.', capMinutes: 60, transferTo: null,
      recordCall: true, recordingStatusUrl: 'https://x.test/recording',
    });
    const main = JSON.parse(answer.body).sections.main;
    const playIndex = main.findIndex((section: Record<string, unknown>) => 'play' in section);
    const recordIndex = main.findIndex((section: Record<string, unknown>) => 'record_call' in section);

    expect(playIndex).toBeGreaterThan(-1);
    expect(recordIndex).toBeGreaterThan(playIndex);
    expect(main[playIndex].play.url).toContain('You are speaking with an AI assistant.');
    expect(main[playIndex].play.url).toContain('This call may be recorded for quality and training purposes.');
  });

  it('hard-disables provider recording on contractor calls and asks the provider to redact spoken codes', () => {
    const answer = provider.renderAnswer({
      kind: 'ai_agent', receiptUrl: 'https://x.test/r', receiptAuthorization: RECEIPT_AUTH,
      greeting: 'Thanks for calling.', capMinutes: 60, transferTo: null,
      recordCall: true, recordingStatusUrl: 'https://x.test/recording',
      swaigUrl: 'https://x.test/swaig', contractorMode: true,
    });
    const main = JSON.parse(answer.body).sections.main;
    expect(main.some((section: Record<string, unknown>) => 'record_call' in section)).toBe(false);
    expect(main.find((section: Record<string, unknown>) => 'play' in section).play.url)
      .not.toContain('This call may be recorded');
    const ai = main.find((section: Record<string, unknown>) => 'ai' in section).ai;
    expect(ai.params.redact_prompt).toMatch(/six-digit voice authorization codes/i);
    expect(ai.params.redact_prompt).toMatch(/one-time passwords|OTPs/i);
  });

  it('renders conservative contractor mutation tool contracts', () => {
    const answer = provider.renderAnswer({
      kind: 'ai_agent', receiptUrl: 'https://x.test/r', receiptAuthorization: RECEIPT_AUTH,
      greeting: 'Hi', capMinutes: 60, transferTo: null,
      swaigUrl: 'https://x.test/swaig', contractorMode: true,
    });
    const ai = JSON.parse(answer.body).sections.main
      .find((section: Record<string, unknown>) => 'ai' in section).ai;
    const functions = ai.SWAIG.functions;
    const tool = (name: string) => functions.find((candidate: { function: string }) => candidate.function === name);

    const requestStepUp = tool('request_staff_step_up');
    const verifyStepUp = tool('verify_staff_step_up');
    expect(requestStepUp).toBeDefined();
    expect(requestStepUp.argument.properties).toEqual({});
    expect(verifyStepUp.argument.required).toEqual(['code']);
    expect(verifyStepUp.argument.properties.code.pattern).toBe('^[0-9]{6}$');
    expect(verifyStepUp.purpose).toMatch(/never repeat the code aloud/i);
    expect(tool('book_appointment_slot')).toBeUndefined();
    expect(tool('send_booking_link')).toBeUndefined();

    for (const name of [
      'append_job_caution_or_note',
      'update_job_details',
      'log_crew_time_and_materials',
      'create_job_change_order',
    ]) {
      const description = tool(name).argument.properties.job_ref_or_client.description;
      expect(description).toMatch(/exact job reference or job UUID/i);
      expect(description).toMatch(/ask a clarifying question/i);
      expect(description).toMatch(/never guess/i);
    }

    const lead = tool('create_or_update_lead');
    expect(lead.purpose).toMatch(/create a new customer lead only/i);
    expect(lead.purpose).toMatch(/do not use this tool to update or implicitly match/i);
    expect(lead.purpose).toMatch(/exact lead ID/i);
    expect(lead.argument.properties.intent.enum).toEqual(['create']);
    expect(lead.argument.required).toEqual(expect.arrayContaining(['intent', 'name']));

    const timeAndMaterials = tool('log_crew_time_and_materials');
    expect(timeAndMaterials.argument.properties.crew_name.description).toMatch(/whenever hours are included/i);
    expect(timeAndMaterials.argument.properties.hours.description).toMatch(/positive, finite/i);
    expect(timeAndMaterials.argument.properties.materials.description).toMatch(/required whenever material_cost/i);
    expect(timeAndMaterials.argument.properties.material_cost.description).toMatch(/never submit.*without materials/i);

    expect(tool('create_job_change_order').argument.required)
      .toEqual(expect.arrayContaining(['job_ref_or_client', 'title', 'description']));
  });

  it('never exposes staff step-up tools on a customer-mode call', () => {
    const answer = provider.renderAnswer({
      kind: 'ai_agent', receiptUrl: 'https://x.test/r', receiptAuthorization: RECEIPT_AUTH,
      greeting: 'Hi', capMinutes: 60, transferTo: null,
      swaigUrl: 'https://x.test/swaig', contractorMode: false,
    });
    const ai = JSON.parse(answer.body).sections.main
      .find((section: Record<string, unknown>) => 'ai' in section).ai;
    const names = ai.SWAIG.functions.map((candidate: { function: string }) => candidate.function);
    expect(names).not.toContain('request_staff_step_up');
    expect(names).not.toContain('verify_staff_step_up');
  });

  it('omits the transfer function entirely when there is nowhere to transfer', () => {
    const answer = provider.renderAnswer({
      kind: 'ai_agent', receiptUrl: 'https://x.test/r', receiptAuthorization: RECEIPT_AUTH,
      greeting: 'Hi', capMinutes: 60, transferTo: null,
    });
    expect(JSON.parse(answer.body).sections.main[2].ai.SWAIG).toBeUndefined();
  });

  it('marks a SWAIG connect as a transfer, as the provider contract requires', () => {
    const answer = provider.renderAnswer({
      kind: 'ai_agent', receiptUrl: 'https://x.test/r', receiptAuthorization: RECEIPT_AUTH,
      greeting: 'Hi', capMinutes: 60, transferTo: '+15551230000',
    });
    const action = JSON.parse(answer.body)
      .sections.main[2].ai.SWAIG.functions[0].data_map.expressions[0].output.action[0];
    expect(action.transfer).toBe(true);
    expect(action.SWML.sections.main[0].connect.to).toBe('+15551230000');
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

  it('parses structured JSON post prompt data into receipt.structuredPostPrompt', () => {
    const payload = {
      ...measured(),
      post_prompt_data: {
        raw: JSON.stringify({
          caller_name: 'Marcus Brody',
          caller_phone: '+12485554321',
          service_address: '100 Indiana Blvd',
          work_requested: 'Furnace blowing cold air',
          urgency: 'urgent',
          is_emergency: false,
          hazard_type: null,
          requested_slot: 'Tomorrow Afternoon',
          follow_up_action: 'callback_required',
          confidence: 0.95,
        }),
      },
    };

    const parsed = provider.parseReceipt(payload);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    expect(parsed.receipt.structuredPostPrompt).toEqual({
      caller_name: 'Marcus Brody',
      caller_phone: '+12485554321',
      service_address: '100 Indiana Blvd',
      work_requested: 'Furnace blowing cold air',
      urgency: 'urgent',
      is_emergency: false,
      hazard_type: null,
      requested_slot: 'Tomorrow Afternoon',
      follow_up_action: 'callback_required',
      confidence: 0.95,
    });
  });
});
