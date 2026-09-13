import { describe, expect, it, vi } from 'vitest';

import {
  SupabaseSmsDeliveryStore,
  ProviderSmsDeliveryMessenger,
  classifySmsDeliveryFailure,
  SmsDeliveryRpcError,
  SmsDeliveryWorkerError,
  runSmsDeliveryBatch,
} from '@/lib/sms-delivery-worker';
import { SmsBillingRefusalError } from '@/lib/sms-provider';

vi.mock('@/lib/auth', () => ({
  createAdminClient: vi.fn(() => ({
    rpc: vi.fn(),
  })),
}));

vi.mock('@/lib/quote-followup-delivery', () => ({
  quoteFollowupDeliveryEligibility: vi.fn(),
}));

vi.mock('@/lib/sms-provider', () => ({
  sendProviderMessage: vi.fn(),
  SmsBillingRefusalError: class SmsBillingRefusalError extends Error {},
  SmsProviderRejectedError: class SmsProviderRejectedError extends Error {
    constructor(public status: number, public message: string, public retryable: boolean) {
      super(message);
    }
  },
  smsProviderConfig: vi.fn(() => ({ id: 'signalwire' })),
  outboundSmsSuppression: vi.fn(() => null),
  smsCanaryAccounts: () => new Set(),
  smsSenderPurposeEnabled: vi.fn(() => true),
}));

describe('sms-delivery-worker coverage', () => {
  describe('runSmsDeliveryBatch validation', () => {
    it('throws if batchSize is invalid', async () => {
      await expect(runSmsDeliveryBatch(0)).rejects.toThrow('batch size must be between 1 and 25');
      await expect(runSmsDeliveryBatch(26)).rejects.toThrow('batch size must be between 1 and 25');
      await expect(runSmsDeliveryBatch(1.5)).rejects.toThrow('batch size must be between 1 and 25');
    });
  });

  describe('SmsDeliveryRpcError formatting', () => {
    it('formats error message correctly', () => {
      expect(new SmsDeliveryRpcError(null).message).toBe('SMS delivery database operation failed');
      expect(new SmsDeliveryRpcError('P0001').message).toBe('SMS delivery database operation failed (P0001)');
      expect(new SmsDeliveryRpcError('P0001', 'some details').message).toBe('SMS delivery database operation failed (P0001): some details');
      expect(new SmsDeliveryRpcError(null, 'some details').message).toBe('SMS delivery database operation failed: some details');
    });
  });

  describe('classifySmsDeliveryFailure', () => {
    it('handles worker errors directly', () => {
      const err = new SmsDeliveryWorkerError('custom_error', true);
      expect(classifySmsDeliveryFailure(err)).toEqual({
        code: 'custom_error',
        retryable: true,
        providerRejection: false,
      });
    });

    it('handles database contract errors', () => {
      const err = new SmsDeliveryRpcError('UNKNOWN');
      expect(classifySmsDeliveryFailure(err)).toEqual({
        code: 'sms_worker_database_contract',
        retryable: false,
        providerRejection: false,
      });
    });

    it('handles DOMException AbortError', () => {
      const err = new DOMException('aborted', 'AbortError');
      expect(classifySmsDeliveryFailure(err)).toEqual({
        code: 'sms_provider_transport_error',
        retryable: true,
        providerRejection: false,
      });
    });

    it('handles internal errors', () => {
      const err = new Error('random error');
      expect(classifySmsDeliveryFailure(err)).toEqual({
        code: 'sms_worker_internal_error',
        retryable: true,
        providerRejection: false,
      });
    });
  });

  describe('SupabaseSmsDeliveryStore validation & parsing', () => {
    const getAdmin = (rpcMock: any) => ({ rpc: rpcMock } as any);

    it('throws if claimBatch size is invalid', async () => {
      const store = new SupabaseSmsDeliveryStore(getAdmin(vi.fn()));
      await expect(store.claimBatch(0)).rejects.toThrow('batch size must be between 1 and 25');
    });

    it('throws if claim batch is not an array', async () => {
      const store = new SupabaseSmsDeliveryStore(getAdmin(vi.fn().mockResolvedValue({ data: {} })));
      await expect(store.claimBatch(1)).rejects.toThrow(SmsDeliveryWorkerError);
    });

    it('throws if data is missing or invalid in claim', async () => {
      const store = new SupabaseSmsDeliveryStore(getAdmin(vi.fn().mockResolvedValue({ data: [{ bad: 'data' }] })));
      await expect(store.claimBatch(1)).rejects.toThrowError('billing_category_invalid');
    });

    it('throws on duplicate claim event IDs', async () => {
      const validClaim = {
        work_claim_token: '11111111-1111-4111-8111-111111111111',
        sms_event_id: '22222222-2222-4222-8222-222222222222',
        account_id: '33333333-3333-4333-8333-333333333333',
        phone_number: '+15555555555',
        body: 'test',
        message_kind: 'test',
        billing_category: 'customer_message',
        sender_purpose: 'test',
        attempt_number: 1,
        lease_expires_at: new Date().toISOString(),
      };
      const store = new SupabaseSmsDeliveryStore(getAdmin(vi.fn().mockResolvedValue({ data: [validClaim, validClaim] })));
      await expect(store.claimBatch(2)).rejects.toThrowError('claim_batch_duplicate');
    });

    it('throws if stage dispatch_status is invalid', async () => {
      const store = new SupabaseSmsDeliveryStore(getAdmin(vi.fn().mockResolvedValue({ data: { dispatch_status: 'invalid_status' } })));
      await expect(store.stage({ 
        messageKind: 'regular',
        eventId: '11111111-1111-4111-8111-111111111111',
        claimToken: '22222222-2222-4222-8222-222222222222',
      } as any, 'signalwire')).rejects.toThrowError('dispatch_status_invalid');
    });
  });

  describe('ProviderSmsDeliveryMessenger', () => {
    it('calls sendProviderMessage with proper args', async () => {
      const sendProviderMessage = (await import('@/lib/sms-provider')).sendProviderMessage;
      const messenger = new ProviderSmsDeliveryMessenger();
      
      const beforeRequest = vi.fn();
      await messenger.send(
        {
          phoneNumber: '+15555555555',
          body: 'Hello',
          accountId: 'acc',
          billingCategory: 'customer_message',
          eventId: 'evt',
          attemptNumber: 1,
          claimToken: 'tok',
        } as any,
        'signalwire',
        '+15556667777',
        undefined,
        beforeRequest
      );

      expect(sendProviderMessage).toHaveBeenCalledWith(
        '+15555555555',
        'Hello',
        { accountId: 'acc', category: 'customer_message' },
        expect.objectContaining({
          provider: 'signalwire',
          from: '+15556667777',
          messageKey: 'sms:evt:attempt:1',
          beforeRequest,
        })
      );
    });
  });
});
