import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runGeocodeSweep } from '@/lib/geocode-sweep';
import { createAdminClient } from '@/lib/auth';
import { backfillJobCoordinates } from '@/lib/jobs';
import { backfillLeadCoordinates } from '@/lib/leads';

vi.mock('@/lib/auth', () => ({
  createAdminClient: vi.fn(),
}));

vi.mock('@/lib/jobs', () => ({
  backfillJobCoordinates: vi.fn(),
}));

vi.mock('@/lib/leads', () => ({
  backfillLeadCoordinates: vi.fn(),
}));

describe('Geocode Sweep Lib', () => {
  let adminMock: any;
  let queryMock: any;

  beforeEach(() => {
    vi.clearAllMocks();

    queryMock = {
      select: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
    };

    adminMock = {
      from: vi.fn(() => queryMock),
    };

    (createAdminClient as any).mockReturnValue(adminMock);
  });

  it('scans and fixes accounts', async () => {
    // 1st call: jobs table
    // 2nd call: leads table
    adminMock.from.mockImplementation((table: string) => {
      if (table === 'jobs') {
        return {
          ...queryMock,
          limit: vi.fn().mockResolvedValue({
            data: [{ account_id: 'acct1' }, { account_id: null }, { account_id: 'acct2' }]
          }),
        };
      }
      if (table === 'leads') {
        return {
          ...queryMock,
          limit: vi.fn().mockResolvedValue({
            data: [{ account_id: 'acct2' }, { account_id: 'acct3' }]
          }),
        };
      }
    });

    (backfillJobCoordinates as any)
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(0);

    (backfillLeadCoordinates as any)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(3);

    const summary = await runGeocodeSweep();

    expect(summary.accountsScanned).toBe(3); // acct1, acct2, acct3
    expect(summary.jobsFixed).toBe(7); // 5 + 2 + 0
    expect(summary.leadsFixed).toBe(4); // 1 + 0 + 3

    expect(backfillJobCoordinates).toHaveBeenCalledTimes(3);
    expect(backfillJobCoordinates).toHaveBeenCalledWith(adminMock, 'acct1', 25);
    expect(backfillLeadCoordinates).toHaveBeenCalledWith(adminMock, 'acct3', 25);
  });

  it('handles errors from specific accounts and continues', async () => {
    adminMock.from.mockImplementation(() => ({
      ...queryMock,
      limit: vi.fn().mockResolvedValue({
        data: [{ account_id: 'acct1' }, { account_id: 'acct2' }]
      }),
    }));

    // Error on acct1 jobs
    (backfillJobCoordinates as any).mockImplementation((_admin: any, acct: string) => {
      if (acct === 'acct1') return Promise.reject(new Error('API failure'));
      return Promise.resolve(10);
    });

    (backfillLeadCoordinates as any).mockResolvedValue(2);

    const summary = await runGeocodeSweep();

    expect(summary.accountsScanned).toBe(2);
    // acct1 threw in jobs, so leads for acct1 skipped.
    // acct2 jobs = 10, leads = 2
    expect(summary.jobsFixed).toBe(10);
    expect(summary.leadsFixed).toBe(2);
  });
});
