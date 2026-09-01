import { describe, it, expect } from 'vitest';

// 1. Material Supply Ordering
import {
  calculateMaterialsFromQuote,
  calculateAdvancedRoofMaterials,
  compareDistributorPricing,
  createAndDispatchMaterialPO,
  reconcileMaterialPurchaseOrderInvoice,
  generateMaterialReturnSlip,
  DISTRIBUTOR_CATALOGS,
} from '@/lib/material-supply-ordering';

// 2. Certified Payroll WH-347
import {
  generateCertifiedPayrollWh347,
  formatWh347ReportMarkdown,
} from '@/lib/certified-payroll-wh347';

// 3. Subcontractor COI Parser
import {
  evaluateSubcontractorCoi,
  STANDARD_MINIMUM_COI_LIMITS,
} from '@/lib/subcontractor-coi-parser';

describe('Material Supply Ordering, Certified Payroll (WH-347), and Subcontractor COI Watchdog', () => {
  describe('Material Supply Ordering (ABC Supply, Beacon, Home Depot Pro, Ferguson)', () => {
    it('calculates advanced roof geometry with steep pitch waste, starter strip, ice & water shield, and drip edge', () => {
      const items = calculateAdvancedRoofMaterials({
        squareFootage: 2800,
        pitch: '10/12', // 15% steep pitch waste
        valleyLinearFeet: 60,
        eaveRakeLinearFeet: 220,
        ridgeLinearFeet: 75,
        hasMultiLayerTearOff: true,
      });

      expect(items.length).toBeGreaterThanOrEqual(6);
      const iceWater = items.find((i) => i.sku === 'ICE-WATER-SHIELD');
      expect(iceWater).toBeDefined();
      expect(iceWater?.quantity).toBeGreaterThan(0);

      const starter = items.find((i) => i.sku === 'STRTR-PRO-100FT');
      expect(starter).toBeDefined();

      const dripEdge = items.find((i) => i.sku === 'DRIP-EDGE-ALUM-10FT');
      expect(dripEdge).toBeDefined();
      expect(dripEdge?.quantity).toBeGreaterThan(15);
    });

    it('calculates materials for multi-trade categories (drywall, plumbing, hvac, flooring, concrete)', () => {
      const drywall = calculateMaterialsFromQuote({ trade: 'drywall', squareFootage: 1200 });
      expect(drywall.some((i) => i.category === 'drywall')).toBe(true);

      const plumbing = calculateMaterialsFromQuote({ trade: 'plumbing', squareFootage: 100 });
      expect(plumbing.some((i) => i.category === 'plumbing')).toBe(true);

      const hvac = calculateMaterialsFromQuote({ trade: 'hvac', squareFootage: 100 });
      expect(hvac.some((i) => i.category === 'hvac')).toBe(true);

      const flooring = calculateMaterialsFromQuote({ trade: 'flooring', squareFootage: 800 });
      expect(flooring.some((i) => i.category === 'flooring')).toBe(true);

      const concrete = calculateMaterialsFromQuote({ trade: 'concrete', squareFootage: 400 });
      expect(concrete.some((i) => i.category === 'concrete')).toBe(true);
    });

    it('compares pricing across all integrated distributors and identifies potential savings', () => {
      const items = calculateMaterialsFromQuote({ trade: 'roofing', squareFootage: 2500 });
      const comparison = compareDistributorPricing(items, 'jobsite_delivery');

      expect(comparison.comparisons.length).toBe(4);
      expect(comparison.bestPriceDistributor).toBeDefined();
      expect(comparison.potentialSavingsCents).toBeGreaterThanOrEqual(0);
    });

    it('reconciles actual supplier invoices against quote material allowances to flag variance and margin shift', () => {
      const underBudget = reconcileMaterialPurchaseOrderInvoice({
        poNumber: 'PO-ABC-102941',
        quotedAllowanceCents: 500000, // $5,000 allowance
        actualInvoiceCents: 475000,   // $4,750 actual invoice ($250 under)
        quoteTotalRevenueCents: 1200000, // $12,000 total quote
      });

      expect(underBudget.isOverBudget).toBe(false);
      expect(underBudget.varianceCents).toBe(-25000);
      expect(underBudget.requiresChangeOrder).toBe(false);

      const overBudgetSurge = reconcileMaterialPurchaseOrderInvoice({
        poNumber: 'PO-ABC-102942',
        quotedAllowanceCents: 500000,
        actualInvoiceCents: 575000, // $750 surge (+15%)
        quoteTotalRevenueCents: 1200000,
      });

      expect(overBudgetSurge.isOverBudget).toBe(true);
      expect(overBudgetSurge.requiresChangeOrder).toBe(true);
      expect(overBudgetSurge.variancePercent).toBe(15);
    });

    it('generates an automated Return Merchandise Authorization (RMA) return slip for unused items', async () => {
      const items = calculateMaterialsFromQuote({ trade: 'roofing', squareFootage: 2000 });
      const po = await createAndDispatchMaterialPO({
        accountId: 'acc-1',
        quoteId: 'q-99',
        jobAddress: '4502 Westlake Dr, Austin, TX',
        distributor: 'abc_supply',
        items,
        fulfillmentType: 'jobsite_delivery',
        deliveryPlacement: 'rooftop_boom_truck',
        preferredTimeWindow: 'morning_7am_9am',
      });

      const rma = generateMaterialReturnSlip({
        po,
        returnedItems: [
          { sku: 'SHING-ARCH-30', quantity: 4 }, // 4 unused shingle bundles
        ],
      });

      expect(rma.rmaNumber).toContain('RMA-ABC');
      expect(rma.itemsToReturn.length).toBe(1);
      expect(rma.totalExpectedCreditCents).toBe(4 * 3850);
      expect(rma.originalPoNumber).toBe(po.poNumber);
    });

    it('supports Beacon, Home Depot Pro Desk, and Ferguson catalogs', () => {
      expect(DISTRIBUTOR_CATALOGS.beacon.branches.length).toBeGreaterThan(0);
      expect(DISTRIBUTOR_CATALOGS.home_depot_pro.branches.length).toBeGreaterThan(0);
      expect(DISTRIBUTOR_CATALOGS.ferguson.branches.length).toBeGreaterThan(0);
    });
  });

  describe('Certified Payroll Form WH-347 (Davis-Bacon Act Compliance)', () => {
    it('generates a compliant WH-347 certified payroll report with worker wage classifications', () => {
      const report = generateCertifiedPayrollWh347({
        payrollNumber: 12,
        weekEndingDate: '2026-09-05',
        contractorName: 'Apex Commercial Roofing LLC',
        contractorAddress: '1200 Industrial Blvd, Austin, TX 78704',
        projectName: 'Travis County Municipal Courthouse Re-Roof',
        projectLocation: 'Austin, TX',
        contractOrProjectNumber: 'TX-DOT-2026-88',
        signatoryName: 'Robert Vance',
        signatoryTitle: 'Chief Operating Officer',
        workers: [
          {
            workerName: 'Marcus Vance',
            lastFourSsn: '4821',
            workClassification: 'Journeyman Roofer',
            dailyHours: { monday: 8, tuesday: 8, wednesday: 8, thursday: 8, friday: 8, saturday: 0, sunday: 0 },
            straightTimeHours: 40,
            overtimeHours: 0,
            hourlyRateDollars: 34.5,
            hourlyFringeBenefitsDollars: 12.0,
            grossEarnedDollars: 1860.0,
            deductions: {
              ficaDollars: 142.29,
              federalWithholdingDollars: 220.0,
              stateTaxDollars: 0,
              otherDollars: 50.0,
              totalDeductionsDollars: 412.29,
            },
            netWagesPaidDollars: 1447.71,
          },
          {
            workerName: 'Carlos Ramirez',
            lastFourSsn: '9103',
            workClassification: 'Apprentice Roofer',
            dailyHours: { monday: 8, tuesday: 8, wednesday: 8, thursday: 8, friday: 8, saturday: 4, sunday: 0 },
            straightTimeHours: 40,
            overtimeHours: 4,
            hourlyRateDollars: 24.0,
            hourlyFringeBenefitsDollars: 8.5,
            grossEarnedDollars: 1464.0,
            deductions: {
              ficaDollars: 111.99,
              federalWithholdingDollars: 165.0,
              stateTaxDollars: 0,
              otherDollars: 30.0,
              totalDeductionsDollars: 306.99,
            },
            netWagesPaidDollars: 1157.01,
          },
        ],
      });

      expect(report.payrollNumber).toBe(12);
      expect(report.totalStraightTimeHours).toBe(80);
      expect(report.totalOvertimeHours).toBe(4);
      expect(report.totalGrossWagesDollars).toBe(3324.0);
      expect(report.statementOfCompliance.isCertifiedUnderPenaltyOfPerjury).toBe(true);

      const markdown = formatWh347ReportMarkdown(report);
      expect(markdown).toContain('Form WH-347');
      expect(markdown).toContain('Journeyman Roofer');
      expect(markdown).toContain('Statement of Compliance');
    });
  });

  describe('Subcontractor Certificate of Insurance (COI) Watchdog', () => {
    it('verifies an active ACORD 25 COI meeting $1M/$2M standard liability limits and Additional Insured endorsement', () => {
      const coi = evaluateSubcontractorCoi({
        subcontractorAccountId: 'sub-101',
        producerAgencyName: 'Statewide Risk Advisors',
        insuredEntityName: 'Hill Country Framing LLC',
        insuranceCarrierName: 'Travelers Casualty & Surety',
        policyNumber: 'TRV-GL-9948201',
        policyEffectiveDate: '2026-01-01',
        policyExpirationDate: '2027-01-01',
        coverageLimits: {
          generalLiabilityEachOccurrenceDollars: 1000000,
          generalAggregateDollars: 2000000,
          productsCompletedOpsAggregateDollars: 2000000,
          automobileLiabilityCombinedSingleLimitDollars: 1000000,
          workersCompensationEachAccidentDollars: 500000,
          umbrellaExcessLiabilityDollars: 2000000,
        },
        isAdditionalInsuredIncluded: true,
        certificateHolderName: 'Let\'s Get Quoted / Prime Contractor',
      });

      expect(coi.verificationStatus).toBe('verified_active');
      expect(coi.isDispatchAllowed).toBe(true);
      expect(coi.deficiencies.length).toBe(0);
      expect(coi.daysUntilExpiration).toBeGreaterThan(30);
    });

    it('flags policies expiring within 30 days and blocks dispatch on expired or sub-limit policies', () => {
      const expiringSoonDate = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const expiringCoi = evaluateSubcontractorCoi({
        subcontractorAccountId: 'sub-202',
        producerAgencyName: 'Lone Star Insurance Group',
        insuredEntityName: 'Austin Drywall Kings LLC',
        insuranceCarrierName: 'Hartford Fire Insurance Co',
        policyNumber: 'HART-77291',
        policyEffectiveDate: '2025-09-15',
        policyExpirationDate: expiringSoonDate,
        coverageLimits: STANDARD_MINIMUM_COI_LIMITS,
        isAdditionalInsuredIncluded: true,
        certificateHolderName: 'Let\'s Get Quoted',
      });

      expect(expiringCoi.verificationStatus).toBe('expiring_soon');
      expect(expiringCoi.isDispatchAllowed).toBe(true);

      const expiredCoi = evaluateSubcontractorCoi({
        subcontractorAccountId: 'sub-303',
        producerAgencyName: 'Budget Brokerage',
        insuredEntityName: 'Defunct Siding Pros',
        insuranceCarrierName: 'Subprime Indemnity',
        policyNumber: 'SUB-11029',
        policyEffectiveDate: '2025-01-01',
        policyExpirationDate: '2026-01-01', // Expired in the past
        coverageLimits: STANDARD_MINIMUM_COI_LIMITS,
        isAdditionalInsuredIncluded: false,
        certificateHolderName: 'Let\'s Get Quoted',
      });

      expect(expiredCoi.verificationStatus).toBe('expired');
      expect(expiredCoi.isDispatchAllowed).toBe(false);
      expect(expiredCoi.deficiencies.length).toBeGreaterThan(0);
    });
  });
});
