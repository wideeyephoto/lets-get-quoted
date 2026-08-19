import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  describeSettlement,
  formatCallLength,
  loadVoiceCallHistory,
} from '@/lib/voice/call-history';

const ACCOUNT = '11111111-1111-4111-8111-111111111111';

let reply: { data?: unknown; error?: unknown };
const supabase = {
  from() {
    const chain: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'order']) chain[method] = () => chain;
    chain.limit = () => Promise.resolve(reply);
    return chain;
  },
} as never;

const call = (over: Record<string, unknown> = {}) => ({
  id: 'c1', provider_call_id: 'pc1', caller_number: '+15559876543',
  started_at: '2026-08-19T12:00:00Z', ai_seconds: 33, billed_minutes: 1,
  settlement: 'allowance', outcome: 'completed', summary: 'Leaking tap.', lead_id: 'lead-1',
  ...over,
});

beforeEach(() => {
  reply = { data: [call()], error: null };
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('the read is scoped by RLS as well as by the query', () => {
  it('never reaches for the service-role client', () => {
    // voice_calls holds transcripts of other people's phone calls. Passing the
    // admin client would remove RLS and leave the caller's own `.eq` as the only
    // thing keeping one workspace out of another's history.
    const source = readFileSync(join(process.cwd(), 'src', 'lib', 'voice', 'call-history.ts'), 'utf8');
    expect(source).not.toContain('createAdminClient');
  });
});

describe('the totals a contractor is shown', () => {
  it('counts minutes that were actually charged', async () => {
    reply = { data: [call(), call({ id: 'c2', billed_minutes: 3 })], error: null };
    expect((await loadVoiceCallHistory(supabase, ACCOUNT)).billedMinutes).toBe(4);
  });

  it('leaves unmetered calls out of the billed total, and counts them separately', async () => {
    // A call answered while the ledger was unreachable is not free and was not
    // billed. Adding it to the total would show minutes that reconcile against
    // nothing on the invoice.
    reply = {
      data: [call(), call({ id: 'c2', settlement: 'unmetered', billed_minutes: null })],
      error: null,
    };
    const history = await loadVoiceCallHistory(supabase, ACCOUNT);
    expect(history.billedMinutes).toBe(1);
    expect(history.unmeteredCalls).toBe(1);
  });

  it('counts overage minutes, which were charged', async () => {
    reply = { data: [call({ settlement: 'overage', billed_minutes: 2 })], error: null };
    expect((await loadVoiceCallHistory(supabase, ACCOUNT)).billedMinutes).toBe(2);
  });

  it('excludes a call still waiting to settle', async () => {
    reply = { data: [call({ settlement: 'unsettled', billed_minutes: null })], error: null };
    expect((await loadVoiceCallHistory(supabase, ACCOUNT)).billedMinutes).toBe(0);
  });

  it('renders an empty history rather than throwing when the read fails', async () => {
    // A dashboard page that throws because one panel could not load is worse
    // than a panel saying it has nothing.
    reply = { data: null, error: { message: 'down' } };
    const history = await loadVoiceCallHistory(supabase, ACCOUNT);
    expect(history).toMatchObject({ calls: [], billedMinutes: 0, unmeteredCalls: 0 });
  });
});

describe('how a call reads on the screen', () => {
  it('shows a length in minutes and seconds', () => {
    expect(formatCallLength(33)).toBe('0:33');
    expect(formatCallLength(65)).toBe('1:05');
    expect(formatCallLength(600)).toBe('10:00');
    expect(formatCallLength(0)).toBe('0:00');
  });

  it('shows a dash rather than a number it does not have', () => {
    for (const value of [null, Number.NaN, -1, Number.POSITIVE_INFINITY]) {
      expect(formatCallLength(value), String(value)).toBe('—');
    }
  });

  it('says plainly when a call was answered but not billed', () => {
    // Dressing this up as free, or as billed, makes the totals on this screen
    // impossible to reconcile against an invoice.
    expect(describeSettlement('unmetered', null)).toBe('Answered — not billed');
    expect(describeSettlement('unbillable', null)).toBe('Needs review');
    expect(describeSettlement('unsettled', null)).toBe('Not settled yet');
  });

  it('distinguishes plan minutes from overage minutes', () => {
    // The contractor pays for one of these and not the other, so they must not
    // read the same on the screen that explains their bill.
    expect(describeSettlement('allowance', 1)).toBe('1 min from your plan');
    expect(describeSettlement('overage', 2)).toBe('2 min at your overage rate');
    expect(describeSettlement('allowance', 1)).not.toBe(describeSettlement('overage', 1));
  });
});
