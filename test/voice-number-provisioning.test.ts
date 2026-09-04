import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  authorizeVoiceNumberPurchase,
  configureVoiceNumberInbound,
  loadVoiceNumberPurchasePolicy,
  purchaseVoiceNumber,
  recordVoiceNumberCandidateObservation,
  releaseVoiceNumber,
  resolveIndeterminateVoiceNumberOperation,
  retryFailedVoiceNumberOperation,
  searchVoiceNumberCandidates,
  setVoiceNumberPurchasePolicy,
  SupabaseVoiceNumberOperationStore,
  voiceNumberPurchaseConfirmation,
  type StoredVoiceNumberPurchasePolicy,
  type VoiceNumberOperationRuntime,
  type VoiceNumberOperationStore,
} from '@/lib/voice/number-provisioning';
import {
  SignalWireProvisioningError,
  type SignalWirePhoneNumber,
} from '@/lib/signalwire-number-provisioning';

const ACCOUNT = '11111111-1111-4111-8111-111111111111';
const AUTHORIZATION = '22222222-2222-4222-8222-222222222222';
const OBSERVATION = '77777777-7777-4777-8777-777777777777';
const OPERATION = '33333333-3333-4333-8333-333333333333';
const CLAIM = '44444444-4444-4444-8444-444444444444';
const PHONE_ID = '55555555-5555-4555-8555-555555555555';
const INVENTORY_ID = '66666666-6666-4666-8666-666666666666';
const RETRY_AUTHORIZATION = '88888888-8888-4888-8888-888888888888';
const CLEANUP_RESERVATION = '99999999-9999-4999-8999-999999999999';
const CLEANUP_LEASE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ALT_PHONE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ALT_RESERVATION = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const ALT_LEASE = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const THIRD_PHONE_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const THIRD_RESERVATION = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const THIRD_LEASE = '12121212-1212-4212-8212-121212121212';
const NUMBER = '+18103192943';
const ALT_NUMBER = '+18103192944';

function activeCleanupRow(overrides: Record<string, unknown> = {}) {
  return {
    reservation_id: CLEANUP_RESERVATION,
    reserve_status: 'reserved',
    lease_token: CLEANUP_LEASE,
    lease_expires_at: '2099-09-03T23:59:00.000Z',
    final_disposition: null,
    finalized_at: null,
    ...overrides,
  };
}

const POLICY: StoredVoiceNumberPurchasePolicy = {
  provider: 'signalwire',
  purchaseEnabled: true,
  revision: 7,
  updatedAt: '2026-09-03T23:00:00.000Z',
  monthlyPriceCents: 50,
  monthlySpendCeilingCents: 5000,
  confirmationSuffix: 'USD 0.50/MO',
  monthlyPriceLabel: '$0.50/month',
  monthlySpendCeilingLabel: '$50.00/month',
};

function phone(overrides: Partial<SignalWirePhoneNumber> = {}): SignalWirePhoneNumber {
  return {
    id: PHONE_ID,
    number: NUMBER,
    name: 'LGQ AI Voice',
    capabilities: ['voice'],
    callHandler: null,
    callRequestUrl: null,
    callRequestMethod: null,
    callStatusCallbackUrl: null,
    callStatusCallbackMethod: null,
    messageHandler: null,
    messageRequestUrl: null,
    messageRequestMethod: null,
    ...overrides,
  };
}

function operationStore(
  claimResult: Awaited<ReturnType<VoiceNumberOperationStore['claim']>> = {
    status: 'claimed',
    operationId: OPERATION,
    claimToken: CLAIM,
    providerObjectId: null,
    providerResult: null,
  },
) {
  const store: VoiceNumberOperationStore = {
    claim: vi.fn(async () => claimResult),
    begin: vi.fn(async () => true),
    complete: vi.fn(async () => undefined),
    reject: vi.fn(async () => undefined),
    indeterminate: vi.fn(async () => undefined),
  };
  return store;
}

function runtime(
  store: VoiceNumberOperationStore,
  client: Record<string, unknown>,
  enabled = true,
): VoiceNumberOperationRuntime {
  return { enabled, store, client: client as never };
}

function enableMutations() {
  vi.stubEnv('LGQ_SIGNALWIRE_VOICE_PROVISIONING_ENABLED', '1');
}

function enableRecovery() {
  vi.stubEnv('LGQ_SIGNALWIRE_VOICE_RECOVERY_ENABLED', '1');
}

function availableCandidate() {
  return {
    number: NUMBER,
    region: 'MI',
    city: 'FLINT',
    capabilities: { voice: true, sms: false, mms: false, fax: true },
  };
}

function productionOrigin() {
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://app.letsgetquoted.com');
  vi.stubEnv('NEXT_PUBLIC_ROOT_DOMAIN', 'letsgetquoted.com');
}

function operationQuery(row: Record<string, unknown>) {
  const query = {
    select: vi.fn(), eq: vi.fn(),
    maybeSingle: vi.fn(async () => ({ data: row, error: null })),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  return query;
}

function emptyIdentityQuery() {
  const query = {
    select: vi.fn(), eq: vi.fn(), neq: vi.fn(), or: vi.fn(), limit: vi.fn(),
    maybeSingle: vi.fn(async () => ({ data: null, error: null })),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.neq.mockReturnValue(query);
  query.or.mockReturnValue(query);
  query.limit.mockReturnValue(query);
  return query;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('AI Voice number provisioning service', () => {
  it('loads and updates the authoritative purchase-enabled recurring-price policy', async () => {
    const query = {
      select: vi.fn(),
      eq: vi.fn(),
      maybeSingle: vi.fn(async () => ({
        data: {
          provider: 'signalwire', currency: 'USD', purchase_enabled: true,
          monthly_unit_price_cents: 50, aggregate_monthly_ceiling_cents: 5000,
          revision: 7, updated_at: '2026-09-03T23:00:00.000Z',
        },
        error: null,
      })),
    };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    const rpc = vi.fn(async () => ({
      data: [{
        provider: 'signalwire', currency: 'USD', purchase_enabled: false,
        monthly_unit_price_cents: 75, aggregate_monthly_ceiling_cents: 7500,
        revision: 8, updated_at: '2026-09-03T23:05:00.000Z',
      }],
      error: null,
    }));
    const admin = { from: vi.fn(() => query), rpc } as never;

    await expect(loadVoiceNumberPurchasePolicy(admin)).resolves.toMatchObject(POLICY);
    enableMutations();
    await expect(setVoiceNumberPurchasePolicy({
      monthlyPriceCents: 75,
      monthlySpendCeilingCents: 7500,
      purchaseEnabled: false,
      actorReference: 'ops@example.com',
      admin,
    })).resolves.toMatchObject({ purchaseEnabled: false, revision: 8 });
    expect(rpc).toHaveBeenCalledWith('set_voice_number_spend_policy', {
      p_provider: 'signalwire',
      p_monthly_unit_price_cents: 75,
      p_aggregate_monthly_ceiling_cents: 7500,
      p_purchase_enabled: false,
      p_actor_reference: 'ops@example.com',
    });
  });

  it('authorizes the exact typed number, current price, ceiling, and policy revision', async () => {
    enableMutations();
    const query = {
      select: vi.fn(), eq: vi.fn(),
      maybeSingle: vi.fn(async () => ({
        data: {
          provider: 'signalwire', currency: 'USD', purchase_enabled: true,
          monthly_unit_price_cents: 50, aggregate_monthly_ceiling_cents: 5000,
          revision: 7, updated_at: '2026-09-03T23:00:00.000Z',
        }, error: null,
      })),
    };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    const rpc = vi.fn(async () => ({
      data: [{
        authorization_id: AUTHORIZATION,
        candidate_observation_id: OBSERVATION,
        authorized_at: '2026-09-03T23:10:00.000Z',
        expires_at: '2026-09-03T23:25:00.000Z',
        spend_policy_revision: 7,
        price_evidence_source: 'signalwire_dashboard',
        price_observed_at: '2026-09-03T23:09:00.000Z',
      }],
      error: null,
    }));
    const admin = { from: vi.fn(() => query), rpc } as never;
    const confirmationKey = 'voice-auth:fixed-test-key-0001';

    await expect(authorizeVoiceNumberPurchase({
      accountId: ACCOUNT,
      number: NUMBER,
      candidateObservationId: OBSERVATION,
      confirmation: voiceNumberPurchaseConfirmation(NUMBER, POLICY),
      confirmationKey,
      actorReference: 'ops@example.com',
      admin,
    })).resolves.toMatchObject({
      id: AUTHORIZATION, accountId: ACCOUNT, number: NUMBER,
      candidateObservationId: OBSERVATION,
      policyRevision: 7, monthlyPriceCents: 50, monthlySpendCeilingCents: 5000,
      priceEvidenceSource: 'signalwire_dashboard',
    });
    expect(rpc).toHaveBeenCalledWith('authorize_voice_number_purchase', {
      p_account_id: ACCOUNT,
      p_provider: 'signalwire',
      p_candidate_number: NUMBER,
      p_candidate_observation_id: OBSERVATION,
      p_monthly_unit_price_cents: 50,
      p_aggregate_monthly_ceiling_cents: 5000,
      p_spend_policy_revision: 7,
      p_confirmation_key: confirmationKey,
      p_actor_reference: 'ops@example.com',
    });
  });

  it('records immutable operator-observed dashboard price evidence only after a voice-capable search result', async () => {
    enableMutations();
    const query = {
      select: vi.fn(), eq: vi.fn(),
      maybeSingle: vi.fn(async () => ({
        data: {
          provider: 'signalwire', currency: 'USD', purchase_enabled: true,
          monthly_unit_price_cents: 50, aggregate_monthly_ceiling_cents: 5000,
          revision: 7, updated_at: '2026-09-03T23:00:00.000Z',
        }, error: null,
      })),
    };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    const rpc = vi.fn(async () => ({
      data: [{
        observation_id: OBSERVATION,
        observed_at: '2026-09-03T23:09:00.000Z',
        expires_at: '2026-09-03T23:24:00.000Z',
        monthly_unit_price_cents: 50,
        spend_policy_revision: 7,
        price_evidence_source: 'signalwire_dashboard',
      }],
      error: null,
    }));
    const admin = { from: vi.fn(() => query), rpc } as never;
    const observation = await recordVoiceNumberCandidateObservation({
      candidate: availableCandidate(),
      monthlyPriceCents: 50,
      actorReference: 'ops@example.com',
      observationNonce: 'fixed-observation-nonce-0001',
      admin,
    });
    expect(observation).toMatchObject({
      id: OBSERVATION,
      number: NUMBER,
      monthlyPriceCents: 50,
      policyRevision: 7,
      priceEvidenceSource: 'signalwire_dashboard',
    });
    expect(rpc).toHaveBeenCalledWith('record_voice_number_candidate_observation', expect.objectContaining({
      p_candidate_number: NUMBER,
      p_voice_capable: true,
      p_monthly_unit_price_cents: 50,
      p_spend_policy_revision: 7,
      p_price_evidence_source: 'signalwire_dashboard',
      p_provider_result: expect.objectContaining({
        provider: 'signalwire', number: NUMBER, voice_capable: true,
      }),
      p_search_fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
    }));
  });

  it('uses only the separate voice-capable provider search', async () => {
    const searchAvailableVoiceNumbers = vi.fn(async () => [{
      number: NUMBER,
      region: 'MI',
      city: 'FLINT',
      capabilities: { voice: true, sms: false, mms: false, fax: true },
    }]);
    const searchAvailableNumbers = vi.fn();
    await expect(searchVoiceNumberCandidates({
      areaCode: '810', region: 'MI',
      client: { searchAvailableVoiceNumbers, searchAvailableNumbers } as never,
    })).resolves.toHaveLength(1);
    expect(searchAvailableVoiceNumbers).toHaveBeenCalledWith({
      areaCode: '810', region: 'MI', maxResults: 10,
    });
    expect(searchAvailableNumbers).not.toHaveBeenCalled();
  });

  it('claims and completes purchase with the exact immutable charge snapshot and normalized result', async () => {
    enableMutations();
    const store = operationStore();
    const purchaseNumber = vi.fn(async () => phone());
    const searchAvailableVoiceNumbers = vi.fn(async () => [availableCandidate()]);
    const result = await purchaseVoiceNumber({
      accountId: ACCOUNT,
      number: NUMBER,
      authorizationId: AUTHORIZATION,
      purchasePolicy: POLICY,
      runtime: runtime(store, { searchAvailableVoiceNumbers, purchaseNumber }),
    });

    expect(result.replay).toBe(false);
    expect(store.claim).toHaveBeenCalledWith(expect.objectContaining({
      accountId: ACCOUNT,
      operationType: 'purchase_number',
      purchaseAuthorizationId: AUTHORIZATION,
      payload: {
        number: NUMBER,
        currency: 'USD',
        monthly_price_cents: 50,
        monthly_spend_ceiling_cents: 5000,
        spend_policy_revision: 7,
      },
    }));
    expect(store.complete).toHaveBeenCalledWith(OPERATION, CLAIM, PHONE_ID, {
      provider: 'signalwire', id: PHONE_ID, number: NUMBER, voice_capable: true,
    });
  });

  it('does not make any provider request when the atomic begin boundary returns false', async () => {
    enableMutations();
    const store = operationStore();
    vi.mocked(store.begin).mockResolvedValue(false);
    const searchAvailableVoiceNumbers = vi.fn();
    const purchaseNumber = vi.fn();
    await expect(purchaseVoiceNumber({
      accountId: ACCOUNT,
      number: NUMBER,
      authorizationId: AUTHORIZATION,
      purchasePolicy: POLICY,
      runtime: runtime(store, { searchAvailableVoiceNumbers, purchaseNumber }),
    })).rejects.toThrow(/database cancelled.*no provider request/i);
    expect(searchAvailableVoiceNumbers).not.toHaveBeenCalled();
    expect(purchaseNumber).not.toHaveBeenCalled();
  });

  it.each([
    { label: 'absent', candidates: [] },
    { label: 'not voice capable', candidates: [{ ...availableCandidate(), capabilities: { ...availableCandidate().capabilities, voice: false } }] },
  ])('blocks the purchase POST when immediate carrier recheck is $label', async ({ candidates }) => {
    enableMutations();
    const store = operationStore();
    const searchAvailableVoiceNumbers = vi.fn(async () => candidates);
    const purchaseNumber = vi.fn();
    await expect(purchaseVoiceNumber({
      accountId: ACCOUNT,
      number: NUMBER,
      authorizationId: AUTHORIZATION,
      purchasePolicy: POLICY,
      runtime: runtime(store, { searchAvailableVoiceNumbers, purchaseNumber }),
    })).rejects.toThrow(/no longer lists.*available and voice capable/i);
    expect(purchaseNumber).not.toHaveBeenCalled();
    expect(store.reject).toHaveBeenCalledWith(
      OPERATION,
      CLAIM,
      'signalwire_candidate_not_available_before_purchase',
      expect.stringMatching(/No purchase request was sent/i),
    );
    expect(store.indeterminate).not.toHaveBeenCalled();
  });

  it('forwards sanitized observed provider identity and result to the indeterminate RPC', async () => {
    const rpc = vi.fn(async () => ({ data: true, error: null }));
    const store = new SupabaseVoiceNumberOperationStore({ rpc } as never);
    const result = { provider: 'signalwire', id: PHONE_ID, number: NUMBER, voice_capable: false };
    await store.indeterminate(OPERATION, CLAIM, 'provider_result_unknown', 'mismatch', PHONE_ID, result);
    expect(rpc).toHaveBeenCalledWith('mark_voice_number_operation_indeterminate', {
      p_operation_id: OPERATION,
      p_claim_token: CLAIM,
      p_error_code: 'provider_result_unknown',
      p_error_detail: 'mismatch',
      p_observed_provider_object_id: PHONE_ID,
      p_observed_provider_result: result,
    });
  });

  it('configures voice inventory against /api/voice/ai and the distinct provider-status route', async () => {
    enableMutations();
    productionOrigin();
    const store = operationStore();
    const updateVoicePhoneNumber = vi.fn(async () => phone({
      callHandler: 'laml_webhooks',
      callRequestUrl: 'https://app.letsgetquoted.com/api/voice/ai',
      callRequestMethod: 'POST',
      callStatusCallbackUrl: 'https://app.letsgetquoted.com/api/voice/provider-status',
      callStatusCallbackMethod: 'POST',
    }));

    await configureVoiceNumberInbound({
      accountId: ACCOUNT,
      voiceNumberId: INVENTORY_ID,
      providerNumberId: PHONE_ID,
      number: NUMBER,
      friendlyName: 'BIGFATPIPEGUYS AI Voice',
      runtime: runtime(store, { updateVoicePhoneNumber }),
    });

    expect(store.claim).toHaveBeenCalledWith(expect.objectContaining({
      operationType: 'configure_voice',
      payload: expect.objectContaining({
        voice_number_id: INVENTORY_ID,
        call_handler: 'laml_webhooks',
        call_request_url: 'https://app.letsgetquoted.com/api/voice/ai',
        call_request_method: 'POST',
        call_status_callback_url: 'https://app.letsgetquoted.com/api/voice/provider-status',
        call_status_callback_method: 'POST',
      }),
    }));
    expect(store.complete).toHaveBeenCalledWith(OPERATION, CLAIM, PHONE_ID, {
      provider: 'signalwire',
      id: PHONE_ID,
      number: NUMBER,
      voice_capable: true,
      call_handler: 'laml_webhooks',
      call_request_url: 'https://app.letsgetquoted.com/api/voice/ai',
      call_request_method: 'POST',
      call_status_callback_url: 'https://app.letsgetquoted.com/api/voice/provider-status',
      call_status_callback_method: 'POST',
    });
  });

  it('releases only the exact inventory/provider identity through its own durable operation', async () => {
    enableRecovery();
    const store = operationStore();
    const getPhoneNumber = vi.fn(async () => phone());
    const releasePhoneNumber = vi.fn(async () => ({
      id: PHONE_ID, number: NUMBER, released: true as const,
    }));

    await releaseVoiceNumber({
      accountId: ACCOUNT,
      voiceNumberId: INVENTORY_ID,
      providerNumberId: PHONE_ID,
      number: NUMBER,
      runtime: runtime(store, { getPhoneNumber, releasePhoneNumber }, false),
    });

    expect(store.claim).toHaveBeenCalledWith(expect.objectContaining({
      operationType: 'release_number',
      payload: {
        provider: 'signalwire',
        voice_number_id: INVENTORY_ID,
        provider_number_id: PHONE_ID,
        number: NUMBER,
      },
    }));
    expect(store.complete).toHaveBeenCalledWith(OPERATION, CLAIM, PHONE_ID, {
      provider: 'signalwire', id: PHONE_ID, number: NUMBER, released: true,
    });
    expect(getPhoneNumber).toHaveBeenCalledWith(PHONE_ID);
    expect(getPhoneNumber.mock.invocationCallOrder[0]).toBeLessThan(
      releasePhoneNumber.mock.invocationCallOrder[0],
    );
  });

  it('quarantines a release without opening DELETE when the live provider identity drifted', async () => {
    enableRecovery();
    const store = operationStore();
    const getPhoneNumber = vi.fn(async () => phone({ number: '+18103192944' }));
    const releasePhoneNumber = vi.fn();

    await expect(releaseVoiceNumber({
      accountId: ACCOUNT,
      voiceNumberId: INVENTORY_ID,
      providerNumberId: PHONE_ID,
      number: NUMBER,
      runtime: runtime(store, { getPhoneNumber, releasePhoneNumber }, false),
    })).rejects.toThrow(/does not match the exact AI Voice inventory/i);

    expect(releasePhoneNumber).not.toHaveBeenCalled();
    expect(store.indeterminate).toHaveBeenCalledWith(
      OPERATION,
      CLAIM,
      'provider_result_unknown',
      expect.stringMatching(/does not match the exact AI Voice inventory/i),
      null,
      null,
    );
  });

  it('authorizes and immediately claims one explicit retry generation without exposing the raw token', async () => {
    enableRecovery();
    productionOrigin();
    vi.stubEnv('VOICE_NUMBER_RECOVERY_HMAC_SECRET', '0123456789abcdef0123456789abcdef-extra-entropy');
    const operationQuery = {
      select: vi.fn(), eq: vi.fn(),
      maybeSingle: vi.fn(async () => ({
        data: {
          id: OPERATION,
          account_id: ACCOUNT,
          operation_type: 'configure_voice',
          state: 'failed',
          request_payload: {
            provider: 'signalwire',
            voice_number_id: INVENTORY_ID,
            provider_number_id: PHONE_ID,
            number: NUMBER,
            friendly_name: 'LGQ AI Voice',
            call_request_url: 'https://app.letsgetquoted.com/api/voice/ai',
            call_status_callback_url: 'https://app.letsgetquoted.com/api/voice/provider-status',
          },
          provider_object_id: null,
          provider_result: null,
          observed_provider_object_id: null,
          observed_provider_result: null,
        },
        error: null,
      })),
    };
    operationQuery.select.mockReturnValue(operationQuery);
    operationQuery.eq.mockReturnValue(operationQuery);
    const rpc = vi.fn(async (name: string, _args?: Record<string, unknown>) => {
      if (name === 'authorize_voice_number_operation_retry') {
        return {
          data: [{
            retry_authorization_id: RETRY_AUTHORIZATION,
            retry_generation: 2,
            expires_at: '2026-09-03T23:25:00.000Z',
          }],
          error: null,
        };
      }
      throw new Error(`unexpected RPC ${name}`);
    });
    const admin = { from: vi.fn(() => operationQuery), rpc } as never;
    const store = operationStore();
    const updateVoicePhoneNumber = vi.fn(async () => phone({
      callHandler: 'laml_webhooks',
      callRequestUrl: 'https://app.letsgetquoted.com/api/voice/ai',
      callRequestMethod: 'POST',
      callStatusCallbackUrl: 'https://app.letsgetquoted.com/api/voice/provider-status',
      callStatusCallbackMethod: 'POST',
    }));

    const result = await retryFailedVoiceNumberOperation({
      accountId: ACCOUNT,
      failedOperationId: OPERATION,
      actorReference: 'ops@example.com',
      reason: `RETRY CONFIGURE ${NUMBER} AFTER ${OPERATION}`,
      admin,
      runtime: runtime(store, { updateVoicePhoneNumber }, false),
    });

    expect(result).toMatchObject({ retryAuthorizationId: RETRY_AUTHORIZATION, retryGeneration: 2 });
    expect(store.claim).toHaveBeenCalledWith(expect.objectContaining({
      idempotencyKey: expect.stringContaining(':retry:2'),
      retryAuthorizationId: RETRY_AUTHORIZATION,
      recoveryTokenHmac: expect.stringMatching(/^[a-f0-9]{64}$/),
    }));
    const exposed = JSON.stringify({ result, rpc: rpc.mock.calls, update: updateVoicePhoneNumber.mock.calls });
    expect(exposed).not.toContain('0123456789abcdef0123456789abcdef-extra-entropy');
    expect(result).not.toHaveProperty('recoveryTokenHmac');
    expect(result).not.toHaveProperty('rawToken');
    expect(rpc.mock.calls[0]?.[1]).toEqual({
      p_failed_operation_id: OPERATION,
      p_recovery_token_hmac: expect.stringMatching(/^[a-f0-9]{64}$/),
      p_actor_reference: 'ops@example.com',
      p_reason: `RETRY CONFIGURE ${NUMBER} AFTER ${OPERATION}`,
    });
  });

  it.each([undefined, 'too-short'])('fails closed when the retry HMAC secret is unavailable or short', async (secret) => {
    enableRecovery();
    if (secret) vi.stubEnv('VOICE_NUMBER_RECOVERY_HMAC_SECRET', secret);
    const query = {
      select: vi.fn(), eq: vi.fn(),
      maybeSingle: vi.fn(async () => ({
        data: {
          id: OPERATION, account_id: ACCOUNT, operation_type: 'release_number', state: 'failed',
          request_payload: {
            provider: 'signalwire', voice_number_id: INVENTORY_ID,
            provider_number_id: PHONE_ID, number: NUMBER,
          },
          provider_object_id: null, provider_result: null,
          observed_provider_object_id: null, observed_provider_result: null,
        },
        error: null,
      })),
    };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    const rpc = vi.fn();
    const store = operationStore();
    await expect(retryFailedVoiceNumberOperation({
      accountId: ACCOUNT,
      failedOperationId: OPERATION,
      actorReference: 'ops@example.com',
      reason: 'reviewed retry',
      admin: { from: vi.fn(() => query), rpc } as never,
      runtime: runtime(store, {}, false),
    })).rejects.toThrow(/at least 32 random bytes/i);
    expect(rpc).not.toHaveBeenCalled();
    expect(store.claim).not.toHaveBeenCalled();
  });

  it('quarantines a malformed provider success instead of treating it as a safe retry', async () => {
    enableMutations();
    const store = operationStore();
    const searchAvailableVoiceNumbers = vi.fn(async () => [availableCandidate()]);
    await expect(purchaseVoiceNumber({
      accountId: ACCOUNT,
      number: NUMBER,
      authorizationId: AUTHORIZATION,
      purchasePolicy: POLICY,
      runtime: runtime(store, {
        searchAvailableVoiceNumbers,
        purchaseNumber: vi.fn(async () => phone({ capabilities: ['sms'] })),
      }),
    })).rejects.toThrow(/voice-capable number/i);
    expect(store.indeterminate).toHaveBeenCalledWith(
      OPERATION, CLAIM, 'provider_result_unknown', expect.stringContaining('voice-capable'), PHONE_ID, {
        provider: 'signalwire', id: PHONE_ID, number: NUMBER, voice_capable: false,
      },
    );
    expect(store.complete).not.toHaveBeenCalled();
  });

  it('replays SQL succeeded and blocks SQL reconciliation status without a provider call', async () => {
    enableMutations();
    const purchaseNumber = vi.fn();
    const succeeded = operationStore({
      status: 'succeeded', operationId: OPERATION, claimToken: null,
      providerObjectId: PHONE_ID,
      providerResult: { provider: 'signalwire', id: PHONE_ID, number: NUMBER, voice_capable: true },
    });
    await expect(purchaseVoiceNumber({
      accountId: ACCOUNT, number: NUMBER, authorizationId: AUTHORIZATION,
      purchasePolicy: POLICY, runtime: runtime(succeeded, { purchaseNumber }),
    })).resolves.toMatchObject({ replay: true, providerObjectId: PHONE_ID });

    const uncertain = operationStore({
      status: 'needs_reconciliation', operationId: OPERATION, claimToken: null,
      providerObjectId: null, providerResult: null,
    });
    await expect(purchaseVoiceNumber({
      accountId: ACCOUNT, number: NUMBER, authorizationId: AUTHORIZATION,
      purchasePolicy: POLICY, runtime: runtime(uncertain, { purchaseNumber }),
    })).rejects.toThrow(/uncertain outcome.*reconcile/i);
    expect(purchaseNumber).not.toHaveBeenCalled();
  });

  it('resolves an indeterminate purchase only from exact live owned-number evidence', async () => {
    enableRecovery();
    const query = {
      select: vi.fn(), eq: vi.fn(),
      maybeSingle: vi.fn(async () => ({
        data: {
          id: OPERATION, account_id: ACCOUNT, operation_type: 'purchase_number', state: 'indeterminate',
          request_payload: {
            number: NUMBER, currency: 'USD', monthly_price_cents: 50,
            monthly_spend_ceiling_cents: 5000, spend_policy_revision: 7,
          },
          provider_object_id: null, provider_result: null,
        },
        error: null,
      })),
    };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    const emptyIdentityQuery = {
      select: vi.fn(), eq: vi.fn(), neq: vi.fn(), or: vi.fn(), limit: vi.fn(),
      maybeSingle: vi.fn(async () => ({ data: null, error: null })),
    };
    emptyIdentityQuery.select.mockReturnValue(emptyIdentityQuery);
    emptyIdentityQuery.eq.mockReturnValue(emptyIdentityQuery);
    emptyIdentityQuery.neq.mockReturnValue(emptyIdentityQuery);
    emptyIdentityQuery.or.mockReturnValue(emptyIdentityQuery);
    emptyIdentityQuery.limit.mockReturnValue(emptyIdentityQuery);
    const rpc = vi.fn(async () => ({ data: true, error: null }));
    const admin = {
      from: vi.fn((table: string) => (
        table === 'voice_number_provisioning_operations' ? query : emptyIdentityQuery
      )),
      rpc,
    } as never;

    await resolveIndeterminateVoiceNumberOperation({
      accountId: ACCOUNT,
      operationId: OPERATION,
      resolution: 'confirmed_succeeded',
      actorReference: 'ops@example.com',
      admin,
      client: { findOwnedPhoneNumber: vi.fn(async () => phone()) } as never,
    });
    expect(rpc).toHaveBeenCalledWith('resolve_voice_number_operation', {
      p_operation_id: OPERATION,
      p_resolution: 'succeeded',
      p_provider_object_id: PHONE_ID,
      p_provider_result: {
        provider: 'signalwire', id: PHONE_ID, number: NUMBER, voice_capable: true,
      },
      p_error_code: null,
      p_error_detail: null,
      p_expected_identity_disposition: 'retained',
      p_observed_identity_disposition: 'not_observed',
      p_reconciliation_evidence: {
        provider: 'signalwire',
        operation_id: OPERATION,
        expected_number: NUMBER,
        expected_provider_object_id: PHONE_ID,
        observed_provider_object_id: null,
        observed_number: null,
        expected_disposition: 'retained',
        observed_disposition: 'not_observed',
        cleanup_confirmed: true,
      },
      p_actor_reference: 'ops@example.com',
    });
  });

  it('imports an indeterminate release only when exact provider lookup proves absence', async () => {
    enableRecovery();
    const query = {
      select: vi.fn(), eq: vi.fn(),
      maybeSingle: vi.fn(async () => ({
        data: {
          id: OPERATION, account_id: ACCOUNT, operation_type: 'release_number', state: 'indeterminate',
          request_payload: {
            provider: 'signalwire',
            voice_number_id: INVENTORY_ID,
            provider_number_id: PHONE_ID,
            number: NUMBER,
          },
          provider_object_id: PHONE_ID, provider_result: null,
        },
        error: null,
      })),
    };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    const rpc = vi.fn(async (name: string) => {
      if (name === 'enumerate_pending_voice_number_identity_cleanups') {
        return { data: [], error: null };
      }
      if (name === 'enumerate_purchase_voice_number_cleanup_anchors') {
        return { data: [], error: null };
      }
      if (name === 'reserve_voice_number_identity_cleanup') {
        return { data: [activeCleanupRow()], error: null };
      }
      return { data: true, error: null };
    });
    const admin = { from: vi.fn(() => query), rpc } as never;
    const notFound = new SignalWireProvisioningError('not found', {
      status: 404,
      code: 'http_404',
      requiredScopes: ['Numbers'],
      responseReceived: true,
      outcomeKnownAbsent: true,
    });

    await resolveIndeterminateVoiceNumberOperation({
      accountId: ACCOUNT,
      operationId: OPERATION,
      resolution: 'confirmed_succeeded',
      actorReference: 'ops@example.com',
      admin,
      client: {
        getPhoneNumber: vi.fn(async () => { throw notFound; }),
        findOwnedPhoneNumber: vi.fn(async () => null),
      } as never,
    });
    expect(rpc).toHaveBeenCalledWith('resolve_voice_number_operation', {
      p_operation_id: OPERATION,
      p_resolution: 'succeeded',
      p_provider_object_id: PHONE_ID,
      p_provider_result: {
        provider: 'signalwire', id: PHONE_ID, number: NUMBER, released: true,
      },
      p_error_code: null,
      p_error_detail: null,
      p_expected_identity_disposition: 'confirmed_absent',
      p_observed_identity_disposition: 'not_observed',
      p_reconciliation_evidence: {
        provider: 'signalwire',
        operation_id: OPERATION,
        expected_number: NUMBER,
        expected_provider_object_id: PHONE_ID,
        observed_provider_object_id: null,
        observed_number: null,
        expected_disposition: 'confirmed_absent',
        observed_disposition: 'not_observed',
        cleanup_confirmed: true,
      },
      p_actor_reference: 'ops@example.com',
    });
  });

  it('uses one bounded provider-proof signal and one DELETE-404 absence scan', async () => {
    enableRecovery();
    const query = operationQuery({
      id: OPERATION, account_id: ACCOUNT, operation_type: 'release_number', state: 'indeterminate',
      request_payload: {
        provider: 'signalwire', voice_number_id: INVENTORY_ID,
        provider_number_id: PHONE_ID, number: NUMBER,
      },
      provider_object_id: PHONE_ID, provider_result: null,
      observed_provider_object_id: null, observed_provider_result: null,
    });
    const rpc = vi.fn(async (name: string) => {
      if (name === 'enumerate_pending_voice_number_identity_cleanups') {
        return { data: [], error: null };
      }
      if (name === 'reserve_voice_number_identity_cleanup') {
        return { data: [activeCleanupRow()], error: null };
      }
      return { data: true, error: null };
    });
    const notFound = new SignalWireProvisioningError('not found', {
      status: 404, code: 'http_404', requiredScopes: ['Numbers'],
      responseReceived: true, outcomeKnownAbsent: true,
    });
    const getPhoneNumber = vi.fn(async (
      _providerNumberId: string,
      _options?: { signal?: AbortSignal },
    ) => phone());
    const releasePhoneNumber = vi.fn(async (
      _input: { providerNumberId: string; number: string; signal?: AbortSignal },
    ) => { throw notFound; });
    const findOwnedPhoneNumber = vi.fn(async (
      _number: string,
      _options?: { signal?: AbortSignal },
    ) => null);

    await resolveIndeterminateVoiceNumberOperation({
      accountId: ACCOUNT, operationId: OPERATION, resolution: 'confirmed_succeeded',
      actorReference: 'ops@example.com',
      admin: { from: vi.fn(() => query), rpc } as never,
      client: { getPhoneNumber, releasePhoneNumber, findOwnedPhoneNumber } as never,
    });

    const proofSignal = getPhoneNumber.mock.calls[0]?.[1]?.signal;
    expect(proofSignal).toBeInstanceOf(AbortSignal);
    expect(releasePhoneNumber.mock.calls[0]?.[0]).toMatchObject({
      providerNumberId: PHONE_ID,
      number: NUMBER,
      signal: proofSignal,
      reconcileNotFound: false,
    });
    expect(findOwnedPhoneNumber).toHaveBeenCalledTimes(1);
    expect(findOwnedPhoneNumber.mock.calls[0]?.[1]?.signal).toBe(proofSignal);
    expect(rpc).toHaveBeenCalledWith('finalize_voice_number_identity_cleanup', expect.objectContaining({
      p_disposition: 'confirmed_absent',
    }));
  });

  it('imports a captured purchase only from the exact freshly voice-capable live object', async () => {
    enableRecovery();
    const query = operationQuery({
      id: OPERATION, account_id: ACCOUNT, operation_type: 'purchase_number', state: 'indeterminate',
      request_payload: { number: NUMBER },
      provider_object_id: null, provider_result: null,
      observed_provider_object_id: PHONE_ID,
      observed_provider_result: {
        provider: 'signalwire', id: PHONE_ID, number: NUMBER, voice_capable: false,
      },
    });
    const empty = emptyIdentityQuery();
    const rpc = vi.fn(async () => ({ data: true, error: null }));
    const releasePhoneNumber = vi.fn();

    await resolveIndeterminateVoiceNumberOperation({
      accountId: ACCOUNT, operationId: OPERATION, resolution: 'confirmed_succeeded',
      actorReference: 'ops@example.com',
      admin: {
        from: vi.fn((table: string) => (
          table === 'voice_number_provisioning_operations' ? query : empty
        )),
        rpc,
      } as never,
      client: {
        findOwnedPhoneNumber: vi.fn(async () => phone({ capabilities: ['voice'] })),
        releasePhoneNumber,
      } as never,
    });

    expect(releasePhoneNumber).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith('resolve_voice_number_operation', expect.objectContaining({
      p_provider_object_id: PHONE_ID,
      p_expected_identity_disposition: 'retained',
      p_observed_identity_disposition: 'same_as_expected',
    }));
  });

  it('reserves and cleans a captured same-E164 nonvoice purchase before marking it absent', async () => {
    enableRecovery();
    const query = operationQuery({
      id: OPERATION, account_id: ACCOUNT, operation_type: 'purchase_number', state: 'indeterminate',
      request_payload: { number: NUMBER },
      provider_object_id: null, provider_result: null,
      observed_provider_object_id: PHONE_ID,
      observed_provider_result: {
        provider: 'signalwire', id: PHONE_ID, number: NUMBER, voice_capable: false,
      },
    });
    const rpc = vi.fn(async (name: string) => {
      if (name === 'enumerate_pending_voice_number_identity_cleanups') {
        return { data: [], error: null };
      }
      if (name === 'enumerate_purchase_voice_number_cleanup_anchors') {
        return { data: [], error: null };
      }
      if (name === 'reserve_voice_number_identity_cleanup') {
        return { data: [activeCleanupRow()], error: null };
      }
      return { data: true, error: null };
    });
    const getPhoneNumber = vi.fn(async () => phone({ capabilities: [] }));
    const releasePhoneNumber = vi.fn(async () => ({ id: PHONE_ID, number: NUMBER, released: true as const }));
    const findOwnedPhoneNumber = vi.fn(async () => null);

    await resolveIndeterminateVoiceNumberOperation({
      accountId: ACCOUNT, operationId: OPERATION, resolution: 'confirmed_absent',
      actorReference: 'ops@example.com',
      admin: { from: vi.fn(() => query), rpc } as never,
      client: { getPhoneNumber, releasePhoneNumber, findOwnedPhoneNumber } as never,
    });

    expect(rpc.mock.invocationCallOrder[0]).toBeLessThan(getPhoneNumber.mock.invocationCallOrder[0]);
    expect(getPhoneNumber.mock.invocationCallOrder[0]).toBeLessThan(releasePhoneNumber.mock.invocationCallOrder[0]);
    const finalizationIndex = rpc.mock.calls.findIndex(([name]) => (
      name === 'finalize_voice_number_identity_cleanup'
    ));
    expect(releasePhoneNumber.mock.invocationCallOrder[0])
      .toBeLessThan(rpc.mock.invocationCallOrder[finalizationIndex]);
    expect(rpc).toHaveBeenNthCalledWith(1, 'reserve_voice_number_identity_cleanup', expect.objectContaining({
      p_operation_id: OPERATION,
      p_identity_kind: 'observed',
      p_provider_number_id: PHONE_ID,
      p_e164_number: NUMBER,
    }));
    expect(rpc).toHaveBeenNthCalledWith(3, 'finalize_voice_number_identity_cleanup', {
      p_reservation_id: CLEANUP_RESERVATION,
      p_lease_token: CLEANUP_LEASE,
      p_disposition: 'released',
      p_finalization_evidence: {
        provider: 'signalwire', provider_number_id: PHONE_ID, number: NUMBER,
        disposition: 'released', cleanup_confirmed: true,
      },
      p_actor_reference: 'ops@example.com',
    });
    expect(rpc).toHaveBeenNthCalledWith(5, 'resolve_voice_number_operation', expect.objectContaining({
      p_resolution: 'failed',
      p_provider_object_id: PHONE_ID,
      p_expected_identity_disposition: 'released',
      p_observed_identity_disposition: 'released',
      p_reconciliation_evidence: expect.objectContaining({
        expected_provider_object_id: PHONE_ID,
      }),
    }));
  });

  it('replays finalized exact cleanup without issuing another provider delete', async () => {
    enableRecovery();
    const query = operationQuery({
      id: OPERATION, account_id: ACCOUNT, operation_type: 'release_number', state: 'indeterminate',
      request_payload: {
        provider: 'signalwire', voice_number_id: INVENTORY_ID,
        provider_number_id: PHONE_ID, number: NUMBER,
      },
      provider_object_id: PHONE_ID, provider_result: null,
      observed_provider_object_id: null, observed_provider_result: null,
    });
    const rpc = vi.fn(async (name: string) => {
      if (name === 'enumerate_pending_voice_number_identity_cleanups') {
        return { data: [], error: null };
      }
      if (name === 'enumerate_purchase_voice_number_cleanup_anchors') {
        return { data: [], error: null };
      }
      if (name === 'reserve_voice_number_identity_cleanup') {
        return {
          data: [{
            ...activeCleanupRow(), reserve_status: 'finalized', lease_token: null,
            lease_expires_at: null, final_disposition: 'confirmed_absent',
            finalized_at: '2026-09-03T23:30:00.000Z',
          }],
          error: null,
        };
      }
      return { data: true, error: null };
    });
    const getPhoneNumber = vi.fn();
    const releasePhoneNumber = vi.fn();

    await resolveIndeterminateVoiceNumberOperation({
      accountId: ACCOUNT, operationId: OPERATION, resolution: 'confirmed_succeeded',
      actorReference: 'ops@example.com',
      admin: { from: vi.fn(() => query), rpc } as never,
      client: {
        getPhoneNumber, releasePhoneNumber,
        findOwnedPhoneNumber: vi.fn(async () => null),
      } as never,
    });

    expect(getPhoneNumber).not.toHaveBeenCalled();
    expect(releasePhoneNumber).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalledWith('finalize_voice_number_identity_cleanup', expect.anything());
    expect(rpc).toHaveBeenCalledWith('resolve_voice_number_operation', expect.objectContaining({
      p_expected_identity_disposition: 'confirmed_absent',
    }));
  });

  it('terminalizes only the exact release identity and quarantines an alternate without deleting it', async () => {
    enableRecovery();
    const query = operationQuery({
      id: OPERATION, account_id: ACCOUNT, operation_type: 'release_number', state: 'indeterminate',
      request_payload: {
        provider: 'signalwire', voice_number_id: INVENTORY_ID,
        provider_number_id: PHONE_ID, number: NUMBER,
      },
      provider_object_id: PHONE_ID, provider_result: null,
      observed_provider_object_id: null, observed_provider_result: null,
    });
    const rpc = vi.fn(async (name: string) => {
      if (name === 'enumerate_pending_voice_number_identity_cleanups') {
        return { data: [], error: null };
      }
      if (name === 'reserve_voice_number_identity_cleanup') {
        return { data: [activeCleanupRow()], error: null };
      }
      return { data: true, error: null };
    });
    const notFound = new SignalWireProvisioningError('not found', {
      status: 404, code: 'http_404', requiredScopes: ['Numbers'],
      responseReceived: true, outcomeKnownAbsent: true,
    });
    const getPhoneNumber = vi.fn(async () => { throw notFound; });
    const alternate = phone({ id: ALT_PHONE_ID, number: NUMBER });
    const findOwnedPhoneNumber = vi.fn(async () => alternate);
    const releasePhoneNumber = vi.fn();

    await expect(resolveIndeterminateVoiceNumberOperation({
      accountId: ACCOUNT, operationId: OPERATION, resolution: 'confirmed_succeeded',
      actorReference: 'ops@example.com',
      admin: { from: vi.fn(() => query), rpc } as never,
      client: { getPhoneNumber, findOwnedPhoneNumber, releasePhoneNumber } as never,
    })).rejects.toThrow(/alternate.*quarantined.*manual review.*will not be deleted/i);

    expect(rpc.mock.calls.map(([name]) => name)).toEqual([
      'reserve_voice_number_identity_cleanup',
      'enumerate_pending_voice_number_identity_cleanups',
      'finalize_voice_number_identity_cleanup',
    ]);
    expect(releasePhoneNumber).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalledWith('record_voice_number_reconciliation_observation', expect.anything());
    expect(rpc).not.toHaveBeenCalledWith('reserve_voice_number_identity_cleanup', expect.objectContaining({
      p_provider_number_id: ALT_PHONE_ID,
    }));
    expect(rpc).toHaveBeenLastCalledWith('finalize_voice_number_identity_cleanup', expect.objectContaining({
      p_reservation_id: CLEANUP_RESERVATION,
      p_disposition: 'confirmed_absent',
    }));
  });

  it('cleans a bounded discovered chain before finalizing the original purchase observation', async () => {
    enableRecovery();
    const query = operationQuery({
      id: OPERATION, account_id: ACCOUNT, operation_type: 'purchase_number', state: 'indeterminate',
      request_payload: { number: NUMBER }, provider_object_id: null, provider_result: null,
      observed_provider_object_id: PHONE_ID,
      observed_provider_result: {
        provider: 'signalwire', id: PHONE_ID, number: NUMBER, voice_capable: false,
      },
    });
    const rpc = vi.fn(async (name: string, args?: Record<string, unknown>) => {
      if (name === 'enumerate_pending_voice_number_identity_cleanups') {
        return { data: [], error: null };
      }
      if (name === 'enumerate_purchase_voice_number_cleanup_anchors') {
        return { data: [], error: null };
      }
      if (name === 'reserve_voice_number_identity_cleanup') {
        if (args?.p_identity_kind === 'discovered') {
          return {
            data: [activeCleanupRow({
              reservation_id: ALT_RESERVATION, lease_token: ALT_LEASE,
            })],
            error: null,
          };
        }
        return { data: [activeCleanupRow()], error: null };
      }
      return { data: true, error: null };
    });
    const notFound = new SignalWireProvisioningError('not found', {
      status: 404, code: 'http_404', requiredScopes: ['Numbers'],
      responseReceived: true, outcomeKnownAbsent: true,
    });
    const getPhoneNumber = vi.fn(async (providerNumberId: string) => {
      if (providerNumberId === PHONE_ID) throw notFound;
      return phone({ id: ALT_PHONE_ID, number: NUMBER });
    });
    const findOwnedPhoneNumber = vi.fn()
      .mockResolvedValueOnce(phone({ id: ALT_PHONE_ID, number: NUMBER }))
      .mockResolvedValue(null);
    const releasePhoneNumber = vi.fn(async () => ({
      id: ALT_PHONE_ID, number: NUMBER, released: true as const,
    }));

    await resolveIndeterminateVoiceNumberOperation({
      accountId: ACCOUNT, operationId: OPERATION, resolution: 'confirmed_absent',
      actorReference: 'ops@example.com',
      admin: { from: vi.fn(() => query), rpc } as never,
      client: { getPhoneNumber, findOwnedPhoneNumber, releasePhoneNumber } as never,
    });

    expect(rpc.mock.calls.map(([name]) => name)).toEqual([
      'reserve_voice_number_identity_cleanup',
      'enumerate_pending_voice_number_identity_cleanups',
      'reserve_voice_number_identity_cleanup',
      'finalize_voice_number_identity_cleanup',
      'finalize_voice_number_identity_cleanup',
      'enumerate_purchase_voice_number_cleanup_anchors',
      'resolve_voice_number_operation',
    ]);
    expect(rpc).toHaveBeenNthCalledWith(3, 'reserve_voice_number_identity_cleanup', expect.objectContaining({
      p_identity_kind: 'discovered',
      p_provider_number_id: ALT_PHONE_ID,
      p_e164_number: NUMBER,
    }));
    expect(releasePhoneNumber.mock.invocationCallOrder[0]).toBeGreaterThan(rpc.mock.invocationCallOrder[2]);
    expect(rpc).toHaveBeenLastCalledWith('resolve_voice_number_operation', expect.objectContaining({
      p_expected_identity_disposition: 'confirmed_absent',
      p_observed_identity_disposition: 'confirmed_absent',
    }));
  });

  it('retains each exclusive lease while unwinding a three-identity moved cleanup chain', async () => {
    enableRecovery();
    const query = operationQuery({
      id: OPERATION, account_id: ACCOUNT, operation_type: 'purchase_number', state: 'indeterminate',
      request_payload: { number: NUMBER }, provider_object_id: null, provider_result: null,
      observed_provider_object_id: PHONE_ID,
      observed_provider_result: {
        provider: 'signalwire', id: PHONE_ID, number: NUMBER, voice_capable: false,
      },
    });
    const rpc = vi.fn(async (name: string, args?: Record<string, unknown>) => {
      if (name === 'enumerate_pending_voice_number_identity_cleanups'
          || name === 'enumerate_purchase_voice_number_cleanup_anchors') {
        return { data: [], error: null };
      }
      if (name === 'reserve_voice_number_identity_cleanup') {
        if (args?.p_provider_number_id === ALT_PHONE_ID) {
          return { data: [activeCleanupRow({
            reservation_id: ALT_RESERVATION, lease_token: ALT_LEASE,
          })], error: null };
        }
        if (args?.p_provider_number_id === THIRD_PHONE_ID) {
          return { data: [activeCleanupRow({
            reservation_id: THIRD_RESERVATION, lease_token: THIRD_LEASE,
          })], error: null };
        }
        return { data: [activeCleanupRow()], error: null };
      }
      return { data: true, error: null };
    });
    const notFound = new SignalWireProvisioningError('not found', {
      status: 404, code: 'http_404', requiredScopes: ['Numbers'],
      responseReceived: true, outcomeKnownAbsent: true,
    });
    let bReads = 0;
    const getPhoneNumber = vi.fn(async (providerNumberId: string) => {
      if (providerNumberId === PHONE_ID) throw notFound;
      if (providerNumberId === ALT_PHONE_ID && ++bReads > 1) throw notFound;
      return phone({ id: providerNumberId, number: NUMBER });
    });
    const findOwnedPhoneNumber = vi.fn()
      .mockResolvedValueOnce(phone({ id: ALT_PHONE_ID, number: NUMBER }))
      .mockResolvedValueOnce(phone({ id: THIRD_PHONE_ID, number: NUMBER }))
      .mockResolvedValue(null);
    const releasePhoneNumber = vi.fn(async ({ providerNumberId }: { providerNumberId: string }) => ({
      id: providerNumberId, number: NUMBER, released: true as const,
    }));

    await resolveIndeterminateVoiceNumberOperation({
      accountId: ACCOUNT, operationId: OPERATION, resolution: 'confirmed_absent',
      actorReference: 'ops@example.com',
      admin: { from: vi.fn(() => query), rpc } as never,
      client: { getPhoneNumber, findOwnedPhoneNumber, releasePhoneNumber } as never,
    });

    expect(rpc.mock.calls
      .filter(([name]) => name === 'reserve_voice_number_identity_cleanup')
      .map(([, args]) => (args as Record<string, unknown>).p_provider_number_id))
      .toEqual([PHONE_ID, ALT_PHONE_ID, THIRD_PHONE_ID]);
    expect(releasePhoneNumber.mock.calls.map(([value]) => value.providerNumberId))
      .toEqual([ALT_PHONE_ID, THIRD_PHONE_ID]);
    expect(rpc.mock.calls
      .filter(([name]) => name === 'finalize_voice_number_identity_cleanup')
      .map(([, args]) => (args as Record<string, unknown>).p_reservation_id))
      .toEqual([ALT_RESERVATION, THIRD_RESERVATION, CLEANUP_RESERVATION]);
  });

  it('gives only one concurrent reconciliation worker carrier DELETE authority', async () => {
    enableRecovery();
    const query = operationQuery({
      id: OPERATION, account_id: ACCOUNT, operation_type: 'release_number', state: 'indeterminate',
      request_payload: {
        provider: 'signalwire', voice_number_id: INVENTORY_ID,
        provider_number_id: PHONE_ID, number: NUMBER,
      },
      provider_object_id: PHONE_ID, provider_result: null,
      observed_provider_object_id: null, observed_provider_result: null,
    });
    let reserveCalls = 0;
    const rpc = vi.fn(async (name: string) => {
      if (name === 'enumerate_pending_voice_number_identity_cleanups') {
        return { data: [], error: null };
      }
      if (name === 'reserve_voice_number_identity_cleanup') {
        reserveCalls += 1;
        return reserveCalls === 1
          ? { data: [activeCleanupRow()], error: null }
          : { data: [activeCleanupRow({
              reserve_status: 'busy', lease_token: null,
            })], error: null };
      }
      return { data: true, error: null };
    });
    const releasePhoneNumber = vi.fn(async () => ({
      id: PHONE_ID, number: NUMBER, released: true as const,
    }));
    const request = {
      accountId: ACCOUNT, operationId: OPERATION,
      resolution: 'confirmed_succeeded' as const, actorReference: 'ops@example.com',
      admin: { from: vi.fn(() => query), rpc } as never,
      client: {
        getPhoneNumber: vi.fn(async () => phone()),
        findOwnedPhoneNumber: vi.fn(async () => null),
        releasePhoneNumber,
      } as never,
    };

    const outcomes = await Promise.allSettled([
      resolveIndeterminateVoiceNumberOperation(request),
      resolveIndeterminateVoiceNumberOperation(request),
    ]);

    expect(outcomes.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter(({ status }) => status === 'rejected')).toHaveLength(1);
    expect(String((outcomes.find(({ status }) => status === 'rejected') as PromiseRejectedResult).reason))
      .toMatch(/leased by another reconciliation worker/i);
    expect(releasePhoneNumber).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls.filter(([name]) => name === 'finalize_voice_number_identity_cleanup'))
      .toHaveLength(1);
  });

  it('refuses a near-expiry mutation lease and succeeds only after an expired lease is reclaimed', async () => {
    enableRecovery();
    const query = operationQuery({
      id: OPERATION, account_id: ACCOUNT, operation_type: 'release_number', state: 'indeterminate',
      request_payload: {
        provider: 'signalwire', voice_number_id: INVENTORY_ID,
        provider_number_id: PHONE_ID, number: NUMBER,
      },
      provider_object_id: PHONE_ID, provider_result: null,
      observed_provider_object_id: null, observed_provider_result: null,
    });
    let reserveCalls = 0;
    const rpc = vi.fn(async (name: string) => {
      if (name === 'enumerate_pending_voice_number_identity_cleanups') {
        return { data: [], error: null };
      }
      if (name === 'reserve_voice_number_identity_cleanup') {
        reserveCalls += 1;
        return reserveCalls === 1
          ? { data: [activeCleanupRow({
              lease_expires_at: new Date(Date.now() + 10_000).toISOString(),
            })], error: null }
          : { data: [activeCleanupRow({ reserve_status: 'reclaimed' })], error: null };
      }
      return { data: true, error: null };
    });
    const releasePhoneNumber = vi.fn(async () => ({
      id: PHONE_ID, number: NUMBER, released: true as const,
    }));
    const request = {
      accountId: ACCOUNT, operationId: OPERATION,
      resolution: 'confirmed_succeeded' as const, actorReference: 'ops@example.com',
      admin: { from: vi.fn(() => query), rpc } as never,
      client: {
        getPhoneNumber: vi.fn(async () => phone()),
        findOwnedPhoneNumber: vi.fn(async () => null),
        releasePhoneNumber,
      } as never,
    };

    await expect(resolveIndeterminateVoiceNumberOperation(request))
      .rejects.toThrow(/cleanup lease expired before provider cleanup completed/i);
    expect(releasePhoneNumber).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalledWith('finalize_voice_number_identity_cleanup', expect.anything());

    await expect(resolveIndeterminateVoiceNumberOperation(request)).resolves.toBeUndefined();
    expect(releasePhoneNumber).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('finalize_voice_number_identity_cleanup', expect.objectContaining({
      p_lease_token: CLEANUP_LEASE,
    }));
  });

  it('resumes a discovered cleanup after carrier DELETE crashed before reservation finalization', async () => {
    enableRecovery();
    const query = operationQuery({
      id: OPERATION, account_id: ACCOUNT, operation_type: 'purchase_number', state: 'indeterminate',
      request_payload: { number: NUMBER }, provider_object_id: null, provider_result: null,
      observed_provider_object_id: PHONE_ID,
      observed_provider_result: {
        provider: 'signalwire', id: PHONE_ID, number: NUMBER, voice_capable: false,
      },
    });
    const persistedReservationKey = `voice-cleanup:v1:${OPERATION}:discovered:${ALT_PHONE_ID}:01234567890123456789`;
    const rpc = vi.fn(async (name: string, args?: Record<string, unknown>) => {
      if (name === 'enumerate_pending_voice_number_identity_cleanups') {
        return {
          data: [{
            reservation_id: ALT_RESERVATION,
            identity_kind: 'discovered',
            provider_number_id: ALT_PHONE_ID,
            e164_number: NUMBER,
            reservation_key: persistedReservationKey,
            reserved_at: '2026-09-03T23:20:00.000Z',
          }],
          error: null,
        };
      }
      if (name === 'enumerate_purchase_voice_number_cleanup_anchors') {
        return { data: [], error: null };
      }
      if (name === 'reserve_voice_number_identity_cleanup') {
        return args?.p_identity_kind === 'discovered'
          ? {
              data: [activeCleanupRow({
                reservation_id: ALT_RESERVATION,
                lease_token: ALT_LEASE,
                reserve_status: 'reclaimed',
              })],
              error: null,
            }
          : { data: [activeCleanupRow({ reserve_status: 'reclaimed' })], error: null };
      }
      return { data: true, error: null };
    });
    const notFound = new SignalWireProvisioningError('not found', {
      status: 404, code: 'http_404', requiredScopes: ['Numbers'],
      responseReceived: true, outcomeKnownAbsent: true,
    });
    const getPhoneNumber = vi.fn(async (_providerNumberId: string) => { throw notFound; });
    const findOwnedPhoneNumber = vi.fn(async () => null);
    const releasePhoneNumber = vi.fn();

    await resolveIndeterminateVoiceNumberOperation({
      accountId: ACCOUNT, operationId: OPERATION, resolution: 'confirmed_absent',
      actorReference: 'ops@example.com',
      admin: { from: vi.fn(() => query), rpc } as never,
      client: { getPhoneNumber, findOwnedPhoneNumber, releasePhoneNumber } as never,
    });

    expect(rpc.mock.calls.map(([name]) => name)).toEqual([
      'reserve_voice_number_identity_cleanup',
      'enumerate_pending_voice_number_identity_cleanups',
      'reserve_voice_number_identity_cleanup',
      'finalize_voice_number_identity_cleanup',
      'finalize_voice_number_identity_cleanup',
      'enumerate_purchase_voice_number_cleanup_anchors',
      'resolve_voice_number_operation',
    ]);
    expect(rpc).toHaveBeenNthCalledWith(2, 'enumerate_pending_voice_number_identity_cleanups', {
      p_operation_id: OPERATION,
      p_anchor_reservation_id: CLEANUP_RESERVATION,
      p_limit: 10,
    });
    expect(rpc).toHaveBeenNthCalledWith(3, 'reserve_voice_number_identity_cleanup', expect.objectContaining({
      p_identity_kind: 'discovered',
      p_provider_number_id: ALT_PHONE_ID,
      p_e164_number: NUMBER,
      p_reservation_key: persistedReservationKey,
    }));
    expect(rpc).toHaveBeenNthCalledWith(4, 'finalize_voice_number_identity_cleanup', expect.objectContaining({
      p_reservation_id: ALT_RESERVATION,
      p_lease_token: ALT_LEASE,
      p_disposition: 'confirmed_absent',
    }));
    expect(getPhoneNumber.mock.calls.map(([providerNumberId]) => providerNumberId))
      .toEqual([ALT_PHONE_ID, PHONE_ID]);
    expect(releasePhoneNumber).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenLastCalledWith('resolve_voice_number_operation', expect.objectContaining({
      p_expected_identity_disposition: 'confirmed_absent',
      p_observed_identity_disposition: 'confirmed_absent',
    }));
  });

  it.each([
    { label: 'exact B is already 404', bInitiallyAbsent: true, bDisposition: 'confirmed_absent' },
    { label: 'B DELETE reveals A', bInitiallyAbsent: false, bDisposition: 'released' },
  ])('unwinds a persisted A→B→A cleanup cycle when $label', async ({
    bInitiallyAbsent, bDisposition,
  }) => {
    enableRecovery();
    const query = operationQuery({
      id: OPERATION, account_id: ACCOUNT, operation_type: 'purchase_number', state: 'indeterminate',
      request_payload: { number: NUMBER }, provider_object_id: null, provider_result: null,
      observed_provider_object_id: PHONE_ID,
      observed_provider_result: {
        provider: 'signalwire', id: PHONE_ID, number: NUMBER, voice_capable: false,
      },
    });
    const persistedReservationKey = `voice-cleanup:v1:${OPERATION}:discovered:${ALT_PHONE_ID}:01234567890123456789`;
    const rpc = vi.fn(async (name: string, args?: Record<string, unknown>) => {
      if (name === 'enumerate_pending_voice_number_identity_cleanups') {
        return { data: [{
          reservation_id: ALT_RESERVATION,
          identity_kind: 'discovered',
          provider_number_id: ALT_PHONE_ID,
          e164_number: NUMBER,
          reservation_key: persistedReservationKey,
        }], error: null };
      }
      if (name === 'enumerate_purchase_voice_number_cleanup_anchors') {
        return { data: [], error: null };
      }
      if (name === 'reserve_voice_number_identity_cleanup') {
        return args?.p_provider_number_id === ALT_PHONE_ID
          ? { data: [activeCleanupRow({
              reservation_id: ALT_RESERVATION,
              lease_token: ALT_LEASE,
              reserve_status: 'reclaimed',
            })], error: null }
          : { data: [activeCleanupRow()], error: null };
      }
      return { data: true, error: null };
    });
    const notFound = new SignalWireProvisioningError('not found', {
      status: 404, code: 'http_404', requiredScopes: ['Numbers'],
      responseReceived: true, outcomeKnownAbsent: true,
    });
    const getPhoneNumber = vi.fn(async (providerNumberId: string) => {
      if (providerNumberId === ALT_PHONE_ID && bInitiallyAbsent) throw notFound;
      return phone({ id: providerNumberId, number: NUMBER });
    });
    const findOwnedPhoneNumber = vi.fn()
      .mockResolvedValueOnce(phone({ id: PHONE_ID, number: NUMBER }))
      .mockResolvedValue(null);
    const releasePhoneNumber = vi.fn(async ({ providerNumberId }: { providerNumberId: string }) => ({
      id: providerNumberId, number: NUMBER, released: true as const,
    }));

    await resolveIndeterminateVoiceNumberOperation({
      accountId: ACCOUNT, operationId: OPERATION, resolution: 'confirmed_absent',
      actorReference: 'ops@example.com',
      admin: { from: vi.fn(() => query), rpc } as never,
      client: { getPhoneNumber, findOwnedPhoneNumber, releasePhoneNumber } as never,
    });

    expect(rpc.mock.calls
      .filter(([name]) => name === 'reserve_voice_number_identity_cleanup')
      .map(([, args]) => (args as Record<string, unknown>).p_provider_number_id))
      .toEqual([PHONE_ID, ALT_PHONE_ID]);
    expect(rpc.mock.calls
      .filter(([name]) => name === 'finalize_voice_number_identity_cleanup')
      .map(([, args]) => ({
        reservationId: (args as Record<string, unknown>).p_reservation_id,
        disposition: (args as Record<string, unknown>).p_disposition,
      })))
      .toEqual([
        { reservationId: ALT_RESERVATION, disposition: bDisposition },
        { reservationId: CLEANUP_RESERVATION, disposition: 'released' },
      ]);
    expect(releasePhoneNumber.mock.calls.map(([value]) => value.providerNumberId))
      .toEqual(bInitiallyAbsent ? [PHONE_ID] : [ALT_PHONE_ID, PHONE_ID]);
  });

  it('replays safely after discovered cleanup finalizes but the anchor finalization fails', async () => {
    enableRecovery();
    const query = operationQuery({
      id: OPERATION, account_id: ACCOUNT, operation_type: 'purchase_number', state: 'indeterminate',
      request_payload: { number: NUMBER }, provider_object_id: null, provider_result: null,
      observed_provider_object_id: PHONE_ID,
      observed_provider_result: {
        provider: 'signalwire', id: PHONE_ID, number: NUMBER, voice_capable: false,
      },
    });
    let anchorFinalizations = 0;
    const rpc = vi.fn(async (name: string, args?: Record<string, unknown>) => {
      if (name === 'enumerate_pending_voice_number_identity_cleanups') {
        return { data: [], error: null };
      }
      if (name === 'enumerate_purchase_voice_number_cleanup_anchors') {
        return { data: [], error: null };
      }
      if (name === 'reserve_voice_number_identity_cleanup') {
        return args?.p_identity_kind === 'discovered'
          ? {
              data: [activeCleanupRow({
                reservation_id: ALT_RESERVATION, lease_token: ALT_LEASE,
              })],
              error: null,
            }
          : { data: [activeCleanupRow({ reserve_status: 'reclaimed' })], error: null };
      }
      if (name === 'finalize_voice_number_identity_cleanup'
          && args?.p_reservation_id === CLEANUP_RESERVATION) {
        anchorFinalizations += 1;
        if (anchorFinalizations === 1) {
          return { data: null, error: { code: 'XX000', message: 'simulated finalize interruption' } };
        }
      }
      return { data: true, error: null };
    });
    const notFound = new SignalWireProvisioningError('not found', {
      status: 404, code: 'http_404', requiredScopes: ['Numbers'],
      responseReceived: true, outcomeKnownAbsent: true,
    });
    const getPhoneNumber = vi.fn(async (providerNumberId: string) => {
      if (providerNumberId === PHONE_ID) throw notFound;
      return phone({ id: ALT_PHONE_ID, number: NUMBER });
    });
    const findOwnedPhoneNumber = vi.fn()
      .mockResolvedValueOnce(phone({ id: ALT_PHONE_ID, number: NUMBER }))
      .mockResolvedValue(null);
    const releasePhoneNumber = vi.fn(async () => ({
      id: ALT_PHONE_ID, number: NUMBER, released: true as const,
    }));
    const request = {
      accountId: ACCOUNT, operationId: OPERATION,
      resolution: 'confirmed_absent' as const, actorReference: 'ops@example.com',
      admin: { from: vi.fn(() => query), rpc } as never,
      client: { getPhoneNumber, findOwnedPhoneNumber, releasePhoneNumber } as never,
    };

    await expect(resolveIndeterminateVoiceNumberOperation(request))
      .rejects.toThrow(/simulated finalize interruption/i);
    expect(rpc.mock.calls.some(([name]) => name === 'resolve_voice_number_operation')).toBe(false);
    expect(releasePhoneNumber).toHaveBeenCalledTimes(1);

    await expect(resolveIndeterminateVoiceNumberOperation(request)).resolves.toBeUndefined();
    expect(releasePhoneNumber).toHaveBeenCalledTimes(1);
    expect(anchorFinalizations).toBe(2);
    expect(rpc.mock.calls.filter(([name]) => name === 'resolve_voice_number_operation')).toHaveLength(1);
  });

  it('never deletes when live provider identity conflicts with captured cleanup evidence', async () => {
    enableRecovery();
    const query = operationQuery({
      id: OPERATION, account_id: ACCOUNT, operation_type: 'purchase_number', state: 'indeterminate',
      request_payload: { number: NUMBER }, provider_object_id: null, provider_result: null,
      observed_provider_object_id: ALT_PHONE_ID,
      observed_provider_result: {
        provider: 'signalwire', id: ALT_PHONE_ID, number: ALT_NUMBER, voice_capable: false,
      },
    });
    const rpc = vi.fn(async (name: string) => {
      if (name === 'enumerate_pending_voice_number_identity_cleanups') {
        return { data: [], error: null };
      }
      return name === 'reserve_voice_number_identity_cleanup'
        ? { data: [activeCleanupRow()], error: null }
        : { data: true, error: null };
    });
    const releasePhoneNumber = vi.fn();

    await expect(resolveIndeterminateVoiceNumberOperation({
      accountId: ACCOUNT, operationId: OPERATION, resolution: 'confirmed_absent',
      actorReference: 'ops@example.com',
      admin: { from: vi.fn(() => query), rpc } as never,
      client: {
        getPhoneNumber: vi.fn(async () => phone({ id: ALT_PHONE_ID, number: NUMBER })),
        releasePhoneNumber,
      } as never,
    })).rejects.toThrow(/conflicts with the exact durable reservation/i);

    expect(releasePhoneNumber).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalledWith('finalize_voice_number_identity_cleanup', expect.anything());
    expect(rpc).not.toHaveBeenCalledWith('resolve_voice_number_operation', expect.anything());
  });

  it('gates mutations before any provider or durable-operation work', async () => {
    const store = operationStore();
    const purchaseNumber = vi.fn();
    await expect(purchaseVoiceNumber({
      accountId: ACCOUNT,
      number: NUMBER,
      authorizationId: AUTHORIZATION,
      purchasePolicy: POLICY,
      runtime: runtime(store, { purchaseNumber }),
    })).rejects.toThrow(/provisioning is dark/i);
    expect(store.claim).not.toHaveBeenCalled();
    expect(purchaseNumber).not.toHaveBeenCalled();
  });
});
