import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { generateEstimatePdf } from '@/lib/tools/estimate-pdf';
import { getInitialExampleEstimate, calculateEstimateTotals } from '@/lib/tools/estimate-generator-utils';
import { POST as estimatePdfRoute } from '@/app/api/tools/estimate-pdf/route';

describe('Estimate Generator Print Styles & PDF Export Integrity', () => {
  const cssPath = path.resolve(__dirname, '../src/app/tools/tools.module.css');
  const cssSource = fs.readFileSync(cssPath, 'utf8');

  it('enforces exact @media print rules for 1-page letter output', () => {
    // Assert @media print block exists and contains all required hotfix rules
    const printBlockMatch = cssSource.match(/@media print\s*\{([\s\S]*?)(?=\n\/\*|\n\.[a-zA-Z]|\n@media|$)/);
    expect(printBlockMatch).toBeTruthy();
    const printBlock = printBlockMatch![1];

    expect(printBlock).toContain('size: letter portrait;');
    expect(printBlock).toContain('margin: 0.35in;');
    expect(printBlock).toMatch(/\.screenOnly\s*\{[^}]*display:\s*none\s*!important;/);
    expect(printBlock).toMatch(/\.printOnly\s*\{[^}]*display:\s*block\s*!important;/);
    expect(printBlock).toMatch(/\.page\s*\{[^}]*background:\s*#fff\s*!important;/);
    expect(printBlock).toMatch(/\.page\s*\{[^}]*color:\s*#0f172a\s*!important;/);
    expect(printBlock).toMatch(/\.hero/);
    expect(printBlock).toMatch(/\.editorHeaderBar/);
    expect(printBlock).toMatch(/\.sampleBanner/);
    expect(printBlock).toMatch(/\.actionBtnRow/);
    expect(printBlock).toMatch(/\.printActions/);
    expect(printBlock).toMatch(/\.postActionCta/);
    expect(printBlock).toMatch(/\.seoSection/);
    expect(printBlock).toMatch(/\.permitBox/);
  });

  it('generates a valid, deterministic PDF buffer for the standard example estimate', async () => {
    const sample = getInitialExampleEstimate();
    const totals = calculateEstimateTotals(
      sample.items,
      sample.taxRate,
      sample.depositPct,
      sample.discountAmount
    );

    const pdfBuffer = await generateEstimatePdf(sample, totals);
    expect(pdfBuffer).toBeInstanceOf(Buffer);
    expect(pdfBuffer.length).toBeGreaterThan(1000);

    // Verify PDF header magic bytes '%PDF'
    const pdfHeader = pdfBuffer.subarray(0, 4).toString('ascii');
    expect(pdfHeader).toBe('%PDF');

    // Count pages in generated PDF: sample estimate (3 items) should be exactly 1 page
    const rawPdf = pdfBuffer.toString('latin1');
    const pageMatches = rawPdf.match(/\/Type\s*\/Page\b/g) || [];
    expect(pageMatches.length).toBe(1);
  });

  it('handles /api/tools/estimate-pdf POST requests with attachment headers', async () => {
    const sample = getInitialExampleEstimate();
    const totals = calculateEstimateTotals(
      sample.items,
      sample.taxRate,
      sample.depositPct,
      sample.discountAmount
    );

    const request = new Request('http://localhost:3010/api/tools/estimate-pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estimate: sample, totals }),
    });

    const response = await estimatePdfRoute(request);
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('application/pdf');
    expect(response.headers.get('Content-Disposition')).toContain('attachment; filename=');
    expect(response.headers.get('Content-Disposition')).toContain('EST-2026-104');

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    expect(buffer.subarray(0, 4).toString('ascii')).toBe('%PDF');
  });
});
