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
  supabase?: SupabaseClient,
): Promise<{
  totalScanned: number;
  atRiskCount: number;
  atRiskMrrDollars: number;
  accounts: ChurnRiskAccount[];
}> {
  if (!supabase) {
    return {
      totalScanned: 0,
      atRiskCount: 0,
      atRiskMrrDollars: 0,
      accounts: [],
    };
  }

  try {
    const { data: accountsData, error: accountsError } = await supabase
      .from('accounts')
      .select('id, business_name, plan, last_active_at, updated_at')
      .neq('status', 'suspended')
      .neq('test_marker', true);

    if (accountsError || !accountsData) {
      throw new Error(accountsError?.message || 'Failed to fetch accounts');
    }

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString();

    const { data: quotesData, error: quotesError } = await supabase
      .from('jobs')
      .select('account_id, created_at')
      .gte('created_at', sixtyDaysAgo);

    if (quotesError || !quotesData) {
      throw new Error(quotesError?.message || 'Failed to fetch quotes');
    }

    const PLAN_MRR_WEIGHTS: Record<string, number> = {
      solo: 39,
      growth: 129,
      scale: 329,
    };

    const churnRiskAccounts: ChurnRiskAccount[] = [];

    for (const acc of accountsData) {
      const lastActive = acc.last_active_at || acc.updated_at;
      let daysSinceLastLogin = 0;
      if (lastActive) {
        daysSinceLastLogin = Math.floor((now.getTime() - new Date(lastActive).getTime()) / (1000 * 60 * 60 * 24));
      }

      const accQuotes = quotesData.filter((q: any) => q.account_id === acc.id);
      const quotesLast30Days = accQuotes.filter((q: any) => q.created_at >= thirtyDaysAgo).length;
      const quotesPrev30Days = accQuotes.filter((q: any) => q.created_at < thirtyDaysAgo).length;

      let velocityDropPercent = 0;
      if (quotesPrev30Days > 0) {
        velocityDropPercent = Math.max(0, Math.round(((quotesPrev30Days - quotesLast30Days) / quotesPrev30Days) * 100));
      }

      const mrrDollars = PLAN_MRR_WEIGHTS[acc.plan?.toLowerCase()] || 0;
      
      let riskLevel: 'critical' | 'elevated' | 'low' = 'low';
      let riskFactors: string[] = [];

      if (daysSinceLastLogin > 14 || velocityDropPercent > 75) {
        riskLevel = 'critical';
        if (daysSinceLastLogin > 14) riskFactors.push(`${daysSinceLastLogin} days since last login`);
        if (velocityDropPercent > 75) riskFactors.push(`Quote velocity dropped ${velocityDropPercent}%`);
      } else if (daysSinceLastLogin > 7 || velocityDropPercent > 50) {
        riskLevel = 'elevated';
        if (daysSinceLastLogin > 7) riskFactors.push(`${daysSinceLastLogin} days since last login`);
        if (velocityDropPercent > 50) riskFactors.push(`Quote velocity dropped ${velocityDropPercent}%`);
      }

      let recommendedAction = 'Monitor activity';
      if (riskLevel === 'critical') {
        recommendedAction = 'Trigger personal check-in email from founder + offer 1-on-1 workflow setup assistance.';
      } else if (riskLevel === 'elevated') {
        recommendedAction = 'Send automated "Need help closing quotes this week?" tip series.';
      }

      if (riskLevel !== 'low') {
        churnRiskAccounts.push({
          accountId: acc.id,
          businessName: acc.business_name || 'Unknown Business',
          plan: acc.plan || 'unknown',
          mrrDollars,
          daysSinceLastLogin,
          quotesLast30Days,
          quotesPrev30Days,
          velocityDropPercent,
          riskLevel,
          riskFactors,
          recommendedAction,
        });
      }
    }

    const atRiskMrrDollars = churnRiskAccounts.reduce((sum, a) => sum + a.mrrDollars, 0);

    return {
      totalScanned: accountsData.length,
      atRiskCount: churnRiskAccounts.length,
      atRiskMrrDollars,
      accounts: churnRiskAccounts,
    };
  } catch (error) {
    console.error('Error scanning for churn risk:', error);
    return {
      totalScanned: 0,
      atRiskCount: 0,
      atRiskMrrDollars: 0,
      accounts: [],
    };
  }
}
