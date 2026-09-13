import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  redirect: vi.fn((path: string) => {
    const err = new Error(`NEXT_REDIRECT:${path}`);
    (err as unknown as { digest: string }).digest = `NEXT_REDIRECT;replace;${path};307;;`;
    throw err;
  }),
  revalidatePath: vi.fn(),
  requireMfaPermission: vi.fn(),
  logAdminAction: vi.fn(),
  searchVoiceNumberCandidates: vi.fn(),
  recordVoiceNumberCandidateObservation: vi.fn(),
  setVoiceNumberPurchasePolicy: vi.fn(),
  loadVoiceNumberPurchasePolicy: vi.fn(),
  authorizeVoiceNumberPurchase: vi.fn(),
  purchaseVoiceNumber: vi.fn(),
  configureVoiceNumberInbound: vi.fn(),
  releaseVoiceNumber: vi.fn(),
  retryFailedVoiceNumberOperation: vi.fn(),
  resolveIndeterminateVoiceNumberOperation: vi.fn(),
  requireVoiceNumberRecoveryEnabled: vi.fn(),
  requireVoiceNumberProvisioningMutationEnabled: vi.fn(),
}));

vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock('@/lib/auth', () => ({ requireMfaPermission: mocks.requireMfaPermission }));
vi.mock('@/lib/admin', () => ({ logAdminAction: mocks.logAdminAction }));
vi.mock('@/lib/voice/number-provisioning', () => ({
  searchVoiceNumberCandidates: mocks.searchVoiceNumberCandidates,
  recordVoiceNumberCandidateObservation: mocks.recordVoiceNumberCandidateObservation,
  setVoiceNumberPurchasePolicy: mocks.setVoiceNumberPurchasePolicy,
  loadVoiceNumberPurchasePolicy: mocks.loadVoiceNumberPurchasePolicy,
  authorizeVoiceNumberPurchase: mocks.authorizeVoiceNumberPurchase,
  purchaseVoiceNumber: mocks.purchaseVoiceNumber,
  configureVoiceNumberInbound: mocks.configureVoiceNumberInbound,
  releaseVoiceNumber: mocks.releaseVoiceNumber,
  retryFailedVoiceNumberOperation: mocks.retryFailedVoiceNumberOperation,
  resolveIndeterminateVoiceNumberOperation: mocks.resolveIndeterminateVoiceNumberOperation,
  requireVoiceNumberRecoveryEnabled: mocks.requireVoiceNumberRecoveryEnabled,
  requireVoiceNumberProvisioningMutationEnabled: mocks.requireVoiceNumberProvisioningMutationEnabled,
  voiceNumberPurchaseConfirmation: (number: string) => `PURCHASE ${number}`,
}));

import {
  searchVoiceNumberCandidateAction,
  recordVoiceNumberCandidateObservationAction,
  setVoiceNumberSpendPolicyAction,
  authorizeVoiceNumberPurchaseAction,
  purchaseVoiceNumberAction,
  configureVoiceNumberAction,
  releaseVoiceNumberAction,
  retryVoiceNumberOperationAction,
  reconcileVoiceNumberAction,
} from '@/app/admin/voice/numbers/actions';

describe('Server Actions: Voice Number Provisioning', () => {
  const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
  const OBSERVATION_ID = '22222222-2222-4222-8222-222222222222';
  const AUTHORIZATION_ID = '33333333-3333-4333-8333-333333333333';
  const INVENTORY_ID = '44444444-4444-4444-8444-444444444444';
  const PROVIDER_OBJ_ID = '55555555-5555-4555-8555-555555555555';
  const OPERATION_ID = '66666666-6666-4666-8666-666666666666';

  let fakeAdmin: any;

  beforeEach(() => {
    vi.clearAllMocks();
    fakeAdmin = {
      from: vi.fn(),
    };
    mocks.requireMfaPermission.mockResolvedValue({
      admin: fakeAdmin,
      adminEmail: 'ops@letsgetquoted.test',
      staff: { id: 'staff-1' },
      permission: 'ops.manage',
    });
    // Default account query response
    fakeAdmin.from.mockImplementation((table: string) => {
      if (table === 'accounts') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: ACCOUNT_ID, business_name: 'Super Plumber' },
                error: null,
              }),
            }),
          }),
        };
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
    });
  });

  describe('searchVoiceNumberCandidateAction', () => {
    it('searches SignalWire candidates and logs action on success', async () => {
      mocks.searchVoiceNumberCandidates.mockResolvedValue([
        { number: '+15125550100', capabilities: { voice: true } },
      ]);

      const form = new FormData();
      form.set('accountId', ACCOUNT_ID);
      form.set('areaCode', '512');
      form.set('region', 'TX');

      await expect(searchVoiceNumberCandidateAction(form)).rejects.toThrow(
        `NEXT_REDIRECT:/admin/voice/numbers?account=${ACCOUNT_ID}&done=candidate&area=512&region=TX&candidate=%2B15125550100`,
      );

      expect(mocks.searchVoiceNumberCandidates).toHaveBeenCalledWith({
        areaCode: '512',
        region: 'TX',
        maxResults: 10,
      });
      expect(mocks.logAdminAction).toHaveBeenCalled();
    });

    it('fails with redirect when market area code is invalid', async () => {
      const form = new FormData();
      form.set('accountId', ACCOUNT_ID);
      form.set('areaCode', '12'); // invalid area code
      form.set('region', 'TX');

      await expect(searchVoiceNumberCandidateAction(form)).rejects.toThrow(
        /NEXT_REDIRECT:\/admin\/voice\/numbers\?error=1/,
      );
    });
  });

  describe('recordVoiceNumberCandidateObservationAction', () => {
    it('verifies confirmation and records candidate price observation', async () => {
      const number = '+15125550100';
      const form = new FormData();
      form.set('accountId', ACCOUNT_ID);
      form.set('candidateNumber', number);
      form.set('areaCode', '512');
      form.set('region', 'TX');
      form.set('monthlyPriceCents', '150');
      form.set('confirmation', 'I CHECKED SIGNALWIRE DASHBOARD +15125550100 USD 1.50/MO');

      mocks.searchVoiceNumberCandidates.mockResolvedValue([
        { number: '+15125550100', capabilities: { voice: true } },
      ]);
      mocks.recordVoiceNumberCandidateObservation.mockResolvedValue({
        id: OBSERVATION_ID,
        number,
        searchFingerprint: 'sig-123',
        monthlyPriceCents: 150,
        policyRevision: 1,
        priceEvidenceSource: 'operator',
        observedAt: '2026-09-12T00:00:00Z',
        expiresAt: '2026-09-12T01:00:00Z',
      });

      await expect(recordVoiceNumberCandidateObservationAction(form)).rejects.toThrow(
        /done=observed/,
      );

      expect(mocks.recordVoiceNumberCandidateObservation).toHaveBeenCalledWith({
        candidate: expect.objectContaining({ number: '+15125550100' }),
        monthlyPriceCents: 150,
        actorReference: 'ops@letsgetquoted.test',
        admin: fakeAdmin,
      });
      expect(mocks.revalidatePath).toHaveBeenCalledWith('/admin/voice/numbers');
    });

    it('fails when confirmation text mismatches', async () => {
      const form = new FormData();
      form.set('accountId', ACCOUNT_ID);
      form.set('candidateNumber', '+15125550100');
      form.set('areaCode', '512');
      form.set('region', 'TX');
      form.set('monthlyPriceCents', '150');
      form.set('confirmation', 'WRONG CONFIRMATION');

      await expect(recordVoiceNumberCandidateObservationAction(form)).rejects.toThrow(
        /error=1/,
      );
    });
  });

  describe('setVoiceNumberSpendPolicyAction', () => {
    it('updates unit price and monthly ceiling with exact confirmation', async () => {
      const form = new FormData();
      form.set('accountId', ACCOUNT_ID);
      form.set('monthlyPriceCents', '200');
      form.set('monthlySpendCeilingCents', '1000');
      form.set('purchaseEnabled', 'yes');
      form.set('confirmation', 'SET VOICE POLICY USD 2.00/MO LIMIT USD 10.00/MO ENABLED');

      mocks.setVoiceNumberPurchasePolicy.mockResolvedValue({
        provider: 'signalwire',
        revision: 2,
        purchaseEnabled: true,
        monthlyPriceCents: 200,
        monthlySpendCeilingCents: 1000,
      });

      await expect(setVoiceNumberSpendPolicyAction(form)).rejects.toThrow(/done=policy/);
      expect(mocks.setVoiceNumberPurchasePolicy).toHaveBeenCalledWith({
        monthlyPriceCents: 200,
        monthlySpendCeilingCents: 1000,
        purchaseEnabled: true,
        actorReference: 'ops@letsgetquoted.test',
        admin: fakeAdmin,
      });
    });

    it('rejects policy when ceiling is less than unit price', async () => {
      const form = new FormData();
      form.set('accountId', ACCOUNT_ID);
      form.set('monthlyPriceCents', '500');
      form.set('monthlySpendCeilingCents', '200'); // ceiling < price

      await expect(setVoiceNumberSpendPolicyAction(form)).rejects.toThrow(/error=1/);
    });
  });

  describe('authorizeVoiceNumberPurchaseAction & purchaseVoiceNumberAction', () => {
    it('authorizes purchase of an observed candidate number', async () => {
      const form = new FormData();
      form.set('accountId', ACCOUNT_ID);
      form.set('candidateNumber', '+15125550100');
      form.set('candidateObservationId', OBSERVATION_ID);
      form.set('confirmation', 'YES I AUTHORIZE');

      mocks.authorizeVoiceNumberPurchase.mockResolvedValue({
        id: AUTHORIZATION_ID,
        number: '+15125550100',
        candidateObservationId: OBSERVATION_ID,
        policyRevision: 1,
        monthlyPriceCents: 150,
        monthlySpendCeilingCents: 500,
        priceEvidenceSource: 'operator',
        priceObservedAt: '2026-09-12T00:00:00Z',
        expiresAt: '2026-09-12T01:00:00Z',
      });

      await expect(authorizeVoiceNumberPurchaseAction(form)).rejects.toThrow(/done=authorized/);
      expect(mocks.authorizeVoiceNumberPurchase).toHaveBeenCalledWith(
        expect.objectContaining({
          accountId: ACCOUNT_ID,
          number: '+15125550100',
          candidateObservationId: OBSERVATION_ID,
        }),
      );
    });

    it('purchases number when policy is active and confirmation matches', async () => {
      mocks.loadVoiceNumberPurchasePolicy.mockResolvedValue({
        revision: 1,
        purchaseEnabled: true,
        monthlyPriceCents: 150,
        monthlySpendCeilingCents: 500,
      });
      mocks.purchaseVoiceNumber.mockResolvedValue({
        providerObjectId: PROVIDER_OBJ_ID,
        replay: false,
      });

      const form = new FormData();
      form.set('accountId', ACCOUNT_ID);
      form.set('authorizationId', AUTHORIZATION_ID);
      form.set('candidateNumber', '+15125550100');
      form.set('confirmation', 'PURCHASE +15125550100');

      await expect(purchaseVoiceNumberAction(form)).rejects.toThrow(/done=purchased/);
      expect(mocks.purchaseVoiceNumber).toHaveBeenCalledWith({
        accountId: ACCOUNT_ID,
        number: '+15125550100',
        authorizationId: AUTHORIZATION_ID,
        purchasePolicy: expect.objectContaining({ purchaseEnabled: true }),
      });
    });
  });

  describe('configureVoiceNumberAction & releaseVoiceNumberAction', () => {
    it('configures inbound routes for an active inventory item', async () => {
      fakeAdmin.from.mockImplementation((table: string) => {
        if (table === 'accounts') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { id: ACCOUNT_ID, business_name: 'Super Plumber' },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === 'voice_number_inventory') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: {
                      id: INVENTORY_ID,
                      account_id: ACCOUNT_ID,
                      provider_number_id: PROVIDER_OBJ_ID,
                      e164_number: '+15125550100',
                      lifecycle_state: 'active',
                    },
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }
      });

      mocks.configureVoiceNumberInbound.mockResolvedValue({
        providerObjectId: PROVIDER_OBJ_ID,
        replay: false,
      });

      const form = new FormData();
      form.set('accountId', ACCOUNT_ID);
      form.set('inventoryId', INVENTORY_ID);
      form.set('confirmation', 'CONFIGURE +15125550100 FOR AI VOICE');

      await expect(configureVoiceNumberAction(form)).rejects.toThrow(/done=configured/);
      expect(mocks.configureVoiceNumberInbound).toHaveBeenCalledWith({
        accountId: ACCOUNT_ID,
        voiceNumberId: INVENTORY_ID,
        providerNumberId: PROVIDER_OBJ_ID,
        number: '+15125550100',
        friendlyName: 'LGQ Super Plumber AI Voice',
      });
    });

    it('releases an inventory number cleanly', async () => {
      fakeAdmin.from.mockImplementation((table: string) => {
        if (table === 'accounts') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { id: ACCOUNT_ID, business_name: 'Super Plumber' },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === 'voice_number_inventory') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: {
                      id: INVENTORY_ID,
                      account_id: ACCOUNT_ID,
                      provider_number_id: PROVIDER_OBJ_ID,
                      e164_number: '+15125550100',
                      lifecycle_state: 'active',
                    },
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }
      });

      mocks.releaseVoiceNumber.mockResolvedValue({
        providerObjectId: PROVIDER_OBJ_ID,
        replay: false,
      });

      const form = new FormData();
      form.set('accountId', ACCOUNT_ID);
      form.set('inventoryId', INVENTORY_ID);
      form.set('confirmation', 'RELEASE +15125550100');

      await expect(releaseVoiceNumberAction(form)).rejects.toThrow(/done=released/);
      expect(mocks.releaseVoiceNumber).toHaveBeenCalledWith({
        accountId: ACCOUNT_ID,
        voiceNumberId: INVENTORY_ID,
        providerNumberId: PROVIDER_OBJ_ID,
        number: '+15125550100',
      });
    });
  });

  describe('retryVoiceNumberOperationAction & reconcileVoiceNumberAction', () => {
    it('retries a failed configuration operation', async () => {
      fakeAdmin.from.mockImplementation((table: string) => {
        if (table === 'accounts') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { id: ACCOUNT_ID, business_name: 'Super Plumber' },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === 'voice_number_provisioning_operations') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: {
                      id: OPERATION_ID,
                      account_id: ACCOUNT_ID,
                      operation_type: 'configure_voice',
                      state: 'failed',
                      request_payload: { number: '+15125550100' },
                    },
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }
      });

      mocks.retryFailedVoiceNumberOperation.mockResolvedValue({
        retryAuthorizationId: 'retry-auth-1',
        retryGeneration: 2,
        providerObjectId: PROVIDER_OBJ_ID,
        replay: false,
      });

      const form = new FormData();
      form.set('accountId', ACCOUNT_ID);
      form.set('operationId', OPERATION_ID);
      form.set('confirmation', `RETRY CONFIGURE +15125550100 AFTER ${OPERATION_ID}`);

      await expect(retryVoiceNumberOperationAction(form)).rejects.toThrow(/done=retried/);
      expect(mocks.retryFailedVoiceNumberOperation).toHaveBeenCalledWith({
        accountId: ACCOUNT_ID,
        failedOperationId: OPERATION_ID,
        actorReference: 'ops@letsgetquoted.test',
        reason: `RETRY CONFIGURE +15125550100 AFTER ${OPERATION_ID}`,
        admin: fakeAdmin,
      });
    });

    it('reconciles indeterminate provider operations', async () => {
      mocks.resolveIndeterminateVoiceNumberOperation.mockResolvedValue(undefined);

      const form = new FormData();
      form.set('accountId', ACCOUNT_ID);
      form.set('operationId', OPERATION_ID);
      form.set('resolution', 'confirmed_succeeded');
      form.set('confirmation', `RECONCILE ${OPERATION_ID} CLEANUP AND IMPORT`);

      await expect(reconcileVoiceNumberAction(form)).rejects.toThrow(/done=reconciled/);
      expect(mocks.resolveIndeterminateVoiceNumberOperation).toHaveBeenCalledWith({
        accountId: ACCOUNT_ID,
        operationId: OPERATION_ID,
        resolution: 'confirmed_succeeded',
        actorReference: 'ops@letsgetquoted.test',
        admin: fakeAdmin,
      });
    });
  });
});
