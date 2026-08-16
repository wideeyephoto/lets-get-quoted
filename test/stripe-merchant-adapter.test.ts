import type { SupabaseClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const stripeMocks = vi.hoisted(() => ({
  getStripeClient: vi.fn(),
  accountCreate: vi.fn(),
  accountRetrieve: vi.fn(),
  accountLinkCreate: vi.fn(),
}));

vi.mock('@/lib/stripe', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/stripe')>();
  return { ...actual, getStripeClient: stripeMocks.getStripeClient };
});

import {
  STRIPE_MERCHANT_CONFIGURATION_VERSION,
  STRIPE_MERCHANT_RETRIEVE_PARAMS,
  MerchantReadinessStaleWriteError,
  MerchantProvisioningIndeterminateError,
  MerchantProvisioningPersistenceError,
  MerchantProvisioningUnavailableError,
  SupabaseMerchantProvisioningOperationStore,
  buildMerchantAccountCreateCall,
  buildMerchantOnboardingLinkCall,
  buildMerchantReadinessDatabaseUpdate,
  createMerchantOnboardingLink,
  hashMerchantReadinessSnapshot,
  inspectMerchantReadiness,
  persistMerchantReadinessEvidence,
  provisionMerchantAccount,
  retrieveMerchantAccountForReadiness,
  type MerchantAccountCreateCall,
  type MerchantProvisioningClaimInput,
  type MerchantProvisioningDependencies,
  type MerchantProvisioningOperationState,
  verifyAndPersistMerchantReadiness,
} from '@/lib/billing/stripe-merchant';
import { STRIPE_API_VERSION } from '@/lib/stripe';

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_WORKSPACE_ID = '22222222-2222-4222-8222-222222222222';
const MERCHANT_ACCOUNT_ID = 'acct_merchant123';
const VERIFIED_AT = new Date('2026-08-15T21:30:00.000Z');
const OPERATION_PK = '33333333-3333-4333-8333-333333333333';
const CLAIM_TOKEN = '44444444-4444-4444-8444-444444444444';

type CapabilityStatus = 'active' | 'pending' | 'restricted' | 'unsupported';

function merchantResponse(options: {
  accountId?: string;
  cardStatus?: CapabilityStatus;
  achStatus?: CapabilityStatus;
  payoutsStatus?: CapabilityStatus;
  dashboard?: 'full' | 'express' | 'none';
  feesCollector?: 'stripe' | 'application';
  lossesCollector?: 'stripe' | 'application';
  requirementsCollector?: 'stripe' | 'application';
  requirementsStatus?: 'currently_due' | 'eventually_due' | 'past_due' | null;
  includeRequirements?: boolean;
  apiVersion?: string | null;
  requestId?: string | null;
  statusCode?: number;
  livemode?: boolean;
  closed?: boolean;
  merchantApplied?: boolean;
  appliedConfigurations?: Array<'merchant' | 'recipient' | 'customer'>;
  metadata?: Record<string, string>;
} = {}): Stripe.Response<Stripe.V2.Core.Account> {
  const requirementsStatus = options.requirementsStatus ?? null;
  const response = {
    id: options.accountId ?? MERCHANT_ACCOUNT_ID,
    object: 'v2.core.account',
    applied_configurations: options.appliedConfigurations ?? ['merchant'],
    configuration: {
      merchant: {
        applied: options.merchantApplied ?? true,
        capabilities: {
          card_payments: { status: options.cardStatus ?? 'active', status_details: [] },
          ach_debit_payments: { status: options.achStatus ?? 'active', status_details: [] },
          stripe_balance: {
            payouts: { status: options.payoutsStatus ?? 'active', status_details: [] },
          },
        },
      },
    },
    contact_email: 'private-contractor@example.test',
    created: '2026-08-15T20:00:00.000Z',
    dashboard: options.dashboard ?? 'full',
    defaults: {
      responsibilities: {
        fees_collector: options.feesCollector ?? 'stripe',
        losses_collector: options.lossesCollector ?? 'stripe',
        requirements_collector: options.requirementsCollector ?? 'stripe',
      },
    },
    livemode: options.livemode ?? true,
    metadata: options.metadata ?? {
      lgq_workspace_id: WORKSPACE_ID,
      lgq_configuration: STRIPE_MERCHANT_CONFIGURATION_VERSION,
      secret_internal_note: 'must-not-enter-evidence',
    },
    ...(options.includeRequirements === false
      ? {}
      : {
          requirements: {
            entries: requirementsStatus
              ? [
                  {
                    awaiting_action_from: 'user',
                    description: 'identity.business_details.address',
                    errors: [],
                    impact: {},
                    minimum_deadline: { status: requirementsStatus },
                    requested_reasons: [],
                  },
                ]
              : [],
            ...(requirementsStatus
              ? { summary: { minimum_deadline: { status: requirementsStatus, time: '2026-09-01T00:00:00.000Z' } } }
              : {}),
          },
        }),
    ...(options.closed ? { closed: true } : {}),
    lastResponse: {
      headers: {},
      requestId: options.requestId === null ? '' : options.requestId ?? 'req_merchant_readiness_123',
      statusCode: options.statusCode ?? 200,
      ...(options.apiVersion === null ? {} : { apiVersion: options.apiVersion ?? STRIPE_API_VERSION }),
    },
  };
  return response as unknown as Stripe.Response<Stripe.V2.Core.Account>;
}

type FakeAccountRow = Record<string, unknown> & {
  id: string;
  stripe_merchant_account_id: string | null;
};

function fakeAdmin(initialMerchantAccountId: string | null) {
  const row: FakeAccountRow = {
    id: WORKSPACE_ID,
    stripe_merchant_account_id: initialMerchantAccountId,
    merchant_livemode: true,
    merchant_configuration_verified_at: null,
  };
  const updates: Array<Record<string, unknown>> = [];

  function matches(filters: Record<string, unknown>, nullFilters: Record<string, null>) {
    return Object.entries(filters).every(([key, value]) => row[key] === value)
      && Object.keys(nullFilters).every((key) => row[key] === null);
  }

  let rpcTail = Promise.resolve();
  const rpc = vi.fn((name: string, args: Record<string, unknown>) => {
    const operation = rpcTail.then(() => {
      if (name !== 'persist_stripe_merchant_readiness_evidence') {
        return { data: null, error: { code: '42883', message: `Unexpected RPC ${name}` } };
      }
      if (
        args.p_workspace_id !== row.id
        || args.p_provider_account_id !== row.stripe_merchant_account_id
        || args.p_expected_livemode !== row.merchant_livemode
      ) {
        return { data: null, error: { code: 'P0001', message: 'workspace mapping mismatch' } };
      }
      const evidence = args.p_evidence;
      if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) {
        return { data: null, error: { code: '22023', message: 'invalid evidence' } };
      }
      const payload = evidence as Record<string, unknown>;
      const incoming = Date.parse(String(payload.merchant_configuration_verified_at ?? ''));
      const current = row.merchant_configuration_verified_at == null
        ? Number.NEGATIVE_INFINITY
        : Date.parse(String(row.merchant_configuration_verified_at));
      if (!Number.isFinite(incoming)) {
        return { data: null, error: { code: '22023', message: 'invalid verification timestamp' } };
      }
      if (incoming <= current) return { data: false, error: null };

      updates.push(payload);
      Object.assign(row, payload);
      return { data: true, error: null };
    });
    rpcTail = operation.then(() => undefined, () => undefined);
    return operation;
  });

  const client = {
    rpc,
    from: vi.fn((table: string) => {
      if (table !== 'accounts') throw new Error(`Unexpected table ${table}`);
      return {
        select: vi.fn(() => {
          const filters: Record<string, unknown> = {};
          const query = {
            eq: vi.fn((key: string, value: unknown) => {
              filters[key] = value;
              return query;
            }),
            single: vi.fn(async () => ({
              data: matches(filters, {}) ? { ...row } : null,
              error: null,
            })),
          };
          return query;
        }),
      };
    }),
  };

  return {
    admin: client as unknown as SupabaseClient,
    row,
    updates,
    rpc,
  };
}

function provisioningHarness(options: {
  initialState?: MerchantProvisioningOperationState | null;
  providerAccountId?: string | null;
  response?: Stripe.Response<Stripe.V2.Core.Account>;
  providerError?: unknown;
  completionError?: unknown;
  markError?: unknown;
} = {}) {
  let state = options.initialState ?? null;
  let providerAccountId = options.providerAccountId ?? null;
  let immutableClaim: MerchantProvisioningClaimInput | null = null;
  const events: string[] = [];

  const store = {
    claim: vi.fn(async (input: MerchantProvisioningClaimInput) => {
      events.push('claim');
      if (immutableClaim) {
        if (
          immutableClaim.workspaceId !== input.workspaceId ||
          immutableClaim.livemode !== input.livemode ||
          immutableClaim.stripeIdempotencyKey !== input.stripeIdempotencyKey ||
          immutableClaim.requestFingerprint !== input.requestFingerprint
        ) {
          throw new Error('workspace Merchant create was already claimed with different immutable input');
        }
      } else {
        immutableClaim = Object.freeze({ ...input });
      }

      if (state === null) {
        state = 'claimed';
        return {
          status: 'claimed' as const,
          operationPk: OPERATION_PK,
          claimToken: CLAIM_TOKEN,
          operationState: state,
          providerAccountId: null,
        };
      }
      if (state === 'succeeded') {
        return {
          status: 'replay' as const,
          operationPk: OPERATION_PK,
          claimToken: null,
          operationState: state,
          providerAccountId,
        };
      }
      return {
        status: state === 'claimed' ? 'in_progress' as const : state,
        operationPk: OPERATION_PK,
        claimToken: null,
        operationState: state,
        providerAccountId,
      };
    }),
    beginSubmission: vi.fn(async () => {
      events.push('begin');
      if (state !== 'claimed') throw new Error('claim is not submit-ready');
      state = 'submitted';
    }),
    complete: vi.fn(async (input: { providerAccountId: string }) => {
      events.push('complete');
      if (options.completionError) throw options.completionError;
      if (state !== 'submitted') throw new Error('submission is not complete-ready');
      providerAccountId = input.providerAccountId;
      state = 'succeeded';
    }),
    markIndeterminate: vi.fn(async (input: { providerAccountId: string | null }) => {
      events.push('indeterminate');
      if (options.markError) throw options.markError;
      if (state !== 'submitted') throw new Error('submission is not recovery-ready');
      providerAccountId = input.providerAccountId;
      state = 'indeterminate';
    }),
  };

  const createAccount = vi.fn(async (_call: MerchantAccountCreateCall) => {
    events.push('stripe');
    if (options.providerError) throw options.providerError;
    return options.response ?? merchantResponse({
      cardStatus: 'pending',
      payoutsStatus: 'pending',
      livemode: false,
    });
  });

  return {
    dependencies: { store, createAccount } as MerchantProvisioningDependencies,
    store,
    createAccount,
    events,
    getState: () => state,
    getProviderAccountId: () => providerAccountId,
  };
}

const UNUSED_ADMIN = {} as SupabaseClient;

beforeEach(() => {
  vi.clearAllMocks();
  stripeMocks.getStripeClient.mockReturnValue({
    v2: {
      core: {
        accounts: {
          create: stripeMocks.accountCreate,
          retrieve: stripeMocks.accountRetrieve,
        },
        accountLinks: {
          create: stripeMocks.accountLinkCreate,
        },
      },
    },
  });
  stripeMocks.accountCreate.mockResolvedValue(merchantResponse({ cardStatus: 'pending', payoutsStatus: 'pending' }));
  stripeMocks.accountRetrieve.mockResolvedValue(merchantResponse());
  stripeMocks.accountLinkCreate.mockResolvedValue({ url: 'https://connect.stripe.test/onboarding/one-time' });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('Accounts v2 Merchant request builders', () => {
  it('hard-codes the full-Dashboard contractor-owned fee and loss configuration', () => {
    const call = buildMerchantAccountCreateCall({
      workspaceId: WORKSPACE_ID,
      businessName: '  North Star Roofing  ',
      contactEmail: ' Owner@Example.Test ',
    });

    expect(call.params).toMatchObject({
      contact_email: 'owner@example.test',
      display_name: 'North Star Roofing',
      dashboard: 'full',
      identity: { country: 'us' },
      configuration: {
        merchant: { capabilities: { card_payments: { requested: true } } },
      },
      defaults: {
        currency: 'usd',
        responsibilities: { fees_collector: 'stripe', losses_collector: 'stripe' },
      },
      include: ['configuration.merchant', 'defaults', 'requirements'],
      metadata: {
        lgq_workspace_id: WORKSPACE_ID,
        lgq_configuration: STRIPE_MERCHANT_CONFIGURATION_VERSION,
      },
    });
    expect(call.params.configuration).not.toHaveProperty('recipient');
    expect(call.options).toEqual({ idempotencyKey: expect.stringMatching(/^lgq:merchant:v1:account\.create:[a-f0-9]{64}$/) });
    expect(call.options).not.toHaveProperty('stripeAccount');
    expect(call.options).not.toHaveProperty('stripeContext');

    const retry = buildMerchantAccountCreateCall({
      workspaceId: WORKSPACE_ID,
      businessName: 'North Star Roofing',
      contactEmail: 'owner@example.test',
    });
    const anotherWorkspace = buildMerchantAccountCreateCall({
      workspaceId: OTHER_WORKSPACE_ID,
      businessName: 'North Star Roofing',
      contactEmail: 'owner@example.test',
    });
    expect(retry.options.idempotencyKey).toBe(call.options.idempotencyKey);
    expect(anotherWorkspace.options.idempotencyKey).not.toBe(call.options.idempotencyKey);
  });

  it('exposes only hosted account_onboarding for the Merchant configuration', () => {
    const call = buildMerchantOnboardingLinkCall({
      merchantAccountId: MERCHANT_ACCOUNT_ID,
      returnUrl: 'http://localhost:3010/dashboard/merchant-return',
      refreshUrl: 'http://localhost:3010/dashboard/merchant-refresh',
    });

    expect(call.params).toEqual({
      account: MERCHANT_ACCOUNT_ID,
      use_case: {
        type: 'account_onboarding',
        account_onboarding: {
          configurations: ['merchant'],
          collection_options: { fields: 'eventually_due' },
          return_url: 'http://localhost:3010/dashboard/merchant-return',
          refresh_url: 'http://localhost:3010/dashboard/merchant-refresh',
        },
      },
    });
    expect(JSON.stringify(call)).not.toContain('account_update');
    expect(() => buildMerchantOnboardingLinkCall({
      merchantAccountId: MERCHANT_ACCOUNT_ID,
      returnUrl: 'https://attacker.example/return',
      refreshUrl: 'http://localhost:3010/dashboard/merchant-refresh',
    })).toThrow(/configured LGQ app origin/);
  });

  it('uses typed retrieval and onboarding wrappers without connected-account request context', async () => {
    await retrieveMerchantAccountForReadiness(MERCHANT_ACCOUNT_ID);
    await createMerchantOnboardingLink({
      merchantAccountId: MERCHANT_ACCOUNT_ID,
      returnUrl: 'http://localhost:3010/dashboard/merchant-return',
      refreshUrl: 'http://localhost:3010/dashboard/merchant-refresh',
    });

    expect(stripeMocks.accountRetrieve).toHaveBeenCalledWith(
      MERCHANT_ACCOUNT_ID,
      STRIPE_MERCHANT_RETRIEVE_PARAMS,
    );
    expect(stripeMocks.accountLinkCreate).toHaveBeenCalledWith(
      expect.objectContaining({ account: MERCHANT_ACCOUNT_ID }),
    );
  });

  it('rejects malformed workspace, account, email, and redirect inputs before Stripe is called', async () => {
    expect(() => buildMerchantAccountCreateCall({
      workspaceId: 'not-a-uuid',
      businessName: 'Roofing',
      contactEmail: 'owner@example.test',
    })).toThrow(/workspaceId/);
    expect(() => buildMerchantAccountCreateCall({
      workspaceId: WORKSPACE_ID,
      businessName: 'Roofing',
      contactEmail: 'not-an-email',
    })).toThrow(/contactEmail/);
    await expect(retrieveMerchantAccountForReadiness('acct_short')).rejects.toThrow(/valid Stripe acct_ ID/);
    expect(stripeMocks.accountRetrieve).not.toHaveBeenCalled();
  });
});

describe('Merchant readiness evidence', () => {
  it('marks only the complete, freshly evidenced Merchant configuration ready', () => {
    const response = merchantResponse();
    const evidence = inspectMerchantReadiness(response, MERCHANT_ACCOUNT_ID, { now: VERIFIED_AT });
    const update = buildMerchantReadinessDatabaseUpdate(evidence);

    expect(evidence).toMatchObject({
      accountId: MERCHANT_ACCOUNT_ID,
      livemode: true,
      dashboardType: 'full',
      cardPaymentsActive: true,
      usBankAccountPaymentsActive: true,
      payoutsActive: true,
      feesCollector: 'stripe',
      lossesCollector: 'stripe',
      apiVersion: STRIPE_API_VERSION,
      verifiedAt: VERIFIED_AT.toISOString(),
      onboardingState: 'ready',
      ready: true,
      issues: [],
    });
    expect(evidence.snapshotSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(hashMerchantReadinessSnapshot(evidence.snapshot)).toBe(evidence.snapshotSha256);
    expect(update).toMatchObject({
      merchant_onboarding_state: 'ready',
      merchant_requirements_checked_at: VERIFIED_AT.toISOString(),
      merchant_ready_at: VERIFIED_AT.toISOString(),
      merchant_disabled_at: null,
      merchant_configuration_api_version: STRIPE_API_VERSION,
      merchant_configuration_snapshot_sha256: evidence.snapshotSha256,
      merchant_configuration_verified_at: VERIFIED_AT.toISOString(),
    });

    const serialized = JSON.stringify(evidence.snapshot);
    expect(serialized).not.toContain('private-contractor@example.test');
    expect(serialized).not.toContain('secret_internal_note');
    expect(serialized).not.toContain('identity.business_details.address');
  });

  it('keeps pending capabilities pending but treats configuration/evidence defects as restricted', () => {
    const pending = inspectMerchantReadiness(
      merchantResponse({ cardStatus: 'pending', payoutsStatus: 'pending' }),
      MERCHANT_ACCOUNT_ID,
      { now: VERIFIED_AT },
    );
    expect(pending.ready).toBe(false);
    expect(pending.onboardingState).toBe('pending');
    expect(pending.issues).toEqual(['card_payments_not_active', 'payouts_not_active']);

    const unsafe = inspectMerchantReadiness(
      merchantResponse({
        dashboard: 'express',
        cardStatus: 'active',
        payoutsStatus: 'active',
        feesCollector: 'application',
        lossesCollector: 'application',
        requirementsCollector: 'application',
      }),
      MERCHANT_ACCOUNT_ID,
      { now: VERIFIED_AT },
    );
    expect(unsafe.ready).toBe(false);
    expect(unsafe.onboardingState).toBe('restricted');
    expect(unsafe.issues).toEqual(expect.arrayContaining([
      'dashboard_not_full',
      'fees_collector_not_stripe',
      'losses_collector_not_stripe',
      'requirements_collector_not_stripe',
    ]));
  });

  it('fails readiness closed on stale semantics, missing response evidence, and past-due requirements', () => {
    const wrongVersion = inspectMerchantReadiness(
      merchantResponse({ apiVersion: '2026-02-25.clover' }),
      MERCHANT_ACCOUNT_ID,
      { now: VERIFIED_AT },
    );
    expect(wrongVersion.ready).toBe(false);
    expect(wrongVersion.issues).toContain('api_version_mismatch');

    const missingEvidence = inspectMerchantReadiness(
      merchantResponse({ apiVersion: null, requestId: null, includeRequirements: false }),
      MERCHANT_ACCOUNT_ID,
      { now: VERIFIED_AT },
    );
    expect(missingEvidence.ready).toBe(false);
    expect(missingEvidence.issues).toEqual(expect.arrayContaining([
      'requirements_not_included',
      'api_version_missing',
      'stripe_request_id_missing',
    ]));
    expect(buildMerchantReadinessDatabaseUpdate(missingEvidence).merchant_configuration_api_version).toBeNull();

    const pastDue = inspectMerchantReadiness(
      merchantResponse({ requirementsStatus: 'past_due' }),
      MERCHANT_ACCOUNT_ID,
      { now: VERIFIED_AT },
    );
    expect(pastDue.ready).toBe(false);
    expect(pastDue.onboardingState).toBe('restricted');
    expect(pastDue.issues).toContain('requirements_past_due');
  });

  it('rejects a response for a different Merchant instead of recording it', () => {
    expect(() => inspectMerchantReadiness(
      merchantResponse({ accountId: 'acct_different999' }),
      MERCHANT_ACCOUNT_ID,
      { now: VERIFIED_AT },
    )).toThrow(/different Merchant account/);
  });
});

describe('dark-launched Merchant orchestration', () => {
  it('claims, submits, creates, and atomically completes in order', async () => {
    const harness = provisioningHarness();
    const result = await provisionMerchantAccount(UNUSED_ADMIN, {
      workspaceId: WORKSPACE_ID,
      businessName: 'North Star Roofing',
      contactEmail: 'owner@example.test',
    }, { now: VERIFIED_AT }, harness.dependencies);

    expect(result).toMatchObject({ accountId: MERCHANT_ACCOUNT_ID, created: true });
    expect(result.evidence?.onboardingState).toBe('pending');
    expect(harness.events).toEqual(['claim', 'begin', 'stripe', 'complete']);
    expect(harness.getState()).toBe('succeeded');
    expect(harness.getProviderAccountId()).toBe(MERCHANT_ACCOUNT_ID);
    expect(harness.store.claim).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: WORKSPACE_ID,
      livemode: false,
      stripeIdempotencyKey: expect.stringMatching(/^lgq:merchant:v1:account\.create:[a-f0-9]{64}$/),
      requestFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
    }));
    expect(harness.store.complete).toHaveBeenCalledWith(expect.objectContaining({
      operationPk: OPERATION_PK,
      claimToken: CLAIM_TOKEN,
      providerAccountId: MERCHANT_ACCOUNT_ID,
      evidence: expect.objectContaining({
        merchant_onboarding_state: 'pending',
        merchant_livemode: false,
        merchant_fees_collector: 'stripe',
        merchant_losses_collector: 'stripe',
      }),
    }));
    const createCall = harness.createAccount.mock.calls[0]?.[0];
    expect(createCall?.options).not.toHaveProperty('stripeAccount');
    expect(createCall?.options).not.toHaveProperty('stripeContext');
  });

  it('never creates again when Stripe succeeded but database completion failed', async () => {
    const completionError = new Error('completion response lost');
    const harness = provisioningHarness({ completionError });
    const input = {
      workspaceId: WORKSPACE_ID,
      businessName: 'North Star Roofing',
      contactEmail: 'owner@example.test',
    };

    await expect(provisionMerchantAccount(
      UNUSED_ADMIN,
      input,
      { now: VERIFIED_AT },
      harness.dependencies,
    )).rejects.toBeInstanceOf(MerchantProvisioningPersistenceError);
    expect(harness.getState()).toBe('submitted');
    expect(harness.createAccount).toHaveBeenCalledTimes(1);

    await expect(provisionMerchantAccount(
      UNUSED_ADMIN,
      input,
      { now: VERIFIED_AT },
      harness.dependencies,
    )).rejects.toBeInstanceOf(MerchantProvisioningUnavailableError);
    expect(harness.createAccount).toHaveBeenCalledTimes(1);
    expect(harness.events).toEqual(['claim', 'begin', 'stripe', 'complete', 'claim']);
  });

  it('records a lost provider result as indeterminate and blocks replay', async () => {
    const harness = provisioningHarness({ providerError: new Error('socket closed after write') });
    const input = {
      workspaceId: WORKSPACE_ID,
      businessName: 'North Star Roofing',
      contactEmail: 'owner@example.test',
    };

    await expect(provisionMerchantAccount(
      UNUSED_ADMIN,
      input,
      { now: VERIFIED_AT },
      harness.dependencies,
    )).rejects.toBeInstanceOf(MerchantProvisioningIndeterminateError);
    expect(harness.getState()).toBe('indeterminate');
    expect(harness.store.markIndeterminate).toHaveBeenCalledWith(expect.objectContaining({
      providerAccountId: null,
      error: expect.stringContaining('socket closed after write'),
    }));

    await expect(provisionMerchantAccount(
      UNUSED_ADMIN,
      input,
      { now: VERIFIED_AT },
      harness.dependencies,
    )).rejects.toBeInstanceOf(MerchantProvisioningUnavailableError);
    expect(harness.createAccount).toHaveBeenCalledTimes(1);
  });

  it('rejects changed create input under the immutable workspace operation', async () => {
    const harness = provisioningHarness();
    const original = {
      workspaceId: WORKSPACE_ID,
      businessName: 'North Star Roofing',
      contactEmail: 'owner@example.test',
    };
    const changed = { ...original, businessName: 'North Star Roofing LLC' };

    const originalCall = buildMerchantAccountCreateCall(original);
    const changedCall = buildMerchantAccountCreateCall(changed);
    expect(changedCall.options.idempotencyKey).toBe(originalCall.options.idempotencyKey);
    expect(changedCall.requestFingerprint).not.toBe(originalCall.requestFingerprint);

    await provisionMerchantAccount(
      UNUSED_ADMIN,
      original,
      { now: VERIFIED_AT },
      harness.dependencies,
    );
    await expect(provisionMerchantAccount(
      UNUSED_ADMIN,
      changed,
      { now: VERIFIED_AT },
      harness.dependencies,
    )).rejects.toThrow(/different immutable input/);
    expect(harness.createAccount).toHaveBeenCalledTimes(1);
  });

  it('replays a completed workspace operation without contacting Stripe', async () => {
    const harness = provisioningHarness({
      initialState: 'succeeded',
      providerAccountId: MERCHANT_ACCOUNT_ID,
    });
    const result = await provisionMerchantAccount(UNUSED_ADMIN, {
      workspaceId: WORKSPACE_ID,
      businessName: 'North Star Roofing',
      contactEmail: 'owner@example.test',
    }, {}, harness.dependencies);

    expect(result).toEqual({ accountId: MERCHANT_ACCOUNT_ID, created: false, evidence: null });
    expect(harness.events).toEqual(['claim']);
    expect(harness.createAccount).not.toHaveBeenCalled();
  });

  it('marks cross-workspace and missing provider metadata for recovery before mapping', async () => {
    const crossWorkspace = provisioningHarness({
      response: merchantResponse({
        cardStatus: 'pending',
        payoutsStatus: 'pending',
        livemode: false,
        metadata: {
          lgq_workspace_id: OTHER_WORKSPACE_ID,
          lgq_configuration: STRIPE_MERCHANT_CONFIGURATION_VERSION,
        },
      }),
    });
    const missingMetadata = provisioningHarness({
      response: merchantResponse({
        cardStatus: 'pending',
        payoutsStatus: 'pending',
        livemode: false,
        metadata: {},
      }),
    });
    const input = {
      workspaceId: WORKSPACE_ID,
      businessName: 'North Star Roofing',
      contactEmail: 'owner@example.test',
    };

    for (const harness of [crossWorkspace, missingMetadata]) {
      const rejection = await provisionMerchantAccount(
        UNUSED_ADMIN,
        input,
        { now: VERIFIED_AT },
        harness.dependencies,
      ).catch((error: unknown) => error);
      expect(rejection).toBeInstanceOf(MerchantProvisioningIndeterminateError);
      expect((rejection as MerchantProvisioningIndeterminateError).providerError).toMatchObject({
        message: expect.stringMatching(/metadata does not match/),
      });
      expect(harness.getState()).toBe('indeterminate');
      expect(harness.getProviderAccountId()).toBe(MERCHANT_ACCOUNT_ID);
      expect(harness.store.complete).not.toHaveBeenCalled();
    }
  });

  it('binds completion to the claimed operation instead of accepting a workspace ID', async () => {
    const rpc = vi.fn(async (_name: string, _args: Record<string, unknown>) => ({ data: true, error: null }));
    const store = new SupabaseMerchantProvisioningOperationStore({ rpc } as unknown as SupabaseClient);
    const evidence = inspectMerchantReadiness(merchantResponse({ livemode: false }), MERCHANT_ACCOUNT_ID, {
      now: VERIFIED_AT,
    });
    await store.complete({
      operationPk: OPERATION_PK,
      claimToken: CLAIM_TOKEN,
      providerAccountId: MERCHANT_ACCOUNT_ID,
      evidence: buildMerchantReadinessDatabaseUpdate(evidence),
    });

    expect(rpc).toHaveBeenCalledWith('complete_stripe_merchant_provisioning_operation', expect.objectContaining({
      p_operation_pk: OPERATION_PK,
      p_claim_token: CLAIM_TOKEN,
      p_provider_account_id: MERCHANT_ACCOUNT_ID,
    }));
    expect(rpc.mock.calls[0]?.[1]).not.toHaveProperty('p_workspace_id');
  });

  it('retrieves fresh Stripe evidence and updates only the matching workspace mapping', async () => {
    const fake = fakeAdmin(MERCHANT_ACCOUNT_ID);
    const evidence = await verifyAndPersistMerchantReadiness(fake.admin, WORKSPACE_ID, { now: VERIFIED_AT });

    expect(evidence.ready).toBe(true);
    expect(stripeMocks.accountRetrieve).toHaveBeenCalledWith(
      MERCHANT_ACCOUNT_ID,
      STRIPE_MERCHANT_RETRIEVE_PARAMS,
    );
    expect(fake.row.merchant_onboarding_state).toBe('ready');
    expect(fake.row.merchant_livemode).toBe(true);
    expect(fake.row.merchant_dashboard_type).toBe('full');
    expect(fake.row.merchant_card_payments_active).toBe(true);
    expect(fake.row.merchant_payouts_active).toBe(true);
    expect(fake.row.merchant_fees_collector).toBe('stripe');
    expect(fake.row.merchant_losses_collector).toBe('stripe');
    expect(fake.row.merchant_configuration_api_version).toBe(STRIPE_API_VERSION);
    expect(fake.rpc).toHaveBeenCalledWith('persist_stripe_merchant_readiness_evidence', {
      p_workspace_id: WORKSPACE_ID,
      p_provider_account_id: MERCHANT_ACCOUNT_ID,
      p_expected_livemode: true,
      p_evidence: expect.objectContaining({
        merchant_onboarding_state: 'ready',
        merchant_configuration_verified_at: VERIFIED_AT.toISOString(),
      }),
    });
    expect(fake.updates[0]).not.toHaveProperty('stripe_connect_id');
    expect(fake.updates[0]).not.toHaveProperty('connect_onboarded');
  });

  it('rejects stale ready evidence after newer disabled evidence wins the row lock', async () => {
    const olderAt = new Date(VERIFIED_AT.getTime() - 1_000);
    const newerAt = new Date(VERIFIED_AT.getTime() + 1_000);
    const olderReady = inspectMerchantReadiness(
      merchantResponse(),
      MERCHANT_ACCOUNT_ID,
      { now: olderAt },
    );
    const newerDisabled = inspectMerchantReadiness(
      merchantResponse({ closed: true }),
      MERCHANT_ACCOUNT_ID,
      { now: newerAt },
    );
    const fake = fakeAdmin(MERCHANT_ACCOUNT_ID);

    const [newerResult, olderResult] = await Promise.allSettled([
      persistMerchantReadinessEvidence(fake.admin, WORKSPACE_ID, newerDisabled),
      persistMerchantReadinessEvidence(fake.admin, WORKSPACE_ID, olderReady),
    ]);

    expect(newerResult.status).toBe('fulfilled');
    expect(olderResult.status).toBe('rejected');
    if (olderResult.status !== 'rejected') throw new Error('expected stale persistence to reject');
    expect(olderResult.reason).toBeInstanceOf(MerchantReadinessStaleWriteError);
    expect(fake.row.merchant_onboarding_state).toBe('disabled');
    expect(fake.row.merchant_configuration_verified_at).toBe(newerAt.toISOString());
    expect(fake.updates).toHaveLength(1);
  });

  it('converges on newer restricted evidence when the older ready write locks first', async () => {
    const olderAt = new Date(VERIFIED_AT.getTime() - 1_000);
    const newerAt = new Date(VERIFIED_AT.getTime() + 1_000);
    const olderReady = inspectMerchantReadiness(
      merchantResponse(),
      MERCHANT_ACCOUNT_ID,
      { now: olderAt },
    );
    const newerRestricted = inspectMerchantReadiness(
      merchantResponse({ lossesCollector: 'application' }),
      MERCHANT_ACCOUNT_ID,
      { now: newerAt },
    );
    const fake = fakeAdmin(MERCHANT_ACCOUNT_ID);

    const results = await Promise.allSettled([
      persistMerchantReadinessEvidence(fake.admin, WORKSPACE_ID, olderReady),
      persistMerchantReadinessEvidence(fake.admin, WORKSPACE_ID, newerRestricted),
    ]);

    expect(results.every((result) => result.status === 'fulfilled')).toBe(true);
    expect(fake.row.merchant_onboarding_state).toBe('restricted');
    expect(fake.row.merchant_configuration_verified_at).toBe(newerAt.toISOString());
    expect(fake.updates.map((update) => update.merchant_onboarding_state)).toEqual(['ready', 'restricted']);
  });

  it('treats an equal verification timestamp as a stale replay', async () => {
    const evidence = inspectMerchantReadiness(
      merchantResponse(),
      MERCHANT_ACCOUNT_ID,
      { now: VERIFIED_AT },
    );
    const fake = fakeAdmin(MERCHANT_ACCOUNT_ID);

    await persistMerchantReadinessEvidence(fake.admin, WORKSPACE_ID, evidence);
    await expect(persistMerchantReadinessEvidence(fake.admin, WORKSPACE_ID, evidence))
      .rejects.toBeInstanceOf(MerchantReadinessStaleWriteError);

    expect(fake.row.merchant_onboarding_state).toBe('ready');
    expect(fake.row.merchant_configuration_verified_at).toBe(VERIFIED_AT.toISOString());
    expect(fake.updates).toHaveLength(1);
  });

  it('fails closed when workspace, provider account, or livemode binding changed', async () => {
    const evidence = inspectMerchantReadiness(
      merchantResponse(),
      MERCHANT_ACCOUNT_ID,
      { now: VERIFIED_AT },
    );

    for (const mutate of [
      (row: FakeAccountRow) => { row.id = OTHER_WORKSPACE_ID; },
      (row: FakeAccountRow) => { row.stripe_merchant_account_id = 'acct_othermerchant123'; },
      (row: FakeAccountRow) => { row.merchant_livemode = false; },
    ]) {
      const fake = fakeAdmin(MERCHANT_ACCOUNT_ID);
      mutate(fake.row);
      await expect(persistMerchantReadinessEvidence(fake.admin, WORKSPACE_ID, evidence))
        .rejects.toThrow(/workspace mapping mismatch/);
      expect(fake.updates).toHaveLength(0);
    }
  });
});
