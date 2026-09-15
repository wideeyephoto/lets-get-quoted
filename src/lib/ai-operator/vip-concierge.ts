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

import type { SupabaseClient } from '@supabase/supabase-js';

export async function scanForVipCandidates(
  supabase: SupabaseClient,
): Promise<{
  candidatesCount: number;
  candidates: VipContractorOpportunity[];
}> {
  try {
    const { data: accountsData, error: accountsError } = await supabase
      .from('accounts')
      .select('id, business_name, trade, crew_member_count, past_client_imports_count')
      .or('crew_member_count.gte.3,past_client_imports_count.gte.10')
      .neq('status', 'suspended');

    if (accountsError || !accountsData) {
      throw new Error(accountsError?.message || 'Failed to fetch vip candidates');
    }

    const candidates = accountsData.map((acc: any) => evaluateVipOnboardingCandidate({
      accountId: acc.id,
      businessName: acc.business_name || 'Unknown Business',
      trade: acc.trade || 'general',
      crewMembersCount: acc.crew_member_count || 0,
      pastClientImportsCount: acc.past_client_imports_count || 0,
    }));

    return {
      candidatesCount: candidates.length,
      candidates,
    };
  } catch (error) {
    console.error('Error scanning for VIP candidates:', error);
    return {
      candidatesCount: 0,
      candidates: [],
    };
  }
}
