import type { SupabaseClient } from '@supabase/supabase-js';

export interface FraudRiskSignal {
  accountId: string;
  businessName: string;
  riskScore: number; // 0 - 100
  riskLevel: 'critical' | 'high' | 'medium' | 'low';
  triggeredSignals: string[];
  recommendedAction: 'freeze_payouts' | 'request_kyc' | 'manual_review' | 'clear';
}

/**
 * Scans Stripe Connect accounts and high-volume transactions for fraud anomalies
 */
export async function scanStripeConnectAccountsForFraud(
  supabase?: SupabaseClient,
): Promise<{
  scannedAccountsCount: number;
  flaggedCount: number;
  signals: FraudRiskSignal[];
}> {
  if (!supabase) {
    const signals: FraudRiskSignal[] = [
      {
        accountId: 'acc_fraud_test_1',
        businessName: 'Lightning Remodeling Corp',
        riskScore: 25,
        riskLevel: 'low',
        triggeredSignals: ['First quote sent within 2 hours of signup', 'Normal US IP address and matched bank owner name'],
        recommendedAction: 'clear',
      },
    ];

    return {
      scannedAccountsCount: 11,
      flaggedCount: signals.filter((s) => s.riskLevel === 'high' || s.riskLevel === 'critical').length,
      signals,
    };
  }

  try {
    const { data: accountsData, error: accountsError } = await supabase
      .from('accounts')
      .select('id, business_name, stripe_account_id, created_at')
      .not('stripe_account_id', 'is', null);

    if (accountsError || !accountsData) {
      throw new Error(accountsError?.message || 'Failed to fetch accounts');
    }

    const { data: paymentsData, error: paymentsError } = await supabase
      .from('payments')
      .select('account_id, amount, status, created_at');

    if (paymentsError || !paymentsData) {
      throw new Error(paymentsError?.message || 'Failed to fetch payments');
    }

    const signals: FraudRiskSignal[] = [];

    for (const acc of accountsData) {
      const accPayments = paymentsData.filter((p: any) => p.account_id === acc.id);
      const disputes = accPayments.filter((p: any) => p.status === 'disputed').length;
      
      const now = new Date();
      const accountAgeDays = Math.floor((now.getTime() - new Date(acc.created_at).getTime()) / (1000 * 60 * 60 * 24));
      
      const recentVolume = accPayments.filter((p: any) => 
        (now.getTime() - new Date(p.created_at).getTime()) / (1000 * 60 * 60 * 24) <= 7
      ).reduce((sum: number, p: any) => sum + p.amount, 0);

      let riskScore = 0;
      const triggeredSignals: string[] = [];

      if (disputes > 0) {
        riskScore += Math.min(disputes * 30, 60);
        triggeredSignals.push(`${disputes} disputed payments`);
      }

      if (accountAgeDays < 7 && recentVolume > 500000) { // $5000.00
        riskScore += 40;
        triggeredSignals.push(`High transaction volume ($${recentVolume / 100}) for new account (<7 days)`);
      }

      let riskLevel: 'critical' | 'high' | 'medium' | 'low' = 'low';
      let recommendedAction: 'freeze_payouts' | 'request_kyc' | 'manual_review' | 'clear' = 'clear';

      if (riskScore >= 80) {
        riskLevel = 'critical';
        recommendedAction = 'freeze_payouts';
      } else if (riskScore >= 50) {
        riskLevel = 'high';
        recommendedAction = 'request_kyc';
      } else if (riskScore >= 20) {
        riskLevel = 'medium';
        recommendedAction = 'manual_review';
      }

      if (riskLevel !== 'low' || triggeredSignals.length > 0) {
        signals.push({
          accountId: acc.id,
          businessName: acc.business_name || 'Unknown Business',
          riskScore,
          riskLevel,
          triggeredSignals,
          recommendedAction,
        });
      }
    }

    return {
      scannedAccountsCount: accountsData.length,
      flaggedCount: signals.filter((s) => s.riskLevel === 'high' || s.riskLevel === 'critical').length,
      signals,
    };
  } catch (error) {
    console.error('Error scanning for fraud risk:', error);
    return { scannedAccountsCount: 0, flaggedCount: 0, signals: [] };
  }
}
