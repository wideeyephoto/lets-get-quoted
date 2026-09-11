import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  recordRecurringChargeFailure,
  retryDunningPayment,
  runDunningRetries,
  rescheduleDunningAfterCardUpdate
} from '@/lib/dunning';

vi.mock('@/lib/auth', () => ({
  createAdminClient: vi.fn(() => {
    const mockSelect = vi.fn().mockReturnThis();
    const mockEq = vi.fn().mockReturnThis();
    const mockMaybeSingle = vi.fn().mockResolvedValue({ data: null });
    const mockUpdate = vi.fn().mockReturnThis(); // fix: chainable update
    
    return {
      from: vi.fn(() => ({
        select: mockSelect,
        eq: mockEq,
        maybeSingle: mockMaybeSingle,
        update: mockUpdate,
        lt: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        lte: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
      }))
    };
  })
}));

vi.mock('@/lib/stripe', () => ({
  getStripeClient: vi.fn(),
  toCents: vi.fn((v) => Math.round(v * 100)),
  canCreateConnectCharge: vi.fn(() => true),
  CONNECT_CHARGE_COLUMNS: 'connect_columns',
}));

vi.mock('@/lib/phone', () => ({ normalizeUsPhone: vi.fn((p) => p) }));
vi.mock('@/lib/job-feed', () => ({ createPaymentFeedEvent: vi.fn() }));
vi.mock('@/lib/sms', () => ({ sendPaymentSmsEvent: vi.fn(), sendCardUpdateSms: vi.fn() }));
vi.mock('@/lib/email', () => ({
  sendContractorAlertEmail: vi.fn(),
  getAccountOwnerEmail: vi.fn().mockResolvedValue('owner@example.com'),
  sendCardUpdateEmail: vi.fn(),
}));
vi.mock('@/lib/card-on-file', () => ({ createCardSetupSession: vi.fn().mockResolvedValue('http://setup') }));
vi.mock('@/lib/invoices', () => ({ markInvoicePaidForPayment: vi.fn() }));
vi.mock('@/lib/business-name', () => ({ pickBusinessName: vi.fn(() => 'Test Biz') }));

describe('Dunning Process Functions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('recordRecurringChargeFailure', () => {
    it('schedules transient declines and triggers appropriate alerts', async () => {
      const { createAdminClient } = await import('@/lib/auth');
      const admin = createAdminClient();
      const plan = { account_id: 'acct_1', title: 'Plan', client_name: 'Client', amount: '100' } as any;
      const payment = { id: 'pay_1', amount: 100, dunning_attempts: 0, charge_attempts: 1, dunning_state: null, failed_at: null };
      const decline = { code: 'card_declined', declineCode: 'insufficient_funds', message: 'no funds', intentId: 'pi_1' };

      const state = await recordRecurringChargeFailure(admin, plan, payment, decline, true, false);
      expect(state).toBe('scheduled');
      
      const { createPaymentFeedEvent } = await import('@/lib/job-feed');
      expect(createPaymentFeedEvent).toHaveBeenCalledWith(admin, 'pay_1', 'payment_failed');
      
      const { sendPaymentSmsEvent } = await import('@/lib/sms');
      expect(sendPaymentSmsEvent).toHaveBeenCalledWith('pay_1', 'payment_failed');
      
      const { sendContractorAlertEmail } = await import('@/lib/email');
      expect(sendContractorAlertEmail).toHaveBeenCalled();
    });
    
    it('transitions directly to needs_card on terminal declines', async () => {
      const { createAdminClient } = await import('@/lib/auth');
      const admin = createAdminClient();
      const plan = { account_id: 'acct_1', title: 'Plan', client_name: 'Client', amount: '100', client_email: 'test@test.com' } as any;
      const payment = { id: 'pay_1', amount: 100, dunning_attempts: 0, charge_attempts: 1, dunning_state: null, failed_at: null };
      const decline = { code: 'expired_card', declineCode: null, message: 'expired', intentId: 'pi_1' };

      const state = await recordRecurringChargeFailure(admin, plan, payment, decline, true, false);
      expect(state).toBe('needs_card');
      
      const { sendCardUpdateEmail } = await import('@/lib/email');
      expect(sendCardUpdateEmail).toHaveBeenCalled();
    });
  });
  
  describe('rescheduleDunningAfterCardUpdate', () => {
    it('updates failed payments to scheduled state', async () => {
      const { createAdminClient } = await import('@/lib/auth');
      const admin = createAdminClient();
      
      await rescheduleDunningAfterCardUpdate(admin, 'plan_1');
      expect(admin.from).toHaveBeenCalledWith('payments');
    });
  });
});
