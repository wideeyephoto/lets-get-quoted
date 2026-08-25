import { describe, expect, it } from 'vitest';
import { loadVoiceCallDetail } from '@/lib/voice/call-workspace';

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const CALL_ID = '22222222-2222-4222-8222-222222222222';
const CLIENT_ID = '33333333-3333-4333-8333-333333333333';
const CALLER_PHONE = '+12485550199';

describe('AI Voice Tier 2 CRM & Contact Intelligence', () => {
  it('resolves matched client profile, address, and job count for known callers', async () => {
    const memoryDb: Record<string, any[]> = {
      voice_calls: [
        {
          id: CALL_ID,
          account_id: ACCOUNT_ID,
          provider: 'signalwire',
          provider_call_id: 'call-now',
          caller_number: CALLER_PHONE,
          started_at: '2026-08-25T12:00:00Z',
          ai_seconds: 45,
          billed_minutes: 1,
          settlement: 'allowance',
          outcome: 'completed',
          summary: 'Caller asking to schedule annual HVAC checkup',
          transcript: [
            { role: 'user', content: 'Hi, I need to book my yearly furnace service.' },
            { role: 'assistant', content: 'Sure, let me check our technician availability.' },
          ],
        },
        {
          id: 'prev-call-1',
          account_id: ACCOUNT_ID,
          provider: 'signalwire',
          provider_call_id: 'call-prev-1',
          caller_number: CALLER_PHONE,
          started_at: '2026-08-20T10:00:00Z',
          ai_seconds: 120,
          outcome: 'completed',
          summary: 'Previous emergency pipe repair request',
        },
      ],
      clients: [
        {
          id: CLIENT_ID,
          account_id: ACCOUNT_ID,
          name: 'Sarah Connor',
          phone: CALLER_PHONE,
          email: 'sarah@example.com',
          address: '42 Cyberdyne Way, Los Angeles, CA',
          notes: 'VIP customer, preferred afternoon appointments',
        },
      ],
      jobs: [
        { id: 'job-1', account_id: ACCOUNT_ID, client_id: CLIENT_ID },
        { id: 'job-2', account_id: ACCOUNT_ID, client_id: CLIENT_ID },
        { id: 'job-3', account_id: ACCOUNT_ID, client_id: CLIENT_ID },
      ],
      leads: [],
      voice_call_workflows: [],
      voice_call_notes: [],
    };

    const mockSupabase = {
      from: (table: string) => {
        const rows = memoryDb[table] || [];
        const chain: Record<string, any> = {};

        chain.select = (columns?: string, options?: any) => {
          if (options?.head && options?.count === 'exact') {
            chain._isHeadCount = true;
          }
          return chain;
        };

        chain.eq = (column: string, value: any) => {
          chain._filters = chain._filters || {};
          chain._filters[column] = value;
          return chain;
        };

        chain.neq = (column: string, value: any) => {
          chain._neq = chain._neq || {};
          chain._neq[column] = value;
          return chain;
        };

        chain.order = () => chain;
        chain.limit = () => chain;

        chain.maybeSingle = async () => {
          let matched = rows.filter((r) => {
            if (chain._filters) {
              for (const [k, v] of Object.entries(chain._filters)) {
                if (r[k] !== v) return false;
              }
            }
            if (chain._neq) {
              for (const [k, v] of Object.entries(chain._neq)) {
                if (r[k] === v) return false;
              }
            }
            return true;
          });
          return { data: matched[0] || null, error: null };
        };

        chain.then = (resolve: any) => {
          let matched = rows.filter((r) => {
            if (chain._filters) {
              for (const [k, v] of Object.entries(chain._filters)) {
                if (r[k] !== v) return false;
              }
            }
            if (chain._neq) {
              for (const [k, v] of Object.entries(chain._neq)) {
                if (r[k] === v) return false;
              }
            }
            return true;
          });

          if (chain._isHeadCount) {
            return resolve({ data: null, count: matched.length, error: null });
          }

          return resolve({ data: matched, count: matched.length, error: null });
        };

        return chain;
      },
    } as never;

    const detail = await loadVoiceCallDetail(mockSupabase, ACCOUNT_ID, CALL_ID);

    expect(detail).not.toBeNull();
    expect(detail?.callerNumber).toBe(CALLER_PHONE);

    // Verify Matched Client
    expect(detail?.contact.client).not.toBeNull();
    expect(detail?.contact.client?.id).toBe(CLIENT_ID);
    expect(detail?.contact.client?.name).toBe('Sarah Connor');
    expect(detail?.contact.client?.email).toBe('sarah@example.com');
    expect(detail?.contact.client?.address).toBe('42 Cyberdyne Way, Los Angeles, CA');
    expect(detail?.contact.client?.totalJobsCount).toBe(3);

    // Verify Prior Calls (excluding the current call)
    expect(detail?.contact.priorCalls).toHaveLength(1);
    expect(detail?.contact.priorCalls[0]?.id).toBe('prev-call-1');
    expect(detail?.contact.priorCalls[0]?.summary).toBe('Previous emergency pipe repair request');
    expect(detail?.contact.totalPriorCallsCount).toBe(1);
  });

  it('returns clean empty contact intelligence when caller is unrecognized', async () => {
    const memoryDb: Record<string, any[]> = {
      voice_calls: [
        {
          id: CALL_ID,
          account_id: ACCOUNT_ID,
          provider: 'signalwire',
          provider_call_id: 'call-unknown',
          caller_number: '+12485559999',
          started_at: '2026-08-25T12:00:00Z',
          ai_seconds: 30,
          outcome: 'completed',
          summary: 'Inquiry from a new prospective client',
          transcript: [],
        },
      ],
      clients: [],
      jobs: [],
      leads: [],
      voice_call_workflows: [],
      voice_call_notes: [],
    };

    const mockSupabase = {
      from: (table: string) => {
        const rows = memoryDb[table] || [];
        const chain: Record<string, any> = {};
        chain.select = () => chain;
        chain.eq = (column: string, value: any) => {
          chain._filters = chain._filters || {};
          chain._filters[column] = value;
          return chain;
        };
        chain.neq = () => chain;
        chain.order = () => chain;
        chain.limit = () => chain;
        chain.maybeSingle = async () => {
          const matched = rows.filter((r) => {
            if (chain._filters) {
              for (const [k, v] of Object.entries(chain._filters)) {
                if (r[k] !== v) return false;
              }
            }
            return true;
          });
          return { data: matched[0] || null, error: null };
        };
        chain.then = (resolve: any) => resolve({ data: [], count: 0, error: null });
        return chain;
      },
    } as never;

    const detail = await loadVoiceCallDetail(mockSupabase, ACCOUNT_ID, CALL_ID);

    expect(detail).not.toBeNull();
    expect(detail?.contact.client).toBeNull();
    expect(detail?.contact.lead).toBeNull();
    expect(detail?.contact.priorCalls).toHaveLength(0);
    expect(detail?.contact.totalPriorCallsCount).toBe(0);
  });
});
