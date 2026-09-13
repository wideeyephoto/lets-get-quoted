import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  requireOfficeContext: vi.fn(),
  refundPayment: vi.fn(),
  markInvoicePaidForPayment: vi.fn(),
  sendPaymentSmsEvent: vi.fn(),
  sendLienWaiverSms: vi.fn(),
  queueAccountSms: vi.fn(),
  sendCardUpdateSms: vi.fn(),
  loadBusinessName: vi.fn(),
  createJobFeedEvent: vi.fn(),
  assembleDisputeEvidence: vi.fn(),
  createTerminalConnectionToken: vi.fn(),
  listTerminalReaders: vi.fn(),
  registerTerminalReader: vi.fn(),
  createTerminalPaymentIntent: vi.fn(),
  simulateTerminalCardTap: vi.fn(),
  cancelTerminalReaderAction: vi.fn(),
  confirmTerminalPayment: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}));

vi.mock('next/navigation', () => ({
  unstable_rethrow: vi.fn((err: unknown) => {
    if (typeof err === 'object' && err !== null && 'digest' in err) {
      throw err;
    }
  }),
}));

vi.mock('@/lib/auth', () => ({
  requireOfficeContext: mocks.requireOfficeContext,
}));

vi.mock('@/lib/payments', () => ({
  refundPayment: mocks.refundPayment,
}));

vi.mock('@/lib/invoices', () => ({
  markInvoicePaidForPayment: mocks.markInvoicePaidForPayment,
}));

vi.mock('@/lib/sms', () => ({
  sendPaymentSmsEvent: mocks.sendPaymentSmsEvent,
  sendLienWaiverSms: mocks.sendLienWaiverSms,
  queueAccountSms: mocks.queueAccountSms,
  sendCardUpdateSms: mocks.sendCardUpdateSms,
}));

vi.mock('@/lib/business-name', () => ({
  loadBusinessName: mocks.loadBusinessName,
}));

vi.mock('@/lib/job-feed', () => ({
  createJobFeedEvent: mocks.createJobFeedEvent,
}));

vi.mock('@/lib/dispute-evidence', () => ({
  assembleDisputeEvidence: mocks.assembleDisputeEvidence,
}));

vi.mock('@/lib/stripe-terminal', () => ({
  createTerminalConnectionToken: mocks.createTerminalConnectionToken,
  listTerminalReaders: mocks.listTerminalReaders,
  registerTerminalReader: mocks.registerTerminalReader,
  createTerminalPaymentIntent: mocks.createTerminalPaymentIntent,
  simulateTerminalCardTap: mocks.simulateTerminalCardTap,
  cancelTerminalReaderAction: mocks.cancelTerminalReaderAction,
  confirmTerminalPayment: mocks.confirmTerminalPayment,
}));

import {
  recordManualPaymentAction,
  recordBatchInvoiceSettlementAction,
  issueRefundAction,
  createInstantPayLinkAction,
  assembleDisputeEvidenceAction,
  getClientStatementDataAction,
  recordPromiseToPayAction,
  sendCustomPaymentReminderAction,
  generateAccountingJournalCsvAction,
  getTerminalConnectionTokenAction,
  listTerminalReadersAction,
  registerTerminalReaderAction,
  createTerminalPaymentIntentAction,
  simulateTerminalTapAction,
  cancelTerminalAction,
  confirmTerminalPaymentAction,
} from '@/app/dashboard/payments/actions';

describe('Dashboard Payments Server Actions (dashboard/payments/actions.ts)', () => {
  const TEST_ACCOUNT_ID = 'acc-test-999';

  function createMockSupabase(overrides: Record<string, any> = {}) {
    return {
      from: vi.fn((table: string) => {
        const chain: any = {
          select: vi.fn().mockReturnThis(),
          insert: vi.fn().mockReturnThis(),
          update: vi.fn().mockReturnThis(),
          delete: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          neq: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          ilike: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { id: 'item-1' }, error: null }),
          maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'item-1' }, error: null }),
        };

        if (overrides[table]) {
          Object.assign(chain, overrides[table]);
        }

        // Return standard resolves if not overridden
        if (!chain.then) {
          chain.then = (resolve: any) => resolve({ data: [{ id: 'item-1' }], error: null });
        }

        return chain;
      }),
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireOfficeContext.mockResolvedValue({
      supabase: createMockSupabase(),
      accountId: TEST_ACCOUNT_ID,
      role: 'owner',
    });
  });

  describe('recordManualPaymentAction', () => {
    it('rejects missing jobId', async () => {
      const fd = new FormData();
      fd.append('amount', '100');
      const res = await recordManualPaymentAction(fd);
      expect(res.success).toBe(false);
      expect(res.error).toBe('Select a job.');
    });

    it('rejects invalid or non-positive amount', async () => {
      const fd = new FormData();
      fd.append('jobId', 'job-123');
      fd.append('amount', '0');
      const res = await recordManualPaymentAction(fd);
      expect(res.success).toBe(false);
      expect(res.error).toBe('Enter a valid amount greater than $0.');
    });

    it('successfully records cash payment and revalidates paths', async () => {
      const mockSupabase = createMockSupabase({
        payments: {
          insert: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { id: 'pay-777' }, error: null }),
        },
      });
      mocks.requireOfficeContext.mockResolvedValue({
        supabase: mockSupabase,
        accountId: TEST_ACCOUNT_ID,
      });

      const fd = new FormData();
      fd.append('jobId', 'job-123');
      fd.append('amount', '250.50');
      fd.append('method', 'Cash');
      fd.append('note', 'paid on site');

      const res = await recordManualPaymentAction(fd);
      expect(res.success).toBe(true);
      expect(res.message).toContain('Recorded Cash payment of $250.50.');
      expect(mocks.revalidatePath).toHaveBeenCalledWith('/dashboard/payments');
      expect(mocks.revalidatePath).toHaveBeenCalledWith('/dashboard/cash-flow');
      expect(mocks.revalidatePath).toHaveBeenCalledWith('/dashboard/jobs/job-123');
    });

    it('marks linked invoice paid when invoiceId is supplied', async () => {
      const fd = new FormData();
      fd.append('jobId', 'job-123');
      fd.append('invoiceId', 'inv-456');
      fd.append('amount', '500');
      fd.append('method', 'Check');

      const res = await recordManualPaymentAction(fd);
      expect(res.success).toBe(true);
      expect(mocks.markInvoicePaidForPayment).toHaveBeenCalledWith(expect.anything(), 'inv-456');
    });

    it('handles database insert error gracefully', async () => {
      const mockSupabase = createMockSupabase({
        payments: {
          insert: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: null, error: new Error('DB write failure') }),
        },
      });
      mocks.requireOfficeContext.mockResolvedValue({
        supabase: mockSupabase,
        accountId: TEST_ACCOUNT_ID,
      });

      const fd = new FormData();
      fd.append('jobId', 'job-123');
      fd.append('amount', '100');

      const res = await recordManualPaymentAction(fd);
      expect(res.success).toBe(false);
      expect(res.error).toContain('DB write failure');
    });
  });

  describe('recordBatchInvoiceSettlementAction', () => {
    it('returns error when allocations array is empty', async () => {
      const res = await recordBatchInvoiceSettlementAction('job-1', 'Wire', []);
      expect(res.success).toBe(false);
      expect(res.error).toBe('No invoices selected for settlement.');
    });

    it('settles multiple invoices in batch and records payments', async () => {
      const mockInsert = vi.fn().mockResolvedValue({ error: null });
      const mockSupabase = createMockSupabase({
        payments: {
          insert: mockInsert,
        },
      });
      mocks.requireOfficeContext.mockResolvedValue({
        supabase: mockSupabase,
        accountId: TEST_ACCOUNT_ID,
      });

      const allocations = [
        { invoiceId: 'inv-1', amount: 300, ref: 'Inv #1' },
        { invoiceId: 'inv-2', amount: 450, ref: 'Inv #2' },
      ];

      const res = await recordBatchInvoiceSettlementAction('job-1', 'Bank Wire', allocations);
      expect(res.success).toBe(true);
      expect(res.message).toContain('Settled 2 invoices');
      expect(mocks.markInvoicePaidForPayment).toHaveBeenCalledTimes(2);
      expect(mocks.revalidatePath).toHaveBeenCalledWith('/dashboard/payments');
    });
  });

  describe('issueRefundAction', () => {
    it('requires paymentId', async () => {
      const fd = new FormData();
      const res = await issueRefundAction(fd);
      expect(res.success).toBe(false);
      expect(res.error).toBe('Payment ID is required.');
    });

    it('rejects invalid refund amount', async () => {
      const fd = new FormData();
      fd.append('paymentId', 'pay-123');
      fd.append('amount', '-50');
      const res = await issueRefundAction(fd);
      expect(res.success).toBe(false);
      expect(res.error).toBe('Enter a valid refund amount.');
    });

    it('calls refundPayment and returns formatted confirmation message', async () => {
      mocks.refundPayment.mockResolvedValue({ isFull: false, amount: 75.5 });
      const fd = new FormData();
      fd.append('paymentId', 'pay-123');
      fd.append('amount', '75.50');

      const res = await issueRefundAction(fd);
      expect(res.success).toBe(true);
      expect(res.message).toBe('Issued partial refund of $75.50.');
      expect(mocks.refundPayment).toHaveBeenCalledWith(expect.anything(), TEST_ACCOUNT_ID, 'pay-123', 75.5);
      expect(mocks.revalidatePath).toHaveBeenCalledWith('/dashboard/payments');
    });
  });

  describe('createInstantPayLinkAction', () => {
    it('validates jobId and amount', async () => {
      const fd = new FormData();
      fd.append('amount', '100');
      const res = await createInstantPayLinkAction(fd);
      expect(res.success).toBe(false);
      expect(res.error).toBe('Select a job.');
    });

    it('creates requested payment record and generates pay URL', async () => {
      const mockSupabase = createMockSupabase({
        payments: {
          insert: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { id: 'pay-new-99' }, error: null }),
        },
      });
      mocks.requireOfficeContext.mockResolvedValue({
        supabase: mockSupabase,
        accountId: TEST_ACCOUNT_ID,
      });

      const fd = new FormData();
      fd.append('jobId', 'job-555');
      fd.append('amount', '350.00');
      fd.append('phone', '555-0199');
      fd.append('sendSms', '1');

      const res = await createInstantPayLinkAction(fd);
      expect(res.success).toBe(true);
      expect(res.data?.paymentId).toBe('pay-new-99');
      expect(res.data?.payUrl).toContain('/pay/pay-new-99');
      expect(mocks.sendPaymentSmsEvent).toHaveBeenCalledWith('pay-new-99', 'payment_requested', TEST_ACCOUNT_ID);
    });
  });

  describe('assembleDisputeEvidenceAction', () => {
    it('assembles dispute bundle successfully', async () => {
      const mockBundle = { paymentId: 'pay-1', evidence: { status: 'won' } };
      mocks.assembleDisputeEvidence.mockResolvedValue(mockBundle);

      const res = await assembleDisputeEvidenceAction('pay-1');
      expect(res.success).toBe(true);
      expect(res.data).toEqual(mockBundle);
    });

    it('handles not found / null bundle', async () => {
      mocks.assembleDisputeEvidence.mockResolvedValue(null);
      const res = await assembleDisputeEvidenceAction('pay-nonexistent');
      expect(res.success).toBe(false);
      expect(res.error).toContain('Could not assemble dispute evidence');
    });
  });

  describe('getClientStatementDataAction', () => {
    it('returns error when no client jobs are found', async () => {
      const mockSupabase = {
        from: vi.fn(() => ({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          ilike: vi.fn().mockResolvedValue({ data: [], error: null }),
        })),
      };
      mocks.requireOfficeContext.mockResolvedValue({
        supabase: mockSupabase,
        accountId: TEST_ACCOUNT_ID,
      });

      const res = await getClientStatementDataAction('Nonexistent Client');
      expect(res.success).toBe(false);
      expect(res.error).toContain('No records found for client');
    });

    it('queries jobs, invoices, and payments in parallel', async () => {
      const mockSupabase = {
        from: vi.fn((table: string) => {
          if (table === 'jobs') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              ilike: vi.fn().mockResolvedValue({
                data: [{ id: 'job-1', client_name: 'Acme Corp' }],
                error: null,
              }),
            };
          }
          if (table === 'invoices') {
            return {
              select: vi.fn().mockReturnThis(),
              in: vi.fn().mockResolvedValue({
                data: [{ id: 'inv-1', job_id: 'job-1', total: 1000 }],
                error: null,
              }),
            };
          }
          if (table === 'payments') {
            return {
              select: vi.fn().mockReturnThis(),
              in: vi.fn().mockResolvedValue({
                data: [{ id: 'pay-1', job_id: 'job-1', amount: 500 }],
                error: null,
              }),
            };
          }
          return {};
        }),
      };
      mocks.requireOfficeContext.mockResolvedValue({
        supabase: mockSupabase,
        accountId: TEST_ACCOUNT_ID,
      });

      const res = await getClientStatementDataAction('Acme');
      expect(res.success).toBe(true);
      expect(res.data?.jobs).toHaveLength(1);
      expect(res.data?.invoices).toHaveLength(1);
      expect(res.data?.payments).toHaveLength(1);
    });
  });

  describe('recordPromiseToPayAction', () => {
    it('validates paymentId and promisedDate', async () => {
      const fd = new FormData();
      fd.append('paymentId', 'pay-1');
      const res = await recordPromiseToPayAction(fd);
      expect(res.success).toBe(false);
      expect(res.error).toBe('Promised payment date is required.');
    });

    it('updates payment due date and revalidates paths', async () => {
      const mockUpdate = vi.fn().mockReturnThis();
      const mockEq = vi.fn().mockReturnThis();
      const mockSupabase = {
        from: vi.fn(() => ({
          update: mockUpdate,
          eq: mockEq,
          then: (res: any) => res({ error: null }),
        })),
      };
      mocks.requireOfficeContext.mockResolvedValue({
        supabase: mockSupabase,
        accountId: TEST_ACCOUNT_ID,
      });

      const fd = new FormData();
      fd.append('paymentId', 'pay-1');
      fd.append('promisedDate', '2026-10-15');
      fd.append('note', 'Will pay after insurance check');

      const res = await recordPromiseToPayAction(fd);
      expect(res.success).toBe(true);
      expect(res.message).toContain('Recorded Promise-to-Pay');
      expect(mocks.revalidatePath).toHaveBeenCalledWith('/dashboard/payments');
    });
  });

  describe('sendCustomPaymentReminderAction', () => {
    it('dispatches payment reminder SMS event', async () => {
      const fd = new FormData();
      fd.append('paymentId', 'pay-444');

      const res = await sendCustomPaymentReminderAction(fd);
      expect(res.success).toBe(true);
      expect(mocks.sendPaymentSmsEvent).toHaveBeenCalledWith('pay-444', 'payment_requested', TEST_ACCOUNT_ID);
      expect(mocks.revalidatePath).toHaveBeenCalledWith('/dashboard/payments');
    });
  });

  describe('generateAccountingJournalCsvAction', () => {
    it('generates QBO format journal CSV', async () => {
      const mockSupabase = {
        from: vi.fn((table: string) => {
          if (table === 'payments') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              order: vi.fn().mockReturnThis(),
              limit: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: 'pay-1',
                    paid_at: '2026-06-01T12:00:00Z',
                    amount: 1500,
                    platform_fee: 45,
                    label: 'Roof repair deposit',
                    charge_model: 'stripe',
                    job_id: 'job-1',
                  },
                ],
                error: null,
              }),
            };
          }
          if (table === 'jobs') {
            return {
              select: vi.fn().mockReturnThis(),
              in: vi.fn().mockResolvedValue({
                data: [{ id: 'job-1', client_name: 'John Doe', ref: 'JOB-101' }],
                error: null,
              }),
            };
          }
          return {};
        }),
      };
      mocks.requireOfficeContext.mockResolvedValue({
        supabase: mockSupabase,
        accountId: TEST_ACCOUNT_ID,
      });

      const res = await generateAccountingJournalCsvAction('qbo');
      expect(res.success).toBe(true);
      expect(res.data).toContain('JournalNo,Date,AccountNo,AccountName,Debit,Credit,Description,Customer,JobRef');
      expect(res.data).toContain('John Doe');
      expect(res.data).toContain('Undeposited Funds / Cash Clearing');
    });

    it('generates Xero format journal CSV', async () => {
      const mockSupabase = {
        from: vi.fn((table: string) => {
          if (table === 'payments') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              order: vi.fn().mockReturnThis(),
              limit: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: 'pay-2',
                    paid_at: '2026-06-02T12:00:00Z',
                    amount: 800,
                    platform_fee: 0,
                    label: 'Cash settlement',
                    charge_model: 'manual',
                    job_id: 'job-2',
                  },
                ],
                error: null,
              }),
            };
          }
          if (table === 'jobs') {
            return {
              select: vi.fn().mockReturnThis(),
              in: vi.fn().mockResolvedValue({
                data: [{ id: 'job-2', client_name: 'Jane Smith', ref: 'JOB-102' }],
                error: null,
              }),
            };
          }
          return {};
        }),
      };
      mocks.requireOfficeContext.mockResolvedValue({
        supabase: mockSupabase,
        accountId: TEST_ACCOUNT_ID,
      });

      const res = await generateAccountingJournalCsvAction('xero');
      expect(res.success).toBe(true);
      expect(res.data).toContain('*JournalNumber,*Date,*AccountCode,*Description,*Debit,*Credit,Reference');
      expect(res.data).toContain('Jane Smith');
    });
  });

  describe('Stripe Terminal Actions', () => {
    it('getTerminalConnectionTokenAction returns token', async () => {
      mocks.createTerminalConnectionToken.mockResolvedValue({ secret: 'pst_test_secret' });
      const res = await getTerminalConnectionTokenAction();
      expect(res.success).toBe(true);
      expect(res.data?.secret).toBe('pst_test_secret');
    });

    it('listTerminalReadersAction returns list of readers', async () => {
      const mockReaders = [{ id: 'tmr_1', label: 'Front Desk Reader' }];
      mocks.listTerminalReaders.mockResolvedValue(mockReaders);
      const res = await listTerminalReadersAction('loc_123');
      expect(res.success).toBe(true);
      expect(res.data).toEqual(mockReaders);
    });

    it('registerTerminalReaderAction validates registration code', async () => {
      const res = await registerTerminalReaderAction('');
      expect(res.success).toBe(false);
      expect(res.error).toBe('Registration code is required.');
    });

    it('registerTerminalReaderAction registers reader with code', async () => {
      mocks.registerTerminalReader.mockResolvedValue({ id: 'tmr_2', label: 'Van 1 Mobile Reader' });
      const res = await registerTerminalReaderAction('simulated-wpe', 'Van 1 Mobile Reader');
      expect(res.success).toBe(true);
      expect(res.message).toContain('Registered reader "Van 1 Mobile Reader".');
    });

    it('createTerminalPaymentIntentAction initializes card collection and revalidates', async () => {
      mocks.createTerminalPaymentIntent.mockResolvedValue({ clientSecret: 'pi_test_secret', paymentIntentId: 'pi_123' });
      const res = await createTerminalPaymentIntentAction({
        jobId: 'job-777',
        amount: 350,
      });
      expect(res.success).toBe(true);
      expect(res.data?.paymentIntentId).toBe('pi_123');
      expect(mocks.revalidatePath).toHaveBeenCalledWith('/dashboard/payments');
      expect(mocks.revalidatePath).toHaveBeenCalledWith('/dashboard/jobs/job-777');
    });

    it('simulateTerminalTapAction simulates contactless card tap', async () => {
      mocks.simulateTerminalCardTap.mockResolvedValue({ status: 'succeeded' });
      const res = await simulateTerminalTapAction('tmr_1', 'pi_123');
      expect(res.success).toBe(true);
      expect(mocks.simulateTerminalCardTap).toHaveBeenCalledWith(expect.anything(), TEST_ACCOUNT_ID, 'tmr_1', 'pi_123');
    });

    it('cancelTerminalAction cancels reader action', async () => {
      mocks.cancelTerminalReaderAction.mockResolvedValue({ status: 'canceled' });
      const res = await cancelTerminalAction({ readerId: 'tmr_1' });
      expect(res.success).toBe(true);
      expect(mocks.cancelTerminalReaderAction).toHaveBeenCalledWith(expect.anything(), TEST_ACCOUNT_ID, { readerId: 'tmr_1' });
    });

    it('confirmTerminalPaymentAction confirms payment and revalidates', async () => {
      mocks.confirmTerminalPayment.mockResolvedValue({ status: 'succeeded', amount: 500 });
      const res = await confirmTerminalPaymentAction('pay-123', 'pi_123');
      expect(res.success).toBe(true);
      expect(mocks.revalidatePath).toHaveBeenCalledWith('/dashboard/payments');
      expect(mocks.revalidatePath).toHaveBeenCalledWith('/dashboard/cash-flow');
    });
  });
});
