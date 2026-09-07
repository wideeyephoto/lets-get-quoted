import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/auth';
import {
  evaluateHaloAutoKillCriteria,
  calculateHaloGeofence,
  type NeighborhoodHaloCampaign,
} from '@/lib/neighborhood-halo';
import { killHaloCampaign } from '@/lib/neighborhood-halo-service';
import { fetchMetaCampaignDailySpend, pauseMetaCampaign } from '@/lib/meta-ads-api';

export type HaloPacingWorkerResult = {
  processed: number;
  advanced: number;
  completed: number;
  killed: number;
  totalDailySpendDollars: number;
  summary: string;
};

export async function runHaloPacingWorker(
  admin: SupabaseClient = createAdminClient()
): Promise<HaloPacingWorkerResult> {
  const { data: activeRows, error } = await admin
    .from('neighborhood_halo_campaigns')
    .select('*')
    .in('status', ['active', 'simulated_sandbox'])
    .is('deleted_at', null);

  if (error) {
    console.error('Failed to query active neighborhood halo campaigns:', error);
    return {
      processed: 0,
      advanced: 0,
      completed: 0,
      killed: 0,
      totalDailySpendDollars: 0,
      summary: `Failed to query active campaigns: ${error.message}`,
    };
  }

  let advanced = 0;
  let completed = 0;
  let killed = 0;
  let totalDailySpendDollars = 0;

  for (const row of activeRows || []) {
    const campaignId = String(row.id);
    const accountId = String(row.account_id);
    const durationDays = Number(row.duration_days || 5);
    const daysActive = Number(row.days_active || 0);
    const budgetDollars = Number(row.budget_dollars || 25.0);
    const currentSpend = Number(row.spend_dollars || 0.0);
    const dailyBudget = Number(row.daily_budget_dollars || budgetDollars / durationDays);

    const haloObj: NeighborhoodHaloCampaign = {
      id: campaignId,
      accountId,
      jobId: row.job_id || '',
      rawAddress: '',
      sanitizedAddress: row.street_name,
      streetName: row.street_name,
      neighborhoodName: row.neighborhood_name || '',
      city: row.city,
      state: row.state || '',
      zip: row.zip || '',
      geofence: calculateHaloGeofence(Number(row.center_lat || 0), Number(row.center_lng || 0), Number(row.radius_miles || 1.0)),
      budgetDollars,
      durationDays,
      status: row.status as never,
      adCopy: row.ad_copy,
      targetLandingUrl: row.landing_page_url,
      metrics: {
        impressions: Number(row.impressions || 0),
        clicks: Number(row.clicks || 0),
        leads: Number(row.leads_generated || 0),
        spendDollars: currentSpend,
      },
      createdAt: row.created_at,
      expiresAt: row.expires_at || '',
    };

    // 1. Evaluate 72-hour zero-click auto-kill criteria
    const autoKill = evaluateHaloAutoKillCriteria(haloObj);
    if (autoKill.shouldKill) {
      await killHaloCampaign(admin, accountId, campaignId, autoKill.reason);
      killed += 1;
      continue;
    }

    // 2. Check if campaign reached full duration or expiry
    const createdAtMs = new Date(row.created_at).getTime();
    const nowMs = Date.now();
    const elapsedDays = Math.max(1, Math.floor((nowMs - createdAtMs) / (24 * 60 * 60 * 1000)));
    const isExpired = row.expires_at ? nowMs >= new Date(row.expires_at).getTime() : false;
    const newDaysActive = Math.max(daysActive, elapsedDays);

    if (newDaysActive >= durationDays || isExpired) {
      if (row.meta_campaign_id) {
        try {
          await pauseMetaCampaign(row.meta_campaign_id);
        } catch (pauseErr) {
          console.warn(`[HaloPacingWorker] Failed to pause completed Meta campaign ${row.meta_campaign_id}:`, pauseErr);
        }
      }

      await admin
        .from('neighborhood_halo_campaigns')
        .update({
          status: 'completed',
          days_active: Math.max(newDaysActive, durationDays),
          spend_dollars: currentSpend,
          updated_at: new Date().toISOString(),
        })
        .eq('id', campaignId);

      completed += 1;
      continue;
    }

    // 3. Advance daily pacing
    let newImpressions = Number(row.impressions || 0);
    let newClicks = Number(row.clicks || 0);
    let additionalSpend = 0;

    const isSimulated =
      row.status === 'simulated_sandbox' ||
      !row.meta_campaign_id ||
      row.meta_campaign_id.startsWith('meta_sim_') ||
      row.meta_campaign_id.startsWith('sim_');

    if (isSimulated) {
      // In simulated sandbox mode, simulate daily pacing up to remaining budget
      additionalSpend = Math.min(budgetDollars - currentSpend, dailyBudget);
    } else if (row.meta_campaign_id) {
      // If live Meta campaign is linked, sync real performance insights
      try {
        const metaSpend = await fetchMetaCampaignDailySpend(row.meta_campaign_id);
        if (metaSpend.success) {
          if (metaSpend.impressions > 0) newImpressions = metaSpend.impressions;
          if (metaSpend.clicks > 0) newClicks = metaSpend.clicks;
          if (metaSpend.spendCents > 0) {
            additionalSpend = Math.min(budgetDollars - currentSpend, metaSpend.spendCents / 100);
          }
        } else {
          console.warn(`[HaloPacingWorker] Meta insights fetch failed for ${row.meta_campaign_id}: ${metaSpend.message}`);
        }
      } catch (metaErr) {
        console.warn(`[HaloPacingWorker] Meta insights fetch failed for ${row.meta_campaign_id}:`, metaErr);
      }
    }

    const nextSpend = currentSpend + additionalSpend;

    await admin
      .from('neighborhood_halo_campaigns')
      .update({
        days_active: newDaysActive,
        spend_dollars: nextSpend,
        impressions: newImpressions,
        clicks: newClicks,
        updated_at: new Date().toISOString(),
      })
      .eq('id', campaignId);

    totalDailySpendDollars += additionalSpend;
    advanced += 1;
  }

  return {
    processed: (activeRows || []).length,
    advanced,
    completed,
    killed,
    totalDailySpendDollars,
    summary: `Processed ${(activeRows || []).length} active halo campaigns: ${advanced} advanced, ${completed} completed, ${killed} auto-killed. Total daily spend paced: $${totalDailySpendDollars.toFixed(2)}.`,
  };
}
