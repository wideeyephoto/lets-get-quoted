import { describe, expect, it } from 'vitest';
import {
  loadVoiceCallDetail,
  sanitizeTranscriptTurns,
} from '@/lib/voice/call-workspace';

const ACCOUNT_A = '11111111-1111-4111-8111-111111111111';
const ACCOUNT_B = '22222222-2222-4222-8222-222222222222';
const CALL_ID = 'call-001';

describe('transcript sanitization', () => {
  it('filters out system prompts, SWAIG tool schemas, and preserves only human dialogue', () => {
    const rawProviderLog = [
      { role: 'system', content: 'You are an AI receptionist for Apex Plumbing. Grounding: Michigan.' },
      { role: 'user', content: 'Hi, my basement water heater is leaking.' },
      { role: 'assistant', content: 'I am sorry to hear that. I can have our plumber contact you immediately.' },
      { role: 'tool', content: 'SWAIG function transfer_to_business invoked {"function": "transfer_to_business"}' },
      { role: 'assistant', content: 'Connecting you now.' },
    ];

    const sanitized = sanitizeTranscriptTurns(rawProviderLog);

    expect(sanitized).toHaveLength(3);
    expect(sanitized[0]).toEqual({
      role: 'caller',
      content: 'Hi, my basement water heater is leaking.',
      timestamp: null,
    });
    expect(sanitized[1]).toEqual({
      role: 'assistant',
      content: 'I am sorry to hear that. I can have our plumber contact you immediately.',
      timestamp: null,
    });
    expect(sanitized[2]).toEqual({
      role: 'assistant',
      content: 'Connecting you now.',
      timestamp: null,
    });
  });

  it('handles empty or malformed transcript arrays gracefully', () => {
    expect(sanitizeTranscriptTurns(null)).toEqual([]);
    expect(sanitizeTranscriptTurns(undefined)).toEqual([]);
    expect(sanitizeTranscriptTurns([null, {}, { role: 'system' }])).toEqual([]);
  });
});

describe('call detail loader with multi-tenant isolation', () => {
  const sampleCallRow = {
    id: CALL_ID,
    account_id: ACCOUNT_A,
    provider_call_id: 'p-call-1',
    caller_number: '+12485550100',
    started_at: '2026-08-25T13:00:00Z',
    ai_seconds: 40,
    billed_minutes: 1,
    settlement: 'allowance',
    outcome: 'ai_handled',
    summary: 'Water heater emergency repair requested.',
    lead_id: 'lead-1',
    recording_status: 'ready',
    transcript: [
      { role: 'user', content: 'Water heater is leaking.' },
      { role: 'assistant', content: 'Got it, we will help.' },
    ],
  };

  const sampleWorkflowRow = {
    call_id: CALL_ID,
    account_id: ACCOUNT_A,
    disposition: 'needs_callback',
    urgency: 'urgent',
  };

  const sampleNotes = [
    {
      id: 'note-1',
      call_id: CALL_ID,
      author_name: 'Sarah (Dispatcher)',
      note: 'Assigned to Mike for 3 PM service call.',
      created_at: '2026-08-25T13:05:00Z',
    },
  ];

  const mockSupabase = {
    from(table: string) {
      const chain: Record<string, unknown> = {};
      for (const method of ['select', 'eq', 'neq', 'order', 'limit']) {
        chain[method] = () => chain;
      }
      chain.maybeSingle = (async () => {
        if (table === 'voice_calls') return { data: sampleCallRow, error: null };
        if (table === 'voice_call_workflows') return { data: sampleWorkflowRow, error: null };
        return { data: null, error: null };
      });
      (chain as { then: unknown }).then = (resolve: (v: unknown) => unknown) => {
        if (table === 'voice_call_notes') return resolve({ data: sampleNotes, error: null });
        return resolve({ data: [], error: null });
      };
      return chain;
    },
  } as never;

  it('loads single call detail with sanitized transcript, workflow, and notes', async () => {
    const detail = await loadVoiceCallDetail(mockSupabase, ACCOUNT_A, CALL_ID);
    expect(detail).not.toBeNull();
    expect(detail!.id).toBe(CALL_ID);
    expect(detail!.callerNumber).toBe('+12485550100');
    expect(detail!.workflow.disposition).toBe('needs_callback');
    expect(detail!.workflow.urgency).toBe('urgent');
    expect(detail!.transcript).toHaveLength(2);
    expect(detail!.notes).toHaveLength(1);
    expect(detail!.notes[0]!.authorName).toBe('Sarah (Dispatcher)');
  });

  it('returns null when querying for non-existent call', async () => {
    const notFoundSupabase = {
      from() {
        const chain: Record<string, unknown> = {};
        for (const method of ['select', 'eq']) chain[method] = () => chain;
        chain.maybeSingle = async () => ({ data: null, error: null });
        return chain;
      },
    } as never;

    const detail = await loadVoiceCallDetail(notFoundSupabase, ACCOUNT_A, 'non-existent');
    expect(detail).toBeNull();
  });
});
