import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { POST } from '@/app/api/field/location/route';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  createAdminClient: vi.fn(),
}));

vi.mock('@/lib/crew-auth', () => ({
  loadCrewContext: vi.fn(),
}));

vi.mock('@/lib/time-clock-data', () => ({
  getOpenShift: vi.fn(),
}));

vi.mock('@/lib/job-tracking', () => ({
  updateTechPosition: vi.fn(),
}));

describe('Field Location Route', () => {
  let createAdminClientMock: any;
  let loadCrewContextMock: any;
  let getOpenShiftMock: any;
  let updateTechPositionMock: any;

  let supabaseMock: any;
  let fromMock: any;
  let selectMock: any;
  let eqMock: any;
  let inMock: any;
  let maybeSingleMock: any;
  let upsertMock: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    loadCrewContextMock = (await import('@/lib/crew-auth')).loadCrewContext;
    loadCrewContextMock.mockResolvedValue({
      ok: true,
      context: {
        accountId: 'acct_1',
        crew: { id: 'crew_1', can_share_work_location: true }
      }
    });

    getOpenShiftMock = (await import('@/lib/time-clock-data')).getOpenShift;
    getOpenShiftMock.mockResolvedValue({ id: 'shift_1', job_id: 'job_1' });

    updateTechPositionMock = (await import('@/lib/job-tracking')).updateTechPosition;
    updateTechPositionMock.mockResolvedValue(undefined);

    maybeSingleMock = vi.fn().mockResolvedValue({ data: null });
    inMock = vi.fn().mockReturnValue({ maybeSingle: maybeSingleMock });
    eqMock = vi.fn().mockReturnValue({ in: inMock, eq: vi.fn().mockReturnValue({ maybeSingle: maybeSingleMock }) });
    selectMock = vi.fn().mockReturnValue({ eq: eqMock });
    upsertMock = vi.fn().mockResolvedValue({ error: null });

    fromMock = vi.fn((table: string) => {
      if (table === 'job_tracking') return { select: selectMock };
      if (table === 'crew_location_state') return { select: selectMock, upsert: upsertMock };
      return {};
    });

    supabaseMock = {
      from: fromMock,
      channel: vi.fn().mockReturnValue({ send: vi.fn() })
    };

    createAdminClientMock = (await import('@/lib/auth')).createAdminClient;
    createAdminClientMock.mockReturnValue(supabaseMock);
  });

  it('fails if unauthorized', async () => {
    loadCrewContextMock.mockResolvedValue({ ok: false, reason: 'unauth' });
    const req = new NextRequest('http://localhost/api/field/location', { method: 'POST' });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('fails if invalid JSON', async () => {
    const req = new NextRequest('http://localhost/api/field/location', { method: 'POST', body: 'foo' });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('fails if missing lat/lng', async () => {
    const req = new NextRequest('http://localhost/api/field/location', {
      method: 'POST',
      body: JSON.stringify({ lat: 40 })
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('fails if coordinates out of range', async () => {
    const req = new NextRequest('http://localhost/api/field/location', {
      method: 'POST',
      body: JSON.stringify({ lat: 100, lng: -200 })
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns ok early if location sharing disabled', async () => {
    loadCrewContextMock.mockResolvedValue({
      ok: true,
      context: { accountId: 'acct_1', crew: { id: 'crew_1', can_share_work_location: false } }
    });
    const req = new NextRequest('http://localhost/api/field/location', {
      method: 'POST',
      body: JSON.stringify({ lat: 40, lng: -70 })
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.reason).toBe('location_sharing_disabled_for_crew');
  });

  it('fails if no active shift or arrival', async () => {
    getOpenShiftMock.mockResolvedValue(null);
    maybeSingleMock.mockResolvedValue({ data: null });

    const req = new NextRequest('http://localhost/api/field/location', {
      method: 'POST',
      body: JSON.stringify({ lat: 40, lng: -70 })
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it('ignores stale sample', async () => {
    const now = new Date();
    // mock old state
    maybeSingleMock
      .mockResolvedValueOnce({ data: null }) // job_tracking
      .mockResolvedValueOnce({ data: { captured_at: now.toISOString(), client_sequence: 5 } }); // existing crew_location_state

    const req = new NextRequest('http://localhost/api/field/location', {
      method: 'POST',
      body: JSON.stringify({
        lat: 40, lng: -70,
        capturedAt: new Date(now.getTime() - 10000).toISOString(),
        clientSequence: 4
      })
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ignored).toBe('stale_sample');
  });

  it('upserts location and broadcasts', async () => {
    maybeSingleMock
      .mockResolvedValueOnce({ data: { id: 'track_1', job_id: 'job_1', share_location: true } }) // job_tracking
      .mockResolvedValueOnce({ data: null }); // existing crew_location_state

    const req = new NextRequest('http://localhost/api/field/location', {
      method: 'POST',
      body: JSON.stringify({ lat: 40, lng: -70, accuracyMeters: 5.12, headingDeg: 90.56 })
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);

    expect(upsertMock).toHaveBeenCalled();
    const args = upsertMock.mock.calls[0][0];
    expect(args.account_id).toBe('acct_1');
    expect(args.lat).toBe(40);
    expect(args.accuracy_m).toBe(5.1);

    expect(updateTechPositionMock).toHaveBeenCalled();
  });
});
