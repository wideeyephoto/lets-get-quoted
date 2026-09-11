import { describe, it, expect, vi, beforeEach } from 'vitest';
import { 
  sendPaymentSmsEvent, 
  retryFailedPaymentSmsEvent,
  recordSmsConsent,
  isPhoneOptedOut,
  hasCurrentSmsConsent,
  ensureSmsConsentBaseline,
  queueAccountSms,
} from '@/lib/sms';
import { createAdminClient } from '@/lib/auth';
import { enqueueSmsDelivery } from '@/lib/sms-delivery';

vi.mock('@/lib/auth', () => ({
  createAdminClient: vi.fn(),
}));

vi.mock('@/lib/sms-delivery', () => ({
  enqueueSmsDelivery: vi.fn(),
}));

vi.mock('@/lib/business-name', () => ({
  loadBusinessName: vi.fn(() => 'Test Business'),
}));

vi.mock('@/lib/phone', () => ({
  normalizeUsPhone: vi.fn((phone: string) => {
    if (!phone || phone.trim() === '' || phone.includes('invalid')) return null;
    return '+1' + phone.replace(/\D/g, '').slice(-10);
  }),
}));

// Partially mock templates just to avoid breaking
vi.mock('@/lib/sms-templates', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    paymentText: vi.fn(() => 'payment text'),
    withOptOut: vi.fn((text) => text),
  };
});

describe('sms.ts coverage', () => {
  let mockSupabase: any;
  const mockAdminClient = () => mockSupabase;

  beforeEach(() => {
    mockSupabase = {
      from: vi.fn(() => {
        const chain = {
          select: vi.fn(() => chain),
          eq: vi.fn(() => chain),
          neq: vi.fn(() => chain),
          update: vi.fn(() => chain),
          upsert: vi.fn(() => chain),
          maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
          then: vi.fn((resolve) => resolve({ data: [], error: null })),
        };
        return chain;
      }),
      rpc: vi.fn(() => Promise.resolve({ data: false, error: null })),
    };
    vi.mocked(createAdminClient).mockImplementation(mockAdminClient);
  });

  describe('isPhoneOptedOut', () => {
    it('returns true if phone is invalid', async () => {
      const result = await isPhoneOptedOut('acc_1', '  ');
      expect(result).toBe(true);
    });

    it('returns rpc result', async () => {
      mockSupabase.rpc = vi.fn().mockResolvedValue({ data: true, error: null });
      const result = await isPhoneOptedOut('acc_1', '5551234567');
      expect(result).toBe(true);
      expect(mockSupabase.rpc).toHaveBeenCalledWith('sms_account_recipient_opted_out', {
        p_account_id: 'acc_1',
        p_phone_number: '+15551234567'
      });
    });

    it('returns true if rpc errors', async () => {
      mockSupabase.rpc = vi.fn().mockResolvedValue({ data: null, error: new Error('RPC err') });
      const result = await isPhoneOptedOut('acc_1', '5551234567');
      expect(result).toBe(true);
    });

    it('returns true if rpc throws', async () => {
      mockSupabase.rpc = vi.fn().mockRejectedValue(new Error('Threw'));
      const result = await isPhoneOptedOut('acc_1', '5551234567');
      expect(result).toBe(true);
    });
  });

  describe('hasCurrentSmsConsent', () => {
    it('returns false for invalid phone', async () => {
      const result = await hasCurrentSmsConsent('acc_1', 'invalid');
      expect(result).toBe(false);
    });

    it('returns true if base and scope queries succeed and data is OK', async () => {
      mockSupabase.from = vi.fn((table) => {
        const chain = {
          select: vi.fn(() => chain),
          eq: vi.fn(() => chain),
          maybeSingle: vi.fn(() => {
            if (table === 'sms_consent') return Promise.resolve({ data: { status: 'opted_in', consented_at: '2023-01-01' }, error: null });
            if (table === 'sms_consent_scopes') return Promise.resolve({ data: { consent_scope: 'customer' }, error: null });
            return Promise.resolve({ data: null, error: null });
          }),
        };
        return chain;
      });
      const result = await hasCurrentSmsConsent('acc_1', '5551234567');
      expect(result).toBe(true); // Assuming the logic uses these to return true
    });
  });

  describe('queueAccountSms', () => {
    it('calls enqueueSmsDelivery with correct parameters', async () => {
      vi.mocked(enqueueSmsDelivery).mockResolvedValueOnce({ created: true, eventId: 'evt_1', state: 'queued' } as any);
      
      const result = await queueAccountSms({
        accountId: 'acc_1',
        phone: '5551234567',
        body: 'hello',
        messageKind: 'test',
        category: 'payment_message',
      });
      expect(result).toBe('evt_1');
      expect(enqueueSmsDelivery).toHaveBeenCalledWith(expect.objectContaining({
        accountId: 'acc_1',
        phoneNumber: '+15551234567',
        body: 'hello',
        messageKind: 'test',
        billingCategory: 'payment_message'
      }));
    });
  });

  describe('recordSmsConsent', () => {
    it('throws if phone is invalid', async () => {
      await expect(recordSmsConsent('acc_1', 'invalid')).rejects.toThrow('A valid US phone number is required');
    });

    it('updates consent and records scope if successful update', async () => {
      let upsertCalled = false;
      mockSupabase.from = vi.fn((table) => {
        const chain = {
          select: vi.fn(() => chain),
          eq: vi.fn(() => chain),
          neq: vi.fn(() => chain),
          update: vi.fn(() => chain),
          upsert: vi.fn(() => { upsertCalled = true; return chain; }),
          maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
          then: vi.fn((resolve) => resolve({ data: [{ id: '1' }], error: null })),
        };
        return chain;
      });

      await recordSmsConsent('acc_1', '5551234567', 'test_source');
      expect(upsertCalled).toBe(true);
    });
  });

  describe('sendPaymentSmsEvent', () => {
    it('throws if payment not found', async () => {
      await expect(sendPaymentSmsEvent('pay_1', 'payment_requested')).rejects.toThrow('Payment not found');
    });

    it('returns skipped if no consent or no phone', async () => {
      mockSupabase.from = vi.fn(() => {
        const chain = {
          select: vi.fn(() => chain),
          eq: vi.fn(() => chain),
          maybeSingle: vi.fn(() => Promise.resolve({ data: { sms_consent: false, homeowner_phone: '5551234567' }, error: null })),
        };
        return chain;
      });
      const result = await sendPaymentSmsEvent('pay_1', 'payment_requested');
      expect(result).toEqual({ status: 'skipped' });
    });

    it('returns failed if phone is invalid', async () => {
      mockSupabase.from = vi.fn(() => {
        const chain = {
          select: vi.fn(() => chain),
          eq: vi.fn(() => chain),
          maybeSingle: vi.fn(() => Promise.resolve({ data: { sms_consent: true, homeowner_phone: 'invalid' }, error: null })),
        };
        return chain;
      });
      const result = await sendPaymentSmsEvent('pay_1', 'payment_requested');
      expect(result).toEqual({ status: 'failed', error: 'SMS destination is invalid.' });
    });
    
    it('queues SMS delivery successfully', async () => {
      let fromCalls = 0;
      mockSupabase.from = vi.fn(() => {
        fromCalls++;
        const chain = {
          select: vi.fn(() => chain),
          eq: vi.fn(() => chain),
          maybeSingle: vi.fn(() => {
            if (fromCalls === 1) { // payments
              return Promise.resolve({ 
                data: { id: 'pay_1', account_id: 'acc_1', amount: 1000, sms_consent: true, homeowner_phone: '5551234567', account: { business_name: 'Biz' } }, 
                error: null 
              });
            } else { // sms_consent
              return Promise.resolve({ data: { status: 'opted_in' }, error: null });
            }
          }),
        };
        return chain;
      });
      
      vi.mocked(enqueueSmsDelivery).mockResolvedValueOnce({ created: true, eventId: 'evt_1', state: 'queued' } as any);

      const result = await sendPaymentSmsEvent('pay_1', 'payment_requested');
      expect(result).toEqual({ status: 'queued', eventId: 'evt_1', deliveryState: 'queued' });
      
      // verify exact cents calculation - wait, payment text is mocked, but we should make sure the amount isn't manipulated weirdly.
      expect(enqueueSmsDelivery).toHaveBeenCalledWith(expect.objectContaining({
        accountId: 'acc_1',
        phoneNumber: '+15551234567',
        paymentId: 'pay_1',
        eventType: 'payment_requested',
        billingCategory: 'payment_message'
      }), mockSupabase);
    });

    it('returns opted_out if consent check fails', async () => {
      let fromCalls = 0;
      mockSupabase.from = vi.fn(() => {
        fromCalls++;
        const chain = {
          select: vi.fn(() => chain),
          eq: vi.fn(() => chain),
          maybeSingle: vi.fn(() => {
            if (fromCalls === 1) {
              return Promise.resolve({ 
                data: { id: 'pay_1', account_id: 'acc_1', amount: 1000, sms_consent: true, homeowner_phone: '5551234567', account: { business_name: 'Biz' } }, 
                error: null 
              });
            } else {
              return Promise.resolve({ data: { status: 'opted_out' }, error: null });
            }
          }),
        };
        return chain;
      });
      const result = await sendPaymentSmsEvent('pay_1', 'payment_requested');
      expect(result).toEqual({ status: 'opted_out' });
    });
  });

  describe('retryFailedPaymentSmsEvent', () => {
    it('calls sendPaymentSmsEvent again', async () => {
      let fromCalls = 0;
      mockSupabase.from = vi.fn(() => {
        fromCalls++;
        const chain = {
          select: vi.fn(() => chain),
          eq: vi.fn(() => chain),
          maybeSingle: vi.fn(() => {
            if (fromCalls === 1) { // payments
              return Promise.resolve({ 
                data: { id: 'pay_1', account_id: 'acc_1', amount: 1000, sms_consent: true, homeowner_phone: '5551234567', account: { business_name: 'Biz' } }, 
                error: null 
              });
            } else { // sms_consent
              return Promise.resolve({ data: { status: 'opted_in' }, error: null });
            }
          }),
        };
        return chain;
      });
      vi.mocked(enqueueSmsDelivery).mockResolvedValueOnce({ created: false, eventId: 'evt_1', state: 'failed' } as any);

      const result = await retryFailedPaymentSmsEvent('pay_1', 'payment_requested');
      expect(result).toEqual({ status: 'duplicate', eventId: 'evt_1', deliveryState: 'failed' });
    });
  });

  describe('ensureSmsConsentBaseline', () => {
    it('returns false for invalid phone', async () => {
      const result = await ensureSmsConsentBaseline('acc_1', 'invalid');
      expect(result).toBe(false);
    });

    it('returns rpc result on success', async () => {
      mockSupabase.rpc = vi.fn().mockResolvedValue({ data: true, error: null });
      const result = await ensureSmsConsentBaseline('acc_1', '5551234567');
      expect(result).toBe(true);
      expect(mockSupabase.rpc).toHaveBeenCalledWith('ensure_sms_consent_baseline_scope', {
        p_account_id: 'acc_1',
        p_phone_number: '+15551234567',
        p_source: 'crew_added'
      });
    });

    it('throws if rpc errors', async () => {
      mockSupabase.rpc = vi.fn().mockResolvedValue({ data: null, error: new Error('RPC err') });
      await expect(ensureSmsConsentBaseline('acc_1', '5551234567')).rejects.toThrow('RPC err');
    });
  });
});
