import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { compilePermitApplication, generatePermitApplicationHtml } from '../src/lib/permit-intel/application-generator';
import { generateMunicipalCoi, generateCoiHtml, CoverageDataMissingError } from '../src/lib/permit-intel/coi-generator';

function makeThenable<T>(value: T): PromiseLike<T> {
  return {
    then<TResult1 = T, TResult2 = never>(
      onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
    ): PromiseLike<TResult1 | TResult2> {
      try {
        const result = onfulfilled ? onfulfilled(value) : (value as any);
        return makeThenable(result) as any;
      } catch (err) {
        if (onrejected) {
          const result = onrejected(err);
          return makeThenable(result) as any;
        }
        throw err;
      }
    },
    // Explicitly NO .catch or .finally
  };
}

function createFakeSupabase(tables: Record<string, any[]>, useStrictThenable = false) {
  const queriedTables = new Set<string>();

  const client = {
    queriedTables,
    from(tableName: string) {
      queriedTables.add(tableName);
      const rows = tables[tableName] || [];
      const queryState: {
        filters: Array<(row: any) => boolean>;
      } = {
        filters: [],
      };

      const wrapSingle = (val: any) =>
        useStrictThenable ? makeThenable(val) : Promise.resolve(val);

      const builder: any = {
        select(_fields = '*') {
          return builder;
        },
        eq(col: string, val: any) {
          queryState.filters.push((row: any) => row[col] === val);
          return builder;
        },
        is(col: string, val: any) {
          queryState.filters.push((row: any) => row[col] === val);
          return builder;
        },
        order(_col: string, _opts?: any) {
          return builder;
        },
        maybeSingle() {
          const filtered = rows.filter((r) => queryState.filters.every((f) => f(r)));
          return wrapSingle({ data: filtered[0] || null, error: null });
        },
        single() {
          const filtered = rows.filter((r) => queryState.filters.every((f) => f(r)));
          return wrapSingle({ data: filtered[0] || null, error: null });
        },
        then(onfulfilled: any, onrejected: any) {
          const filtered = rows.filter((r) => queryState.filters.every((f) => f(r)));
          const payload = { data: filtered, error: null };
          if (useStrictThenable) {
            return makeThenable(payload).then(onfulfilled, onrejected);
          }
          return Promise.resolve(payload).then(onfulfilled, onrejected);
        },
      };

      if (!useStrictThenable) {
        builder.catch = (onrejected: any) =>
          Promise.resolve({ data: rows, error: null }).catch(onrejected);
      }

      return builder;
    },
  };

  return client;
}

const FORBIDDEN_SAMPLE_LITERALS = [
  '2101234567',
  'Cincinnati Insurance Company',
  'CPP-9402194',
  'WC-9940122',
  'GL-8849201',
  'Travelers Property Casualty Co. of America',
];

describe('Permits Section Regression Guards (Phase 5)', () => {
  const accountId = '22222222-2222-4222-a222-222222222222';
  const jobId = '11111111-1111-4111-a111-111111111111';

  describe('1. Thenable Misuse Guard', () => {
    it('compilePermitApplication succeeds against a client implementing only PromiseLike (.then, no .catch)', async () => {
      const fakeClient = createFakeSupabase(
        {
          jobs: [
            {
              id: jobId,
              account_id: accountId,
              address: '211 S Williams St, Royal Oak, MI 48067',
              scope: 'tear off and replace shingles',
              client_name: 'Jane Doe',
              quoted_amount: 12000,
              deleted_at: null,
            },
          ],
          accounts: [
            {
              id: accountId,
              business_name: 'Summit Builders LLC',
              mailing_address: '100 Main St, Royal Oak, MI',
            },
          ],
          sites: [
            {
              account_id: accountId,
              company_name: 'Summit Builders LLC',
              phone: '248-555-0100',
              license: 'MI-123456',
            },
          ],
          contractor_credentials: [],
        },
        true, // useStrictThenable: queries return PromiseLike without .catch
      );

      // Must complete without throwing "query.catch is not a function"
      const appData = await compilePermitApplication(fakeClient as any, accountId, jobId);
      expect(appData).toBeDefined();
      expect(appData.applicant.companyName).toBe('Summit Builders LLC');
      expect(appData.property.city).toBe('Royal Oak');
    });
  });

  describe('2. Un-mocked compilePermitApplication Integration', () => {
    it('runs against in-memory empty tables, populates missing fields, and never queries phantom tables', async () => {
      const fakeClient = createFakeSupabase({
        jobs: [
          {
            id: jobId,
            account_id: accountId,
            address: '500 Woodward Ave, Detroit, MI 48226',
            scope: 'roofing replacement',
            client_name: null,
            quoted_amount: null,
            deleted_at: null,
          },
        ],
        accounts: [
          {
            id: accountId,
            business_name: 'Apex Roofing LLC',
            mailing_address: null,
            insurance_carrier: null,
            insurance_policy_number: null,
            fein: null,
            state_employer_number: null,
            license_type: null,
          },
        ],
        sites: [],
        contractor_credentials: [],
      });

      const appData = await compilePermitApplication(fakeClient as any, accountId, jobId);

      // Readiness must be incomplete due to missing required fields
      expect(appData.readiness.complete).toBe(false);
      expect(appData.readiness.missing.length).toBeGreaterThan(0);
      expect(appData.readiness.missing).toContain('State Builder License #');
      expect(appData.readiness.missing).toContain('General Liability Insurance Carrier');

      // Phantom table must never be queried
      expect(fakeClient.queriedTables.has('contractor_compliance_profile')).toBe(false);
    });
  });

  describe('3. Table Existence Audit in schema.sql', () => {
    function getAllTsFiles(dir: string): string[] {
      const results: string[] = [];
      const list = readdirSync(dir);
      for (const file of list) {
        const fullPath = join(dir, file);
        const stat = statSync(fullPath);
        if (stat.isDirectory()) {
          results.push(...getAllTsFiles(fullPath));
        } else if (file.endsWith('.ts') || file.endsWith('.tsx')) {
          results.push(fullPath);
        }
      }
      return results;
    }

    it('asserts every table referenced via .from() in src/lib/permit-intel/ exists in schema.sql', () => {
      const permitIntelDir = join(process.cwd(), 'src/lib/permit-intel');
      const files = getAllTsFiles(permitIntelDir);
      const referencedTables = new Set<string>();

      const tableRegex = /\.from\(\s*['"]([a-zA-Z0-9_]+)['"]\s*\)/g;

      for (const file of files) {
        const content = readFileSync(file, 'utf8');
        let match: RegExpExecArray | null;
        while ((match = tableRegex.exec(content)) !== null) {
          referencedTables.add(match[1]);
        }
      }

      // Must have discovered real tables
      expect(referencedTables.size).toBeGreaterThan(0);

      // Phantom table must NOT be in referencedTables
      expect(referencedTables.has('contractor_compliance_profile')).toBe(false);

      const schemaSql = readFileSync(join(process.cwd(), 'schema.sql'), 'utf8');

      for (const table of referencedTables) {
        const tablePattern = new RegExp(
          `(?:create\\s+table(?:\\s+if\\s+not\\s+exists)?\\s+(?:public\\.)?|alter\\s+table\\s+(?:public\\.)?)${table}\\b`,
          'i',
        );
        const existsInSchema = tablePattern.test(schemaSql);
        expect(
          existsInSchema,
          `Table "${table}" referenced in permit-intel is missing from schema.sql`,
        ).toBe(true);
      }
    });
  });

  describe('4. Anti-Fabrication Safeguards', () => {
    it('compiled application output does not contain any forbidden sample literals', async () => {
      const fakeClient = createFakeSupabase({
        jobs: [
          {
            id: jobId,
            account_id: accountId,
            address: '100 North St, Ann Arbor, MI 48104',
            scope: 'commercial roof replacement',
            client_name: 'Legit Client',
            quoted_amount: 25000,
            deleted_at: null,
          },
        ],
        accounts: [
          {
            id: accountId,
            business_name: 'Certified Roofers Co',
            fein: '38-9999999',
            state_employer_number: '00-9999999',
            license_type: 'State Builder',
          },
        ],
        sites: [],
        contractor_credentials: [],
      });

      const appData = await compilePermitApplication(fakeClient as any, accountId, jobId);
      const appJson = JSON.stringify(appData);
      const appHtml = generatePermitApplicationHtml(appData);

      for (const literal of FORBIDDEN_SAMPLE_LITERALS) {
        expect(appJson, `JSON output contains forbidden literal: ${literal}`).not.toContain(literal);
        expect(appHtml, `HTML output contains forbidden literal: ${literal}`).not.toContain(literal);
      }
    });

    it('COI generator fails-closed instead of fabricating coverage when absent', () => {
      expect(() =>
        generateMunicipalCoi({
          contractor: {
            companyName: 'True Builder LLC',
          },
          municipality: {
            authorityName: 'City of Detroit',
            city: 'Detroit',
            state: 'MI',
          },
        }),
      ).toThrow(CoverageDataMissingError);
    });

    it('COI generated certificate and HTML markup never emit forbidden sample literals', () => {
      const coi = generateMunicipalCoi({
        contractor: {
          companyName: 'True Builder LLC',
          generalLiabilityCarrier: 'Liberty Mutual Insurance',
          generalLiabilityPolicyNumber: 'LMI-0019284',
          workersCompCarrier: 'State Accident Fund of Michigan',
          workersCompPolicyNumber: 'SAF-5544332',
          licenseNumber: 'BLD-998811',
        },
        municipality: {
          authorityName: 'City of Detroit',
          city: 'Detroit',
          state: 'MI',
        },
      });

      const coiJson = JSON.stringify(coi);
      const coiHtml = generateCoiHtml(coi);

      for (const literal of FORBIDDEN_SAMPLE_LITERALS) {
        expect(coiJson, `COI JSON contains forbidden literal: ${literal}`).not.toContain(literal);
        expect(coiHtml, `COI HTML contains forbidden literal: ${literal}`).not.toContain(literal);
      }
    });

    it('source files in permit-intel and permits route do not contain forbidden sample literals', () => {
      const filesToCheck = [
        'src/lib/permit-intel/application-generator.ts',
        'src/lib/permit-intel/coi-generator.ts',
        'src/app/api/permits/coi/route.ts',
      ];

      for (const file of filesToCheck) {
        const content = readFileSync(join(process.cwd(), file), 'utf8');
        for (const literal of FORBIDDEN_SAMPLE_LITERALS) {
          expect(
            content,
            `File ${file} contains forbidden hardcoded sample literal: ${literal}`,
          ).not.toContain(literal);
        }
      }
    });
  });
});
