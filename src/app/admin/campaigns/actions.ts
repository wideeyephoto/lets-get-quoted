'use server';

import { requireAdmin, requirePermission } from '@/lib/auth';
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

import { logAdminAction } from '@/lib/admin';
import { staffCan } from '@/lib/staff';

function maskEmail(email: string): string {
  const parts = email.split('@');
  if (parts.length !== 2) return '***@***';
  const name = parts[0];
  const domain = parts[1];
  const maskedName = name.length > 2 ? `${name[0]}***${name[name.length - 1]}` : `${name[0]}***`;
  return `${maskedName}@${domain}`;
}

/**
 * Server action to get real-time recipient count and sample addresses for an audience.
 * Masks recipient emails unless caller holds ops.manage, and audit-logs unmasked inspections.
 */
export async function getAudienceReachAction(
  audience: PlatformAudienceId,
  customEmails = '',
): Promise<{ success: boolean; count: number; sampleEmails: string[]; error?: string }> {
  try {
    const ctx = await requireAdmin();
    const recipients = await resolvePlatformCampaignRecipients(ctx.admin, audience, customEmails);
    const canViewPii = staffCan(ctx.staff, 'ops.manage');

    const sampleEmails = recipients.slice(0, 5).map((r) => {
      const emailDisplay = canViewPii ? r.email : maskEmail(r.email);
      return r.businessName ? `${r.businessName} (${emailDisplay})` : emailDisplay;
    });

    if (canViewPii && recipients.length > 0) {
      await logAdminAction(ctx.admin, ctx, {
        action: 'campaign_audience_reach_inspected',
        targetType: 'platform_audience',
        targetId: audience,
        meta: {
          audience,
          totalCount: recipients.length,
          sampleCount: sampleEmails.length,
        },
      });
    }

    return {
      success: true,
      count: recipients.length,
      sampleEmails,
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
 * Server action to send a single test email directly to an inbox.
 * Strictly gated on ops.manage with mandatory audit logging.
 */
export async function sendTestPlatformEmailAction(
  campaign: Omit<PlatformCampaignInput, 'audience'>,
  testEmail: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const context = await requirePermission('ops.manage');
    const cleanEmail = (testEmail || '').trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      return { success: false, error: 'A valid destination email is required for test sends.' };
    }

    const result = await sendTestPlatformCampaignEmail(campaign, cleanEmail);
    if (result.success) {
      await logAdminAction(context.admin, context, {
        action: 'campaign_send_test_email',
        targetType: 'platform_campaign',
        meta: {
          to: cleanEmail,
          subject: campaign.subject,
          senderName: campaign.senderName,
          senderEmail: campaign.senderEmail,
          theme: campaign.theme,
        },
      });
    }
    return result;
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
    const context = await requirePermission('ops.manage');
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

