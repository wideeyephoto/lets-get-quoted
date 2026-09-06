'use server';

import { revalidatePath } from 'next/cache';
import { requireOfficeContext } from '@/lib/auth';
import {
  updateHaloSettings,
  launchHaloCampaign,
  pauseHaloCampaign,
  resumeHaloCampaign,
  killHaloCampaign,
  qualifyAndPreviewJob,
  type HaloSettingsRecord,
  type HaloCampaignRecord,
} from '@/lib/neighborhood-halo-service';

export async function saveHaloSettingsAction(formData: FormData): Promise<{ success: boolean; settings?: HaloSettingsRecord; error?: string }> {
  const { supabase, accountId } = await requireOfficeContext('marketing.write');

  const autoLaunchEnabled = formData.get('autoLaunchEnabled') === 'on' || formData.get('autoLaunchEnabled') === 'true';
  const defaultRadiusMiles = Number(formData.get('defaultRadiusMiles') || 1.0);
  const perJobBudgetDollars = Number(formData.get('perJobBudgetDollars') || 25.0);
  const monthlySpendCapDollars = Number(formData.get('monthlySpendCapDollars') || 250.0);
  const requirePhotos = formData.get('requirePhotos') !== 'false';

  try {
    const updated = await updateHaloSettings(supabase, accountId, {
      autoLaunchEnabled,
      defaultRadiusMiles,
      perJobBudgetDollars,
      monthlySpendCapDollars,
      requirePhotos,
    });
    revalidatePath('/dashboard/marketing/ads');
    return { success: true, settings: updated };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to update settings.' };
  }
}

export async function launchManualHaloAction(
  jobId: string,
  overrides?: { radiusMiles?: number; budgetDollars?: number }
): Promise<{ success: boolean; campaign?: HaloCampaignRecord; error?: string }> {
  const { supabase, accountId } = await requireOfficeContext('marketing.write');

  try {
    const campaign = await launchHaloCampaign(supabase, accountId, jobId, overrides);
    revalidatePath('/dashboard/marketing/ads');
    return { success: true, campaign };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to launch campaign.' };
  }
}

export async function toggleHaloCampaignStateAction(
  campaignId: string,
  action: 'pause' | 'resume' | 'kill'
): Promise<{ success: boolean; campaign?: HaloCampaignRecord; error?: string }> {
  const { supabase, accountId } = await requireOfficeContext('marketing.write');

  try {
    let campaign: HaloCampaignRecord;
    if (action === 'pause') {
      campaign = await pauseHaloCampaign(supabase, accountId, campaignId);
    } else if (action === 'resume') {
      campaign = await resumeHaloCampaign(supabase, accountId, campaignId);
    } else {
      campaign = await killHaloCampaign(supabase, accountId, campaignId, 'contractor_manual_kill');
    }
    revalidatePath('/dashboard/marketing/ads');
    return { success: true, campaign };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : `Failed to ${action} campaign.` };
  }
}

export async function previewJobForHaloAction(jobId: string) {
  const { supabase, accountId } = await requireOfficeContext('marketing.read');
  return qualifyAndPreviewJob(supabase, accountId, jobId);
}
