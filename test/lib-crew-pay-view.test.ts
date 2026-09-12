import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadCrewPayView } from '@/lib/crew-pay-view';

vi.mock('@/lib/crew-pay', () => ({
  summarizePayTotals: vi.fn(),
  payPeriodState: vi.fn(),
  periodPrimaryAction: vi.fn(),
  periodProgress: vi.fn(),
  comparePeriods: vi.fn(),
  hoursByWeekday: vi.fn().mockReturnValue([0,0,0,0,0,0,0]),
}));

vi.mock('@/lib/crew-pay-data', () => ({
  listOutstandingPeriods: vi.fn().mockResolvedValue([]),
  listPayEvents: vi.fn().mockResolvedValue([]),
  listPeriodEntryLines: vi.fn().mockResolvedValue({}),
  loadCrewPayContext: vi.fn(),
}));

vi.mock('@/lib/pay-day', () => ({
  PAY_DAY_COLUMNS: 'test',
  payDaySettingsFromAccount: vi.fn().mockReturnValue({}),
  payDayView: vi.fn().mockReturnValue({}),
}));

vi.mock('@/lib/labor-data', () => ({
  listLaborEntries: vi.fn().mockResolvedValue([]),
}));

vi.mock('@/lib/time-clock-data', () => ({
  getTimeClockMode: vi.fn().mockResolvedValue('optional'),
  listOpenShifts: vi.fn().mockResolvedValue([]),
}));

vi.mock('@/lib/time-clock', () => ({
  openShiftFlag: vi.fn().mockReturnValue(null),
  formatClock: vi.fn().mockReturnValue(''),
  formatElapsed: vi.fn().mockReturnValue(''),
  SHIFT_FLAG_LABEL: {},
  SHIFT_FLAG_HELP: {},
}));

describe('Crew Pay View Lib', () => {
  let supabaseMock: any;

  beforeEach(() => {
    vi.clearAllMocks();
    supabaseMock = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: {} }),
    };
  });

  describe('loadCrewPayView', () => {
    it('returns null if no totals or periodState', async () => {
      const loadCrewPayContextMock = (await import('@/lib/crew-pay-data')).loadCrewPayContext;
      (loadCrewPayContextMock as any).mockResolvedValue({
        rows: [],
        periodRow: null,
        overlaps: [],
        available: true,
      });

      const res = await loadCrewPayView(supabaseMock, 'acct', {
        period: { startIso: '2023-01-01', endIso: '2023-01-07', label: '' },
        settings: { periodMode: 'weekly', startDay: 'monday' },
        timeZone: 'UTC',
        crew: [],
      });
      expect(res).toBeNull();
    });

    it('returns full view if data is valid', async () => {
      const loadCrewPayContextMock = (await import('@/lib/crew-pay-data')).loadCrewPayContext;
      (loadCrewPayContextMock as any).mockResolvedValue({
        rows: [
          { crewId: 'c1', entries: [{ loggedAt: new Date().toISOString(), hours: 5 }], issues: [] }
        ],
        periodRow: { id: 'p1' },
        overlaps: [],
        available: true,
      });

      const summarizePayTotalsMock = (await import('@/lib/crew-pay')).summarizePayTotals;
      (summarizePayTotalsMock as any).mockReturnValue({
        hours: 10, crewCount: 1, unpaid: 0, estimatedPay: 100
      });

      const payPeriodStateMock = (await import('@/lib/crew-pay')).payPeriodState;
      (payPeriodStateMock as any).mockReturnValue('open');

      const res = await loadCrewPayView(supabaseMock, 'acct', {
        period: { startIso: new Date(Date.now() - 86400000).toISOString(), endIso: new Date(Date.now() + 86400000).toISOString(), label: '' },
        settings: { periodMode: 'weekly', startDay: 'monday' },
        timeZone: 'UTC',
        crew: [],
        withComparison: true,
      });

      expect(res).not.toBeNull();
      expect(res?.totals.hours).toBe(10);
      expect(res?.showTodayColumn).toBe(true);
      expect(res?.hoursToday['c1']).toBe(5);
    });

    it('handles geofence statuses in open shifts', async () => {
      const loadCrewPayContextMock = (await import('@/lib/crew-pay-data')).loadCrewPayContext;
      (loadCrewPayContextMock as any).mockResolvedValue({ rows: [], periodRow: null, overlaps: [], available: true });
      
      const summarizePayTotalsMock = (await import('@/lib/crew-pay')).summarizePayTotals;
      (summarizePayTotalsMock as any).mockReturnValue({ hours: 10, crewCount: 1, unpaid: 0, estimatedPay: 100 });
      
      const payPeriodStateMock = (await import('@/lib/crew-pay')).payPeriodState;
      (payPeriodStateMock as any).mockReturnValue('open');

      const listOpenShiftsMock = (await import('@/lib/time-clock-data')).listOpenShifts;
      (listOpenShiftsMock as any).mockResolvedValue([
        { id: '1', geofenceStatus: 'verified_on_site', clockInDistanceFt: 100 },
        { id: '2', geofenceStatus: 'off_site_warning', clockInDistanceFt: null },
        { id: '3', geofenceStatus: 'location_uncertain' }
      ]);

      const res = await loadCrewPayView(supabaseMock, 'acct', {
        period: { startIso: '2023-01-01', endIso: '2023-01-07', label: '' },
        settings: { periodMode: 'weekly', startDay: 'monday' },
        timeZone: 'UTC',
        crew: [],
      });

      expect(res?.openShifts.length).toBe(3);
      expect(res?.openShifts[0].geofenceLabel).toContain('On site');
      expect(res?.openShifts[1].geofenceLabel).toBe('⚠️ Off site');
      expect(res?.openShifts[2].geofenceLabel).toBe('⏳ GPS uncertain');
    });
  });
});
