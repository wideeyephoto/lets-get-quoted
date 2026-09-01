import { describe, it, expect } from 'vitest';
import {
  TRADE_STARTER_CATALOGS,
  MASTER_TRADE_SKUS,
  GOOD_BETTER_BEST_ASSEMBLIES,
  REGIONAL_COST_INDEXES,
  listTradeStarterCatalogs,
  getStarterCatalogByTrade,
  resolveRegionalCostIndex,
  calculateMultiTierProposal,
  generateTradeSafetyAndToolManifest,
  generateTradeScopeContract,
  calculateTradeDimensionPackage,
} from '../src/lib/trade-catalogs';

describe('Expanded Trade Catalogs & Multi-Tier Assemblies Suite', () => {
  describe('1. Trade Starter Catalogs', () => {
    it('provides 21 comprehensive trade starter catalogs with items and icons', () => {
      const catalogs = listTradeStarterCatalogs();
      expect(catalogs.length).toBeGreaterThanOrEqual(20);

      const requiredTrades = [
        'plumbing',
        'electrical',
        'hvac',
        'roofing',
        'painting',
        'landscaping',
        'flooring',
        'masonry_concrete',
        'fencing_decking',
        'drywall_insulation',
        'siding_gutters',
        'solar_clean_energy',
        'windows_doors',
        'tree_service',
      ];

      for (const tradeId of requiredTrades) {
        const cat = getStarterCatalogByTrade(tradeId);
        expect(cat).toBeDefined();
        expect(cat?.items.length).toBeGreaterThanOrEqual(3);
        expect(cat?.icon).toBeTruthy();
        expect(cat?.description).toBeTruthy();

        // Verify each item has valid non-zero prices, descriptions, and units
        for (const item of cat!.items) {
          expect(item.name).toBeTruthy();
          expect(item.unitPrice).toBeGreaterThan(0);
          expect(item.unitCost).toBeGreaterThan(0);
          expect(item.unitPrice).toBeGreaterThanOrEqual(item.unitCost);
        }
      }
    });

    it('returns null for unknown trade catalog IDs', () => {
      expect(getStarterCatalogByTrade('nonexistent_trade_xyz')).toBeNull();
    });
  });

  describe('2. Master Trade SKU Database & Distributor Mappings', () => {
    it('has valid distributor cross-references for material supply chains', () => {
      expect(MASTER_TRADE_SKUS.length).toBeGreaterThan(5);

      for (const sku of MASTER_TRADE_SKUS) {
        expect(sku.sku).toBeTruthy();
        expect(sku.tradeId).toBeTruthy();
        expect(sku.unitCost).toBeGreaterThan(0);
        expect(sku.typicalMarkupPct).toBeGreaterThanOrEqual(20);
        expect(sku.laborHoursPerUnit).toBeGreaterThanOrEqual(0);
        expect(sku.distributors.length).toBeGreaterThan(0);
        expect(sku.specifications).toBeDefined();
      }
    });
  });

  describe('3. Regional Cost Index Resolution', () => {
    it('resolves regional multipliers correctly by state and region ID', () => {
      const nyIndex = resolveRegionalCostIndex('NY');
      expect(nyIndex.regionId).toBe('northeast_metro');
      expect(nyIndex.laborMultiplier).toBe(1.28);
      expect(nyIndex.materialMultiplier).toBe(1.14);

      const caIndex = resolveRegionalCostIndex('CA');
      expect(caIndex.regionId).toBe('west_coast');
      expect(caIndex.laborMultiplier).toBe(1.32);

      const txIndex = resolveRegionalCostIndex('TX');
      expect(txIndex.regionId).toBe('south_southeast');
      expect(txIndex.laborMultiplier).toBe(0.92);

      const baseline = resolveRegionalCostIndex();
      expect(baseline.regionId).toBe('national_baseline');
      expect(baseline.laborMultiplier).toBe(1.00);
      expect(baseline.materialMultiplier).toBe(1.00);
    });
  });

  describe('4. Good / Better / Best Multi-Tier Assembly Proposals', () => {
    it('calculates 3 structured proposal tiers with accurate margins and labor hours for roofing', () => {
      const proposal = calculateMultiTierProposal({
        tradeId: 'roofing',
        dimensionUnits: 25, // 25 squares (2500 sq ft)
        hourlyLaborRate: 80,
        pitchMultiplier: 1.15, // 4:12 to 7:12 pitch
        wasteFactorPct: 10,
        stateOrRegion: 'NY',
      });

      expect(proposal.tradeId).toBe('roofing');
      expect(proposal.region.regionId).toBe('northeast_metro');

      const { good, better, best } = proposal.tiers;

      // Tier ordering checks
      expect(good.financials.recommendedRetailPrice).toBeLessThan(better.financials.recommendedRetailPrice);
      expect(better.financials.recommendedRetailPrice).toBeLessThan(best.financials.recommendedRetailPrice);

      // Warranties
      expect(good.warrantyYears).toBe(25);
      expect(better.warrantyYears).toBe(50);
      expect(best.warrantyYears).toBe(50);

      // Gross profit margins
      expect(good.financials.grossMarginPct).toBeGreaterThanOrEqual(25);
      expect(better.financials.grossMarginPct).toBeGreaterThanOrEqual(30);
      expect(best.financials.grossMarginPct).toBeGreaterThanOrEqual(35);

      // Quantities scale with pitch and waste: 25 * 1.15 * 1.10 = 31.625
      expect(better.quantities.billableUnits).toBeCloseTo(31.6, 1);
      expect(better.quantities.laborHours).toBeGreaterThan(50);
    });

    it('calculates multi-tier HVAC replacement packages with proper equipment costing', () => {
      const proposal = calculateMultiTierProposal({
        tradeId: 'hvac',
        dimensionUnits: 1, // 1 complete system
        hourlyLaborRate: 90,
        stateOrRegion: 'CA',
      });

      const { good, better, best } = proposal.tiers;
      expect(good.packageName).toContain('14.3 SEER2');
      expect(better.packageName).toContain('16.5 SEER2');
      expect(best.packageName).toContain('20+ SEER2');

      expect(good.financials.recommendedRetailPrice).toBeGreaterThan(4000);
      expect(best.financials.recommendedRetailPrice).toBeGreaterThan(12000);
    });
  });

  describe('5. Safety & Tool Load-Out Manifest Generator', () => {
    it('generates trade-specific PPE and OSHA safety load-out checklists', () => {
      const roofSafety = generateTradeSafetyAndToolManifest('roofing');
      expect(roofSafety.safetyEquipment.some((item) => item.includes('Fall Arrest'))).toBe(true);
      expect(roofSafety.powerTools.some((tool) => tool.includes('Roofing Nailer'))).toBe(true);

      const elecSafety = generateTradeSafetyAndToolManifest('electrical');
      expect(elecSafety.ppeRequirements.some((ppe) => ppe.includes('Arc Flash') || ppe.includes('1000V'))).toBe(true);
      expect(elecSafety.safetyEquipment.some((eq) => eq.includes('Lockout/Tagout'))).toBe(true);

      const hvacSafety = generateTradeSafetyAndToolManifest('hvac');
      expect(hvacSafety.powerTools.some((t) => t.includes('Vacuum Pump') || t.includes('Recovery'))).toBe(true);
      expect(hvacSafety.hazmatDisposalNotes[0]).toContain('EPA Section 608');
    });
  });

  describe('6. Trade Scope Boilerplate & Warranty Clauses', () => {
    it('generates contractual inclusions, exclusions, and hidden damage provisions', () => {
      const roofContract = generateTradeScopeContract('roofing', 'better');
      expect(roofContract.standardInclusions.length).toBeGreaterThanOrEqual(3);
      expect(roofContract.standardExclusions.some((ex) => ex.includes('decking'))).toBe(true);
      expect(roofContract.hiddenDamageProvisions).toContain('substrate decking');
      expect(roofContract.warrantyTerms).toContain('50-Year');

      const plumbingContract = generateTradeScopeContract('plumbing', 'best');
      expect(plumbingContract.standardInclusions.some((inc) => inc.includes('haul-away'))).toBe(true);
      expect(plumbingContract.warrantyTerms).toContain('warranty');
    });
  });

  describe('7. Dynamic Trade Dimension Package Calculator', () => {
    it('calculates complete package result with selected tier, safety checklist, and contract clauses', () => {
      const result = calculateTradeDimensionPackage({
        tradeId: 'flooring',
        squareFeet: 1200,
        tier: 'better',
        stateCode: 'TX',
        hourlyRate: 65,
      });

      expect(result.proposal).toBeDefined();
      expect(result.selectedTier.tierKey).toBe('better');
      expect(result.selectedTier.packageName).toContain('20 mil');
      expect(result.selectedTier.financials.recommendedRetailPrice).toBeGreaterThan(3000);
      expect(result.safetyManifest.ppeRequirements.length).toBeGreaterThan(0);
      expect(result.scopeContract.standardInclusions.length).toBeGreaterThan(0);
    });
  });
});
