import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getPermitAnalytics } from '../src/lib/permit-intel/permit-analytics';

describe('Permit Analytics & Regional Benchmarks Domain Service', () => {
  const mockAccountId = 'acc-1';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('aggregates active permits, pass rates, and regional turnaround times', async () => {
    const mockCases = [
      { id: 'c1', authority_id: 'mi-royal-oak', application_status: 'issued' },
      { id: 'c2', authority_id: 'mi-royal-oak', application_status: 'in_review' },
      { id: 'c3', authority_id: 'mi-detroit', application_status: 'draft' },
      { id: 'c4', authority_id: 'mi-grand-rapids', application_status: 'closed' },
    ];

    const mockInspections = [
      { id: 'i1', status: 'passed' },
      { id: 'i2', status: 'passed' },
      { id: 'i3', status: 'failed' },
      { id: 'i4', status: 'passed' },
    ];

    const mockFees = [
      { amount: 120, description: 'City of Royal Oak permit fee' },
      { amount: 150, description: 'Detroit BSEED permit fee' },
    ];

    const mockSupabase = {
      from: vi.fn().mockImplementation((table) => {
        if (table === 'job_permit_cases') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: mockCases, error: null }),
            }),
          };
        }
        if (table === 'job_permit_inspections') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: mockInspections, error: null }),
            }),
          };
        }
        if (table === 'costs') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  ilike: vi.fn().mockResolvedValue({ data: mockFees, error: null }),
                }),
              }),
            }),
          };
        }
        return {};
      }),
    } as any;

    const analytics = await getPermitAnalytics(mockSupabase, mockAccountId);

    expect(analytics.totalPermitsCount).toBe(4);
    expect(analytics.activePermitsCount).toBe(3);
    expect(analytics.closedPermitsCount).toBe(1);
    expect(analytics.statusDistribution.issued).toBe(1);
    expect(analytics.statusDistribution.in_review).toBe(1);
    expect(analytics.statusDistribution.draft).toBe(1);
    expect(analytics.statusDistribution.closed).toBe(1);

    // 3 passed out of 4 finished = 75.0%
    expect(analytics.inspectionPassRate).toBe(75);

    // Total fees = 120 + 150 = 270
    expect(analytics.totalGovernmentFees).toBe(270);
    expect(analytics.avgFeePerPermit).toBe(67.5);

    // Regional benchmarks
    expect(analytics.regionalBenchmarks.length).toBeGreaterThan(0);
    const royalOak = analytics.regionalBenchmarks.find((b) => b.authorityId === 'mi-royal-oak');
    expect(royalOak).toBeDefined();
    expect(royalOak?.totalPermits).toBe(2);
    expect(royalOak?.activePermits).toBe(2);
    expect(royalOak?.avgTurnaroundDays).toBe(3.2);
  });
});
