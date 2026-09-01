import type { SupabaseClient } from '@supabase/supabase-js';
import { triageSupportCase } from './support-copilot';
import { recordOperatorAudit } from './audit';
import type { SupportCaseTriageResult } from './types';

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

  if (isEligibleForAutoReply && !opts.dryRun) {
    // 1. Dispatch email if customer email exists
    if (ticket.customer_email) {
      try {
        const apiKey = process.env.RESEND_API_KEY;
        if (apiKey) {
          await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              from: opts.senderEmail || 'Let\'s Get Quoted Support <support@letsgetquoted.com>',
              to: [ticket.customer_email],
              subject: `Re: ${ticket.subject}`,
              text: triage.suggestedCustomerReply,
            }),
          });
          replyDispatched = true;
        }
      } catch (err) {
        console.error('[support-auto-responder] Resend email dispatch failed:', err);
      }
    }

    // 2. Update support ticket status in database
    await supabase
      .from('support_cases')
      .update({
        status: 'resolved',
        resolution_notes: `[AI Autopilot] Instant deflection auto-reply sent with ${confidence}% confidence for topic: ${triage.identifiedTopic}`,
        resolved_at: new Date().toISOString(),
      })
      .eq('id', ticket.id);

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
      },
      reasoningSummary: `Auto-resolved ticket ${ticket.id} (${triage.identifiedTopic}) with ${confidence}% confidence score.`,
      status: 'success',
    });
  } else if (!opts.dryRun) {
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
    autoResolved: isEligibleForAutoReply,
    confidenceScore: confidence,
    topic: triage.identifiedTopic,
    urgency: triage.urgency,
    replyDispatched,
    replyText: triage.suggestedCustomerReply,
    reason: isEligibleForAutoReply
      ? `High confidence (${confidence}%) match on safe topic: ${triage.identifiedTopic}`
      : `Queued for human review (confidence: ${confidence}%, urgency: ${triage.urgency})`,
  };
}
