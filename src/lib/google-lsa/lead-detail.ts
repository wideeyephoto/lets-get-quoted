import 'server-only';

import { createAdminClient } from '@/lib/auth';

export type GoogleLsaLeadDetail = {
  googleLeadId: string;
  resourceName: string;
  customerId: string;
  leadType: string | null;
  leadStatus: string | null;
  serviceId: string | null;
  leadCharged: boolean;
  creditState: string | null;
  feedbackSubmitted: boolean;
  canSubmitFeedback: boolean;
  feedbackStatus: 'pending' | 'succeeded' | 'failed' | null;
  feedbackError: string | null;
  note: string | null;
  googleCreatedAt: string | null;
  conversations: Array<{
    id: string;
    channel: string;
    participant: string | null;
    eventAt: string | null;
    messageText: string | null;
    callDurationSeconds: number | null;
    hasRecording: boolean;
  }>;
  feedback: {
    answer: string | null;
    reason: string | null;
    comment: string | null;
    creditIssuanceDecision: string | null;
    submittedAt: string;
  } | null;
};

export async function loadGoogleLsaLeadDetail(
  accountId: string,
  crmLeadId: string,
): Promise<GoogleLsaLeadDetail | null> {
  try {
    const admin = createAdminClient();
    const { data: lead, error } = await admin
      .from('google_lsa_leads')
      .select('customer_id, google_lead_id, resource_name, lead_type, lead_status, service_id, lead_charged, credit_state, feedback_submitted, note, google_created_at')
      .eq('account_id', accountId)
      .eq('crm_lead_id', crmLeadId)
      .maybeSingle();
    if (error || !lead) return null;
    const row = lead as Record<string, unknown>;
    const googleLeadId = String(row.google_lead_id);
    const [{ data: conversations }, { data: feedback }, { data: connection }] = await Promise.all([
      admin
        .from('google_lsa_conversations')
        .select('google_conversation_id, channel, participant, event_at, message_text, call_duration_seconds, recording_url')
        .eq('account_id', accountId)
        .eq('customer_id', String(row.customer_id))
        .eq('google_lead_id', googleLeadId)
        .order('event_at', { ascending: true }),
      admin
        .from('google_lsa_feedback')
        .select('answer, reason, comment, credit_issuance_decision, submission_status, last_error, submitted_at')
        .eq('account_id', accountId)
        .eq('customer_id', String(row.customer_id))
        .eq('google_lead_id', googleLeadId)
        .maybeSingle(),
      admin
        .from('google_lsa_connections')
        .select('customer_id, disconnected_at')
        .eq('account_id', accountId)
        .maybeSingle(),
    ]);

    const asText = (value: unknown) => (typeof value === 'string' && value ? value : null);
    const feedbackRow = feedback as Record<string, unknown> | null;
    const rawFeedbackStatus = asText(feedbackRow?.submission_status);
    const feedbackStatus = rawFeedbackStatus === 'pending' || rawFeedbackStatus === 'succeeded' || rawFeedbackStatus === 'failed'
      ? rawFeedbackStatus
      : null;
    return {
      googleLeadId,
      resourceName: String(row.resource_name),
      customerId: String(row.customer_id),
      leadType: asText(row.lead_type),
      leadStatus: asText(row.lead_status),
      serviceId: asText(row.service_id),
      leadCharged: row.lead_charged === true,
      creditState: asText(row.credit_state),
      feedbackSubmitted: row.feedback_submitted === true,
      canSubmitFeedback: Boolean(
        connection
        && !(connection as Record<string, unknown>).disconnected_at
        && String((connection as Record<string, unknown>).customer_id) === String(row.customer_id)
        && row.feedback_submitted !== true
        && feedbackStatus !== 'pending'
      ),
      feedbackStatus,
      feedbackError: asText(feedbackRow?.last_error),
      note: asText(row.note),
      googleCreatedAt: asText(row.google_created_at),
      conversations: (conversations ?? []).map((conversation) => {
        const item = conversation as Record<string, unknown>;
        const duration = item.call_duration_seconds == null ? NaN : Number(item.call_duration_seconds);
        return {
          id: String(item.google_conversation_id),
          channel: asText(item.channel) || 'UNKNOWN',
          participant: asText(item.participant),
          eventAt: asText(item.event_at),
          messageText: asText(item.message_text),
          callDurationSeconds: Number.isFinite(duration) ? duration : null,
          // Recording URLs need Google authorization and must never be handed
          // to the browser as though they were public download links.
          hasRecording: Boolean(asText(item.recording_url)),
        };
      }),
      feedback: feedbackRow && feedbackStatus === 'succeeded' ? {
        answer: asText(feedbackRow.answer),
        reason: asText(feedbackRow.reason),
        comment: asText(feedbackRow.comment),
        creditIssuanceDecision: asText(feedbackRow.credit_issuance_decision),
        submittedAt: String(feedbackRow.submitted_at),
      } : null,
    };
  } catch {
    return null;
  }
}
