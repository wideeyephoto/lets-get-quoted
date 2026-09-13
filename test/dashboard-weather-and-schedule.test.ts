import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  redirect: vi.fn((url: string) => {
    const err = new Error(`NEXT_REDIRECT:${url}`);
    (err as unknown as { digest: string }).digest = `NEXT_REDIRECT;replace;${url};307;;`;
    throw err;
  }),
  requireOfficeContext: vi.fn(),
  createAdminClient: vi.fn(),
  // Weather
  weatherSettings: vi.fn(),
  jobsAtRisk: vi.fn(),
  draftCustomerMessage: vi.fn(() => 'Draft weather reschedule message'),
  sendWeatherRescheduleSms: vi.fn(),
  // SMS & phone
  isPhoneOptedOut: vi.fn(),
  recordSmsConsent: vi.fn(),
  sendQuickStopStatusSms: vi.fn(),
  sendEstimateOfferSms: vi.fn(),
  // Job feed & events
  createJobFeedEvent: vi.fn(),
  recordAccountEvent: vi.fn(),
  recordTenantAuditEvent: vi.fn(),
  // Timezone & TCPA
  resolveRecipientTimeZone: vi.fn(() => 'America/New_York'),
  getJurisdictionTcpaRules: vi.fn(() => ({ quietStartHour: 20, quietEndHour: 8 })),
  getTcpaCompliantSendTime: vi.fn(() => ({ isDelayed: false, sendAt: new Date(), reason: undefined })),
  // Quick Stops
  createJob: vi.fn(),
  resolveQuickStopCancellation: vi.fn(),
  getQuickStopRequest: vi.fn(),
  logQuickStopEvent: vi.fn(),
  geocodeArea: vi.fn(),
  computeQuickStopRoute: vi.fn(),
  sendQuickStopOffer: vi.fn(),
  // Reschedule offers
  createRescheduleOffer: vi.fn(),
  deleteRescheduleOffer: vi.fn(),
  cancelRescheduleOffer: vi.fn(),
  findBetterDays: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}));

vi.mock('next/navigation', () => ({
  redirect: mocks.redirect,
}));

vi.mock('@/lib/auth', () => ({
  requireOfficeContext: mocks.requireOfficeContext,
  createAdminClient: mocks.createAdminClient,
}));

vi.mock('@/lib/weather', () => ({
  RISK_LABEL: {
    rain: 'Rain Alert',
    freeze: 'Freeze Alert',
    wind: 'High Winds',
    severe: 'Severe Storm',
    clear: 'Clear',
  },
  draftCustomerMessage: mocks.draftCustomerMessage,
}));

vi.mock('@/lib/weather-data', () => ({
  weatherSettings: mocks.weatherSettings,
  jobsAtRisk: mocks.jobsAtRisk,
}));

vi.mock('@/lib/sms', () => ({
  isPhoneOptedOut: mocks.isPhoneOptedOut,
  recordSmsConsent: mocks.recordSmsConsent,
  sendWeatherRescheduleSms: mocks.sendWeatherRescheduleSms,
  sendQuickStopStatusSms: mocks.sendQuickStopStatusSms,
  sendEstimateOfferSms: mocks.sendEstimateOfferSms,
}));

vi.mock('@/lib/job-feed', () => ({
  createJobFeedEvent: mocks.createJobFeedEvent,
}));

vi.mock('@/lib/account-events', () => ({
  recordAccountEvent: mocks.recordAccountEvent,
}));

vi.mock('@/lib/tenant-audit', () => ({
  recordTenantAuditEvent: mocks.recordTenantAuditEvent,
}));

vi.mock('@/lib/phone-timezone', () => ({
  resolveRecipientTimeZone: mocks.resolveRecipientTimeZone,
  getTcpaCompliantSendTime: mocks.getTcpaCompliantSendTime,
}));

vi.mock('@/lib/ad-speed-to-lead', () => ({
  getJurisdictionTcpaRules: mocks.getJurisdictionTcpaRules,
}));

vi.mock('@/lib/jobs', () => ({
  createJob: mocks.createJob,
}));

vi.mock('@/lib/quick-stop-refunds', () => ({
  resolveQuickStopCancellation: mocks.resolveQuickStopCancellation,
}));

vi.mock('@/lib/quick-stop-requests', () => ({
  getQuickStopRequest: mocks.getQuickStopRequest,
  logQuickStopEvent: mocks.logQuickStopEvent,
}));

vi.mock('@/lib/geocode', () => ({
  geocodeArea: mocks.geocodeArea,
}));

vi.mock('@/lib/quick-stop-route', () => ({
  computeQuickStopRoute: mocks.computeQuickStopRoute,
}));

vi.mock('@/lib/quick-stop-payments', () => ({
  sendQuickStopOffer: mocks.sendQuickStopOffer,
}));

vi.mock('@/lib/reschedule-offers-data', () => ({
  createRescheduleOffer: mocks.createRescheduleOffer,
  deleteRescheduleOffer: mocks.deleteRescheduleOffer,
  cancelRescheduleOffer: mocks.cancelRescheduleOffer,
  findBetterDays: mocks.findBetterDays,
}));

import {
  weatherRisksAction,
  sendWeatherRescheduleSmsAction,
  moveJobToWeatherDateAction,
  logWeatherRiskToTimelineAction,
  batchSendWeatherRescheduleSmsAction,
  updateWeatherSettingsAction,
} from '@/app/dashboard/schedule/weather-actions';

import {
  declineQuickStopAction,
  requestMoreInfoQuickStopAction,
  createQuickStopOfferAction,
  markEnRouteQuickStopAction,
  markArrivedQuickStopAction,
  sendEtaSmsQuickStopAction,
  completeQuickStopAction,
  cancelQuickStopByContractorAction,
  proposeRevisedWindowQuickStopAction,
  proposeDiagnosticConversionAction,
  addQuickStopAreaAction,
  updateQuickStopAreaDetourAction,
  deleteQuickStopZoneAction,
} from '@/app/dashboard/quick-stops/actions';

import {
  suggestRescheduleDaysAction,
  sendRescheduleOfferAction,
  withdrawRescheduleOfferAction,
} from '@/app/dashboard/schedule/plan/reschedule-actions';

function createMockSupabase(tables: Record<string, { data?: unknown; error?: unknown }> = {}) {
  const mockQuery = (tableName: string) => {
    let result = tables[tableName] ?? { data: [], error: null };
    let selectedSingle = false;

    const builder: Record<string, unknown> = {
      select: vi.fn(() => builder),
      insert: vi.fn((val: unknown) => {
        builder._lastInsert = val;
        return builder;
      }),
      update: vi.fn((val: unknown) => {
        builder._lastUpdate = val;
        return builder;
      }),
      delete: vi.fn(() => builder),
      eq: vi.fn((field: string, val: unknown) => {
        if (field === 'id' && Array.isArray(result.data)) {
          const matched = result.data.filter((item: unknown) =>
            item && typeof item === 'object' && 'id' in item
              ? (item as { id: unknown }).id === val
              : true
          );
          result = { ...result, data: matched };
        }
        return builder;
      }),
      neq: vi.fn(() => builder),
      in: vi.fn(() => builder),
      gte: vi.fn(() => builder),
      lte: vi.fn(() => builder),
      gt: vi.fn(() => builder),
      lt: vi.fn(() => builder),
      limit: vi.fn(() => builder),
      order: vi.fn(() => builder),
      single: vi.fn(() => {
        selectedSingle = true;
        const d = Array.isArray(result.data) ? (result.data[0] ?? null) : result.data;
        return Promise.resolve({ data: d, error: result.error ?? null });
      }),
      maybeSingle: vi.fn(() => {
        selectedSingle = true;
        const d = Array.isArray(result.data) ? (result.data[0] ?? null) : result.data;
        return Promise.resolve({ data: d, error: result.error ?? null });
      }),
      then: (resolve: (val: unknown) => unknown) => {
        const d = selectedSingle && Array.isArray(result.data)
          ? (result.data[0] ?? null)
          : result.data;
        return Promise.resolve(resolve({ data: d, error: result.error ?? null }));
      },
    };

    return builder;
  };

  return {
    from: vi.fn((tableName: string) => mockQuery(tableName)),
  };
}

describe('dashboard weather and schedule actions', () => {
  const accountId = 'acc-123';
  const userEmail = 'owner@apex.test';

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isPhoneOptedOut.mockResolvedValue(false);
    mocks.recordSmsConsent.mockResolvedValue(undefined);
    mocks.sendWeatherRescheduleSms.mockResolvedValue('msg-weather-1');
    mocks.sendQuickStopStatusSms.mockResolvedValue('msg-qs-1');
    mocks.sendEstimateOfferSms.mockResolvedValue('msg-est-1');
  });

  describe('weather-actions', () => {
    it('weatherRisksAction returns early when alerts disabled', async () => {
      const mockDb = createMockSupabase();
      mocks.requireOfficeContext.mockResolvedValue({ supabase: mockDb, accountId, userEmail });
      mocks.weatherSettings.mockResolvedValue({
        enabled: false,
        sensitivity: { label: 'Conservative', reasonNote: 'Heavy wind/rain' },
      });

      const res = await weatherRisksAction();
      expect(res.enabled).toBe(false);
      expect(res.profile).toBe('Conservative');
      expect(res.risks).toEqual([]);
    });

    it('weatherRisksAction maps risks with company name, feed status, and phone formatting', async () => {
      const mockDb = createMockSupabase({
        accounts: { data: [{ business_name: 'Apex Heating' }] },
        sites: { data: [{ company_name: 'Apex HVAC Pro' }] },
        job_feed: {
          data: [{ job_id: 'job-1', created_at: '2026-09-12T10:00:00Z' }],
        },
      });
      mocks.requireOfficeContext.mockResolvedValue({ supabase: mockDb, accountId, userEmail });
      mocks.weatherSettings.mockResolvedValue({
        enabled: true,
        sensitivity: { label: 'Moderate', reasonNote: 'Standard weather profile' },
      });
      mocks.jobsAtRisk.mockResolvedValue([
        {
          job: {
            id: 'job-1',
            ref: 'JOB-001',
            clientName: 'Jane Smith',
            clientPhone: '555-123-4567',
            scheduledFor: '2026-09-13',
          },
          assessment: {
            level: 'rain',
            reasons: ['80% chance of heavy precipitation'],
            summary: 'Heavy rain in afternoon',
          },
          alternatives: [{ day: '2026-09-14', summary: 'Sunny and dry' }],
        },
      ]);

      const res = await weatherRisksAction();
      expect(res.enabled).toBe(true);
      expect(res.businessName).toBe('Apex HVAC Pro');
      expect(res.risks.length).toBe(1);
      expect(res.risks[0].jobId).toBe('job-1');
      expect(res.risks[0].alreadySentToday).toBe(true);
      expect(res.risks[0].canSendSms).toBe(true);
      expect(res.risks[0].draftMessage).toBe('Draft weather reschedule message');
    });

    it('sendWeatherRescheduleSmsAction validates job and phone opt-out', async () => {
      const mockDb = createMockSupabase({
        jobs: { data: [] },
      });
      mocks.requireOfficeContext.mockResolvedValue({ supabase: mockDb, accountId, userEmail });

      const notFoundRes = await sendWeatherRescheduleSmsAction({
        jobId: 'missing-job',
        message: 'Can we move our visit?',
      });
      expect(notFoundRes.ok).toBe(false);
      if (!notFoundRes.ok) expect(notFoundRes.error).toBe('Could not find that job.');

      const mockDbNoPhone = createMockSupabase({
        jobs: { data: [{ id: 'job-1', client_phone: null }] },
      });
      mocks.requireOfficeContext.mockResolvedValue({ supabase: mockDbNoPhone, accountId, userEmail });
      const noPhoneRes = await sendWeatherRescheduleSmsAction({
        jobId: 'job-1',
        message: 'Reschedule',
      });
      expect(noPhoneRes.ok).toBe(false);
      if (!noPhoneRes.ok) expect(noPhoneRes.error).toContain('no valid mobile number');

      const mockDbOptedOut = createMockSupabase({
        jobs: { data: [{ id: 'job-1', client_phone: '555-000-1111' }] },
      });
      mocks.requireOfficeContext.mockResolvedValue({ supabase: mockDbOptedOut, accountId, userEmail });
      mocks.isPhoneOptedOut.mockResolvedValue(true);
      const optedOutRes = await sendWeatherRescheduleSmsAction({
        jobId: 'job-1',
        message: 'Reschedule',
      });
      expect(optedOutRes.ok).toBe(false);
      if (!optedOutRes.ok) expect(optedOutRes.error).toContain('opted out');
    });

    it('sendWeatherRescheduleSmsAction sends SMS and logs immutable feed, account, and tenant events', async () => {
      const mockDb = createMockSupabase({
        jobs: {
          data: [{
            id: 'job-1',
            ref: 'JOB-101',
            client_name: 'Alice',
            client_phone: '555-222-3333',
            scheduled_for: '2026-09-15',
            address: '123 Main St, Miami, FL',
          }],
        },
      });
      mocks.requireOfficeContext.mockResolvedValue({ supabase: mockDb, accountId, userEmail });
      mocks.isPhoneOptedOut.mockResolvedValue(false);
      mocks.getTcpaCompliantSendTime.mockReturnValue({
        isDelayed: true,
        sendAt: new Date('2026-09-13T12:00:00Z'),
        reason: 'Quiet hours apply',
      });

      const res = await sendWeatherRescheduleSmsAction({
        jobId: 'job-1',
        message: 'Heavy rain forecasted. Want to move to Wednesday?',
        proposedDate: '2026-09-17',
        reasons: ['Thunderstorms'],
      });

      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.messageId).toBe('msg-weather-1');
        expect(res.isDelayed).toBe(true);
        expect(res.quietHoursReason).toBe('Quiet hours apply');
      }
      expect(mocks.createJobFeedEvent).toHaveBeenCalled();
      expect(mocks.recordAccountEvent).toHaveBeenCalled();
      expect(mocks.recordTenantAuditEvent).toHaveBeenCalled();
      expect(mocks.revalidatePath).toHaveBeenCalledWith('/dashboard/schedule');
    });

    it('moveJobToWeatherDateAction validates destination date and updates job', async () => {
      const mockDb = createMockSupabase({
        jobs: {
          data: [{
            id: 'job-1',
            ref: 'JOB-101',
            client_name: 'Bob',
            scheduled_for: '2026-09-15',
            status: 'scheduled',
          }],
        },
      });
      mocks.requireOfficeContext.mockResolvedValue({ supabase: mockDb, accountId, userEmail });

      const invalidDateRes = await moveJobToWeatherDateAction({
        jobId: 'job-1',
        newDate: 'invalid-date',
      });
      expect(invalidDateRes.ok).toBe(false);

      const sameDateRes = await moveJobToWeatherDateAction({
        jobId: 'job-1',
        newDate: '2026-09-15',
      });
      expect(sameDateRes.ok).toBe(false);

      const successRes = await moveJobToWeatherDateAction({
        jobId: 'job-1',
        newDate: '2026-09-18',
        reason: 'Severe thunderstorm',
      });
      expect(successRes.ok).toBe(true);
      expect(mocks.createJobFeedEvent).toHaveBeenCalled();
      expect(mocks.recordAccountEvent).toHaveBeenCalled();
      expect(mocks.recordTenantAuditEvent).toHaveBeenCalled();
    });

    it('logWeatherRiskToTimelineAction logs note to job timeline', async () => {
      const mockDb = createMockSupabase({
        jobs: {
          data: [{
            id: 'job-1',
            ref: 'JOB-1',
            client_name: 'Charlie',
            scheduled_for: '2026-09-15',
          }],
        },
      });
      mocks.requireOfficeContext.mockResolvedValue({ supabase: mockDb, accountId, userEmail });

      const res = await logWeatherRiskToTimelineAction({
        jobId: 'job-1',
        day: '2026-09-15',
        summary: 'Wind gusts over 45mph',
        reasons: ['High wind warning'],
      });
      expect(res.ok).toBe(true);
      expect(mocks.createJobFeedEvent).toHaveBeenCalled();
    });

    it('batchSendWeatherRescheduleSmsAction aggregates batch counts', async () => {
      const mockDb = createMockSupabase({
        jobs: {
          data: [{
            id: 'job-1',
            client_name: 'Diana',
            client_phone: '555-444-5555',
            scheduled_for: '2026-09-15',
          }],
        },
      });
      mocks.requireOfficeContext.mockResolvedValue({ supabase: mockDb, accountId, userEmail });
      mocks.getTcpaCompliantSendTime.mockReturnValue({
        isDelayed: false,
        sendAt: new Date(),
        reason: undefined,
      });

      const batchRes = await batchSendWeatherRescheduleSmsAction([
        {
          jobId: 'job-1',
          message: 'Weather reschedule',
          proposedDate: '2026-09-16',
        },
        {
          jobId: 'job-missing',
          message: 'Weather reschedule',
        },
      ]);

      expect(batchRes.total).toBe(2);
      expect(batchRes.sentCount).toBe(1);
      expect(batchRes.failedCount).toBe(1);
    });

    it('updateWeatherSettingsAction updates account and redirects', async () => {
      const mockDb = createMockSupabase({
        accounts: { data: [{ id: accountId }] },
      });
      mocks.requireOfficeContext.mockResolvedValue({ supabase: mockDb, accountId, userEmail });

      const formData = new FormData();
      formData.set('weatherProfile', 'exterior_sensitive');

      await expect(updateWeatherSettingsAction(formData)).rejects.toThrow('NEXT_REDIRECT');
      expect(mocks.revalidatePath).toHaveBeenCalledWith('/dashboard/schedule/settings');
      expect(mocks.redirect).toHaveBeenCalledWith('/dashboard/schedule/settings?weather=on#weather-panel');
    });
  });

  describe('quick-stops actions', () => {
    it('declineQuickStopAction declines open request', async () => {
      const mockDb = createMockSupabase({
        extra_stop_requests: { data: [{ id: 'qs-1' }] },
      });
      mocks.requireOfficeContext.mockResolvedValue({ supabase: mockDb, accountId, userEmail });
      mocks.getQuickStopRequest.mockResolvedValue({
        id: 'qs-1',
        status: 'awaiting_contractor',
      });

      const formData = new FormData();
      formData.set('reason', 'Schedule full');

      await declineQuickStopAction('qs-1', formData);
      expect(mocks.logQuickStopEvent).toHaveBeenCalled();
      expect(mocks.revalidatePath).toHaveBeenCalledWith('/dashboard/quick-stops');
    });

    it('requestMoreInfoQuickStopAction transitions request', async () => {
      const mockDb = createMockSupabase({
        extra_stop_requests: { data: [{ id: 'qs-1' }] },
      });
      mocks.requireOfficeContext.mockResolvedValue({ supabase: mockDb, accountId, userEmail });
      mocks.getQuickStopRequest.mockResolvedValue({
        id: 'qs-1',
        status: 'awaiting_contractor',
      });

      const formData = new FormData();
      formData.set('note', 'Can you provide a photo of the panel?');

      await requestMoreInfoQuickStopAction('qs-1', formData);
      expect(mocks.logQuickStopEvent).toHaveBeenCalled();
      expect(mocks.revalidatePath).toHaveBeenCalledWith('/dashboard/quick-stops');
    });

    it('createQuickStopOfferAction validates Stripe connect onboarding', async () => {
      const mockDb = createMockSupabase({
        accounts: {
          data: [{
            connect_onboarded: false,
            stripe_connect_id: null,
          }],
        },
      });
      mocks.requireOfficeContext.mockResolvedValue({ supabase: mockDb, accountId, userEmail });
      mocks.getQuickStopRequest.mockResolvedValue({
        id: 'qs-1',
        status: 'awaiting_contractor',
      });

      const formData = new FormData();
      formData.set('arrivalDate', '2026-09-16');
      formData.set('arrivalStart', '09:00');
      formData.set('arrivalEnd', '12:00');
      formData.set('fee', '75');

      await expect(createQuickStopOfferAction('qs-1', formData)).rejects.toThrow('Finish your Stripe payout setup');
    });

    it('createQuickStopOfferAction creates tentative job and sends offer', async () => {
      const mockDb = createMockSupabase({
        accounts: {
          data: [{
            connect_onboarded: true,
            stripe_connect_id: 'acct_stripe123',
            quick_stop_enabled: true,
            quick_stop_weekdays: [1, 2, 3, 4, 5],
            quick_stop_earliest_start: '08:00',
            quick_stop_latest_end: '18:00',
            quick_stop_default_fee_cents: 7500,
            quick_stop_min_fee_cents: 5000,
            quick_stop_max_fee_cents: 20000,
            quick_stop_max_per_day: 5,
            timezone: 'America/New_York',
          }],
        },
        extra_stop_requests: {
          data: [{ id: 'qs-1' }],
        },
      });
      mocks.requireOfficeContext.mockResolvedValue({ supabase: mockDb, accountId, userEmail });
      mocks.getQuickStopRequest.mockResolvedValue({
        id: 'qs-1',
        status: 'awaiting_contractor',
        client_name: 'George',
        client_phone: '555-888-9999',
        client_email: 'george@example.com',
        address: '456 Elm St',
        ai_summary: 'Water heater check',
        lat: 34.05,
        lng: -118.25,
      });
      mocks.computeQuickStopRoute.mockResolvedValue({
        detourMiles: 2.5,
        detourMinutes: 6,
        routeExtensionMinutes: 10,
      });
      mocks.createJob.mockResolvedValue({ id: 'job-new-qs' });

      // 2026-09-16 is a Wednesday (day 3)
      const formData = new FormData();
      formData.set('arrivalDate', '2026-09-16');
      formData.set('arrivalStart', '09:00');
      formData.set('arrivalEnd', '11:00');
      formData.set('fee', '99');
      formData.set('visitMinutes', '30');

      await createQuickStopOfferAction('qs-1', formData);

      expect(mocks.createJob).toHaveBeenCalled();
      expect(mocks.sendQuickStopOffer).toHaveBeenCalledWith(mockDb, accountId, 'qs-1');
      expect(mocks.revalidatePath).toHaveBeenCalledWith('/dashboard/quick-stops');
    });

    it('markEnRouteQuickStopAction notifies customer via SMS', async () => {
      const mockDb = createMockSupabase({
        extra_stop_requests: { data: [{ id: 'qs-1' }] },
      });
      mocks.requireOfficeContext.mockResolvedValue({ supabase: mockDb, accountId, userEmail });
      mocks.getQuickStopRequest.mockResolvedValue({
        id: 'qs-1',
        status: 'confirmed',
        client_phone: '555-333-2222',
      });

      await markEnRouteQuickStopAction('qs-1');
      expect(mocks.sendQuickStopStatusSms).toHaveBeenCalled();
      expect(mocks.revalidatePath).toHaveBeenCalledWith('/dashboard/quick-stops');
    });

    it('markArrivedQuickStopAction captures geolocation and sends SMS', async () => {
      const mockDb = createMockSupabase({
        extra_stop_requests: { data: [{ id: 'qs-1' }] },
      });
      mocks.requireOfficeContext.mockResolvedValue({ supabase: mockDb, accountId, userEmail });
      mocks.getQuickStopRequest.mockResolvedValue({
        id: 'qs-1',
        status: 'en_route',
        client_phone: '555-333-2222',
      });

      const formData = new FormData();
      formData.set('lat', '33.7490');
      formData.set('lng', '-84.3880');

      await markArrivedQuickStopAction('qs-1', formData);
      expect(mocks.sendQuickStopStatusSms).toHaveBeenCalled();
      expect(mocks.logQuickStopEvent).toHaveBeenCalled();
    });

    it('sendEtaSmsQuickStopAction validates request status and sends SMS', async () => {
      const mockDb = createMockSupabase();
      mocks.requireOfficeContext.mockResolvedValue({ supabase: mockDb, accountId, userEmail });
      mocks.getQuickStopRequest.mockResolvedValue({
        id: 'qs-1',
        status: 'confirmed',
        client_phone: '555-333-2222',
      });

      await sendEtaSmsQuickStopAction('qs-1', 20);
      expect(mocks.sendQuickStopStatusSms).toHaveBeenCalled();
      expect(mocks.revalidatePath).toHaveBeenCalledWith('/dashboard/quick-stops');

      mocks.getQuickStopRequest.mockResolvedValue({
        id: 'qs-1',
        status: 'completed',
        client_phone: '555-333-2222',
      });
      await expect(sendEtaSmsQuickStopAction('qs-1', 15)).rejects.toThrow('Can only send ETA updates');
    });

    it('completeQuickStopAction marks request and job completed', async () => {
      const mockDb = createMockSupabase({
        extra_stop_requests: { data: [{ id: 'qs-1' }] },
        jobs: { data: [{ id: 'job-1' }] },
      });
      mocks.requireOfficeContext.mockResolvedValue({ supabase: mockDb, accountId, userEmail });
      mocks.getQuickStopRequest.mockResolvedValue({
        id: 'qs-1',
        status: 'arrived',
        job_id: 'job-1',
      });

      await completeQuickStopAction('qs-1');
      expect(mockDb.from).toHaveBeenCalledWith('jobs');
      expect(mocks.revalidatePath).toHaveBeenCalledWith('/dashboard/quick-stops');
    });

    it('cancelQuickStopByContractorAction invokes cancellation resolution', async () => {
      const mockDb = createMockSupabase();
      mocks.requireOfficeContext.mockResolvedValue({ supabase: mockDb, accountId, userEmail });
      mocks.createAdminClient.mockReturnValue(mockDb);

      const formData = new FormData();
      formData.set('reason', 'Van broke down');

      await cancelQuickStopByContractorAction('qs-1', formData);
      expect(mocks.resolveQuickStopCancellation).toHaveBeenCalledWith(
        mockDb,
        accountId,
        'qs-1',
        { kind: 'contractor_cancel', reason: 'Van broke down' },
      );
    });

    it('proposeRevisedWindowQuickStopAction validates window and texts customer', async () => {
      const mockDb = createMockSupabase({
        accounts: {
          data: [{
            quick_stop_weekdays: [1, 2, 3, 4, 5],
            quick_stop_earliest_start: '08:00',
            quick_stop_latest_end: '18:00',
          }],
        },
        extra_stop_requests: { data: [{ id: 'qs-1' }] },
      });
      mocks.requireOfficeContext.mockResolvedValue({ supabase: mockDb, accountId, userEmail });
      mocks.getQuickStopRequest.mockResolvedValue({
        id: 'qs-1',
        status: 'confirmed',
        client_phone: '555-777-6666',
      });

      const formData = new FormData();
      formData.set('proposedDate', '2026-09-16');
      formData.set('proposedStart', '13:00');
      formData.set('proposedEnd', '15:00');

      await proposeRevisedWindowQuickStopAction('qs-1', formData);
      expect(mocks.sendQuickStopStatusSms).toHaveBeenCalled();
      expect(mocks.revalidatePath).toHaveBeenCalledWith('/dashboard/quick-stops');
    });

    it('proposeDiagnosticConversionAction validates total and texts customer', async () => {
      const mockDb = createMockSupabase({
        extra_stop_requests: { data: [{ id: 'qs-1' }] },
      });
      mocks.requireOfficeContext.mockResolvedValue({ supabase: mockDb, accountId, userEmail });
      mocks.getQuickStopRequest.mockResolvedValue({
        id: 'qs-1',
        status: 'arrived',
        client_phone: '555-777-6666',
      });

      const formData = new FormData();
      formData.set('diagnosticTotal', '150');
      formData.set('note', 'Needs full circuit diagnosis');

      await proposeDiagnosticConversionAction('qs-1', formData);
      expect(mocks.sendQuickStopStatusSms).toHaveBeenCalled();
      expect(mocks.revalidatePath).toHaveBeenCalledWith('/dashboard/quick-stops');
    });

    it('addQuickStopAreaAction handles geocode errors and inserts valid area', async () => {
      const mockDb = createMockSupabase({
        quick_stop_priority_zones: { data: [{ id: 'zone-1' }] },
      });
      mocks.requireOfficeContext.mockResolvedValue({ supabase: mockDb, accountId, userEmail });

      const badForm = new FormData();
      badForm.set('place', 'Atlanta');
      badForm.set('maxDetourMiles', '10');

      mocks.geocodeArea.mockResolvedValueOnce({ ok: false, reason: 'unconfigured' });
      await expect(addQuickStopAreaAction(badForm)).rejects.toThrow('Place lookup is not configured');

      mocks.geocodeArea.mockResolvedValueOnce({ ok: false, reason: 'too-large' });
      await expect(addQuickStopAreaAction(badForm)).rejects.toThrow('covers too much ground');

      mocks.geocodeArea.mockResolvedValueOnce({
        ok: true,
        label: 'Atlanta, GA',
        lat: 33.7490,
        lng: -84.3880,
        radiusMiles: 15,
      });

      const validForm = new FormData();
      validForm.set('place', 'Atlanta');
      validForm.set('label', 'Metro Atlanta');
      validForm.set('maxDetourMiles', '12');

      await addQuickStopAreaAction(validForm);
      expect(mockDb.from).toHaveBeenCalledWith('quick_stop_priority_zones');
      expect(mocks.revalidatePath).toHaveBeenCalledWith('/dashboard/quick-stops');
    });

    it('updateQuickStopAreaDetourAction and deleteQuickStopZoneAction modify zones', async () => {
      const mockDb = createMockSupabase({
        quick_stop_priority_zones: { data: [{ id: 'zone-1' }] },
      });
      mocks.requireOfficeContext.mockResolvedValue({ supabase: mockDb, accountId, userEmail });

      const form = new FormData();
      form.set('maxDetourMiles', '25');

      await updateQuickStopAreaDetourAction('zone-1', form);
      expect(mockDb.from).toHaveBeenCalledWith('quick_stop_priority_zones');

      await deleteQuickStopZoneAction('zone-1');
      expect(mockDb.from).toHaveBeenCalledWith('quick_stop_priority_zones');
      expect(mocks.revalidatePath).toHaveBeenCalledWith('/dashboard/quick-stops');
    });
  });

  describe('reschedule-actions', () => {
    it('suggestRescheduleDaysAction returns suggestions for valid job with phone and coordinates', async () => {
      const mockDb = createMockSupabase({
        jobs: {
          data: [{
            id: 'job-1',
            client_name: 'Helen',
            client_phone: '555-333-1111',
            quoted_amount: 350,
            lat: 34.0,
            lng: -84.0,
            scheduled_for: '2026-09-15',
          }],
        },
        accounts: {
          data: [{
            schedule_day_hours: 8,
            booking_windows: ['09:00', '13:00'],
            workday_start: '08:00',
            workday_end: '17:00',
          }],
        },
      });
      mocks.requireOfficeContext.mockResolvedValue({ supabase: mockDb, accountId, userEmail });
      mocks.findBetterDays.mockResolvedValue([
        {
          dateKey: '2026-09-17',
          nearMiles: 0.5,
          window: {
            startMinutes: 9 * 60,
            endMinutes: 13 * 60,
            arrivalMinutes: 9 * 60 + 30,
            label: 'Morning (9 AM – 1 PM)',
          },
        },
      ]);

      const res = await suggestRescheduleDaysAction({
        jobId: 'job-1',
        fromDate: '2026-09-15',
      });

      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.clientName).toBe('Helen');
        expect(res.quotedAmount).toBe(350);
        expect(res.suggestions.length).toBe(1);
        expect(res.suggestions[0].nearLabel).toBe("you're on that street already");
      }
    });

    it('suggestRescheduleDaysAction fails cleanly when job has no coordinates', async () => {
      const mockDb = createMockSupabase({
        jobs: {
          data: [{
            id: 'job-1',
            client_phone: '555-333-1111',
            lat: null,
            lng: null,
          }],
        },
      });
      mocks.requireOfficeContext.mockResolvedValue({ supabase: mockDb, accountId, userEmail });

      const res = await suggestRescheduleDaysAction({
        jobId: 'job-1',
        fromDate: '2026-09-15',
      });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.message).toContain('no map location');
    });

    it('sendRescheduleOfferAction validates inputs and checks moved jobs', async () => {
      const mockDb = createMockSupabase({
        jobs: {
          data: [{
            id: 'job-1',
            client_name: 'Ian',
            client_phone: '555-999-0000',
            quoted_amount: 500,
            scheduled_for: '2026-09-15',
            status: 'scheduled',
          }],
        },
      });
      mocks.requireOfficeContext.mockResolvedValue({ supabase: mockDb, accountId, userEmail });

      // Invalid date comparison (moving into past)
      const pastForm = new FormData();
      pastForm.set('jobId', 'job-1');
      pastForm.set('fromDate', '2026-09-15');
      pastForm.set('toDate', '2026-09-14');
      const pastRes = await sendRescheduleOfferAction({ ok: false }, pastForm);
      expect(pastRes.ok).toBe(false);
      expect(pastRes.message).toContain('not into the past');

      // Invalid arrival window
      const badWindowForm = new FormData();
      badWindowForm.set('jobId', 'job-1');
      badWindowForm.set('fromDate', '2026-09-15');
      badWindowForm.set('toDate', '2026-09-18');
      badWindowForm.set('body', 'Can we come Friday instead?');
      badWindowForm.set('discountPercent', '10');
      badWindowForm.set('windowStart', '12:00');
      badWindowForm.set('windowEnd', '10:00');
      badWindowForm.set('arrivalTime', '11:00');
      const badWindowRes = await sendRescheduleOfferAction({ ok: false }, badWindowForm);
      expect(badWindowRes.ok).toBe(false);
      expect(badWindowRes.message).toContain('ends before it starts');
    });

    it('sendRescheduleOfferAction sends SMS, records offer and account event', async () => {
      const mockDb = createMockSupabase({
        jobs: {
          data: [{
            id: 'job-1',
            ref: 'JOB-10',
            client_name: 'Ian',
            client_phone: '555-999-0000',
            quoted_amount: 500,
            scheduled_for: '2026-09-15',
            status: 'scheduled',
          }],
        },
        accounts: {
          data: [{ business_name: 'Apex Heating' }],
        },
      });
      mocks.requireOfficeContext.mockResolvedValue({ supabase: mockDb, accountId, userEmail });
      mocks.createRescheduleOffer.mockResolvedValue({ id: 'offer-1' });

      const form = new FormData();
      form.set('jobId', 'job-1');
      form.set('fromDate', '2026-09-15');
      form.set('toDate', '2026-09-18');
      form.set('body', 'We will be on your street Friday. Would Friday 9-11 work?');
      form.set('discountPercent', '10');
      form.set('windowStart', '09:00');
      form.set('windowEnd', '11:00');
      form.set('arrivalTime', '09:30');
      form.set('nearMiles', '0.2');
      form.set('savedMiles', '4.5');
      form.set('savedMinutes', '15');

      const res = await sendRescheduleOfferAction({ ok: false }, form);
      expect(res.ok).toBe(true);
      expect(mocks.createRescheduleOffer).toHaveBeenCalled();
      expect(mocks.sendEstimateOfferSms).toHaveBeenCalled();
      expect(mocks.recordAccountEvent).toHaveBeenCalled();
      expect(mocks.revalidatePath).toHaveBeenCalledWith('/dashboard/schedule/plan');
    });

    it('sendRescheduleOfferAction rolls back offer when SMS delivery fails', async () => {
      const mockDb = createMockSupabase({
        jobs: {
          data: [{
            id: 'job-1',
            ref: 'JOB-10',
            client_name: 'Ian',
            client_phone: '555-999-0000',
            scheduled_for: '2026-09-15',
            status: 'scheduled',
          }],
        },
        accounts: {
          data: [{ business_name: 'Apex Heating' }],
        },
      });
      mocks.requireOfficeContext.mockResolvedValue({ supabase: mockDb, accountId, userEmail });
      mocks.createRescheduleOffer.mockResolvedValue({ id: 'offer-err-1' });
      mocks.sendEstimateOfferSms.mockRejectedValueOnce(new Error('SMS network timeout'));

      const form = new FormData();
      form.set('jobId', 'job-1');
      form.set('fromDate', '2026-09-15');
      form.set('toDate', '2026-09-18');
      form.set('body', 'We will be on your street Friday.');
      form.set('discountPercent', '5');
      form.set('windowStart', '09:00');
      form.set('windowEnd', '11:00');
      form.set('arrivalTime', '09:30');

      const res = await sendRescheduleOfferAction({ ok: false }, form);
      expect(res.ok).toBe(false);
      expect(res.message).toContain("The text didn't send");
      expect(mocks.deleteRescheduleOffer).toHaveBeenCalledWith(mockDb, accountId, 'offer-err-1');
    });

    it('withdrawRescheduleOfferAction cancels offer and revalidates', async () => {
      const mockDb = createMockSupabase();
      mocks.requireOfficeContext.mockResolvedValue({ supabase: mockDb, accountId, userEmail });

      const form = new FormData();
      form.set('offerId', 'offer-123');

      const res = await withdrawRescheduleOfferAction({ ok: false }, form);
      expect(res.ok).toBe(true);
      expect(mocks.cancelRescheduleOffer).toHaveBeenCalledWith(mockDb, accountId, 'offer-123');
      expect(mocks.revalidatePath).toHaveBeenCalledWith('/dashboard/schedule/plan');
    });
  });
});
