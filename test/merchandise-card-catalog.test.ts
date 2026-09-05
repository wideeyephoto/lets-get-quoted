import { describe, it, expect } from 'vitest';
import {
  PRINTFUL_BUSINESS_CARD_PRODUCT_ID,
  PRINTFUL_CARD_VARIANTS,
  PRINTFUL_CARD_SPECS,
  SUPPORTED_CARD_QUANTITIES,
  resolveCardPackPlan,
  isSupportedCardFinish,
} from '@/lib/merchandise/card-catalog-types';
import {
  buildPrintfulOrderItems,
  createPrintfulOrder,
  PRINTFUL_DEFAULT_VARIANT_MAP,
} from '@/lib/merchandise/printful-client';
import type { MerchandiseOrderItem, ShippingAddress } from '@/lib/merchandise/types';

describe('Batch A: Product Truth & Catalog Gating', () => {
  const dummyAddress: ShippingAddress = {
    fullName: 'Jane Builder',
    companyName: 'Apex Roofing & Solar',
    streetAddress: '123 Contractor Way',
    city: 'Denver',
    state: 'CO',
    postalCode: '80202',
    country: 'US',
    phone: '(303) 555-0100',
    email: 'jane@apexroofing.com',
  };

  describe('Printful Product Specifications & Catalog Constants', () => {
    it('defines product 724 with verified physical specs', () => {
      expect(PRINTFUL_BUSINESS_CARD_PRODUCT_ID).toBe(724);
      expect(PRINTFUL_CARD_SPECS.productId).toBe(724);
      expect(PRINTFUL_CARD_SPECS.dimensions.trimWidthInches).toBe(3.5);
      expect(PRINTFUL_CARD_SPECS.dimensions.trimHeightInches).toBe(2.0);
      expect(PRINTFUL_CARD_SPECS.dimensions.bleedInches).toBe(0.125);
      expect(PRINTFUL_CARD_SPECS.dimensions.dpi).toBe(300);
      expect(PRINTFUL_CARD_SPECS.dimensions.pixelWidth).toBe(1125);
      expect(PRINTFUL_CARD_SPECS.dimensions.pixelHeight).toBe(675);
      expect(PRINTFUL_CARD_SPECS.fileSlots).toEqual(['front', 'back']);
    });

    it('defines explicit variant IDs for 50 and 100 pack sizes', () => {
      expect(PRINTFUL_CARD_VARIANTS.PACK_50).toBeDefined();
      expect(PRINTFUL_CARD_VARIANTS.PACK_100).toBeDefined();
      expect(PRINTFUL_CARD_VARIANTS.PACK_50).not.toBe(PRINTFUL_CARD_VARIANTS.PACK_100);
      expect(PRINTFUL_CARD_VARIANTS.PACK_100).not.toBe(4014); // Must not fall through to apparel
    });
  });

  describe('Pack Quantity Resolution (resolveCardPackPlan)', () => {
    it('resolves 50 cards to exactly 1 pack of 50', () => {
      const plan = resolveCardPackPlan(50);
      expect(plan).not.toBeNull();
      expect(plan?.totalCards).toBe(50);
      expect(plan?.totalPacks).toBe(1);
      expect(plan?.packs).toHaveLength(1);
      expect(plan?.packs[0]).toEqual({
        packSize: 50,
        packCount: 1,
        variantId: PRINTFUL_CARD_VARIANTS.PACK_50,
        cardsInPackItem: 50,
      });
    });

    it('resolves 100 cards to exactly 1 pack of 100', () => {
      const plan = resolveCardPackPlan(100);
      expect(plan).not.toBeNull();
      expect(plan?.totalCards).toBe(100);
      expect(plan?.totalPacks).toBe(1);
      expect(plan?.packs).toHaveLength(1);
      expect(plan?.packs[0]).toEqual({
        packSize: 100,
        packCount: 1,
        variantId: PRINTFUL_CARD_VARIANTS.PACK_100,
        cardsInPackItem: 100,
      });
    });

    it('resolves 250 cards to 2 packs of 100 plus 1 pack of 50', () => {
      const plan = resolveCardPackPlan(250);
      expect(plan).not.toBeNull();
      expect(plan?.totalCards).toBe(250);
      expect(plan?.totalPacks).toBe(3);
      expect(plan?.packs).toHaveLength(2);

      const pack100 = plan?.packs.find((p) => p.packSize === 100);
      const pack50 = plan?.packs.find((p) => p.packSize === 50);

      expect(pack100).toEqual({
        packSize: 100,
        packCount: 2,
        variantId: PRINTFUL_CARD_VARIANTS.PACK_100,
        cardsInPackItem: 200,
      });
      expect(pack50).toEqual({
        packSize: 50,
        packCount: 1,
        variantId: PRINTFUL_CARD_VARIANTS.PACK_50,
        cardsInPackItem: 50,
      });
    });

    it('resolves 500 cards to 5 packs of 100', () => {
      const plan = resolveCardPackPlan(500);
      expect(plan).not.toBeNull();
      expect(plan?.totalCards).toBe(500);
      expect(plan?.totalPacks).toBe(5);
      expect(plan?.packs[0]).toEqual({
        packSize: 100,
        packCount: 5,
        variantId: PRINTFUL_CARD_VARIANTS.PACK_100,
        cardsInPackItem: 500,
      });
    });

    it('rejects unsupported, fractional, zero, or negative quantities', () => {
      expect(resolveCardPackPlan(0)).toBeNull();
      expect(resolveCardPackPlan(-100)).toBeNull();
      expect(resolveCardPackPlan(37)).toBeNull();
      expect(resolveCardPackPlan(75)).toBeNull();
      expect(resolveCardPackPlan(150)).toBeNull();
      expect(resolveCardPackPlan(99.5)).toBeNull();
      expect(resolveCardPackPlan(NaN)).toBeNull();
    });
  });

  describe('Finish Gating (isSupportedCardFinish)', () => {
    it('accepts valid uncoated and matte finishes', () => {
      expect(isSupportedCardFinish(undefined)).toBe(true);
      expect(isSupportedCardFinish(null)).toBe(true);
      expect(isSupportedCardFinish('uncoated')).toBe(true);
      expect(isSupportedCardFinish('matte')).toBe(true);
      expect(isSupportedCardFinish('standard')).toBe(true);
      expect(isSupportedCardFinish('natural')).toBe(true);
    });

    it('rejects unsupported tactile finishes that Printful cannot manufacture', () => {
      expect(isSupportedCardFinish('velvet_matte')).toBe(false);
      expect(isSupportedCardFinish('Soft-Touch Velvet Matte')).toBe(false);
      expect(isSupportedCardFinish('foil_gold')).toBe(false);
      expect(isSupportedCardFinish('Raised Gold Foil Accent')).toBe(false);
      expect(isSupportedCardFinish('foil_silver')).toBe(false);
      expect(isSupportedCardFinish('spot_uv')).toBe(false);
      expect(isSupportedCardFinish('Raised Clear Spot-UV Gloss')).toBe(false);
      expect(isSupportedCardFinish('foil_holo')).toBe(false);
      expect(isSupportedCardFinish('Holographic Iridescent Foil')).toBe(false);
    });
  });

  describe('Printful Order Items Builder (buildPrintfulOrderItems)', () => {
    it('converts 100 business cards into 1 pack item with correct variant and files', () => {
      const cardItem: MerchandiseOrderItem = {
        productId: 'biz_cards',
        productName: 'Set of Business Cards',
        colorName: 'Bright Arctic White',
        colorHex: '#ffffff',
        quantity: 100,
        unitPrice: 0.35,
        totalPrice: 35.0,
        customizationDetails: {
          businessName: 'Apex Roofing',
          decorationMethod: 'offset_cmyk',
          placement: 'front_and_back',
          customArtworkUrl: 'https://cdn.example.com/front-proof.png',
          backDesign: 'https://cdn.example.com/back-proof.png',
        },
      };

      const res = buildPrintfulOrderItems([cardItem]);
      expect(res.ok).toBe(true);
      if (!res.ok) return;

      expect(res.printfulItems).toHaveLength(1);
      const printItem = res.printfulItems[0];

      // Quantity must be 1 (pack count), NOT 100!
      expect(printItem.quantity).toBe(1);
      expect(printItem.variant_id).toBe(PRINTFUL_CARD_VARIANTS.PACK_100);
      expect(printItem.retail_price).toBe('35.00');
      expect(printItem.files).toEqual([
        { type: 'front', url: 'https://cdn.example.com/front-proof.png' },
        { type: 'back', url: 'https://cdn.example.com/back-proof.png' },
      ]);
    });

    it('converts 250 business cards into separate pack items (2x100pk, 1x50pk)', () => {
      const cardItem: MerchandiseOrderItem = {
        productId: 'biz_cards',
        productName: 'Set of Business Cards',
        colorName: 'Bright Arctic White',
        colorHex: '#ffffff',
        quantity: 250,
        unitPrice: 0.24,
        totalPrice: 60.0,
        customizationDetails: {
          businessName: 'Apex Roofing',
          decorationMethod: 'offset_cmyk',
          placement: 'front_and_back',
          logoUrl: 'https://cdn.example.com/logo.png',
        },
      };

      const res = buildPrintfulOrderItems([cardItem]);
      expect(res.ok).toBe(true);
      if (!res.ok) return;

      expect(res.printfulItems).toHaveLength(2);

      const pack100Item = res.printfulItems.find(
        (p) => p.variant_id === PRINTFUL_CARD_VARIANTS.PACK_100
      );
      const pack50Item = res.printfulItems.find(
        (p) => p.variant_id === PRINTFUL_CARD_VARIANTS.PACK_50
      );

      expect(pack100Item?.quantity).toBe(2); // 2 packs of 100
      expect(pack50Item?.quantity).toBe(1); // 1 pack of 50
    });

    it('rejects card items with unsupported finish', () => {
      const cardItem: MerchandiseOrderItem = {
        productId: 'biz_cards',
        productName: 'Set of Business Cards',
        colorName: 'Bright Arctic White',
        colorHex: '#ffffff',
        quantity: 100,
        unitPrice: 0.35,
        totalPrice: 35.0,
        customizationDetails: {
          businessName: 'Apex Roofing',
          decorationMethod: 'offset_cmyk',
          placement: 'front_and_back',
          finish: 'Raised Gold Foil Accent',
        },
      };

      const res = buildPrintfulOrderItems([cardItem]);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error).toContain('not supported');
      }
    });

    it('rejects card items with unsupported quantities', () => {
      const cardItem: MerchandiseOrderItem = {
        productId: 'biz_cards',
        productName: 'Set of Business Cards',
        colorName: 'Bright Arctic White',
        colorHex: '#ffffff',
        quantity: 133,
        unitPrice: 0.35,
        totalPrice: 46.55,
        customizationDetails: {
          businessName: 'Apex Roofing',
          decorationMethod: 'offset_cmyk',
          placement: 'front_and_back',
        },
      };

      const res = buildPrintfulOrderItems([cardItem]);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error).toContain('Invalid or unsupported business card quantity: 133');
      }
    });

    it('rejects unmapped products rather than falling back to default 4014', () => {
      const unknownItem = {
        productId: 'unknown_product_xyz' as any,
        productName: 'Mysterious Item',
        colorName: 'Black',
        colorHex: '#000000',
        quantity: 5,
        unitPrice: 10.0,
        totalPrice: 50.0,
        customizationDetails: {
          businessName: 'Apex Roofing',
          decorationMethod: 'screen_print' as any,
          placement: 'front',
        },
      };

      const res = buildPrintfulOrderItems([unknownItem]);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error).toContain('No verified Printful variant mapping');
      }
    });
  });

  describe('Fulfillment Routing and Gating (createPrintfulOrder)', () => {
    it('routes valid business card orders through Printful provider, not commercial broker', async () => {
      const cardItem: MerchandiseOrderItem = {
        productId: 'biz_cards',
        productName: 'Set of Business Cards',
        colorName: 'Bright Arctic White',
        colorHex: '#ffffff',
        quantity: 100,
        unitPrice: 0.35,
        totalPrice: 35.0,
        customizationDetails: {
          businessName: 'Apex Roofing',
          decorationMethod: 'offset_cmyk',
          placement: 'front_and_back',
          logoUrl: 'https://cdn.example.com/logo.png',
        },
      };

      const res = await createPrintfulOrder({
        orderNumber: 'LGQ-BC-2026-0001',
        items: [cardItem],
        shippingAddress: dummyAddress,
        retailTotal: 35.0,
        companyName: 'Apex Roofing',
      });

      expect(res.ok).toBe(true);
      expect(res.provider).toBe('printful');
    });

    it('rejects business cards with invalid quantities before sending order', async () => {
      const invalidItem: MerchandiseOrderItem = {
        productId: 'biz_cards',
        productName: 'Set of Business Cards',
        colorName: 'Bright Arctic White',
        colorHex: '#ffffff',
        quantity: 42,
        unitPrice: 0.35,
        totalPrice: 14.7,
        customizationDetails: {
          businessName: 'Apex Roofing',
          decorationMethod: 'offset_cmyk',
          placement: 'front_and_back',
        },
      };

      const res = await createPrintfulOrder({
        orderNumber: 'LGQ-BC-2026-0002',
        items: [invalidItem],
        shippingAddress: dummyAddress,
        retailTotal: 14.7,
        companyName: 'Apex Roofing',
      });

      expect(res.ok).toBe(false);
      expect(res.error).toContain('Invalid or unsupported business card quantity: 42');
    });

    it('rejects business cards with unsupported tactile finishes', async () => {
      const foilItem: MerchandiseOrderItem = {
        productId: 'biz_cards',
        productName: 'Set of Business Cards',
        colorName: 'Charcoal Onyx',
        colorHex: '#18181b',
        quantity: 100,
        unitPrice: 0.35,
        totalPrice: 35.0,
        customizationDetails: {
          businessName: 'Apex Roofing',
          decorationMethod: 'offset_cmyk',
          placement: 'front_and_back',
          finish: 'Raised Gold Foil Accent',
        },
      };

      const res = await createPrintfulOrder({
        orderNumber: 'LGQ-BC-2026-0003',
        items: [foilItem],
        shippingAddress: dummyAddress,
        retailTotal: 35.0,
        companyName: 'Apex Roofing',
      });

      expect(res.ok).toBe(false);
      expect(res.error).toContain('not supported');
    });
  });
});
