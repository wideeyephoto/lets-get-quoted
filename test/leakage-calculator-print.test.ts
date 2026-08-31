import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { generateLeakagePdf } from '@/lib/tools/leakage-pdf';
import { POST as leakagePdfRoute } from '@/app/api/tools/leakage-pdf/route';

describe('Profit Leakage Calculator Print Styles & PDF Export Integrity', () => {
  const cssPath = path.resolve(__dirname, '../src/app/tools/tools.module.css');
  const cssSource = fs.readFileSync(cssPath, 'utf8');

  it('enforces exact @media print rules so .printOnlyReport is visible and .screenOnly is hidden', () => {
    const printBlockMatch = cssSource.match(/@media print\s*\{([\s\S]*?)(?=\n\/\*|\n\.[a-zA-Z]|\n@media|$)/);
    expect(printBlockMatch).toBeTruthy();
    const printBlock = printBlockMatch![1];

    expect(printBlock).toContain('size: letter portrait;');
    expect(printBlock).toMatch(/\.screenOnly\s*\{[^}]*display:\s*none\s*!important;/);
    expect(printBlock).toMatch(/\.printOnly\s*\{[^}]*display:\s*block\s*!important;/);
    expect(printBlock).toMatch(/\.printOnlyReport\s*\{[^}]*display:\s*block\s*!important;/);
  });

  it('generates a valid, deterministic vector PDF buffer for standard audit inputs', async () => {
    const sampleData = {
      revenue: 350000,
      unbilledScopePct: 6,
      supplyHouseHours: 4,
      hourlyBillingRate: 95,
      checkTripsPerMonth: 6,
      contractorName: 'Acme Construction',
      referenceNumber: 'AUD-2026-LEAK',
      reportDate: 'Aug 31, 2026',
    };

    const sampleCalculations = {
      annualScopeLoss: 21000,
      annualSupplyHouseLoss: 19000,
      annualCheckChasingLoss: 12060,
      annualCashFlowCost: 8750,
      totalAnnualLeakage: 60810,
      recoverableWithLGQ: 51688.5,
    };

    const pdfBuffer = await generateLeakagePdf(sampleData, sampleCalculations);
    expect(pdfBuffer).toBeInstanceOf(Buffer);
    expect(pdfBuffer.length).toBeGreaterThan(1000);

    // Verify PDF header magic bytes '%PDF'
    const pdfHeader = pdfBuffer.subarray(0, 4).toString('ascii');
    expect(pdfHeader).toBe('%PDF');

    // Count pages in generated PDF: should be exactly 1 page
    const rawPdf = pdfBuffer.toString('latin1');
    const pageMatches = rawPdf.match(/\/Type\s*\/Page\b/g) || [];
    expect(pageMatches.length).toBe(1);
  });

  it('handles /api/tools/leakage-pdf POST requests with attachment headers', async () => {
    const request = new Request('http://localhost:3010/api/tools/leakage-pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data: {
          revenue: 500000,
          unbilledScopePct: 5,
          supplyHouseHours: 5,
          hourlyBillingRate: 100,
          checkTripsPerMonth: 8,
        },
      }),
    });

    const response = await leakagePdfRoute(request);
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('application/pdf');
    expect(response.headers.get('Content-Disposition')).toContain('attachment; filename=');
    expect(response.headers.get('Content-Disposition')).toContain('Contractor-Profit-Leakage-Audit.pdf');

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    expect(buffer.subarray(0, 4).toString('ascii')).toBe('%PDF');
  });
});
