import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  createSupabaseServerClient: vi.fn(),
  requireOfficeContext: vi.fn(),
  loadCrewContext: vi.fn(),
  getOpenShift: vi.fn(),
  updateTechPosition: vi.fn(),
  getCurrentMembership: vi.fn(),
  listCrewWorkHistory: vi.fn(),
  loadBusinessName: vi.fn(),
  getSharedFieldPhoneNumber: vi.fn(),
  formatFieldVcard: vi.fn(),
  submitPayrollToProvider: vi.fn(),
  validatePayrollSubmission: vi.fn(),
  buildProviderPayload: vi.fn(),
  resolvePayPeriod: vi.fn(),
  loadCrewPayContext: vi.fn(),
  ensurePayPeriodRow: vi.fn(),
  logPayEvent: vi.fn(),
  markSentToPayroll: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  createAdminClient: mocks.createAdminClient,
  requireOfficeContext: mocks.requireOfficeContext,
  getCurrentMembership: mocks.getCurrentMembership,
}));

vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServerClient: mocks.createSupabaseServerClient,
}));

vi.mock('@/lib/crew-auth', () => ({
  loadCrewContext: mocks.loadCrewContext,
}));

vi.mock('@/lib/time-clock-data', () => ({
  getOpenShift: mocks.getOpenShift,
}));

vi.mock('@/lib/job-tracking', () => ({
  updateTechPosition: mocks.updateTechPosition,
}));

vi.mock('@/lib/crew', () => ({
  listCrewWorkHistory: mocks.listCrewWorkHistory,
}));

vi.mock('@/lib/business-name', () => ({
  loadBusinessName: mocks.loadBusinessName,
}));

vi.mock('@/lib/sms', () => ({
  getSharedFieldPhoneNumber: mocks.getSharedFieldPhoneNumber,
}));

vi.mock('@/lib/sms-field-templates', () => ({
  formatFieldVcard: mocks.formatFieldVcard,
}));

vi.mock('@/lib/labor', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/labor')>();
  return {
    ...actual,
    resolvePayPeriod: mocks.resolvePayPeriod,
    normalizePeriodMode: vi.fn().mockReturnValue('biweekly'),
    normalizeOffset: vi.fn().mockReturnValue(0),
  };
});

vi.mock('@/lib/crew-pay-data', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/crew-pay-data')>();
  return {
    ...actual,
    loadCrewPayContext: mocks.loadCrewPayContext,
    ensurePayPeriodRow: mocks.ensurePayPeriodRow,
    logPayEvent: mocks.logPayEvent,
    markSentToPayroll: mocks.markSentToPayroll,
    snapshotOf: vi.fn().mockReturnValue({}),
  };
});

vi.mock('@/lib/payroll-api-integration', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/payroll-api-integration')>();
  return {
    ...actual,
    validatePayrollSubmission: mocks.validatePayrollSubmission,
    buildProviderPayload: mocks.buildProviderPayload,
    submitPayrollToProvider: mocks.submitPayrollToProvider,
  };
});

import { POST as fieldLocationRoute } from '@/app/api/field/location/route';
import { POST as payrollSubmitRoute } from '@/app/api/payroll/submit/route';
import { GET as payrollStatusRoute } from '@/app/api/payroll/status/route';
import { GET as crewWorkHistoryRoute } from '@/app/api/crew/work-history/route';
import { GET as fieldVcardRoute } from '@/app/api/contacts/field-vcard/route';

describe('API Routes: Field Operations, Crew, and Payroll', () => {
  let fakeAdmin: any;
  let fakeSupabase: any;

  beforeEach(() => {
    vi.clearAllMocks();

    fakeAdmin = {
      channel: vi.fn().mockReturnValue({ send: vi.fn() }),
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        insert: vi.fn().mockResolvedValue({ data: null, error: null }),
        update: vi.fn().mockReturnThis(),
        upsert: vi.fn().mockResolvedValue({ error: null }),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
    };
    fakeSupabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null }),
      },
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: [], error: null }),
        maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'acc-1', name: 'Apex Roofing' }, error: null }),
      }),
    };

    mocks.createAdminClient.mockReturnValue(fakeAdmin);
    mocks.createSupabaseServerClient.mockResolvedValue(fakeSupabase);
    mocks.requireOfficeContext.mockResolvedValue({
      supabase: fakeSupabase,
      accountId: 'acc-1',
      userEmail: 'office@example.com',
      membershipRole: 'owner',
    });
  });

  describe('POST /api/field/location', () => {
    it('returns 401 when crew context is not authenticated', async () => {
      mocks.loadCrewContext.mockResolvedValue({ ok: false, error: 'invalid_cookie' });

      const req = new Request('http://localhost:3010/api/field/location', {
        method: 'POST',
        body: JSON.stringify({ lat: 30.2672, lng: -97.7431 }),
      });

      const res = await fieldLocationRoute(req);
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toBe('Authentication required');
    });

    it('returns 400 on invalid JSON or out-of-range coordinates', async () => {
      mocks.loadCrewContext.mockResolvedValue({
        ok: true,
        context: {
          accountId: 'acc-1',
          crew: { id: 'crew-1', can_share_work_location: true },
        },
      });

      const req1 = new Request('http://localhost:3010/api/field/location', {
        method: 'POST',
        body: 'invalid-json',
      });
      const res1 = await fieldLocationRoute(req1);
      expect(res1.status).toBe(400);

      const req2 = new Request('http://localhost:3010/api/field/location', {
        method: 'POST',
        body: JSON.stringify({ lat: 105, lng: -97.7431 }),
      });
      const res2 = await fieldLocationRoute(req2);
      expect(res2.status).toBe(400);
      const data2 = await res2.json();
      expect(data2.error).toBe('Coordinates out of range');
    });

    it('returns ok:false if crew location sharing is disabled', async () => {
      mocks.loadCrewContext.mockResolvedValue({
        ok: true,
        context: {
          accountId: 'acc-1',
          crew: { id: 'crew-1', can_share_work_location: false },
        },
      });

      const req = new Request('http://localhost:3010/api/field/location', {
        method: 'POST',
        body: JSON.stringify({ lat: 30.2672, lng: -97.7431 }),
      });

      const res = await fieldLocationRoute(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ok).toBe(false);
      expect(data.reason).toBe('location_sharing_disabled_for_crew');
    });

    it('records location and updates tech position when active shift exists', async () => {
      mocks.loadCrewContext.mockResolvedValue({
        ok: true,
        context: {
          accountId: 'acc-1',
          crew: { id: 'crew-1', can_share_work_location: true },
        },
      });
      mocks.getOpenShift.mockResolvedValue({
        id: 'shift-1',
        crew_id: 'crew-1',
        account_id: 'acc-1',
      });
      fakeAdmin.from.mockImplementation((table: string) => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        upsert: vi.fn().mockResolvedValue({ error: null }),
        maybeSingle: vi.fn().mockResolvedValue({
          data: table === 'job_tracking'
            ? { id: 'track-1', job_id: 'job-1', status: 'en_route', share_location: true }
            : null,
          error: null,
        }),
      }));
      mocks.updateTechPosition.mockResolvedValue({ success: true });

      const req = new Request('http://localhost:3010/api/field/location', {
        method: 'POST',
        body: JSON.stringify({
          lat: 30.2672,
          lng: -97.7431,
          accuracyMeters: 10,
          headingDeg: 180,
          speedMps: 15,
        }),
      });

      const res = await fieldLocationRoute(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(mocks.updateTechPosition).toHaveBeenCalled();
    });
  });

  describe('Payroll Routes: POST /api/payroll/submit & GET /api/payroll/status', () => {
    it('returns available providers and status on GET /api/payroll/status', async () => {
      const res = await payrollStatusRoute();
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.account.name).toBe('Apex Roofing');
      expect(Array.isArray(data.providers)).toBe(true);
      expect(data.providers.length).toBeGreaterThan(0);
    });

    it('validates and submits payroll to provider on POST /api/payroll/submit', async () => {
      mocks.resolvePayPeriod.mockReturnValue({
        startDate: new Date('2026-01-01T00:00:00Z'),
        endDate: new Date('2026-01-14T23:59:59Z'),
      });
      mocks.loadCrewPayContext.mockResolvedValue({
        available: true,
        rows: [
          {
            crewId: 'crew-1',
            crew_name: 'Bob Builder',
            gross_pay_cents: 150000,
            regular_hours: 80,
            overtime_hours: 5,
          },
        ],
      });
      mocks.ensurePayPeriodRow.mockResolvedValue({ id: 'pp-1' });
      mocks.validatePayrollSubmission.mockReturnValue({
        valid: true,
        errors: [],
        problems: [],
        excluded: [],
        payable: [],
        totalGross: 0,
        totalHours: 0,
      });
      mocks.buildProviderPayload.mockReturnValue({ company_id: 'gusto-1', pay_period: {} });
      mocks.submitPayrollToProvider.mockResolvedValue({
        success: true,
        batchId: 'batch-123',
        providerSyncId: 'sync-gusto-999',
      });

      const req = new Request('http://localhost:3010/api/payroll/submit', {
        method: 'POST',
        body: JSON.stringify({
          provider: 'gusto',
          companyId: 'gusto-1',
          accessToken: 'tok_abc',
        }),
      });

      const res = await payrollSubmitRoute(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(mocks.markSentToPayroll).not.toHaveBeenCalled(); // No approved rows
    });

    it('returns 422 when validation fails on POST /api/payroll/submit', async () => {
      mocks.resolvePayPeriod.mockReturnValue({
        startDate: new Date('2026-01-01T00:00:00Z'),
        endDate: new Date('2026-01-14T23:59:59Z'),
      });
      mocks.loadCrewPayContext.mockResolvedValue({ available: true, rows: [] });
      mocks.ensurePayPeriodRow.mockResolvedValue({ id: 'pp-1' });
      mocks.validatePayrollSubmission.mockReturnValue({
        valid: false,
        errors: ['Missing company ID for Gusto integration.'],
        problems: ['Missing company ID for Gusto integration.'],
        excluded: [],
        payable: [],
      });

      const req = new Request('http://localhost:3010/api/payroll/submit', {
        method: 'POST',
        body: JSON.stringify({ provider: 'gusto' }),
      });

      const res = await payrollSubmitRoute(req);
      expect(res.status).toBe(422);
      const data = await res.json();
      expect(data.problems).toContain('Missing company ID for Gusto integration.');
    });
  });

  describe('GET /api/crew/work-history', () => {
    it('returns 401 when not signed in', async () => {
      fakeSupabase.auth.getUser.mockResolvedValue({ data: { user: null }, error: null });

      const req = new Request('http://localhost:3010/api/crew/work-history?crewId=crew-1');
      const res = await crewWorkHistoryRoute(req);
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toBe('Sign in to view crew history.');
    });

    it('returns 403 when user is not owner', async () => {
      mocks.getCurrentMembership.mockResolvedValue({ accountId: 'acc-1', role: 'tech' });

      const req = new Request('http://localhost:3010/api/crew/work-history?crewId=crew-1');
      const res = await crewWorkHistoryRoute(req);
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toBe('Owner access required.');
    });

    it('returns 400 when crewId is missing', async () => {
      mocks.getCurrentMembership.mockResolvedValue({ accountId: 'acc-1', role: 'owner' });

      const req = new Request('http://localhost:3010/api/crew/work-history');
      const res = await crewWorkHistoryRoute(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe('Missing crew member.');
    });

    it('returns work history and totalPaid for owner', async () => {
      mocks.getCurrentMembership.mockResolvedValue({ accountId: 'acc-1', role: 'owner' });
      mocks.listCrewWorkHistory.mockResolvedValue([
        { id: 'shift-1', amount: 150, hours: 6, date: '2026-02-01' },
        { id: 'shift-2', amount: 200, hours: 8, date: '2026-02-02' },
      ]);

      const req = new Request('http://localhost:3010/api/crew/work-history?crewId=crew-1');
      const res = await crewWorkHistoryRoute(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.totalPaid).toBe(350);
      expect(data.history).toHaveLength(2);
    });
  });

  describe('GET /api/contacts/field-vcard', () => {
    it('generates and returns field contact vCard', async () => {
      fakeAdmin.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: { account_id: 'acc-1' } }),
      });
      mocks.loadBusinessName.mockResolvedValue('Apex Roofing & Gutters');
      mocks.getSharedFieldPhoneNumber.mockResolvedValue('+15125550199');
      mocks.formatFieldVcard.mockReturnValue('BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Apex Roofing\r\nEND:VCARD');

      const res = await fieldVcardRoute();
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toContain('text/vcard');
      const text = await res.text();
      expect(text).toContain('BEGIN:VCARD');
      expect(mocks.formatFieldVcard).toHaveBeenCalled();
    });
  });
});
