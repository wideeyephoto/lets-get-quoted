export interface ParsedVoiceAdminAction {
  rawVoiceTranscript: string;
  detectedIntent: 'replay_webhooks' | 'pause_payout' | 'issue_credit' | 'run_cycle' | 'query_mrr' | 'general_question';
  targetEntity?: string;
  amountDollars?: number;
  requiresHitlConfirmation: boolean;
  proposedActionTitle: string;
  proposedActionDescription: string;
}

/**
 * Translates spoken founder voice instructions into validated structured admin operations
 */
export function parseVoiceAdminCommand(transcript: string): ParsedVoiceAdminAction {
  const lower = transcript.toLowerCase();

  if (lower.includes('replay') && lower.includes('webhook')) {
    return {
      rawVoiceTranscript: transcript,
      detectedIntent: 'replay_webhooks',
      requiresHitlConfirmation: false,
      proposedActionTitle: 'Replay Failed Webhooks',
      proposedActionDescription: 'Execute immediate idempotent resolution on all unresolved webhook failures.',
    };
  }

  if (lower.includes('credit') || lower.includes('refund')) {
    const amtMatch = transcript.match(/\$?\b([0-9]+)\b/);
    const amount = amtMatch ? parseInt(amtMatch[1], 10) : 25;

    return {
      rawVoiceTranscript: transcript,
      detectedIntent: 'issue_credit',
      amountDollars: amount,
      requiresHitlConfirmation: true,
      proposedActionTitle: `Issue $${amount} Courtesy Credit`,
      proposedActionDescription: `Authorize and issue a $${amount} wallet credit per voice instruction.`,
    };
  }

  if (lower.includes('pause') && lower.includes('payout')) {
    return {
      rawVoiceTranscript: transcript,
      detectedIntent: 'pause_payout',
      requiresHitlConfirmation: true,
      proposedActionTitle: 'Pause Contractor Stripe Payouts',
      proposedActionDescription: 'Temporarily freeze automated deposit schedule for compliance review.',
    };
  }

  if (lower.includes('run ops') || lower.includes('cycle') || lower.includes('sweep')) {
    return {
      rawVoiceTranscript: transcript,
      detectedIntent: 'run_cycle',
      requiresHitlConfirmation: false,
      proposedActionTitle: 'Trigger Autonomous Cycle',
      proposedActionDescription: 'Run 360 autonomous SRE sweep and update morning briefing.',
    };
  }

  return {
    rawVoiceTranscript: transcript,
    detectedIntent: 'general_question',
    requiresHitlConfirmation: false,
    proposedActionTitle: 'Founder Operational Query',
    proposedActionDescription: transcript,
  };
}
