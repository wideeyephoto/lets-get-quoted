'use server';

import { requireAdmin } from '@/lib/auth';
import {
  renderPlatformCampaignEmailHtml,
  resolvePlatformCampaignRecipients,
  sendPlatformCampaignBlast,
  sendTestPlatformCampaignEmail,
  type PlatformAudienceId,
  type PlatformCampaignInput,
} from '@/lib/admin-platform-campaigns';

/**
 * Server action to generate exact live HTML preview for a campaign.
 */
export async function previewPlatformCampaignAction(
  input: Omit<PlatformCampaignInput, 'audience'>,
): Promise<{ success: boolean; html?: string; error?: string }> {
  try {
    await requireAdmin();
    const sampleRecipient = {
      email: 'alex@millerplumbing.com',
      name: 'Alex Miller',
      businessName: 'Miller Plumbing & HVAC',
      accountId: 'sample-preview',
    };
    const html = renderPlatformCampaignEmailHtml(input, sampleRecipient);
    return { success: true, html };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Server action to get real-time recipient count and sample addresses for an audience.
 */
export async function getAudienceReachAction(
  audience: PlatformAudienceId,
  customEmails = '',
): Promise<{ success: boolean; count: number; sampleEmails: string[]; error?: string }> {
  try {
    const { admin } = await requireAdmin();
    const recipients = await resolvePlatformCampaignRecipients(admin, audience, customEmails);
    return {
      success: true,
      count: recipients.length,
      sampleEmails: recipients.slice(0, 5).map((r) => `${r.businessName ? `${r.businessName} (${r.email})` : r.email}`),
    };
  } catch (err) {
    return {
      success: false,
      count: 0,
      sampleEmails: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Server action to send a single test email directly to the admin's inbox.
 */
export async function sendTestPlatformEmailAction(
  campaign: Omit<PlatformCampaignInput, 'audience'>,
  testEmail: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireAdmin();
    return await sendTestPlatformCampaignEmail(campaign, testEmail);
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Server action to broadcast a platform email campaign blast to the target audience.
 */
export async function sendPlatformCampaignBlastAction(
  input: PlatformCampaignInput,
): Promise<{
  success: boolean;
  campaignId?: string;
  totalRecipients?: number;
  sentCount?: number;
  failedCount?: number;
  failures?: Array<{ email: string; error: string }>;
  error?: string;
}> {
  try {
    const context = await requireAdmin();
    const result = await sendPlatformCampaignBlast(context.admin, context, input);
    return {
      success: true,
      campaignId: result.campaignId,
      totalRecipients: result.totalRecipients,
      sentCount: result.sentCount,
      failedCount: result.failedCount,
      failures: result.failures,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
