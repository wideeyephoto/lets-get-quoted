import { describe, it, expect } from 'vitest';
import { compilePermitApplication, generatePermitApplicationHtml } from '../src/lib/permit-intel/application-generator';

function createMockSupabase(dbData: {
  jobs: any[];
  accounts: any[];
  sites: any[];
  contractor_credentials: any[];
}) {
  return {
    from: (table: string) => {
      const rows = (dbData as any)[table] || [];
      const query = {
        filters: [] as Array<(row: any) => boolean>,
        select: (_cols = '*') => query,
        eq: (col: string, val: any) => {
          query.filters.push((r: any) => r[col] === val);
          return query;
        },
        is: (col: string, val: any) => {
          query.filters.push((r: any) => r[col] === val);
          return query;
        },
        order: () => query,
        maybeSingle: async () => {
          const item = rows.find((r: any) => query.filters.every((f) => f(r)));
          return { data: item || null, error: null };
        },
        single: async () => {
          const item = rows.find((r: any) => query.filters.every((f) => f(r)));
          return { data: item || null, error: null };
        },
        then: (onfulfilled: any, onrejected: any) => {
          const matches = rows.filter((r: any) => query.filters.every((f) => f(r)));
          return Promise.resolve({ data: matches, error: null }).then(onfulfilled, onrejected);
        },
      };
      return query;
    },
  };
}

describe('Permit Golden Document Tests (Empty Vault vs Populated Vault)', () => {
  const accountId = '22222222-2222-4222-a222-222222222222';
  const jobId = '11111111-1111-4111-a111-111111111111';

  it('generates a clean DRAFT document with ruled blank lines when vault and account credentials are empty', async () => {
    const emptySupabase = createMockSupabase({
      jobs: [
        {
          id: jobId,
          account_id: accountId,
          address: '4763 Morse Ave, Royal Oak, MI 48073',
          scope: 'Hydro-jetting sewer line main drain cleaning',
          client_name: 'Homeowner Smith',
          quoted_amount: 350,
          parcel_number: null,
          deleted_at: null,
        },
      ],
      accounts: [
        {
          id: accountId,
          business_name: 'BrokePipes Plumbing LLC',
          mailing_address: '100 S Main St, Royal Oak, MI 48067',
          fein: null,
          state_employer_number: null,
          license_type: null,
        },
      ],
      sites: [],
      contractor_credentials: [],
    });

    const data = await compilePermitApplication(emptySupabase as any, accountId, jobId);

    // Readiness must report incomplete with all missing Tier-A credentials
    expect(data.readiness.complete).toBe(false);
    expect(data.readiness.missing).toContain('State Builder License #');
    expect(data.readiness.missing).toContain('License Expiration Date');
    expect(data.readiness.missing).toContain('Qualifying Licensee / Contact Name');
    expect(data.readiness.missing).toContain('General Liability Insurance Carrier');
    expect(data.readiness.missing).toContain('General Liability Policy Number');
    expect(data.readiness.missing).toContain("Workers' Compensation Carrier");
    expect(data.readiness.missing).toContain("Workers' Compensation Policy Number");
    expect(data.readiness.missing).toContain('State Employer / MESC #');
    expect(data.readiness.missing).toContain('Federal Employer ID (FEIN)');
    expect(data.readiness.missing).toContain('Permanent Parcel ID');

    // All missing fields must have status: 'missing'
    expect(data.applicant.licenseNumber.status).toBe('missing');
    expect(data.applicant.licenseExpiration.status).toBe('missing');
    expect(data.applicant.insuranceCarrier.status).toBe('missing');
    expect(data.applicant.insurancePolicyNumber.status).toBe('missing');
    expect(data.applicant.workersCompCarrier.status).toBe('missing');
    expect(data.applicant.workersCompPolicy.status).toBe('missing');
    expect(data.applicant.mescEmployerNumber.status).toBe('missing');
    expect(data.applicant.fein.status).toBe('missing');
    expect(data.property.parcelNumber.status).toBe('missing');

    // Generate HTML
    const html = generatePermitApplicationHtml(data);

    // Document must display DRAFT watermark
    expect(html).toContain('DRAFT — NOT FOR SUBMISSION');
    expect(html).toContain('class="draft-watermark"');

    // Missing fields must render ruled blank lines for physical handwriting
    expect(html).toContain('class="blank-line"');
    expect(html).toContain('class="missing-chip"');

    // MUST NOT contain any legacy fabricated credentials
    expect(html).not.toContain('2101234567');
    expect(html).not.toContain('CPP-9402194');
    expect(html).not.toContain('WC-094124-MI');
    expect(html).not.toContain('25-15-200-014');
    expect(html).not.toContain('38-9876543');
    expect(html).not.toContain('00-1234567');
    expect(html).not.toContain('Cincinnati Insurance Company');
    expect(html).not.toContain('Accident Fund Insurance Co of America');
  });

  it('generates a complete submission-ready document without DRAFT watermark when vault is fully populated', async () => {
    const populatedSupabase = createMockSupabase({
      jobs: [
        {
          id: jobId,
          account_id: accountId,
          address: '4763 Morse Ave, Royal Oak, MI 48073',
          scope: 'Hydro-jetting sewer line main drain cleaning',
          client_name: 'Homeowner Smith',
          quoted_amount: 350,
          parcel_number: '25-11-222-333',
          deleted_at: null,
        },
      ],
      accounts: [
        {
          id: accountId,
          business_name: 'BrokePipes Plumbing LLC',
          mailing_address: '100 S Main St, Royal Oak, MI 48067',
          fein: '12-3456789',
          state_employer_number: 'UIA-99887766',
          license_type: 'Master Plumber (8101)',
        },
      ],
      sites: [
        {
          account_id: accountId,
          company_name: 'BrokePipes Plumbing LLC',
          phone: '(248) 555-0199',
          license: 'MP-8101928374',
        },
      ],
      contractor_credentials: [
        {
          id: 'cred-lic-1',
          account_id: accountId,
          credential_type: 'state_license',
          trade_discipline: 'plumbing',
          license_number: '8101928374',
          holder_name: 'Bob Master Plumber',
          issuing_authority: 'State of Michigan LARA BCC',
          expires_at: '2028-06-30',
          status: 'active',
        },
        {
          id: 'cred-ins-1',
          account_id: accountId,
          credential_type: 'liability_insurance',
          trade_discipline: 'general',
          insurance_carrier: 'Liberty Mutual Commercial',
          policy_number: 'LMC-8819203',
          holder_name: 'BrokePipes Plumbing LLC',
          issuing_authority: 'Liberty Mutual',
          status: 'active',
        },
        {
          id: 'cred-wc-1',
          account_id: accountId,
          credential_type: 'workers_comp',
          trade_discipline: 'general',
          insurance_carrier: 'Michigan State Accident Fund',
          policy_number: 'SAF-3301928',
          holder_name: 'BrokePipes Plumbing LLC',
          issuing_authority: 'State Fund',
          status: 'active',
        },
      ],
    });

    const data = await compilePermitApplication(populatedSupabase as any, accountId, jobId);

    // Readiness must report complete with zero missing fields
    expect(data.readiness.complete).toBe(true);
    expect(data.readiness.missing).toHaveLength(0);

    // All fields must be status: 'provided' with accurate source IDs
    expect(data.applicant.licenseNumber).toEqual({
      status: 'provided',
      value: '8101928374',
      sourceId: 'cred-lic-1',
    });
    expect(data.applicant.licenseExpiration).toEqual({
      status: 'provided',
      value: '2028-06-30',
      sourceId: 'cred-lic-1',
    });
    expect(data.applicant.contactName).toEqual({
      status: 'provided',
      value: 'Bob Master Plumber',
      sourceId: 'cred-lic-1',
    });
    expect(data.applicant.insuranceCarrier).toEqual({
      status: 'provided',
      value: 'Liberty Mutual Commercial',
      sourceId: 'cred-ins-1',
    });
    expect(data.applicant.insurancePolicyNumber).toEqual({
      status: 'provided',
      value: 'LMC-8819203',
      sourceId: 'cred-ins-1',
    });
    expect(data.applicant.workersCompCarrier).toEqual({
      status: 'provided',
      value: 'Michigan State Accident Fund',
      sourceId: 'cred-wc-1',
    });
    expect(data.applicant.workersCompPolicy).toEqual({
      status: 'provided',
      value: 'SAF-3301928',
      sourceId: 'cred-wc-1',
    });
    expect(data.applicant.fein).toEqual({
      status: 'provided',
      value: '12-3456789',
      sourceId: 'accounts.fein',
    });
    expect(data.applicant.mescEmployerNumber).toEqual({
      status: 'provided',
      value: 'UIA-99887766',
      sourceId: 'accounts.state_employer_number',
    });
    expect(data.property.parcelNumber).toEqual({
      status: 'provided',
      value: '25-11-222-333',
      sourceId: 'jobs.parcel_number',
    });

    // Generate HTML
    const html = generatePermitApplicationHtml(data);

    // Document must NOT have DRAFT watermark
    expect(html).not.toContain('DRAFT — NOT FOR SUBMISSION');
    expect(html).not.toContain('class="draft-watermark"');

    // Document must contain populated values
    expect(html).toContain('8101928374');
    expect(html).toContain('Bob Master Plumber');
    expect(html).toContain('Liberty Mutual Commercial');
    expect(html).toContain('LMC-8819203');
    expect(html).toContain('Michigan State Accident Fund');
    expect(html).toContain('SAF-3301928');
    expect(html).toContain('12-3456789');
    expect(html).toContain('UIA-99887766');
    expect(html).toContain('25-11-222-333');
    expect(html).toContain('Homeowner Smith');
  });
});
