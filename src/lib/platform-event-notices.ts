import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { sendPlatformEventNoticeEmail } from '@/lib/email';

type Notice = {
  id: string;
  account_id: string | null;
  event_family: string;
  source_id: string;
  payload: any;
  attempted_at: string;
};

/** One attempt per committed platform event notice. Uncertain outcomes require review. */
export async function runPlatformEventNotices(admin: SupabaseClient, source?: { sourceId: string; eventFamily: string }) {
  const claimed = await admin.rpc('claim_platform_event_notices', { p_limit: source ? 1 : 5, p_source_id: source?.sourceId ?? null, p_event_family: source?.eventFamily ?? null });
  if (claimed.error) throw new Error(`Could not claim platform event notices: ${claimed.error.message}`);
  let ownersNotified = 0;
  for (const notice of (claimed.data ?? []) as Notice[]) {
    let providerId: string | null = null;
    let failure: string | null = null;
    try {
      if (notice.event_family === 'auth_link' && notice.payload.verifyUrl
        && (!Number.isFinite(Date.parse(notice.payload.expiresAt)) || Date.parse(notice.payload.expiresAt) <= Date.now())) {
        throw new Error('auth_link_expired');
      }
      const recipient = notice.payload.to?.trim().toLowerCase();
      if (!recipient) throw new Error('owner_email_missing');
      
      const prepared = await admin.rpc('prepare_platform_event_notice', {
        p_id: notice.id, p_attempted_at: notice.attempted_at, p_recipient: recipient,
      });
      if (prepared.error || prepared.data !== true) throw new Error('notice_prepare_failed');
      
      providerId = await sendPlatformEventNoticeEmail({
        noticeId: notice.id,
        prepareIntent: async snapshot => {
          const saved = await admin.rpc('prepare_platform_event_notice_snapshot', {
            p_id: notice.id, p_attempted_at: notice.attempted_at,
            p_payload: snapshot.payload, p_provider_fingerprint: snapshot.providerFingerprint,
            p_idempotency_key: snapshot.idempotencyKey,
          });
          if (saved.error || saved.data !== true) throw new Error('notice_prepare_failed');
        },
        recipientEmail: recipient,
        accountId: notice.account_id,
        eventFamily: notice.event_family as any,
        payload: notice.payload,
      });
    } catch (error) {
      failure = error instanceof Error && ['owner_email_missing','owner_brand_unavailable','notice_prepare_failed','auth_link_expired'].includes(error.message)
        ? error.message : 'send_failed_or_outcome_unknown';
    }
    const saved = await admin.rpc('finish_platform_event_notice', {
      p_id: notice.id, p_attempted_at: notice.attempted_at,
      p_provider_id: providerId, p_error: failure,
    });
    if (saved.error || saved.data !== true) throw new Error('Could not persist platform event notice outcome');
    if (providerId) ownersNotified += 1;
  }
  const reviews = await admin.from('platform_event_notices')
    .select('id,account_id,last_error', { count: 'exact' }).eq('state','manual_review').order('created_at').limit(20);
  const pending = await admin.from('platform_event_notices').select('id', { count: 'exact', head: true }).eq('state','pending');
  if (reviews.error || pending.error) throw new Error('Could not read platform event notice incidents');
  const notificationReviews = reviews.count ?? reviews.data?.length ?? 0;
  const notificationBacklog = pending.count ?? 0;
  return { ownersNotified, notificationReviews, notificationBacklog, errors: notificationReviews + notificationBacklog,
    notificationFailures: (reviews.data ?? []).map(row => ({ noticeId: row.id as string, accountId: row.account_id as string, code: row.last_error as string })) };
}
