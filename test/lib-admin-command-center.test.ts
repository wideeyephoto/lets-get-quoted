import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildCommandCenterData } from '@/lib/admin-command-center';

vi.mock('@/lib/admin-alerts', () => ({
  getOpenDisputes: vi.fn().mockResolvedValue([]),
  getPausedPayouts: vi.fn().mockResolvedValue([]),
  getSuspendedAccounts: vi.fn().mockResolvedValue([]),
  getNotOnboardedCount: vi.fn().mockResolvedValue(0),
  getNotOnboardedAccounts: vi.fn().mockResolvedValue([]),
  getPaymentsNeedingAttention: vi.fn().mockResolvedValue([]),
  getOverdueQuickStops: vi.fn().mockResolvedValue([]),
  getFailedSmsEvents: vi.fn().mockResolvedValue([]),
  getFailedEmailEvents: vi.fn().mockResolvedValue([]),
  getUnresolvedWebhookFailures: vi.fn().mockResolvedValue([]),
  getRecentIncidents: vi.fn().mockResolvedValue([]),
  getCasesNearSla: vi.fn().mockResolvedValue([]),
  getCasesWithoutSlaCount: vi.fn().mockResolvedValue(0),
  getMyAssignedCases: vi.fn().mockResolvedValue([]),
  getOpenPrivacyRequests: vi.fn().mockResolvedValue([]),
  createAdminSignalDiagnostics: vi.fn().mockReturnValue({ failed: [] }),
}));

vi.mock('@/lib/command-center-logic', () => ({
  rangeWindow: vi.fn().mockReturnValue({ currentStart: '1', currentEnd: '2', previousStart: '3', previousEnd: '4' }),
  computeTrend: vi.fn().mockReturnValue({ value: 0, previousValue: 0, deltaPct: null, direction: 'flat' }),
}));

vi.mock('@/lib/platform-fees', () => ({
  fetchFeeWindow: vi.fn().mockResolvedValue({
    paymentsProcessed: 1,
    netFees: 1,
    refunds: 1,
    availability: { payments: true, fees: true, refunds: true }
  }),
}));

vi.mock('@/lib/cron-runs', () => ({
  getCronTrouble: vi.fn().mockResolvedValue([]),
}));

describe('Admin Command Center Lib', () => {
  let adminMock: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    adminMock = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      lt: vi.fn().mockResolvedValue({ count: 5, error: null }),
    };
  });

  it('builds command center data', async () => {
    const res = await buildCommandCenterData(adminMock, { role: 'admin', staffEmail: 'a@a.com', range: '30d' });
    expect(res.range).toBe('30d');
    expect(res.metrics.length).toBe(4);
    expect(res.unavailableSignals).toEqual([]);
  });

  it('handles account error', async () => {
    adminMock.lt.mockResolvedValue({ count: null, error: new Error('fail') });
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await buildCommandCenterData(adminMock, { role: 'admin', staffEmail: 'a@a.com', range: '30d' });
    expect(res.metrics[0].available).toBe(false);
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
