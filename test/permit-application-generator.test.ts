import { describe, it, expect, vi } from 'vitest';
import {
  compilePermitApplication,
  generatePermitApplicationHtml,
} from '../src/lib/permit-intel/application-generator';

vi.mock('@/lib/jobs', () => ({
  getJob: vi.fn().mockResolvedValue({
    id: 'job-1',
    account_id: 'acc-1',
    client_name: 'John & Jane Homeowner',
    address: '211 S Williams St, Royal Oak, MI 48067',
    scope: 'Tear off 1 layer architectural shingles and replace with 22 squares GAF Timberline HDZ',
    quoted_amount: 9800,
    client_phone: '248-555-1234',
    client_email: 'homeowner@example.com',
  }),
}));

describe('Permit Application Pre-fill Generator', () => {
  const mockAccountId = 'acc-1';
  const mockJobId = 'job-1';

  it('compiles pre-filled municipal application with contractor credentials and technical specs', async () => {
    const mockSupabase = {
      from: vi.fn().mockImplementation((table) => {
        if (table === 'accounts') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    business_name: 'Great Lakes Roofing Pros LLC',
                    mailing_address: '100 Main St, Royal Oak, MI 48067',
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === 'sites') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    company_name: 'Great Lakes Roofing Pros LLC',
                    license: '2102948123',
                    phone: '248-555-9000',
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === 'contractor_credentials') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            }),
          };
        }
        return {};
      }),
    } as any;

    const data = await compilePermitApplication(mockSupabase, mockAccountId, mockJobId);

    expect(data.authority.name).toBe('City of Royal Oak');
    expect(data.applicant.companyName).toBe('Great Lakes Roofing Pros LLC');
    expect(data.applicant.licenseNumber.status).toBe('provided');
    if (data.applicant.licenseNumber.status === 'provided') {
      expect(data.applicant.licenseNumber.value).toBe('2102948123');
    }
    expect(data.property.ownerName.status).toBe('provided');
    if (data.property.ownerName.status === 'provided') {
      expect(data.property.ownerName.value).toBe('John & Jane Homeowner');
    }
    expect(data.property.streetAddress).toBe('211 S Williams St');
    expect(data.property.city).toBe('Royal Oak');
    expect(data.property.state).toBe('MI');
    expect(data.workScope.estimatedCost).toBe(9800);
    expect(data.workScope.iceBarrierCompliance).toBe(true);
    expect(data.certification.section23aNotice).toContain('Section 23a of the state construction code act');
  });

  it('generates clean printable HTML with MRC specifications and legal notice', async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            order: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      }),
    } as any;

    const data = await compilePermitApplication(mockSupabase, mockAccountId, mockJobId);
    const html = generatePermitApplicationHtml(data);
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('City of Royal Oak');
    expect(html).toContain('211 S Williams St');
    expect(html).toContain('2015 MRC § R905.1.2');
    expect(html).toContain('Section 23a of the state construction code act');
    expect(html).toContain('Signature of Contractor / Authorized Agent');
    expect(html).toContain('<strong>Licensed Builder</strong>');
  });

  it('renders drawn vector signature SVG when applicantSignaturePath is provided', async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            order: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      }),
    } as any;

    const data = await compilePermitApplication(mockSupabase, mockAccountId, mockJobId);
    const validSamplePath = 'M10 20 Q50 60 100 20 L200 80';
    data.certification.applicantSignaturePath = validSamplePath;
    data.certification.signatureMethod = 'drawn';

    const html = generatePermitApplicationHtml(data);

    expect(html).toContain('<svg viewBox="0 0 600 200" class="sig-svg"');
    expect(html).toContain(`d="${validSamplePath}"`);
    expect(html).toContain('Signature of Contractor / Authorized Agent');
  });

  it('routes plumbing scope correctly and isolates trade from roofing keywords', async () => {
    const { getJob } = await import('@/lib/jobs');
    vi.mocked(getJob).mockResolvedValueOnce({
      id: 'job-plumb',
      account_id: mockAccountId,
      client_name: 'Jane Customer',
      address: '211 S Williams St, Royal Oak, MI 48067',
      scope: 'Replace 50 gallon gas water heater and install 4-inch sewer cleanout',
      quoted_amount: '4500.00',
    } as any);

    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            order: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      }),
    } as any;

    const data = await compilePermitApplication(mockSupabase, mockAccountId, 'job-plumb');
    expect(data.workScope.trade).toBe('Residential Plumbing');
    expect(data.workScope.estimatedCost).toBe(4500);
    expect(data.workScope.specRows?.some((r) => r.label.includes('Cleanouts'))).toBe(true);

    const html = generatePermitApplicationHtml(data);
    expect(html).toContain('Application for Residential Plumbing Permit');
    expect(html).toContain('P3005.2');
    expect(html).not.toContain('GAF Timberline');
    expect(html).not.toContain('Ice Barrier Protection');
    expect(html).not.toContain('Tear off 1 layer');
  });

  it('routes electrical scope and includes NEC citations', async () => {
    const { getJob } = await import('@/lib/jobs');
    vi.mocked(getJob).mockResolvedValueOnce({
      id: 'job-elec',
      account_id: mockAccountId,
      client_name: 'Electric Customer',
      address: '211 S Williams St, Royal Oak, MI 48067',
      scope: 'Install 200A service panel upgrade, 240V 50A EV charger in garage',
      quoted_amount: 3200,
    } as any);

    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            order: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      }),
    } as any;

    const data = await compilePermitApplication(mockSupabase, mockAccountId, 'job-elec');
    expect(data.workScope.trade).toBe('Residential Electrical');
    expect(data.workScope.specRows?.some((r) => r.label.includes('Service Disconnect'))).toBe(true);

    const html = generatePermitApplicationHtml(data);
    expect(html).toContain('Application for Residential Electrical Permit');
    expect(html).toContain('Art. 230.70');
    expect(html).not.toContain('Ice Barrier');
  });

  it('falls back to building generic profile with Verify scope notice when trade is generic', async () => {
    const { getJob } = await import('@/lib/jobs');
    vi.mocked(getJob).mockResolvedValueOnce({
      id: 'job-generic',
      account_id: mockAccountId,
      client_name: 'Generic Customer',
      address: '211 S Williams St, Royal Oak, MI 48067',
      scope: 'General interior renovation and non-structural dry wall installation',
      quoted_amount: null,
    } as any);

    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            order: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      }),
    } as any;

    const data = await compilePermitApplication(mockSupabase, mockAccountId, 'job-generic');
    expect(data.workScope.trade).toBe('Residential Building');
    expect(data.workScope.estimatedCost).toBeUndefined();
    expect(data.workScope.specRows).toHaveLength(0);

    const html = generatePermitApplicationHtml(data);
    expect(html).toContain('Application for Residential Building Permit');
    expect(html).toContain('Verify scope with jurisdiction');
  });
});
