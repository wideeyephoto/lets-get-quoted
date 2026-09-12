import { describe, it, expect, vi, beforeEach } from 'vitest';
import { clientInsuranceFor } from '@/lib/insurance-client';

vi.mock('@/lib/insurance', () => ({
  clientSummary: vi.fn().mockReturnValue('Fully insured'),
  showsToClient: vi.fn((record, todayKey) => record.showOnQuotes), // simplified mock
}));

vi.mock('@/lib/insurance-storage', () => ({
  insuranceProofUrl: vi.fn().mockResolvedValue('https://example.com/proof.pdf'),
}));

describe('Insurance Client Lib', () => {
  let adminMock: any;
  let queryMock: any;

  beforeEach(() => {
    vi.clearAllMocks();

    queryMock = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(),
    };

    adminMock = {
      from: vi.fn(() => queryMock),
    };
  });

  it('returns null if account not found', async () => {
    queryMock.maybeSingle.mockResolvedValue({ data: null });
    const res = await clientInsuranceFor(adminMock, 'acct1');
    expect(res).toBeNull();
  });

  it('returns null if showsToClient is false', async () => {
    queryMock.maybeSingle.mockResolvedValue({ 
      data: {
        insurance_path: 'foo',
        insurance_show_on_quotes: false,
        timezone: 'America/New_York'
      }
    });
    const res = await clientInsuranceFor(adminMock, 'acct1');
    expect(res).toBeNull();
  });

  it('returns summary and url if it shows to client', async () => {
    queryMock.maybeSingle.mockResolvedValue({ 
      data: {
        insurance_path: 'foo',
        insurance_filename: 'proof.pdf',
        insurance_show_on_quotes: true,
        insurance_coverage_amount: 1000000,
        timezone: 'America/New_York'
      }
    });
    
    const res = await clientInsuranceFor(adminMock, 'acct1');
    expect(res).toEqual({
      summary: 'Fully insured',
      url: 'https://example.com/proof.pdf',
      filename: 'proof.pdf'
    });
    
    const { insuranceProofUrl } = await import('@/lib/insurance-storage');
    expect(insuranceProofUrl).toHaveBeenCalledWith('acct1', 'foo');
  });
});
