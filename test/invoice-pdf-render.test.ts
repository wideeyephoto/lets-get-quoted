import { describe, expect, it } from 'vitest';
import { generateInvoicePdf } from '@/emails/InvoicePdf';

describe('generateInvoicePdf', () => {
  it('generates a valid PDF buffer with proper magic header', async () => {
    const pdfBuffer = await generateInvoicePdf({
      businessName: 'Apex Roofing & Solar',
      invoiceRef: 'INV-2026-001',
      clientName: 'Sarah Connor',
      jobRef: 'JOB-9041',
      subtotal: 4500.0,
      discountPercent: 10,
      discountAmount: 450.0,
      taxRate: 6,
      taxAmount: 243.0,
      total: 4293.0,
      items: [
        { description: 'Roof inspection and tear-off', amount: 1500.0 },
        { description: 'Architectural shingles installation', amount: 3000.0 },
      ],
    });

    expect(pdfBuffer).toBeInstanceOf(Buffer);
    expect(pdfBuffer.length).toBeGreaterThan(1000);
    // Check for PDF magic header '%PDF-'
    const magicHeader = pdfBuffer.subarray(0, 5).toString('ascii');
    expect(magicHeader).toBe('%PDF-');
  });

  it('handles simple invoice without tax or discount', async () => {
    const pdfBuffer = await generateInvoicePdf({
      businessName: 'Precision Plumbing LLC',
      invoiceRef: 'INV-552',
      clientName: 'Michael Scott',
      jobRef: 'JOB-102',
      total: 250.0,
      items: [{ description: 'Emergency drain clearing', amount: 250.0 }],
    });

    expect(pdfBuffer).toBeInstanceOf(Buffer);
    expect(pdfBuffer.length).toBeGreaterThan(500);
    expect(pdfBuffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
  });

  it('renders multi-item long invoice without throwing', async () => {
    const items = Array.from({ length: 15 }, (_, i) => ({
      description: `Custom carpentry line item #${i + 1}`,
      amount: 150.0 + i * 25,
    }));

    const subtotal = items.reduce((sum, item) => sum + item.amount, 0);
    const pdfBuffer = await generateInvoicePdf({
      businessName: 'Mastercraft Woodworks',
      invoiceRef: 'INV-LONG-88',
      clientName: 'David Wallace',
      jobRef: 'JOB-770',
      subtotal,
      total: subtotal,
      items,
    });

    expect(pdfBuffer).toBeInstanceOf(Buffer);
    expect(pdfBuffer.length).toBeGreaterThan(1500);
    expect(pdfBuffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
  });
});
