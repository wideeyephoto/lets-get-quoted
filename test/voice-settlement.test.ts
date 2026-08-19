import { beforeEach, describe, expect, it, vi } from 'vitest';

import { settleVoiceReceipt } from '@/lib/voice/settlement';
import type { VoiceReceipt } from '@/lib/voice/provider';

const settleVoiceCall = vi.fn();
vi.mock('@/lib/billing/voice-minute-usage', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  settleVoiceCall: (...a: unknown[]) => settleVoiceCall(...a),
}));

const createLead = vi.fn();
vi.mock('@/lib/leads', () => ({ createLead: (...a: unknown[]) => createLead(...a) }));

const ACCOUNT = '11111111-1111-4111-8111-111111111111';
const CALL = 'a15ce0a0-ac77-44a8-bd9e-5d9e506775ba';

let admissionRow: unknown;
const admin = {
  from() {
    const chain: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'update']) chain[method] = () => chain;
    chain.maybeSingle = () => Promise.resolve({ data: admissionRow, error: null });
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
  ...over,
});

beforeEach(() => {
  settleVoiceCall.mockReset();
  settleVoiceCall.mockResolvedValue(1);
  createLead.mockReset();
  createLead.mockResolvedValue({ id: 'lead-1' });
  vi.spyOn(console, 'error').mockImplementation(() => {});
  admissionRow = { account_id: ACCOUNT, reservation_id: 'res-1', reserved_minutes: 60 };
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

  it('says so plainly when the agent returned no summary', async () => {
    await settleVoiceReceipt(admin, receipt({ summary: null }));
    expect(createLead.mock.calls[0][2].message).toContain('No summary was returned');
  });
});

describe('the caller id, which is not always a phone number', () => {
  it('drops a SIP URI rather than filing it as a phone number', async () => {
    // The measured test call came from a browser and its caller_id_number was
    // `sip:...@example.call.signalwire.com`. A lead carrying that looks callable
    // and is not, which is worse than a lead with no number.
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

  it('settles even when the lead write fails', async () => {
    // The minutes were used. A failed insert does not un-use them.
    createLead.mockRejectedValue(new Error('leads table is having a day'));
    const result = await settleVoiceReceipt(admin, receipt());
    expect(result).toMatchObject({ minutes: 1, billed: true, leadId: null });
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
    admissionRow = { account_id: ACCOUNT, reservation_id: null, reserved_minutes: 0 };
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
});
