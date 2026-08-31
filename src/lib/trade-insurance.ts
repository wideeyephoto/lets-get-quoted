/**
 * Trade insurance eligibility, building code references, and UPPA compliance guardrails.
 *
 * Provides pure lookup functions and domain metadata to ensure insurance claims assistance
 * is only surfaced for trades that genuinely work with property/casualty insurance (roofing,
 * tree care, water mitigation, fire restoration, storm recovery, siding, emergency plumbing).
 */

export type InsuranceTradeProfile = {
  tradeSlug: string;
  name: string;
  commonPerils: string[];
  primaryCodeCitations: Array<{
    code: string;
    description: string;
    requirement: string;
  }>;
  standardSupplements: Array<{
    item: string;
    typicalCodeRef: string;
    reason: string;
    defaultEstimatedCost: number;
  }>;
  inspectionFocusAreas: string[];
  disclaimerNote: string;
};

/**
 * Slugs of trades that routinely handle homeowner insurance claims and storm/disaster repairs.
 */
export const INSURANCE_ELIGIBLE_TRADE_SLUGS = new Set<string>([
  'roofers',
  'tree-services',
  'water-damage-restoration',
  'fire-damage-restoration',
  'mold-remediation',
  'disaster-recovery',
  'siding',
  'gutters',
  'emergency-plumbing',
  'biohazard-remediation',
  'general-contractor',
]);

const ELIGIBLE_TRADE_STEMS = [
  'roof',
  'tree',
  'water',
  'flood',
  'storm',
  'restoration',
  'fire',
  'mold',
  'siding',
  'gutter',
  'plumb',
  'biohazard',
  'disaster',
];

/**
 * Checks if a given trade slug naturally deals with homeowners insurance claims.
 */
export function isInsuranceEligibleTrade(tradeSlug: string | undefined | null): boolean {
  if (!tradeSlug) return false;
  const normalized = tradeSlug.toLowerCase().trim();
  if (INSURANCE_ELIGIBLE_TRADE_SLUGS.has(normalized)) return true;

  // Handle trade stems and sub-categories
  return ELIGIBLE_TRADE_STEMS.some((stem) => normalized.includes(stem));
}

/**
 * Checks whether the site or contractor profile should display insurance claims tools and UI.
 */
export function shouldShowInsuranceFeatures(site: {
  trade_slug?: string | null;
  trade?: string | null;
  enable_insurance_intake?: boolean | null;
}): boolean {
  // If explicitly overridden by the contractor in business settings
  if (typeof site.enable_insurance_intake === 'boolean') {
    return site.enable_insurance_intake;
  }
  const slug = site.trade_slug || site.trade;
  return isInsuranceEligibleTrade(slug);
}

/**
 * Trade-specific insurance profile data, code citations, and common omitted supplements.
 */
export const INSURANCE_TRADE_PROFILES: Record<string, InsuranceTradeProfile> = {
  roofers: {
    tradeSlug: 'roofers',
    name: 'Roofing & Exterior Restoration',
    commonPerils: ['Hail Impact', 'Wind Uplift & Shingle Creasing', 'Fallen Tree / Limb Impact', 'Ice Damming / Leaks'],
    primaryCodeCitations: [
      {
        code: 'IRC R905.2.8.5',
        description: 'Drip Edge Requirement',
        requirement: 'Drip edge shall be provided at eaves and gables of shingle roofs. Adjacent segments shall overlap not less than 2 inches.',
      },
      {
        code: 'IRC R905.1.2',
        description: 'Ice Barrier / Ice & Water Shield',
        requirement: 'In areas where there has been a history of ice forming along the eaves, an ice barrier shall consist of not less than two layers of underlayment cement.',
      },
      {
        code: 'IRC R905.2.8.2',
        description: 'Valleys & Valley Linings',
        requirement: 'Valley linings shall be installed in accordance with manufacturer instructions and mineral-surfaced roll roofing or metal lining.',
      },
      {
        code: 'IRC R908.3.1.1',
        description: 'Roof Recovering & Complete Tear-Off',
        requirement: 'A new roof covering shall not be installed without first removing all existing coverings down to the roof deck when existing roof is water soaked or has 2+ layers.',
      },
    ],
    standardSupplements: [
      {
        item: 'Drip Edge (Eaves & Rakes)',
        typicalCodeRef: 'IRC R905.2.8.5',
        reason: 'Omitted from initial adjuster scope; required by current local building code.',
        defaultEstimatedCost: 650,
      },
      {
        item: 'Ice & Water Shield (Valleys & Eaves)',
        typicalCodeRef: 'IRC R905.1.2',
        reason: 'Required membrane underlayment in freezing/climate zones not included in basic felt scope.',
        defaultEstimatedCost: 850,
      },
      {
        item: 'Starter Strip Shingles',
        typicalCodeRef: 'Manufacturer Specs & IRC R905.2.5',
        reason: 'Universal starter course along all perimeter eaves and rakes to prevent wind uplift.',
        defaultEstimatedCost: 480,
      },
      {
        item: 'Ridge Cap Shingles & High-Profile Cap',
        typicalCodeRef: 'Manufacturer System Warranty',
        reason: 'Adjuster allowed for field cut 3-tab shingles instead of matching architectural ridge cap.',
        defaultEstimatedCost: 520,
      },
      {
        item: 'Steep / High Story Access & Safety Rigging',
        typicalCodeRef: 'OSHA 1926.501 / Xactimate Pitch Surcharge',
        reason: 'Roof pitch exceeds 7/12 slope and requires specialized fall arrest and steep labor multiplier.',
        defaultEstimatedCost: 750,
      },
      {
        item: 'Dumpster & Waste Removal Disposal Fees',
        typicalCodeRef: 'Xactimate DMO / Landfill Receipts',
        reason: 'Adjuster allowed inadequate tonnage for double-layer tear-off disposal.',
        defaultEstimatedCost: 600,
      },
    ],
    inspectionFocusAreas: [
      'Soft metals (gutters, downspouts, box vents) for hail impact corroboration',
      'Wind-creased shingle tabs along windward slope',
      'Granule loss in water flow lines and gutters',
      'Underlayment rot and roof decking substrate condition',
    ],
    disclaimerNote: 'All scope adjustments are based on physical on-site inspection and local IRC building codes.',
  },
  'tree-services': {
    tradeSlug: 'tree-services',
    name: 'Emergency Tree Care & Hazardous Removal',
    commonPerils: ['Windstorm Blowdown', 'Ice / Snow Accumulation Weight', 'Tree Impact on Structure or Driveway', 'Utility Line Threat'],
    primaryCodeCitations: [
      {
        code: 'ANSI A300 (Part 1 & 9)',
        description: 'Tree Care Safety & Emergency Removal Standards',
        requirement: 'Safe dismantling of storm-damaged trees with rigging, crane support, and structural risk abatement.',
      },
      {
        code: 'Homeowners Policy Debris Removal Clause',
        description: 'Covered Structure Debris Extraction',
        requirement: 'Removal of tree debris that has fallen and caused structural damage or blocks driveway access.',
      },
    ],
    standardSupplements: [
      {
        item: 'Crane / Heavy Rigging & Equipment Access Fee',
        typicalCodeRef: 'ANSI A300 / Xactimate TRE CRN',
        reason: 'Tree resting on dwelling structure requires remote crane pick to prevent catastrophic wall collapse.',
        defaultEstimatedCost: 2800,
      },
      {
        item: 'Emergency Tarping & Roof Puncture Mitigation',
        typicalCodeRef: 'Policyholder Mitigation Duty',
        reason: 'Immediate temporary protection of roof opening from secondary interior water infiltration.',
        defaultEstimatedCost: 950,
      },
      {
        item: 'Debris Haul-Off & Wood Chipping (Off-Structure)',
        typicalCodeRef: 'Xactimate TRE HAUL',
        reason: 'Complete extraction of tree trunk off dwelling and haul-away from property perimeter.',
        defaultEstimatedCost: 1200,
      },
      {
        item: 'Stump Grinding to Grade (Impact Hazard)',
        typicalCodeRef: 'Xactimate TRE STUMP',
        reason: 'Uprooted root ball posing immediate hazard to foundation or underground utility line.',
        defaultEstimatedCost: 550,
      },
    ],
    inspectionFocusAreas: [
      'Structural contact points where trunk or heavy limbs rest on roof or walls',
      'Uprooted root plates shifting soil against foundation or plumbing',
      'Split crotches and hung limb hazards (widowmakers)',
    ],
    disclaimerNote: 'Emergency mitigation performed immediately to fulfill policyholder duty to prevent further loss.',
  },
  'water-damage-restoration': {
    tradeSlug: 'water-damage-restoration',
    name: 'Water Mitigation & Structural Drying',
    commonPerils: ['Burst Pipe / Freeze', 'Appliance Supply Line Failure', 'Water Heater Rupture', 'Sewer / Drain Backup (Endorsement)'],
    primaryCodeCitations: [
      {
        code: 'IICRC S500',
        description: 'Standard for Professional Water Damage Restoration',
        requirement: 'Comprehensive psychrometric drying protocols, category classification (Cat 1/2/3), and microbial prevention.',
      },
    ],
    standardSupplements: [
      {
        item: 'Commercial Air Scrubbers / HEPA Negative Air',
        typicalCodeRef: 'IICRC S500 Cat 2/3 Protocol',
        reason: 'Omitted from initial scope; mandatory containment for contaminated or porous structural materials.',
        defaultEstimatedCost: 750,
      },
      {
        item: 'Antimicrobial / Biocide Application',
        typicalCodeRef: 'IICRC S500 Sec 12.3',
        reason: 'Sanitization of affected subflooring, framing studs, and sill plates prior to structural dry-out.',
        defaultEstimatedCost: 450,
      },
      {
        item: 'Baseboard Removal & Wall Cavity Injection Drying',
        typicalCodeRef: 'IICRC S500 Psychrometric Standard',
        reason: 'Sub-surface moisture trapped inside insulated wall cavities requiring positive air injection.',
        defaultEstimatedCost: 650,
      },
      {
        item: 'Moisture Mapping & Thermal Imaging Documentation Fee',
        typicalCodeRef: 'Xactimate WTR MTR',
        reason: 'Daily psychrometric logs and moisture meter readings verifying dry standard achievement.',
        defaultEstimatedCost: 400,
      },
    ],
    inspectionFocusAreas: [
      'Moisture migration beneath hardwood flooring and underlayment',
      'Insulation saturation behind drywall',
      'Mold spore germination in dark wall cavities within 48-72 hours',
    ],
    disclaimerNote: 'Drying standards strictly adhere to IICRC S500 guidelines.',
  },
};

/**
 * Returns the insurance profile for a trade or defaults to a generalized exterior restoration profile.
 */
export function getInsuranceTradeProfile(tradeSlug: string | undefined | null): InsuranceTradeProfile {
  if (!tradeSlug) return INSURANCE_TRADE_PROFILES.roofers;
  const normalized = tradeSlug.toLowerCase().trim();

  if (normalized.includes('tree')) return INSURANCE_TRADE_PROFILES['tree-services'];
  if (normalized.includes('water') || normalized.includes('flood') || normalized.includes('plumb')) {
    return INSURANCE_TRADE_PROFILES['water-damage-restoration'];
  }
  return INSURANCE_TRADE_PROFILES.roofers;
}

/**
 * Unauthorized Practice of Public Adjusting (UPPA) compliance guidance for contractors.
 */
export const UPPA_COMPLIANCE_RULES = Object.freeze([
  {
    rule: 'Never negotiate policy coverage or interpret policy language for the homeowner.',
    guideline: 'Discuss physical damage and repair costs only. Let the policyholder speak with their adjuster regarding coverage limits.',
  },
  {
    rule: 'Never promise to "waive" or "pay" the homeowner\'s insurance deductible.',
    guideline: 'Waiver of deductibles is illegal in most states. Offer legal 0% APR financing or payment plans for their deductible instead.',
  },
  {
    rule: 'Always provide itemized, verifiable estimates based on physical evidence.',
    guideline: 'Support every line item with date-stamped photos, manufacturer installation instructions, or local building code citations.',
  },
]);
