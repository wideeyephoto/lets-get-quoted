/**
 * Meta Marketing API Client & Direct Campaign Orchestrator.
 *
 * Programmatically provisions Facebook & Instagram Feed Campaigns, Ad Sets,
 * Creatives, and Ads, and polls daily ad spend insights under Meta Graph API v20.0+.
 */

import { generateMetaAdCopy } from './multi-channel-ads';

export const META_GRAPH_API_VERSION = process.env.META_GRAPH_API_VERSION || 'v22.0';
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
  return Boolean(effectiveConfig.accessToken && effectiveAdAccount && effectiveConfig.pageId);
}

export type ProvisionMetaCampaignParams = {
  accountId: string;
  businessName: string;
  trade: string;
  city: string;
  radiusMiles: number;
  latitude?: number;
  longitude?: number;
  monthlyBudgetDollars: number;
  landingPageUrl: string;
  durationDays?: number;
  startPaused?: boolean;
  lifetimeBudgetDollars?: number;
  imageUrl?: string;
  headline?: string;
  primaryText?: string;
  endTime?: string;
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
  const copy = generateMetaAdCopy({ businessName: params.businessName, trade: params.trade, city: params.city, services: params.services || [], seasonalAngle: params.seasonalAngle || 'standard' });
  const config = getMetaAdsConfig();
  const account = normalizeAdAccountId(params.clientAdAccountId || config.adAccountId);
  const page = params.pageId || config.pageId;
  const dailyBudgetDollars = Math.round(params.monthlyBudgetDollars / 30.4 * 100) / 100;
  let campaignId = '', adSetId = '', creativeId = '', adId = '';
  const result = (success: boolean, status: ProvisionMetaCampaignResult['status'], message: string): ProvisionMetaCampaignResult => ({
    success, status, message, campaignId, adSetId, creativeId, adId, dailyBudgetDollars,
    headline: params.headline || copy.headline, primaryText: params.primaryText || copy.primaryText,
  });
  if (!isMetaAdsConfigured(account, { ...config, pageId: page }) || !page) return result(false, 'unconfigured', 'Meta credentials, ad account, and page are required.');
  if (!Number.isFinite(params.monthlyBudgetDollars) || params.monthlyBudgetDollars <= 0 || !Number.isFinite(params.radiusMiles) || params.radiusMiles < 1) {
    return result(false, 'failed', 'Invalid Meta budget or targeting radius.');
  }
  const end = params.endTime || (params.durationDays ? new Date(Date.now() + params.durationDays * 86400000).toISOString() : undefined);
  if (params.lifetimeBudgetDollars !== undefined && (!Number.isFinite(params.lifetimeBudgetDollars) || params.lifetimeBudgetDollars <= 0 || !end)) return result(false, 'failed', 'A lifetime budget requires a valid end time.');
  try {
    let geo: Record<string, unknown>;
    if (Number.isFinite(params.latitude) && Number.isFinite(params.longitude)) {
      if (Math.abs(params.latitude!) > 90 || Math.abs(params.longitude!) > 180) throw new Error('Invalid campaign coordinates.');
      geo = { custom_locations: [{ latitude: params.latitude, longitude: params.longitude, radius: params.radiusMiles, distance_unit: 'mile' }] };
    } else {
      const search = new URLSearchParams({ type: 'adgeolocation', q: params.city, location_types: '["city"]', country_code: 'US' });
      const found = await metaRequest(`search?${search}`, config);
      const cities = (found.data || []).filter((city: { country_code?: string }) => city.country_code === 'US');
      if (cities.length !== 1 || !cities[0].key) throw new Error('A unique local targeting area could not be verified. Supply coordinates.');
      geo = { cities: [{ key: cities[0].key, radius: params.radiusMiles, distance_unit: 'mile' }] };
    }
    const created = async (path: string, body: Record<string, unknown>) => {
      const data = await metaRequest(path, config, body);
      if (!data.id || !/^\d+$/.test(String(data.id))) throw new Error('Meta did not return a valid resource ID.');
      return String(data.id);
    };
    campaignId = await created(`${account}/campaigns`, { name: `${params.businessName} - ${params.trade} (${params.city})`, objective: 'OUTCOME_TRAFFIC', status: 'PAUSED', special_ad_categories: [], is_adset_budget_sharing_enabled: false });
    adSetId = await created(`${account}/adsets`, { name: `${params.city} + ${params.radiusMiles}mi`, campaign_id: campaignId,
      ...(params.lifetimeBudgetDollars !== undefined ? { lifetime_budget: String(Math.round(params.lifetimeBudgetDollars * 100)), start_time: new Date().toISOString() } : { daily_budget: String(Math.max(100, Math.round(dailyBudgetDollars * 100))) }),
      ...(end ? { end_time: end } : {}), billing_event: 'IMPRESSIONS', optimization_goal: 'LINK_CLICKS', bid_strategy: 'LOWEST_COST_WITHOUT_CAP', targeting: { geo_locations: geo }, status: 'PAUSED' });
    creativeId = await created(`${account}/adcreatives`, { name: `${params.businessName} Creative`, object_story_spec: { page_id: page,
      link_data: { link: params.landingPageUrl, message: params.primaryText || copy.primaryText, name: params.headline || copy.headline, description: copy.description,
        ...(params.imageUrl ? { picture: params.imageUrl } : {}), call_to_action: { type: 'GET_QUOTE', value: { link: params.landingPageUrl } } } } });
    adId = await created(`${account}/ads`, { name: `${params.businessName} Ad`, adset_id: adSetId, creative: { creative_id: creativeId }, status: 'PAUSED' });
    if (params.startPaused) return result(true, 'paused', 'Meta resources created and paused pending durable persistence.');
    const activated = await activateMetaCampaign({ campaignId, adSetId, adId }, config);
    if (!activated.success) throw new Error(activated.message);
    return result(true, 'active', 'Meta campaign, ad set, and ad activated.');
  } catch (error) {
    let message = error instanceof Error ? error.message : String(error);
    if (campaignId) {
      const paused = await pauseMetaCampaign(campaignId, config);
      if (!paused.success) message += `; cleanup pause failed: ${paused.message}`;
    }
    return result(false, 'failed', message);
  }
}

async function metaRequest(path: string, config: MetaAdsConfig, body?: Record<string, unknown>): Promise<Record<string, any>> {
  const response = await fetch(`${META_GRAPH_API_BASE_URL}/${path}`, { method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.accessToken}` },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15000) });
  const data = await response.json();
  if (!response.ok || data.error || data.success === false) throw new Error(data.error?.message || `Meta request failed (${response.status}).`);
  return data;
}

export async function activateMetaCampaign(ids: { campaignId: string; adSetId?: string; adId?: string }, config = getMetaAdsConfig()) {
  if (!ids.adSetId || !ids.adId || ![ids.campaignId, ids.adSetId, ids.adId].every(id => /^\d+$/.test(id))) return { success: false, message: 'Complete persisted Meta resource IDs are required.' };
  try {
    // Activate the parent last, so partially activated children cannot deliver.
    for (const id of [ids.adId, ids.adSetId, ids.campaignId]) await metaRequest(id, config, { status: 'ACTIVE' });
    return { success: true, message: 'Meta delivery enabled.' };
  } catch (error) {
    const paused = await pauseMetaCampaign(ids.campaignId, config);
    return { success: false, message: `${error instanceof Error ? error.message : String(error)}${paused.success ? '' : '; campaign pause needs recovery'}` };
  }
}

/**
 * Pauses an active Meta campaign.
 */
export async function pauseMetaCampaign(
  campaignId: string,
  config?: MetaAdsConfig
): Promise<{ success: boolean; message: string }> {
  if (!campaignId || !campaignId.trim()) {
    return { success: false, message: 'No Meta campaign ID provided to pause.' };
  }

  if (campaignId.startsWith('meta_') || campaignId.startsWith('sim_')) {
    // Simulated campaign ID
    return { success: false, message: 'Simulated campaign cannot be used for live delivery.' };
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
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      return { success: false, message: errData.error?.message || `HTTP ${res.status}` };
    }

    const body = await res.json();
    if (body.success !== true) throw new Error(body.error?.message || 'Meta did not confirm pause.');
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
  if (!/^\d+$/.test(campaignId)) {
    return { success: false, message: 'Simulated campaign cannot be used for live delivery.' };
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
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      return { success: false, message: errData.error?.message || `HTTP ${res.status}` };
    }

    const body = await res.json();
    if (body.success !== true) throw new Error(body.error?.message || 'Meta did not confirm resume.');
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
  config?: MetaAdsConfig,
  datePreset: 'today' | 'maximum' = 'today'
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

  if (!/^\d+$/.test(campaignId)) {
    // Simulated campaign fallback
    return {
      success: false,
      spendCents: 0,
      clicks: 0,
      impressions: 0,
      conversions: 0,
      date: todayStr,
      message: 'Campaign has no verified Meta ID.',
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
    const url = `${META_GRAPH_API_BASE_URL}/${campaignId}/insights?date_preset=${datePreset}&fields=spend,clicks,impressions,actions`;
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

    if (!Array.isArray(json.data)) throw new Error('Meta insights response is incomplete.');
    const row = json.data[0];
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

    if (![spendCents, clicks, impressions, conversions].every(value => Number.isSafeInteger(value) && value >= 0)) throw new Error('Meta returned invalid spend or metrics.');
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
