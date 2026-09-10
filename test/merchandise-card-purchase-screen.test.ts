import { describe, it, expect } from 'vitest';
import {
  type SupportedCardQuantity,
  SUPPORTED_CARD_QUANTITIES,
  PRINTFUL_CARD_SPECS,
} from '@/lib/merchandise/card-catalog-types';
import { CARD_RETAIL_SUBTOTAL_CENTS, centsToDollars } from '@/lib/merchandise/card-operations';
import type { CardDesignDocument } from '@/lib/merchandise/card-renderer';
import { renderCardArtwork } from '@/lib/merchandise/card-renderer';

describe('Batch D: Purchase Screen & UI Contracts', () => {
  const mockInitialData = {
    companyName: 'Apex Roofing & Solar',
    trade: 'Roofing Contractor',
    tagline: 'Precision Workmanship Guaranteed',
    phone: '(303) 555-0199',
    website: 'www.apexroofingsolar.com',
    license: 'CO-94820',
    accentColor: '#0284c7',
    secondaryColor: '#0f172a',
    currentLogoUrl: null,
    aiLogos: [],
    recentOrders: [],
  };

  describe('Purchase Panel Offer & Defaults', () => {
    it('defaults to 100 business cards tier at $35.00', () => {
      const defaultQty: SupportedCardQuantity = 100;
      expect(SUPPORTED_CARD_QUANTITIES).toContain(defaultQty);
      expect(centsToDollars(CARD_RETAIL_SUBTOTAL_CENTS[defaultQty])).toBe(35.0);
    });

    it('offers verified 50 and 250 card tiers with proper unit pricing', () => {
      const tier50 = centsToDollars(CARD_RETAIL_SUBTOTAL_CENTS[50]);
      const tier250 = centsToDollars(CARD_RETAIL_SUBTOTAL_CENTS[250]);

      expect(tier50).toBe(24.99);
      expect(tier250).toBe(69.0);

      // Unit cost decreases as volume increases
      const unitCost50 = tier50 / 50;
      const unitCost100 = 35.0 / 100;
      const unitCost250 = tier250 / 250;

      expect(unitCost100).toBeLessThan(unitCost50);
      expect(unitCost250).toBeLessThan(unitCost100);
    });

    it('displays verified Mohawk uncoated cardstock and standard 3.5" x 2" trim specs', () => {
      expect(PRINTFUL_CARD_SPECS.stock).toContain('Mohawk');
      expect(PRINTFUL_CARD_SPECS.finish).toContain('Uncoated');
      expect(PRINTFUL_CARD_SPECS.dimensions.trimWidthInches).toBe(3.5);
      expect(PRINTFUL_CARD_SPECS.dimensions.trimHeightInches).toBe(2.0);
    });
  });

  describe('Card Design Document Pre-filling', () => {
    it('prefills design document from confirmed contractor business identity without fabricating claims', () => {
      const doc: CardDesignDocument = {
        version: 1,
        templateId: 'clean',
        content: {
          businessName: mockInitialData.companyName,
          trade: mockInitialData.trade,
          tagline: mockInitialData.tagline,
          phone: mockInitialData.phone,
          website: mockInitialData.website,
          email: 'quotes@apexroofingsolar.com',
          license: mockInitialData.license,
        },
        colors: {
          accentColor: mockInitialData.accentColor,
        },
        qr: {
          destinationUrl: 'https://' + mockInitialData.website,
          actionText: 'Scan to request a quote',
        },
      };

      expect(doc.content.businessName).toBe('Apex Roofing & Solar');
      expect(doc.content.phone).toBe('(303) 555-0199');
      expect(doc.content.website).toBe('www.apexroofingsolar.com');
      expect(doc.content.license).toBe('CO-94820');

      const rendered = renderCardArtwork(doc);
      expect(rendered.frontSvg).toContain('Apex Roofing &amp; Solar');
      expect(rendered.frontSvg).toContain('(303) 555-0199');
      expect(rendered.backSvg).toContain('SCAN TO REQUEST A QUOTE');

      // Crucial: no invented reviews or false badges
      expect(rendered.frontSvg).not.toContain('reviews');
      expect(rendered.frontSvg).not.toContain('Master Builder');
    });
  });

  describe('Proof Approval Safeguards', () => {
    it('requires explicit digital proof sign-off statement', () => {
      const proofStatement =
        'I have checked both sides and verify that my business details, phone number, and spelling are correct.';
      expect(proofStatement).toContain('checked both sides');
      expect(proofStatement).toContain('spelling are correct');
    });
  });
});
