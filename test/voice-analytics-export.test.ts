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
          billed_minutes: 1,
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
          billed_minutes: 2,
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
          billed_minutes: 1,
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
    expect(result.counters.totalAiMinutes).toBe(4); // (60 + 120 + 30) = 210s -> ceil(210/60) = 4 min
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
});
