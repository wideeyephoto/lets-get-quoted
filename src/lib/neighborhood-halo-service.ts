import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/auth';
import {
  qualifyJobForNeighborhoodHalo,
  extractStreetAndNeighborhood,
  calculateHaloGeofence,
  findOverlappingHaloCampaigns,
  DEFAULT_HALO_CONFIG,
  type HaloJobInput,
  type HaloQualificationResult,
  type NeighborhoodHaloCampaign,
  type HaloAdCopyPackage,
} from './neighborhood-halo';
import { buildHaloCreativeBundle, type HaloAdCreativeBundle } from './neighborhood-halo-ai';
import { createJobPhotoLinks } from './job-photo-storage';
import { isMetaAdsConfigured, provisionManagedMetaCampaign, pauseMetaCampaign, resumeMetaCampaign } from './meta-ads-api';
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
    .select('budget_dollars')
    .eq('account_id', accountId)
    .is('deleted_at', null)
    .gte('created_at', firstOfMonth);

  if (error || !data) return 0;
  return data.reduce((sum, row) => sum + Number(row.budget_dollars || 0), 0);
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

  const lat = job.lat ? Number(job.lat) : 37.7749;
  const lng = job.lng ? Number(job.lng) : -122.4194;

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

  // Deduct micro-budget from sitewide Ad Wallet via atomic spend RPC
  const spendCents = Math.round(budget * 100);
  const todayIso = new Date().toISOString().slice(0, 10);
  let walletDeducted = false;

  const { data: spendData, error: spendError } = await admin.rpc('atomic_ad_wallet_spend', {
    p_account_id: accountId,
    p_spend_cents: spendCents,
    p_date: todayIso,
    p_clicks: 0,
    p_impressions: 0,
    p_conversions: 0,
    p_source: 'neighborhood_halo_launch',
  });

  if (spendError) {
    throw new Error(
      `INSUFFICIENT_WALLET_BALANCE: Neighborhood Halo requires $${budget.toFixed(2)} in your Managed Ads Wallet. ${spendError.message || 'Please deposit or auto-refill wallet funds.'}`
    );
  }

  if (spendData && typeof spendData === 'object') {
    const res = spendData as { success: boolean; error?: string };
    if (!res.success) {
      throw new Error(
        `INSUFFICIENT_WALLET_BALANCE: Neighborhood Halo requires $${budget.toFixed(2)} in your Managed Ads Wallet. ${res.error || 'Please deposit or auto-refill wallet funds.'}`
      );
    }
    walletDeducted = true;
  } else {
    throw new Error(
      `INSUFFICIENT_WALLET_BALANCE: Unable to verify wallet balance for Neighborhood Halo launch.`
    );
  }

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

  let metaCampaignId: string | null = null;
  let metaRes: Awaited<ReturnType<typeof provisionManagedMetaCampaign>> | null = null;
  try {
    metaRes = await provisionManagedMetaCampaign({
      accountId,
      businessName: (site?.company_name as string | undefined) || account?.business_name || 'Our Team',
      trade: job.trade || getSiteContent(site?.content).trade || 'Contracting',
      city,
      radiusMiles: radius,
      latitude: job.lat ? Number(job.lat) : undefined,
      longitude: job.lng ? Number(job.lng) : undefined,
      monthlyBudgetDollars: Math.round(budget * (30.4 / duration)),
      landingPageUrl: landingUrl,
      durationDays: duration,
    });
  } catch (metaErr: unknown) {
    if (walletDeducted) {
      try {
        await admin.rpc('atomic_ad_wallet_credit', {
          p_account_id: accountId,
          p_payment_intent_id: `refund_halo_fail_${haloCampaignId}`,
          p_credit_cents: spendCents,
          p_fee_cents: 0,
        });
      } catch {}
    }
    const errMessage = metaErr instanceof Error ? metaErr.message : 'Meta campaign provisioning failed';
    throw new Error(`Failed to launch Neighborhood Halo campaign: ${errMessage}`);
  }

  if (metaRes.success && metaRes.campaignId) {
    metaCampaignId = metaRes.campaignId;
  } else {
    const failureMsg = metaRes?.message || 'Meta campaign provisioning failed';
    // If a campaign was partially created on Meta, pause it to prevent orphaned ad spend
    if (metaRes?.campaignId) {
      try {
        await pauseMetaCampaign(metaRes.campaignId);
      } catch (cleanErr) {
        console.warn('[NeighborhoodHalo] Failed to pause orphan Meta campaign:', cleanErr);
      }
    }
    // Roll back upfront wallet debit
    if (walletDeducted) {
      try {
        await admin.rpc('atomic_ad_wallet_credit', {
          p_account_id: accountId,
          p_payment_intent_id: `refund_halo_fail_${haloCampaignId}`,
          p_credit_cents: spendCents,
          p_fee_cents: 0,
        });
      } catch (refundErr) {
        console.error('[NeighborhoodHalo] Failed to refund wallet debit on provisioning failure:', refundErr);
      }
    }
    throw new Error(`Failed to launch Neighborhood Halo campaign: ${failureMsg}`);
  }

  const status: HaloCampaignStatus = 'active';

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
    wallet_deducted_cents: walletDeducted ? spendCents : 0,
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
    meta_campaign_id: metaCampaignId,
    landing_page_url: landingUrl,
    expires_at: expiresAt,
    created_at: nowIso,
    updated_at: nowIso,
  };

  const { data: createdRow, error: insertError } = await admin
    .from('neighborhood_halo_campaigns')
    .insert(insertPayload)
    .select()
    .single();

  if (insertError) {
    if (walletDeducted) {
      try {
        await admin.rpc('atomic_ad_wallet_credit', {
          p_account_id: accountId,
          p_payment_intent_id: `refund_halo_fail_${haloCampaignId}`,
          p_credit_cents: spendCents,
          p_fee_cents: 0,
        });
      } catch {
        // Best-effort rollback
      }
    }
    throw new Error(`Failed to create neighborhood halo campaign: ${insertError.message}`);
  }

  return mapRowToCampaign(createdRow);
}

export async function pauseHaloCampaign(
  supabase: SupabaseClient,
  accountId: string,
  campaignId: string
): Promise<HaloCampaignRecord> {
  const campaign = await getHaloCampaignById(supabase, campaignId);
  if (!campaign || campaign.accountId !== accountId) {
    throw new Error('Campaign not found.');
  }

  if (campaign.metaCampaignId) {
    const pauseRes = await pauseMetaCampaign(campaign.metaCampaignId);
    if (!pauseRes.success) {
      throw new Error(`Unable to pause Meta campaign: ${pauseRes.message}`);
    }
  }

  const { data, error } = await supabase
    .from('neighborhood_halo_campaigns')
    .update({ status: 'paused', updated_at: new Date().toISOString() })
    .eq('account_id', accountId)
    .eq('id', campaignId)
    .select()
    .single();

  if (error) throw new Error(`Unable to pause campaign: ${error.message}`);
  return mapRowToCampaign(data);
}

export async function resumeHaloCampaign(
  supabase: SupabaseClient,
  accountId: string,
  campaignId: string
): Promise<HaloCampaignRecord> {
  const campaign = await getHaloCampaignById(supabase, campaignId);
  if (!campaign || campaign.accountId !== accountId) {
    throw new Error('Campaign not found.');
  }

  if (campaign.status !== 'paused') {
    throw new Error(`Cannot resume campaign with status '${campaign.status}'. Only paused campaigns can be resumed.`);
  }

  if (campaign.expiresAt && Date.now() >= new Date(campaign.expiresAt).getTime()) {
    throw new Error('Cannot resume campaign: campaign duration has expired.');
  }

  const { data, error } = await supabase
    .from('neighborhood_halo_campaigns')
    .update({ status: 'active', updated_at: new Date().toISOString() })
    .eq('account_id', accountId)
    .eq('id', campaignId)
    .eq('status', 'paused')
    .select()
    .single();

  if (error) throw new Error(`Unable to resume campaign: ${error.message}`);

  if (campaign.metaCampaignId) {
    try {
      const resumeRes = await resumeMetaCampaign(campaign.metaCampaignId);
      if (!resumeRes.success) {
        throw new Error(resumeRes.message);
      }
    } catch (resumeErr) {
      await supabase
        .from('neighborhood_halo_campaigns')
        .update({ status: 'paused', updated_at: new Date().toISOString() })
        .eq('account_id', accountId)
        .eq('id', campaignId);
      const msg = resumeErr instanceof Error ? resumeErr.message : String(resumeErr);
      throw new Error(`Unable to resume Meta campaign: ${msg}`);
    }
  }

  return mapRowToCampaign(data);
}

export async function killHaloCampaign(
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

  // If a live Meta campaign is running, pause it on Meta to halt real ad delivery immediately
  if (campaign.metaCampaignId) {
    const pauseRes = await pauseMetaCampaign(campaign.metaCampaignId);
    if (!pauseRes.success) {
      throw new Error(`Unable to pause Meta campaign on kill: ${pauseRes.message}`);
    }
  }

  // Refunds are strictly tied to proven debits
  const provenDebitedCents = campaign.walletDeductedCents || 0;
  const actualSpendCents = Math.round(campaign.spendDollars * 100);
  const refundableCents = Math.max(0, provenDebitedCents - actualSpendCents);

  const { data, error } = await supabase
    .from('neighborhood_halo_campaigns')
    .update({
      status: 'killed',
      auto_killed_at: new Date().toISOString(),
      auto_kill_reason: reason,
      updated_at: new Date().toISOString(),
    })
    .eq('account_id', accountId)
    .eq('id', campaignId)
    .select()
    .single();

  if (error) throw new Error(`Unable to kill campaign: ${error.message}`);

  if (refundableCents > 0) {
    try {
      await admin.rpc('atomic_ad_wallet_credit', {
        p_account_id: accountId,
        p_payment_intent_id: `refund_halo_kill_${campaignId}`,
        p_credit_cents: refundableCents,
        p_fee_cents: 0,
      });
    } catch (refundErr) {
      console.warn(`Failed to refund proven unspent budget for halo ${campaignId}:`, refundErr);
    }
  }

  return mapRowToCampaign(data);
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
