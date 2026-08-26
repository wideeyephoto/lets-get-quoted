import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Estimate Generator Page Permit & Code Embed', () => {
  const pagePath = path.resolve(__dirname, '../src/app/tools/estimate-generator/page.tsx');
  const clientPath = path.resolve(__dirname, '../src/app/tools/estimate-generator/EstimateGeneratorClient.tsx');
  const pageCode = fs.readFileSync(pagePath, 'utf8');
  const clientCode = fs.readFileSync(clientPath, 'utf8');

  it('renders the EstimateGeneratorClient component from the server page', () => {
    expect(pageCode).toContain('EstimateGeneratorClient');
    expect(pageCode).toContain('canonical: \'https://letsgetquoted.com/tools/estimate-generator\'');
  });

  it('includes live municipal permit & code analyzer state and queries', () => {
    expect(clientCode).toContain('permitData');
    expect(clientCode).toContain('/api/permits/public-estimate');
    expect(clientCode).toContain('selectedTrade');
  });

  it('renders trade discipline selectors and permit status badges', () => {
    expect(clientCode).toContain('Trade Discipline:');
    expect(clientCode).toContain('City Permit Required');
    expect(clientCode).toContain('Est. Municipal Fee:');
    expect(clientCode).toContain('+ Add Permit to Estimate');
  });

  it('supports adding Permit type line item with fee calculation', () => {
    expect(clientCode).toContain('addPermitItemToEstimate');
    expect(clientCode).toContain('<option value="Permit">Permit</option>');
  });
});
