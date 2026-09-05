/**
 * Domain types, heuristic scope parsers, supplement detectors, and letter builders
 * for Homeowner Insurance Claims.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  getInsuranceTradeProfile,
  type InsuranceTradeProfile,
} from './trade-insurance';
import { formatMoneyExact } from './jobs';

export type InsuranceClaimStatus =
  | 'draft'
  | 'scope_received'
  | 'supplement_pending'
  | 'approved'
  | 'invoiced'
  | 'closed';

export type InsuranceClaimLetterRevision = {
  savedAt: string;
  letter: string;
  totalSupplement: number;
  revisedRcv: number | null;
};

export type InsuranceClaimRecord = {
  id: string;
  account_id: string;
  client_id: string | null;
  job_id: string | null;
  claim_number: string | null;
  policyholder_name: string | null;
  property_address: string | null;
  carrier_name: string | null;
  adjuster_name: string | null;
  adjuster_email: string | null;
  adjuster_phone: string | null;
  date_of_loss: string | null;
  scope_text: string | null;
  parsed_figures: ClaimFinancialFigures;
  discrepancies: ScopeDiscrepancy[];
  total_supplement_amount: number;
  revised_rcv_amount: number | null;
  justification_letter: string | null;
  letter_revisions: InsuranceClaimLetterRevision[];
  status: InsuranceClaimStatus;
  trade_slug: string;
  ai_analyzed_at: string | null;
  analysis_method: 'ai' | 'heuristic';
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type InsuranceClaimSummary = Pick<
  InsuranceClaimRecord,
  | 'id'
  | 'account_id'
  | 'client_id'
  | 'job_id'
  | 'claim_number'
  | 'policyholder_name'
  | 'property_address'
  | 'carrier_name'
  | 'adjuster_name'
  | 'total_supplement_amount'
  | 'revised_rcv_amount'
  | 'status'
  | 'trade_slug'
  | 'created_at'
  | 'updated_at'
  | 'parsed_figures'
  | 'analysis_method'
>;

export type InsuranceClaimInput = {
  id?: string;
  clientId?: string | null;
  jobId?: string | null;
  claimNumber?: string | null;
  policyholderName?: string | null;
  propertyAddress?: string | null;
  carrierName?: string | null;
  adjusterName?: string | null;
  adjusterEmail?: string | null;
  adjusterPhone?: string | null;
  dateOfLoss?: string | null;
  scopeText?: string | null;
  parsedFigures?: ClaimFinancialFigures;
  discrepancies?: ScopeDiscrepancy[];
  totalSupplementAmount?: number;
  revisedRcvAmount?: number | null;
  justificationLetter?: string | null;
  letterRevisions?: InsuranceClaimLetterRevision[];
  status?: InsuranceClaimStatus;
  tradeSlug?: string;
  aiAnalyzedAt?: string | null;
  analysisMethod?: 'ai' | 'heuristic';
  updatedAt?: string; // For optimistic concurrency checks
};

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
  quantity?: number;
  unit?: string;
  unitPrice?: number;
  confidence?: 'high' | 'medium' | 'low';
  detectionSource?: 'code_mandate' | 'omitted_scan' | 'ai_identified' | 'custom';
};

export type ParsedScopeLineItem = {
  raw: string;
  description: string;
  quantity?: number;
  unit?: string;
  unitPrice?: number;
  total?: number;
};

export type SupplementAnalysisResult = {
  tradeSlug: string;
  parsedFigures: ClaimFinancialFigures;
  rawScopeSummary: string;
  discrepancies: ScopeDiscrepancy[];
  totalEstimatedSupplement: number;
  adjustedTotalRcv: number | null;
  justificationDraft: string;
  analysisMethod: 'ai' | 'heuristic';
  reconciliationWarning?: string | null;
  parsedLineItems?: ParsedScopeLineItem[];
  sourceNotice?: string;
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
 * Parses line items (quantity, unit, unit price, total) from adjuster estimate text.
 */
export function parseScopeLineItems(text: string): ParsedScopeLineItem[] {
  if (!text || !text.trim()) return [];
  const lines = text.split(/\r?\n/);
  const items: ParsedScopeLineItem[] = [];

  // Match lines like:
  // Line Item 1: Tear off 3-tab shingles (28.33 SQ) - $1,416.50
  // 1. Tear off existing asphalt composition shingles (32 SQ) - $1,600.00
  // Line 4: Continuous ridge vent (45 LF) - $495.00
  const itemRe = /(?:line\s*item\s*\d+[:.]?|\b\d+[\).]|\bline\s*\d+[:.]?)\s*(.+?)(?:\(([0-9,.]+)\s*([A-Za-z]+)\))?(?:\s*[@-]\s*\$?([0-9,.]+))?\s*[-=:]\s*\$?([0-9,.]+(?:\.\d{2})?)/i;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const match = trimmed.match(itemRe);
    if (match) {
      const description = match[1].replace(/[:\-–—]+$/, '').trim();
      const qtyStr = match[2]?.replace(/,/g, '');
      const unit = match[3]?.toUpperCase() || 'EA';
      const unitPriceStr = match[4]?.replace(/,/g, '');
      const totalStr = match[5]?.replace(/,/g, '');

      const quantity = qtyStr ? parseFloat(qtyStr) : undefined;
      const total = totalStr ? parseFloat(totalStr) : undefined;
      const unitPrice = unitPriceStr
        ? parseFloat(unitPriceStr)
        : quantity && total
        ? Math.round((total / quantity) * 100) / 100
        : undefined;

      items.push({
        raw: trimmed,
        description,
        quantity: Number.isFinite(quantity) ? quantity : undefined,
        unit,
        unitPrice: Number.isFinite(unitPrice) ? unitPrice : undefined,
        total: Number.isFinite(total) ? total : undefined,
      });
    }
  }

  return items;
}

/**
 * Heuristic parser to extract dollar figures (RCV, ACV, Deductible, Net Claim) from adjuster scope text.
 * Safeguards against capturing stray page numbers (e.g. "see page 3 — $8,799.70") and reconciles math.
 */
export function extractClaimFiguresFromText(text: string): ClaimFinancialFigures & { reconciliationWarning?: string | null } {
  if (!text) {
    return { rcv: null, acv: null, depreciation: null, deductible: null, netClaim: null };
  }

  const clean = text.replace(/,/g, '');

  const parsePattern = (labelRegex: RegExp): number | null => {
    // 1. Look for label followed on the same line by a dollar sign and amount
    const dollarMatch = clean.match(new RegExp(`${labelRegex.source}(?:(?![\r\n]).)*?\\$\\s*(\\d+(?:\\.\\d{2})?)`, 'i'));
    if (dollarMatch && dollarMatch[1]) {
      const num = parseFloat(dollarMatch[1]);
      if (Number.isFinite(num)) return Math.round(num * 100) / 100;
    }
    // 2. Look for label followed by colon/dash/parentheses then number (e.g. DEDUCTIBLE: (1500.00))
    const colonMatch = clean.match(new RegExp(`${labelRegex.source}\\s*[:=–-]\\s*\\(?\\$?(\\d+(?:\\.\\d{2})?)\\)?`, 'i'));
    if (colonMatch && colonMatch[1]) {
      const num = parseFloat(colonMatch[1]);
      if (Number.isFinite(num)) return Math.round(num * 100) / 100;
    }
    return null;
  };

  const rcv = parsePattern(/(?:replacement\s*cost\s*value|total\s*rcv|rcv\s*total|\brcv\b)/);
  const acv = parsePattern(/(?:actual\s*cash\s*value|total\s*acv|acv\s*total|\bacv\b)/);
  const depreciation = parsePattern(/(?:total\s*depreciation|\bdepreciation\b|recov(?:erable)?\s*depr)/);
  const deductible = parsePattern(/(?:policy\s*deductible|net\s*deductible|\bdeductible\b)/);
  const netClaim = parsePattern(/(?:net\s*claim|net\s*payment|net\s*actual\s*cash|check\s*amount|net\s*payment\s*issued)/);

  // Sanity / reconciliation check
  let reconciliationWarning: string | null = null;
  if (rcv != null && acv != null && acv > rcv) {
    reconciliationWarning = `Parsed figures inconsistent: ACV ($${formatMoneyExact(acv)}) cannot exceed RCV ($${formatMoneyExact(rcv)}).`;
  } else if (rcv != null && depreciation != null && deductible != null && netClaim != null) {
    const expectedNet = Math.round((rcv - depreciation - deductible) * 100) / 100;
    if (Math.abs(expectedNet - netClaim) > 1.0) {
      reconciliationWarning = `Figures do not reconcile: RCV (${formatMoneyExact(rcv)}) − Depreciation (${formatMoneyExact(depreciation)}) − Deductible (${formatMoneyExact(deductible)}) = ${formatMoneyExact(expectedNet)}, but Net Payment is ${formatMoneyExact(netClaim)}.`;
    }
  }

  return { rcv, acv, depreciation, deductible, netClaim, reconciliationWarning };
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Identifies missing code items and standard supplements by analyzing the scope text
 * against trade-specific building codes.
 * Uses word-boundary matching and curated aliases so common terms (like "water" or "vent")
 * do not cause false-positive detections or suppressions.
 */
export function detectScopeDiscrepancies(
  scopeText: string,
  tradeSlug = 'roofers'
): ScopeDiscrepancy[] {
  if (!scopeText || !scopeText.trim()) {
    return [];
  }

  const profile: InsuranceTradeProfile = getInsuranceTradeProfile(tradeSlug);
  const lowerScope = scopeText.toLowerCase();
  const discrepancies: ScopeDiscrepancy[] = [];

  for (let i = 0; i < profile.standardSupplements.length; i++) {
    const supp = profile.standardSupplements[i];
    const matchTargets = supp.aliases && supp.aliases.length > 0
      ? supp.aliases
      : [supp.item.toLowerCase().replace(/\s*\(.*?\)/, '').trim()];

    // Require full phrase or alias with word-boundary matching
    const isPresent = matchTargets.some((alias) => {
      const escaped = escapeRegex(alias.toLowerCase().trim());
      const re = new RegExp(`\\b${escaped}\\b`, 'i');
      return re.test(lowerScope);
    });

    // If omitted from the provided scope, flag as a potential supplement
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
        selected: false, // Affirmative contractor review required: default to unchecked
        quantity: supp.defaultQty ?? 1,
        unit: supp.unit ?? 'EA',
        unitPrice: supp.defaultUnitPrice ?? supp.defaultEstimatedCost,
        confidence: supp.typicalCodeRef ? 'high' : 'medium',
        detectionSource: 'code_mandate',
      });
    }
  }

  return discrepancies;
}

/**
 * Builds a structured supplement analysis result from scope text and trade.
 * Sums amounts in integer cents to prevent floating point drift.
 */
export function buildSupplementAnalysis(
  scopeText: string,
  tradeSlug = 'roofers'
): SupplementAnalysisResult {
  if (!scopeText || !scopeText.trim()) {
    return {
      tradeSlug,
      parsedFigures: { rcv: null, acv: null, depreciation: null, deductible: null, netClaim: null },
      rawScopeSummary: 'No scope text provided.',
      discrepancies: [],
      totalEstimatedSupplement: 0,
      adjustedTotalRcv: null,
      justificationDraft: 'No scope text provided. Paste an adjuster estimate to identify code omissions and generate a justification draft.',
      analysisMethod: 'heuristic',
      parsedLineItems: [],
    };
  }

  const figuresWithWarn = extractClaimFiguresFromText(scopeText);
  const parsedFigures: ClaimFinancialFigures = {
    rcv: figuresWithWarn.rcv,
    acv: figuresWithWarn.acv,
    depreciation: figuresWithWarn.depreciation,
    deductible: figuresWithWarn.deductible,
    netClaim: figuresWithWarn.netClaim,
  };

  const discrepancies = detectScopeDiscrepancies(scopeText, tradeSlug);
  const parsedLineItems = parseScopeLineItems(scopeText);

  // Cent arithmetic to eliminate floating-point drift
  const totalEstimatedSupplement = Math.round(
    discrepancies
      .filter((d) => d.selected)
      .reduce((sum, d) => sum + Math.round(d.estimatedCost * 100), 0)
  ) / 100;

  // Use != null so RCV of 0 is not treated as unparsed
  const adjustedTotalRcv = parsedFigures.rcv != null
    ? Math.round((Math.round(parsedFigures.rcv * 100) + Math.round(totalEstimatedSupplement * 100))) / 100
    : null;

  const rawScopeSummary = `Analyzed ${scopeText.split('\n').length} lines of adjuster scope. Detected ${parsedLineItems.length} line items and ${discrepancies.length} potential building code omissions.`;

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
    analysisMethod: 'heuristic',
    reconciliationWarning: figuresWithWarn.reconciliationWarning,
    parsedLineItems,
  };
}

/**
 * Generates a formal, UPPA-compliant Adjuster Supplement Justification letter.
 * Employs formatMoneyExact for all currency amounts to guarantee cent precision for carriers.
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

  const activeDiscrepancies = discrepancies.filter((d) => d.selected);
  if (activeDiscrepancies.length === 0) {
    return [
      `RE: Desk Scope Review & Contractor Construction Estimate — Building Code Supplements`,
      `Policyholder: ${policyholderName}`,
      `Risk Location: ${propertyAddress}`,
      ``,
      `No omitted items or supplement discrepancies identified. Paste an insurance adjuster scope or select items above to generate a contractor scope clarification letter draft.`,
      ``,
      `---`,
      `*Notice & Contractor Scope Disclaimer: This scope clarification and supplement estimate is prepared solely as a contractor desk review for construction, material specifications, and labor in accordance with applicable building codes and manufacturer requirements. It does not assert completed physical on-site inspection findings and does not constitute legal advice, insurance adjusting, or public insurance adjuster representation. All scope items and physical dimensions must be verified on site prior to execution.*`,
    ].join('\n');
  }

  const profile = getInsuranceTradeProfile(tradeSlug);
  // Sum in cents
  const supplementTotal = Math.round(
    activeDiscrepancies.reduce((sum, d) => sum + Math.round(d.estimatedCost * 100), 0)
  ) / 100;

  const initialRcvText = initialRcv != null ? ` (Initial RCV: ${formatMoneyExact(initialRcv)})` : '';

  const lines: string[] = [
    `RE: Desk Scope Review & Contractor Construction Estimate — Building Code Supplements`,
    `Policyholder: ${policyholderName}`,
    `Claim Number: ${claimNumber}`,
    `Date of Loss: ${dateOfLoss}`,
    `Risk Location: ${propertyAddress}`,
    `Insurance Carrier: ${carrierName}`,
    `Attn: ${adjusterName}`,
    ``,
    `Dear ${adjusterName},`,
    ``,
    `We have completed a preliminary contractor desk review of the initial scope of loss for the property at ${propertyAddress}. Based on applicable building codes and manufacturer installation specifications, we have identified several required line items omitted from the initial estimate that are necessary for a code-compliant, workmanlike restoration${initialRcvText}.`,
    ``,
    `### Itemized Scope Adjustments & Code Justifications:`,
    ``,
  ];

  activeDiscrepancies.forEach((item, index) => {
    const qtyNote = item.quantity && item.unit && item.unitPrice
      ? ` (${item.quantity} ${item.unit} @ ${formatMoneyExact(item.unitPrice)}/${item.unit})`
      : '';
    lines.push(
      `${index + 1}. **${item.item}** (Estimated: ${formatMoneyExact(item.estimatedCost)}${qtyNote})`,
      `   - **Authority / Code Ref**: ${item.codeCitation || 'Manufacturer Specification & Building Code'}`,
      `   - **Justification**: ${item.reason}`,
      ``
    );
  });

  lines.push(
    `---`,
    `**Total Supplement Amount Requested**: ${formatMoneyExact(supplementTotal)}`,
    initialRcv != null
      ? `**Revised Total RCV Scope**: ${formatMoneyExact(
          Math.round(Math.round(initialRcv * 100) + Math.round(supplementTotal * 100)) / 100
        )}`
      : '',
    ``,
    `Please review the attached physical photo documentation, manufacturer installation guidelines, and local jurisdiction code requirements. We request that you issue an updated scope reflecting these required items at your earliest convenience so that repairs may proceed without delay.`,
    ``,
    `Sincerely,`,
    `Project Estimator & Field Team`,
    `${profile.name}`,
    `[Phone & Direct Email]`,
    ``,
    `---`,
    `*Notice & Contractor Scope Disclaimer: This scope clarification and supplement request is prepared solely as a contractor estimate for construction, material specifications, and labor in accordance with applicable building codes and manufacturer requirements. It does not constitute legal advice, insurance adjusting, or public insurance adjuster representation. Scope items must be verified against actual physical property conditions prior to execution.*`
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
    tradeSlug: _tradeSlug = 'roofers',
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

  const contractorBrief = `Intake assessment score: ${score}/100 (${probability} likelihood). Estimated scope: ${formatMoneyExact(estMin)} - ${formatMoneyExact(estMax)}. Focus on corroborating soft metal damage and secondary water logs.`;

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

/**
 * Extracts claim metadata fields (claim #, policyholder, address, carrier, date of loss, adjuster)
 * from pasted scope text or OCR headers.
 */
export function extractClaimMetadataFromText(text: string): {
  claimNumber: string | null;
  policyholderName: string | null;
  propertyAddress: string | null;
  carrierName: string | null;
  dateOfLoss: string | null;
  adjusterName: string | null;
} {
  if (!text || !text.trim()) {
    return {
      claimNumber: null,
      policyholderName: null,
      propertyAddress: null,
      carrierName: null,
      dateOfLoss: null,
      adjusterName: null,
    };
  }

  const findPattern = (regex: RegExp): string | null => {
    const match = text.match(regex);
    if (!match || !match[1]) return null;
    const val = match[1].trim();
    return val.length > 0 ? val : null;
  };

  const claimNumber = findPattern(/(?:claim\s*(?:number|no\.?|#)?)\s*[:#]?\s*([A-Za-z0-9-]+)/i);
  const policyholderName = findPattern(/(?:insured|policyholder|named\s*insured|customer)\s*[:#]\s*([^\n\r]+)/i);
  const propertyAddress = findPattern(/(?:loss\s*location|property\s*address|risk\s*location|loss\s*address)\s*[:#]\s*([^\n\r]+)/i);
  const dateOfLoss = findPattern(/(?:date\s*of\s*loss|loss\s*date|dol)\s*[:#]\s*([^\n\r]+)/i);
  const adjusterName = findPattern(/(?:adjuster(?:\s*name)?|claim\s*rep|estimator)\s*[:#]\s*([^\n\r]+)/i);

  // Detect Carrier
  let carrierName = findPattern(/(?:carrier|insurance\s*company|insurer)\s*[:#]\s*([^\n\r]+)/i);
  if (!carrierName) {
    const KNOWN_CARRIERS = [
      'State Farm',
      'Allstate',
      'Travelers',
      'Liberty Mutual',
      'USAA',
      'Farmers',
      'Nationwide',
      'Chubb',
      'Progressive',
      'American Family',
      'Erie Insurance',
      'Auto-Owners',
      'Hartford',
      'Safeco',
    ];
    for (const c of KNOWN_CARRIERS) {
      if (new RegExp(`\\b${c}\\b`, 'i').test(text)) {
        carrierName = c;
        break;
      }
    }
    if (!carrierName) {
      const firstLine = text.trim().split('\n')[0]?.trim();
      if (firstLine && /(?:insurance|casualty|underwriters|mutual|fire)/i.test(firstLine) && firstLine.length < 60) {
        carrierName = firstLine;
      }
    }
  }

  return {
    claimNumber,
    policyholderName,
    propertyAddress,
    carrierName,
    dateOfLoss,
    adjusterName,
  };
}

/**
 * Fetches all saved claims for the workspace. Does NOT swallow database errors.
 */
export async function listInsuranceClaims(
  supabase: SupabaseClient,
  accountId: string,
): Promise<InsuranceClaimRecord[]> {
  const { data, error } = await supabase
    .from('insurance_claims')
    .select('*')
    .eq('account_id', accountId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to list insurance claims: ${error.message}`);
  }
  return (data || []).map(mapDbClaimToRecord);
}

/**
 * Lightweight projection for list views and summary cards without loading massive scope_text or justification letters.
 */
export async function listInsuranceClaimSummaries(
  supabase: SupabaseClient,
  accountId: string,
): Promise<InsuranceClaimSummary[]> {
  const { data, error } = await supabase
    .from('insurance_claims')
    .select(
      'id, account_id, client_id, job_id, claim_number, policyholder_name, property_address, carrier_name, adjuster_name, total_supplement_amount, revised_rcv_amount, status, trade_slug, created_at, updated_at, parsed_figures, analysis_method'
    )
    .eq('account_id', accountId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to list insurance claim summaries: ${error.message}`);
  }

  return (data || []).map((row: Record<string, any>) => ({
    id: String(row.id),
    account_id: String(row.account_id),
    client_id: row.client_id ? String(row.client_id) : null,
    job_id: row.job_id ? String(row.job_id) : null,
    claim_number: row.claim_number ?? null,
    policyholder_name: row.policyholder_name ?? null,
    property_address: row.property_address ?? null,
    carrier_name: row.carrier_name ?? null,
    adjuster_name: row.adjuster_name ?? null,
    total_supplement_amount: Number(row.total_supplement_amount) || 0,
    revised_rcv_amount: row.revised_rcv_amount != null ? Number(row.revised_rcv_amount) : null,
    status: row.status ?? 'draft',
    trade_slug: row.trade_slug ?? 'roofers',
    analysis_method: (row.analysis_method as 'ai' | 'heuristic') ?? 'heuristic',
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    parsed_figures: row.parsed_figures ?? { rcv: null, acv: null, depreciation: null, deductible: null, netClaim: null },
  }));
}

export async function getInsuranceClaim(
  supabase: SupabaseClient,
  accountId: string,
  claimId: string,
): Promise<InsuranceClaimRecord | null> {
  const { data, error } = await supabase
    .from('insurance_claims')
    .select('*')
    .eq('account_id', accountId)
    .eq('id', claimId)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch insurance claim: ${error.message}`);
  }
  if (!data) return null;
  return mapDbClaimToRecord(data);
}

/**
 * Saves or updates an insurance claim.
 * Removes client-side clock overrides (created_at/updated_at) and supports optimistic concurrency.
 */
export async function saveInsuranceClaim(
  supabase: SupabaseClient,
  accountId: string,
  input: InsuranceClaimInput,
): Promise<InsuranceClaimRecord> {
  // Optimistic concurrency check for updates
  if (input.id && input.updatedAt) {
    const { data: existing } = await supabase
      .from('insurance_claims')
      .select('updated_at, letter_revisions')
      .eq('account_id', accountId)
      .eq('id', input.id)
      .maybeSingle();

    if (existing && existing.updated_at && existing.updated_at !== input.updatedAt) {
      throw new Error('This claim was updated by another team member in the meantime. Please reload to review the latest changes.');
    }
  }

  // Manage version history for justification letter
  let letterRevisions: InsuranceClaimLetterRevision[] = input.letterRevisions || [];
  if (input.justificationLetter) {
    const revision: InsuranceClaimLetterRevision = {
      savedAt: new Date().toISOString(),
      letter: input.justificationLetter,
      totalSupplement: input.totalSupplementAmount ?? 0,
      revisedRcv: input.revisedRcvAmount ?? null,
    };
    letterRevisions = [...letterRevisions.slice(-9), revision]; // Retain up to 10 revisions
  }

  const payload: Record<string, any> = {
    account_id: accountId,
    client_id: input.clientId ?? null,
    job_id: input.jobId ?? null,
    claim_number: input.claimNumber ?? null,
    policyholder_name: input.policyholderName ?? null,
    property_address: input.propertyAddress ?? null,
    carrier_name: input.carrierName ?? null,
    adjuster_name: input.adjusterName ?? null,
    adjuster_email: input.adjusterEmail ?? null,
    adjuster_phone: input.adjusterPhone ?? null,
    date_of_loss: input.dateOfLoss ?? null,
    scope_text: input.scopeText ?? null,
    parsed_figures: input.parsedFigures ?? { rcv: null, acv: null, depreciation: null, deductible: null, netClaim: null },
    discrepancies: input.discrepancies ?? [],
    total_supplement_amount: input.totalSupplementAmount ?? 0,
    revised_rcv_amount: input.revisedRcvAmount ?? null,
    justification_letter: input.justificationLetter ?? null,
    letter_revisions: letterRevisions,
    status: input.status ?? 'draft',
    trade_slug: input.tradeSlug ?? 'roofers',
    ai_analyzed_at: input.aiAnalyzedAt ?? null,
    analysis_method: input.analysisMethod ?? 'heuristic',
  };

  if (input.id) {
    const { data, error } = await supabase
      .from('insurance_claims')
      .update(payload)
      .eq('account_id', accountId)
      .eq('id', input.id)
      .select()
      .single();

    if (error) throw new Error(`Failed to update insurance claim: ${error.message}`);
    return mapDbClaimToRecord(data);
  } else {
    // Rely on database defaults clock_timestamp() for created_at and updated_at
    const { data, error } = await supabase
      .from('insurance_claims')
      .insert(payload)
      .select()
      .single();

    if (error) throw new Error(`Failed to create insurance claim: ${error.message}`);
    return mapDbClaimToRecord(data);
  }
}

/**
 * Soft deletes an insurance claim by stamping deleted_at.
 */
export async function deleteInsuranceClaim(
  supabase: SupabaseClient,
  accountId: string,
  claimId: string,
): Promise<{ success: boolean; deletedId: string }> {
  const { error } = await supabase
    .from('insurance_claims')
    .update({ deleted_at: new Date().toISOString() })
    .eq('account_id', accountId)
    .eq('id', claimId);

  if (error) throw new Error(`Failed to delete insurance claim: ${error.message}`);
  return { success: true, deletedId: claimId };
}

function mapDbClaimToRecord(row: Record<string, any>): InsuranceClaimRecord {
  return {
    id: String(row.id),
    account_id: String(row.account_id),
    client_id: row.client_id ? String(row.client_id) : null,
    job_id: row.job_id ? String(row.job_id) : null,
    claim_number: row.claim_number ?? null,
    policyholder_name: row.policyholder_name ?? null,
    property_address: row.property_address ?? null,
    carrier_name: row.carrier_name ?? null,
    adjuster_name: row.adjuster_name ?? null,
    adjuster_email: row.adjuster_email ?? null,
    adjuster_phone: row.adjuster_phone ?? null,
    date_of_loss: row.date_of_loss ?? null,
    scope_text: row.scope_text ?? null,
    parsed_figures: row.parsed_figures ?? { rcv: null, acv: null, depreciation: null, deductible: null, netClaim: null },
    discrepancies: Array.isArray(row.discrepancies) ? row.discrepancies : [],
    total_supplement_amount: Number(row.total_supplement_amount) || 0,
    revised_rcv_amount: row.revised_rcv_amount != null ? Number(row.revised_rcv_amount) : null,
    justification_letter: row.justification_letter ?? null,
    letter_revisions: Array.isArray(row.letter_revisions) ? row.letter_revisions : [],
    status: row.status ?? 'draft',
    trade_slug: row.trade_slug ?? 'roofers',
    ai_analyzed_at: row.ai_analyzed_at ?? null,
    analysis_method: (row.analysis_method as 'ai' | 'heuristic') ?? 'heuristic',
    deleted_at: row.deleted_at ? String(row.deleted_at) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}
