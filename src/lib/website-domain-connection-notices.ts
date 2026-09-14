import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { APP_ORIGIN } from '@/lib/app-origin';
import { getAccountOwnerEmail, sendCustomDomainConnectedEmail } from '@/lib/email';

type Notice = { id: string; account_id: string; site_id: string | null; domain: string; attempted_at: string };

/** One attempt per committed connection event. Uncertain outcomes require review. */
export async function runWebsiteDomainConnectionNotices(admin: SupabaseClient) {
  const claimed = await admin.rpc('claim_website_domain_connection_notices', { p_limit: 5 });
  if (claimed.error) throw new Error('Could not claim website connection notices');
  let ownersNotified = 0;
  for (const notice of (claimed.data ?? []) as Notice[]) {
    let providerId: string | null = null;
    let failure: string | null = null;
    try {
      const recipient = (await getAccountOwnerEmail(admin, notice.account_id))?.trim().toLowerCase();
      if (!recipient) throw new Error('owner_email_missing');
      const site = await admin.from('sites').select('company_name').eq('id', notice.site_id).eq('account_id', notice.account_id).maybeSingle();
      if (site.error || !site.data) throw new Error('owner_brand_unavailable');
      const prepared = await admin.rpc('prepare_website_domain_connection_notice', {
        p_id: notice.id, p_account_id: notice.account_id, p_attempted_at: notice.attempted_at, p_recipient: recipient,
      });
      if (prepared.error || prepared.data !== true) throw new Error('notice_prepare_failed');
      providerId = await sendCustomDomainConnectedEmail({
        noticeId: notice.id,
        recipientEmail: recipient, businessName: site.data.company_name?.trim() || 'your business',
        domain: notice.domain, accountId: notice.account_id,
        siteUrl: `https://${notice.domain}`, settingsUrl: `${APP_ORIGIN}/dashboard/sites`,
      });
    } catch (error) {
      failure = error instanceof Error && ['owner_email_missing','owner_brand_unavailable','notice_prepare_failed'].includes(error.message)
        ? error.message : 'send_failed_or_outcome_unknown';
    }
    const saved = await admin.rpc('finish_website_domain_connection_notice', {
      p_id: notice.id, p_account_id: notice.account_id, p_attempted_at: notice.attempted_at,
      p_provider_id: providerId, p_error: failure,
    });
    if (saved.error || saved.data !== true) throw new Error('Could not persist website connection notice outcome');
    if (providerId) ownersNotified += 1; // Provider acceptance, not confirmed delivery.
  }
  const reviews = await admin.from('website_domain_connection_notices')
    .select('id,account_id,last_error', { count: 'exact' }).eq('state','manual_review').order('created_at').limit(20);
  const pending = await admin.from('website_domain_connection_notices').select('id', { count: 'exact', head: true }).eq('state','pending');
  if (reviews.error || pending.error) throw new Error('Could not read website connection notice incidents');
  const notificationReviews = reviews.count ?? reviews.data?.length ?? 0;
  const notificationBacklog = pending.count ?? 0;
  return { ownersNotified, notificationReviews, notificationBacklog, errors: notificationReviews + notificationBacklog,
    notificationFailures: (reviews.data ?? []).map(row => ({ noticeId: row.id as string, accountId: row.account_id as string, code: row.last_error as string })) };
}
