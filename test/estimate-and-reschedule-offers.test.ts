import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  resolveJobAccess: vi.fn(),
  sendContractorAlertEmail: vi.fn(),
  sendOwnerEstimateAcceptedSms: vi.fn(),
  recordAccountEvent: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  createAdminClient: mocks.createAdminClient,
}));

vi.mock('@/lib/change-order-client', () => ({
  resolveJobAccess: mocks.resolveJobAccess,
}));

vi.mock('@/lib/email', () => ({
  getAccountOwnerEmail: vi.fn().mockResolvedValue('owner@example.com'),
  sendContractorAlertEmail: mocks.sendContractorAlertEmail,
}));

vi.mock('@/lib/sms', () => ({
  sendOwnerEstimateAcceptedSms: mocks.sendOwnerEstimateAcceptedSms,
}));

vi.mock('@/lib/account-events', () => ({
  recordAccountEvent: mocks.recordAccountEvent,
}));

import {
  loadOfferContext,
  deleteOffer,
  cancelOffer,
  resolveOfferReply,
} from '@/lib/estimate-offers-data';

import {
  parseRescheduleReply,
  rankDaySuggestions,
  DISCOUNT_OPTIONS,
  DEFAULT_DISCOUNT_PERCENT,
  type CandidateDay,
} from '@/lib/reschedule-offers';

import {
  loadRescheduleContext,
  deleteRescheduleOffer,
  cancelRescheduleOffer,
  resolveRescheduleReply,
} from '@/lib/reschedule-offers-data';

import {
  loadReceivablesData,
} from '@/lib/receivables-data';

import {
  updateClientQuoteOptions,
} from '@/lib/quote-options-data';

describe('Estimate and Reschedule Offers Core Business Logic', () => {
  let fakeAdmin: any;

  const createFluentBuilder = (dataResult: any = null) => {
    const builder: any = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      gt: vi.fn().mockReturnThis(),
      lt: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      range: vi.fn().mockResolvedValue({ data: Array.isArray(dataResult) ? dataResult : [], error: null }),
      insert: vi.fn().mockReturnThis(),
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
      from: vi.fn(() => createFluentBuilder()),
    };
    mocks.createAdminClient.mockReturnValue(fakeAdmin);
  });

  describe('estimate-offers-data', () => {
    it('loadOfferContext loads offers, offeredLeadIds, and candidate leads', async () => {
      fakeAdmin.from.mockImplementation((table: string) => {
        if (table === 'estimate_offers') {
          const b = createFluentBuilder([
            {
              id: 'offer-1',
              account_id: 'acc-1',
              lead_id: 'lead-1',
              status: 'sent',
              offer_date: '2026-06-01',
              window_start: '09:00',
              window_end: '11:00',
              arrival_time: '09:30',
              visit_minutes: 30,
              phone: '+15125550101',
              body: 'Hello',
              hold_minutes: 60,
              sent_at: '2026-06-01T08:00:00Z',
            },
          ]);
          return b;
        }
        if (table === 'leads') {
          const b = createFluentBuilder([
            {
              id: 'lead-2',
              name: 'Bob Smith',
              phone: '5125550102',
              address: '100 Main St',
              status: 'new',
              lat: 30.2672,
              lng: -97.7431,
              triage: null,
              converted_job: null,
              quote_visit: null,
              created_at: new Date().toISOString(),
            },
          ]);
          return b;
        }
        return createFluentBuilder();
      });

      const ctx = await loadOfferContext(fakeAdmin, 'acc-1', '2026-06-01');
      expect(ctx.available).toBe(true);
      expect(ctx.offers).toHaveLength(1);
      expect(ctx.candidates).toHaveLength(1);
      expect(ctx.candidates[0].id).toBe('lead-2');
    });

    it('deleteOffer and cancelOffer execute safely', async () => {
      await expect(deleteOffer(fakeAdmin, 'acc-1', 'offer-1')).resolves.not.toThrow();
      await expect(cancelOffer(fakeAdmin, 'acc-1', 'offer-1')).resolves.not.toThrow();
      expect(fakeAdmin.from).toHaveBeenCalledWith('estimate_offers');
    });

    it('resolveOfferReply handles accept reply', async () => {
      fakeAdmin.from.mockImplementation((table: string) => {
        if (table === 'estimate_offers') {
          return createFluentBuilder({
            id: 'offer-1',
            account_id: 'acc-1',
            lead_id: 'lead-1',
            status: 'held',
            phone: '+15125550101',
            window_start: '09:00',
            window_end: '11:00',
            offer_date: '2026-06-01',
            lead: { id: 'lead-1', name: 'Lead One' },
            account: { business_name: 'Test Business', alert_phone: '+15125550199' },
          });
        }
        return createFluentBuilder();
      });

      const outcome = await resolveOfferReply('acc-1', '+15125550101', 'YES');
      expect(outcome.handled).toBe(true);
    });
  });

  describe('reschedule-offers pure logic', () => {
    it('parseRescheduleReply parses affirmative and negative replies correctly', () => {
      expect(parseRescheduleReply('YES')).toBe('accept');
      expect(parseRescheduleReply('1')).toBe('accept');
      expect(parseRescheduleReply('CONFIRM')).toBe('accept');
      expect(parseRescheduleReply('NO')).toBe('decline');
      expect(parseRescheduleReply('Pass')).toBe('decline');
      expect(parseRescheduleReply('What time?')).toBe('unclear');
    });

    it('rankDaySuggestions ranks candidate days by detour miles', () => {
      const targetCoord = { lat: 30.2672, lng: -97.7431 };
      const candidateDays: CandidateDay[] = [
        {
          dateKey: '2026-06-05',
          anchors: [{ lat: 30.29, lng: -97.75 }], // ~2 miles away (< MAX_NEAR_MILES=6)
          openWindows: [{ startMinutes: 540, endMinutes: 660 }],
        },
        {
          dateKey: '2026-06-02',
          anchors: [{ lat: 30.268, lng: -97.744 }], // ~0.1 miles away
          openWindows: [{ startMinutes: 540, endMinutes: 660 }],
        },
      ];

      const ranked = rankDaySuggestions({ at: targetCoord, days: candidateDays, limit: 3 });
      expect(ranked.length).toBe(2);
      expect(ranked[0].dateKey).toBe('2026-06-02');
      expect(ranked[0].nearMiles).toBeLessThan(ranked[1].nearMiles);
    });

    it('exposes discount constants', () => {
      expect(DISCOUNT_OPTIONS).toContain(DEFAULT_DISCOUNT_PERCENT);
      expect(DEFAULT_DISCOUNT_PERCENT).toBe(10);
    });
  });

  describe('reschedule-offers-data', () => {
    it('loadRescheduleContext loads offers and pending job ids', async () => {
      fakeAdmin.from.mockReturnValue(
        createFluentBuilder([
          {
            id: 'ro-1',
            account_id: 'acc-1',
            job_id: 'job-100',
            status: 'sent',
            from_date: '2026-06-01',
            to_date: '2026-06-05',
            discount_percent: 10,
            phone: '+15125550199',
          },
        ])
      );

      const ctx = await loadRescheduleContext(fakeAdmin, 'acc-1', '2026-06-01');
      expect(ctx.available).toBe(true);
      expect(ctx.offers).toHaveLength(1);
      expect(ctx.pendingJobIds.has('job-100')).toBe(true);
    });

    it('deleteRescheduleOffer and cancelRescheduleOffer execute without error', async () => {
      await expect(deleteRescheduleOffer(fakeAdmin, 'acc-1', 'ro-1')).resolves.not.toThrow();
      await expect(cancelRescheduleOffer(fakeAdmin, 'acc-1', 'ro-1')).resolves.not.toThrow();
      expect(fakeAdmin.from).toHaveBeenCalledWith('reschedule_offers');
    });

    it('resolveRescheduleReply processes decline reply correctly', async () => {
      fakeAdmin.from.mockImplementation((table: string) => {
        if (table === 'reschedule_offers') {
          return createFluentBuilder({
            id: 'ro-1',
            account_id: 'acc-1',
            job_id: 'job-100',
            status: 'sent',
            to_date: '2026-06-05',
            phone: '+15125550199',
            job: { id: 'job-100', client_name: 'Client Alpha' },
            account: { business_name: 'Alpha Roofing', alert_phone: '+15125550199' },
          });
        }
        return createFluentBuilder();
      });

      const reply = await resolveRescheduleReply('acc-1', '+15125550199', 'NO');
      expect(reply.handled).toBe(true);
      expect(reply.reply).toContain('Nothing has changed');
    });
  });

  describe('receivables-data', () => {
    it('loadReceivablesData calculates totals across aging buckets', async () => {
      const now = Date.now();
      const tenDaysAgo = new Date(now - 10 * 86_400_000).toISOString();
      const fortyDaysAgo = new Date(now - 40 * 86_400_000).toISOString();

      fakeAdmin.from.mockImplementation((table: string) => {
        if (table === 'invoices') {
          return createFluentBuilder([
            {
              id: 'inv-1',
              ref: 'INV-001',
              job_id: 'job-1',
              status: 'sent',
              total: 500,
              discount_percent: null,
              tax_rate: null,
              created_at: tenDaysAgo,
            },
            {
              id: 'inv-2',
              ref: 'INV-002',
              job_id: 'job-2',
              status: 'overdue',
              total: 1000,
              discount_percent: null,
              tax_rate: null,
              created_at: fortyDaysAgo,
            },
          ]);
        }
        if (table === 'jobs') {
          return createFluentBuilder([
            { id: 'job-1', ref: 'JOB-1', client_name: 'Client A', client_phone: '111', client_email: 'a@a.com' },
            { id: 'job-2', ref: 'JOB-2', client_name: 'Client B', client_phone: '222', client_email: 'b@b.com' },
          ]);
        }
        return createFluentBuilder([]);
      });

      const { summary, receivables, available } = await loadReceivablesData(fakeAdmin, 'acc-1');
      expect(available).toBe(true);
      expect(summary.totalReceivablesCount).toBe(2);
      expect(summary.totalOutstanding).toBe(1500);
      expect(receivables).toHaveLength(2);
    });
  });

  describe('quote-options-data', () => {
    it('updateClientQuoteOptions validates token access and updates options', async () => {
      mocks.resolveJobAccess.mockResolvedValue({
        accountId: 'acc-1',
        jobId: 'job-1',
      });

      const originalItems = [
        { id: 'base-1', label: 'Base service', amount: 1000, kind: 'base', selected: true, recommended: false },
        { id: 'opt-1', label: 'Extra warranty', amount: 200, kind: 'addon', selected: false, recommended: false },
      ];

      fakeAdmin.from.mockImplementation((table: string) => {
        if (table === 'jobs') {
          return createFluentBuilder({
            ref: 'JOB-01',
            client_name: 'David Gilmour',
            status: 'quoted',
            started_at: null,
            scheduled_for: '2026-10-01',
            quote_items: originalItems,
            quoted_amount: 1000,
          });
        }
        if (table === 'accounts') {
          return createFluentBuilder({
            client_quote_changes: true,
            timezone: 'America/Chicago',
            business_name: 'Pink Floyd Roofing',
          });
        }
        if (table === 'sites') {
          return createFluentBuilder({ company_name: 'Pink Floyd Roofing' });
        }
        return createFluentBuilder();
      });

      const result = await updateClientQuoteOptions('valid-token-123', ['opt-1']);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.total).toBe(1200);
      }
    });

    it('returns error when token is invalid or expired', async () => {
      mocks.resolveJobAccess.mockResolvedValue(null);
      const result = await updateClientQuoteOptions('expired-token', []);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.message).toContain('no longer valid');
      }
    });
  });
});
