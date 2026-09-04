import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const doubles = vi.hoisted(() => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/auth', () => ({ createAdminClient: doubles.createAdminClient }));

import { GET } from '@/app/api/cron/voice-number-reconciliation/route';
import {
  SignalWireProvisioningError,
  type SignalWirePhoneNumber,
} from '@/lib/signalwire-number-provisioning';
import {
  runVoiceNumberReconciliation,
} from '@/lib/voice/number-reconciliation';

const ACCOUNT = '11111111-1111-4111-8111-111111111111';
const INVENTORY = '22222222-2222-4222-8222-222222222222';
const PROVIDER_NUMBER = '33333333-3333-4333-8333-333333333333';
const NUMBER = '+18103208001';

type Reply = Readonly<{ data: unknown; error: unknown }>;

function inventory(overrides: Record<string, unknown> = {}) {
  return {
    id: INVENTORY,
    account_id: ACCOUNT,
    provider_number_id: PROVIDER_NUMBER,
    e164_number: NUMBER,
    lifecycle_state: 'active',
    last_provider_check_attempt_at: null,
    last_provider_sync_at: '2026-09-03T00:00:00Z',
    created_at: '2026-09-01T00:00:00Z',
    ...overrides,
  };
}

function phone(overrides: Partial<SignalWirePhoneNumber> = {}): SignalWirePhoneNumber {
  return {
    id: PROVIDER_NUMBER,
    number: NUMBER,
    name: 'LGQ AI Voice',
    capabilities: ['voice'],
    callHandler: 'laml_webhooks',
    callRequestUrl: 'https://app.letsgetquoted.com/api/voice/ai',
    callRequestMethod: 'POST',
    callStatusCallbackUrl: 'https://app.letsgetquoted.com/api/voice/provider-status',
    callStatusCallbackMethod: 'POST',
    messageHandler: null,
    messageRequestUrl: null,
    messageRequestMethod: null,
    ...overrides,
  };
}

function fakeAdmin(options: Readonly<{
  purge?: Reply;
  recovery?: Reply;
  inventory?: Reply;
  apply?: Reply;
  attempt?: Reply;
}> = {}) {
  const events: string[] = [];
  const limit = vi.fn(async (value: number) => {
    events.push(`inventory:${value}`);
    return options.inventory ?? { data: [inventory()], error: null };
  });
  const chain: Record<string, unknown> = { limit };
  for (const method of ['select', 'eq', 'in', 'is']) {
    chain[method] = vi.fn(() => chain);
  }
  const order = vi.fn(() => chain);
  chain.order = order;
  const rpc = vi.fn(async (name: string) => {
    events.push(`rpc:${name}`);
    if (name === 'purge_expired_voice_provider_terminal_tombstones') {
      return options.purge ?? { data: 0, error: null };
    }
    if (name === 'recover_stale_voice_number_operations') {
      return options.recovery ?? { data: [], error: null };
    }
    if (name === 'apply_voice_number_provider_verification') {
      return options.apply ?? {
        data: [{
          voice_number_id: INVENTORY,
          lifecycle_state: 'active',
          provider_readiness_state: 'ready',
          last_provider_sync_at: '2026-09-03T12:00:00Z',
        }],
        error: null,
      };
    }
    if (name === 'record_voice_number_provider_check_attempt') {
      return options.attempt ?? {
        data: [{
          voice_number_id: INVENTORY,
          lifecycle_state: 'active',
          last_provider_check_attempt_at: '2026-09-03T12:00:00Z',
          last_provider_check_error_code: null,
        }],
        error: null,
      };
    }
    return { data: null, error: { message: 'unexpected RPC' } };
  });
  return {
    admin: { rpc, from: vi.fn(() => chain) } as never,
    events,
    limit,
    order,
    rpc,
  };
}

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://app.letsgetquoted.com');
  vi.stubEnv('NEXT_PUBLIC_ROOT_DOMAIN', 'letsgetquoted.com');
  vi.stubEnv('CRON_SECRET', 'cron-secret');
  doubles.createAdminClient.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('AI Voice number reconciliation cron authorization', () => {
  it('requires the exact CRON_SECRET before creating a service client or doing work', async () => {
    const response = await GET(new Request(
      'https://app.letsgetquoted.com/api/cron/voice-number-reconciliation',
      { headers: { authorization: 'Bearer wrong-secret' } },
    ));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Unauthorized' });
    expect(doubles.createAdminClient).not.toHaveBeenCalled();
  });
});

describe('AI Voice number provider proof reconciliation', () => {
  it('recovers expired operations before the bounded inventory query and records exact ready proof', async () => {
    const db = fakeAdmin({
      recovery: {
        data: [{ recovery_status: 'requeued' }],
        error: null,
      },
    });
    const provider = { getPhoneNumber: vi.fn(async () => phone()) };

    const summary = await runVoiceNumberReconciliation({
      admin: db.admin,
      provider: provider as never,
      batchSize: 5,
    });

    expect(db.events[0]).toBe('rpc:purge_expired_voice_provider_terminal_tombstones');
    expect(db.events[1]).toBe('rpc:recover_stale_voice_number_operations');
    expect(db.events[2]).toBe('inventory:5');
    expect(db.rpc).toHaveBeenNthCalledWith(1, 'purge_expired_voice_provider_terminal_tombstones', {
      p_batch_size: 1000,
    });
    expect(db.rpc).toHaveBeenNthCalledWith(2, 'recover_stale_voice_number_operations', {
      p_batch_size: 5,
    });
    expect(db.rpc).toHaveBeenNthCalledWith(3, 'apply_voice_number_provider_verification', {
      p_account_id: ACCOUNT,
      p_voice_number_id: INVENTORY,
      p_observed_provider_object_id: PROVIDER_NUMBER,
      p_observed_result: {
        provider: 'signalwire',
        id: PROVIDER_NUMBER,
        number: NUMBER,
        voice_capable: true,
        call_handler: 'laml_webhooks',
        call_request_url: 'https://app.letsgetquoted.com/api/voice/ai',
        call_request_method: 'POST',
        call_status_callback_url: 'https://app.letsgetquoted.com/api/voice/provider-status',
        call_status_callback_method: 'POST',
      },
      p_verification_status: 'ready',
      p_error_code: null,
    });
    expect(summary).toMatchObject({
      operationCandidates: 1,
      operationsRequeued: 1,
      considered: 1,
      verified: 1,
      failures: 0,
    });
  });

  it('submits exact drift evidence so the database can suspend the bound number', async () => {
    const db = fakeAdmin({
      apply: {
        data: [{
          voice_number_id: INVENTORY,
          lifecycle_state: 'suspended',
          provider_readiness_state: 'drifted',
          last_provider_sync_at: '2026-09-03T12:00:00Z',
        }],
        error: null,
      },
    });
    const provider = {
      getPhoneNumber: vi.fn(async () => phone({
        callRequestUrl: 'https://attacker.example/voice',
      })),
    };

    const summary = await runVoiceNumberReconciliation({
      admin: db.admin,
      provider: provider as never,
    });

    expect(db.rpc).toHaveBeenLastCalledWith('apply_voice_number_provider_verification',
      expect.objectContaining({
        p_account_id: ACCOUNT,
        p_voice_number_id: INVENTORY,
        p_observed_provider_object_id: PROVIDER_NUMBER,
        p_verification_status: 'drifted',
        p_error_code: 'provider_configuration_drift',
        p_observed_result: expect.objectContaining({
          id: PROVIDER_NUMBER,
          number: NUMBER,
          call_request_url: 'https://attacker.example/voice',
        }),
      }));
    expect(summary).toMatchObject({ drifted: 1, verified: 0, failures: 1 });
  });

  it('marks only a confirmed provider 404 as missing', async () => {
    const db = fakeAdmin({
      apply: {
        data: [{
          voice_number_id: INVENTORY,
          lifecycle_state: 'suspended',
          provider_readiness_state: 'missing',
          last_provider_sync_at: '2026-09-03T12:00:00Z',
        }],
        error: null,
      },
    });
    const provider = {
      getPhoneNumber: vi.fn(async () => {
        throw new SignalWireProvisioningError('not found', {
          status: 404,
          code: 'http_404',
          requiredScopes: ['Numbers'],
          responseReceived: true,
          outcomeKnownAbsent: true,
        });
      }),
    };

    const summary = await runVoiceNumberReconciliation({
      admin: db.admin,
      provider: provider as never,
    });

    expect(db.rpc).toHaveBeenLastCalledWith('apply_voice_number_provider_verification',
      expect.objectContaining({
        p_verification_status: 'missing',
        p_observed_result: null,
        p_error_code: 'provider_resource_missing',
      }));
    expect(summary).toMatchObject({ missing: 1, failures: 1 });
  });

  it('does not mistake provider uncertainty for drift or mutate provider state', async () => {
    const db = fakeAdmin();
    const provider = {
      getPhoneNumber: vi.fn(async () => {
        throw new SignalWireProvisioningError('timeout', {
          status: null,
          code: 'network_error',
          requiredScopes: ['Numbers'],
          responseReceived: false,
          outcomeKnownAbsent: false,
        });
      }),
    };

    const summary = await runVoiceNumberReconciliation({
      admin: db.admin,
      provider: provider as never,
    });

    expect(db.rpc).toHaveBeenLastCalledWith('record_voice_number_provider_check_attempt', {
      p_account_id: ACCOUNT,
      p_voice_number_id: INVENTORY,
      p_check_outcome: 'read_error',
      p_error_code: 'network_error',
    });
    expect(summary).toMatchObject({ providerErrors: 1, drifted: 0, missing: 0, failures: 1 });
  });

  it('rotates exact ready nonactive rows without refreshing provider proof', async () => {
    const db = fakeAdmin({
      inventory: { data: [inventory({ lifecycle_state: 'suspended' })], error: null },
      attempt: {
        data: [{
          voice_number_id: INVENTORY,
          lifecycle_state: 'suspended',
          last_provider_check_attempt_at: '2026-09-03T12:00:00Z',
          last_provider_check_error_code: 'provider_ready_nonactive',
        }],
        error: null,
      },
    });
    const provider = { getPhoneNumber: vi.fn(async () => phone()) };

    const summary = await runVoiceNumberReconciliation({
      admin: db.admin,
      provider: provider as never,
    });

    expect(db.rpc).toHaveBeenLastCalledWith('record_voice_number_provider_check_attempt', {
      p_account_id: ACCOUNT,
      p_voice_number_id: INVENTORY,
      p_check_outcome: 'skipped_nonactive',
      p_error_code: 'provider_ready_nonactive',
    });
    expect(summary).toMatchObject({ skippedNonActive: 1, verified: 0, failures: 0 });
  });

  it('rotates a row after an apply failure and reports both failures if telemetry also fails', async () => {
    const db = fakeAdmin({
      apply: { data: null, error: { message: 'write failed' } },
      attempt: { data: null, error: { message: 'telemetry failed' } },
    });
    const provider = { getPhoneNumber: vi.fn(async () => phone()) };

    const summary = await runVoiceNumberReconciliation({
      admin: db.admin,
      provider: provider as never,
    });

    expect(db.rpc).toHaveBeenLastCalledWith('record_voice_number_provider_check_attempt', {
      p_account_id: ACCOUNT,
      p_voice_number_id: INVENTORY,
      p_check_outcome: 'apply_error',
      p_error_code: 'provider_verification_apply_error',
    });
    expect(summary).toMatchObject({ databaseErrors: 2, verified: 0, failures: 2 });
  });

  it('purges bounded terminal tombstones and orders inventory to prevent starvation', async () => {
    const db = fakeAdmin({
      purge: { data: 7, error: null },
      inventory: { data: [], error: null },
    });

    const summary = await runVoiceNumberReconciliation({
      admin: db.admin,
      provider: { getPhoneNumber: vi.fn() } as never,
    });

    expect(summary).toMatchObject({ tombstonesPurged: 7, failures: 0 });
    expect(db.order.mock.calls).toEqual([
      ['last_provider_check_attempt_at', { ascending: true, nullsFirst: true }],
      ['last_provider_sync_at', { ascending: true, nullsFirst: true }],
      ['created_at', { ascending: true, nullsFirst: true }],
    ]);
  });

  it('reports a purge failure but continues reconciliation', async () => {
    const db = fakeAdmin({ purge: { data: null, error: { message: 'down' } } });
    const provider = { getPhoneNumber: vi.fn(async () => phone()) };

    const summary = await runVoiceNumberReconciliation({
      admin: db.admin,
      provider: provider as never,
    });

    expect(provider.getPhoneNumber).toHaveBeenCalledOnce();
    expect(summary).toMatchObject({ verified: 1, databaseErrors: 1, failures: 1 });
  });

  it('rotates rows when provider client initialization is unavailable', async () => {
    vi.stubEnv('SIGNALWIRE_SPACE_URL', '');
    vi.stubEnv('SIGNALWIRE_PROJECT_ID', '');
    vi.stubEnv('SIGNALWIRE_API_TOKEN', '');
    const db = fakeAdmin();

    const summary = await runVoiceNumberReconciliation({ admin: db.admin });

    expect(db.rpc).toHaveBeenLastCalledWith('record_voice_number_provider_check_attempt', {
      p_account_id: ACCOUNT,
      p_voice_number_id: INVENTORY,
      p_check_outcome: 'read_error',
      p_error_code: 'provider_client_initialization_error',
    });
    expect(summary).toMatchObject({ considered: 1, providerErrors: 1, failures: 1 });
  });

  it('caps both database and provider work to the documented maximum', async () => {
    const db = fakeAdmin({ inventory: { data: [], error: null } });
    const provider = { getPhoneNumber: vi.fn() };

    const summary = await runVoiceNumberReconciliation({
      admin: db.admin,
      provider: provider as never,
      batchSize: 10_000,
    });

    expect(db.rpc).toHaveBeenNthCalledWith(2, 'recover_stale_voice_number_operations', {
      p_batch_size: 100,
    });
    expect(db.limit).toHaveBeenCalledWith(100);
    expect(provider.getPhoneNumber).not.toHaveBeenCalled();
    expect(summary).toMatchObject({ batchSize: 100, considered: 0, truncated: false });
  });

  it('stops before provider inspection when stale-operation recovery is unavailable', async () => {
    const db = fakeAdmin({ recovery: { data: null, error: { message: 'down' } } });
    const provider = { getPhoneNumber: vi.fn() };

    const summary = await runVoiceNumberReconciliation({
      admin: db.admin,
      provider: provider as never,
    });

    expect(db.limit).not.toHaveBeenCalled();
    expect(provider.getPhoneNumber).not.toHaveBeenCalled();
    expect(summary).toMatchObject({ databaseErrors: 1, failures: 1, considered: 0 });
  });
});
