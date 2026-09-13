import { cronRoute } from '@/lib/cron-runs';
import { createAdminClient } from '@/lib/auth';
import type { SupabaseClient } from '@supabase/supabase-js';
import { calculatePlatformRevenueMetrics, calculateContractorMetrics, calculateSmsDeliverability } from '@/lib/ai-operator/briefing';
import { getUnresolvedWebhookFailures, getRecentIncidents, getPaymentsNeedingAttention } from '@/lib/admin-alerts';
import { getCronTrouble } from '@/lib/cron-runs';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

async function runOpsMetricsSnapshotCron(admin?: SupabaseClient) {
  const client = admin || createAdminClient();
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 3600 * 1000);

  const [
    revenue,
    contractors,
    sms,
    unresolvedWebhooks,
    incidents,
    cronTrouble,
    dunning,
    { count: newSignupsCount },
    { count: quotesCreatedCount },
  ] = await Promise.all([
    calculatePlatformRevenueMetrics(client),
    calculateContractorMetrics(client),
    calculateSmsDeliverability(client, { now }),
    getUnresolvedWebhookFailures(client).catch(() => []),
    getRecentIncidents(client, { limit: 100 }).catch(() => []),
    getCronTrouble(client).catch(() => []),
    getPaymentsNeedingAttention(client).catch(() => []),
    client
      .from('accounts')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', yesterday.toISOString()),
    client
      .from('jobs')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', yesterday.toISOString()),
  ]);

  const activeIncidents = Array.isArray(incidents) ? incidents.filter((i) => !i.resolved_at) : [];
  const troubleCount = Array.isArray(cronTrouble) ? cronTrouble.length : 0;
  
  let dunningTotalAmountCents = 0;
  for (const d of dunning) {
    dunningTotalAmountCents += Math.round((d.amount ?? 0) * 100);
  }

  const snapshot = {
    snapshot_date: now.toISOString().split('T')[0],
    mrr_estimated: revenue.mrrEstimated,
    active_subscriptions: revenue.activeSubscriptions,
    total_active_contractors: contractors.totalActive,
    stripe_connected_contractors: contractors.onboardedInPeriod,
    sms_deliverability_pct: sms.deliverabilityPct,
    unresolved_webhooks_count: unresolvedWebhooks.length,
    incident_count: activeIncidents.length,
    new_signups_count: newSignupsCount ?? 0,
    quotes_created_count: quotesCreatedCount ?? 0,
    cron_troubled_count: troubleCount,
    dunning_count: dunning.length,
    dunning_total_amount_cents: dunningTotalAmountCents,
  };

  const { error } = await client
    .from('ops_metrics_snapshots')
    .upsert(snapshot, { onConflict: 'snapshot_date' });

  if (error) {
    throw new Error(`Failed to write ops_metrics_snapshots: ${error.message}`);
  }

  return snapshot;
}

export const GET = cronRoute('ops-metrics-snapshot', () => runOpsMetricsSnapshotCron(createAdminClient()));
