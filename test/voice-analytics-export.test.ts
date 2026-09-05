import { describe, expect, it } from 'vitest';
import { loadVoiceWorkspaceQueue } from '@/lib/voice/call-workspace';

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';

describe('AI Voice Tier 5 Analytics & Date Range Filtering', () => {
  it('computes accurate performance KPIs across call history', async () => {
    const memoryDb: Record<string, any[]> = {
      voice_calls: [
        {
          id: 'call-1',
          account_id: ACCOUNT_ID,
          provider: 'signalwire',
          provider_call_id: 'p-1',
          caller_number: '+12485550101',
          started_at: '2026-08-25T14:30:00Z',
          ai_seconds: 60,
          billed_minutes: 1, settlement: 'allowance',
          outcome: 'completed',
          summary: 'HVAC tuneup inquiry',
          lead_id: 'lead-1',
        },
        {
          id: 'call-2',
          account_id: ACCOUNT_ID,
          provider: 'signalwire',
          provider_call_id: 'p-2',
          caller_number: '+12485550102',
          started_at: '2026-08-25T14:45:00Z',
          ai_seconds: 120,
          billed_minutes: 2, settlement: 'allowance',
          outcome: 'transferred',
          summary: 'Caller requested live dispatcher for emergency gas leak',
          lead_id: null,
        },
        {
          id: 'call-3',
          account_id: ACCOUNT_ID,
          provider: 'signalwire',
          provider_call_id: 'p-3',
          caller_number: '+12485550103',
          started_at: '2026-08-20T09:00:00Z',
          ai_seconds: 30,
          billed_minutes: 1, settlement: 'allowance',
          outcome: 'ai_handled',
          summary: 'Inquired about weekend hours',
          lead_id: null,
        },
      ],
      voice_call_workflows: [
        {
          call_id: 'call-1',
          account_id: ACCOUNT_ID,
          disposition: 'converted',
          urgency: 'normal',
        },
        {
          call_id: 'call-2',
          account_id: ACCOUNT_ID,
          disposition: 'needs_callback',
          urgency: 'emergency',
        },
        {
          call_id: 'call-3',
          account_id: ACCOUNT_ID,
          disposition: 'resolved',
          urgency: 'normal',
        },
      ],
      leads: [],
      clients: [],
      jobs: [],
    };

    const mockSupabase = {
      from: (table: string) => {
        const rows = memoryDb[table] || [];
        const chain: Record<string, any> = {};
        chain.select = () => chain;
        chain.eq = (col: string, val: any) => {
          chain._filters = chain._filters || {};
          chain._filters[col] = val;
          return chain;
        };
        chain.order = () => chain;
        chain.limit = () => chain;
        chain.gte = () => chain;
        chain.in = () => chain;
        chain.then = (resolve: any) => {
          const matched = rows.filter((r) => {
            if (chain._filters) {
              for (const [k, v] of Object.entries(chain._filters)) {
                if (r[k] !== v) return false;
              }
            }
            return true;
          });
          return resolve({ data: matched, count: matched.length, error: null });
        };
        return chain;
      },
    } as never;

    const result = await loadVoiceWorkspaceQueue(mockSupabase, ACCOUNT_ID, {
      tab: 'all',
      dateRange: 'all',
      now: new Date('2026-08-25T15:00:00Z'),
    });

    expect(result.available).toBe(true);
    expect(result.counters.totalCount).toBe(3);
    expect(result.counters.totalAiMinutes).toBe(4); // Settled per-call billing: 1 + 2 + 1 minutes
    expect(result.counters.avgDurationSeconds).toBe(70); // 210 / 3 = 70s
    expect(result.counters.handledCount).toBe(2); // call-1 (completed) + call-3 (ai_handled)
    expect(result.counters.transferred).toBe(1); // call-2 (transferred)
    expect(result.counters.emergencyCount).toBe(1); // call-2 (urgency: emergency)
    expect(result.counters.leadsGeneratedCount).toBe(1); // call-1 (converted & has lead_id)
  });

  it('filters calls by dateRange accurately', async () => {
    const memoryDb: Record<string, any[]> = {
      voice_calls: [
        {
          id: 'call-today',
          account_id: ACCOUNT_ID,
          provider: 'signalwire',
          provider_call_id: 'p-today',
          caller_number: '+12485550101',
          started_at: '2026-08-25T14:30:00Z',
          ai_seconds: 40,
          outcome: 'completed',
          summary: 'Today call',
        },
        {
          id: 'call-yesterday',
          account_id: ACCOUNT_ID,
          provider: 'signalwire',
          provider_call_id: 'p-yesterday',
          caller_number: '+12485550102',
          started_at: '2026-08-24T10:00:00Z',
          ai_seconds: 50,
          outcome: 'completed',
          summary: 'Yesterday call',
        },
        {
          id: 'call-last-month',
          account_id: ACCOUNT_ID,
          provider: 'signalwire',
          provider_call_id: 'p-old',
          caller_number: '+12485550103',
          started_at: '2026-07-01T09:00:00Z',
          ai_seconds: 30,
          outcome: 'completed',
          summary: 'Old call',
        },
      ],
      voice_call_workflows: [],
      leads: [],
      clients: [],
      jobs: [],
    };

    const mockSupabase = {
      from: (table: string) => {
        const rows = memoryDb[table] || [];
        const chain: Record<string, any> = {};
        chain.select = () => chain;
        chain.eq = () => chain;
        chain.order = () => chain;
        chain.limit = () => chain;
        chain.gte = () => chain;
        chain.in = () => chain;
        chain.then = (resolve: any) => resolve({ data: rows, count: rows.length, error: null });
        return chain;
      },
    } as never;

    const todayResult = await loadVoiceWorkspaceQueue(mockSupabase, ACCOUNT_ID, {
      tab: 'all',
      dateRange: 'today',
      now: new Date('2026-08-25T18:00:00Z'),
    });
    expect(todayResult.items).toHaveLength(1);
    expect(todayResult.items[0]?.id).toBe('call-today');

    const sevenDaysResult = await loadVoiceWorkspaceQueue(mockSupabase, ACCOUNT_ID, {
      tab: 'all',
      dateRange: '7d',
      now: new Date('2026-08-25T18:00:00Z'),
    });
    expect(sevenDaysResult.items).toHaveLength(2); // today + yesterday
  });

  it('computes answeredCount accurately and supports custom historyDays', async () => {
    let capturedGteStartedAt: string | null = null;
    const calls = [
      { id: 'c-1', account_id: ACCOUNT_ID, outcome: 'ai_handled', started_at: '2026-08-25T10:00:00Z', ai_seconds: 30, billed_minutes: 1 },
      { id: 'c-2', account_id: ACCOUNT_ID, outcome: 'caller_abandoned', started_at: '2026-08-25T11:00:00Z', ai_seconds: 5, billed_minutes: 0 },
      { id: 'c-3', account_id: ACCOUNT_ID, outcome: 'no_input', started_at: '2026-08-25T12:00:00Z', ai_seconds: 10, billed_minutes: 0 },
      { id: 'c-4', account_id: ACCOUNT_ID, outcome: 'failed', started_at: '2026-08-25T13:00:00Z', ai_seconds: 0, billed_minutes: 0 },
      { id: 'c-5', account_id: ACCOUNT_ID, outcome: 'transferred', started_at: '2026-08-25T14:00:00Z', ai_seconds: 45, billed_minutes: 1 },
    ];

    const mockSupabase = {
      from: (table: string) => {
        const chain: Record<string, any> = {};
        chain.select = () => chain;
        chain.eq = () => chain;
        chain.order = () => chain;
        chain.limit = () => chain;
        chain.gte = (col: string, val: string) => {
          if (col === 'started_at') capturedGteStartedAt = val;
          return chain;
        };
        chain.in = () => chain;
        chain.then = (resolve: any) => resolve({ data: table === 'voice_calls' ? calls : [], error: null });
        return chain;
      },
    } as never;

    const refDate = new Date('2026-08-25T15:00:00Z');
    const result = await loadVoiceWorkspaceQueue(mockSupabase, ACCOUNT_ID, {
      historyDays: 90,
      now: refDate,
    });

    // 90 days retention clock check
    const expectedCutoff = new Date(refDate.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();
    expect(capturedGteStartedAt).toBe(expectedCutoff);

    // Total = 5, answeredCount = 2 (ai_handled + transferred; caller_abandoned, no_input, failed excluded)
    expect(result.counters.totalCount).toBe(5);
    expect(result.counters.answeredCount).toBe(2);
    expect(result.counters.handledCount).toBe(1); // c-1
  });
});
