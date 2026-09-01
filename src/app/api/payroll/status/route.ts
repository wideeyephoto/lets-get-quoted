import { NextResponse } from 'next/server';
import { requireOfficeContext } from '@/lib/auth';
import {
  PROVIDER_CAPABILITIES,
  type ProviderApiCapability,
} from '@/lib/payroll-api-integration';
import { PAYROLL_PROVIDERS, type PayrollProvider } from '@/lib/payroll-export';

export const dynamic = 'force-dynamic';

/**
 * GET /api/payroll/status
 * Returns available payroll provider capabilities, configured status, and supported endpoints.
 */
export async function GET() {
  try {
    const { supabase, accountId } = await requireOfficeContext('crew_pay.read');

    const { data: accountRow } = await supabase
      .from('accounts')
      .select('id, name')
      .eq('id', accountId)
      .maybeSingle();

    // Query recent payroll sync / submission events
    const { data: recentEvents } = await supabase
      .from('pay_events')
      .select('id, action, summary, created_at, meta')
      .eq('account_id', accountId)
      .in('action', ['marked_sent', 'export_created'])
      .order('created_at', { ascending: false })
      .limit(10);

    const providers = PAYROLL_PROVIDERS.map((provider: PayrollProvider) => {
      const cap: ProviderApiCapability = PROVIDER_CAPABILITIES[provider];
      return {
        id: provider,
        name: cap.name,
        supportsDirectApi: cap.supportsDirectApi,
        supportsWebhooks: cap.supportsWebhooks,
        supportsDryRun: cap.supportsDryRun,
        requiredCredentials: cap.requiredCredentials,
        status: 'ready',
      };
    });

    return NextResponse.json({
      success: true,
      account: {
        id: accountId,
        name: (accountRow as { name?: string } | null)?.name || 'Account',
      },
      providers,
      recentSyncEvents: recentEvents || [],
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to load payroll status.' },
      { status: 500 },
    );
  }
}
