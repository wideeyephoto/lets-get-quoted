import type { SupabaseClient } from '@supabase/supabase-js';
import { ready, unavailable, type Loadable, type SystemAlert, type SystemAlertsSummary } from '@/lib/dashboard-types';

export async function loadSystemStatus(
  supabase: SupabaseClient,
  accountId: string,
  basePath = '/dashboard',
  accountRow?: { connect_disabled_at?: string | null } | null,
): Promise<Loadable<SystemAlertsSummary>> {
  try {
    const alerts: SystemAlert[] = [];

    const accountPromise = accountRow !== undefined
      ? Promise.resolve({ data: accountRow })
      : supabase
          .from('accounts')
          .select('connect_onboarded, connect_disabled_at, twilio_status, signalwire_space_url')
          .eq('id', accountId)
          .maybeSingle();

    const [{ data: account }, { data: failedPayments }, { data: failedMessages }] = await Promise.all([
      accountPromise,
      supabase
        .from('payments')
        .select('id, amount, client_id, job_id, created_at')
        .eq('account_id', accountId)
        .eq('status', 'failed')
        .order('created_at', { ascending: false })
        .limit(3),
      supabase
        .from('sms_messages')
        .select('id, delivery_status, created_at')
        .eq('account_id', accountId)
        .eq('delivery_status', 'failed')
        .order('created_at', { ascending: false })
        .limit(3),
    ]);

    // 1. Stripe payouts disabled
    if (account?.connect_disabled_at) {
      alerts.push({
        id: 'stripe-disabled',
        title: 'Stripe payouts disabled',
        description: 'Stripe has paused customer deposits and stage payments. Re-verify your account details to restore payouts.',
        severity: 'critical',
        actionHref: `${basePath}/settings#payments`,
        actionLabel: 'Resolve payout issue',
      });
    }

    // 2. Failed payments requiring intervention
    if (failedPayments && failedPayments.length > 0) {
      alerts.push({
        id: 'failed-payments',
        title: `${failedPayments.length} payment${failedPayments.length === 1 ? '' : 's'} failed`,
        description: 'Customer card or bank charge declined. Update billing method or retry payment to settle invoice balance.',
        severity: 'critical',
        actionHref: `${basePath}/jobs?owing=1`,
        actionLabel: 'Review failed payments',
      });
    }

    // 3. SMS / Automation delivery failures
    if (failedMessages && failedMessages.length > 0) {
      alerts.push({
        id: 'sms-delivery-failed',
        title: 'Message delivery failure',
        description: 'Recent automated customer messages could not be delivered by the SMS provider.',
        severity: 'warning',
        actionHref: `${basePath}/messages`,
        actionLabel: 'Check messages',
      });
    }

    const criticalCount = alerts.filter((a) => a.severity === 'critical').length;
    const warningCount = alerts.filter((a) => a.severity === 'warning').length;

    return ready({
      alerts,
      criticalCount,
      warningCount,
    });
  } catch (error) {
    console.error('Failed to load system alerts:', error);
    return unavailable('query_failed');
  }
}
