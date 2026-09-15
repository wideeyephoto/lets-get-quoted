import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  redirect: vi.fn((path: string) => {
    const err = new Error(`NEXT_REDIRECT:${path}`);
    (err as unknown as { digest: string }).digest = `NEXT_REDIRECT;replace;${path};307;;`;
    throw err;
  }),
  headers: vi.fn(async () => ({
    get: vi.fn((k: string) => (k === 'x-forwarded-for' ? '127.0.0.1' : null)),
  })),
  createAdminClient: vi.fn(),
  checkRateLimit: vi.fn().mockResolvedValue(true),
  checkRateLimitStrict: vi.fn().mockResolvedValue(true),
  clientIpFrom: vi.fn().mockReturnValue('127.0.0.1'),
  getPublicSiteBySubdomain: vi.fn(),
  getSiteContent: vi.fn().mockReturnValue({ leadFilters: {} }),
  isFullyBookedActive: vi.fn().mockReturnValue(false),
  createBooking: vi.fn(),
  createBookingRequestLead: vi.fn(),
  getAvailableBookingDays: vi.fn(),
  findOfferedSlot: vi.fn(),
  claimBookingHold: vi.fn(),
  expandScheduledJobs: vi.fn().mockReturnValue([]),
  isMissingEndDateColumn: vi.fn().mockReturnValue(false),
  geocodeAddress: vi.fn(),
  coordOf: vi.fn(),
  nearestMiles: vi.fn(),
  driveDistances: vi.fn(),
  rankByProximity: vi.fn(),
  evaluateBookingEligibility: vi.fn(),
  bookingFallbackMessage: vi.fn().mockReturnValue({ heading: 'Fallback', body: 'Contact us' }),
  normalizeGeoMode: vi.fn().mockReturnValue('prefer'),
  listServices: vi.fn(),
  quickStopSettingsFromAccount: vi.fn(),
  isAllowedQuickStopDay: vi.fn().mockReturnValue(true),
  qualifyQuickStop: vi.fn(),
  qualifyOptionsFromSettings: vi.fn().mockReturnValue({}),
  reaffirmQualification: vi.fn(),
  readQuickStopVerdictToken: vi.fn(),
  recordQuickStopScreening: vi.fn(),
  createQuickStopRequest: vi.fn(),
  hasActiveQuickStopRequest: vi.fn(),
  uploadLeadPhoto: vi.fn(),
  referrerFromCode: vi.fn().mockReturnValue(null),
}));

vi.mock('next/navigation', () => ({
  redirect: mocks.redirect,
}));

vi.mock('next/headers', () => ({
  headers: mocks.headers,
}));

vi.mock('@/lib/auth', () => ({
  createAdminClient: mocks.createAdminClient,
}));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: mocks.checkRateLimit,
  checkRateLimitStrict: mocks.checkRateLimitStrict,
  clientIpFrom: mocks.clientIpFrom,
}));

vi.mock('@/lib/sites', () => ({
  getPublicSiteBySubdomain: mocks.getPublicSiteBySubdomain,
}));

vi.mock('@/lib/site-content', () => ({
  getSiteContent: mocks.getSiteContent,
  isFullyBookedActive: mocks.isFullyBookedActive,
}));

vi.mock('@/lib/booking', () => ({
  createBooking: mocks.createBooking,
  createBookingRequestLead: mocks.createBookingRequestLead,
  getAvailableBookingDays: mocks.getAvailableBookingDays,
  findOfferedSlot: mocks.findOfferedSlot,
  claimBookingHold: mocks.claimBookingHold,
}));

vi.mock('@/lib/jobs', () => ({
  expandScheduledJobs: mocks.expandScheduledJobs,
  isMissingEndDateColumn: mocks.isMissingEndDateColumn,
  SPAN_COLUMNS: 'id, account_id, scheduled_for',
  SPAN_COLUMNS_BEFORE_END_DATE: 'id, account_id, scheduled_for',
}));

vi.mock('@/lib/geocode', () => ({
  geocodeAddress: mocks.geocodeAddress,
}));

vi.mock('@/lib/distance', () => ({
  coordOf: mocks.coordOf,
  nearestMiles: mocks.nearestMiles,
}));

vi.mock('@/lib/drive-time', () => ({
  driveDistances: mocks.driveDistances,
}));

vi.mock('@/lib/route-density', () => ({
  rankByProximity: mocks.rankByProximity,
}));

vi.mock('@/lib/instant-booking', () => ({
  evaluateBookingEligibility: mocks.evaluateBookingEligibility,
  bookingFallbackMessage: mocks.bookingFallbackMessage,
  normalizeGeoMode: mocks.normalizeGeoMode,
}));

vi.mock('@/lib/services', () => ({
  listServices: mocks.listServices,
}));

vi.mock('@/lib/quick-stop', () => ({
  quickStopSettingsFromAccount: mocks.quickStopSettingsFromAccount,
  isAllowedQuickStopDay: mocks.isAllowedQuickStopDay,
  QUICK_STOP_SETTINGS_COLUMNS: 'quick_stop_enabled, quick_stop_price',
}));

vi.mock('@/lib/quick-stop-qualify', () => ({
  qualifyQuickStop: mocks.qualifyQuickStop,
  qualifyOptionsFromSettings: mocks.qualifyOptionsFromSettings,
  reaffirmQualification: mocks.reaffirmQualification,
}));

vi.mock('@/lib/quick-stop-verdict', () => ({
  readQuickStopVerdictToken: mocks.readQuickStopVerdictToken,
}));

vi.mock('@/lib/quick-stop-screenings', () => ({
  recordQuickStopScreening: mocks.recordQuickStopScreening,
}));

vi.mock('@/lib/quick-stop-requests', () => ({
  createQuickStopRequest: mocks.createQuickStopRequest,
  hasActiveQuickStopRequest: mocks.hasActiveQuickStopRequest,
}));

vi.mock('@/lib/lead-photo-storage', () => ({
  uploadLeadPhoto: mocks.uploadLeadPhoto,
}));

vi.mock('@/lib/referral', () => ({
  referrerFromCode: mocks.referrerFromCode,
}));

import {
  evaluateBookingAction,
  submitBookingAction,
  submitQuickStopRequestAction,
  submitCallbackAction,
} from '@/app/book/[subdomain]/actions';

const TEST_ACCOUNT_ID = 'acc-test-booking-123';
const TEST_SUBDOMAIN = 'apex-plumbing';

function createMockSupabase(overrides: {
  account?: Record<string, unknown>;
  jobs?: unknown[];
} = {}) {
  const accountData = overrides.account ?? {
    id: TEST_ACCOUNT_ID,
    instant_book_enabled: true,
    instant_book_min_amount: 150,
    instant_book_radius_miles: 20,
    instant_book_geo_mode: 'prefer',
    instant_book_drive_time: true,
    schedule_day_hours: 8,
    business_name: 'Apex Plumbing LLC',
    timezone: 'America/New_York',
    connect_onboarded: true,
    stripe_connect_id: 'acct_123',
  };

  const jobsData = overrides.jobs ?? [
    { id: 'job-1', scheduled_for: '2026-09-20', lat: 37.77, lng: -122.41 },
  ];

  return {
    from: vi.fn((table: string) => {
      if (table === 'accounts') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({ data: accountData, error: null }),
            })),
          })),
        };
      }
      if (table === 'jobs') {
        const queryBuilder = {
          select: vi.fn(() => queryBuilder),
          eq: vi.fn(() => queryBuilder),
          not: vi.fn(() => queryBuilder),
          neq: vi.fn(() => queryBuilder),
          then: (resolve: (val: unknown) => unknown) => resolve({ data: jobsData, error: null }),
        };
        return queryBuilder;
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

describe('Public Booking Actions (book/[subdomain]/actions.ts)', () => {
  let mockSupabase: ReturnType<typeof createMockSupabase>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase = createMockSupabase();
    mocks.createAdminClient.mockReturnValue(mockSupabase);
    mocks.checkRateLimit.mockResolvedValue(true);
    mocks.checkRateLimitStrict.mockResolvedValue(true);
    mocks.getPublicSiteBySubdomain.mockResolvedValue({
      account_id: TEST_ACCOUNT_ID,
      company_name: 'Apex Plumbing',
      service_area: 'San Francisco, CA',
      content: {},
    });
  });

  describe('evaluateBookingAction', () => {
    it('returns null when rate limited by IP', async () => {
      mocks.checkRateLimit.mockResolvedValueOnce(false);
      const res = await evaluateBookingAction(TEST_SUBDOMAIN, {
        estimateMax: 300,
        inArea: true,
        excluded: false,
        address: '123 Main St',
      });
      expect(res).toBeNull();
      expect(mocks.checkRateLimit).toHaveBeenCalledWith(
        expect.anything(),
        'bookeval:ip:127.0.0.1',
        60,
        60
      );
    });

    it('returns null when subdomain site is not found', async () => {
      mocks.getPublicSiteBySubdomain.mockResolvedValueOnce(null);
      const res = await evaluateBookingAction('unknown-biz', {
        estimateMax: 300,
        inArea: true,
        excluded: false,
        address: '123 Main St',
      });
      expect(res).toBeNull();
    });

    it('returns fallback and empty days when ineligible', async () => {
      mocks.evaluateBookingEligibility.mockReturnValueOnce({
        eligible: false,
        tier: 'below_floor',
      });
      mocks.bookingFallbackMessage.mockReturnValueOnce({
        heading: 'Job requires quote',
        body: 'Please submit a callback request',
      });

      const res = await evaluateBookingAction(TEST_SUBDOMAIN, {
        estimateMax: 100,
        inArea: true,
        excluded: false,
        address: '123 Main St',
      });

      expect(res).toEqual({
        verdict: { eligible: false, tier: 'below_floor' },
        businessName: 'Apex Plumbing',
        days: [],
        fallback: { heading: 'Job requires quote', body: 'Please submit a callback request' },
      });
      expect(mocks.getAvailableBookingDays).not.toHaveBeenCalled();
    });

    it('ranks available days by proximity when eligible and geocoded', async () => {
      mocks.evaluateBookingEligibility.mockReturnValueOnce({
        eligible: true,
        tier: 'instant',
      });

      const mockDays = [
        { dateKey: '2026-09-20', dayLabel: 'Sun, Sep 20', slots: [{ time: '09:00', endTime: '11:00', label: 'Morning' }] },
      ];
      mocks.getAvailableBookingDays.mockResolvedValueOnce(mockDays);

      mocks.geocodeAddress.mockResolvedValueOnce({
        lat: 37.7749,
        lng: -122.4194,
        precise: true,
      });

      mocks.expandScheduledJobs.mockReturnValueOnce([
        { scheduled_for: '2026-09-20', lat: 37.78, lng: -122.42 },
      ]);
      mocks.coordOf.mockReturnValue({ lat: 37.78, lng: -122.42 });
      mocks.driveDistances.mockResolvedValueOnce([{ miles: 3.5, minutes: 12 }]);

      const ranked = [
        { ...mockDays[0], nearby: true, miles: 3.5, minutes: 12 },
      ];
      mocks.rankByProximity.mockReturnValueOnce(ranked);

      const res = await evaluateBookingAction(TEST_SUBDOMAIN, {
        estimateMax: 500,
        inArea: true,
        excluded: false,
        address: '123 Market St, San Francisco, CA',
      });

      expect(res).toBeDefined();
      expect(res?.verdict.eligible).toBe(true);
      expect(res?.days).toEqual(ranked);
      expect(mocks.rankByProximity).toHaveBeenCalledWith(expect.objectContaining({
        radiusMiles: 20,
        mode: 'prefer',
      }));
    });

    it('degrades to plain availability if geocoding rate limit fails', async () => {
      mocks.evaluateBookingEligibility.mockReturnValueOnce({ eligible: true, tier: 'instant' });
      const mockDays = [{ dateKey: '2026-09-21', dayLabel: 'Mon, Sep 21', slots: [] }];
      mocks.getAvailableBookingDays.mockResolvedValueOnce(mockDays);
      mocks.checkRateLimitStrict.mockResolvedValueOnce(false);

      const res = await evaluateBookingAction(TEST_SUBDOMAIN, {
        estimateMax: 500,
        inArea: true,
        excluded: false,
        address: '123 Market St',
      });

      expect(res?.days).toEqual([{ dateKey: '2026-09-21', dayLabel: 'Mon, Sep 21', slots: [], nearby: false }]);
      expect(mocks.geocodeAddress).not.toHaveBeenCalled();
    });
  });

  describe('submitBookingAction', () => {
    it('redirects with error=busy when IP rate limit fails', async () => {
      mocks.checkRateLimit.mockResolvedValueOnce(false);
      const fd = new FormData();
      fd.append('ref', 'promo123');

      await expect(submitBookingAction(TEST_SUBDOMAIN, fd)).rejects.toThrow('NEXT_REDIRECT:/book/apex-plumbing?error=busy&ref=promo123');
    });

    it('redirects with error=unavailable when site is not found', async () => {
      mocks.getPublicSiteBySubdomain.mockResolvedValueOnce(null);
      const fd = new FormData();

      await expect(submitBookingAction('unknown', fd)).rejects.toThrow('NEXT_REDIRECT:/book/unknown?error=unavailable');
    });

    it('redirects with error=incomplete when required fields are missing', async () => {
      const fd = new FormData();
      fd.append('name', 'John Doe');
      // missing phone, email, address, slot

      await expect(submitBookingAction(TEST_SUBDOMAIN, fd)).rejects.toThrow('NEXT_REDIRECT:/book/apex-plumbing?error=incomplete');
    });

    it('converts to callback lead if estimate is below account floor', async () => {
      const fd = new FormData();
      fd.append('name', 'John Doe');
      fd.append('phone', '(555) 234-5678');
      fd.append('address', '123 Main St');
      fd.append('slot', '2026-09-25|09:00');
      fd.append('estimateMax', '100'); // floor is 150

      await expect(submitBookingAction(TEST_SUBDOMAIN, fd)).rejects.toThrow('NEXT_REDIRECT:/book/apex-plumbing?requested=1');
      expect(mocks.createBookingRequestLead).toHaveBeenCalledWith(
        expect.anything(),
        TEST_ACCOUNT_ID,
        expect.objectContaining({
          name: 'John Doe',
          phone: '+15552345678',
          address: '123 Main St',
        })
      );
      expect(mocks.createBooking).not.toHaveBeenCalled();
    });

    it('redirects with error=slot_taken when slot is not on offer', async () => {
      const fd = new FormData();
      fd.append('name', 'John Doe');
      fd.append('phone', '(555) 234-5678');
      fd.append('address', '123 Main St');
      fd.append('slot', '2026-09-25|09:00');
      fd.append('estimateMax', '300');

      mocks.getAvailableBookingDays.mockResolvedValueOnce([]);
      mocks.findOfferedSlot.mockReturnValueOnce(null);

      await expect(submitBookingAction(TEST_SUBDOMAIN, fd)).rejects.toThrow('NEXT_REDIRECT:/book/apex-plumbing?error=slot_taken');
    });

    it('redirects with error=slot_taken when booking hold cannot be claimed', async () => {
      const fd = new FormData();
      fd.append('name', 'John Doe');
      fd.append('phone', '(555) 234-5678');
      fd.append('address', '123 Main St');
      fd.append('slot', '2026-09-25|09:00');
      fd.append('estimateMax', '300');

      mocks.getAvailableBookingDays.mockResolvedValueOnce([
        { dateKey: '2026-09-25', dayLabel: 'Friday, Sep 25', slots: [{ time: '09:00', endTime: '11:00', label: 'Morning' }] },
      ]);
      mocks.findOfferedSlot.mockReturnValueOnce({
        day: { dateKey: '2026-09-25', dayLabel: 'Friday, Sep 25' },
        slot: { time: '09:00', endTime: '11:00', label: 'Morning' },
      });
      mocks.claimBookingHold.mockResolvedValueOnce(false);

      await expect(submitBookingAction(TEST_SUBDOMAIN, fd)).rejects.toThrow('NEXT_REDIRECT:/book/apex-plumbing?error=slot_taken');
    });

    it('creates booking with primary and alternative slots and redirects to booked confirmation', async () => {
      const fd = new FormData();
      fd.append('name', 'Jane Smith');
      fd.append('phone', '(555) 987-6543');
      fd.append('email', 'jane@example.com');
      fd.append('address', '456 Oak Avenue');
      fd.append('description', 'Leaky pipe');
      fd.append('note', 'Gate code 1234');
      fd.append('slot', '2026-09-25|09:00');
      fd.append('altSlot', '2026-09-26|13:00');
      fd.append('service', 'srv-leak-fix');
      fd.append('estimateMax', '400');
      fd.append('ref', 'REF-CODE-99');

      mocks.referrerFromCode.mockReturnValueOnce('partner-ref-99');
      mocks.getAvailableBookingDays.mockResolvedValue([
        { dateKey: '2026-09-25', dayLabel: 'Fri, Sep 25', slots: [{ time: '09:00', endTime: '11:00', label: 'Morning' }] },
        { dateKey: '2026-09-26', dayLabel: 'Sat, Sep 26', slots: [{ time: '13:00', endTime: '15:00', label: 'Afternoon' }] },
      ]);

      mocks.findOfferedSlot
        .mockReturnValueOnce({
          day: { dateKey: '2026-09-25', dayLabel: 'Fri, Sep 25' },
          slot: { time: '09:00', endTime: '11:00', label: 'Morning' },
        })
        .mockReturnValueOnce({
          day: { dateKey: '2026-09-26', dayLabel: 'Sat, Sep 26' },
          slot: { time: '13:00', endTime: '15:00', label: 'Afternoon' },
        });

      mocks.claimBookingHold.mockResolvedValueOnce(true);
      mocks.listServices.mockResolvedValueOnce([
        { id: 'srv-leak-fix', name: 'Pipe Repair' },
      ]);
      mocks.createBooking.mockResolvedValueOnce({ id: 'lead-booking-888' });

      await expect(submitBookingAction(TEST_SUBDOMAIN, fd)).rejects.toThrow('NEXT_REDIRECT:/book/apex-plumbing?booked=lead-booking-888');

      expect(mocks.createBooking).toHaveBeenCalledWith(
        expect.anything(),
        TEST_ACCOUNT_ID,
        expect.objectContaining({
          name: 'Jane Smith',
          phone: '+15559876543',
          email: 'jane@example.com',
          address: '456 Oak Avenue',
          description: 'Leaky pipe',
          note: 'Gate code 1234',
          serviceName: 'Pipe Repair',
          referredBy: 'partner-ref-99',
          dateKey: '2026-09-25',
          dateLabel: 'Fri, Sep 25',
          time: '09:00',
          endTime: '11:00',
          timeLabel: 'Morning',
          alt: expect.objectContaining({
            dateKey: '2026-09-26',
            dateLabel: 'Sat, Sep 26',
            time: '13:00',
            endTime: '15:00',
            timeLabel: 'Afternoon',
          }),
        })
      );
    });
  });

  describe('submitQuickStopRequestAction', () => {
    it('returns error when rate limited', async () => {
      mocks.checkRateLimit.mockResolvedValueOnce(false);
      const fd = new FormData();
      const res = await submitQuickStopRequestAction(fd);
      expect(res).toEqual({
        ok: false,
        error: 'Too many requests — please wait a minute and try again.',
      });
    });

    it('returns error when site is missing', async () => {
      mocks.getPublicSiteBySubdomain.mockResolvedValueOnce(null);
      const fd = new FormData();
      fd.append('subdomain', 'missing');
      const res = await submitQuickStopRequestAction(fd);
      expect(res).toEqual({
        ok: false,
        error: 'This booking link is unavailable.',
      });
    });

    it('returns error when Quick Stop is not available or connect not onboarded', async () => {
      mocks.quickStopSettingsFromAccount.mockReturnValueOnce({ available: false });
      const fd = new FormData();
      fd.append('subdomain', TEST_SUBDOMAIN);

      const res = await submitQuickStopRequestAction(fd);
      expect(res).toEqual({
        ok: false,
        error: 'Quick Stop isn’t available right now.',
      });
    });

    it('returns error when required fields are missing', async () => {
      mocks.quickStopSettingsFromAccount.mockReturnValueOnce({ available: true });
      const fd = new FormData();
      fd.append('subdomain', TEST_SUBDOMAIN);
      fd.append('name', 'Alex');
      // missing phone

      const res = await submitQuickStopRequestAction(fd);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error).toContain('Add your name and mobile phone number');
      }
    });

    it('returns error when requested day is not allowed', async () => {
      mocks.quickStopSettingsFromAccount.mockReturnValueOnce({ available: true });
      mocks.isAllowedQuickStopDay.mockReturnValueOnce(false);

      const fd = new FormData();
      fd.append('subdomain', TEST_SUBDOMAIN);
      fd.append('name', 'Alex');
      fd.append('phone', '(555) 111-2222');
      fd.append('address', '101 Main St');
      fd.append('issue', 'Clogged sink');
      fd.append('requestedDate', '2026-09-30');

      const res = await submitQuickStopRequestAction(fd);
      expect(res).toEqual({
        ok: false,
        error: 'That day isn’t available any more. Reload the page and pick another.',
      });
    });

    it('returns error when customer has an active duplicate request', async () => {
      mocks.quickStopSettingsFromAccount.mockReturnValueOnce({ available: true });
      mocks.hasActiveQuickStopRequest.mockResolvedValueOnce(true);

      const fd = new FormData();
      fd.append('subdomain', TEST_SUBDOMAIN);
      fd.append('name', 'Alex');
      fd.append('phone', '(555) 111-2222');
      fd.append('address', '101 Main St');
      fd.append('issue', 'Clogged sink');

      const res = await submitQuickStopRequestAction(fd);
      expect(res).toEqual({
        ok: false,
        error: 'You already have a Quick Stop request in progress with this contractor.',
      });
    });

    it('handles unsafe qualification with safety guidance', async () => {
      mocks.quickStopSettingsFromAccount.mockReturnValueOnce({ available: true, requiredPhotos: 0 });
      mocks.hasActiveQuickStopRequest.mockResolvedValueOnce(false);
      mocks.readQuickStopVerdictToken.mockReturnValueOnce(null);
      mocks.qualifyQuickStop.mockResolvedValueOnce({
        unsafe: true,
        safety: 'Call the fire department immediately.',
        exclusions: ['gas_leak'],
        reason: 'Gas leak detected',
        visitMinutes: null,
      });

      const fd = new FormData();
      fd.append('subdomain', TEST_SUBDOMAIN);
      fd.append('name', 'Alex');
      fd.append('phone', '(555) 111-2222');
      fd.append('address', '101 Main St');
      fd.append('issue', 'Smell gas near water heater');

      const res = await submitQuickStopRequestAction(fd);
      expect(res).toEqual({
        ok: false,
        unsafe: true,
        safety: 'Call the fire department immediately.',
        error: 'This needs urgent attention, not an online booking.',
      });
      expect(mocks.recordQuickStopScreening).toHaveBeenCalledWith(
        expect.anything(),
        TEST_ACCOUNT_ID,
        expect.objectContaining({ outcome: 'unsafe' })
      );
    });

    it('handles notAFit qualification when job requires major project', async () => {
      mocks.quickStopSettingsFromAccount.mockReturnValueOnce({ available: true, requiredPhotos: 0 });
      mocks.hasActiveQuickStopRequest.mockResolvedValueOnce(false);
      mocks.readQuickStopVerdictToken.mockReturnValueOnce(null);
      mocks.qualifyQuickStop.mockResolvedValueOnce({
        unsafe: false,
        eligible: false,
        reason: 'Full sewer replacement required',
        exclusions: ['major_excavation'],
        visitMinutes: null,
      });

      const fd = new FormData();
      fd.append('subdomain', TEST_SUBDOMAIN);
      fd.append('name', 'Alex');
      fd.append('phone', '(555) 111-2222');
      fd.append('address', '101 Main St');
      fd.append('issue', 'Replace entire underground main pipe');

      const res = await submitQuickStopRequestAction(fd);
      expect(res).toEqual({
        ok: false,
        notAFit: true,
        error: 'Full sewer replacement required',
      });
    });

    it('successfully creates Quick Stop request with photos, geocoding and screening', async () => {
      mocks.quickStopSettingsFromAccount.mockReturnValueOnce({
        available: true,
        requiredPhotos: 1,
        responseDeadlineMins: 30,
      });
      mocks.hasActiveQuickStopRequest.mockResolvedValueOnce(false);
      mocks.readQuickStopVerdictToken.mockReturnValueOnce(null);
      const qual = {
        unsafe: false,
        eligible: true,
        exclusions: [],
        reason: 'Quick faucet swap',
        visitMinutes: 30,
      };
      mocks.qualifyQuickStop.mockResolvedValueOnce(qual);
      mocks.geocodeAddress.mockResolvedValueOnce({ lat: 37.77, lng: -122.41, precise: true });
      mocks.uploadLeadPhoto.mockResolvedValueOnce('photos/lead-photo-1.jpg');

      const fd = new FormData();
      fd.append('subdomain', TEST_SUBDOMAIN);
      fd.append('name', 'Alex Smith');
      fd.append('phone', '(555) 222-3333');
      fd.append('email', 'alex@example.com');
      fd.append('address', '789 Pine St');
      fd.append('issue', 'Dripping kitchen faucet');
      fd.append('requestedDate', '2026-09-21');

      const mockFile = new File(['photo content'], 'faucet.jpg', { type: 'image/jpeg' });
      fd.append('photos', mockFile);

      const res = await submitQuickStopRequestAction(fd);
      expect(res).toEqual({ ok: true });
      expect(mocks.uploadLeadPhoto).toHaveBeenCalled();
      expect(mocks.createQuickStopRequest).toHaveBeenCalledWith(
        expect.anything(),
        TEST_ACCOUNT_ID,
        expect.objectContaining({
          name: 'Alex Smith',
          phone: '+15552223333',
          address: '789 Pine St',
          photoPaths: ['photos/lead-photo-1.jpg'],
        }),
        qual,
        expect.objectContaining({
          responseDeadlineMins: 30,
          lat: 37.77,
          lng: -122.41,
        })
      );
    });
  });

  describe('submitCallbackAction', () => {
    it('redirects with error=busy when rate limited', async () => {
      mocks.checkRateLimit.mockResolvedValueOnce(false);
      const fd = new FormData();
      await expect(submitCallbackAction(TEST_SUBDOMAIN, fd)).rejects.toThrow('NEXT_REDIRECT:/book/apex-plumbing?error=busy');
    });

    it('redirects with error=unavailable when site not found', async () => {
      mocks.getPublicSiteBySubdomain.mockResolvedValueOnce(null);
      const fd = new FormData();
      await expect(submitCallbackAction('unknown-sub', fd)).rejects.toThrow('NEXT_REDIRECT:/book/unknown-sub?error=unavailable');
    });

    it('redirects with error=incomplete when contact details missing', async () => {
      const fd = new FormData();
      fd.append('name', 'Tom');
      // missing phone/email, address
      await expect(submitCallbackAction(TEST_SUBDOMAIN, fd)).rejects.toThrow('NEXT_REDIRECT:/book/apex-plumbing?error=incomplete');
    });

    it('creates lead and redirects to requested confirmation', async () => {
      const fd = new FormData();
      fd.append('name', 'Tom Brown');
      fd.append('phone', '(555) 444-5555');
      fd.append('address', '321 Elm Street');
      fd.append('description', 'Water pressure is low');
      fd.append('note', 'Call after 2pm');
      fd.append('ref', 'REF-AFFILIATE');

      mocks.referrerFromCode.mockReturnValueOnce('affiliate-partner');

      await expect(submitCallbackAction(TEST_SUBDOMAIN, fd)).rejects.toThrow('NEXT_REDIRECT:/book/apex-plumbing?requested=1');

      expect(mocks.createBookingRequestLead).toHaveBeenCalledWith(
        expect.anything(),
        TEST_ACCOUNT_ID,
        expect.objectContaining({
          name: 'Tom Brown',
          phone: '+15554445555',
          address: '321 Elm Street',
          description: 'Water pressure is low',
          note: 'Call after 2pm',
          referredBy: 'affiliate-partner',
        })
      );
    });
  });
});
