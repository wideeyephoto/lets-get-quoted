import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/auth';
import {
  qualifyJobForNeighborhoodHalo,
  extractStreetAndNeighborhood,
  calculateHaloGeofence,
  findOverlappingHaloCampaigns,
  type HaloJobInput,
  type HaloQualificationResult,
  type NeighborhoodHaloCampaign,
  type HaloAdCopyPackage,
} from './neighborhood-halo';
import { buildHaloCreativeBundle, type HaloAdCreativeBundle } from './neighborhood-halo-ai';
import { createJobPhotoLinks } from './job-photo-storage';
import { isMetaAdsConfigured, provisionManagedMetaCampaign, pauseMetaCampaign, activateMetaCampaign, fetchMetaCampaignDailySpend } from './meta-ads-api';
import { stateFromAddress } from './marketing-calendar';
import { getSiteContent } from './site-content';

export type HaloCampaignStatus =
  | 'draft'
  | 'pending_provisioning'
  | 'active'
  | 'paused'
  | 'completed'
  | 'killed'
  | 'simulated_sandbox'
  | 'failed';

export type HaloCampaignRecord = {
  id: string;
  accountId: string;
  jobId?: string | null;
  status: HaloCampaignStatus;
  settlementRequestedAt?: string | null;
  settlementStatus?: 'failed' | 'completed' | 'killed' | null;
  streetName: string;
  neighborhoodName?: string | null;
  city: string;
  state?: string | null;
  zip?: string | null;
  centerLat?: number | null;
  centerLng?: number | null;
  radiusMiles: number;
  budgetDollars: number;
  spendDollars: number;
  walletDeductedCents: number;
  dailyBudgetDollars: number;
  durationDays: number;
  daysActive: number;
  impressions: number;
  clicks: number;
  leadsGenerated: number;
  adCopy: HaloAdCopyPackage;
  beforePhotoUrl?: string | null;
  afterPhotoUrl?: string | null;
  googleCampaignId?: string | null;
  googleCampaignResource?: string | null;
  metaCampaignId?: string | null;
  metaAdSetId?: string | null;
  metaAdId?: string | null;
  landingPageUrl: string;
  autoKilledAt?: string | null;
  autoKillReason?: string | null;
  expiresAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type HaloSettingsRecord = {
  accountId: string;
  autoLaunchEnabled: boolean;
  defaultRadiusMiles: number;
  perJobBudgetDollars: number;
  monthlySpendCapDollars: number;
  requirePhotos: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export const DEFAULT_HALO_SETTINGS: Omit<HaloSettingsRecord, 'accountId'> = {
  autoLaunchEnabled: false,
  defaultRadiusMiles: 1.0,
  perJobBudgetDollars: 25.0,
  monthlySpendCapDollars: 250.0,
  requirePhotos: true,
};

function mapRowToCampaign(row: Record<string, unknown>): HaloCampaignRecord {
  return {
    settlementRequestedAt: row.settlement_requested_at ? String(row.settlement_requested_at) : null,
    settlementStatus: row.settlement_status as HaloCampaignRecord['settlementStatus'],
    id: String(row.id),
    accountId: String(row.account_id),
    jobId: row.job_id ? String(row.job_id) : null,
    status: (row.status as HaloCampaignStatus) || 'draft',
    streetName: String(row.street_name || ''),
    neighborhoodName: row.neighborhood_name ? String(row.neighborhood_name) : null,
    city: String(row.city || ''),
    state: row.state ? String(row.state) : null,
    zip: row.zip ? String(row.zip) : null,
    centerLat: row.center_lat !== null && row.center_lat !== undefined ? Number(row.center_lat) : null,
    centerLng: row.center_lng !== null && row.center_lng !== undefined ? Number(row.center_lng) : null,
    radiusMiles: Number(row.radius_miles ?? 1.0),
    budgetDollars: Number(row.budget_dollars ?? 25.0),
    spendDollars: Number(row.spend_dollars ?? 0.0),
    walletDeductedCents: Number(row.wallet_deducted_cents ?? 0),
    dailyBudgetDollars: Number(row.daily_budget_dollars ?? 5.0),
    durationDays: Number(row.duration_days ?? 5),
    daysActive: Number(row.days_active ?? 0),
    impressions: Number(row.impressions ?? 0),
    clicks: Number(row.clicks ?? 0),
    leadsGenerated: Number(row.leads_generated ?? 0),
    adCopy: (row.ad_copy as HaloAdCopyPackage) || ({} as HaloAdCopyPackage),
    beforePhotoUrl: row.before_photo_url ? String(row.before_photo_url) : null,
    afterPhotoUrl: row.after_photo_url ? String(row.after_photo_url) : null,
    googleCampaignId: row.google_campaign_id ? String(row.google_campaign_id) : null,
    googleCampaignResource: row.google_campaign_resource ? String(row.google_campaign_resource) : null,
    metaCampaignId: row.meta_campaign_id ? String(row.meta_campaign_id) : null,
    metaAdSetId: row.meta_ad_set_id ? String(row.meta_ad_set_id) : null,
    metaAdId: row.meta_ad_id ? String(row.meta_ad_id) : null,
    landingPageUrl: String(row.landing_page_url || ''),
    autoKilledAt: row.auto_killed_at ? String(row.auto_killed_at) : null,
    autoKillReason: row.auto_kill_reason ? String(row.auto_kill_reason) : null,
    expiresAt: row.expires_at ? String(row.expires_at) : null,
    createdAt: String(row.created_at || new Date().toISOString()),
    updatedAt: String(row.updated_at || new Date().toISOString()),
  };
}

export async function getHaloSettings(
  supabase: SupabaseClient,
  accountId: string
): Promise<HaloSettingsRecord> {
  const { data, error } = await supabase
    .from('neighborhood_halo_settings')
    .select('*')
    .eq('account_id', accountId)
    .maybeSingle();

  if (error) {
    console.warn(`Error reading neighborhood_halo_settings for ${accountId}:`, error.message);
  }

  if (!data) {
    return {
      accountId,
      ...DEFAULT_HALO_SETTINGS,
    };
  }

  return {
    accountId: data.account_id,
    autoLaunchEnabled: Boolean(data.auto_launch_enabled),
    defaultRadiusMiles: Number(data.default_radius_miles ?? DEFAULT_HALO_SETTINGS.defaultRadiusMiles),
    perJobBudgetDollars: Number(data.per_job_budget_dollars ?? DEFAULT_HALO_SETTINGS.perJobBudgetDollars),
    monthlySpendCapDollars: Number(data.monthly_spend_cap_dollars ?? DEFAULT_HALO_SETTINGS.monthlySpendCapDollars),
    requirePhotos: Boolean(data.require_photos ?? DEFAULT_HALO_SETTINGS.requirePhotos),
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

export async function updateHaloSettings(
  supabase: SupabaseClient,
  accountId: string,
  partial: Partial<HaloSettingsRecord>
): Promise<HaloSettingsRecord> {
  const nowIso = new Date().toISOString();
  const payload = {
    account_id: accountId,
    auto_launch_enabled: partial.autoLaunchEnabled ?? DEFAULT_HALO_SETTINGS.autoLaunchEnabled,
    default_radius_miles: partial.defaultRadiusMiles ?? DEFAULT_HALO_SETTINGS.defaultRadiusMiles,
    per_job_budget_dollars: partial.perJobBudgetDollars ?? DEFAULT_HALO_SETTINGS.perJobBudgetDollars,
    monthly_spend_cap_dollars: partial.monthlySpendCapDollars ?? DEFAULT_HALO_SETTINGS.monthlySpendCapDollars,
    require_photos: partial.requirePhotos ?? DEFAULT_HALO_SETTINGS.requirePhotos,
    updated_at: nowIso,
  };

  const { error } = await supabase
    .from('neighborhood_halo_settings')
    .upsert(payload, { onConflict: 'account_id' });

  if (error) {
    throw new Error(`Failed to update neighborhood halo settings: ${error.message}`);
  }

  return getHaloSettings(supabase, accountId);
}

export async function listHaloCampaigns(
  supabase: SupabaseClient,
  accountId: string,
  limit = 50
): Promise<HaloCampaignRecord[]> {
  const { data, error } = await supabase
    .from('neighborhood_halo_campaigns')
    .select('*')
    .eq('account_id', accountId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Failed to list neighborhood halo campaigns:', error);
    return [];
  }

  return (data || []).map(mapRowToCampaign);
}

export async function getHaloCampaignById(
  supabase: SupabaseClient,
  campaignId: string
): Promise<HaloCampaignRecord | null> {
  const { data, error } = await supabase
    .from('neighborhood_halo_campaigns')
    .select('*')
    .eq('id', campaignId)
    .is('deleted_at', null)
    .maybeSingle();

  if (error || !data) return null;
  return mapRowToCampaign(data);
}

export async function getMonthHaloSpendDollars(
  supabase: SupabaseClient,
  accountId: string
): Promise<number> {
  const now = new Date();
  const firstOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();

  const { data, error } = await supabase
    .from('neighborhood_halo_campaigns')
    .select('budget_dollars,wallet_deducted_cents,wallet_refunded_cents')
    .eq('account_id', accountId)
    .is('deleted_at', null)
    .gte('created_at', firstOfMonth);

  if (error || !data) throw new Error('Could not verify monthly Halo reservations.');
  return data.reduce((sum, row) => sum + (Number(row.wallet_deducted_cents ?? Number(row.budget_dollars || 0)*100)-Number(row.wallet_refunded_cents || 0))/100, 0);
}

export async function qualifyAndPreviewJob(
  supabase: SupabaseClient,
  accountId: string,
  jobId: string
): Promise<{
  qualification: HaloQualificationResult;
  creative?: HaloAdCreativeBundle;
  jobRef: string;
  sanitizedAddress: string;
  photoUrls: string[];
  suggestedBudget: number;
}> {
  const { data: job, error: jobError } = await supabase
    .from('jobs')
    .select('*')
    .eq('account_id', accountId)
    .eq('id', jobId)
    .maybeSingle();

  if (jobError || !job) {
    throw new Error('Job not found.');
  }

  const [{ data: account }, { data: site }] = await Promise.all([
    supabase.from('accounts').select('business_name, phone').eq('id', accountId).maybeSingle(),
    supabase.from('sites').select('subdomain, custom_domain, company_name, content').eq('account_id', accountId).maybeSingle(),
  ]);

  const photoLinks = await createJobPhotoLinks(accountId, job.photo_paths || []);
  const photoUrls = photoLinks.map((p) => p.url);

  const addressRaw = job.address || '';
  const state = stateFromAddress(addressRaw) || '';
  const city = addressRaw ? addressRaw.split(',')[0]?.trim() : 'Local Area';

  const extracted = extractStreetAndNeighborhood(addressRaw);

  const haloInput: HaloJobInput = {
    id: job.id,
    status: job.status === 'complete' ? 'completed' : String(job.status || ''),
    address: addressRaw,
    latitude: job.lat ? Number(job.lat) : null,
    longitude: job.lng ? Number(job.lng) : null,
    scopeSummary: job.scope || null,
    photoUrls,
    beforePhotoUrl: photoUrls[1] || null,
    afterPhotoUrl: photoUrls[0] || null,
    allowMarketingShowcase: true,
  };

  const qualification = qualifyJobForNeighborhoodHalo(haloInput);

  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'letsgetquoted.com';
  let domain = rootDomain;
  if (site?.custom_domain) {
    domain = site.custom_domain;
  } else if (site?.subdomain) {
    domain = `${site.subdomain}.${rootDomain}`;
  }

  const creative = buildHaloCreativeBundle({
    trade: job.trade || getSiteContent(site?.content).trade || 'Contracting',
    businessName: (site?.company_name as string | undefined) || account?.business_name || 'Our Team',
    streetName: extracted.streetName || city,
    neighborhoodName: extracted.neighborhoodName || '',
    city,
    state,
    scopeSummary: job.scope || undefined,
    beforePhotoUrl: photoUrls[1] || photoUrls[0],
    afterPhotoUrl: photoUrls[0],
    customIncentive: '$250 Off Neighbor Group Rate',
  });

  return {
    qualification,
    creative,
    jobRef: job.ref || 'Job',
    sanitizedAddress: extracted.sanitizedAddress || city,
    photoUrls,
    suggestedBudget: 25.0,
  };
}

export async function launchHaloCampaign(
  supabase: SupabaseClient,
  accountId: string,
  jobId: string,
  overrides?: {
    radiusMiles?: number;
    budgetDollars?: number;
    durationDays?: number;
  }
): Promise<HaloCampaignRecord> {
  const admin = createAdminClient();

  const settings = await getHaloSettings(supabase, accountId);
  const currentMonthSpend = await getMonthHaloSpendDollars(supabase, accountId);

  const budget = overrides?.budgetDollars ?? settings.perJobBudgetDollars;
  const radius = overrides?.radiusMiles ?? settings.defaultRadiusMiles;
  const duration = overrides?.durationDays ?? 5;
  if (!Number.isFinite(budget) || budget < 1 || budget > 1000 || !Number.isFinite(radius) || radius < 1 || radius > 25 || !Number.isInteger(duration) || duration < 1 || duration > 30) throw new Error('Invalid Halo budget, radius, or duration.');

  if (currentMonthSpend + budget > settings.monthlySpendCapDollars) {
    throw new Error(
      `Monthly Neighborhood Halo budget cap ($${settings.monthlySpendCapDollars}) would be exceeded. Current spend: $${currentMonthSpend}.`
    );
  }

  const { data: job, error: jobErr } = await supabase
    .from('jobs')
    .select('*')
    .eq('account_id', accountId)
    .eq('id', jobId)
    .maybeSingle();

  if (jobErr || !job) {
    throw new Error('Job not found.');
  }

  if (job.status !== 'complete') {
    throw new Error('Job must be marked completed before launching a Neighborhood Halo campaign.');
  }

  const photoLinks = await createJobPhotoLinks(accountId, job.photo_paths || []);
  const photoUrls = photoLinks.map((p) => p.url);

  if (settings.requirePhotos && photoUrls.length === 0) {
    throw new Error('Neighborhood Halo requires at least one site photo of the completed craftsmanship.');
  }

  const addressRaw = job.address || '';
  const state = stateFromAddress(addressRaw) || '';
  const city = addressRaw ? addressRaw.split(',')[0]?.trim() : 'Local Area';
  const extracted = extractStreetAndNeighborhood(addressRaw);

  const lat = job.lat == null ? NaN : Number(job.lat);
  const lng = job.lng == null ? NaN : Number(job.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw new Error('Verified job coordinates are required for local advertising.');

  // Check spatial deduplication against existing active campaigns
  const existingCampaigns = await listHaloCampaigns(supabase, accountId, 50);
  const activeHaloCampaigns: NeighborhoodHaloCampaign[] = existingCampaigns
    .filter((c) => c.status === 'active' && c.centerLat && c.centerLng)
    .map((c) => ({
      id: c.id,
      accountId: c.accountId,
      jobId: c.jobId || '',
      rawAddress: '',
      sanitizedAddress: c.streetName,
      streetName: c.streetName,
      neighborhoodName: c.neighborhoodName || '',
      city: c.city,
      state: c.state || '',
      zip: c.zip || '',
      geofence: calculateHaloGeofence(c.centerLat!, c.centerLng!, c.radiusMiles),
      budgetDollars: c.budgetDollars,
      durationDays: c.durationDays,
      status: 'active',
      adCopy: c.adCopy,
      targetLandingUrl: c.landingPageUrl,
      metrics: {
        impressions: c.impressions,
        clicks: c.clicks,
        leads: c.leadsGenerated,
        spendDollars: c.spendDollars,
      },
      createdAt: c.createdAt,
      expiresAt: c.expiresAt || '',
    }));

  const overlapping = findOverlappingHaloCampaigns(lat, lng, activeHaloCampaigns, radius * 0.75);
  if (overlapping.length > 0) {
    throw new Error(
      `An active Neighborhood Halo campaign already covers this 1-mile zone (${overlapping.map((o) => o.id).join(', ')}). Duplicate ad spend prevented.`
    );
  }

  if (!isMetaAdsConfigured()) {
    throw new Error('Meta Ads API is not configured. Neighborhood Halo requires active Meta Ads credentials.');
  }

  const spendCents = Math.round(budget * 100);
  // Generate creative bundle
  const [{ data: account }, { data: site }] = await Promise.all([
    supabase.from('accounts').select('business_name, phone').eq('id', accountId).maybeSingle(),
    supabase.from('sites').select('subdomain, custom_domain, company_name, content').eq('account_id', accountId).maybeSingle(),
  ]);

  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'letsgetquoted.com';
  let domain = rootDomain;
  if (site?.custom_domain) {
    domain = site.custom_domain;
  } else if (site?.subdomain) {
    domain = `${site.subdomain}.${rootDomain}`;
  }

  const haloCampaignId = crypto.randomUUID();
  const landingUrl = `https://${domain}/claim/halo/${haloCampaignId}`;

  const creative = buildHaloCreativeBundle({
    trade: job.trade || getSiteContent(site?.content).trade || 'Contracting',
    businessName: (site?.company_name as string | undefined) || account?.business_name || 'Our Team',
    streetName: extracted.streetName || city,
    neighborhoodName: extracted.neighborhoodName || '',
    city,
    state,
    scopeSummary: job.scope || undefined,
    beforePhotoUrl: photoUrls[1] || photoUrls[0],
    afterPhotoUrl: photoUrls[0],
    customIncentive: '$250 Off Neighbor Group Rate',
  });

  const status: HaloCampaignStatus = 'pending_provisioning';
  const expiresAt = new Date(Date.now() + duration * 86400000).toISOString();
  const nowIso = new Date().toISOString();

  const insertPayload = {
    id: haloCampaignId,
    account_id: accountId,
    job_id: jobId,
    status,
    street_name: extracted.streetName || city,
    neighborhood_name: extracted.neighborhoodName || null,
    city,
    state,
    zip: '',
    center_lat: lat,
    center_lng: lng,
    radius_miles: radius,
    budget_dollars: budget,
    spend_dollars: 0.0,
    wallet_deducted_cents: spendCents,
    daily_budget_dollars: budget / duration,
    duration_days: duration,
    days_active: 0,
    impressions: 0,
    clicks: 0,
    leads_generated: 0,
    ad_copy: creative.copy as never,
    before_photo_url: photoUrls[1] || null,
    after_photo_url: photoUrls[0] || null,
    google_campaign_id: null,
    google_campaign_resource: null,
    meta_campaign_id: null,
    landing_page_url: landingUrl,
    expires_at: expiresAt,
    created_at: nowIso,
    updated_at: nowIso,
  };

  const reserved = await admin.rpc('reserve_halo_campaign', { p_account_id: accountId, p_job_id: jobId, p_campaign_id: haloCampaignId, p_details: insertPayload });
  if (reserved.error || !reserved.data?.id) throw new Error(reserved.error?.message || 'Could not reserve Halo budget.');
  const deliveryLease = crypto.randomUUID();
  const claimed = await admin.rpc('claim_halo_delivery', { p_account_id: accountId, p_campaign_id: haloCampaignId, p_lease: deliveryLease });
  if (claimed.error || claimed.data !== true) throw new Error('Halo launch is already being processed.');
  let activationAttempted = false;
  let provisioned: Awaited<ReturnType<typeof provisionManagedMetaCampaign>> | undefined;
  try {
    provisioned = await provisionManagedMetaCampaign({ accountId, businessName: account?.business_name || 'Our Team',
      trade: job.trade || getSiteContent(site?.content).trade || 'Contracting', city, radiusMiles: radius,
      latitude: lat, longitude: lng, monthlyBudgetDollars: budget * 30.4 / duration, lifetimeBudgetDollars: budget,
      durationDays: duration, endTime: expiresAt, landingPageUrl: landingUrl, startPaused: true,
      imageUrl: photoUrls[0], headline: creative.copy.headline, primaryText: creative.copy.primaryText });
    if (provisioned.campaignId) {
      const partial = await admin.from('neighborhood_halo_campaigns').update({ meta_campaign_id: provisioned.campaignId }).eq('id', haloCampaignId).eq('account_id', accountId);
      if (partial.error) throw new Error('Could not persist provider recovery reference.');
    }
    if (!provisioned.success || provisioned.status !== 'paused' || !provisioned.campaignId || !provisioned.adSetId || !provisioned.adId) throw new Error(provisioned.message || 'Meta did not create all paused resources.');
    const saved = await admin.from('neighborhood_halo_campaigns').update({ meta_campaign_id: provisioned.campaignId,
      meta_ad_set_id: provisioned.adSetId, meta_ad_id: provisioned.adId, updated_at: new Date().toISOString() }).eq('id', haloCampaignId).eq('account_id', accountId).select('id').single();
    if (saved.error || !saved.data) throw new Error('Could not persist Meta campaign resources.');
    activationAttempted = true;
    const activated = await activateMetaCampaign(provisioned);
    if (!activated.success) throw new Error(activated.message);
    const active = await admin.from('neighborhood_halo_campaigns').update({ status: 'active', updated_at: new Date().toISOString() }).eq('id', haloCampaignId).eq('account_id', accountId).select().single();
    if (active.error || !active.data) throw new Error('Could not record campaign activation.');
    return mapRowToCampaign(active.data);
  } catch (error) {
    // Nothing can spend before activation; ambiguous activation retains its reservation.
    if (activationAttempted) {
      await killHaloCampaignUnlocked(admin, accountId, haloCampaignId, 'launch_failed');
    } else {
      if (provisioned?.campaignId) {
        const stopped = await pauseMetaCampaign(provisioned.campaignId);
        if (!stopped.success) throw new Error(`Halo launch needs recovery: ${stopped.message}`);
      }
      await settleHaloCampaign(admin, accountId, haloCampaignId, 0, 'failed', 'launch_failed_before_activation');
    }
    throw error;
  } finally {
    const released = await admin.rpc('release_halo_delivery', { p_account_id: accountId, p_campaign_id: haloCampaignId, p_lease: deliveryLease });
    if (released.error) console.error('Halo delivery lease awaits expiry:', released.error);
  }
}

export async function settleHaloCampaign(admin: SupabaseClient, accountId: string, campaignId: string, spendCents: number, status: 'failed' | 'completed' | 'killed', reason: string) {
  const result = await admin.rpc('settle_halo_campaign', { p_account_id: accountId, p_campaign_id: campaignId, p_spend_cents: spendCents, p_status: status, p_reason: reason });
  if (result.error || !result.data?.id) throw new Error(result.error?.message || 'Halo settlement could not be saved.');
  return mapRowToCampaign(result.data);
}

async function pauseHaloCampaignUnlocked(
  supabase: SupabaseClient,
  accountId: string,
  campaignId: string
): Promise<HaloCampaignRecord> {
  const campaign = await getHaloCampaignById(supabase, campaignId);
  if (!campaign || campaign.accountId !== accountId) {
    throw new Error('Campaign not found.');
  }

  if (!['active', 'paused'].includes(campaign.status)) throw new Error('Only active campaigns can be paused.');
  if (campaign.metaCampaignId) {
    const pauseRes = await pauseMetaCampaign(campaign.metaCampaignId);
    if (!pauseRes.success) {
      throw new Error(`Unable to pause Meta campaign: ${pauseRes.message}`);
    }
  }

  const { data, error } = await createAdminClient()
    .from('neighborhood_halo_campaigns')
    .update({ status: 'paused', updated_at: new Date().toISOString() })
    .eq('account_id', accountId)
    .eq('id', campaignId)
    .in('status', ['active', 'paused'])
    .select()
    .single();

  if (error) throw new Error(`Unable to pause campaign: ${error.message}`);
  return mapRowToCampaign(data);
}

async function resumeHaloCampaignUnlocked(
  supabase: SupabaseClient,
  accountId: string,
  campaignId: string
): Promise<HaloCampaignRecord> {
  const campaign = await getHaloCampaignById(supabase, campaignId);
  if (!campaign || campaign.accountId !== accountId) {
    throw new Error('Campaign not found.');
  }

  if (campaign.settlementRequestedAt) throw new Error('Campaign is stopped and its final spend is being reconciled.');
  if (campaign.status !== 'paused') {
    throw new Error(`Cannot resume campaign with status '${campaign.status}'. Only paused campaigns can be resumed.`);
  }

  if (campaign.expiresAt && Date.now() >= new Date(campaign.expiresAt).getTime()) {
    throw new Error('Cannot resume campaign: campaign duration has expired.');
  }

  if (!campaign.metaCampaignId) throw new Error('Campaign has no verified Meta resources.');
  const activated = await activateMetaCampaign({ campaignId: campaign.metaCampaignId, adSetId: campaign.metaAdSetId || undefined, adId: campaign.metaAdId || undefined });
  if (!activated.success) throw new Error(activated.message);
  const updated = await createAdminClient().from('neighborhood_halo_campaigns').update({ status: 'active', updated_at: new Date().toISOString() }).eq('account_id', accountId).eq('id', campaignId).eq('status', 'paused').select().single();
  if (updated.error || !updated.data) {
    const paused = await pauseMetaCampaign(campaign.metaCampaignId);
    throw new Error(`Could not persist campaign resume.${paused.success ? '' : ' Provider pause needs recovery.'}`);
  }
  return mapRowToCampaign(updated.data);
}

async function killHaloCampaignUnlocked(
  supabase: SupabaseClient,
  accountId: string,
  campaignId: string,
  reason = 'manual_cancellation'
): Promise<HaloCampaignRecord> {
  const admin = createAdminClient();

  const campaign = await getHaloCampaignById(supabase, campaignId);
  if (!campaign || campaign.accountId !== accountId) {
    throw new Error('Campaign not found.');
  }

  if (['killed', 'completed', 'failed'].includes(campaign.status)) return campaign;
  let spendCents = 0;
  const terminalStatus = campaign.settlementStatus || (reason === 'duration_complete' ? 'completed' : reason === 'launch_failed' ? 'failed' : 'killed');
  if (campaign.metaCampaignId) {
    const stopped = await pauseMetaCampaign(campaign.metaCampaignId);
    if (!stopped.success) throw new Error(`Unable to stop Meta delivery: ${stopped.message}`);
    if (!campaign.settlementRequestedAt) {
      const saved = await admin.from('neighborhood_halo_campaigns').update({ status: 'paused', settlement_requested_at: new Date().toISOString(),
        settlement_status: terminalStatus, auto_kill_reason: reason }).eq('id', campaignId).eq('account_id', accountId).select().single();
      if (saved.error || !saved.data) throw new Error('Meta is paused; stopping status needs recovery.');
      return mapRowToCampaign(saved.data);
    }
    // Provider reporting can lag delivery. Keep funds reserved during reconciliation.
    if (Date.now() - Date.parse(campaign.settlementRequestedAt) < 72 * 3600000) return campaign;
    const insights = await fetchMetaCampaignDailySpend(campaign.metaCampaignId, undefined, 'maximum');
    if (!insights.success) throw new Error('Meta is paused; waiting for verified final spend before refunding.');
    spendCents = insights.spendCents;
  } else if (campaign.status !== 'pending_provisioning' && campaign.walletDeductedCents > 0) {
    throw new Error('Campaign has no provider reference; reserved budget requires reconciliation.');
  }
  return settleHaloCampaign(admin, accountId, campaignId, spendCents, terminalStatus, reason);
}

export async function triggerNeighborhoodHaloOnJobComplete(
  supabase: SupabaseClient,
  accountId: string,
  jobId: string
): Promise<HaloCampaignRecord | null> {
  const settings = await getHaloSettings(supabase, accountId);
  if (!settings.autoLaunchEnabled) {
    return null;
  }

  try {
    return await launchHaloCampaign(supabase, accountId, jobId);
  } catch (error) {
    console.warn(`[NeighborhoodHalo] Auto-launch skipped for job ${jobId}:`, error instanceof Error ? error.message : error);
    return null;
  }
}

async function withHaloDeliveryLease(supabase: SupabaseClient, accountId: string, campaignId: string, work: () => Promise<HaloCampaignRecord>) {
  const owned = await getHaloCampaignById(supabase, campaignId);
  if (!owned || owned.accountId !== accountId) throw new Error('Campaign not found.');
  const admin = createAdminClient();
  const lease = crypto.randomUUID();
  const claim = await admin.rpc('claim_halo_delivery', { p_account_id: accountId, p_campaign_id: campaignId, p_lease: lease });
  if (claim.error || claim.data !== true) throw new Error('Campaign delivery is being updated. Please retry shortly.');
  try { return await work(); } finally {
    const released = await admin.rpc('release_halo_delivery', { p_account_id: accountId, p_campaign_id: campaignId, p_lease: lease });
    if (released.error) console.error('Halo delivery lease awaits expiry:', released.error);
  }
}
export async function pauseHaloCampaign(supabase: SupabaseClient, accountId: string, campaignId: string) {
  return withHaloDeliveryLease(supabase, accountId, campaignId, () => pauseHaloCampaignUnlocked(supabase, accountId, campaignId));
}
export async function resumeHaloCampaign(supabase: SupabaseClient, accountId: string, campaignId: string) {
  return withHaloDeliveryLease(supabase, accountId, campaignId, () => resumeHaloCampaignUnlocked(supabase, accountId, campaignId));
}
export async function killHaloCampaign(supabase: SupabaseClient, accountId: string, campaignId: string, reason = 'manual_cancellation') {
  return withHaloDeliveryLease(supabase, accountId, campaignId, () => killHaloCampaignUnlocked(supabase, accountId, campaignId, reason));
}
