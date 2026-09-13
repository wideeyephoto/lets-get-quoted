import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  cookies: vi.fn(async () => ({
    get: vi.fn().mockReturnValue(undefined),
  })),
  requireOfficeContext: vi.fn(),
  buildPayConfirmation: vi.fn(),
  canApproveRow: vi.fn((r) => r.review !== 'approved'),
  formatKeyDay: vi.fn((d) => d),
  needsReapproval: vi.fn(() => false),
  formatKeyRange: vi.fn((s, e) => `${s} to ${e}`),
  normalizePaymentMethod: vi.fn((m) => m || 'direct_deposit'),
  payBlockedReason: vi.fn((r) => (r.blockers?.[0] ? `Blocked: ${r.blockers[0]}` : null)),
  payMoney: vi.fn((m) => `$${Number(m).toFixed(2)}`),
  paymentDateProblem: vi.fn((d) => (!d ? 'Pick the date the payment actually leaves your account.' : null)),
  periodEndKey: vi.fn(() => '2026-09-20'),
  periodStartKey: vi.fn(() => '2026-09-14'),
  summarizePayTotals: vi.fn(() => ({
    crewCount: 2,
    hours: 80,
    needsReview: 0,
    paid: 1,
    paidPay: 1500,
  })),
  approveHours: vi.fn(),
  closePayPeriod: vi.fn(),
  ensurePayPeriodRow: vi.fn(),
  loadCrewPayContext: vi.fn(),
  logPayEvent: vi.fn(),
  markPaid: vi.fn(),
  markSentToPayroll: vi.fn(),
  reopenPayPeriod: vi.fn(),
  reopenGuard: vi.fn((): string | null => null),
  setEntryLocked: vi.fn(),
  snapshotOf: vi.fn((r) => ({ crewId: r.crewId, hours: r.hours })),
  undoPaid: vi.fn(),
  normalizeOffset: vi.fn((o) => Number(o) || 0),
  normalizePeriodMode: vi.fn((m) => m || 'weekly'),
  resolvePayPeriod: vi.fn(() => ({
    rangeLabel: 'Sep 14 – Sep 20, 2026',
    startKey: '2026-09-14',
    endKey: '2026-09-20',
  })),
  laborRulesFromAccount: vi.fn(() => ({
    overtimeThreshold: 40,
    rounding: 'exact',
  })),
  normalizeLaborSettings: vi.fn(() => ({})),
  normalizePayrollProvider: vi.fn((p) => p || 'gusto'),
  validatePayrollSubmission: vi.fn(),
  buildProviderPayload: vi.fn(),
  submitPayrollToProvider: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}));

vi.mock('next/headers', () => ({
  cookies: mocks.cookies,
}));

vi.mock('@/lib/auth', () => ({
  requireOfficeContext: mocks.requireOfficeContext,
}));

vi.mock('@/lib/crew-pay', () => ({
  buildPayConfirmation: mocks.buildPayConfirmation,
  canApproveRow: mocks.canApproveRow,
  formatKeyDay: mocks.formatKeyDay,
  needsReapproval: mocks.needsReapproval,
  formatKeyRange: mocks.formatKeyRange,
  normalizePaymentMethod: mocks.normalizePaymentMethod,
  payBlockedReason: mocks.payBlockedReason,
  payMoney: mocks.payMoney,
  paymentDateProblem: mocks.paymentDateProblem,
  periodEndKey: mocks.periodEndKey,
  periodStartKey: mocks.periodStartKey,
  summarizePayTotals: mocks.summarizePayTotals,
}));

vi.mock('@/lib/crew-pay-data', () => ({
  approveHours: mocks.approveHours,
  closePayPeriod: mocks.closePayPeriod,
  ensurePayPeriodRow: mocks.ensurePayPeriodRow,
  loadCrewPayContext: mocks.loadCrewPayContext,
  logPayEvent: mocks.logPayEvent,
  markPaid: mocks.markPaid,
  markSentToPayroll: mocks.markSentToPayroll,
  PayUnavailableError: class PayUnavailableError extends Error {
    constructor() {
      super('Pay data is unavailable right now.');
      this.name = 'PayUnavailableError';
    }
  },
  reopenPayPeriod: mocks.reopenPayPeriod,
  reopenGuard: mocks.reopenGuard,
  setEntryLocked: mocks.setEntryLocked,
  snapshotOf: mocks.snapshotOf,
  undoPaid: mocks.undoPaid,
}));

vi.mock('@/lib/labor', () => ({
  normalizeOffset: mocks.normalizeOffset,
  normalizePeriodMode: mocks.normalizePeriodMode,
  resolvePayPeriod: mocks.resolvePayPeriod,
}));

vi.mock('@/lib/labor-settings', () => ({
  LABOR_RULE_COLUMNS: 'overtime_threshold, rounding_rule',
  LABOR_SETTINGS_COOKIE: 'labor_settings',
  laborRulesFromAccount: mocks.laborRulesFromAccount,
  normalizeLaborSettings: mocks.normalizeLaborSettings,
}));

vi.mock('@/lib/payroll-export', () => ({
  normalizePayrollProvider: mocks.normalizePayrollProvider,
  PAYROLL_PROVIDER_LABEL: { gusto: 'Gusto', quickbooks: 'QuickBooks' },
}));

vi.mock('@/lib/payroll-api-integration', () => ({
  validatePayrollSubmission: mocks.validatePayrollSubmission,
  buildProviderPayload: mocks.buildProviderPayload,
  submitPayrollToProvider: mocks.submitPayrollToProvider,
}));

import {
  approveHoursAction,
  markPaidAction,
  markSentAction,
  submitPayrollApiAction,
  recordExportAction,
  undoPaidAction,
  setEntryLockAction,
  closePeriodAction,
  reopenPeriodAction,
} from '@/app/dashboard/crew/pay-actions';

const TEST_ACCOUNT_ID = 'acc-crew-pay-123';
const TEST_USER_EMAIL = 'owner@apexplumbing.com';

function createMockSupabase(accountOverrides = {}) {
  return {
    from: vi.fn((table: string) => {
      if (table === 'accounts') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  timezone: 'America/New_York',
                  require_separate_payer: false,
                  overtime_threshold: 40,
                  ...accountOverrides,
                },
                error: null,
              }),
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

describe('Crew Pay Server Actions (dashboard/crew/pay-actions.ts)', () => {
  let mockSupabase: ReturnType<typeof createMockSupabase>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase = createMockSupabase();
    mocks.requireOfficeContext.mockResolvedValue({
      supabase: mockSupabase,
      accountId: TEST_ACCOUNT_ID,
      userEmail: TEST_USER_EMAIL,
    });
    mocks.ensurePayPeriodRow.mockResolvedValue({ id: 'period-row-99' });
    mocks.loadCrewPayContext.mockResolvedValue({
      available: true,
      periodRow: { id: 'period-row-99' },
      rows: [
        {
          crewId: 'crew-1',
          name: 'Dave Miller',
          hours: 40,
          eligible: true,
          estimatedPay: 1400,
          review: 'unapproved',
          payment: 'unpaid',
          blockers: [],
          record: null,
        },
        {
          crewId: 'crew-2',
          name: 'Sarah Connor',
          hours: 35,
          eligible: true,
          estimatedPay: 1225,
          review: 'approved',
          payment: 'unpaid',
          blockers: [],
          record: { id: 'entry-rec-2', approvedBy: TEST_USER_EMAIL },
        },
      ],
    });
  });

  describe('approveHoursAction', () => {
    it('returns fail if pay data is unavailable', async () => {
      mocks.loadCrewPayContext.mockResolvedValueOnce({ available: false, rows: [] });
      const fd = new FormData();
      const res = await approveHoursAction({ ok: false, message: '' }, fd);
      expect(res).toEqual({
        ok: false,
        message: 'Pay data is unavailable right now.',
        detail: undefined,
      });
    });

    it('returns fail when no rows are approvable because of blockers', async () => {
      mocks.loadCrewPayContext.mockResolvedValueOnce({
        available: true,
        rows: [
          {
            crewId: 'crew-1',
            name: 'Dave',
            hours: 20,
            eligible: true,
            estimatedPay: 700,
            blockers: ['open_shift'],
            review: 'unapproved',
          },
        ],
      });
      const fd = new FormData();
      fd.append('crewIds', 'crew-1');

      const res = await approveHoursAction({ ok: false, message: '' }, fd);
      expect(res.ok).toBe(false);
      expect(res.message).toContain('1 entry has something to sort out first.');
      expect(res.detail).toContain('Blocked: open_shift');
    });

    it('returns fail when hours are already approved and settled', async () => {
      mocks.canApproveRow.mockReturnValue(false);
      const fd = new FormData();
      fd.append('crewIds', 'crew-2');

      const res = await approveHoursAction({ ok: false, message: '' }, fd);
      expect(res.ok).toBe(false);
      expect(res.message).toBe('These hours are already approved and nothing has changed since.');
    });

    it('successfully approves eligible hours and logs pay audit event', async () => {
      mocks.canApproveRow.mockImplementation((r) => r.crewId === 'crew-1');
      const fd = new FormData();
      fd.append('crewIds', 'crew-1');

      const res = await approveHoursAction({ ok: false, message: '' }, fd);
      expect(res.ok).toBe(true);
      expect(res.message).toBe('Dave Miller’s hours are approved.');
      expect(mocks.approveHours).toHaveBeenCalledWith(
        mockSupabase,
        TEST_ACCOUNT_ID,
        'period-row-99',
        expect.any(Array),
        TEST_USER_EMAIL,
        expect.objectContaining({ overtimeThreshold: 40 })
      );
      expect(mocks.logPayEvent).toHaveBeenCalledWith(
        mockSupabase,
        TEST_ACCOUNT_ID,
        expect.objectContaining({
          periodId: 'period-row-99',
          action: 'hours_approved',
          actorEmail: TEST_USER_EMAIL,
        })
      );
      expect(mocks.revalidatePath).toHaveBeenCalledWith('/dashboard/crew');
    });
  });

  describe('markPaidAction', () => {
    it('returns fail if paymentDate is invalid', async () => {
      const fd = new FormData();
      // missing paymentDate
      const res = await markPaidAction({ ok: false, message: '' }, fd);
      expect(res.ok).toBe(false);
      expect(res.message).toContain('Pick the date the payment actually leaves');
    });

    it('returns fail if no crew members selected', async () => {
      const fd = new FormData();
      fd.append('paymentDate', '2026-09-21');

      const res = await markPaidAction({ ok: false, message: '' }, fd);
      expect(res.ok).toBe(false);
      expect(res.message).toBe('Choose who this payment covers.');
    });

    it('enforces two-person rule when require_separate_payer is enabled and user self-approved', async () => {
      mockSupabase = createMockSupabase({ require_separate_payer: true });
      mocks.requireOfficeContext.mockResolvedValueOnce({
        supabase: mockSupabase,
        accountId: TEST_ACCOUNT_ID,
        userEmail: TEST_USER_EMAIL,
      });

      mocks.buildPayConfirmation.mockReturnValueOnce({
        rows: [
          {
            crewId: 'crew-2',
            name: 'Sarah Connor',
            record: { approvedBy: TEST_USER_EMAIL },
          },
        ],
        excluded: [],
      });

      const fd = new FormData();
      fd.append('paymentDate', '2026-09-21');
      fd.append('crewIds', 'crew-2');

      const res = await markPaidAction({ ok: false, message: '' }, fd);
      expect(res.ok).toBe(false);
      expect(res.message).toBe('Somebody else has to record this payment.');
    });

    it('returns fail if confirmation requires acknowledgement and it was not provided', async () => {
      mocks.buildPayConfirmation.mockReturnValueOnce({
        rows: [{ crewId: 'crew-1', name: 'Dave Miller' }],
        requiresAcknowledgement: true,
        excluded: [],
      });

      const fd = new FormData();
      fd.append('paymentDate', '2026-09-21');
      fd.append('crewIds', 'crew-1');

      const res = await markPaidAction({ ok: false, message: '' }, fd);
      expect(res.ok).toBe(false);
      expect(res.message).toContain('Some of these entries have a warning on them.');
    });

    it('successfully marks payment paid and logs event', async () => {
      mocks.buildPayConfirmation.mockReturnValueOnce({
        rows: [{ crewId: 'crew-1', name: 'Dave Miller', estimatedPay: 1400 }],
        requiresAcknowledgement: false,
        crewCount: 1,
        amount: 1400,
        excluded: [],
      });

      const fd = new FormData();
      fd.append('paymentDate', '2026-09-21');
      fd.append('crewIds', 'crew-1');
      fd.append('paymentMethod', 'direct_deposit');
      fd.append('paymentReference', 'TXN-998877');

      const res = await markPaidAction({ ok: false, message: '' }, fd);
      expect(res.ok).toBe(true);
      expect(res.message).toBe('Dave Miller marked paid for 2026-09-14 to 2026-09-20.');
      expect(mocks.markPaid).toHaveBeenCalledWith(
        mockSupabase,
        TEST_ACCOUNT_ID,
        'period-row-99',
        expect.any(Array),
        expect.objectContaining({
          paymentDate: '2026-09-21',
          paymentMethod: 'direct_deposit',
          paymentReference: 'TXN-998877',
        }),
        TEST_USER_EMAIL
      );
      expect(mocks.logPayEvent).toHaveBeenCalledWith(
        mockSupabase,
        TEST_ACCOUNT_ID,
        expect.objectContaining({
          action: 'marked_paid',
          actorEmail: TEST_USER_EMAIL,
        })
      );
    });
  });

  describe('markSentAction', () => {
    it('fails if no chosen rows are approved and unpaid', async () => {
      const fd = new FormData();
      fd.append('crewIds', 'crew-1'); // crew-1 is unapproved in default state

      const res = await markSentAction({ ok: false, message: '' }, fd);
      expect(res.ok).toBe(false);
      expect(res.message).toBe('Only approved, unpaid hours can be marked as sent to payroll.');
    });

    it('marks approved unpaid rows as sent to payroll', async () => {
      const fd = new FormData();
      fd.append('crewIds', 'crew-2'); // crew-2 is approved and unpaid

      const res = await markSentAction({ ok: false, message: '' }, fd);
      expect(res.ok).toBe(true);
      expect(res.message).toContain('1 marked as sent to payroll');
      expect(mocks.markSentToPayroll).toHaveBeenCalled();
      expect(mocks.logPayEvent).toHaveBeenCalledWith(
        mockSupabase,
        TEST_ACCOUNT_ID,
        expect.objectContaining({
          action: 'marked_sent',
          actorEmail: TEST_USER_EMAIL,
        })
      );
    });
  });

  describe('submitPayrollApiAction', () => {
    it('fails when payroll submission validation fails', async () => {
      mocks.validatePayrollSubmission.mockReturnValueOnce({
        valid: false,
        problems: ['Missing employee SSN'],
        excluded: [{ name: 'Dave', reason: 'Unmapped tax ID' }],
      });

      const fd = new FormData();
      fd.append('payrollProvider', 'gusto');
      fd.append('crewIds', 'crew-2');

      const res = await submitPayrollApiAction({ ok: false, message: '' }, fd);
      expect(res.ok).toBe(false);
      expect(res.message).toContain('Validation failed before sending to Gusto.');
      expect(res.detail).toContain('Missing employee SSN');
    });

    it('transmits payload to provider and marks sent on API success', async () => {
      mocks.validatePayrollSubmission.mockReturnValueOnce({
        valid: true,
        payable: [{ crewId: 'crew-2', hours: 35, gross: 1225 }],
        totalGross: 1225,
        totalHours: 35,
      });
      mocks.buildProviderPayload.mockReturnValueOnce({ batches: [] });
      mocks.submitPayrollToProvider.mockResolvedValueOnce({
        success: true,
        batchId: 'BATCH-GUSTO-101',
        transactionId: 'TX-GUSTO-999',
      });

      const fd = new FormData();
      fd.append('payrollProvider', 'gusto');
      fd.append('crewIds', 'crew-2');

      const res = await submitPayrollApiAction({ ok: false, message: '' }, fd);
      expect(res.ok).toBe(true);
      expect(res.message).toContain('Submitted 1 records to Gusto (Batch #BATCH-GUSTO-101).');
      expect(mocks.submitPayrollToProvider).toHaveBeenCalled();
      expect(mocks.markSentToPayroll).toHaveBeenCalled();
      expect(mocks.logPayEvent).toHaveBeenCalled();
    });
  });

  describe('recordExportAction', () => {
    it('records export without altering status of rows', async () => {
      const fd = new FormData();
      const res = await recordExportAction({ ok: false, message: '' }, fd);
      expect(res.ok).toBe(true);
      expect(res.message).toBe('Export recorded in this period’s history.');
      expect(mocks.logPayEvent).toHaveBeenCalledWith(
        mockSupabase,
        TEST_ACCOUNT_ID,
        expect.objectContaining({ action: 'export_created' })
      );
    });
  });

  describe('undoPaidAction', () => {
    it('fails if reason is omitted', async () => {
      const fd = new FormData();
      fd.append('crewId', 'crew-1');
      // missing reason

      const res = await undoPaidAction({ ok: false, message: '' }, fd);
      expect(res.ok).toBe(false);
      expect(res.message).toContain('Say why this payment status is being undone.');
    });

    it('fails if crew member is not marked paid', async () => {
      const fd = new FormData();
      fd.append('crewId', 'crew-1');
      fd.append('reason', 'Wrong bank account');

      const res = await undoPaidAction({ ok: false, message: '' }, fd);
      expect(res.ok).toBe(false);
      expect(res.message).toBe('No payment record to undo.');
    });

    it('successfully undos paid status with reason logged in audit history', async () => {
      mocks.loadCrewPayContext.mockResolvedValueOnce({
        available: true,
        rows: [
          {
            crewId: 'crew-1',
            name: 'Dave Miller',
            payment: 'paid',
            paidAmount: 1400,
            record: { id: 'pay-entry-1', paymentDate: '2026-09-20' },
          },
        ],
      });

      const fd = new FormData();
      fd.append('crewId', 'crew-1');
      fd.append('reason', 'Overpaid by 5 hours, reissuing check');

      const res = await undoPaidAction({ ok: false, message: '' }, fd);
      expect(res.ok).toBe(true);
      expect(res.message).toBe('Dave Miller is back to approved and unpaid.');
      expect(mocks.undoPaid).toHaveBeenCalledWith(mockSupabase, TEST_ACCOUNT_ID, 'pay-entry-1');
      expect(mocks.logPayEvent).toHaveBeenCalledWith(
        mockSupabase,
        TEST_ACCOUNT_ID,
        expect.objectContaining({
          action: 'paid_undone',
          reason: 'Overpaid by 5 hours, reissuing check',
        })
      );
    });
  });

  describe('setEntryLockAction', () => {
    it('requires a reason when unlocking entry', async () => {
      mocks.loadCrewPayContext.mockResolvedValueOnce({
        available: true,
        rows: [
          {
            crewId: 'crew-1',
            name: 'Dave Miller',
            record: { id: 'entry-1' },
          },
        ],
      });

      const fd = new FormData();
      fd.append('crewId', 'crew-1');
      fd.append('locked', '0'); // unlocking
      // no reason

      const res = await setEntryLockAction({ ok: false, message: '' }, fd);
      expect(res.ok).toBe(false);
      expect(res.message).toBe('Say why this paid entry is being unlocked.');
    });

    it('locks or unlocks entry successfully', async () => {
      mocks.loadCrewPayContext.mockResolvedValueOnce({
        available: true,
        rows: [
          {
            crewId: 'crew-1',
            name: 'Dave Miller',
            record: { id: 'entry-1' },
          },
        ],
      });

      const fd = new FormData();
      fd.append('crewId', 'crew-1');
      fd.append('locked', '1');

      const res = await setEntryLockAction({ ok: false, message: '' }, fd);
      expect(res.ok).toBe(true);
      expect(res.message).toBe('Dave Miller’s entry is locked.');
      expect(mocks.setEntryLocked).toHaveBeenCalledWith(mockSupabase, TEST_ACCOUNT_ID, 'entry-1', true);
    });
  });

  describe('closePeriodAction and reopenPeriodAction', () => {
    it('fails to close period if there are unreviewed entries', async () => {
      mocks.summarizePayTotals.mockReturnValueOnce({
        crewCount: 2,
        hours: 80,
        needsReview: 1,
        paid: 1,
        paidPay: 1500,
      });

      const fd = new FormData();
      const res = await closePeriodAction({ ok: false, message: '' }, fd);
      expect(res.ok).toBe(false);
      expect(res.message).toContain('1 entry needs reviewing before this period can be closed.');
    });

    it('closes period cleanly when all entries reviewed', async () => {
      mocks.summarizePayTotals.mockReturnValueOnce({
        crewCount: 2,
        hours: 80,
        needsReview: 0,
        paid: 2,
        paidPay: 2625,
      });

      const fd = new FormData();
      const res = await closePeriodAction({ ok: false, message: '' }, fd);
      expect(res.ok).toBe(true);
      expect(res.message).toContain('is closed.');
      expect(mocks.closePayPeriod).toHaveBeenCalledWith(mockSupabase, TEST_ACCOUNT_ID, 'period-row-99', TEST_USER_EMAIL);
    });

    it('reopen fails if reason is missing', async () => {
      const fd = new FormData();
      const res = await reopenPeriodAction({ ok: false, message: '' }, fd);
      expect(res.ok).toBe(false);
      expect(res.message).toBe('Say why this period is being reopened. It stays in the history.');
    });

    it('reopen fails if reopenGuard blocks it', async () => {
      mocks.reopenGuard.mockReturnValueOnce('Cannot reopen a period that was closed more than 60 days ago.');
      const fd = new FormData();
      fd.append('reason', 'Late time card submitted');

      const res = await reopenPeriodAction({ ok: false, message: '' }, fd);
      expect(res.ok).toBe(false);
      expect(res.message).toBe('Cannot reopen a period that was closed more than 60 days ago.');
    });

    it('reopens closed period successfully', async () => {
      const fd = new FormData();
      fd.append('reason', 'Correcting missed shift hours');

      const res = await reopenPeriodAction({ ok: false, message: '' }, fd);
      expect(res.ok).toBe(true);
      expect(res.message).toContain('is open again.');
      expect(mocks.reopenPayPeriod).toHaveBeenCalledWith(
        mockSupabase,
        TEST_ACCOUNT_ID,
        'period-row-99',
        'Correcting missed shift hours'
      );
    });
  });
});
