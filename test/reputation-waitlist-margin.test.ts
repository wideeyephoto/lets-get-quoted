import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  // Email
  getAccountOwnerEmail: vi.fn(),
  sendContractorAlertEmail: vi.fn(),
  sendReviewRequestEmail: vi.fn(),
  // Email suppression
  isEmailSuppressed: vi.fn(),
  resolveMarketingMailingAddress: vi.fn((addr?: string | null) => addr || '123 Main St, Suite 100, Atlanta, GA 30301'),
  // Business name
  loadBusinessName: vi.fn(async () => 'Apex Home Services'),
  pickBusinessName: vi.fn((site?: { company_name?: string } | null, account?: { business_name?: string } | null, fallback = 'your contractor') => {
    return site?.company_name || account?.business_name || fallback;
  }),
  // SMS
  isPhoneOptedOut: vi.fn(),
  recordSmsConsent: vi.fn(),
  sendReviewRequestSms: vi.fn(),
  sendCrewScheduleSelectedSms: vi.fn(),
  sendSchedulingOptionsSms: vi.fn(),
  enqueueSmsDelivery: vi.fn(),
  // Job feed
  createJobFeedEvent: vi.fn(),
  applyQuoteAcceptance: vi.fn(),
  // Account events
  recordAccountEvent: vi.fn(),
  // Crew
  listCrew: vi.fn(),
  listCrewIdsForJob: vi.fn(),
  // Distance
  coordOf: vi.fn((j: { lat: number | null; lng: number | null }) =>
    j.lat != null && j.lng != null ? { lat: j.lat, lng: j.lng } : null
  ),
  // Cancellation waitlist
  rankWaitlistCandidates: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  createAdminClient: mocks.createAdminClient,
}));

vi.mock('@/lib/email', () => ({
  getAccountOwnerEmail: mocks.getAccountOwnerEmail,
  sendContractorAlertEmail: mocks.sendContractorAlertEmail,
  sendReviewRequestEmail: mocks.sendReviewRequestEmail,
}));

vi.mock('@/lib/email-suppression', () => ({
  isEmailSuppressed: mocks.isEmailSuppressed,
  resolveMarketingMailingAddress: mocks.resolveMarketingMailingAddress,
}));

vi.mock('@/lib/business-name', () => ({
  loadBusinessName: mocks.loadBusinessName,
  pickBusinessName: mocks.pickBusinessName,
}));

vi.mock('@/lib/sms', () => ({
  isPhoneOptedOut: mocks.isPhoneOptedOut,
  recordSmsConsent: mocks.recordSmsConsent,
  sendReviewRequestSms: mocks.sendReviewRequestSms,
  sendCrewScheduleSelectedSms: mocks.sendCrewScheduleSelectedSms,
  sendSchedulingOptionsSms: mocks.sendSchedulingOptionsSms,
}));

vi.mock('@/lib/sms-delivery', () => ({
  enqueueSmsDelivery: mocks.enqueueSmsDelivery,
}));

vi.mock('@/lib/job-feed', () => ({
  createJobFeedEvent: mocks.createJobFeedEvent,
  applyQuoteAcceptance: mocks.applyQuoteAcceptance,
}));

vi.mock('@/lib/account-events', () => ({
  recordAccountEvent: mocks.recordAccountEvent,
}));

vi.mock('@/lib/crew', () => ({
  listCrew: mocks.listCrew,
  listCrewIdsForJob: mocks.listCrewIdsForJob,
}));

vi.mock('@/lib/distance', () => ({
  coordOf: mocks.coordOf,
}));

vi.mock('@/lib/cancellation-waitlist', async () => {
  const actual = await vi.importActual<typeof import('@/lib/cancellation-waitlist')>('@/lib/cancellation-waitlist');
  return {
    ...actual,
    rankWaitlistCandidates: mocks.rankWaitlistCandidates,
  };
});

import {
  getReviewsSummary,
  loadReviewActivity,
  getReviewActivityRow,
  setReviewResolved,
  setReviewRemindersStopped,
  sendReviewReminder,
  countRecentPrivateFeedback,
  createReviewInvite,
  getReviewInviteByToken,
  recordReviewRating,
  recordGoogleClick,
  countCompletedJobsAwaitingReview,
  submitPrivateFeedback,
} from '@/lib/reviews';

import {
  loadWaitlistContext,
  addWaitlistEntry,
  updateWaitlistEntry,
  removeWaitlistEntry,
  findCandidatesForOpenedWindow,
  createAndSendWaitlistOffer,
  resolveWaitlistOfferReply,
  expireHoldsAndCascade,
  cancelWaitlistOffer,
} from '@/lib/cancellation-waitlist-data';

import {
  COGS_RATES,
  getAccountUnitEconomics,
  batchGetAccountMargins,
  getPlatformMarginSummary,
  getUnprofitableAccountIds,
} from '@/lib/admin-margin';

import {
  formatScheduleOption,
  createScheduleRequest,
  createAndSendScheduleRequest,
  getPublicScheduleRequest,
  getClientJobScheduleRequest,
  selectScheduleOption,
  selectClientJobScheduleOption,
  requestDifferentScheduleOptions,
  requestDifferentClientJobScheduleOptions,
  listActiveScheduleRequests,
} from '@/lib/scheduling';

type MockTableConfig = {
  data?: unknown;
  error?: unknown;
  count?: number;
};

function createMockSupabase(tables: Record<string, MockTableConfig> = {}) {
  const mockQuery = (tableName: string) => {
    let result = tables[tableName] ?? { data: [], error: null };
    let selectedSingle = false;
    let countRequested = false;

    const builder: Record<string, unknown> = {
      select: vi.fn((_cols?: string, opts?: { count?: string; head?: boolean }) => {
        if (opts?.count === 'exact') {
          countRequested = true;
        }
        return builder;
      }),
      insert: vi.fn((val: unknown) => {
        builder._lastInsert = val;
        const inserted = Array.isArray(val) ? val : [val];
        const initialData = Array.isArray(result.data) ? result.data : [];
        const enriched = inserted.map((item, idx) => {
          const base = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
          const fallbackId = initialData[idx]?.id ?? `gen-${tableName}-${idx + 1}`;
          return { id: fallbackId, ...base };
        });
        result = { ...result, data: enriched };
        return builder;
      }),
      update: vi.fn((val: unknown) => {
        builder._lastUpdate = val;
        if (Array.isArray(result.data) && result.data.length > 0) {
          result = {
            ...result,
            data: result.data.map((item: unknown) => ({ ...(item as Record<string, unknown>), ...(val as Record<string, unknown>) })),
          };
        }
        return builder;
      }),
      delete: vi.fn(() => builder),
      eq: vi.fn((field: string, val: unknown) => {
        if (Array.isArray(result.data)) {
          const filtered = result.data.filter((item: unknown) => {
            if (item && typeof item === 'object' && field in item) {
              return (item as Record<string, unknown>)[field] === val;
            }
            return true;
          });
          result = { ...result, data: filtered };
        }
        return builder;
      }),
      neq: vi.fn(() => builder),
      in: vi.fn((field: string, vals: unknown[]) => {
        if (Array.isArray(result.data)) {
          const valSet = new Set(vals);
          const filtered = result.data.filter((item: unknown) => {
            if (item && typeof item === 'object' && field in item) {
              return valSet.has((item as Record<string, unknown>)[field]);
            }
            return true;
          });
          result = { ...result, data: filtered };
        }
        return builder;
      }),
      is: vi.fn(() => builder),
      not: vi.fn(() => builder),
      or: vi.fn(() => builder),
      gte: vi.fn(() => builder),
      lte: vi.fn(() => builder),
      gt: vi.fn(() => builder),
      lt: vi.fn(() => builder),
      limit: vi.fn(() => builder),
      order: vi.fn(() => builder),
      single: vi.fn(() => {
        selectedSingle = true;
        const d = Array.isArray(result.data) ? (result.data[0] ?? null) : result.data;
        const cnt = result.count !== undefined ? result.count : (Array.isArray(result.data) ? result.data.length : 0);
        return Promise.resolve({ data: d, count: countRequested ? cnt : undefined, error: result.error ?? null });
      }),
      maybeSingle: vi.fn(() => {
        selectedSingle = true;
        const d = Array.isArray(result.data) ? (result.data[0] ?? null) : result.data;
        const cnt = result.count !== undefined ? result.count : (Array.isArray(result.data) ? result.data.length : 0);
        return Promise.resolve({ data: d, count: countRequested ? cnt : undefined, error: result.error ?? null });
      }),
      then: (resolve: (val: unknown) => unknown) => {
        const d = selectedSingle && Array.isArray(result.data)
          ? (result.data[0] ?? null)
          : result.data;
        const cnt = result.count !== undefined
          ? result.count
          : Array.isArray(result.data) ? result.data.length : 0;
        return Promise.resolve(resolve({
          data: d,
          count: countRequested ? cnt : undefined,
          error: result.error ?? null,
        }));
      },
    };

    return builder;
  };

  const client: any = {
    from: vi.fn((tableName: string) => mockQuery(tableName)),
  };
  return client;
}

describe('reputation, waitlist, margin, and scheduling engine test suite', () => {
  const accountId = 'acc-rep-101';

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isPhoneOptedOut.mockResolvedValue(false);
    mocks.recordSmsConsent.mockResolvedValue(undefined);
    mocks.sendReviewRequestSms.mockResolvedValue('sms-review-1');
    mocks.sendReviewRequestEmail.mockResolvedValue(undefined);
    mocks.sendContractorAlertEmail.mockResolvedValue(undefined);
    mocks.sendCrewScheduleSelectedSms.mockResolvedValue('sms-crew-1');
    mocks.sendSchedulingOptionsSms.mockResolvedValue('sms-sched-1');
    mocks.enqueueSmsDelivery.mockResolvedValue({ id: 'sms-del-1' });
    mocks.getAccountOwnerEmail.mockResolvedValue('owner@apex.test');
  });

  describe('1. reviews.ts', () => {
    it('getReviewsSummary summarizes invite metrics and degrades on missing table', async () => {
      const mockDb = createMockSupabase({
        review_invites: {
          data: [
            {
              id: 'inv-1',
              job_id: 'job-1',
              client_name: 'David',
              rating: 5,
              feedback: 'Outstanding service!',
              routed_to: 'google',
              google_clicked_at: '2026-09-10T14:00:00Z',
              created_at: '2026-09-10T12:00:00Z',
            },
          ],
        },
      });

      const summary = await getReviewsSummary(mockDb, accountId);
      expect(summary.totalInvites).toBe(1);
      expect(summary.avgRating).toBe(5);

      const errDb = createMockSupabase({
        review_invites: { error: { message: 'relation not found' } },
      });
      const emptySummary = await getReviewsSummary(errDb, accountId);
      expect(emptySummary.totalInvites).toBe(0);
    });

    it('loadReviewActivity merges jobs, feed channels and invitation records', async () => {
      const mockDb = createMockSupabase({
        review_invites: {
          data: [
            {
              id: 'inv-1',
              job_id: 'job-1',
              client_name: 'Alice',
              rating: 5,
              feedback: null,
              created_at: '2026-09-10T10:00:00Z',
              resolved_at: null,
              reminders_sent: 0,
              last_reminded_at: null,
              reminders_stopped_at: null,
            },
          ],
        },
        jobs: {
          data: [
            {
              id: 'job-1',
              ref: 'JOB-99',
              client_id: 'c-1',
              client_name: 'Alice Cooper',
              client_phone: '555-111-2222',
              client_email: 'alice@example.com',
            },
          ],
        },
        job_feed: {
          data: [
            {
              job_id: 'job-1',
              meta: { channel: 'sms' },
              created_at: '2026-09-10T10:01:00Z',
            },
          ],
        },
      });
      mocks.createAdminClient.mockReturnValue(mockDb);

      const rows = await loadReviewActivity(mockDb, accountId, mockDb);
      expect(rows.length).toBe(1);
      expect(rows[0].clientName).toBe('Alice');
      expect(rows[0].channel).toBe('sms');
      expect(rows[0].jobRef).toBe('JOB-99');
    });

    it('getReviewActivityRow returns null when invite not found', async () => {
      const mockDb = createMockSupabase({
        review_invites: { data: [] },
      });
      mocks.createAdminClient.mockReturnValue(mockDb);

      const row = await getReviewActivityRow(mockDb, accountId, 'missing-id', mockDb);
      expect(row).toBeNull();
    });

    it('setReviewResolved and setReviewRemindersStopped update timestamps', async () => {
      const mockDb = createMockSupabase({
        review_invites: { data: [{ id: 'inv-1' }] },
      });

      await setReviewResolved(mockDb, accountId, 'inv-1', true);
      expect(mockDb.from).toHaveBeenCalledWith('review_invites');

      await setReviewResolved(mockDb, accountId, 'inv-1', false);
      expect(mockDb.from).toHaveBeenCalledWith('review_invites');

      await setReviewRemindersStopped(mockDb, accountId, 'inv-1', true);
      expect(mockDb.from).toHaveBeenCalledWith('review_invites');
    });

    it('sendReviewReminder dispatches SMS reminder and updates counter', async () => {
      const mockDb = createMockSupabase({
        review_invites: {
          data: [
            {
              id: 'inv-1',
              account_id: accountId,
              job_id: 'job-1',
              client_name: 'Bob',
              token: 'tok-12345',
              google_url: 'https://google.com/review',
              reminders_sent: 0,
              created_at: '2026-09-05T10:00:00Z', // 8 days ago
              rating: null,
              responded_at: null,
              resolved_at: null,
              reminders_stopped_at: null,
            },
          ],
        },
        accounts: {
          data: [{ review_feedback_page_enabled: true }],
        },
        jobs: {
          data: [{ id: 'job-1', ref: 'JOB-01', client_phone: '555-444-3333' }],
        },
      });
      mocks.createAdminClient.mockReturnValue(mockDb);

      const res = await sendReviewReminder(mockDb, accountId, 'inv-1', '2026-09-13T10:00:00Z', mockDb);
      expect(res.ok).toBe(true);
      expect(mocks.sendReviewRequestSms).toHaveBeenCalled();
      expect(mocks.createJobFeedEvent).toHaveBeenCalled();
    });

    it('countRecentPrivateFeedback counts feedback entries', async () => {
      const mockDb = createMockSupabase({
        review_invites: { count: 3 },
      });

      const count = await countRecentPrivateFeedback(mockDb, accountId, 30);
      expect(count).toBe(3);
    });

    it('createReviewInvite inserts invite and returns token', async () => {
      const mockDb = createMockSupabase({
        review_invites: { data: [{ id: 'inv-new' }] },
      });

      const token = await createReviewInvite(mockDb, accountId, 'job-1', 'Charlie', 'https://google.com/biz');
      expect(token).toBeTruthy();
      expect(mockDb.from).toHaveBeenCalledWith('review_invites');
    });

    it('getReviewInviteByToken resolves invite and business name', async () => {
      const mockDb = createMockSupabase({
        review_invites: {
          data: [
            {
              id: 'inv-1',
              account_id: accountId,
              token: 'tok-abc',
              client_name: 'Diana',
              google_url: 'https://google.com/biz',
            },
          ],
        },
        accounts: { data: [{ business_name: 'Apex Heating' }] },
        sites: { data: [{ company_name: 'Apex Comfort' }] },
      });

      const invite = await getReviewInviteByToken(mockDb, 'tok-abc');
      expect(invite).not.toBeNull();
      expect(invite?.client_name).toBe('Diana');
      expect(invite?.business_name).toBe('Apex Comfort');
    });

    it('recordReviewRating and recordGoogleClick update status', async () => {
      const mockDb = createMockSupabase({
        review_invites: {
          data: [{ id: 'inv-1', token: 'tok-abc', google_url: 'https://google.com/review' }],
        },
      });

      await recordReviewRating(mockDb, 'tok-abc', 5);
      expect(mockDb.from).toHaveBeenCalledWith('review_invites');

      const url = await recordGoogleClick(mockDb, 'tok-abc');
      expect(url).toBe('https://google.com/review');
    });

    it('countCompletedJobsAwaitingReview computes set difference', async () => {
      const mockDb = createMockSupabase({
        jobs: {
          data: [{ id: 'job-done-1' }, { id: 'job-done-2' }, { id: 'job-done-3' }],
        },
        job_feed: {
          data: [{ job_id: 'job-done-1' }],
        },
      });

      const count = await countCompletedJobsAwaitingReview(mockDb, accountId, mockDb);
      expect(count).toBe(2);
    });

    it('submitPrivateFeedback saves feedback and alerts owner', async () => {
      const mockDb = createMockSupabase({
        review_invites: {
          data: [
            {
              id: 'inv-1',
              token: 'tok-fb',
              account_id: accountId,
              job_id: 'job-1',
              client_name: 'Evan',
              rating: 3,
            },
          ],
        },
      });

      await submitPrivateFeedback(mockDb, 'tok-fb', 'Tech was polite but was late 30 mins.');
      expect(mockDb.from).toHaveBeenCalledWith('review_invites');
      expect(mocks.createJobFeedEvent).toHaveBeenCalled();
      expect(mocks.sendContractorAlertEmail).toHaveBeenCalled();
    });
  });

  describe('2. cancellation-waitlist-data.ts', () => {
    it('loadWaitlistContext gracefully detects missing table 42P01', async () => {
      const mockDb = createMockSupabase({
        cancellation_waitlist: { error: { code: '42P01' } },
      });

      const ctx = await loadWaitlistContext(mockDb, accountId);
      expect(ctx.available).toBe(false);
      expect(ctx.entries).toEqual([]);
    });

    it('addWaitlistEntry, updateWaitlistEntry, and removeWaitlistEntry manage lifecycle', async () => {
      const mockDb = createMockSupabase({
        accounts: { data: [{ cancellation_waitlist_enabled: true }] },
        cancellation_waitlist: {
          data: [
            {
              id: 'wl-1',
              client_name: 'Frank',
              client_phone: '+15554443333',
              status: 'active',
            },
          ],
        },
      });

      const entry = await addWaitlistEntry(mockDb, accountId, {
        clientName: 'Frank',
        clientPhone: '555-444-3333',
        serviceName: 'A/C Tuneup',
        estimatedHours: 1.5,
      });
      expect(entry.id).toBe('wl-1');

      const updated = await updateWaitlistEntry(mockDb, accountId, 'wl-1', {
        notes: 'Flexible morning or afternoon',
      });
      expect(updated.id).toBe('wl-1');

      await removeWaitlistEntry(mockDb, accountId, 'wl-1');
      expect(mockDb.from).toHaveBeenCalledWith('cancellation_waitlist');
    });

    it('findCandidatesForOpenedWindow ranks active waitlist entries with route anchors', async () => {
      const mockDb = createMockSupabase({
        cancellation_waitlist: {
          data: [
            {
              id: 'wl-1',
              client_name: 'Grace',
              client_phone: '+15556667777',
              lat: 34.0,
              lng: -84.0,
              status: 'active',
            },
          ],
        },
        jobs: {
          data: [{ lat: 34.01, lng: -84.01 }],
        },
      });

      mocks.rankWaitlistCandidates.mockReturnValue([
        {
          entry: { id: 'wl-1', client_name: 'Grace' },
          rank: 1,
          score: { totalScore: 88 },
        },
      ]);

      const candidates = await findCandidatesForOpenedWindow(mockDb, accountId, {
        dateKey: '2026-09-18',
        windowStart: '09:00',
        windowEnd: '12:00',
      });

      expect(candidates.length).toBe(1);
      expect(mocks.rankWaitlistCandidates).toHaveBeenCalled();
    });

    it('createAndSendWaitlistOffer creates pending offer and enqueues SMS', async () => {
      const mockDb = createMockSupabase({
        cancellation_waitlist: {
          data: [
            {
              id: 'wl-1',
              client_name: 'Harry',
              client_phone: '+15558889999',
              client_id: 'cl-1',
              job_id: 'job-1',
            },
          ],
        },
        accounts: { data: [{ cancellation_waitlist_enabled: true }] },
        waitlist_offers: {
          data: [
            {
              id: 'offer-1',
              account_id: accountId,
              waitlist_entry_id: 'wl-1',
              status: 'pending',
            },
          ],
        },
      });

      const offer = await createAndSendWaitlistOffer(mockDb, accountId, {
        waitlistEntryId: 'wl-1',
        slot: { dateKey: '2026-09-18', windowStart: '10:00', windowEnd: '12:00' },
        rank: 1,
        score: { totalScore: 90 } as any,
        holdMinutes: 30,
      });

      expect(offer.id).toBe('offer-1');
      expect(mocks.enqueueSmsDelivery).toHaveBeenCalled();
      expect(mocks.recordAccountEvent).toHaveBeenCalled();
    });

    it('resolveWaitlistOfferReply updates status on acceptance or decline', async () => {
      const mockDbAccept = createMockSupabase({
        waitlist_offers: {
          data: [
            {
              id: 'off-1',
              account_id: accountId,
              waitlist_entry_id: 'wl-1',
              job_id: 'job-1',
              status: 'pending',
              opened_slot_date: '2026-09-19',
              arrival_time: '11:00',
            },
          ],
        },
        cancellation_waitlist: { data: [{ id: 'wl-1' }] },
        jobs: { data: [{ id: 'job-1' }] },
      });

      const acceptRes = await resolveWaitlistOfferReply(mockDbAccept, 'off-1', 'YES', accountId);
      expect(acceptRes.decision).toBe('accepted');
      expect(mockDbAccept.from).toHaveBeenCalledWith('jobs');

      const mockDbDecline = createMockSupabase({
        waitlist_offers: {
          data: [
            {
              id: 'off-2',
              account_id: accountId,
              waitlist_entry_id: 'wl-2',
              status: 'pending',
              auto_cascade: false,
            },
          ],
        },
        cancellation_waitlist: { data: [{ id: 'wl-2' }] },
      });

      const declineRes = await resolveWaitlistOfferReply(mockDbDecline, 'off-2', 'NO thanks', accountId);
      expect(declineRes.decision).toBe('declined');
    });

    it('expireHoldsAndCascade and cancelWaitlistOffer update offer status', async () => {
      const mockDb = createMockSupabase({
        waitlist_offers: {
          data: [
            {
              id: 'off-exp',
              account_id: accountId,
              waitlist_entry_id: 'wl-1',
              status: 'pending',
              auto_cascade: false,
            },
          ],
        },
        cancellation_waitlist: { data: [{ id: 'wl-1' }] },
      });

      const res = await expireHoldsAndCascade(mockDb, accountId);
      expect(res.expiredCount).toBe(1);

      await cancelWaitlistOffer(mockDb, accountId, 'off-exp');
      expect(mockDb.from).toHaveBeenCalledWith('waitlist_offers');
    });
  });

  describe('3. admin-margin.ts', () => {
    it('getAccountUnitEconomics calculates net margin, cogs and unprofitable flag', async () => {
      const mockDb = createMockSupabase({
        payments: {
          data: [
            { platform_fee: 10.0, platform_fee_refunded: 0.0, status: 'paid' },
            { platform_fee: 5.0, platform_fee_refunded: 1.0, status: 'paid' },
          ],
        },
        sms_events: {
          data: [
            { id: 'sms-1', context: 'automation' },
            { id: 'sms-2', context: 'general' },
          ],
        },
        voice_calls: {
          data: [
            { id: 'vc-1', billed_minutes: 5, ai_seconds: null },
            { id: 'vc-2', billed_minutes: 0, ai_seconds: 120 }, // 2 mins
          ],
        },
      });

      const profile = await getAccountUnitEconomics(mockDb, accountId, '30d');
      expect(profile.feeRevenueDollars).toBe(14.0); // 10 + 4
      expect(profile.usageBreakdown.smsCount).toBe(2);
      expect(profile.usageBreakdown.aiThreads).toBe(1);
      expect(profile.usageBreakdown.voiceMinutes).toBe(7); // 5 + 2
      expect(profile.totalCogsDollars).toBeGreaterThan(0);
      expect(profile.netMarginDollars).toBeGreaterThan(0);
      expect(profile.isUnprofitable).toBe(false);
      expect(profile.isDrain).toBe(false);
    });

    it('batchGetAccountMargins computes margins for multiple accounts', async () => {
      const mockDb = createMockSupabase({
        payments: {
          data: [{ account_id: 'acc-1', platform_fee: 25.0, platform_fee_refunded: 0, status: 'paid' }],
        },
        sms_events: {
          data: [
            { account_id: 'acc-1' },
            { account_id: 'acc-2' },
          ],
        },
        voice_calls: {
          data: [{ account_id: 'acc-2', billed_minutes: 20 }],
        },
      });

      const margins = await batchGetAccountMargins(mockDb, ['acc-1', 'acc-2'], '30d');
      expect(margins.size).toBe(2);
      expect(margins.get('acc-1')?.feeRevenueDollars).toBe(25);
      expect(margins.get('acc-2')?.feeRevenueDollars).toBe(0);
      expect(margins.get('acc-2')?.isUnprofitable).toBe(true);
    });

    it('getPlatformMarginSummary aggregates platform totals', async () => {
      const mockDb = createMockSupabase({
        payments: {
          data: [{ platform_fee: 100.0, platform_fee_refunded: 10.0 }],
        },
        sms_events: {
          data: [{ id: 's1' }, { id: 's2' }],
        },
        voice_calls: {
          data: [{ billed_minutes: 10, ai_seconds: 0 }],
        },
      });

      const summary = await getPlatformMarginSummary(mockDb, '30d');
      expect(summary.grossPlatformFees).toBe(90.0);
      expect(summary.totalTelephonyAndAiCogs).toBeGreaterThan(0);
      expect(summary.netPlatformTake).toBeLessThan(90.0);
    });

    it('getUnprofitableAccountIds discovers unprofitable candidate accounts', async () => {
      const mockDb = createMockSupabase({
        sms_events: {
          data: [{ account_id: 'acc-unprof' }],
        },
        voice_calls: {
          data: [{ account_id: 'acc-unprof', billed_minutes: 30 }],
        },
        payments: {
          data: [], // 0 fee revenue
        },
      });

      const unprofitables = await getUnprofitableAccountIds(mockDb);
      expect(unprofitables).toContain('acc-unprof');
    });
  });

  describe('4. scheduling.ts', () => {
    it('formatScheduleOption formats date and time options', () => {
      const opt = { date: '2026-09-20', time: '10:00 AM' };
      const formatted = formatScheduleOption(opt);
      expect(formatted).toBeTruthy();
    });

    it('createScheduleRequest and createAndSendScheduleRequest create hashed token and send SMS', async () => {
      const mockDb = createMockSupabase({
        jobs: {
          data: [
            {
              id: 'job-1',
              account_id: accountId,
              ref: 'JOB-77',
              client_name: 'Isabel',
              client_phone: '555-333-8888',
            },
          ],
        },
        accounts: { data: [{ business_name: 'Apex' }] },
        job_schedule_requests: {
          data: [
            {
              id: 'sr-1',
              account_id: accountId,
              job_id: 'job-1',
              status: 'open',
            },
          ],
        },
      });

      const { request, token } = await createScheduleRequest(mockDb, accountId, 'job-1', {
        clientPhone: '555-333-8888',
        options: [{ date: '2026-09-21', time: '09:00 AM' }],
      });
      expect(request.id).toBe('sr-1');
      expect(token).toBeTruthy();

      const sentRequest = await createAndSendScheduleRequest(mockDb, accountId, 'job-1', {
        clientPhone: '555-333-8888',
        options: [{ date: '2026-09-21', time: '09:00 AM' }],
      });
      expect(sentRequest.id).toBe('sr-1');
      expect(mocks.sendSchedulingOptionsSms).toHaveBeenCalled();
    });

    it('getPublicScheduleRequest verifies and hydrates token requests', async () => {
      const mockDb = createMockSupabase({
        job_schedule_requests: {
          data: [
            {
              id: 'sr-1',
              account_id: accountId,
              job_id: 'job-1',
              status: 'open',
              options: [{ date: '2026-09-22', time: '14:00' }],
            },
          ],
        },
        accounts: { data: [{ business_name: 'Apex Mechanical' }] },
        sites: { data: [{ company_name: 'Apex Mechanical' }] },
        jobs: {
          data: [
            {
              id: 'job-1',
              ref: 'JOB-88',
              client_name: 'Julia',
              address: '789 Oak Ln',
            },
          ],
        },
      });
      mocks.createAdminClient.mockReturnValue(mockDb);

      const pubReq = await getPublicScheduleRequest('sample-token');
      expect(pubReq).not.toBeNull();
      expect(pubReq?.businessName).toBe('Apex Mechanical');
      expect(pubReq?.job.ref).toBe('JOB-88');
    });

    it('selectScheduleOption enforces deposit gate if applicable and completes selection', async () => {
      const mockDb = createMockSupabase({
        job_schedule_requests: {
          data: [
            {
              id: 'sr-1',
              account_id: accountId,
              job_id: 'job-1',
              status: 'open',
              options: [{ date: '2026-09-22', time: '14:00' }],
            },
          ],
        },
        jobs: {
          data: [
            {
              id: 'job-1',
              ref: 'JOB-88',
              client_name: 'Julia',
              address: '789 Oak Ln',
              deposit_gate: 'before_schedule',
            },
          ],
        },
        payments: {
          count: 0, // No deposit paid!
        },
        accounts: { data: [{ business_name: 'Apex Mechanical' }] },
      });
      mocks.createAdminClient.mockReturnValue(mockDb);

      await expect(selectScheduleOption('sample-token', 0, 'Morning preferred')).rejects.toThrow('Please pay your deposit');

      // Now with deposit paid
      const mockDbPaid = createMockSupabase({
        job_schedule_requests: {
          data: [
            {
              id: 'sr-1',
              account_id: accountId,
              job_id: 'job-1',
              status: 'open',
              options: [{ date: '2026-09-22', time: '14:00' }],
            },
          ],
        },
        jobs: {
          data: [
            {
              id: 'job-1',
              ref: 'JOB-88',
              client_name: 'Julia',
              address: '789 Oak Ln',
              deposit_gate: 'before_schedule',
            },
          ],
        },
        payments: {
          count: 1, // Deposit paid
        },
        accounts: { data: [{ business_name: 'Apex Mechanical' }] },
      });
      mocks.createAdminClient.mockReturnValue(mockDbPaid);
      mocks.listCrewIdsForJob.mockResolvedValue(['crew-1']);
      mocks.listCrew.mockResolvedValue([{ id: 'crew-1', name: 'John Doe', phone: '555-999-8888' }]);

      const updated = await selectScheduleOption('sample-token', 0, 'Morning preferred');
      expect(updated.status).toBe('selected');
      expect(mocks.applyQuoteAcceptance).toHaveBeenCalled();
      expect(mocks.createJobFeedEvent).toHaveBeenCalled();
      expect(mocks.sendCrewScheduleSelectedSms).toHaveBeenCalled();
      expect(mocks.sendContractorAlertEmail).toHaveBeenCalled();
    });

    it('requestDifferentScheduleOptions transitions request to needs_more_options', async () => {
      const mockDb = createMockSupabase({
        job_schedule_requests: {
          data: [
            {
              id: 'sr-1',
              account_id: accountId,
              job_id: 'job-1',
              status: 'open',
              options: [{ date: '2026-09-22', time: '14:00' }],
            },
          ],
        },
        jobs: {
          data: [{ id: 'job-1', ref: 'JOB-88', client_name: 'Julia' }],
        },
        accounts: { data: [{ business_name: 'Apex Mechanical' }] },
      });
      mocks.createAdminClient.mockReturnValue(mockDb);

      const res = await requestDifferentScheduleOptions('sample-token', 'I am out of town that week');
      expect(res.status).toBe('needs_more_options');
      expect(mocks.createJobFeedEvent).toHaveBeenCalled();
      expect(mocks.sendContractorAlertEmail).toHaveBeenCalled();
    });

    it('getClientJobScheduleRequest, selectClientJobScheduleOption and requestDifferentClientJobScheduleOptions work via client job access', async () => {
      const mockDb = createMockSupabase({
        client_job_access: {
          data: [
            {
              account_id: accountId,
              job_id: 'job-1',
              expires_at: null,
              revoked_at: null,
            },
          ],
        },
        job_schedule_requests: {
          data: [
            {
              id: 'sr-client-1',
              account_id: accountId,
              job_id: 'job-1',
              status: 'open',
              options: [{ date: '2026-09-25', time: '10:00 AM' }],
            },
          ],
        },
        jobs: {
          data: [{ id: 'job-1', ref: 'JOB-12', client_name: 'Kevin' }],
        },
        accounts: { data: [{ business_name: 'Apex Mechanical' }] },
      });
      mocks.createAdminClient.mockReturnValue(mockDb);

      const req = await getClientJobScheduleRequest('client-tok-1');
      expect(req).not.toBeNull();

      const selected = await selectClientJobScheduleOption('client-tok-1', 0, null);
      expect(selected.status).toBe('selected');

      // Now test requestDifferentClientJobScheduleOptions
      const mockDbOpen = createMockSupabase({
        client_job_access: {
          data: [{ account_id: accountId, job_id: 'job-1' }],
        },
        job_schedule_requests: {
          data: [
            {
              id: 'sr-client-2',
              account_id: accountId,
              job_id: 'job-1',
              status: 'open',
              options: [{ date: '2026-09-25', time: '10:00 AM' }],
            },
          ],
        },
        jobs: {
          data: [{ id: 'job-1', ref: 'JOB-12', client_name: 'Kevin' }],
        },
        accounts: { data: [{ business_name: 'Apex Mechanical' }] },
      });
      mocks.createAdminClient.mockReturnValue(mockDbOpen);

      const diff = await requestDifferentClientJobScheduleOptions('client-tok-1', 'Need afternoon');
      expect(diff.status).toBe('needs_more_options');
    });

    it('listActiveScheduleRequests batches chunked jobs', async () => {
      const mockDb = createMockSupabase({
        job_schedule_requests: {
          data: [
            {
              job_id: 'job-1',
              status: 'open',
              selected_date: null,
              selected_time: null,
              client_notes: null,
              responded_at: null,
              sent_at: '2026-09-12T10:00:00Z',
            },
          ],
        },
      });

      const summary = await listActiveScheduleRequests(mockDb, accountId, ['job-1']);
      expect(summary['job-1']).toBeDefined();
      expect(summary['job-1'].status).toBe('open');

      const empty = await listActiveScheduleRequests(mockDb, accountId, []);
      expect(empty).toEqual({});
    });
  });
});
