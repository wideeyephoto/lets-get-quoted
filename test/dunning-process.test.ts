import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  recordRecurringChargeFailure,
  rescheduleDunningAfterCardUpdate
} from '@/lib/dunning';

vi.mock('@/lib/auth', () => ({
  createAdminClient: vi.fn(() => {
    const mockSelect = vi.fn().mockReturnThis();
    const mockEq = vi.fn().mockReturnThis();
    const mockMaybeSingle = vi.fn().mockResolvedValue({ data: { id: 'pay_1' }, error: null });
    const mockUpdate = vi.fn().mockReturnThis(); // fix: chainable update
    
    return {
      from: vi.fn(() => ({
        select: mockSelect,
        eq: mockEq,
        is: vi.fn().mockReturnThis(),
        or: vi.fn().mockReturnThis(),
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

vi.mock('@/lib/owner-event-notices', () => ({ runOwnerEventNotices: vi.fn().mockResolvedValue({}) }));

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
      const plan = { id: 'plan_1', account_id: 'acct_1', title: 'Plan', client_name: 'Client', amount: '100' } as any;
      const payment = { id: 'pay_1', amount: 100, dunning_attempts: 0, charge_attempts: 1, dunning_state: null, failed_at: null };
      const decline = { code: 'card_declined', declineCode: 'insufficient_funds', message: 'no funds', intentId: 'pi_1' };

      const state = await recordRecurringChargeFailure(admin, plan, payment, decline, true, false);
      expect(state).toBe('scheduled');
      
      const { createPaymentFeedEvent } = await import('@/lib/job-feed');
      expect(createPaymentFeedEvent).toHaveBeenCalledWith(admin, 'pay_1', 'payment_failed');
      
      const { sendPaymentSmsEvent } = await import('@/lib/sms');
      expect(sendPaymentSmsEvent).toHaveBeenCalledWith('pay_1', 'payment_failed');
      
      const { runOwnerEventNotices } = await import('@/lib/owner-event-notices');
      expect(runOwnerEventNotices).toHaveBeenCalledWith(admin, { accountId: 'acct_1', sourceId: expect.any(String) });
    });
    
    it('transitions directly to needs_card on terminal declines', async () => {
      const { createAdminClient } = await import('@/lib/auth');
      const admin = createAdminClient();
      const plan = { id: 'plan_1', account_id: 'acct_1', title: 'Plan', client_name: 'Client', amount: '100', client_email: 'test@test.com' } as any;
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

describe('saved recurring failure notices', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { runOwnerEventNotices } = await import('@/lib/owner-event-notices');
    vi.mocked(runOwnerEventNotices).mockResolvedValue({} as any);
  });
  function fixture(options: { error?: boolean; loser?: boolean } = {}) {
    let processed = false;
    const filters: unknown[][] = [];
    const writes: Record<string, unknown>[] = [];
    const admin = { from: () => {
      let writing = false;
      const q = {
        update: (value: Record<string, unknown>) => { writing = true; writes.push(value); return q; },
        select: () => q, limit: () => q,
        eq: (...v: unknown[]) => { if (writing) filters.push(['eq', ...v]); return q; },
        is: (...v: unknown[]) => { if (writing) filters.push(['is', ...v]); return q; },
        in: (...v: unknown[]) => { if (writing) filters.push(['in', ...v]); return q; },
        or: (...v: unknown[]) => { if (writing) filters.push(['or', ...v]); return q; },
        maybeSingle: async () => {
          if (!writing) return { data: { company_name: 'Business' }, error: null };
          if (options.error) return { data: null, error: { message: 'failed write' } };
          if (processed || options.loser) return { data: null, error: null };
          processed = true; return { data: { id: 'pay_1' }, error: null };
        },
      }; return q;
    } } as any;
    const plan = { id: 'plan_1', account_id: 'acct_1', client_email: 'client@example.test', title: 'Plan', amount: 100 } as any;
    const payment = { id: 'pay_1', amount: 100, charge_attempts: 1, dunning_attempts: 0, dunning_state: null as string | null, failed_at: null };
    const decline = { code: 'card_declined', declineCode: 'insufficient_funds', message: null, intentId: 'pi_1' };
    return { admin, plan, payment, decline, writes, filters };
  }
  it('binds the saved attempt to account, plan, amount and counters before any follow-up', async () => {
    const f=fixture();await recordRecurringChargeFailure(f.admin,f.plan,f.payment,f.decline,true,false);
    for (const filter of [['eq','account_id','acct_1'],['eq','recurring_plan_id','plan_1'],['eq','amount',100],['eq','charge_attempts',1],['eq','dunning_attempts',0],['is','dunning_state',null],['or','dunning_failure_attempt.is.null,dunning_failure_attempt.lt.1']]) expect(f.filters).toContainEqual(filter);
    expect(f.writes[0]).toMatchObject({ dunning_failure_attempt: 1, dunning_failure_event_id: expect.any(String) });
  });
  it('does not repeat owner or client effects for the same saved charge attempt', async () => {
    const f=fixture();await recordRecurringChargeFailure(f.admin,f.plan,f.payment,f.decline,true,false);
    await recordRecurringChargeFailure(f.admin,f.plan,f.payment,f.decline,true,false);
    const { runOwnerEventNotices }=await import('@/lib/owner-event-notices');
    const { sendPaymentSmsEvent }=await import('@/lib/sms');
    expect(runOwnerEventNotices).toHaveBeenCalledTimes(1);expect(sendPaymentSmsEvent).toHaveBeenCalledTimes(1);
  });
  it('does not notify if a newer payment outcome wins', async () => {
    const f=fixture({loser:true});await recordRecurringChargeFailure(f.admin,f.plan,f.payment,f.decline,true,false);
    const {runOwnerEventNotices}=await import('@/lib/owner-event-notices');const {createPaymentFeedEvent}=await import('@/lib/job-feed');
    expect(runOwnerEventNotices).not.toHaveBeenCalled();expect(createPaymentFeedEvent).not.toHaveBeenCalled();
  });
  it('propagates a distinguishable save error without sending messages', async () => {
    const f=fixture({error:true});await expect(recordRecurringChargeFailure(f.admin,f.plan,f.payment,f.decline,true,false)).rejects.toMatchObject({name:'RecurringFailureSaveError'});
    const {runOwnerEventNotices}=await import('@/lib/owner-event-notices');expect(runOwnerEventNotices).not.toHaveBeenCalled();
  });
  it('preserves a saved failure when inline queue pickup fails', async () => {
    const {runOwnerEventNotices}=await import('@/lib/owner-event-notices');vi.mocked(runOwnerEventNotices).mockRejectedValueOnce(new Error('pickup failed'));
    const f=fixture();await expect(recordRecurringChargeFailure(f.admin,f.plan,f.payment,f.decline,false,false)).resolves.toBe('scheduled');
  });
  it('keeps intermediate retries silent but saves a terminal retry notice', async () => {
    const first=fixture();first.payment.charge_attempts=2;first.payment.dunning_state='scheduled';
    await recordRecurringChargeFailure(first.admin,first.plan,first.payment,first.decline,false,true);
    const {runOwnerEventNotices}=await import('@/lib/owner-event-notices');expect(runOwnerEventNotices).not.toHaveBeenCalled();
    const last=fixture();last.payment.charge_attempts=4;last.payment.dunning_attempts=2;last.payment.dunning_state='scheduled';
    await recordRecurringChargeFailure(last.admin,last.plan,last.payment,last.decline,false,true);
    expect(runOwnerEventNotices).toHaveBeenCalledTimes(1);expect(last.writes[0].dunning_state).toBe('exhausted');
  });
});
