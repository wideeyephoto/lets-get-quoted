import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getPaymentPlanForJob, createPaymentPlan, authorizePaymentPlan, runDuePlanInstallments, startPlanPayoff } from '@/lib/payment-plans';
import * as stripeModule from '@/lib/stripe';
import * as paymentsModule from '@/lib/payments';
import { createAdminClient } from '@/lib/auth';

vi.mock('@/lib/stripe', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/stripe')>();
  return {
    ...actual,
    getStripeClient: vi.fn(),
    canCreateConnectCharge: vi.fn(),
    toCents: vi.fn((d: number) => Math.round(d * 100)),
    fromCents: vi.fn((c: number) => c / 100),
  };
});

vi.mock('@/lib/payments', () => ({
  getQuotedFee: vi.fn(),
  createDepositRequest: vi.fn(),
}));

vi.mock('@/lib/job-feed', () => ({
  createJobFeedEvent: vi.fn(),
  createPaymentFeedEvent: vi.fn(),
}));

vi.mock('@/lib/sms', () => ({
  sendPaymentSmsEvent: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  createAdminClient: vi.fn(),
}));

const mockDb = () => {
  const db: any = {};
  db.from = vi.fn(() => db);
  db.select = vi.fn(() => db);
  db.eq = vi.fn(() => db);
  db.not = vi.fn(() => db);
  db.in = vi.fn(() => db);
  db.lt = vi.fn(() => db);
  db.lte = vi.fn(() => db);
  db.is = vi.fn(() => db);
  db.order = vi.fn(() => db);
  db.limit = vi.fn(() => db);
  db.maybeSingle = vi.fn(() => Promise.resolve({ data: null }));
  db.single = vi.fn(() => Promise.resolve({ data: null }));
  db.insert = vi.fn(() => db);
  db.update = vi.fn(() => db);
  db.delete = vi.fn(() => db);
  return db;
};

describe('payment-plans', () => {
  let db: any;

  beforeEach(() => {
    vi.clearAllMocks();
    db = mockDb();
    vi.mocked(createAdminClient).mockReturnValue(db);
  });

  describe('getPaymentPlanForJob', () => {
    it('returns null if no plan found', async () => {
      db.maybeSingle.mockResolvedValue({ data: null });
      const res = await getPaymentPlanForJob(db, 'acc_1', 'job_1');
      expect(res).toBeNull();
      expect(db.from).toHaveBeenCalledWith('payment_plans');
      expect(db.eq).toHaveBeenCalledWith('account_id', 'acc_1');
    });

    it('returns plan if found', async () => {
      db.maybeSingle.mockResolvedValue({ data: { id: 'plan_1' } });
      const res = await getPaymentPlanForJob(db, 'acc_1', 'job_1');
      expect(res).toEqual({ id: 'plan_1' });
    });
  });

  describe('createPaymentPlan', () => {
    it('creates a plan and its deposit', async () => {
      db.single.mockResolvedValue({ data: { id: 'plan_1', deposit_cents: 50000 } });
      vi.mocked(paymentsModule.createDepositRequest).mockResolvedValue({ id: 'dep_1' } as any);
      db.eq.mockReturnValue(db);

      const res = await createPaymentPlan(db, 'acc_1', 'job_1', {
        totalCents: 100000,
        depositPercent: 50,
        installmentCount: 2,
        frequency: 'monthly',
        firstInstallmentDate: '2026-10-01',
        clientPhone: '555',
        smsConsent: true
      });

      expect(res.plan.id).toBe('plan_1');
      expect(res.depositPaymentId).toBe('dep_1');
      expect(paymentsModule.createDepositRequest).toHaveBeenCalled();
      expect(db.from).toHaveBeenCalledWith('payment_plans');
      expect(db.from).toHaveBeenCalledWith('payments');
    });
  });
});
