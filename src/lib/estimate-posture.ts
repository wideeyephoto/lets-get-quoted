// The contractor-tunable "pricing posture" for the intake AI. It replaces the
// single hardcoded bias sentence in the estimate prompt so a business can shade
// its instant estimates lower (win on price) or higher (position on quality) —
// without touching the model. Pure data so both the estimate API and the
// settings UI import the same source of truth.

export type EstimatePosture = 'budget' | 'lean' | 'balanced' | 'premium' | 'high';

export const DEFAULT_ESTIMATE_POSTURE: EstimatePosture = 'lean';

export type EstimatePostureOption = {
  id: EstimatePosture;
  label: string;
  blurb: string; // shown to the contractor in settings
  promptBias: string; // interpolated into the AI estimate instructions
};

export const ESTIMATE_POSTURES: EstimatePostureOption[] = [
  {
    id: 'budget',
    label: 'Budget',
    blurb: 'Win on price — estimates shade to the low end.',
    promptBias:
      'Price AGGRESSIVELY toward the LOW end of what this trade realistically charges — this business competes on price and wants to look like the affordable choice. Keep a tight, believable spread (max no more than roughly 2x min).',
  },
  {
    id: 'lean',
    label: 'Lean',
    blurb: 'Affordable-leaning. A friendly ballpark that rarely scares people off.',
    promptBias:
      'Keep the range honest but LEAN TOWARD THE AFFORDABLE SIDE, with a tight believable spread (max no more than roughly 2-2.5x min) — a scary high top number loses the customer before the business ever gets to quote in person.',
  },
  {
    id: 'balanced',
    label: 'Balanced',
    blurb: 'Fair, realistic mid-market pricing — neither cheap nor premium.',
    promptBias:
      'Price at a FAIR, REALISTIC MID-MARKET rate for this trade — neither the cheapest option nor a premium one. Keep a tight, believable spread (max no more than roughly 2-2.5x min).',
  },
  {
    id: 'premium',
    label: 'Premium',
    blurb: 'Position on quality — estimates shade to the higher end.',
    promptBias:
      'Price toward the HIGHER end of what this trade realistically charges — this business positions on quality and reliability, not the lowest price. Keep a believable spread (max no more than roughly 2.5x min).',
  },
  {
    id: 'high',
    label: 'High-margin',
    blurb: 'Anchor high — top-tier, white-glove positioning.',
    promptBias:
      'Price at a PREMIUM that positions this business as a top-tier provider (high-end materials, craftsmanship, white-glove service). Anchor toward the upper end of realistic market pricing without becoming absurd. Keep a believable spread (max no more than roughly 2.5x min).',
  },
];

const POSTURE_BY_ID = new Map(ESTIMATE_POSTURES.map((option) => [option.id, option] as const));

export function normalizeEstimatePosture(value: unknown): EstimatePosture {
  return typeof value === 'string' && POSTURE_BY_ID.has(value as EstimatePosture)
    ? (value as EstimatePosture)
    : DEFAULT_ESTIMATE_POSTURE;
}

export function estimatePostureBias(value: unknown): string {
  return (POSTURE_BY_ID.get(normalizeEstimatePosture(value)) ?? POSTURE_BY_ID.get(DEFAULT_ESTIMATE_POSTURE)!).promptBias;
}
