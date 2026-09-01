export interface VipContractorOpportunity {
  accountId: string;
  businessName: string;
  trade: string;
  crewMembersCount: number;
  pastClientImportsCount: number;
  potentialAnnualLtvDollars: number;
  recommendedOnboardingPlay: string;
  founderActionItem: string;
}

/**
 * Identifies high-value enterprise and multi-crew contractor accounts for proactive founder concierge outreach
 */
export function evaluateVipOnboardingCandidate(params: {
  accountId: string;
  businessName: string;
  trade: string;
  crewMembersCount: number;
  pastClientImportsCount: number;
}): VipContractorOpportunity {
  const { accountId, businessName, trade, crewMembersCount, pastClientImportsCount } = params;

  const isMultiCrew = crewMembersCount >= 3 || pastClientImportsCount >= 10;
  const potentialAnnualLtvDollars = isMultiCrew ? 3588 : 828; // Scale tier vs Solo tier

  return {
    accountId,
    businessName,
    trade,
    crewMembersCount,
    pastClientImportsCount,
    potentialAnnualLtvDollars,
    recommendedOnboardingPlay: isMultiCrew
      ? 'High-LTV Multi-Crew Account: Offer personalized 1-on-1 team dispatch setup and custom website domain migration.'
      : 'Standard automated email and SMS onboarding walkthrough.',
    founderActionItem: isMultiCrew
      ? `Send personal SMS from Founder to ${businessName} offering a 15-minute VIP onboarding walkthrough.`
      : 'Automated lifecycle step Day 0.',
  };
}
