import type { SupabaseClient } from '@supabase/supabase-js';
import { loadQuoteFollowupConversation } from '@/lib/quote-followup-conversation';
import { dayKeyDiff, followupMaxAgeDays, followupSettingsFromAccount, isFollowupWindowOpen } from '@/lib/quote-followups';
import { zonedNowParts } from '@/lib/quick-stop';

const FOLLOWUP_KEY = /^quote-followup:([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}):[1-3]$/i;

export type QuoteFollowupDeliveryEligibility =
  | 'ready'
  | 'unavailable'
  | 'invalid_context'
  | 'automation_disabled'
  | 'quote_superseded'
  | 'conversation_active';

/**
 * Recheck a nudge after any queue delay, before staging the provider request.
 * Resolve the job from the durable domain key, never from message text or URLs.
 * This is an application recheck, not an atomic lock on incoming conversations.
 */
export async function quoteFollowupDeliveryEligibility(
  admin: SupabaseClient,
  input: { accountId: string; eventId: string; phone: string; now: Date },
): Promise<QuoteFollowupDeliveryEligibility> {
  try {
    const [{ data: event, error: eventError }, { data: account, error: accountError }] = await Promise.all([
      admin.from('sms_events').select('idempotency_key, created_at')
        .eq('account_id', input.accountId).eq('id', input.eventId)
        .eq('phone_number', input.phone).eq('message_kind', 'quote-followup').maybeSingle(),
      admin.from('accounts').select('quote_followups_enabled, quote_followup_days, quote_followup_channel, timezone')
        .eq('id', input.accountId).maybeSingle(),
    ]);
    if (eventError || accountError) return 'unavailable';
    if (!account || account.quote_followups_enabled !== true || account.quote_followup_channel === 'email') {
      return 'automation_disabled';
    }
    const jobId = typeof event?.idempotency_key === 'string'
      ? FOLLOWUP_KEY.exec(event.idempotency_key)?.[1]
      : null;
    if (!jobId || !event?.created_at || !Number.isFinite(Date.parse(event.created_at))) return 'invalid_context';

    const settings = followupSettingsFromAccount(account);
    const queuedAt = new Date(event.created_at);
    const day = 24 * 60 * 60 * 1000;
    const sharedBefore = new Date(queuedAt.getTime() - Math.max(0, settings.days[0] - 1) * day).toISOString();
    const sharedAfter = new Date(queuedAt.getTime() - (followupMaxAgeDays(settings.days) + 1) * day).toISOString();

    const [jobResult, approvedResult, shareResult] = await Promise.all([
      admin.from('jobs').select('status').eq('account_id', input.accountId).eq('id', jobId).maybeSingle(),
      admin.from('job_feed').select('id').eq('account_id', input.accountId).eq('job_id', jobId)
        .eq('kind', 'quote_approved').limit(1).maybeSingle(),
      // Match the sweep's finite candidate window at enqueue time. Revoked or
      // expired links and a nudge's freshly minted token cannot reset the quote
      // baseline or pull in questions about a much older share.
      admin.from('client_job_access').select('created_at').eq('account_id', input.accountId).eq('job_id', jobId)
        .is('revoked_at', null).gte('created_at', sharedAfter).lte('created_at', sharedBefore)
        .or(`expires_at.is.null,expires_at.gte.${input.now.toISOString()}`)
        .order('created_at', { ascending: true }).limit(1).maybeSingle(),
    ]);
    if (jobResult.error || approvedResult.error || shareResult.error) return 'unavailable';
    if (!jobResult.data || jobResult.data.status !== 'new_lead' || approvedResult.data) return 'quote_superseded';
    const sharedAt = shareResult.data?.created_at;
    if (!sharedAt) return 'quote_superseded';
    if (!Number.isFinite(Date.parse(sharedAt))) return 'invalid_context';
    const timezone = account.timezone || 'America/New_York';
    const sharedKey = zonedNowParts(new Date(sharedAt), timezone).dateKey;
    const queuedAge = dayKeyDiff(sharedKey, zonedNowParts(queuedAt, timezone).dateKey);
    const currentAge = dayKeyDiff(sharedKey, zonedNowParts(input.now, timezone).dateKey);
    if (queuedAge < settings.days[0] || !isFollowupWindowOpen(currentAge, settings.days)) return 'quote_superseded';

    const conversation = await loadQuoteFollowupConversation(admin, {
      accountId: input.accountId,
      jobId,
      phone: input.phone,
      sharedAt,
      now: input.now,
    });
    if (conversation.kind === 'unavailable') return 'unavailable';
    return conversation.pauseReason ? 'conversation_active' : 'ready';
  } catch {
    return 'unavailable';
  }
}
