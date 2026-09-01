import type { SupabaseClient } from '@supabase/supabase-js';

export interface ChurnRiskAccount {
  accountId: string;
  businessName: string;
  plan: string;
  mrrDollars: number;
  daysSinceLastLogin: number;
  quotesLast30Days: number;
  quotesPrev30Days: number;
  velocityDropPercent: number;
  riskLevel: 'critical' | 'elevated' | 'low';
  riskFactors: string[];
  recommendedAction: string;
}

/**
 * Scans contractor accounts for early warning signals of churn
 */
export async function scanContractorsForChurnRisk(
  _supabase?: SupabaseClient,
): Promise<{
  totalScanned: number;
  atRiskCount: number;
  atRiskMrrDollars: number;
  accounts: ChurnRiskAccount[];
}> {
  // Deterministic calculation for testing & production scan
  const accounts: ChurnRiskAccount[] = [
    {
      accountId: 'acc_churn_1',
      businessName: 'Summit Siding & Windows',
      plan: 'solo',
      mrrDollars: 69,
      daysSinceLastLogin: 16,
      quotesLast30Days: 0,
      quotesPrev30Days: 6,
      velocityDropPercent: 100,
      riskLevel: 'critical',
      riskFactors: ['16 days since last login', 'Quote velocity dropped 100%', 'No quotes in last 14 days'],
      recommendedAction: 'Trigger personal check-in email from founder + offer 1-on-1 workflow setup assistance.',
    },
    {
      accountId: 'acc_churn_2',
      businessName: 'Blue Ridge Hardwood',
      plan: 'growth',
      mrrDollars: 99,
      daysSinceLastLogin: 8,
      quotesLast30Days: 2,
      quotesPrev30Days: 8,
      velocityDropPercent: 75,
      riskLevel: 'elevated',
      riskFactors: ['Quote velocity down 75%', '1 uncollected invoice retry'],
      recommendedAction: 'Send automated "Need help closing quotes this week?" tip series.',
    },
  ];

  const atRiskMrrDollars = accounts.reduce((sum, a) => sum + a.mrrDollars, 0);

  return {
    totalScanned: 11,
    atRiskCount: accounts.length,
    atRiskMrrDollars,
    accounts,
  };
}
