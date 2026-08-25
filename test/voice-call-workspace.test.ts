import { describe, expect, it } from 'vitest';
import {
  formatDispositionLabel,
  formatOutcomeLabel,
  loadVoiceWorkspaceQueue,
} from '@/lib/voice/call-workspace';

const ACCOUNT = '11111111-1111-4111-8111-111111111111';

describe('voice workspace queue formatting and labels', () => {
  it('formats technical provider outcomes to readable labels', () => {
    expect(formatOutcomeLabel('ai_handled')).toBe('AI Handled');
    expect(formatOutcomeLabel('transfer_attempted')).toBe('Transfer Attempted');
    expect(formatOutcomeLabel('caller_abandoned')).toBe('Caller Abandoned');
    expect(formatOutcomeLabel('no_input')).toBe('No Input');
    expect(formatOutcomeLabel('in_progress')).toBe('In Progress');
  });

  it('formats business staff dispositions to readable labels', () => {
    expect(formatDispositionLabel('unreviewed')).toBe('Unreviewed');
    expect(formatDispositionLabel('needs_callback')).toBe('Needs Callback');
    expect(formatDispositionLabel('callback_scheduled')).toBe('Callback Scheduled');
    expect(formatDispositionLabel('contacted')).toBe('Contacted');
    expect(formatDispositionLabel('resolved')).toBe('Resolved');
  });
});

describe('voice workspace queue loader', () => {
  const sampleCalls = [
    {
      id: 'call-1',
      provider_call_id: 'p-1',
      caller_number: '+12485550101',
      startedAt: new Date().toISOString(),
      started_at: new Date().toISOString(),
      ai_seconds: 45,
      billed_minutes: 1,
      settlement: 'allowance',
      outcome: 'ai_handled',
      summary: 'Emergency pipe burst in kitchen.',
      lead_id: 'lead-1',
      recording_status: 'ready',
    },
    {
      id: 'call-2',
      provider_call_id: 'p-2',
      caller_number: '+12485550102',
      startedAt: new Date().toISOString(),
      started_at: new Date().toISOString(),
      ai_seconds: 120,
      billed_minutes: 2,
      settlement: 'allowance',
      outcome: 'transfer_attempted',
      summary: 'Caller wants to speak directly to dispatcher.',
      lead_id: null,
      recording_status: 'none',
    },
    {
      id: 'call-3',
      provider_call_id: 'p-3',
      caller_number: '+12485550103',
      startedAt: '2026-08-20T10:00:00Z',
      started_at: '2026-08-20T10:00:00Z',
      ai_seconds: 30,
      billed_minutes: 1,
      settlement: 'allowance',
      outcome: 'ai_handled',
      summary: 'Question about roofing estimate.',
      lead_id: null,
      recording_status: 'none',
    },
  ];

  const sampleWorkflows = [
    {
      call_id: 'call-1',
      disposition: 'unreviewed',
      urgency: 'emergency',
    },
    {
      call_id: 'call-2',
      disposition: 'needs_callback',
      urgency: 'normal',
    },
    {
      call_id: 'call-3',
      disposition: 'contacted',
      urgency: 'normal',
    },
  ];

  const mockSupabase = {
    from(table: string) {
      const chain: Record<string, unknown> = {};
      for (const method of ['select', 'eq', 'gte', 'order', 'limit', 'in']) {
        chain[method] = () => chain;
      }
      (chain as { then: unknown }).then = (resolve: (v: unknown) => unknown) => {
        if (table === 'voice_calls') return resolve({ data: sampleCalls, error: null });
        if (table === 'voice_call_workflows') return resolve({ data: sampleWorkflows, error: null });
        return resolve({ data: [], error: null });
      };
      return chain;
    },
  } as never;

  it('loads calls and correctly correlates workflow state and counters', async () => {
    const res = await loadVoiceWorkspaceQueue(mockSupabase, ACCOUNT);
    expect(res.available).toBe(true);
    expect(res.items).toHaveLength(3);

    // Verify item 1
    const item1 = res.items.find((i) => i.id === 'call-1')!;
    expect(item1.workflow.disposition).toBe('unreviewed');
    expect(item1.workflow.urgency).toBe('emergency');
    expect(item1.outcome).toBe('ai_handled');

    // Verify counters
    expect(res.counters.totalCount).toBe(3);
    expect(res.counters.unreviewed).toBe(1);
    expect(res.counters.needsCallback).toBe(1);
    expect(res.counters.urgent).toBe(1);
    expect(res.counters.transferred).toBe(1);
    expect(res.counters.completedToday).toBe(2);
  });

  it('filters items by tab (needs_callback, urgent, transferred)', async () => {
    const urgentRes = await loadVoiceWorkspaceQueue(mockSupabase, ACCOUNT, { tab: 'urgent' });
    expect(urgentRes.items).toHaveLength(1);
    expect(urgentRes.items[0]!.id).toBe('call-1');

    const callbackRes = await loadVoiceWorkspaceQueue(mockSupabase, ACCOUNT, { tab: 'needs_callback' });
    expect(callbackRes.items).toHaveLength(1);
    expect(callbackRes.items[0]!.id).toBe('call-2');

    const transferRes = await loadVoiceWorkspaceQueue(mockSupabase, ACCOUNT, { tab: 'transferred' });
    expect(transferRes.items).toHaveLength(1);
    expect(transferRes.items[0]!.id).toBe('call-2');
  });

  it('filters items by query keyword', async () => {
    const res = await loadVoiceWorkspaceQueue(mockSupabase, ACCOUNT, { query: 'roofing' });
    expect(res.items).toHaveLength(1);
    expect(res.items[0]!.id).toBe('call-3');

    const phoneRes = await loadVoiceWorkspaceQueue(mockSupabase, ACCOUNT, { query: '5550101' });
    expect(phoneRes.items).toHaveLength(1);
    expect(phoneRes.items[0]!.id).toBe('call-1');
  });
});
