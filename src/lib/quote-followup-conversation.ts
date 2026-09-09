import type { SupabaseClient } from '@supabase/supabase-js';

/** Leave a full day after either side's latest contact before an automatic nudge. */
export const QUOTE_FOLLOWUP_CONVERSATION_PAUSE_MS = 24 * 60 * 60 * 1000;

export type QuoteFollowupConversation =
  | { kind: 'unavailable' }
  | {
      kind: 'ready';
      pauseReason: 'recent_conversation' | 'unanswered_customer' | null;
      lastActivityAt: string | null;
    };

type ActivityRow = { created_at?: string; sent_at?: string };

/**
 * Check recorded conversation since this quote was shared. Five single-row
 * reads bound returned data, and every read includes the account as well as the
 * job/phone. SMS threads are per customer, while portal questions are per job.
 *
 * An automatic quote nudge or payment receipt is not an answer: only accepted
 * inbox replies count as a response. A client-visible job update counts as
 * contact but cannot prove the customer's question was answered. Portal
 * questions are recognized by kind because those writers historically default
 * author to Owner; general portal notes explicitly use author Client.
 *
 * There is no resolved-question flag. A newer recorded response is the evidence
 * available; phone calls and external email replies cannot clear this guard.
 * Read failures never mean that the customer has been silent.
 */
export async function loadQuoteFollowupConversation(
  client: SupabaseClient,
  input: { accountId: string; jobId: string; phone: string | null; sharedAt: string; now: Date },
): Promise<QuoteFollowupConversation> {
  try {
    const nowIso = input.now.toISOString();
    const feed = () => client
      .from('job_feed')
      .select('created_at')
      .eq('account_id', input.accountId)
      .eq('job_id', input.jobId)
      .eq('visibility', 'client')
      .gte('created_at', input.sharedAt)
      .lte('created_at', nowIso);
    const newest = (query: ReturnType<typeof feed>) => query
      .order('created_at', { ascending: false })
      .limit(1);
    const empty = { data: [] as ActivityRow[], error: null };
    const [smsInbound, smsReply, portalQuestion, portalNote, portalReply] = await Promise.all([
      input.phone ? client
        .from('sms_messages')
        .select('created_at')
        .eq('account_id', input.accountId)
        .eq('phone_number', input.phone)
        .eq('inbox_visible', true)
        .eq('direction', 'inbound')
        .gte('created_at', input.sharedAt)
        .lte('created_at', nowIso)
        .order('created_at', { ascending: false })
        .limit(1) : Promise.resolve(empty),
      input.phone ? client
        .from('sms_events')
        .select('sent_at')
        .eq('account_id', input.accountId)
        .eq('phone_number', input.phone)
        .eq('message_kind', 'inbox-reply')
        .in('status', ['sent', 'delivered'])
        .gte('sent_at', input.sharedAt)
        .lte('sent_at', nowIso)
        .order('sent_at', { ascending: false })
        .limit(1) : Promise.resolve(empty),
      newest(feed().in('kind', ['client_question', 'selection_question', 'client_followup', 'rebook_requested'])),
      newest(feed().eq('kind', 'note').eq('author', 'Client')),
      newest(feed().eq('kind', 'job_update').eq('author', 'Owner')),
    ]);
    const results = [smsInbound, smsReply, portalQuestion, portalNote, portalReply];
    if (results.some((result) => result.error)) return { kind: 'unavailable' };

    const timestamp = (row: ActivityRow | undefined): number => {
      if (!row) return 0;
      const value = Date.parse(row.sent_at ?? row.created_at ?? '');
      if (!Number.isFinite(value)) throw new Error('Invalid conversation activity timestamp');
      return value;
    };
    const latestInbound = Math.max(
      timestamp(smsInbound.data?.[0]),
      timestamp(portalQuestion.data?.[0]),
      timestamp(portalNote.data?.[0]),
    );
    const latestReply = timestamp(smsReply.data?.[0]);
    const latest = Math.max(latestInbound, latestReply, timestamp(portalReply.data?.[0]));
    const recent = latest > 0 && input.now.getTime() - latest < QUOTE_FOLLOWUP_CONVERSATION_PAUSE_MS;
    return {
      kind: 'ready',
      // Ties are kept paused; equal timestamps do not establish a later answer.
      pauseReason: latestInbound > 0 && latestInbound >= latestReply
        ? 'unanswered_customer'
        : recent ? 'recent_conversation' : null,
      lastActivityAt: latest > 0 ? new Date(latest).toISOString() : null,
    };
  } catch {
    return { kind: 'unavailable' };
  }
}
