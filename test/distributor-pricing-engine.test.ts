import { describe, it, expect } from 'vitest';
import {
  DISTRIBUTORS,
  WHOLESALE_MATERIAL_CATALOG,
  calculateBillOfMaterials,
  generateDistributorPurchaseOrder,
  getContractorTierDiscount,
  generateEDI850PurchaseOrder,
  parseEDI855Acknowledgment,
  generateEDI856AdvanceShipNotice,
  dispatchOrderToABCSupply,
  dispatchOrderToBeaconPro,
  dispatchOrderToFerguson,
  dispatchOrderToSRSDistribution,
  dispatchOrderToHomeDepotPro,
  dispatchPurchaseOrderToSupplier,
  compareSupplierQuotes,
  savePurchaseOrder,
  getPurchaseOrderById,
  listPurchaseOrders,
  createAndDispatchLivePO,
  updatePurchaseOrderStatus,
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
    expect(DISTRIBUTORS.beacon_pro.branches.length).toBeGreaterThan(0);
    expect(DISTRIBUTORS.abc_supply.ediIdentifier.isaId).toBe('ABCSUPPLYCO');
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
    expect(po.estimatedDeliveryFee).toBeGreaterThan(0);
    expect(po.grandTotalCost).toBeGreaterThan(po.bom.totals.totalWholesaleCost);
  });

  it('calculates tiered contractor discounts across wholesale price points', () => {
    expect(getContractorTierDiscount('standard')).toBe(0);
    expect(getContractorTierDiscount('silver')).toBe(5);
    expect(getContractorTierDiscount('gold')).toBe(10);
    expect(getContractorTierDiscount('platinum')).toBe(15);

    const standardBom = calculateBillOfMaterials('roofing', 20, 'abc_supply', { contractorTier: 'standard' });
    const platinumBom = calculateBillOfMaterials('roofing', 20, 'abc_supply', { contractorTier: 'platinum' });

    expect(platinumBom.totals.totalWholesaleCost).toBeLessThan(standardBom.totals.totalWholesaleCost);
    expect(platinumBom.totals.estimatedContractorGrossMargin).toBeGreaterThan(standardBom.totals.estimatedContractorGrossMargin);
  });

  it('calculates BOMs accurately across diverse trades (siding, gutters, plumbing, mechanical, decking)', () => {
    const sidingBom = calculateBillOfMaterials('siding', 15, 'abc_supply');
    expect(sidingBom.items.length).toBeGreaterThan(0);
    expect(sidingBom.items[0].sku).toBe('JAMES-HARDIE-PLANK-8.25');

    const plumbingBom = calculateBillOfMaterials('plumbing', 1, 'ferguson');
    expect(plumbingBom.items.some((i) => i.sku === 'RHEEM-PROG50-40N')).toBe(true);

    const hvacBom = calculateBillOfMaterials('mechanical', 1, 'ferguson');
    expect(hvacBom.items.some((i) => i.sku === 'CARRIER-COIL-EVAP-3TON')).toBe(true);

    const deckingBom = calculateBillOfMaterials('decking', 10, 'beacon_pro');
    expect(deckingBom.items.some((i) => i.sku === 'TREX-TRANSCEND-16FT')).toBe(true);
  });

  it('generates standard ANSI X12 EDI 850 purchase order transactions', () => {
    const po = generateDistributorPurchaseOrder({
      jobRef: 'JOB-9921',
      jobAddress: '782 Pine Hollow Way, Austin, TX 78701',
      contractorName: 'Lonestar Premier Roofing',
      distributorKey: 'abc_supply',
      trade: 'roofing',
      squaresOrUnits: 30,
      deliveryMethod: 'jobsite_rooftop_drop',
    });

    const edi = generateEDI850PurchaseOrder(po);
    expect(edi).toContain('ISA*00*');
    expect(edi).toContain('GS*PO*LGQCONTRACTOR*ABCSUPPLY');
    expect(edi).toContain('ST*850*');
    expect(edi).toContain(`BEG*00*NE*${po.poNumber}`);
    expect(edi).toContain('N1*ST*Lonestar Premier Roofing');
    expect(edi).toContain('PO1*1*');
    expect(edi).toContain('CTT*');
    expect(edi).toContain('IEA*1*');
  });

  it('parses ANSI X12 EDI 855 Purchase Order Acknowledgments correctly', () => {
    const sample855 = [
      'ISA*00*          *00*          *01*ABCSUPPLYCO    *ZZ*LGQCONTRACTOR  *260901*0830*U*00401*000123*0*P*>~',
      'GS*PR*ABCSUPPLY*LGQCONTRACTOR*20260901*0830*000123*X*004010~',
      'ST*855*000123~',
      'BAK*00*AC*PO-ABC-20260901-4920*CONF-984210*20260901~',
      'DTM*017*20260903~',
      'PO1*1*90*BD*38.50*PE*VN*GAF-HDZ-CHESTNUT~',
      'ACK*IA*90*BD~',
      'CTT*1~',
      'SE*8*000123~',
      'GE*1*000123~',
      'IEA*1*000123~',
    ].join('\n');

    const result = parseEDI855Acknowledgment(sample855);
    expect(result.poNumber).toBe('PO-ABC-20260901-4920');
    expect(result.confirmationNumber).toBe('CONF-984210');
    expect(result.acknowledgmentStatus).toBe('Accepted');
    expect(result.confirmedDeliveryDate).toBe('2026-09-03');
    expect(result.totalLinesAccepted).toBeGreaterThan(0);
  });

  it('generates standard ANSI X12 EDI 856 Advance Ship Notices (ASN)', () => {
    const asn = generateEDI856AdvanceShipNotice({
      poNumber: 'PO-ABC-20260901-8841',
      trackingNumber: 'TRK-ABC-99281',
      carrierName: 'ABC Supply Boom Truck #42',
      itemsCount: 8,
      destinationAddress: '104 Oak Dr, Round Rock, TX 78664',
    });

    expect(asn).toContain('ST*856*');
    expect(asn).toContain('BSN*00*ASN-PO-ABC-20260901-8841');
    expect(asn).toContain('REF*CN*TRK-ABC-99281');
    expect(asn).toContain('TD5*B*2*ABC Supply Boom Truck #42');
  });

  it('dispatches live orders through all 5 supplier API adapters', async () => {
    const po = generateDistributorPurchaseOrder({
      jobRef: 'JOB-5511',
      jobAddress: '902 Crestview Dr, Austin, TX 78757',
      contractorName: 'Apex Pro Contracting',
      distributorKey: 'abc_supply',
      trade: 'roofing',
      squaresOrUnits: 22,
      deliveryMethod: 'jobsite_rooftop_drop',
    });

    const abcResp = await dispatchOrderToABCSupply(po, 'mock_abc_key');
    expect(abcResp.success).toBe(true);
    expect(abcResp.distributorConfirmationNumber).toMatch(/^ABC-ORD-/);
    expect(abcResp.transmissionChannel).toBe('api');

    const becnResp = await dispatchOrderToBeaconPro(po);
    expect(becnResp.success).toBe(true);
    expect(becnResp.distributorConfirmationNumber).toMatch(/^BECN-PO-/);

    const fergResp = await dispatchOrderToFerguson(po);
    expect(fergResp.success).toBe(true);
    expect(fergResp.distributorConfirmationNumber).toMatch(/^FERG-B2B-/);

    const srsResp = await dispatchOrderToSRSDistribution(po);
    expect(srsResp.success).toBe(true);
    expect(srsResp.distributorConfirmationNumber).toMatch(/^SRS-HUB-/);

    const hdResp = await dispatchOrderToHomeDepotPro(po);
    expect(hdResp.success).toBe(true);
    expect(hdResp.distributorConfirmationNumber).toMatch(/^HDP-PRO-/);

    const unifiedResp = await dispatchPurchaseOrderToSupplier(po, 'ferguson');
    expect(unifiedResp.distributorKey).toBe('ferguson');
  });

  it('compares live supplier quotes and ranks by best total price and fastest lead time', () => {
    const comparison = compareSupplierQuotes('roofing', 25, {
      contractorTier: 'gold',
      deliveryMethod: 'jobsite_ground_drop',
    });

    expect(comparison.trade).toBe('roofing');
    expect(comparison.comparisons.length).toBeGreaterThanOrEqual(3);
    expect(comparison.bestPriceSupplier).toBeDefined();
    expect(comparison.fastestLeadSupplier).toBeDefined();

    const sortedByPrice = [...comparison.comparisons].sort((a, b) => a.grandTotalCost - b.grandTotalCost);
    expect(comparison.comparisons[0].grandTotalCost).toBe(sortedByPrice[0].grandTotalCost);
  });

  it('persists purchase orders and executes full lifecycle updates', async () => {
    const { poRecord, supplierResponse } = await createAndDispatchLivePO({
      accountId: 'acc-test-procure-101',
      jobRef: 'JOB-9020',
      jobAddress: '1504 Westlake Dr, Austin, TX 78746',
      contractorName: 'Highland Park Roofing',
      distributorKey: 'abc_supply',
      trade: 'roofing',
      squaresOrUnits: 32,
      deliveryMethod: 'jobsite_rooftop_drop',
      contractorTier: 'platinum',
    });

    expect(poRecord.id).toBeDefined();
    expect(poRecord.poNumber).toMatch(/^PO-ABC-/);
    expect(poRecord.status).toBe('acknowledged');
    expect(supplierResponse.success).toBe(true);

    const fetched = await getPurchaseOrderById(poRecord.id);
    expect(fetched).toBeDefined();
    expect(fetched?.poNumber).toBe(poRecord.poNumber);

    const orders = await listPurchaseOrders('acc-test-procure-101');
    expect(orders.some((o) => o.id === poRecord.id)).toBe(true);

    // Progress status to dispatched and delivered
    const updated = await updatePurchaseOrderStatus(poRecord.id, 'out_for_delivery', {
      trackingNumber: 'TRK-BOOM-4021',
      carrierName: 'ABC Supply Austin North #410 Truck 12',
    });
    expect(updated?.status).toBe('out_for_delivery');
    expect(updated?.trackingNumber).toBe('TRK-BOOM-4021');

    const delivered = await updatePurchaseOrderStatus(poRecord.id, 'delivered');
    expect(delivered?.status).toBe('delivered');
    expect(delivered?.deliveredAt).toBeDefined();
  });
});
