export type CleanEnergyWorkCategory =
  | 'heat_pump_hvac'
  | 'heat_pump_water_heater'
  | 'central_ac_high_efficiency'
  | 'electrical_panel_200a'
  | 'ev_charger_level2'
  | 'solar_rooftop_pv'
  | 'battery_storage'
  | 'roof_insulation_air_sealing';

export type FederalIraIncentive = {
  codeSection: '25C' | '25D' | '30C';
  programName: string;
  creditPercentage: number; // e.g. 0.30 (30%)
  maxCapDollars: number | null; // null for uncapped 25D
  applicableRequirements: string[];
};

export const FEDERAL_IRA_RULES: Record<CleanEnergyWorkCategory, FederalIraIncentive> = {
  heat_pump_hvac: {
    codeSection: '25C',
    programName: 'IRA Section 25C - Energy Efficient Home Improvement Credit (Heat Pump)',
    creditPercentage: 0.30,
    maxCapDollars: 2000,
    applicableRequirements: [
      'Must meet CEE Highest Tier / ENERGY STAR Cold Climate ratings',
      'Primary residence or existing residential dwelling',
    ],
  },
  heat_pump_water_heater: {
    codeSection: '25C',
    programName: 'IRA Section 25C - Heat Pump Water Heater Credit',
    creditPercentage: 0.30,
    maxCapDollars: 2000,
    applicableRequirements: [
      'Uniform Energy Factor (UEF) >= 3.3 for electric heat pump water heater',
    ],
  },
  central_ac_high_efficiency: {
    codeSection: '25C',
    programName: 'IRA Section 25C - High Efficiency Central Air Conditioner',
    creditPercentage: 0.30,
    maxCapDollars: 600,
    applicableRequirements: [
      'ENERGY STAR Most Efficient SEER2 >= 16.0',
    ],
  },
  electrical_panel_200a: {
    codeSection: '25C',
    programName: 'IRA Section 25C - Electrical Panel Service Upgrade',
    creditPercentage: 0.30,
    maxCapDollars: 600,
    applicableRequirements: [
      'Installed in conjunction with qualifying heat pump or electrical appliance',
      'Panel capacity must be 200 amps or greater',
    ],
  },
  ev_charger_level2: {
    codeSection: '30C',
    programName: 'IRA Section 30C - Alternative Fuel Vehicle Refueling (EV Charger)',
    creditPercentage: 0.30,
    maxCapDollars: 1000,
    applicableRequirements: [
      'Installed in eligible census tract (non-urban / low-income)',
      'Dedicated 240V Level 2 EVSE charging equipment',
    ],
  },
  solar_rooftop_pv: {
    codeSection: '25D',
    programName: 'IRA Section 25D - Residential Clean Energy Credit (Solar PV)',
    creditPercentage: 0.30,
    maxCapDollars: null, // Uncapped 30%
    applicableRequirements: [
      'Applies to solar panels, inverters, racking, and professional installation',
      'No dollar limit cap',
    ],
  },
  battery_storage: {
    codeSection: '25D',
    programName: 'IRA Section 25D - Home Battery Energy Storage',
    creditPercentage: 0.30,
    maxCapDollars: null, // Uncapped 30%
    applicableRequirements: [
      'Battery capacity must be 3 kilowatt-hours (kWh) or greater',
    ],
  },
  roof_insulation_air_sealing: {
    codeSection: '25C',
    programName: 'IRA Section 25C - Insulation & Weatherization Materials',
    creditPercentage: 0.30,
    maxCapDollars: 1200,
    applicableRequirements: [
      'Meets International Energy Conservation Code (IECC) standards for climate zone',
    ],
  },
};

export type UtilityRebateProgram = {
  utilityName: string;
  state: string;
  category: CleanEnergyWorkCategory;
  cashRebateAmount: number;
  programTitle: string;
};

export const SAMPLE_UTILITY_REBATES: UtilityRebateProgram[] = [
  { utilityName: 'DTE Energy', state: 'MI', category: 'heat_pump_hvac', cashRebateAmount: 1200, programTitle: 'DTE Clean Heat Pump Incentive' },
  { utilityName: 'DTE Energy', state: 'MI', category: 'ev_charger_level2', cashRebateAmount: 500, programTitle: 'DTE Charging Forward EV Rebate' },
  { utilityName: 'Consumers Energy', state: 'MI', category: 'heat_pump_hvac', cashRebateAmount: 1000, programTitle: 'Consumers Energy Heat Pump Bonus' },
  { utilityName: 'PG&E', state: 'CA', category: 'heat_pump_hvac', cashRebateAmount: 1500, programTitle: 'PG&E Residential HVAC Comfort Rebate' },
  { utilityName: 'PG&E', state: 'CA', category: 'electrical_panel_200a', cashRebateAmount: 750, programTitle: 'PG&E Panel Modernization Incentive' },
  { utilityName: 'Con Edison', state: 'NY', category: 'heat_pump_hvac', cashRebateAmount: 2500, programTitle: 'ConEd Clean Heat Program' },
  { utilityName: 'FPL', state: 'FL', category: 'central_ac_high_efficiency', cashRebateAmount: 600, programTitle: 'FPL Home Energy Efficiency Rebate' },
];

export type CleanEnergyRebateReport = {
  category: CleanEnergyWorkCategory;
  state: string;
  grossContractPrice: number;
  incentives: {
    federalTaxCredit: {
      programName: string;
      codeSection: string;
      percentage: number;
      calculatedAmount: number;
      capApplied: boolean;
      maxCap: number | null;
    };
    utilityRebate: {
      utilityName: string;
      programTitle: string;
      cashRebateAmount: number;
    } | null;
  };
  financialSummary: {
    grossPrice: number;
    totalIncentives: number;
    netHomeownerCost: number;
    totalSavingsPercent: number;
  };
  complianceGuidance: string[];
};

/**
 * Calculates federal tax credits and local utility cash rebates for a clean energy project.
 */
export function calculateCleanEnergyRebates(input: {
  category: CleanEnergyWorkCategory;
  state: string;
  projectCost: number;
  utilityName?: string;
}): CleanEnergyRebateReport {
  const cost = Math.max(0, input.projectCost);
  const fedRule = FEDERAL_IRA_RULES[input.category] || FEDERAL_IRA_RULES.heat_pump_hvac;

  // 1. Calculate Federal IRA Tax Credit
  const rawFedCredit = Math.round(cost * fedRule.creditPercentage);
  const calculatedFedAmount = fedRule.maxCapDollars != null
    ? Math.min(rawFedCredit, fedRule.maxCapDollars)
    : rawFedCredit;

  const capApplied = fedRule.maxCapDollars != null && rawFedCredit > fedRule.maxCapDollars;

  // 2. Calculate Local Utility Rebate
  const matchingUtility = SAMPLE_UTILITY_REBATES.find(
    (u) => u.state.toUpperCase() === input.state.toUpperCase() && u.category === input.category,
  ) || (cost >= 2000 && input.category !== 'solar_rooftop_pv' && input.category !== 'battery_storage' ? {
    utilityName: input.utilityName || 'Local Electric Utility',
    state: input.state,
    category: input.category,
    cashRebateAmount: Math.min(500, Math.round(cost * 0.08)),
    programTitle: 'Standard Clean Energy Efficiency Rebate',
  } : null);

  const utilityAmount = matchingUtility ? matchingUtility.cashRebateAmount : 0;
  const totalIncentives = calculatedFedAmount + utilityAmount;
  const netHomeownerCost = Math.max(0, cost - totalIncentives);
  const totalSavingsPercent = cost > 0 ? Math.round((totalIncentives / cost) * 1000) / 10 : 0;

  return {
    category: input.category,
    state: input.state.toUpperCase(),
    grossContractPrice: cost,
    incentives: {
      federalTaxCredit: {
        programName: fedRule.programName,
        codeSection: fedRule.codeSection,
        percentage: fedRule.creditPercentage,
        calculatedAmount: calculatedFedAmount,
        capApplied,
        maxCap: fedRule.maxCapDollars,
      },
      utilityRebate: matchingUtility ? {
        utilityName: matchingUtility.utilityName,
        programTitle: matchingUtility.programTitle,
        cashRebateAmount: utilityAmount,
      } : null,
    },
    financialSummary: {
      grossPrice: cost,
      totalIncentives,
      netHomeownerCost,
      totalSavingsPercent,
    },
    complianceGuidance: [
      ...fedRule.applicableRequirements,
      'Contractor must provide AHRI Certificate of Certified Product Performance for IRS Form 5695 submittal.',
    ],
  };
}
