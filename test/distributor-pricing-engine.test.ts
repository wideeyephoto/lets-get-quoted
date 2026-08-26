import { describe, it, expect } from 'vitest';
import {
  DISTRIBUTORS,
  WHOLESALE_MATERIAL_CATALOG,
  calculateBillOfMaterials,
  generateDistributorPurchaseOrder,
} from '../src/lib/supplies/distributor-pricing-engine';

describe('Distributor Wholesale Pricing & Purchase Order Engine', () => {
  it('registers all 5 primary wholesale distributors with portal links and trade capabilities', () => {
    expect(DISTRIBUTORS.abc_supply.name).toContain('ABC Supply');
    expect(DISTRIBUTORS.beacon_pro.name).toContain('Beacon');
    expect(DISTRIBUTORS.ferguson.name).toContain('Ferguson');
    expect(DISTRIBUTORS.srs_distribution.name).toContain('SRS Distribution');
    expect(DISTRIBUTORS.home_depot_pro.name).toContain('Home Depot');

    expect(DISTRIBUTORS.abc_supply.features.rooftopDropAvailable).toBe(true);
    expect(DISTRIBUTORS.ferguson.supportedTrades).toContain('plumbing');
  });

  it('contains verified wholesale SKUs across roofing, plumbing, and electrical', () => {
    expect(WHOLESALE_MATERIAL_CATALOG.length).toBeGreaterThan(10);

    const shingle = WHOLESALE_MATERIAL_CATALOG.find((i) => i.sku === 'GAF-HDZ-CHESTNUT');
    expect(shingle).toBeDefined();
    expect(shingle?.wholesaleUnitPrice).toBeLessThan(shingle?.retailSuggestedPrice || 0);

    const waterHeater = WHOLESALE_MATERIAL_CATALOG.find((i) => i.sku === 'RHEEM-PROG50-40N');
    expect(waterHeater).toBeDefined();
    expect(waterHeater?.distributorKey).toBe('ferguson');

    const loadCenter = WHOLESALE_MATERIAL_CATALOG.find((i) => i.sku === 'SQD-HOM4080M200PC');
    expect(loadCenter).toBeDefined();
    expect(loadCenter?.distributorKey).toBe('ferguson');
  });

  it('calculates full Bill of Materials (BOM) with wholesale margins for a 28-square roofing job', () => {
    const bom = calculateBillOfMaterials('roofing', 28, 'abc_supply');

    expect(bom.trade).toBe('roofing');
    expect(bom.squaresOrUnits).toBe(28);
    expect(bom.distributor.key).toBe('abc_supply');
    expect(bom.items.length).toBeGreaterThan(5);

    // Shingles bundles count = 28 * 3 = 84 bundles
    const shingleItem = bom.items.find((i) => i.sku === 'GAF-HDZ-CHESTNUT');
    expect(shingleItem?.quantity).toBe(84);
    expect(shingleItem?.extendedWholesalePrice).toBe(84 * 38.50);

    // Totals & margin
    expect(bom.totals.totalWholesaleCost).toBeGreaterThan(3000);
    expect(bom.totals.totalRetailValuation).toBeGreaterThan(bom.totals.totalWholesaleCost);
    expect(bom.totals.grossMarginPercent).toBeGreaterThan(15);
  });

  it('generates a formatted Distributor Purchase Order (PO) with delivery instructions', () => {
    const po = generateDistributorPurchaseOrder({
      jobRef: 'JOB-7712',
      jobAddress: '420 Elm St, Birmingham, MI 48009',
      contractorName: 'Apex Roofing & Solar LLC',
      distributorKey: 'abc_supply',
      trade: 'roofing',
      squaresOrUnits: 25,
      deliveryMethod: 'jobsite_rooftop_drop',
    });

    expect(po.poNumber).toMatch(/^PO-ABC-\d+-\d+$/);
    expect(po.distributorName).toBe('ABC Supply Co., Inc.');
    expect(po.deliveryMethod).toBe('jobsite_rooftop_drop');
    expect(po.deliveryInstructions).toContain('Rooftop delivery');
    expect(po.bom.items.length).toBeGreaterThan(0);
  });
});
