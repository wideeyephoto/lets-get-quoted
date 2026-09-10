import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { APP_ORIGIN } from '@/lib/app-origin';
import { getAccountOwnerEmail, sendSendingDomainFailedEmail } from '@/lib/email';

type Notice = {
  id: string;
  account_id: string;
  domain_id: string | null;
  domain: string;
  reason: string | null;
  provider_id: string | null;
  accepted_at: string | null;
};

export type DomainNoticeSummary = {
  ownersNotified: number;
  notificationReviews: number;
  notificationBacklog: number;
  errors: number;
  failures: Array<{ noticeId: string; accountId: string; code: string }>;
};

async function saveNotice(admin: SupabaseClient, id: string, state: string, patch: Record<string, unknown>) {
  const result = await admin.from('email_domain_failure_notices').update(patch)
    .eq('id', id).eq('state', state).select('id');
  if (result.error || result.data?.length !== 1) throw new Error('Could not persist domain notice outcome');
}

/** Each notice is attempted once. A rejected/uncertain send remains an incident
 * across later domain checks, recovery and disconnection until explicitly reviewed.
 * Provider acceptance is followed through the existing signed webhook ledger. */
export async function runEmailDomainFailureNotices(admin: SupabaseClient): Promise<DomainNoticeSummary> {
  const summary: DomainNoticeSummary = { ownersNotified: 0, notificationReviews: 0, notificationBacklog: 0, errors: 0, failures: [] };
  const claimed = await admin.rpc('claim_email_domain_failure_notices', { p_limit: 5 });
  if (claimed.error) throw new Error('Could not claim domain failure notices');

  for (const notice of (claimed.data ?? []) as Notice[]) {
    let providerId: string;
    try {
      const recipientEmail = await getAccountOwnerEmail(admin, notice.account_id);
      if (!recipientEmail) throw new Error('owner_email_missing');
      const site = await admin.from('sites').select('company_name').eq('account_id', notice.account_id).maybeSingle();
      if (site.error) throw new Error('owner_brand_unavailable');
      providerId = await sendSendingDomainFailedEmail({
        recipientEmail,
        businessName: (site.data?.company_name as string | null)?.trim() || 'your business',
        domain: notice.domain,
        accountId: notice.account_id,
        reason: notice.reason,
        settingsUrl: `${APP_ORIGIN}/dashboard/settings`,
      });
    } catch (error) {
      const known = error instanceof Error && ['owner_email_missing', 'owner_brand_unavailable'].includes(error.message);
      await saveNotice(admin, notice.id, 'sending', {
        state: 'manual_review', last_error: known ? (error as Error).message : 'send_failed_or_outcome_unknown',
      });
      continue;
    }
    // Keep the sending lease if this persistence fails. Its expiry requires
    // review, so a successful provider submission cannot become a duplicate.
    await saveNotice(admin, notice.id, 'sending', {
      state: 'accepted', provider_id: providerId, accepted_at: new Date().toISOString(),
    });
    summary.ownersNotified += 1; // submission accepted; delivery is checked below
  }

  const accepted = await admin.from('email_domain_failure_notices')
    .select('id, account_id, provider_id, accepted_at').eq('state', 'accepted').order('accepted_at').limit(10);
  if (accepted.error) throw new Error('Could not read accepted domain notices');
  for (const notice of (accepted.data ?? []) as Notice[]) {
    const event = await admin.from('email_events').select('status, account_id')
      .eq('provider_id', notice.provider_id).maybeSingle();
    if (event.error) throw new Error('Could not verify domain notice delivery');
    const status = event.data?.status as string | undefined;
    if (event.data && event.data.account_id !== notice.account_id) {
      await saveNotice(admin, notice.id, 'accepted', { state: 'manual_review', last_error: 'delivery_account_mismatch' });
    } else if (status && ['delivered', 'opened', 'clicked'].includes(status)) {
      await saveNotice(admin, notice.id, 'accepted', {
        state: 'resolved', resolved_at: new Date().toISOString(), resolved_by: 'signed_provider_webhook',
        resolution: `Provider ${notice.provider_id}: ${status}`,
      });
    } else if (status && ['bounced', 'complained', 'failed', 'suppressed', 'canceled'].includes(status)) {
      await saveNotice(admin, notice.id, 'accepted', { state: 'manual_review', last_error: `delivery_${status}` });
    } else if (!notice.accepted_at || Date.now() - Date.parse(notice.accepted_at) > 30 * 60_000) {
      await saveNotice(admin, notice.id, 'accepted', { state: 'manual_review', last_error: 'delivery_unconfirmed' });
    }
  }

  const reviews = await admin.from('email_domain_failure_notices')
    .select('id, account_id, last_error', { count: 'exact' }).eq('state', 'manual_review').order('created_at').limit(20);
  if (reviews.error) throw new Error('Could not read domain notice incidents');
  summary.notificationReviews = reviews.count ?? reviews.data?.length ?? 0;
  const pending = await admin.from('email_domain_failure_notices').select('id', { count: 'exact', head: true }).eq('state', 'pending');
  if (pending.error) throw new Error('Could not read domain notice backlog');
  summary.notificationBacklog = pending.count ?? 0;
  summary.errors = summary.notificationReviews + summary.notificationBacklog;
  summary.failures = (reviews.data ?? []).map((row) => ({
    noticeId: row.id as string, accountId: row.account_id as string, code: (row.last_error as string) || 'manual_review',
  }));
  return summary;
}
