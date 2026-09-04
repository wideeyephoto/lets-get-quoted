import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { loadVoiceOperatorHealth } from '@/lib/voice/operator-health';

type Reply = { data?: unknown; count?: number | null; error?: unknown };
let replies: Record<string, Reply>;

const VOICE_NUMBER = '11111111-1111-4111-8111-111111111111';
const PHONE_RESOURCE = '22222222-2222-4222-8222-222222222222';
const activeSender = (over: Record<string, unknown> = {}) => ({
  id: VOICE_NUMBER,
  provider: 'signalwire',
  e164_number: '+12485550100',
  provider_number_id: PHONE_RESOURCE,
  purpose: 'ai_voice',
  account_id: 'a1',
  lifecycle_state: 'active',
  voice_capable: true,
  call_handler: 'laml_webhooks',
  call_request_url: 'https://app.letsgetquoted.com/api/voice/ai',
  call_request_method: 'POST',
  call_status_callback_url: 'https://app.letsgetquoted.com/api/voice/provider-status',
  call_status_callback_method: 'POST',
  provider_readiness_state: 'ready',
  provider_verified_at: new Date().toISOString(),
  last_provider_sync_at: new Date().toISOString(),
  activated_at: '2026-08-21T11:00:00Z',
  suspended_at: null,
  released_at: null,
  ...over,
});

const admin = {
  from(table: string) {
    let head = false;
    const chain: Record<string, unknown> = {};
    chain.select = (_columns: string, options?: { head?: boolean }) => {
      head = options?.head === true;
      return chain;
    };
    for (const method of ['eq', 'in', 'not', 'order', 'limit']) chain[method] = () => chain;
    chain.maybeSingle = () => Promise.resolve(replies[`${table}:single`] ?? replies[table]);
    (chain as { then: unknown }).then = (resolve: (reply: Reply) => unknown) =>
      resolve(replies[head ? `${table}:count` : table] ?? { data: [], count: 0, error: null });
    return chain;
  },
} as never;

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://app.letsgetquoted.com');
  vi.stubEnv('NEXT_PUBLIC_ROOT_DOMAIN', 'letsgetquoted.com');
  replies = {
    voice_settings: {
      data: [{ account_id: 'a1' }, { account_id: 'a2' }], error: null,
    },
    accounts: {
      data: [
        { id: 'a1', call_tracking_number: '+12485550100', ai_voice_route_revision: 1 },
        { id: 'a2', call_tracking_number: '+12485550101', ai_voice_route_revision: 0 },
      ],
      error: null,
    },
    voice_number_inventory: { data: [activeSender()], error: null },
    account_events: {
      data: [{
        account_id: 'a1',
        meta: {
          route: 'ai_voice',
          number: '+12485550100',
          voice_number_id: VOICE_NUMBER,
          route_revision: 1,
        },
      }],
      error: null,
    },
    'voice_events:count': { count: 3, error: null },
    'voice_calls:count': { count: 2, error: null },
    'voice_calls:single': { data: { started_at: '2026-08-21T14:00:00Z' }, error: null },
  };
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => vi.unstubAllEnvs());

describe('AI Voice operator health', () => {
  it('shows configured versus actually verified routes and queue review counts', async () => {
    expect(await loadVoiceOperatorHealth(admin)).toEqual({
      activeSettings: 2,
      verifiedActiveRoutes: 1,
      receiptsNeedingProcessing: 3,
      callsNeedingBillingReview: 2,
      latestCallAt: '2026-08-21T14:00:00Z',
      failures: [],
    });
  });

  it('keeps unavailable evidence distinct from a verified zero', async () => {
    replies.voice_settings = { data: null, error: { message: 'settings down' } };
    replies['voice_events:count'] = { count: null, error: { message: 'events down' } };
    replies['voice_calls:count'] = { count: null, error: { message: 'calls down' } };
    replies['voice_calls:single'] = { data: null, error: { message: 'latest down' } };

    expect(await loadVoiceOperatorHealth(admin)).toEqual({
      activeSettings: null,
      verifiedActiveRoutes: null,
      receiptsNeedingProcessing: null,
      callsNeedingBillingReview: null,
      latestCallAt: null,
      failures: ['active settings', 'receipt queue', 'billing review', 'latest call'],
    });
  });

  it('does not count a malformed number as a verified active route', async () => {
    replies.accounts = {
      data: [{ id: 'a1', call_tracking_number: 'not-a-number', ai_voice_route_revision: 1 }],
      error: null,
    };
    expect((await loadVoiceOperatorHealth(admin)).verifiedActiveRoutes).toBe(0);
  });

  it('does not count shared, inactive, unprovisioned, or stale-revision routes', async () => {
    for (const sender of [
      activeSender({ purpose: 'not_voice', account_id: null }),
      activeSender({ lifecycle_state: 'suspended', suspended_at: '2026-08-21T13:00:00Z' }),
      activeSender({ provider_number_id: null }),
    ]) {
      replies.voice_number_inventory = { data: [sender], error: null };
      expect((await loadVoiceOperatorHealth(admin)).verifiedActiveRoutes).toBe(0);
    }

    replies.voice_number_inventory = { data: [activeSender()], error: null };
    replies.account_events = {
      data: [{
        account_id: 'a1',
        meta: {
          route: 'ai_voice', number: '+12485550100',
          voice_number_id: VOICE_NUMBER, route_revision: 0,
        },
      }],
      error: null,
    };
    expect((await loadVoiceOperatorHealth(admin)).verifiedActiveRoutes).toBe(0);
  });

  it('reports inventory read failure as unknown rather than a verified zero', async () => {
    replies.voice_number_inventory = { data: null, error: { message: 'inventory down' } };
    const result = await loadVoiceOperatorHealth(admin);
    expect(result.verifiedActiveRoutes).toBeNull();
    expect(result.failures).toContain('active routes');
  });

  it('does not count stale provider proof as a verified active route', async () => {
    const stale = new Date(Date.now() - 6 * 60 * 60 * 1000 - 1).toISOString();
    replies.voice_number_inventory = {
      data: [activeSender({ provider_verified_at: stale, last_provider_sync_at: stale })],
      error: null,
    };

    expect((await loadVoiceOperatorHealth(admin)).verifiedActiveRoutes).toBe(0);
  });
});
