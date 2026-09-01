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
    const [{ data: conversations }, { data: feedback }] = await Promise.all([
      admin
        .from('google_lsa_conversations')
        .select('google_conversation_id, channel, participant, event_at, message_text, call_duration_seconds, recording_url')
        .eq('account_id', accountId)
        .eq('customer_id', String(row.customer_id))
        .eq('google_lead_id', googleLeadId)
        .order('event_at', { ascending: true }),
      admin
        .from('google_lsa_feedback')
        .select('answer, reason, comment, credit_issuance_decision, submitted_at')
        .eq('account_id', accountId)
        .eq('google_lead_id', googleLeadId)
        .maybeSingle(),
    ]);

    const asText = (value: unknown) => (typeof value === 'string' && value ? value : null);
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
      note: asText(row.note),
      googleCreatedAt: asText(row.google_created_at),
      conversations: (conversations ?? []).map((conversation) => {
        const item = conversation as Record<string, unknown>;
        const duration = Number(item.call_duration_seconds);
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
      feedback: feedback ? {
        answer: asText((feedback as Record<string, unknown>).answer),
        reason: asText((feedback as Record<string, unknown>).reason),
        comment: asText((feedback as Record<string, unknown>).comment),
        creditIssuanceDecision: asText((feedback as Record<string, unknown>).credit_issuance_decision),
        submittedAt: String((feedback as Record<string, unknown>).submitted_at),
      } : null,
    };
  } catch {
    return null;
  }
}
