'use server';

import { randomBytes } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { requireOfficeContext } from '@/lib/auth';
import { buildCampaignUrl, isValidHttpUrl, slugifyCampaign } from '@/lib/campaign-roi';

export type TrackingCampaignInput = {
  id?: string;
  name: string;
  destinationUrl: string;
  channelId?: string;
  source: string;
  medium: string;
  campaign: string;
  content?: string;
  term?: string;
  promo?: string;
  adSpend?: number;
};

export type SavedTrackingLinkRow = {
  id: string;
  account_id: string;
  short_code: string;
  name: string;
  channel_id: string;
  source: string;
  medium: string;
  campaign: string;
  content: string | null;
  term: string | null;
  promo: string | null;
  destination_url: string;
  full_url: string;
  ad_spend: number;
  scan_count: number;
  last_scanned_at: string | null;
  created_at: string;
  updated_at: string;
};

function generateShortCode(): string {
  const alphabet = '23456789abcdefghjkmnpqrstuvwxyz';
  const bytes = randomBytes(6);
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += alphabet[bytes[i] % alphabet.length];
  }
  return result;
}

export async function saveTrackingCampaignAction(
  input: TrackingCampaignInput
): Promise<{ success: boolean; link?: SavedTrackingLinkRow; error?: string }> {
  const { supabase, accountId } = await requireOfficeContext('marketing.write');

  const name = (input.name || '').trim();
  if (!name) {
    return { success: false, error: 'Campaign name is required.' };
  }

  const rawDestUrl = (input.destinationUrl || '').trim();
  if (!rawDestUrl || !isValidHttpUrl(rawDestUrl)) {
    return { success: false, error: 'Please enter a valid destination website URL (e.g. https://yourbusiness.com/estimate).' };
  }

  const campaignSlug = slugifyCampaign(input.campaign) || slugifyCampaign(name);
  if (!campaignSlug) {
    return { success: false, error: 'Campaign identifier could not be normalized.' };
  }

  const source = (input.source || 'yard_sign').trim();
  const medium = (input.medium || 'print_qr').trim();
  const channelId = (input.channelId || 'print_qr').trim();
  const content = (input.content || '').trim() || null;
  const term = (input.term || '').trim() || null;
  const promo = (input.promo || '').trim() || null;
  const adSpend = Math.max(0, Number(input.adSpend) || 0);

  const fullUrl = buildCampaignUrl({
    baseUrl: rawDestUrl,
    source,
    medium,
    campaign: campaignSlug,
    content: content || undefined,
    term: term || undefined,
    promo: promo || undefined,
  });

  if (!fullUrl) {
    return { success: false, error: 'Failed to construct valid campaign URL.' };
  }

  const nowIso = new Date().toISOString();

  // If editing an existing campaign
  if (input.id) {
    const { data: updated, error: updateError } = await supabase
      .from('marketing_tracking_links')
      .update({
        name,
        destination_url: rawDestUrl,
        full_url: fullUrl,
        channel_id: channelId,
        source,
        medium,
        campaign: campaignSlug,
        content,
        term,
        promo,
        ad_spend: adSpend,
        updated_at: nowIso,
      })
      .eq('id', input.id)
      .eq('account_id', accountId)
      .select('*')
      .maybeSingle();

    if (updateError || !updated) {
      return { success: false, error: updateError?.message || 'Failed to update campaign tracking link.' };
    }

    revalidatePath('/dashboard/marketing/links');
    return { success: true, link: updated as SavedTrackingLinkRow };
  }

  // Check for exact duplicate active URL in this account
  const { data: existingDuplicate } = await supabase
    .from('marketing_tracking_links')
    .select('id, name')
    .eq('account_id', accountId)
    .eq('full_url', fullUrl)
    .is('deleted_at', null)
    .maybeSingle();

  if (existingDuplicate) {
    return {
      success: false,
      error: `A tracking link with this exact destination and parameters already exists: "${existingDuplicate.name}".`,
    };
  }

  // Generate unique short code
  let shortCode = generateShortCode();
  let attempts = 0;
  while (attempts < 5) {
    const { data: collision } = await supabase
      .from('marketing_tracking_links')
      .select('id')
      .eq('short_code', shortCode)
      .maybeSingle();

    if (!collision) break;
    shortCode = generateShortCode();
    attempts++;
  }

  const { data: inserted, error: insertError } = await supabase
    .from('marketing_tracking_links')
    .insert({
      account_id: accountId,
      short_code: shortCode,
      name,
      channel_id: channelId,
      source,
      medium,
      campaign: campaignSlug,
      content,
      term,
      promo,
      destination_url: rawDestUrl,
      full_url: fullUrl,
      ad_spend: adSpend,
      scan_count: 0,
      created_at: nowIso,
      updated_at: nowIso,
    })
    .select('*')
    .maybeSingle();

  if (insertError || !inserted) {
    return { success: false, error: insertError?.message || 'Failed to save campaign tracking link.' };
  }

  revalidatePath('/dashboard/marketing/links');
  return { success: true, link: inserted as SavedTrackingLinkRow };
}

export async function deleteTrackingCampaignAction(
  id: string
): Promise<{ success: boolean; error?: string }> {
  const { supabase, accountId } = await requireOfficeContext('marketing.write');

  const { error } = await supabase
    .from('marketing_tracking_links')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .eq('account_id', accountId);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath('/dashboard/marketing/links');
  return { success: true };
}