import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

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

const FORBIDDEN_LITERALS = [
  '2101234567',
  'CPP-9402194',
  'WC-094124-MI',
  '25-15-200-014',
  '38-9876543',
  '00-1234567',
  'GL-8849201',
  'WC-9940122',
  'permits@contractor.com',
  '25-14-302-019',
  'Oak Ridge Estates Lot 42',
  'MI-BLD-2101234567',
  'TRV-8849201',
  'ME-778291',
  'MP-662910',
  'owner@example.com',
  'Cincinnati Insurance Company',
  'Accident Fund Insurance Co of America',
];

const FORBIDDEN_REGEX_PATTERNS = [
  { label: 'Hardcoded 10-digit credential', pattern: /\b2101234567\b/ },
  { label: 'Hardcoded sample policy number', pattern: /(?:CPP-9402194|WC-094124-MI|GL-8849201|WC-9940122|TRV-8849201)\b/ },
  { label: 'Hardcoded sample parcel number', pattern: /(?:25-15-200-014|25-14-302-019)\b/ },
  { label: 'Hardcoded sample tax ID/FEIN', pattern: /(?:38-9876543|00-1234567)\b/ },
];

describe('Permit Placeholder Literals & Credentials Audit Guardrail', () => {
  const permitIntelFiles = getAllTsFiles(join(process.cwd(), 'src/lib/permit-intel'));

  it('scans all src/lib/permit-intel files and verifies zero forbidden sample literals exist in code', () => {
    expect(permitIntelFiles.length).toBeGreaterThan(5);

    const violations: string[] = [];

    for (const filePath of permitIntelFiles) {
      const content = readFileSync(filePath, 'utf8');
      for (const literal of FORBIDDEN_LITERALS) {
        if (content.includes(literal)) {
          violations.push(`${filePath} contains forbidden literal: "${literal}"`);
        }
      }

      for (const { label, pattern } of FORBIDDEN_REGEX_PATTERNS) {
        if (pattern.test(content)) {
          violations.push(`${filePath} matches forbidden pattern (${label}): ${pattern}`);
        }
      }
    }

    expect(
      violations,
      `Found forbidden placeholder literals in permit-intel codebase:\n${violations.join('\n')}`,
    ).toEqual([]);
  });

  it('verifies permit API routes do not contain hardcoded sample credentials or contractor fallbacks', () => {
    const apiFiles = [
      join(process.cwd(), 'src/app/api/permits/autofill/route.ts'),
      join(process.cwd(), 'src/app/api/permits/coi/route.ts'),
    ];

    for (const file of apiFiles) {
      const content = readFileSync(file, 'utf8');
      for (const literal of FORBIDDEN_LITERALS) {
        expect(content, `${file} must not contain forbidden literal: ${literal}`).not.toContain(literal);
      }
    }
  });
});
