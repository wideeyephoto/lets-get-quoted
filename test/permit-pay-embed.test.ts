import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth', () => ({
  createAdminClient: vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
    }),
  }),
}));

vi.mock('@/lib/payments', () => ({
  getPublicPayment: vi.fn(),
  quoteFeeForPayment: vi.fn().mockResolvedValue(null),
  isLegacyDestinationPayment: vi.fn().mockReturnValue(false),
  ACH_MIN_AMOUNT: 100,
}));

vi.mock('@/lib/contractor-brand', () => ({
  loadContractorBrand: vi.fn().mockResolvedValue({
    companyName: 'Royal Roofing LLC',
    logoUrl: null,
    accentColor: '#38bdf8',
    phone: '248-555-0199',
  }),
}));

vi.mock('@/lib/payment-view', () => ({
  resolvePaymentView: vi.fn().mockReturnValue({
    canPay: true,
    banner: null,
    showCancelledNote: false,
    statusLabel: 'Pending Payment',
  }),
}));

vi.mock('@/lib/stripe', () => ({
  canCreateConnectCharge: vi.fn().mockReturnValue(true),
}));

vi.mock('@/lib/permit-intel/customer-portal', () => ({
  getCustomerPermitSummary: vi.fn(),
}));

import { getPublicPayment } from '@/lib/payments';
import { getCustomerPermitSummary } from '@/lib/permit-intel/customer-portal';
import PaymentPage from '../src/app/pay/[id]/page';

describe('Customer Payment & Quote Proposal Page - Permit Trust Embed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches sanitized municipal permit summary for payment associated with a job', async () => {
    vi.mocked(getPublicPayment).mockResolvedValueOnce({
      id: 'pay-1',
      account_id: 'acc-1',
      job_id: 'job-1',
      amount: 9800,
      kind: 'final',
      status: 'pending',
      display_business_name: 'Royal Roofing LLC',
      job: {
        ref: 'JOB-9482',
        client_name: 'John Homeowner',
      },
    } as any);

    vi.mocked(getCustomerPermitSummary).mockResolvedValueOnce({
      statusBadge: 'Permit Issued',
      stage: 'issued',
      stageIndex: 3,
      totalStages: 5,
      authorityName: 'City of Royal Oak',
      agencyName: 'Building Division',
      permitNumber: '2026-RO-8492',
      verificationUrl: 'https://accessmygov.com/?uid=1349',
      milestones: [],
      headline: 'Permit Officially Issued',
      description: 'Active permit on file',
      isCompliant: true,
      lastUpdated: '2026-08-26T12:00:00Z',
    });

    const jsx = await PaymentPage({
      params: { id: 'pay-1' },
      searchParams: {},
    });

    expect(getCustomerPermitSummary).toHaveBeenCalledWith(expect.anything(), 'acc-1', 'job-1');
    expect(jsx).toBeDefined();
  });
});
