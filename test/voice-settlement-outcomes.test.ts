import { describe, expect, it, vi } from 'vitest';
import type { VoiceReceipt } from '@/lib/voice/provider';

vi.mock('@/lib/billing/voice-minute-usage', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  settleVoiceCall: vi.fn().mockResolvedValue(1),
}));

vi.mock('@/lib/billing/usage-overage', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  settleUsageOverage: vi.fn().mockResolvedValue({ settled: true, refundedMillicents: 0 }),
}));

vi.mock('@/lib/leads', () => ({
  createLead: vi.fn().mockResolvedValue({ id: 'lead-1' }),
}));

vi.mock('@/lib/voice/triage', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  notifyEmergencyCall: vi.fn().mockResolvedValue(undefined),
}));

import {
  inferProviderOutcome,
  recordProvisionalVoiceCall,
  settleVoiceReceipt,
} from '@/lib/voice/settlement';

const ACCOUNT = '11111111-1111-4111-8111-111111111111';
const CALL = 'a15ce0a0-ac77-44a8-bd9e-5d9e506775ba';

const baseReceipt: VoiceReceipt = {
  provider: 'signalwire',
  providerCallId: CALL,
  eventType: 'post_conversation',
  projectId: 'p',
  spaceId: 's',
  callStartMicros: 1787171665880654,
  callAnswerMicros: 1787171666607564,
  callEndMicros: 1787171699845567,
  aiStartMicros: 1787171667036808,
  aiEndMicros: 1787171699843237,
  callerNumber: '+15559876543',
  summary: 'Caller wants an estimate for kitchen sink repair.',
  callLog: [
    { role: 'user', content: 'My kitchen sink is leaking.', timestamp: 1787171680000000 },
    { role: 'assistant', content: 'I can have our technician take a look.', timestamp: null },
  ],
};

describe('voice settlement outcome inference', () => {
  it('identifies ai_handled when both user and assistant participate in dialogue', () => {
    const outcome = inferProviderOutcome(baseReceipt);
    expect(outcome).toBe('ai_handled');
  });

  it('identifies transfer_attempted when transfer intent or SWAIG transfer phrasing is present', () => {
    const transferReceipt: VoiceReceipt = {
      ...baseReceipt,
      callLog: [
        { role: 'user', content: 'Can I speak to a real person?', timestamp: null },
        { role: 'assistant', content: 'Connecting you now to the business owner.', timestamp: null },
      ],
    };
    const outcome = inferProviderOutcome(transferReceipt);
    expect(outcome).toBe('transfer_attempted');
  });

  it('identifies no_input when assistant spoke but user never provided turns', () => {
    const noInputReceipt: VoiceReceipt = {
      ...baseReceipt,
      callLog: [
        { role: 'assistant', content: 'Hello? How can I help you today?', timestamp: null },
      ],
    };
    const outcome = inferProviderOutcome(noInputReceipt);
    expect(outcome).toBe('no_input');
  });

  it('identifies caller_abandoned when call was extremely short and caller hung up', () => {
    const abandonedReceipt: VoiceReceipt = {
      ...baseReceipt,
      aiStartMicros: 1000000,
      aiEndMicros: 3000000, // 2 seconds
      callLog: [
        { role: 'user', content: 'Hi', timestamp: null },
      ],
    };
    const outcome = inferProviderOutcome(abandonedReceipt);
    expect(outcome).toBe('caller_abandoned');
  });
});

describe('provisional voice call creation on admission', () => {
  it('inserts provisional row and initializes unreviewed workflow state', async () => {
    const upserts: Record<string, unknown>[] = [];
    const mockAdmin = {
      from(table: string) {
        return {
          upsert(row: Record<string, unknown>) {
            upserts.push({ table, ...row });
            return {
              select() {
                return Promise.resolve({ data: [{ id: 'voice-call-123' }], error: null });
              },
            };
          },
        };
      },
    } as never;

    const callId = await recordProvisionalVoiceCall(mockAdmin, {
      accountId: ACCOUNT,
      provider: 'signalwire',
      providerCallId: CALL,
      callerNumber: '+15559876543',
      startedAt: '2026-08-25T14:00:00.000Z',
    });

    expect(callId).toBe('voice-call-123');
    const voiceCallUpsert = upserts.find((u) => u.table === 'voice_calls');
    expect(voiceCallUpsert).toMatchObject({
      account_id: ACCOUNT,
      provider: 'signalwire',
      provider_call_id: CALL,
      caller_number: '+15559876543',
      outcome: 'in_progress',
      outcome_source: 'provisional_admission',
      is_provisional: true,
      settlement: 'unsettled',
    });

    const workflowUpsert = upserts.find((u) => u.table === 'voice_call_workflows');
    expect(workflowUpsert).toMatchObject({
      call_id: 'voice-call-123',
      account_id: ACCOUNT,
      disposition: 'unreviewed',
      urgency: 'normal',
    });
  });
});

describe('settling voice receipt updates outcome and workflow urgency', () => {
  it('updates outcome to ai_handled, clears is_provisional, and flags emergency urgency', async () => {
    const upserts: Record<string, unknown>[] = [];
    const mockAdmin = {
      from(table: string) {
        const chain: Record<string, unknown> = {};
        for (const method of ['select', 'eq', 'update']) chain[method] = () => chain;
        chain.maybeSingle = () => {
          if (table === 'voice_call_admissions') {
            return Promise.resolve({ data: { account_id: ACCOUNT, reservation_id: 'res-1', reserved_minutes: 60 }, error: null });
          }
          if (table === 'voice_calls') {
            return Promise.resolve({ data: { id: 'call-row-1' }, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        };
        chain.upsert = (row: Record<string, unknown>) => {
          upserts.push({ table, ...row });
          return Promise.resolve({ error: null });
        };
        return chain;
      },
    } as never;

    const emergencyReceipt: VoiceReceipt = {
      ...baseReceipt,
      summary: 'Emergency! Gas leak detected in basement, furnace smells of burning gas.',
    };

    const settlement = await settleVoiceReceipt(mockAdmin, emergencyReceipt);
    expect(settlement.billed).toBe(true);

    const voiceCallRow = upserts.find((u) => u.table === 'voice_calls');
    expect(voiceCallRow).toMatchObject({
      outcome: 'ai_handled',
      outcome_source: 'swml_post_prompt',
      is_provisional: false,
    });

    const workflowRow = upserts.find((u) => u.table === 'voice_call_workflows');
    expect(workflowRow).toMatchObject({
      call_id: 'call-row-1',
      account_id: ACCOUNT,
      disposition: 'unreviewed',
      urgency: 'emergency',
    });
  });
});
