/**
 * Deterministic estimate safety guardrails and confidence rules.
 *
 * Runs as a post-processing clamp in the classify-estimate pipeline so the AI
 * cannot hallucinate extreme ranges, violate contractor price caps, or promise
 * blind online estimates for hazardous, structural, or permit-heavy work that
 * requires an in-person inspection.
 */

export const DEFAULT_MAX_ESTIMATE_RATIO = 2.5;

// Phrases that require an on-site physical inspection rather than remote pricing.
// The intake still collects the homeowner's details and description; it simply
// withholds a blind numeric range so the contractor isn't bound to guesswork.
export const SAFETY_INSPECTION_TRIGGERS = [
  'asbestos',
  'lead paint',
  'structural foundation',
  'foundation crack',
  'load bearing wall',
  'load-bearing wall',
  'gas leak',
  'gas line rupture',
  'sewer main collapse',
  'sinkhole',
  'roof collapse',
  'fire damage',
  'black mold',
  'toxic mold',
  'electrical fire',
  'knob and tube',
  'buried fuel tank',
];

export type EstimateGuardrailInput = {
  minCents?: number | null;
  maxCents?: number | null;
  description?: string;
  exclusions?: string[];
  maxRatio?: number | null;
  absoluteMinCents?: number | null;
  absoluteMaxCents?: number | null;
};

export type EstimateGuardrailOutcome = {
  valid: boolean;
  withheld: boolean;
  withheldReason?: string;
  minCents?: number;
  maxCents?: number;
  inspectionRequired: boolean;
};

export function matchesExclusion(text: string, exclusion: string): boolean {
  const normText = (text || '').toLowerCase();
  const normExcl = (exclusion || '').trim().toLowerCase();
  if (!normExcl) return false;
  if (normText.includes(normExcl)) return true;
  // Check singular/plural variants
  const singular = normExcl.replace(/e?s$/, '');
  if (singular.length >= 3 && normText.includes(singular)) return true;
  const plural = `${normExcl}s`;
  if (normText.includes(plural)) return true;
  return false;
}

/**
 * Checks if a project description contains safety-critical or structural
 * hazards that mandate an in-person site assessment before quoting.
 */
export function checkSafetyInspectionRequired(description: string): { required: boolean; trigger?: string } {
  const text = (description || '').toLowerCase();
  for (const trigger of SAFETY_INSPECTION_TRIGGERS) {
    if (text.includes(trigger)) {
      return { required: true, trigger };
    }
  }
  return { required: false };
}

/**
 * Applies deterministic bounds and safety rules to an AI-generated estimate range.
 */
export function applyEstimateGuardrails(input: EstimateGuardrailInput): EstimateGuardrailOutcome {
  const description = (input.description || '').trim();
  const safety = checkSafetyInspectionRequired(description);

  if (safety.required) {
    return {
      valid: false,
      withheld: true,
      withheldReason: `On-site assessment required due to safety or structural complexity (${safety.trigger}).`,
      inspectionRequired: true,
    };
  }

  // Check contractor-defined exclusions
  if (input.exclusions && input.exclusions.length > 0) {
    for (const exclusion of input.exclusions) {
      if (matchesExclusion(description, exclusion)) {
        return {
          valid: false,
          withheld: true,
          withheldReason: `Work matches excluded service (${exclusion.trim()}).`,
          inspectionRequired: true,
        };
      }
    }
  }

  const rawMin = typeof input.minCents === 'number' && Number.isFinite(input.minCents) ? Math.max(0, input.minCents) : null;
  const rawMax = typeof input.maxCents === 'number' && Number.isFinite(input.maxCents) ? Math.max(0, input.maxCents) : null;

  if (rawMin === null || rawMax === null || rawMin <= 0 || rawMax <= 0) {
    return {
      valid: false,
      withheld: true,
      withheldReason: 'Insufficient scoping detail to generate a reliable ballpark.',
      inspectionRequired: false,
    };
  }

  // Normalize min/max ordering
  let minCents = Math.min(rawMin, rawMax);
  let maxCents = Math.max(rawMin, rawMax);

  // Apply absolute floor / ceiling if configured
  if (input.absoluteMinCents && input.absoluteMinCents > 0) {
    minCents = Math.max(minCents, input.absoluteMinCents);
    maxCents = Math.max(maxCents, minCents);
  }

  if (input.absoluteMaxCents && input.absoluteMaxCents > 0) {
    if (minCents > input.absoluteMaxCents) {
      return {
        valid: false,
        withheld: true,
        withheldReason: 'Estimate exceeds configured remote estimate ceiling.',
        inspectionRequired: true,
      };
    }
    maxCents = Math.min(maxCents, input.absoluteMaxCents);
  }

  // Check max ratio (e.g. High / Low <= 2.5)
  const ratioCap = typeof input.maxRatio === 'number' && input.maxRatio > 1 ? input.maxRatio : DEFAULT_MAX_ESTIMATE_RATIO;
  if (minCents > 0 && maxCents / minCents > ratioCap) {
    // If the spread is unreasonably wide, withhold the raw number so we don't display
    // a misleading "$500 - $5,000" range
    return {
      valid: false,
      withheld: true,
      withheldReason: 'Range variance too wide for online ballpark; site visit recommended.',
      inspectionRequired: true,
    };
  }

  return {
    valid: true,
    withheld: false,
    minCents: Math.round(minCents),
    maxCents: Math.round(maxCents),
    inspectionRequired: false,
  };
}
