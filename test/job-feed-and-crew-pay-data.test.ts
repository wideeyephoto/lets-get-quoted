/**
 * Job Feed & Crew Pay Data Coverage Test — Phase 4B
 *
 * Targets:
 *   - src/lib/job-feed.ts (createLinkedFeedItems, sortJobFeed, listJobFeed,
 *     createJobFeedEvent, createClientJobAccessToken, revokeClientJobAccess,
 *     getActiveClientAccessCount, getClientJobDashboard)
 *   - src/lib/crew-pay-data.ts (reopenGuard, snapshotOf, laborEntryLockReason,
 *     countLaborEntriesForCrew, closePayPeriod, reopenPayPeriod, setEntryLocked,
 *     undoPaid)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  getJob: vi.fn(),
  loadClientMilestones: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  createAdminClient: mocks.createAdminClient,
}));

vi.mock('@/lib/jobs', () => ({
  getJob: mocks.getJob,
  formatJobSchedule: vi.fn(() => 'Mon, Mar 15 at 9:00 AM'),
  formatMoney: vi.fn((n: number) => `$${n}`),
  parseQuoteItems: vi.fn((items: any) => (Array.isArray(items) ? items : [])),
  computeQuoteTotal: vi.fn(() => 500),
}));

vi.mock('@/lib/milestones-data', () => ({
  loadClientMilestones: mocks.loadClientMilestones,
}));

vi.mock('@/lib/contractor-brand', () => ({
  CONTRACTOR_BRAND_COLUMNS: 'id, brand_color, logo_url',
  shapeContractorBrand: vi.fn(() => ({
    logoUrl: null,
    brandColor: '#2563eb',
    businessName: 'Apex Home Services',
    companyName: 'Apex Home Services',
  })),
}));

vi.mock('@/lib/client-feed', () => ({
  toClientFeed: vi.fn((events: any[]) => events),
  clientSafeText: vi.fn((text: string) => text),
}));

import {
  createLinkedFeedItems,
  sortJobFeed,
  listJobFeed,
  createJobFeedEvent,
  createClientJobAccessToken,
  revokeClientJobAccess,
  getActiveClientAccessCount,
  getClientJobDashboard,
  type JobFeedEvent,
} from '@/lib/job-feed';

import {
  reopenGuard,
  snapshotOf,
  laborEntryLockReason,
  countLaborEntriesForCrew,
  closePayPeriod,
  reopenPayPeriod,
  setEntryLocked,
  undoPaid,
  type PayPeriodRow,
} from '@/lib/crew-pay-data';

import type { Payment } from '@/lib/payments';
import type { Invoice } from '@/lib/invoices';
import type { CrewPayRow } from '@/lib/crew-pay';

describe('Job Feed & Crew Pay Data Engine', () => {
  let mockSupabase: any;

  function createQueryChain(resultData: any = null, resultError: any = null, countVal: number | null = null) {
    const chain: any = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: resultData, error: resultError }),
      maybeSingle: vi.fn().mockResolvedValue({ data: resultData, error: resultError }),
      then: (resolve: any) => Promise.resolve({ data: resultData, error: resultError, count: countVal }).then(resolve),
    };
    return chain;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase = createQueryChain();
    mocks.createAdminClient.mockReturnValue(mockSupabase);
    mocks.loadClientMilestones.mockResolvedValue([]);
  });

  // ── job-feed: createLinkedFeedItems ─────────────────────────────────────────

  describe('job-feed — createLinkedFeedItems', () => {
    it('creates payment feed item with client_financial visibility and /pay action URL', () => {
      const payments: Payment[] = [
        {
          id: 'pay-1',
          account_id: 'acc-1',
          job_id: 'job-1',
          amount: 250,
          refunded_amount: 0,
          status: 'requested',
          label: 'Deposit Request',
          requested_at: '2026-02-01T10:00:00Z',
          paid_at: null,
          kind: 'deposit',
        } as unknown as Payment,
      ];

      const feed: JobFeedEvent[] = [];
      const items = createLinkedFeedItems(feed, payments, [], 'acc-1', 'job-1');

      expect(items).toHaveLength(1);
      expect(items[0].kind).toBe('payment_requested');
      expect(items[0].visibility).toBe('client_financial');
      expect(items[0].action_url).toBe('/pay/pay-1');
      expect(items[0].amount).toBe(250);
    });

    it('filters out canceled payments', () => {
      const payments: Payment[] = [
        {
          id: 'pay-canceled',
          account_id: 'acc-1',
          job_id: 'job-1',
          amount: 100,
          status: 'canceled',
          label: 'Withdrawn',
          requested_at: '2026-02-01T10:00:00Z',
        } as unknown as Payment,
      ];

      const items = createLinkedFeedItems([], payments, [], 'acc-1', 'job-1');
      expect(items).toHaveLength(0);
    });

    it('skips payments that already have feed action', () => {
      const existingFeed: JobFeedEvent[] = [
        {
          id: 'existing-event',
          account_id: 'acc-1',
          job_id: 'job-1',
          kind: 'payment_requested',
          title: 'Already there',
          body: null,
          image_url: null,
          author: 'Owner',
          meta: null,
          visibility: 'client_financial',
          amount: 250,
          source_table: 'payments',
          source_id: 'pay-1',
          action_url: '/pay/pay-1',
          published_at: '2026-02-01T10:00:00Z',
          created_at: '2026-02-01T10:00:00Z',
        },
      ];

      const payments: Payment[] = [
        {
          id: 'pay-1',
          account_id: 'acc-1',
          job_id: 'job-1',
          amount: 250,
          status: 'requested',
          label: 'Deposit',
          requested_at: '2026-02-01T10:00:00Z',
        } as unknown as Payment,
      ];

      const items = createLinkedFeedItems(existingFeed, payments, [], 'acc-1', 'job-1');
      expect(items).toHaveLength(0);
    });

    it('creates invoice feed item with internal visibility for draft status', () => {
      const invoices: Invoice[] = [
        {
          id: 'inv-draft',
          account_id: 'acc-1',
          job_id: 'job-1',
          ref: 'INV-001',
          total: 800,
          status: 'draft',
          created_at: '2026-02-01T10:00:00Z',
        } as unknown as Invoice,
      ];

      const items = createLinkedFeedItems([], [], invoices, 'acc-1', 'job-1');
      expect(items).toHaveLength(1);
      expect(items[0].kind).toBe('invoice_signoff_link');
      expect(items[0].visibility).toBe('internal');
      expect(items[0].published_at).toBeNull();
    });

    it('creates invoice feed item with client_financial visibility for sent status', () => {
      const invoices: Invoice[] = [
        {
          id: 'inv-sent',
          account_id: 'acc-1',
          job_id: 'job-1',
          ref: 'INV-002',
          total: 1200,
          status: 'sent',
          created_at: '2026-02-01T10:00:00Z',
        } as unknown as Invoice,
      ];

      const items = createLinkedFeedItems([], [], invoices, 'acc-1', 'job-1');
      expect(items).toHaveLength(1);
      expect(items[0].visibility).toBe('client_financial');
      expect(items[0].published_at).toBe('2026-02-01T10:00:00Z');
    });

    it('filters out void invoices', () => {
      const invoices: Invoice[] = [
        {
          id: 'inv-void',
          status: 'void',
          created_at: '2026-02-01T10:00:00Z',
        } as unknown as Invoice,
      ];

      const items = createLinkedFeedItems([], [], invoices, 'acc-1', 'job-1');
      expect(items).toHaveLength(0);
    });
  });

  // ── job-feed: sortJobFeed ───────────────────────────────────────────────────

  describe('job-feed — sortJobFeed', () => {
    it('sorts events in descending order by created_at', () => {
      const events: JobFeedEvent[] = [
        { id: '1', created_at: '2026-01-01T00:00:00Z' } as JobFeedEvent,
        { id: '3', created_at: '2026-03-01T00:00:00Z' } as JobFeedEvent,
        { id: '2', created_at: '2026-02-01T00:00:00Z' } as JobFeedEvent,
      ];

      const sorted = sortJobFeed(events);
      expect(sorted.map((e) => e.id)).toEqual(['3', '2', '1']);
    });

    it('does not mutate original array', () => {
      const events: JobFeedEvent[] = [
        { id: '1', created_at: '2026-01-01T00:00:00Z' } as JobFeedEvent,
        { id: '2', created_at: '2026-02-01T00:00:00Z' } as JobFeedEvent,
      ];

      sortJobFeed(events);
      expect(events[0].id).toBe('1');
    });

    it('returns empty array when given empty input', () => {
      expect(sortJobFeed([])).toEqual([]);
    });
  });

  // ── job-feed: listJobFeed ───────────────────────────────────────────────────

  describe('job-feed — listJobFeed', () => {
    it('queries job feed events for account and job id', async () => {
      const mockEvents = [
        { id: 'ev-1', kind: 'job_started', visibility: 'client' },
      ];
      mockSupabase = createQueryChain(mockEvents);

      const result = await listJobFeed(mockSupabase, 'acc-1', 'job-1');
      expect(result).toHaveLength(1);
      expect(mockSupabase.from).toHaveBeenCalledWith('job_feed');
      expect(mockSupabase.eq).toHaveBeenCalledWith('account_id', 'acc-1');
      expect(mockSupabase.eq).toHaveBeenCalledWith('job_id', 'job-1');
    });

    it('applies clientOnly visibility filter when requested', async () => {
      mockSupabase = createQueryChain([]);

      await listJobFeed(mockSupabase, 'acc-1', 'job-1', { clientOnly: true });
      expect(mockSupabase.in).toHaveBeenCalledWith('visibility', ['client', 'client_financial']);
    });

    it('throws error when database query fails', async () => {
      mockSupabase = createQueryChain(null, new Error('DB query error'));

      await expect(listJobFeed(mockSupabase, 'acc-1', 'job-1')).rejects.toThrow('DB query error');
    });
  });

  // ── job-feed: createJobFeedEvent ────────────────────────────────────────────

  describe('job-feed — createJobFeedEvent', () => {
    it('throws if job does not exist for the account', async () => {
      mocks.getJob.mockResolvedValue(null);

      await expect(
        createJobFeedEvent(mockSupabase, 'acc-1', 'job-nonexistent', {
          kind: 'note',
          title: 'Hello',
        }),
      ).rejects.toThrow('Job not found for this account.');
    });

    it('deduplicates when sourceTable, sourceId, and kind already exist', async () => {
      mocks.getJob.mockResolvedValue({ id: 'job-1', account_id: 'acc-1' });

      const existingEvent = { id: 'ev-existing', kind: 'payment_received', source_table: 'payments', source_id: 'pay-1' };
      mockSupabase = createQueryChain(existingEvent);

      const result = await createJobFeedEvent(mockSupabase, 'acc-1', 'job-1', {
        kind: 'payment_received',
        title: 'Payment Received',
        sourceTable: 'payments',
        sourceId: 'pay-1',
      });

      expect(result.id).toBe('ev-existing');
    });

    it('creates new feed event and sets published_at for client visibility', async () => {
      mocks.getJob.mockResolvedValue({ id: 'job-1', account_id: 'acc-1' });

      const createdEvent = {
        id: 'ev-created-1',
        account_id: 'acc-1',
        job_id: 'job-1',
        kind: 'photo_uploaded',
        title: 'New Before Photo',
        visibility: 'client',
        published_at: '2026-03-01T12:00:00Z',
      };

      const chain = createQueryChain(null); // maybeSingle returns null (no dup)
      chain.insert = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: createdEvent, error: null }),
        }),
      });

      const result = await createJobFeedEvent(chain, 'acc-1', 'job-1', {
        kind: 'photo_uploaded',
        title: 'New Before Photo',
        visibility: 'client',
      });

      expect(result.id).toBe('ev-created-1');
      expect(chain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 'photo_uploaded',
          visibility: 'client',
          published_at: expect.any(String),
        }),
      );
    });
  });

  // ── job-feed: access tokens ─────────────────────────────────────────────────

  describe('job-feed — access token lifecycle', () => {
    it('createClientJobAccessToken creates hashed token and returns base64url string', async () => {
      mocks.getJob.mockResolvedValue({ id: 'job-1', account_id: 'acc-1', client_phone: '5551234567' });
      mockSupabase = createQueryChain(null);

      const token = await createClientJobAccessToken(mockSupabase, 'acc-1', 'job-1');
      expect(typeof token).toBe('string');
      expect(token.length).toBeGreaterThan(20);
      expect(mockSupabase.from).toHaveBeenCalledWith('client_job_access');
      expect(mockSupabase.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          account_id: 'acc-1',
          job_id: 'job-1',
          token_hash: expect.any(String),
        }),
      );
    });

    it('revokeClientJobAccess sets revoked_at timestamp', async () => {
      mockSupabase = createQueryChain(null);

      await revokeClientJobAccess(mockSupabase, 'acc-1', 'job-1');
      expect(mockSupabase.from).toHaveBeenCalledWith('client_job_access');
      expect(mockSupabase.update).toHaveBeenCalledWith(
        expect.objectContaining({ revoked_at: expect.any(String) }),
      );
      expect(mockSupabase.is).toHaveBeenCalledWith('revoked_at', null);
    });

    it('getActiveClientAccessCount returns exact count from database', async () => {
      mockSupabase = createQueryChain(null, null, 3);

      const count = await getActiveClientAccessCount(mockSupabase, 'acc-1', 'job-1');
      expect(count).toBe(3);
    });
  });

  // ── job-feed: getClientJobDashboard ─────────────────────────────────────────

  describe('job-feed — getClientJobDashboard', () => {
    it('returns null when access token does not exist', async () => {
      mockSupabase.from.mockImplementation(() => createQueryChain(null));

      const dashboard = await getClientJobDashboard('invalid-token');
      expect(dashboard).toBeNull();
    });

    it('returns null when access token has been revoked', async () => {
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'client_job_access') {
          return createQueryChain({
            id: 'access-1',
            account_id: 'acc-1',
            job_id: 'job-1',
            revoked_at: '2026-01-01T00:00:00Z',
          });
        }
        return createQueryChain(null);
      });

      const dashboard = await getClientJobDashboard('revoked-token');
      expect(dashboard).toBeNull();
    });

    it('returns null when access token is expired', async () => {
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'client_job_access') {
          return createQueryChain({
            id: 'access-1',
            account_id: 'acc-1',
            job_id: 'job-1',
            expires_at: '2020-01-01T00:00:00Z',
          });
        }
        return createQueryChain(null);
      });

      const dashboard = await getClientJobDashboard('expired-token');
      expect(dashboard).toBeNull();
    });

    it('builds complete dashboard payload for valid token', async () => {
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'client_job_access') {
          return createQueryChain({
            id: 'access-ok',
            account_id: 'acc-1',
            job_id: 'job-1',
            revoked_at: null,
            expires_at: null,
          });
        }
        if (table === 'accounts') {
          return createQueryChain({ business_name: 'Apex Home Services' });
        }
        if (table === 'sites') {
          return createQueryChain({ brand_color: '#3b82f6', logo_url: null });
        }
        if (table === 'jobs') {
          return createQueryChain({
            id: 'job-1',
            ref: 'J-101',
            client_name: 'John Doe',
            address: '456 Elm St',
            status: 'in_progress',
            started_at: '2026-03-01T09:00:00Z',
            scheduled_for: '2026-03-01',
            scheduled_time: '09:00',
            scope: 'Gutter replacement',
            quote_items: [],
            deposit_gate: null,
          });
        }
        if (table === 'job_feed') {
          return createQueryChain([]);
        }
        if (table === 'payments') {
          return createQueryChain([]);
        }
        if (table === 'invoices') {
          return createQueryChain([]);
        }
        if (table === 'job_schedule_requests') {
          return createQueryChain(null);
        }
        if (table === 'job_tasks') {
          return createQueryChain([{ title: 'Remove old gutters', done: true }]);
        }
        if (table === 'payment_plans') {
          return createQueryChain(null);
        }
        return createQueryChain(null);
      });

      const dashboard = await getClientJobDashboard('valid-active-token');
      expect(dashboard).not.toBeNull();
      expect(dashboard?.businessName).toBe('Apex Home Services');
      expect(dashboard?.job.ref).toBe('J-101');
      expect(dashboard?.tasks).toHaveLength(1);
      expect(dashboard?.tasks[0].done).toBe(true);
      expect(dashboard?.quoteApproved).toBe(true); // status is in_progress
    });
  });

  // ── crew-pay-data: reopenGuard ──────────────────────────────────────────────

  describe('crew-pay-data — reopenGuard', () => {
    it('returns error message when period is not closed', () => {
      const row: PayPeriodRow = {
        id: 'p-1',
        periodKey: '2026-W09',
        startsOn: '2026-02-23',
        endsOn: '2026-03-01',
        closedAt: null,
        closedBy: null,
        reopenedAt: null,
        reopenReason: null,
      };

      const result = reopenGuard(row);
      expect(result).toBe('This period isn’t closed, so there is nothing to reopen.');
    });

    it('returns null when period is closed and can be reopened', () => {
      const row: PayPeriodRow = {
        id: 'p-1',
        periodKey: '2026-W09',
        startsOn: '2026-02-23',
        endsOn: '2026-03-01',
        closedAt: '2026-03-02T10:00:00Z',
        closedBy: 'owner@example.com',
        reopenedAt: null,
        reopenReason: null,
      };

      const result = reopenGuard(row);
      expect(result).toBeNull();
    });
  });

  // ── crew-pay-data: snapshotOf ───────────────────────────────────────────────

  describe('crew-pay-data — snapshotOf', () => {
    it('extracts snapshot fields from CrewPayRow correctly', () => {
      const row: CrewPayRow = {
        crewId: 'crew-1',
        name: 'Sarah Connor',
        regularHours: 40,
        overtimeHours: 5,
        estimatedPay: 1250,
        payType: 'hourly',
        payBasis: 'hourly',
        entries: [
          {
            id: 'cost-1',
            jobId: 'job-1',
            description: 'Framing',
            loggedAt: '2026-02-15T09:00:00Z',
            hours: 8,
            rate: 25,
            amount: 200,
          },
        ],
      } as unknown as CrewPayRow;

      const snap = snapshotOf(row);
      expect(snap).toEqual({
        lines: [
          {
            costId: 'cost-1',
            jobId: 'job-1',
            description: 'Framing',
            loggedAt: '2026-02-15T09:00:00Z',
            hours: 8,
            rate: 25,
            amount: 200,
          },
        ],
        crewId: 'crew-1',
        crewName: 'Sarah Connor',
        regularHours: 40,
        overtimeHours: 5,
        amount: 1250,
        payType: 'hourly',
        payBasis: 'hourly',
      });
    });
  });

  // ── crew-pay-data: laborEntryLockReason ──────────────────────────────────────

  describe('crew-pay-data — laborEntryLockReason', () => {
    it('returns null when entry does not exist or has no crew_id', async () => {
      mockSupabase = createQueryChain(null);

      const result = await laborEntryLockReason(mockSupabase, 'acc-1', 'cost-none');
      expect(result).toBeNull();
    });

    it('returns null when no crew pay records exist for the crew member', async () => {
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'costs') {
          return createQueryChain({ id: 'cost-1', crew_id: 'crew-1', crew_name: 'Bob', created_at: '2026-02-15T09:00:00Z' });
        }
        if (table === 'crew_pay_entries') {
          return createQueryChain([]);
        }
        return createQueryChain(null);
      });

      const result = await laborEntryLockReason(mockSupabase, 'acc-1', 'cost-1');
      expect(result).toBeNull();
    });

    it('returns lock warning when entry date falls inside a paid pay period', async () => {
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'costs') {
          return createQueryChain({
            id: 'cost-paid',
            crew_id: 'crew-1',
            crew_name: 'Bob Builder',
            created_at: '2026-02-15T09:00:00Z',
          });
        }
        if (table === 'crew_pay_entries') {
          return createQueryChain([
            {
              status: 'paid',
              period: { starts_on: '2026-02-10', ends_on: '2026-02-20' },
            },
          ]);
        }
        return createQueryChain(null);
      });

      const result = await laborEntryLockReason(mockSupabase, 'acc-1', 'cost-paid');
      expect(result).not.toBeNull();
      expect(result).toContain('Bob Builder has already been paid');
      expect(result).toContain('Undo the payment first');
    });

    it('returns lock warning when entry date falls inside an approved pay period', async () => {
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'costs') {
          return createQueryChain({
            id: 'cost-appr',
            crew_id: 'crew-2',
            crew_name: 'Alice',
            created_at: '2026-02-15T09:00:00Z',
          });
        }
        if (table === 'crew_pay_entries') {
          return createQueryChain([
            {
              status: 'approved',
              period: { starts_on: '2026-02-10', ends_on: '2026-02-20' },
            },
          ]);
        }
        return createQueryChain(null);
      });

      const result = await laborEntryLockReason(mockSupabase, 'acc-1', 'cost-appr');
      expect(result).not.toBeNull();
      expect(result).toContain('hours for');
      expect(result).toContain('have been approved');
    });

    it('returns null when entry date is outside the pay period date range', async () => {
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'costs') {
          return createQueryChain({
            id: 'cost-outside',
            crew_id: 'crew-1',
            crew_name: 'Bob',
            created_at: '2026-03-01T09:00:00Z', // March
          });
        }
        if (table === 'crew_pay_entries') {
          return createQueryChain([
            {
              status: 'paid',
              period: { starts_on: '2026-02-01', ends_on: '2026-02-10' }, // Feb
            },
          ]);
        }
        return createQueryChain(null);
      });

      const result = await laborEntryLockReason(mockSupabase, 'acc-1', 'cost-outside');
      expect(result).toBeNull();
    });
  });

  // ── crew-pay-data: countLaborEntriesForCrew ─────────────────────────────────

  describe('crew-pay-data — countLaborEntriesForCrew', () => {
    it('returns exact count of labor rows for crew member', async () => {
      mockSupabase = createQueryChain(null, null, 7);

      const count = await countLaborEntriesForCrew(mockSupabase, 'acc-1', 'crew-1');
      expect(count).toBe(7);
      expect(mockSupabase.from).toHaveBeenCalledWith('costs');
      expect(mockSupabase.eq).toHaveBeenCalledWith('crew_id', 'crew-1');
      expect(mockSupabase.eq).toHaveBeenCalledWith('type', 'labor');
    });

    it('returns 0 when database error occurs', async () => {
      mockSupabase = createQueryChain(null, new Error('Permission denied'));

      const count = await countLaborEntriesForCrew(mockSupabase, 'acc-1', 'crew-1');
      expect(count).toBe(0);
    });
  });

  // ── crew-pay-data: state mutations ──────────────────────────────────────────

  describe('crew-pay-data — state transitions', () => {
    it('closePayPeriod updates closed_at and closed_by', async () => {
      mockSupabase = createQueryChain(null);

      await closePayPeriod(mockSupabase, 'acc-1', 'p-123', 'owner@example.com');
      expect(mockSupabase.from).toHaveBeenCalledWith('crew_pay_periods');
      expect(mockSupabase.update).toHaveBeenCalledWith(
        expect.objectContaining({
          closed_at: expect.any(String),
          closed_by: 'owner@example.com',
          reopened_at: null,
          reopen_reason: null,
        }),
      );
    });

    it('reopenPayPeriod clears closed_at and sets reopened_at with reason', async () => {
      mockSupabase = createQueryChain(null);

      await reopenPayPeriod(mockSupabase, 'acc-1', 'p-123', 'Adjusting Friday hours');
      expect(mockSupabase.from).toHaveBeenCalledWith('crew_pay_periods');
      expect(mockSupabase.update).toHaveBeenCalledWith(
        expect.objectContaining({
          closed_at: null,
          closed_by: null,
          reopened_at: expect.any(String),
          reopen_reason: 'Adjusting Friday hours',
        }),
      );
    });

    it('setEntryLocked updates locked boolean on entry', async () => {
      mockSupabase = createQueryChain(null);

      await setEntryLocked(mockSupabase, 'acc-1', 'entry-1', true);
      expect(mockSupabase.from).toHaveBeenCalledWith('crew_pay_entries');
      expect(mockSupabase.update).toHaveBeenCalledWith(
        expect.objectContaining({ locked: true }),
      );
    });

    it('undoPaid resets status to approved and clears payment details', async () => {
      mockSupabase = createQueryChain(null);

      await undoPaid(mockSupabase, 'acc-1', 'entry-1');
      expect(mockSupabase.from).toHaveBeenCalledWith('crew_pay_entries');
      expect(mockSupabase.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'approved',
          paid_amount: null,
          paid_at: null,
          locked: false,
        }),
      );
    });
  });
});
