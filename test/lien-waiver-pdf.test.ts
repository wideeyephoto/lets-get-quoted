import { describe, expect, it } from 'vitest';
import { generateLienWaiverDocument } from '@/lib/lien-waiver';
import { generateLienWaiverPdf } from '@/lib/lien-waiver-pdf';

describe('generateLienWaiverPdf', () => {
  it('generates a valid PDF buffer with proper magic header', async () => {
    const waiver = generateLienWaiverDocument({
      type: 'unconditional_progress',
      claimantName: 'Custom Craft Builders',
      customerName: 'Eleanor Vance',
      jobRef: 'JOB-4412',
      propertyAddress: '100 Oak Ridge Rd, Livingston, NJ',
      paymentAmount: 5200.75,
      throughDate: '2026-08-25',
    });

    const pdfBuffer = await generateLienWaiverPdf(waiver);

    expect(pdfBuffer).toBeInstanceOf(Buffer);
    expect(pdfBuffer.length).toBeGreaterThan(500);
    // Check for PDF magic header '%PDF-'
    const magicHeader = pdfBuffer.subarray(0, 5).toString('ascii');
    expect(magicHeader).toBe('%PDF-');
  });
});
