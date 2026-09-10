import { describe, it, expect } from 'vitest';
import {
  generateCardQrSvg,
  generateCardQrDataUrl,
  generateCardQrRawBuffer,
  verifyQrDecode,
} from '@/lib/merchandise/card-qr';
import {
  renderCardArtwork,
  computeArtworkHash,
  type CardDesignDocument,
} from '@/lib/merchandise/card-renderer';
import {
  runCardPreflightCheck,
  sanitizeSvgContent,
} from '@/lib/merchandise/card-preflight';

describe('Batch C: Artwork Pipeline & Real QR Validation', () => {
  const sampleDoc: CardDesignDocument = {
    version: 1,
    templateId: 'clean',
    content: {
      businessName: 'Apex Roofing & Restoration',
      trade: 'Roofing Contractor',
      tagline: 'Precision Commercial & Residential Roofing',
      phone: '(303) 555-0199',
      website: 'www.apexroofingpro.com',
      email: 'quotes@apexroofingpro.com',
      license: 'CO-RC-94820',
    },
    colors: {
      accentColor: '#0284c7',
    },
    qr: {
      destinationUrl: 'https://letsgetquoted.com/r/apex-booking-2026',
      actionText: 'Scan to request a quote',
    },
  };

  describe('Real URL-Encoding QR Generation & Optical Decoding', () => {
    it('generates valid SVG with quiet zone', async () => {
      const svg = await generateCardQrSvg('https://letsgetquoted.com/r/apex-roofing', {
        sizePx: 250,
        margin: 4,
      });

      expect(svg).toContain('<svg');
      expect(svg).toContain('viewBox');
      expect(svg).toContain('</svg>');
    });

    it('generates valid PNG data URL', async () => {
      const dataUrl = await generateCardQrDataUrl('https://letsgetquoted.com/r/apex-roofing');
      expect(dataUrl).toMatch(/^data:image\/png;base64,/);
    });

    it('optically decodes generated QR buffer and retrieves exact URL with jsQR', async () => {
      const targetUrl = 'https://letsgetquoted.com/r/apex-booking-2026';
      const raw = await generateCardQrRawBuffer(targetUrl, 200, 4);

      expect(raw.data.length).toBe(raw.width * raw.height * 4);

      const decodeRes = verifyQrDecode(raw.data, raw.width, raw.height);
      expect(decodeRes.ok).toBe(true);
      expect(decodeRes.decodedUrl).toBe(targetUrl);
    });

    it('fails safely when given blank or corrupted pixel data', () => {
      const blankBuffer = new Uint8ClampedArray(100 * 100 * 4); // all zeroes
      const decodeRes = verifyQrDecode(blankBuffer, 100, 100);
      expect(decodeRes.ok).toBe(false);
      expect(decodeRes.error).toContain('could not be decoded');
    });
  });

  describe('Canonical Artwork Renderer (renderCardArtwork)', () => {
    it('renders Clean template with 1125 x 675 bleed dimensions and valid checksums', async () => {
      const qrSvg = await generateCardQrSvg(sampleDoc.qr.destinationUrl);
      const docWithQr = {
        ...sampleDoc,
        qr: { ...sampleDoc.qr, qrSvg },
      };

      const rendered = renderCardArtwork(docWithQr);

      expect(rendered.dimensions.pixelWidth).toBe(1125);
      expect(rendered.dimensions.pixelHeight).toBe(675);

      // Front checks
      expect(rendered.frontSvg).toContain('viewBox="0 0 1125 675"');
      expect(rendered.frontSvg).toContain('Apex Roofing &amp; Restoration');
      expect(rendered.frontSvg).toContain('(303) 555-0199');
      expect(rendered.frontSvg).toContain('CO-RC-94820');

      // Back checks
      expect(rendered.backSvg).toContain('viewBox="0 0 1125 675"');
      expect(rendered.backSvg).toContain('SCAN TO REQUEST A QUOTE');

      // Checksums
      expect(rendered.frontHash).toHaveLength(64);
      expect(rendered.backHash).toHaveLength(64);
      expect(rendered.frontHash).toBe(computeArtworkHash(rendered.frontSvg));
    });

    it('renders Bold template with high contrast color blocks', async () => {
      const boldDoc: CardDesignDocument = {
        ...sampleDoc,
        templateId: 'bold',
        colors: { accentColor: '#b91c1c' },
      };

      const rendered = renderCardArtwork(boldDoc);

      expect(rendered.frontSvg).toContain('fill="#b91c1c"');
      expect(rendered.frontSvg).toContain('Apex Roofing &amp; Restoration');
      expect(rendered.backSvg).toContain('fill="#0f172a"');
      expect(rendered.frontHash).toBeDefined();
    });

    it('renders Booking template focused on prominent QR and direct callout', async () => {
      const bookingDoc: CardDesignDocument = {
        ...sampleDoc,
        templateId: 'booking',
        colors: { accentColor: '#16a34a' },
      };

      const rendered = renderCardArtwork(bookingDoc);

      expect(rendered.frontSvg).toContain('FAST QUOTES &amp; DIRECT BOOKING');
      expect(rendered.backSvg).toContain('SCAN TO REQUEST A QUOTE');
    });

    it('strictly avoids printing fake ratings, review counts, or invented credentials', () => {
      const rendered = renderCardArtwork(sampleDoc);

      // Verify no manufactured claims exist in the artwork
      expect(rendered.frontSvg).not.toContain('★');
      expect(rendered.frontSvg).not.toContain('reviews');
      expect(rendered.frontSvg).not.toContain('Master Builder');
      expect(rendered.backSvg).not.toContain('★');
      expect(rendered.backSvg).not.toContain('reviews');
    });
  });

  describe('Preflight Quality Control (runCardPreflightCheck)', () => {
    it('passes for a complete, valid contractor design document', async () => {
      const result = await runCardPreflightCheck(sampleDoc);

      expect(result.ok).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.details.businessNameValid).toBe(true);
      expect(result.details.phoneValid).toBe(true);
      expect(result.details.qrDecodable).toBe(true);
      expect(result.details.decodedQrUrl).toBe(sampleDoc.qr.destinationUrl);
    });

    it('blocks cards with missing or too-short business name', async () => {
      const invalidDoc: CardDesignDocument = {
        ...sampleDoc,
        content: { ...sampleDoc.content, businessName: 'A' },
      };

      const result = await runCardPreflightCheck(invalidDoc);
      expect(result.ok).toBe(false);
      expect(result.errors).toContain('Business name must be between 2 and 80 characters.');
    });

    it('blocks cards with invalid phone numbers', async () => {
      const invalidDoc: CardDesignDocument = {
        ...sampleDoc,
        content: { ...sampleDoc.content, phone: '123' },
      };

      const result = await runCardPreflightCheck(invalidDoc);
      expect(result.ok).toBe(false);
      expect(result.errors).toContain('A valid 10-digit telephone number is required.');
    });

    it('blocks cards with invalid QR URLs', async () => {
      const invalidDoc: CardDesignDocument = {
        ...sampleDoc,
        qr: { destinationUrl: 'javascript:alert(1)' },
      };

      const result = await runCardPreflightCheck(invalidDoc);
      expect(result.ok).toBe(false);
      expect(result.errors).toContain('QR destination must be a valid HTTP or HTTPS web address.');
    });

    it('sanitizes SVG logo uploads and rejects malicious script tags or external resources', () => {
      const evilScriptSvg = '<svg><script>alert("xss")</script><rect width="10" height="10"/></svg>';
      expect(sanitizeSvgContent(evilScriptSvg).safe).toBe(false);

      const evilHrefSvg = '<svg><image href="http://evil.com/steal.png"/></svg>';
      expect(sanitizeSvgContent(evilHrefSvg).safe).toBe(false);

      const safeSvg = '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="#0284c7"/></svg>';
      expect(sanitizeSvgContent(safeSvg).safe).toBe(true);
    });
  });
});
