import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  loadVoiceRouteReadiness,
  matchesCurrentVoiceRouteEvidence,
  recordVoiceRouteVerification,
} from '@/lib/voice/route-readiness';

type Reply = { data?: unknown; error?: unknown };
let replies: Record<string, Reply>;
const inserted: unknown[] = [];
const contained: unknown[] = [];

const ACCOUNT = '11111111-1111-4111-8111-111111111111';
const SENDER = '22222222-2222-4222-8222-222222222222';
const PHONE_RESOURCE = '33333333-3333-4333-8333-333333333333';
const NUMBER = '+12485550199';
const ACTIVE_DEDICATED = {
  id: SENDER,
  provider: 'signalwire',
  e164_number: NUMBER,
  provider_number_id: PHONE_RESOURCE,
  purpose: 'contractor_dedicated',
  account_id: ACCOUNT,
  assignment_state: 'assigned',
  provisioning_status: 'active',
  inbound_ready: true,
  activated_at: '2026-08-21T11:00:00Z',
  suspended_at: null,
};

const client = {
  from(table: string) {
    const chain: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'order', 'limit', 'is']) chain[method] = () => chain;
    chain.contains = (_column: string, value: unknown) => {
      contained.push(value);
      return chain;
    };
    chain.maybeSingle = () => Promise.resolve(replies[`${table}:single`] ?? replies[table]);
    chain.insert = (row: unknown) => {
      inserted.push(row);
      return Promise.resolve(replies[`${table}:insert`] ?? { error: null });
    };
    chain.update = () => chain;
    (chain as { then: unknown }).then = (resolve: (reply: Reply) => unknown) =>
      resolve(replies[`${table}:update`] ?? replies[table] ?? { error: null });
    return chain;
  },
} as never;

beforeEach(() => {
  inserted.length = 0;
  contained.length = 0;
  replies = {
    'accounts:single': {
      data: { id: ACCOUNT, call_tracking_number: NUMBER, ai_voice_route_revision: 2 },
      error: null,
    },
    'sms_sender_numbers:single': { data: ACTIVE_DEDICATED, error: null },
    'account_events:single': { data: { created_at: '2026-08-21T12:00:00Z' }, error: null },
    'account_events:insert': { error: null },
    'accounts:update': { error: null },
  };
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('AI Voice route readiness evidence', () => {
  it('requires route-specific evidence for the current number', async () => {
    expect(await loadVoiceRouteReadiness(client, ACCOUNT)).toEqual({
      kind: 'ready', number: NUMBER, verifiedAt: '2026-08-21T12:00:00Z',
    });
    expect(contained.at(-1)).toEqual({
      route: 'ai_voice', number: NUMBER, sender_number_id: SENDER, route_revision: 2,
    });

    replies['account_events:single'] = { data: null, error: null };
    expect(await loadVoiceRouteReadiness(client, ACCOUNT)).toEqual({
      kind: 'not_ready', reason: 'unverified', number: NUMBER,
    });
  });

  it('keeps a failed evidence read distinct from an unverified route', async () => {
    replies['account_events:single'] = { data: null, error: { message: 'down' } };
    expect(await loadVoiceRouteReadiness(client, ACCOUNT)).toEqual({ kind: 'unavailable' });
  });

  it('does not accept a generic timestamp when the current number is absent', async () => {
    replies['accounts:single'] = {
      data: {
        id: ACCOUNT,
        call_tracking_number: null,
        ai_voice_route_revision: 3,
        call_tracking_verified_at: '2026-08-21T12:00:00Z',
      },
      error: null,
    };
    expect(await loadVoiceRouteReadiness(client, ACCOUNT)).toEqual({
      kind: 'not_ready', reason: 'missing_number', number: null,
    });
  });

  it('requires active dedicated inventory and keeps a failed inventory read unavailable', async () => {
    replies['sms_sender_numbers:single'] = {
      data: { ...ACTIVE_DEDICATED, purpose: 'lgq_shared', account_id: null },
      error: null,
    };
    expect(await loadVoiceRouteReadiness(client, ACCOUNT)).toEqual({
      kind: 'not_ready', reason: 'dedicated_number_not_ready', number: NUMBER,
    });

    replies['sms_sender_numbers:single'] = { data: null, error: { message: 'down' } };
    expect(await loadVoiceRouteReadiness(client, ACCOUNT)).toEqual({ kind: 'unavailable' });
  });

  it('does not let A to B to A resurrect evidence from an older route revision', () => {
    const current = {
      accountId: ACCOUNT,
      number: NUMBER,
      senderNumberId: SENDER,
      providerNumberId: PHONE_RESOURCE,
      routeRevision: 2,
    };
    expect(matchesCurrentVoiceRouteEvidence({
      route: 'ai_voice', number: NUMBER, sender_number_id: SENDER, route_revision: 0,
    }, current)).toBe(false);
    expect(matchesCurrentVoiceRouteEvidence({
      route: 'ai_voice', number: NUMBER, sender_number_id: SENDER, route_revision: 2,
    }, current)).toBe(true);
  });

  it('records the exact route and number before reporting verification', async () => {
    replies['account_events:single'] = { data: null, error: null };
    await expect(recordVoiceRouteVerification(client, {
      accountId: ACCOUNT, number: '(248) 555-0199', providerCallId: 'call-1',
    })).resolves.toBe(true);
    expect(inserted[0]).toMatchObject({
      account_id: ACCOUNT,
      kind: 'ai_voice_route_verified',
      meta: {
        route: 'ai_voice',
        number: NUMBER,
        sender_number_id: SENDER,
        route_revision: 2,
        provider_call_id: 'call-1',
      },
    });
  });

  it('will not record shared, other-account, inactive, or unprovisioned numbers', async () => {
    for (const sender of [
      { ...ACTIVE_DEDICATED, purpose: 'lgq_shared', account_id: null },
      { ...ACTIVE_DEDICATED, account_id: '44444444-4444-4444-8444-444444444444' },
      { ...ACTIVE_DEDICATED, provisioning_status: 'suspended', suspended_at: '2026-08-21T13:00:00Z' },
      { ...ACTIVE_DEDICATED, provider_number_id: null },
    ]) {
      replies['sms_sender_numbers:single'] = { data: sender, error: null };
      await expect(recordVoiceRouteVerification(client, {
        accountId: ACCOUNT, number: NUMBER, providerCallId: 'call-1',
      })).resolves.toBe(false);
    }
    expect(inserted).toHaveLength(0);
  });

  it('fails closed when the durable evidence cannot be inserted', async () => {
    replies['account_events:single'] = { data: null, error: null };
    replies['account_events:insert'] = { error: { message: 'write failed' } };
    await expect(recordVoiceRouteVerification(client, {
      accountId: ACCOUNT, number: NUMBER, providerCallId: 'call-1',
    })).resolves.toBe(false);
  });
});
