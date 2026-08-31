/**
 * Domain types, heuristic scope parsers, supplement detectors, and letter builders
 * for Homeowner Insurance Claims.
 */

import {
  getInsuranceTradeProfile,
  type InsuranceTradeProfile,
} from './trade-insurance';

export type InsuranceClaimStatus =
  | 'draft'
  | 'intake_assessment'
  | 'scope_received'
  | 'supplement_pending'
  | 'approved'
  | 'invoiced'
  | 'closed';

export type ClaimFinancialFigures = {
  rcv: number | null; // Replacement Cost Value
  acv: number | null; // Actual Cash Value
  depreciation: number | null; // Recoverable / Non-recoverable depreciation
  deductible: number | null; // Policyholder deductible
  netClaim: number | null; // Initial insurance payment issued
};

export type ScopeDiscrepancy = {
  id: string;
  item: string;
  codeCitation?: string;
  reason: string;
  category: 'code_compliance' | 'manufacturer_spec' | 'missed_scope' | 'labor_surcharge';
  estimatedCost: number;
  selected: boolean;
};

export type SupplementAnalysisResult = {
  tradeSlug: string;
  parsedFigures: ClaimFinancialFigures;
  rawScopeSummary: string;
  discrepancies: ScopeDiscrepancy[];
  totalEstimatedSupplement: number;
  adjustedTotalRcv: number | null;
  justificationDraft: string;
};

export type ClaimFeasibilityAssessment = {
  feasibilityScore: number; // 0 - 100
  probability: 'high' | 'moderate' | 'low' | 'unlikely';
  recommendation: 'file_claim' | 'inspection_first' | 'out_of_pocket_maintenance';
  estimatedDamageRange: { min: number; max: number };
  detectedPerils: string[];
  observedDamagePoints: string[];
  riskFactors: string[];
  homeownerSummary: string;
  contractorBrief: string;
};

export type HomeownerCopilotFaq = {
  question: string;
  shortAnswer: string;
  detailedExplanation: string;
  category: 'terms' | 'process' | 'rights' | 'costs';
};

/**
 * Common Homeowner Claim questions answered in plain English with UPPA compliance.
 */
export const HOMEOWNER_CLAIM_FAQS: HomeownerCopilotFaq[] = [
  {
    question: 'What is the difference between RCV and ACV?',
    shortAnswer: 'RCV is the full replacement cost today; ACV is the value after subtracting age and depreciation.',
    detailedExplanation:
      'Replacement Cost Value (RCV) represents the actual amount required to repair or replace your property with brand-new materials at current prices. Actual Cash Value (ACV) is the initial check your insurance company writes, which deducts depreciation based on age. Once our work is completed and final invoices are submitted, your insurance company releases the withheld depreciation (Recoverable Depreciation) directly to you.',
    category: 'terms',
  },
  {
    question: 'Do I have to use the insurance company’s preferred contractor?',
    shortAnswer: 'No. You have the legal right to hire any licensed, insured contractor you trust.',
    detailedExplanation:
      'Under state insurance regulations, policyholders are entitled to choose their own contractor. "Preferred" vendors often work under fixed-rate agreements with insurers. Hiring an independent, reputable local contractor ensures that your best interests and complete property restoration are prioritized.',
    category: 'rights',
  },
  {
    question: 'Can a contractor waive or pay my insurance deductible?',
    shortAnswer: 'No, waiving deductibles is illegal in most states. We offer 0% financing options instead.',
    detailedExplanation:
      'State laws strictly forbid contractors from waiving, rebating, or paying a homeowner’s deductible, making it illegal in most states. Doing so can constitute insurance fraud. However, we offer flexible, zero-interest payment plans and low monthly financing options to make your deductible manageable.',
    category: 'costs',
  },
  {
    question: 'Will filing a weather-related storm claim raise my insurance rates?',
    shortAnswer: 'Generally no for single Acts of God, though regional rates are determined by neighborhood storm severity.',
    detailedExplanation:
      'In most states, insurance companies cannot penalize or cancel an individual policyholder solely for filing an "Act of God" claim (such as hail, tornado, or sudden windstorm). However, if an entire zip code experiences severe catastrophe damage, regional baseline rates for the whole area may adjust over time.',
    category: 'process',
  },
  {
    question: 'What is an insurance supplement?',
    shortAnswer: 'A line-item request submitted to your insurance adjuster for code-required items omitted from their initial estimate.',
    detailedExplanation:
      'Insurance adjusters frequently miss local building code mandates (such as drip edge, ice and water shield, or heavy crane rigging). A supplement provides photographic proof and code documentation so the insurance company pays for the full, code-compliant restoration.',
    category: 'process',
  },
];

/**
 * Heuristic parser to extract dollar figures (RCV, ACV, Deductible, Net Claim) from adjuster scope text.
 */
export function extractClaimFiguresFromText(text: string): ClaimFinancialFigures {
  if (!text) {
    return { rcv: null, acv: null, depreciation: null, deductible: null, netClaim: null };
  }

  const clean = text.replace(/,/g, '');

  const parsePattern = (regex: RegExp): number | null => {
    const match = clean.match(regex);
    if (!match || !match[1]) return null;
    const num = parseFloat(match[1]);
    return Number.isFinite(num) ? Math.round(num * 100) / 100 : null;
  };

  // Common Xactimate / Adjuster text markers (handling parentheses like (RCV), colons, and dollar signs)
  const rcv = parsePattern(/(?:replacement\s*cost\s*value|total\s*rcv|rcv\s*total|\brcv\b)[^\d\n]*?\$?\s*(\d+(?:\.\d{2})?)/i);
  const acv = parsePattern(/(?:actual\s*cash\s*value|total\s*acv|acv\s*total|\bacv\b)[^\d\n]*?\$?\s*(\d+(?:\.\d{2})?)/i);
  const depreciation = parsePattern(/(?:total\s*depreciation|\bdepreciation\b|recov(?:erable)?\s*depr)[^\d\n]*?\$?\s*(\d+(?:\.\d{2})?)/i);
  const deductible = parsePattern(/(?:policy\s*deductible|net\s*deductible|\bdeductible\b)[^\d\n]*?\$?\s*(\d+(?:\.\d{2})?)/i);
  const netClaim = parsePattern(/(?:net\s*claim|net\s*payment|net\s*actual\s*cash|check\s*amount)[^\d\n]*?\$?\s*(\d+(?:\.\d{2})?)/i);

  return { rcv, acv, depreciation, deductible, netClaim };
}

/**
 * Identifies missing code items and standard supplements by analyzing the scope text
 * against trade-specific building codes.
 */
export function detectScopeDiscrepancies(
  scopeText: string,
  tradeSlug = 'roofers'
): ScopeDiscrepancy[] {
  const profile: InsuranceTradeProfile = getInsuranceTradeProfile(tradeSlug);
  const lowerScope = (scopeText || '').toLowerCase();
  const discrepancies: ScopeDiscrepancy[] = [];

  for (let i = 0; i < profile.standardSupplements.length; i++) {
    const supp = profile.standardSupplements[i];
    const itemWords = supp.item.toLowerCase().split(/\s+/).filter((w) => w.length > 3 && !['with', 'along', 'from'].includes(w));
    
    // Check if the item appears in the scope text
    const isPresent = itemWords.some((word) => lowerScope.includes(word));

    // If omitted, flag as a potential supplement
    if (!isPresent) {
      discrepancies.push({
        id: `supp-${i + 1}`,
        item: supp.item,
        codeCitation: supp.typicalCodeRef,
        reason: supp.reason,
        category: supp.typicalCodeRef.includes('IRC') || supp.typicalCodeRef.includes('IICRC') || supp.typicalCodeRef.includes('ANSI')
          ? 'code_compliance'
          : 'missed_scope',
        estimatedCost: supp.defaultEstimatedCost,
        selected: true,
      });
    }
  }

  return discrepancies;
}

/**
 * Builds a structured supplement analysis result from scope text and trade.
 */
export function buildSupplementAnalysis(
  scopeText: string,
  tradeSlug = 'roofers'
): SupplementAnalysisResult {
  const parsedFigures = extractClaimFiguresFromText(scopeText);
  const discrepancies = detectScopeDiscrepancies(scopeText, tradeSlug);
  const totalEstimatedSupplement = discrepancies
    .filter((d) => d.selected)
    .reduce((sum, d) => sum + d.estimatedCost, 0);

  const adjustedTotalRcv = parsedFigures.rcv ? parsedFigures.rcv + totalEstimatedSupplement : null;

  const rawScopeSummary = scopeText.trim()
    ? `Analyzed ${scopeText.split('\n').length} lines of adjuster scope.`
    : 'No scope text provided.';

  const justificationDraft = generateAdjusterLetterDraft({
    tradeSlug,
    claimNumber: 'Pending / On File',
    policyholderName: 'Valued Client',
    propertyAddress: 'Inspected Residence',
    adjusterName: 'Insurance Desk Adjuster',
    carrierName: 'Property Insurance Carrier',
    dateOfLoss: 'Recent Storm / Event',
    discrepancies,
    initialRcv: parsedFigures.rcv,
  });

  return {
    tradeSlug,
    parsedFigures,
    rawScopeSummary,
    discrepancies,
    totalEstimatedSupplement,
    adjustedTotalRcv,
    justificationDraft,
  };
}

/**
 * Generates a formal, UPPA-compliant Adjuster Supplement Justification letter.
 */
export function generateAdjusterLetterDraft(params: {
  tradeSlug?: string;
  claimNumber?: string;
  policyholderName?: string;
  propertyAddress?: string;
  adjusterName?: string;
  carrierName?: string;
  dateOfLoss?: string;
  discrepancies: ScopeDiscrepancy[];
  initialRcv?: number | null;
}): string {
  const {
    tradeSlug = 'roofers',
    claimNumber = '[Claim #]',
    policyholderName = '[Policyholder Name]',
    propertyAddress = '[Property Address]',
    adjusterName = 'Adjuster Team',
    carrierName = '[Insurance Carrier]',
    dateOfLoss = '[Date of Loss]',
    discrepancies = [],
    initialRcv = null,
  } = params;

  const profile = getInsuranceTradeProfile(tradeSlug);
  const activeDiscrepancies = discrepancies.filter((d) => d.selected);
  const supplementTotal = activeDiscrepancies.reduce((sum, d) => sum + d.estimatedCost, 0);

  const lines: string[] = [
    `RE: Supplement Request & Physical Scope Clarification`,
    `Policyholder: ${policyholderName}`,
    `Claim Number: ${claimNumber}`,
    `Date of Loss: ${dateOfLoss}`,
    `Risk Location: ${propertyAddress}`,
    `Insurance Carrier: ${carrierName}`,
    `Attn: ${adjusterName}`,
    ``,
    `Dear ${adjusterName},`,
    ``,
    `We have conducted a thorough physical inspection of the property located at ${propertyAddress} following the covered loss event.`,
    `Upon reviewing your initial scope of loss${initialRcv ? ` (Initial RCV: $${initialRcv.toLocaleString()})` : ''}, we identified several mandatory building code items and manufacturer-specified materials omitted from the estimate that are required to complete a code-compliant, workmanlike restoration.`,
    ``,
    `### Itemized Scope Adjustments & Code Justifications:`,
    ``,
  ];

  activeDiscrepancies.forEach((item, index) => {
    lines.push(
      `${index + 1}. **${item.item}** (Estimated: $${item.estimatedCost.toLocaleString()})`,
      `   - **Authority / Code Ref**: ${item.codeCitation || 'Manufacturer Specification & Building Code'}`,
      `   - **Justification**: ${item.reason}`,
      ``
    );
  });

  lines.push(
    `---`,
    `**Total Supplement Amount Requested**: $${supplementTotal.toLocaleString()}`,
    initialRcv ? `**Revised Total RCV Scope**: $${(initialRcv + supplementTotal).toLocaleString()}` : '',
    ``,
    `Please review the attached physical photo documentation, manufacturer installation guidelines, and local jurisdiction code requirements. We request that you issue an updated scope reflecting these required items at your earliest convenience so that repairs may proceed without delay.`,
    ``,
    `Sincerely,`,
    `Project Estimator & Field Team`,
    `${profile.name}`,
    `[Phone & Direct Email]`
  );

  return lines.filter(Boolean).join('\n');
}

/**
 * Heuristic rule engine for evaluating damage claim feasibility based on homeowner input.
 */
export function evaluateDamageClaimFeasibilityHeuristic(input: {
  tradeSlug?: string;
  damageDescription: string;
  reportedPeril?: string;
  approxAgeYears?: number;
  knownDeductible?: number;
}): ClaimFeasibilityAssessment {
  const {
    tradeSlug = 'roofers',
    damageDescription = '',
    reportedPeril = 'storm',
    approxAgeYears = 10,
    knownDeductible = 1000,
  } = input;

  const text = `${damageDescription} ${reportedPeril}`.toLowerCase();
  const detectedPerils: string[] = [];
  const observedDamagePoints: string[] = [];
  const riskFactors: string[] = [];

  // Detect Perils
  if (text.includes('hail') || text.includes('dent') || text.includes('spatter')) detectedPerils.push('Hail Impact');
  if (text.includes('wind') || text.includes('shingle') || text.includes('blow') || text.includes('torn')) detectedPerils.push('Wind Uplift & Missing Shingles');
  if (text.includes('tree') || text.includes('limb') || text.includes('crush') || text.includes('branch')) detectedPerils.push('Fallen Tree / Heavy Limb Impact');
  if (text.includes('pipe') || text.includes('burst') || text.includes('water') || text.includes('leak') || text.includes('flood')) detectedPerils.push('Water Intrusion / Pipe Burst');
  if (detectedPerils.length === 0) detectedPerils.push('Unspecified Weather / Peril Event');

  // Evaluate Severity & Damage Points
  let baseScore = 50;
  let estMin = 3500;
  let estMax = 12000;

  if (text.includes('tree') || text.includes('hole') || text.includes('crushed') || text.includes('collapsed')) {
    baseScore += 35;
    estMin = 8000;
    estMax = 25000;
    observedDamagePoints.push('Major structural contact or envelope breach observed');
  }

  if (text.includes('hail') || text.includes('wind')) {
    baseScore += 25;
    observedDamagePoints.push('Direct weather peril impact consistent with recent storm swaths');
  }

  if (text.includes('leak') || text.includes('ceiling') || text.includes('drywall')) {
    baseScore += 15;
    observedDamagePoints.push('Secondary interior water infiltration confirmed');
  }

  // Risk factors
  if (approxAgeYears > 20) {
    riskFactors.push('Roof/property exceeds 20 years; adjuster may evaluate wear-and-tear or apply ACV schedule.');
    baseScore -= 10;
  }
  if (text.includes('old') || text.includes('worn') || text.includes('moss') || text.includes('rotted')) {
    riskFactors.push('Visible organic growth or aged deterioration may be scrutinized during adjuster inspection.');
    baseScore -= 15;
  }

  const score = Math.max(15, Math.min(98, baseScore));
  let probability: 'high' | 'moderate' | 'low' | 'unlikely' = 'moderate';
  let recommendation: 'file_claim' | 'inspection_first' | 'out_of_pocket_maintenance' = 'inspection_first';

  if (score >= 75) {
    probability = 'high';
    recommendation = 'file_claim';
  } else if (score >= 50) {
    probability = 'moderate';
    recommendation = 'inspection_first';
  } else {
    probability = 'low';
    recommendation = 'out_of_pocket_maintenance';
  }

  const homeownerSummary =
    probability === 'high'
      ? `High probability of insurance coverage. Visible damage appears sudden and well in excess of your standard $${knownDeductible} deductible. We recommend requesting an on-site adjuster inspection.`
      : probability === 'moderate'
      ? `Moderate probability. We recommend having our field specialist perform a physical photo inspection to confirm whether damage exceeds your $${knownDeductible} deductible before filing a formal claim.`
      : `Low probability of claim coverage. Damage appears consistent with maintenance or age-related wear, which is typically excluded by homeowner policies. We recommend an out-of-pocket repair quote.`;

  const contractorBrief = `Intake assessment score: ${score}/100 (${probability} likelihood). Estimated scope: $${estMin.toLocaleString()} - $${estMax.toLocaleString()}. Focus on corroborating soft metal damage and secondary water logs.`;

  return {
    feasibilityScore: score,
    probability,
    recommendation,
    estimatedDamageRange: { min: estMin, max: estMax },
    detectedPerils,
    observedDamagePoints: observedDamagePoints.length ? observedDamagePoints : ['General storm impact inspection required'],
    riskFactors,
    homeownerSummary,
    contractorBrief,
  };
}
