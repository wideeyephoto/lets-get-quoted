import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  assignMessagingNumberCampaign,
  configureMessagingNumberInbound,
  loadDedicatedMessagingReadiness,
  MessagingProvisioningGateError,
  loadMessagingNumberPurchasePolicy,
  provisioningFingerprint,
  purchaseMessagingNumber,
  reconcileMessagingNumberAssignment,
  recordMessagingComplianceVerification,
  resolveIndeterminateMessagingNumberOperation,
  setMessagingNumberPurchasePolicy,
  signalWireMessagingLaneReadiness,
  signalWireProviderProvisioningReadiness,
  validateMessagingApplication,
  verifySignalWireCampaignBinding,
  type MessagingNumberOperationRuntime,
  type MessagingNumberOperationStore,
  type MessagingRegistrationApplication,
  type ProvisioningClaim,
} from '@/lib/messaging-number-provisioning';
import { SignalWireNumberProvisioningClient } from '@/lib/signalwire-number-provisioning';

const APPLICATION = '11111111-1111-4111-8111-111111111111';
const ACCOUNT = '77777777-7777-4777-8777-777777777777';
const PHONE_ID = '22222222-2222-4222-8222-222222222222';
const CAMPAIGN = '33333333-3333-4333-8333-333333333333';
const ASSIGNMENT = '44444444-4444-4444-8444-444444444444';
const ORDER = '88888888-8888-4888-8888-888888888888';
const OTHER_ORDER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OPERATION = '99999999-9999-4999-8999-999999999999';
const BRAND = '66666666-6666-4666-8666-666666666666';
const BINDING = {
  brandId: BRAND,
  campaignId: CAMPAIGN,
  legalBusinessName: 'Acme Roofing LLC',
  dbaName: 'Acme Roofing',
  websiteUrl: 'https://acme.example.com',
  einLastFour: '6789',
} as const;
const PURCHASE_POLICY = {
  monthlyPriceCents: 50,
  monthlySpendCeilingCents: 5000,
  confirmationSuffix: 'USD 0.50/MO',
  monthlyPriceLabel: '$0.50/month',
  monthlySpendCeilingLabel: '$50.00/month',
} as const;
const PURCHASE_INPUT = {
  applicationId: APPLICATION,
  accountId: ACCOUNT,
  number: '+12485550140',
  purchasePolicy: PURCHASE_POLICY,
  binding: BINDING,
  actorReference: 'ops@example.com',
} as const;

function campaignAware(mutation: (raw: RequestInfo | URL, init?: RequestInit) => Promise<Response>): typeof fetch {
  return vi.fn<typeof fetch>(async (raw, init) => {
    const url = String(raw);
    if (url.endsWith(`/brands/${BRAND}`)) return new Response(JSON.stringify({
      id: BRAND,
      state: 'complete',
      name: 'Acme Roofing',
      company_name: 'Acme Roofing LLC',
      ein: '12-3456789',
      company_website: 'https://acme.example.com',
    }), { status: 200 });
    if (url.endsWith(`/campaigns/${CAMPAIGN}`)) return new Response(JSON.stringify({
      id: CAMPAIGN,
      state: 'complete',
      name: 'Acme messaging',
      sms_use_case: 'LOW_VOLUME_MIXED',
    }), { status: 200 });
    if (url.includes(`/brands/${BRAND}/campaigns`)) {
      return new Response(JSON.stringify({ links: {}, data: [{ id: CAMPAIGN }] }), { status: 200 });
    }
    return mutation(raw, init);
  });
}

function client(fetchImpl: typeof fetch): SignalWireNumberProvisioningClient {
  return new SignalWireNumberProvisioningClient({
    spaceUrl: 'https://lgq-test.signalwire.com',
    projectId: '55555555-5555-4555-8555-555555555555',
    apiToken: 'test-token',
  }, fetchImpl);
}

function fakeStore(overrides: Partial<MessagingNumberOperationStore> = {}) {
  const calls: string[] = [];
  const value: MessagingNumberOperationStore = {
    claim: vi.fn(async (): Promise<ProvisioningClaim> => ({ status: 'claimed', operationId: 'op-1', claimToken: 'claim-1', providerObjectId: null, providerResult: null })),
    begin: vi.fn(async () => { calls.push('begin'); }),
    complete: vi.fn(async () => { calls.push('complete'); }),
    reject: vi.fn(async () => { calls.push('reject'); }),
    indeterminate: vi.fn(async () => { calls.push('indeterminate'); }),
    recordCandidate: vi.fn(async () => undefined),
    recordCampaignVerification: vi.fn(async () => undefined),
    recordAssignment: vi.fn(async (): Promise<'pending'> => 'pending'),
    ...overrides,
  };
  return { value, calls };
}

function recoveryAdmin(operation: Record<string, unknown>) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn(async () => ({ data: operation, error: null })),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  const rpc = vi.fn(async (name: string) => ({
    data: name === 'record_messaging_campaign_verification_v2' ? true : null,
    error: null,
  }));
  return { admin: { from: vi.fn(() => query), rpc } as never, rpc };
}

function assignmentRecoveryOperation(overrides: Record<string, unknown> = {}) {
  return {
    id: OPERATION,
    application_id: APPLICATION,
    operation_type: 'assign_campaign',
    state: 'indeterminate',
    attempt_count: 1,
    error_code: 'network_error',
    error_detail: 'connection lost',
    provider_object_id: null,
    request_payload: { campaign_id: CAMPAIGN, number: '+12485550140', status_callback_url: null },
    provider_result: null,
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

const ASSIGNMENT_RECOVERY_APPLICATION = {
  id: APPLICATION,
  accountId: ACCOUNT,
  providerCampaignId: CAMPAIGN,
  providerNumberId: PHONE_ID,
  purchasedNumber: '+12485550140',
} as MessagingRegistrationApplication;

function runtime(store: MessagingNumberOperationStore, fetchImpl: typeof fetch, enabled = true): MessagingNumberOperationRuntime {
  return { enabled, store, client: client(fetchImpl) };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

beforeEach(() => {
  vi.stubEnv('LGQ_SIGNALWIRE_PROVISIONING_ENABLED', '1');
  vi.stubEnv('LGQ_SIGNALWIRE_NUMBER_MONTHLY_PRICE_CENTS', '50');
  vi.stubEnv('LGQ_SIGNALWIRE_NUMBER_MONTHLY_SPEND_CEILING_CENTS', '5000');
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://app.example.com');
  vi.stubEnv('NEXT_PUBLIC_ROOT_DOMAIN', 'example.com');
  vi.stubEnv('LGQ_SIGNALWIRE_INBOUND_WEBHOOK_URL', 'https://app.example.com/api/sms/inbound');
  vi.stubEnv('LGQ_SMS_DELIVERY_WORKER_ENABLED', '1');
  vi.stubEnv('LGQ_SMS_PROVIDER', 'signalwire');
  vi.stubEnv('LGQ_SMS_CONTRACTOR_MESSAGING_ENABLED', '1');
  vi.stubEnv('LGQ_SMS_CANARY_ACCOUNT_IDS', ACCOUNT);
  vi.stubEnv('LGQ_DISABLE_OUTBOUND_SMS', '');
  vi.stubEnv('VERCEL_ENV', 'production');
  vi.stubEnv('VITEST', '');
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('TWILIO_ACCOUNT_SID', '');
  vi.stubEnv('TWILIO_AUTH_TOKEN', '');
  vi.stubEnv('SIGNALWIRE_SPACE_URL', 'https://lgq-test.signalwire.com');
  vi.stubEnv('SIGNALWIRE_PROJECT_ID', '55555555-5555-4555-8555-555555555555');
  vi.stubEnv('SIGNALWIRE_API_TOKEN', 'test-token');
  vi.stubEnv('SIGNALWIRE_SIGNING_KEY', 'separate-signing-key');
  vi.stubEnv('SIGNALWIRE_FROM_NUMBER', '+12485550140');
});

describe('dedicated-number provisioning orchestration', () => {
  it('checks the exact spend gate before store claim, provider-client construction, or HTTP', async () => {
    vi.stubEnv('LGQ_SIGNALWIRE_PROVISIONING_ENABLED', '0');
    vi.stubEnv('SIGNALWIRE_SPACE_URL', '');
    vi.stubEnv('SIGNALWIRE_PROJECT_ID', '');
    vi.stubEnv('SIGNALWIRE_API_TOKEN', '');
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    await expect(purchaseMessagingNumber(PURCHASE_INPUT))
      .rejects.toBeInstanceOf(MessagingProvisioningGateError);
    expect(fetchSpy).not.toHaveBeenCalled();

    const store = fakeStore();
    const http = vi.fn<typeof fetch>();
    await expect(purchaseMessagingNumber({
      ...PURCHASE_INPUT,
      runtime: runtime(store.value, http, false),
    })).rejects.toBeInstanceOf(MessagingProvisioningGateError);
    expect(store.value.claim).not.toHaveBeenCalled();
    expect(http).not.toHaveBeenCalled();
  });

  it('refuses an invalid or unpriced policy before a durable claim or provider request', async () => {
    const store = fakeStore();
    const http = vi.fn<typeof fetch>();
    await expect(purchaseMessagingNumber({
      ...PURCHASE_INPUT,
      purchasePolicy: { ...PURCHASE_POLICY, monthlyPriceCents: 0 },
      runtime: runtime(store.value, http),
    })).rejects.toThrow(/spend policy is invalid/i);
    expect(store.value.claim).not.toHaveBeenCalled();
    expect(http).not.toHaveBeenCalled();
  });

  it('allows carrier provisioning while the durable delivery worker is dark without enabling customer egress', async () => {
    vi.stubEnv('LGQ_SMS_DELIVERY_WORKER_ENABLED', '0');
    const store = fakeStore();
    const mutation = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({
      id: PHONE_ID,
      number: '+12485550140',
      name: null,
      capabilities: ['sms'],
    }), { status: 200 }));
    const result = await purchaseMessagingNumber({
      ...PURCHASE_INPUT,
      runtime: runtime(store.value, campaignAware(mutation)),
    });
    expect(result).toMatchObject({ replay: false, providerObjectId: PHONE_ID });
    expect(store.value.claim).toHaveBeenCalledTimes(1);
    expect(mutation).toHaveBeenCalledTimes(1);

    const admin = { from: vi.fn(() => { throw new Error('sender inventory must not be read while egress is dark'); }) } as never;
    expect(signalWireProviderProvisioningReadiness(ACCOUNT)).toEqual({ kind: 'ready' });
    expect(signalWireMessagingLaneReadiness(ACCOUNT)).toEqual({
      kind: 'not_ready', reason: 'delivery_worker_disabled',
    });
    await expect(loadDedicatedMessagingReadiness(ACCOUNT, admin)).resolves.toEqual({
      kind: 'not_ready', reason: 'delivery_worker_disabled',
    });
    expect((admin as { from: ReturnType<typeof vi.fn> }).from).not.toHaveBeenCalled();
  });

  it('keeps every outbound release gate authoritative after provider provisioning is authorized', async () => {
    const resetLiveLane = () => {
      vi.stubEnv('LGQ_SMS_DELIVERY_WORKER_ENABLED', '1');
      vi.stubEnv('LGQ_SMS_PROVIDER', 'signalwire');
      vi.stubEnv('LGQ_SMS_CONTRACTOR_MESSAGING_ENABLED', '1');
      vi.stubEnv('LGQ_SMS_CANARY_ACCOUNT_IDS', ACCOUNT);
      vi.stubEnv('LGQ_DISABLE_OUTBOUND_SMS', '');
      vi.stubEnv('TWILIO_ACCOUNT_SID', '');
      vi.stubEnv('TWILIO_AUTH_TOKEN', '');
      vi.stubEnv('TWILIO_FROM_NUMBER', '');
    };
    const cases = [
      {
        reason: 'delivery_worker_disabled',
        darken: () => vi.stubEnv('LGQ_SMS_DELIVERY_WORKER_ENABLED', '0'),
      },
      {
        reason: 'provider_lane_not_signalwire',
        darken: () => {
          vi.stubEnv('TWILIO_ACCOUNT_SID', 'AC_test');
          vi.stubEnv('TWILIO_AUTH_TOKEN', 'twilio-token');
          vi.stubEnv('TWILIO_FROM_NUMBER', '+13135550100');
          vi.stubEnv('LGQ_SMS_PROVIDER', 'twilio');
        },
      },
      {
        reason: 'outbound_suppressed',
        darken: () => vi.stubEnv('LGQ_DISABLE_OUTBOUND_SMS', '1'),
      },
      {
        reason: 'outside_canary',
        darken: () => vi.stubEnv('LGQ_SMS_CANARY_ACCOUNT_IDS', '99999999-9999-4999-8999-999999999999'),
      },
      {
        reason: 'contractor_lane_disabled',
        darken: () => vi.stubEnv('LGQ_SMS_CONTRACTOR_MESSAGING_ENABLED', '0'),
      },
    ] as const;

    for (const scenario of cases) {
      resetLiveLane();
      scenario.darken();
      const admin = { from: vi.fn(() => { throw new Error('dark egress must stop before sender inventory'); }) } as never;
      expect(signalWireProviderProvisioningReadiness(ACCOUNT)).toEqual({ kind: 'ready' });
      expect(signalWireMessagingLaneReadiness(ACCOUNT)).toEqual({
        kind: 'not_ready', reason: scenario.reason,
      });
      await expect(loadDedicatedMessagingReadiness(ACCOUNT, admin)).resolves.toEqual({
        kind: 'not_ready', reason: scenario.reason,
      });
      expect((admin as { from: ReturnType<typeof vi.fn> }).from).not.toHaveBeenCalled();
    }
  });

  it('still requires a trusted production origin, SignalWire credentials, and a separate signing-key variable', () => {
    expect(signalWireProviderProvisioningReadiness(ACCOUNT)).toEqual({ kind: 'ready' });

    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'http://app.example.com');
    expect(signalWireProviderProvisioningReadiness(ACCOUNT)).toEqual({
      kind: 'unavailable', reason: 'callback_origin_untrusted',
    });
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://app.example.com');

    vi.stubEnv('SIGNALWIRE_SPACE_URL', 'https://signalwire.com');
    expect(signalWireProviderProvisioningReadiness(ACCOUNT)).toEqual({
      kind: 'unavailable', reason: 'provider_unavailable',
    });
    vi.stubEnv('SIGNALWIRE_SPACE_URL', 'https://lgq-test.signalwire.com');

    vi.stubEnv('SIGNALWIRE_SIGNING_KEY', '');
    expect(signalWireProviderProvisioningReadiness(ACCOUNT)).toEqual({
      kind: 'unavailable', reason: 'signing_key_missing',
    });
  });

  it('claims, crosses the durable request boundary, calls SignalWire, then completes in order', async () => {
    const store = fakeStore({
      claim: vi.fn(async (): Promise<ProvisioningClaim> => {
        store.calls.push('claim');
        return { status: 'claimed', operationId: 'op-1', claimToken: 'claim-1', providerObjectId: null, providerResult: null };
      }),
      begin: vi.fn(async () => { store.calls.push('begin'); }),
      complete: vi.fn(async () => { store.calls.push('complete'); }),
    });
    const http = campaignAware(async (_raw, init) => {
      expect(init?.method).toBe('POST');
      store.calls.push('http');
      return new Response(JSON.stringify({ id: PHONE_ID, number: '+12485550140', name: null, capabilities: ['voice'] }), { status: 200 });
    });
    const result = await purchaseMessagingNumber({
      ...PURCHASE_INPUT,
      runtime: runtime(store.value, http),
    });
    expect(result).toMatchObject({ replay: false, providerObjectId: PHONE_ID });
    expect(store.calls).toEqual(['claim', 'begin', 'http', 'complete']);
  });

  it('replays a completed idempotency key without another provider request', async () => {
    const store = fakeStore({
      claim: vi.fn(async (): Promise<ProvisioningClaim> => ({
        status: 'replay', operationId: 'op-1', claimToken: null, providerObjectId: PHONE_ID,
        providerResult: { id: PHONE_ID, number: '+12485550140' },
      })),
    });
    const mutation = vi.fn<typeof fetch>();
    const result = await purchaseMessagingNumber({ ...PURCHASE_INPUT, runtime: runtime(store.value, campaignAware(mutation)) });
    expect(result.replay).toBe(true);
    expect(mutation).not.toHaveBeenCalled();
    expect(store.value.begin).not.toHaveBeenCalled();
  });

  it('does not call the provider when another lease is in progress', async () => {
    const store = fakeStore({
      claim: vi.fn(async (): Promise<ProvisioningClaim> => ({ status: 'in_progress', operationId: 'op-1', claimToken: null, providerObjectId: null, providerResult: null })),
    });
    const mutation = vi.fn<typeof fetch>();
    const http = campaignAware(mutation);
    await expect(purchaseMessagingNumber({ ...PURCHASE_INPUT, runtime: runtime(store.value, http) }))
      .rejects.toThrow(/already in progress/i);
    expect(mutation).not.toHaveBeenCalled();
  });

  it('records explicit provider rejection as retryable failure but unknown post-request outcomes as indeterminate', async () => {
    const rejected = fakeStore();
    const forbidden = campaignAware(async () => new Response(JSON.stringify({ message: 'scope missing' }), { status: 403 }));
    await expect(purchaseMessagingNumber({ ...PURCHASE_INPUT, runtime: runtime(rejected.value, forbidden) })).rejects.toThrow();
    expect(rejected.calls).toEqual(['begin', 'reject']);

    const uncertain = fakeStore();
    const dropped = campaignAware(async () => { throw new Error('connection lost after write'); });
    await expect(purchaseMessagingNumber({ ...PURCHASE_INPUT, runtime: runtime(uncertain.value, dropped) })).rejects.toThrow();
    expect(uncertain.calls).toEqual(['begin', 'indeterminate']);

    const malformed = fakeStore();
    const unreadableSuccess = campaignAware(async () => new Response('not json', { status: 200 }));
    await expect(purchaseMessagingNumber({ ...PURCHASE_INPUT, runtime: runtime(malformed.value, unreadableSuccess) })).rejects.toThrow();
    expect(malformed.calls).toEqual(['begin', 'indeterminate']);

    const providerFailure = fakeStore();
    const unavailable = campaignAware(async () => new Response(JSON.stringify({ message: 'upstream failed' }), { status: 503 }));
    await expect(purchaseMessagingNumber({ ...PURCHASE_INPUT, runtime: runtime(providerFailure.value, unavailable) })).rejects.toThrow();
    expect(providerFailure.calls).toEqual(['begin', 'indeterminate']);

    const ignoredInbound = fakeStore();
    const ignoredInboundResponse = campaignAware(async () => new Response(JSON.stringify({
      id: PHONE_ID,
      number: '+12485550140',
      message_handler: 'laml_webhooks',
      message_request_url: 'https://wrong.example.com/api/sms/inbound',
    }), { status: 200 }));
    await expect(configureMessagingNumberInbound({
      applicationId: APPLICATION,
      accountId: ACCOUNT,
      providerNumberId: PHONE_ID,
      number: '+12485550140',
      friendlyName: 'LGQ Test',
      inboundWebhookUrl: 'https://app.example.com/api/sms/inbound',
      binding: BINDING,
      actorReference: 'ops@example.com',
      runtime: runtime(ignoredInbound.value, ignoredInboundResponse),
    })).rejects.toThrow(/did not confirm the requested inbound webhook/i);
    expect(ignoredInbound.calls).toEqual(['begin', 'indeterminate']);
  });

  it('never logs a raw database/provider error when failure-state persistence also fails', async () => {
    const leaked = 'Authorization: Basic super-secret +12485550140 ops@example.com';
    const store = fakeStore({
      indeterminate: vi.fn(async () => { throw new Error(leaked); }),
    });
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const dropped = campaignAware(async () => { throw new Error('connection lost after write'); });

    await expect(purchaseMessagingNumber({
      ...PURCHASE_INPUT,
      runtime: runtime(store.value, dropped),
    })).rejects.toThrow(/connection lost after write/i);

    expect(log).toHaveBeenCalledWith({
      event: 'messaging_number_operation_failure_persistence_failed',
      applicationId: APPLICATION,
      operationType: 'purchase_number',
      errorCode: 'provider_result_unknown',
    });
    expect(JSON.stringify(log.mock.calls)).not.toContain(leaked);
    expect(JSON.stringify(log.mock.calls)).not.toContain('super-secret');
  });

  it('preserves exact provider success evidence when local completion fails', async () => {
    const indeterminate = vi.fn(async () => undefined);
    const store = fakeStore({
      complete: vi.fn(async () => { throw new Error('database projection failed'); }),
      indeterminate,
    });
    const http = campaignAware(async () => new Response(JSON.stringify({
      id: PHONE_ID,
      number: '+12485550140',
      name: null,
      capabilities: ['sms'],
    }), { status: 200 }));

    await expect(purchaseMessagingNumber({
      ...PURCHASE_INPUT,
      runtime: runtime(store.value, http),
    })).rejects.toThrow(/database projection failed/i);
    expect(http).toHaveBeenCalledTimes(4);
    expect(indeterminate).toHaveBeenCalledWith(
      'op-1',
      'claim-1',
      'provider_result_unknown',
      'database projection failed',
      PHONE_ID,
      expect.objectContaining({ id: PHONE_ID, number: '+12485550140', capabilities: ['sms'] }),
    );
  });

  it('rejects unsafe callback URLs before claiming a durable mutation', async () => {
    for (const callback of [
      '',
      'https://user:password@app.example.com/api/sms/inbound',
      'https://app.example.com/api/sms/inbound?token=secret',
      'https://app.example.com/api/sms/inbound#secret',
    ]) {
      const inboundStore = fakeStore();
      const inboundHttp = vi.fn<typeof fetch>();
      await expect(configureMessagingNumberInbound({
        applicationId: APPLICATION,
        accountId: ACCOUNT,
        providerNumberId: PHONE_ID,
        number: '+12485550140',
        friendlyName: 'LGQ Test',
        binding: BINDING,
        actorReference: 'ops@example.com',
        inboundWebhookUrl: callback,
        runtime: runtime(inboundStore.value, inboundHttp),
      })).rejects.toThrow(/complete HTTPS URL without credentials, a query string, or a fragment/i);
      expect(inboundStore.value.claim).not.toHaveBeenCalled();
      expect(inboundHttp).not.toHaveBeenCalled();
    }

    for (const callback of [
      'https://staging.example.com/api/sms/inbound',
      'https://app.example.com/api/sms/status',
    ]) {
      const inboundStore = fakeStore();
      const inboundHttp = vi.fn<typeof fetch>();
      await expect(configureMessagingNumberInbound({
        applicationId: APPLICATION,
        accountId: ACCOUNT,
        providerNumberId: PHONE_ID,
        number: '+12485550140',
        friendlyName: 'LGQ Test',
        binding: BINDING,
        actorReference: 'ops@example.com',
        inboundWebhookUrl: callback,
        runtime: runtime(inboundStore.value, inboundHttp),
      })).rejects.toThrow(/must exactly match the configured production route/i);
      expect(inboundStore.value.claim).not.toHaveBeenCalled();
      expect(inboundHttp).not.toHaveBeenCalled();
    }

    const assignmentStore = fakeStore();
    const assignmentHttp = vi.fn<typeof fetch>();
    await expect(assignMessagingNumberCampaign({
      applicationId: APPLICATION,
      accountId: ACCOUNT,
      campaignId: CAMPAIGN,
      number: '+12485550140',
      binding: BINDING,
      actorReference: 'ops@example.com',
      statusCallbackUrl: 'https://app.example.com/api/sms/status?token=secret',
      runtime: runtime(assignmentStore.value, assignmentHttp),
    })).rejects.toThrow(/complete HTTPS URL without credentials, a query string, or a fragment/i);
    expect(assignmentStore.value.claim).not.toHaveBeenCalled();
    expect(assignmentHttp).not.toHaveBeenCalled();
  });

  it('gates reconciliation before carrier verification or assignment reads', async () => {
    vi.stubEnv('LGQ_SIGNALWIRE_PROVISIONING_ENABLED', '0');
    const store = fakeStore();
    const http = vi.fn<typeof fetch>();
    await expect(reconcileMessagingNumberAssignment({
      applicationId: APPLICATION,
      accountId: ACCOUNT,
      campaignId: CAMPAIGN,
      number: '+12485550140',
      expectedProviderNumberId: PHONE_ID,
      binding: BINDING,
      actorReference: 'ops@example.com',
      store: store.value,
      client: client(http),
    })).rejects.toBeInstanceOf(MessagingProvisioningGateError);
    expect(http).not.toHaveBeenCalled();
    expect(store.value.recordCampaignVerification).not.toHaveBeenCalled();
    expect(store.value.recordAssignment).not.toHaveBeenCalled();
  });

  it('rejects carrier campaign evidence bound to a different downstream business', async () => {
    const http = vi.fn<typeof fetch>(async (raw) => {
      const url = String(raw);
      if (url.endsWith(`/brands/${BRAND}`)) return new Response(JSON.stringify({
        id: BRAND,
        state: 'complete',
        name: 'Other Roofing',
        company_name: 'Other Roofing LLC',
        ein: '12-3456789',
        company_website: 'https://other.example.com',
      }), { status: 200 });
      if (url.endsWith(`/campaigns/${CAMPAIGN}`)) return new Response(JSON.stringify({
        id: CAMPAIGN,
        state: 'complete',
        name: 'Other messaging',
        sms_use_case: 'LOW_VOLUME_MIXED',
      }), { status: 200 });
      return new Response(JSON.stringify({ links: {}, data: [{ id: CAMPAIGN }] }), { status: 200 });
    });

    await expect(verifySignalWireCampaignBinding({ ...BINDING, client: client(http) }))
      .rejects.toThrow(/legal company name does not match/i);
    expect(http).toHaveBeenCalledTimes(3);
  });

  it('persists a live carrier downgrade before refusing a purchase or another mutation', async () => {
    const store = fakeStore();
    const mutation = vi.fn<typeof fetch>();
    const http = vi.fn<typeof fetch>(async (raw, init) => {
      const url = String(raw);
      if (url.endsWith(`/brands/${BRAND}`)) return new Response(JSON.stringify({
        id: BRAND,
        state: 'complete',
        name: 'Acme Roofing',
        company_name: 'Acme Roofing LLC',
        ein: '12-3456789',
        company_website: 'https://acme.example.com',
      }), { status: 200 });
      if (url.endsWith(`/campaigns/${CAMPAIGN}`)) return new Response(JSON.stringify({
        id: CAMPAIGN,
        state: 'failed',
        name: 'Acme messaging',
        sms_use_case: 'LOW_VOLUME_MIXED',
      }), { status: 200 });
      if (url.includes(`/brands/${BRAND}/campaigns`)) {
        return new Response(JSON.stringify({ links: {}, data: [{ id: CAMPAIGN }] }), { status: 200 });
      }
      return mutation(raw, init);
    });
    await expect(purchaseMessagingNumber({
      ...PURCHASE_INPUT,
      runtime: runtime(store.value, http),
    })).rejects.toThrow(/campaign is not carrier-complete.*failed/i);
    expect(store.value.recordCampaignVerification).toHaveBeenCalledWith(
      APPLICATION,
      expect.objectContaining({ brandState: 'complete', campaignState: 'failed' }),
      'ops@example.com',
    );
    expect(store.value.claim).not.toHaveBeenCalled();
    expect(mutation).not.toHaveBeenCalled();
  });

  it('activates from the individual number assignment result, not order-level processed state', async () => {
    const store = fakeStore({
      recordAssignment: vi.fn(async (_application, assignment): Promise<'complete' | 'pending'> => (
        assignment.state === 'complete' ? 'complete' : 'pending'
      )),
    });
    const http = vi.fn<typeof fetch>(async (raw) => {
      const url = String(raw);
      if (url.endsWith(`/brands/${BRAND}`)) return new Response(JSON.stringify({
        id: BRAND, state: 'complete', name: 'Acme Roofing', company_name: 'Acme Roofing LLC',
        ein: '12-3456789', company_website: 'https://acme.example.com',
      }), { status: 200 });
      if (url.endsWith(`/campaigns/${CAMPAIGN}`)) return new Response(JSON.stringify({
        id: CAMPAIGN, state: 'complete', name: 'Acme messaging', sms_use_case: 'LOW_VOLUME_MIXED',
      }), { status: 200 });
      if (url.includes(`/brands/${BRAND}/campaigns`)) return new Response(JSON.stringify({
        links: {}, data: [{ id: CAMPAIGN }],
      }), { status: 200 });
      if (url.endsWith(`/phone_numbers/${PHONE_ID}`)) return new Response(JSON.stringify({
        id: PHONE_ID,
        number: '+12485550140',
        capabilities: ['voice', 'sms'],
        message_handler: 'laml_webhooks',
        message_request_url: 'https://app.example.com/api/sms/inbound',
        message_request_method: 'POST',
      }), { status: 200 });
      return new Response(JSON.stringify({ data: [{
        id: ASSIGNMENT,
        state: 'complete',
        campaign_id: CAMPAIGN,
        phone_number: { id: PHONE_ID, number: '+12485550140' },
      }], links: {} }), { status: 200 });
    });
    const result = await reconcileMessagingNumberAssignment({
      applicationId: APPLICATION,
      accountId: ACCOUNT,
      campaignId: CAMPAIGN,
      number: '+12485550140',
      expectedProviderNumberId: PHONE_ID,
      binding: BINDING,
      actorReference: 'ops@example.com',
      store: store.value,
      client: client(http),
    });
    expect(result).toBe('complete');
    expect(store.value.recordCampaignVerification).toHaveBeenCalledTimes(1);
    expect(store.value.recordAssignment).toHaveBeenCalledWith(
      APPLICATION,
      expect.objectContaining({ id: ASSIGNMENT, state: 'complete' }),
      'ops@example.com',
      expect.objectContaining({
        providerNumberId: PHONE_ID,
        number: '+12485550140',
        smsCapable: true,
        messageHandler: 'laml_webhooks',
        inboundUrl: 'https://app.example.com/api/sms/inbound',
        inboundMethod: 'POST',
      }),
    );
  });

  it('never activates a complete assignment without exact live SMS and POST webhook proof', async () => {
    const invalidPhones = [
      {
        id: PHONE_ID,
        number: '+12485550140',
        capabilities: ['voice'],
        message_handler: 'laml_webhooks',
        message_request_url: 'https://app.example.com/api/sms/inbound',
        message_request_method: 'POST',
      },
      {
        id: PHONE_ID,
        number: '+12485550140',
        capabilities: ['sms'],
        message_handler: 'laml_webhooks',
        message_request_url: 'https://wrong.example.com/api/sms/inbound',
        message_request_method: 'POST',
      },
      {
        id: PHONE_ID,
        number: '+12485550140',
        capabilities: ['sms'],
        message_handler: 'laml_webhooks',
        message_request_url: 'https://app.example.com/api/sms/inbound',
        message_request_method: 'GET',
      },
    ];
    for (const phone of invalidPhones) {
      const store = fakeStore();
      const http = campaignAware(async (raw) => {
        const url = String(raw);
        if (url.endsWith(`/phone_numbers/${PHONE_ID}`)) {
          return new Response(JSON.stringify(phone), { status: 200 });
        }
        return new Response(JSON.stringify({ data: [{
          id: ASSIGNMENT,
          state: 'complete',
          campaign_id: CAMPAIGN,
          phone_number: { id: PHONE_ID, number: '+12485550140' },
        }], links: {} }), { status: 200 });
      });
      await expect(reconcileMessagingNumberAssignment({
        applicationId: APPLICATION,
        accountId: ACCOUNT,
        campaignId: CAMPAIGN,
        number: '+12485550140',
        expectedProviderNumberId: PHONE_ID,
        binding: BINDING,
        actorReference: 'ops@example.com',
        store: store.value,
        client: client(http),
      })).rejects.toThrow(/SMS capability|exact production POST LaML inbound webhook/i);
      expect(store.value.recordAssignment).not.toHaveBeenCalled();
    }
  });

  it('does not accept confirmed-absent purchase recovery until the provider-owned inventory proves absence', async () => {
    const rpc = vi.fn(async (name: string) => ({ data: name === 'record_messaging_campaign_verification_v2' ? true : null, error: null }));
    const query = {
      select: vi.fn(),
      eq: vi.fn(),
      maybeSingle: vi.fn(async () => ({
        data: {
          id: OPERATION,
          application_id: APPLICATION,
          operation_type: 'purchase_number',
          state: 'indeterminate',
          attempt_count: 1,
          error_code: 'network_error',
          error_detail: 'connection lost',
          provider_object_id: null,
          request_payload: { number: '+12485550140', monthly_price_cents: 50, monthly_spend_ceiling_cents: 5000 },
          provider_result: null,
          updated_at: new Date().toISOString(),
        },
        error: null,
      })),
    };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    const admin = { from: vi.fn(() => query), rpc } as never;
    const application = {
      id: APPLICATION,
      accountId: ACCOUNT,
      providerCampaignId: CAMPAIGN,
    } as MessagingRegistrationApplication;
    const http = campaignAware(async (raw) => {
      expect(String(raw)).toContain('/phone_numbers?filter_number=%2B12485550140&page_size=1000');
      return new Response(JSON.stringify({
        links: {},
        data: [{ id: PHONE_ID, number: '+12485550140', capabilities: ['voice'] }],
      }), { status: 200 });
    });
    await expect(resolveIndeterminateMessagingNumberOperation({
      application,
      operationId: OPERATION,
      resolution: 'confirmed_absent',
      actorReference: 'ops@example.com',
      campaignBinding: BINDING,
      admin,
      client: client(http),
    })).rejects.toThrow(/already owns.*Import that success/i);
    expect(rpc).toHaveBeenCalledWith('record_messaging_campaign_verification_v2', expect.any(Object));
    expect(rpc).not.toHaveBeenCalledWith('resolve_messaging_number_operation_v2', expect.any(Object));
  });

  it('rejects an operator-supplied assignment order UUID when the original response ID was never captured', async () => {
    const { admin, rpc } = recoveryAdmin(assignmentRecoveryOperation());
    const http = campaignAware(async (raw) => {
      throw new Error(`Unexpected provider lookup: ${String(raw)}`);
    });

    await expect(resolveIndeterminateMessagingNumberOperation({
      application: ASSIGNMENT_RECOVERY_APPLICATION,
      operationId: OPERATION,
      resolution: 'confirmed_succeeded',
      providerObjectId: OTHER_ORDER,
      actorReference: 'ops@example.com',
      campaignBinding: BINDING,
      admin,
      client: client(http),
    })).rejects.toThrow(/operator-supplied assignment order UUID cannot be imported/i);
    expect(http).not.toHaveBeenCalledWith(expect.stringContaining('/orders/'), expect.anything());
    expect(rpc).not.toHaveBeenCalledWith('resolve_messaging_number_operation_v2', expect.any(Object));
  });

  it('rejects a substituted assignment order UUID even when the exact original response was captured', async () => {
    const { admin, rpc } = recoveryAdmin(assignmentRecoveryOperation({
      provider_object_id: ORDER,
      provider_result: { id: ORDER, state: 'pending', status_callback_url: null },
    }));
    const http = campaignAware(async (raw) => {
      throw new Error(`Unexpected provider lookup: ${String(raw)}`);
    });

    await expect(resolveIndeterminateMessagingNumberOperation({
      application: ASSIGNMENT_RECOVERY_APPLICATION,
      operationId: OPERATION,
      resolution: 'confirmed_succeeded',
      providerObjectId: OTHER_ORDER,
      actorReference: 'ops@example.com',
      campaignBinding: BINDING,
      admin,
      client: client(http),
    })).rejects.toThrow(/does not match the provider response captured for this operation/i);
    expect(http).not.toHaveBeenCalledWith(expect.stringContaining('/orders/'), expect.anything());
    expect(rpc).not.toHaveBeenCalledWith('resolve_messaging_number_operation_v2', expect.any(Object));
  });

  it('imports only the captured order with live exact campaign, number, and phone-resource evidence', async () => {
    const { admin, rpc } = recoveryAdmin(assignmentRecoveryOperation({
      provider_object_id: ORDER,
      provider_result: { id: ORDER, state: 'pending', status_callback_url: null },
    }));
    const http = campaignAware(async (raw) => {
      const url = String(raw);
      if (url.endsWith(`/orders/${ORDER}`)) {
        return new Response(JSON.stringify({ id: ORDER, state: 'processed', status_callback_url: null }), { status: 200 });
      }
      if (url.endsWith(`/campaigns/${CAMPAIGN}/numbers?page_size=1000`)) {
        return new Response(JSON.stringify({
          links: {},
          data: [{
            id: ASSIGNMENT,
            state: 'pending',
            campaign_id: CAMPAIGN,
            phone_number: { id: PHONE_ID, number: '+12485550140' },
          }],
        }), { status: 200 });
      }
      return new Response(JSON.stringify({ message: 'unexpected' }), { status: 500 });
    });

    await expect(resolveIndeterminateMessagingNumberOperation({
      application: ASSIGNMENT_RECOVERY_APPLICATION,
      operationId: OPERATION,
      resolution: 'confirmed_succeeded',
      providerObjectId: ORDER,
      actorReference: 'ops@example.com',
      campaignBinding: BINDING,
      admin,
      client: client(http),
    })).resolves.toBeUndefined();
    expect(rpc).toHaveBeenCalledWith('resolve_messaging_number_operation_v2', {
      p_operation_id: OPERATION,
      p_resolution: 'confirmed_succeeded',
      p_provider_object_id: ORDER,
      p_provider_result: {
        id: ORDER,
        state: 'processed',
        status_callback_url: null,
        campaign_id: CAMPAIGN,
        number: '+12485550140',
        assignment_id: ASSIGNMENT,
        assignment_state: 'pending',
        provider_number_id: PHONE_ID,
      },
      p_actor_reference: 'ops@example.com',
    });
  });

  it('keeps a captured order quarantined until the exact campaign-number assignment is visible', async () => {
    const { admin, rpc } = recoveryAdmin(assignmentRecoveryOperation({
      provider_object_id: ORDER,
      provider_result: { id: ORDER, state: 'pending', status_callback_url: null },
    }));
    const http = campaignAware(async (raw) => String(raw).endsWith(`/orders/${ORDER}`)
      ? new Response(JSON.stringify({ id: ORDER, state: 'processed', status_callback_url: null }), { status: 200 })
      : new Response(JSON.stringify({ links: {}, data: [] }), { status: 200 }));

    await expect(resolveIndeterminateMessagingNumberOperation({
      application: ASSIGNMENT_RECOVERY_APPLICATION,
      operationId: OPERATION,
      resolution: 'confirmed_succeeded',
      providerObjectId: ORDER,
      actorReference: 'ops@example.com',
      campaignBinding: BINDING,
      admin,
      client: client(http),
    })).rejects.toThrow(/does not yet show the exact campaign and number assignment/i);
    expect(rpc).not.toHaveBeenCalledWith('resolve_messaging_number_operation_v2', expect.any(Object));
  });

  it('cannot confirm assignment-order absence when the original response ID was lost', async () => {
    const { admin, rpc } = recoveryAdmin(assignmentRecoveryOperation());
    const http = campaignAware(async () => new Response(JSON.stringify({ links: {}, data: [] }), { status: 200 }));

    await expect(resolveIndeterminateMessagingNumberOperation({
      application: ASSIGNMENT_RECOVERY_APPLICATION,
      operationId: OPERATION,
      resolution: 'confirmed_absent',
      actorReference: 'ops@example.com',
      campaignBinding: BINDING,
      admin,
      client: client(http),
    })).rejects.toThrow(/cannot prove this assignment order absent/i);
    expect(rpc).not.toHaveBeenCalledWith('resolve_messaging_number_operation_v2', expect.any(Object));
  });

  it('uses only the persisted service-only spend policy and returns its exact revision', async () => {
    vi.stubEnv('LGQ_SIGNALWIRE_NUMBER_MONTHLY_PRICE_CENTS', '999');
    vi.stubEnv('LGQ_SIGNALWIRE_NUMBER_MONTHLY_SPEND_CEILING_CENTS', '99999');
    const query = {
      select: vi.fn(),
      eq: vi.fn(),
      maybeSingle: vi.fn(async () => ({
        data: {
          provider: 'signalwire',
          currency: 'USD',
          monthly_unit_price_cents: 50,
          aggregate_monthly_ceiling_cents: 5000,
          revision: 7,
          updated_at: '2026-08-21T12:00:00.000Z',
        },
        error: null,
      })),
    };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    const rpc = vi.fn(async () => ({
      data: [{
        provider: 'signalwire',
        currency: 'USD',
        monthly_unit_price_cents: 75,
        aggregate_monthly_ceiling_cents: 7500,
        revision: 8,
        updated_at: '2026-08-21T12:05:00.000Z',
      }],
      error: null,
    }));
    const admin = { from: vi.fn(() => query), rpc } as never;
    await expect(loadMessagingNumberPurchasePolicy(admin)).resolves.toMatchObject({
      provider: 'signalwire',
      monthlyPriceCents: 50,
      monthlySpendCeilingCents: 5000,
      revision: 7,
    });
    await expect(setMessagingNumberPurchasePolicy({
      monthlyPriceCents: 75,
      monthlySpendCeilingCents: 7500,
      actorReference: 'ops@example.com',
      admin,
    })).resolves.toMatchObject({ monthlyPriceCents: 75, monthlySpendCeilingCents: 7500, revision: 8 });
    expect(rpc).toHaveBeenCalledWith('set_messaging_number_spend_policy', {
      p_provider: 'signalwire',
      p_monthly_unit_price_cents: 75,
      p_aggregate_monthly_ceiling_cents: 7500,
      p_actor_reference: 'ops@example.com',
    });
  });

  it('normalizes application data and requires opt-in evidence and STOP wording', () => {
    const base = {
      legalBusinessName: 'Acme Roofing LLC', dbaName: 'Acme Roofing', businessType: 'llc',
      websiteUrl: 'https://acme.example.com', businessEmail: 'OWNER@ACME.EXAMPLE.COM', businessPhone: '(248) 555-0140',
      authorizedContactName: 'Alex Owner', authorizedContactTitle: 'Managing Member',
      authorizedContactEmail: 'ALEX@ACME.EXAMPLE.COM', authorizedContactPhone: '(248) 555-0141',
      messagingSupportEmail: 'HELP@ACME.EXAMPLE.COM', messagingSupportPhone: '+12485550142',
      addressLine1: '1 Main Street', addressLine2: '', city: 'Royal Oak', region: 'mi', postalCode: '48067', desiredAreaCode: '248',
      messagingUseCase: 'Two-way appointment scheduling, estimate updates, and homeowner support.', estimatedMonthlyMessages: 500,
      optInDescription: 'Homeowners enter their number and accept the SMS disclosure on the quote request form.',
      optInEvidenceUrl: 'https://acme.example.com/request-a-quote',
      sampleMessages: ['Acme Roofing: Appointment confirmed. Reply STOP to opt out.', 'Acme Roofing: We are on our way.'],
      privacyPolicyUrl: 'https://acme.example.com/privacy', termsUrl: 'https://acme.example.com/terms', attested: true,
    };
    const valid = validateMessagingApplication(base);
    expect(valid.ok).toBe(true);
    if (valid.ok) expect(valid.value).toMatchObject({
      businessEmail: 'owner@acme.example.com',
      businessPhone: '+12485550140',
      authorizedContactEmail: 'alex@acme.example.com',
      authorizedContactPhone: '+12485550141',
      messagingSupportEmail: 'help@acme.example.com',
      messagingSupportPhone: '+12485550142',
      optInEvidenceUrl: 'https://acme.example.com/request-a-quote',
      region: 'MI',
    });
    expect(validateMessagingApplication({ ...base, sampleMessages: ['Hello', 'World'] }).ok).toBe(false);
    expect(validateMessagingApplication({ ...base, authorizedContactTitle: '' }).ok).toBe(false);
    expect(validateMessagingApplication({ ...base, messagingSupportPhone: '248-555' }).ok).toBe(false);
    expect(validateMessagingApplication({ ...base, optInEvidenceUrl: 'http://acme.example.com/opt-in' }).ok).toBe(false);
    expect(provisioningFingerprint({ b: 2, a: 1 })).toBe(provisioningFingerprint({ a: 1, b: 2 }));
  });

  it('keeps full EIN values out of the restricted verification RPC', async () => {
    const rpc = vi.fn(async () => ({ data: true, error: null }));
    const admin = { rpc } as never;
    await expect(recordMessagingComplianceVerification({
      applicationId: APPLICATION,
      einLastFour: '6789',
      verificationReference: 'EIN 12-3456789',
      actorReference: 'ops@example.com',
      admin,
    })).rejects.toThrow(/must not contain a full EIN/i);
    expect(rpc).not.toHaveBeenCalled();

    await recordMessagingComplianceVerification({
      applicationId: APPLICATION,
      einLastFour: '6789',
      verificationReference: 'signalwire-case-alpha',
      actorReference: 'ops@example.com',
      admin,
    });
    expect(rpc).toHaveBeenCalledWith('record_messaging_compliance_verification_v2', {
      p_application_id: APPLICATION,
      p_verification_method: 'ein',
      p_ein_last_four: '6789',
      p_verification_reference: 'signalwire-case-alpha',
      p_otp_reference: null,
      p_actor_reference: 'ops@example.com',
    });
  });

  it('supports sole proprietor OTP verification method in compliance recorder', async () => {
    const rpc = vi.fn(async () => ({ data: true, error: null }));
    const admin = { rpc } as never;

    await recordMessagingComplianceVerification({
      applicationId: APPLICATION,
      verificationMethod: 'sole_proprietor_otp',
      verificationReference: 'signalwire-sole-prop-case-1',
      otpReference: 'otp-session-xyz',
      actorReference: 'ops@example.com',
      admin,
    });

    expect(rpc).toHaveBeenCalledWith('record_messaging_compliance_verification_v2', {
      p_application_id: APPLICATION,
      p_verification_method: 'sole_proprietor_otp',
      p_ein_last_four: null,
      p_verification_reference: 'signalwire-sole-prop-case-1',
      p_otp_reference: 'otp-session-xyz',
      p_actor_reference: 'ops@example.com',
    });
  });
});

