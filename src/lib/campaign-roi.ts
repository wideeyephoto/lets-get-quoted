import type { SupabaseClient } from '@supabase/supabase-js';
import type { Lead, LeadAttribution } from '@/lib/leads';
import { generateQrSvg } from '@/lib/equipment-qr';
import { applyTestRecordFilter, type TestRecordOptions } from '@/lib/test-records';
import { fetchAllPages } from '@/lib/pagination';

export type AttributionChannelId =
  | 'google'
  | 'meta'
  | 'tiktok'
  | 'local'
  | 'print_qr'
  | 'email_sms'
  | 'promo'
  | 'organic_search'
  | 'direct';

export type ChannelRoiSummary = {
  id: AttributionChannelId;
  name: string;
  icon: string;
  isPaid: boolean;
  leadsCount: number;
  contactedCount: number;
  quotedCount: number;
  wonCount: number;
  winRatePct: number;
  totalRevenue: number;
  avgTicket: number;
  topCampaign: string | null;
  defaultSetupHref?: string;
};

export type CampaignBreakdown = {
  campaign: string;
  channelId: AttributionChannelId;
  channelName: string;
  leadsCount: number;
  wonCount: number;
  winRatePct: number;
  totalRevenue: number;
  avgTicket: number;
};

export type OverallRoiSummary = {
  totalLeads: number;
  adAttributedLeads: number;
  adAttributedPct: number;
  totalQuotedCount: number;
  adQuotedCount: number;
  totalWonCount: number;
  adWonCount: number;
  totalRevenue: number;
  adAttributedRevenue: number;
  overallWinRatePct: number;
  adWinRatePct: number;
  overallAvgTicket: number;
  adAvgTicket: number;
  totalAdSpend: number;
  estimatedRoasMultiplier: number;
  channels: ChannelRoiSummary[];
  topCampaigns: CampaignBreakdown[];
};

export type JobFinancialLookup = Record<string, { total: number; isWon: boolean }>;

export const CHANNEL_DEFINITIONS: Record<
  AttributionChannelId,
  { name: string; icon: string; isPaid: boolean; defaultSetupHref: string }
> = {
  google: { name: 'Google Ads & Local Services', icon: '🎯', isPaid: true, defaultSetupHref: '/dashboard/marketing/ads' },
  meta: { name: 'Meta / Instagram Ads', icon: '📱', isPaid: true, defaultSetupHref: '/dashboard/marketing/ads' },
  tiktok: { name: 'TikTok Ads', icon: '🎵', isPaid: true, defaultSetupHref: '/dashboard/marketing/links' },
  local: { name: 'Local & Referrals (Nextdoor/Yelp/Angi)', icon: '🏡', isPaid: false, defaultSetupHref: '/dashboard/marketing/links' },
  print_qr: { name: 'Yard Signs & Offline QR', icon: '🪧', isPaid: false, defaultSetupHref: '/dashboard/marketing/links' },
  email_sms: { name: 'Email & Text Campaigns', icon: '✉️', isPaid: false, defaultSetupHref: '/dashboard/marketing/campaigns' },
  promo: { name: 'On-Site Promos & Banners', icon: '🏷️', isPaid: false, defaultSetupHref: '/dashboard/marketing/links' },
  organic_search: { name: 'Organic Search & Blog SEO', icon: '✍️', isPaid: false, defaultSetupHref: '/dashboard/marketing/blog' },
  direct: { name: 'Direct, Phone & Walk-Ins', icon: '📞', isPaid: false, defaultSetupHref: '/dashboard/leads' },
};

/**
 * Categorize a lead into a standardized acquisition channel based on its attribution metadata and CRM source.
 */
export function classifyLeadChannel(
  attr?: LeadAttribution | null,
  leadSource?: string | null,
): AttributionChannelId {
  const normalizedLeadSource = (leadSource || '').toLowerCase().trim();

  // 1. Direct CRM lead source overrides
  if (normalizedLeadSource === 'google_lsa') {
    return 'google';
  }
  if (normalizedLeadSource === 'meta_lead_ads') {
    return 'meta';
  }
  if (
    normalizedLeadSource === 'angi' ||
    normalizedLeadSource === 'thumbtack' ||
    normalizedLeadSource === 'marketplace' ||
    normalizedLeadSource === 'referral'
  ) {
    return 'local';
  }
  if (
    normalizedLeadSource === 'missed_call' ||
    normalizedLeadSource === 'ai_voice' ||
    normalizedLeadSource === 'manual'
  ) {
    return 'direct';
  }

  if (!attr) return 'direct';

  const source = (attr.source || '').toLowerCase().trim();
  const medium = (attr.medium || '').toLowerCase().trim();
  const clickIdType = (attr.clickIdType || '').toLowerCase().trim();

  // 2. Offline Print & QR Collateral
  if (
    medium.includes('qr') ||
    medium.includes('print') ||
    source.includes('yard_sign') ||
    source.includes('truck') ||
    source.includes('door_hanger') ||
    source.includes('flyer')
  ) {
    return 'print_qr';
  }

  // 3. Email & SMS broadcast campaigns
  if (
    medium === 'email' ||
    medium === 'sms' ||
    medium === 'broadcast' ||
    source === 'email' ||
    source === 'sms' ||
    source === 'campaign' ||
    source === 'newsletter'
  ) {
    return 'email_sms';
  }

  // 4. Google Local Services Ads & Google Search Ads
  if (
    clickIdType === 'gclid' ||
    clickIdType === 'gbraid' ||
    clickIdType === 'wbraid' ||
    source === 'adwords' ||
    source === 'google_ads' ||
    source === 'google_lsa' ||
    source === 'google_local_services'
  ) {
    return 'google';
  }

  // 5. Meta (Facebook / Instagram Ads & Organic Social)
  if (
    clickIdType === 'fbclid' ||
    source === 'facebook' ||
    source === 'instagram' ||
    source === 'meta' ||
    source === 'meta_lead_ads' ||
    medium.includes('fb') ||
    medium.includes('insta') ||
    medium === 'meta_lead_ad'
  ) {
    return 'meta';
  }

  // 6. TikTok Ads
  if (clickIdType === 'ttclid' || source === 'tiktok' || medium.includes('tiktok')) {
    return 'tiktok';
  }

  // 7. Organic Search & Blog SEO (must precede generic google/bing checks)
  if (
    medium === 'organic' ||
    source === 'seo' ||
    source === 'blog' ||
    (source === 'google' && medium === 'organic') ||
    (source === 'bing' && medium === 'organic')
  ) {
    return 'organic_search';
  }

  // 8. Google source without explicit organic medium (e.g. cpc, search ad)
  if (source === 'google') {
    return 'google';
  }

  // 9. Local Aggregators & Home Improvement Directories
  if (
    source === 'nextdoor' ||
    source === 'yelp' ||
    source === 'angi' ||
    source === 'angie' ||
    source === 'thumbtack' ||
    source === 'marketplace' ||
    medium === 'referral' ||
    medium === 'marketplace_lead' ||
    medium === 'paid_lead'
  ) {
    return 'local';
  }

  // 10. On-Site Promos & Header Banners
  if ((attr as { promo?: string }).promo || (attr.campaign && (medium === 'onsite' || medium === 'promo' || !attr.source))) {
    return 'promo';
  }

  // 11. Generic Paid Clicks (unclassified paid traffic defaults to Meta)
  if (Boolean(attr.clickId) || medium === 'cpc' || medium === 'paid_social' || medium === 'paid_video') {
    return 'meta';
  }

  // 12. External Referrers
  if (attr.source || attr.referrer) {
    return 'local';
  }

  return 'direct';
}

export type MarketingAttributionLead = {
  id: string;
  source?: string | null;
  status: string;
  triage?: unknown;
  converted_job?: string | null;
  created_at?: string;
};

export type MarketingAttributionJob = {
  id: string;
  status: string;
  quoted_amount: number | string | null;
  created_at?: string;
};

export type CalculateCampaignRoiOptions = {
  actualAdSpend?: number;
};

/**
 * Calculates closed-loop campaign ROI and conversion performance across all leads and jobs.
 */
export function calculateCampaignRoi(
  leads: (Lead | MarketingAttributionLead)[],
  jobLookup: JobFinancialLookup = {},
  options: CalculateCampaignRoiOptions = {}
): OverallRoiSummary {
  const channelStats: Record<
    AttributionChannelId,
    {
      leadsCount: number;
      contactedCount: number;
      quotedCount: number;
      wonCount: number;
      totalRevenue: number;
      campaignCounts: Record<string, { count: number; won: number; revenue: number }>;
    }
  > = {
    google: { leadsCount: 0, contactedCount: 0, quotedCount: 0, wonCount: 0, totalRevenue: 0, campaignCounts: {} },
    meta: { leadsCount: 0, contactedCount: 0, quotedCount: 0, wonCount: 0, totalRevenue: 0, campaignCounts: {} },
    tiktok: { leadsCount: 0, contactedCount: 0, quotedCount: 0, wonCount: 0, totalRevenue: 0, campaignCounts: {} },
    local: { leadsCount: 0, contactedCount: 0, quotedCount: 0, wonCount: 0, totalRevenue: 0, campaignCounts: {} },
    print_qr: { leadsCount: 0, contactedCount: 0, quotedCount: 0, wonCount: 0, totalRevenue: 0, campaignCounts: {} },
    email_sms: { leadsCount: 0, contactedCount: 0, quotedCount: 0, wonCount: 0, totalRevenue: 0, campaignCounts: {} },
    promo: { leadsCount: 0, contactedCount: 0, quotedCount: 0, wonCount: 0, totalRevenue: 0, campaignCounts: {} },
    organic_search: { leadsCount: 0, contactedCount: 0, quotedCount: 0, wonCount: 0, totalRevenue: 0, campaignCounts: {} },
    direct: { leadsCount: 0, contactedCount: 0, quotedCount: 0, wonCount: 0, totalRevenue: 0, campaignCounts: {} },
  };

  const campaignStats: Record<
    string,
    { channelId: AttributionChannelId; leadsCount: number; wonCount: number; totalRevenue: number }
  > = {};

  let totalWonCount = 0;
  let totalRevenue = 0;
  let totalQuotedCount = 0;
  let adLeadsCount = 0;
  let adWonCount = 0;
  let adRevenue = 0;
  let adQuotedCount = 0;

  for (const lead of leads) {
    const triage = lead.triage && typeof lead.triage === 'object'
      ? (lead.triage as { attribution?: LeadAttribution | null; estimate?: { max?: number } | null })
      : null;
    const attr = triage?.attribution ?? null;
    const leadSource = (lead as { source?: string | null }).source ?? null;
    const channelId = classifyLeadChannel(attr, leadSource);
    const medium = attr?.medium?.toLowerCase().trim() || '';
    const isPaid = CHANNEL_DEFINITIONS[channelId].isPaid || Boolean(attr?.clickId || medium === 'cpc' || medium === 'paid_social' || medium === 'paid_video');

    const stats = channelStats[channelId];
    stats.leadsCount += 1;

    let leadRevenue = 0;
    let isWon = false;

    if (lead.converted_job && jobLookup[lead.converted_job]) {
      const job = jobLookup[lead.converted_job];
      isWon = Boolean(job.isWon);
      leadRevenue = isWon ? (job.total || 0) : 0;
    } else if (lead.status === 'won') {
      isWon = true;
      // Do not count estimate ceilings or speculative max estimates in closed revenue.
      // Verified ledger amount requires a converted or signed job.
      leadRevenue = 0;
    }

    const isContacted = lead.status === 'contacted' || lead.status === 'quoted' || isWon || Boolean(lead.converted_job);
    if (isContacted) stats.contactedCount += 1;

    const isQuoted = lead.status === 'quoted' || isWon || Boolean(lead.converted_job);
    if (isQuoted) {
      stats.quotedCount += 1;
      totalQuotedCount += 1;
      if (isPaid) adQuotedCount += 1;
    }

    if (isWon) {
      stats.wonCount += 1;
      stats.totalRevenue += leadRevenue;
      totalWonCount += 1;
      totalRevenue += leadRevenue;

      if (isPaid) {
        adWonCount += 1;
        adRevenue += leadRevenue;
      }
    }

    if (isPaid) {
      adLeadsCount += 1;
    }

    const campaignKey = attr?.campaign?.trim();
    if (campaignKey) {
      if (!stats.campaignCounts[campaignKey]) {
        stats.campaignCounts[campaignKey] = { count: 0, won: 0, revenue: 0 };
      }
      stats.campaignCounts[campaignKey].count += 1;
      if (isWon) {
        stats.campaignCounts[campaignKey].won += 1;
        stats.campaignCounts[campaignKey].revenue += leadRevenue;
      }

      if (!campaignStats[campaignKey]) {
        campaignStats[campaignKey] = {
          channelId,
          leadsCount: 0,
          wonCount: 0,
          totalRevenue: 0,
        };
      }
      campaignStats[campaignKey].leadsCount += 1;
      if (isWon) {
        campaignStats[campaignKey].wonCount += 1;
        campaignStats[campaignKey].totalRevenue += leadRevenue;
      }
    }
  }

  const channels: ChannelRoiSummary[] = (Object.keys(channelStats) as AttributionChannelId[])
    .map((id) => {
      const def = CHANNEL_DEFINITIONS[id];
      const data = channelStats[id];
      const winRatePct = data.leadsCount > 0 ? Math.round((data.wonCount / data.leadsCount) * 100) : 0;
      const avgTicket = data.wonCount > 0 ? Math.round(data.totalRevenue / data.wonCount) : 0;

      let topCampaign: string | null = null;
      let topCount = 0;
      for (const [cName, cStats] of Object.entries(data.campaignCounts)) {
        if (cStats.count > topCount) {
          topCount = cStats.count;
          topCampaign = cName;
        }
      }

      return {
        id,
        name: def.name,
        icon: def.icon,
        isPaid: def.isPaid,
        leadsCount: data.leadsCount,
        contactedCount: data.contactedCount,
        quotedCount: data.quotedCount,
        wonCount: data.wonCount,
        winRatePct,
        totalRevenue: data.totalRevenue,
        avgTicket,
        topCampaign,
        defaultSetupHref: def.defaultSetupHref,
      };
    })
    .filter((c) => c.leadsCount > 0 || c.isPaid); // Keep active channels or core paid channels

  const topCampaigns: CampaignBreakdown[] = Object.entries(campaignStats)
    .map(([campaign, data]) => ({
      campaign,
      channelId: data.channelId,
      channelName: CHANNEL_DEFINITIONS[data.channelId]?.name || data.channelId,
      leadsCount: data.leadsCount,
      wonCount: data.wonCount,
      winRatePct: data.leadsCount > 0 ? Math.round((data.wonCount / data.leadsCount) * 100) : 0,
      totalRevenue: data.totalRevenue,
      avgTicket: data.wonCount > 0 ? Math.round(data.totalRevenue / data.wonCount) : 0,
    }))
    .sort((a, b) => b.totalRevenue - a.totalRevenue || b.leadsCount - a.leadsCount);

  const totalLeads = leads.length;
  const overallWinRatePct = totalLeads > 0 ? Math.round((totalWonCount / totalLeads) * 100) : 0;
  const adWinRatePct = adLeadsCount > 0 ? Math.round((adWonCount / adLeadsCount) * 100) : 0;
  const overallAvgTicket = totalWonCount > 0 ? Math.round(totalRevenue / totalWonCount) : 0;
  const adAvgTicket = adWonCount > 0 ? Math.round(adRevenue / adWonCount) : 0;
  const adAttributedPct = totalLeads > 0 ? Math.round((adLeadsCount / totalLeads) * 100) : 0;

  // Ground ad spend in actual wallet spend (options.actualAdSpend).
  // If no spend is provided or spend is zero, totalAdSpend is 0.
  const totalAdSpend = options.actualAdSpend !== undefined ? Math.max(0, options.actualAdSpend) : 0;
  const estimatedRoasMultiplier = totalAdSpend > 0 ? Math.round((adRevenue / totalAdSpend) * 10) / 10 : 0;

  return {
    totalLeads,
    adAttributedLeads: adLeadsCount,
    adAttributedPct,
    totalQuotedCount,
    adQuotedCount,
    totalWonCount,
    adWonCount,
    totalRevenue,
    adAttributedRevenue: adRevenue,
    overallWinRatePct,
    adWinRatePct,
    overallAvgTicket,
    adAvgTicket,
    totalAdSpend,
    estimatedRoasMultiplier,
    channels,
    topCampaigns,
  };
}

/* ============================================================================
   CAMPAIGN LINK & QR CODE BUILDER PRESETS & HELPERS
   ============================================================================ */

export type CampaignLinkPresetId =
  | 'facebook_ad'
  | 'instagram_story'
  | 'google_search'
  | 'tiktok_ad'
  | 'nextdoor_post'
  | 'yard_sign'
  | 'truck_wrap'
  | 'door_hanger'
  | 'site_promo';

export type CampaignLinkPreset = {
  id: CampaignLinkPresetId;
  name: string;
  icon: string;
  category: 'digital' | 'offline' | 'onsite';
  description: string;
  defaultSource: string;
  defaultMedium: string;
  suggestedCampaign: string;
  defaultPlacement?: string;
};

export const CAMPAIGN_LINK_PRESETS: CampaignLinkPreset[] = [
  {
    id: 'facebook_ad',
    name: 'Facebook Feed & Video Ad',
    icon: '📘',
    category: 'digital',
    description: 'Track sponsored Facebook feed posts, video ads, or carousel ads.',
    defaultSource: 'facebook',
    defaultMedium: 'paid_social',
    suggestedCampaign: 'summer_roofing_sale',
  },
  {
    id: 'instagram_story',
    name: 'Instagram Story / Reel Ad',
    icon: '📸',
    category: 'digital',
    description: 'Track swipe-ups and bio links from Instagram Reels or Stories.',
    defaultSource: 'instagram',
    defaultMedium: 'paid_social',
    suggestedCampaign: 'emergency_plumbing_special',
  },
  {
    id: 'google_search',
    name: 'Google Search & Local Ad',
    icon: '🔍',
    category: 'digital',
    description: 'Track Google search campaigns, keyword ads, and Local Services.',
    defaultSource: 'google',
    defaultMedium: 'cpc',
    suggestedCampaign: 'drain_cleaning_austin',
  },
  {
    id: 'tiktok_ad',
    name: 'TikTok Video Ad',
    icon: '🎵',
    category: 'digital',
    description: 'Track video ad conversions and bio links on TikTok Ads Manager.',
    defaultSource: 'tiktok',
    defaultMedium: 'paid_video',
    suggestedCampaign: 'ac_tuneup_promo',
  },
  {
    id: 'nextdoor_post',
    name: 'Nextdoor Recommendation',
    icon: '🏡',
    category: 'digital',
    description: 'Track neighbor recommendations and sponsored neighborhood posts.',
    defaultSource: 'nextdoor',
    defaultMedium: 'referral',
    suggestedCampaign: 'neighborhood_special',
  },
  {
    id: 'yard_sign',
    name: 'Yard Sign (Print QR Code)',
    icon: '🪧',
    category: 'offline',
    description: 'Generate high-resolution printable QR codes for lawn signs at job sites.',
    defaultSource: 'yard_sign',
    defaultMedium: 'print_qr',
    suggestedCampaign: 'jobsite_neighborhood_qr',
  },
  {
    id: 'truck_wrap',
    name: 'Truck Decal & Van Wrap QR',
    icon: '🚚',
    category: 'offline',
    description: 'QR codes for fleet vehicles, truck wraps, and tailgate magnets.',
    defaultSource: 'truck_wrap',
    defaultMedium: 'print_qr',
    suggestedCampaign: 'fleet_tailgate_qr',
  },
  {
    id: 'door_hanger',
    name: 'Door Hanger & Flyer (QR)',
    icon: '🚪',
    category: 'offline',
    description: 'Printed door hangers left at 5-around neighboring houses.',
    defaultSource: 'door_hanger',
    defaultMedium: 'print_qr',
    suggestedCampaign: 'neighbor_door_hanger_qr',
  },
  {
    id: 'site_promo',
    name: 'Website Header Promo Banner',
    icon: '🏷️',
    category: 'onsite',
    description: 'Track clicks on seasonal announcements or discount headers.',
    defaultSource: 'website',
    defaultMedium: 'onsite',
    suggestedCampaign: 'fall_furnace_check_10off',
  },
];

export type BuildCampaignUrlOptions = {
  baseUrl: string;
  source?: string;
  medium?: string;
  campaign?: string;
  content?: string;
  term?: string;
  promo?: string;
};

/**
 * Normalizes a campaign name into a clean, lowercased, URL-safe slug.
 * e.g. "Spring Yard Signs 2026" -> "spring_yard_signs_2026"
 */
export function slugifyCampaign(name: string): string {
  if (!name) return '';
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^[_-]+|[_-]+$/g, '');
}

/**
 * Validates whether an input string is a valid HTTP/HTTPS URL with a hostname.
 */
export function isValidHttpUrl(str: string): boolean {
  if (!str || typeof str !== 'string') return false;
  const trimmed = str.trim();
  if (!trimmed) return false;
  if (/^(javascript|data|vbscript|file):/i.test(trimmed)) return false;
  let candidate = trimmed;
  if (!/^https?:\/\//i.test(candidate)) {
    candidate = `https://${candidate}`;
  }
  try {
    const parsed = new URL(candidate);
    return Boolean(
      (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
      parsed.hostname &&
      parsed.hostname.includes('.') &&
      !/\s/.test(parsed.hostname)
    );
  } catch {
    return false;
  }
}

/**
 * Builds a clean, correctly encoded marketing URL with UTM parameters or promo tag.
 * Returns empty string if base URL is invalid or malformed.
 */
export function buildCampaignUrl(options: BuildCampaignUrlOptions): string {
  const rawBase = (options.baseUrl || '').trim();
  if (!rawBase || /^(javascript|data|vbscript|file):/i.test(rawBase)) return '';

  let urlStr = rawBase;
  if (!/^https?:\/\//i.test(urlStr)) {
    urlStr = `https://${urlStr}`;
  }

  try {
    const url = new URL(urlStr);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return '';
    }

    if (options.source?.trim()) url.searchParams.set('utm_source', options.source.trim());
    if (options.medium?.trim()) url.searchParams.set('utm_medium', options.medium.trim());
    if (options.campaign?.trim()) {
      const normalized = slugifyCampaign(options.campaign) || options.campaign.trim();
      url.searchParams.set('utm_campaign', normalized);
    }
    if (options.content?.trim()) url.searchParams.set('utm_content', options.content.trim());
    if (options.term?.trim()) url.searchParams.set('utm_term', options.term.trim());
    if (options.promo?.trim()) url.searchParams.set('promo', options.promo.trim());

    return url.toString();
  } catch {
    return '';
  }
}

/**
 * Generates an SVG QR code for any campaign URL using our lightweight crisp-matrix generator.
 */
export function buildCampaignQrSvg(url: string, size = 200, title?: string): string {
  return generateQrSvg(url, size, { title: title || 'Campaign QR Code' });
}

/**
 * Loads lightweight attribution leads and jobs with pagination to avoid silent truncation under PostgREST max-rows.
 */
export async function loadMarketingAttributionData(
  supabase: SupabaseClient,
  accountId: string,
  options: {
    startDateIso?: string;
    endDateIso?: string;
    testOptions?: TestRecordOptions;
  } = {}
): Promise<{
  leads: MarketingAttributionLead[];
  jobs: MarketingAttributionJob[];
}> {
  let leadsQuery = applyTestRecordFilter(
    supabase
      .from('leads')
      .select('id, source, status, triage, converted_job, created_at')
      .eq('account_id', accountId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
    options.testOptions
  );

  let jobsQuery = applyTestRecordFilter(
    supabase
      .from('jobs')
      .select('id, status, quoted_amount, created_at')
      .eq('account_id', accountId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
    options.testOptions
  );

  if (options.startDateIso) {
    leadsQuery = leadsQuery.gte('created_at', options.startDateIso);
    jobsQuery = jobsQuery.gte('created_at', options.startDateIso);
  }
  if (options.endDateIso) {
    leadsQuery = leadsQuery.lte('created_at', options.endDateIso);
    jobsQuery = jobsQuery.lte('created_at', options.endDateIso);
  }

  const [leads, jobs] = await Promise.all([
    fetchAllPages<MarketingAttributionLead>((from, to) => leadsQuery.range(from, to)),
    fetchAllPages<MarketingAttributionJob>((from, to) => jobsQuery.range(from, to)),
  ]);

  return { leads, jobs };
}

export type CampaignMetrics = {
  visits: number;
  leads: number;
  wonJobs: number;
  revenue: number;
  adSpend: number;
  roas: number;
};

export type TargetCampaignInfo = {
  id: string;
  name: string;
  campaign: string;
  shortCode?: string;
  content?: string;
  scanCount?: number;
  adSpend?: number;
};

/**
 * Aggregates lead attribution and won job outcomes for individual tracking campaigns.
 */
export function aggregateCampaignAttribution(
  campaigns: TargetCampaignInfo[],
  leads: MarketingAttributionLead[],
  jobLookup: JobFinancialLookup
): Record<string, CampaignMetrics> {
  const result: Record<string, CampaignMetrics> = {};

  for (const camp of campaigns) {
    result[camp.id] = {
      visits: camp.scanCount || 0,
      leads: 0,
      wonJobs: 0,
      revenue: 0,
      adSpend: camp.adSpend || 0,
      roas: 0,
    };
  }

  const campLookup = campaigns.map((c) => ({
    id: c.id,
    slug: slugifyCampaign(c.campaign),
    nameSlug: slugifyCampaign(c.name),
    shortCode: (c.shortCode || '').toLowerCase().trim(),
    content: (c.content || '').toLowerCase().trim(),
  }));

  for (const lead of leads) {
    const triage = lead.triage && typeof lead.triage === 'object'
      ? (lead.triage as { attribution?: LeadAttribution | null; estimate?: { max?: number } | null })
      : null;
    const attr = triage?.attribution;
    if (!attr) continue;

    const leadCampSlug = slugifyCampaign(attr.campaign || '');
    const leadContent = (attr.content || '').toLowerCase().trim();
    const leadLanding = (attr.landingPage || '').toLowerCase();

    const matched = campLookup.find((c) => {
      if (c.slug && leadCampSlug && (c.slug === leadCampSlug || leadCampSlug.includes(c.slug))) return true;
      if (c.nameSlug && leadCampSlug && (c.nameSlug === leadCampSlug || leadCampSlug.includes(c.nameSlug))) return true;
      if (c.shortCode && leadLanding.includes(`/r/${c.shortCode}`)) return true;
      if (c.content && leadContent && c.content === leadContent) return true;
      return false;
    });

    if (matched) {
      const stats = result[matched.id];
      if (!stats) continue;

      stats.leads += 1;

      let leadRevenue = 0;
      let isWon = false;

      if (lead.converted_job && jobLookup[lead.converted_job]) {
        const job = jobLookup[lead.converted_job];
        isWon = Boolean(job.isWon);
        leadRevenue = isWon ? (job.total || 0) : 0;
      } else if (lead.status === 'won') {
        isWon = true;
        leadRevenue = triage?.estimate?.max || 0;
      }

      if (isWon) {
        stats.wonJobs += 1;
        stats.revenue += leadRevenue;
      }
    }
  }

  for (const id of Object.keys(result)) {
    const m = result[id];
    m.roas = m.adSpend > 0 ? Number((m.revenue / m.adSpend).toFixed(1)) : 0;
  }

  return result;
}


