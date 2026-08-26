import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getCustomerPermitSummary } from '../src/lib/permit-intel/customer-portal';

vi.mock('@/lib/jobs', () => ({
  getJob: vi.fn().mockResolvedValue({
    id: 'job-1',
    account_id: 'acc-1',
    address: '211 S Williams St, Royal Oak, MI 48067',
    scope: 'Tear off 1 layer architectural shingles and replace with 22 squares dimensional shingles',
  }),
}));

describe('Customer Portal & Homeowner Permit Status Sanitization', () => {
  const mockAccountId = 'acc-1';
  const mockJobId = 'job-1';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('produces sanitized homeowner summary without leaking contractor PINs or margins', async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  application_status: 'issued',
                  external_permit_number: '2026-RO-8492',
                  submission_tier: 'tier_2',
                  updated_at: '2026-08-26T12:00:00Z',
                },
                error: null,
              }),
              order: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: 'insp-1',
                    inspection_type: 'Final Building',
                    status: 'scheduled',
                    scheduled_date: '2026-08-30',
                  },
                ],
                error: null,
              }),
            }),
          }),
        }),
      }),
    } as any;

    const summary = await getCustomerPermitSummary(mockSupabase, mockAccountId, mockJobId);

    expect(summary.authorityName).toBe('City of Royal Oak');
    expect(summary.permitNumber).toBe('2026-RO-8492');
    expect(summary.stage).toBe('issued');
    expect(summary.statusBadge).toBe('Permit Issued');
    expect(summary.verificationUrl).toContain('accessmygov.com');
    expect(summary.milestones.length).toBeGreaterThan(0);

    // Strict privacy checks: ensure no internal leakages
    const stringified = JSON.stringify(summary);
    expect(stringified).not.toContain('contractorPin');
    expect(stringified).not.toContain('submission_tier');
    expect(stringified).not.toContain('margin');
    expect(stringified).not.toContain('contractor_credentials');
  });

  it('returns clean exemption badge for permit-exempt repair work', async () => {
    const { getJob } = await import('@/lib/jobs');
    vi.mocked(getJob).mockResolvedValueOnce({
      id: 'job-exempt',
      account_id: 'acc-1',
      address: '211 S Williams St, Royal Oak, MI 48067',
      scope: 'Repair 3 missing shingles and clean gutters',
    } as any);

    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: null,
                error: null,
              }),
              order: vi.fn().mockResolvedValue({
                data: [],
                error: null,
              }),
            }),
          }),
        }),
      }),
    } as any;

    const summary = await getCustomerPermitSummary(mockSupabase, mockAccountId, 'job-exempt');
    expect(summary.stage).toBe('not_required');
    expect(summary.statusBadge).toBe('Permit Not Required');
    expect(summary.headline).toBe('Work is Municipal Code Exempt');
  });
});
