export interface ContractorHealthScorecard {
  accountId: string;
  businessName: string;
  healthScore: number; // 0 - 100
  tier: 'champion' | 'healthy' | 'neutral' | 'at_risk';
  breakdown: {
    quoteVolumeScore: number; // 0-25
    conversionRateScore: number; // 0-25
    speedToLeadScore: number; // 0-25
    paymentVolumeScore: number; // 0-25
  };
  keyStrengths: string[];
  growthOpportunities: string[];
}

/**
 * Computes a holistic 0–100 health index for a contractor account
 */
export function calculateContractorHealthScore(params: {
  accountId: string;
  businessName: string;
  quotesSentLast30Days: number;
  quotesApprovedLast30Days: number;
  averageSpeedToLeadSeconds: number;
  grossPaymentsCollectedDollars: number;
}): ContractorHealthScorecard {
  const {
    accountId,
    businessName,
    quotesSentLast30Days,
    quotesApprovedLast30Days,
    averageSpeedToLeadSeconds,
    grossPaymentsCollectedDollars,
  } = params;

  // 1. Quote Volume (25 pts max) -> 10 quotes = 25 pts
  const quoteVolumeScore = Math.min(25, Math.round((quotesSentLast30Days / 10) * 25));

  // 2. Conversion Rate (25 pts max) -> 50% conversion = 25 pts
  const convRate = quotesSentLast30Days > 0 ? quotesApprovedLast30Days / quotesSentLast30Days : 0;
  const conversionRateScore = Math.min(25, Math.round((convRate / 0.5) * 25));

  // 3. Speed to lead (25 pts max) -> under 60s = 25 pts, under 300s = 15 pts
  const speedToLeadScore = averageSpeedToLeadSeconds <= 60
    ? 25
    : averageSpeedToLeadSeconds <= 180
    ? 20
    : averageSpeedToLeadSeconds <= 600
    ? 15
    : 5;

  // 4. Payment volume (25 pts max) -> $10,000 = 25 pts
  const paymentVolumeScore = Math.min(25, Math.round((grossPaymentsCollectedDollars / 10000) * 25));

  const healthScore = Math.min(100, quoteVolumeScore + conversionRateScore + speedToLeadScore + paymentVolumeScore);

  let tier: ContractorHealthScorecard['tier'] = 'neutral';
  if (healthScore >= 80) tier = 'champion';
  else if (healthScore >= 60) tier = 'healthy';
  else if (healthScore >= 40) tier = 'neutral';
  else tier = 'at_risk';

  const keyStrengths: string[] = [];
  if (speedToLeadScore >= 20) keyStrengths.push('Blazing sub-60s speed-to-lead response time');
  if (conversionRateScore >= 20) keyStrengths.push('High quote close rate (>40%)');
  if (paymentVolumeScore >= 20) keyStrengths.push('Strong Stripe Connect processing volume');

  const growthOpportunities: string[] = [];
  if (quoteVolumeScore < 15) growthOpportunities.push('Increase weekly quote generation with Google Ads speed-to-lead');
  if (conversionRateScore < 15) growthOpportunities.push('Enable automated quote follow-up escalation cadence');

  return {
    accountId,
    businessName,
    healthScore,
    tier,
    breakdown: {
      quoteVolumeScore,
      conversionRateScore,
      speedToLeadScore,
      paymentVolumeScore,
    },
    keyStrengths,
    growthOpportunities,
  };
}
