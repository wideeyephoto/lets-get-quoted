import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Estimate Generator Page Permit & Code Embed', () => {
  const pagePath = path.resolve(__dirname, '../src/app/tools/estimate-generator/page.tsx');
  const pageCode = fs.readFileSync(pagePath, 'utf8');

  it('includes live municipal permit & code analyzer state and queries', () => {
    expect(pageCode).toContain('permitData');
    expect(pageCode).toContain('/api/permits/public-estimate');
    expect(pageCode).toContain('selectedTrade');
  });

  it('renders trade discipline selectors and permit status badges', () => {
    expect(pageCode).toContain('Trade Discipline:');
    expect(pageCode).toContain('City Permit Required');
    expect(pageCode).toContain('Est. Municipal Fee:');
    expect(pageCode).toContain('+ Add Permit to Estimate');
  });

  it('supports adding Permit type line item with fee calculation', () => {
    expect(pageCode).toContain('addPermitItemToEstimate');
    expect(pageCode).toContain('<option value="Permit">Permit</option>');
  });
});
