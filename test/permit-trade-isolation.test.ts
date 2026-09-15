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

const ROOFING_KEYWORDS = [
  /\bshingle/i,
  /\bunderlayment/i,
  /\bice barrier/i,
  /\btear off/i,
  /\b22 squares/i,
  /\bsquares\b/i,
  /timberline/i,
  /drip edge/i,
  /ridge vent/i,
  /step flashing/i,
];

describe('Permit Trade Isolation Guardrail (Zero Roofing Leaks in Non-Roofing Trades)', () => {
  const accountId = '22222222-2222-4222-a222-222222222222';

  it('isolates plumbing permit: renders plumbing scope with zero roofing vocabulary', async () => {
    const supabase = createMockSupabase({
      jobs: [
        {
          id: 'job-plumb',
          account_id: accountId,
          address: '4763 Morse Ave, Royal Oak, MI 48073',
          scope: 'Hydro-jetting sewer line main drain cleaning and cleanout riser replacement',
          client_name: 'Plumbing Client',
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
        },
      ],
      sites: [],
      contractor_credentials: [],
    });

    const data = await compilePermitApplication(supabase as any, accountId, 'job-plumb');
    expect(data.workScope.trade).toBe('Residential Plumbing');
    expect(data.workScope.discipline).toBe('plumbing');
    expect(data.authority.department).toContain('Plumbing');

    const html = generatePermitApplicationHtml(data);
    expect(html).toContain('Residential Plumbing');
    expect(html).toContain('Drainage Cleanouts');
    expect(html).toContain('P3005.2');

    // Assert zero roofing keywords in the rendered HTML or data scope
    for (const pattern of ROOFING_KEYWORDS) {
      expect(html, `Plumbing permit HTML must not leak roofing keyword matching ${pattern}`).not.toMatch(pattern);
    }
  });

  it('isolates electrical permit: renders electrical scope with zero roofing vocabulary', async () => {
    const supabase = createMockSupabase({
      jobs: [
        {
          id: 'job-elec',
          account_id: accountId,
          address: '211 S Williams St, Royal Oak, MI 48067',
          scope: 'Install 200A main service panel upgrade, whole-home surge protector, and 240V 50A EV charger in garage',
          client_name: 'Electrical Client',
          quoted_amount: 3800,
          parcel_number: null,
          deleted_at: null,
        },
      ],
      accounts: [
        {
          id: accountId,
          business_name: 'Amped Electricians Co',
          mailing_address: '100 S Main St, Royal Oak, MI 48067',
        },
      ],
      sites: [],
      contractor_credentials: [],
    });

    const data = await compilePermitApplication(supabase as any, accountId, 'job-elec');
    expect(data.workScope.trade).toBe('Residential Electrical');
    expect(data.workScope.discipline).toBe('electrical');
    expect(data.authority.department).toContain('Electrical');

    const html = generatePermitApplicationHtml(data);
    expect(html).toContain('Residential Electrical');
    expect(html).toContain('Service Disconnect');
    expect(html).toContain('Art. 230.70');

    for (const pattern of ROOFING_KEYWORDS) {
      expect(html, `Electrical permit HTML must not leak roofing keyword matching ${pattern}`).not.toMatch(pattern);
    }
  });

  it('isolates mechanical permit: renders mechanical HVAC scope with zero roofing vocabulary', async () => {
    const supabase = createMockSupabase({
      jobs: [
        {
          id: 'job-mech',
          account_id: accountId,
          address: '500 S Center St, Royal Oak, MI 48067',
          scope: 'Furnish and install 96% AFUE high-efficiency gas furnace and 16 SEER2 heat pump',
          client_name: 'HVAC Client',
          quoted_amount: 7200,
          parcel_number: null,
          deleted_at: null,
        },
      ],
      accounts: [
        {
          id: accountId,
          business_name: 'Comfort Air HVAC LLC',
          mailing_address: '100 S Main St, Royal Oak, MI 48067',
        },
      ],
      sites: [],
      contractor_credentials: [],
    });

    const data = await compilePermitApplication(supabase as any, accountId, 'job-mech');
    expect(data.workScope.trade).toContain('Residential Mechanical');
    expect(data.workScope.discipline).toBe('mechanical');
    expect(data.authority.department).toContain('Mechanical');

    const html = generatePermitApplicationHtml(data);
    expect(html).toContain('Residential Mechanical');
    expect(html).toContain('Equipment Sizing');

    for (const pattern of ROOFING_KEYWORDS) {
      expect(html, `Mechanical permit HTML must not leak roofing keyword matching ${pattern}`).not.toMatch(pattern);
    }
  });

  it('isolates generic building fallback: renders neutral scope with zero roofing vocabulary', async () => {
    const supabase = createMockSupabase({
      jobs: [
        {
          id: 'job-gen',
          account_id: accountId,
          address: '120 E 4th St, Royal Oak, MI 48067',
          scope: 'General non-structural interior framing and drywall remodel',
          client_name: 'Remodel Client',
          quoted_amount: null,
          parcel_number: null,
          deleted_at: null,
        },
      ],
      accounts: [
        {
          id: accountId,
          business_name: 'General Builders LLC',
          mailing_address: '100 S Main St, Royal Oak, MI 48067',
        },
      ],
      sites: [],
      contractor_credentials: [],
    });

    const data = await compilePermitApplication(supabase as any, accountId, 'job-gen');
    expect(data.workScope.trade).toBe('Residential Building');
    expect(data.workScope.specRows).toHaveLength(0);

    const html = generatePermitApplicationHtml(data);
    expect(html).toContain('Application for Residential Building Permit');
    expect(html).toContain('Verify scope with jurisdiction');

    for (const pattern of ROOFING_KEYWORDS) {
      expect(html, `Generic building permit HTML must not leak roofing keyword matching ${pattern}`).not.toMatch(pattern);
    }
  });
});
