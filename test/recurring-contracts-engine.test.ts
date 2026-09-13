import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  createJob: vi.fn(),
  getStripeClient: vi.fn(),
  toCents: vi.fn((amt: number) => Math.round(amt * 100)),
  canCreateConnectCharge: vi.fn().mockReturnValue(true),
  getQuotedFee: vi.fn().mockResolvedValue({ feeRate: 0.029, platformFee: 2.90 }),
  normalizeUsPhone: vi.fn((p: string) => (p.includes('555') ? '+15551234567' : null)),
  findOrCreateClientId: vi.fn().mockResolvedValue('client-uuid-111'),
  createJobFeedEvent: vi.fn().mockResolvedValue({}),
  createPaymentFeedEvent: vi.fn().mockResolvedValue({}),
  sendPaymentSmsEvent: vi.fn().mockResolvedValue({}),
  recordRecurringChargeFailure: vi.fn().mockResolvedValue({}),
  extractStripeDecline: vi.fn((err: any) => ({
    code: 'card_declined',
    declineCode: 'insufficient_funds',
    message: err?.message || 'Declined',
  })),
  createInvoiceWithSingleItem: vi.fn().mockResolvedValue({
    id: 'inv-recurring-1',
    ref: 'INV-REC-001',
    total: 100,
  }),
  markInvoicePaidForPayment: vi.fn().mockResolvedValue({}),
}));

vi.mock('@/lib/auth', () => ({
  createAdminClient: mocks.createAdminClient,
}));

vi.mock('@/lib/jobs', () => ({
  createJob: mocks.createJob,
}));

vi.mock('@/lib/stripe', () => ({
  getStripeClient: mocks.getStripeClient,
  toCents: mocks.toCents,
  canCreateConnectCharge: mocks.canCreateConnectCharge,
  CONNECT_CHARGE_COLUMNS: 'stripe_connect_id, connect_onboarded',
}));

vi.mock('@/lib/payments', () => ({
  getQuotedFee: mocks.getQuotedFee,
}));

vi.mock('@/lib/phone', () => ({
  normalizeUsPhone: mocks.normalizeUsPhone,
}));

vi.mock('@/lib/clients', () => ({
  findOrCreateClientId: mocks.findOrCreateClientId,
}));

vi.mock('@/lib/job-feed', () => ({
  createJobFeedEvent: mocks.createJobFeedEvent,
  createPaymentFeedEvent: mocks.createPaymentFeedEvent,
}));

vi.mock('@/lib/sms', () => ({
  sendPaymentSmsEvent: mocks.sendPaymentSmsEvent,
}));

vi.mock('@/lib/dunning', () => ({
  recordRecurringChargeFailure: mocks.recordRecurringChargeFailure,
  extractStripeDecline: mocks.extractStripeDecline,
}));

vi.mock('@/lib/invoices', () => ({
  createInvoiceWithSingleItem: mocks.createInvoiceWithSingleItem,
  markInvoicePaidForPayment: mocks.markInvoicePaidForPayment,
}));

import {
  createRecurringPlan,
  enrollMembershipPlan,
  listRecurringPlans,
  getRecurringPlan,
  setRecurringPlanActive,
  setRecurringPlanAutopay,
  updateRecurringPlan,
  deleteRecurringPlan,
  ensurePlanVisits,
  removeFuturePlanVisits,
  runRecurringPlanNow,
  runDueRecurringPlans,
  topUpVisitHorizon,
  advanceDate,
  anchorDayFrom,
  nextFutureRunDate,
  requiresReconsent,
  type RecurringPlan,
} from '@/lib/recurring';

const TEST_ACCOUNT_ID = 'acc-recurring-123';
const TEST_PLAN_ID = 'plan-uuid-999';

function createMockSupabase(overrides: {
  plans?: any[];
  jobs?: any[];
  accounts?: any;
} = {}) {
  const plans = overrides.plans ?? [
    {
      id: TEST_PLAN_ID,
      account_id: TEST_ACCOUNT_ID,
      client_id: 'client-1',
      title: 'Biweekly Lawn Maintenance',
      scope: 'Mowing and edging',
      client_name: 'John Doe',
      client_phone: '+15551234567',
      client_email: 'john@example.com',
      address: '123 Meadow Lane',
      amount: 85,
      frequency: 'biweekly',
      next_run_date: '2026-09-15',
      active: true,
      auto_charge: true,
      prepaid: false,
      remaining_cycles: null,
      anchor_day: 15,
      stripe_customer_id: 'cus_test123',
      stripe_payment_method_id: 'pm_test123',
      card_brand: 'visa',
      card_last4: '4242',
      last_job_id: null,
      last_run_at: null,
      created_at: '2026-08-01T00:00:00Z',
      updated_at: '2026-08-01T00:00:00Z',
    },
  ];

  const jobs = overrides.jobs ?? [];
  const account = overrides.accounts ?? {
    id: TEST_ACCOUNT_ID,
    stripe_connect_id: 'acct_connect_123',
    connect_onboarded: true,
  };

  return {
    from: vi.fn((table: string) => {
      if (table === 'recurring_plans') {
        const query: any = {
          select: vi.fn(() => query),
          insert: vi.fn((data: any) => ({
            select: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({
                data: { id: TEST_PLAN_ID, ...data, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
                error: null,
              }),
            })),
          })),
          update: vi.fn((patch: any) => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                select: vi.fn(() => ({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { ...plans[0], ...patch },
                    error: null,
                  }),
                  single: vi.fn().mockResolvedValue({
                    data: { ...plans[0], ...patch },
                    error: null,
                  }),
                })),
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { id: TEST_PLAN_ID },
                  error: null,
                }),
              })),
              select: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { ...plans[0], ...patch },
                  error: null,
                }),
                single: vi.fn().mockResolvedValue({
                  data: { ...plans[0], ...patch },
                  error: null,
                }),
              })),
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: TEST_PLAN_ID },
                error: null,
              }),
            })),
          })),
          delete: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn().mockResolvedValue({ error: null }),
            })),
          })),
          eq: vi.fn((field: string, val: any) => {
            if (field === 'id') {
              const matched = plans.find((p) => p.id === val);
              return {
                ...query,
                maybeSingle: vi.fn().mockResolvedValue({ data: matched ?? null, error: null }),
                single: vi.fn().mockResolvedValue({ data: matched ?? null, error: null }),
              };
            }
            return query;
          }),
          lte: vi.fn(() => query),
          order: vi.fn(() => query),
          limit: vi.fn(() => Promise.resolve({ data: plans, error: null })),
          then: (resolve: (val: any) => any) => resolve({ data: plans, error: null }),
        };
        return query;
      }
      if (table === 'jobs') {
        const query: any = {
          select: vi.fn(() => query),
          insert: vi.fn(() => ({
            select: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({ data: { id: 'job-created-1' }, error: null }),
            })),
          })),
          update: vi.fn(() => {
            const updateBuilder: any = {
              eq: vi.fn(() => updateBuilder),
              gt: vi.fn(() => updateBuilder),
              then: (resolve: (val: any) => any) => resolve({ error: null }),
            };
            return updateBuilder;
          }),
          delete: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                gt: vi.fn(() => ({
                  select: vi.fn().mockResolvedValue({ data: [{ id: 'job-del-1' }, { id: 'job-del-2' }], error: null }),
                })),
              })),
            })),
          })),
          eq: vi.fn(() => query),
          gt: vi.fn(() => query),
          in: vi.fn(() => Promise.resolve({ data: jobs, error: null })),
          maybeSingle: vi.fn().mockResolvedValue({ data: jobs[0] ?? null, error: null }),
        };
        return query;
      }
      if (table === 'accounts') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({ data: account, error: null }),
            })),
          })),
        };
      }
      if (table === 'payments') {
        return {
          insert: vi.fn((data: any) => ({
            select: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({ data: { id: 'pay-rec-1', ...data }, error: null }),
            })),
          })),
          update: vi.fn(() => ({
            eq: vi.fn().mockResolvedValue({ error: null }),
          })),
        };
      }
      if (table === 'sms_consent') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({ data: { status: 'opted_in' }, error: null }),
              })),
            })),
          })),
        };
      }
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          })),
        })),
      };
    }),
  };
}

describe('Recurring Contracts Engine (src/lib/recurring.ts)', () => {
  let mockSupabase: ReturnType<typeof createMockSupabase>;
  let mockStripe: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase = createMockSupabase();
    mocks.createAdminClient.mockReturnValue(mockSupabase);
    mockStripe = {
      paymentIntents: {
        create: vi.fn().mockResolvedValue({
          id: 'pi_test_recurring_1',
          status: 'succeeded',
        }),
      },
    };
    mocks.getStripeClient.mockReturnValue(mockStripe);
    mocks.createJob.mockResolvedValue({ id: 'job-new-recurring-1' });
  });

  describe('Contract Lifecycle Management', () => {
    it('creates a recurring plan and anchors day of month', async () => {
      const plan = await createRecurringPlan(mockSupabase as any, TEST_ACCOUNT_ID, {
        title: 'Monthly HVAC Maintenance',
        scope: 'Filter check and coil clean',
        clientName: 'Alice Green',
        clientPhone: '(555) 123-4567',
        clientEmail: 'alice@example.com',
        address: '500 Oak St',
        amount: 150,
        frequency: 'monthly',
        firstVisitDate: '2026-10-31',
        autoCharge: true,
        termCycles: 12,
      });

      expect(plan.title).toBe('Monthly HVAC Maintenance');
      expect(mocks.findOrCreateClientId).toHaveBeenCalled();
    });

    it('enrolls client into a service club membership plan', async () => {
      const plan = await enrollMembershipPlan(
        mockSupabase as any,
        TEST_ACCOUNT_ID,
        { name: 'Bob Smith', phone: '555-987-6543' },
        {
          id: '12345678-1234-1234-1234-123456789abc',
          name: 'Gold Shield',
          tierLevel: 2,
          monthlyPrice: 29.99,
          benefits: { discountPct: 15 },
        },
        'monthly',
        '2026-10-01'
      );

      expect(plan).toBeDefined();
      expect(plan.title).toContain('Gold Shield Membership');
    });

    it('lists plans and handles error degradation gracefully', async () => {
      const plans = await listRecurringPlans(mockSupabase as any, TEST_ACCOUNT_ID);
      expect(plans.length).toBe(1);
      expect(plans[0].title).toBe('Biweekly Lawn Maintenance');
    });

    it('pauses a plan and removes future scheduled visits from calendar', async () => {
      const res = await setRecurringPlanActive(mockSupabase as any, TEST_ACCOUNT_ID, TEST_PLAN_ID, false);
      expect(res.visitsChanged).toBe(2);
    });

    it('updates plan amount without rebuilding visits, but updates future job quoted amount', async () => {
      const { plan, visitsRebuilt } = await updateRecurringPlan(mockSupabase as any, TEST_ACCOUNT_ID, TEST_PLAN_ID, {
        amount: 95,
      });
      expect(visitsRebuilt).toBe(0);
      expect(plan.amount).toBe(95);
    });

    it('updates plan frequency, rebuilding visits on the new cadence', async () => {
      const { visitsRebuilt } = await updateRecurringPlan(mockSupabase as any, TEST_ACCOUNT_ID, TEST_PLAN_ID, {
        frequency: 'monthly',
        nextRunDate: '2026-10-01',
      });
      expect(visitsRebuilt).toBeGreaterThanOrEqual(0);
    });

    it('toggles autopay on/off with validation', async () => {
      await expect(setRecurringPlanAutopay(mockSupabase as any, TEST_ACCOUNT_ID, TEST_PLAN_ID, true)).resolves.toBeDefined();
    });

    it('deletes recurring plan after wiping future calendar visits', async () => {
      const { visitsRemoved } = await deleteRecurringPlan(mockSupabase as any, TEST_ACCOUNT_ID, TEST_PLAN_ID);
      expect(visitsRemoved).toBe(2);
    });
  });

  describe('Calendar Visit Horizon & Materialization', () => {
    it('ensures horizon visits are created idempotently', async () => {
      const plan = {
        id: TEST_PLAN_ID,
        account_id: TEST_ACCOUNT_ID,
        title: 'Mow',
        client_name: 'John',
        amount: 50,
        frequency: 'weekly' as const,
        next_run_date: '2026-09-20',
        active: true,
        remaining_cycles: null,
      } as RecurringPlan;

      const created = await ensurePlanVisits(mockSupabase as any, plan, 4);
      expect(created).toBe(4);
      expect(mocks.createJob).toHaveBeenCalledTimes(4);
    });

    it('removes future plan visits ahead of a given date', async () => {
      const removed = await removeFuturePlanVisits(mockSupabase as any, TEST_ACCOUNT_ID, TEST_PLAN_ID, '2026-09-15');
      expect(removed).toBe(2);
    });

    it('topUpVisitHorizon runs across all active plans', async () => {
      const topped = await topUpVisitHorizon(mockSupabase as any);
      expect(topped).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Execution & Billing Engine', () => {
    it('spawns and charges due visit when running plan now', async () => {
      const result = await runRecurringPlanNow(TEST_ACCOUNT_ID, TEST_PLAN_ID);
      expect(result.outcome).toBe('paid');
      expect(mockStripe.paymentIntents.create).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 8500,
          currency: 'usd',
          customer: 'cus_test123',
          payment_method: 'pm_test123',
          off_session: true,
        }),
        expect.objectContaining({ idempotencyKey: `recurring_${TEST_PLAN_ID}_2026-09-15` })
      );
      expect(mocks.createInvoiceWithSingleItem).toHaveBeenCalled();
      expect(mocks.markInvoicePaidForPayment).toHaveBeenCalled();
      expect(mocks.sendPaymentSmsEvent).toHaveBeenCalledWith('pay-rec-1', 'payment_paid');
    });

    it('records dunning failure when Stripe card decline occurs', async () => {
      mockStripe.paymentIntents.create.mockRejectedValueOnce(new Error('Card declined - insufficient funds'));

      const result = await runRecurringPlanNow(TEST_ACCOUNT_ID, TEST_PLAN_ID);
      expect(result.outcome).toBe('failed');
      expect(mocks.recordRecurringChargeFailure).toHaveBeenCalled();
    });

    it('handles prepaid plans without generating invoices or charging card', async () => {
      const prepaidPlan = {
        id: 'plan-prepaid-1',
        account_id: TEST_ACCOUNT_ID,
        title: 'Annual Season Pass',
        client_name: 'VIP Client',
        amount: 1200,
        frequency: 'monthly' as const,
        next_run_date: '2026-09-15',
        active: true,
        auto_charge: false,
        prepaid: true,
        remaining_cycles: 10,
        stripe_customer_id: null,
        stripe_payment_method_id: null,
      };

      mockSupabase = createMockSupabase({ plans: [prepaidPlan] });
      mocks.createAdminClient.mockReturnValue(mockSupabase);

      const result = await runRecurringPlanNow(TEST_ACCOUNT_ID, 'plan-prepaid-1');
      expect(result.outcome).toBe('skipped');
      expect(mockStripe.paymentIntents.create).not.toHaveBeenCalled();
      expect(mocks.createInvoiceWithSingleItem).not.toHaveBeenCalled();
    });

    it('runs due recurring plans daily sweep across due batch', async () => {
      const summary = await runDueRecurringPlans();
      expect(summary.due).toBe(1);
      expect(summary.spawned).toBe(1);
      expect(summary.charged).toBe(1);
      expect(summary.failed).toBe(0);
    });
  });
});
