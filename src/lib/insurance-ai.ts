/**
 * AI-powered Insurance Claims Engine.
 *
 * Provides model-grounded adjuster scope parsing, supplement detection,
 * one-click dispute letter generation, and conversational homeowner claims guidance.
 */

import {
  buildSupplementAnalysis,
  evaluateDamageClaimFeasibilityHeuristic,
  generateAdjusterLetterDraft,
  HOMEOWNER_CLAIM_FAQS,
  type ClaimFeasibilityAssessment,
  type ScopeDiscrepancy,
  type SupplementAnalysisResult,
} from './insurance-claims';
import { getInsuranceTradeProfile } from './trade-insurance';

/**
 * Evaluates damage feasibility using AI with automatic heuristic fallback.
 */
export async function evaluateDamageClaimFeasibilityWithAi(input: {
  tradeSlug?: string;
  damageDescription: string;
  reportedPeril?: string;
  approxAgeYears?: number;
  knownDeductible?: number;
  accountId?: string | null;
}): Promise<ClaimFeasibilityAssessment> {
  const heuristic = evaluateDamageClaimFeasibilityHeuristic(input);

  // If running in an environment without OpenAI or for fast UI evaluation
  if (!process.env.OPENAI_API_KEY) {
    return heuristic;
  }

  try {
    const { callModel } = await import('@/lib/ai-model-call');
    const profile = getInsuranceTradeProfile(input.tradeSlug);

    const prompt = [
      `You are an expert insurance restoration estimator for ${profile.name}.`,
      `Evaluate the following homeowner damage description for insurance claim viability:`,
      `Damage Description: ${input.damageDescription}`,
      `Reported Peril: ${input.reportedPeril || 'Storm / Sudden Occurrence'}`,
      `Estimated Property/Roof Age: ${input.approxAgeYears || 10} years`,
      `Policy Deductible: $${input.knownDeductible || 1000}`,
      ``,
      `Provide a structured evaluation in JSON format with:`,
      `{`,
      `  "feasibilityScore": <number 0-100>,`,
      `  "probability": "high" | "moderate" | "low" | "unlikely",`,
      `  "recommendation": "file_claim" | "inspection_first" | "out_of_pocket_maintenance",`,
      `  "estimatedDamageRange": { "min": <number>, "max": <number> },`,
      `  "detectedPerils": ["<peril 1>", "<peril 2>"],`,
      `  "observedDamagePoints": ["<point 1>", "<point 2>"],`,
      `  "riskFactors": ["<risk 1>"],`,
      `  "homeownerSummary": "<friendly 2-3 sentence plain English explanation for the homeowner without legal advice>",`,
      `  "contractorBrief": "<1-2 sentence technical takeaway for the contractor>"` ,
      `}`,
    ].join('\n');

    const res = await callModel(
      {
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0.2,
      },
      { accountId: input.accountId ?? null, kind: 'insurance_claim_assist' }
    );

    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content;
    if (!content) return heuristic;

    const parsed = JSON.parse(content) as Partial<ClaimFeasibilityAssessment>;
    return {
      feasibilityScore: typeof parsed.feasibilityScore === 'number' ? parsed.feasibilityScore : heuristic.feasibilityScore,
      probability: parsed.probability ?? heuristic.probability,
      recommendation: parsed.recommendation ?? heuristic.recommendation,
      estimatedDamageRange: parsed.estimatedDamageRange ?? heuristic.estimatedDamageRange,
      detectedPerils: parsed.detectedPerils?.length ? parsed.detectedPerils : heuristic.detectedPerils,
      observedDamagePoints: parsed.observedDamagePoints?.length ? parsed.observedDamagePoints : heuristic.observedDamagePoints,
      riskFactors: parsed.riskFactors ?? heuristic.riskFactors,
      homeownerSummary: parsed.homeownerSummary ?? heuristic.homeownerSummary,
      contractorBrief: parsed.contractorBrief ?? heuristic.contractorBrief,
    };
  } catch {
    return heuristic;
  }
}

/**
 * Analyzes an adjuster scope text or OCR output with AI to find missing line items & building codes.
 */
export async function analyzeAdjusterScopeWithAi(input: {
  scopeText: string;
  tradeSlug?: string;
  accountId?: string | null;
}): Promise<SupplementAnalysisResult> {
  const fallback = buildSupplementAnalysis(input.scopeText, input.tradeSlug);

  if (!process.env.OPENAI_API_KEY || !input.scopeText.trim()) {
    return fallback;
  }

  try {
    const { callModel } = await import('@/lib/ai-model-call');
    const profile = getInsuranceTradeProfile(input.tradeSlug);

    const prompt = [
      `You are a master Xactimate estimator and insurance supplement specialist for ${profile.name}.`,
      `Analyze the following insurance adjuster scope of loss text:`,
      `--- SCOPE START ---`,
      input.scopeText.slice(0, 8000),
      `--- SCOPE END ---`,
      ``,
      `Standard Trade Code Cites: ${profile.primaryCodeCitations.map((c) => `${c.code} (${c.description})`).join('; ')}`,
      ``,
      `Tasks:`,
      `1. Extract total RCV, ACV, Depreciation, and Deductible figures if present.`,
      `2. Identify missing building code items, manufacturer specs, or omitted labor items (e.g. drip edge, starter strip, ice & water shield, crane setup, steep pitch charges).`,
      `3. For each missing item, assign an estimated fair market value in dollars.`,
      ``,
      `Return JSON format:`,
      `{`,
      `  "parsedFigures": { "rcv": <number|null>, "acv": <number|null>, "depreciation": <number|null>, "deductible": <number|null>, "netClaim": <number|null> },`,
      `  "discrepancies": [`,
      `    {`,
      `      "id": "supp-1",`,
      `      "item": "<Item Name>",`,
      `      "codeCitation": "<e.g. IRC R905.2.8.5 or Manufacturer Spec>",`,
      `      "reason": "<Plain English explanation of why this was omitted and why it is mandatory>",`,
      `      "category": "code_compliance" | "manufacturer_spec" | "missed_scope" | "labor_surcharge",`,
      `      "estimatedCost": <number>,`,
      `      "selected": true`,
      `    }`,
      `  ]`,
      `}`,
    ].join('\n');

    const res = await callModel(
      {
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0.2,
      },
      { accountId: input.accountId ?? null, kind: 'insurance_claim_assist' }
    );

    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content;
    if (!content) return fallback;

    const parsed = JSON.parse(content) as {
      parsedFigures?: { rcv?: number; acv?: number; depreciation?: number; deductible?: number; netClaim?: number };
      discrepancies?: ScopeDiscrepancy[];
    };

    const parsedFigures = {
      rcv: parsed.parsedFigures?.rcv ?? fallback.parsedFigures.rcv,
      acv: parsed.parsedFigures?.acv ?? fallback.parsedFigures.acv,
      depreciation: parsed.parsedFigures?.depreciation ?? fallback.parsedFigures.depreciation,
      deductible: parsed.parsedFigures?.deductible ?? fallback.parsedFigures.deductible,
      netClaim: parsed.parsedFigures?.netClaim ?? fallback.parsedFigures.netClaim,
    };

    const discrepancies = (parsed.discrepancies && parsed.discrepancies.length > 0)
      ? parsed.discrepancies.map((d, i) => ({
          id: d.id || `supp-${i + 1}`,
          item: d.item || 'Required Code Item',
          codeCitation: d.codeCitation || 'IRC Building Code',
          reason: d.reason || 'Omitted from initial adjuster scope.',
          category: d.category || 'code_compliance',
          estimatedCost: Number.isFinite(d.estimatedCost) ? d.estimatedCost : 500,
          selected: true,
        }))
      : fallback.discrepancies;

    const totalEstimatedSupplement = discrepancies
      .filter((d) => d.selected)
      .reduce((sum, d) => sum + d.estimatedCost, 0);

    const adjustedTotalRcv = parsedFigures.rcv ? parsedFigures.rcv + totalEstimatedSupplement : null;

    const justificationDraft = generateAdjusterLetterDraft({
      tradeSlug: input.tradeSlug,
      discrepancies,
      initialRcv: parsedFigures.rcv,
    });

    return {
      tradeSlug: input.tradeSlug || 'roofers',
      parsedFigures,
      rawScopeSummary: `Analyzed with AI: detected ${discrepancies.length} potential scope items.`,
      discrepancies,
      totalEstimatedSupplement,
      adjustedTotalRcv,
      justificationDraft,
    };
  } catch {
    return fallback;
  }
}

/**
 * Answers a homeowner claim question in plain English with UPPA compliance.
 */
export async function getClaimCopilotAnswerWithAi(input: {
  question: string;
  tradeSlug?: string;
  accountId?: string | null;
}): Promise<string> {
  const matchFaq = HOMEOWNER_CLAIM_FAQS.find((faq) =>
    input.question.toLowerCase().includes(faq.question.toLowerCase().slice(0, 15))
  );
  if (matchFaq) return matchFaq.detailedExplanation;

  if (!process.env.OPENAI_API_KEY) {
    return (
      'As your contractor, we provide detailed physical damage documentation and itemized repair estimates to support your property restoration. Please consult your insurance adjuster for specific policy coverage limits and endorsements.'
    );
  }

  try {
    const { callModel } = await import('@/lib/ai-model-call');
    const profile = getInsuranceTradeProfile(input.tradeSlug);

    const prompt = [
      `You are an AI assistant helping a homeowner understand their insurance claims process for ${profile.name}.`,
      `UPPA COMPLIANCE RULES:`,
      `- Do not provide legal advice or act as a public adjuster.`,
      `- Do not promise to waive or pay their deductible.`,
      `- Clarify physical inspection, itemized estimates, RCV/ACV, and adjuster collaboration in clear, reassuring, simple terms.`,
      ``,
      `Homeowner Question: "${input.question}"`,
      `Provide a friendly, informative 2-3 paragraph answer.`,
    ].join('\n');

    const res = await callModel(
      {
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
      },
      { accountId: input.accountId ?? null, kind: 'insurance_claim_assist' }
    );

    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return (
      data.choices?.[0]?.message?.content ??
      'We will inspect your property, document all damage with photo evidence, and supply an itemized estimate for your adjuster.'
    );
  } catch {
    return (
      'As your contractor, we provide detailed physical damage documentation and itemized repair estimates to support your property restoration. Please consult your insurance adjuster for specific policy coverage limits and endorsements.'
    );
  }
}
