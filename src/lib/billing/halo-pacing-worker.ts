import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/auth';
import { killHaloCampaign } from '@/lib/neighborhood-halo-service';
import { fetchMetaCampaignDailySpend } from '@/lib/meta-ads-api';

export type HaloPacingWorkerResult = {
  processed: number; advanced: number; completed: number; killed: number;
  pauseFailures: number; totalDailySpendDollars: number; summary: string;
};

export async function runHaloPacingWorker(admin: SupabaseClient = createAdminClient()): Promise<HaloPacingWorkerResult> {
  const { data: rows, error } = await admin.from('neighborhood_halo_campaigns').select('*')
    .in('status', ['active', 'paused', 'pending_provisioning']).is('deleted_at', null);
  if (error) throw new Error(`Could not load Halo campaigns: ${error.message}`);
  let advanced = 0, completed = 0, killed = 0, pauseFailures = 0, totalDailySpendDollars = 0;
  for (const row of rows || []) {
    try {
      const elapsedMs = Date.now() - new Date(row.created_at).getTime();
      if (row.settlement_requested_at) {
        const settled = await killHaloCampaign(admin, row.account_id, row.id, row.auto_kill_reason || 'reconcile_final_spend');
        if (settled.status === 'completed') completed++; else if (settled.status === 'killed' || settled.status === 'failed') killed++;
        continue;
      }
      if (row.status === 'pending_provisioning') {
        if (Date.now() - new Date(row.updated_at).getTime() > 15 * 60 * 1000) {
          await killHaloCampaign(admin, row.account_id, row.id, 'incomplete_provisioning');
          killed++;
        }
        continue;
      }
      if (!row.meta_campaign_id || !/^\d+$/.test(row.meta_campaign_id)) throw new Error('Campaign has no verified provider ID.');
      // Lifetime totals are snapshots. Repeated cron runs must not add the same spend twice.
      const insights = await fetchMetaCampaignDailySpend(row.meta_campaign_id, undefined, 'maximum');
      if (!insights.success || !Number.isSafeInteger(insights.spendCents) || insights.spendCents < 0) throw new Error('Provider spend is unavailable.');
      const spend = Math.max(Number(row.spend_dollars || 0), insights.spendCents / 100);
      const updated = await admin.rpc('sync_halo_metrics', { p_campaign_id: row.id, p_spend_cents: insights.spendCents,
        p_impressions: insights.impressions, p_clicks: insights.clicks, p_days: Math.max(0, Math.floor(elapsedMs / 86400000)) });
      if (updated.error) throw new Error(updated.error.message);
      if (updated.data !== true) continue;
      totalDailySpendDollars += Math.max(0, spend - Number(row.spend_dollars || 0));
      const expired = row.expires_at && Date.now() >= new Date(row.expires_at).getTime();
      if (expired || insights.spendCents >= Number(row.budget_dollars) * 100) {
        const stopped = await killHaloCampaign(admin, row.account_id, row.id, 'duration_complete');
        if (stopped.status === 'completed') completed++; else advanced++;
      } else if (elapsedMs >= 72 * 3600000 && insights.clicks === 0 && row.status === 'active') {
        const stopped = await killHaloCampaign(admin, row.account_id, row.id, 'zero_clicks_after_72_hours');
        if (stopped.status === 'killed') killed++; else advanced++;
      } else advanced++;
    } catch (failure) {
      pauseFailures++;
      console.error(`[HaloPacingWorker] Campaign ${row.id} needs recovery:`, failure);
    }
  }
  return { processed: rows?.length || 0, advanced, completed, killed, pauseFailures, totalDailySpendDollars,
    summary: `${advanced} refreshed, ${completed} completed, ${killed} stopped, ${pauseFailures} require recovery.` };
}
