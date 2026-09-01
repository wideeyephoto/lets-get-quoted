import type { Lead, LeadAttribution } from '@/lib/leads';
import { generateQrSvg } from '@/lib/equipment-qr';

export type AttributionChannelId =
  | 'google'
  | 'meta'
  | 'tiktok'
  | 'local'
  | 'print_qr'
  | 'promo'
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
  totalRevenue: number;
  adAttributedRevenue: number;
  overallWinRatePct: number;
  adWinRatePct: number;
  overallAvgTicket: number;
  totalAdSpend: number;
  estimatedRoasMultiplier: number;
  channels: ChannelRoiSummary[];
  topCampaigns: CampaignBreakdown[];
};

export type JobFinancialLookup = Record<string, { total: number; isWon: boolean }>;

export const CHANNEL_DEFINITIONS: Record<
  AttributionChannelId,
  { name: string; icon: string; isPaid: boolean }
> = {
  google: { name: 'Google Ads & Search', icon: '🎯', isPaid: true },
  meta: { name: 'Meta (Facebook & Instagram)', icon: '📱', isPaid: true },
  tiktok: { name: 'TikTok Ads', icon: '🎵', isPaid: true },
  local: { name: 'Local & Referrals (Nextdoor/Yelp)', icon: '🏡', isPaid: false },
  print_qr: { name: 'Print & Offline QR Collateral', icon: '🪧', isPaid: false },
  promo: { name: 'Intra-Site Promos & Offers', icon: '🏷️', isPaid: false },
  direct: { name: 'Direct & Organic Website', icon: '🌐', isPaid: false },
};

/**
 * Categorize a lead into a standardized acquisition channel based on its attribution metadata.
 */
export function classifyLeadChannel(attr?: LeadAttribution | null): AttributionChannelId {
  if (!attr) return 'direct';

  const source = (attr.source || '').toLowerCase();
  const medium = (attr.medium || '').toLowerCase();
  const clickIdType = (attr.clickIdType || '').toLowerCase();

  if (clickIdType === 'gclid' || source === 'google' || source === 'adwords' || source === 'google_ads') {
    return 'google';
  }
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
  if (clickIdType === 'ttclid' || source === 'tiktok' || medium.includes('tiktok')) {
    return 'tiktok';
  }
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
  if (attr.campaign && (medium === 'onsite' || medium === 'promo' || !attr.source)) {
    return 'promo';
  }

  if (Boolean(attr.clickId) || medium === 'cpc' || medium === 'paid_social' || medium === 'paid_video') {
    return 'meta'; // Default paid to meta if unclassified
  }

  if (attr.source || attr.referrer) {
    return 'local';
  }

  return 'direct';
}

/**
 * Calculates closed-loop campaign ROI and conversion performance across all leads and jobs.
 */
export function calculateCampaignRoi(
  leads: Lead[],
  jobLookup: JobFinancialLookup = {}
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
    promo: { leadsCount: 0, contactedCount: 0, quotedCount: 0, wonCount: 0, totalRevenue: 0, campaignCounts: {} },
    direct: { leadsCount: 0, contactedCount: 0, quotedCount: 0, wonCount: 0, totalRevenue: 0, campaignCounts: {} },
  };

  const campaignStats: Record<
    string,
    { channelId: AttributionChannelId; leadsCount: number; wonCount: number; totalRevenue: number }
  > = {};

  let totalWonCount = 0;
  let totalRevenue = 0;
  let adLeadsCount = 0;
  let adWonCount = 0;
  let adRevenue = 0;

  for (const lead of leads) {
    const triage = lead.triage && typeof lead.triage === 'object' ? lead.triage : null;
    const attr = triage?.attribution ?? null;
    const channelId = classifyLeadChannel(attr);
    const medium = attr?.medium?.toLowerCase().trim() || '';
    const isPaid = CHANNEL_DEFINITIONS[channelId].isPaid || Boolean(attr?.clickId || medium === 'cpc' || medium === 'paid_social' || medium === 'paid_video');

    const stats = channelStats[channelId];
    stats.leadsCount += 1;

    if (lead.status === 'contacted') stats.contactedCount += 1;
    if (lead.status === 'quoted') stats.quotedCount += 1;

    let leadRevenue = 0;
    let isWon = lead.status === 'won';

    if (lead.converted_job && jobLookup[lead.converted_job]) {
      const job = jobLookup[lead.converted_job];
      leadRevenue = job.total || 0;
      if (job.isWon) isWon = true;
    } else if (isWon && triage?.estimate?.max) {
      leadRevenue = triage.estimate.max;
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
  const adAttributedPct = totalLeads > 0 ? Math.round((adLeadsCount / totalLeads) * 100) : 0;

  // Estimated ad spend benchmark ($42/lead industry average across search/social)
  const totalAdSpend = adLeadsCount * 42;
  const estimatedRoasMultiplier = totalAdSpend > 0 ? Math.round((adRevenue / totalAdSpend) * 10) / 10 : 0;

  return {
    totalLeads,
    adAttributedLeads: adLeadsCount,
    adAttributedPct,
    totalRevenue,
    adAttributedRevenue: adRevenue,
    overallWinRatePct,
    adWinRatePct,
    overallAvgTicket,
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
 * Builds a clean, correctly encoded marketing URL with UTM parameters or promo tag.
 */
export function buildCampaignUrl(options: BuildCampaignUrlOptions): string {
  const rawBase = (options.baseUrl || '').trim();
  if (!rawBase) return '';

  let urlStr = rawBase;
  if (!/^https?:\/\//i.test(urlStr)) {
    urlStr = `https://${urlStr}`;
  }

  try {
    const url = new URL(urlStr);

    if (options.source?.trim()) url.searchParams.set('utm_source', options.source.trim());
    if (options.medium?.trim()) url.searchParams.set('utm_medium', options.medium.trim());
    if (options.campaign?.trim()) url.searchParams.set('utm_campaign', options.campaign.trim());
    if (options.content?.trim()) url.searchParams.set('utm_content', options.content.trim());
    if (options.term?.trim()) url.searchParams.set('utm_term', options.term.trim());
    if (options.promo?.trim()) url.searchParams.set('promo', options.promo.trim());

    return url.toString();
  } catch {
    return rawBase;
  }
}

/**
 * Generates an SVG QR code for any campaign URL using our lightweight crisp-matrix generator.
 */
export function buildCampaignQrSvg(url: string, size = 200): string {
  return generateQrSvg(url, size);
}
