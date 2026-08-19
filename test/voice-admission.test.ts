import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AI_VOICE_FLAG,
  aiVoiceEnabled,
  countOpenAiCalls,
  planInboundCall,
} from '@/lib/voice/admission';

const admitVoiceCall = vi.fn();
vi.mock('@/lib/billing/voice-minute-usage', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  admitVoiceCall: (...a: unknown[]) => admitVoiceCall(...a),
  voiceMinuteMode: () => 'enforce',
}));

const ACCOUNT = '11111111-1111-4111-8111-111111111111';
const CALL = 'a15ce0a0-ac77-44a8-bd9e-5d9e506775ba';
const TO = '+15551230000';

/**
 * A Supabase stub driven by a per-table script. Real enough to exercise the
 * order of the checks, which is the thing under test.
 */
type TableReply = { data?: unknown; error?: unknown };
let replies: Record<string, TableReply>;

const admin = {
  from(table: string) {
    const reply = replies[table] ?? { data: null, error: null };
    const chain: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'gte', 'in']) {
      chain[method] = () => chain;
    }
    chain.maybeSingle = () => Promise.resolve(reply);
    // A list read is awaited directly rather than through maybeSingle.
    (chain as { then: unknown }).then = (resolve: (v: TableReply) => unknown) => resolve(reply);
    return chain;
  },
} as never;

const call = { providerCallId: CALL, toNumber: TO, fromNumber: '+15559876543' };
const options = {
  receiptUrl: (id: string) => `https://lgq.test/api/voice/receipt?account=${id}`,
  forwardActionUrl: (id: string) => `https://lgq.test/api/voice/ai/status?account=${id}`,
  enabled: true,
};

const workspace = (limits: Record<string, unknown>, forward: string | null = '+15557654321') => {
  replies = {
    accounts: { data: { id: ACCOUNT, call_forward_number: forward }, error: null },
    workspace_entitlements: { data: { feature_limits: limits }, error: null },
    voice_call_admissions: { data: [], error: null },
    voice_events: { data: [], error: null },
  };
};

beforeEach(() => {
  admitVoiceCall.mockReset();
  admitVoiceCall.mockResolvedValue({ outcome: 'admitted', lease: {} });
  vi.spyOn(console, 'error').mockImplementation(() => {});
  workspace({ voice_concurrent_calls: 1 });
});

describe('the product flag is not a metering flag', () => {
  it('is off unless set to exactly 1', () => {
    for (const value of [undefined, '', '0', 'true', ' 1']) {
      expect(aiVoiceEnabled({ [AI_VOICE_FLAG]: value })).toBe(false);
    }
    expect(aiVoiceEnabled({ [AI_VOICE_FLAG]: '1' })).toBe(true);
  });
});

describe('what a caller gets', () => {
  it('reaches the AI when everything is in place', async () => {
    const result = await planInboundCall(admin, call, options);
    expect(result.plan.kind).toBe('ai_agent');
    expect(result.declineReason).toBeNull();
    if (result.plan.kind !== 'ai_agent') return;
    expect(result.plan.receiptUrl).toContain(ACCOUNT);
    // The disclosure is not optional and not a setting.
    expect(result.plan.greeting).toContain('AI assistant');
  });

  it('falls through to the contractor\'s own line, never to an error', async () => {
    // Every decline below is a caller who still reaches the business. The
    // published behaviour at a limit is forwarding or voicemail, not an apology.
    const cases: Array<[string, () => void, string]> = [
      ['product_off', () => {}, 'product_off'],
      ['no seat on the plan', () => workspace({ voice_concurrent_calls: 0 }), 'no_seat'],
      ['no entitlement row at all', () => {
        workspace({ voice_concurrent_calls: 1 });
        replies.workspace_entitlements = { data: null, error: null };
      }, 'no_seat'],
    ];

    for (const [name, arrange, reason] of cases) {
      workspace({ voice_concurrent_calls: 1 });
      arrange();
      const result = await planInboundCall(admin, call, {
        ...options, enabled: reason === 'product_off' ? false : true,
      });
      expect(result.plan.kind, name).toBe('forward');
      expect(result.declineReason, name).toBe(reason);
      if (result.plan.kind !== 'forward') continue;
      expect(result.plan.number, name).toBe('+15557654321');
      // The contractor sees their own number, not the caller's.
      expect(result.plan.callerId, name).toBe(TO);
    }
  });

  it('says it is unavailable only when there is nowhere to send them', async () => {
    workspace({ voice_concurrent_calls: 1 }, null);
    const result = await planInboundCall(admin, call, { ...options, enabled: false });
    expect(result.plan.kind).toBe('unavailable');
  });

  it('does not recognise a number belonging to no workspace', async () => {
    replies = { accounts: { data: null, error: null } };
    const result = await planInboundCall(admin, call, options);
    expect(result).toMatchObject({ declineReason: 'no_workspace', accountId: null });
    expect(result.plan.kind).toBe('unavailable');
  });

  it('never reaches the ledger for a call it was never going to admit', async () => {
    // The order of the checks is the design: a workspace with no seat must not
    // cost a reservation to refuse.
    workspace({ voice_concurrent_calls: 0 });
    await planInboundCall(admin, call, options);
    expect(admitVoiceCall).not.toHaveBeenCalled();
  });

  it('forwards when the allowance is gone, which is the published behaviour', async () => {
    admitVoiceCall.mockResolvedValue({ outcome: 'refused' });
    const result = await planInboundCall(admin, call, options);
    expect(result).toMatchObject({ declineReason: 'no_allowance' });
    expect(result.plan.kind).toBe('forward');
  });

  it('still answers when the call was admitted unmetered', async () => {
    // Failing open is the meter's decision; the route must honour it rather
    // than treating "unmetered" as "refused".
    admitVoiceCall.mockResolvedValue({ outcome: 'admitted_unmetered', reason: 'ledger_unavailable' });
    expect((await planInboundCall(admin, call, options)).plan.kind).toBe('ai_agent');
  });

  it('answers on an authorized overage too', async () => {
    admitVoiceCall.mockResolvedValue({ outcome: 'admitted_overage', overage: {} });
    expect((await planInboundCall(admin, call, options)).plan.kind).toBe('ai_agent');
  });
});

describe('concurrency, without a call-started event to count from', () => {
  it('counts an admission with no receipt as a live call', async () => {
    replies.voice_call_admissions = { data: [{ provider_call_id: 'live-1' }], error: null };
    replies.voice_events = { data: [], error: null };
    expect(await countOpenAiCalls(admin, ACCOUNT, 3)).toBe(1);
  });

  it('stops counting one whose receipt has arrived', async () => {
    replies.voice_call_admissions = {
      data: [{ provider_call_id: 'done-1' }, { provider_call_id: 'live-1' }], error: null,
    };
    replies.voice_events = { data: [{ provider_call_id: 'done-1' }], error: null };
    expect(await countOpenAiCalls(admin, ACCOUNT, 3)).toBe(1);
  });

  it('refuses the call rather than guessing when the count cannot be read', async () => {
    // Returning the limit sheds AI calls to voicemail. Returning zero would
    // admit an unbounded number that LGQ pays for and cannot bill.
    replies.voice_call_admissions = { data: null, error: { message: 'down' } };
    expect(await countOpenAiCalls(admin, ACCOUNT, 3)).toBe(3);

    replies.voice_call_admissions = { data: [{ provider_call_id: 'x' }], error: null };
    replies.voice_events = { data: null, error: { message: 'down' } };
    expect(await countOpenAiCalls(admin, ACCOUNT, 3)).toBe(3);
  });

  it('forwards a caller who arrives at the limit', async () => {
    workspace({ voice_concurrent_calls: 1 });
    replies.voice_call_admissions = { data: [{ provider_call_id: 'live-1' }], error: null };
    const result = await planInboundCall(admin, call, options);
    expect(result).toMatchObject({ declineReason: 'at_capacity' });
    expect(result.plan.kind).toBe('forward');
    expect(admitVoiceCall).not.toHaveBeenCalled();
  });

  it('lets Scale run three at once where Flex runs one', async () => {
    const twoLive = { data: [{ provider_call_id: 'a' }, { provider_call_id: 'b' }], error: null };

    workspace({ voice_concurrent_calls: 1 });
    replies.voice_call_admissions = twoLive;
    expect((await planInboundCall(admin, call, options)).plan.kind).toBe('forward');

    // Same two calls in flight, different plan, different answer.
    workspace({ voice_concurrent_calls: 3 });
    replies.voice_call_admissions = twoLive;
    expect((await planInboundCall(admin, call, options)).plan.kind).toBe('ai_agent');
  });
});
