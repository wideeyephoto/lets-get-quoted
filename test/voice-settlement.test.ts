import { beforeEach, describe, expect, it, vi } from 'vitest';

import { settleVoiceReceipt } from '@/lib/voice/settlement';
import type { VoiceReceipt } from '@/lib/voice/provider';

const settleVoiceCall = vi.fn();
vi.mock('@/lib/billing/voice-minute-usage', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  settleVoiceCall: (...a: unknown[]) => settleVoiceCall(...a),
}));

const settleUsageOverage = vi.fn();
vi.mock('@/lib/billing/usage-overage', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  settleUsageOverage: (...a: unknown[]) => settleUsageOverage(...a),
}));

const createLead = vi.fn();
vi.mock('@/lib/leads', () => ({ createLead: (...a: unknown[]) => createLead(...a) }));

const ACCOUNT = '11111111-1111-4111-8111-111111111111';
const CALL = 'a15ce0a0-ac77-44a8-bd9e-5d9e506775ba';
const EVENT = '22222222-2222-4222-8222-222222222222';

const admitted = (overrides: Record<string, unknown> = {}) => ({
  account_id: ACCOUNT,
  reservation_id: 'res-1',
  reserved_minutes: 60,
  overage_key: null,
  caller_number: '+15559876543',
  caller_kind: 'customer',
  ...overrides,
});

let admissionRow: unknown;
let admissionError: { code?: string; message?: string } | null;
let historyError: { code?: string; message?: string } | null;
const history = vi.fn();
const admin = {
  from(table: string) {
    const chain: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'update']) chain[method] = () => chain;
    chain.maybeSingle = () => Promise.resolve({ data: admissionRow, error: admissionError });
    // The history write is a real call, not a no-op. Without this the whole
    // recordCallHistory path threw into its own catch and these tests proved
    // nothing about it -- which is exactly the shape of a green run that means
    // nothing, and the reason the ledger harness stopped transcribing.
    chain.upsert = (row: unknown) => {
      if (table === 'voice_calls') history(row);
      return Promise.resolve({ error: table === 'voice_calls' ? historyError : null });
    };
    (chain as { then: unknown }).then = (r: (v: unknown) => unknown) => r({ data: null, error: null });
    return chain;
  },
} as never;

/** The measured call: 32.806429s of AI-connected time. */
const receipt = (over: Partial<VoiceReceipt> = {}): VoiceReceipt => ({
  provider: 'signalwire',
  providerCallId: CALL,
  eventType: 'post_conversation',
  projectId: 'p', spaceId: 's',
  callStartMicros: 1787171665880654,
  callAnswerMicros: 1787171666607564,
  callEndMicros: 1787171699845567,
  aiStartMicros: 1787171667036808,
  aiEndMicros: 1787171699843237,
  callerNumber: '+15559876543',
  summary: 'Caller wants a leaking outdoor tap looked at, Tuesday if possible.',
  callLog: [
    { role: 'user', content: 'My outdoor tap is leaking.', timestamp: 1787171680000000 },
    { role: 'assistant', content: 'I will pass that along.', timestamp: null },
  ],
  ...over,
});

beforeEach(() => {
  settleVoiceCall.mockReset();
  settleVoiceCall.mockResolvedValue(1);
  settleUsageOverage.mockReset();
  settleUsageOverage.mockResolvedValue({ settled: true, refundedMillicents: 2_065_000 });
  createLead.mockReset();
  createLead.mockResolvedValue({ id: 'lead-1' });
  history.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  admissionRow = admitted();
  admissionError = null;
  historyError = null;
});

describe('settling a call', () => {
  it('commits the AI-connected minutes and creates the lead', async () => {
    const result = await settleVoiceReceipt(admin, receipt());
    expect(result).toMatchObject({ minutes: 1, billed: true, leadId: 'lead-1', reconcile: null });
    expect(settleVoiceCall).toHaveBeenCalledWith(admin, expect.objectContaining({
      reservationId: 'res-1', reservedMinutes: 60,
    }), 1);
  });

  it('files the lead as an AI call, not a missed one', async () => {
    // The call was answered. Filing it as missed would also collide with the
    // text-back dedupe, which suppresses on source within ten minutes.
    await settleVoiceReceipt(admin, receipt());
    expect(createLead).toHaveBeenCalledWith(admin, ACCOUNT, expect.objectContaining({
      source: 'ai_voice',
    }));
  });

  it('puts what the caller actually said in front of the contractor', async () => {
    await settleVoiceReceipt(admin, receipt());
    expect(createLead.mock.calls[0][2].message).toContain('leaking outdoor tap');
  });

  it('uses the inbox event as the retry identity for both lead and history', async () => {
    await settleVoiceReceipt(admin, receipt(), { voiceEventId: EVENT });
    expect(createLead).toHaveBeenCalledWith(admin, ACCOUNT, expect.objectContaining({
      sourceVoiceEventId: EVENT,
    }));
    expect(history).toHaveBeenCalledWith(expect.objectContaining({
      voice_event_id: EVENT,
    }));
  });

  it('says so plainly when the agent returned no summary', async () => {
    await settleVoiceReceipt(admin, receipt({ summary: null }));
    expect(createLead.mock.calls[0][2].message).toContain('No summary was returned');
  });

  it('settles a verified staff call without inventing a customer lead', async () => {
    admissionRow = admitted({ caller_kind: 'owner' });

    const result = await settleVoiceReceipt(admin, receipt());

    expect(result).toMatchObject({ minutes: 1, billed: true, leadId: null });
    expect(createLead).not.toHaveBeenCalled();
    expect(history).toHaveBeenCalledWith(expect.objectContaining({
      lead_id: null,
    }));
  });
});

describe('the caller id, which is not always a phone number', () => {
  it('drops a SIP URI rather than filing it as a phone number', async () => {
    // The measured test call came from a browser and its caller_id_number was
    // `sip:...@example.call.signalwire.com`. A lead carrying that looks callable
    // and is not, which is worse than a lead with no number.
    admissionRow = admitted({ caller_number: null });
    await settleVoiceReceipt(admin, receipt({
      callerNumber: 'sip:0d96cff8@2687f308.call.signalwire.com;context=guest',
    }));
    const input = createLead.mock.calls[0][2];
    expect(input.phone).toBeNull();
    expect(input.name).toBe('AI call — caller unknown');
  });

  it('normalises a real number into the form everything else stores', async () => {
    await settleVoiceReceipt(admin, receipt({ callerNumber: '(555) 987-6543' }));
    expect(createLead.mock.calls[0][2].phone).toBe('+15559876543');
  });
});

describe('when the two halves disagree', () => {
  it('creates the lead even when settlement fails', async () => {
    // The caller still rang, and the contractor still needs to know.
    settleVoiceCall.mockResolvedValue(null);
    const result = await settleVoiceReceipt(admin, receipt());
    expect(result).toMatchObject({ minutes: null, reconcile: 'settlement_failed', leadId: 'lead-1' });
  });

  it('surfaces a lead write failure so the durable receipt retries it', async () => {
    // The ledger settlement already happened under a stable finalization key,
    // so replay is safe. Completing here would permanently lose the inquiry.
    const failure = new Error('leads table is having a day');
    createLead.mockRejectedValue(failure);
    await expect(settleVoiceReceipt(admin, receipt(), { voiceEventId: EVENT }))
      .rejects.toBe(failure);
    expect(settleVoiceCall).toHaveBeenCalledTimes(1);
    expect(history).not.toHaveBeenCalled();
  });

  it('leaves an unbillable receipt for a human instead of billing zero', async () => {
    // Null is not zero. Writing it off as a free call would be a silent
    // decision to stop charging for something that happened.
    const result = await settleVoiceReceipt(admin, receipt({ aiEndMicros: null }));
    expect(result).toMatchObject({ minutes: null, reconcile: 'unbillable_receipt' });
    expect(settleVoiceCall).not.toHaveBeenCalled();
    // The lead is still created: the call happened whatever the timestamps say.
    expect(createLead).toHaveBeenCalled();
  });

  it('settles nothing for a call admitted unmetered, and calls that fine', async () => {
    admissionRow = admitted({ reservation_id: null, reserved_minutes: 0 });
    const result = await settleVoiceReceipt(admin, receipt());
    expect(result).toMatchObject({ minutes: null, billed: false, reconcile: null });
    expect(settleVoiceCall).not.toHaveBeenCalled();
    expect(createLead).toHaveBeenCalled();
  });

  it('refuses to touch anything for a call it never admitted', async () => {
    admissionRow = null;
    const result = await settleVoiceReceipt(admin, receipt());
    expect(result).toMatchObject({ reconcile: 'no_admission', minutes: null, leadId: null });
    expect(settleVoiceCall).not.toHaveBeenCalled();
    // No lead either: inventing a customer from an unverifiable receipt would
    // put a stranger's details in a contractor's pipeline.
    expect(createLead).not.toHaveBeenCalled();
  });

  it('retries a database read failure instead of misclassifying it as no admission', async () => {
    admissionRow = null;
    admissionError = { code: '57014', message: 'statement timeout' };

    await expect(settleVoiceReceipt(admin, receipt()))
      .rejects.toThrow('Voice admission lookup failed (57014)');
    expect(settleVoiceCall).not.toHaveBeenCalled();
    expect(createLead).not.toHaveBeenCalled();
    expect(history).not.toHaveBeenCalled();
  });
});

describe('the row the contractor will read', () => {
  it('records the call, its length, and what it cost', async () => {
    await settleVoiceReceipt(admin, receipt());
    expect(history).toHaveBeenCalledWith(expect.objectContaining({
      account_id: ACCOUNT,
      provider_call_id: CALL,
      ai_seconds: 33,          // 32.806429s, to the nearest second
      billed_minutes: 1,       // rounded up
      settlement: 'allowance',
      lead_id: 'lead-1',
      transcript: receipt().callLog,
    }));
  });

  it('stores exactly the normalized call_log transcript in call history', async () => {
    const callLog = [
      { role: 'user', content: 'The basement is flooding.', timestamp: 12 },
    ] as const;
    await settleVoiceReceipt(admin, receipt({ callLog }));
    expect(history.mock.calls[0][0]).toMatchObject({ transcript: callLog });
  });

  it('retries instead of losing the sole transcript when call history is unavailable', async () => {
    historyError = { code: '57014', message: 'raw database detail must not escape' };
    await expect(settleVoiceReceipt(admin, receipt(), { voiceEventId: EVENT }))
      .rejects.toThrow('Voice call history write failed (57014)');
    expect(settleVoiceCall).toHaveBeenCalledTimes(1);
    expect(createLead).toHaveBeenCalledTimes(1);
    expect(history).toHaveBeenCalledTimes(1);
  });

  it('keeps the exact seconds beside the rounded minutes', async () => {
    // A contractor querying why a 61-second call cost two minutes needs to see
    // 61, not a number that already agrees with the bill.
    const start = 1_000_000_000;
    await settleVoiceReceipt(admin, receipt({
      aiStartMicros: start, aiEndMicros: start + 61 * 1_000_000,
    }));
    expect(history.mock.calls[0][0]).toMatchObject({ ai_seconds: 61, billed_minutes: 1 });
  });

  it('marks an unmetered call as answered-not-billed, not as free', async () => {
    admissionRow = admitted({ reservation_id: null, reserved_minutes: 0 });
    await settleVoiceReceipt(admin, receipt());
    expect(history.mock.calls[0][0]).toMatchObject({ settlement: 'unmetered', billed_minutes: null });
  });

  it('records an overage call AS an overage, not as allowance', async () => {
    // 'overage' was a legal value in the column, handled by the reader and
    // rendered as "at your overage rate" -- and nothing ever wrote it. Every
    // settled call, including one charged well above the allowance, was
    // recorded as 'allowance'.
    admissionRow = admitted({
      reservation_id: null,
      overage_key: 'ai-voice:v1:call_x:overage',
    });
    await settleVoiceReceipt(admin, receipt());
    expect(history.mock.calls[0][0]).toMatchObject({
      settlement: 'overage', billed_minutes: 1,
    });
  });

  it('does not call an overage call unmetered, which said it was not billed', async () => {
    // An overage call holds no reservation either, so testing reservation_id
    // alone told a contractor who had just paid the overage rate that the call
    // was "Answered -- not billed", and left its minutes out of the billed
    // total on the same card.
    admissionRow = admitted({
      reservation_id: null,
      overage_key: 'ai-voice:v1:call_x:overage',
    });
    await settleVoiceReceipt(admin, receipt());
    expect(history.mock.calls[0][0].settlement).not.toBe('unmetered');
  });

  it('trues the overage down to the minutes actually used', async () => {
    admissionRow = admitted({
      reservation_id: null,
      overage_key: 'ai-voice:v1:call_x:overage',
    });
    await settleVoiceReceipt(admin, receipt());
    // 33 seconds of AI time bills one minute, against a 60-minute hold.
    expect(settleUsageOverage).toHaveBeenCalledWith(admin, {
      accountId: ACCOUNT,
      idempotencyKey: 'ai-voice:v1:call_x:overage',
      units: 1,
    });
    expect(settleVoiceCall).not.toHaveBeenCalled();
  });

  it('never reports more overage minutes than the admission reserved', async () => {
    admissionRow = admitted({
      reservation_id: null,
      overage_key: 'ai-voice:v1:call_x:overage',
    });
    const start = 1_000_000_000;
    const result = await settleVoiceReceipt(admin, receipt({
      aiStartMicros: start,
      aiEndMicros: start + 61 * 60 * 1_000_000,
    }));

    expect(settleUsageOverage).toHaveBeenCalledWith(admin, {
      accountId: ACCOUNT,
      idempotencyKey: 'ai-voice:v1:call_x:overage',
      units: 60,
    });
    expect(result.minutes).toBe(60);
    expect(history.mock.calls[0][0]).toMatchObject({ billed_minutes: 60 });
  });

  it('reports a failed overage settlement rather than claiming success', async () => {
    settleUsageOverage.mockResolvedValue({ settled: false, refundedMillicents: 0 });
    admissionRow = admitted({
      reservation_id: null,
      overage_key: 'ai-voice:v1:call_x:overage',
    });
    const result = await settleVoiceReceipt(admin, receipt());
    expect(result.reconcile).toBe('settlement_failed');
  });

  it('still treats a call with neither a reservation nor an overage as unmetered', async () => {
    admissionRow = admitted({ reservation_id: null, reserved_minutes: 0 });
    await settleVoiceReceipt(admin, receipt());
    expect(history.mock.calls[0][0]).toMatchObject({ settlement: 'unmetered', billed_minutes: null });
  });

  it('flags an unbillable receipt for review rather than recording a zero', async () => {
    await settleVoiceReceipt(admin, receipt({ aiEndMicros: null }));
    expect(history.mock.calls[0][0]).toMatchObject({ settlement: 'unbillable', ai_seconds: null });
  });

  it('writes no history for a call this deployment never admitted', async () => {
    admissionRow = null;
    await settleVoiceReceipt(admin, receipt());
    expect(history).not.toHaveBeenCalled();
  });

  it('keys on the provider call id, so a replay updates rather than duplicates', async () => {
    await settleVoiceReceipt(admin, receipt());
    await settleVoiceReceipt(admin, receipt());
    for (const [row] of history.mock.calls) {
      expect(row).toMatchObject({ provider_call_id: CALL });
    }
  });

  it('populates structured caller name, address, urgency, and timeline from structured post-prompt', async () => {
    admissionRow = admitted({ reservation_id: null, reserved_minutes: 0 });
    createLead.mockResolvedValue({ id: 'lead-structured-123' });

    const structuredReceipt = receipt({
      structuredPostPrompt: {
        caller_name: 'Elena Rostova',
        caller_phone: '+12485559988',
        service_address: '777 Woodward Ave, Detroit, MI',
        work_requested: 'Main water line burst in basement',
        urgency: 'emergency',
        is_emergency: true,
        hazard_type: 'active_leak',
        requested_slot: '2026-08-27 Morning',
        follow_up_action: 'booked',
        confidence: 0.98,
      },
    });

    const result = await settleVoiceReceipt(admin, structuredReceipt, { voiceEventId: EVENT });
    expect(result.leadId).toBe('lead-structured-123');

    expect(createLead).toHaveBeenCalledWith(admin, ACCOUNT, expect.objectContaining({
      name: 'Elena Rostova',
      // Admission-bound caller ID is identity authority; model output cannot
      // redirect the CRM record to a different number.
      phone: '+15559876543',
      address: '777 Woodward Ave, Detroit, MI',
      projectType: 'Main water line burst in basement',
      triage: expect.objectContaining({
        score: 'hot',
        flags: expect.arrayContaining(['emergency_hazard', 'active_leak']),
        timeline: '2026-08-27 Morning',
      }),
    }));
  });
});
