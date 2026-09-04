import { describe, it, expect } from 'vitest';
import { MERCHANDISE_PRODUCTS, getProductById } from '@/lib/merchandise/catalog';
import { calculateMerchandisePricing } from '@/lib/merchandise/pricing';
import { createPrintfulOrder } from '@/lib/merchandise/printful-client';
import type { MerchandiseOrderItem, ShippingAddress } from '@/lib/merchandise/types';

describe('Merchandise Studio & Instant Purchasing Engine', () => {
  describe('Product Catalog Integrity', () => {
    it('contains all requested contractor merchandise categories and products', () => {
      const productIds = MERCHANDISE_PRODUCTS.map((p) => p.id);

      // Verify core requested products
      expect(productIds).toContain('biz_cards');
      expect(productIds).toContain('polos');
      expect(productIds).toContain('t_shirts');
      expect(productIds).toContain('hats');
      expect(productIds).toContain('notepads');
      expect(productIds).toContain('pens');
      expect(productIds).toContain('phone_cases');
      expect(productIds).toContain('yard_signs');
      expect(productIds).toContain('tumblers');
      expect(productIds).toContain('decals');
    });

    it('defines rich volume pricing tiers and specs for each item', () => {
      for (const prod of MERCHANDISE_PRODUCTS) {
        expect(prod.pricingTiers.length).toBeGreaterThanOrEqual(3);
        expect(prod.availableColors.length).toBeGreaterThanOrEqual(2);
        expect(prod.specs.dimensions).toBeDefined();
        expect(prod.specs.material).toBeDefined();
        expect(prod.specs.finish).toBeDefined();
      }
    });

    it('correctly looks up product by ID', () => {
      const hat = getProductById('hats');
      expect(hat).toBeDefined();
      expect(hat?.name).toContain('Richardson 112');
      expect(hat?.decorationMethod).toBe('leather_patch');
    });
  });

  describe('Pricing Engine & 10% Platform Cut Calculation', () => {
    it('enforces a $5.00 minimum platform fee floor on small orders', () => {
      // Small order: $20.00 wholesale
      const result = calculateMerchandisePricing({
        wholesaleUnitCost: 20.0,
        quantity: 1,
        isEmbroidery: false,
      });

      // 10% of ~$33.00 retail is $3.30, so the $5.00 floor must kick in
      expect(result.platformCutAmount).toBe(5.0);
      expect(result.platformCutAmount).toBeGreaterThanOrEqual(5.0);
    });

    it('takes a full 10% on large fleet orders where 10% exceeds $5.00', () => {
      // Large fleet order: $25.00 wholesale x 24 units = $600 wholesale
      const result = calculateMerchandisePricing({
        wholesaleUnitCost: 25.0,
        quantity: 24,
        isEmbroidery: true,
      });

      const expectedTenPercent = Math.round(result.retailSubtotal * 0.10 * 100) / 100;
      expect(result.platformCutAmount).toBe(expectedTenPercent);
      expect(result.platformCutAmount).toBeGreaterThan(50.0);
    });

    it('waives embroidery digitizing fee on orders of 6 or more units', () => {
      const sixPolos = calculateMerchandisePricing({
        wholesaleUnitCost: 18.0,
        quantity: 6,
        isEmbroidery: true,
      });

      expect(sixPolos.isFreeDigitizing).toBe(true);
      expect(sixPolos.digitizingFee).toBe(0);

      const twoPolos = calculateMerchandisePricing({
        wholesaleUnitCost: 18.0,
        quantity: 2,
        isEmbroidery: true,
      });

      expect(twoPolos.isFreeDigitizing).toBe(false);
      expect(twoPolos.digitizingFee).toBe(6.50);
    });

    it('provides free standard shipping on orders over $150', () => {
      const largeOrder = calculateMerchandisePricing({
        wholesaleUnitCost: 20.0,
        quantity: 12,
        shippingMethod: 'standard',
      });

      expect(largeOrder.retailSubtotal).toBeGreaterThan(150);
      expect(largeOrder.shippingCost).toBe(0);
    });
  });

  describe('Printful Automated Fulfillment Dispatch', () => {
    it('builds a valid simulated order payload when running in test environment', async () => {
      const mockItem: MerchandiseOrderItem = {
        productId: 'polos',
        productName: 'Pro Moisture-Wicking Embroidered Work Polo',
        colorName: 'Deep Royal Navy',
        colorHex: '#1e3a8a',
        quantity: 12,
        unitPrice: 26.5,
        totalPrice: 318.0,
        customizationDetails: {
          businessName: 'Apex Plumbing Experts',
          phone: '(303) 555-0199',
          website: 'www.apexplumb.com',
          license: 'LIC #94820',
          logoUrl: 'https://storage.googleapis.com/test-bucket/apex-logo.png',
          decorationMethod: 'embroidery',
          placement: 'Left Chest High-Density Embroidery',
          sizeBreakdown: { M: 4, L: 4, XL: 4 },
        },
      };

      const mockAddress: ShippingAddress = {
        fullName: 'Mike Harrison',
        companyName: 'Apex Plumbing',
        streetAddress: '4200 Commercial Way',
        city: 'Denver',
        state: 'CO',
        postalCode: '80205',
        country: 'US',
        phone: '(303) 555-0199',
        email: 'mike@apexplumb.com',
      };

      const res = await createPrintfulOrder({
        orderNumber: 'LGQ-MRCH-2026-9999',
        items: [mockItem],
        shippingAddress: mockAddress,
        retailTotal: 318.0,
        companyName: 'Apex Plumbing Experts',
      });

      expect(res.ok).toBe(true);
      expect(res.trackingNumber).toBeDefined();
      expect(res.trackingNumber).toContain('1Z999');
      expect(res.carrier).toBe('UPS Ground Commercial');
      expect(res.status).toBe('in_production');
    });
  });
});
