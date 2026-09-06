/**
 * Meta Marketing API Client & Direct Campaign Orchestrator.
 *
 * Programmatically provisions Facebook & Instagram Feed Campaigns, Ad Sets,
 * Creatives, and Ads, and polls daily ad spend insights under Meta Graph API v20.0+.
 */

import { generateMetaAdCopy, type MetaAdCopy } from './multi-channel-ads';

export const META_GRAPH_API_VERSION = process.env.META_GRAPH_API_VERSION || 'v20.0';
export const META_GRAPH_API_BASE_URL = `https://graph.facebook.com/${META_GRAPH_API_VERSION}`;

export type MetaAdsConfig = {
  accessToken?: string;
  adAccountId?: string;
  pageId?: string;
  pixelId?: string;
  appSecret?: string;
};

export function getMetaAdsConfig(): MetaAdsConfig {
  return {
    accessToken:
      process.env.META_ACCESS_TOKEN ||
      process.env.META_SYSTEM_USER_TOKEN ||
      process.env.META_PAGE_ACCESS_TOKEN,
    adAccountId: process.env.META_AD_ACCOUNT_ID,
    pageId: process.env.META_PAGE_ID,
    pixelId: process.env.META_PIXEL_ID || process.env.META_DATASET_ID,
    appSecret: process.env.META_APP_SECRET || process.env.FACEBOOK_APP_SECRET,
  };
}

/**
 * Ensures ad account ID is formatted as `act_<id>` required by Meta Graph API.
 */
export function normalizeAdAccountId(id?: string | null): string | null {
  if (!id || !id.trim()) return null;
  const clean = id.trim().replace(/^act_/, '');
  if (!clean) return null;
  return `act_${clean}`;
}

export function isMetaAdsConfigured(adAccountId?: string | null, config?: MetaAdsConfig): boolean {
  const effectiveConfig = config || getMetaAdsConfig();
  const effectiveAdAccount = normalizeAdAccountId(adAccountId || effectiveConfig.adAccountId);
  return Boolean(effectiveConfig.accessToken && effectiveAdAccount);
}

export type ProvisionMetaCampaignParams = {
  accountId: string;
  businessName: string;
  trade: string;
  city: string;
  radiusMiles: number;
  monthlyBudgetDollars: number;
  landingPageUrl: string;
  services?: string[];
  phone?: string;
  customFocus?: string;
  seasonalAngle?: 'standard' | 'emergency' | 'storm_seasonal' | 'peak_renovation';
  clientAdAccountId?: string;
  pageId?: string;
};

export type ProvisionMetaCampaignResult = {
  success: boolean;
  campaignId: string;
  adSetId?: string;
  creativeId?: string;
  adId?: string;
  status: 'active' | 'paused' | 'simulated' | 'failed' | 'unconfigured';
  dailyBudgetDollars: number;
  headline: string;
  primaryText: string;
  message: string;
};

/**
 * Programmatically provisions a Meta (Facebook & Instagram) Feed Campaign.
 * Implements two-stage activation: builds Campaign, Ad Set, Creative, and Ad in PAUSED state,
 * and only flips status to ACTIVE once all criteria succeed.
 */
export async function provisionManagedMetaCampaign(
  params: ProvisionMetaCampaignParams
): Promise<ProvisionMetaCampaignResult> {
  const {
    accountId,
    businessName,
    trade,
    city,
    radiusMiles = 25,
    monthlyBudgetDollars,
    landingPageUrl,
    services = [],
    customFocus,
    seasonalAngle = 'standard',
    clientAdAccountId,
    pageId: overridePageId,
  } = params;

  const dailyBudgetDollars = Math.round((monthlyBudgetDollars / 30.4) * 100) / 100;
  // Meta daily_budget is in cents (smallest currency unit for USD)
  const dailyBudgetCents = Math.max(100, Math.round(dailyBudgetDollars * 100));

  const adCopy: MetaAdCopy = generateMetaAdCopy({
    businessName,
    trade,
    city,
    services,
    seasonalAngle,
  });

  const config = getMetaAdsConfig();
  const targetAdAccountId = normalizeAdAccountId(clientAdAccountId || config.adAccountId);
  const targetPageId = overridePageId || config.pageId || 'mock_page_id';
  const isProduction = process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production';

  if (isMetaAdsConfigured(targetAdAccountId, config)) {
    try {
      const accessToken = config.accessToken!;
      const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      };

      // 1. Create Campaign (PAUSED)
      const campaignName = `${businessName} - ${trade} Feed (${city})`;
      const campaignRes = await fetch(
        `${META_GRAPH_API_BASE_URL}/${targetAdAccountId}/campaigns`,
        {
          method: 'POST',
          headers,
          signal: AbortSignal.timeout(15000),
          body: JSON.stringify({
            name: campaignName,
            objective: 'OUTCOME_LEADS',
            status: 'PAUSED',
            special_ad_categories: ['NONE'],
          }),
        }
      );

      if (!campaignRes.ok) {
        const errData = await campaignRes.json().catch(() => ({}));
        const errMsg = errData.error?.message || `HTTP ${campaignRes.status}`;
        console.error('Meta Campaign creation failed:', errMsg);
        return {
          success: false,
          campaignId: '',
          status: 'failed',
          dailyBudgetDollars,
          headline: adCopy.headline,
          primaryText: adCopy.primaryText,
          message: `Meta Campaign creation failed: ${errMsg}`,
        };
      }

      const campaignData = (await campaignRes.json()) as { id: string };
      const campaignId = campaignData.id;

      // 2. Create Ad Set (PAUSED)
      const cleanCity = city.replace(/,\s*[A-Z]{2}$/i, '').trim();
      const adSetRes = await fetch(
        `${META_GRAPH_API_BASE_URL}/${targetAdAccountId}/adsets`,
        {
          method: 'POST',
          headers,
          signal: AbortSignal.timeout(15000),
          body: JSON.stringify({
            name: `${cleanCity} + ${radiusMiles}mi Local Geo`,
            campaign_id: campaignId,
            daily_budget: String(dailyBudgetCents),
            billing_event: 'IMPRESSIONS',
            optimization_goal: 'LEAD_GENERATION',
            bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
            targeting: {
              geo_locations: {
                countries: ['US'],
                cities: [{ name: cleanCity, radius: radiusMiles, distance_unit: 'mile' }],
              },
            },
            status: 'PAUSED',
          }),
        }
      );

      if (!adSetRes.ok) {
        const errData = await adSetRes.json().catch(() => ({}));
        const errMsg = errData.error?.message || `HTTP ${adSetRes.status}`;
        console.error('Meta AdSet creation failed:', errMsg);
        return {
          success: false,
          campaignId,
          status: 'failed',
          dailyBudgetDollars,
          headline: adCopy.headline,
          primaryText: adCopy.primaryText,
          message: `Meta AdSet creation failed (campaign left PAUSED): ${errMsg}`,
        };
      }

      const adSetData = (await adSetRes.json()) as { id: string };
      const adSetId = adSetData.id;

      // 3. Create Ad Creative
      const creativeRes = await fetch(
        `${META_GRAPH_API_BASE_URL}/${targetAdAccountId}/adcreatives`,
        {
          method: 'POST',
          headers,
          signal: AbortSignal.timeout(15000),
          body: JSON.stringify({
            name: `${businessName} - Dynamic Trade Creative`,
            object_story_spec: {
              page_id: targetPageId,
              link_data: {
                link: landingPageUrl,
                message: adCopy.primaryText,
                name: adCopy.headline,
                description: adCopy.description,
                call_to_action: {
                  type: 'GET_QUOTE',
                  value: { link: landingPageUrl },
                },
              },
            },
          }),
        }
      );

      if (!creativeRes.ok) {
        const errData = await creativeRes.json().catch(() => ({}));
        const errMsg = errData.error?.message || `HTTP ${creativeRes.status}`;
        console.error('Meta Creative creation failed:', errMsg);
        return {
          success: false,
          campaignId,
          adSetId,
          status: 'failed',
          dailyBudgetDollars,
          headline: adCopy.headline,
          primaryText: adCopy.primaryText,
          message: `Meta Creative creation failed (campaign left PAUSED): ${errMsg}`,
        };
      }

      const creativeData = (await creativeRes.json()) as { id: string };
      const creativeId = creativeData.id;

      // 4. Create Ad (PAUSED)
      const adRes = await fetch(
        `${META_GRAPH_API_BASE_URL}/${targetAdAccountId}/ads`,
        {
          method: 'POST',
          headers,
          signal: AbortSignal.timeout(15000),
          body: JSON.stringify({
            name: `${businessName} Feed Ad`,
            adset_id: adSetId,
            creative: { creative_id: creativeId },
            status: 'PAUSED',
          }),
        }
      );

      if (!adRes.ok) {
        const errData = await adRes.json().catch(() => ({}));
        const errMsg = errData.error?.message || `HTTP ${adRes.status}`;
        console.error('Meta Ad creation failed:', errMsg);
        return {
          success: false,
          campaignId,
          adSetId,
          creativeId,
          status: 'failed',
          dailyBudgetDollars,
          headline: adCopy.headline,
          primaryText: adCopy.primaryText,
          message: `Meta Ad creation failed (campaign left PAUSED): ${errMsg}`,
        };
      }

      const adData = (await adRes.json()) as { id: string };
      const adId = adData.id;

      // 5. Complete Multi-Stage Activation: Flip Campaign, AdSet, and Ad to ACTIVE
      const activateCampRes = await fetch(
        `${META_GRAPH_API_BASE_URL}/${campaignId}`,
        {
          method: 'POST',
          headers,
          signal: AbortSignal.timeout(15000),
          body: JSON.stringify({ status: 'ACTIVE' }),
        }
      );

      if (!activateCampRes.ok) {
        const errData = await activateCampRes.json().catch(() => ({}));
        const errMsg = errData.error?.message || `HTTP ${activateCampRes.status}`;
        console.warn('Meta Campaign activation failed:', errMsg);
        return {
          success: false,
          campaignId,
          adSetId,
          creativeId,
          adId,
          status: 'failed',
          dailyBudgetDollars,
          headline: adCopy.headline,
          primaryText: adCopy.primaryText,
          message: `Meta Campaign activation failed: ${errMsg}`,
        };
      }

      const activateAdSetRes = await fetch(
        `${META_GRAPH_API_BASE_URL}/${adSetId}`,
        {
          method: 'POST',
          headers,
          signal: AbortSignal.timeout(15000),
          body: JSON.stringify({ status: 'ACTIVE' }),
        }
      );

      if (!activateAdSetRes.ok) {
        const errData = await activateAdSetRes.json().catch(() => ({}));
        const errMsg = errData.error?.message || `HTTP ${activateAdSetRes.status}`;
        console.warn('Meta AdSet activation failed:', errMsg);
        return {
          success: false,
          campaignId,
          adSetId,
          creativeId,
          adId,
          status: 'failed',
          dailyBudgetDollars,
          headline: adCopy.headline,
          primaryText: adCopy.primaryText,
          message: `Meta AdSet activation failed: ${errMsg}`,
        };
      }

      const activateAdRes = await fetch(
        `${META_GRAPH_API_BASE_URL}/${adId}`,
        {
          method: 'POST',
          headers,
          signal: AbortSignal.timeout(15000),
          body: JSON.stringify({ status: 'ACTIVE' }),
        }
      );

      if (!activateAdRes.ok) {
        const errData = await activateAdRes.json().catch(() => ({}));
        const errMsg = errData.error?.message || `HTTP ${activateAdRes.status}`;
        console.warn('Meta Ad activation failed:', errMsg);
        return {
          success: false,
          campaignId,
          adSetId,
          creativeId,
          adId,
          status: 'failed',
          dailyBudgetDollars,
          headline: adCopy.headline,
          primaryText: adCopy.primaryText,
          message: `Meta Ad activation failed: ${errMsg}`,
        };
      }

      return {
        success: true,
        campaignId,
        adSetId,
        creativeId,
        adId,
        status: 'active',
        dailyBudgetDollars,
        headline: adCopy.headline,
        primaryText: adCopy.primaryText,
        message: 'Meta Campaign, AdSet, and Ad successfully deployed and activated.',
      };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error('Meta Marketing API request error:', errMsg);
      return {
        success: false,
        campaignId: '',
        status: 'failed',
        dailyBudgetDollars,
        headline: adCopy.headline,
        primaryText: adCopy.primaryText,
        message: `Meta Marketing API error: ${errMsg}`,
      };
    }
  }

  // If in production and not configured, fail closed with clear status
  if (isProduction) {
    return {
      success: false,
      campaignId: '',
      status: 'unconfigured',
      dailyBudgetDollars,
      headline: adCopy.headline,
      primaryText: adCopy.primaryText,
      message: 'Meta Marketing credentials are not configured in production. Campaign queued for administrative fulfillment.',
    };
  }

  // Simulated deployment mode (for local development/tests without live keys)
  const simulatedCampaignId = `meta_${Math.floor(100000000 + Math.random() * 900000000)}`;
  const simAdSetId = `adset_${Math.floor(100000 + Math.random() * 900000)}`;
  const simCreativeId = `cr_${Math.floor(100000 + Math.random() * 900000)}`;
  const simAdId = `ad_${Math.floor(100000 + Math.random() * 900000)}`;

  return {
    success: true,
    campaignId: simulatedCampaignId,
    adSetId: simAdSetId,
    creativeId: simCreativeId,
    adId: simAdId,
    status: 'simulated',
    dailyBudgetDollars,
    headline: adCopy.headline,
    primaryText: adCopy.primaryText,
    message: 'Meta campaign simulated successfully (non-production environment).',
  };
}

/**
 * Pauses an active Meta campaign.
 */
export async function pauseMetaCampaign(
  campaignId: string,
  config?: MetaAdsConfig
): Promise<{ success: boolean; message: string }> {
  if (campaignId.startsWith('meta_') && campaignId.length === 14) {
    // Simulated campaign ID
    return { success: true, message: 'Simulated Meta campaign paused.' };
  }

  const effectiveConfig = config || getMetaAdsConfig();
  if (!effectiveConfig.accessToken) {
    return { success: false, message: 'Meta access token not configured.' };
  }

  try {
    const res = await fetch(`${META_GRAPH_API_BASE_URL}/${campaignId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${effectiveConfig.accessToken}`,
      },
      body: JSON.stringify({ status: 'PAUSED' }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      return { success: false, message: errData.error?.message || `HTTP ${res.status}` };
    }

    return { success: true, message: 'Meta campaign paused successfully.' };
  } catch (err) {
    return { success: false, message: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Resumes a paused Meta campaign.
 */
export async function resumeMetaCampaign(
  campaignId: string,
  config?: MetaAdsConfig
): Promise<{ success: boolean; message: string }> {
  if (campaignId.startsWith('meta_') && campaignId.length === 14) {
    return { success: true, message: 'Simulated Meta campaign resumed.' };
  }

  const effectiveConfig = config || getMetaAdsConfig();
  if (!effectiveConfig.accessToken) {
    return { success: false, message: 'Meta access token not configured.' };
  }

  try {
    const res = await fetch(`${META_GRAPH_API_BASE_URL}/${campaignId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${effectiveConfig.accessToken}`,
      },
      body: JSON.stringify({ status: 'ACTIVE' }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      return { success: false, message: errData.error?.message || `HTTP ${res.status}` };
    }

    return { success: true, message: 'Meta campaign resumed successfully.' };
  } catch (err) {
    return { success: false, message: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Fetches today's aggregated ad spend and metrics for a Meta campaign.
 */
export async function fetchMetaCampaignDailySpend(
  campaignId: string,
  config?: MetaAdsConfig
): Promise<{
  success: boolean;
  spendCents: number;
  clicks: number;
  impressions: number;
  conversions: number;
  date: string;
  message?: string;
}> {
  const todayStr = new Date().toISOString().slice(0, 10);

  if (campaignId.startsWith('meta_') && campaignId.length === 14) {
    // Simulated campaign fallback
    return {
      success: true,
      spendCents: 0,
      clicks: 0,
      impressions: 0,
      conversions: 0,
      date: todayStr,
      message: 'Simulated Meta campaign reports 0 spend.',
    };
  }

  const effectiveConfig = config || getMetaAdsConfig();
  if (!effectiveConfig.accessToken) {
    return {
      success: false,
      spendCents: 0,
      clicks: 0,
      impressions: 0,
      conversions: 0,
      date: todayStr,
      message: 'Meta access token not configured.',
    };
  }

  try {
    const url = `${META_GRAPH_API_BASE_URL}/${campaignId}/insights?date_preset=today&fields=spend,clicks,impressions,actions`;
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${effectiveConfig.accessToken}`,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      return {
        success: false,
        spendCents: 0,
        clicks: 0,
        impressions: 0,
        conversions: 0,
        date: todayStr,
        message: errData.error?.message || `HTTP ${res.status}`,
      };
    }

    const json = (await res.json()) as {
      data?: Array<{
        spend?: string;
        clicks?: string;
        impressions?: string;
        actions?: Array<{ action_type: string; value: string }>;
      }>;
    };

    const row = json.data?.[0];
    if (!row) {
      return {
        success: true,
        spendCents: 0,
        clicks: 0,
        impressions: 0,
        conversions: 0,
        date: todayStr,
      };
    }

    const spendDollars = parseFloat(row.spend || '0');
    const spendCents = Math.round(spendDollars * 100);
    const clicks = parseInt(row.clicks || '0', 10);
    const impressions = parseInt(row.impressions || '0', 10);

    let conversions = 0;
    if (Array.isArray(row.actions)) {
      for (const act of row.actions) {
        if (
          act.action_type === 'lead' ||
          act.action_type === 'contact' ||
          act.action_type === 'purchase'
        ) {
          conversions += parseInt(act.value || '0', 10);
        }
      }
    }

    return {
      success: true,
      spendCents,
      clicks,
      impressions,
      conversions,
      date: todayStr,
    };
  } catch (err) {
    return {
      success: false,
      spendCents: 0,
      clicks: 0,
      impressions: 0,
      conversions: 0,
      date: todayStr,
      message: err instanceof Error ? err.message : String(err),
    };
  }
}
