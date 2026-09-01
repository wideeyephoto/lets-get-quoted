import type { SupabaseClient } from '@supabase/supabase-js';

export interface SeasonalCampaignTemplate {
  season: 'spring' | 'summer' | 'fall' | 'winter';
  trade: string;
  campaignTitle: string;
  offerSubject: string;
  smsCopy: string;
}

export const SEASONAL_REBOOK_TEMPLATES: Record<string, SeasonalCampaignTemplate> = {
  'roofing_spring': {
    season: 'spring',
    trade: 'Roofing',
    campaignTitle: 'Spring Post-Winter Roof & Gutter Inspection',
    offerSubject: 'Complimentary Spring Roof & Gutter Inspection',
    smsCopy: 'Hi {name}, winter storms can cause subtle shingle displacement or gutter blockages. As a past client, we are offering complimentary spring roof inspections in your neighborhood this week. Reply YES to schedule!',
  },
  'hvac_fall': {
    season: 'fall',
    trade: 'HVAC',
    campaignTitle: 'Fall Furnace & Heating Pre-Winter Tune-Up',
    offerSubject: 'Schedule Your Annual Heating Safety Tune-Up',
    smsCopy: 'Hi {name}, cold weather is around the corner. Book your annual furnace safety check & filter refresh this week for only $79. Reply YES to reserve your spot!',
  },
  'painting_summer': {
    season: 'summer',
    trade: 'Painting',
    campaignTitle: 'Summer Deck & Exterior Touch-Up',
    offerSubject: 'Protect Your Deck & Exterior Siding This Summer',
    smsCopy: 'Hi {name}, summer is the ideal season for exterior staining and weather sealing. Enjoy 15% off any deck or exterior painting scheduled this month. Reply YES for a quick quote!',
  },
};

export interface RebookOpportunity {
  jobId: string;
  accountId: string;
  customerName: string;
  customerPhone?: string;
  customerEmail?: string;
  completedAt: string;
  monthsSinceCompletion: number;
  trade: string;
  recommendedCampaign: SeasonalCampaignTemplate;
}

/**
 * Identifies past completed jobs ripe for seasonal maintenance re-engagement
 */
export async function scanPastJobsForSeasonalRebooking(
  supabase: SupabaseClient,
  accountId?: string,
  now = new Date(),
): Promise<RebookOpportunity[]> {
  try {
    const sixMonthsAgo = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000).toISOString();

    let query = supabase
      .from('jobs')
      .select('id, account_id, customer_name, customer_phone, customer_email, completed_at, trade, status')
      .eq('status', 'completed')
      .lte('completed_at', sixMonthsAgo);

    if (accountId) {
      query = query.eq('account_id', accountId);
    }

    const { data: jobs } = await query.limit(50);
    if (!jobs || jobs.length === 0) return [];

    const month = now.getMonth(); // 0 = Jan, 8 = Sep
    const currentSeason = (month >= 2 && month <= 4) ? 'spring' : (month >= 5 && month <= 7) ? 'summer' : (month >= 8 && month <= 10) ? 'fall' : 'winter';

    const opportunities: RebookOpportunity[] = [];
    for (const j of jobs) {
      const completedMs = new Date(j.completed_at || now.toISOString()).getTime();
      const monthsSince = Math.round((now.getTime() - completedMs) / (30 * 24 * 60 * 60 * 1000));
      const tradeKey = (j.trade || 'roofing').toLowerCase();

      const campaignKey = `${tradeKey}_${currentSeason}`;
      const template = SEASONAL_REBOOK_TEMPLATES[campaignKey] || SEASONAL_REBOOK_TEMPLATES.roofing_spring;

      opportunities.push({
        jobId: j.id,
        accountId: j.account_id,
        customerName: j.customer_name || 'Homeowner',
        customerPhone: j.customer_phone,
        customerEmail: j.customer_email,
        completedAt: j.completed_at || sixMonthsAgo,
        monthsSinceCompletion: monthsSince,
        trade: j.trade || 'Roofing',
        recommendedCampaign: template,
      });
    }

    return opportunities;
  } catch (err) {
    console.error('Failed to scan past jobs for seasonal rebooking:', err);
    return [];
  }
}
