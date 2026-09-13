import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  logQuickStopEvent: vi.fn(),
  getAccountOwnerEmail: vi.fn(),
  sendContractorAlertEmail: vi.fn(),
  loadBusinessName: vi.fn(),
  serviceDue: vi.fn(),
  todayKey: vi.fn(),
  backfillJobCoordinates: vi.fn(),
  backfillLeadCoordinates: vi.fn(),
  recordTenantAuditEvent: vi.fn(),
  claimClosureJob: vi.fn(),
  processClosureJob: vi.fn(),
  buildProductionClosureAdapters: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  createAdminClient: mocks.createAdminClient,
}));

vi.mock('@/lib/quick-stop-requests', () => ({
  logQuickStopEvent: mocks.logQuickStopEvent,
}));

vi.mock('@/lib/email', () => ({
  getAccountOwnerEmail: mocks.getAccountOwnerEmail,
  sendContractorAlertEmail: mocks.sendContractorAlertEmail,
}));

vi.mock('@/lib/business-name', () => ({
  loadBusinessName: mocks.loadBusinessName,
}));

vi.mock('@/lib/warranties', () => ({
  serviceDue: mocks.serviceDue,
  todayKey: mocks.todayKey,
}));

vi.mock('@/lib/jobs', () => ({
  backfillJobCoordinates: mocks.backfillJobCoordinates,
}));

vi.mock('@/lib/leads', () => ({
  backfillLeadCoordinates: mocks.backfillLeadCoordinates,
}));

vi.mock('@/lib/tenant-audit', () => ({
  recordTenantAuditEvent: mocks.recordTenantAuditEvent,
}));

vi.mock('@/lib/account-closure-orchestrator', () => ({
  claimClosureJob: mocks.claimClosureJob,
  processClosureJob: mocks.processClosureJob,
  buildProductionClosureAdapters: mocks.buildProductionClosureAdapters,
}));

import {
  sweepQuickStopOffers,
} from '@/lib/quick-stop-sweep';

import {
  runServiceReminderSweep,
} from '@/lib/warranty-sweep';

import {
  runGeocodeSweep,
} from '@/lib/geocode-sweep';

import {
  runPurgeWorker,
} from '@/lib/purge-worker';

describe('Background Sweeps & Maintenance Workers', () => {
  let fakeAdmin: any;

  const createFluentBuilder = (dataResult: any = null) => {
    const builder: any = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      lt: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: dataResult, error: null }),
      single: vi.fn().mockResolvedValue({ data: dataResult, error: null }),
      then: (resolve: any) => Promise.resolve({ data: dataResult, error: null }).then(resolve),
    };
    return builder;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    fakeAdmin = {
      from: vi.fn(() => createFluentBuilder([])),
      rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
      storage: {
        from: vi.fn().mockReturnValue({
          remove: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      },
    };
    mocks.createAdminClient.mockReturnValue(fakeAdmin);
    mocks.todayKey.mockReturnValue('2026-06-15');
    mocks.getAccountOwnerEmail.mockResolvedValue('owner@contractor.com');
    mocks.loadBusinessName.mockResolvedValue('Ace Roofing');
  });

  describe('Quick Stop Sweeper (quick-stop-sweep)', () => {
    it('expires unpaid offers, archives calendar jobs, marks payments failed, and alerts contractor', async () => {
      fakeAdmin.from.mockImplementation((table: string) => {
        if (table === 'extra_stop_requests') {
          const builder = createFluentBuilder([
            {
              id: 'req-1',
              account_id: 'acc-1',
              status: 'awaiting_customer_payment',
              job_id: 'job-100',
              payment_id: 'pay-200',
              client_name: 'John Smith',
            },
          ]);
          builder.maybeSingle = vi.fn().mockResolvedValue({ data: { id: 'req-1' }, error: null });
          return builder;
        }
        return createFluentBuilder([]);
      });

      const summary = await sweepQuickStopOffers(fakeAdmin, 'acc-1');
      expect(summary.paymentExpired).toBe(1);
      expect(fakeAdmin.from).toHaveBeenCalledWith('jobs');
      expect(fakeAdmin.from).toHaveBeenCalledWith('payments');
      expect(mocks.logQuickStopEvent).toHaveBeenCalledWith(
        fakeAdmin,
        'acc-1',
        'req-1',
        expect.objectContaining({ to: 'offer_expired', meta: { reason: 'payment_window_elapsed' } }),
      );
      expect(mocks.sendContractorAlertEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          accountId: 'acc-1',
          recipientEmail: 'owner@contractor.com',
          subject: 'Quick Stop offer expired unpaid',
        }),
      );
    });

    it('expires unresponsive contractor offers and logs event', async () => {
      let callCount = 0;
      fakeAdmin.from.mockImplementation((table: string) => {
        if (table === 'extra_stop_requests') {
          callCount++;
          if (callCount === 1) {
            // First call: payment expired check returns empty
            return createFluentBuilder([]);
          }
          if (callCount === 2) {
            // Second call: contractor response expired check
            const builder = createFluentBuilder([{ id: 'req-2', account_id: 'acc-1' }]);
            builder.maybeSingle = vi.fn().mockResolvedValue({ data: { id: 'req-2' }, error: null });
            return builder;
          }
        }
        return createFluentBuilder([]);
      });

      const summary = await sweepQuickStopOffers(fakeAdmin);
      expect(summary.responseExpired).toBe(1);
      expect(mocks.logQuickStopEvent).toHaveBeenCalledWith(
        fakeAdmin,
        'acc-1',
        'req-2',
        expect.objectContaining({ to: 'offer_expired', meta: { reason: 'response_window_elapsed' } }),
      );
    });

    it('auto-completes appointments 2 hours after arrival window closes when no no-show was filed', async () => {
      let callCount = 0;
      fakeAdmin.from.mockImplementation((table: string) => {
        if (table === 'extra_stop_requests') {
          callCount++;
          if (callCount <= 2) {
            return createFluentBuilder([]);
          }
          // Third call: arrival window auto-completion candidate
          const pastDate = '2026-06-10';
          const pastTime = '12:00:00';
          const builder = createFluentBuilder([
            {
              id: 'req-3',
              account_id: 'acc-1',
              job_id: 'job-300',
              arrival_date: pastDate,
              arrival_end: pastTime,
              no_show_reported_at: null,
            },
          ]);
          builder.maybeSingle = vi.fn().mockResolvedValue({ data: { id: 'req-3' }, error: null });
          return builder;
        }
        return createFluentBuilder([]);
      });

      const summary = await sweepQuickStopOffers(fakeAdmin);
      expect(summary.autoCompleted).toBe(1);
      expect(fakeAdmin.from).toHaveBeenCalledWith('jobs');
      expect(mocks.logQuickStopEvent).toHaveBeenCalledWith(
        fakeAdmin,
        'acc-1',
        'req-3',
        expect.objectContaining({ to: 'completed', meta: { reason: 'auto_complete_after_window' } }),
      );
    });
  });

  describe('Warranty & Service Reminder Sweeper (warranty-sweep)', () => {
    it('identifies due warranties, stamps service_reminded_at, and emails contractors', async () => {
      fakeAdmin.from.mockImplementation((table: string) => {
        if (table === 'warranties') {
          return createFluentBuilder([
            {
              id: 'war-1',
              account_id: 'acc-1',
              job_id: 'job-1',
              title: 'Shingle Replacement Warranty',
              next_service_due: '2026-06-16',
              service_interval_months: 12,
              last_service_on: '2025-06-16',
              service_reminded_at: null,
            },
          ]);
        }
        return createFluentBuilder([]);
      });

      mocks.serviceDue.mockReturnValue({ due: true, label: 'Due in 1 day' });

      const result = await runServiceReminderSweep();
      expect(result.checked).toBe(1);
      expect(result.notified).toBe(1);
      expect(result.skipped).toBe(0);

      expect(mocks.sendContractorAlertEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          accountId: 'acc-1',
          recipientEmail: 'owner@contractor.com',
          subject: '1 job due a service',
          heading: 'Work you could book this month',
        }),
      );
    });

    it('skips warranties that are not yet due according to serviceDue calculation', async () => {
      fakeAdmin.from.mockImplementation((table: string) => {
        if (table === 'warranties') {
          return createFluentBuilder([
            {
              id: 'war-2',
              account_id: 'acc-1',
              job_id: 'job-2',
              title: 'Gutter Maintenance',
              next_service_due: '2026-12-01',
              service_interval_months: 12,
              last_service_on: '2025-12-01',
              service_reminded_at: null,
            },
          ]);
        }
        return createFluentBuilder([]);
      });

      mocks.serviceDue.mockReturnValue({ due: false, label: 'In 6 months' });

      const result = await runServiceReminderSweep();
      expect(result.checked).toBe(1);
      expect(result.notified).toBe(0);
      expect(result.skipped).toBe(1);
      expect(mocks.sendContractorAlertEmail).not.toHaveBeenCalled();
    });
  });

  describe('Geocode Backfill Sweeper (geocode-sweep)', () => {
    it('scans accounts with ungeocoded jobs or leads and triggers batch backfill', async () => {
      fakeAdmin.from.mockImplementation((table: string) => {
        if (table === 'jobs') {
          return createFluentBuilder([{ account_id: 'acc-1' }, { account_id: 'acc-2' }]);
        }
        if (table === 'leads') {
          return createFluentBuilder([{ account_id: 'acc-2' }, { account_id: 'acc-3' }]);
        }
        return createFluentBuilder([]);
      });

      mocks.backfillJobCoordinates.mockResolvedValue(5);
      mocks.backfillLeadCoordinates.mockResolvedValue(3);

      const summary = await runGeocodeSweep();
      expect(summary.accountsScanned).toBe(3); // acc-1, acc-2, acc-3 deduplicated
      expect(summary.jobsFixed).toBe(15); // 5 * 3 accounts
      expect(summary.leadsFixed).toBe(9); // 3 * 3 accounts
      expect(mocks.backfillJobCoordinates).toHaveBeenCalledTimes(3);
      expect(mocks.backfillLeadCoordinates).toHaveBeenCalledTimes(3);
    });

    it('handles errors on individual accounts without halting the overall sweep', async () => {
      fakeAdmin.from.mockImplementation((table: string) => {
        if (table === 'jobs') {
          return createFluentBuilder([{ account_id: 'acc-error' }, { account_id: 'acc-good' }]);
        }
        return createFluentBuilder([]);
      });

      mocks.backfillJobCoordinates
        .mockRejectedValueOnce(new Error('Rate limit exceeded'))
        .mockResolvedValueOnce(4);
      mocks.backfillLeadCoordinates.mockResolvedValue(2);

      const summary = await runGeocodeSweep();
      expect(summary.accountsScanned).toBe(2);
      expect(summary.jobsFixed).toBe(4);
      expect(summary.leadsFixed).toBe(2);
    });
  });

  describe('Background Purge Worker (purge-worker)', () => {
    it('purges expired recoverable deletions, removes storage files, and records audit event', async () => {
      fakeAdmin.rpc.mockResolvedValue({
        data: [
          {
            id: 'del-1',
            account_id: 'acc-1',
            entity_type: 'lead',
            entity_id: 'lead-100',
            storage_manifest: [{ bucket: 'attachments', path: 'acc-1/lead-100/photo.jpg' }],
          },
        ],
        error: null,
      });

      fakeAdmin.from.mockImplementation((table: string) => {
        if (table === 'accounts') {
          return createFluentBuilder({ legal_hold: false });
        }
        return createFluentBuilder([]);
      });

      mocks.claimClosureJob.mockResolvedValue(null);

      const res = await runPurgeWorker();
      expect(res.purgedDeletionsCount).toBe(1);
      expect(res.errors).toHaveLength(0);
      expect(fakeAdmin.storage.from).toHaveBeenCalledWith('attachments');
      expect(mocks.recordTenantAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          accountId: 'acc-1',
          entityType: 'lead',
          entityId: 'lead-100',
          action: 'lead.purged',
        }),
      );
    });

    it('strictly preserves records if the account is under legal hold', async () => {
      fakeAdmin.rpc.mockResolvedValue({
        data: [
          {
            id: 'del-held',
            account_id: 'acc-litigation',
            entity_type: 'job',
            entity_id: 'job-999',
            storage_manifest: [],
          },
        ],
        error: null,
      });

      fakeAdmin.from.mockImplementation((table: string) => {
        if (table === 'accounts') {
          return createFluentBuilder({ legal_hold: true });
        }
        return createFluentBuilder([]);
      });

      mocks.claimClosureJob.mockResolvedValue(null);

      const res = await runPurgeWorker();
      expect(res.purgedDeletionsCount).toBe(0);
      expect(res.errors).toHaveLength(0);
      expect(fakeAdmin.storage.from).not.toHaveBeenCalled();
      expect(mocks.recordTenantAuditEvent).not.toHaveBeenCalled();
    });

    it('processes account closure jobs and logs closure errors if any occur', async () => {
      fakeAdmin.rpc.mockResolvedValue({ data: [], error: null });
      mocks.claimClosureJob.mockResolvedValue({ id: 'closure-job-1' });
      mocks.buildProductionClosureAdapters.mockReturnValue({ test: true });
      mocks.processClosureJob.mockResolvedValue({ completed: true, errors: [] });

      const res = await runPurgeWorker();
      expect(res.processedClosureJobsCount).toBe(1);
      expect(res.errors).toHaveLength(0);
      expect(mocks.processClosureJob).toHaveBeenCalledWith(
        fakeAdmin,
        'closure-job-1',
        { test: true },
        expect.any(String),
      );
    });
  });
});
