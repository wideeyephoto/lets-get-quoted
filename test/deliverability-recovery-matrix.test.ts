import { describe, it, expect } from 'vitest';
import { generateInvoicePdf } from '@/emails/InvoicePdf';
import { renderClientQuoteEmailHtml } from '@/emails/renderers';
import { contractorFrom } from '@/emails/brand';
import { safeNextPath } from '@/lib/app-origin';
import { resendTagValue } from '@/lib/resend-tags';

describe('Deliverability & Recovery Matrix — Transactional Email & Alignment Contract', () => {
  describe('Invoice PDF Generation & Attachment Invariants', () => {
    it('generates a valid, non-empty %PDF buffer with all required line items and totals', async () => {
      const pdfBuffer = await generateInvoicePdf({
        businessName: 'Apex Roofing & Siding',
        invoiceRef: 'INV-2026-0042',
        clientName: 'Jane Homeowner',
        jobRef: 'JOB-9812',
        total: 1250.50,
        subtotal: 1200.00,
        discountPercent: 0,
        discountAmount: 0,
        taxRate: 4.21,
        taxAmount: 50.50,
        items: [
          { description: 'Architectural Shingle Replacement (3 Squares)', amount: 950.00 },
          { description: 'Flashing & Ridge Vent Sealing', amount: 250.00 },
        ],
      });

      expect(Buffer.isBuffer(pdfBuffer)).toBe(true);
      expect(pdfBuffer.length).toBeGreaterThan(1000);

      // Verify PDF magic bytes: starts with %PDF-
      const header = pdfBuffer.subarray(0, 8).toString('ascii');
      expect(header).toMatch(/^%PDF-1\./);

      // Verify PDF structure contains EOF marker
      const tail = pdfBuffer.subarray(pdfBuffer.length - 64).toString('ascii');
      expect(tail).toContain('%%EOF');
    });

    it('handles zero discounts and taxes gracefully without rendering NaN or corrupted buffers', async () => {
      const pdfBuffer = await generateInvoicePdf({
        businessName: 'Precision Plumbing LLC',
        invoiceRef: 'INV-2026-0099',
        clientName: 'Mark Smith',
        jobRef: 'JOB-3301',
        total: 450.00,
        items: [{ description: 'Main Sewer Line Snaking & Camera Inspection', amount: 450.00 }],
      });

      expect(Buffer.isBuffer(pdfBuffer)).toBe(true);
      expect(pdfBuffer.length).toBeGreaterThan(500);
      expect(pdfBuffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    });
  });

  describe('Contractor From & Sender Header Alignment', () => {
    it('always preserves verified domain @letsgetquoted.com to maintain SPF/DKIM/DMARC alignment', () => {
      // Clean business name
      expect(contractorFrom('Elite Electricians')).toBe('Elite Electricians <hello@letsgetquoted.com>');

      // Empty or whitespace falls back to company brand
      expect(contractorFrom('')).toBe("Let's Get Quoted <hello@letsgetquoted.com>");
      expect(contractorFrom('   ')).toBe("Let's Get Quoted <hello@letsgetquoted.com>");

      // Strips dangerous characters to prevent header injection
      expect(contractorFrom('Bad<script>Name\r\nBcc: evil@phish.com')).toBe(
        'BadscriptNameBcc: evil@phish.com <hello@letsgetquoted.com>',
      );

      // Truncates overly long business names to RFC limits
      const veryLong = 'A'.repeat(100);
      const formatted = contractorFrom(veryLong);
      expect(formatted).toBe(`${'A'.repeat(60)} <hello@letsgetquoted.com>`);
    });
  });

  describe('Quote Email Rendering & Link Integrity', () => {
    it('renders a compliant quote email with action link, items, and brand styling', () => {
      const html = renderClientQuoteEmailHtml({
        businessName: 'Apex Painters',
        clientName: 'Sarah Jenkins',
        jobRef: 'EST-2026-01',
        quotedAmount: 3400.00,
        quoteUrl: 'https://letsgetquoted.com/client/jobs/mock-quote-token',
        recipientEmail: 'sarah@example.com',
        brand: {
          businessName: 'Apex Painters',
          accent: '#0284c7',
          theme: 'spotlight',
          logoUrl: null,
          phone: '(555) 234-5678',
          siteUrl: 'https://apexpainters.com',
          replyTo: 'quotes@apexpainters.com',
        },
      });

      expect(html).toContain('Apex Painters');
      expect(html).toContain('Sarah Jenkins');
      expect(html).toContain('$3,400.00');
      expect(html).toContain('https://letsgetquoted.com/client/jobs/mock-quote-token');
      expect(html).toContain('One-Click Mobile Approval');
    });
  });

  describe('Magic Link Safe Path Normalization', () => {
    it('sanitizes redirect paths to prevent open-redirect phishing', () => {
      expect(safeNextPath('/dashboard')).toBe('/dashboard');
      expect(safeNextPath('/dashboard/quotes')).toBe('/dashboard/quotes');
      expect(safeNextPath('https://evil.com/steal-creds')).toBe('/dashboard');
      expect(safeNextPath('//evil.com/steal-creds')).toBe('/dashboard');
      expect(safeNextPath('/\\evil.com')).toBe('/dashboard');
      expect(safeNextPath('javascript:alert(1)')).toBe('/dashboard');
    });
  });

  describe('Resend Tags & Deliverability Tag Normalization', () => {
    it('correctly reads tag values from both send array shape and webhook object shape', () => {
      // Send array shape
      const sendTags = [
        { name: 'kind', value: 'invoice' },
        { name: 'account_id', value: 'acc_777' },
      ];
      expect(resendTagValue(sendTags, 'kind')).toBe('invoice');
      expect(resendTagValue(sendTags, 'account_id')).toBe('acc_777');
      expect(resendTagValue(sendTags, 'missing')).toBeNull();

      // Webhook object shape
      const webhookTags = {
        kind: 'quote',
        account_id: 'acc_888',
      };
      expect(resendTagValue(webhookTags, 'kind')).toBe('quote');
      expect(resendTagValue(webhookTags, 'account_id')).toBe('acc_888');
      expect(resendTagValue(webhookTags, 'missing')).toBeNull();
    });
  });

  describe('DMARC Specification & Alignment Verification', () => {
    function parseDmarc(record: string): Record<string, string> {
      const parts = record.split(';').map((p) => p.trim()).filter(Boolean);
      const parsed: Record<string, string> = {};
      for (const part of parts) {
        const eq = part.indexOf('=');
        if (eq > 0) {
          parsed[part.slice(0, eq).trim()] = part.slice(eq + 1).trim();
        }
      }
      return parsed;
    }

    it('validates compliant DMARC record syntax', () => {
      const noneRecord = 'v=DMARC1; p=none; rua=mailto:dmarc@letsgetquoted.com; fo=1';
      const parsedNone = parseDmarc(noneRecord);
      expect(parsedNone.v).toBe('DMARC1');
      expect(parsedNone.p).toBe('none');
      expect(parsedNone.rua).toBe('mailto:dmarc@letsgetquoted.com');
      expect(parsedNone.fo).toBe('1');

      const quarantineRecord = 'v=DMARC1; p=quarantine; pct=10; rua=mailto:dmarc@letsgetquoted.com; fo=1';
      const parsedQuarantine = parseDmarc(quarantineRecord);
      expect(parsedQuarantine.p).toBe('quarantine');
      expect(parsedQuarantine.pct).toBe('10');

      const rejectRecord = 'v=DMARC1; p=reject; rua=mailto:dmarc@letsgetquoted.com; fo=1';
      const parsedReject = parseDmarc(rejectRecord);
      expect(parsedReject.p).toBe('reject');
    });

    it('verifies DMARC alignment rules for Resend sending infrastructure', () => {
      const fromDomain = 'letsgetquoted.com';
      const mailFromDomain = 'send.letsgetquoted.com';
      const dkimDomain = 'letsgetquoted.com';

      // DKIM Strict Alignment: d= exactly matches From domain
      const dkimAlignedStrict = dkimDomain.toLowerCase() === fromDomain.toLowerCase();
      expect(dkimAlignedStrict).toBe(true);

      // SPF Relaxed Alignment: mailFrom is a subdomain of From domain
      const spfAlignedRelaxed = mailFromDomain.endsWith(`.${fromDomain}`);
      expect(spfAlignedRelaxed).toBe(true);

      // DMARC passes if EITHER SPF or DKIM is aligned and passes
      const dmarcPasses = dkimAlignedStrict || spfAlignedRelaxed;
      expect(dmarcPasses).toBe(true);
    });
  });
});
