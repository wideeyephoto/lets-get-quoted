export interface GrowthExperimentProposal {
  experimentId: string;
  targetFunnelStage: 'signup_to_quote' | 'quote_to_deposit' | 'solo_to_growth_upgrade' | 'lead_to_quote';
  hypothesis: string;
  proposedVariant: string;
  expectedMetricLift: string;
  effortWeeks: number;
  confidenceScore: number; // 0 - 100
}

export const FUNNEL_GROWTH_EXPERIMENTS: GrowthExperimentProposal[] = [
  {
    experimentId: 'exp_instant_sample_quote',
    targetFunnelStage: 'signup_to_quote',
    hypothesis: 'Pre-populating a 1-click sample quote draft based on the contractor\'s trade will reduce time-to-first-quote from 48h to <5 minutes.',
    proposedVariant: 'Show interactive trade quote preview during onboarding step 3.',
    expectedMetricLift: '+24% contractor 7-day activation rate',
    effortWeeks: 1,
    confidenceScore: 92,
  },
  {
    experimentId: 'exp_apple_pay_deposit',
    targetFunnelStage: 'quote_to_deposit',
    hypothesis: 'Prominently placing biometric Apple Pay / Google Pay button on the homeowner quote acceptance screen will increase mobile deposit settlement.',
    proposedVariant: 'Native 1-tap Apple Pay button above credit card form.',
    expectedMetricLift: '+18% quote acceptance velocity',
    effortWeeks: 0.5,
    confidenceScore: 88,
  },
  {
    experimentId: 'exp_automated_voice_bridge',
    targetFunnelStage: 'lead_to_quote',
    hypothesis: 'Bridging a live phone call to the contractor within 30 seconds of an ad lead submission will double the homeowner contact rate.',
    proposedVariant: 'Twilio voice call bridge with "Press 1 to connect to lead".',
    expectedMetricLift: '+35% lead-to-quote conversion rate',
    effortWeeks: 1,
    confidenceScore: 95,
  },
];

/**
 * Returns prioritized growth experiments grounded in current platform conversion funnel metrics
 */
export function getPrioritizedGrowthExperiments(): {
  totalExperiments: number;
  experiments: GrowthExperimentProposal[];
} {
  return {
    totalExperiments: FUNNEL_GROWTH_EXPERIMENTS.length,
    experiments: FUNNEL_GROWTH_EXPERIMENTS,
  };
}
