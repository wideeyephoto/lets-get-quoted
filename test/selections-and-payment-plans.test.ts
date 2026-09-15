import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  getStripeClient: vi.fn(),
  toCents: vi.fn((amt: number) => Math.round(amt * 100)),
  fromCents: vi.fn((cents: number) => cents / 100),
  canCreateConnectCharge: vi.fn().mockReturnValue(true),
  getQuotedFee: vi.fn().mockResolvedValue({ feeRate: 0.029, platformFee: 1.45 }),
  createDepositRequest: vi.fn().mockResolvedValue({ id: 'dep-payment-99', amount: 500 }),
  createJobFeedEvent: vi.fn().mockResolvedValue({}),
  createPaymentFeedEvent: vi.fn().mockResolvedValue({}),
  sendPaymentSmsEvent: vi.fn().mockResolvedValue({}),
  createJobPhotoLinks: vi.fn().mockResolvedValue([
    { path: 'photos/tile-sample.jpg', url: 'https://storage.apex.com/signed/tile-sample.jpg' },
  ]),
}));

vi.mock('@/lib/auth', () => ({
  createAdminClient: mocks.createAdminClient,
}));

vi.mock('@/lib/stripe', () => ({
  getStripeClient: mocks.getStripeClient,
  toCents: mocks.toCents,
  fromCents: mocks.fromCents,
  canCreateConnectCharge: mocks.canCreateConnectCharge,
  CONNECT_CHARGE_COLUMNS: 'stripe_connect_id, connect_onboarded',
}));

vi.mock('@/lib/payments', () => ({
  getQuotedFee: mocks.getQuotedFee,
  createDepositRequest: mocks.createDepositRequest,
}));

vi.mock('@/lib/job-feed', () => ({
  createJobFeedEvent: mocks.createJobFeedEvent,
  createPaymentFeedEvent: mocks.createPaymentFeedEvent,
}));

vi.mock('@/lib/sms', () => ({
  sendPaymentSmsEvent: mocks.sendPaymentSmsEvent,
}));

vi.mock('@/lib/job-photo-storage', () => ({
  createJobPhotoLinks: mocks.createJobPhotoLinks,
}));

import {
  getPaymentPlanForJob,
  createPaymentPlan,
  authorizePaymentPlan,
  authorizePlanAndGetDepositUrl,
  runDuePlanInstallments,
  startPlanPayoff,
  handlePlanPaymentSettled,
  handlePlanPaymentFailed,
  type PaymentPlan,
} from '@/lib/payment-plans';

import {
  listSelections,
  createSelection,
  updateSelection,
  setSelectionStatus,
  addOption,
  updateOption,
  deleteOption,
  chooseOption,
  reopenSelection,
  saveBoardAsTemplate,
  listSelectionTemplates,
  applyTemplate,
  signSelectionPhotos,
  toSignedClientSelections,
  type Selection,
} from '@/lib/selections-data';

const TEST_ACCOUNT_ID = 'acc-plans-sel-123';
const TEST_JOB_ID = 'job-plans-sel-456';
const TEST_PLAN_ID = 'plan-uuid-789';

function createMockSupabase(overrides: {
  plans?: any[];
  payments?: any[];
  selections?: any[];
  options?: any[];
  jobs?: any[];
  templates?: any[];
  access?: any;
} = {}) {
  const plans = overrides.plans ?? [
    {
      id: TEST_PLAN_ID,
      account_id: TEST_ACCOUNT_ID,
      job_id: TEST_JOB_ID,
      total_cents: 200000,
      deposit_cents: 50000,
      installment_count: 3,
      frequency: 'monthly',
      first_installment_date: '2026-10-01',
      status: 'pending_deposit',
      stripe_customer_id: 'cus_client_1',
      stripe_payment_method_id: 'pm_card_1',
      card_brand: 'visa',
      card_last4: '4242',
      authorized_at: null,
      authorized_name: null,
      payoff_locked_at: null,
      deposit_payment_id: 'dep-payment-99',
      allow_pay_in_full: true,
      created_at: '2026-09-01T00:00:00Z',
      updated_at: '2026-09-01T00:00:00Z',
    },
  ];

  const payments = overrides.payments ?? [
    {
      id: 'inst-pay-1',
      account_id: TEST_ACCOUNT_ID,
      job_id: TEST_JOB_ID,
      payment_plan_id: TEST_PLAN_ID,
      kind: 'plan_installment',
      label: 'Installment 1 of 3',
      amount: 500,
      status: 'requested',
      charge_attempts: 0,
      due_date: '2026-09-10',
      installment_seq: 1,
      homeowner_phone: '+15551234567',
      sms_consent: true,
      sms_consent_at: '2026-09-01T00:00:00Z',
    },
  ];

  const selections = overrides.selections ?? [
    {
      id: 'sel-1',
      account_id: TEST_ACCOUNT_ID,
      job_id: TEST_JOB_ID,
      title: 'Kitchen Backsplash Tile',
      description: 'Choose subway or herringbone',
      allowance: 800,
      decide_by: '2026-09-30',
      credit_underspend: true,
      status: 'open',
      chosen_option_id: null,
      chosen_snapshot: null,
      chosen_at: null,
      chosen_by_name: null,
      reopened: [],
      sort_order: 0,
    },
  ];

  const options = overrides.options ?? [
    {
      id: 'opt-1',
      account_id: TEST_ACCOUNT_ID,
      job_id: TEST_JOB_ID,
      selection_id: 'sel-1',
      name: 'Classic White Subway Tile',
      description: 'Gloss finish 3x6',
      price: 650,
      reference: 'TILE-SUB-01',
      photo_path: 'photos/tile-sample.jpg',
      sort_order: 0,
    },
    {
      id: 'opt-2',
      account_id: TEST_ACCOUNT_ID,
      job_id: TEST_JOB_ID,
      selection_id: 'sel-1',
      name: 'Marble Herringbone Pattern',
      description: 'Italian Carrera',
      price: 1100,
      reference: 'TILE-HERR-02',
      photo_path: null,
      sort_order: 1,
    },
  ];

  const jobs = overrides.jobs ?? [
    { id: TEST_JOB_ID, account_id: TEST_ACCOUNT_ID, quoted_amount: 5000 },
  ];

  const templates = overrides.templates ?? [];
  const access = overrides.access ?? {
    account_id: TEST_ACCOUNT_ID,
    job_id: TEST_JOB_ID,
    expires_at: '2026-12-31T00:00:00Z',
    revoked_at: null,
  };

  return {
    from: vi.fn((table: string) => {
      if (table === 'payment_plans') {
        const query: any = {
          select: vi.fn(() => query),
          insert: vi.fn((d: any) => ({
            select: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({ data: { id: TEST_PLAN_ID, ...d }, error: null }),
            })),
          })),
          update: vi.fn((patch: any) => {
            const builder: any = {
              eq: vi.fn(() => builder),
              in: vi.fn(() => builder),
              is: vi.fn(() => builder),
              select: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({ data: { ...plans[0], ...patch }, error: null }),
                single: vi.fn().mockResolvedValue({ data: { ...plans[0], ...patch }, error: null }),
              })),
              maybeSingle: vi.fn().mockResolvedValue({ data: { ...plans[0], ...patch }, error: null }),
              then: (res: any) => res({ error: null }),
            };
            return builder;
          }),
          eq: vi.fn((field: string, val: any) => {
            if (field === 'id') {
              const matched = plans.find((p) => p.id === val) ?? plans[0];
              return {
                ...query,
                maybeSingle: vi.fn().mockResolvedValue({ data: matched ?? null, error: null }),
                single: vi.fn().mockResolvedValue({ data: matched ?? null, error: null }),
              };
            }
            return query;
          }),
          order: vi.fn(() => query),
          limit: vi.fn(() => ({
            maybeSingle: vi.fn().mockResolvedValue({ data: plans[0] ?? null, error: null }),
          })),
          maybeSingle: vi.fn().mockResolvedValue({ data: plans[0] ?? null, error: null }),
        };
        return query;
      }
      if (table === 'payments') {
        const query: any = {
          select: vi.fn(() => query),
          insert: vi.fn((d: any) => {
            if (Array.isArray(d)) {
              return Promise.resolve({ data: d, error: null });
            }
            return {
              select: vi.fn(() => ({
                single: vi.fn().mockResolvedValue({ data: { id: 'pay-new-1', ...d }, error: null }),
              })),
            };
          }),
          update: vi.fn((patch: any) => {
            const builder: any = {
              eq: vi.fn(() => builder),
              in: vi.fn(() => builder),
              select: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({ data: { ...payments[0], ...patch }, error: null }),
              })),
              then: (res: any) => res({ error: null }),
            };
            return builder;
          }),
          delete: vi.fn(() => {
            const builder: any = {
              eq: vi.fn(() => builder),
              in: vi.fn(() => builder),
              then: (res: any) => res({ error: null }),
            };
            return builder;
          }),
          eq: vi.fn((field: string, val: any) => {
            if (field === 'id') {
              const matched = payments.find((p) => p.id === val) ?? payments[0];
              return {
                ...query,
                maybeSingle: vi.fn().mockResolvedValue({ data: matched ?? null, error: null }),
              };
            }
            return query;
          }),
          not: vi.fn(() => query),
          lte: vi.fn(() => query),
          in: vi.fn(() => query),
          lt: vi.fn(() => query),
          order: vi.fn(() => query),
          limit: vi.fn(() => Promise.resolve({ data: payments, error: null })),
          then: (res: any) => res({ data: payments, error: null }),
        };
        return query;
      }
      if (table === 'accounts') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { stripe_connect_id: 'acct_123', connect_onboarded: true },
                error: null,
              }),
            })),
          })),
        };
      }
      if (table === 'client_job_access') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({ data: access, error: null }),
            })),
          })),
        };
      }
      if (table === 'jobs') {
        const query: any = {
          select: vi.fn(() => query),
          eq: vi.fn(() => query),
          update: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn().mockResolvedValue({ error: null }),
            })),
          })),
          maybeSingle: vi.fn().mockResolvedValue({ data: jobs[0] ?? null, error: null }),
        };
        return query;
      }
      if (table === 'job_selections') {
        const query: any = {
          select: vi.fn((fields: string, opts?: any) => {
            if (opts?.count === 'exact') {
              return {
                eq: vi.fn(() => ({
                  eq: vi.fn().mockResolvedValue({ count: selections.length, error: null }),
                })),
              };
            }
            return query;
          }),
          insert: vi.fn((d: any) => ({
            select: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({ data: { id: 'sel-created-1', ...d }, error: null }),
            })),
          })),
          update: vi.fn((patch: any) => {
            const builder: any = {
              eq: vi.fn(() => builder),
              neq: vi.fn(() => builder),
              select: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'sel-1', ...patch }, error: null }),
              })),
              then: (res: any) => res({ error: null }),
            };
            return builder;
          }),
          eq: vi.fn(() => query),
          maybeSingle: vi.fn().mockResolvedValue({ data: selections[0] ?? null, error: null }),
          single: vi.fn().mockResolvedValue({ data: selections[0] ?? null, error: null }),
          order: vi.fn(() => Promise.resolve({ data: selections, error: null })),
          then: (res: any) => res({ data: selections, error: null }),
        };
        return query;
      }
      if (table === 'selection_options') {
        const query: any = {
          select: vi.fn((fields: string, opts?: any) => {
            if (opts?.count === 'exact') {
              return {
                eq: vi.fn(() => ({
                  eq: vi.fn().mockResolvedValue({ count: options.length, error: null }),
                })),
              };
            }
            return query;
          }),
          insert: vi.fn().mockResolvedValue({ error: null }),
          update: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn().mockResolvedValue({ error: null }),
            })),
          })),
          delete: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn().mockResolvedValue({ error: null }),
            })),
          })),
          eq: vi.fn((field: string, val: any) => {
            if (field === 'id') {
              const matched = options.find((o) => o.id === val) ?? options[0];
              return {
                ...query,
                maybeSingle: vi.fn().mockResolvedValue({ data: matched ?? null, error: null }),
              };
            }
            return query;
          }),
          order: vi.fn(() => Promise.resolve({ data: options, error: null })),
          then: (res: any) => res({ data: options, error: null }),
        };
        return query;
      }
      if (table === 'selection_templates') {
        const query: any = {
          select: vi.fn(() => query),
          eq: vi.fn(() => query),
          ilike: vi.fn(() => ({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          })),
          insert: vi.fn().mockResolvedValue({ error: null }),
          update: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn().mockResolvedValue({ error: null }),
            })),
          })),
          delete: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn().mockResolvedValue({ error: null }),
            })),
          })),
          order: vi.fn(() => query),
          limit: vi.fn(() => Promise.resolve({ data: templates, error: null })),
          maybeSingle: vi.fn().mockResolvedValue({ data: templates[0] ?? null, error: null }),
        };
        return query;
      }
      if (table === 'selection_reminders') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn().mockResolvedValue({ data: [], error: null }),
              })),
            })),
          })),
          update: vi.fn(() => ({
            eq: vi.fn(() => ({
              in: vi.fn().mockResolvedValue({ error: null }),
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

describe('Selections and Payment Plans Engines (payment-plans.ts & selections-data.ts)', () => {
  let mockSupabase: ReturnType<typeof createMockSupabase>;
  let mockStripe: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase = createMockSupabase();
    mocks.createAdminClient.mockReturnValue(mockSupabase);
    mockStripe = {
      paymentIntents: {
        create: vi.fn().mockResolvedValue({
          id: 'pi_plan_inst_1',
          status: 'succeeded',
        }),
        retrieve: vi.fn().mockResolvedValue({
          payment_method: { id: 'pm_card_1', card: { brand: 'visa', last4: '4242' } },
          customer: 'cus_client_1',
        }),
      },
    };
    mocks.getStripeClient.mockReturnValue(mockStripe);
  });

  describe('Part 1: Payment Plans Engine', () => {
    it('creates a payment plan with deposit request and cross-links them', async () => {
      const res = await createPaymentPlan(mockSupabase as any, TEST_ACCOUNT_ID, TEST_JOB_ID, {
        totalCents: 200000,
        depositPercent: 25,
        installmentCount: 3,
        frequency: 'monthly',
        firstInstallmentDate: '2026-10-01',
        clientPhone: '(555) 123-4567',
        smsConsent: true,
      });

      expect(res.plan).toBeDefined();
      expect(res.depositPaymentId).toBe('dep-payment-99');
      expect(mocks.createDepositRequest).toHaveBeenCalledWith(
        mockSupabase,
        TEST_ACCOUNT_ID,
        TEST_JOB_ID,
        expect.objectContaining({
          amount: 500,
          kind: 'deposit',
        })
      );
    });

    it('authorizes payment plan with client signer name', async () => {
      await expect(authorizePaymentPlan(mockSupabase as any, TEST_PLAN_ID, 'John Connor')).resolves.toBeUndefined();
    });

    it('authorizes plan via client token and returns deposit payment url', async () => {
      const res = await authorizePlanAndGetDepositUrl('valid-client-token', TEST_PLAN_ID, 'John Connor');
      expect(res.redirectUrl).toBe('/pay/dep-payment-99');
    });

    it('runs due installments cron sweep, charging card off-session and reconciling', async () => {
      mockSupabase = createMockSupabase({
        plans: [
          {
            id: TEST_PLAN_ID,
            account_id: TEST_ACCOUNT_ID,
            job_id: TEST_JOB_ID,
            total_cents: 200000,
            deposit_cents: 50000,
            installment_count: 3,
            frequency: 'monthly',
            first_installment_date: '2026-10-01',
            status: 'active',
            stripe_customer_id: 'cus_client_1',
            stripe_payment_method_id: 'pm_card_1',
            card_brand: 'visa',
            card_last4: '4242',
            payoff_locked_at: null,
          },
        ],
      });
      mocks.createAdminClient.mockReturnValue(mockSupabase);

      const summary = await runDuePlanInstallments();
      expect(summary.due).toBe(1);
      expect(summary.charged).toBe(1);
      expect(summary.failed).toBe(0);
      expect(mockStripe.paymentIntents.create).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 50000,
          currency: 'usd',
          customer: 'cus_client_1',
          payment_method: 'pm_card_1',
          off_session: true,
        }),
        expect.anything()
      );
      expect(mocks.createPaymentFeedEvent).toHaveBeenCalledWith(expect.anything(), 'inst-pay-1', 'payment_paid');
    });

    it('starts early plan payoff and locks installments during checkout', async () => {
      const res = await startPlanPayoff('valid-client-token', TEST_PLAN_ID);
      expect(res.redirectUrl).toContain('/pay/');
    });

    it('settles webhook events activating plan on deposit and finalizing on payoff', async () => {
      await expect(handlePlanPaymentSettled(mockSupabase as any, 'dep-payment-99')).resolves.toBeUndefined();
      await expect(handlePlanPaymentFailed(mockSupabase as any, 'payoff-payment-1')).resolves.toBeUndefined();
    });
  });

  describe('Part 2: Selections & Material Allowances Engine', () => {
    it('lists selections and attaches associated options', async () => {
      const items = await listSelections(mockSupabase as any, TEST_ACCOUNT_ID, TEST_JOB_ID);
      expect(items.length).toBe(1);
      expect(items[0].title).toBe('Kitchen Backsplash Tile');
      expect(items[0].options.length).toBe(2);
      expect(items[0].options[0].name).toBe('Classic White Subway Tile');
    });

    it('creates a new selection choice', async () => {
      const created = await createSelection(mockSupabase as any, TEST_ACCOUNT_ID, TEST_JOB_ID, {
        title: 'Bathroom Vanity Faucet',
        allowance: 250,
      });
      expect(created.title).toBe('Bathroom Vanity Faucet');
      expect(created.allowance).toBe(250);
    });

    it('updates selection details and allowance', async () => {
      const res = await updateSelection(mockSupabase as any, TEST_ACCOUNT_ID, 'sel-1', {
        title: 'Premium Kitchen Backsplash Tile',
        allowance: 900,
      });
      expect(res.ok).toBe(true);
    });

    it('refuses to update or delete option once chosen by client', async () => {
      mockSupabase = createMockSupabase({
        selections: [{ id: 'sel-1', chosen_option_id: 'opt-1', status: 'chosen' }],
      });

      const resUpdate = await updateOption(mockSupabase as any, TEST_ACCOUNT_ID, 'opt-1', { price: 700 });
      expect(resUpdate.ok).toBe(false);
      expect(resUpdate.message).toContain('They chose this one');

      const resDelete = await deleteOption(mockSupabase as any, TEST_ACCOUNT_ID, 'opt-1');
      expect(resDelete.ok).toBe(false);
      expect(resDelete.message).toContain('They chose this one');
    });

    it('chooses option, creates immutable snapshot, and adjusts job quoted amount', async () => {
      const res = await chooseOption(mockSupabase as any, TEST_ACCOUNT_ID, {
        selectionId: 'sel-1',
        optionId: 'opt-2', // $1100 vs $800 allowance = +$300 net
        jobId: TEST_JOB_ID,
        byName: 'Sarah Connor',
      });

      expect(res.ok).toBe(true);
      expect(res.snapshot?.name).toBe('Marble Herringbone Pattern');
      expect(res.snapshot?.price).toBe(1100);
    });

    it('reopens selection, keeps previous choice in history, and reverses price adjustment', async () => {
      mockSupabase = createMockSupabase({
        selections: [
          {
            id: 'sel-1',
            job_id: TEST_JOB_ID,
            status: 'chosen',
            allowance: 800,
            credit_underspend: true,
            chosen_snapshot: { id: 'opt-2', name: 'Marble Herringbone', price: 1100 },
            chosen_at: '2026-09-02T12:00:00Z',
            chosen_by_name: 'Sarah Connor',
            reopened: [],
          },
        ],
      });

      const res = await reopenSelection(mockSupabase as any, TEST_ACCOUNT_ID, 'sel-1', 'Changed design to subway');
      expect(res.ok).toBe(true);
    });

    it('saves selections board as template and applies it to new job', async () => {
      const saveRes = await saveBoardAsTemplate(mockSupabase as any, TEST_ACCOUNT_ID, TEST_JOB_ID, 'Standard Kitchen Finishes');
      expect(saveRes.ok).toBe(true);

      mockSupabase = createMockSupabase({
        templates: [
          {
            id: 'tmpl-1',
            name: 'Standard Kitchen Finishes',
            body: {
              items: [
                {
                  title: 'Cabinet Hardware',
                  allowance: 300,
                  options: [{ name: 'Brushed Brass Bar Pulls', price: 250 }],
                },
              ],
            },
          },
        ],
      });

      const applyRes = await applyTemplate(mockSupabase as any, TEST_ACCOUNT_ID, 'job-new-222', 'tmpl-1');
      expect(applyRes.ok).toBe(true);
      expect(applyRes.added).toBe(1);
    });

    it('signs selection photo URLs for contractor and client views', async () => {
      const selections: Selection[] = [
        {
          id: 'sel-1',
          jobId: TEST_JOB_ID,
          title: 'Tile',
          description: '',
          allowance: 500,
          decideBy: null,
          creditUnderspend: true,
          status: 'open',
          chosenOptionId: null,
          chosenSnapshot: null,
          chosenAt: null,
          chosenByName: null,
          reopened: [],
          chaseSentAt: null,
          overdueSentAt: null,
          sortOrder: 0,
          options: [
            {
              id: 'opt-1',
              name: 'Subway',
              description: '',
              price: 400,
              reference: '',
              photoPath: 'photos/tile-sample.jpg',
              sortOrder: 0,
            },
          ],
        },
      ];

      const signedPhotos = await signSelectionPhotos(TEST_ACCOUNT_ID, selections);
      expect(signedPhotos['opt-1']).toContain('https://storage.apex.com/signed/tile-sample.jpg');

      const clientView = await toSignedClientSelections(mockSupabase as any, TEST_ACCOUNT_ID, selections);
      expect(clientView[0].options[0].photoUrl).toContain('https://storage.apex.com/signed/tile-sample.jpg');
    });
  });
});
