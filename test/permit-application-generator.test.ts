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
});
