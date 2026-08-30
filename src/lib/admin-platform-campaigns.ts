import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import {
  escapeHtml,
  normalizeEmailTheme,
  renderBrandedEmail,
  type EmailBrand,
} from '@/emails/brand';
import { buildUnsubscribePageUrl, buildUnsubscribeOneClickUrl } from '@/lib/email-suppression';
import { isMailable } from '@/lib/email-quality';
import { logAdminAction, type AuditActor } from '@/lib/admin';
import { ownerEmailsForAccounts } from '@/lib/admin-accounts';

let resendClient: Resend | null = null;
function getResendClient(): Resend {
  if (!resendClient) {
    resendClient = new Resend(process.env.RESEND_API_KEY);
  }
  return resendClient;
}

export * from '@/lib/admin-campaign-types';
import {
  type PlatformAudienceId,
  type PlatformCampaignInput,
  type PlatformCampaignRecord,
  type PlatformCampaignRecipient,
  interpolateTokens,
  parseCustomEmailList,
} from '@/lib/admin-campaign-types';

function campaignParagraphs(body: string): string {
  return body
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      // Check if block is a bullet list
      const lines = block.split('\n');
      const isBulletList = lines.every((line) => line.trim().startsWith('•') || line.trim().startsWith('-') || /^\d+\./.test(line.trim()));
      if (isBulletList) {
        const items = lines
          .map((line) => line.replace(/^[•\-]\s*/, '').replace(/^\d+\.\s*/, '').trim())
          .filter(Boolean)
          .map((item) => `<li style="margin-bottom:8px;line-height:1.6">${escapeHtml(item)}</li>`)
          .join('');
        return `<ul style="margin:0 0 16px;padding-left:22px;color:#1c2230;font-size:15px;line-height:1.6">${items}</ul>`;
      }
      return `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#1c2230">${escapeHtml(block).replace(/\n/g, '<br/>')}</p>`;
    })
    .join('');
}

function marketingFooter(businessName: string, mailingAddress: string | null, unsubscribeUrl: string): string {
  const addressLine = mailingAddress
    ? `<br/><span style="color:#9099a6">${escapeHtml(mailingAddress)}</span>`
    : '<br/><span style="color:#9099a6">Let’s Get Quoted Inc. · Austin, TX</span>';
  return `<p style="margin-top:28px;color:#6b7280;font-size:12px;line-height:1.6">${escapeHtml(businessName)}${addressLine}<br/><a href="${escapeHtml(unsubscribeUrl)}" style="color:#6b7280;text-decoration:underline">Unsubscribe from platform announcements</a></p>`;
}

function listUnsubscribeHeaders(oneClickUrl: string): Record<string, string> {
  return {
    'List-Unsubscribe': `<${oneClickUrl}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  };
}

/**
 * Render the exact HTML for a Let's Get Quoted platform email.
 */
export function renderPlatformCampaignEmailHtml(
  input: Omit<PlatformCampaignInput, 'audience'>,
  recipient?: Partial<PlatformCampaignRecipient>,
): string {
  const theme = normalizeEmailTheme(input.theme);
  const mailingAddress = input.mailingAddress || process.env.COMPANY_MAILING_ADDRESS || 'Let’s Get Quoted Inc. · Austin, TX';
  const replyTo = input.replyTo?.trim() || 'hello@letsgetquoted.com';
  const senderName = input.senderName?.trim() || "Let's Get Quoted";

  const brand: EmailBrand = {
    businessName: senderName,
    accent: '#ff7a21',
    logoUrl: null,
    phone: null,
    siteUrl: 'https://letsgetquoted.com',
    replyTo,
    theme,
    mailingAddress,
    senderName,
  };

  const interpolatedHeading = interpolateTokens(input.heading, recipient);
  const interpolatedBody = interpolateTokens(input.body, recipient);
  const interpolatedEyebrow = input.eyebrow ? interpolateTokens(input.eyebrow, recipient) : 'Platform Announcement';
  const interpolatedPreheader = input.preheader
    ? interpolateTokens(input.preheader, recipient)
    : interpolateTokens(input.subject, recipient);

  const accountId = recipient?.accountId || 'platform';
  const targetEmail = recipient?.email || 'contractor@example.com';
  const unsubscribeUrl = buildUnsubscribePageUrl(accountId, targetEmail);

  return renderBrandedEmail({
    brand,
    audience: 'account',
    preheader: interpolatedPreheader,
    eyebrow: interpolatedEyebrow,
    heading: interpolatedHeading,
    bodyHtml: campaignParagraphs(interpolatedBody),
    cta: input.ctaLabel && input.ctaUrl
      ? {
          label: interpolateTokens(input.ctaLabel, recipient),
          url: interpolateTokens(input.ctaUrl, recipient),
        }
      : undefined,
    footerHtml: marketingFooter("Let's Get Quoted", mailingAddress, unsubscribeUrl),
    accountReplyText: `Reply directly to this email to reach the Let's Get Quoted team (${replyTo}).`,
  });
}

/**
 * Resolve recipients for any chosen platform audience.
 */
export async function resolvePlatformCampaignRecipients(
  admin: SupabaseClient,
  audience: PlatformAudienceId,
  customEmails = '',
): Promise<PlatformCampaignRecipient[]> {
  if (audience === 'custom') {
    const emails = parseCustomEmailList(customEmails);
    return emails.map((email) => ({
      email,
      name: null,
      businessName: null,
      accountId: null,
    }));
  }

  // Query accounts matching filter criteria
  let query = admin
    .from('accounts')
    .select('id, business_name, plan, connect_onboarded, created_at, test_marker, reply_to_email')
    .is('test_marker', null);

  const now = new Date();

  if (audience === 'paid_tier') {
    query = query.in('plan', ['pro', 'crew_plus']);
  } else if (audience === 'free_tier') {
    query = query.eq('plan', 'free');
  } else if (audience === 'incomplete_onboarding') {
    query = query.eq('connect_onboarded', false);
  } else if (audience === 'recent_signups') {
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();
    query = query.gte('created_at', fourteenDaysAgo);
  }

  const { data: accounts, error: accountsError } = await query.order('created_at', { ascending: false }).limit(2000);
  if (accountsError || !accounts) {
    console.error('[admin-platform-campaigns] Failed to load accounts:', accountsError);
    return [];
  }

  // For active_30d and active_90d, filter by recent activity
  let eligibleAccountIds = new Set(accounts.map((a) => a.id));

  if (audience === 'active_30d' || audience === 'active_90d') {
    const days = audience === 'active_30d' ? 30 : 90;
    const sinceDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();

    const [activeJobs, activeInvoices] = await Promise.all([
      admin.from('jobs').select('account_id').gte('created_at', sinceDate).limit(2000),
      admin.from('invoices').select('account_id').gte('created_at', sinceDate).limit(2000),
    ]);

    const activeSet = new Set<string>();
    for (const row of activeJobs.data ?? []) {
      if (row.account_id) activeSet.add(row.account_id);
    }
    for (const row of activeInvoices.data ?? []) {
      if (row.account_id) activeSet.add(row.account_id);
    }

    eligibleAccountIds = activeSet;
  }

  const targetAccounts = accounts.filter((a) => eligibleAccountIds.has(a.id));
  if (!targetAccounts.length) return [];

  const targetIds = targetAccounts.map((a) => a.id);

  // Fetch site names for better businessName display
  const { data: sites } = await admin
    .from('sites')
    .select('account_id, company_name')
    .in('account_id', targetIds);

  const siteMap = new Map<string, string>();
  for (const s of sites ?? []) {
    if (s.company_name?.trim()) siteMap.set(s.account_id, s.company_name.trim());
  }

  // Hydrate owner login emails
  const ownerEmailMap = await ownerEmailsForAccounts(admin, targetIds);

  // Load suppressions to fail closed on opted out emails
  const { data: suppressions } = await admin
    .from('email_suppression')
    .select('email, account_id')
    .in('account_id', targetIds);

  const suppressedSet = new Set<string>();
  for (const s of suppressions ?? []) {
    if (s.email) suppressedSet.add(String(s.email).toLowerCase().trim());
  }

  const recipients: PlatformCampaignRecipient[] = [];
  const seenEmails = new Set<string>();

  for (const account of targetAccounts) {
    const rawEmail = account.reply_to_email || ownerEmailMap.get(account.id);
    if (!rawEmail) continue;

    const email = rawEmail.trim().toLowerCase();
    if (!isMailable(email) || seenEmails.has(email) || suppressedSet.has(email)) {
      continue;
    }

    seenEmails.add(email);
    const businessName = siteMap.get(account.id) || account.business_name || 'Your business';

    recipients.push({
      email,
      name: null,
      businessName,
      accountId: account.id,
    });
  }

  return recipients;
}

/**
 * Send a single test email of the platform campaign to an admin/tester inbox.
 */
export async function sendTestPlatformCampaignEmail(
  input: Omit<PlatformCampaignInput, 'audience'>,
  testEmail: string,
): Promise<{ success: boolean; error?: string }> {
  if (!process.env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY is not configured in environment.');
  }

  const cleanEmail = testEmail.trim().toLowerCase();
  if (!isMailable(cleanEmail)) {
    throw new Error(`Invalid test email address: ${testEmail}`);
  }

  const sampleRecipient: PlatformCampaignRecipient = {
    email: cleanEmail,
    name: 'Alex Miller',
    businessName: 'Miller Plumbing & HVAC',
    accountId: 'test-preview',
  };

  const senderName = input.senderName?.trim() || "Let's Get Quoted";
  const senderEmail = input.senderEmail?.trim() || 'hello@letsgetquoted.com';
  const replyTo = input.replyTo?.trim() || 'hello@letsgetquoted.com';
  const from = `${senderName} <${senderEmail}>`;

  const interpolatedSubject = `[Test] ${interpolateTokens(input.subject, sampleRecipient)}`;
  const html = renderPlatformCampaignEmailHtml(input, sampleRecipient);
  const oneClickUrl = buildUnsubscribeOneClickUrl('platform', cleanEmail);

  const resend = getResendClient();
  const result = await resend.emails.send({
    from,
    to: cleanEmail,
    subject: interpolatedSubject,
    html,
    reply_to: replyTo,
    headers: listUnsubscribeHeaders(oneClickUrl),
    tags: [
      { name: 'kind', value: 'platform_campaign_test' },
      { name: 'theme', value: input.theme || 'studio' },
    ],
  });

  if (result.error) {
    console.error('[sendTestPlatformCampaignEmail] Resend error:', result.error);
    return { success: false, error: result.error.message };
  }

  return { success: true };
}

/**
 * Execute a platform email campaign blast to all resolved audience recipients.
 */
export async function sendPlatformCampaignBlast(
  admin: SupabaseClient,
  actor: AuditActor,
  input: PlatformCampaignInput,
): Promise<{
  campaignId: string;
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
  failures: Array<{ email: string; error: string }>;
}> {
  if (!process.env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY is not configured in environment.');
  }

  const recipients = await resolvePlatformCampaignRecipients(
    admin,
    input.audience,
    input.customEmails,
  );

  if (recipients.length === 0) {
    throw new Error('No valid, deliverable recipients found for the selected audience.');
  }

  const campaignId = randomUUID();
  const senderName = input.senderName?.trim() || "Let's Get Quoted";
  const senderEmail = input.senderEmail?.trim() || 'hello@letsgetquoted.com';
  const replyTo = input.replyTo?.trim() || 'hello@letsgetquoted.com';
  const from = `${senderName} <${senderEmail}>`;
  const theme = normalizeEmailTheme(input.theme);

  const resend = getResendClient();
  let sentCount = 0;
  let failedCount = 0;
  const failures: Array<{ email: string; error: string }> = [];

  const BATCH_SIZE = 8;
  const BATCH_DELAY_MS = 120;

  for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
    const chunk = recipients.slice(i, i + BATCH_SIZE);

    const promises = chunk.map(async (recipient) => {
      try {
        const subject = interpolateTokens(input.subject, recipient);
        const html = renderPlatformCampaignEmailHtml(input, recipient);
        const oneClickUrl = buildUnsubscribeOneClickUrl(recipient.accountId || 'platform', recipient.email);

        const res = await resend.emails.send({
          from,
          to: recipient.email,
          subject,
          html,
          reply_to: replyTo,
          headers: listUnsubscribeHeaders(oneClickUrl),
          tags: [
            { name: 'kind', value: 'platform_campaign' },
            { name: 'campaign_id', value: campaignId },
            { name: 'theme', value: theme },
            ...(recipient.accountId ? [{ name: 'account_id', value: recipient.accountId }] : []),
          ],
        });

        if (res.error) {
          failedCount++;
          failures.push({ email: recipient.email, error: res.error.message });
        } else {
          sentCount++;
        }
      } catch (err) {
        failedCount++;
        failures.push({ email: recipient.email, error: err instanceof Error ? err.message : String(err) });
      }
    });

    await Promise.all(promises);

    if (i + BATCH_SIZE < recipients.length) {
      await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
    }
  }

  const campaignRecord: PlatformCampaignRecord = {
    id: campaignId,
    subject: input.subject,
    heading: input.heading,
    body: input.body,
    ctaLabel: input.ctaLabel || null,
    ctaUrl: input.ctaUrl || null,
    audience: input.audience,
    senderName,
    senderEmail,
    replyTo,
    theme,
    recipientCount: recipients.length,
    sentCount,
    failedCount,
    status: failedCount === 0 ? 'sent' : sentCount > 0 ? 'partially_failed' : 'failed',
    sentBy: actor.adminEmail,
    sentAt: new Date().toISOString(),
  };

  // Record audit log entry
  await logAdminAction(admin, actor, {
    action: 'platform_campaign_send',
    targetType: 'platform_campaign',
    targetId: campaignId,
    reason: `Sent "${input.subject}" to ${input.audience} (${sentCount}/${recipients.length} delivered)`,
    meta: {
      campaign: campaignRecord,
      failureCount: failures.length,
      sampleFailures: failures.slice(0, 5),
    },
  });

  return {
    campaignId,
    totalRecipients: recipients.length,
    sentCount,
    failedCount,
    failures,
  };
}

/**
 * Load campaign history from admin_actions.
 */
export async function listPlatformCampaignHistory(
  admin: SupabaseClient,
  limit = 25,
): Promise<PlatformCampaignRecord[]> {
  const { data, error } = await admin
    .from('admin_actions')
    .select('id, admin_email, action, target_id, meta, created_at')
    .eq('action', 'platform_campaign_send')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error || !data) {
    return [];
  }

  const records: PlatformCampaignRecord[] = [];
  for (const row of data) {
    const meta = row.meta as Record<string, unknown> | null;
    const camp = meta?.campaign as Partial<PlatformCampaignRecord> | undefined;
    if (camp && camp.subject) {
      records.push({
        id: camp.id || row.target_id || row.id,
        subject: camp.subject,
        heading: camp.heading || camp.subject,
        body: camp.body || '',
        ctaLabel: camp.ctaLabel || null,
        ctaUrl: camp.ctaUrl || null,
        audience: (camp.audience as PlatformAudienceId) || 'all_contractors',
        senderName: camp.senderName || "Let's Get Quoted",
        senderEmail: camp.senderEmail || 'hello@letsgetquoted.com',
        replyTo: camp.replyTo || 'hello@letsgetquoted.com',
        theme: camp.theme || 'studio',
        recipientCount: camp.recipientCount || 0,
        sentCount: camp.sentCount || 0,
        failedCount: camp.failedCount || 0,
        status: camp.status || 'sent',
        sentBy: camp.sentBy || row.admin_email,
        sentAt: camp.sentAt || row.created_at,
      });
    }
  }

  return records;
}
