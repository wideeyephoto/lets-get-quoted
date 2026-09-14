import type { SupabaseClient } from '@supabase/supabase-js';
import { triageSupportCase } from './support-copilot';
import { recordOperatorAudit } from './audit';
import type { SupportCaseTriageResult } from './types';
import { preparePlatformTransactionalEmail } from '../platform-transactional-email';

// A hung upstream otherwise holds the whole serverless invocation open.
const OUTBOUND_TIMEOUT_MS = 10_000;

export interface InboundSupportTicket {
  id: string;
  account_id?: string | null;
  customer_email?: string | null;
  customer_name?: string | null;
  subject: string;
  body?: string;
  status?: string;
  created_at?: string;
}

export interface AutoResponseResult {
  ticketId: string;
  autoResolved: boolean;
  confidenceScore: number;
  topic: SupportCaseTriageResult['identifiedTopic'];
  urgency: SupportCaseTriageResult['urgency'];
  replyDispatched: boolean;
  replyProviderId: string | null;
  eligibleForAutoReply: boolean;
  replyText: string;
  reason: string;
}

/**
 * High-confidence safe topics eligible for automated instant customer deflection
 */
const SAFE_AUTO_REPLY_TOPICS = new Set([
  'stripe_connect_onboarding',
  'stripe_payouts',
  'sms_phone',
  'quote_creation',
  'features',
  'website_domain',
]);

/**
 * Computes confidence score (0-100) based on keyword clarity, topic specificity, and absence of dispute signals
 */
function calculateTriageConfidence(ticket: InboundSupportTicket, triage: SupportCaseTriageResult): number {
  const text = `${ticket.subject} ${ticket.body || ''}`.toLowerCase();

  // Red flags that immediately lower confidence and force human review
  if (
    text.includes('lawyer') ||
    text.includes('attorney') ||
    text.includes('sue') ||
    text.includes('fraud') ||
    text.includes('scam') ||
    text.includes('unauthorized') ||
    text.includes('stolen') ||
    text.includes('dispute') ||
    text.includes('chargeback')
  ) {
    return 30;
  }

  let baseScore = 60;

  if (SAFE_AUTO_REPLY_TOPICS.has(triage.identifiedTopic)) {
    baseScore += 25;
  }

  // Bonus for clear subject length and matching body keywords
  if (ticket.subject.trim().length > 8 && (ticket.body?.trim().length ?? 0) > 15) {
    baseScore += 10;
  }

  if (triage.onboardingDiagnosis) {
    baseScore += 5;
  }

  return Math.min(100, Math.max(0, baseScore));
}

/**
 * Processes an inbound support ticket autonomously:
 * If confidence >= 85% on safe informational topics -> dispatches auto-reply and resolves ticket.
 * If confidence < 85% or sensitive -> drafts suggested response for staff approval.
 */
export async function processInboundSupportTicket(
  supabase: SupabaseClient,
  ticket: InboundSupportTicket,
  opts: { dryRun?: boolean; senderEmail?: string } = {},
): Promise<AutoResponseResult> {
  const triage = await triageSupportCase(supabase, {
    id: ticket.id,
    subject: ticket.subject,
    body: ticket.body,
    account_id: ticket.account_id,
  });

  const confidence = calculateTriageConfidence(ticket, triage);
  const isEligibleForAutoReply =
    confidence >= 85 &&
    SAFE_AUTO_REPLY_TOPICS.has(triage.identifiedTopic) &&
    !triage.requiresFounderReview &&
    triage.urgency !== 'urgent';

  let replyDispatched = false;
  let replyProviderId: string | null = null;
  let autoResolved = false;

  if (isEligibleForAutoReply && !opts.dryRun) {
    // 1. Dispatch email if customer email exists
    if (ticket.customer_email) {
      try {
        const apiKey = process.env.RESEND_API_KEY;
        if (apiKey) {
          const message = await preparePlatformTransactionalEmail(supabase, {
            from: opts.senderEmail || 'Let\'s Get Quoted Support <support@letsgetquoted.com>',
            to: [ticket.customer_email],
            subject: `Re: ${ticket.subject}`,
            text: triage.suggestedCustomerReply,
            tags: [{ name: 'kind', value: 'support_auto_reply' }],
          });
          const response = await fetch('https://api.resend.com/emails', {
            signal: AbortSignal.timeout(OUTBOUND_TIMEOUT_MS),
            redirect: 'error',
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify(message),
          });
          if (!response.ok) throw new Error('Provider rejected support reply.');
          const acceptance: unknown = await response.json();
          if (!acceptance || typeof acceptance !== 'object' || !('id' in acceptance)
            || typeof acceptance.id !== 'string' || !acceptance.id.trim()) {
            throw new Error('Provider acceptance was not confirmed.');
          }
          replyDispatched = true;
          replyProviderId = acceptance.id;
        }
      } catch (err) {
        console.error('[support-auto-responder] Resend email dispatch failed:', err);
      }
    }

    // Acceptance and persisted resolution are separate outcomes.
    if (replyDispatched) {
      try {
        const resolution = await supabase
          .from('support_cases')
          .update({
            status: 'resolved',
            resolution_notes: `[AI Autopilot] Reply accepted by provider (${replyProviderId}) with ${confidence}% confidence for topic: ${triage.identifiedTopic}`,
            resolved_at: new Date().toISOString(),
          })
          .eq('id', ticket.id).select('id').maybeSingle();
        autoResolved = !resolution.error && resolution.data?.id === ticket.id;
      } catch (err) {
        console.error('[support-auto-responder] Accepted reply needs ticket resolution review:', err);
      }

      // 3. Record audit trail
      recordOperatorAudit({
        category: 'customer_support',
        actionName: 'support.ticket_auto_deflected',
        severity: 'safe_auto',
        toolName: 'processInboundSupportTicket',
        accountId: ticket.account_id || undefined,
        inputPayload: { ticketId: ticket.id, subject: ticket.subject },
        outputResult: {
          confidence,
          topic: triage.identifiedTopic,
          replyDispatched,
          replyProviderId,
          autoResolved,
        },
        reasoningSummary: autoResolved ? `Auto-resolved ticket ${ticket.id} after provider acceptance.`
          : `Reply accepted for ticket ${ticket.id}; resolution requires review. Do not resend solely to repair status.`,
        status: autoResolved ? 'success' : 'failure',
      });
    }
  }
  if (!opts.dryRun && !replyDispatched) {
    // Update case with drafted suggestions for staff review
    await supabase
      .from('support_cases')
      .update({
        suggested_reply: triage.suggestedCustomerReply,
        triage_topic: triage.identifiedTopic,
        urgency: triage.urgency,
        ai_confidence: confidence,
      })
      .eq('id', ticket.id);
  }

  return {
    ticketId: ticket.id,
    autoResolved,
    eligibleForAutoReply: isEligibleForAutoReply,
    confidenceScore: confidence,
    topic: triage.identifiedTopic,
    urgency: triage.urgency,
    replyDispatched,
    replyProviderId,
    replyText: triage.suggestedCustomerReply,
    reason: opts.dryRun ? `Preview only; eligible for auto-reply: ${isEligibleForAutoReply}`
      : autoResolved ? `Resolved after provider acceptance (${confidence}% confidence).`
      : replyDispatched ? 'Reply accepted; ticket resolution requires review. Do not resend to repair status.'
      : `Requires human review; no confirmed reply (confidence: ${confidence}%, urgency: ${triage.urgency})`,
  };
}
