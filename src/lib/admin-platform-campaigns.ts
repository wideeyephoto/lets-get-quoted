import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import {
  escapeHtml,
  normalizeEmailTheme,
  renderBrandedEmail,
  renderRichCampaignBodyHtml,
  themePaint,
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

function marketingFooter(businessName: string, mailingAddress: string | null, unsubscribeUrl: string): string {
  const addressLine = mailingAddress
    ? `<br/><span style="color:#9099a6">${escapeHtml(mailingAddress)}</span>`
    : '<br/><span style="color:#9099a6">Let’s Get Quoted LLC · 11801 Domain Blvd, 3rd Floor · Austin, TX 78758</span>';
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
  const mailingAddress = input.mailingAddress || process.env.COMPANY_MAILING_ADDRESS || 'Let’s Get Quoted LLC · 11801 Domain Blvd, 3rd Floor · Austin, TX 78758';
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
    bodyHtml: renderRichCampaignBodyHtml(interpolatedBody, themePaint(theme, '#ff7a21')),
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

export const MAX_PLATFORM_CAMPAIGN_AUDIENCE = 10000;
export const MAX_ACTIVITY_SCAN_ROWS = 25000;

/**
 * Paged, ordered scan for active account IDs across jobs or invoices.
 * Fails closed if the scan hits the safety cap to prevent sending to an arbitrary slice.
 */
async function scanActiveAccountIds(
  admin: SupabaseClient,
  table: 'jobs' | 'invoices',
  sinceDate: string,
  maxScan = MAX_ACTIVITY_SCAN_ROWS,
): Promise<Set<string>> {
  const activeSet = new Set<string>();
  const CHUNK = 1000;
  let offset = 0;

  while (offset < maxScan) {
    const { data, error } = await admin
      .from(table)
      .select('account_id')
      .is('test_marker', null)
      .gte('created_at', sinceDate)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(offset, offset + CHUNK - 1);

    if (error) {
      console.error(`[admin-platform-campaigns] Failed scanning ${table} for active audience:`, error);
      throw new Error(`Activity scan failed on ${table}: ${error.message}`);
    }

    if (!data || data.length === 0) break;

    for (const row of data) {
      if (row.account_id) activeSet.add(row.account_id);
    }

    offset += data.length;
    if (data.length < CHUNK) break;
  }

  if (offset >= maxScan) {
    throw new Error(
      `Activity scan on ${table} hit safety cap of ${maxScan} records created since ${sinceDate}. Refusing to blast truncated active cohort.`
    );
  }

  return activeSet;
}

/**
 * Resolve recipients for any chosen platform audience.
 * Enforces deterministic ordering, paged scanning, and fails closed if
 * the cohort exceeds the maximum supported platform campaign audience.
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

  const now = new Date();

  // First verify total matching account count to refuse truncated blasts
  let countQuery = admin
    .from('accounts')
    .select('id', { count: 'exact', head: true })
    .is('test_marker', null);

  if (audience === 'paid_tier') {
    countQuery = countQuery.in('plan', ['pro', 'crew_plus']);
  } else if (audience === 'free_tier') {
    countQuery = countQuery.eq('plan', 'free');
  } else if (audience === 'incomplete_onboarding') {
    countQuery = countQuery.eq('connect_onboarded', false);
  } else if (audience === 'recent_signups') {
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();
    countQuery = countQuery.gte('created_at', fourteenDaysAgo);
  }

  const { count: totalAccountsCount, error: countError } = await countQuery;
  if (countError) {
    console.error('[admin-platform-campaigns] Failed to count accounts:', countError);
    throw new Error(`Failed to count audience accounts: ${countError.message}`);
  }

  const totalAccounts = totalAccountsCount ?? 0;
  if (totalAccounts > MAX_PLATFORM_CAMPAIGN_AUDIENCE) {
    throw new Error(
      `Audience scan cap reached: ${totalAccounts} accounts match '${audience}', exceeding safe platform campaign limit of ${MAX_PLATFORM_CAMPAIGN_AUDIENCE}. Refusing to broadcast to a truncated audience.`
    );
  }

  // Page through accounts deterministically
  const PAGE_CHUNK = 1000;
  const accounts: Array<{
    id: string;
    business_name: string | null;
    plan: string | null;
    connect_onboarded: boolean | null;
    created_at: string;
    test_marker: string | null;
    reply_to_email: string | null;
  }> = [];

  for (let offset = 0; offset < Math.max(totalAccounts, 1); offset += PAGE_CHUNK) {
    let chunkQuery = admin
      .from('accounts')
      .select('id, business_name, plan, connect_onboarded, created_at, test_marker, reply_to_email')
      .is('test_marker', null)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(offset, offset + PAGE_CHUNK - 1);

    if (audience === 'paid_tier') {
      chunkQuery = chunkQuery.in('plan', ['pro', 'crew_plus']);
    } else if (audience === 'free_tier') {
      chunkQuery = chunkQuery.eq('plan', 'free');
    } else if (audience === 'incomplete_onboarding') {
      chunkQuery = chunkQuery.eq('connect_onboarded', false);
    } else if (audience === 'recent_signups') {
      const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();
      chunkQuery = chunkQuery.gte('created_at', fourteenDaysAgo);
    }

    const { data: chunk, error: chunkError } = await chunkQuery;
    if (chunkError || !chunk) {
      console.error('[admin-platform-campaigns] Failed to fetch account chunk:', chunkError);
      throw new Error(`Failed to fetch accounts at offset ${offset}: ${chunkError?.message || 'unknown error'}`);
    }
    accounts.push(...chunk);
    if (chunk.length < PAGE_CHUNK) break;
  }

  if (!accounts.length) return [];

  // For active_30d and active_90d, filter by recent activity across jobs and invoices
  let eligibleAccountIds = new Set(accounts.map((a) => a.id));

  if (audience === 'active_30d' || audience === 'active_90d') {
    const days = audience === 'active_30d' ? 30 : 90;
    const sinceDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();

    const [activeJobsSet, activeInvoicesSet] = await Promise.all([
      scanActiveAccountIds(admin, 'jobs', sinceDate),
      scanActiveAccountIds(admin, 'invoices', sinceDate),
    ]);

    const activeSet = new Set<string>([...activeJobsSet, ...activeInvoicesSet]);
    eligibleAccountIds = activeSet;
  }

  const targetAccounts = accounts.filter((a) => eligibleAccountIds.has(a.id));
  if (!targetAccounts.length) return [];

  const targetIds = targetAccounts.map((a) => a.id);

  // Fetch site names in safe chunks for better businessName display
  const siteMap = new Map<string, string>();
  for (let i = 0; i < targetIds.length; i += 500) {
    const chunkIds = targetIds.slice(i, i + 500);
    const { data: sites } = await admin
      .from('sites')
      .select('account_id, company_name')
      .in('account_id', chunkIds);

    for (const s of sites ?? []) {
      if (s.company_name?.trim()) siteMap.set(s.account_id, s.company_name.trim());
    }
  }

  // Hydrate owner login emails
  const ownerEmailMap = await ownerEmailsForAccounts(admin, targetIds);

  // Load suppressions in safe chunks to fail closed on opted out emails
  const suppressedSet = new Set<string>();
  for (let i = 0; i < targetIds.length; i += 500) {
    const chunkIds = targetIds.slice(i, i + 500);
    const { data: suppressions, error: suppressionError } = await admin
      .from('email_suppression')
      .select('email, account_id')
      .in('account_id', chunkIds);

    if (suppressionError) {
      console.error('Failed to load email suppression list for platform campaigns (failing closed):', suppressionError.message);
      throw new Error(`Email suppression lookup failed: ${suppressionError.message}`);
    }

    for (const s of suppressions ?? []) {
      if (s.email) suppressedSet.add(String(s.email).toLowerCase().trim());
    }
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
