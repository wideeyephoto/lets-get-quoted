import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { APP_ORIGIN } from '@/lib/app-origin';
import { getAccountOwnerEmail, sendOwnerEventNoticeEmail } from '@/lib/email';

type Notice = { id: string; account_id: string; source_id: string; source_type?: string; event_kind: string; source_payload: { title: string | null; body: string; job_id?: string; recipient_email?: string; business_name?: string; application_id?: string }; attempted_at: string };

/** One attempt per committed source event. Uncertain outcomes require review. */
export async function runOwnerEventNotices(admin: SupabaseClient, source?: { sourceId: string; accountId: string }) {
  const claimed = await admin.rpc('claim_owner_event_notices', { p_limit: source ? 1 : 5, p_source_id: source?.sourceId ?? null, p_account_id: source?.accountId ?? null });
  if (claimed.error) throw new Error('Could not claim owner event notices');
  let ownersNotified = 0;
  for (const notice of (claimed.data ?? []) as Notice[]) {
    let providerId: string | null = null;
    let failure: string | null = null;
    try {
      const messaging = notice.source_type === 'messaging_registration_event';
      const recipient = (messaging ? notice.source_payload.recipient_email : await getAccountOwnerEmail(admin, notice.account_id))?.trim().toLowerCase();
      if (!recipient) throw new Error('owner_email_missing');
      const site = messaging ? { data: { company_name: notice.source_payload.business_name }, error: null }
        : await admin.from('sites').select('company_name').eq('account_id', notice.account_id).maybeSingle();
      if (site.error) throw new Error('owner_brand_unavailable');
      const prepared = await admin.rpc('prepare_owner_event_notice', {
        p_id: notice.id, p_account_id: notice.account_id, p_attempted_at: notice.attempted_at, p_recipient: recipient,
      });
      if (prepared.error || prepared.data !== true) throw new Error('notice_prepare_failed');
      providerId = await sendOwnerEventNoticeEmail({
        noticeId: notice.id,
        prepareIntent: async snapshot => {
          const saved = await admin.rpc('prepare_owner_event_notice_snapshot', {
            p_id: notice.id, p_account_id: notice.account_id, p_attempted_at: notice.attempted_at,
            p_payload: snapshot.payload, p_provider_fingerprint: snapshot.providerFingerprint,
            p_idempotency_key: snapshot.idempotencyKey,
          });
          if (saved.error || saved.data !== true) throw new Error('notice_prepare_failed');
        },
        recipientEmail: recipient, businessName: site.data?.company_name?.trim() || 'your business',
        accountId: notice.account_id,
        subject: notice.source_payload.title || 'New customer request',
        heading: notice.source_payload.title || 'New customer request',
        bodyLines: [notice.source_payload.body], ctaLabel: notice.source_type === 'quick_stop' ? 'View Quick Stops' : messaging ? 'Open messaging dashboard' : notice.source_payload.job_id ? 'Open the job' : 'Open dashboard',
        ctaUrl: notice.source_type === 'quick_stop' ? `${APP_ORIGIN}/dashboard/quick-stops` : messaging ? `${APP_ORIGIN}/dashboard/messages/dedicated-number` : notice.source_payload.job_id ? `${APP_ORIGIN}/dashboard/jobs/${notice.source_payload.job_id}` : `${APP_ORIGIN}/dashboard`, tone: 'info',
      });
    } catch (error) {
      failure = error instanceof Error && ['owner_email_missing','owner_brand_unavailable','notice_prepare_failed'].includes(error.message)
        ? error.message : 'send_failed_or_outcome_unknown';
    }
    const saved = await admin.rpc('finish_owner_event_notice', {
      p_id: notice.id, p_account_id: notice.account_id, p_attempted_at: notice.attempted_at,
      p_provider_id: providerId, p_error: failure,
    });
    if (saved.error || saved.data !== true) throw new Error('Could not persist owner event notice outcome');
    if (providerId) ownersNotified += 1; // Provider acceptance, not confirmed delivery.
  }
  const reviews = await admin.from('owner_event_notices')
    .select('id,account_id,last_error', { count: 'exact' }).eq('state','manual_review').order('created_at').limit(20);
  const pending = await admin.from('owner_event_notices').select('id', { count: 'exact', head: true }).eq('state','pending');
  if (reviews.error || pending.error) throw new Error('Could not read owner event notice incidents');
  const notificationReviews = reviews.count ?? reviews.data?.length ?? 0;
  const notificationBacklog = pending.count ?? 0;
  return { ownersNotified, notificationReviews, notificationBacklog, errors: notificationReviews + notificationBacklog,
    notificationFailures: (reviews.data ?? []).map(row => ({ noticeId: row.id as string, accountId: row.account_id as string, code: row.last_error as string })) };
}

/** Dispatch only pending events for the application that just committed. */
export async function dispatchMessagingOwnerNotices(admin: SupabaseClient, accountId: string, applicationId: string) {
  const pending = await admin.from('owner_event_notices').select('source_id')
    .eq('account_id', accountId).eq('source_type', 'messaging_registration_event')
    .eq('source_payload->>application_id', applicationId).eq('state', 'pending')
    .order('created_at').limit(5);
  if (pending.error) throw new Error('Could not read pending messaging notices');
  for (const notice of pending.data ?? []) {
    await runOwnerEventNotices(admin, { sourceId: notice.source_id, accountId });
  }
}
