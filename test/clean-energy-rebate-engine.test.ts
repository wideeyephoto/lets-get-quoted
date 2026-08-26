import { describe, it, expect } from 'vitest';
import {
  FEDERAL_IRA_RULES,
  calculateCleanEnergyRebates,
} from '../src/lib/rebates/clean-energy-rebate-engine';

describe('IRA & Utility Clean Energy Rebate Engine', () => {
  it('contains statutory IRA 25C, 25D, and 30C rules and caps', () => {
    expect(FEDERAL_IRA_RULES.heat_pump_hvac.codeSection).toBe('25C');
    expect(FEDERAL_IRA_RULES.heat_pump_hvac.creditPercentage).toBe(0.30);
    expect(FEDERAL_IRA_RULES.heat_pump_hvac.maxCapDollars).toBe(2000);

    expect(FEDERAL_IRA_RULES.solar_rooftop_pv.codeSection).toBe('25D');
    expect(FEDERAL_IRA_RULES.solar_rooftop_pv.creditPercentage).toBe(0.30);
    expect(FEDERAL_IRA_RULES.solar_rooftop_pv.maxCapDollars).toBeNull(); // Uncapped 30%

    expect(FEDERAL_IRA_RULES.ev_charger_level2.codeSection).toBe('30C');
    expect(FEDERAL_IRA_RULES.ev_charger_level2.maxCapDollars).toBe(1000);
  });

  it('calculates Federal Heat Pump tax credit capped at $2,000 + DTE Energy $1,200 rebate', () => {
    const report = calculateCleanEnergyRebates({
      category: 'heat_pump_hvac',
      state: 'MI',
      projectCost: 9500,
    });

    // 30% of $9,500 = $2,850 -> Capped at $2,000
    expect(report.incentives.federalTaxCredit.calculatedAmount).toBe(2000);
    expect(report.incentives.federalTaxCredit.capApplied).toBe(true);

    // DTE rebate = $1,200
    expect(report.incentives.utilityRebate?.cashRebateAmount).toBe(1200);

    // Net calculation
    expect(report.financialSummary.grossPrice).toBe(9500);
    expect(report.financialSummary.totalIncentives).toBe(3200);
    expect(report.financialSummary.netHomeownerCost).toBe(9500 - 3200);
    expect(report.financialSummary.totalSavingsPercent).toBeGreaterThan(30);
  });

  it('calculates uncapped 30% solar rooftop PV tax credit on a $28,000 installation', () => {
    const report = calculateCleanEnergyRebates({
      category: 'solar_rooftop_pv',
      state: 'CA',
      projectCost: 28000,
    });

    // 30% of $28,000 = $8,400 uncapped
    expect(report.incentives.federalTaxCredit.calculatedAmount).toBe(8400);
    expect(report.incentives.federalTaxCredit.capApplied).toBe(false);
    expect(report.financialSummary.netHomeownerCost).toBe(28000 - 8400);
  });

  it('calculates EV Level 2 charger installation tax credit', () => {
    const report = calculateCleanEnergyRebates({
      category: 'ev_charger_level2',
      state: 'MI',
      projectCost: 1800,
    });

    // 30% of $1,800 = $540 (under $1,000 cap)
    expect(report.incentives.federalTaxCredit.calculatedAmount).toBe(540);
    expect(report.incentives.federalTaxCredit.capApplied).toBe(false);
  });
});
